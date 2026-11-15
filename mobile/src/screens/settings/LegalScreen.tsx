import { ADS_BUILD } from "../../ads/adIds";
import { Linking } from "react-native";
import { Card } from "../../components/Card";
import { Group, ListRow } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import { T } from "../../components/Text";
import { SITE_URL } from "../../lib/config";

/** The legal texts are the website's official versions (single source), opened in the browser. */
export function LegalScreen() {
  return (
    <Screen>
      <Card style={{ gap: 6 }}>
        <T variant="bodyStrong">L’essentiel</T>
        <T variant="small">{ADS_BUILD ? "L’application Android gratuite affiche des publicités Google AdMob, une fois ton choix fait dans le formulaire de Google et jamais pendant une séance ; TITAN+, Coach et Coach Ultra n’en affichent aucune. Les données de ton compte (séances, profil) ne sont ni vendues ni transmises aux annonceurs. Tu peux revoir ton choix publicitaire dans Confidentialité, exporter tes données et supprimer ton compte à tout moment depuis l’application." : "TITAN est gratuit et sans publicité. Tes données servent uniquement au fonctionnement de ton compte : elles ne sont ni vendues ni partagées à des fins publicitaires. Tu peux les exporter et supprimer ton compte à tout moment depuis l’application."}</T>
      </Card>
      <Group>
        <ListRow icon="journal" title="Conditions d’utilisation" onPress={() => Linking.openURL(`${SITE_URL}/legal_cgu`)} />
        <ListRow icon="lock" title="Politique de confidentialité" onPress={() => Linking.openURL(`${SITE_URL}/legal_privacy`)} />
        <ListRow icon="info" title="Mentions légales" onPress={() => Linking.openURL(`${SITE_URL}/legal_mentions`)} />
        <ListRow icon="shield" title="Centre de confiance" onPress={() => Linking.openURL(`${SITE_URL}/legal_hub`)} last />
      </Group>
    </Screen>
  );
}
