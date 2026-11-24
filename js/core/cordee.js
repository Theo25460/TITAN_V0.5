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
    holdHours: 72,     // V1.8.2: taking the relay reserves it for 3 days at most
    offerHours: 48,    // V1.8.2: a handover nobody accepts expires after 2 days and frees the relay
    turnLimit: 8,      // V1.8.2: holds and handovers per cordée
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
    // V1.8.2: what members who left had brought stays acquired; their part of the goal stopped at what they brought. Never who or why.
    const kept = int(st.kept)
      ? `${plural(int(st.kept), "longueur reste acquise", "longueurs restent acquises")} grâce à des membres partis : leur part de l’objectif s’arrête à ce qu’ils ont apporté.`
      : null;
    const together = int(st.joined) === 1 && int(st.needs) >= 2 && st.status === "active"
      ? "Tu continues seul·e : il faut les longueurs d’au moins deux membres, celles des membres partis comptent. Invite par lien pour reformer la cordée."
      : null;
    const varietyLine = families.length
      ? `Voies ouvertes : ${families.join(", ")}.${families.length < 5 ? " Chaque nouvelle famille de sport ouvre 2 longueurs." : ""}`
      : "Chaque famille de sport qui contribue ouvre 2 longueurs, au-delà de la première.";
    const unlocked = summited
      ? `Sommet atteint : ${route.camps[RULE.camps - 1][0]}. Titre « ${route.title} » pour chaque membre qui a apporté une longueur.`
      : reached.length ? `Débloqué : ${reached.map((c) => c.name).join(" · ")}.` : "Premier camp à 25 % de l’objectif.";
    return { route, camps: reached, next, goal, mine, group, kept, together, variety: varietyLine, unlocked, summited, title: route.title };
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
    /* V1.8.2 — optional turns (20261125090000_cordee_reprise.sql): take the relay, hand it over, withdraw one's offer, accept an offer. */
    turns: { take: "Prendre le relais", handover: "Passer la main", withdraw: "Retirer ma passation", accept: "Reprendre le relais" },
  });
  /** What leaving a cordée does (V1.8.2), the same sentence on the website and in the Android app. */
  const LEAVE = "Les longueurs que tu as déjà apportées restent acquises pour la cordée, et ta part de l’objectif s’arrête à ce que tu as apporté. Tu ne verras plus la cordée ; si tu tenais le relais, il est libéré. Personne ne voit pourquoi tu pars.";
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
    RELAY_HELD: "Un autre membre a pris le relais : c’est à lui de le recevoir, ou de passer la main.",
    RELAY_NOT_HOLDER: "Tu ne tiens pas ce relais.",
    RELAY_HANDOVER_PENDING: "Une passation est déjà en cours : retire-la d’abord.",
    RELAY_HANDOVER_TARGET: "Ce membre ne peut pas reprendre le relais. Choisis un autre membre ou toute la cordée.",
    RELAY_HANDOVER_SELF: "C’est ta propre passation : tu peux la retirer.",
    RELAY_HANDOVER_TAKEN: "Un autre membre vient de reprendre le relais.",
    RELAY_NO_HANDOVER: "Aucune passation ne t’est proposée.",
    RELAY_GROUP_TOO_SMALL: "Personne d’autre dans la cordée ne peut reprendre le relais pour l’instant. Invite un ami par lien : le passage reste ouvert.",
    RELAY_TURN_LIMIT: `Le relais a déjà changé de main ${RULE.turnLimit} fois dans cette cordée.`,
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
      // V1.8.2 — the hold and the handover. No hint ever says why someone paused or left.
      held: `Un membre a pris le relais : il le reçoit avec sa propre séance. S’il passe la main, tu pourras le reprendre.`,
      holder: `Tu tiens le relais : ta séance confirmée d’un autre jour te permet de le recevoir. Si tu dois faire une pause, passe la main.`,
      holder_session: `Tu tiens le relais : une séance confirmée d’au moins ${RULE.oneLongueur} minutes d’effort, un autre jour que l’ouverture, te permet de le recevoir. Si tu dois faire une pause, passe la main.`,
      paused: `Tu as passé la main : le relais reste réservé jusqu’à ce qu’un membre l’accepte, ${RULE.offerHours} h au plus. Sans réponse, il redevient libre pour toute la cordée.`,
      offered: `On te propose de reprendre le relais. Tu le reçois ensuite avec ta propre séance confirmée d’un autre jour : rien n’est validé d’avance.`,
      alone: "Il faut un autre membre encordé pour recevoir le relais. Invite un ami par lien : le passage reste ouvert.",
    };
    const can = r.can === "transmit" || r.can === "confirm" ? r.can : null;
    // V1.8.2: only the turn actions the server offers, in its order; the holder's choices are the members the server allows.
    const turns = (Array.isArray(r.turn) ? r.turn : []).filter((t) => RELAY.turns[t]).map((t) => ({ action: t, label: RELAY.turns[t] }));
    const choices = turns.some((t) => t.action === "handover") && Array.isArray(r.choices)
      ? r.choices.filter((c) => c && c.id).map((c) => ({ id: String(c.id), name: String(c.name || "Membre de la cordée") })) : [];
    const h = r.handover && typeof r.handover === "object" && r.handover.pending ? r.handover : null;
    const holder = status === "opened" && r.holder
      ? (r.holder.me ? `Tu as pris le relais (${RULE.holdHours} h au plus).` : `Relais pris en charge par ${who(r.holder, "un membre")}.`)
      : null;
    const handover = !h ? null
      : h.mine ? (h.open ? `Tu as passé la main à toute la cordée : le premier membre qui accepte reprend le relais.` : `Tu as passé la main à ${who(h.to, "un membre")} : en attente de sa réponse.`)
        : h.forMe ? (h.open ? "Le relais est proposé à toute la cordée : tu peux le reprendre." : "Le relais t’est proposé : tu peux le reprendre.")
          : "Passation en cours.";
    return {
      name: RELAY.name, intro: RELAY.intro, status, shared: cap1(shared), mine: MINE[r.hint] || MINE.session, can,
      label: can ? RELAY.labels[can] : null, holder, handover, turns, choices,
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
  /** What a player reads after a turn action (V1.8.2); a repeated call (changed: false) changes nothing. */
  function turnResult(answer, action) {
    if (answer && answer.changed === false) return { title: "Déjà fait", message: "Rien n’a changé." };
    return ({
      take: { title: "Relais pris", message: `Il t’est réservé ${RULE.holdHours} h au plus. Reçois-le avec une séance confirmée d’un autre jour.` },
      handover: { title: "Main passée", message: `Le relais reste réservé ${RULE.offerHours} h au plus, le temps qu’un membre l’accepte.` },
      withdraw: { title: "Passation retirée", message: "Tu tiens de nouveau le relais." },
      accept: { title: "Relais repris", message: "Il te reste à le recevoir avec ta propre séance confirmée d’un autre jour." },
    })[action] || { title: "C’est fait", message: "" };
  }
  function relayMessage(error) {
    const raw = String((error && error.message) || error || "");
    const key = Object.keys(RELAY_MESSAGES).find((k) => raw.includes(k));
    return key ? RELAY_MESSAGES[key] : null;
  }

  /* ------------------------------------------------------------------ V1.8.3 — a group that sets off again (20261126090000_cordee_suite.sql)
     After a cordée ends, a member proposes a new private route (an existing route, a tested pace, a duration); each member accepts or
     declines; from two acceptances a NEW cordée starts with the counters at zero, with those who accepted only. The finished cordée stays
     closed and readable, with its story (shareable steps and group decisions). The server decides who may answer (proposal.turn) and how
     the state reads (suite.hint); this only words it. A refusal is a count, never a name; nobody is told why someone declined. */
  const SUITE = Object.freeze({
    proposalHours: 72, // a proposal stays open 3 days at most
    windowDays: 14,    // after the end of the cordée
    openMax: 3,        // distinct open proposals per finished cordée
    labels: { propose: "Proposer un nouvel itinéraire", accept: "Accepter", decline: "Décliner", withdraw: "Retirer ma proposition" },
  });
  const SUITE_MESSAGES = Object.freeze({
    SUITE_NOT_FINISHED: "La cordée est encore en cours : la suite se propose une fois qu’elle est terminée.",
    SUITE_CLOSED: "Cette proposition n’est plus ouverte.",
    SUITE_ALREADY_IN: "Tu es déjà reparti·e avec une autre proposition. Quitte cette cordée pour en choisir une autre.",
    SUITE_PENDING: "Tu as déjà une proposition ouverte pour cette cordée : retire-la d’abord pour en faire une autre.",
    SUITE_LIMIT: `Il y a déjà ${SUITE.openMax} propositions ouvertes : choisis parmi elles.`,
    SUITE_GROUP_TOO_SMALL: "Personne d’autre de la cordée ne peut repartir avec toi pour l’instant. Tu peux former une cordée et inviter par lien.",
    SUITE_UNAVAILABLE: "Cette proposition n’est pas ouverte pour toi.",
    SUITE_NOT_MINE: "Seule la personne qui a proposé peut retirer cette proposition.",
    SUITE_OWN: "C’est ta proposition : tu peux la retirer.",
    SUITE_NOT_FOUND: "Cette proposition n’existe plus.",
    SUITE_FULL: "La nouvelle cordée compte déjà dix membres.",
    SUITE_INVALID: "Action inconnue.",
  });
  const paceOrder = ["douce", "reguliere", "soutenue"];
  /** The pace to suggest for the next route: the same after a summit, one step softer otherwise (never harder than what was lived). */
  function nextPace(previous, summited) {
    const i = Math.max(0, paceOrder.indexOf(previous));
    return summited ? paceOrder[i] : paceOrder[Math.max(0, i - 1)];
  }
  const routeName = (id) => `« ${(ROUTES[id] || ROUTES.aube).name} »`;
  const paceText = (p) => (PACES[p] || PACES.reguliere).label.toLowerCase();
  /** « La passe des Marées · allure douce · 14 jours » */
  function itinerary(p) {
    return `${routeName(p && p.route)} · allure ${paceText(p && p.pace)} · ${int(p && p.days)} jours`;
  }
  const personName = (p) => (!p ? "Un membre" : p.me ? "Toi" : p.name || "Membre de la cordée");
  /** Words for state.suite (titan_cordees_v1 → cordees[i].suite on a finished cordée). null when there is none. */
  function suite(state) {
    const s = state && state.suite;
    if (!s || typeof s !== "object") return null;
    const HINTS = {
      propose: "Votre cordée est terminée. Propose un nouvel itinéraire : seuls ceux qui acceptent repartent, avec des compteurs à zéro.",
      answer: "Ton groupe propose de repartir. Accepte ou décline, quand tu veux : rien ne part sans deux acceptations.",
      mine: "Ta proposition attend les autres. La nouvelle cordée part dès qu’un autre membre accepte ; les suivants la rejoignent en acceptant.",
      in: "Tu es reparti·e avec ton groupe. Cette cordée reste close et consultable.",
      full: `Il y a déjà ${SUITE.openMax} propositions ouvertes : choisis parmi elles.`,
      alone: "Personne d’autre de cette cordée ne peut repartir avec toi pour l’instant.",
      closed: "Cette cordée reste consultable. Le temps de proposer une suite est passé : forme une nouvelle cordée quand tu veux.",
      suspended: "Ton compte ne peut pas proposer ni répondre pour l’instant.",
    };
    const proposals = (Array.isArray(s.proposals) ? s.proposals : []).map((p) => {
      const yes = int(p.yes), no = int(p.no), eligible = Math.max(int(p.eligible), yes + no);
      const waiting = Math.max(0, eligible - yes - no);
      const named = (Array.isArray(p.accepted) ? p.accepted : []).map(personName);
      const others = int(p.others);
      const who = named.length ? `${named.join(", ")}${others ? ` et ${plural(others, "autre membre", "autres membres")}` : ""}` : others ? plural(others, "membre", "membres") : "";
      const counts = [`${yes} sur ${eligible} ${yes > 1 ? "ont accepté" : "a accepté"}`];
      if (no) counts.push(`${no} ${no > 1 ? "ont décliné" : "a décliné"}`);
      if (waiting && (p.status === "open" || p.status === "started")) counts.push(`${waiting} ${waiting > 1 ? "n’ont" : "n’a"} pas encore répondu`);
      const status = {
        open: p.mine ? "Ta proposition" : `Proposée par ${personName(p.by)}`,
        started: `Repartie à ${int(p.joined) || yes}`,
        withdrawn: "Retirée",
        merged: "Ralliée à une autre proposition",
        expired: "Restée sans suite",
        cancelled: "Close",
      }[p.status] || "Close";
      const mineText = p.status === "started"
        ? (p.myStatus === "joined" ? "Tu fais partie de la nouvelle cordée." : p.myStatus === "invited" ? "La cordée est partie : tu peux encore t’encorder ou décliner." : p.myAnswer === "no" ? "Tu as décliné. Tu peux encore changer d’avis." : null)
        : p.status === "open"
          ? (p.mine ? "Tu as accepté en proposant." : p.myAnswer === "yes" ? "Tu as accepté : tu repars si un autre membre accepte aussi." : p.myAnswer === "no" ? "Tu as décliné. Tu peux encore changer d’avis." : null)
          : null;
      const actions = (Array.isArray(p.turn) ? p.turn : []).filter((t) => SUITE.labels[t]).map((t) => ({ action: t, label: p.status === "started" && t === "accept" ? "S’encorder" : SUITE.labels[t] }));
      return { id: String(p.id || ""), status: p.status, route: p.route, title: itinerary(p), by: status, counts: counts.join(" · "), accepted: who ? `${named.length + others > 1 ? "Ont accepté" : "A accepté"} : ${who}.` : null,
        mine: mineText, actions, expiresAt: p.status === "open" ? p.expiresAt || null : null, startedId: p.startedId || null };
    });
    const open = proposals.filter((p) => p.status === "open").length;
    return {
      title: "Repartir ensemble",
      hint: HINTS[s.hint] || HINTS.propose,
      choice: s.choice || open >= 2 ? "Plusieurs itinéraires sont proposés : chacun choisit le sien, une acceptation à la fois. Choisir l’un retire ton acceptation des autres." : null,
      can: Array.isArray(s.can) && s.can.includes("propose"),
      label: SUITE.labels.propose,
      previous: s.previous || null,
      pace: nextPace(s.previous && s.previous.pace, s.previous && s.previous.summited),
      proposals,
    };
  }
  /** The story of a finished cordée: shareable steps and the group's decisions only (state.story). */
  function story(state) {
    const list = Array.isArray(state && state.story) ? state.story : [];
    const route = ROUTES[state && state.route] || ROUTES.aube;
    return list.map((e) => {
      switch (e && e.kind) {
        case "formed": return { kind: e.kind, at: e.at, text: `La cordée se forme${int(e.members) > 1 ? ` à ${int(e.members)}` : ""} sur ${routeName(route.id)}.` };
        case "follows": return { kind: e.kind, at: e.at, text: `Elle fait suite à ${routeName(e.route)}${e.summited ? ", atteinte ensemble" : ""}.` };
        case "relay_opened": return { kind: e.kind, at: e.at, text: e.who && e.who.me ? "Tu ouvres le passage de la Sentinelle." : `${who(e.who, "Un membre")} ouvre le passage de la Sentinelle.` };
        case "relay_confirmed": return { kind: e.kind, at: e.at, text: `${e.who && e.who.me ? "Tu reçois" : `${who(e.who, "Un membre")} reçoit`} le relais : la Sentinelle laisse passer la cordée.` };
        case "camps": return { kind: e.kind, at: e.at, text: `${plural(Math.min(RULE.camps, int(e.camps)), "camp atteint", "camps atteints")} : ${route.camps.slice(0, Math.min(RULE.camps, int(e.camps))).map((c) => c[0]).join(" · ")}.` };
        case "summit": return { kind: e.kind, at: e.at, text: `Sommet atteint : ${route.camps[RULE.camps - 1][0]}, ${plural(int(e.total), "longueur", "longueurs")} ensemble.` };
        case "ended": return { kind: e.kind, at: e.at, text: `La cordée s’arrête à ${int(e.total)} / ${int(e.target)} longueurs. Ce qui est fait reste fait.` };
        case "proposal": {
          const answered = `${plural(int(e.yes), "acceptation", "acceptations")}${int(e.no) ? `, ${plural(int(e.no), "refus", "refus")}` : ""}`;
          const end = { open: "en attente", started: "le groupe repart", withdrawn: "retirée", merged: "ralliée à une autre", expired: "restée sans suite", cancelled: "close" }[e.status] || "close";
          return { kind: e.kind, at: e.at, text: `${personName(e.by)} propose ${itinerary(e)} — ${answered}, ${end}.` };
        }
        case "suite": return { kind: e.kind, at: e.at, text: `Le groupe repart à ${int(e.joined)} sur ${routeName(e.route)}, compteurs à zéro.` };
        default: return null;
      }
    }).filter(Boolean);
  }
  /** The finished cordée a running one follows (state.follows): closed and readable from the new one. */
  function follows(state) {
    const f = state && state.follows;
    if (!f || typeof f !== "object") return null;
    const outcome = f.summited ? "sommet atteint" : `${int(f.total)} / ${int(f.target)} longueurs`;
    return `Suite de ${routeName(f.route)} (${outcome}, à ${int(f.group)}). Proposée par ${personName(f.proposedBy).replace(/^Toi$/, "toi")}. Les compteurs sont repartis de zéro.`;
  }
  function suiteResult(answer, action) {
    if (answer && answer.changed === false) return { title: "Déjà fait", message: "Rien n’a changé." };
    if (answer && answer.started && (action === "accept" || action === "propose")) return { title: "La cordée repart", message: "Elle part de zéro avec ceux qui ont accepté ; les autres peuvent encore la rejoindre." };
    if (answer && answer.canonical) return { title: "Même itinéraire", message: "Cette proposition existait déjà : tu l’as acceptée." };
    return ({
      propose: { title: "Itinéraire proposé", message: "Chacun accepte ou décline. La cordée part dès qu’un autre membre accepte." },
      accept: { title: "Tu as accepté", message: "Tu repars dès qu’un autre membre accepte aussi." },
      decline: { title: "Tu as décliné", message: "Personne ne voit qui a décliné : seulement combien." },
      withdraw: { title: "Proposition retirée", message: "Plus personne n’a à y répondre." },
    })[action] || { title: "C’est fait", message: "" };
  }
  function suiteMessage(error) {
    const raw = String((error && error.message) || error || "");
    const key = Object.keys(SUITE_MESSAGES).find((k) => raw.includes(k));
    return key ? SUITE_MESSAGES[key] : null;
  }

  const api = { RULE, PACES, DAYS, FAMILIES, ROUTES, share, longueursOfDay, cap, variety, simulate, explain, suggestPace, RELAY, RELAY_MESSAGES, LEAVE, relay, relayResult, turnResult, relayMessage,
    SUITE, SUITE_MESSAGES, nextPace, itinerary, suite, story, follows, suiteResult, suiteMessage };
  root.TitanCordee = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
