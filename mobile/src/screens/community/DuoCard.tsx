import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { StyleSheet } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Alert } from "../../components/Dialog";
import { Icon } from "../../components/Icon";
import { Tap } from "../../components/Pressable";
import { ProgressBar } from "../../components/Progress";
import { Sheet } from "../../components/Sheet";
import { T } from "../../components/Text";
import * as api from "../../data/api";
import { errorMessage } from "../../lib/errors";
import { colors, space, TOUCH } from "../../theme/tokens";

export const duoKey = (owner: string) => ["duo", owner] as const;

export function DuoCard({ owner, online }: { owner: string; online: boolean }) {
  const q = useQuery({ queryKey: duoKey(owner), queryFn: () => api.fetchDuo(owner), enabled: online, networkMode: "online", retry: false, staleTime: 0, gcTime: 0 });
  const [choosing, setChoosing] = useState(false);
  const [friend, setFriend] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  const data = q.data;

  async function act(action: () => Promise<unknown>) {
    if (inFlight.current || !online) return;
    inFlight.current = true;
    setBusy(true);
    setNotice("");
    try {
      await action();
      setChoosing(false);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      await q.refetch();
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (!data) return null;
  if (!online || q.isError || (q.isFetching && !busy)) return (
    <Card style={styles.card}>
      <T variant="h3">TITAN Duo</T>
      <T variant="small">{!online ? "Reconnecte-toi pour retrouver ton expédition." : q.isError ? "L’état de ton expédition n’a pas pu être vérifié." : "Vérification de ton expédition…"}</T>
      {online && q.isError ? <Button small kind="secondary" label="Actualiser" onPress={() => q.refetch()} /> : null}
    </Card>
  );

  return (
    <Card style={styles.card}>
      <T variant="h3">TITAN Duo</T>
      {data.status === "none" ? (
        <>
          <T variant="small">{data.friends.length ? "Propose une expédition de 14 jours à un ami et avancez à votre rythme. Chacun peut arrêter quand il veut." : "Quand un ami sera disponible, tu pourras lui proposer une expédition de 14 jours."}</T>
          {data.friends.length ? <Button small label="Choisir un ami" disabled={busy} onPress={() => { setFriend(null); setNotice(""); setChoosing(true); }} /> : null}
          <Sheet visible={choosing} onClose={() => setChoosing(false)} title="Choisir un ami" footer={<Button label="Envoyer l’invitation" loading={busy} disabled={!friend || !data.friends.some((item) => item.id === friend)} onPress={() => friend ? act(() => api.duoInvite(owner, friend)) : undefined} />}>
            <T variant="small">Ton ami pourra accepter ou refuser. L’expédition de 14 jours commence seulement après son accord.</T>
            {data.friends.map((item) => (
              <Tap key={item.id} style={styles.choice} accessibilityRole="radio" accessibilityLabel={item.name} accessibilityState={{ checked: friend === item.id, disabled: busy }} disabled={busy} onPress={() => setFriend(item.id)}>
                <Icon name={friend === item.id ? "check" : "user"} color={friend === item.id ? colors.cy : colors.tx3} size={18} />
                <T variant="bodyStrong" style={styles.choiceLabel}>{item.name}</T>
              </Tap>
            ))}
            {notice ? <T variant="small" accessibilityLiveRegion="polite">{notice}</T> : null}
          </Sheet>
        </>
      ) : data.status === "pending" && data.role === "invitee" ? (
        <>
          <T>{data.partner.name} te propose une expédition à deux pendant 14 jours. Tu peux refuser ou arrêter quand tu veux.</T>
          <Button small label="Accepter l’expédition" disabled={busy} onPress={() => act(() => api.duoRespond(owner, data.id, true))} />
          <Button small kind="secondary" label="Refuser l’expédition" disabled={busy} onPress={() => act(() => api.duoRespond(owner, data.id, false))} />
        </>
      ) : data.status === "pending" ? (
        <>
          <T>Invitation envoyée à {data.partner.name}. Elle attend sa réponse.</T>
          <Button small kind="secondary" label="Annuler l’invitation" disabled={busy} onPress={() => act(() => api.duoEnd(owner, data.id))} />
        </>
      ) : (
        <>
          <T variant="bodyStrong">Expédition avec {data.partner.name}</T>
          <T variant="small">{data.daysLeft} jour{data.daysLeft > 1 ? "s restants" : " restant"}</T>
          <ProgressBar value={data.together / Math.max(1, data.target)} accessibilityLabel="Jours actifs à deux" />
          <T variant="small">{data.together} / {data.target} jours actifs à deux · toi {data.myDays}, {data.partner.name} {data.partnerDays}</T>
          {data.together >= data.target ? <T variant="small" tone="ok">Objectif commun atteint.</T> : null}
          {data.nudgesReceived > 0 ? <T variant="small">{data.partner.name} t’a encouragé{data.nudgesReceived > 1 ? ` ${data.nudgesReceived} fois` : ""}.</T> : null}
          <Button small label={data.nudgedToday ? "Encouragement envoyé" : `Encourager ${data.partner.name}`} disabled={busy || data.nudgedToday} onPress={() => act(() => api.duoNudge(owner, data.id))} />
          <Button small kind="secondary" label="Arrêter l’expédition" disabled={busy} onPress={() => Alert.alert("Arrêter l’expédition ?", "L’expédition s’arrête pour vous deux. Le partage de vos jours actifs prend fin.", [{ text: "Annuler", style: "cancel" }, { text: "Arrêter", style: "destructive", onPress: () => act(() => api.duoEnd(owner, data.id)) }])} />
        </>
      )}
      {!choosing && notice ? <T variant="small" accessibilityLiveRegion="polite">{notice}</T> : null}
      <T variant="small">Tous les sports comptent. Un jour actif par personne et par jour, confirmé par TITAN. Vos jours actifs s’additionnent.</T>
      <T variant="caption">Seul le total de jours actifs est partagé avec ton ami. Aucun XP ni crédit à gagner.</T>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.s2 },
  choice: { minHeight: TOUCH, flexDirection: "row", alignItems: "center", gap: space.s2, paddingHorizontal: space.s3 },
  choiceLabel: { flex: 1 },
});
