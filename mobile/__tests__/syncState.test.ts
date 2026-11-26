/* V1.6.1 — État de synchronisation. The queue of this phone against a fake server that keeps the contract of
   public.titan_submit_training_session: one receipt per (account, client_event_id), the same request answered by the same
   receipt, a different content with the same id refused (EVENT_CONTENT_CONFLICT), out-of-range values refused (22023).
   Scenarios of the exit criteria: network lost before sending and after the server commit, app restart, validation refusal then
   correction, account switch; one confirmed session, read the same way by a second device. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TrainingLog, TrainingPayload } from "../src/core/types";

type Row = { id: string; user_id: string; client_event_id: string; sport: string; val: number; unit: string; date: string; details: TrainingPayload["details"]; xp: number; created_at: string };
const server = {
  rows: [] as Row[],
  receipts: new Map<string, { request: string; response: { log_id: string; xp: number } }>(),
  mode: "up" as "up" | "offline" | "drop-after-commit",
  calls: [] as string[],
};
let mockOwner: string | null = "athlete-a";
const mockSubmit = async (owner: string, p: TrainingPayload) => {
  const id = p.details.client_event_id!;
  server.calls.push(`${server.mode}:${id}`);
  if (server.mode === "offline") throw new TypeError("Network request failed");
  const key = `${owner}:${id}`;
  const request = JSON.stringify(p);
  const known = server.receipts.get(key);
  let response;
  if (known) {
    if (known.request !== request) throw Object.assign(new Error("EVENT_CONTENT_CONFLICT"), { code: "23505" });
    response = known.response;
  } else {
    if (p.val <= 0 || (p.unit === "km" && p.val > 1000)) throw Object.assign(new Error("TRAINING_VALUE_OUT_OF_RANGE"), { code: "22023" });
    response = { log_id: `log-${server.rows.length + 1}`, xp: 120 };
    server.rows.push({ id: response.log_id, user_id: owner, client_event_id: id, sport: p.sport, val: p.val, unit: p.unit, date: p.date, details: p.details, xp: 120, created_at: "2026-11-23T08:00:00.000Z" });
    server.receipts.set(key, { request, response });
  }
  // The server committed, the answer never reaches the phone.
  if (server.mode === "drop-after-commit") throw new TypeError("Network request failed");
  return { ...response, credits: 10, credits_after: 10, xp_after: 120, level_after: 1, level_bonus: 0, leveled_up: 0, requested_xp: 120, requested_credits: 10, weekly_xp_remaining: 9000, weekly_credits_remaining: 900, server_version: "test" };
};
jest.mock("../src/data/api", () => ({
  submitSession: (owner: string, p: TrainingPayload) => mockSubmit(owner, p),
  assertOwner: async (owner: string) => {
    if (mockOwner !== owner) throw Object.assign(new Error("AUTH_REQUIRED"), { code: "AUTH_REQUIRED" });
    return { user: { id: owner } };
  },
}));
jest.mock("../src/lib/supabase", () => ({ supabase: {} }));

/* eslint-disable @typescript-eslint/no-require-imports */
const queue = require("../src/data/queue") as typeof import("../src/data/queue");
const { SyncState } = require("../src/core") as typeof import("../src/core");
/* eslint-enable @typescript-eslint/no-require-imports */

const gravel = (id: string, km = 42): TrainingPayload => ({ sport: "gravel", category: "cardio", val: km, unit: "km", date: "2026-11-22T07:30:00.000Z", details: { client_event_id: id, schemaVersion: 2, duration: 150, note: "Sortie sans réseau" } });
/** A second device of the same account only knows the server rows (same mapping as src/data/api.ts fetchAllLogs). */
const secondDevice = (owner: string): TrainingLog[] => server.rows.filter((r) => r.user_id === owner).map((r) => ({ ...r, cat: "cardio", syncStatus: "confirmed" }) as unknown as TrainingLog);
const itemOf = (id: string) => queue.queueSnapshot().items.find((i) => i.payload.details.client_event_id === id) ?? null;
const restart = async (owner: string) => {
  await queue.loadQueue(null);
  await queue.loadQueue(owner);
};

beforeEach(async () => {
  await AsyncStorage.clear();
  server.rows = [];
  server.receipts.clear();
  server.mode = "up";
  server.calls = [];
  mockOwner = "athlete-a";
  await queue.loadQueue("athlete-a");
});

test("network lost before sending: « Sur cet appareil », then « En attente d’envoi » with the last attempt, then one confirmed session", async () => {
  await queue.enqueue("athlete-a", gravel("g-1"));
  expect(SyncState.describe({ item: itemOf("g-1") })).toMatchObject({ state: "stored", label: "Sur cet appareil", actions: [{ id: "send", label: "Envoyer maintenant" }] });
  server.mode = "offline";
  expect(await queue.flushQueue("athlete-a")).toMatchObject({ sent: 0, offline: true, remaining: 1 });
  const waiting = SyncState.describe({ item: itemOf("g-1"), online: false });
  expect(waiting).toMatchObject({ state: "pending", label: "En attente d’envoi", kind: "temporary" });
  expect(waiting.facts.map((f) => f.label)).toEqual(["Enregistrée sur cet appareil", "Dernière tentative", "Motif", "Référence"]);
  expect(waiting.text).toMatch(/Hors ligne/);
  await restart("athlete-a");
  expect(SyncState.stateOf({ item: itemOf("g-1") })).toBe("pending");
  server.mode = "up";
  expect((await queue.flushQueue("athlete-a")).sent).toBe(1);
  expect(server.rows).toHaveLength(1);
  expect(queue.queueSnapshot().items).toHaveLength(0);
});

