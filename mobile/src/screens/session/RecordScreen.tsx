import { useNavigation } from "@react-navigation/native";
import { useMemo } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Tap } from "../../components/Pressable";
import { Screen } from "../../components/Screen";
import { Section } from "../../components/Section";
import { SportGrid, SportSearch } from "../../components/SportPicker";
import { T } from "../../components/Text";
import { Format, Progress, Sports } from "../../core";
import { useLogs, usePrefs } from "../../data/hooks";
import { useDraftSport } from "../../data/drafts";
import { colors, space } from "../../theme/tokens";

/** Séance tab: one tap to the right form. Favourites, recent sports, then the full catalogue (260 sports, offline). */
export function RecordScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const prefs = usePrefs();
  const { active } = useLogs();
  const draft = useDraftSport();
  const recent = useMemo(() => {
    const seen = new Map<string, string>();
    for (const l of active) if (!seen.has(l.sport) && Sports.conf(l.sport)) seen.set(l.sport, l.date);
    return [...seen.entries()].slice(0, 6);
  }, [active]);
  const open = (sport: string) => navigation.navigate("SessionForm", { sport });
  const favorites = prefs.favoriteSports.filter((s) => Sports.conf(s));
  const popular = Sports.POPULAR.filter((s) => !favorites.includes(s) && !recent.some(([r]) => r === s));

  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.bg }}>
      <Screen tab>
        <View style={{ gap: 4 }}>
          <T variant="eyebrow" tone="accent">
            Séance
          </T>
          <T variant="h1">Qu’as-tu fait ?</T>
          <T tone="muted">Choisis ton sport : le formulaire s’adapte à ce qui se mesure.</T>
        </View>
        {draft ? (
          <Card tone="accent" onPress={() => open(draft.sport)} accessibilityLabel={`Reprendre le brouillon de ${Sports.label(draft.sport)}`}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.s3 }}>
              <Icon name="edit" size={22} color={colors.cy} />
              <View style={{ flex: 1 }}>
                <T variant="bodyStrong">Reprendre le brouillon</T>
                <T variant="small">{Sports.label(draft.sport)} · gardé sur ce téléphone</T>
              </View>
              <Icon name="chevron" color={colors.cy} />
            </View>
          </Card>
        ) : null}
        <SportSearch onPick={open} />
        {favorites.length ? (
          <Section title="Mes sports">
            <SportGrid ids={favorites} onPick={open} />
          </Section>
        ) : null}
        {recent.length ? (
          <Section title="Récemment">
            <View style={{ gap: space.s2 }}>
              {recent.map(([sport, date]) => (
                <Tap key={sport} onPress={() => open(sport)} accessibilityLabel={`${Sports.label(sport)}, dernière séance ${Format.relativeDay(date)}`} style={{ borderRadius: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.s3, padding: space.s3, borderRadius: 14, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line }}>
                    <Icon name={Sports.FAMILY_ICON[Sports.familyOf(sport)]} size={22} color={colors.cy} />
                    <View style={{ flex: 1 }}>
                      <T variant="bodyStrong">{Sports.label(sport)}</T>
                      <T variant="caption" tone="faint">
                        {Progress.sportMeta(sport).family ? Sports.FAMILY_LABEL[Sports.familyOf(sport)] : ""} · {Format.relativeDay(date)}
                      </T>
                    </View>
                    <Icon name="plus" size={20} color={colors.tx3} />
                  </View>
                </Tap>
              ))}
            </View>
          </Section>
        ) : null}
        <Section title="Populaires">
          <SportGrid ids={popular} onPick={open} />
        </Section>
        <T variant="caption" tone="faint">
          Hors ligne aussi : la séance est gardée sur ce téléphone puis envoyée automatiquement.
        </T>
      </Screen>
    </View>
  );
}
