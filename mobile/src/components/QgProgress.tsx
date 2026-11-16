import { Image, StyleSheet, View } from "react-native";
import { Format } from "../core";
import type { ProgramWeek } from "../core/program";
import { colors, radius, space, TOUCH } from "../theme/tokens";
import { Icon } from "./Icon";
import { Tap } from "./Pressable";
import { ProgramGrid } from "./ProgramGrid";
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

/** « Where am I »: the week, read as three figures and the programme of its days (confirmed sessions only), then the chapter in
    progress with what it still asks. Set on the ground, under a rule: the figures are the block, they need no box. */
export function QgProgress({ cadence, sessions, weekXp, weekMinutes, showWeek, chapter, online, grid, previous, onWeek, onChapter }: {
  cadence: Cadence;
  sessions: number;
  /** XP of this week's confirmed sessions (the journal's own figures), never an estimate. */
  weekXp: number;
  weekMinutes?: number;
  /** False for an account without any session yet: an empty week is not a figure. */
  showWeek: boolean;
  chapter: QgChapter | null;
  online: boolean;
  grid?: ProgramWeek | null;
  /** Last week, drawn under an empty current week (a Monday morning): the figure never starts blank for someone who trains. */
  previous?: ProgramWeek | null;
  onWeek: () => void;
  onChapter: () => void;
}) {
  const reached = !cadence.currentPaused && cadence.target > 0 && cadence.currentDays >= cadence.target;
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
    <View style={{ gap: space.s4 }} testID="qg-progress">
      {showWeek ? (
        <Tap onPress={onWeek} testID="week-tile" style={styles.week} accessibilityLabel={`Ma semaine : ${weekLine}, ${sessionsText}${weekXp > 0 ? `, ${Format.number(weekXp)} XP confirmés` : ""}. Ouvrir Progrès.`}>
          <View style={styles.head}>
            <T variant="h3" style={{ flex: 1 }}>Ma semaine</T>
            <Icon name="chevron" size={18} color={colors.tx3} />
          </View>
          <View style={styles.figures}>
            <View style={styles.figure}>
              <T variant="figure" color={reached ? colors.ok : colors.tx}>
                {cadence.currentDays}
                {cadence.currentPaused ? null : <T variant="num" tone="faint"> /{cadence.target}</T>}
              </T>
              <T variant="caption" tone="muted">{cadence.currentPaused ? "jours actifs · en pause" : reached ? "jours actifs · semaine tenue" : "jours actifs"}</T>
            </View>
            <View style={styles.figure}>
              <T variant="figure">{sessions}</T>
              <T variant="caption" tone="muted">{sessions > 1 ? "séances" : "séance"}{weekMinutes ? ` · ${Format.duration(weekMinutes)}` : ""}</T>
            </View>
            {weekXp > 0 ? (
              <View style={styles.figure}>
                <T variant="figure" color={colors.cy} numberOfLines={1} adjustsFontSizeToFit>+{Format.number(weekXp)}</T>
                <T variant="caption" tone="muted">XP confirmés</T>
              </View>
            ) : null}
          </View>
          {grid ? <ProgramGrid grid={grid} testID="qg-program" /> : null}
          {grid && previous && grid.totals.sessions === 0 && previous.totals.sessions > 0 ? (
            <View style={styles.previous}>
              <T variant="caption" tone="faint">La semaine dernière</T>
              <ProgramGrid grid={previous} testID="qg-program-previous" />
            </View>
          ) : null}
        </Tap>
      ) : null}
      <Tap onPress={onChapter} testID="qg-chapter" style={[styles.chapter, showWeek && styles.line]} accessibilityLabel={chapter ? `${chapter.worldName}, chapitre ${chapter.chapter} sur 9${chapter.chapterName ? `, ${chapter.chapterName}` : ""}. ${chapterLine} Ouvrir le monde.` : `Aventure. ${chapterLine}`}>
        {chapter ? <Image source={chapter.image} style={styles.thumb} accessibilityIgnoresInvertColors /> : <View style={styles.disc}><Icon name="compass" size={24} color={colors.mousse} /></View>}
        <View style={styles.text}>
          <T variant="caption" color={chapter?.color ?? colors.tx3}>
            {chapter ? `${chapter.worldName} · chapitre ${chapter.chapter}/9` : "Aventure"}
          </T>
          {chapter?.chapterName ? <T variant="title">{chapter.chapterName}</T> : null}
          <T variant={chapter ? "caption" : "small"} color={chapter?.status === "ready" && online ? colors.mousse : colors.tx2}>
            {chapterLine}
          </T>
        </View>
        <Icon name="chevron" size={18} color={colors.tx3} />
      </Tap>
    </View>
  );
}

const styles = StyleSheet.create({
  week: { gap: space.s3, borderTopWidth: 2, borderTopColor: colors.tx, paddingTop: space.s2 },
  head: { flexDirection: "row", alignItems: "center", minHeight: 36 },
  figures: { flexDirection: "row", gap: space.s5, alignItems: "flex-end", paddingBottom: space.s2 },
  figure: { flexShrink: 1, minWidth: 0, gap: 2 },
  previous: { gap: space.s1, paddingTop: space.s3, borderTopWidth: 1, borderTopColor: colors.line, opacity: 0.72 },
  chapter: { flexDirection: "row", alignItems: "center", gap: space.s4, minHeight: TOUCH + space.s5, paddingVertical: space.s2 },
  line: { borderTopWidth: 1, borderTopColor: colors.line2, paddingTop: space.s4 },
  text: { flex: 1, minWidth: 0, gap: 3 },
  disc: { width: 64, height: 64, borderRadius: radius.r1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg2 },
  thumb: { width: 64, height: 64, borderRadius: radius.r1 },
});
