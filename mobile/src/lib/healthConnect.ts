/* V11 (HC-P0, REC-06/08): reading steps and exercise sessions from Android Health Connect, on the user's explicit request only.
   Scope kept to the minimum: READ_STEPS and READ_EXERCISE, the last seven days, read when the user taps (never in the background); no heart rate, sleep,
   weight, calories, location or route. Steps are Health Connect's own daily aggregate (it already merges overlapping sources, so the same walk is never
   counted twice); a step total never becomes a session and never grants anything. Sessions are offered one by one and sent through the server import
   (which refuses duplicates and links an overlapping session already in the journal). Nothing here goes to analytics or advertising. */
import { Platform } from "react-native";

export const READ_DAYS = 7;
export const MAX_SESSION_MINUTES = 1440;

/** The part of react-native-health-connect used here: a fake with the same shape stands in for it in tests. */
export type HcLib = {
  getSdkStatus: () => Promise<number>;
  initialize: () => Promise<boolean>;
  requestPermission: (p: { accessType: "read"; recordType: "Steps" | "ExerciseSession" }[]) => Promise<{ accessType: string; recordType: string }[]>;
  getGrantedPermissions: () => Promise<{ accessType: string; recordType: string }[]>;
  revokeAllPermissions: () => Promise<unknown>;
  openHealthConnectSettings: () => void;
  aggregateGroupByPeriod: (r: {
    recordType: "Steps";
    timeRangeFilter: { operator: "between"; startTime: string; endTime: string };
    timeRangeSlicer: { period: "DAYS"; length: number };
  }) => Promise<{ result: { COUNT_TOTAL?: number }; startTime: string; endTime: string }[]>;
  readRecords: (
    type: "ExerciseSession",
    o: { timeRangeFilter: { operator: "between"; startTime: string; endTime: string }; pageSize?: number; pageToken?: string },
  ) => Promise<{ records: HcExercise[]; pageToken?: string }>;
};
export type HcExercise = { startTime: string; endTime: string; exerciseType: number; title?: string; metadata?: { id?: string; dataOrigin?: string } };

export const SDK_UNAVAILABLE = 1;
export const SDK_UPDATE_REQUIRED = 2;
export const SDK_AVAILABLE = 3;

export type Availability = "unsupported" | "unavailable" | "update_required" | "ready";
export type Access = { steps: boolean; exercise: boolean };
export type DaySteps = { day: string; steps: number };
export type SessionCandidate = { externalId: string; sport: string; startedAt: string; minutes: number; title: string | null };

/** Android Health Connect exercise types (react-native-health-connect ExerciseType) recognised as a TITAN sport. Only an
    unambiguous type is mapped: « martial arts », « skiing », « paddling » or « frisbee » could each be several sports, so they are
    left out rather than guessed. The previous table read 13 (CALISTHENICS) as dance and 49 (PLANK) as pilates, and missed real
    dance (16) and pilates (48). */
export const SPORT_BY_EXERCISE: Record<number, string> = {
  2: "badminton", 4: "baseball", 5: "basketball", 8: "cycling", 9: "cycling_indoor", 10: "hiit", 11: "boxing", 13: "street_workout",
  14: "cricket", 16: "dance", 25: "elliptical", 26: "fitness_class", 27: "fencing", 28: "american_football", 29: "australian_rules_football",
  32: "golf", 34: "gymnastics", 35: "handball", 36: "hiit", 37: "hiking", 38: "ice_hockey", 39: "ice_skating", 41: "rope_jump",
  47: "paragliding", 48: "pilates", 50: "racquetball", 51: "climbing", 52: "inline_hockey", 53: "rowing", 54: "rowing_machine",
  55: "rugby", 56: "running", 57: "treadmill", 58: "sailing", 59: "diving", 60: "roller", 62: "snowboard", 63: "snowshoeing",
  64: "football", 65: "softball", 66: "squash", 68: "stair_climbing", 69: "stair_climbing", 70: "muscu_gym", 71: "stretching",
  72: "surfing", 73: "open_water_swimming", 74: "swimming", 75: "table_tennis", 76: "tennis", 78: "volleyball", 79: "walking",
  80: "water_polo", 81: "muscu_gym", 83: "yoga",
};

export const sportOf = (exerciseType: number): string | null => SPORT_BY_EXERCISE[exerciseType] ?? null;

const pad = (n: number) => String(n).padStart(2, "0");
/** Calendar day of the phone, as the user lives it (not UTC). */
export const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** The seven local calendar days ending today: [start of the first day, end of the window]. Daylight-saving days keep their real length. */
export function windowOf(now: Date, days = READ_DAYS): { from: Date; to: Date; days: string[] } {
  const today = startOfLocalDay(now);
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
  const list: string[] = [];
  for (let i = 0; i < days; i++) list.push(localDay(new Date(from.getFullYear(), from.getMonth(), from.getDate() + i)));
  return { from, to: now, days: list };
}

