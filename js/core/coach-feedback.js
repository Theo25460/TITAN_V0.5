/* V1.9.2 — Retour sur la séance. Shared unchanged by the website (coach and athlete) and the Android app (athlete) through
   mobile/scripts/sync-web-core.mjs. Pure: words what the server computed (public.titan_coach_feedback_v1).
   Rules of the wording: the OBSERVATION (what the coach noticed) and the PROPOSAL (what could change next) are always two separate blocks;
   a proposal is only a suggestion until the athlete confirms it, with a clear state; the measures shown are the ones the link shares at the
   time of reading (the server never sends the others), and every preview is rebuilt from that same answer, so a sharing withdrawn by the
   athlete disappears from previews too. No score, no urgency, no judgement of the athlete. */
(function (root) {
  "use strict";
  const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const iso = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
  /** « dimanche 22 nov. » — a calendar day, read as such (no time zone shift). */
  function day(v) {
    const d = iso(v);
    if (!d) return "";
    const [y, m, n] = d.split("-").map(Number);
    return `${DAYS[new Date(Date.UTC(y, m - 1, n)).getUTCDay()]} ${n} ${MONTHS[m - 1]}`;
  }
  /** « 24 nov. » — the day a feedback was written, in Paris. */
  function writtenOn(v) {
    if (!v) return "";
    const p = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(v));
    const get = (t) => Number(p.find((x) => x.type === t)?.value);
    return `${get("day")} ${MONTHS[get("month") - 1]}`;
  }
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/ /g, " ") : "";
  };
  const sportLabel = (k) => root.TitanSports?.label?.(k) || { muscu_gym: "Musculation en salle", muscu_home: "Musculation à la maison", running: "Course à pied", cycling: "Vélo" }[k] || k || "";
  const plural = (n, one, many) => `${n} ${Math.abs(n) > 1 ? many : one}`;
  const FIELDS = { title: "Nom", sport: "Sport", planned_date: "Date", instructions: "Consignes" };
  const SCORES = { fatigue: "Fatigue", energy: "Énergie", sleep: "Sommeil", motivation: "Motivation" };

  const MESSAGES = {
    FEATURE_DISABLED: "Les retours sur séance ne sont pas encore ouverts sur ce compte.",
    SHARING_UNAVAILABLE: "Ce partage a été arrêté ou n’est plus accessible : ce retour ne peut plus être ouvert.",
    COACH_CAPACITY_PAUSED: "Ce suivi est en pause : rien n’est supprimé, il reprend dès qu’une place se libère.",
    SESSION_CHANGED: "La séance ou son partage a changé pendant ta rédaction. Relis les mesures puis renvoie : ton texte est gardé.",
    NOT_LINKED: "Cette proposition n’est reliée à aucune séance du journal : rien à commenter pour l’instant.",
    BAD_OBSERVATION: "Écris ton observation (1 000 caractères au plus).",
    FEEDBACK_LIMIT: "Cinq retours au plus sur une même séance : écris plutôt dans les messages.",
    THREAD_FULL: "Le fil de ce suivi est plein (500 messages).",
    RATE_LIMITED: "Trop de demandes : réessaie dans un instant.",
    TARGET_UNAVAILABLE: "Cette proposition ne peut plus être ajustée (déjà faite, annulée ou en cours de changement).",
    ADJUSTMENT_PENDING: "Un ajustement attend déjà la réponse du sportif sur cette proposition.",
    ADJUSTMENT_INCOMPLETE: "Une nouvelle séance demande un nom, un sport et une date.",
    ADJUSTMENT_STALE: "La proposition visée a changé ou a été annulée depuis : cet ajustement n’est plus applicable. Rien n’a été modifié.",
    CHANGE_EMPTY: "Rien ne change par rapport à la proposition actuelle.",
    INVALID_PERIOD: "Choisis une date à venir, dans l’année.",
    BAD_TITLE: "Donne un nom à la séance.",
    SPORT_UNKNOWN: "Choisis un sport du catalogue.",
    ASSIGNMENT_LIMIT: "Ce suivi compte déjà 500 propositions.",
    COACH_CONFLICT: "Ce retour vient de changer. Actualise avant de répondre.",
    INVALID_TRANSITION: "Cet ajustement a déjà reçu une réponse.",
    COACH_ONLY: "Seul le coach peut faire cela.",
    ATHLETE_ONLY: "Seul le sportif peut faire cela.",
  };
  const message = (code) => MESSAGES[code] || "";

  const ADJ = {
    pending: { label: "À confirmer", tone: "wait" },
    accepted: { label: "Acceptée", tone: "done" },
    declined: { label: "Déclinée", tone: "neutral" },
    withdrawn: { label: "Retirée par le coach", tone: "neutral" },
    stale: { label: "Plus applicable", tone: "neutral" },
  };
  const SESSION_TEXT = {
    coach: {
      out_of_scope: "Cette séance n’est plus dans le périmètre que le sportif partage (sport ou période) : ses mesures ne sont plus affichées.",
      archived: "Le sportif a archivé ou remplacé cette séance dans son journal : ses mesures ne sont plus affichées. Ton retour et la proposition restent.",
      removed: "Cette séance n’est plus dans le journal du sportif : ses mesures ne sont plus affichées. Ton retour et la proposition restent.",
    },
    athlete: {
      out_of_scope: "Cette séance n’est plus dans ce que tu partages : ton coach ne voit plus ses mesures.",
      archived: "Tu as archivé ou remplacé cette séance : ton coach ne voit plus ses mesures. Le retour reste lisible.",
      removed: "Cette séance n’est plus dans ton journal : ton coach ne voit plus ses mesures. Le retour reste lisible.",
    },
  };

  /** One exercise as shared: « Squat — 80 kg × 6 (RIR 2) · … » when the sets are detailed, else « 4 × 6 à 80 kg ». */
  function exercise(e) {
    const name = [e?.name, e?.variant].filter(Boolean).join(" · ") || "Exercice";
    const rows = Array.isArray(e?.setRows) ? e.setRows.filter((s) => s && (s.weight != null || s.reps != null)) : [];
    const sets = rows.map((s) => [s.weight != null && s.weight !== "" ? `${num(s.weight)} kg` : "", s.reps != null && s.reps !== "" ? `× ${num(s.reps)}` : "",
      s.rir != null && s.rir !== "" ? `(RIR ${num(s.rir)})` : ""].filter(Boolean).join(" "));
    const summary = [e?.sets ? `${num(e.sets)}${e?.reps ? ` × ${num(e.reps)}` : " séries"}` : e?.reps ? `${num(e.reps)} répétitions` : "", e?.weight ? `à ${num(e.weight)} kg` : ""].filter(Boolean).join(" ");
    return { name, summary, sets };
  }

  /** The session as the link shares it now (server projection), worded for one side. */
  function session(s, role = "coach") {
    if (!s) return { state: "none", heading: "", measures: [], exercises: [], extras: [], note: "", checkin: "", hidden: "", text: "", corrected: "" };
    const hiddenNames = (Array.isArray(s.hidden) ? s.hidden : []).map((h) => ({ details: "le détail des exercices", notes: "la note" }[h])).filter(Boolean);
    const hidden = hiddenNames.length ? `${role === "athlete" ? "Tu ne partages pas" : "Non partagé par le sportif"} : ${hiddenNames.join(" et ")}.` : "";
    if (s.state !== "shared") {
      return { state: s.state, heading: s.day ? `Séance du ${day(s.day)}` : "Séance", measures: [], exercises: [], extras: [], note: "", checkin: "", hidden,
        text: (SESSION_TEXT[role] || SESSION_TEXT.coach)[s.state] || "", corrected: "" };
    }
    const measures = [];
    if (s.val != null && Number(s.val) > 0) measures.push({ key: "val", label: "Mesure", text: `${num(s.val)}${s.unit ? ` ${s.unit}` : ""}` });
    if (s.duration != null && Number(s.duration) > 0) measures.push({ key: "duration", label: "Durée", text: `${num(Math.round(Number(s.duration)))} min` });
    const extras = s.extras && typeof s.extras === "object" ? Object.entries(s.extras).map(([k, v]) => ({ key: k, text: `${{ grade_system: "Cotation", climbing_discipline: "Discipline", belay: "Assurage", max_done: "Max réussi", max_attempt: "Max tenté", attempts: "Essais", successful_routes: "Voies réussies" }[k] || k} : ${v}` })) : [];
    const ck = s.checkin;
    const checkin = ck ? `Check-in de la semaine du ${day(ck.week)}, partagé : ${Object.keys(SCORES).filter((k) => ck.scores?.[k]).map((k) => `${SCORES[k]} ${num(ck.scores[k])}/5`).join(" · ")}${ck.note ? ` — « ${ck.note} »` : ""}` : "";
    return {
      state: "shared", heading: `Séance du ${day(s.day)} · ${sportLabel(s.sport)}`, measures, exercises: Array.isArray(s.exercises) ? s.exercises.map(exercise) : [], extras,
      note: typeof s.note === "string" ? s.note : "", checkin, hidden, text: "",
      corrected: s.corrected ? (role === "athlete" ? "Tu as modifié cette séance après ce retour : les valeurs affichées sont les actuelles." : "Séance modifiée par le sportif après ton retour : les valeurs affichées sont les actuelles.") : "",
    };
  }

  /** What an adjustment changes: [{ field, label, before, after }]. For a new session, every field is "after". */
  function changes(adj) {
    if (!adj?.after) return [];
    const show = (k, v) => (k === "planned_date" ? day(v) : k === "sport" ? sportLabel(v) : String(v ?? ""));
    const keys = Object.keys(FIELDS).filter((k) => adj.kind === "new" ? String(adj.after[k] ?? "") !== "" : String(adj.after[k] ?? "") !== String(adj.before?.[k] ?? ""));
    return keys.map((k) => ({ field: k, label: FIELDS[k], before: adj.kind === "new" ? "" : show(k, adj.before?.[k]) || "—", after: show(k, adj.after[k]) || "—" }));
  }

  /** The proposal for what comes next, separate from the observation, with its state. */
  function adjustment(adj, role = "coach") {
    if (!adj) return null;
    const st = ADJ[adj.state] || ADJ.pending;
    const target = adj.kind === "change" ? adj.target?.title || adj.before?.title || "la proposition suivante" : "";
    const heading = adj.kind === "change" ? `Ajuster « ${target} »` : `Ajouter « ${adj.after?.title || "une séance"} »`;
    let text = {
      pending: role === "athlete" ? `Rien ne change tant que tu n’as pas répondu. Accepter ${adj.kind === "new" ? "l’ajoute à tes séances proposées" : "met à jour la proposition"} ; décliner ne change rien.` : "En attente de la réponse du sportif : rien ne change sans son accord.",
      accepted: adj.kind === "change" ? `Acceptée${adj.answered_at ? ` le ${writtenOn(adj.answered_at)}` : ""} : « ${adj.result?.title || target} » est à jour${adj.result?.planned_date ? `, prévue ${day(adj.result.planned_date)}` : ""}.`
        : `Acceptée${adj.answered_at ? ` le ${writtenOn(adj.answered_at)}` : ""} : « ${adj.result?.title || adj.after?.title} » est ajoutée${adj.result?.planned_date ? `, prévue ${day(adj.result.planned_date)}` : ""}.`,
      declined: role === "athlete" ? "Tu l’as déclinée : la suite reste comme prévu." : "Déclinée par le sportif : la suite reste comme prévu.",
      withdrawn: "Le coach a retiré cette proposition : rien n’a changé.",
      stale: "La proposition visée a changé ou a été annulée depuis : cet ajustement ne peut plus s’appliquer. Rien n’a été modifié.",
    }[adj.state] || "";
    // A sentence ending on an abbreviated month (« nov. ») takes no second full stop.
    text = text.replace(/\.\.$/, ".");
    return { kind: adj.kind, state: adj.state, label: st.label, tone: st.tone, heading, text, changes: changes(adj), note: adj.note || "" };
  }

  /** The one-line preview of a feedback (lists, thread, the athlete's session). Built only from the server's answer of this read. */
  function preview(row, role = "coach") {
    if (!row) return "";
    const s = row.session || {};
    const parts = [`Retour du ${writtenOn(row.created_at)}`];
    if (row.assignment?.title) parts.push(`« ${row.assignment.title} »`);
    if (s.state === "shared") {
      parts.push(`séance du ${day(s.day)}`);
      if (Array.isArray(s.exercises) && s.exercises.length) parts.push(plural(s.exercises.length, "exercice", "exercices"));
    } else if (s.state) parts.push({ out_of_scope: "séance hors partage", archived: "séance archivée", removed: "séance retirée" }[s.state] || "");
    if (row.adjustment) parts.push(`proposition ${(ADJ[row.adjustment.state] || ADJ.pending).label.toLowerCase()}`);
    if (role === "athlete" && !row.read_at && !row.adjustment) parts.push("à lire");
    return parts.filter(Boolean).join(" · ");
  }

  function linkText(row, role) {
    if (row?.link_state === "revoked") return role === "athlete" ? "Partage arrêté : lecture seule. Ton coach ne voit plus ce retour ni ta séance." : "Partage arrêté.";
    if (row?.link_state === "paused") return role === "athlete" ? "Suivi en pause : lecture seule, rien n’est supprimé." : "Suivi en pause.";
    return "";
  }

  function forCoach(row) {
    const can = [];
    if (row?.can_withdraw) can.push("withdraw");
    return { preview: preview(row, "coach"), observation: row?.observation || "", written: writtenOn(row?.created_at), session: session(row?.session, "coach"),
      adjustment: adjustment(row?.adjustment, "coach"), link: linkText(row, "coach"), relinked: relinked(row, "coach"), can };
  }

  function forAthlete(row) {
    const can = [];
    if (row?.can_answer) can.push("accept", "decline");
    if (row?.can_read) can.push("read");
    return { preview: preview(row, "athlete"), observation: row?.observation || "", written: writtenOn(row?.created_at), session: session(row?.session, "athlete"),
      adjustment: adjustment(row?.adjustment, "athlete"), link: linkText(row, "athlete"), relinked: relinked(row, "athlete"), read: !!row?.read_at, can };
  }

  /** The proposal was relinked to another session since: the feedback stays on its own session. */
  function relinked(row, role) {
    if (row?.assignment?.session === "other") return role === "athlete" ? "La proposition est maintenant reliée à une autre de tes séances : ce retour concerne la séance d’origine." : "La proposition a depuis été reliée à une autre séance : ce retour reste sur la séance d’origine.";
    if (row?.assignment?.session === "none") return role === "athlete" ? "Tu as retiré le lien entre la proposition et cette séance : le retour reste sur la séance d’origine." : "Le sportif a retiré le lien avec cette séance : le retour reste sur la séance d’origine.";
    return "";
  }

  const api = { MESSAGES, ADJ, FIELDS, message, day, writtenOn, exercise, session, changes, adjustment, preview, forCoach, forAthlete };
  root.TitanCoachFeedback = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
