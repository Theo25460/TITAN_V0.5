/* V1.6.4 — Migration de l’historique on Android: the shared reader is the website's byte for byte and reads the same files the same way
   (Strava archive, TITAN export, CSV profile with summer time and units); the screen previews a file against the journal, lets the
   athlete classify an unknown sport, stops cleanly on the daily history budget and resumes from the row the server expects, reads the
   batch report from the server and withdraws a batch only after showing its effects. */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Ledger, Migration } from "../src/core";
import * as Dialog from "../src/components/Dialog";
import type { TrainingLog } from "../src/core/types";

const mockFetchAll = jest.fn();
const mockApi = { importBatches: jest.fn(), importBatchOpen: jest.fn(), importBatchRows: jest.fn(), importBatchReport: jest.fn(), importBatchWithdraw: jest.fn(), fetchAllLogs: mockFetchAll,
  // V1.6.6: the journal reads through refreshLogs (page by page, or by manifest); here it serves the same rows as fetchAllLogs.
  refreshLogs: jest.fn(async (owner: string): Promise<unknown> => ({ rows: await mockFetchAll(owner), removed: [], coverage: { complete: true, count: 1, total: 1, oldest: null, newest: null, checkedAt: null, mode: "pages" }, stats: { mode: "pages", requests: 1, read: 1, removed: 0, kept: 0 } })) };
