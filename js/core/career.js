/* « Ma carrière sportive » : la synthèse de tout ce que le compte a accompli, calculée UNE fois ici pour le Web et pour Android
   (copie synchronisée dans l'application). Pure et en lecture seule : elle ne lit que les séances et les pas qu'on lui donne, n'écrit rien,
   n'appelle aucun serveur, ne donne ni XP ni crédit.
   Règles d'honnêteté (cahier V1.2 §3) :
   - aucune calorie : TITAN n'en enregistre pas, donc rien n'est affiché ni estimé ;
   - une distance ne vient que d'une séance qui l'a mesurée (unité km, ou mètres à la nage) ; un sport sans distance n'en reçoit jamais ;
   - une séance n'est comptée qu'une fois : le journal est déjà dédoublonné par le serveur (Garmin / Santé Connect / GPS / saisie) et rien ici
     ne réimporte ;
   - les pas ne sont jamais des séances ni des kilomètres de séance : un seul nombre par jour (déjà fusionné par l'appelant, jamais additionné
     entre capteurs), et les kilomètres estimés d'après les pas restent à part, étiquetés « estimés » ;
   - une séance suspecte, rejetée ou en attente de vérification n'entre dans aucun total ni aucun jalon. */

/**
 * @typedef {"7d" | "30d" | "year" | "all"} Range
 */
