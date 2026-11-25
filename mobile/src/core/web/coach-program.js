/* V1.9.4 — Programmation multi-semaines. Shared unchanged by the website (coach and athlete) and the Android app (athlete) through
   mobile/scripts/sync-web-core.mjs. Pure: words what the server computed (public.titan_coach_program_v1) — a programme week by week,
   the state of each session (TitanCoachFollowup's states), the preview of an adaptation against its starting point, the preview of a
   revision (what is updated, what gets a change beside the accepted version, what is kept), the versions, and the athlete's answers.
   The server decides; this module never infers a state. Rules of the wording: the athlete's journal belongs to the athlete, a declined
   session or one to discuss is not a failure, no counter of missed sessions, no urgency; a session done is never replaced. */
(function (root) {
  "use strict";
  const FU = () => root.TitanCoachFollowup;
  const DAYS = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
  const iso = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
  const day = (v) => FU()?.day?.(v) || iso(v) || "";
  const sportLabel = (k) => root.TitanSports?.label?.(k) || k || "";
  const plural = (n, one, many) => `${n} ${Math.abs(n) > 1 ? many : one}`;
  const addDays = (v, n) => {
    const d = iso(v);
    if (!d) return null;
    const t = new Date(d + "T12:00:00Z");
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };

  const PLAN_STATES = { draft: "Brouillon", sent: "Envoyé", closed: "Clos", discarded: "Abandonné" };
  const FIELDS = { week: "Semaine", day: "Jour", title: "Nom", sport: "Sport", instructions: "Consignes", planned_date: "Date" };
  const EFFECTS = {
    updated: { label: "Mise à jour", text: "Pas encore répondue : mise à jour directement.", applies: true },
    change_proposed: { label: "Changement proposé", text: "Acceptée : le changement attend sa réponse, la version acceptée reste en vigueur.", applies: true },
    kept_done: { label: "Conservée", text: "Faite et liée à une séance : conservée telle quelle.", applies: false },
    kept_past: { label: "Conservée", text: "Date passée : conservée dans l’historique.", applies: false },
    kept_declined: { label: "Conservée", text: "Déclinée : laissée telle quelle.", applies: false },
    kept_cancelled: { label: "Conservée", text: "Annulée : laissée telle quelle.", applies: false },
    kept_out_of_range: { label: "Conservée", text: "La nouvelle date sortirait de la période possible : conservée.", applies: false },
    unchanged: { label: "Inchangée", text: "Rien ne change pour cette séance.", applies: false },
  };
  const ANSWERS = { accepted: "Acceptée", declined: "Déclinée", to_discuss: "À discuter", change_accepted: "Changement accepté", version_kept: "Version gardée", unchanged: "Déjà répondue" };
  const MESSAGES = {
    FEATURE_DISABLED: "Les programmes sur plusieurs semaines ne sont pas encore ouverts sur ce compte.",
    SHARING_UNAVAILABLE: "Ce partage a été arrêté ou n’est plus accessible : rien n’a été envoyé.",
    COACH_CAPACITY_PAUSED: "Ce suivi est en pause faute de place dans l’offre du coach : rien n’est envoyé, rien n’est supprimé.",
    COACH_CONFLICT: "Le programme a changé depuis l’aperçu (une réponse, un lien, une autre modification). Relis l’aperçu avant d’appliquer.",
    COACH_ONLY: "Seul le coach prépare et modifie un programme.",
    ATHLETE_ONLY: "Seul le sportif répond à un programme.",
    INVALID_PERIOD: "Choisis des dates à partir d’aujourd’hui (un an au plus), un programme commence un lundi.",
    INVALID_TRANSITION: "Ce programme a déjà été envoyé, clos ou abandonné. Actualise.",
    INVALID_INPUT: "La demande n’est pas valide. Actualise le programme.",
    WEEK_PLAYED: "Cette semaine est déjà jouée : elle reste dans l’historique telle qu’elle a été.",
    CHANGE_EMPTY: "Rien ne change : aucune séance concernée ne peut être modifiée.",
    BAD_SESSIONS: "Vérifie les séances : une semaine du cycle, un jour de la semaine, une seule fois chacune (60 au plus).",
    BAD_GOALS: "Cinq objectifs au plus.",
    BAD_TITLE: "Donne un nom au programme et à chaque séance.",
    SPORT_UNKNOWN: "Choisis un sport du catalogue.",
    PROGRAM_UNAVAILABLE: "Ce modèle ou ce programme n’existe plus.",
    PROGRAM_LIMIT: "Tu as atteint 50 modèles.",
    PLAN_LIMIT: "Ce suivi a déjà 50 programmes.",
    ASSIGNMENT_LIMIT: "La limite de propositions de ce suivi est atteinte.",
    RATE_LIMITED: "Trop de demandes : réessaie dans un instant.",
  };
  const message = (code) => MESSAGES[code] || FU()?.message?.(code) || "";

  /** The calendar day of a session of a cycle: the cycle's Monday + its week and weekday. */
  const sessionDate = (start, week, weekday) => addDays(start, (Number(week) - 1) * 7 + Number(weekday) - 1);
  /** « du lundi 30 nov. au dimanche 6 déc. » */
  const range = (a, b) => `du ${day(a)} au ${day(b)}`;
  /** « Semaine 2 sur 4 · du lundi 30 nov. au dimanche 6 déc. » */
  function weekLabel(plan, week) {
    const s = addDays(plan?.start_date, (week - 1) * 7);
    return `Semaine ${week}${plan?.weeks ? ` sur ${plan.weeks}` : ""}${s ? ` · ${range(s, addDays(s, 6))}` : ""}`;
  }

  /** The athlete's or coach's reading of one session of a programme (a V1.9.1 row with its key and week, or a draft session). */
  function session(row, role = "coach") {
    if (!row) return null;
    const draft = !row.state;
    const v = draft ? null : role === "coach" ? FU()?.forCoach?.(row) : FU()?.forAthlete?.(row);
    const date = iso(row.planned_date);
    return {
      key: row.key, week: Number(row.week) || null, id: row.id || null, title: row.title || "", sport: sportLabel(row.sport),
      dayText: date ? day(date) : DAYS[row.day] || "", date, state: row.state || "draft", status: row.status || null,
      label: draft ? "" : v?.label || "", tone: draft ? "neutral" : v?.tone || "neutral", text: draft ? "" : v?.text || "",
      dates: draft ? [] : v?.dates || [], changes: draft ? [] : v?.changes || [], instructions: row.instructions || "",
      discuss: row.discuss_note || "", linked: row.state === "linked", changePending: !!(row.pending_change && typeof row.pending_change === "object"),
      readOnly: row.can_act === false, can: draft ? [] : v?.can || [],
    };
  }

  /** The programme week by week: played (every day passed), current, or coming, with its sessions. */
  function weeks(plan, role = "coach", today = null) {
    const n = Number(plan?.weeks) || 0, out = [];
    const t = iso(today) || iso(plan?.today) || null;
    for (let w = 1; w <= n; w++) {
      const s = addDays(plan.start_date, (w - 1) * 7), e = addDays(s, 6);
      const state = t && e < t ? "played" : t && s <= t ? "current" : "coming";
      out.push({ week: w, label: weekLabel(plan, w), start: s, end: e, state,
        stateLabel: state === "played" ? "Jouée" : state === "current" ? "En cours" : "",
        sessions: (plan.sessions || []).filter((r) => Number(r.week) === w).map((r) => session(r, role)) });
    }
    return out;
  }

  /** « 9 acceptées · 1 à discuter · 1 déclinée · 2 liées » — only what is there, nothing missed or late. */
  function summary(plan) {
    const c = plan?.counts || {};
    if (plan?.state === "draft") return `${plural(c.sessions || (plan.sessions || []).length, "séance", "séances")} sur ${plural(plan.weeks || 0, "semaine", "semaines")} · brouillon, rien n’est envoyé`;
    const parts = [];
    if (c.accepted) parts.push(plural(c.accepted, "acceptée", "acceptées"));
    if (c.awaiting) parts.push(`${c.awaiting} en attente de réponse`);
    if (c.to_discuss) parts.push(`${c.to_discuss} à discuter`);
    if (c.changes_pending) parts.push(plural(c.changes_pending, "changement en attente", "changements en attente"));
    if (c.declined) parts.push(plural(c.declined, "déclinée", "déclinées"));
    if (c.linked) parts.push(plural(c.linked, "liée à une séance", "liées à une séance"));
    if (c.cancelled) parts.push(plural(c.cancelled, "annulée", "annulées"));
    return parts.join(" · ") || plural(c.sessions || 0, "séance", "séances");
  }

  /** The head of a programme card: name, dates, state, current week. */
  function head(plan) {
    return {
      title: plan?.title || "", state: plan?.state || "draft", stateLabel: PLAN_STATES[plan?.state] || "",
      dates: plan?.start_date ? range(plan.start_date, plan.end_date || addDays(plan.start_date, (plan.weeks || 1) * 7 - 1)) : "",
      current: plan?.current_week ? `Semaine ${plan.current_week} sur ${plan.weeks}` : "",
      goals: Array.isArray(plan?.goals) ? plan.goals : [], summary: summary(plan),
      origin: plan?.program ? `Modèle « ${plan.program.title} », version ${plan.program.version}${plan.program.current_version > plan.program.version ? ` (le modèle est maintenant en version ${plan.program.current_version} ; ce programme garde la sienne)` : ""}`
        : plan?.basis?.kind === "plan" ? `Dupliqué de « ${plan.basis.title} »` : "",
      link: plan?.link_state === "revoked" ? "Partage arrêté : lecture seule." : plan?.link_state === "paused" ? "Suivi en pause : lecture seule, rien n’est supprimé." : "",
      readOnly: plan?.can_act === false,
    };
  }

  const fieldText = (k, v) => (k === "day" ? DAYS[v] || "" : k === "sport" ? sportLabel(v) : k === "week" ? `semaine ${v}` : k === "planned_date" ? day(v) : String(v ?? ""));
  /** The preview of an adaptation: one line per session added, removed or changed, with before → after per field. */
  function changes(plan) {
    return (plan?.changes || []).map((c) => {
      const b = c.before || {}, a = c.after || {}, name = a.title || b.title || c.key;
      if (c.kind === "added") return { key: c.key, kind: "added", label: `Ajoutée · ${name}`, rows: [{ field: "when", label: "Quand", before: "—", after: `semaine ${a.week}, ${DAYS[a.day]}` }] };
      if (c.kind === "removed") return { key: c.key, kind: "removed", label: `Retirée · ${name}`, rows: [{ field: "when", label: "Quand", before: `semaine ${b.week}, ${DAYS[b.day]}`, after: "—" }] };
      return { key: c.key, kind: "changed", label: `Modifiée · ${name}`, rows: (c.fields || []).map((f) => ({ field: f, label: FIELDS[f] || f, before: fieldText(f, b[f]) || "—", after: fieldText(f, a[f]) || "—" })) };
    });
  }

  /** The preview of a revision (dry_run): per session what happens, the counts, and whether there is anything to apply. */
  function revision(dry, plan) {
    const effects = (dry?.effects || []).map((e) => {
      const x = EFFECTS[e.effect] || EFFECTS.unchanged, b = e.before || {}, a = e.after || {};
      const rows = a && Object.keys(a).length ? ["title", "sport", "planned_date", "instructions"].filter((k) => String(a[k] ?? "") !== String(b[k] ?? ""))
        .map((k) => ({ field: k, label: FIELDS[k], before: fieldText(k, b[k]) || "—", after: fieldText(k, a[k]) || "—" })) : [];
      return { key: e.key, week: e.week, title: e.title, effect: e.effect, label: x.label, text: x.text, applies: x.applies, rows };
    });
    const s = dry?.summary || {}, c = s.counts || {};
    const what = s.scope === "occurrence" ? "Cette séance" : s.scope === "week" ? `La semaine ${s.week}` : `La suite du cycle, à partir de la semaine ${s.week}`;
    const how = s.shift_days ? ` est décalée de ${plural(Math.abs(s.shift_days), "jour", "jours")} ${s.shift_days > 0 ? "plus tard" : "plus tôt"}` : " est modifiée";
    const parts = [];
    if (c.updated) parts.push(`${c.updated} mise(s) à jour`);
    if (c.change_proposed) parts.push(`${c.change_proposed} changement(s) proposé(s) au sportif`);
    const kept = Object.entries(c).filter(([k]) => k.startsWith("kept_")).reduce((n, [, v]) => n + v, 0);
    if (kept) parts.push(`${kept} conservée(s)`);
    return { title: what + how, counts: parts.join(" · "), effects, applies: effects.some((e) => e.applies), key: dry?.preview_key || null,
      note: s.note || "", plan: plan?.title || "" };
  }

  /** One version of the programme, in a sentence. */
  function version(v) {
    const s = v?.summary || {}, c = s.counts || {}, at = iso(v?.created_at) ? day(v.created_at) : "";
    let text = "";
    if (v?.kind === "sent") text = `Envoyé : ${plural(s.sessions || 0, "séance", "séances")}${s.changes ? `, ${plural(s.changes, "adaptation", "adaptations")} du modèle` : ""}`;
    else if (v?.kind === "closed") text = `Cycle clos : ${[s.accepted ? `${s.accepted} acceptée(s)` : "", s.linked ? `${s.linked} liée(s)` : "", s.cancelled ? `${s.cancelled} sans réponse annulée(s)` : "", s.withdrawn ? `${s.withdrawn} changement(s) retiré(s)` : ""].filter(Boolean).join(", ") || "rien n’attendait"}`;
    else {
      const what = s.scope === "occurrence" ? "Une séance modifiée" : s.scope === "week" ? `Semaine ${s.week} décalée` : `Suite du cycle décalée à partir de la semaine ${s.week}`;
      const shift = s.shift_days ? ` de ${plural(Math.abs(s.shift_days), "jour", "jours")}` : "";
      const r = [c.updated ? `${c.updated} mise(s) à jour` : "", c.change_proposed ? `${c.change_proposed} changement(s) proposé(s)` : "",
        c.kept_done ? `${c.kept_done} faite(s) conservée(s)` : ""].filter(Boolean).join(", ");
      text = `${what}${shift}${r ? ` : ${r}` : ""}${s.note ? ` (« ${s.note} »)` : ""}`;
    }
    return { version: v?.version, kind: v?.kind, at, text };
  }

  /** The athlete's answers as the server expects them: [{ key, answer, note }] for sessions with a choice. */
  function answers(choices) {
    return Object.entries(choices || {}).filter(([, c]) => c && c.answer)
      .map(([key, c]) => (c.answer === "discuss" ? { key, answer: "discuss", note: String(c.note || "").slice(0, 300) } : { key, answer: c.answer }));
  }
  /** What the athlete still has to answer: sessions waiting (or to discuss) and changes waiting. */
  function toAnswer(plan) {
    const rows = plan?.sessions || [];
    return { sessions: rows.filter((r) => ["awaiting", "to_discuss"].includes(r.state)).length, changes: rows.filter((r) => r.pending_change && typeof r.pending_change === "object").length };
  }
  /** One answer result in words. */
  const answerText = (r) => ANSWERS[r?.effect] || "";

  /** A fresh op_id for a revision: kept by the sheet, so retrying after a lost answer replays the same revision. */
  function opId() {
    const c = root.crypto;
    if (c?.randomUUID) return c.randomUUID();
    const b = new Uint8Array(16);
    if (c?.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  /** The next Mondays a cycle can start on, from this week's. */
  function mondays(today, count = 8) {
    const t = iso(today);
    if (!t) return [];
    const w = new Date(t + "T12:00:00Z").getUTCDay(), m = addDays(t, w === 0 ? -6 : 1 - w);
    return Array.from({ length: count }, (_, i) => addDays(m, 7 * i));
  }

  const api = { DAYS, PLAN_STATES, EFFECTS, MESSAGES, message, addDays, sessionDate, weekLabel, session, weeks, summary, head, changes, revision, version, answers, toAnswer, answerText, opId, mondays };
  root.TitanCoachProgram = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
