/* Story cards (« Partager », before V2): the website's rules and layout (src/core/web/share-story.js, an unchanged copy) with their
   types, and the inputs the app builds from what its own screens already show. Nothing here writes: a card is a picture of known
   values, and the route is loaded separately (lib/storyRoute.ts) as a shape without coordinates. */
import { Format, Sports, type RecordEntry } from ".";
import { recordText, sessionMetrics, sessionRecords } from "./moment";
import { Program } from "./program";
import type { TrainingLog } from "./types";

/* eslint-disable-next-line @typescript-eslint/no-require-imports */
require("./web/sport-contracts.js");
/* eslint-disable-next-line @typescript-eslint/no-require-imports */
require("./web/share-story.js");

export type StoryStyle = "champ" | "feuille" | "carnet";
export type StoryOptions = { style: StoryStyle; name: boolean; date: boolean; route: boolean; week: boolean };
export type StoryOption = "route" | "week" | "date" | "name";
export type RouteShapeInput = { segs: number[][][] };
export type WeekInput = { rows: { label: string; family: string; cells: (number | { level: number } | null)[] }[]; mark: number; markRow: number };

export type SessionStoryInput = {
  sport: string;
  sportId?: string;
  metrics: [string, string][];
  extras?: { fields: unknown[]; values: Record<string, unknown> } | null;
  record?: { label: string; value: string; previous?: string | null } | null;
  week?: WeekInput | null;
  route?: RouteShapeInput | null;
  /** The session's client_event_id: the preview loads its route from it (never drawn, never sent anywhere else). */
  routeEventId?: string | null;
  date?: string | null;
  name?: string | null;
  historical?: boolean;
};

export type AchievementStoryInput = {
  type: "record" | "milestone";
  title: string;
  value?: string | null;
  label?: string | null;
  sport?: string | null;
  sportId?: string | null;
  /** The previous value of a record (null: a first mark). */
  previous?: string | null;
  progress?: string | null;
  date?: string | null;
  name?: string | null;
};

export type StoryRequest = { kind: "session"; input: SessionStoryInput } | { kind: "achievement"; input: AchievementStoryInput };

export type StoryCardModel = {
  kind: "session" | "achievement";
  tone: "lime" | "amber" | "cyan";
  title: string;
  sportId: string | null;
  hero: { value: string; label: string; number: string; unit: string } | null;
  facts: [string, string][];
  record: { label: string; value: string; previous: string | null } | null;
  progress: string | null;
  route: unknown;
  week: unknown;
  date: string | null;
  name: string | null;
  url: string;
};

/** One drawing operation of the shared layout, on the 1080 × 1920 grid. */
export type StoryOp =
  | { t: "fill"; color: string }
  | { t: "rect"; x: number; y: number; w: number; h: number; color: string; cut?: number; radius?: number; opacity?: number; stroke?: string; strokeWidth?: number }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { t: "text"; x: number; y: number; w: number; lh: number; text: string; font: "display" | "figure" | "figureBold" | "text" | "semi" | "bold"; size: number; color: string; align: "left" | "right" | "center"; tracking: number }
  | { t: "route"; segs: number[][][]; color: string; width: number }
  | { t: "mark"; x: number; y: number; size: number; bg: string; fg: string }
  | { t: "icon"; name: string; x: number; y: number; size: number; color: string }
  | { t: "relief"; x: number; y: number; w: number; h: number; color: string; opacity: number; clip?: { x: number; y: number; w: number; h: number } };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

export const ShareStory = g.TitanShareStory as {
  SIZE: { width: number; height: number };
  SAFE: { top: number; bottom: number; side: number };
  SITE: string;
  STYLES: StoryStyle[];
  STYLE_LABELS: Record<StoryStyle, string>;
  DEFAULTS: StoryOptions;
  OPTION_LABELS: Record<StoryOption, string>;
  OPTION_HINTS: Partial<Record<StoryOption, string>>;
  EVENTS: { preview: string; exported: string; failed: string; sheet: string };
  LIMITS: Record<string, number>;
  clip(text: unknown, max: number): string;
  options(raw: unknown): StoryOptions;
  session(input: SessionStoryInput, options?: Partial<StoryOptions>): StoryCardModel;
  achievement(input: AchievementStoryInput, options?: Partial<StoryOptions>): StoryCardModel;
  availableOptions(input: SessionStoryInput | AchievementStoryInput, style?: StoryStyle): StoryOption[];
  fileName(kind: "session" | "achievement"): string;
  layout(model: StoryCardModel, style: StoryStyle): { width: number; height: number; style: StoryStyle; ops: StoryOp[] };
};

const SportContracts = g.TitanSportContracts as { entryFields(sport: string, fields: unknown[], o: { values: Record<string, unknown> }): unknown[] } | undefined;

export const buildStory = (req: StoryRequest, options?: Partial<StoryOptions>): StoryCardModel =>
  req.kind === "session" ? ShareStory.session(req.input, options) : ShareStory.achievement(req.input, options);

/** The week of a session as « le programme » draws it, its day and its sport's line marked. */
export function storyWeek(log: TrainingLog, logs: TrainingLog[]): WeekInput | null {
  try {
    const pool = logs.filter((l) => !l.archived_at && (l.syncStatus === "confirmed" || !l.syncStatus));
    if (!pool.some((l) => l.id === log.id)) pool.push(log);
    const grid = Program.week(pool, { start: new Date(log.date), maxRows: 3 });
    const d = new Date(log.date);
    return { rows: grid.rows.map((r) => ({ label: r.label, family: r.family, cells: r.cells })), mark: (d.getDay() + 6) % 7, markRow: grid.rows.findIndex((r) => r.sport === log.sport) };
  } catch {
    return null;
  }
}

/** A session as its result screen or its journal sheet shows it: its measures, the discipline's own fields, a record it set,
    its week. No reward: the card is about the sport. */
export function sessionStory(log: TrainingLog, { logs, name }: { logs: TrainingLog[]; name?: string | null }): SessionStoryInput {
  const confirmed = log.syncStatus === "confirmed" || !log.syncStatus;
  const record = confirmed && !log.archived_at ? sessionRecords(logs, log).find((r) => !r.first) : undefined;
  const values = (log.details?.extras || null) as Record<string, unknown> | null;
  const catalog = ((Sports.conf(log.sport) as { extraFields?: unknown[] } | null)?.extraFields || []) as unknown[];
  return {
    sport: Sports.label(log.sport),
    sportId: log.sport,
    metrics: sessionMetrics(log),
    extras: values && typeof values === "object" ? { fields: SportContracts?.entryFields ? SportContracts.entryFields(log.sport, catalog, { values }) : catalog, values } : null,
    record: record ? { label: record.label, value: recordText(record), previous: record.previous ? recordText(record, record.previous.value) : null } : null,
    week: storyWeek(log, logs),
    routeEventId: log.client_event_id || (log.details?.client_event_id as string | undefined) || null,
    date: log.date,
    name: name ?? null,
    historical: Boolean(log.details?.historical),
  };
}

/** A record of the Records screen: its value, and the step before it in its own history when there is one. */
export function recordStory(r: RecordEntry, { previous, name }: { previous?: number | string | null; name?: string | null } = {}): AchievementStoryInput {
  const text = (v: number | string) => (typeof v === "number" ? Format.recordValue(r.unit, v) : String(v));
  return {
    type: "record",
    title: r.label,
    value: text(r.value),
    label: null,
    sport: Sports.label(r.sport),
    sportId: r.sport,
    previous: previous === undefined || previous === null ? null : text(previous),
    date: r.log.date,
    name: name ?? null,
  };
}