(function (root) {
  "use strict";
  const DAY = 86400000;
  const MAX_ELEVATION_M = 12000;
  const MAX_KMH = { foot: 25, bike: 80, other: 120 };
  const STEP_KM = 0.00075; // an average adult stride, 0.75 m: display only, always labelled as an estimate
  const SESSION_MARKS = [1, 10, 25, 50, 100, 150, 200, 300, 365, 500, 750, 1000];
  const HOUR_MARKS = [10, 25, 50, 100, 200, 300, 500, 1000];
  const FOOT_KM_MARKS = [100, 250, 500, 1000, 2500, 5000];
  const BIKE_KM_MARKS = [250, 500, 1000, 2500, 5000, 10000];
  const ELEVATION_MARKS = [1000, 5000, 8848, 20000, 50000];
  const FOOT_SINGLE = [{ km: 5, label: "Premier 5 km" }, { km: 10, label: "Premier 10 km" }, { km: 21.1, label: "Premier semi-marathon" }, { km: 42.2, label: "Premier marathon" }];
  const BIKE_SINGLE = [{ km: 50, label: "Première sortie de 50 km" }, { km: 100, label: "Première sortie de 100 km" }, { km: 200, label: "Première sortie de 200 km" }];

  /** Which distance a sport's kilometres belong to. Only the balance profiles whose kilometres are really on foot or by bike. */
  const FOOT_PROFILES = new Set(["running", "trail", "hiking", "mountain_endurance"]);
  const BIKE_PROFILES = new Set(["cycling", "mtb"]);

  const S = () => root.TitanSports;
  const F = () => root.TitanFormat;
  const T = () => root.TitanTraining;
  const I = () => root.TitanInsights;

  const num = (v) => (v === null || v === undefined || String(v).trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

  /** A session counts only if it is a real, trusted entry of the journal. */
  function trusted(l, now) {
    if (!l || l.archived_at) return false;
    const t = new Date(l.date).getTime();
    if (!Number.isFinite(t) || t > now + 10 * 60000) return false;
    if (l.is_suspicious) return false;
    return !["rejected", "flagged", "pending_review"].includes(String(l.status || ""));
  }

  function profileOf(sport) {
    return S()?.profileOf?.(sport) || "";
  }
  function labelOf(sport) {
    return S()?.label?.(sport) || String(sport || "Séance").replace(/_/g, " ");
  }
  function familyOf(sport) {
    return S()?.familyOf?.(sport) || "endurance";
  }

  function minutesOf(l) {
    const declared = T()?.duration?.(l);
    return declared !== null && declared !== undefined && declared > 0 ? Math.min(declared, 1440) : null;
  }

  /** Kilometres of a session, or null when the session did not measure any. Swimming is in metres and kept apart. */
  function kmOf(l) {
    if (String(l.unit).toLowerCase() !== "km") return null;
    const v = num(l.val);
    return v !== null && v > 0 && v <= 2000 ? v : null;
  }
  function swimMetersOf(l) {
    if (String(l.unit).toLowerCase() !== "m" || profileOf(l.sport) !== "swimming") return null;
    const v = num(l.val);
    return v !== null && v > 0 && v <= 100000 ? v : null;
  }
  function elevationOf(l) {
    const v = num(l.details?.elevation ?? l.details?.gpxStats?.ascent);
    return v !== null && v > 0 ? Math.min(v, MAX_ELEVATION_M) : null;
  }

  /** "foot" | "bike" | "other": where a session's kilometres are counted. */
  function lane(sport) {
    const p = profileOf(sport);
    if (FOOT_PROFILES.has(p)) return "foot";
    if (BIKE_PROFILES.has(p)) return "bike";
    return "other";
  }

  /** An impossible average speed (a typing error, a bad file) earns no distance; the session itself still counts as a session. */
  function plausibleKm(l, km) {
    const m = minutesOf(l);
    if (!m) return true; // no duration to contradict it
    const kmh = km / (m / 60);
    return kmh <= MAX_KMH[lane(l.sport)];
  }

  function rangeStart(range, now) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    if (range === "7d") return new Date(d.getTime() - 6 * DAY).getTime();
    if (range === "30d") return new Date(d.getTime() - 29 * DAY).getTime();
    if (range === "year") return new Date(d.getFullYear(), 0, 1).getTime();
    return -Infinity;
  }

  const dayKey = (v) => (T()?.dateKey ? T().dateKey(v) : new Date(v).toISOString().slice(0, 10));

  function strengthOf(list) {
    let sessions = 0, sets = 0, reps = 0, volume = 0, loadedSets = 0, heaviest = 0;
    for (const l of list) {
      const ex = Array.isArray(l.details?.exercises) ? l.details.exercises : [];
      if (!ex.length) continue;
      let counted = false;
      for (const e of ex) {
        const rows = Array.isArray(e.setRows) ? e.setRows : [];
        if (rows.length) {
          for (const r of rows) {
            const r1 = num(r.reps), w = num(r.weight);
            if (e.kind === "hold") {
              if (num(r.seconds) > 0) { sets++; counted = true; }
              continue;
            }
            if (r1 !== null && r1 > 0) {
              sets++; reps += r1; counted = true;
              if (w !== null && w > 0) { volume += w * r1; loadedSets++; heaviest = Math.max(heaviest, w); }
            }
          }
        } else if (num(e.sets) > 0 && num(e.reps) > 0) {
          const s = num(e.sets), r1 = num(e.reps), w = num(e.weight);
          sets += s; reps += s * r1; counted = true;
          if (w !== null && w > 0) { volume += s * r1 * w; loadedSets += s; heaviest = Math.max(heaviest, w); }
        }
      }
      if (counted) sessions++;
    }
    return { sessions, sets, reps, volumeKg: Math.round(volume), loadedSets, heaviestKg: heaviest };
  }

  /** The dated big moments, found in the WHOLE journal (a range only filters which ones are shown). Each one is proved by a real session. */
  function milestones(list) {
    const sorted = list.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const out = [];
    const push = (id, log, title, detail, tone = "cyan") => out.push({ id, date: new Date(log.date).toISOString(), title, detail, tone, sport: log.sport });
    sorted.forEach((l, i) => {
      if (SESSION_MARKS.includes(i + 1)) push(`sessions:${i + 1}`, l, i === 0 ? "Première séance" : `${i + 1} séances`, i === 0 ? `${labelOf(l.sport)}, le début de l’aventure.` : "Chaque séance compte, la tienne aussi.", i === 0 ? "amber" : "cyan");
    });
    let minutes = 0, footKm = 0, bikeKm = 0, elevation = 0;
    const seenHours = new Set(), seenFoot = new Set(), seenBike = new Set(), seenElev = new Set(), seenSingle = new Set();
    for (const l of sorted) {
      const m = minutesOf(l);
      if (m) {
        minutes += m;
        for (const h of HOUR_MARKS) if (!seenHours.has(h) && minutes >= h * 60) { seenHours.add(h); push(`hours:${h}`, l, `${h} heures d’effort`, "Le temps que tu t’es donné, cumulé.", "cyan"); }
      }
      const km = kmOf(l);
      if (km && plausibleKm(l, km)) {
        const ln = lane(l.sport);
        if (ln === "foot") {
          footKm += km;
          for (const mark of FOOT_KM_MARKS) if (!seenFoot.has(mark) && footKm >= mark) { seenFoot.add(mark); push(`foot:${mark}`, l, `${mark.toLocaleString("fr-FR")} km à pied`, "Cumul des kilomètres enregistrés en séance.", "cyan"); }
          for (const s of FOOT_SINGLE) if (!seenSingle.has(`foot${s.km}`) && km >= s.km * 0.995 && ["running", "trail"].includes(profileOf(l.sport))) { seenSingle.add(`foot${s.km}`); push(`single:foot:${s.km}`, l, s.label, `${F()?.distance ? F().distance(km) : km + " km"} en une séance.`, "amber"); }
        } else if (ln === "bike") {
          bikeKm += km;
          for (const mark of BIKE_KM_MARKS) if (!seenBike.has(mark) && bikeKm >= mark) { seenBike.add(mark); push(`bike:${mark}`, l, `${mark.toLocaleString("fr-FR")} km à vélo`, "Cumul des kilomètres enregistrés en séance.", "cyan"); }
          for (const s of BIKE_SINGLE) if (!seenSingle.has(`bike${s.km}`) && km >= s.km * 0.995) { seenSingle.add(`bike${s.km}`); push(`single:bike:${s.km}`, l, s.label, `${F()?.distance ? F().distance(km) : km + " km"} en une sortie.`, "amber"); }
        }
      }
      const up = elevationOf(l);
      if (up) {
        elevation += up;
        for (const mark of ELEVATION_MARKS) if (!seenElev.has(mark) && elevation >= mark) { seenElev.add(mark); push(`elevation:${mark}`, l, mark === 8848 ? "Un Everest de dénivelé" : `${mark.toLocaleString("fr-FR")} m de dénivelé positif`, "Cumul du dénivelé positif enregistré.", mark === 8848 ? "amber" : "cyan"); }
      }
    }
    return out.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  /**
   * @param {any[]} logs the account's journal (any order)
   * @param {{ now?: Date | number, range?: Range, stepDays?: { day: string, steps: number }[] | null, rank?: { level?: number, id?: string, name?: string } | null, xp?: number | null }} [options]
   *   `stepDays`: ONE number per day, already merged by the caller (the highest source, never a sum of sources). null = no step source at all.
   */
  function build(logs, { now = Date.now(), range = "30d", stepDays = null, rank = null, xp = null } = {}) {
    const nowMs = now instanceof Date ? now.getTime() : now;
    const all = (logs || []).filter((l) => trusted(l, nowMs));
    const excluded = (logs || []).filter((l) => l && !l.archived_at && !trusted(l, nowMs)).length;
    const from = rangeStart(range, nowMs);
    const list = all.filter((l) => new Date(l.date).getTime() >= from);

    let minutes = 0, measured = 0;
    let footKm = 0, bikeKm = 0, otherKm = 0, swimM = 0, elevation = 0;
    let footSessions = 0, bikeSessions = 0, swimSessions = 0, elevationSessions = 0, footMinutes = 0, bikeMinutes = 0, swimMinutes = 0;
    const days = new Set(), sports = new Map(), families = new Map();
    for (const l of list) {
      days.add(dayKey(l.date));
      const m = minutesOf(l);
      if (m) { minutes += m; measured++; }
      const sp = sports.get(l.sport) || { sport: l.sport, label: labelOf(l.sport), family: familyOf(l.sport), sessions: 0, minutes: 0, km: 0 };
      sp.sessions++; if (m) sp.minutes += m;
      const fam = families.get(sp.family) || { id: sp.family, minutes: 0, sessions: 0 };
      fam.sessions++; if (m) fam.minutes += m;
      families.set(sp.family, fam);
      const km = kmOf(l);
      if (km && plausibleKm(l, km)) {
        sp.km += km;
        const ln = lane(l.sport);
        if (ln === "foot") { footKm += km; footSessions++; if (m) footMinutes += m; }
        else if (ln === "bike") { bikeKm += km; bikeSessions++; if (m) bikeMinutes += m; }
        else otherKm += km;
      }
      const sw = swimMetersOf(l);
      if (sw) { swimM += sw; swimSessions++; if (m) swimMinutes += m; sp.km += sw / 1000; }
      const up = elevationOf(l);
      if (up) { elevation += up; elevationSessions++; }
      sports.set(l.sport, sp);
    }

    const strength = strengthOf(list);
    const famTotal = [...families.values()].reduce((a, f) => a + (f.minutes || 0), 0);
    const FAMILY_LABEL = S()?.FAMILY_LABEL || {};
    const familyList = [...families.values()]
      .map((f) => ({ id: f.id, label: FAMILY_LABEL[f.id] || f.id, sessions: f.sessions, minutes: Math.round(f.minutes), share: famTotal ? f.minutes / famTotal : 0 }))
      .sort((a, b) => b.sessions - a.sessions);
    const sportList = [...sports.values()].map((s) => ({ ...s, minutes: Math.round(s.minutes), km: round(s.km) })).sort((a, b) => b.sessions - a.sessions || b.minutes - a.minutes);

    /* Steps: only days inside the range and the account's life; a day with no number is "no data", never zero. */
    let steps = null;
    if (Array.isArray(stepDays)) {
      const startKey = from === -Infinity ? null : dayKey(from);
      const valid = stepDays.filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(String(d.day)) && Number.isFinite(Number(d.steps)) && Number(d.steps) > 0 && (!startKey || d.day >= startKey));
      const total = valid.reduce((a, d) => a + Number(d.steps), 0);
      if (valid.length) steps = { total, days: valid.length, firstDay: valid.map((d) => d.day).sort()[0], estimatedKm: round(total * STEP_KM) };
    }

    /* Which lenses fit this account: only practices that really have data in the range, most present first. */
    const lenses = [];
    const add = (id, weight) => { if (weight > 0) lenses.push({ id, weight }); };
    add("run", footSessions && ["running", "trail"].some((p) => list.some((l) => profileOf(l.sport) === p && kmOf(l))) ? footSessions : 0);
    add("hike", list.filter((l) => ["hiking", "mountain_endurance"].includes(profileOf(l.sport)) && kmOf(l)).length);
    add("bike", bikeSessions);
    add("swim", swimSessions);
    add("strength", strength.sessions);
    const practiced = sportList.length;
    const order = lenses.sort((a, b) => b.weight - a.weight).map((l) => l.id);
    if (practiced >= 3 && familyList.length >= 2) order.push("multi");

    let records = [];
    try {
      const insights = I();
      if (insights?.records) {
        records = insights.records(all, "all", nowMs).filter((r) => new Date(r.log.date).getTime() >= from)
          .map((r) => ({ id: r.id, kind: r.kind, sport: r.sport, sportLabel: labelOf(r.sport), label: r.label, value: r.value, unit: r.unit, date: new Date(r.log.date).toISOString() }));
      }
    } catch (_) { /* a records failure never hides the rest of the page */ }

    const stones = milestones(all).filter((m) => new Date(m.date).getTime() >= from);
    const sorted = all.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const timeline = list.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 12).map((l) => ({
      id: l.id, date: new Date(l.date).toISOString(), sport: l.sport, label: labelOf(l.sport), minutes: minutesOf(l), km: kmOf(l) && plausibleKm(l, kmOf(l)) ? round(kmOf(l)) : null,
    }));

    return {
      range,
      from: Number.isFinite(from) ? new Date(from).toISOString() : null,
      first: sorted[0] ? new Date(sorted[0].date).toISOString() : null,
      empty: list.length === 0,
      excluded,
      totals: {
        sessions: list.length, activeDays: days.size, sports: sportList.length,
        minutes: Math.round(minutes), measuredSessions: measured, unmeasuredSessions: list.length - measured,
      },
      // Calories are not recorded by TITAN: nothing is shown and nothing is estimated.
      calories: { available: false },
      distance: {
        footKm: round(footKm), footSessions, bikeKm: round(bikeKm), bikeSessions, swimMeters: Math.round(swimM), swimSessions, otherKm: round(otherKm),
        footMinutes: Math.round(footMinutes), bikeMinutes: Math.round(bikeMinutes), swimMinutes: Math.round(swimMinutes),
        footPace: footKm > 0 && footMinutes > 0 ? footMinutes / footKm : null,
        bikeKmh: bikeKm > 0 && bikeMinutes > 0 ? bikeKm / (bikeMinutes / 60) : null,
      },
      elevation: { meters: Math.round(elevation), sessions: elevationSessions },
      steps,
      strength,
      lenses: order,
      families: familyList,
      sports: sportList,
      records,
      milestones: stones,
      timeline,
      rpg: { level: rank?.level ?? null, id: rank?.id ?? null, name: rank?.name ?? null, xp: xp ?? null },
    };
  }

  const api = { build, milestones, trusted, STEP_KM, SESSION_MARKS };
  /** @type {any} */ (root).TitanCareer = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
