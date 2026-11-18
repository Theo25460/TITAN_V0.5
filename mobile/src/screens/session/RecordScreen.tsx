import { useNavigation } from "@react-navigation/native";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon, type IconName } from "../../components/Icon";
import { lastSessionsToRepeat, RepeatLastCard } from "../../components/RepeatLastCard";
import { Tap } from "../../components/Pressable";
import { Screen } from "../../components/Screen";
import { SpaceField } from "../../components/SpaceField";
import { Section } from "../../components/Section";
import { SportGrid, SportSearch } from "../../components/SportPicker";
import { T } from "../../components/Text";
import { Format, Progress, Sports } from "../../core";
import { useLogs, usePrefs } from "../../data/hooks";
import { useOwner } from "../../data/auth";
import { useDraftSport } from "../../data/drafts";
import { useQueue } from "../../data/queue";
import { useLiveFlag, useSavedLive } from "../../data/live";
import { Segmented } from "../../components/Segmented";
import { gpsShortcutSport } from "../../lib/gpsTrack";
import { colors, space, TOUCH } from "../../theme/tokens";

/** One of the other ways to record: a full-width row with what it does in one line. */
function Way({ icon, title, text, onPress, testID, line }: { icon: IconName; title: string; text: string; onPress: () => void; testID?: string; line?: boolean }) {
  return (
    <Tap onPress={onPress} testID={testID} accessibilityLabel={`${title}. ${text}`} style={[styles.way, line && styles.wayLine]}>
      <Icon name={icon} size={22} color={colors.cy} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T variant="bodyStrong">{title}</T>
        <T variant="small">{text}</T>
      </View>
      <Icon name="chevron" size={18} color={colors.tx3} />
    </Tap>
  );
}

