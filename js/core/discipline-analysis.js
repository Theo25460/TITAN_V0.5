/* TITAN — V1.7.5 Analyse avancée par discipline, shared unchanged by the website and the Android app.
   Three depth views built on the progression engine (js/core/progression.js) and on the journal states (V1.6.3):
   - endurance : the rides or runs of one sport on a comparable route and distance (the V1.7.1 rule « distance.taille-parcours »),
                 their speed or pace, how the effort is held and how regular it is kilometre by kilometre when a GPS track is cut
                 into kilometres, elevation and heart rate when they were recorded;
   - force     : one exercise with its variant and equipment (never merged with another variant): the reference set, the top set,
                 the volume, the sets, the repetitions and the RIR when it was entered — no 1RM is estimated;
   - escalade  : one sport, one grade scale and one discipline (never converted to another scale): attempts, successes, success
                 rate, best grade done and tried, and a table per grade level.
   Every metric carries its rule, its source fields, its coverage (sessions that hold the value / sessions in the side) and the
   sessions it comes from. A view compares the last weeks side by side with a reference: the period before, a training block
   (V1.7.4) or one session. A missing value is shown missing, never interpolated; a side too short gives values without a trend.
   Only sessions the server holds as confirmed count (TitanProgression.stateReason): archived, refused, held, unsent and
   implausible sessions are counted apart and never enter a value. VERSION changes with any rule; the shared test set of Web and
   Android is tests/fixtures/discipline-analysis-v175.json. */
