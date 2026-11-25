/* V1.7.7 — the bilan of a GPS outing, before it becomes a session: where the time went (moving, stopped, paused, without a
   position), the two averages, the climb with where it comes from, the kilometre splits, the stops, what was refused and why,
   the structured session and the goal when there were any, and how every figure is computed. All of it is the shared engine's
   reading (core/web/gps-engine.js): the same sentences and thresholds as the website. */
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { GpsEngine, GpsNav, GpsSession, type GpsAnalysis, type GpsGoal, type GpsTimeKind } from "../core";
import type { Recording } from "../lib/gpsRecorder";
import { colors, radius, space, TOUCH } from "../theme/tokens";
import { Card } from "./Card";
import { GpsFigure } from "./GpsDashboard";
import { GpsLiveMap, type MapPlace } from "./GpsLiveMap";
import { Icon } from "./Icon";
import { Tap } from "./Pressable";
import { T } from "./Text";

const KIND: Record<GpsTimeKind, { label: string; color: string }> = {
  moving: { label: "En mouvement", color: colors.cy },
  stopped: { label: "À l’arrêt", color: colors.tx3 },
  paused: { label: "En pause", color: colors.bg4 },
  interrupted: { label: "Interrompu", color: colors.tx4 },
  missing: { label: "Sans position", color: colors.am },
};
const ORDER: GpsTimeKind[] = ["moving", "stopped", "paused", "interrupted", "missing"];
const WHY: Record<string, string> = { accuracy: "précision insuffisante (plus de 30 m)", speed: "vitesse impossible pour ce sport", order: "horodatage incohérent", invalid: "position invalide", full: "trace pleine" };
const comma = (x: number, d = 1) => x.toFixed(d).replace(".", ",");

/** The timeline as at most `max` slices of equal duration (the kind that fills most of each), so an outing with hundreds of stops
    still draws as one bar. Shorter timelines are drawn as they are, each period with its real share. */
export function timeSlices(a: GpsAnalysis, max = 96): { kind: GpsTimeKind; share: number }[] {
  const total = a.ms.elapsed;
  if (!(total > 0) || a.start === null) return [];
  if (a.timeline.length <= max) return a.timeline.map((p) => ({ kind: p.kind, share: (p.to - p.from) / total }));
  const out: { kind: GpsTimeKind; share: number }[] = [];
  let i = 0;
  for (let k = 0; k < max; k++) {
    const from = a.start + (total * k) / max, to = a.start + (total * (k + 1)) / max;
    const sum: Partial<Record<GpsTimeKind, number>> = {};
    while (i < a.timeline.length && a.timeline[i]!.to <= from) i++;
    for (let j = i; j < a.timeline.length && a.timeline[j]!.from < to; j++) {
      const p = a.timeline[j]!;
      sum[p.kind] = (sum[p.kind] ?? 0) + Math.max(0, Math.min(p.to, to) - Math.max(p.from, from));
    }
    const best = ORDER.reduce<GpsTimeKind | null>((b, kind) => ((sum[kind] ?? 0) > (b ? sum[b] ?? 0 : 0) ? kind : b), null);
    if (best) out.push({ kind: best, share: 1 / max });
  }
  return out;
}

/** Where the time of the outing went, as one bar and its legend. The pieces add up to the total, to the second. */
export function GpsTimeBar({ analysis: a }: { analysis: GpsAnalysis }) {
  const slices = timeSlices(a);
  const parts = ORDER.map((kind) => ({ kind, seconds: Math.round(a.ms[kind] / 1000) })).filter((p) => p.seconds > 0);
  if (!slices.length) return null;
  return (
    <View style={{ gap: space.s2 }} testID="gps-timebar">
      <View style={styles.bar} accessible accessibilityRole="image" accessibilityLabel={`Répartition du temps total : ${parts.map((p) => `${KIND[p.kind].label} ${GpsEngine.clock(p.seconds)}`).join(", ")}`}>
        {slices.map((s, i) => <View key={i} style={{ flexGrow: Math.max(s.share, 0.002) * 1000, flexBasis: 0, backgroundColor: KIND[s.kind].color }} />)}
      </View>
      <View style={styles.legend}>
        {parts.map((p) => (
          <View key={p.kind} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: KIND[p.kind].color }]} />
            <T variant="caption" tone="muted">{KIND[p.kind].label} {GpsEngine.clock(p.seconds)}</T>
          </View>
        ))}
      </View>
    </View>
  );
}

function Row({ label, value, note, testID }: { label: string; value: string; note?: string | null; testID?: string }) {
  return (
    <View style={styles.row} accessible accessibilityRole="text" accessibilityLabel={`${label} : ${value}${note ? `. ${note}` : ""}`} testID={testID}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T tone="muted">{label}</T>
        {note ? <T variant="caption" tone="faint">{note}</T> : null}
      </View>
      <T variant="num" style={{ fontSize: 22 }}>{value}</T>
    </View>
  );
}

