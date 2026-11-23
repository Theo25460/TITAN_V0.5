/* V1.7.4 — Objectifs et blocs d’entraînement: a personal goal tied to several weeks of practice, with the milestones the athlete
   chooses and a programme that can change, on the existing planning (js/core/week-plan.js). The same rules and words on the website
   and in the Android app (copied unchanged by mobile/scripts/sync-web-core.mjs). Pure: it reads a schedule, the cadence pauses and the
   journal, and returns new values; it never changes a session and never marks a goal or a milestone as reached by itself.

   Storage. schedule.blocks { "<id>": block } in game_state.user.schedule (the key the server already copies, like V1.7.2 and V1.7.3):
   - block      { v, id, at, created, title, intent, template, sports, goal, layouts, milestones, log, removed, copyOf }
   - layouts    { "<Monday>": { start, weeks: [{ days, kind, n, of, light, milestones }], at, origin } | { removed, start, count, at } }
                 the whole block in force FROM that Monday. week-plan.js blockAt() reads the layout of a week: the most recent among
                 those whose Monday is not after it. A layout is written only for a Monday not before the first week that has not
                 begun (the V1.7.2 rule: this week keeps its start), so a closed week, and the week in progress, never change.
   - milestones { "<id>": { id, title, kind: "measure" | "declared", sport, metric, target, at, declared } }; a milestone sits on one
                 week of the layout (weeks[i].milestones) and moves with it when the block is shifted.
   - goal       { title, date, kind, sport, metric, target, declared }: the deadline does not move when the block moves.
   - log        { "<at>#<kind>": { at, kind, from, origin, effect } }: every change, with its effect, for the weekly bilan.
   Keyed objects (never arrays at the top) so the website's three-way merge and week-plan.js merge() combine two devices.

   Rules (RULES).
   - A milestone or the goal is reached only by an event: a counted session of the journal that meets its measure, or the athlete’s
     declaration (with its time) for a declared action. Creating, shifting, duplicating or removing a block marks nothing.
   - A change applies from the first week that has not begun; the preview shows the weeks, the milestones that move, the deadline,
     the pauses and the exceptions (decisions already taken on future weeks), and nothing is written before the athlete confirms.
   - Sessions stay in the journal whatever happens to the block. */
