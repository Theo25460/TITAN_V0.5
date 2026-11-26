/* V1.9.5 — Bilans de cycle partageables. Shared unchanged by the website (coach and athlete) and the Android app (athlete) through
   mobile/scripts/sync-web-core.mjs. Pure: words what the server computed (public.titan_coach_cycle_v1) — the figures of a cycle, each
   with its period and its sources, the sessions with what happened to them (done, moved, declared, archived), what the athlete chooses
   to share (measures, notes, check-ins), the state of the hosted version, the file made from the authorised fields, and the objectives
   a next cycle takes over. The server decides; this module never infers a state and never adds up a total.
   Rules of the wording: the athlete's journal belongs to the athlete; a note or a check-in is out of a report until they tick it in;
   a session without a linked journal session is not a failure (no counter of missed sessions, no urgency); what was downloaded as a
   file cannot be taken back, what is hosted can — say so plainly. */
(function (root) {
  "use strict";
  const FU = () => root.TitanCoachFollowup;
  const iso = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
  const day = (v) => FU()?.day?.(v) || iso(v) || "";
  const sportLabel = (k) => root.TitanSports?.label?.(k) || k || "";
  const plural = (n, one, many) => `${n} ${Math.abs(n) > 1 ? many : one}`;
  const num = (v) => {
    const n = Math.round(Number(v) * 100) / 100;
    return Number.isFinite(n) ? String(n).replace(".", ",") : "";
  };
  const UNITS = { km: "km", m: "m", min: "min", reps: "répétitions", kg: "kg" };
  const unit = (u) => UNITS[u] || u || "";
  /** « 6 h 54 », « 45 min » */
  const duration = (min) => {
    const m = Math.round(Number(min) || 0);
    return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
  };
  /** « du lundi 12 oct. au dimanche 22 nov. » */
  const period = (p) => (p?.from && p?.to ? `du ${day(p.from)} au ${day(p.to)}` : "");

  const STATES = { draft: "Brouillon", proposed: "Proposé au sportif", published: "Publié", none: "" };
  const HOSTED = {
    none: { label: "", coach: "", athlete: "" },
    online: {
      label: "Version en ligne",
      coach: "Tu lis la version que le sportif a validée. Il peut retirer un élément ou l’accès à tout moment.",
      athlete: "Ton coach lit cette version dans TITAN. Tu peux retirer un élément ou tout l’accès à tout moment.",
    },
    withdrawn: {
      label: "Accès retiré",
      coach: "Le sportif a retiré l’accès à la version en ligne : son contenu n’est plus affiché. Une nouvelle validation de sa part publie une nouvelle version.",
      athlete: "Tu as retiré l’accès : ton coach ne lit plus cette version. Valider à nouveau publie une nouvelle version.",
    },
    revalidate: {
      label: "Nouvelle validation demandée",
      coach: "Le périmètre du partage a changé depuis la validation : le contenu partagé n’est plus affiché tant que le sportif n’a pas validé à nouveau.",
      athlete: "Tu as modifié ton partage depuis ta validation : ton coach ne lit plus cette version. Relis ce qui serait partagé et valide à nouveau.",
    },
  };
  const OUTCOMES = {
    done: { label: "Réalisée", tone: "done" },
    declared: { label: "Dite faite", tone: "done" },
    open: { label: "Sans séance liée", tone: "neutral" },
    awaiting: { label: "Sans réponse", tone: "wait" },
    declined: { label: "Déclinée", tone: "neutral" },
    cancelled: { label: "Annulée", tone: "neutral" },
    archived: { label: "Séance archivée", tone: "neutral" },
  };
  const FIGURES = {
    proposed: { label: "Proposées", source: "les séances du programme envoyé" },
    accepted: { label: "Acceptées", source: "les réponses du sportif aux propositions" },
    done: { label: "Réalisées", source: "les séances du journal que le sportif a liées" },
    moved: { label: "Reportées", source: "les dates changées par le sportif ou par une révision du coach" },
    declared: { label: "Dites faites", source: "la déclaration du sportif, sans séance du journal" },
    open: { label: "Sans séance liée", source: "les propositions acceptées sans séance du journal liée" },
    awaiting: { label: "Sans réponse", source: "les propositions encore en attente" },
    declined: { label: "Déclinées", source: "les réponses du sportif aux propositions" },
    cancelled: { label: "Annulées", source: "les propositions annulées (à la clôture ou par le coach)" },
    archived: { label: "Séance archivée depuis", source: "des séances liées que le sportif a archivées dans son journal : elles ne comptent plus comme réalisées" },
    duration: { label: "Durée", source: "la durée des séances du journal partagées dans ce bilan" },
    volume: { label: "Volume", source: "la mesure des séances du journal partagées dans ce bilan" },
  };
  const CHECKIN = { fatigue: "Fatigue", energy: "Énergie", sleep: "Sommeil", motivation: "Motivation" };
  const DECISION_KINDS = { goal: "Objectif", session: "Séance à proposer" };
  const DECISION_STATES = { approved: "Approuvée", declined: "Non retenue", proposed: "En attente de réponse" };
  const RETRACTED = { note: "une note", measure: "une mesure", checkin: "un check-in", word: "ton mot" };
  const MESSAGES = {
    FEATURE_DISABLED: "Les bilans de cycle ne sont pas encore ouverts sur ce compte.",
    SHARING_UNAVAILABLE: "Ce partage a été arrêté ou n’est plus accessible : le bilan n’est plus lisible ici.",
    COACH_CAPACITY_PAUSED: "Ce suivi est en pause faute de place dans l’offre du coach : rien n’est publié, rien n’est supprimé.",
    COACH_CONFLICT: "Le bilan ou les séances ont changé depuis ta lecture. Relis avant de continuer.",
    COACH_ONLY: "Seul le coach prépare le bilan et le cycle suivant.",
    ATHLETE_ONLY: "Seul le sportif valide, retire un élément ou retire l’accès.",
    REPORT_UNAVAILABLE: "Ce bilan n’existe pas ou n’est pas encore proposé.",
    REPORT_WITHDRAWN: "Le sportif a retiré l’accès à la version en ligne : rien ne peut en être lu ni téléchargé.",
    REPORT_REVALIDATION: "Le périmètre du partage a changé : le sportif doit valider à nouveau avant toute lecture ou tout téléchargement.",
    EXPORT_NOT_ALLOWED: "Le sportif n’a pas autorisé le téléchargement d’un fichier pour cette version. La version en ligne reste lisible ici.",
    INVALID_TRANSITION: "Ce bilan a changé d’état. Actualise.",
    INVALID_INPUT: "La demande n’est pas valide. Actualise le bilan.",
    INVALID_PERIOD: "Choisis un lundi à partir de cette semaine.",
    BAD_OBSERVATION: "Chaque constat tient en une phrase (300 caractères, 8 constats au plus).",
    BAD_DECISION: "Chaque décision tient en une phrase (5 décisions au plus).",
    BAD_SOURCE: "Une séance source doit être une séance de ce cycle (8 par constat au plus).",
    SPORT_UNKNOWN: "Choisis un sport du catalogue.",
    RATE_LIMITED: "Trop de demandes : réessaie dans un instant.",
  };
  const message = (code) => MESSAGES[code] || root.TitanCoachProgram?.message?.(code) || FU()?.message?.(code) || "";

  /** One session of the cycle, in words: when it was planned, where it stands now, what happened. */
  function session(s) {
    if (!s) return null;
    const o = OUTCOMES[s.outcome] || OUTCOMES.open;
    const m = s.measure || null;
    const dates = [{ key: "planned", label: "Prévue", text: day(s.first_date || s.planned_date) }];
    if (s.moved) dates.push({ key: "moved", label: s.moved_by === "coach" ? "Reportée par le coach au" : "Reportée par le sportif au", text: day(s.effective_date) });
    if (m?.day) dates.push({ key: "done", label: "Faite", text: day(m.day) });
    const measure = m ? [m.val != null && m.unit ? `${num(m.val)} ${unit(m.unit)}` : "", m.duration != null ? duration(m.duration) : ""].filter(Boolean).join(" · ") : "";
    const text = s.outcome === "archived" ? "Liée à une séance du journal archivée depuis : elle ne compte plus comme réalisée et aucune mesure n’est affichée."
      : s.outcome === "declared" ? "Dite faite par le sportif, sans séance du journal."
      : s.source_out_of_scope || s.out_of_scope || s.in_scope === false ? "Réalisée et liée, hors du périmètre partagé : aucune mesure n’est affichée."
      : s.outcome === "done" && !m ? "Réalisée et liée ; sa mesure n’est pas partagée dans ce bilan." : "";
    return {
      key: s.key, week: Number(s.week) || null, title: s.title || "", sport: sportLabel(s.sport), outcome: s.outcome || "open", label: o.label, tone: o.tone,
      dayText: day(s.effective_date || s.planned_date), moved: !!s.moved, movedBy: s.moved_by || null, dates, measure, note: s.note || "", text,
      name: `${day(s.effective_date || s.planned_date)} · ${s.title || ""}`,
    };
  }
  const byKey = (sessions) => Object.fromEntries((sessions || []).map((s) => [s.key, s]));

  /** One figure: its label, its value, its period and its sources (the sessions it counts, by name). */
  function figure(f, sessions) {
    const def = FIGURES[f?.id] || { label: f?.id || "", source: "" };
    const map = byKey(sessions);
    const value = f.id === "duration" ? duration(f.value) : f.id === "volume" ? `${num(f.value)} ${unit(f.unit)}` : String(f.n ?? 0);
    const count = f.id === "duration" || f.id === "volume" ? plural(f.n || 0, "séance", "séances") : "";
    return {
      id: f.id, unit: f.unit || null, label: def.label, value, count, period: period(f.period),
      source: `Source : ${def.source}.`,
      sources: (f.sources || []).map((k) => ({ key: k, text: map[k] ? session(map[k]).name : k })),
    };
  }
  /** The figures of a report, the week-by-week table and its period, ready to show. */
  function totals(t, sessions) {
    if (!t) return { period: "", weeksCount: 0, figures: [], weeks: [], outside: null };
    const map = byKey(sessions);
    const names = (keys) => (keys || []).map((k) => ({ key: k, text: map[k] ? session(map[k]).name : k }));
    return {
      period: period(t.period), weeksCount: t.period?.weeks || 0,
      figures: (t.figures || []).map((f) => figure(f, sessions)),
      weeks: (t.weeks || []).map((w) => ({ week: w.week, label: `Semaine ${w.week}`, period: period(w.period), planned: w.planned, done: w.done, moved: w.moved, sources: names(w.sources) })),
      outside: t.outside ? { planned: t.outside.planned, done: t.outside.done, sources: names(t.outside.sources), text: `${plural(t.outside.planned, "séance reportée", "séances reportées")} hors des dates du cycle` } : null,
    };
  }
  /** « 18 proposées · 16 acceptées · 8 réalisées · 3 reportées » — the line of a card. */
  function summary(t) {
    const get = (id) => (t?.figures || []).find((f) => f.id === id)?.n || 0;
    return [`${get("proposed")} proposées`, `${get("accepted")} acceptées`, `${get("done")} réalisées`, `${get("moved")} reportées`].join(" · ");
  }

  /** An observation with the sessions it rests on, by name. */
  function observation(o, sessions) {
    const map = byKey(sessions);
    return { key: o.key, text: o.text || "", sources: (o.sources || []).map((k) => ({ key: k, text: map[k] ? session(map[k]).name : k })) };
  }
  /** A decision for what comes next, with the athlete's answer when there is one. */
  function decision(d) {
    return { key: d.key, kind: d.kind || "goal", kindLabel: DECISION_KINDS[d.kind] || DECISION_KINDS.goal, text: d.text || "", sport: d.kind === "session" ? sportLabel(d.sport) : "",
      state: d.state || null, stateLabel: DECISION_STATES[d.state] || "", approved: d.state === "approved", decidedAt: iso(d.decided_at) ? day(d.decided_at) : "" };
  }
  /** A weekly check-in as the athlete wrote it. */
  function checkin(c) {
    return { week: c.week, label: `Semaine du ${day(c.week)}`, note: c.note || "", alreadyShared: !!c.already_shared,
      scores: Object.entries(CHECKIN).filter(([k]) => c.scores?.[k] != null).map(([k, l]) => `${l} ${c.scores[k]}/5`).join(" · ") };
  }

  /** The head of a report: its cycle, its state, and what the hosted version is for this reader. */
  function head(report, role = "coach") {
    const h = HOSTED[report?.hosted] || HOSTED.none, p = report?.plan || {};
    const waiting = report?.state === "proposed";
    return {
      title: p.title || "", dates: p.start_date ? period({ from: p.start_date, to: p.end_date }) : "", weeks: p.weeks || 0,
      state: report?.state || "none", stateLabel: role === "athlete" && waiting ? "À valider" : STATES[report?.state] || "",
      hosted: report?.hosted || "none", hostedLabel: h.label, hostedText: h[role] || "", version: report?.version || 0,
      versionText: report?.version ? `Version ${report.version}${iso(report.published_at) ? ` · validée le ${day(report.published_at)}` : ""}` : "",
      link: report?.link_state === "revoked" ? "Partage arrêté : lecture seule." : report?.link_state === "paused" ? "Suivi en pause : lecture seule, rien n’est publié ni supprimé." : "",
      readOnly: report?.can_act === false,
      returned: report?.returned_note ? `Renvoyé par le sportif · « ${report.returned_note} »` : "",
      next: report?.next_plan ? `Cycle suivant · « ${report.next_plan.title} »${report.next_plan.state === "draft" ? " (brouillon)" : ""}` : "",
      exportAllowed: !!report?.allow_export,
    };
  }

  /** What the athlete can tick, with the choice to start from: every measure offered (or the previous choice), no note, no check-in
      unless they were in the version validated last. Notes and check-ins are never ticked for them. */
  function choices(proposal) {
    const again = (proposal?.sessions || []).some((s) => "shared" in s);
    const measures = {}, notes = {}, checkins = {};
    for (const s of proposal?.sessions || []) {
      if (s.measure) measures[s.key] = again ? !!s.shared : true;
      if (s.note && s.measure) notes[s.key] = !!s.note_shared;
    }
    for (const c of proposal?.checkins || []) checkins[c.week] = !!c.shared;
    return { measures, notes, checkins };
  }
  /** The validation the server expects, from the ticks. A note goes only with its session's measure. */
  function validation(proposal, choice, extra = {}) {
    const on = (o) => Object.entries(o || {}).filter(([, v]) => v).map(([k]) => k);
    const measures = on(choice?.measures);
    return {
      preview_key: proposal?.preview_key, op_id: extra.opId,
      share: { measures, notes: on(choice?.notes).filter((k) => measures.includes(k)), checkins: on(choice?.checkins) },
      decisions: Object.entries(extra.decisions || {}).filter(([, a]) => a === "approve" || a === "decline").map(([key, answer]) => ({ key, answer })),
      allow_export: !!extra.allowExport, note: String(extra.note || "").slice(0, 300),
      ...(extra.understood === "clear" || extra.understood === "unsure" ? { understood: extra.understood } : {}),
    };
  }
  /** « Ton coach verra : 7 mesures sur 8, 2 notes, 1 check-in. » — the sentence above the validation button. */
  function shareSummary(proposal, choice) {
    const count = (o) => Object.values(o || {}).filter(Boolean).length;
    const offered = Object.keys(choice?.measures || {}).length;
    const m = count(choice?.measures), n = Object.entries(choice?.notes || {}).filter(([k, v]) => v && choice.measures?.[k]).length, c = count(choice?.checkins);
    return `Ton coach verra : ${m} mesure(s) sur ${offered}, ${n ? plural(n, "note", "notes") : "aucune note"}, ${c ? plural(c, "check-in", "check-ins") : "aucun check-in"}. `
      + "Les séances proposées, acceptées, reportées et liées font partie du suivi : il les connaît déjà.";
  }

  const EXPORT_NOTICE = {
    coach: "Ce fichier est une copie des champs que le sportif a autorisés à la date indiquée. Il ne se met pas à jour : si le sportif retire un élément ou l’accès, seule la version en ligne change. Garde-le pour ton usage de coach.",
    athlete: "Ce fichier est une copie à la date indiquée. Une fois téléchargé, un fichier ne peut pas être repris : seul l’accès à la version en ligne se retire.",
  };
  const SHARE_NOTICE = "Lien ou fichier : la version en ligne reste sous ta main (tu peux en retirer une note ou tout l’accès, et ton coach ne la lit plus). Un fichier déjà téléchargé ne peut pas être repris : il garde ce qui était partagé le jour du téléchargement.";

  /** The file made from the authorised fields of the hosted version (what the « export » action returned): plain text, nothing else. */
  function exportFile(x) {
    const r = x?.report || {}, p = r.plan || {}, t = totals(r.totals, r.sessions), role = x?.role === "coach" ? "coach" : "athlete";
    const L = [];
    L.push(`Bilan de cycle — ${p.title || ""}`);
    L.push(`${period({ from: p.start_date, to: p.end_date })} · ${plural(p.weeks || 0, "semaine", "semaines")}`);
    L.push(`Sportif : ${x?.athlete_name || ""} · Coach : ${x?.coach_name || ""}`);
    L.push(`Version ${r.version} validée par le sportif le ${day(r.validated_at)} · fichier créé le ${day(x?.generated_at)}`);
    L.push("", EXPORT_NOTICE[role], "");
    L.push("CHIFFRES DU CYCLE");
    for (const f of t.figures) L.push(`- ${f.label} : ${f.value}${f.count ? ` (${f.count})` : ""} — ${f.period}. ${f.source}`);
    L.push("", "SEMAINE PAR SEMAINE");
    for (const w of t.weeks) L.push(`- ${w.label} (${w.period}) : ${w.planned} prévue(s), ${w.done} réalisée(s)${w.moved ? `, ${w.moved} reportée(s)` : ""}`);
    if (t.outside) L.push(`- ${t.outside.text}`);
    L.push("", "SÉANCES");
    for (const s of (r.sessions || []).map(session)) {
      L.push(`- ${s.dates.map((d) => `${d.label} ${d.text}`).join(" ; ")} · ${s.title} (${s.sport}) · ${s.label}${s.measure ? ` · ${s.measure}` : ""}`);
      if (s.note) L.push(`    Note du sportif : ${s.note}`);
    }
    if ((r.checkins || []).length) {
      L.push("", "CHECK-INS PARTAGÉS");
      for (const c of r.checkins.map(checkin)) L.push(`- ${c.label} : ${c.scores}${c.note ? ` — ${c.note}` : ""}`);
    }
    if ((r.observations || []).length) {
      L.push("", "CONSTATS DU COACH");
      for (const o of r.observations.map((o) => observation(o, r.sessions))) L.push(`- ${o.text}${o.sources.length ? ` (séances sources : ${o.sources.map((s) => s.text).join(" ; ")})` : ""}`);
    }
    if ((r.decisions || []).length) {
      L.push("", "DÉCISIONS POUR LA SUITE");
      for (const d of r.decisions.map(decision)) L.push(`- ${d.kindLabel} : ${d.text} — ${d.stateLabel}`);
    }
    if (r.athlete_note) L.push("", `MOT DU SPORTIF : ${r.athlete_note}`);
    if ((r.retracted || []).length) L.push("", `${plural(r.retracted.length, "élément retiré", "éléments retirés")} par le sportif depuis la validation : ce fichier ne les contient pas.`);
    const slug = String(p.title || "cycle").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "cycle";
    return { filename: `bilan-${slug}-v${r.version || 1}.txt`, mime: "text/plain;charset=utf-8", text: L.join("\n") + "\n" };
  }

  /** One line of the log of files: who downloaded which version, and how much it held. */
  function exportLine(x) {
    const f = x?.fields || {};
    return `${x?.role === "coach" ? "Ton coach" : "Toi"} · ${day(x?.at)} · version ${x?.version} · ${f.measures || 0} mesure(s), ${f.notes || 0} note(s), ${f.checkins || 0} check-in(s)`;
  }
  /** One retraction, without the content: « une note retirée le … ». */
  const retractedLine = (x) => `${RETRACTED[x?.kind] || "un élément"} · retiré le ${day(x?.at)}`;
  /** One version in a sentence. */
  const versionLine = (v) => `Version ${v?.version} · validée le ${day(v?.at)}${v?.retracted ? ` · ${plural(v.retracted, "élément retiré", "éléments retirés")} depuis` : ""}${v?.allow_export ? " · fichier autorisé" : ""}`;

  /** Where the objectives of a cycle come from: the report of the previous cycle and what the athlete approved there. */
  function origin(plan) {
    const o = plan?.origin;
    if (!o) return null;
    const items = (o.objectives || []).map((x) => ({ key: x.key, kind: x.kind, kindLabel: DECISION_KINDS[x.kind] || DECISION_KINDS.goal, text: x.text, kept: !!x.kept,
      line: `${x.text} — approuvé le ${day(x.approved_at)}${x.kept ? "" : " (reformulé ou retiré depuis dans ce cycle)"}` }));
    return {
      text: `Repris du bilan du cycle « ${o.plan_title} » (version ${o.version}, validée le ${day(o.validated_at)}) : ${items.length ? plural(items.length, "décision approuvée", "décisions approuvées") : "aucune décision approuvée"}.`,
      items,
    };
  }

  /** A fresh op_id for a validation: kept by the sheet, so retrying after a lost answer replays the same validation. */
  function opId() {
    const c = root.crypto;
    if (c?.randomUUID) return c.randomUUID();
    const b = new Uint8Array(16);
    if (c?.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  const api = { STATES, HOSTED, OUTCOMES, FIGURES, MESSAGES, EXPORT_NOTICE, SHARE_NOTICE, message, period, duration, session, figure, totals, summary, observation, decision, checkin,
    head, choices, validation, shareSummary, exportFile, exportLine, retractedLine, versionLine, origin, opId };
  root.TitanCoachCycle = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
