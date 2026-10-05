// Simulation de progression long terme avec les formules serveur de production (lues le 2026-10-05) :
// titan_submit_training_session (sport-integrity-v101), titan_apply_weekly_reward_cap (9600 XP / 1800 credits),
// titan_apply_progression_reward (bonus de niveau), titan_level_requirement = floor(2200 * L^1.18).
// Usage : node tools/simulate-progression.mjs — a relancer avant toute modification de l XP ou de l aventure.
const req = (L) => Math.max(1, Math.floor(2200 * Math.pow(Math.max(1, L), 1.18)));

function sessionXp({ unit, val, duration = 0, rpe = 5, profile }) {
  let base, soft, hard;
  if (profile === 'strength') { base = Math.sqrt(Math.min(val, 300000)) * 3.15 + Math.min(duration, 120) * 0.75; soft = 520; hard = 900; }
  else if (unit === 'km') {
    const perKm = { cycling: 19, hiking: 24, trail: 36 }[profile] ?? 32;
    base = Math.min(val, 250) * perKm + Math.min(duration, 600) * 0.55; soft = profile === 'trail' ? 620 : 560; hard = profile === 'trail' ? 1050 : 950;
  } else if (unit === 'min') { base = Math.min(val, 720) * (profile === 'mobility' ? 3.1 : 4.65); soft = profile === 'mobility' ? 260 : 460; hard = profile === 'mobility' ? 480 : 820; }
  else if (profile === 'combat' || profile === 'team') { base = Math.min(Math.max(duration, val), 240) * 4.2 + Math.min(val, 500) * 0.42; soft = 540; hard = 920; }
  else { base = Math.min(val, 10000) * 6 + Math.min(duration, 180) * 0.6; soft = 460; hard = 820; }
  let score = Math.max(0, base * Math.min(1.13, 1 + Math.max(rpe - 5, 0) * 0.025));
  if (score > soft) score = soft + Math.sqrt(score - soft) * 10;
  const xp = Math.max(1, Math.floor(Math.min(score, hard)));
  return { xp, credits: Math.min(90, Math.floor(xp * 0.16)) };
}

const S = {
  run5k: { unit: 'km', val: 5, duration: 30, profile: 'running' },
  run10k: { unit: 'km', val: 10, duration: 60, profile: 'running' },
  walk5k: { unit: 'km', val: 5, duration: 60, profile: 'running' }, // sport id "walking" does not match the hiking regex
  hike12k: { unit: 'km', val: 12, duration: 240, profile: 'hiking' },
  bike30k: { unit: 'km', val: 30, duration: 75, profile: 'cycling' },
  gym: { unit: 'kg', val: 6000, duration: 60, profile: 'strength' },
  team60: { unit: 'min', val: 60, duration: 60, profile: 'generic' },
  yoga45: { unit: 'min', val: 45, duration: 45, profile: 'mobility' },
  swim1500: { unit: 'm', val: 1500, duration: 40, profile: 'generic' },
  swim100: { unit: 'm', val: 100, duration: 5, profile: 'generic' }
};
console.log('XP par séance type (formule serveur):');
for (const [k, s] of Object.entries(S)) console.log(`  ${k.padEnd(9)} ${String(sessionXp(s).xp).padStart(4)} XP  ${String(sessionXp(s).credits).padStart(3)} cr`);

const personas = {
  'Débutant (1,5/sem)': { perWeek: 1.5, mix: ['walk5k', 'run5k', 'yoga45'] },
  'Régulier (3/sem)': { perWeek: 3, mix: ['run5k', 'gym', 'run10k'] },
  'Actif (5/sem)': { perWeek: 5, mix: ['run10k', 'gym', 'bike30k', 'gym', 'team60'] },
  'Multisport intensif (7/sem)': { perWeek: 7, mix: ['run10k', 'gym', 'bike30k', 'swim1500', 'hike12k', 'gym', 'team60'] }
};
const horizons = [[4, '1 mois'], [13, '3 mois'], [26, '6 mois'], [52, '1 an'], [104, '2 ans']];
const worldsDays = 21; // targets [1,2,2,2,3,2,3,3,3], one contribution per active day
console.log('\nNiveau atteint (XP serveur, plafond hebdo 9600 XP / 1800 crédits):');
for (const [name, p] of Object.entries(personas)) {
  let level = 1, xp = 0, credits = 200, i = 0, acc = 0, activeDays = 0;
  const out = [];
  for (let w = 1; w <= 104; w++) {
    acc += p.perWeek; let weekXp = 0, weekCr = 0;
    while (acc >= 1) {
      acc -= 1; activeDays++;
      const r = sessionXp(S[p.mix[i++ % p.mix.length]]);
      const gx = Math.min(r.xp, Math.max(0, 9600 - weekXp)); const gc = Math.min(r.credits, Math.max(0, 1800 - weekCr));
      weekXp += gx; weekCr += gc; xp += gx; credits += gc;
      while (xp >= req(level)) { xp -= req(level); level++; credits += Math.max(150, 180 + level * 35); }
    }
    const h = horizons.find(([wk]) => wk === w);
    if (h) out.push(`${h[1]}: niv ${level} (${credits} cr, mondes finis≈${Math.min(4, Math.floor(activeDays / worldsDays))})`);
  }
  console.log(`  ${name.padEnd(28)} ${out.join(' | ')}`);
}
let cum = 0; const milestones = [3, 6, 10, 15, 25, 40];
const cumAt = {}; for (let L = 1; L <= 40; L++) { if (milestones.includes(L)) cumAt[L] = cum; cum += req(L); }
console.log('\nXP cumulée pour atteindre les rangs:', Object.entries(cumAt).map(([L, v]) => `niv ${L}=${v}`).join(', '));
