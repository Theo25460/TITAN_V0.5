/* Typed façade over the website's TITAN LIVE modules (src/core/web/live-*.js, copied unchanged by
   scripts/sync-web-core.mjs). The engine is the same on both platforms; only the screens differ. */
import "./index";
import type { LiveJournal } from "./liveJournal";
import type { TrainingLog } from "./types";

/* eslint-disable @typescript-eslint/no-require-imports */
require("./web/live-voies.js");
require("./web/live-engine.js");
require("./web/live-world.js");
// Reads TitanTraining and TitanInsights, both loaded by ./index above.
require("./web/live-prepare.js");
require("./web/live-scene.js");
/* eslint-enable @typescript-eslint/no-require-imports */

export type Intent = "atteindre" | "depasser" | "explorer";
export type Immersion = "silence" | "notifications" | "audio" | "aventure";
export type Panel = "route" | "sets" | "wall" | "score" | "rounds" | "flow" | "log" | "legs";
export type Mission = { id: string; intents: Intent[]; label: string; text: string; when: { phase?: string }; check: { metric: string; [k: string]: unknown }; verify?: string; safetyNote?: string };
export type PublicMission = { id: string; label: string; text: string; target: number | null; metric: string; safetyNote: string | null; value?: number | null };
export type LiveConfig = {
  sport: string; label: string; unit: string; voie: string; voieName: string; panel: Panel; tagline: string; signature: string;
  essence: string; family: string; safety: "libre" | "regard" | "mains_libres" | "aucune"; safetyLabel: string; safetyWhy: string; maxImmersion: number;
  road: boolean; offerMode: "live" | "before";
  /** Serene practices (yoga, stretching…) start silent and are never compared with a past session. */
  serene: boolean; defaultImmersion: "silence" | "notifications";
  /** Calm lines shown between two efforts, and what an « Explorer » session may reveal. Text only. */
  calm: string[]; curios: string[];
  beat: { id: string; one: string; many: string; every: Record<string, unknown> };
  plan: { kind: string; count?: number; minutes?: number; workS?: number; restS?: number };
  data: { gps: boolean; steps: boolean; heartRate: string | null; power: string | null; declaredLive: string[]; afterFields: string[] };
  tuning: Record<string, unknown>; missions: Mission[]; artefact: { name: string; text: string }; guardian: { name: string; text: string }; fallback: string;
};
export type LiveState = {
  v: 1; seed: string; sport: string; voie: string; intent: Intent; immersion: Immersion; level: number; status: "ready" | "active" | "paused" | "ended";
  goal: { kind: "time" | "distance" | "beats"; value: number } | null; plan: LiveConfig["plan"]; recovery: boolean;
  missions: { offered: string[]; active: string[]; done: { id: string; at: number; declared: boolean }[]; declined: string[] };
  fields: Record<string, number | string>; feel: number | null; beats: { kind: string; at: number; data: Record<string, unknown> }[];
  [key: string]: unknown;
};
/** The athlete's own comparable sessions, built by LivePrepare.context from sessions the server counted. */
export type LiveBaseline = { medianMinutes?: number; medianBeats?: number; medianElevationM?: number; sessions?: number };
export type LiveEcho = { minutes: number; beats: number };
export type LiveReference = { exercises: Record<string, { name?: string; load?: number; reps: number }>; basis?: string };
/** « Atteindre »: the goal or the plan cut into at most four stages. */
export type LiveStages = { list: { index: number; at: number; label: string; reached: boolean }[]; reached: number; of: number };
/** « Se dépasser »: one threshold, which withdraws by itself (« aside ») or does not exist yet (« none », « missions »). */
export type LiveThreshold = { status: "open" | "done" | "aside" | "none" | "missions"; kind: "set" | "time" | null; text: string; target?: number | null };
export type LiveRecap = { title: string; intent: Intent; minutes: number; lines: string[]; numbers: boolean };
export type LiveCue = { id: string; at: number; text: string; why: string; channels: ("screen" | "notification" | "audio")[]; priority: number };
export type LiveEvent = { id: string; key: string; at: number; text: string };
export type LiveOut =
  | { type: "cue"; cue: LiveCue }
  | { type: "event"; event: LiveEvent; narrate: boolean }
  | { type: "mission_offer" | "mission_active" | "mission_done"; mission: PublicMission }
  | { type: "mission_set_aside" | "mission_capped"; id: string }
  | { type: "discovery"; discovery: { text: string; at: number } }
  | { type: "interrupted"; gapS: number; since: number };
