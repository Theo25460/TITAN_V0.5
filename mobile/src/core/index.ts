/* Loads the website's pure business modules (src/core/web, synchronised by scripts/sync-web-core.mjs) in their
   original order and exposes them with types. The server remains the authority for XP, credits and rewards: these
   modules only explain, preview and summarise, exactly as on titan-app.fr. */
import type { Goal, TrainingLog } from "./types";

/* eslint-disable @typescript-eslint/no-require-imports */
require("./web/format.js");
require("./web/training-store.js");
require("./web/effort.js");
require("./web/sports-catalog.js");
require("./web/sports.js");
require("./web/sport-insights.js");
require("./web/progress.js");
require("./web/questions.js");
require("./web/renaissance-catalog.js");
require("./web/renaissance-engine.js");
require("./web/campaign-quests.js");
require("./web/campaign-encounters.js");
require("./web/sport-navigation.js");
require("./web/gpx.js");
/* eslint-enable @typescript-eslint/no-require-imports */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

export type Effort = { minutes: number; estimated: boolean; rpe: number | null; intensity: number; counted: number; effortMinutes: number; xp: number };
export type Rank = { level: number; id: string; name: string };
export type SportForm = "distance" | "swim" | "strength" | "bodyweight" | "climbing" | "practice";
export type Family = "endurance" | "force" | "technique" | "jeu" | "mobilite";
export type SportEntry = { id: string; label: string; family: Family; form: SportForm; score?: number };
export type CadenceWeek = { start: string; activeDays: number; state: "held" | "current" | "partial" | "missed" | "pause"; fill: number };
export type Cadence = { target: number; weeks: CadenceWeek[]; held: number; window: number; lifetimeHeld: number; currentDays: number; remaining: number; daysLeftInWeek: number; reachable: boolean };
export type Mastery = { sport: string; label: string; family: Family; sessions: number; minutes: number; estimatedMinutes: number; hours: number; weeks: number; last: string | null; level: number; name: string; next: { level: number; name: string; hours: number; weeks: number } | null; progress: number };
export type WeekSummary = { sessions: number; activeDays: number; minutes: number; estimatedMinutes: number; distance: number; effortMinutes: number; xp: number; bySport: Record<string, { sport: string; label: string; sessions: number; minutes: number }> };
export type RecordEntry = { id: string; kind: "distance" | "time" | "duration" | "strength" | "climbing"; sport: string; label: string; value: number | string; unit: string; log: TrainingLog; context: string; previous?: RecordEntry | null; first?: boolean };
export type Insight = { id: string; tone?: string; priority?: number; title: string; text: string; why?: string; cta?: { label: string; href: string } };
export type Recap = { from: Date; to: Date; week: WeekSummary; baseline: { sessions: number | null; minutes: number | null; distance: number | null; weeks: number; partial: boolean }; deltaMinutes: number | null; deltaSessions: number | null; topSport: { sport: string; label: string; sessions: number; minutes: number } | null; records: RecordEntry[]; goals: { goal: Goal; value: number; before: number; ratio: number; complete: boolean; completedThisWeek: boolean }[]; bestOfRecentWeeks: boolean; empty: boolean };
export type Dna = { sessions: number; minutes: number; estimatedMinutes: number; distance: number; activeWeeks: number; first: string | null; families: { id: Family; label: string; minutes: number; share: number }[]; topSports: { sport: string; label: string; sessions: number; minutes: number }[]; timeOfDay: string | null; favoriteDay: string | null; masteries: Mastery[]; enough: boolean };
export type GoalProgress = { value: number; measured: number; sources: TrainingLog[]; contributors: TrainingLog[]; ratio: number; complete: boolean; ended: boolean; upcoming: boolean };
export type CampaignProgress = { status: "complete" | "not_started" | "ready" | "active"; ready: boolean; percent: number; objectives: { id: string; value: number; target: number; remaining: number; label: string; ratio: number }[] };
export type World = { id: string; name: string; subtitle: string; tier: string; image: string; color: string; guardian: string; intro: string; ending: string; chapters: Chapter[] };
export type Chapter = { id: string; index: number; name: string; story: string; practice: string; title: string; target: number; boss: boolean };
export type AvatarDef = { id: string; name: string; role: string; level: number };
export type RouteDef = { id: string; name: string; description: string; unit: string };

export const Format = g.TitanFormat as {
  number(v: number, digits?: number): string;
  duration(minutes: number): string;
  hours(minutes: number): string;
  distance(km: number): string;
  pace(km: number, minutes: number): string;
  speed(km: number, minutes: number): string;
  weight(kg: number): string;
  relativeDay(date: string | Date, now?: Date): string;
  longDate(date: string | Date): string;
  time(date: string | Date): string;
  daysSince(date: string | Date, now?: Date): number;
  plural(n: number, one: string, many: string): string;
  weekStart(date?: Date | string): Date;
  startOfDay(date?: Date | string): Date;
  dateKey(date: Date | string): string;
  addDays(date: Date | string, days: number): Date;
  recordValue(unit: string, value: number): string;
  clock(minutes: number): string;
};

