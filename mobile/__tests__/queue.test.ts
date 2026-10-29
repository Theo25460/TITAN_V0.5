/* Offline queue: durable before sending, idempotent retries, account isolation, no silent loss. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TrainingPayload } from "../src/core/types";

const mockSubmit = jest.fn();
let mockSessionOwner: string | null = "owner-a";
jest.mock("../src/data/api", () => ({
  submitSession: (p: unknown) => mockSubmit(p),
  assertOwner: async (owner: string) => {
    if (mockSessionOwner !== owner) throw Object.assign(new Error("AUTH_REQUIRED"), { code: "AUTH_REQUIRED" });
    return { user: { id: owner } };
  },
}));
jest.mock("../src/lib/supabase", () => ({ supabase: {} }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const queue = require("../src/data/queue") as typeof import("../src/data/queue");

const payload = (id: string): TrainingPayload => ({ sport: "running", category: "cardio", val: 5, unit: "km", date: "2026-10-20T10:00:00.000Z", details: { client_event_id: id, schemaVersion: 2 } });
const receipt = (id: string) => ({ log_id: id, xp: 300, credits: 30, credits_after: 530, xp_after: 300, level_after: 2, level_bonus: 0, leveled_up: 0, requested_xp: 300, requested_credits: 30, weekly_xp_remaining: 9300, weekly_credits_remaining: 900, server_version: "sport-effort-v300" });

beforeEach(async () => {
  await AsyncStorage.clear();
  mockSubmit.mockReset();
  mockSessionOwner = "owner-a";
  await queue.loadQueue("owner-a");
});

test("a session is stored on the device before sending, and survives a restart", async () => {
  await queue.enqueue("owner-a", payload("e1"));
  expect(JSON.parse((await AsyncStorage.getItem("titan.queue.v1:owner-a"))!)).toHaveLength(1);
  await queue.loadQueue(null);
  await queue.loadQueue("owner-a");
  expect(queue.queueSnapshot().items.map((i) => i.payload.details.client_event_id)).toEqual(["e1"]);
});

test("successful send removes the session and returns the server receipt", async () => {
  mockSubmit.mockResolvedValue(receipt("srv-1"));
  await queue.enqueue("owner-a", payload("e1"));
  const r = await queue.flushQueue("owner-a");
  expect(r.sent).toBe(1);
  expect(r.receipts.e1.xp).toBe(300);
  expect(queue.queueSnapshot().items).toHaveLength(0);
  // The exact frozen payload is what the server receives (idempotent receipt per client_event_id).
  expect(mockSubmit).toHaveBeenCalledWith(payload("e1"));
});

test("network failure keeps the session pending and stops the run", async () => {
  mockSubmit.mockRejectedValue(new TypeError("Network request failed"));
  await queue.enqueue("owner-a", payload("e1"));
  await queue.enqueue("owner-a", payload("e2"));
  const r = await queue.flushQueue("owner-a");
  expect(r).toMatchObject({ sent: 0, offline: true, remaining: 2 });
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  expect(queue.queueSnapshot().items.every((i) => i.status === "pending")).toBe(true);
});

test("a validation refusal is kept with its reason, the others continue", async () => {
  mockSubmit.mockRejectedValueOnce(Object.assign(new Error("TRAINING_VALUE_OUT_OF_RANGE"), { code: "22023" })).mockResolvedValueOnce(receipt("srv-2"));
  await queue.enqueue("owner-a", payload("bad"));
  await queue.enqueue("owner-a", payload("good"));
  const r = await queue.flushQueue("owner-a");
  expect(r.sent).toBe(1);
  const [kept] = queue.queueSnapshot().items;
  expect(kept.payload.details.client_event_id).toBe("bad");
  expect(kept.status).toBe("error");
  expect(kept.reason).toMatch(/hors des limites/);
});

test("another account's session is never sent", async () => {
  await queue.enqueue("owner-a", payload("e1"));
  mockSessionOwner = "owner-b";
  const r = await queue.flushQueue("owner-a");
  expect(r.sent).toBe(0);
  expect(mockSubmit).not.toHaveBeenCalled();
  await queue.loadQueue("owner-b");
  expect(queue.queueSnapshot().items).toHaveLength(0);
});

test("provisional journal entries hide sessions already confirmed", () => {
  const items = [{ key: "a:e1", ownerId: "a", payload: payload("e1"), status: "pending" as const, queuedAt: "2026-10-20T10:00:00Z", attempts: 0 }];
  expect(queue.provisionalLogs(items, new Set(["e1"]))).toHaveLength(0);
  expect(queue.provisionalLogs(items, new Set())[0]).toMatchObject({ id: "e1", syncStatus: "pending", xp: 0 });
});
