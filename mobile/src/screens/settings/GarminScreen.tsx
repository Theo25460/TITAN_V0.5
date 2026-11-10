import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { ToggleRow } from "../../components/Toggle";
import { useOwner } from "../../data/auth";
import { completeGarmin, connectGarmin, disconnectGarmin, GARMIN_CHECKING, garminFailureMessage, parseGarminReturn, readGarmin } from "../../lib/nativeConnections";

export function GarminScreen() {
  const owner = useOwner();
  const q = useQuery({ queryKey: ["garmin", owner], queryFn: () => readGarmin(owner), retry: false });
  const [consent, setConsent] = useState(false);
  const [dailyConsent, setDailyConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  const epoch = useRef(0);
  const awaitingReturn = useRef(false);
  const completion = useRef<AbortController | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    alive.current = true;
    const generation = ++epoch.current;
    lock.current = false;
    awaitingReturn.current = false;
    setBusy(false);
    setConsent(false);
    setDailyConsent(false);
    setMessage(null);
    const current = () => alive.current && generation === epoch.current;
    let returnSequence = 0;
    let lastHandoff: string | null = null;
    const returned = async (url: string | null) => {
      const receipt = parseGarminReturn(url);
      if (!receipt || !current() || (receipt.handoff && receipt.handoff === lastHandoff)) return;
      awaitingReturn.current = false;
      let notice = receipt.notice;
      setMessage(notice);
      const sequence = ++returnSequence;
      if (receipt.handoff) {
        lastHandoff = receipt.handoff;
        completion.current?.abort();
        const attempt = new AbortController();
        completion.current = attempt;
        try { notice = await completeGarmin(owner, receipt.handoff, fetch, current, attempt.signal); }
        catch (error) { notice = garminFailureMessage(error); }
        finally { if (completion.current === attempt) completion.current = null; }
        if (!current() || sequence !== returnSequence || attempt.signal.aborted) return;
        setMessage(notice);
      }
      const result = await q.refetch();
      if (!current() || sequence !== returnSequence || notice !== GARMIN_CHECKING) return;
      setMessage(result.isError
        ? "La liaison Garmin reste à vérifier. Actualise l’état du compte."
        : result.data?.linked
          ? "La liaison Garmin est confirmée."
          : "Garmin a répondu. La liaison reste à terminer depuis TITAN.");
    };
    void Linking.getInitialURL().then(returned).catch(() => {});
    const links = Linking.addEventListener("url", ({ url }) => { void returned(url); });
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void q.refetch().then(result => {
        if (current() && awaitingReturn.current && result.data?.authorized && !result.data.linked) {
          setMessage("L’import est autorisé, mais la liaison Garmin reste à terminer. Relance la connexion. Si Garmin ouvre le site, reviens dans l’application puis actualise l’état.");
        }
      });
    });
    return () => { alive.current = false; ++epoch.current; completion.current?.abort(); sub.remove(); links.remove(); };
  }, [owner]);
  async function run(remove: boolean, dailies = false) {
    if (lock.current) return;
    const generation = epoch.current;
    const current = () => alive.current && generation === epoch.current;
    lock.current = true;
    setBusy(true);
    setMessage(null);
    try {
      completion.current?.abort();
      if (remove) await disconnectGarmin(owner, fetch, current);
      else {
        awaitingReturn.current = true;
        await connectGarmin(owner, consent, Linking.openURL, fetch, current, dailies);
      }
      if (!current()) return;
      if (remove || awaitingReturn.current) {
        setMessage(remove ? "L’autorisation Garmin a été retirée dans TITAN. Les séances déjà importées restent dans ton journal." : "Termine l’autorisation chez Garmin, puis reviens ici et actualise.");
      }
      await q.refetch();
    } catch (error) {
      if (current()) { awaitingReturn.current = false; setMessage(garminFailureMessage(error)); }
    } finally {
      if (current()) { lock.current = false; setBusy(false); }
    }
  }
  return <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
    <T tone="muted">Tes activités peuvent rejoindre ton journal après ton autorisation. Les pas seuls ne donnent pas d’XP. Les doublons sont contrôlés côté serveur.</T>
    {q.isLoading ? <LoadingCards count={1} /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} title="Garmin indisponible" /> : <>
      <Card testID="garmin-states" style={{ gap: 6 }}>
        <T variant="bodyStrong">{q.data?.linked ? "Compte Garmin connecté" : q.data?.authorized ? "Autorisé, liaison à terminer" : "Aucun compte Garmin connecté"}</T>
        <T tone="muted" testID="garmin-authorized">Autorisation : {q.data?.authorized ? "donnée" : "non donnée"}</T>
        {q.data?.dailiesEnabled && q.data.linked ? <T tone="muted">Pas Garmin : {q.data.dailies_authorized ? "autorisés" : "non autorisés"}</T> : null}
        <T tone="muted" testID="garmin-received">{q.data?.last_event_at ? `Dernière activité reçue : ${new Date(q.data.last_event_at).toLocaleString("fr-FR")}` : "Aucune activité reçue de Garmin pour l’instant."}</T>
        <T tone="muted" testID="garmin-integrated">{q.data?.imported ? `${q.data.imported} activité${q.data.imported > 1 ? "s" : ""} intégrée${q.data.imported > 1 ? "s" : ""} à ton journal${q.data.attached ? `, ${q.data.attached} rattachée${q.data.attached > 1 ? "s" : ""} à une séance déjà saisie` : ""}.` : "Aucune activité intégrée au journal."}</T>
      </Card>
      {!q.data?.enabled ? <T tone="warn">La connexion Garmin n’est pas encore activée pour cette version. Tu peux toujours retirer une autorisation existante.</T> : !q.data.linked ? <>
        <ToggleRow label="J’autorise l’import de mes activités Garmin dans TITAN" value={consent} onChange={setConsent} disabled={busy} />
        {q.data.dailiesEnabled ? <ToggleRow label="J’autorise aussi le total quotidien de mes pas pour les Sentiers du Titan" value={dailyConsent} onChange={setDailyConsent} disabled={busy} /> : null}
        <Button label="Connecter Garmin" disabled={!consent} loading={busy} onPress={() => run(false, q.data.dailiesEnabled && dailyConsent)} testID="garmin-connect" />
      </> : null}
      {q.data?.enabled && q.data.dailiesEnabled && !q.data.dailies_authorized ? <>
        <T tone="muted">Si tu l’autorises chez Garmin, seul ton total de pas par jour alimente les Sentiers du Titan. Tu peux retirer ce partage dans Garmin Connect.</T>
        {q.data.linked && q.data.authorized ? <Button label="Autoriser les pas Garmin" kind="secondary" loading={busy} onPress={() => run(false, true)} /> : null}
      </> : null}
      <Button label="Retirer l’autorisation Garmin" kind="secondary" loading={busy} onPress={() => run(true)} testID="garmin-disconnect" />
    </>}
    {message ? <T accessibilityRole="alert">{message}</T> : null}
    <Button label="Actualiser l’état" kind="ghost" onPress={() => q.refetch()} />
  </Screen>;
}
