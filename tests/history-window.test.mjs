// V1.6.6 — Journal longue durée: paged reading, coherent refresh, coverage and journal index of js/core/history-window.js, with the
// real supabase-js query builder (the one the website and Android ship) against the in-memory PostgREST of the benchmark.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { generate, OWNER } from "../tools/journal-profile/dataset.mjs";
import { query } from "../tools/journal-profile/fake-postgrest.mjs";

const require = createRequire(import.meta.url);
const W = require("../js/core/history-window.js");

function server(rows) {
  const log = [];
  const fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const h = new Headers(init.headers || (typeof input === "string" ? {} : input.headers));
    const headers = { prefer: h.get("prefer") || "", range: h.get("range") || "" };
    log.push(url.search);
    if (server.fail && server.fail(url)) return new Response(JSON.stringify({ message: "boom" }), { status: 503 });
    const r = query(server.rows, url, headers);
    return new Response(JSON.stringify(r.body), { status: 200, headers: { "content-type": "application/json", "content-range": r.contentRange } });
  };
  server.rows = rows;
  server.fail = null;
  const client = createClient("https://example.supabase.co", "anon", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch } });
  return { client, log };
}

test("paged reading by key returns every row once, in the server order, the first page usable alone", async () => {
  const { logs } = generate({ n: 2300 });
  const { client, log } = server(logs.map((l) => ({ ...l })));
  const pages = [];
  const r = await W.refresh(client, OWNER, null, { onPage: (rows, cov) => pages.push([rows.length, cov.complete, cov.total]) });
  assert.equal(r.rows.length, 2300);
  assert.equal(new Set(r.rows.map((l) => l.id)).size, 2300);
  assert.deepEqual(r.rows.map((l) => l.id), [...logs].sort(W.order).map((l) => l.id));
  assert.deepEqual(pages, [[500, false, 2300], [1000, false, 2300], [1500, false, 2300], [2000, false, 2300], [2300, false, 2300]]);
  assert.equal(r.coverage.complete, true);
  assert.equal(r.stats.requests, 5);
  // No offset: every page after the first reads from the last key, and only the first asks for the exact count.
  assert.ok(log.every((q) => !/offset=/.test(q)));
  assert.equal(log.filter((q, i) => i > 0 && /date\.lt\./.test(decodeURIComponent(q))).length, 4);
});

test("sessions sharing the same minute are not lost between two pages", async () => {
  const { logs } = generate({ n: 1200 });
  // 30 sessions at the very same instant across the first page boundary.
  for (let i = 480; i < 510; i++) logs[i].date = logs[480].date;
  const { client } = server(logs);
  const r = await W.refresh(client, OWNER, null);
  assert.equal(r.rows.length, 1200);
  assert.equal(new Set(r.rows.map((l) => l.id)).size, 1200);
});

test("refresh by manifest reads only what changed, an old correction included, and drops what the server removed", async () => {
  const { logs } = generate({ n: 3000 });
  const { client } = server(logs.map((l) => structuredClone(l)));
  const first = await W.refresh(client, OWNER, null);
  // Elsewhere: an old session (four years ago) corrected, one archived by a bulk import archive, one held by a review, one removed
  // by a withdrawn import batch, one new session.
  const s = server.rows;
  const old = s.find((l) => Date.parse(l.date) < Date.parse("2022-06-01"));
  old.details = { ...old.details, elevation: 1800 }; old.revision += 1;
  s[10].archived_at = "2026-11-23T10:00:00.000Z";
  s[11].status = "pending_review";
  const gone = s.splice(12, 1)[0];
  s.push({ ...structuredClone(s[0]), id: "00000000-0000-4000-8999-000000000001", client_event_id: "00000000-0000-4000-8999-000000000001", date: "2026-11-23T17:00:00.000Z" });
  const r = await W.refresh(client, OWNER, { rows: first.rows, coverage: first.coverage });
  assert.equal(r.stats.mode, "manifest");
  assert.equal(r.stats.read, 4, "the corrected, archived, held and new sessions only");
  assert.deepEqual(r.removed, [gone.id]);
  assert.equal(r.rows.length, 3000);
  assert.equal(r.rows.find((l) => l.id === old.id).details.elevation, 1800);
  assert.equal(r.rows.find((l) => l.id === s[10].id).archived_at, "2026-11-23T10:00:00.000Z");
  assert.equal(r.rows.find((l) => l.id === s[11].id).status, "pending_review");
  assert.ok(!r.rows.some((l) => l.id === gone.id));
  assert.deepEqual(r.rows.map((l) => l.id), [...s].sort(W.order).map((l) => l.id));
  // Nothing changed: the manifest only.
  const again = await W.refresh(client, OWNER, { rows: r.rows, coverage: r.coverage });
  assert.equal(again.stats.read, 0);
  assert.equal(again.stats.requests, 3, "three manifest pages of 1 000 lines");
});

