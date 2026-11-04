/* Pure calendar helpers for TITAN's own date picker (no system dialog). Weeks start on Monday, the way the app (and French calendars) do. */
export const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"] as const;
export const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"] as const;

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** The weeks of a month as rows of seven cells: a Date for each day of the month, null for the padding around it. */
export function monthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => new Date(year, month, i + 1))];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** A day is selectable when it sits inside the optional bounds (whole days, so "today" is allowed by a maximum of now). */
export function allowed(day: Date, min?: Date | null, max?: Date | null) {
  const t = startOfDay(day).getTime();
  return (!min || t >= startOfDay(min).getTime()) && (!max || t <= startOfDay(max).getTime());
}

export const addMonths = (year: number, month: number, delta: number) => {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
};

/** Whether the previous / next month still holds a selectable day (the arrows go grey instead of leading to an empty month). */
export function monthReachable(year: number, month: number, min?: Date | null, max?: Date | null) {
  const last = new Date(year, month + 1, 0);
  const first = new Date(year, month, 1);
  return (!min || last.getTime() >= startOfDay(min).getTime()) && (!max || first.getTime() <= startOfDay(max).getTime());
}

/** The date picked on a given day, keeping the time of day of the value being edited. */
export function withDay(value: Date, day: Date) {
  const out = new Date(value);
  out.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
  return out;
}
export function withTime(value: Date, hour: number, minute: number) {
  const out = new Date(value);
  out.setHours(hour, minute, 0, 0);
  return out;
}
