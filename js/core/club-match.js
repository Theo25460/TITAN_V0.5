/* V1.8.5 — Rencontres entre clubs (docs/V185_RENCONTRES_CLUBS.md).
   Shared unchanged by the website and the Android app (mobile/scripts/sync-web-core.mjs), and by the score simulations
   (tools/sim/club-match-sim.mjs). Pure: no I/O, no time source.
   The server (titan_club_match_v1 / titan_club_match_act_v1) is the authority: it counts the active days, the shares and the rates, and
   it gives the other club nothing but its name, its number of participants and its rate. This module mirrors the score rule (to explain
   it and to simulate it) and words what each member reads. Nothing here is XP, credit, a ranking of people or an advantage. */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------------ rule (mirror of 20261128090000_club_match.sql) */
  const RULE = Object.freeze({
    activeMinutes: 12, // counted effort-minutes in a Paris day for an active day (the Cordée longueur rule, as in the club season)
    dailyCap: 90,      // counted minutes per day, as everywhere in TITAN
    shareCap: 1,       // a participant counts up to their own share: nobody carries their club alone
    threshold: 3,      // a club's rate exists only with 3 participants still in the meeting
    goal: 60,          // cooperation: the common score (mean of the two rates) to reach together, in % (docs/V185_SIMULATIONS.md, F)
    tieMargin: 5,      // comparison: two rates less than 5 points apart are a tie (docs/V185_SIMULATIONS.md, G)
    versusWeeks: 2,    // comparison (closed during the pilot): two weeks only, one week is decided by chance too often (G)
    weeks: [1, 2],
    startFromDays: 1,  // the start is tomorrow at the earliest, so that both organisers accept before it
    startWithinDays: 28,
    joinDays: 2,       // members choose to take part until the end of the second day
    reportDays: 60,
  });
  const PACES = Object.freeze({
    douce: { id: "douce", label: "Douce", perWeek: 2, short: "2 jours actifs par semaine" },
    reguliere: { id: "reguliere", label: "Régulière", perWeek: 3, short: "3 jours actifs par semaine" },
    soutenue: { id: "soutenue", label: "Soutenue", perWeek: 4, short: "4 jours actifs par semaine" },
  });
  const FORMATS = Object.freeze({
    cooperation: { id: "cooperation", label: "Coopération", text: `Les deux clubs visent ensemble un score commun de ${RULE.goal} %.` },
    versus: { id: "versus", label: "Rencontre", text: `Chaque club vise son objectif d’équipe ; le meilleur taux l’emporte, à moins de ${RULE.tieMargin} points c’est une égalité.` },
  });
  const MESSAGES = Object.freeze({
    FEATURE_DISABLED: "Les rencontres entre clubs ne sont pas encore ouvertes pour ce club.",
    VERSUS_CLOSED: "Seul le format coopération est ouvert pendant le pilote.",
    CLUB_NOT_FOUND: "Ce club n’est plus accessible.",
    CLUB_ADMIN_REQUIRED: "Seuls les administrateurs du club organisent une rencontre.",
    NOT_ELIGIBLE: "Tu pourras organiser une rencontre un jour après la création du compte.",
    MATCH_INVALID: "Vérifie le format, l’allure, la durée (1 ou 2 semaines, 2 pour une rencontre comparative) et un départ entre demain et 28 jours.",
    MATCH_OPEN: "Ce club a déjà une rencontre proposée ou en cours.",
    MATCH_CODE: "Ce code de rencontre n’est pas valable (inconnu, déjà utilisé ou expiré).",
    MATCH_SELF: "Un club ne peut pas se rencontrer lui-même.",
    MATCH_SAME_ORGANISER: "La rencontre doit être acceptée par un administrateur de l’autre club que celui qui l’a proposée.",
    MATCH_NOT_FOUND: "Il n’y a pas de rencontre en cours pour ce club.",
    MATCH_STARTED: "La rencontre a commencé : elle ne peut plus être acceptée.",
    MATCH_JOIN_CLOSED: "Les participations se choisissent jusqu’à la fin du deuxième jour de la rencontre.",
    MATCH_ENDED: "Cette rencontre est terminée : son récapitulatif est disponible.",
    MATCH_LEFT: "Tu as quitté cette rencontre : tu ne peux pas y revenir.",
    MATCH_NOT_IN: "Tu ne participes pas à cette rencontre.",
    ACCOUNT_SUSPENDED: "Ton compte est suspendu : tu ne peux pas rejoindre une rencontre pour l’instant.",
    RATE_LIMITED: "Beaucoup d’actions en peu de temps. Réessaie dans un instant.",
  });
  const ACTIONS = Object.freeze({
    join: "Participer à la rencontre",
    leave: "Quitter la rencontre",
    stop: "Arrêter la rencontre",
    feedback: "Donner mon avis",
  });

  const int = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
  const plural = (n, one, many) => `${int(n)} ${int(n) > 1 ? many : one}`;
  const day = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
  };
  /** The last Paris day of a period that ends at a midnight (the server stores the end as the midnight that follows it). */
  const lastDay = (iso) => { const t = Date.parse(iso); return Number.isNaN(t) ? "" : day(new Date(t - 1).toISOString()); };
  const pace = (id) => PACES[id] || PACES.reguliere;
  const has = (v) => v !== null && v !== undefined;

  /* ------------------------------------------------------------------ the score model (same arithmetic as the server) */
  /** An active day: counted minutes of the day (capped at 90) reach 12. */
  function isActiveDay(minutes) { return Math.min(RULE.dailyCap, Number(minutes) || 0) >= RULE.activeMinutes; }
  /** A participant's share: active days per week of the pace × the weeks they took part (prorated, rounded up: arriving late or leaving
      early never lowers what is asked below what the time spent asks). */
  function share(perWeek, weeksIn) { return Math.max(0, Math.ceil(Math.round(int(perWeek) * Math.max(0, Number(weeksIn) || 0) * 1e6) / 1e6)); }
  /** What a participant brings: their active days, up to their own share. */
  function counted(days, shareDays) { return Math.max(0, Math.min(int(days), int(shareDays) * RULE.shareCap)); }
  /** A club's side: members = [{ days, share, in }] (in = still in the meeting). The rate is the part of the team goal reached, in whole
      percent rounded down, and exists only from 3 participants still in. */
  function side(members) {
    const list = Array.isArray(members) ? members : [];
    let total = 0, target = 0, inCount = 0;
    for (const m of list) {
      total += counted(m.days, m.share);
      target += Math.max(0, int(m.share));
      if (m.in !== false) inCount += 1;
    }
    const scored = inCount >= RULE.threshold && target > 0;
    return { participants: inCount, total, target, scored, rate: scored ? Math.floor((100 * total) / target) : null };
  }
  /** Cooperation: the common score is the mean of the two rates (each club weighs half, whatever its size), rounded down. */
  function common(rateA, rateB) {
    if (!has(rateA) || !has(rateB)) return null;
    const value = Math.floor((int(rateA) + int(rateB)) / 2);
    return { value, reached: value >= RULE.goal };
  }
  /** Comparison: the better rate leads, unless the two rates are less than tieMargin points apart. */
  function outcome(rateA, rateB) {
    if (!has(rateA) || !has(rateB)) return null;
    const gap = int(rateA) - int(rateB);
    return Math.abs(gap) < RULE.tieMargin ? "tie" : gap > 0 ? "a" : "b";
  }

  /* ------------------------------------------------------------------ wording */
  function role(view) {
    if (!view) return "";
    return view.role === "organizer"
      ? "Tu organises les rencontres de ce club (administrateur) : tu proposes, acceptes ou arrêtes une rencontre. Tu ne vois jamais la part d’un membre, ni de ton club ni de l’autre."
      : "Les rencontres sont organisées par les administrateurs des deux clubs. Chacun choisit de participer, ou non.";
  }
  function rules(m) {
    if (!m) return "";
    const p = pace(m.pace);
    const fmt = FORMATS[m.format] || FORMATS.cooperation;
    return `${fmt.label} · ${plural(m.weeks, "semaine", "semaines")} · allure ${p.label.toLowerCase()} (${p.perWeek} jours actifs par semaine chacun). ${fmt.text} `
      + `Le taux d’un club est la part de son objectif d’équipe atteinte : chaque participant compte ses jours actifs (12 minutes d’effort confirmées dans la journée, tous les sports pareil) jusqu’à sa propre part, jamais au-delà. `
      + `Il faut ${RULE.threshold} participants dans un club pour que son taux existe.`;
  }
  function header(m) {
    if (!m) return "";
    const vs = m.them && m.them.name ? ` · avec « ${m.them.name} »` : "";
    if (m.phase === "proposed") return `Proposée · départ le ${day(m.startsAt)}, en attente de l’autre club`;
    if (m.phase === "upcoming") return `Départ le ${day(m.startsAt)}${vs} · participations jusqu’au ${lastDay(m.joinUntil)} inclus`;
    if (m.phase === "running") return `En cours jusqu’au ${lastDay(m.endsAt)} inclus${vs}`;
    return `Terminée${vs}`;
  }
  /** One club's line, as everybody reads it: its participants and, from 3, its rate. Never a name, a day or a session. */
  function sideLine(s, label) {
    if (!s) return "";
    const n = int(s.participants);
    const who = label || s.name || "Club";
    if (!s.scored) return `${who} : ${plural(n, "participant", "participants")} · taux affiché à partir de ${RULE.threshold} participants`;
    const detail = has(s.total) && has(s.target) ? ` (${plural(s.total, "jour actif", "jours actifs")} sur ${int(s.target)} visés)` : "";
    return `${who} : ${plural(n, "participant", "participants")} · ${int(s.rate)} % de l’objectif d’équipe${detail}`;
  }
  function sides(m) {
    if (!m || m.phase === "proposed") return [];
    return [sideLine(m.us, m.us && m.us.name ? `${m.us.name} (ton club)` : "Ton club"), sideLine(m.them)];
  }
  /** The score line: common score (cooperation) or who leads (comparison), as of the last midnight. */
  function score(m) {
    if (!m || m.phase === "proposed" || m.phase === "upcoming") return "";
    const asOf = m.phase === "running" ? " (arrêté à minuit : personne ne voit quand un membre s’entraîne)" : "";
    if (m.format === "versus") {
      if (!m.lead) return `Pas encore de comparaison : chaque club doit compter ${RULE.threshold} participants.`;
      const them = (m.them && m.them.name) || "l’autre club";
      return (m.lead === "tie" ? `À égalité (moins de ${RULE.tieMargin} points d’écart)` : m.lead === "us" ? "Ton club mène" : `« ${them} » mène`) + asOf + ".";
    }
    if (!has(m.common)) return `Score commun affiché quand chaque club compte ${RULE.threshold} participants.`;
    return `Score commun : ${int(m.common)} % sur ${RULE.goal} % visés${m.reached ? " — seuil atteint ensemble" : ""}${asOf}.`;
  }
  function mine(m) {
    const me = m && m.me;
    if (!me) return m && (m.phase === "upcoming" || m.phase === "running") ? "Tu ne participes pas. Participer est un choix : rien de toi n’est compté tant que tu ne l’as pas fait." : "";
    const days = plural(me.days, "jour actif compté", "jours actifs comptés");
    if (me.status === "left") return `Tu as quitté la rencontre. ${int(me.days) > 0 ? `Tes ${days} restent à ton club` : "Rien n’avait été compté pour toi"} ; ta part a été réduite au temps passé.`;
    return `Tu participes · ${days} sur ta part de ${int(me.share)}. Au-delà de ta part, rien de plus ne compte : personne ne porte son club seul. Cette part n’est montrée qu’à toi.`;
  }
  function proposal(m) {
    if (!m || m.phase !== "proposed") return "";
    return m.code
      ? `Code de rencontre à transmettre à un administrateur de l’autre club : ${m.code}. Valable jusqu’au départ (${day(m.startsAt)}).`
      : "Rencontre proposée, en attente de l’autre club.";
  }
  /** What an administrator of the invited club reads before accepting: the parameters, the rules, the other club's name. */
  function preview(p) {
    if (!p) return null;
    const pp = pace(p.pace);
    return {
      title: `« ${p.host} » propose une rencontre`,
      lines: [
        `Du ${day(p.startsAt)} au ${lastDay(p.endsAt)} inclus ; chacun choisit de participer jusqu’au ${lastDay(p.joinUntil)}.`,
        rules(p),
        "Ce que voit l’autre club : le nom de ton club, son nombre de participants et son taux, arrêté chaque nuit. Jamais un nom, une séance ou une présence.",
      ],
    };
  }
  const PHASES = {
    closed: "Rencontre terminée",
    short: "Rencontre terminée sans résultat",
    abandoned: "Rencontre arrêtée",
    cancelled: "Rencontre annulée avant le départ",
    refused: "Proposition refusée",
    expired: "Proposition expirée",
  };
  /** The frozen recap: totals by club only, never a personal contribution. */
  function report(last) {
    if (!last) return null;
    const them = (last.them && last.them.name) || "l’autre club";
    const title = `${PHASES[last.phase] || "Rencontre"}${last.them && last.them.name ? ` avec « ${them} »` : ""}`;
    const lines = [];
    if (last.phase === "refused") lines.push(`« ${them} » a refusé la proposition. Aucune donnée n’a été échangée.`);
    else if (last.phase === "expired") lines.push("Personne n’a accepté avant le départ. Aucune donnée n’a été échangée.");
    else if (last.phase === "cancelled") lines.push(`Annulée par les administrateurs ${last.stoppedBy === "us" ? "de ton club" : `de « ${them} »`}. Rien n’a été compté.`);
    else if (last.phase === "abandoned") lines.push(`Arrêtée le ${day(last.stoppedAt)} par les administrateurs ${last.stoppedBy === "us" ? "de ton club" : `de « ${them} »`} : pas de résultat.`);
    else {
      lines.push(`Du ${day(last.startsAt)} au ${lastDay(last.endsAt)} · ${(FORMATS[last.format] || FORMATS.cooperation).label.toLowerCase()}.`);
      lines.push(sideLine(last.us, last.us && last.us.name ? `${last.us.name} (ton club)` : "Ton club"));
      lines.push(sideLine(last.them));
      if (last.phase === "short") lines.push(`Un club comptait moins de ${RULE.threshold} participants à la fin : pas de résultat, pour que personne ne puisse en déduire la part d’un autre.`);
      else if (last.format === "versus") lines.push(last.lead === "tie" ? `Égalité : moins de ${RULE.tieMargin} points d’écart.` : last.lead === "us" ? "Ton club l’emporte." : `« ${them} » l’emporte.`);
      else if (has(last.common)) lines.push(`Score commun : ${int(last.common)} % — ${last.reached ? `seuil de ${RULE.goal} % atteint ensemble` : `seuil de ${RULE.goal} % non atteint`}.`);
    }
    if (last.me && has(last.me.days)) lines.push(`Ta part : ${plural(last.me.days, "jour actif compté", "jours actifs comptés")} sur ${int(last.me.share)}${last.me.left ? ", avant ton départ" : ""}. Elle n’est montrée qu’à toi.`);
    if (["closed", "short", "abandoned"].includes(last.phase)) lines.push("Aucun classement de personnes : ce récapitulatif ne montre que les totaux de chaque club.");
    return { title, lines };
  }
  function actions(m) {
    const can = (m && Array.isArray(m.can)) ? m.can : [];
    return ["join", "leave", "stop"].filter((a) => can.includes(a)).map((a) => ({ id: a, label: ACTIONS[a], danger: a === "leave" || a === "stop" }));
  }
  function confirmText(action, m) {
    if (action === "leave") return { title: "Quitter la rencontre ?", message: "Tes jours déjà comptés restent à ton club et ta part est réduite au temps passé. Tu ne pourras pas revenir dans cette rencontre.", confirm: "Quitter" };
    if (action === "stop") {
      const message = m && m.phase === "proposed" ? "La proposition est retirée ; le code ne fonctionnera plus."
        : m && m.phase === "upcoming" ? "La rencontre est annulée pour les deux clubs avant son départ."
          : "La rencontre s’arrête maintenant pour les deux clubs, sans résultat.";
      return { title: "Arrêter la rencontre ?", message, confirm: "Arrêter" };
    }
    if (action === "refuse") return { title: "Refuser la rencontre ?", message: "L’autre club verra que la proposition a été refusée. Rien n’est échangé.", confirm: "Refuser" };
    return null;
  }
  function result(action) {
    return ({
      propose: "Rencontre proposée : transmets le code à un administrateur de l’autre club.",
      accept: "Rencontre acceptée. Chaque membre des deux clubs choisit de participer.",
      refuse: "Proposition refusée.",
      join: "Tu participes à la rencontre.",
      leave: "Tu as quitté la rencontre.",
      stop: "Rencontre arrêtée.",
      feedback: "Merci : ton avis aide à rendre le score plus clair.",
    })[action] || "C’est fait.";
  }
  function message(error) {
    const raw = String((error && error.message) || error || "");
    const key = Object.keys(MESSAGES).find((k) => raw.includes(k));
    return key ? MESSAGES[key] : null;
  }
  /** Client-side check of the proposal form (the server checks again). */
  function validate(form, todayIso) {
    const weeks = int(form && form.weeks);
    const start = String((form && form.startsOn) || "");
    if (!FORMATS[form && form.format]) return "MATCH_INVALID";
    if (!PACES[form && form.pace]) return "MATCH_INVALID";
    if (!RULE.weeks.includes(weeks)) return "MATCH_INVALID";
    if (form.format === "versus" && weeks !== RULE.versusWeeks) return "MATCH_INVALID";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return "MATCH_INVALID";
    if (todayIso) {
      const diff = (Date.parse(start + "T00:00:00Z") - Date.parse(todayIso + "T00:00:00Z")) / 86400000;
      if (!(diff >= RULE.startFromDays && diff <= RULE.startWithinDays)) return "MATCH_INVALID";
    }
    return null;
  }
  /** A typed code, normalised as the server reads it. */
  function code(raw) { return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8); }

  const api = { RULE, PACES, FORMATS, MESSAGES, ACTIONS, isActiveDay, share, counted, side, common, outcome, role, rules, header, sideLine, sides, score, mine, proposal, preview, report, actions, confirmText, result, message, validate, code };
  root.TitanClubMatch = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
