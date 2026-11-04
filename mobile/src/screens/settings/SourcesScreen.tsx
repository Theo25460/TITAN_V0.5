import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { StyleSheet } from "react-native";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Group, ListRow } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import { T } from "../../components/Text";
import { useOwner } from "../../data/auth";
import { useSteps } from "../../data/steps";
import { readGarmin } from "../../lib/nativeConnections";
import { garminStatus, healthConnectStatus, ownCounterStatus, type SourceStatus } from "../../lib/sources";
import { space } from "../../theme/tokens";

const pill = (s: SourceStatus) => <Chip label={s.label} tone={s.tone === "default" ? "default" : s.tone} />;

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
        <ListRow icon="run" title="Compteur TITAN" subtitle={own.detail} right={pill(own)} onPress={() => navigation.navigate("Steps")} testID="source-own" />
        <ListRow icon="heart" title="Santé Connect" subtitle={hc.detail} right={pill(hc)} onPress={() => navigation.navigate("HealthConnect")} testID="source-hc" last />
      </Group>
      <Group title="Activités">
        <ListRow icon="cloud" title="Garmin" subtitle={gm.detail} right={pill(gm)} onPress={() => navigation.navigate("Garmin")} testID="source-garmin" />
        <ListRow icon="route" title="Parcours GPS" subtitle="Tes sorties enregistrées avec le GPS, gardées sur ton téléphone." onPress={() => navigation.navigate("Routes")} testID="source-gps" last />
      </Group>
      <Card tone="flat" style={styles.note}>
        <T variant="bodyStrong">Autorisé, reçu, intégré</T>
        <T variant="small">Autoriser une source ne veut pas dire que des données sont arrivées, et des données reçues ne sont pas encore dans ton journal. TITAN le dit toujours séparément, et ne compte jamais deux fois le même effort.</T>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({ note: { gap: 6, padding: space.s4 } });
