import { Linking } from "react-native";
import { Card } from "../../components/Card";
import { Group, ListRow } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import { Section } from "../../components/Section";
import { T } from "../../components/Text";
import { SITE_URL, SUPPORT_EMAIL } from "../../lib/config";

const FAQ: [string, string][] = [
  ["Mes séances sont-elles sauvegardées hors ligne ?", "Oui. Une séance est d’abord enregistrée sur ton téléphone, puis envoyée dès que la connexion revient. Le badge orange de l’onglet Progrès indique les séances en attente."],
  ["Comment est calculée l’XP ?", "Environ 10 XP par minute d’effort modéré, pondérée par ton ressenti (RPE). Plafonds : 1 800 XP par jour, 9 600 par semaine. Le serveur fait foi, avec les mêmes règles que le site."],
  ["Pourquoi une séance ancienne ne rapporte pas d’XP ?", "Une séance datée de plus de 30 jours rejoint ton historique, sans XP ni crédits ni contribution à l’aventure."],
  ["Je retrouve mon compte du site ?", "Oui : c’est le même compte. Tes séances, ton niveau, ton aventure et tes cosmétiques sont partagés entre l’application et titan-app.fr."],
  ["Les crédits s’achètent-ils ?", "Non. Ils se gagnent uniquement avec tes séances (10 % de l’XP) et ne servent qu’à des cosmétiques, sans avantage sportif."],
];

function mail(subject: string) {
  Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`TITAN Android — ${subject}`)}`);
}

export function HelpScreen() {
  return (
    <Screen>
      <Section title="Questions fréquentes">
        {FAQ.map(([q, a]) => (
          <Card key={q} style={{ gap: 6 }}>
            <T variant="bodyStrong">{q}</T>
            <T variant="small">{a}</T>
          </Card>
        ))}
      </Section>
      <Group title="Contacter l’équipe">
        <ListRow icon="alert" title="Signaler un bug" onPress={() => mail("Bug ou problème technique")} />
        <ListRow icon="user" title="Compte et connexion" onPress={() => mail("Compte et connexion")} />
        <ListRow icon="shield" title="Données personnelles" onPress={() => mail("Données personnelles")} />
        <ListRow icon="globe" title="Centre d’aide complet" subtitle="titan-app.fr/service" onPress={() => Linking.openURL(`${SITE_URL}/service`)} last />
      </Group>
      <T variant="caption" tone="faint">
        Réponse par e-mail à {SUPPORT_EMAIL}. N’envoie jamais ton mot de passe.
      </T>
    </Screen>
  );
}
