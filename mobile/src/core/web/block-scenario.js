/* V1.7.6 — Scénarios multisports: two private variants of the programme of a few weeks, compared side by side on what the plan itself
   gives (time per sport, free days, overlaps, milestones that move), then one of them applied from an explicit Monday through a
   preview, and undone. The same rules and words on the website and in the Android app (copied unchanged by
   mobile/scripts/sync-web-core.mjs). Pure: it reads a schedule, the cadence pauses and the journal, and returns new values; it never
   changes a session, never estimates a fitness, a fatigue or a performance.

   Storage. schedule.scenarios { "<id>": scenario } in game_state.user.schedule (the key the server already copies, like V1.7.2 to
   V1.7.4). A scenario is a draft: week-plan.js never reads it, so editing it changes nothing of the active programme.
   - scenario  { v, id, at, created, title, base, start, count, availability, variants: { a, b }, milestones, applied, log, discarded }
   - base      the V1.7.4 block that holds the weeks compared (schedule.blocks), or null when the weeks follow the typical week
   - variant   { key, name, at, weeks: [{ days }], place: { "<milestone id>": week index | null } }
   - availability { "<Monday>": { days: [7 booleans, true = available], pause, at } } — what the athlete says about a week
   - applied   { at, variant, name, from, block, created, prior, written, stats, undone: { at, from } | null }
   - log       { "<at>#<kind>": { at, kind, variant, from, block } } — every application and undo, for the bilan
   Applying writes the chosen variant into the block (a V1.7.4 layout from the chosen Monday, origin « scenario », with an entry of the
   block's change log), or creates a block when the weeks followed the typical week. Undoing writes back the layout in force before,
   from the first week that has not begun: weeks that have begun meanwhile keep the scenario (they were lived), sessions stay. */