(function (root) {
  "use strict";

  const VERSION = 1;
  const MIN_WEEKS = 2;
  const MAX_WEEKS = 16;
  const MAX_SHIFT = 4;
  const MAX_MILESTONES = 8;
  const MAX_BLOCKS = 12;
  const METRICS = ["distance", "duration", "elevation", "sessions"];
  const KINDS = ["measure", "declared"];
  const RULES = Object.freeze({
    event: "Un jalon ou l’objectif n’est atteint que par une séance du journal qui remplit sa mesure, ou par ton action déclarée.",
    start: "Un changement s’applique à partir de la première semaine qui n’a pas commencé : la semaine en cours et les semaines closes ne changent pas.",
    journal: "Tes séances restent au journal quoi qu’il arrive au bloc.",
    preview: "Rien n’est enregistré tant que tu n’as pas confirmé l’aperçu.",
  });

  const WP = () => {
    const w = root.TitanWeekPlan;
    if (!w) throw new Error("TRAINING_BLOCK_NEEDS_WEEK_PLAN");
    return w;
  };
  const isKey = (k) => typeof k === "string" && /^\d{4}-\d{2}-\d{2}$/.test(k);
  const clone = (v) => JSON.parse(JSON.stringify(v ?? {}));
  const str = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const known = (sport) => typeof sport === "string" && !!sport && (!root.SPORTS_CONFIG || !!root.SPORTS_CONFIG[sport] || !!root.TitanSports?.conf?.(sport));
  const p = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  const round5 = (m) => Math.max(5, Math.min(600, Math.round(m / 5) * 5));
  const fail = (code) => { throw new Error(code); };

  /* ---------- Reading a block ---------- */

  const blocksOf = (schedule) => (schedule?.blocks && typeof schedule.blocks === "object" && !Array.isArray(schedule.blocks) ? schedule.blocks : {});
  function entries(block) {
    const l = block?.layouts && typeof block.layouts === "object" ? block.layouts : {};
    return Object.entries(l).filter(([k, v]) => isKey(k) && v && typeof v === "object").sort((a, b) => (String(a[1].at || "") < String(b[1].at || "") ? -1 : String(a[1].at || "") > String(b[1].at || "") ? 1 : a[0] < b[0] ? -1 : 1));
  }
  /** The block as it stands now: its most recent layout that is not a removal. */
  function latest(block) {
    // A removal keeps the weeks it removed (it may replace the layout written for the same Monday): the block stays readable.
    const list = entries(block).filter(([, v]) => Array.isArray(v.weeks) && v.weeks.length);
    const v = list.length ? list[list.length - 1][1] : null;
    return v && v.removed ? { start: v.start, weeks: v.weeks, at: v.at, origin: v.origin } : v;
  }
  const isRemoved = (block) => { const e = entries(block); return !!block?.removed || (e.length > 0 && !!e[e.length - 1][1].removed); };
  /** The first Monday a layout of the block applied from (its activation). */
  const activation = (block) => entries(block).filter(([, v]) => !v.removed).map(([k]) => k).sort()[0] || null;
  const mondayOf = (layout, i) => WP().addDays(layout.start, 7 * i);
  const endOf = (layout) => WP().addDays(layout.start, 7 * layout.weeks.length - 1);

  /** The first Monday a change may apply from: this week when nothing was planned and nothing decided in it, else next Monday. */
  function firstOpen(schedule, today) {
    const W = WP();
    const current = W.weekOf(today);
    const ref = W.reference(schedule, current, { current });
    const rec = schedule?.weeks?.[current];
    const decided = rec && rec.occ && Object.keys(rec.occ).length > 0;
    return !ref.days.some(Boolean) && !decided ? current : W.addDays(current, 7);
  }

  function weekLabel(w, i) {
    if (!w) return `Semaine ${i + 1}`;
    if (w.kind === "report") return `Report · reprend la semaine ${w.of}`;
    if (w.kind === "copy") return `Semaine ${w.n} (copie de la semaine ${w.of})`;
    return `Semaine ${w.n || i + 1}${w.light ? " · allégée" : ""}`;
  }

  /* ---------- Measures of a session (the journal's values, never converted, never added across sports) ---------- */

  function valueOf(log, metric) {
    const d = log?.details && typeof log.details === "object" ? log.details : {};
    if (metric === "distance") return log.unit === "km" && Number(log.val) > 0 ? Number(log.val) : Number(d.distance) > 0 ? Number(d.distance) : 0;
    if (metric === "duration") { const m = Number(d.duration ?? d.minutes ?? (log.unit === "min" ? log.val : NaN)); return m > 0 ? m : 0; }
    if (metric === "elevation") { const e = Number(d.elevation ?? d.elevationGain); return e > 0 ? e : 0; }
    return 1;
  }
  function unitText(metric, target) {
    if (metric === "distance") return `${String(target).replace(".", ",")} km`;
    if (metric === "duration") { const h = Math.floor(target / 60), m = Math.round(target % 60); return h ? `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} min`; }
    if (metric === "elevation") return `${target} m de D+`;
    return p(target, "séance", "séances");
  }

  /** Where a measure stands over a window of days: the session that reached it (the first one), or how far it got. */
  function evaluate(def, logs, from, to, zone) {
    const W = WP();
    const list = (logs || [])
      .filter((l) => l && W.counted(l) && (!def.sport || l.sport === def.sport))
      .map((l) => ({ l, day: W.sessionDay(l, zone), id: W.sessionId(l), t: new Date(l.date).getTime() }))
      .filter((x) => x.id && x.day && x.day >= from && x.day <= to)
      .sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
    if (def.metric === "sessions") {
      const hit = list[Number(def.target) - 1];
      return hit ? { reached: true, session: hit.id, day: hit.day, best: Number(def.target) } : { reached: false, best: list.length };
    }
    let best = 0;
    for (const x of list) {
      const v = valueOf(x.l, def.metric);
      if (v >= Number(def.target)) return { reached: true, session: x.id, day: x.day, best: v };
      best = Math.max(best, v);
    }
    return { reached: false, best };
  }

  /** The state of one milestone: reached (by a session in its window or a declaration), late (reached after its week), missed (its
      week ended without it), pending (its week has not ended). */
  function milestoneState(block, m, monday, logs, { today, zone }) {
    const W = WP();
    const lay = latest(block) || {};
    const start = lay.start || monday;
    const sunday = W.addDays(monday, 6);
    const created = String(block.created || block.at || "").slice(0, 10);
    const out = { id: m.id, title: m.title, kind: m.kind, sport: m.sport || null, metric: m.metric || null, target: m.target ?? null, week: monday, index: lay.weeks ? Math.round(W.daysBetween(lay.start, monday) / 7) : null, closed: sunday < today, state: "pending", session: null, day: null, declared: m.declared || null };
    if (m.kind === "declared") {
      if (m.declared?.at) { out.state = "reached"; out.day = String(m.declared.at).slice(0, 10); out.how = "declared"; }
      else out.state = sunday < today ? "missed" : "pending";
      return out;
    }
    const on = evaluate(m, logs, start, sunday, zone);
    if (on.reached) { out.state = "reached"; out.session = on.session; out.day = on.day; out.how = "session"; out.before = !!created && on.day < created; return out; }
    out.best = on.best;
    if (sunday < today) {
      const after = evaluate(m, logs, W.addDays(sunday, 1), lay.weeks ? endOf(lay) : sunday, zone);
      if (after.reached) { out.state = "late"; out.session = after.session; out.day = after.day; out.how = "session"; return out; }
      out.state = "missed";
    }
    return out;
  }
  function goalState(block, logs, { today, zone }) {
    const g = block.goal;
    if (!g || !g.title) return null;
    const lay = latest(block) || {};
    const out = { title: g.title, date: g.date || null, kind: g.kind || (g.metric ? "measure" : "declared"), sport: g.sport || null, metric: g.metric || null, target: g.target ?? null, state: "pending", session: null, day: null };
    if (out.kind === "declared") {
      if (g.declared?.at) { out.state = "reached"; out.day = String(g.declared.at).slice(0, 10); out.how = "declared"; }
      else if (out.date && out.date < today) out.state = "passed";
      return out;
    }
    const to = out.date || (lay.weeks ? endOf(lay) : today);
    const r = evaluate(out, logs, lay.start || to, to, zone);
    if (r.reached) { out.state = "reached"; out.session = r.session; out.day = r.day; out.how = "session"; }
    else { out.best = r.best; if (to < today) out.state = "passed"; }
    if (out.date) out.daysLeft = Math.max(0, WP().daysBetween(today, out.date));
    return out;
  }

  /* ---------- Templates: models by type of project, the athlete adapts them before creating, and can duplicate a block ---------- */

  const TEMPLATES = [
    { id: "endurance", title: "Préparer une sortie longue", weeks: 6, text: "Une sortie longue qui progresse chaque semaine, une séance plus courte au milieu de la semaine et une semaine allégée toutes les quatre semaines. Tes autres disciplines gardent leur créneau." },
    { id: "routine", title: "Tenir une routine multisport", weeks: 6, text: "Ta semaine type reprise chaque semaine, pour suivre plusieurs disciplines sur la durée avec des jalons." },
    { id: "reprise", title: "Reprendre progressivement", weeks: 4, text: "Les durées de ta semaine type remontent de 60 % à 100 %, sans séance en plus." },
    { id: "blank", title: "Partir de ma semaine type", weeks: 6, text: "Chaque semaine du bloc commence comme ta semaine type ; tu ajustes ensuite celles que tu veux." },
  ];

  /** The weeks a model proposes. options: { type (seven days), sport (main sport), weeks, peak (minutes of the longest session),
      longDay, midDay (0-6) }. */
  function draft(templateId, { type, sport, weeks, peak, longDay, midDay } = {}) {
    const W = WP();
    const t = TEMPLATES.find((x) => x.id === templateId) || TEMPLATES[3];
    const n = Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, Math.round(Number(weeks) || t.weeks)));
    const base = W.storedDays(type) || [null, null, null, null, null, null, null];
    const out = [];
    for (let i = 0; i < n; i++) {
      const days = base.map((d) => (d ? { ...d } : null));
      let light = false;
      if (t.id === "endurance" && known(sport)) {
        const top = round5(Number(peak) > 0 ? Number(peak) : 180);
        const ld = Number.isInteger(longDay) ? longDay : (() => { const i0 = base.findIndex((d, j) => d?.sport === sport && j >= 5); return i0 >= 0 ? i0 : 5; })();
        light = (i + 1) % 4 === 0 && i < n - 1;
        const r = 0.6 + (0.4 * i) / Math.max(1, n - 1);
        days[ld] = { sport, minutes: round5(top * (light ? r * 0.7 : r)), note: light ? "Sortie longue allégée" : "Sortie longue" };
        const md = Number.isInteger(midDay) ? midDay : [2, 3, 1, 4].find((j) => j !== ld && (!base[j] || base[j].sport === sport)) ?? null;
        if (md !== null && md !== ld) days[md] = { sport, minutes: Math.max(30, Math.min(90, round5(top * 0.3))), note: "Séance courte" };
      } else if (t.id === "reprise") {
        const r = 0.6 + (0.4 * i) / Math.max(1, n - 1);
        for (let j = 0; j < 7; j++) if (days[j]?.minutes) days[j] = { ...days[j], minutes: round5(days[j].minutes * r) };
      }
      out.push({ days, kind: "plan", n: i + 1, ...(light ? { light: true } : {}) });
    }
    return out;
  }

  /** The milestones a model suggests, the athlete keeps the ones they want. options: { weeks, sport, goal, type }. */
  function suggest(templateId, { weeks, sport, goal, type } = {}) {
    const n = Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, Math.round(Number(weeks) || 6)));
    const list = [];
    const T = Number(goal?.target);
    if (templateId === "endurance" && known(sport) && goal?.metric && T > 0 && goal.metric !== "sessions") {
      const at = (ratio) => (goal.metric === "distance" ? Math.round(T * ratio) : round5(T * ratio));
      list.push({ title: `Sortie de ${unitText(goal.metric, at(0.6))}`, week: Math.max(0, Math.ceil(n / 2) - 1), kind: "measure", sport, metric: goal.metric, target: at(0.6) });
      list.push({ title: `Sortie de ${unitText(goal.metric, at(0.8))}`, week: Math.max(1, n - 2), kind: "measure", sport, metric: goal.metric, target: at(0.8) });
    }
    const others = [...new Set((WP().storedDays(type) || []).filter(Boolean).map((d) => d.sport))].filter((s) => s !== sport);
    for (const s of others.slice(0, 2)) list.push({ title: `${n} séances`, week: n - 1, kind: "measure", sport: s, metric: "sessions", target: n });
    list.push({ title: "Repérer le parcours et préparer le matériel", week: n - 1, kind: "declared" });
    return list;
  }

  /* ---------- Validation of what the athlete wrote ---------- */

  function cleanDays(days) {
    const d = WP().storedDays(days);
    if (!d) fail("TRAINING_BLOCK_BAD_DAYS");
    return d.map((x) => (x ? { sport: x.sport, minutes: x.minutes, note: x.note } : null));
  }
  function cleanMeasure(m, code) {
    const kind = KINDS.includes(m?.kind) ? m.kind : m?.metric ? "measure" : "declared";
    const out = { kind };
    if (kind === "measure") {
      if (!METRICS.includes(m.metric)) fail(code);
      const target = Number(m.target);
      if (!(target > 0) || target > (m.metric === "elevation" ? 20000 : m.metric === "duration" ? 1440 : m.metric === "sessions" ? 200 : 1000)) fail(code);
      if (m.sport && !known(m.sport)) fail(code);
      if (m.metric !== "sessions" && !m.sport) fail(code);
      Object.assign(out, { sport: m.sport || null, metric: m.metric, target: m.metric === "distance" ? Math.round(target * 10) / 10 : Math.round(target) });
    }
    return out;
  }
  function cleanGoal(g) {
    if (!g || !str(g.title, 80)) return null;
    if (g.date && !isKey(g.date)) fail("TRAINING_BLOCK_BAD_GOAL");
    return { title: str(g.title, 80), date: g.date || null, ...cleanMeasure(g, "TRAINING_BLOCK_BAD_GOAL"), declared: null };
  }
  const mid = (block, at, i) => `m${String(at).replace(/\D/g, "").slice(2, 14)}${i}`;

  /* ---------- Writing ---------- */

  function overlap(schedule, start, count, except) {
    const W = WP();
    const end = W.addDays(start, 7 * count - 1);
    for (const [id, b] of Object.entries(blocksOf(schedule))) {
      if (id === except || isRemoved(b)) continue;
      const l = latest(b);
      if (l && !(endOf(l) < start || l.start > end)) return id;
    }
    return null;
  }

  function logEntry(block, kind, at, from, effect) {
    block.log = block.log && typeof block.log === "object" && !Array.isArray(block.log) ? block.log : {};
    block.log[`${at}#${kind}`] = { at, kind, from, origin: `block:${block.id}`, effect: effect || null };
  }

  function writeLayout(block, from, layout, at, origin) {
    block.layouts = block.layouts && typeof block.layouts === "object" && !Array.isArray(block.layouts) ? block.layouts : {};
    const base = latest(block);
    const { base: _b, at: _a, origin: _o, ...rest } = layout;
    block.layouts[from] = { ...rest, at, origin, base: base ? base.at || null : null };
    block.at = at;
  }

  /** What a new block will look like. input: { id, title, intent, template, sports, start, weeks (array of { days, ... }), goal,
      milestones: [{ title, week, kind, sport, metric, target }], copyOf }. */
  function prepare(schedule, input, { today, at }) {
    const W = WP();
    if (!isKey(today)) fail("TRAINING_BLOCK_TODAY_REQUIRED");
    const start = input?.start;
    if (!isKey(start) || W.weekOf(start) !== start) fail("TRAINING_BLOCK_BAD_START");
    const weeks = Array.isArray(input.weeks) ? input.weeks : [];
    if (weeks.length < MIN_WEEKS || weeks.length > MAX_WEEKS) fail("TRAINING_BLOCK_BAD_LENGTH");
    const title = str(input.title, 80);
    if (!title) fail("TRAINING_BLOCK_TITLE_REQUIRED");
    const end = W.addDays(start, 7 * weeks.length - 1);
    if (end < today) fail("TRAINING_BLOCK_IN_THE_PAST");
    if (Object.keys(blocksOf(schedule)).filter((k) => !isRemoved(blocksOf(schedule)[k])).length >= MAX_BLOCKS) fail("TRAINING_BLOCK_LIMIT");
    const id = str(input.id, 40) || `b${String(at).replace(/\D/g, "").slice(2, 17)}`;
    if (blocksOf(schedule)[id]) fail("TRAINING_BLOCK_EXISTS");
    if (overlap(schedule, start, weeks.length, null)) fail("TRAINING_BLOCK_OVERLAP");
    const goal = cleanGoal(input.goal);
    if (goal?.date && goal.date < start) fail("TRAINING_BLOCK_BAD_GOAL");
    const ms = (Array.isArray(input.milestones) ? input.milestones : []).slice(0, MAX_MILESTONES);
    const layoutWeeks = weeks.map((w, i) => ({ days: cleanDays(w.days), kind: w.kind === "copy" ? "copy" : "plan", n: Number(w.n) > 0 ? Math.round(w.n) : i + 1, ...(w.of ? { of: Number(w.of) } : {}), ...(w.light ? { light: true } : {}), milestones: [] }));
    const milestones = {};
    ms.forEach((m, i) => {
      const index = Math.round(Number(m.week));
      if (!(index >= 0 && index < layoutWeeks.length)) fail("TRAINING_BLOCK_BAD_MILESTONE");
      const t = str(m.title, 80);
      if (!t) fail("TRAINING_BLOCK_BAD_MILESTONE");
      const key = str(m.id, 40) || mid(null, at, i);
      milestones[key] = { id: key, title: t, ...cleanMeasure(m, "TRAINING_BLOCK_BAD_MILESTONE"), at, declared: null };
      layoutWeeks[index].milestones.push(key);
    });
    const sports = [...new Set([...(Array.isArray(input.sports) ? input.sports : []), ...layoutWeeks.flatMap((w) => w.days.filter(Boolean).map((d) => d.sport))])].filter(known).slice(0, 8);
    const from = start > firstOpen(schedule, today) ? start : firstOpen(schedule, today);
    const block = { v: VERSION, id, at, created: at, title, intent: str(input.intent, 160), template: TEMPLATES.some((t) => t.id === input.template) ? input.template : input.copyOf ? "copy" : "blank", sports, goal, layouts: {}, milestones, log: {}, removed: null, ...(input.copyOf ? { copyOf: String(input.copyOf) } : {}) };
    writeLayout(block, from, { start, weeks: layoutWeeks }, at, input.copyOf ? "duplicate" : "create");
    return { block, from };
  }

  /** The days of the weeks from `from` on, as the planning reads them, for a schedule. */
  function planned(schedule, mondays, today) {
    const W = WP();
    const current = W.weekOf(today);
    const out = {};
    for (const m of mondays) out[m] = W.reference(schedule, m, { current });
    return out;
  }
  const sportsOf = (days) => (days || []).map((d) => (d ? d.sport : null));

  /** The exceptions already decided on future weeks (V1.7.2 decisions, V1.7.3 adjustments): whether each still finds its slot. */
  function exceptions(before, after, mondays) {
    const out = [];
    for (const m of mondays) {
      const rec = before.schedule?.weeks?.[m];
      for (const [id, d] of Object.entries(rec?.occ || {})) {
        if (!d || d.kind === "reset") continue;
        const i = Number(id.split("/")[1]);
        const a = before.refs[m]?.days?.[i] || null, b = after.refs[m]?.days?.[i] || null;
        out.push({ week: m, occurrence: id, kind: d.kind, origin: typeof d.origin === "string" ? d.origin : null, before: a ? a.sport : null, after: b ? b.sport : null, state: !b ? "gone" : a && a.sport === b.sport ? "kept" : "changed" });
      }
    }
    return out;
  }

  /** Common shape of every preview: the weeks whose programme changes, the milestones that move, the deadline, the pauses kept on their
      week, the exceptions, and the weeks that stay as they are. */
  function compare(schedule, next, block, nextBlock, { today, pauses = [] }) {
    const W = WP();
    const current = W.weekOf(today);
    const lay0 = block ? latest(block) : null, lay1 = nextBlock && !isRemoved(nextBlock) ? latest(nextBlock) : null;
    const span = [lay0, lay1].filter(Boolean);
    if (!span.length) return { weeks: [], milestones: [], pauses: [], exceptions: [], closed: 0, current: false };
    const first = span.map((l) => l.start).sort()[0];
    const last = span.map(endOf).sort().pop();
    const mondays = [];
    for (let m = first; m <= last; m = W.addDays(m, 7)) mondays.push(m);
    const before = { schedule, refs: planned(schedule, mondays, today) };
    const after = { schedule: next, refs: planned(next, mondays, today) };
    const weeks = [];
    for (const m of mondays) {
      const a = before.refs[m], b = after.refs[m];
      const la = a.block?.id === block?.id ? a.block : null, lb = b.block?.id === (nextBlock || block)?.id ? b.block : null;
      const changed = JSON.stringify(a.days) !== JSON.stringify(b.days) || (la?.index ?? null) !== (lb?.index ?? null) || (la?.label ?? null) !== (lb?.label ?? null);
      weeks.push({ week: m, state: m < current ? "closed" : m === current ? "current" : "upcoming", changed, before: { days: sportsOf(a.days), source: a.source, label: la ? weekLabel(lay0?.weeks?.[la.index], la.index) : null }, after: { days: sportsOf(b.days), source: b.source, label: lb ? weekLabel(lay1?.weeks?.[lb.index], lb.index) : null }, paused: (pauses || []).includes(m) });
    }
    const where = (l) => {
      const o = {};
      (l?.weeks || []).forEach((w, i) => (w.milestones || []).forEach((id) => { o[id] = mondayOf(l, i); }));
      return o;
    };
    const w0 = where(lay0), w1 = where(lay1);
    const ms = { ...(block?.milestones || {}), ...(nextBlock?.milestones || {}) };
    const milestones = Object.keys(ms).filter((id) => (w0[id] || null) !== (w1[id] || null)).map((id) => ({ id, title: ms[id].title, before: w0[id] || null, after: w1[id] || null }));
    const goal = (nextBlock || block)?.goal;
    const late = goal?.date ? Object.entries(w1).filter(([, m]) => m > goal.date).map(([id]) => id) : [];
    return {
      weeks,
      milestones,
      goal: goal ? { title: goal.title, date: goal.date || null, kept: true, endsAfter: !!(goal.date && lay1 && mondayOf(lay1, lay1.weeks.length - 1) > goal.date), late } : null,
      pauses: weeks.filter((w) => w.paused).map((w) => w.week),
      exceptions: exceptions(before, after, mondays.filter((m) => m > current)),
      closed: weeks.filter((w) => w.state === "closed").length,
      current: weeks.some((w) => w.state === "current"),
    };
  }

  function commit(schedule, block, { today }) {
    const next = clone(schedule);
    next.blocks = { ...blocksOf(next), [block.id]: block };
    return prune(next, today);
  }

  /** Create a block (from a model the athlete adapted, or a copy). Returns { schedule, block, from, preview } — new values. */
  function create(schedule, input, { today, at = new Date().toISOString(), pauses = [] } = {}) {
    const { block, from } = prepare(schedule, input, { today, at });
    const next = commit(schedule, block, { today });
    const pv = compare(schedule, next, null, block, { today, pauses });
    logEntry(next.blocks[block.id], input.copyOf ? "duplicate" : "create", at, from, effectOf(pv));
    return { schedule: next, block: next.blocks[block.id], from, preview: { kind: input.copyOf ? "duplicate" : "create", from, ...pv } };
  }
  function previewCreate(schedule, input, opts) {
    const r = create(schedule, input, opts);
    return r.preview;
  }

  /** The effect kept in the change log: what the bilan says later. */
  function effectOf(pv) {
    return {
      weeks: pv.weeks.filter((w) => w.changed).map((w) => ({ week: w.week, before: w.before.label, after: w.after.label })),
      milestones: pv.milestones.map((m) => ({ id: m.id, title: m.title, before: m.before, after: m.after })),
      exceptions: pv.exceptions.filter((e) => e.state !== "kept").map((e) => ({ week: e.week, occurrence: e.occurrence, state: e.state })),
      pauses: pv.pauses,
    };
  }

  function find(schedule, id) {
    const b = blocksOf(schedule)[id];
    if (!b) fail("TRAINING_BLOCK_NOT_FOUND");
    if (isRemoved(b)) fail("TRAINING_BLOCK_REMOVED");
    const l = latest(b);
    if (!l) fail("TRAINING_BLOCK_NOT_FOUND");
    return { block: b, layout: l };
  }

  /** A change of the layout from week `index` on, applied from the first week that has not begun. */
  function change(schedule, id, kind, build, { today, at = new Date().toISOString(), pauses = [] } = {}) {
    const W = WP();
    if (!isKey(today)) fail("TRAINING_BLOCK_TODAY_REQUIRED");
    const { block, layout } = find(schedule, id);
    const open = firstOpen(schedule, today);
    const r = build(clone(layout), open);
    const from = r.from > open ? r.from : open;
    if (r.from < open) fail("TRAINING_BLOCK_WEEK_STARTED");
    const nb = clone(block);
    if (r.milestones) nb.milestones = r.milestones;
    if (r.goal !== undefined) nb.goal = r.goal;
    if (r.layout) {
      const o = overlap(schedule, r.layout.start, r.layout.weeks.length, id);
      if (o) fail("TRAINING_BLOCK_OVERLAP");
      writeLayout(nb, from, r.layout, at, kind);
    } else nb.at = at;
    const next = commit(schedule, nb, { today });
    const pv = compare(schedule, next, block, nb, { today, pauses });
    logEntry(next.blocks[id], kind, at, from, { ...effectOf(pv), ...(r.detail ? { detail: r.detail } : {}) });
    return { schedule: next, block: next.blocks[id], from, preview: { kind, from, ...(r.detail ? { detail: r.detail } : {}), ...pv } };
  }

  /** Revise one week (index) of the block: its seven days. */
  const editWeek = (schedule, id, { index, days }, opts) =>
    change(schedule, id, "week", (l) => {
      if (!(index >= 0 && index < l.weeks.length)) fail("TRAINING_BLOCK_BAD_WEEK");
      const before = l.weeks[index].days;
      l.weeks[index] = { ...l.weeks[index], days: cleanDays(days), edited: true };
      return { layout: l, from: mondayOf(l, index), detail: { index, label: weekLabel(l.weeks[index], index), days: dayChanges(before, l.weeks[index].days) } };
    }, opts);

  /** Copy the days of week `from` onto week `to`. */
  const duplicateWeek = (schedule, id, { from, to }, opts) =>
    change(schedule, id, "copy", (l) => {
      if (!(from >= 0 && from < l.weeks.length && to >= 0 && to < l.weeks.length) || from === to) fail("TRAINING_BLOCK_BAD_WEEK");
      const before = l.weeks[to].days;
      const src = l.weeks[from];
      const { light: _l, ...rest } = l.weeks[to];
      l.weeks[to] = { ...rest, days: clone(src.days), kind: "copy", of: src.n || from + 1, n: rest.n || to + 1 };
      return { layout: l, from: mondayOf(l, to), detail: { from, to, label: weekLabel(l.weeks[to], to), days: dayChanges(before, l.weeks[to].days) } };
    }, opts);

  /** Shift the block from week `from` by `weeks` weeks: as many report weeks (a repeat of the week before) are inserted, the weeks and
      milestones after move later; the deadline of the goal does not move. */
  const shift = (schedule, id, { from, weeks = 1 }, opts) =>
    change(schedule, id, "shift", (l) => {
      const n = Math.round(Number(weeks));
      if (!(from >= 0 && from < l.weeks.length) || !(n >= 1 && n <= MAX_SHIFT)) fail("TRAINING_BLOCK_BAD_SHIFT");
      if (l.weeks.length + n > MAX_WEEKS) fail("TRAINING_BLOCK_BAD_LENGTH");
      const src = l.weeks[from > 0 ? from - 1 : 0];
      const reports = Array.from({ length: n }, () => ({ days: clone(src.days), kind: "report", of: src.n || (from > 0 ? from : 1), milestones: [] }));
      const out = { ...l, weeks: [...l.weeks.slice(0, from), ...reports, ...l.weeks.slice(from)] };
      return { layout: out, from: mondayOf(l, from), detail: { index: from, weeks: n, label: weekLabel(l.weeks[from], from) } };
    }, opts);

  /** Add, change or remove a milestone. milestone: { id?, title, week, kind, sport, metric, target } or { id, remove: true }. A
      milestone whose week has ended, or that is reached, does not change: its history stays as it was. */
  const setMilestone = (schedule, id, milestone, opts = {}) =>
    change(schedule, id, "milestone", (l, open) => {
      const W = WP();
      const b = blocksOf(schedule)[id];
      const ms = clone(b.milestones || {});
      const at = opts.at || new Date().toISOString();
      const where = () => { for (let i = 0; i < l.weeks.length; i++) if ((l.weeks[i].milestones || []).includes(milestone.id)) return i; return -1; };
      const old = milestone.id ? ms[milestone.id] : null;
      if (milestone.id && !old) fail("TRAINING_BLOCK_BAD_MILESTONE");
      const was = old ? where() : -1;
      if (old) {
        if (was >= 0 && W.addDays(mondayOf(l, was), 6) < opts.today) fail("TRAINING_BLOCK_MILESTONE_CLOSED");
        if (old.declared?.at) fail("TRAINING_BLOCK_MILESTONE_CLOSED");
        if (old.kind === "measure" && was >= 0 && milestoneState(b, old, mondayOf(l, was), opts.logs || [], opts).state === "reached") fail("TRAINING_BLOCK_MILESTONE_CLOSED");
      }
      if (milestone.remove) {
        if (was >= 0) l.weeks[was] = { ...l.weeks[was], milestones: (l.weeks[was].milestones || []).filter((x) => x !== milestone.id) };
        if (!old) fail("TRAINING_BLOCK_BAD_MILESTONE");
        delete ms[milestone.id];
        return { layout: l, milestones: ms, from: open, detail: { id: milestone.id, title: old.title, removed: true } };
      }
      const index = Math.round(Number(milestone.week));
      if (!(index >= 0 && index < l.weeks.length) || W.addDays(mondayOf(l, index), 6) < opts.today) fail("TRAINING_BLOCK_BAD_MILESTONE");
      if (!old && Object.keys(ms).length >= MAX_MILESTONES) fail("TRAINING_BLOCK_MILESTONE_LIMIT");
      const title = str(milestone.title, 80);
      if (!title) fail("TRAINING_BLOCK_BAD_MILESTONE");
      const key = old ? old.id : str(milestone.newId, 40) || mid(null, at, Object.keys(ms).length);
      ms[key] = { id: key, title, ...cleanMeasure(milestone, "TRAINING_BLOCK_BAD_MILESTONE"), at, declared: null };
      const detail = { id: key, title, added: !old, before: old ? { title: old.title, week: was >= 0 ? mondayOf(l, was) : null, kind: old.kind, metric: old.metric || null, target: old.target ?? null, sport: old.sport || null } : null, after: { week: mondayOf(l, index), kind: ms[key].kind, metric: ms[key].metric || null, target: ms[key].target ?? null, sport: ms[key].sport || null } };
      // A milestone that stays on its week changes only its own record, so a change made on another device to the programme is kept.
      if (was === index) return { milestones: ms, from: open, detail };
      // The layout carries where the milestones are; its days do not change, so it is written for the first week not begun.
      if (was >= 0) l.weeks[was] = { ...l.weeks[was], milestones: (l.weeks[was].milestones || []).filter((x) => x !== milestone.id) };
      l.weeks[index] = { ...l.weeks[index], milestones: [...(l.weeks[index].milestones || []), key] };
      return { layout: l, milestones: ms, from: open, detail };
    }, opts);

  /** The athlete declares a declared milestone (or the declared goal) done, or takes the declaration back. */
  function declare(schedule, id, { milestone, goal, done = true }, { today, at = new Date().toISOString() } = {}) {
    const { block } = find(schedule, id);
    const nb = clone(block);
    let title;
    if (goal) {
      if (!nb.goal || (nb.goal.kind || (nb.goal.metric ? "measure" : "declared")) !== "declared") fail("TRAINING_BLOCK_NOT_DECLARED");
      nb.goal.declared = done ? { at } : null;
      title = nb.goal.title;
    } else {
      const m = nb.milestones?.[milestone];
      if (!m || m.kind !== "declared") fail("TRAINING_BLOCK_NOT_DECLARED");
      nb.milestones[milestone] = { ...m, declared: done ? { at } : null, at };
      title = m.title;
    }
    nb.at = at;
    const next = commit(schedule, nb, { today });
    logEntry(next.blocks[id], done ? "declare" : "undeclare", at, WP().weekOf(today), { detail: { milestone: milestone || null, goal: !!goal, title } });
    return { schedule: next, block: next.blocks[id] };
  }

  /** Remove the block from the first week that has not begun: the weeks after it get the typical week back, the closed weeks keep the
      programme they had, the sessions stay in the journal, nothing is marked as reached. */
  function remove(schedule, id, { today, at = new Date().toISOString(), pauses = [] } = {}) {
    const W = WP();
    if (!isKey(today)) fail("TRAINING_BLOCK_TODAY_REQUIRED");
    const { block, layout } = find(schedule, id);
    const open = firstOpen(schedule, today);
    const from = layout.start > open ? layout.start : open;
    const nb = clone(block);
    nb.layouts = { ...(nb.layouts || {}), [from]: { removed: true, start: layout.start, count: layout.weeks.length, weeks: clone(layout.weeks), at, origin: "remove", base: layout.at || null } };
    nb.removed = at;
    nb.at = at;
    const next = commit(schedule, nb, { today });
    const pv = compare(schedule, next, block, null, { today, pauses });
    pv.range = { from: layout.start, to: endOf(layout) };
    logEntry(next.blocks[id], "remove", at, from, effectOf(pv));
    return { schedule: next, block: next.blocks[id], from, preview: { kind: "remove", from, ...pv } };
  }

  /** Duplicate a block as a new one starting on another Monday (its weeks, its milestones not reached, its goal moved by as many days). */
  function duplicate(schedule, id, { start, title, newId } = {}, opts = {}) {
    const W = WP();
    const b = blocksOf(schedule)[id];
    if (!b) fail("TRAINING_BLOCK_NOT_FOUND");
    const l = latest(b);
    if (!l) fail("TRAINING_BLOCK_NOT_FOUND");
    if (!isKey(start) || W.weekOf(start) !== start) fail("TRAINING_BLOCK_BAD_START");
    const shiftDays = W.daysBetween(l.start, start);
    const milestones = [];
    l.weeks.forEach((w, i) => (w.milestones || []).forEach((mid) => { const m = b.milestones?.[mid]; if (m) milestones.push({ title: m.title, week: i, kind: m.kind, sport: m.sport, metric: m.metric, target: m.target }); }));
    const goal = b.goal ? { ...b.goal, date: b.goal.date ? W.addDays(b.goal.date, shiftDays) : null, declared: null } : null;
    return create(schedule, { id: newId, title: str(title, 80) || `${b.title} (copie)`, intent: b.intent, template: b.template, sports: b.sports, start, weeks: l.weeks.map((w, i) => ({ days: w.days, kind: "plan", n: i + 1, light: w.light })), goal, milestones, copyOf: id }, opts);
  }

  /* ---------- Views ---------- */

  function dayChanges(a, b) {
    const out = [];
    for (let i = 0; i < 7; i++) {
      const x = a?.[i] || null, y = b?.[i] || null;
      if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ index: i, before: x ? { sport: x.sport, minutes: x.minutes } : null, after: y ? { sport: y.sport, minutes: y.minutes } : null });
    }
    return out;
  }

  /** One block, week by week. options: { today, zone, pauses }. */
  function view(schedule, logs, id, { today, zone, pauses = [] } = {}) {
    const W = WP();
    if (!isKey(today)) fail("TRAINING_BLOCK_TODAY_REQUIRED");
    const b = blocksOf(schedule)[id];
    if (!b) return null;
    const l = latest(b);
    if (!l) return null;
    const current = W.weekOf(today);
    const act = activation(b);
    const removed = isRemoved(b);
    const weeks = l.weeks.map((w, i) => {
      const m = mondayOf(l, i);
      const ref = W.reference(schedule, m, { current });
      const applied = ref.source === "block" && ref.block?.id === id || (ref.source === "week" && ref.block?.id === id);
      const state = m < current ? "closed" : m === current ? "current" : "upcoming";
      const shown = applied || state !== "upcoming" ? ref.days : w.days;
      const out = { index: i, week: m, label: weekLabel(w, i), kind: w.kind, light: !!w.light, days: sportsOf(shown), minutes: shown.map((d) => (d ? d.minutes : null)), plan: sportsOf(w.days), applied, before: !!act && m < act, state, paused: (pauses || []).includes(m), milestones: [...(w.milestones || [])] };
      if (state !== "upcoming") {
        const v = W.week(schedule, logs, { week: m, today, zone, pauses });
        out.summary = { planned: v.summary.planned, done: v.summary.done, asPlanned: v.summary.asPlanned, gaps: v.summary.gaps, extra: v.summary.extra, source: v.reference.source };
      }
      return out;
    });
    const milestones = [];
    l.weeks.forEach((w, i) => (w.milestones || []).forEach((k) => { const m = b.milestones?.[k]; if (m) milestones.push(milestoneState(b, m, mondayOf(l, i), logs, { today, zone })); }));
    const log = Object.values(b.log || {}).filter((e) => e && e.at).sort((x, y) => (x.at < y.at ? -1 : 1));
    const end = endOf(l);
    const out = {
      version: VERSION, id, title: b.title, intent: b.intent || "", template: b.template || null, sports: b.sports || [], created: b.created || b.at, copyOf: b.copyOf || null,
      start: l.start, end, activation: act, removed: removed ? b.removed || entries(b).pop()[1].at : null,
      state: removed ? "removed" : end < today ? "finished" : l.start > current ? "upcoming" : "active",
      currentIndex: weeks.findIndex((w) => w.week === current),
      weeks, milestones, goal: goalState(b, logs, { today, zone }), log,
      open: firstOpen(schedule, today),
      // Two devices changed the programme of the block from the same version: both changes are kept Monday by Monday, the most
      // recent wins for the weeks it covers — the athlete is asked to check the programme.
      conflict: (() => { const e = entries(b).filter(([, x]) => !x.removed); return e.length > 1 && e[e.length - 1][1].base !== undefined && e[e.length - 1][1].base !== e[e.length - 2][1].at; })(),
    };
    out.signature = [id, out.state, l.start, weeks.length, ...weeks.map((w) => `${w.index}:${w.applied ? "b" : "-"}:${w.days.map((s) => s || "_").join(",")}`), ...milestones.map((m) => `${m.id}:${m.state}:${m.session || ""}`), out.goal ? `goal:${out.goal.state}:${out.goal.session || ""}` : ""].join("|");
    return out;
  }

  /** Every block of the schedule, the most recent first; removed and finished ones are history. */
  function list(schedule, logs, opts) {
    return Object.keys(blocksOf(schedule)).map((id) => view(schedule, logs, id, opts)).filter(Boolean).sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0));
  }

  /** For the weekly bilan of week `week`: the block that week belongs to, the changes whose effect reaches it (with their source), and
      its milestones. */
  function weekContext(schedule, logs, { week, today, zone, pauses = [] }) {
    const W = WP();
    const w = W.weekOf(week || today);
    for (const id of Object.keys(blocksOf(schedule))) {
      const v = view(schedule, logs, id, { today, zone, pauses });
      if (!v) continue;
      const wk = v.weeks.find((x) => x.week === w);
      const msWeek = (mid) => v.milestones.find((m) => m.id === mid)?.week || null;
      const touched = v.log.filter((e) => e.effect && ((e.effect.weeks || []).some((x) => x.week === w) || (e.effect.milestones || []).some((m) => m.before === w || m.after === w) || (e.effect.exceptions || []).some((x) => x.week === w)
        || (e.kind === "milestone" && (e.effect.detail?.after?.week === w || e.effect.detail?.before?.week === w))
        || ((e.kind === "declare" || e.kind === "undeclare") && e.effect.detail?.milestone && msWeek(e.effect.detail.milestone) === w)));
      if (!wk && !touched.length) continue;
      return {
        id, title: v.title, state: v.state, goal: v.goal, week: w,
        index: wk ? wk.index : null, count: v.weeks.length, label: wk ? wk.label : null, applied: wk ? wk.applied : false, before: wk ? wk.before : false,
        changes: touched.map((e) => ({ at: e.at, kind: e.kind, from: e.from, origin: e.origin, here: (e.effect.weeks || []).find((x) => x.week === w) || null, milestones: (e.effect.milestones || []).filter((m) => m.before === w || m.after === w), exceptions: (e.effect.exceptions || []).filter((x) => x.week === w), detail: e.effect.detail || null })),
        milestones: v.milestones.filter((m) => m.week === w),
        removed: v.removed,
        signature: v.signature,
      };
    }
    return null;
  }

  /** The measure of the cahier des charges, from what is stored: blocks activated, milestones tied to a session, blocks kept after an
      interruption (a shift or a paused week inside the block) and not removed after it. */
  function measure(schedule, logs, { today, zone, pauses = [] }) {
    const out = { blocks: 0, activated: 0, milestones: 0, linked: 0, declared: 0, interrupted: 0, kept: 0 };
    for (const id of Object.keys(blocksOf(schedule))) {
      const v = view(schedule, logs, id, { today, zone, pauses });
      if (!v) continue;
      out.blocks++;
      if (v.weeks.some((w) => w.applied && w.state !== "upcoming")) out.activated++;
      out.milestones += v.milestones.length;
      out.linked += v.milestones.filter((m) => m.how === "session" && (m.state === "reached" || m.state === "late")).length;
      out.declared += v.milestones.filter((m) => m.how === "declared").length;
      const shifts = v.log.filter((e) => e.kind === "shift");
      const pausedIn = v.weeks.filter((w) => w.paused && w.applied);
      if (shifts.length || pausedIn.length) {
        out.interrupted++;
        const lastBreak = [...shifts.map((e) => e.at), ...pausedIn.map((w) => `${w.week}T23:59:59.999Z`)].sort().pop();
        if (!v.removed || String(v.removed) < lastBreak) out.kept++;
      }
    }
    return out;
  }

  function prune(schedule, today) {
    const W = WP();
    if (!isKey(today) || !schedule.blocks) return schedule;
    const oldest = W.addDays(W.weekOf(today), -7 * (W.MAX_WEEKS - 1));
    for (const [id, b] of Object.entries(schedule.blocks)) {
      const l = latest(b);
      if (!l || endOf(l) < oldest) delete schedule.blocks[id];
    }
    return schedule;
  }

  /** A JSON projection (parity between clients, tests). */
  function snapshot(v) {
    if (!v) return null;
    return {
      id: v.id, state: v.state, start: v.start, end: v.end, activation: v.activation, removed: !!v.removed, currentIndex: v.currentIndex,
      weeks: v.weeks.map((w) => ({ week: w.week, label: w.label, kind: w.kind, applied: w.applied, before: w.before, state: w.state, paused: w.paused, days: w.days, milestones: w.milestones, ...(w.summary ? { summary: w.summary } : {}) })),
      milestones: v.milestones.map((m) => ({ id: m.id, week: m.week, state: m.state, session: m.session, how: m.how || null })),
      goal: v.goal ? { state: v.goal.state, session: v.goal.session, date: v.goal.date } : null,
      log: v.log.map((e) => ({ kind: e.kind, from: e.from })),
      signature: v.signature,
    };
  }

  /* ---------- Words, the same on both clients. label(sport) gives the sport's name, dayLong(key) a long date. ---------- */

  const DAYS = () => WP().DAY_NAMES;
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

  function describeMeasure(m, { label = (s) => s } = {}) {
    if (!m || m.kind === "declared") return "Action déclarée";
    const sport = m.sport ? label(m.sport) : "tous sports";
    if (m.metric === "sessions") return `${unitText("sessions", m.target)} · ${sport}`;
    return `Une séance ${sport} d’au moins ${unitText(m.metric, m.target)}`;
  }

  function describeMilestone(s, { label = (x) => x, dayLong = (k) => k } = {}) {
    const what = describeMeasure(s, { label });
    const when = `semaine du ${dayLong(s.week)}`;
    const state = s.state === "reached"
      ? s.how === "declared" ? `Fait, déclaré le ${dayLong(s.day)}` : `Atteint le ${dayLong(s.day)}${s.before ? " (séance antérieure à la création du bloc)" : ""}`
      : s.state === "late" ? `Atteint après sa semaine, le ${dayLong(s.day)}`
      : s.state === "missed" ? (s.kind === "declared" ? "Sa semaine est passée, non déclaré" : `Sa semaine est passée${s.best ? ` : meilleure valeur ${s.metric === "sessions" ? s.best : unitText(s.metric, Math.round(s.best * 10) / 10)}` : " sans séance qui le remplit"}`)
      : s.kind === "declared" ? "À déclarer quand c’est fait" : s.metric === "sessions" ? `${s.best || 0}/${s.target} pour l’instant` : "À venir";
    return { title: s.title, what, when, state };
  }

  function describeGoal(g, { label = (x) => x, dayLong = (k) => k } = {}) {
    if (!g) return null;
    const what = describeMeasure(g, { label });
    const date = g.date ? `Échéance : ${dayLong(g.date)}${g.daysLeft !== undefined && g.state === "pending" ? ` (dans ${p(g.daysLeft, "jour", "jours")})` : ""}` : "Sans échéance";
    const state = g.state === "reached" ? (g.how === "declared" ? `Atteint, déclaré le ${dayLong(g.day)}` : `Atteint le ${dayLong(g.day)}`) : g.state === "passed" ? "Échéance passée sans séance qui le remplit" : "En cours : aucune séance ne l’a encore rempli";
    return { title: g.title, what, date, state };
  }

  function dayLine(c, { label = (s) => s } = {}) {
    const one = (d) => (d ? `${label(d.sport)}${d.minutes ? ` ${unitText("duration", d.minutes)}` : ""}` : "libre");
    return `${cap(DAYS()[c.index])} : ${one(c.before)} → ${one(c.after)}`;
  }

  /** The words of a preview (create, duplicate, week, copy, shift, milestone, remove). */
  function describePreview(pv, { label = (s) => s, dayLong = (k) => k } = {}) {
    const lines = [];
    const notes = [];
    const weekName = (w) => `Semaine du ${dayLong(w.week)}`;
    for (const w of pv.weeks.filter((x) => x.changed && x.state === "upcoming")) {
      const a = w.before.label || (w.before.source === "block" ? "autre bloc" : "semaine type");
      const b = w.after.label || "semaine type";
      lines.push(a === b ? `${weekName(w)} · ${b} :` : `${weekName(w)} : ${a} → ${b}`);
    }
    if (pv.detail?.days) for (const c of pv.detail.days) lines.push(dayLine(c, { label }));
    for (const m of pv.milestones) {
      if (!m.before) lines.push(`Jalon « ${m.title} » : semaine du ${dayLong(m.after)}`);
      else if (!m.after) lines.push(`Jalon « ${m.title} » retiré du bloc`);
      else lines.push(`Jalon « ${m.title} » : semaine du ${dayLong(m.before)} → semaine du ${dayLong(m.after)}`);
    }
    if (pv.kind === "milestone" && pv.detail && !pv.milestones.length) {
      const d = pv.detail;
      lines.push(d.removed ? `Jalon « ${d.title} » retiré du bloc` : d.added ? `Nouveau jalon « ${d.title} » : ${describeMeasure(d.after, { label })}, semaine du ${dayLong(d.after.week)}` : `Jalon « ${d.title} » : ${describeMeasure(d.before, { label })} → ${describeMeasure(d.after, { label })}`);
    }
    if (!lines.length) lines.push("Aucune semaine à venir ne change de programme.");
    const closed = pv.weeks.filter((w) => w.state === "closed").length;
    const kept = [];
    if (closed) kept.push(closed > 1 ? `${closed} semaines closes gardent leur programme et leurs séances` : "1 semaine close garde son programme et ses séances");
    if (pv.current) kept.push("la semaine en cours garde son programme de départ");
    if (kept.length) notes.push(`${cap(kept.join(" ; "))}.`);
    if (pv.goal) notes.push(pv.goal.date ? `L’objectif « ${pv.goal.title} » garde son échéance du ${dayLong(pv.goal.date)}.${pv.goal.endsAfter ? " La dernière semaine du bloc commence après cette échéance." : ""}${pv.goal.late.length ? ` ${p(pv.goal.late.length, "jalon tombe", "jalons tombent")} après l’échéance.` : ""}` : `L’objectif « ${pv.goal.title} » est conservé.`);
    if (pv.pauses.length) notes.push(`${pv.pauses.length > 1 ? "Les pauses restent" : "La pause reste"} sur ${pv.pauses.length > 1 ? "leur semaine" : "sa semaine"} : ${pv.pauses.map((w) => `semaine du ${dayLong(w)}`).join(", ")}.`);
    const ex = pv.exceptions.filter((e) => e.state !== "kept");
    if (ex.length) notes.push(`${p(ex.length, "décision déjà prise", "décisions déjà prises")} sur une semaine à venir ${ex.length > 1 ? "restent" : "reste"} enregistrée${ex.length > 1 ? "s" : ""} : ${ex.map((e) => `${DAYS()[Number(e.occurrence.split("/")[1])]} ${dayLong(e.week).split(" ").slice(1).join(" ")} (${e.state === "gone" ? "son créneau disparaît, elle ne compte plus" : "elle s’applique au nouveau créneau"})`).join(", ")}.`);
    else if (pv.exceptions.length) notes.push(`${p(pv.exceptions.length, "décision déjà prise", "décisions déjà prises")} sur une semaine à venir ${pv.exceptions.length > 1 ? "restent valables" : "reste valable"}.`);
    if (pv.kind === "remove") notes.push(`Tes séances restent au journal et rien n’est marqué comme atteint. Les semaines suivantes reprennent ta semaine type.`);
    const where = pv.kind === "milestone" ? "Le jalon change dès maintenant ; les jalons des semaines passées ne bougent plus." : `S’applique à partir du ${dayLong(pv.from)}.`;
    return { lines, notes, where };
  }

  /** The words of a change at the weekly bilan: its source, then its effect on that week. */
  function describeChange(c, { label = (s) => s, dayLong = (k) => k } = {}) {
    const when = dayLong(String(c.at).slice(0, 10));
    const src = { create: "Création du bloc", duplicate: "Bloc dupliqué", week: "Semaine révisée", copy: "Semaine dupliquée", shift: "Bloc décalé", milestone: "Jalon modifié", remove: "Bloc retiré", declare: "Action déclarée", undeclare: "Déclaration retirée" }[c.kind] || "Changement";
    const effect = [];
    if (c.here) effect.push(c.kind === "remove" ? `cette semaine reprend ta semaine type (au lieu de ${c.here.before || "la semaine du bloc"})` : c.here.before && c.here.after && c.here.before !== c.here.after ? `cette semaine passe de « ${c.here.before} » à « ${c.here.after} »` : c.here.after ? `cette semaine suit « ${c.here.after} »` : "cette semaine change de programme");
    for (const m of c.milestones || []) effect.push(m.after && m.before ? `le jalon « ${m.title} » passe de la semaine du ${dayLong(m.before)} à celle du ${dayLong(m.after)}` : m.after ? `le jalon « ${m.title} » est placé cette semaine` : `le jalon « ${m.title} » est retiré`);
    for (const x of c.exceptions || []) effect.push(`ta décision du ${DAYS()[Number(x.occurrence.split("/")[1])]} ${x.state === "gone" ? "n’a plus de créneau" : "s’applique au nouveau créneau"}`);
    if ((c.kind === "declare" || c.kind === "undeclare") && c.detail?.title) effect.push(c.kind === "declare" ? `« ${c.detail.title} » est déclaré fait` : `la déclaration de « ${c.detail.title} » est retirée`);
    if (c.kind === "milestone" && c.detail && !(c.milestones || []).length) effect.push(c.detail.removed ? `le jalon « ${c.detail.title} » est retiré` : c.detail.added ? `nouveau jalon « ${c.detail.title} »` : `le jalon « ${c.detail.title} » change de mesure : ${describeMeasure(c.detail.before, { label })} → ${describeMeasure(c.detail.after, { label })}`);
    return { source: `${src} le ${when}`, effect: effect.length ? `${cap(effect.join(" ; "))}.` : "" };
  }

  const api = { VERSION, MIN_WEEKS, MAX_WEEKS, MAX_SHIFT, MAX_MILESTONES, METRICS, RULES, TEMPLATES, draft, suggest, firstOpen, latest, activation, weekLabel, create, previewCreate, editWeek, duplicateWeek, shift, setMilestone, declare, remove, duplicate, view, list, weekContext, measure, snapshot, evaluate, describeMeasure, describeMilestone, describeGoal, describePreview, describeChange, unitText };
  root.TitanTrainingBlock = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
