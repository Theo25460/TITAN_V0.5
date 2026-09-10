import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const version = '100.0';

const acquisitionPages = {
  'fonctionnalites.html': {
    title: 'Fonctionnalités TITAN OS Sport',
    description: "Découvre le journal multisport, les statistiques, les objectifs, l'XP et les outils de progression de TITAN OS Sport.",
    eyebrow: 'Toutes les fonctionnalités',
    h1: 'Un seul espace pour suivre, comprendre et continuer.',
    lead: "TITAN OS Sport rassemble ton journal d’entraînement, tes tendances et une progression motivante. Tu commences avec l’essentiel, puis tu explores les fonctions avancées quand elles deviennent utiles.",
    proof: ['Plus de 260 sports', 'Gratuit pour commencer', 'Données privées par défaut'],
    visualTitle: 'Ton espace sportif',
    visualCards: [
      ['Aujourd’hui', 'Une prochaine action claire', '72%'],
      ['Journal', 'Toutes tes séances au même endroit', '84%'],
      ['Progrès', 'Des tendances faciles à relire', '64%'],
    ],
    sectionTitle: 'Les fonctions qui servent vraiment ta pratique.',
    sectionLead: "Chaque module répond à une question simple : qu’ai-je fait, comment j’évolue et quelle petite étape choisir ensuite ?",
    cards: [
      ['01', 'Enregistrer une séance', 'Choisis ton sport puis renseigne seulement les mesures pertinentes : durée, distance, séries, répétitions, intensité ou ressenti.'],
      ['02', 'Retrouver ton journal', 'Filtre tes séances, passe de la liste au calendrier et relis les informations importantes sans fouiller dans plusieurs écrans.'],
      ['03', 'Lire ta progression', 'Compare tes périodes, observe ta régularité et suis les métriques qui ont du sens pour chacun de tes sports.'],
      ['04', 'Garder la motivation', 'XP, objectifs courts, trophées et aventure rendent les efforts visibles sans remplacer le plaisir de pratiquer.'],
      ['05', 'Adapter tes sports', 'Course, force, natation, combat, sports collectifs ou mobilité : la saisie change avec la discipline.'],
      ['06', 'Rester maître de tes données', 'Ton historique personnel n’est pas public par défaut. Tu choisis les fonctions sociales que tu souhaites utiliser.'],
    ],
    splitTitle: 'Une application complète sans mur de complexité.',
    splitCopy: [
      "Le parcours principal tient en cinq destinations : Aujourd’hui, Enregistrer, Journal, Progrès et Profil. Les fonctions sociales, l’aventure et la personnalisation restent disponibles au second niveau.",
      "Cette organisation permet de noter une séance rapidement, même sur mobile, tout en conservant de la profondeur pour les personnes qui aiment analyser leur pratique sur plusieurs mois.",
    ],
    checklist: ['Saisie rapide et adaptée au sport', 'Journal en liste ou calendrier', 'Périodes de 7 à 365 jours', 'Objectifs et progression optionnels', 'Utilisable dans un navigateur et en PWA'],
    faq: [
      ['Faut-il utiliser toutes les fonctionnalités ?', 'Non. Tu peux simplement enregistrer tes séances et consulter ton journal. Les autres modules restent optionnels.'],
      ['Est-ce adapté à plusieurs sports ?', 'Oui. Le même journal peut accueillir plus de 260 disciplines avec des mesures adaptées à chaque pratique.'],
      ['La version gratuite suffit-elle pour commencer ?', 'Oui. Le suivi essentiel, le journal, le catalogue multisport et la progression de base sont accessibles gratuitement.'],
    ],
  },
  'suivi-sportif.html': {
    title: 'Suivi sportif multisport avec TITAN OS Sport',
    description: "Suis plus de 260 sports dans un même espace avec une saisie adaptée, un historique personnel et des tendances faciles à comprendre.",
    eyebrow: 'Suivi sportif multisport',
    h1: 'Tous tes sports. Un journal qui reste simple.',
    lead: "Tu cours, tu fais de la musculation, du padel, de la natation ou plusieurs activités dans la même semaine ? TITAN OS Sport centralise tout sans imposer les mêmes données à chaque discipline.",
    proof: ['260+ disciplines', 'Mesures adaptées', 'Historique unifié'],
    visualTitle: 'Semaine multisport',
    visualCards: [
      ['Course à pied', 'Distance · durée · allure', '78%'],
      ['Musculation', 'Séries · répétitions · charge', '66%'],
      ['Natation', 'Distance · nage · sensations', '52%'],
    ],
    sectionTitle: 'Le sport choisit les données, pas l’inverse.',
    sectionLead: "Une bonne saisie doit être assez précise pour devenir utile, mais assez courte pour ne pas freiner l’envie de bouger.",
    cards: [
      ['01', 'Trouve ta discipline', 'Recherche par nom, alias, famille ou terrain et retrouve rapidement le bon profil de suivi.'],
      ['02', 'Note ce qui compte', 'Les champs proposés s’adaptent : distance et allure, séries et charge, sets et score, essais, dénivelé ou simple durée.'],
      ['03', 'Ajoute ton ressenti', 'Une note courte et une intensité perçue complètent les chiffres quand le contexte mérite d’être conservé.'],
      ['04', 'Retrouve tes habitudes', 'Tes sports récents et favoris réduisent les étapes pour les séances que tu répètes souvent.'],
      ['05', 'Compare sans mélanger', 'Les analyses par sport évitent de comparer des kilomètres de course à des séries de force qui ne racontent pas la même chose.'],
      ['06', 'Continue même simplement', 'Une durée et un sport peuvent suffire. Les mesures détaillées restent facultatives lorsqu’elles ne sont pas pertinentes.'],
    ],
    splitTitle: 'Pensé pour les semaines réelles, pas pour une pratique parfaite.',
    splitCopy: [
      "Une semaine peut contenir une sortie longue, une séance courte de mobilité et un entraînement collectif. TITAN conserve chaque effort dans un même calendrier tout en respectant ses particularités.",
      "Le résultat : moins de fichiers dispersés, moins de catégories génériques et une vue d’ensemble plus fidèle à ta pratique.",
    ],
    checklist: ['Endurance, force, combat et mobilité', 'Sports collectifs, raquette, eau et glisse', 'Disciplines de précision et pratiques de niche', 'Saisie manuelle rapide', 'Détails spécifiques facultatifs'],
    faq: [
      ['Quels sports peut-on suivre ?', 'Le catalogue couvre plus de 260 disciplines, des grands sports aux pratiques de niche.'],
      ['Dois-je remplir tous les champs ?', 'Non. Commence avec le sport, la durée et les informations que tu connais. Les détails servent à enrichir les tendances, pas à bloquer la saisie.'],
      ['Puis-je pratiquer plusieurs sports ?', 'Oui. Le journal et le calendrier réunissent toutes tes séances, tandis que les analyses peuvent rester séparées par discipline.'],
    ],
  },
  'journal-entrainement.html': {
    title: "Journal d'entraînement sportif — TITAN OS Sport",
    description: "Tiens un journal d'entraînement clair : séances, calendrier, filtres, notes et mesures adaptées à chaque sport.",
    eyebrow: "Journal d’entraînement",
    h1: 'Chaque séance devient un repère utile.',
    lead: "Un journal sportif n’a pas besoin d’être compliqué. Note ton effort en quelques instants, retrouve-le par date ou par sport et relis ta régularité sans transformer ta pratique en tableau administratif.",
    proof: ['Liste et calendrier', 'Recherche et filtres', 'Détail par séance'],
    visualTitle: 'Ton journal de la semaine',
    visualCards: [
      ['Mardi', 'Course · 42 min · 7,3 km', '70%'],
      ['Jeudi', 'Force · 5 exercices · 3 840 kg', '82%'],
      ['Samedi', 'Vélo · 1 h 18 · 31 km', '58%'],
    ],
    sectionTitle: 'Une mémoire sportive qui aide à décider.',
    sectionLead: "Le journal ne sert pas seulement à collectionner des chiffres. Il permet de comprendre ce que tu fais vraiment sur plusieurs semaines.",
    cards: [
      ['01', 'Saisir rapidement', 'Date et heure sont proposées automatiquement. Tes sports récents réduisent encore le nombre d’étapes.'],
      ['02', 'Garder le contexte', 'Ajoute une intensité, un ressenti ou une note courte pour expliquer ce que les chiffres seuls ne montrent pas.'],
      ['03', 'Relire par période', 'Le calendrier rend visibles les semaines régulières, les pauses et la reprise sans jugement inutile.'],
      ['04', 'Filtrer facilement', 'Recherche un sport, un mois, une intensité ou un mot de ta note pour retrouver une séance précise.'],
      ['05', 'Suivre la force série par série', 'Pour la musculation, conserve poids, répétitions et RIR afin de calculer un volume crédible.'],
      ['06', 'Dupliquer ce qui fonctionne', 'Repars d’une séance ou d’une routine récente lorsque tu souhaites répéter une structure connue.'],
    ],
    splitTitle: 'Que noter dans un journal sportif ?',
    splitCopy: [
      "Commence par les faits les plus simples : discipline, durée et date. Ajoute ensuite la distance, la charge, les séries ou le score uniquement si ces données t’aident à relire ta pratique.",
      "Une note comme « jambes lourdes » ou « bonne maîtrise technique » peut être plus utile qu’une longue liste de mesures. La meilleure donnée est celle que tu peux comprendre plus tard.",
    ],
    checklist: ['Sport, date et durée', 'Distance, charge, score ou dénivelé', 'Intensité perçue', 'Ressenti et note courte', 'Détails techniques facultatifs'],
    faq: [
      ['Combien de temps faut-il pour noter une séance ?', 'Pour une saisie simple, le sport, la date, la durée et une mesure principale suffisent. Les détails sont optionnels.'],
      ['Pourquoi utiliser un calendrier ?', 'Il permet de voir rapidement la régularité, les périodes chargées et les reprises sans additionner chaque séance à la main.'],
      ['Peut-on importer un parcours GPX ?', 'Une zone GPX est prévue pour les séances qui bénéficient d’un tracé, tout en conservant une saisie manuelle accessible à tous les sports.'],
    ],
  },
  'progression-sportive.html': {
    title: 'Mesurer sa progression sportive — TITAN OS Sport',
    description: "Analyse ta progression sportive avec des tendances par période, la régularité et des métriques adaptées à chaque discipline.",
    eyebrow: 'Progression sportive',
    h1: 'Comprends la tendance, pas seulement le dernier chiffre.',
    lead: "La progression n’est pas toujours linéaire. TITAN OS Sport rassemble séances, minutes, distance, volume et régularité pour rendre les évolutions lisibles sans inventer de diagnostic.",
    proof: ['Périodes comparables', 'Métriques par sport', 'Aucun diagnostic médical'],
    visualTitle: 'Tendance sur 30 jours',
    visualCards: [
      ['Régularité', '3 semaines actives sur 4', '75%'],
      ['Temps de pratique', '+ 9 % par rapport à la période précédente', '62%'],
      ['Sport dominant', 'Course à pied · 46 % du temps', '46%'],
    ],
    sectionTitle: 'Des indicateurs que tu peux expliquer.',
    sectionLead: "Chaque vue doit se terminer par une lecture simple : ce qui augmente, ce qui reste stable et ce qui mérite du recul.",
    cards: [
      ['01', 'Choisir la bonne période', 'Observe 7, 30, 90 ou 365 jours pour éviter de tirer une conclusion d’une seule bonne ou mauvaise séance.'],
      ['02', 'Lire la régularité', 'Le nombre de semaines actives montre la continuité sans exiger un entraînement quotidien.'],
      ['03', 'Comparer les minutes', 'Le temps de pratique permet une vue commune lorsque tu alternes plusieurs sports.'],
      ['04', 'Garder les métriques propres au sport', 'Distance, volume de force ou résultats techniques restent séparés lorsqu’une comparaison globale serait trompeuse.'],
      ['05', 'Repérer les changements', 'Une hausse progressive, un plateau ou une rupture deviennent visibles dans la durée.'],
      ['06', 'Conserver du contexte', 'Le ressenti et la récupération sont présentés comme des repères personnels, jamais comme un avis médical.'],
    ],
    splitTitle: 'Progresser, ce n’est pas battre un record chaque semaine.',
    splitCopy: [
      "Une pratique durable alterne effort, récupération, semaines denses et périodes plus calmes. C’est pourquoi TITAN privilégie les tendances et la régularité plutôt qu’un score isolé.",
      "Les niveaux et l’XP rendent le chemin visible, mais les indicateurs sportifs restent au premier plan : séances, temps de pratique, sport dominant et évolution des mesures utiles.",
    ],
    checklist: ['Séances et minutes pratiquées', 'Régularité hebdomadaire', 'Distance et volume lorsque pertinent', 'Comparaison de périodes', 'Repères personnels non médicaux'],
    faq: [
      ['Quelle période faut-il regarder ?', 'Sept jours servent à relire la semaine. Trente à quatre-vingt-dix jours donnent une tendance plus stable. Un an aide à prendre du recul sur les saisons.'],
      ['L’XP mesure-t-elle ma condition physique ?', 'Non. L’XP représente une progression dans TITAN et soutient la motivation. Elle ne remplace pas des mesures sportives ni un avis professionnel.'],
      ['TITAN donne-t-il des conseils médicaux ?', 'Non. Les informations de forme et de récupération sont des repères personnels non diagnostiques. En cas de doute, consulte un professionnel qualifié.'],
    ],
  },
  'motivation-sport.html': {
    title: 'Motivation sportive et gamification — TITAN OS Sport',
    description: "Entretiens ta motivation sportive avec une progression par XP, des objectifs courts, des trophées et une aventure optionnelle sans pay-to-win.",
    eyebrow: 'Motivation sportive',
    h1: 'Rends la régularité visible sans oublier le plaisir.',
    lead: "TITAN OS Sport emprunte au jeu ses meilleurs repères — niveaux, objectifs, trophées et aventure — pour valoriser les efforts réels. La pratique reste au centre et les fonctions ludiques restent optionnelles.",
    proof: ['Progression équitable', 'Aventure optionnelle', 'Aucun avantage acheté'],
    visualTitle: 'Progression de la semaine',
    visualCards: [
      ['Objectif court', '3 séances cette semaine', '67%'],
      ['Niveau', 'Chaque effort utile nourrit ta progression', '74%'],
      ['Trophée en vue', 'Deux semaines régulières', '88%'],
    ],
    sectionTitle: 'La gamification au service de l’habitude.',
    sectionLead: "Le but n’est pas de jouer à la place de faire du sport. Le but est de rendre chaque étape assez visible pour donner envie de revenir.",
    cards: [
      ['01', 'Gagner de l’XP en pratiquant', 'Les séances réelles alimentent ton niveau. Les limites hebdomadaires évitent de pousser à l’excès pour gagner plus.'],
      ['02', 'Choisir des objectifs courts', 'Une mission claire pour la semaine est plus facile à comprendre qu’une liste infinie de défis.'],
      ['03', 'Célébrer les étapes', 'Trophées, séries et records personnels rendent les progrès mémorables sans comparer ta valeur à celle des autres.'],
      ['04', 'Explorer une aventure', 'Les efforts sportifs peuvent débloquer des combats et une campagne, mais ce mode reste séparé du journal principal.'],
      ['05', 'Personnaliser sans acheter de puissance', 'Les offres payantes ajoutent surtout analyses et éléments visuels. Les règles de progression restent identiques.'],
      ['06', 'Respecter les pauses', 'Une semaine plus calme n’est pas un échec. Les repères de récupération et les plafonds protègent une lecture plus durable.'],
    ],
    splitTitle: 'Une motivation qui ne repose pas sur la culpabilité.',
    splitCopy: [
      "Les séries parfaites et les classements permanents peuvent devenir pesants. TITAN préfère montrer la continuité, les petites étapes et les retours après une pause.",
      "Tu peux ignorer l’aventure, masquer les éléments secondaires et utiliser l’application comme un simple journal sportif. La profondeur est disponible, jamais obligatoire.",
    ],
    checklist: ['XP liée aux efforts enregistrés', 'Objectifs hebdomadaires lisibles', 'Trophées et records personnels', 'Aventure séparée du suivi', 'Même puissance pour les comptes gratuits et payants'],
    faq: [
      ['Est-ce un jeu ou une application sportive ?', 'C’est d’abord un outil de suivi sportif. Les éléments de jeu rendent la progression visible, mais ils ne remplacent ni la pratique ni les indicateurs sportifs.'],
      ['Peut-on utiliser TITAN sans l’aventure ?', 'Oui. Le journal, les sports et les statistiques fonctionnent sans ouvrir le mode aventure.'],
      ['TITAN+ permet-il de progresser plus vite ?', 'Non. Les règles d’XP, les plafonds et les chances de réussite restent les mêmes. TITAN+ apporte surtout des analyses et de la personnalisation.'],
    ],
  },
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function pageSlug(file) {
  return file.replace(/\.html$/i, '');
}

function renderAcquisitionPage(file, page) {
  const slug = pageSlug(file);
  const visualCards = page.visualCards.map(([label, value, progress]) => `
              <div class="public-mini-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><div class="public-progress" aria-hidden="true" style="--progress:${escapeHtml(progress)}"><i></i></div></div>`).join('');
  const cards = page.cards.map(([number, title, copy]) => `
            <article class="public-card"><span class="public-card-number">${escapeHtml(number)}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p></article>`).join('');
  const checklist = page.checklist.map(item => `<li>${escapeHtml(item)}</li>`).join('');
  const faq = page.faq.map(([question, answer]) => `
            <details><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`).join('');
  const richCopy = page.splitCopy.map(text => `<p>${escapeHtml(text)}</p>`).join('');
  const proof = page.proof.map(item => `<span>${escapeHtml(item)}</span>`).join('');

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.description)}">
  <meta name="theme-color" content="#071019">
  <link rel="icon" href="./favicon.ico" sizes="any">
  <link rel="manifest" href="./manifest.json">
  <link rel="stylesheet" href="./css/style.css?v=${version}">
  <link rel="stylesheet" href="./css/titan-v100.css?v=${version}">
  <script src="./js/titan-v100.js?v=${version}" defer></script>