/** Séance tab: what waits on this phone first, then the ways to record: by hand (the default), with the GPS, from a file or a watch. */
export function RecordScreen() {
  const navigation = useNavigation();
  const prefs = usePrefs();
  const { active } = useLogs();
  const draft = useDraftSport();
  const owner = useOwner();
  const queue = useQueue();
  const waiting = queue.owner === owner ? queue.items : [];
  const refused = waiting.filter((i) => i.status === "error").length;
  const [choosing, setChoosing] = useState(false);
  const liveEnabled = useLiveFlag();
  const liveSaved = useSavedLive();
  const [mode, setMode] = useState<"log" | "live">("log");
  const recent = useMemo(() => {
    const seen = new Map<string, string>();
    for (const l of active) if (!seen.has(l.sport) && Sports.conf(l.sport)) seen.set(l.sport, l.date);
    return [...seen.entries()].slice(0, 6);
  }, [active]);
  const gpsSport = useMemo(() => gpsShortcutSport(prefs.favoriteSports, recent.map(([s]) => s)), [prefs.favoriteSports, recent]);
  const repeats = useMemo(() => lastSessionsToRepeat(active, 3), [active]);
  const open = (sport: string) => {
    setChoosing(false);
    if (liveEnabled && mode === "live") navigation.navigate("LiveSession", { sport });
    else navigation.navigate("SessionForm", { sport });
  };
  const favorites = prefs.favoriteSports.filter((s) => Sports.conf(s));
  const popular = Sports.POPULAR.filter((s) => !favorites.includes(s) && !recent.some(([r]) => r === s));
  // Four shortcuts (AUD-15): two left most people opening the full catalogue for their third sport.
  const shortcuts = [...new Set([...favorites, ...recent.map(([sport]) => sport), ...popular])].slice(0, 4);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen tab padded={false}>
        {/* The lime field: one question and the way to answer it. Recording starts here, whatever else the page offers below. */}
        <SpaceField id="seance" title="Qu’as-tu fait ?" lead="Choisis ton sport et note l’essentiel : une minute suffit." testID="record-field">
          <View style={{ gap: space.s2 }}>
            {draft ? (
              <Button kind="ink" label="Reprendre le brouillon" icon="edit" onPress={() => navigation.navigate("SessionForm", { sport: draft.sport })} accessibilityHint={`${Sports.label(draft.sport)} · gardé sur ce téléphone`} />
            ) : null}
            <Button kind="ink" label={choosing ? "Masquer les sports" : "Choisir un sport"} icon={choosing ? "close" : "search"} onPress={() => setChoosing(!choosing)} testID="record-choose-sport" />
          </View>
        </SpaceField>
        <View style={styles.body}>
        {/* What is still on this phone is said first, in one line, with its way out. */}
        {waiting.length ? (
          <Card tone="flat" onPress={() => navigation.navigate("Pending")} testID="record-pending" style={styles.pending}
            accessibilityLabel={refused ? `${Format.plural(refused, "séance refusée", "séances refusées")} par le serveur. Ouvrir les envois en attente pour corriger ou renvoyer.` : `${Format.plural(waiting.length, "séance en attente", "séances en attente")} d’envoi, sur ce téléphone. Ouvrir les envois en attente.`}>
            <Icon name={refused ? "alert" : "offline"} size={22} color={refused ? colors.err : colors.warn} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T variant="bodyStrong">{refused ? `${Format.plural(refused, "séance refusée", "séances refusées")} par le serveur` : `${Format.plural(waiting.length, "séance en attente", "séances en attente")} d’envoi`}</T>
              <T variant="small">{refused ? "Ouvre les envois en attente pour corriger ou renvoyer." : "Sur ce téléphone, envoi dès que possible. Aucune XP avant la confirmation."}</T>
            </View>
            <Icon name="chevron" size={18} color={colors.tx3} />
          </Card>
        ) : null}
        {liveEnabled ? (
          <Segmented options={[{ value: "log", label: "Saisir après" }, { value: "live", label: "Vivre en direct" }]} value={mode} onChange={setMode} accessibilityLabel="Mode de séance" />
        ) : null}
        {liveEnabled && liveSaved && liveSaved.status !== "ended" ? (
          <Button label="Reprendre la séance live" icon="play" onPress={() => navigation.navigate("LiveSession", { sport: liveSaved.sport })} accessibilityHint={`${Sports.label(liveSaved.sport)} · gardée sur ce téléphone`} testID="live-resume" />
        ) : null}
        {liveEnabled && mode === "live" ? <T variant="small" tone="muted">Choisis ton sport : TITAN prépare ta Voie, tes missions et ton accompagnement.</T> : null}
        {!choosing ? <Section title="Accès rapide"><SportGrid ids={shortcuts} onPick={open} /></Section> : null}
        {!choosing && mode === "log" && repeats.length ? (
          <Section title="Refaire">
            <View style={{ gap: space.s2 }}>
              {repeats.map((log, i) =>
                i === 0 ? <RepeatLastCard key={log.id} log={log} compact /> : <RepeatLastCard key={log.id} log={log} compact title={`Refaire · ${Sports.label(log.sport)}`} testID={`repeat-${log.sport}`} />,
              )}
            </View>
          </Section>
        ) : null}
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
                    <Tap key={sport} onPress={() => open(sport)} accessibilityLabel={`${Sports.label(sport)}, dernière séance ${Format.relativeDay(date)}`} style={{ borderRadius: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: space.s3, padding: space.s3, borderRadius: 8, backgroundColor: colors.bg2 }}>
                        <Icon name={Sports.iconOf(sport)} size={22} color={colors.cy} />
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
        {/* The GPS used to be reachable only from inside a running/cycling form (V12-10), the GPX import and the watch from nowhere on
            this screen: the three other ways now sit together, each with what it does. */}
        {!choosing ? (
          <Section title="Autres façons d’enregistrer">
            <Card tone="plain">
              <Way icon="route" title="Suivre ma sortie en GPS" text={`${Sports.label(gpsSport)} · distance, allure et dénivelé, écran verrouillé`} onPress={() => navigation.navigate("GpsRecord", { sport: gpsSport })} testID="gps-shortcut" />
              <Way line icon="upload" title="Importer un fichier GPX" text={`Ouvre la séance de ${Sports.label(gpsSport).toLowerCase()} : le bouton d’import est sous les mesures.`} onPress={() => navigation.navigate("SessionForm", { sport: gpsSport })} testID="record-gpx" />
              <Way line icon="cloud" title="Depuis une montre ou un capteur" text="Garmin, Santé Connect : voir ce qui est connecté et ce qui arrive dans ton journal." onPress={() => navigation.navigate("Sources")} testID="record-sources" />
            </Card>
          </Section>
        ) : null}
        <T variant="caption" tone="faint">
          Hors ligne aussi : la séance est gardée sur ce téléphone puis envoyée automatiquement.
        </T>
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.s5, paddingTop: space.s4, gap: space.s5 },
  way: { flexDirection: "row", alignItems: "center", gap: space.s3, paddingVertical: space.s3, minHeight: TOUCH + space.s4 },
  wayLine: { borderTopWidth: 1, borderTopColor: colors.line },
  pending: { flexDirection: "row", alignItems: "center", gap: space.s3 },
});