(function (root) {
  "use strict";
  const VERSION = "2026.11-a1";
  const DAY = 86400000;
  const MIN_SESSIONS = 2; // sessions on each side for a trend (1 against a single reference session)
  const MIN_SPLITS = 4; // full kilometres of a track to judge how an effort is held
  const MAX_POOL = 500;
  const P = () => root.TitanProgression;
  const S = () => root.TitanSports;
  const I = () => root.TitanInsights;
  const T = () => root.TitanTraining;

  const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const time = (l) => new Date(l?.date).getTime();
  const key = (l) => String(l?.client_event_id || l?.details?.client_event_id || l?.id || "");
  const norm = (v) => String(v ?? "").trim().toLocaleLowerCase("fr-FR");
  const round = (v, d = 2) => (v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d);
  const median = (xs) => {
    const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (!s.length) return null;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const plural = (n, one, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;
  /** Lower-case the first letter of a label, but keep an acronym (RIR, FC). */
  const lower = (t) => (/^[A-ZÀ-Ý]{2}/.test(t) ? t : t.charAt(0).toLocaleLowerCase("fr-FR") + t.slice(1));
  /** French number without locale tables (same text under Node, browsers and Hermes). */
  function fr(v, d = 1) {
    if (v === null || v === undefined) return "—";
    const r = round(v, d);
    const [int, dec] = String(Math.abs(r)).split(".");
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return `${r < 0 ? "-" : ""}${grouped}${dec ? `,${dec}` : ""}`;
  }
  const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  function dateText(t, now) {
    const d = new Date(t);
    const y = now ? new Date(now).getFullYear() : null;
    return `${d.getDate()} ${MONTHS[d.getMonth()]}${y !== null && d.getFullYear() !== y ? ` ${d.getFullYear()}` : ""}`;
  }
  function paceText(minPerKm, unit = "/km") {
    const total = Math.round(minPerKm * 60);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")} ${unit}`;
  }
  const extras = (l) => l?.details?.extras || {};
  const declared = (l) => (T()?.duration ? T().duration(l) : num(l?.details?.duration));
  const fields = (sport) => root.SPORTS_CONFIG?.[sport]?.extraFields || [];
  const hasField = (sport, id) => fields(sport).some((f) => f?.id === id);
  const fieldLabel = (sport, id) => fields(sport).find((f) => f?.id === id)?.label || id;

  const STATE_TEXT = { archived: "archivée", refused: "refusée par le serveur", held: "en vérification", unsent: "en attente d’envoi", implausible: "mesure hors limites" };
  const DISCIPLINES = { endurance: "Endurance", strength: "Force", climbing: "Escalade" };

  /* ---------- Windows: the last weeks and the reference beside them ---------- */
  function dayStart(dateKey) {
    const [y, m, d] = String(dateKey).slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  function windows(opts) {
    const now = opts.now instanceof Date ? opts.now.getTime() : Number(opts.now ?? Date.now());
    const weeks = Math.max(1, Math.min(52, Math.round(Number(opts.weeks) || 12)));
    const span = weeks * 7 * DAY;
    const current = { kind: "period", from: now - span, to: now + 1, label: `${weeks} dernières semaines (${dateText(now - span + 1, now)} – ${dateText(now, now)})` };
    const r = opts.reference === undefined ? { kind: "period" } : opts.reference;
    let reference = null;
    if (r && r.kind === "period") reference = { kind: "period", from: current.from - span, to: current.from, label: `${weeks} semaines d’avant (${dateText(current.from - span + 1, now)} – ${dateText(current.from, now)})` };
    else if (r && r.kind === "block" && r.start && r.end) {
      const from = dayStart(r.start), to = dayStart(r.end) + DAY;
      reference = { kind: "block", id: r.id || null, from, to, label: `Bloc « ${String(r.title || "sans titre").slice(0, 80)} » (${dateText(from, now)} – ${dateText(to - 1, now)})` };
    } else if (r && r.kind === "session" && r.id) reference = { kind: "session", id: String(r.id), label: "" };
    return { now, weeks, current, reference };
  }
  const inWindow = (w, l) => w && w.kind !== "session" && time(l) >= w.from && time(l) < w.to;

  /* ---------- Metrics: one side is a list of sessions; each metric says how many of them hold its value ---------- */
  function sideOf(sessions, metric) {
    const values = [];
    const proof = [];
    for (const s of sessions) {
      const v = metric.read(s);
      if (v === null || v === undefined) continue;
      values.push({ s, v });
      proof.push(s.id);
    }
    const agg = values.length ? metric.aggregate(values) : null;
    const out = { value: agg ? agg.value : null, display: agg ? agg.display : "—", measured: values.length, total: sessions.length, sessions: proof };
    if (agg?.from) out.from = agg.from;
    if (values.length < sessions.length) out.missing = `${metric.missing} sur ${plural(sessions.length - values.length, "séance")}`;
    return out;
  }
  function directionOf(metric, cur, ref, needed) {
    if (!metric.better || !ref || cur.value === null || ref.value === null) return { direction: "neutral", significant: false };
    if (cur.measured < needed || ref.measured < needed) return { direction: "neutral", significant: false, reason: "short" };
    if (metric.grade) return cur.value > ref.value ? { direction: "better", significant: true } : cur.value < ref.value ? { direction: "worse", significant: false } : { direction: "stable", significant: false };
    if (metric.tieBreak) {
      const t = metric.tieBreak(cur, ref);
      if (t) return t;
    }
    if (ref.value === 0) return { direction: "stable", significant: false };
    const change = (cur.value - ref.value) / Math.abs(ref.value);
    if (Math.abs(change) < metric.threshold) return { direction: "stable", significant: false, change: round(change, 4) };
    const improved = metric.better === "higher" ? change > 0 : change < 0;
    return { direction: improved ? "better" : "worse", significant: true, change: round(change, 4) };
  }
  const agg = {
    count: () => (vs) => ({ value: vs.length, display: plural(vs.length, "séance") }),
    sum: (fmt) => (vs) => { const v = vs.reduce((n, x) => n + x.v, 0); return { value: v, display: fmt(v) }; },
    median: (fmt) => (vs) => { const v = median(vs.map((x) => x.v)); return { value: round(v, 4), display: fmt(v) }; },
    best: (better, fmt) => (vs) => {
      const b = vs.reduce((m, x) => (m === null || (better === "lower" ? x.v < m.v : x.v > m.v) ? x : m), null);
      return { value: round(b.v, 4), display: fmt(b.v), from: b.s.id };
    },
  };

  /* ---------- Admissible sessions ---------- */
  function admissible(logs, accept, win) {
    const pool = [], states = {};
    for (const l of logs || []) {
      if (!l || !Number.isFinite(time(l)) || !accept(l)) continue;
      const state = P().stateReason(l);
      if (state) {
        if (!win || inWindow(win.current, l) || inWindow(win.reference, l) || (win.reference?.kind === "session" && key(l) === win.reference.id)) states[state] = (states[state] || 0) + 1;
        continue;
      }
      pool.push(l);
    }
    pool.sort((a, b) => time(b) - time(a) || (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
    const truncated = pool.length > MAX_POOL;
    if (truncated) pool.length = MAX_POOL;
    return { pool, states, truncated };
  }

  /* ---------- Endurance ---------- */
  const isDistance = (l) => S()?.formOf(l.sport) === "distance" && l.unit === "km";
  const measuredDistance = (l) => num(l.val) > 0 && !extras(l).distance_unknown;
  const routeFieldOf = (sport) => (P().ROUTE_FIELDS || ["surface", "terrain"]).find((f) => hasField(sport, f)) || null;
  const routeOf = (l) => { const f = routeFieldOf(l.sport); return f ? String(extras(l)[f] ?? "").trim() : ""; };
  const elevPerKm = (l) => { const e = num(l.details?.elevation), km = num(l.val); return e !== null && e >= 0 && km > 0 ? e / km : null; };
  function splitsOf(l) {
    const s = l?.details?.gpxStats?.splits;
    if (!Array.isArray(s)) return [];
    return s.filter((x) => num(x?.distanceKm) >= 0.999 && num(x?.distanceKm) <= 1.001 && num(x?.durationSeconds) > 0).map((x) => 1 / (x.durationSeconds / 3600));
  }
  function holdOf(l) {
    const v = splitsOf(l);
    if (v.length < MIN_SPLITS) return null;
    const h = Math.floor(v.length / 2);
    const first = v.slice(0, h), second = v.slice(v.length - h);
    const mean = (xs) => xs.reduce((n, x) => n + x, 0) / xs.length;
    return (mean(second) / mean(first)) * 100;
  }
  function regularityOf(l) {
    const v = splitsOf(l);
    if (v.length < MIN_SPLITS) return null;
    const m = v.reduce((n, x) => n + x, 0) / v.length;
    const sd = Math.sqrt(v.reduce((n, x) => n + (x - m) ** 2, 0) / v.length);
    return (sd / m) * 100;
  }

  function enduranceGroups(logs, sport, adm) {
    const { pool } = adm || admissible(logs, (l) => l.sport === sport && isDistance(l));
    const gap = P().SELECTION.sizeGap, elevGap = P().SELECTION.elevationGapPerKm;
    const candidates = pool.filter(measuredDistance);
    const assigned = new Set();
    const groups = [];
    for (const anchor of candidates) {
      if (assigned.has(anchor)) continue;
      const route = routeOf(anchor), km = num(anchor.val), e = elevPerKm(anchor);
      const members = candidates.filter((l) => {
        if (assigned.has(l)) return false;
        if (norm(routeOf(l)) !== norm(route)) return false;
        const k = num(l.val);
        if (Math.abs(k - km) / Math.max(k, km) > gap) return false;
        const x = elevPerKm(l);
        return !(e !== null && x !== null && Math.abs(e - x) > elevGap);
      });
      members.forEach((l) => assigned.add(l));
      const field = routeFieldOf(sport);
      const kms = members.map((l) => num(l.val));
      groups.push({
        id: `endurance:${key(anchor)}`, discipline: "endurance", sport, anchor: anchor.id, route, routeField: field, anchorKm: km,
        label: `${S().label(sport)} · ≈ ${fr(km, 0)} km${field ? ` · ${route || `${fieldLabel(sport, field).toLowerCase()} non renseigné`}` : ""}`,
        sessions: members.length, medianKm: round(median(kms), 2), members,
        criteria: [
          `Même sport : ${S().label(sport)}`,
          `Distance à ${Math.round(gap * 100)} % près de la sortie repère du ${dateText(time(anchor))} (${fr(km, 1)} km) : de ${fr(km * (1 - gap), 1)} à ${fr(km / (1 - gap), 1)} km`,
          field ? (route ? `Même parcours (${fieldLabel(sport, field)}) : ${route}` : `Parcours (${fieldLabel(sport, field)}) non renseigné : seules les sorties sans parcours renseigné sont regroupées`) : "Ce sport n’a pas de champ de parcours",
          `Dénivelé à ${elevGap} m/km près quand il est connu des deux côtés`,
        ],
        limits: field && !route ? [`Parcours non renseigné (${fieldLabel(sport, field)}) : ces sorties ne sont pas séparées par terrain.`] : [],
      });
    }
    // Groups with a trend possible first, the longest outings first.
    return groups.sort((a, b) => (b.sessions >= MIN_SESSIONS) - (a.sessions >= MIN_SESSIONS) || b.medianKm - a.medianKm || b.sessions - a.sessions);
  }

  function enduranceMetrics(group) {
    const sport = group.sport;
    const mode = S().paceMode?.(sport) === "pace" ? "pace" : "speed";
    const speedOf = (l) => { const m = declared(l), km = num(l.val); return m > 0 && km > 0 ? (mode === "pace" ? m / km : km / (m / 60)) : null; };
    const fmtSpeed = (v) => (mode === "pace" ? paceText(v) : `${fr(v, 1)} km/h`);
    const better = mode === "pace" ? "lower" : "higher";
    const list = [
      { id: "sessions", label: "Sorties comparables", rule: "Sorties du groupe dans la période.", provenance: "Journal : séances confirmées", read: () => 1, aggregate: agg.count(), better: null, missing: "" },
      { id: "distance", label: "Distance (médiane)", rule: "Médiane des distances mesurées.", provenance: "Distance saisie ou importée", read: (l) => num(l.val), aggregate: agg.median((v) => `${fr(v, 1)} km`), better: null, missing: "distance non mesurée" },
      { id: mode, label: mode === "pace" ? "Allure (médiane)" : "Vitesse moyenne (médiane)", rule: `${mode === "pace" ? "Durée ÷ distance" : "Distance ÷ durée"} de chaque sortie, puis la médiane. Une durée estimée pour l’XP n’est jamais utilisée.`, provenance: "Distance et durée déclarée", read: speedOf, aggregate: agg.median(fmtSpeed), better, threshold: P().THRESHOLD[mode], missing: "durée non saisie", trend: true },
      { id: `best_${mode}`, label: mode === "pace" ? "Meilleure allure" : "Meilleure vitesse moyenne", rule: "La meilleure sortie du groupe dans la période. Montrée sans verdict : elle dépend du nombre de sorties.", provenance: "Distance et durée déclarée", read: speedOf, aggregate: agg.best(better, fmtSpeed), better: null, missing: "durée non saisie" },
      { id: "hold", label: "Tenue de l’effort", rule: `Vitesse moyenne des kilomètres de la seconde moitié ÷ celle de la première moitié (au moins ${MIN_SPLITS} kilomètres complets). 100 % : effort tenu ; moins de 100 % : fin plus lente.`, provenance: "Découpage au kilomètre de la trace GPS", read: holdOf, aggregate: agg.median((v) => `${fr(v, 1)} %`), better: "higher", threshold: 0.02, missing: "pas de trace GPS découpée au kilomètre" },
      { id: "regularity", label: "Écart entre kilomètres", rule: `Écart-type des vitesses au kilomètre ÷ leur moyenne (au moins ${MIN_SPLITS} kilomètres complets). Plus bas : plus régulier.`, provenance: "Découpage au kilomètre de la trace GPS", read: regularityOf, aggregate: agg.median((v) => `${fr(v, 1)} %`), better: "lower", threshold: 0.1, missing: "pas de trace GPS découpée au kilomètre" },
      { id: "elevation", label: "Dénivelé positif par km (médiane)", rule: "Dénivelé positif ÷ distance. Repère de contexte, sans verdict.", provenance: "Dénivelé saisi ou mesuré par la trace", read: elevPerKm, aggregate: agg.median((v) => `${fr(v, 0)} m/km`), better: null, missing: "dénivelé non renseigné" },
    ];
    if (hasField(sport, "avg_hr")) list.push({ id: "avg_hr", label: "Fréquence cardiaque moyenne (médiane)", rule: "Médiane des FC moyennes saisies ou importées. Repère de contexte, sans verdict.", provenance: `Champ facultatif « ${fieldLabel(sport, "avg_hr")} »`, read: (l) => (num(extras(l).avg_hr) > 0 ? num(extras(l).avg_hr) : null), aggregate: agg.median((v) => `${fr(v, 0)} bpm`), better: null, missing: "FC non renseignée" });
    return { list, series: { metric: mode, read: speedOf, format: fmtSpeed } };
  }

  /* ---------- Force ---------- */
  const isStrength = (l) => ["strength", "bodyweight"].includes(S()?.formOf(l.sport));
  function exerciseRows(l, exKey) {
    for (const ex of l?.details?.exercises || []) {
      if (!ex?.name || ex.kind === "hold" || I().exerciseKey(ex) !== exKey) continue;
      return I().sets(ex);
    }
    return [];
  }
  const variantText = (e) => [e.variant, e.equipment].filter(Boolean).join(", ");
  function strengthGroups(logs, sportFilter, adm) {
    const { pool } = adm || admissible(logs, (l) => isStrength(l) && (!sportFilter || l.sport === sportFilter));
    const map = new Map();
    for (const l of pool) for (const e of P().exercisesOf(l).values()) {
      const id = `strength:${l.sport}|${e.key}`;
      if (!map.has(id)) map.set(id, { id, discipline: "strength", sport: l.sport, exercise: e.key, name: String(e.name).trim(), variant: variantText(e), members: [], loaded: false });
      const g = map.get(id);
      g.members.push(l);
      if (e.loaded) g.loaded = true;
    }
    const groups = [...map.values()];
    for (const g of groups) {
      g.label = `${g.name}${g.variant ? ` (${g.variant})` : " (sans variante)"} · ${S().label(g.sport)}`;
      g.sessions = g.members.length;
      g.criteria = [`Même sport : ${S().label(g.sport)}`, `Même exercice, même variante et même matériel : ${g.name}${g.variant ? ` (${g.variant})` : ", sans variante renseignée"}`, "Séries mesurées (charge et répétitions) : aucun 1RM estimé"];
      const homonyms = groups.filter((o) => o !== g && o.sport === g.sport && norm(o.name) === norm(g.name)).map((o) => o.variant || "sans variante");
      g.limits = homonyms.length ? [`Même nom, autre variante : ${homonyms.join(", ")} ${homonyms.length > 1 ? "sont analysées" : "est analysée"} à part. Deux variantes ne sont jamais fusionnées.`] : [];
    }
    return groups.sort((a, b) => b.sessions - a.sessions || (a.label < b.label ? -1 : 1));
  }
  function strengthMetrics(group) {
    const ex = (l) => P().exercisesOf(l).get(group.exercise) || null;
    const kg = (v) => `${fr(v, 1)} kg`;
    const list = [{ id: "sessions", label: "Séances avec cet exercice", rule: "Séances du journal où l’exercice a au moins une série mesurée.", provenance: "Journal : séances confirmées", read: () => 1, aggregate: agg.count(), better: null, missing: "" }];
    if (group.loaded) {
      list.push(
        { id: "reference_set", label: "Série de référence", rule: "La série la plus lourde de la période ; à charge égale, celle qui a le plus de répétitions. Aucun 1RM estimé.", provenance: "Charge et répétitions de chaque série", read: (l) => { const e = ex(l); return e && e.loaded ? e.topWeight * 1000 + e.topReps : null; }, aggregate: (vs) => { const b = vs.reduce((m, x) => (!m || x.v > m.v ? x : m), null); const e = ex(b.s); return { value: round(b.v, 4), display: `${fr(e.topWeight, 1)} kg × ${e.topReps}`, from: b.s.id }; }, better: "higher", threshold: P().THRESHOLD.load, missing: "charge non saisie", tieBreak: (c, r) => (Math.floor(c.value / 1000) === Math.floor(r.value / 1000) && c.value !== r.value ? (c.value > r.value ? { direction: "better", significant: true } : { direction: "worse", significant: false }) : null) },
        { id: "top_set", label: "Meilleure série par séance (médiane)", rule: "Charge de la meilleure série de chaque séance, puis la médiane.", provenance: "Charge et répétitions de chaque série", read: (l) => { const e = ex(l); return e && e.loaded ? e.topWeight : null; }, aggregate: agg.median(kg), better: "higher", threshold: P().THRESHOLD.load, missing: "charge non saisie", trend: true },
        { id: "volume", label: "Volume par séance (médiane)", rule: "Somme charge × répétitions des séries de l’exercice dans la séance, puis la médiane.", provenance: "Charge et répétitions de chaque série", read: (l) => { const e = ex(l); return e && e.loaded ? e.volume : null; }, aggregate: agg.median((v) => `${fr(v, 0)} kg`), better: "higher", threshold: P().THRESHOLD.volume, missing: "charge non saisie" },
      );
    } else {
      list.push({ id: "best_set_reps", label: "Meilleure série (répétitions)", rule: "Le plus de répétitions en une série dans la période.", provenance: "Répétitions de chaque série", read: (l) => { const r = exerciseRows(l, group.exercise); return r.length ? Math.max(...r.map((x) => x.reps)) : null; }, aggregate: agg.best("higher", (v) => `${fr(v, 0)} rép.`), better: "higher", threshold: P().THRESHOLD.reps, missing: "répétitions non saisies", trend: true });
    }
    list.push(
      { id: "sets", label: "Séries par séance (médiane)", rule: "Nombre de séries mesurées de l’exercice dans la séance, puis la médiane.", provenance: "Séries saisies", read: (l) => ex(l)?.sets ?? null, aggregate: agg.median((v) => fr(v, 1)), better: null, missing: "séries non saisies" },
      { id: "reps", label: "Répétitions par séance (médiane)", rule: "Somme des répétitions de l’exercice dans la séance, puis la médiane.", provenance: "Répétitions de chaque série", read: (l) => ex(l)?.reps ?? null, aggregate: agg.median((v) => `${fr(v, 0)} rép.`), better: group.loaded ? null : "higher", threshold: P().THRESHOLD.reps, missing: "répétitions non saisies" },
      { id: "rir", label: "RIR (médiane)", rule: "Répétitions en réserve saisies sur les séries, médiane par séance puis sur la période. Repère sans verdict.", provenance: "Champ facultatif RIR de chaque série", read: (l) => median(exerciseRows(l, group.exercise).map((x) => x.rir).filter((x) => x !== null)), aggregate: agg.median((v) => fr(v, 1)), better: null, missing: "RIR non saisi" },
    );
    const trend = list.find((m) => m.trend);
    return { list, series: { metric: trend.id, read: trend.read, format: trend.id === "top_set" ? kg : (v) => `${fr(v, 0)} rép.` } };
  }

  /* ---------- Escalade ---------- */
  const isClimbing = (l) => S()?.formOf(l.sport) === "climbing";
  const triedOf = (x) => String(x.max_tried || x.max_attempted || x.max_attempt || "").trim();
  function climbingGroups(logs, sportFilter, adm) {
    const { pool } = adm || admissible(logs, (l) => isClimbing(l) && (!sportFilter || l.sport === sportFilter));
    const map = new Map();
    let noScale = 0;
    for (const l of pool) {
      const x = extras(l), system = String(x.grade_system || "").trim(), discipline = String(x.climbing_discipline || "").trim();
      if (!system) { noScale++; continue; }
      const id = `climbing:${l.sport}|${system}|${norm(discipline)}`;
      if (!map.has(id)) map.set(id, { id, discipline: "climbing", sport: l.sport, scale: system, climbing: discipline, members: [] });
      map.get(id).members.push(l);
    }
    const groups = [...map.values()];
    const scales = P().SCALES;
    for (const g of groups) {
      g.ordered = scales.includes(g.scale);
      g.label = `${g.scale}${g.climbing ? ` · ${g.climbing}` : " · discipline non renseignée"} · ${S().label(g.sport)}`;
      g.sessions = g.members.length;
      g.criteria = [`Même sport : ${S().label(g.sport)}`, `Échelle : ${g.scale}, sans conversion vers une autre échelle`, g.climbing ? `Discipline : ${g.climbing}` : "Discipline non renseignée : seules les séances sans discipline sont regroupées", "Une cotation seulement tentée n’est jamais comptée comme réussite"];
      const others = groups.filter((o) => o !== g && o.sport === g.sport && o.scale !== g.scale).map((o) => o.scale);
      g.limits = [];
      if (!g.ordered) g.limits.push(`TITAN ne sait pas ordonner les cotations de l’échelle « ${g.scale} » : ni meilleure cotation, ni tableau par niveau, ni conversion. Seuls les essais et réussites sont présentés.`);
      if (others.length) g.limits.push(`${[...new Set(others)].join(", ")} : ${others.length > 1 ? "d’autres échelles, analysées" : "une autre échelle, analysée"} à part. TITAN ne convertit pas les cotations.`);
    }
    groups.noScale = noScale;
    return groups.sort((a, b) => b.ordered - a.ordered || b.sessions - a.sessions || (a.label < b.label ? -1 : 1));
  }
  function climbingMetrics(group) {
    const x = extras;
    const g = (v) => (group.ordered ? I().grade(v, group.scale) : null);
    const list = [
      { id: "sessions", label: "Séances", rule: "Séances du sport dans cette échelle et cette discipline.", provenance: "Journal : séances confirmées", read: () => 1, aggregate: agg.count(), better: null, missing: "" },
      { id: "attempts", label: "Essais", rule: "Somme des essais saisis.", provenance: "Champ « Essais »", read: (l) => (num(x(l).attempts) >= 0 ? num(x(l).attempts) : null), aggregate: agg.sum((v) => fr(v, 0)), better: null, missing: "essais non saisis" },
      { id: "successes", label: "Réussites", rule: "Somme des voies ou blocs réussis saisis.", provenance: "Champ « Réussites »", read: (l) => (num(x(l).successful_routes) >= 0 ? num(x(l).successful_routes) : null), aggregate: agg.sum((v) => fr(v, 0)), better: null, missing: "réussites non saisies" },
      { id: "success_rate", label: "Taux de réussite", rule: "Réussites ÷ essais, sur les seules séances qui ont les deux.", provenance: "Champs « Essais » et « Réussites »", read: (l) => { const a = num(x(l).attempts), s = num(x(l).successful_routes); return a > 0 && s !== null && s >= 0 ? [s, a] : null; }, aggregate: (vs) => { const s = vs.reduce((n, v) => n + v.v[0], 0), a = vs.reduce((n, v) => n + v.v[1], 0); return { value: round(s / a, 4), display: `${fr((s / a) * 100, 0)} % (${s}/${a})` }; }, better: "higher", threshold: P().THRESHOLD.reps, missing: "essais ou réussites non saisis" },
    ];
    if (hasField(group.sport, "flashes")) list.push({ id: "flashes", label: "Flashs", rule: "Somme des flashs saisis.", provenance: `Champ facultatif « ${fieldLabel(group.sport, "flashes")} »`, read: (l) => (num(x(l).flashes) >= 0 ? num(x(l).flashes) : null), aggregate: agg.sum((v) => fr(v, 0)), better: null, missing: "flashs non saisis" });
    if (group.ordered) list.push(
      { id: "best_done", label: "Meilleure réussite", rule: `La plus haute cotation réussie de la période, dans l’échelle ${group.scale}.`, provenance: "Champ « Meilleure réussie »", read: (l) => g(x(l).max_done)?.score ?? null, aggregate: (vs) => { const b = vs.reduce((m, v) => (!m || v.v > m.v ? v : m), null); return { value: b.v, display: g(x(b.s).max_done).label, from: b.s.id }; }, better: "higher", grade: true, missing: "aucune réussite cotée", trend: true },
      { id: "best_tried", label: "Meilleure tentative", rule: "La plus haute cotation tentée de la période. Jamais comptée comme réussite.", provenance: "Champ « Meilleure tentée »", read: (l) => g(triedOf(x(l)))?.score ?? null, aggregate: (vs) => { const b = vs.reduce((m, v) => (!m || v.v > m.v ? v : m), null); return { value: b.v, display: g(triedOf(x(b.s))).label, from: b.s.id }; }, better: null, missing: "aucune tentative cotée" },
    );
    const series = group.ordered
      ? { metric: "best_done", read: (l) => g(x(l).max_done)?.score ?? null, format: (v, l) => g(x(l).max_done).label }
      : { metric: "success_rate", read: (l) => { const a = num(x(l).attempts), s = num(x(l).successful_routes); return a > 0 && s !== null && s >= 0 ? s / a : null; }, format: (v) => `${fr(v * 100, 0)} %` };
    return { list, series };
  }
  function levelsOf(group, sessions) {
    if (!group.ordered) return null;
    const rows = new Map();
    const row = (gr) => { if (!rows.has(gr.score)) rows.set(gr.score, { grade: gr.label, score: gr.score, done: 0, tried: 0, attempts: 0, successes: 0, measured: 0, sessions: [] }); return rows.get(gr.score); };
    for (const l of sessions) {
      const x = extras(l);
      const d = I().grade(x.max_done, group.scale), t = I().grade(triedOf(x), group.scale);
      if (d) {
        const r = row(d);
        r.done++; r.sessions.push(l.id);
        const a = num(x.attempts), s = num(x.successful_routes);
        if (a !== null && s !== null) { r.attempts += a; r.successes += s; r.measured++; }
      }
      if (t && (!d || t.score > d.score)) { const r = row(t); r.tried++; if (!r.sessions.includes(l.id)) r.sessions.push(l.id); }
    }
    return [...rows.values()].sort((a, b) => b.score - a.score);
  }

  /* ---------- The view ---------- */
  const FORMS = {
    endurance: { accept: (sport) => (l) => isDistance(l) && (!sport || l.sport === sport), groups: (logs, sport, adm) => enduranceGroups(logs, sport, adm), metrics: enduranceMetrics },
    strength: { accept: (sport) => (l) => isStrength(l) && (!sport || l.sport === sport), groups: strengthGroups, metrics: strengthMetrics },
    climbing: { accept: (sport) => (l) => isClimbing(l) && (!sport || l.sport === sport), groups: climbingGroups, metrics: climbingMetrics },
  };

  /** Sports of a discipline that have confirmed sessions, the most practised first: [{ sport, label, sessions }]. */
  function sports(logs, discipline) {
    const f = FORMS[discipline];
    if (!f || !S()) return [];
    const { pool } = admissible(logs, f.accept(null));
    const m = new Map();
    for (const l of pool) m.set(l.sport, (m.get(l.sport) || 0) + 1);
    return [...m.entries()].map(([sport, n]) => ({ sport, label: S().label(sport), sessions: n })).sort((a, b) => b.sessions - a.sessions || (a.label < b.label ? -1 : 1));
  }

  /** The groups a discipline offers (plain data). Endurance needs a sport; force and escalade accept one to narrow the list. */
  function groups(logs, discipline, { sport } = {}) {
    const f = FORMS[discipline];
    if (!f || !S() || (discipline === "endurance" && !sport)) return [];
    return f.groups(logs, sport).map(publicGroup);
  }
  const publicGroup = (g) => ({ id: g.id, discipline: g.discipline, sport: g.sport, label: g.label, sessions: g.sessions, criteria: g.criteria, limits: g.limits, ...(g.anchor ? { anchor: g.anchor } : {}), ...(g.scale ? { scale: g.scale, ordered: g.ordered } : {}), ...(g.exercise ? { exercise: g.exercise } : {}) });

  /**
   * view(logs, { discipline, sport, group, now, weeks = 12, reference })
   * reference: { kind: "period" } (default) | { kind: "block", id, title, start, end } (dates YYYY-MM-DD) | { kind: "session", id } | null.
   * Returns plain data: { version, discipline, sport, group, status, current, reference, rows, levels, series, limits, states, signature }.
   */
  function view(logs, opts = {}) {
    const discipline = opts.discipline;
    const f = FORMS[discipline];
    if (!f || !S() || !P()) return null;
    const sport = opts.sport || (discipline === "endurance" ? sports(logs, "endurance")[0]?.sport : null);
    const win = windows(opts);
    const adm = admissible(logs, f.accept(sport), win);
    const all = discipline === "endurance" ? (sport ? f.groups(logs, sport, adm) : []) : f.groups(logs, sport, adm);
    const group = all.find((g) => g.id === opts.group) || all[0] || null;
    const out = { version: VERSION, discipline, label: DISCIPLINES[discipline], sport: group?.sport || sport || null, group: group ? publicGroup(group) : null, groups: all.length, status: "insufficient", current: { label: win.current.label, sessions: [] }, reference: null, rows: [], levels: null, series: [], limits: [], states: adm.states, signature: "" };
    const stateList = Object.keys(STATE_TEXT).filter((s) => adm.states[s]);
    const stateLimit = stateList.length ? `Hors calcul : ${stateList.map((s) => `${adm.states[s]} ${STATE_TEXT[s]}`).join(", ")}. Seules les séances confirmées dans ton compte entrent dans une valeur.` : null;
    if (!group) {
      out.limits.push(opts.group ? "Ce groupe n’existe plus dans ton journal." : `Aucune séance confirmée pour l’analyse ${DISCIPLINES[discipline] ? DISCIPLINES[discipline].toLowerCase() : ""}${sport ? ` en ${S().label(sport).toLowerCase()}` : ""}.`);
      if (discipline === "climbing" && all.noScale) out.limits.push(`${plural(all.noScale, "séance")} sans échelle de cotation renseignée : hors analyse.`);
      if (stateLimit) out.limits.push(stateLimit);
      return out;
    }
    out.limits.push(...group.limits);
    if (discipline === "climbing" && all.noScale) out.limits.push(`${plural(all.noScale, "séance")} sans échelle de cotation renseignée : hors analyse.`);
    if (discipline === "climbing" && group.ordered) out.limits.push("Par niveau : TITAN connaît la meilleure réussite et la meilleure tentative de chaque séance, pas la cotation de chaque essai. Les essais et réussites d’un niveau sont ceux des séances dont c’est la meilleure réussite.");

    const cur = group.members.filter((l) => inWindow(win.current, l)).sort((a, b) => time(a) - time(b));
    let ref = null;
    const r = win.reference;
    if (r && r.kind === "session") {
      const target = (logs || []).find((l) => l && (key(l) === r.id || String(l.id) === r.id));
      const reason = target ? P().stateReason(target) : null;
      out.reference = { kind: "session", label: target ? `Séance du ${dateText(time(target), win.now)}` : "Séance introuvable", sessions: [], status: "ok" };
      if (!target) { out.reference.status = "missing"; out.reference.note = "Cette séance n’est plus dans ton journal."; }
      else if (reason) { out.reference.status = "excluded"; out.reference.note = `Cette séance est ${STATE_TEXT[reason]} : elle ne sert pas de référence.`; }
      else if (!group.members.includes(target)) {
        out.reference.status = "incomparable";
        out.reference.note = incomparable(discipline, group, target, win.now);
      } else ref = [target];
    } else if (r) {
      ref = group.members.filter((l) => inWindow(r, l)).sort((a, b) => time(a) - time(b));
      out.reference = { kind: r.kind, label: r.label, sessions: [], status: ref.length ? "ok" : "empty", ...(r.id ? { id: r.id } : {}) };
      if (!ref.length) out.reference.note = "Aucune séance du groupe dans cette référence : rien à mettre en face.";
      const overlap = ref.filter((l) => cur.includes(l)).length;
      if (overlap) out.limits.push(`La référence et la période se chevauchent : ${plural(overlap, "séance")} ${overlap > 1 ? "sont" : "est"} dans les deux.`);
      if (!ref.length) ref = null;
    }
    out.current.sessions = cur.map((l) => l.id);
    if (out.reference) out.reference.sessions = (ref || []).map((l) => l.id);

    const { list, series } = f.metrics(group);
    const needed = r?.kind === "session" ? 1 : MIN_SESSIONS;
    for (const m of list) {
      const c = sideOf(cur, m);
      const rs = ref ? sideOf(ref, m) : null;
      const row = { id: m.id, label: m.label, rule: m.rule, provenance: m.provenance, current: c, reference: rs, ...directionOf(m, c, rs, needed) };
      if (m.better) row.better = m.better;
      if (m.id !== "sessions" && cur.length && c.measured === 0) row.status = "absent";
      else if (m.id !== "sessions" && c.measured < cur.length) row.status = "partial";
      else row.status = "measured";
      out.rows.push(row);
    }
    if (discipline === "climbing") out.levels = group.ordered ? { current: levelsOf(group, cur), reference: ref ? levelsOf(group, ref) : null } : null;

    // The series: one point per session, a session without the value stays a gap (never interpolated).
    const points = [...(ref || []).filter((l) => !cur.includes(l)).map((l) => ({ l, side: "reference" })), ...cur.map((l) => ({ l, side: ref?.includes(l) ? "both" : "current" }))].sort((a, b) => time(a.l) - time(b.l));
    out.series = points.map(({ l, side }) => {
      const v = series.read(l);
      const value = v === null || v === undefined ? null : round(v, 4);
      return { id: l.id, date: l.date, side, value, display: value === null ? "non mesurée" : series.format(v, l) };
    });
    out.seriesMetric = series.metric;

    // Status: a side too short gives its values, never a trend; a value present on part of the sessions is said partial.
    const absent = out.rows.filter((x) => x.status === "absent");
    const partial = out.rows.filter((x) => x.status === "partial");
    if (cur.length < (r?.kind === "session" ? 1 : MIN_SESSIONS)) {
      out.status = "insufficient";
      out.limits.unshift(cur.length
        ? `Historique trop court : ${plural(cur.length, "séance")} du groupe dans la période, il en faut ${MIN_SESSIONS} pour une tendance. Les mesures de ${cur.length > 1 ? "ces séances" : "cette séance"} sont présentées sans verdict.`
        : "Aucune séance du groupe dans la période : rien à analyser pour l’instant.");
    } else if (out.reference && (out.reference.status !== "ok" || (r?.kind !== "session" && ref.length < MIN_SESSIONS))) {
      out.status = "limited";
      if (out.reference.status === "ok") out.limits.push(`Référence trop courte : ${plural(ref.length, "séance")}, il en faut ${MIN_SESSIONS} pour un verdict. Les valeurs sont présentées côte à côte, sans verdict.`);
    } else out.status = absent.length || partial.length ? "limited" : "ok";
    if (absent.length) out.limits.push(`Non mesuré sur la période : ${absent.map((x) => lower(x.label.replace(/ \(médiane\)$/, ""))).join(", ")}. Aucune valeur n’est estimée.`);
    for (const x of partial) out.limits.push(`${x.label.replace(/ \(médiane\)$/, "")} : établi sur ${x.current.measured} des ${x.current.total} séances (${x.current.missing}).`);
    if (discipline === "endurance") {
      const est = cur.filter((l) => !(declared(l) > 0)).length;
      if (est) out.limits.push(`${plural(est, "sortie")} sans durée saisie : TITAN estime leur durée pour l’XP, une estimation n’entre jamais dans une vitesse.`);
    }
    if (stateLimit) out.limits.push(stateLimit);
    if (adm.truncated) out.limits.push(`Seules les ${MAX_POOL} dernières séances sont examinées.`);
    out.signature = `${group.id}@${VERSION}:${cur.map(key).join(",")}|${(ref || []).map(key).join(",")}`;
    return out;
  }

  function incomparable(discipline, group, l, now) {
    const when = dateText(time(l), now);
    if (l.sport !== group.sport) return `La séance du ${when} est en ${S().label(l.sport).toLowerCase()} : un autre sport n’est pas mis en face.`;
    if (discipline === "strength") {
      const names = [...P().exercisesOf(l).values()];
      const same = names.filter((e) => norm(e.name) === norm(group.name));
      if (same.length) return `La séance du ${when} a ${same.map((e) => `${String(e.name).trim()} (${variantText(e) || "sans variante"})`).join(", ")}, pas ${group.name}${group.variant ? ` (${group.variant})` : " sans variante"} : deux variantes ne sont jamais fusionnées.`;
      return `La séance du ${when} n’a pas de série mesurée de ${group.name}.`;
    }
    if (discipline === "climbing") {
      const x = extras(l);
      if (String(x.grade_system || "").trim() !== group.scale) return `La séance du ${when} est cotée en ${String(x.grade_system || "").trim() || "échelle non renseignée"} : TITAN ne convertit pas les cotations.`;
      return `La séance du ${when} est en ${String(x.climbing_discipline || "").trim() || "discipline non renseignée"}, pas en ${group.climbing || "discipline non renseignée"}.`;
    }
    const route = routeOf(l);
    if (norm(route) !== norm(group.route)) return `La sortie du ${when} est sur un autre parcours (${route || "non renseigné"}) : elle n’est pas comparable à ce groupe.`;
    return `La sortie du ${when} (${fr(num(l.val), 1)} km) n’entre pas dans ce groupe : distance ou dénivelé trop différents.`;
  }

  /* ---------- Plain-text reading (the same sentences on the website and Android) ---------- */
  const DIRECTION = { better: "en progrès", worse: "en retrait", stable: "stable", neutral: "" };
  function reading(v) {
    if (!v) return [];
    if (!v.group) return [...v.limits];
    const ref = v.reference ? (v.reference.status === "ok" || v.reference.status === "empty" ? ` ; ${v.reference.label} : ${plural(v.reference.sessions.length, "séance")}` : ` ; référence : ${v.reference.label}, écartée`) : "";
    const out = [`${v.group.label}. ${v.current.label} : ${plural(v.current.sessions.length, "séance")}${ref}.`];
    if (v.reference?.note) out.push(v.reference.note);
    for (const r of v.rows) {
      if (r.id === "sessions") continue;
      if (r.current.measured === 0 && !(r.reference && r.reference.measured)) continue;
      const side = r.reference ? ` contre ${r.reference.display}` : "";
      const dir = DIRECTION[r.direction] ? ` (${DIRECTION[r.direction]})` : r.reason === "short" ? " (sans verdict : trop peu de séances)" : "";
      out.push(`${r.label.replace(/ \(médiane\)$/, "")} : ${r.current.display}${side}${dir}, ${r.current.measured}/${r.current.total} séance${r.current.total > 1 ? "s" : ""} mesurée${r.current.measured > 1 ? "s" : ""}.`);
    }
    return [...out, ...v.limits];
  }

  const api = { VERSION, MIN_SESSIONS, MIN_SPLITS, DISCIPLINES, DIRECTION, sports, groups, view, reading, dateText };
  root.TitanDisciplineAnalysis = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
