import { useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { Format } from "../core";
import type { TrainingLog } from "../core/types";
import { useOwner } from "../data/auth";
import { loadLastVisit, saveLastVisit, sinceLastVisit } from "../lib/visit";
import { colors, space } from "../theme/tokens";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { Tap } from "./Pressable";
import { T } from "./Text";

/** Last-visit time of the account, read once when the QG opens (before the data arrives, so the card never pops in late) and written
    when the app leaves the foreground or the card is closed. */
export function useLastVisit() {
  const owner = useOwner();
  const [since, setSince] = useState<number | null | undefined>(undefined);
  const start = useRef(Date.now());
  useEffect(() => {
    let live = true;
    setSince(undefined);
    loadLastVisit(owner).then((v) => {
      if (!live) return;
      setSince(v);
      // First visit ever: nothing to compare with, the clock simply starts now.
      if (v === null) saveLastVisit(owner, start.current);
    });
    // Leaving stamps the visit; coming back reads it again, so a QG kept alive overnight compares with the real last visit.
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") saveLastVisit(owner, Date.now());
      else loadLastVisit(owner).then((v) => live && setSince(v));
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, [owner]);
  return { since, close: () => saveLastVisit(owner, Date.now()) };
}

export function SinceCard({ logs, since, onClose }: { logs: TrainingLog[]; since: number | null | undefined; onClose: () => void }) {
  const [hidden, setHidden] = useState(false);
  const s = hidden || since === undefined ? null : sinceLastVisit(logs, since, Date.now());
  if (!s) return null;
  const parts = [`${s.sessions} séance${s.sessions > 1 ? "s" : ""} enregistrée${s.sessions > 1 ? "s" : ""}`, s.minutes ? Format.duration(s.minutes) : null, s.xp ? `+${Format.number(s.xp)} XP` : null].filter(Boolean);
  return (
    <Card tone="flat" testID="since-card" accessibilityLabel={`Depuis ta dernière visite : ${parts.join(", ")}`}>
      <View style={styles.row}>
        <Icon name="check" size={20} color={colors.ok} />
        <View style={{ flex: 1 }}>
          <T variant="caption" tone="faint">
            Depuis ta dernière visite ({s.away})
          </T>
          <T variant="bodyStrong">{parts.join(" · ")}</T>
        </View>
        <Tap
          onPress={() => {
            setHidden(true);
            onClose();
          }}
          accessibilityLabel="Fermer ce résumé"
          style={styles.close}
          testID="since-close"
        >
          <Icon name="close" size={18} color={colors.tx3} />
        </Tap>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.s3 },
  close: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
});
