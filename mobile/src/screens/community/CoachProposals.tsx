/* V1.9.1 — Une séance assignée, athlete side on Android (Communauté › « Mes suivis de coaching »). Behind screens.coach_followup.
   The athlete sees what waits for a decision (a proposal to answer, a change to review beside the version in force, a match suggested
   by the server), moves a session, says it is done, confirms or removes a link, and keeps a read-only view of paused or ended shares so
   they always find their own session. Nothing here writes the journal: a link only points a proposal at an existing session.
   Wording and allowed actions come from the website's shared module (src/core/web/coach-followup.js). */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { ask, Alert } from "../../components/Dialog";
import { T } from "../../components/Text";
import { Sports } from "../../core";
import { CoachFollowup as F, type AthleteInbox, type FollowRow } from "../../core/coachFollowup";
import * as api from "../../data/api";
import { useServerFlag } from "../../data/flags";
import { CoachFeedbackList } from "./CoachFeedback";
import { space } from "../../theme/tokens";

const key = (owner: string) => ["coach-followup", owner] as const;
const shift = (iso: string, days: number) => new Date(Date.parse(iso + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const measure = (val?: number, unit?: string | null, duration?: number | null) =>
  [unit === "km" ? `${String(val).replace(".", ",")} km` : val !== undefined ? `${val} ${unit ?? ""}`.trim() : "", duration ? `${Math.round(duration)} min` : ""].filter(Boolean).join(" · ");
const codeOf = (e: unknown) => String((e as { message?: string })?.message ?? "");

export function CoachProposals({ owner, online }: { owner: string; online: boolean }) {
  const enabled = useServerFlag("screens.coach_followup");
  const qc = useQueryClient();
  const q = useQuery({ queryKey: key(owner), queryFn: () => api.coachFollowup<AthleteInbox>(owner, "athlete"), enabled: enabled && online, retry: false, staleTime: 30_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const lock = useRef(false);
  if (!enabled || !online) return null;
  if (q.isError) return <View style={{ gap: space.s2 }}><T>{F.message(codeOf(q.error)) || "Les propositions sont indisponibles pour le moment."}</T><Button label="Réessayer" kind="secondary" small onPress={() => q.refetch()} /></View>;
  if (!q.data) return <T accessibilityLiveRegion="polite">Lecture des propositions…</T>;
  if (q.data.owner !== owner) return null;
  const rows = q.data.rows;
  const active = rows.filter((r) => r.link_state === "active" && !["cancelled", "declined"].includes(r.state));
  const archive = rows.filter((r) => r.link_state !== "active" || ["cancelled", "declined"].includes(r.state));

  /** One action at a time, whatever the number of taps; the server's answer refreshes the list. */
  async function run(row: FollowRow, label: string, call: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(row.id + label);
    try {
      const r = (await call()) as { ok?: boolean; code?: string } | null;
      if (r && r.ok === false) Alert.alert("Lien non ajouté", F.message(r.code ?? "") || "Le lien en place est gardé.");
      setMoving(null);
    } catch (e) {
      Alert.alert("Action non confirmée", F.message(codeOf(e)) || "La demande n’a pas abouti. Réessaie.");
    } finally {
      lock.current = false;
      setBusy(null);
      await qc.invalidateQueries({ queryKey: key(owner) });
    }
  }
  const act = (row: FollowRow, action: string, data: Record<string, unknown> = {}) => api.coachFollowup(owner, action, { id: row.id, revision: row.revision, ...data });

  function card(row: FollowRow) {
    const v = F.forAthlete(row);
    const b = (label: string) => busy === row.id + label;
    const can = (a: string) => v.can.includes(a as never);
    const choices = [-2, -1, 1, 2, 3, 4, 5].map((d) => shift(row.planned_date, d)).filter((d) => d >= shift(q.data!.today, -7) && d !== row.moved_date);
    return (
      <Card key={row.id} style={{ gap: space.s2 }} testID={`proposal-${row.id}`}>
        <T variant="eyebrow">{row.coach_name || "Mon coach"} · {Sports.label(row.sport)}</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2, alignItems: "center" }}>
          <T variant="title" style={{ flexShrink: 1 }}>{row.title}</T>
          <Chip label={v.label} tone={v.tone === "gap" ? "warn" : v.tone === "done" ? "ok" : v.tone === "wait" ? "amber" : "default"} testID={`state-${row.id}`} />
        </View>
        {v.link ? <T variant="small" tone="muted">{v.link}</T> : null}
        <T variant="small">{v.text}</T>
        {v.dates.map((d) => <T key={d.key} variant="small" tone={d.key === "done" ? "ok" : d.key === "planned" ? "muted" : "accent"}>{d.label} : {d.text}</T>)}
        {v.changes.length ? (
          <View style={{ gap: space.s1 }} accessibilityLabel="Ce qui change" testID={`changes-${row.id}`}>
            <T variant="bodyStrong">Ce qui change</T>
            {v.changes.map((c) => <T key={c.field} variant="small">{c.label} : {c.before} → {c.after}</T>)}
            {row.pending_change?.note ? <T variant="small" tone="muted">Mot de ton coach : « {row.pending_change.note} »</T> : null}
          </View>
        ) : null}
        {row.instructions && !v.changes.length ? <T variant="small" tone="muted">{row.instructions}</T> : null}
        {can("accept") ? <View style={{ gap: space.s2 }}>
          <Button label="Accepter" loading={b("accept")} onPress={() => run(row, "accept", () => api.coachAnswer(owner, row.id, row.revision, "accepted"))} />
          <Button label="Décliner" kind="ghost" loading={b("decline")} onPress={() => run(row, "decline", () => api.coachAnswer(owner, row.id, row.revision, "declined"))} />
        </View> : null}
        {can("accept_change") ? <View style={{ gap: space.s2 }}>
          <Button label="Accepter le changement" loading={b("accept_change")} onPress={() => run(row, "accept_change", () => act(row, "answer_change", { accept: true }))} />
          <Button label="Garder ma version" kind="secondary" loading={b("decline_change")} onPress={() => run(row, "decline_change", () => act(row, "answer_change", { accept: false }))} />
        </View> : null}
        {can("confirm") ? v.candidates.map((c) => (
          <View key={c.id} style={{ gap: space.s1 }} testID={`candidate-${c.id}`}>
            <T variant="small">Ta séance du {F.day(c.day)}{measure(c.val, c.unit, c.duration) ? ` · ${measure(c.val, c.unit, c.duration)}` : ""}</T>
            <Button label={v.candidates.length === 1 ? "Oui, c’est elle : relier" : `Relier la séance du ${F.day(c.day)}`} loading={b("confirm" + c.id)} onPress={() => run(row, "confirm" + c.id, () => act(row, "link", { session_id: c.id }))} />
          </View>
        )) : null}
        {row.linked?.session_id ? <T variant="small" tone="ok">Ta séance : {F.day(row.linked.day)}{measure(row.linked.val, row.linked.unit, row.linked.duration) ? ` · ${measure(row.linked.val, row.linked.unit, row.linked.duration)}` : ""}</T> : null}
        {can("move") ? (moving === row.id ? (
          <View style={{ gap: space.s2 }} testID={`move-${row.id}`}>
            <T variant="small">Nouveau jour (ton coach voit la date prévue et la tienne) :</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2 }}>
              {choices.map((d) => <Chip key={d} label={F.day(d)} onPress={() => run(row, "move", () => act(row, "move", { date: d }))} testID={`move-${row.id}-${d}`} />)}
              {row.moved_date ? <Chip label="Revenir au jour prévu" onPress={() => run(row, "move", () => act(row, "move", { date: null }))} /> : null}
            </View>
            <Button label="Annuler" kind="ghost" small onPress={() => setMoving(null)} />
          </View>
        ) : <Button label="Déplacer" kind="secondary" small onPress={() => setMoving(row.id)} />) : null}
        {can("declare") ? <Button label="Je l’ai faite (séance pas encore dans mon journal)" kind="secondary" small loading={b("declare")} onPress={() => run(row, "declare", () => act(row, "declare_done", { done: true }))} /> : null}
        {can("undeclare") ? <Button label="Retirer « faite »" kind="ghost" small loading={b("undeclare")} onPress={() => run(row, "undeclare", () => act(row, "declare_done", { done: false }))} /> : null}
        {can("unlink") ? <Button label="Retirer ce lien" kind="ghost" small loading={b("unlink")} onPress={async () => {
          if (await ask("Retirer ce lien ?", "La proposition redevient « prévue ». Ta séance reste dans ton journal, inchangée.", { confirmLabel: "Retirer le lien" })) await run(row, "unlink", () => act(row, "unlink"));
        }} /> : null}
        {can("decline") && !can("accept") ? <Button label="Décliner" kind="ghost" small loading={b("decline")} onPress={async () => {
          if (await ask("Décliner cette séance ?", "Ton coach voit que tu l’as déclinée. Ton journal ne change pas.", { confirmLabel: "Décliner" })) await run(row, "decline", () => api.coachAnswer(owner, row.id, row.revision, "declined"));
        }} /> : null}
        <Button label={open[row.id] ? "Masquer l’historique" : "Voir l’historique"} kind="ghost" small onPress={() => setOpen((o) => ({ ...o, [row.id]: !o[row.id] }))} />
        {open[row.id] ? F.history(row).map((h, i) => <T key={i} variant="caption" tone={h.kind === "link_refused" ? "warn" : "muted"}>{h.at} · {h.text}</T>) : null}
      </Card>
    );
  }

  return (
    <View style={{ gap: space.s3 }} testID="coach-proposals">
      <T variant="h3">Séances proposées</T>
      {active.length ? active.map(card) : <T variant="small" tone="muted">Aucune proposition en cours.</T>}
      {archive.length ? <>
        <T variant="bodyStrong">Déclinées, annulées ou partages arrêtés</T>
        {archive.map(card)}
      </> : null}
      <T variant="caption" tone="faint">Un lien avec ton journal ne se fait jamais sans toi. Ton coach voit la date prévue, la tienne et la date faite.</T>
      <CoachFeedbackList owner={owner} online={online} />
    </View>
  );
}
