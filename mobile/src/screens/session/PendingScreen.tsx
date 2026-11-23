import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { View } from "react-native";
import { Alert } from "../../components/Dialog";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Screen } from "../../components/Screen";
import { EmptyState } from "../../components/States";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Format, Sports, SyncState } from "../../core";
import { useOwner } from "../../data/auth";
import { syncNow } from "../../data/hooks";
import { discard, retryItem, useQueue } from "../../data/queue";
import { useOnline } from "../../lib/network";
import type { RootParams } from "../../navigation/types";
import { colors, space } from "../../theme/tokens";

/** Sessions kept on this phone and not confirmed by the server yet. Nothing disappears silently. */
export function PendingScreen() {
  const owner = useOwner();
  const qc = useQueryClient();
  const queue = useQueue();
  const online = useOnline();
  const toast = useToast();
  const navigation = useNavigation<NativeStackNavigationProp<RootParams>>();
  const items = queue.items;

  async function sendAll() {
    for (const i of items) if (i.status === "error") await retryItem(owner, i.key);
    const r = await syncNow(qc, owner);
    toast(r.remaining ? { kind: "warn", title: `${Format.plural(r.sent, "envoyée", "envoyées")}, ${Format.plural(r.remaining, "restante", "restantes")}` } : { kind: "ok", title: "Toutes les séances sont synchronisées" });
  }

  return (
    <Screen>
      {!items.length ? (
        <EmptyState icon="cloud" title="Tout est synchronisé" text="Aucune séance n’attend d’être envoyée depuis ce téléphone." />
      ) : (
        <>
          <T tone="muted">Ces séances sont enregistrées sur ce téléphone. Elles partent automatiquement dès que la connexion le permet.</T>
          <Button label={queue.sending ? "Envoi en cours…" : "Envoyer maintenant"} icon="upload" loading={queue.sending} disabled={!online} onPress={sendAll} />
          {!online ? <T variant="caption" tone="warn">Hors ligne : l’envoi reprendra au retour du réseau.</T> : null}
          {items.map((i) => {
            // V1.6.1: the state, the last attempt and the recovery in the words of the session sheet and of the website.
            const view = SyncState.describe({ item: i, sending: queue.sending, online });
            const canCorrect = view.actions.some((a) => a.id === "correct");
            return (
            <Card key={i.key} style={{ gap: space.s2 }} testID={`pending-${i.payload.details.client_event_id}`}>
              <View style={{ flexDirection: "row", gap: space.s3, alignItems: "center" }}>
                <Icon name={i.status === "error" ? "alert" : "offline"} color={i.status === "error" ? colors.err : colors.warn} />
                <View style={{ flex: 1 }}>
                  <T variant="bodyStrong">{Sports.label(i.payload.sport)}</T>
                  <T variant="caption" tone="faint">
                    {Format.longDate(i.payload.date)} · {Format.number(i.payload.val, 1)} {i.payload.unit}
                  </T>
                </View>
              </View>
              <T variant="small" tone={view.tone}>{view.label}</T>
              {view.facts.filter((f) => f.label !== "Référence").map((f) => <T key={f.label} variant="caption" tone={f.label.startsWith("Motif") && i.status === "error" ? "err" : "muted"}>{f.label} : {f.value}</T>)}
              {canCorrect ? <Button small kind="primary" icon="edit" label="Corriger et renvoyer" onPress={() => navigation.navigate("SessionForm", { sport: i.payload.sport, duplicateOf: i.payload.details.client_event_id!, replaces: i.key })} testID="pending-correct" /> : null}
              <View style={{ flexDirection: "row", gap: space.s2 }}>
                {i.status === "error" && !canCorrect ? <Button small kind="secondary" label="Réessayer" style={{ flex: 1 }} onPress={() => retryItem(owner, i.key).then(() => syncNow(qc, owner))} /> : null}
                <Button
                  small
                  kind="danger"
                  label="Supprimer"
                  style={{ flex: 1 }}
                  // While the queue is sending, this item may already be on its way: deleting it here would not stop the server
                  // from recording it, and the athlete would believe it gone.
                  disabled={queue.sending}
                  onPress={() =>
                    Alert.alert("Supprimer cette séance ?", "Elle n’a pas été envoyée : elle disparaîtra définitivement de ce téléphone.", [
                      { text: "Garder", style: "cancel" },
                      { text: "Supprimer", style: "destructive", onPress: () => discard(owner, i.key) },
                    ])
                  }
                />
              </View>
            </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}
