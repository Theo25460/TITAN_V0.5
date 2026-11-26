#!/usr/bin/env node
// V1.8.5 — Rencontres entre clubs: sensitivity of the score rule by simulation, BEFORE the pilot opens.
// The score arithmetic is the shared module's (js/core/club-match.js), itself the mirror of 20261130104500_club_match.sql.
// Deterministic: a seeded generator (mulberry32), so two runs give the same tables.
//
//   node tools/simulate-club-match.mjs                 prints the tables
//   node tools/simulate-club-match.mjs --write         also writes docs/V185_SIMULATIONS.md
//   node tools/simulate-club-match.mjs --runs 2000     fewer draws (the tests use this)
//
// Behaviour model (synthetic, no real data): each participant has a propensity q = the probability of an active day on any day of the
// meeting; q is drawn around the club's mean completion (μ × perWeek / 7) with a spread of 0.12, clipped to [0, 1]. A club's "true"
// completion is μ. Two clubs with the same μ should get close results whatever their sizes; a single very active member should not
// carry their club; a withdrawal, an invalidated session or a small team should move the result by the published rule only.
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const M = require("../js/core/club-match.js");

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }
const clip = (x) => Math.max(0, Math.min(1, x));

/** One club: n participants for `weeks` weeks at `perWeek`, mean completion mu. Returns members {days, share, in}. */
export function drawClub(r, { n, mu, perWeek = 3, weeks = 1, spread = 0.12 }) {
  const D = 7 * weeks, s = M.share(perWeek, weeks), out = [];
  for (let i = 0; i < n; i++) {
    const q = clip((mu * perWeek) / 7 + spread * gauss(r));
    let days = 0;
    for (let d = 0; d < D; d++) if (r() < q) days++;
    out.push({ days, share: s, in: true });
  }
  return out;
}
/** Alternative rules, to show what the published rule avoids. */
const rawTotal = (members) => members.reduce((a, m) => a + m.days, 0);
const uncappedRate = (members) => { const t = members.reduce((a, m) => a + m.share, 0); return t ? Math.floor((100 * rawTotal(members)) / t) : null; };
const capRate = (members, k) => { const t = members.reduce((a, m) => a + m.share, 0); return t ? Math.floor((100 * members.reduce((a, m) => a + Math.min(m.days, k * m.share), 0)) / t) : null; };

const pct = (x) => `${Math.round(x * 100)} %`;
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1).replace(".", ",");

/** A. Clubs of different sizes with the same true completion. */
export function sizes(runs, seed = 185) {
  const r = rng(seed);
  const pairs = [[3, 3], [3, 30], [4, 12], [5, 50], [8, 80], [10, 10], [12, 150]];
  return pairs.map(([a, b]) => {
    let sumA = 0, sumB = 0, absDiff = 0, tie = 0, aWins = 0, bWins = 0, rawBig = 0, reached = 0;
    for (let i = 0; i < runs; i++) {
      const A = drawClub(r, { n: a, mu: 0.7 }), B = drawClub(r, { n: b, mu: 0.7 });
      const sa = M.side(A), sb = M.side(B);
      sumA += sa.rate; sumB += sb.rate; absDiff += Math.abs(sa.rate - sb.rate);
      const o = M.outcome(sa.rate, sb.rate);
      if (o === "tie") tie++; else if (o === "a") aWins++; else bWins++;
      if (rawTotal(B) > rawTotal(A)) rawBig++;
      if (M.common(sa.rate, sb.rate).reached) reached++;
    }
    return { a, b, meanA: sumA / runs, meanB: sumB / runs, meanAbsDiff: absDiff / runs, tie: tie / runs, aWins: aWins / runs, bWins: bWins / runs, rawBig: rawBig / runs, coopReached: reached / runs };
  });
}

/** B. One very active member: every day of the week, the others do nothing / half of their share. */
export function heavy() {
  const rows = [];
  for (const [n, others] of [[3, 0], [3, 1], [5, 0], [10, 0], [10, 1], [30, 1]]) {
    const s = M.share(3, 1);
    const members = [{ days: 7, share: s, in: true }, ...Array.from({ length: n - 1 }, () => ({ days: others, share: s, in: true }))];
    rows.push({ n, others, rate: M.side(members).rate, cap15: capRate(members, 1.5), uncapped: uncappedRate(members), heavyAlone: Math.floor((100 * M.counted(7, s)) / (n * s)) });
  }
  return rows;
}

