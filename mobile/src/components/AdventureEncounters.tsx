import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { adventureBranchAction, adventureGuardianAction, adventureRpgAction, fetchAdventureRpg, type AdventureWorld, type RpgSnapshot } from "../data/adventureRpg";
import { onReconnect, useOnline } from "../lib/network";
import { AdventureBranch, type BranchView } from "./AdventureBranch";
import { AdventureGuardian, type GuardianView } from "./AdventureGuardian";
import { space } from "../theme/tokens";
import { Card } from "./Card";
import { Button } from "./Button";
import { Tap } from "./Pressable";
import { Icon } from "./Icon";
import { T } from "./Text";

type Narrative = { ordinal: number; arc: number; arcName: string; chapter: number; kind: string; name: string; story: string; choices: string[]; endings: string[] };
const catalog = require("../core/web/adventure-rpg.js") as { path: (world: string) => Narrative[]; familyTitle: (family: string) => string };
type Contract = { choiceOrdinal: number; steps: { ordinal: number }[] };
const branches = require("../core/web/adventure-branches.js") as {
  t: (key: string, vars?: Record<string, unknown>) => string; view: (s: RpgSnapshot) => BranchView | null; nodes: (path: Narrative[], s: RpgSnapshot) => Narrative[];
  contract: (pilot?: string, version?: number) => Contract | null; conflict: (requested: string, s: RpgSnapshot) => string; offlineText: () => string;
};
const guardians = require("../core/web/adventure-guardian.js") as {
  view: (s: RpgSnapshot) => GuardianView | null; nodes: (path: Narrative[], s: RpgSnapshot) => Narrative[]; errorText: (code?: string) => string;
};
const errorText = (error: unknown) => {
  const message = (error as Error)?.message;
  if (message === "ENCOUNTER_INCOMPLETE" || message?.startsWith("GUARDIAN_") || message === "INVALID_SIGN") return guardians.errorText(message);
  if (message === "CAMPAIGN_NOT_STARTED") return "Commence d’abord la campagne de ce monde.";
  if (message === "ENCOUNTER_INCOMPLETE") return "Les preuves confirmées ne suffisent pas encore. Reviens à ton rythme.";
  if (message === "BRANCH_INCOMPATIBLE") return branches.t("pilot.legacy");
  if (message === "RPG_OFFLINE") return branches.offlineText();
  return guardians.errorText(message) || "La rencontre est indisponible. Tes acquis sont conservés.";
};

