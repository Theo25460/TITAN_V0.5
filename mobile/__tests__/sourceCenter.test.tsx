/* V1.6.5 — Centre des sources connectées on Android. The shared diagnosis is the website's file byte for byte and reads the same fixed
   states (tests/fixtures/source-center.json). The real Santé Connect runner (src/lib/healthConnect.ts + src/lib/sourceSync.ts) is
   driven by a fake Health Connect library and a fake server that applies the contract of titan_import_activity_v1 and
   titan_source_run_v1 (one link per (source, id), a session in the journal never rewritten, no reading after withdrawal):
   access withdrawn, expired, no result, in error, interrupted, restored; two resumes of the same window duplicate nothing; the
   athlete's correction stays; the measure of the lot is computed on the recorded runs. Synthetic data only: no device, no account. */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Sources, type SourceRun } from "../src/core";
import * as Dialog from "../src/components/Dialog";
import { createHealthConnect, type HcExercise, type HcLib } from "../src/lib/healthConnect";
import { importRead, readForResume, summaryText, type SyncDeps } from "../src/lib/sourceSync";

const WEB = join(__dirname, "../..");
const FIXTURE = JSON.parse(readFileSync(join(WEB, "tests/fixtures/source-center.json"), "utf8"));
const H = 3600000, D = 24 * H;

test("the shared diagnosis is the website's file, byte for byte, and listed in the manifest", () => {
  const web = readFileSync(join(WEB, "js/core/source-center.js"), "utf8");
  expect(readFileSync(join(__dirname, "../src/core/web/source-center.js"), "utf8")).toBe(web);
  const manifest = JSON.parse(readFileSync(join(__dirname, "../src/core/web/manifest.json"), "utf8"));
  expect(manifest.files["source-center.js"]).toBe(createHash("sha256").update(web).digest("hex"));
});

test("the same fixed states give the same diagnosis on Android", () => {
  const now = Date.parse(FIXTURE.now);
  for (const [name, f] of Object.entries(FIXTURE.states) as [string, { source: "health_connect"; entry: never; device: never; here?: boolean; expect: { state: string; connected: boolean; action: string | null } }][]) {
    const d = Sources.diagnose(f.source, f.entry, { now, device: f.device, here: f.here ?? f.device !== null });
    expect([name, d.state, d.connected, d.actions[0]?.id ?? null]).toEqual([name, f.expect.state, f.expect.connected, f.expect.action]);
  }
});

