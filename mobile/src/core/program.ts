/* « Le programme »: the shared figure of a person's practice, sports × days or sports × weeks (js/core/program-grid.js on the
   website). This binds it to the catalogue and to the journal's own minutes so both clients read the same lines. */
import { Progress, Sports, type Family } from "./index";
import type { TrainingLog } from "./types";

// eslint-disable-next-line @typescript-eslint/no-require-imports
require("./web/program-grid.js");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

export type ProgramCell = { minutes: number; sessions: number; level: 0 | 1 | 2 | 3 | 4; days?: number } | null;
export type ProgramRow = { sport: string; label: string; family: Family; minutes: number; sessions: number; cells: ProgramCell[] };
export type ProgramMore = { sports: number; minutes: number; sessions: number; cells: ProgramCell[] } | null;
export type ProgramWeek = {
  kind: "week"; from: string; to: string;
  days: { key: string; index: number; letter: string; name: string; date: number; today: boolean; future: boolean }[];
  rows: ProgramRow[]; more: ProgramMore;
  totals: { minutes: number; sessions: number; activeDays: number; cells: number[] };
  planned: { day: number; sport: string; label: string; family: Family; row: number }[];
};
export type ProgramSpan = {
  kind: "span"; from: string; to: string;
  columns: { key: string; index: number; date: number; month: number; current: boolean }[];
  rows: ProgramRow[]; more: ProgramMore; totals: { minutes: number; sessions: number; cells: number[] };
};

const raw = g.TitanProgram as {
  week(logs: unknown[], options: Record<string, unknown>): ProgramWeek;
  span(logs: unknown[], options: Record<string, unknown>): ProgramSpan;
  describe(grid: ProgramWeek | ProgramSpan): string;
};
const bound = {
  minutesOf: (l: TrainingLog) => Progress.minutesOf(l).minutes || 0,
  familyOf: (s: string) => Sports.familyOf(s),
  labelOf: (s: string) => Sports.label(s),
};

export const Program = {
  week: (logs: TrainingLog[], options: { start?: Date; now?: Date; maxRows?: number; plan?: (string | null)[] | null } = {}) => raw.week(logs, { ...bound, ...options }),
  span: (logs: TrainingLog[], options: { weeks?: number; now?: Date; maxRows?: number } = {}) => raw.span(logs, { ...bound, ...options }),
  describe: raw.describe,
};
