// TITAN 300 — shared template for generated public pages (Ascension design).
import { readFileSync } from "node:fs";
import vm from "node:vm";

const sandbox = { window: {}, globalThis: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const file of ["js/app/icons.js", "js/renaissance-catalog.js", "js/core/effort.js"]) vm.runInContext(readFileSync(file, "utf8"), sandbox);
const W = sandbox.window;
export const icon = (n) => W.titanIcon(n);
const mark = () => W.titanMark("pub-mark");
const C = W.TitanCodex;
const E = W.TitanEffort || sandbox.TitanEffort;

const SITE = "https://titan-app.fr";
const V = "300.0";
const TODAY = "2026-10-05";
const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

/* ---------- Facts computed from the real rules ---------- */
const levelTotals = (() => {
  const at = {};
  let total = 0;
  for (let l = 1; l <= 40; l++) {
    at[l] = total;
    total += E.levelRequirement(l);
  }
  return at;
})();
const typical = E.effort({ sport: "running", profile: "endurance", unit: "km", val: 8, details: { duration: 45, bio: { rpe: 6 } } });
const weekXp = typical.xp * 3;
const monthsTo = (level) => levelTotals[level] / weekXp / 4.33;
const fmtMonths = (m) => (m < 1.5 ? "quelques semaines" : m < 12 ? `${Math.round(m)} mois` : `${(Math.round((m / 12) * 2) / 2).toLocaleString("fr-FR")} ans`);
const MASTERY = [
  ["Découverte", 0, 0],
  ["Initiation", 2, 2],
  ["Pratique", 6, 4],
  ["Régularité", 12, 8],
  ["Solidité", 20, 12],
  ["Expérience", 32, 20],
  ["Expertise", 50, 30],
  ["Maîtrise", 75, 45],
  ["Excellence", 110, 65],
  ["Référence", 160, 90],
];

