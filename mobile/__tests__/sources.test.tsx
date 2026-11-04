import { garminStatus, healthConnectStatus, ownCounterStatus } from "../src/lib/sources";

describe("Sources et capteurs: one vocabulary (V12-43)", () => {
  test("TITAN's own counter: unavailable, off, live, active, or needing its permission back", () => {
    expect(ownCounterStatus({ supported: false, enabled: false, permission: "unknown", live: false }).label).toBe("Indisponible");
    expect(ownCounterStatus({ supported: true, enabled: false, permission: "unknown", live: false }).label).toBe("Non activé");
    expect(ownCounterStatus({ supported: true, enabled: true, permission: "granted", live: true }).label).toBe("En direct");
    expect(ownCounterStatus({ supported: true, enabled: true, permission: "granted", live: false }).label).toBe("Actif");
    const fix = ownCounterStatus({ supported: true, enabled: true, permission: "denied", live: false });
    expect(fix.label).toBe("À réparer");
    expect(fix.tone).toBe("warn");
  });

  test("a consent is never presented as received data", () => {
    expect(healthConnectStatus(true, null)).toMatchObject({ label: "Connecté", detail: "Autorisé : aucun pas reçu pour l’instant." });
    expect(healthConnectStatus(true, "2026-11-04T09:05:00Z").detail).toMatch(/Dernière réception de pas/);
    expect(healthConnectStatus(false, null).label).toBe("Non connecté");
    expect(healthConnectStatus(null, null).label).toBe("Vérification…");
    expect(garminStatus({ enabled: true, linked: true }, false).detail).toBe("Compte relié : aucune activité reçue pour l’instant.");
    expect(garminStatus({ enabled: true, linked: true, last_event_at: "2026-11-03T18:00:00Z", imported: 2 }, false).detail).toMatch(/2 activités dans ton journal/);
    // Authorised is not connected: the consent alone never reads as "Connecté", and an unfinished link says so.
    expect(garminStatus({ enabled: true, linked: false, authorized: true }, false)).toMatchObject({ label: "À terminer", tone: "warn" });
    expect(garminStatus({ enabled: true, linked: true, last_event_at: "2026-11-03T18:00:00Z" }, false).detail).toMatch(/Dernière activité reçue/);
  });

  test("Garmin: not yet enabled, not linked, unreadable, loading", () => {
    expect(garminStatus({ enabled: false, linked: false }, false).label).toBe("Bientôt");
    expect(garminStatus({ enabled: true, linked: false }, false).label).toBe("Non connecté");
    expect(garminStatus(undefined, true).label).toBe("Indisponible");
    expect(garminStatus(undefined, false).label).toBe("Vérification…");
  });
});
