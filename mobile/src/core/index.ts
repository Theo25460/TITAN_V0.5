/* Loads the website's pure business modules (src/core/web, synchronised by scripts/sync-web-core.mjs) in their
   original order and exposes them with types. The server remains the authority for XP, credits and rewards: these
   modules only explain, preview and summarise, exactly as on titan-app.fr. */
import type { AdventureSnapshot, Goal, TrainingLog } from "./types";

/* eslint-disable @typescript-eslint/no-require-imports */
require("./web/format.js");
require("./web/training-store.js");
require("./web/effort.js");
require("./web/sports-catalog.js");
require("./web/sports.js");
require("./web/sport-contracts.js");
require("./web/sport-insights.js");
require("./web/progress.js");
require("./web/progression.js");
require("./web/questions.js");
require("./web/renaissance-catalog.js");
require("./web/renaissance-engine.js");
require("./web/campaign-quests.js");
require("./web/campaign-encounters.js");
require("./web/sport-navigation.js");
require("./web/gpx.js");
require("./web/career.js");
require("./web/periodic-quests.js");
require("./web/sync-state.js");
require("./web/session-match.js");
require("./web/history-ledger.js");
require("./web/history-migration.js");
require("./web/history-window.js");
require("./web/week-plan.js");
require("./web/week-review.js");
require("./web/training-block.js");
require("./web/block-scenario.js");
require("./web/discipline-analysis.js");
/* eslint-enable @typescript-eslint/no-require-imports */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

export type Effort = { minutes: number; estimated: boolean; rpe: number | null; intensity: number; counted: number; effortMinutes: number; xp: number };
export type Rank = { level: number; id: string; name: string };
export type SportForm = "distance" | "swim" | "strength" | "bodyweight" | "climbing" | "practice";
export type Family = "endurance" | "force" | "technique" | "jeu" | "mobilite";
export type SportEntry = { id: string; label: string; family: Family; form: SportForm; score?: number };
export type CadenceWeek = { start: string; activeDays: number; state: "held" | "current" | "partial" | "missed" | "pause"; fill: number };
export type Cadence = { target: number; weeks: CadenceWeek[]; held: number; window: number; lifetimeHeld: number; currentDays: number; currentPaused: boolean; remaining: number; daysLeftInWeek: number; reachable: boolean };
export type Mastery = { sport: string; label: string; family: Family; sessions: number; minutes: number; estimatedMinutes: number; hours: number; weeks: number; last: string | null; level: number; name: string; next: { level: number; name: string; hours: number; weeks: number } | null; progress: number };
export type WeekSummary = { sessions: number; activeDays: number; minutes: number; estimatedMinutes: number; distance: number; effortMinutes: number; xp: number; bySport: Record<string, { sport: string; label: string; sessions: number; minutes: number }> };
export type RecordEntry = { id: string; kind: "distance" | "time" | "duration" | "strength" | "climbing"; sport: string; label: string; value: number | string; unit: string; log: TrainingLog; context: string; previous?: RecordEntry | null; first?: boolean };
export type Insight = { id: string; tone?: string; priority?: number; eyebrow?: string; title: string; text: string; why?: string; cta?: { label: string; href: string } };
export type Recap = { from: Date; to: Date; week: WeekSummary; baseline: { sessions: number | null; minutes: number | null; distance: number | null; weeks: number; partial: boolean }; deltaMinutes: number | null; deltaSessions: number | null; topSport: { sport: string; label: string; sessions: number; minutes: number } | null; records: RecordEntry[]; goals: { goal: Goal; value: number; before: number; ratio: number; complete: boolean; completedThisWeek: boolean }[]; bestOfRecentWeeks: boolean; empty: boolean };
export type WeekChapter = { sessions: number; activeDays: number; comparison: { sport: string; label: string; minutes: number; previousMinutes: number; partial: boolean } | null; story: AdventureSnapshot["rewards"][number] | null; next: { label: string; href: string } };
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

/** V1.6.1: the sync state of a session, worded as on the website journal (src/core/web/sync-state.js). */
export type SyncStateId = "local" | "stored" | "sending" | "pending" | "confirmed" | "refused";
export type SyncActionId = "send" | "correct" | "discard" | "export";
export type SyncView = { state: SyncStateId; label: string; short: string; tone: "ok" | "warn" | "err" | "muted"; text: string; kind: string; facts: { label: string; value: string }[]; actions: { id: SyncActionId; label: string }[] };
type SyncQueueItem = { status: "pending" | "error"; reason?: string; code?: string; queuedAt?: string; attempts?: number; lastAttemptAt?: string; deferred?: boolean; payload?: { details?: { client_event_id?: string } } };
export const SyncState = g.TitanSyncState as {
  describe(input: { log?: Partial<TrainingLog> | null; item?: SyncQueueItem | null; sending?: boolean; guest?: boolean; online?: boolean; now?: number }): SyncView;
  stateOf(input: { log?: Partial<TrainingLog> | null; item?: SyncQueueItem | null; sending?: boolean; guest?: boolean }): SyncStateId;
  replaceable(item: SyncQueueItem | null | undefined): boolean;
  reasonKind(code: string | null | undefined, refused?: boolean): string;
};

