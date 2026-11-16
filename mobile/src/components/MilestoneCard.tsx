/* AUD-41: a recent life milestone on the QG, shareable as a story card. */
import { useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { Cadence } from "../core";
import type { TrainingLog } from "../core/types";
import { errorMessage } from "../lib/errors";
import { recentMilestone } from "../lib/milestones";
import { shareCardImage } from "../lib/shareImage";
import { Button } from "./Button";
import { Card } from "./Card";
import { ShareCard } from "./ShareCard";
import { T } from "./Text";
import { useToast } from "./Toast";

export function MilestoneCard({ logs, cadence }: { logs: TrainingLog[]; cadence: Cadence }) {
  const milestone = useMemo(() => recentMilestone(logs, { cadence }), [logs, cadence]);
  const ref = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
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
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await shareCardImage(ref, card.title);
          } catch (e) {
            toast({ kind: "err", title: "Image impossible à partager", message: errorMessage(e) });
          } finally {
            setBusy(false);
          }
        }}
        testID="milestone-share"
      />
      <View style={styles.offscreen} pointerEvents="none">
        <ShareCard ref={ref} data={card} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({ offscreen: { position: "absolute", left: -10000, top: 0 } });
