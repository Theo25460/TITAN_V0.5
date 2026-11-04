import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { adventureRpgAction, fetchAdventureRpg, type AdventureWorld, type RpgSnapshot } from "../data/adventureRpg";
import { space } from "../theme/tokens";
import { Card } from "./Card";
import { Button } from "./Button";
import { T } from "./Text";

type Narrative = { ordinal: number; arc: number; arcName: string; chapter: number; kind: string; name: string; story: string; choices: string[]; endings: string[] };
const catalog = require("../core/web/adventure-rpg.js") as { path: (world: string) => Narrative[]; familyTitle: (family: string) => string };
const errorText = (error: unknown) => {
  const message = (error as Error)?.message;
  if (message === "CAMPAIGN_NOT_STARTED") return "Commence d’abord la campagne de ce monde.";
  if (message === "ENCOUNTER_INCOMPLETE") return "Les preuves confirmées ne suffisent pas encore. Reviens à ton rythme.";
  return "La rencontre est indisponible. Tes acquis sont conservés.";
};

/** Optional journal, server evidence only. Parent passes current authenticated owner/world and campaign revision. */
export function AdventureEncounters({ owner, world, revision = 0 }: { owner: string; world: AdventureWorld; revision?: number }) {
  const [snapshot, setSnapshot] = useState<RpgSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const actionInFlight = useRef(false);
  useEffect(() => {
    const epoch = ++generation.current;
    setSnapshot(null); setError(""); setBusy(false); actionInFlight.current = false;
    if (owner.startsWith("guest_")) return;
    fetchAdventureRpg(owner, world).then(data => { if (generation.current === epoch) setSnapshot(data); }).catch(e => { if (generation.current === epoch) setError(errorText(e)); });
    return () => { generation.current++; };
  }, [owner, world, revision]);
  const act = async (action: "start" | "sync" | "claim", ordinal: number | null = null, choice: number | null = null) => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    const epoch = generation.current; setBusy(true); setError("");
    try { const data = await adventureRpgAction(owner, world, action, ordinal, choice); if (epoch === generation.current) setSnapshot(data); }
    catch (e) { if (epoch === generation.current) setError(errorText(e)); }
    finally { if (epoch === generation.current) { actionInFlight.current = false; setBusy(false); } }
  };
  if (owner.startsWith("guest_")) return <Card><T>Les rencontres et le bestiaire sont confirmés avec un compte. La campagne découverte reste disponible.</T></Card>;
  // Hide data immediately on owner/world changes, even before the effect cleanup.
  const s = snapshot?.owner === owner && snapshot.world === world ? snapshot : null;
  const nodes = catalog.path(world);
  const current = s?.milestones.find(n => !n.earned);
  const scene = nodes.find(n => n.ordinal === current?.ordinal);
  const bestiary = s?.rewards.map(r => nodes.find(n => n.ordinal === r.ordinal)).filter((n): n is Narrative => !!n && ["monster", "miniboss"].includes(n.kind)) ?? [];
  return <Card testID="adventure-encounters" style={{ gap: space.s3 }}>
    <T variant="h2">Le chemin des rencontres</T>
    <T variant="small">Facultatif, gratuit, sans échéance. Le repos ne retire rien. Tes séances confirmées préparent les rencontres ; aucun capteur requis.</T>
    {error ? <T accessibilityRole="alert" tone="err">{error}</T> : null}
    {!s ? <><T variant="small">{error ? "Tu peux réessayer." : "Le journal des rencontres se prépare…"}</T>{error ? <Button label="Réessayer" onPress={() => { const epoch = generation.current; setError(""); fetchAdventureRpg(owner, world).then(data => { if (epoch === generation.current) setSnapshot(data); }).catch(e => { if (epoch === generation.current) setError(errorText(e)); }); }} loading={busy} /> : null}</> : !s.active ? <>
      <T>Trois arcs, six jalons chacun : lieux, choix, monstres, récits et trésors cosmétiques.</T>
      <T variant="small">Les prochaines séances seront attribuées une seule fois à ce monde pour les rencontres. Tes XP et coins suivent leurs règles habituelles.</T>
      <Button label="Ouvrir ce chemin" onPress={() => act("start")} loading={busy} />
    </> : <>
      <T variant="small">{s.days} jours admissibles · {s.effort} points confirmés · {s.rewards.length}/18 souvenirs. Cible figée : {s.target} points par jalon d’après les 28 jours précédant le départ ; 90 au plus par jour sur tous les mondes.</T>
      {[1, 2, 3].map(arc => <View key={arc} style={{ gap: space.s2 }}><T variant="h3">Arc {arc} · {nodes[(arc - 1) * 6]?.arcName}</T>
        {nodes.filter(n => n.arc === arc).map(n => {
          const proof = s.milestones.find(p => p.ordinal === n.ordinal);
          const reward = s.rewards.find(r => r.ordinal === n.ordinal);
          return <View key={n.ordinal} style={{ marginLeft: [0, 22, 40, 24, 8, 28][(n.ordinal - 1) % 6], gap: 4 }}>
            <T variant="bodyStrong" tone={proof?.earned ? "accent" : n.ordinal === current?.ordinal ? "default" : "faint"}>{proof?.earned ? "✓ " : `${n.ordinal}. `}{n.name}</T>
            <T variant="caption">Chapitre {n.chapter} · {proof?.earned ? "acquis" : n.ordinal === current?.ordinal ? "en cours" : "à découvrir"}</T>
            {reward?.choice != null ? <T variant="small">{n.endings[reward.choice]}</T> : null}
          </View>;
        })}
      </View>)}
      <Button label="Actualiser les preuves de ce monde" kind="secondary" onPress={() => act("sync")} loading={busy} />
      {current && scene ? <View style={{ gap: space.s2 }}>
        <T variant="h3">{scene.name}</T><T>{scene.story}</T>
        {["monster", "miniboss"].includes(scene.kind) ? <View accessible accessibilityRole="progressbar" accessibilityLabel="Passage dégagé par l’effort confirmé" accessibilityValue={{ min: 0, max: s.target, now: Math.min(s.target, Math.max(0, s.effort - (scene.ordinal - 1) * s.target)) }}><T variant="small">{Math.min(s.target, Math.max(0, s.effort - (scene.ordinal - 1) * s.target))}/{s.target} points confirmés pour cette rencontre.</T></View> : null}
        <T variant="small">{current.ready ? "Le serveur confirme les préparatifs." : `${Math.max(0, current.effortTarget - s.effort)} points restant(s) · ${Math.min(s.days, current.daysTarget)}/${current.daysTarget} jours distincts · chapitre ${scene.chapter} à atteindre.`}</T>
        {scene.kind === "choice" ? scene.choices.map((choice, i) => <Button key={choice} label={choice} kind="secondary" disabled={!current.ready || busy} onPress={() => act("claim", scene.ordinal, i)} />) : <Button label={["monster", "miniboss"].includes(scene.kind) ? "Dégager le passage" : "Poursuivre le récit"} disabled={!current.ready} onPress={() => act("claim", scene.ordinal)} loading={busy} />}
      </View> : <T>Les dix-huit jalons rejoignent ton carnet.</T>}
      <T variant="h3">Bestiaire · {bestiary.length}/6</T>
      {bestiary.map(n => <View key={n.ordinal} style={{ gap: 4 }}><T variant="bodyStrong">{n.name} · arc {n.arc}</T><T variant="small">{n.story}</T></View>)}
      <T variant="h3">Exploits par familles</T><T variant="small">Trois jours distincts dans une famille débloquent un titre cosmétique, sans XP ni coins.</T>
      {s.familyTitles.map(f => <T key={f.family}>{catalog.familyTitle(f.family)}</T>)}
    </>}
  </Card>;
}
