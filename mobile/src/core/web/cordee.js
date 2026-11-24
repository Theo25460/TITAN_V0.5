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

  /* ------------------------------------------------------------------ V1.8.1 — the relay step (20261124090000_cordee_relay.sql)
     One step on the pilot route: a member TRANSMITS with a confirmed session that brought a longueur, ANOTHER member CONFIRMS with their
     own confirmed session on another day. The server decides who can act (state.relay.can) and why not (state.relay.hint); this only
     words it. The relay adds no longueur, XP, credit or title. Only the game action, a family label and an allowed name are shown. */
  const RELAY = Object.freeze({
    route: "aube",
    step: "sentinelle",
    name: "Le relais de la Sentinelle",
    intro: "Un membre ouvre le passage avec une séance confirmée, un autre reçoit le relais un autre jour avec la sienne. Le relais ne compte aucune longueur de plus : il fait passer la corde de l’un à l’autre.",
    labels: { transmit: "Transmettre le relais", confirm: "Confirmer le relais" },
  });
  const RELAY_MESSAGES = Object.freeze({
    RELAY_OWN: "Tu as ouvert ce passage : c’est à un autre membre de recevoir le relais.",
    RELAY_NO_SESSION: `Il faut une séance confirmée par TITAN dans la cordée, sur une journée d’au moins ${RULE.oneLongueur} minutes d’effort. Une séance en attente de vérification ne compte pas encore.`,
    RELAY_OTHER_DAY: "Le relais se reçoit un autre jour que celui de la séance qui a ouvert le passage.",
    RELAY_ALREADY_OPEN: "Le passage vient d’être ouvert par un autre membre.",
    RELAY_ALREADY_CONFIRMED: "Le relais a déjà été reçu par un autre membre.",
    RELAY_NOT_OPEN: "Le passage n’est pas encore ouvert.",
    RELAY_UNAVAILABLE: "Ce relais n’est pas disponible pour toi.",
    RELAY_NOT_ON_ROUTE: "Cette route n’a pas d’étape de relais.",
    RELAY_INVALID: "Action de relais inconnue.",
  });
  const who = (p, fallback) => {
    if (!p) return fallback;
    const fam = FAMILIES[p.family] ? ` (${FAMILIES[p.family].label})` : "";
    return `${p.me ? "toi" : p.name || "Membre de la cordée"}${fam}`;
  };
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  /** Words for state.relay (titan_cordees_v1 → cordees[i].relay, or titan_cordee_relay_v1). null when the cordée has no relay step. */
  function relay(state) {
    const r = state && state.relay;
    if (!r || typeof r !== "object") return null;
    const status = ["waiting", "opened", "confirmed"].includes(r.status) ? r.status : "waiting";
    const shared = status === "confirmed"
      ? `Relais passé : ${who(r.opener, "un membre")} → ${who(r.receiver, "un membre")}. La Sentinelle laisse passer la cordée.`
      : status === "opened"
        ? (r.opener && r.opener.me ? `Tu as ouvert le passage${FAMILIES[r.opener.family] ? ` (${FAMILIES[r.opener.family].label})` : ""}.` : `Passage ouvert par ${who(r.opener, "un membre")}. Le relais attend un autre membre.`)
        : "Passage fermé : personne ne l’a encore ouvert.";
    const MINE = {
      transmit: "Ta séance confirmée peut ouvrir le passage : transmets le relais à la cordée.",
      session: `Une journée à ${RULE.oneLongueur} minutes d’effort confirmé dans la cordée te permet d’ouvrir le passage.`,
      own: "À un autre membre de jouer : il reçoit le relais avec sa propre séance confirmée, un autre jour. Toi, tu continues d’apporter tes longueurs.",
      confirm: "Ta séance confirmée d’un autre jour te permet de recevoir le relais.",
      other_day: `Pour recevoir le relais : une séance confirmée d’au moins ${RULE.oneLongueur} minutes d’effort, un autre jour que l’ouverture du passage, puis « ${RELAY.labels.confirm} ».`,
      join: "S’encorder d’abord pour prendre part au relais.",
      done: `À ton tour de faire avancer la cordée : chaque journée à ${RULE.oneLongueur} minutes d’effort confirmé apporte une longueur vers le sommet.`,
      closed: "La cordée est terminée : le relais reste où il en est.",
    };
    const can = r.can === "transmit" || r.can === "confirm" ? r.can : null;
    return {
      name: RELAY.name, intro: RELAY.intro, status, shared: cap1(shared), mine: MINE[r.hint] || MINE.session, can,
      label: can ? RELAY.labels[can] : null,
      steps: [
        { id: "transmit", label: "Passage ouvert", done: status !== "waiting" },
        { id: "confirm", label: "Relais reçu par un autre membre", done: status === "confirmed" },
      ],
    };
  }
  /** What a player reads after an action: a repeated call (changed: false) unlocks nothing more. */
  function relayResult(answer, action) {
    if (answer && answer.changed === false) return { title: "Déjà fait", message: "Rien de plus n’est débloqué : le relais compte une seule fois." };
    return action === "confirm"
      ? { title: "Relais reçu", message: "La cordée a passé le relais de la Sentinelle." }
      : { title: "Passage ouvert", message: "Un autre membre peut maintenant recevoir le relais." };
  }
  function relayMessage(error) {
    const raw = String((error && error.message) || error || "");
    const key = Object.keys(RELAY_MESSAGES).find((k) => raw.includes(k));
    return key ? RELAY_MESSAGES[key] : null;
  }

  const api = { RULE, PACES, DAYS, FAMILIES, ROUTES, share, longueursOfDay, cap, variety, simulate, explain, suggestPace, RELAY, RELAY_MESSAGES, relay, relayResult, relayMessage };
  root.TitanCordee = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
