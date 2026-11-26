/* V1.8.4 — Saisons privées de club (docs/V184_SAISONS_CLUB.md).
   Shared unchanged by the website and the Android app (mobile/scripts/sync-web-core.mjs). Pure: no I/O, no time source.
   The server (titan_club_season_v1 / titan_club_season_act_v1) is the authority: it counts the active days, the shares, the caps and the
   stages, and it withholds every aggregate below the confidentiality threshold. This module mirrors its rule to explain it and words what
   each member reads. Nothing here is XP, credit, a ranking or an advantage. */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------------ rule (mirror of 20261130104400_club_season.sql) */
  const RULE = Object.freeze({
    activeMinutes: 12, // counted effort-minutes in a Paris day for an active day (the Cordée longueur threshold)
    dailyCap: 90,      // counted minutes per day, as everywhere in TITAN
    capShare: 1.5,     // a participant counts up to 1.5 × the share planned at their arrival
    contributors: 2,   // a stage unlocks only when two participants have contributed (as soon as the season ever had two)
    threshold: 3,      // totals, goal, pauses and stages are read from 3 participants still in the season
    stages: 3,         // at one third, two thirds and the whole goal
    weeksMin: 2,
    weeksMax: 8,
    startWithinDays: 28,
    postponeDays: [7, 14],
    postponeMax: 2,
    titleMin: 3,
    titleMax: 60,
  });
  const PACES = Object.freeze({
    douce: { id: "douce", label: "Douce", perWeek: 2, text: "Deux jours actifs par semaine chacun.", short: "2 jours actifs par semaine" },
    reguliere: { id: "reguliere", label: "Régulière", perWeek: 3, text: "Trois jours actifs par semaine chacun.", short: "3 jours actifs par semaine" },
    soutenue: { id: "soutenue", label: "Soutenue", perWeek: 4, text: "Quatre jours actifs par semaine chacun.", short: "4 jours actifs par semaine" },
  });
  const STAGES = Object.freeze([
    { n: 1, name: "Le départ tenu", text: "un tiers de l’objectif" },
    { n: 2, name: "Le cap du milieu", text: "deux tiers de l’objectif" },
    { n: 3, name: "La saison bouclée", text: "l’objectif entier" },
  ]);
  const MESSAGES = Object.freeze({
    FEATURE_DISABLED: "Les saisons de club ne sont pas encore ouvertes pour ce club.",
    CLUB_NOT_FOUND: "Ce club n’est plus accessible.",
    CLUB_ADMIN_REQUIRED: "Seuls les administrateurs du club organisent une saison.",
    NOT_ELIGIBLE: "Tu pourras organiser une saison un jour après la création du compte.",
    SEASON_INVALID: "Vérifie le titre (3 à 60 caractères), l’allure, la durée (2 à 8 semaines) et un départ dans les 28 jours.",
    SEASON_OPEN: "Une saison est déjà prévue ou en cours dans ce club.",
    SEASON_NOT_FOUND: "Il n’y a pas de saison en cours dans ce club.",
    SEASON_ENDED: "Cette saison est terminée : son bilan est disponible.",
    SEASON_STARTED: "La saison a commencé : son départ ne peut plus être reporté.",
    SEASON_POSTPONE_LIMIT: "Le départ a déjà été reporté deux fois.",
    SEASON_LEFT: "Tu as quitté cette saison. La prochaine fois, une pause te permettra de revenir.",
    SEASON_NOT_IN: "Tu ne participes pas à cette saison.",
    ACCOUNT_SUSPENDED: "Ton compte est suspendu : tu ne peux pas rejoindre une saison pour l’instant.",
    RATE_LIMITED: "Beaucoup d’actions en peu de temps. Réessaie dans un instant.",
  });
  const ACTIONS = Object.freeze({
    join: "Participer à la saison",
    pause: "Faire une pause",
    resume: "Reprendre",
    leave: "Quitter la saison",
    postpone: "Reporter le départ",
    stop: "Arrêter la saison",
  });

  const int = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
  const plural = (n, one, many) => `${int(n)} ${int(n) > 1 ? many : one}`;
  const day = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
  };
  const pace = (id) => PACES[id] || PACES.reguliere;

  /** The share of a participant for a whole season (what the goal asks of each), as the server computes it at the start. */
  function share(paceId, weeks) { return pace(paceId).perWeek * Math.max(0, int(weeks)); }
  function cap(paceId, weeks) { return Math.max(1, Math.ceil(RULE.capShare * share(paceId, weeks))); }
  /** An active day: counted minutes of the day (capped at 90) reach 12. */
  function isActiveDay(minutes) { return Math.min(RULE.dailyCap, Number(minutes) || 0) >= RULE.activeMinutes; }
  /** The three stage thresholds of a goal. */
  function thresholds(target) { return STAGES.map((s) => Math.ceil((int(target) * s.n) / RULE.stages)); }

  /** The organiser's role, said plainly. */
  function role(view) {
    if (!view) return "";
    return view.role === "organizer"
      ? "Tu organises les saisons de ce club (administrateur) : tu peux reporter un départ ou arrêter une saison. Tu ne vois jamais la part d’un membre."
      : "Les saisons sont organisées par les administrateurs du club. Chacun choisit de participer, ou non.";
  }

  /** The header line of the current season. */
  function header(s) {
    if (!s) return "";
    const what = `${plural(s.weeks, "semaine", "semaines")} · allure ${pace(s.pace).label.toLowerCase()} (${pace(s.pace).perWeek} jours actifs par semaine chacun)`;
    if (s.phase === "upcoming") return `Départ le ${day(s.startsAt)}${int(s.postponed) ? ` (reporté ${int(s.postponed) > 1 ? "deux fois" : "une fois"})` : ""} · ${what}`;
    if (s.phase === "running") return `Semaine ${int(s.week)} sur ${int(s.weeks)} · fin le ${day(s.endsAt)} · ${what}`;
    return what;
  }

  /** Who takes part, under the confidentiality rule: below the threshold only the number of participants. */
  function group(s) {
    if (!s) return "";
    const n = int(s.participants);
    if (!s.visible) {
      return n
        ? `${plural(n, "participant", "participants")}. La progression du groupe s’affiche à partir de ${RULE.threshold} participants : personne ne peut en déduire la part d’un autre.`
        : "Personne ne participe encore. Chacun choisit de rejoindre la saison.";
    }
    const paused = int(s.paused);
    return `${plural(n, "participant", "participants")}${paused ? ` dont ${paused} en pause` : ""} · ${plural(s.contributors, "a déjà contribué", "ont déjà contribué")}`;
  }

  /** The goal line and the stages, or nothing below the threshold. */
  function progress(s) {
    if (!s || !s.visible) return null;
    const target = int(s.target);
    return {
      total: int(s.total), target, pct: target ? Math.min(100, Math.round((int(s.total) / target) * 100)) : 0,
      line: `${plural(s.total, "jour actif", "jours actifs")} ensemble sur ${plural(target, "jour", "jours")} visés`,
    };
  }
  function stages(s) {
    const list = (s && Array.isArray(s.stages)) ? s.stages : [];
    return STAGES.map((def) => {
      const st = list.find((x) => int(x && x.n) === def.n) || {};
      if (!s || !s.visible) return { n: def.n, name: def.name, status: "hidden", text: `Étape ${def.n} · ${def.name}` };
      const reached = Boolean(st.reachedAt);
      const current = !reached && int(s.next) === def.n;
      return {
        n: def.n, name: def.name, status: reached ? "reached" : current ? "current" : "locked",
        text: reached ? `Étape ${def.n} · ${def.name} — atteinte le ${day(st.reachedAt)}`
          : current ? `Étape ${def.n} · ${def.name} — en cours : ${plural(st.threshold, "jour actif", "jours actifs")} ensemble (${def.text})`
            : `Étape ${def.n} · ${def.name} — à ${plural(st.threshold, "jour actif", "jours actifs")} (${def.text})`,
      };
    });
  }
  /** What the group is still working on (shown to everyone, pauses included). */
  function ongoing(s) {
    if (!s || !s.visible || s.phase !== "running") return "";
    const next = STAGES.find((d) => d.n === int(s.next));
    if (!next) return "Les trois étapes sont atteintes : la saison continue jusqu’à sa fin.";
    return `Objectif en cours : étape ${next.n}, « ${next.name} »${int(s.paused) ? ". Les membres en pause gardent ce qu’ils ont apporté ; les autres continuent" : ""}.`;
  }

  /** One's own part: always readable by oneself, never by another member. */
  function mine(s) {
    const me = s && s.me;
    if (!me) return s && (s.phase === "upcoming" || s.phase === "running") ? "Tu ne participes pas. Rejoindre la saison est un choix : rien n’est partagé tant que tu ne l’as pas fait." : "";
    const days = `${plural(me.days, "jour actif compté", "jours actifs comptés")}`;
    const kept = int(me.days) > 0 ? `Tes ${days} restent acquis pour le groupe` : "Rien n’avait encore été compté pour toi";
    if (me.status === "left") return `Tu as quitté la saison. ${kept}.`;
    if (me.status === "paused") return `Tu es en pause : rien ne compte pendant la pause et ta part restante est libérée. ${kept}.`;
    return `Tu participes · ${days} sur ta part de ${int(me.share)}${me.capped ? ` (plafond atteint : ${int(me.cap)} au plus, pour que personne ne porte le groupe seul)` : ` · plafond ${int(me.cap)}`}.`;
  }

  /** The frozen private report of the last season (milestones only, never a ranking). */
  function report(last) {
    if (!last) return null;
    const title = `Bilan de « ${last.title} »`;
    if (last.phase === "cancelled") return { title, lines: ["Saison annulée avant son départ par les administrateurs du club."] };
    const lines = [];
    lines.push(last.phase === "stopped" ? `Arrêtée le ${day(last.stoppedAt)} par les administrateurs du club.` : `Terminée le ${day(last.endsAt)} après ${plural(last.weeks, "semaine", "semaines")}.`);
    if (last.visible) {
      lines.push(`${plural(last.reached, "étape atteinte", "étapes atteintes")} sur ${RULE.stages} · ${plural(last.total, "jour actif", "jours actifs")} ensemble sur ${int(last.target)} visés · ${plural(last.participants, "participant", "participants")} à la fin.`);
      for (const st of last.stages || []) {
        const def = STAGES.find((d) => d.n === int(st.n));
        if (def && st.reachedAt) lines.push(`Étape ${def.n} · ${def.name} — atteinte le ${day(st.reachedAt)}.`);
      }
    } else {
      lines.push(`Moins de ${RULE.threshold} participants à la fin : le bilan du groupe reste privé.`);
    }
    if (last.me && last.me.days != null) lines.push(`Ta part : ${plural(last.me.days, "jour actif compté", "jours actifs comptés")}${last.me.left ? " avant ton départ" : ""}.`);
    lines.push("Aucun classement : ce bilan ne montre que ce que le groupe a accompli.");
    return { title, lines };
  }

  /** The actions the server offers, in a stable order, with their labels. */
  function actions(s) {
    const can = (s && Array.isArray(s.can)) ? s.can : [];
    return ["join", "resume", "pause", "leave", "postpone", "stop"].filter((a) => can.includes(a)).map((a) => ({ id: a, label: ACTIONS[a], danger: a === "leave" || a === "stop" }));
  }
  function confirmText(action, s) {
    if (action === "leave") return { title: "Quitter la saison ?", message: "Tes jours déjà comptés restent au groupe. Tu ne pourras pas revenir dans cette saison : une pause permet de revenir.", confirm: "Quitter" };
    if (action === "stop") return { title: "Arrêter la saison ?", message: s && s.phase === "upcoming" ? "La saison est annulée avant son départ." : "La saison se termine maintenant et son bilan est figé avec les étapes atteintes.", confirm: "Arrêter" };
    return null;
  }
  function result(action) {
    return ({
      create: "Saison créée. Chaque membre choisit de participer.",
      join: "Tu participes à la saison.",
      pause: "Pause enregistrée : ce que tu as apporté reste acquis.",
      resume: "Te revoilà dans la saison.",
      leave: "Tu as quitté la saison.",
      postpone: "Départ reporté.",
      stop: "Saison arrêtée : le bilan est figé.",
    })[action] || "C’est fait.";
  }
  function message(error) {
    const raw = String((error && error.message) || error || "");
    const key = Object.keys(MESSAGES).find((k) => raw.includes(k));
    return key ? MESSAGES[key] : null;
  }
  /** Client-side check of the creation form (the server checks again). */
  function validate(form, todayIso) {
    const title = String((form && form.title) || "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim();
    const weeks = int(form && form.weeks);
    const start = String((form && form.startsOn) || "");
    if (title.length < RULE.titleMin || title.length > RULE.titleMax) return "SEASON_INVALID";
    if (!PACES[form && form.pace]) return "SEASON_INVALID";
    if (weeks < RULE.weeksMin || weeks > RULE.weeksMax) return "SEASON_INVALID";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return "SEASON_INVALID";
    if (todayIso) {
      const diff = (Date.parse(start + "T00:00:00Z") - Date.parse(todayIso + "T00:00:00Z")) / 86400000;
      if (!(diff >= 0 && diff <= RULE.startWithinDays)) return "SEASON_INVALID";
    }
    return null;
  }

  const api = { RULE, PACES, STAGES, MESSAGES, ACTIONS, share, cap, isActiveDay, thresholds, role, header, group, progress, stages, ongoing, mine, report, actions, confirmText, result, message, validate };
  root.TitanClubSeason = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
