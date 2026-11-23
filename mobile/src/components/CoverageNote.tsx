/* V1.6.6 — what this phone holds of the account history, when it is offline or while the history is still arriving (the same
   sentence as the website, src/core/web/history-window.js describe). Nothing when the copy is complete and the phone online. */
import { StyleSheet, View } from "react-native";
import { HistoryWindow, type HistoryCoverage } from "../core";
import { useOnline } from "../lib/network";
import { colors } from "../theme/tokens";
import { Icon } from "./Icon";
import { T } from "./Text";

export function CoverageNote({ coverage, loading = false }: { coverage: HistoryCoverage | null; loading?: boolean }) {
  const online = useOnline();
  const d = HistoryWindow.describe(coverage, { online, loading });
  if (!d) return null;
  const tone = d.tone === "warn" ? colors.warn : colors.tx2;
  return (
    <View style={[styles.note, d.tone === "warn" ? styles.warn : null]} accessibilityRole="text" accessibilityLiveRegion="polite" testID={`coverage-${d.state}`}>
      <Icon name={online ? "cloud" : "offline"} size={16} color={tone} />
      <T variant="caption" color={tone} style={{ flex: 1 }}>
        {d.text}
      </T>
    </View>
  );
}
const styles = StyleSheet.create({
  note: { flexDirection: "row", gap: 8, alignItems: "flex-start", padding: 10, borderRadius: 10, backgroundColor: colors.bg3 },
  warn: { backgroundColor: colors.warnSoft },
});
