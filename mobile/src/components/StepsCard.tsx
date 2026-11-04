import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { View } from "react-native";
import { useSteps } from "../data/steps";
import { freshness, GOAL_MAX, GOAL_MIN, GOAL_PRESETS, stepsText } from "../lib/steps";
import { colors, space } from "../theme/tokens";
import { Button } from "./Button";
import { BarChart } from "./Charts";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { Skeleton } from "./States";
import { ProgressBar } from "./Progress";
import { T } from "./Text";

const DAY = ["D", "L", "M", "M", "J", "V", "S"];

/** Steps of the day on the QG. Honest by construction: a day without a number says so (never 0), several sources are never added,
    nothing here creates a session, XP or a reward, and the card is absent when the server does not offer the function. */
export function StepsCard() {
  const s = useSteps();
  const navigation = useNavigation();
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  if (s.failed) return null;
  if (!s.loading && !s.hasAny && s.connected === false) {
    return (
      <Card style={{ gap: 6 }} testID="steps-connect">
        <T variant="bodyStrong">Tes pas du jour</T>
        <T variant="small" tone="muted">Connecte Santé Connect pour voir tes pas ici. Ils ne créent ni séance ni récompense.</T>
        <Button small kind="secondary" label="Connecter Santé Connect" onPress={() => (navigation as unknown as { navigate: (n: string) => void }).navigate("HealthConnect")} testID="steps-connect-open" />
      </Card>
    );
  }
  // Reserve the room while the numbers load: the QG below must not slide down when the card appears (V12-05).
  // Nothing received yet and the permission check has not answered: keep the placeholder, so the card never flips from "no number" to "connect".
  if (!s.hasAny && (s.loading || s.connected === null))
    return (
      <Card style={{ gap: space.s3, minHeight: 168 }} testID="steps-loading" accessibilityLabel="Chargement des pas du jour">
        <Skeleton width="38%" height={14} />
        <Skeleton width="46%" height={34} />
        <Skeleton height={8} />
        <Skeleton width="70%" height={12} />
      </Card>
    );
  const v = s.view;
  const fresh = freshness(v.lastUpdate, Date.now());
  const trend = v.trend === "up" ? "En hausse sur la semaine" : v.trend === "down" ? "En baisse sur la semaine" : v.trend === "flat" ? "Stable sur la semaine" : null;
  return (
    <Card style={{ gap: space.s2 }} testID="steps-card">
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <T variant="bodyStrong">Pas du jour</T>
        {v.goal ? <T variant="caption" tone="faint">Objectif {stepsText(v.goal)}</T> : null}
      </View>
      {v.today !== null ? (
        <T variant="display" accessibilityLabel={`${stepsText(v.today)} pas aujourd’hui`}>{stepsText(v.today)}</T>
      ) : (
        <T tone="muted">Pas de chiffre pour aujourd’hui pour le moment.</T>
      )}
      {v.ratio !== null ? <ProgressBar value={v.ratio} color={v.ratio >= 1 ? colors.ok : colors.cy} accessibilityLabel={`${Math.round(v.ratio * 100)} % de l’objectif`} /> : null}
      {/* Compact by default (V12-31): the number, the gauge and how fresh it is. The goal, the week and the 30 days are one tap away. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.s2 }}>
        <T variant="caption" tone={fresh.level === "fresh" ? "faint" : "warn"} style={{ flex: 1 }} testID="steps-freshness">{fresh.label}</T>
        <Button small kind="ghost" label={s.syncing ? "Actualisation…" : "Actualiser"} disabled={s.syncing} onPress={() => s.refresh(false)} testID="steps-refresh" />
      </View>
      {!v.goal ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <T variant="caption" tone="faint">Objectif :</T>
          {GOAL_PRESETS.map((g) => (
            <Chip key={g} label={stepsText(g)} selected={v.goal === g} onPress={() => { s.setGoal(g); setEditing(false); }} />
          ))}
        </View>
      ) : null}
      {open ? (
        <>
          {v.goal ? (
            editing ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <T variant="caption" tone="faint">Objectif :</T>
                {GOAL_PRESETS.map((g) => (
                  <Chip key={g} label={stepsText(g)} selected={v.goal === g} onPress={() => { s.setGoal(g); setEditing(false); }} />
                ))}
                <Chip label="−1 000" onPress={() => s.setGoal(Math.max(GOAL_MIN, v.goal! - 1000))} />
                <Chip label="+1 000" onPress={() => s.setGoal(Math.min(GOAL_MAX, v.goal! + 1000))} />
                <Chip label="Sans objectif" onPress={() => { s.setGoal(null); setEditing(false); }} />
              </View>
            ) : (
              <Button small kind="ghost" label="Modifier l’objectif" onPress={() => setEditing(true)} style={{ alignSelf: "flex-start" }} />
            )
          ) : null}
          <BarChart
            data={v.week.map((w, i) => ({ label: DAY[new Date(`${w.day}T12:00:00`).getDay()]!, value: w.steps ?? 0, highlight: i === 6, display: w.steps === null ? "–" : stepsText(w.steps), detail: w.steps === null ? "pas de chiffre" : undefined }))}
            height={90}
            scale={false}
            accessibilityLabel={`Pas des sept derniers jours${v.weekAverage ? `, moyenne ${stepsText(v.weekAverage)}` : ""}`}
          />
          <T variant="caption" tone="faint">
            {trend ? `${trend} · ` : ""}
            {v.month.average ? `30 jours : ${stepsText(v.month.average)} par jour en moyenne (${v.month.days} jour${v.month.days > 1 ? "s" : ""} avec chiffre)` : "Pas encore d’historique sur 30 jours"}
          </T>
        </>
      ) : null}
      <Button small kind="ghost" label={open ? "Masquer le détail" : "Voir la semaine et l’objectif"} onPress={() => setOpen((o) => !o)} accessibilityHint="Affiche ou masque le graphique de la semaine" style={{ alignSelf: "flex-start" }} testID="steps-toggle" />
      {s.error ? <T variant="caption" tone="warn" accessibilityRole="alert">{s.error}</T> : null}
    </Card>
  );
}
