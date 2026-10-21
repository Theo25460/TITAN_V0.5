import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { ProgressBar } from "../../components/Progress";
import { Tap } from "../../components/Pressable";
import { Screen } from "../../components/Screen";
import { Section } from "../../components/Section";
import { ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Codex, Format, Progress } from "../../core";
import { guardianImages, worldImages } from "../../core/images";
import { useAdventure, useAdventureAction } from "../../data/hooks";
import { errorMessage } from "../../lib/errors";
import { haptic } from "../../lib/haptics";
import { useOnline } from "../../lib/network";
import type { RootParams } from "../../navigation/types";
import { colors, radius, space } from "../../theme/tokens";

export function WorldScreen({ navigation, route }: NativeStackScreenProps<RootParams, "World">) {
  const world = Codex.worlds.find((w) => w.id === route.params.id) ?? Codex.worlds[0];
  const q = useAdventure();
  const action = useAdventureAction();
  const toast = useToast();
  const online = useOnline();
  const [routeChoice, setRouteChoice] = useState("rhythm");
  useEffect(() => navigation.setOptions({ title: world.name }), [navigation, world.name]);
  const s = q.data;
  if (q.isLoading && !s) return <Screen><LoadingCards /></Screen>;
  if (!s) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;

  const c = s.campaigns.find((x) => x.id === world.id);
  const chapter = c?.chapter ?? 0;
  const locked = (c?.tier ?? world.tier) === "plus" && !s.plus;
  const cp = c ? Progress.campaignProgress(c) : null;
  const current = chapter > 0 && chapter < 10 ? world.chapters[chapter - 1] : null;
  const earned = new Set(s.rewards.filter((r) => r.world === world.id).map((r) => r.chapter));

  async function run(kind: "start" | "claim", params: { world: string; route?: string; chapter?: number }) {
    try {
      await action.mutateAsync({ action: kind, params });
      haptic("success");
      toast(kind === "start" ? { kind: "ok", title: "Campagne commencée", message: "Tes prochains jours actifs font avancer le chapitre 1." } : { kind: "ok", title: `Chapitre ${params.chapter} validé`, message: `Insigne « ${world.chapters[(params.chapter ?? 1) - 1]?.title} » ajouté à ta collection.` });
    } catch (e) {
      toast({ kind: "err", title: "Action impossible", message: errorMessage(e) });
    }
  }

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <View style={styles.hero}>
        <Image source={worldImages[world.image]} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={styles.shade} />
        <View style={{ padding: space.s4, gap: 4 }}>
          <T variant="caption" color={world.color}>
            {world.subtitle}
          </T>
          <T variant="h1">{world.name}</T>
        </View>
      </View>
      <T tone="muted">{chapter >= 10 ? world.ending : world.intro}</T>

      {locked ? (
        <Card style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Icon name="lock" color={colors.tx2} />
            <T variant="bodyStrong">Région à venir</T>
          </View>
          <T variant="small">L’accès gratuit à cette région arrive avec la prochaine mise à jour du serveur TITAN. Aucun achat n’est nécessaire : tes acquis sont conservés.</T>
        </Card>
      ) : !chapter ? (
        <Card tone="accent" style={{ gap: space.s3 }}>
          <T variant="eyebrow" tone="accent">
            Nouvelle campagne
          </T>
          <T variant="h3">{world.chapters[0].name}</T>
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
          <Button label="Commencer la campagne" icon="compass" loading={action.isPending} disabled={!online} onPress={() => run("start", { world: world.id, route: routeChoice })} testID="world-start" />
          <T variant="caption" tone="faint">
            Seules les séances enregistrées après le départ comptent, une par jour.
          </T>
        </Card>
      ) : current && cp ? (
        <Card tone={cp.ready ? "accent" : "default"} style={{ gap: space.s3 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.s3 }}>
            {current.boss ? <Image source={guardianImages[world.id]} style={styles.guardian} /> : null}
            <View style={{ flex: 1 }}>
              <T variant="eyebrow" tone="accent">
                Chapitre {chapter}/9{current.boss ? ` · épreuve de ${world.guardian}` : ""}
              </T>
              <T variant="h3">{current.name}</T>
            </View>
          </View>
          <T variant="small" tone="default">
            {current.story}
          </T>
          <T variant="small">{current.practice}</T>
          {cp.objectives.map((o) => (
            <View key={o.id} style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <T variant="caption" tone="muted">
                  {o.label}
                  {o.id === "effort" ? " (90 max/jour)" : ""}
                </T>
                <T variant="caption" tone="default">
                  {Format.number(o.value)} / {Format.number(o.target)}
                </T>
              </View>
              <ProgressBar value={o.ratio} color={world.color} accessibilityLabel={o.label} />
            </View>
          ))}
          {cp.ready ? (
            <Button label={`Valider le chapitre ${chapter}`} icon="check" loading={action.isPending} disabled={!online} onPress={() => run("claim", { world: world.id, chapter })} testID="world-claim" />
          ) : (
            <T variant="caption" tone="faint">
              {c?.route === "journal" ? "Chemin Observation : une séance annotée par jour compte." : "Chemin Régularité : un jour actif compte une fois, quel que soit le sport."} Récompense : insigne « {current.title} ».
            </T>
          )}
        </Card>
      ) : (
        <Card tone="amber" style={{ gap: 6 }}>
          <T variant="h3">Monde terminé</T>
          <T variant="small">{world.guardian} te reconnaît. Les neuf insignes de ce monde sont dans ta collection.</T>
        </Card>
      )}

      <Section title="Chapitres">
        {world.chapters.map((ch) => {
          const done = earned.has(ch.index) || ch.index < chapter;
          const isCurrent = ch.index === chapter;
          return (
            <View key={ch.id} style={[styles.chapter, isCurrent && { borderColor: colors.cyLine }]} accessible accessibilityLabel={`Chapitre ${ch.index}, ${ch.name}${done ? ", validé" : isCurrent ? ", en cours" : ""}`}>
              <View style={[styles.num, done && { backgroundColor: world.color, borderColor: world.color }]}>
                {done ? <Icon name="check" size={16} color={colors.bg} strokeWidth={2.6} /> : <T variant="caption" tone={isCurrent ? "accent" : "faint"}>{ch.index}</T>}
              </View>
              <View style={{ flex: 1 }}>
                <T variant="bodyStrong" tone={done || isCurrent ? "default" : "faint"}>
                  {ch.name}
                  {ch.boss ? " · gardien" : ""}
                </T>
                <T variant="caption" tone="faint">
                  {done ? `Insigne : ${ch.title}` : `${ch.target} jour${ch.target > 1 ? "s" : ""} actif${ch.target > 1 ? "s" : ""}${ch.boss ? " + 150 min d’effort" : ""}`}
                </T>
              </View>
            </View>
          );
        })}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { height: 180, borderRadius: radius.r3, overflow: "hidden", justifyContent: "flex-end", borderWidth: 1, borderColor: colors.line2 },
  shade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(5,7,10,0.45)" },
  route: { flexDirection: "row", alignItems: "center", gap: space.s3, padding: space.s3, borderRadius: radius.r2, borderWidth: 1, borderColor: colors.line2, minHeight: 56 },
  guardian: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: colors.am },
  chapter: { flexDirection: "row", alignItems: "center", gap: space.s3, padding: space.s3, borderRadius: radius.r2, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line },
  num: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.line3, alignItems: "center", justifyContent: "center" },
});
