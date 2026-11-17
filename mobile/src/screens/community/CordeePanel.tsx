/* Social lot C on Android — La Grande Cordée, in Communauté > Défis. Behind the server flag screens.cordee.
   The server counts (titan_cordees_v1); the shared module words it (src/core/cordee.ts). Each card always says the common goal, my part,
   the group and what was unlocked; names follow the challenge rule. Joining needs a tap; the summit offers to wear the title and share. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Share, StyleSheet, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Alert } from "../../components/Dialog";
import { Icon } from "../../components/Icon";
import { ProgressBar } from "../../components/Progress";
import { Sheet } from "../../components/Sheet";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Cordee, type CordeePace, type CordeeRouteId, type CordeeState } from "../../core/cordee";
import * as api from "../../data/api";
import { useServerFlag } from "../../data/flags";
import { errorMessage } from "../../lib/errors";
import { challengeInviteUrl } from "../../lib/invite";
import { colors, space } from "../../theme/tokens";

export const cordeeKey = (owner: string) => ["cordees", owner] as const;
const MESSAGES: Record<string, string> = {
  FEATURE_DISABLED: "La Grande Cordée n’est pas encore ouverte sur ton compte.",
  CORDEE_LIMIT_3: "Tu mènes déjà trois cordées en cours.",
  SOCIAL_RATE_LIMIT: "Beaucoup de cordées créées aujourd’hui. Réessaie demain.",
  CORDEE_INVITEES: "Sept amis au plus : les autres peuvent rejoindre par lien.",
};
const message = (e: unknown) => {
  const raw = String((e as { message?: string })?.message ?? e ?? "");
  const k = Object.keys(MESSAGES).find((x) => raw.includes(x));
  return k ? MESSAGES[k] : errorMessage(e);
};

export function CordeePanel({ owner, online, friends }: { owner: string; online: boolean; friends: { id: string; name: string }[] }) {
  const enabled = useServerFlag("screens.cordee");
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: cordeeKey(owner), queryFn: () => api.fetchCordees(owner), enabled: enabled && online, retry: false, staleTime: 30_000 });
  const [forming, setForming] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  if (!enabled) return null;

  async function act(id: string, fn: () => Promise<unknown>, ok?: string) {
    if (!online) return toast({ kind: "warn", title: "Connexion requise", message: "La cordée demande Internet." });
    setBusy(id);
    try {
      await fn();
      if (ok) toast({ kind: "ok", title: ok });
      await qc.invalidateQueries({ queryKey: cordeeKey(owner) });
    } catch (e) {
      toast({ kind: "err", title: "Action impossible", message: message(e) });
    } finally {
      setBusy(null);
    }
  }

  const list = q.data?.cordees ?? [];
  return (
    <View style={{ gap: space.s3 }} testID="cordee-panel">
      <T variant="eyebrow" tone="accent">La Grande Cordée</T>
      <T variant="small">Une expédition à plusieurs, chacun avec son sport. 12 minutes d’effort confirmé dans la journée apportent une longueur, 35 minutes deux : la régularité compte plus que le volume.</T>
      {!online ? <T variant="small">Reconnecte-toi pour retrouver tes cordées.</T> : null}
      {q.isError ? <T variant="small">{message(q.error)}</T> : null}
      {list.map((c) => <CordeeCard key={c.id} c={c} busy={busy} act={act} owner={owner} />)}
      {online && q.isSuccess && !list.length ? <T variant="caption" tone="faint" testID="cordee-empty">Pas encore de cordée. Coureurs, grimpeurs, nageurs ou yogis : tout le monde compte pareil. Seul·e aussi, ça marche.</T> : null}
      <Button small icon="plus" label="Former une cordée" onPress={() => setForming(true)} testID="cordee-new" />
      <FormSheet visible={forming} onClose={() => setForming(false)} friends={friends} busy={busy === "create"}
        onSubmit={(p) => act("create", async () => { await api.cordeeCreate(owner, p); setForming(false); }, "Cordée formée")} />
      <T variant="caption" tone="faint">Seules les séances confirmées par TITAN comptent. Au sommet : un titre de route, jamais d’XP ni de crédit.</T>
    </View>
  );
}

function CordeeCard({ c, busy, act, owner }: { c: CordeeState; busy: string | null; act: (id: string, fn: () => Promise<unknown>, ok?: string) => Promise<unknown>; owner: string }) {
  const words = Cordee.explain(c);
  return (
    <Card style={{ gap: space.s2 }} testID={`cordee-${c.id}`}>
      <View style={styles.row}>
        <T variant="title" style={{ flex: 1 }}>{words.route.name}</T>
        <T variant="caption" tone="muted">{c.status === "summited" ? "Sommet atteint" : c.status === "ended" ? "Terminée" : `${Math.max(0, Math.ceil((new Date(c.endsAt).getTime() - Date.now()) / 86400000))} j`}</T>
      </View>
      <T variant="bodyStrong">{words.goal}</T>
      <ProgressBar value={Math.min(1, c.total / Math.max(1, c.target))} accessibilityLabel={`La cordée : ${c.total} sur ${c.target} longueurs`} />
      <View style={styles.camps} accessibilityLabel={`${c.camps} camps sur 4`}>
        {words.route.camps.map(([name], i) => (
          <View key={name} style={styles.camp}>
            <Icon name={i < c.camps ? "check" : "dot"} size={16} color={i < c.camps ? colors.cy : colors.tx3} />
            <T variant="caption" tone={i < c.camps ? "default" : "faint"}>{name}</T>
          </View>
        ))}
      </View>
      <T variant="small" testID={`cordee-mine-${c.id}`}>{words.mine}</T>
      <T variant="small" tone="muted">{words.group} {words.variety}</T>
      <T variant="small" tone={words.summited ? "ok" : "muted"}>{words.unlocked}</T>
      {words.next ? <T variant="caption" tone="faint">Prochain camp : {words.next.name} à {words.next.at} longueurs.</T> : null}
      {c.members.map((m, i) => (
        <View key={m.id ?? `m-${i}`} style={styles.row}>
          <T variant="small" style={{ flex: 1 }}>{m.me ? "Toi" : m.name}{m.status === "invited" ? " · invité" : ""}{m.families?.length ? ` · ${m.families.map((f) => Cordee.FAMILIES[f]?.label ?? f).join(", ")}` : ""}</T>
          {m.status === "joined" && m.pitches != null ? <T variant="caption" tone="muted">{m.pitches}{m.strand ? " ✓" : ""}</T> : null}
        </View>
      ))}
      {c.myStatus === "invited" && c.status === "active" ? (
        <View style={styles.row}>
          <Button small label="S’encorder" loading={busy === `j-${c.id}`} onPress={() => act(`j-${c.id}`, () => api.challengeRespond(c.id, "join"), "Tu es encordé")} testID={`cordee-join-${c.id}`} />
          <Button small kind="ghost" label="Décliner" onPress={() => act(`d-${c.id}`, () => api.challengeRespond(c.id, "decline"))} />
        </View>
      ) : c.status === "summited" && c.earned ? (
        <View style={styles.row}>
          <Button small icon="medal" label={`Porter « ${words.title} »`} loading={busy === `w-${c.id}`} onPress={() => act(`w-${c.id}`, () => api.wearTitle(owner, `cordee:${c.route}`), "Titre porté")} testID={`cordee-wear-${c.id}`} />
          <Button small kind="secondary" icon="share" label="Partager ce sommet" loading={busy === `s-${c.id}`} testID={`cordee-share-${c.id}`}
            onPress={() => act(`s-${c.id}`, () => api.momentShare({ kind: "challenge", title: `Sommet : ${words.route.name}`, detail: `En cordée à ${c.joined} · ${c.total} longueurs`, visibility: "friends" }), "Sommet partagé")} />
        </View>
      ) : c.status === "active" && c.myStatus === "joined" ? (
        <View style={styles.row}>
          {c.mine ? <Button small kind="secondary" icon="link" label="Inviter par lien" loading={busy === `k-${c.id}`} testID={`cordee-link-${c.id}`}
            onPress={() => act(`k-${c.id}`, async () => { const r = await api.challengeLinkCreate(c.id); await Share.share({ message: `Viens t’encorder avec ton sport sur TITAN : ${challengeInviteUrl(r.token)}` }).catch(() => {}); })} /> : null}
          <Button small kind="ghost" label="Quitter la cordée" onPress={() => Alert.alert("Quitter la cordée ?", "Tes longueurs ne compteront plus, et l’objectif commun diminue de ta part.", [{ text: "Annuler", style: "cancel" }, { text: "Quitter", style: "destructive", onPress: () => act(`l-${c.id}`, () => api.challengeRespond(c.id, "leave")) }])} />
        </View>
      ) : null}
    </Card>
  );
}

function FormSheet({ visible, onClose, friends, busy, onSubmit }: { visible: boolean; onClose: () => void; friends: { id: string; name: string }[]; busy: boolean; onSubmit: (p: { route: CordeeRouteId; pace: CordeePace; days: number; invitees: string[] }) => void }) {
  const [route, setRoute] = useState<CordeeRouteId>("aube");
  const [pace, setPace] = useState<CordeePace>("reguliere");
  const [days, setDays] = useState(14);
  const [invitees, setInvitees] = useState<string[]>([]);
  const share = Cordee.share(pace, days);
  const toggle = (id: string) => setInvitees((v) => (v.includes(id) ? v.filter((x) => x !== id) : v.length >= 7 ? v : [...v, id]));
  return (
    <Sheet visible={visible} onClose={onClose} title="Former une cordée" footer={<Button label="Former la cordée" loading={busy} onPress={() => onSubmit({ route, pace, days, invitees })} testID="cordee-submit" />}>
      <T variant="bodyStrong">Route</T>
      <View style={styles.wrap}>{Object.values(Cordee.ROUTES).map((r) => <Chip key={r.id} label={r.name} selected={route === r.id} onPress={() => setRoute(r.id)} testID={`cordee-route-${r.id}`} />)}</View>
      <T variant="caption" tone="muted">{Cordee.ROUTES[route].intro}</T>
      <T variant="bodyStrong">Allure</T>
      <View style={styles.wrap}>{Object.values(Cordee.PACES).map((p) => <Chip key={p.id} label={p.label} selected={pace === p.id} onPress={() => setPace(p.id)} testID={`cordee-pace-${p.id}`} />)}</View>
      <T variant="caption" tone="muted">{Cordee.PACES[pace].text}</T>
      <T variant="bodyStrong">Durée</T>
      <View style={styles.wrap}>{Cordee.DAYS.map((d) => <Chip key={d} label={`${d} jours`} selected={days === d} onPress={() => setDays(d)} testID={`cordee-days-${d}`} />)}</View>
      <T variant="caption" tone="faint" testID="cordee-preview">Chaque membre encordé ajoute {share} longueurs à l’objectif commun ; la part de chacun compte jusqu’à {Cordee.cap(share)}.</T>
      <T variant="bodyStrong">Inviter des amis</T>
      {friends.length ? <View style={styles.wrap}>{friends.map((f) => <Chip key={f.id} label={f.name} selected={invitees.includes(f.id)} onPress={() => toggle(f.id)} testID={`cordee-invite-${f.id}`} />)}</View>
        : <T variant="caption" tone="faint">Tu pourras inviter par lien une fois la cordée formée.</T>}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.s2, flexWrap: "wrap" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
  camps: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
  camp: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: "45%" },
});
