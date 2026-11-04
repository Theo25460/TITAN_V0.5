import { arcOf, layoutPath } from "../src/lib/worldPath";

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
