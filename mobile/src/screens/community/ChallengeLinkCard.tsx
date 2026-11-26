/* V1.8.1 — a challenge or Grande Cordée invitation link opened on Android (https://titan-app.fr/defi?t=…, claimed by the app since
   V1.8.1). Native counterpart of the website's /defi page: the public preview (rules, never a name), then « S’encorder » or « Rejoindre
   le défi » on an explicit tap. Nothing is written before the tap; the server checks the one-use token, the limits and blocks. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Cordee, type CordeePace, type CordeeRouteId } from "../../core/cordee";
import * as api from "../../data/api";
import { keys } from "../../data/hooks";
import { errorMessage } from "../../lib/errors";
import { space } from "../../theme/tokens";
import { cordeeKey } from "./CordeePanel";

const ERRORS: Record<string, string> = {
  LINK_INVALID: "Ce lien n’est plus valable : il a déjà servi, il a expiré ou il a été retiré. Demande-en un nouveau à ton ami.",
  LINK_OWN_CHALLENGE: "C’est ton propre défi : partage ce lien à un ami.",
  CHALLENGE_FULL: "Ce défi est complet.",
  ACCOUNT_SUSPENDED: "Ton compte est suspendu : tu ne peux pas rejoindre de défi.",
  SOCIAL_RATE_LIMIT: "Beaucoup d’actions en peu de temps. Réessaie plus tard.",
};
const METRICS: Record<string, string> = { effort_minutes: "minutes d’effort", active_days: "jours actifs", sessions: "séances", distance_km: "km" };
const reason = (e: unknown) => {
  const raw = String((e as { message?: string })?.message ?? e ?? "");
  const k = Object.keys(ERRORS).find((x) => raw.includes(x));
  return k ? ERRORS[k] : errorMessage(e);
};
const when = (iso?: string) => {
  const d = new Date(iso ?? "");
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
};

export function ChallengeLinkCard({ owner, token, online, onDone }: { owner: string; token: string; online: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const preview = useQuery({ queryKey: ["challenge-link", owner, token], queryFn: () => api.challengeLinkPreview(token), enabled: online, retry: false, staleTime: Infinity });
  const p = preview.data;
  if (!online) return <Card testID="challenge-link-offline"><T variant="small">Reconnecte-toi pour voir l’invitation que tu as reçue.</T></Card>;
  if (preview.isLoading) return <Card><T variant="small">Lecture de l’invitation…</T></Card>;
  if (preview.isError || !p?.valid) {
    return (
      <Card style={{ gap: space.s2 }} testID="challenge-link-invalid">
        <T variant="bodyStrong">Lien indisponible</T>
        <T variant="small">{ERRORS.LINK_INVALID}</T>
        <Button small kind="ghost" label="Fermer" onPress={onDone} />
      </Card>
    );
  }
  const cordee = p.kind === "cordee";
  const route = cordee ? Cordee.ROUTES[p.route as CordeeRouteId] : null;
  const pace = cordee ? Cordee.PACES[p.pace as CordeePace] : null;
  const participants = Number(p.participants) || 0;

  async function join() {
    if (busy) return;
    setBusy(true);
    try {
      await api.challengeLinkAccept(owner, token);
      toast({ kind: "ok", title: cordee ? "Tu es encordé" : "Défi rejoint", message: cordee ? "Ta cordée t’attend juste en dessous." : "Il t’attend dans tes défis." });
      await Promise.all([qc.invalidateQueries({ queryKey: cordeeKey(owner) }), qc.invalidateQueries({ queryKey: keys.social(owner) })]);
      onDone();
    } catch (e) {
      toast({ kind: "err", title: "Impossible de rejoindre", message: reason(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: space.s3 }} testID="challenge-link-card">
      <T variant="eyebrow" tone="accent">{cordee ? "Grande Cordée · invitation" : "Défi entre amis · invitation"}</T>
      <T variant="title">{p.title}</T>
      {route ? <T variant="small" tone="muted">{route.intro}</T> : null}
      {cordee ? (
        <T variant="small">Un objectif commun, chacun avec son sport : {p.target} longueurs par membre{pace ? ` (allure ${pace.label.toLowerCase()})` : ""}, avant le {when(p.endsAt)}.</T>
      ) : (
        <T variant="small">Atteindre {p.target} {METRICS[p.metric ?? ""] ?? p.metric}, avant le {when(p.endsAt)}.</T>
      )}
      <View style={styles.facts}>
        <T variant="caption" tone="muted">{participants > 1 ? `${participants} ${cordee ? "membres" : "participants"} déjà.` : `Un ${cordee ? "membre" : "participant"} pour l’instant.`}{cordee ? " Personne n’atteint le sommet seul." : ""}</T>
        {cordee ? <T variant="caption" tone="muted">Un jour avec {Cordee.RULE.oneLongueur} minutes d’effort confirmé apporte une longueur, {Cordee.RULE.twoLongueurs} minutes deux.</T> : null}
        {cordee && p.route === Cordee.RELAY.route ? <T variant="caption" tone="muted">Sur cette route, {Cordee.RELAY.name.charAt(0).toLowerCase() + Cordee.RELAY.name.slice(1)} se joue à deux : un membre ouvre le passage, un autre reçoit le relais un autre jour.</T> : null}
        <T variant="caption" tone="muted">Ni XP ni crédit{cordee ? " : un titre au sommet" : ""}. Tu peux quitter à tout moment.</T>
      </View>
      <T variant="caption" tone="faint">
        {cordee
          ? "En rejoignant, ton pseudo et tes longueurs sont visibles des membres qui sont tes amis et de la personne qui t’a invité ; les autres voient « Membre de la cordée »."
          : "En rejoignant, ton nom d’utilisateur et ta progression sur ce défi sont visibles des participants. Rien d’autre."}
      </T>
      <View style={styles.row}>
        <Button small label={cordee ? "S’encorder" : "Rejoindre le défi"} loading={busy} onPress={join} testID="challenge-link-join" />
        <Button small kind="ghost" label="Plus tard" disabled={busy} onPress={onDone} testID="challenge-link-later" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.s2, flexWrap: "wrap" },
  facts: { gap: space.s1 },
});