const speedOf = (a: GpsAnalysis, key: "avgMoving" | "avgOverall", pace: boolean) => {
  const c = GpsSession.cell(key, a, null, pace);
  return c.value === "–" ? "–" : `${c.value} ${c.unit}`;
};

/** The breakdown of the time and the averages. Used while paused (« so far ») and in the bilan. */
export function GpsBreakdown({ analysis: a, sport, title }: { analysis: GpsAnalysis; sport: string; title?: string }) {
  const pace = GpsSession.layout(sport).pace;
  const off = a.pausedS + a.interruptedS;
  return (
    <Card testID="gps-breakdown">
      {title ? <T variant="h3">{title}</T> : null}
      <Row label="Temps total" value={GpsSession.chrono(a.elapsedS)} note="Du départ à la fin" testID="gps-row-elapsed" />
      <Row label="En mouvement" value={GpsSession.chrono(a.movingS)} testID="gps-row-moving" />
      <Row label="À l’arrêt" value={GpsSession.chrono(a.stoppedS)} note={a.stops.length ? `${a.stops.length} arrêt${a.stops.length > 1 ? "s" : ""} · le plus long ${GpsEngine.clock(Math.max(...a.stops.map((s) => s.seconds)))}` : null} testID="gps-row-stopped" />
      <Row label="En pause" value={GpsSession.chrono(off)} note={a.interruptedS ? `Dont ${GpsEngine.clock(a.interruptedS)} d’enregistrement interrompu par Android` : null} testID="gps-row-paused" />
      {a.missingS > 0 ? <Row label="Sans position" value={GpsSession.chrono(a.missingS)} note="Signal perdu ou trop imprécis : ce temps n’est pas compté comme effort" testID="gps-row-missing" /> : null}
      <Row label={pace ? "Allure moyenne en mouvement" : "Moyenne en mouvement"} value={speedOf(a, "avgMoving", pace)} testID="gps-row-avg-moving" />
      <Row label={pace ? "Allure moyenne globale" : "Moyenne globale"} value={speedOf(a, "avgOverall", pace)} note="Arrêts, pauses et trous compris" testID="gps-row-avg-overall" />
    </Card>
  );
}

function goalResult(goal: GpsGoal, a: GpsAnalysis): string | null {
  if (goal.kind === "return") return (a.end ?? 0) <= goal.at ? `Retour pour ${GpsSession.hhmm(goal.at)} : tenu (fin à ${GpsSession.hhmm(a.end ?? goal.at)}).` : `Retour pour ${GpsSession.hhmm(goal.at)} : dépassé (fin à ${GpsSession.hhmm(a.end ?? goal.at)}).`;
  const view = GpsSession.goalProgress(goal, a, { now: a.end ?? undefined });
  return view ? `${view.title} : ${view.reached ? "atteint" : view.line.toLowerCase()}.` : null;
}