</head>
<body class="public-v100" data-page="${escapeHtml(slug)}">
  <a class="skip-link" href="#contenu-principal">Aller au contenu</a>
  <div class="public-shell">
    <header class="public-nav" aria-label="Navigation principale">
      <a class="public-brand" href="/" aria-label="Accueil TITAN OS Sport">
        <img src="./image/logo.png" alt="TITAN OS Sport" width="42" height="42">
        <span><strong>TITAN OS Sport</strong><span>Suivi &amp; progression</span></span>
      </a>
      <nav class="public-nav-links" aria-label="Découvrir TITAN">
        <a href="/fonctionnalites">Fonctionnalités</a>
        <a href="/sports">260+ sports</a>
        <a href="/guide">Guide</a>
        <a class="public-nav-cta public-cta-primary" href="/login">Commencer</a>
      </nav>
    </header>

    <main id="contenu-principal">
      <section class="public-hero" aria-labelledby="page-title">
        <div>
          <p class="public-kicker">${escapeHtml(page.eyebrow)}</p>
          <h1 id="page-title">${escapeHtml(page.h1)}</h1>
          <p class="public-lead">${escapeHtml(page.lead)}</p>
          <div class="public-actions">
            <a class="public-cta-primary" href="/login">Commencer gratuitement</a>
            <a href="/sports">Trouver mon sport</a>
          </div>
          <div class="public-proof" aria-label="Points forts">${proof}</div>
        </div>
        <aside class="public-visual" aria-label="Aperçu de ${escapeHtml(page.visualTitle)}">
          <div class="public-visual-head"><strong>${escapeHtml(page.visualTitle)}</strong><span class="public-tag">Personnel</span></div>
          <div class="public-visual-grid">${visualCards}
          </div>
        </aside>
      </section>

      <section class="public-section" aria-labelledby="features-title">
        <div class="public-section-head"><p class="public-kicker">Concret au quotidien</p><h2 id="features-title">${escapeHtml(page.sectionTitle)}</h2><p>${escapeHtml(page.sectionLead)}</p></div>
        <div class="public-grid">${cards}
        </div>
      </section>

      <section class="public-section public-split" aria-labelledby="method-title">
        <div class="public-rich-copy"><p class="public-kicker">Une méthode durable</p><h2 id="method-title">${escapeHtml(page.splitTitle)}</h2>${richCopy}</div>
        <div class="public-panel"><h3>Ce que tu retrouves dans TITAN</h3><ul class="public-checklist">${checklist}</ul></div>
      </section>

      <section class="public-section public-faq" aria-labelledby="faq-title">
        <div class="public-section-head"><p class="public-kicker">Questions fréquentes</p><h2 id="faq-title">Avant de commencer.</h2></div>${faq}
        <div class="public-cta-band"><div><h2>Ton prochain effort peut rester simple.</h2><p>Crée ton espace, choisis ton sport et enregistre une première séance.</p></div><div class="public-actions"><a class="public-cta-primary" href="/login">Créer mon compte</a></div></div>
      </section>
    </main>

    <footer class="public-footer">
      <div><strong>TITAN OS Sport</strong><br>Suivi sportif multisport · <span data-current-year></span></div>
      <nav aria-label="Liens de pied de page">
        <a href="/fonctionnalites">Fonctionnalités</a><a href="/suivi-sportif">Suivi multisport</a><a href="/journal-entrainement">Journal</a><a href="/progression-sportive">Progression</a><a href="/motivation-sport">Motivation</a><a href="/legal_hub">Confidentialité</a><a href="/service">Aide</a>
      </nav>
    </footer>
  </div>
