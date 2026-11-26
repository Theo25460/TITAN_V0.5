#!/usr/bin/env node
// TITAN V2.0 — canonical sequence of the future migrations (mission A2, 26 November 2026).
//
// The lot branches V1.5 to V1.9 and the share lot were written in parallel from main 0dae9af and reuse the same versions
// (20261123090000 three times, 20261124090000 three times, 20261125090000 to 20261128090000 twice) and the same package
// names (release-v21 to v26). None of these migrations is in production's registry (141 migrations, head 20261122090000,
// read on 26/11/2026). This file is the single source of truth that gives every one of them a NEW, unique version, in the
// order proven by the SQL object matrix (docs/v2/MIGRATIONS_V2.md), and groups them into the packages release-v2-01 to -08.
//
//   node tools/db/v2-canonical.mjs apply   rename the old migration files present in supabase/migrations and rewrite every
//                                          reference to their old version (tests, docs, comments), idempotent
//   node tools/db/v2-canonical.mjs map     write tools/db/v2-migration-map.json (old SHA/name → new file/version, checksums)
//
// Rules (checked by tests/v2-migration-map.test.mjs):
//   * a new version is strictly above the production head, unique, and equal to NO version a lot branch ever used: every old
//     version ends in 0000 (HH0000), every new one has non-zero minutes; a database where an old lot package was tried can
//     never mistake an old migration for a canonical one;
//   * a migration's body is the lot's file byte for byte, except the edits listed in `edit` (reason given, new checksum kept);
//   * an applied migration (production registry) is never renamed nor edited: everything here is above 20261122090000.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;
export const PRODUCTION_HEAD = readFileSync(join(ROOT, "tools/db/production-head.txt"), "utf8").trim();
export const MAIN_SHA = "0dae9af9b32d7cf7ec3ceca7b1dee52e92544f39";

const LOT = {
  "V1.5.0": "1933f36dffefdfd129d31b6a1637773a3a14287d", "V1.5.1": "f27a635e7d7c0c075dd3a24cb467c2d0f2742768",
  "V1.5.2": "e48cf1d6ebc3b81bf9286053438600a11c6158fc", "V1.5.3": "c9eed983c67e13f69459a6c14f64fad4407c7867",
  "V1.5.4": "721cc47ce9693e5e1ebb98efef29aeb51fd41377", "V1.5.5": "52e83b24283e7809d38ce4e828e014db79f3442f",
  "V1.6.2": "18c062b0ce1acd7904d3a52eb88a4f17382582d4", "V1.6.3": "1e684f1c3d181f9b64f676ed0989097df8e79cfa",
  "V1.6.4": "0730d3c0fe19aeb4cab98e4efe81570e0e995375", "V1.6.5": "29424d8f0ea0f73f2e9488ac0d949f3b5d37ff6e",
  "V1.6.6": "897b731620a15eba9b72e8e8ebf9718310c71adb", "V1.7.7": "52a209bdbb1a2aba95e6864f61060fa805384c6a",
  "V1.8.1": "caaa302f86297513b2e46f9e9f6010ef7dada4cd", "V1.8.2": "ade9ae19546fbe0751b377b199bb0074bf3bf81b",
  "V1.8.3": "a12beb4d8853ea5e3b0395cc91e86bc6a7a5d3dd", "V1.8.4": "f546cafc229a2168405c3f4b150431b198ce4e68",
  "V1.8.5": "a799bfe3a0bd0aaee61a8c812b3955bb575f28ac", "V1.8.6": "c7e0223ffaf87fe7c78dc94905735e216da56b8d",
  "V1.9.1": "3b834eb479efde51664b81553c987871c60f68ae", "V1.9.2": "88e7601fca8482977d75943037750d2bd4ca6afd",
  "V1.9.3": "45c176ac696b2169e50cca6dc2f690576f067550", "V1.9.4": "1cdfba736d7396b6ed57bbe10b5606990fe23b34",
  "V1.9.5": "1d1ca059be0076c85067177e0bb4e2ffac8603bb", "V1.9.6": "3229bdceccf29b0db9359763ee4d37b33fb24e2b",
  T1: "e767d523da405c5ee4dd8082c2a0929312ab3304",
};

