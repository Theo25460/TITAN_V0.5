#!/usr/bin/env node
// Generates the TITAN LIVE matrix of the 260 sports from the engine itself (js/core/live-voies.js), so the document can
// never drift from the code. Also generates the sport → Voie seed used by the Supabase migration.
//   node tools/build-live-matrix.mjs          write docs/live/MATRICE_260_SPORTS.md and docs/live/live-matrix.json
//   node tools/build-live-matrix.mjs --check  fail if either file is stale
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
require(join(ROOT, "js/core/sports-catalog.js"));
const Voies = require(join(ROOT, "js/core/live-voies.js"));
const World = require(join(ROOT, "js/core/live-world.js"));

const INTENT = { atteindre: "A", depasser: "D", explorer: "E" };
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const rows = Voies.all().sort((a, b) => a.voie.localeCompare(b.voie) || a.label.localeCompare(b.label, "fr"));

function dataCell(c) {
  const live = [];
  if (c.data.gps) live.push("GPS (distance, allure/vitesse, dénivelé)");
  if (c.data.steps) live.push("podomètre");
  live.push("chrono");
  if (c.plan.workS) live.push(`cloche ${c.plan.count}×${Math.round(c.plan.workS / 60 * 10) / 10} min`);
  if (c.plan.restS && !c.plan.workS) live.push(`repos ${c.plan.restS} s`);
  for (const d of c.data.declaredLive) live.push(`touchers : ${d}`);
  const after = c.data.afterFields.length ? `après : ${c.data.afterFields.join(", ")}` : "après : durée, RPE";
  const extra = [c.data.heartRate ? `FC ${c.data.heartRate}` : null, c.data.power ? `puissance ${c.data.power}` : null].filter(Boolean);
  return `${live.join(" · ")}<br>${after}${extra.length ? `<br>${extra.join(" · ")}` : ""}`;
}

function planCell(c) {
  const p = c.plan;
  if (p.kind === "period") return `${p.count} ${c.beat.many} de ${p.minutes} min`;
  if (p.kind === "round") return `${p.count} ${c.beat.many}`;
  if (p.kind === "time") return `${p.minutes} min`;
  return `${p.count} ${p.count > 1 ? c.beat.many : c.beat.one}`;
}

function missionsCell(c) {
  return c.missions.map((m) => `${m.label} (${m.intents.map((i) => INTENT[i]).join("")})`).join(" · ");
}

const voieStats = {};
for (const r of rows) (voieStats[r.voie] ||= []).push(r);

let md = `# TITAN LIVE — matrice des ${rows.length} sports

> Document **généré** par \`node tools/build-live-matrix.mjs\` depuis \`js/core/live-voies.js\`. Ne pas éditer à la main :
> un test (\`tests/live-matrix.test.mjs\`) échoue si ce fichier ne correspond plus au moteur.

Lecture : chaque sport appartient à une **Voie** (famille d'expérience). La Voie fixe la boucle de jeu ; le sport fixe ses
données réelles, son plan par défaut (périodes, cloche, unités), sa classe de sécurité et les missions qui lui sont
proposées. Intentions : **A** Atteindre · **D** Se dépasser · **E** Explorer. Sécurité : *Interactions libres* (toucher
entre deux efforts), *Coup d'œil* (lecture seulement en mouvement), *Mains libres* (aucune demande pendant l'effort, voix
rare), *Concentration totale* (TITAN se tait pendant l'effort, missions choisies avant et validées après).

## Synthèse par Voie

| Voie | Sports | Battement | Panneau live | Essence | Artefact persistant | Gardien |
|---|---:|---|---|---|---|---|
`;
for (const v of Object.values(Voies.VOIES)) {
  const n = (voieStats[v.id] || []).length;
  md += `| **${v.name}** (\`${v.id}\`) | ${n} | ${v.beat.one} | ${v.panel} | ${Voies.ESSENCES[v.essence].label} | ${esc(v.artefact.name)} | ${esc(v.guardian.name)} |\n`;
}
md += `\nRépartition sécurité : ${Object.entries(rows.reduce((a, r) => ((a[r.safetyLabel] = (a[r.safetyLabel] || 0) + 1), a), {})).map(([k, n]) => `${k} ${n}`).join(" · ")}.\n`;

