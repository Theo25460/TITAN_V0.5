/* Realistic account data (shapes copied from the production RPC/table contracts) for screen rendering tests. */
import type { AdventureSnapshot, Goal, Profile, TrainingLog } from "../src/core/types";

const day = (n: number, h = 18) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};
let i = 0;
const log = (n: number, sport: string, val: number, unit: string, details: TrainingLog["details"], xp = 300): TrainingLog => ({
  id: `00000000-0000-4000-8000-${String(++i).padStart(12, "0")}`,
  client_event_id: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  user_id: "owner-a",
  sport,
  category: "cardio",
  val,
  unit,
  xp,
  date: day(n),
  details: { ...details, credits: Math.floor(xp / 10) },
  revision: 1,
  syncStatus: "confirmed",
  created_at: day(n),
});

export const logs: TrainingLog[] = [
  log(0, "running", 10, "km", { duration: 55, val2: 55, bio: { rpe: 6 }, note: "Belle sortie" }, 594),
  log(1, "muscu_gym", 1000, "kg", { duration: 45, exercises: [{ name: "Squat", kind: "weighted", setRows: [{ weight: 100, reps: 5, rir: 2 }, { weight: 100, reps: 5, rir: null }], sets: 2, reps: 5, totalReps: 10, volume: 1000, weight: 100 }] }, 450),
  log(3, "bouldering", 90, "min", { duration: 90, extras: { climbing_discipline: "Bloc", location: "Salle", grade_system: "Fontainebleau bloc", attempts: 8, successful_routes: 5, max_done: "6b+" } }, 900),
  log(8, "swimming", 1500, "m", { duration: 40, extras: { pool: "25" } }, 400),
  log(15, "running", 5, "km", { duration: 26 }, 260),
  log(40, "yoga", 30, "min", { historical: true }, 0),
];
export const archived: TrainingLog[] = [{ ...log(20, "walking", 4, "km", {}), archived_at: day(19) }];

export const profile: Profile = {
  id: "owner-a",
  username: "Athlète Test",
  level: 4,
  xp: 820,
  credits: 1240,
  avatar: "avatar_1.png",
  friend_code: "TN-ABCD",
  game_state: { user: { weeklyGoalSessions: 3, favoriteSports: ["running", "muscu_gym"], onboardedAt: day(30), schedule: { monday: { sport: "running", minutes: 45 } } }, meta: {} },
  privacy: { publicProfile: true, showStats: false, socialPresence: false, friendRankings: false },
  is_elite: false,
  is_suspended: false,
  state_version: 12,
  appearance: { frame: "frame-neon" },
  last_week_id: "",
};

export const goals: Goal[] = [
  { id: "g1", user_id: "owner-a", title: "Un mois en mouvement", metric: "days", sport: null, target: 12, start_date: day(10).slice(0, 10), end_date: day(-18).slice(0, 10), archived_at: null, revision: 1 },
  { id: "g2", user_id: "owner-a", title: "Mes 100 km", metric: "distance", sport: "running", target: 100, start_date: day(10).slice(0, 10), end_date: day(-20).slice(0, 10), archived_at: day(2), revision: 2 },
];

export const adventure: AdventureSnapshot = {
  version: 2,
  owner: "owner-a",
  generated_at: day(0),
  level: 4,
  xp: 820,
  credits: 1240,
  next_level_xp: 3027,
  plus: false,
  avatar: "keeper",
  selected_world: "aube",
  revision: 5,
  campaigns: [
    { id: "aube", tier: "free", chapter: 3, route: "rhythm", started_at: day(2), completed_at: null, target: 2, effort_target: 0, evidence: { days: 2, effort: 120, source_ids: [] } },
    { id: "aurores", tier: "plus", chapter: 0, route: "rhythm", started_at: null, completed_at: null, target: 0, effort_target: 0, evidence: { days: 0, effort: 0, source_ids: [] } },
    { id: "forge", tier: "plus", chapter: 0, route: "rhythm", started_at: null, completed_at: null, target: 0, effort_target: 0, evidence: { days: 0, effort: 0, source_ids: [] } },
    { id: "marees", tier: "free", chapter: 9, route: "journal", started_at: day(5), completed_at: null, target: 3, effort_target: 150, evidence: { days: 1, effort: 60, source_ids: [] } },
  ],
  rewards: [
    { world: "aube", chapter: 1, earned_at: day(9) },
    { world: "aube", chapter: 2, earned_at: day(4) },
  ],
};

