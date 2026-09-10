import { readFileSync, writeFileSync } from 'node:fs';

const siteUrl = 'https://titan-app.fr';
const logoUrl = `${siteUrl}/image/logo.png`;
const appIconUrl = `${siteUrl}/image/logo-192.png`;
const ogImageUrl = `${siteUrl}/image/og-titan-os.png`;
const supportEmail = 'titanteam.app@gmail.com';

const configSource = readFileSync('js/config.js', 'utf8');
const assetVersion = configSource.match(/TITAN_ASSET_VERSION\s*=\s*["']([^"']+)["']/)?.[1] || '57';

const shared = {
  siteName: 'TITAN OS Sport',
  locale: 'fr_FR',
  author: 'TITAN OS Sport',
  language: 'fr-FR',
};

const pages = {
  'index.html': {
    title: 'TITAN OS - Suivi sportif gamifie, XP et progression',
    description: "TITAN OS est un systeme de progression physique: enregistre tes seances reelles, gagne de l'XP, suis tes progres et debloque une aventure.",
    keywords: "application sport, suivi sportif, motivation sportive, sport gamifie, XP sport, progression sportive",
    path: '/',
    robots: 'index, follow',
    priority: '1.0',
    changefreq: 'weekly',
    schemaType: ['WebPage', 'CollectionPage'],
    ads: true,
  },
  'training.html': {
    title: "Entrainement - TITAN OS",
    description: "Page d'enregistrement des seances sportives TITAN OS.",
    path: '/training',
    robots: 'noindex, nofollow',
    ads: false,
  },
  'guide.html': {
    title: 'Comment fonctionne TITAN OS ?',
    description: "Comprends le principe de TITAN OS: sport reel, journal d'entrainement, XP, statistiques utiles, aventure et progression durable.",
    path: '/guide',
    robots: 'index, follow',
    priority: '0.92',
    changefreq: 'monthly',
    schemaType: 'Article',
    ads: true,
  },
  'stats.html': {
    title: 'Progres sportifs - TITAN OS',
    description: "Statistiques personnelles et progression sportive dans TITAN OS.",
    path: '/stats',
    robots: 'noindex, nofollow',
    ads: false,
  },
  'adventure.html': {
    title: 'Aventure sportive - TITAN OS',
    description: "Aventure, boss et progression gamifiee lies aux efforts sportifs reels dans TITAN OS.",
    path: '/adventure',
    robots: 'noindex, nofollow',
    ads: false,
  },
  'disciplines.html': {
    title: 'Disciplines - TITAN OS',
    description: "Disciplines et specialisations sportives personnelles dans TITAN OS.",
    path: '/disciplines',
    robots: 'noindex, nofollow',
    ads: false,
  },
  'health.html': {
    title: 'Sante et recuperation - TITAN OS',
    description: "Signaux de forme, fatigue et recuperation personnelle dans TITAN OS.",
    path: '/health',
    robots: 'noindex, nofollow',
    ads: false,
  },
  'journal.html': {
    title: 'Journal sportif - TITAN OS',
    description: "Historique personnel des seances et recompenses TITAN OS.",
    path: '/journal',
    robots: 'noindex, nofollow',
    ads: false,
  },
  'talents.html': {
    title: 'Talents - TITAN OS',
    description: "Arbre de progression personnel TITAN OS.",
    path: '/talents',
    robots: 'noindex, nofollow',
    ads: false,
  },
  'trophies.html': {
    title: 'Trophees - TITAN OS',
    description: "Succes et trophees personnels debloques dans TITAN OS.",
    path: '/trophies',
    robots: 'noindex, nofollow',
    ads: false,
  },
  'boutique.html': {
    title: 'Boutique et TITAN+ - TITAN OS',
    description: "Personnalise TITAN OS avec tes credits sportifs et decouvre TITAN+: analyses, plans adaptes et collections visuelles sans avantage de puissance.",
    path: '/boutique',
    robots: 'noindex, nofollow',
    ads: false,
    rewardedAds: true,
  },
  'sport_details.html': {
    title: 'Analyse par sport - TITAN OS',
    description: "Analyse personnelle par discipline sportive dans TITAN OS.",
    path: '/sport_details',
    robots: 'noindex, nofollow',
    ads: false,
  },
  'onboarding.html': {
    title: 'Premiers pas - TITAN OS',
    description: "Parcours court pour comprendre TITAN OS et enregistrer une premiere seance.",
    path: '/onboarding',
    robots: 'noindex, follow',
    ads: false,
  },
  'changelog.html': {
    title: 'Changelog - TITAN OS',
    description: "Suis les evolutions publiques de TITAN OS: stabilite, entrainement, statistiques, aventure, securite et ameliorations.",
    path: '/changelog',
    robots: 'index, follow',
    priority: '0.5',
    changefreq: 'monthly',
    schemaType: 'CollectionPage',
    ads: true,
  },
  'legal_hub.html': {
    title: 'Centre legal et confidentialite - TITAN OS',
    description: "Accede aux documents legaux de TITAN OS: CGU, confidentialite, mentions legales, donnees, publicite, paiement, securite et contact.",
    path: '/legal_hub',
    robots: 'index, follow',
    priority: '0.4',
    changefreq: 'yearly',
    ads: false,
  },
  'legal_mentions.html': {
    title: 'Mentions legales - TITAN OS',
    description: "Consulte les mentions legales de TITAN OS, les informations d'edition, d'hebergement et de contact.",
    path: '/legal_mentions',
    robots: 'index, follow',
    priority: '0.32',
    changefreq: 'yearly',
    ads: false,
  },
  'legal_privacy.html': {
    title: 'Confidentialite - TITAN OS',
    description: "Comprends comment TITAN OS protege les donnees personnelles, la progression sportive, les sauvegardes et les informations de compte.",
    path: '/legal_privacy',
    robots: 'index, follow',
    priority: '0.32',
    changefreq: 'yearly',
    ads: false,
  },
  'legal_cgu.html': {
    title: "Conditions d'utilisation - TITAN OS",
    description: "Lis les conditions generales d'utilisation de TITAN OS: acces gratuit, TITAN+, responsabilite sportive, moderation, donnees et droits.",
    path: '/legal_cgu',
    robots: 'index, follow',
    priority: '0.32',
    changefreq: 'yearly',
    ads: false,
  },
  'login.html': {
    title: 'Connexion - TITAN OS',
    description: "Connexion securisee a TITAN OS.",
    path: '/login',
    robots: 'noindex, follow',
    ads: false,
  },
  'activities.html': {
    title: 'Historique des activites - TITAN OS',
    description: 'Historique personnel des activites sportives enregistrees dans TITAN OS.',
    path: '/activities',
    robots: 'noindex, follow',
    ads: false,
  },
  'notifications.html': {
    title: 'Notifications - TITAN OS',
    description: 'Alertes personnelles, etat des sauvegardes et informations utiles de ton compte TITAN OS.',
    path: '/notifications',
    robots: 'noindex, follow',
    ads: false,
  },
  'service.html': {
    title: 'Aide et support - TITAN OS',
    description: 'Aide, support, documents de confiance, et informations utiles pour utiliser TITAN OS.',
    path: '/service',
    robots: 'index, follow',
    priority: '0.55',
    changefreq: 'monthly',
    ads: true,
  },
  'profile.html': {
    title: 'Profil utilisateur - TITAN OS',
    description: 'Espace personnel TITAN OS pour gerer le profil, les preferences et les cosmetiques.',
    path: '/profile',
    robots: 'noindex, nofollow',
    ads: false,
  },
  'social.html': {
    title: 'Social - TITAN OS',
    description: 'Espace social TITAN OS reserve aux utilisateurs connectes.',
    path: '/social',
    robots: 'noindex, nofollow',
    ads: false,
  },
  'chat.html': {
    title: 'Messagerie - TITAN OS',
    description: 'Messagerie TITAN OS reservee aux utilisateurs connectes.',
    path: '/chat',
    robots: 'noindex, nofollow',
    ads: false,
  },
  'update-password.html': {
    title: 'Reinitialisation du mot de passe - TITAN OS',
    description: 'Page securisee de reinitialisation du mot de passe TITAN OS.',
    path: '/update-password',
    robots: 'noindex, nofollow',
    ads: false,
  },
  'sys_core_override_99.html': {
    title: 'Admin Console - TITAN OS',
    description: 'Interface technique interne TITAN OS.',
    path: '/sys_core_override_99.html',
    robots: 'noindex, nofollow',
    ads: false,
  },
};

