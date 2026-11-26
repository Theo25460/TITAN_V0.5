// V1.7.6 — replays one case of tests/fixtures/block-scenario-v176.json through the week-plan, training-block and block-scenario
// modules (the website's, or the Android copy: the modules are passed in). CommonJS so the Android Jest suite requires the very same
// replay. Ops: V1.7.2 typical-week edits and decisions, cadence pauses, V1.7.4 block create and shift, and the scenario operations
// (sc-create, sc-day, sc-name, sc-copy, sc-place, sc-add, sc-avail, sc-fit, sc-discard, sc-apply, sc-undo). An op with `expect` must
// be refused with that error and change nothing. `remote` ops run on another device from the state reached after `ops` minus the last
// `split` ops, and are merged (week-plan.js merge) in both orders.
"use strict";

function replay(W, B, S, fixture, c) {
  const journal = fixture.logs.filter((l) => (c.journal || []).includes(l.id));
  // An action is taken with the journal of that moment: the sessions recorded before it.
  const until = (at) => journal.filter((l) => !at || new Date(l.date).getTime() <= new Date(at).getTime());
  const refusals = [];
  const previews = [];
  const step = (st, op) => {
    const o = { today: op.today, at: op.at, zone: fixture.zone, pauses: st.pauses, logs: until(op.at) };
    const keep = (r) => {
      if (op.preview) previews.push({ op: op.op, preview: r.preview });
      return op.dry ? st : { ...st, schedule: r.schedule };
    };
    switch (op.op) {
      case "edit": return { ...st, schedule: W.editType(st.schedule, op.day, op.value, { today: op.today, at: op.at }).schedule };
      case "decide": return { ...st, schedule: W.decide(st.schedule, op.id, op.decision, { today: op.today, at: op.at }) };
      case "pause": return { ...st, pauses: st.pauses.includes(op.week) ? st.pauses.filter((x) => x !== op.week) : [...st.pauses, op.week] };
      case "block": return { ...st, schedule: B.create(st.schedule, op.input, o).schedule };
      case "shift": return { ...st, schedule: B.shift(st.schedule, op.block, op.args, o).schedule };
      case "sc-create": return keep(S.create(st.schedule, op.input, o));
      case "sc-day": return keep(S.setDay(st.schedule, op.id, op.args, o));
      case "sc-name": return keep(S.rename(st.schedule, op.id, op.args, o));
      case "sc-copy": return keep(S.copyVariant(st.schedule, op.id, op.args, o));
      case "sc-place": return keep(S.placeMilestone(st.schedule, op.id, op.args, o));
      case "sc-add": return keep(S.addMilestone(st.schedule, op.id, op.args, o));
      case "sc-avail": return keep(S.setAvailability(st.schedule, op.id, op.args, o));
      case "sc-fit": return keep(S.fit(st.schedule, op.id, op.args, o));
      case "sc-discard": return keep(S.discard(st.schedule, op.id, o));
      case "sc-apply": return keep(S.apply(st.schedule, until(op.at), op.id, op.args, o));
      case "sc-undo": return keep(S.undo(st.schedule, until(op.at), op.id, o));
      default: throw new Error(`unknown op ${op.op}`);
    }
  };
  const run = (start, ops) => ops.reduce((st, op) => {
    if (!op.expect) return step(st, op);
    const before = JSON.stringify(st);
    let code = null;
    try { step(st, op); } catch (e) { code = e.message; }
    refusals.push({ op: op.op, expect: op.expect, got: code, unchanged: JSON.stringify(st) === before });
    return st;
  }, start);
  const start = { schedule: JSON.parse(JSON.stringify(c.type || fixture.type)), pauses: [] };
  const ops = c.ops || [];
  let st;
  if (c.remote) {
    const base = run(start, ops.slice(0, ops.length - (c.split || 0)));
    const here = run(base, ops.slice(ops.length - (c.split || 0)));
    const there = run(base, c.remote);
    const pauses = [...new Set([...here.pauses, ...there.pauses])].sort();
    st = { schedule: W.merge(here.schedule, there.schedule), pauses, other: { schedule: W.merge(there.schedule, here.schedule), pauses } };
  } else st = run(start, ops);
  const r = c.read;
  const opts = { today: r.today, zone: fixture.zone, pauses: st.pauses };
  const weeks = fixture.weeks;
  // The calendar of every week of the test set, as the planning reads it: the sport and the minutes of each day.
  const calendar = (schedule) => {
    const current = W.weekOf(r.today);
    const out = {};
    for (const m of weeks) out[m] = W.reference(schedule, m, { current }).days.map((d) => (d ? `${d.sport}:${d.minutes ?? "?"}` : null));
    return out;
  };
  const weekSnaps = (schedule) => (r.weeks || []).map((w) => W.snapshot(W.week(schedule, journal, { week: w, today: r.today, zone: fixture.zone, pauses: st.pauses })));
  const compare = (schedule) => (r.compare || []).map((id) => S.compare(schedule, journal, id, opts));
  return {
    ...st,
    journal,
    refusals,
    previews,
    calendar: calendar(st.schedule),
    otherCalendar: st.other ? calendar(st.other.schedule) : null,
    weeks: weekSnaps(st.schedule),
    otherWeeks: st.other ? weekSnaps(st.other.schedule) : null,
    compare: compare(st.schedule),
    otherCompare: st.other ? compare(st.other.schedule) : null,
    blocks: B.list(st.schedule, journal, opts),
    context: (r.context || []).map((w) => B.weekContext(st.schedule, journal, { ...opts, week: w })),
    followUp: (r.followUp || []).map((w) => S.followUp(st.schedule, journal, { ...opts, week: w })),
    measure: S.measure(st.schedule),
    // What the active programme is made of: the scenario drafts never enter it.
    active: JSON.stringify({ blocks: st.schedule.blocks || null, weeks: st.schedule.weeks || null, revisions: st.schedule.revisions || null }),
    opts,
  };
}

