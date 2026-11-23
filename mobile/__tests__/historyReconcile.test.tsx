/* V1.6.3 — Contrôle et réconciliation on Android: the shared module is the website's byte for byte; the fixed set
   tests/fixtures/history-reconcile.json gives the same expected controls after every mutation with the Android copy of the modules and
   the Android split (src/data/history.ts, used by useLogs); the records view, the weekly recap and the journal week use the same counted
   set as the website; the sheet shows what changed and the source limit, worded like the website. */
import { render, screen, waitFor } from "@testing-library/react-native";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Insights, Ledger, Progress } from "../src/core";
import type { TrainingLog } from "../src/core/types";
import { historyViews } from "../src/data/history";

const mockChanges = jest.fn();
const mockMatches = jest.fn();
jest.mock("../src/data/api", () => ({ ...jest.requireActual("../src/data/api"), sessionChanges: (...a: unknown[]) => mockChanges(...a), sessionMatches: (...a: unknown[]) => mockMatches(...a) }));
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/lib/network", () => ({ ...jest.requireActual("../src/lib/network"), useOnline: () => true }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { ChangesCard } = require("../src/components/ChangesCard");
const { MatchCard } = require("../src/components/MatchCard");
const { ToastProvider } = require("../src/components/Toast");
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
const { run } = require("../../tools/history-reconcile-sim.cjs");
/* eslint-enable @typescript-eslint/no-require-imports */

const WEB = join(__dirname, "../..");
const FIXTURE = JSON.parse(readFileSync(join(WEB, "tests/fixtures/history-reconcile.json"), "utf8"));
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const show = (el: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SafeAreaProvider initialMetrics={metrics}>
        <ToastProvider>{el}</ToastProvider>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );

test("the shared module is the website's file, byte for byte, and listed in the manifest", () => {
  const web = readFileSync(join(WEB, "js/core/history-ledger.js"), "utf8");
  expect(readFileSync(join(__dirname, "../src/core/web/history-ledger.js"), "utf8")).toBe(web);
  const manifest = JSON.parse(readFileSync(join(__dirname, "../src/core/web/manifest.json"), "utf8"));
  expect(manifest.files["history-ledger.js"]).toBe(createHash("sha256").update(web).digest("hex"));
});

test("the fixed set gives the expected controls after every mutation, on the Android copy of the modules: zero gap", () => {
  const { results } = run(FIXTURE, Ledger);
  for (const r of results) expect([r.id, r.gaps || []]).toEqual([r.id, []]);
});

test("useLogs' split is the shared one, and the records, recap and journal week read its counted set", () => {
  const now = Date.parse(FIXTURE.now);
  const server = FIXTURE.server.map((l: TrainingLog) => ({ ...l, syncStatus: "confirmed" }));
  const queue = FIXTURE.deviceA.queue as TrainingLog[];
  const views = historyViews(server, queue, now);
  const shared = Ledger.split(server, queue);
  expect(views.logs.map((l) => l.id)).toEqual(shared.logs.map((l) => l.id));
  expect(views.archived.map((l) => l.id)).toEqual(shared.archived.map((l) => l.id));
  // The counted set: not the refused entry, not the held ride, not the archive; the waiting run counts, as on the website.
  expect(views.active.map((l) => Ledger.reference(l)).sort()).toEqual(["1a2b3c4d", "3c3c3c3c", "5e5e5e5e", "9f8e7d6c", "c1c1c1c1", "d1d1d1d1", "e1e1e1e1"]);
  // RecordsScreen (Insights.records on active) = the controls of the website device holding the same queue.
  const records = Insights.records(views.active, "all", now).map((r) => [r.id, r.value, Ledger.reference(r.log)]).sort();
  const expected = Ledger.controls([...views.logs, ...views.archived], { now }).records.map((r) => [r.id, r.value, r.ref]).sort();
  expect(records).toEqual(expected);
  expect(records).toContainEqual(["time:running:5", 28, "d1d1d1d1"]);
  // Weekly recap (ProgressScreen) and journal week (JournalScreen) on the same set: the week of 23 November holds the waiting run.
  expect(Progress.recap(views.active, { now: new Date(now), goals: [], current: true }).week.sessions).toBe(1);
  expect(Progress.weekLogs(views.active, new Date("2026-11-16T12:00:00Z"), new Date(now)).length).toBe(5);
});