test("a correction confirmed while the refresh reads is never replaced by the older copy", () => {
  const a = { id: "a", date: "2026-01-02T10:00:00Z", revision: 1, val: 10 };
  const b = { id: "b", date: "2026-01-01T10:00:00Z", revision: 1, val: 20 };
  const started = [a, b];
  const now = [{ ...a, revision: 2, val: 11 }, b, { id: "c", date: "2026-01-03T10:00:00Z", revision: 1, val: 5 }];
  const refreshed = [a, { ...b, revision: 2, val: 21 }];
  const out = W.reconcile(now, refreshed, [], started);
  assert.deepEqual(out.map((r) => [r.id, r.revision, r.val]), [["c", 1, 5], ["a", 2, 11], ["b", 2, 21]]);
  // A removal applies to an untouched row, not to one corrected locally since the refresh started.
  assert.deepEqual(W.reconcile(now, [], ["a", "b"], started).map((r) => r.id), ["c", "a"]);
});

test("coverage says what the device holds and when totals over a period are complete", () => {
  const rows = [{ id: "1", date: "2026-11-20T10:00:00Z" }, { id: "2", date: "2025-03-03T10:00:00Z" }];
  const part = W.coverageOf(rows, { complete: false, total: 10000 });
  assert.equal(part.oldest, "2025-03-03T10:00:00.000Z");
  assert.equal(W.covers(part, Date.parse("2026-01-01")), true);
  assert.equal(W.covers(part, Date.parse("2024-01-01")), false);
  assert.equal(W.covers(part, -Infinity), false);
  assert.match(W.describe(part, { online: false }).text, /^Hors ligne : cet appareil a tes séances du 3 mars 2025 à aujourd’hui \(2 sur 10\s000\)/);
  assert.match(W.describe(part, { online: false }).text, /Les totaux qui commencent avant le 3 mars 2025 sont partiels\./);
  const full = W.coverageOf(rows, { complete: true, checkedAt: Date.parse("2026-11-23T13:02:00Z") });
  assert.equal(W.covers(full, -Infinity), true);
  assert.equal(W.describe(full, { online: true }), null);
  assert.match(W.describe(full, { online: false }).text, /^Hors ligne : tout ton journal est sur cet appareil \(2 séances, vérifié le 23 nov\./);
  assert.equal(W.describe(W.coverageOf([], {}), { online: false }).state, "none");
});

test("journal index: one sort per history, the same rows as a direct filter", () => {
  const { logs } = generate({ n: 4000 });
  const fam = (s) => ({ muscu_gym: "force", yoga: "mobilite", bouldering: "technique" })[s] || "endurance";
  const text = (l) => `${l.sport} ${l.details?.note || ""}`;
  const index = W.buildIndex(logs, { familyOf: fam, textOf: text });
  const since = Date.parse("2025-01-01");
  const direct = logs.filter((l) => Date.parse(l.date) >= since && fam(l.sport) === "endurance" && /velo|cycling/.test(text(l).toLowerCase()) === /cycling/.test(text(l))).filter((l) => text(l).includes("cycling")).sort(W.order);
  assert.deepEqual(W.select(index, { since, family: "endurance", q: "cycling" }).map((l) => l.id), direct.map((l) => l.id));
  assert.deepEqual(W.select(index, { q: "GALIBIER" }).map((l) => l.details.note), ["Col du Galibier par Valloire"]);
  assert.equal(W.select(index, {}).length, 4000);
});

test("a failing page stops the reading with the error, nothing partial is presented as complete", async () => {
  const { logs } = generate({ n: 1600 });
  const { client } = server(logs);
  server.fail = (url) => /date\.lt/.test(decodeURIComponent(url.search)) && /or=/.test(url.search) && server.failed++ >= 1; // every later page: supabase-js retries a 503 by itself
  server.failed = 0;
  const pages = [];
  await assert.rejects(W.refresh(client, OWNER, null, { onPage: (rows, cov) => pages.push(cov) }));
  assert.equal(pages.length, 2);
  assert.ok(pages.every((c) => c.complete === false && c.total === 1600));
});
