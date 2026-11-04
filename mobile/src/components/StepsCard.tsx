import { useNavigation } from "@react-navigation/native";
import { StyleSheet, View } from "react-native";
import { useSteps } from "../data/steps";
import { approxKm } from "../lib/stepLedger";
import { freshness, stepsText } from "../lib/steps";
import { colors, space, TOUCH } from "../theme/tokens";
import { Button } from "./Button";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { Ring } from "./Progress";
import { Skeleton } from "./States";
import { T } from "./Text";

const go = (navigation: unknown, name: string) => (navigation as { navigate: (n: string) => void }).navigate(name);

/** One honest line under the number: where it comes from and how fresh it is. Never "temps réel" for a delayed source. */
export function stepsStatus(s: { source: "titan" | "health_connect" | null; own: { live: boolean; partialFirstDay: boolean; startedAt: number | null }; view: { lastUpdate: string | null } }, now: number) {
  if (s.source === "titan" && s.own.live) return { live: true, text: "En direct · compteur de ton téléphone", level: "fresh" as const };
  if (s.source === "titan") return { live: false, text: "Compteur TITAN · mis à jour à l’ouverture de l’app", level: "old" as const };
  const f = freshness(s.view.lastUpdate, now);
  return { live: false, text: s.source === "health_connect" ? `Santé Connect · ${f.label}` : f.label, level: f.level };
}

/** Steps of the day on the QG: a ring, the number, the goal. Tap for the week, the goal and the sources. Honest by construction: a day
    without a number says so (never 0), two sources are never added, and the invitations only appear when they bring something. */
export function StepsCard() {
  const s = useSteps();
  const navigation = useNavigation();
  if (s.failed) return null;

  // Room is kept while the sensor, the storage and the permission check answer: the QG below must not slide down (V12-05).
  if (s.loading && !s.hasAny)
    return (
      <Card style={{ gap: space.s3, minHeight: 112 }} testID="steps-loading" accessibilityLabel="Chargement des pas du jour">
        <View style={styles.row}>
          <Skeleton width={84} height={84} style={{ borderRadius: 42 }} />
          <View style={{ flex: 1, gap: space.s2 }}>
            <Skeleton width="40%" height={12} />
            <Skeleton width="55%" height={30} />
            <Skeleton width="70%" height={12} />
          </View>
        </View>
      </Card>
    );

  // Nothing counted yet: the best invitation is TITAN's own counter (no third party), then Santé Connect for people who already use it.
  if (!s.hasAny) {
    if (s.own.supported && !s.own.enabled)
      return (
        <Card style={{ gap: space.s3 }} testID="steps-start">
          <View style={styles.row}>
            <View style={styles.badge}>
              <Icon name="run" size={24} color={colors.cy} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="bodyStrong">Compte tes pas avec ton téléphone</T>
              <T variant="small">Sans compte tiers : le capteur de ton téléphone suffit. Rien ne quitte ton téléphone.</T>
            </View>
          </View>
          <Button label="Activer le compteur de pas" icon="check" onPress={() => s.own.enable()} testID="steps-start-open" />
          {s.own.permission === "denied" || s.own.permission === "blocked" ? (
            <T variant="caption" tone="warn" accessibilityRole="alert">
              {s.own.permission === "blocked" ? "L’autorisation « activité physique » est refusée : réactive-la dans les réglages d’Android pour TITAN." : "Sans l’autorisation « activité physique », Android ne laisse pas TITAN lire le capteur."}
            </T>
          ) : null}
        </Card>
      );
    if (s.connected === false || !s.own.supported)
      return (
        <Card style={{ gap: 6 }} testID="steps-connect">
          <T variant="bodyStrong">Tes pas du jour</T>
          <T variant="small" tone="muted">
            {s.own.supported ? "Connecte Santé Connect pour voir tes pas ici." : "Ce téléphone n’a pas de capteur de pas. Connecte Santé Connect pour voir tes pas ici."} Ils ne créent ni séance ni récompense.
          </T>
          <Button small kind="secondary" label="Connecter Santé Connect" onPress={() => go(navigation, "HealthConnect")} testID="steps-connect-open" />
        </Card>
      );
    return null;
  }

  const v = s.view;
  const status = stepsStatus(s, Date.now());
  const label = v.today === null ? "Pas de chiffre pour aujourd’hui" : `${stepsText(v.today)} pas aujourd’hui`;
  return (
    <Card onPress={() => go(navigation, "Steps")} testID="steps-card" accessibilityLabel={`${label}${v.goal ? `, objectif ${stepsText(v.goal)}` : ""}. ${status.text}. Ouvrir le détail des pas.`}>
      <View style={styles.row}>
        <Ring value={v.ratio ?? 0} size={88} stroke={8} color={v.ratio !== null && v.ratio >= 1 ? colors.ok : colors.cy}>
          <Icon name={v.ratio !== null && v.ratio >= 1 ? "check" : "run"} size={26} color={v.ratio !== null && v.ratio >= 1 ? colors.ok : colors.cy} />
        </Ring>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={styles.head}>
            <T variant="eyebrow">Pas du jour</T>
            {status.live ? (
              <View style={styles.live} testID="steps-live">
                <View style={styles.dot} />
                <T variant="caption" tone="accent">
                  En direct
                </T>
              </View>
            ) : null}
          </View>
          {v.today !== null ? (
            <T variant="display" numberOfLines={1} adjustsFontSizeToFit accessibilityLabel={label}>
              {stepsText(v.today)}
            </T>
          ) : (
            <T tone="muted">Pas de chiffre pour aujourd’hui pour le moment.</T>
          )}
          <T variant="caption" tone="faint" numberOfLines={2}>
            {v.goal && v.today !== null ? `sur ${stepsText(v.goal)} · ≈ ${String(approxKm(v.today)).replace(".", ",")} km` : v.today !== null ? `≈ ${String(approxKm(v.today)).replace(".", ",")} km · fixe un objectif dans le détail` : ""}
          </T>
        </View>
        <Icon name="chevron" size={20} color={colors.tx3} />
      </View>
      <T variant="caption" tone={status.level === "fresh" ? "faint" : "warn"} style={{ marginTop: space.s2 }} testID="steps-freshness">
        {status.text}
        {s.own.partialFirstDay && s.source === "titan" && s.own.startedAt ? ` · compté depuis ${new Date(s.own.startedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}
      </T>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.s4 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.s2 },
  live: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.cy },
  badge: { width: TOUCH, height: TOUCH, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.cySoft },
});
