import * as Application from "expo-application";
import { Linking } from "react-native";
import { Brand } from "../../components/Brand";
import { Card } from "../../components/Card";
import { Group, ListRow } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import { T } from "../../components/Text";
import { SITE_URL } from "../../lib/config";
import manifest from "../../core/web/manifest.json";

export function AboutScreen() {
  return (
    <Screen>
      <Brand size={44} />
      <T tone="muted">Fais du sport. TITAN le transforme en progression.</T>
      <Group>
        <ListRow icon="info" title="Version" value={`${Application.nativeApplicationVersion ?? "?"} (${Application.nativeBuildVersion ?? "?"})`} />
        <ListRow icon="layers" title="Règles métier" value={`web ${manifest.sha.slice(0, 7)}`} />
        <ListRow icon="globe" title="titan-app.fr" onPress={() => Linking.openURL(SITE_URL)} last />
      </Group>
      <Card style={{ gap: 6 }}>
        <T variant="bodyStrong">Licences</T>
        <T variant="small">Polices Archivo et Manrope (SIL Open Font License 1.1). Application construite avec React Native et Expo (MIT), Supabase (MIT), TanStack Query (MIT), React Navigation (MIT).</T>
      </Card>
    </Screen>
  );
}