/** V1.6.2: one link between a journal session and an import, as the server keeps it (titan_session_matches_v1). */
export type SessionMatchRow = {
  source: string; external_id: string; status: "imported" | "linked"; log_id: string; linked_log_id?: string | null; split_log_id?: string | null;
  sport?: string | null; started_at?: string | null; duration_minutes?: number | null; distance_km?: number | null; imported_at?: string | null;
  match_rule?: string | null; match_overlap?: number | null; needs_review?: boolean; reasons?: string[]; decision?: "same" | "distinct" | null; decided_at?: string | null;
  events?: { action: string; actor: "engine" | "user"; at: string }[];
};
export type MatchDecision = "same" | "distinct";
export type MatchVerdict = "same" | "ambiguous" | "distinct";
export type MatchFacts = { kind: "log" | "import"; id: string; source: string; sport: string; start: number; minutes: number | null; km: number | null; savedAt: number | null; note: string; raw?: TrainingLog };
export type MatchResult = { verdict: MatchVerdict; rule: string | null; reasons: string[]; sharedMinutes: number; overlap: number; divergences: { field: string; label: string; a: string; b: string; missing?: boolean }[]; a: MatchFacts; b: MatchFacts };
export type MatchView = {
  state: "review" | "linked" | "split" | "imported" | "unknown"; tone?: "ok" | "warn"; title: string; text: string; rule?: string; overlap?: number; source?: string; ref?: string;
  sources: { role: "journal" | "import"; label: string; at: string; saved: string; duration: string; distance: string; note: string }[];
  rows: { field: string; label: string; value: string; from: "counted" | "other"; other: string; shownOnly: boolean }[];
  divergences: MatchResult["divergences"]; reasons: string[]; events: { text: string; by: string; at: string }[]; actions: { id: MatchDecision; label: string }[];
};
/** V1.6.2 — Rapprochement des séances, the same rules and words as the website (src/core/web/session-match.js). */
export const SessionMatch = g.TitanSessionMatch as {
  THRESHOLDS: Record<string, number>;
  SOURCES: Record<string, string>;
  REASONS: Record<string, string>;
  RULE: string;
  classify(candidate: Partial<TrainingLog> & { sport: string; date: string }, logs: TrainingLog[]): MatchResult | null;
  compare(a: unknown, b: unknown): MatchResult;
  describe(row: SessionMatchRow, log: TrainingLog | null, logs: TrainingLog[]): MatchView;
  gpxFingerprint(g: { start?: string | null; distanceKm?: number | null; points?: number | null } | null | undefined): string | null;
  toKm(val: unknown, unit: unknown): number | null;
};

/** V1.6.3 — Contrôle et réconciliation: the state matrix and its controls, the same as the website (src/core/web/history-ledger.js). */
export type LedgerState = "confirmed" | "local" | "stored" | "sending" | "pending" | "refused" | "held" | "archived";
export type LedgerChange = { field: "val" | "unit" | "date" | "duration" | "elevation" | "note" | "archived"; before: unknown; after: unknown; unit?: string };
export type LedgerControls = {
  journal: number; archives: number; period: { sessions: number; minutes: number; km: number };
  records: { id: string; value: number; ref: string }[]; csv: { journal: number; archives: number }; json: { trainingLogs: number; archived: number };
};
export type SessionChangeEntry = { revision: number; at: string; changes: LedgerChange[] };
export const Ledger = g.TitanLedger as {
  STATES: Record<LedgerState, string>;
  MATRIX: Record<LedgerState, { journal: "journal" | "archives"; totals: boolean; records: boolean; csv: "journal" | "archives" | null; json: boolean | "device" }>;
  CSV_HEAD: string[];
  canonicalId(log: Partial<TrainingLog>): string;
  reference(log: Partial<TrainingLog>): string;
  stateOf(log: Partial<TrainingLog>, opts?: { guest?: boolean }): LedgerState;
  split<L extends Partial<TrainingLog>>(confirmed: L[], provisional: L[]): { logs: L[]; archived: L[] };
  csvRows(logs: Partial<TrainingLog>[], scope?: "journal" | "archives" | "all", opts?: { guest?: boolean; label?: (sport: string) => string }): unknown[][];
  controls(logs: Partial<TrainingLog>[], opts?: { now?: number; from?: number; to?: number; guest?: boolean; serverRows?: Partial<TrainingLog>[] | null }): LedgerControls;
  gaps(expected: unknown, actual: unknown): string[];
  changes(before: Partial<TrainingLog>, after: Partial<TrainingLog>): LedgerChange[];
  changeText(change: LedgerChange): string;
  sourceLimit(source: string | null | undefined): string | null;
};

/** V1.6.4 — Migration de l’historique: the same reader of history files as the website (src/core/web/history-migration.js). */
export type MigrationFormat = "titan_csv" | "titan_json" | "csv_profile" | "strava_csv";
export type MigrationItem = { id: string; sport: string; startedAt: string; minutes: number; km: number | null; value?: number; unit?: "kg" | "reps"; rpe?: number; note?: string };
export type MigrationRow = { row: number; status: "ready" | "skip"; reason?: string; item?: MigrationItem; sport?: string | null; sportRaw?: string; dst?: "gap" | "repeated" | null };
export type MigrationParsed = { format: MigrationFormat; head: string[]; order: "dmy" | "mdy"; tz: string; rows: MigrationRow[]; unknownSports: Record<string, number>; total: number; mapping: Record<string, unknown> | null };
export type MigrationPlan = MigrationRow & { plan: "add" | "link" | "review" | "skip"; with?: { id: string | null; date: string; sport: string; inFile: boolean } | null; reasons?: string[] };
export type MigrationPreview = { counts: { add: number; link: number; review: number; skip: number; total: number }; reasons: Record<string, number>; rows: MigrationPlan[] };
export type MigrationOptions = { format?: MigrationFormat | null; name?: string; mapping?: Record<string, unknown> | null; tz?: string; order?: "dmy" | "mdy" | null; allowDateOnly?: boolean; sportMap?: Record<string, string>; now?: number };
export type ImportBatch = {
  id: string; format: MigrationFormat; file_name: string | null; total_rows: number; status: "open" | "done" | "withdrawn"; created_at: string; finished_at: string | null;
  withdrawn_at: string | null; withdraw_report: Record<string, number> | null; done_rows: number; next_row: number;
  counts: { added: number; linked: number; duplicate: number; skipped: number; review: number }; reasons: Record<string, number>;
  resumed?: boolean; processed?: number; replayed?: number; limited?: boolean; busy?: boolean;
};
export type ImportBatchRow = { row: number; outcome: "added" | "linked" | "duplicate" | "skipped"; reason: string | null; external_id: string | null; log_id: string | null; needs_review: boolean; withdrawn: string | null; session: { date: string; sport: string; val: number; unit: string; archived: boolean; corrected: boolean } | null };
export const Migration = g.TitanMigration as {
  LIMITS: { historyDays: number; batchSize: number; maxRows: number; maxBytes: number };
  FORMATS: Record<MigrationFormat, string>;
  REASONS: Record<string, string>;
  OUTCOMES: Record<string, string>;
  FIELDS: { column: string | null; json: string; reimport: boolean | string; to: string }[];
  detect(text: string, name?: string): MigrationFormat;
  parse(text: string, opts?: MigrationOptions): MigrationParsed;
  preview(parsed: MigrationParsed, logs: Partial<TrainingLog>[]): MigrationPreview;
  fileHash(text: string): string;
  chunks(parsed: MigrationParsed, nextRow?: number, size?: number): Record<string, unknown>[][];
  measure(batch: Partial<ImportBatch>): { total: number; explained: number; rate: number; duplicates: number; review: number; seconds: number | null };
  withdrawText(effects: Record<string, number> | null | undefined): string[];
};

