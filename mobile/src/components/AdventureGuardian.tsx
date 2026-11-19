import { useEffect, useRef } from "react";
import { Animated, Image, View } from "react-native";
import { guardianImages } from "../core/images";
import { useReducedMotion } from "../lib/motion";
import { space } from "../theme/tokens";
import { Button } from "./Button";
import { T } from "./Text";

/* V1.5.1 Veilleur de pierre, same view model as the website (core/web/adventure-guardian.js). The stage is decorative and hidden
   from accessibility services; its caption describes the whole scene. With the system "remove animations" setting the Veilleur
   takes its new pose at once; otherwise it moves when the server confirms a phase. */
type Phase = { id: string; name: string; state: "done" | "active" | "waiting"; label: string };
type Sign = { id: string; name: string; text: string; label: string; chosen: boolean };
export type GuardianView = {
  state: "locked" | "observe" | "prepare" | "waiting" | "ready" | "resolved" | "legacy" | "unknown"; id?: string; version?: number; route?: string;
  title: string; text: string; intro?: string; equal?: string; phases?: Phase[];
  scene?: { pose: "far" | "blocking" | "watching" | "aside" | "bowing"; passage: string; oath: string; signs: boolean; focus: string | null; caption: string } | null;
  threshold?: { ordinal: number; ready: boolean; progress: string; remaining: string; note: string } | null;
  action?: { kind: "claim"; ordinal: number; label: string; ready: boolean } | { kind: "prepare"; signs: Sign[]; note: string } | { kind: "resolve"; label: string; ready: boolean } | null;
  feedback?: { correct: boolean; attempts: number; text: string } | null;
  outcome?: { id: string; name: string; text: string; decisive: string; decision: string } | null;
  resume?: { title: string; acquiredTitle: string; nextTitle: string; acquired: string[]; next: string; corrected: string };
  observeOrdinal?: number; ordinal?: number;
};
// Pose → horizontal offset and tilt of the Veilleur on a 300-wide stage.
const POSES: Record<string, { x: number; tilt: number; scale: number }> = {
  far: { x: 0, tilt: 0, scale: 0.6 }, blocking: { x: 0, tilt: 0, scale: 1 }, watching: { x: 0, tilt: -4, scale: 1 }, aside: { x: 90, tilt: 0, scale: 0.88 }, bowing: { x: 0, tilt: 7, scale: 1 },
};

