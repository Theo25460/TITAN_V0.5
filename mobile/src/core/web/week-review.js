/* V1.7.3 — Bilan et ajustements: the weekly bilan ends on one adjustment the athlete chooses and can undo, drawn from a verifiable
   observation of the V1.7.2 weeks (js/core/week-plan.js). The same rules and words on the website and in the Android app (copied
   unchanged by mobile/scripts/sync-web-core.mjs). Pure: it reads a schedule, the cadence pauses and the journal, and returns new
   values; it never changes a session.

   The bilan of a week R (any Monday kept):
   - an observation over the last WINDOW weeks ending at R, read only from the states V1.7.2 already records (done as planned, moved,
     replaced, skipped, missed; paused weeks are left out), with the sessions it rests on (their ids, never copies of their measures);
   - the actions it allows for the week that follows, N = R + 7: keep the plan, move one slot to a free day, or pause that week;
   - a preview of the programme of N before and after, and the choice between « la semaine suivante seulement » (a V1.7.2 move
     decision on the occurrence of N) and « ma semaine type » (the typical week itself, from the Monday the V1.7.2 rule gives);
   - the origin of the choice (« review:<R> ») on what it wrote, so the programme and the next bilan can say where it came from;
   - the undo of the choice, which puts back exactly what it replaced when nothing else changed it since;
   - at the bilan of N, the change decided at R and what was observed once it applied.
   An ignored or refused suggestion writes nothing. An action can be chosen only while N has not ended.

   Storage. schedule.reviews { "<R>": { v, week, target, at, observation, action, applied, undone } } in game_state.user.schedule (the
   key the server already copies); the pause is the existing cadence pause (game_state.user.cadencePauses). Keyed by week so two
   devices' choices merge week by week (week-plan.js merge(), the most recent change of a week wins). MAX_WEEKS weeks are kept. */