export type MeasureIssue = { code: string; field: string; message: string };
export const Training = g.TitanTraining as {
  BOUNDS: { maxKm: number; kmWithoutDuration: number; maxKmh: number; maxMeters: number; maxMinutes: number; maxElevation: number; maxExercises: number };
  measureIssues(m: { km?: number | null; minutes?: number | null; meters?: number | null; exercises?: unknown[] | null }): MeasureIssue[];
  /** In the journal, not archived, not held or refused by the server's checks (status rejected / flagged / pending_review). */
  counted(log: Partial<TrainingLog>): boolean;
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
  FAMILY_ICON: Record<Family, "family-endurance" | "family-force" | "family-technique" | "family-jeu" | "family-mobilite">;
  /** The sport's own glyph (docs/design/SPORT_ICONS.md); a sport unknown to the catalogue gets the closest one, else its family mark. */
  iconOf(id: string): import("./icons.generated").IconName;
  ICON_SHARED: Record<string, string>;
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

export type ProgressionItem = { id: string; label: string; unit: string; current: number; previous: number; delta: number; direction: "better" | "worse" | "stable" | "neutral"; significant: boolean; currentReps?: number; previousReps?: number; currentDisplay?: string; previousDisplay?: string };
export type ProgressionTrend = { label: string; unit: string; enough: boolean; sessions?: number; before?: number; after?: number; beforeDisplay?: string; afterDisplay?: string; beforeSessions?: number; afterSessions?: number; direction?: ProgressionItem["direction"] };
export type PeriodSlice = { sessions: number; activeDays: number; minutes: number; unmeasuredSessions: number; estimatedMinutes: number };
export type PeriodSport = { sport: string; label: string; family: Family; sessions: number; minutes: number; distanceKm: number };
/** V1.7.1: the selection behind a comparison — versioned rule, sample, sources, exclusions with their reason, limits. */
export type ComparableSource = { log: TrainingLog; id: string; ref: string; date: string; summary: string };
export type ComparableExclusion = { log: TrainingLog; id: string; ref: string; date: string; reason: string; text: string };
export type Comparables = {
  version: string;
  sport: string;
  rule: { id: string; version: string; label: string; criteria: string[]; pilot: boolean };
  status: "ok" | "limited" | "insufficient";
  sample: number;
  considered: number;
  truncated: boolean;
  retained: ComparableSource[];
  excluded: ComparableExclusion[];
  counts: Record<string, number>;
  limits: string[];
  estimates: { id: string; ref: string; date: string; minutes: number }[];
  previous: TrainingLog | null;
  reference: { kind: "median" | "best"; value: number; unit: string; display: string; sessions: number } | null;
  signature: string;
};
/** Personal progression from measured values only (js/core/progression.js, shared with the website). */
export const Progression = g.TitanProgression as {
  RULES_VERSION: string;
  REASONS: Record<string, string>;
  comparables(log: TrainingLog, logs: TrainingLog[]): Comparables | null;
  snapshot(selection: Comparables | null): Record<string, unknown> | null;
  compare(log: TrainingLog, logs: TrainingLog[]): { previous: TrainingLog; items: ProgressionItem[]; basis: string; selection: Comparables } | null;
  disciplines(logs: TrainingLog[], opts?: { now?: Date; weeks?: number; min?: number }): { sport: string; label: string; family: Family; sessions: number; minutes: number; measuredSessions: number; trend: ProgressionTrend | null }[];
  periods(logs: TrainingLog[], opts?: { now?: Date; days?: number }): { days: number; current: PeriodSlice; previous: PeriodSlice & { partial: boolean }; delta: { sessions: number; activeDays: number; minutes: number } | null; sports: { sport: string; label: string; family: Family; current: PeriodSport | null; previous: PeriodSport | null }[] };
  formatValue(item: Partial<ProgressionItem> & { unit: string }, which?: "current" | "previous"): string;
  DIRECTION_TEXT: Record<string, string>;
};

export type SportContractField = { id: string; priority?: number; legacy?: boolean };
/** Which catalogue fields a form asks for each discipline (js/core/sport-contracts.js, shared with the website). */
export const SportContracts = g.TitanSportContracts as {
  version: number;
  structuredKeys(sport: string): string[];
  retiredReason(sport: string, field: SportContractField): string;
  entryFields<F extends SportContractField>(sport: string, fields: F[], opts?: { values?: Record<string, unknown>; skip?: string[] }): F[];
  contract(sport: string): { form: SportForm; profile: string; label: string; structured: string[]; progress: string };
  dedupeGroup(sport: string): string;
  findDuplicate<L extends { sport: string; date: string }>(candidate: { sport: string; date: string; minutes?: number | null; id?: string }, logs: L[]): L | null;
};

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
  weekChapter(logs: TrainingLog[], opts?: { now?: Date; start?: Date; adventure?: AdventureSnapshot | null; owner?: string; paused?: boolean }): WeekChapter;
  dna(logs: TrainingLog[], now?: Date): Dna;
  insights(ctx: { logs?: TrainingLog[]; goals?: Goal[]; now?: Date; cadenceTarget?: number; pauses?: string[]; adventure?: unknown; pending?: unknown[]; plan?: unknown }): Insight[];
  nextAction(ctx: {
    logs?: TrainingLog[]; goals?: Goal[]; now?: Date; cadenceTarget?: number; pauses?: string[]; adventure?: unknown;
    pending?: { status: string }[]; plan?: { sport?: string } | null; draftSport?: string; online?: boolean; historyAvailable?: boolean;
  }): Insight & { cta: { label: string; href: string } };
  campaignProgress(c: unknown): CampaignProgress;
  newRecords(logs: TrainingLog[], from: number, to: number, now?: number | Date): RecordEntry[];
};

