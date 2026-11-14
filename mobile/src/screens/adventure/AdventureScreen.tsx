import { useNavigation } from "@react-navigation/native";
import { useMemo, useState } from "react";
import { Image, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CareerMilestones, JourneyPreview } from "../../components/JourneyCard";
import { useOwner } from "../../data/auth";
import { worldAccess } from "../../lib/adventureAccess";
import { AdventureHelp } from "../../components/AdventureHelp";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { RankCrest, rankIdOf } from "../../components/Crest";
import { Icon } from "../../components/Icon";
import { ProgressBar } from "../../components/Progress";
import { Tap } from "../../components/Pressable";
import { Screen } from "../../components/Screen";
import { Shade } from "../../components/Shade";
import { Section } from "../../components/Section";
import { Sheet } from "../../components/Sheet";
import { ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { AdventureRules, Codex, EffortRules, Format, Progress } from "../../core";
import { avatarImages, worldImages } from "../../core/images";
import { useAdventure, useAdventureAction, useLogs, usePrefs } from "../../data/hooks";
import { errorMessage } from "../../lib/errors";
import { useOnline } from "../../lib/network";
import { navigateHref } from "../../navigation/href";
import { colors, radius, space, TOUCH } from "../../theme/tokens";

/** Aventure: ONE chapter in progress first (where I am, what it asks, what it gives, one action), then the four worlds as a compact
    selector, then everything optional (character, steps trails, quests, collection). Everything earned comes from the server snapshot. */
export function AdventureScreen() {
  const insets = useSafeAreaInsets();
  const owner = useOwner();
  const navigation = useNavigation();
  const q = useAdventure();
  const action = useAdventureAction();
  const online = useOnline();
  const toast = useToast();
  const prefs = usePrefs();
  const { active } = useLogs();
  const [pickAvatar, setPickAvatar] = useState(false);
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

  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.bg }}>
      <Screen tab refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        <T variant="h1">Aventure</T>
        {q.isLoading && !s ? (
          <LoadingCards />
        ) : !s ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} title="Aventure indisponible" />
        ) : (
          <>
            {(() => {
              // The chapter to follow: the selected world when it is running, otherwise any running world. Never guessed past the snapshot.
              const running = (c: { chapter: number }) => c.chapter > 0 && c.chapter < 10;
              const c = s.campaigns.find((x) => x.id === s.selected_world && running(x)) ?? s.campaigns.find(running);
              const w = c ? Codex.worlds.find((x) => x.id === c.id) : null;
              if (!c || !w) {
                const first = Codex.worlds.find((x) => worldAccess(s, x.id).state === "open" && !((s.campaigns.find((k) => k.id === x.id)?.chapter ?? 0) >= 10));
                const done = s.campaigns.some((x) => x.chapter >= 10);
                return (
                  <Card tone="accent" style={{ gap: space.s3 }} testID="adventure-main">
                    <T variant="eyebrow" tone="accent">{done ? "Et maintenant" : "Pour commencer"}</T>
                    <T variant="h2">{done ? "Choisis ton prochain monde" : "Choisis ton premier monde"}</T>
                    <T tone="muted">Un monde, c’est une histoire en 9 chapitres. Tes séances, quel que soit le sport, allument ses balises une à une. Rien à acheter, aucune échéance.</T>
                    {first ? <Button label={`Découvrir ${first.name}`} icon="compass" onPress={() => navigation.navigate("World", { id: first.id })} testID="adventure-main-cta" /> : null}
                  </Card>
                );
              }
              const cp = Progress.campaignProgress(c);
              const ch = w.chapters[c.chapter - 1];
              const ready = cp.ready;
              return (
                <Card tone="accent" style={styles.main} testID="adventure-main">
                  <View style={styles.mainImage}>
                    <Image source={worldImages[w.image]} style={styles.worldImg} resizeMode="cover" accessibilityIgnoresInvertColors />
                    <Shade from={0.1} start={0.2} to={0.92} />
                    <T variant="eyebrow" color={w.color} style={styles.mainEyebrow}>
                      {w.name} · chapitre {c.chapter}/9
                    </T>
                  </View>
                  <View style={styles.mainBody}>
                    <T variant="h2">{ch?.name ?? "Chapitre en cours"}</T>
                    {ready ? (
                      <T tone="accent" accessibilityLiveRegion="polite">
                        {online ? "Tout est réuni : la balise de ce chapitre est prête à être allumée." : "Tout est réuni. Il faut une connexion pour allumer la balise."}
                      </T>
                    ) : (
                      <T variant="small" tone="muted">Ce que ce chapitre demande, tous sports confondus :</T>
                    )}
                    {cp.objectives.map((o) => (
                      <View key={o.id} style={{ gap: 6 }}>
                        <View style={styles.between}>
                          <T variant="bodyStrong" style={{ flex: 1 }}>{o.label.charAt(0).toUpperCase() + o.label.slice(1)}</T>
                          <T variant="num">
                            {Format.number(Math.round(o.value))}
                            <T variant="small" tone="faint"> / {Format.number(o.target)}</T>
                          </T>
                        </View>
                        <ProgressBar value={o.ratio} color={w.color} height={6} accessibilityLabel={`${o.label} : ${Math.round(o.value)} sur ${o.target}`} />
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
                      <Icon name="chevron" size={16} color={colors.cy} />
                    </Tap>
                  </View>
                </Card>
              );
            })()}

            <Section title="Les quatre mondes">
              {/* The illustrated worlds are TITAN's signature: a compact 2 × 2 grid keeps their imagery without four full-width panels.
                  Fixed order (no re-sorting), so each world keeps its place; the one in progress is framed in its own colour. */}
              <View style={styles.worlds}>
                {Codex.worlds.map((w) => {
                  const c = s.campaigns.find((x) => x.id === w.id);
                  const unconfirmed = worldAccess(s, w.id).state !== "open";
                  const cp = c ? Progress.campaignProgress(c) : null;
                  const chapter = c?.chapter ?? 0;
                  const current = chapter > 0 && chapter < 10 && w.id === s.selected_world;
                  const status = chapter >= 10 ? "Monde terminé" : chapter ? `Chapitre ${chapter}/9${cp?.ready ? " · balise prête" : ""}` : unconfirmed ? "Disponibilité à confirmer" : "Pas encore commencé";
                  return (
                    <Tap key={w.id} testID={`world-${w.id}`} onPress={() => navigation.navigate("World", { id: w.id })}
                      accessibilityLabel={`${w.name}, ${w.subtitle.toLowerCase()}. ${chapter >= 10 ? "Monde terminé" : chapter ? `Chapitre ${chapter} sur 9${cp?.ready ? ", balise prête à allumer" : ""}${current ? ", monde en cours" : ""}` : unconfirmed ? "Disponibilité à confirmer" : "Pas encore commencé"}. Ouvrir ce monde.`}
                      style={[styles.worldTile, wide && styles.worldTileWide, current && { borderColor: w.color }]}>
                      <Image source={worldImages[w.image]} style={[styles.worldImg, unconfirmed && { opacity: 0.35 }]} resizeMode="cover" accessibilityIgnoresInvertColors />
                      <Shade from={0.05} start={0.25} to={0.96} />
                      {unconfirmed ? <View style={styles.worldLock}><Icon name="lock" size={16} color={colors.tx2} /></View> : null}
                      <View style={styles.worldBody}>
                        <T variant="bodyStrong">{w.name}</T>
                        <T variant="caption" tone={unconfirmed ? "muted" : "default"} color={cp?.ready ? colors.cy2 : undefined}>
                          {status}
                        </T>
                        {chapter > 0 && chapter < 10 ? <ProgressBar value={(chapter - 1 + (cp?.percent ?? 0) / 100) / 9} color={w.color} height={4} track="rgba(238,243,247,0.2)" accessibilityLabel={`Progression dans ${w.name}`} /> : null}
                      </View>
                    </Tap>
                  );
                })}
              </View>
            </Section>

            <AdventureHelp />

            <Section title="Mon personnage">
              <Card style={{ gap: space.s3 }}>
                <View style={{ flexDirection: "row", gap: space.s3, alignItems: "center" }}>
                  <Tap onPress={() => setPickAvatar(true)} accessibilityLabel="Changer de personnage" style={styles.avatarWrap}>
                    <Image source={avatarImages[s.avatar] ?? avatarImages.scout} style={styles.avatar} />
                  </Tap>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <T variant="caption" tone="accent">
                      {Codex.avatars.find((a) => a.id === s.avatar)?.name ?? "Éclaireuse"}
                    </T>
                    <T variant="h3">
                      Niveau {s.level} · {EffortRules.rank(s.level).name}
                    </T>
                    <T variant="caption" tone="muted">
                      {Format.number(s.xp)} / {Format.number(s.next_level_xp)} XP · {Format.number(s.credits)} crédits
                    </T>
                  </View>
                  <RankCrest rank={rankIdOf(s.level)} size={width < 380 ? 48 : 64} />
                </View>
                <ProgressBar value={s.xp / Math.max(1, s.next_level_xp)} accessibilityLabel="Progression vers le niveau suivant" />
                <T variant="caption" tone="faint">
                  L’XP vient uniquement de tes séances réelles : environ 10 XP par minute d’effort modéré, plafonnée à 1 800 par jour.
                </T>
              </Card>
            </Section>

            <JourneyPreview owner={owner} />

            <Section title="Quêtes de la semaine">
              <T variant="small">{quests.why}</T>
              {[quests.main, ...quests.alternatives].map((qq, i) => {
                const count = Math.min(qq.value ?? 0, qq.target ?? 0);
                const progress = qq.target ? count / qq.target : null;
                const done = progress === 1;
                const status = progress == null ? "" : ` · ${count}/${qq.target}`;
                const kind = i === 0 ? "Piste proposée" : "Alternative facultative";
                return (
                  <Card key={qq.id} tone={i === 0 ? "accent" : "flat"} onPress={() => navigateHref(navigation, qq.href)} accessibilityLabel={`${kind} · ${qq.name}${status}`} style={{ gap: 6 }}>
                    <T variant="eyebrow" tone={i === 0 ? "accent" : "faint"}>{kind}{status}</T>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space.s3 }}>
                      <Icon name={done ? "check" : "flag"} size={20} color={done ? colors.cy : colors.tx3} />
                      <View style={{ flex: 1 }}>
                        <T variant="bodyStrong">{qq.name}</T>
                        <T variant="caption" tone="faint">
                          {qq.text}
                        </T>
                      </View>
                    </View>
                    {progress != null ? <ProgressBar value={progress} height={5} accessibilityLabel={qq.name} /> : null}
                  </Card>
                );
              })}
              <T variant="caption" tone="faint">
                Ces pistes restent libres et n’ajoutent ni XP ni crédits.
              </T>
            </Section>

            <Section title="Collection">
              <Card style={{ gap: space.s4 }}>
                <View style={styles.between}>
                  <T variant="bodyStrong">
                    {s.rewards.length} insigne{s.rewards.length > 1 ? "s" : ""} sur {Codex.worlds.length * 9}
                  </T>
                  <Icon name="medal" size={20} color={colors.am} />
                </View>
                {Codex.worlds.map((w) => {
                  const got = new Set(s.rewards.filter((r) => r.world === w.id).map((r) => r.chapter));
                  return (
                    <View key={w.id} style={{ gap: 6 }} accessible accessibilityLabel={`${w.name} : ${got.size} insigne${got.size > 1 ? "s" : ""} sur 9`}>
                      <T variant="caption" tone={got.size ? "default" : "faint"}>
                        {w.name}
                      </T>
                      <View style={styles.medals}>
                        {w.chapters.map((ch) => (
                          <View key={ch.id} style={[styles.medal, got.has(ch.index) ? { backgroundColor: `${w.color}22`, borderColor: w.color } : null, ch.boss && styles.medalBoss]}>
                            {got.has(ch.index) ? <Icon name={ch.boss ? "crown" : "medal"} size={14} color={w.color} /> : <View style={styles.medalDot} />}
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                })}
                {!s.rewards.length ? <T variant="small">Chaque chapitre validé t’offre un insigne et un titre. Le premier ne demande qu’un jour actif.</T> : null}
              </Card>
            </Section>
            <CareerMilestones owner={owner} />
          </>
        )}
      </Screen>
      <Sheet visible={pickAvatar} onClose={() => setPickAvatar(false)} title="Ton personnage">
        {s
          ? Codex.avatars.map((a) => {
              const locked = a.level > s.level;
              const on = s.avatar === a.id;
              return (
                <Tap
                  key={a.id}
                  disabled={locked || on || action.isPending || !online}
                  onPress={async () => {
                    try {
                      await action.mutateAsync({ action: "avatar", params: { avatar: a.id } });
                      setPickAvatar(false);
                      toast({ kind: "ok", title: `${a.name} t’accompagne` });
                    } catch (e) {
                      toast({ kind: "err", title: "Changement impossible", message: errorMessage(e) });
                    }
                  }}
                  accessibilityLabel={`${a.name}${locked ? `, débloqué au niveau ${a.level}` : on ? ", sélectionné" : ""}`}
                  style={[styles.avatarRow, on && { borderColor: colors.cy }]}
                >
                  <Image source={avatarImages[a.id]} style={[styles.avatarSmall, locked && { opacity: 0.35 }]} />
                  <View style={{ flex: 1 }}>
                    <T variant="bodyStrong">{a.name}</T>
                    <T variant="caption" tone="faint">
                      {locked ? `Niveau ${a.level} requis` : a.role}
                    </T>
                  </View>
                  {on ? <Icon name="check" color={colors.cy} /> : locked ? <Icon name="lock" size={18} color={colors.tx4} /> : null}
                </Tap>
              );
            })
          : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarWrap: { borderRadius: 40 },
  avatar: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: colors.cy },
  main: { padding: 0 },
  mainImage: { height: 104, justifyContent: "flex-end" },
  mainEyebrow: { paddingHorizontal: space.s4, paddingBottom: space.s2 },
  mainBody: { padding: space.s4, paddingTop: space.s3, gap: space.s3 },
  mainLink: { minHeight: TOUCH, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  worldImg: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
  worlds: { flexDirection: "row", flexWrap: "wrap", gap: space.s3 },
  worldTile: { flexBasis: "45%", flexGrow: 1, minHeight: 136, borderRadius: radius.r3, overflow: "hidden", borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.bg1, justifyContent: "flex-end" },
  worldTileWide: { flexBasis: "100%", minHeight: 112 },
  worldBody: { padding: space.s3, gap: 4 },
  worldLock: { position: "absolute", top: space.s2, right: space.s2, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.scrim },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  medals: { flexDirection: "row", gap: 6 },
  medal: { flex: 1, aspectRatio: 1, maxWidth: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.line2, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg1 },
  medalBoss: { borderStyle: "dashed" },
  medalDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.line3 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: space.s3, padding: space.s3, borderRadius: radius.r2, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg1 },
  avatarSmall: { width: 52, height: 52, borderRadius: 26 },
});