/* ---------- A fake phone and a fake server, with the real runner. ---------- */
type Log = { id: string; sport: string; date: string; minutes: number; val: number; corrected?: boolean };
function world(start: number) {
  let now = start;
  const records: HcExercise[] = [];
  const perms = { steps: true, exercise: true };
  const lib = {
    readCalls: 0, failNext: null as string | null,
    getSdkStatus: async () => 3, initialize: async () => true,
    requestPermission: async () => { perms.steps = perms.exercise = true; return [{ accessType: "read", recordType: "ExerciseSession" }, { accessType: "read", recordType: "Steps" }]; },
    getGrantedPermissions: async () => [...(perms.steps ? [{ accessType: "read", recordType: "Steps" }] : []), ...(perms.exercise ? [{ accessType: "read", recordType: "ExerciseSession" }] : [])],
    revokeAllPermissions: async () => { perms.steps = perms.exercise = false; },
    openHealthConnectSettings: () => undefined,
    aggregateGroupByPeriod: async () => [],
    readRecords: async (_t: string, o: { timeRangeFilter: { startTime: string; endTime: string } }) => {
      lib.readCalls++;
      if (lib.failNext) { const m = lib.failNext; lib.failNext = null; throw new Error(m); }
      const a = Date.parse(o.timeRangeFilter.startTime), b = Date.parse(o.timeRangeFilter.endTime);
      return { records: records.filter((r) => Date.parse(r.startTime) >= a && Date.parse(r.startTime) <= b) };
    },
  };
  const hc = createHealthConnect(lib as unknown as HcLib);
  // Server: consent, links keyed by (source, id), the journal, the runs (a closed run is never rewritten).
  const server = {
    consent: true as boolean | null, grantedAt: new Date(start - 60 * D).toISOString(),
    links: new Map<string, { log: string; status: string }>(), journal: [] as Log[], runs: new Map<string, SourceRun>(),
  };
  const importOne: SyncDeps["importOne"] = async (c) => {
    if (server.consent !== true) throw new Error("CONSENT_REQUIRED");
    const prev = server.links.get(c.externalId);
    if (prev) return { status: "duplicate" };
    const end = Date.parse(c.startedAt) + c.minutes * 60000;
    const dup = server.journal.find((l) => l.sport === c.sport && Math.min(end, Date.parse(l.date) + l.minutes * 60000) - Math.max(Date.parse(c.startedAt), Date.parse(l.date)) >= 0.5 * Math.min(c.minutes, l.minutes) * 60000);
    if (dup) { server.links.set(c.externalId, { log: dup.id, status: "linked" }); return { status: "linked" }; }
    const log = { id: `log-${server.journal.length + 1}`, sport: c.sport, date: c.startedAt, minutes: c.minutes, val: c.minutes };
    server.journal.push(log);
    server.links.set(c.externalId, { log: log.id, status: "imported" });
    return { status: "imported" };
  };
  const report: SyncDeps["report"] = async (run) => {
    const id = String(run.id);
    if (server.consent !== true && run.outcome !== "denied") throw new Error("CONSENT_REQUIRED");
    const prev = server.runs.get(id);
    if (prev && prev.outcome !== "running") return prev;
    const row = { ...(prev ?? {}), ...run, finished_at: run.outcome === "running" ? null : new Date(now).toISOString(), counts: (run.counts ?? {}) as object, excluded: (run.excluded ?? {}) as object } as unknown as SourceRun;
    if (prev) row.started_at = prev.started_at;
    server.runs.set(id, row);
    return row;
  };
  let n = 0;
  const deps = (active: () => boolean = () => true): SyncDeps => ({ hc, consent: async () => server.consent, report, importOne, newId: () => `run-${++n}`, now: () => now, active });
  const entry = () => ({ source: "health_connect", consent: server.consent === null ? null : { granted: server.consent, granted_at: server.grantedAt, revoked_at: server.consent ? null : new Date(now).toISOString(), revoked_by: server.consent ? null : "user" as const },
    counts: { imported: [...server.links.values()].filter((l) => l.status === "imported").length, linked: [...server.links.values()].filter((l) => l.status === "linked").length, archived: 0, review: 0 },
    runs: [...server.runs.values()].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)) });
  const add = (id: string, type: number, at: number, minutes: number) => records.push({ startTime: new Date(at).toISOString(), endTime: new Date(at + minutes * 60000).toISOString(), exerciseType: type, metadata: { id } });
  return { lib, hc, server, deps, entry, add, perms, tick: (ms: number) => { now += ms; }, now: () => now };
}