export type WeekPoint = { start: Date; sessions: number; minutes: number; activeDays: number; current: boolean };
export type MonthPoint = { month: string; label: string };
export const Questions = g.TitanQuestions as {
  weeklySeries(logs: TrainingLog[], opts?: { weeks?: number; now?: Date }): WeekPoint[];
  volumeTrend(series: WeekPoint[]): { recent: number; before: number; ratio: number | null; direction: "up" | "down" | "stable" | "new" } | null;
  paceTrend(logs: TrainingLog[], opts?: { now?: Date; months?: number }): { sport: string; points: (MonthPoint & { pace: number; sessions: number })[]; enough: boolean; first?: MonthPoint & { pace: number }; last?: MonthPoint & { pace: number }; delta?: number } | null;
  strengthTrend(logs: TrainingLog[], opts?: { now?: Date; months?: number }): { name: string; variant?: string; sessions: number; points: (MonthPoint & { weight: number })[]; enough: boolean; delta: number | null } | null;
  climbingTrend(logs: TrainingLog[], opts?: { now?: Date; months?: number }): { system: string; points: (MonthPoint & { grade: string; score: number })[]; enough: boolean; up: boolean } | null;
  load(logs: TrainingLog[], opts?: { now?: Date }): { enough: false; coverage: number } | { enough: true; week: number; base: number; ratio: number; level: "high" | "low" | "usual" };
  familyShare(logs: TrainingLog[], opts?: { now?: Date; days?: number }): { total: number; sessions: number; families: { id: Family; minutes: number; share: number }[]; sports: { sport: string; label: string; minutes: number; sessions: number }[] };
};

export type QuestView = { scope: "week" | "month"; kind: string; scopeLabel: string; title: string; text: string; value: number; target: number; percent: number; unit: string[]; state: "claimed" | "ready" | "open"; focus: string[] };
/** Wording of the server's weekly and monthly quests (no rule lives here). */
export const PeriodicQuests = g.TitanPeriodicQuestText as { describe(q: unknown, options?: { sportLabel?: (sport: string) => string }): QuestView | null };
export const Codex = g.TitanCodex as { worlds: World[]; ranks: { level: number; name: string }[]; avatars: AvatarDef[]; routes: RouteDef[]; version: number };

type WeeklyQuest = { id: string; name: string; text: string; href: string; value?: number; target?: number; unit?: string; icon?: string };
export const AdventureRules = g.TitanAdventure as {
  sessionImpact(input: { logId?: string; owner: string; status: string; rewardHeld?: boolean; historical?: boolean; snapshot?: import("./types").AdventureSnapshot | null; snapshotReady?: boolean }): { state: "pending" | "confirmed" | "historical"; text: string; campaignId?: string };
  weeklyQuestPaths(logs: TrainingLog[], goal?: number, now?: Date, prefs?: { favoriteSports?: string[]; cadencePaused?: boolean }): { main: WeeklyQuest; alternatives: WeeklyQuest[]; why: string };
};

export type EncounterPhase = { id: string; name: string; value: number; target: number; unit: string; complete: boolean; state: "done" | "active" | "waiting" };
export type Encounter = { kind: "obstacle" | "guardian"; name: string; text: string; phases: EncounterPhase[]; percent: number; ready: boolean; state: "ready" | "active" };
export const CampaignEncounters = g.TitanCampaignEncounters as { describe(c: unknown, progress: CampaignProgress): Encounter | null };

export type GpxResult = { ok: true; points: number; ignoredPoints: number; distanceKm: number; movingMinutes: number | null; elapsedMinutes: number | null; ascent: number | null; descent: number | null; kind: "recorded" | "route" | "incomplete"; timing: "complete" | "invalid" | "partial" | "missing"; routeType: "track" | "planned_route"; start: string | null } | { ok: false; error: string; points: number };
export const Gpx = g.TitanGpx as { analyse(text: string): GpxResult };

export type CareerRange = "7d" | "30d" | "year" | "all";
export type CareerLens = "run" | "hike" | "bike" | "swim" | "strength" | "multi";
export type Career = {
  range: CareerRange; from: string | null; first: string | null; empty: boolean; excluded: number;
  totals: { sessions: number; activeDays: number; sports: number; minutes: number; measuredSessions: number; unmeasuredSessions: number };
  calories: { available: false };
  distance: { footKm: number; footSessions: number; bikeKm: number; bikeSessions: number; swimMeters: number; swimSessions: number; otherKm: number; footMinutes: number; bikeMinutes: number; swimMinutes: number; runKm: number; runMinutes: number; footElevation: number; bikeElevation: number; footPace: number | null; bikeKmh: number | null };
  elevation: { meters: number; sessions: number };
  steps: { total: number; days: number; firstDay: string; estimatedKm: number } | null;
  strength: { sessions: number; sets: number; reps: number; volumeKg: number; loadedSets: number; heaviestKg: number };
  lenses: CareerLens[];
  families: { id: Family; label: string; sessions: number; minutes: number; share: number }[];
  sports: { sport: string; label: string; family: Family; sessions: number; minutes: number; km: number }[];
  records: { id: string; kind: RecordEntry["kind"]; sport: string; sportLabel: string; label: string; value: number | string; unit: string; date: string }[];
  milestones: { id: string; date: string; title: string; detail: string; tone: "amber" | "cyan"; sport: string }[];
  timeline: { id: string; date: string; sport: string; label: string; minutes: number | null; km: number | null }[];
  rpg: { level: number | null; id: string | null; name: string | null; xp: number | null };
};
export const CareerRules = g.TitanCareer as {
  build(logs: TrainingLog[], opts?: { now?: Date | number; range?: CareerRange; stepDays?: { day: string; steps: number }[] | null; rank?: { level?: number; id?: string; name?: string } | null; xp?: number | null }): Career;
  STEP_KM: number;
};

