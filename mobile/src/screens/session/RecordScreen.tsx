import { useNavigation } from "@react-navigation/native";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { lastSessionToRepeat, RepeatLastCard } from "../../components/RepeatLastCard";
import { Tap } from "../../components/Pressable";
import { Screen } from "../../components/Screen";
import { Section } from "../../components/Section";
import { SportGrid, SportSearch } from "../../components/SportPicker";
import { T } from "../../components/Text";
import { Format, Progress, Sports } from "../../core";
import { useLogs, usePrefs } from "../../data/hooks";
import { useDraftSport } from "../../data/drafts";
import { gpsShortcutSport } from "../../lib/gpsTrack";
import { colors, space } from "../../theme/tokens";

/** Séance tab: resume a draft, pick a sport, replay an effort or track a route. */
export function RecordScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const prefs = usePrefs();
  const { active } = useLogs();
  const draft = useDraftSport();
  const [choosing, setChoosing] = useState(false);
  const recent = useMemo(() => {
    const seen = new Map<string, string>();
    for (const l of active) if (!seen.has(l.sport) && Sports.conf(l.sport)) seen.set(l.sport, l.date);
    return [...seen.entries()].slice(0, 6);
  }, [active]);
  const gpsSport = useMemo(() => gpsShortcutSport(prefs.favoriteSports, recent.map(([s]) => s)), [prefs.favoriteSports, recent]);
  const repeat = useMemo(() => lastSessionToRepeat(active), [active]);
  const open = (sport: string) => {
    setChoosing(false);
    navigation.navigate("SessionForm", { sport });
  };
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
          <T tone="muted">Enregistre ton effort avec les mesures de ton sport.</T>
        </View>
        {draft ? (
          <Button label="Reprendre le brouillon" icon="edit" onPress={() => open(draft.sport)} accessibilityHint={`${Sports.label(draft.sport)} · gardé sur ce téléphone`} />
        ) : null}
        <Button label={choosing ? "Masquer les sports" : "Choisir un sport"} icon={choosing ? "close" : "search"} kind={draft || choosing ? "secondary" : "primary"} onPress={() => setChoosing(!choosing)} testID="record-choose-sport" />
        {choosing ? (
          <>
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
          </>
        ) : null}
        {repeat ? <RepeatLastCard log={repeat} /> : null}
        {/* The GPS used to be reachable only from inside a running/cycling form (V12-10): it has its own entry now. */}
        <Card onPress={() => navigation.navigate("GpsRecord", { sport: gpsSport })} accessibilityLabel={`Suivre ma sortie en GPS, ${Sports.label(gpsSport)}`} testID="gps-shortcut">
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.s3 }}>
            <Icon name="route" size={22} color={colors.cy} />
            <View style={{ flex: 1 }}>
              <T variant="bodyStrong">Suivre ma sortie en GPS</T>
              <T variant="small">{Sports.label(gpsSport)} · distance, allure et dénivelé, écran verrouillé</T>
            </View>
            <Icon name="chevron" color={colors.tx3} />
          </View>
        </Card>
        <T variant="caption" tone="faint">
          Hors ligne aussi : la séance est gardée sur ce téléphone puis envoyée automatiquement.
        </T>
      </Screen>
    </View>
  );
}
