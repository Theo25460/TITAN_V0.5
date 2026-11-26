/* TITAN — V1.9.6 Suivi collectif individualisé. Mounted by coaching.js in the coach's space when screens.coach_groups is open; every call
   goes through public.titan_coach_group_v1, which re-checks each link (pause of capacity, revocation) at every read and every send.
   A private group of the coach's own links; a block prepared from a multi-week template; a version per athlete (start shifted, a weekday
   moved, a session moved or left out); the preview of who receives which version and who receives nothing, with the reason; a send that
   treats each athlete separately, whose op_id is kept until the answer arrives (a lost answer is replayed, never sent twice); the
   resumption of the incomplete sends; the group review (next action per athlete, the coach's load) with counts only — the details stay in
   each athlete's own view (« Ouvrir son suivi »). Nothing here writes an athlete's journal, and an athlete never sees a group. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const CG = () => window.TitanCoachGroup;
  const FN = "titan_coach_group_v1";
  const human = (e) => CG()?.message?.(e?.message) || window.TitanCoachProgram?.message?.(e?.message) || (navigator.onLine ? "La demande n’a pas été confirmée. Réessaie : rien ne sera envoyé deux fois." : "Hors ligne : rien n’est perdu, réessaie avec le réseau.");
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
  const isoDay = () => new Date().toISOString().slice(0, 10);
  const mondays = (n) => {
    const t = new Date(isoDay() + "T12:00:00Z");
    t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
    return Array.from({ length: n }, (_, i) => { const d = new Date(t); d.setUTCDate(d.getUTCDate() + 7 * (i + 1)); return d.toISOString().slice(0, 10); });
  };
  const dayOptions = (sel, blank) => (blank ? `<option value=""${sel ? "" : " selected"}>${esc(blank)}</option>` : "") + CG().DAYS.slice(1).map((d, i) => `<option value="${i + 1}"${Number(sel) === i + 1 ? " selected" : ""}>${esc(d)}</option>`).join("");
  const weekOptions = (n, sel) => Array.from({ length: n }, (_, i) => `<option value="${i + 1}"${Number(sel) === i + 1 ? " selected" : ""}>Semaine ${i + 1}</option>`).join("");
  // Kept across re-renders of the coaching page: the group open, and the op_id of a send whose answer has not arrived yet.
  const memory = { open: null, ops: new Map() };

  async function call(ctx, action, data = {}) {
    if (!ctx.ok()) throw Error("STALE");
    const r = await ctx.client.rpc(FN, { p_action: action, p_data: data });
    if (!ctx.ok()) throw Error("STALE");
    if (r.error) throw Error(r.error.message || "UNAVAILABLE");
    return r.data;
  }

  function sheet(ctx, { title, eyebrow = "Coaching · groupe", body, submit, onSubmit, wide = false }) {
    const form = document.createElement("form");
    form.className = "asc-stack";
    form.innerHTML = `${body}<p class="asc-small asc-muted" role="status" data-gr-progress></p><p class="asc-small jr-edit-error" role="alert" data-gr-error></p>
      <div class="asc-confirm-actions" data-gr-actions><button type="button" class="asc-btn asc-btn-secondary" data-cancel>${onSubmit ? "Annuler" : "Fermer"}</button>${onSubmit ? `<button type="submit" class="asc-btn asc-btn-primary" data-gr-submit>${esc(submit)}</button>` : ""}</div>`;
    const d = window.titanShell.sheet({ title, eyebrow, body: form });
    if (wide) d.classList.add("co-cp-wide");
    ctx.sheets.add(d);
    d.addEventListener("close", () => ctx.sheets.delete(d), { once: true });
    let pending = false;
    const progress = form.querySelector("[data-gr-progress]"), err = form.querySelector("[data-gr-error]");
    d.addEventListener("cancel", (e) => { if (pending) e.preventDefault(); });
    form.querySelector("[data-cancel]").addEventListener("click", () => { if (!pending) d.close(); });
    d.run = async (fn, label = "Envoi en cours…") => {
      if (pending || !d.open) return;
      pending = true; err.textContent = ""; progress.textContent = label; form.setAttribute("aria-busy", "true");
      const buttons = [...form.querySelectorAll("button")]; buttons.forEach((b) => { b.disabled = true; });
      try { return await fn(); } catch (x) {
        if (x.message === "STALE") { d.close(); return; }
        err.textContent = human(x);
      } finally {
        pending = false; progress.textContent = ""; form.setAttribute("aria-busy", "false"); buttons.forEach((b) => { b.disabled = false; });
      }
    };
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!onSubmit) return;
      d.run(async () => { const keep = await onSubmit(new FormData(form), d, form); if (keep !== true && d.open) d.close(); });
    });
    return d;
  }

  function mount(slot, ctx) {
    // ctx: { client, ok(), onChanged() }
    if (!slot || !CG()) return;
    ctx.sheets = new Set();
    const state = { groups: null, group: null, library: null, error: "" };
    const toast = (o) => window.titanShell?.toast?.(o);

    function memberLine(g) {
      return [`${g.members} membre${g.members > 1 ? "s" : ""}`, g.active < g.members ? `${g.active} actif${g.active > 1 ? "s" : ""}` : "", g.members - g.active > 0 ? `${g.members - g.active} en pause` : "",
        g.ended ? `${g.ended} suivi${g.ended > 1 ? "s" : ""} arrêté${g.ended > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ");
    }
    function reviewHtml(g) {
      const rv = CG().review(g);
      return `<section class="co-gr-review" data-gr-review aria-labelledby="gr-review-title"><h3 id="gr-review-title">Revue du groupe</h3>
        <p class="asc-small" data-gr-load><strong>${esc(rv.headline)}</strong>${rv.places ? ` · ${esc(rv.places)}` : ""}</p>
        <ul class="co-gr-members">${rv.rows.map((r) => `<li data-gr-member="${esc(r.link_id)}" data-next="${esc(r.next || r.state)}">
          <div class="asc-between"><strong>${esc(r.name)}</strong><span class="asc-chip${r.cases ? " is-warn" : ""}">${esc(r.short)}</span></div>
          ${r.label ? `<p class="asc-small">${esc(r.label)}</p>` : ""}${r.plan ? `<p class="asc-small asc-muted">${esc(r.plan)}</p>` : ""}
          ${!r.ended && !r.paused ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-link="${esc(r.link_id)}">Ouvrir son suivi</button>` : ""}</li>`).join("")}</ul>
        <p class="asc-small asc-faint">La revue ne montre que des comptes et des états. Les séances, les mesures et les notes restent dans le suivi de chaque sportif, selon ce qu’il partage.</p></section>`;
    }
    function groupHtml(g) {
      const busy = (g.dispatches || []);
      return `<article class="co-task co-gr-open" data-gr-open="${esc(g.id)}"><div class="asc-between"><h3>${esc(g.title)}</h3>
          <div class="asc-row-flex"><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-gr-edit>${icon("edit")} Membres</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-gr-delete>Supprimer le groupe</button></div></div>
        ${reviewHtml(g)}
        <section class="co-gr-blocks" aria-labelledby="gr-blocks-title"><div class="asc-between"><h3 id="gr-blocks-title">Blocs diffusés</h3><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-gr-prepare>${icon("plus")} Préparer un bloc</button></div>
          ${busy.length ? `<ul class="co-templates">${busy.map((d) => `<li data-gr-dispatch="${esc(d.id)}"><strong>${esc(d.title)}</strong> <span class="asc-small asc-muted">dès le ${esc(CG().day(d.start_date))} · ${d.sent}/${d.recipients} envoyés${d.failed ? ` · ${d.failed} à reprendre` : ""}${!d.first_sent_at ? " · pas encore envoyé" : d.completed_at ? " · complet" : ""}</span>
            <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-gr-dispatch-open="${esc(d.id)}">${d.failed && d.first_sent_at ? "Reprendre" : "Ouvrir l’aperçu"}</button></li>`).join("")}</ul>` : '<p class="asc-small asc-muted">Aucun bloc. Prépare-en un depuis un de tes modèles : chaque sportif reçoit sa propre version.</p>'}</section></article>`;
    }
    function draw() {
      if (!ctx.ok()) return;
      const list = state.groups?.groups || [];
      slot.innerHTML = `<section class="asc-section co-gr" data-gr aria-labelledby="gr-title"><div class="asc-section-head"><h2 id="gr-title">Groupes de suivi</h2>
        <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-gr-new>${icon("plus")} Créer un groupe</button></div>
        <p class="asc-small asc-muted">Un groupe rassemble des sportifs que tu suis déjà. Tu prépares un bloc une fois, tu l’adaptes pour chacun, tu vois qui recevra quelle version, puis tu envoies. Personne ne voit le groupe ni les autres sportifs.</p>
        ${state.error ? `<p class="asc-note err">${icon("alert")}<span>${esc(state.error)}</span></p>` : ""}
        ${state.groups === null && !state.error ? '<div class="asc-skeleton" style="height:56px"></div>' : list.length ? `<ul class="co-templates" data-gr-list>${list.map((g) => `<li data-gr-group="${esc(g.id)}"><strong>${esc(g.title)}</strong> <span class="asc-small asc-muted">${esc(memberLine(g))}${g.incomplete ? ` · ${g.incomplete} envoi${g.incomplete > 1 ? "s" : ""} incomplet${g.incomplete > 1 ? "s" : ""}` : ""}</span>
          <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-gr-toggle="${esc(g.id)}" aria-expanded="${memory.open === g.id}">${memory.open === g.id ? "Fermer" : "Ouvrir"}</button></li>`).join("")}</ul>` : '<p class="asc-small asc-muted" data-gr-empty>Aucun groupe pour le moment.</p>'}
        ${state.group && memory.open === state.group.id ? groupHtml(state.group) : ""}
        <p class="asc-small asc-faint">Les places de ton offre restent la règle : un suivi en pause ne reçoit rien, même depuis un groupe.</p></section>`;
    }

    async function load() {
      try {
        state.groups = await call(ctx, "groups");
        state.error = "";
        if (memory.open && !state.groups.groups.some((g) => g.id === memory.open)) memory.open = null;
        state.group = memory.open ? await call(ctx, "review", { id: memory.open }) : null;
      } catch (e) {
        if (e.message === "STALE") return;
        if (e.message === "FEATURE_DISABLED" || e.message === "COACH_ONLY") { slot.innerHTML = ""; return; }
        state.groups = state.groups || { groups: [] }; state.error = human(e);
      }
      draw();
    }
    const changed = () => { load(); ctx.onChanged?.(); };

    function groupSheet(g) {
      const links = state.groups?.links || [];
      const inGroup = new Set((g?.members || []).filter((m) => m.link_state !== "revoked").map((m) => m.link_id));
      sheet(ctx, {
        title: g ? `Membres de « ${g.title} »` : "Créer un groupe de suivi",
        body: `<label class="asc-field"><span>Nom du groupe</span><input class="asc-input" name="title" maxlength="60" required value="${esc(g?.title || "")}"></label>
          <fieldset class="asc-field co-gr-pick"><legend>Sportifs du groupe (30 au plus)</legend>${links.map((l) => `<label class="auth-check"><input type="checkbox" name="link" value="${esc(l.link_id)}"${inGroup.has(l.link_id) || (!g && false) ? " checked" : ""}> ${esc(l.name || "Compte TITAN")}${l.active ? "" : ' <span class="asc-small asc-muted">(en pause)</span>'}</label>`).join("") || '<p class="asc-small asc-muted">Aucun suivi en cours.</p>'}</fieldset>
          <p class="asc-small asc-muted">Le groupe est privé : seul toi le vois. Retirer un sportif du groupe ne retire rien de ce qu’il a déjà reçu.</p>`,
        submit: g ? "Enregistrer" : "Créer le groupe",
        onSubmit: async (f) => {
          const ids = f.getAll("link").map(String);
          const r = await call(ctx, g ? "edit_group" : "create_group", { ...(g ? { id: g.id, revision: g.revision } : {}), title: String(f.get("title") || ""), link_ids: ids });
          memory.open = r.id;
          toast({ type: "ok", title: g ? "Groupe enregistré" : "Groupe créé", message: `${ids.length} sportif${ids.length > 1 ? "s" : ""}.` });
          changed();
        },
      });
    }

    async function prepareSheet(g) {
      try { state.library = await ctx.client.rpc("titan_coach_program_v1", { p_action: "library", p_data: {} }).then((r) => { if (r.error) throw Error(r.error.message); return r.data; }); }
      catch (e) { toast({ type: "error", title: "Modèles indisponibles", message: human(e) }); return; }
      const lib = state.library?.programs || [];
      if (!lib.length) { toast({ type: "info", title: "Aucun modèle", message: "Crée d’abord un modèle multi-semaines depuis le suivi d’un sportif." }); return; }
      sheet(ctx, {
        title: `Préparer un bloc pour « ${g.title} »`,
        body: `<label class="asc-field"><span>Partir du modèle</span><select name="program">${lib.map((p) => `<option value="${esc(p.id)}">${esc(p.title)} · version ${p.version} · ${p.weeks} semaine(s)</option>`).join("")}</select></label>
          <label class="asc-field"><span>Premier lundi du bloc</span><select name="start">${mondays(8).map((m) => `<option value="${m}">${esc(CG().day(m))}</option>`).join("")}</select></label>
          <p class="asc-small asc-muted">Chaque sportif du groupe reçoit d’abord la version commune. Tu l’adaptes pour ceux qui ont un autre calendrier, tu vérifies l’aperçu, puis tu envoies. Rien n’est visible pour les sportifs avant l’envoi.</p>`,
        submit: "Préparer le bloc",
        onSubmit: async (f) => {
          const r = await call(ctx, "prepare", { group_id: g.id, program_id: String(f.get("program")), start_date: String(f.get("start")) });
          load();
          dispatchSheet(r.dispatch);
        },
      });
    }

    /* ----- The block: preview per athlete, variants, exclusion, send, results, resumption ----- */
    function dispatchSheet(initial) {
      let d = initial, results = null;
      const s = sheet(ctx, { title: `Bloc « ${initial.title} »`, eyebrow: "Coaching · diffusion", body: '<div data-gr-dispatch-body></div>', wide: true });
      const host = s.querySelector("[data-gr-dispatch-body]");
      const paint = () => {
        const pv = CG().preview(d), res = results ? CG().results(results) : null;
        host.innerHTML = `<p class="asc-small asc-muted">Du ${esc(CG().day(d.start_date))} · ${d.weeks} semaine(s) · ${(d.sessions || []).length} séances dans la version commune</p>
          <p data-gr-headline><strong>${esc(pv.headline)}</strong></p>
          ${pv.blocked.length ? `<p class="asc-small" data-gr-blocked>${icon("info")} ${pv.blocked.length} sportif${pv.blocked.length > 1 ? "s ne recevront" : " ne recevra"} rien : la raison est indiquée pour chacun.</p>` : ""}
          ${res ? `<section class="co-gr-results" data-gr-results aria-live="polite"><h3>Résultat de l’envoi</h3><p><strong>${esc(res.headline)}</strong></p>${res.note ? `<p class="asc-small">${esc(res.note)}</p>` : ""}
            <ul>${res.rows.map((r) => `<li data-gr-result="${esc(r.link_id)}" data-sent="${r.sent}"><strong>${esc(r.name)}</strong> · ${esc(r.label)}${r.text ? `<br><span class="asc-small asc-muted">${esc(r.text)}</span>` : ""}</li>`).join("")}</ul></section>` : ""}
          <ul class="co-gr-recipients">${pv.rows.map((r) => `<li data-gr-recipient="${esc(r.link_id)}" data-outcome="${esc(r.code)}">
            <div class="asc-between"><strong>${esc(r.name)}</strong><span class="asc-chip" data-tone="${esc(r.tone)}">${esc(r.label)}</span></div>
            ${r.ended ? "" : `<p class="asc-small">${esc(r.variant)}${r.start ? ` · du ${esc(r.start)} au ${esc(r.end)}` : ""}${r.session_count != null ? ` · ${r.session_count} séances` : ""}</p>`}
            ${r.text && !r.sent ? `<p class="asc-small asc-muted">${esc(r.text)}</p>` : ""}
            ${r.sessions.length ? `<details data-gr-version><summary>Voir la version de ${esc(r.name)}</summary><ol class="co-gr-sessions">${r.sessions.map((x) => `<li${x.moved ? ' data-moved="true"' : ""}>${esc(x.when)} · ${esc(x.title)}${x.moved ? " <em>(adaptée)</em>" : ""}</li>`).join("")}</ol>${r.removed.length ? `<p class="asc-small">Sans : ${esc(r.removed.join(", "))}</p>` : ""}</details>` : ""}
            ${!r.sent && !r.ended ? `<div class="asc-row-flex">${r.excluded ? "" : `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-gr-adapt="${esc(r.link_id)}">Adapter pour ${esc(r.name)}</button>`}
              <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-gr-exclude="${esc(r.link_id)}" data-on="${!r.excluded}">${r.excluded ? "Réintégrer" : "Laisser de côté"}</button></div>` : ""}
            ${!r.sent && r.ended ? `<div class="asc-row-flex"><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-gr-exclude="${esc(r.link_id)}" data-on="${!r.excluded}">${r.excluded ? "Réintégrer" : "Laisser de côté"}</button></div>` : ""}</li>`).join("")}</ul>
          <div class="asc-row-flex">${pv.can_send ? `<button type="button" class="asc-btn asc-btn-primary" data-gr-send>${pv.incomplete ? "Reprendre les envois incomplets" : "Envoyer"} (${pv.counts.ready} sportif${pv.counts.ready > 1 ? "s" : ""})</button>` : pv.complete ? `<p class="asc-small" data-gr-complete>${icon("check")} Bloc complet : chaque sportif a reçu sa version ou a été laissé de côté.</p>` : pv.incomplete ? `<p class="asc-small" data-gr-wait>Personne n’est prêt à recevoir pour l’instant. Les envois réussis restent faits ; tu pourras reprendre quand une place se libère.</p>` : ""}
            ${pv.incomplete && !pv.can_send ? `<button type="button" class="asc-btn asc-btn-secondary" data-gr-refresh>Revérifier l’aperçu</button>` : ""}</div>
          <p class="asc-small asc-faint">Chaque sportif ne verra que sa version, comme un programme ordinaire : il l’accepte ou non séance par séance. Un envoi réussi ne se répète jamais.</p>`;
      };
      paint();
      const reload = async () => { d = await call(ctx, "dispatch", { id: d.id }); paint(); };
      host.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b || !host.contains(b)) return;
        if (b.hasAttribute("data-gr-refresh")) return s.run(reload, "Vérification…");
        if (b.dataset.grAdapt) return variantSheet(d, d.recipients.find((r) => r.link_id === b.dataset.grAdapt), (next) => { d = next; results = null; paint(); });
        if (b.dataset.grExclude) return s.run(async () => { d = (await call(ctx, "variant", { id: d.id, revision: d.revision, link_id: b.dataset.grExclude, excluded: b.dataset.on === "true" })).dispatch; results = null; paint(); });
        if (b.hasAttribute("data-gr-send")) {
          return s.run(async () => {
            // The same op_id until the server's answer arrives: a lost answer is replayed, and the server writes nothing twice.
            let op = memory.ops.get(d.id);
            if (!op || op.key !== d.preview_key) { op = { id: uuid(), key: d.preview_key }; memory.ops.set(d.id, op); }
            let r;
            try { r = await call(ctx, "send", { id: d.id, preview_key: op.key, op_id: op.id }); } catch (x) {
              // Something changed since the preview (a version, a pause, an ended link): nothing was sent. Show the preview as it is now.
              if (x.message === "COACH_CONFLICT") { memory.ops.delete(d.id); d = await call(ctx, "dispatch", { id: d.id }); results = null; paint(); }
              throw x;
            }
            memory.ops.delete(d.id);
            results = r;
            d = await call(ctx, "dispatch", { id: d.id });
            paint();
            changed();
            host.querySelector("[data-gr-results]")?.focus?.();
          });
        }
      });
    }

    function variantSheet(d, r, done) {
      const v = r.variant || {};
      const days = [...new Set((d.sessions || []).map((x) => x.day))].sort();
      const moved = Object.fromEntries((v.moves || []).map((m) => [m.key, m]));
      const skip = new Set(v.skip || []);
      sheet(ctx, {
        title: `Version de ${r.name || "ce sportif"}`, wide: true,
        body: `<label class="asc-field"><span>Début du bloc</span><select name="shift">${[0, 1, 2, 3, 4].map((n) => `<option value="${n}"${Number(v.shift_weeks || 0) === n ? " selected" : ""}>${n ? `${n} semaine${n > 1 ? "s" : ""} plus tard` : "Comme le groupe"}</option>`).join("")}</select></label>
          <fieldset class="asc-field"><legend>Jours habituels</legend><div class="asc-form-grid">${days.map((x) => `<label class="asc-field"><span>Les séances du ${esc(CG().DAYS[x])}</span><select name="map-${x}">${dayOptions((v.day_map || {})[x] || x)}</select></label>`).join("")}</div></fieldset>
          <fieldset class="asc-field"><legend>Séance par séance</legend><ul class="co-gr-variant">${(d.sessions || []).map((x) => `<li data-gr-session="${esc(x.key)}"><label class="auth-check"><input type="checkbox" name="keep-${esc(x.key)}"${skip.has(x.key) ? "" : " checked"}> ${esc(x.title)}</label>
            <select name="week-${esc(x.key)}" aria-label="Semaine de ${esc(x.title)}">${weekOptions(d.weeks, moved[x.key]?.week || x.week)}</select>
            <select name="day-${esc(x.key)}" aria-label="Jour de ${esc(x.title)}">${dayOptions(moved[x.key]?.day || "", "Jour habituel")}</select></li>`).join("")}</ul></fieldset>
          <p class="asc-small asc-muted">Seule cette personne reçoit cette version. Les autres sportifs du groupe gardent la leur.</p>`,
        submit: "Enregistrer sa version",
        onSubmit: async (f) => {
          const map = Object.fromEntries(days.map((x) => [x, Number(f.get(`map-${x}`) || x)]));
          const keep = {}, place = {};
          for (const x of d.sessions || []) {
            keep[x.key] = f.get(`keep-${x.key}`) === "on";
            const week = Number(f.get(`week-${x.key}`) || x.week), dayPick = Number(f.get(`day-${x.key}`) || 0);
            if (dayPick || week !== x.week) place[x.key] = { week, day: dayPick || map[x.day] || x.day };
          }
          const variant = CG().variantFrom(d.sessions, { shift: Number(f.get("shift") || 0), map, keep, place });
          const res = await call(ctx, "variant", { id: d.id, revision: d.revision, link_id: r.link_id, variant });
          done(res.dispatch);
        },
      });
    }

    slot.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || !slot.contains(b) || !ctx.ok() || b.dataset.link) return;
      const g = state.group;
      if (b.hasAttribute("data-gr-new")) return groupSheet(null);
      if (b.dataset.grToggle) { memory.open = memory.open === b.dataset.grToggle ? null : b.dataset.grToggle; state.group = null; draw(); if (memory.open) load(); return; }
      if (!g) return;
      if (b.hasAttribute("data-gr-edit")) return groupSheet(g);
      if (b.hasAttribute("data-gr-prepare")) return prepareSheet(g);
      if (b.dataset.grDispatchOpen) return call(ctx, "dispatch", { id: b.dataset.grDispatchOpen }).then(dispatchSheet).catch((x) => toast({ type: "error", title: "Bloc indisponible", message: human(x) }));
      if (b.hasAttribute("data-gr-delete")) {
        return window.titanShell.confirm({ title: `Supprimer « ${g.title} » ?`, message: "Le groupe et ses blocs sont supprimés. Les programmes déjà reçus restent aux sportifs, avec leurs réponses : rien ne leur est retiré.", confirmLabel: "Supprimer le groupe",
          action: async () => { try { await call(ctx, "delete_group", { id: g.id }); memory.open = null; changed(); } catch (x) { if (x.message !== "STALE") throw new Error(human(x)); } } });
      }
    });
    draw();
    load();
    return { reload: load, close: () => { for (const d of ctx.sheets) if (d.open) d.close(); } };
  }

  window.TitanCoachGroups = { mount };
})();