// Old package each migration came from, per lot branch (kept for the map: retrieve it with git show <sha>:<path>).
// Bundles, in application order. `requires` names the objects that make the order necessary (docs/v2/MIGRATIONS_V2.md).
export const BUNDLES = [
  {
    name: "v2-01", title: "Journal et imports (V1.6.2, V1.6.3, V1.6.4, V1.6.6)",
    requires: "production head 20261122090000 (v20)",
    migrations: [
      { lot: "V1.6.2", old: "20261123090000_session_match_review.sql", version: "20261130100100", oldPackage: "release-v21" },
      { lot: "V1.6.3", old: "20261123120000_history_reconcile.sql", version: "20261130100200", oldPackage: "release-v22" },
      { lot: "V1.6.4", old: "20261123150000_history_migration.sql", version: "20261130100300", oldPackage: "release-v23" },
      { lot: "V1.6.6", old: "20261123180000_journal_long_duration.sql", version: "20261130100400", oldPackage: "release-v24 (fourche B)" },
    ],
  },
  {
    name: "v2-02", title: "Centre des sources connectées (V1.6.5)",
    requires: "private.titan_import_batches (V1.6.4); applied after V1.6.6 so that the two forks of the journal end in one state",
    migrations: [{ lot: "V1.6.5", old: "20261124090000_source_center.sql", version: "20261130100500", oldPackage: "release-v24 (fourche A)" }],
  },
  {
    name: "v2-03", title: "Coaching (V1.9.1 à V1.9.6)",
    requires: "main only; placed BEFORE every wrapper of private.titan_export_extras_v1 because each V1.9 migration rewrites its top layer in full",
    migrations: [
      { lot: "V1.9.1", old: "20261201090000_coach_assignment_followup.sql", version: "20261130101100", oldPackage: "release-v191" },
      { lot: "V1.9.2", old: "20261202090000_coach_session_feedback.sql", version: "20261130101200", oldPackage: "release-v192" },
      { lot: "V1.9.3", old: "20261203090000_coach_weekly_review.sql", version: "20261130101300", oldPackage: "release-v193" },
      { lot: "V1.9.4", old: "20261204090000_coach_programs.sql", version: "20261130101400", oldPackage: "release-v194" },
      { lot: "V1.9.5", old: "20261205090000_coach_cycle_reports.sql", version: "20261130101500", oldPackage: "release-v195" },
      { lot: "V1.9.6", old: "20261206090000_coach_groups.sql", version: "20261130101600", oldPackage: "release-v196" },
    ],
  },
  {
    name: "v2-04", title: "GPS et navigation sportive (V1.7.7)",
    requires: "the journal (v2-01); wraps private.titan_export_extras_v1 left by the coaching (v2-03) instead of rewriting it",
    migrations: [{
      lot: "V1.7.7", old: "20261125170000_gps_navigation.sql", version: "20261130102100", oldPackage: "release-v25",
      edit: "The export section: the lot rewrote the top layer of private.titan_export_extras_v1 (main's keys + routes + places), which "
        + "would have erased the coaching keys of v2-03. It now renames the current top to titan_export_extras_before_gps_v1 and adds "
        + "routes and places on top of it (the V1.5 wrapper pattern). Same keys, same values; nothing else changes.",
    }],
  },
  {
    name: "v2-05", title: "Refonte RPG (V1.5.0 à V1.5.5)",
    requires: "wraps private.titan_export_extras_v1 after every rewrite (v2-03) and the GPS wrapper (v2-04)",
    migrations: [
      { lot: "V1.5.0", old: "20261123090000_adventure_branches_v1.sql", version: "20261130103100", oldPackage: "release-v21" },
      { lot: "V1.5.1", old: "20261124090000_adventure_guardian_v1.sql", version: "20261130103200", oldPackage: "release-v22" },
      { lot: "V1.5.2", old: "20261125090000_adventure_consequence_v1.sql", version: "20261130103300", oldPackage: "release-v23" },
      { lot: "V1.5.3", old: "20261126090000_adventure_campaigns_v1.sql", version: "20261130103400", oldPackage: "release-v24" },
      { lot: "V1.5.4", old: "20261127090000_adventure_quest_chains_v1.sql", version: "20261130103500", oldPackage: "release-v25" },
      { lot: "V1.5.5", old: "20261128090000_adventure_chronicles_v1.sql", version: "20261130103600", oldPackage: "release-v26" },
    ],
  },
  {
    name: "v2-06", title: "Coopération (V1.8.1 à V1.8.6)",
    requires: "main only (private.titan_social_export_v1, public.titan_cordees_v1, public.titan_social_digest_v1 are V1.8-only)",
    migrations: [
      { lot: "V1.8.1", old: "20261124090000_cordee_relay.sql", version: "20261130104100", oldPackage: "release-v21" },
      { lot: "V1.8.2", old: "20261125090000_cordee_reprise.sql", version: "20261130104200", oldPackage: "release-v22" },
      { lot: "V1.8.3", old: "20261126090000_cordee_suite.sql", version: "20261130104300", oldPackage: "release-v23" },
      { lot: "V1.8.4", old: "20261127090000_club_season.sql", version: "20261130104400", oldPackage: "release-v24" },
      { lot: "V1.8.5", old: "20261128090000_club_match.sql", version: "20261130104500", oldPackage: "release-v25" },
      { lot: "V1.8.6", old: "20261129090000_club_agenda.sql", version: "20261130104600", oldPackage: "release-v26" },
    ],
  },
  {
    name: "v2-07", title: "Partage en image (Avant V2 — partage et communauté)",
    requires: "main only (private.titan_analytics_payload_valid_v300)",
    migrations: [{ lot: "T1", old: "20261126120000_analytics_share_story.sql", version: "20261130105100", oldPackage: "release-partage" }],
  },
  {
    name: "v2-08", title: "Consolidation V2.0 (export complet, hygiène des droits, garde finale)",
    requires: "every package above: it wraps the final export chain and checks that no section was lost",
    migrations: [{ lot: "A2", old: null, version: "20261130105900", name: "v2_consolidation", oldPackage: null,
      note: "Written by A2: exports the V1.6.4 import batches and the V1.6.5 source runs, revokes the default grant of the V1.6.5 trigger function, refuses the package if an export section or a grant is lost." }],
  },
];

