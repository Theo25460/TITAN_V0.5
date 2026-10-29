import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Screen } from "../../components/Screen";
import { T } from "../../components/Text";
import { useProfile } from "../../data/hooks";
import { colors } from "../../theme/tokens";
import { View } from "react-native";

/** TITAN+ is not sold in this version (founder decision, 21/10/2026): an honest "coming soon" page, no price, no payment. */
export function TitanPlusScreen() {
  const profile = useProfile().data;
  return (
    <Screen>
      <View style={{ alignItems: "center", gap: 12, paddingVertical: 12 }}>
        <Icon name="crown" size={44} color={colors.am} />
        <T variant="h1" center>
          TITAN+ — Bientôt disponible
        </T>
        <T tone="muted" center>
          Des analyses plus poussées et davantage de confort de personnalisation. Pas encore proposé : aucun achat n’est possible aujourd’hui.
        </T>
      </View>
      {profile?.is_elite ? (
        <Card tone="accent">
          <T variant="bodyStrong">Ton compte bénéficie déjà d’un accès TITAN+.</T>
        </Card>
      ) : null}
      <Card style={{ gap: 6 }}>
        <T variant="bodyStrong">Ce qui reste gratuit, pour toujours</T>
        <T variant="small">• Toutes les statistiques sportives de base, le journal et les records.</T>
        <T variant="small">• La progression, l’aventure et ses gardiens : battables sans payer.</T>
        <T variant="small">• Les crédits gagnés par l’effort et l’Atelier.</T>
        <T variant="small">• Aucune publicité.</T>
      </Card>
    </Screen>
  );
}
