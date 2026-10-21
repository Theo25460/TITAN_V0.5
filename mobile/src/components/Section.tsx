import { createContext, useContext } from "react";
import { StyleSheet, View } from "react-native";
import { colors, space, TOUCH } from "../theme/tokens";
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

/** French count labels: "1 séance", "0 jour actif" (0 and 1 take the singular), plural otherwise. */
export function countLabel(label: string, value: string) {
  if (!/^[01]$/.test(value.trim())) return label;
  return label.replace(/\b([A-Za-zÀ-ÿ’]+?)s\b/g, (w, stem: string) => (stem.length > 1 ? stem : w));
}

const FlatRow = createContext(false);

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "accent" | "amber" }) {
  const flat = useContext(FlatRow);
  label = countLabel(label, value);
  return (
    <View style={flat ? styles.statFlat : styles.stat} accessible accessibilityLabel={`${label} : ${value}${sub ? ", " + sub : ""}`}>
      <T variant="num" tone={tone === "accent" ? "accent" : tone === "amber" ? "amber" : "default"} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </T>
      <T variant="caption" tone="faint" numberOfLines={2}>
        {label}
      </T>
      {sub ? (
        <T variant="caption" tone="muted" numberOfLines={flat ? 2 : 1}>
          {sub}
        </T>
      ) : null}
    </View>
  );
}

/** `flat`: figures side by side without their own boxes, for use inside a card (no box in a box). */
export function StatRow({ children, flat = false }: { children: React.ReactNode; flat?: boolean }) {
  return (
    <FlatRow.Provider value={flat}>
      <View style={flat ? styles.rowFlat : styles.row}>{children}</View>
    </FlatRow.Provider>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", minHeight: 32 },
  action: { minHeight: TOUCH, justifyContent: "center", paddingHorizontal: 8 },
  stat: { flex: 1, minWidth: 0, gap: 2, padding: space.s3, borderRadius: 14, backgroundColor: colors.bg1, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: "row", gap: space.s2 },
  statFlat: { flex: 1, minWidth: 0, gap: 2, paddingVertical: space.s1, paddingRight: space.s2 },
  rowFlat: { flexDirection: "row", gap: space.s3, paddingTop: space.s3, borderTopWidth: 1, borderColor: colors.line },
});
