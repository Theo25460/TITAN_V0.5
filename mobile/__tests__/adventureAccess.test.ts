import { worldAccess } from "../src/lib/adventureAccess";
const snapshot = (version: number, tier = "plus", plus = false) => ({ version, plus, campaigns: [{ id: "forge", tier }] });
test("v3 grants all four canonical worlds despite stale tiers", () => {
 for (const id of ["aube", "marees", "forge", "aurores"]) expect(worldAccess(snapshot(3), id)).toEqual({ state: "open" });
});
test("legacy snapshots retain explicit server entitlement", () => {
 expect(worldAccess(snapshot(1), "forge").state).toBe("unavailable");
 expect(worldAccess(snapshot(2, "free"), "forge").state).toBe("open");
 expect(worldAccess(snapshot(2, "plus", true), "forge").state).toBe("open");
});
test("missing state, campaign and unknown world never invent access", () => {
 expect(worldAccess(null, "forge").state).toBe("unavailable");
 expect(worldAccess(snapshot(2), "aube").state).toBe("unavailable");
 expect(worldAccess(snapshot(3), "unknown").state).toBe("unavailable");
});
