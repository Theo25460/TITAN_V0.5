/* « L'Expédition », the adventure view of a live session: an ascent from the base camp to a summit, across three ridgelines
   whose relief belongs to the sport. Each beat of the Voie lights a waypoint, the traveller stands on the last one, the disc in
   the sky rises with the day's élan. The geometry is the website's (src/core/web/live-scene.js): the same session draws the same
   scene on both platforms. It only shows what the engine decided; nothing here grants anything. */
import { memo, useMemo } from "react";
import { View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { LiveScene } from "../core/live";
import { colors, familyColors, radius, space } from "../theme/tokens";
import { T } from "./Text";

/** Linear mix of two #RRGGBB colours (react-native-svg has no color-mix). */
export function mix(a: string, b: string, ratio: number) {
  const n = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const c = [0, 1, 2].map((i) => Math.round(n(a, i) * ratio + n(b, i) * (1 - ratio)).toString(16).padStart(2, "0"));
  return `#${c.join("")}`;
}

type Props = {
  lit: number; planned: number | null; echo: number | null; beatOne: string; beatMany: string; label: string;
  seed: string; family?: string; goalRatio?: number | null; elan?: { value: number; max: number }; ended?: boolean;
};

export const LiveTrail = memo(function LiveTrail({ lit, planned, echo, beatOne, beatMany, label, seed, family, goalRatio = null, elan, ended = false }: Props) {
  const s = useMemo(
    () => LiveScene.scene({ beats: lit, planCount: planned, echoBeats: echo, goalRatio, elan, seed, ended }),
    [lit, planned, echo, goalRatio, elan?.value, elan?.max, seed, ended], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const fam = familyColors[family ?? "endurance"] ?? colors.cy;
  const t = s.traveller;
  const onSummit = t.x === s.summit.x && t.y === s.summit.y;
  const flag = s.summit.reached ? colors.am : colors.tx3;
  const words = `${lit} ${lit > 1 ? beatMany : beatOne}${planned ? ` sur ${planned}` : ""}`;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${label} : ${words}${elan ? `, élan du jour ${Math.round(elan.value)} sur ${elan.max}` : ""}${echo != null ? `, Écho à ${echo}` : ""}${s.summit.reached ? ", sommet atteint" : ""}`}
      style={{ gap: space.s2 }}
      testID="live-expedition"
    >
      <View style={{ borderRadius: radius.r3, overflow: "hidden" }}>
        <Svg width="100%" height={undefined} style={{ aspectRatio: s.width / s.height }} viewBox={`0 0 ${s.width} ${s.height}`}>
          <Defs>
            <LinearGradient id="live-sky" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.bg} />
              <Stop offset="1" stopColor={mix(fam, colors.bg2, 0.16)} />
            </LinearGradient>
          </Defs>
          <Rect width={s.width} height={s.height} fill="url(#live-sky)" />
          {s.stars.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={p.r} fill={colors.tx3} opacity={0.55} />)}
          <Circle cx={s.sky.x} cy={s.sky.y} r={s.sky.r + 7} fill={fam} opacity={0.12} />
          <Circle cx={s.sky.x} cy={s.sky.y} r={s.sky.r} fill={mix(fam, colors.tx, 0.7)} />
          <Path d={s.ridges[0]} fill={mix(fam, colors.bg3, 0.09)} />
          <Path d={s.ridges[1]} fill={mix(fam, colors.bg2, 0.05)} />
          <Path d={s.ridges[2]} fill={colors.bg1} stroke={colors.line} strokeWidth={1} />
          <Path d={s.trail} stroke={colors.line3} strokeWidth={2} strokeDasharray="3 7" strokeLinecap="round" fill="none" />
          {s.done ? <Path d={s.done} stroke={colors.cy} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" fill="none" testID="live-expedition-done" /> : null}
          <Path d={`M${s.summit.x} ${s.summit.y} v-22`} stroke={flag} strokeWidth={1.5} strokeLinecap="round" fill="none" />
          <Path d={`M${s.summit.x} ${s.summit.y - 22} l13 5 l-13 5 z`} fill={flag} testID={s.summit.reached ? "live-expedition-summit" : undefined} />
          {s.nodes.map((n) => (
            <Circle key={n.index} cx={n.x} cy={n.y} r={n.lit ? 5 : n.next ? 4.5 : 3.2} fill={n.lit ? colors.cy : n.next ? colors.bg : colors.bg3}
              stroke={n.lit ? colors.cy2 : n.next ? colors.cy : colors.line3} strokeWidth={n.next ? 2 : 1.5} testID={n.lit ? "live-expedition-lit" : undefined} />
          ))}
          {s.echo ? <Circle cx={s.echo.x} cy={s.echo.y} r={10} fill="none" stroke={colors.cy2} strokeWidth={1.5} strokeDasharray="2 3" /> : null}
          <Path d={`M${s.camp.x - 7} ${s.camp.y + 4} l7 -11 l7 11 z`} fill={colors.bg3} stroke={colors.tx3} strokeWidth={1.5} strokeLinejoin="round" />
          <Circle cx={t.x} cy={t.y} r={9} fill="none" stroke={colors.tx} strokeWidth={1.5} opacity={0.9} />
          {onSummit ? null : (
            <>
              <Path d={`M${t.x - 6} ${t.y - 13} l6 -6 l6 6`} stroke={colors.tx} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <Path d={`M${t.x - 6} ${t.y - 20} l6 -6 l6 6`} stroke={colors.tx} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.5} />
            </>
          )}
        </Svg>
      </View>
      <T variant="caption" tone="muted" center>
        {words}{echo != null ? ` · Écho : ${echo}` : ""}
      </T>
    </View>
  );
});
