/* V1.6.6 — Journal longue durée on Android: the shared module is the website's byte for byte; the phone copy is kept in chunks sorted
   by id and only the chunks that changed are written again, with the coverage of the copy; a refresh with a complete copy reads the
   manifest and the changed rows only (an old correction included); the journal and the records say when the copy is partial or the
   phone offline; the elevation of a ride is corrected like the website (only the elevation leaves). */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HistoryWindow, type HistoryCoverage } from "../src/core";
import type { TrainingLog } from "../src/core/types";
import * as cache from "../src/data/logsCache";

const mockState: { coverage: HistoryCoverage | null; online: boolean; logs: TrainingLog[]; mutate: jest.Mock } = { coverage: null, online: true, logs: [], mutate: jest.fn(async () => ({})) };
const mockQ = (data: unknown) => ({ data, isLoading: false, isRefetching: false, isFetching: false, error: null, refetch: jest.fn() });
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a", useAuth: () => ({ owner: "owner-a", status: "signedIn" }) }));
jest.mock("../src/lib/network", () => ({ ...jest.requireActual("../src/lib/network"), useOnline: () => mockState.online, isOnline: () => mockState.online }));
jest.mock("@react-navigation/native", () => ({ ...jest.requireActual("@react-navigation/native"), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() }) }));
jest.mock("../src/data/hooks", () => {
  const actual = jest.requireActual("../src/data/hooks");
  const { Progress } = jest.requireActual("../src/core");
  return {
    ...actual,
    useLogs: () => ({ ...mockQ(mockState.logs), logs: mockState.logs, active: Progress.activeLogs(mockState.logs), archived: [], pending: [], confirmed: mockState.logs, coverage: mockState.coverage }),
    useProfile: () => mockQ({ id: "owner-a", is_elite: false }),
    useUpdateSession: () => ({ mutate: jest.fn(), mutateAsync: mockState.mutate, isPending: false }),
  };
});

/* eslint-disable @typescript-eslint/no-require-imports */
const { JournalScreen } = require("../src/screens/progress/JournalScreen");
const { RecordsScreen } = require("../src/screens/progress/RecordsScreen");
const { SessionEditScreen } = require("../src/screens/session/SessionEditScreen");
const { ToastProvider } = require("../src/components/Toast");
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
/* eslint-enable @typescript-eslint/no-require-imports */

const WEB = join(__dirname, "../..");
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const show = (el: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SafeAreaProvider initialMetrics={metrics}>
        <ToastProvider>{el}</ToastProvider>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn(), setOptions: jest.fn() };

const pad = (n: number, w = 12) => String(n).padStart(w, "0");
const rowOf = (i: number, o: Partial<TrainingLog> = {}): TrainingLog => ({
  id: `00000000-0000-4000-8000-${pad(i)}`, user_id: "owner-a", client_event_id: `00000000-0000-4000-8000-${pad(i)}`, sport: i % 3 ? "running" : "cycling", category: "cardio", unit: "km",
  val: 5 + (i % 20), xp: 10, revision: 1, archived_at: null, date: new Date(Date.parse("2026-11-20T08:00:00Z") - i * 8 * 3600000).toISOString(), details: { duration: 30 + (i % 50) }, ...o,
}) as TrainingLog;

test("the shared module is the website's file, byte for byte, and listed in the manifest", () => {
  const web = readFileSync(join(WEB, "js/core/history-window.js"), "utf8");
  expect(readFileSync(join(__dirname, "../src/core/web/history-window.js"), "utf8")).toBe(web);
  const manifest = JSON.parse(readFileSync(join(__dirname, "../src/core/web/manifest.json"), "utf8"));
  expect(manifest.files["history-window.js"]).toBe(createHash("sha256").update(web).digest("hex"));
});