export const Training = g.TitanTraining as {
  duration(log: Partial<TrainingLog>): number | null;
  load(log: Partial<TrainingLog>): number | null;
  dateKey(d: string | Date): string;
  summarize(logs: TrainingLog[], days?: number, sport?: string, now?: Date): { sessions: number; minutes: number; measured: number; distance: number; distanceMeasured: number; counts: Record<string, number>; buckets: { date: string; minutes: number; sessions: number }[]; dominant: string | null };
  chartBuckets(buckets: { date: string; minutes: number; sessions: number }[], maxBars?: number): { date: string; endDate: string; minutes: number; sessions: number }[];
};

export const EffortRules = g.TitanEffort as {
  DAILY_XP_CAP: number;
  WEEKLY_XP_CAP: number;
  HISTORY_DAYS: number;
  RANKS: Rank[];
  effort(input: { sport?: string; profile?: string; unit?: string; val?: number; details?: object }): Effort;
  isHistorical(date: string | number | Date, now?: number): boolean;
  levelRequirement(level: number): number;
  totalForLevel(level: number): number;
  levelFromTotal(total: number): { level: number; xp: number; next: number };
  rank(level: number): Rank;
  nextRank(level: number): Rank | null;
};

export const Sports = g.TitanSports as {
  FORMS: Record<SportForm, { label: string; measures: string[] }>;
  FAMILY_LABEL: Record<Family, string>;
  FAMILY_ICON: Record<Family, "run" | "weight" | "mountain" | "target" | "leaf">;
  POPULAR: string[];
  ensure(): number;
  label(id: string): string;
  profileOf(id: string): string;
  unitOf(id: string): string;
  familyOf(id: string): Family;
  formOf(id: string): SportForm;
  paceMode(id: string): "pace" | "speed";
  hasElevation(id: string): boolean;
  all(): SportEntry[];
  search(query: string, opts?: { limit?: number }): SportEntry[];
  conf(id: string): { label: string; unit: string; cat: string; balanceProfile?: string } | null;
};
Sports.ensure();

export const Insights = g.TitanInsights as {
  records(logs: TrainingLog[], sport?: string, now?: number | Date): RecordEntry[];
  goalProgress(goal: Goal, logs: TrainingLog[], now?: Date): GoalProgress;
  grade(label: string, system: string): unknown;
  strength(logs: TrainingLog[]): unknown[];
};

export const Progress = g.TitanProgress as {
  MASTERY: { level: number; name: string; hours: number; weeks: number }[];
  FAMILIES: Record<Family, { label: string }>;
  sportMeta(key: string): { key: string; label: string; profile: string; family: Family; unit: string };
  activeLogs(logs: TrainingLog[], now?: number | Date): TrainingLog[];
  effortOf(log: TrainingLog): Effort;
  minutesOf(log: TrainingLog): { minutes: number; estimated: boolean };
  cadence(logs: TrainingLog[], opts?: { target?: number; pauses?: string[]; now?: Date; window?: number }): Cadence;
  mastery(logs: TrainingLog[], now?: Date): Mastery[];
  summarize(list: TrainingLog[]): WeekSummary;
  weekLogs(logs: TrainingLog[], start: Date, now?: Date): TrainingLog[];
  recap(logs: TrainingLog[], opts?: { now?: Date; goals?: Goal[]; current?: boolean }): Recap;
  dna(logs: TrainingLog[], now?: Date): Dna;
  insights(ctx: { logs?: TrainingLog[]; goals?: Goal[]; now?: Date; cadenceTarget?: number; pauses?: string[]; adventure?: unknown; pending?: unknown[]; plan?: unknown }): Insight[];
  nextAction(ctx: { logs?: TrainingLog[]; goals?: Goal[]; now?: Date; cadenceTarget?: number; pauses?: string[]; adventure?: unknown; pending?: unknown[]; plan?: { sport?: string } | null }): Insight;
  campaignProgress(c: unknown): CampaignProgress;
  newRecords(logs: TrainingLog[], from: number, to: number, now?: number | Date): RecordEntry[];
};

export const Questions = g.TitanQuestions as {
  weeklySeries(logs: TrainingLog[], opts?: { weeks?: number; now?: Date }): { start: Date; sessions: number; minutes: number; activeDays: number; current: boolean }[];
  familyShare(logs: TrainingLog[], opts?: { now?: Date; days?: number }): unknown;
};

export const Codex = g.TitanCodex as { worlds: World[]; ranks: { level: number; name: string }[]; avatars: AvatarDef[]; routes: RouteDef[]; version: number };

export const AdventureRules = g.TitanAdventure as { weeklyQuests(logs: TrainingLog[], goal?: number, now?: Date): { id: string; name: string; text: string; value: number; target: number; unit: string; icon: string; href: string }[] };

export type EncounterPhase = { id: string; name: string; value: number; target: number; unit: string; complete: boolean; state: "done" | "active" | "waiting" };
export type Encounter = { kind: "obstacle" | "guardian"; name: string; text: string; phases: EncounterPhase[]; percent: number; ready: boolean; state: "ready" | "active" };
export const CampaignEncounters = g.TitanCampaignEncounters as { describe(c: unknown, progress: CampaignProgress): Encounter | null };

export type GpxResult = { ok: true; points: number; ignoredPoints: number; distanceKm: number; movingMinutes: number | null; elapsedMinutes: number | null; ascent: number; descent: number; start: string | null } | { ok: false; error: string; points: number };
export const Gpx = g.TitanGpx as { analyse(text: string): GpxResult };
