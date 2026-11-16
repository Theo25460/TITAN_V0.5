import { useNavigation } from "@react-navigation/native";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Share, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Alert } from "../../components/Dialog";
import { Avatar } from "../../components/Avatar";
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
import { Program } from "../../core/program";
import { ProgramGrid } from "../../components/ProgramGrid";
import { colors, space, spaces } from "../../theme/tokens";

const INK = spaces.profil.ink;

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
      {icon ? <Icon name={icon} color={compact && fill ? INK : colors.tx2} size={20} /> : null}
      <View style={styles.rowText}>
        <T variant="bodyStrong" color={compact && fill ? INK : undefined}>{title}</T>
        {subtitle ? <T variant="small" color={compact && fill ? INK : undefined} style={compact && fill ? { opacity: 0.76 } : undefined}>{subtitle}</T> : null}
      </View>
      {compact ? null : <Icon name="chevron" size={18} color={colors.tx3} />}
    </Tap>
  );
}

function PassportGroup({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.group}>
      <Tap onPress={() => setOpen(!open)} accessibilityLabel={title} accessibilityState={{ expanded: open }} style={styles.groupHead}>
        <View style={styles.rowText}><T variant="title">{title}</T><T variant="small">{subtitle}</T></View>
        <Icon name={open ? "minus" : "plus"} size={20} color={colors.tx} />
      </Tap>
      {open ? children : null}
    </View>
  );
}

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { signOut, email, owner, isDiscovery } = useAuth();
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
  const span = useMemo(() => Program.span(active, { weeks: 8, maxRows: 4 }), [active]);
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
    // AUD-33: a discovery account has no e-mail or password: signing out loses it for good, so saving comes first.
    if (isDiscovery) {
      Alert.alert(
        "Ton compte d’essai sera perdu",
        "Ce compte n’a ni e-mail ni mot de passe : une fois déconnecté, tes séances et ta progression ne pourront plus être retrouvées. Sauvegarde-le d’abord, c’est gratuit.",
        [
          { text: "Sauvegarder mon compte", onPress: () => navigation.navigate("SaveAccount") },
          { text: "Annuler", style: "cancel" },
          { text: "Perdre le compte et me déconnecter", style: "destructive", onPress: () => signOut().catch(() => toast({ kind: "err", title: "Déconnexion impossible" })) },
        ],
      );
      return;
    }
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
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen tab padded={false} refreshing={profile.isRefetching || adventureQuery.isRefetching || logs.isRefetching || social.isRefetching || atelier.isRefetching}
        onRefresh={() => { profile.refetch(); adventureQuery.refetch(); logs.refetch(); social.refetch(); atelier.refetch(); }}>
        {/* Who I am, on the chalk field of this space: the face, the name, the rank and its crest, and the XP towards the next level. */}
        <View style={[styles.field, { paddingTop: insets.top + space.s5 }]} testID="profile-identity">
          <View style={[styles.head, stacked && styles.stacked]}>
            <Avatar id={adventure?.avatar} frame={String((p?.appearance as Record<string, unknown> | undefined)?.frame ?? "")} size={76} />
            <View style={[styles.rowText, stacked && styles.intrinsic]}>
              <T variant="h1" color={INK}>{p?.username || "Athlète"}</T>
              <T variant="title" color={INK} style={{ opacity: 0.78 }} accessibilityLiveRegion="polite">{level !== undefined ? `Niveau ${level} · ${EffortRules.rank(level).name}` : profile.isLoading || adventureQuery.isLoading ? "Chargement de ta progression…" : "Progression en attente de synchronisation"}</T>
            </View>
            {level !== undefined ? <RankCrest rank={rankIdOf(level)} size={width < 360 ? 48 : 76} /> : null}
          </View>
          {level !== undefined ? <View style={{ gap: 6 }}>
            <ProgressBar value={xp / Math.max(1, need)} height={4} color={INK} track="rgba(14,18,22,0.16)" accessibilityLabel="Progression vers le niveau suivant" />
            <View style={styles.between}>
              <T variant="caption" color={INK} style={{ opacity: 0.78 }}>Vers le niveau {level + 1}</T>
              <T variant="caption" color={INK}>{Format.number(xp)} / {Format.number(need)} XP</T>
            </View>
          </View> : null}
          <View style={[styles.actions, stacked && styles.stacked]}>
            <ProfileRow compact fill={!stacked} title="Personnaliser" icon="settings" onPress={() => setPersonalise(true)} />
            {code ? <ProfileRow compact fill={!stacked} title="Code ami" subtitle={`${code} · partager`} icon="share"
              onPress={() => { Share.share({ message: `Ajoute-moi sur TITAN avec mon code ami : ${code}` }).catch(() => {}); }} /> : null}
          </View>
        </View>

        <View style={styles.body}>
        {logs.data !== undefined ? <View testID="profile-metrics" style={[styles.metrics, stacked && styles.stacked]}>
          {choices.map(metric => (
            <View key={metric} style={[styles.metric, stacked && styles.intrinsic]} accessible accessibilityLabel={`${METRICS[metric]} : ${values[metric]}`}>
              <T variant={metric === "favorite" ? "h2" : "figure"} numberOfLines={metric === "favorite" ? 2 : 1} adjustsFontSizeToFit={metric !== "favorite"}>{values[metric]}</T><T variant="caption">{METRICS[metric]}</T>
            </View>
          ))}
        </View> : <T variant="small" accessibilityLiveRegion="polite">{logs.isLoading ? "Chargement de tes indicateurs…" : "Tes indicateurs sont en attente de synchronisation."}</T>}

        {/* My sports, as my programme of the last eight weeks: which ones, how often. The figures themselves live in Progrès. */}
        <Tap onPress={() => navigation.navigate("Tabs", { screen: "Progress" })} accessibilityLabel={`Mes sports. ${sports.length ? sports.map(sp => `${sp.label}${sp.sessions ? `, ${Format.plural(sp.sessions, "séance", "séances")}` : ""}`).join(". ") : "Aucune séance pour l’instant"}. Voir ma progression.`} style={styles.block} testID="profile-sports">
          <View style={styles.between}>
            <T variant="h3">Mes sports</T>
            <T variant="caption" tone="accent">Voir ma progression</T>
          </View>
          {sports.length ? <ProgramGrid grid={span} /> : <T variant="small">Enregistre une séance : tes sports, tes records et ta maîtrise apparaîtront ici.</T>}
        </Tap>

        {/* What the effort earned, one line each: the best record (amber is the colour of records), the insignia, the credits. */}
        <View style={styles.earned}>
          {records.length ? (
            <Tap onPress={() => navigation.navigate("Records")} accessibilityLabel={`Mes records. ${records.map(r => `${r.label}, ${r.sportLabel}`).join(". ")}. Voir tous les records.`} style={styles.earnedRow} testID="profile-records">
              <Icon name="trophy" size={20} color={colors.am} />
              <View style={styles.rowText}>
                <T variant="title">{records[0]!.label} · {records[0]!.sportLabel}</T>
                <T variant="caption">{records.length > 1 ? `et ${records.length - 1} autre${records.length > 2 ? "s" : ""} record${records.length > 2 ? "s" : ""} en tête de ton livre` : "Ton record le plus récent"}</T>
              </View>
              <T variant="num" tone="amber">{typeof records[0]!.value === "number" ? Format.recordValue(records[0]!.unit, records[0]!.value) : records[0]!.value}</T>
            </Tap>
          ) : null}
          {adventure ? (
            <View style={styles.distinctions} testID="profile-distinctions">
              <Tap onPress={() => navigation.navigate("Tabs", { screen: "Adventure" })} style={styles.distinction} accessibilityLabel={`Insignes d’aventure : ${insignia ?? 0} sur ${Codex.worlds?.length ? Codex.worlds.length * 9 : 36}. Ouvrir l’aventure.`}>
                <T variant="num">{insignia ?? 0}<T variant="small" tone="faint"> / {Codex.worlds?.length ? Codex.worlds.length * 9 : 36}</T></T>
                <T variant="caption">Insignes d’aventure</T>
              </Tap>
              <Tap onPress={() => navigation.navigate("Atelier")} style={styles.distinction} accessibilityLabel={`Crédits : ${Format.number(adventure.credits ?? 0)}. Ouvrir l’Atelier.`}>
                <T variant="num">{Format.number(adventure.credits ?? 0)}</T>
                <T variant="caption">Crédits à dépenser à l’Atelier</T>
              </Tap>
            </View>
          ) : null}
        </View>

        <PassportGroup title="Mon identité" subtitle="Personnage, collection et jalons de carrière">
          <ProfileRow icon="user" title="Mon personnage" onPress={() => setPersonalise(true)} />
          <ProfileRow icon="star" title="Collection et titres" subtitle="Les souvenirs gagnés par mon effort" onPress={() => navigation.navigate("Tabs", { screen: "Adventure" })} />
          <ProfileRow icon="qr" title="Ma carte publique" subtitle="Choisir ce que je partage" onPress={() => navigation.navigate("PublicCard")} />
          <View style={styles.inGroup}><CareerMilestones owner={owner ?? ""} /></View>
        </PassportGroup>
        <PassportGroup title="Mon sport" subtitle="Journal, favoris, objectifs et records">
          <ProfileRow icon="journal" title="Mon journal" subtitle={logs.data !== undefined ? `${Format.plural(dna.sessions, "séance enregistrée", "séances enregistrées")}` : undefined} onPress={() => navigation.navigate("Journal")} testID="profile-journal" />
          <ProfileRow icon="run" title="Mes sports favoris" subtitle={prefs.favoriteSports.length ? prefs.favoriteSports.map(sport => Sports.label(sport)).join(", ") : "Choisir mes disciplines"} onPress={() => navigation.navigate("Sports")} />
          <ProfileRow icon="target" title="Mes objectifs" onPress={() => navigation.navigate("Tabs", { screen: "Progress", params: { tab: "goals" } })} />
          <ProfileRow icon="trophy" title="Mes records" onPress={() => navigation.navigate("Records")} />
          <ProfileRow icon="group" title="Ma communauté" onPress={() => navigation.navigate("Community")} />
          <ProfileRow icon="send" title="Lettres à moi-même" onPress={() => navigation.navigate("Capsules")} />
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
        </View>
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
  field: { backgroundColor: spaces.profil.accent, paddingHorizontal: space.s5, paddingBottom: space.s5, gap: space.s4 },
  body: { paddingHorizontal: space.s5, paddingTop: space.s5, gap: space.s5 },
  head: { flexDirection: "row", alignItems: "center", gap: space.s4 },
  stacked: { flexDirection: "column", alignItems: "stretch", flexWrap: "nowrap" },
  // Explicit (not `flex: 0`): the stacked cells keep their content height on every platform.
  intrinsic: { flexGrow: 0, flexShrink: 0, flexBasis: "auto" },
  action: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: space.s2, paddingVertical: space.s2, paddingHorizontal: space.s3, borderRadius: 8, borderWidth: 1.5, borderColor: "rgba(14,18,22,0.26)" },
  // The two actions share a row when both fit and wrap otherwise (long name of an action at a large text size): never squeezed letter by letter.
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
  fill: { flexGrow: 1, flexShrink: 0, flexBasis: "auto" },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.s2 },
  row: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: space.s3, paddingVertical: space.s3, borderTopWidth: 1, borderTopColor: colors.line },
  rowText: { flex: 1, minWidth: 0, gap: 4 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: space.s5 },
  metric: { flex: 1, minWidth: 80, gap: 2 },
  block: { gap: space.s3, borderTopWidth: 2, borderTopColor: colors.tx, paddingTop: space.s3 },
  earned: { borderTopWidth: 2, borderTopColor: colors.tx },
  earnedRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: space.s3, paddingVertical: space.s3, borderBottomWidth: 1, borderBottomColor: colors.line },
  distinctions: { flexDirection: "row", gap: space.s5 },
  distinction: { flex: 1, minHeight: 68, justifyContent: "center", gap: 2, paddingVertical: space.s3 },
  group: { borderTopWidth: 1, borderTopColor: colors.line2 },
  groupHead: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: space.s3, paddingVertical: space.s3 },
  inGroup: { paddingVertical: space.s3, borderTopWidth: 1, borderTopColor: colors.line },
});
