/* V1.7.7 — the figures of a live GPS outing: the signal chip, the two main figures and the secondary cells of the sport, the line
   that says what the engine sees right now, and the banners (route followed, way back, goal, structured step). Everything shown
   here is read from the shared engine (core/web/gps-*.js); nothing is computed on the side, nothing is spoken.
   Big figures shrink to fit instead of being cut, so a large system text size never hides a digit. */
import { StyleSheet, View } from "react-native";
import { GpsNav, GpsSession, type GpsAnalysis, type GpsCell, type GpsGoalView, type GpsPlanView, type GpsSignal, type NavEta, type NavFollow } from "../core";
import { colors, fonts, radius, space, TOUCH } from "../theme/tokens";
import { Button } from "./Button";
import { ProgressBar } from "./Progress";
import { T } from "./Text";

const SIGNAL_COLOR: Record<GpsSignal["state"], string> = { searching: colors.tx3, good: colors.ok, fair: colors.am, weak: colors.warn, lost: colors.err };
const signalShort = (s: GpsSignal) =>
  s.state === "searching" ? "Recherche GPS" : s.state === "lost" ? "Signal perdu" : s.state === "weak" ? `GPS faible ± ${s.accuracyM} m` : s.state === "fair" ? `GPS moyen ± ${s.accuracyM} m` : s.accuracyM === null ? "GPS" : `GPS ± ${s.accuracyM} m`;

/** The state of the signal in a few words; a screen reader gets the engine's full sentence. */
export function GpsSignalChip({ signal, solid = false }: { signal: GpsSignal; solid?: boolean }) {
  return (
    <View style={[styles.chip, solid && styles.chipSolid]} accessible accessibilityRole="text" accessibilityLabel={signal.label} testID="gps-signal">
      <View style={[styles.dot, { backgroundColor: SIGNAL_COLOR[signal.state] }]} />
      <T variant="caption" color={colors.tx} numberOfLines={1}>{signalShort(signal)}</T>
    </View>
  );
}

export type GpsStateLine = { kind: "moving" | "stopped" | "paused" | "nosignal"; text: string };
/** What the engine sees right now. A stop is announced once it is a stop for the engine (the sport's own delay), never sooner:
    the same rule as the figures, so the line and the « à l’arrêt » time cannot disagree. */
export function gpsStateLine(status: "recording" | "paused" | "ended", a: GpsAnalysis, signal: GpsSignal): GpsStateLine {
  if (status !== "recording") return { kind: "paused", text: "En pause" };
  const last = a.timeline[a.timeline.length - 1];
  if (signal.state === "searching" || signal.state === "lost" || last?.kind === "missing") return { kind: "nosignal", text: "Sans signal" };
  const held = last && last.kind === "stopped" ? (last.to - last.from) / 1000 : 0;
  if (held >= a.params.stopDelayS) return { kind: "stopped", text: `À l’arrêt depuis ${GpsSession.chrono(held)}` };
  return { kind: "moving", text: "En mouvement" };
}

export function GpsStateText({ line }: { line: GpsStateLine }) {
  const color = line.kind === "moving" ? colors.cy : line.kind === "nosignal" ? colors.warn : colors.tx2;
  return (
    <View style={styles.state} accessible accessibilityRole="text" accessibilityLabel={line.text} accessibilityLiveRegion="polite" testID="gps-state">
      <View style={[styles.dot, { backgroundColor: color }]} />
      <T variant="bodyStrong" color={color}>{line.text}</T>
    </View>
  );
}

const cellLabel = (c: GpsCell) => `${c.label} : ${c.value === "–" ? "non disponible" : `${c.value}${c.unit ? ` ${c.unit}` : ""}`}${c.note ? `. ${c.note}` : ""}`;

