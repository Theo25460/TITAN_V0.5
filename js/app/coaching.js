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
  const FU = () => window.TitanCoachFollowup;
  const FB = () => window.TitanCoachFeedback;
  const RV = () => window.TitanCoachReview;
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
  // V1.9.1: the follow-up of proposals (titan_coach_followup_v1), only when screens.coach_followup is open.
  let follow = null; // Map id -> row of the selected link, as the server words it
  let queue = null, queueError = "", queueAction = "", queueLink = "", queueSeq = 0;
  // V1.9.2: feedback on sessions (titan_coach_feedback_v1), only when screens.coach_feedback is open. Map assignment id -> rows, as read now.
  let feedback = null;
  let directFeedback = /^#retour=([0-9a-f-]{36})$/i.exec(location.hash)?.[1] || "";
  // V1.9.3: the weekly review (titan_coach_review_v1), only when screens.coach_review is open. The week is a Paris Monday; "" = this week.
  let review = null, reviewError = "", reviewWeek = "", reviewFilter = "actionable", reviewSeq = 0;
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
    resetWorkspace();
    ++seq;
    ++detailSeq;
    snapshot = sessions = assignments = viewContext = follow = queue = feedback = review = null;
    queueError = queueAction = queueLink = reviewError = reviewWeek = "";
    reviewFilter = "actionable";
    ++queueSeq;
    ++reviewSeq;
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
    COACH_CAPACITY: "Toutes les places de suivi du coach sont prises. Un sportif peut quitter le suivi pour en libérer une.",
    SEAT_CHURN_LIMIT: "Trop de nouveaux suivis ces 30 derniers jours : réessaie plus tard, ou garde les sportifs actuels.",
    ATHLETE_CAPACITY: "Cinq partages sont déjà actifs. Révoque ceux dont tu n’as plus besoin.",
    CONSENT_REQUIRED: "Le partage demande ton accord explicite.",
    COACH_CONFLICT: "Une modification plus récente existe. Actualise avant de recommencer.",
    SHARING_UNAVAILABLE: "Ce partage a été révoqué ou n’est plus accessible.",
    COACH_CAPACITY_PAUSED: "Ce suivi est en pause : l’offre du coach n’a plus de place pour lui. Rien n’est supprimé ; il reprend dès qu’une place se libère ou que l’offre revient.",
    INVALID_PERIOD: "Vérifie la période et les dates de partage.",
    INVALID_SESSION: "Choisis une séance personnelle du même sport, dans la période autorisée et non archivée.",
    SESSION_ALREADY_LINKED: "Cette séance est déjà reliée à une proposition.",
    INVALID_TRANSITION: "Cette proposition a changé. Actualise son état.",
    ASSIGNMENT_LIMIT: "La limite de propositions de ce suivi est atteinte.",
  };
  const human = (e) => (e?.review && RV()?.message?.(e.message)) || MESSAGES[e?.message] || FB()?.message?.(e?.message) || FU()?.message?.(e?.message) || (navigator.onLine ? "La demande n’a pas été confirmée. Réessaie." : "Hors ligne : le coaching revient avec le réseau.");

  async function rpc(action, data = {}, job = viewContext, fn = "titan_coach_portal", raw = false) {
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
    const response = await fetch(`${window.TITAN_SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: window.TITAN_SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(raw ? data : { p_action: action, p_data: data }),
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
      loadQueue();
      loadReview();
      if (directFeedback && feedbackOn()) { const id = directFeedback; directFeedback = ""; openFeedback(id); }
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
      const [logs, tasks, rows, notes] = await Promise.all([
        moreAssignments ? Promise.resolve(sessions) : rpc("sessions", { link_id: link.id, from_date: fromDate, to_date: toDate, offset: moreSessions ? sessions?.rows.length || 0 : 0 }, job),
        moreSessions ? Promise.resolve(assignments) : rpc("assignments", { link_id: link.id, offset: moreAssignments ? assignments?.rows.length || 0 : 0 }, job),
        followOn() && !moreSessions ? rpc("list", { link_id: link.id, offset: moreAssignments ? assignments?.rows.length || 0 : 0 }, job, "titan_coach_followup_v1").catch(() => null) : Promise.resolve(null),
        feedbackOn() && !moreSessions ? rpc("list", { link_id: link.id }, job, FBN).catch(() => null) : Promise.resolve(null),
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
      if (rows?.link_id === link.id) {
        if (!moreAssignments || !follow) follow = new Map();
        for (const r of rows.rows || []) follow.set(r.id, r);
      } else if (!moreSessions) follow = null;
      // Feedback previews are rebuilt from this read only: what the athlete stopped sharing is gone from them.
      if (notes?.link_id === link.id) {
        feedback = new Map();
        for (const r of notes.rows || []) feedback.set(r.assignment?.id, [...(feedback.get(r.assignment?.id) || []), r]);
      } else if (!moreSessions) feedback = null;
      error = "";
      render();
    } catch (e) {
      if (!sameContext(job)) { if (viewContext === job || (viewContext && !sameContext(viewContext))) invalidate(); return; }
      if (s !== detailSeq) return;
      sessions = null;
      assignments = null;
      follow = null;
      feedback = null;
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
        onSubmit: logs.length ? (f, _dialog, job) => followOn()
          ? rpc("link", { id: task.id, revision: task.revision, session_id: f.get("session_id") }, job, "titan_coach_followup_v1").then((r) => { if (r && r.ok === false) throw Error(r.code); return r; })
          : rpc("assignment_status", { id: task.id, revision: task.revision, status, session_id: f.get("session_id") }, job) : null,
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

  const workspace = () => window.TitanCoachWorkspace;
  const feature = key => window.titanFlags?.enabled?.(key, false) === true;
  const coachView = () => mode === "coach" && sameContext(viewContext) && !!snapshot;
  let rosterQuery = "", rosterSport = "", calendarMonth = isoDay().slice(0,7), calendarStatus = "";
  let exportSeq = 0, exportTask = null, exportStatus = "", exportError = "";
  function cancelExport() { ++exportSeq; exportTask = null; exportStatus = exportError = ""; }
  function resetWorkspace() { rosterQuery = rosterSport = calendarStatus = ""; calendarMonth = isoDay().slice(0,7); cancelExport(); }
  function rosterResultsHtml() {
    const list = workspace()?.roster({links:snapshot?.links||[], owner:owner(), query:rosterQuery, sport:rosterSport}) || [];
    return `<p class="asc-small asc-muted" role="status">${list.length} suivi(s) affiché(s). Le filtre porte sur le sport autorisé, pas sur les séances pratiquées.</p>
      ${list.length ? `<div class="co-roster-grid">${list.map(l=>`<button type="button" class="co-person" data-link="${esc(l.id)}" aria-pressed="${l.id===selected}"><span><strong>${esc(l.athlete_name||"Compte TITAN")}</strong><small>${l.sport ? esc(SP().label(l.sport)) : "Tous les sports partagés"} · depuis le ${esc(date(l.since_date))}${l.paused ? " · en pause" : ""}</small></span></button>`).join("")}</div>` : `<p class="asc-small">Aucun suivi ne correspond à ces filtres.</p>`}`;
  }
  function rosterHtml() {
    if (!coachView() || !feature("screens.coachworkspace")) return "";
    const sports = [...new Set(links().map(l=>l.sport).filter(Boolean))].sort();
    return `<section class="co-card asc-stack" data-co-roster aria-labelledby="co-roster-title"><h2 id="co-roster-title" class="asc-h3">Mes athlètes</h2>
      <div class="asc-form-grid"><label class="asc-field"><span>Rechercher un athlète</span><input type="search" class="asc-input" id="co-roster-query" data-roster-query maxlength="80" value="${esc(rosterQuery)}"></label>
      <label class="asc-field"><span>Sport partagé</span><select id="co-roster-sport" data-roster-sport><option value="">Tous les sports</option>${sports.map(s=>`<option value="${esc(s)}"${s===rosterSport?" selected":""}>${esc(SP().label(s))}</option>`).join("")}</select></label></div>
      <div data-roster-results>${rosterResultsHtml()}</div><p class="asc-small asc-faint">Vue des partages actifs uniquement. Choisis un athlète pour lire son suivi ; aucun historique supplémentaire n’est chargé par les filtres.</p></section>`;
  }
  function calendarHtml() {
    if (!coachView() || !current() || !assignments || !feature("screens.coachcalendar")) return "";
    const c = workspace()?.calendar({assignments,month:calendarMonth,status:calendarStatus});
    if (!c?.available) return "";
    const title = new Date(calendarMonth+"-01T12:00:00Z").toLocaleDateString("fr-FR",{timeZone:"UTC",month:"long",year:"numeric"});
    return `<section class="co-card asc-stack" data-co-calendar aria-labelledby="co-calendar-title"><h3 id="co-calendar-title" class="asc-h3">Calendrier des propositions</h3>
      <div class="asc-row-flex co-calendar-nav"><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-calendar-move="-1" aria-label="Mois précédent"${workspace().shiftMonth(calendarMonth,-1)?"":" disabled"}>${icon("chevronLeft")} Précédent</button><strong aria-live="polite">${esc(title)}</strong><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-calendar-move="1" aria-label="Mois suivant"${workspace().shiftMonth(calendarMonth,1)?"":" disabled"}>Suivant ${icon("chevron")}</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-calendar-today>Mois actuel</button></div>
      <label class="asc-field"><span>Statut des propositions</span><select id="co-calendar-status" data-calendar-status><option value="">Tous les statuts</option>${Object.entries(LABELS).map(([key,label])=>`<option value="${key}"${calendarStatus===key?" selected":""}>${label}</option>`).join("")}</select></label>
      <p class="asc-small asc-muted">${c.complete?"Toutes les propositions chargées":"Calendrier partiel"} · ${c.loaded} / ${c.total??"?"} propositions chargées · dates UTC. ${c.complete?"":"Charge les précédentes dans la liste pour compléter ce calendrier."}</p>
      ${c.days.length ? `<div class="asc-stack">${c.days.map(d=>`<div class="co-calendar-day" data-calendar-day><h4>${esc(date(d.date))}</h4><ul>${d.rows.map(t=>`<li data-calendar-task><strong>${esc(t.title||"Séance proposée")}</strong><span class="asc-small asc-muted">${esc(SP().label(t.sport))} · ${esc(LABELS[t.status])}</span></li>`).join("")}</ul></div>`).join("")}</div>` : `<p class="asc-small">Aucune proposition parmi les données chargées pour ce mois et ce filtre.${c.complete?"":" Ce résultat ne décrit pas les pages encore absentes."}</p>`}
      <p class="asc-small asc-faint">Ce calendrier organise les propositions existantes. Une séance déclinée ou en attente n’est pas une séance manquée.</p></section>`;
  }
  function exportHtml() {
    if (!coachView() || !current() || !feature("screens.coachexport")) return "";
    return `<section class="co-card asc-stack" data-co-export aria-labelledby="co-export-title"><h3 id="co-export-title" class="asc-h3">Exporter ce suivi</h3>
      <p class="asc-small asc-muted">CSV des séances de la période appliquée, après nouvelle vérification du partage. Date UTC, sport, valeur/unité et durée renseignée uniquement ; notes, santé et localisation exclues.</p>
      <button type="button" class="asc-btn asc-btn-secondary" data-co-export-csv${exportTask?" disabled":""}>${icon("download")} Exporter les séances partagées (CSV)</button>
      <p class="asc-small asc-muted" role="status" data-export-status>${esc(exportStatus)}</p><p class="asc-small jr-edit-error" role="alert" data-export-error>${esc(exportError)}</p>
      <p class="asc-small asc-faint">Le fichier est privé. Une copie déjà téléchargée ne peut pas être rappelée après la révocation du partage ; conserve-la uniquement pour ce suivi.</p></section>`;
  }
  function refreshSlot(selector, html) {
    const slot = root?.querySelector(selector);
    if (!slot) return;
    const focus = slot.contains(document.activeElement) ? document.activeElement : null;
    const id=focus?.id, selection=focus&&typeof focus.selectionStart==="number"?[focus.selectionStart,focus.selectionEnd]:null;
    slot.innerHTML=html;
    const next=id?slot.querySelector(`#${id}`):null;
    if(next){next.focus({preventScroll:true});if(selection&&next.setSelectionRange)next.setSelectionRange(...selection);}
  }
  function refreshWorkspace() {
    if (!feature("screens.coachexport")) cancelExport();
    refreshSlot("[data-co-roster-slot]",rosterHtml());
    refreshSlot("[data-co-calendar-slot]",calendarHtml());
    refreshSlot("[data-co-export-slot]",exportHtml());
    const legacy=root?.querySelector("[data-co-legacy-nav]"),overview=mode==="coach"&&feature("screens.coachworkspace");
    if(legacy)legacy.hidden=overview;
    root?.querySelector(".co-layout")?.classList.toggle("is-single",links().length===1||overview);
  }
  async function exportCsv() {
    if (!coachView() || !current() || !feature("screens.coachexport") || exportTask) return;
    const job=viewContext, link={...current()}, from=fromDate, to=toDate, id=++exportSeq;
    exportTask=id;exportStatus="Vérification du partage…";exportError="";
    const alive=()=>exportTask===id&&exportSeq===id&&sameContext(job)&&mode==="coach"&&feature("screens.coachexport")&&current()?.id===link.id&&current()?.revision===link.revision&&fromDate===from&&toDate===to;
    const check=()=>{if(!alive())throw Error("EXPORT_CANCELLED");};
    const progress=message=>{check();exportStatus=message;refreshSlot("[data-co-export-slot]",exportHtml());};
    const checkSnapshot=s=>{
      const fresh=s?.links?.find(l=>l.id===link.id);
      if(s?.owner!==job.owner||!fresh||fresh.revoked_at||fresh.coach_id!==job.owner||fresh.athlete_id!==link.athlete_id||fresh.revision!==link.revision||fresh.since_date!==link.since_date||fresh.sport!==link.sport||fresh.share_details!==link.share_details||fresh.share_notes!==link.share_notes)throw Error("SHARING_UNAVAILABLE");
    };
    refreshSlot("[data-co-export-slot]",exportHtml());
    try {
      checkSnapshot(await rpc("snapshot",{},job));check();
      let envelope=null, rows=[];
      for(let page=0;page<100;page++){
        progress(`Lecture des séances partagées… ${rows.length} reçues.`);
        const next=await rpc("sessions",{link_id:link.id,from_date:from,to_date:to,offset:rows.length},job);check();
        if(next?.owner!==job.owner||next.link_id!==link.id||next.revision!==link.revision||!Array.isArray(next.rows)||next.rows.length>100||!Number.isSafeInteger(next.total)||next.total<0||next.total>10000||next.from_date<link.since_date)throw Error("EXPORT_INVALID");
        if(envelope&&(next.total!==envelope.total||next.from_date!==envelope.from_date||next.to_date!==envelope.to_date))throw Error("EXPORT_INVALID");
        envelope=next;rows.push(...next.rows);
        if(rows.length>next.total||(!next.rows.length&&rows.length<next.total))throw Error("EXPORT_INVALID");
        if(rows.length===next.total)break;
      }
      const result=workspace()?.csv({sessions:{...envelope,rows},owner:job.owner,linkId:link.id,revision:link.revision,from,to});
      if(!result?.available)throw Error("EXPORT_INVALID");
      progress("Dernière vérification du partage…");checkSnapshot(await rpc("snapshot",{},job));check();
      const url=URL.createObjectURL(new Blob([result.text],{type:"text/csv;charset=utf-8"}));
      const a=document.createElement("a");a.href=url;a.download=`titan-coach-${result.from}-${result.to}.csv`;
      try{document.body.append(a);a.click();}finally{a.remove();URL.revokeObjectURL(url);}
      exportStatus=`${result.count} séance(s) exportée(s).`;
    } catch(e) {
      if(alive()) { exportStatus="";exportError=e.message==="SHARING_UNAVAILABLE"?"Le partage a changé ou a été révoqué. Recharge ce suivi avant d’exporter.":"Export non confirmé : données incomplètes, modifiées ou indisponibles. Réessaie après actualisation."; }
    } finally {
      if(exportTask===id){exportTask=null;refreshSlot("[data-co-export-slot]",exportHtml());}
    }
  }

  /* ---------- V1.9.1 · Une séance assignée: the follow-up of proposals ---------- */
  const FN = "titan_coach_followup_v1";
  const followOn = () => feature("screens.coach_followup") && !!FU();
  const fuRow = (id) => follow?.get(id) || queue?.rows?.find((r) => r.id === id) || null;
  async function loadQueue() {
    if (mode !== "coach" || !followOn() || !snapshot) {
      ++queueSeq;
      queue = null; queueError = "";
      refreshSlot("[data-co-queue-slot]", "");
      return;
    }
    const job = viewContext;
    if (!activeView()) return;
    const s = ++queueSeq;
    try {
      const next = await rpc("queue", { action: queueAction || undefined, link_id: queueLink || undefined }, job, FN);
      if (s !== queueSeq || !sameContext(job) || mode !== "coach") return;
      if (next?.owner !== job.owner || !Array.isArray(next.rows)) throw Error("UNAVAILABLE");
      queue = next; queueError = "";
    } catch (e) {
      if (!sameContext(job) || s !== queueSeq) return;
      queue = null; queueError = e.message === "FEATURE_DISABLED" ? "" : human(e);
    }
    refreshSlot("[data-co-queue-slot]", queueHtml());
  }
  const datesHtml = (v) => v.dates.length ? `<dl class="co-dates">${v.dates.map((d) => `<div data-date="${esc(d.key)}"><dt>${esc(d.label)}</dt><dd>${esc(d.text)}</dd></div>`).join("")}</dl>` : "";
  const changesHtml = (v) => v.changes.length ? `<table class="co-diff" data-co-diff><caption>Ce qui change</caption><thead><tr><th scope="col">Élément</th><th scope="col">En vigueur</th><th scope="col">Proposé</th></tr></thead><tbody>${v.changes.map((c) => `<tr><th scope="row">${esc(c.label)}</th><td>${esc(c.before)}</td><td>${esc(c.after)}</td></tr>`).join("")}</tbody></table>` : "";
  function coachButtons(r, v, where) {
    const id = esc(r.id), b = [];
    if (where !== "dossier") b.push(`<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-fu-open="${id}">${icon("eye")} Ouvrir le dossier</button>`);
    if (v.can.includes("seen")) b.push(`<button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-fu-seen="${id}">${icon("check")} Prendre acte</button>`);
    if (v.can.includes("propose_change")) b.push(`<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-fu-change="${id}">${icon("edit")} ${r.state === "declined" ? "Proposer à nouveau" : "Suggérer un changement"}</button>`);
    if (v.can.includes("withdraw_change")) b.push(`<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-fu-withdraw="${id}">Retirer le changement</button>`);
    return b.join("");
  }
  function queueItem(r) {
    const v = FU().forCoach(r);
    return `<li class="co-queue-item" data-tone="${esc(v.tone)}" data-queue-row="${esc(r.id)}">
      <div class="asc-between"><span><strong>${esc(r.athlete_name || "Compte TITAN")}</strong> · ${esc(r.title)}</span><span class="asc-chip" data-state="${esc(r.state)}">${esc(v.label)}</span></div>
      <p class="asc-small asc-muted">${esc(SP().label(r.sport))}${FU().planLine?.(r) ? ` · <span data-plan-line>${esc(FU().planLine(r))}</span>` : ""}</p>${datesHtml(v)}
      <p class="asc-small" data-gap-text>${esc(v.text)}</p>
      <p class="asc-small co-next" data-next="${esc(v.next)}"><strong>${esc(v.nextLabel)}</strong>${v.advice ? ` · ${esc(v.advice)}` : ""}</p>
      ${changesHtml(v)}<div class="asc-row-flex">${coachButtons(r, v, "queue")}</div></li>`;
  }
  function queueHtml() {
    if (mode !== "coach" || !followOn() || !snapshot) return "";
    const head = `<div class="asc-between"><h2 id="co-queue-title" class="asc-h3">Décisions à prendre</h2>${queue ? `<span class="asc-small asc-muted" role="status">${queue.rows.length} dossier(s) affiché(s)</span>` : ""}</div>`;
    if (!queue) return `<section class="co-card co-queue asc-stack" data-co-queue aria-labelledby="co-queue-title">${head}${queueError ? `<p class="asc-note err">${icon("alert")}<span>${esc(queueError)}</span></p>` : '<div class="asc-skeleton" style="height:64px"></div>'}</section>`;
    const c = queue.counts || {}, all = (c.gap || 0) + (c.suggest || 0) + (c.wait || 0);
    const chips = [["", "Tout", all], ["gap", "Écarts à traiter", c.gap || 0], ["suggest", "À suggérer", c.suggest || 0], ["wait", "En attente du sportif", c.wait || 0]];
    const athletes = (snapshot.links || []).filter((l) => l.coach_id === owner());
    return `<section class="co-card co-queue asc-stack" data-co-queue aria-labelledby="co-queue-title">${head}
      <p class="asc-small asc-muted">Les propositions qui demandent une décision, la tienne ou celle du sportif. Une séance déclinée, déplacée ou en attente n’est pas un échec.</p>
      <div class="co-queue-filters asc-row-flex" role="group" aria-label="Filtrer par action">${chips.map(([k, l, n]) => `<button type="button" id="co-queue-f-${k || "all"}" class="asc-btn asc-btn-sm ${queueAction === k ? "asc-btn-primary" : "asc-btn-secondary"}" data-queue-action="${k}" aria-pressed="${queueAction === k}">${esc(l)} · ${n}</button>`).join("")}</div>
      ${athletes.length > 1 ? `<label class="asc-field"><span>Filtrer par sportif</span><select id="co-queue-link" data-queue-link><option value="">Tous les sportifs</option>${athletes.map((l) => `<option value="${esc(l.id)}"${queueLink === l.id ? " selected" : ""}>${esc(l.athlete_name || "Compte TITAN")}${l.paused ? " (en pause)" : ""}</option>`).join("")}</select></label>` : ""}
      ${queue.paused ? `<p class="asc-small" data-co-queue-paused>${icon("info")} ${queue.paused} suivi(s) en pause : leurs propositions restent illisibles tant qu’une place n’est pas libre. Rien n’est supprimé.</p>` : ""}
      ${queue.rows.length ? `<ul class="co-queue-list">${queue.rows.map(queueItem).join("")}</ul>` : `<p class="asc-small asc-muted" data-co-queue-empty>${queueAction || queueLink ? "Aucun dossier pour ce filtre." : "Rien à décider pour l’instant."}</p>`}
      <p class="asc-small asc-faint">Un rapprochement avec le journal est toujours confirmé par le sportif. Depuis cette file, rien n’écrit dans son journal.</p></section>`;
  }
  function versionHtml(v, empty) {
    if (!v) return `<p class="asc-small asc-muted">${esc(empty)}</p>`;
    return `<dl class="co-version"><div><dt>Nom</dt><dd>${esc(v.title || "—")}</dd></div><div><dt>Sport</dt><dd>${esc(SP().label(v.sport))}</dd></div><div><dt>Date</dt><dd>${esc(FU().day(v.planned_date))}</dd></div>${v.instructions ? `<div><dt>Consignes</dt><dd class="co-instructions">${esc(v.instructions)}</dd></div>` : ""}</dl>`;
  }
  function dossierBody(r) {
    const v = FU().forCoach(r), ver = FU().versions(r), a = ver.activity;
    const activity = !a ? `<p class="asc-small asc-muted">Aucune séance liée. Seul le sportif peut relier une séance de son journal.</p>`
      : a.in_scope === false ? `<p class="asc-small">Une séance est liée, mais le partage actuel ne te la montre pas (sport ou période hors du partage).</p>`
      : `<dl class="co-version"><div><dt>Faite le</dt><dd>${esc(FU().day(a.day))}</dd></div><div><dt>Sport</dt><dd>${esc(SP().label(a.sport))}</dd></div><div><dt>Mesure</dt><dd>${esc(a.unit === "km" ? F().distance(a.val) : `${F().number(a.val)} ${a.unit || ""}`)}${a.duration ? ` · ${esc(F().duration(a.duration))}` : ""}</dd></div></dl>`;
    return `<div class="asc-stack" data-co-dossier="${esc(r.id)}"><p><span class="asc-chip" data-state="${esc(r.state)}">${esc(v.label)}</span> <span class="asc-small">${esc(v.text)}</span></p>${datesHtml(v)}
      <p class="asc-small co-next" data-next="${esc(v.next)}"><strong>${esc(v.nextLabel || "Rien à décider")}</strong>${v.advice ? ` · ${esc(v.advice)}` : ""}</p>
      <section data-co-version="original"><h3 class="asc-h3">Original accepté</h3>${versionHtml(ver.original, "Pas encore acceptée.")}</section>
      <section data-co-version="correction"><h3 class="asc-h3">Correction${ver.correction ? (ver.correction.pending ? " · en attente du sportif" : " · acceptée") : ""}</h3>${ver.correction ? `${versionHtml(ver.correction)}${ver.correction.note ? `<p class="asc-small">Ton message : « ${esc(ver.correction.note)} »</p>` : ""}${changesHtml(v)}` : `<p class="asc-small asc-muted">Aucune correction.</p>`}</section>
      <section data-co-version="activity"><h3 class="asc-h3">Activité liée</h3>${activity}</section>
      <section><h3 class="asc-h3">Historique</h3><ol class="co-history" data-co-history>${FU().history(r).map((h) => `<li data-kind="${esc(h.kind)}"><span class="asc-small asc-muted">${esc(h.at)}</span> ${esc(h.text)}</li>`).join("")}</ol></section>
      <div class="asc-row-flex">${coachButtons(r, v, "dossier")}</div>
      <p class="asc-small asc-faint">Lecture seule pour le journal : ce dossier ne modifie jamais les séances du sportif.</p></div>`;
  }
  async function openDossier(id, btn) {
    const job = viewContext;
    if (!activeView()) return;
    if (btn) btn.disabled = true;
    try {
      const r = await rpc("detail", { id }, job, FN);
      if (!sameContext(job)) return;
      const d = formSheet({ title: r.title || "Proposition", eyebrow: "Dossier de la proposition", body: dossierBody(r) });
      d?.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b || !d.contains(b)) return;
        const act = b.dataset.fuSeen ? "seen" : b.dataset.fuChange ? "change" : b.dataset.fuWithdraw ? "withdraw" : "";
        if (!act) return;
        d.close();
        fuAction(act, r);
      });
    } catch (e) {
      if (!sameContext(job)) return;
      window.titanShell.toast({ type: "warn", message: human(e) });
    } finally { if (btn) btn.disabled = false; }
  }
  function proposeChange(r) {
    const cur = { title: r.title, sport: r.sport, planned_date: r.planned_date, instructions: r.instructions || "" };
    formSheet({
      title: r.state === "declined" ? "Proposer à nouveau" : "Suggérer un changement",
      body: `<p class="asc-small">La version acceptée reste en vigueur tant que le sportif n’a pas répondu. Il voit ce qui change et choisit.</p>
        <label class="asc-field"><span>Nom</span><input class="asc-input" name="title" maxlength="100" required value="${esc(cur.title)}"></label>
        <div class="asc-form-grid"><label class="asc-field"><span>Sport</span><select name="sport" required>${sportOptions(cur.sport)}</select></label>
        <label class="asc-field"><span>Date prévue</span><input class="asc-input" type="date" name="planned_date" value="${esc(cur.planned_date)}" min="${isoDay(Date.now() - 7 * DAY)}" max="${isoDay(Date.now() + 366 * DAY)}" required></label></div>
        <label class="asc-field"><span>Consignes</span><textarea name="instructions" maxlength="2000">${esc(cur.instructions)}</textarea></label>
        <label class="asc-field"><span>Un mot pour le sportif (facultatif)</span><input class="asc-input" name="note" maxlength="300" placeholder="Pourquoi ce changement"></label>`,
      submit: "Envoyer le changement",
      onSubmit: (f, _d, job) => {
        const data = { id: r.id, revision: r.revision };
        for (const k of Object.keys(cur)) { const v = String(f.get(k) ?? ""); if (v !== String(cur[k] ?? "")) data[k] = v; }
        if (String(f.get("note") || "").trim()) data.note = String(f.get("note")).trim();
        return rpc("propose_change", data, job, FN);
      },
    });
  }
  function fuAction(act, r) {
    if (!r) return;
    if (act === "change") return proposeChange(r);
    if (act === "withdraw") return confirm({ title: "Retirer ce changement ?", message: r.title, detail: "La version acceptée reste en vigueur. Le sportif ne verra plus la proposition de changement.", confirmLabel: "Retirer",
      action: (job) => rpc("withdraw_change", { id: r.id, revision: r.revision }, job, FN).then(() => { if (sameContext(job)) return load(); }).catch((e) => { throw new Error(human(e)); }) });
    if (act === "seen") return confirm({ title: "Prendre acte de cet écart ?", message: FU().forCoach(r).text || r.title, detail: "Le dossier quitte la file et y revient si la situation change. Le journal du sportif ne change pas.", confirmLabel: "Prendre acte",
      action: (job) => rpc("seen", { id: r.id, state_key: r.state_key }, job, FN).then(() => { if (sameContext(job)) return load(); }).catch((e) => { throw new Error(human(e)); }) });
    if (act === "accept_change" || act === "decline_change") {
      const v = FU().forAthlete(r);
      return confirm({ title: act === "accept_change" ? "Accepter ce changement ?" : "Garder ma version ?", message: v.changes.map((c) => `${c.label} : ${c.before} → ${c.after}`).join(" · ") || r.title,
        detail: act === "accept_change" ? "La nouvelle version remplace celle que tu avais acceptée ; l’ancienne reste dans l’historique." : "Ta version acceptée reste en vigueur. Ton coach voit ta réponse.",
        confirmLabel: act === "accept_change" ? "Accepter le changement" : "Garder ma version",
        action: (job) => rpc("answer_change", { id: r.id, revision: r.revision, accept: act === "accept_change" }, job, FN).then(() => { if (sameContext(job)) return load(); }).catch((e) => { throw new Error(human(e)); }) });
    }
  }

  /* ---------- V1.9.2 · Retour sur la séance ---------- */
  const FBN = "titan_coach_feedback_v1";
  const feedbackOn = () => feature("screens.coach_feedback") && !!FB();
  const obsHtml = (v) => `<section class="co-fb-obs" data-fb-observation><h3 class="asc-h3">Observation du coach</h3><p class="co-instructions">${esc(v.observation)}</p><p class="asc-small asc-muted">Écrite le ${esc(v.written)}</p></section>`;
  function fbSessionHtml(v) {
    return `<section class="co-fb-session" data-fb-session="${esc(v.state)}"><h3 class="asc-h3">${esc(v.heading || "Séance")}</h3>
      ${v.text ? `<p class="asc-small" data-fb-session-text>${esc(v.text)}</p>` : ""}
      ${v.measures.length ? `<dl class="co-version">${v.measures.map((m) => `<div data-measure="${esc(m.key)}"><dt>${esc(m.label)}</dt><dd>${esc(m.text)}</dd></div>`).join("")}</dl>` : ""}
      ${v.exercises.length ? `<ul class="co-fb-ex" data-fb-exercises>${v.exercises.map((e) => `<li><strong>${esc(e.name)}</strong>${e.summary ? ` · ${esc(e.summary)}` : ""}${e.sets.length ? `<br><span class="asc-small">${e.sets.map(esc).join(" · ")}</span>` : ""}</li>`).join("")}</ul>` : ""}
      ${v.extras.length ? `<p class="asc-small">${v.extras.map((x) => esc(x.text)).join(" · ")}</p>` : ""}
      ${v.note ? `<p class="jr-note" data-fb-note>${esc(v.note)}</p>` : ""}
      ${v.checkin ? `<p class="asc-small" data-fb-checkin>${esc(v.checkin)}</p>` : ""}
      ${v.hidden ? `<p class="asc-small asc-muted" data-fb-hidden>${icon("eyeOff")} ${esc(v.hidden)}</p>` : ""}
      ${v.corrected ? `<p class="asc-note" data-fb-corrected>${icon("info")}<span>${esc(v.corrected)}</span></p>` : ""}</section>`;
  }
  function fbAdjHtml(a) {
    if (!a) return `<section class="co-fb-adj" data-fb-adj-state="none"><h3 class="asc-h3">Proposition pour la suite</h3><p class="asc-small asc-muted">Aucune : ce retour est une observation.</p></section>`;
    return `<section class="co-fb-adj" data-fb-adj-state="${esc(a.state)}"><h3 class="asc-h3">Proposition pour la suite</h3>
      <p><span class="asc-chip" data-adj-state="${esc(a.state)}">${esc(a.label)}</span> <strong>${esc(a.heading)}</strong></p>
      ${a.changes.length ? `<table class="co-diff" data-fb-changes><caption>${a.kind === "new" ? "Séance proposée" : a.state === "accepted" ? "Ce qui a changé" : "Ce qui changerait"}</caption><thead><tr><th scope="col">Élément</th>${a.kind === "new" ? "" : '<th scope="col">Actuel</th>'}<th scope="col">Proposé</th></tr></thead><tbody>${a.changes.map((c) => `<tr><th scope="row">${esc(c.label)}</th>${a.kind === "new" ? "" : `<td>${esc(c.before)}</td>`}<td>${esc(c.after)}</td></tr>`).join("")}</tbody></table>` : ""}
      ${a.note ? `<p class="asc-small">Le mot du coach : « ${esc(a.note)} »</p>` : ""}<p class="asc-small" data-fb-adj-text>${esc(a.text)}</p></section>`;
  }
  function feedbackBody(r, role) {
    const v = role === "coach" ? FB().forCoach(r) : FB().forAthlete(r);
    const buttons = [];
    if (v.can.includes("accept")) buttons.push(`<button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-fb-act="accept">${icon("check")} Accepter l’ajustement</button>`, `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-fb-act="decline">Décliner</button>`);
    if (v.can.includes("read")) buttons.push(`<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-fb-act="read">Compris</button>`);
    if (v.can.includes("withdraw")) buttons.push(`<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-fb-act="withdraw">Retirer la proposition</button>`);
    return `<div class="asc-stack" data-co-feedback="${esc(r.id)}">${v.link ? `<p class="asc-note" data-fb-link>${icon("lock")}<span>${esc(v.link)}</span></p>` : ""}
      <p class="asc-small asc-muted">Sur « ${esc(r.assignment?.title || "")} »${v.relinked ? ` · ${esc(v.relinked)}` : ""}</p>
      ${obsHtml(v)}${fbAdjHtml(v.adjustment)}${fbSessionHtml(v.session)}
      ${buttons.length ? `<div class="asc-row-flex">${buttons.join("")}</div>` : ""}
      <p class="asc-small asc-faint">Lecture seule pour le journal : ${role === "coach" ? "tu ne modifies jamais les séances, les notes ni le check-in du sportif" : "ton coach ne modifie jamais tes séances, tes notes ni ton check-in"}. Les mesures affichées sont celles que le partage montre maintenant.</p></div>`;
  }
  function feedbackBlock(t) {
    if (!feedbackOn()) return "";
    const rows = feedback?.get(t.id) || [];
    const role = mode === "coach" ? "coach" : "athlete";
    const compose = role === "coach" && t.status === "completed" && t.session_id && !current()?.paused
      ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-fb-compose="${esc(t.id)}">${icon("edit")} Laisser un retour</button>` : "";
    if (!rows.length && !compose) return "";
    return `<div class="co-fb" data-co-fb="${esc(t.id)}">${rows.length ? `<ul class="co-fb-list">${rows.map((r) => {
        const a = r.adjustment;
        return `<li data-fb-row="${esc(r.id)}"><span class="asc-small" data-fb-preview>${esc(FB().preview(r, role))}</span>${a ? ` <span class="asc-chip" data-adj-state="${esc(a.state)}">${esc((FB().ADJ[a.state] || FB().ADJ.pending).label)}</span>` : ""} <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-fb-open="${esc(r.id)}">Ouvrir le retour</button></li>`;
      }).join("")}</ul>` : ""}${compose ? `<div class="asc-row-flex">${compose}</div>` : ""}</div>`;
  }
  // Drops a feedback the server no longer shows (revocation, pause): no copy of it stays in this page.
  function forgetFeedback(id) {
    if (!feedback) return;
    for (const [k, rows] of feedback) feedback.set(k, rows.filter((r) => r.id !== id));
  }
  async function openFeedback(id, btn) {
    const job = viewContext;
    if (!activeView() || !feedbackOn()) return;
    if (btn) btn.disabled = true;
    try {
      const r = await rpc("detail", { id }, job, FBN);
      if (!sameContext(job)) return;
      const role = snapshot?.links?.some((l) => l.id === r.link_id && l.coach_id === owner()) ? "coach" : "athlete";
      const d = formSheet({ title: role === "coach" ? "Mon retour sur la séance" : "Retour de mon coach", eyebrow: "Retour sur la séance", body: feedbackBody(r, role) });
      d?.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-fb-act]");
        if (!b || !d.contains(b)) return;
        d.close();
        feedbackAction(b.dataset.fbAct, r);
      });
    } catch (e) {
      if (!sameContext(job)) return;
      if (["SHARING_UNAVAILABLE", "COACH_CAPACITY_PAUSED"].includes(e.message)) { forgetFeedback(id); if (current()) render(); }
      window.titanShell.toast({ type: "warn", message: FB().message(e.message) || human(e) });
    } finally { if (btn) btn.disabled = false; }
  }
  function feedbackAction(act, r) {
    const call = (action, data) => (job) => rpc(action, { id: r.id, ...data }, job, FBN).then((x) => {
      if (x && x.ok === false) throw new Error(FB().message(x.code) || human({ message: x.code }));
      if (sameContext(job)) return load();
    }).catch((e) => { throw new Error(e.message && !/^[A-Z_]+$/.test(e.message) ? e.message : human(e)); });
    const a = FB().adjustment(r.adjustment, "athlete");
    if (act === "read") return confirm({ title: "Marquer ce retour comme compris ?", message: r.assignment?.title || "", detail: "Ton coach voit que tu l’as lu. Rien d’autre ne change.", confirmLabel: "Compris", action: call("read", {}) });
    if (act === "accept") return confirm({ title: "Accepter cet ajustement ?", message: a ? `${a.heading}${a.changes.length ? " · " + a.changes.map((c) => `${c.label} : ${c.after}`).join(" · ") : ""}` : "",
      detail: r.adjustment?.kind === "new" ? "La séance est ajoutée à tes propositions, déjà acceptée. Ton journal ne change pas." : "La proposition visée est mise à jour et reste acceptée ; sa première version reste dans l’historique. Ton journal ne change pas.",
      confirmLabel: "Accepter l’ajustement", action: call("answer", { revision: r.revision, accept: true }) });
    if (act === "decline") return confirm({ title: "Décliner cet ajustement ?", message: a?.heading || "", detail: "La suite reste comme prévu. Ton coach voit ta réponse.", confirmLabel: "Décliner", action: call("answer", { revision: r.revision, accept: false }) });
    if (act === "withdraw") return confirm({ title: "Retirer cette proposition ?", message: a?.heading || "", detail: "Ton observation reste dans le fil. Le sportif voit que la proposition est retirée.", confirmLabel: "Retirer", action: call("withdraw", { revision: r.revision }) });
  }
  function composeBody(c) {
    const v = FB().session(c.session, "coach");
    const targets = c.targets || [];
    const prev = (c.feedback || []).map((r) => `<li><span class="asc-small">${esc(FB().preview(r, "coach"))}</span> <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-fb-open="${esc(r.id)}">Ouvrir</button></li>`).join("");
    return `<div data-fb-compose-session>${fbSessionHtml(v)}</div>
      ${prev ? `<section><h3 class="asc-h3">Retours déjà laissés</h3><ul class="co-fb-list">${prev}</ul></section>` : ""}
      <label class="asc-field"><span>Observation : ce que tu as remarqué</span><textarea name="observation" maxlength="1000" required placeholder="Sur les mesures partagées : charges, répétitions, durée, ressenti…"></textarea></label>
      <fieldset class="co-fb-next asc-stack"><legend>Proposition pour la suite (facultatif)</legend>
        <p class="asc-small asc-muted">Une proposition reste à confirmer par le sportif. Rien ne change sans son accord.</p>
        <label class="asc-check"><input type="radio" name="next" value="" checked> Pas de proposition</label>
        ${targets.length ? `<label class="asc-check"><input type="radio" name="next" value="change"> Ajuster une séance prévue</label>
        <label class="asc-field"><span>Séance à ajuster</span><select name="target_id">${targets.map((t) => `<option value="${esc(t.id)}">${esc(t.title)} · ${esc(FU()?.day?.(t.planned_date) || t.planned_date)}</option>`).join("")}</select></label>` : ""}
        <label class="asc-check"><input type="radio" name="next" value="new"> Ajouter une nouvelle séance</label>
        <label class="asc-field"><span>Nom</span><input class="asc-input" name="title" maxlength="100"></label>
        <div class="asc-form-grid"><label class="asc-field"><span>Sport</span><select name="sport"><option value="">Sport inchangé</option>${sportOptions(null)}</select></label>
        <label class="asc-field"><span>Date</span><input class="asc-input" type="date" name="planned_date" min="${isoDay()}" max="${isoDay(Date.now() + 366 * DAY)}"></label></div>
        <label class="asc-field"><span>Consignes</span><textarea name="instructions" maxlength="2000"></textarea></label>
        <label class="asc-field"><span>Un mot pour le sportif (facultatif)</span><input class="asc-input" name="note" maxlength="300"></label>
        <p class="asc-small asc-faint">Pour un ajustement, ne remplis que ce qui change.</p></fieldset>`;
  }
  async function openCompose(id, btn) {
    const job = viewContext;
    if (!activeView() || !feedbackOn()) return;
    if (btn) btn.disabled = true;
    try {
      let c = await rpc("compose", { id }, job, FBN);
      if (!sameContext(job)) return;
      if (!c.linked) throw Error("NOT_LINKED");
      const d = formSheet({ title: c.assignment?.title || "Retour sur la séance", eyebrow: "Laisser un retour", body: composeBody(c), submit: "Envoyer le retour",
        onSubmit: async (f, dialog, j) => {
          const data = { id, session_key: c.session_key, observation: String(f.get("observation") || "") };
          const next = String(f.get("next") || "");
          if (next) {
            const adj = next === "change" ? { target_id: String(f.get("target_id") || "") } : {};
            for (const k of ["title", "sport", "planned_date", "instructions", "note"]) { const v = String(f.get(k) || "").trim(); if (v) adj[k] = v; }
            // A sport left « inchangé » is never sent for an adjustment; a new session takes the sport of the session commented.
            if (next === "new" && !adj.sport && c.assignment?.sport) adj.sport = c.assignment.sport;
            data.adjustment = adj;
          }
          try { return await rpc("give", data, j, FBN); }
          catch (e) {
            // The session, its correction or the sharing changed while writing: show what is shared now, keep the text, ask to resend.
            if (e.message === "SESSION_CHANGED") {
              c = await rpc("compose", { id }, j, FBN);
              const slot = dialog.querySelector("[data-fb-compose-session]");
              if (slot) slot.innerHTML = fbSessionHtml(FB().session(c.session, "coach"));
            }
            throw e;
          }
        } });
      d?.addEventListener("click", (e) => { const b = e.target.closest("button[data-fb-open]"); if (b && d.contains(b)) { d.close(); openFeedback(b.dataset.fbOpen); } });
    } catch (e) {
      if (!sameContext(job)) return;
      window.titanShell.toast({ type: "warn", message: human(e) });
    } finally { if (btn) btn.disabled = false; }
  }


  /* ---------- V1.9.3 · Revue de suivi: the weekly review of the coach ---------- */
  const RVN = "titan_coach_review_v1";
  const reviewOn = () => feature("screens.coach_review") && !!RV();
  const reviewCard = (linkId) => review?.cards?.find((c) => c.link_id === linkId) || null;
  async function loadReview() {
    if (mode !== "coach" || !reviewOn() || !snapshot) {
      ++reviewSeq;
      review = null; reviewError = "";
      refreshSlot("[data-co-review-slot]", "");
      return;
    }
    const job = viewContext;
    if (!activeView()) return;
    const s = ++reviewSeq;
    templatesCache = null;
    try {
      // Access and capacity are checked by the server at this read: a paused link comes back with its name only, a revoked one not at all.
      const next = await rpc("week", { week: reviewWeek || undefined, filter: reviewFilter }, job, RVN);
      if (s !== reviewSeq || !sameContext(job) || mode !== "coach") return;
      if (next?.owner !== job.owner || !Array.isArray(next.cards)) throw Error("UNAVAILABLE");
      review = next; reviewError = "";
    } catch (e) {
      if (!sameContext(job) || s !== reviewSeq) return;
      review = null; reviewError = e.message === "FEATURE_DISABLED" ? "" : human(e);
    }
    refreshSlot("[data-co-review-slot]", reviewHtml());
  }
  function reviewItem(card) {
    const v = RV().forCoach(card), id = esc(card.link_id), d = card.dossier;
    const b = [];
    if (v.can.includes("feedback") && feedbackOn() && d?.id) b.push(`<button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-rv-feedback="${esc(d.id)}">${icon("edit")} Laisser un retour</button>`);
    if (v.can.includes("resume")) b.push(`<button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-rv-prepare="${id}">${icon("check")} Reprendre la proposition préparée</button>`);
    if (v.can.includes("prepare")) b.push(`<button type="button" class="asc-btn ${card.next === "prepare" ? "asc-btn-primary" : "asc-btn-secondary"} asc-btn-sm" data-rv-prepare="${id}">${icon("plus")} Préparer la suite</button>`);
    if (v.can.includes("open") && followOn() && d?.id) b.push(`<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-rv-open="${esc(d.id)}">${icon("eye")} Ouvrir le dossier</button>`);
    return `<li class="co-queue-item co-review-item" data-tone="${esc(v.tone)}" data-rv-card="${id}" data-rv-next="${esc(v.next)}">
      <div class="asc-between"><strong>${esc(v.name)}</strong><span class="asc-chip" data-next="${esc(v.next)}">${esc(v.label)}</span></div>
      <p class="asc-small" data-rv-dossier>${esc(v.text)}</p>
      ${d && FU().planLine?.(d) ? `<p class="asc-small asc-muted" data-rv-plan>${esc(FU().planLine(d))}</p>` : ""}
      ${v.source ? `<p class="asc-small asc-muted" data-rv-source><strong>Source</strong> · ${esc(v.source)}</p>` : ""}
      ${v.checkin ? `<p class="asc-small" data-rv-checkin>${icon("info")} Check-in partagé · ${esc(v.checkin)}</p>` : ""}
      ${v.previous.length ? `<p class="asc-small" data-rv-previous><strong>Décision sur la revue précédente</strong> · ${v.previous.map(esc).join(" ; ")}</p>` : ""}
      ${v.sent.length ? `<p class="asc-small" data-rv-sent>${icon("check")} ${v.sent.map(esc).join(" ; ")}</p>` : ""}
      ${b.length ? `<div class="asc-row-flex">${b.join("")}</div>` : ""}</li>`;
  }
  function reviewHtml() {
    if (mode !== "coach" || !reviewOn() || !snapshot) return "";
    const week = review?.week || reviewWeek, cur = review?.current_week;
    const head = `<div class="asc-between"><h2 id="co-review-title" class="asc-h3">Revue de la semaine</h2>${review ? `<span class="asc-small asc-muted" role="status" data-rv-status>${esc(RV().summary(review.counts))}</span>` : ""}</div>`;
    if (!review) return `<section class="co-card co-queue asc-stack" data-co-review aria-labelledby="co-review-title">${head}${reviewError ? `<p class="asc-note err">${icon("alert")}<span>${esc(reviewError)}</span></p>` : '<div class="asc-skeleton" style="height:64px"></div>'}</section>`;
    const c = review.counts || {};
    const nav = `<div class="asc-row-flex co-calendar-nav" role="group" aria-label="Changer de semaine">
        <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-rv-week="${esc(RV().addDays(week, -7))}"${RV().addDays(week, -7) < RV().addDays(cur, -56) ? " disabled" : ""}>${icon("chevronLeft")} Semaine précédente</button>
        <span class="co-rv-week" aria-live="polite" data-rv-week-label>${esc(RV().weekLabel(week))}</span>
        ${week !== cur ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-rv-week="">Cette semaine</button>` : ""}
        <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-rv-week="${esc(RV().addDays(week, 7))}"${RV().addDays(week, 7) > RV().addDays(cur, 7) ? " disabled" : ""}>Semaine suivante ${icon("chevron")}</button></div>`;
    const filters = `<div class="co-queue-filters asc-row-flex" role="group" aria-label="Filtrer la revue">${[["actionable", "À traiter", c.actionable || 0], ["all", "Tous les sportifs", c.athletes || 0]].map(([k, l, n]) => `<button type="button" id="co-rv-f-${k}" class="asc-btn asc-btn-sm ${reviewFilter === k ? "asc-btn-primary" : "asc-btn-secondary"}" data-rv-filter="${k}" aria-pressed="${reviewFilter === k}">${esc(l)} · ${n}</button>`).join("")}</div>`;
    const active = review.cards.filter((x) => x.link_state !== "paused"), paused = review.cards.filter((x) => x.link_state === "paused");
    const empty = !c.athletes ? "Aucun sportif suivi pour l’instant : crée une invitation pour commencer. La revue reste disponible." : reviewFilter === "actionable" ? `Rien à traiter de ton côté${c.wait ? ` : ${c.wait} réponse(s) attendue(s) du sportif` : ""}. « Tous les sportifs » montre chaque dossier.` : "Rien à traiter cette semaine.";
    return `<section class="co-card co-queue asc-stack" data-co-review aria-labelledby="co-review-title">${head}
      <p class="asc-small asc-muted">Pour chaque sportif : le dossier à traiter, l’action suivante et sa source. Une proposition préparée ne part qu’avec ton envoi ; le sportif répond dans son espace et sa décision revient dans la revue suivante.</p>
      ${nav}${filters}
      ${active.length ? `<ul class="co-queue-list" data-rv-list>${active.map(reviewItem).join("")}</ul>` : `<p class="asc-small asc-muted" data-rv-empty>${esc(empty)}</p>`}
      ${paused.length ? `<p class="asc-small" data-rv-paused>${icon("info")} En pause, faute de place dans ton offre : ${paused.map((x) => esc(x.name || "Compte TITAN")).join(", ")}. Rien n’est lu ni envoyé ; rien n’est supprimé.</p>` : ""}
      <p class="asc-small asc-faint">L’accès et les places de ton offre sont revérifiés à chaque lecture et à chaque envoi. La revue n’écrit jamais dans le journal du sportif.</p></section>`;
  }
  let templatesCache = null;
  async function reviewTemplates(job) {
    if (templatesCache?.owner === job.owner) return templatesCache.rows;
    const rows = await rpc("", {}, job, "titan_coach_templates_v1", true).catch(() => []);
    templatesCache = { owner: job.owner, rows: Array.isArray(rows) ? rows : [] };
    return templatesCache.rows;
  }
  // Step 1: choose the basis (a template, the last proposal, a blank page) and the date; or edit a prepared draft.
  async function openPrepare(card, btn) {
    const job = viewContext;
    if (!activeView() || !reviewOn() || !card || card.link_state === "paused") return;
    if (card.draft && !btn?.dataset.rvEdit) return openPreview(card, card.draft);
    if (btn) btn.disabled = true;
    let templates = [];
    try { templates = await reviewTemplates(job); } finally { if (btn) btn.disabled = false; }
    if (!sameContext(job)) return;
    const draft = card.draft, cur = draft?.content || {};
    const last = card.source?.kind === "proposal" ? card.dossier : null;
    const options = [...templates.map((t) => [`template:${t.id}`, `Modèle · ${t.title}`]), ...(last ? [[`proposal:${last.id}`, `Reprendre « ${last.title} »`]] : []), ["blank", "Page blanche"]];
    const selectedBasis = draft ? (draft.basis?.kind === "blank" ? "blank" : `${draft.basis?.kind}:${draft.basis?.id}`) : options[0][0];
    const tplFor = (v) => templates.find((t) => `template:${t.id}` === v);
    const first = draft ? cur : (tplFor(selectedBasis) || (last && selectedBasis === `proposal:${last.id}` ? last : {}));
    const name = card.name || "le sportif";
    const d = formSheet({
      title: draft ? "Modifier la proposition préparée" : `Préparer la suite pour ${name}`,
      eyebrow: `Revue · ${RV().weekLabel(review?.week)}`,
      body: `<p class="asc-small" data-rv-prepare-source>${card.source ? `Source · ${esc(RV().sourceText(card))}` : ""}</p>
        ${card.checkin ? `<p class="asc-small">${icon("info")} Check-in partagé · ${esc(RV().checkinText(card.checkin))}</p>` : ""}
        <label class="asc-field"><span>Partir de</span><select name="basis" data-rv-basis>${options.map(([v, l]) => `<option value="${esc(v)}"${v === selectedBasis ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
        <label class="asc-field"><span>Nom</span><input class="asc-input" name="title" maxlength="100" required value="${esc(first.title || "")}"></label>
        <div class="asc-form-grid"><label class="asc-field"><span>Sport</span><select name="sport" required>${sportOptions(first.sport || card.scope?.sport || "running")}</select></label>
        <label class="asc-field"><span>Date prévue</span><input class="asc-input" type="date" name="planned_date" value="${esc(cur.planned_date || "")}" min="${isoDay()}" max="${isoDay(Date.now() + 366 * DAY)}" required></label></div>
        <label class="asc-field"><span>Consignes</span><textarea name="instructions" maxlength="2000">${esc(first.instructions || "")}</textarea></label>
        <p class="asc-small asc-muted">Rien n’est envoyé à cette étape : tu verras l’aperçu des changements avant d’envoyer. La proposition préparée est gardée si tu es interrompu.</p>`,
      submit: "Voir l’aperçu",
      onSubmit: async (f, _dialog, j) => {
        const basis = String(f.get("basis") || "blank");
        const data = { link_id: card.link_id, week: review?.week, title: String(f.get("title") || ""), sport: String(f.get("sport") || ""), planned_date: String(f.get("planned_date") || ""), instructions: String(f.get("instructions") || "") };
        if (draft) data.revision = draft.revision;
        if (!draft || basis !== selectedBasis) {
          if (basis.startsWith("template:")) data.template_id = basis.slice(9);
          else if (basis.startsWith("proposal:")) data.from_id = basis.slice(9);
        }
        const r = await rpc("prepare", data, j, RVN).catch((e) => { throw Object.assign(Error(e.message), { review: true }); });
        if (r?.draft) setTimeout(() => { if (sameContext(j)) openPreview(card, r.draft, r.resumed); }, 0);
        return r;
      },
    });
    // Choosing another basis fills the form from it (the coach may still change everything before the preview).
    d?.querySelector("[data-rv-basis]")?.addEventListener("change", (e) => {
      const v = e.target.value, src = tplFor(v) || (last && v === `proposal:${last.id}` ? last : null);
      if (!src) return;
      const form = d.querySelector("form");
      form.elements.title.value = src.title || "";
      form.elements.sport.value = src.sport || form.elements.sport.value;
      form.elements.instructions.value = src.instructions || "";
    });
  }
  // Step 2: what the athlete will receive and what differs from the basis. Sending is the coach's explicit action, once.
  function openPreview(card, draft, resumed = false) {
    const job = viewContext;
    if (!activeView()) return;
    const p = RV().preview(draft), name = card.name || "le sportif";
    const d = formSheet({
      title: `Aperçu pour ${name}`,
      eyebrow: `Revue · ${RV().weekLabel(draft.week)}`,
      body: `<div class="asc-stack" data-rv-preview="${esc(draft.id)}">${resumed ? `<p class="asc-note" data-rv-resumed>${icon("info")}<span>Proposition préparée retrouvée : rien n’a été envoyé.</span></p>` : ""}
        <p class="asc-small">Partie de · <strong>${esc(p.basis)}</strong></p>
        <section><h3 class="asc-h3">Ce que ${esc(name)} recevra</h3><dl class="co-version" data-rv-receive>${p.receive.map((x) => `<div data-field="${esc(x.field)}"><dt>${esc(x.label)}</dt><dd${x.field === "instructions" ? ' class="co-instructions"' : ""}>${esc(x.text)}</dd></div>`).join("")}</dl></section>
        ${p.changes.length ? `<table class="co-diff" data-rv-changes><caption>Changements par rapport au point de départ</caption><thead><tr><th scope="col">Élément</th><th scope="col">Avant</th><th scope="col">Après</th></tr></thead><tbody>${p.changes.map((x) => `<tr data-field="${esc(x.field)}"><th scope="row">${esc(x.label)}</th><td>${esc(x.before)}</td><td>${esc(x.after)}</td></tr>`).join("")}</tbody></table>` : `<p class="asc-small asc-muted" data-rv-changes>Identique au point de départ.</p>`}
        <div class="asc-row-flex"><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-rv-edit>${icon("edit")} Modifier</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-rv-discard>Abandonner</button></div>
        <p class="asc-small asc-muted">${esc(name)} accepte ou décline dans son espace. Le partage et les places de ton offre sont revérifiés à l’envoi.</p></div>`,
      submit: `Envoyer à ${name}`,
      onSubmit: async (_f, _dialog, j) => {
        // Retrying after a lost answer sends the same draft and revision: the server answers « already », never a second proposal.
        const r = await rpc("send", { id: draft.id, revision: draft.revision }, j, RVN).catch((e) => {
          if (["SHARING_UNAVAILABLE", "COACH_CAPACITY_PAUSED", "COACH_CONFLICT"].includes(e.message)) loadReview();
          throw Object.assign(Error(e.message), { review: true });
        });
        if (sameContext(j)) window.titanShell.toast({ type: "ok", title: r?.already ? "Déjà envoyée" : "Proposition envoyée", message: `${name} répond dans son espace ; sa décision reviendra dans la revue.` });
        return r;
      },
    });
    d?.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || !d.contains(b)) return;
      if (b.hasAttribute("data-rv-edit")) { d.close(); openPrepare({ ...card, draft }, { dataset: { rvEdit: "1" } }); }
      if (b.hasAttribute("data-rv-discard")) {
        d.close();
        confirm({ title: "Abandonner cette proposition préparée ?", message: "Rien n’a été envoyé au sportif. Tu pourras en préparer une autre.", confirmLabel: "Abandonner",
          action: (j) => rpc("discard", { id: draft.id, revision: draft.revision }, j, RVN).then(() => { if (sameContext(j)) return loadReview(); }).catch((err) => { throw new Error(human(err)); }) });
      }
    });
    void job;
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
  function followBlock(t) {
    const r = followOn() ? follow?.get(t.id) : null;
    if (!r) return "";
    const v = mode === "coach" ? FU().forCoach(r) : FU().forAthlete(r);
    const buttons = mode === "coach" ? coachButtons(r, v, "card")
      : v.can.includes("accept_change") ? `<button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-fu-answer="accept_change" data-fu-id="${esc(r.id)}">Accepter le changement</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-fu-answer="decline_change" data-fu-id="${esc(r.id)}">Garder ma version</button>` : "";
    return `<div class="co-follow" data-co-follow="${esc(r.state)}"><p class="asc-small"><span class="asc-chip" data-state="${esc(r.state)}">${esc(v.label)}</span> ${esc(v.text)}</p>${datesHtml(v)}${changesHtml(v)}${buttons ? `<div class="asc-row-flex">${buttons}</div>` : ""}</div>`;
  }
  function taskCards() {
    return (assignments?.rows || [])
      .map(
        (t) => `<article class="co-task" data-status="${esc(t.status)}"><div class="asc-between"><span class="asc-chip">${LABELS[t.status] || t.status}</span><span class="asc-small asc-muted">${esc(date(t.planned_date))}</span></div>
        <h3>${esc(t.title)}</h3><p class="asc-small asc-muted">${esc(SP().label(t.sport))}</p>${t.instructions ? `<p class="co-instructions">${esc(t.instructions)}</p>` : ""}${followBlock(t)}${feedbackBlock(t)}
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
      root.innerHTML = `<section class="sig-plate is-relief co-intro"><p class="asc-eyebrow">Sportifs · coachs · éducateurs</p><h2 class="cm-exp-title">Un suivi qui se construit à deux.</h2>
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
      <section class="asc-section co-head"><div class="asc-between"><div><p class="asc-eyebrow">${mode === "coach" ? "Les sportifs que j’accompagne" : "Mes partages"}</p><h2 class="asc-h2">${mode === "coach" ? `${list.length} / ${snapshot.capacity} suivis` : `${list.length} partage${list.length > 1 ? "s" : ""} actif${list.length > 1 ? "s" : ""}`}</h2>
          ${mode === "coach" && snapshot.plan ? `<p class="asc-small asc-muted" data-co-plan>Offre ${snapshot.plan.plan === "coach_pro" ? "Coach Ultra" : "Coach"} : ${snapshot.capacity} places, TITAN+ inclus pour chaque sportif suivi tant que le suivi est actif${snapshot.seatsUsed > snapshot.capacity ? ` · ${snapshot.seatsUsed - snapshot.capacity} sportif(s) au-delà des places n’ont plus TITAN+ inclus` : ""}.</p>` : ""}</div>
        <button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-${mode === "coach" ? "invite" : "join"}>${icon("plus")} ${mode === "coach" ? "Créer une invitation" : "J’ai reçu un code"}</button></div>
        ${mode === "coach" && snapshot.invites?.length ? `<details class="co-invites"><summary>${snapshot.invites.length} invitation(s) en attente</summary>${snapshot.invites.map((v) => `<div class="asc-between"><span class="asc-small">Créée le ${esc(date(v.created_at))} · expire le ${esc(date(v.expires_at))}</span><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-cancel-invite="${esc(v.id)}">Annuler</button></div>`).join("")}</details>` : ""}
      </section>
      <div data-co-review-slot>${reviewHtml()}</div>
      <div data-co-queue-slot>${queueHtml()}</div>
      <div data-co-roster-slot>${rosterHtml()}</div>
      ${list.length ? `<div class="co-layout${list.length === 1 || mode === "coach" && feature("screens.coachworkspace") ? " is-single" : ""}">
        ${list.length === 1 ? "" : `<nav class="co-people" data-co-legacy-nav aria-label="Suivis"${mode === "coach" && feature("screens.coachworkspace")?" hidden":""}>`}${list.length === 1 ? "" : list.map((x) => `<button type="button" class="co-person" data-link="${esc(x.id)}" aria-pressed="${x.id === selected}">${icon(mode === "coach" ? "user" : "group")}<span><strong>${esc((mode === "coach" ? x.athlete_name : x.coach_name) || "Compte TITAN")}</strong><small>Depuis le ${esc(date(x.accepted_at))}</small></span></button>`).join("") + "</nav>"}
        ${l ? `<div class="co-detail">
          <section class="co-card sig-plate is-relief" data-co-card><p class="asc-eyebrow">${mode === "coach" ? "Sportif accompagné" : "Mon coach"}</p>
            <div class="asc-between"><h3 class="asc-h3">${esc((mode === "coach" ? l.athlete_name : l.coach_name) || "Mon suivi")}</h3><span class="sig-state ${l.paused ? "is-locked" : "is-worn"}">${l.paused ? "En pause" : "Partage actif"}</span></div>${l.paused ? `<p class="asc-small">${esc(MESSAGES.COACH_CAPACITY_PAUSED)}</p>` : ""}
            ${list.length === 1 ? `<p class="asc-small asc-muted">Suivi depuis le ${esc(date(l.accepted_at))}</p>` : ""}
            <dl class="co-scope" data-co-scope aria-label="${mode === "coach" ? "Ce que ce sportif partage avec toi" : "Ce que mon coach voit"}">
              <div><dt>${icon("calendar")} Séances</dt><dd>Depuis le ${esc(date(l.since_date))} · ${l.sport ? esc(SP().label(l.sport)) : "Tous les sports"}</dd></div>
              <div><dt>${icon("bars")} Détails techniques</dt><dd><span class="sig-state ${l.share_details ? "is-owned" : "is-locked"}">${icon(l.share_details ? "eye" : "eyeOff")} ${l.share_details ? "Partagés" : "Non partagés"}</span><small>${l.share_details ? "Séries, charges, répétitions, RIR, détails d’escalade." : "Seulement les mesures essentielles de chaque séance."}</small></dd></div>
              <div><dt>${icon("edit")} Notes de séance</dt><dd><span class="sig-state ${l.share_notes ? "is-owned" : "is-locked"}">${icon(l.share_notes ? "eye" : "eyeOff")} ${l.share_notes ? "Partagées" : "Privées"}</span></dd></div>
            </dl>
            <p class="asc-small co-hold">${mode === "athlete" ? `${icon("shield")}<span>Tu gardes la main : ton coach lit ce partage, il ne modifie jamais ton journal. Tu peux le changer ou l’arrêter à tout moment. <a href="#co-seen">Voir exactement ce qu’il voit</a></span>` : `${icon("shield")}<span>Ce partage est choisi par le sportif, qui peut le changer ou l’arrêter à tout moment. Tu ne modifies jamais son journal.</span>`}</p>
            <div class="asc-row-flex">${mode === "athlete" ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-scope>${icon("settings")} Modifier mon partage</button>` : `<button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-propose>${icon("plus")} Proposer une séance</button>`}<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-revoke>Arrêter le partage</button></div></section>
          <div data-co-calendar-slot>${calendarHtml()}</div>
          <div data-co-tools-slot></div>
          <div data-co-program-slot></div>
          <section class="asc-section"><div class="asc-section-head"><h2>Séances proposées</h2><span class="asc-small asc-muted">${assignments ? `${assignments.total} au total` : "…"}</span></div>
            ${assignments ? (assignments.rows.length ? `<div class="co-tasks">${taskCards()}</div>${assignments.rows.length < assignments.total ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-more-tasks>Voir les précédentes</button>` : ""}` : `<p class="asc-small asc-muted">${mode === "coach" ? "Prépare une séance : l’athlète choisit de l’accepter." : "Aucune proposition pour le moment."}</p>`) : '<div class="asc-skeleton" style="height:80px"></div>'}</section>
          <section class="asc-section" id="co-seen" tabindex="-1"><div class="asc-section-head"><h2>${mode === "coach" ? "Séances partagées" : "Ce que mon coach peut voir"}</h2></div>
            ${mode === "athlete" ? `<p class="asc-small asc-muted">La liste exacte que ton coach lit, séance par séance, sur la période que tu choisis ici.</p>` : ""}
            <form class="co-period" data-period><label class="asc-field"><span>Du</span><input class="asc-input" type="date" name="from" value="${fromDate}" max="${isoDay()}" required></label><label class="asc-field"><span>Au</span><input class="asc-input" type="date" name="to" value="${toDate}" max="${isoDay()}" required></label><button type="submit" class="asc-btn asc-btn-secondary">Appliquer</button></form><p class="asc-small asc-faint">Dates incluses · 366 jours au plus · le début réel respecte le consentement du sportif.</p>
            <div data-co-analysis-slot>${analysisHtml()}</div><div data-co-export-slot>${exportHtml()}</div>
            ${sessions ? `<p class="asc-small asc-muted">${sessions.rows.length} séance(s) sur ${sessions.total}.</p>${sessions.rows.length ? `<div class="co-sessions">${sessionRows()}</div>` : '<p class="asc-small asc-muted">Aucune séance partagée sur cette période.</p>'}${sessions.rows.length < sessions.total ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-more-sessions>Charger la suite</button>` : ""}` : '<div class="asc-skeleton" style="height:80px"></div>'}
          </section></div>` : ""}
      </div>` : `<div class="sig-empty">${icon(mode === "coach" ? "group" : "shield")}<h2>${mode === "coach" ? "Prêt pour le premier suivi ?" : "Tu gardes la main."}</h2><p>${mode === "coach" ? "Crée une invitation et transmets le code à ton sportif. Aucun accès ne s’ouvre tant qu’il n’a pas choisi son partage." : "Ton journal reste privé. Seul un code accepté avec ton accord ouvre un suivi."}</p></div>`}` : ""}
      </div><div id="co-panel-${mode === "athlete" ? "coach" : "athlete"}" role="tabpanel" aria-labelledby="co-tab-${mode === "athlete" ? "coach" : "athlete"}" tabindex="-1" hidden></div>
      <p class="asc-small asc-faint co-foot">TITAN facilite l’organisation entre vous. Il ne vérifie pas les qualifications d’un coach et ses propositions ne sont pas un avis médical.</p>`;
    root.setAttribute("aria-busy", "false");
    mountTools();
    mountPrograms();
    if (focusedMode) root.querySelector(`[role="tab"][data-mode="${focusedMode}"]`)?.focus({ preventScroll: true });
  }

  function mountTools() {
    const slot = root.querySelector("[data-co-tools-slot]"), l = current();
    if (!slot || !l || !feature("screens.coachtools") || !window.TitanCoachTools) { return; }
    const job = viewContext;
    if (!job || !sameContext(job)) return;
    window.TitanCoachTools.mount(slot, { client: job.client, link: l.id, mode, ok: () => sameContext(job) && current()?.id === l.id && root.contains(slot), propose, openFeedback: feedbackOn() ? openFeedback : null });
  }

  // V1.9.4: multi-week programmes of the selected link, only when screens.coach_programs is open (checked again by the server).
  function mountPrograms() {
    const slot = root.querySelector("[data-co-program-slot]"), l = current();
    if (!slot || !l || !feature("screens.coach_programs") || !window.TitanCoachPrograms || !window.TitanCoachProgram) return;
    const job = viewContext;
    if (!job || !sameContext(job)) return;
    window.TitanCoachPrograms.mount(slot, { client: job.client, link: l, links: mode === "coach" ? links() : [], mode,
      ok: () => sameContext(job) && current()?.id === l.id && root.contains(slot),
      onChanged: () => { if (!sameContext(job)) return; loadDetail(); loadQueue(); loadReview(); } });
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
      resetWorkspace();
      mode = b.dataset.mode;
      selected = links()[0]?.id || "";
      sessions = null;
      assignments = null;
      follow = null;
      render();
      if (selected) loadDetail();
      loadQueue();
      loadReview();
      return;
    }
    if (b.dataset.rvWeek !== undefined && root.querySelector("[data-co-review]")?.contains(b)) { reviewWeek = b.dataset.rvWeek; return loadReview(); }
    if (b.dataset.rvFilter && root.querySelector("[data-co-review]")?.contains(b)) { reviewFilter = b.dataset.rvFilter; return loadReview(); }
    if (b.dataset.rvPrepare) return openPrepare(reviewCard(b.dataset.rvPrepare), b);
    if (b.dataset.rvOpen) return openDossier(b.dataset.rvOpen, b);
    if (b.dataset.rvFeedback) return openCompose(b.dataset.rvFeedback, b);
    if (b.dataset.queueAction !== undefined && root.querySelector("[data-co-queue]")?.contains(b)) { queueAction = b.dataset.queueAction; return loadQueue(); }
    if (b.dataset.fuOpen) return openDossier(b.dataset.fuOpen, b);
    if (b.dataset.fuSeen) return fuAction("seen", fuRow(b.dataset.fuSeen));
    if (b.dataset.fuChange) return fuAction("change", fuRow(b.dataset.fuChange));
    if (b.dataset.fuWithdraw) return fuAction("withdraw", fuRow(b.dataset.fuWithdraw));
    if (b.dataset.fuAnswer) return fuAction(b.dataset.fuAnswer, fuRow(b.dataset.fuId));
    if (b.dataset.fbCompose) return openCompose(b.dataset.fbCompose, b);
    if (b.dataset.fbOpen) return openFeedback(b.dataset.fbOpen, b);
    if (b.hasAttribute("data-invite")) return invite(b);
    if (b.hasAttribute("data-join")) return join();
    if (b.hasAttribute("data-co-export-csv")) return exportCsv();
    if (b.hasAttribute("data-calendar-move") || b.hasAttribute("data-calendar-today")) {
      calendarMonth=b.hasAttribute("data-calendar-today")?isoDay().slice(0,7):workspace().shiftMonth(calendarMonth,Number(b.dataset.calendarMove))||calendarMonth;
      const target=b.hasAttribute("data-calendar-today")?"[data-calendar-today]":`[data-calendar-move="${b.dataset.calendarMove}"]`;
      refreshSlot("[data-co-calendar-slot]",calendarHtml());root.querySelector(target)?.focus({preventScroll:true});return;
    }
    if (b.dataset.link) {
      cancelExport();calendarMonth=isoDay().slice(0,7);calendarStatus="";
      selected = b.dataset.link;
      sessions = null;
      assignments = null;
      follow = null;
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
    cancelExport();
    fromDate = f.get("from");
    toDate = f.get("to");
    sessions = null;
    render();
    loadDetail();
  }

  function onWorkspaceInput(e) {
    if (!activeView() || !coachView()) return;
    if (e.target.matches("[data-roster-query]")) {rosterQuery=e.target.value.slice(0,80);const results=root.querySelector("[data-roster-results]");if(results)results.innerHTML=rosterResultsHtml();}
    if (e.target.matches("[data-roster-sport]")) {rosterSport=e.target.value;const results=root.querySelector("[data-roster-results]");if(results)results.innerHTML=rosterResultsHtml();}
    if (e.target.matches("[data-queue-link]") && e.type === "change") { queueLink = e.target.value; loadQueue(); return; }
    if (e.target.matches("[data-calendar-status]")) {calendarStatus=e.target.value;refreshSlot("[data-co-calendar-slot]",calendarHtml());}
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
    root.addEventListener("input", onWorkspaceInput);
    root.addEventListener("change", onWorkspaceInput);
    render();
    load();
  }
  window.addEventListener("titan:account-changing", () => booted && invalidate());
  window.addEventListener("titan:flags-updated", () => {if(booted){refreshAnalysis();refreshWorkspace();loadQueue();loadReview();}});
  window.addEventListener("titan:account-changed", () => booted && load());
  window.addEventListener("online", () => booted && load());
  document.addEventListener("visibilitychange", () => {
    if (!booted) return;
    if (!document.hidden) load();
    else {
      cancelExport();
      sessions = null;
      assignments = null;
      feedback = null;
    }
  });
  window.addEventListener("pagehide", () => {
    feedback = null;
    sessions = null;
    assignments = null;
    snapshot = null;
  });
  window.addEventListener("hashchange", () => {
    const id = /^#retour=([0-9a-f-]{36})$/i.exec(location.hash)?.[1];
    if (booted && id && feedbackOn()) openFeedback(id);
  });
  window.addEventListener("titan:history-updated", () => setTimeout(start, 0));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
