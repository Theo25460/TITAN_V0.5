/* V1.9.5 — Bilans de cycle partageables, athlete side on Android. Inès reads the report Coach Lou proposes in « Mes suivis de coaching »,
   validates it item by item (no note nor check-in ticked for her) once whatever the number of taps, then reads exactly what her coach sees
   (= the reference report), retracts a note, withdraws the access, and keeps a read-only view when the link is paused or ended.
   Payloads are the server's own answers (tests/fixtures/coach-cycle.json, printed by tools/db/coach-cycle/fixtures.sql on PostgreSQL 16). */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Share } from "react-native";
import { CoachCycles } from "../src/screens/community/CoachCycles";

jest.setTimeout(20000);
const slow = { timeout: 5000 };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FX = require("../../tests/fixtures/coach-cycle.json");
const OWNER = FX.athlete_proposed.owner as string;
const RID = FX.start.report.id as string;
const mockRpc = jest.fn();
let mockStage = "proposed";
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "19500000-0000-4000-8000-0000000000a4" }, access_token: "t" } } }) }, rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "19500000-0000-4000-8000-0000000000a4" }));
jest.mock("../src/components/Dialog", () => ({ Alert: { alert: jest.fn() }, ask: jest.fn(async () => true) }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Alert } = require("../src/components/Dialog");

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);
  mockRpc.mockImplementation((name: string, params: { p_action?: string; p_data?: Record<string, unknown> }) => {
    const a = params.p_action;
    const list = ({ proposed: FX.athlete_proposed, published: FX.athlete_published, paused: FX.athlete_paused, revoked: FX.athlete_revoked } as Record<string, unknown>)[mockStage];
    const report = ({ proposed: FX.report_ines_proposed, published: FX.report_ines_published, paused: FX.report_ines_paused, revoked: FX.report_ines_revoked } as Record<string, unknown>)[mockStage];
    const data = name === "titan_feature_flags_v1" ? { flags: { "screens.coach_cycle_report": true } }
      : a === "athlete" ? list : a === "report" ? report : a === "validate" ? FX.validate : a === "retract" ? FX.retract : a === "withdraw" ? FX.withdraw : a === "export" ? FX.export_ines : { ok: true };
    const result = new Promise((r) => setTimeout(() => r({ data, error: null }), 200));
    return { setHeader: () => result };
  });
});
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CoachCycles owner={OWNER} online /></QueryClientProvider>);
const calls = (action: string) => mockRpc.mock.calls.filter(([n, p]) => n === "titan_coach_cycle_v1" && p.p_action === action);
const selected = (id: string) => screen.getByTestId(id).props.accessibilityState?.selected;

test("the module synchronised from the website is the website's, byte for byte", () => {
  expect(readFileSync(join(__dirname, "../src/core/web/coach-cycle.js"), "utf8")).toBe(readFileSync(join(__dirname, "../../js/core/coach-cycle.js"), "utf8"));
});

