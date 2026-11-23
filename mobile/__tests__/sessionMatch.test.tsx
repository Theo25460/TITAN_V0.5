/* V1.6.2 — Rapprochement des séances on Android: the shared module is the website's byte for byte and gives the same verdicts on the
   annotated fixtures; a GPX entry carries its fingerprint and « Ce sont deux séances » travels with the new session; the « Sources »
   card shows both sources, their times and the diverging fields, and sends the athlete's reversible decision to the server. */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SessionMatch } from "../src/core";
import { buildSession, freshDraft } from "../src/core/session";
import type { TrainingLog } from "../src/core/types";
import * as Dialog from "../src/components/Dialog";

const mockMatches = jest.fn();
const mockResolve = jest.fn();
jest.mock("../src/data/api", () => ({ ...jest.requireActual("../src/data/api"), sessionMatches: (...a: unknown[]) => mockMatches(...a), resolveSessionMatch: (...a: unknown[]) => mockResolve(...a) }));
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/lib/network", () => ({ ...jest.requireActual("../src/lib/network"), useOnline: () => true }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { MatchCard } = require("../src/components/MatchCard");
const { ToastProvider } = require("../src/components/Toast");
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
/* eslint-enable @typescript-eslint/no-require-imports */

const WEB = join(__dirname, "../..");
const FIXTURES = JSON.parse(readFileSync(join(WEB, "tests/fixtures/session-match-annotated.json"), "utf8")).cases as { id: string; expect: string; entry: never; journal: TrainingLog[] }[];
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const show = (el: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SafeAreaProvider initialMetrics={metrics}>
        <ToastProvider>{el}</ToastProvider>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );

const RIDE = "00000000-0000-4000-8000-000000000001";
const ride: TrainingLog = { id: RIDE, client_event_id: RIDE, user_id: "owner-a", sport: "mountain_bike", category: "cardio", unit: "km", val: 32, xp: 120, date: "2026-11-14T08:00:00.000Z", created_at: "2026-11-14T11:00:00.000Z", syncStatus: "confirmed", details: { duration: 120, note: "Boue au col" } } as TrainingLog;
const link = (o: object = {}) => ({ source: "health_connect", external_id: "hc-ride", status: "linked", log_id: RIDE, linked_log_id: RIDE, split_log_id: null, sport: "cycling", started_at: "2026-11-14T08:03:00.000Z", duration_minutes: 118, distance_km: null, imported_at: "2026-11-14T12:00:00.000Z", needs_review: false, reasons: [], decision: null, events: [{ action: "linked", actor: "engine", at: "2026-11-14T12:00:00.000Z" }], ...o });

test("the shared module is the website's file, byte for byte, and listed in the manifest", () => {
  const web = readFileSync(join(WEB, "js/core/session-match.js"), "utf8");
  expect(readFileSync(join(__dirname, "../src/core/web/session-match.js"), "utf8")).toBe(web);
  const manifest = JSON.parse(readFileSync(join(__dirname, "../src/core/web/manifest.json"), "utf8"));
  expect(manifest.files["session-match.js"]).toBe(createHash("sha256").update(web).digest("hex"));
});

test("same verdicts as the website on the 30 annotated fixtures (real duplicate, two efforts a day, midnight, units, replay)", () => {
  for (const c of FIXTURES) expect([c.id, SessionMatch.classify(c.entry, c.journal)?.verdict ?? "distinct"]).toEqual([c.id, c.expect]);
});

