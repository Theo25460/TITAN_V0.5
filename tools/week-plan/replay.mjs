// V1.7.2 — replays one case of tests/fixtures/week-plan-v172.json through a week-plan module (the website's, or the Android copy).
// A case: the journal (ids of the shared sessions), the decisions or typical-week edits made on this device (ops), those made on
// another device (remote: replayed from the same start, then merged), edits of sessions made elsewhere (edits), and how the week is read.
export function replay(W, fixture, c) {
  const run = (start, ops) => ops.reduce((s, op) => {
    if (op.op === "edit") return W.editType(s, op.day, op.value, { today: op.today || fixture.today, at: op.at }).schedule;
    if (op.op === "decide") return W.decide(s, op.id, op.decision, { today: op.today || fixture.today, at: op.at });
    throw new Error(`unknown op ${op.op}`);
  }, start);
  const start = JSON.parse(JSON.stringify(fixture.type));
  let schedule = run(start, c.ops || []);
  if (c.remote) schedule = W.merge(schedule, run(start, c.remote));
  const journal = fixture.logs.filter((l) => (c.journal || []).includes(l.id)).map((l) => {
    const e = (c.edits || []).find((x) => x.id === l.id);
    return e ? { ...l, ...e.patch } : l;
  });
  const r = c.read || {};
  const view = W.week(schedule, journal, { week: r.week, today: r.today || fixture.today, zone: r.zone || fixture.zone, pauses: r.pauses || [] });
  return { schedule, journal, view };
}