/* ---------- Layout ---------- */
const NAV = [
  ["/fonctionnalites", "Fonctionnalités"],
  ["/niveaux-et-xp", "Progression"],
  ["/aventures-sportives", "Aventure"],
  ["/pour-les-coachs", "Coachs"],
  ["/tarifs", "Tarifs"],
];
const header = (route) => `<a class="asc-skip" href="#contenu">Aller au contenu</a><header class="pub-header"><div class="pub-wrap">
  <a class="pub-brand" href="/" aria-label="TITAN, accueil">${mark()}TITAN</a>
  <nav class="pub-nav" aria-label="Navigation principale">${NAV.map(([h, l]) => `<a href="${h}"${route === h ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
  <div class="pub-actions"><a class="asc-btn asc-btn-ghost pub-login" href="/login">Se connecter</a><a class="asc-btn asc-btn-primary" href="/onboarding">Commencer</a>
    <details class="pub-menu"><summary aria-label="Menu">${icon("menu")}</summary><nav aria-label="Menu">${NAV.map(([h, l]) => `<a href="${h}">${l}</a>`).join("")}<a href="/debuter-titan">Bien démarrer</a><a href="/comprendre-mes-donnees">Comprendre mes données</a><a href="/login">Se connecter</a></nav></details></div>
</div></header>`;
const footer = `<footer class="pub-footer"><div class="pub-wrap"><div class="pub-footer-cols">
  <div><a class="pub-brand" href="/">${mark()}TITAN</a><p class="pub-fine" style="margin-top:12px;max-width:34ch">Ton sport réel, une progression longue, visible et honnête. Fait en France.</p></div>
  <div><h2 class="pub-foot-title">Produit</h2><nav aria-label="Produit"><a href="/fonctionnalites">Fonctionnalités</a><a href="/tarifs">Gratuit et TITAN+</a><a href="/sports">Les sports</a><a href="/pour-les-coachs">Pour les coachs</a><a href="/changelog">Nouveautés</a></nav></div>
  <div><h2 class="pub-foot-title">Comprendre</h2><nav aria-label="Comprendre"><a href="/debuter-titan">Bien démarrer</a><a href="/niveaux-et-xp">Niveaux et XP</a><a href="/aventures-sportives">L’aventure</a><a href="/comprendre-mes-donnees">Mes données</a></nav></div>
  <div><h2 class="pub-foot-title">Par sport</h2><nav aria-label="Par sport"><a href="/journal-course-a-pied">Course à pied</a><a href="/carnet-musculation">Musculation</a><a href="/suivi-escalade">Escalade</a><a href="/suivi-sportif">Multisport</a></nav></div>
  <div><h2 class="pub-foot-title">Confiance</h2><nav aria-label="Confiance"><a href="/legal_privacy">Confidentialité</a><a href="/legal_cgu">Conditions</a><a href="/legal_mentions">Mentions légales</a><a href="/service">Aide et contact</a></nav></div>
</div><small>© 2026 TITAN · Sans publicité · Paiements TITAN+ opérés par Paddle</small></div></footer>`;

// Each scrollable table is a focusable region with its own name (WCAG: keyboard access, unique landmarks).
const numberTables = (html) => {
  let n = 0;
  return html.replace(/aria-label="Tableau"/g, () => `aria-label="Tableau ${++n}"`);
};

function page({ route, title, description, image = "valley", body, schema = [], indexable = true }) {
  const url = `${SITE}${route}`;
  const graph = [
    { "@type": "Organization", "@id": `${SITE}/#organization`, name: "TITAN", url: `${SITE}/`, logo: `${SITE}/image/logo-192.png` },
    { "@type": "WebPage", "@id": `${url}#page`, url, name: title, description, inLanguage: "fr-FR", isPartOf: { "@type": "WebSite", name: "TITAN", url: `${SITE}/` } },
    ...schema,
  ];
  return `<!doctype html>
<html lang="fr" class="asc-root">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${indexable ? "index, follow, max-image-preview:large" : "noindex, nofollow"}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#05070a">
<meta property="og:site_name" content="TITAN"><meta property="og:type" content="website"><meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/image/og-titan.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="TITAN — Ton sport réel. Une progression qui dure.">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${SITE}/image/og-titan.jpg">
<link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/image/apple-touch-icon.png"><link rel="manifest" href="/manifest.json">
<link rel="preload" href="/css/fonts/archivo-latin-variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/ascension.css?v=${V}"><link rel="stylesheet" href="/css/public.css?v=300.1">
<script src="/js/pwa.js?v=${V}" defer></script>
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replaceAll("<", "\\u003c")}</script>
</head>
<body class="asc pub">${header(route)}<main id="contenu">${numberTables(body)}</main>${footer}</body>
</html>
`;
}

const faq = (items, title = "Les questions qu’on nous pose") => ({
  html: `<section class="pub-section"><div class="pub-wrap"><div class="pub-head"><p class="pub-eyebrow">FAQ</p><h2>${title}</h2></div><div class="pub-faq">${items.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join("")}</div></div></section>`,
  schema: { "@type": "FAQPage", mainEntity: items.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a.replace(/<[^>]+>/g, "") } })) },
});
const finalCta = (image = "archipelago") => `<section class="pub-section"><div class="pub-wrap"><div class="pub-final"><img src="/assets/renaissance/${image}-small.webp" width="800" height="450" alt="" loading="lazy" decoding="async">
  <p class="pub-eyebrow">Deux minutes pour commencer</p><h2>Ta prochaine séance<br>compte déjà.</h2><p class="pub-lead">Choisis tes sports et ton rythme, enregistre ta première séance. Sans compte pour essayer, sans carte bancaire pour rester.</p>
  <div class="pub-cta"><a class="asc-btn asc-btn-primary" href="/onboarding">Commencer ${icon("arrow")}</a><a class="asc-btn asc-btn-secondary" href="/login">J’ai un compte</a></div></div></div></section>`;

const cards = (list, cols = 3) => `<div class="pub-grid cols-${cols}">${list.map(([ic, t, d, link]) => `<${link ? `a href="${link}"` : "article"} class="pub-card pub-feature">${icon(ic)}<h3>${t}</h3><p>${d}</p></${link ? "a" : "article"}>`).join("")}</div>`;


export { W, C, E, SITE, V, TODAY, esc, levelTotals, typical, weekXp, monthsTo, fmtMonths, MASTERY, NAV, header, footer, page, faq, finalCta, cards, mark };