export const atelier = {
  credits: 1240,
  level: 4,
  week_credits: 120,
  week_credit_cap: 960,
  plus: { active: false },
  appearance: { frame: "frame-neon" },
  items: [
    { id: "cos_frame_standard", cosmetic: "frame-standard", slot: "frame", unlock: "default", name: "Portrait nu", description: null, price: 0, min_level: 1, owned: true },
    { id: "cos_frame_neon", cosmetic: "frame-neon", slot: "frame", unlock: "credits", name: "Cadre Néon", description: null, price: 450, min_level: 1, owned: true },
    { id: "cos_frame_summit", cosmetic: "frame-summit", slot: "frame", unlock: "credits", name: "Cadre Cime", description: null, price: 1400, min_level: 1, owned: false },
    { id: "cos_frame_titan", cosmetic: "frame-titan", slot: "frame", unlock: "rank", name: "Cadre Titan", description: null, price: 0, min_level: 25, owned: false },
    { id: "cos_frame_aegis", cosmetic: "frame-aegis", slot: "frame", unlock: "plus", name: "Cadre Aegis", description: null, price: 0, min_level: 1, owned: false },
    { id: "cos_map_mist", cosmetic: "map-mist", slot: "map", unlock: "credits", name: "Brume", description: null, price: 600, min_level: 1, owned: false },
    { id: "cos_card_chalk", cosmetic: "card-chalk", slot: "card", unlock: "credits", name: "Craie", description: null, price: 400, min_level: 1, owned: false },
  ],
};

export const social = {
  me: { id: "owner-a", friend_code: "TN-ABCD", findable: true },
  friends: [
    { id: "f1", name: "Léa", avatar: "scout", level: 7, week_days: 3, last_active: day(1).slice(0, 10) },
    { id: "f2", name: "Max", avatar: "ranger", level: null, week_days: null, last_active: null },
  ],
  requests_in: [{ id: "r1", name: "Sam", avatar: "keeper", at: day(0) }],
  requests_out: [{ id: "r2", name: "Noé", at: day(1) }],
  moments: [
    { id: "m1", kind: "session", title: "Course à pied · 10 km", detail: "55 min d’effort", sport: "running", created_at: day(0), mine: true, visibility: "friends", author: { id: "owner-a", name: "Athlète Test", avatar: "keeper" }, cheers: 2, cheered: false },
    { id: "m2", kind: "record", title: "Squat 100 kg", detail: null, sport: "muscu_gym", created_at: day(1), mine: false, visibility: "friends", author: { id: "f1", name: "Léa", avatar: "scout" }, cheers: 1, cheered: true },
  ],
  challenges: [
    { id: "c1", title: "Semaine active", metric: "active_days", sport: null, target: 4, starts_at: day(2), ends_at: day(-5), mine: true, my_status: "joined", status: "active", members: [{ id: "owner-a", name: "Athlète Test", status: "joined", progress: 3 }, { id: "f1", name: "Léa", status: "joined", progress: 2 }] },
    { id: "c2", title: "Défi minutes", metric: "effort_minutes", sport: null, target: 300, starts_at: day(1), ends_at: day(-6), mine: false, my_status: "invited", status: "active", members: [] },
  ],
  expedition: { id: "e1", title: "La traversée", story: "Ensemble vers le col.", guardian: "Le Veilleur", starts_at: day(5), ends_at: day(-9), status: "active", collective_goal: 20000, collective_minutes: 6400, participants: 31, daily_cap: 90, personal_days: 5, personal_minutes: 200, reward_title: "Passeur", me: { joined: false } },
  guild: { guild_id: "g", week_start: day(2), target: 600, minutes: 340, members: [{ id: "owner-a", name: "Athlète Test", role: "owner", minutes: 200, days: 3 }, { id: "f1", name: "Léa", role: "member", minutes: 140, days: 2 }] },
};
