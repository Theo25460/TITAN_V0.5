import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Share, StyleSheet, View } from "react-native";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Field } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { ProgressBar } from "../../components/Progress";
import { Tap } from "../../components/Pressable";
import { Screen } from "../../components/Screen";
import { Section } from "../../components/Section";
import { Segmented } from "../../components/Segmented";
import { Sheet } from "../../components/Sheet";
import { EmptyState, ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Format, Sports } from "../../core";
import * as api from "../../data/api";
import { useOwner } from "../../data/auth";
import { keys, useSocial } from "../../data/hooks";
import { errorMessage } from "../../lib/errors";
import { useOnline } from "../../lib/network";
import { colors, space, TOUCH } from "../../theme/tokens";

type Tab = "friends" | "moments" | "challenges" | "guild";
const METRIC_LABEL: Record<api.Challenge["metric"], string> = { effort_minutes: "minutes d’effort", active_days: "jours actifs", distance_km: "km", sessions: "séances" };

type Expedition = { id: string; title: string; story: string; guardian: string; starts_at: string; ends_at: string; status: "upcoming" | "active" | "ended"; collective_goal: number; collective_minutes: number; participants: number; daily_cap: number; personal_days: number; personal_minutes: number; reward_title: string; me: { joined: boolean; minutes?: number; days?: number; personal_done?: boolean } } | null;

