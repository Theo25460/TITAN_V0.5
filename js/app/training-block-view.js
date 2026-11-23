/* V1.7.4 — Objectifs et blocs d’entraînement: the blocks in Séance › Prévoir (create from a model, milestones, revise one week, copy a
   week, shift, duplicate, remove — every change through a preview) and the block of a week in Progrès › Semaine (its source and its
   effect). Rules and words: js/core/training-block.js (same module on Android). Nothing is written until the athlete confirms the
   preview; closing a sheet or « Annuler » writes nothing. A session is never changed here. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const F = () => window.TitanFormat;
  const SP = () => window.TitanSports;
  const D = () => window.TitanData;
  const WP = () => window.TitanWeekPlan;
  const TB = () => window.TitanTrainingBlock;
  const label = (s) => SP().label(s);
  const idOf = (l) => String(l?.client_event_id || l?.details?.client_event_id || l?.id || "");
  const logOf = (id) => (window.state?.history || []).find((l) => idOf(l) === id) || null;
  const dateOf = (k) => new Date(`${k}T12:00:00`);
  const dayLong = (k) => (k ? dateOf(k).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "");
  const dayShort = (k) => (k ? dateOf(k).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
  const today = () => F().dateKey(new Date());
  const SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const words = { label, dayLong };
  const METRIC_LABEL = { distance: "Distance d’une séance (km)", duration: "Durée d’une séance (min)", elevation: "Dénivelé d’une séance (m)", sessions: "Nombre de séances", declared: "Action déclarée (sans mesure)" };
  const ERRORS = {
    TRAINING_BLOCK_OVERLAP: "Un autre bloc occupe déjà ces semaines.",
    TRAINING_BLOCK_IN_THE_PAST: "Ce bloc serait déjà terminé : choisis un début plus récent.",
    TRAINING_BLOCK_WEEK_STARTED: "Cette semaine a déjà commencé : elle garde son programme. Choisis une semaine à venir.",
    TRAINING_BLOCK_MILESTONE_CLOSED: "Ce jalon est atteint ou sa semaine est passée : son historique ne change plus.",
    TRAINING_BLOCK_BAD_MILESTONE: "Ce jalon est incomplet : un titre, une semaine à venir et une mesure valable.",
    TRAINING_BLOCK_BAD_GOAL: "L’objectif est incomplet : une échéance après le début du bloc et une mesure valable.",
    TRAINING_BLOCK_TITLE_REQUIRED: "Donne un nom à ton bloc.",
    TRAINING_BLOCK_BAD_LENGTH: `Un bloc compte de ${2} à ${16} semaines.`,
    TRAINING_BLOCK_BAD_START: "Choisis la date de début du bloc.",
    TRAINING_BLOCK_LIMIT: "Tu as déjà 12 blocs : retire ceux que tu n’utilises plus.",
    TRAINING_BLOCK_MILESTONE_LIMIT: "Un bloc compte 8 jalons au plus.",
  };
  const errorText = (e) => ERRORS[e?.message] || "Ce changement n’est pas possible pour ce bloc.";

  const daysText = (days, minutes) => (days || []).map((s, i) => (s ? `${SHORT[i]} ${label(s)}${minutes?.[i] ? ` ${TB().unitText("duration", minutes[i])}` : ""}` : null)).filter(Boolean).join(" · ") || "Rien de prévu";
  const sessionLink = (id) => {
    const l = logOf(id);
    if (!l) return "";
    const m = window.TitanWeekReview?.measureOf ? window.TitanWeekReview.measureOf(l) : "";
    return `<a class="asc-small" href="/journal?session=${encodeURIComponent(id)}" data-block-session="${esc(id)}">${esc(label(l.sport))} · ${esc(dayShort(WP().sessionDay(l)))}${m ? ` · ${esc(m)}` : ""}</a>`;
  };

  /* ---------- Séance › Prévoir: the blocks ---------- */

  function milestoneRow(v, m) {
    const w = TB().describeMilestone(m, words);
    const open = v.state !== "removed" && v.state !== "finished";
    const editable = open && !m.closed && m.state !== "reached" && m.state !== "late";
    const btn = [];
    if (open && m.kind === "declared" && !m.declared?.at) btn.push(`<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-block-declare="${esc(m.id)}" data-block-id="${esc(v.id)}">${icon("check")} C’est fait</button>`);
    if (open && m.kind === "declared" && m.declared?.at) btn.push(`<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-block-undeclare="${esc(m.id)}" data-block-id="${esc(v.id)}">Retirer la déclaration</button>`);
    if (editable) btn.push(`<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-block-act="milestone" data-block-id="${esc(v.id)}" data-milestone="${esc(m.id)}" aria-label="${esc(`Modifier le jalon ${m.title}`)}">Modifier</button>`);
    return `<li class="tb-milestone" data-block-milestone="${esc(m.id)}" data-state="${esc(m.state)}">
      <span class="tb-ms-icon" aria-hidden="true">${icon(m.state === "reached" || m.state === "late" ? "check" : "flag")}</span>
      <span class="tb-ms-main"><strong>${esc(w.title)}</strong> <span class="asc-small asc-muted">· ${esc(w.what)} · ${esc(w.when)}</span>
        <span class="asc-small tb-ms-state" data-milestone-state>${esc(w.state)}</span>${m.session ? `<span class="tb-ms-source">${sessionLink(m.session)}</span>` : ""}</span>
      ${btn.length ? `<span class="tb-ms-actions">${btn.join("")}</span>` : ""}
    </li>`;
  }

  function weekRow(v, w) {
    const ms = w.milestones.map((id) => v.milestones.find((m) => m.id === id)).filter(Boolean);
    const tags = [];
    if (w.state === "current") tags.push('<span class="sig-state is-owned">En cours</span>');
    if (w.paused) tags.push(`<span class="sig-state">${icon("moon")} En pause</span>`);
    if (w.before) tags.push('<span class="sig-state is-locked">Avant l’activation</span>');
    const sub = w.before ? "Le bloc a été créé ensuite : cette semaine a gardé son programme d’origine." : w.summary ? `${w.summary.done}/${w.summary.planned} faite${w.summary.done > 1 ? "s" : ""} · ${w.summary.gaps} écart${w.summary.gaps > 1 ? "s" : ""}${w.summary.extra ? ` · ${w.summary.extra} hors programme` : ""}` : "";
    return `<li class="tb-week" data-block-week="${w.index}" data-week="${esc(w.week)}" data-state="${esc(w.state)}" data-applied="${w.applied}" data-kind="${esc(w.kind || "plan")}">
      <span class="tb-week-head"><strong data-week-label>${esc(w.label)}</strong><span class="asc-small asc-muted">semaine du ${esc(dayShort(w.week))}</span>${tags.join("")}</span>
      <span class="asc-small" data-week-days>${esc(daysText(w.days, w.minutes))}</span>
      ${sub ? `<span class="asc-small asc-muted" data-week-summary>${esc(sub)}</span>` : ""}
      ${ms.length ? `<span class="asc-small tb-week-ms">${icon("flag")} ${ms.map((m) => esc(m.title)).join(" · ")}</span>` : ""}
    </li>`;
  }

  function logHtml(v) {
    const list = v.log.filter((e) => e.kind !== "create" || v.log.length === 1);
    if (!list.length) return "";
    return `<details class="tb-log" data-block-log><summary>Historique des changements (${v.log.length})</summary><ul>${v.log.slice().reverse().map((e) => {
      const effect = e.effect || {};
      const c = { ...e, here: null, milestones: effect.milestones || [], exceptions: effect.exceptions || [], detail: effect.detail || null };
      const d = TB().describeChange(c, words);
      const weeks = (effect.weeks || []).map((x) => `semaine du ${dayShort(x.week)} : ${x.before || "semaine type"} → ${x.after || "semaine type"}`);
      return `<li data-log-kind="${esc(e.kind)}"><strong class="asc-small">${esc(d.source)}</strong>${d.effect ? `<span class="asc-small">${esc(d.effect)}</span>` : ""}${weeks.length ? `<span class="asc-small asc-muted">${esc(weeks.slice(0, 4).join(" ; "))}${weeks.length > 4 ? " ; …" : ""}</span>` : ""}</li>`;
    }).join("")}</ul></details>`;
  }

  function card(v) {
    const g = v.goal ? TB().describeGoal(v.goal, words) : null;
    const open = v.state === "active" || v.state === "upcoming";
    const where = v.state === "active" && v.currentIndex >= 0 ? `${v.weeks[v.currentIndex].label} · ${v.currentIndex + 1}ᵉ semaine sur ${v.weeks.length}` : v.state === "upcoming" ? `Commence le ${dayLong(v.start)}` : v.state === "finished" ? "Terminé" : `Retiré le ${dayLong(String(v.removed).slice(0, 10))}`;
    const act = (kind, text, primary) => `<button type="button" class="asc-btn ${primary ? "asc-btn-primary" : "asc-btn-secondary"} asc-btn-sm" data-block-act="${kind}" data-block-id="${esc(v.id)}">${esc(text)}</button>`;
    return `<article class="tb-card" data-block="${esc(v.id)}" data-state="${esc(v.state)}" aria-labelledby="tb-title-${esc(v.id)}">
      <div class="asc-between"><span class="asc-chip" data-block-where>${esc(where)}</span><span class="asc-small asc-muted">du ${esc(dayShort(v.start))} au ${esc(dayShort(v.end))}</span></div>
      <h3 id="tb-title-${esc(v.id)}" tabindex="-1">${esc(v.title)}</h3>
      ${v.intent ? `<p class="asc-small">${esc(v.intent)}</p>` : ""}
      <p class="asc-small asc-muted">Disciplines : ${esc(v.sports.map(label).join(", ") || "—")}${v.copyOf ? " · copie d’un bloc précédent" : ""}</p>
      ${g ? `<div class="tb-goal" data-block-goal data-state="${esc(v.goal.state)}"><p><strong>${icon("target")} Objectif : ${esc(g.title)}</strong></p><p class="asc-small">${esc(g.what)} · ${esc(g.date)}</p><p class="asc-small" data-goal-state>${esc(g.state)}</p>${v.goal.session ? sessionLink(v.goal.session) : ""}</div>` : ""}
      ${v.conflict ? `<p class="asc-note" role="note">${icon("info")}<span>Ce bloc a été modifié sur deux appareils en même temps : vérifie son programme ci-dessous.</span></p>` : ""}
      <ol class="tb-weeks" aria-label="Semaines du bloc">${v.weeks.map((w) => weekRow(v, w)).join("")}</ol>
      <h4 class="asc-small tb-sub">Jalons</h4>
      ${v.milestones.length ? `<ul class="tb-milestones">${v.milestones.map((m) => milestoneRow(v, m)).join("")}</ul>` : '<p class="asc-small asc-muted">Aucun jalon pour l’instant.</p>'}
      ${open ? `<div class="tb-actions" role="group" aria-label="${esc(`Modifier le bloc ${v.title}`)}">${act("week", "Réviser une semaine", false)}${act("shift", "Décaler le bloc", false)}${act("copy", "Dupliquer une semaine", false)}${act("milestone", "Ajouter un jalon", false)}${act("duplicate", "Dupliquer le bloc", false)}${act("remove", "Retirer le bloc", false)}</div>` : `<div class="tb-actions">${act("duplicate", "Réutiliser ce bloc", false)}</div>`}
      ${logHtml(v)}
      <p class="asc-small asc-faint">${esc(TB().RULES.start)} ${esc(TB().RULES.event)}</p>
    </article>`;
  }

  /** The section of Séance › Prévoir. */
  function html() {
    if (!TB() || !D().blocks) return "";
    const list = D().blocks();
    const live = list.filter((v) => v.state === "active" || v.state === "upcoming");
    const past = list.filter((v) => !live.includes(v));
    return `<section class="asc-section tb-blocks" id="blocs" data-blocks aria-labelledby="tb-section-title">
      <div class="asc-section-head"><h2 id="tb-section-title">Blocs d’entraînement</h2><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-block-act="create">${icon("plus")} Créer un bloc</button></div>
      ${live.length ? live.map(card).join("") : `<div class="sig-empty">${icon("target")}<h3>Relie un objectif à plusieurs semaines</h3><p>Choisis un modèle, fixe tes jalons et ton échéance, puis adapte chaque semaine. Chaque semaine du bloc devient ton programme, ici et au QG.</p></div>`}
      ${past.length ? `<details class="tb-past" data-blocks-past><summary>Blocs passés ou retirés (${past.length})</summary>${past.map(card).join("")}</details>` : ""}
    </section>`;
  }

  /* ---------- The sheets: a form, its preview, and the confirmation ---------- */

  let dialog = null;
  function sportsFor(v) {
    const typ = WP().typeDays(window.state?.user?.schedule || {}).filter(Boolean).map((d) => d.sport);
    const recent = (window.state?.history || []).slice(-80).map((l) => l.sport);
    return [...new Set([...(v?.sports || []), ...typ, ...recent, ...SP().POPULAR])].filter((s) => window.SPORTS_CONFIG?.[s]).slice(0, 24);
  }
  const options = (list, on, extra = "") => `${extra}${list.map((s) => `<option value="${esc(s)}"${s === on ? " selected" : ""}>${esc(label(s))}</option>`).join("")}`;
  const chip = (attr, value, text, on, disabled) => `<button type="button" class="seance-chip" ${attr}="${esc(value)}" aria-pressed="${!!on}"${disabled ? " disabled" : ""}>${esc(text)}</button>`;
  const mondayOf = (k) => (k && /^\d{4}-\d{2}-\d{2}$/.test(k) ? WP().weekOf(k) : null);

  function previewHtml(pv, error) {
    if (!pv) return `<section class="tb-preview" data-block-preview aria-live="polite"><h3 class="asc-small">Aperçu</h3><p class="asc-small" role="alert" data-block-error>${esc(error || "")}</p></section>`;
    const w = TB().describePreview(pv, words);
    return `<section class="tb-preview" data-block-preview aria-live="polite"><h3 class="asc-small">Aperçu</h3>
      <ul data-preview-lines>${w.lines.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      ${w.notes.map((x) => `<p class="asc-small" data-preview-note>${esc(x)}</p>`).join("")}
      <p class="asc-small asc-muted" data-preview-where>${esc(w.where)}</p></section>`;
  }

  function open(kind, id, opener, preset = {}) {
    if (dialog?.open || !TB()) return;
    const owner = D().owner();
    const v = id ? D().blocks().find((b) => b.id === id) : null;
    if (id && !v) return;
    const t = today();
    const openWeeks = v ? v.weeks.filter((w) => w.week >= v.open) : [];
    const liveWeeks = v ? v.weeks.filter((w) => WP().addDays(w.week, 6) >= t) : [];
    const sports = sportsFor(v);
    const type = WP().typeDays(window.state?.user?.schedule || {});
    const nextMonday = WP().addDays(WP().weekOf(t), 7);
    // The athlete's choices, kept while the sheet is open.
    const s = {
      template: "endurance", title: "", intent: "", sport: type.find((d) => d && ["gravel", "cycling", "running", "trail", "mtb", "cycling_road", "hiking"].includes(d.sport))?.sport || sports[0] || "running",
      start: nextMonday, weeks: 6, peak: 180, goalTitle: "", goalDate: "", goalMetric: "distance", goalTarget: "", goalSport: null, picked: null,
      index: openWeeks[0]?.index ?? 0, from: v ? Math.max(0, (v.weeks.find((w) => w.week >= v.open)?.index ?? 0) - 1) : 0, to: openWeeks[0]?.index ?? 0, shiftWeeks: 1,
      days: null, ms: null, dupStart: v ? WP().addDays(v.end, 1) : nextMonday, dupTitle: "",
      ...preset,
    };
    if (kind === "copy") s.from = openWeeks[0] ? Math.max(0, openWeeks[0].index - 1) : 0;
    if (kind === "week") s.days = v?.weeks[s.index] ? v.weeks[s.index].days.map((sp, i) => (sp ? { sport: sp, minutes: v.weeks[s.index].minutes[i] } : null)) : null;
    if (kind === "milestone") {
      const m = preset.milestone ? v.milestones.find((x) => x.id === preset.milestone) : null;
      s.ms = m ? { id: m.id, title: m.title, week: m.index, kind: m.kind, metric: m.kind === "declared" ? "declared" : m.metric, target: m.target ?? "", sport: m.sport || v.sports[0] || null } : { title: "", week: liveWeeks[liveWeeks.length - 1]?.index ?? 0, kind: "measure", metric: "distance", target: "", sport: v?.sports[0] || null };
    }
    const body = document.createElement("div");
    body.className = "asc-stack tb-sheet";
    body.dataset.blockSheet = kind;

    const args = () => {
      if (kind === "create") {
        const weeks = TB().draft(s.template, { type, sport: s.sport, weeks: s.weeks, peak: s.peak });
        const goal = s.goalTitle ? { title: s.goalTitle, date: s.goalDate || null, ...(s.goalMetric === "declared" ? { kind: "declared" } : { kind: "measure", metric: s.goalMetric, target: Number(String(s.goalTarget).replace(",", ".")), sport: s.goalSport || s.sport }) } : null;
        const sug = TB().suggest(s.template, { weeks: weeks.length, sport: s.sport, goal, type });
        if (!s.picked) s.picked = sug.map((_, i) => i < 2);
        return { input: { title: s.title, intent: s.intent, template: s.template, sports: [s.sport], start: mondayOf(s.start), weeks, goal, milestones: sug.filter((_, i) => s.picked[i]) }, sug, weeks };
      }
      if (kind === "week") return { index: s.index, days: s.days };
      if (kind === "copy") return { from: s.from, to: s.to };
      if (kind === "shift") return { from: s.index, weeks: s.shiftWeeks };
      if (kind === "milestone") { const m = s.ms; return m.remove ? { id: m.id, remove: true } : { ...(m.id ? { id: m.id } : {}), title: m.title, week: m.week, ...(m.metric === "declared" ? { kind: "declared" } : { kind: "measure", metric: m.metric, target: Number(String(m.target).replace(",", ".")), sport: m.sport }) }; }
      if (kind === "duplicate") return { start: mondayOf(s.dupStart), title: s.dupTitle };
      return {};
    };
    const compute = () => {
      try {
        const a = args();
        const r = D().blockChange(kind, id, kind === "create" ? a.input : a);
        return { pv: r.preview, a };
      } catch (e) {
        return { pv: null, error: errorText(e), a: (() => { try { return args(); } catch { return null; } })() };
      }
    };

    const formHtml = (a) => {
      if (kind === "create") {
        return `
          <fieldset class="wr-field"><legend class="asc-small">Modèle</legend><div class="seance-chips">${TB().TEMPLATES.map((x) => chip("data-tpl", x.id, x.title, x.id === s.template)).join("")}</div>
            <p class="asc-small asc-muted">${esc(TB().TEMPLATES.find((x) => x.id === s.template).text)}</p></fieldset>
          <div class="asc-form-grid">
            <label class="asc-field"><span>Nom du bloc</span><input class="asc-input" name="title" maxlength="80" value="${esc(s.title)}" placeholder="Gravel 90 km"></label>
            <label class="asc-field"><span>Intention <small class="asc-faint">facultatif</small></span><input class="asc-input" name="intent" maxlength="160" value="${esc(s.intent)}" placeholder="Préparer… en gardant…"></label>
            <label class="asc-field"><span>Discipline principale</span><select class="asc-input" name="sport">${options(sports, s.sport)}</select></label>
            <label class="asc-field"><span>Début <small class="asc-faint">le lundi de cette semaine-là</small></span><input class="asc-input" type="date" name="start" value="${esc(s.start)}"></label>
            <label class="asc-field"><span>Nombre de semaines</span><input class="asc-input" type="number" inputmode="numeric" min="2" max="16" name="weeks" value="${esc(s.weeks)}"></label>
            ${s.template === "endurance" ? `<label class="asc-field"><span>Sortie la plus longue <small class="asc-faint">en minutes</small></span><input class="asc-input" type="number" inputmode="numeric" min="30" max="600" step="5" name="peak" value="${esc(s.peak)}"></label>` : ""}
          </div>
          <fieldset class="wr-field"><legend class="asc-small">Objectif</legend><div class="asc-form-grid">
            <label class="asc-field"><span>Objectif <small class="asc-faint">facultatif</small></span><input class="asc-input" name="goalTitle" maxlength="80" value="${esc(s.goalTitle)}" placeholder="Sortie gravel de 90 km"></label>
            <label class="asc-field"><span>Échéance</span><input class="asc-input" type="date" name="goalDate" value="${esc(s.goalDate)}"></label>
            <label class="asc-field"><span>Mesure</span><select class="asc-input" name="goalMetric">${Object.entries(METRIC_LABEL).map(([k, x]) => `<option value="${k}"${k === s.goalMetric ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
            ${s.goalMetric !== "declared" ? `<label class="asc-field"><span>Valeur</span><input class="asc-input" type="number" inputmode="decimal" min="0" step="any" name="goalTarget" value="${esc(s.goalTarget)}"></label>
            <label class="asc-field"><span>Sport</span><select class="asc-input" name="goalSport">${options(sports, s.goalSport || s.sport)}</select></label>` : ""}
          </div></fieldset>
          <fieldset class="wr-field"><legend class="asc-small">Jalons proposés <small class="asc-faint">garde ceux que tu veux</small></legend>
            ${a?.sug?.length ? a.sug.map((m, i) => `<label class="tb-pick"><input type="checkbox" data-pick-ms="${i}"${s.picked?.[i] ? " checked" : ""}> <span class="asc-small"><strong>${esc(m.title)}</strong> · Semaine ${m.week + 1} · ${esc(TB().describeMeasure(m, words))}</span></label>`).join("") : '<p class="asc-small asc-muted">Aucun jalon proposé : tu pourras en ajouter après la création.</p>'}
          </fieldset>
          ${a?.weeks ? `<details class="tb-draft" open><summary class="asc-small">Les ${a.weeks.length} semaines proposées</summary><ol>${a.weeks.map((w, i) => `<li class="asc-small">${esc(TB().weekLabel(w, i))} : ${esc(daysText(w.days.map((d) => (d ? d.sport : null)), w.days.map((d) => (d ? d.minutes : null))))}</li>`).join("")}</ol><p class="asc-small asc-faint">Tu pourras réviser chaque semaine, la dupliquer ou décaler le bloc ensuite.</p></details>` : ""}`;
      }
      if (kind === "week") {
        const list = sportsFor(v);
        return `<fieldset class="wr-field"><legend class="asc-small">La semaine à réviser</legend><div class="seance-chips">${openWeeks.map((w) => chip("data-index", w.index, `${w.label} · ${dayShort(w.week)}`, w.index === s.index)).join("")}</div></fieldset>
          <div class="tb-days">${NAMES.map((n, i) => { const d = s.days?.[i]; return `<div class="tb-day-row"><span class="asc-small">${n}</span><label class="sr-only" for="tb-d${i}">${n} : sport</label><select class="asc-input" id="tb-d${i}" data-day-sport="${i}">${options(list, d?.sport, `<option value=""${!d ? " selected" : ""}>Libre</option>`)}</select><label class="sr-only" for="tb-m${i}">${n} : minutes</label><input class="asc-input" id="tb-m${i}" type="number" inputmode="numeric" min="5" max="600" step="5" placeholder="min" data-day-minutes="${i}" value="${esc(d?.minutes || "")}"${d ? "" : " disabled"}></div>`; }).join("")}</div>`;
      }
      if (kind === "copy") return `<fieldset class="wr-field"><legend class="asc-small">Copier la semaine</legend><div class="seance-chips">${v.weeks.map((w) => chip("data-from", w.index, `${w.label} · ${dayShort(w.week)}`, w.index === s.from)).join("")}</div></fieldset>
          <fieldset class="wr-field"><legend class="asc-small">Sur la semaine</legend><div class="seance-chips">${openWeeks.map((w) => chip("data-to", w.index, `${w.label} · ${dayShort(w.week)}`, w.index === s.to, w.index === s.from)).join("")}</div></fieldset>`;
      if (kind === "shift") return `<fieldset class="wr-field"><legend class="asc-small">Décaler à partir de</legend><div class="seance-chips">${openWeeks.map((w) => chip("data-index", w.index, `${w.label} · ${dayShort(w.week)}`, w.index === s.index)).join("")}</div>
            <p class="asc-small asc-muted">Une semaine de report reprend la semaine qui précède ; les semaines suivantes et leurs jalons glissent d’autant. L’échéance de l’objectif ne bouge pas.</p></fieldset>
          <fieldset class="wr-field"><legend class="asc-small">De combien de semaines</legend><div class="seance-chips">${[1, 2, 3, 4].map((n) => chip("data-shift", n, `${n} semaine${n > 1 ? "s" : ""}`, n === s.shiftWeeks)).join("")}</div></fieldset>`;
      if (kind === "milestone") {
        const m = s.ms;
        return `<div class="asc-form-grid">
            <label class="asc-field"><span>Jalon</span><input class="asc-input" name="msTitle" maxlength="80" value="${esc(m.title)}" placeholder="Sortie de 60 km"></label>
            <label class="asc-field"><span>Mesure</span><select class="asc-input" name="msMetric">${Object.entries(METRIC_LABEL).map(([k, x]) => `<option value="${k}"${k === m.metric ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
            ${m.metric !== "declared" ? `<label class="asc-field"><span>Valeur</span><input class="asc-input" type="number" inputmode="decimal" min="0" step="any" name="msTarget" value="${esc(m.target)}"></label>
            <label class="asc-field"><span>Sport</span><select class="asc-input" name="msSport">${options(sportsFor(v), m.sport)}</select></label>` : ""}
          </div>
          <fieldset class="wr-field"><legend class="asc-small">Semaine</legend><div class="seance-chips">${liveWeeks.map((w) => chip("data-ms-week", w.index, `${w.label} · ${dayShort(w.week)}`, w.index === m.week)).join("")}</div></fieldset>
          ${m.id ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-ms-remove aria-pressed="${!!m.remove}">${m.remove ? "Garder ce jalon" : "Retirer ce jalon"}</button>` : ""}`;
      }
      if (kind === "duplicate") return `<div class="asc-form-grid">
          <label class="asc-field"><span>Début de la copie <small class="asc-faint">le lundi de cette semaine-là</small></span><input class="asc-input" type="date" name="dupStart" value="${esc(s.dupStart)}"></label>
          <label class="asc-field"><span>Nom</span><input class="asc-input" name="dupTitle" maxlength="80" value="${esc(s.dupTitle)}" placeholder="${esc(`${v.title} (copie)`)}"></label></div>
          <p class="asc-small asc-muted">La copie reprend les semaines et les jalons (non atteints) ; l’échéance de l’objectif glisse d’autant.</p>`;
      if (kind === "remove") return `<p class="asc-small">Retirer « ${esc(v.title)} » ? Les semaines à venir reprennent ta semaine type.</p>`;
      return "";
    };

    const confirmText = { create: "Créer le bloc", week: "Réviser cette semaine", copy: "Copier la semaine", shift: "Décaler le bloc", milestone: s.ms?.id ? "Enregistrer le jalon" : "Ajouter le jalon", duplicate: "Dupliquer le bloc", remove: "Retirer le bloc" };
    const draw = (focus) => {
      const r = compute();
      body.innerHTML = `${formHtml(r.a)}${previewHtml(r.pv, r.error)}
        <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-block-cancel>Annuler</button><button type="button" class="asc-btn ${kind === "remove" ? "asc-btn-danger" : "asc-btn-primary"}" data-block-confirm ${r.pv ? "" : "disabled"}>${esc(kind === "milestone" && s.ms?.remove ? "Retirer le jalon" : confirmText[kind])}</button></div>
        <p class="asc-small jr-edit-error" role="alert" hidden></p>`;
      if (focus) body.querySelector(focus)?.focus({ preventScroll: true });
    };
    draw();
    const titles = { create: "Créer un bloc", week: "Réviser une semaine", copy: "Dupliquer une semaine", shift: "Décaler le bloc", milestone: s.ms?.id ? "Modifier le jalon" : "Ajouter un jalon", duplicate: "Dupliquer le bloc", remove: "Retirer le bloc" };
    dialog = window.titanShell.sheet({ title: titles[kind], eyebrow: v ? v.title : "Bloc d’entraînement", body, onClose: () => { dialog = null; if (opener?.isConnected) opener.focus({ preventScroll: true }); } });
    const d = dialog;
    const sel = (el) => (el.id ? `#${CSS.escape(el.id)}` : el.name ? `[name="${CSS.escape(el.name)}"]` : null);
    body.addEventListener("change", (e) => {
      const el = e.target;
      if (!d.open) return;
      if (el.dataset.daySport !== undefined) { const i = Number(el.dataset.daySport); s.days = (s.days || [null, null, null, null, null, null, null]).slice(); s.days[i] = el.value ? { sport: el.value, minutes: s.days[i]?.minutes || null } : null; draw(sel(el)); return; }
      if (el.dataset.pickMs !== undefined) { s.picked[Number(el.dataset.pickMs)] = el.checked; draw(`[data-pick-ms="${el.dataset.pickMs}"]`); return; }
      if (el.name === "goalMetric" || el.name === "msMetric" || el.name === "sport" || el.name === "start" || el.name === "weeks" || el.name === "goalDate" || el.name === "goalSport" || el.name === "msSport" || el.name === "dupStart") {
        read(el); if (el.name === "weeks" || el.name === "sport") s.picked = null; draw(sel(el));
      }
    });
    const read = (el) => {
      if (el.dataset.dayMinutes !== undefined) { const i = Number(el.dataset.dayMinutes); if (s.days?.[i]) { s.days = s.days.slice(); s.days[i] = { ...s.days[i], minutes: Number(el.value) > 0 ? Number(el.value) : null }; } return; }
      const n = el.name;
      if (!n) return;
      if (n.startsWith("ms")) { const k = n.slice(2, 3).toLowerCase() + n.slice(3); s.ms = { ...s.ms, [k]: el.value }; if (k === "metric") s.ms.kind = el.value === "declared" ? "declared" : "measure"; return; }
      s[n] = n === "weeks" || n === "peak" ? Number(el.value) : el.value;
    };
    let timer = null;
    body.addEventListener("input", (e) => {
      const el = e.target;
      if (!d.open || el.tagName === "SELECT" || el.type === "checkbox" || el.type === "date") return;
      read(el);
      clearTimeout(timer);
      // Redraw the preview only (the field being typed in stays as it is).
      timer = setTimeout(() => { if (!d.open) return; const r = compute(); const pv = body.querySelector("[data-block-preview]"); if (pv) pv.outerHTML = previewHtml(r.pv, r.error); const ok = body.querySelector("[data-block-confirm]"); if (ok) ok.disabled = !r.pv; }, 150);
    });
    body.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || !d.open) return;
      if (b.dataset.tpl) { s.template = b.dataset.tpl; s.weeks = TB().TEMPLATES.find((x) => x.id === s.template).weeks; s.picked = null; draw(`[data-tpl="${s.template}"]`); return; }
      if (b.dataset.index !== undefined) { s.index = Number(b.dataset.index); if (kind === "week") s.days = v.weeks[s.index].days.map((sp, i) => (sp ? { sport: sp, minutes: v.weeks[s.index].minutes[i] } : null)); draw(`[data-index="${s.index}"]`); return; }
      if (b.dataset.from !== undefined) { s.from = Number(b.dataset.from); if (s.to === s.from) s.to = openWeeks.find((w) => w.index !== s.from)?.index ?? s.to; draw(`[data-from="${s.from}"]`); return; }
      if (b.dataset.to !== undefined) { s.to = Number(b.dataset.to); draw(`[data-to="${s.to}"]`); return; }
      if (b.dataset.shift !== undefined) { s.shiftWeeks = Number(b.dataset.shift); draw(`[data-shift="${s.shiftWeeks}"]`); return; }
      if (b.dataset.msWeek !== undefined) { s.ms = { ...s.ms, week: Number(b.dataset.msWeek) }; draw(`[data-ms-week="${s.ms.week}"]`); return; }
      if (b.hasAttribute("data-ms-remove")) { s.ms = { ...s.ms, remove: !s.ms.remove }; draw("[data-ms-remove]"); return; }
      if (b.hasAttribute("data-block-cancel")) { d.close(); return; }
      if (b.hasAttribute("data-block-confirm")) {
        if (D().owner() !== owner || window.titanAccountTransition?.active) { d.close(); return; }
        body.querySelectorAll("input, select").forEach(read);
        let r;
        try {
          const a = args();
          r = D().blockChange(kind, id, kind === "create" ? a.input : a, { confirm: true });
        } catch (err) {
          const x = body.querySelector(".jr-edit-error");
          x.textContent = errorText(err);
          x.hidden = false;
          return;
        }
        d.close();
        const done = { create: "Bloc créé", week: "Semaine révisée", copy: "Semaine copiée", shift: "Bloc décalé", milestone: "Jalon enregistré", duplicate: "Bloc dupliqué", remove: "Bloc retiré" };
        window.titanShell.toast({ type: "ok", title: done[kind], message: kind === "remove" ? "Tes séances restent au journal. Les semaines à venir reprennent ta semaine type." : r.from ? `S’applique à partir du ${dayLong(r.from)}.` : undefined });
      }
    });
  }

  function declare(id, milestone, done) {
    try {
      D().blockChange("declare", id, { milestone, done }, { confirm: true });
    } catch {
      window.titanShell.toast({ type: "err", title: "Non enregistré", message: "Ce jalon n’est pas une action à déclarer." });
      return;
    }
    window.titanShell.toast({ type: "ok", title: done ? "Noté : c’est fait" : "Déclaration retirée", message: done ? `Jalon atteint le ${dayLong(today())}.` : "Le jalon redevient à faire." });
  }

  /** Delegated actions on a host that renders html(). */
  function bind(host) {
    host.addEventListener("click", (e) => {
      const b = e.target.closest("[data-block-act], [data-block-declare], [data-block-undeclare]");
      if (!b || !host.contains(b)) return;
      if (b.dataset.blockDeclare) { declare(b.dataset.blockId, b.dataset.blockDeclare, true); return; }
      if (b.dataset.blockUndeclare) { declare(b.dataset.blockId, b.dataset.blockUndeclare, false); return; }
      open(b.dataset.blockAct, b.dataset.blockId || null, b, b.dataset.milestone ? { milestone: b.dataset.milestone } : {});
    });
  }

  /* ---------- Progrès › Semaine: the block of the week, the source and the effect of its changes ---------- */
  function contextHtml(day) {
    if (!TB() || !D().blockContext) return "";
    const c = D().blockContext(day);
    if (!c) return "";
    const g = c.goal ? TB().describeGoal(c.goal, words) : null;
    const lead = c.removed && !c.applied ? `Le bloc « ${c.title} » a été retiré ; cette semaine suit ta semaine type.` : c.before ? `Cette semaine fait partie du bloc « ${c.title} » mais lui est antérieure : elle a gardé son programme d’origine.` : c.label ? `Cette semaine est « ${c.label} » du bloc « ${c.title} » (${c.index + 1}ᵉ sur ${c.count}).` : `Le bloc « ${c.title} » a changé cette semaine.`;
    const changes = c.changes.filter((x) => x.kind !== "create" || c.changes.length === 1);
    return `<section class="asc-section tb-context" data-block-context="${esc(c.id)}" data-week="${esc(c.week)}" aria-labelledby="tb-ctx-${esc(c.week)}">
      <div class="asc-section-head"><h2 id="tb-ctx-${esc(c.week)}">Bloc d’entraînement</h2><a class="asc-small" href="/prevoir#blocs">Voir le bloc</a></div>
      <p class="asc-small" data-block-lead>${esc(lead)}</p>
      ${g ? `<p class="asc-small asc-muted">${icon("target")} ${esc(g.title)} · ${esc(g.date)} · ${esc(g.state)}</p>` : ""}
      ${changes.length ? `<ul class="tb-changes" data-block-changes>${changes.map((x) => { const w = TB().describeChange(x, words); return `<li data-change-kind="${esc(x.kind)}"><strong class="asc-small" data-change-source>${esc(w.source)}</strong>${w.effect ? `<span class="asc-small" data-change-effect>${esc(w.effect)}</span>` : ""}</li>`; }).join("")}</ul>` : ""}
      ${c.milestones.length ? `<ul class="tb-milestones">${c.milestones.map((m) => { const w = TB().describeMilestone(m, words); return `<li class="tb-milestone" data-block-milestone="${esc(m.id)}" data-state="${esc(m.state)}"><span class="tb-ms-icon" aria-hidden="true">${icon(m.state === "reached" || m.state === "late" ? "check" : "flag")}</span><span class="tb-ms-main"><strong>${esc(w.title)}</strong> <span class="asc-small asc-muted">· ${esc(w.what)}</span><span class="asc-small" data-milestone-state>${esc(w.state)}</span>${m.session ? `<span class="tb-ms-source">${sessionLink(m.session)}</span>` : ""}</span></li>`; }).join("")}</ul>` : ""}
    </section>`;
  }

  /** The programme note of a week that is a block week (week-plan-view.js reads it). */
  function referenceNote(v) {
    const b = v?.reference?.block;
    if (!b) return "";
    const blk = window.state?.user?.schedule?.blocks?.[b.id];
    const l = blk && TB() ? TB().latest(blk) : null;
    const name = l?.weeks?.[b.index] ? TB().weekLabel(l.weeks[b.index], b.index) : `Semaine ${b.index + 1}`;
    return `Programme de départ : « ${name} » du bloc « ${blk?.title || "d’entraînement"} ».`;
  }

  window.TitanTrainingBlockView = { html, bind, open, contextHtml, referenceNote };
})();