test("the phone copy keeps its coverage, and a correction rewrites one chunk of the copy, not the whole history", async () => {
  await AsyncStorage.clear();
  const rows = Array.from({ length: 1000 }, (_, i) => rowOf(i));
  const coverage = HistoryWindow.coverageOf(rows, { complete: true, total: 1000, checkedAt: Date.parse("2026-11-23T12:00:00Z"), mode: "pages" });
  await cache.saveLogsCache("owner-a", rows, coverage);
  expect(cache.lastWrite).toEqual({ chunks: 7, wrote: 7 });
  const back = await cache.readLogsCache("owner-a");
  expect(back?.logs.length).toBe(1000);
  expect(back?.coverage).toEqual(coverage);
  // The journal order is not the storage order: a corrected row moved to the end changes one chunk only.
  const corrected = { ...rows[421], revision: 2, details: { duration: 99 } } as TrainingLog;
  await cache.saveLogsCache("owner-a", [...rows.filter((_, i) => i !== 421), corrected]);
  expect(cache.lastWrite).toEqual({ chunks: 7, wrote: 1 });
  expect((await cache.readLogsCache("owner-a"))?.logs.find((l) => l.id === corrected.id)?.details?.duration).toBe(99);
  expect((await cache.readLogsCache("owner-a"))?.coverage).toEqual(coverage);
  // A copy written before V1.6.6 (no coverage) is a complete copy whose check date is unknown.
  await AsyncStorage.setItem("titan.logs.v1:owner-b", JSON.stringify({ chunks: 1, savedAt: 1, count: 1 }));
  await AsyncStorage.setItem("titan.logs.v1.0:owner-b", JSON.stringify([rowOf(1, { user_id: "owner-b" })]));
  expect((await cache.readLogsCache("owner-b"))?.coverage).toMatchObject({ complete: true, checkedAt: null, mode: "legacy" });
});

/** A minimal PostgREST builder over rows: the calls js/core/history-window.js makes (select, eq, or, gt, in, order, limit). */
function fakeClient(rows: TrainingLog[], log: string[]) {
  const from = () => {
    const q: { cols: string; count: boolean; filters: ((r: TrainingLog) => boolean)[]; order: [string, boolean][]; limit: number } = { cols: "*", count: false, filters: [], order: [], limit: Infinity };
    const run = () => {
      let list = rows.filter((r) => q.filters.every((f) => f(r)));
      list = [...list].sort((a, b) => { for (const [c, asc] of q.order) { const x = String((a as never)[c]), y = String((b as never)[c]); if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1); } return 0; });
      const page = list.slice(0, q.limit);
      log.push(q.cols === "*" ? "rows" : "manifest");
      const data = q.cols === "*" ? page : page.map((r) => Object.fromEntries(q.cols.split(",").map((c) => [c, (r as never)[c] ?? null])));
      return { data, error: null, count: q.count ? list.length : null };
    };
    const b = {
      select: (cols: string, o?: { count?: string }) => { q.cols = cols; q.count = o?.count === "exact"; return b; },
      eq: (c: string, v: string) => { q.filters.push((r) => String((r as never)[c]) === v); return b; },
      gt: (c: string, v: string) => { q.filters.push((r) => String((r as never)[c]) > v); return b; },
      in: (c: string, v: string[]) => { q.filters.push((r) => v.includes(String((r as never)[c]))); return b; },
      or: (expr: string) => { const m = /^date\.lt\."([^"]+)",and\(date\.eq\."[^"]+",id\.lt\.([^)]+)\)$/.exec(expr)!; q.filters.push((r) => r.date < m[1] || (r.date === m[1] && r.id < m[2])); return b; },
      order: (c: string, o: { ascending: boolean }) => { q.order.push([c, o.ascending]); return b; },
      limit: (n: number) => { q.limit = n; return b; },
      then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, ko),
    };
    return b;
  };
  return { from };
}

