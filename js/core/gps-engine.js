/* TITAN — V1.7.7 GPS recording engine: what a recorded outing says about time, distance, stops and climb.
   Pure arithmetic shared by the website and the Android app (same file, copied unchanged): no clock, no storage, no network.

   TIME. An outing is cut into pieces that never overlap, and their sum is exactly the time between start and finish:
     elapsed = moving + stopped + paused (manual) + interrupted (recording lost) + missing (no usable position).
   - moving      : between two usable positions, the athlete was moving.
   - stopped     : a detected stop — less than `stopSpeedMs` of net displacement inside `stopRadiusM` for at least `stopDelayS`.
                   The stop is counted from its first position (not from the moment it is confirmed), so the delay costs nothing.
                   A shorter halt stays « moving » on purpose: that delay is the hysteresis that avoids false stops.
   - paused      : the athlete pressed Pause. Nothing is recorded, nothing is counted as effort.
   - interrupted : the system stopped the recording (app killed, battery). From the last position to the resume.
   - missing     : the recording was running but no usable position arrived for more than `gapS` while the athlete moved elsewhere
                   (tunnel, lost signal). The straight line between both ends is NOT added to the distance: it is reported apart,
                   as a lower bound, and the time is never counted as effort.
   Thresholds depend on the family of the sport (a hiker at 2 km/h and a mountain biker climbing at 3 km/h are moving).
   Raw positions are never rewritten here: this module only reads them. */