test("network lost after the server commit, then app restart: the retry gets the same receipt, a single session exists online and on the second device", async () => {
  await queue.enqueue("athlete-a", gravel("g-2"));
  server.mode = "drop-after-commit";
  await queue.flushQueue("athlete-a");
  expect(server.rows).toHaveLength(1); // committed…
  expect(SyncState.stateOf({ item: itemOf("g-2") })).toBe("pending"); // …but this phone never got the receipt: it does not claim it.
  await restart("athlete-a");
  expect(itemOf("g-2")?.payload).toEqual(gravel("g-2")); // the frozen request survives the restart
  server.mode = "up";
  const r = await queue.flushQueue("athlete-a");
  expect(r.receipts["g-2"].log_id).toBe("log-1");
  expect(server.rows).toHaveLength(1);
  expect(server.calls).toEqual(["drop-after-commit:g-2", "up:g-2"]);
  const online = secondDevice("athlete-a");
  expect(online.filter((l) => l.client_event_id === "g-2")).toHaveLength(1);
  const there = SyncState.describe({ log: online[0] });
  expect(there).toMatchObject({ state: "confirmed", label: "Confirmée dans ton compte" });
  expect(there.facts).toEqual([{ label: "Reçu du serveur", value: "+120 XP" }, { label: "Référence", value: "g-2" }]);
  // Replaying the frozen request again cannot create a second entry.
  await queue.enqueue("athlete-a", gravel("g-2"));
  await queue.flushQueue("athlete-a");
  expect(secondDevice("athlete-a")).toHaveLength(1);
});

test("validation refusal: the fields are kept through a restart, « Corriger et renvoyer » replaces the refused entry without a duplicate", async () => {
  await queue.enqueue("athlete-a", gravel("g-bad", 4200));
  await queue.flushQueue("athlete-a");
  const refused = itemOf("g-bad")!;
  const view = SyncState.describe({ item: refused });
  expect(view).toMatchObject({ state: "refused", label: "Refusée : à corriger", kind: "validation" });
  expect(view.actions.map((a) => a.label)).toEqual(["Corriger et renvoyer", "Retirer de cet appareil"]);
  expect(view.facts.find((f) => f.label === "Motif du refus")?.value).toMatch(/hors des limites/);
  await restart("athlete-a");
  expect(itemOf("g-bad")).toMatchObject({ status: "error", code: "TRAINING_VALUE_OUT_OF_RANGE", attempts: 1, payload: gravel("g-bad", 4200) });
  expect(server.rows).toHaveLength(0);
  // A refused session is never sent again by the automatic runs.
  await queue.flushQueue("athlete-a");
  expect(server.calls).toEqual(["up:g-bad"]);
  await queue.enqueue("athlete-a", gravel("g-fixed", 42), undefined, refused.key);
  expect(queue.queueSnapshot().items.map((i) => i.payload.details.client_event_id)).toEqual(["g-fixed"]);
  expect(JSON.parse((await AsyncStorage.getItem("titan.queue.v1:athlete-a"))!).map((i: { key: string }) => i.key)).toEqual(["athlete-a:g-fixed"]);
  await queue.flushQueue("athlete-a");
  expect(secondDevice("athlete-a").map((l) => l.client_event_id)).toEqual(["g-fixed"]);
});

test("a correction never replaces a session that may be on its way (pending)", async () => {
  const pending = await queue.enqueue("athlete-a", gravel("g-wait"));
  await queue.enqueue("athlete-a", gravel("g-other"), undefined, pending.key);
  expect(queue.queueSnapshot().items.map((i) => i.payload.details.client_event_id)).toEqual(["g-wait", "g-other"]);
  expect(SyncState.replaceable(pending)).toBe(false);
});

test("account switch: B sees none of A's states, A finds its refused session and its reason again", async () => {
  await queue.enqueue("athlete-a", gravel("a-bad", 5000));
  await queue.flushQueue("athlete-a");
  mockOwner = "athlete-b";
  await queue.loadQueue("athlete-b");
  expect(queue.queueSnapshot()).toMatchObject({ owner: "athlete-b", items: [] });
  expect(queue.provisionalLogs(queue.queueSnapshot().items, new Set())).toEqual([]);
  // A's correction cannot be written into B's queue.
  await expect(queue.enqueue("athlete-a", gravel("a-fix"))).rejects.toThrow("Le compte a changé");
  mockOwner = "athlete-a";
  await queue.loadQueue("athlete-a");
  expect(SyncState.describe({ item: itemOf("a-bad") })).toMatchObject({ state: "refused", label: "Refusée : à corriger" });
  expect(secondDevice("athlete-b")).toEqual([]);
});

test("the conflict and account refusals lead to the action that fixes them", () => {
  const item = (code: string) => ({ status: "error" as const, code, reason: "x", queuedAt: "2026-11-22T08:00:00Z", attempts: 1, payload: { details: { client_event_id: "e" } } });
  expect(SyncState.describe({ item: item("EVENT_CONTENT_CONFLICT") }).actions.map((a) => a.id)).toEqual(["discard"]);
  expect(SyncState.describe({ item: item("42501") }).actions.map((a) => a.id)).toEqual(["send", "discard"]);
  expect(SyncState.describe({ item: item("22023") }).actions.map((a) => a.id)).toEqual(["correct", "discard"]);
});

test("the Android copy of the wording is the website module, byte for byte", () => {
  const web = readFileSync(join(__dirname, "../../js/core/sync-state.js"), "utf8");
  const app = readFileSync(join(__dirname, "../src/core/web/sync-state.js"), "utf8");
  expect(app).toBe(web);
});
