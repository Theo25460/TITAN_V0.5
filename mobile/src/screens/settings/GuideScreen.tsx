import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon, type IconName } from "../../components/Icon";
import { ProgressBar } from "../../components/Progress";
import { Screen } from "../../components/Screen";
import { T } from "../../components/Text";
import { colors } from "../../theme/tokens";
import type { RootParams } from "../../navigation/types";

/** V11-78: an optional guide in three steps. Each step opens the real screen, nothing is forced and nothing is recorded: it can be left at any time and reopened from Assistance. */
export const GUIDE_STEPS: { icon: IconName; title: string; text: string; action: string; target: "record" | "journal" | "adventure" }[] = [
  { icon: "plus", title: "1. Enregistre une séance", text: "Choisis ton sport, indique la durée (et la distance ou les séries si tu veux). Sans connexion, la séance reste sur ton téléphone et part dès que le réseau revient.", action: "Ouvrir « Séance »", target: "record" },
  { icon: "journal", title: "2. Retrouve-la dans le Journal", text: "Toutes tes séances sont rangées par date. Tu peux les corriger, les archiver ou en refaire une identique en deux touches.", action: "Ouvrir le Journal", target: "journal" },
  { icon: "mountain", title: "3. Fais avancer ton aventure", text: "Tes efforts, quel que soit le sport, allument les balises de l’aventure. Aucune pression : se reposer fait partie du jeu.", action: "Ouvrir l’aventure", target: "adventure" },
];

type Props = NativeStackScreenProps<RootParams, "Guide">;

export function GuideScreen({ navigation }: Props) {
  const [index, setIndex] = useState(0);
  const step = GUIDE_STEPS[index]!;
  const last = index === GUIDE_STEPS.length - 1;
  function open() {
    if (step.target === "journal") navigation.navigate("Journal");
    else navigation.navigate("Tabs", { screen: step.target === "record" ? "Record" : "Adventure" });
  }
  return (
    <Screen>
      <ProgressBar value={(index + 1) / GUIDE_STEPS.length} accessibilityLabel={`Étape ${index + 1} sur ${GUIDE_STEPS.length}`} />
      <T variant="caption" tone="muted">{`Étape ${index + 1} sur ${GUIDE_STEPS.length}`}</T>
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Icon name={step.icon} size={22} color={colors.cy} />
          <T variant="h3" style={{ flex: 1 }}>{step.title}</T>
        </View>
        <T>{step.text}</T>
        <Button label={step.action} kind="secondary" onPress={open} testID="guide-open" />
      </Card>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Button label="Précédent" kind="ghost" disabled={index === 0} onPress={() => setIndex(index - 1)} style={{ flex: 1 }} testID="guide-prev" />
        <Button label={last ? "Terminer" : "Suivant"} onPress={() => (last ? navigation.goBack() : setIndex(index + 1))} style={{ flex: 1 }} testID="guide-next" />
      </View>
      <Button label="Passer le guide" kind="ghost" small onPress={() => navigation.goBack()} testID="guide-skip" accessibilityHint="Ferme le guide ; tu peux le rouvrir depuis Assistance" />
    </Screen>
  );
}