/** V1.6.5: why a Health Connect record is not offered, with the reasons of the source center (never silently dropped). */
export type Exclusion = "unmapped_type" | "invalid_id" | "invalid_date" | "too_short" | "too_long";
export function classify(r: HcExercise): { candidate: SessionCandidate } | { excluded: Exclusion } {
  const sport = sportOf(r.exerciseType);
  const start = Date.parse(r.startTime), end = Date.parse(r.endTime);
  const id = r.metadata?.id;
  if (!id || !/^[A-Za-z0-9_.:-]{1,128}$/.test(id)) return { excluded: "invalid_id" };
  if (!sport) return { excluded: "unmapped_type" };
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { excluded: "invalid_date" };
  const minutes = Math.round((end - start) / 60000);
  if (minutes < 1) return { excluded: "too_short" };
  if (minutes > MAX_SESSION_MINUTES) return { excluded: "too_long" };
  return { candidate: { externalId: id, sport, startedAt: new Date(start).toISOString(), minutes, title: r.title?.trim() ? r.title.trim().slice(0, 80) : null } };
}
export function toCandidate(r: HcExercise): SessionCandidate | null {
  const c = classify(r);
  return "candidate" in c ? c.candidate : null;
}
export type WindowRead = { candidates: SessionCandidate[]; excluded: Partial<Record<Exclusion, number>>; complete: boolean };

export function availabilityOf(status: number): Availability {
  return status === SDK_AVAILABLE ? "ready" : status === SDK_UPDATE_REQUIRED ? "update_required" : "unavailable";
}

export function createHealthConnect(lib: HcLib | null) {
  async function availability(): Promise<Availability> {
    if (!lib) return "unsupported";
    try { return availabilityOf(await lib.getSdkStatus()); } catch { return "unavailable"; }
  }
  const accessOf = (granted: { accessType: string; recordType: string }[]): Access => ({
    steps: granted.some((p) => p.accessType === "read" && p.recordType === "Steps"),
    exercise: granted.some((p) => p.accessType === "read" && p.recordType === "ExerciseSession"),
  });
  async function granted(): Promise<Access> {
    if (!lib) return { steps: false, exercise: false };
    try { return accessOf(await lib.getGrantedPermissions()); } catch { return { steps: false, exercise: false }; }
  }
  /** Asks Android for the two read permissions (the system screen decides); returns what was actually granted. */
  async function request(): Promise<Access> {
    if (!lib) return { steps: false, exercise: false };
    if (!(await lib.initialize())) return { steps: false, exercise: false };
    return accessOf(await lib.requestPermission([{ accessType: "read", recordType: "Steps" }, { accessType: "read", recordType: "ExerciseSession" }]));
  }
  async function readSteps(now = new Date()): Promise<DaySteps[]> {
    if (!lib) return [];
    const w = windowOf(now);
    await lib.initialize();
    const groups = await lib.aggregateGroupByPeriod({
      recordType: "Steps",
      timeRangeFilter: { operator: "between", startTime: w.from.toISOString(), endTime: w.to.toISOString() },
      timeRangeSlicer: { period: "DAYS", length: 1 },
    });
    // Each group is one local calendar day starting at local midnight; days without data are simply absent (never invented as zero).
    const byDay = new Map<string, number>();
    for (const g of groups) {
      const day = localDay(new Date(g.startTime));
      const count = Math.round(Number(g.result?.COUNT_TOTAL));
      if (w.days.includes(day) && Number.isFinite(count) && count >= 0 && count <= 200000) byDay.set(day, count);
    }
    return w.days.filter((d) => byDay.has(d)).map((day) => ({ day, steps: byDay.get(day) as number }));
  }
  /** V1.6.5: one bounded window, every record either offered or excluded with its reason. `complete` is false when more than
      1 000 records would have to be read (the resume then says the window was not read to its end). */
  async function readWindow(from: Date, to: Date): Promise<WindowRead> {
    if (!lib) return { candidates: [], excluded: {}, complete: true };
    await lib.initialize();
    const out: SessionCandidate[] = [];
    const excluded: Partial<Record<Exclusion, number>> = {};
    let pageToken: string | undefined;
    let complete = false;
    for (let page = 0; page < 10; page++) {
      const res = await lib.readRecords("ExerciseSession", { timeRangeFilter: { operator: "between", startTime: from.toISOString(), endTime: to.toISOString() }, pageSize: 100, pageToken });
      for (const r of res.records) {
        const c = classify(r);
        if ("candidate" in c) out.push(c.candidate);
        else excluded[c.excluded] = (excluded[c.excluded] ?? 0) + 1;
      }
      pageToken = res.pageToken;
      if (!pageToken) { complete = true; break; }
    }
    return { candidates: out.sort((a, b) => b.startedAt.localeCompare(a.startedAt)), excluded, complete };
  }
  async function readSessions(now = new Date()): Promise<SessionCandidate[]> {
    if (!lib) return [];
    const w = windowOf(now);
    return (await readWindow(w.from, w.to)).candidates;
  }
  return { availability, granted, request, readSteps, readSessions, readWindow, openSettings: () => lib?.openHealthConnectSettings(), revoke: async () => { if (lib) await lib.revokeAllPermissions(); } };
}

/** The real library, loaded only on Android and only when first used (a missing native module is "unsupported", never a crash). */
function loadLib(): HcLib | null {
  if (Platform.OS !== "android") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-health-connect") as HcLib;
  } catch {
    return null;
  }
}
let shared: ReturnType<typeof createHealthConnect> | null = null;
export const healthConnect = () => (shared ||= createHealthConnect(loadLib()));
/** Tests only. */
export const _setHealthConnectForTests = (hc: ReturnType<typeof createHealthConnect> | null) => { shared = hc; };
