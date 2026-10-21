import { StyleSheet, View } from "react-native";
import { colors, space } from "../theme/tokens";
import { Tap } from "./Pressable";
import { T } from "./Text";

export function Section({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.s3 }}>
      <View style={styles.head}>
        <T variant="eyebrow" style={{ flex: 1 }}>
          {title}
        </T>
        {action && onAction ? (
          <Tap onPress={onAction} accessibilityLabel={action} style={styles.action} haptics={false}>
            <T variant="caption" color={colors.cy}>
              {action}
            </T>
          </Tap>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "accent" | "amber" }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label} : ${value}${sub ? ", " + sub : ""}`}>
      <T variant="num" tone={tone === "accent" ? "accent" : tone === "amber" ? "amber" : "default"} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </T>
      <T variant="caption" tone="faint" numberOfLines={2}>
        {label}
      </T>
      {sub ? (
        <T variant="caption" tone="muted" numberOfLines={1}>
          {sub}
        </T>
      ) : null}
    </View>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", minHeight: 32 },
  action: { minHeight: 40, justifyContent: "center", paddingHorizontal: 8 },
  stat: { flex: 1, minWidth: 0, gap: 2, padding: space.s3, borderRadius: 14, backgroundColor: colors.bg1, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: "row", gap: space.s2 },
});
