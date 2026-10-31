/* TITAN 300 — Coaching: a private, explicit, revocable share between an athlete and a coach.
   Same server contract as before (titan_coach_portal): invitation code, consent, scope, revocation,
   proposals the athlete accepts. A coach never edits the athlete's journal. Shared sessions stay in memory. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const F = () => window.TitanFormat;
  const SP = () => window.TitanSports;
  const I = () => window.TitanInsights;
  const DAY = 86400000;
  const owner = () => window.state?.user?.id;
  const guest = () => !owner() || String(owner()).startsWith("guest_");
  const isoDay = (d = new Date()) => new Date(d).toISOString().slice(0, 10);
  const date = (v) => new Date(String(v).length === 10 ? v + "T12:00:00Z" : v).toLocaleDateString("fr-FR", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

  let root = null;
  let snapshot = null;
  let mode = "athlete";
  let selected = "";
  let sessions = null;
  let assignments = null;
  let loading = true;
  let error = "";
  let seq = 0;
  let detailSeq = 0;
  let fromDate = isoDay(Date.now() - 29 * DAY);
  let toDate = isoDay();

  // A view and every action retain the same owner, client and transition epoch.
  const context = () => ({ owner: owner(), client: window.titanClient, epoch: window.titanAccountTransition?.epoch });
  const sameContext = (job) => !!job && job.owner === owner() && job.client === window.titanClient && job.epoch === window.titanAccountTransition?.epoch && !guest() && !window.titanAccountTransition?.active;
  let viewContext = null;
  const sheets = new Set();
  function own(dialog) {
    sheets.add(dialog);
    dialog.addEventListener("close", () => sheets.delete(dialog), { once: true });
    return dialog;
  }
  function invalidate() {
    ++seq;
    ++detailSeq;
    snapshot = sessions = assignments = viewContext = null;
    selected = "";
    mode = "athlete";
    fromDate = isoDay(Date.now() - 29 * DAY);
    toDate = isoDay();
    error = "";
    loading = !guest();
    for (const dialog of sheets) {
      if (dialog.open) dialog.close();
      dialog.remove();
    }
    sheets.clear();
    render();
  }
  function requireContext(job) {
    if (sameContext(job)) return;
    // An obsolete completion must never erase a newer view.
    if (job === viewContext || (viewContext && !sameContext(viewContext))) invalidate();
    throw Error("ACCOUNT_CHANGED");
  }
  function activeView() {
    if (sameContext(viewContext)) return true;
    invalidate();
    return false;
  }
  function confirm(options) {
    const job = viewContext;
    if (!activeView()) return;
    const before = new Set(document.querySelectorAll("dialog"));
    let dialog;
    const result = window.titanShell.confirm({ ...options, action: async () => {
      requireContext(job);
      if (!dialog?.open || !dialog.isConnected) return;
      await options.action(job);
      requireContext(job);
    } });
    dialog = [...document.querySelectorAll("dialog")].find(d => !before.has(d));
    if (dialog) own(dialog);
    return result;
  }

  const MESSAGES = {
    AUTH_REQUIRED: "Connecte-toi pour utiliser le partage privé.",
    ACCOUNT_CHANGED: "Le compte a changé. Recharge cet espace.",
    INVITE_UNAVAILABLE: "Ce code est indisponible, expiré ou déjà utilisé.",
    INVITE_LIMIT: "Plusieurs invitations attendent déjà. Annule celles qui ne servent plus.",
    COACH_CAPACITY: "La capacité de suivi du coach est atteinte : 3 sportifs, 20 avec TITAN+.",
    ATHLETE_CAPACITY: "Cinq partages sont déjà actifs. Révoque ceux dont tu n’as plus besoin.",
    CONSENT_REQUIRED: "Le partage demande ton accord explicite.",
    COACH_CONFLICT: "Une modification plus récente existe. Actualise avant de recommencer.",
    SHARING_UNAVAILABLE: "Ce partage a été révoqué ou n’est plus accessible.",
    INVALID_PERIOD: "Vérifie la période et les dates de partage.",
    INVALID_SESSION: "Choisis une séance personnelle du même sport, dans la période autorisée et non archivée.",
    SESSION_ALREADY_LINKED: "Cette séance est déjà reliée à une proposition.",
    INVALID_TRANSITION: "Cette proposition a changé. Actualise son état.",
    ASSIGNMENT_LIMIT: "La limite de propositions de ce suivi est atteinte.",
  };
  const human = (e) => MESSAGES[e?.message] || (navigator.onLine ? "La demande n’a pas été confirmée. Réessaie." : "Hors ligne : le coaching revient avec le réseau.");

  async function rpc(action, data = {}, job = viewContext) {
    requireContext(job);
    const receipt = await job.client?.auth.getSession();
    requireContext(job);
    const session = receipt?.data?.session;
    if (receipt?.error || !session?.access_token || session?.user?.id !== job.owner) {
      invalidate();
      loading = false;
      error = MESSAGES.AUTH_REQUIRED;
      render();
      throw Error("AUTH_REQUIRED");
    }
    const response = await fetch(`${window.TITAN_SUPABASE_URL}/rest/v1/rpc/titan_coach_portal`, {
      method: "POST",
      headers: { apikey: window.TITAN_SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_action: action, p_data: data }),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    requireContext(job);
    if (!response.ok) throw Error(result.message || "UNAVAILABLE");
    return result;
  }

  const links = () => snapshot?.links?.filter((l) => (mode === "coach" ? l.coach_id === owner() : l.athlete_id === owner())) || [];
  const current = () => links().find((l) => l.id === selected);

  async function load() {
    if (viewContext && !sameContext(viewContext)) invalidate();
    if (guest() || window.titanAccountTransition?.active) return invalidate();
    const job = context();
    const s = ++seq;
    viewContext = job;
    try {
      const next = await rpc("snapshot", {}, job);
      if (s !== seq || !sameContext(job)) return;
      const prev = current();
      snapshot = next;
      viewContext = job;
      loading = false;
      error = "";
      if (!links().some((l) => l.id === selected)) selected = links()[0]?.id || "";
      if (prev?.id !== current()?.id || prev?.revision !== current()?.revision) {
        sessions = null;
        assignments = null;
      }
      render();
      if (selected) loadDetail();
    } catch (e) {
      if (!sameContext(job)) { if (viewContext === job || (viewContext && !sameContext(viewContext))) invalidate(); return; }
      if (s !== seq) return;
      snapshot = null;
      loading = false;
      error = human(e);
      render();
    }
  }

  async function loadDetail({ moreSessions = false, moreAssignments = false } = {}) {
    const job = viewContext;
    if (!activeView()) return;
    const link = current();
    if (!link) return;
    const s = ++detailSeq;
    try {
      const [logs, tasks] = await Promise.all([
        moreAssignments ? Promise.resolve(sessions) : rpc("sessions", { link_id: link.id, from_date: fromDate, to_date: toDate, offset: moreSessions ? sessions?.rows.length || 0 : 0 }, job),
        moreSessions ? Promise.resolve(assignments) : rpc("assignments", { link_id: link.id, offset: moreAssignments ? assignments?.rows.length || 0 : 0 }, job),
      ]);
      if (s !== detailSeq || !sameContext(job) || current()?.id !== link.id) return;
      if ((logs && logs.revision !== link.revision) || (tasks && tasks.revision !== link.revision)) {
        sessions = null;
        assignments = null;
        return load();
      }
      const merge = (old, add) => ({ ...add, rows: [...new Map([...(old?.rows || []), ...add.rows].map((r) => [r.id, r])).values()] });
      sessions = moreSessions ? merge(sessions, logs) : logs;
      assignments = moreAssignments ? merge(assignments, tasks) : tasks;
      error = "";
      render();
    } catch (e) {
      if (!sameContext(job)) { if (viewContext === job || (viewContext && !sameContext(viewContext))) invalidate(); return; }
      if (s !== detailSeq) return;
      sessions = null;
      assignments = null;
      error = human(e);
      if (e.message === "SHARING_UNAVAILABLE") snapshot = null;
      render();
    }
  }

  /* ---------- Forms in sheets ---------- */
  function formSheet({ title, eyebrow = "Coaching · partage privé", body, submit, onSubmit }) {
    const job = viewContext;
    if (!activeView()) return;
    const form = document.createElement("form");
    form.className = "asc-stack";
    form.innerHTML = `${body}${onSubmit ? '<p class="asc-small asc-muted" role="status" data-co-progress></p>' : ""}<p class="asc-small jr-edit-error" role="alert"></p>${onSubmit ? `<div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-cancel>Annuler</button><button type="submit" class="asc-btn asc-btn-primary">${esc(submit)}</button></div>` : `<button type="button" class="asc-btn asc-btn-secondary" data-cancel>Fermer</button>`}`;
    const d = own(window.titanShell.sheet({ title, eyebrow, body: form }));
    let pending = false;
    let controlStates = [];
    const progress = form.querySelector("[data-co-progress]");
    // Keep the live status outside the busy form so its update is not deferred.
    if (progress) {
      form.parentElement.classList.add("asc-stack");
      form.after(progress);
    }
    const errorText = form.querySelector(".jr-edit-error");
    const setPending = (value) => {
      pending = value;
      form.setAttribute("aria-busy", String(value));
      if (progress) progress.textContent = value ? "Envoi en cours…" : "";
      if (value) {
        controlStates = [...form.querySelectorAll("input, select, textarea, button"), d.querySelector("[data-close]")].map(control => [control, control.disabled]);
        controlStates.forEach(([control]) => { control.disabled = true; });
      } else controlStates.forEach(([control, disabled]) => { control.disabled = disabled; });
    };
    form.setAttribute("aria-busy", "false");
    // Block user dismissal while sending; account cleanup and preview chaining can still close().
    d.addEventListener("cancel", e => { if (pending) e.preventDefault(); });
    d.addEventListener("click", e => {
      if (pending && (e.target === d || e.target.closest?.("[data-close], [data-cancel]"))) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
    form.querySelector("[data-cancel]").addEventListener("click", () => d.close());
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!onSubmit || pending || !d.open || !d.isConnected) return;
      if (!sameContext(job)) { if (job === viewContext || (viewContext && !sameContext(viewContext))) invalidate(); return; }
      const btn = form.querySelector("[type=submit]");
      // Capture consent before disabling controls: disabled fields are excluded from FormData.
      const data = new FormData(form);
      errorText.textContent = "";
      setPending(true);
      try {
        await onSubmit(data, d, job);
        if (!sameContext(job)) return;
        if (d.open) d.close();
        load();
      } catch (err) {
        if (!sameContext(job)) { if (viewContext === job || (viewContext && !sameContext(viewContext))) invalidate(); return; }
        if (!d.open || !d.isConnected) return;
        errorText.textContent = human(err);
        setPending(false);
        if ([...document.querySelectorAll("dialog[open]")].at(-1) === d) btn.focus();
      }
    });
    return d;
  }

  const sportOptions = (sel) =>
    Object.keys(window.SPORTS_CONFIG || {})
      .map((k) => [k, SP().label(k)])
      .sort((a, b) => a[1].localeCompare(b[1], "fr"))
      .map(([k, l]) => `<option value="${esc(k)}" ${sel === k ? "selected" : ""}>${esc(l)}</option>`)
      .join("");

  const scopeFields = (l) => `<p class="asc-small">Le coach verra les <strong>dates, sports, mesures et durées</strong> des séances de ce périmètre et pourra te proposer des séances. Il ne peut pas modifier ton journal.</p>
    <div class="asc-form-grid"><label class="asc-field"><span>Partager à partir du</span><input class="asc-input" type="date" name="since_date" value="${esc(l?.since_date || isoDay())}" max="${isoDay()}" required></label>
    <label class="asc-field"><span>Sport</span><select name="sport"><option value="">Tous les sports</option>${sportOptions(l?.sport)}</select></label></div>
    <label class="auth-check"><input type="checkbox" name="share_details" ${l?.share_details ? "checked" : ""}><span>Aussi les séries, charges, répétitions, RIR et détails d’escalade.</span></label>
    <label class="auth-check"><input type="checkbox" name="share_notes" ${l?.share_notes ? "checked" : ""}><span>Aussi mes notes de séance.</span></label>`;
  const scopeData = (f) => ({ since_date: f.get("since_date"), sport: f.get("sport") || null, share_details: f.has("share_details"), share_notes: f.has("share_notes") });

  function join() {
    formSheet({
      title: "J’ai reçu une invitation",
      body: `<label class="asc-field"><span>Code privé du coach</span><input class="asc-input" name="token" autocomplete="off" autocapitalize="none" spellcheck="false" minlength="48" maxlength="48" required placeholder="48 caractères"></label><p class="asc-small asc-muted">Vérifie l’identité de la personne avant d’accepter. TITAN ne vérifie pas les qualifications d’un coach.</p>`,
      submit: "Vérifier le code",
      onSubmit: async (f, d, job) => {
        const token = String(f.get("token")).trim();
        const preview = await rpc("preview", { token }, job);
        if (!sameContext(job) || !d.open) return;
        d.close();
        formSheet({
          title: `Partager avec ${preview.coach_name || "ce coach"}`,
          body: `${scopeFields()}<label class="auth-check"><input type="checkbox" name="consent" required><span><strong>J’autorise ce coach</strong> à consulter les données choisies et à me proposer des séances. Révocable à tout moment.</span></label>`,
          submit: "Activer ce partage",
          onSubmit: async (data, _dialog, job) => {
            const r = await rpc("accept", { token, ...scopeData(data), consent: data.has("consent") }, job);
            if (!sameContext(job)) return;
            mode = "athlete";
            selected = r.id;
          },
        });
      },
    });
  }

  async function invite(btn) {
    const job = viewContext;
    if (!activeView()) return;
    btn.disabled = true;
    try {
      const r = await rpc("invite", {}, job);
      if (!sameContext(job)) return;
      const body = `<p class="asc-small">Transmets ce code à une seule personne. Elle choisira ce qu’elle accepte de partager. Il expire le ${esc(date(r.expires_at))} et ne sert qu’une fois.</p><label class="asc-field"><span>Code privé</span><input class="asc-input asc-num" readonly value="${esc(r.token)}" id="co-token"></label><button type="button" class="asc-btn asc-btn-secondary" id="co-copy">${icon("copy")} Copier</button>`;
      const dialog = formSheet({ title: "Ton invitation est prête", body });
      dialog.querySelector("#co-copy").addEventListener("click", () => {
        if (!sameContext(job) || !dialog.open) return;
        navigator.clipboard?.writeText(r.token).then(() => {
          if (sameContext(job) && dialog.open) window.titanShell.toast({ type: "ok", title: "Code copié" });
        }).catch(() => {});
      });
      load();
    } catch (e) {
      if (!sameContext(job)) { if (viewContext === job || (viewContext && !sameContext(viewContext))) invalidate(); return; }
      window.titanShell.toast({ type: "warn", message: human(e) });
    } finally {
      btn.disabled = false;
    }
  }

  function propose(copy) {
    const l = current();
    formSheet({
      title: copy ? "Réutiliser cette séance" : "Proposer une séance",
      body: `<label class="asc-field"><span>Nom</span><input class="asc-input" name="title" maxlength="100" required value="${esc(copy?.title || "")}" placeholder="Reprise · séance A"></label>
        <div class="asc-form-grid"><label class="asc-field"><span>Sport</span><select name="sport" required>${sportOptions(copy?.sport || l.sport || "running")}</select></label>
        <label class="asc-field"><span>Date prévue</span><input class="asc-input" type="date" name="planned_date" value="${isoDay()}" min="${isoDay(Date.now() - 7 * DAY)}" max="${isoDay(Date.now() + 366 * DAY)}" required></label></div>
        <label class="asc-field"><span>Consignes</span><textarea name="instructions" maxlength="2000" placeholder="Échauffement, blocs, intensité, retour au calme…">${esc(copy?.instructions || "")}</textarea></label>
        <p class="asc-small asc-muted">L’athlète accepte ou décline. Rien n’est ajouté à son journal sans lui.</p>`,
      submit: "Envoyer la proposition",
      onSubmit: (f, _dialog, job) => rpc("assign", { link_id: l.id, ...Object.fromEntries(f) }, job),
    });
  }

  function taskAction(task, status) {
    const l = current();
    if (status === "completed") {
      const logs = (I()?.active(window.state?.history || []) || window.state?.history || []).filter((x) => x.sport === task.sport && new Date(x.date) >= new Date(l.since_date + "T00:00:00Z") && new Date(x.date) >= new Date(task.created_at) - 7 * DAY);
      return formSheet({
        title: "Relier la séance réalisée",
        body: logs.length
          ? `<label class="asc-field"><span>Séance de ton journal</span><select name="session_id">${logs.map((x) => `<option value="${esc(x.id)}">${esc(SP().label(x.sport))} · ${esc(date(x.date))}</option>`).join("")}</select></label><p class="asc-small asc-muted">Le serveur vérifie qu’elle t’appartient et n’est reliée à aucune autre proposition.</p>`
          : `<p class="asc-small">Aucune séance de ${esc(SP().label(task.sport).toLowerCase())} récente dans ton journal. Enregistre-la d’abord.</p><a class="asc-btn asc-btn-primary" href="/training?sport=${encodeURIComponent(task.sport)}">Enregistrer la séance</a>`,
        submit: "Confirmer la réalisation",
        onSubmit: logs.length ? (f, _dialog, job) => rpc("assignment_status", { id: task.id, revision: task.revision, status, session_id: f.get("session_id") }, job) : null,
      });
    }
    const titles = { cancelled: "Annuler la proposition", accepted: "Accepter cette séance", declined: "Décliner cette séance" };
    confirm({
      title: titles[status],
      message: `${task.title} · ${date(task.planned_date)}`,
      detail: "Le statut sera visible par ton partenaire de suivi. Ton journal ne change pas.",
      action: (job) => rpc(status === "cancelled" ? "cancel_assignment" : "assignment_status", { id: task.id, revision: task.revision, status }, job).then(() => { if (sameContext(job)) return load(); }).catch((e) => {
        throw new Error(human(e));
      }),
    });
  }

  /* ---------- Rendering ---------- */
  function comparisonHtml() {
    const c = window.TitanCoachAnalysis?.compare({sessions, assignments, from:fromDate, to:toDate});
    if (!c?.available) {
      const reason = c?.reason === "incomplete"
        ? "Charge toutes les pages de séances et de propositions avant de comparer."
        : "La période sélectionnée et le partage doivent couvrir au moins 14 jours complets en UTC. Aucun accès antérieur au consentement n’est demandé.";
      return `<p class="asc-small asc-muted" data-ca-comparison-unavailable>Comparaison non disponible : ${esc(reason)}</p>`;
    }
    const signed = n => n > 0 ? `+${n}` : String(n);
    const duration = (a) => a.sessions === 0 ? "0 min" : a.minutes === null ? "Non disponible" : a.minutes === 0 ? "0 min" : F().duration(a.minutes);
    const durationChange = n => n === null ? "Durées incomplètes" : n === 0 ? "0 min" : `${n > 0 ? "+" : "−"}${F().duration(Math.abs(n))}`;
    const rate = a => a.adherencePercent === null ? "Aucune échéance" : `${a.adherencePercent} % (${a.completed}/${a.due})`;
    const periodHead = (_a, label) => `<th scope="col">${label}</th>`;
    return `<div class="co-analysis-programme co-comparison" data-ca-comparison><h4>Évolution · 7 jours complets</h4>
      <p class="asc-small asc-muted">Deux périodes consécutives de 7 jours en UTC, au sein du partage sélectionné. La journée en cours est exclue. Écarts absolus, sans objectif imposé ni diagnostic.</p>
      <p class="asc-small asc-muted">Précédente : ${esc(c.previous.from)} au ${esc(c.previous.to)}.<br>Récente : ${esc(c.current.from)} au ${esc(c.current.to)}.</p>
      <div class="co-analysis-table" tabindex="0" role="region" aria-label="Comparaison des périodes, tableau défilant"><table><caption>Dernière période complète et période précédente · données partagées chargées</caption>
      <thead><tr><th scope="col">Mesure</th>${periodHead(c.previous, "Précédente")}${periodHead(c.current, "Récente")}<th scope="col">Écart</th></tr></thead>
      <tbody><tr><th scope="row">Séances</th><td data-ca-previous-sessions>${c.previous.sessions}</td><td data-ca-current-sessions>${c.current.sessions}</td><td data-ca-session-delta>${signed(c.delta.sessions)}</td></tr>
      <tr><th scope="row">Jours actifs</th><td>${c.previous.activeDays}</td><td>${c.current.activeDays}</td><td>${signed(c.delta.activeDays)}</td></tr>
      <tr><th scope="row">Durée renseignée</th><td>${esc(duration(c.previous))}<small>${c.previous.measuredSessions}/${c.previous.sessions} renseignées</small></td><td>${esc(duration(c.current))}<small>${c.current.measuredSessions}/${c.current.sessions} renseignées</small></td><td>${esc(durationChange(c.delta.minutes))}</td></tr>
      <tr><th scope="row">Prévu / réalisé</th><td>${esc(rate(c.previous))}</td><td>${esc(rate(c.current))}</td><td>${c.delta.adherencePoints === null ? "Non comparable" : `${signed(c.delta.adherencePoints)} points`}</td></tr></tbody></table></div>
      ${c.sports.length ? `<div class="co-analysis-table" tabindex="0" role="region" aria-label="Évolution par sport, tableau défilant"><table data-ca-sport-trends><caption>Évolution par sport · séances et durée renseignée</caption><thead><tr><th scope="col">Sport</th><th scope="col">Précédente</th><th scope="col">Récente</th><th scope="col">Écart</th></tr></thead><tbody>${c.sports.map(s=>`<tr><th scope="row">${esc(s.sport === "unknown" ? "Sport non renseigné" : SP().label(s.sport))}</th><td>${s.previous.sessions} séance(s)<small>${esc(duration(s.previous))} · ${s.previous.measuredSessions}/${s.previous.sessions} renseignées</small></td><td>${s.current.sessions} séance(s)<small>${esc(duration(s.current))} · ${s.current.measuredSessions}/${s.current.sessions} renseignées</small></td><td>${signed(s.delta.sessions)} séance(s)<small>${esc(durationChange(s.delta.minutes))}</small></td></tr>`).join("")}</tbody></table></div>` : `<p class="asc-small asc-muted">Aucune séance dans ces deux périodes entièrement chargées.</p>`}
      <p class="asc-small asc-faint">Un écart de durée exige une durée renseignée pour chaque séance des deux périodes. Sans séance, 0 min décrit uniquement le journal partagé. Aucun pourcentage de hausse calculé depuis zéro. Le prévu/réalisé utilise les propositions acceptées échues, pas une estimation de l’effort.</p>
    </div>`;
  }

  function analysisHtml() {
    if (mode !== "coach" || !sameContext(viewContext) || !current() || !sessions || !assignments || window.titanFlags?.enabled?.("screens.coachanalysis", false) !== true) return "";
    const a = window.TitanCoachAnalysis?.analyse({sessions, assignments, from:fromDate, to:toDate});
    if (!a?.available) return "";
    const partial = !a.sessionComplete || !a.assignmentComplete;
    const knownDuration = value => value === null ? "Non disponible" : value === 0 ? "0 min" : F().duration(value);
    return `<section class="co-analysis" data-co-analysis aria-labelledby="co-analysis-title">
      <div><p class="asc-eyebrow cy">Analyse du suivi</p><h3 id="co-analysis-title">Bilan des données partagées</h3><p class="asc-small asc-muted">Du ${esc(date(a.from))} au ${esc(date(a.to))} · jours UTC · uniquement le partage de cet athlète.</p></div>
      ${partial ? `<p class="asc-note" data-ca-partial>${icon("info")}<span>Bilan partiel : ${a.sessionLoaded} / ${a.sessionTotal ?? "?"} séances et ${a.assignmentLoaded} / ${a.assignmentTotal ?? "?"} propositions chargées. Les chiffres portent sur les pages reçues ; charge la suite dans les listes pour les compléter.</span></p>` : ""}
      <dl class="co-analysis-stats"><div><dt>Séances dans la période</dt><dd data-ca-sessions>${a.sessions}</dd></div><div><dt>Durée renseignée</dt><dd data-ca-minutes>${esc(knownDuration(a.minutes))}</dd></div><div><dt>Jours avec séance</dt><dd>${a.activeDays}</dd></div></dl>
      <p class="asc-small asc-muted">${a.measuredSessions} séance(s) avec une durée · ${a.missingDuration} séance(s) sans durée exploitable. Aucune durée déduite des kilomètres, répétitions ou charges.</p>
      ${a.sports.length ? `<div class="co-analysis-table"><table data-ca-sports><caption>Répartition sur les séances partagées chargées</caption><thead><tr><th scope="col">Sport</th><th scope="col">Séances</th><th scope="col">Durée renseignée</th></tr></thead><tbody>${a.sports.map(s=>`<tr><th scope="row">${esc(s.sport === "unknown" ? "Sport non renseigné" : SP().label(s.sport))}</th><td>${s.sessions}</td><td>${esc(knownDuration(s.minutes))}<small>${s.measuredSessions} / ${s.sessions} renseignées</small></td></tr>`).join("")}</tbody></table></div>` : `<p class="asc-small asc-muted">Aucune séance partagée chargée dans cette période.</p>`}
      <div class="co-analysis-programme"><h4>Prévu / réalisé</h4><p data-ca-adherence>${a.assignmentComplete ? (a.due ? `<strong>${a.adherencePercent} %</strong> · ${a.completed} / ${a.due} propositions acceptées échues réalisées.` : "Aucune proposition acceptée arrivée à échéance.") : "Taux non disponible : charge toutes les propositions pour le calculer."}</p>
        <p class="asc-small asc-faint">Seulement les propositions acceptées dont le jour prévu précède aujourd’hui (UTC), dans la période sélectionnée. Une proposition refusée, annulée, en attente ou prévue aujourd’hui n’est pas un échec.</p></div>
      ${comparisonHtml()}
      <p class="asc-small asc-faint">Charge sRPE indisponible : le partage actuel ne transmet pas le ressenti. Ces durées ne sont ni une charge d’entraînement, ni des calories, ni de l’XP. Aucun accès supplémentaire ni donnée de santé déduite.</p>
    </section>`;
  }

  function refreshAnalysis() {
    const slot = root?.querySelector("[data-co-analysis-slot]");
    if (slot) slot.innerHTML = analysisHtml();
  }

  const LABELS = { proposed: "À accepter", accepted: "Prévue", declined: "Déclinée", completed: "Réalisée", cancelled: "Annulée" };
  function taskCards() {
    return (assignments?.rows || [])
      .map(
        (t) => `<article class="co-task" data-status="${esc(t.status)}"><div class="asc-between"><span class="asc-chip">${LABELS[t.status] || t.status}</span><span class="asc-small asc-muted">${esc(date(t.planned_date))}</span></div>
        <h3>${esc(t.title)}</h3><p class="asc-small asc-muted">${esc(SP().label(t.sport))}</p>${t.instructions ? `<p class="co-instructions">${esc(t.instructions)}</p>` : ""}
        <div class="asc-row-flex">${
          mode === "athlete"
            ? t.status === "proposed"
              ? `<button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-task="${esc(t.id)}" data-status="accepted">Accepter</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-task="${esc(t.id)}" data-status="declined">Décliner</button>`
              : t.status === "accepted"
                ? `<a class="asc-btn asc-btn-primary asc-btn-sm" href="/training?sport=${encodeURIComponent(t.sport)}">${icon("plus")} Enregistrer</a><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-task="${esc(t.id)}" data-status="completed">${icon("check")} Je l’ai faite</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-task="${esc(t.id)}" data-status="declined">Décliner</button>`
                : ""
            : ["proposed", "accepted"].includes(t.status)
              ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-task="${esc(t.id)}" data-status="cancelled">Annuler</button>`
              : `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-reuse="${esc(t.id)}">${icon("copy")} Réutiliser</button>`
        }</div>${t.status === "completed" ? `<p class="asc-small asc-faint">Reliée à une séance du journal. Une correction ou un archivage ultérieur se reflète ici.</p>` : ""}</article>`,
      )
      .join("");
  }

  function sessionRows() {
    return (sessions?.rows || [])
      .map((l) => {
        const m = window.TitanTraining.duration(l);
        const ex = I()?.strength?.([l]) || [];
        return `<details class="co-session"><summary><strong>${esc(SP().label(l.sport))}</strong><span class="asc-small asc-muted">${esc(date(l.date))} · ${esc(l.unit === "km" ? F().distance(l.val) : `${F().number(l.val)} ${l.unit || ""}`)}${m ? ` · ${esc(F().duration(m))}` : ""}</span></summary>
          ${ex.length ? `<ul class="jr-sets">${ex.map((e) => `<li>${esc(e.name)} · ${e.sets} séries${e.volume ? ` · ${esc(F().weight(e.volume))}` : ""}</li>`).join("")}</ul>` : ""}
          ${l.details?.extras?.grade_system ? `<p class="asc-small">${esc([l.details.extras.climbing_discipline, l.details.extras.grade_system, l.details.extras.belay, l.details.extras.max_done].filter(Boolean).join(" · "))}</p>` : ""}
          ${l.details?.bio?.rpe ? `<p class="asc-small">Ressenti ${esc(l.details.bio.rpe)}/10</p>` : ""}${l.details?.note ? `<p class="jr-note">${esc(l.details.note)}</p>` : ""}
          <p class="asc-small asc-faint">Mesures déclarées dans le journal. Aucune localisation n’est partagée.</p></details>`;
      })
      .join("");
  }

  function render() {
    if (!root) return;
    root.setAttribute("aria-busy", String(loading && !guest()));
    const focusedMode = root.contains(document.activeElement) ? document.activeElement.closest('[role="tab"][data-mode]')?.dataset.mode : null;
    if (guest()) {
      root.innerHTML = `<section class="asc-hero co-intro"><p class="asc-eyebrow cy">Sportifs · coachs · éducateurs</p><h2 class="cm-exp-title">Un suivi qui se construit à deux.</h2>
        <p class="asc-lead">Le coach crée une invitation. Le sportif choisit la période, le sport et les détails qu’il partage, et peut tout arrêter à tout moment. Le coach propose des séances ; le sportif les accepte ou non.</p>
        <div class="asc-row-flex"><a class="asc-btn asc-btn-primary" href="/login">Se connecter</a><a class="asc-btn asc-btn-ghost" href="/pour-les-coachs">Comment ça marche</a></div>
        <ul class="ob-promises"><li>${icon("user")}<span><strong>3 sportifs suivis gratuitement</strong>, 20 avec TITAN+. Le sportif n’a pas besoin d’abonnement.</span></li><li>${icon("lock")}<span><strong>Rien n’est partagé sans accord</strong> explicite, révocable.</span></li></ul></section>`;
      return;
    }
    if (loading) {
      root.innerHTML = `<div class="asc-skeleton" style="height:180px;border-radius:26px"></div>`;
      return;
    }
    const list = links();
    const l = current();
    root.innerHTML = `
      <div class="asc-seg co-mode" role="tablist" aria-label="Mon espace">${[["athlete", "user", "Je suis sportif"], ["coach", "group", "J’accompagne"]].map(([id, symbol, label]) => `<button type="button" role="tab" id="co-tab-${id}" data-mode="${id}" aria-controls="co-panel-${id}" aria-selected="${mode === id}" tabindex="${(focusedMode || mode) === id ? 0 : -1}">${icon(symbol)} ${label}</button>`).join("")}</div>
      <p class="asc-note">${icon("shield")}<span>Un partage choisi, limité et révocable. Le coach ne modifie jamais ton journal ; les séances partagées ne sont gardées qu’en mémoire.</span></p>
      <div id="co-panel-${mode}" role="tabpanel" aria-labelledby="co-tab-${mode}" tabindex="0" style="display:grid;gap:var(--s5)">
      ${error ? `<p class="asc-note err">${icon("alert")}<span>${esc(error)}</span></p>` : ""}
      ${snapshot ? `
      <section class="asc-section co-head"><div class="asc-between"><div><p class="asc-eyebrow">${mode === "coach" ? "Les sportifs que j’accompagne" : "Mes partages"}</p><h2 class="asc-h2">${mode === "coach" ? `${list.length} / ${snapshot.capacity} suivis` : `${list.length} partage${list.length > 1 ? "s" : ""} actif${list.length > 1 ? "s" : ""}`}</h2></div>
        <button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-${mode === "coach" ? "invite" : "join"}>${icon("plus")} ${mode === "coach" ? "Créer une invitation" : "J’ai reçu un code"}</button></div>
        ${mode === "coach" && snapshot.invites?.length ? `<details class="co-invites"><summary>${snapshot.invites.length} invitation(s) en attente</summary>${snapshot.invites.map((v) => `<div class="asc-between"><span class="asc-small">Créée le ${esc(date(v.created_at))} · expire le ${esc(date(v.expires_at))}</span><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-cancel-invite="${esc(v.id)}">Annuler</button></div>`).join("")}</details>` : ""}
      </section>
      ${list.length ? `<div class="co-layout${list.length === 1 ? " is-single" : ""}">
        ${list.length === 1 ? "" : `<nav class="co-people" aria-label="Suivis">`}${list.length === 1 ? "" : list.map((x) => `<button type="button" class="co-person" data-link="${esc(x.id)}" aria-pressed="${x.id === selected}">${icon(mode === "coach" ? "user" : "group")}<span><strong>${esc((mode === "coach" ? x.athlete_name : x.coach_name) || "Compte TITAN")}</strong><small>Depuis le ${esc(date(x.accepted_at))}</small></span></button>`).join("") + "</nav>"}
        ${l ? `<div class="co-detail">
          <section class="co-card"><div class="asc-between"><h3 class="asc-h3">${esc((mode === "coach" ? l.athlete_name : l.coach_name) || "Mon suivi")}</h3><span class="asc-chip">Partage actif</span></div>
            <p class="asc-small asc-muted">${list.length === 1 ? `Suivi depuis le ${esc(date(l.accepted_at))} · ` : ""}Partage depuis le ${esc(date(l.since_date))} · ${l.sport ? esc(SP().label(l.sport)) : "Tous les sports"} · ${l.share_details ? "détails techniques inclus" : "mesures essentielles"} · ${l.share_notes ? "notes incluses" : "notes privées"}</p>
            <div class="asc-row-flex">${mode === "athlete" ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-scope>${icon("settings")} Modifier mon partage</button>` : `<button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-propose>${icon("plus")} Proposer une séance</button>`}<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-revoke>Arrêter le partage</button></div></section>
          <section class="asc-section"><div class="asc-section-head"><h2>Séances proposées</h2><span class="asc-small asc-muted">${assignments ? `${assignments.total} au total` : "…"}</span></div>
            ${assignments ? (assignments.rows.length ? `<div class="co-tasks">${taskCards()}</div>${assignments.rows.length < assignments.total ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-more-tasks>Voir les précédentes</button>` : ""}` : `<p class="asc-small asc-muted">${mode === "coach" ? "Prépare une séance : l’athlète choisit de l’accepter." : "Aucune proposition pour le moment."}</p>`) : '<div class="asc-skeleton" style="height:80px"></div>'}</section>
          <section class="asc-section"><div class="asc-section-head"><h2>${mode === "coach" ? "Séances partagées" : "Ce que mon coach peut voir"}</h2></div>
            <form class="co-period" data-period><label class="asc-field"><span>Du</span><input class="asc-input" type="date" name="from" value="${fromDate}" max="${isoDay()}" required></label><label class="asc-field"><span>Au</span><input class="asc-input" type="date" name="to" value="${toDate}" max="${isoDay()}" required></label><button type="submit" class="asc-btn asc-btn-secondary">Appliquer</button></form><p class="asc-small asc-faint">Dates incluses · 366 jours au plus · le début réel respecte le consentement du sportif.</p>
            <div data-co-analysis-slot>${analysisHtml()}</div>
            ${sessions ? `<p class="asc-small asc-muted">${sessions.rows.length} séance(s) sur ${sessions.total}.</p>${sessions.rows.length ? `<div class="co-sessions">${sessionRows()}</div>` : '<p class="asc-small asc-muted">Aucune séance partagée sur cette période.</p>'}${sessions.rows.length < sessions.total ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-more-sessions>Charger la suite</button>` : ""}` : '<div class="asc-skeleton" style="height:80px"></div>'}
          </section></div>` : ""}
      </div>` : `<div class="asc-empty"><h2>${mode === "coach" ? "Prêt pour le premier suivi ?" : "Tu gardes la main."}</h2><p>${mode === "coach" ? "Crée une invitation et transmets le code à ton sportif. Aucun accès ne s’ouvre tant qu’il n’a pas choisi son partage." : "Ton journal reste privé. Seul un code accepté avec ton accord ouvre un suivi."}</p></div>`}` : ""}
      </div><div id="co-panel-${mode === "athlete" ? "coach" : "athlete"}" role="tabpanel" aria-labelledby="co-tab-${mode === "athlete" ? "coach" : "athlete"}" tabindex="-1" hidden></div>
      <p class="asc-small asc-faint co-foot">TITAN facilite l’organisation entre vous. Il ne vérifie pas les qualifications d’un coach et ses propositions ne sont pas un avis médical.</p>`;
    root.setAttribute("aria-busy", "false");
    if (focusedMode) root.querySelector(`[role="tab"][data-mode="${focusedMode}"]`)?.focus({ preventScroll: true });
  }

  function onTabKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tab = e.target.closest('[role="tab"][data-mode]');
    if (!tab || !root.contains(tab)) return;
    const tabs = [...root.querySelectorAll('.co-mode [role="tab"]')], index = tabs.indexOf(tab);
    const next = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    e.preventDefault();
    tabs.forEach((button, i) => { button.tabIndex = i === next ? 0 : -1; });
    tabs[next].focus();
  }

  function onTabExit(e) {
    if (!e.target.matches('[role="tab"][data-mode]') || (root.contains(e.relatedTarget) && e.relatedTarget?.closest('.co-mode'))) return;
    root.querySelectorAll('.co-mode [role="tab"]').forEach(tab => { tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1; });
  }

  function onClick(e) {
    const b = e.target.closest("button");
    if (!b || !root.contains(b) || !activeView()) return;
    if (b.dataset.mode) {
      mode = b.dataset.mode;
      selected = links()[0]?.id || "";
      sessions = null;
      assignments = null;
      render();
      if (selected) loadDetail();
      return;
    }
    if (b.hasAttribute("data-invite")) return invite(b);
    if (b.hasAttribute("data-join")) return join();
    if (b.dataset.link) {
      selected = b.dataset.link;
      sessions = null;
      assignments = null;
      const share = current();
      if (share && fromDate < share.since_date) fromDate = share.since_date;
      render();
      return loadDetail();
    }
    if (b.hasAttribute("data-scope")) {
      const l = current();
      return formSheet({ title: "Choisir ce que je partage", body: scopeFields(l), submit: "Enregistrer mes choix", onSubmit: (f, _dialog, job) => rpc("scope", { link_id: l.id, revision: l.revision, ...scopeData(f) }, job) });
    }
    if (b.hasAttribute("data-revoke")) {
      const l = current();
      return confirm({
        title: "Arrêter ce partage ?",
        message: `Le suivi avec ${(mode === "coach" ? l.athlete_name : l.coach_name) || "cette personne"} s’arrête. Les séances ne sont plus accessibles ; ton journal reste intact.`,
        confirmLabel: "Révoquer",
        danger: true,
        action: (job) => rpc("revoke", { link_id: l.id, revision: l.revision }, job).then(() => { if (!sameContext(job)) return; selected = ""; sessions = assignments = null; return load(); }).catch((err) => {
          throw new Error(human(err));
        }),
      });
    }
    if (b.hasAttribute("data-propose")) return propose();
    if (b.dataset.reuse) return propose(assignments?.rows.find((t) => t.id === b.dataset.reuse));
    if (b.dataset.task) return taskAction(assignments?.rows.find((t) => t.id === b.dataset.task), b.dataset.status);
    if (b.dataset.cancelInvite)
      return confirm({ title: "Annuler cette invitation ?", message: "Le code ne pourra plus être accepté. Les suivis actifs restent.", confirmLabel: "Annuler l’invitation", action: (job) => rpc("cancel_invite", { id: b.dataset.cancelInvite }, job).then(() => { if (sameContext(job)) return load(); }) });
    if (b.hasAttribute("data-more-tasks")) return loadDetail({ moreAssignments: true });
    if (b.hasAttribute("data-more-sessions")) return loadDetail({ moreSessions: true });
  }

  function onSubmit(e) {
    if (!e.target.matches("[data-period]")) return;
    e.preventDefault();
    if (!activeView()) return;
    const f = new FormData(e.target);
    fromDate = f.get("from");
    toDate = f.get("to");
    sessions = null;
    render();
    loadDetail();
  }

  let booted = false;
  function start() {
    root = document.getElementById("coaching");
    if (!root || !window.state?.user) return;
    if (booted) return;
    booted = true;
    SP()?.ensure?.();
    root.addEventListener("click", onClick);
    root.addEventListener("keydown", onTabKey);
    root.addEventListener("focusout", onTabExit);
    root.addEventListener("submit", onSubmit);
    render();
    load();
  }
  window.addEventListener("titan:account-changing", () => booted && invalidate());
  window.addEventListener("titan:flags-updated", () => booted && refreshAnalysis());
  window.addEventListener("titan:account-changed", () => booted && load());
  window.addEventListener("online", () => booted && load());
  document.addEventListener("visibilitychange", () => {
    if (!booted) return;
    if (!document.hidden) load();
    else {
      sessions = null;
      assignments = null;
    }
  });
  window.addEventListener("pagehide", () => {
    sessions = null;
    assignments = null;
    snapshot = null;
  });
  window.addEventListener("titan:history-updated", () => setTimeout(start, 0));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
