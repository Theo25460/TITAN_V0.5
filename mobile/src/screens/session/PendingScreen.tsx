import { useQueryClient } from "@tanstack/react-query";
import { Alert, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Screen } from "../../components/Screen";
import { EmptyState } from "../../components/States";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Format, Sports } from "../../core";
import { useOwner } from "../../data/auth";
import { syncNow } from "../../data/hooks";
import { discard, retryItem, useQueue } from "../../data/queue";
import { useOnline } from "../../lib/network";
import { colors, space } from "../../theme/tokens";

/** Sessions kept on this phone and not confirmed by the server yet. Nothing disappears silently. */
export function PendingScreen() {
  const owner = useOwner();
  const qc = useQueryClient();
  const queue = useQueue();
  const online = useOnline();
  const toast = useToast();
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
          {items.map((i) => (
            <Card key={i.key} style={{ gap: space.s2 }}>
              <View style={{ flexDirection: "row", gap: space.s3, alignItems: "center" }}>
                <Icon name={i.status === "error" ? "alert" : "offline"} color={i.status === "error" ? colors.err : colors.warn} />
                <View style={{ flex: 1 }}>
                  <T variant="bodyStrong">{Sports.label(i.payload.sport)}</T>
                  <T variant="caption" tone="faint">
                    {Format.longDate(i.payload.date)} · {Format.number(i.payload.val, 1)} {i.payload.unit}
                  </T>
                </View>
              </View>
              {i.reason ? <T variant="small" tone={i.status === "error" ? "err" : "muted"}>{i.reason}</T> : null}
              <View style={{ flexDirection: "row", gap: space.s2 }}>
                {i.status === "error" ? <Button small kind="secondary" label="Réessayer" style={{ flex: 1 }} onPress={() => retryItem(owner, i.key).then(() => syncNow(qc, owner))} /> : null}
                <Button
                  small
                  kind="danger"
                  label="Supprimer"
                  style={{ flex: 1 }}
                  onPress={() =>
                    Alert.alert("Supprimer cette séance ?", "Elle n’a pas été envoyée : elle disparaîtra définitivement de ce téléphone.", [
                      { text: "Garder", style: "cancel" },
                      { text: "Supprimer", style: "destructive", onPress: () => discard(owner, i.key) },
                    ])
                  }
                />
              </View>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