test("the chain on a fake phone: withdrawn, expired, no result, in error, restored, and two resumes that duplicate nothing", async () => {
  const t0 = Date.parse("2026-11-23T10:00:00Z");
  const w = world(t0);
  const device = async () => ({ availability: await w.hc.availability(), access: await w.hc.granted() });
  const diag = async () => Sources.diagnose("health_connect", w.entry() as never, { now: w.now(), device: await device(), here: true });
  // The athlete typed a run three weeks ago and corrected it; the watch recorded the same run, a ride, a walk, and an ambiguous type.
  w.server.journal.push({ id: "typed", sport: "running", date: new Date(t0 - 21 * D).toISOString(), minutes: 50, val: 10, corrected: true });
  w.add("hc-run", 56, t0 - 21 * D + 3 * 60000, 51);
  w.add("hc-ride", 8, t0 - 19 * D, 90);
  w.add("hc-walk", 79, t0 - 16 * D, 40);
  w.add("hc-other", 26_000, t0 - 15 * D, 30);
  w.add("hc-blink", 56, t0 - 14 * D, 0);

  // 1. Withdrawn in TITAN: nothing is asked to Health Connect, the server records nothing.
  w.server.consent = false;
  const plan = Sources.replayWindow("health_connect", { now: w.now(), lastWindowTo: null, grantedAt: w.server.grantedAt, from: t0 - 25 * D })!;
  expect(await readForResume(w.deps(), plan)).toEqual({ status: "withdrawn" });
  expect(w.lib.readCalls).toBe(0);
  expect((await diag()).state).toBe("withdrawn");

  // 2. Expired: TITAN consent given, Android permission gone (revoked in Health Connect or reset by Android). Nothing is read.
  w.server.consent = true;
  w.perms.exercise = w.perms.steps = false;
  expect(await readForResume(w.deps(), plan)).toEqual({ status: "denied", code: "ANDROID_PERMISSION" });
  expect(w.lib.readCalls).toBe(0);
  expect((await diag()).state).toBe("expired");
  expect((await diag()).actions[0].id).toBe("reauthorize");

  // 3. In error: Health Connect fails while reading.
  await w.hc.request();
  w.lib.failNext = "Health Connect service unavailable";
  w.tick(60000);
  const failed = await readForResume(w.deps(), plan);
  expect(failed).toMatchObject({ status: "failed", code: "HC_UNAVAILABLE" });
  let d = await diag();
  expect(d.state).toBe("failed");
  expect(d.detail).toMatch(/Santé Connect n’a pas répondu/);
  expect(d.connected).toBe(false);

  // 4. Restored: the resume reads 25 days, finds 3 sessions, excludes 2 with their reasons, imports after the explicit confirmation.
  w.tick(60000);
  const r1 = await readForResume(w.deps(), plan);
  if (r1.status !== "read") throw new Error(r1.status);
  expect(r1.candidates.map((c) => c.externalId).sort()).toEqual(["hc-ride", "hc-run", "hc-walk"]);
  expect(r1.excluded).toEqual({ unmapped_type: 1, too_short: 1 });
  expect([...w.server.runs.values()].at(-1)!.outcome).toBe("running");
  const s1 = await importRead(w.deps(), r1);
  expect(s1).toMatchObject({ outcome: "ok", counts: { read: 5, imported: 2, linked: 1, duplicate: 0, excluded: 2, failed: 0 } });
  expect(summaryText(s1)).toBe("2 séances ajoutées, 1 rattachée à une séance déjà saisie, 2 exclues.");
  expect(w.server.journal).toHaveLength(3);
  expect(w.server.journal[0]).toEqual({ id: "typed", sport: "running", date: new Date(t0 - 21 * D).toISOString(), minutes: 50, val: 10, corrected: true });
  d = await diag();
  expect([d.state, d.connected, d.label]).toEqual(["ok", true, "Connecté"]);
  expect(d.exclusions.map((x) => x.reason).sort()).toEqual(["too_short", "unmapped_type"]);

  // 5. A second resume of the same window: everything is « already in the journal », nothing is added, the correction stays.
  w.tick(60000);
  const r2 = await readForResume(w.deps(), plan);
  if (r2.status !== "read") throw new Error(r2.status);
  const s2 = await importRead(w.deps(), r2);
  expect(s2).toMatchObject({ outcome: "empty", counts: { imported: 0, linked: 0, duplicate: 3 } });
  expect(w.server.journal).toHaveLength(3);
  expect(w.server.links.size).toBe(3);
  expect(w.server.journal[0].val).toBe(10);

  // 6. No result: a later reading of an empty week says so, without calling it a failure.
  w.tick(2 * D);
  const week = Sources.replayWindow("health_connect", { now: w.now(), lastWindowTo: new Date(w.now() - D).toISOString(), grantedAt: w.server.grantedAt })!;
  const r3 = await readForResume(w.deps(), week, "read");
  if (r3.status !== "read") throw new Error(r3.status);
  expect(r3.candidates).toEqual([]);
  expect((await importRead(w.deps(), r3)).outcome).toBe("empty");
  d = await diag();
  expect([d.state, d.label, d.connected]).toEqual(["empty", "Aucune nouvelle séance", true]);
});

test("interrupted then resumed: the open run is read as interrupted, the same window finishes the job without duplicates, measured", async () => {
  const t0 = Date.parse("2026-11-23T10:00:00Z");
  const w = world(t0);
  for (let i = 0; i < 6; i++) w.add(`hc-${i}`, 56, t0 - (20 - i * 3) * D, 40);
  const plan = Sources.replayWindow("health_connect", { now: w.now(), from: t0 - 28 * D, grantedAt: w.server.grantedAt })!;
  // The app is closed after two imports: nothing more is sent and the run stays « running » on the server.
  let left = 2;
  const r1 = await readForResume(w.deps(), plan);
  if (r1.status !== "read") throw new Error(r1.status);
  const cut = await importRead(w.deps(() => left-- > 0), r1);
  expect(cut.interrupted).toBe(true);
  expect(w.server.journal).toHaveLength(2);
  w.tick(20 * 60000);
  const d = Sources.diagnose("health_connect", w.entry() as never, { now: w.now(), device: { availability: "ready", access: { steps: true, exercise: true } }, here: true });
  expect(d.state).toBe("interrupted");
  expect(d.replay!.from).toBe(plan.from);
  // Resume of the same window from the action the center offers.
  const r2 = await readForResume(w.deps(), d.replay!);
  if (r2.status !== "read") throw new Error(r2.status);
  const s2 = await importRead(w.deps(), r2);
  expect(s2.counts).toMatchObject({ imported: 4, duplicate: 2 });
  expect(w.server.journal).toHaveLength(6);
  const runs = [...w.server.runs.values()];
  const m = Sources.measure(runs, w.server.journal.map((l) => ({ started_at: l.date })), { now: w.now() });
  expect(m).toMatchObject({ interrupted: 1, recovered: 1, visible: 1, recoveredRate: 1, visibleRate: 1, medianDelayMinutes: 20 });
});

