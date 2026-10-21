import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Sports, type SportEntry } from "../core";
import { familyColors, colors, radius, space } from "../theme/tokens";
import { Field } from "./Field";
import { Icon } from "./Icon";
import { Tap } from "./Pressable";
import { T } from "./Text";

/** Sport chip with its family colour; 260 sports available offline from the website catalogue. */
export function SportChip({ id, selected, onPress, testID }: { id: string; selected?: boolean; onPress: () => void; testID?: string }) {
  const fam = Sports.familyOf(id);
  return (
    <Tap onPress={onPress} testID={testID} accessibilityRole="button" accessibilityState={{ selected: !!selected }} accessibilityLabel={Sports.label(id)} style={[styles.chip, selected && styles.chipOn]}>
      <Icon name={Sports.FAMILY_ICON[fam] ?? "run"} size={18} color={selected ? colors.cyInk : familyColors[fam]} />
      <T variant="caption" color={selected ? colors.cyInk : colors.tx} numberOfLines={1}>
        {Sports.label(id)}
      </T>
    </Tap>
  );
}

export function SportSearch({ onPick, selected = [], placeholder = "Padel, natation, escalade…", limit = 10 }: { onPick: (id: string) => void; selected?: string[]; placeholder?: string; limit?: number }) {
  const [query, setQuery] = useState("");
  const results: SportEntry[] = useMemo(() => (query.trim() ? Sports.search(query, { limit }) : []), [query, limit]);
  return (
    <View style={{ gap: space.s3 }}>
      <Field value={query} onChangeText={setQuery} placeholder={placeholder} accessibilityLabel="Rechercher un sport" autoCorrect={false} returnKeyType="search" testID="sport-search" />
      {query.trim() && !results.length ? <T variant="small">Aucun sport ne correspond. Essaie un autre mot (« vélo », « muscu », « rando »…).</T> : null}
      {results.length ? (
        <View style={styles.wrap}>
          {results.map((r) => (
            <SportChip key={r.id} id={r.id} selected={selected.includes(r.id)} onPress={() => onPick(r.id)} testID={`sport-result-${r.id}`} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function SportGrid({ ids, selected = [], onPick }: { ids: string[]; selected?: string[]; onPick: (id: string) => void }) {
  return (
    <View style={styles.wrap}>
      {ids.map((id) => (
        <SportChip key={id} id={id} selected={selected.includes(id)} onPress={() => onPick(id)} testID={`sport-${id}`} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line2, overflow: "hidden", maxWidth: "100%" },
  chipOn: { backgroundColor: colors.cy, borderColor: colors.cy },
});
