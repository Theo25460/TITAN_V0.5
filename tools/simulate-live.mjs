#!/usr/bin/env node
// TITAN LIVE balance simulation: seven athlete profiles over N weeks, with the exact settlement rule
// (TitanLiveWorld.settlePreview, mirror of titan_live_settle_v1) and the server effort curve (TitanEffort).
//   node tools/simulate-live.mjs [weeks]
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
require(join(ROOT, "js/core/sports-catalog.js"));
const Effort = require(join(ROOT, "js/core/effort.js"));
const Voies = require(join(ROOT, "js/core/live-voies.js"));
const World = require(join(ROOT, "js/core/live-world.js"));

/** A week = list of sessions [sport, minutes, rpe, missionsDone]. */
export const PROFILES = {
  coureur: { label: "Coureuse régulière (3 × 50 min)", week: [["running", 50, 6, 1], ["running", 40, 5, 1], ["running", 60, 6, 1]] },
  force: { label: "Pratiquant de musculation (3 × 60 min)", week: [["muscu_gym", 60, 7, 2], ["muscu_gym", 60, 7, 1], ["muscu_gym", 50, 7, 1]] },
  yoga: { label: "Yogi (4 × 40 min)", week: [["yoga", 40, 4, 1], ["yoga", 40, 4, 1], ["yoga", 40, 4, 1], ["yoga", 30, 3, 1]] },
  foot: { label: "Footballeur (2 × 90 min)", week: [["football", 90, 7, 1], ["football", 90, 7, 1]] },
  polyvalent: { label: "Polyvalente (4 sports, 4 × 45 min)", week: [["running", 45, 6, 1], ["muscu_gym", 45, 7, 1], ["yoga", 45, 4, 1], ["bouldering", 45, 6, 1]] },
  ultra: { label: "Ultra-traileur (1 × 300 min + 2 × 45)", week: [["trail", 300, 6, 1], ["running", 45, 5, 1], ["running", 45, 5, 1]] },
  debutant: { label: "Débutante (2 × 25 min de marche)", week: [["walking", 25, 4, 1], ["walking", 25, 4, 0]] },
};

export function simulate(profile, weeks = 12) {
  const wallet = { eclats: 0, essences: { souffle: 0, acier: 0, prisme: 0, ardeur: 0, seve: 0 } };
  const buildings = {};
  const voiesStats = {};
  let days = 0, minutes = 0, sessions = 0;
  for (let w = 0; w < weeks; w++) {
    const families = new Set();
    profile.week.forEach(([sport, min, rpe, missions], i) => {
      const conf = Voies.resolve(sport);
      const effort = Effort.effort({ sport, unit: "min", val: min, details: { duration: min, bio: { rpe } } });
      const mission = conf.missions.filter((m) => m.check.metric !== "declared" && m.verify !== "report").slice(0, missions).map((m) => ({ id: m.id }));
      const journal = { voie: conf.voie, intent: "atteindre", seed: `${w}-${i}-${sport}`, beats: 5, activeMin: min, missions: mission };
      const r = World.settlePreview(journal, { effortMinutes: effort.effortMinutes, essenceToday: 0, sessionsToday: 0, familySettledThisWeek: families.has(conf.family) });
      families.add(conf.family);
      wallet.essences[r.essence] += r.essenceAmount;
      wallet.eclats += r.eclats;
      const st = (voiesStats[conf.voie] ||= { sessions: 0, days: 0 });
      st.sessions++; st.days++;
      days++; minutes += min; sessions++;
    });
    // Greedy builder: raise whatever is affordable, own essence first.
    let built = true;
    while (built) {
      built = false;
      for (const id of Object.keys(World.BUILDINGS)) {
        const plan = World.buildPlan(id, buildings[id] || 0, wallet);
        if (!plan || !plan.affordable) continue;
        if (plan.essence) wallet.essences[plan.essence] -= plan.useEssence;
        wallet.eclats -= plan.useEclats;
        buildings[id] = (buildings[id] || 0) + 1;
        built = true;
      }
    }
  }
  const levels = Object.values(buildings).reduce((a, b) => a + b, 0);
  const earned = Object.values(wallet.essences).reduce((a, b) => a + b, 0) + wallet.eclats + spent(buildings);
  return { minutes, sessions, days, levels, buildings, earned, perHour: Math.round((earned / minutes) * 60), cordee: World.cordee({ days, voies: Object.keys(voiesStats).length }).unlocked,
    lands: Object.keys(voiesStats).reduce((n, v) => n + World.region(v, voiesStats[v]).lands, 0) };
}

function spent(buildings) {
  let n = 0;
  for (const level of Object.values(buildings)) for (let l = 0; l < level; l++) n += World.LEVEL_COST[l];
  return n;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const weeks = Number(process.argv[2]) || 12;
  console.log(`TITAN LIVE — ${weeks} semaines\n`);
  console.log("Profil".padEnd(42), "min".padStart(6), "séances".padStart(8), "ressources".padStart(11), "/h".padStart(5), "niveaux camp".padStart(13), "Cordée".padStart(7), "terres".padStart(7));
  for (const [id, p] of Object.entries(PROFILES)) {
    const r = simulate(p, weeks);
    console.log(p.label.padEnd(42), String(r.minutes).padStart(6), String(r.sessions).padStart(8), String(r.earned).padStart(11), String(r.perHour).padStart(5), String(r.levels).padStart(13), `${r.cordee}/10`.padStart(7), String(r.lands).padStart(7), id);
  }
}