/** Everything the athlete reads before « Enregistrer la séance ». */
export function GpsSummary({ rec, analysis: a, basemap, places }: { rec: Recording; analysis: GpsAnalysis; basemap: boolean; places: MapPlace[] }) {
  const [how, setHow] = useState(false);
  const lay = GpsSession.layout(rec.sport);
  const plan = rec.plan ? GpsSession.planSummary(rec.plan.steps, rec.plan.cursor) : null;
  const goal = rec.goal ? goalResult(rec.goal, a) : null;
  const refused = (Object.keys(WHY) as (keyof typeof a.why)[]).filter((k) => a.why[k] > 0);
  const route = GpsNav.fromFixes(rec.track.segs);
  return (
    <>
      {route ? (
        <GpsLiveMap mode="overview" height={220} segs={rec.track.segs} places={places} sport={rec.sport} basemap={basemap} accessibilityLabel={`Carte de la sortie : trace de ${GpsSession.km(a.distanceM)} km${rec.track.segs.filter((s) => s.length).length > 1 ? `, en ${rec.track.segs.filter((s) => s.length).length} tronçons non reliés` : ""}`} />
      ) : (
        <Card tone="flat"><T tone="muted">Pas assez de positions pour dessiner une trace.</T></Card>
      )}
      <View style={{ flexDirection: "row", gap: space.s4 }}>
        <GpsFigure cell={GpsSession.cell("distance", a, null, lay.pace)} size={56} />
        <GpsFigure cell={GpsSession.cell("moving", a, null, lay.pace)} size={56} />
      </View>
      <GpsTimeBar analysis={a} />
      <GpsBreakdown analysis={a} sport={rec.sport} />
      <Card testID="gps-climb">
        {a.altitude.reliable ? (
          <>
            <Row label="Dénivelé positif" value={`${a.ascentM} m`} />
            <Row label="Dénivelé négatif" value={`${a.descentM} m`} />
            <T variant="caption" tone="faint">Altitude du GPS du téléphone, lissée, non corrigée par une carte.</T>
          </>
        ) : (
          <T tone="muted">Dénivelé : altitude pas assez fiable sur cette sortie, aucun chiffre n’est affiché.</T>
        )}
      </Card>
      {a.splits.length >= 2 ? (
        <Card testID="gps-splits">
          <T variant="h3">Kilomètre par kilomètre</T>
          <T variant="caption" tone="faint">Sur le temps en mouvement : un arrêt n’entre dans aucun kilomètre.</T>
          {a.splits.map((s) => {
            const ms = s.movingS > 0 ? s.distanceM / s.movingS : null, v = GpsSession.speedText(ms, lay.pace);
            return (
              <View key={s.index} style={styles.split} accessible accessibilityRole="text" accessibilityLabel={`${s.distanceM >= 1000 ? `Kilomètre ${s.index}` : `Derniers ${s.distanceM} mètres`} : ${GpsSession.chrono(s.movingS)}, ${v.value} ${v.unit}`}>
                <T tone="muted" style={{ width: 64 }}>{s.distanceM >= 1000 ? `km ${s.index}` : `${s.distanceM} m`}</T>
                <T variant="num" style={{ flex: 1, fontSize: 20 }}>{GpsSession.chrono(s.movingS)}</T>
                <T tone="muted">{v.value} {v.unit}</T>
              </View>
            );
          })}
        </Card>
      ) : null}
      {plan && plan.total ? (
        <Card testID="gps-plan-summary">
          <T variant="h3">Séance structurée · {plan.done}/{plan.total} étape{plan.total > 1 ? "s" : ""}</T>
          {plan.laps.map((l) => <T key={l.index} tone="muted">{l.text}</T>)}
          {plan.missed.length ? <T variant="small" tone="faint">Non terminé : {plan.missed.join(", ")}. La sortie est enregistrée avec ce qui a été fait.</T> : null}
        </Card>
      ) : null}
      {goal ? <Card testID="gps-goal-result"><T variant="h3">Objectif</T><T tone="muted">{goal}</T></Card> : null}
      <Card testID="gps-quality">
        <T variant="h3">Qualité des données</T>
        <T tone="muted">{a.points} position{a.points > 1 ? "s" : ""} gardée{a.points > 1 ? "s" : ""}{a.accuracyM !== null ? ` · précision médiane ± ${a.accuracyM} m` : ""}.</T>
        {refused.length ? refused.map((k) => <T key={k} variant="small" tone="muted">{a.why[k]} position{a.why[k] > 1 ? "s" : ""} refusée{a.why[k] > 1 ? "s" : ""} : {WHY[k]}.</T>) : a.rejected ? <T variant="small" tone="muted">{a.rejected} position{a.rejected > 1 ? "s" : ""} refusée{a.rejected > 1 ? "s" : ""}.</T> : <T variant="small" tone="muted">Aucune position refusée.</T>}
        {a.gaps.slice(0, 6).map((g) => <T key={g.at} variant="small" tone="warn">Trou de {GpsEngine.clock(g.seconds)} vers le km {comma(g.distanceM / 1000)} : {comma(g.straightM / 1000, 2)} km à vol d’oiseau, non ajoutés à la distance.</T>)}
        {a.gaps.length > 6 ? <T variant="small" tone="warn">Et {a.gaps.length - 6} autre{a.gaps.length - 6 > 1 ? "s" : ""} trou{a.gaps.length - 6 > 1 ? "s" : ""} : {comma(a.gapDistanceM / 1000, 2)} km à vol d’oiseau en tout, non ajoutés.</T> : null}
        {a.thinnedEveryMs ? <T variant="small" tone="muted">Sortie très longue : la trace garde une position toutes les {Math.round(a.thinnedEveryMs / 1000)} s.</T> : null}
      </Card>
      <View style={styles.how}>
        <Tap onPress={() => setHow((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: how }} accessibilityLabel="Comment c’est calculé" style={styles.howHead} testID="gps-how">
          <T variant="bodyStrong" style={{ flex: 1 }}>Comment c’est calculé</T>
          <Icon name={how ? "up" : "chevronDown"} size={18} color={colors.tx2} />
        </Tap>
        {how ? <View style={{ gap: space.s2, paddingBottom: space.s3 }}>{GpsEngine.explain(a).map((line, i) => <T key={i} variant="small" tone="muted">{line}</T>)}</View> : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", height: 14, borderRadius: radius.r1, overflow: "hidden", backgroundColor: colors.bg3 },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: space.s3, rowGap: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: space.s3, minHeight: 40, paddingVertical: 4 },
  split: { flexDirection: "row", alignItems: "center", gap: space.s2, minHeight: 32 },
  how: { backgroundColor: colors.bg2, borderRadius: radius.r3, paddingHorizontal: space.s4 },
  howHead: { flexDirection: "row", alignItems: "center", minHeight: TOUCH + 4 },
});
