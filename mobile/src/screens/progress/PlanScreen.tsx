import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Field } from "../../components/Field";
import { Tap } from "../../components/Pressable";
import { Screen } from "../../components/Screen";
import { Section } from "../../components/Section";
import { Sheet } from "../../components/Sheet";
import { SportGrid, SportSearch } from "../../components/SportPicker";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Format, Sports, WeekPlan, WeekReview, type ReviewAction, type Schedule, type WeekDecision } from "../../core";
import { useLogs, usePrefs, useSavePrefs, type Prefs } from "../../data/hooks";
import { WeekPlanCard } from "../../components/WeekPlanCard";
import { AdjustmentsCard, WeekReviewCard, dayLong } from "../../components/WeekReviewCard";
import { deviceZone, todayKey, useWeekPlan, useWeekReview } from "../../lib/weekPlan";
import { errorMessage } from "../../lib/errors";
import { useOnline } from "../../lib/network";
import { colors, radius, space, spaces } from "../../theme/tokens";

const DAYS: [string, string][] = [
  ["monday", "Lundi"],
  ["tuesday", "Mardi"],
  ["wednesday", "Mercredi"],
  ["thursday", "Jeudi"],
  ["friday", "Vendredi"],
  ["saturday", "Samedi"],
  ["sunday", "Dimanche"],
];

/** Weekly rhythm (cadence target, paused weeks) and planned week — the same preferences as the website QG/Prévoir.
    V1.7.2: the week as planned on its Monday, tied to the sessions really done, with the athlete's decisions (WeekPlanCard).
    V1.7.3: the bilan of the week shown and its adjustment for the week after (WeekReviewCard), and the adjustments acting on this
    week and the next one, with their origin and their undo (AdjustmentsCard). */
