/* Preview only: twelve weeks of a plausible multisport athlete, deterministic (no Math.random). */
import type { TrainingLog } from "../src/core/types";
import { adventure as baseAdventure, archived, atelier, goals, profile as baseProfile, social } from "../test-fixtures/data";

const at = (daysAgo: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
};

let n = 0;
function session(daysAgo: number, sport: string, val: number, unit: string, minutes: number, details: TrainingLog["details"] = {}): TrainingLog {
  n += 1;
  const xp = Math.round(minutes * 10.5);
  return {
    id: `p0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    client_event_id: `p1000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    user_id: "owner-a",
    sport,
    category: "cardio",
    val,
    unit,
    xp,
    date: at(daysAgo, 7 + (n % 12)),
    details: { duration: minutes, ...details, credits: Math.floor(xp / 10) },
    revision: 1,
    syncStatus: "confirmed",
    created_at: at(daysAgo, 20),
  };
}

const list: TrainingLog[] = [];
// A runner who builds up over twelve weeks, lifts twice a week and climbs on weekends; one lighter week (week 5).
for (let week = 11; week >= 0; week -= 1) {
  const base = week * 7;
  const light = week === 5;
  const km = 6 + (11 - week) * 0.45;
  list.push(session(base + 1, "running", Math.round(km * 10) / 10, "km", Math.round(km * 5.6), { bio: { rpe: 6 } }));
  if (!light) list.push(session(base + 3, "muscu_gym", 2400 + (11 - week) * 120, "kg", 50, { exercises: [{ name: "Squat", kind: "weighted", setRows: [{ weight: 80 + (11 - week) * 2, reps: 5, rir: 2 }], sets: 3, reps: 5, totalReps: 15, volume: 1500, weight: 80 + (11 - week) * 2 }] }));
  if (!light && week % 2 === 0) list.push(session(base + 5, "bouldering", 90, "min", 90, { extras: { grade_system: "Fontainebleau bloc", max_done: week < 4 ? "6b" : "6a+", successful_routes: 6 } }));
  if (week % 3 === 1) list.push(session(base + 6, "swimming", 1500, "m", 38));
  if (week < 4) list.push(session(base + 4, "running", 12 + (3 - week), "km", 64 + (3 - week) * 5, { note: "Sortie longue" }));
}
list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

export const logs = list;
export { archived, atelier, goals, social };
export const profile = { ...baseProfile, username: "Camille", level: 7, xp: 1850, credits: 2380 };
export const adventure = { ...baseAdventure, level: 7, xp: 1850, next_level_xp: 6275, credits: 2380 };