for (const v of Object.values(Voies.VOIES)) {
  const list = voieStats[v.id] || [];
  md += `\n## ${v.name} — ${list.length} sports\n\n*${esc(v.tagline)}*\n\n**Boucle de jeu.**\n\n${v.loop.map((l) => `- ${esc(l)}`).join("\n")}\n\n`;
  md += `**Événements dynamiques.** ${v.events.map((e) => esc(e.text)).join(" · ")}\n\n`;
  md += `**Récompenses.** Essence ${Voies.ESSENCES[v.essence].label} (1 par minute d'effort comptée, 90 par jour), éclats (missions, harmonie), terres des Marches, chroniques de la Voie, trouvailles : ${World.FINDS[v.id].map((f) => esc(f[0])).join(", ")}.\n\n`;
  md += `**Sans suivi en direct.** ${esc(v.fallback)}\n\n`;
  md += `| Sport | Profil | Données disponibles | Plan par défaut | Sécurité | Missions (intentions) |\n|---|---|---|---|---|---|\n`;
  for (const c of list) md += `| **${esc(c.label)}** \`${c.sport}\`<br>*${esc(c.signature)}* | ${c.profile} · ${c.unit} | ${dataCell(c)} | ${planCell(c)} | ${c.safetyLabel}${c.road ? " · route" : ""} | ${esc(missionsCell(c))} |\n`;
}

md += `\n## Originalité et répétitions éliminées\n
- **Une seule mécanique « distance » survit**, et elle ne compte pas les kilomètres : Traversée, Expédition, Cabotage et
  Hautes Routes avancent toutes en minutes d'effort normalisées (et en dénivelé pour la montagne). Le GPS sert à la carte
  réelle, au brouillard des lieux nouveaux et aux cols, jamais à multiplier les récompenses.
- **Les sports de raquette ne sont pas des courses** : tableau de score à deux zones tactiles, Élan du duel, remontées.
- **Les sports collectifs ne demandent rien pendant le jeu** : serment avant, périodes réelles du sport, rapport après.
- **La précision récompense la régularité**, pas le meilleur coup (constellations) : juste pour les débutants.
- **La force récompense la réserve**, jamais l'échec (frappes nettes, braise du repos, seuil unique et contrôlé).
- **L'escalade transforme la chute en information** (prises révélées) et suit des projets sur plusieurs séances.
- **Le combat célèbre le contrôle**, la technique et la pratique (parchemins), jamais la puissance ni la victoire.
- **Le bien-être reste silencieux** (Sanctuaire) et mesure l'apaisement déclaré, pas une performance.
- **Les pratiques à risque n'ont aucun défi** de hauteur, de vitesse, de profondeur ou de prise de risque (Éléments,
  Trajectoire, Lien) : l'Atlas collectionne les conditions rencontrées et salue les renoncements sages.
- **Mécaniques écartées** car répétitives ou dangereuses : « boss à PV » générique pour tous les sports, chrono à battre
  sur route, séries quotidiennes, classements bruts entre sports, défis d'apnée ou de profondeur, compte à rebours
  culpabilisant, récompenses proportionnelles à la durée.
`;

const json = rows.map((c) => ({ sport: c.sport, label: c.label, signature: c.signature, voie: c.voie, essence: c.essence, family: c.family, panel: c.panel, safety: c.safety, gps: c.data.gps, plan: c.plan, missions: c.missions.map((m) => m.id) }));
const outMd = join(ROOT, "docs/live/MATRICE_260_SPORTS.md");
const outJson = join(ROOT, "docs/live/live-matrix.json");
const jsonText = JSON.stringify(json, null, 1) + "\n";

if (process.argv.includes("--check")) {
  const stale = [[outMd, md], [outJson, jsonText]].filter(([p, t]) => !existsSync(p) || readFileSync(p, "utf8") !== t).map(([p]) => p);
  if (stale.length) { console.error(`Stale: ${stale.join(", ")}. Run node tools/build-live-matrix.mjs`); process.exit(1); }
  console.log(`TITAN LIVE matrix up to date (${rows.length} sports).`);
} else {
  mkdirSync(dirname(outMd), { recursive: true });
  writeFileSync(outMd, md);
  writeFileSync(outJson, jsonText);
  console.log(`Wrote ${outMd} and ${outJson} (${rows.length} sports).`);
}

export { md, json };
