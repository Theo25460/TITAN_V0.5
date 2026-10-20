// DATA09: analytics event names are a stable, documented contract. Names already published may never disappear or be
// renamed (history would break); every name the client can send is documented and accepted by the server contract.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname;
const source = readFileSync(`${root}js/app/analytics.js`, "utf8");
const block = source.slice(source.indexOf("const EVENTS"), source.indexOf("const ANALYSIS"));
const clientEvents = [...block.matchAll(/"([a-z_]+)",/g)].map((m) => m[1]);
const snapshot = JSON.parse(readFileSync(`${root}docs/analytics-events.snapshot.json`, "utf8")).events;
const doc = readFileSync(`${root}docs/ANALYTICS_EVENTS_V300.md`, "utf8");
const sql = readdirSync(`${root}supabase/migrations`).filter((f) => /analytics/.test(f)).map((f) => readFileSync(`${root}supabase/migrations/${f}`, "utf8")).join("\n");

test("the client sends at least the published events, none removed or renamed", () => {
  assert.ok(clientEvents.length >= 25, "the event list was found");
  assert.deepEqual(snapshot.filter((name) => !clientEvents.includes(name)), [], "a published event disappeared from the client");
});

test("every event the client can send is in the snapshot, the documentation and the server contract", () => {
  assert.deepEqual(clientEvents.filter((name) => !snapshot.includes(name)), [], "new event: add it to docs/analytics-events.snapshot.json");
  assert.deepEqual(clientEvents.filter((name) => !doc.includes(name)), [], "undocumented event");
  assert.deepEqual(clientEvents.filter((name) => !sql.includes(name)), [], "event unknown to the server contract");
});
