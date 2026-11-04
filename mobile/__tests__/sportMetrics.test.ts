import { Sports } from "../src/core";
import { buildSession, exerciseDraftPayload, exerciseDrafts, freshDraft, sanitizeDetails, toPayload } from "../src/core/session";
import { metricFields, metricPatch, metricValue, metricVisible, structuredMetricKeys, sanitizeMetrics } from "../src/core/sportMetrics";
import matrix from "../../docs/qa/V11_SPORT_METRICS_MATRIX.json";

test.each(matrix.sports.map((s) => [s.id, s.fields] as const))("%s shares the exact web schema and roundtrips supported metrics", (sport, fields) => {
  expect(metricFields(sport, true)).toEqual(fields);
  expect(fields.filter((f) => f.priority < 100).length).toBeGreaterThanOrEqual(3);
  const extras: Record<string, unknown> = {};
  for (const f of fields) if (!('visibleWhen' in f)) extras[f.id] = f.type === "number" ? f.min : f.type === "select" ? f.options?.[0] : f.type === "checkbox" ? false : "repère";
  const d = freshDraft(sport, new Date("2026-10-21T12:00:00Z"));
  Object.assign(d, { distance: "1", meters: "100", durM: "30", extras });
  const b = buildSession(d, new Date("2026-10-21T12:00:00Z"));
  const p = toPayload(b, sport, "id", "UTC", true);
  for (const [id, value] of Object.entries(extras)) if (!structuredMetricKeys(sport).includes(id)) expect(p.details.extras?.[id]).toEqual(value);
  const stored = sanitizeDetails(JSON.parse(JSON.stringify(p)).details, sport, Date.now(), true);
  expect(stored.extras).toEqual(p.details.extras);
  expect(Sports.conf(sport)).toBeTruthy();
  expect(metricFields(sport).filter((f) => !structuredMetricKeys(sport).includes(f.id) && f.type !== "text" && metricVisible(f, {})).slice(0, 3).length).toBeGreaterThanOrEqual(2);
});

test("correction clears optional metrics, keeps zero and leaves historical unknown keys alone", () => {
  expect(metricPatch("football", { position: "Gardien", saves: 3, goals: 1, archived_key: 7 }, { position: "Défenseur", saves: 3, goals: "0" })).toEqual({ position: "Défenseur", saves: null, goals: 0 });
  expect(metricPatch("cycling", { cadence: 80 }, { cadence: "" })).toEqual({ cadence: null });
});

test("boolean false stays false; malformed structures and empty strings stay absent", () => {
  const f = { id: "test", label: "Test", type: "checkbox" as const };
  expect(metricValue(f, false)).toBe(false);
  expect(metricValue(f, "false")).toBeUndefined();
  for (const input of [null, [], {}, "", "garbage"]) expect(sanitizeMetrics("cycling", { cadence: input })).toEqual({});
});

test("hold correction drafts retain seconds and kind through native payload", () => {
  const exercises = [{ name: "Gainage", kind: "hold" as const, variant: "latéral", setRows: [{ weight: 0, seconds: 45, rir: null }] }];
  const drafts = exerciseDrafts(exercises);
  expect(drafts[0].sets[0].seconds).toBe("45");
  drafts[0].sets[0].seconds = "60";
  expect(exerciseDraftPayload(drafts)).toEqual([{ ...exercises[0], setRows: [{ weight: 0, seconds: 60, rir: null }] }]);
});
