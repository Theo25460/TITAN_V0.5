/* V1.9.3 — Revue de suivi. Pure wording of the coach's weekly review (public.titan_coach_review_v1): for each athlete the case to
   handle, the next action and its source, the shared check-in when the athlete shared it, what the previous review sent and its
   decision, and the preview of a prepared proposal. The server decides the next action and applies the link's contract; this module
   never infers a state. Rules of the wording: an answer that waits is not a failure, no counter of missed sessions, no urgency; the
   prepared proposal leaves only when the coach sends it. Reuses TitanCoachFollowup for days and proposal states. */
(function (root) {
  "use strict";
  const FU = () => root.TitanCoachFollowup;
  const iso = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
  const day = (v) => FU()?.day?.(v) || iso(v) || "";
  const sportLabel = (k) => root.TitanSports?.label?.(k) || k || "";
  const addDays = (v, n) => {
    const d = iso(v);
    if (!d) return null;
    const t = new Date(d + "T12:00:00Z");
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };
  /** The Paris Monday of a calendar day (the server's week). */
  function monday(v) {
    const d = iso(v);
    if (!d) return null;
    const w = new Date(d + "T12:00:00Z").getUTCDay();
    return addDays(d, w === 0 ? -6 : 1 - w);
  }

  const NEXT = {
    gap: { label: "Traiter un écart", tone: "gap", actionable: true },
    feedback: { label: "Laisser un retour", tone: "gap", actionable: true },
    resume: { label: "Reprendre la proposition préparée", tone: "ready", actionable: true },
    prepare: { label: "Préparer la suite", tone: "ready", actionable: true },
    wait: { label: "Attendre sa réponse", tone: "wait", actionable: false },
    none: { label: "Rien à traiter cette semaine", tone: "neutral", actionable: false },
    paused: { label: "En pause", tone: "neutral", actionable: false },
  };
  const FIELDS = { title: "Nom", sport: "Sport", planned_date: "Date prévue", instructions: "Consignes" };
  const SCORES = [["fatigue", "Fatigue"], ["energy", "Énergie"], ["sleep", "Sommeil"], ["motivation", "Motivation"]];
  const STATUS = { proposed: "en attente de sa réponse", accepted: "acceptée", declined: "déclinée", completed: "faite et liée", cancelled: "annulée" };
  const MESSAGES = {
    FEATURE_DISABLED: "La revue de la semaine n’est pas encore ouverte sur ce compte.",
    SHARING_UNAVAILABLE: "Ce partage a été arrêté ou n’est plus accessible : rien n’a été envoyé.",
    COACH_CAPACITY_PAUSED: "Ce suivi est en pause faute de place dans ton offre : rien n’a été envoyé, rien n’est supprimé.",
    COACH_CONFLICT: "La proposition préparée a changé ailleurs. Relis l’aperçu avant d’envoyer.",
    COACH_ONLY: "Seul le coach prépare une proposition.",
    INVALID_PERIOD: "Choisis une date à partir d’aujourd’hui (un an au plus).",
    INVALID_TRANSITION: "Cette proposition préparée a déjà été envoyée ou abandonnée.",
    TEMPLATE_UNAVAILABLE: "Ce modèle n’existe plus. Choisis-en un autre.",
    BAD_TITLE: "Donne un nom à la séance.",
    SPORT_UNKNOWN: "Choisis un sport du catalogue.",
    ASSIGNMENT_LIMIT: "La limite de propositions de ce suivi est atteinte.",
    RATE_LIMITED: "Trop de demandes : réessaie dans un instant.",
    INVALID_INPUT: "La demande n’est pas valide. Actualise la revue.",
  };
  const message = (code) => MESSAGES[code] || "";

  /** « Semaine du lundi 23 nov. au dimanche 29 nov. » */
  function weekLabel(week) {
    const w = iso(week);
    return w ? `Semaine du ${day(w)} au ${day(addDays(w, 6))}` : "";
  }

  /** Where the next action comes from, in words (the coach must see the source). */
  function sourceText(card) {
    const s = card?.source;
    if (!s) return "";
    const d = card?.dossier;
    if (s.kind === "session") return `Séance liée du ${day(s.date)}${d?.title ? ` · proposition « ${d.title} »` : ""}`;
    if (s.kind === "proposal") return `Proposition « ${d?.title || "séance"} » du ${day(s.date)}`;
    if (s.kind === "feedback") return `Ajustement proposé dans ton retour du ${day(s.date)}`;
    if (s.kind === "draft") return `Proposition préparée le ${day(s.date)}${card?.draft?.basis?.title ? ` à partir de « ${card.draft.basis.title} »` : ""}`;
    if (s.kind === "checkin") return `Check-in partagé de la semaine du ${day(s.date)}`;
    if (s.kind === "empty") return "Dossier vide : aucune proposition ni séance liée pour l’instant";
    return "";
  }

  /** What to do and why, for one athlete. */
  function dossierText(card) {
    const d = card?.dossier, n = card?.next;
    if (n === "paused") return "Rien n’est lu tant qu’une place de ton offre n’est pas libre. Rien n’est supprimé ; le suivi reprend seul.";
    if (n === "resume") return "Une proposition préparée attend : relis l’aperçu, puis envoie-la si elle te convient.";
    if (n === "feedback") return `Séance « ${d?.title || "proposée"} » faite le ${day(d?.done_date)}, liée par le sportif, sans retour pour l’instant.`;
    if (n === "gap") {
      const v = d && FU()?.forCoach ? FU().forCoach(d) : null;
      return v?.text || "Un écart entre la proposition et ce qui a été fait attend ta décision.";
    }
    if (n === "wait") {
      if (card?.source?.kind === "feedback") return "Le sportif n’a pas encore répondu à l’ajustement proposé dans ton retour.";
      return d?.state === "reproposed" ? `Changement proposé sur « ${d.title} » : le sportif décide.` : `« ${d?.title || "Séance proposée"} » attend sa réponse.`;
    }
    if (n === "prepare") {
      if (card?.source?.kind === "empty") return "Aucune séance proposée : prépare une première proposition à partir d’un modèle.";
      return "Rien n’est prévu pour la semaine qui vient : prépare la suite.";
    }
    return "Tout est prévu ou répondu pour cette semaine.";
  }

  const checkinText = (c) => c ? `Semaine du ${day(c.week)} · ${SCORES.filter(([k]) => c.scores?.[k]).map(([k, l]) => `${l} ${Number(c.scores[k])}/5`).join(" · ")}` : "";
  const decisionsText = (rows) => (rows || []).map((r) => `« ${r.title} » du ${day(r.planned_date)} : ${STATUS[r.status] || r.status}`);

  /** The card of one athlete, ready to display. */
  function forCoach(card) {
    const n = NEXT[card?.next] || NEXT.none;
    return {
      name: card?.name || "Compte TITAN", next: card?.next || "none", label: n.label, tone: n.tone, actionable: !!card?.actionable,
      paused: card?.link_state === "paused", text: dossierText(card), source: sourceText(card),
      checkin: checkinText(card?.checkin), previous: decisionsText(card?.previous),
      sent: (card?.sent || []).map((s) => `« ${s.title} » du ${day(s.planned_date)} envoyée : ${STATUS[s.status] || s.status}`),
      dossierId: card?.dossier?.id || null, draft: card?.draft || null,
      can: card?.link_state === "paused" ? [] : [
        ...(card?.dossier?.id ? ["open"] : []),
        ...(card?.next === "feedback" ? ["feedback"] : []),
        card?.draft ? "resume" : "prepare",
      ],
    };
  }

  /** The counts line of the review. */
  function summary(counts) {
    const c = counts || {}, out = [];
    const add = (n, one, many) => { if (n > 0) out.push(`${n} ${n > 1 ? many : one}`); };
    add(c.wait, "réponse attendue", "réponses attendues");
    add(c.gap, "écart à traiter", "écarts à traiter");
    add(c.feedback, "retour à laisser", "retours à laisser");
    add((c.prepare || 0) + (c.resume || 0), "suite à préparer", "suites à préparer");
    add(c.paused, "suivi en pause", "suivis en pause");
    return out.length ? out.join(" · ") : c.athletes ? "Rien à traiter cette semaine." : "Aucun sportif suivi pour l’instant.";
  }

  /** The preview of a prepared proposal: what the athlete will receive and what differs from its basis. */
  function preview(draft) {
    const c = draft?.content || {}, b = draft?.basis || {};
    const show = (f, v) => (f === "sport" ? sportLabel(v) : f === "planned_date" ? day(v) : v) || "—";
    return {
      basis: b.kind === "template" ? `Modèle « ${b.title} »` : b.kind === "proposal" ? `Proposition « ${b.title} »` : "Page blanche",
      receive: [["title", c.title], ["sport", c.sport], ["planned_date", c.planned_date], ["instructions", c.instructions]]
        .filter(([f, v]) => f !== "instructions" || v).map(([f, v]) => ({ field: f, label: FIELDS[f], text: show(f, v) })),
      changes: (draft?.changes || []).map((x) => ({ field: x.field, label: FIELDS[x.field] || x.field, before: x.before == null ? "—" : show(x.field, x.before), after: show(x.field, x.after) })),
      ready: !!(c.title && c.sport && c.planned_date) && draft?.state === "draft",
      canSend: !!draft?.can_send && !!(c.title && c.sport && c.planned_date),
    };
  }

  const api = { NEXT, FIELDS, MESSAGES, message, monday, addDays, weekLabel, sourceText, dossierText, checkinText, forCoach, summary, preview };
  root.TitanCoachReview = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