</body>
</html>
`;
}

for (const [file, page] of Object.entries(acquisitionPages)) {
  writeFileSync(resolve(root, file), renderAcquisitionPage(file, page), 'utf8');
}

writeFileSync(resolve(root, 'activities.html'), `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, follow">
  <meta http-equiv="refresh" content="0; url=/journal">
  <title>Le Journal remplace l’ancien historique | TITAN OS Sport</title>
  <link rel="stylesheet" href="./css/titan-v100.css?v=${version}">
  <script>window.location.replace('/journal');</script>
</head>
<body class="public-v100" data-page="activities">
  <main id="contenu-principal" class="public-shell" style="padding-block:80px">
    <p class="public-kicker">Page déplacée</p>
    <h1>Ton historique est maintenant dans le Journal.</h1>
    <p class="public-lead">Toutes tes séances, tes filtres et ton calendrier sont réunis au même endroit.</p>
    <div class="public-actions"><a class="public-cta-primary" href="/journal">Ouvrir le Journal</a></div>
  </main>
</body>
</html>
`, 'utf8');

const fileReplacements = {
  'index.html': [
    ['Progression physique', 'Sport & progression'],
    ['Ton espace de progression', 'Suivi sportif qui motive'],
    ['Transforme chaque effort en progression.', 'Le suivi sportif qui donne envie de continuer.'],
    ['Plus de 260 sports, un journal clair et une progression qui donne envie de revenir — sans transformer l’entraînement en corvée.', 'Plus de 260 sports, un journal clair et des tendances faciles à comprendre — pour rester régulier sans transformer le sport en corvée.'],
    ['Demarrer maintenant', 'Commencer gratuitement'],
    ['Quatre repères. Zéro surcharge.', 'Tout ce qu’il faut. Rien qui ralentit.'],
    ['TITAN relie les points', 'Tu vois ta progression'],
    ['Identite TITAN OS', 'L’expérience TITAN OS Sport'],
  ],
  'sports.html': [
    ['Répertoire multisport', 'Catalogue multisport'],
    ['Catalogue opérationnel', 'Tous les sports'],
    ['Trouve ton sport. Trace ce qui compte.', 'Trouve ton sport. Suis ce qui compte.'],
  ],
  'guide.html': [
    ['Mission log', 'Ton journal'],
    ['Repères de combat', 'Défis et aventure'],
    ['XP registry', 'XP et régularité'],
    ['Demarrage pas a pas', 'Bien démarrer'],
    ['Positionnement sport intelligent', 'Notre approche'],
    ['Specificites sportives', 'Des données adaptées à chaque sport'],
  ],
  'service.html': [
    ['Support systeme', 'Aide et confiance'],
    ['Service Hub', 'Centre d’aide'],
    ['Carte des fonctionnalites', 'Tout ce que tu peux faire'],
    ['Tout ce qui existe est range ici: actif, Elite, ou prevu. Pas de module cache, juste des entrees plus propres.', 'Retrouve les fonctions disponibles, les options TITAN+ et les nouveautés prévues dans un langage simple.'],
  ],
  'health.html': [
    ['MED-BAY', 'FORME'],
    ['BIOMETRIE', 'Forme & récupération'],
    ['PARAMETRES VITAUX', 'Tes repères du jour'],
  ],
  'talents.html': [
    ['NEURAL LINK', 'Parcours'],
    ['SYNCHRONISATION NEURAL LINK...', 'Chargement de ton parcours…'],
    ['INSTALLER LE MODULE', 'Débloquer cette étape'],
    ['<h2 style="color: var(--gold); border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; margin-bottom: 15px;">PROTOCOLE</h2>', '<h2 style="color: var(--gold); border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; margin-bottom: 15px;">Comment ça marche</h2>'],
  ],
  'training.html': [
    ['SEANCE PLANIFIEE DETECTEE (BOOST XP ACTIF)', 'Séance planifiée reconnue'],
    ['CONDITIONS TERRAIN', 'Conditions de pratique'],
    ['ANALYSE BIOMETRIQUE', 'Ressenti et récupération'],
    ['DONNEES SATELLITES (GPX)', 'Importer un parcours (GPX)'],
    ['ENREGISTRER L\'EFFORT', 'Enregistrer la séance'],
    ['RAPPORT DE MISSION', 'Objectif de la semaine'],
  ],
  'login.html': [
    ["S'ENROLER", 'Créer mon compte'],
    ['Creation du profil', 'Créer mon profil'],
  ],
  'notifications.html': [['NOTIFICATIONS', 'À retenir']],
  'trophies.html': [['REGISTRE', 'Trophées']],
  'chat.html': [['TRANSMISSION EN ATTENTE', 'Aucun message pour le moment'], ['ZONE DANGER', 'Gérer la conversation']],
  'changelog.html': [['CHANGELOG', 'Nouveautés']],
  'profile.html': [['>PROFIL<', '>Profil & préférences<']],
  'activities.html': [['>ACTIVITES<', '>Journal<']],
  'update-password.html': [["Nouveau code d'acces", 'Choisis un nouveau mot de passe']],
};

const htmlFiles = readdirSync(root).filter(file => file.endsWith('.html') && file !== 'googleb8fedd43e28cf7d4.html');

for (const file of htmlFiles) {
  const target = resolve(root, file);
  let html = readFileSync(target, 'utf8');
  html = html.replace(/([?&]v=)[0-9.]+(?=["'&])/g, `$1${version}`);
  html = html.replaceAll('titan-v89.css', 'titan-v100.css');
  html = html.replaceAll('titan-v89.js', 'titan-v100.js');

  if (!/titan-v100\.css/i.test(html)) {
    html = html.replace(/<\/head>/i, `    <link rel="stylesheet" href="./css/titan-v100.css?v=${version}">\n</head>`);
  }
  if (!/titan-v100\.js/i.test(html)) {
    html = html.replace(/<\/head>/i, `    <script src="./js/titan-v100.js?v=${version}" defer></script>\n</head>`);
  }

  const slug = pageSlug(file);
  html = html.replace(/<body(?![^>]*\bdata-page=)([^>]*)>/i, `<body$1 data-page="${slug}">`);

  for (const [from, to] of fileReplacements[file] || []) {
    html = html.split(from).join(to);
  }

  if (file === 'journal.html') {
    // The legacy archive/lore reader was hidden and duplicated the Adventure.
    // Keep the sports journal only; the narrative remains in adventure.html.
    html = html.replace(/\n\s*<div class="terminal-layout" hidden aria-hidden="true">[\s\S]*?<\/div>\s*<\/main>/, '\n        </main>');
    html = html.replace(/\n\s*const LORE_DATA = \{[\s\S]*?\n\s*let selectedActivityId = null;/, '\n        let selectedActivityId = null;');
    html = html.replace(/\n\s*function bindArchiveControls\(\) \{[\s\S]*?(?=\n\s*function bindActivityControls\(\))/, '\n');
    html = html.replace(/\n\s*function syncPersonalJournal\(\) \{[\s\S]*?(?=\n\s*function escapeText\(value\))/, '\n');
    html = html.replace(/\s*<style>\s*body \{\s*background-color: #02040a;[\s\S]*?<\/style>\s*(?=<style>)/, '\n');
    html = html.replace(/\n\s*body\.journal-page \.terminal-layout \{[^}]*\}/g, '');
    html = html.replace(
      /\n\s*body\.journal-page \.terminal-sidebar \{[\s\S]*?(?=\n\s*body\.journal-page ::-webkit-scrollbar-track)/,
      `
        body.journal-page .reader-btn {
            min-height: 44px;
            padding: 0 14px;
            border: 1px solid rgba(126, 220, 255, 0.22);
            background: rgba(255, 255, 255, 0.045);
            color: #eaf8ff;
            border-radius: 8px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            text-decoration: none;
        }

        body.journal-page .reader-btn:hover,
        body.journal-page .reader-btn:focus-visible {
            background: rgba(126, 220, 255, 0.12);
            color: #ffffff;
        }
