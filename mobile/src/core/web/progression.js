/* TITAN — personal progression, shared unchanged by the website and the Android app.
   Three questions an athlete actually asks, answered only from what was measured:
   1. compare(log, logs)      « Par rapport à ma dernière séance comparable ? » — same sport, comparable size (a 10 km run against
                              a 8–12 km run, a squat against the last squat), with the figure that discipline progresses on.
   2. disciplines(logs, opts) « Est-ce que je progresse en course, en musculation, en escalade ? » — the same figure over the
                              last weeks, first half against second half, with the number of sessions behind each value.
   3. periods(logs, opts)     « Ce mois-ci par rapport au précédent ? » across sports with different units: sessions, active days and
                              DECLARED minutes per family and discipline; minutes TITAN estimates are counted apart, never mixed in.
   Rules: only sessions the server did not hold or refuse, with plausible measures (TitanTraining.counted / plausible); no value
   is invented (no estimated 1RM, no score, no zone, no advice); « significant » means a change beyond a stated threshold, not a
   statistical test; every result carries the sessions it comes from. */
(function (root) {
  "use strict";
  const DAY = 86400000;
  const T = () => root.TitanTraining;
  const S = () => root.TitanSports;
  const I = () => root.TitanInsights;

  const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const time = (l) => new Date(l?.date).getTime();
  const usable = (l) => l && Number.isFinite(time(l)) && (T()?.counted ? T().counted(l) : !l.archived_at) && (T()?.plausible ? T().plausible(l) : true);
  const declared = (l) => (T()?.duration ? T().duration(l) : num(l?.details?.duration));
  const median = (xs) => {
    const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (!s.length) return null;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const round = (v, d = 2) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);

  /* Thresholds under which a change is reported as « stable » rather than better or worse (stated in the result). */
  const THRESHOLD = { pace: 0.02, speed: 0.02, swimPace: 0.02, load: 0.025, volume: 0.1, reps: 0.1, grade: 1, duration: 0.15 };

  /* ---------- The figure each family progresses on ---------- */
  /** The session's own performance figure, or null when it was not measured. */
  function figureOf(log) {
    if (!log || !S()) return null;
    const form = S().formOf(log.sport);
    const minutes = declared(log);
    if (form === "distance" && log.unit === "km") {
      const km = num(log.val);
      if (!(km > 0) || !(minutes > 0) || log.details?.extras?.distance_unknown) return null;
      return S().paceMode(log.sport) === "pace"
        ? { kind: "pace", value: minutes / km, unit: "min/km", better: "lower", size: km, label: "Allure" }
        : { kind: "speed", value: km / (minutes / 60), unit: "km/h", better: "higher", size: km, label: "Vitesse moyenne" };
    }
    if (form === "swim" && log.unit === "m") {
      const m = num(log.val);
      if (!(m > 0) || !(minutes > 0)) return null;
      return { kind: "swimPace", value: minutes / (m / 100), unit: "min/100 m", better: "lower", size: m, label: "Allure aux 100 m" };
    }
    if (form === "climbing") {
      const e = log.details?.extras || {};
      const g = I()?.grade?.(e.max_done, e.grade_system);
      if (!g) return null;
      return { kind: "grade", value: g.score, display: g.label, unit: "", better: "higher", label: "Meilleure cotation réussie", context: [e.grade_system, e.climbing_discipline || ""].join("|") };
    }
    return minutes > 0 ? { kind: "duration", value: minutes, unit: "min", better: null, size: minutes, label: "Durée" } : null;
  }

  /** Per exercise of a strength or bodyweight session: top set and volume (load × reps), or best set and total reps. */
  function exercisesOf(log) {
    const out = new Map();
    for (const ex of log?.details?.exercises || []) {
      if (!ex?.name || ex.kind === "hold") continue;
      const rows = I()?.sets ? I().sets(ex) : [];
      if (!rows.length) continue;
      const key = I().exerciseKey(ex);
      const top = rows.reduce((b, r) => (r.weight > b.weight || (r.weight === b.weight && r.reps > b.reps) ? r : b), rows[0]);
      const volume = rows.reduce((n, r) => n + r.weight * r.reps, 0);
      const reps = rows.reduce((n, r) => n + r.reps, 0);
      out.set(key, { key, name: ex.name, topWeight: top.weight, topReps: top.reps, volume, reps, sets: rows.length, loaded: top.weight > 0 });
    }
    return out;
  }

  function verdict(better, current, previous, threshold) {
    if (current === null || previous === null || !better) return { direction: "neutral", significant: false };
    if (previous === 0) return { direction: current > 0 ? (better === "higher" ? "better" : "worse") : "stable", significant: false };
    const change = (current - previous) / Math.abs(previous);
    if (Math.abs(change) < threshold) return { direction: "stable", significant: false, change };
    const improved = better === "higher" ? change > 0 : change < 0;
    return { direction: improved ? "better" : "worse", significant: true, change };
  }

  const comparableSize = (a, b) => a && b && a.size > 0 && b.size > 0 && Math.abs(a.size - b.size) / Math.max(a.size, b.size) <= 0.25;

  /* ---------- 1. Against the last comparable session ---------- */
  /**
   * { previous, items: [{ id, label, unit, current, previous, delta, direction, significant }], basis } or null.
   * basis explains what made the two sessions comparable, so the athlete can judge it.
   */
  function compare(log, logs) {
    if (!log || !S()) return null;
    const t = time(log);
    const key = (l) => String(l?.client_event_id || l?.details?.client_event_id || l?.id || "");
    const own = key(log);
    const earlier = (logs || []).filter((l) => usable(l) && l !== log && l.sport === log.sport && time(l) < t && (!own || key(l) !== own))
      .sort((a, b) => time(b) - time(a));
    if (!earlier.length) return null;
    const form = S().formOf(log.sport);

    if (form === "strength" || form === "bodyweight") {
      const mine = exercisesOf(log);
      if (!mine.size) return null;
      for (const prev of earlier.slice(0, 60)) {
        const theirs = exercisesOf(prev);
        const shared = [...mine.values()].filter((e) => theirs.has(e.key));
        if (!shared.length) continue;
        const items = [];
        for (const e of shared) {
          const p = theirs.get(e.key);
          if (e.loaded && p.loaded) {
            const top = verdict("higher", e.topWeight, p.topWeight, THRESHOLD.load);
            // Same load, more repetitions, is progress too: reported on the top set.
            const sameLoadMoreReps = e.topWeight === p.topWeight && e.topReps > p.topReps;
            items.push({ id: `top:${e.key}`, label: `${e.name} · meilleure série`, unit: "kg", current: e.topWeight, previous: p.topWeight, currentReps: e.topReps, previousReps: p.topReps, delta: round(e.topWeight - p.topWeight),
              ...(sameLoadMoreReps ? { direction: "better", significant: true } : top) });
            items.push({ id: `volume:${e.key}`, label: `${e.name} · volume`, unit: "kg", current: e.volume, previous: p.volume, delta: round(e.volume - p.volume), ...verdict("higher", e.volume, p.volume, THRESHOLD.volume) });
          } else {
            items.push({ id: `reps:${e.key}`, label: `${e.name} · répétitions`, unit: "rép.", current: e.reps, previous: p.reps, delta: e.reps - p.reps, ...verdict("higher", e.reps, p.reps, THRESHOLD.reps) });
          }
        }
        return { previous: prev, items, basis: `Mêmes exercices (${shared.map((e) => e.name).join(", ")}) que ta séance du ${new Date(prev.date).toLocaleDateString("fr-FR")}.` };
      }
      return null;
    }

    const mine = figureOf(log);
    if (!mine) return null;
    const prev = earlier.find((l) => {
      const f = figureOf(l);
      if (!f || f.kind !== mine.kind) return false;
      if (mine.kind === "grade") return f.context === mine.context;
      return mine.kind === "duration" ? true : comparableSize(mine, f);
    });
    if (!prev) return null;
    const theirs = figureOf(prev);
    const items = [{
      id: mine.kind, label: mine.label, unit: mine.unit, current: round(mine.value, 3), previous: round(theirs.value, 3), delta: round(mine.value - theirs.value, 3),
      ...(mine.display ? { currentDisplay: mine.display, previousDisplay: theirs.display } : {}),
      ...verdict(mine.better, mine.value, theirs.value, THRESHOLD[mine.kind] ?? 0.05),
    }];
    if (mine.kind === "grade") items[0] = { ...items[0], ...(mine.value > theirs.value ? { direction: "better", significant: true } : mine.value < theirs.value ? { direction: "worse", significant: false } : { direction: "stable", significant: false }) };
    // Numeric measures both sessions recorded (aces, goals, elevation…): shown side by side, never judged better or worse.
    const a = log.details?.extras || {}, b = prev.details?.extras || {};
    const fields = (root.SPORTS_CONFIG?.[log.sport]?.extraFields || []).filter((f) => f?.type === "number");
    for (const f of fields.slice(0, 40)) {
      const x = num(a[f.id]), y = num(b[f.id]);
      if (x === null || y === null) continue;
      items.push({ id: `extra:${f.id}`, label: f.label || f.id, unit: f.unit || "", current: x, previous: y, delta: round(x - y), direction: "neutral", significant: false });
    }
    const elev = [num(log.details?.elevation), num(prev.details?.elevation)];
    if (elev[0] !== null && elev[1] !== null) items.push({ id: "elevation", label: "Dénivelé positif", unit: "m", current: elev[0], previous: elev[1], delta: elev[0] - elev[1], direction: "neutral", significant: false });
    const basis = mine.kind === "grade" ? `Même système et même discipline (${theirs.context.replace("|", " · ")}).`
      : mine.kind === "duration" ? `Dernière séance de ${S().label(log.sport).toLowerCase()} avec une durée déclarée.`
      : `Distance comparable (à 25 % près) : ${mine.kind === "swimPace" ? `${Math.round(theirs.size)} m` : `${round(theirs.size, 1)} km`}.`;
    return { previous: prev, items, basis };
  }

  /* ---------- 2. Evolution per discipline ---------- */
  /**
   * For each discipline with enough measured sessions in the window: the median figure of the first half and of the second half,
   * the change, and the sessions behind each value. Strength reports the most trained exercise's top set.
   */
  function disciplines(logs, { now = new Date(), weeks = 12, min = 2 } = {}) {
    const end = now instanceof Date ? now.getTime() : Number(now);
    const start = end - weeks * 7 * DAY, mid = start + (end - start) / 2;
    const bySport = new Map();
    for (const l of logs || []) {
      if (!usable(l) || time(l) < start || time(l) > end) continue;
      if (!bySport.has(l.sport)) bySport.set(l.sport, []);
      bySport.get(l.sport).push(l);
    }
    const out = [];
    for (const [sport, list] of bySport) {
      const form = S()?.formOf(sport);
      const minutes = list.map(declared).filter((m) => m > 0);
      const row = { sport, label: S()?.label(sport) || sport, family: S()?.familyOf(sport), sessions: list.length, minutes: round(minutes.reduce((n, m) => n + m, 0), 1), measuredSessions: minutes.length, trend: null };
      if (form === "strength" || form === "bodyweight") {
        const groups = new Map();
        for (const l of list) for (const e of exercisesOf(l).values()) {
          if (!groups.has(e.key)) groups.set(e.key, { name: e.name, loaded: e.loaded, points: [] });
          groups.get(e.key).points.push({ t: time(l), v: e.loaded ? e.topWeight : e.reps });
        }
        const best = [...groups.values()].sort((a, b) => b.points.length - a.points.length)[0];
        if (best) row.trend = trendOf(best.points, mid, min, best.loaded ? { label: `${best.name} · meilleure série`, unit: "kg", better: "higher", threshold: THRESHOLD.load } : { label: `${best.name} · répétitions`, unit: "rép.", better: "higher", threshold: THRESHOLD.reps });
      } else {
        const points = list.map((l) => ({ l, f: figureOf(l) })).filter((p) => p.f && p.f.kind !== "duration");
        if (points.length) {
          const kind = points[0].f.kind;
          const same = points.filter((p) => p.f.kind === kind && (kind !== "grade" || p.f.context === points[0].f.context));
          row.trend = trendOf(same.map((p) => ({ t: time(p.l), v: p.f.value, display: p.f.display })), mid, min, { label: points[0].f.label, unit: points[0].f.unit, better: points[0].f.better, threshold: THRESHOLD[kind] ?? 0.05, grade: kind === "grade" });
        }
      }
      out.push(row);
    }
    return out.sort((a, b) => b.sessions - a.sessions || b.minutes - a.minutes);
  }

  function trendOf(points, mid, min, meta) {
    const first = points.filter((p) => p.t < mid), second = points.filter((p) => p.t >= mid);
    if (first.length < min || second.length < min) return { ...meta, enough: false, sessions: points.length, needed: min * 2 };
    const pick = meta.grade ? (xs) => Math.max(...xs) : median;
    const a = pick(first.map((p) => p.v)), b = pick(second.map((p) => p.v));
    const v = meta.grade ? (b > a ? { direction: "better", significant: true } : b < a ? { direction: "worse", significant: false } : { direction: "stable", significant: false }) : verdict(meta.better, b, a, meta.threshold);
    const label = (val) => (meta.grade ? points.find((p) => p.v === val)?.display : undefined);
    return { ...meta, enough: true, before: round(a, 3), after: round(b, 3), beforeDisplay: label(a), afterDisplay: label(b), beforeSessions: first.length, afterSessions: second.length, ...v };
  }

  /* ---------- 3. Two periods across sports ---------- */
  /**
   * The last `days` days against the `days` before. Sports with different units are compared through what they share: sessions,
   * active days and declared minutes. Sessions without a declared duration are counted, and their TITAN estimate is reported apart.
   */
  function periods(logs, { now = new Date(), days = 28 } = {}) {
    const end = now instanceof Date ? now.getTime() : Number(now);
    const cur = { from: end - days * DAY, to: end }, prev = { from: end - 2 * days * DAY, to: end - days * DAY };
    const slice = (p) => {
      const s = { sessions: 0, activeDays: new Set(), minutes: 0, unmeasured: 0, estimatedMinutes: 0, bySport: new Map(), byFamily: new Map() };
      for (const l of logs || []) {
        const t = time(l);
        if (!usable(l) || t <= p.from || t > p.to) continue;
        s.sessions++;
        s.activeDays.add(T()?.dateKey ? T().dateKey(l.date) : new Date(t).toDateString());
        const m = declared(l);
        const fam = S()?.familyOf(l.sport) || "endurance";
        const sp = s.bySport.get(l.sport) || { sport: l.sport, label: S()?.label(l.sport) || l.sport, family: fam, sessions: 0, minutes: 0, distanceKm: 0 };
        const fm = s.byFamily.get(fam) || { family: fam, sessions: 0, minutes: 0 };
        sp.sessions++; fm.sessions++;
        if (m > 0) { s.minutes += m; sp.minutes += m; fm.minutes += m; }
        else {
          s.unmeasured++;
          const est = root.TitanProgress?.minutesOf?.(l);
          if (est?.estimated && est.minutes > 0) s.estimatedMinutes += est.minutes;
        }
        if (l.unit === "km" && num(l.val) > 0 && !l.details?.extras?.distance_unknown) sp.distanceKm += num(l.val);
        s.bySport.set(l.sport, sp); s.byFamily.set(fam, fm);
      }
      const total = s.minutes;
      return {
        sessions: s.sessions, activeDays: s.activeDays.size, minutes: round(s.minutes, 1), unmeasuredSessions: s.unmeasured, estimatedMinutes: round(s.estimatedMinutes, 0),
        sports: [...s.bySport.values()].map((x) => ({ ...x, minutes: round(x.minutes, 1), distanceKm: round(x.distanceKm, 2) })).sort((a, b) => b.minutes - a.minutes || b.sessions - a.sessions),
        families: [...s.byFamily.values()].map((x) => ({ ...x, minutes: round(x.minutes, 1), share: total > 0 ? round(x.minutes / total, 3) : null })).sort((a, b) => b.minutes - a.minutes),
      };
    };
    const current = slice(cur), previous = slice(prev);
    const firstSession = Math.min(...(logs || []).filter(usable).map(time));
    // The previous period is not « zero » when the journal did not exist yet: it is partial, and said so.
    const partialPrevious = !Number.isFinite(firstSession) || firstSession > prev.from;
    const sports = new Map();
    for (const x of current.sports) sports.set(x.sport, { sport: x.sport, label: x.label, family: x.family, current: x, previous: null });
    for (const x of previous.sports) sports.set(x.sport, { ...(sports.get(x.sport) || { sport: x.sport, label: x.label, family: x.family, current: null }), previous: x });
    return {
      days, current: { ...cur, ...current }, previous: { ...prev, ...previous, partial: partialPrevious },
      delta: partialPrevious ? null : { sessions: current.sessions - previous.sessions, activeDays: current.activeDays - previous.activeDays, minutes: round(current.minutes - previous.minutes, 1) },
      sports: [...sports.values()].sort((a, b) => (b.current?.minutes || 0) - (a.current?.minutes || 0) || (b.current?.sessions || 0) - (a.current?.sessions || 0)),
    };
  }

  /* ---------- Presentation helpers (plain text, shared wording) ---------- */
  function formatValue(item, which = "current") {
    const v = item[which];
    if (v === null || v === undefined) return "—";
    if (item[`${which}Display`]) return item[`${which}Display`];
    if (item.unit === "min/km" || item.unit === "min/100 m") {
      const total = Math.round(v * 60);
      return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")} ${item.unit === "min/km" ? "/km" : "/100 m"}`;
    }
    const digits = item.unit === "km/h" ? 1 : Number.isInteger(v) ? 0 : 1;
    return `${Number(v).toLocaleString("fr-FR", { maximumFractionDigits: digits })}${item.unit ? ` ${item.unit}` : ""}`;
  }
  const DIRECTION_TEXT = { better: "en progrès", worse: "en retrait", stable: "stable", neutral: "" };

  const api = { version: 1, THRESHOLD, figureOf, compare, disciplines, periods, formatValue, DIRECTION_TEXT };
  root.TitanProgression = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
