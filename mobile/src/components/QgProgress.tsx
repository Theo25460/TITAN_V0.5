import { Image, StyleSheet, View } from "react-native";
import { Format } from "../core";
import { colors, radius, space, TOUCH } from "../theme/tokens";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { Tap } from "./Pressable";
import { Ring } from "./Progress";
import { T } from "./Text";

type Cadence = { currentDays: number; target: number; currentPaused?: boolean };

export type QgChapter = {
  worldName: string;
  color: string;
  image: number;
  /** 1 to 9. */
  chapter: number;
  chapterName?: string;
  /** What the server snapshot says about the chapter: "ready" only when every objective is met. */
  status: "active" | "ready" | "complete";
  /** e.g. "1/2 jours actifs · 30/60 min d’effort", built from the confirmed evidence only. */
  objectives: string;
};

/** The QG's second block, always visible: what the week gave (confirmed XP only) and the chapter in progress, with what it still asks.
    Two rows in one card instead of a ring tile, a hidden "ascension" panel and a separate world line: one place to read "where am I". */
export function QgProgress({ cadence, sessions, weekXp, showWeek, chapter, online, onWeek, onChapter }: {
  cadence: Cadence;
  sessions: number;
  /** XP of this week's confirmed sessions (the journal's own figures), never an estimate. */
  weekXp: number;
  /** False for an account without any session yet: an empty ring is not a figure. */
  showWeek: boolean;
  chapter: QgChapter | null;
  online: boolean;
  onWeek: () => void;
  onChapter: () => void;
}) {
  const reached = !cadence.currentPaused && cadence.target > 0 && cadence.currentDays >= cadence.target;
  const tint = reached ? colors.ok : colors.cy;
  const days = `${cadence.currentDays} jour${cadence.currentDays > 1 ? "s" : ""} actif${cadence.currentDays > 1 ? "s" : ""}`;
  const weekLine = cadence.currentPaused ? `${days} · cadence en pause` : `${days} sur ${cadence.target}`;
  const sessionsText = `${sessions} séance${sessions > 1 ? "s" : ""}`;
  const chapterLine = !chapter
    ? "Choisis un monde : tes séances y feront avancer une histoire."
    : chapter.status === "complete"
      ? "Monde terminé. Un autre monde t’attend."
      : chapter.status === "ready"
        ? online ? "Balise prête : tu peux l’allumer." : "Balise prête. Connexion nécessaire pour l’allumer."
        : `Pour allumer la balise : ${chapter.objectives}`;
  return (
    <Card style={styles.card} testID="qg-progress">
      {showWeek ? (
        <Tap onPress={onWeek} testID="week-tile" style={styles.row} accessibilityLabel={`Ma semaine : ${weekLine}, ${sessionsText}${weekXp > 0 ? `, ${Format.number(weekXp)} XP confirmés` : ""}. Ouvrir Progrès.`}>
          {cadence.currentPaused ? (
            <View style={styles.disc}><Icon name="calendar" size={22} color={colors.tx3} /></View>
          ) : (
            <Ring value={cadence.target ? cadence.currentDays / cadence.target : 0} size={TOUCH} stroke={5} color={tint}>
              <Icon name={reached ? "check" : "calendar"} size={18} color={tint} />
            </Ring>
          )}
          <View style={styles.text}>
            <T variant="caption" tone="faint">Cette semaine</T>
            <T variant="bodyStrong">{weekLine}</T>
            <T variant="caption" tone="muted">
              {sessionsText}
              {weekXp > 0 ? <T variant="caption" tone="accent"> · +{Format.number(weekXp)} XP</T> : null}
            </T>
          </View>
          <Icon name="chevron" size={18} color={colors.tx3} />
        </Tap>
      ) : null}
      <Tap onPress={onChapter} testID="qg-chapter" style={[styles.row, showWeek && styles.line]} accessibilityLabel={chapter ? `${chapter.worldName}, chapitre ${chapter.chapter} sur 9${chapter.chapterName ? `, ${chapter.chapterName}` : ""}. ${chapterLine} Ouvrir ce monde.` : `Aventure. ${chapterLine}`}>
        {chapter ? <Image source={chapter.image} style={styles.thumb} accessibilityIgnoresInvertColors /> : <View style={styles.disc}><Icon name="compass" size={22} color={colors.cy} /></View>}
        <View style={styles.text}>
          <T variant="caption" color={chapter?.color ?? colors.tx3}>
            {chapter ? `${chapter.worldName} · chapitre ${chapter.chapter}/9` : "Aventure"}
          </T>
          {chapter?.chapterName ? <T variant="bodyStrong">{chapter.chapterName}</T> : null}
          <T variant={chapter ? "caption" : "small"} tone={chapter?.status === "ready" && online ? "accent" : "muted"}>
            {chapterLine}
          </T>
        </View>
        <Icon name="chevron" size={18} color={colors.tx3} />
      </Tap>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: space.s3, paddingHorizontal: space.s4, paddingVertical: space.s3, minHeight: TOUCH + space.s4 },
  line: { borderTopWidth: 1, borderTopColor: colors.line },
  text: { flex: 1, minWidth: 0, gap: 2 },
  disc: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg3 },
  thumb: { width: TOUCH, height: TOUCH, borderRadius: radius.r2 },
});