test("a GPX entry carries its fingerprint; « Ce sont deux séances » is saved with the session", () => {
  const draft = { ...freshDraft("running"), when: "other" as const, date: "2026-11-21", time: "09:00", distance: "10", durH: "0", durM: "50", gpx: { movingMinutes: 50, elapsedMinutes: 52, ascent: 40, descent: 40, points: 900, start: "2026-11-21T08:00:00.000Z", timing: "complete" as const }, distinctFrom: ["t1", "t1"] };
  const b = buildSession(draft, new Date("2026-11-21T12:00:00Z"));
  expect(b.errors).toEqual([]);
  expect(b.details.gpxFingerprint).toBe("gpx:1795248000:10000:900");
  expect(b.details.match).toEqual({ distinct_from: ["t1"], decided_at: "2026-11-21T12:00:00.000Z" });
  expect(buildSession({ ...draft, distinctFrom: undefined }, new Date("2026-11-21T12:00:00Z")).details.match).toBeUndefined();
});

describe("Sources card", () => {
  beforeEach(() => { mockMatches.mockReset(); mockResolve.mockReset(); });

  test("a certain link: both sources, their times, the diverging distance, the rule, the engine's decision, and a split offered", async () => {
    mockMatches.mockResolvedValue([link()]);
    show(<MatchCard log={ride} logs={[ride]} />);
    const card = within(await screen.findByTestId("match-card"));
    expect(mockMatches).toHaveBeenCalledWith("owner-a", RIDE);
    expect(card.getByTestId("match-title").props.children).toBe("Même séance que Santé Connect");
    for (const words of ["Saisie manuelle", "Santé Connect", "sam. 14 nov. à 08:00", "sam. 14 nov. à 08:03", "32 km", "2 h 00", "1 h 58"]) expect(card.getAllByText(words, { exact: false }).length).toBeGreaterThan(0);
    expect(within(card.getByTestId("match-row-distance")).getByText("Distance · diffère")).toBeTruthy();
    expect(within(card.getByTestId("match-row-start")).getByText("Début")).toBeTruthy();
    expect(card.getByText(/rattachée automatiquement par TITAN/)).toBeTruthy();
    expect(card.getByTestId("match-distinct")).toBeTruthy();
  });

  test("an uncertain link asks; « Non, deux séances » is confirmed, then sent to the server", async () => {
    mockMatches.mockResolvedValue([link({ needs_review: true, reasons: ["duration_gap"], duration_minutes: 40 })]);
    mockResolve.mockResolvedValue(link({ status: "imported", log_id: "split-1", split_log_id: "split-1", decision: "distinct" }));
    const alert = jest.spyOn(Dialog.Alert, "alert");
    show(<MatchCard log={ride} logs={[ride]} />);
    const card = within(await screen.findByTestId("match-card"));
    expect(card.getByTestId("match-title").props.children).toBe("À vérifier : même séance ?");
    expect(card.getByText("Les durées diffèrent nettement.")).toBeTruthy();
    fireEvent.press(card.getByTestId("match-distinct"));
    expect(alert.mock.calls[0][0]).toBe("Séparer en deux séances ?");
    expect(mockResolve).not.toHaveBeenCalled();
    await act(async () => { await alert.mock.calls[0][2]![1].onPress!(); });
    await waitFor(() => expect(mockResolve).toHaveBeenCalledWith("owner-a", "health_connect", "hc-ride", "distinct"));
    alert.mockRestore();
  });

  test("a split offers to undo; a session not confirmed asks the server nothing", async () => {
    mockMatches.mockResolvedValue([link({ status: "imported", log_id: "split-1", split_log_id: "split-1", decision: "distinct" })]);
    const split = { ...ride, id: "00000000-0000-4000-8000-000000000099", sport: "cycling", details: { duration: 118 } } as TrainingLog;
    show(<MatchCard log={split} logs={[ride, split]} />);
    const card = within(await screen.findByTestId("match-card"));
    expect(card.getByTestId("match-title").props.children).toBe("Deux séances distinctes, choisi par toi");
    expect(card.getByTestId("match-same")).toBeTruthy();
    mockMatches.mockClear();
    show(<MatchCard log={{ ...ride, syncStatus: "pending" } as TrainingLog} logs={[ride]} />);
    expect(mockMatches).not.toHaveBeenCalled();
  });
});
