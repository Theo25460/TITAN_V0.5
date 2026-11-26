/* TITAN — V1.9.4 Programmation multi-semaines. Mounted by coaching.js into the selected link's slot when screens.coach_programs is
   open; every call goes through public.titan_coach_program_v1, which re-checks the link (scope, pause, revocation) each time.
   Coach: versioned multi-week templates, a programme adapted for this athlete (draft, preview of what differs from its starting point,
   sent once), what the athlete accepted, revisions of one occurrence, one week or the rest of the cycle (preview first, applied with its
   key and an op_id kept for retries), versions, duplication for another athlete, closing. Athlete: the programme received, answers
   session by session (accept, decline, to discuss), changes accepted or the version kept. Nothing here writes the athlete's journal. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const CP = () => window.TitanCoachProgram;
  const FU = () => window.TitanCoachFollowup;
  const FN = "titan_coach_program_v1";
  const human = (e) => CP()?.message?.(e?.message) || (navigator.onLine ? "La demande n’a pas été confirmée. Réessaie." : "Hors ligne : le programme revient avec le réseau.");
  const sportOptions = (sel) => (window.TitanSports?.all?.() || []).map((sp) => ({ id: sp.id, label: window.TitanSports.label(sp.id) }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"))
    .map((sp) => `<option value="${esc(sp.id)}"${sp.id === sel ? " selected" : ""}>${esc(sp.label)}</option>`).join("")
    || `<option value="running"${sel === "running" ? " selected" : ""}>Course à pied</option><option value="muscu_home"${sel === "muscu_home" ? " selected" : ""}>Muscu Maison</option>`;
  const dayOptions = (sel) => CP().DAYS.slice(1).map((d, i) => `<option value="${i + 1}"${Number(sel) === i + 1 ? " selected" : ""}>${esc(d)}</option>`).join("");
  const weekOptions = (n, sel) => Array.from({ length: n }, (_, i) => `<option value="${i + 1}"${Number(sel) === i + 1 ? " selected" : ""}>Semaine ${i + 1}</option>`).join("");
  const isoDay = () => new Date().toISOString().slice(0, 10);

  async function call(ctx, action, data = {}) {
    if (!ctx.ok()) throw Error("STALE");
    const r = await ctx.client.rpc(FN, { p_action: action, p_data: data });
    if (!ctx.ok()) throw Error("STALE");
    if (r.error) throw Error(r.error.message || "UNAVAILABLE");
    return r.data;
  }

  /* ---------- A sheet with one form, pending state and errors kept in the sheet ---------- */
  function sheet(ctx, { title, eyebrow = "Coaching · programme", body, submit, onSubmit, wide = false }) {
    const form = document.createElement("form");
    form.className = "asc-stack";
    form.innerHTML = `${body}<p class="asc-small asc-muted" role="status" data-cp-progress></p><p class="asc-small jr-edit-error" role="alert" data-cp-error></p>
      <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-cancel>${onSubmit ? "Annuler" : "Fermer"}</button>${onSubmit ? `<button type="submit" class="asc-btn asc-btn-primary">${esc(submit)}</button>` : ""}</div>`;
    const d = window.titanShell.sheet({ title, eyebrow, body: form });
    if (wide) d.classList.add("co-cp-wide");
    ctx.sheets?.add(d);
    d.addEventListener("close", () => ctx.sheets?.delete(d), { once: true });
    let pending = false;
    const progress = form.querySelector("[data-cp-progress]"), err = form.querySelector("[data-cp-error]");
    d.addEventListener("cancel", (e) => { if (pending) e.preventDefault(); });
    form.querySelector("[data-cancel]").addEventListener("click", () => { if (!pending) d.close(); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!onSubmit || pending || !d.open) return;
      const data = new FormData(form);
      pending = true; err.textContent = ""; progress.textContent = "Envoi en cours…"; form.setAttribute("aria-busy", "true");
      const buttons = [...form.querySelectorAll("button")]; buttons.forEach((b) => { b.disabled = true; });
      try {
        const keep = await onSubmit(data, d, form);
        if (keep !== true && d.open) d.close();
      } catch (x) {
        if (x.message === "STALE") { d.close(); return; }
        err.textContent = human(x);
      } finally {
        pending = false; progress.textContent = ""; form.setAttribute("aria-busy", "false"); buttons.forEach((b) => { b.disabled = false; });
      }
    });
    return d;
  }

  /* ---------- The sessions editor shared by a template and a draft ---------- */
  function rowHtml(s, weeks) {
    return `<fieldset class="co-cp-row" data-cp-row data-key="${esc(s.key || "")}"><legend class="asc-sr">Séance</legend>
      <label class="asc-field"><span>Semaine</span><select name="week" data-cp-week-select>${weekOptions(weeks, s.week || 1)}</select></label>
      <label class="asc-field"><span>Jour</span><select name="day">${dayOptions(s.day || 1)}</select></label>
      <label class="asc-field co-cp-grow"><span>Séance</span><input class="asc-input" name="title" maxlength="100" required value="${esc(s.title || "")}"></label>
      <label class="asc-field"><span>Sport</span><select name="sport">${sportOptions(s.sport || "running")}</select></label>
      <label class="asc-field co-cp-wide-field"><span>Consignes</span><input class="asc-input" name="instructions" maxlength="2000" value="${esc(s.instructions || "")}"></label>
      <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-cp-remove aria-label="Retirer la séance ${esc(s.title || "")}">Retirer</button></fieldset>`;
  }
  function editorHtml(sessions, weeks) {
    return `<div class="co-cp-rows" data-cp-rows>${(sessions || []).map((s) => rowHtml(s, weeks)).join("")}</div>
      <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-cp-add>${icon("plus")} Ajouter une séance</button>`;
  }
  function wireEditor(d) {
    const rows = d.querySelector("[data-cp-rows]"), weeksInput = d.querySelector("[name=weeks]");
    const weeks = () => Math.max(1, Math.min(12, Number(weeksInput?.value) || 1));
    d.querySelector("[data-cp-add]")?.addEventListener("click", () => {
      rows.insertAdjacentHTML("beforeend", rowHtml({ week: weeks(), day: 1 }, weeks()));
      rows.lastElementChild.querySelector("[name=title]").focus();
    });
    rows.addEventListener("click", (e) => { const b = e.target.closest("[data-cp-remove]"); if (b) b.closest("[data-cp-row]").remove(); });
    weeksInput?.addEventListener("change", () => rows.querySelectorAll("[data-cp-week-select]").forEach((s) => { const v = s.value; s.innerHTML = weekOptions(weeks(), Math.min(Number(v), weeks())); }));
  }
  const collect = (form) => [...form.querySelectorAll("[data-cp-row]")].map((r) => ({
    ...(r.dataset.key ? { key: r.dataset.key } : {}), week: Number(r.querySelector("[name=week]").value), day: Number(r.querySelector("[name=day]").value),
    title: r.querySelector("[name=title]").value, sport: r.querySelector("[name=sport]").value, instructions: r.querySelector("[name=instructions]").value }));
  const goalsOf = (f) => String(f.get("goals") || "").split("\n").map((g) => g.trim()).filter(Boolean).slice(0, 5);

  /* ---------- Rendering ---------- */
  function sessionHtml(s, role, plan, actions) {
    const can = actions && !s.readOnly && plan.state === "sent" && !["linked", "cancelled"].includes(s.state) && s.status !== "completed";
    return `<li class="co-cp-session" data-cp-session="${esc(s.key)}" data-state="${esc(s.state)}" data-tone="${esc(s.tone)}">
      <div class="asc-between"><span><strong>${esc(s.dayText)}</strong> · ${esc(s.title)} <span class="asc-small asc-muted">${esc(s.sport)}</span></span>${s.label ? `<span class="asc-chip" data-state="${esc(s.state)}">${esc(s.label)}</span>` : ""}</div>
      ${s.instructions ? `<p class="asc-small co-instructions">${esc(s.instructions)}</p>` : ""}
      ${s.text ? `<p class="asc-small">${esc(s.text)}</p>` : ""}
      ${s.dates.length > 1 ? `<dl class="co-dates">${s.dates.map((x) => `<div data-date="${esc(x.key)}"><dt>${esc(x.label)}</dt><dd>${esc(x.text)}</dd></div>`).join("")}</dl>` : ""}
      ${s.changePending && s.changes.length ? `<table class="co-diff" data-cp-change><caption>Changement en attente de ${role === "coach" ? "sa" : "ta"} réponse</caption><tbody>${s.changes.map((c) => `<tr><th scope="row">${esc(c.label)}</th><td>${esc(c.before)}</td><td>${esc(c.after)}</td></tr>`).join("")}</tbody></table>` : ""}
      ${can ? `<div class="asc-row-flex"><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-cp-revise-one="${esc(s.key)}">${icon("edit")} Réviser cette séance</button></div>` : ""}</li>`;
  }
  function weeksHtml(plan, role, actions) {
    return CP().weeks(plan, role).map((w) => `<section class="co-cp-week" data-cp-week="${w.week}" data-week-state="${esc(w.state)}" aria-labelledby="cp-w-${esc(plan.id)}-${w.week}">
      <div class="asc-between"><h4 id="cp-w-${esc(plan.id)}-${w.week}" class="co-cp-week-title">${esc(w.label)}${w.stateLabel ? ` <span class="asc-chip">${esc(w.stateLabel)}</span>` : ""}</h4>
      ${actions && plan.state === "sent" && plan.can_act && w.state !== "played" ? `<span class="asc-row-flex"><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-cp-shift="week" data-cp-week-n="${w.week}">Décaler la semaine</button>${w.week < plan.weeks ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-cp-shift="rest" data-cp-week-n="${w.week}">Décaler la suite</button>` : ""}</span>` : ""}</div>
      ${w.sessions.length ? `<ul class="co-cp-sessions">${w.sessions.map((s) => sessionHtml(s, role, plan, actions)).join("")}</ul>` : `<p class="asc-small asc-muted">Aucune séance cette semaine.</p>`}</section>`).join("");
  }
  function planCard(plan, ctx) {
    const h = CP().head(plan), coach = ctx.mode === "coach";
    const b = [];
    if (coach && plan.state === "draft" && plan.can_act) b.push(`<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-cp-edit="${esc(plan.id)}">${icon("edit")} Adapter</button>`,
      `<button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-cp-preview="${esc(plan.id)}">${icon("eye")} Aperçu et envoi</button>`,
      `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-cp-discard="${esc(plan.id)}">Abandonner</button>`);
    if (plan.state !== "draft") b.push(`<button type="button" class="asc-btn ${coach ? "asc-btn-primary" : "asc-btn-secondary"} asc-btn-sm" data-cp-open="${esc(plan.id)}">${icon("calendar")} Ouvrir le programme</button>`);
    if (coach && plan.state !== "draft" && (ctx.links || []).some((l) => l.id !== ctx.link.id && !l.paused)) b.push(`<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-cp-dup="${esc(plan.id)}">${icon("copy")} Dupliquer pour un autre sportif</button>`);
    if (coach && plan.state === "sent" && plan.can_act) b.push(`<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-cp-close="${esc(plan.id)}">Clore le cycle</button>`);
    const todo = !coach ? CP().toAnswer(plan) : null;
    return `<article class="co-task co-plan" data-cp-plan="${esc(plan.id)}" data-state="${esc(plan.state)}">
      <div class="asc-between"><span class="asc-chip">${esc(h.stateLabel)}</span><span class="asc-small asc-muted">${esc(h.dates)}</span></div>
      <h3>${esc(h.title)}</h3>${h.current ? `<p class="asc-small" data-cp-current>${esc(h.current)}</p>` : ""}
      ${h.goals.length ? `<ul class="co-cp-goals">${h.goals.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>` : ""}
      <p class="asc-small" data-cp-summary>${esc(h.summary)}</p>
      ${coach && h.origin ? `<p class="asc-small asc-muted" data-cp-origin>${esc(h.origin)}</p>` : ""}
      ${h.link ? `<p class="asc-small" data-cp-readonly>${icon("info")} ${esc(h.link)}</p>` : ""}
      ${todo && (todo.sessions || todo.changes) && plan.can_act ? `<p class="asc-small" data-cp-todo>${esc([todo.sessions ? `${todo.sessions} séance(s) à décider` : "", todo.changes ? `${todo.changes} changement(s) à décider` : ""].filter(Boolean).join(" · "))}</p>` : ""}
      ${b.length ? `<div class="asc-row-flex">${b.join("")}</div>` : ""}</article>`;
  }

  function mount(slot, ctx) {
    // ctx: { client, ok(), link: { id, athlete_name, coach_name, paused }, links: [...] (the coach's links, for duplication), mode, onChanged() }
    if (!slot || !ctx?.link || !CP() || !FU()) return;
    ctx.sheets = new Set();
    const state = { plans: null, library: null, error: "" };
    const coach = ctx.mode === "coach";
    const name = (coach ? ctx.link.athlete_name : ctx.link.coach_name) || (coach ? "le sportif" : "ton coach");
    const toast = (o) => window.titanShell?.toast?.(o);
    const planOf = (id) => state.plans?.find((p) => p.id === id);

    function draw() {
      if (!ctx.ok()) return;
      const plans = state.plans || [];
      const lib = state.library?.programs || [];
      slot.innerHTML = `<section class="asc-section co-cp" data-cp aria-labelledby="cp-title-${esc(ctx.link.id)}"><div class="asc-section-head"><h2 id="cp-title-${esc(ctx.link.id)}">${coach ? "Programmes sur plusieurs semaines" : "Programmes de mon coach"}</h2>
        ${coach && !ctx.link.paused ? `<button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-cp-new>${icon("plus")} Préparer un programme</button>` : ""}</div>
        <p class="asc-small asc-muted">${coach ? `Un cycle préparé depuis un modèle, adapté pour ${esc(name)}, envoyé quand tu le décides. ${esc(name)} accepte, décline ou demande à en discuter séance par séance ; une séance faite n’est jamais remplacée, une séance acceptée ne change qu’avec son accord.` : "Ton coach te propose un cycle de plusieurs semaines. Tu décides séance par séance ; rien n’est ajouté à ton journal."}</p>
        ${state.error ? `<p class="asc-note err">${icon("alert")}<span>${esc(state.error)}</span></p>` : ""}
        ${state.plans === null && !state.error ? '<div class="asc-skeleton" style="height:64px"></div>' : plans.length ? `<div class="co-tasks" data-cp-list>${plans.map((p) => planCard(p, ctx)).join("")}</div>` : `<p class="asc-small asc-muted" data-cp-empty>${coach ? "Aucun programme pour ce sportif. Prépare-en un depuis un de tes modèles." : "Aucun programme reçu."}</p>`}
        ${coach ? `<details class="co-cp-library" data-cp-library><summary>Mes modèles multi-semaines (${lib.length})</summary>
          <ul class="co-templates">${lib.map((g) => `<li data-cp-program="${esc(g.id)}"><strong>${esc(g.title)}</strong> <span class="asc-small asc-muted">${g.weeks} semaine(s) · ${g.sessions.length} séances · version ${g.version}${g.plans ? ` · ${g.plans} programme(s)` : ""}</span> <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-cp-tpl-edit="${esc(g.id)}">Modifier</button></li>`).join("") || '<li class="asc-small asc-muted">Aucun modèle.</li>'}</ul>
          <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-cp-tpl-new>${icon("plus")} Nouveau modèle</button>
          <p class="asc-small asc-faint">Modifier un modèle crée une nouvelle version : les programmes déjà préparés gardent la leur.</p></details>` : ""}
        <p class="asc-small asc-faint">${coach ? "Le partage et les places de ton offre sont revérifiés à chaque lecture et à chaque envoi." : "Tu peux arrêter le partage à tout moment : tu gardes la lecture de tes programmes et de tes séances."}</p></section>`;
    }

    async function load() {
      try {
        const [r, lib] = await Promise.all([call(ctx, "link", { link_id: ctx.link.id }), coach ? call(ctx, "library") : Promise.resolve(null)]);
        state.plans = r?.plans || []; state.library = lib; state.error = "";
      } catch (e) {
        if (e.message === "STALE") return;
        state.plans = []; state.error = e.message === "FEATURE_DISABLED" ? "" : human(e);
        if (e.message === "FEATURE_DISABLED") { slot.innerHTML = ""; return; }
      }
      draw();
    }
    const changed = () => { load(); ctx.onChanged?.(); };

    /* ----- Templates ----- */
    function templateSheet(g) {
      const weeks = g?.weeks || 4;
      const d = sheet(ctx, {
        title: g ? `Modifier « ${g.title} »` : "Nouveau modèle multi-semaines", wide: true,
        body: `<label class="asc-field"><span>Nom du modèle</span><input class="asc-input" name="title" maxlength="100" required value="${esc(g?.title || "")}"></label>
          <div class="asc-form-grid"><label class="asc-field"><span>Nombre de semaines</span><input class="asc-input" type="number" name="weeks" min="1" max="12" value="${weeks}" required></label></div>
          <label class="asc-field"><span>Objectifs (un par ligne, cinq au plus)</span><textarea name="goals" maxlength="800">${esc((g?.goals || []).join("\n"))}</textarea></label>
          ${editorHtml(g?.sessions || [{ week: 1, day: 2, sport: "running" }], weeks)}
          ${g ? `<p class="asc-small asc-muted">Enregistrer crée la version ${g.version + 1} ; la version ${g.version} reste lisible et les programmes qui en viennent ne changent pas.</p>` : ""}`,
        submit: g ? "Enregistrer une nouvelle version" : "Enregistrer le modèle",
        onSubmit: async (f, _d, form) => {
          const r = await call(ctx, "save_program", { ...(g ? { id: g.id, version: g.version } : {}), title: String(f.get("title") || ""), weeks: Number(f.get("weeks")), goals: goalsOf(f), sessions: collect(form) });
          toast({ type: "ok", title: r?.unchanged ? "Rien n’a changé" : `Modèle enregistré · version ${r?.version}` });
          load();
        },
      });
      wireEditor(d);
    }

    /* ----- Prepare: a template (or another athlete's programme) for this athlete, from a Monday ----- */
    function prepareSheet() {
      const lib = state.library?.programs || [];
      if (!lib.length) return templateSheet(null);
      const mondays = CP().mondays(isoDay(), 9).slice(1);
      sheet(ctx, {
        title: `Préparer un programme pour ${name}`,
        body: `<label class="asc-field"><span>Partir du modèle</span><select name="program">${lib.map((g) => `<option value="${esc(g.id)}">${esc(g.title)} · version ${g.version}</option>`).join("")}</select></label>
          <label class="asc-field"><span>Premier lundi du cycle</span><select name="start">${mondays.map((m) => `<option value="${m}">${esc(FU().day(m))}</option>`).join("")}</select></label>
          <p class="asc-small asc-muted">Un brouillon est créé pour ${esc(name)} : tu l’adaptes, tu vois ce qui change par rapport au modèle, puis tu l’envoies. Rien n’est visible pour ${esc(name)} avant l’envoi.</p>`,
        submit: "Créer le brouillon",
        onSubmit: async (f) => {
          const r = await call(ctx, "adapt", { link_id: ctx.link.id, program_id: String(f.get("program")), start_date: String(f.get("start")) });
          await load();
          setTimeout(() => r?.plan && draftSheet(r.plan), 0);
        },
      });
    }
    function draftSheet(plan) {
      const mondays = CP().mondays(isoDay(), 9);
      const d = sheet(ctx, {
        title: `Adapter pour ${name}`, wide: true, eyebrow: CP().head(plan).origin || "Coaching · programme",
        body: `<label class="asc-field"><span>Nom du programme</span><input class="asc-input" name="title" maxlength="100" required value="${esc(plan.title)}"></label>
          <div class="asc-form-grid"><label class="asc-field"><span>Premier lundi</span><select name="start">${[...new Set([plan.start_date, ...mondays])].sort().map((m) => `<option value="${m}"${m === plan.start_date ? " selected" : ""}>${esc(FU().day(m))}</option>`).join("")}</select></label>
          <label class="asc-field"><span>Nombre de semaines</span><input class="asc-input" type="number" name="weeks" min="1" max="12" value="${plan.weeks}" required></label></div>
          <label class="asc-field"><span>Objectifs (un par ligne)</span><textarea name="goals" maxlength="800">${esc((plan.goals || []).join("\n"))}</textarea></label>
          ${editorHtml(plan.sessions, plan.weeks)}
          <p class="asc-small asc-muted">Rien n’est envoyé à cette étape : l’aperçu montre ce qui diffère du modèle avant l’envoi.</p>`,
        submit: "Voir l’aperçu",
        onSubmit: async (f, _d, form) => {
          const r = await call(ctx, "edit", { id: plan.id, revision: plan.revision, title: String(f.get("title") || ""), start_date: String(f.get("start")), weeks: Number(f.get("weeks")), goals: goalsOf(f), sessions: collect(form) });
          load();
          setTimeout(() => r?.plan && previewSheet(r.plan), 0);
        },
      });
      wireEditor(d);
    }
    function previewSheet(plan) {
      const ch = CP().changes(plan), h = CP().head(plan);
      sheet(ctx, {
        title: `Aperçu pour ${name}`, wide: true, eyebrow: h.dates,
        body: `<div class="asc-stack" data-cp-preview="${esc(plan.id)}"><p class="asc-small">${esc(h.origin)}</p>
          <section><h3 class="asc-h3">Ce que ${esc(name)} recevra</h3><div data-cp-receive>${weeksHtml(plan, "coach", false)}</div></section>
          ${ch.length ? `<table class="co-diff" data-cp-changes><caption>Ce qui diffère du point de départ</caption><thead><tr><th scope="col">Séance</th><th scope="col">Avant</th><th scope="col">Après</th></tr></thead><tbody>${ch.map((c) => c.rows.map((r, i) => `<tr data-kind="${esc(c.kind)}" data-key="${esc(c.key)}"><th scope="row">${i === 0 ? esc(c.label) + " · " : ""}${esc(r.label)}</th><td>${esc(r.before)}</td><td>${esc(r.after)}</td></tr>`).join("")).join("")}</tbody></table>` : `<p class="asc-small asc-muted" data-cp-changes>Identique au point de départ.</p>`}
          <p class="asc-small asc-muted">${esc(name)} reçoit ${plan.sessions.length} propositions et décide séance par séance. Le partage et les places de ton offre sont revérifiés à l’envoi.</p></div>`,
        submit: `Envoyer à ${name}`,
        onSubmit: async () => {
          // Retrying after a lost answer sends the same draft and revision: the server answers « already », never a second set of proposals.
          const r = await call(ctx, "send", { id: plan.id, revision: plan.revision });
          toast({ type: "ok", title: r?.already ? "Déjà envoyé" : "Programme envoyé", message: `${name} décide séance par séance ; tu vois ses réponses ici et dans ta revue.` });
          changed();
        },
      });
    }

    /* ----- A sent programme, week by week, with its revisions and versions ----- */
    async function openPlan(id) {
      let plan;
      try { plan = await call(ctx, "plan", { id }); } catch (e) { if (e.message !== "STALE") { state.error = human(e); draw(); } return; }
      const h = CP().head(plan);
      const d = sheet(ctx, {
        title: plan.title, wide: true, eyebrow: `${h.stateLabel} · ${h.dates}`,
        body: `<div class="asc-stack" data-cp-detail="${esc(plan.id)}"><p class="asc-small" data-cp-summary>${esc(h.summary)}</p>${h.link ? `<p class="asc-small" data-cp-readonly>${icon("info")} ${esc(h.link)}</p>` : ""}
          ${coach && h.origin ? `<p class="asc-small asc-muted">${esc(h.origin)}</p>` : ""}
          ${weeksHtml(plan, ctx.mode, coach)}
          <section><h3 class="asc-h3">Versions</h3><ol class="co-history" data-cp-versions>${(plan.versions || []).map((v) => CP().version(v)).map((v) => `<li data-kind="${esc(v.kind)}">Version ${v.version} · ${esc(v.at)} · ${esc(v.text)}</li>`).join("")}</ol>
          <p class="asc-small asc-faint">Chaque envoi, révision et clôture garde sa version ; les semaines déjà jouées ne sont jamais réécrites.</p></section>
          ${!coach && plan.can_act ? answerHtml(plan) : ""}</div>`,
      });
      d.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b || !d.contains(b)) return;
        if (b.dataset.cpReviseOne) { d.close(); reviseSheet(plan, { scope: "occurrence", key: b.dataset.cpReviseOne }); }
        if (b.dataset.cpShift) { d.close(); reviseSheet(plan, { scope: b.dataset.cpShift, week: Number(b.dataset.cpWeekN) }); }
      });
      if (!coach) wireAnswers(d, plan);
    }
    function reviseSheet(plan, target) {
      const row = target.key ? plan.sessions.find((s) => s.key === target.key) : null;
      const occ = target.scope === "occurrence";
      sheet(ctx, {
        title: occ ? `Réviser « ${row?.title || ""} »` : target.scope === "week" ? `Décaler la semaine ${target.week}` : `Décaler la suite à partir de la semaine ${target.week}`,
        eyebrow: plan.title,
        body: occ ? `<label class="asc-field"><span>Séance</span><input class="asc-input" name="title" maxlength="100" required value="${esc(row?.title || "")}"></label>
            <div class="asc-form-grid"><label class="asc-field"><span>Date</span><input class="asc-input" type="date" name="planned_date" min="${isoDay()}" value="${esc(row?.planned_date || "")}" required></label></div>
            <label class="asc-field"><span>Consignes</span><textarea name="instructions" maxlength="2000">${esc(row?.instructions || "")}</textarea></label>
            <label class="asc-field"><span>Un mot pour ${esc(name)} (facultatif)</span><input class="asc-input" name="note" maxlength="300"></label>
            <p class="asc-small asc-muted">Si ${esc(name)} l’a déjà acceptée, le changement attend sa réponse et sa version acceptée reste en vigueur.</p>`
          : `<label class="asc-field"><span>Décaler de</span><select name="shift">${[-7, -3, -2, -1, 1, 2, 3, 7, 14].map((n) => `<option value="${n}"${n === 2 ? " selected" : ""}>${n > 0 ? "+" : ""}${n} jour(s)</option>`).join("")}</select></label>
            <label class="asc-field"><span>Un mot pour ${esc(name)} (facultatif)</span><input class="asc-input" name="note" maxlength="300"></label>
            <p class="asc-small asc-muted">Les séances faites et liées, déclinées ou déjà passées restent telles quelles. Tu verras l’aperçu avant d’appliquer.</p>`,
        submit: "Voir l’aperçu",
        onSubmit: async (f) => {
          const data = { id: plan.id, scope: target.scope, note: String(f.get("note") || "") };
          if (occ) Object.assign(data, { key: target.key, title: String(f.get("title") || ""), planned_date: String(f.get("planned_date") || ""), instructions: String(f.get("instructions") || "") });
          else Object.assign(data, { week: target.week, shift_days: Number(f.get("shift")) });
          const dry = await call(ctx, "revise", { ...data, dry_run: true });
          setTimeout(() => revisionPreview(plan, data, dry), 0);
        },
      });
    }
    function revisionPreview(plan, data, dry) {
      const v = CP().revision(dry, plan), op = CP().opId();
      sheet(ctx, {
        title: v.title, eyebrow: `Aperçu · ${plan.title}`, wide: true,
        body: `<div class="asc-stack" data-cp-revision data-preview-key="${esc(v.key)}"><p class="asc-small" data-cp-revision-counts>${esc(v.counts)}</p>
          <ul class="co-cp-effects">${v.effects.map((e) => `<li data-cp-effect="${esc(e.effect)}" data-key="${esc(e.key)}"><div class="asc-between"><strong>${esc(e.title)}</strong><span class="asc-chip">${esc(e.label)}</span></div><p class="asc-small">${esc(e.text)}</p>
            ${e.rows.length ? `<table class="co-diff"><tbody>${e.rows.map((r) => `<tr><th scope="row">${esc(r.label)}</th><td>${esc(r.before)}</td><td>${esc(r.after)}</td></tr>`).join("")}</tbody></table>` : ""}</li>`).join("")}</ul>
          ${v.note ? `<p class="asc-small">Ton mot · « ${esc(v.note)} »</p>` : ""}
          ${v.applies ? "" : `<p class="asc-note">${icon("info")}<span>Rien à appliquer : toutes les séances concernées sont conservées.</span></p>`}</div>`,
        submit: v.applies ? "Appliquer" : "Fermer",
        onSubmit: async () => {
          if (!v.applies) return;
          // The op_id belongs to this preview: a retry after a lost answer replays the same revision and creates nothing more.
          const r = await call(ctx, "revise", { ...data, preview_key: v.key, op_id: op });
          toast({ type: "ok", title: r?.already ? "Déjà appliquée" : `Programme révisé · version ${r?.version}`, message: `${name} voit les changements et répond séance par séance.` });
          changed();
        },
      });
    }

    /* ----- Athlete answers ----- */
    function answerHtml(plan) {
      const rows = plan.sessions.filter((r) => ["awaiting", "to_discuss"].includes(r.state) || (r.pending_change && typeof r.pending_change === "object"));
      if (!rows.length) return `<p class="asc-small asc-muted" data-cp-nothing>Rien à décider pour l’instant.</p>`;
      return `<div class="asc-stack co-cp-answers" data-cp-answers role="group" aria-labelledby="cp-answers-${esc(plan.id)}"><h3 class="asc-h3" id="cp-answers-${esc(plan.id)}">Mes réponses</h3>${rows.map((r) => {
        const change = r.pending_change && typeof r.pending_change === "object";
        const opts = change ? [["accept_change", "Accepter le changement"], ["keep_version", "Garder ma version"]] : [["accept", "Accepter"], ["decline", "Décliner"], ["discuss", "À discuter"]];
        return `<fieldset class="co-fb-next" data-cp-answer="${esc(r.key)}"><legend>${esc(FU().day(r.planned_date))} · ${esc(r.title)}</legend>
          <div class="asc-row-flex" role="radiogroup">${opts.map(([v, l]) => `<label class="auth-check"><input type="radio" name="a-${esc(r.key)}" value="${v}"><span>${esc(l)}</span></label>`).join("")}</div>
          ${change ? "" : `<label class="asc-field" data-cp-note hidden><span>Ce que tu veux en discuter</span><input class="asc-input" name="n-${esc(r.key)}" maxlength="300"></label>`}</fieldset>`;
      }).join("")}<p class="asc-small" role="alert" data-cp-answer-error></p><div class="asc-row-flex"><button type="button" class="asc-btn asc-btn-secondary" data-cp-accept-all>Tout accepter</button><button type="button" class="asc-btn asc-btn-primary" data-cp-send-answers>Envoyer mes réponses</button></div></div>`;
    }
    function wireAnswers(d, plan) {
      const form = d.querySelector("[data-cp-answers]");
      if (!form) return;
      let pending = false;
      form.addEventListener("change", (e) => {
        const fs = e.target.closest("[data-cp-answer]");
        const note = fs?.querySelector("[data-cp-note]");
        if (note) note.hidden = e.target.value !== "discuss";
      });
      const send = async (payload) => {
        if (pending) return;
        pending = true; form.setAttribute("aria-busy", "true");
        const err = form.querySelector("[data-cp-answer-error]"); err.textContent = "";
        try {
          const r = await call(ctx, "answer", { id: plan.id, ...payload });
          const n = (r?.results || []).filter((x) => x.effect !== "unchanged").length;
          toast({ type: "ok", title: n ? "Réponses envoyées" : "Déjà répondu", message: `Ton coach voit tes réponses. Ton journal ne change pas.` });
          d.close(); changed();
        } catch (x) { if (x.message !== "STALE") err.textContent = human(x); } finally { pending = false; form.setAttribute("aria-busy", "false"); }
      };
      form.querySelector("[data-cp-accept-all]").addEventListener("click", () => send({ all: "accept" }));
      form.querySelector("[data-cp-send-answers]").addEventListener("click", () => {
        const choices = {};
        for (const fs of form.querySelectorAll("[data-cp-answer]")) {
          const key = fs.dataset.cpAnswer, v = fs.querySelector("input[type=radio]:checked")?.value;
          if (v) choices[key] = { answer: v, note: fs.querySelector(`[name="n-${CSS.escape(key)}"]`)?.value || "" };
        }
        const decisions = CP().answers(choices);
        if (!decisions.length) { form.querySelector("[data-cp-answer-error]").textContent = "Choisis une réponse pour au moins une séance."; return; }
        send({ decisions });
      });
    }

    /* ----- Duplicate, discard, close ----- */
    function duplicateSheet(plan) {
      const others = (ctx.links || []).filter((l) => l.id !== ctx.link.id && !l.paused);
      const mondays = CP().mondays(isoDay(), 9).slice(1);
      sheet(ctx, {
        title: `Dupliquer « ${plan.title} »`,
        body: `<label class="asc-field"><span>Pour</span><select name="link">${others.map((l) => `<option value="${esc(l.id)}">${esc(l.athlete_name || "Compte TITAN")}</option>`).join("")}</select></label>
          <label class="asc-field"><span>Premier lundi</span><select name="start">${mondays.map((m) => `<option value="${m}">${esc(FU().day(m))}</option>`).join("")}</select></label>
          <p class="asc-small asc-muted">Le programme est copié tel qu’il est aujourd’hui (révisions comprises) dans un brouillon pour ce sportif, que tu adaptes avant l’envoi. Rien de ${esc(name)} n’y est copié en dehors des séances proposées.</p>`,
        submit: "Créer le brouillon",
        onSubmit: async (f) => {
          await call(ctx, "adapt", { link_id: String(f.get("link")), plan_id: plan.id, start_date: String(f.get("start")) });
          const who = others.find((l) => l.id === f.get("link"))?.athlete_name || "ce sportif";
          toast({ type: "ok", title: "Brouillon créé", message: `Ouvre le suivi de ${who} pour l’adapter et l’envoyer.` });
        },
      });
    }
    function confirmAction(title, message, label, run) {
      window.titanShell.confirm({ title, message, confirmLabel: label, action: async () => { try { await run(); changed(); } catch (e) { if (e.message !== "STALE") throw new Error(human(e)); } } });
    }

    slot.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || !slot.contains(b) || !ctx.ok()) return;
      const p = planOf(b.dataset.cpEdit || b.dataset.cpPreview || b.dataset.cpDiscard || b.dataset.cpDup || b.dataset.cpClose || "");
      if (b.hasAttribute("data-cp-new")) return prepareSheet();
      if (b.hasAttribute("data-cp-tpl-new")) return templateSheet(null);
      if (b.dataset.cpTplEdit) return templateSheet(state.library?.programs?.find((g) => g.id === b.dataset.cpTplEdit));
      if (b.dataset.cpOpen) return openPlan(b.dataset.cpOpen);
      if (b.dataset.cpEdit && p) return draftSheet(p);
      if (b.dataset.cpPreview && p) return previewSheet(p);
      if (b.dataset.cpDup && p) return duplicateSheet(p);
      if (b.dataset.cpDiscard && p) return confirmAction("Abandonner ce brouillon ?", `Rien n’a été envoyé à ${name}.`, "Abandonner", () => call(ctx, "discard", { id: p.id, revision: p.revision }));
      if (b.dataset.cpClose && p) return confirmAction("Clore ce cycle ?", `Les séances encore sans réponse sont annulées et les changements en attente retirés. Ce que ${name} a accepté ou fait reste à lui ; la version de clôture garde le programme tel qu’il est.`, "Clore le cycle",
        () => call(ctx, "close", { id: p.id, revision: p.revision }));
    });
    draw();
    load();
    return { reload: load, close: () => { for (const d of ctx.sheets) if (d.open) d.close(); } };
  }

  window.TitanCoachPrograms = { mount };
})();
