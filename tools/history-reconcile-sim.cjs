// V1.6.3 — replays tests/fixtures/history-reconcile.json against one copy of the shared modules (website js/ or Android src/core/web/).
// A minimal server model applies the same effects as private.titan_update_training_session (val, duration, archived_at, revision + 1,
// a revision snapshot, no reward change) and titan_import_core (a replay of a known import answers « duplicate »); those two server
// behaviours are proven on PostgreSQL by sql/tests/300_history_reconcile.sql. Each device then rebuilds its views from what it holds:
// device A = server rows + its own queue, device B = server rows only. Returns, per step, the controls of each device, the gaps against
// the expected values and what the mutation changed.
"use strict";

const clone = (v) => JSON.parse(JSON.stringify(v));

function server(rows, now) {
  const state = { rows: clone(rows).map((r) => ({ ...r, syncStatus: "confirmed" })), revisions: [] };
  return {
    state,
    list: () => clone(state.rows),
    update(id, patch) {
      const row = state.rows.find((r) => r.id === id);
      if (!row) throw new Error("SESSION_NOT_FOUND");
      const before = clone(row);
      state.revisions.push({ log_id: id, snapshot: before });
      if ("val" in patch) row.val = patch.val;
      if ("duration" in patch) row.details = { ...row.details, duration: patch.duration, val2: patch.duration };
      if ("note" in patch) row.details = { ...row.details, note: patch.note };
      if ("date" in patch) row.date = patch.date;
      if ("archived" in patch) row.archived_at = patch.archived ? now : null;
      row.revision += 1;
      return { before, after: clone(row) };
    },
    confirm(item) {
      const row = { ...clone(item), id: item.confirmsAs.id, xp: item.confirmsAs.xp, revision: 1, archived_at: null, syncStatus: "confirmed" };
      delete row.confirmsAs;
      state.rows.push(row);
      return row;
    },
    replay(source, externalId) {
      const known = state.rows.find((r) => r.source === source && r.external_id === externalId);
      return known ? { status: "duplicate", log_id: known.id } : { status: "unknown" };
    },
  };
}

function project(L, held, queue, opts) {
  const { logs, archived } = L.split(held, queue);
  const all = [...logs, ...archived];
  const c = L.controls(all, { now: opts.now, from: opts.from, to: opts.to, serverRows: held });
  const records = Object.fromEntries(c.records.map((r) => [r.id, [r.value, r.ref]]));
  const xp = held.reduce((s, r) => s + (Number(r.xp) || 0), 0);
  return { journal: c.journal, archives: c.archives, period: c.period, records, csv: c.csv, json: c.json, xp };
}

/** Keeps only what a step expects (records: listed ids, null = must be absent). */
function pick(actual, expected) {
  const out = {};
  for (const k of Object.keys(expected)) {
    if (k === "records") {
      out.records = {};
      for (const id of Object.keys(expected.records)) out.records[id] = actual.records[id] ?? null;
    } else out[k] = actual[k];
  }
  return out;
}

function run(fixture, L) {
  const now = Date.parse(fixture.now);
  const opts = { now, from: Date.parse(fixture.week.from), to: Date.parse(fixture.week.to) };
  const srv = server(fixture.server, fixture.now);
  let queue = clone(fixture.deviceA.queue);
  // What each device last read from the server (its cache across a reconnection).
  let cacheA = srv.list();
  let cacheB = srv.list();
  const results = [];
  const byId = {};
  for (const step of fixture.steps) {
    const m = step.mutation;
    let changed = null;
    let answer = null;
    if (m?.kind === "update") {
      const { before, after } = srv.update(m.id, m.patch);
      changed = L.changes(before, after).map((c) => [c.field, c.before, c.after]);
      // A date is compared to the minute: the stored instant of an unchanged date must come back identical.
      if (changed.some(([f]) => f === "date") && !("date" in m.patch)) throw new Error("a correction moved the date");
    } else if (m?.kind === "confirm") {
      const item = queue.find((i) => i.client_event_id === m.event);
      srv.confirm(item);
      queue = queue.filter((i) => i !== item);
    } else if (m?.kind === "replay") {
      answer = srv.replay(m.source, m.external_id);
      if (answer.status !== "duplicate") throw new Error("a replay created a session");
    } else if (m?.kind === "reload") {
      // Signed out and back: each device first shows its cache (and A its durable queue), then reads the server again.
      const fromCacheA = project(L, cacheA, queue, opts);
      const fromCacheB = project(L, cacheB, [], opts);
      results.push({ id: `${step.id}-cache`, A: fromCacheA, B: fromCacheB });
    }
    cacheA = srv.list();
    cacheB = srv.list();
    const A = project(L, cacheA, queue, opts);
    const B = project(L, cacheB, [], opts);
    const expect = step.expect || fixture.steps.find((s) => s.id === step.sameAs).expect;
    const gaps = [...L.gaps(expect.A, pick(A, expect.A)).map((g) => `A ${g}`), ...L.gaps(expect.B, pick(B, expect.B)).map((g) => `B ${g}`)];
    const r = { id: step.id, title: step.title, A, B, gaps, changed, answer, expectedChanges: step.changes || null };
    byId[step.id] = r;
    results.push(r);
  }
  return { results, byId, server: srv.state };
}

module.exports = { run, project, pick };
