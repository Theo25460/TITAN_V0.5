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
import { connectGarmin, disconnectGarmin, GARMIN_CHECKING, garminFailureMessage, garminReturnMessage, readGarmin } from "../../lib/nativeConnections";

export function GarminScreen() {
  const owner = useOwner();
  const q = useQuery({ queryKey: ["garmin", owner], queryFn: () => readGarmin(owner), retry: false });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  const epoch = useRef(0);
  const awaitingReturn = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    alive.current = true;
    const generation = ++epoch.current;
    lock.current = false;
    awaitingReturn.current = false;
    setBusy(false);
    setConsent(false);
    setMessage(null);
    const current = () => alive.current && generation === epoch.current;
    let returnSequence = 0;
    const returned = (url: string | null) => {
      const notice = garminReturnMessage(url);
      if (!notice || !current()) return;
      awaitingReturn.current = false;
      setMessage(notice);
      const sequence = ++returnSequence;
      void q.refetch().then(result => {
        if (!current() || sequence !== returnSequence || notice !== GARMIN_CHECKING) return;
        setMessage(result.isError
          ? "La liaison Garmin reste à vérifier. Actualise l’état du compte."
          : result.data?.linked
            ? "La liaison Garmin est confirmée."
            : "Garmin a répondu. La liaison reste à terminer depuis TITAN.");
      });
    };
    void Linking.getInitialURL().then(returned).catch(() => {});
    const links = Linking.addEventListener("url", ({ url }) => returned(url));
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void q.refetch().then(result => {
        if (current() && awaitingReturn.current && result.data?.authorized && !result.data.linked) {
          setMessage("L’import est autorisé, mais la liaison Garmin reste à terminer. Relance la connexion. Si Garmin ouvre le site, reviens dans l’application puis actualise l’état.");
        }
      });
    });
    return () => { alive.current = false; ++epoch.current; sub.remove(); links.remove(); };
  }, [owner]);
  async function run(remove: boolean) {
    if (lock.current) return;
    const generation = epoch.current;
    const current = () => alive.current && generation === epoch.current;
    lock.current = true;
    setBusy(true);
    setMessage(null);
    try {
      if (remove) await disconnectGarmin(owner, fetch, current);
      else {
        awaitingReturn.current = true;
        await connectGarmin(owner, consent, Linking.openURL, fetch, current);
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
        <T tone="muted" testID="garmin-received">{q.data?.last_event_at ? `Dernière activité reçue : ${new Date(q.data.last_event_at).toLocaleString("fr-FR")}` : "Aucune activité reçue de Garmin pour l’instant."}</T>
        <T tone="muted" testID="garmin-integrated">{q.data?.imported ? `${q.data.imported} activité${q.data.imported > 1 ? "s" : ""} intégrée${q.data.imported > 1 ? "s" : ""} à ton journal${q.data.attached ? `, ${q.data.attached} rattachée${q.data.attached > 1 ? "s" : ""} à une séance déjà saisie` : ""}.` : "Aucune activité intégrée au journal."}</T>
      </Card>
      {!q.data?.enabled ? <T tone="warn">La connexion Garmin n’est pas encore activée pour cette version. Tu peux toujours retirer une autorisation existante.</T> : !q.data.linked ? <>
        <ToggleRow label="J’autorise l’import de mes activités Garmin dans TITAN" value={consent} onChange={setConsent} disabled={busy} />
        <Button label="Connecter Garmin" disabled={!consent} loading={busy} onPress={() => run(false)} testID="garmin-connect" />
      </> : null}
      <Button label="Retirer l’autorisation Garmin" kind="secondary" loading={busy} onPress={() => run(true)} testID="garmin-disconnect" />
    </>}
    {message ? <T accessibilityRole="alert">{message}</T> : null}
    <Button label="Actualiser l’état" kind="ghost" onPress={() => q.refetch()} />
  </Screen>;
}
