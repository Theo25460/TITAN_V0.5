/* V1.9.1 — Une séance assignée. Shared unchanged by the website (coach) and the Android app (athlete) through
   mobile/scripts/sync-web-core.mjs. Pure: words what the server computed (public.titan_coach_followup_v1) — the state of a proposal,
   the dates (planned, in force, done), what changes in a proposed change, what each side can do, and the history.
   The server decides; this module never infers a state. Rules of the wording: the athlete's journal belongs to the athlete (a match is
   suggested, never applied), a declined or pending proposal is not a failure, no counter of missed sessions, no urgency. */
(function (root) {
  "use strict";
  const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const iso = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
  /** « jeudi 19 nov. » — a calendar day, read as such (no time zone shift). */
  function day(v) {
    const d = iso(v);
    if (!d) return "";
    const [y, m, n] = d.split("-").map(Number);
    const w = new Date(Date.UTC(y, m - 1, n)).getUTCDay();
    return `${DAYS[w]} ${n} ${MONTHS[m - 1]}`;
  }
  const between = (a, b) => {
    const x = iso(a), y = iso(b);
    if (!x || !y) return null;
    return Math.round((Date.parse(y + "T12:00:00Z") - Date.parse(x + "T12:00:00Z")) / 86400000);
  };
  const plural = (n, one, many) => `${n} ${Math.abs(n) > 1 ? many : one}`;
  const sportLabel = (k) => root.TitanSports?.label?.(k) || k || "";

  const STATES = {
    awaiting: { label: "En attente", tone: "wait" },
    reproposed: { label: "Proposée à nouveau", tone: "wait" },
    moved: { label: "Reportée", tone: "gap" },
    to_match: { label: "À rapprocher", tone: "wait" },
    done_unmatched: { label: "Faite sans correspondance", tone: "gap" },
    overdue: { label: "Date passée", tone: "gap" },
    linked: { label: "Liée", tone: "done" },
    declined: { label: "Déclinée", tone: "neutral" },
    planned: { label: "Prévue", tone: "neutral" },
    cancelled: { label: "Annulée", tone: "neutral" },
  };
  const NEXT = {
    wait: { label: "Attendre une réponse", short: "Attendre" },
    gap: { label: "Traiter un écart", short: "Écart" },
    suggest: { label: "Suggérer un changement", short: "Suggérer" },
    none: { label: "", short: "" },
  };
  const FIELDS = { title: "Nom", sport: "Sport", planned_date: "Date", instructions: "Consignes" };
  const MESSAGES = {
    FEATURE_DISABLED: "Le suivi des propositions n’est pas encore ouvert sur ce compte.",
    SHARING_UNAVAILABLE: "Ce partage a été arrêté ou n’est plus accessible.",
    COACH_CAPACITY_PAUSED: "Ce suivi est en pause : rien n’est supprimé, il reprend dès qu’une place se libère.",
    COACH_CONFLICT: "Cette proposition vient de changer. Actualise avant de recommencer.",
    INVALID_TRANSITION: "Cette proposition a changé d’état. Actualise.",
    INVALID_PERIOD: "Choisis une date proche de la date prévue (deux semaines avant, un mois après au plus).",
    INVALID_SESSION: "Choisis une de tes séances du même sport, ni archivée ni en vérification.",
    ALREADY_LINKED: "Cette proposition est déjà liée à une séance : le lien en place est gardé.",
    SESSION_ALREADY_LINKED: "Cette séance est déjà liée à une autre proposition : le lien en place est gardé.",
    CHANGE_EMPTY: "Rien ne change par rapport à la version en vigueur.",
    BAD_TITLE: "Donne un nom à la séance.",
    SPORT_UNKNOWN: "Choisis un sport du catalogue.",
    COACH_ONLY: "Seul le coach peut faire cela.",
    ATHLETE_ONLY: "Seul le sportif peut faire cela.",
  };
  const message = (code) => MESSAGES[code] || "";

  /** The dates that matter, in reading order: planned, in force when moved, done when linked. */
  function dates(row) {
    if (!row) return [];
    const out = [{ key: "planned", label: "Prévue", date: iso(row.planned_date), text: day(row.planned_date) }];
    if (iso(row.moved_date)) out.push({ key: "moved", label: "Déplacée au", date: iso(row.moved_date), text: day(row.moved_date) });
    if (iso(row.done_date)) out.push({ key: "done", label: "Faite le", date: iso(row.done_date), text: day(row.done_date) });
    if (row.pending_change && iso(row.pending_change.planned_date) && row.pending_change.planned_date !== iso(row.planned_date))
      out.push({ key: "proposed", label: "Nouvelle date proposée", date: iso(row.pending_change.planned_date), text: day(row.pending_change.planned_date) });
    return out;
  }

  /** What a proposed change changes: [{ field, label, before, after }] — the version in force is "before". */
  function diff(row) {
    const p = row?.pending_change;
    if (!p) return [];
    const show = (k, v) => (k === "planned_date" ? day(v) : k === "sport" ? sportLabel(v) : String(v ?? ""));
    return Object.keys(FIELDS).filter((k) => k in p && String(p[k] ?? "") !== String(k === "planned_date" ? iso(row[k]) : row[k] ?? ""))
      .map((k) => ({ field: k, label: FIELDS[k], before: show(k, row[k]) || "—", after: show(k, p[k]) || "—" }));
  }

  /** One sentence on the gap between what was planned and what happened, for the coach. */
  function gapText(row) {
    const planned = iso(row.planned_date), moved = iso(row.moved_date), done = iso(row.done_date);
    if (row.state === "linked") {
      if (row.linked && row.linked.in_scope === false) return "Liée à une séance que le partage actuel ne te montre pas (sport ou période hors du partage).";
      const g = between(planned, done);
      if (g === 0) return `Faite le jour prévu (${day(done)}).`;
      if (g === null) return "Liée à une séance du journal.";
      return `Prévue ${day(planned)}, faite ${day(done)} : ${plural(Math.abs(g), "jour", "jours")} ${g > 0 ? "plus tard" : "plus tôt"}.`;
    }
    if (row.state === "moved") return `Prévue ${day(planned)}, déplacée par le sportif au ${day(moved)} ; pas encore de séance liée.`;
    if (row.state === "to_match") return `${moved ? `Déplacée au ${day(moved)} ; une` : "Une"} séance du journal pourrait correspondre : le sportif doit confirmer le rapprochement.`;
    if (row.state === "overdue") return `${moved ? `Déplacée au ${day(moved)}` : `Prévue ${day(planned)}`} : la date est passée, aucune séance liée ni déclarée.`;
    if (row.state === "done_unmatched") return row.status === "completed" ? "La séance liée a été retirée du journal : la proposition reste indiquée comme faite, sans séance." : "Le sportif l’indique comme faite ; aucune séance de son journal n’y est liée.";
    return "";
  }

  /** The coach's reading of one proposal: label, sentence, dates and what the coach can do now. */
  function forCoach(row) {
    const st = STATES[row?.state] || STATES.planned;
    const next = NEXT[row?.coach_next] || NEXT.none;
    let text = "";
    switch (row?.state) {
      case "awaiting": text = "Proposée, pas encore de réponse du sportif."; break;
      case "reproposed": text = "Changement proposé : la version acceptée reste en vigueur jusqu’à la réponse du sportif."; break;
      case "declined": text = "Déclinée par le sportif. Tu peux proposer à nouveau, avec une autre date ou d’autres consignes."; break;
      case "planned": text = "Acceptée et prévue."; break;
      case "cancelled": text = "Annulée."; break;
      default: text = gapText(row);
    }
    const can = [];
    if (row?.can_act !== false) {
      if (row?.pending_change) can.push("withdraw_change");
      else if (["planned", "moved", "overdue", "done_unmatched", "declined", "to_match"].includes(row?.state) && ["accepted", "declined"].includes(row?.status)) can.push("propose_change");
      if (row?.coach_next === "gap" && !row?.seen) can.push("seen");
      if (["proposed", "accepted"].includes(row?.status)) can.push("cancel");
    }
    const advice = { wait: "Rien à faire pour l’instant : la décision appartient au sportif.",
      gap: row?.state === "linked" ? "Prends acte de l’écart, ou adapte la suite." : "Prends acte, propose une autre date ou d’autres consignes, ou écris-lui.",
      suggest: "Tu peux suggérer un changement ; il ne s’applique qu’avec l’accord du sportif.", none: "" }[row?.coach_next || "none"];
    return { label: st.label, tone: st.tone, text, next: row?.coach_next || "none", nextLabel: next.label, advice, dates: dates(row), changes: diff(row), can };
  }

  /** The athlete's reading of one proposal and what they can do (Android, and the website's athlete view). */
  function forAthlete(row) {
    const st = STATES[row?.state] || STATES.planned;
    const cands = Array.isArray(row?.candidates) ? row.candidates : [];
    let text = "";
    switch (row?.state) {
      case "awaiting": text = "Ton coach te propose cette séance. Accepte-la ou décline-la : rien n’est ajouté à ton journal."; break;
      case "reproposed": text = "Ton coach propose un changement. Ta version acceptée reste valable tant que tu n’as pas répondu."; break;
      case "moved": text = `Tu l’as déplacée au ${day(row.moved_date)} : ton coach voit les deux dates.`; break;
      case "to_match": text = cands.length === 1 ? "Une séance de ton journal semble correspondre. Confirme si c’est bien elle : rien n’est lié sans toi." : "Plusieurs séances de ton journal pourraient correspondre. Choisis la bonne, ou aucune."; break;
      case "done_unmatched": text = row.status === "completed" ? "La séance liée n’est plus dans ton journal. Relie une autre séance si tu veux." : "Tu l’as indiquée comme faite. Relie la séance de ton journal quand elle y sera."; break;
      case "overdue": text = "La date est passée. Déplace-la, indique-la comme faite ou décline-la : ce n’est pas un échec."; break;
      case "linked": text = `Reliée à ta séance du ${day(row.done_date)} : tu peux retirer ce lien, ton journal ne change pas.`; break;
      case "declined": text = "Tu l’as déclinée."; break;
      case "cancelled": text = "Ton coach l’a annulée."; break;
      default: text = "Acceptée et prévue.";
    }
    const can = [];
    if (row?.can_act !== false) {
      if (row?.state === "awaiting") can.push("accept", "decline");
      if (row?.pending_change) can.push("accept_change", "decline_change");
      if (cands.length && ["accepted", "completed"].includes(row?.status) && !row?.linked?.session_id) can.push("confirm");
      if (row?.status === "accepted") {
        can.push("move");
        can.push(row?.done_declared_at ? "undeclare" : "declare");
        if (!row?.pending_change) can.push("decline");
      }
      if (row?.status === "completed" && row?.linked?.session_id) can.push("unlink");
    }
    const link = row?.link_state === "revoked" ? "Partage arrêté : lecture seule. Ta séance reste dans ton journal." : row?.link_state === "paused" ? "Suivi en pause : lecture seule, rien n’est supprimé." : "";
    return { label: st.label, tone: st.tone, text, readOnly: row?.can_act === false, link, dates: dates(row), changes: diff(row), candidates: cands, can };
  }

  /** Readable history, oldest first. */
  function history(row) {
    const out = [];
    for (const e of Array.isArray(row?.history) ? row.history : []) {
      const at = iso(e?.at) ? day(e.at) : "";
      const t = {
        proposed: "Proposée", accepted: "Acceptée par le sportif", declined: "Déclinée par le sportif", cancelled: "Annulée par le coach",
        linked: e.day ? `Liée à la séance du ${day(e.day)}` : "Liée à une séance du journal", unlinked: "Lien retiré",
        moved: `Déplacée du ${day(e.from)} au ${day(e.to)}${e.note ? ` (« ${e.note} »)` : ""}`, move_undone: "Remise à sa date prévue",
        declared_done: "Indiquée comme faite, sans séance liée", declaration_withdrawn: "Indication « faite » retirée",
        change_proposed: "Changement proposé par le coach", change_replaced: "Changement remplacé par un autre", change_withdrawn: "Changement retiré par le coach",
        change_accepted: "Changement accepté : nouvelle version en vigueur", change_declined: "Changement décliné : version acceptée gardée",
        link_refused: e.code === "SESSION_ALREADY_LINKED" ? "Tentative de lien refusée : séance déjà liée à une autre proposition" : "Seconde tentative de lien refusée : le lien en place est gardé",
        seen: "Écart traité par le coach",
        adjusted: "Ajustée après un retour du coach, accepté par le sportif", from_feedback: "Ajoutée depuis un retour du coach, acceptée par le sportif",
      }[e?.k];
      if (t) out.push({ kind: e.k, at, text: t, before: e.before || e.kept || null, after: e.after || null });
    }
    return out;
  }

  /** The three versions the coach looks for: the original accepted, the correction (pending or last accepted), the linked activity. */
  function versions(row) {
    const last = [...(Array.isArray(row?.history) ? row.history : [])].reverse().find((e) => e?.k === "change_accepted" || e?.k === "adjusted");
    return {
      original: row?.accepted_version || (Array.isArray(row?.history) ? row.history.find((e) => e?.k === "proposed")?.version : null) || null,
      correction: row?.pending_change ? { ...row.pending_change, pending: true } : last ? { ...last.after, pending: false } : null,
      activity: row?.linked && row.linked.in_scope !== false ? row.linked : row?.linked ? { in_scope: false } : null,
    };
  }

  /** Counts per action for the queue's filter chips. */
  function counts(rows) {
    const c = { all: 0, gap: 0, suggest: 0, wait: 0 };
    for (const r of rows || []) { if (c[r.coach_next] !== undefined) { c[r.coach_next]++; c.all++; } }
    return c;
  }

  const api = { STATES, NEXT, FIELDS, MESSAGES, message, day, dates, diff, gapText, forCoach, forAthlete, history, versions, counts };
  root.TitanCoachFollowup = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