Object.assign(pages, {
  'index.html': {
    ...pages['index.html'],
    title: 'Application de suivi sportif multisport | TITAN OS Sport',
    description: "Journal sportif, statistiques lisibles et progression motivante pour plus de 260 disciplines. Commence gratuitement avec TITAN OS Sport.",
    keywords: "application multisport, suivi sportif, progression sportive, sport gamifie, XP sport, journal entrainement, statistiques sportives",
    faq: [
      {
        question: 'TITAN OS est-il gratuit ?',
        answer: 'Oui. Le journal sportif, la progression de base et le catalogue multisport sont accessibles gratuitement depuis un navigateur compatible.',
      },
      {
        question: 'Quels sports sont disponibles ?',
        answer: 'Plus de 260 disciplines couvrent endurance, force, combat, eau, glisse, precision, mobilite, sports collectifs et sports de niche.',
      },
      {
        question: 'Est-ce un coach ou un outil medical ?',
        answer: 'Non. TITAN OS aide a suivre et motiver une pratique sportive. Il ne remplace ni un professionnel de sante ni un coach certifie.',
      },
      {
        question: 'Mes seances sont-elles publiques ?',
        answer: "Non par defaut. L'historique personnel reste lie au compte. Les fonctions sociales reposent sur des actions volontaires.",
      },
    ],
  },
  'sports.html': {
    title: 'Liste de 260+ sports et suivi adapté | TITAN OS Sport',
    description: "Explore plus de 260 sports et trouve les mesures utiles à ta pratique : endurance, force, combat, eau, glisse, équipe, raquette et mobilité.",
    keywords: "liste sports, application multisport, suivi par sport, statistiques sportives, journal entrainement",
    path: '/sports',
    robots: 'index, follow',
    priority: '0.95',
    changefreq: 'weekly',
    schemaType: 'CollectionPage',
    ads: true,
    faq: [
      {
        question: 'Quels sports peut-on suivre dans TITAN OS ?',
        answer: "Le catalogue couvre les grandes familles d'endurance, de force, de combat, de precision, de glisse, d'eau, de mobilite et de sports collectifs, avec des pratiques de niche en complement.",
      },
      {
        question: 'Faut-il renseigner toutes les metriques ?',
        answer: "Non. Une valeur principale suffit pour commencer. Les metriques specifiques sont proposees pour ameliorer la lecture de progression, mais restent optionnelles lorsqu'elles ne sont pas pertinentes pour ta seance.",
      },
      {
        question: 'TITAN OS remplace-t-il un coach ou un outil medical ?',
        answer: "Non. TITAN OS est un journal de progression et de motivation. Il ne pose aucun diagnostic et ne remplace ni un professionnel de sante ni un encadrement sportif qualifie.",
      },
    ],
  },
  'algorithme.html': {
    title: 'Calcul de la progression sportive | Méthode TITAN OS Sport',
    description: "Comprends comment TITAN OS Sport relie charge d’entraînement, régularité, récupération et XP pour rendre la progression lisible sans diagnostic médical.",
    keywords: "algorithme progression sportive, charge entrainement, XP sport, recuperation sportive, suivi sportif intelligent, moteur progression physique",
    path: '/algorithme',
    robots: 'index, follow',
    priority: '0.88',
    changefreq: 'monthly',
    schemaType: 'Article',
    ads: true,
    faq: [
      {
        question: 'TITAN OS utilise-t-il une IA medicale ?',
        answer: "Non. TITAN OS utilise un moteur de progression sportive et ne remplace pas un medecin, un kine ou un coach certifie.",
      },
      {
        question: "Pourquoi utiliser l'XP dans le sport ?",
        answer: "L'XP rend la regularite visible et transforme les seances en progression mesurable sans promettre de resultat instantane.",
      },
      {
        question: 'Comment commencer avec TITAN OS ?',
        answer: "Enregistre une premiere seance, puis laisse l'historique construire des signaux plus utiles au fil des semaines.",
      },
    ],
  },
  'partenariats.html': {
    title: 'Partenariats sport, salles et marques | TITAN OS Sport',
    description: "Découvre les partenariats TITAN OS Sport pour les salles, clubs, marques, médias et structures qui veulent créer une expérience multisport engageante.",
    keywords: "partenariat sport, marque sport, salle de sport, application sport gamifiee, communaute sportive",
    path: '/partenariats',
    robots: 'index, follow',
    priority: '0.62',
    changefreq: 'monthly',
    schemaType: 'AboutPage',
    ads: false,
  },
  'guide.html': {
    ...pages['guide.html'],
    title: 'Guide du suivi sportif et de la progression | TITAN OS Sport',
    description: "Apprends à utiliser le journal sportif, les statistiques, l’XP, les objectifs et la récupération dans TITAN OS Sport, sur mobile comme sur ordinateur.",
    keywords: "guide application sport, XP sport, progression durable, journal entrainement, application fitness gamifiee",
  },
  'service.html': {
    ...pages['service.html'],
    title: 'Aide, compte et confidentialité | TITAN OS Sport',
    description: "Retrouve les réponses utiles pour utiliser TITAN OS Sport, protéger ton compte, comprendre tes données et contacter l’équipe d’assistance.",
    keywords: "aide TITAN OS, support application sport, confidentialite sport, compte TITAN OS",
  },
  'training.html': {
    ...pages['training.html'],
    description: "Enregistre une seance dans TITAN OS: choisis ton sport, ajoute duree, distance, intensite ou notes, puis retrouve ta progression.",
  },
  'stats.html': {
    ...pages['stats.html'],
    description: "Tableau de bord personnel TITAN OS: statistiques sportives, progression, radar physique, regularite et signaux utiles pour continuer.",
  },
  'adventure.html': {
    ...pages['adventure.html'],
    description: "Mode aventure TITAN OS reserve aux utilisateurs: boss, combats, campagne et recompenses liees aux efforts sportifs reels.",
  },
  'disciplines.html': {
    ...pages['disciplines.html'],
    description: "Disciplines TITAN OS: sports pratiques, specialisations, familles d'effort et lecture personnelle de ta progression physique.",
  },
  'health.html': {
    ...pages['health.html'],
    description: "Signaux de forme TITAN OS: fatigue, recuperation, fraicheur, alternance des efforts et indicateurs personnels non medicaux.",
  },
  'journal.html': {
    ...pages['journal.html'],
    description: "Journal sportif TITAN OS: historique personnel des seances, recompenses, filtres, traces et resume de progression pour les comptes connectes.",
  },
  'talents.html': {
    ...pages['talents.html'],
    description: "Talents TITAN OS: arbre de progression personnel, choix d'orientation, bonus et specialisations debloques par la pratique.",
  },
  'trophies.html': {
    ...pages['trophies.html'],
    description: "Trophees TITAN OS: succes personnels, records, recompenses et collection de progression lies aux seances sportives.",
  },
  'sport_details.html': {
    ...pages['sport_details.html'],
    description: "Analyse TITAN OS par sport: tendances, derniere seance, metriques dominantes, progression et details propres a chaque discipline.",
  },
  'login.html': {
    ...pages['login.html'],
    description: "Connecte-toi a TITAN OS pour retrouver ta progression, ton historique et tes preferences sur tes appareils.",
  },
  'social.html': {
    ...pages['social.html'],
    title: 'Social TITAN OS - Guildes, allies et defis',
    description: "Espace social TITAN OS reserve aux comptes connectes: guildes, allies, defis, codes amis et interactions synchronisees.",
  },
  'chat.html': {
    ...pages['chat.html'],
    description: "Messagerie TITAN OS reservee aux utilisateurs connectes: canal global, canal guilde, moderation et messages temporaires.",
  },
  'update-password.html': {
    ...pages['update-password.html'],
    description: "Definis un nouveau mot de passe et retrouve l'acces a ton compte TITAN OS.",
  },
  'dynamic-page.html': {
    title: 'Page publique TITAN OS',
    description: "Retrouve les contenus, conseils et informations officielles publies par l'equipe TITAN OS.",
    path: '/dynamic-page',
    robots: 'noindex, follow',
    ads: false,
  },
  'admin.html': {
    title: 'Centre de controle TITAN OS',
    description: "Interface d'administration TITAN OS reservee aux responsables autorises pour piloter contenu, moderation et signaux operationnels.",
    path: '/admin',
    robots: 'noindex, nofollow',
    ads: false,
  },
  '404.html': {
    title: 'Page introuvable - TITAN OS',
    description: "Page d'erreur TITAN OS affichee lorsqu'une adresse est introuvable, protegee ou volontairement masquee du site public.",
    path: '/404.html',
    robots: 'noindex, nofollow',
    ads: false,
  },
  'network-error.html': {
    title: 'Connexion indisponible - TITAN OS',
    description: "TITAN OS ne peut pas charger cette page pour le moment. Retrouve les options disponibles hors connexion.",
    path: '/network-error.html',
    robots: 'noindex, nofollow',
    ads: false,
  },
  'fonctionnalites.html': {
    title: 'Fonctionnalités de suivi sportif | TITAN OS Sport',
    description: "Découvre le journal multisport, les statistiques, les objectifs, l’XP et les outils de progression de TITAN OS Sport.",
    path: '/fonctionnalites',
    robots: 'index, follow',
    priority: '0.94',
    changefreq: 'monthly',
    schemaType: 'CollectionPage',
    ads: false,
    faq: [
      { question: 'Faut-il utiliser toutes les fonctionnalités ?', answer: 'Non. Tu peux simplement enregistrer tes séances et consulter ton journal. Les autres modules restent optionnels.' },
      { question: 'Est-ce adapté à plusieurs sports ?', answer: 'Oui. Le même journal peut accueillir plus de 260 disciplines avec des mesures adaptées à chaque pratique.' },
      { question: 'La version gratuite suffit-elle pour commencer ?', answer: 'Oui. Le suivi essentiel, le journal, le catalogue multisport et la progression de base sont accessibles gratuitement.' },
    ],
  },
  'suivi-sportif.html': {
    title: 'Suivi sportif multisport et personnel | TITAN OS Sport',
    description: "Suis plus de 260 sports dans un même espace avec une saisie adaptée, un historique personnel et des tendances faciles à comprendre.",
    path: '/suivi-sportif',
    robots: 'index, follow',
    priority: '0.93',
    changefreq: 'monthly',
    schemaType: 'Article',
    ads: false,
    faq: [
      { question: 'Quels sports peut-on suivre ?', answer: 'Le catalogue couvre plus de 260 disciplines, des grands sports aux pratiques de niche.' },
      { question: 'Dois-je remplir tous les champs ?', answer: 'Non. Commence avec le sport, la durée et les informations que tu connais. Les détails restent facultatifs.' },
      { question: 'Puis-je pratiquer plusieurs sports ?', answer: 'Oui. Le journal réunit toutes tes séances et les analyses peuvent rester séparées par discipline.' },
    ],
  },
  'journal-entrainement.html': {
    title: "Journal d’entraînement sportif clair | TITAN OS Sport",
    description: "Tiens un journal d’entraînement clair : séances, calendrier, filtres, notes et mesures adaptées à chaque sport.",
    path: '/journal-entrainement',
    robots: 'index, follow',
    priority: '0.92',
    changefreq: 'monthly',
    schemaType: 'Article',
    ads: false,
    faq: [
      { question: 'Combien de temps faut-il pour noter une séance ?', answer: 'Pour une saisie simple, le sport, la date, la durée et une mesure principale suffisent. Les détails sont optionnels.' },
      { question: 'Pourquoi utiliser un calendrier ?', answer: 'Il permet de voir rapidement la régularité, les périodes chargées et les reprises.' },
      { question: 'Peut-on importer un parcours GPX ?', answer: 'Une zone GPX est prévue pour les séances qui bénéficient d’un tracé, tout en conservant une saisie manuelle.' },
    ],
  },
  'progression-sportive.html': {
    title: 'Mesurer sa progression sportive | TITAN OS Sport',
    description: "Analyse ta progression sportive avec des tendances par période, la régularité et des mesures adaptées à chaque discipline.",
    path: '/progression-sportive',
    robots: 'index, follow',
    priority: '0.92',
    changefreq: 'monthly',
    schemaType: 'Article',
    ads: false,
    faq: [
      { question: 'Quelle période faut-il regarder ?', answer: 'Sept jours servent à relire la semaine. Trente à quatre-vingt-dix jours donnent une tendance plus stable.' },
      { question: 'L’XP mesure-t-elle ma condition physique ?', answer: 'Non. L’XP soutient la motivation et ne remplace pas les mesures sportives ni un avis professionnel.' },
      { question: 'TITAN donne-t-il des conseils médicaux ?', answer: 'Non. Les informations de forme sont des repères personnels non diagnostiques.' },
    ],
  },
  'motivation-sport.html': {
    title: 'Motivation sportive et gamification | TITAN OS Sport',
    description: "Entretiens ta motivation avec une progression par XP, des objectifs courts, des trophées et une aventure optionnelle sans pay-to-win.",
    path: '/motivation-sport',
    robots: 'index, follow',
    priority: '0.9',
    changefreq: 'monthly',
    schemaType: 'Article',
    ads: false,
    faq: [
      { question: 'Est-ce un jeu ou une application sportive ?', answer: 'C’est d’abord un outil de suivi sportif. Les éléments de jeu rendent la progression visible.' },
      { question: 'Peut-on utiliser TITAN sans l’aventure ?', answer: 'Oui. Le journal, les sports et les statistiques fonctionnent sans ouvrir le mode aventure.' },
      { question: 'TITAN+ permet-il de progresser plus vite ?', answer: 'Non. Les règles d’XP, les plafonds et les chances de réussite restent les mêmes.' },
    ],
  },
});

