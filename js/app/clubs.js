/* V11-71 (COM-C8): club spaces under the Communauté. A club is private by default, joined with a code that only its administrators see, and
   discoverable only if an administrator chooses so. Administrators write announcements and moderate; members only see the name, the
   description, the number of members and the announcements, never another member. No XP, credit, ranking or prize. Shown only when the server
   flag screens.clubs is on, to a signed-in account, and when the server has the functions. Every answer is applied only if the account, the
   client and the epoch are still the ones that asked. All text is escaped. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const FLAG = "screens.clubs";
  const SEASON_FLAG = "screens.club_season"; // V1.8.4: private club seasons (create, join, resume, postpone are checked by the server too)
  const CS = () => window.TitanClubSeason;
  const MATCH_FLAG = "screens.club_match"; // V1.8.5: meetings between clubs (propose, accept, join are checked by the server too)
  const CM = () => window.TitanClubMatch;
  const AGENDA_FLAG = "screens.club_agenda"; // V1.8.6: the club's agenda (create, yes, maybe, reminders, moves and the link are checked by the server too)
  const CA = () => window.TitanClubAgenda;
  const MESSAGES = {
    NOT_ELIGIBLE: "Tu pourras créer ou rejoindre un club un jour après la création du compte.",
    BAD_NAME: "Le nom d’un club fait entre 3 et 60 caractères.",
    BAD_DESCRIPTION: "La description fait 300 caractères au plus.",
    BAD_ANNOUNCEMENT: "Une annonce fait entre 1 et 500 caractères.",
    BAD_REASON: "Choisis un motif de signalement.",
    TOO_MANY_CREATED: "Tu as déjà créé trois clubs.",
    TOO_MANY_CLUBS: "Tu fais déjà partie de cinq clubs.",
    CLUB_FULL: "Ce club est complet.",
    CLUB_NOT_FOUND: "Ce code ne correspond à aucun club que tu puisses rejoindre.",
    CANNOT_REMOVE_ADMIN: "Un administrateur ne peut pas être retiré ici.",
    ADMIN_REQUIRED: "Cette action est réservée aux administrateurs du club.",
    RATE_LIMITED: "Beaucoup d’actions en peu de temps. Réessaie dans un instant.",
    CLUB_GOAL_INVALID: "Un objectif de club va de 60 à 100 000 minutes d’effort par semaine.",
    CLUB_ADMIN_REQUIRED: "Seuls les administrateurs fixent l’objectif du club.",
  };

  let data = null;
  let discover = [];
  let owner = null;
  let flight = null;
  let missing = false;
  let busy = false;
  let notice = "";
  let root = null;
  let draft = {};   // typed text survives a refresh; never sent anywhere
  let openRoster = new Set();   // which member lists the administrator left open
  let synced = false;           // the trophy hand-out is asked once per session and account
  let reporting = null;         // { club, announcement } the report form being filled, if any

  const context = () => ({ owner: window.state?.user?.id || null, client: window.titanClient || null, epoch: window.titanAccountTransition?.epoch });
  const same = (a, b) => a && b && a.owner === b.owner && a.client === b.client && a.epoch === b.epoch && !window.titanAccountTransition?.active;
  const guest = () => !context().owner || String(context().owner).startsWith("guest_");
  const on = () => !guest() && window.titanFlags?.enabled?.(FLAG, false) === true;
  const n = (v) => window.TitanFormat.number(v);
  const failure = (error, rpc = "") => {
    // V1.8.5: a meeting's refusal is worded by the meetings' module, a season's by the seasons' module.
    const shared = /^titan_club_match/.test(rpc) ? window.TitanClubMatch?.message?.(error) : /^titan_club_agenda/.test(rpc) ? window.TitanClubAgenda?.message?.(error) : window.TitanClubSeason?.message?.(error);
    if (shared && !/CLUB_NOT_FOUND|RATE_LIMITED/.test(String(error?.message || ""))) return shared;
    const code = Object.keys(MESSAGES).find((k) => String(error?.message || "").includes(k));
    return code ? MESSAGES[code] : "Le serveur ne répond pas pour l’instant. Réessaie dans un moment.";
  };
  const date = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }); };

  let weeks = {};
  let seasons = {};   // V1.8.4: club id → titan_club_season_v1 answer
  let seasonForm = {}; // club id → true when the organiser opened the creation form
  const seasonOn = () => on() && window.titanFlags?.enabled?.(SEASON_FLAG, false) === true && Boolean(CS());
  let matches = {};      // V1.8.5: club id → titan_club_match_v1 answer
  let matchForm = {};    // club id → "propose" | "answer" when the organiser opened a form
  let matchPreview = {}; // club id → { code, found } the proposal read from a code (titan_club_match_preview_v1)
  const matchOn = () => on() && window.titanFlags?.enabled?.(MATCH_FLAG, false) === true && Boolean(CM());
  let agendas = {};      // V1.8.6: club id → titan_club_agenda_v1 answer
  let agendaForm = {};   // club id → true when the organiser opened the proposal form
  let agendaMove = {};   // slot id → true when the organiser opened the move form
  let agendaFocus = null; // the occurrence an invitation link opened
  let invitePending = null; // the code of an invitation link, read once from the address
  let agendaFocused = false; // the opened occurrence takes the focus once
  const agendaOn = () => on() && window.titanFlags?.enabled?.(AGENDA_FLAG, false) === true && Boolean(CA());
  function reset() { weeks = {}; seasons = {}; seasonForm = {}; matches = {}; matchForm = {}; matchPreview = {}; agendas = {}; agendaForm = {}; agendaMove = {}; agendaFocus = null; agendaFocused = false; data = null; discover = []; flight = null; missing = false; busy = false; notice = ""; draft = {}; openRoster = new Set(); reporting = null; synced = false; }
  function sync() {
    const id = guest() ? null : context().owner;
    if (id !== owner) { owner = id; reset(); render(); }
  }
  const missingFn = (error) => error?.code === "PGRST202" || /Could not find/.test(error?.message || "");

  async function refresh() {
    sync();
    if (!root || !on() || missing || !navigator.onLine) return render();
    if (flight) return flight;
    const ask = context();
    flight = (async () => {
      try {
        // Season trophies are earned from frozen results: ask the server once per session to hand out the ones that are due (a missing function is not an error).
        if (!synced) { synced = true; try { await ask.client.rpc("titan_club_trophy_sync_v1"); } catch { /* optional */ } if (!same(ask, context())) return; }
        const [mine, found] = await Promise.all([ask.client.rpc("titan_club_my_v1"), ask.client.rpc("titan_club_discover_v1")]);
        if (!same(ask, context())) return;
        if (mine.error) { if (missingFn(mine.error)) missing = true; else notice = failure(mine.error); return; }
        if (Array.isArray(mine.data)) { data = mine.data; notice = ""; }
        discover = Array.isArray(found.data) ? found.data : [];
        // Social lot B: each club's common goal of the week (a total, never a name); an older server simply has none.
        const answers = await Promise.all((data || []).map((c) => ask.client.rpc("titan_club_week_v1", { p_club: c.id }).then((r) => [c.id, r.error ? null : r.data], () => [c.id, null])));
        if (!same(ask, context())) return;
        weeks = Object.fromEntries(answers);
        // V1.8.4: each club's private season (an older server has none: nothing is shown).
        if (seasonOn()) {
          const got = await Promise.all((data || []).map((c) => ask.client.rpc("titan_club_season_v1", { p_club: c.id }).then((r) => [c.id, r.error ? null : r.data], () => [c.id, null])));
          if (!same(ask, context())) return;
          seasons = Object.fromEntries(got);
        } else seasons = {};
        // V1.8.5: each club's meeting with another club (an older server has none: nothing is shown).
        if (matchOn()) {
          const got = await Promise.all((data || []).map((c) => ask.client.rpc("titan_club_match_v1", { p_club: c.id }).then((r) => [c.id, r.error ? null : r.data], () => [c.id, null])));
          if (!same(ask, context())) return;
          matches = Object.fromEntries(got);
        } else matches = {};
        // V1.8.6: each club's agenda (an older server has none: nothing is shown).
        if (agendaOn()) {
          const got = await Promise.all((data || []).map((c) => ask.client.rpc("titan_club_agenda_v1", { p_club: c.id }).then((r) => [c.id, r.error ? null : r.data], () => [c.id, null])));
          if (!same(ask, context())) return;
          agendas = Object.fromEntries(got);
          if (invitePending) { const code = invitePending; invitePending = null; await openInvite(ask, code); if (!same(ask, context())) return; }
        } else agendas = {};
      } catch { if (same(ask, context())) notice = "Les clubs ne répondent pas pour l’instant."; }
      finally { flight = null; if (same(ask, context())) render(); }
    })();
    return flight;
  }

  async function act(name, args, after) {
    sync();
    if (busy || !on()) return;
    const ask = context();
    busy = true; notice = ""; render();
    try {
      const { data: answer, error } = await ask.client.rpc(name, args);
      if (!same(ask, context())) return;
      if (error) notice = failure(error, name); else after?.(answer);
    } catch (error) {
      if (same(ask, context())) notice = failure(error, name);
    } finally {
      if (same(ask, context())) { const message = notice; busy = false; await refresh(); if (same(ask, context())) { notice = message || notice; render(); } } else busy = false;
    }
  }

  const val = (key) => draft[key] || "";
  function reportForm(c) {
    return `<form class="asc-panel asc-stack" data-club-report-form="${esc(c.id)}" novalidate><h3>${reporting.announcement ? "Signaler cette annonce" : "Signaler ce club"}</h3>
      <p class="asc-small asc-muted">Ton signalement n’est lu que par l’équipe TITAN, jamais par le club.</p>
      <label class="asc-field"><span>Motif</span><select class="asc-select" data-club-draft="reason"><option value="">Choisir…</option>${[["spam", "Spam ou publicité"], ["harassment", "Harcèlement ou insultes"], ["inappropriate", "Contenu inapproprié"], ["other", "Autre"]].map(([v, l]) => `<option value="${v}" ${val("reason") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="asc-field"><span>Précision (facultatif)</span><input class="asc-input" maxlength="300" data-club-draft="details" value="${esc(val("details"))}"></label>
      <div class="asc-actions"><button type="submit" class="asc-btn asc-btn-primary asc-btn-sm" ${busy ? "disabled" : ""}>Envoyer le signalement</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-club-report-cancel>Annuler</button></div></form>`;
  }

  function weekHtml(c) {
    const w = weeks[c.id];
    if (!w) return "";
    const goal = Number(w.goal) || 0;
    // Below 3 members the server keeps the totals to itself (null): no figure, no bar, the goal only.
    const hidden = w.minutes == null;
    const pct = goal ? Math.min(100, Math.round((Number(w.minutes) / goal) * 100)) : 0;
    const set = w.canSet ? `<div class="asc-actions"><label class="sr-only" for="club-goal-${esc(c.id)}">Objectif de la semaine en minutes</label><input id="club-goal-${esc(c.id)}" class="asc-input" type="number" min="60" max="100000" step="30" inputmode="numeric" data-club-draft="goal-${esc(c.id)}" value="${esc(val("goal-" + c.id) || (goal || ""))}" placeholder="Minutes" style="max-width:9rem">
        <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-club-goal="${esc(c.id)}" ${busy ? "disabled" : ""}>${goal ? "Changer l’objectif" : "Fixer un objectif"}</button></div>` : "";
    return `<div class="asc-stack" data-club-week="${esc(c.id)}"><p class="asc-small"><strong>Cette semaine ensemble</strong> · ${hidden ? `${goal ? `objectif ${n(goal)} min d’effort · ` : ""}le total s’affiche à partir de 3 membres` : `${n(w.minutes)} min d’effort${goal ? ` / ${n(goal)}` : ""} · ${n(w.active)} membre${Number(w.active) > 1 ? "s" : ""} actif${Number(w.active) > 1 ? "s" : ""} sur ${n(w.members)}`}</p>
      ${goal && hidden ? "" : goal ? `<span class="asc-ascent thin" role="progressbar" aria-label="Objectif commun du club" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${Math.min(goal, Number(w.minutes))}"><span style="--p:${pct}%"></span></span>${Number(w.minutes) >= goal ? '<p class="asc-small cy">Objectif de la semaine atteint ensemble.</p>' : ""}` : (w.canSet ? '<p class="asc-small asc-muted">Fixe un objectif commun en minutes d’effort : tous les sports comptent pareil, 90 min au plus par personne et par jour.</p>' : "")}
      <p class="asc-small asc-faint">Seul le total est visible : personne ne voit la part d’un autre membre.</p>${set}</div>`;
  }

  const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  function seasonFormHtml(c) {
    const S = CS(), id = esc(c.id), v = (k, d) => esc(val(`season-${k}-${c.id}`) || d);
    return `<form class="asc-panel asc-stack" data-season-create-form="${id}" novalidate><h4>Lancer une saison privée</h4>
      <p class="asc-small asc-muted">Chaque membre choisit de participer. Le groupe avance avec ses jours actifs (12 minutes d’effort comptées dans la journée, tous les sports comptent pareil) et débloque trois étapes.</p>
      <label class="asc-field"><span>Titre</span><input class="asc-input" maxlength="60" data-club-draft="season-title-${id}" value="${v("title", "")}"></label>
      <label class="asc-field"><span>Départ</span><input class="asc-input" type="date" min="${today()}" data-club-draft="season-start-${id}" value="${v("start", today())}"></label>
      <label class="asc-field"><span>Durée</span><select class="asc-select" data-club-draft="season-weeks-${id}">${[2, 3, 4, 5, 6, 7, 8].map((w) => `<option value="${w}" ${String(val(`season-weeks-${c.id}`) || 4) === String(w) ? "selected" : ""}>${w} semaines</option>`).join("")}</select></label>
      <label class="asc-field"><span>Allure de l’équipe</span><select class="asc-select" data-club-draft="season-pace-${id}">${Object.values(S.PACES).map((p) => `<option value="${p.id}" ${(val(`season-pace-${c.id}`) || "reguliere") === p.id ? "selected" : ""}>${esc(p.label)} · ${esc(p.short)}</option>`).join("")}</select></label>
      <div class="asc-actions"><button type="submit" class="asc-btn asc-btn-primary asc-btn-sm" ${busy ? "disabled" : ""}>Créer la saison</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-season-form-cancel="${id}">Annuler</button></div></form>`;
  }
  function seasonHtml(c) {
    const S = CS();
    if (!seasonOn() || !S) return "";
    const view = seasons[c.id];
    if (!view) return "";
    const s = view.current, lock = busy ? "disabled" : "";
    const report = S.report(view.last);
    const reportHtml = report && !s ? `<div class="asc-stack" data-season-report><p class="asc-small"><strong>${esc(report.title)}</strong></p><ul class="rv-list">${report.lines.map((l) => `<li class="asc-small">${esc(l)}</li>`).join("")}</ul></div>` : "";
    let body = "";
    if (s) {
      const p = S.progress(s);
      const acts = S.actions(s).map((a) => a.id === "postpone"
        ? [7, 14].map((d) => `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-season-act="postpone" data-club-id="${esc(c.id)}" data-days="${d}" ${lock}>Reporter de ${d / 7 > 1 ? "deux semaines" : "une semaine"}</button>`).join("")
        : `<button type="button" class="asc-btn ${a.id === "join" || a.id === "resume" ? "asc-btn-primary" : a.danger ? "asc-btn-ghost" : "asc-btn-secondary"} asc-btn-sm" data-season-act="${a.id}" data-club-id="${esc(c.id)}" ${lock}>${esc(a.label)}</button>`).join("");
      body = `<p class="asc-small"><strong>${esc(s.title)}</strong></p>
        <p class="asc-small asc-muted" data-season-header>${esc(S.header(s))}</p>
        <p class="asc-small" data-season-group>${esc(S.group(s))}</p>
        ${p ? `<p class="asc-small" data-season-progress>${esc(p.line)}</p><span class="asc-ascent thin" role="progressbar" aria-label="Objectif de la saison" aria-valuemin="0" aria-valuemax="${p.target}" aria-valuenow="${Math.min(p.target, p.total)}"><span style="--p:${p.pct}%"></span></span>` : ""}
        <ol class="rv-list" data-season-stages aria-label="Étapes de la saison">${S.stages(s).map((st) => `<li class="asc-small ${st.status === "reached" ? "cy" : st.status === "locked" || st.status === "hidden" ? "asc-faint" : ""}" data-stage="${st.n}" data-status="${st.status}">${esc(st.text)}</li>`).join("")}</ol>
        ${S.ongoing(s) ? `<p class="asc-small" data-season-ongoing>${esc(S.ongoing(s))}</p>` : ""}
        <p class="asc-small" data-season-me>${esc(S.mine(s))}</p>
        ${acts ? `<div class="asc-actions">${acts}</div>` : ""}`;
    } else if (view.canCreate) {
      body = seasonForm[c.id] ? seasonFormHtml(c) : `<div class="asc-actions"><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-season-form="${esc(c.id)}" ${lock}>Lancer une saison privée</button></div>`;
    } else if (!report) body = `<p class="asc-small asc-faint">Pas de saison en cours.</p>`;
    return `<div class="asc-stack" data-club-season="${esc(c.id)}"><p class="asc-small"><strong>Saison du club</strong></p>
      <p class="asc-small asc-faint" data-season-role>${esc(S.role(view))}</p>${body}${reportHtml}</div>`;
  }

  /* ---------- V1.8.5: meetings between clubs. Every word from TitanClubMatch, every figure from the server. ---------- */
  const tomorrow = () => new Date(Date.parse(today() + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
  const later = (days) => new Date(Date.parse(today() + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
  const matchArgs = (club, action, extra = {}) => ({ p_club: club, p_action: action, p_format: null, p_pace: null, p_weeks: null, p_starts_on: null, p_match: null, p_clear: null, p_again: null, ...extra });
  function matchProposeHtml(c, view) {
    const M = CM(), id = esc(c.id), v = (k, d) => val(`match-${k}-${c.id}`) || d;
    const formats = (Array.isArray(view.formats) ? view.formats : ["cooperation"]).filter((f) => M.FORMATS[f]);
    return `<form class="asc-panel asc-stack" data-match-propose-form="${id}" novalidate><h4>Proposer une rencontre à un autre club</h4>
      <p class="asc-small asc-muted">Tu obtiens un code à transmettre à un administrateur de l’autre club. Rien n’est partagé avant qu’il accepte, puis chaque membre choisit de participer.</p>
      <label class="asc-field"><span>Format</span><select class="asc-select" data-club-draft="match-format-${id}">${formats.map((f) => `<option value="${f}" ${v("format", "cooperation") === f ? "selected" : ""}>${esc(M.FORMATS[f].label)} · ${esc(M.FORMATS[f].text)}</option>`).join("")}</select></label>
      <label class="asc-field"><span>Départ</span><input class="asc-input" type="date" min="${tomorrow()}" max="${later(M.RULE.startWithinDays)}" data-club-draft="match-start-${id}" value="${esc(v("start", tomorrow()))}"></label>
      <label class="asc-field"><span>Durée</span><select class="asc-select" data-club-draft="match-weeks-${id}">${M.RULE.weeks.map((w) => `<option value="${w}" ${String(v("weeks", 1)) === String(w) ? "selected" : ""}>${w > 1 ? `${w} semaines` : "1 semaine"}</option>`).join("")}</select></label>
      <label class="asc-field"><span>Allure de chacun</span><select class="asc-select" data-club-draft="match-pace-${id}">${Object.values(M.PACES).map((p) => `<option value="${p.id}" ${v("pace", "reguliere") === p.id ? "selected" : ""}>${esc(p.label)} · ${esc(p.short)}</option>`).join("")}</select></label>
      <div class="asc-actions"><button type="submit" class="asc-btn asc-btn-primary asc-btn-sm" ${busy ? "disabled" : ""}>Obtenir un code de rencontre</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-match-form-cancel="${id}">Annuler</button></div></form>`;
  }
  function matchAnswerHtml(c) {
    const M = CM(), id = esc(c.id), pv = matchPreview[c.id], lock = busy ? "disabled" : "";
    const shown = pv && pv.found && !pv.found.self ? M.preview(pv.found) : null;
    return `<div class="asc-panel asc-stack" data-match-answer-form="${id}"><h4>Répondre à une proposition</h4>
      <label class="asc-field"><span>Code de rencontre reçu</span><input class="asc-input" maxlength="12" autocomplete="off" autocapitalize="characters" data-club-draft="match-code-${id}" value="${esc(val("match-code-" + c.id))}"></label>
      <div class="asc-actions"><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-match-preview="${id}" ${lock}>Voir la proposition</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-match-form-cancel="${id}">Annuler</button></div>
      ${shown ? `<div class="asc-stack" data-match-preview-box><p class="asc-small"><strong>${esc(shown.title)}</strong></p>${shown.lines.map((l) => `<p class="asc-small">${esc(l)}</p>`).join("")}
        <div class="asc-actions"><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-match-accept="${id}" ${lock}>Accepter la rencontre</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-match-refuse="${id}" ${lock}>Refuser</button></div></div>` : ""}</div>`;
  }
  function matchFeedbackHtml(c) {
    const id = esc(c.id), q = (k, label) => `<fieldset class="asc-field"><legend class="asc-small">${label}</legend>${[["yes", "Oui"], ["no", "Non"]].map(([v, l]) => `<label class="auth-check"><input type="radio" name="match-${k}-${id}" value="${v}" data-club-draft="match-${k}-${id}" ${val(`match-${k}-${c.id}`) === v ? "checked" : ""}><span>${l}</span></label>`).join("")}</fieldset>`;
    return `<form class="asc-stack" data-match-feedback-form="${id}" novalidate><p class="asc-small"><strong>Ton avis sur cette rencontre</strong> <span class="asc-faint">(compté, jamais montré aux clubs)</span></p>
      ${q("clear", "Le score était-il clair pour toi ?")}${q("again", "Referais-tu une rencontre avec ton club ?")}
      <div class="asc-actions"><button type="submit" class="asc-btn asc-btn-secondary asc-btn-sm" ${busy ? "disabled" : ""}>Envoyer mon avis</button></div></form>`;
  }
  function matchHtml(c) {
    const M = CM();
    if (!matchOn() || !M) return "";
    const view = matches[c.id];
    if (!view) return "";
    const m = view.current, lock = busy ? "disabled" : "";
    const report = M.report(view.last);
    let body = "";
    if (m) {
      const acts = M.actions(m).map((a) => `<button type="button" class="asc-btn ${a.id === "join" ? "asc-btn-primary" : "asc-btn-ghost"} asc-btn-sm" data-match-act="${a.id}" data-club-id="${esc(c.id)}" ${lock}>${esc(a.label)}</button>`).join("");
      body = `<p class="asc-small asc-muted" data-match-header>${esc(M.header(m))}</p>
        ${m.phase === "proposed" ? `<p class="asc-small" data-match-proposal>${esc(M.proposal(m))}</p>` : ""}
        ${M.sides(m).length ? `<ul class="rv-list" data-match-sides aria-label="Les deux clubs">${M.sides(m).map((l) => `<li class="asc-small">${esc(l)}</li>`).join("")}</ul>` : ""}
        ${M.score(m) ? `<p class="asc-small" data-match-score>${esc(M.score(m))}</p>` : ""}
        ${M.mine(m) ? `<p class="asc-small" data-match-me>${esc(M.mine(m))}</p>` : ""}
        <details class="asc-small" data-match-rules><summary>Comment le score est calculé</summary><p class="asc-small asc-muted">${esc(M.rules(m))}</p></details>
        ${acts ? `<div class="asc-actions">${acts}</div>` : ""}`;
    } else if (view.canPropose) {
      body = matchForm[c.id] === "propose" ? matchProposeHtml(c, view) : matchForm[c.id] === "answer" ? matchAnswerHtml(c)
        : `<div class="asc-actions"><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-match-form="${esc(c.id)}" data-kind="propose" ${lock}>Proposer une rencontre</button><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-match-form="${esc(c.id)}" data-kind="answer" ${lock}>J’ai reçu un code</button></div>`;
    } else if (!report) body = `<p class="asc-small asc-faint">Pas de rencontre en cours.</p>`;
    const feedback = view.last && Array.isArray(view.last.can) && view.last.can.includes("feedback") ? matchFeedbackHtml(c) : "";
    const reportHtml = report && !m ? `<div class="asc-stack" data-match-report><p class="asc-small"><strong>${esc(report.title)}</strong></p><ul class="rv-list">${report.lines.map((l) => `<li class="asc-small">${esc(l)}</li>`).join("")}</ul>${feedback}</div>` : "";
    return `<div class="asc-stack" data-club-match="${esc(c.id)}"><p class="asc-small"><strong>Rencontre entre clubs</strong></p>
      <p class="asc-small asc-faint" data-match-role>${esc(M.role(view))}</p>${body}${reportHtml}</div>`;
  }
  async function previewMatch(id) {
    sync();
    const M = CM(), code = M.code(val("match-code-" + id));
    if (busy || !matchOn()) return;
    if (code.length !== 8) { notice = M.MESSAGES.MATCH_CODE; render(); return; }
    const ask = context();
    busy = true; notice = ""; render();
    try {
      const { data: found, error } = await ask.client.rpc("titan_club_match_preview_v1", { p_club: id, p_code: code });
      if (!same(ask, context())) return;
      if (error) notice = failure(error, "titan_club_match_preview_v1");
      else if (!found) { matchPreview[id] = null; notice = M.MESSAGES.MATCH_CODE; }
      else if (found.self) { matchPreview[id] = null; notice = M.MESSAGES.MATCH_SELF; }
      else matchPreview[id] = { code, found };
    } catch (error) { if (same(ask, context())) notice = failure(error, "titan_club_match_preview_v1"); }
    finally { if (same(ask, context())) { busy = false; render(); } else busy = false; }
  }

  /* ---------- V1.8.6: the club's agenda. Every word from TitanClubAgenda, every count and every right from the server. ---------- */
  const agendaArgs = (club, action, extra = {}) => ({ p_club: club, p_action: action, p_slot: null, p_event: null, p_answer: null, p_on: null, p_starts_at: null, p_log: null, p_form: null, ...extra });
  const parisDate = (iso) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const parisTime = (iso) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Paris" }).replace(/\D/, ":").slice(0, 5);
  const sportLabel = (id) => window.TitanSports?.label?.(id) || id;
  function agendaFormHtml(c) {
    const A = CA(), id = esc(c.id), v = (k, d) => esc(val(`agenda-${k}-${c.id}`) || d);
    const rec = val(`agenda-rec-${c.id}`) || "once";
    return `<form class="asc-panel asc-stack" data-agenda-create-form="${id}" novalidate><h4>Proposer un rendez-vous</h4>
      <p class="asc-small asc-muted">Visible par les membres du club seulement. Chacun répond s’il le souhaite ; rien n’est ajouté au journal de personne.</p>
      <label class="asc-field"><span>Titre</span><input class="asc-input" maxlength="60" data-club-draft="agenda-title-${id}" value="${v("title", "")}" placeholder="Sortie du samedi"></label>
      <div class="asc-actions"><label class="asc-field"><span>Date</span><input class="asc-input" type="date" min="${today()}" max="${later(A.RULE.horizonDays)}" data-club-draft="agenda-date-${id}" value="${v("date", tomorrow())}"></label>
        <label class="asc-field"><span>Heure (Paris)</span><input class="asc-input" type="time" step="300" data-club-draft="agenda-time-${id}" value="${v("time", "09:00")}"></label></div>
      <label class="asc-field"><span>Durée</span><select class="asc-select" data-club-draft="agenda-dur-${id}">${[30, 45, 60, 90, 120, 150, 180, 240].map((m) => `<option value="${m}" ${String(val(`agenda-dur-${c.id}`) || 90) === String(m) ? "selected" : ""}>${esc(A.duration(m))}</option>`).join("")}</select></label>
      <label class="asc-field"><span>Lieu de rendez-vous (visible par tous les membres)</span><input class="asc-input" maxlength="60" data-club-draft="agenda-area-${id}" value="${v("area", "")}" placeholder="Parc de la Tête d’Or"></label>
      <label class="asc-field"><span>Lieu précis (facultatif, donné seulement à ceux qui viennent)</span><input class="asc-input" maxlength="200" data-club-draft="agenda-place-${id}" value="${v("place", "")}" placeholder="Parking nord, portail vert"></label>
      <label class="asc-field"><span>Plan de repli (facultatif)</span><input class="asc-input" maxlength="200" data-club-draft="agenda-fallback-${id}" value="${v("fallback", "")}" placeholder="Si pluie : séance de renfo au gymnase"></label>
      <label class="asc-field"><span>Places (facultatif)</span><input class="asc-input" type="number" min="2" max="100" inputmode="numeric" data-club-draft="agenda-cap-${id}" value="${v("cap", "")}" placeholder="Sans limite" style="max-width:9rem"></label>
      <label class="asc-field"><span>Répétition</span><select class="asc-select" data-club-draft="agenda-rec-${id}"><option value="once" ${rec === "once" ? "selected" : ""}>Une seule fois</option><option value="weekly" ${rec === "weekly" ? "selected" : ""}>Chaque semaine, même heure</option></select></label>
      ${rec === "weekly" ? `<label class="asc-field"><span>Nombre de rendez-vous</span><select class="asc-select" data-club-draft="agenda-occ-${id}">${Array.from({ length: A.RULE.occurrencesMax - 1 }, (_, i) => i + 2).map((k) => `<option value="${k}" ${String(val(`agenda-occ-${c.id}`) || 4) === String(k) ? "selected" : ""}>${k} semaines</option>`).join("")}</select></label>` : ""}
      <div class="asc-actions"><button type="submit" class="asc-btn asc-btn-primary asc-btn-sm" ${busy ? "disabled" : ""}>Proposer au club</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-agenda-form-cancel="${id}">Annuler</button></div></form>`;
  }
  function slotHtml(c, slot, view) {
    const A = CA(), lock = busy ? "disabled" : "", sid = esc(slot.id), cid = esc(c.id);
    const acts = A.actions(slot).map((a) => `<button type="button" class="asc-btn ${a.primary ? "asc-btn-primary" : a.danger ? "asc-btn-ghost" : "asc-btn-secondary"} asc-btn-sm" data-agenda-act="${esc(a.id)}" data-club-id="${cid}" data-slot="${sid}" ${a.answer ? `data-answer="${esc(a.answer)}"` : ""} ${a.on != null ? `data-on="${a.on}"` : ""} ${slot.me?.answer && a.answer === slot.me.answer ? 'aria-pressed="true"' : ""} ${lock}>${esc(a.label)}</button>`).join("");
    const series = A.seriesActions(slot, view).map((a) => `<button type="button" class="asc-btn ${a.danger ? "asc-btn-ghost" : "asc-btn-secondary"} asc-btn-sm" data-agenda-series="${esc(a.id)}" data-club-id="${cid}" data-event="${esc(slot.event)}" ${lock}>${esc(a.label)}</button>`).join("");
    const report = A.report(slot);
    const cands = A.candidates(slot, sportLabel);
    const link = slot.can?.includes("link") ? (cands.length
      ? `<div class="asc-actions"><label class="sr-only" for="agenda-log-${sid}">Séance à associer</label><select id="agenda-log-${sid}" class="asc-select" data-club-draft="agenda-log-${sid}">${cands.map((x) => `<option value="${esc(x.id)}" ${val("agenda-log-" + slot.id) === x.id ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select>
          <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-agenda-link="${sid}" data-club-id="${cid}" ${lock}>Associer ma séance</button></div>`
      : `<p class="asc-small asc-faint" data-agenda-no-candidate>Aucune séance confirmée ce jour-là dans ton journal. Le rendez-vous n’en crée jamais à ta place.</p>`) : "";
    const move = agendaMove[slot.id] ? `<div class="asc-actions" data-agenda-move-form="${sid}"><label class="asc-field"><span>Nouvelle date</span><input class="asc-input" type="date" min="${today()}" max="${later(A.RULE.horizonDays)}" data-club-draft="agenda-mdate-${sid}" value="${esc(val("agenda-mdate-" + slot.id) || parisDate(slot.startsAt))}"></label>
        <label class="asc-field"><span>Heure (Paris)</span><input class="asc-input" type="time" step="300" data-club-draft="agenda-mtime-${sid}" value="${esc(val("agenda-mtime-" + slot.id) || parisTime(slot.startsAt))}"></label>
        <button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-agenda-move="${sid}" data-club-id="${cid}" ${lock}>Déplacer</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-agenda-move-cancel="${sid}">Annuler</button></div>` : "";
    const roster = Array.isArray(slot.roster) ? `<details class="asc-small" data-agenda-roster><summary>Réponses (${slot.roster.length})</summary><ul class="rv-list">${slot.roster.map((r) => `<li>${esc(r.name)} · ${esc(r.answer ? A.ANSWERS[r.answer] : "pas de réponse")}${r.attended === true ? " · présent·e" : r.attended === false ? " · absent·e" : ""}</li>`).join("")}</ul></details>` : "";
    const hist = A.history(slot);
    return `<article class="asc-stack" data-agenda-slot="${sid}" data-phase="${esc(slot.phase)}" ${agendaFocus === slot.id ? 'data-agenda-focus tabindex="-1"' : ""}>
      <p class="asc-small"><strong>${esc(slot.title)}</strong>${slot.phase === "cancelled" ? ' <span class="asc-faint">· annulé</span>' : ""}</p>
      <p class="asc-small asc-muted" data-agenda-header>${esc(A.header(slot))}</p>
      ${A.status(slot).map((l) => `<p class="asc-small" data-agenda-status>${esc(l)}</p>`).join("")}
      ${slot.phase !== "cancelled" ? `<p class="asc-small" data-agenda-counts>${esc(A.counts(slot))}</p>` : ""}
      ${A.place(slot) ? `<p class="asc-small" data-agenda-place>${esc(A.place(slot))}</p>` : ""}
      ${A.mine(slot) ? `<p class="asc-small" data-agenda-me>${esc(A.mine(slot))}</p>` : ""}
      ${report ? `<div class="asc-stack" data-agenda-report><p class="asc-small"><strong>${esc(report.title)}</strong></p><ul class="rv-list">${report.lines.map((l) => `<li class="asc-small">${esc(l)}</li>`).join("")}</ul></div>` : ""}
      ${A.linked(slot, sportLabel) ? `<p class="asc-small" data-agenda-linked>${esc(A.linked(slot, sportLabel))}</p>` : ""}
      ${acts ? `<div class="asc-actions">${acts}</div>` : ""}${link}${move}
      ${slot.code ? `<p class="asc-small asc-faint" data-agenda-code>Lien d’invitation pour les membres : ${esc(A.inviteLink(slot.code, location.origin))}</p>` : ""}
      ${series ? `<div class="asc-actions">${series}</div>` : ""}${roster}
      ${hist.length ? `<details class="asc-small" data-agenda-history><summary>Historique</summary><ul class="rv-list">${hist.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></details>` : ""}</article>`;
  }
  function agendaHtml(c) {
    const A = CA();
    if (!agendaOn() || !A) return "";
    const view = agendas[c.id];
    if (!view) return "";
    const up = Array.isArray(view.upcoming) ? view.upcoming : [], past = Array.isArray(view.past) ? view.past : [];
    const create = view.canCreate ? (agendaForm[c.id] ? agendaFormHtml(c) : `<div class="asc-actions"><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-agenda-form="${esc(c.id)}" ${busy ? "disabled" : ""}>Proposer un rendez-vous</button></div>`) : "";
    return `<div class="asc-stack" data-club-agenda="${esc(c.id)}"><p class="asc-small"><strong>Agenda du club</strong></p>
      <p class="asc-small asc-faint" data-agenda-role>${esc(A.role(view))}</p>
      ${up.length ? up.map((x) => slotHtml(c, x, view)).join("") : '<p class="asc-small asc-faint">Pas de rendez-vous à venir.</p>'}
      ${past.length ? `<details class="asc-small" data-agenda-past ${past.some((x) => x.can?.length) ? "open" : ""}><summary>Rendez-vous passés (${past.length})</summary>${past.map((x) => slotHtml(c, x, view)).join("")}</details>` : ""}
      ${create}</div>`;
  }
  async function openInvite(ask, code) {
    const A = CA();
    try {
      const { data: got, error } = await ask.client.rpc("titan_club_agenda_invite_v1", { p_code: code });
      if (!same(ask, context())) return;
      if (error) { notice = failure(error, "titan_club_agenda_invite_v1"); return; }
      const text = A.invite(got);
      if (text) { notice = text; return; }
      agendaFocus = got.slot?.id || null;
      if (got.club && got.slot && agendas[got.club] && !(agendas[got.club].upcoming || []).some((x) => x.id === got.slot.id)) agendas[got.club].upcoming = [got.slot, ...(agendas[got.club].upcoming || [])];
    } catch (error) { if (same(ask, context())) notice = failure(error, "titan_club_agenda_invite_v1"); }
  }

  function clubHtml(c) {
    const admin = c.role === "admin";
    const ann = (c.announcements || []).map((a) => `<li class="asc-between" data-club-ann="${esc(a.id)}"><span><span class="asc-small asc-muted">${esc(date(a.at))}</span><br>${esc(a.body)}</span><span class="asc-actions">${admin ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-club-ann-remove="${esc(a.id)}" aria-label="Retirer cette annonce">Retirer</button>` : ""}${a.mine ? "" : `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-club-report="${esc(c.id)}" data-ann="${esc(a.id)}" aria-label="Signaler cette annonce">Signaler</button>`}</span></li>`).join("");
    const roster = admin ? `<details class="asc-small" data-club-roster="${esc(c.id)}" ${openRoster.has(c.id) ? "open" : ""}><summary>Membres (${n(c.members)})</summary><ul class="rv-list">${(c.roster || []).map((m) => `<li class="asc-between"><span>${esc(m.name)}${m.role === "admin" ? " · administrateur" : ""}</span>${m.role === "admin" ? "" : `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-club-kick="${esc(c.id)}" data-user="${esc(m.userId)}" data-name="${esc(m.name)}">Retirer</button>`}</li>`).join("")}</ul></details>` : "";
    const tools = admin ? `<div class="asc-stack">
        <p class="asc-small">Code pour inviter : <strong data-club-code>${esc(c.code)}</strong></p>
        <label class="asc-field"><span>Nouvelle annonce</span><textarea class="asc-input" maxlength="500" rows="2" data-club-draft="ann-${esc(c.id)}">${esc(val("ann-" + c.id))}</textarea></label>
        <div class="asc-actions"><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-club-announce="${esc(c.id)}" ${busy ? "disabled" : ""}>Publier</button>
          <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-club-code-new="${esc(c.id)}" ${busy ? "disabled" : ""}>Renouveler le code</button>
          <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-club-discover="${esc(c.id)}" data-on="${c.discoverable ? "false" : "true"}" ${busy ? "disabled" : ""}>${c.discoverable ? "Ne plus afficher dans la liste" : "Afficher dans la liste"}</button></div></div>` : "";
    return `<article class="asc-panel qg-steps-card" data-club="${esc(c.id)}"><p><strong>${esc(c.name)}</strong> <span class="asc-small asc-muted">· ${n(c.members)} membre${Number(c.members) > 1 ? "s" : ""}${admin ? " · tu administres" : ""}${c.discoverable ? " · visible dans la liste" : " · privé"}</span></p>
      ${c.description ? `<p class="asc-small asc-muted">${esc(c.description)}</p>` : ""}
      ${(c.trophies || []).length ? `<ul class="rv-list" data-club-trophies aria-label="Trophées du club">${c.trophies.map((t) => `<li><strong>${esc(t.title)}</strong> <span class="asc-small asc-muted">· ${esc(date(t.on))}</span>${t.note ? `<br><span class="asc-small asc-muted">${esc(t.note)}</span>` : ""}</li>`).join("")}</ul>` : ""}
      ${weekHtml(c)}
      ${agendaHtml(c)}
      ${seasonHtml(c)}
      ${matchHtml(c)}
      ${ann ? `<ul class="rv-list" data-club-announcements>${ann}</ul>` : `<p class="asc-small asc-faint">Pas d’annonce pour l’instant.</p>`}
      ${tools}${roster}
      ${reporting && reporting.club === c.id ? reportForm(c) : ""}
      <div class="asc-actions"><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-club-report="${esc(c.id)}" data-ann="">Signaler ce club</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-club-leave="${esc(c.id)}" data-name="${esc(c.name)}" ${busy ? "disabled" : ""}>Quitter le club</button></div></article>`;
  }

  function render() {
    if (!root) return;
    if (!on() || missing || !data) { root.innerHTML = ""; root.hidden = true; return; }
    root.hidden = false;
    const keepFocus = document.activeElement?.dataset?.agendaFocus !== undefined && root.contains(document.activeElement);
    const lock = busy ? "disabled" : "";
    const found = discover.map((c) => `<li class="asc-between" data-club-found="${esc(c.id)}"><span><strong>${esc(c.name)}</strong> <span class="asc-small asc-muted">· ${n(c.members)} membre${Number(c.members) > 1 ? "s" : ""}</span>${c.description ? `<br><span class="asc-small asc-muted">${esc(c.description)}</span>` : ""}</span><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-club-join-id="${esc(c.id)}" ${lock}>Rejoindre</button></li>`).join("");
    root.innerHTML = `<section class="asc-section asc-appear" aria-labelledby="club-title"><div class="asc-section-head"><h2 id="club-title">Clubs</h2></div>
      <p class="asc-small asc-muted">Un espace privé pour ton club ou ton groupe : annonces des administrateurs, rien d’autre n’est partagé. Les membres ne voient pas les autres membres, ni leurs séances. Aucun XP ni classement.</p>
      ${notice ? `<p class="asc-small" role="status" data-club-notice>${esc(notice)}</p>` : ""}
      <div class="asc-stack">${data.map(clubHtml).join("")}</div>
      <form class="asc-panel asc-stack" data-club-join-form novalidate><h3>Rejoindre avec un code</h3>
        <label class="asc-field"><span>Code du club</span><input class="asc-input" maxlength="12" autocomplete="off" autocapitalize="characters" data-club-draft="code" value="${esc(val("code"))}"></label>
        <div class="asc-actions"><button type="submit" class="asc-btn asc-btn-primary asc-btn-sm" ${lock}>Rejoindre</button></div></form>
      ${found ? `<div class="asc-panel"><h3>Clubs ouverts</h3><ul class="rv-list" data-club-list>${found}</ul></div>` : ""}
      <form class="asc-panel asc-stack" data-club-create-form novalidate><h3>Créer un club</h3>
        <label class="asc-field"><span>Nom</span><input class="asc-input" maxlength="60" data-club-draft="name" value="${esc(val("name"))}"></label>
        <label class="asc-field"><span>Description (facultatif)</span><input class="asc-input" maxlength="300" data-club-draft="desc" value="${esc(val("desc"))}"></label>
        <label class="auth-check"><input type="checkbox" data-club-draft-check="open" ${draft.open ? "checked" : ""}><span>Afficher ce club dans la liste des clubs ouverts</span></label>
        <div class="asc-actions"><button type="submit" class="asc-btn asc-btn-primary asc-btn-sm" ${lock}>Créer le club</button></div></form></section>`;
    // V1.8.6: the occurrence an invitation link opened takes the focus once.
    const el = agendaFocus ? root.querySelector("[data-agenda-focus]") : null;
    if (el && !agendaFocused) {
      agendaFocused = true; el.scrollIntoView?.({ block: "start" }); el.focus?.({ preventScroll: true });
      // The Communauté folds may move the section once more just after: the opened meeting takes the focus back, once.
      setTimeout(() => { const again = root?.querySelector("[data-agenda-focus]"); if (again && document.activeElement !== again && (document.activeElement === document.body || !document.activeElement)) { again.scrollIntoView?.({ block: "start" }); again.focus?.({ preventScroll: true }); } }, 600);
    }
    else if (el && keepFocus) el.focus?.({ preventScroll: true });
  }

  document.addEventListener("input", (e) => {
    const f = e.target.closest?.("#clubs [data-club-draft]");
    if (f) draft[f.dataset.clubDraft] = f.value;
    const c = e.target.closest?.("#clubs [data-club-draft-check]");
    if (c) draft[c.dataset.clubDraftCheck] = c.checked;
  });
  // V1.8.6: choosing « Chaque semaine » shows the number of occurrences.
  document.addEventListener("change", (e) => {
    const f = e.target.closest?.("#clubs select[data-club-draft^='agenda-rec-']");
    if (!f) return;
    draft[f.dataset.clubDraft] = f.value; render();
    root?.querySelector(`select[data-club-draft="${CSS.escape(f.dataset.clubDraft)}"]`)?.focus();
  });
  document.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d?.dataset?.clubRoster) { if (d.open) openRoster.add(d.dataset.clubRoster); else openRoster.delete(d.dataset.clubRoster); }
  }, true);
  document.addEventListener("submit", (e) => {
    if (!root || !root.contains(e.target)) return;
    e.preventDefault();
    if (e.target.matches("[data-club-join-form]")) {
      const code = val("code").trim();
      if (code) act("titan_club_join_v1", { p_code: code, p_club: null }, () => { draft.code = ""; });
    } else if (e.target.matches("[data-club-report-form]")) {
      if (!reporting) return;
      const target = reporting;
      if (!val("reason")) { notice = MESSAGES.BAD_REASON; render(); return; }
      act("titan_club_report_v1", { p_club: target.club, p_announcement: target.announcement || null, p_reason: val("reason"), p_details: val("details").trim() || null }, () => {
        reporting = null; delete draft.reason; delete draft.details; notice = "Merci : ton signalement a été transmis à l’équipe TITAN.";
      });
    } else if (e.target.matches("[data-season-create-form]")) {
      const id = e.target.dataset.seasonCreateForm, S = CS();
      const form = { title: val("season-title-" + id).trim(), startsOn: val("season-start-" + id) || today(), weeks: Number(val("season-weeks-" + id) || 4), pace: val("season-pace-" + id) || "reguliere" };
      const bad = S.validate(form, today());
      if (bad) { notice = S.MESSAGES[bad]; render(); return; }
      act("titan_club_season_act_v1", { p_club: id, p_action: "create", p_title: form.title, p_pace: form.pace, p_weeks: form.weeks, p_starts_on: form.startsOn, p_days: null }, () => {
        seasonForm[id] = false; ["title", "start", "weeks", "pace"].forEach((k) => delete draft[`season-${k}-${id}`]); notice = S.result("create");
      });
    } else if (e.target.matches("[data-agenda-create-form]")) {
      const id = e.target.dataset.agendaCreateForm, A = CA(), g = (k, d = "") => val(`agenda-${k}-${id}`) || d;
      const rec = g("rec", "once");
      const form = { title: g("title"), area: g("area"), place: g("place"), fallback: g("fallback"), durationMin: Number(g("dur", "90")), capacity: g("cap"),
        recurrence: rec, occurrences: rec === "weekly" ? Number(g("occ", "4")) : 1, startsAt: A.parisInstant(g("date", tomorrow()), g("time", "09:00")) };
      const bad = A.validate(form, Date.now());
      if (bad) { notice = A.MESSAGES[bad]; render(); return; }
      act("titan_club_agenda_act_v1", agendaArgs(id, "create", { p_form: A.payload(form) }), () => {
        agendaForm[id] = false; ["title", "date", "time", "dur", "area", "place", "fallback", "cap", "rec", "occ"].forEach((k) => delete draft[`agenda-${k}-${id}`]); notice = A.result("create");
      });
    } else if (e.target.matches("[data-match-propose-form]")) {
      const id = e.target.dataset.matchProposeForm, M = CM();
      const form = { format: val("match-format-" + id) || "cooperation", startsOn: val("match-start-" + id) || tomorrow(), weeks: Number(val("match-weeks-" + id) || 1), pace: val("match-pace-" + id) || "reguliere" };
      const bad = M.validate(form, today());
      if (bad) { notice = M.MESSAGES[bad]; render(); return; }
      act("titan_club_match_act_v1", matchArgs(id, "propose", { p_format: form.format, p_pace: form.pace, p_weeks: form.weeks, p_starts_on: form.startsOn }), () => {
        matchForm[id] = null; ["format", "start", "weeks", "pace"].forEach((k) => delete draft[`match-${k}-${id}`]); notice = M.result("propose");
      });
    } else if (e.target.matches("[data-match-feedback-form]")) {
      const id = e.target.dataset.matchFeedbackForm, M = CM(), clear = val("match-clear-" + id), again = val("match-again-" + id);
      if (!clear || !again) { notice = "Réponds aux deux questions."; render(); return; }
      act("titan_club_match_act_v1", matchArgs(id, "feedback", { p_clear: clear === "yes", p_again: again === "yes" }), () => {
        delete draft["match-clear-" + id]; delete draft["match-again-" + id]; notice = M.result("feedback");
      });
    } else if (e.target.matches("[data-club-create-form]")) {
      const name = val("name").trim();
      if (name.length < 3) { notice = MESSAGES.BAD_NAME; render(); return; }
      act("titan_club_create_v1", { p_name: name, p_description: val("desc").trim() || null, p_discoverable: draft.open === true }, () => { draft.name = draft.desc = ""; draft.open = false; });
    }
  });
  document.addEventListener("click", (e) => {
    const t = e.target.closest?.("#clubs button");
    if (!t || !root) return;
    const club = (id) => (data || []).find((c) => c.id === id);
    if (t.dataset.clubReport !== undefined) { reporting = { club: t.dataset.clubReport, announcement: t.dataset.ann || null }; render(); root.querySelector("[data-club-report-form] select")?.focus(); return; }
    if (t.matches("[data-club-report-cancel]")) { reporting = null; render(); return; }
    if (t.dataset.seasonForm) { seasonForm[t.dataset.seasonForm] = true; render(); root.querySelector(`[data-season-create-form] input`)?.focus(); return; }
    if (t.dataset.seasonFormCancel) { seasonForm[t.dataset.seasonFormCancel] = false; render(); return; }
    if (t.dataset.seasonAct) {
      const S = CS(), id = t.dataset.clubId, action = t.dataset.seasonAct, view = seasons[id];
      const run = () => act("titan_club_season_act_v1", { p_club: id, p_action: action, p_title: null, p_pace: null, p_weeks: null, p_starts_on: null, p_days: action === "postpone" ? Number(t.dataset.days) : null }, () => { notice = S.result(action); });
      const ask = S.confirmText(action, view && view.current);
      if (ask && window.titanShell?.confirm) window.titanShell.confirm({ title: ask.title, message: ask.message, confirmLabel: ask.confirm, action: async () => { run(); } });
      else run();
      return;
    }
    if (t.dataset.agendaForm) { agendaForm[t.dataset.agendaForm] = true; render(); root.querySelector(`[data-agenda-create-form] input`)?.focus(); return; }
    if (t.dataset.agendaFormCancel) { agendaForm[t.dataset.agendaFormCancel] = false; render(); return; }
    if (t.dataset.agendaMoveCancel) { agendaMove[t.dataset.agendaMoveCancel] = false; render(); return; }
    if (t.dataset.agendaAct) {
      const A = CA(), id = t.dataset.clubId, slot = t.dataset.slot, action = t.dataset.agendaAct, on = t.dataset.on == null ? null : t.dataset.on === "true";
      if (action === "move") { agendaMove[slot] = true; render(); root.querySelector(`[data-agenda-move-form="${CSS.escape(slot)}"] input`)?.focus(); return; }
      const run = () => act("titan_club_agenda_act_v1", agendaArgs(id, action, { p_slot: slot, p_answer: t.dataset.answer || null, p_on: on }), (answer) => {
        const fresh = [...(answer?.upcoming || []), ...(answer?.past || [])].find((x) => x.id === slot);
        notice = (action === "answer" && A.answered(fresh)) || A.result(action, t.dataset.answer);
      });
      const ask = A.confirmText(action);
      if (ask && window.titanShell?.confirm) window.titanShell.confirm({ title: ask.title, message: ask.message, confirmLabel: ask.confirm, action: async () => { run(); } });
      else run();
      return;
    }
    if (t.dataset.agendaSeries) {
      const A = CA(), id = t.dataset.clubId, action = t.dataset.agendaSeries;
      const run = () => act("titan_club_agenda_act_v1", agendaArgs(id, action, { p_event: t.dataset.event }), () => { notice = A.result(action); });
      const ask = A.confirmText(action);
      if (ask && window.titanShell?.confirm) window.titanShell.confirm({ title: ask.title, message: ask.message, confirmLabel: ask.confirm, action: async () => { run(); } });
      else run();
      return;
    }
    if (t.dataset.agendaMove) {
      const A = CA(), id = t.dataset.clubId, slot = t.dataset.agendaMove, view = agendas[id];
      const cur = (view?.upcoming || []).find((x) => x.id === slot);
      const at = A.parisInstant(val("agenda-mdate-" + slot) || (cur && parisDate(cur.startsAt)), val("agenda-mtime-" + slot) || (cur && parisTime(cur.startsAt)));
      const nowMs = Date.now();
      if (!at || Date.parse(at) < nowMs + A.RULE.leadMinutes * 60000 || Date.parse(at) > nowMs + A.RULE.horizonDays * 86400000) { notice = A.MESSAGES.AGENDA_INVALID; render(); return; }
      act("titan_club_agenda_act_v1", agendaArgs(id, "move", { p_slot: slot, p_starts_at: at }), () => { agendaMove[slot] = false; delete draft["agenda-mdate-" + slot]; delete draft["agenda-mtime-" + slot]; notice = A.result("move"); });
      return;
    }
    if (t.dataset.agendaLink) {
      const A = CA(), id = t.dataset.clubId, slot = t.dataset.agendaLink, view = agendas[id];
      const cur = [...(view?.upcoming || []), ...(view?.past || [])].find((x) => x.id === slot);
      const log = val("agenda-log-" + slot) || A.candidates(cur)[0]?.id;
      if (!log) return;
      act("titan_club_agenda_act_v1", agendaArgs(id, "link", { p_slot: slot, p_log: log }), () => { delete draft["agenda-log-" + slot]; notice = A.result("link"); });
      return;
    }
    if (t.dataset.matchForm) { matchForm[t.dataset.matchForm] = t.dataset.kind; matchPreview[t.dataset.matchForm] = null; render(); root.querySelector(`[data-club-match="${CSS.escape(t.dataset.matchForm)}"] select, [data-club-match="${CSS.escape(t.dataset.matchForm)}"] input`)?.focus(); return; }
    if (t.dataset.matchFormCancel) { matchForm[t.dataset.matchFormCancel] = null; matchPreview[t.dataset.matchFormCancel] = null; render(); return; }
    if (t.dataset.matchPreview) { previewMatch(t.dataset.matchPreview); return; }
    if (t.dataset.matchAccept || t.dataset.matchRefuse) {
      const M = CM(), id = t.dataset.matchAccept || t.dataset.matchRefuse, action = t.dataset.matchAccept ? "accept" : "refuse", pv = matchPreview[id];
      if (!pv || !pv.found) return;
      const run = () => act("titan_club_match_act_v1", matchArgs(id, action, { p_match: pv.found.id }), () => {
        matchForm[id] = null; matchPreview[id] = null; delete draft["match-code-" + id]; notice = M.result(action);
      });
      const ask = M.confirmText(action, null);
      if (ask && window.titanShell?.confirm) window.titanShell.confirm({ title: ask.title, message: ask.message, confirmLabel: ask.confirm, action: async () => { run(); } });
      else run();
      return;
    }
    if (t.dataset.matchAct) {
      const M = CM(), id = t.dataset.clubId, action = t.dataset.matchAct, view = matches[id];
      const run = () => act("titan_club_match_act_v1", matchArgs(id, action), () => { notice = M.result(action); });
      const ask = M.confirmText(action, view && view.current);
      if (ask && window.titanShell?.confirm) window.titanShell.confirm({ title: ask.title, message: ask.message, confirmLabel: ask.confirm, action: async () => { run(); } });
      else run();
      return;
    }
    if (t.dataset.clubAnnounce) {
      const id = t.dataset.clubAnnounce, body = val("ann-" + id).trim();
      if (!body) { notice = MESSAGES.BAD_ANNOUNCEMENT; render(); return; }
      act("titan_club_announce_v1", { p_club: id, p_body: body }, () => { delete draft["ann-" + id]; });
    } else if (t.dataset.clubAnnRemove) act("titan_club_announce_remove_v1", { p_announcement: t.dataset.clubAnnRemove });
    else if (t.dataset.clubGoal) {
      const id = t.dataset.clubGoal, raw = val("goal-" + id).trim(), minutes = Number(raw || weeks[id]?.goal || 0);
      if (!Number.isInteger(minutes) || minutes < 60 || minutes > 100000) { notice = MESSAGES.CLUB_GOAL_INVALID; render(); return; }
      act("titan_club_goal_set_v1", { p_club: id, p_minutes: minutes }, () => { delete draft["goal-" + id]; });
    }
    else if (t.dataset.clubCodeNew) {
      const c = club(t.dataset.clubCodeNew);
      if (c) act("titan_club_set_v1", { p_club: c.id, p_name: c.name, p_description: c.description, p_discoverable: c.discoverable, p_new_code: true });
    } else if (t.dataset.clubDiscover) {
      const c = club(t.dataset.clubDiscover);
      if (c) act("titan_club_set_v1", { p_club: c.id, p_name: c.name, p_description: c.description, p_discoverable: t.dataset.on === "true", p_new_code: false });
    } else if (t.dataset.clubJoinId) act("titan_club_join_v1", { p_code: null, p_club: t.dataset.clubJoinId });
    else if (t.dataset.clubLeave || t.dataset.clubKick) {
      const kick = Boolean(t.dataset.clubKick), id = t.dataset.clubKick || t.dataset.clubLeave, name = t.dataset.name || "";
      const run = () => act(kick ? "titan_club_member_remove_v1" : "titan_club_leave_v1", kick ? { p_club: id, p_user: t.dataset.user } : { p_club: id });
      if (window.titanShell?.confirm) {
        window.titanShell.confirm({
          title: kick ? `Retirer ${name} ?` : `Quitter ${name} ?`,
          message: kick ? "Cette personne quitte le club et ne pourra pas le rejoindre de nouveau avec le code." : "Tu ne verras plus les annonces de ce club. Tu pourras le rejoindre de nouveau avec le code.",
          confirmLabel: kick ? "Retirer" : "Quitter",
          action: async () => { run(); },
        });
      } else run();
    }
  });
  window.addEventListener("titan:account-changing", () => { owner = null; reset(); render(); });
  ["titan:account-changed", "titan:flags-updated", "online"].forEach((ev) => window.addEventListener(ev, () => { sync(); refresh(); }));
  window.TitanClubs = { refresh };
  function boot() {
    root = document.getElementById("clubs"); if (!root) return; root.hidden = true;
    // V1.8.6: an invitation link (/social.html?rdv=CODE) is read once, then removed from the address so that a reload does not ask again.
    try {
      const params = new URLSearchParams(location.search), code = params.get("rdv");
      if (code && window.TitanClubAgenda) {
        invitePending = window.TitanClubAgenda.code(code);
        params.delete("rdv");
        history.replaceState(history.state, "", `${location.pathname}${params.toString() ? `?${params}` : ""}${location.hash || "#clubs"}`);
      }
    } catch { /* an address without a query */ }
    setTimeout(refresh, 0);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
