import { fitView, fromWorldPx, MAX_ZOOM, MIN_ZOOM, panBy, tilesConfigured, tilesFor, tileUrl, toScreen, worldPx, zoomBy } from "../src/lib/tiles";

test("world pixel round-trips and Paris lands on the known tile at zoom 10", () => {
  const p = worldPx(48.8566, 2.3522, 10);
  expect(Math.floor(p.x / 256)).toBe(518);
  expect(Math.floor(p.y / 256)).toBe(352);
  const back = fromWorldPx(p.x, p.y, 10);
  expect(back.lat).toBeCloseTo(48.8566, 5);
  expect(back.lon).toBeCloseTo(2.3522, 5);
});

test("the fitted view contains the whole trace with a margin, tight traces zoom in, wide ones zoom out", () => {
  const small = [{ lat: 48.85, lon: 2.35 }, { lat: 48.853, lon: 2.355 }];
  const big = [{ lat: 43.0, lon: -1.0 }, { lat: 49.0, lon: 7.0 }];
  const a = fitView(small, 360, 240);
  const b = fitView(big, 360, 240);
  expect(a.z).toBeGreaterThan(b.z);
  expect(a.z).toBeLessThanOrEqual(MAX_ZOOM);
  expect(b.z).toBeGreaterThanOrEqual(MIN_ZOOM);
  for (const [pts, v] of [[small, a], [big, b]] as const)
    for (const p of pts) {
      const s = toScreen(p, v, 360, 240);
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(360);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(240);
    }
  expect(fitView([], 100, 100).z).toBe(MIN_ZOOM);
});

test("tiles cover the viewport exactly, with sane positions and a bounded count", () => {
  const v = fitView([{ lat: 48.85, lon: 2.35 }, { lat: 48.86, lon: 2.37 }], 360, 240);
  const t = tilesFor(v, 360, 240);
  expect(t.length).toBeGreaterThan(0);
  expect(t.length).toBeLessThanOrEqual(40);
  expect(Math.min(...t.map((x) => x.left))).toBeLessThanOrEqual(0);
  expect(Math.max(...t.map((x) => x.left + 256))).toBeGreaterThanOrEqual(360);
  expect(Math.min(...t.map((x) => x.top))).toBeLessThanOrEqual(0);
  expect(Math.max(...t.map((x) => x.top + 256))).toBeGreaterThanOrEqual(240);
  expect(new Set(t.map((x) => x.key)).size).toBe(t.length);
  expect(t.every((x) => x.x >= 0 && x.x < 2 ** x.z && x.y >= 0 && x.y < 2 ** x.z)).toBe(true);
});

test("zoom is bounded, pan moves the centre the way the finger moves the map", () => {
  const v = { lat: 48.85, lon: 2.35, z: 12 };
  expect(zoomBy(v, 99).z).toBe(MAX_ZOOM);
  expect(zoomBy(v, -99).z).toBe(MIN_ZOOM);
  const dragRight = panBy(v, 100, 0); // finger drags right: the map moves right, the centre goes west
  expect(dragRight.lon).toBeLessThan(v.lon);
  const dragDown = panBy(v, 0, 100);
  expect(dragDown.lat).toBeGreaterThan(v.lat);
});

test("a provider is configured only with https, the three placeholders and an attribution; the URL is filled from the tile", () => {
  expect(tilesConfigured("https://tiles.example/{z}/{x}/{y}.png?key=k", "© Example")).toBe(true);
  expect(tilesConfigured("https://tiles.example/{z}/{x}/{y}.png", "")).toBe(false);
  expect(tilesConfigured("http://tiles.example/{z}/{x}/{y}.png", "© Example")).toBe(false);
  expect(tilesConfigured("https://tiles.example/{z}/{x}.png", "© Example")).toBe(false);
  expect(tilesConfigured("", "")).toBe(false);
  expect(tileUrl({ z: 5, x: 3, y: 9 }, "https://t.example/{z}/{x}/{y}.png")).toBe("https://t.example/5/3/9.png");
});