const guideFaq = [
  {
    question: 'TITAN OS est-il un coach sportif ?',
    answer: 'Non. TITAN OS aide a suivre et motiver la progression, mais ne remplace pas un professionnel de sante ou un coach certifie.',
  },
  {
    question: 'Faut-il etre sportif confirme ?',
    answer: "Non. L'application valorise la regularite et peut servir pour une reprise, une routine fitness, du cardio, de la musculation ou une pratique mixte.",
  },
  {
    question: "Pourquoi utiliser de l'XP ?",
    answer: "L'XP rend les efforts visibles. Elle aide a transformer des actions parfois discretes en progression mesurable et motivante.",
  },
  {
    question: 'Est-ce gratuit ?',
    answer: 'TITAN OS est accessible gratuitement dans le navigateur, avec des options de personnalisation et de soutien possibles.',
  },
      {
        question: 'Est-ce utilisable sur mobile ?',
        answer: "Oui. TITAN OS s'adapte au mobile et peut etre ajoute a l'ecran d'accueil depuis un navigateur compatible.",
  },
];

function absoluteUrl(path) {
  if (path === '/') return `${siteUrl}/`;
  return `${siteUrl}${path}`;
}

function escapeAttr(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeXml(value) {
  return escapeAttr(value).replaceAll("'", '&apos;');
}

function upsertTag(head, selector, tag) {
  const pattern = new RegExp(selector, 'i');
  if (pattern.test(head)) return head.replace(pattern, tag);
  return `${head}\n    ${tag}`;
}

function removeManagedSeo(head) {
  return head
    .replace(/\n\s*<!-- SEO: TITAN OS -->[\s\S]*?<!-- \/SEO: TITAN OS -->/gi, '')
    .replace(/\n\s*<script type="application\/ld\+json" data-seo-schema>[\s\S]*?<\/script>/gi, '')
    .replace(/\n\s*<style data-titan-critical-boot>[\s\S]*?<\/style>\s*<script data-titan-critical-boot>[\s\S]*?<\/script>/gi, '')
    .replace(/\n\s*<link\s+rel=["']stylesheet["']\s+href=["']\.\/css\/titan-v(?:89|100)\.css[^"']*["'][^>]*>/gi, '')
    .replace(/\n\s*<script\s+src=["']\.\/js\/titan-v(?:89|100)\.js[^"']*["'][^>]*>\s*<\/script>/gi, '');
}

function removeLooseSeo(head) {
  return head
    .replace(/\n\s*<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\n\s*<script\s+src=["']\.\/js\/consent\.js[^>]*>\s*<\/script>/gi, '')
    .replace(/\n\s*<meta\s+name=["']description["'][^>]*>/gi, '')
    .replace(/\n\s*<meta\s+name=["']keywords["'][^>]*>/gi, '')
    .replace(/\n\s*<meta\s+name=["']author["'][^>]*>/gi, '')
    .replace(/\n\s*<meta\s+name=["']robots["'][^>]*>/gi, '')
    .replace(/\n\s*<meta\s+name=["']googlebot["'][^>]*>/gi, '')
    .replace(/\n\s*<meta\s+name=["']bingbot["'][^>]*>/gi, '')
    .replace(/\n\s*<meta\s+name=["']image_src["'][^>]*>/gi, '')
    .replace(/\n\s*<link\s+rel=["']canonical["'][^>]*>/gi, '')
    .replace(/\n\s*<link\s+rel=["']alternate["'][^>]*hreflang=[^>]*>/gi, '')
    .replace(/\n\s*<meta\s+(?:property|name)=["'](?:og|twitter):[^"']+["'][^>]*>/gi, '')
    .replace(/\n\s*<link\s+rel=["']icon["'][^>]*>/gi, '')
    .replace(/\n\s*<link\s+rel=["']shortcut icon["'][^>]*>/gi, '')
    .replace(/\n\s*<link\s+rel=["']apple-touch-icon["'][^>]*>/gi, '')
    .replace(/\n\s*<link\s+rel=["']manifest["'][^>]*>/gi, '');
}

function normalizeViewport(html) {
  const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">';
  if (/<meta\s+name=["']viewport["'][^>]*>/i.test(html)) {
    return html.replace(/<meta\s+name=["']viewport["'][^>]*>/i, viewport);
  }
  return html.replace(/<meta\s+charset=["'][^"']+["']\s*>/i, match => `${match}\n    ${viewport}`);
}

function buildCriticalBootBlock() {
  return `    <style data-titan-critical-boot>
      html { background:#0f172a; color-scheme:dark; }
      body { margin:0; background:#0f172a; color:#f8fafc; }
      html.titan-booting::before {
        content:""; position:fixed; inset:0; z-index:2147482990; pointer-events:none;
        background:radial-gradient(circle at 50% 42%, rgba(56,189,248,.13), transparent 18rem), #050914;
      }
      html.titan-booting::after {
        content:"TITAN"; position:fixed; left:50%; top:50%; z-index:2147482991;
        transform:translate(-50%,-50%); color:#f8fafc; font:800 14px Arial,sans-serif;
        letter-spacing:.22em; text-transform:uppercase;
      }
      html.titan-booting .layout,
      html.titan-booting .legal-layout { opacity:0; }
      html.titan-ready .layout,
      html.titan-ready .legal-layout { opacity:1; }
    </style>
    <script data-titan-critical-boot>
      document.documentElement.classList.add('titan-booting');
      window.addEventListener('load', function () {
        setTimeout(function () {
          if (typeof window.titanHideBoot === 'function') return;
          document.documentElement.classList.remove('titan-booting');
          document.documentElement.classList.add('titan-ready');
        }, 160);
      });
      setTimeout(function () {
        if (typeof window.titanHideBoot === 'function') return;
        document.documentElement.classList.remove('titan-booting');
        document.documentElement.classList.add('titan-ready');
      }, 1400);
    </script>`;
}

function buildSeoBlock(file, page) {
  const url = absoluteUrl(page.path);
  const indexed = page.robots.startsWith('index');
  const botDirectives = indexed
    ? 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1'
    : page.robots;
  const ogType = file === 'index.html' ? 'website' : (page.schemaType === 'Article' ? 'article' : 'website');
  const adHints = page.ads === true ? `
    <link rel="preconnect" href="https://acscdn.com" crossorigin>
    <link rel="dns-prefetch" href="//acscdn.com">` : '';

  return `    <!-- SEO: TITAN OS -->
    <meta name="description" content="${escapeAttr(page.description)}">
    <meta name="author" content="${escapeAttr(shared.author)}">
    <meta name="robots" content="${escapeAttr(page.robots)}">
    <meta name="googlebot" content="${escapeAttr(botDirectives)}">
    <meta name="bingbot" content="${escapeAttr(botDirectives)}">
    <meta name="image_src" content="${escapeAttr(ogImageUrl)}">
    <link rel="canonical" href="${escapeAttr(url)}">
    <link rel="alternate" hreflang="fr-FR" href="${escapeAttr(url)}">
    <link rel="alternate" hreflang="x-default" href="${escapeAttr(url)}">
    <link rel="icon" href="/favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="192x192" href="/image/logo-192.png">
    <link rel="apple-touch-icon" href="/image/logo-192.png">
    <link rel="manifest" href="/manifest.json">
    <meta property="og:site_name" content="${escapeAttr(shared.siteName)}">
    <meta property="og:locale" content="${escapeAttr(shared.locale)}">
    <meta property="og:type" content="${ogType}">
    <meta property="og:title" content="${escapeAttr(page.title)}">
    <meta property="og:description" content="${escapeAttr(page.description)}">
    <meta property="og:url" content="${escapeAttr(url)}">
    <meta property="og:image" content="${escapeAttr(ogImageUrl)}">
    <meta property="og:image:secure_url" content="${escapeAttr(ogImageUrl)}">
    <meta property="og:image:type" content="image/png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="TITAN OS Sport, journal multisport et progression sportive">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeAttr(page.title)}">
    <meta name="twitter:description" content="${escapeAttr(page.description)}">
    <meta name="twitter:image" content="${escapeAttr(ogImageUrl)}">
    <meta name="twitter:image:alt" content="TITAN OS Sport, journal multisport et progression sportive">
    <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
    <link rel="dns-prefetch" href="//cdn.jsdelivr.net">${adHints}
    <link rel="preload" href="/image/logo.png" as="image">
    <!-- /SEO: TITAN OS -->`;
}

function organizationSchema() {
  return {
    '@type': 'Organization',
    '@id': `${siteUrl}/#organization`,
    name: 'TITAN OS Sport',
    alternateName: ['TITAN Sport', 'TITAN OS Sport'],
    description: 'Application française de suivi sportif multisport et de progression motivante accessible dans le navigateur.',
    url: `${siteUrl}/`,
    email: supportEmail,
    contactPoint: {
      '@type': 'ContactPoint',
      email: supportEmail,
      contactType: 'customer support',
      availableLanguage: ['fr'],
    },
    logo: {
      '@type': 'ImageObject',
      url: appIconUrl,
      width: 192,
      height: 192,
    },
  };
}

function websiteSchema() {
  return {
    '@type': 'WebSite',
    '@id': `${siteUrl}/#website`,
    name: 'TITAN OS Sport',
    alternateName: ['TITAN Sport', 'TITAN OS Sport'],
    url: `${siteUrl}/`,
    inLanguage: shared.language,
    publisher: {
      '@id': `${siteUrl}/#organization`,
    },
  };
}

function appSchema(indexPage) {
  return {
    '@type': ['WebApplication', 'SoftwareApplication'],
    '@id': `${siteUrl}/#app`,
    name: 'TITAN OS Sport',
    alternateName: ['TITAN Sport', 'TITAN OS Sport'],
    url: `${siteUrl}/`,
    applicationCategory: 'SportsApplication',
    operatingSystem: 'Web',
    browserRequirements: 'Requires JavaScript. Works as a Progressive Web App on compatible browsers.',
    inLanguage: shared.language,
    description: indexPage.description,
    softwareVersion: assetVersion,
    image: ogImageUrl,
    screenshot: ogImageUrl,
    installUrl: `${siteUrl}/`,
    isAccessibleForFree: true,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
    },
    featureList: [
      "Journal d'entrainement",
      'Catalogue de plus de 260 sports',
      'Recherche par nom, alias, famille et metrique',
      'Saisie adaptee a chaque discipline',
      'Statistiques sportives',
      'Progression par XP',
      'Objectifs hebdomadaires',
      'Motivation sportive gamifiee',
      'Suivi de recuperation',
      'Aventure et boss',
      'PWA gratuite',
    ],
    publisher: {
      '@id': `${siteUrl}/#organization`,
    },
  };
}

function breadcrumbSchema(file, page) {
  const url = absoluteUrl(page.path);
  const homeItem = {
    '@type': 'ListItem',
    position: 1,
    name: 'TITAN OS',
    item: `${siteUrl}/`,
  };
  if (file === 'index.html') {
    return {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [homeItem],
    };
  }
  return {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: [
      homeItem,
      {
        '@type': 'ListItem',
        position: 2,
        name: page.title.replace(/\s*[|-]\s*TITAN OS.*/i, '').trim(),
        item: url,
      },
    ],
  };
}

function pageSchema(file, page, today) {
  const url = absoluteUrl(page.path);
  return {
    '@type': page.schemaType || 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: page.title,
    headline: page.title,
    description: page.description,
    inLanguage: shared.language,
    isPartOf: {
      '@id': `${siteUrl}/#website`,
    },
    about: {
      '@id': `${siteUrl}/#app`,
    },
    primaryImageOfPage: {
      '@type': 'ImageObject',
      url: ogImageUrl,
      width: 1200,
      height: 630,
    },
    breadcrumb: {
      '@id': `${url}#breadcrumb`,
    },
    dateModified: today,
    publisher: {
      '@id': `${siteUrl}/#organization`,
    },
  };
}

function faqSchema(page, fallbackFaq = guideFaq) {
  const entries = page.faq || fallbackFaq;
  return {
    '@type': 'FAQPage',
    '@id': `${absoluteUrl(page.path)}#faq`,
    mainEntity: entries.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answer,
      },
    })),
  };
}

function buildSchema(file, page, today) {
  const graph = [
    organizationSchema(),
    websiteSchema(),
    appSchema(pages['index.html']),
    pageSchema(file, page, today),
    breadcrumbSchema(file, page),
  ];
  if (file === 'guide.html' || Array.isArray(page.faq)) graph.push(faqSchema(page));
  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}

const today = new Date().toISOString().slice(0, 10);

for (const [file, page] of Object.entries(pages)) {
  let html = readFileSync(file, 'utf8');
  html = html.replace(/([?&]v=)[0-9.]+(?=["'&])/g, `$1${assetVersion}`);
  html = html.replace(/\n\s*<script\s+src=["']\.\/js\/consent\.js[^>]*>\s*<\/script>/gi, '');
  html = normalizeViewport(html);
  html = html.replace(/\n\s*<script\s+type=["']application\/ld\+json["']>\s*\{[\s\S]*?<\/script>/gi, '');
  const titleTag = `<title>${escapeAttr(page.title)}</title>`;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, titleTag);

  html = html.replace(/<head>([\s\S]*?)<\/head>/i, (_, headContent) => {
    let head = removeLooseSeo(removeManagedSeo(headContent));
    head = upsertTag(head, '<meta\\s+name=["\']theme-color["\'][^>]*>', '<meta name="theme-color" content="#0f172a">');
    head = upsertTag(head, '<meta\\s+name=["\']application-name["\'][^>]*>', '<meta name="application-name" content="TITAN OS">');
    head = upsertTag(head, '<meta\\s+name=["\']mobile-web-app-capable["\'][^>]*>', '<meta name="mobile-web-app-capable" content="yes">');
    head = upsertTag(head, '<meta\\s+name=["\']apple-mobile-web-app-capable["\'][^>]*>', '<meta name="apple-mobile-web-app-capable" content="yes">');
    head = upsertTag(head, '<meta\\s+name=["\']apple-mobile-web-app-title["\'][^>]*>', '<meta name="apple-mobile-web-app-title" content="TITAN OS">');
    head = upsertTag(head, '<meta\\s+name=["\']apple-mobile-web-app-status-bar-style["\'][^>]*>', '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">');
    const shouldLoadConsentScript = (page.ads === true && page.robots.startsWith('index')) || page.rewardedAds === true;
    if (shouldLoadConsentScript) {
      head = upsertTag(head, '<script\\s+src=["\']\\./js/consent\\.js[^>]*>\\s*<\\/script>', `<script src="./js/consent.js?v=${assetVersion}" defer></script>`);
    }
    head += `\n    <link rel="stylesheet" href="./css/titan-v100.css?v=${assetVersion}">`;
    head += `\n    <script src="./js/titan-v100.js?v=${assetVersion}" defer></script>`;
    const criticalBoot = page.robots.startsWith('noindex') ? buildCriticalBootBlock() : '';
    const block = buildSeoBlock(file, page);
    const schema = `\n    <script type="application/ld+json" data-seo-schema>\n${JSON.stringify(buildSchema(file, page, today), null, 2).split('\n').map(line => `    ${line}`).join('\n')}\n    </script>`;
    return `<head>${head}\n${criticalBoot}\n${block}${schema}\n</head>`;
  });

  writeFileSync(file, html, 'utf8');
}

const indexedPages = Object.entries(pages)
  .filter(([, page]) => page.robots.startsWith('index'))
  .map(([file, page]) => ({ file, ...page }));

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexedPages.map(page => `  <url>
    <loc>${escapeXml(absoluteUrl(page.path))}</loc>
    <lastmod>${today}</lastmod>
  </url>`).join('\n')}
</urlset>
`;

const robots = `User-agent: *
Allow: /
Allow: /image/
Allow: /favicon.ico
Disallow: /sys_core_override_99.html
Disallow: /sys_core_override_99
Disallow: /sql/
Disallow: /tools/
Disallow: /functions/
Disallow: /*.sql$
Disallow: /*.md$
Disallow: /*.toml$
Disallow: /package.json
Disallow: /package-lock.json

Sitemap: ${siteUrl}/sitemap.xml
`;

const homePreview = pages['index.html'];

const preview = `# Preview moteur de recherche - TITAN OS

Cette preview correspond aux balises demandees aux moteurs apres l'optimisation SEO. Google peut reecrire le titre ou l'extrait selon la requete et le contenu visible de la page.

\`\`\`text
${homePreview.title}
https://titan-app.fr/
${homePreview.description}
\`\`\`

Preview partage social:

\`\`\`text
${homePreview.title}
${homePreview.description}
Image: https://titan-app.fr/image/og-titan-os.png
Favicon Google: https://titan-app.fr/favicon.ico
\`\`\`

Apres deploiement, soumets de nouveau \`https://titan-app.fr/sitemap.xml\` dans Google Search Console, puis inspecte en priorite \`https://titan-app.fr/\`, \`https://titan-app.fr/fonctionnalites\`, \`https://titan-app.fr/suivi-sportif\`, \`https://titan-app.fr/journal-entrainement\`, \`https://titan-app.fr/progression-sportive\` et \`https://titan-app.fr/motivation-sport\`.
`;

writeFileSync('sitemap.xml', sitemap, 'utf8');
writeFileSync('robots.txt', robots, 'utf8');
writeFileSync('PUBLIC_SEARCH_PREVIEW.md', preview, 'utf8');