/** V1.6.6 — Journal longue durée: paged reading by key, refresh by manifest, coverage of the device copy, the same as the website
    (src/core/web/history-window.js). The readers take the app's Supabase client (the same supabase-js as the website). */
export type HistoryCoverage = { complete: boolean; count: number; total: number | null; oldest: string | null; newest: string | null; checkedAt: string | null; mode: string };
export type HistoryRefresh = { rows: TrainingLog[]; removed: string[]; coverage: HistoryCoverage; stats: { mode: "manifest" | "pages"; requests: number; read: number; removed: number; kept: number } };
export const HistoryWindow = g.TitanHistoryWindow as {
  PAGE: number;
  MANIFEST_COLUMNS: string;
  order(a: Partial<TrainingLog>, b: Partial<TrainingLog>): number;
  fingerprint(row: Partial<TrainingLog>): string;
  diff(cached: Partial<TrainingLog>[], manifest: Partial<TrainingLog>[]): { fetch: string[]; remove: string[]; kept: number };
  merge<L extends Partial<TrainingLog>>(cached: L[], fetched: L[], removed?: string[]): L[];
  reconcile<L extends Partial<TrainingLog>>(current: L[], refreshed: L[], removed?: string[], startedFrom?: L[]): L[];
  coverageOf(rows: Partial<TrainingLog>[], opts?: { complete?: boolean; total?: number | null; checkedAt?: number | string | null; mode?: string }): HistoryCoverage;
  covers(coverage: HistoryCoverage | null | undefined, since?: number): boolean;
  describe(coverage: HistoryCoverage | null | undefined, opts?: { online?: boolean; loading?: boolean }): { state: "complete" | "partial" | "none"; tone: "info" | "warn"; short: string; text: string } | null;
  refresh(client: unknown, owner: string, cached: { rows: TrainingLog[]; coverage: HistoryCoverage } | null, opts?: { onPage?: (rows: TrainingLog[], coverage: HistoryCoverage) => unknown; timeout?: <T>(p: PromiseLike<T>) => Promise<T>; now?: () => number }): Promise<HistoryRefresh>;
};

/** V1.7.2 — Planifié et réalisé: occurrences of the typical week tied to the sessions really done, the same rules and words as the
    website (src/core/web/week-plan.js). The schedule is game_state.user.schedule (monday … sunday, revisions, weeks). */
