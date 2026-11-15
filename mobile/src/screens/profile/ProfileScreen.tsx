import { useNavigation } from "@react-navigation/native";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Share, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Alert } from "../../components/Dialog";
import { Avatar } from "../../components/Avatar";
import { Card } from "../../components/Card";
import { RankCrest, rankIdOf } from "../../components/Crest";
import { Icon, type IconName } from "../../components/Icon";
import { CareerMilestones } from "../../components/JourneyCard";
import { Tap } from "../../components/Pressable";
import { ProgressBar } from "../../components/Progress";
import { Screen } from "../../components/Screen";
import { Sheet } from "../../components/Sheet";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { CareerRules, Codex, EffortRules, Format, Progress, Sports } from "../../core";
import { useAuth } from "../../data/auth";
import { useAdventure, useAdventureAction, useAtelier, useLogs, usePrefs, useProfile, useSocial } from "../../data/hooks";
import { useQueue } from "../../data/queue";
import { errorMessage } from "../../lib/errors";
import { useOnline } from "../../lib/network";
import { ownerKey, readJSON, writeJSON } from "../../lib/storage";
import { colors, space } from "../../theme/tokens";

const METRICS = { sessions: "Séances", time: "De pratique", weeks: "Semaines tenues", favorite: "Sport le plus pratiqué" };
type Metric = keyof typeof METRICS;
const DEFAULT_METRICS: Metric[] = ["sessions", "time", "weeks"];
const validMetrics = (value: unknown): value is Metric[] =>
  Array.isArray(value) && value.length === 3 && new Set(value).size === 3 && value.every(key => Object.hasOwn(METRICS, key));

function ProfileRow({ title, subtitle, icon, onPress, testID, disabled, compact = false, fill = false }: {
  title: string; subtitle?: string; icon?: IconName; onPress: () => void; testID?: string; disabled?: boolean; compact?: boolean;
  /** Share a row with a sibling (the two actions under the character). */
  fill?: boolean;
}) {
  return (
    <Tap testID={testID} onPress={onPress} disabled={disabled} accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title} style={[compact ? styles.action : styles.row, fill && styles.fill]}>
      {icon ? <Icon name={icon} color={colors.cy} size={20} /> : null}
      <View style={styles.rowText}>
        <T variant="bodyStrong">{title}</T>
        {subtitle ? <T variant="small">{subtitle}</T> : null}
      </View>
      {compact ? null : <Icon name="chevron" size={18} />}
    </Tap>
  );
}

