import { createContext, useContext } from "react";
import { StyleSheet, View } from "react-native";
import { useSpace } from "../theme/space";
import { colors, space, TOUCH } from "../theme/tokens";
import { Tap } from "./Pressable";
import { T } from "./Text";

/* A section opens like a line of a printed programme: a rule across the column, then its title set as a real heading. The rule
   carries the structure, so the blocks under it do not each need a box. */
export function Section({ title, action, onAction, children, rule = true }: { title: string; action?: string; onAction?: () => void; children: React.ReactNode; rule?: boolean }) {
  const theme = useSpace();
  return (
    <View style={{ gap: space.s3 }}>
      <View style={[styles.head, rule && styles.rule]}>
        <T variant="h3" style={{ flex: 1 }}>
          {title}
        </T>
        {action && onAction ? (
          <Tap onPress={onAction} accessibilityLabel={action} style={styles.action} haptics={false}>
            <T variant="caption" color={theme.accent}>
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
  head: { flexDirection: "row", alignItems: "center", minHeight: 36 },
  rule: { borderTopWidth: 2, borderTopColor: colors.tx, paddingTop: space.s2, marginTop: space.s3 },
  action: { minHeight: TOUCH, justifyContent: "center", paddingHorizontal: 8 },
  stat: { flex: 1, minWidth: 0, gap: 2, paddingVertical: space.s2, paddingRight: space.s2, borderTopWidth: 1, borderTopColor: colors.line2 },
  row: { flexDirection: "row", gap: space.s4 },
  statFlat: { flex: 1, minWidth: 0, gap: 2, paddingVertical: space.s1, paddingRight: space.s2 },
  rowFlat: { flexDirection: "row", gap: space.s3, paddingTop: space.s3, borderTopWidth: 1, borderColor: colors.line },
});
