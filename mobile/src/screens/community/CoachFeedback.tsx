/* V1.9.2 — Retour sur la séance, athlete side on Android. Behind screens.coach_feedback. Shown on « Mes suivis de coaching » (every
   feedback, the ones waiting for an answer first) and on the session detail (the feedback of that very session). The observation and the
   proposal are two separate blocks; the proposal changes nothing until the athlete accepts it; the measures shown are exactly what the
   coach can read now. Nothing here writes the journal, the notes or the check-in. Wording comes from the website's shared module. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { ask, Alert } from "../../components/Dialog";
import { T } from "../../components/Text";
import { CoachFeedback as F, type FeedbackInbox, type FeedbackRow } from "../../core/coachFeedback";
import * as api from "../../data/api";
import { useServerFlag } from "../../data/flags";
import { space } from "../../theme/tokens";

const key = (owner: string, session?: string) => ["coach-feedback", owner, session ?? "all"] as const;
const codeOf = (e: unknown) => String((e as { message?: string })?.message ?? "");

export function CoachFeedbackList({ owner, online, sessionId }: { owner: string; online: boolean; sessionId?: string }) {
  const enabled = useServerFlag("screens.coach_feedback");
  const qc = useQueryClient();
  const q = useQuery({ queryKey: key(owner, sessionId), queryFn: () => api.coachFeedback<FeedbackInbox>(owner, "athlete", sessionId ? { session_id: sessionId } : {}), enabled: enabled && online, retry: false, staleTime: 30_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);
  if (!enabled || !online) return null;
  if (q.isError) return sessionId ? null : <T variant="small">{F.message(codeOf(q.error)) || "Les retours de ton coach sont indisponibles pour le moment."}</T>;
  if (!q.data || q.data.owner !== owner || !q.data.rows.length) return null;

  /** One answer at a time, whatever the number of taps; every list of feedback is read again afterwards. */
  async function run(row: FeedbackRow, label: string, call: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(row.id + label);
    try {
      const r = (await call()) as { ok?: boolean; code?: string } | null;
      if (r && r.ok === false) Alert.alert("Ajustement non appliqué", F.message(r.code ?? "") || "Rien n’a été modifié.");
    } catch (e) {
      Alert.alert("Réponse non confirmée", F.message(codeOf(e)) || "La demande n’a pas abouti. Réessaie.");
    } finally {
      lock.current = false;
      setBusy(null);
      await qc.invalidateQueries({ queryKey: ["coach-feedback", owner] });
      await qc.invalidateQueries({ queryKey: ["coach-followup", owner] });
    }
  }

  function card(row: FeedbackRow) {
    const v = F.forAthlete(row);
    const a = v.adjustment;
    const b = (l: string) => busy === row.id + l;
    return (
      <Card key={row.id} style={{ gap: space.s2 }} testID={`feedback-${row.id}`}>
        <T variant="eyebrow">{row.coach_name || "Mon coach"} · retour du {v.written}</T>
        <T variant="small" tone="muted">Sur « {row.assignment.title} »</T>
        {v.link ? <T variant="small" tone="muted">{v.link}</T> : null}
        {v.relinked ? <T variant="small" tone="muted">{v.relinked}</T> : null}
        <View style={{ gap: space.s1 }} testID={`observation-${row.id}`}>
          <T variant="bodyStrong">Observation</T>
          <T variant="small">{v.observation}</T>
        </View>
        {a ? (
          <View style={{ gap: space.s1 }} testID={`adjustment-${row.id}`}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2, alignItems: "center" }}>
              <T variant="bodyStrong">Proposition pour la suite</T>
              <Chip label={a.label} tone={a.tone === "wait" ? "amber" : a.tone === "done" ? "ok" : "default"} testID={`adjustment-state-${row.id}`} />
            </View>
            <T variant="small">{a.heading}</T>
            {a.changes.map((c) => <T key={c.field} variant="small">{c.label} : {a.kind === "new" ? c.after : `${c.before} → ${c.after}`}</T>)}
            {a.note ? <T variant="small" tone="muted">Mot de ton coach : « {a.note} »</T> : null}
            <T variant="small" tone="muted">{a.text}</T>
          </View>
        ) : null}
        <View style={{ gap: space.s1 }} testID={`shared-${row.id}`}>
          <T variant="bodyStrong">Ce que ton coach voit de la séance</T>
          {v.session.text ? <T variant="small">{v.session.text}</T> : <T variant="small">{v.session.heading}</T>}
          {v.session.measures.length ? <T variant="small">{v.session.measures.map((m) => `${m.label} ${m.text}`).join(" · ")}</T> : null}
          {v.session.exercises.map((e, i) => <T key={i} variant="small">{e.name}{e.summary ? ` · ${e.summary}` : ""}{e.sets.length ? ` — ${e.sets.join(" · ")}` : ""}</T>)}
          {v.session.checkin ? <T variant="small">{v.session.checkin}</T> : null}
          {v.session.hidden ? <T variant="caption" tone="faint">{v.session.hidden}</T> : null}
          {v.session.corrected ? <T variant="caption" tone="muted">{v.session.corrected}</T> : null}
        </View>
        {v.can.includes("accept") ? <View style={{ gap: space.s2 }}>
          <Button label="Accepter l’ajustement" loading={b("accept")} onPress={async () => {
            if (await ask("Accepter cet ajustement ?", a?.kind === "new" ? "La séance s’ajoute à tes séances proposées. Ton journal ne change pas." : "La proposition visée est mise à jour ; sa première version reste dans l’historique. Ton journal ne change pas.", { confirmLabel: "Accepter" }))
              await run(row, "accept", () => api.coachFeedback(owner, "answer", { id: row.id, revision: row.revision, accept: true }));
          }} />
          <Button label="Décliner" kind="ghost" loading={b("decline")} onPress={() => run(row, "decline", () => api.coachFeedback(owner, "answer", { id: row.id, revision: row.revision, accept: false }))} />
        </View> : null}
        {v.can.includes("read") ? <Button label="Compris" kind="secondary" small loading={b("read")} onPress={() => run(row, "read", () => api.coachFeedback(owner, "read", { id: row.id }))} /> : null}
      </Card>
    );
  }

  return (
    <View style={{ gap: space.s3 }} testID={sessionId ? "session-coach-feedback" : "coach-feedback"}>
      <T variant="h3">{sessionId ? "Retour de ton coach sur cette séance" : "Retours de ton coach"}</T>
      {q.data.rows.map(card)}
      <T variant="caption" tone="faint">Ton coach ne modifie jamais ton journal, tes notes ni ton check-in. Tu choisis ce qu’il voit dans « Mes suivis de coaching ».</T>
    </View>
  );
}