function PassportGroup({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.group}>
      <Tap onPress={() => setOpen(!open)} accessibilityLabel={title} accessibilityState={{ expanded: open }} style={styles.groupHead}>
        <View style={styles.rowText}><T variant="title">{title}</T><T variant="small">{subtitle}</T></View>
        <Icon name={open ? "minus" : "plus"} size={20} color={colors.cy} />
      </Tap>
      {open ? children : null}
    </View>
  );
}

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { signOut, email, owner } = useAuth();
  const profile = useProfile();
  const adventureQuery = useAdventure();
  const adventure = adventureQuery.data;
  const atelier = useAtelier();
  const avatarAction = useAdventureAction();
  const online = useOnline();
  const social = useSocial();
  const prefs = usePrefs();
  const queue = useQueue();
  const toast = useToast();
  const { width, fontScale } = useWindowDimensions();
  const logs = useLogs();
  const { active } = logs;
  const dna = useMemo(() => Progress.dna(active), [active]);
  const cadence = useMemo(() => Progress.cadence(active, { target: prefs.weeklyGoalSessions, pauses: prefs.cadencePauses }), [active, prefs]);
  const p = profile.data;
  const level = adventure?.level ?? p?.level;
  const xp = adventure?.xp ?? p?.xp ?? 0;
  const need = adventure?.next_level_xp ?? (level !== undefined ? EffortRules.levelRequirement(level) : 0);
  const code = social.data?.me.friend_code ?? p?.friend_code ?? null;
  const stacked = width < 360 || fontScale > 1.3;
  // The character sheet shows what the journal already proves: the sports practised and the personal records, computed by the site's rules.
  const sports = (dna.topSports ?? []) as { sport?: string; label: string; sessions?: number; minutes?: number }[];
  const records = useMemo(() => {
    try {
      return active.length ? CareerRules.build(active, { range: "all" }).records.slice(0, 3) : [];
    } catch {
      return [];
    }
  }, [active]);
  const insignia = adventure?.rewards?.length ?? null;
  const values: Record<Metric, string> = {
    sessions: Format.number(dna.sessions),
    time: Format.hours(dna.minutes),
    weeks: String(cadence.lifetimeHeld),
    favorite: dna.topSports[0]?.label ?? "À découvrir",
  };

  const [personalise, setPersonalise] = useState(false);
  const [metricState, setMetricState] = useState<{ owner: string | null; choices: Metric[] }>({ owner: null, choices: DEFAULT_METRICS });
  const choices = metricState.owner === owner ? metricState.choices : DEFAULT_METRICS;
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const metricRevision = useRef(0);
  const metricJob = useRef<symbol | null>(null);
  const [metricBusy, setMetricBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const revision = ++metricRevision.current;
    metricJob.current = null;
    setMetricBusy(false);
    setPersonalise(false);
    if (owner) {
      readJSON<unknown>(ownerKey("profile-metrics", owner), DEFAULT_METRICS).then(value => {
        if (active && currentOwner.current === owner && revision === metricRevision.current) {
          setMetricState({ owner, choices: validMetrics(value) ? value : DEFAULT_METRICS });
        }
      });
    }
    return () => { active = false; };
  }, [owner]);

  async function chooseMetric(slot: number, metric: Metric) {
    if (!owner || metricJob.current) return;
    const next = choices.map((value, i) => i === slot ? metric : value);
    if (!validMetrics(next)) return;
    const job = Symbol("profile-metrics");
    metricJob.current = job;
    metricRevision.current++;
    setMetricBusy(true);
    try {
      await writeJSON(ownerKey("profile-metrics", owner), next);
      if (currentOwner.current === owner) setMetricState({ owner, choices: next });
    } catch {
      if (currentOwner.current === owner) toast({ kind: "err", title: "Choix non enregistré", message: "Réessaie avant de quitter cet écran." });
    } finally {
      if (metricJob.current === job) {
        metricJob.current = null;
        if (currentOwner.current === owner) setMetricBusy(false);
      }
    }
  }

  // An active entitlement can come from a grant or a subscription.
  const access = atelier.data?.plus.active;
  const subscription = access === true ? "Accès TITAN+ actif · origine à consulter"
    : access === false ? "Offres et achats Google Play à consulter"
    : atelier.isLoading ? "Vérification de l’accès…" : "Accès non vérifié · réessayer dans l’offre";

  function logout() {
    const pending = queue.items.length;
    Alert.alert(
      "Se déconnecter ?",
      pending ? `${Format.plural(pending, "séance n’a", "séances n’ont")} pas encore été ${pending > 1 ? "envoyées" : "envoyée"}. Elles restent sur ce téléphone et partiront à ta prochaine connexion avec ce compte.` : "Tes données restent sur ton compte TITAN. Les informations affichées sur ce téléphone seront effacées.",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Se déconnecter", style: "destructive", onPress: () => signOut().catch(() => toast({ kind: "err", title: "Déconnexion impossible" })) },
      ],
    );
  }

  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.bg }}>
      <Screen tab refreshing={profile.isRefetching || adventureQuery.isRefetching || logs.isRefetching || social.isRefetching || atelier.isRefetching}
        onRefresh={() => { profile.refetch(); adventureQuery.refetch(); logs.refetch(); social.refetch(); atelier.refetch(); }}>
        <T variant="eyebrow" tone="accent">Mon passeport TITAN</T>
        {/* The character: who I am, my rank and its crest, and the XP towards the next level, read as one block. */}
        <Card style={{ gap: space.s4 }}>
          <View style={[styles.head, stacked && styles.stacked]}>
            <Avatar id={adventure?.avatar} frame={String((p?.appearance as Record<string, unknown> | undefined)?.frame ?? "")} size={72} />
            <View style={[styles.rowText, stacked && styles.intrinsic]}>
              <T variant="h2">{p?.username || "Athlète"}</T>
              <T variant="small" tone="accent" accessibilityLiveRegion="polite">{level !== undefined ? `Niveau ${level} · ${EffortRules.rank(level).name}` : profile.isLoading || adventureQuery.isLoading ? "Chargement de ta progression…" : "Progression en attente de synchronisation"}</T>
            </View>
            {level !== undefined ? <RankCrest rank={rankIdOf(level)} size={width < 360 ? 48 : 64} /> : null}
          </View>
          {level !== undefined ? <View style={{ gap: 6 }}>
            <View style={styles.between}>
              <T variant="small">Vers le niveau {level + 1}</T>
              <T variant="caption">{Format.number(xp)} / {Format.number(need)} XP</T>
            </View>
            <ProgressBar value={xp / Math.max(1, need)} accessibilityLabel="Progression vers le niveau suivant" />
          </View> : null}
          <View style={[styles.actions, stacked && styles.stacked]}>
            <ProfileRow compact title="Personnaliser" icon="settings" onPress={() => setPersonalise(true)} />
            {code ? <ProfileRow compact fill={!stacked} title="Code ami" subtitle={`${code} · partager`} icon="share"
              onPress={() => { Share.share({ message: `Ajoute-moi sur TITAN avec mon code ami : ${code}` }).catch(() => {}); }} /> : null}
          </View>
        </Card>
        {logs.data !== undefined ? <View testID="profile-metrics" style={[styles.metrics, stacked && styles.stacked]}>
          {choices.map(metric => (
            <View key={metric} style={[styles.metric, stacked && styles.intrinsic]} accessible accessibilityLabel={`${METRICS[metric]} : ${values[metric]}`}>
              <T variant="num">{values[metric]}</T><T variant="caption">{METRICS[metric]}</T>
            </View>
          ))}
        </View> : <Card tone="flat"><T variant="small" accessibilityLiveRegion="polite">{logs.isLoading ? "Chargement de tes indicateurs…" : "Tes indicateurs sont en attente de synchronisation."}</T></Card>}

        {/* Sports practised: the journal's own figures, most practised first. */}
        <Card onPress={() => navigation.navigate("Tabs", { screen: "Progress" })} accessibilityLabel={`Mes sports. ${sports.length ? sports.map(sp => `${sp.label}${sp.sessions ? `, ${Format.plural(sp.sessions, "séance", "séances")}` : ""}`).join(". ") : "Aucune séance pour l’instant"}. Voir ma progression.`} style={{ gap: space.s3 }} testID="profile-sports">
          <View style={styles.between}>
            <T variant="eyebrow">Mes sports</T>
            <T variant="caption" tone="accent">Voir ma progression</T>
          </View>
          {sports.length ? sports.map(sp => (
            <View key={sp.sport ?? sp.label} style={styles.line}>
              <Icon name={sp.sport ? Sports.FAMILY_ICON[Sports.familyOf(sp.sport)] : "run"} size={20} color={colors.cy} />
              <T variant="bodyStrong" style={styles.rowText}>{sp.label}</T>
              <T variant="caption">{[sp.sessions ? Format.plural(sp.sessions, "séance", "séances") : null, sp.minutes ? Format.hours(sp.minutes) : null].filter(Boolean).join(" · ")}</T>
            </View>
          )) : <T variant="small">Enregistre une séance : tes sports, tes records et ta maîtrise apparaîtront ici.</T>}
        </Card>

        {/* Records: only when the journal holds some. Amber is the colour of records, used here and nowhere else on the sheet. */}
        {records.length ? (
          <Card onPress={() => navigation.navigate("Records")} accessibilityLabel={`Mes records. ${records.map(r => `${r.label}, ${r.sportLabel}`).join(". ")}. Voir tous les records.`} style={{ gap: space.s3 }} testID="profile-records">
            <View style={styles.between}>
              <T variant="eyebrow" tone="amber">Mes records</T>
              <T variant="caption" tone="accent">Tous les records</T>
            </View>
            {records.map(r => (
              <View key={r.id} style={styles.line}>
                <Icon name="trophy" size={18} color={colors.am} />
                <T variant="small" tone="default" style={styles.rowText}>{r.label} · {r.sportLabel}</T>
                <T variant="bodyStrong">{typeof r.value === "number" ? Format.recordValue(r.unit, r.value) : r.value}</T>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Distinctions and what the effort earned: insignia, credits, then the career milestones. */}
        {adventure ? (
          <View style={[styles.metrics, stacked && styles.stacked]} testID="profile-distinctions">
            <Tap onPress={() => navigation.navigate("Tabs", { screen: "Adventure" })} style={[styles.metric, stacked && styles.intrinsic]} accessibilityLabel={`Insignes d’aventure : ${insignia ?? 0} sur ${Codex.worlds?.length ? Codex.worlds.length * 9 : 36}. Ouvrir l’aventure.`}>
              <Icon name="medal" size={20} color={colors.am} />
              <T variant="num">{insignia ?? 0}<T variant="small" tone="faint"> / {Codex.worlds?.length ? Codex.worlds.length * 9 : 36}</T></T>
              <T variant="caption">Insignes d’aventure</T>
            </Tap>
            <Tap onPress={() => navigation.navigate("Atelier")} style={[styles.metric, stacked && styles.intrinsic]} accessibilityLabel={`Crédits : ${Format.number(adventure.credits ?? 0)}. Ouvrir l’Atelier.`}>
              <Icon name="star" size={20} color={colors.am} />
              <T variant="num">{Format.number(adventure.credits ?? 0)}</T>
              <T variant="caption">Crédits à dépenser à l’Atelier</T>
            </Tap>
          </View>
        ) : null}
        <CareerMilestones owner={owner ?? ""} />
        <ProfileRow compact icon="journal" title="Mon journal" subtitle={logs.data !== undefined ? `${Format.plural(dna.sessions, "séance enregistrée", "séances enregistrées")}` : undefined} onPress={() => navigation.navigate("Journal")} testID="profile-journal" />
        <PassportGroup title="Mon identité" subtitle="Personnage, titres et collection">
          <ProfileRow icon="user" title="Mon personnage" onPress={() => setPersonalise(true)} />
          <ProfileRow icon="star" title="Collection et titres" subtitle="Les souvenirs gagnés par mon effort" onPress={() => navigation.navigate("Tabs", { screen: "Adventure" })} />
          <ProfileRow icon="qr" title="Ma carte publique" subtitle="Choisir ce que je partage" onPress={() => navigation.navigate("PublicCard")} />
        </PassportGroup>
        <PassportGroup title="Mon sport" subtitle="Favoris, objectifs et historique">
          <ProfileRow icon="run" title="Mes sports favoris" subtitle={prefs.favoriteSports.length ? prefs.favoriteSports.map(sport => Sports.label(sport)).join(", ") : "Choisir mes disciplines"} onPress={() => navigation.navigate("Sports")} />
          <ProfileRow icon="target" title="Mes objectifs" onPress={() => navigation.navigate("Tabs", { screen: "Progress", params: { tab: "goals" } })} />
          <ProfileRow icon="trophy" title="Mes records" onPress={() => navigation.navigate("Records")} />
          <ProfileRow icon="group" title="Ma communauté" onPress={() => navigation.navigate("Community")} />
        </PassportGroup>
        <PassportGroup title="Connexions & compte" subtitle="Sources, confidentialité et abonnement">
          <ProfileRow icon="cloud" title="Sources et capteurs" subtitle="Pas, Santé Connect, Garmin, GPS" onPress={() => navigation.navigate("Sources")} testID="profile-sources" />
          <ProfileRow icon="crown" title="TITAN+ et abonnement" subtitle={subscription} onPress={() => navigation.navigate("TitanPlus")} testID="profile-subscription" />
          <ProfileRow icon="user" title="Compte et sécurité" subtitle={email ?? undefined} onPress={() => navigation.navigate("Account")} />
          <ProfileRow icon="lock" title="Confidentialité" onPress={() => navigation.navigate("Privacy")} />
          <ProfileRow icon="globe" title="TITAN sur le site" subtitle="Analyses, exports et services Web" onPress={() => navigation.navigate("WebHub")} testID="profile-web" />
        </PassportGroup>
        <PassportGroup title="Aide & préférences" subtitle="Rappels, affichage et assistance">
          <ProfileRow icon="bell" title="Rappels" onPress={() => navigation.navigate("Notifications")} />
          <ProfileRow icon="settings" title="Affichage et préférences" onPress={() => navigation.navigate("Settings")} />
          <ProfileRow icon="help" title="Assistance" onPress={() => navigation.navigate("Help")} />
          <ProfileRow icon="shield" title="Informations légales" onPress={() => navigation.navigate("Legal")} />
          <ProfileRow icon="info" title="À propos de TITAN" onPress={() => navigation.navigate("About")} />
        </PassportGroup>
        <ProfileRow compact title="Se déconnecter" icon="logout" onPress={logout} testID="logout" />
      </Screen>
      <Sheet visible={personalise} onClose={() => setPersonalise(false)} title="Personnaliser mon passeport">
        <T variant="h3">Mes trois indicateurs</T>
        <T variant="small">Ces choix restent sur cet appareil, pour ce compte.</T>
        {choices.map((metric, slot) => (
          <View key={slot} style={{ gap: space.s2 }}>
            <T variant="small">Indicateur {slot + 1} · {METRICS[metric]}</T>
            {(Object.keys(METRICS) as Metric[]).filter(key => !choices.includes(key)).map(key => (
              <ProfileRow compact key={key} disabled={metricBusy} title={`Afficher ${METRICS[key]} en position ${slot + 1}`} onPress={() => { chooseMetric(slot, key); }} />
            ))}
          </View>
        ))}
        <T variant="h3">Ton personnage</T>
        {!online ? <T variant="small">Le changement de personnage demande une connexion.</T> : null}
        {Codex.avatars.map(avatar => (
          <ProfileRow compact key={avatar.id} title={avatar.name}
            subtitle={level === undefined ? "Progression indisponible" : avatar.level > level ? `Niveau ${avatar.level} requis` : adventure?.avatar === avatar.id ? "Personnage actuel" : "Choisir ce personnage"}
            disabled={level === undefined || avatar.level > level || !online || !adventure || avatarAction.isPending}
            onPress={() => {
              avatarAction.mutateAsync({ action: "avatar", params: { avatar: avatar.id } })
                .then(() => { if (currentOwner.current === owner) toast({ kind: "ok", title: `${avatar.name} t’accompagne` }); })
                .catch(error => { if (currentOwner.current === owner) toast({ kind: "err", title: "Changement impossible", message: errorMessage(error) }); });
            }} />
        ))}
        <ProfileRow compact icon="star" title="Cadres et cosmétiques" onPress={() => { setPersonalise(false); navigation.navigate("Atelier"); }} />
        <ProfileRow compact icon="user" title="Modifier mon nom" onPress={() => { setPersonalise(false); navigation.navigate("Account"); }} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space.s4 },
  stacked: { flexDirection: "column", alignItems: "stretch", flexWrap: "nowrap" },
  intrinsic: { flex: 0 },
  action: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: space.s2, padding: space.s3, borderRadius: 12, borderWidth: 1, borderColor: colors.line2 },
  actions: { flexDirection: "row", gap: space.s2 },
  fill: { flex: 1, minWidth: 0 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.s2 },
  line: { flexDirection: "row", alignItems: "center", gap: space.s3, minHeight: 28 },
  row: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: space.s3, padding: space.s4, borderTopWidth: 1, borderTopColor: colors.line },
  rowText: { flex: 1, minWidth: 0, gap: 4 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: space.s3 },
  metric: { flex: 1, minWidth: 80, gap: 4, padding: space.s3, backgroundColor: colors.bg2, borderRadius: 14, borderWidth: 1, borderColor: colors.line },
  group: { backgroundColor: colors.bg2, borderRadius: 18, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  groupHead: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: space.s3, padding: space.s4 },
});