export const ALL = BUNDLES.flatMap((b) => b.migrations.map((m) => (m.old
  ? { ...m, bundle: b.name, name: m.old.slice(15, -4), oldVersion: m.old.slice(0, 14), file: `${m.version}_${m.old.slice(15)}` }
  : { ...m, bundle: b.name, oldVersion: null, file: `${m.version}_${m.name}.sql` })));
// Every version any lot branch used (including the share lot): the canonical versions must avoid all of them.
export const OLD_VERSIONS = [...new Set(ALL.filter((m) => m.oldVersion).map((m) => m.oldVersion))].sort();
export const fileOf = (m) => (m.old ? `${m.version}_${m.old.slice(15)}` : `${m.version}_${m.name}.sql`);

const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const MIG = (f) => join(ROOT, "supabase/migrations", f);

// Files whose old versions are history and must stay as written: A1's records, this map, the generated legacy packages.
const KEEP = [/^supabase\/migrations\//, /^docs\/v2\/integration-manifest\.json$/, /^docs\/v2\/INTEGRATION_PLAN\.md$/, /^docs\/v2\/MIGRATIONS_V2\.md$/,
  /^docs\/v2\/legal-unpublished-versions\.json$/, /^tools\/db\/v2-canonical\.mjs$/, /^tools\/db\/v2-migration-map\.json$/,
  /^tests\/v2-migration-map\.test\.mjs$/, /^supabase\/release-/, /^docs\/seo\/evidence-/];

function apply() {
  const present = ALL.filter((m) => m.old && existsSync(MIG(m.old)));
  for (const m of present) {
    if (existsSync(MIG(m.file))) throw new Error(`${m.file} already exists next to ${m.old}`);
    renameSync(MIG(m.old), MIG(m.file));
    console.log(`renamed ${m.old} → ${m.file}`);
  }
  // Rewrite references to an old version only for chains whose files were just renamed or are already canonical: when a chain
  // is merged, every remaining occurrence of one of its old versions comes from that chain (the chains merged before it
  // already point to canonical versions, and main never names a future version).
  const byOld = new Map();
  for (const m of ALL.filter((x) => x.old && existsSync(MIG(x.file)))) {
    if (!byOld.has(m.oldVersion)) byOld.set(m.oldVersion, new Set());
    byOld.get(m.oldVersion).add(m);
  }
  const files = git("ls-files", "-z").split("\0").filter((f) => f && !KEEP.some((r) => r.test(f)));
  let changed = 0;
  for (const f of files) {
    const p = join(ROOT, f);
    if (!existsSync(p)) continue;
    let text;
    try { text = readFileSync(p, "utf8"); } catch { continue; }
    if (!/202611[23]\d{7}|202612\d{8}/.test(text)) continue;
    let out = text;
    for (const [old, set] of byOld) {
      if (!out.includes(old)) continue;
      const list = [...set];
      // A file name is unambiguous; a bare version is resolved by the migration file names the same line names.
      for (const m of list) out = out.split(`${m.oldVersion}_${m.name}`).join(`${m.version}_${m.name}`);
      if (!out.includes(old)) continue;
      if (list.length === 1) { out = out.replace(new RegExp(`(?<!\\d)${old}(?!\\d)`, "g"), list[0].version); continue; }
      // Several canonical migrations share this old version (e.g. the journal and the RPG both used 20261123090000): the
      // file must belong to exactly one of their lots, else stop and resolve by hand.
      const owners = list.filter((m) => fileTouchedBy(f, m.lot));
      if (owners.length !== 1) throw new Error(`${f}: old version ${old} is ambiguous (${list.map((m) => m.lot).join(", ")}): resolve by hand`);
      out = out.replace(new RegExp(`(?<!\\d)${old}(?!\\d)`, "g"), owners[0].version);
    }
    if (out !== text) { writeFileSync(p, out); changed++; console.log(`references rewritten: ${f}`); }
  }
  console.log(`${present.length} file(s) renamed, ${changed} file(s) with references rewritten`);
}

