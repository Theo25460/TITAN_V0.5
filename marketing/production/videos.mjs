// Launch batch J1-J7 of the « Rallume le monde. Pour de vrai. » campaign. Every app shot is a REAL TITAN native screen
// (React Native preview bench of the repository) with the synthetic demo account; each clip says so on screen.
const A = "../../assets/renaissance/";
const R = "../../assets/ranks/";
const crests = `<div class="crests" data-in="0.3">${[["eclaireur", "Éclaireur", 1], ["explorateur", "Explorateur", 3], ["sentinelle", "Sentinelle", 6], ["gardien", "Gardien", 10]]
  .map(([f, n, l]) => `<figure><img src="${R}${f}-512.webp">${n}<br><span class="cy">niv. ${l}</span></figure>`).join("")}</div>`;
const worlds = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:44px" data-in="0.3">${["valley", "archipelago", "forge", "aurora"]
  .map((w) => `<div style="height:250px;border-radius:22px;background:url(${A}${w}.webp) center/cover"></div>`).join("")}</div>`;

export const VIDEOS = [
  {
    id: "J01-xp-ne-se-coche-pas", thumbAt: 1.4,
    spec: { scenes: [
      { kind: "title", d: 2.4, kicker: "Les applis « level up »", title: "Tu coches\nune case.\n+100 XP.", sub: "Facile. Et ça ne prouve rien." },
      { kind: "title", d: 2.0, kicker: "TITAN Ascent", title: "Ici, l'XP\nne se coche pas.", sub: "Elle se gagne." },
      { kind: "clip", d: 2.6, clip: "form-course", from: 0, rate: 0.5, kicker: "1 · Ta vraie séance", title: "Tu notes ce que\ntu as vraiment fait." },
      { kind: "clip", d: 3.6, clip: "xp-record", from: 9, kicker: "2 · Le serveur vérifie", title: "Séance confirmée.\nXP gagnée." },
      { kind: "clip", d: 3.4, clip: "balise", from: 70, kicker: "3 · Ton monde avance", title: "Une balise\nse rallume." },
      { kind: "end", d: 3.0, title: "Aucune XP ne s'achète.\nAucune ne se triche." },
    ] },
  },
  {
    id: "J02-pov-ta-seance-rallume-un-monde", thumbAt: 1.2,
    spec: { scenes: [
      { kind: "title", d: 2.2, bg: A + "valley.webp", align: "bottom", kicker: "POV", title: "Tu rentres\nde ta séance…" },
      { kind: "clip", d: 3.0, clip: "aventure", from: 0, kicker: "La vallée de l'Aube", title: "…et ton monde\nt'attendait." },
      { kind: "clip", d: 4.6, clip: "balise", from: 60, kicker: "Chapitre 3", title: "Balise allumée." },
      { kind: "title", d: 3.0, kicker: "4 mondes · 36 balises", title: "Chacune rallumée\npar tes jours de sport.", size: "s", extra: worlds },
      { kind: "end", d: 2.8 },
    ] },
  },
  {
    id: "J03-niveau-7-niveau-8", thumbAt: 6.5,
    spec: { scenes: [
      { kind: "title", d: 2.2, kicker: "Sentinelle · niveau 7", title: "Ce qu'il faut\npour passer\nniveau 8 :" },
      { kind: "title", d: 2.0, title: "Pas un achat.\nPas une case.", sub: "Des séances.", rule: false },
      { kind: "clip", d: 2.8, clip: "journal", from: 0, kicker: "Ton journal", title: "Course, muscu, escalade…\ntout compte.", size: "s" },
      { kind: "clip", d: 4.2, clip: "levelup", from: 6, kicker: "Confirmé par le serveur", title: "Niveau supérieur." },
      { kind: "title", d: 3.2, kicker: "Les rangs", title: "Et après Gardien ?", sub: "Trois rangs encore plus haut.", size: "m", extra: crests },
      { kind: "end", d: 2.8 },
    ] },
  },
  {
    id: "J04-est-ce-que-je-progresse", thumbAt: 3.6,
    spec: { scenes: [
      { kind: "title", d: 2.4, kicker: "Question honnête", title: "Tu t'entraînes\ndepuis des mois.", sub: "Mais tu progresses, vraiment ?" },
      { kind: "clip", d: 4.4, clip: "progres", from: 12, kicker: "Progrès · Tendances", title: "TITAN répond,\npreuves à l'appui." },
      { kind: "clip", d: 3.2, clip: "maitrise", from: 12, kicker: "Maîtrise", title: "Sport par sport." },
      { kind: "clip", d: 2.8, clip: "carriere", from: 6, kicker: "Carrière", title: "Depuis ta\npremière séance." },
      { kind: "end", d: 2.8, title: "Des réponses,\npas des graphiques." },
    ] },
  },
  {
    id: "J05-260-sports-meme-escalade", thumbAt: 6.0,
    spec: { scenes: [
      { kind: "title", d: 2.4, kicker: "Escalade, natation, padel…", title: "Ton appli\nne connaît pas\nton sport ?" },
      { kind: "clip", d: 3.2, clip: "sports", from: 0, kicker: "260 sports", title: "Chacun ses mesures." },
      { kind: "title", d: 3.4, kicker: "La règle TITAN", title: "1 h d'escalade\n= 1 h de course.", sub: "À intensité égale, même XP.\nTous les sports se valent.", size: "m" },
      { kind: "clip", d: 2.8, clip: "record", from: 0, kicker: "Séance", title: "Choisis. Note.\nC'est compté." },
      { kind: "end", d: 2.8 },
    ] },
  },
  {
    id: "J06-se-reposer-ne-coute-rien", thumbAt: 1.2,
    spec: { scenes: [
      { kind: "title", d: 2.4, kicker: "Le piège des séries", title: "3 jours ratés.\nSérie cassée.", sub: "Et tu lâches tout." },
      { kind: "title", d: 2.0, title: "Dans TITAN,\nil n'y a pas\nde série.", rule: false },
      { kind: "clip", d: 3.6, clip: "plan", from: 0, kicker: "Ta semaine type", title: "Une pause ?\nRien n'est perdu." },
      { kind: "clip", d: 3.2, clip: "qg", from: 0, kicker: "Ton QG", title: "Reviens quand\ntu veux." },
      { kind: "end", d: 2.8, title: "Le repos\nne coûte rien." },
    ] },
  },
  {
    id: "J07-quel-monde-en-premier", thumbAt: 2.8,
    spec: { scenes: [
      { kind: "title", d: 2.0, bg: A + "valley.webp", align: "bottom", kicker: "TITAN Ascent", title: "4 mondes\nà rallumer." },
      { kind: "title", d: 1.8, bg: A + "valley.webp", inset: A + "guardian-aube.webp", align: "bottom", kicker: "1 · Retrouver son élan", title: "La vallée\nde l'Aube", sub: "Le Veilleur de pierre veille", size: "m" },
      { kind: "title", d: 1.8, bg: A + "archipelago.webp", inset: A + "guardian-marees.webp", align: "bottom", kicker: "2 · Explorer à sa façon", title: "L'archipel\ndes Marées", sub: "La Gardienne des courants veille", size: "m" },
      { kind: "title", d: 1.8, bg: A + "forge.webp", inset: A + "guardian-forge.webp", align: "bottom", kicker: "3 · Affiner ses repères", title: "Les forges\nd'Obsidienne", sub: "L’Artisan de braise veille", size: "m" },
      { kind: "title", d: 1.8, bg: A + "aurora.webp", inset: A + "guardian-aurores.webp", align: "bottom", kicker: "4 · Construire sur la durée", title: "La citadelle\ndes Aurores", sub: "La Sentinelle du ciel veille", size: "m" },
      { kind: "clip", d: 2.8, clip: "monde-marees", from: 0, kicker: "Comment on avance", title: "Un jour de sport,\nune balise de plus." },
      { kind: "end", d: 3.0, title: "Lequel tu\nrallumes en premier ?", sub: "Dis-le en commentaire." },
    ] },
  },
];