export function AdventureGuardian({ view, busy, onClaim, onPrepare, onResolve }: {
  view: GuardianView; busy: boolean; onClaim: (ordinal: number) => void; onPrepare: (sign: string) => void; onResolve: () => void;
}) {
  const reduced = useReducedMotion();
  const pose = POSES[view.scene?.pose ?? "blocking"] ?? POSES.blocking;
  const x = useRef(new Animated.Value(pose.x)).current, tilt = useRef(new Animated.Value(pose.tilt)).current, scale = useRef(new Animated.Value(pose.scale)).current;
  useEffect(() => {
    if (reduced) { x.setValue(pose.x); tilt.setValue(pose.tilt); scale.setValue(pose.scale); return; }
    Animated.parallel([Animated.timing(x, { toValue: pose.x, duration: 900, useNativeDriver: true }), Animated.timing(tilt, { toValue: pose.tilt, duration: 900, useNativeDriver: true }),
      Animated.timing(scale, { toValue: pose.scale, duration: 900, useNativeDriver: true })]).start();
  }, [pose, reduced, x, tilt, scale]);
  if (view.state === "legacy" || view.state === "unknown") return <View testID="guardian-legacy" style={{ gap: space.s2 }}><T variant="h3">{view.title}</T><T variant="small">{view.text}</T></View>;
  const a = view.action, sc = view.scene!, r = view.resume!;
  return <View testID={`guardian-${view.state}`} style={{ gap: space.s2 }}>
    <T variant="caption">Gardien de l’arc pilote · version {view.version}</T><T variant="h3">{view.title}</T><T>{view.intro}</T>
    <View accessibilityLabel="Phases de la rencontre" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {view.phases!.map(p => <T key={p.id} testID={`guardian-phase-${p.id}-${p.state}`} variant="caption" tone={p.state === "waiting" ? "faint" : "accent"}>{p.label}</T>)}
    </View>
    <View testID={`guardian-scene-${sc.pose}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ height: 170, borderRadius: 10, overflow: "hidden", backgroundColor: "#22323f", alignItems: "center", justifyContent: "flex-end" }}>
      <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "36%", backgroundColor: "#4f5a67" }} />
      {sc.passage === "open" ? <View testID="guardian-passage-open" style={{ position: "absolute", left: "38%", right: "22%", bottom: 0, height: "60%", backgroundColor: "rgba(243,227,181,0.35)", borderTopLeftRadius: 80, borderTopRightRadius: 80 }} /> : null}
      <Animated.View style={{ transform: [{ translateX: x }, { rotate: tilt.interpolate({ inputRange: [-10, 10], outputRange: ["-10deg", "10deg"] }) }, { scale }] }}>
        <Image source={guardianImages.aube} style={{ width: 140, height: 140 }} resizeMode="contain" />
        {sc.oath === "complete" ? <View testID="guardian-oath-complete" style={{ position: "absolute", left: 52, top: 64, width: 34, height: 18, borderRadius: 4, backgroundColor: "rgba(243,227,181,0.75)" }} /> : null}
      </Animated.View>
    </View>
    <T testID="guardian-caption" variant="small">{sc.caption}</T>
    <T>{view.text}</T>
    {view.threshold ? <><T testID="guardian-threshold" variant="small">{view.threshold.progress}</T><T variant="small">{view.threshold.remaining}</T><T variant="caption">{view.threshold.note}</T></> : null}
    {view.feedback ? <T testID={`guardian-feedback-${view.feedback.correct ? "right" : "wrong"}`} accessibilityLiveRegion="polite" tone={view.feedback.correct ? "accent" : "warn"}>{view.feedback.text}</T> : null}
    {a?.kind === "claim" ? <Button label={a.label} onPress={() => onClaim(a.ordinal)} disabled={!a.ready} loading={busy} /> : null}
    {a?.kind === "prepare" ? <View style={{ gap: space.s2 }}>{a.signs.map(sign => <View key={sign.id} testID={`guardian-sign-${sign.id}`} style={{ gap: 4 }}>
      <T variant="bodyStrong">{sign.name}</T><T variant="small">{sign.text}</T>
      <Button label={sign.label} kind="secondary" onPress={() => onPrepare(sign.id)} disabled={busy} />
    </View>)}<T variant="caption">{a.note}</T></View> : null}
    {a?.kind === "resolve" ? <Button label={a.label} onPress={onResolve} disabled={!a.ready} loading={busy} /> : null}
    {view.outcome ? <View testID={`guardian-outcome-${view.outcome.id}`} accessibilityLiveRegion="polite" style={{ gap: 4 }}>
      <T variant="caption">Issue confirmée par le serveur</T><T variant="bodyStrong">{view.outcome.name}</T><T variant="small">{view.outcome.text}</T>
      <T variant="small">{view.outcome.decisive}</T><T variant="small">{view.outcome.decision}</T></View> : null}
    <View testID="guardian-resume" style={{ gap: 4 }}><T variant="bodyStrong">{r.title}</T><T variant="caption">{r.acquiredTitle}</T>
      {r.acquired.map(x => <T key={x} variant="small">• {x}</T>)}
      <T variant="caption">{r.nextTitle}</T><T testID="guardian-next" variant="small">{r.next}</T>
      {r.corrected ? <T testID="guardian-corrected" variant="small" tone="warn">{r.corrected}</T> : null}
    </View>
    <T variant="caption">{view.equal}</T>
  </View>;
}