`
    );
    html = html.replace(/\n\s*body\.journal-page \.terminal-sidebar \{[^}]*\}/g, '');
    html = html.replace(/\n\s*body\.journal-page \.terminal-header \{[^}]*\}/g, '');
    html = html.replace(/\n\s*body\.journal-page \.reader-content \{[^}]*\}/g, '');
    html = html.replace(/\n\s*body\.journal-page \.reader-topbar \{[^}]*\}/g, '');
    if (!html.includes('function normalizeActivitySearch(value)')) {
      html = html.replace(
        /\n\s*function getActivityFilters\(\) \{/,
        `
        function normalizeActivitySearch(value) {
            return String(value || '')
                .normalize('NFD')
                .replace(/[\\u0300-\\u036f]/g, '')
                .toLowerCase()
                .trim();
        }

        function getActivityFilters() {`
      );
    }
    html = html.replaceAll('normalize(document.getElementById(\'activity-search\')?.value || \'\')', 'normalizeActivitySearch(document.getElementById(\'activity-search\')?.value || \'\')');
    html = html.replaceAll('const text = normalize(`${sportName(log.sport)}', 'const text = normalizeActivitySearch(`${sportName(log.sport)}');
  }
  writeFileSync(target, html, 'utf8');
}

const sourceReplacements = {
  'js/config.js': [
    ['TITAN OS - CONFIGURATION (SQL ONLY)', 'TITAN OS SPORT - CONFIGURATION PUBLIQUE'],
    ['version: "90.0"', `version: "${version}"`],
    ['TITAN_ASSET_VERSION = "90.0"', `TITAN_ASSET_VERSION = "${version}"`],
  ],
  'js/ui.js': [
    ['Modules secondaires', 'Explorer'],
    ['Tous les modules', 'Explorer TITAN'],
    ['Ta progression · v', 'Sport & progression · v'],
  ],
  'sw.js': [
    ['titan-os-v90-sport-first-release', 'titan-os-v100-grand-public'],
    [/([?&]v=)90\.0/g, `$1${version}`],
  ],
};

for (const [file, replacements] of Object.entries(sourceReplacements)) {
  const target = resolve(root, file);
  let source = readFileSync(target, 'utf8');
  for (const [from, to] of replacements) {
    source = typeof from === 'string' ? source.split(from).join(to) : source.replace(from, to);
  }
  writeFileSync(target, source, 'utf8');
}

const manifestPath = resolve(root, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.name = 'TITAN OS Sport — suivi multisport';
manifest.short_name = 'TITAN Sport';
manifest.description = "Journal multisport, statistiques lisibles et progression motivante pour plus de 260 disciplines.";
manifest.theme_color = '#071019';
manifest.background_color = '#03080d';
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`TITAN v${version}: ${Object.keys(acquisitionPages).length} pages d'acquisition et ${htmlFiles.length} pages harmonisées.`);
