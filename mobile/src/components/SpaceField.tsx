import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spaces, space, type SpaceId } from "../theme/tokens";
import { T } from "./Text";

/* The header of a space: a flat field of its colour, edge to edge and under the status bar, with the title set large in the
   field's own ink. It is what tells the five spaces apart before a word is read: lime is « I record », azure « I measure »,
   chalk « me ». Text on the field is the ink at two strengths, never grey. */
export function SpaceField({ id, title, lead, children, testID }: { id: SpaceId; title: string; lead?: string; children?: ReactNode; testID?: string }) {
  const insets = useSafeAreaInsets();
  const theme = spaces[id];
  return (
    <View style={[styles.field, { backgroundColor: theme.accent, paddingTop: insets.top + space.s5 }]} testID={testID}>
      <View style={{ gap: space.s1 }}>
        <T variant="display" color={theme.ink}>{title}</T>
        {lead ? <T color={theme.ink} style={styles.lead}>{lead}</T> : null}
      </View>
      {children}
    </View>
  );
}

/** A figure set on a field: the number in the field's ink, its label under it. */
export function FieldFigure({ id, value, label }: { id: SpaceId; value: string; label: string }) {
  const theme = spaces[id];
  return (
    <View style={styles.figure} accessible accessibilityLabel={`${label} : ${value}`}>
      <T variant="numLarge" color={theme.ink} numberOfLines={1} style={value.length > 6 ? { fontSize: 34 } : undefined}>{value}</T>
      <T variant="caption" color={theme.ink} style={styles.label}>{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { paddingHorizontal: space.s5, paddingBottom: space.s5, gap: space.s4 },
  lead: { opacity: 0.8, maxWidth: 520 },
  figure: { flex: 1, minWidth: 0, gap: 0 },
  label: { opacity: 0.78 },
});
