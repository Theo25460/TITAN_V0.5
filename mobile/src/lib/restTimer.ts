/** Rest timer between sets: pure arithmetic so it is testable and independent of the clock source. */
export const REST_PRESETS = [60, 90, 120, 180] as const;
export const DEFAULT_REST = 90;

export type RestState = { endsAt: number; total: number } | null;

export const startRest = (now: number, seconds: number): RestState => {
  const total = Math.min(600, Math.max(10, Math.round(seconds) || DEFAULT_REST));
  return { endsAt: now + total * 1000, total };
};
/** Whole seconds left (never negative). */
export const restLeft = (rest: RestState, now: number) => (rest ? Math.max(0, Math.ceil((rest.endsAt - now) / 1000)) : 0);
export const restDone = (rest: RestState, now: number) => !!rest && now >= rest.endsAt;
export const restLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
/** Adds (or removes) seconds to a running rest, keeping it between 0 and 10 minutes from now. */
export const adjustRest = (rest: RestState, now: number, delta: number): RestState => {
  if (!rest) return rest;
  const left = restLeft(rest, now) + delta;
  return left <= 0 ? null : { endsAt: now + Math.min(600, left) * 1000, total: Math.max(rest.total, left) };
};
