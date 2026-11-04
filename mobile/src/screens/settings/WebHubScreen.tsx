import { Linking } from "react-native";
import { Card } from "../../components/Card";
import { Group, ListRow } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import { T } from "../../components/Text";
import { WEB_FEATURES, webUrl } from "../../lib/webHub";

/** TITAN on the website: the complete tool. The app is the pocket companion (record, sensors, today), and keeps a door to the rest. */
export function WebHubScreen() {
  return (
    <Screen>
      <T tone="muted">Le site titan-app.fr est TITAN au complet, avec le même compte. L’application garde l’essentiel à portée de main ; le reste s’ouvre dans ton navigateur.</T>
      <Group title="Sur le site">
        {WEB_FEATURES.map((f, i) => (
          <ListRow key={f.id} icon={f.icon} title={f.title} subtitle={f.text} onPress={() => Linking.openURL(webUrl(f.path))} testID={`web-${f.id}`} last={i === WEB_FEATURES.length - 1} />
        ))}
      </Group>
      <Card tone="flat" style={{ gap: 6 }}>
        <T variant="bodyStrong">Même compte, mêmes règles</T>
        <T variant="small">Ta progression, tes séances et ton aventure sont les mêmes sur le site et dans l’application. Les gains sont toujours confirmés par le serveur.</T>
      </Card>
    </Screen>
  );
}
