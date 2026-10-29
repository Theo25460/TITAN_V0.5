import { StyleSheet, View } from "react-native";
import { useOnline } from "../lib/network";
import { colors } from "../theme/tokens";
import { Icon } from "./Icon";
import { T } from "./Text";

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <View style={styles.bar} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="offline-banner">
      <Icon name="offline" size={16} color={colors.warn} />
      <T variant="caption" color={colors.warn} style={{ flex: 1 }}>
        Hors ligne : tes séances sont gardées sur ce téléphone et partiront au retour du réseau.
      </T>
    </View>
  );
}
const styles = StyleSheet.create({ bar: { flexDirection: "row", gap: 8, alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.warnSoft, borderBottomWidth: 1, borderBottomColor: "rgba(240,162,74,0.3)" } });
