import { useNavigation } from "@react-navigation/native";
import { useMemo } from "react";
import { Image, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { JourneyPreview } from "../../components/JourneyCard";
import { useOwner } from "../../data/auth";
import { useLiveFlag } from "../../data/live";
import { worldAccess } from "../../lib/adventureAccess";
import { AdventureHelp } from "../../components/AdventureHelp";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { ProgressBar } from "../../components/Progress";
import { Tap } from "../../components/Pressable";
import { Screen } from "../../components/Screen";
import { Shade } from "../../components/Shade";
import { Section } from "../../components/Section";
import { ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { AdventureRules, Codex, Format, Progress } from "../../core";
import { heroImage, worldImages } from "../../core/images";
import { useAdventure, useLogs, usePrefs } from "../../data/hooks";
import { useOnline } from "../../lib/network";
import { navigateHref } from "../../navigation/href";
import { colors, radius, space, TOUCH } from "../../theme/tokens";

/** Aventure: « where am I in my world ». The world being walked through is the header; then ONE chapter (what it asks, what it
    gives, one action), the four worlds, and what is optional (trails, quests, collection). The character lives in Profil and the
    figures in Progrès: neither is repeated here. Everything earned comes from the server snapshot. */
export function AdventureScreen() {
  const insets = useSafeAreaInsets();
  const owner = useOwner();
  const navigation = useNavigation();
  const q = useAdventure();
  const online = useOnline();
  const prefs = usePrefs();
  const { active } = useLogs();
  const liveEnabled = useLiveFlag();
  // The crest only appears where the text keeps its room: on a narrow phone it squeezed the name and broke words in the middle.
  const { width, fontScale } = useWindowDimensions();
  // One world per row when two columns would squeeze the names (narrow phone, large text).
  const wide = width < 340 || fontScale > 1.3;
  const s = q.data;
  const quests = useMemo(() => {
    const now = new Date();
    const cadence = Progress.cadence(active, { target: prefs.weeklyGoalSessions, pauses: prefs.cadencePauses, now });
    return AdventureRules.weeklyQuestPaths(active, prefs.weeklyGoalSessions, now, { favoriteSports: prefs.favoriteSports, cadencePaused: cadence.currentPaused });
  }, [active, prefs.weeklyGoalSessions, prefs.favoriteSports, prefs.cadencePauses]);

  // The chapter to follow: the selected world when it is running, otherwise any running world. Never guessed past the snapshot.
  const running = (c: { chapter: number }) => c.chapter > 0 && c.chapter < 10;
  const c = s ? s.campaigns.find((x) => x.id === s.selected_world && running(x)) ?? s.campaigns.find(running) : undefined;
  const w = c ? Codex.worlds.find((x) => x.id === c.id) ?? null : null;
  const cp = c && w ? Progress.campaignProgress(c) : null;
  const ch = c && w ? w.chapters[c.chapter - 1] : undefined;
  const ready = !!cp?.ready;
  const first = s && !(c && w) ? Codex.worlds.find((x) => worldAccess(s, x.id).state === "open" && !((s.campaigns.find((k) => k.id === x.id)?.chapter ?? 0) >= 10)) : undefined;
  const done = !!s?.campaigns.some((x) => x.chapter >= 10);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen tab padded={false} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        {/* The world being walked through is the page's header: the painting runs edge to edge and dissolves into the ground. */}
        <View testID="adventure-main">
        <View style={[styles.hero, { paddingTop: insets.top + space.s3 }]} testID="adventure-hero">
          <Image source={w ? worldImages[w.image] : heroImage} style={styles.heroArt} resizeMode="cover" accessibilityIgnoresInvertColors />
          <Shade from={0.2} start={0.3} to={1} />
          <T variant="h3" accessibilityRole="header">Aventure</T>
          <View style={{ gap: space.s1 }}>
            {c && w ? (
              <>
                <T variant="title" color={w.color}>{w.name} · chapitre {c.chapter}/9</T>
                <T variant="display">{ch?.name ?? "Chapitre en cours"}</T>
              </>
            ) : s ? (
              <T variant="display">{done ? "Choisis ton prochain monde" : "Choisis ton premier monde"}</T>
            ) : null}
          </View>
        </View>

        {s ? (
          <View style={styles.main}>
            {!(c && w && cp) ? (
              <>
                <T tone="muted">Un monde, c’est une histoire en 9 chapitres. Tes séances, quel que soit le sport, allument ses balises une à une. Rien à acheter, aucune échéance.</T>
                {first ? <Button label={`Découvrir ${first.name}`} icon="compass" onPress={() => navigation.navigate("World", { id: first.id })} testID="adventure-main-cta" /> : null}
              </>
            ) : (
              <>
                {ready ? (
                  <T variant="title" tone="accent" accessibilityLiveRegion="polite">
                    {online ? "Tout est réuni : la balise de ce chapitre est prête à être allumée." : "Tout est réuni. Il faut une connexion pour allumer la balise."}
                  </T>
                ) : (
                  <T variant="small" tone="muted">Ce que ce chapitre demande, tous sports confondus :</T>
                )}
                {cp.objectives.map((o) => (
                  <View key={o.id} style={{ gap: 6 }}>
                    <View style={styles.between}>
                      <T variant="bodyStrong" style={{ flex: 1 }}>{o.label.charAt(0).toUpperCase() + o.label.slice(1)}</T>
                      <T variant="numLarge" color={o.ratio >= 1 ? colors.mousse : colors.tx}>
                        {Format.number(Math.round(o.value))}
                        <T variant="num" tone="faint"> /{Format.number(o.target)}</T>
                      </T>
                    </View>
                    <ProgressBar value={o.ratio} color={w.color} height={4} accessibilityLabel={`${o.label} : ${Math.round(o.value)} sur ${o.target}`} />
                  </View>
                ))}
                <T variant="caption" tone="muted">
                  {ch?.boss ? "À la clé : l’insigne du gardien et la fin de ce monde." : `À la clé : un insigne et le titre « ${ch?.title ?? "du chapitre"} ».`} L’XP et les crédits viennent de tes séances, pas de la balise.
                </T>
                <Button
                  label={ready ? "Allumer la balise" : "Enregistrer une séance"}
                  icon={ready ? "check" : "plus"}
                  onPress={() => (ready ? navigation.navigate("World", { id: w.id }) : navigation.navigate("Tabs", { screen: "Record" }))}
                  testID="adventure-main-cta"
                />
                <Tap onPress={() => navigation.navigate("World", { id: w.id })} accessibilityLabel={`Voir le chemin de ${w.name}`} style={styles.mainLink}>
                  <T variant="small" tone="accent">Voir le chemin et l’histoire de ce monde</T>
                  <Icon name="chevron" size={16} color={colors.mousse} />
                </Tap>
              </>
            )}
          </View>
        ) : null}
        </View>

        <View style={styles.body}>
        {q.isLoading && !s ? (
          <LoadingCards />
        ) : !s ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} title="Aventure indisponible" />
        ) : (
          <>
            {liveEnabled ? (
              <Card tone="ruled" onPress={() => navigation.navigate("Camp")} accessibilityLabel="Le Camp de base : bâtiments, Marches et Cordée" testID="camp-entry">
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.s3 }}>
                  <Icon name="home" size={22} color={colors.mousse} />
                  <View style={{ flex: 1 }}>
                    <T variant="title">Le Camp de base</T>
                    <T variant="small">Bâtiments, Marches et chroniques nourris par tes séances live</T>
                  </View>
                  <Icon name="chevron" color={colors.tx3} />
                </View>
              </Card>
            ) : null}

            <Section title="Les quatre mondes">
              {/* The painted worlds are TITAN's imagery: a 2 × 2 grid keeps them in view. Fixed order, so each world keeps its place;
                  the one in progress is underlined in its own colour. */}
              <View style={styles.worlds}>
                {Codex.worlds.map((world) => {
                  const camp = s.campaigns.find((x) => x.id === world.id);
                  const unconfirmed = worldAccess(s, world.id).state !== "open";
                  const progress = camp ? Progress.campaignProgress(camp) : null;
                  const chapter = camp?.chapter ?? 0;
                  const current = chapter > 0 && chapter < 10 && world.id === s.selected_world;
                  const status = chapter >= 10 ? "Monde terminé" : chapter ? `Chapitre ${chapter}/9${progress?.ready ? " · balise prête" : ""}` : unconfirmed ? "Disponibilité à confirmer" : "Pas encore commencé";
                  return (
                    <Tap key={world.id} testID={`world-${world.id}`} onPress={() => navigation.navigate("World", { id: world.id })}
                      accessibilityLabel={`${world.name}, ${world.subtitle.toLowerCase()}. ${chapter >= 10 ? "Monde terminé" : chapter ? `Chapitre ${chapter} sur 9${progress?.ready ? ", balise prête à allumer" : ""}${current ? ", monde en cours" : ""}` : unconfirmed ? "Disponibilité à confirmer" : "Pas encore commencé"}.`}
                      style={[styles.worldTile, wide && styles.worldTileWide]}>
                      <Image source={worldImages[world.image]} style={[styles.worldImg, unconfirmed && { opacity: 0.35 }]} resizeMode="cover" accessibilityIgnoresInvertColors />
                      {unconfirmed ? <View style={styles.worldLock}><Icon name="lock" size={16} color={colors.tx2} /></View> : null}
                      <View style={styles.worldBody}>
                        {/* The scrim follows the text, not the tile: a dark plate with a soft upper edge under the name and its
                            status, however many lines they take; the painting stays clear above it. */}
                        <View style={styles.worldScrim} pointerEvents="none"><Shade from={0} start={0} end={0.38} to={0.84} /></View>
                        <T variant="title">{world.name}</T>
                        <T variant="caption" tone={unconfirmed ? "muted" : "default"} color={progress?.ready ? colors.mousse : undefined}>
                          {status}
                        </T>
                        {chapter > 0 && chapter < 10 ? <ProgressBar value={(chapter - 1 + (progress?.percent ?? 0) / 100) / 9} color={world.color} height={3} track="rgba(238,243,247,0.2)" accessibilityLabel={`Progression dans ${world.name}`} /> : null}
                      </View>
                      {current ? <View style={[styles.worldCurrent, { backgroundColor: world.color }]} /> : null}
                    </Tap>
                  );
                })}
              </View>
            </Section>

            <AdventureHelp />
            <JourneyPreview owner={owner} />

            <Section title="Quêtes de la semaine">
              <T variant="small">{quests.why}</T>
              <View>
                {[quests.main, ...quests.alternatives].map((qq, i) => {
                  const count = Math.min(qq.value ?? 0, qq.target ?? 0);
                  const progress = qq.target ? count / qq.target : null;
                  const finished = progress === 1;
                  const status = progress == null ? "" : ` · ${count}/${qq.target}`;
                  const kind = i === 0 ? "Piste proposée" : "Alternative facultative";
                  return (
                    <Tap key={qq.id} onPress={() => navigateHref(navigation, qq.href)} accessibilityLabel={`${kind} · ${qq.name}${status}`} style={styles.quest}>
                      <Icon name={finished ? "check" : "flag"} size={20} color={finished ? colors.mousse : i === 0 ? colors.tx : colors.tx3} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <T variant="caption" tone={i === 0 ? "accent" : "faint"}>{kind}</T>
                        <T variant="title">{qq.name}</T>
                        <T variant="caption" tone="faint">{qq.text}</T>
                      </View>
                      {progress != null ? <T variant="num" color={finished ? colors.mousse : colors.tx}>{count}<T variant="small" tone="faint">/{qq.target}</T></T> : null}
                    </Tap>
                  );
                })}
              </View>
              <T variant="caption" tone="faint">
                Ces pistes restent libres et n’ajoutent ni XP ni crédits.
              </T>
            </Section>

            <Section title="Collection">
              <View style={{ gap: space.s4 }}>
                <View style={styles.between}>
                  <T variant="bodyStrong">
                    {s.rewards.length} insigne{s.rewards.length > 1 ? "s" : ""} sur {Codex.worlds.length * 9}
                  </T>
                  <Icon name="medal" size={20} color={colors.am} />
                </View>
                {Codex.worlds.map((world) => {
                  const got = new Set(s.rewards.filter((r) => r.world === world.id).map((r) => r.chapter));
                  return (
                    <View key={world.id} style={{ gap: 6 }} accessible accessibilityLabel={`${world.name} : ${got.size} insigne${got.size > 1 ? "s" : ""} sur 9`}>
                      <T variant="caption" tone={got.size ? "default" : "faint"}>
                        {world.name}
                      </T>
                      <View style={styles.medals}>
                        {world.chapters.map((chapter) => (
                          <View key={chapter.id} style={[styles.medal, got.has(chapter.index) ? { backgroundColor: world.color, borderColor: world.color } : null, chapter.boss && styles.medalBoss]}>
                            {got.has(chapter.index) ? <Icon name={chapter.boss ? "crown" : "medal"} size={14} color={colors.bg} /> : <View style={styles.medalDot} />}
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                })}
                {!s.rewards.length ? <T variant="small">Chaque chapitre validé t’offre un insigne et un titre. Le premier ne demande qu’un jour actif.</T> : null}
              </View>
            </Section>
          </>
        )}
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: 320, paddingHorizontal: space.s5, paddingBottom: space.s2, justifyContent: "space-between", backgroundColor: colors.bg },
  heroArt: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, width: "100%", height: "100%" },
  main: { paddingHorizontal: space.s5, paddingTop: space.s3, gap: space.s4 },
  body: { paddingHorizontal: space.s5, paddingTop: space.s5, gap: space.s5 },
  mainLink: { minHeight: TOUCH, flexDirection: "row", alignItems: "center", gap: 4 },
  worldImg: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
  worlds: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
  worldTile: { flexBasis: "45%", flexGrow: 1, minHeight: 148, borderRadius: radius.r1, overflow: "hidden", backgroundColor: colors.bg1, justifyContent: "flex-end" },
  worldTileWide: { flexBasis: "100%", minHeight: 112 },
  worldBody: { padding: space.s3, gap: 4 },
  worldScrim: { position: "absolute", left: 0, right: 0, bottom: 0, top: -36 },
  worldCurrent: { height: 4 },
  worldLock: { position: "absolute", top: space.s2, right: space.s2, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.scrim },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  quest: { flexDirection: "row", alignItems: "center", gap: space.s3, minHeight: TOUCH + space.s5, paddingVertical: space.s3, borderBottomWidth: 1, borderBottomColor: colors.line },
  medals: { flexDirection: "row", gap: 6 },
  medal: { flex: 1, aspectRatio: 1, maxWidth: 34, borderRadius: 3, borderWidth: 1, borderColor: colors.line2, alignItems: "center", justifyContent: "center" },
  medalBoss: { borderStyle: "dashed" },
  medalDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.line3 },
});
