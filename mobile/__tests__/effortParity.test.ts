/* Parity with the PRODUCTION server: expected values were returned by public.titan_effort_v300 on the production
   Supabase project (read-only call, 21/10/2026). The app's preview must never promise a different XP. */
import { EffortRules, Sports } from "../src/core";

const PRODUCTION: [string, string, string, number, object, { xp: number; minutes: number; estimated: boolean }][] = [
  ["run10k", "running", "km", 10, { duration: 55, bio: { rpe: 6 } }, { xp: 594, minutes: 55, estimated: false }],
  ["run_nodur", "running", "km", 8, {}, { xp: 480, minutes: 48, estimated: true }],
  ["swim", "swimming", "m", 1500, { duration: 40 }, { xp: 400, minutes: 40, estimated: false }],
  ["swim_nodur", "swimming", "m", 1500, {}, { xp: 375, minutes: 37.5, estimated: true }],
  ["muscu", "muscu_gym", "kg", 1000, { duration: 45, bio: { rpe: 7 } }, { xp: 522, minutes: 45, estimated: false }],
  ["muscu_sets", "muscu_gym", "kg", 1000, { exercises: [{ name: "Squat", setRows: [{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }] }] }, { xp: 150, minutes: 15, estimated: true }],
  ["long", "cycling", "km", 120, { duration: 300, bio: { rpe: 9 } }, { xp: 1782, minutes: 300, estimated: false }],
  ["reps", "bodyweight", "reps", 100, {}, { xp: 150, minutes: 15, estimated: true }],
  ["yoga", "yoga", "min", 60, { bio: { rpe: 2 } }, { xp: 456, minutes: 60, estimated: false }],
  ["bloc", "bouldering", "min", 90, { duration: 90, bio: { rpe: 8 } }, { xp: 1116, minutes: 90, estimated: false }],
  ["walk", "walking", "km", 6, {}, { xp: 720, minutes: 72, estimated: true }],
  ["skydive", "skydiving", "saut", 2, {}, { xp: 200, minutes: 20, estimated: true }],
];

test.each(PRODUCTION)("%s matches titan_effort_v300", (_label, sport, unit, val, details, expected) => {
  const e = EffortRules.effort({ sport, profile: Sports.profileOf(sport), unit, val, details });
  expect({ xp: e.xp, minutes: e.minutes, estimated: e.estimated }).toEqual(expected);
});
