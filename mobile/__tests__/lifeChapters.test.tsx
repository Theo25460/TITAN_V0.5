/* AUD-48: life chapters told in figures; a new one starts today. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LifeChapters } from "../src/components/LifeChapters";
import { ToastProvider } from "../src/components/Toast";

const mockRpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "owner-a" }, access_token: "t" } } }) }, rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/lib/network", () => ({ useOnline: () => true, isOnline: () => true }));
const calls: [string, unknown][] = [];
beforeEach(() => {
  calls.length = 0;
  mockRpc.mockImplementation((name: string, args: unknown) => ({ setHeader: () => { calls.push([name, args]); return Promise.resolve({ data: name === "titan_chapters_v1" ? [{ id: "c1", title: "Prépa semi-marathon", startsOn: "2026-10-01", endsOn: null, open: true, days: 18, minutes: 1260, sessions: 20 }] : "c2", error: null }); } }));
});

test("chapters are listed with their figures and a new one can start", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  render(<QueryClientProvider client={client}><SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><ToastProvider><LifeChapters /></ToastProvider></SafeAreaProvider></QueryClientProvider>);
  expect(await screen.findByText("Prépa semi-marathon")).toBeTruthy();
  expect(screen.getByText(/18 jours actifs/)).toBeTruthy();
  fireEvent.changeText(screen.getByTestId("chapter-title"), "Saison de club");
  fireEvent.press(screen.getByTestId("chapter-start"));
  await waitFor(() => expect(calls.some(([n, a]) => n === "titan_chapter_start_v1" && (a as { p_title: string }).p_title === "Saison de club")).toBe(true));
});
