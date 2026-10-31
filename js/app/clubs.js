/* V11-71 (COM-C8): club spaces under the Communauté. A club is private by default, joined with a code that only its administrators see, and
   discoverable only if an administrator chooses so. Administrators write announcements and moderate; members only see the name, the
   description, the number of members and the announcements, never another member. No XP, credit, ranking or prize. Shown only when the server
   flag screens.clubs is on, to a signed-in account, and when the server has the functions. Every answer is applied only if the account, the
   client and the epoch are still the ones that asked. All text is escaped. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const FLAG = "screens.clubs";
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
  let reporting = null;         // { club, announcement } the report form being filled, if any

  const context = () => ({ owner: window.state?.user?.id || null, client: window.titanClient || null, epoch: window.titanAccountTransition?.epoch });
  const same = (a, b) => a && b && a.owner === b.owner && a.client === b.client && a.epoch === b.epoch && !window.titanAccountTransition?.active;
  const guest = () => !context().owner || String(context().owner).startsWith("guest_");
  const on = () => !guest() && window.titanFlags?.enabled?.(FLAG, false) === true;
  const n = (v) => window.TitanFormat.number(v);
  const failure = (error) => {
    const code = Object.keys(MESSAGES).find((k) => String(error?.message || "").includes(k));
    return code ? MESSAGES[code] : "Le serveur ne répond pas pour l’instant. Réessaie dans un moment.";
  };
  const date = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }); };

  function reset() { data = null; discover = []; flight = null; missing = false; busy = false; notice = ""; draft = {}; openRoster = new Set(); reporting = null; }
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
        const [mine, found] = await Promise.all([ask.client.rpc("titan_club_my_v1"), ask.client.rpc("titan_club_discover_v1")]);
        if (!same(ask, context())) return;
        if (mine.error) { if (missingFn(mine.error)) missing = true; else notice = failure(mine.error); return; }
        if (Array.isArray(mine.data)) { data = mine.data; notice = ""; }
        discover = Array.isArray(found.data) ? found.data : [];
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
      if (error) notice = failure(error); else after?.(answer);
    } catch (error) {
      if (same(ask, context())) notice = failure(error);
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
      <div class="asc-row"><button type="submit" class="asc-btn asc-btn-primary asc-btn-sm" ${busy ? "disabled" : ""}>Envoyer le signalement</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-club-report-cancel>Annuler</button></div></form>`;
  }

  function clubHtml(c) {
    const admin = c.role === "admin";
    const ann = (c.announcements || []).map((a) => `<li class="asc-between" data-club-ann="${esc(a.id)}"><span><span class="asc-small asc-muted">${esc(date(a.at))}</span><br>${esc(a.body)}</span><span class="asc-row">${admin ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-club-ann-remove="${esc(a.id)}" aria-label="Retirer cette annonce">Retirer</button>` : ""}${a.mine ? "" : `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-club-report="${esc(c.id)}" data-ann="${esc(a.id)}" aria-label="Signaler cette annonce">Signaler</button>`}</span></li>`).join("");
    const roster = admin ? `<details class="asc-small" data-club-roster="${esc(c.id)}" ${openRoster.has(c.id) ? "open" : ""}><summary>Membres (${n(c.members)})</summary><ul class="rv-list">${(c.roster || []).map((m) => `<li class="asc-between"><span>${esc(m.name)}${m.role === "admin" ? " · administrateur" : ""}</span>${m.role === "admin" ? "" : `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-club-kick="${esc(c.id)}" data-user="${esc(m.userId)}" data-name="${esc(m.name)}">Retirer</button>`}</li>`).join("")}</ul></details>` : "";
    const tools = admin ? `<div class="asc-stack">
        <p class="asc-small">Code pour inviter : <strong data-club-code>${esc(c.code)}</strong></p>
        <label class="asc-field"><span>Nouvelle annonce</span><textarea class="asc-input" maxlength="500" rows="2" data-club-draft="ann-${esc(c.id)}">${esc(val("ann-" + c.id))}</textarea></label>
        <div class="asc-row"><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-club-announce="${esc(c.id)}" ${busy ? "disabled" : ""}>Publier</button>
          <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-club-code-new="${esc(c.id)}" ${busy ? "disabled" : ""}>Renouveler le code</button>
          <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-club-discover="${esc(c.id)}" data-on="${c.discoverable ? "false" : "true"}" ${busy ? "disabled" : ""}>${c.discoverable ? "Ne plus afficher dans la liste" : "Afficher dans la liste"}</button></div></div>` : "";
    return `<article class="asc-panel qg-steps-card" data-club="${esc(c.id)}"><p><strong>${esc(c.name)}</strong> <span class="asc-small asc-muted">· ${n(c.members)} membre${Number(c.members) > 1 ? "s" : ""}${admin ? " · tu administres" : ""}${c.discoverable ? " · visible dans la liste" : " · privé"}</span></p>
      ${c.description ? `<p class="asc-small asc-muted">${esc(c.description)}</p>` : ""}
      ${ann ? `<ul class="rv-list" data-club-announcements>${ann}</ul>` : `<p class="asc-small asc-faint">Pas d’annonce pour l’instant.</p>`}
      ${tools}${roster}
      ${reporting && reporting.club === c.id ? reportForm(c) : ""}
      <div class="asc-row"><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-club-report="${esc(c.id)}" data-ann="">Signaler ce club</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-club-leave="${esc(c.id)}" data-name="${esc(c.name)}" ${busy ? "disabled" : ""}>Quitter le club</button></div></article>`;
  }

  function render() {
    if (!root) return;
    if (!on() || missing || !data) { root.innerHTML = ""; root.hidden = true; return; }
    root.hidden = false;
    const lock = busy ? "disabled" : "";
    const found = discover.map((c) => `<li class="asc-between" data-club-found="${esc(c.id)}"><span><strong>${esc(c.name)}</strong> <span class="asc-small asc-muted">· ${n(c.members)} membre${Number(c.members) > 1 ? "s" : ""}</span>${c.description ? `<br><span class="asc-small asc-muted">${esc(c.description)}</span>` : ""}</span><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-club-join-id="${esc(c.id)}" ${lock}>Rejoindre</button></li>`).join("");
    root.innerHTML = `<section class="asc-section asc-appear" aria-labelledby="club-title"><div class="asc-section-head"><h2 id="club-title">Clubs</h2></div>
      <p class="asc-small asc-muted">Un espace privé pour ton club ou ton groupe : annonces des administrateurs, rien d’autre n’est partagé. Les membres ne voient pas les autres membres, ni leurs séances. Aucun XP ni classement.</p>
      ${notice ? `<p class="asc-small" role="status" data-club-notice>${esc(notice)}</p>` : ""}
      <div class="asc-stack">${data.map(clubHtml).join("")}</div>
      <form class="asc-panel asc-stack" data-club-join-form novalidate><h3>Rejoindre avec un code</h3>
        <label class="asc-field"><span>Code du club</span><input class="asc-input" maxlength="12" autocomplete="off" autocapitalize="characters" data-club-draft="code" value="${esc(val("code"))}"></label>
        <div class="asc-row"><button type="submit" class="asc-btn asc-btn-primary asc-btn-sm" ${lock}>Rejoindre</button></div></form>
      ${found ? `<div class="asc-panel"><h3>Clubs ouverts</h3><ul class="rv-list" data-club-list>${found}</ul></div>` : ""}
      <form class="asc-panel asc-stack" data-club-create-form novalidate><h3>Créer un club</h3>
        <label class="asc-field"><span>Nom</span><input class="asc-input" maxlength="60" data-club-draft="name" value="${esc(val("name"))}"></label>
        <label class="asc-field"><span>Description (facultatif)</span><input class="asc-input" maxlength="300" data-club-draft="desc" value="${esc(val("desc"))}"></label>
        <label class="auth-check"><input type="checkbox" data-club-draft-check="open" ${draft.open ? "checked" : ""}><span>Afficher ce club dans la liste des clubs ouverts</span></label>
        <div class="asc-row"><button type="submit" class="asc-btn asc-btn-primary asc-btn-sm" ${lock}>Créer le club</button></div></form></section>`;
  }

  document.addEventListener("input", (e) => {
    const f = e.target.closest?.("#clubs [data-club-draft]");
    if (f) draft[f.dataset.clubDraft] = f.value;
    const c = e.target.closest?.("#clubs [data-club-draft-check]");
    if (c) draft[c.dataset.clubDraftCheck] = c.checked;
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
    if (t.dataset.clubAnnounce) {
      const id = t.dataset.clubAnnounce, body = val("ann-" + id).trim();
      if (!body) { notice = MESSAGES.BAD_ANNOUNCEMENT; render(); return; }
      act("titan_club_announce_v1", { p_club: id, p_body: body }, () => { delete draft["ann-" + id]; });
    } else if (t.dataset.clubAnnRemove) act("titan_club_announce_remove_v1", { p_announcement: t.dataset.clubAnnRemove });
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
  function boot() { root = document.getElementById("clubs"); if (!root) return; root.hidden = true; setTimeout(refresh, 0); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