(function (root) {
  "use strict";

  const VERSION = 1;
  const WINDOW = 4;
  const MIN_WEEKS = 2;
  const SHIFT_MIN = 2;
  const REGULAR_SHARE = 0.75;
  const KINDS = ["keep", "move", "pause"];
  const SCOPES = ["next", "type"];
  const RULES = Object.freeze({
    window: `Le constat lit les ${WINDOW} dernières semaines suivies, jusqu’à celle du bilan, et seulement les états enregistrés par le suivi « prévu et réalisé ».`,
    short: `Il faut au moins ${MIN_WEEKS} semaines avec un programme pour tirer un constat.`,
    shift: `Un créneau déplacé ou non fait ${SHIFT_MIN} fois ou plus est signalé.`,
    count: "Le constat compte des séances prévues et faites, jamais des kilomètres, des kilos ou des cotations : chaque source garde ses mesures.",
    choice: "Rien ne change tant que tu n’as pas confirmé ; ignorer la proposition ne modifie aucune donnée.",
  });

  const WP = () => {
    const w = root.TitanWeekPlan;
    if (!w) throw new Error("WEEK_REVIEW_NEEDS_WEEK_PLAN");
    return w;
  };
  const isKey = (k) => typeof k === "string" && /^\d{4}-\d{2}-\d{2}$/.test(k);
  const clone = (v) => JSON.parse(JSON.stringify(v ?? {}));
  const origin = (week) => `review:${week}`;
  const dayName = (i) => WP().DAY_NAMES[i];
  const p = (n, one, many) => `${n} ${n > 1 ? many : one}`;

  function record(schedule, week) {
    const r = schedule?.reviews?.[week];
    return r && typeof r === "object" && !Array.isArray(r) && KINDS.includes(r.action?.kind) ? r : null;
  }
  const active = (r) => !!r && !r.undone;

  /* ---------- Observation ---------- */

  /** Per planned slot (day index of the typical week) over the window: what the V1.7.2 weeks recorded. */
  function history(schedule, logs, { week, today, zone, pauses = [] }) {
    const W = WP();
    const R = W.weekOf(week);
    const weeks = [];
    for (let k = WINDOW - 1; k >= 0; k--) {
      const w = W.addDays(R, -7 * k);
      const v = W.week(schedule, logs, { week: w, today, zone, pauses });
      weeks.push(v);
    }
    // A week is « followed » when its programme is known (not reconstructed from a later typical week), it was not paused, and at
    // least one occurrence is settled (not still to come).
    const settled = (o) => ["done", "skipped", "missed"].includes(o.status);
    const followed = weeks.filter((v) => v.reference.source !== "reconstructed" && !v.paused && v.summary.planned > 0 && v.occurrences.some(settled));
    const slots = [];
    for (let i = 0; i < 7; i++) {
      const s = { index: i, sport: null, weeks: 0, asPlanned: 0, adjusted: 0, moved: [], replaced: 0, skipped: 0, missed: 0, sources: [], occurrences: [] };
      for (const v of followed) {
        const o = v.occurrences.find((x) => x.index === i);
        if (!o || !settled(o)) continue;
        s.sport = s.sport || o.planned.sport;
        s.weeks++;
        s.occurrences.push(o.id);
        if (o.link) s.sources.push(o.link.session);
        // A move decided at a bilan (origin « review:… ») and done on the day decided is the plan the athlete chose: it counts as
        // done as planned (adjusted), never as one more move. The next bilan reads it in its follow-up.
        const decided = typeof o.decision?.origin === "string" && o.decision.origin.startsWith("review:");
        if (decided) s.adjusted++;
        if (o.status === "done" && (!o.gap || (decided && o.gap === "moved" && o.actual.day === o.effective.day))) s.asPlanned++;
        else if (o.gap === "moved") s.moved.push({ week: v.week, day: W.dayIndex(o.actual.day), occurrence: o.id, session: o.link?.session || null });
        else if (o.gap === "replaced") s.replaced++;
        else if (o.gap === "skipped") s.skipped++;
        else if (o.gap === "missed") s.missed++;
      }
      if (s.weeks) slots.push(s);
    }
    return { week: R, weeks, followed: followed.map((v) => v.week), slots };
  }

  /** The days of a week's programme, as V1.7.2 reads them (reference of that Monday). */
  const referenceDays = (schedule, week, today) => WP().reference(schedule, week, { current: WP().weekOf(today) }).days;

  /** True when the bilan before R moved this slot to this day for R only, and the follow-up saw it done there. */
  function tested(schedule, logs, opts, R, from, to) {
    const f = followUp(schedule, logs, { ...opts, week: R });
    return !!f && !f.undone && f.state === "done" && f.review.action.kind === "move" && f.review.action.scope === "next" && f.review.action.from === from && f.review.action.to === to;
  }

  /** The one observation of the bilan, and the action it suggests. */
  function observe(schedule, logs, opts) {
    const W = WP();
    const h = history(schedule, logs, opts);
    const R = h.week;
    const next = W.addDays(R, 7);
    const nextDays = referenceDays(schedule, next, opts.today);
    const free = (i) => !nextDays[i];
    const base = { week: R, window: WINDOW, followed: h.followed.length, weeks: h.followed, slots: h.slots.map((s) => ({ index: s.index, sport: s.sport, weeks: s.weeks, asPlanned: s.asPlanned, adjusted: s.adjusted, moved: s.moved.length, replaced: s.replaced, skipped: s.skipped, missed: s.missed })) };
    if (h.followed.length < MIN_WEEKS) {
      return { ...base, kind: "short", slot: null, sources: h.slots.flatMap((s) => s.sources), suggestion: { kind: "keep" } };
    }
    // A slot moved or missed SHIFT_MIN times or more: the most shifted one (then the earliest in the week).
    const shifted = h.slots
      .filter((s) => s.moved.length + s.missed >= SHIFT_MIN && nextDays[s.index])
      .sort((a, b) => b.moved.length + b.missed - (a.moved.length + a.missed) || a.index - b.index)[0];
    if (shifted) {
      const tally = new Map();
      for (const m of shifted.moved) tally.set(m.day, (tally.get(m.day) || 0) + 1);
      const best = [...tally.entries()].filter(([d]) => d !== shifted.index && free(d)).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
      const sources = shifted.moved.map((m) => m.session).filter(Boolean);
      return {
        ...base,
        kind: shifted.moved.length >= SHIFT_MIN ? "moved" : "missed",
        slot: { index: shifted.index, sport: shifted.sport, weeks: shifted.weeks, moved: shifted.moved.length, missed: shifted.missed, days: [...tally.entries()].sort((a, b) => a[0] - b[0]).map(([day, n]) => ({ day, n })), occurrences: shifted.occurrences },
        sources,
        // After a week that tested the same move and kept it, the suggestion is to make it the typical week.
        suggestion: best ? { kind: "move", from: shifted.index, to: best[0], scope: tested(schedule, logs, opts, R, shifted.index, best[0]) ? "type" : "next" } : { kind: "move", from: shifted.index, to: null, scope: "next" },
      };
    }
    const total = h.slots.reduce((n, s) => n + s.weeks, 0);
    const asPlanned = h.slots.reduce((n, s) => n + s.asPlanned, 0);
    const regular = h.slots.filter((s) => s.weeks >= MIN_WEEKS && s.asPlanned / s.weeks >= REGULAR_SHARE);
    return {
      ...base,
      kind: total && asPlanned / total >= REGULAR_SHARE ? "regular" : "mixed",
      slot: null,
      total,
      asPlanned,
      regular: regular.map((s) => s.index),
      sources: h.slots.flatMap((s) => s.sources),
      suggestion: { kind: "keep" },
    };
  }

  /* ---------- Actions, preview, apply, undo ---------- */

  /** The actions the bilan of week R allows on N = R + 7, given what is already decided. */
  function actions(schedule, logs, { week, today, zone, pauses = [] }) {
    const W = WP();
    const R = W.weekOf(week);
    const N = W.addDays(R, 7);
    const current = W.weekOf(today);
    const open = N >= current;
    const days = referenceDays(schedule, N, today);
    const v = W.week(schedule, logs, { week: N, today, zone, pauses });
    const movable = v.occurrences
      .filter((o) => !["done", "skipped"].includes(o.status) && (N > current || o.effective.day >= today))
      .map((o) => o.index);
    const targets = [0, 1, 2, 3, 4, 5, 6].filter((i) => !days[i] && W.addDays(N, i) >= today);
    const paused = (pauses || []).includes(N);
    return {
      week: R, target: N, open, decided: record(schedule, R),
      keep: open,
      move: open && movable.length > 0 && targets.length > 0 ? { from: movable, to: targets } : null,
      pause: open && !paused ? true : false,
      alreadyPaused: paused,
    };
  }

  function check(schedule, logs, opts, action) {
    if (!action || !KINDS.includes(action.kind)) throw new Error("WEEK_REVIEW_BAD_ACTION");
    const a = actions(schedule, logs, opts);
    if (!a.open) throw new Error("WEEK_REVIEW_CLOSED");
    if (active(a.decided)) throw new Error("WEEK_REVIEW_ALREADY_DECIDED");
    if (action.kind === "pause" && !a.pause) throw new Error("WEEK_REVIEW_ALREADY_PAUSED");
    if (action.kind === "move") {
      if (!a.move || !a.move.from.includes(action.from) || !a.move.to.includes(action.to)) throw new Error("WEEK_REVIEW_BAD_MOVE");
      if (!SCOPES.includes(action.scope)) throw new Error("WEEK_REVIEW_BAD_SCOPE");
    }
    return a;
  }

  /** Apply an action to a schedule (and the pauses) without recording it: the result is what the preview shows. */
  function write(schedule, pauses, a, action, { today, at }) {
    const W = WP();
    let next = clone(schedule);
    let nextPauses = [...(pauses || [])];
    const applied = {};
    if (action.kind === "move" && action.scope === "next") {
      const id = `${a.target}/${action.from}`;
      const prior = next.weeks?.[a.target]?.occ?.[id] || null;
      next = W.decide(next, id, { kind: "move", day: W.addDays(a.target, action.to) }, { today, at });
      next.weeks[a.target].occ[id].origin = origin(a.week);
      applied.occurrence = id;
      applied.prior = prior;
    } else if (action.kind === "move" && action.scope === "type") {
      const fromKey = W.DAY_KEYS[action.from], toKey = W.DAY_KEYS[action.to];
      const slot = next[fromKey] || {};
      applied.days = { [fromKey]: next[fromKey] ?? null, [toKey]: next[toKey] ?? null };
      let r = W.editType(next, toKey, { sport: slot.sport, minutes: slot.minutes, note: slot.note }, { today, at });
      r = W.editType(r.schedule, fromKey, null, { today, at });
      next = r.schedule;
      applied.from = r.appliesFrom;
      applied.wrote = { [fromKey]: next[fromKey] ?? null, [toKey]: next[toKey] ?? null };
      if (next.revisions?.[r.appliesFrom]) next.revisions[r.appliesFrom].origin = origin(a.week);
    } else if (action.kind === "pause") {
      nextPauses = [...nextPauses, a.target].slice(-52);
      applied.pause = a.target;
    }
    return { schedule: next, pauses: nextPauses, applied };
  }

  /** What the programme looks like before and after: the sport of each day of the week that changes, and the words. */
  function preview(schedule, logs, opts, action) {
    const W = WP();
    const a = check(schedule, logs, opts, action);
    const at = opts.at || new Date().toISOString();
    const w = write(schedule, opts.pauses, a, action, { today: opts.today, at });
    const week = action.kind === "move" && action.scope === "type" ? w.applied.from : a.target;
    const days = (s, pauses) => {
      const v = W.week(s, logs, { week, today: opts.today, zone: opts.zone, pauses });
      const out = [null, null, null, null, null, null, null];
      for (const o of v.occurrences) if (o.status !== "skipped") { const i = W.dayIndex(o.effective.day); if (!out[i]) out[i] = o.effective.sport; }
      return { days: out, paused: v.paused };
    };
    const before = days(schedule, opts.pauses);
    const after = days(w.schedule, w.pauses);
    const changes = [];
    for (let i = 0; i < 7; i++) if (before.days[i] !== after.days[i]) changes.push({ index: i, before: before.days[i], after: after.days[i] });
    return { week: a.week, target: a.target, appliesFrom: week, scope: action.kind === "move" ? action.scope : "next", action: clean(action), before, after, changes };
  }

  const clean = (action) => (action.kind === "move" ? { kind: "move", from: action.from, to: action.to, scope: action.scope } : { kind: action.kind, scope: "next" });

  /** Confirm the action. Returns { schedule, pauses, review } — new values; the inputs are not changed. */
  function apply(schedule, logs, opts, action) {
    const a = check(schedule, logs, opts, action);
    const at = opts.at || new Date().toISOString();
    const obs = observe(schedule, logs, opts);
    const w = write(schedule, opts.pauses, a, action, { today: opts.today, at });
    const out = w.schedule;
    out.reviews = out.reviews && typeof out.reviews === "object" && !Array.isArray(out.reviews) ? out.reviews : {};
    out.reviews[a.week] = {
      v: VERSION, week: a.week, target: a.target, at,
      observation: { kind: obs.kind, slot: obs.slot ? { index: obs.slot.index, sport: obs.slot.sport } : null, sources: obs.sources.slice(0, 12), suggested: obs.suggestion?.kind === action.kind },
      action: clean(action),
      applied: w.applied,
      undone: null,
    };
    return { schedule: prune(out, opts.today), pauses: w.pauses, review: out.reviews[a.week] };
  }

  /** Undo the choice of the bilan of week R. What it wrote is put back when it is still there; a later change is left as it is
      (kept: true lists what was left). Returns { schedule, pauses, review, kept }. */
  function undo(schedule, pauses, { week, today, at = new Date().toISOString() }) {
    const W = WP();
    const R = W.weekOf(week);
    const rec = record(schedule, R);
    if (!active(rec)) throw new Error("WEEK_REVIEW_NOTHING_TO_UNDO");
    if (W.addDays(rec.target, 6) < today) throw new Error("WEEK_REVIEW_CLOSED");
    let next = clone(schedule);
    let nextPauses = [...(pauses || [])];
    const kept = [];
    const ap = rec.applied || {};
    if (rec.action.kind === "move" && rec.action.scope === "next" && ap.occurrence) {
      const cur = next.weeks?.[rec.target]?.occ?.[ap.occurrence];
      if (cur?.origin === origin(R)) {
        if (ap.prior) next.weeks[rec.target].occ[ap.occurrence] = { ...ap.prior, at };
        else next = W.decide(next, ap.occurrence, { kind: "reset" }, { today, at });
      } else kept.push("occurrence");
    } else if (rec.action.kind === "move" && rec.action.scope === "type" && ap.days) {
      for (const [key, value] of Object.entries(ap.days)) {
        if (JSON.stringify(next[key] ?? null) !== JSON.stringify(ap.wrote?.[key] ?? null)) { kept.push(key); continue; }
        next = W.editType(next, key, value && value.sport ? value : null, { today, at }).schedule;
      }
    } else if (rec.action.kind === "pause" && ap.pause) {
      if (nextPauses.includes(ap.pause)) nextPauses = nextPauses.filter((x) => x !== ap.pause);
      else kept.push("pause");
    }
    next.reviews = { ...(next.reviews || {}) };
    next.reviews[R] = { ...clone(rec), undone: at };
    return { schedule: next, pauses: nextPauses, review: next.reviews[R], kept };
  }

  function prune(schedule, today) {
    const W = WP();
    if (!isKey(today) || !schedule.reviews) return schedule;
    const oldest = W.addDays(W.weekOf(today), -7 * (W.MAX_WEEKS - 1));
    for (const k of Object.keys(schedule.reviews)) if (!isKey(k) || k < oldest) delete schedule.reviews[k];
    return schedule;
  }

  /** Two devices' choices, week by week: the most recent change (confirmation or undo) of a week wins. */
  function mergeReviews(a, b) {
    const x = a && typeof a === "object" ? a : {}, y = b && typeof b === "object" ? b : {};
    const stamp = (r) => String(r?.undone || r?.at || "");
    const out = {};
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) out[k] = clone(!x[k] ? y[k] : !y[k] ? x[k] : stamp(y[k]) > stamp(x[k]) ? y[k] : x[k]);
    return out;
  }

  /* ---------- Follow-up: the change decided at the previous bilan, and what was observed after ---------- */

  function followUp(schedule, logs, { week, today, zone, pauses = [] }) {
    const W = WP();
    const N = W.weekOf(week);
    const R = W.addDays(N, -7);
    const rec = record(schedule, R);
    if (!rec || rec.target !== N) return null;
    const v = W.week(schedule, logs, { week: N, today, zone, pauses });
    const out = { week: R, target: N, review: clone(rec), undone: !!rec.undone, state: null, session: null, occurrence: null, summary: v.summary, paused: v.paused };
    if (rec.undone) return out;
    const a = rec.action;
    if (a.kind === "move") {
      const o = a.scope === "next"
        ? v.occurrences.find((x) => x.id === `${N}/${a.from}`)
        : v.occurrences.find((x) => x.index === a.to) || null;
      out.occurrence = o ? o.id : null;
      if (a.scope === "type" && rec.applied?.from && rec.applied.from > N) out.state = "later";
      else if (!o) out.state = "gone";
      else if (o.status === "done") {
        out.session = o.link?.session || null;
        out.state = W.dayIndex(o.actual.day) === a.to ? (o.gap === "replaced" ? "replaced" : "done") : "elsewhere";
        out.actualDay = W.dayIndex(o.actual.day);
      } else if (o.status === "missed") {
        out.state = "missed";
        // A session of the same sport left outside the plan that week is said, never tied for the athlete.
        const e = v.extra.find((x) => x.sport === o.effective.sport);
        if (e) { out.session = e.id; out.extraDay = W.dayIndex(e.day); }
      }
      else if (o.status === "skipped") out.state = "skipped";
      else if (o.status === "paused") out.state = "paused";
      else if (o.status === "ask") out.state = "ask";
      else out.state = "upcoming";
    } else if (a.kind === "pause") {
      out.state = v.paused ? (today >= W.addDays(N, 6) ? "paused" : "pausing") : "unpaused";
    } else {
      // The bilan of a week is read from its Sunday: what happened by then is what is observed.
      const over = today >= W.addDays(N, 6);
      out.state = over ? "kept" : "keeping";
    }
    return out;
  }

  /* ---------- The bilan, its words ---------- */

  /** Everything the bilan of week R shows. */
  function review(schedule, logs, opts) {
    if (!isKey(opts?.today)) throw new Error("WEEK_REVIEW_TODAY_REQUIRED");
    const W = WP();
    const R = W.weekOf(isKey(opts.week) ? opts.week : opts.today);
    const o = { ...opts, week: R };
    const out = { version: VERSION, week: R, target: W.addDays(R, 7), observation: observe(schedule, logs, o), actions: actions(schedule, logs, o), followUp: followUp(schedule, logs, o) };
    out.signature = [R, out.observation.kind, out.observation.slot ? `${out.observation.slot.index}:${out.observation.slot.moved}:${out.observation.slot.missed}` : "-", out.observation.sources.join("+"), out.actions.decided ? `${out.actions.decided.action.kind}:${out.actions.decided.undone ? "undone" : "on"}` : "", out.followUp ? out.followUp.state || "undone" : ""].join("|");
    return out;
  }

  /** The measure of the cahier des charges, from what is stored: decisions confirmed, undone, and adjustments found at the next bilan
      (the next week has ended or has a settled occurrence the follow-up can show). */
  function measure(schedule, logs, { today, zone, pauses = [] }) {
    const list = Object.values(schedule?.reviews || {}).filter((r) => r && KINDS.includes(r.action?.kind));
    const confirmed = list.filter((r) => !r.undone);
    const found = confirmed.filter((r) => {
      const f = followUp(schedule, logs, { week: r.target, today, zone, pauses });
      return f && !["upcoming", "keeping", "pausing", "later"].includes(f.state);
    });
    return { confirmed: confirmed.length, undone: list.length - confirmed.length, found: found.length };
  }

  function describeObservation(obs, { label = (s) => s } = {}) {
    const weeks = p(obs.followed, "semaine suivie", "semaines suivies");
    if (obs.kind === "short") {
      return {
        title: "Historique trop court pour un constat",
        text: `${obs.followed ? `Seulement ${weeks}` : "Aucune semaine suivie"} sur les ${WINDOW} dernières : il en faut au moins ${MIN_WEEKS} avec un programme et des séances reliées. Tu peux enrichir ton historique ou garder ton plan tel quel.`,
      };
    }
    const lines = obs.slots.map((s) => {
      const parts = [`${s.asPlanned}/${s.weeks} comme prévu${s.adjusted ? ` (dont ${s.adjusted} au jour choisi au bilan)` : ""}`];
      if (s.moved) parts.push(p(s.moved, "déplacée", "déplacées"));
      if (s.replaced) parts.push(p(s.replaced, "remplacée", "remplacées"));
      if (s.skipped) parts.push(p(s.skipped, "écartée", "écartées"));
      if (s.missed) parts.push(p(s.missed, "non faite", "non faites"));
      return `${label(s.sport)} du ${dayName(s.index)} : ${parts.join(", ")}.`;
    });
    if (obs.kind === "moved" || obs.kind === "missed") {
      const s = obs.slot;
      const where = s.days.length ? ` Faite ${s.days.map((d) => `${dayName(d.day)} ${d.n === 1 ? "une fois" : `${d.n} fois`}`).join(", ")}.` : "";
      const what = obs.kind === "moved" ? `déplacé ${s.moved} fois${s.missed ? ` et non fait ${s.missed} fois` : ""}` : `non fait ${s.missed} fois${s.moved ? ` et déplacé ${s.moved} fois` : ""}`;
      return { title: `Le créneau du ${dayName(s.index)} (${label(s.sport)}) a été ${what} sur ${weeks}`, text: `${where.trim()}`.trim(), lines };
    }
    if (obs.kind === "regular") {
      const reg = obs.regular.map((i) => obs.slots.find((s) => s.index === i)).filter(Boolean).map((s) => `${label(s.sport)} du ${dayName(s.index)}`);
      return { title: `Tes séances prévues sont régulières : ${obs.asPlanned}/${obs.total} faites comme prévu sur ${weeks}`, text: reg.length ? `Régulières : ${reg.join(", ")}.` : "", lines };
    }
    return { title: `${obs.asPlanned}/${obs.total} séances faites comme prévu sur ${weeks}`, text: "Aucun créneau n’a été déplacé ou manqué deux fois : rien ne se dégage encore.", lines };
  }

  function describeAction(action, { label = (s) => s, sport = null, target = null } = {}) {
    if (action.kind === "keep") return "Reconduire le plan";
    if (action.kind === "pause") return "Mettre la semaine en pause";
    const what = sport ? `${label(sport)} ` : "";
    const scope = action.scope === "type" ? " dans ma semaine type" : action.scope === "next" ? " la semaine suivante" : "";
    return `Déplacer ${what}du ${dayName(action.from)} au ${action.to === null || action.to === undefined ? "…" : dayName(action.to)}${scope}`;
  }

  /** The words of a preview: the lines that change, where it applies, and what it does not touch. */
  function describePreview(pv, { label = (s) => s, dayLong = (k) => k } = {}) {
    const name = (s) => (s ? label(s) : "libre");
    const lines = pv.changes.map((c) => `${dayName(c.index)[0].toUpperCase()}${dayName(c.index).slice(1)} : ${name(c.before)} → ${name(c.after)}`);
    let where;
    if (pv.action.kind === "pause") where = `La semaine du ${dayLong(pv.target)} est mise en pause : la cadence ne la compte pas et ce qui n’est pas fait ne compte aucun écart. Le programme reste affiché, la semaine type ne change pas.`;
    else if (pv.action.kind === "keep") where = `La semaine du ${dayLong(pv.target)} garde le programme de ta semaine type. Rien n’est modifié ; le choix est noté pour le prochain bilan.`;
    else if (pv.scope === "next") where = `Seulement la semaine du ${dayLong(pv.target)}. Ta semaine type ne change pas.`;
    else where = `Ta semaine type change à partir du ${dayLong(pv.appliesFrom)}${pv.appliesFrom > pv.target ? ` : la semaine du ${dayLong(pv.target)} a déjà commencé et garde son programme de départ` : ""}.`;
    return { lines: lines.length ? lines : ["Aucun jour ne change."], where, undo: "Tu pourras annuler ce choix tant que la semaine n’est pas finie." };
  }

  /** The words of the follow-up at the next bilan: the change decided, then what was observed after it applied. */
  function describeFollowUp(f, { label = (s) => s, dayLong = (k) => k } = {}) {
    if (!f) return null;
    const a = f.review.action;
    const sport = f.review.observation?.slot?.sport;
    const act = describeAction(a, { label, sport });
    const decided = `Décidé au bilan de la semaine du ${dayLong(f.week)} : ${act[0].toLowerCase()}${act.slice(1)}${a.kind === "keep" || a.kind === "pause" ? ` (semaine du ${dayLong(f.target)})` : ""}.`;
    if (f.undone) return { decided, observed: "Ce choix a été annulé : la semaine a gardé son programme.", tone: "muted" };
    const at = (i) => dayName(i);
    const map = {
      done: `Observé après : ${sport ? label(sport) : "la séance"} faite le ${at(a.to)}, comme décidé.`,
      replaced: `Observé après : le créneau du ${at(a.to)} a été fait avec un autre sport.`,
      elsewhere: `Observé après : faite, mais le ${f.actualDay !== undefined ? at(f.actualDay) : "un autre jour"} plutôt que le ${at(a.to)}.`,
      missed: `Observé après : la séance du ${at(a.to)} n’a pas été faite${f.extraDay !== undefined ? ` ; une séance ${sport ? label(sport) : ""} hors programme a eu lieu le ${at(f.extraDay)}` : ""}.`.replace("  ", " "),
      skipped: `Observé après : la séance du ${at(a.to)} a été écartée.`,
      paused: f.review.action.kind === "pause" ? `Observé après : semaine en pause, ${p(f.summary.done, "séance faite", "séances faites")}, aucun écart compté.` : "Observé après : la semaine a été mise en pause.",
      pausing: "La semaine est en pause : le constat viendra quand elle sera finie.",
      unpaused: "Observé après : la pause a été retirée ensuite.",
      ask: `Observé après : une séance attend ton choix pour le créneau du ${at(a.to)}.`,
      upcoming: `À venir : le créneau du ${at(a.to)} n’est pas encore passé.`,
      later: `Ta semaine type change à partir du ${dayLong(f.review.applied?.from)} : cette semaine a gardé son programme de départ.`,
      gone: "Le créneau déplacé n’est plus dans le programme de cette semaine.",
      kept: `Observé après : ${f.summary.asPlanned}/${f.summary.planned} faites comme prévu, ${p(f.summary.gaps, "écart", "écarts")}.`,
      keeping: `En cours : ${f.summary.done}/${f.summary.planned} faites pour l’instant.`,
    };
    const tone = ["done", "kept", "paused"].includes(f.state) ? "ok" : ["missed", "elsewhere", "skipped", "replaced", "ask"].includes(f.state) ? "warn" : "muted";
    return { decided, observed: map[f.state] || "", tone };
  }

  /** A JSON projection (parity between clients, tests). */
  function snapshot(r) {
    return {
      week: r.week, target: r.target,
      observation: { kind: r.observation.kind, followed: r.observation.followed, weeks: r.observation.weeks, slot: r.observation.slot, slots: r.observation.slots, sources: r.observation.sources, suggestion: r.observation.suggestion },
      actions: { open: r.actions.open, keep: r.actions.keep, move: r.actions.move, pause: r.actions.pause, alreadyPaused: r.actions.alreadyPaused, decided: r.actions.decided ? { action: r.actions.decided.action, undone: !!r.actions.decided.undone, applied: r.actions.decided.applied } : null },
      followUp: r.followUp ? { week: r.followUp.week, target: r.followUp.target, undone: r.followUp.undone, state: r.followUp.state, session: r.followUp.session, occurrence: r.followUp.occurrence } : null,
      signature: r.signature,
    };
  }

  /** The adjustments of the bilans that act on week `week` (its programme says where its change comes from). */
  function adjustments(schedule, { week, today }) {
    const W = WP();
    const w = W.weekOf(week || today);
    return Object.values(schedule?.reviews || {})
      .filter((r) => active(r) && KINDS.includes(r.action?.kind) && (r.target === w || (r.action.kind === "move" && r.action.scope === "type" && r.applied?.from === w)))
      .sort((a, b) => (a.week < b.week ? 1 : -1));
  }

  /** A source session's own measures, in its sport's units (the journal's values: never converted, never added across sports). */
  function measureOf(log) {
    if (!log) return "";
    const F = root.TitanFormat;
    const d = log.details && typeof log.details === "object" ? log.details : {};
    const parts = [];
    const minutes = Number(d.duration ?? d.minutes ?? (log.unit === "min" ? log.val : NaN));
    if (minutes > 0) parts.push(F?.duration ? F.duration(minutes) : `${Math.round(minutes)} min`);
    if (log.unit === "km" && Number(log.val) > 0) parts.push(F?.distance ? F.distance(Number(log.val)) : `${Number(log.val)} km`);
    const elev = Number(d.elevation ?? d.elevationGain);
    if (elev > 0) parts.push(`D+ ${Math.round(elev)} m`);
    const ex = Array.isArray(d.exercises) ? d.exercises : [];
    const sets = ex.reduce((n, e) => n + (Array.isArray(e?.setRows) ? e.setRows.length : Number(e?.sets) > 0 ? Number(e.sets) : 0), 0);
    if (sets) parts.push(`${ex.length} exercice${ex.length > 1 ? "s" : ""}, ${sets} série${sets > 1 ? "s" : ""}`);
    const x = d.extras && typeof d.extras === "object" ? d.extras : {};
    if (x.max_done) parts.push(`${x.max_done}${x.grade_system ? ` (${x.grade_system})` : ""}`);
    if (log.syncStatus === "pending") parts.push("en attente d’envoi");
    return parts.join(" · ");
  }

  const api = { VERSION, WINDOW, MIN_WEEKS, SHIFT_MIN, RULES, history, observe, actions, preview, apply, undo, mergeReviews, followUp, review, measure, adjustments, snapshot, describeObservation, describeAction, describePreview, describeFollowUp, measureOf, origin };
  root.TitanWeekReview = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