const touched = new Map();
// A file belongs to a chain when the chain's head changed it (a later lot of the chain may name an earlier lot's version).
const CHAIN_HEAD = (lot) => (lot.startsWith("V1.5") ? LOT["V1.5.5"] : lot === "V1.6.5" ? LOT["V1.6.5"] : /^V1\.[67]/.test(lot) ? LOT["V1.7.7"]
  : lot.startsWith("V1.8") ? LOT["V1.8.6"] : lot.startsWith("V1.9") ? LOT["V1.9.6"] : LOT[lot]);
function fileTouchedBy(file, lot) {
  const key = CHAIN_HEAD(lot);
  if (!touched.has(key)) touched.set(key, new Set(git("diff", "--name-only", MAIN_SHA, key).split("\n").filter(Boolean)));
  return touched.get(key).has(file);
}

export function computeMap() {
  const entries = ALL.map((m) => {
    const sha = LOT[m.lot];
    let oldBody = null, blob = null;
    if (m.old) try { blob = git("rev-parse", `${sha}:supabase/migrations/${m.old}`).trim(); oldBody = git("show", `${sha}:supabase/migrations/${m.old}`); } catch { /* not fetched */ }
    const present = existsSync(MIG(m.file));
    const body = present ? readFileSync(MIG(m.file), "utf8") : null;
    return {
      lot: m.lot, bundle: m.bundle, old: { file: m.old, version: m.oldVersion, package: m.oldPackage, source_sha: sha ?? null, blob, sha256: oldBody && sha256(oldBody) },
      new: { file: m.file, version: m.version, package: `supabase/release-${m.bundle}`, present, sha256: body && sha256(body) },
      identical: body != null && oldBody != null ? body === oldBody : null,
      written_by_a2: !m.old, note: m.note ?? null,
      edit: m.edit ?? null,
    };
  });
  const out = {
    _: "Generated by node tools/db/v2-canonical.mjs map. Old lot migration (SHA, file, package, checksum) → canonical file, version and package. Do not edit by hand.",
    production_head: PRODUCTION_HEAD,
    old_versions: OLD_VERSIONS,
    bundles: BUNDLES.map((b) => ({ name: b.name, title: b.title, requires: b.requires, out: `supabase/release-${b.name}`, versions: b.migrations.map((m) => m.version) })),
    migrations: entries,
  };
  return out;
}
export function map() {
  const out = computeMap();
  writeFileSync(join(ROOT, "tools/db/v2-migration-map.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`map: ${out.migrations.length} migrations, ${out.migrations.filter((e) => e.new.present).length} present`);
  return out;
}

// README of each canonical package: procedure, provenance and, verbatim, the README of every lot package it replaces (nothing of
// their notes, effects or rollback instructions is lost). Rewritten by `readmes`; the SQL files come from build-production-bundle.mjs.
export function readmes() {
  const fpFile = join(ROOT, "tools/db/v2-fingerprints.json");
  const fp = existsSync(fpFile) ? JSON.parse(readFileSync(fpFile, "utf8")).after : {};
  let after = PRODUCTION_HEAD;
  const order = [];
  for (const b of BUNDLES) {
    const list = ALL.filter((m) => m.bundle === b.name);
    if (!list.every((m) => existsSync(MIG(m.file)))) continue;
    order.push(b.name);
    const until = list.at(-1).version;
    const fmt = (v) => (fp[v] ? Object.entries(fp[v]).map(([k, [n, r, c]]) => `\`${k}\` ${n} fonctions, droits \`${r}\`, corps \`${c}\``).join(" ; ") : "à mesurer");
    const rows = list.map((m, i) => m.old ? `| \`${String(i + 1).padStart(2, "0")}-${m.file}\` | ${m.lot} | \`${m.old}\` (paquet ${m.oldPackage}) | \`${LOT[m.lot]}\` | ${m.edit ? "**modifiée** : " + m.edit : "identique octet pour octet"} |`
      : `| \`${String(i + 1).padStart(2, "0")}-${m.file}\` | ${m.lot} | nouvelle migration écrite par A2 | — | ${m.note} |`);
    const origins = list.filter((m) => m.old).map((m) => {
      const pkg = m.oldPackage.split(" ")[0];
      let text = "";
      try { text = git("show", `${LOT[m.lot]}:supabase/${pkg}/README.md`); } catch { text = "(README introuvable à ce SHA)"; }
      return `### ${m.lot} — \`supabase/${pkg}/README.md\` au SHA \`${LOT[m.lot]}\`\n\n> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, \`tools/db/v2-migration-map.json\`).\n\n${text.trim().split("\n").map((l) => (l ? "> " + l : ">")).join("\n")}\n`;
    });
    const md = `# Paquet canonique ${b.name} — ${b.title} — NON APPLIQUÉ

> **Statut au 26/11/2026** : préparé par la mission A2 (fusion V2.0) sur la branche d'intégration. **Aucune application en production**
> sans l'accord explicite du propriétaire, une sauvegarde préalable (PITR ou copie logique) et la recette A3.

Généré par \`node tools/db/build-production-bundle.mjs --bundle ${b.name}\` depuis \`supabase/migrations/\` (fichiers SQL) et par
\`node tools/db/v2-canonical.mjs readmes\` (ce texte). **Ne pas modifier à la main** : \`tests/production-bundle.test.mjs\` et
\`tests/v2-migration-map.test.mjs\` échouent si un fichier diffère de sa source.

Ordre : ${BUNDLES.map((x) => (x.name === b.name ? "**" + x.name + "**" : x.name)).join(" → ")}. Ce paquet suppose : ${b.requires}.

| Fichier | Lot | Origine (fichier et paquet du lot) | SHA du lot | Corps |
|---|---|---|---|---|
${rows.join("\n")}

## Procédure

1. \`00-check-before.sql\` : chaque ligne \`ok = true\` (état attendu, registre à la version \`${after}\`) : ${fmt(after)}.
2. Les fichiers \`01-…\` à \`${String(list.length).padStart(2, "0")}-…\` dans l'ordre, un appel par fichier. Chacun est une transaction gardée : refusé s'il est
   rejoué ou si la migration précédente manque ; un refus ne garde rien et le même fichier peut être rejoué.
3. \`99-check-after.sql\` : chaque ligne \`ok = true\` (${fmt(until)}), puis \`tools/db/postflight-v11.sql\`, \`postflight-v13.sql\` et \`postflight-v131.sql\` : toutes vraies.

Empreintes mesurées sur une réplique vierge par \`tools/db/measure-v2-fingerprints.sh\` (\`tools/db/v2-fingerprints.json\`).
Répétition complète : \`pnpm run test:db\` (base jetable vierge) et \`tools/db/v2-replica-rehearsal.sh\` (réplique synthétique de l'état actuel).

## Retour arrière

Toujours dans l'ordre inverse des paquets (le dernier appliqué d'abord), migration par migration, avec les instructions « Rollback » de
l'en-tête de chaque fichier. Les en-têtes citent les **anciennes** versions des lots : se reporter au tableau de correspondance.
Les fonctions d'export \`private.titan_export_extras_v1\` sont des enveloppes successives : les retirer dans l'ordre inverse.

## Notes d'origine des paquets remplacés

${origins.join("\n") || "Aucun : ce paquet est écrit par la mission A2."}`;
    writeFileSync(join(ROOT, `supabase/release-${b.name}/README.md`), md);
    after = until;
  }
  console.log(`readmes: ${order.join(", ")}`);
  return order;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  if (cmd === "apply") apply();
  else if (cmd === "map") map();
  else if (cmd === "readmes") readmes();
  else if (cmd === "build") {
    // apply + bundles + readmes + map, in that order (fingerprints must have been measured first)
    const present = BUNDLES.filter((b) => b.migrations.every((m) => existsSync(MIG(fileOf(m))))).map((b) => b.name);
    for (const name of present) {
      execFileSync("node", ["tools/db/build-production-bundle.mjs", "--bundle", name], { cwd: ROOT, stdio: "inherit" });
    }
    readmes(); map();
  } else { console.error("usage: node tools/db/v2-canonical.mjs apply|build|map|readmes"); process.exit(2); }
}
