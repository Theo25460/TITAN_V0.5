import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadDrafts, saveDraft } from "../src/data/drafts";
import { freshDraft } from "../src/core/session";
import { ownerKey } from "../src/lib/storage";
jest.mock("../src/data/auth", () => ({ useAuth: () => ({ owner: "b" }) }));

beforeEach(async () => { jest.useFakeTimers(); await AsyncStorage.clear(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test("switching accounts during the debounce saves each draft under its own owner", async () => {
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
