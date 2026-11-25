/* TITAN — V1.7.7 the outing recorded in the browser: its model, without a screen. Pure (no clock, no storage, no geolocation): the page
   script js/app/sortie.js gives the time and the positions, this file says what the recording becomes. Same model as the Android app:
     { v:2, owner, sport, status: recording|paused|ended, startedAt, endedAt, stretches:[{s,e,why}], track:{segs, rejected, why, …},
       live:{t,lat,lon,acc,spd,hdg,alt}, opts:{autoPause}, goal, plan:{steps,cursor,alerts}, follow:{id,name,route,state}, back }
   A stretch is a period the recording really ran; `why` says how it ended (pause, interrupted, finish). Time is never invented: a page
   that was closed or asleep leaves a stretch that ends at the last position received, and the engine (js/core/gps-engine.js) counts
   what follows as « interrompu » or « sans position ». Loaded after gps-engine.js, gps-nav.js and gps-session.js. */
(function (root) {
  "use strict";
  const need = (name, path) => root[name] || (typeof require === "function" ? require(path) : null);
  const E = need("TitanGpsEngine", "../core/gps-engine.js");
  const N = need("TitanGpsNav", "../core/gps-nav.js");
  const S = need("TitanGpsSession", "../core/gps-session.js");

  const recKey = (owner) => `titan.gps.rec.v2:${owner}`;
  /** Hand-off with the route library and the planner: { id, route, at } — the route the next outing follows. */
  const followKey = (owner) => `titan.gps.follow.v1:${owner}`;
  const prefsKey = (owner) => `titan.gps.prefs.v1:${owner}`;

  const emptyTrack = () => ({ segs: [], rejected: 0, why: { accuracy: 0, speed: 0, order: 0, invalid: 0, full: 0 } });
  const last = (list) => list[list.length - 1];
  const lastFix = (rec) => { const seg = last(rec.track.segs); return seg ? last(seg) : null; };
  const firstFix = (rec) => { const seg = rec.track.segs.find((s) => s.length); return seg ? seg[0] : null; };
  const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
  const two = (n) => String(n).padStart(2, "0");

  /* ---- Preferences (per account, on this device) ---- */
  const VIEWS = ["map", "dash", "mixed"];
  /** What the athlete chose once and finds again: sport, view, automatic pause, vibration, the four secondary figures per family. */
  function prefsOf(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    const fields = {};
    for (const fam of Object.keys(E.FAMILIES)) {
      const chosen = r.fields && Array.isArray(r.fields[fam]) ? r.fields[fam].filter((k) => S.FIELDS[k]).slice(0, 4) : null;
      if (chosen && chosen.length === 4 && new Set(chosen).size === 4) fields[fam] = chosen;
    }
    return { sport: E.isGpsSport(r.sport) ? r.sport : null, view: VIEWS.includes(r.view) ? r.view : "mixed", autoPause: r.autoPause !== false, vibrate: r.vibrate !== false, tiles: r.tiles === true, fields };
  }

  /* ---- Structured session form ---- */
  const PART_MODES = { min: "Durée (min)", s: "Durée (s)", km: "Distance (km)", m: "Distance (m)", manual: "Au signal" };
  /** One line of the form ({ mode, value }) as the session module reads it ({ by, value in seconds or metres }); null when off or unusable. */
  function partOf(p) {
    if (!p || !PART_MODES[p.mode]) return null;
    if (p.mode === "manual") return { by: "manual", value: 0 };
    const v = Number(String(p.value === undefined || p.value === null ? "" : p.value).replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) return null;
    if (p.mode === "min") return { by: "time", value: Math.round(v * 60) };
    if (p.mode === "s") return { by: "time", value: Math.round(v) };
    return { by: "distance", value: Math.round(p.mode === "km" ? v * 1000 : v) };
  }
  /** The steps of the form: warm-up, repeats × (effort + recovery), cool-down. `errors` name what was typed but cannot be used. */
  function planFromForm(f) {
    const form = f || {}, errors = [];
    const read = (key, label) => {
      const p = form[key];
      if (!p || !p.mode || p.mode === "none") return null;
      const part = partOf(p), step = part && S.stepOf({ kind: "work", by: part.by, value: part.value });
      if (!step) { errors.push(`${label} : indique une durée de 5 s à 6 h, ou une distance de 50 m à 200 km.`); return null; }
      return part;
    };
    const warmup = read("warmup", "Échauffement"), work = read("work", "Effort");
    const reps = work ? Math.max(1, Math.min(30, Math.round(Number(form.reps) || 1))) : 0;
    const steps = S.buildPlan({ warmup, reps, work, recover: reps > 1 ? read("recover", "Récupération") : null, cooldown: read("cooldown", "Retour au calme") });
    return { steps, errors };
  }

  /* ---- Goals ---- */
  /** « Être rentré pour HH:MM »: the next time the clock shows that hour (today, or tomorrow when it is already past). Null when unreadable. */
  function returnAt(text, now) {
    const m = /^(\d{1,2})[:h](\d{2})$/.exec(String(text || "").trim());
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
    const d = new Date(now);
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  /* ---- Recording ---- */
  /** A new outing, running from `now`. Goal, steps and route are optional; each is kept only when usable. */
  function create(o) {
    const steps = S.planOf(o.steps);
    const route = o.follow && o.follow.route && Array.isArray(o.follow.route.segs) ? o.follow.route : null;
    return {
      v: 2, owner: o.owner, sport: o.sport, status: "recording", startedAt: o.now, endedAt: null,
      stretches: [{ s: o.now, e: null, why: null }], track: emptyTrack(), newSegment: true, interrupted: false, live: null,
      opts: { autoPause: o.autoPause !== false }, goal: S.goalOf(o.goal),
      plan: steps.length ? { steps, cursor: S.startPlan(), alerts: o.alerts !== false } : null,
      follow: route ? { id: o.follow.id || null, name: String(route.name || "").slice(0, 80), route, state: N.startFollow() } : null,
      back: null, eventId: null, saved: null,
    };
  }
  const closeOpen = (rec, at, why) => rec.stretches.map((x, i) => (i === rec.stretches.length - 1 && x.e === null ? { ...x, e: Math.max(x.s, at), why } : x));

  function pause(rec, now) {
    if (!rec || rec.status !== "recording") return rec;
    return { ...rec, status: "paused", stretches: closeOpen(rec, now, "pause"), newSegment: true, interrupted: false };
  }
  /** A new stretch starts; the next position opens a new piece of trace, so the pause is never bridged by a line. */
  function resume(rec, now) {
    if (!rec || rec.status !== "paused") return rec;
    const prev = last(rec.stretches);
    return { ...rec, status: "recording", stretches: [...rec.stretches, { s: Math.max(now, prev ? prev.e : now), e: null, why: null }], newSegment: true, interrupted: false };
  }
  /** Ends the outing. While it runs, the end is now. In pause (or after an interruption) the outing ended when its last stretch did:
      a pause that nothing follows — the page reopened two days later to press « Terminer » — is not part of the outing. */
  function finish(rec, now) {
    if (!rec || rec.status === "ended") return rec;
    if (rec.status === "recording") return { ...rec, status: "ended", endedAt: now, stretches: closeOpen(rec, now, "finish") };
    const prev = last(rec.stretches);
    return { ...rec, status: "ended", endedAt: prev ? prev.e : now };
  }
  /** The last moment the page is known to have been alive and listening: the latest position received, kept or not. */
  function lastSeen(rec) {
    const st = last(rec.stretches), fix = lastFix(rec);
    return Math.max(st ? st.s : rec.startedAt, fix ? fix.t : 0, rec.live && Number.isFinite(rec.live.t) ? rec.live.t : 0);
  }
  /** On page load: a recording that claims to run while no page was running it was interrupted (tab closed, browser killed, phone
      asleep). Its stretch is closed at the last position received — never extended to now — and the athlete resumes or finishes. */
  function reconcile(rec, now) {
    if (!rec || rec.status !== "recording") return rec;
    return { ...rec, status: "paused", stretches: closeOpen(rec, Math.min(now, lastSeen(rec)), "interrupted"), newSegment: true, interrupted: true };
  }

  /** A browser position as the engine reads it. The receiver's own time is kept when it is plausible (the page clock otherwise:
      some browsers report another epoch). */
  function fixOf(position, now) {
    const c = position && position.coords;
    if (!c) return null;
    const num = (x, d) => (x === null || x === undefined || !Number.isFinite(Number(x)) ? null : round(Number(x), d));
    const ts = Number(position.timestamp);
    const spd = num(c.speed, 2);
    return {
      t: Number.isFinite(ts) && ts <= now + 5000 && ts > now - 86400000 ? Math.round(ts) : now,
      lat: num(c.latitude, 6), lon: num(c.longitude, 6), acc: num(c.accuracy, 1), alt: num(c.altitude, 1), altAcc: num(c.altitudeAccuracy, 1),
      spd: spd !== null && spd >= 0 ? spd : null, hdg: num(c.heading, 0),
    };
  }
  /** The route being followed right now: the way back when the athlete asked for it, else the chosen route. */
  const guide = (rec) => (rec && rec.back && rec.back.route ? { kind: "back", ...rec.back } : rec && rec.follow && rec.follow.route ? { kind: "follow", ...rec.follow } : null);

  /** One position enters the recording. A position from before the running stretch (cached by the browser) is ignored; after more than
      30 s without a kept position the trace goes on in a new piece: a hole is a hole, not a straight line. `course` is the prepared
      route (TitanGpsNav.course) of what is followed, to avoid preparing it at every position. */
  function addFix(rec, fix, course) {
    if (!rec || rec.status !== "recording" || !fix) return rec;
    const st = last(rec.stretches);
    if (!Number.isFinite(fix.t) || fix.t < st.s) return rec;
    const live = { t: fix.t, lat: fix.lat, lon: fix.lon, acc: fix.acc, spd: fix.spd, hdg: fix.hdg, alt: fix.alt };
    const prev = lastFix(rec);
    const hole = !!prev && fix.t - prev.t > E.GAP_S * 1000;
    const stored = { t: fix.t, lat: fix.lat, lon: fix.lon, acc: fix.acc, alt: fix.alt };
    if (fix.altAcc !== null && fix.altAcc !== undefined) stored.altAcc = fix.altAcc;
    const track = E.ingest(rec.track, stored, { sport: rec.sport, newSegment: rec.newSegment || hole });
    const kept = track.segs !== rec.track.segs;
    const next = { ...rec, track, live, newSegment: kept ? false : rec.newSegment };
    const usable = E.validFix(fix) && (fix.acc === null || fix.acc === undefined || fix.acc <= E.MAX_ACCURACY_M);
    const g = guide(rec);
    if (g && usable) {
      const state = N.follow(course || N.course(g.route), g.state, fix, { sport: rec.sport });
      if (g.kind === "back") next.back = { ...rec.back, state };
      else next.follow = { ...rec.follow, state };
    }
    return next;
  }

  /** The figures of the outing at `now` (the engine's analysis, with the athlete's automatic pause choice). */
  function analysis(rec, now) {
    return E.analyse({ sport: rec.sport, startedAt: rec.startedAt, endedAt: rec.endedAt, segs: rec.track.segs, stretches: rec.stretches, rejected: rec.track.rejected, why: rec.track.why, every: rec.track.every },
      { now, autoPause: !rec.opts || rec.opts.autoPause !== false });
  }

  /** The one line that says what is happening: { kind, text }. A stop is said once the engine detected it, counted from its first second. */
  function stateLine(rec, a, now) {
    if (rec.status === "ended") return { kind: "ended", text: "Sortie terminée" };
    if (rec.status === "paused") return rec.interrupted ? { kind: "interrupted", text: "Enregistrement interrompu" } : { kind: "paused", text: "En pause" };
    const fix = lastFix(rec);
    if (!fix) return { kind: "waiting", text: "Recherche du signal GPS…" };
    const st = last(rec.stretches);
    const quiet = now - Math.max(fix.t, st.s);
    if (quiet > E.GAP_S * 1000) return { kind: "nosignal", text: `Sans signal depuis ${S.chrono(quiet / 1000)}` };
    const stop = last(a.stops);
    if (stop && stop.at + stop.seconds * 1000 >= fix.t - 1000 && fix.t >= st.s) return { kind: "stopped", text: `À l’arrêt depuis ${S.chrono((now - stop.at) / 1000)}` };
    return { kind: "moving", text: "En mouvement" };
  }

  /* ---- Back to the start ---- */
  /** The two honest ways back from the last kept position: the trace walked backwards (with its holes), and the straight line as a
      direction only. Null until the outing has a start and a position 30 m away from it. */
  function wayBack(rec, a) {
    const from = lastFix(rec), start = firstFix(rec);
    if (!from || !start) return null;
    const straight = N.straight(from, start);
    const same = N.backtrack(rec.track.segs, { sport: rec.sport });
    const eta = same ? N.eta(same.route.distanceM, a) : null;
    return { from: { lat: from.lat, lon: from.lon }, start: { lat: start.lat, lon: start.lon }, straight, same, eta, near: straight.distanceM < 30 };
  }
  /** The athlete chose « par le même chemin »: the reversed trace becomes what is followed, thinned to what a stored route may hold. */
  function startBack(rec, now) {
    const same = N.backtrack(rec.track.segs, { sport: rec.sport });
    if (!same) return rec;
    return { ...rec, back: { at: now, name: same.route.name, route: N.fit(same.route, 1500), holes: same.holes, state: N.startFollow() } };
  }
  const stopBack = (rec) => ({ ...rec, back: null });
  const stopFollow = (rec) => ({ ...rec, follow: null });

  /* ---- Saving ---- */
  /** The session's idempotency key: made once, kept with the recording, so a second click or a reload sends the same session again. */
  const withEventId = (rec, make) => (rec.eventId ? rec : { ...rec, eventId: String(make()) });

  /** What was aimed at and what happened, for the summary: { title, line, reached }. Null without a goal. */
  function goalResult(rec, a) {
    const g = S.goalOf(rec.goal);
    if (!g) return null;
    if (g.kind === "distance") { const ok = a.distanceM >= g.km * 1000; return { kind: g.kind, reached: ok, title: `Objectif ${String(g.km).replace(".", ",")} km`, line: ok ? "Objectif de distance atteint." : `${S.km(a.distanceM)} km parcourus sur ${String(g.km).replace(".", ",")} km visés.` }; }
    if (g.kind === "time") { const ok = a.effortS >= g.minutes * 60; return { kind: g.kind, reached: ok, title: `Objectif ${S.span(g.minutes * 60)}`, line: ok ? "Objectif de durée atteint." : `${S.span(a.effortS)} d’effort sur ${S.span(g.minutes * 60)} visés.` }; }
    const end = rec.endedAt || a.end, ok = end <= g.at;
    return { kind: g.kind, reached: ok, title: `Retour pour ${S.hhmm(g.at)}`, line: `Sortie terminée à ${S.hhmm(end)}, ${ok ? "avant" : "après"} l’heure de retour prévue.` };
  }

  /** The session as the existing save path expects it (the same shape a GPX import builds in js/app/seance.js): kilometres, effort
      minutes as the duration, the climb only when the altitude was reliable, and the engine's digest in `gps`. The session carries
      totals only — never a position. `{ ok:false, error }` when nothing was measured. */
  function sessionDetails(rec, a) {
    const minutes = round(a.effortS / 60, 2), km = a.distanceKm;
    if (!(km > 0) && !(minutes > 0)) return { ok: false, error: "Aucune distance ni durée d’effort n’a été mesurée : il n’y a rien à enregistrer. Tu peux abandonner la sortie, ou exporter la trace si elle a des positions." };
    const data = { note: "", tags: [], extras: {}, bio: {}, performedAt: new Date(rec.startedAt).toISOString() };
    if (rec.eventId) data.client_event_id = rec.eventId;
    if (minutes > 0) { data.val2 = Math.min(1440, minutes); data.duration = data.val2; }
    if (km > 0) data.val1 = km;
    else { data.unitOverride = "min"; data.val1 = minutes; data.extras.distance_unknown = true; }
    const climb = a.altitude && a.altitude.reliable;
    if (climb && a.ascentM !== null) data.elevation = Math.min(12000, Math.max(0, a.ascentM));
    data.hasGpx = true;
    data.gpxStats = { distanceKm: km, movingMinutes: minutes, elapsedMinutes: round(a.elapsedS / 60, 2), pauseMinutes: round((a.pausedS + a.interruptedS) / 60, 2), ascent: climb ? a.ascentM : null, descent: climb ? a.descentM : null,
      points: a.points, source: "gps_titan_web", verified: false, analysisVersion: a.rules };
    data.gps = { ...E.digest(a), client: "web" };
    if (rec.plan && rec.plan.steps.length) { const p = S.planSummary(rec.plan.steps, rec.plan.cursor); data.gps.plan = { total: p.total, done: p.done, complete: p.complete }; }
    const goal = goalResult(rec, a);
    if (goal) data.gps.goal = { kind: goal.kind, reached: goal.reached };
    return { ok: true, sport: rec.sport, unit: km > 0 ? "km" : "min", val: data.val1, data };
  }

  /* ---- Summary ---- */
  const KINDS = { moving: "En mouvement", stopped: "À l’arrêt", paused: "En pause", interrupted: "Interrompu", missing: "Sans position" };
  /** The time bar of the summary: each piece of the engine's timeline with its share, and the legend of the kinds that occur. */
  function timeBar(a) {
    const total = Math.max(1, a.ms.elapsed);
    const parts = (a.timeline || []).map((x) => ({ kind: x.kind, ms: x.to - x.from, share: (x.to - x.from) / total })).filter((x) => x.ms > 0);
    const legend = Object.keys(KINDS).filter((k) => a.ms[k] > 0).map((k) => ({ kind: k, label: KINDS[k], seconds: Math.round(a.ms[k] / 1000), share: a.ms[k] / total }));
    return { parts, legend, text: legend.map((l) => `${l.label} ${E.clock(l.seconds)}`).join(", ") };
  }
  const WHY = { accuracy: "trop imprécises (plus de 30 m)", speed: "vitesse impossible pour ce sport", order: "heure incohérente", invalid: "illisibles", full: "trace pleine" };
  /** Data quality in sentences: positions kept and refused by reason, holes with their straight-line length (never added). */
  function quality(a) {
    const refused = Object.keys(WHY).filter((k) => a.why[k] > 0).map((k) => `${a.why[k]} ${WHY[k]}`);
    return {
      points: a.points, rejected: a.rejected,
      refusedText: a.rejected ? `${a.rejected} position${a.rejected > 1 ? "s" : ""} refusée${a.rejected > 1 ? "s" : ""}${refused.length ? ` : ${refused.join(", ")}` : ""}.` : "Aucune position refusée.",
      holes: a.gaps.length,
      holesText: a.gaps.length ? `${a.gaps.length} trou${a.gaps.length > 1 ? "s" : ""} dans la trace (${E.clock(a.missingS)} sans position)${a.gapDistanceM ? `, soit au moins ${S.km(a.gapDistanceM)} km à vol d’oiseau non ajoutés à la distance` : ""}.` : "Aucun trou dans la trace.",
      accuracyText: a.accuracyM === null ? "" : `Précision médiane annoncée : ± ${a.accuracyM} m.`,
      thinnedText: a.thinnedEveryMs ? `Sortie très longue : la trace garde un point toutes les ${Math.round(a.thinnedEveryMs / 1000)} s environ.` : "",
    };
  }
  /** A file name for the exported trace: titan-gravel-2026-11-25.gpx (local date of the start). */
  function gpxName(rec) {
    const d = new Date(rec.startedAt);
    return `titan-${String(rec.sport).replace(/[^a-z0-9_]/g, "")}-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}.gpx`;
  }

  const api = { recKey, followKey, prefsKey, VIEWS, PART_MODES, KINDS, emptyTrack, prefsOf, partOf, planFromForm, returnAt, create, pause, resume, finish, lastSeen, reconcile, fixOf, guide, addFix, analysis, stateLine, lastFix, firstFix,
    wayBack, startBack, stopBack, stopFollow, withEventId, goalResult, sessionDetails, timeBar, quality, gpxName };
  /** @type {any} */ (root).TitanSortieModel = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