test("withdrawal during a resume: the server refuses what is left and the run says so", async () => {
  const t0 = Date.parse("2026-11-23T10:00:00Z");
  const w = world(t0);
  for (let i = 0; i < 3; i++) w.add(`hc-${i}`, 8, t0 - (10 - i) * D, 60);
  const plan = Sources.replayWindow("health_connect", { now: w.now(), grantedAt: w.server.grantedAt })!;
  expect(plan.days).toBe(7);
  const r = await readForResume(w.deps(), Sources.replayWindow("health_connect", { now: w.now(), from: t0 - 12 * D, grantedAt: w.server.grantedAt })!);
  if (r.status !== "read") throw new Error(r.status);
  w.server.consent = false; // withdrawn on another device meanwhile
  const s = await importRead(w.deps(), r);
  expect(s).toMatchObject({ outcome: "partial", error_code: "CONSENT_REQUIRED" });
  expect(w.server.journal).toHaveLength(0);
  expect(await readForResume(w.deps(), plan)).toEqual({ status: "withdrawn" });
});

/* ---------- The screen. ---------- */
const mockApi = { sourceCenter: jest.fn(), reportSourceRun: jest.fn(), importActivity: jest.fn(), sourceConsent: jest.fn(), archiveImported: jest.fn() };
jest.mock("../src/data/api", () => ({ ...jest.requireActual("../src/data/api"), ...Object.fromEntries(Object.keys(mockApi).map((k) => [k, (...a: unknown[]) => (mockApi as Record<string, jest.Mock>)[k](...a)])) }));
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/lib/network", () => ({ ...jest.requireActual("../src/lib/network"), useOnline: () => true }));
jest.mock("../src/lib/nativeConnections", () => ({ readGarmin: async () => ({ enabled: false, linked: false, authorized: false, imported: 0, attached: 0 }) }));
jest.mock("../src/data/steps", () => ({ useSteps: () => ({ own: { supported: true, enabled: false, permission: "undetermined", live: false }, connected: true, view: { lastUpdate: null } }) }));
jest.mock("@react-navigation/native", () => ({ ...jest.requireActual("@react-navigation/native"), useNavigation: () => ({ navigate: jest.fn() }) }));
const mockHc = { readWindow: jest.fn(), granted: jest.fn(), availability: jest.fn(), request: jest.fn(), revoke: jest.fn(), openSettings: jest.fn() };
jest.mock("../src/lib/healthConnect", () => ({ ...jest.requireActual("../src/lib/healthConnect"), healthConnect: () => mockHc }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { SourcesScreen } = require("../src/screens/settings/SourcesScreen");
const { ToastProvider } = require("../src/components/Toast");
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
/* eslint-enable @typescript-eslint/no-require-imports */
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const mount = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <SafeAreaProvider initialMetrics={metrics}><ToastProvider><SourcesScreen /></ToastProvider></SafeAreaProvider>
  </QueryClientProvider>,
);

test("the screen: weeks missing are resumed in two explicit steps; the withdrawal says what stays before it happens", async () => {
  const now = Date.now();
  const iso = (ms: number) => new Date(now - ms).toISOString();
  let consent = true;
  const center = () => ({ now: iso(0), batch: null, sources: [{ source: "health_connect", consent: { granted: consent, granted_at: iso(90 * D), revoked_at: consent ? null : iso(0), revoked_by: consent ? null : "user" },
    counts: { imported: 12, linked: 3, archived: 0, review: 0 }, sports: [{ sport: "running", n: 9 }], fields: { total: 15, distance: 0 },
    runs: [{ id: "old", kind: "read", started_at: iso(40 * D), finished_at: iso(40 * D), window_from: iso(47 * D), window_to: iso(40 * D), outcome: "ok", counts: { read: 2, imported: 2 }, excluded: {} }] }] });
  mockApi.sourceCenter.mockImplementation(async () => center());
  mockApi.reportSourceRun.mockResolvedValue({});
  mockApi.importActivity.mockResolvedValueOnce({ status: "imported" }).mockResolvedValueOnce({ status: "duplicate" });
  mockApi.sourceConsent.mockImplementation(async () => { consent = false; return { granted: false }; });
  mockHc.availability.mockResolvedValue("ready");
  mockHc.granted.mockResolvedValue({ steps: true, exercise: true });
  mockHc.revoke.mockResolvedValue(undefined);
  mockHc.readWindow.mockResolvedValue({ candidates: [
    { externalId: "a", sport: "running", startedAt: iso(10 * D), minutes: 40, title: null },
    { externalId: "b", sport: "cycling", startedAt: iso(20 * D), minutes: 70, title: null },
  ], excluded: { unmapped_type: 1 }, complete: true });

  mount();
  await screen.findByTestId("center-health_connect-state-gap");
  expect(screen.getByText(/n’a pas été relue/)).toBeTruthy();
  expect(screen.getByText(/Avant le .*, Santé Connect ne peut plus rien donner/)).toBeTruthy();
  expect(screen.getByText(/Non transmis : Distance \(Santé Connect ne transmet pas encore de distance à TITAN\)/)).toBeTruthy();
  expect(within(screen.getByTestId("center-health_connect")).queryByText("Connecté")).toBeNull();
  expect(screen.queryByTestId("center-garmin")).toBeNull(); // Garmin is not opened for this account: never announced

  // Step 1: read. Nothing is imported yet.
  await act(async () => { fireEvent.press(screen.getByTestId("center-health_connect-replay")); });
  await screen.findByTestId("center-resume-preview");
  expect(mockHc.readWindow).toHaveBeenCalledTimes(1);
  const [from, to] = mockHc.readWindow.mock.calls[0] as [Date, Date];
  expect(Math.round((to.getTime() - from.getTime()) / D)).toBe(30);
  expect(mockApi.importActivity).not.toHaveBeenCalled();
  expect(screen.getByText(/2 séances trouvées dans Santé Connect/)).toBeTruthy();
  expect(screen.getByText(/Exclues : 1 type d’exercice ambigu ou non reconnu/)).toBeTruthy();
  expect(mockApi.reportSourceRun.mock.calls[0][1]).toMatchObject({ kind: "replay", outcome: "running" });

  // Step 2: import after the explicit choice.
  await act(async () => { fireEvent.press(screen.getByTestId("center-resume-import")); });
  await waitFor(() => expect(screen.getByTestId("center-resume-result")).toHaveTextContent("1 séance ajoutée, 1 déjà dans ton journal, pas importée de nouveau, 1 exclue."));
  expect(mockApi.importActivity).toHaveBeenCalledTimes(2);
  expect(mockApi.reportSourceRun.mock.calls.at(-1)![1]).toMatchObject({ outcome: "ok", counts: { imported: 1, duplicate: 1, excluded: 1 }, excluded: { unmapped_type: 1 } });

  // Withdrawal: said first, then applied; afterwards no reading is possible.
  const ask = jest.spyOn(Dialog, "ask").mockResolvedValue(true);
  await act(async () => { fireEvent.press(screen.getByTestId("center-health_connect-withdraw")); });
  expect(ask.mock.calls[0][0]).toBe("Retirer Santé Connect ?");
  expect(ask.mock.calls[0][1]).toMatch(/TITAN ne lit plus rien dans Santé Connect[\s\S]*12 séances déjà importées restent dans ton journal, avec tes corrections[\s\S]*« Archiver »/);
  await waitFor(() => expect(mockApi.sourceConsent).toHaveBeenCalledWith("owner-a", "health_connect", false, expect.any(Function)));
  expect(mockHc.revoke).toHaveBeenCalled();
  await screen.findByTestId("center-health_connect-state-withdrawn");
  expect(screen.getByTestId("center-health_connect-archive")).toBeTruthy();
  expect(screen.queryByTestId("center-health_connect-replay")).toBeNull();
  ask.mockRestore();
});

test("without bundle v24 the screen keeps the previous rows and says the tracking is not open yet", async () => {
  mockApi.sourceCenter.mockRejectedValue(Object.assign(new Error("Could not find the function"), { code: "PGRST202" }));
  mockHc.availability.mockResolvedValue("ready");
  mockHc.granted.mockResolvedValue({ steps: true, exercise: true });
  mount();
  await screen.findByTestId("source-center-closed");
  expect(screen.getByTestId("source-garmin")).toBeTruthy();
  expect(screen.queryByTestId("source-center")).toBeNull();
});
