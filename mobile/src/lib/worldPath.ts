/* The winding path of a world: nine chapters laid out as three arcs of three, on a vertical sinuous track. Pure layout from the REAL
   progress (which chapters are validated, which one is current): nothing is invented, no fight or monster is drawn that the server did not grant. */
export type PathNode = { index: number; x: number; y: number; arc: 1 | 2 | 3; boss: boolean; state: "done" | "current" | "locked" };
export const ARC_SIZE = 3;
export const arcOf = (chapter: number): 1 | 2 | 3 => (Math.min(3, Math.ceil(chapter / ARC_SIZE)) as 1 | 2 | 3);

export function layoutPath(width: number, height: number, chapter: number, done: Set<number>, total = 9, pad = 28): { nodes: PathNode[]; d: string } {
  const step = (height - 2 * pad) / (total - 1);
  const left = pad + 8, right = width - pad - 8;
  const nodes: PathNode[] = Array.from({ length: total }, (_, i) => {
    const index = i + 1;
    const wave = Math.sin((i / (total - 1)) * Math.PI * 2.2); // a gentle S, never a zigzag
    return {
      index,
      x: left + ((wave + 1) / 2) * (right - left),
      y: height - pad - i * step, // chapter 1 at the bottom, the guardian at the top
      arc: arcOf(index),
      boss: index === total,
      state: done.has(index) || index < chapter ? "done" : index === chapter ? "current" : "locked",
    };
  });
  // smooth curve through the nodes (quadratic midpoints)
  let d = `M ${nodes[0]!.x.toFixed(1)} ${nodes[0]!.y.toFixed(1)}`;
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1]!, b = nodes[i]!;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    d += ` Q ${a.x.toFixed(1)} ${my.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)} T ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }
  return { nodes, d };
}
export const ARC_LABEL = ["Arc I", "Arc II", "Arc III"] as const;