test("a refresh with a complete copy reads the manifest and only the changed rows, an old correction made elsewhere included", async () => {
  const server = Array.from({ length: 2300 }, (_, i) => rowOf(i));
  const log: string[] = [];
  const client = fakeClient(server, log);
  const pages: number[] = [];
  const first = await HistoryWindow.refresh(client, "owner-a", null, { onPage: (rows) => { pages.push(rows.length); } });
  expect(first.rows.length).toBe(2300);
  expect(pages[0]).toBe(500);
  expect(first.coverage.complete).toBe(true);
  // On the website: the oldest session corrected (two years before), and one session removed by a withdrawn import batch.
  const old = server[2299];
  server[2299] = { ...old, revision: 2, details: { duration: 120 } } as TrainingLog;
  server.splice(10, 1);
  log.length = 0;
  const next = await HistoryWindow.refresh(client, "owner-a", { rows: first.rows, coverage: first.coverage });
  expect(next.stats).toMatchObject({ mode: "manifest", read: 1, removed: 1 });
  expect(log).toEqual(["manifest", "manifest", "manifest", "rows"]);
  expect(next.rows.find((l) => l.id === old.id)?.details?.duration).toBe(120);
  expect(next.rows.length).toBe(2299);
  // A correction confirmed on the phone while the refresh read keeps its newer revision.
  const mine = { ...next.rows[5], revision: 9 } as TrainingLog;
  expect(HistoryWindow.reconcile([mine, ...next.rows.slice(6)], next.rows, [], next.rows).find((l) => l.id === mine.id)?.revision).toBe(9);
});

test("the journal and the records say when the copy is partial, and offline what the phone holds", () => {
  mockState.logs = Array.from({ length: 30 }, (_, i) => rowOf(i));
  mockState.coverage = HistoryWindow.coverageOf(mockState.logs.slice(0, 20), { complete: false, total: 10000 });
  mockState.online = false;
  const j = show(<JournalScreen navigation={nav} route={{ key: "j", name: "Journal", params: {} }} />);
  expect(screen.getByTestId("coverage-partial")).toBeTruthy();
  expect(screen.getByText(/^Hors ligne : cet appareil a tes séances du .+ à aujourd’hui \(20 sur 10\s000\)\. La suite arrivera au retour du réseau\. Les totaux qui commencent avant le .+ sont partiels\.$/)).toBeTruthy();
  j.unmount();
  const r = show(<RecordsScreen />);
  expect(screen.getByTestId("coverage-partial")).toBeTruthy();
  r.unmount();
  mockState.coverage = HistoryWindow.coverageOf(mockState.logs, { complete: true, checkedAt: Date.parse("2026-11-23T13:02:00Z") });
  const c = show(<JournalScreen navigation={nav} route={{ key: "j", name: "Journal", params: {} }} />);
  expect(screen.getByText(/^Hors ligne : tout ton journal est sur cet appareil \(30 séances, vérifié le 23 nov\./)).toBeTruthy();
  c.unmount();
  // Online and complete: nothing to say.
  mockState.online = true;
  show(<JournalScreen navigation={nav} route={{ key: "j", name: "Journal", params: {} }} />);
  expect(screen.queryByTestId("coverage-complete")).toBeNull();
  expect(screen.queryByTestId("coverage-partial")).toBeNull();
});

test("the elevation of a ride is corrected like the website: only the elevation leaves", async () => {
  mockState.online = true;
  const ride = rowOf(3, { sport: "cycling", val: 82.4, details: { duration: 245, elevation: 1450, note: "Col du Galibier par Valloire" } });
  mockState.logs = [ride];
  mockState.mutate = jest.fn(async () => ({ ...ride, revision: 2, details: { ...ride.details, elevation: 1650 } }));
  show(<SessionEditScreen navigation={nav} route={{ key: "e", name: "SessionEdit", params: { id: ride.id } }} />);
  const field = screen.getByTestId("edit-elevation");
  expect(field.props.value).toBe("1450");
  fireEvent.changeText(field, "1650");
  fireEvent.press(screen.getByText("Enregistrer la correction"));
  await waitFor(() => expect(mockState.mutate).toHaveBeenCalled());
  expect(mockState.mutate.mock.calls[0][0].patch).toEqual({ elevation: 1650 });
  // A running session has no elevation field (the same rule as the entry form).
  mockState.logs = [rowOf(1, { sport: "running" })];
  show(<SessionEditScreen navigation={nav} route={{ key: "e2", name: "SessionEdit", params: { id: rowOf(1).id } }} />);
  expect(screen.queryAllByTestId("edit-elevation").length).toBe(0);
});