jest.mock("../src/data/api", () => ({ ...jest.requireActual("../src/data/api"), ...Object.fromEntries(Object.keys(mockApi).map((k) => [k, (...a: unknown[]) => (mockApi as Record<string, jest.Mock>)[k](...a)])) }));
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/lib/network", () => ({ ...jest.requireActual("../src/lib/network"), useOnline: () => true }));
const mockFile = { text: "" };
jest.mock("expo-document-picker", () => ({ getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: "file:///historique.csv", name: "historique.csv", size: 400 }] }) }));
jest.mock("expo-file-system/legacy", () => ({ readAsStringAsync: async () => mockFile.text }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { HistoryImportScreen } = require("../src/screens/settings/HistoryImportScreen");
const { ToastProvider } = require("../src/components/Toast");
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
/* eslint-enable @typescript-eslint/no-require-imports */

const WEB = join(__dirname, "../..");
const NOW = Date.parse("2026-11-23T12:00:00Z");
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };

test("the shared reader is the website's file, byte for byte, and listed in the manifest", () => {
  const web = readFileSync(join(WEB, "js/core/history-migration.js"), "utf8");
  expect(readFileSync(join(__dirname, "../src/core/web/history-migration.js"), "utf8")).toBe(web);
  const manifest = JSON.parse(readFileSync(join(__dirname, "../src/core/web/manifest.json"), "utf8"));
  expect(manifest.files["history-migration.js"]).toBe(createHash("sha256").update(web).digest("hex"));
});

test("Strava archive: UTC dates, moving time, the metres column of an imperial account; unknown types wait to be classified", () => {
  const header = "Activity ID,Activity Date,Activity Name,Activity Type,Activity Description,Elapsed Time,Distance,Max Heart Rate,Moving Time,Distance";
  const csv = [header,
    '101,"Mar 17, 2024, 1:47:45 PM",Dimanche,Run,"Belle sortie, avec ""côtes""\nsur deux lignes",3600,6.23,,3300,10020.5',
    '102,"Apr 2, 2024, 7:05:00 AM",Vélo,Ride,,5400,26.4,,5100,42500',
    '103,"Apr 3, 2024, 6:00:00 PM",Truc,Underwater Basket,,1800,0,,1800,0'].join("\n");
  const p = Migration.parse(csv, { now: NOW });
  expect(p.format).toBe("strava_csv");
  expect(p.rows[0].item).toEqual({ id: "strava-101", sport: "running", startedAt: "2024-03-17T13:47:45.000Z", minutes: 55, km: 10.021, note: 'Belle sortie, avec "côtes"\nsur deux lignes' });
  expect(p.rows[1].item).toMatchObject({ sport: "cycling", minutes: 85, km: 42.5 });
  expect(p.rows[2].reason).toBe("unknown_sport");
  expect(p.unknownSports).toEqual({ "Underwater Basket": 1 });
});

test("TITAN export from Android's own CSV rows: same items as the website, archives left out", () => {
  const logs = [
    { id: "1", client_event_id: "aaaaaaaa-1", syncStatus: "confirmed", sport: "running", date: "2025-01-02T07:30:17+00:00", val: 10.4, unit: "km", details: { duration: 52, note: "Seuil", bio: { rpe: 6 } } },
    { id: "2", client_event_id: "bbbbbbbb-2", syncStatus: "confirmed", sport: "muscu_gym", date: "2025-01-03T18:00:00+00:00", val: 4250, unit: "kg", details: { duration: 60 } },
    { id: "3", client_event_id: "cccccccc-3", syncStatus: "confirmed", sport: "running", date: "2025-01-05T07:00:00+00:00", val: 5, unit: "km", details: { duration: 30 }, archived_at: "2025-02-01T00:00:00Z" },
  ];
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "﻿" + [Ledger.CSV_HEAD, ...Ledger.csvRows(logs as unknown as Partial<TrainingLog>[], "all")].map((r) => r.map(cell).join(";")).join("\r\n");
  const p = Migration.parse(csv, { now: NOW });
  expect(p.format).toBe("titan_csv");
  expect(p.rows.map((r) => r.item || r.reason)).toEqual([
    { id: "titan-aaaaaaaa-1735803017", sport: "running", startedAt: "2025-01-02T07:30:17.000Z", minutes: 52, km: 10.4, rpe: 6, note: "Seuil" },
    { id: "titan-bbbbbbbb-1735927200", sport: "muscu_gym", startedAt: "2025-01-03T18:00:00.000Z", minutes: 60, km: null, value: 4250, unit: "kg" },
    "archived_in_export",
  ]);
});

test("CSV profile: Paris summer-time changes and units read the same on the phone", () => {
  const csv = ["date;heure;sport;durée;distance;unité", "30/03/2025;02:30;Course à pied;45;6,2;mi", "26/10/2025;02:30;Natation;40 min;1500;m"].join("\n");
  const p = Migration.parse(csv, { now: NOW, tz: "Europe/Paris" });
  expect(p.rows.map((r) => [r.item?.startedAt, r.item?.km, r.dst])).toEqual([["2025-03-30T01:30:00.000Z", 9.978, "gap"], ["2025-10-26T00:30:00.000Z", 1.5, "repeated"]]);
});

const FILE = ["identifiant;date;heure;sport;durée;distance;unité", "r1;12/03/2024;07:15;Course à pied;52;10,4;km", "r2;14/03/2024;18:00;Zumba X;45;;", "r3;15/03/2024;;Course à pied;30;5;km", "r4;19/07/2024;07:00;Vélo;2h05;52;km"].join("\n");
const batch = (o: object = {}) => ({ id: "b1", format: "csv_profile", file_name: "historique.csv", total_rows: 4, status: "open", created_at: "2026-11-23T10:00:00Z", finished_at: null, withdrawn_at: null, withdraw_report: null, done_rows: 0, next_row: 1, counts: { added: 0, linked: 0, duplicate: 0, skipped: 0, review: 0 }, reasons: {}, ...o });

test("the screen previews, classifies a sport, stops on the daily budget, resumes from the expected row, reports and withdraws", async () => {
  mockFile.text = FILE;
  // The typed run starts 2 minutes after the file's first row, read in this device's time zone (as the screen reads it).
  const first = Migration.parse(FILE, { tz: Intl.DateTimeFormat().resolvedOptions().timeZone }).rows[0].item!;
  const typedAt = new Date(Date.parse(first.startedAt) + 2 * 60000).toISOString();
  mockApi.fetchAllLogs.mockResolvedValue([{ id: "typed", client_event_id: "typed", user_id: "owner-a", sport: "running", unit: "km", val: 10.4, xp: 0, date: typedAt, created_at: "2024-03-12T09:00:00.000Z", details: { duration: 52 } }]);
  mockApi.importBatches.mockResolvedValue([]);
  mockApi.importBatchOpen.mockResolvedValue(batch({ resumed: false }));
  mockApi.importBatchRows
    .mockResolvedValueOnce(batch({ done_rows: 3, next_row: 4, counts: { added: 1, linked: 1, duplicate: 0, skipped: 1, review: 0 }, processed: 3, limited: true }))
    .mockResolvedValueOnce(batch({ status: "done", done_rows: 4, next_row: 5, finished_at: "2026-11-23T10:00:05Z", counts: { added: 2, linked: 1, duplicate: 0, skipped: 1, review: 0 }, processed: 1, limited: false }));
  const report = (o: object = {}) => ({ ...batch({ status: "done", done_rows: 4, next_row: 5, finished_at: "2026-11-23T10:00:05Z", counts: { added: 2, linked: 1, duplicate: 0, skipped: 1, review: 0 }, reasons: { missing_time: 1 } }), rows: [
    { row: 2, outcome: "linked", reason: null, external_id: "csv-r1", log_id: "typed", needs_review: false, withdrawn: null, session: { date: "2024-03-12T06:17:00.000Z", sport: "running", val: 10.4, unit: "km", archived: false, corrected: false } },
    { row: 4, outcome: "skipped", reason: "missing_time", external_id: null, log_id: null, needs_review: false, withdrawn: null, session: null },
  ], ...o });
  mockApi.importBatchReport.mockResolvedValue(report());
  mockApi.importBatchWithdraw.mockImplementation(async (_o: string, _b: string, apply: boolean) => ({ ...report(), applied: apply, effects: { remove: 2, detach: 1 } }));
  const ask = jest.spyOn(Dialog, "ask").mockResolvedValue(true);

  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SafeAreaProvider initialMetrics={metrics}><ToastProvider><HistoryImportScreen /></ToastProvider></SafeAreaProvider>
    </QueryClientProvider>,
  );
  await screen.findByText("Aucun import pour le moment.");
  await waitFor(() => expect(mockApi.fetchAllLogs).toHaveBeenCalled());
  await act(async () => { fireEvent.press(screen.getByTestId("history-pick")); });
  // The typed run of that morning is recognised; the unknown sport and the row without a time are explained.
  await waitFor(() => expect(screen.getByTestId("history-counts")).toHaveTextContent("1 à ajouter · 1 déjà au journal · 0 à vérifier · 2 ignorées"));
  expect(screen.getByText(/Sport à classer : « Zumba X »/)).toBeTruthy();
  fireEvent.press(screen.getByTestId("history-sport-Zumba X-skip"));
  await waitFor(() => expect(screen.getAllByText(/Sport que tu as choisi d’ignorer/).length).toBeGreaterThan(0));

  await act(async () => { fireEvent.press(screen.getByTestId("history-run")); });
  await screen.findByTestId("history-paused");
  expect(screen.getByTestId("history-paused")).toHaveTextContent(/reprend à la ligne 4/);
  const sentFirst = mockApi.importBatchRows.mock.calls[0][2] as { row: number; skip?: string }[];
  expect(sentFirst.map((x) => x.skip || x.row)).toEqual([2, "sport_ignored", "missing_time", 5]);

  // Resume: the same file opens the same batch, only the rows after the last recorded one are sent.
  mockApi.importBatchOpen.mockResolvedValue(batch({ resumed: true, done_rows: 3, next_row: 4 }));
  await act(async () => { fireEvent.press(screen.getByTestId("history-run")); });
  await screen.findByTestId("history-report");
  expect((mockApi.importBatchRows.mock.calls[1][2] as { row: number }[]).map((x) => x.row)).toEqual([4, 5]);
  expect(screen.getByTestId("history-report-counts")).toHaveTextContent("2 ajoutées · 1 associée · 0 déjà importée · 1 ignorée");
  expect(screen.getByText(/Ligne 4 · Ignorée · Heure de début absente/)).toBeTruthy();

  // Withdrawal: the effects are shown first, then applied.
  mockApi.importBatchReport.mockResolvedValue(report({ status: "withdrawn", withdraw_report: { remove: 2, detach: 1 } }));
  await act(async () => { fireEvent.press(screen.getByTestId("history-withdraw")); });
  await screen.findAllByTestId("history-withdrawn");
  expect(ask.mock.calls[0][1]).toMatch(/2 séances ajoutées par ce lot retirées du journal\.\n1 lien vers des séances déjà au journal défait/);
  expect(mockApi.importBatchWithdraw.mock.calls.map((c) => c[2])).toEqual([false, true]);
  ask.mockRestore();
});
