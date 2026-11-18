import { SpaceProvider } from "../../theme/space";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSessionInterstitial } from "../../ads/useSessionInterstitial";
import { maybeAskForReview } from "../../lib/review";
import { shareCardImage } from "../../lib/shareImage";
import { ShareCard, type ShareCardData } from "../../components/ShareCard";
import { DiscoveryBanner } from "../settings/SaveAccountScreen";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { CountUp, Reveal } from "../../components/Motion";
import { Tap } from "../../components/Pressable";
import { ProgressBar } from "../../components/Progress";
import { ProgressReveal } from "../../components/ProgressReveal";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { AdventureRules, Codex, EffortRules, Format, Progress, Sports } from "../../core";
import { worldImages } from "../../core/images";
import { recordText, sessionMetrics, sessionRecords } from "../../core/moment";
import type { TrainingLog } from "../../core/types";
import { momentShare } from "../../data/api";
import { useSocial } from "../../data/hooks";
import { contributions, readAutoShare } from "../../lib/community";
import { useEvents } from "../community/EventsScreen";
import { useAdventure, useLogs, usePrefs, useProfile } from "../../data/hooks";
import { useQueue } from "../../data/queue";
import { useReceipt } from "../../data/receipts";
import { useOwner } from "../../data/auth";
import { IS_E2E } from "../../lib/config";
import { errorMessage } from "../../lib/errors";
import { haptic } from "../../lib/haptics";
import { useOnline } from "../../lib/network";
import type { RootParams } from "../../navigation/types";
import { colors, familyColors, fonts, radius, space, spaces } from "../../theme/tokens";

const INK = spaces.seance.ink;
import { LiveSettleCard } from "../../components/LiveSettleCard";

type Objective = { id: string; remaining: number };

/** "Et maintenant": the one next step after a session, in plain words. It only speaks of a chapter when the fresh server snapshot is
    the source (`chapterKnown`), and never announces a gain: a pending, refused, held or historical session says what will happen by itself. */
export function resultNextStep(i: {
  status: "confirmed" | "pending" | "error";
  held: boolean;
  historical: boolean;
  /** True only when the adventure snapshot was fetched after this screen opened and belongs to this account. */
  chapterKnown: boolean;
  chapter?: { number: number; worldName: string; ready: boolean; objectives: Objective[] } | null;
  week: { paused: boolean; remaining: number };
}): string {
  if (i.status === "error") return "Ouvre les envois en attente : tu peux corriger cette séance ou la renvoyer. Rien n’est perdu.";
  if (i.status === "pending") return "Rien à faire : la séance part toute seule dès que le réseau revient. L’XP s’affichera une fois confirmée par le serveur.";
  if (i.held) return "Rien à faire : la récompense arrive d’elle-même à la fin du contrôle. Tu peux enregistrer d’autres séances normalement.";
  if (i.historical) return "Cette séance nourrit tes statistiques, tes records et ta maîtrise. Les séances saisies dans les 30 jours rapportent aussi de l’XP.";
  if (i.chapterKnown && i.chapter) {
    const { number, worldName, ready, objectives } = i.chapter;
    if (ready) return `La balise du chapitre ${number} est prête : va l’allumer dans ${worldName}.`;
    const days = objectives.find((o) => o.id === "days")?.remaining ?? 0;
    const effort = Math.round(objectives.find((o) => o.id === "effort")?.remaining ?? 0);
    const parts = [days > 0 ? `${days} jour${days > 1 ? "s" : ""} actif${days > 1 ? "s" : ""}` : null, effort > 0 ? `${effort} min d’effort` : null].filter(Boolean);
    if (parts.length) return `Encore ${parts.join(" et ")} pour allumer la balise du chapitre ${number}. Un seul jour actif compte par jour, quel que soit le sport.`;
  }
  if (i.chapterKnown && !i.chapter) return "Choisis un monde dans Aventure : tes prochaines séances y allumeront des balises.";
  if (i.week.paused) return "Ta cadence est en pause : reprends quand tu veux, ta séance est dans ton journal.";
  return i.week.remaining > 0
    ? `Encore ${i.week.remaining} jour${i.week.remaining > 1 ? "s" : ""} actif${i.week.remaining > 1 ? "s" : ""} pour tenir ta semaine.`
    : "Semaine tenue. Le repos compte aussi : la suite t’attend quand tu veux.";
}