test("Inès validates item by item — no note nor check-in ticked for her — and the validation is sent once", async () => {
  mockStage = "proposed";
  show();
  fireEvent.press(await screen.findByTestId(`cy-open-${RID}`, {}, slow));
  await screen.findByTestId("cy-validate", {}, slow);
  const p = FX.report_ines_proposed.proposal;
  expect(selected("cy-pick-measure-w1-thu")).toBe(true);
  expect(screen.queryByTestId("cy-pick-measure-w3-sat")).toBeNull();
  expect(selected("cy-pick-note-w1-sat")).toBe(false);
  expect(selected(`cy-pick-checkin-${p.checkins[0].week}`)).toBe(false);
  expect(selected(`cy-pick-checkin-${p.checkins[1].week}`)).toBe(false);
  expect(screen.getByTestId("cy-share-summary").props.children).toMatch(/^Ton coach verra : 8 mesure\(s\) sur 8, aucune note, aucun check-in\./);
  fireEvent.press(screen.getByTestId("cy-pick-measure-w1-thu"));
  fireEvent.press(screen.getByTestId("cy-pick-note-w1-sat"));
  fireEvent.press(screen.getByTestId("cy-pick-note-w2-sat"));
  fireEvent.press(screen.getByTestId(`cy-pick-checkin-${p.checkins[0].week}`));
  for (const [k, v] of [["d1", "approve"], ["d2", "decline"], ["d3", "approve"]]) fireEvent.press(screen.getByTestId(`cy-${v}-${k}`));
  fireEvent.press(screen.getByTestId("cy-allow-export"));
  expect(screen.getByTestId("cy-share-summary").props.children).toMatch(/^Ton coach verra : 7 mesure\(s\) sur 8, 2 notes, 1 check-in\./);
  const go = screen.getByTestId("cy-validate-go");
  fireEvent.press(go); fireEvent.press(go); fireEvent.press(go);
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Bilan publié · version 1", expect.any(String)), slow);
  expect(calls("validate")).toHaveLength(1);
  const v = calls("validate")[0][1].p_data;
  expect(v.share).toEqual({ measures: ["w1-tue", "w1-sat", "w2-tue", "w2-sat", "w3-tue", "w5-tue", "w5-sat"], notes: ["w1-sat", "w2-sat"], checkins: [p.checkins[0].week] });
  expect(v.decisions).toEqual([{ key: "d1", answer: "approve" }, { key: "d2", answer: "decline" }, { key: "d3", answer: "approve" }]);
  expect(v.allow_export).toBe(true);
  expect(v.preview_key).toBe(p.preview_key);
  // What she reads now is what her coach sees: the reference figures.
  const pub = await screen.findByTestId(`cy-published-${RID}`, {}, slow);
  for (const text of ["Proposées · 18", "Acceptées · 16", "Réalisées · 8", "Reportées · 3", "Dites faites · 1", "Sans séance liée · 6", "Déclinées · 1", "Annulées · 1", "Séance archivée depuis · 1", "Durée · 6 h 54", "Volume · 70 km"])
    expect(within(pub).getByText(text)).toBeTruthy();
  expect(within(pub).queryByTestId("cy-measure-w1-thu")).toBeNull();
  expect(calls("retract").length + calls("withdraw").length).toBe(0);
});

test("published: she retracts a note, shares her own file without it, and withdraws the access", async () => {
  mockStage = "published";
  show();
  fireEvent.press(await screen.findByTestId(`cy-open-${RID}`, {}, slow));
  await screen.findByTestId(`cy-published-${RID}`, {}, slow);
  expect(screen.getByTestId("cy-export-0").props.children).toMatch(/^Ton coach · .* · version 1 · 7 mesure\(s\), 2 note\(s\), 1 check-in\(s\)$/);
  expect(screen.getByTestId("cy-note-w1-sat")).toBeTruthy();
  fireEvent.press(screen.getByTestId("cy-retract-note-w1-sat"));
  await waitFor(() => expect(screen.queryByTestId("cy-note-w1-sat")).toBeNull(), slow);
  expect(calls("retract")[0][1].p_data).toEqual({ id: RID, items: [{ kind: "note", key: "w1-sat" }] });
  expect(screen.getByTestId(`cy-measure-w1-sat`)).toBeTruthy();
  fireEvent.press(screen.getByTestId(`cy-share-${RID}`));
  await waitFor(() => expect(Share.share).toHaveBeenCalled(), slow);
  const shared = (Share.share as jest.Mock).mock.calls[0][0];
  expect(shared.title).toBe("bilan-course-et-renforcement-6-semaines-v1.txt");
  expect(shared.message).not.toMatch(/Genou/);
  expect(shared.message).toMatch(/un fichier ne peut pas être repris/);
  fireEvent.press(screen.getByTestId(`cy-withdraw-${RID}`));
  await waitFor(() => expect(calls("withdraw")).toHaveLength(1), slow);
  await waitFor(() => expect(screen.getByTestId(`cy-hosted-${RID}`).props.children).toMatch(/Tu as retiré l’accès/), slow);
  expect(screen.queryByTestId(`cy-withdraw-${RID}`)).toBeNull();
});

test("paused and after revoking: read-only, nothing new is published, her report stays", async () => {
  for (const stage of ["paused", "revoked"]) {
    mockStage = stage;
    const view = show();
    fireEvent.press(await screen.findByTestId(`cy-open-${RID}`, {}, slow));
    await screen.findByTestId(`cy-published-${RID}`, {}, slow);
    expect(screen.getByTestId(`cy-readonly-${RID}`).props.children).toBe(stage === "paused" ? "Suivi en pause : lecture seule, rien n’est publié ni supprimé." : "Partage arrêté : lecture seule.");
    expect(screen.queryByTestId(`cy-revalidate-${RID}`)).toBeNull();
    expect(screen.getByTestId(`cy-share-${RID}`)).toBeTruthy();
    expect(calls("validate")).toHaveLength(0);
    view.unmount();
  }
});
