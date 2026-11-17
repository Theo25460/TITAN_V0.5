/* La Grande Cordée on the website (social lot C). Server-owned: titan_cordees_v1 counts the longueurs, the summit and the title;
   js/core/cordee.js only words them. Behind the server flag screens.cordee. A player always reads the common goal, their part, the
   group's progress and what was unlocked; names follow the challenge rule (friends and link partners only). Nothing is XP or credit. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n) => window.titanIcon(n);
  const C = () => window.TitanCordee;
  const FLAG = "screens.cordee";
  const MESSAGES = {
    FEATURE_DISABLED: "La Grande Cordée n’est pas encore ouverte sur ton compte.",
    CORDEE_INVALID: "Choisis une route, une allure et une durée.",
    CORDEE_INVITEES: "Sept amis au plus : les autres peuvent rejoindre par lien.",
    CORDEE_LIMIT_3: "Tu mènes déjà trois cordées en cours.",
    SOCIAL_RATE_LIMIT: "Beaucoup de cordées créées aujourd’hui. Réessaie demain.",
    CHALLENGE_TRANSITION_INVALID: "Cette cordée a déjà changé d’état.",
    CHALLENGE_NOT_FOUND: "Cette cordée n’existe plus.",
    CHALLENGE_ENDED: "Cette cordée est terminée.",
    LINK_LIMIT_5: "Cinq liens sont déjà en attente pour cette cordée.",
    NOT_EARNED: "Ce titre n’est pas encore acquis.",
  };

  let root = null;
  let data = null;
  let scope = null;
  let flight = null;
  let missing = false;
  let busy = false;
  let notice = "";

  const context = () => ({ owner: window.state?.user?.id || null, client: window.titanClient || null, epoch: window.titanAccountTransition?.epoch });
  const same = (a, b) => a && b && a.owner === b.owner && a.client === b.client && a.epoch === b.epoch && !window.titanAccountTransition?.active;
  const guest = () => !context().owner || String(context().owner).startsWith("guest_");
  const on = () => !guest() && !window.titanAccountTransition?.active && window.titanFlags?.enabled?.(FLAG, false) === true;
  const n = (v) => window.TitanFormat.number(Number(v) || 0);
  const failure = (error) => {
    const code = Object.keys(MESSAGES).find((k) => String(error?.message || "").includes(k));
    return code ? MESSAGES[code] : navigator.onLine ? "Le serveur ne répond pas pour l’instant. Réessaie dans un moment." : "Hors ligne : la cordée revient avec le réseau.";
  };
  const date = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }); };
  const daysLeft = (iso) => Math.max(0, Math.ceil((new Date(iso) - Date.now()) / 86400000));

  function reset() { data = null; flight = null; missing = false; busy = false; notice = ""; }
  function sync() { const next = context(); if (!same(scope, next)) { scope = next; reset(); } }

  async function rpc(ask, name, args = {}) {
    const { data: auth } = await ask.client.auth.getSession();
    const session = auth?.session;
    if (!on() || !same(ask, context()) || session?.user?.id !== ask.owner || !session?.access_token) throw new Error("AUTH_REQUIRED");
    const { data: answer, error } = await ask.client.rpc(name, args).setHeader("Authorization", `Bearer ${session.access_token}`);
    if (error) throw error;
    return answer;
  }

  async function refresh() {
    sync();
    if (!root || !on() || missing || !navigator.onLine) return render();
    if (flight) return flight;
    const ask = context();
    flight = (async () => {
      try {
        const answer = await rpc(ask, "titan_cordees_v1");
        if (!same(ask, context())) return;
        data = answer && Array.isArray(answer.cordees) ? answer : { cordees: [], titles: [] };
        notice = "";
      } catch (error) {
        if (!same(ask, context())) return;
        if (error?.code === "PGRST202" || /Could not find/.test(error?.message || "")) missing = true;
        else notice = failure(error);
      } finally {
        flight = null;
        if (same(ask, context())) render();
      }
    })();
    return flight;
  }

  async function act(fn, ok) {
    sync();
    if (busy || !on()) return;
    const ask = context();
    busy = true; notice = ""; render();
    try {
      await fn(ask);
      if (ok && same(ask, context())) window.titanShell?.toast?.({ type: "ok", ...ok });
    } catch (error) {
      if (same(ask, context())) notice = failure(error);
    } finally {
      busy = false;
      if (same(ask, context())) { const message = notice; await refresh(); notice = message || notice; render(); }
    }
  }

  /* ---------- one cordée ---------- */
  function campsHtml(c, words) {
    const route = words.route;
    return `<ol class="cm-cordee-camps" aria-label="Camps de la route">${route.camps.map(([name], i) => {
      const reached = i < Number(c.camps);
      return `<li data-reached="${reached}"><span class="cm-cordee-camp-dot" aria-hidden="true">${reached ? icon("check") : i + 1}</span><span>${esc(name)}${reached ? "" : ` <small class="asc-faint">${(i + 1) * 25} %</small>`}</span></li>`;
    }).join("")}</ol>`;
  }

  function membersHtml(c) {
    const F = C().FAMILIES;
    // A member the player may not see is only « Membre de la cordée »: the server sends nothing personal, so no bar either.
    return `<ul class="cm-board cm-cordee-members">${(c.members || []).map((m) => `<li><span>${esc(m.me ? "Toi" : m.name)}${m.status === "invited" ? ' <small class="asc-faint">invité</small>' : ""}${(m.families || []).length ? ` <small class="asc-faint">${esc(m.families.map((f) => F[f]?.label || f).join(", "))}</small>` : ""}</span>
      ${m.status === "joined" && m.pitches != null ? `<span class="asc-ascent thin" aria-hidden="true"><span style="--p:${Math.min(100, Math.round((Number(m.pitches) / Math.max(1, Number(c.share))) * 100))}%"></span></span><strong class="asc-num">${n(m.pitches)}${m.strand ? ` ${icon("check")}` : ""}</strong>` : "<span></span><span></span>"}</li>`).join("")}</ul>`;
  }

  function cordeeHtml(c) {
    const words = C().explain(c);
    const lock = busy ? "disabled" : "";
    const status = c.status === "summited" ? "Sommet atteint" : c.status === "ended" ? "Terminée" : `${daysLeft(c.endsAt)} j`;
    let actions = "";
    if (c.myStatus === "invited" && c.status === "active") {
      actions = `<div class="asc-actions"><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-cordee-join="${esc(c.id)}" ${lock}>S’encorder</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-cordee-decline="${esc(c.id)}" ${lock}>Décliner</button></div>`;
    } else if (c.status === "summited" && c.earned) {
      actions = `<div class="asc-actions"><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-cordee-wear="${esc(c.route)}" ${lock}>${icon("medal")} Porter « ${esc(words.title)} »</button>
        <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-cordee-share="${esc(c.id)}" ${lock}>${icon("share")} Partager ce sommet</button></div>`;
    } else if (c.status === "active" && c.myStatus === "joined") {
      actions = `<div class="asc-actions">${c.mine ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-cordee-link="${esc(c.id)}" ${lock}>${icon("link")} Inviter par lien</button>` : ""}<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-cordee-leave="${esc(c.id)}" ${lock}>Quitter la cordée</button></div>`;
    }
    return `<article class="asc-panel cm-cordee-card" data-cordee="${esc(c.id)}" data-status="${esc(c.status)}">
      <div class="asc-between"><h3>${esc(words.route.name)}</h3><span class="asc-chip">${esc(status)}</span></div>
      <p class="asc-small asc-muted">${esc(words.route.intro)}</p>
      <p data-cordee-goal><strong>${esc(words.goal)}</strong></p>
      <div class="cm-exp-bar"><div class="asc-between"><span>La cordée</span><strong class="asc-num">${n(c.total)} / ${n(c.target)}</strong></div>
        <span class="asc-ascent" role="progressbar" aria-label="Progression de la cordée" aria-valuemin="0" aria-valuemax="${Number(c.target)}" aria-valuenow="${Math.min(Number(c.target), Number(c.total))}"><span style="--p:${Number(c.percent)}%"></span></span></div>
      ${campsHtml(c, words)}
      <p class="asc-small" data-cordee-mine>${esc(words.mine)}</p>
      <p class="asc-small asc-muted" data-cordee-group>${esc(words.group)} ${esc(words.variety)}</p>
      <p class="asc-small ${words.summited ? "cy" : "asc-muted"}" data-cordee-unlocked>${esc(words.unlocked)}</p>
      ${words.summited ? `<p class="asc-small">${esc(words.route.camps[3][1])}</p>` : words.next ? `<p class="asc-small asc-faint">Prochain camp : ${esc(words.next.name)} à ${n(words.next.at)} longueurs.</p>` : ""}
      ${membersHtml(c)}
      ${actions}
    </article>`;
  }

  function render() {
    if (!root) return;
    sync();
    if (!on() || missing || (!data && !notice)) { root.innerHTML = ""; root.hidden = true; return; }
    root.hidden = false;
    const list = data?.cordees || [];
    const lock = busy ? "disabled" : "";
    root.innerHTML = `<div class="asc-section-head"><h2 id="cordee-title">La Grande Cordée</h2><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-cordee-new ${lock}>${icon("plus")} Former une cordée</button></div>
      <p class="cm-section-intro">Une expédition à plusieurs, chacun avec son sport. Un jour avec 12 minutes d’effort confirmé apporte une longueur, 35 minutes deux : la régularité compte plus que le volume, et chaque famille de sport ouvre des longueurs en plus.</p>
      ${notice ? `<p class="asc-small" role="status" data-cordee-notice>${esc(notice)}</p>` : ""}
      ${list.length ? `<div class="asc-stack">${list.map(cordeeHtml).join("")}</div>` : `<p class="asc-small asc-muted" data-cordee-empty>Pas encore de cordée. Forme-en une avec tes amis — coureurs, grimpeurs, nageurs ou yogis : tout le monde compte pareil. Seul·e aussi, ça marche.</p>`}
      <p class="asc-small asc-faint">Seules les séances confirmées par TITAN comptent. Au sommet : un titre de route, jamais d’XP ni de crédit. Rien ne se perd si tu te reposes.</p>`;
  }

  /* ---------- forming a cordée ---------- */
  async function form(ask) {
    let friends = [];
    // A pace that fits what the player already does (never more): the suggestion of the digest when it is known.
    const pace = window.TitanCordeeView?.suggestedPace || "reguliere";
    try {
      const overview = await rpc(ask, "titan_social_overview");
      friends = Array.isArray(overview?.friends) ? overview.friends : [];
    } catch { /* friends stay empty: a link still works */ }
    if (!same(ask, context())) return;
    const K = C();
    const body = document.createElement("form");
    body.className = "asc-stack";
    body.noValidate = true;
    body.innerHTML = `<fieldset class="pf-privacy"><legend class="seance-label">Route</legend>${Object.values(K.ROUTES).map((r, i) => `<label class="auth-check"><input type="radio" name="route" value="${esc(r.id)}" ${i === 0 ? "checked" : ""}><span><strong>${esc(r.name)}</strong> · ${esc(r.world)}<br><small class="asc-muted">${esc(r.intro)}</small></span></label>`).join("")}</fieldset>
      <fieldset class="pf-privacy"><legend class="seance-label">Allure</legend>${Object.values(K.PACES).map((p) => `<label class="auth-check"><input type="radio" name="pace" value="${esc(p.id)}" ${p.id === pace ? "checked" : ""}><span><strong>${esc(p.label)}</strong><br><small class="asc-muted">${esc(p.text)}</small></span></label>`).join("")}</fieldset>
      <label class="asc-field"><span>Durée</span><select name="days">${K.DAYS.map((d) => `<option value="${d}" ${d === 14 ? "selected" : ""}>${d} jours</option>`).join("")}</select></label>
      <fieldset class="pf-privacy"><legend class="seance-label">Inviter des amis</legend><p class="asc-small asc-muted">${friends.length ? "Coche jusqu’à sept amis. Chacun accepte ou décline ; tu pourras aussi inviter par lien." : "Tu pourras inviter par lien une fois la cordée formée."}</p>${friends.map((f) => `<label class="auth-check"><input type="checkbox" name="invite" value="${esc(f.id)}"><span>${esc(f.name)}</span></label>`).join("")}</fieldset>
      <p class="asc-small asc-faint" data-cordee-preview></p>
      <p class="asc-small jr-edit-error" role="alert"></p>
      <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-cancel>Annuler</button><button type="submit" class="asc-btn asc-btn-primary">Former la cordée</button></div>`;
    const d = window.titanShell.sheet({ title: "Former une cordée", eyebrow: "Grande Cordée", body });
    const preview = () => {
      const v = new FormData(body);
      const share = K.share(String(v.get("pace")), Number(v.get("days")));
      body.querySelector("[data-cordee-preview]").textContent = `Chaque membre encordé ajoute ${share} longueurs à l’objectif commun ; la part de chacun compte jusqu’à ${K.cap(share)}.`;
    };
    preview();
    body.addEventListener("change", preview);
    body.addEventListener("click", (e) => { if (e.target.closest("[data-cancel]")) d.close(); });
    body.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!same(ask, context()) || busy) return;
      const v = new FormData(body);
      const invitees = v.getAll("invite").map(String);
      const err = body.querySelector(".jr-edit-error");
      err.textContent = "";
      if (invitees.length > 7) { err.textContent = MESSAGES.CORDEE_INVITEES; return; }
      busy = true;
      body.querySelector("[type=submit]").disabled = true;
      try {
        await rpc(ask, "titan_cordee_create_v1", { p_route: String(v.get("route")), p_pace: String(v.get("pace")), p_days: Number(v.get("days")), p_invitees: invitees });
        busy = false;
        d.close();
        window.titanShell?.toast?.({ type: "ok", title: "Cordée formée", message: invitees.length ? "Tes amis la trouvent dans leur Communauté." : "Invite par lien qui tu veux." });
        await refresh();
      } catch (error) {
        busy = false;
        body.querySelector("[type=submit]").disabled = false;
        err.textContent = failure(error);
      }
    });
  }

  async function shareLink(ask, id) {
    const r = await rpc(ask, "titan_challenge_link_create_v1", { p_challenge: id });
    const url = `${location.origin}/defi?t=${r?.token}`;
    let shared = false;
    try { if (navigator.share) { await navigator.share({ title: "La Grande Cordée", text: "Viens t’encorder avec ton sport :", url }); shared = true; } } catch {}
    if (!shared) { try { await navigator.clipboard.writeText(url); } catch {} }
    window.titanShell?.toast?.({ type: "ok", title: shared ? "Lien partagé" : "Lien copié", message: url });
  }

  function onClick(e) {
    const b = e.target.closest?.("#cordee button");
    if (!b || !root) return;
    const ask = context();
    if (!same(scope, ask)) return;
    const find = (id) => (data?.cordees || []).find((c) => c.id === id);
    if (b.hasAttribute("data-cordee-new")) return form(ask);
    if (b.dataset.cordeeJoin) return act((a) => rpc(a, "titan_challenge_respond", { p_id: b.dataset.cordeeJoin, p_action: "join" }), { title: "Tu es encordé", message: "Tes séances confirmées comptent dès maintenant." });
    if (b.dataset.cordeeDecline) return act((a) => rpc(a, "titan_challenge_respond", { p_id: b.dataset.cordeeDecline, p_action: "decline" }));
    if (b.dataset.cordeeLink) return act((a) => shareLink(a, b.dataset.cordeeLink));
    if (b.dataset.cordeeWear) return act((a) => rpc(a, "titan_set_displayed_title", { p_key: `cordee:${b.dataset.cordeeWear}` }), { title: "Titre porté", message: C().ROUTES[b.dataset.cordeeWear]?.title || "" });
    if (b.dataset.cordeeShare) {
      const c = find(b.dataset.cordeeShare);
      if (!c) return;
      const words = C().explain(c);
      const members = (c.members || []).filter((m) => m.status === "joined").length;
      return act((a) => rpc(a, "titan_moment_share", { p_kind: "challenge", p_title: `Sommet : ${words.route.name}`, p_detail: `En cordée à ${members} · ${n(c.total)} longueurs`, p_sport: null, p_log_id: null, p_visibility: "friends" }),
        { title: "Sommet partagé", message: "Tes amis le voient dans leurs Moments." });
    }
    if (b.dataset.cordeeLeave) {
      const id = b.dataset.cordeeLeave;
      return window.titanShell.confirm({ title: "Quitter la cordée ?", message: "Tes longueurs ne compteront plus pour la cordée, et l’objectif commun diminue de ta part.", confirmLabel: "Quitter",
        action: async () => { await act((a) => rpc(a, "titan_challenge_respond", { p_id: id, p_action: "leave" })); } });
    }
  }

  function start() {
    root = document.getElementById("cordee");
    if (!root) return;
    refresh().then(() => {
      if (location.hash === "#cordee" && !root.hidden) requestAnimationFrame(() => { root.scrollIntoView({ block: "start" }); root.focus({ preventScroll: true }); });
    });
  }
  document.addEventListener("click", onClick);
  window.addEventListener("titan:account-changing", () => { scope = null; reset(); render(); });
  ["titan:account-changed", "titan:flags-updated", "titan:history-updated", "online"].forEach((ev) => window.addEventListener(ev, () => { sync(); refresh(); }));
  window.TitanCordeeView = { refresh };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0)); else setTimeout(start, 0);
})();
