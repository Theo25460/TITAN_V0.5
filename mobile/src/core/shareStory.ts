/* Story cards (« Partager », before V2): the website's rules (src/core/web/share-story.js, an unchanged copy) with their types, and
   the inputs the app builds from what its own screens already show. Nothing here writes: a card is a picture of known values. */
import { EffortRules, Format, Sports, type RecordEntry } from ".";
import { recordText, sessionMetrics, sessionRecords } from "./moment";
import type { TrainingLog } from "./types";

/* eslint-disable-next-line @typescript-eslint/no-require-imports */
require("./web/share-story.js");

export type StoryOptions = { name: boolean; date: boolean; xp: boolean };
export type StoryOption = keyof StoryOptions;

export type SessionStoryInput = {
  sport: string;
  metrics: [string, string][];
  record?: { label: string; value: string; previous?: string | null } | null;
  xp?: { confirmed: boolean; amount: number; level?: number | null; rankName?: string | null } | null;
  date?: string | null;
  name?: string | null;
  historical?: boolean;
  /** Only used to pick the icon of the discipline; never drawn as text. */
  sportId?: string;
};

export type AchievementStoryInput = {
  type: "record" | "milestone" | "level";
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
  accent: "cyan" | "amber";
  eyebrow: string;
  title: string;
  hero: { value: string; label: string } | null;
  facts: [string, string][];
  highlight: { label: string; value: string; detail: string | null } | null;
  progress: string | null;
  xp: string | null;
  level: string | null;
  date: string | null;
  name: string | null;
  url: string;
  tagline: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

export const ShareStory = g.TitanShareStory as {
  SIZE: { width: number; height: number };
  SAFE: { top: number; bottom: number; side: number };
  SITE: string;
  DEFAULTS: StoryOptions;
  OPTION_LABELS: Record<StoryOption, string>;
  EVENTS: { preview: string; exported: string; failed: string; sheet: string };
  LIMITS: Record<string, number>;
  clip(text: unknown, max: number): string;
  options(raw: unknown): StoryOptions;
  session(input: SessionStoryInput, options?: Partial<StoryOptions>): StoryCardModel;
  achievement(input: AchievementStoryInput, options?: Partial<StoryOptions>): StoryCardModel;
  availableOptions(input: SessionStoryInput | AchievementStoryInput): StoryOption[];
  fileName(kind: "session" | "achievement"): string;
};

export const buildStory = (req: StoryRequest, options?: Partial<StoryOptions>): StoryCardModel =>
  req.kind === "session" ? ShareStory.session(req.input, options) : ShareStory.achievement(req.input, options);

/** A session as its result screen or its journal sheet shows it. The XP is the server's: a pending, refused or held session has none;
    the level is given only by the receipt of that very session (the profile's current level would be another moment). */
export function sessionStory(
  log: TrainingLog,
  { logs, name, receipt }: { logs: TrainingLog[]; name?: string | null; receipt?: { xp: number; level_after?: number | null; reward_held?: boolean | null } | null },
): SessionStoryInput {
  const historical = Boolean(log.details?.historical);
  const confirmed = log.syncStatus === "confirmed" || (!log.syncStatus && !!receipt);
  const record = confirmed && !log.archived_at ? sessionRecords(logs, log).find((r) => !r.first) : undefined;
  const held = Boolean(receipt?.reward_held);
  const amount = receipt ? Number(receipt.xp) || 0 : Number(log.xp) || 0;
  const level = receipt?.level_after ? Number(receipt.level_after) : null;
  return {
    sport: Sports.label(log.sport),
    sportId: log.sport,
    metrics: sessionMetrics(log),
    record: record ? { label: record.label, value: recordText(record), previous: record.previous ? recordText(record, record.previous.value) : null } : null,
    xp: confirmed && !held && !historical ? { confirmed: true, amount, level, rankName: level ? rankName(level) : null } : null,
    date: log.date,
    name: name ?? null,
    historical,
  };
}

const rankName = (level: number): string | null => {
  try {
    return EffortRules.rank(level).name || null;
  } catch {
    return null;
  }
};

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
