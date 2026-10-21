import { useNavigation } from "@react-navigation/native";
import { useMemo } from "react";
import { Alert, Share, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../../components/Avatar";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Group, ListRow } from "../../components/ListRow";
import { ProgressBar } from "../../components/Progress";
import { Screen } from "../../components/Screen";
import { Stat, StatRow } from "../../components/Section";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { EffortRules, Format, Progress, Sports } from "../../core";
import { useAuth } from "../../data/auth";
import { useAdventure, useLogs, usePrefs, useProfile, useSocial } from "../../data/hooks";
import { useQueue } from "../../data/queue";
import { colors, space } from "../../theme/tokens";

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { signOut, email } = useAuth();
  const profile = useProfile();
  const adventure = useAdventure().data;
  const social = useSocial();
  const prefs = usePrefs();
  const queue = useQueue();
  const toast = useToast();
  const { active } = useLogs();
  const dna = useMemo(() => Progress.dna(active), [active]);
  const cadence = useMemo(() => Progress.cadence(active, { target: prefs.weeklyGoalSessions, pauses: prefs.cadencePauses }), [active, prefs]);
  const p = profile.data;
  const level = adventure?.level ?? p?.level ?? 1;
  const xp = adventure?.xp ?? p?.xp ?? 0;
  const need = adventure?.next_level_xp ?? EffortRules.levelRequirement(level);
  const code = social.data?.me.friend_code ?? p?.friend_code ?? null;

  function logout() {
    const pending = queue.items.length;
    Alert.alert(
      "Se déconnecter ?",
      pending ? `${pending} séance(s) n’ont pas encore été envoyées. Elles restent sur ce téléphone et partiront à ta prochaine connexion avec ce compte.` : "Tes données restent sur ton compte TITAN. Les informations affichées sur ce téléphone seront effacées.",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Se déconnecter", style: "destructive", onPress: () => signOut().catch(() => toast({ kind: "err", title: "Déconnexion impossible" })) },
      ],
    );
  }

  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.bg }}>
      <Screen tab refreshing={profile.isRefetching} onRefresh={() => { profile.refetch(); social.refetch(); }}>
        <View style={styles.head}>
          <Avatar id={adventure?.avatar} frame={String((p?.appearance as Record<string, unknown> | undefined)?.frame ?? "")} size={80} />
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="h2" numberOfLines={1}>
              {p?.username || "Athlète"}
            </T>
            <T variant="caption" tone="accent">
              Niveau {level} · {EffortRules.rank(level).name}
            </T>
            {code ? (
              <Chip
                label={`Code ami ${code}`}
                icon="share"
                onPress={() => Share.share({ message: `Ajoute-moi sur TITAN avec mon code ami : ${code}` }).catch(() => {})}
              />
            ) : null}
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <T variant="caption" tone="muted">
              Vers le niveau {level + 1}
            </T>
            <T variant="caption" tone="faint">
              {Format.number(xp)} / {Format.number(need)} XP
            </T>
          </View>
          <ProgressBar value={xp / Math.max(1, need)} accessibilityLabel="Progression vers le niveau suivant" />
        </View>
        <StatRow>
          <Stat label="séances" value={Format.number(dna.sessions)} />
          <Stat label="de pratique" value={Format.hours(dna.minutes)} />
          <Stat label="semaines tenues" value={String(cadence.lifetimeHeld)} />
          <Stat label="crédits" value={Format.number(adventure?.credits ?? p?.credits ?? 0)} tone="amber" />
        </StatRow>
        {dna.masteries.length ? (
          <Card tone="flat" style={{ gap: 6 }} onPress={() => navigation.navigate("Tabs", { screen: "Progress" })} accessibilityLabel="Voir mes maîtrises">
            <T variant="eyebrow">Maîtrises</T>
            {dna.masteries.slice(0, 3).map((m) => (
              <T key={m.sport} variant="small" tone="default">
                {m.label} · maîtrise {m.level} ({m.name}) · {Format.number(m.hours, 1)} h
              </T>
            ))}
          </Card>
        ) : null}

        <Group title="Progression et communauté">
          <ListRow icon="star" title="Atelier" subtitle="Cosmétiques gagnés avec tes crédits" onPress={() => navigation.navigate("Atelier")} />
          <ListRow icon="group" title="Communauté" subtitle={social.data?.requests_in.length ? `${social.data.requests_in.length} demande(s) d’ami en attente` : "Amis, moments, défis et guilde"} onPress={() => navigation.navigate("Community")} />
          <ListRow icon="qr" title="Carte publique" subtitle="Partager une carte de ton parcours" onPress={() => navigation.navigate("PublicCard")} />
          <ListRow icon="crown" title="TITAN+" subtitle="Bientôt disponible" onPress={() => navigation.navigate("TitanPlus")} last />
        </Group>

        <Group title="Compte">
          <ListRow icon="user" title="Compte et sécurité" subtitle={email ?? undefined} onPress={() => navigation.navigate("Account")} />
          <ListRow icon="run" title="Mes sports" subtitle={prefs.favoriteSports.length ? prefs.favoriteSports.map((s) => Sports.label(s)).join(", ") : "Choisir mes sports favoris"} onPress={() => navigation.navigate("Sports")} />
          <ListRow icon="lock" title="Confidentialité" onPress={() => navigation.navigate("Privacy")} />
          <ListRow icon="bell" title="Rappels" onPress={() => navigation.navigate("Notifications")} />
          <ListRow icon="settings" title="Réglages de l’application" onPress={() => navigation.navigate("Settings")} last />
        </Group>

        <Group title="Aide">
          <ListRow icon="help" title="Assistance" onPress={() => navigation.navigate("Help")} />
          <ListRow icon="shield" title="Informations légales" onPress={() => navigation.navigate("Legal")} />
          <ListRow icon="info" title="À propos de TITAN" onPress={() => navigation.navigate("About")} last />
        </Group>

        <Group>
          <ListRow icon="logout" title="Se déconnecter" danger onPress={logout} testID="logout" last />
        </Group>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", gap: space.s4, alignItems: "center" },
});
