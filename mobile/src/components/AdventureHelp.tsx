import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { colors, space } from "../theme/tokens";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { Tap } from "./Pressable";
import { T } from "./Text";

/** The few words of the adventure, in the order a session meets them (V12-35). Short on purpose: a reminder under a tap, not a second tutorial. */
export const ADVENTURE_WORDS: readonly { word: string; text: string }[] = [
  { word: "Séance", text: "Tout part d’un effort réel que tu enregistres. Le serveur le confirme, rien n’est gagné avant." },
  { word: "Chapitre", text: "Chaque chapitre a ses objectifs (jours de pratique, minutes…). Tes séances les font avancer toutes seules." },
  { word: "Balise", text: "Objectifs atteints : tu allumes la balise du chapitre. Elle rejoint ta collection et ouvre la suite du chemin." },
  { word: "Gardien", text: "Le dernier chapitre d’un monde est l’épreuve de son gardien." },
  { word: "Repos", text: "Une semaine calme ne t’enlève rien : l’aventure t’attend." },
];

export function AdventureHelp() {
  const [open, setOpen] = useState(false);
  return (
    <Card tone="flat" style={{ gap: space.s3 }} testID="adventure-help">
      <Tap onPress={() => setOpen((o) => !o)} accessibilityLabel="Comment ça marche ?" accessibilityState={{ expanded: open }} accessibilityHint="Affiche ou masque l’explication de l’aventure" style={styles.head} testID="adventure-help-toggle">
        <Icon name="help" size={20} color={colors.cy} />
        <T variant="bodyStrong" style={{ flex: 1 }}>
          Comment ça marche ?
        </T>
        <Icon name={open ? "chevronDown" : "chevron"} size={18} color={colors.tx3} />
      </Tap>
      {open ? (
        <View style={{ gap: space.s2 }}>
          {ADVENTURE_WORDS.map((w) => (
            <T key={w.word} variant="small">
              <T variant="small" tone="accent" style={{ fontWeight: "700" }}>
                {w.word} ·{" "}
              </T>
              {w.text}
            </T>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space.s3, minHeight: 48, margin: -space.s2, padding: space.s2, borderRadius: 12 },
});
