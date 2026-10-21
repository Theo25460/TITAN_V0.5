import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Alert, StyleSheet, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Screen } from "../../components/Screen";
import { Section, Stat, StatRow } from "../../components/Section";
import { sessionHeadline } from "../../components/SessionRow";
import { Icon } from "../../components/Icon";
import { EmptyState } from "../../components/States";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Format, Progress, Sports, Training } from "../../core";
import { recordText, sessionRecords } from "../../core/moment";
import { RPE_TEXT } from "../../core/session";
import { useLogs, useUpdateSession } from "../../data/hooks";
import { errorMessage } from "../../lib/errors";
import { useOnline } from "../../lib/network";
import type { RootParams } from "../../navigation/types";
import { colors, space } from "../../theme/tokens";

export function SessionDetailScreen({ navigation, route }: NativeStackScreenProps<RootParams, "SessionDetail">) {
  const { logs, archived } = useLogs();
  const update = useUpdateSession();
  const online = useOnline();
  const toast = useToast();
  const log = [...logs, ...archived].find((l) => l.id === route.params.id || l.client_event_id === route.params.id);
  if (!log)
    return (
      <Screen>
        <EmptyState icon="journal" title="Séance introuvable" text="Elle a peut-être été archivée sur un autre appareil." action="Ouvrir le journal" onAction={() => navigation.replace("Journal")} />
      </Screen>
    );

  const d = log.details || {};
  const effort = Progress.effortOf(log);
  const minutes = Training.duration(log);
  const confirmed = log.syncStatus === "confirmed";
  const ex = d.exercises || [];
  const extras = (d.extras || {}) as Record<string, unknown>;
  const records = confirmed && !log.archived_at ? sessionRecords(logs, log) : [];

  function archive() {
    if (!log) return;
    const toArchive = !log.archived_at;
    Alert.alert(toArchive ? "Archiver cette séance ?" : "Restaurer cette séance ?", toArchive ? "Elle quitte ton journal et tes statistiques. L’XP déjà gagnée reste acquise. Tu peux la restaurer depuis le journal." : "Elle revient dans ton journal et tes statistiques.", [
      { text: "Annuler", style: "cancel" },
      {
        text: toArchive ? "Archiver" : "Restaurer",
        style: toArchive ? "destructive" : "default",
        onPress: async () => {
          try {
            await update.mutateAsync({ log, patch: { archived: toArchive } });
            toast({ kind: "ok", title: toArchive ? "Séance archivée" : "Séance restaurée" });
            if (toArchive) navigation.goBack();
          } catch (e) {
            toast({ kind: "err", title: "Modification impossible", message: errorMessage(e) });
          }
        },
      },
    ]);
  }

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <T variant="eyebrow" tone="accent">
          {Sports.label(log.sport)}
        </T>
        <T variant="display">{sessionHeadline(log)}</T>
        <T tone="muted">
          {Format.longDate(log.date)} à {Format.time(log.date)}
        </T>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          {log.archived_at ? <Chip label="Archivée" tone="warn" /> : null}
          {!confirmed ? <Chip label={log.syncStatus === "error" ? "Refusée par le serveur" : "En attente d’envoi"} tone={log.syncStatus === "error" ? "err" : "warn"} icon="offline" /> : null}
          {d.historical ? <Chip label="Historique (sans XP)" /> : null}
        </View>
      </View>

      <StatRow flat>
        <Stat label="durée" value={minutes ? Format.duration(minutes) : effort.estimated ? `≈ ${Format.duration(effort.minutes)}` : "—"} />
        {log.unit === "km" && minutes ? <Stat label={Sports.paceMode(log.sport) === "pace" ? "allure" : "vitesse"} value={Sports.paceMode(log.sport) === "pace" ? Format.pace(Number(log.val), minutes) : Format.speed(Number(log.val), minutes)} /> : <Stat label="min d’effort" value={String(Math.round(effort.effortMinutes))} />}
        <Stat label={confirmed ? "XP confirmée" : "XP estimée"} value={confirmed ? Format.number(log.xp) : `≈ ${Format.number(effort.xp)}`} tone="accent" />
      </StatRow>

      {confirmed && !d.historical ? (
        <Card tone="flat" style={{ gap: 4 }}>
          <T variant="small">
            {Format.number(log.xp)} XP et {Format.number(Number(d.credits) || 0)} crédits accordés par le serveur.
            {d.dailyCapped || d.weeklyCapped ? " Un plafond (1 800 XP/jour, 9 600/semaine) a limité cette récompense." : ""}
          </T>
          <T variant="caption" tone="faint">
            {Math.round(effort.counted)} min comptées × intensité {String(effort.intensity).replace(".", ",")}
            {effort.rpe ? ` (RPE ${effort.rpe})` : " (RPE par défaut 5)"}.
          </T>
        </Card>
      ) : null}

      {records.length ? (
        <Card tone="amber" style={{ gap: space.s2 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <T variant="eyebrow" tone="amber">
              {records.length > 1 ? "Records établis ce jour-là" : "Record établi ce jour-là"}
            </T>
            <Icon name="trophy" size={18} color={colors.am} />
          </View>
          {records.map((r) => (
            <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: space.s3 }}>
              <T variant="small" tone="default" style={{ flex: 1 }}>
                {r.label}
              </T>
              <T variant="bodyStrong" tone="amber">
                {recordText(r)}
              </T>
              <T variant="caption" tone="faint">
                {r.previous ? `avant ${recordText(r, r.previous.value)}` : "premier repère"}
              </T>
            </View>
          ))}
        </Card>
      ) : null}

      {d.elevation || d.bio?.rpe ? (
        <StatRow flat>
          {d.elevation ? <Stat label="dénivelé" value={`${Format.number(Number(d.elevation))} m`} /> : null}
          {d.bio?.rpe ? <Stat label={RPE_TEXT[Number(d.bio.rpe)] ?? "RPE"} value={`${d.bio.rpe}/10`} /> : null}
        </StatRow>
      ) : null}

      {ex.length ? (
        <Section title="Exercices">
          {ex.map((e, i) => (
            <Card key={i} style={{ gap: 6 }}>
              <T variant="bodyStrong">
                {e.name}
                {e.variant ? ` · ${e.variant}` : ""}
              </T>
              {(e.setRows || []).map((s, k) => (
                <View key={k} style={styles.set}>
                  <T variant="caption" tone="faint" style={{ width: 56 }}>
                    Série {k + 1}
                  </T>
                  <T variant="small" tone="default">
                    {s.seconds ? `${s.seconds} s` : `${s.weight ? `${Format.number(s.weight, 1)} kg × ` : ""}${s.reps} rép.`}
                    {s.rir !== null && s.rir !== undefined ? ` · RIR ${s.rir}` : ""}
                  </T>
                </View>
              ))}
              {e.volume ? (
                <T variant="caption" tone="muted">
                  Volume : {Format.number(e.volume)} kg
                </T>
              ) : null}
            </Card>
          ))}
        </Section>
      ) : null}

      {extras.climbing_discipline ? (
        <Card style={{ gap: 4 }}>
          <T variant="bodyStrong">
            {String(extras.climbing_discipline)} · {String(extras.location || "")} · {String(extras.grade_system || "")}
          </T>
          <T variant="small">{[extras.attempts !== undefined ? `${extras.attempts} essais` : null, extras.successful_routes !== undefined ? `${extras.successful_routes} réussites` : null, extras.max_done ? `meilleure cotation ${extras.max_done}` : null, extras.belay ? String(extras.belay) : null].filter(Boolean).join(" · ")}</T>
        </Card>
      ) : null}

      {d.note ? (
        <Section title="Note">
          <Card tone="flat">
            <T>{d.note}</T>
          </Card>
        </Section>
      ) : null}

      <View style={{ gap: space.s3 }}>
        <Button label="Refaire cette séance" icon="copy" kind="secondary" onPress={() => navigation.navigate("SessionForm", { sport: log.sport, duplicateOf: log.id })} />
        {confirmed ? <Button label="Corriger" icon="edit" kind="secondary" disabled={!online} onPress={() => navigation.navigate("SessionEdit", { id: log.id })} /> : null}
        {confirmed ? <Button label={log.archived_at ? "Restaurer" : "Archiver"} icon={log.archived_at ? "restore" : "archive"} kind={log.archived_at ? "secondary" : "danger"} disabled={!online} loading={update.isPending} onPress={archive} /> : null}
        {!online && confirmed ? (
          <T variant="caption" tone="faint" center>
            Corriger ou archiver une séance déjà synchronisée demande une connexion.
          </T>
        ) : null}
        {!confirmed ? <Button label="Voir les envois en attente" kind="ghost" onPress={() => navigation.navigate("Pending")} /> : null}
      </View>
      <T variant="caption" tone="faint" center style={{ color: colors.tx4 }}>
        Les corrections ne changent jamais les récompenses déjà attribuées.
      </T>
    </Screen>
  );
}

const styles = StyleSheet.create({ set: { flexDirection: "row", alignItems: "center", gap: 8 } });
