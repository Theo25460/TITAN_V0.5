/* AUD-40: « Lettres à moi-même » — write to the athlete you will be in 3, 6 or 12 months. TITAN keeps the letter, hides it until its
   date, then shows it with your practice then and now. A local notification is scheduled for the delivery morning (if allowed). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Field } from "../../components/Field";
import { Screen } from "../../components/Screen";
import { Section } from "../../components/Section";
import { EmptyState, ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import * as api from "../../data/api";
import { useOwner } from "../../data/auth";
import { errorMessage } from "../../lib/errors";
import { useOnline } from "../../lib/network";
import { ACCENT, CHANNELS, ensureChannels } from "../../lib/notificationChannels";
import { space } from "../../theme/tokens";

export const capsulesKey = (owner: string) => ["capsules", owner] as const;
const longDate = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export function useCapsules() {
  const owner = useOwner();
  return useQuery({ queryKey: capsulesKey(owner), queryFn: () => api.fetchCapsules(owner), staleTime: 5 * 60_000 });
}

async function notifyOn(deliverOn: string) {
  try {
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    await ensureChannels();
    const at = new Date(`${deliverOn}T09:00:00`);
    if (at.getTime() <= Date.now()) return;
    await Notifications.scheduleNotificationAsync({
      content: { title: "Une lettre de toi est arrivée", body: "Écrite il y a quelques mois, elle t’attend dans TITAN.", data: { url: "titan://capsules" }, color: ACCENT },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNELS.recap.id },
    });
  } catch {
    // The letter is kept by the server either way; the QG shows it on its date.
  }
}

/** « then / now » in one honest line. */
export function thenNow(then: api.Practice, now: api.Practice): string {
  const h = (m: number) => (m >= 90 ? `${Math.round(m / 60)} h` : `${m} min`);
  return `À l’époque : ${then.days} jour${then.days > 1 ? "s" : ""} actif${then.days > 1 ? "s" : ""} et ${h(then.minutes)} d’effort sur 30 jours. Aujourd’hui : ${now.days} jour${now.days > 1 ? "s" : ""} et ${h(now.minutes)}.`;
}

export function CapsuleScreen() {
  const owner = useOwner();
  const q = useCapsules();
  const qc = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const [message, setMessage] = useState("");
  const [months, setMonths] = useState<3 | 6 | 12>(6);
  const [openedNow, setOpenedNow] = useState<string | null>(null);
  const write = useMutation({
    mutationFn: async () => {
      if (!online) throw new Error("Connexion requise pour confier ta lettre à TITAN.");
      return api.capsuleCreate(owner, message.trim(), months);
    },
    onSuccess: async (r) => {
      setMessage("");
      toast({ kind: "ok", title: "Lettre scellée", message: `Elle arrivera le ${longDate(r.deliverOn)}.` });
      await notifyOn(r.deliverOn);
      qc.invalidateQueries({ queryKey: capsulesKey(owner) });
    },
    onError: (e) => toast({ kind: "err", title: "Lettre non envoyée", message: errorMessage(e) }),
  });
  const open = useMutation({
    mutationFn: (id: string) => api.capsuleOpen(owner, id),
    onSuccess: (_r, id) => {
      setOpenedNow(id);
      qc.invalidateQueries({ queryKey: capsulesKey(owner) });
    },
  });
  if (q.isLoading && !q.data) return <Screen><LoadingCards /></Screen>;
  if (!q.data) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const { delivered, waiting } = q.data;
  return (
    <Screen>
      <T tone="muted">Écris à l’athlète que tu seras dans quelques mois : tes objectifs, ce que tu ressens, ce que tu veux te rappeler. TITAN garde ta lettre secrète jusqu’à sa date, puis te la remet avec ta pratique d’alors et d’aujourd’hui.</T>
      <Card style={{ gap: space.s3 }}>
        <Field label="Ma lettre" value={message} onChangeText={(v) => setMessage(v.slice(0, 500))} multiline placeholder="Dans six mois, j’espère que…" style={{ minHeight: 110, textAlignVertical: "top" }} hint={`${message.length}/500`} testID="capsule-message" />
        <View style={{ flexDirection: "row", gap: 6 }}>
          {([3, 6, 12] as const).map((m) => (
            <Chip key={m} label={m === 12 ? "Dans 1 an" : `Dans ${m} mois`} selected={months === m} onPress={() => setMonths(m)} />
          ))}
        </View>
        <Button label="Sceller ma lettre" icon="send" loading={write.isPending} disabled={!message.trim() || !online} onPress={() => write.mutate()} testID="capsule-send" />
      </Card>

      {delivered.length ? (
        <Section title="Lettres arrivées">
          {delivered.map((c) => (
            <Card key={c.id} tone={c.opened ? undefined : "amber"} style={{ gap: space.s2 }} testID={`capsule-${c.id}`}>
              <T variant="eyebrow" tone="amber">Écrite le {longDate(c.writtenOn)}</T>
              {c.opened || openedNow === c.id ? (
                <>
                  <T variant="body">« {c.message} »</T>
                  <T variant="small" tone="muted">{thenNow(c.then, c.now)}</T>
                </>
              ) : (
                <Button label="Ouvrir ma lettre" kind="secondary" loading={open.isPending} onPress={() => open.mutate(c.id)} testID={`capsule-open-${c.id}`} />
              )}
            </Card>
          ))}
        </Section>
      ) : null}

      <Section title="En chemin">
        {waiting.length ? (
          waiting.map((c) => (
            <T key={c.id} variant="small">✉︎ Arrivera le {longDate(c.deliverOn)}</T>
          ))
        ) : (
          <EmptyState icon="send" title="Aucune lettre en chemin" text="Une lettre écrite aujourd’hui, c’est un rendez-vous avec toi-même dans quelques mois." />
        )}
      </Section>
      <T variant="caption" tone="faint">Tes lettres sont privées : personne d’autre ne peut les lire. Elles sont incluses dans l’export de tes données et supprimées avec ton compte.</T>
    </Screen>
  );
}

/** QG: a letter whose date has come and that is not opened yet. */
export function CapsuleArrivedCard({ onPress }: { onPress: () => void }) {
  const q = useCapsules();
  const waiting = q.data?.delivered.filter((c) => !c.opened) ?? [];
  if (!waiting.length) return null;
  return (
    <Card tone="amber" onPress={onPress} accessibilityLabel="Une lettre de toi est arrivée. L’ouvrir." testID="qg-capsule">
      <T variant="eyebrow" tone="amber">Lettre à moi-même</T>
      <T variant="bodyStrong">Une lettre écrite le {longDate(waiting[0].writtenOn)} t’attend.</T>
    </Card>
  );
}
