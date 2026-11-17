/* Le Camp de base: the persistent world fed by live sessions. Buildings rise with the essence of their family (or with
   universal éclats, so a specialist is never blocked), the Marches reveal one region per Voie, the Cordée tells the story.
   Everything shown comes from the server (titan_live_world_v1); nothing here gives XP or credits. */
import { View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ProgressBar } from "../../components/Progress";
import { Screen } from "../../components/Screen";
import { Section } from "../../components/Section";
import { ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { LiveVoies, LiveWorld } from "../../core/live";
import { useEffect } from "react";
import { useOwner } from "../../data/auth";
import { flushSettlements, useLiveBuild, useLiveWorld } from "../../data/live";
import { errorMessage } from "../../lib/errors";
import { colors, familyColors, radius, space } from "../../theme/tokens";

export function CampScreen() {
  const owner = useOwner();
  const world = useLiveWorld();
  // Sessions that were saved offline or held settle as soon as the camp opens.
  useEffect(() => { void flushSettlements(owner).then((r) => { if (r.some((x) => x.status === "settled")) void world.refetch(); }); }, [owner]); // eslint-disable-line react-hooks/exhaustive-deps
  const build = useLiveBuild();
  const toast = useToast();
  if (world.isLoading) return <Screen><LoadingCards /></Screen>;
  if (world.error || !world.data) return <Screen><ErrorState error={world.error} onRetry={() => void world.refetch()} /></Screen>;
  const w = world.data;
  const cordee = LiveWorld.cordee({ days: w.days, voies: w.distinctVoies });
  const horizon = LiveWorld.horizon(w);
  const raise = (id: string) => build.mutate(id, {
    onSuccess: () => toast({ kind: "ok", title: "Le camp s’agrandit", message: LiveWorld.BUILDINGS[id].name }),
    onError: (e) => toast({ kind: "err", title: "Construction impossible", message: /LIVE_NOT_ENOUGH/.test(String((e as Error).message)) ? "Il manque encore des ressources : chaque séance live en rapporte." : errorMessage(e) }),
  });
  return (
    <Screen onRefresh={() => void world.refetch()} refreshing={world.isRefetching}>
      <View style={{ gap: 4 }}>
        <T variant="eyebrow" tone="accent">Le Camp de base</T>
        <T variant="h1">{cordee.unlocked ? cordee.chapters[cordee.chapters.length - 1].title : "Le camp sous la neige"}</T>
        <T tone="muted">Tes séances live retressent la Cordée. Rien ici ne s’achète et rien ne se perd.</T>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2 }}>
        <Resource label="Éclats" value={w.wallet.eclats} color={colors.cy} />
        {Object.values(LiveVoies.ESSENCES).map((e) => <Resource key={e.id} label={e.label} value={w.wallet.essences[e.id] ?? 0} color={familyColors[e.family as keyof typeof familyColors] ?? colors.tx2} />)}
      </View>
      {/* A direction to walk in, nearest first: never a deadline, never a loss. */}
      <Section title="Ce qui vient">
        <View style={{ gap: space.s2 }} testID="camp-horizon">
          {horizon.map((h) => (
            <View key={`${h.kind}:${h.id}`} style={{ padding: space.s3, borderRadius: radius.r2, backgroundColor: colors.bg2, gap: 2, borderLeftWidth: 3, borderLeftColor: h.ready ? colors.cy : colors.bg2 }}>
              <T variant="bodyStrong">{h.title}</T>
              <T variant="small" tone={h.ready ? "default" : "muted"}>{h.text}</T>
            </View>
          ))}
        </View>
        <T variant="small" tone="muted">Rien n’expire : ces repères avancent quand tu reviens, à ton rythme.</T>
      </Section>
      <Section title="Bâtiments">
        <View style={{ gap: space.s2 }}>
          {Object.values(LiveWorld.BUILDINGS).map((b) => {
            const level = w.buildings[b.id] ?? 0;
            const plan = LiveWorld.buildPlan(b.id, level, w.wallet);
            return (
              <Card key={b.id}>
                {/* Reserved slot for the building illustration (docs/live/ASSETS.md · camp/<id>-<level>.webp). */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                  <T variant="bodyStrong">{b.name}</T>
                  <T variant="caption" tone="muted">{LiveWorld.LEVEL_NAMES[level]}</T>
                </View>
                <T variant="small" tone="muted">{b.text}</T>
                <ProgressBar value={level / LiveWorld.MAX_LEVEL} height={6} />
                {plan ? (
                  <Button small kind={plan.affordable ? "primary" : "secondary"} disabled={!plan.affordable || build.isPending} loading={build.isPending && build.variables === b.id}
                    label={`Rebâtir · ${plan.useEssence ? `${plan.useEssence} ${LiveVoies.ESSENCES[plan.essence ?? ""]?.label ?? ""}` : ""}${plan.useEssence && plan.useEclats ? " + " : ""}${plan.useEclats ? `${plan.useEclats} éclats` : ""}`}
                    onPress={() => raise(b.id)} />
                ) : <T variant="caption" tone="accent">Niveau maximal</T>}
              </Card>
            );
          })}
        </View>
      </Section>
      <Section title={`La Cordée · ${cordee.unlocked} / ${cordee.of}`}>
        {cordee.chapters.length ? cordee.chapters.slice().reverse().map((c) => (
          <View key={c.index} style={{ gap: 2, paddingVertical: space.s2 }}>
            <T variant="bodyStrong">{c.index}. {c.title}</T>
            <T variant="small" tone="muted">{c.text}</T>
          </View>
        )) : <T tone="muted">La première séance live déblaie le seuil du camp.</T>}
        {cordee.next ? <T variant="caption" tone="faint">Chapitre suivant : jours actifs en séance live, accélérés par chaque nouvelle Voie pratiquée.</T> : null}
      </Section>
      <Section title="Les Marches">
        <View style={{ gap: space.s2 }}>
          {Object.keys(LiveVoies.VOIES).map((id) => {
            const r = LiveWorld.region(id, w.voies[id]);
            const arc = LiveWorld.arc(id, w.voies[id]);
            if (!r.lands) return null;
            return (
              <View key={id} style={{ padding: space.s3, borderRadius: radius.r2, backgroundColor: colors.bg2, gap: 4 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <T variant="bodyStrong">{r.name}</T>
                  <T variant="caption" tone="muted">{r.lands} / {r.of} terres</T>
                </View>
                <T variant="small" tone="muted">{arc[arc.length - 1]?.text}</T>
                {r.guardianReady ? <T variant="caption" tone="amber">{r.guardian} t’attend.</T> : null}
              </View>
            );
          })}
          {!Object.keys(w.voies).length ? <T tone="muted">Chaque Voie pratiquée en séance live révèle sa région.</T> : null}
        </View>
      </Section>
      <Section title={`Trouvailles · ${w.collection.length}`}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2 }}>
          {w.collection.map((key) => {
            const [voie, idx] = key.split(":");
            const f = LiveWorld.FINDS[voie]?.[Number(idx)];
            return f ? <View key={key} style={{ paddingHorizontal: space.s3, paddingVertical: space.s2, borderRadius: radius.pill, borderWidth: 1, borderColor: Number(idx) >= 4 ? colors.amLine : colors.line2 }}><T variant="caption" tone={Number(idx) >= 4 ? "amber" : "default"}>{f[0]}</T></View> : null;
          })}
          {!w.collection.length ? <T tone="muted">Les trouvailles apparaissent au fil des séances, un peu plus souvent quand tu explores.</T> : null}
        </View>
      </Section>
    </Screen>
  );
}

function Resource({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ minWidth: 96, flexGrow: 1, padding: space.s3, borderRadius: radius.r2, backgroundColor: colors.bg2, borderTopWidth: 2, borderTopColor: color }}>
      <T variant="caption" tone="muted">{label}</T>
      <T variant="num">{value}</T>
    </View>
  );
}