test("the CSV rows are the website's: state and reference, the archives labelled, the refused entry left out", () => {
  const server = FIXTURE.server.map((l: TrainingLog) => ({ ...l, syncStatus: "confirmed" }));
  const { logs, archived } = historyViews(server, FIXTURE.deviceA.queue, Date.parse(FIXTURE.now));
  const rows = Ledger.csvRows([...logs, ...archived], "all");
  expect(Ledger.CSV_HEAD.slice(-2)).toEqual(["État", "Référence"]);
  expect(rows).toHaveLength(9);
  expect(rows.filter((r) => r[7] === "Archivée").map((r) => r[8])).toEqual(["a0a0a0a0"]);
  expect(rows.some((r) => r[8] === "f0f0f0f0")).toBe(false);
  expect(rows.find((r) => r[8] === "d1d1d1d1")?.[7]).toBe("Sur cet appareil");
  expect(rows.find((r) => r[8] === "b1b1b1b1")?.[7]).toBe("En vérification");
});

const RUN = "00000000-0000-4000-8000-000000000001";
const run1 = { id: RUN, client_event_id: RUN, user_id: "owner-a", sport: "running", category: "cardio", unit: "km", val: 10, xp: 60, revision: 3, date: "2026-11-20T06:30:00.000Z", syncStatus: "confirmed", details: { duration: 50 } } as TrainingLog;

test("the sheet lists what changed, newest first, with the reference, in the website's words", async () => {
  mockChanges.mockResolvedValue([
    { revision: 3, at: "2026-11-23T10:00:00.000Z", changes: [{ field: "archived", before: true, after: false, unit: "" }] },
    { revision: 2, at: "2026-11-22T10:00:00.000Z", changes: [{ field: "val", before: 10.4, after: 10, unit: "km" }, { field: "duration", before: 52, after: 50, unit: "min" }] },
  ]);
  show(<ChangesCard log={run1} />);
  await waitFor(() => expect(screen.getAllByTestId("changes-entry")).toHaveLength(2));
  const lines = screen.getAllByTestId("changes-entry").map((n) => String(n.props.children.flat?.().join?.("") ?? n.props.children));
  expect(lines[0]).toMatch(/Restaurée/);
  expect(lines[1]).toMatch(/Distance : 10,4 → 10 km · Durée : 52 → 50 min/);
  expect(screen.getByText(/Référence 00000000/)).toBeTruthy();
  expect(mockChanges).toHaveBeenCalledWith("owner-a", RUN);
});

test("a session never corrected shows no block and makes no call", () => {
  mockChanges.mockClear();
  show(<ChangesCard log={{ ...run1, revision: 1 }} />);
  expect(screen.queryByTestId("changes-card")).toBeNull();
  expect(mockChanges).not.toHaveBeenCalled();
});

test("a Garmin source says a later Garmin edit does not come back", async () => {
  mockMatches.mockResolvedValue([{ source: "garmin", external_id: "g-77001", status: "imported", log_id: RUN, linked_log_id: "00000000-0000-4000-8000-000000000009", split_log_id: RUN, sport: "running", started_at: "2026-11-20T06:31:00.000Z", duration_minutes: 53, distance_km: 10.6, imported_at: "2026-11-20T09:00:00.000Z", needs_review: false, reasons: [], decision: "distinct", events: [] }]);
  show(<MatchCard log={run1} logs={[run1]} />);
  await waitFor(() => expect(screen.getByTestId("match-source-limit")).toBeTruthy());
  expect(screen.getByTestId("match-source-limit").props.children).toMatch(/modification faite ensuite dans Garmin ne revient pas dans TITAN/);
});
