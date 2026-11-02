/* Lightweight native SVG charts: readable on a phone, interactive by tap, labelled for screen readers. */
import { useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { haptic } from "../lib/haptics";
import { colors, fonts } from "../theme/tokens";
import { T } from "./Text";

export type BarDatum = { label: string; value: number; detail?: string; highlight?: boolean; display?: string };

const LABEL_SPACE = 40; // px a label needs so neighbours never touch

/** Which bar indexes get an axis label: evenly spaced for the available width, always the last one. */
export function labelIndexes(count: number, width: number): Set<number> {
  if (count <= 0 || width <= 0) return new Set();
  const step = Math.max(1, Math.ceil((count * LABEL_SPACE) / width));
  const out = new Set<number>();
  for (let i = count - 1; i >= 0; i -= step) out.add(i);
  return out;
}

export function BarChart({ data, height = 160, unit = "", color = colors.cy, format, average = false, scale = true, accessibilityLabel }: { data: BarDatum[]; height?: number; unit?: string; color?: string; format?: (v: number) => string; average?: boolean; scale?: boolean; accessibilityLabel: string }) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const fmt = format ?? ((v: number) => `${Math.round(v)} ${unit}`.trim());
  const shown = (d: BarDatum) => d.display ?? fmt(d.value);
  const max = Math.max(1, ...data.map((d) => d.value));
  const gap = data.length > 20 ? 2 : data.length > 12 ? 4 : 6;
  const barW = width > 0 ? Math.max(3, (width - gap * (data.length - 1)) / Math.max(1, data.length)) : 0;
  const chartH = height - 22;
  const top = 14; // room for the maximum label
  const sel = selected !== null ? data[selected] : null;
  const labels = labelIndexes(data.length, width);
  const filled = data.filter((d) => d.value > 0);
  const avg = average && filled.length >= 2 ? data.reduce((n, d) => n + d.value, 0) / data.length : null;
  const yOf = (v: number) => chartH - (v / max) * (chartH - top);
  return (
    <View accessible accessibilityLabel={`${accessibilityLabel}. ${data.map((d) => `${d.detail ?? d.label} : ${shown(d)}`).join(", ")}`}>
      <View style={styles.readout}>
        <T variant="caption" tone={sel ? "default" : "muted"} numberOfLines={1}>
          {sel ? `${sel.detail ?? sel.label} · ${shown(sel)}` : avg !== null ? `Moyenne ${fmt(avg)} · touche une barre pour le détail` : "Touche une barre pour le détail"}
        </T>
      </View>
      <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Line x1={0} x2={width} y1={chartH} y2={chartH} stroke={colors.line2} strokeWidth={1} />
            {scale ? (
              <>
                <SvgText x={0} y={10} fill={colors.tx4} fontSize={10} fontFamily={fonts.textSemi}>
                  {fmt(max)}
                </SvgText>
                <Line x1={0} x2={width} y1={top} y2={top} stroke={colors.line} strokeWidth={1} />
              </>
            ) : null}
            {data.map((d, i) => {
              const h = d.value > 0 ? Math.max(3, chartH - yOf(d.value)) : 0;
              const x = i * (barW + gap);
              const on = selected === i;
              const anchor = i === 0 ? "start" : i === data.length - 1 ? "end" : "middle";
              const lx = anchor === "start" ? x : anchor === "end" ? x + barW : x + barW / 2;
              return (
                <G key={i}>
                  <Rect x={x} y={0} width={barW + gap} height={chartH} fill="transparent" onPress={() => { haptic("selection"); setSelected(on ? null : i); }} />
                  <Rect x={x} y={chartH - h} width={barW} height={h} rx={Math.min(4, barW / 2)} fill={on ? colors.cy2 : d.highlight ? colors.am : color} opacity={selected === null || on ? (d.highlight || on ? 1 : 0.85) : 0.35} onPress={() => { haptic("selection"); setSelected(on ? null : i); }} />
                  {labels.has(i) ? (
                    <SvgText x={lx} y={height - 6} fill={d.highlight ? colors.am : colors.tx3} fontSize={10} fontFamily={fonts.textSemi} textAnchor={anchor}>
                      {d.label}
                    </SvgText>
                  ) : null}
                </G>
              );
            })}
            {avg !== null ? <Line x1={0} x2={width} y1={yOf(avg)} y2={yOf(avg)} stroke={colors.tx2} strokeWidth={1} strokeDasharray="4 4" opacity={0.7} /> : null}
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

export function LineChart({ points, height = 140, color = colors.cy, unit = "", accessibilityLabel, invert = false }: { points: { label: string; value: number }[]; height?: number; color?: string; unit?: string; accessibilityLabel: string; invert?: boolean }) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 10;
  const xy = (i: number, v: number) => {
    const x = pad + (points.length <= 1 ? (width - 2 * pad) / 2 : (i * (width - 2 * pad)) / (points.length - 1));
    const ratio = (v - min) / span;
    const y = pad + (invert ? ratio : 1 - ratio) * (height - 2 * pad);
    return [x, y] as const;
  };
  const d = points.map((p, i) => `${i ? "L" : "M"}${xy(i, p.value).join(" ")}`).join(" ");
  const sel = selected !== null ? points[selected] : null;
  return (
    <View accessible accessibilityLabel={`${accessibilityLabel}. ${points.map((p) => `${p.label} : ${p.value} ${unit}`).join(", ")}`}>
      <T variant="caption" tone="muted" numberOfLines={1} style={{ minHeight: 18 }}>
        {sel ? `${sel.label} · ${sel.value} ${unit}` : "Touche un point pour le détail"}
      </T>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
        {width > 0 && points.length ? (
          <Svg width={width} height={height}>
            <Path d={d} stroke={color} strokeWidth={2.4} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, i) => {
              const [x, y] = xy(i, p.value);
              return <Circle key={i} cx={x} cy={y} r={selected === i ? 7 : 4} fill={selected === i ? colors.cy2 : color} onPress={() => { haptic("selection"); setSelected(selected === i ? null : i); }} />;
            })}
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

/** Horizontal share bar (sport families). */
export function ShareBar({ parts }: { parts: { id: string; label: string; share: number; color: string }[] }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.share} accessible accessibilityLabel={parts.map((p) => `${p.label} ${Math.round(p.share * 100)} %`).join(", ")}>
        {parts.map((p) => (
          <View key={p.id} style={{ flex: Math.max(0.02, p.share), backgroundColor: p.color }} />
        ))}
      </View>
      <View style={styles.legend}>
        {parts.map((p) => (
          <View key={p.id} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: p.color }]} />
            <T variant="caption" tone="muted">
              {p.label} {Math.round(p.share * 100)} %
            </T>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { minHeight: 18, marginBottom: 6 },
  share: { flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", gap: 2 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
