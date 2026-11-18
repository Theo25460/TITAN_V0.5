/* TITAN 300 — Communauté: an expedition everyone pushes, friends who agreed, Moments that matter,
   challenges without stakes and a guild with a shared week. No endless feed, nothing public by default.
   The page has one spine: who is with me (the circle, on the coral field), what we are doing together now (one scene, the
   others one tap away), what happened (since the last visit, Moments), then the circle to manage (invite, code, sent, blocks). */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const F = () => window.TitanFormat;
  const SP = () => window.TitanSports;
  const DAY = 86400000;
  const METRICS = {
    effort_minutes: { label: "Minutes d’effort", short: "min d’effort", fmt: (v) => `${F().number(v)} min` },
    active_days: { label: "Jours actifs", short: "jours actifs", fmt: (v) => `${F().number(v)} j` },
    sessions: { label: "Séances", short: "séances", fmt: (v) => F().number(v) },
    distance_km: { label: "Distance d’un sport", short: "km", fmt: (v) => F().distance(v) },
  };
  const KIND_ICON = { record: "star", goal: "flag", chapter: "compass", milestone: "medal", session: "bolt", challenge: "target", expedition: "mountain", week: "calendar" };
  const SECTIONS = [
    { id: "moments", title: "Moments", icon: "heart", description: "Les progrès que chacun choisit de partager." },
    { id: "amis", title: "Amis", icon: "group", description: "Ton cercle, tes demandes et ton code ami." },
    { id: "defis", title: "Défis", icon: "target", description: "Un objectif entre amis, sans mise." },
    { id: "guilde", title: "Guilde", icon: "shield", description: "Une équipe, un objectif et une discussion." },
  ];

  /* AUD-11: an invitation link /social?ami=TN-…|guilde=G-… pre-fills the matching field once, and survives sign-up through ?next=.
     Only well-formed codes are read; the server still checks the code, the consent and the blocks. */
  const INVITE = (() => {
    try {
      const q = new URLSearchParams(location.search);
      const ami = String(q.get("ami") || "").trim().toUpperCase();
      const guilde = String(q.get("guilde") || "").trim().toUpperCase();
      // Social lot A: a personal invitation link (/social?invitation=<64 hex>) works without the inviter being findable.
      const invitation = String(q.get("invitation") || "").trim().toLowerCase();
      return { ami: /^TN-[A-Z0-9]{4,10}$/.test(ami) ? ami : "", guilde: /^G-[A-Z0-9]{4,10}$/.test(guilde) ? guilde : "",
        invitation: /^[0-9a-f]{64}$/.test(invitation) ? invitation : "" };
    } catch { return { ami: "", guilde: "", invitation: "" }; }
  })();
  let inviteApplied = false;
  /* The invitation card: null until the preview answered, then { valid, inviter, own, friends } or { done } once answered. */
  let invitation = null;
  const inviteNext = () => (INVITE.ami || INVITE.guilde || INVITE.invitation ? `next=${encodeURIComponent(location.pathname + location.search)}` : "");
  const friendLink = (code) => `${location.origin}/social?ami=${encodeURIComponent(code)}`;
  /* Creating personal links opens with the server flag screens.friendlinks (an opened link is always readable). */
  const linksOn = () => window.titanFlags?.enabled?.("screens.friendlinks", false) === true;
  const personalLink = (token) => `${location.origin}/social?invitation=${encodeURIComponent(token)}`;

  let root = null;
  let data = null;
  let guild = null;
  let status = "loading";
  let errorText = "";
  let reportCode = "COMMUNITY_LOAD_FAILED";
  let pending = false; // the server does not offer the Communauté yet
  let sequence = 0;
  let sessionContext = null;
  let viewContext = null;
  let initialSection = true;
  let mutation = null;
  let chosen = null; // the scene the player opened; otherwise the liveliest one is featured
  let navHtml = null;
  let duoHtml = null;
  let shown = null; // the scene on screen
  let wanted = null; // an anchor asked for before its block was drawn (a cordée link, a Duo)

  const owner = () => window.state?.user?.id || null;
  const isGuest = () => !owner() || String(owner()).startsWith("guest_");
  const context = () => ({ owner: owner(), client: window.titanClient, epoch: window.titanAccountTransition?.epoch });
  const current = (job) => !!job && !isGuest() && job.owner === owner() && job.client === window.titanClient
    && job.epoch === window.titanAccountTransition?.epoch && !window.titanAccountTransition?.active;
  const rpc = async (name, params = {}, job = viewContext) => {
    if (!current(job)) throw new Error("COMMUNITY_SESSION_CHANGED");
    const { data: auth, error: authError } = await job.client.auth.getSession();
    if (!current(job)) throw new Error("COMMUNITY_SESSION_CHANGED");
    if (authError) throw authError;
    const session = auth?.session;
    if (!session?.access_token || session.user?.id !== job.owner) throw new Error("COMMUNITY_SESSION_CHANGED");
    // The SDK may look up a different session later in fetchWithAuth. Pin this request's owner.
    const { data: d, error } = await job.client.rpc(name, params).setHeader("Authorization", `Bearer ${session.access_token}`);
    if (!current(job)) throw new Error("COMMUNITY_SESSION_CHANGED");
    if (error) throw error;
    return d;
  };
  const MESSAGES = {
    FRIEND_CODE_NOT_FOUND: "Aucun profil trouvable avec ce code. La personne doit activer « Être trouvable par mon code ami » dans son profil.",
    INVALID_FRIEND_CODE: "Un code ami ressemble à TN-AB12.",
    CANNOT_ADD_SELF: "C’est ton propre code.",
    SOCIAL_RATE_LIMIT: "Beaucoup d’actions en peu de temps. Réessaie un peu plus tard.",
    RATE_LIMITED: "Beaucoup de changements de guilde en peu de temps. Réessaie dans un moment.",
    CHALLENGE_INVITEES: "Invite au moins un ami (10 au plus).",
    CHALLENGE_INVALID: "Vérifie la mesure, la cible et la durée du défi.",
    EXPEDITION_CLOSED: "Cette expédition est terminée.",
    GUILD_OWNER_REQUIRED: "Seul le fondateur peut régler l’objectif.",
    CHAT_RATE_LIMIT: "Doucement : 5 messages par minute au plus.",
    INSUFFICIENT_CREDITS: "Cette action demande encore des crédits sur ce serveur.",
    INVALID_GUILD_CODE: "Un code de guilde ressemble à G-AB12.",
    GUILD_NOT_FOUND: "Aucune guilde avec ce code.",
    REQUEST_NOT_FOUND: "Cette demande n’existe plus.",
    CHALLENGE_TRANSITION_INVALID: "Ce défi a déjà changé d’état.",
    MOMENT_NOT_FOUND: "Ce Moment n’est plus visible.",
    LINK_INVALID: "Ce lien n’est plus valable : il a déjà servi, a expiré ou a été retiré. Demande un nouveau lien.",
    LINK_OWN: "C’est ton propre lien : envoie-le à la personne que tu veux inviter.",
    LINK_LIMIT_5: "Tu as déjà 5 liens en attente. Retire-en un ou attends qu’ils servent.",
    ACCOUNT_SUSPENDED: "Ce compte ne peut pas faire cette action pour le moment.",
  };
  const human = (e) => {
    const raw = String(e?.message || e || "");
    const k = Object.keys(MESSAGES).find((x) => raw.includes(x));
    if (k) return MESSAGES[k];
    if (e?.code === "PGRST202" || raw.includes("Could not find the function")) return "Cette fonction est momentanément indisponible. Réessaie dans un instant.";
    return navigator.onLine ? "Action impossible pour le moment. Réessaie dans un instant." : "Hors ligne : la communauté revient avec le réseau.";
  };
  /** Confirm dialogs show the thrown message: give them the human one. */
  const failed = (e) => {
    throw new Error(human(e));
  };

  function closeDialogs() {
    // Sheets on this page can contain names, invitees and actions from the old account.
    // The support report owns its account and uncertain-send lifecycle, including offline drafts.
    document.querySelectorAll(".asc-sheet[open]:not(.help-report)").forEach(d => d.close());
  }
  const sending = () => mutation && current(mutation.job);
  /* The blocks other modules draw inside this page (since the last visit, the Cordée, the Duo, the optional panels) answer
     their own clicks and keep their own pending states: this page never handles or locks what is inside them. */
  const FOREIGN = "#retour, #cordee, #duo, #communaute-extras";
  const foreign = (node) => !!node?.closest?.(FOREIGN);
  function lockControls(task, scope) {
    scope.querySelectorAll("button, input, select, textarea").forEach(control => {
      if (foreign(control)) return;
      if (!task.controls.has(control)) task.controls.set(control, control.disabled);
      control.disabled = true;
    });
  }
  function lockForm(task, form) {
    if (!form) return;
    lockControls(task, form.closest("dialog") || form);
    if (!task.forms.has(form)) task.forms.set(form, form.getAttribute("aria-busy"));
    form.setAttribute("aria-busy", "true");
  }
  function showProgress(task, form) {
    if (task.progress.some(node => node.isConnected)) return;
    const notice = document.createElement("p");
    notice.className = "asc-small asc-muted cm-progress";
    notice.setAttribute("role", "status");
    notice.textContent = "Envoi en cours…";
    // Keep the announcement outside the busy form so it remains available to assistive tech, and next to what was pressed.
    const near = task.origin?.isConnected && task.origin.closest(".asc-row, .cm-moment, .cm-challenge, .cm-code, .cm-invitation, .cm-scene");
    if (form) form.before(notice);
    else if (near && root.contains(near)) near.after(notice);
    else root.prepend(notice);
    task.progress.push(notice);
  }
  function beginMutation(job, form, origin) {
    if (!current(job) || sending()) return null;
    const formAttribute = form && ["data-add-friend", "data-create-guild", "data-join-guild", "data-guild-target", "data-guild-message"].find(name => form.hasAttribute(name));
    const task = { job, controls: new Map(), forms: new Map(), progress: [], formAttribute, origin: origin || null, done: false };
    if (origin) origin.setAttribute("aria-busy", "true");
    mutation = task;
    lockControls(task, root);
    lockForm(task, form);
    showProgress(task, form);
    return task;
  }
  function endMutation(task) {
    if (!task || task.done) return;
    task.done = true;
    task.controls.forEach((disabled, control) => { control.disabled = disabled; });
    task.forms.forEach((busy, form) => {
      if (busy === null) form.removeAttribute("aria-busy");
      else form.setAttribute("aria-busy", busy);
    });
    task.progress.forEach(node => node.remove());
    task.origin?.removeAttribute("aria-busy");
    if (mutation === task) mutation = null;
  }
  function clear(next) {
    ++sequence;
    data = guild = viewContext = sessionContext = null;
    chosen = shown = wanted = null;
    errorText = "";
    pending = false;
    if (next === "transition" || next === "guest") mutation = null;
    status = next;
    closeDialogs();
    if (next === "transition" || next === "guest") document.querySelector(".asc-toasts")?.replaceChildren();
    render();
  }
  function confirm(options, job = viewContext) {
    if (!current(job)) return;
    return window.titanShell.confirm({ ...options, action: async () => {
      if (!current(job)) throw new Error("La session a changé. Rouvre cette action depuis ton compte.");
      const task = beginMutation(job);
      if (!task) throw new Error("Une action est déjà en cours. Attends sa réponse.");
      try {
        await options.action(job);
      } finally {
        endMutation(task);
      }
      return reload(job);
    } });
  }

  async function load() {
    if (window.titanAccountTransition?.active) return clear("transition");
    if (isGuest()) return clear("guest");
    if (!window.titanClient) {
      clear("error");
      errorText = "La connexion au serveur n’est pas prête. Réessaie dans un instant.";
      return render();
    }
    if (!navigator.onLine) return clear("offline");
    // A background refresh must not replace the draft before the server has answered.
    if (status === "ready" && sending()) return;
    if (sessionContext && !current(sessionContext)) closeDialogs();
    const job = context(), request = ++sequence;
    const latest = () => request === sequence && current(job);
    // After an action of the same account, what is on screen stays in place until the server's answer replaces it:
    // the page does not fold into a skeleton and the reader keeps their place.
    const soft = status === "ready" && !!data && current(viewContext) && viewContext.owner === job.owner;
    sessionContext = job;
    if (soft) root?.setAttribute("aria-busy", "true");
    else {
      data = guild = viewContext = null;
      pending = false;
      status = "loading";
      render();
    }
    // The Cordée and the Duo are read by their own modules; the first drawing waits a moment for them, so that the featured
    // scene does not change under the eye.
    const side = Promise.race([Promise.allSettled([window.TitanCordeeView?.ready?.(), window.TitanBuddy?.ready?.()]), new Promise(done => setTimeout(done, soft ? 0 : 1200))]);
    try {
      const overview = await rpc("titan_social_overview", {}, job);
      if (!latest()) return;
      if (overview?.me?.id !== job.owner) throw new Error("INVALID_COMMUNITY_RESPONSE");
      const team = overview.guild ? await rpc("titan_get_my_guild", {}, job).catch(() => null) : null;
      if (!latest()) return;
      if (INVITE.invitation && !invitation) {
        invitation = await rpc("titan_friend_link_preview_v1", { p_token: INVITE.invitation }, job).catch(() => ({ valid: false }));
        if (!latest()) return;
      }
      await side;
      if (!latest()) return;
      data = overview;
      guild = team;
      viewContext = job;
      status = "ready";
    } catch (e) {
      if (!latest()) return;
      data = guild = viewContext = null;
      errorText = human(e);
      pending = e?.code === "PGRST202" || String(e?.message || "").includes("Could not find the function");
      reportCode = e?.message === "INVALID_COMMUNITY_RESPONSE" ? "COMMUNITY_RESPONSE_INVALID" : "COMMUNITY_LOAD_FAILED";
      status = "error";
    }
    render();
  }

  function reload(job) {
    if (current(job)) return load();
  }

  /* ---------- The scene: what we are doing together now ----------
     One collective thing is featured, the liveliest; the others are one tap away. The Cordée and the Duo are read by their own
     modules (cordee.js, binome.js): this page only gives them their place and reads their state to word the tab. */
  const LIVE = [
    { id: "cordee", title: "Cordée", icon: "route" },
    { id: "expedition", title: "Expédition", icon: "mountain" },
    { id: "duo", title: "Duo", icon: "group" },
    { id: "defis", title: "Défis", icon: "target" },
    { id: "guilde", title: "Guilde", icon: "shield" },
  ];
  const ANCHORS = ["moments", "amis", ...LIVE.map((l) => l.id)];
  const plural = (n, one, many = one + "s") => `${n} ${n > 1 ? many : one}`;

  function liveState() {
    const out = {};
    const k = window.TitanCordeeView?.state?.() || null;
    if (k?.on) {
      const list = k.cordees || [];
      const invited = list.find((c) => c.status === "active" && c.myStatus === "invited");
      const active = list.find((c) => c.status === "active" && c.myStatus === "joined");
      const summit = list.find((c) => c.status === "summited");
      out.cordee = invited ? { score: 96, status: "Une invitation", attention: true }
        : active ? { score: 100, status: `${plural(Number(active.camps) || 0, "camp")} sur 4` }
        : summit ? { score: 90, status: "Sommet atteint" } : { score: 10, status: "Former une cordée" };
    }
    const x = data?.expedition;
    if (x) {
      const left = Math.max(0, Math.ceil((new Date(x.ends_at) - Date.now()) / DAY));
      out.expedition = x.status === "ended" ? { score: 5, status: "Terminée" }
        : x.status === "upcoming" ? { score: 20, status: "Bientôt" }
        : { score: x.me?.joined ? 70 : 30, status: x.me?.joined ? `Encore ${plural(left, "jour")}` : "À rejoindre" };
    }
    const b = window.TitanBuddy?.state?.() || null;
    if (b) out.duo = b.status === "active" ? { score: 80, status: `${Number(b.together) || 0} / ${Number(b.target) || 0} jours` }
      : b.status === "pending" && b.role === "invitee" ? { score: 97, status: "Une invitation", attention: true }
      : b.status === "pending" ? { score: 40, status: "En attente" }
      : b.last ? { score: 45, status: "Résultat" } : { score: 8, status: "14 jours à deux" };
    const cs = data?.challenges || [];
    const asked = cs.filter((c) => c.my_status === "invited" && c.status !== "ended").length;
    const running = cs.filter((c) => c.status !== "ended").length;
    out.defis = asked ? { score: 95, status: plural(asked, "invitation"), attention: true }
      : cs.length ? { score: running ? 60 : 15, status: plural(cs.length, "défi") } : { score: 6, status: "Avec tes amis" };
    out.guilde = data?.guild ? { score: 50, status: "Voir mon équipe" } : { score: 4, status: "Rejoindre une équipe" };
    return out;
  }
  /* The scene shown: the one the player opened, else the one already on screen (a late answer never swaps it under the eye),
     else the liveliest. */
  function featured(state) {
    if (chosen && state[chosen]) return chosen;
    if (shown && state[shown]) return shown;
    return LIVE.map((l) => l.id).filter((id) => state[id]).sort((a, b) => state[b].score - state[a].score)[0] || "defis";
  }
  const liveNavHtml = (state, on) => LIVE.filter((l) => state[l.id]).map((l) => `<a class="cm-live-tab" href="#${l.id}" data-live="${l.id}"${l.id === on ? ' aria-current="true"' : ""}>${icon(l.icon)}<span class="cm-live-tab-text"><strong>${l.title}</strong><span class="cm-live-tab-status${state[l.id].attention ? " cm-attention" : ""}">${esc(state[l.id].status)}</span></span></a>`).join("");

  /* The tabs and the panel shown follow the state; called after each drawing and each time the Cordée or the Duo changes. */
  function paintLive() {
    const scene = root?.querySelector(".cm-live");
    if (!scene || status !== "ready") return;
    const duo = scene.querySelector("#duo");
    const html = window.TitanBuddy?.html?.() || "";
    if (duo && duoHtml !== html) {
      const held = duo.contains(document.activeElement) ? [...document.activeElement.attributes].find((a) => a.name.startsWith("data-bd"))?.name : null;
      duo.innerHTML = html;
      duoHtml = html;
      if (held) duo.querySelector(`[${held}]:not(:disabled)`)?.focus({ preventScroll: true });
    }
    const state = liveState(), on = featured(state);
    const nav = scene.querySelector(".cm-live-nav");
    const tabs = liveNavHtml(state, on);
    if (nav && navHtml !== tabs) {
      const held = nav.contains(document.activeElement) ? document.activeElement.dataset.live : null;
      nav.innerHTML = tabs;
      navHtml = tabs;
      if (held) nav.querySelector(`[data-live="${held}"]`)?.focus({ preventScroll: true });
    }
    // On a phone the tabs scroll sideways: the one shown is brought fully into the strip (the page itself does not move).
    const tab = nav?.querySelector('[aria-current="true"]');
    if (tab && nav.scrollWidth > nav.clientWidth) {
      const pad = 16, left = tab.offsetLeft - nav.offsetLeft, right = left + tab.offsetWidth;
      if (left - pad < nav.scrollLeft) nav.scrollLeft = left - pad;
      else if (right + pad > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = right + pad - nav.clientWidth;
    }
    scene.querySelectorAll("[data-live-panel]").forEach((panel) => { panel.hidden = panel.dataset.livePanel !== on; });
    scene.dataset.live = shown = on;
    if (wanted && openAnchor(wanted)) wanted = null;
  }

  /* A link to a block of the page (#defis, #cordee, #amis…): its scene opens, then the block takes the focus. */
  function openAnchor(id, { scroll = true } = {}) {
    if (status !== "ready" || !ANCHORS.includes(id)) return false;
    if (LIVE.some((l) => l.id === id)) {
      if (!liveState()[id]) return false;
      if (chosen !== id) { chosen = id; paintLive(); }
    }
    const target = document.getElementById(id);
    if (!target || target.closest("[hidden]")) return false;
    if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
    if (scroll) target.scrollIntoView({ block: "start", behavior: "instant" });
    target.focus({ preventScroll: true });
    return true;
  }

  function liveHtml() {
    const x = data?.expedition;
    return `<section class="cm-live" id="ensemble" aria-labelledby="cm-live-title">
      <div class="asc-section-head"><h2 id="cm-live-title">Ensemble, en ce moment</h2></div>
      <nav class="cm-live-nav" aria-label="Dans la communauté"></nav>
      <div class="cm-live-panel" data-live-panel="cordee" hidden><div data-cm-mount="cordee"></div></div>
      ${x ? `<div class="cm-live-panel" data-live-panel="expedition" hidden>${expeditionHtml()}</div>` : ""}
      <div class="cm-live-panel" data-live-panel="duo" hidden><div class="cm-duo" id="duo" tabindex="-1"></div></div>
      <div class="cm-live-panel" data-live-panel="defis" hidden>${challengesHtml()}</div>
      <div class="cm-live-panel" data-live-panel="guilde" hidden>${guildHtml()}</div>
    </section>`;
  }

  function expeditionHtml() {
    const x = data?.expedition;
    if (!x) return "";
    const pct = Math.min(100, Math.round((x.collective_minutes / Math.max(1, x.collective_goal)) * 100));
    const me = x.me || {};
    const start = new Date(x.starts_at);
    const end = new Date(x.ends_at);
    const daysLeft = Math.max(0, Math.ceil((end - Date.now()) / DAY));
    const personalPct = me.joined ? Math.round(Math.min(1, Math.min(me.days / x.personal_days, me.minutes / x.personal_minutes)) * 100) : 0;
    return `<section class="cm-scene cm-expedition sig-plate is-relief" id="expedition" tabindex="-1" aria-labelledby="cm-exp-title">
      <p class="asc-eyebrow">${x.status === "upcoming" ? `Expédition · dès le ${esc(start.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }))}` : x.status === "ended" ? "Expédition terminée" : `Expédition · encore ${daysLeft} jour${daysLeft > 1 ? "s" : ""}`}</p>
      <h2 id="cm-exp-title" class="cm-exp-title">${esc(x.title)}</h2>
      <p class="cm-scene-story">${esc(x.story)}</p>
      <div class="cm-exp-bar"><div class="asc-between"><span>${esc(x.guardian)} recule</span><strong class="asc-num">${F().number(x.collective_minutes)} / ${F().number(x.collective_goal)} min</strong></div>
        <span class="asc-ascent"><span style="--p:${pct}%"></span></span>
        <p class="asc-small asc-muted">${F().number(x.participants)} participant${x.participants > 1 ? "s" : ""} · tous les sports comptent pareil · ${x.daily_cap} min au plus par jour et par personne.</p></div>
      ${me.joined
        ? `<div class="cm-exp-me"><div class="asc-between"><span>Ta part</span><strong class="asc-num">${F().number(me.minutes)} min · ${me.days} jour${me.days > 1 ? "s" : ""}</strong></div><span class="asc-ascent thin"><span style="--p:${personalPct}%"></span></span>
           <p class="asc-small asc-muted">${me.personal_done ? `${icon("check")} Titre « ${esc(x.reward_title)} » acquis à la fin de l’expédition.` : `Titre « ${esc(x.reward_title)} » avec ${x.personal_days} jours actifs et ${x.personal_minutes} min d’effort, quoi que fasse le groupe.`}</p></div>`
        : x.status !== "ended" ? `<div class="asc-row-flex"><button type="button" class="asc-btn asc-btn-primary" data-join-expedition="${esc(x.id)}">${icon("mountain")} Rejoindre l’expédition</button><span class="asc-small asc-muted">${x.status === "upcoming" ? `Tes séances compteront dès le ${esc(start.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }))}.` : "Tes séances comptent à partir de maintenant."}</span></div>` : ""}
    </section>`;
  }

  /* Who knocks: an opened invitation link and the requests received. First thing of the page, each answered with one thumb. */
  function doorHtml() {
    const list = data?.requests_in || [];
    const card = invitationHtml();
    if (!list.length && !card) return "";
    return `<section class="cm-door"${list.length ? ' aria-labelledby="cm-requests-title"' : ' aria-label="Invitation"'}>${card}
      ${list.length ? `<div class="cm-requests"><h2 id="cm-requests-title">${list.length > 1 ? `${list.length} demandes d’amis` : "Une demande d’ami"}</h2>
        <p class="asc-small asc-muted">En acceptant, vous voyez seulement ce que chacun a choisi de partager. Refuser ne prévient personne.</p>
        <div class="asc-list">${list
          .map((r) => `<div class="asc-row cm-request"><span class="cm-avatar"><img src="/assets/renaissance/${esc(r.avatar || "scout")}-s.webp" alt="" width="40" height="40" loading="lazy"></span><span class="asc-row-main"><span class="asc-row-title">${esc(r.name)}</span><span class="asc-row-sub">veut t’ajouter</span></span>
        <span class="cm-actions"><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-accept="${esc(r.id)}" aria-label="Accepter ${esc(r.name)}">Accepter</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-decline="${esc(r.id)}" aria-label="Refuser ${esc(r.name)}">Refuser</button></span></div>`)
          .join("")}</div></div>` : ""}
    </section>`;
  }

  function momentsHtml() {
    const list = data?.moments || [];
    return `<section class="asc-section cm-section" id="moments" tabindex="-1" aria-labelledby="cm-moments-title"><div class="asc-section-head"><h2 id="cm-moments-title">Moments</h2><span class="asc-small asc-muted">30 derniers jours</span></div>
      ${list.length ? `<p class="cm-section-intro">Ce que tes amis et toi avez choisi de montrer. Rien d’autre n’apparaît ici.</p><div class="cm-moments">${list
        .map((m) => `<article class="cm-moment" data-kind="${esc(m.kind)}">
          <span class="cm-avatar"><img src="/assets/renaissance/${esc(m.author?.avatar || "scout")}-s.webp" alt="" width="40" height="40" loading="lazy"></span>
          <div class="cm-moment-main"><p class="asc-small asc-muted"><strong>${esc(m.mine ? "Toi" : m.author?.name)}</strong> · ${esc(F().relativeDay(m.created_at))}</p>
            <p class="cm-moment-title">${icon(KIND_ICON[m.kind] || "bolt")}<span>${esc(m.title)}</span></p>
            ${m.detail ? `<p class="cm-moment-detail asc-num">${esc(m.detail)}</p>` : ""}
          </div>
          ${m.mine ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-icon" data-delete-moment="${esc(m.id)}" aria-label="Supprimer ce Moment">${icon("trash")}</button>` : `<button type="button" class="cm-cheer" data-cheer="${esc(m.id)}" aria-pressed="${!!m.cheered}" aria-label="Encourager ${esc(m.author?.name)}">${icon("heart")}<span class="asc-num">${m.cheers || ""}</span></button>`}
        </article>`)
        .join("")}</div>` : `<div class="sig-empty">${icon("heart")}<h3>Aucun Moment pour l’instant</h3><p>Un Moment, c’est un record, un objectif, une balise ou une grosse séance que tu choisis de montrer. Partage-le depuis l’écran de fin de séance ou tes records.</p><a class="asc-btn asc-btn-secondary asc-btn-sm" href="/records">Voir mes records</a></div>`}
    </section>`;
  }

  /* What a friend sees of me, said where the circle is managed, from the choices of the profile (the server applies them). */
  function privacyHtml() {
    const p = window.state?.user?.privacy || {};
    const shown = ["ton pseudo", "ton avatar", "les Moments que tu partages"];
    if (p.showStats === true) shown.push("ton niveau et tes jours actifs de la semaine");
    if (p.socialPresence === true) shown.push("le jour de ta dernière séance");
    const kept = [p.showStats === true ? "" : "ton niveau et tes statistiques", p.socialPresence === true ? "" : "tes jours d’activité"].filter(Boolean);
    return `<p class="cm-privacy">${icon("eye")}<span><strong>Ce que tes amis voient de toi :</strong> ${shown.join(", ")}.${kept.length ? ` Restent privés : ${kept.join(", ")}.` : ""} Jamais ta santé, ton poids, tes traces GPS ni tes notes. <a href="/profile#reglages">Régler</a></span></p>`;
  }

  function friendsHtml() {
    const me = data?.me || {};
    const list = data?.friends || [];
    const out = data?.requests_out || [];
    return `<section class="asc-section cm-section cm-amis" id="amis" tabindex="-1" aria-labelledby="cm-friends-title"><div class="asc-section-head"><h2 id="cm-friends-title">Ton cercle</h2><span class="asc-chip">${list.length} ami${list.length > 1 ? "s" : ""}</span></div>
      ${privacyHtml()}
      ${list.length ? `<div class="asc-list cm-friends">${list
        .map((f) => `<div class="asc-row"><span class="cm-avatar"><img src="/assets/renaissance/${esc(f.avatar || "scout")}-s.webp" alt="" width="40" height="40" loading="lazy"></span>
          <span class="asc-row-main"><span class="asc-row-title">${esc(f.name)}</span><span class="asc-row-sub">${[f.level ? `Niveau ${f.level}` : "", f.week_days !== null && f.week_days !== undefined ? `${f.week_days} jour${f.week_days > 1 ? "s" : ""} actif${f.week_days > 1 ? "s" : ""} cette semaine` : "", f.last_active ? `actif ${F().relativeDay(f.last_active + "T12:00:00")}` : ""].filter(Boolean).join(" · ") || "Statistiques privées"}</span></span>
          <button type="button" class="asc-btn asc-btn-ghost asc-btn-icon" data-friend-menu="${esc(f.id)}" aria-label="Options pour ${esc(f.name)}">${icon("more")}</button></div>`)
        .join("")}</div>` : `<div class="sig-empty">${icon("group")}<h3>Ton cercle commence par une personne</h3><p>Envoie un lien ou échangez vos codes : la personne accepte, puis vous voyez seulement ce que chacun a choisi de partager.</p></div>`}
      <div class="cm-invite" id="inviter"><h3>Inviter quelqu’un</h3>
      ${linksOn() ? `<div class="cm-code cm-invite-link"><div><p class="cm-way">Un lien personnel</p><p class="asc-small asc-muted">Un lien pour une seule personne, valable 7 jours. Ton profil reste privé : seule la personne qui l’ouvre te voit et choisit d’accepter.</p></div>
        <button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-friend-link>${icon("share")} Créer un lien</button></div>` : ""}
      <div class="cm-code"><div><p class="cm-way">Ton code ami</p><p class="cm-code-value asc-num">${esc(me.friend_code || "—")}</p>
        <p class="asc-small ${me.findable ? "asc-muted" : "cm-warn"}">${me.findable ? "Trouvable : on peut te demander en ami avec ce code." : `Ton code ne sert que si tu es trouvable (<a href="/profile#reglages">Confidentialité</a>).${linksOn() ? " Le lien personnel, lui, marche toujours." : ""}`}</p></div>
        <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-copy-code="${esc(me.friend_code || "")}">${icon("copy")} Copier</button></div>
      <form class="cm-add" data-add-friend><label class="cm-way" for="cm-code">Le code d’un ami</label><div class="cm-add-row"><input id="cm-code" class="asc-input" name="code" placeholder="TN-AB12" autocapitalize="characters" autocomplete="off" maxlength="12"><button type="submit" class="asc-btn asc-btn-primary">${icon("userPlus")} Demander</button></div></form>
      ${out.length ? `<div class="cm-sent"><h3 id="cm-sent-title">Demandes envoyées</h3><div class="asc-list cm-requests-out" role="group" aria-labelledby="cm-sent-title">${out.map((r) => `<div class="asc-row"><span class="asc-row-main"><span class="asc-row-title">${esc(r.name)}</span><span class="asc-row-sub">En attente de sa réponse${r.expires_at ? ` · expire ${esc(F().relativeDay(r.expires_at))}` : ""}</span></span>
        <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-cancel-request="${esc(r.id)}" aria-label="Annuler la demande à ${esc(r.name)}">Annuler</button></div>`).join("")}</div></div>` : ""}
      </div>
      <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm cm-blocks" data-blocks>${icon("lock")} Comptes bloqués</button>
    </section>`;
  }

  /* An opened invitation link: who invites (signed-in only), then accept or ignore. Nothing happens without « Accepter ». */
  function invitationHtml() {
    if (!INVITE.invitation || !invitation || invitation.done) return "";
    if (!invitation.valid) return `<div class="asc-note cm-invitation" role="status">${icon("userPlus")}<span>${esc(MESSAGES.LINK_INVALID)}</span></div>`;
    if (invitation.own) return `<div class="asc-note cm-invitation" role="status">${icon("userPlus")}<span>${esc(MESSAGES.LINK_OWN)}</span></div>`;
    if (invitation.friends) return `<div class="asc-note cm-invitation" role="status">${icon("check")}<span>Vous êtes déjà amis avec ${esc(invitation.inviter?.name || "cette personne")}.</span></div>`;
    return `<div class="cm-invitation cm-request" role="group" aria-labelledby="cm-invitation-title"><span class="cm-avatar"><img src="/assets/renaissance/${esc(invitation.inviter?.avatar || "scout")}-s.webp" alt="" width="56" height="56" loading="lazy"></span>
      <div class="asc-row-main"><h2 id="cm-invitation-title" class="asc-row-title">${esc(invitation.inviter?.name || "Un athlète")} t’invite à devenir ami</h2>
        <p class="asc-row-sub">En acceptant, vous voyez ce que chacun a choisi de partager. Tu peux retirer ou bloquer à tout moment.</p></div>
      <span class="cm-actions"><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-accept-invitation>Accepter</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-ignore-invitation>Ignorer</button></span></div>`;
  }

  async function createFriendLink(job) {
    const r = await rpc("titan_friend_link_create_v1", {}, job);
    if (!current(job) || !r?.token) return;
    const url = personalLink(r.token);
    const text = "Rejoins-moi sur TITAN pour qu’on s’encourage. Ce lien est pour toi seul·e, valable 7 jours :";
    let shared = false;
    try { if (navigator.share) { await navigator.share({ title: "TITAN", text, url }); shared = true; } } catch {}
    if (!shared) { try { await navigator.clipboard.writeText(`${text} ${url}`); } catch {} }
    if (current(job)) window.titanShell.toast({ type: "ok", title: shared ? "Lien partagé" : "Lien copié", message: url });
  }

  async function openBlocks(job = viewContext) {
    if (!current(job) || sending()) return;
    let list = [];
    try { list = await rpc("titan_blocks_v1", {}, job); } catch (e) { return current(job) && window.titanShell.toast({ type: "warn", message: human(e) }); }
    if (!current(job)) return;
    const body = document.createElement("div");
    body.className = "asc-stack";
    const draw = () => {
      body.innerHTML = list.length ? `<p class="asc-small asc-muted">Débloquer permet de nouveau les demandes et les liens. L’amitié n’est pas rétablie : il faudra se redemander.</p><div class="asc-list">${list.map((b) => `<div class="asc-row"><span class="asc-row-main"><span class="asc-row-title">${esc(b.name)}</span><span class="asc-row-sub">Bloqué ${esc(F().relativeDay(b.at))}</span></span><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-unblock="${esc(b.id)}">Débloquer</button></div>`).join("")}</div>`
        : `<p class="asc-small asc-muted">Tu n’as bloqué personne.</p>`;
    };
    draw();
    const d = window.titanShell.sheet({ title: "Comptes bloqués", eyebrow: "Confidentialité", body });
    body.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-unblock]");
      if (!b || !d.open || !current(job)) return;
      b.disabled = true;
      try {
        await rpc("titan_unblock_user", { p_blocked_id: b.dataset.unblock }, job);
        list = list.filter((x) => x.id !== b.dataset.unblock);
        if (current(job)) { draw(); window.titanShell.toast({ type: "ok", title: "Compte débloqué" }); }
      } catch (err) {
        b.disabled = false;
        if (current(job)) window.titanShell.toast({ type: "warn", message: human(err) });
      }
    });
  }

  function challengesHtml() {
    const order = (c) => (c.status === "ended" ? 2 : c.my_status === "invited" ? 0 : 1);
    const list = data?.challenges || [];
    const friends = data?.friends || [];
    return `<section class="cm-section cm-scene-plain" id="defis" tabindex="-1" aria-labelledby="cm-challenges-title"><div class="cm-scene-head"><h2 id="cm-challenges-title">Défis</h2>${list.length ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-new-challenge>${icon("plus")} Lancer un défi</button>` : ""}</div>
      <p class="cm-section-intro">Une période, une mesure commune, aucune mise. Chaque participant voit la progression des autres dans ce défi, rien d’autre.</p>
      ${list.length ? `<div class="cm-challenges">${list
        .slice()
        // What waits for an answer first, then what is running, then what is over (the server's order inside each).
        .sort((a, b) => order(a) - order(b))
        .map((c) => {
          const m = METRICS[c.metric] || METRICS.effort_minutes;
          const end = new Date(c.ends_at);
          const daysLeft = Math.max(0, Math.ceil((end - Date.now()) / DAY));
          return `<article class="cm-challenge" data-status="${c.status === "ended" ? "ended" : c.my_status === "invited" ? "invited" : "active"}"><div class="asc-between"><h3>${esc(c.title)}</h3><span class="asc-chip">${c.status === "ended" ? "Terminé" : c.my_status === "invited" ? "Invitation" : `${daysLeft} j`}</span></div>
            <p class="asc-small asc-muted">${esc(m.label)}${c.sport ? ` · ${esc(SP().label(c.sport))}` : ""} · objectif ${esc(m.fmt(c.target))}</p>
            <ul class="cm-board">${(c.members || [])
              .slice()
              .sort((a, b) => (Number(b.progress) || 0) - (Number(a.progress) || 0))
              .map((p) => `<li><span>${esc(p.name)}${p.status === "invited" ? ' <small class="asc-faint">invité</small>' : ""}</span>${p.status === "joined" && p.id != null ? `<span class="asc-ascent thin"><span style="--p:${Math.min(100, Math.round(((Number(p.progress) || 0) / c.target) * 100))}%"></span></span><strong class="asc-num">${esc(m.fmt(Number(p.progress) || 0))}</strong>` : "<span></span><span></span>"}</li>`)
              .join("")}</ul>
            ${c.my_status === "invited" ? `<div class="asc-row-flex"><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-challenge="${esc(c.id)}" data-act="join">Relever le défi</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-challenge="${esc(c.id)}" data-act="decline">Décliner</button></div>` : c.status !== "ended" ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-challenge="${esc(c.id)}" data-act="leave">Quitter</button>` : ""}
            <p class="asc-small asc-faint">Effort plafonné à 90 min par jour ; séances ajoutées après le départ du défi. Aucune mise, aucune récompense en crédits.</p>
          </article>`;
        })
        .join("")}</div>` : `<div class="sig-empty">${icon("target")}<h3>Pas encore de défi</h3><p>${friends.length ? "Propose une semaine d’effort à un ami, ou crée un lien que n’importe qui peut rejoindre. Pas de mise : juste l’envie d’avancer ensemble." : "Un défi se lance avec un ami, ou avec un lien que n’importe qui peut rejoindre."}</p>
        <div class="asc-row-flex"><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-new-challenge>${icon("plus")} Lancer un défi</button>${friends.length ? "" : '<a class="asc-btn asc-btn-ghost asc-btn-sm" href="#amis">Ajouter un ami</a>'}</div></div>`}
    </section>`;
  }

  function guildHtml() {
    const week = data?.guild;
    if (week && !guild)
      return `<section class="cm-section cm-scene-plain" id="guilde" tabindex="-1" aria-labelledby="cm-guild-title"><div class="cm-scene-head"><h2 id="cm-guild-title">Guilde</h2></div><div class="sig-empty">${icon("shield")}<h3>Ta guilde ne s’affiche pas pour le moment</h3><p>Le reste de la Communauté est à jour. Réessaie dans un instant.</p><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-retry>Réessayer</button></div></section>`;
    if (!week)
      return `<section class="cm-section cm-scene-plain" id="guilde" tabindex="-1" aria-labelledby="cm-guild-title"><div class="cm-scene-head"><h2 id="cm-guild-title">Guilde</h2></div>
        <div class="sig-empty">${icon("shield")}<h3>Une équipe pour tenir la semaine ensemble</h3><p>Un objectif commun, la part de chacun et une discussion. Les membres d’une guilde voient ton pseudo, tes minutes d’effort de la semaine et tes messages.</p>
        <div class="cm-guild-forms"><form class="cm-add" data-create-guild><label class="sr-only" for="cm-guild-name">Nom de la guilde</label><input id="cm-guild-name" class="asc-input" name="name" maxlength="28" placeholder="Nom de la guilde" required><button type="submit" class="asc-btn asc-btn-secondary">Fonder</button></form>
        <form class="cm-add" data-join-guild><label class="sr-only" for="cm-guild-code">Code de guilde</label><input id="cm-guild-code" class="asc-input" name="code" maxlength="16" placeholder="Code de guilde" autocapitalize="characters" required><button type="submit" class="asc-btn asc-btn-secondary">Rejoindre</button></form></div></div></section>`;
    const pct = Math.min(100, Math.round((week.minutes / Math.max(1, week.target)) * 100));
    const owner = guild.owner_id === window.state?.user?.id;
    const msgs = (guild.messages || []).slice(-30);
    return `<section class="cm-section cm-scene-plain" id="guilde" tabindex="-1" aria-labelledby="cm-guild-title"><p class="asc-eyebrow">Guilde</p><div class="cm-scene-head"><h2 id="cm-guild-title">${esc(guild.name)}</h2><span class="asc-small asc-muted">Code ${esc(guild.code || "")}</span></div>
      <p class="cm-section-intro">L’effort de l’équipe cette semaine, puis votre discussion. Chaque membre voit le pseudo et les minutes des autres.</p>
      <div class="cm-guild"><div class="asc-between"><span>Semaine d’effort</span><strong class="asc-num">${F().number(week.minutes)} / ${F().number(week.target)} min</strong></div>
        <span class="asc-ascent"><span style="--p:${pct}%"></span></span>
        <ul class="cm-board">${(week.members || []).map((m) => `<li><span>${esc(m.name)}${m.role === "owner" ? ' <small class="asc-faint">fondateur</small>' : ""}</span><span class="asc-ascent thin"><span style="--p:${Math.min(100, Math.round((m.minutes / Math.max(1, week.target)) * 100))}%"></span></span><strong class="asc-num">${F().number(m.minutes)} min</strong></li>`).join("")}</ul>
        ${owner ? `<form class="cm-add" data-guild-target><label class="sr-only" for="cm-target">Objectif hebdomadaire en minutes</label><input id="cm-target" class="asc-input" type="number" min="60" max="100000" step="30" name="minutes" value="${esc(week.target)}"><button type="submit" class="asc-btn asc-btn-ghost">Régler l’objectif</button></form>` : ""}
      </div>
      <div class="cm-chat"><div class="cm-chat-list" role="log" aria-label="Discussion de guilde">${msgs.length ? msgs.map((m) => `<p><strong>${esc(m.sender_name)}</strong> ${esc(m.content)}</p>`).join("") : '<p class="asc-small asc-muted">Aucun message. Les messages s’effacent après 72 h.</p>'}</div>
        <form class="cm-add" data-guild-message><label class="sr-only" for="cm-msg">Message</label><input id="cm-msg" class="asc-input" name="content" maxlength="280" placeholder="Un mot pour l’équipe"><button type="submit" class="asc-btn asc-btn-secondary" aria-label="Envoyer le message">${icon("send")}</button></form></div>
      <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-leave-guild>Quitter la guilde</button>
    </section>`;
  }

  /* The circle, on the coral field: the friends who agreed, each a face and a first name, then the way to invite. A face opens
     what one can do with that friend. Only what the server returned; without friends the line of the page stays. The height of
     the strip is reserved by the sheet from the first paint. */
  const CIRCLE_DEFAULT = "Des amis par consentement : chacun choisit ce qu’il partage.";
  function paintCircle() {
    const el = document.getElementById("cm-circle");
    if (!el) return;
    const ready = status === "ready" && !!data;
    const list = ready ? data.friends || [] : [];
    const today = new Date(); const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const active = list.filter((f) => f.last_active === key).length;
    const sig = ready ? `${list.map((f) => `${f.id}:${f.avatar}:${f.name}:${f.last_active === key}`).join("|")}#` : "";
    if ((el.dataset.count || "") === sig) return;
    if (!ready) { delete el.dataset.count; el.innerHTML = `<p class="cm-circle-line">${CIRCLE_DEFAULT}</p>`; return; }
    el.dataset.count = sig;
    const first = (name) => String(name || "").trim().split(/\s+/)[0] || "Ami";
    el.innerHTML = `<p class="cm-circle-line">${list.length ? `<strong>${list.length} ami${list.length > 1 ? "s" : ""}</strong>${active ? ` · ${active} actif${active > 1 ? "s" : ""} aujourd’hui` : ""}` : CIRCLE_DEFAULT}</p>
      <ul class="cm-rope" aria-label="Ton cercle">${list.map((f) => `<li><button type="button" class="cm-face" data-face="${esc(f.id)}" aria-label="${esc(f.name)}${f.last_active === key ? ", actif aujourd’hui" : ""} : ce que vous pouvez faire ensemble"><span class="cm-face-img"><img src="/assets/renaissance/${esc(f.avatar || "scout")}-s.webp" alt="" width="52" height="52" decoding="async">${f.last_active === key ? '<span class="cm-face-on" aria-hidden="true"></span>' : ""}</span><span class="cm-face-name">${esc(first(f.name))}</span></button></li>`).join("")}
        <li><a class="cm-face cm-face-add" href="#inviter"><span class="cm-face-img">${icon("userPlus")}</span><span class="cm-face-name">Inviter</span></a></li></ul>`;
  }

  /* Blocks drawn by their own modules (since the last visit, the Cordée, the optional panels) keep their node: it waits in
     #cm-park while this page is redrawn, then takes the place this drawing gives it, or follows the message when there is none. */
  const MOUNTS = ["retour", "cordee", "communaute-extras"];
  function paint(html, show) {
    const park = document.getElementById("cm-park");
    if (park) MOUNTS.forEach((id) => { const el = document.getElementById(id); if (el && root.contains(el)) park.append(el); });
    root.innerHTML = html;
    navHtml = duoHtml = null;
    return () => {
      if (!park || !show) return;
      MOUNTS.forEach((id) => {
        const el = document.getElementById(id), slot = root.querySelector(`[data-cm-mount="${id}"]`);
        if (!el) return;
        if (slot) slot.replaceWith(el); else root.append(el);
      });
    };
  }

  function render() {
    if (!root) return;
    paintCircle();
    root.setAttribute("aria-busy", String(status === "loading"));
    root.dataset.state = status;
    if (status === "transition") {
      paint('<p class="asc-empty" role="status">La session a changé. La communauté revient après la synchronisation du compte.</p>', false);
      return;
    }
    if (status === "loading") {
      paint(`<div class="asc-skeleton" style="height:420px;border-radius:12px"></div><div class="asc-skeleton" style="height:240px;margin-top:24px;border-radius:12px"></div>`, false);
      return;
    }
    if (status === "guest") {
      paint(`<section class="cm-guest sig-plate is-relief"><p class="asc-eyebrow">Communauté</p><h2 class="cm-exp-title">Avancer avec les autres, sans bruit.</h2>
        <p class="cm-scene-story">Des amis qui ont accepté, des défis sans mise, une cordée où chaque sport compte pareil. Rien n’est public par défaut.</p>
        ${INVITE.invitation ? `<p class="asc-note">${icon("userPlus")}<span>On t’a envoyé une invitation personnelle sur TITAN. Crée ton compte ou connecte-toi : tu verras qui t’invite, puis tu choisiras d’accepter.</span></p>`
          : INVITE.ami || INVITE.guilde ? `<p class="asc-note">${icon("userPlus")}<span>On t’a invité ${INVITE.guilde ? "dans une guilde" : "à devenir ami"} sur TITAN. Crée ton compte ou connecte-toi : le code ${esc(INVITE.ami || INVITE.guilde)} sera prêt.</span></p>` : ""}
        <div class="asc-row-flex"><a class="asc-btn asc-btn-primary" href="/login?mode=signup${inviteNext() ? `&${inviteNext()}` : ""}">Créer un compte</a><a class="asc-btn asc-btn-ghost" href="/login${inviteNext() ? `?${inviteNext()}` : ""}">Se connecter</a></div>
        <p class="asc-small asc-muted">En mode découverte, rien ne quitte ton appareil.</p>
        <ul class="cm-preview">${SECTIONS.map(s => `<li>${icon(s.icon)}<div><strong>${s.title}</strong><p>${s.description}</p></div></li>`).join("")}</ul></section>`, false);
      return;
    }
    if (status === "offline" || status === "error") {
      const mount = paint(`<div class="sig-empty cm-down">${icon(status === "offline" ? "offline" : "alert")}<h2>${status === "offline" ? "Hors ligne" : pending ? "Communauté bientôt disponible" : "Communauté indisponible"}</h2><p>${esc(status === "offline" ? "Tes séances continuent d’être enregistrées sur cet appareil. La communauté revient avec le réseau." : errorText)}</p>${status === "error" && pending ? "" : `<button type="button" class="asc-btn asc-btn-secondary" data-retry>${icon("restore")} Réessayer</button>`}</div>`, true);
      if (status === "error") {
        const actions = document.createElement('div'); actions.className = 'asc-row-flex';
        const help = document.createElement('a'); help.className = 'asc-btn asc-btn-ghost'; help.href = '/service#help-communaute'; help.textContent = 'Assistance'; actions.append(help);
        if (!pending && current(sessionContext) && document.body.dataset.supportEnabled === 'true') {
          const report = document.createElement('button'); report.type = 'button'; report.className = 'asc-btn asc-btn-secondary'; report.dataset.supportReport = ''; report.textContent = 'Envoyer un rapport'; actions.append(report);
        }
        root.querySelector('.cm-down').append(actions);
      }
      mount();
      root.setAttribute("aria-busy", "false");
      return;
    }
    const mount = paint(`<div class="cm-col cm-col-main">${doorHtml()}${liveHtml()}<div data-cm-mount="retour"></div>${momentsHtml()}</div>
      <div class="cm-col cm-col-side">${friendsHtml()}<div data-cm-mount="communaute-extras"></div></div>`, true);
    mount();
    paintLive();
    root.setAttribute("aria-busy", "false");
    if (sending()) {
      const form = mutation.formAttribute && root.querySelector(`[${mutation.formAttribute}]`);
      lockControls(mutation, root);
      lockForm(mutation, form);
      showProgress(mutation, form);
    }
    const chat = root.querySelector(".cm-chat-list");
    if (chat) chat.scrollTop = chat.scrollHeight;
    if (!inviteApplied && (INVITE.ami || INVITE.guilde)) {
      inviteApplied = true;
      if (INVITE.guilde && !INVITE.ami) { chosen = "guilde"; paintLive(); }
      const field = INVITE.ami ? root.querySelector("#cm-code") : root.querySelector("#cm-guild-code");
      if (field) {
        field.value = INVITE.ami || INVITE.guilde;
        const job = viewContext;
        requestAnimationFrame(() => {
          if (!current(job) || !field.isConnected) return;
          field.scrollIntoView({ block: "center", behavior: "instant" });
          field.focus({ preventScroll: true });
        });
        initialSection = false;
      }
    }
    if (initialSection) {
      initialSection = false;
      const id = location.hash.slice(1);
      const job = viewContext;
      if (ANCHORS.includes(id)) {
        // The scene is chosen at once (no flash of another one); the scroll waits for the layout.
        if (LIVE.some((l) => l.id === id)) { if (liveState()[id]) { chosen = id; paintLive(); } else wanted = id; }
        requestAnimationFrame(() => {
          if (!current(job) || location.hash !== "#" + id) return;
          if (openAnchor(id)) wanted = null;
        });
      }
    }
  }

  /* ---------- Actions ---------- */
  async function act(fn, ok, form, origin) {
    const job = viewContext;
    const task = beginMutation(job, form, origin);
    if (!task) return;
    try {
      await fn(job);
      endMutation(task);
      if (!current(job)) return;
      if (ok) window.titanShell.toast({ type: "ok", ...ok });
      await load();
    } catch (e) {
      endMutation(task);
      if (current(job)) window.titanShell.toast({ type: "warn", title: "Pas possible", message: human(e) });
    } finally {
      endMutation(task);
    }
  }

  /* A confirmation that can be taken back, only where the server has the reverse call. The button is added to the toast the
     shell returns; pressing it runs the reverse call once, then the page is read again. */
  function undoable({ title, message, label, undo, done }, job) {
    const el = window.titanShell.toast({ type: "ok", title, message, timeout: 9000 });
    if (!el) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "asc-btn asc-btn-secondary asc-btn-sm cm-undo";
    b.textContent = label;
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!current(job) || sending()) return;
      b.disabled = true;
      try {
        await undo(job);
        el.remove();
        if (current(job)) { window.titanShell.toast({ type: "ok", title: done }); await load(); }
      } catch (err) {
        b.disabled = false;
        if (current(job)) window.titanShell.toast({ type: "warn", title: "Pas possible", message: human(err) });
      }
    });
    el.append(b);
  }

  function friendMenu(id) {
    const job = viewContext;
    if (!current(job) || sending()) return;
    const friends = data?.friends || [];
    const f = friends.find((x) => x.id === id);
    if (!f) return;
    const body = document.createElement("div");
    body.className = "asc-list";
    body.innerHTML = `<button type="button" class="asc-row" data-m="challenge">${icon("target")}<span class="asc-row-main"><span class="asc-row-title">Lancer un défi</span></span></button>
      <button type="button" class="asc-row" data-m="remove">${icon("minus")}<span class="asc-row-main"><span class="asc-row-title">Retirer de mes amis</span><span class="asc-row-sub">Sans prévenir ; vous pourrez redevenir amis par lien ou par code.</span></span></button>
      <button type="button" class="asc-row pf-danger" data-m="block">${icon("lock")}<span class="asc-row-main"><span class="asc-row-title">Bloquer</span><span class="asc-row-sub">Plus aucune demande ni Moment entre vous.</span></span></button>`;
    const d = window.titanShell.sheet({ title: f.name, eyebrow: [f.level ? `Niveau ${f.level}` : "", f.last_active ? `actif ${F().relativeDay(f.last_active + "T12:00:00")}` : ""].filter(Boolean).join(" · ") || "Ami", body });
    body.addEventListener("click", (e) => {
      const b = e.target.closest("[data-m]");
      if (!b || !d.open || !current(job) || sending()) return;
      d.close();
      if (b.dataset.m === "challenge") return newChallenge([id], job, friends);
      if (b.dataset.m === "remove") return confirm({ title: `Retirer ${f.name} ?`, confirmLabel: "Retirer", action: job => rpc("titan_social_remove", { p_user: id }, job).catch(failed) }, job);
      if (b.dataset.m === "block") return confirm({ title: `Bloquer ${f.name} ?`, message: "Vous ne vous verrez plus dans TITAN : plus de demande, de lien, de Moment ni de défi entre vous. Débloquer reste possible depuis « Comptes bloqués ».", confirmLabel: "Bloquer", danger: true, action: job => rpc("titan_block_user", { p_blocked_id: id, p_reason: "blocked_from_community" }, job).then(() => {
        if (current(job)) undoable({ title: `${f.name} est bloqué`, message: "L’amitié est terminée ; débloquer ne la rétablit pas.", label: "Débloquer", done: "Compte débloqué", undo: job => rpc("titan_unblock_user", { p_blocked_id: id }, job) }, job);
      }).catch(failed) }, job);
    });
  }

  function newChallenge(preselect = [], job = viewContext, friends = data?.friends || []) {
    if (!current(job) || sending()) return;
    const form = document.createElement("form");
    form.className = "asc-stack";
    form.noValidate = true;
    form.innerHTML = `<label class="asc-field"><span>Nom</span><input class="asc-input" name="title" maxlength="60" value="Semaine d’effort" required></label>
      <div class="asc-field"><span>Mesure</span><div class="asc-seg ob-metric" role="group">${Object.entries(METRICS).map(([k, m], i) => `<button type="button" data-metric="${k}" aria-pressed="${i === 0}">${m.label}</button>`).join("")}</div><small>Les minutes d’effort comptent pareil pour tous les sports, 90 au plus par jour.</small></div>
      <label class="asc-field" data-sport-field hidden><span>Sport</span><select name="sport">${["running", "cycling", "walking", "hiking", "trail", "swimming"].filter((s) => window.SPORTS_CONFIG?.[s]).map((s) => `<option value="${s}">${esc(SP().label(s))}</option>`).join("")}</select></label>
      <div class="asc-form-grid"><label class="asc-field"><span>Objectif</span><input class="asc-input" type="number" name="target" min="1" max="100000" value="300" required></label>
      <label class="asc-field"><span>Durée</span><select name="days">${[3, 7, 14, 21, 28].map((d) => `<option value="${d}" ${d === 7 ? "selected" : ""}>${d} jours</option>`).join("")}</select></label></div>
      <fieldset class="pf-privacy"><legend class="seance-label">Inviter</legend><p class="asc-small asc-muted">${friends.length ? "Coche des amis, ou personne pour obtenir un lien que n’importe qui peut rejoindre." : "Tu obtiendras un lien à envoyer : n’importe qui peut rejoindre, même sans être ton ami."}</p>${friends.map((f) => `<label class="auth-check"><input type="checkbox" name="invite" value="${esc(f.id)}" ${preselect.includes(f.id) ? "checked" : ""}><span>${esc(f.name)}</span></label>`).join("")}</fieldset>
      <p class="asc-small jr-edit-error" role="alert"></p>
      <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-cancel>Annuler</button><button type="submit" class="asc-btn asc-btn-primary">Lancer</button></div>`;
    let metric = "effort_minutes";
    let operation = null;
    const d = window.titanShell.sheet({ title: "Nouveau défi", eyebrow: "Sans mise", body: form });
    d.addEventListener("cancel", e => { if (operation && !operation.done) e.preventDefault(); });
    d.addEventListener("click", e => {
      if (operation && !operation.done && (e.target === d || e.target.closest?.("[data-close], [data-cancel]"))) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
    form.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || !d.open || !current(job) || sending()) return;
      if (b.hasAttribute("data-cancel")) return d.close();
      if (b.dataset.metric) {
        metric = b.dataset.metric;
        form.querySelectorAll("[data-metric]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        form.querySelector("[data-sport-field]").hidden = metric !== "distance_km";
        form.querySelector("[name=target]").value = { effort_minutes: 300, active_days: 4, sessions: 4, distance_km: 30 }[metric];
      }
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!d.open || !current(job) || sending()) return;
      const err = form.querySelector(".jr-edit-error");
      const invitees = [...form.querySelectorAll("[name=invite]:checked")].map((i) => i.value);
      err.textContent = "";
      const task = beginMutation(job, form);
      if (!task) return;
      operation = task;
      try {
        // AUD-34: without a ticked friend, the challenge is open to whoever receives its one-use link (titan_challenge_open_create_v1).
        let link = null;
        if (invitees.length) await rpc("titan_challenge_create", { p_title: form.querySelector("[name=title]").value.trim(), p_metric: metric, p_sport: metric === "distance_km" ? form.querySelector("[name=sport]").value : null, p_target: Number(form.querySelector("[name=target]").value), p_days: Number(form.querySelector("[name=days]").value), p_invitees: invitees }, job);
        else {
          const answer = await rpc("titan_challenge_open_create_v1", { p_title: form.querySelector("[name=title]").value.trim(), p_metric: metric, p_sport: metric === "distance_km" ? form.querySelector("[name=sport]").value : null, p_target: Number(form.querySelector("[name=target]").value), p_days: Number(form.querySelector("[name=days]").value) }, job);
          link = answer?.token ? `${location.origin}/defi?t=${answer.token}` : null;
          if (link) { try { await navigator.clipboard.writeText(link); } catch {} }
        }
        endMutation(task);
        if (!current(job)) return;
        d.close();
        window.titanShell.toast(link ? { type: "ok", title: "Défi lancé · lien copié", message: link } : { type: "ok", title: "Défi lancé", message: "Tes amis le trouvent dans leur Communauté." });
        load();
      } catch (error) {
        endMutation(task);
        if (!current(job)) return;
        err.textContent = human(error);
        if (d.open) form.querySelector("[type=submit]").focus();
      } finally {
        endMutation(task);
      }
    });
  }

  function onClick(e) {
    if (foreign(e.target)) return;
    const tab = e.target.closest("a[data-live]");
    if (tab && status === "ready") {
      // Another scene: it opens in place, the address remembers it, the focus goes to it. No jump, no history entry.
      e.preventDefault();
      chosen = tab.dataset.live;
      try { history.replaceState(history.state, "", "#" + chosen); } catch { /* the scene still opens */ }
      paintLive();
      const target = document.getElementById(chosen);
      if (target && !target.closest("[hidden]")) { if (!target.hasAttribute("tabindex")) target.tabIndex = -1; target.focus({ preventScroll: true }); }
      return;
    }
    const b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-retry")) return load();
    if (b.hasAttribute("data-support-report")) {
      if (status === "error" && !pending && current(sessionContext)) window.TitanSupportReports?.open(reportCode, sessionContext, b);
      return;
    }
    const job = viewContext;
    if (!current(job)) return clear("transition");
    if (sending()) return;
    if (b.dataset.joinExpedition) return act(job => rpc("titan_expedition_join", { p_id: b.dataset.joinExpedition }, job), { title: "Expédition rejointe", message: "Chaque séance compte désormais." }, null, b);
    if (b.dataset.accept) return act(job => rpc("titan_social_respond", { p_user: b.dataset.accept, p_accept: true }, job), { title: "Nouvel ami", message: "Vous voyez maintenant ce que chacun partage." }, null, b);
    if (b.dataset.decline) return act(job => rpc("titan_social_respond", { p_user: b.dataset.decline, p_accept: false }, job), { title: "Demande refusée" }, null, b);
    if (b.dataset.cancelRequest) return act(job => rpc("titan_social_remove", { p_user: b.dataset.cancelRequest }, job), { title: "Demande annulée" }, null, b);
    if (b.hasAttribute("data-accept-invitation")) return act(job => rpc("titan_friend_link_accept_v1", { p_token: INVITE.invitation }, job).then((r) => {
      invitation = { done: true };
      if (current(job)) window.titanShell.toast({ type: "ok", title: `Toi et ${r?.name || "ton ami"} êtes amis`, message: "Vous voyez maintenant ce que chacun partage." });
    }).catch((e) => { invitation = { valid: false }; throw e; }), null, null, b);
    if (b.hasAttribute("data-ignore-invitation")) { invitation = { done: true }; return render(); }
    if (b.hasAttribute("data-friend-link")) return act(job => createFriendLink(job), null, null, b);
    if (b.hasAttribute("data-blocks")) return openBlocks(job);
    if (b.dataset.cheer) {
      const task = beginMutation(job, null, b);
      if (!task) return;
      task.progress.forEach(node => node.remove()); // the heart itself answers: no line of text for one tap
      return rpc("titan_moment_cheer", { p_id: b.dataset.cheer }, job)
        .then((r) => {
          if (!current(job)) return;
          b.setAttribute("aria-pressed", String(!!r?.cheered));
          b.querySelector("span").textContent = r?.count || "";
        })
        .catch((err) => current(job) && window.titanShell.toast({ type: "warn", message: human(err) }))
        .finally(() => endMutation(task));
    }
    if (b.dataset.deleteMoment) return confirm({ title: "Supprimer ce Moment ?", confirmLabel: "Supprimer", action: job => rpc("titan_moment_delete", { p_id: b.dataset.deleteMoment }, job).catch(failed) });
    if (b.dataset.copyCode) {
      const invite = `Rejoins-moi sur TITAN : ${friendLink(b.dataset.copyCode)} (mon code ami : ${b.dataset.copyCode})`;
      (navigator.clipboard?.writeText(invite) || Promise.reject())
        .then(() => current(job) && window.titanShell.toast({ type: "ok", title: "Invitation copiée (lien et code)", message: b.dataset.copyCode }))
        .catch(() => current(job) && window.titanShell.toast({ type: "warn", title: "Copie impossible", message: `Ton code : ${b.dataset.copyCode}` }));
      return;
    }
    if (b.dataset.friendMenu) return friendMenu(b.dataset.friendMenu);
    if (b.hasAttribute("data-new-challenge")) return newChallenge();
    if (b.dataset.challenge) {
      const a = b.dataset.act;
      return act(job => rpc("titan_challenge_respond", { p_id: b.dataset.challenge, p_action: a }, job).then(() => current(job) && a === "join" && window.TitanAnalytics?.track("challenge_joined")), a === "join" ? { title: "Défi relevé", message: "Tes séances comptent à partir de maintenant." } : a === "decline" ? { title: "Invitation déclinée" } : { title: "Défi quitté" }, null, b);
    }
    if (b.hasAttribute("data-leave-guild")) return confirm({ title: "Quitter la guilde ?", message: "Ta part de la semaine reste à toi ; elle ne compte plus pour l’équipe.", confirmLabel: "Quitter", action: job => rpc("titan_leave_guild", {}, job).catch(failed) });
  }

  function onSubmit(e) {
    const f = e.target;
    if (!root.contains(f) || foreign(f)) return;
    e.preventDefault();
    if (!current(viewContext)) return clear("transition");
    if (sending()) return;
    const v = (n) => (f.querySelector(`[name=${n}]`)?.value || "").trim();
    if (f.hasAttribute("data-add-friend")) {
      const code = v("code").toUpperCase();
      if (!code) return;
      return act(job => rpc("titan_social_request", { p_code: code }, job).then((r) => current(job) && window.titanShell.toast({ type: "ok", title: r?.status === "friends" ? "Vous êtes amis" : "Demande envoyée", message: r?.status === "friends" ? "Vous voyez maintenant ce que chacun partage." : "La personne doit l’accepter." })), null, f);
    }
    if (f.hasAttribute("data-create-guild")) return act(job => rpc("titan_create_guild", { p_name: v("name"), p_motto: "" }, job), { title: "Guilde fondée", message: "Partage son code pour réunir ton équipe." }, f);
    if (f.hasAttribute("data-join-guild")) return act(job => rpc("titan_join_guild", { p_code: v("code").toUpperCase() }, job), { title: "Bienvenue dans la guilde" }, f);
    if (f.hasAttribute("data-guild-target")) return act(job => rpc("titan_guild_set_effort_target", { p_minutes: Number(v("minutes")) }, job), { title: "Objectif réglé" }, f);
    if (f.hasAttribute("data-guild-message")) {
      const content = v("content");
      if (!content) return;
      return act(job => rpc("titan_send_guild_message", { p_content: content }, job), null, f);
    }
  }

  let booted = false;
  function start() {
    root = document.getElementById("communaute");
    if (!root || !window.state?.user) return;
    if (!booted) {
      booted = true;
      SP()?.ensure?.();
      root.addEventListener("click", onClick);
      root.addEventListener("submit", onSubmit);
      document.getElementById("cm-circle")?.addEventListener("click", (e) => {
        const face = e.target.closest("[data-face]");
        if (face && status === "ready") friendMenu(face.dataset.face);
      });
      window.addEventListener("hashchange", () => { const id = location.hash.slice(1); if (ANCHORS.includes(id) && !openAnchor(id)) wanted = LIVE.some((l) => l.id === id) ? id : null; });
      ["titan:buddy-updated", "titan:cordee-updated"].forEach(name => window.addEventListener(name, () => { if (status === "ready") paintLive(); }));
      window.addEventListener("online", load);
      window.addEventListener("offline", () => clear("offline"));
      window.addEventListener("titan:account-changing", () => clear("transition"));
      window.addEventListener("titan:account-changed", load);
      ["focus", "pageshow"].forEach(name => window.addEventListener(name, () => {
        if (!current(sessionContext) && !window.titanAccountTransition?.active) load();
      }));
      render();
      load();
    } else if (!current(sessionContext) && !window.titanAccountTransition?.active) {
      load();
    }
  }
  window.addEventListener("titan:history-updated", () => setTimeout(start, 0));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
