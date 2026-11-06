import { arcOf, layoutPath, worldPathHeight } from "../src/lib/worldPath";

test("nine chapters in three arcs of three; the guardian is the ninth", () => {
  expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(arcOf)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3]);
  const { nodes } = layoutPath(320, 400, 1, new Set());
  expect(nodes).toHaveLength(9);
  expect(nodes.filter((n) => n.boss).map((n) => n.index)).toEqual([9]);
});

test("progress comes from the real state: validated, current, locked; nothing else", () => {
  const { nodes } = layoutPath(320, 400, 4, new Set([1, 2, 3]));
  expect(nodes.map((n) => n.state)).toEqual(["done", "done", "done", "current", "locked", "locked", "locked", "locked", "locked"]);
});

test("not started: no node is current; finished world: all done", () => {
  expect(layoutPath(320, 400, 0, new Set()).nodes.some((n) => n.state === "current")).toBe(false);
  expect(layoutPath(320, 400, 10, new Set()).nodes.every((n) => n.state === "done")).toBe(true);
});

test("a sinuous path inside the box: chapter 1 at the bottom, the guardian at the top, x within the margins, strictly rising", () => {
  const { nodes, d } = layoutPath(320, 400, 5, new Set());
  for (const n of nodes) {
    expect(n.x).toBeGreaterThanOrEqual(28);
    expect(n.x).toBeLessThanOrEqual(320 - 28);
  }
  for (let i = 1; i < nodes.length; i++) expect(nodes[i]!.y).toBeLessThan(nodes[i - 1]!.y);
  expect(nodes[0]!.y).toBeGreaterThan(nodes[8]!.y);
  expect(new Set(nodes.map((n) => Math.round(n.x))).size).toBeGreaterThan(3); // it winds
  expect(d.startsWith("M ")).toBe(true);
});

test.each([0, 1, 2, 3, 4, 8, 9, 10])("colored segments terminate at acquired nodes for chapter %i", chapter => {
 const { nodes, segments, d } = layoutPath(320, 400, chapter, new Set());
 expect(segments).toHaveLength(8);
 expect(d).toBe(`M ${nodes[0]!.x.toFixed(1)} ${nodes[0]!.y.toFixed(1)}` + segments.map(s => s.curve).join(""));
 for (const segment of segments) {
  const from = nodes[segment.from - 1]!, to = nodes[segment.to - 1]!;
  expect(segment.d).toBe(`M ${from.x.toFixed(1)} ${from.y.toFixed(1)}` + segment.curve);
  expect(segment.d.endsWith(`${to.x.toFixed(1)} ${to.y.toFixed(1)}`)).toBe(true);
  expect(segment.earned).toBe(from.state === "done" && to.state === "done");
 }
 expect(segments.filter(s => s.earned)).toHaveLength(Math.max(0, Math.min(9, chapter - 1) - 1));
});
test("sparse rewards never bridge an unacquired node", () => {
 expect(layoutPath(320, 400, 0, new Set([1, 2, 4, 8, 9])).segments.filter(s => s.earned).map(s => [s.from, s.to])).toEqual([[1, 2], [8, 9]]);
});
test("height adapts to landscape and reserves space at 200 percent text", () => {
 expect(worldPathHeight(360, 740, 1)).toBe(400);
 expect(worldPathHeight(740, 360, 1)).toBe(320);
 expect(worldPathHeight(320, 740, 2)).toBeGreaterThanOrEqual(440);
});