/** C. A withdrawal: a member with no active day leaves on day k of 7 (5 participants, the 4 others at 2 days of their 3). */
export function withdrawal() {
  const rows = [];
  const s = M.share(3, 1);
  for (const k of [1, 3, 6]) {
    const base = Array.from({ length: 4 }, () => ({ days: 2, share: s, in: true }));
    const leftShare = M.share(3, k / 7);
    const rule = M.side([...base, { days: 0, share: leftShare, in: false }]).rate;
    const kept = M.side([...base, { days: 0, share: s, in: false }]).rate;
    const removed = M.side(base).rate;
    rows.push({ k, leftShare, rule, kept, removed, stayed: M.side([...base, { days: 0, share: s, in: true }]).rate });
  }
  return rows;
}

/** D. One session invalidated after the fact: one active day less for one participant (every participant at 2 days of 3). */
export function invalidated() {
  return [3, 5, 10, 30, 150].map((n) => {
    const s = M.share(3, 1);
    const members = Array.from({ length: n }, () => ({ days: 2, share: s, in: true }));
    const before = M.side(members).rate;
    members[0] = { ...members[0], days: 1 };
    const after = M.side(members).rate;
    return { n, before, after, drop: before - after };
  });
}

/** E. Small teams: the rate exists from 3 participants still in; a withdrawal that brings a club to 2 hides it and the common score. */
export function small() {
  const s = M.share(3, 1);
  const two = M.side([{ days: 3, share: s }, { days: 2, share: s }]);
  const threeLeft = M.side([{ days: 3, share: s }, { days: 2, share: s }, { days: 1, share: M.share(3, 3 / 7), in: false }]);
  const three = M.side([{ days: 3, share: s }, { days: 2, share: s }, { days: 1, share: s }]);
  const big = M.side(Array.from({ length: 20 }, () => ({ days: 2, share: s })));
  return { two, threeLeft, three, commonWithTwo: M.common(two.rate, big.rate), commonWithThree: M.common(three.rate, big.rate) };
}

/** F. Sensitivity of the cooperation goal: which common score separates clubs that held their pace from clubs that did not. */
export function goals(runs, seed = 1850) {
  const r = rng(seed);
  const mus = [0.5, 0.6, 0.7, 0.8, 0.9];
  const values = Object.fromEntries(mus.map((mu) => [mu, []]));
  for (const mu of mus) for (let i = 0; i < runs; i++) {
    const A = M.side(drawClub(r, { n: 4, mu })), B = M.side(drawClub(r, { n: 25, mu }));
    values[mu].push(M.common(A.rate, B.rate).value);
  }
  return [50, 60, 70, 80].map((goal) => ({ goal, reach: mus.map((mu) => values[mu].filter((v) => v >= goal).length / runs) }));
}
export function sensitivity(runs, seed = 18501) {
  const r = rng(seed);
  const rows = [];
  for (const [paceId, perWeek] of [["douce", 2], ["reguliere", 3], ["soutenue", 4]]) {
    for (const weeks of [1, 2]) {
      const reach = [];
      for (const mu of [0.5, 0.7, 0.9]) {
        let ok = 0;
        for (let i = 0; i < runs; i++) {
          const A = M.side(drawClub(r, { n: 4, mu, perWeek, weeks })), B = M.side(drawClub(r, { n: 25, mu, perWeek, weeks }));
          if (M.common(A.rate, B.rate).reached) ok++;
        }
        reach.push(ok / runs);
      }
      rows.push({ pace: paceId, weeks, reach });
    }
  }
  return rows;
}
/** G. The comparison: how often chance, not the clubs, decides — by tie margin, duration and size of the smaller club. */
export function margins(runs, seed = 18500) {
  const r = rng(seed);
  const out = [];
  for (const [small, weeks] of [[4, 1], [4, 2], [8, 2], [15, 2]]) {
    for (const margin of [0, 5, 10]) {
      let tieEqual = 0, rightWinner = 0, wrongWinner = 0;
      for (let i = 0; i < runs; i++) {
        const A = M.side(drawClub(r, { n: small, mu: 0.7, weeks })), B = M.side(drawClub(r, { n: 30, mu: 0.7, weeks }));
        if (Math.abs(A.rate - B.rate) < margin) tieEqual++;
        const C = M.side(drawClub(r, { n: small, mu: 0.85, weeks })), E = M.side(drawClub(r, { n: 30, mu: 0.65, weeks }));
        const gap = C.rate - E.rate;
        if (Math.abs(gap) >= margin) { if (gap > 0) rightWinner++; else wrongWinner++; }
      }
      out.push({ small, weeks, margin, tieEqual: tieEqual / runs, rightWinner: rightWinner / runs, wrongWinner: wrongWinner / runs });
    }
  }
  return out;
}

export function all(runs = 20000) {
  return { runs, sizes: sizes(runs), heavy: heavy(), withdrawal: withdrawal(), invalidated: invalidated(), small: small(), goals: goals(Math.round(runs / 4)), sensitivity: sensitivity(Math.round(runs / 4)), margins: margins(Math.round(runs / 2)) };
}

