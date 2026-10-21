import { useNavigation } from "@react-navigation/native";
import { useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { ProgressBar } from "../../components/Progress";
import { Tap } from "../../components/Pressable";
import { Screen } from "../../components/Screen";
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
import { colors, radius, space } from "../../theme/tokens";

/** Aventure: the character, the four worlds and the weekly quests. Everything that is earned comes from the server snapshot. */
export function AdventureScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const q = useAdventure();
  const action = useAdventureAction();
  const online = useOnline();
  const toast = useToast();
  const prefs = usePrefs();
  const { active } = useLogs();
  const [pickAvatar, setPickAvatar] = useState(false);
  const s = q.data;
  const quests = useMemo(() => AdventureRules.weeklyQuests(active, prefs.weeklyGoalSessions), [active, prefs.weeklyGoalSessions]);

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
            <Card tone="accent" style={{ gap: space.s3 }}>
              <View style={{ flexDirection: "row", gap: space.s4, alignItems: "center" }}>
                <Tap onPress={() => setPickAvatar(true)} accessibilityLabel="Changer de personnage" style={styles.avatarWrap}>
                  <Image source={avatarImages[s.avatar] ?? avatarImages.scout} style={styles.avatar} />
                </Tap>
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="eyebrow" tone="accent">
                    {Codex.avatars.find((a) => a.id === s.avatar)?.name ?? "Éclaireuse"}
                  </T>
                  <T variant="h2">
                    Niveau {s.level} · {EffortRules.rank(s.level).name}
                  </T>
                  <T variant="caption" tone="muted">
                    {Format.number(s.xp)} / {Format.number(s.next_level_xp)} XP · {Format.number(s.credits)} crédits
                  </T>
                </View>
              </View>
              <ProgressBar value={s.xp / Math.max(1, s.next_level_xp)} accessibilityLabel="Progression vers le niveau suivant" />
              <T variant="caption" tone="faint">
                L’XP vient uniquement de tes séances réelles : environ 10 XP par minute d’effort modéré, plafonnée à 1 800 par jour.
              </T>
            </Card>

            <Section title="Mondes">
              {Codex.worlds.map((w) => {
                const c = s.campaigns.find((x) => x.id === w.id);
                const tier = c?.tier ?? w.tier;
                const locked = tier === "plus" && !s.plus;
                const cp = c ? Progress.campaignProgress(c) : null;
                const chapter = c?.chapter ?? 0;
                return (
                  <Tap key={w.id} testID={`world-${w.id}`} onPress={() => navigation.navigate("World", { id: w.id })} accessibilityLabel={`${w.name}. ${chapter >= 10 ? "Terminé" : chapter ? `Chapitre ${chapter} sur 9` : "Pas commencé"}${locked ? ", accès à venir" : ""}`} style={styles.worldTap}>
                    <Image source={worldImages[w.image]} style={styles.worldImg} resizeMode="cover" />
                    <View style={styles.worldShade} />
                    <View style={styles.worldBody}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View style={[styles.dot, { backgroundColor: w.color }]} />
                        <T variant="caption" color={w.color}>
                          {w.subtitle}
                        </T>
                        {locked ? <Icon name="lock" size={14} color={colors.tx2} /> : null}
                      </View>
                      <T variant="h3">{w.name}</T>
                      <T variant="caption" tone="muted">
                        {chapter >= 10 ? "Monde terminé · gardien vaincu" : chapter ? `Chapitre ${chapter}/9 · ${w.chapters[chapter - 1]?.name ?? ""}${cp?.ready ? " · prêt à valider" : ""}` : locked ? "Accès gratuit à l’arrivée de la prochaine mise à jour serveur" : "Pas encore commencé"}
                      </T>
                      {chapter > 0 && chapter < 10 ? <ProgressBar value={(chapter - 1 + (cp?.percent ?? 0) / 100) / 9} color={w.color} height={5} accessibilityLabel={`Progression dans ${w.name}`} /> : null}
                    </View>
                  </Tap>
                );
              })}
            </Section>

            <Section title="Quêtes de la semaine">
              {quests.map((qq) => {
                const done = qq.value >= qq.target;
                return (
                  <Card key={qq.id} tone={done ? "accent" : "flat"} onPress={() => navigateHref(navigation, qq.href)} accessibilityLabel={`${qq.name} : ${qq.value} sur ${qq.target}`} style={{ gap: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space.s3 }}>
                      <Icon name={done ? "check" : "flag"} size={20} color={done ? colors.cy : colors.tx3} />
                      <View style={{ flex: 1 }}>
                        <T variant="bodyStrong">{qq.name}</T>
                        <T variant="caption" tone="faint">
                          {qq.text}
                        </T>
                      </View>
                      <T variant="num" tone={done ? "accent" : "default"}>
                        {Math.min(qq.value, qq.target)}/{qq.target}
                      </T>
                    </View>
                    <ProgressBar value={qq.value / qq.target} height={5} accessibilityLabel={qq.name} />
                  </Card>
                );
              })}
              <T variant="caption" tone="faint">
                Des repères pour une semaine équilibrée, adaptés à ta cadence. Ils ne demandent jamais un sport précis.
              </T>
            </Section>

            <Section title="Collection">
              <Card style={{ gap: 6 }}>
                <T variant="bodyStrong">
                  {s.rewards.length} insigne{s.rewards.length > 1 ? "s" : ""} de chapitre
                </T>
                <View style={styles.badges}>
                  {s.rewards.slice(0, 18).map((r) => {
                    const w = Codex.worlds.find((x) => x.id === r.world);
                    return (
                      <View key={`${r.world}-${r.chapter}`} style={[styles.badge, { borderColor: w?.color ?? colors.cy }]} accessible accessibilityLabel={`${w?.chapters[r.chapter - 1]?.title ?? "Insigne"}, ${w?.name ?? ""}`}>
                        <T variant="caption" color={w?.color}>
                          {r.chapter}
                        </T>
                      </View>
                    );
                  })}
                </View>
                {!s.rewards.length ? <T variant="small">Chaque chapitre validé t’offre un insigne et un titre.</T> : null}
              </Card>
            </Section>
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
  avatar: { width: 76, height: 76, borderRadius: 38, borderWidth: 2, borderColor: colors.cy },
  worldTap: { height: 156, borderRadius: radius.r3, overflow: "hidden", borderWidth: 1, borderColor: colors.line2 },
  worldImg: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
  worldShade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(5,7,10,0.55)" },
  worldBody: { flex: 1, justifyContent: "flex-end", padding: space.s4, gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  badge: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg1 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: space.s3, padding: space.s3, borderRadius: radius.r2, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg1 },
  avatarSmall: { width: 52, height: 52, borderRadius: 26 },
});
