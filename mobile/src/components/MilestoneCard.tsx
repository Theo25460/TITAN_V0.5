/* AUD-41: a recent life milestone on the QG. « Partager » (before V2) opens it as a success card on its preview, like a session. */
import { useNavigation } from "@react-navigation/native";
import { useMemo } from "react";
import type { Cadence } from "../core";
import type { TrainingLog } from "../core/types";
import { useProfile } from "../data/hooks";
import { recentMilestone } from "../lib/milestones";
import { Button } from "./Button";
import { Card } from "./Card";
import { T } from "./Text";

export function MilestoneCard({ logs, cadence }: { logs: TrainingLog[]; cadence: Cadence }) {
  const milestone = useMemo(() => recentMilestone(logs, { cadence }), [logs, cadence]);
  const navigation = useNavigation();
  const username = useProfile().data?.username ?? null;
  if (!milestone) return null;
  const { card } = milestone;
  return (
    <Card tone="amber" style={{ gap: 6 }} testID="qg-milestone">
      <T variant="eyebrow" tone="amber">{card.eyebrow}</T>
      <T variant="h3">{card.title}</T>
      {card.caption ? <T variant="small">{card.caption}</T> : null}
      <Button
        small
        kind="secondary"
        icon="share"
        label="Partager ce moment"
        onPress={() =>
          navigation.navigate("ShareStory", {
            kind: "achievement",
            input: { type: "milestone", title: card.title, value: card.value, progress: card.caption ?? null, date: milestone.date.toISOString(), name: username },
          })
        }
        testID="milestone-share"
      />
    </Card>
  );
}
