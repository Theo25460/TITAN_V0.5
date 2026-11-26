/* V1.8.6 — Agenda et rendez-vous d’équipe (docs/V186_AGENDA_CLUB.md).
   Shared unchanged by the website and the Android app (mobile/scripts/sync-web-core.mjs). Pure: no I/O, no time source except the
   `now` a caller passes. The server (titan_club_agenda_v1 / titan_club_agenda_act_v1 / titan_club_agenda_invite_v1) is the authority:
   it counts the answers, keeps the capacity and the waiting list, decides who reads the precise place and withholds the group's totals
   below 3 linked sessions. This module words what each member reads. Nothing here is XP, credit, a ranking or an advantage, and nothing
   here ever writes a session: linking one is a choice of its owner. */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------------ rule (mirror of 20261130104600_club_agenda.sql) */
  const RULE = Object.freeze({
    titleMin: 3, titleMax: 60,
    areaMin: 2, areaMax: 60,
    placeMin: 2, placeMax: 200,
    fallbackMin: 3, fallbackMax: 200,
    durationMin: 15, durationMax: 480,
    capacityMin: 2, capacityMax: 100,
    occurrencesMax: 12,     // a weekly series: 2 to 12 occurrences, each at the same Paris time
    horizonDays: 60,        // a meeting starts within the next 60 days
    leadMinutes: 30,        // and at least 30 minutes from now
    presenceDays: 7,        // a presence is declared from the start to 7 days after the end
    reportThreshold: 3,     // the group's minutes, distance and disciplines from 3 linked sessions
    codeLength: 8,
  });
  const MESSAGES = Object.freeze({
    FEATURE_DISABLED: "L’agenda n’est pas encore ouvert pour ce club.",
    CLUB_NOT_FOUND: "Ce club n’est plus accessible.",
    CLUB_ADMIN_REQUIRED: "Seuls les administrateurs du club organisent les rendez-vous.",
    NOT_ELIGIBLE: "Tu pourras organiser un rendez-vous un jour après la création du compte.",
    AGENDA_INVALID: "Vérifie le titre (3 à 60 caractères), le lieu, la durée (15 min à 8 h) et une date dans les 60 jours, au moins 30 minutes à l’avance.",
    AGENDA_LIMIT: "Ce club a déjà dix rendez-vous à venir : annule ou laisse passer l’un d’eux.",
    SLOT_NOT_FOUND: "Ce rendez-vous n’existe plus.",
    SLOT_CANCELLED: "Ce rendez-vous est annulé.",
    SLOT_STARTED: "Ce rendez-vous a commencé : les réponses sont closes.",
    SLOT_NOT_STARTED: "Tu pourras dire si tu y étais une fois le rendez-vous commencé.",
    SLOT_CLOSED: "Le bilan de ce rendez-vous est clos (7 jours après la fin).",
    SERIES_CANCELLED: "Cette série est annulée.",
    SERIES_ACTIVE: "Cette série n’est pas annulée.",
    NO_FALLBACK: "Ce rendez-vous n’a pas de plan de repli.",
    ANSWER_REQUIRED: "Réponds d’abord au rendez-vous pour demander un rappel.",
    PRESENCE_REQUIRED: "Dis d’abord que tu y étais pour associer ta séance.",
    LOG_NOT_ELIGIBLE: "Cette séance ne peut pas être associée : choisis une de tes séances confirmées du jour du rendez-vous.",
    ACCOUNT_SUSPENDED: "Ton compte est suspendu : tu ne peux pas prendre de place pour l’instant.",
    RATE_LIMITED: "Beaucoup d’actions en peu de temps. Réessaie dans un instant.",
  });
  const ANSWERS = Object.freeze({
    yes: "Je viens",
    maybe: "Peut-être",
    no: "Je ne viens pas",
    waitlist: "En attente d’une place",
  });
  const HISTORY = Object.freeze({
    created: "Proposé",
    moved: "Déplacé",
    fallback_on: "Passé au plan de repli",
    fallback_off: "Revenu au plan prévu",
    cancelled: "Annulé",
    restored: "Rétabli",
    series_cancelled: "Série annulée",
    series_resumed: "Série reprise",
  });

  const int = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
  const plural = (n, one, many) => `${int(n)} ${int(n) > 1 ? many : one}`;
  const valid = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d; };
  const day = (iso) => { const d = valid(iso); return d ? d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" }) : ""; };
  const shortDay = (iso) => { const d = valid(iso); return d ? d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" }) : ""; };
  /** A Paris time as « 9 h 05 » (non-breaking spaces: the time never splits across two lines). */
  const time = (iso) => {
    const d = valid(iso);
    if (!d) return "";
    const t = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Paris" });
    const m = /(\d{1,2})\D(\d{2})/.exec(t);
    return m ? `${Number(m[1])}\u00a0h\u00a0${m[2]}` : t;
  };
  const when = (iso) => (valid(iso) ? `${day(iso)} à ${time(iso)}` : "");
  const duration = (min) => {
    const m = int(min);
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, "0")}` : ""}`;
  };
  const clean = (v) => String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim();

  /** What each one reads, said plainly. */
  function role(view) {
    if (!view) return "";
    return view.role === "organizer"
      ? "Tu organises les rendez-vous de ce club (administrateur) : tu vois qui a répondu quoi et le lieu précis. Les membres ne voient que des nombres de réponses."
      : "Les rendez-vous sont proposés par les administrateurs du club. Tu vois l’heure, le lieu, le plan de repli et le nombre de réponses, jamais qui a répondu quoi.";
  }

  /** The heading line: when, how long, which occurrence of a series. */
  function header(slot) {
    if (!slot) return "";
    const series = slot.recurrence === "weekly" ? ` · rendez-vous ${int(slot.n)} sur ${int(slot.occurrences)}, chaque semaine` : "";
    return `${when(slot.startsAt)} · ${duration(slot.durationMin)} · ${clean(slot.area)}${series}`;
  }

  /** The state of the occurrence: cancelled, moved, on its fallback, running, ended. */
  function status(slot) {
    if (!slot) return [];
    const out = [];
    if (slot.phase === "cancelled") out.push(slot.series === "cancelled" ? "Annulé : la série a été annulée par les administrateurs du club." : "Annulé par les administrateurs du club.");
    if (slot.moved && slot.phase !== "cancelled") out.push(`Déplacé : prévu d’abord ${when(slot.plannedAt)}.`);
    if (slot.fallbackOn && slot.fallback) out.push(`Plan de repli activé : ${clean(slot.fallback)}`);
    else if (slot.fallback && slot.phase !== "cancelled" && slot.phase !== "ended") out.push(`En cas de changement : ${clean(slot.fallback)}`);
    if (slot.phase === "running") out.push("En cours.");
    if (slot.phase === "ended") out.push(`Terminé ${shortDay(slot.endsAt) ? `le ${shortDay(slot.endsAt)}` : ""}.`.replace(" .", "."));
    return out;
  }

  /** The counts of answers (never a name), and the places. */
  function counts(slot) {
    if (!slot || !slot.counts) return "";
    const c = slot.counts;
    if (!int(c.yes) && !int(c.maybe) && !int(c.waitlist) && !int(c.no)) return `Pas encore de réponse${slot.capacity ? ` · ${plural(slot.capacity, "place", "places")}` : ""}`;
    const parts = [`${int(c.yes)} ${int(c.yes) > 1 ? "viennent" : "vient"}`];
    if (int(c.maybe)) parts.push(`${int(c.maybe)} peut-être`);
    if (int(c.waitlist)) parts.push(`${int(c.waitlist)} en attente`);
    if (int(c.no)) parts.push(`${int(c.no)} ${int(c.no) > 1 ? "ne viennent pas" : "ne vient pas"}`);
    const places = slot.capacity ? ` · ${int(c.yes)} place${int(c.yes) > 1 ? "s" : ""} prise${int(c.yes) > 1 ? "s" : ""} sur ${int(slot.capacity)}${slot.full ? " (complet)" : ""}` : "";
    return parts.join(" · ") + places;
  }

  /** The precise place, or why it is not shown. */
  function place(slot) {
    if (!slot) return "";
    if (slot.place) return `Lieu précis : ${clean(slot.place)}`;
    if (!slot.hasPlace || slot.phase === "cancelled" || slot.phase === "ended") return "";
    return "Le lieu précis est donné à ceux qui viennent, hésitent ou attendent une place.";
  }

  /** One's own answer, its place in line, a change since, the reminder. */
  function mine(slot) {
    if (!slot || slot.phase === "cancelled") return "";
    const me = slot.me;
    if (slot.phase === "running" || slot.phase === "ended") {
      if (!me || me.attended == null) return "Tu peux dire si tu y étais. Rien n’est écrit dans ton journal.";
      if (me.attended === false) return "Tu as indiqué que tu n’y étais pas.";
      return me.linked ? "Tu y étais, et ta séance est associée au bilan du groupe." : "Tu y étais. Si tu le souhaites, associe une de tes séances du jour au bilan du groupe.";
    }
    if (!me || !me.answer) return "Tu n’as pas encore répondu.";
    let text = `Ta réponse : ${ANSWERS[me.answer] || ANSWERS.no}`;
    if (me.answer === "waitlist") text += me.position ? ` (${int(me.position) === 1 ? "1re" : `${int(me.position)}e`} dans la file). Si une place se libère, elle est pour toi.` : ".";
    else if (me.promoted) text += " — une place s’est libérée pour toi.";
    else text += ".";
    if (me.toConfirm) text += " L’heure ou le plan a changé depuis ta réponse : confirme-la ou change d’avis.";
    if (me.reminder && me.answer !== "no") text += " Rappel demandé : il apparaîtra dans « Depuis ta dernière visite » la veille.";
    return text;
  }

  /** The clear history of the meeting and its series (never who changed it). */
  function history(slot) {
    const list = (slot && Array.isArray(slot.history)) ? slot.history : [];
    return list.filter((h) => HISTORY[h.kind]).map((h) => {
      const of = h.n && slot.recurrence === "weekly" ? ` (rendez-vous ${int(h.n)})` : "";
      const on = `le ${shortDay(h.at)}`;
      if (h.kind === "moved") return `${HISTORY.moved}${of} ${on} : de ${when(h.from)} à ${when(h.to)}.`;
      if (h.kind === "created") return `${HISTORY.created} ${on}${slot.recurrence === "weekly" ? `, ${plural(slot.occurrences, "rendez-vous", "rendez-vous")} chaque semaine` : ""}.`;
      return `${HISTORY[h.kind]}${of} ${on}.`;
    });
  }

  /** The finished card: the group's report from the sessions that were linked, and one's own. */
  function report(slot) {
    const r = slot && slot.report;
    if (!r || (slot.phase !== "ended" && slot.phase !== "running")) return null;
    const lines = [`${plural(r.present, "présence déclarée", "présences déclarées")} · ${plural(r.linked, "séance associée", "séances associées")}`];
    if (r.visible) {
      const bits = [`${int(r.minutes)} min d’effort ensemble`];
      if (Number(r.km) > 0) bits.push(`${String(Math.round(Number(r.km) * 10) / 10).replace(".", ",")} km`);
      bits.push(plural(r.sports, "discipline", "disciplines"));
      lines.push(bits.join(" · "));
    } else {
      lines.push(`Les totaux du groupe s’affichent à partir de ${RULE.reportThreshold} séances associées : personne ne peut en déduire la séance d’un autre.`);
    }
    lines.push("Aucune séance n’est écrite à ta place : chacun choisit d’associer la sienne, ou non.");
    return { title: "Bilan du rendez-vous", lines };
  }

  /** One's own sessions of the day that may be linked, worded with the sport label the caller knows. */
  function candidates(slot, sportLabel) {
    const list = (slot && slot.me && Array.isArray(slot.me.candidates)) ? slot.me.candidates : [];
    const label = typeof sportLabel === "function" ? sportLabel : (s) => s;
    return list.map((c) => ({ id: c.id, label: `${label(c.sport) || "Séance"} · ${int(c.minutes)} min${c.unit === "km" && Number(c.val) > 0 ? ` · ${String(Number(c.val)).replace(".", ",")} km` : ""}` }));
  }
  function linked(slot, sportLabel) {
    const l = slot && slot.me && slot.me.linked;
    if (!l) return "";
    const label = typeof sportLabel === "function" ? sportLabel : (s) => s;
    return `Ta séance associée : ${label(l.sport) || "séance"} · ${int(l.minutes)} min.`;
  }

  /** The actions the server offers on one occurrence, in a stable order, with their labels. */
  function actions(slot) {
    const can = (slot && Array.isArray(slot.can)) ? slot.can : [];
    const me = (slot && slot.me) || {};
    const out = [];
    for (const a of ["yes", "maybe", "no"]) if (can.includes(a)) out.push({ id: "answer", answer: a, label: ANSWERS[a], primary: a === "yes" });
    if (can.includes("remind")) out.push({ id: "remind", on: !me.reminder, label: me.reminder ? "Ne plus me le rappeler" : "Me le rappeler" });
    if (can.includes("attend")) {
      if (me.attended !== true) out.push({ id: "attend", on: true, label: "J’y étais", primary: true });
      if (me.attended !== false) out.push({ id: "attend", on: false, label: "Je n’y étais pas" });
    }
    if (can.includes("unlink")) out.push({ id: "unlink", label: "Retirer ma séance du bilan" });
    if (can.includes("move")) out.push({ id: "move", label: "Déplacer", organizer: true });
    if (can.includes("fallback")) out.push({ id: "fallback", on: !slot.fallbackOn, label: slot.fallbackOn ? "Revenir au plan prévu" : "Passer au plan de repli", organizer: true });
    if (can.includes("restore")) out.push({ id: "restore", label: "Rétablir ce rendez-vous", organizer: true });
    if (can.includes("cancel")) out.push({ id: "cancel", label: "Annuler ce rendez-vous", danger: true, organizer: true });
    return out;
  }
  /** Series-wide actions for the organiser (the server checks again). */
  function seriesActions(slot, view) {
    if (!slot || !view || view.role !== "organizer") return [];
    const out = [];
    if (slot.series === "active" && slot.code) out.push({ id: "new_code", label: "Renouveler le lien d’invitation" });
    if (slot.recurrence === "weekly" && slot.series === "active") out.push({ id: "cancel_series", label: "Annuler toute la série", danger: true });
    if (slot.recurrence === "weekly" && slot.series === "cancelled" && slot.phase === "cancelled") out.push({ id: "resume_series", label: "Reprendre la série" });
    return out;
  }
  function confirmText(action) {
    if (action === "cancel") return { title: "Annuler ce rendez-vous ?", message: "Les membres verront qu’il est annulé, avec la date, dans l’historique. Tu pourras le rétablir avant l’heure prévue.", confirm: "Annuler le rendez-vous" };
    if (action === "cancel_series") return { title: "Annuler toute la série ?", message: "Les rendez-vous à venir sont annulés, sans rien effacer : la série pourra être reprise avec les mêmes rendez-vous et les réponses déjà données.", confirm: "Annuler la série" };
    if (action === "new_code") return { title: "Renouveler le lien d’invitation ?", message: "L’ancien lien ne mènera plus à rien. Transmets le nouveau aux membres du club.", confirm: "Renouveler" };
    return null;
  }
  function result(action, answer) {
    if (action === "answer") return ({ yes: "C’est noté : tu viens.", maybe: "C’est noté : peut-être.", no: "C’est noté : tu ne viens pas." })[answer] || "C’est noté.";
    return ({
      create: "Rendez-vous proposé au club. Chaque membre répond s’il le souhaite.",
      remind: "C’est noté.",
      attend: "C’est noté. Rien n’est écrit dans ton journal.",
      link: "Ta séance est associée au bilan du groupe.",
      unlink: "Ta séance n’est plus associée.",
      move: "Rendez-vous déplacé : les réponses restent, à confirmer par chacun.",
      fallback: "Plan modifié : les membres le voient.",
      cancel: "Rendez-vous annulé.",
      restore: "Rendez-vous rétabli.",
      cancel_series: "Série annulée.",
      resume_series: "Série reprise, avec les mêmes rendez-vous.",
      new_code: "Nouveau lien d’invitation prêt.",
    })[action] || "C’est fait.";
  }
  /** Says the outcome of a « yes »: counted, or kept on the waiting list. */
  function answered(slot) {
    const me = slot && slot.me;
    if (!me) return null;
    if (me.answer === "waitlist") return `C’est complet : tu es ${int(me.position) === 1 ? "1re" : `${int(me.position)}e`} dans la file d’attente. Si une place se libère, elle est pour toi.`;
    return null;
  }
  function message(error) {
    const raw = String((error && error.message) || error || "");
    // The longest code first: LOG_NOT_ELIGIBLE must not be read as NOT_ELIGIBLE.
    const key = Object.keys(MESSAGES).sort((a, b) => b.length - a.length).find((k) => raw.includes(k));
    return key ? MESSAGES[key] : null;
  }

  /** Paris wall-clock date and time (« 2026-11-28 », « 09:00 ») → an instant. Correct across the change of hour. */
  function parisInstant(dateIso, hhmm) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateIso || "")) || !/^\d{2}:\d{2}$/.test(String(hhmm || ""))) return null;
    const [y, mo, d] = dateIso.split("-").map(Number), [h, mi] = hhmm.split(":").map(Number);
    if (h > 23 || mi > 59) return null;
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    // The offset of Paris at that moment (1 h or 2 h), read from the formatter, applied twice to settle across a change.
    const offset = (t) => {
      const p = new Date(t).toLocaleString("en-GB", { timeZone: "Europe/Paris", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
      const m = /(\d{2})\/(\d{2})\/(\d{4}),? (\d{2}):(\d{2})/.exec(p);
      return m ? Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]) % 24, Number(m[5])) - t : 3600000;
    };
    let t = guess - offset(guess);
    t = guess - offset(t);
    return new Date(t).toISOString();
  }

  /** Client-side check of the creation form (the server checks again). Returns an error code or null. */
  function validate(form, nowMs) {
    const f = form || {};
    const title = clean(f.title), area = clean(f.area), placeText = clean(f.place), fallback = clean(f.fallback);
    if (title.length < RULE.titleMin || title.length > RULE.titleMax) return "AGENDA_INVALID";
    if (area.length < RULE.areaMin || area.length > RULE.areaMax) return "AGENDA_INVALID";
    if (placeText && (placeText.length < RULE.placeMin || placeText.length > RULE.placeMax)) return "AGENDA_INVALID";
    if (fallback && (fallback.length < RULE.fallbackMin || fallback.length > RULE.fallbackMax)) return "AGENDA_INVALID";
    const dur = Number(f.durationMin);
    if (!Number.isInteger(dur) || dur < RULE.durationMin || dur > RULE.durationMax) return "AGENDA_INVALID";
    if (f.capacity !== "" && f.capacity != null) {
      const cap = Number(f.capacity);
      if (!Number.isInteger(cap) || cap < RULE.capacityMin || cap > RULE.capacityMax) return "AGENDA_INVALID";
    }
    const rec = f.recurrence || "once", occ = Number(f.occurrences || 1);
    if (rec === "once" && occ !== 1) return "AGENDA_INVALID";
    if (rec === "weekly" && !(Number.isInteger(occ) && occ >= 2 && occ <= RULE.occurrencesMax)) return "AGENDA_INVALID";
    if (rec !== "once" && rec !== "weekly") return "AGENDA_INVALID";
    const at = Date.parse(f.startsAt || "");
    if (!Number.isFinite(at)) return "AGENDA_INVALID";
    if (Number.isFinite(nowMs) && (at < nowMs + RULE.leadMinutes * 60000 || at > nowMs + RULE.horizonDays * 86400000)) return "AGENDA_INVALID";
    return null;
  }
  /** The payload of a creation, from a validated form. */
  function payload(form) {
    const f = form || {};
    const rec = f.recurrence === "weekly" ? "weekly" : "once";
    return {
      title: clean(f.title), area: clean(f.area), place: clean(f.place) || null, fallback: clean(f.fallback) || null,
      durationMin: Number(f.durationMin), capacity: f.capacity === "" || f.capacity == null ? null : Number(f.capacity),
      recurrence: rec, occurrences: rec === "weekly" ? Number(f.occurrences) : 1, startsAt: f.startsAt,
    };
  }

  /** The invitation code read from a link or typed (8 characters, no ambiguous letter). */
  function code(raw) { return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12); }
  function inviteLink(c, origin) { return `${String(origin || "").replace(/\/$/, "")}/social.html?rdv=${encodeURIComponent(code(c))}`; }
  /** What the invitation link says when it does not open a meeting: never a title, a time or a place. */
  function invite(answer) {
    if (!answer || answer.status === "unavailable") return "Ce lien ne mène à aucun rendez-vous de tes clubs. Demande un nouveau lien à un administrateur du club.";
    if (answer.status === "expired") return "Cette invitation a expiré : le rendez-vous est passé ou la série a été annulée.";
    return null;
  }

  /** The lines of « Depuis ta dernière visite » for the meetings that ask for something. */
  function digest(items) {
    const list = Array.isArray(items) ? items : [];
    const name = (it) => `« ${clean(it.title)} » (${clean(it.clubName) || "ton club"})`;
    const words = {
      promoted: (it) => `Une place s’est libérée : tu es inscrit·e à ${name(it)}, ${when(it.startsAt)}.`,
      cancelled: (it) => `${name(it)}, prévu ${when(it.startsAt)}, est annulé.`,
      toConfirm: (it) => `${name(it)} a changé : c’est maintenant ${when(it.startsAt)}. Confirme ta réponse ou change d’avis.`,
      reminder: (it) => `Rappel : ${name(it)}, ${when(it.startsAt)}.`,
      answer: (it) => `Ton club propose ${name(it)}, ${when(it.startsAt)}. Tu viens ?`,
      presence: (it) => `${name(it)} est terminé : dis si tu y étais et, si tu veux, associe ta séance au bilan du groupe.`,
    };
    return list.filter((it) => it && words[it.reason]).map((it) => ({ id: `agenda-${it.reason}-${it.slot}`, kind: "together", href: "#clubs", text: words[it.reason](it) }));
  }

  const api = { RULE, MESSAGES, ANSWERS, HISTORY, time, when, duration, role, header, status, counts, place, mine, history, report, candidates, linked, actions, seriesActions, confirmText, result, answered, message, parisInstant, validate, payload, code, inviteLink, invite, digest };
  root.TitanClubAgenda = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