/** Community stays secondary: friends by consent, moments, friendly challenges without stakes, effort-based guild. */
export function CommunityScreen() {
  const owner = useOwner();
  const qc = useQueryClient();
  const q = useSocial();
  const toast = useToast();
  const online = useOnline();
  const [tab, setTab] = useState<Tab>("friends");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [newChallenge, setNewChallenge] = useState(false);
  const s = q.data;

  async function act(id: string, fn: () => Promise<unknown>, ok?: string) {
    if (!online) return toast({ kind: "warn", title: "Connexion requise", message: "Les actions de communauté demandent Internet." });
    setBusy(id);
    try {
      await fn();
      if (ok) toast({ kind: "ok", title: ok });
      await qc.invalidateQueries({ queryKey: keys.social(owner) });
    } catch (e) {
      toast({ kind: "err", title: "Action impossible", message: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  if (q.isLoading && !s) return <Screen><LoadingCards /></Screen>;
  if (!s) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const exp = s.expedition as Expedition;

  return (
    <>
      <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "friends", label: `Amis${s.requests_in.length ? ` (${s.requests_in.length})` : ""}` },
            { value: "moments", label: "Moments" },
            { value: "challenges", label: "Défis" },
            { value: "guild", label: "Guilde" },
          ]}
          accessibilityLabel="Rubrique de la communauté"
        />

        {tab === "friends" ? (
          <>
            <Card style={{ gap: space.s3 }}>
              <T variant="bodyStrong">Ton code ami : {s.me.friend_code}</T>
              <T variant="small">{s.me.findable ? "Ton profil est trouvable : tes amis peuvent t’ajouter avec ce code." : "Ton profil n’est pas trouvable. Active « Profil trouvable » dans Confidentialité pour recevoir des demandes."}</T>
              <Button small kind="secondary" icon="share" label="Partager mon code" onPress={() => Share.share({ message: `Ajoute-moi sur TITAN avec mon code ami : ${s.me.friend_code}` }).catch(() => {})} />
            </Card>
            <Card style={{ gap: space.s3 }}>
              <Field label="Ajouter un ami" value={code} onChangeText={(v) => setCode(v.toUpperCase())} placeholder="TN-XXXX" autoCapitalize="characters" autoCorrect={false} />
              <Button
                label="Envoyer la demande"
                icon="userPlus"
                loading={busy === "add"}
                disabled={!code.trim()}
                onPress={() =>
                  act(
                    "add",
                    async () => {
                      const r = await api.friendRequest(code.trim());
                      setCode("");
                      toast({ kind: "ok", title: r.status === "friends" ? "Vous êtes maintenant amis" : "Demande envoyée" });
                    },
                  )
                }
              />
            </Card>
            {s.requests_in.length ? (
              <Section title="Demandes reçues">
                {s.requests_in.map((r) => (
                  <Card key={r.id} style={styles.row}>
                    <Avatar id={r.avatar} size={40} />
                    <T variant="bodyStrong" style={{ flex: 1 }}>
                      {r.name}
                    </T>
                    <Button small label="Accepter" loading={busy === `acc-${r.id}`} onPress={() => act(`acc-${r.id}`, () => api.friendRespond(r.id, true), "Ami ajouté")} />
                    <Tap onPress={() => act(`dec-${r.id}`, () => api.friendRespond(r.id, false))} accessibilityLabel={`Refuser la demande de ${r.name}`} style={styles.iconBtn}>
                      <Icon name="close" size={20} color={colors.tx3} />
                    </Tap>
                  </Card>
                ))}
              </Section>
            ) : null}
            {s.requests_out.length ? (
              <T variant="caption" tone="faint">
                En attente : {s.requests_out.map((r) => r.name).join(", ")}
              </T>
            ) : null}
            <Section title={`Amis (${s.friends.length})`}>
              {!s.friends.length ? (
                <EmptyState icon="group" title="Pas encore d’amis" text="Échange vos codes amis pour vous encourager et lancer des défis." />
              ) : (
                s.friends.map((f) => (
                  <Card key={f.id} style={styles.row}>
                    <Avatar id={f.avatar} size={44} />
                    <View style={{ flex: 1 }}>
                      <T variant="bodyStrong">{f.name}</T>
                      <T variant="caption" tone="faint">
                        {[f.level ? `Niveau ${f.level}` : null, f.week_days !== null && f.week_days !== undefined ? `${f.week_days} jour${f.week_days > 1 ? "s" : ""} actif${f.week_days > 1 ? "s" : ""} cette semaine` : null, f.last_active ? `actif ${Format.relativeDay(f.last_active)}` : null].filter(Boolean).join(" · ") || "Statistiques privées"}
                      </T>
                    </View>
                    <Tap
                      onPress={() =>
                        Alert.alert(f.name, undefined, [
                          { text: "Annuler", style: "cancel" },
                          { text: "Retirer des amis", onPress: () => act(`rm-${f.id}`, () => api.friendRemove(f.id), "Ami retiré") },
                          { text: "Bloquer", style: "destructive", onPress: () => act(`bl-${f.id}`, () => api.blockUser(f.id), "Personne bloquée") },
                        ])
                      }
                      accessibilityLabel={`Options pour ${f.name}`}
                      style={styles.iconBtn}
                    >
                      <Icon name="more" size={20} color={colors.tx3} />
                    </Tap>
                  </Card>
                ))
              )}
            </Section>
          </>
        ) : tab === "moments" ? (
          !s.moments.length ? (
            <EmptyState icon="sparkle" title="Aucun moment récent" text="Partage une séance depuis son écran de résultat : tes amis pourront t’encourager." />
          ) : (
            s.moments.map((m) => (
              <Card key={m.id} style={{ gap: space.s2 }}>
                <View style={styles.row}>
                  <Avatar id={m.author.avatar} size={36} />
                  <View style={{ flex: 1 }}>
                    <T variant="bodyStrong">{m.mine ? "Toi" : m.author.name}</T>
                    <T variant="caption" tone="faint">
                      {Format.relativeDay(m.created_at)}
                      {m.visibility === "private" ? " · privé" : ""}
                    </T>
                  </View>
                </View>
                <T variant="title">{m.title}</T>
                {m.detail ? <T variant="small">{m.detail}</T> : null}
                <View style={styles.row}>
                  {!m.mine ? (
                    <Chip label={`${m.cheers} encouragement${m.cheers > 1 ? "s" : ""}`} icon="heart" selected={m.cheered} onPress={() => act(`ch-${m.id}`, () => api.momentCheer(m.id))} />
                  ) : (
                    <>
                      <Chip label={`${m.cheers} encouragement${m.cheers > 1 ? "s" : ""}`} icon="heart" />
                      <View style={{ flex: 1 }} />
                      <Tap onPress={() => Alert.alert("Retirer ce moment ?", undefined, [{ text: "Annuler", style: "cancel" }, { text: "Retirer", style: "destructive", onPress: () => act(`del-${m.id}`, () => api.momentDelete(m.id), "Moment retiré") }])} accessibilityLabel="Retirer ce moment" style={styles.iconBtn}>
                        <Icon name="trash" size={18} color={colors.tx3} />
                      </Tap>
                    </>
                  )}
                </View>
              </Card>
            ))
          )
        ) : tab === "challenges" ? (
          <>
            <Button label="Lancer un défi" icon="flag" disabled={!s.friends.length} onPress={() => setNewChallenge(true)} />
            {!s.friends.length ? <T variant="caption" tone="faint">Ajoute un ami pour lancer un défi.</T> : null}
            {exp ? (
              <Card tone="accent" style={{ gap: space.s2 }}>
                <T variant="eyebrow" tone="accent">
                  Expédition {exp.status === "active" ? "en cours" : exp.status === "upcoming" ? "à venir" : "terminée"}
                </T>
                <T variant="h3">{exp.title}</T>
                <T variant="small">{exp.story}</T>
                <ProgressBar value={exp.collective_minutes / Math.max(1, exp.collective_goal)} accessibilityLabel="Progression collective" />
                <T variant="caption" tone="faint">
                  {Format.number(exp.collective_minutes)} / {Format.number(exp.collective_goal)} min d’effort collectives · {exp.participants} participant{exp.participants > 1 ? "s" : ""} · {exp.daily_cap} min max/jour
                </T>
                {exp.me.joined ? (
                  <T variant="small" tone="accent">
                    Ta contribution : {exp.me.minutes ?? 0} min sur {Format.plural(exp.me.days ?? 0, "jour", "jours")}{exp.me.personal_done ? ` · titre « ${exp.reward_title} » obtenu` : ` · objectif perso ${exp.personal_days} jours et ${exp.personal_minutes} min`}
                  </T>
                ) : exp.status !== "ended" ? (
                  <Button small label="Rejoindre l’expédition" loading={busy === "exp"} onPress={() => act("exp", () => api.expeditionJoin(exp.id), "Expédition rejointe")} />
                ) : null}
              </Card>
            ) : null}
            {!s.challenges.length ? (
              <EmptyState icon="flag" title="Aucun défi en cours" text="Un défi entre amis est un repère sportif, jamais un pari : pas de mise, juste du mouvement." />
            ) : (
              s.challenges.map((c) => (
                <Card key={c.id} style={{ gap: space.s2 }}>
                  <View style={styles.row}>
                    <T variant="title" style={{ flex: 1 }}>
                      {c.title}
                    </T>
                    <Chip label={c.status === "ended" ? "Terminé" : `Jusqu’au ${new Date(c.ends_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`} />
                  </View>
                  <T variant="caption" tone="faint">
                    {Format.number(c.target)} {METRIC_LABEL[c.metric]}
                    {c.sport ? ` · ${Sports.label(c.sport)}` : " · tous sports"}
                  </T>
                  {c.members.filter((m) => m.status === "joined").map((m) => (
                    <View key={m.id} style={{ gap: 2 }}>
                      <View style={styles.row}>
                        <T variant="small" tone="default" style={{ flex: 1 }}>
                          {m.id === owner ? "Toi" : m.name}
                        </T>
                        <T variant="caption" tone="muted">
                          {Format.number(Number(m.progress) || 0, 1)} / {Format.number(c.target)}
                        </T>
                      </View>
                      <ProgressBar value={(Number(m.progress) || 0) / Math.max(1, c.target)} height={5} accessibilityLabel={`Progression de ${m.name}`} />
                    </View>
                  ))}
                  {c.my_status === "invited" && c.status === "active" ? (
                    <View style={styles.row}>
                      <Button small label="Rejoindre" style={{ flex: 1 }} loading={busy === `j-${c.id}`} onPress={() => act(`j-${c.id}`, () => api.challengeRespond(c.id, "join"), "Défi rejoint")} />
                      <Button small kind="ghost" label="Décliner" style={{ flex: 1 }} onPress={() => act(`d-${c.id}`, () => api.challengeRespond(c.id, "decline"))} />
                    </View>
                  ) : c.my_status === "joined" && c.status === "active" && !c.mine ? (
                    <Button small kind="ghost" label="Quitter le défi" onPress={() => act(`l-${c.id}`, () => api.challengeRespond(c.id, "leave"))} />
                  ) : null}
                </Card>
              ))
            )}
          </>
        ) : (
          <GuildPanel overview={s} onAct={act} busy={busy} />
        )}
      </Screen>
      <ChallengeSheet visible={newChallenge} onClose={() => setNewChallenge(false)} friends={s.friends} onCreate={(p) => act("create", () => api.challengeCreate(p), "Défi lancé").then(() => setNewChallenge(false))} />
    </>
  );
}

function GuildPanel({ overview, onAct, busy }: { overview: api.SocialOverview; onAct: (id: string, fn: () => Promise<unknown>, ok?: string) => Promise<void>; busy: string | null }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const g = overview.guild;
  if (!g)
    return (
      <>
        <EmptyState icon="shield" title="Pas encore de guilde" text="Une guilde avance ensemble vers un objectif hebdomadaire de minutes d’effort, 90 min max par membre et par jour." />
        <Card style={{ gap: space.s3 }}>
          <Field label="Rejoindre avec un code" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="Code de guilde" />
          <Button label="Rejoindre" loading={busy === "gj"} disabled={!code.trim()} onPress={() => onAct("gj", () => api.guildJoin(code.trim()), "Guilde rejointe")} />
        </Card>
        <Card style={{ gap: space.s3 }}>
          <Field label="Ou créer la tienne" value={name} onChangeText={setName} maxLength={40} placeholder="Nom de la guilde" />
          <Button kind="secondary" label="Créer la guilde" loading={busy === "gc"} disabled={name.trim().length < 3} onPress={() => onAct("gc", () => api.guildCreate(name.trim(), ""), "Guilde créée")} />
        </Card>
      </>
    );
  return (
    <>
      <Card tone="accent" style={{ gap: space.s3 }}>
        <T variant="eyebrow" tone="accent">
          Cette semaine
        </T>
        <T variant="numLarge">
          {Format.number(g.minutes)}
          <T variant="h3" tone="faint">
            {" "}
            / {Format.number(g.target)} min
          </T>
        </T>
        <ProgressBar value={g.minutes / Math.max(1, g.target)} accessibilityLabel="Objectif de la guilde" />
      </Card>
      <Section title="Membres">
        {g.members.map((m) => (
          <Card key={m.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <T variant="bodyStrong">{m.name}</T>
              <T variant="caption" tone="faint">
                {m.role === "owner" ? "Fondateur" : m.role === "officer" ? "Officier" : "Membre"} · {m.days} jour{m.days > 1 ? "s" : ""}
              </T>
            </View>
            <T variant="num">{Format.number(m.minutes)} min</T>
          </Card>
        ))}
      </Section>
      <Button kind="ghost" label="Quitter la guilde" onPress={() => Alert.alert("Quitter la guilde ?", undefined, [{ text: "Annuler", style: "cancel" }, { text: "Quitter", style: "destructive", onPress: () => onAct("gl", () => api.guildLeave(), "Guilde quittée") }])} />
    </>
  );
}

function ChallengeSheet({ visible, onClose, friends, onCreate }: { visible: boolean; onClose: () => void; friends: api.Friend[]; onCreate: (p: Parameters<typeof api.challengeCreate>[0]) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [metric, setMetric] = useState<api.Challenge["metric"]>("active_days");
  const [target, setTarget] = useState("4");
  const [days, setDays] = useState("7");
  const [invitees, setInvitees] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    const t = Number(target.replace(",", "."));
    const d = Math.round(Number(days));
    if (title.trim().length < 2) return setError("Donne un nom au défi.");
    if (!(t > 0)) return setError("Choisis un objectif supérieur à zéro.");
    if (!(d >= 1 && d <= 31)) return setError("Un défi dure de 1 à 31 jours.");
    if (!invitees.length) return setError("Invite au moins un ami.");
    if (metric === "distance_km") return setError("Le défi en distance demande un sport : choisis plutôt minutes, jours ou séances.");
    setBusy(true);
    setError(null);
    await onCreate({ title: title.trim(), metric, sport: null, target: t, days: d, invitees });
    setBusy(false);
  }
  return (
    <Sheet visible={visible} onClose={onClose} title="Nouveau défi" footer={<View style={{ gap: 6 }}>{error ? <T variant="small" tone="err">{error}</T> : null}<Button label="Lancer le défi" loading={busy} onPress={submit} /></View>}>
      <Field label="Nom" value={title} onChangeText={setTitle} maxLength={60} placeholder="Une semaine qui bouge" />
      <Segmented value={metric === "distance_km" ? "active_days" : metric} onChange={setMetric} options={[{ value: "active_days", label: "Jours" }, { value: "sessions", label: "Séances" }, { value: "effort_minutes", label: "Minutes" }]} accessibilityLabel="Mesure du défi" />
      <View style={styles.row}>
        <Field compact label={`Objectif (${METRIC_LABEL[metric]})`} value={target} onChangeText={setTarget} keyboardType="decimal-pad" />
        <Field compact label="Durée (jours)" value={days} onChangeText={setDays} keyboardType="number-pad" />
      </View>
      <T variant="caption" tone="muted">
        Inviter (1 à 10 amis)
      </T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {friends.map((f) => (
          <Chip key={f.id} label={f.name} selected={invitees.includes(f.id)} onPress={() => setInvitees((l) => (l.includes(f.id) ? l.filter((x) => x !== f.id) : l.length >= 10 ? l : [...l, f.id]))} />
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.s3 },
  iconBtn: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, alignItems: "center", justifyContent: "center" },
});
