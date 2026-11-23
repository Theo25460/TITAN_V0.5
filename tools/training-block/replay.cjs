// V1.7.4 — replays one case of tests/fixtures/training-block-v174.json through the week-plan and training-block modules (the website's,
// or the Android copy: the modules are passed in). CommonJS so the Android Jest suite requires the very same replay.
// Ops: V1.7.2 typical-week edits and decisions, cadence pauses, and the block operations (create, week, copy, shift, milestone,
// declare, remove, duplicate). An op with `expect` must be refused with that error, and changes nothing. `remote` ops run on another
// device from the state reached after `ops` minus the last `split` ops, and are merged (week-plan.js merge) in the order given.
"use strict";

function replay(W, B, fixture, c) {
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
      case "create": return keep(B.create(st.schedule, op.input, o));
      case "week": return keep(B.editWeek(st.schedule, op.block, op.args, o));
      case "copy": return keep(B.duplicateWeek(st.schedule, op.block, op.args, o));
      case "shift": return keep(B.shift(st.schedule, op.block, op.args, o));
      case "milestone": return keep(B.setMilestone(st.schedule, op.block, op.args, o));
      case "declare": return { ...st, schedule: B.declare(st.schedule, op.block, op.args, o).schedule };
      case "remove": return keep(B.remove(st.schedule, op.block, o));
      case "duplicate": return keep(B.duplicate(st.schedule, op.block, op.args, o));
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
  const weeks = (schedule) => (r.weeks || []).map((w) => W.snapshot(W.week(schedule, journal, { week: w, today: r.today, zone: fixture.zone, pauses: st.pauses })));
  return {
    ...st,
    journal,
    refusals,
    previews,
    blocks: B.list(st.schedule, journal, opts),
    weeks: weeks(st.schedule),
    otherWeeks: st.other ? weeks(st.other.schedule) : null,
    otherBlocks: st.other ? B.list(st.other.schedule, journal, opts) : null,
    context: (r.context || []).map((w) => B.weekContext(st.schedule, journal, { ...opts, week: w })),
    measure: B.measure(st.schedule, journal, opts),
    opts,
  };
}

/** The output both clients must give for a case (the expected file stores it). */
function project(W, B, res, label, dayLong) {
  const words = { label, dayLong };
  return {
    blocks: res.blocks.map((v) => ({
      ...B.snapshot(v),
      words: { goal: B.describeGoal(v.goal, words), milestones: v.milestones.map((m) => B.describeMilestone(m, words)) },
      conflict: v.conflict,
    })),
    weeks: res.weeks,
    sameOnBothDevices: res.otherWeeks ? JSON.stringify(res.otherWeeks) === JSON.stringify(res.weeks) && JSON.stringify(res.otherBlocks.map(B.snapshot)) === JSON.stringify(res.blocks.map(B.snapshot)) : null,
    previews: res.previews.map((x) => ({ op: x.op, from: x.preview.from, weeks: x.preview.weeks.filter((w) => w.changed).map((w) => ({ week: w.week, before: w.before.label, after: w.after.label, days: w.after.days })), milestones: x.preview.milestones, exceptions: x.preview.exceptions, pauses: x.preview.pauses, goal: x.preview.goal, words: B.describePreview(x.preview, words) })),
    refusals: res.refusals,
    context: res.context.map((c) => (c ? { id: c.id, index: c.index, label: c.label, applied: c.applied, before: c.before, milestones: c.milestones.map((m) => ({ id: m.id, state: m.state })), changes: c.changes.map((x) => ({ kind: x.kind, words: B.describeChange(x, words) })) } : null)),
    measure: res.measure,
    pauses: res.pauses,
  };
}

module.exports = { replay, project };