export function PlanScreen() {
  const navigation = useNavigation();
  const prefs = usePrefs();
  const { logs } = useLogs();
  const [weekBack, setWeekBack] = useState(0);
  const shownWeek = WeekPlan.addDays(WeekPlan.weekOf(todayKey()), -7 * weekBack);
  const view = useWeekPlan(shownWeek);
  const review = useWeekReview(shownWeek);
  const save = useSavePrefs();
  const toast = useToast();
  const online = useOnline();
  const [editing, setEditing] = useState<string | null>(null);
  const [minutes, setMinutes] = useState("");
  const thisWeek = Format.dateKey(Format.weekStart(new Date()));
  const paused = prefs.cadencePauses.includes(thisWeek);

  const persist = async (patch: Parameters<typeof save.mutateAsync>[0]["prefs"], ok: string, message?: string) => {
    try {
      await save.mutateAsync({ prefs: patch });
      toast({ kind: "ok", title: ok, message });
      return true;
    } catch (e) {
      toast({ kind: "err", title: "Non enregistré", message: errorMessage(e) });
      return false;
    }
  };

  // V1.7.2: a decision on an occurrence of the week is a patch of the schedule; the session itself is never changed.
  const decide = (occurrence: string, decision: WeekDecision, done: string) => {
    let schedule: Schedule;
    try {
      schedule = WeekPlan.decide((prefs.schedule ?? {}) as Schedule, occurrence, decision, { today: todayKey() });
    } catch {
      toast({ kind: "err", title: "Choix impossible", message: "Une séance prévue se déplace dans sa semaine. Sinon, écarte-la." });
      return false;
    }
    return persist({ schedule: schedule as Prefs["schedule"] }, done);
  };

  // V1.7.3: the bilan's choice and its undo write the schedule (and the cadence pauses for a paused week) in one save.
  const applyReview = (week: string, action: ReviewAction) => {
    let r;
    try {
      r = WeekReview.apply((prefs.schedule ?? {}) as Schedule, logs, { week, today: todayKey(), zone: deviceZone(), pauses: prefs.cadencePauses }, action);
    } catch {
      toast({ kind: "err", title: "Choix impossible", message: "Ce choix n’est pas possible pour cette semaine." });
      return false;
    }
    return persist({ schedule: r.schedule as Prefs["schedule"], cadencePauses: r.pauses }, "Ajustement enregistré", `Visible dans Ma semaine pour la semaine du ${dayLong(r.review.target)}. Tu peux l’annuler.`);
  };
  const undoReview = (week: string) => {
    let r;
    try {
      r = WeekReview.undo((prefs.schedule ?? {}) as Schedule, prefs.cadencePauses, { week, today: todayKey() });
    } catch {
      toast({ kind: "err", title: "Annulation impossible", message: "La semaine concernée est terminée." });
      return false;
    }
    return persist({ schedule: r.schedule as Prefs["schedule"], cadencePauses: r.pauses }, "Choix annulé", r.kept.length ? "Une modification faite ensuite à la main a été gardée." : "Le programme a repris sa forme d’avant.");
  };
  const thisMonday = WeekPlan.weekOf(todayKey());
  const nextMonday = WeekPlan.addDays(thisMonday, 7);
  const adjustNow = WeekReview.adjustments((prefs.schedule ?? {}) as Schedule, { week: thisMonday, today: todayKey() });
  const adjustNext = WeekReview.adjustments((prefs.schedule ?? {}) as Schedule, { week: nextMonday, today: todayKey() });

  // V1.7.2: an edit made during a week applies from the next Monday (this week keeps its start); a first plan applies at once.
  function setDay(key: string, sport: string | null) {
    const old = (prefs.schedule || {})[key] || {};
    const m = Number(minutes.replace(",", "."));
    const today = todayKey();
    const r = WeekPlan.editType((prefs.schedule ?? {}) as Schedule, key, sport ? { sport, minutes: m > 0 ? m : null, note: old.note || "" } : null, { today });
    setEditing(null);
    const later = r.appliesFrom !== WeekPlan.weekOf(today);
    persist({ schedule: r.schedule as Prefs["schedule"] }, sport ? "Jour planifié" : "Jour libéré", later ? `S’applique à partir du ${new Date(`${r.appliesFrom}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}. Cette semaine garde son programme de départ.` : undefined);
  }

  return (
    <Screen>
      {!online ? <T variant="caption" tone="warn">Hors ligne : les réglages s’enregistrent avec une connexion.</T> : null}
      <View style={styles.weekNav}>
        <Button small kind="ghost" icon="chevronLeft" label="Semaine précédente" disabled={weekBack >= WeekPlan.MAX_WEEKS - 1} onPress={() => setWeekBack((n) => Math.min(WeekPlan.MAX_WEEKS - 1, n + 1))} testID="week-previous" />
        {weekBack ? <Button small kind="ghost" label="Cette semaine" onPress={() => setWeekBack(0)} testID="week-current" /> : null}
      </View>
      <WeekPlanCard
        view={view}
        logs={logs}
        busy={!online || save.isPending}
        title={weekBack === 0 ? "Cette semaine · prévu et réalisé" : `Semaine du ${new Date(`${shownWeek}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} · prévu et réalisé`}
        onDecide={decide}
        onOpen={(l) => navigation.navigate("SessionDetail", { id: l.id })}
      />
      <WeekReviewCard
        review={review}
        schedule={(prefs.schedule ?? {}) as Schedule}
        logs={logs}
        today={todayKey()}
        zone={deviceZone()}
        pauses={prefs.cadencePauses}
        busy={!online || save.isPending}
        title={weekBack === 0 ? "Bilan de la semaine et ajustement" : "Bilan et ajustement"}
        onApply={applyReview}
        onUndo={undoReview}
        onOpen={(l) => navigation.navigate("SessionDetail", { id: l.id })}
      />
      {weekBack === 0 ? <AdjustmentsCard list={adjustNow} title="Ajustement de cette semaine" today={todayKey()} busy={!online || save.isPending} onUndo={undoReview} /> : null}
      {weekBack === 0 ? <AdjustmentsCard list={adjustNext} title="La semaine prochaine" today={todayKey()} busy={!online || save.isPending} onUndo={undoReview} /> : null}
      <Section title="Ma cadence">
        <Card style={{ gap: space.s3 }}>
          <T>Combien de jours actifs par semaine ? Une semaine qui atteint ce nombre est une semaine tenue.</T>
          <View style={styles.targets} accessibilityRole="radiogroup">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <Tap key={n} disabled={!online || save.isPending} onPress={() => persist({ weeklyGoalSessions: n }, `Cadence : ${n} jour${n > 1 ? "s" : ""} par semaine`)} accessibilityRole="radio" accessibilityState={{ checked: prefs.weeklyGoalSessions === n }} accessibilityLabel={`${n} jours`} style={[styles.target, prefs.weeklyGoalSessions === n && styles.targetOn]}>
                <T variant="h3" color={prefs.weeklyGoalSessions === n ? spaces.progres.ink : colors.tx}>
                  {n}
                </T>
              </Tap>
            ))}
          </View>
        </Card>
        <Card tone="flat" style={{ gap: space.s2 }}>
          <T variant="bodyStrong">{paused ? "Ta cadence est en pause" : "Une pause, si tu en as envie"}</T>
          <T variant="small">La pause met de côté ton repère de jours actifs pour cette semaine. Ton journal et tes acquis restent accessibles. Tu peux reprendre quand tu veux.</T>
          <Button small kind="secondary" label={paused ? "Reprendre la cadence" : "Mettre la cadence en pause"} disabled={!online || save.isPending} onPress={() => persist({ cadencePauses: paused ? prefs.cadencePauses.filter((p) => p !== thisWeek) : [...prefs.cadencePauses, thisWeek].slice(-52) }, paused ? "Cadence reprise" : "Cadence en pause pour cette semaine")} />
        </Card>
      </Section>
      <Section title="Ma semaine type">
        <T variant="small">Planifie tes créneaux : le QG te propose la séance du jour. Une modification faite en cours de semaine s’applique dès le lundi suivant ; pour cette semaine, déplace, remplace ou écarte une séance prévue.</T>
        {DAYS.map(([key, label]) => {
          const d = prefs.schedule?.[key];
          const sport = d?.sport && Sports.conf(d.sport) ? d.sport : null;
          return (
            <Card key={key} onPress={() => { setMinutes(d?.minutes ? String(d.minutes) : ""); setEditing(key); }} accessibilityLabel={`${label} : ${sport ? Sports.label(sport) : "repos"}`} style={styles.day}>
              <T variant="bodyStrong" style={{ width: 92 }}>
                {label}
              </T>
              <T variant="small" tone={sport ? "default" : "faint"} style={{ flex: 1 }}>
                {sport ? `${Sports.label(sport)}${d?.minutes ? ` · ${Format.duration(d.minutes)}` : ""}` : "Repos ou libre"}
              </T>
            </Card>
          );
        })}
      </Section>
      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={DAYS.find(([k]) => k === editing)?.[1]}>
        <Field label="Durée prévue (minutes, facultatif)" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />
        <SportSearch onPick={(s) => editing && setDay(editing, s)} />
        <SportGrid ids={[...new Set([...prefs.favoriteSports, ...Sports.POPULAR])].slice(0, 12)} onPick={(s) => editing && setDay(editing, s)} />
        <Chip label="Repos ce jour-là" icon="leaf" onPress={() => editing && setDay(editing, null)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  targets: { flexDirection: "row", gap: 6 },
  target: { flex: 1, height: 52, borderRadius: radius.r2, backgroundColor: colors.bg1, borderWidth: 1, borderColor: colors.line2, alignItems: "center", justifyContent: "center" },
  // The chosen cadence is a selection: the colour of the space (Progrès), not the cyan of progression.
  targetOn: { backgroundColor: spaces.progres.accent, borderColor: spaces.progres.accent },
  day: { flexDirection: "row", alignItems: "center", gap: space.s3, paddingVertical: space.s3 },
  weekNav: { flexDirection: "row", gap: space.s2, flexWrap: "wrap" },
});
