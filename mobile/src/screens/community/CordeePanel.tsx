/* Social lot C on Android — La Grande Cordée, in Communauté > Défis. Behind the server flag screens.cordee.
   The server counts (titan_cordees_v1); the shared module words it (src/core/cordee.ts). Each card always says the common goal, my part,
   the group and what was unlocked; names follow the challenge rule. Joining needs a tap; the summit offers to wear the title and share. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
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
import { Cordee, type CordeePace, type CordeeRouteId, type CordeeState, type CordeeTurn } from "../../core/cordee";
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
  const relay = Cordee.relayMessage(e);
  if (relay) return relay;
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
      // A refusal often means the cordée moved on (another member took the relay first): read it again, as the website does.
      await qc.invalidateQueries({ queryKey: cordeeKey(owner) }).catch(() => {});
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
      {words.kept ? <T variant="small" tone="muted" testID={`cordee-kept-${c.id}`}>{words.kept}</T> : null}
      {words.together ? <T variant="small" testID={`cordee-alone-${c.id}`}>{words.together}</T> : null}
      <T variant="small" tone={words.summited ? "ok" : "muted"}>{words.unlocked}</T>
      {words.next ? <T variant="caption" tone="faint">Prochain camp : {words.next.name} à {words.next.at} longueurs.</T> : null}
      {c.members.map((m, i) => (
        <View key={m.id ?? `m-${i}`} style={styles.row}>
          <T variant="small" style={{ flex: 1 }}>{m.me ? "Toi" : m.name}{m.status === "invited" ? " · invité" : ""}{m.families?.length ? ` · ${m.families.map((f) => Cordee.FAMILIES[f]?.label ?? f).join(", ")}` : ""}</T>
          {m.status === "joined" && m.pitches != null ? <T variant="caption" tone="muted">{m.pitches}{m.strand ? " ✓" : ""}</T> : null}
        </View>
      ))}
      <RelayStep c={c} busy={busy} act={act} owner={owner} />
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
          <Button small kind="ghost" label="Quitter la cordée" testID={`cordee-leave-${c.id}`} onPress={() => Alert.alert("Quitter la cordée ?", Cordee.LEAVE, [{ text: "Annuler", style: "cancel" }, { text: "Quitter", style: "destructive", onPress: () => act(`l-${c.id}`, () => api.challengeRespond(c.id, "leave")) }])} />
        </View>
      ) : null}
    </Card>
  );
}

/* V1.8.1 — the relay step of the pilot route: the shared state, what I can do, how the others contribute. Only the button the server
   offers (relay.can) is shown, so the member who opened the passage is never offered to receive it. No session detail is shown. */
