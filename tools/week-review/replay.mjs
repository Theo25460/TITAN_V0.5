// V1.7.3 — replays one case of tests/fixtures/week-review-v173.json through the week-plan and week-review modules (the website's, or
// the Android copy). Ops: V1.7.2 decisions and typical-week edits, then the bilan's apply and undo; `remote` ops run from the same
// start on another device and are merged (week-plan.js merge). `preview` computes a preview and confirms nothing (a refusal).
export function replay(W, R, fixture, c) {
  const journal = fixture.logs.filter((l) => (c.journal || []).includes(l.id));
  // A choice is made with the journal of that moment: the sessions recorded before it.
  const until = (at) => journal.filter((l) => !at || new Date(l.date).getTime() <= new Date(at).getTime());
  const run = (start, ops) => ops.reduce((st, op) => {
    const o = { today: op.today, zone: fixture.zone, pauses: st.pauses, at: op.at };
    const journal = until(op.at);
    if (op.op === "edit") return { ...st, schedule: W.editType(st.schedule, op.day, op.value, { today: op.today, at: op.at }).schedule };
    if (op.op === "decide") return { ...st, schedule: W.decide(st.schedule, op.id, op.decision, { today: op.today, at: op.at }) };
    if (op.op === "apply") { const r = R.apply(st.schedule, journal, { ...o, week: op.week }, op.action); return { schedule: r.schedule, pauses: r.pauses }; }
    if (op.op === "undo") { const r = R.undo(st.schedule, st.pauses, { week: op.week, today: op.today, at: op.at }); return { schedule: r.schedule, pauses: r.pauses }; }
    throw new Error(`unknown op ${op.op}`);
  }, start);
  const start = { schedule: JSON.parse(JSON.stringify(c.type || fixture.type)), pauses: [] };
  let st = run(start, c.ops || []);
  if (c.remote) {
    const other = run(st, c.remote);
    st = { schedule: W.merge(st.schedule, other.schedule), pauses: [...new Set([...st.pauses, ...other.pauses])] };
  }
  const r = c.read;
  const opts = { week: r.week, today: r.today, zone: fixture.zone, pauses: st.pauses, at: "2026-11-22T17:59:00.000Z" };
  const before = JSON.stringify(st);
  const view = R.review(st.schedule, journal, opts);
  const preview = c.preview ? R.preview(st.schedule, journal, opts, c.preview) : null;
  const unchanged = JSON.stringify(st) === before;
  const program = r.program ? W.week(st.schedule, journal, { week: r.program, today: r.today, zone: fixture.zone, pauses: st.pauses }) : null;
  return { ...st, journal, view, preview, program, unchanged, opts };
}

/** The output both clients must give for a case (the expected file stores it). */
export function project(W, R, res, label, dayLong) {
  return {
    review: R.snapshot(res.view),
    words: { observation: R.describeObservation(res.view.observation, { label }), followUp: R.describeFollowUp(res.view.followUp, { label, dayLong }) },
    preview: res.preview ? { changes: res.preview.changes, appliesFrom: res.preview.appliesFrom, scope: res.preview.scope, words: R.describePreview(res.preview, { label, dayLong }) } : null,
    program: res.program ? { paused: res.program.paused, occurrences: res.program.occurrences.map((o) => ({ id: o.id, effective: o.effective, status: o.status, decision: o.decision ? o.decision.kind : null, origin: o.decision?.origin || null })), adjustments: R.adjustments(res.schedule, { week: res.program.week, today: res.opts.today }).map((a) => ({ week: a.week, action: a.action })) } : null,
    pauses: res.pauses,
    type: W.typeDays(res.schedule).map((d) => (d ? d.sport : null)),
    measure: R.measure(res.schedule, res.journal, res.opts),
  };
}
