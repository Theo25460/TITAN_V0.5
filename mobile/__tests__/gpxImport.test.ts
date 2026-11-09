import { Gpx } from "../src/core";
import { applyGpxImport, buildSession, freshDraft, removeGpxImport, sanitizeDetails } from "../src/core/session";

const now = new Date("2026-11-09T12:00:00Z");
function analyse(timed: boolean) {
  const points = Array.from({ length: 11 }, (_, index) => {
    const stamp = timed ? `<time>${new Date(now.getTime() - (20 - index) * 30000).toISOString()}</time>` : "";
    return `<trkpt lat="${45 + index * .001}" lon="6">${stamp}</trkpt>`;
  });
  const result = Gpx.analyse(`<gpx><trk><trkseg>${points.join("")}</trkseg></trk></gpx>`);
  if (!result.ok) throw Error(result.error);
  return result;
}

test("replacing a timed GPX with an untimed route clears its derived time", () => {
  const timed = applyGpxImport(freshDraft("running", now), analyse(true), now);
  expect(timed.durM).toBe("5");
  expect(buildSession(timed, now).errors).toEqual([]);
  const route = applyGpxImport(timed, analyse(false), now);
  expect(route.durM).toBe("");
  expect(route.when).toBe("now");
  expect(route.gpx).toMatchObject({ movingMinutes: null, elapsedMinutes: null, ascent: null, timing: "missing" });
  expect(buildSession(route, now).errors).toContainEqual(expect.objectContaining({ field: "duration" }));
});

test("an untimed GPX preserves manually entered duration and needs explicit manual entry to save", () => {
  const manual = { ...freshDraft("running", now), durM: "45", gpxDurationEdited: true };
  const route = applyGpxImport(manual, analyse(false), now);
  expect(route.durM).toBe("45");
  expect(buildSession(route, now).errors).toContainEqual(expect.objectContaining({ field: "duration" }));
  const session = buildSession(removeGpxImport(route), now);
  expect(session.errors).toEqual([]);
  expect(session.details.duration).toBe(45);
  expect(session.details.gpxStats).toBeUndefined();
});

test("GPX sanitization distinguishes unavailable measures from a measured zero", () => {
  const result = sanitizeDetails({ duration: 45, gpxStats: { movingMinutes: null, elapsedMinutes: null, ascent: null, descent: 0, points: 11 } }, "running");
  expect(result.gpxStats).toEqual({ movingMinutes: null, elapsedMinutes: null, ascent: null, descent: 0, points: 11 });
  expect(result.duration).toBe(45);
});
