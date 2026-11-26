/* V1.9.6 — Suivi collectif individualisé. Shared unchanged by the website (coach) and the Android app (synchronised by
   mobile/scripts/sync-web-core.mjs). Pure: words what the server computed (public.titan_coach_group_v1) — a group and its members, the
   preview of a block (who receives which version, who receives nothing and why), the results of a send recipient by recipient, the group
   review (next action per athlete, the coach's load). The server decides; this module never infers an outcome. It also turns the coach's
   choices for one athlete into the variant the server checks (variantFrom). Rules of the wording: a pause or an ended link is a fact, not
   a fault of the athlete; nobody's data appears in a group view; no urgency, no counter of missed sessions. */
(function (root) {
  "use strict";
  const DAYS = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
  const iso = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
  const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const day = (v) => {
    const d = iso(v);
    if (!d) return "";
    const t = new Date(d + "T12:00:00Z");
    return `${DAYS[((t.getUTCDay() + 6) % 7) + 1]} ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`;
  };
  const plural = (n, one, many) => `${n} ${Math.abs(n) > 1 ? many : one}`;
  const ENDED = "Suivi arrêté";

  const LINK_STATES = { active: "Actif", paused: "En pause", revoked: ENDED };
  // What the preview predicts for a recipient, and what a send answered.
  const OUTCOMES = {
    ready: { label: "Recevra sa version", tone: "ok" },
    sent: { label: "Envoyé", tone: "ok" },
    excluded: { label: "Laissé de côté", tone: "muted" },
    COACH_CAPACITY_PAUSED: { label: "Ne recevra rien : suivi en pause", text: "Le suivi est en pause faute de place dans ton offre. Rien n’est envoyé ; l’envoi pourra être repris quand une place se libère.", tone: "warn" },
    SHARING_UNAVAILABLE: { label: "Ne recevra rien : suivi arrêté", text: "Ce suivi a été arrêté. Rien ne lui est envoyé et son nom n’apparaît plus ici.", tone: "muted" },
    INVALID_PERIOD: { label: "Dates hors de la période possible", text: "Une séance de sa version tomberait avant aujourd’hui ou à plus d’un an : décale son début.", tone: "warn" },
    PLAN_LIMIT: { label: "Limite de programmes atteinte", text: "Ce suivi a déjà 50 programmes.", tone: "warn" },
    ASSIGNMENT_LIMIT: { label: "Limite de propositions atteinte", text: "Ce suivi a atteint la limite de propositions.", tone: "warn" },
    BAD_VARIANT: { label: "Version à revoir", text: "Sa version ne tient plus dans le bloc : rouvre « Adapter ».", tone: "warn" },
    SEND_ERROR: { label: "Non envoyé", text: "L’envoi n’a pas abouti pour ce sportif. Reprends les envois incomplets.", tone: "warn" },
  };
  const outcome = (code) => OUTCOMES[code] || OUTCOMES.SEND_ERROR;

  const NEXT = {
    discuss: { label: "Répondre à une demande de discussion", short: "À discuter" },
    feedback: { label: "Faire un retour sur un écart", short: "Retour à faire" },
    report: { label: "Préparer le bilan du cycle", short: "Bilan à préparer" },
    wait_answer: { label: "Attendre ses réponses", short: "Réponses attendues" },
    plan: { label: "Proposer la suite", short: "Suite à proposer" },
    none: { label: "Rien à faire pour l’instant", short: "À jour" },
  };

  const MESSAGES = {
    FEATURE_DISABLED: "Les groupes de suivi ne sont pas encore ouverts sur ce compte.",
    COACH_ONLY: "Les groupes sont réservés au coach.",
    GROUP_UNAVAILABLE: "Ce groupe n’existe plus.",
    GROUP_LIMIT: "Un groupe compte 30 sportifs au plus, et tu peux avoir 20 groupes.",
    GROUP_EMPTY: "Ce groupe n’a aucun suivi en cours.",
    DISPATCH_UNAVAILABLE: "Ce bloc n’existe plus.",
    DISPATCH_LIMIT: "Ce groupe a déjà 100 blocs.",
    RECIPIENT_UNAVAILABLE: "Ce sportif ne fait pas partie de ce bloc.",
    ALREADY_SENT: "Ce sportif a déjà reçu sa version : elle se modifie depuis son suivi.",
    COACH_CONFLICT: "Le bloc a changé depuis l’aperçu (une version, un suivi en pause, un lien arrêté). Relis l’aperçu avant d’envoyer.",
    SHARING_UNAVAILABLE: "Un de ces suivis a été arrêté ou ne t’appartient pas.",
    PROGRAM_UNAVAILABLE: "Ce modèle n’existe plus.",
    INVALID_PERIOD: "Choisis un lundi à partir de cette semaine (un an au plus).",
    BAD_VARIANT: "Cette version ne tient pas : au moins une séance, des jours de 1 à 7 dans les semaines du bloc, un décalage de 4 semaines au plus.",
    BAD_TITLE: "Donne un nom au groupe.",
    INVALID_INPUT: "La demande n’est pas valide. Actualise.",
    RATE_LIMITED: "Trop de demandes : réessaie dans un instant.",
  };
  const message = (code) => MESSAGES[code] || "";

  /** One line for a member: their name (never for an ended link) and the state of the link. */
  function member(m) {
    const ended = m?.link_state === "revoked";
    return { name: ended ? ENDED : m?.name || "Compte TITAN", state: LINK_STATES[m?.link_state] || "", ended, paused: m?.link_state === "paused" };
  }

  /** The variant of one athlete in words, from the server's variant and changes. */
  function variantText(r, sessions) {
    const v = r?.variant || {};
    const titleOf = (k) => (sessions || []).find((s) => s.key === k)?.title || k;
    const parts = [];
    if (Number(v.shift_weeks) > 0) parts.push(`Commence ${plural(Number(v.shift_weeks), "semaine", "semaines")} plus tard`);
    for (const [from, to] of Object.entries(v.day_map || {})) if (Number(from) !== Number(to)) parts.push(`${DAYS[from]} → ${DAYS[to]}`);
    for (const m of v.moves || []) parts.push(`${titleOf(m.key)} : ${DAYS[m.day]}, semaine ${m.week}`);
    if ((v.skip || []).length) parts.push(`Sans ${(v.skip || []).map(titleOf).join(", ")}`);
    return parts.length ? parts.join(" · ") : "Version commune";
  }

  /** The variant the server checks, from the coach's choices for one athlete. The form gives: shift (weeks), map ({from: to}), and per
      session of the template whether it is kept and, if moved, its week and day. A session moved where the weekday map already puts it
      is not a move. */
  function variantFrom(template, { shift = 0, map = {}, keep = {}, place = {} } = {}) {
    const v = {};
    const s = Math.max(0, Math.min(4, Number(shift) || 0));
    if (s) v.shift_weeks = s;
    const dm = {};
    for (const [from, to] of Object.entries(map)) if (Number(from) >= 1 && Number(from) <= 7 && Number(to) >= 1 && Number(to) <= 7 && Number(from) !== Number(to)) dm[String(Number(from))] = Number(to);
    if (Object.keys(dm).length) v.day_map = dm;
    const skip = [], moves = [];
    for (const t of template || []) {
      if (keep[t.key] === false) { skip.push(t.key); continue; }
      const p = place[t.key];
      if (!p) continue;
      const mapped = dm[String(t.day)] || t.day;
      if (Number(p.week) !== Number(t.week) || Number(p.day) !== Number(mapped)) moves.push({ key: t.key, week: Number(p.week), day: Number(p.day) });
    }
    if (moves.length) v.moves = moves;
    if (skip.length) v.skip = skip;
    return v;
  }

  /** The preview of a block: one row per recipient, in the server's order (current links first, then ended ones). */
  function preview(d) {
    const rows = (d?.recipients || []).map((r) => {
      const m = member(r);
      const code = r.status === "sent" ? "sent" : r.predict;
      const o = outcome(code);
      return {
        link_id: r.link_id, name: m.name, ended: m.ended, state: m.state, individual: !!r.individual, excluded: !!r.excluded,
        code, label: o.label, text: o.text || "", tone: o.tone, will_send: code === "ready", sent: r.status === "sent",
        variant: variantText(r, d?.sessions), start: r.start_date ? day(r.start_date) : "", end: r.end_date ? day(r.end_date) : "",
        sessions: (r.sessions || []).map((s) => ({ key: s.key, title: s.title, when: day(s.planned_date), week: s.week, day: s.day, moved: (r.changes || []).some((c) => c.key === s.key) })),
        session_count: r.session_count ?? null,
        removed: (r.changes || []).filter((c) => c.kind === "removed").map((c) => c.before?.title || c.key),
        attempts: r.attempts || 0, last_error: r.status === "failed" ? r.error : null,
      };
    });
    const c = d?.counts || {};
    return {
      rows, counts: c,
      headline: `${plural(c.ready || 0, "sportif recevra", "sportifs recevront")} sa version${c.individual ? ` · ${plural(c.individual, "version adaptée", "versions adaptées")}` : ""}`,
      blocked: rows.filter((r) => !r.will_send && !r.sent && !r.excluded),
      can_send: (c.ready || 0) > 0,
      complete: !!d?.completed_at,
      incomplete: !!d?.first_sent_at && !d?.completed_at,
      preview_key: d?.preview_key || null,
    };
  }

  /** The results of one send, recipient by recipient; the names come from the server (none for an ended link). */
  function results(res) {
    const rows = (res?.results || []).map((r) => {
      const o = r.status === "sent" ? OUTCOMES.sent : outcome(r.error);
      return { link_id: r.link_id, name: r.name || ENDED, sent: r.status === "sent", label: r.status === "sent" ? `Envoyé (${plural(r.sessions || 0, "séance", "séances")})` : o.label, text: r.status === "sent" ? "" : o.text || "", tone: o.tone };
    });
    const sent = rows.filter((r) => r.sent).length, failed = rows.length - sent;
    return {
      rows, sent, failed, replayed: !!res?.already,
      headline: rows.length === 0 ? "Rien à envoyer : chaque sportif a reçu sa version ou a été laissé de côté."
        : `${plural(sent, "envoi réussi", "envois réussis")}${failed ? ` · ${plural(failed, "sportif n’a", "sportifs n’ont")} rien reçu` : ""}`,
      note: res?.already ? "Cet envoi avait déjà été fait : rien n’a été renvoyé." : failed ? "Les envois réussis sont faits une fois pour toutes. Reprendre ne renverra qu’aux sportifs restants." : "",
    };
  }

  /** The group review: one row per current member with their next action, counts only; and the coach's load. */
  function review(g) {
    const rows = (g?.members || []).map((m) => {
      const who = member(m);
      const r = m.review;
      const n = r ? NEXT[r.next] || NEXT.none : null;
      const plan = r?.plan;
      return {
        link_id: m.link_id, name: who.name, ended: who.ended, paused: who.paused, state: who.state,
        next: r?.next || null, label: n ? n.label : who.paused ? "En pause : rien à lire tant qu’une place n’est pas libre" : who.ended ? "Plus rien à suivre" : "",
        short: n ? n.short : who.state, cases: r?.cases || 0,
        plan: plan ? `${plan.title}${plan.current_week ? ` · semaine ${plan.current_week}/${plan.weeks}` : ""} · ${plan.accepted}/${plan.sessions} acceptées` : "",
        counts: r?.counts || null,
      };
    });
    const l = g?.load || {};
    return {
      rows,
      load: l,
      headline: `${plural(l.cases || 0, "cas à traiter", "cas à traiter")} · ${plural(l.with_action || 0, "sportif à voir", "sportifs à voir")} · ${plural(l.awaiting || 0, "réponse attendue", "réponses attendues")}`,
      places: l.capacity != null ? `${l.links_used} / ${l.capacity} places de ton offre` : "",
    };
  }

  root.TitanCoachGroup = { DAYS, day, member, variantText, variantFrom, preview, results, review, message, outcome, NEXT, OUTCOMES, LINK_STATES };
})(typeof window !== "undefined" ? window : globalThis);
