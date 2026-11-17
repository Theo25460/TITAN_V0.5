import AsyncStorage from "@react-native-async-storage/async-storage";
import { discardDraft, draftCleanup, loadDrafts, saveDraft } from "../src/data/drafts";
import { freshDraft } from "../src/core/session";
import { ownerKey } from "../src/lib/storage";
jest.mock("../src/data/auth", () => ({ useAuth: () => ({ owner: "b" }) }));

beforeEach(async () => { jest.useFakeTimers(); await AsyncStorage.clear(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test("switching accounts during a write saves each draft under its own owner", async () => {
  const a = { ...freshDraft("running"), distance: "10" };
  const b = { ...freshDraft("cycling"), distance: "50" };
  await loadDrafts("a");
  saveDraft("a", a);
  await loadDrafts("b");
  saveDraft("b", b);
  await jest.advanceTimersByTimeAsync(300);
  expect(JSON.parse((await AsyncStorage.getItem(ownerKey("draft", "a")))!)).toMatchObject({ draft: { sport: "running", distance: "10" } });
  expect(JSON.parse((await AsyncStorage.getItem(ownerKey("draft", "b")))!)).toMatchObject({ draft: { sport: "cycling", distance: "50" } });
});

test("awaiting a draft write makes the latest edit durable without a timer", async () => {
  await loadDrafts("a");
  await saveDraft("a", { ...freshDraft("running"), note: "Dernière saisie" });
  expect(JSON.parse((await AsyncStorage.getItem(ownerKey("draft", "a")))!)).toMatchObject({ draft: { note: "Dernière saisie" } });
});

test("clearing a submitted session leaves a different draft in storage", async () => {
  await loadDrafts("a");
  const submitted = { ...freshDraft("running"), durM: "30" };
  await saveDraft("a", submitted);
  const clearSubmitted = draftCleanup("a", submitted);
  const other = { ...freshDraft("cycling"), note: "À reprendre" };
  await saveDraft("a", other);
  await clearSubmitted();
  expect(JSON.parse((await AsyncStorage.getItem(ownerKey("draft", "a")))!)).toMatchObject({ draft: { sport: "cycling", note: "À reprendre" } });
});

test("clearing the submitted draft after an account switch only removes that owner's saved copy", async () => {
  const submitted = { ...freshDraft("running"), durM: "30" };
  await loadDrafts("a");
  await saveDraft("a", submitted);
  const clearSubmitted = draftCleanup("a", submitted);
  await loadDrafts("b");
  await saveDraft("b", { ...freshDraft("cycling"), durM: "45" });
  await clearSubmitted();
  expect(await AsyncStorage.getItem(ownerKey("draft", "a"))).toBeNull();
  expect(JSON.parse((await AsyncStorage.getItem(ownerKey("draft", "b")))!)).toMatchObject({ draft: { sport: "cycling", durM: "45" } });
});

test("a late old-account draft load cannot replace the new account's pending draft", async () => {
  const original = (AsyncStorage.getItem as jest.Mock).getMockImplementation()!;
  let release!: (value: string | null) => void;
  (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => new Promise<string | null>((r) => { release = r; }));
  const old = loadDrafts("a");
  await loadDrafts("b");
  saveDraft("b", { ...freshDraft("cycling"), distance: "50" });
  release(null);
  await old;
  await jest.advanceTimersByTimeAsync(300);
  expect(JSON.parse((await AsyncStorage.getItem(ownerKey("draft", "b")))!)).toMatchObject({ draft: { sport: "cycling", distance: "50" } });
  (AsyncStorage.getItem as jest.Mock).mockImplementation(original);
});

test("Lot A: a finished GPS recording is pinned — another sport's form cannot overwrite it, its own form can edit it", async () => {
  await loadDrafts("a");
  const run = { ...freshDraft("running"), distance: "10.02", durM: "52", gpsRouteId: "route-1" };
  await saveDraft("a", run);
  await saveDraft("a", { ...freshDraft("muscu_gym"), note: "Une série" });
  expect(JSON.parse((await AsyncStorage.getItem(ownerKey("draft", "a")))!)).toMatchObject({ draft: { sport: "running", gpsRouteId: "route-1" } });
  await saveDraft("a", { ...run, note: "Sortie du soir" });
  expect(JSON.parse((await AsyncStorage.getItem(ownerKey("draft", "a")))!)).toMatchObject({ draft: { note: "Sortie du soir" } });
});

test("Lot A: a pinned GPS recording survives the 48-hour form expiry and can still be given up explicitly", async () => {
  const run = { ...freshDraft("running"), distance: "8", durM: "40", gpsRouteId: "route-2" };
  await AsyncStorage.setItem(ownerKey("draft", "c"), JSON.stringify({ draft: run, updatedAt: Date.now() - 5 * 86400000, id: "x" }));
  await loadDrafts("c");
  // Still loaded although five days old: another sport's form therefore cannot replace it.
  await saveDraft("c", { ...freshDraft("yoga"), note: "Étirements" });
  expect(JSON.parse((await AsyncStorage.getItem(ownerKey("draft", "c")))!)).toMatchObject({ draft: { gpsRouteId: "route-2" } });
  await discardDraft("c");
  expect(await AsyncStorage.getItem(ownerKey("draft", "c"))).toBeNull();
});