export function markdown(res) {
  const L = [];
  L.push("# V1.8.5 — Simulations du barème des rencontres entre clubs", "");
  L.push(`Généré par \`node tools/simulate-club-match.mjs --write\` (graine fixe, ${res.runs} tirages par ligne, données synthétiques uniquement). Le calcul`);
  L.push("est celui du module partagé `js/core/club-match.js`, miroir de la migration `20261130104500_club_match.sql`.", "");
  L.push("**Barème testé.** Jour actif = 12 minutes d’effort confirmées dans un jour de Paris (90 par jour au plus). Part de chacun = jours de");
  L.push("l’allure × semaines de participation (arrondie au-dessus). Chacun compte au plus sa part. Taux d’un club = jours comptés ÷ somme des");
  L.push("parts, en pour cent arrondi en dessous, seulement à partir de 3 participants encore là. Coopération : score commun = moyenne des deux");
  L.push(`taux, seuil ${M.RULE.goal} %. Rencontre comparative (fermée pendant le pilote, deux semaines seulement) : le meilleur taux l’emporte, égalité à moins de ${M.RULE.tieMargin} points.`, "");
  L.push("Modèle de comportement : chaque participant a une probabilité q d’être actif un jour donné, tirée autour de la réalisation moyenne du");
  L.push("club μ (q = μ × allure ÷ 7, écart 0,12). Allure régulière (3 jours par semaine), une semaine, sauf mention contraire.", "");

  L.push("## A. Tailles déséquilibrées, même taux de réalisation (μ = 0,7)", "");
  L.push(`| Club A | Club B | Taux moyen A | Taux moyen B | Écart moyen | Égalité (< 5 pts) | A devant | B devant | Total brut : B devant | Coopération : ${M.RULE.goal} % atteint |`);
  L.push("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const x of res.sizes) L.push(`| ${x.a} | ${x.b} | ${f1(x.meanA)} % | ${f1(x.meanB)} % | ${f1(x.meanAbsDiff)} pts | ${pct(x.tie)} | ${pct(x.aWins)} | ${pct(x.bWins)} | ${pct(x.rawBig)} | ${pct(x.coopReached)} |`);
  L.push("", "Lecture : à réalisation égale, les taux moyens restent à moins de 2 points l’un de l’autre quelle que soit la taille (la règle ne favorise");
  L.push("pas mécaniquement le gros club), alors qu’un total brut de jours donne la victoire au plus grand club presque à chaque fois. Le petit club");
  L.push("a des taux plus dispersés (écart moyen plus grand) : c’est le hasard d’une petite équipe, pas un avantage de taille ; la marge d’égalité l’absorbe en partie.", "");

  L.push("## B. Un membre très actif (7 jours sur 7, part de 3)", "");
  L.push("| Participants | Jours des autres | Taux publié (plafond = sa part) | Plafond à 1,5 × la part | Sans plafond | Part maximale d’un seul |");
  L.push("|---:|---:|---:|---:|---:|---:|");
  for (const x of res.heavy) L.push(`| ${x.n} | ${x.others} | ${x.rate} % | ${x.cap15} % | ${x.uncapped} % | ${x.heavyAlone} % |`);
  L.push("", "Lecture : avec le plafond à sa propre part, un seul membre ne fait jamais plus que 1 ÷ effectif du taux (33 % à trois) : il ne porte pas");
  L.push("son équipe. Sans plafond, le même membre ferait 77 % à lui seul dans un club de trois. Le plafond à 1,5 × de la saison de club (V1.8.4) laisserait");
  L.push("encore 50 % à un seul à trois : il n’est pas repris pour une rencontre entre clubs.", "");

  L.push("## C. Un retrait (5 participants, les 4 autres à 2 jours sur 3, le partant sans jour actif)", "");
  L.push("| Départ au jour | Part du partant (réduite au temps passé) | Taux publié | Si sa part restait entière | Si sa part disparaissait | S’il était resté sans rien faire |");
  L.push("|---:|---:|---:|---:|---:|---:|");
  for (const x of res.withdrawal) L.push(`| ${x.k} | ${x.leftShare} | ${x.rule} % | ${x.kept} % | ${x.removed} % | ${x.stayed} % |`);
  L.push("", "Lecture : la part du partant est ramenée au temps passé (arrondie au-dessus). Partir tôt pèse peu ; partir à la fin sans avoir rien fait");
  L.push("ne relève pas le taux (même valeur que s’il était resté) : faire partir les inactifs avant la fin ne rapporte rien. À 4 participants restants, le taux existe toujours.", "");

  L.push("## D. Une séance invalidée après coup (tous à 2 jours sur 3)", "");
  L.push("| Participants | Taux avant | Taux après | Baisse |");
  L.push("|---:|---:|---:|---:|");
  for (const x of res.invalidated) L.push(`| ${x.n} | ${x.before} % | ${x.after} % | ${x.drop} pts |`);
  L.push("", "Lecture : une séance retirée enlève un jour à son auteur et au plus 100 ÷ (effectif × part) points au taux de son club. Le taux suit");
  L.push("la règle publiée tant que la rencontre court ; le récapitulatif figé à la fin ne bouge plus.", "");

  L.push("## E. Petites équipes", "");
  const s = res.small;
  L.push(`- 2 participants : taux ${s.two.rate === null ? "non calculé" : s.two.rate + " %"} ; score commun ${s.commonWithTwo === null ? "non calculé" : s.commonWithTwo.value + " %"}.`);
  L.push(`- 3 participants dont un parti au jour 3 : ${s.threeLeft.participants} encore là, taux ${s.threeLeft.rate === null ? "non calculé" : s.threeLeft.rate + " %"} — s’il en reste moins de 3 à la fin, la rencontre se termine « sans résultat ».`);
  L.push(`- 3 participants : taux ${s.three.rate} % ; score commun avec un club de 20 à 66 % : ${s.commonWithThree.value} %.`, "");

  L.push("## F. Sensibilité du seuil commun (club de 4 avec club de 25, allure régulière, une semaine)", "");
  L.push("Part des rencontres où le score commun atteint le seuil, selon la réalisation moyenne μ des deux clubs.", "");
  L.push("| Seuil commun | μ = 0,5 | μ = 0,6 | μ = 0,7 | μ = 0,8 | μ = 0,9 |");
  L.push("|---:|---:|---:|---:|---:|---:|");
  for (const x of res.goals) L.push(`| ${x.goal} %${x.goal === M.RULE.goal ? " (retenu)" : ""} | ${x.reach.map(pct).join(" | ")} |`);
  L.push("", `Avec le seuil retenu (${M.RULE.goal} %), selon l’allure et la durée :`, "");
  L.push("| Allure | Semaines | μ = 0,5 | μ = 0,7 | μ = 0,9 |");
  L.push("|---|---:|---:|---:|---:|");
  for (const x of res.sensitivity) L.push(`| ${x.pace} | ${x.weeks} | ${x.reach.map(pct).join(" | ")} |`);
  L.push("", "Lecture : le plafond (personne ne compte au-delà de sa part) fait qu’un club à μ = 0,7 affiche environ 61 % en moyenne. Le seuil");
  L.push("retenu doit être atteint par la plupart des clubs qui tiennent l’essentiel de leur allure et rarement par des clubs à moitié : à 70 %, seule");
  L.push("une rencontre sur cinq réussirait à μ = 0,7 ; à 50 %, plus d’une sur trois réussirait à μ = 0,5. 60 % sépare « on l’a fait ensemble » de");
  L.push("« on n’y était pas » ; l’écart d’une allure ou d’une durée à l’autre vient du grain de la part (2 jours par semaine, c’est grossier).", "");

  L.push("## G. Rencontre comparative : le hasard ou les clubs ? (petit club contre club de 30)", "");
  L.push("Deux clubs équivalents (μ = 0,7 tous les deux), puis un petit club nettement meilleur (μ = 0,85) contre le club de 30 (μ = 0,65).", "");
  L.push("| Petit club | Semaines | Marge d’égalité | Équivalents : égalité | Meilleur club devant | Moins bon club devant |");
  L.push("|---:|---:|---:|---:|---:|---:|");
  for (const x of res.margins) L.push(`| ${x.small} | ${x.weeks} | ${x.margin} pts${x.margin === M.RULE.tieMargin ? " (retenue)" : ""} | ${pct(x.tieEqual)} | ${pct(x.rightWinner)} | ${pct(x.wrongWinner)} |`);
  L.push("", "Lecture : sur une semaine avec un club de 4, le classement de deux clubs dépend largement du hasard d’une petite équipe, même avec une");
  L.push("vraie différence de réalisation. Le score d’un club est juste en moyenne (A), mais une comparaison isolée est fragile : c’est la raison");
  L.push("pour laquelle la rencontre comparative reste fermée pendant le pilote, qui ne s’ouvre qu’en coopération. Si le pilote montre que les");
  L.push("membres comprennent leur score (mesure `private.titan_club_match_measure`), l’ouvrir sur deux semaines seulement (le serveur refuse une");
  L.push("rencontre comparative d’une semaine) et la proposer d’abord à des clubs d’au moins 8 participants (un mauvais vainqueur sur vingt).", "");
  return L.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf("--runs");
  const res = all(i > 0 ? Number(process.argv[i + 1]) : 20000);
  const md = markdown(res);
  if (process.argv.includes("--write")) writeFileSync(new URL("../docs/V185_SIMULATIONS.md", import.meta.url), md + "\n");
  console.log(md);
}
