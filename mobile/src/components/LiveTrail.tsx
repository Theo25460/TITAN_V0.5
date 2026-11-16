/* The adventure view of a live session: a contour-line trail (TITAN's ascension motif) where each beat of the Voie
   lights a node. The progression follows normalised effort, never raw distance, so every sport advances at a fair pace.
   Future illustrations (one per Voie) will sit behind the trail: see docs/live/ASSETS.md for the reserved slots. */
import { memo } from "react";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { colors, space } from "../theme/tokens";
import { T } from "./Text";

const W = 320;
const H = 150;

function pointAt(i: number, n: number) {
  const t = n <= 1 ? 0.5 : i / (n - 1);
  const x = 18 + t * (W - 36);
  const y = H / 2 + Math.sin(t * Math.PI * 2.2) * (H * 0.28) - t * 18;
  return { x, y };
}

export const LiveTrail = memo(function LiveTrail({ lit, planned, echo, beatOne, beatMany, label }: { lit: number; planned: number | null; echo: number | null; beatOne: string; beatMany: string; label: string }) {
  // The trail shows a window of nodes: the plan when there is one, otherwise the next round number above what is lit.
  const total = Math.max(6, Math.min(24, planned || Math.ceil((lit + 1) / 6) * 6));
  const offset = planned ? 0 : Math.max(0, lit - total + 3);
  const nodes = Array.from({ length: total }, (_, i) => ({ i: i + offset, ...pointAt(i, total) }));
  const d = nodes.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const done = nodes.filter((p) => p.i < lit);
  const dDone = done.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const echoNode = echo != null ? nodes.find((p) => p.i === Math.max(0, echo - 1)) : null;
  return (
    <View accessible accessibilityLabel={`${label} : ${lit} ${lit > 1 ? beatMany : beatOne}${planned ? ` sur ${planned}` : ""}${echo != null ? `, Écho à ${echo}` : ""}`} style={{ gap: space.s2 }}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* Contour lines behind the trail. */}
        {[0.25, 0.5, 0.75].map((k) => (
          <Path key={k} d={`M0 ${H * k} C ${W * 0.3} ${H * k - 22}, ${W * 0.6} ${H * k + 22}, ${W} ${H * k - 8}`} stroke={colors.line} strokeWidth={1} fill="none" />
        ))}
        <Path d={d} stroke={colors.line3} strokeWidth={2} strokeDasharray="4 6" fill="none" />
        {done.length > 1 ? <Path d={dDone} stroke={colors.cy} strokeWidth={3} fill="none" strokeLinecap="round" /> : null}
        {nodes.map((p) => (
          <Circle key={p.i} cx={p.x} cy={p.y} r={p.i < lit ? 6 : 4} fill={p.i < lit ? colors.cy : colors.bg3} stroke={p.i < lit ? colors.cy2 : colors.line3} strokeWidth={1.5} />
        ))}
        {echoNode ? <Circle cx={echoNode.x} cy={echoNode.y} r={10} fill="none" stroke={colors.cy2} strokeWidth={1.5} strokeDasharray="2 3" /> : null}
      </Svg>
      <T variant="caption" tone="muted" center>
        {lit} {lit > 1 ? beatMany : beatOne}{planned ? ` sur ${planned}` : ""}{echo != null ? ` · Écho : ${echo}` : ""}
      </T>
    </View>
  );
});
