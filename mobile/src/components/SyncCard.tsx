/* V1.6.1 — « Synchronisation » block of the session sheet: the state this phone really holds (its durable queue item, or the confirmed
   server row), the last attempt and the action that recovers it. Same words as the website journal (src/core/web/sync-state.js). */
import { useQueryClient } from "@tanstack/react-query";
import { View } from "react-native";
import { SyncState, type SyncActionId } from "../core";
import type { TrainingLog } from "../core/types";
import { useOwner } from "../data/auth";
import { syncNow } from "../data/hooks";
import { discard, retryItem, useQueue, type QueueItem } from "../data/queue";
import { useOnline } from "../lib/network";
import { space } from "../theme/tokens";
import { Button } from "./Button";
import { Card } from "./Card";
import { Alert } from "./Dialog";
import { T } from "./Text";
import { useToast } from "./Toast";

const KIND: Record<SyncActionId, "secondary" | "primary" | "ghost" | "danger"> = { send: "secondary", correct: "primary", discard: "ghost", export: "ghost" };
const ICON = { send: "upload", correct: "edit", discard: "trash", export: "download" } as const;

export function useSyncView(log: TrainingLog) {
  const queue = useQueue();
  const online = useOnline();
  const owner = useOwner();
  const eventId = log.client_event_id || log.details?.client_event_id || log.id;
  const item: QueueItem | null = queue.owner === owner ? queue.items.find((i) => i.payload.details.client_event_id === eventId) ?? null : null;
  return { view: SyncState.describe({ log, item, sending: queue.sending, online }), item, sending: queue.sending, online };
}

export function SyncCard({ log, onCorrect, onRemoved }: { log: TrainingLog; onCorrect: (item: QueueItem) => void; onRemoved: () => void }) {
  const owner = useOwner();
  const qc = useQueryClient();
  const toast = useToast();
  const { view, item, sending, online } = useSyncView(log);

  async function act(id: SyncActionId) {
    if (id === "correct" && item) return onCorrect(item);
    if (id === "discard" && item)
      return Alert.alert("Retirer cette séance de ce téléphone ?", "Le serveur l’a refusée : elle n’est ni dans ton compte ni récompensée. Elle disparaîtra définitivement de ce téléphone.", [
        { text: "Garder", style: "cancel" },
        { text: "Retirer", style: "destructive", onPress: () => void discard(owner, item.key).then(onRemoved) },
      ]);
    if (id === "send") {
      if (item?.status === "error") await retryItem(owner, item.key);
      const r = await syncNow(qc, owner).catch(() => null);
      toast(r && !r.remaining ? { kind: "ok", title: "Séance confirmée dans ton compte", message: "Tu la retrouves sur le site et sur tes autres appareils." } : { kind: "warn", title: "Envoi incomplet", message: "Elle reste enregistrée sur ce téléphone et repartira automatiquement." });
    }
  }

  return (
    <Card tone="flat" style={{ gap: space.s2 }} testID="sync-card" accessibilityLabel={`Synchronisation : ${view.label}`}>
      <T variant="eyebrow" tone="faint">
        Synchronisation
      </T>
      <T variant="bodyStrong" tone={view.tone} testID="sync-state">
        {view.label}
      </T>
      <T variant="small">{view.text}</T>
      {view.facts.map((f) => (
        <View key={f.label} style={{ flexDirection: "row", gap: space.s2 }}>
          <T variant="caption" tone="muted" style={{ flex: 1 }}>
            {f.label}
          </T>
          <T variant="caption" tone="default" style={{ flex: 1.4 }}>
            {f.value}
          </T>
        </View>
      ))}
      {view.actions.length ? (
        <View style={{ gap: space.s2 }}>
          {view.actions.map((a) => (
            <Button key={a.id} small kind={KIND[a.id]} icon={ICON[a.id]} label={a.label} disabled={a.id === "send" && (!online || sending)} loading={a.id === "send" && sending} onPress={() => act(a.id)} testID={`sync-${a.id}`} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}