/** One of the two main figures: as large as the width allows, never cut. */
export function GpsFigure({ cell, size = 84, align = "left" }: { cell: GpsCell; size?: number; align?: "left" | "center" }) {
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: align === "center" ? "center" : "flex-start" }} accessible accessibilityRole="text" accessibilityLabel={cellLabel(cell)} testID={`gps-main-${cell.key}`}>
      <T variant="caption" tone="muted" numberOfLines={1}>{cell.label}</T>
      <View style={styles.figureRow}>
        <T color={colors.tx} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4} maxFontSizeMultiplier={1.3} style={[styles.figure, { fontSize: size, lineHeight: Math.round(size * 1.02), flexShrink: 1 }]}>{cell.value}</T>
        {cell.unit ? <T variant="title" tone="muted" style={{ marginBottom: Math.round(size * 0.14) }}>{cell.unit}</T> : null}
      </View>
    </View>
  );
}

/** A secondary cell: a medium figure, its unit, its label, and the reason when the value does not exist. */
export function GpsCellBox({ cell }: { cell: GpsCell }) {
  return (
    <View style={styles.cell} accessible accessibilityRole="text" accessibilityLabel={cellLabel(cell)} testID={`gps-cell-${cell.key}`}>
      <T variant="caption" tone="muted" numberOfLines={1}>{cell.label}</T>
      <View style={styles.figureRow}>
        <T variant="num" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontSize: 30, lineHeight: 32, flexShrink: 1 }}>{cell.value}</T>
        {cell.unit ? <T variant="caption" tone="faint" style={{ marginBottom: 4 }}>{cell.unit}</T> : null}
      </View>
      {cell.note && cell.value === "–" ? <T variant="caption" tone="faint" numberOfLines={2}>{cell.note}</T> : null}
    </View>
  );
}

/** The grid of secondary cells, two per row. */
export function GpsCells({ cells }: { cells: GpsCell[] }) {
  const rows: GpsCell[][] = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(cells.slice(i, i + 2));
  return (
    <View style={{ gap: space.s2 }}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: "row", gap: space.s2 }}>
          {row.map((c) => <GpsCellBox key={c.key} cell={c} />)}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

const range = (e: NavEta) => {
  const lo = Math.max(1, Math.round(e.lowS / 60)), hi = Math.max(lo, Math.round(e.highS / 60));
  return hi >= 100 ? `${GpsSession.span(e.lowS)} à ${GpsSession.span(e.highS)}` : lo === hi ? `${lo} min` : `${lo}–${hi} min`;
};

function Banner({ tone = "plain", title, line, note, children, testID, label }: { tone?: "plain" | "amber"; title: string; line?: string | null; note?: string | null; children?: React.ReactNode; testID: string; label?: string }) {
  return (
    <View style={[styles.banner, tone === "amber" && styles.bannerAmber]} testID={testID}>
      <View style={{ flex: 1, minWidth: 0 }} accessible accessibilityRole="text" accessibilityLabel={label ?? [title, line, note].filter(Boolean).join(". ")} accessibilityLiveRegion={tone === "amber" ? "polite" : "none"}>
        <T variant="bodyStrong" color={tone === "amber" ? colors.am : colors.tx}>{title}</T>
        {line ? <T variant="small" tone="muted">{line}</T> : null}
        {note ? <T variant="caption" tone="faint">{note}</T> : null}
      </View>
      {children}
    </View>
  );
}

/** Where the athlete stands on the line being followed: a route kept on the phone, or the way back by the same path.
    « Hors parcours » is the engine's verdict (beyond the sport's margin and twice the announced accuracy, for 10 s): GPS noise alone
    never shows it. The estimate is a range at the pace of this outing; it says what it ignores. */