/** The output both clients must give for a case (the expected file stores it). */
function project(W, B, S, res, label, dayLong) {
  const words = { label, dayLong };
  const strip = (pv) => ({ kind: pv.kind, variant: pv.variant, from: pv.from, kept: pv.kept, lived: pv.lived, sessions: pv.sessions, occurrences: pv.occurrences.map((o) => ({ id: o.id, change: o.change, before: o.before, after: o.after })), exceptions: pv.exceptions, milestones: pv.milestones || null, conflicts: pv.conflicts || null, created: pv.created ?? null, block: pv.block ?? null });
  return {
    calendar: res.calendar,
    sameOnBothDevices: res.otherCalendar ? JSON.stringify(res.otherCalendar) === JSON.stringify(res.calendar) && JSON.stringify(res.otherWeeks) === JSON.stringify(res.weeks) && JSON.stringify(res.otherCompare.map(S.snapshot)) === JSON.stringify(res.compare.map(S.snapshot)) : null,
    weeks: res.weeks,
    compare: res.compare.map((c) => ({ ...S.snapshot(c), words: S.describeComparison(c, words) })),
    previews: res.previews.filter((x) => x.preview).map((x) => ({ op: x.op, ...strip(x.preview), words: S.describePreview(x.preview, words) })),
    refusals: res.refusals,
    blocks: res.blocks.map((v) => B.snapshot(v)),
    context: res.context.map((c) => (c ? { id: c.id, label: c.label, changes: c.changes.map((x) => ({ kind: x.kind, words: B.describeChange(x, words) })) } : null)),
    followUp: res.followUp.map((f) => (f ? { variant: f.variant, week: f.week, undone: f.undone, lived: f.lived, planned: f.planned, done: f.done, summary: f.summary, words: S.describeFollowUp(f, words) } : null)),
    measure: res.measure,
    journal: res.journal.map((l) => l.id),
  };
}

module.exports = { replay, project };
