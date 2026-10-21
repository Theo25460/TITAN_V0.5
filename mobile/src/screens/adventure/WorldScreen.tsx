import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Reveal } from "../../components/Motion";
import { Tap } from "../../components/Pressable";
import { ProgressBar } from "../../components/Progress";
import { RewardReveal, type RevealContent } from "../../components/RewardReveal";
import { Screen } from "../../components/Screen";
import { Shade } from "../../components/Shade";
import { ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { CampaignEncounters, Codex, Format, Progress, type Chapter } from "../../core";
import { guardianImages, worldImages } from "../../core/images";
import { useAdventure, useAdventureAction } from "../../data/hooks";
import { errorMessage } from "../../lib/errors";
import { useOnline } from "../../lib/network";
import type { RootParams } from "../../navigation/types";
import { colors, radius, space } from "../../theme/tokens";

/** One world: where you are on its nine-chapter path, what stands in the way, and what your next real session does. */
export function WorldScreen({ navigation, route }: NativeStackScreenProps<RootParams, "World">) {
  const world = Codex.worlds.find((w) => w.id === route.params.id) ?? Codex.worlds[0];
  const q = useAdventure();
  const action = useAdventureAction();
  const toast = useToast();
  const online = useOnline();
  const [routeChoice, setRouteChoice] = useState("rhythm");
  const [reveal, setReveal] = useState<RevealContent | null>(null);
  useEffect(() => navigation.setOptions({ title: world.name }), [navigation, world.name]);
  const s = q.data;
  const c = s?.campaigns.find((x) => x.id === world.id);
  const cp = useMemo(() => (c ? Progress.campaignProgress(c) : null), [c]);
  const encounter = useMemo(() => (c && cp ? CampaignEncounters.describe(c, cp) : null), [c, cp]);
  if (q.isLoading && !s) return <Screen><LoadingCards /></Screen>;
  if (!s) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;

  const chapter = c?.chapter ?? 0;
  const locked = (c?.tier ?? world.tier) === "plus" && !s.plus;
  const done = chapter >= 10;
  const current = chapter > 0 && chapter < 10 ? world.chapters[chapter - 1] : null;
  const earned = new Set(s.rewards.filter((r) => r.world === world.id).map((r) => r.chapter));
  const badges = earned.size;

  async function start() {
    try {
      await action.mutateAsync({ action: "start", params: { world: world.id, route: routeChoice } });
      toast({ kind: "ok", title: "Campagne commencée", message: "Tes prochains jours actifs font avancer le chapitre 1." });
    } catch (e) {
      toast({ kind: "err", title: "Action impossible", message: errorMessage(e) });
    }
  }

  async function claim(ch: Chapter) {
    try {
      await action.mutateAsync({ action: "claim", params: { world: world.id, chapter: ch.index } });
      const next = world.chapters[ch.index];
      setReveal({
        color: world.color,
        eyebrow: ch.boss ? `${world.guardian} te reconnaît` : `Balise ${ch.index} allumée`,
        title: ch.name,
        insignia: ch.title,
        text: ch.boss ? world.ending : "Ajouté à ta collection. Ce sont tes jours de pratique qui ont rallumé cette balise.",
        next: next ? `chapitre ${next.index}, ${next.name}` : null,
      });
    } catch (e) {
      toast({ kind: "err", title: "Action impossible", message: errorMessage(e) });
    }
  }

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <View style={styles.hero}>
        <Image source={worldImages[world.image]} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <Shade from={0.05} start={0.2} to={0.92} />
        <View style={{ padding: space.s4, gap: 6 }}>
          <T variant="caption" color={world.color}>
            {world.subtitle}
          </T>
          <T variant="h1">{world.name}</T>
          <View style={styles.heroMeta}>
            <View style={styles.pill}>
              <Icon name="medal" size={14} color={world.color} />
              <T variant="caption" tone="default">
                {badges}/9 balises allumées
              </T>
            </View>
            <View style={styles.pill}>
              <Icon name="shield" size={14} color={colors.am} />
              <T variant="caption" tone="default">
                {world.guardian}
              </T>
            </View>
          </View>
          {chapter > 0 ? <ProgressBar value={Math.min(9, badges) / 9} color={world.color} height={4} accessibilityLabel={`Progression dans ${world.name}`} /> : null}
        </View>
      </View>
      <T tone="muted">{done ? world.ending : world.intro}</T>

      {locked ? (
        <Card style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Icon name="lock" color={colors.tx2} />
            <T variant="bodyStrong">Région à venir</T>
          </View>
          <T variant="small">L’accès gratuit à cette région arrive avec la prochaine mise à jour du serveur TITAN. Aucun achat n’est nécessaire : tes acquis sont conservés.</T>
        </Card>
      ) : !chapter ? (
        <Reveal>
          <Card tone="accent" style={{ gap: space.s3 }}>
            <T variant="eyebrow" tone="accent">
              Nouvelle campagne
            </T>
            <T variant="h3">{world.chapters[0].name}</T>
            <T variant="small" tone="default">
              {world.chapters[0].story}
            </T>
            <T variant="caption" tone="muted">
              Ton chemin
            </T>
            {Codex.routes.map((r) => (
              <Tap key={r.id} onPress={() => setRouteChoice(r.id)} accessibilityRole="radio" accessibilityState={{ checked: routeChoice === r.id }} accessibilityLabel={`${r.name} : ${r.description}`} style={[styles.route, routeChoice === r.id && { borderColor: colors.cy, backgroundColor: colors.cySoft }]}>
                <Icon name={routeChoice === r.id ? "check" : r.id === "journal" ? "journal" : "route"} size={20} color={routeChoice === r.id ? colors.cy : colors.tx3} />
                <View style={{ flex: 1 }}>
                  <T variant="bodyStrong">{r.name}</T>
                  <T variant="caption" tone="faint">
                    {r.description}
                    {r.id === "journal" ? " (note de 10 caractères minimum)" : ""}
                  </T>
                </View>
              </Tap>
            ))}
            <Button label="Commencer la campagne" icon="compass" loading={action.isPending} disabled={!online} onPress={start} testID="world-start" />
            <T variant="caption" tone="faint">
              Seules les séances enregistrées après le départ comptent, une par jour.
            </T>
          </Card>
        </Reveal>
      ) : current && cp ? (
        <Reveal>
          <Card tone={cp.ready ? "accent" : "default"} style={[{ gap: space.s4 }, current.boss && styles.bossCard]}>
            <View style={{ gap: 4 }}>
              <T variant="eyebrow" tone={current.boss ? "amber" : "accent"}>
                Chapitre {chapter}/9{current.boss ? " · épreuve du gardien" : ""}
              </T>
              <T variant="h2">{current.name}</T>
              <T variant="small" tone="default" style={styles.story}>
                {current.story}
              </T>
            </View>

            {encounter ? (
              <View style={[styles.encounter, { borderColor: current.boss ? "rgba(244,187,84,0.35)" : colors.line2 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.s3 }}>
                  {current.boss ? (
                    <Image source={guardianImages[world.id]} style={styles.guardian} accessibilityIgnoresInvertColors />
                  ) : (
                    <View style={[styles.obstacleIcon, { borderColor: `${world.color}66` }]}>
                      <Icon name={cp.ready ? "check" : "flag"} size={22} color={world.color} />
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 2 }}>
                    <T variant="caption" tone="faint">
                      {current.boss ? "Gardien" : cp.ready ? "Obstacle franchi" : "Obstacle du chapitre"}
                    </T>
                    <T variant="bodyStrong">{encounter.name}</T>
                  </View>
                </View>
                <T variant="small">{encounter.text}</T>
                {encounter.phases.map((p) => (
                  <View key={p.id} style={{ gap: 6 }}>
                    <View style={styles.between}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                        <Icon name={p.state === "done" ? "check" : p.state === "active" ? "flag" : "clock"} size={14} color={p.state === "done" ? world.color : p.state === "active" ? colors.tx : colors.tx4} />
                        <T variant="small" tone={p.state === "waiting" ? "faint" : "default"} style={{ flex: 1 }}>
                          {p.name}
                        </T>
                      </View>
                      <T variant="bodyStrong" tone={p.complete ? "default" : "muted"}>
                        {Format.number(p.value)}/{Format.number(p.target)}
                      </T>
                    </View>
                    <ProgressBar value={p.target ? p.value / p.target : 0} color={current.boss ? colors.am : world.color} height={6} accessibilityLabel={`${p.name} : ${p.value} sur ${p.target} ${p.unit}`} />
                    <T variant="caption" tone="faint">
                      {p.unit}
                    </T>
                  </View>
                ))}
              </View>
            ) : null}

            {cp.ready ? (
              <Button label={`Allumer la balise du chapitre ${chapter}`} icon="check" loading={action.isPending} disabled={!online} onPress={() => claim(current)} testID="world-claim" />
            ) : (
              <View style={{ gap: space.s3 }}>
                <T variant="small">{current.practice}</T>
                <Button label="Enregistrer une séance" kind="secondary" icon="plus" onPress={() => navigation.navigate("Tabs", { screen: "Record" })} />
                <T variant="caption" tone="faint">
                  {c?.route === "journal" ? "Chemin Observation : une séance annotée par jour compte." : "Chemin Régularité : un jour actif compte une fois, quel que soit le sport."} Effort compté : 90 min au plus par jour.
                </T>
              </View>
            )}
          </Card>
        </Reveal>
      ) : (
        <Card tone="amber" style={{ gap: 6 }}>
          <T variant="h3">Monde terminé</T>
          <T variant="small">{world.guardian} te reconnaît. Les neuf insignes de ce monde sont dans ta collection.</T>
        </Card>
      )}

      <View style={{ gap: space.s2 }}>
        <T variant="eyebrow">Le chemin</T>
        <View>
          {world.chapters.map((ch, i) => {
            const isDone = earned.has(ch.index) || ch.index < chapter;
            const isCurrent = ch.index === chapter && !done;
            const last = i === world.chapters.length - 1;
            return (
              <View key={ch.id} style={styles.step} accessible accessibilityLabel={`Chapitre ${ch.index}, ${ch.name}${isDone ? `, validé, insigne ${ch.title}` : isCurrent ? ", en cours" : ", à venir"}`}>
                <View style={styles.rail}>
                  <View style={[styles.segment, { backgroundColor: i === 0 ? "transparent" : isDone || isCurrent ? world.color : colors.line2 }]} />
                  {ch.boss ? (
                    <View style={[styles.bossNode, { borderColor: isDone ? world.color : isCurrent ? colors.am : colors.line3 }]}>
                      <Image source={guardianImages[world.id]} style={[styles.bossImg, !isDone && !isCurrent && { opacity: 0.35 }]} />
                    </View>
                  ) : (
                    <View style={[styles.node, isDone && { backgroundColor: world.color, borderColor: world.color }, isCurrent && { borderColor: world.color, borderWidth: 3, width: 34, height: 34, borderRadius: 17 }]}>
                      {isDone ? <Icon name="check" size={15} color={colors.bg} strokeWidth={2.8} /> : <T variant="caption" tone={isCurrent ? "default" : "faint"}>{ch.index}</T>}
                    </View>
                  )}
                  <View style={[styles.segment, { backgroundColor: last ? "transparent" : isDone ? world.color : colors.line2 }]} />
                </View>
                <View style={[styles.stepBody, isCurrent && { backgroundColor: colors.bg2, borderColor: `${world.color}55` }]}>
                  <T variant="bodyStrong" tone={isDone || isCurrent ? "default" : "faint"} numberOfLines={1}>
                    {ch.name}
                  </T>
                  <T variant="caption" tone={isDone ? "default" : "faint"} color={isDone ? world.color : undefined} numberOfLines={1}>
                    {isDone ? `Insigne · ${ch.title}` : ch.boss ? `${world.guardian} · ${ch.target} jours actifs + 150 min d’effort` : `${ch.target} jour${ch.target > 1 ? "s" : ""} actif${ch.target > 1 ? "s" : ""}`}
                  </T>
                </View>
              </View>
            );
          })}
        </View>
      </View>
      <RewardReveal content={reveal} onClose={() => setReveal(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { height: 236, borderRadius: radius.r3, overflow: "hidden", justifyContent: "flex-end", borderWidth: 1, borderColor: colors.line2 },
  heroMeta: { flexDirection: "row", gap: space.s2, flexWrap: "wrap" },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: "rgba(5,7,10,0.65)", borderWidth: 1, borderColor: colors.line2 },
  route: { flexDirection: "row", alignItems: "center", gap: space.s3, padding: space.s3, borderRadius: radius.r2, borderWidth: 1, borderColor: colors.line2, minHeight: 56 },
  bossCard: { borderColor: "rgba(244,187,84,0.45)" },
  story: { fontStyle: "italic" },
  encounter: { gap: space.s3, padding: space.s3, borderRadius: radius.r2, borderWidth: 1, backgroundColor: colors.bg1 },
  obstacleIcon: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg2 },
  guardian: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: colors.am },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.s2 },
  step: { flexDirection: "row", alignItems: "stretch", gap: space.s3, minHeight: 64 },
  rail: { width: 44, alignItems: "center" },
  segment: { width: 3, flex: 1, borderRadius: 2 },
  node: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line3, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  bossNode: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, overflow: "hidden", backgroundColor: colors.bg },
  bossImg: { width: "100%", height: "100%" },
  stepBody: { flex: 1, justifyContent: "center", gap: 2, paddingHorizontal: space.s3, paddingVertical: space.s2, marginVertical: 4, borderRadius: radius.r2, borderWidth: 1, borderColor: "transparent" },
});
