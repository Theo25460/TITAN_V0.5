import { View } from "react-native";
import { space } from "../theme/tokens";
import { Button } from "./Button";
import { T } from "./Text";

/* V1.5.0 pilot branch, same view model as the website (core/web/adventure-branches.js). Choosing a route is local;
   only the explicit confirmation is sent, and the route shown afterwards is always the server's. */
type Route = { id: string; name: string; label: string; reveals: string; followed: boolean; closed: boolean };
type Step = { ordinal: number; name: string; story: string; action: string; progress: string; ready: boolean; earned: boolean };
export type BranchView = {
  state: "available" | "entered" | "confirmed" | "legacy" | "unknown"; pilot?: string; version?: number; title: string; text?: string; intro?: string; equal?: string;
  routes?: Route[]; route?: string | null; enter?: string; enterNote?: string; ready?: boolean; notReady?: string; followed?: string; closed?: string[];
  current?: Step | null; clue?: { id: string; state: string; name: string; label: string; text: string } | null; readyText?: string; pendingNote?: string;
};
type Branches = { t: (key: string, vars?: Record<string, unknown>) => string };

export function AdventureBranch({ view, branches, atChoice, stepOrdinal, selected, onSelect, onEnter, onConfirm, onClaim, busy, online }: {
  view: BranchView; branches: Branches; atChoice: boolean; stepOrdinal: number | null; selected: string | null; busy: boolean; online: boolean;
  onSelect: (route: string | null) => void; onEnter: () => void; onConfirm: (route: string) => void; onClaim: (ordinal: number) => void;
}) {
  if (view.state === "legacy" || view.state === "unknown") return <View testID="branch-legacy" style={{ gap: space.s2 }}><T variant="h3">{view.title}</T><T variant="small">{view.text}</T></View>;
  if (view.state === "available" && !atChoice) return null;
  const chosen = view.routes?.find(r => r.id === selected) ?? null;
  const routes = <View style={{ gap: space.s2 }}>{view.routes!.map(r => <View key={r.id} testID={`branch-route-${r.id}`} style={{ gap: 4, opacity: r.closed ? 0.72 : 1 }}>
    <T variant="bodyStrong" tone={r.followed ? "accent" : "default"}>{r.label}</T><T variant="small">{r.reveals}</T>
    {view.state === "entered" && !chosen ? <Button label={branches.t("pilot.choose", { route: r.name })} kind="secondary" onPress={() => onSelect(r.id)} disabled={busy} /> : null}
  </View>)}</View>;
  const head = <><T variant="caption">Arc pilote · {view.pilot} · version {view.version}</T><T variant="h3">{view.title}</T></>;
  if (view.state === "available") return <View testID="branch-available" style={{ gap: space.s2 }}>{head}<T>{view.intro}</T>{routes}<T variant="small">{view.equal}</T><T variant="caption">{view.enterNote}</T>
    <Button label={view.enter!} onPress={onEnter} loading={busy} /></View>;
  if (view.state === "entered") return <View testID="branch-entered" style={{ gap: space.s2 }}>{head}<T>{view.intro}</T>{routes}<T variant="small">{view.equal}</T>
    {!view.ready ? <T variant="small">{view.notReady}</T> : null}
    {chosen ? <View accessibilityRole="summary" testID="branch-confirm" style={{ gap: space.s2 }}>
      <T variant="bodyStrong">{branches.t("pilot.confirmTitle", { route: chosen.name })}</T><T variant="small">{branches.t("pilot.confirmBody")}</T>
      {!online ? <T variant="small" tone="err">{branches.t("pilot.offline")}</T> : null}
      <Button label={branches.t("pilot.confirm", { route: chosen.name })} onPress={() => onConfirm(chosen.id)} disabled={!view.ready || !online} loading={busy} />
      <Button label={branches.t("pilot.back")} kind="secondary" onPress={() => onSelect(null)} disabled={busy} />
    </View> : null}
  </View>;
  const step = view.current && view.current.ordinal === stepOrdinal ? view.current : null;
  return <View testID="branch-confirmed" style={{ gap: space.s2 }}>{head}<T variant="bodyStrong">{view.followed}</T>
    {view.closed?.map(c => <T key={c} variant="caption">{c}</T>)}
    {step ? <View testID={`branch-step-${step.ordinal}`} style={{ gap: space.s2 }}><T variant="h3">{step.name}</T><T>{step.story}</T>
      <T variant="small">{step.progress}{step.ready ? ` · ${view.readyText}` : ""}</T><T variant="caption">{view.pendingNote}</T>
      <Button label={step.action} onPress={() => onClaim(step.ordinal)} disabled={!step.ready} loading={busy} /></View> : null}
    {view.clue ? <View testID={`branch-clue-${view.clue.id}`} style={{ gap: 4 }}><T variant="caption">{view.clue.label}</T><T variant="bodyStrong">{view.clue.name}</T><T variant="small">{view.clue.text}</T></View> : null}
  </View>;
}
