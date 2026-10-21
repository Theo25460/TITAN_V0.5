// AND08: signing out clears the account's cache but never the sessions still waiting to be sent or the drafts (the sign-out dialog promises it).
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { IDBFactory } from "fake-indexeddb";
const source = readFileSync(new URL("../js/training-store.js", import.meta.url), "utf8");
function device(initial) {
  const store = Object.create(null, {
    removeItem: { value(key) { delete this[key]; } },
    setItem: { value(key, value) { this[key] = String(value); } },
    getItem: { value(key) { return Object.hasOwn(this, key) ? this[key] : null; } },
  });
  for (const [key, value] of Object.entries(initial)) store[key] = value;
  let sessionCleared = false;
  const factory = new IDBFactory();
  const window = { state: { user: { id: "user-a" } }, indexedDB: factory, dispatchEvent() {} };
  vm.runInNewContext(source, { window, indexedDB: factory, CustomEvent, crypto, structuredClone, localStorage: store, sessionStorage: { clear() { sessionCleared = true; } } });
  return { window, store, cleared: () => sessionCleared };
}

test("sign-out cache cleaning keeps pending sessions, drafts and guest markers, and removes the rest", () => {
  const kept = {
    titan_pending_training_logs_v1: "[]",
    "titan_seance_draft_v3:user-a": "{}",
    "titan_seance_timer_v3:user-a": "{}",
    titan_training_draft_user_a: "{}",
    titan_guest_device_id_v1: "guest-1",
    titan_guest_imported_v1: "1",
  };
  const removed = {
    titan_supabase_auth_v1: "token",
    titan_os_v12_save: "{}",
    titan_data_cache_v2: "{}",
    "titan_goals_v1:user-a": "{}",
    "titan_checkout_started_v3:user-a": "1",
    titan_privacy_v1: "granted",
  };
  const { window, store, cleared } = device({ ...kept, ...removed });
  window.titanSafeClearCache();
  for (const key of Object.keys(kept)) assert.equal(store[key], kept[key], `${key} must survive a sign-out`);
  for (const key of Object.keys(removed)) assert.equal(Object.hasOwn(store, key), false, `${key} must be removed`);
  assert.equal(cleared(), true, "sessionStorage cleared");
});
