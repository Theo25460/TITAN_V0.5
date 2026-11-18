/* Lot A (sport excellence): queue errors and GPS sports. */
import { toAppError } from "../src/lib/errors";
import { GPS_SPORTS } from "../src/lib/gpsTrack";
import { Sports, SportContracts } from "../src/core";

test("a server rate limit is temporary, whatever its SQLSTATE: the queue keeps the session pending", () => {
  const e = toAppError({ code: "23514", message: "TRAINING_RATE_LIMIT" });
  expect(e.permanent).toBe(false);
  expect(e.message).toMatch(/Réessaie dans un moment/);
});

test("a refused session explains why in words, never with a raw code", () => {
  const e = toAppError({ code: "23514", message: "TRAINING_REJECTED" });
  expect(e.permanent).toBe(true);
  expect(e.message).toMatch(/limites/);
  // Audit: the pending screen offers « Réessayer » (same frozen values) and « Supprimer », never an edit: no « corrige-la puis renvoie-la ».
  expect(e.message).not.toMatch(/renvoie-la/i);
  expect(e.message).toMatch(/Supprime-la, puis enregistre-la de nouveau avec des valeurs corrigées/);
});

test("every GPS sport is a real catalogue sport of the distance form (no family id such as « mtb »)", () => {
  for (const id of GPS_SPORTS) expect([id, Sports.formOf(id)]).toEqual([id, "distance"]);
  expect(GPS_SPORTS.has("mountain_bike")).toBe(true);
  expect(GPS_SPORTS.has("treadmill")).toBe(false);
});

test("the shared duplicate finder sees a treadmill import behind a typed run, not a strength session", () => {
  const logs = [{ id: "a", sport: "treadmill", unit: "km", val: 8, date: "2026-11-16T18:00:00Z", created_at: "2026-11-16T19:00:00Z", details: { duration: 45 } }];
  expect(SportContracts.findDuplicate({ sport: "running", date: "2026-11-16T18:05:00Z", minutes: 40 }, logs)?.id).toBe("a");
  expect(SportContracts.findDuplicate({ sport: "muscu_gym", date: "2026-11-16T18:05:00Z", minutes: 40 }, logs)).toBeNull();
});
