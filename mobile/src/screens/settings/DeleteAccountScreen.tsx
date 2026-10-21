import { useState } from "react";
import { Alert, Linking, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Field } from "../../components/Field";
import { Screen } from "../../components/Screen";
import { T } from "../../components/Text";
import { deleteOwnAccount } from "../../data/api";
import { useAuth } from "../../data/auth";
import { useQueue } from "../../data/queue";
import { SUPPORT_EMAIL } from "../../lib/config";
import { errorMessage } from "../../lib/errors";
import { useOnline } from "../../lib/network";
import { cancelReminders } from "../../lib/reminders";
import { remove, ownerKey } from "../../lib/storage";
import { space } from "../../theme/tokens";

/** Account deletion from inside the app (Google Play requirement), through the same server function as the website. */
export function DeleteAccountScreen() {
  const { owner, signOut } = useAuth();
  const online = useOnline();
  const queue = useQueue();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!owner) return;
    setBusy(true);
    setError(null);
    try {
      await deleteOwnAccount();
      await cancelReminders();
      await remove(ownerKey("queue", owner));
      await signOut({ forget: true });
      Alert.alert("Compte supprimé", "Ton compte TITAN et ses données ont été supprimés. Merci d’avoir fait du sport avec TITAN.");
    } catch (e) {
      setError(`${errorMessage(e)} Si le problème persiste, écris à ${SUPPORT_EMAIL} : la suppression sera traitée à la main.`);
      setBusy(false);
    }
  }

  return (
    <Screen keyboard>
      <T variant="h2">Supprimer définitivement ton compte</T>
      <Card style={{ gap: space.s2 }}>
        <T>Cette action efface ton compte TITAN sur l’application et sur titan-app.fr :</T>
        <T variant="small">• ton profil, ton journal de séances, tes objectifs et ta progression (niveau, XP, crédits, aventure) ;</T>
        <T variant="small">• tes amitiés, moments et défis ;</T>
        <T variant="small">• les données de ce téléphone liées au compte.</T>
        <T variant="small">Elle est irréversible. Pense à exporter ton journal avant (Compte › Mes données).</T>
      </Card>
      {queue.items.length ? <T variant="small" tone="warn">{queue.items.length} séance(s) non envoyée(s) seront aussi effacées de ce téléphone.</T> : null}
      <Field label="Pour confirmer, écris SUPPRIMER" value={confirm} onChangeText={setConfirm} autoCapitalize="characters" autoCorrect={false} />
      {error ? <T variant="small" tone="err" accessibilityRole="alert">{error}</T> : null}
      <Button kind="danger" label="Supprimer mon compte" icon="trash" loading={busy} disabled={!online || confirm.trim().toUpperCase() !== "SUPPRIMER"} onPress={() => Alert.alert("Dernière confirmation", "Supprimer définitivement ton compte TITAN ?", [{ text: "Annuler", style: "cancel" }, { text: "Supprimer", style: "destructive", onPress: run }])} />
      {!online ? <T variant="caption" tone="warn">La suppression demande une connexion.</T> : null}
      <View>
        <Button kind="ghost" label="Une question avant ? Écrire à l’équipe" onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("TITAN — Suppression de compte")}`)} />
      </View>
    </Screen>
  );
}
