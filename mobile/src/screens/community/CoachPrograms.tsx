/* V1.9.4 — Programmation multi-semaines, athlete side on Android (Communauté › « Mes suivis de coaching »). Behind screens.coach_programs.
   The athlete reads each programme of their coach week by week, answers session by session (accept, decline, to discuss with a word),
   accepts a change or keeps their version, and keeps a read-only view of paused or ended shares with their own linked sessions.
   One answer is sent at a time, whatever the number of taps. Nothing here writes the journal. Wording comes from the website's shared
   module (src/core/web/coach-program.js). */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Alert } from "../../components/Dialog";
import { Field } from "../../components/Field";
import { T } from "../../components/Text";
import { CoachProgram as P, type Answer, type AthletePlans, type Plan, type SessionView } from "../../core/coachProgram";
import * as api from "../../data/api";
import { useServerFlag } from "../../data/flags";
import { space } from "../../theme/tokens";

const key = (owner: string) => ["coach-programs", owner] as const;
const codeOf = (e: unknown) => String((e as { message?: string })?.message ?? "");
const tone = (t: string) => (t === "gap" ? "warn" : t === "done" ? "ok" : t === "wait" ? "amber" : "default") as "warn" | "ok" | "amber" | "default";

export function CoachPrograms({ owner, online }: { owner: string; online: boolean }) {
  const enabled = useServerFlag("screens.coach_programs");
  const qc = useQueryClient();
  const q = useQuery({ queryKey: key(owner), queryFn: () => api.coachProgram<AthletePlans>(owner, "athlete"), enabled: enabled && online, retry: false, staleTime: 30_000 });
  const [choices, setChoices] = useState<Record<string, { answer?: Answer; note?: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, boolean>>({});
  const lock = useRef(false);
  if (!enabled || !online) return null;
  if (q.isError) return <View style={{ gap: space.s2 }}><T>{P.message(codeOf(q.error)) || "Les programmes sont indisponibles pour le moment."}</T><Button label="Réessayer" kind="secondary" small onPress={() => q.refetch()} /></View>;
  if (!q.data) return <T accessibilityLiveRegion="polite">Lecture des programmes…</T>;
  if (q.data.owner !== owner || !q.data.plans.length) return null;

  async function send(plan: Plan, payload: Record<string, unknown>, label: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(plan.id + label);
    try {
      const r = await api.coachProgram<{ results: { effect: string }[] }>(owner, "answer", { id: plan.id, ...payload });
      const done = (r?.results ?? []).filter((x) => x.effect !== "unchanged").length;
      Alert.alert(done ? "Réponses envoyées" : "Déjà répondu", "Ton coach voit tes réponses. Ton journal ne change pas.");
      setChoices({});
    } catch (e) {
      Alert.alert("Réponses non confirmées", P.message(codeOf(e)) || "La demande n’a pas abouti. Réessaie.");
    } finally {
      lock.current = false;
      setBusy(null);
      await qc.invalidateQueries({ queryKey: key(owner) });
    }
  }
  const pick = (k: string, answer: Answer) => setChoices((c) => ({ ...c, [k]: { ...c[k], answer } }));

  function session(plan: Plan, s: SessionView) {
    const c = choices[s.key];
    const open = !s.readOnly && plan.can_act;
    const asks = open && ["awaiting", "to_discuss"].includes(s.state);
    const change = open && s.changePending;
    return (
      <View key={s.key} style={{ gap: space.s1, paddingVertical: space.s2 }} testID={`plan-session-${s.key}`}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2, alignItems: "center" }}>
          <T variant="bodyStrong" style={{ flexShrink: 1 }}>{s.dayText} · {s.title}</T>
          {s.label ? <Chip label={s.label} tone={tone(s.tone)} testID={`plan-state-${s.key}`} /> : null}
        </View>
        <T variant="small" tone="muted">{s.sport}{s.instructions ? ` · ${s.instructions}` : ""}</T>
        {s.text ? <T variant="small">{s.text}</T> : null}
        {s.changes.length ? <View style={{ gap: space.s1 }} testID={`plan-change-${s.key}`}>
          <T variant="small" tone="accent">Ce qui change</T>
          {s.changes.map((x) => <T key={x.field} variant="small">{x.label} : {x.before} → {x.after}</T>)}
        </View> : null}
        {asks ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2 }}>
          {([["accept", "Accepter"], ["decline", "Décliner"], ["discuss", "À discuter"]] as const).map(([a, l]) =>
            <Chip key={a} label={l} selected={c?.answer === a} onPress={() => pick(s.key, a)} testID={`answer-${s.key}-${a}`} />)}
        </View> : null}
        {asks && c?.answer === "discuss" ? <Field label="Ce que tu veux en discuter" maxLength={300} value={c.note ?? ""} testID={`note-${s.key}`}
          onChangeText={(note) => setChoices((x) => ({ ...x, [s.key]: { ...x[s.key], note } }))} /> : null}
        {change ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2 }}>
          <Chip label="Accepter le changement" selected={c?.answer === "accept_change"} onPress={() => pick(s.key, "accept_change")} testID={`answer-${s.key}-accept_change`} />
          <Chip label="Garder ma version" selected={c?.answer === "keep_version"} onPress={() => pick(s.key, "keep_version")} testID={`answer-${s.key}-keep_version`} />
        </View> : null}
      </View>
    );
  }

  function card(plan: Plan) {
    const h = P.head(plan), todo = P.toAnswer(plan);
    const mine = Object.fromEntries(Object.entries(choices).filter(([k]) => plan.sessions.some((s) => s.key === k)));
    const decisions = P.answers(mine);
    return (
      <Card key={plan.id} style={{ gap: space.s2 }} testID={`plan-${plan.id}`}>
        <T variant="eyebrow">{plan.coach_name || "Mon coach"} · {h.stateLabel}</T>
        <T variant="title">{h.title}</T>
        <T variant="small" tone="muted">{h.dates}{h.current ? ` · ${h.current}` : ""}</T>
        {h.goals.map((g) => <T key={g} variant="small">• {g}</T>)}
        <T variant="small" testID={`plan-summary-${plan.id}`}>{h.summary}</T>
        {h.link ? <T variant="small" tone="muted" testID={`plan-readonly-${plan.id}`}>{h.link}</T> : null}
        {P.weeks(plan, "athlete").map((w) => (
          <View key={w.week} style={{ gap: space.s1 }} testID={`plan-week-${w.week}`}>
            <T variant="bodyStrong">{w.label}{w.stateLabel ? ` · ${w.stateLabel}` : ""}</T>
            {w.sessions.length ? w.sessions.map((s) => session(plan, s)) : <T variant="small" tone="muted">Aucune séance cette semaine.</T>}
          </View>
        ))}
        {plan.can_act && (todo.sessions || todo.changes) ? <View style={{ gap: space.s2 }}>
          <Button label={decisions.length ? `Envoyer mes réponses (${decisions.length})` : "Envoyer mes réponses"} disabled={!decisions.length} loading={busy === plan.id + "send"}
            onPress={() => send(plan, { decisions }, "send")} />
          <Button label="Tout accepter" kind="secondary" loading={busy === plan.id + "all"} onPress={() => send(plan, { all: "accept" }, "all")} />
        </View> : null}
        <Button label={history[plan.id] ? "Masquer les versions" : "Voir les versions"} kind="ghost" small onPress={() => setHistory((o) => ({ ...o, [plan.id]: !o[plan.id] }))} />
        {history[plan.id] ? plan.versions.map((v) => P.version(v)).map((v) => <T key={v.version} variant="caption" tone="muted">Version {v.version} · {v.at} · {v.text}</T>) : null}
      </Card>
    );
  }

  return (
    <View style={{ gap: space.s3 }} testID="coach-programs">
      <T variant="h3">Programmes de mon coach</T>
      {q.data.plans.map(card)}
      <T variant="caption" tone="faint">Tu décides séance par séance. Une séance déjà faite n’est jamais remplacée ; un changement ne s’applique qu’avec ton accord.</T>
    </View>
  );
}
