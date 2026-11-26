/* TITAN — V1.9.5 Bilans de cycle partageables. Mounted by coaching.js into the selected link's slot when screens.coach_cycle_report is
   open; every call goes through public.titan_coach_cycle_v1, which re-checks the link (scope, pause, revocation) each time.
   Coach: the report of a cycle (a V1.9.4 programme sent or closed) — its figures with their period and sources, observations tied to
   source sessions, decisions for what comes next; a draft, proposed to the athlete; the hosted version once validated; a file when the
   athlete allowed it; the next cycle from the approved decisions. Athlete: what is proposed, the dedicated validation (measures, notes
   and check-ins ticked one by one, each decision approved or not, a file allowed or not), then what the coach sees, with « retirer » on
   every shared item, the withdrawal of the access, their own file and the log of files downloaded. Nothing here writes the journal. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const CY = () => window.TitanCoachCycle;
  const FU = () => window.TitanCoachFollowup;
  const FN = "titan_coach_cycle_v1";
  const human = (e) => CY()?.message?.(e?.message) || (navigator.onLine ? "La demande n’a pas été confirmée. Réessaie." : "Hors ligne : le bilan revient avec le réseau.");
  const isoDay = () => new Date().toISOString().slice(0, 10);
  const sportOptions = (sel) => (window.TitanSports?.all?.() || []).map((sp) => ({ id: sp.id, label: window.TitanSports.label(sp.id) }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"))
    .map((sp) => `<option value="${esc(sp.id)}"${sp.id === sel ? " selected" : ""}>${esc(sp.label)}</option>`).join("")
    || `<option value="running"${sel === "running" ? " selected" : ""}>Course à pied</option><option value="muscu_home"${sel === "muscu_home" ? " selected" : ""}>Muscu Maison</option>`;

  async function call(ctx, action, data = {}) {
    if (!ctx.ok()) throw Error("STALE");
    const r = await ctx.client.rpc(FN, { p_action: action, p_data: data });
    if (!ctx.ok()) throw Error("STALE");
    if (r.error) throw Error(r.error.message || "UNAVAILABLE");
    return r.data;
  }

  /* ---------- A sheet whose content is redrawn in place; one action at a time, errors kept in the sheet ---------- */
  function openSheet(ctx, { title, eyebrow = "Coaching · bilan de cycle" }) {
    const body = document.createElement("div");
    body.className = "asc-stack co-cy";
    const d = window.titanShell.sheet({ title, eyebrow, body });
    d.classList.add("co-cp-wide");
    ctx.sheets?.add(d);
    d.addEventListener("close", () => ctx.sheets?.delete(d), { once: true });
    let pending = false;
    d.addEventListener("cancel", (e) => { if (pending) e.preventDefault(); });
    const run = async (fn) => {
      if (pending || !d.open) return;
      pending = true; body.setAttribute("aria-busy", "true");
      const err = body.querySelector("[data-cy-error]"), prog = body.querySelector("[data-cy-progress]");
      if (err) err.textContent = ""; if (prog) prog.textContent = "Envoi en cours…";
      const buttons = [...body.querySelectorAll("button")]; buttons.forEach((b) => { b.disabled = true; });
      try { await fn(); } catch (x) {
        if (x.message === "STALE") { d.close(); return; }
        const e2 = body.querySelector("[data-cy-error]"); if (e2) { e2.textContent = human(x); e2.focus?.(); }
      } finally {
        pending = false; body.setAttribute("aria-busy", "false");
        const p2 = body.querySelector("[data-cy-progress]"); if (p2) p2.textContent = "";
        body.querySelectorAll("button").forEach((b) => { b.disabled = false; });
      }
    };
    return { d, body, run };
  }
  const statusHtml = `<p class="asc-small asc-muted" role="status" data-cy-progress></p><p class="asc-small jr-edit-error" role="alert" tabindex="-1" data-cy-error></p>`;

  /* ---------- Rendering shared by the working copy, the proposal and the hosted version ---------- */
  function figuresHtml(t, id) {
    if (!t.figures.length) return "";
    return `<section aria-labelledby="${id}-fig"><h3 class="asc-h3" id="${id}-fig">Chiffres du cycle</h3>
      <p class="asc-small asc-muted" data-cy-period>Période : ${esc(t.period)} · ${t.weeksCount} semaine(s). Chaque chiffre indique sa source.</p>
      <ul class="co-cy-figures" data-cy-figures>${t.figures.map((f) => `<li class="co-cy-figure" data-cy-figure="${esc(f.id)}"${f.unit ? ` data-unit="${esc(f.unit)}"` : ""}>
        <div class="asc-between"><span>${esc(f.label)}</span><strong data-cy-value>${esc(f.value)}</strong></div>
        <p class="asc-small asc-muted">${f.count ? `${esc(f.count)} · ` : ""}${esc(f.period)}</p><p class="asc-small asc-faint" data-cy-source>${esc(f.source)}</p>
        ${f.sources.length ? `<details class="co-cy-sources"><summary>Voir ${f.sources.length} séance(s) source(s)</summary><ul>${f.sources.map((s) => `<li data-key="${esc(s.key)}">${esc(s.text)}</li>`).join("")}</ul></details>` : ""}</li>`).join("")}</ul>
      <div class="co-cy-scroll" tabindex="0" role="region" aria-label="Semaine par semaine"><table class="co-diff co-cy-weeks" data-cy-weeks><caption>Semaine par semaine (une séance reportée compte dans la semaine où elle se trouve maintenant)</caption>
        <thead><tr><th scope="col">Semaine</th><th scope="col">Prévues</th><th scope="col">Réalisées</th><th scope="col">Reportées</th></tr></thead>
        <tbody>${t.weeks.map((w) => `<tr data-week="${w.week}"><th scope="row">${esc(w.label)} <span class="asc-small asc-muted">${esc(w.period)}</span></th><td>${w.planned}</td><td>${w.done}</td><td>${w.moved}</td></tr>`).join("")}</tbody></table></div>
      ${t.outside ? `<p class="asc-small" data-cy-outside>${esc(t.outside.text)}</p>` : ""}</section>`;
  }
  function sessionLine(v, extra = "") {
    return `<li class="co-cp-session" data-cy-session="${esc(v.key)}" data-outcome="${esc(v.outcome)}" data-tone="${esc(v.tone)}">
      <div class="asc-between"><span><strong>${esc(v.title)}</strong> <span class="asc-small asc-muted">${esc(v.sport)}</span></span><span class="asc-chip">${esc(v.label)}</span></div>
      <dl class="co-dates">${v.dates.map((x) => `<div data-date="${esc(x.key)}"><dt>${esc(x.label)}</dt><dd>${esc(x.text)}</dd></div>`).join("")}</dl>
      ${v.measure ? `<p class="asc-small" data-cy-measure>${esc(v.measure)}</p>` : ""}${v.text ? `<p class="asc-small asc-muted">${esc(v.text)}</p>` : ""}${extra}</li>`;
  }
  function sessionsHtml(sessions, id, extra) {
    const views = (sessions || []).map((s) => CY().session(s));
    return `<section aria-labelledby="${id}-ses"><h3 class="asc-h3" id="${id}-ses">Séances du cycle</h3><ul class="co-cp-sessions" data-cy-sessions>${views.map((v, i) => sessionLine(v, extra ? extra(v, sessions[i]) : (v.note ? `<p class="asc-small" data-cy-note>Note du sportif · « ${esc(v.note)} »</p>` : ""))).join("")}</ul></section>`;
  }
  function contentHtml(observations, decisions, sessions, id) {
    const obs = (observations || []).map((o) => CY().observation(o, sessions)), dec = (decisions || []).map((x) => CY().decision(x));
    return `<section aria-labelledby="${id}-obs"><h3 class="asc-h3" id="${id}-obs">Constats du coach</h3>${obs.length ? `<ul class="co-cy-list" data-cy-observations>${obs.map((o) => `<li data-cy-observation="${esc(o.key)}"><p>${esc(o.text)}</p>
        ${o.sources.length ? `<p class="asc-small asc-muted">Séances sources : ${o.sources.map((s) => `<span data-key="${esc(s.key)}">${esc(s.text)}</span>`).join(" ; ")}</p>` : ""}</li>`).join("")}</ul>` : `<p class="asc-small asc-muted">Aucun constat.</p>`}</section>
      <section aria-labelledby="${id}-dec"><h3 class="asc-h3" id="${id}-dec">Décisions pour la suite</h3>${dec.length ? `<ul class="co-cy-list" data-cy-decisions>${dec.map((x) => `<li data-cy-decision="${esc(x.key)}" data-state="${esc(x.state || "")}"><div class="asc-between"><span><span class="asc-small asc-muted">${esc(x.kindLabel)}${x.sport ? ` · ${esc(x.sport)}` : ""}</span><br>${esc(x.text)}</span>${x.stateLabel ? `<span class="asc-chip">${esc(x.stateLabel)}</span>` : ""}</div></li>`).join("")}</ul>` : `<p class="asc-small asc-muted">Aucune décision.</p>`}</section>`;
  }
  function checkinsHtml(checkins, extra) {
    const list = (checkins || []).map((c) => CY().checkin(c));
    return list.length ? `<section><h3 class="asc-h3">Check-ins partagés</h3><ul class="co-cy-list" data-cy-checkins>${list.map((c) => `<li data-cy-checkin="${esc(c.week)}"><strong>${esc(c.label)}</strong><p class="asc-small">${esc(c.scores)}</p>${c.note ? `<p class="asc-small">« ${esc(c.note)} »</p>` : ""}${extra ? extra(c) : ""}</li>`).join("")}</ul></section>` : "";
  }
  /** The hosted version, the same for both readers; `mine` adds the athlete's « retirer » buttons. */
  function publishedHtml(pub, id, mine) {
    const t = CY().totals(pub.totals, pub.sessions);
    const take = (kind, key, label) => (mine ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-cy-retract="${kind}" data-key="${esc(key)}">${esc(label)}</button>` : "");
    return `<div class="asc-stack" data-cy-published="${pub.version}">${figuresHtml(t, id)}
      ${sessionsHtml(pub.sessions, id, (v) => `${v.note ? `<p class="asc-small" data-cy-note>Note du sportif · « ${esc(v.note)} »</p>` : ""}${mine && (v.note || v.measure) ? `<div class="asc-row-flex">${v.note ? take("note", v.key, "Retirer cette note") : ""}${v.measure ? take("measure", v.key, "Retirer cette mesure") : ""}</div>` : ""}`)}
      ${checkinsHtml(pub.checkins, (c) => take("checkin", c.week, "Retirer ce check-in"))}
      ${contentHtml(pub.observations, pub.decisions, pub.sessions, id)}
      ${pub.athlete_note ? `<section><h3 class="asc-h3">Mot du sportif</h3><p data-cy-word>« ${esc(pub.athlete_note)} »</p>${take("word", "word", "Retirer mon mot")}</section>` : ""}
      ${(pub.retracted || []).length ? `<p class="asc-small asc-muted" data-cy-retracted>Retiré depuis la validation : ${pub.retracted.map((x) => esc(CY().retractedLine(x))).join(" ; ")}.</p>` : ""}</div>`;
  }
  function download(file) {
    const url = URL.createObjectURL(new Blob([file.text], { type: file.mime }));
    const a = Object.assign(document.createElement("a"), { href: url, download: file.filename });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function mount(slot, ctx) {
    // ctx: { client, ok(), link: { id, athlete_name, coach_name, paused }, mode, onChanged(), onPlans() }
    // ctx.ended (athlete only): the reports of links the athlete ended, read-only for a year, listed across coaches (« athlete » action).
    if (!slot || !ctx?.link || !CY() || !FU()) return;
    ctx.sheets = new Set();
    const state = { cycles: null, reports: [], error: "" };
    const coach = ctx.mode === "coach";
    const ended = !coach && ctx.ended === true;
    const name = (ended ? "" : coach ? ctx.link.athlete_name : ctx.link.coach_name) || (coach ? "le sportif" : "ton coach");
    const toast = (o) => window.titanShell?.toast?.(o);
    const reportOf = (planId) => state.reports.find((r) => r.plan_id === planId);

    function card(c) {
      const r = reportOf(c.plan_id), h = r ? CY().head(r, ctx.mode) : null;
      const b = [];
      if (!r && coach && !ctx.link.paused) b.push(`<button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-cy-start="${esc(c.plan_id)}">${icon("edit")} Préparer le bilan</button>`);
      if (r) b.push(`<button type="button" class="asc-btn ${!coach && r.state === "proposed" && r.can_act ? "asc-btn-primary" : "asc-btn-secondary"} asc-btn-sm" data-cy-open="${esc(r.id)}">${icon("eye")} ${!coach && r.state === "proposed" && r.can_act ? "Relire et valider" : "Ouvrir le bilan"}</button>`);
      return `<article class="co-task co-plan" data-cy-cycle="${esc(c.plan_id)}" data-state="${esc(r?.state || "none")}" data-hosted="${esc(r?.hosted || "none")}">
        <div class="asc-between"><span class="asc-chip">${esc(h?.stateLabel || (c.state === "closed" ? "Cycle clos" : "Cycle en cours"))}</span><span class="asc-small asc-muted">${esc(CY().period({ from: c.start_date, to: c.end_date }))}</span></div>
        <h3>${esc(c.title)}</h3>
        ${h?.hostedLabel ? `<p class="asc-small" data-cy-hosted>${esc(h.hostedLabel)}${h.versionText ? ` · ${esc(h.versionText)}` : ""}</p>` : ""}
        ${h?.returned ? `<p class="asc-small" data-cy-returned>${esc(h.returned)}</p>` : ""}${h?.next ? `<p class="asc-small asc-muted" data-cy-next-plan>${esc(h.next)}</p>` : ""}
        ${h?.link ? `<p class="asc-small" data-cy-readonly>${icon("info")} ${esc(h.link)}</p>` : ""}
        ${!r && coach ? `<p class="asc-small asc-muted">Aucun bilan pour ce cycle.</p>` : ""}
        ${b.length ? `<div class="asc-row-flex">${b.join("")}</div>` : ""}</article>`;
    }
    function draw() {
      if (!ctx.ok()) return;
      const list = (state.cycles || []).filter((c) => coach || reportOf(c.plan_id));
      if (state.cycles !== null && !state.error && !list.length && !coach) { slot.innerHTML = ""; return; }
      slot.innerHTML = `<section class="asc-section co-cy-section" data-cy${ended ? "-ended" : ""} aria-labelledby="cy-title-${esc(ctx.link.id)}"><div class="asc-section-head"><h2 id="cy-title-${esc(ctx.link.id)}">${ended ? "Bilans de suivis arrêtés" : "Bilans de cycle"}</h2></div>
        <p class="asc-small asc-muted">${ended ? "Tu as arrêté ces partages : ton coach ne lit plus rien. Tu gardes la lecture de tes bilans pendant un an." : coach ? `En fin de cycle : les séances proposées, réalisées et reportées, tes constats et les décisions pour la suite. ${esc(name)} choisit ce qui est partagé et valide avant toute publication.` : "Ton coach te propose un bilan de fin de cycle. Tu choisis ce que tu partages, tu valides, et tu peux retirer un élément ou l’accès ensuite."}</p>
        ${state.error ? `<p class="asc-note err">${icon("alert")}<span>${esc(state.error)}</span></p>` : ""}
        ${state.cycles === null && !state.error ? '<div class="asc-skeleton" style="height:64px"></div>' : list.length ? `<div class="co-tasks" data-cy-list>${list.map(card).join("")}</div>` : state.error ? "" : `<p class="asc-small asc-muted" data-cy-empty>Un bilan se prépare sur un programme envoyé ou clos.</p>`}</section>`;
    }
    async function load() {
      try {
        if (ended) {
          const r = await call(ctx, "athlete");
          state.reports = (r?.reports || []).filter((x) => x.link_state === "revoked");
          state.cycles = state.reports.map((x) => ({ plan_id: x.plan_id, title: `${x.plan?.title || ""}${x.coach_name ? ` · ${x.coach_name}` : ""}`, start_date: x.plan?.start_date, end_date: x.plan?.end_date, state: x.plan?.state }));
        } else {
          const r = await call(ctx, "link", { link_id: ctx.link.id });
          state.cycles = r?.cycles || []; state.reports = r?.reports || [];
        }
        state.error = "";
      } catch (e) {
        if (e.message === "STALE") return;
        if (e.message === "FEATURE_DISABLED") { slot.innerHTML = ""; return; }
        state.cycles = []; state.reports = []; state.error = human(e);
      }
      draw();
    }
    const changed = () => { load(); ctx.onChanged?.(); };

    /* ----- Coach: the report (working copy, hosted version) ----- */
    function editorHtml(draft) {
      const sess = (draft.sessions || []).map((s) => CY().session(s));
      const obsRow = (o) => `<fieldset class="co-cy-row" data-cy-obs data-key="${esc(o.key || "")}"><legend class="asc-sr">Constat</legend>
        <label class="asc-field"><span>Constat</span><textarea name="text" maxlength="300" rows="2" required>${esc(o.text || "")}</textarea></label>
        <details class="co-cy-sources"${(o.sources || []).length ? " open" : ""}><summary>Séances sources</summary><div class="co-cy-picks">${sess.map((v) => `<label class="auth-check"><input type="checkbox" name="source" value="${esc(v.key)}"${(o.sources || []).includes(v.key) ? " checked" : ""}><span>${esc(v.name)} · ${esc(v.label)}</span></label>`).join("")}</div></details>
        <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-cy-remove>Retirer ce constat</button></fieldset>`;
      const decRow = (x) => `<fieldset class="co-cy-row" data-cy-dec data-key="${esc(x.key || "")}"><legend class="asc-sr">Décision</legend>
        <div class="asc-form-grid"><label class="asc-field"><span>Type</span><select name="kind"><option value="goal"${x.kind !== "session" ? " selected" : ""}>Objectif du prochain cycle</option><option value="session"${x.kind === "session" ? " selected" : ""}>Séance à proposer</option></select></label>
        <label class="asc-field" data-cy-sport${x.kind === "session" ? "" : " hidden"}><span>Sport</span><select name="sport">${sportOptions(x.sport || "running")}</select></label></div>
        <label class="asc-field"><span>Décision</span><input class="asc-input" name="text" maxlength="140" required value="${esc(x.text || "")}"></label>
        ${x.state ? `<p class="asc-small asc-muted">Dernière réponse du sportif : ${esc(CY().decision(x).stateLabel)}. La reformuler demande une nouvelle réponse.</p>` : ""}
        <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-cy-remove>Retirer cette décision</button></fieldset>`;
      return { obsRow, decRow, html: `<form class="asc-stack" data-cy-editor novalidate>
        <section><h3 class="asc-h3">Mes constats</h3><p class="asc-small asc-muted">Une phrase par constat, reliée aux séances sur lesquelles il s’appuie.</p><div class="co-cp-rows" data-cy-obs-rows>${(draft.observations || []).map(obsRow).join("")}</div>
          <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-cy-add="obs">${icon("plus")} Ajouter un constat</button></section>
        <section><h3 class="asc-h3">Décisions pour la suite</h3><p class="asc-small asc-muted">Seules les décisions approuvées par ${esc(name)} seront reprises dans le cycle suivant.</p><div class="co-cp-rows" data-cy-dec-rows>${(draft.decisions || []).map(decRow).join("")}</div>
          <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-cy-add="dec">${icon("plus")} Ajouter une décision</button></section></form>` };
    }
    const collect = (body) => ({
      observations: [...body.querySelectorAll("[data-cy-obs]")].map((f) => ({ ...(f.dataset.key ? { key: f.dataset.key } : {}), text: f.querySelector("[name=text]").value, sources: [...f.querySelectorAll("[name=source]:checked")].map((i) => i.value) })),
      decisions: [...body.querySelectorAll("[data-cy-dec]")].map((f) => ({ ...(f.dataset.key ? { key: f.dataset.key } : {}), kind: f.querySelector("[name=kind]").value, text: f.querySelector("[name=text]").value, sport: f.querySelector("[name=sport]").value })),
    });

    function coachSheet(first) {
      const s = openSheet(ctx, { title: `Bilan · ${first.plan?.title || ""}` });
      let report = first;
      function render() {
        const h = CY().head(report, "coach"), draft = report.draft || {}, t = CY().totals(draft.totals, draft.sessions), pub = report.published;
        const editable = report.state !== "proposed" && report.can_act;
        const ed = editorHtml(draft);
        s.body.innerHTML = `<div class="asc-between"><span class="asc-chip" data-cy-state>${esc(h.stateLabel)}</span><span class="asc-small asc-muted">${esc(h.dates)}</span></div>
          ${h.returned ? `<p class="asc-note" data-cy-returned>${icon("info")}<span>${esc(h.returned)}</span></p>` : ""}
          ${report.hosted !== "none" ? `<section class="co-cy-hosted" data-cy-hosted="${esc(report.hosted)}" aria-labelledby="cy-h"><h3 class="asc-h3" id="cy-h">${esc(h.hostedLabel)}${h.versionText ? ` · ${esc(h.versionText)}` : ""}</h3><p class="asc-small">${esc(h.hostedText)}</p>
            ${pub ? `<details data-cy-pub-details${report.state === "published" ? " open" : ""}><summary>Lire la version validée par ${esc(name)}</summary>${publishedHtml(pub, "cy-pub", false)}</details>
              <div class="asc-row-flex">${h.exportAllowed ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-cy-export>${icon("download")} Télécharger un fichier</button>` : ""}
              ${report.next_plan ? "" : `<button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-cy-next>${icon("calendar")} Préparer le cycle suivant</button>`}</div>
              <p class="asc-small asc-faint" data-cy-export-notice>${h.exportAllowed ? esc(CY().EXPORT_NOTICE.coach) : `${esc(name)} n’a pas autorisé de fichier pour cette version : elle se lit ici.`}</p>` : ""}
            ${h.next ? `<p class="asc-small" data-cy-next-plan>${esc(h.next)}</p>` : ""}</section>` : ""}
          <section aria-labelledby="cy-w"><h3 class="asc-h3" id="cy-w">${report.state === "proposed" ? `Proposé à ${esc(name)}` : "Ma copie de travail"}</h3>
            <p class="asc-small asc-muted">${report.state === "proposed" ? `${esc(name)} relit, choisit ce qui est partagé et valide. Rien n’est partagé par la proposition.` : `Invisible pour ${esc(name)} tant que tu ne la proposes pas. Aucune note ni check-in n’y figure : ${esc(name)} les ajoute, s’il le souhaite, en validant.`}</p></section>
          ${figuresHtml(t, "cy-d")}${sessionsHtml(draft.sessions, "cy-d")}
          ${editable ? ed.html : contentHtml(draft.observations, draft.decisions, draft.sessions, "cy-d")}
          ${statusHtml}
          <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-cy-close>Fermer</button>
            ${report.state === "proposed" && report.can_act ? `<button type="button" class="asc-btn asc-btn-secondary" data-cy-recall>Reprendre le brouillon</button>` : ""}
            ${editable ? `<button type="button" class="asc-btn asc-btn-secondary" data-cy-save>Enregistrer le brouillon</button><button type="button" class="asc-btn asc-btn-primary" data-cy-propose>Proposer à ${esc(name)}</button>` : ""}</div>`;
        s.body._rows = ed;
      }
      // What was last saved: proposing again after a lost answer must not save a report the server already holds as proposed.
      let saved = null;
      const save = async () => {
        const content = collect(s.body), key = JSON.stringify(content);
        if (key === saved) return;
        report = (await call(ctx, "save", { id: report.id, revision: report.revision, ...content })).report;
        saved = key;
      };
      s.body.addEventListener("change", (e) => { if (e.target.name === "kind") e.target.closest("[data-cy-dec]").querySelector("[data-cy-sport]").hidden = e.target.value !== "session"; });
      s.body.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b || !s.body.contains(b)) return;
        if (b.hasAttribute("data-cy-close")) return s.d.close();
        if (b.hasAttribute("data-cy-remove")) return b.closest("fieldset").remove();
        if (b.dataset.cyAdd) {
          const rows = s.body.querySelector(b.dataset.cyAdd === "obs" ? "[data-cy-obs-rows]" : "[data-cy-dec-rows]");
          if (rows.children.length >= (b.dataset.cyAdd === "obs" ? 8 : 5)) return;
          rows.insertAdjacentHTML("beforeend", b.dataset.cyAdd === "obs" ? s.body._rows.obsRow({}) : s.body._rows.decRow({}));
          return rows.lastElementChild.querySelector("[name=text]").focus();
        }
        if (b.hasAttribute("data-cy-save")) return s.run(async () => { await save(); render(); toast({ type: "ok", title: "Brouillon enregistré", message: `Rien n’est visible pour ${name}.` }); load(); });
        if (b.hasAttribute("data-cy-propose")) return s.run(async () => {
          await save();
          // Retrying after a lost answer proposes the same revision: the server answers « already ».
          const r = await call(ctx, "propose", { id: report.id, revision: report.revision });
          report = r.report; render();
          toast({ type: "ok", title: r.already ? "Déjà proposé" : "Bilan proposé", message: `${name} choisit ce qui est partagé et valide.` });
          changed();
        });
        if (b.hasAttribute("data-cy-recall")) return s.run(async () => { report = (await call(ctx, "recall", { id: report.id, revision: report.revision })).report; saved = null; render(); changed(); });
        if (b.hasAttribute("data-cy-export")) return s.run(async () => {
          const x = await call(ctx, "export", { id: report.id });
          download(CY().exportFile(x));
          toast({ type: "ok", title: "Fichier téléchargé", message: "C’est une copie à la date d’aujourd’hui : elle ne suit pas les retraits faits ensuite en ligne." });
        });
        if (b.hasAttribute("data-cy-next")) { s.d.close(); return nextSheet(report); }
      });
      render();
    }
    function nextSheet(report) {
      const mondays = (window.TitanCoachProgram?.mondays?.(isoDay(), 9) || []).slice(1);
      const approved = (report.published?.decisions || []).map((x) => CY().decision(x)).filter((x) => x.approved);
      const s = openSheet(ctx, { title: "Préparer le cycle suivant", eyebrow: report.plan?.title || "" });
      s.body.innerHTML = `<p class="asc-small">Un brouillon de programme est créé pour ${esc(name)} à partir de ce cycle. Il reprend <strong>seulement</strong> ce que ${esc(name)} a approuvé, et garde d’où cela vient.</p>
        ${approved.length ? `<ul class="co-cy-list" data-cy-approved>${approved.map((x) => `<li><span class="asc-small asc-muted">${esc(x.kindLabel)}</span><br>${esc(x.text)}</li>`).join("")}</ul>` : `<p class="asc-small asc-muted" data-cy-approved>Aucune décision approuvée : le brouillon n’aura pas d’objectif repris.</p>`}
        <label class="asc-field"><span>Premier lundi du cycle</span><select name="start">${mondays.map((m) => `<option value="${m}">${esc(FU().day(m))}</option>`).join("")}</select></label>
        ${statusHtml}<div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-cy-close>Annuler</button><button type="button" class="asc-btn asc-btn-primary" data-cy-next-go>Créer le brouillon</button></div>`;
      s.body.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (b?.hasAttribute("data-cy-close")) return s.d.close();
        if (b?.hasAttribute("data-cy-next-go")) return s.run(async () => {
          const r = await call(ctx, "next", { id: report.id, start_date: s.body.querySelector("[name=start]").value });
          s.d.close();
          toast({ type: "ok", title: r.already ? "Brouillon déjà créé" : "Brouillon du cycle suivant créé", message: "Tu le retrouves dans les programmes : adapte-le puis envoie-le." });
          changed(); ctx.onPlans?.();
        });
      });
    }

    /* ----- Athlete: what the coach sees, and the dedicated validation ----- */
    function athleteSheet(first) {
      const s = openSheet(ctx, { title: `Bilan · ${first.plan?.title || ""}` });
      let report = first, validating = first.state === "proposed" && first.can_act, choice = null, op = null;
      function validationHtml() {
        const p = report.proposal, sess = (p.sessions || []);
        choice = choice || CY().choices(p);
        op = op || CY().opId();
        const dec = (p.decisions || []).map((x) => CY().decision(x));
        return `<div class="asc-stack" data-cy-validate>
          ${report.state === "proposed" ? "" : `<p class="asc-note">${icon("info")}<span>Tu modifies ce que tu partages : valider publie une nouvelle version, l’ancienne n’est plus lisible par ton coach.</span></p>`}
          ${contentHtml(p.observations, [], sess, "cy-v")}
          <fieldset class="co-fb-next" data-cy-answers><legend>Décisions proposées par ton coach</legend>${dec.length ? dec.map((x) => `<div class="co-cy-pick" data-cy-decision="${esc(x.key)}"><p><span class="asc-small asc-muted">${esc(x.kindLabel)}${x.sport ? ` · ${esc(x.sport)}` : ""}</span><br>${esc(x.text)}</p>
            <div class="asc-row-flex" role="radiogroup" aria-label="${esc(x.text)}"><label class="auth-check"><input type="radio" name="d-${esc(x.key)}" value="approve"><span>J’approuve</span></label><label class="auth-check"><input type="radio" name="d-${esc(x.key)}" value="decline"><span>Je ne retiens pas</span></label></div></div>`).join("") : `<p class="asc-small asc-muted">Aucune décision proposée.</p>`}
            <p class="asc-small asc-faint">Seules les décisions que tu approuves seront reprises dans ton prochain cycle.</p></fieldset>
          <fieldset class="co-fb-next" data-cy-share><legend>Ce que je partage dans ce bilan</legend>
            <p class="asc-small asc-muted">Tes notes et tes check-ins ne sont jamais ajoutés d’office : coche ceux que tu veux partager.</p>
            ${sessionsHtml(sess, "cy-v", (v, raw) => raw.measure ? `<div class="co-cy-picks"><label class="auth-check"><input type="checkbox" data-cy-pick="measures" value="${esc(v.key)}"${choice.measures[v.key] ? " checked" : ""}><span>Partager la mesure (${esc(v.measure)})</span></label>
              ${raw.note ? `<label class="auth-check"><input type="checkbox" data-cy-pick="notes" value="${esc(v.key)}"${choice.notes[v.key] ? " checked" : ""}${choice.measures[v.key] ? "" : " disabled"}><span>Partager aussi ma note : « ${esc(raw.note)} »</span></label>` : ""}</div>` : "")}
            ${(p.checkins || []).length ? `<h3 class="asc-h3">Mes check-ins de ces semaines</h3><div class="co-cy-picks">${p.checkins.map((c) => CY().checkin(c)).map((c) => `<label class="auth-check"><input type="checkbox" data-cy-pick="checkins" value="${esc(c.week)}"${choice.checkins[c.week] ? " checked" : ""}><span>${esc(c.label)} · ${esc(c.scores)}${c.note ? ` · « ${esc(c.note)} »` : ""}</span></label>`).join("")}</div>` : ""}
            <p class="asc-small" data-cy-share-summary aria-live="polite">${esc(CY().shareSummary(p, choice))}</p></fieldset>
          <fieldset class="co-fb-next"><legend>Fichier</legend><label class="auth-check"><input type="checkbox" name="allow_export"${report.allow_export ? " checked" : ""}><span>Autoriser ${esc(name)} à télécharger un fichier de cette version</span></label>
            <p class="asc-small asc-muted" data-cy-share-notice>${esc(CY().SHARE_NOTICE)}</p></fieldset>
          <label class="asc-field"><span>Mon mot sur ce cycle (facultatif, partagé avec le bilan)</span><input class="asc-input" name="note" maxlength="300"></label>
          <fieldset class="co-fb-next"><legend>Ce que ton coach verra est-il clair pour toi ? (facultatif)</legend><div class="asc-row-flex" role="radiogroup"><label class="auth-check"><input type="radio" name="understood" value="clear"><span>Oui, c’est clair</span></label><label class="auth-check"><input type="radio" name="understood" value="unsure"><span>Pas tout à fait</span></label></div></fieldset>
          ${statusHtml}
          <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-cy-close>Fermer</button>
            ${report.state === "proposed" ? `<button type="button" class="asc-btn asc-btn-secondary" data-cy-return>Renvoyer à ${esc(name)}</button>` : `<button type="button" class="asc-btn asc-btn-secondary" data-cy-back>Revenir à ma version</button>`}
            <button type="button" class="asc-btn asc-btn-primary" data-cy-validate-go>Valider et publier</button></div></div>`;
      }
      function readHtml() {
        const h = CY().head(report, "athlete"), pub = report.published;
        const ask = report.proposal && report.can_act && (report.state === "proposed" || ["withdrawn", "revalidate"].includes(report.hosted));
        return `<div class="asc-between"><span class="asc-chip" data-cy-state>${esc(h.hostedLabel || h.stateLabel)}</span><span class="asc-small asc-muted">${esc(h.dates)}</span></div>
          ${h.link ? `<p class="asc-small" data-cy-readonly>${icon("info")} ${esc(h.link)}</p>` : ""}
          ${report.hosted !== "none" ? `<p class="asc-small" data-cy-hosted-text>${esc(h.versionText)}${h.versionText ? " · " : ""}${esc(h.hostedText)}</p>` : ""}
          ${h.next ? `<p class="asc-small" data-cy-next-plan>${esc(h.next)}</p>` : ""}
          ${pub ? `<section aria-labelledby="cy-seen"><h3 class="asc-h3" id="cy-seen">${report.hosted === "online" ? "Ce que mon coach voit" : "La version que j’ai validée"}</h3>
            <p class="asc-small asc-muted">${report.hosted === "online" ? "Exactement ce que ton coach lit, ni plus ni moins. « Retirer » enlève l’élément de la version en ligne et des prochains fichiers." : "Ton coach ne lit pas cette version en ce moment."}</p>${publishedHtml(pub, "cy-pub", true)}</section>
            <section><h3 class="asc-h3">Fichiers</h3><p class="asc-small asc-muted" data-cy-share-notice>${esc(CY().SHARE_NOTICE)}</p>
              ${(report.exports || []).length ? `<ul class="co-history" data-cy-exports>${report.exports.map((x) => `<li data-role="${esc(x.role)}">${esc(CY().exportLine(x))}</li>`).join("")}</ul>` : `<p class="asc-small asc-muted" data-cy-exports>Aucun fichier téléchargé.</p>`}</section>
            <section><h3 class="asc-h3">Versions</h3><ol class="co-history" data-cy-versions>${(report.versions || []).map((v) => `<li>${esc(CY().versionLine(v))}</li>`).join("")}</ol></section>` : ""}
          ${statusHtml}
          <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-cy-close>Fermer</button>
            ${pub ? `<button type="button" class="asc-btn asc-btn-secondary" data-cy-export>${icon("download")} Télécharger mon fichier</button>` : ""}
            ${pub && report.hosted === "online" ? `<button type="button" class="asc-btn asc-btn-secondary" data-cy-withdraw>Retirer l’accès de mon coach</button>` : ""}
            ${report.proposal && report.can_act ? `<button type="button" class="asc-btn ${ask ? "asc-btn-primary" : "asc-btn-secondary"}" data-cy-revalidate>${report.state === "proposed" ? "Relire et valider" : ask ? "Valider à nouveau" : "Modifier ce que je partage"}</button>` : ""}</div>`;
      }
      const render = () => { s.body.innerHTML = validating && report.proposal ? validationHtml() : readHtml(); };
      const refresh = async () => { report = await call(ctx, "report", { id: report.id }); };
      s.body.addEventListener("change", (e) => {
        const kind = e.target.dataset?.cyPick;
        if (!kind || !choice) return;
        choice[kind][e.target.value] = e.target.checked;
        if (kind === "measures") {
          const note = s.body.querySelector(`[data-cy-pick="notes"][value="${CSS.escape(e.target.value)}"]`);
          if (note) { note.disabled = !e.target.checked; if (!e.target.checked) { note.checked = false; choice.notes[e.target.value] = false; } }
        }
        s.body.querySelector("[data-cy-share-summary]").textContent = CY().shareSummary(report.proposal, choice);
      });
      s.body.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b || !s.body.contains(b)) return;
        if (b.hasAttribute("data-cy-close")) return s.d.close();
        if (b.hasAttribute("data-cy-revalidate")) { validating = true; choice = null; op = null; return render(); }
        if (b.hasAttribute("data-cy-back")) { validating = false; return render(); }
        if (b.hasAttribute("data-cy-validate-go")) return s.run(async () => {
          const decisions = {};
          for (const el of s.body.querySelectorAll("[data-cy-answers] input[type=radio]:checked")) decisions[el.name.slice(2)] = el.value;
          // The op_id belongs to this reading: a retry after a lost answer replays the same validation and creates no second version.
          const r = await call(ctx, "validate", { id: report.id, ...CY().validation(report.proposal, choice, { opId: op, decisions, allowExport: s.body.querySelector("[name=allow_export]").checked,
            note: s.body.querySelector("[name=note]").value, understood: s.body.querySelector("[name=understood]:checked")?.value }) });
          report = r.report; validating = false; choice = null; op = null; render();
          toast({ type: "ok", title: r.already ? "Déjà validé" : `Bilan publié · version ${r.version}`, message: "Ton coach lit cette version. Tu peux en retirer un élément ou l’accès à tout moment." });
          changed();
        }).then(async () => {
          // A stale reading (the coach or the journal changed meanwhile): read again, keep the sheet open on the fresh proposal.
          if (validating && /changé depuis ta lecture/.test(s.body.querySelector("[data-cy-error]")?.textContent || "")) { try { await refresh(); choice = null; op = null; const msg = CY().message("COACH_CONFLICT"); render(); s.body.querySelector("[data-cy-error]").textContent = msg; } catch { /* the sheet keeps its message */ } }
        });
        if (b.hasAttribute("data-cy-return")) return window.titanShell.confirm({ title: `Renvoyer ce bilan à ${name} ?`, message: "Rien n’est publié. Ton coach le reprend en brouillon ; tu pourras le valider quand il te le proposera à nouveau.", confirmLabel: "Renvoyer",
          action: async () => { try { await call(ctx, "return", { id: report.id, note: s.body.querySelector("[name=note]")?.value || "" }); s.d.close(); changed(); } catch (x) { if (x.message !== "STALE") throw new Error(human(x)); } } });
        if (b.dataset.cyRetract) {
          const kind = b.dataset.cyRetract, key = b.dataset.key;
          return s.run(async () => {
            report = (await call(ctx, "retract", { id: report.id, items: [{ kind, key }] })).report; render();
            toast({ type: "ok", title: "Retiré de la version en ligne", message: "Les prochains fichiers ne le contiendront pas. Un fichier déjà téléchargé ne peut pas être repris." });
            changed();
          });
        }
        if (b.hasAttribute("data-cy-withdraw")) return window.titanShell.confirm({ title: "Retirer l’accès de ton coach ?", message: `${name} ne lira plus cette version dans TITAN, même avec un lien direct. Tu la gardes, et tu peux en publier une nouvelle en validant à nouveau. Un fichier déjà téléchargé ne peut pas être repris.`, confirmLabel: "Retirer l’accès",
          action: async () => { try { report = (await call(ctx, "withdraw", { id: report.id })).report; render(); changed(); } catch (x) { if (x.message !== "STALE") throw new Error(human(x)); } } });
        if (b.hasAttribute("data-cy-export")) return s.run(async () => {
          const x = await call(ctx, "export", { id: report.id });
          download(CY().exportFile(x)); await refresh(); render();
        });
      });
      render();
    }

    async function open(id) {
      try {
        const report = await call(ctx, "report", { id });
        (coach ? coachSheet : athleteSheet)(report);
      } catch (e) { if (e.message !== "STALE") { state.error = human(e); draw(); } }
    }
    slot.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b || !slot.contains(b) || !ctx.ok()) return;
      if (b.dataset.cyOpen) return open(b.dataset.cyOpen);
      if (b.dataset.cyStart) {
        b.disabled = true;
        try { const r = await call(ctx, "start", { plan_id: b.dataset.cyStart }); await load(); coachSheet(r.report); }
        catch (x) { if (x.message !== "STALE") { state.error = human(x); draw(); } }
      }
    });
    draw();
    load();
    return { reload: load, close: () => { for (const d of ctx.sheets) if (d.open) d.close(); } };
  }

  window.TitanCoachCycles = { mount };
})();