/** Optional journal, server evidence only. Parent passes current authenticated owner/world and campaign revision. */
export function AdventureEncounters({ owner, world, revision = 0 }: { owner: string; world: AdventureWorld; revision?: number }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [owner, world]);
  const [snapshot, setSnapshot] = useState<RpgSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const online = useOnline();
  const generation = useRef(0);
  const actionInFlight = useRef(false);
  useEffect(() => {
    const epoch = ++generation.current;
    setSnapshot(null); setError(""); setBusy(false); setSelected(null); setNotice(""); actionInFlight.current = false;
    if (owner.startsWith("guest_")) return;
    fetchAdventureRpg(owner, world).then(data => { if (generation.current === epoch) setSnapshot(data); }).catch(e => { if (generation.current === epoch) setError(errorText(e)); });
    return () => { generation.current++; };
  }, [owner, world, revision]);
  // Back online: re-read the canonical server state (another device may have decided meanwhile). Nothing is replayed.
  useEffect(() => { const stop = onReconnect(() => {
    const epoch = generation.current;
    if (owner.startsWith("guest_")) return;
    fetchAdventureRpg(owner, world).then(data => { if (generation.current === epoch) { setSnapshot(data); setNotice(""); } }).catch(() => undefined);
  }); return () => { stop(); }; }, [owner, world]);
  const act = async (action: "start" | "sync" | "claim" | "enter" | "confirm" | "prepare" | "resolve", ordinal: number | null = null, choice: number | null = null, route: string | null = null, sign: string | null = null) => {
    if (actionInFlight.current) return;
    if ((action === "enter" || action === "confirm") && !online) { setNotice(branches.offlineText()); return; }
    if ((action === "prepare" || action === "resolve") && !online) { setNotice(guardians.errorText("RPG_OFFLINE")); return; }
    actionInFlight.current = true;
    const epoch = generation.current; setBusy(true); setError(""); setNotice("");
    try {
      const data = action === "enter" || action === "confirm" ? await adventureBranchAction(owner, world, action, route)
        : action === "prepare" || action === "resolve" ? await adventureGuardianAction(owner, world, action, sign)
        : await adventureRpgAction(owner, world, action, ordinal, choice);
      if (epoch === generation.current) { setSnapshot(data); if (action === "confirm" && route) { setNotice(branches.conflict(route, data)); setSelected(null); } }
    }
    catch (e) { if (epoch === generation.current) setError(errorText(e)); }
    finally { if (epoch === generation.current) { actionInFlight.current = false; setBusy(false); } }
  };
  if (owner.startsWith("guest_")) return <Card><T>Les rencontres et le bestiaire sont confirmés avec un compte. La campagne découverte reste disponible.</T></Card>;
  // Hide data immediately on owner/world changes, even before the effect cleanup.
  const s = snapshot?.owner === owner && snapshot.world === world ? snapshot : null;
  const nodes = s ? guardians.nodes(branches.nodes(catalog.path(world), s), s) : catalog.path(world);
  const current = s?.milestones.find(n => !n.earned);
  const scene = nodes.find(n => n.ordinal === current?.ordinal);
  const branch = s?.active ? branches.view(s) : null;
  const contract = branch?.pilot ? branches.contract(branch.pilot, branch.version) : null;
  const branchOrdinals = contract ? [contract.choiceOrdinal, ...contract.steps.map(x => x.ordinal)] : [];
  const inBranch = !!branch && ["available", "entered", "confirmed"].includes(branch.state) && !!current && branchOrdinals.includes(current.ordinal);
  const showBranch = !!branch && (inBranch || ["confirmed", "legacy", "unknown"].includes(branch.state));
  const guardian = s?.active ? guardians.view(s) : null;
  const inGuardian = !!guardian?.ordinal && !!current && [guardian.observeOrdinal, guardian.ordinal].includes(current.ordinal) && ["observe", "prepare", "waiting", "ready"].includes(guardian.state);
  const showGuardian = !!guardian && (inGuardian || ["resolved", "legacy", "unknown"].includes(guardian.state));
  const beasts = nodes.filter(n => ["monster", "miniboss"].includes(n.kind)).length;
  const bestiary = s?.rewards.map(r => nodes.find(n => n.ordinal === r.ordinal)).filter((n): n is Narrative => !!n && ["monster", "miniboss"].includes(n.kind)) ?? [];
  const toggle = <Tap accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel="Rencontres secondaires · 18 souvenirs facultatifs" onPress={() => setExpanded(value => !value)} style={{ minHeight: 48, flexDirection: "row", gap: space.s2, alignItems: "center" }}>
    <View style={{ flex: 1, gap: 4 }}><T variant="h3">Rencontres secondaires</T><T variant="caption">18 souvenirs facultatifs, liés aux 9 chapitres{s?.active ? ` · ${s.rewards.length}/18 acquis` : ""}</T></View>
    <Icon name={expanded ? "up" : "down"} size={20} />
  </Tap>;
  if (!expanded) return <Card testID="adventure-encounters">{toggle}</Card>;
  return <Card testID="adventure-encounters" style={{ gap: space.s3 }}>
    {toggle}
    <T variant="small">Ces rencontres enrichissent les neuf chapitres du monde. Facultatif, gratuit, sans échéance. Le repos ne retire rien. Tes séances confirmées préparent les rencontres ; aucun capteur requis.</T>
    {error ? <T accessibilityRole="alert" tone="err">{error}</T> : null}
    {!s ? <><T variant="small">{error ? "Tu peux réessayer." : "Le journal des rencontres se prépare…"}</T>{error ? <Button label="Réessayer" onPress={() => { const epoch = generation.current; setError(""); fetchAdventureRpg(owner, world).then(data => { if (epoch === generation.current) setSnapshot(data); }).catch(e => { if (epoch === generation.current) setError(errorText(e)); }); }} loading={busy} /> : null}</> : !s.active ? <>
      <T>Trois arcs, six jalons chacun : lieux, choix, monstres, récits et trésors cosmétiques.</T>
      <T variant="small">Les prochaines séances seront attribuées une seule fois à ce monde pour les rencontres. Tes XP et crédits suivent leurs règles habituelles.</T>
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
            {reward?.choice != null && n.endings[reward.choice] ? <T variant="small">{n.endings[reward.choice]}</T> : null}
          </View>;
        })}
      </View>)}
      <Button label="Actualiser les preuves de ce monde" kind="secondary" onPress={() => act("sync")} loading={busy} />
      {notice ? <T accessibilityRole="alert" tone="warn">{notice}</T> : null}
      {showBranch && branch ? <AdventureBranch view={branch} branches={branches} atChoice={current?.ordinal === contract?.choiceOrdinal} stepOrdinal={current?.ordinal ?? null}
        selected={selected} onSelect={route => { setSelected(route); setNotice(""); }} onEnter={() => act("enter")} onConfirm={route => act("confirm", null, null, route)}
        onClaim={ordinal => act("claim", ordinal)} busy={busy} online={online} /> : null}
      {showGuardian && guardian ? <AdventureGuardian view={guardian} busy={busy} onClaim={ordinal => act("claim", ordinal)}
        onPrepare={sign => act("prepare", null, null, null, sign)} onResolve={() => act("resolve")} /> : null}
      {inBranch || inGuardian ? null : current && scene ? <View style={{ gap: space.s2 }}>
        <T variant="h3">{scene.name}</T><T>{scene.story}</T>
        {["monster", "miniboss"].includes(scene.kind) ? <View accessible accessibilityRole="progressbar" accessibilityLabel="Passage dégagé par l’effort confirmé" accessibilityValue={{ min: 0, max: s.target, now: Math.min(s.target, Math.max(0, s.effort - (scene.ordinal - 1) * s.target)) }}><T variant="small">{Math.min(s.target, Math.max(0, s.effort - (scene.ordinal - 1) * s.target))}/{s.target} points confirmés pour cette rencontre.</T></View> : null}
        <T variant="small">{current.ready ? "Les préparatifs sont prêts." : `${Math.max(0, current.effortTarget - s.effort)} points restant(s) · ${Math.min(s.days, current.daysTarget)}/${current.daysTarget} jours distincts · chapitre ${scene.chapter} à atteindre.`}</T>
        {scene.kind === "choice" ? scene.choices.map((choice, i) => <Button key={choice} label={choice} kind="secondary" disabled={!current.ready || busy} onPress={() => act("claim", scene.ordinal, i)} />) : <Button label={["monster", "miniboss"].includes(scene.kind) ? "Dégager le passage" : "Poursuivre le récit"} disabled={!current.ready} onPress={() => act("claim", scene.ordinal)} loading={busy} />}
      </View> : <T>Les dix-huit jalons rejoignent ton carnet.</T>}
      <T variant="h3">Bestiaire · {bestiary.length}/{beasts}</T>
      {bestiary.map(n => <View key={n.ordinal} style={{ gap: 4 }}><T variant="bodyStrong">{n.name} · arc {n.arc}</T><T variant="small">{n.story}</T></View>)}
      <T variant="h3">Exploits par familles</T><T variant="small">Trois jours distincts dans une famille débloquent un titre cosmétique, sans XP ni crédits.</T>
      {s.familyTitles.map(f => <T key={f.family}>{catalog.familyTitle(f.family)}</T>)}
    </>}
  </Card>;
}
