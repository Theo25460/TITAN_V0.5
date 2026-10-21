import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { ProgressBar } from "../../components/Progress";
import { Stat, StatRow } from "../../components/Section";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { EffortRules, Format, Progress, Sports } from "../../core";
import { momentShare } from "../../data/api";
import { useAdventure, useLogs, usePrefs, useProfile } from "../../data/hooks";
import { useQueue } from "../../data/queue";
import { useReceipt } from "../../data/receipts";
import { errorMessage } from "../../lib/errors";
import { useReducedMotion } from "../../lib/motion";
import { useOnline } from "../../lib/network";
import type { RootParams } from "../../navigation/types";
import { colors, space } from "../../theme/tokens";

/** The "moment" after a session: what was recorded, what the server confirmed, what it changes. */
export function SessionResultScreen({ navigation, route }: NativeStackScreenProps<RootParams, "SessionResult">) {
  const { eventId } = route.params;
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
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

  const scale = useRef(new Animated.Value(reduced ? 1 : 0.6)).current;
  useEffect(() => {
    if (!reduced) Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
  }, [reduced, scale]);

  const effort = log ? Progress.effortOf(log) : null;
  const cadence = useMemo(() => Progress.cadence(active, { target: prefs.weeklyGoalSessions, pauses: prefs.cadencePauses }), [active, prefs]);
  const xp = receipt?.xp ?? (log?.syncStatus === "confirmed" ? log.xp : null);
  const level = receipt?.level_after ?? adventure?.level ?? profile?.level ?? 1;
  const levelXp = receipt?.xp_after ?? adventure?.xp ?? profile?.xp ?? 0;
  const need = EffortRules.levelRequirement(level);
  const activeCampaign = adventure?.campaigns.find((c) => c.chapter > 0 && c.chapter < 10);

  if (!log)
    return (
      <View style={[styles.root, { paddingTop: insets.top + space.s6 }]}>
        <T variant="h2">Séance enregistrée</T>
        <Button label="Retour au QG" onPress={() => navigation.navigate("Tabs", { screen: "QG" })} />
      </View>
    );

  const main = log.unit === "km" ? Format.distance(log.val) : log.unit === "m" ? `${Format.number(log.val)} m` : log.unit === "min" ? Format.duration(log.val) : log.details?.exercises?.length ? `${log.details.exercises.length} exercice${log.details.exercises.length > 1 ? "s" : ""}` : `${Format.number(log.val)} ${log.unit}`;

  async function share() {
    if (!log || sharing) return;
    setSharing(true);
    try {
      await momentShare({ kind: "session", title: `${Sports.label(log.sport)} · ${main}`, detail: effort ? `${Format.duration(effort.minutes)} d’effort` : null, sport: log.sport, logId: log.id, visibility: "friends" });
      setShared(true);
      toast({ kind: "ok", title: "Moment partagé avec tes amis" });
    } catch (e) {
      toast({ kind: "err", title: "Partage impossible", message: errorMessage(e) });
    } finally {
      setSharing(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.s5, paddingBottom: insets.bottom + space.s4 }]}>
      <View style={{ flex: 1, gap: space.s5 }}>
        <Animated.View style={[styles.badge, { transform: [{ scale }] }]}>
          <Icon name="check" size={40} color={colors.cyInk} strokeWidth={2.6} />
        </Animated.View>
        <View style={{ gap: 6 }}>
          <T variant="eyebrow" tone="accent">
            {Format.relativeDay(log.date)} · {Sports.label(log.sport)}
          </T>
          <T variant="display">{main}</T>
          {effort ? (
            <T tone="muted">
              {Format.duration(effort.minutes)}
              {effort.estimated ? " estimées" : ""} · {Math.round(effort.effortMinutes)} min d’effort
            </T>
          ) : null}
        </View>

        <Card tone={status === "confirmed" ? "accent" : status === "error" ? "default" : "flat"} style={{ gap: space.s3 }}>
          <View style={{ flexDirection: "row", gap: space.s3, alignItems: "center" }}>
            <Icon name={status === "confirmed" ? "cloud" : status === "error" ? "alert" : "offline"} size={22} color={status === "confirmed" ? colors.cy : status === "error" ? colors.err : colors.warn} />
            <View style={{ flex: 1 }}>
              <T variant="bodyStrong" accessibilityLiveRegion="polite">
                {status === "confirmed" ? (log.details?.historical ? "Ajoutée à ton historique" : `+${Format.number(xp ?? 0)} XP confirmés`) : status === "error" ? "Le serveur a refusé cette séance" : online ? "Envoi en cours…" : "Gardée sur ce téléphone"}
              </T>
              <T variant="small">
                {status === "confirmed"
                  ? receipt && receipt.xp < receipt.requested_xp
                    ? `Plafond atteint : ${receipt.requested_xp} XP demandés, ${receipt.xp} accordés.`
                    : `+${Format.number(receipt?.credits ?? (Number(log.details?.credits) || 0))} crédits. Calculé par le serveur, comme sur le site.`
                  : status === "error"
                    ? queued?.reason || "Corrige ou supprime-la depuis les envois en attente."
                    : "Elle partira automatiquement dès que la connexion revient. Rien n’est perdu."}
              </T>
            </View>
          </View>
          {status === "confirmed" ? (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <T variant="caption" tone="muted">
                  Niveau {level} · {EffortRules.rank(level).name}
                  {receipt?.leveled_up ? " · niveau supérieur !" : ""}
                </T>
                <T variant="caption" tone="faint">
                  {Format.number(levelXp)} / {Format.number(need)} XP
                </T>
              </View>
              <ProgressBar value={levelXp / need} accessibilityLabel="Progression vers le niveau suivant" />
            </View>
          ) : null}
        </Card>

        <StatRow>
          <Stat label="jours actifs cette semaine" value={`${cadence.currentDays}/${cadence.target}`} tone={cadence.remaining === 0 ? "accent" : undefined} />
          <Stat label="semaines tenues sur 8" value={String(cadence.held)} />
        </StatRow>
        {activeCampaign ? (
          <T variant="small">Ta campagne en cours prend en compte tes jours actifs : ouvre l’Aventure pour voir le chapitre avancer.</T>
        ) : null}
      </View>
      <View style={{ gap: space.s3 }}>
        {status === "confirmed" && !shared ? <Button label="Partager avec mes amis" kind="secondary" icon="send" loading={sharing} disabled={!online} onPress={share} /> : null}
        {status === "error" ? <Button label="Voir les envois en attente" kind="secondary" onPress={() => navigation.replace("Pending")} /> : null}
        <Button label="Terminer" onPress={() => navigation.navigate("Tabs", { screen: "QG" })} testID="result-done" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.s4, gap: space.s4 },
  badge: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.cy, alignItems: "center", justifyContent: "center" },
});
