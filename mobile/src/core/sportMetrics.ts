import { Sports } from "./index";

export type MetricField = { id: string; label: string; type: "number" | "select" | "text" | "checkbox"; unit?: string; min?: number; max?: number; step?: number; priority?: number; eliteOnly?: boolean; options?: string[]; visibleWhen?: { field: string; equals?: unknown; in?: unknown[] } };
export type MetricValues = Record<string, unknown>;

/** Metadata comes from the unchanged, hash-checked web catalog; never a second rule catalog. */
export function metricFields(sport: string, plus = false): MetricField[] {
  const conf = Sports.conf(sport) as { extraFields?: MetricField[] } | null;
  return (conf?.extraFields || []).filter((f) => !f.eliteOnly || plus).slice().sort((a, b) => (a.priority || 99) - (b.priority || 99));
}

export function metricVisible(field: MetricField, values: MetricValues): boolean {
  const rule = field.visibleWhen;
  if (!rule?.field) return true;
  if (Object.prototype.hasOwnProperty.call(rule, "equals")) return values[rule.field] === rule.equals;
  return !rule.in || rule.in.includes(values[rule.field]);
}

export function metricValue(field: MetricField, value: unknown): string | number | boolean | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (field.type === "number") {
    if (typeof value !== "string" && typeof value !== "number") return undefined;
    const raw = String(value).trim().replace(",", ".");
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(raw)) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < (field.min ?? 0) || n > (field.max ?? 1e6)) return undefined;
    return n;
  }
  if (field.type === "select") return typeof value === "string" && field.options?.includes(value) ? value : undefined;
  if (field.type === "checkbox") return typeof value === "boolean" ? value : undefined;
  return typeof value === "string" ? value.trim().slice(0, 120) || undefined : undefined;
}

export function sanitizeMetrics(sport: string, raw: MetricValues = {}, plus = false): MetricValues {
  const clean: MetricValues = {};
  for (const f of metricFields(sport, plus)) {
    if (!metricVisible(f, raw)) continue;
    const value = metricValue(f, raw[f.id]);
    if (value !== undefined) clean[f.id] = value;
  }
  return clean;
}

/** Null means clear in the existing server merge RPC. Unknown historical keys stay untouched. */
export function metricPatch(sport: string, previous: MetricValues, next: MetricValues, plus = false): MetricValues {
  const patch: MetricValues = {};
  const clean = sanitizeMetrics(sport, next, plus);
  for (const field of metricFields(sport, plus)) {
    const value = clean[field.id];
    if (JSON.stringify(value) !== JSON.stringify(previous[field.id]) && !(value === undefined && previous[field.id] === null)) patch[field.id] = value ?? null;
  }
  return patch;
}

/** Avoid two controls for the same structured measure. */
export function structuredMetricKeys(sport: string): string[] {
  const form = Sports.formOf(sport);
  return form === "distance" ? ["elevation", "avg_speed", "avg_pace", "distance"] : form === "swim" ? ["pool", "distance"] : form === "climbing" ? ["attempts", "successful_routes", "max_done", "max_tried", "climbing_discipline", "grade_system", "location", "belay"] : form === "strength" ? ["sets", "reps", "top_load", "volume"] : form === "bodyweight" ? ["sets", "best_set", "reps"] : [];
}
