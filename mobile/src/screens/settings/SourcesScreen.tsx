import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { StyleSheet, View } from "react-native";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Group } from "../../components/ListRow";
import { Icon, type IconName } from "../../components/Icon";
import { Tap } from "../../components/Pressable";
import { Screen } from "../../components/Screen";
import { T } from "../../components/Text";
import { useOwner } from "../../data/auth";
import { useSteps } from "../../data/steps";
import { readGarmin } from "../../lib/nativeConnections";
import { garminStatus, healthConnectStatus, ownCounterStatus, type SourceStatus } from "../../lib/sources";
import { colors, space } from "../../theme/tokens";

/** Title and status on one line, the explanation under them: a long name never gets squeezed by the status. */
function SourceRow({ icon, title, status, onPress, testID, last }: { icon: IconName; title: string; status: SourceStatus; onPress: () => void; testID: string; last?: boolean }) {
  return (
    <Tap onPress={onPress} testID={testID} accessibilityLabel={`${title}, ${status.label}. ${status.detail}`}>
      <View style={[styles.row, !last && styles.border]}>
        <View style={styles.icon}>
          <Icon name={icon} size={20} color={colors.cy} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.titleLine}>
            <T variant="bodyStrong" style={{ flexShrink: 1 }}>
              {title}
            </T>
            <Chip label={status.label} tone={status.tone} />
          </View>
          <T variant="small">{status.detail}</T>
        </View>
        <Icon name="chevron" size={18} color={colors.tx4} />
      </View>
    </Tap>
  );
}

/** Every way data reaches TITAN, with the same vocabulary and the same place (V12-43, V12-10). */
export function SourcesScreen() {
  const owner = useOwner();
  const navigation = useNavigation() as unknown as { navigate: (n: string) => void };
  const steps = useSteps();
  const garmin = useQuery({ queryKey: ["garmin", owner], queryFn: () => readGarmin(owner), retry: false });
  const own = ownCounterStatus(steps.own);
  const hc = healthConnectStatus(steps.connected, steps.view.lastUpdate);
  const gm = garminStatus(garmin.data, !!garmin.error);
  return (
    <Screen>
      <T tone="muted">Tes pas et tes activités peuvent arriver de plusieurs sources. Tu choisis lesquelles, et tu peux les retirer quand tu veux.</T>
      <Group title="Pas">
        <SourceRow icon="run" title="Compteur TITAN" status={own} onPress={() => navigation.navigate("Steps")} testID="source-own" />
        <SourceRow icon="heart" title="Santé Connect" status={hc} onPress={() => navigation.navigate("HealthConnect")} testID="source-hc" last />
      </Group>
      <Group title="Activités">
        <SourceRow icon="cloud" title="Garmin" status={gm} onPress={() => navigation.navigate("Garmin")} testID="source-garmin" />
        <SourceRow icon="route" title="Parcours GPS" status={{ label: "Sur ton téléphone", tone: "default", detail: "Tes sorties enregistrées avec le GPS restent sur ton téléphone." }} onPress={() => navigation.navigate("Routes")} testID="source-gps" last />
      </Group>
      <Card tone="flat" style={styles.note}>
        <T variant="bodyStrong">Autorisé, reçu, intégré</T>
        <T variant="small">Autoriser une source ne veut pas dire que des données sont arrivées, et des données reçues ne sont pas encore dans ton journal. TITAN le dit toujours séparément, et ne compte jamais deux fois le même effort.</T>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { gap: 6, padding: space.s4 },
  row: { flexDirection: "row", alignItems: "center", gap: space.s3, paddingHorizontal: space.s4, paddingVertical: space.s3, minHeight: 64 },
  border: { borderBottomWidth: 1, borderBottomColor: colors.line },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.cySoft, alignItems: "center", justifyContent: "center" },
  titleLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
});
