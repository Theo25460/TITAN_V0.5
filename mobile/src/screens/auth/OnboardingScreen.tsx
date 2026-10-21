import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { Icon, type IconName } from "../../components/Icon";
import { Tap } from "../../components/Pressable";
import { Screen } from "../../components/Screen";
import { SportGrid, SportSearch } from "../../components/SportPicker";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Sports } from "../../core";
import { usePrefs, useSavePrefs } from "../../data/hooks";
import { errorMessage } from "../../lib/errors";
import { colors, radius, space } from "../../theme/tokens";

const PROMISES: [IconName, string, string][] = [
  ["lock", "Profil privé par défaut.", "Rien n’est visible des autres tant que tu ne le partages pas."],
  ["shield", "Aucune progression à acheter.", "L’XP vient uniquement de tes séances réelles."],
  ["download", "Tes données t’appartiennent.", "Export et suppression du compte à tout moment depuis les réglages."],
];

/** First run, under a minute: sports, weekly rhythm, privacy promises. Saved like the website (onboardedAt). */
export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const prefs = usePrefs();
  const save = useSavePrefs();
  const toast = useToast();
  const navigation = useNavigation();
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string[]>(prefs.favoriteSports.slice(0, 5));
  const [target, setTarget] = useState(prefs.weeklyGoalSessions);
  const [limitHit, setLimitHit] = useState(false);

  const toggle = (id: string) => {
    setLimitHit(false);
    setPicked((p) => (p.includes(id) ? p.filter((s) => s !== id) : p.length >= 5 ? (setLimitHit(true), p) : [...p, id]));
  };

  async function finish(next: "record" | "home") {
    try {
      await save.mutateAsync({ prefs: { favoriteSports: picked.slice(0, 5), weeklyGoalSessions: target, onboardedAt: new Date().toISOString() } });
      navigation.reset(next === "record" && picked[0] ? { index: 1, routes: [{ name: "Tabs" }, { name: "SessionForm", params: { sport: picked[0] } }] } : { index: 0, routes: [{ name: "Tabs" }] });
    } catch (e) {
      toast({ kind: "err", title: "Préférences non enregistrées", message: errorMessage(e) });
    }
  }

  const popular = [...new Set([...picked, ...Sports.POPULAR])];
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.steps} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 3, now: step + 1 }} accessibilityLabel={`Étape ${step + 1} sur 3`}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.stepBar, i <= step && { backgroundColor: colors.cy }]} />
        ))}
      </View>
      <Screen
        footer={
          <View style={{ flexDirection: "row", gap: space.s3 }}>
            {step > 0 ? <Button label="Retour" kind="secondary" onPress={() => setStep(step - 1)} style={{ flex: 1 }} /> : null}
            {step < 2 ? (
              <Button label={step === 0 && !picked.length ? "Passer" : "Continuer"} onPress={() => setStep(step + 1)} style={{ flex: 2 }} testID="onboarding-next" />
            ) : (
              <Button label={picked[0] ? `Enregistrer une séance` : "Découvrir mon QG"} loading={save.isPending} onPress={() => finish(picked[0] ? "record" : "home")} style={{ flex: 2 }} testID="onboarding-finish" />
            )}
          </View>
        }
      >
        {step === 0 ? (
          <>
            <T variant="eyebrow" tone="accent">
              1 · Tes sports
            </T>
            <T variant="h1">Qu’est-ce que tu pratiques ?</T>
            <T tone="muted">Choisis jusqu’à 5 sports. Ils seront en tête quand tu enregistres une séance.</T>
            <SportSearch onPick={toggle} selected={picked} />
            <SportGrid ids={popular} selected={picked} onPick={toggle} />
            <T variant="small" accessibilityLiveRegion="polite">
              {limitHit ? "5 sports maximum : retire-en un pour en choisir un autre. " : ""}
              {picked.length ? `${picked.length}/5 : ${picked.map(Sports.label).join(", ")}` : "Aucun sport choisi pour l’instant."}
            </T>
          </>
        ) : step === 1 ? (
          <>
            <T variant="eyebrow" tone="accent">
              2 · Ton rythme
            </T>
            <T variant="h1">Combien de jours actifs par semaine ?</T>
            <T tone="muted">C’est ta cadence. Une semaine où tu l’atteins est une semaine tenue. Pas de série à casser : une semaine calme ne t’enlève rien.</T>
            <View style={styles.targets} accessibilityRole="radiogroup">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <Tap key={n} onPress={() => setTarget(n)} accessibilityRole="radio" accessibilityState={{ checked: target === n }} accessibilityLabel={`${n} jour${n > 1 ? "s" : ""} par semaine`} style={[styles.target, target === n && styles.targetOn]}>
                  <T variant="h2" color={target === n ? colors.cyInk : colors.tx}>
                    {n}
                  </T>
                </Tap>
              ))}
            </View>
            <T variant="small">{target <= 2 ? "Un départ solide, facile à tenir dans une semaine chargée." : target <= 4 ? "Le rythme le plus courant pour progresser durablement." : "Un rythme soutenu : pense aux jours de récupération."} Modifiable à tout moment.</T>
          </>
        ) : (
          <>
            <T variant="eyebrow" tone="accent">
              3 · Ce qui t’appartient
            </T>
            <T variant="h1">Tes données restent à toi.</T>
            {PROMISES.map(([icon, title, text]) => (
              <View key={title} style={styles.promise}>
                <Icon name={icon} size={22} color={colors.cy} />
                <View style={{ flex: 1 }}>
                  <T variant="bodyStrong">{title}</T>
                  <T variant="small">{text}</T>
                </View>
              </View>
            ))}
            <T variant="small">L’aventure est facultative : démarre une campagne dans l’onglet Aventure pour y faire compter tes jours actifs.</T>
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  steps: { flexDirection: "row", gap: 6, paddingHorizontal: space.s4, paddingVertical: space.s3 },
  stepBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.bg4 },
  targets: { flexDirection: "row", gap: 6 },
  target: { flex: 1, aspectRatio: 0.8, minHeight: 48, borderRadius: radius.r2, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line2, alignItems: "center", justifyContent: "center" },
  targetOn: { backgroundColor: colors.cy, borderColor: colors.cy },
  promise: { flexDirection: "row", gap: space.s3, padding: space.s4, borderRadius: radius.r3, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line },
});
