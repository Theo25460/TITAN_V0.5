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
import { connectGarmin, disconnectGarmin, readGarmin } from "../../lib/nativeConnections";

export function GarminScreen() {
  const owner = useOwner();
  const q = useQuery({ queryKey: ["garmin", owner], queryFn: () => readGarmin(owner), retry: false });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    alive.current = true;
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") q.refetch(); });
    return () => { alive.current = false; sub.remove(); };
  }, [owner]);
  async function run(remove: boolean) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage(null);
    try {
      if (remove) await disconnectGarmin(owner, fetch, () => alive.current);
      else await connectGarmin(owner, consent, Linking.openURL, fetch, () => alive.current);
      if (!alive.current) return;
      setMessage(remove ? "L’autorisation Garmin a été retirée dans TITAN. Les séances déjà importées restent dans ton journal." : "Termine l’autorisation chez Garmin, puis reviens ici et actualise. Aucun import n’est annoncé avant réception réelle.");
      await q.refetch();
    } catch {
      if (alive.current) setMessage("La demande n’a pas été confirmée. Garmin peut être indisponible ou non activé. Actualise avant de réessayer.");
    } finally { lock.current = false; if (alive.current) setBusy(false); }
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
