import { useNavigation } from "@react-navigation/native";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useOwner } from "../data/auth";
import { useSteps } from "../data/steps";
import { localDay, stepsText } from "../lib/steps";
import { ownerKey, readJSON, writeJSON } from "../lib/storage";
import { colors, space } from "../theme/tokens";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { Ring } from "./Progress";
import { StepsCardView, StepsTile } from "./StepsCard";
import { T } from "./Text";
import { useToast } from "./Toast";

type Cadence = { currentDays: number; target: number; held: number; window: number };

/** The week as a tile: a ring of active days against the goal. The detail (notches, minutes, XP) lives in Progrès. */
export function WeekTile({ cadence, sessions }: { cadence: Cadence; sessions: number }) {
  const navigation = useNavigation() as unknown as { navigate: (n: string, p?: object) => void };
  const reached = cadence.target > 0 && cadence.currentDays >= cadence.target;
  const tint = reached ? colors.ok : colors.cy;
  return (
    <Card onPress={() => navigation.navigate("Tabs", { screen: "Progress" })} testID="week-tile" style={styles.tile} accessibilityLabel={`Ma semaine : ${cadence.currentDays} jours actifs sur ${cadence.target}, ${sessions} séance${sessions > 1 ? "s" : ""}. Ouvrir Progrès.`}>
      <View style={styles.top}>
        <Ring value={cadence.target ? cadence.currentDays / cadence.target : 0} size={56} stroke={6} color={tint}>
          <Icon name={reached ? "check" : "calendar"} size={20} color={tint} />
        </Ring>
      </View>
      <View>
        <T variant="num" numberOfLines={1}>
          {cadence.currentDays}
          <T variant="small" tone="faint">
            /{cadence.target}
          </T>
        </T>
        <T variant="caption" tone="faint" numberOfLines={2}>
          jours actifs · {sessions} séance{sessions > 1 ? "s" : ""}
        </T>
      </View>
    </Card>
  );
}

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

/** "Aujourd'hui" at a glance (Garmin / Apple-style rings): steps and week side by side. With no step number yet, the week tile stays
    alone (and, for a brand-new account with no session yet, not even that: an empty ring is not a figure) and the steps card below it invites to count (own counter first, Santé Connect second) or holds the room while it loads. */
/** The steps state is owned by the screen (one hook, one refresh), so the pull-to-refresh gesture and the tiles speak about the same numbers. */
export function TodayStrip({ steps: s, cadence, sessions, showWeek = true }: { steps: ReturnType<typeof useSteps>; cadence: Cadence; sessions: number; showWeek?: boolean }) {
  const hasNumber = !s.failed && !s.loading && s.hasAny;
  useGoalCheer(hasNumber && s.view.ratio !== null && s.view.ratio >= 1, s.view.today);
  return (
    <View style={{ gap: space.s3 }} testID="today-strip">
      {hasNumber || showWeek ? (
        <View style={styles.row}>
          {hasNumber ? <StepsTile s={s} /> : null}
          {showWeek ? <WeekTile cadence={cadence} sessions={sessions} /> : null}
        </View>
      ) : null}
      {hasNumber ? null : <StepsCardView s={s} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.s3, alignItems: "stretch" },
  tile: { flex: 1, minWidth: 0, justifyContent: "space-between", gap: space.s3, padding: space.s3 },
  top: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
});
