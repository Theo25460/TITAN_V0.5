import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { CountUp, Reveal } from "../../components/Motion";
import { Tap } from "../../components/Pressable";
import { ProgressBar } from "../../components/Progress";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Codex, EffortRules, Format, Progress, Sports } from "../../core";
import { worldImages } from "../../core/images";
import { recordText, sessionMetrics, sessionRecords } from "../../core/moment";
import { momentShare } from "../../data/api";
import { useAdventure, useLogs, usePrefs, useProfile } from "../../data/hooks";
import { useQueue } from "../../data/queue";
import { useReceipt } from "../../data/receipts";
import { errorMessage } from "../../lib/errors";
import { haptic } from "../../lib/haptics";
import { useOnline } from "../../lib/network";
import type { RootParams } from "../../navigation/types";
import { colors, familyColors, fonts, radius, space } from "../../theme/tokens";

/** The moment after a session: what was done, what the server granted, and what it moved — week, mastery, records, chapter. */
export function SessionResultScreen({ navigation, route }: NativeStackScreenProps<RootParams, "SessionResult">) {
  const { eventId } = route.params;
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const toast = useToast();
  const receipt = useReceipt(eventId);
  const queue = useQueue();
  const { logs, active } = useLogs();
  const prefs = usePrefs();
  const profile = useProfile().data;
  const adventure = useAdventure().data;
  const [shared, setShared] = useState(false);
  const [sharing, setSharing] = useState(false);
  const log = logs.find((l) => l.client_event_id === eventId || l.id === eventId) ?? null;
  const queued = queue.items.find((i) => i.payload.details.client_event_id === eventId);
  const status = receipt || (log && log.syncStatus === "confirmed") ? "confirmed" : queued?.status === "error" ? "error" : "pending";

  // One tactile "done" when the server confirms, not on every re-render.
  const confirmedOnce = useRef(false);
  useEffect(() => {
    if (status === "confirmed" && !confirmedOnce.current) {
      confirmedOnce.current = true;
      haptic("success");
    }
  }, [status]);

  const metrics = useMemo(() => (log ? sessionMetrics(log) : []), [log]);
  const records = useMemo(() => (log && status === "confirmed" ? sessionRecords(logs, log) : []), [logs, log, status]);
  const cadence = useMemo(() => Progress.cadence(active, { target: prefs.weeklyGoalSessions, pauses: prefs.cadencePauses }), [active, prefs]);
  const mastery = useMemo(() => (log ? Progress.mastery(active).find((m) => m.sport === log.sport) : undefined), [active, log]);
  const campaign = adventure?.campaigns.find((c) => c.id === adventure.selected_world && c.chapter > 0 && c.chapter <= 9) ?? adventure?.campaigns.find((c) => c.chapter > 0 && c.chapter <= 9);
  const world = campaign ? Codex.worlds.find((w) => w.id === campaign.id) : undefined;
  const chapterDays = campaign ? Math.min(Number(campaign.evidence?.days ?? 0), campaign.target) : 0;

  if (!log)
    return (
      <View style={[styles.root, { paddingTop: insets.top + space.s6, paddingHorizontal: space.s4, gap: space.s4 }]}>
        <T variant="h2">Séance enregistrée</T>
        <Button label="Retour au QG" onPress={() => navigation.navigate("Tabs", { screen: "QG" })} />
      </View>
    );

  const historical = Boolean(log.details?.historical);
  const effort = Progress.effortOf(log);
  const fam = Sports.familyOf(log.sport);
  const tint = familyColors[fam] ?? colors.cy;
  const xp = receipt?.xp ?? (log.syncStatus === "confirmed" ? Number(log.xp) || 0 : 0);
  const credits = receipt?.credits ?? (Number(log.details?.credits) || 0);
  const capped = receipt ? receipt.requested_xp > receipt.xp : false;
  const level = receipt?.level_after ?? adventure?.level ?? profile?.level ?? 1;
  const levelXp = receipt?.xp_after ?? adventure?.xp ?? profile?.xp ?? 0;
  const need = EffortRules.levelRequirement(level);
  const leveledUp = Number(receipt?.leveled_up) > 0;
  // Where the bar was before this session: the gain itself is what fills.
  const before = receipt && !leveledUp ? Math.max(0, levelXp - receipt.xp) / need : 0;
  const thisWeek = Format.weekStart(new Date(log.date)).getTime() === Format.weekStart(new Date()).getTime();
  const [headline, ...facts] = metrics;

  async function share() {
    if (!log || sharing) return;
    setSharing(true);
    const rec = records.find((r) => !r.first);
    try {
      await momentShare({
        kind: rec ? "record" : "session",
        title: rec ? `${Sports.label(log.sport)} : ${rec.label.toLowerCase()} ${recordText(rec)}` : `${Sports.label(log.sport)} · ${metrics.filter(([k]) => k !== "Ressenti").slice(0, 3).map(([, v]) => v).join(" · ")}`,
        detail: rec?.previous ? `avant : ${recordText(rec, rec.previous.value)}` : null,
        sport: log.sport,
        logId: log.id,
        visibility: "friends",
      });
      setShared(true);
      toast({ kind: "ok", title: "Moment partagé avec tes amis" });
    } catch (e) {
      toast({ kind: "err", title: "Partage impossible", message: errorMessage(e) });
    } finally {
      setSharing(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Reveal order={0} style={{ gap: space.s4 }}>
          <View style={styles.head}>
            <View style={[styles.sportDisc, { backgroundColor: `${tint}26`, borderColor: `${tint}66` }]}>
              <Icon name={Sports.FAMILY_ICON[fam]} size={26} color={tint} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="eyebrow" tone="accent">
                {historical ? "Ajoutée à ton historique" : "Séance enregistrée"} · {Format.relativeDay(log.date)}
              </T>
              <T variant="h2" numberOfLines={1}>
                {Sports.label(log.sport)}
              </T>
            </View>
          </View>
          {headline ? (
            <View>
              <T style={styles.hero}>{headline[1]}</T>
              <T variant="caption" tone="faint">
                {headline[0]}
                {effort.effortMinutes > 0 ? ` · ${Math.round(effort.effortMinutes)} min d’effort${effort.estimated ? " (durée estimée)" : ""}` : ""}
              </T>
            </View>
          ) : null}
          {facts.length ? (
            <View style={styles.facts}>
              {facts.map(([k, v], i) => (
                <View key={k} style={[styles.fact, i > 0 && styles.factLine]}>
                  <T variant="caption" tone="faint">
                    {k}
                  </T>
                  <T variant="num">{v}</T>
                </View>
              ))}
            </View>
          ) : null}
        </Reveal>

        <Reveal order={1}>
          <Card tone={status === "confirmed" ? "accent" : "flat"} style={{ gap: space.s3 }}>
            {status === "confirmed" && receipt?.reward_held ? (
              <View style={{ flexDirection: "row", gap: space.s3, alignItems: "center" }}>
                <Icon name="clock" size={22} color={colors.warn} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="bodyStrong" accessibilityLiveRegion="polite">
                    Récompense en vérification
                  </T>
                  <T variant="small">
                    {Format.number(receipt.held_xp ?? 0)} XP et {Format.number(receipt.held_credits ?? 0)} crédits sont retenus par précaution, au plus{" "}
                    {Math.max(1, Math.ceil((new Date(receipt.release_at ?? Date.now()).getTime() - Date.now()) / 3600000)) || 24} h : ils arrivent d’eux-mêmes si rien n’est trouvé. Ta séance est bien enregistrée.
                  </T>
                </View>
              </View>
            ) : status === "confirmed" && !historical ? (
              <>
                <View style={styles.rewardRow}>
                  <CountUp value={xp} format={(n) => `+${Format.number(n)}`} style={styles.xp} tone="accent" delay={350} />
                  <T variant="h3" tone="accent" style={{ marginBottom: 6 }}>
                    XP
                  </T>
                  <View style={{ flex: 1 }} />
                  {credits > 0 ? (
                    <View style={styles.credits}>
                      <Icon name="star" size={14} color={colors.am} />
                      <T variant="caption" tone="amber">
                        +{Format.number(credits)} crédits
                      </T>
                    </View>
                  ) : null}
                </View>
                <T variant="small" accessibilityLiveRegion="polite">
                  {capped
                    ? xp > 0
                      ? `XP confirmés, plafond de fair-play atteint : ${Format.number(xp)} comptés sur ${Format.number(receipt!.requested_xp)}.`
                      : "Plafond de fair-play du jour ou de la semaine atteint : la séance compte pour tes statistiques, pas pour l’XP."
                    : "XP confirmés par le serveur."}
                </T>
                {leveledUp ? (
                  <View style={styles.levelUp}>
                    <Icon name="ascent" size={20} color={colors.am} />
                    <T variant="bodyStrong" tone="amber">
                      Niveau {level} atteint · {EffortRules.rank(level).name}
                    </T>
                  </View>
                ) : null}
                <View style={{ gap: 6 }}>
                  <View style={styles.between}>
                    <T variant="caption" tone="muted">
                      Niveau {level} · {EffortRules.rank(level).name}
                    </T>
                    <T variant="caption" tone="faint">
                      {Format.number(levelXp)} / {Format.number(need)} XP
                    </T>
                  </View>
                  <ProgressBar value={levelXp / need} from={before} delay={500} accessibilityLabel="Progression vers le niveau suivant" />
                </View>
              </>
            ) : (
              <View style={{ flexDirection: "row", gap: space.s3, alignItems: "center" }}>
                <Icon name={status === "confirmed" ? "journal" : status === "error" ? "alert" : "offline"} size={22} color={status === "confirmed" ? colors.cy : status === "error" ? colors.err : colors.warn} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="bodyStrong" accessibilityLiveRegion="polite">
                    {status === "confirmed" ? "Ajoutée à ton historique" : status === "error" ? "Le serveur a refusé cette séance" : online ? "Envoi en cours…" : "Gardée sur ce téléphone"}
                  </T>
                  <T variant="small">
                    {status === "confirmed"
                      ? "Elle compte pour tes statistiques et tes records. Sans XP : seules les séances des 30 derniers jours en rapportent."
                      : status === "error"
                        ? queued?.reason || "Corrige-la ou supprime-la depuis les envois en attente."
                        : `Elle partira d’elle-même dès que la connexion revient${effort.xp > 0 && !historical ? ` (environ ${Format.number(effort.xp)} XP, confirmés par le serveur à l’envoi)` : ""}. Rien n’est perdu.`}
                  </T>
                </View>
              </View>
            )}
          </Card>
        </Reveal>

        {records.length ? (
          <Reveal order={2}>
            <Card tone="amber" style={{ gap: space.s3 }}>
              <View style={styles.between}>
                <T variant="eyebrow" tone="amber">
                  {records.every((r) => r.first) ? (records.length > 1 ? "Premiers repères" : "Premier repère") : records.length > 1 ? "Records" : "Nouveau record"}
                </T>
                <Icon name="trophy" size={20} color={colors.am} />
              </View>
              {records.map((r) => (
                <View key={r.id} style={styles.record}>
                  <T variant="small" tone="default" style={{ flex: 1 }}>
                    {r.label}
                  </T>
                  <View style={{ alignItems: "flex-end" }}>
                    <T variant="num" tone="amber">
                      {recordText(r)}
                    </T>
                    <T variant="caption" tone="faint">
                      {r.previous ? `avant : ${recordText(r, r.previous.value)}` : "ta référence pour la suite"}
                    </T>
                  </View>
                </View>
              ))}
            </Card>
          </Reveal>
        ) : null}

        {thisWeek && !historical ? (
          <Reveal order={3}>
            <View style={styles.block}>
              <View style={styles.between}>
                <T variant="eyebrow">Ta semaine</T>
                <T variant="caption" tone="muted">
                  {cadence.currentDays}/{cadence.target} jours actifs
                </T>
              </View>
              <View style={styles.days} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {Array.from({ length: Math.max(cadence.target, cadence.currentDays) }, (_, i) => (
                  <View key={i} style={[styles.day, i < cadence.currentDays && styles.dayOn, i >= cadence.target && styles.dayBonus]} />
                ))}
              </View>
              <T variant="small">
                {cadence.currentDays >= cadence.target
                  ? cadence.currentDays === cadence.target
                    ? "Semaine tenue. Tout ce qui suit est du bonus, pas une obligation."
                    : `Semaine tenue, ${cadence.currentDays} jours actifs.`
                  : `Encore ${cadence.remaining} jour${cadence.remaining > 1 ? "s" : ""} actif${cadence.remaining > 1 ? "s" : ""} pour tenir ta semaine.`}
              </T>
            </View>
          </Reveal>
        ) : null}

        {mastery ? (
          <Reveal order={4}>
            <View style={styles.block}>
              <View style={styles.between}>
                <T variant="eyebrow">Maîtrise · {mastery.label}</T>
                <T variant="caption" color={tint}>
                  {mastery.name}
                </T>
              </View>
              <ProgressBar value={mastery.progress} color={tint} height={6} delay={700} accessibilityLabel={`Maîtrise ${mastery.label}`} />
              <T variant="small">
                {mastery.next
                  ? `${Math.round(mastery.progress * 100)} % vers ${mastery.next.name} · ${Format.duration(mastery.minutes)} sur ${Format.number(mastery.weeks)} semaine${mastery.weeks > 1 ? "s" : ""}`
                  : "Niveau Référence : le sommet de cette discipline."}
              </T>
            </View>
          </Reveal>
        ) : null}

        {campaign && world && !historical ? (
          <Reveal order={5}>
            <Tap onPress={() => navigation.navigate("World", { id: world.id })} accessibilityLabel={`${world.name}, ${world.chapters[campaign.chapter - 1]?.name}`} style={styles.quest}>
              <Image source={worldImages[world.image]} style={styles.questImg} />
              <View style={{ flex: 1, gap: 4 }}>
                <T variant="caption" color={world.color}>
                  {world.name} · chapitre {campaign.chapter}
                </T>
                <T variant="bodyStrong" numberOfLines={1}>
                  {world.chapters[campaign.chapter - 1]?.name}
                </T>
                <ProgressBar value={chapterDays / Math.max(1, campaign.target)} color={world.color} height={5} delay={800} accessibilityLabel="Avancée du chapitre" />
                <T variant="caption" tone="faint">
                  {Progress.campaignProgress(campaign).ready ? "Chapitre prêt à être validé" : `${chapterDays}/${campaign.target} jour${campaign.target > 1 ? "s" : ""} actif${campaign.target > 1 ? "s" : ""}`}
                  {status === "confirmed" ? "" : " · mis à jour après confirmation"}
                </T>
              </View>
              <Icon name="chevron" size={18} color={colors.tx4} />
            </Tap>
          </Reveal>
        ) : null}
      </ScrollView>
      <View style={[styles.actions, { paddingBottom: insets.bottom + space.s4 }]}>
        {status === "error" ? <Button label="Voir les envois en attente" kind="secondary" onPress={() => navigation.replace("Pending")} /> : null}
        <View style={{ flexDirection: "row", gap: space.s3 }}>
          {status === "confirmed" && !shared && !historical ? <Button small label="Partager" kind="secondary" icon="send" loading={sharing} disabled={!online} onPress={share} style={{ flex: 1 }} /> : null}
          <Button small label="Voir le journal" kind="secondary" icon="journal" onPress={() => navigation.navigate("Journal")} style={{ flex: 1 }} />
        </View>
        <Button label="Terminer" onPress={() => navigation.navigate("Tabs", { screen: "QG" })} testID="result-done" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: space.s4, paddingTop: space.s5, gap: space.s5 },
  head: { flexDirection: "row", alignItems: "center", gap: space.s3 },
  sportDisc: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  hero: { fontFamily: fonts.display, fontSize: 56, lineHeight: 60, color: colors.tx, fontVariant: ["tabular-nums"] },
  facts: { flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: space.s3 },
  fact: { flex: 1, gap: 2, paddingHorizontal: space.s2 },
  factLine: { borderLeftWidth: 1, borderLeftColor: colors.line },
  rewardRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  xp: { fontFamily: fonts.display, fontSize: 48, lineHeight: 52, fontVariant: ["tabular-nums"] },
  credits: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.amSoft, marginBottom: 8 },
  levelUp: { flexDirection: "row", alignItems: "center", gap: space.s2, padding: space.s3, borderRadius: radius.r2, backgroundColor: colors.amSoft, borderWidth: 1, borderColor: "rgba(244,187,84,0.4)" },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.s2 },
  record: { flexDirection: "row", alignItems: "center", gap: space.s3, paddingTop: space.s2, borderTopWidth: 1, borderTopColor: "rgba(244,187,84,0.18)" },
  block: { gap: space.s2 },
  days: { flexDirection: "row", gap: 6 },
  day: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.bg4 },
  dayOn: { backgroundColor: colors.cy },
  dayBonus: { backgroundColor: colors.am },
  quest: { flexDirection: "row", alignItems: "center", gap: space.s3, padding: space.s3, borderRadius: radius.r3, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line2 },
  questImg: { width: 64, height: 64, borderRadius: radius.r2 },
  actions: { paddingHorizontal: space.s4, paddingTop: space.s3, gap: space.s3, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
});