export type LiveView = {
  status: LiveState["status"]; sport: string; voie: string; voieName: string; panel: Panel; intent: Intent; level: number; safety: string; tapsAllowed: boolean;
  activeS: number; effortMin: number; elan: { value: number; max: number }; beats: number; beatOne: string; beatMany: string; beatLabel: string;
  planCount: number | null; goal: { value: number; target: number; ratio: number } | null;
  gps: { distanceM: number; elevationM: number; newPlaces: number; available: boolean }; restLeftS: number | null;
  bell: { round: number; of: number; phase: "work" | "rest" | "done"; leftS: number } | null; echo: { beats: number; delta: number } | null;
  missions: { active: PublicMission[]; done: number }; lastEvent: LiveEvent | null; lastCue: LiveCue | null; fields: Record<string, number | string>;
  /** What the intent changes on screen. `numbers` is false for « Explorer »: the adventure view then shows no figure at all. */
  numbers: boolean; stages: LiveStages | null; threshold: LiveThreshold | null; discoveries: string[] | null;
  /** A calm line between two efforts: screen only, never spoken, never a notification, nothing to tap. */
  interlude: { text: string; index: number } | null;
};
export type LiveInput =
  | { type: "start"; missions?: string[] } | { type: "pause" } | { type: "resume" } | { type: "tick" }
  | { type: "gps"; distanceM: number; elevationM: number; newPlaces?: number }
  | { type: "beat"; kind: string; data?: Record<string, unknown> } | { type: "rest_start"; targetS?: number }
  | { type: "field"; id: string; value: number | string } | { type: "feel"; value: number }
  | { type: "accept" | "decline" | "declare"; id: string } | { type: "end"; rpe?: number | null };