(function (root) {
  "use strict";

  const VERSION = 1;
  const MIN_WEEKS = 2;
  const MAX_WEEKS = 8;
  const MAX_SCENARIOS = 6;
  const WINDOW = 4;
  const KEYS = ["a", "b"];
  const LETTER = { a: "A", b: "B" };
  const HYPOTHESES = Object.freeze([
    "Le temps par sport additionne les durées prévues que tu as saisies ; un créneau sans durée est compté à part, jamais estimé.",
    "Un jour libre est un jour sans créneau dans le plan.",
    "Un chevauchement est un créneau prévu un jour que tu as dit indisponible, dans une semaine en pause, ou un jour où une décision déjà prise sur ton programme place une autre séance.",
    "Un jalon déplacé change de semaine par rapport à ton programme actif.",
    `Les observations passées viennent de tes séances comptées des ${WINDOW} dernières semaines closes : elles décrivent, elles ne prédisent rien.`,
    "Aucune estimation de forme, de fatigue ou de performance n’est faite.",
  ]);
  const RULES = Object.freeze({
    draft: "Une variante est un brouillon privé : la modifier ne change pas ton programme actif.",
    apply: "Le scénario choisi s’applique à partir du lundi que tu choisis, jamais à une semaine commencée.",
    undo: "Annuler remet le programme d’avant à partir de la première semaine qui n’a pas commencé ; tes séances restent au journal.",
  });

  const WP = () => { const w = root.TitanWeekPlan; if (!w) throw new Error("SCENARIO_NEEDS_WEEK_PLAN"); return w; };
  const TB = () => { const t = root.TitanTrainingBlock; if (!t) throw new Error("SCENARIO_NEEDS_TRAINING_BLOCK"); return t; };
  const isKey = (k) => typeof k === "string" && /^\d{4}-\d{2}-\d{2}$/.test(k);
  const clone = (v) => JSON.parse(JSON.stringify(v ?? {}));
  const str = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const fail = (code) => { throw new Error(code); };
  const p = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  const known = (sport) => typeof sport === "string" && !!sport && (!root.SPORTS_CONFIG || !!root.SPORTS_CONFIG[sport] || !!root.TitanSports?.conf?.(sport));
  const keyed = (o) => (o && typeof o === "object" && !Array.isArray(o) ? o : {});
  const EMPTY = () => [null, null, null, null, null, null, null];

  const scenariosOf = (schedule) => keyed(schedule?.scenarios);
  const mondays = (sc) => Array.from({ length: sc.count }, (_, i) => WP().addDays(sc.start, 7 * i));
  const lastMonday = (sc) => WP().addDays(sc.start, 7 * (sc.count - 1));
  const slot = (d) => (d ? { sport: d.sport, minutes: d.minutes ?? null, note: d.note || "" } : null);
  const days7 = (days) => { const d = WP().storedDays(days); if (!d) fail("SCENARIO_BAD_DAYS"); return d.map(slot); };
  const removedBlock = (b) => { const e = Object.values(keyed(b?.layouts)).filter((l) => l && typeof l === "object").sort((x, y) => (String(x.at || "") < String(y.at || "") ? -1 : 1)); return !!b?.removed || (e.length > 0 && !!e[e.length - 1].removed); };

  function find(schedule, id) {
    const sc = scenariosOf(schedule)[id];
    if (!sc || sc.discarded) fail("SCENARIO_NOT_FOUND");
    return sc;
  }

  /** The V1.7.4 block that holds every week of the period, null when none does; a block that holds only some of them is refused. */
  function baseOf(schedule, start, count) {
    const W = WP();
    const ids = new Set();
    for (let i = 0; i < count; i++) {
      const b = W.blockAt(schedule, W.addDays(start, 7 * i));
      ids.add(b && !b.removed ? b.id : null);
    }
    if (ids.size > 1) fail("SCENARIO_OUTSIDE_BLOCK");
    return [...ids][0] || null;
  }

  /** Where the milestones of the base block sit in its layout in force: { id: Monday }. */
  function blockPlaces(schedule, base) {
    const out = {};
    const b = base ? schedule?.blocks?.[base] : null;
    const l = b ? TB().latest(b) : null;
    (l?.weeks || []).forEach((w, i) => (w.milestones || []).forEach((m) => { out[m] = WP().addDays(l.start, 7 * i); }));
    return out;
  }

  /* ---------- Creating and editing the drafts (the active programme is never written here) ---------- */

  /** Two variants that both start as the active programme of the period. input: { id, title, start, count, names: { a, b } }. */
  function create(schedule, input, { today, at = new Date().toISOString() } = {}) {
    const W = WP();
    if (!isKey(today)) fail("SCENARIO_TODAY_REQUIRED");
    const open = TB().firstOpen(schedule, today);
    const start = isKey(input?.start) ? input.start : open;
    if (W.weekOf(start) !== start) fail("SCENARIO_BAD_START");
    if (start < open) fail("SCENARIO_WEEK_STARTED");
    const count = Math.round(Number(input?.count ?? 4));
    if (!(count >= MIN_WEEKS && count <= MAX_WEEKS)) fail("SCENARIO_BAD_LENGTH");
    const title = str(input?.title, 80);
    if (!title) fail("SCENARIO_TITLE_REQUIRED");
    const live = Object.values(scenariosOf(schedule)).filter((s) => s && !s.discarded);
    if (live.length >= MAX_SCENARIOS) fail("SCENARIO_LIMIT");
    const id = str(input.id, 40) || `s${String(at).replace(/\D/g, "").slice(2, 17)}`;
    if (scenariosOf(schedule)[id]) fail("SCENARIO_EXISTS");
    const base = baseOf(schedule, start, count);
    const current = W.weekOf(today);
    const sc = { v: VERSION, id, at, created: at, title, base, start, count, availability: {}, variants: {}, milestones: {}, applied: null, log: {}, discarded: null };
    const ms = mondays(sc);
    const active = ms.map((m) => W.reference(schedule, m, { current }).days.map(slot));
    const places = blockPlaces(schedule, base);
    const blk = base ? schedule.blocks[base] : null;
    const place = {};
    for (const [mid, monday] of Object.entries(places)) {
      const k = ms.indexOf(monday);
      if (k < 0) continue;
      const m = blk.milestones?.[mid];
      if (!m) continue;
      sc.milestones[mid] = { id: mid, title: m.title, kind: m.kind, sport: m.sport || null, metric: m.metric || null, target: m.target ?? null, source: "block" };
      place[mid] = k;
    }
    for (const k of KEYS) sc.variants[k] = { key: k, name: str(input?.names?.[k], 40) || `Variante ${LETTER[k]}`, at, weeks: active.map((d) => ({ days: clone(d) })), place: { ...place } };
    const next = clone(schedule);
    next.scenarios = { ...scenariosOf(next), [id]: sc };
    return { schedule: prune(next, today), scenario: sc };
  }

  function edit(schedule, id, fn, { today, at = new Date().toISOString() } = {}) {
    if (!isKey(today)) fail("SCENARIO_TODAY_REQUIRED");
    const next = clone(schedule);
    const sc = find(next, id);
    fn(sc, at);
    sc.at = at;
    return { schedule: next, scenario: sc };
  }
  const variantOf = (sc, key) => { if (!KEYS.includes(key)) fail("SCENARIO_BAD_VARIANT"); return sc.variants[key]; };
  const weekIndexes = (sc, week) => (week === "all" ? mondays(sc).map((_, i) => i) : (() => { const i = Math.round(Number(week)); if (!(i >= 0 && i < sc.count)) fail("SCENARIO_BAD_WEEK"); return [i]; })());

  /** One day of one week (or of every week: week « all ») of a variant. value: { sport, minutes, note } or null (a free day). */
  const setDay = (schedule, id, { variant, week, day, value }, opts) => edit(schedule, id, (sc, at) => {
    const v = variantOf(sc, variant);
    const j = Math.round(Number(day));
    if (!(j >= 0 && j < 7)) fail("SCENARIO_BAD_DAY");
    if (value && !known(value.sport)) fail("SCENARIO_BAD_DAY");
    const m = Number(value?.minutes);
    const s = value ? { sport: value.sport, minutes: m > 0 && m <= 600 ? Math.round(m) : null, note: str(value.note, 80) } : null;
    for (const i of weekIndexes(sc, week)) { const d = v.weeks[i].days.slice(); d[j] = s; v.weeks[i] = { ...v.weeks[i], days: d }; }
    v.at = at;
  }, opts);

  const rename = (schedule, id, { variant, name }, opts) => edit(schedule, id, (sc, at) => { const v = variantOf(sc, variant); const n = str(name, 40); if (!n) fail("SCENARIO_TITLE_REQUIRED"); v.name = n; v.at = at; }, opts);

  /** Copy the weeks of one variant onto the other (to start the second from the first). */
  const copyVariant = (schedule, id, { from, to }, opts) => edit(schedule, id, (sc, at) => {
    const a = variantOf(sc, from), b = variantOf(sc, to);
    if (from === to) fail("SCENARIO_BAD_VARIANT");
    sc.variants[to] = { ...b, weeks: clone(a.weeks), place: { ...a.place }, at };
  }, opts);

  /** Put a milestone on another week of a variant (index), or take it out of the variant (null). */
  const placeMilestone = (schedule, id, { variant, milestone, week }, opts) => edit(schedule, id, (sc, at) => {
    const v = variantOf(sc, variant);
    if (!sc.milestones[milestone]) fail("SCENARIO_BAD_MILESTONE");
    if (week === null) v.place = { ...v.place, [milestone]: null };
    else { const [i] = weekIndexes(sc, week); v.place = { ...v.place, [milestone]: i }; }
    v.at = at;
  }, opts);

  /** A milestone the athlete adds to the comparison (a real measure or a declared action), placed in the variants given. */
  const addMilestone = (schedule, id, { newId, title, kind, sport, metric, target, week, variants = KEYS }, opts) => edit(schedule, id, (sc, at) => {
    const t = str(title, 80);
    if (!t) fail("SCENARIO_BAD_MILESTONE");
    const [i] = weekIndexes(sc, week);
    const k = kind === "declared" ? "declared" : "measure";
    const def = { kind: k, sport: null, metric: null, target: null };
    if (k === "measure") {
      if (!["distance", "duration", "elevation", "sessions"].includes(metric) || !(Number(target) > 0) || !known(sport)) fail("SCENARIO_BAD_MILESTONE");
      Object.assign(def, { sport, metric, target: metric === "distance" ? Math.round(Number(target) * 10) / 10 : Math.round(Number(target)) });
    }
    const mid = str(newId, 40) || `sm${String(at).replace(/\D/g, "").slice(2, 14)}${Object.keys(sc.milestones).length}`;
    if (Object.keys(sc.milestones).length >= 8) fail("SCENARIO_MILESTONE_LIMIT");
    sc.milestones[mid] = { id: mid, title: t, ...def, source: "scenario" };
    for (const key of KEYS) { const v = sc.variants[key]; v.place = { ...v.place, [mid]: variants.includes(key) ? i : null }; v.at = at; }
  }, opts);

  /** What the athlete says about one week: the days available (7 booleans) and whether it is a pause. */
  const setAvailability = (schedule, id, { week, days, pause = false }, opts) => edit(schedule, id, (sc, at) => {
    const [i] = weekIndexes(sc, week);
    const m = mondays(sc)[i];
    sc.availability = { ...keyed(sc.availability) };
    if (!pause && (!Array.isArray(days) || days.every(Boolean))) { sc.availability[m] = { days: [true, true, true, true, true, true, true], pause: false, at, cleared: true }; return; }
    const d = Array.isArray(days) && days.length === 7 ? days.map(Boolean) : [true, true, true, true, true, true, true];
    sc.availability[m] = { days: pause ? [false, false, false, false, false, false, false] : d, pause: !!pause, at };
  }, opts);

  /** Make a week of a variant fit what the athlete said: its slots on unavailable days (all of them in a pause) become free days. */
  const fit = (schedule, id, { variant, week }, opts) => edit(schedule, id, (sc, at) => {
    const v = variantOf(sc, variant);
    for (const i of weekIndexes(sc, week)) {
      const a = availabilityOf(sc, mondays(sc)[i]);
      if (!a) continue;
      v.weeks[i] = { ...v.weeks[i], days: v.weeks[i].days.map((d, j) => (d && !a.days[j] ? null : d)) };
    }
    v.at = at;
  }, opts);

  /** Put the draft away. Its record stays (two devices merge it), it is no longer listed. */
  const discard = (schedule, id, opts) => edit(schedule, id, (sc, at) => { if (sc.applied && !sc.applied.undone) fail("SCENARIO_APPLIED"); sc.discarded = at; }, opts);

  const availabilityOf = (sc, monday) => { const a = keyed(sc.availability)[monday]; return a && !a.cleared && Array.isArray(a.days) && a.days.length === 7 ? a : null; };

  /* ---------- The comparison: only what the plan itself gives ---------- */

  const minutesOf = (log) => { const d = keyed(log?.details); const m = Number(d.duration ?? d.minutes ?? (log?.unit === "min" ? log.val : NaN)); return m > 0 ? Math.round(m) : null; };

  /** What was done over the last WINDOW closed weeks: sessions and recorded minutes per sport (counted sessions only). */
  function observed(logs, { today, zone }) {
    const W = WP();
    const to = W.addDays(W.weekOf(today), -1);
    const from = W.addDays(W.weekOf(today), -7 * WINDOW);
    const out = { from, to, weeks: WINDOW, sports: {}, sessions: 0, minutes: 0, unknown: 0 };
    for (const l of logs || []) {
      if (!l || !W.counted(l)) continue;
      const day = W.sessionDay(l, zone);
      if (!day || day < from || day > to) continue;
      const s = (out.sports[l.sport] = out.sports[l.sport] || { sessions: 0, minutes: 0, unknown: 0 });
      const m = minutesOf(l);
      s.sessions++; out.sessions++;
      if (m) { s.minutes += m; out.minutes += m; } else { s.unknown++; out.unknown++; }
    }
    return out;
  }

  /** The figures of one plan (seven days a week over the period). */
  function stats(schedule, sc, weeks, place, { pauses = [] }) {
    const W = WP();
    const ms = mondays(sc);
    const out = { sports: {}, minutes: 0, sessions: 0, unknown: 0, free: 0, weeks: [], conflicts: [], exceptions: [] };
    weeks.forEach((days, i) => {
      const m = ms[i];
      const a = availabilityOf(sc, m);
      const cadence = (pauses || []).includes(m);
      const wk = { week: m, minutes: 0, sessions: 0, unknown: 0, free: 0, days: days.map(slot) };
      days.forEach((d, j) => {
        if (!d) { wk.free++; return; }
        const s = (out.sports[d.sport] = out.sports[d.sport] || { minutes: 0, sessions: 0, unknown: 0 });
        s.sessions++; wk.sessions++;
        if (d.minutes) { s.minutes += d.minutes; wk.minutes += d.minutes; } else { s.unknown++; wk.unknown++; }
        if (a?.pause) out.conflicts.push({ week: m, day: j, sport: d.sport, kind: "pause" });
        else if (a && !a.days[j]) out.conflicts.push({ week: m, day: j, sport: d.sport, kind: "unavailable" });
        else if (cadence) out.conflicts.push({ week: m, day: j, sport: d.sport, kind: "cadence" });
      });
      // The decisions already taken on that week (V1.7.2 moves and replacements, V1.7.3 adjustments) stay valid once a plan applies.
      for (const [occ, dec] of Object.entries(keyed(schedule?.weeks?.[m]?.occ))) {
        if (!dec || dec.kind === "reset" || dec.kind === "link") continue;
        const o = Number(String(occ).split("/")[1]);
        const own = days[o] || null;
        const state = !own ? "gone" : "kept";
        out.exceptions.push({ week: m, occurrence: occ, kind: dec.kind, state, sport: own ? own.sport : null, ...(dec.day ? { day: W.dayIndex(dec.day) } : {}), ...(typeof dec.origin === "string" ? { origin: dec.origin } : {}) });
        if (own && (dec.kind === "move" || dec.kind === "replace") && isKey(dec.day)) {
          const t = W.dayIndex(dec.day);
          if (t !== o && days[t]) out.conflicts.push({ week: m, day: t, sport: days[t].sport, kind: "decision", occurrence: occ, moved: dec.kind === "replace" ? dec.sport : own.sport });
        }
      }
      out.minutes += wk.minutes; out.sessions += wk.sessions; out.unknown += wk.unknown; out.free += wk.free;
      out.weeks.push(wk);
    });
    out.milestones = place;
    return out;
  }

  /** The two variants and the active programme over the period, side by side. options: { today, zone, pauses }. */
  function compare(schedule, logs, id, { today, zone, pauses = [] } = {}) {
    const W = WP();
    if (!isKey(today)) fail("SCENARIO_TODAY_REQUIRED");
    const sc = find(schedule, id);
    const ms = mondays(sc);
    const current = W.weekOf(today);
    const activeWeeks = ms.map((m) => W.reference(schedule, m, { current }).days.map(slot));
    const places = blockPlaces(schedule, sc.base);
    const where = (k) => (k === null || k === undefined ? null : ms[k] || null);
    const activePlace = {};
    for (const mid of Object.keys(sc.milestones)) activePlace[mid] = sc.milestones[mid].source === "block" ? places[mid] || null : null;
    const plans = { active: stats(schedule, sc, activeWeeks, activePlace, { pauses }) };
    for (const k of KEYS) {
      const v = sc.variants[k];
      const place = {};
      for (const mid of Object.keys(sc.milestones)) place[mid] = where(v.place?.[mid]);
      plans[k] = stats(schedule, sc, v.weeks.map((w) => w.days.map(slot)), place, { pauses });
      plans[k].name = v.name;
      plans[k].same = JSON.stringify(plans[k].weeks.map((w) => w.days)) === JSON.stringify(plans.active.weeks.map((w) => w.days)) && Object.keys(place).every((mid) => place[mid] === activePlace[mid]);
    }
    const goal = sc.base ? schedule.blocks?.[sc.base]?.goal || null : null;
    const milestones = Object.values(sc.milestones).map((m) => ({
      id: m.id, title: m.title, kind: m.kind, sport: m.sport, metric: m.metric, target: m.target, source: m.source,
      active: activePlace[m.id], a: plans.a.milestones[m.id], b: plans.b.milestones[m.id],
      moved: { a: plans.a.milestones[m.id] !== activePlace[m.id], b: plans.b.milestones[m.id] !== activePlace[m.id] },
      late: { a: !!(goal?.date && plans.a.milestones[m.id] && plans.a.milestones[m.id] > goal.date), b: !!(goal?.date && plans.b.milestones[m.id] && plans.b.milestones[m.id] > goal.date) },
    }));
    const sports = [...new Set(["active", ...KEYS].flatMap((k) => Object.keys(plans[k].sports)))].sort();
    const val = (k, s) => plans[k].sports[s] || { minutes: 0, sessions: 0, unknown: 0 };
    const rows = sports.map((s) => {
      const a = val("a", s), b = val("b", s), x = val("active", s);
      return { sport: s, active: x, a, b, delta: a.unknown || b.unknown ? null : b.minutes - a.minutes, sessionsDelta: b.sessions - a.sessions };
    });
    const fields = [];
    for (const k of KEYS) if (plans[k].unknown) fields.push({ variant: k, kind: "minutes", count: plans[k].unknown });
    if (!Object.keys(keyed(sc.availability)).some((m) => availabilityOf(sc, m))) fields.push({ variant: null, kind: "availability", count: 0 });
    return {
      version: VERSION, id: sc.id, title: sc.title, base: sc.base, baseTitle: sc.base ? schedule.blocks?.[sc.base]?.title || null : null, start: sc.start, end: W.addDays(lastMonday(sc), 6), count: sc.count, weeks: ms,
      open: TB().firstOpen(schedule, today),
      availability: ms.map((m) => { const a = availabilityOf(sc, m); return a ? { week: m, pause: !!a.pause, days: a.days } : { week: m, pause: false, days: null }; }),
      plans, rows, milestones, goal: goal ? { title: goal.title, date: goal.date || null } : null,
      free: { active: plans.active.free, a: plans.a.free, b: plans.b.free, delta: plans.b.free - plans.a.free },
      conflicts: { active: plans.active.conflicts.length, a: plans.a.conflicts.length, b: plans.b.conflicts.length },
      moved: { a: milestones.filter((m) => m.moved.a).length, b: milestones.filter((m) => m.moved.b).length },
      observed: observed(logs, { today, zone }),
      fields,
      hypotheses: HYPOTHESES.slice(),
      applied: sc.applied ? clone(sc.applied) : null,
    };
  }

  /* ---------- Applying a variant, and undoing it ---------- */

  const calendar = (schedule, ms, today) => { const W = WP(); const current = W.weekOf(today); return ms.map((m) => W.reference(schedule, m, { current }).days.map(slot)); };
  function changesOf(before, after, ms, from) {
    const W = WP();
    const weeks = [], occurrences = [];
    ms.forEach((m, i) => {
      const a = before[i], b = after[i];
      const ch = [];
      for (let j = 0; j < 7; j++) {
        const x = a[j], y = b[j];
        if (JSON.stringify(x) === JSON.stringify(y)) continue;
        const change = !x ? "added" : !y ? "removed" : x.sport !== y.sport ? "sport" : "minutes";
        const c = { index: j, before: x ? { sport: x.sport, minutes: x.minutes } : null, after: y ? { sport: y.sport, minutes: y.minutes } : null, change };
        ch.push(c);
        occurrences.push({ id: `${m}/${j}`, week: m, day: W.addDays(m, j), ...c });
      }
      weeks.push({ week: m, applies: m >= from, changed: ch.length > 0, before: a, after: b, changes: ch });
    });
    return { weeks, occurrences };
  }
  const blockLabels = (schedule, blockId, ms) => { const W = WP(); return ms.map((m) => { const b = W.blockAt(schedule, m); if (!b || b.removed || b.id !== blockId) return null; const l = TB().latest(schedule.blocks[b.id]); return TB().weekLabel(l?.weeks?.[b.index], b.index); }); };

  function preview(schedule, next, sc, kind, { from, today, logs = [], zone, variant, name, block }) {
    const W = WP();
    const ms = mondays(sc);
    const current = W.weekOf(today);
    const before = calendar(schedule, ms, today), after = calendar(next, ms, today);
    const { weeks, occurrences } = changesOf(before, after, ms, from);
    const lb = block ? blockLabels(schedule, block, ms) : ms.map(() => null), la = block ? blockLabels(next, block, ms) : ms.map(() => null);
    weeks.forEach((w, i) => { w.state = w.week < current ? "closed" : w.week === current ? "current" : "upcoming"; w.label = { before: lb[i], after: la[i] }; });
    const exceptions = [];
    for (const m of ms.filter((x) => x >= from)) for (const [occ, dec] of Object.entries(keyed(schedule?.weeks?.[m]?.occ))) {
      if (!dec || dec.kind === "reset") continue;
      const i = ms.indexOf(m), o = Number(occ.split("/")[1]);
      const x = before[i][o], y = after[i][o];
      const t = (dec.kind === "move" || dec.kind === "replace") && isKey(dec.day) ? W.dayIndex(dec.day) : null;
      exceptions.push({ week: m, occurrence: occ, kind: dec.kind, state: !y ? "gone" : x && x.sport === y.sport ? "kept" : "changed", overlap: !!(y && t !== null && t !== o && after[i][t]) });
    }
    const inPeriod = (logs || []).filter((l) => l && W.counted(l)).filter((l) => { const d = W.sessionDay(l, zone); return d && d >= sc.start && d <= W.addDays(lastMonday(sc), 6); });
    return {
      kind, scenario: sc.id, variant: variant || null, name: name || null, from, weeks, occurrences, exceptions,
      kept: weeks.filter((w) => !w.applies).length,
      lived: kind === "undo" ? weeks.filter((w) => w.state !== "upcoming" && w.week >= (sc.applied?.from || from)).map((w) => w.week) : [],
      sessions: { journal: (logs || []).filter((l) => l && W.counted(l)).length, period: inPeriod.length },
    };
  }

  /** Apply variant `variant` from Monday `from`. Returns { schedule, scenario, preview } — new values; nothing is written before the
      athlete confirms (the preview is this very result). */
  function apply(schedule, logs, id, { variant, from }, { today, at = new Date().toISOString(), zone, pauses = [] } = {}) {
    const W = WP(), B = TB();
    if (!isKey(today)) fail("SCENARIO_TODAY_REQUIRED");
    const sc0 = find(schedule, id);
    const v = variantOf(sc0, variant);
    if (sc0.applied && !sc0.applied.undone) fail("SCENARIO_ALREADY_APPLIED");
    if (!isKey(from) || W.weekOf(from) !== from || from < sc0.start || from > lastMonday(sc0)) fail("SCENARIO_BAD_FROM");
    if (from < B.firstOpen(schedule, today)) fail("SCENARIO_WEEK_STARTED");
    if (baseOf(schedule, sc0.start, sc0.count) !== sc0.base) fail("SCENARIO_BASE_CHANGED");
    const cmp = compare(schedule, logs, id, { today, zone, pauses });
    const next = clone(schedule);
    const sc = next.scenarios[id];
    const ms = mondays(sc);
    const k0 = ms.indexOf(from);
    const letter = LETTER[variant];
    const skipped = [];
    let blockId, created = false, prior = null;
    next.blocks = keyed(next.blocks);
    if (sc.base) {
      const block = next.blocks[sc.base];
      const lay = B.latest(block);
      prior = clone(lay);
      const i0 = W.daysBetween(lay.start, sc.start) / 7;
      const weeks = clone(lay.weeks);
      for (let k = k0; k < sc.count; k++) {
        const w = weeks[i0 + k];
        const { light: _l, of: _o, ...rest } = w;
        weeks[i0 + k] = { ...rest, kind: "plan", n: w.kind === "plan" || w.kind === "copy" ? w.n || i0 + k + 1 : i0 + k + 1, days: clone(v.weeks[k].days), scenario: letter };
      }
      for (const [mid, m] of Object.entries(sc.milestones)) {
        const target = v.place?.[mid];
        const cur = weeks.findIndex((w) => (w.milestones || []).includes(mid));
        const curK = cur >= 0 ? cur - i0 : null;
        if (m.source === "block") {
          if (target === undefined || target === curK) continue;
          if ((curK !== null && curK < k0) || (target !== null && target < k0)) { skipped.push({ id: mid, title: m.title, reason: "before" }); continue; }
          const def = block.milestones?.[mid];
          if (def?.kind === "measure" && cur >= 0 && B.evaluate(def, logs, lay.start, W.addDays(lay.start, 7 * cur + 6), zone).reached) { skipped.push({ id: mid, title: m.title, reason: "reached" }); continue; }
          if (cur >= 0) weeks[cur] = { ...weeks[cur], milestones: weeks[cur].milestones.filter((x) => x !== mid) };
          if (target !== null) weeks[i0 + target] = { ...weeks[i0 + target], milestones: [...(weeks[i0 + target].milestones || []), mid] };
        } else if (target !== null && target !== undefined) {
          if (target < k0) { skipped.push({ id: mid, title: m.title, reason: "before" }); continue; }
          block.milestones = { ...keyed(block.milestones), [mid]: { id: mid, title: m.title, kind: m.kind, sport: m.sport, metric: m.metric, target: m.target, at, declared: null } };
          weeks[i0 + target] = { ...weeks[i0 + target], milestones: [...(weeks[i0 + target].milestones || []), mid] };
        }
      }
      block.layouts = { ...keyed(block.layouts), [from]: { start: lay.start, weeks, at, origin: "scenario", base: lay.at || null } };
      block.at = at;
      blockId = sc.base;
    } else {
      const end = lastMonday(sc);
      for (const b of Object.values(next.blocks)) {
        if (!b || removedBlock(b)) continue;
        const l = B.latest(b);
        if (l && !(W.addDays(l.start, 7 * l.weeks.length - 1) < from || l.start > end)) fail("SCENARIO_BLOCK_OVERLAP");
      }
      const n = Object.values(keyed(sc.log)).filter((e) => e?.kind === "apply").length + 1;
      blockId = `${sc.id}-${n}`;
      if (next.blocks[blockId]) fail("SCENARIO_EXISTS");
      created = true;
      const weeks = v.weeks.slice(k0).map((w, i) => ({ days: clone(w.days), kind: "plan", n: i + 1, scenario: letter, milestones: [] }));
      const milestones = {};
      for (const [mid, m] of Object.entries(sc.milestones)) {
        const t = v.place?.[mid];
        if (t === null || t === undefined) continue;
        if (t < k0) { skipped.push({ id: mid, title: m.title, reason: "before" }); continue; }
        milestones[mid] = { id: mid, title: m.title, kind: m.kind, sport: m.sport, metric: m.metric, target: m.target, at, declared: null };
        weeks[t - k0].milestones.push(mid);
      }
      const sports = [...new Set(weeks.flatMap((w) => w.days.filter(Boolean).map((d) => d.sport)))].slice(0, 8);
      next.blocks[blockId] = { v: 1, id: blockId, at, created: at, title: sc.title, intent: `Scénario « ${v.name} »`, template: "scenario", sports, goal: null, layouts: { [from]: { start: from, weeks, at, origin: "scenario", base: null } }, milestones, log: {}, removed: null, scenario: sc.id };
    }
    const pv = preview(schedule, next, sc, "apply", { from, today, logs, zone, variant, name: v.name, block: blockId });
    pv.milestones = { moved: cmp.milestones.filter((m) => m.moved[variant] && !skipped.some((x) => x.id === m.id)).map((m) => ({ id: m.id, title: m.title, before: m.active, after: m[variant] })), skipped };
    pv.conflicts = cmp.plans[variant].conflicts.filter((c) => c.week >= from);
    pv.created = created;
    pv.block = blockId;
    const other = variant === "a" ? "b" : "a";
    const stats = { conflicts: cmp.conflicts[variant], other: cmp.conflicts[other], avoided: Math.max(0, cmp.conflicts[other] - cmp.conflicts[variant]) };
    const blk = next.blocks[blockId];
    blk.log = { ...keyed(blk.log), [`${at}#scenario`]: { at, kind: "scenario", from, origin: `scenario:${sc.id}`, effect: { weeks: pv.weeks.filter((w) => w.applies && w.changed).map((w) => ({ week: w.week, before: w.label.before, after: w.label.after })), milestones: pv.milestones.moved, exceptions: pv.exceptions.filter((e) => e.state !== "kept").map((e) => ({ week: e.week, occurrence: e.occurrence, state: e.state })), pauses: [], detail: { scenario: sc.id, title: sc.title, variant, name: v.name, letter } } } };
    sc.applied = { at, variant, name: v.name, from, block: blockId, created, prior, written: at, stats, undone: null };
    sc.log = { ...keyed(sc.log), [`${at}#apply`]: { at, kind: "apply", variant, name: v.name, from, block: blockId } };
    sc.at = at;
    return { schedule: prune(next, today), scenario: sc, preview: pv };
  }

  /** Undo the application. The layout in force before is written back from the first week that has not begun; a week begun since keeps
      the scenario (lived: its sessions are tied to it). Refused when the block was changed after the application. */
  function undo(schedule, logs, id, { today, at = new Date().toISOString(), zone } = {}) {
    const W = WP(), B = TB();
    if (!isKey(today)) fail("SCENARIO_TODAY_REQUIRED");
    const sc0 = find(schedule, id);
    const ap = sc0.applied;
    if (!ap || ap.undone) fail("SCENARIO_NOTHING_TO_UNDO");
    const open = B.firstOpen(schedule, today);
    const key = ap.from > open ? ap.from : open;
    if (key > lastMonday(sc0)) fail("SCENARIO_UNDO_CLOSED");
    const next = clone(schedule);
    const sc = next.scenarios[id];
    const block = next.blocks?.[ap.block];
    const lay = block ? B.latest(block) : null;
    if (!lay || removedBlock(block) || lay.at !== ap.written) fail("SCENARIO_CHANGED_SINCE");
    if (ap.created) {
      block.layouts = { ...keyed(block.layouts), [key]: { removed: true, start: lay.start, count: lay.weeks.length, weeks: clone(lay.weeks), at, origin: "scenario-undo", base: lay.at } };
      block.removed = at;
    } else {
      const cut = W.daysBetween(lay.start, key) / 7;
      const weeks = ap.prior.weeks.map((w, i) => (i < cut ? clone(lay.weeks[i]) : clone(w)));
      // Milestones the scenario moved into a week begun since stay where they were lived; the others go back.
      const livedIds = new Set(weeks.slice(0, cut).flatMap((w) => w.milestones || []));
      for (let i = cut; i < weeks.length; i++) weeks[i] = { ...weeks[i], milestones: (weeks[i].milestones || []).filter((m) => !livedIds.has(m)) };
      block.layouts = { ...keyed(block.layouts), [key]: { start: lay.start, weeks, at, origin: "scenario-undo", base: key === ap.from ? ap.prior.at || null : lay.at } };
      block.at = at;
    }
    const pv = preview(schedule, next, sc, "undo", { from: key, today, logs, zone, variant: ap.variant, name: ap.name, block: ap.block });
    block.log = { ...keyed(block.log), [`${at}#scenario-undo`]: { at, kind: "scenario-undo", from: key, origin: `scenario:${sc.id}`, effect: { weeks: pv.weeks.filter((w) => w.applies && w.changed).map((w) => ({ week: w.week, before: w.label.before, after: w.label.after })), milestones: [], exceptions: [], pauses: [], detail: { scenario: sc.id, title: sc.title, variant: ap.variant, name: ap.name, letter: LETTER[ap.variant] } } } };
    sc.applied = { ...ap, undone: { at, from: key } };
    sc.log = { ...keyed(sc.log), [`${at}#undo`]: { at, kind: "undo", variant: ap.variant, name: ap.name, from: key, block: ap.block } };
    sc.at = at;
    return { schedule: next, scenario: sc, preview: pv };
  }

  /* ---------- At the bilan: the decision and what happened in the week ---------- */

  /** For the bilan of week `week`: the scenario applied (or undone) on that week, the plan per sport and what the journal holds. */
  function followUp(schedule, logs, { week, today, zone, pauses = [] }) {
    const W = WP();
    const w = W.weekOf(week || today);
    for (const sc of Object.values(scenariosOf(schedule))) {
      const ap = sc?.applied;
      if (!ap || w < ap.from || w > lastMonday(sc)) continue;
      const v = W.week(schedule, logs, { week: w, today, zone, pauses });
      const planned = {}, done = {};
      for (const o of v.occurrences) { const s = (planned[o.planned.sport] = planned[o.planned.sport] || { sessions: 0, minutes: 0, unknown: 0 }); s.sessions++; if (o.planned.minutes) s.minutes += o.planned.minutes; else s.unknown++; }
      for (const l of logs || []) {
        if (!l || !W.counted(l)) continue;
        const d = W.sessionDay(l, zone);
        if (!d || d < w || d > W.addDays(w, 6)) continue;
        const s = (done[l.sport] = done[l.sport] || { sessions: 0, minutes: 0, unknown: 0, ids: [] });
        const m = minutesOf(l);
        s.sessions++; s.ids.push(W.sessionId(l));
        if (m) s.minutes += m; else s.unknown++;
      }
      const undone = !!ap.undone && w >= ap.undone.from;
      return { id: sc.id, title: sc.title, variant: ap.variant, name: ap.name, letter: LETTER[ap.variant], at: ap.at, from: ap.from, week: w, undone, undoneAt: ap.undone?.at || null, lived: !!ap.undone && w < ap.undone.from, planned, done, summary: v.summary, first: w === ap.from, block: ap.block };
    }
    return null;
  }

  /** The measure of the cahier des charges, from what is stored: decisions applied (and undone), conflicts avoided by the choice made
      (the other variant's overlaps minus the chosen one's, counted at the time of the choice). */
  function measure(schedule) {
    const out = { scenarios: 0, compared: 0, applied: 0, undone: 0, decisions: 0, conflictsAvoided: 0 };
    for (const sc of Object.values(scenariosOf(schedule))) {
      if (!sc) continue;
      if (!sc.discarded) out.scenarios++;
      const log = Object.values(keyed(sc.log));
      out.decisions += log.filter((e) => e?.kind === "apply").length;
      out.undone += log.filter((e) => e?.kind === "undo").length;
      if (sc.applied && !sc.applied.undone) { out.applied++; out.conflictsAvoided += sc.applied.stats?.avoided || 0; }
      if (KEYS.every((k) => sc.variants?.[k]?.at && sc.variants[k].at > sc.created)) out.compared++;
    }
    return out;
  }

  function list(schedule) {
    return Object.values(scenariosOf(schedule)).filter((s) => s && !s.discarded).sort((a, b) => (a.created < b.created ? 1 : -1)).map((s) => ({ id: s.id, title: s.title, start: s.start, count: s.count, base: s.base, applied: s.applied ? clone(s.applied) : null, names: { a: s.variants?.a?.name, b: s.variants?.b?.name } }));
  }

  function prune(schedule, today) {
    const W = WP();
    if (!isKey(today) || !schedule.scenarios) return schedule;
    const oldest = W.addDays(W.weekOf(today), -7 * (W.MAX_WEEKS - 1));
    for (const [id, s] of Object.entries(schedule.scenarios)) if (!s || !isKey(s.start) || W.addDays(s.start, 7 * (Number(s.count) || 0)) < oldest) delete schedule.scenarios[id];
    return schedule;
  }

  /** Two devices' scenarios, scenario by scenario: each variant, each availability and the application, the most recent write wins. */
  function merge(a, b) {
    const x = keyed(a), y = keyed(b);
    const later = (p, q, stamp = (r) => String(r?.at || "")) => (!p ? q : !q ? p : stamp(q) > stamp(p) ? q : p);
    const out = {};
    for (const id of new Set([...Object.keys(x), ...Object.keys(y)])) {
      const p = x[id], q = y[id];
      if (!p || !q) { out[id] = clone(p || q); continue; }
      const meta = String(q.at || "") > String(p.at || "") ? q : p;
      const variants = {};
      for (const k of KEYS) variants[k] = later(p.variants?.[k], q.variants?.[k]);
      const availability = { ...keyed(p.availability) };
      for (const [k, v] of Object.entries(keyed(q.availability))) availability[k] = later(availability[k], v);
      const milestones = { ...keyed(p.milestones), ...keyed(q.milestones) };
      const applied = later(p.applied, q.applied, (r) => String(r?.undone?.at || r?.at || ""));
      out[id] = clone({ ...meta, created: p.created || q.created, variants, availability, milestones, applied: applied || null, log: { ...keyed(p.log), ...keyed(q.log) }, discarded: p.discarded || q.discarded || null });
    }
    return out;
  }

  /** A JSON projection of a comparison (parity between clients, tests). */
  function snapshot(c) {
    if (!c) return null;
    const plan = (x) => ({ minutes: x.minutes, sessions: x.sessions, unknown: x.unknown, free: x.free, sports: x.sports, weeks: x.weeks.map((w) => ({ week: w.week, minutes: w.minutes, free: w.free, days: w.days.map((d) => (d ? `${d.sport}:${d.minutes ?? "?"}` : null)) })), conflicts: x.conflicts, exceptions: x.exceptions });
    return { id: c.id, base: c.base, start: c.start, end: c.end, weeks: c.weeks, plans: { active: plan(c.plans.active), a: { name: c.plans.a.name, same: c.plans.a.same, ...plan(c.plans.a) }, b: { name: c.plans.b.name, same: c.plans.b.same, ...plan(c.plans.b) } }, rows: c.rows, free: c.free, conflicts: c.conflicts, moved: c.moved, milestones: c.milestones, observed: c.observed, fields: c.fields, availability: c.availability, applied: c.applied ? { variant: c.applied.variant, from: c.applied.from, block: c.applied.block, undone: c.applied.undone } : null };
  }

  /* ---------- Words, the same on both clients. label(sport) gives the sport's name, dayLong(key) a long date. ---------- */

  const DAYS = () => WP().DAY_NAMES;
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const dur = (m) => TB().unitText("duration", m);
  const minutesText = (x) => (x.sessions ? `${x.minutes ? dur(x.minutes) : "0 min"}${x.unknown ? ` + ${p(x.unknown, "créneau sans durée", "créneaux sans durée")}` : ""}` : "—");
  const signed = (n) => (n === 0 ? "=" : `${n > 0 ? "+" : "−"}${dur(Math.abs(n))}`);
  const slotText = (d, label) => (d ? `${label(d.sport)}${d.minutes ? ` ${dur(d.minutes)}` : " (durée à renseigner)"}` : "libre");

  function describeConflict(c, { label = (s) => s, dayLong = (k) => k } = {}) {
    const day = cap(dayLong(WP().addDays(c.week, c.day)));
    if (c.kind === "pause") return `${day} : ${label(c.sport)} prévu dans une semaine que tu as mise en pause`;
    if (c.kind === "cadence") return `${day} : ${label(c.sport)} prévu dans une semaine en pause de cadence`;
    if (c.kind === "unavailable") return `${day} : ${label(c.sport)} prévu un jour où tu n’es pas disponible`;
    return `${day} : ${label(c.sport)} prévu alors que ta décision déjà prise y place ${label(c.moved)}`;
  }

  /** The words of a comparison: one line per sport, free days, overlaps, milestones, the fields to fill, the past observations. */
  function describeComparison(c, { label = (s) => s, dayLong = (k) => k } = {}) {
    const names = { active: "Programme actif", a: c.plans.a.name, b: c.plans.b.name };
    const sports = c.rows.map((r) => ({ sport: r.sport, label: label(r.sport), active: minutesText(r.active), a: minutesText(r.a), b: minutesText(r.b), delta: r.delta === null ? "à compléter" : signed(r.delta) }));
    const total = { active: minutesText(c.plans.active), a: minutesText(c.plans.a), b: minutesText(c.plans.b), delta: c.plans.a.unknown || c.plans.b.unknown ? "à compléter" : signed(c.plans.b.minutes - c.plans.a.minutes) };
    const free = { active: p(c.free.active, "jour libre", "jours libres"), a: p(c.free.a, "jour libre", "jours libres"), b: p(c.free.b, "jour libre", "jours libres"), delta: c.free.delta === 0 ? "=" : `${c.free.delta > 0 ? "+" : "−"}${Math.abs(c.free.delta)}` };
    const conflicts = {};
    for (const k of ["active", "a", "b"]) conflicts[k] = c.plans[k].conflicts.map((x) => describeConflict(x, { label, dayLong }));
    const milestones = c.milestones.map((m) => {
      const w = (k) => (m[k] ? `semaine du ${dayLong(m[k])}` : k === "active" ? "pas dans le programme actif" : "retiré de la variante");
      return { id: m.id, title: m.title, active: w("active"), a: `${w("a")}${m.moved.a && m.active ? " (déplacé)" : m.moved.a && m.a ? " (ajouté)" : ""}${m.late.a ? " · après l’échéance" : ""}`, b: `${w("b")}${m.moved.b && m.active ? " (déplacé)" : m.moved.b && m.b ? " (ajouté)" : ""}${m.late.b ? " · après l’échéance" : ""}` };
    });
    const fields = c.fields.map((f) => (f.kind === "availability" ? "Disponibilités non renseignées : les chevauchements ne lisent que tes décisions déjà prises." : `${names[f.variant]} : ${p(f.count, "créneau sans durée", "créneaux sans durée")}, son temps n’est pas compté.`));
    const obs = c.observed;
    const observedLines = Object.keys(obs.sports).sort().map((s) => { const x = obs.sports[s]; return `${label(s)} : ${p(x.sessions, "séance", "séances")}${x.minutes ? `, ${dur(x.minutes)} enregistrées` : ""}${x.unknown ? ` (${p(x.unknown, "sans durée", "sans durée")})` : ""}`; });
    const weeks = c.weeks.map((m, i) => ({ week: m, title: `Semaine du ${dayLong(m)}`, availability: c.availability[i].pause ? "En pause" : c.availability[i].days ? `Disponible : ${c.availability[i].days.map((ok, j) => (ok ? DAYS()[j] : null)).filter(Boolean).join(", ") || "aucun jour"}` : null, active: c.plans.active.weeks[i].days.map((d, j) => (d ? `${cap(DAYS()[j]).slice(0, 3)} ${slotText(d, label)}` : null)).filter(Boolean).join(" · ") || "Rien de prévu", a: c.plans.a.weeks[i].days.map((d, j) => (d ? `${cap(DAYS()[j]).slice(0, 3)} ${slotText(d, label)}` : null)).filter(Boolean).join(" · ") || "Rien de prévu", b: c.plans.b.weeks[i].days.map((d, j) => (d ? `${cap(DAYS()[j]).slice(0, 3)} ${slotText(d, label)}` : null)).filter(Boolean).join(" · ") || "Rien de prévu" }));
    return {
      names, sports, total, free, conflicts, milestones, fields, weeks,
      observed: { title: `Observé du ${dayLong(obs.from)} au ${dayLong(obs.to)} (${obs.weeks} semaines closes)`, lines: observedLines.length ? observedLines : ["Aucune séance comptée sur ces semaines."] },
      planned: `Temps planifié sur ${p(c.count, "semaine", "semaines")}, du ${dayLong(c.start)} au ${dayLong(c.end)}${c.baseTitle ? `, dans le bloc « ${c.baseTitle} »` : ", sur ta semaine type"}.`,
      same: KEYS.filter((k) => c.plans[k].same).map((k) => `${names[k]} est encore identique au programme actif.`),
    };
  }

  /** The words of an application or undo preview: the weeks and the occurrences touched, the exceptions, what stays. */
  function describePreview(pv, { label = (s) => s, dayLong = (k) => k } = {}) {
    const lines = [];
    for (const w of pv.weeks.filter((x) => x.applies && x.changed)) {
      lines.push(`Semaine du ${dayLong(w.week)}${w.label.before || w.label.after ? ` : ${w.label.before || "semaine type"} → ${w.label.after || "semaine type"}` : ""}`);
      for (const c of w.changes) lines.push(`${cap(DAYS()[c.index])} : ${slotText(c.before, label)} → ${slotText(c.after, label)}`);
    }
    if (!lines.length) lines.push("Aucune occurrence ne change sur les semaines concernées.");
    const notes = [];
    const touched = pv.occurrences.filter((o) => o.week >= pv.from);
    notes.push(`${p(touched.length, "occurrence touchée", "occurrences touchées")} : ${p(touched.filter((o) => o.change === "added").length, "ajoutée", "ajoutées")}, ${p(touched.filter((o) => o.change === "removed").length, "retirée", "retirées")}, ${p(touched.filter((o) => o.change === "sport" || o.change === "minutes").length, "modifiée", "modifiées")}.`);
    if (pv.kept) notes.push(pv.kept > 1 ? `${pv.kept} semaines de la période gardent leur programme : ${pv.kind === "undo" ? "elles ont commencé avec le scénario" : "elles sont avant la date choisie"}.` : `1 semaine de la période garde son programme : ${pv.kind === "undo" ? "elle a commencé avec le scénario" : "elle est avant la date choisie"}.`);
    if (pv.kind === "undo" && pv.lived.length) notes.push(`${pv.lived.length > 1 ? "Les semaines commencées gardent" : "La semaine commencée garde"} le scénario : ${pv.lived.map((w) => `semaine du ${dayLong(w)}`).join(", ")}.`);
    for (const m of pv.milestones?.moved || []) notes.push(m.before && m.after ? `Jalon « ${m.title} » : semaine du ${dayLong(m.before)} → semaine du ${dayLong(m.after)}.` : m.after ? `Jalon « ${m.title} » ajouté : semaine du ${dayLong(m.after)}.` : `Jalon « ${m.title} » retiré du programme.`);
    for (const m of pv.milestones?.skipped || []) notes.push(`Jalon « ${m.title} » : ${m.reason === "reached" ? "déjà atteint, il ne bouge pas" : "sa semaine est avant la date choisie, il ne bouge pas"}.`);
    const ex = pv.exceptions.filter((e) => e.state !== "kept" || e.overlap);
    if (ex.length) notes.push(`${p(ex.length, "décision déjà prise", "décisions déjà prises")} : ${ex.map((e) => `${dayLong(WP().addDays(e.week, Number(e.occurrence.split("/")[1])))} (${e.state === "gone" ? "son créneau disparaît, elle ne compte plus" : e.overlap ? "elle place une séance un jour déjà occupé" : "elle s’applique au nouveau créneau"})`).join(", ")}.`);
    if (pv.conflicts?.length) notes.push(`${p(pv.conflicts.length, "chevauchement reste", "chevauchements restent")} dans ce scénario.`);
    notes.push(`Tes séances restent au journal (${p(pv.sessions.journal, "séance comptée", "séances comptées")}, dont ${p(pv.sessions.period, "sur la période", "sur la période")}).`);
    const where = pv.kind === "undo" ? `Le programme d’avant revient à partir du ${dayLong(pv.from)}.` : `S’applique à partir du ${dayLong(pv.from)}.`;
    return { lines, notes, where };
  }

  function describeFollowUp(f, { label = (s) => s, dayLong = (k) => k } = {}) {
    if (!f) return null;
    const one = (o) => Object.keys(o).sort().map((s) => `${label(s)} ${o[s].minutes ? dur(o[s].minutes) : p(o[s].sessions, "séance", "séances")}${o[s].unknown && o[s].minutes ? ` + ${p(o[s].unknown, "sans durée", "sans durée")}` : ""}`).join(" · ") || "rien";
    const lead = f.undone
      ? `Scénario « ${f.name} » appliqué le ${dayLong(String(f.at).slice(0, 10))}, annulé le ${dayLong(String(f.undoneAt).slice(0, 10))} : cette semaine a repris le programme d’avant.`
      : `Scénario « ${f.name} » (${f.title}) appliqué le ${dayLong(String(f.at).slice(0, 10))} à partir du ${dayLong(f.from)}${f.lived ? " ; annulé ensuite, cette semaine commencée l’a gardé" : ""}.`;
    return { lead, planned: `Prévu : ${one(f.planned)}.`, done: `Fait : ${one(f.done)}.`, result: `${f.summary.done}/${f.summary.planned} faite${f.summary.done > 1 ? "s" : ""}, ${p(f.summary.gaps, "écart", "écarts")}.` };
  }

  const api = { VERSION, MIN_WEEKS, MAX_WEEKS, MAX_SCENARIOS, WINDOW, KEYS, LETTER, HYPOTHESES, RULES, create, setDay, rename, copyVariant, placeMilestone, addMilestone, setAvailability, fit, discard, compare, apply, undo, followUp, measure, list, merge, snapshot, observed, describeConflict, describeComparison, describePreview, describeFollowUp };
  root.TitanBlockScenario = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