export function GpsFollowBanner({ mode, name, state, analysis, missing = false }: { mode: "route" | "back"; name: string; state: NavFollow; analysis: GpsAnalysis; missing?: boolean }) {
  const head = mode === "back" ? "Retour au départ" : name || "Parcours";
  if (missing) return <Banner testID="gps-follow" title={head} line="Ce parcours n’est pas enregistré sur ce téléphone : il ne peut pas être suivi ici." />;
  if (state.offM === null || state.offM === undefined) return <Banner testID="gps-follow" title={head} line="En attente d’une position fiable pour te situer." />;
  if (state.off)
    return <Banner testID="gps-follow" tone="amber" title={`Hors parcours · ${state.offM} m`} line={mode === "back" ? "Tu t’éloignes du chemin enregistré à l’aller." : `Tu t’éloignes de « ${head} ».`} note={`Écart au-delà de la marge de ${state.marginM ?? "–"} m, précision du GPS comprise.`} />;
  if (!state.joined) return <Banner testID="gps-follow" title={head} line={state.offM < 1000 ? `À ${state.offM} m du parcours` : `À ${GpsSession.km(state.offM)} km du parcours`} note="Le suivi commence quand tu rejoins la trace." />;
  if (state.done) return <Banner testID="gps-follow" title={head} line={mode === "back" ? "Tu es revenu au point de départ de cette sortie." : "Tu es au bout du parcours."} />;
  const left = state.remainingM ?? 0, eta = GpsNav.eta(left, analysis);
  return (
    <Banner
      testID="gps-follow"
      title={head}
      line={`Reste ${GpsSession.km(left)} km${eta ? ` · ${mode === "back" ? "retour estimé" : "arrivée estimée"} dans ${range(eta)}` : ""}`}
      note={eta ? eta.note : "Estimation du temps restant après 5 min de mouvement."}
    />
  );
}

export function GpsGoalBanner({ view }: { view: GpsGoalView }) {
  const late = view.status === "late" || view.status === "tight";
  return (
    <Banner testID="gps-goal" tone={late ? "amber" : "plain"} title={view.title} line={view.line} note={view.estimate}>
      {view.ratio !== null ? <View style={{ width: 64 }}><ProgressBar value={view.ratio} height={6} accessibilityLabel={`Objectif à ${Math.round(view.ratio * 100)} %`} /></View> : null}
    </Banner>
  );
}

/** The current step of the structured session: what it is, what is left of it, what comes next. One tap ends it by hand. */
export function GpsStepBanner({ view, onSkip, busy = false }: { view: GpsPlanView; onSkip?: () => void; busy?: boolean }) {
  if (view.finished || !view.step) return <Banner testID="gps-step" title="Séance structurée terminée" line="Toutes les étapes sont faites. L’enregistrement continue." />;
  const left = view.remaining ? `${view.remaining.manual ? "depuis " : "reste "}${view.remaining.value}${view.remaining.unit ? ` ${view.remaining.unit}` : ""}` : "";
  return (
    <Banner testID="gps-step" title={`${view.step.label} · ${left}`} line={view.next ? `Ensuite : ${GpsSession.describeStep(view.next)}` : "Dernière étape"} note={`Étape ${view.position}${view.remaining?.manual ? " · au signal : passe à la suite quand tu veux" : ""}`}>
      {onSkip ? <Button small kind="secondary" label="Étape suivante" onPress={onSkip} disabled={busy} testID="gps-step-skip" style={{ minHeight: TOUCH }} /> : null}
    </Banner>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, minHeight: 28, borderRadius: radius.pill, backgroundColor: colors.bg3 },
  chipSolid: { backgroundColor: "rgba(9,12,16,0.86)", borderWidth: 1, borderColor: colors.line2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  state: { flexDirection: "row", alignItems: "center", gap: space.s2, minHeight: 28 },
  figureRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, maxWidth: "100%" },
  figure: { fontFamily: fonts.figureBold, letterSpacing: -0.5, fontVariant: ["tabular-nums"] },
  cell: { flex: 1, minWidth: 0, backgroundColor: colors.bg2, borderRadius: radius.r2, paddingHorizontal: space.s3, paddingVertical: space.s2 },
  banner: { flexDirection: "row", alignItems: "center", gap: space.s3, backgroundColor: colors.bg2, borderRadius: radius.r2, paddingHorizontal: space.s3, paddingVertical: space.s2, borderLeftWidth: 3, borderLeftColor: colors.cy },
  bannerAmber: { backgroundColor: "#1B160B", borderLeftColor: colors.am },
});