export type LiveDraft = { sport: string; durationMin: number; rpe: number | null; distanceKm?: number; elevationM?: number; extras: Record<string, unknown>; exercises?: { name: string; setRows: { reps: number | null; load: number | null; rir: number | null; hold: number | null }[] }[] };
export type Settle = { ok: boolean; essence?: string; essenceAmount?: number; eclats?: number; missions?: string[]; find?: { key: string; name: string; text: string; rare: boolean } | null; lines?: { id: string; eclats: number }[] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

export const LiveVoies = g.TitanLiveVoies as {
  INTENTS: Record<Intent, { id: Intent; label: string; short: string; promise: string; rewardLabel: string; brings: string[] }>;
  IMMERSION: Record<Immersion, { id: Immersion; level: number; label: string; hint: string }>;
  SAFETY: Record<string, { label: string; maxLevel: number; tapsWhileActive: boolean; why: string }>;
  ESSENCES: Record<string, { id: string; family: string; label: string; building: string }>;
  VOIES: Record<string, { id: string; name: string; loop: string[]; artefact: { name: string; text: string }; guardian: { name: string; text: string } }>;
  resolve(sport: string): LiveConfig;
};

export const LiveEngine = g.TitanLiveEngine as {
  create(opts: { sportId: string; intent?: Intent; immersion?: Immersion; goal?: LiveState["goal"]; plan?: Partial<LiveConfig["plan"]>; seed: string; owner?: string;
    baseline?: LiveBaseline | null; echo?: LiveEcho | null; reference?: LiveReference | null;
    project?: boolean; recovery?: boolean; knownExercises?: string[]; knownTechniques?: string[]; knownConditions?: string[] }): LiveState;
  step(state: LiveState, input: LiveInput, now: number): { state: LiveState; out: LiveOut[] };
  resume(state: LiveState, now: number): { state: LiveState; out: LiveOut[] } | null;
  trimGap(state: LiveState, since: number, now: number): LiveState;
  view(state: LiveState, now: number): LiveView;
  journal(state: LiveState): LiveJournal;
  toDraft(state: LiveState): LiveDraft;
  preparable(state: LiveState): Mission[];
  activeMs(state: LiveState, now: number): number;
  stages(state: LiveState, now: number): LiveStages | null;
  thresholdOf(state: LiveState, now: number): LiveThreshold | null;
  /** The top set of the last session in which this exercise was done and, for « Se dépasser » only, one step above it. */
  referenceFor(state: LiveState, exercise: string): { last: string; suggest: string | null } | null;
  recap(state: LiveState): LiveRecap;
};

/** What a live session may compare itself with (src/core/web/live-prepare.js): same discipline, counted sessions only. */
export const LivePrepare = g.TitanLivePrepare as {
  context(sportId: string, logs: TrainingLog[], opts?: { now?: number }): {
    baseline: LiveBaseline | null; echo: LiveEcho | null; reference: LiveReference | null; knownExercises: string[]; comparable: number; basis: string;
  };
};

/** The part of the server's world snapshot the shared core reads (the full type lives in data/live.ts). */
export type LiveWorldShape = {
  wallet: { eclats: number; essences: Record<string, number> }; buildings: Record<string, number>;
  voies: Record<string, { sessions: number; days: number }>; days: number; distinctVoies: number;
};

export const LiveWorld = g.TitanLiveWorld as {
  RULE: { dailyEssenceCap: number };
  settlePreview(journal: LiveJournal, ctx: { effortMinutes: number; essenceToday: number; sessionsToday: number; familySettledThisWeek: boolean; ownedFinds?: string[]; extras?: Record<string, unknown> }): Settle;
  findOf(journal: Pick<LiveJournal, "voie" | "intent" | "seed">): Settle["find"];
  BUILDINGS: Record<string, { id: string; essence: string | null; name: string; text: string }>;
  LEVEL_COST: number[]; MAX_LEVEL: number; LEVEL_NAMES: string[];
  buildPlan(building: string, level: number, wallet: { eclats: number; essences: Record<string, number> }): { cost: number; useEssence: number; useEclats: number; affordable: boolean; essence: string | null } | null;
  region(voie: string, stats?: { sessions: number; days: number }): { voie: string; name: string; artefact: string; guardian: string; lands: number; of: number; next: number | null; guardianReady: boolean };
  cordee(stats: { days: number; voies: number }): { score: number; unlocked: number; of: number; next: number | null; chapters: { index: number; title: string; text: string }[] };
  arc(voie: string, stats?: { sessions: number; days: number }): { index: number; text: string }[];
  FINDS: Record<string, [string, string][]>;
  /** What the camp is closest to, nearest first, three at most. `world` is the answer of titan_live_world_v1. */
  horizon(world: LiveWorldShape): { kind: "building" | "land" | "guardian" | "cordee"; id: string; ready: boolean; title: string; text: string; sessions: number }[];
  /** What a session of this sport feeds in the world; one line without a world, more with it. */
  stake(sportId: string, world: LiveWorldShape | null): { lines: string[] };
};

export type LiveSceneShape = {
  width: number; height: number; ridges: string[]; stars: { x: number; y: number; r: number }[];
  camp: { x: number; y: number }; trail: string; done: string;
  nodes: { x: number; y: number; index: number; lit: boolean; next: boolean }[];
  traveller: { x: number; y: number; atCamp: boolean }; echo: { x: number; y: number } | null;
  sky: { x: number; y: number; r: number; ratio: number }; summit: { x: number; y: number; reached: boolean };
  window: { first: number; total: number; lit: number; planned: number | null };
};
/** « L'Expédition »: the shared geometry of the adventure view (js/core/live-scene.js on the website). */
export const LiveScene = g.TitanLiveScene as {
  scene(input: { beats: number; planCount?: number | null; echoBeats?: number | null; goalRatio?: number | null; elan?: { value: number; max: number }; seed: string; ended?: boolean }): LiveSceneShape;
};
