/* La Grande Cordée — the cooperative expedition between friends (docs/SOCIAL_EXCELLENCE.md, docs/live/GAME_DESIGN.md § 8.1).
   Shared unchanged by the website and the Android app (mobile/scripts/sync-web-core.mjs). Pure: no I/O, no time source.
   The server (titan_cordee_create_v1 / titan_cordees_v1) is the authority: it counts the longueurs, the summit and the title;
   this module mirrors its rule to explain it, names the four routes and their camps, and words what each player sees.
   Nothing here is XP, credit or an advantage: a route title is cosmetic and nothing can be bought. */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------------ rule (mirror of 20261120110000_grande_cordee.sql) */
  const RULE = Object.freeze({
    oneLongueur: 12,   // counted effort-minutes in a day for 1 longueur (a short walk counts)
    twoLongueurs: 35,  // and for 2, the most a day can bring: regularity beats volume
    dailyCap: 90,      // counted minutes per day, as everywhere in TITAN
    capShare: 1.5,     // a member's contribution counts up to 1.5 × the share: nobody summits alone
    contributors: 2,   // with two people or more (joined or invited), two of them must have brought a longueur
    varietyPerFamily: 2, // each sport family beyond the first brings 2 longueurs once
    varietyMax: 8,
    camps: 4,          // at 25, 50, 75 and 100 %
  });
  const PACES = Object.freeze({
    douce: { id: "douce", label: "Douce", perWeek: 3, text: "Environ trois longueurs par semaine chacun : deux ou trois courtes séances suffisent." },
    reguliere: { id: "reguliere", label: "Régulière", perWeek: 5, text: "Environ cinq longueurs par semaine chacun : trois ou quatre séances." },
    soutenue: { id: "soutenue", label: "Soutenue", perWeek: 8, text: "Environ huit longueurs par semaine chacun : pour des habitués de quatre à cinq séances." },
  });
  const DAYS = Object.freeze([7, 14, 21, 28]);
  const FAMILIES = Object.freeze({
    endurance: { id: "endurance", label: "Souffle", text: "endurance" },
    force: { id: "force", label: "Acier", text: "force" },
    technique: { id: "technique", label: "Prisme", text: "technique et précision" },
    jeu: { id: "jeu", label: "Ardeur", text: "jeux, duels et combat" },
    mobilite: { id: "mobilite", label: "Sève", text: "mobilité et souffle calme" },
  });

  /* ------------------------------------------------------------------ the four routes (one per world of the Adventure) */
  const ROUTES = Object.freeze({
    aube: {
      id: "aube", name: "Les crêtes de l’Aube", world: "l’Aube", title: "Brin de l’Aube", guardian: "la Sentinelle de rosée",
      intro: "La première lumière ne franchit les crêtes que si plusieurs cordes la tirent ensemble.",
      camps: [
        ["Le gué des premiers pas", "Le gué est franchi. Chacun a mouillé ses chevilles, personne n’est resté sur la rive."],
        ["La terrasse des bergers", "Les bergers ont laissé du feu. Vos cordes se croisent pour la première fois."],
        ["Le col des Sentinelles", "La Sentinelle de rosée vous laisse passer : elle a compté les retours, pas les exploits."],
        ["La crête de l’Aube", "Le soleil passe la crête. Le brin de chacun est tressé dans la lumière."],
      ],
    },
    marees: {
      id: "marees", name: "La passe des Marées", world: "les Marées", title: "Brin des Marées", guardian: "la Gardienne des courants",
      intro: "La passe ne s’ouvre qu’entre deux marées, à ceux qui rament au même rythme.",
      camps: [
        ["L’anse calme", "Les barques sont à l’eau. Chacun a trouvé sa place dans le sillage."],
        ["Le phare des récifs", "Le phare s’allume pour vous : un équipage se reconnaît à sa lumière."],
        ["Le chenal de la Gardienne", "La Gardienne des courants lit votre sillage : il est régulier, elle s’écarte."],
        ["La passe ouverte", "La marée vous porte au large. Chaque rame a compté."],
      ],
    },
    forge: {
      id: "forge", name: "Les cols d’Obsidienne", world: "les Forges d’Obsidienne", title: "Brin d’Obsidienne", guardian: "le Colosse de fer",
      intro: "Les cols d’Obsidienne ne se franchissent pas en force : ils se franchissent ensemble, braise après braise.",
      camps: [
        ["La halle des souffleurs", "Le premier soufflet tire. La braise prend parce que chacun a soufflé."],
        ["Le pont des enclumes", "Le pont tient : il a été forgé à plusieurs marteaux, de poids différents."],
        ["La porte du Colosse", "Le Colosse de fer s’agenouille devant une cordée qui revient, séance après séance."],
        ["Le col d’Obsidienne", "La roche noire brille sous vos pas. Le brin d’Obsidienne est à vous."],
      ],
    },
    aurores: {
      id: "aurores", name: "La voûte des Aurores", world: "les Aurores", title: "Brin des Aurores", guardian: "l’Astronome des glaces",
      intro: "Sous la voûte, les aurores ne dansent que pour ceux qui marchent ensemble dans la nuit.",
      camps: [
        ["Le camp des lanternes", "Chaque lanterne allumée est un membre de la cordée. Aucune ne brille plus que l’autre."],
        ["Le lac gelé", "La glace tient sous vos pas mêlés : légers et lourds, rapides et lents."],
        ["L’observatoire", "L’Astronome des glaces note vos noms dans le ciel, sans ordre ni rang."],
        ["La voûte des Aurores", "Le ciel s’embrase. La cordée a atteint la voûte."],
      ],
    },
  });

  /* ------------------------------------------------------------------ mirrors */
  const int = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);
  /** Longueurs per member for the whole cordée: the server's private.titan_cordee_share. */
  function share(pace, days) {
    const per = (PACES[pace] || PACES.reguliere).perWeek;
    return Math.max(1, Math.ceil((per * Math.max(1, int(days))) / 7));
  }
  /** Longueurs one day of counted effort-minutes brings: 0, 1 or 2. */
  function longueursOfDay(minutes) {
    const m = Math.min(RULE.dailyCap, Number(minutes) || 0);
    return m >= RULE.twoLongueurs ? 2 : m >= RULE.oneLongueur ? 1 : 0;
  }
  const cap = (shareValue) => Math.ceil(int(shareValue) * RULE.capShare);
  function variety(families) {
    const n = new Set((families || []).filter((f) => FAMILIES[f])).size;
    return Math.min(RULE.varietyMax, RULE.varietyPerFamily * Math.max(0, n - 1));
  }
  /** Mirror of the whole count, for previews and tests: members = [{ days: [minutes per day], families: [...] }]. */
  function simulate({ pace = "reguliere", days = 14, members = [] } = {}) {
    const s = share(pace, days), c = cap(s);
    const counted = members.map((m) => Math.min(c, (m.days || []).reduce((sum, minutes) => sum + longueursOfDay(minutes), 0)));
    const families = [...new Set(members.flatMap((m) => m.families || []))];
    const target = s * Math.max(1, members.length);
    const total = counted.reduce((a, b) => a + b, 0) + variety(families);
    // With two people or more, at least two of them must have brought a longueur (the server's « needs »).
    const contributors = counted.filter((n) => n > 0).length;
    const summit = total >= target && contributors >= Math.min(2, members.length);
    return { share: s, cap: c, target, counted, variety: variety(families), total, contributors, summit, camps: Math.min(RULE.camps, Math.floor((RULE.camps * total) / target)) };
  }

  /* ------------------------------------------------------------------ what a player reads */
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  /** Words for a server state (titan_cordees_v1 → cordees[i]). Always says what is common, what is mine, what the group did, what is open. */
  function explain(state) {
    const st = state || {};
    const route = ROUTES[st.route] || ROUTES.aube;
    const camps = Math.max(0, Math.min(RULE.camps, int(st.camps)));
    const reached = route.camps.slice(0, camps).map(([name, text], i) => ({ index: i + 1, name, text }));
    const next = camps < RULE.camps ? { index: camps + 1, name: route.camps[camps][0], at: Math.ceil((int(st.target) * (camps + 1)) / RULE.camps) } : null;
    const me = st.me || null;
    const families = (st.families || []).filter((f) => FAMILIES[f]).map((f) => FAMILIES[f].label);
    const summited = st.status === "summited";
    const goal = `Objectif commun : ${plural(int(st.target), "longueur", "longueurs")} ensemble${int(st.joined) > 1 ? `, soit ${int(st.share)} par membre encordé` : ""}.`;
    const mine = me
      ? (me.strand ? `Ton brin est tressé : ${plural(int(me.counted), "longueur", "longueurs")} apportées.` : `Ta part : ${plural(int(me.counted), "longueur", "longueurs")} sur ${int(st.share)}. Un jour à ${RULE.oneLongueur} min d’effort en apporte une, à ${RULE.twoLongueurs} min deux.`)
      : "Rejoins la cordée pour y apporter tes longueurs.";
    const group = `La cordée : ${int(st.total)} / ${int(st.target)}${int(st.variety) ? ` (dont ${int(st.variety)} grâce à la variété des sports)` : ""}.`;
    const varietyLine = families.length
      ? `Voies ouvertes : ${families.join(", ")}.${families.length < 5 ? " Chaque nouvelle famille de sport ouvre 2 longueurs." : ""}`
      : "Chaque famille de sport qui contribue ouvre 2 longueurs, au-delà de la première.";
    const unlocked = summited
      ? `Sommet atteint : ${route.camps[RULE.camps - 1][0]}. Titre « ${route.title} » pour chaque membre qui a apporté une longueur.`
      : reached.length ? `Débloqué : ${reached.map((c) => c.name).join(" · ")}.` : "Premier camp à 25 % de l’objectif.";
    return { route, camps: reached, next, goal, mine, group, variety: varietyLine, unlocked, summited, title: route.title };
  }

  /** A pace that fits the player's last 28 days (active days), for « Découvrir un défi adapté ». Never more than what was done. */
  function suggestPace(activeDays28) {
    const d = int(activeDays28);
    return d >= 16 ? "soutenue" : d >= 8 ? "reguliere" : "douce";
  }

  const api = { RULE, PACES, DAYS, FAMILIES, ROUTES, share, longueursOfDay, cap, variety, simulate, explain, suggestPace };
  root.TitanCordee = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
