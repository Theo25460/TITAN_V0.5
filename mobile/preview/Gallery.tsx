/* Preview only: the RPG art of the app on one sheet, to judge it as a whole (#Crests). */
import { ScrollView, StyleSheet, View } from "react-native";
import { BeaconEmblem, RANK_IDS, RankCrest } from "../src/components/Crest";
import { T } from "../src/components/Text";
import { EffortRules } from "../src/core";
import { colors } from "../src/theme/tokens";

export function Gallery() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.wrap}>
      <T variant="h2">Blasons de rang</T>
      <View style={styles.grid}>
        {RANK_IDS.map((id) => (
          <View key={id} style={styles.cell}>
            <RankCrest rank={id} size={132} />
            <T variant="caption">{EffortRules.RANKS.find((r: { id: string }) => r.id === id)?.name}</T>
          </View>
        ))}
      </View>
      <T variant="h2">Balises</T>
      <View style={styles.grid}>
        {["#3DD9E8", "#9EE6C8", "#F4BB54", "#B693FF"].map((c) => (
          <View key={c} style={styles.cell}>
            <BeaconEmblem color={c} size={92} />
          </View>
        ))}
        <View style={styles.cell}>
          <BeaconEmblem color="#3DD9E8" size={92} lit={false} />
          <T variant="caption">éteinte</T>
        </View>
      </View>
      <T variant="h2">Petite taille</T>
      <View style={styles.grid}>
        {RANK_IDS.map((id) => (
          <RankCrest key={id} rank={id} size={48} glow={false} />
        ))}
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({ wrap: { padding: 16, gap: 14 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 }, cell: { alignItems: "center", gap: 4, width: 140 } });
