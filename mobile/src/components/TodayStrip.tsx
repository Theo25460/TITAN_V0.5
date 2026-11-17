import { useEffect } from "react";
import { View } from "react-native";
import { useOwner } from "../data/auth";
import { useSteps } from "../data/steps";
import { localDay, stepsText } from "../lib/steps";
import { ownerKey, readJSON, writeJSON } from "../lib/storage";
import { StepsCardView } from "./StepsCard";
import { useToast } from "./Toast";

/** The day the step goal was last cheered, kept per account: the goal is celebrated ONCE a day, at the moment it is seen reached, and never
    again when the app is merely reopened. It is a pat on the back, not a reward: nothing is granted, nothing is promised. */
export const shouldCheer = (lastCheered: string | null, today: string, reached: boolean) => reached && lastCheered !== today;

function useGoalCheer(reached: boolean, steps: number | null) {
  const owner = useOwner();
  const toast = useToast();
  useEffect(() => {
    if (!reached || steps === null) return;
    let live = true;
    const today = localDay(new Date());
    readJSON<string | null>(ownerKey("steps-cheered", owner), null).then((last) => {
      if (!live || !shouldCheer(last, today, reached)) return;
      writeJSON(ownerKey("steps-cheered", owner), today).catch(() => {});
      toast({ kind: "ok", title: "Objectif de pas atteint", message: `${stepsText(steps)} pas aujourd’hui : bien marché.` });
    });
    return () => {
      live = false;
    };
    // Only the moment the goal becomes reached matters, not every step after it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reached, owner]);
}

/** The steps of the day on the QG, in one fixed place. With a number: the full card (ring, goal, freshness). Without one: a single quiet
    line that opens the steps screen, where the counter or Santé Connect can be switched on with their explanation. The QG itself never
    shows a permission or connection button: nothing is asked before the player goes looking for it. The week now lives in the
    progression card (QgProgress). */
/** The steps state is owned by the screen (one hook, one refresh), so the pull-to-refresh gesture and the card speak about the same numbers. */
export function TodayStrip({ steps: s }: { steps: ReturnType<typeof useSteps> }) {
  const hasNumber = !s.failed && !s.loading && s.hasAny;
  useGoalCheer(hasNumber && s.view.ratio !== null && s.view.ratio >= 1, s.view.today);
  return (
    <View testID="today-strip">
      <StepsCardView s={s} quiet />
    </View>
  );
}