export type PlanDay = { sport: string; minutes: number | null; note: string } | null;
export type WeekDecisionKind = "move" | "replace" | "skip" | "link" | "none" | "reset";
export type WeekDecision = { kind: WeekDecisionKind; day?: string; sport?: string; session?: string };
export type WeekOccurrence = {
  id: string; index: number;
  planned: { day: string; sport: string; minutes: number | null; note: string };
  decision: { kind: WeekDecisionKind; at: string | null; day?: string; sport?: string; session?: string; origin?: string } | null;
  effective: { day: string; sport: string };
  status: "done" | "skipped" | "ask" | "paused" | "missed" | "today" | "planned";
  gap: "moved" | "replaced" | "skipped" | "missed" | null;
  link: { session: string; how: "auto" | "manual" } | null;
  candidates: string[]; otherSport?: boolean; notice: "removed" | "not-counted" | "other-week" | "taken" | null; declined?: boolean;
  actual?: { day: string; sport: string };
};
export type WeekPlanView = {
  version: number; week: string; to: string; current: boolean; past: boolean; paused: boolean;
  reference: { source: "week" | "revision" | "type" | "reconstructed" | "block"; at: string | null; days: PlanDay[]; block?: { id: string; index: number; from: string; kind: string | null; label: string | null } };
  occurrences: WeekOccurrence[]; extra: { id: string; day: string; sport: string; ask: boolean }[];
  summary: { planned: number; done: number; asPlanned: number; moved: number; replaced: number; skipped: number; missed: number; toDecide: number; upcoming: number; extra: number; gaps: number };
  signature: string;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Schedule = Record<string, any>;
export const WeekPlan = g.TitanWeekPlan as {
  VERSION: number; MAX_WEEKS: number; DAY_KEYS: string[]; DAY_NAMES: string[]; RULES: Record<"reference" | "link" | "gap" | "pause", string>;
  addDays(key: string, n: number): string; weekOf(key: string): string; dayIndex(key: string): number;
  localKey(instant: string | number | Date, zone?: string | null): string | null;
  sessionDay(log: Partial<TrainingLog>, zone?: string | null): string | null; sessionId(log: Partial<TrainingLog>): string;
  typeDays(schedule: Schedule): PlanDay[];
  revisions(schedule: Schedule): { from: string | null; days: PlanDay[]; at: string | null }[];
  reference(schedule: Schedule, week: string, opts?: { current?: string }): WeekPlanView["reference"];
  editType(schedule: Schedule, dayKey: string, value: { sport: string | null; minutes?: number | string | null; note?: string } | null, opts: { today: string; at?: string }): { schedule: Schedule; appliesFrom: string };
  decide(schedule: Schedule, occurrenceId: string, decision: WeekDecision, opts: { today: string; at?: string }): Schedule;
  merge(local: Schedule, remote: Schedule): Schedule;
  week(schedule: Schedule, logs: Partial<TrainingLog>[], opts: { week?: string; today: string; zone?: string | null; pauses?: string[] }): WeekPlanView;
  snapshot(view: WeekPlanView): unknown;
  describe(o: WeekOccurrence, opts?: { label?: (sport: string) => string }): { plan: string; status: string; notice: string | null; gap: string | null };
  summarize(view: WeekPlanView): { start: string; changes: string; result: string };
};

/** V1.7.4 — Objectifs et blocs d’entraînement: multi-week blocks on the planning (each week of a block is the programme of that week),
    models by type of project, milestones measured by a real session or declared, the revision of one week, the copy of a week, the
    shift with its preview, the duplication and the removal of a block, the same rules and words as the website
    (src/core/web/training-block.js). Stored in schedule.blocks. */
export type BlockWeekPlan = { days: (PlanDay | null)[]; kind?: "plan" | "report" | "copy"; n?: number; of?: number; light?: boolean; milestones?: string[] };
export type BlockMeasure = { kind: "measure" | "declared"; sport?: string | null; metric?: "distance" | "duration" | "elevation" | "sessions" | null; target?: number | null };
export type BlockMilestoneState = BlockMeasure & { id: string; title: string; week: string; index: number | null; closed: boolean; state: "reached" | "late" | "missed" | "pending"; session: string | null; day: string | null; declared: { at: string } | null; how?: "session" | "declared"; before?: boolean; best?: number };
export type BlockGoalState = BlockMeasure & { title: string; date: string | null; state: "reached" | "passed" | "pending"; session: string | null; day: string | null; how?: string; daysLeft?: number; best?: number };
export type BlockWeek = { index: number; week: string; label: string; kind: string; light: boolean; days: (string | null)[]; minutes: (number | null)[]; plan: (string | null)[]; applied: boolean; before: boolean; state: "closed" | "current" | "upcoming"; paused: boolean; milestones: string[]; summary?: { planned: number; done: number; asPlanned: number; gaps: number; extra: number; source: string } };
export type BlockLogEntry = { at: string; kind: string; from: string; origin: string; effect: { weeks?: { week: string; before: string | null; after: string | null }[]; milestones?: { id: string; title: string; before: string | null; after: string | null }[]; exceptions?: { week: string; occurrence: string; state: string }[]; pauses?: string[]; detail?: Record<string, unknown> } | null };
export type BlockView = {
  version: number; id: string; title: string; intent: string; template: string | null; sports: string[]; created: string; copyOf: string | null;
  start: string; end: string; activation: string | null; removed: string | null; state: "active" | "upcoming" | "finished" | "removed"; currentIndex: number;
  weeks: BlockWeek[]; milestones: BlockMilestoneState[]; goal: BlockGoalState | null; log: BlockLogEntry[]; open: string; conflict: boolean; signature: string;
};
export type BlockPreview = {
  kind: string; from: string; detail?: Record<string, unknown>;
  weeks: { week: string; state: string; changed: boolean; before: { days: (string | null)[]; source: string; label: string | null }; after: { days: (string | null)[]; source: string; label: string | null }; paused: boolean }[];
  milestones: { id: string; title: string; before: string | null; after: string | null }[];
  goal: { title: string; date: string | null; kept: boolean; endsAfter: boolean; late: string[] } | null;
  pauses: string[]; exceptions: { week: string; occurrence: string; kind: string; origin: string | null; before: string | null; after: string | null; state: string }[]; closed: number; current: boolean;
};
export type BlockChange = { at: string; kind: string; from: string; origin: string; here: { week: string; before: string | null; after: string | null } | null; milestones: { id: string; title: string; before: string | null; after: string | null }[]; exceptions: { week: string; occurrence: string; state: string }[]; detail: Record<string, unknown> | null };
export type BlockContext = { id: string; title: string; state: BlockView["state"]; goal: BlockGoalState | null; week: string; index: number | null; count: number; label: string | null; applied: boolean; before: boolean; changes: BlockChange[]; milestones: BlockMilestoneState[]; removed: string | null; signature: string };
export type BlockInput = { id?: string; title: string; intent?: string; template?: string; sports?: string[]; start: string; weeks: BlockWeekPlan[]; goal?: (BlockMeasure & { title: string; date?: string | null }) | null; milestones?: (BlockMeasure & { id?: string; title: string; week: number })[] };
type BlockOpts = { today: string; zone?: string | null; pauses?: string[]; at?: string; logs?: Partial<TrainingLog>[] };
type BlockResult = { schedule: Schedule; block: Schedule; from: string; preview: BlockPreview };
export const TrainingBlock = g.TitanTrainingBlock as {
  VERSION: number; MIN_WEEKS: number; MAX_WEEKS: number; MAX_SHIFT: number; RULES: Record<"event" | "start" | "journal" | "preview", string>;
  TEMPLATES: { id: string; title: string; weeks: number; text: string }[];
  draft(template: string, opts: { type?: (PlanDay | null)[]; sport?: string; weeks?: number; peak?: number; longDay?: number; midDay?: number }): BlockWeekPlan[];
  suggest(template: string, opts: { weeks?: number; sport?: string; goal?: BlockInput["goal"]; type?: (PlanDay | null)[] }): NonNullable<BlockInput["milestones"]>;
  firstOpen(schedule: Schedule, today: string): string;
  weekLabel(week: BlockWeekPlan | undefined, index: number): string;
  create(schedule: Schedule, input: BlockInput, opts: BlockOpts): BlockResult;
  editWeek(schedule: Schedule, id: string, args: { index: number; days: (PlanDay | null)[] }, opts: BlockOpts): BlockResult;
  duplicateWeek(schedule: Schedule, id: string, args: { from: number; to: number }, opts: BlockOpts): BlockResult;
  shift(schedule: Schedule, id: string, args: { from: number; weeks?: number }, opts: BlockOpts): BlockResult;
  setMilestone(schedule: Schedule, id: string, args: Record<string, unknown>, opts: BlockOpts): BlockResult;
  declare(schedule: Schedule, id: string, args: { milestone?: string; goal?: boolean; done?: boolean }, opts: BlockOpts): { schedule: Schedule; block: Schedule };
  remove(schedule: Schedule, id: string, opts: BlockOpts): BlockResult;
  duplicate(schedule: Schedule, id: string, args: { start: string; title?: string; newId?: string }, opts: BlockOpts): BlockResult;
  view(schedule: Schedule, logs: Partial<TrainingLog>[], id: string, opts: BlockOpts): BlockView | null;
  list(schedule: Schedule, logs: Partial<TrainingLog>[], opts: BlockOpts): BlockView[];
  weekContext(schedule: Schedule, logs: Partial<TrainingLog>[], opts: BlockOpts & { week?: string }): BlockContext | null;
  measure(schedule: Schedule, logs: Partial<TrainingLog>[], opts: BlockOpts): { blocks: number; activated: number; milestones: number; linked: number; declared: number; interrupted: number; kept: number };
  snapshot(view: BlockView | null): unknown;
  unitText(metric: string, target: number): string;
  describeMeasure(m: BlockMeasure, opts?: Words): string;
  describeMilestone(m: BlockMilestoneState, opts?: Words): { title: string; what: string; when: string; state: string };
  describeGoal(g: BlockGoalState | null, opts?: Words): { title: string; what: string; date: string; state: string } | null;
  describePreview(p: BlockPreview, opts?: Words): { lines: string[]; notes: string[]; where: string };
  describeChange(c: BlockChange, opts?: Words): { source: string; effect: string };
};

/** V1.7.6 — Scénarios multisports: two private variants of a few weeks compared on what the plan gives (time per sport, free days,
    overlaps, milestones that move), the chosen one applied from an explicit Monday through a preview, then undone, the same rules and
    words as the website (src/core/web/block-scenario.js). Drafts in schedule.scenarios; applying writes the V1.7.4 block. */
export type ScenarioSlot = { sport: string; minutes: number | null; note: string } | null;
export type ScenarioSports = Record<string, { minutes: number; sessions: number; unknown: number }>;
export type ScenarioConflict = { week: string; day: number; sport: string; kind: "pause" | "cadence" | "unavailable" | "decision"; occurrence?: string; moved?: string };
export type ScenarioPlan = { sports: ScenarioSports; minutes: number; sessions: number; unknown: number; free: number; weeks: { week: string; minutes: number; sessions: number; unknown: number; free: number; days: ScenarioSlot[] }[]; conflicts: ScenarioConflict[]; exceptions: unknown[]; milestones: Record<string, string | null>; name?: string; same?: boolean };
export type ScenarioApplied = { at: string; variant: "a" | "b"; name: string; from: string; block: string; created: boolean; undone: { at: string; from: string } | null };
export type ScenarioComparison = {
  version: number; id: string; title: string; base: string | null; baseTitle: string | null; start: string; end: string; count: number; weeks: string[]; open: string;
  availability: { week: string; pause: boolean; days: boolean[] | null }[]; plans: { active: ScenarioPlan; a: ScenarioPlan; b: ScenarioPlan };
  rows: { sport: string; delta: number | null }[]; free: { active: number; a: number; b: number; delta: number }; conflicts: { active: number; a: number; b: number }; moved: { a: number; b: number };
  milestones: { id: string; title: string; active: string | null; a: string | null; b: string | null; moved: { a: boolean; b: boolean } }[]; hypotheses: string[]; applied: ScenarioApplied | null;
};
export type ScenarioPreview = { kind: "apply" | "undo"; scenario: string; variant: string | null; name: string | null; from: string; occurrences: { id: string; week: string; change: string }[]; kept: number; lived: string[] };
export type ScenarioFollowUp = { id: string; title: string; variant: string; name: string; week: string; undone: boolean; lived: boolean; summary: { planned: number; done: number; gaps: number } };
type ScenarioOpts = { today: string; zone?: string | null; pauses?: string[]; at?: string };
type ScenarioResult = { schedule: Schedule; scenario: Schedule; preview: ScenarioPreview };
type ScenarioWords = { label?: (s: string) => string; dayLong?: (k: string) => string };
type Line = { active: string; a: string; b: string; delta: string };
export const BlockScenario = g.TitanBlockScenario as {
  VERSION: number; KEYS: ("a" | "b")[]; LETTER: Record<"a" | "b", string>; HYPOTHESES: string[]; RULES: Record<"draft" | "apply" | "undo", string>;
  list(schedule: Schedule): { id: string; title: string; start: string; count: number; base: string | null; applied: ScenarioApplied | null; names: { a: string; b: string } }[];
  compare(schedule: Schedule, logs: Partial<TrainingLog>[], id: string, opts: ScenarioOpts): ScenarioComparison;
  apply(schedule: Schedule, logs: Partial<TrainingLog>[], id: string, args: { variant: "a" | "b"; from: string }, opts: ScenarioOpts): ScenarioResult;
  undo(schedule: Schedule, logs: Partial<TrainingLog>[], id: string, opts: ScenarioOpts): ScenarioResult;
  fit(schedule: Schedule, id: string, args: { variant: "a" | "b"; week: number }, opts: ScenarioOpts): { schedule: Schedule };
  followUp(schedule: Schedule, logs: Partial<TrainingLog>[], opts: ScenarioOpts & { week?: string }): ScenarioFollowUp | null;
  measure(schedule: Schedule): { scenarios: number; compared: number; applied: number; undone: number; decisions: number; conflictsAvoided: number };
  snapshot(c: ScenarioComparison | null): unknown;
  describeComparison(c: ScenarioComparison, opts?: ScenarioWords): { names: Record<"active" | "a" | "b", string>; sports: (Line & { sport: string; label: string })[]; total: Line; free: Line; conflicts: Record<"active" | "a" | "b", string[]>; milestones: { id: string; title: string; active: string; a: string; b: string }[]; fields: string[]; weeks: { week: string; title: string; availability: string | null; active: string; a: string; b: string }[]; observed: { title: string; lines: string[] }; planned: string; same: string[] };
  describePreview(p: ScenarioPreview, opts?: ScenarioWords): { lines: string[]; notes: string[]; where: string };
  describeFollowUp(f: ScenarioFollowUp | null, opts?: ScenarioWords): { lead: string; planned: string; done: string; result: string } | null;
};

/** V1.7.3 — Bilan et ajustements: one observation of the followed weeks with its source sessions, the actions on the week after
    (keep, move a slot, pause), the preview, the choice with its origin, its undo, and the follow-up at the next bilan, the same rules
    and words as the website (src/core/web/week-review.js). Stored in schedule.reviews and the cadence pauses. */
export type ReviewAction = { kind: "keep" | "pause" } | { kind: "move"; from: number; to: number; scope: "next" | "type" };
export type ReviewSlot = { index: number; sport: string; weeks: number; asPlanned: number; adjusted: number; moved: number; replaced: number; skipped: number; missed: number };
export type ReviewObservation = {
  kind: "short" | "moved" | "missed" | "regular" | "mixed"; week: string; window: number; followed: number; weeks: string[];
  slot: { index: number; sport: string; weeks: number; moved: number; missed: number; days: { day: number; n: number }[]; occurrences: string[] } | null;
  slots: ReviewSlot[]; sources: string[]; total?: number; asPlanned?: number; regular?: number[];
  suggestion: { kind: "keep" } | { kind: "move"; from: number; to: number | null; scope: "next" | "type" };
};
export type ReviewRecord = {
  v: number; week: string; target: string; at: string;
  observation: { kind: ReviewObservation["kind"]; slot: { index: number; sport: string } | null; sources: string[]; suggested: boolean };
  action: { kind: "keep" | "pause"; scope: "next" } | { kind: "move"; from: number; to: number; scope: "next" | "type" };
  applied: { occurrence?: string; prior?: unknown; days?: Record<string, unknown>; wrote?: Record<string, unknown>; from?: string; pause?: string };
  undone: string | null;
};
export type ReviewFollowUp = { week: string; target: string; review: ReviewRecord; undone: boolean; state: string | null; session: string | null; occurrence: string | null; summary: WeekPlanView["summary"]; paused: boolean; actualDay?: number; extraDay?: number };
export type WeekReviewView = {
  version: number; week: string; target: string; observation: ReviewObservation;
  actions: { week: string; target: string; open: boolean; decided: ReviewRecord | null; keep: boolean; move: { from: number[]; to: number[] } | null; pause: boolean; alreadyPaused: boolean };
  followUp: ReviewFollowUp | null; signature: string;
};
export type ReviewPreview = { week: string; target: string; appliesFrom: string; scope: "next" | "type"; action: ReviewRecord["action"]; before: { days: (string | null)[]; paused: boolean }; after: { days: (string | null)[]; paused: boolean }; changes: { index: number; before: string | null; after: string | null }[] };
type ReviewOpts = { week?: string; today: string; zone?: string | null; pauses?: string[]; at?: string };
type Words = { label?: (sport: string) => string; dayLong?: (key: string) => string };
export const WeekReview = g.TitanWeekReview as {
  VERSION: number; WINDOW: number; MIN_WEEKS: number; RULES: Record<"window" | "short" | "shift" | "count" | "choice", string>;
  review(schedule: Schedule, logs: Partial<TrainingLog>[], opts: ReviewOpts): WeekReviewView;
  preview(schedule: Schedule, logs: Partial<TrainingLog>[], opts: ReviewOpts, action: ReviewAction): ReviewPreview;
  apply(schedule: Schedule, logs: Partial<TrainingLog>[], opts: ReviewOpts, action: ReviewAction): { schedule: Schedule; pauses: string[]; review: ReviewRecord };
  undo(schedule: Schedule, pauses: string[], opts: { week: string; today: string; at?: string }): { schedule: Schedule; pauses: string[]; review: ReviewRecord; kept: string[] };
  adjustments(schedule: Schedule, opts: { week?: string; today: string }): ReviewRecord[];
  measure(schedule: Schedule, logs: Partial<TrainingLog>[], opts: ReviewOpts): { confirmed: number; undone: number; found: number };
  snapshot(view: WeekReviewView): unknown;
  measureOf(log: Partial<TrainingLog> | undefined): string;
  describeObservation(o: ReviewObservation, opts?: Words): { title: string; text: string; lines?: string[] };
  describeAction(a: ReviewAction | ReviewRecord["action"], opts?: Words & { sport?: string | null }): string;
  describePreview(p: ReviewPreview, opts?: Words): { lines: string[]; where: string; undo: string };
  describeFollowUp(f: ReviewFollowUp | null, opts?: Words): { decided: string; observed: string; tone: "ok" | "warn" | "muted" } | null;
};

/** V1.7.5 — Analyse avancée par discipline: the three depth views of the website (src/core/web/discipline-analysis.js). */
export type AnalysisDiscipline = "endurance" | "strength" | "climbing";
export type AnalysisSide = { value: number | null; display: string; measured: number; total: number; sessions: string[]; from?: string; missing?: string };
export type AnalysisRow = { id: string; label: string; rule: string; provenance: string; current: AnalysisSide; reference: AnalysisSide | null; direction: "better" | "worse" | "stable" | "neutral"; significant: boolean; change?: number; reason?: "short"; better?: "higher" | "lower"; status: "measured" | "partial" | "absent" };
export type AnalysisGroup = { id: string; discipline: AnalysisDiscipline; sport: string; label: string; sessions: number; criteria: string[]; limits: string[]; anchor?: string; scale?: string; ordered?: boolean; exercise?: string };
export type AnalysisLevel = { grade: string; score: number; done: number; tried: number; attempts: number; successes: number; measured: number; sessions: string[] };
export type AnalysisReference = { kind: "period" } | { kind: "block"; id?: string; title: string; start: string; end: string } | { kind: "session"; id: string } | null;
export type AnalysisView = {
  version: string; discipline: AnalysisDiscipline; label: string; sport: string | null; group: AnalysisGroup | null; groups: number; status: "ok" | "limited" | "insufficient";
  current: { label: string; sessions: string[] };
  reference: { kind: "period" | "block" | "session"; label: string; sessions: string[]; status: "ok" | "empty" | "missing" | "excluded" | "incomparable"; note?: string; id?: string } | null;
  rows: AnalysisRow[]; levels: { current: AnalysisLevel[] | null; reference: AnalysisLevel[] | null } | null;
  series: { id: string; date: string; side: "current" | "reference" | "both"; value: number | null; display: string }[]; seriesMetric?: string;
  limits: string[]; states: Record<string, number>; signature: string;
};
export const DisciplineAnalysis = g.TitanDisciplineAnalysis as {
  VERSION: string; MIN_SESSIONS: number; MIN_SPLITS: number; DISCIPLINES: Record<AnalysisDiscipline, string>; DIRECTION: Record<string, string>;
  sports(logs: Partial<TrainingLog>[], discipline: AnalysisDiscipline): { sport: string; label: string; sessions: number }[];
  groups(logs: Partial<TrainingLog>[], discipline: AnalysisDiscipline, opts?: { sport?: string }): AnalysisGroup[];
  view(logs: Partial<TrainingLog>[], opts: { discipline: AnalysisDiscipline; sport?: string; group?: string; now?: Date; weeks?: number; reference?: AnalysisReference }): AnalysisView | null;
  reading(view: AnalysisView | null): string[];
  dateText(t: number, now?: number): string;
};