(function (root) {
  "use strict";
  const RULES_VERSION = "gps-engine-v1";
  const R = 6371008.8;
  const rad = (d) => (d * Math.PI) / 180;
  function haversine(a, b) {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /* Families of GPS sports. stopDelayS × stopSpeedMs is the net displacement under which a halt becomes a stop:
     walk 25 s × 0.28 m/s (1 km/h), run 10 s × 0.4, bike 10 s × 0.5, mtb 20 s × 0.35 (a steep climb at 2.5 km/h is 0.7 m/s). */
  const FAMILIES = {
    walk: { label: "Marche et randonnée", stopDelayS: 25, stopSpeedMs: 0.28, stopRadiusM: 5, maxSpeedMs: 12, minSpeedMs: 0.2, offRouteM: 30 },
    run: { label: "Course à pied", stopDelayS: 10, stopSpeedMs: 0.4, stopRadiusM: 6, maxSpeedMs: 12, minSpeedMs: 0.4, offRouteM: 30 },
    bike: { label: "Vélo route et gravel", stopDelayS: 10, stopSpeedMs: 0.5, stopRadiusM: 8, maxSpeedMs: 28, minSpeedMs: 0.5, offRouteM: 40 },
    mtb: { label: "VTT", stopDelayS: 20, stopSpeedMs: 0.35, stopRadiusM: 6, maxSpeedMs: 25, minSpeedMs: 0.4, offRouteM: 35 },
    roll: { label: "Roller et ski-roues", stopDelayS: 10, stopSpeedMs: 0.5, stopRadiusM: 7, maxSpeedMs: 20, minSpeedMs: 0.5, offRouteM: 35 },
    snow: { label: "Ski nordique et de randonnée", stopDelayS: 25, stopSpeedMs: 0.28, stopRadiusM: 5, maxSpeedMs: 28, minSpeedMs: 0.2, offRouteM: 40 },
    water: { label: "Pagaie et aviron", stopDelayS: 20, stopSpeedMs: 0.3, stopRadiusM: 10, maxSpeedMs: 12, minSpeedMs: 0.3, offRouteM: 60 },
  };
  const SPORT_FAMILY = {
    walking: "walk", nordic_walk: "walk", hiking: "walk", trekking: "walk", rucking: "walk", snowshoeing: "walk",
    running: "run", trail: "run", fell_running: "run", orienteering: "run", race_walking: "run",
    cycling: "bike", cycling_road: "bike", gravel: "bike", cyclocross: "bike", velotaf: "bike", handbike: "bike", para_cycling: "bike",
    mountain_bike: "mtb",
    roller: "roll", inline_speed_skating: "roll", roller_ski: "roll",
    cross_country_skiing: "snow", ski_touring: "snow", ski_mountaineering: "snow",
    kayak: "water", paddle: "water", rowing: "water", coastal_rowing: "water", canoe_sprint: "water", outrigger_canoe: "water", surfski: "water",
  };
  /** Sports for which a live GPS recording makes sense (outdoors, distance based). Any other sport never asks for the position. */
  const GPS_SPORTS = Object.keys(SPORT_FAMILY);
  const isGpsSport = (sport) => Object.prototype.hasOwnProperty.call(SPORT_FAMILY, String(sport));
  const familyOf = (sport) => SPORT_FAMILY[String(sport)] || "run";
  const paramsOf = (sport) => ({ family: familyOf(sport), gapS: GAP_S, maxAccuracyM: MAX_ACCURACY_M, ...FAMILIES[familyOf(sport)] });

  const MAX_ACCURACY_M = 30; // a position less precise than this is not used
  const GAP_S = 30; // no usable position for longer than this while recording: a hole, not movement
  const DWELL_M = 3; // positions closer than this to the point of arrival are one halt: only the latest is kept
  const MAX_POINTS = 12000; // one stored recording stays under what the phone's key-value store reads back (see mobile/gpsTrack.ts)
  const THIN_FROM_MS = 2000, THIN_MAX_MS = 16000;
  const ALT_ACC_MAX = 15;

  const validFix = (f) => !!f && Number.isFinite(f.lat) && Number.isFinite(f.lon) && Math.abs(f.lat) <= 90 && Math.abs(f.lon) <= 180 && Number.isFinite(f.t) && !(f.lat === 0 && f.lon === 0);
  const countFixes = (segs) => segs.reduce((n, s) => n + s.length, 0);
  const thin = (segs) => segs.map((s) => (s.length <= 2 ? s : s.filter((_, i) => i === 0 || i === s.length - 1 || i % 2 === 0)));

  /** Why a position was not kept. `rejected` stays the total, for the screens that already show it. */
  function refuse(track, reason, extra) {
    const why = { accuracy: 0, speed: 0, order: 0, invalid: 0, full: 0, ...(track.why || {}) };
    why[reason] += 1;
    return { ...track, ...(extra || {}), rejected: (track.rejected || 0) + 1, why };
  }

  /** Adds one position to the open stretch (a new one when `opts.newSegment`), or counts it as refused. Pure: returns a new track.
      - less precise than 30 m, an impossible speed for the sport, a timestamp that does not advance: refused, with the reason;
      - three positions in a row that are « too fast » from the last kept one but consistent with each other mean the last kept one was
        wrong or the signal jumped: the trace goes on from them in a NEW stretch — the hole is never bridged by a line;
      - positions within 3 m of the point of arrival are one halt: the arrival and the latest are kept, so a 20-minute stop is two points
        that say how long it lasted, not six hundred that draw a scribble. */
  function ingest(track, fix, opts) {
    const o = opts || {};
    const max = (FAMILIES[o.family] || FAMILIES[familyOf(o.sport)] || FAMILIES.bike).maxSpeedMs;
    const limit = o.maxPoints || MAX_POINTS;
    if (!validFix(fix)) return refuse(track, "invalid");
    if (fix.acc !== null && fix.acc !== undefined && fix.acc > MAX_ACCURACY_M) return refuse(track, "accuracy");
    const open = track.segs[track.segs.length - 1];
    let newSegment = !!o.newSegment || !open;
    let segs = track.segs;
    let lead = null;
    if (!newSegment) {
      const prev = open[open.length - 1];
      const dt = (fix.t - prev.t) / 1000;
      if (dt <= 0) return refuse(track, "order");
      if (haversine(prev, fix) / dt > max) {
        const cand = (track.cand || []).slice(-2);
        const last = cand[cand.length - 1];
        const consistent = !last || (fix.t > last.t && haversine(last, fix) / ((fix.t - last.t) / 1000) <= max);
        const next = consistent ? [...cand, fix] : [fix];
        if (next.length < 3) return refuse(track, "speed", { cand: next });
        // The candidates agree with each other: the trace resumes with them. A stretch of one lone point was the glitch itself.
        segs = open.length === 1 ? track.segs.slice(0, -1) : track.segs;
        lead = next.slice(0, -1);
        newSegment = true;
      } else if (track.every && fix.t - prev.t < track.every * 0.75) {
        return track.cand ? { ...track, cand: undefined } : track; // a thinned trace keeps its spacing; not a glitch
      }
    }
    let every = track.every;
    if (countFixes(segs) + (lead ? lead.length : 0) >= limit) {
      const thinned = thin(segs);
      if (countFixes(thinned) + (lead ? lead.length : 0) >= limit) return refuse(track, "full");
      segs = thinned;
      every = Math.min(THIN_MAX_MS, (track.every || THIN_FROM_MS) * 2);
    }
    const out = segs.map((s) => s);
    if (newSegment) out.push(lead ? [...lead, fix] : [fix]);
    else {
      const seg = out[out.length - 1];
      const prev = seg[seg.length - 1], anchor = seg[seg.length - 2];
      const dwell = anchor && haversine(anchor, prev) < DWELL_M && haversine(anchor, fix) < DWELL_M;
      out[out.length - 1] = dwell ? [...seg.slice(0, -1), fix] : [...seg, fix];
    }
    const next = { ...track, segs: out, rejected: track.rejected || 0 };
    delete next.cand;
    if (every) next.every = every; else delete next.every;
    return next;
  }

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const stopRadius = (p, a, b) => clamp(0.6 * Math.max(a.acc || 0, b.acc || 0), p.stopRadiusM, p.stopRadiusM * 2.5);
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

  /** Climb and descent from the phone's own altitude, or null when it is not reliable enough: fewer than 80 % of the positions carry an
      altitude with a vertical accuracy of 15 m or better. 5-point median, then a 3 m hysteresis; a detected stop adds nothing. */
  function altitude(segs, stoppedAt) {
    const all = segs.flat();
    const usable = (f) => f.alt !== null && f.alt !== undefined && Number.isFinite(f.alt) && (f.altAcc === null || f.altAcc === undefined || f.altAcc <= ALT_ACC_MAX);
    const good = all.filter(usable).length;
    const coverage = all.length ? good / all.length : 0;
    const base = { source: "gnss", method: "median5+hysteresis3m", coverage: Math.round(coverage * 100) / 100 };
    if (all.length < 10 || coverage < 0.8) return { ...base, reliable: false, gain: null, loss: null, min: null, max: null };
    let gain = 0, loss = 0, min = Infinity, max = -Infinity;
    for (const s of segs) {
      const alts = s.map((f) => (usable(f) ? f.alt : null));
      const sm = alts.map((_, i) => {
        const w = alts.slice(Math.max(0, i - 2), i + 3).filter((x) => x !== null);
        return w.length ? median(w) : null;
      });
      let ref = null;
      for (let i = 0; i < sm.length; i++) {
        const a = sm[i];
        if (a === null) continue;
        min = Math.min(min, a); max = Math.max(max, a);
        if (stoppedAt && stoppedAt.has(s[i])) continue;
        if (ref === null) ref = a;
        else if (a - ref >= 3) { gain += a - ref; ref = a; }
        else if (ref - a >= 3) { loss += ref - a; ref = a; }
      }
    }
    return { ...base, reliable: true, gain: Math.round(gain), loss: Math.round(loss), min: Math.round(min), max: Math.round(max) };
  }

  /** Reads a recording and returns its figures. `rec`: { sport, startedAt, endedAt, segs, stretches?, rejected?, why? }.
      `stretches` are the periods the recording was actually running ([{ s, e, why: "pause" | "interrupted" | "finish" }], `e` null while it
      runs); without them (an imported or re-read trace) every stretch of positions is its own period and the time between two stretches
      is a pause of unknown kind. `opts.now` closes a running recording; `opts.autoPause === false` keeps detected stops in the effort. */
  function analyse(rec, opts) {
    const o = opts || {};
    const p = paramsOf(rec.sport);
    const segs = (rec.segs || []).filter((s) => s && s.length);
    const flat = segs.flat();
    const firstT = flat.length ? flat[0].t : null, lastT = flat.length ? flat[flat.length - 1].t : null;
    const start = Number.isFinite(rec.startedAt) ? rec.startedAt : firstT;
    let end = Number.isFinite(rec.endedAt) ? rec.endedAt : Number.isFinite(o.now) ? o.now : lastT;
    const ms = { elapsed: 0, moving: 0, stopped: 0, paused: 0, interrupted: 0, missing: 0 };
    const timeline = [], stops = [], gaps = [], splits = [];
    const stoppedAt = new Set();
    let distance = 0, gapDistance = 0, splitM = 0, splitMs = 0;
    const empty = start === null || end === null;
    if (!empty && end < start) end = start;

    const mark = (from, to, kind) => {
      const d = Math.max(0, to - from);
      if (!d) return;
      ms[kind] += d;
      const last = timeline[timeline.length - 1];
      if (last && last.kind === kind && last.to === from) last.to = to;
      else timeline.push({ from, to, kind });
    };
    const move = (from, to, d) => {
      mark(from, to, "moving");
      distance += d;
      // kilometre splits on measured movement only (a stop or a hole never enters a split)
      let left = d, time = to - from;
      if (left <= 0) { splitMs += time; return; }
      while (left > 1e-6) {
        const take = Math.min(1000 - splitM, left), dt = (time * take) / left;
        splitM += take; splitMs += dt; left -= take; time -= dt;
        if (splitM >= 999.999999) { splits.push({ index: splits.length + 1, distanceM: 1000, movingS: Math.round(splitMs / 100) / 10 }); splitM = 0; splitMs = 0; }
      }
    };

    if (!empty) {
      const given = Array.isArray(rec.stretches) && rec.stretches.length
        ? rec.stretches.map((x) => ({ s: x.s, e: x.e === null || x.e === undefined ? end : x.e, why: x.why || "pause" }))
        : segs.map((s) => ({ s: s[0].t, e: s[s.length - 1].t, why: "pause" }));
      const stretches = given.filter((x) => Number.isFinite(x.s) && Number.isFinite(x.e))
        .map((x) => ({ s: clamp(x.s, start, end), e: clamp(x.e, start, end), why: x.why })).sort((a, b) => a.s - b.s);
      let cursor = start, previousWhy = "pause";
      for (const st of stretches) {
        const s = Math.max(st.s, cursor), e = Math.max(st.e, s);
        mark(cursor, s, previousWhy === "interrupted" ? "interrupted" : "paused");
        // positions of this period, in time order, each remembering the stretch it belongs to
        const pts = [];
        segs.forEach((seg, si) => { for (const f of seg) if (f.t >= s && f.t <= e) pts.push({ f, si }); });
        if (!pts.length) {
          // recording but not one usable position: nothing is known about this period
          mark(s, e, e - s > p.gapS * 1000 ? "missing" : "stopped");
        } else {
          const lead = pts[0].f.t - s;
          mark(s, pts[0].f.t, lead > p.gapS * 1000 ? "missing" : "stopped");
          let i = 0;
          while (i < pts.length - 1) {
            const a = pts[i].f;
            // grow a halt from this position: every later position stays within the radius (wider once the delay is reached)
            let j = i, far = 0;
            // an interval that is plainly movement cannot open a stop: the stop starts where the athlete actually halted
            const n1 = pts[i + 1].f, dt1 = (n1.t - a.t) / 1000;
            const entering = dt1 > 0 && dt1 <= p.gapS && haversine(a, n1) / dt1 >= Math.max(1, p.minSpeedMs * 2);
            while (!entering && j + 1 < pts.length) {
              const b = pts[j + 1].f, d = haversine(a, b), r = stopRadius(p, a, b);
              if (d > ((b.t - a.t) / 1000 >= p.stopDelayS ? r * 1.5 : r)) break;
              far = Math.max(far, d); j++;
            }
            // the stop ends at the last position still inside the plain radius: the wider one only forgives drift in the middle
            const leaving = (k) => { const u = pts[k - 1].f, w = pts[k].f, dt = (w.t - u.t) / 1000; return dt > 0 && dt <= p.gapS && haversine(u, w) / dt >= Math.max(1, p.minSpeedMs * 2); };
            while (j > i && (haversine(a, pts[j].f) > stopRadius(p, a, pts[j].f) || leaving(j))) j--;
            const held = (pts[j].f.t - a.t) / 1000;
            if (j > i && held >= p.stopDelayS && far / held < p.stopSpeedMs) {
              mark(a.t, pts[j].f.t, "stopped");
              stops.push({ at: a.t, seconds: Math.round(held), distanceM: Math.round(distance) });
              for (let k = i; k <= j; k++) stoppedAt.add(pts[k].f);
              i = j;
              continue;
            }
            const b = pts[i + 1].f, dt = (b.t - a.t) / 1000, d = haversine(a, b);
            if (dt > p.gapS) {
              mark(a.t, b.t, "missing");
              gapDistance += d;
              gaps.push({ at: a.t, seconds: Math.round(dt), straightM: Math.round(d), distanceM: Math.round(distance) });
            } else if (pts[i].si !== pts[i + 1].si) {
              // the trace was cut here (a jump of the signal): the time is short and known, the path is not
              move(a.t, b.t, 0);
              gapDistance += d;
            } else move(a.t, b.t, d / dt >= p.minSpeedMs ? d : 0);
            i++;
          }
          const tail = e - pts[pts.length - 1].f.t;
          mark(pts[pts.length - 1].f.t, e, tail > p.gapS * 1000 ? "missing" : "stopped");
        }
        cursor = e;
        previousWhy = st.why;
      }
      mark(cursor, end, previousWhy === "interrupted" ? "interrupted" : previousWhy === "finish" ? "stopped" : "paused");
      ms.elapsed = end - start;
    }
    if (splitM > 10) splits.push({ index: splits.length + 1, distanceM: Math.round(splitM), movingS: Math.round(splitMs / 100) / 10 });

    const sec = (x) => Math.round(x / 1000);
    const alt = altitude(segs, stoppedAt);
    const autoPause = o.autoPause !== false;
    const effortMs = ms.moving + (autoPause ? 0 : ms.stopped);
    const kmh = (m, t) => (t >= 30000 && m >= 50 ? Math.round((m / (t / 1000)) * 3.6 * 10) / 10 : null);
    const accs = flat.map((f) => f.acc).filter((x) => Number.isFinite(x));
    return {
      rules: RULES_VERSION, family: p.family, autoPause,
      params: { stopDelayS: p.stopDelayS, stopSpeedMs: p.stopSpeedMs, stopRadiusM: p.stopRadiusM, gapS: p.gapS, maxAccuracyM: p.maxAccuracyM, maxSpeedMs: p.maxSpeedMs },
      ms,
      elapsedS: sec(ms.elapsed), movingS: sec(ms.moving), stoppedS: sec(ms.stopped), pausedS: sec(ms.paused), interruptedS: sec(ms.interrupted), missingS: sec(ms.missing),
      recordingS: sec(ms.elapsed - ms.paused - ms.interrupted),
      effortS: sec(effortMs),
      distanceM: Math.round(distance), distanceKm: Math.round(distance / 10) / 100,
      gapDistanceM: Math.round(gapDistance),
      avgMovingKmh: kmh(distance, ms.moving), avgOverallKmh: kmh(distance, ms.elapsed),
      ascentM: alt.gain, descentM: alt.loss, altitude: alt,
      stops, gaps, splits, timeline,
      points: flat.length, rejected: rec.rejected || 0, why: { accuracy: 0, speed: 0, order: 0, invalid: 0, full: 0, ...(rec.why || {}) },
      accuracyM: accs.length ? Math.round(median(accs)) : null,
      start: start, end: end, firstFixAt: firstT, lastFixAt: lastT,
      thinnedEveryMs: rec.every || null,
    };
  }

  /** Speed right now in m/s: the receiver's own (Doppler) when it is fresh, else the last ~10 s of positions; null when unknown. */
  function currentSpeed(segs, now, live) {
    if (live && Number.isFinite(live.spd) && live.spd >= 0 && Number.isFinite(live.t) && now - live.t <= 6000) return live.spd < 0.3 ? 0 : live.spd;
    const s = segs[segs.length - 1];
    if (!s || s.length < 2) return null;
    const last = s[s.length - 1];
    if (now - last.t > 15000) return null;
    let i = s.length - 2;
    while (i > 0 && last.t - s[i].t < 10000) i--;
    const dt = (last.t - s[i].t) / 1000;
    if (dt <= 0) return null;
    const v = haversine(s[i], last) / dt;
    return v >= 0.5 ? v : 0;
  }

  /** What the screen may say about the signal, from the latest raw position (kept or not) and the clock. */
  function signal(live, now) {
    if (!live || !Number.isFinite(live.t)) return { state: "searching", label: "Recherche du signal GPS…", accuracyM: null };
    const age = now - live.t;
    if (age > 20000) return { state: "lost", label: "Signal GPS perdu : la distance attend une position fiable.", accuracyM: null };
    const acc = Number.isFinite(live.acc) ? Math.round(live.acc) : null;
    if (acc !== null && acc > MAX_ACCURACY_M) return { state: "weak", label: `Signal faible (± ${acc} m) : position non utilisée.`, accuracyM: acc };
    if (acc !== null && acc > 15) return { state: "fair", label: `Signal moyen (± ${acc} m)`, accuracyM: acc };
    return { state: "good", label: acc === null ? "Signal GPS" : `Signal GPS (± ${acc} m)`, accuracyM: acc };
  }

  /** The five lines every screen and the saved session share. Rounded once, here. */
  function digest(a) {
    return {
      v: 1, rules: a.rules, family: a.family, autoPause: a.autoPause,
      elapsedS: a.elapsedS, movingS: a.movingS, stoppedS: a.stoppedS, pausedS: a.pausedS + a.interruptedS, missingS: a.missingS,
      distanceM: a.distanceM, gapDistanceM: a.gapDistanceM, ascentM: a.ascentM, descentM: a.descentM,
      altitude: a.altitude.reliable ? "gnss" : "unreliable", points: a.points, rejected: a.rejected,
    };
  }

  const clock = (seconds) => {
    const s = Math.max(0, Math.round(seconds)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h} h ${String(m).padStart(2, "0")}` : m ? `${m} min${s % 60 ? ` ${String(s % 60).padStart(2, "0")}` : ""}` : `${s} s`;
  };
  /** The method in one paragraph, with the thresholds actually applied (shown under the figures, on both clients). */
  function explain(a) {
    const p = a.params, f = FAMILIES[a.family];
    return [
      `Temps total : du départ à la fin, ${clock(a.elapsedS)}.`,
      `En mouvement : ${clock(a.movingS)}. À l’arrêt : ${clock(a.stoppedS)} — un arrêt est compté quand tu restes dans un rayon d’environ ${p.stopRadiusM} m à moins de ${String(Math.round(p.stopSpeedMs * 36) / 10).replace(".", ",")} km/h pendant au moins ${p.stopDelayS} s (réglage « ${f.label} »), depuis sa première seconde.`,
      a.pausedS + a.interruptedS ? `En pause : ${clock(a.pausedS + a.interruptedS)} (pause demandée${a.interruptedS ? ` ou enregistrement interrompu : ${clock(a.interruptedS)}` : ""}), rien n’est compté.` : null,
      a.missingS ? `Sans position fiable : ${clock(a.missingS)}${a.gapDistanceM ? ` (au moins ${String(Math.round(a.gapDistanceM / 100) / 10).replace(".", ",")} km à vol d’oiseau, non ajoutés à la distance)` : ""}. Ce temps n’est pas compté comme effort.` : null,
      a.autoPause ? "La durée de la séance est le temps en mouvement." : "Pause automatique désactivée : la durée de la séance garde les arrêts détectés, pas les pauses ni les trous.",
      a.altitude.reliable ? `Dénivelé : altitude du GPS du téléphone, lissée (médiane sur 5 points, seuil de 3 m), non corrigée par une carte.` : "Dénivelé : altitude pas assez fiable sur cette sortie, aucun chiffre n’est affiché.",
    ].filter(Boolean);
  }

  const api = { RULES_VERSION, FAMILIES, GPS_SPORTS, MAX_ACCURACY_M, GAP_S, DWELL_M, MAX_POINTS, haversine, isGpsSport, familyOf, paramsOf, validFix, ingest, analyse, altitude, currentSpeed, signal, digest, explain, clock };
  /** @type {any} */ (root).TitanGpsEngine = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