/** The moment after a session, in four beats: what was done, what the server confirmed, what it moved in the adventure, what to do next. */
/** Receipts whose cinematic already played in this run: coming back to the screen never replays a celebration. */
const revealed = new Set<string>();
const autoShared = new Set<string>();

export function SessionResultScreen({ navigation, route }: NativeStackScreenProps<RootParams, "SessionResult">) {
  const { eventId, stored } = route.params;
  const owner = useOwner();
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const toast = useToast();
  const receipt = useReceipt(owner, eventId);
  const queue = useQueue();
  const { logs, active } = useLogs();
  const prefs = usePrefs();
  const profile = useProfile().data;
  const adventureQuery = useAdventure();
  const adventure = adventureQuery.data;
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [shared, setShared] = useState(false);
  const [revealing, setRevealing] = useState(() => !revealed.has(eventId));
  const [sharing, setSharing] = useState(false);
  const social = useSocial().data;
  const events = useEvents().data;
  const queued = queue.owner === owner ? queue.items.find((i) => i.payload.details.client_event_id === eventId) : undefined;
  const payload = queued?.payload ?? (stored?.owner === owner && stored.payload.details.client_event_id === eventId ? stored.payload : undefined);
  const localLog = useMemo<TrainingLog | null>(() => payload ? { ...payload, id: eventId, client_event_id: eventId, cat: payload.category, xp: 0 } : null, [payload, eventId]);
  const log = logs.find((l) => l.client_event_id === eventId || l.id === eventId) ?? localLog;
  const status = receipt || (log && log.syncStatus === "confirmed") ? "confirmed" : queued?.status === "error" ? "error" : "pending";

  // One tactile "done" when the server confirms, not on every re-render.
  const confirmedOnce = useRef(false);
  const cardRef = useRef<View>(null);
  const [imageBusy, setImageBusy] = useState(false);
  useEffect(() => {
    if (status === "confirmed" && !confirmedOnce.current) {
      confirmedOnce.current = true;
      haptic("success");
    }
  }, [status]);

  // After-session advertising: counted only when the server confirmed a non-historical session; shown (if ever) at "Terminer", never delaying it.
  const maybeAd = useSessionInterstitial(eventId, status === "confirmed", !!log && !log.details?.historical);

  const metrics = useMemo(() => (log ? sessionMetrics(log) : []), [log]);
  const records = useMemo(() => (log && status === "confirmed" ? sessionRecords(logs, log) : []), [logs, log, status]);
  const cadence = useMemo(() => Progress.cadence(active, { target: prefs.weeklyGoalSessions, pauses: prefs.cadencePauses }), [active, prefs]);
  const mastery = useMemo(() => (log ? Progress.mastery(active).find((m) => m.sport === log.sport) : undefined), [active, log]);
  const impact = AdventureRules.sessionImpact({ logId: receipt?.log_id ?? log?.id, owner, status,
    rewardHeld: receipt?.reward_held, historical: Boolean(log?.details?.historical), snapshot: adventure,
    snapshotReady: adventureQuery.isFetchedAfterMount && !adventureQuery.isFetching && !adventureQuery.isError });
  const campaign = adventure?.campaigns.find((c) => c.id === impact.campaignId) ?? adventure?.campaigns.find((c) => c.id === adventure.selected_world && c.chapter > 0 && c.chapter <= 9) ?? adventure?.campaigns.find((c) => c.chapter > 0 && c.chapter <= 9);
  const world = campaign ? Codex.worlds.find((w) => w.id === campaign.id) : undefined;
  const chapterDays = campaign ? Math.min(Number(campaign.evidence?.days ?? 0), campaign.target) : 0;

  // C3: with « Partager mes séances automatiquement » on, a confirmed session reaches friends' moments once, without a tap.
  const shareRef = useRef<(() => Promise<void>) | null>(null);
  const autoTried = useRef(false);
  const canAutoShare = status === "confirmed" && !!log && !log.details?.historical && online && !shared && !autoShared.has(eventId);
  useEffect(() => {
    if (!canAutoShare || autoTried.current) return;
    autoTried.current = true;
    readAutoShare(owner).then((on) => {
      if (!on || autoShared.has(eventId)) return;
      autoShared.add(eventId);
      return shareRef.current?.();
    }).catch(() => {});
  }, [canAutoShare, owner, eventId]);

  if (!log)
    return (
      <View style={[styles.root, { paddingTop: insets.top + space.s6, paddingHorizontal: space.s4, gap: space.s4 }]}>
        <T variant="h2">{receipt ? "Séance confirmée" : "Séance introuvable"}</T>
        <Button label="Retour au QG" onPress={() => navigation.navigate("Tabs", { screen: "QG" })} />
      </View>
    );

  const historical = Boolean(log.details?.historical);
  const held = Boolean(receipt?.reward_held);
  const cp = campaign && campaign.chapter > 0 && campaign.chapter <= 9 ? Progress.campaignProgress(campaign) : null;
  const next = resultNextStep({
    status, held, historical,
    chapterKnown: impact.state === "confirmed",
    chapter: campaign && world && cp ? { number: campaign.chapter, worldName: world.name, ready: cp.ready, objectives: cp.objectives } : null,
    week: { paused: Boolean(cadence.currentPaused), remaining: cadence.remaining },
  });
  const effort = Progress.effortOf(log);
  const fam = Sports.familyOf(log.sport);
  const tint = familyColors[fam] ?? colors.cy;
  const xp = receipt?.xp ?? (log.syncStatus === "confirmed" ? Number(log.xp) || 0 : 0);
  const credits = receipt?.credits ?? 0;
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
    const logId = receipt?.log_id ?? (log?.syncStatus === "confirmed" ? log.id : null);
    if (!log || !logId || sharing) return;
    setSharing(true);
    const rec = records.find((r) => !r.first);
    try {
      await momentShare({
        kind: rec ? "record" : "session",
        title: rec ? `${Sports.label(log.sport)} : ${rec.label.toLowerCase()} ${recordText(rec)}` : `${Sports.label(log.sport)} · ${metrics.filter(([k]) => k !== "Ressenti").slice(0, 3).map(([, v]) => v).join(" · ")}`,
        detail: rec?.previous ? `avant : ${recordText(rec, rec.previous.value)}` : null,
        sport: log.sport,
        logId,
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

  shareRef.current = share;
  const counts = status === "confirmed" && !historical ? contributions(social, events) : [];

  // AUD-21: the story card mirrors this screen — a record first, otherwise the session's main measure, and the week in notches.
  const cardRecord = records.find((r) => !r.first);
  const cardData: ShareCardData = {
    eyebrow: cardRecord ? "Nouveau record" : "Séance du jour",
    title: Sports.label(log.sport),
    value: cardRecord ? recordText(cardRecord) : headline?.[1] ?? Sports.label(log.sport),
    caption: cardRecord ? `${cardRecord.label}${cardRecord.previous ? ` · avant : ${recordText(cardRecord, cardRecord.previous.value)}` : ""}` : headline?.[0] ?? null,
    facts: facts.filter(([k]) => k !== "Ressenti").slice(0, 3),
    icon: Sports.iconOf(log.sport),
    week: thisWeek && !historical && !cadence.currentPaused ? { done: cadence.currentDays, target: cadence.target } : null,
    record: !!cardRecord,
  };
  async function shareImage() {
    if (imageBusy) return;
    setImageBusy(true);
    try {
      await shareCardImage(cardRef, "Partager ma séance");
    } catch (e) {
      toast({ kind: "err", title: "Image impossible à partager", message: errorMessage(e) });
    } finally {
      setImageBusy(false);
    }
  }

  return (
    <SpaceProvider space="seance">
    <View style={styles.root}>
      <ScrollView>
        {/* The effort first, on the lime field of the session: the sport, then the one figure that says what was done, in the
            field's ink. What TITAN grants for it comes under it, on the ground, in the colour of progression. */}
        <Reveal order={0} style={[styles.field, { paddingTop: insets.top + space.s5 }]}>
          <View style={styles.head}>
            <Icon name={Sports.iconOf(log.sport)} size={28} color={INK} />
            <View style={{ flex: 1 }}>
              <T variant="caption" color={INK} style={{ opacity: 0.78 }}>
                {status === "error" ? "Envoi à corriger" : status === "pending" ? "Gardée sur ce téléphone" : historical ? "Ajoutée à ton historique" : "Séance enregistrée"} · {Format.relativeDay(log.date)}
              </T>
              <T variant="h2" color={INK} numberOfLines={2}>
                {Sports.label(log.sport)}
              </T>
            </View>
          </View>
          {headline ? (
            <View>
              <T style={styles.hero} numberOfLines={1} adjustsFontSizeToFit>{headline[1]}</T>
              <T variant="caption" color={INK} style={{ opacity: 0.78 }}>
                {headline[0]}
                {effort.effortMinutes > 0 ? ` · ${Math.round(effort.effortMinutes)} min d’effort${effort.estimated ? " (durée estimée)" : ""}` : ""}
              </T>
            </View>
          ) : null}
          {facts.length ? (
            <View style={styles.facts}>
              {facts.map(([k, v]) => (
                <View key={k} style={styles.fact}>
                  <T variant="num" color={INK}>{v}</T>
                  <T variant="caption" color={INK} style={{ opacity: 0.78 }}>
                    {k}
                  </T>
                </View>
              ))}
            </View>
          ) : null}
        </Reveal>

        <View style={styles.scroll}>
        <Reveal order={1}>
          <LiveSettleCard owner={owner} eventId={eventId} payload={payload} confirmed={status === "confirmed"} />
          {/* The accent tone and "TITAN a confirmé" are reserved for what the server really granted: a held reward, a refusal or a
              pending send never borrow them. */}
          <Card tone={status === "confirmed" && !held ? "accent" : "flat"} style={{ gap: space.s3 }} testID="result-reward">
            <T variant="eyebrow" tone={status === "error" ? "err" : status === "confirmed" && !held ? "accent" : "warn"}>
              {status === "error" ? "Envoi refusé" : status !== "confirmed" ? "Confirmation en attente" : held ? "Séance enregistrée · récompense en attente" : "TITAN a confirmé"}
            </T>
            {status === "confirmed" && receipt?.reward_held ? (
              <View style={{ flexDirection: "row", gap: space.s3, alignItems: "center" }}>
                <Icon name="clock" size={22} color={colors.warn} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="bodyStrong" accessibilityLiveRegion="polite">
                    Récompense en vérification
                  </T>
                  {(receipt.held_xp ?? 0) > 0 || (receipt.held_credits ?? 0) > 0 ? (
                    <T variant="small">
                      Ta séance est bien enregistrée. Tes {Format.number(receipt.held_xp ?? 0)} XP et {Format.number(receipt.held_credits ?? 0)} crédits arrivent d’eux-mêmes d’ici{" "}
                      {Math.max(1, Math.ceil((new Date(receipt.release_at ?? Date.now()).getTime() - Date.now()) / 3600000)) || 24} h, après une vérification de routine.
                    </T>
                  ) : (
                    <T variant="small">Ta séance est bien enregistrée. Vérification de routine (24 h au plus) : elle comptera dans les objectifs collectifs une fois confirmée.</T>
                  )}
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
                      ? `Plafond de fair-play atteint : ${Format.number(xp)} XP comptés sur ${Format.number(receipt!.requested_xp)}.`
                      : "Plafond de fair-play du jour ou de la semaine atteint : la séance compte pour tes statistiques, pas pour l’XP."
                    : "Bien joué : ton effort est compté."}
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
                    {status === "confirmed" ? "Ajoutée à ton historique" : status === "error" ? "Cette séance n’a pas pu être enregistrée" : online && queue.sending ? "Envoi en cours…" : "Gardée sur ce téléphone"}
                  </T>
                  <T variant="small">
                    {status === "confirmed"
                      ? "Elle compte pour tes statistiques et tes records. Sans XP : seules les séances des 30 derniers jours en rapportent."
                      : status === "error"
                        ? queued?.reason || "Retrouve les options de reprise dans les envois en attente."
                        : "Elle sera renvoyée automatiquement. Tu peux aussi vérifier son état dans les envois en attente."}
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

        {/* The week is TITAN's return mechanic: it is shown at the moment of reward, never folded away (AUD-17). Mastery stays one tap away. */}
        {thisWeek && !historical ? (
          <Reveal order={3}>
            <View style={styles.block}>
              <View style={styles.between}>
                <T variant="eyebrow">Ta semaine</T>
                <T variant="caption" tone="muted">
                  {cadence.currentPaused ? "Cadence en pause" : `${cadence.currentDays}/${cadence.target} jours actifs`}
                </T>
              </View>
              {!cadence.currentPaused ? <View style={styles.days} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {Array.from({ length: Math.max(cadence.target, cadence.currentDays) }, (_, i) => (
                  <View key={i} style={[styles.day, i < cadence.currentDays && styles.dayOn, i >= cadence.target && styles.dayBonus]} />
                ))}
              </View> : null}
              <T variant="small">
                {cadence.currentPaused ? "Ta séance reste dans ton journal." : cadence.currentDays >= cadence.target
                  ? cadence.currentDays === cadence.target
                    ? "Semaine tenue. Tout ce qui suit est du bonus, pas une obligation."
                    : `Semaine tenue, ${cadence.currentDays} jours actifs.`
                  : `Encore ${cadence.remaining} jour${cadence.remaining > 1 ? "s" : ""} actif${cadence.remaining > 1 ? "s" : ""} pour tenir ta semaine.`}
              </T>
            </View>
          </Reveal>
        ) : null}

        {mastery ? <Tap accessibilityLabel={`Ma maîtrise ${mastery.label}`} accessibilityState={{ expanded: detailsExpanded }} onPress={() => setDetailsExpanded(!detailsExpanded)} style={styles.between}>
          <T variant="bodyStrong">Ma maîtrise · {mastery.label}</T><Icon name="chevron" size={18} color={colors.tx4} />
        </Tap> : null}
        {detailsExpanded && mastery ? (
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
            <T variant="eyebrow">Dans ton aventure</T>
            <Tap onPress={() => navigation.navigate("World", { id: world.id })} accessibilityLabel={`${world.name}, ${world.chapters[campaign.chapter - 1]?.name}. ${impact.text} Voir la prochaine étape.`} style={styles.quest}>
              <Image source={worldImages[world.image]} style={styles.questImg} />
              <View style={{ flex: 1, gap: 4 }}>
                <T variant="caption" color={world.color}>
                  {world.name} · chapitre {campaign.chapter}
                </T>
                <T variant="bodyStrong" numberOfLines={2}>
                  {world.chapters[campaign.chapter - 1]?.name}
                </T>
                {impact.campaignId ? <ProgressBar value={chapterDays / Math.max(1, campaign.target)} color={world.color} height={5} delay={800} accessibilityLabel="Avancée du chapitre confirmée" /> : null}
                <T variant="caption" tone="faint" accessibilityLiveRegion="polite">{impact.text}</T>
                <T variant="caption">Voir la prochaine étape</T>
              </View>
              <Icon name="chevron" size={18} color={colors.tx4} />
            </Tap>
          </Reveal>
        ) : !historical ? <Reveal order={5}><Card style={{ gap: space.s3 }}><T variant="eyebrow">Dans ton aventure</T><T accessibilityLiveRegion="polite">{impact.text}</T><Button label="Découvrir les mondes" kind="secondary" onPress={() => navigation.navigate("Tabs", { screen: "Adventure" })} /></Card></Reveal> : null}
        {counts.length ? (
          <Reveal order={6}>
            <Card style={{ gap: 4 }} testID="result-contributions">
              <T variant="eyebrow" tone="accent">Ta séance compte aussi pour</T>
              {counts.map((c) => <T key={c} variant="small">· {c}</T>)}
            </Card>
          </Reveal>
        ) : null}

        <View style={styles.block} testID="result-next">
          <T variant="eyebrow">Et maintenant</T>
          <T accessibilityLiveRegion="polite">{next}</T>
        </View>
        {/* Whole buttons, each label on one line: those that do not fit side by side go to the next line and share its width. */}
        <View style={styles.secondary}>
          {status === "confirmed" && !historical ? <Button small label="En image" kind="secondary" icon="share" loading={imageBusy} onPress={shareImage} style={styles.secondaryButton} testID="share-image" /> : null}
          {status === "confirmed" && !shared && !historical ? <Button small label="Aux amis" kind="secondary" icon="send" loading={sharing} disabled={!online} onPress={share} style={styles.secondaryButton} /> : null}
          <Button small label="Voir le journal" kind="secondary" icon="journal" onPress={() => navigation.navigate("Journal")} style={styles.secondaryButton} />
        </View>
        </View>
      </ScrollView>
      {/* The signature moment: only for a gain the server confirmed (a receipt with XP), never for a held, historical or pending session, and never in the end-to-end build (it would sit over the buttons the flow taps). */}
      {revealing && !IS_E2E && status === "confirmed" && !historical && receipt && !receipt.reward_held && xp > 0 ? (
        <ProgressReveal
          input={{ xp, credits, level, levelXp, need, leveledUp, record: (() => { const rec = records.find((r) => !r.first); return rec ? `${rec.label} ${recordText(rec)}` : null; })() }}
          onDone={() => {
            revealed.add(eventId);
            setRevealing(false);
          }}
        />
      ) : null}
      {status === "confirmed" ? <View style={{ paddingHorizontal: space.s4 }}><DiscoveryBanner onPress={() => navigation.navigate("SaveAccount")} /></View> : null}
      {status === "confirmed" && !historical ? (
        <View style={styles.offscreen} pointerEvents="none">
          <ShareCard ref={cardRef} data={cardData} />
        </View>
      ) : null}
      <View style={[styles.actions, { paddingBottom: insets.bottom + space.s4 }]}>
        {status !== "confirmed" ? <Button small label="Voir les envois en attente" kind="secondary" onPress={() => navigation.replace("Pending")} /> : null}
        <Button
          label="Terminer"
          onPress={() => {
            maybeAd().catch(() => {});
            // AUD-13: a rare Play rating request at a proud moment (new record or tenth session), never for an unconfirmed or historical one.
            if (status === "confirmed" && log)
              void maybeAskForReview(owner, { confirmedSessions: logs.filter((l) => l.syncStatus === "confirmed" || !l.syncStatus).length, newRecord: records.some((r) => !r.first), historical: !!log.details?.historical });
            navigation.navigate("Tabs", { screen: "QG" });
          }}
          testID="result-done"
        />
      </View>
    </View>
    </SpaceProvider>
  );
}

const styles = StyleSheet.create({
  offscreen: { position: "absolute", left: -10000, top: 0 },
  root: { flex: 1, backgroundColor: colors.bg },
  field: { backgroundColor: spaces.seance.accent, paddingHorizontal: space.s5, paddingBottom: space.s5, gap: space.s4 },
  scroll: { padding: space.s5, gap: space.s5 },
  head: { flexDirection: "row", alignItems: "center", gap: space.s3 },
  sportDisc: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  hero: { fontFamily: fonts.figure, fontSize: 96, lineHeight: 92, letterSpacing: -1.5, color: spaces.seance.ink, fontVariant: ["tabular-nums"] },
  facts: { flexDirection: "row", gap: space.s5, borderTopWidth: 1.5, borderColor: "rgba(22,28,0,0.28)", paddingTop: space.s3 },
  fact: { flex: 1, gap: 0 },
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
  secondary: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
  secondaryButton: { flexGrow: 1, flexShrink: 0, flexBasis: "auto" },
  actions: { paddingHorizontal: space.s4, paddingTop: space.s3, gap: space.s3, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
});
