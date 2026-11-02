import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Reveal } from "../../components/Motion";
import { ProgressBar } from "../../components/Progress";
import { Screen } from "../../components/Screen";
import { T } from "../../components/Text";
import { useOwner } from "../../data/auth";
import { useLogs, usePrefs } from "../../data/hooks";
import { ownerKey, readJSON } from "../../lib/storage";
import { validGoal } from "../../lib/steps";
import { finish, freshTour, goTo, loadTour, progressLabel, restart, saveTour, TOUR_STEPS, type Target, type TourState } from "../../lib/tour";
import type { RootParams } from "../../navigation/types";
import { colors, space } from "../../theme/tokens";

export { TOUR_STEPS as GUIDE_STEPS };

type Props = NativeStackScreenProps<RootParams, "Guide">;

/** The first-use tour (12 steps). Progress is kept per account, it can be skipped, resumed, replayed; each step opens the real
    screen. No advertising here, and no permission is requested by the tour itself. */
export function GuideScreen({ navigation }: Props) {
  const owner = useOwner();
  const [tour, setTour] = useState<TourState | null>(null);
  // Optional mini-goals read the REAL state: they tick themselves when the person does the thing, and are never required.
  const prefs = usePrefs();
  const { active } = useLogs();
  const [stepsGoal, setStepsGoal] = useState(false);
  useEffect(() => {
    readJSON<number | null>(ownerKey("steps-goal", owner), null).then((g) => setStepsGoal(validGoal(g) !== null));
  }, [owner, tour?.step]);
  const reached: Record<string, boolean> = { favorites: prefs.favoriteSports.length > 0, firstSession: active.length > 0, stepsGoal };
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    loadTour(owner).then((s) => alive.current && setTour(s.done ? { ...freshTour(), done: true } : s));
    return () => {
      alive.current = false;
    };
  }, [owner]);
  if (!tour) return <Screen><T tone="muted">Chargement…</T></Screen>;

  const step = TOUR_STEPS[tour.step]!;
  const last = tour.step === TOUR_STEPS.length - 1;
  const move = (next: TourState) => {
    setTour(next);
    saveTour(owner, next);
  };
  const open = (t: Target) => {
    // The tour is saved where it is: coming back resumes the same step.
    saveTour(owner, tour);
    if (t === "journal") navigation.navigate("Journal");
    else if (t === "sports") navigation.navigate("Sports");
    else if (t === "community") navigation.navigate("Community");
    else if (t === "goals") navigation.navigate("Goals");
    else if (t === "health") navigation.navigate("HealthConnect");
    else if (t === "plus") navigation.navigate("TitanPlus");
    else if (t === "progress") navigation.navigate("Tabs", { screen: "Progress" });
    else navigation.navigate("Tabs", { screen: t === "record" ? "Record" : "Adventure" });
  };
  const close = (state: TourState) => {
    saveTour(owner, state);
    navigation.goBack();
  };

  return (
    <Screen>
      <ProgressBar value={(tour.step + 1) / TOUR_STEPS.length} accessibilityLabel={progressLabel(tour)} />
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <T variant="caption" tone="muted">{progressLabel(tour)}</T>
        {tour.step > 0 ? <Button small kind="ghost" label="Recommencer" onPress={() => move(restart())} testID="guide-restart" /> : null}
      </View>
      <Reveal key={step.id}>
        <Card tone="accent" style={{ gap: 12 }} testID={`guide-step-${step.id}`}>
          <View style={{ alignItems: "center", paddingVertical: space.s3 }}>
            <View style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderColor: colors.cy, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg2 }}>
              <Icon name={step.icon} size={38} color={colors.cy} />
            </View>
          </View>
          <T variant="h2" center>{step.title}</T>
          {step.optional ? <T variant="caption" tone="faint" center>Facultatif</T> : null}
          <T>{step.text}</T>
          {step.goal ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: space.s2, borderRadius: 12, backgroundColor: colors.bg2 }} accessible accessibilityLabel={`Mini-objectif facultatif : ${step.goal.text}${reached[step.goal.id] ? ", fait" : ""}`} testID={`guide-goal-${step.goal.id}`}>
              <Icon name={reached[step.goal.id] ? "check" : "target"} size={18} color={reached[step.goal.id] ? colors.ok : colors.cy} />
              <T variant="small" style={{ flex: 1 }}>{step.goal.text}</T>
              <T variant="caption" tone={reached[step.goal.id] ? "ok" : "faint"}>{reached[step.goal.id] ? "Fait" : "Mini-objectif"}</T>
            </View>
          ) : null}
          {step.action ? <Button label={step.action.label} kind="secondary" onPress={() => open(step.action!.target)} testID="guide-open" /> : null}
        </Card>
      </Reveal>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Button label="Précédent" kind="ghost" disabled={tour.step === 0} onPress={() => move(goTo(tour, tour.step - 1))} style={{ flex: 1 }} testID="guide-prev" />
        <Button label={last ? "Terminer" : "Suivant"} onPress={() => (last ? close(finish(tour)) : move(goTo(tour, tour.step + 1)))} style={{ flex: 1 }} testID="guide-next" />
      </View>
      <Button label="Passer la visite" kind="ghost" small onPress={() => close({ ...tour, dismissed: true })} testID="guide-skip" accessibilityHint="Ferme la visite ; tu peux la rouvrir ou la relancer depuis Assistance" />
    </Screen>
  );
}
