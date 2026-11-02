import { Gpx } from "../src/core";
import { buildSession, freshDraft, toPayload } from "../src/core/session";

const pt = (lat: number, lon: number, ele: number, t: string) => `<trkpt lat="${lat}" lon="${lon}"><ele>${ele}</ele><time>${t}</time></trkpt>`;
const GPX = `<?xml version="1.0"?><gpx><trk><trkseg>${[0, 1, 2, 3, 4, 5]
  .map((i) => pt(45 + i * 0.001, 6, 1000 + i * 5, new Date(Date.UTC(2026, 9, 20, 8, i)).toISOString()))
  .join("")}</trkseg></trk></gpx>`;

test("GPX analysis (website parser) feeds the session like on titan-app.fr", () => {
  const r = Gpx.analyse(GPX);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.points).toBe(6);
  expect(r.distanceKm).toBeCloseTo(0.56, 1);
  expect(r.ascent).toBe(25);
  const now = new Date("2026-10-21T10:00:00");
  const d = { ...freshDraft("trail", now), distance: String(r.distanceKm), durM: "5", gpx: { movingMinutes: r.movingMinutes, elapsedMinutes: r.elapsedMinutes, ascent: r.ascent, descent: r.descent, points: r.points } };
  const p = toPayload(buildSession(d, now), "trail", "11111111-2222-4333-8444-555555555555", "UTC", false, now.getTime());
  expect(p.details).toMatchObject({ hasGpx: true, gpxStats: { ascent: 25, points: 6 } });
});

test("a file without track points is refused with an explanation", () => {
  const r = Gpx.analyse("<gpx></gpx>");
  expect(r.ok).toBe(false);
});