function RelayStep({ c, busy, act, owner }: { c: CordeeState; busy: string | null; act: (id: string, fn: () => Promise<unknown>, ok?: string) => Promise<unknown>; owner: string }) {
  const toast = useToast();
  const lock = useRef(false); // a double tap sends one call
  const [handing, setHanding] = useState(false);
  const r = Cordee.relay(c);
  if (!r) return null;
  const key = `r-${c.id}`;
  /* V1.8.2 — the optional turns: take, hand over (sheet), withdraw, accept. Only those the server offers (relay.turn). */
  const turn = (action: CordeeTurn, to: string | null = null) => {
    if (lock.current) return;
    lock.current = true;
    act(key, async () => {
      const answer = await api.cordeeRelayTurn(owner, c.id, action, to);
      const words = Cordee.turnResult(answer, action);
      toast({ kind: "ok", title: words.title, message: words.message });
      if (action === "handover") setHanding(false);
    }).finally(() => { lock.current = false; });
  };
  return (
    <View style={styles.relay} testID={`cordee-relay-${c.id}`} accessibilityLabel={`${r.name} : ${r.status === "confirmed" ? "relais passé" : r.status === "opened" ? "passage ouvert" : "passage à ouvrir"}`}>
      <View style={styles.row}>
        <Icon name="link" size={16} color={colors.cy} />
        <T variant="bodyStrong" style={{ flex: 1 }}>{r.name}</T>
        <T variant="caption" tone={r.status === "confirmed" ? "ok" : "muted"}>{r.status === "confirmed" ? "Relais passé" : r.status === "opened" ? "Passage ouvert" : "À ouvrir"}</T>
      </View>
      <View style={styles.wrap}>
        {r.steps.map((s) => (
          <View key={s.id} style={styles.camp}>
            <Icon name={s.done ? "check" : "dot"} size={16} color={s.done ? colors.cy : colors.tx3} />
            <T variant="caption" tone={s.done ? "default" : "faint"}>{s.label}</T>
          </View>
        ))}
      </View>
      <T variant="small" testID={`cordee-relay-shared-${c.id}`}>{r.shared}</T>
      {r.holder ? <T variant="small" testID={`cordee-relay-holder-${c.id}`}>{r.holder}</T> : null}
      {r.handover ? <T variant="small" testID={`cordee-relay-handover-${c.id}`}>{r.handover}</T> : null}
      <T variant="small" tone="muted" testID={`cordee-relay-mine-${c.id}`}>{r.mine}</T>
      {r.can && r.label ? (
        <Button small label={r.label} loading={busy === key} disabled={busy !== null} testID={`cordee-relay-${r.can}-${c.id}`}
          onPress={() => {
            if (lock.current) return;
            lock.current = true;
            const action = r.can!;
            act(key, async () => {
              const answer = await api.cordeeRelay(owner, c.id, action);
              const words = Cordee.relayResult(answer, action);
              toast({ kind: "ok", title: words.title, message: words.message });
            }).finally(() => { lock.current = false; });
          }} />
      ) : null}
      {r.turns.length ? (
        <View style={styles.row}>
          {r.turns.map((t) => (
            <Button key={t.action} small kind={t.action === "accept" && !r.can ? "primary" : "secondary"} label={t.label} loading={busy === key} disabled={busy !== null}
              testID={`cordee-turn-${t.action}-${c.id}`} onPress={() => (t.action === "handover" ? setHanding(true) : turn(t.action))} />
          ))}
        </View>
      ) : null}
      {r.turns.some((t) => t.action === "take") ? <T variant="caption" tone="faint">Facultatif : prendre le relais le réserve {Cordee.RULE.holdHours} h au plus ; sinon tout membre peut le recevoir.</T> : null}
      {r.status === "waiting" ? <T variant="caption" tone="faint">{r.intro}</T> : null}
      <HandoverSheet visible={handing} onClose={() => setHanding(false)} choices={r.choices} busy={busy === key} onSubmit={(to) => turn("handover", to)} id={c.id} />
    </View>
  );
}

/* V1.8.2 — passer la main: to the whole cordée (the first member who accepts) or to one member the server allows. No reason is asked. */
function HandoverSheet({ visible, onClose, choices, busy, onSubmit, id }: { visible: boolean; onClose: () => void; choices: { id: string; name: string }[]; busy: boolean; onSubmit: (to: string | null) => void; id: string }) {
  const [to, setTo] = useState<string | null>(null);
  return (
    <Sheet visible={visible} onClose={onClose} title="Passer la main" footer={<Button label="Passer la main" loading={busy} onPress={() => onSubmit(to)} testID={`cordee-handover-submit-${id}`} />}>
      <T variant="small" tone="muted">Le relais reste réservé {Cordee.RULE.offerHours} h au plus, le temps qu’un membre l’accepte. Sans réponse, il redevient libre pour toute la cordée. Tes longueurs restent acquises ; personne ne voit pourquoi tu passes la main.</T>
      <T variant="bodyStrong">À qui ?</T>
      <View style={styles.wrap}>
        <Chip label="Toute la cordée" selected={to === null} onPress={() => setTo(null)} testID={`cordee-handover-all-${id}`} />
        {choices.map((m) => <Chip key={m.id} label={m.name} selected={to === m.id} onPress={() => setTo(m.id)} testID={`cordee-handover-to-${m.id}`} />)}
      </View>
    </Sheet>
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
  relay: { gap: space.s2, padding: space.s3, borderWidth: 1, borderColor: colors.line, borderRadius: 8 },
});
