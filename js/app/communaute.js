/* TITAN 300 — Communauté: an expedition everyone pushes, friends who agreed, Moments that matter,
   challenges without stakes and a guild with a shared week. No endless feed, nothing public by default. */
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

  let root = null;
  let data = null;
  let guild = null;
  let status = "loading";
  let errorText = "";
  let pending = false; // the server does not offer the Communauté yet
  let sequence = 0;
  let sessionContext = null;
  let viewContext = null;
  let initialSection = true;

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
  };
  const human = (e) => {
    const raw = String(e?.message || e || "");
    const k = Object.keys(MESSAGES).find((x) => raw.includes(x));
    if (k) return MESSAGES[k];
    if (e?.code === "PGRST202" || raw.includes("Could not find the function")) return "Cette fonction arrive avec la prochaine mise à jour du serveur.";
    return navigator.onLine ? "Action impossible pour le moment. Réessaie dans un instant." : "Hors ligne : la communauté revient avec le réseau.";
  };
  /** Confirm dialogs show the thrown message: give them the human one. */
  const failed = (e) => {
    throw new Error(human(e));
  };

  function closeDialogs() {
    // Sheets on this page can contain names, invitees and actions from the old account.
    document.querySelectorAll(".asc-sheet[open]").forEach(d => d.close());
  }
  function clear(next) {
    ++sequence;
    data = guild = viewContext = sessionContext = null;
    errorText = "";
    pending = false;
    status = next;
    closeDialogs();
    if (next === "transition" || next === "guest") document.querySelector(".asc-toasts")?.replaceChildren();
    render();
  }
  function confirm(options, job = viewContext) {
    if (!current(job)) return;
    return window.titanShell.confirm({ ...options, action: () => {
      if (!current(job)) throw new Error("La session a changé. Rouvre cette action depuis ton compte.");
      return options.action(job);
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
    if (sessionContext && !current(sessionContext)) closeDialogs();
    const job = context(), request = ++sequence;
    const latest = () => request === sequence && current(job);
    sessionContext = job;
    data = guild = viewContext = null;
    pending = false;
    status = "loading";
    render();
    try {
      const overview = await rpc("titan_social_overview", {}, job);
      if (!latest()) return;
      if (overview?.me?.id !== job.owner) throw new Error("INVALID_COMMUNITY_RESPONSE");
      const team = overview.guild ? await rpc("titan_get_my_guild", {}, job).catch(() => null) : null;
      if (!latest()) return;
      data = overview;
      guild = team;
      viewContext = job;
      status = "ready";
    } catch (e) {
      if (!latest()) return;
      errorText = human(e);
      pending = e?.code === "PGRST202" || String(e?.message || "").includes("Could not find the function");
      status = "error";
    }
    render();
  }

  function reload(job) {
    if (current(job)) return load();
  }

  /* ---------- Sections ---------- */
  function sectionLinksHtml() {
    const friends = data?.friends?.length || 0;
    const requests = data?.requests_in?.length || 0;
    const moments = data?.moments?.length || 0;
    const challenges = data?.challenges?.length || 0;
    const labels = {
      moments: moments ? `${moments} Moment${moments > 1 ? "s" : ""} · 30 jours` : "Aucun Moment pour le moment",
      amis: requests ? `${requests} demande${requests > 1 ? "s" : ""} à traiter` : friends ? `${friends} ami${friends > 1 ? "s" : ""}` : "Ajouter un ami",
      defis: challenges ? `${challenges} défi${challenges > 1 ? "s" : ""}` : "Avec tes amis",
      guilde: data?.guild ? "Voir mon équipe" : "Rejoindre une équipe",
    };
    return `<nav class="cm-shortcuts" aria-label="Dans la communauté">${SECTIONS.map(s => `<a class="cm-entry" href="#${s.id}">
      <span class="cm-entry-title">${icon(s.icon)}<strong>${s.title}</strong>${icon("chevron")}</span>
      <span class="cm-entry-description">${s.description}</span><span class="cm-entry-status${s.id === "amis" && requests ? " cm-attention" : ""}">${labels[s.id]}</span>
    </a>`).join("")}</nav>`;
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
    return `<section class="asc-hero cm-expedition" aria-labelledby="cm-exp-title">
      <p class="asc-eyebrow cy">${x.status === "upcoming" ? `Expédition · dès le ${esc(start.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }))}` : x.status === "ended" ? "Expédition terminée" : `Expédition · encore ${daysLeft} jour${daysLeft > 1 ? "s" : ""}`}</p>
      <h2 id="cm-exp-title" class="cm-exp-title">${esc(x.title)}</h2>
      <p class="asc-lead">${esc(x.story)}</p>
      <div class="cm-exp-bar"><div class="asc-between"><span>${esc(x.guardian)} recule</span><strong class="asc-num">${F().number(x.collective_minutes)} / ${F().number(x.collective_goal)} min</strong></div>
        <span class="asc-ascent"><span style="--p:${pct}%"></span></span>
        <p class="asc-small asc-muted">${F().number(x.participants)} participant${x.participants > 1 ? "s" : ""} · tous les sports comptent pareil · ${x.daily_cap} min au plus par jour et par personne.</p></div>
      ${me.joined
        ? `<div class="cm-exp-me"><div class="asc-between"><span>Ta part</span><strong class="asc-num">${F().number(me.minutes)} min · ${me.days} jour${me.days > 1 ? "s" : ""}</strong></div><span class="asc-ascent thin"><span style="--p:${personalPct}%"></span></span>
           <p class="asc-small asc-muted">${me.personal_done ? `${icon("check")} Titre « ${esc(x.reward_title)} » acquis à la fin de l’expédition.` : `Titre « ${esc(x.reward_title)} » avec ${x.personal_days} jours actifs et ${x.personal_minutes} min d’effort, quoi que fasse le groupe.`}</p></div>`
        : x.status !== "ended" ? `<div class="asc-row-flex"><button type="button" class="asc-btn asc-btn-primary" data-join-expedition="${esc(x.id)}">${icon("mountain")} Rejoindre l’expédition</button><span class="asc-small asc-muted">${x.status === "upcoming" ? `Tes séances compteront dès le ${esc(start.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }))}.` : "Tes séances comptent à partir de maintenant."}</span></div>` : ""}
    </section>`;
  }

  function requestsHtml() {
    const list = data?.requests_in || [];
    if (!list.length) return "";
    return `<div class="cm-requests" role="group" aria-labelledby="cm-requests-title"><h3 id="cm-requests-title">Demandes d’amis</h3><div class="asc-list">${list
      .map((r) => `<div class="asc-row cm-request"><span class="cm-avatar"><img src="/assets/renaissance/${esc(r.avatar || "scout")}-s.webp" alt="" width="40" height="40" loading="lazy"></span><span class="asc-row-main"><span class="asc-row-title">${esc(r.name)}</span><span class="asc-row-sub">veut t’ajouter</span></span>
        <span class="cm-actions"><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-accept="${esc(r.id)}">Accepter</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-decline="${esc(r.id)}">Refuser</button></span></div>`)
      .join("")}</div></div>`;
  }

  function momentsHtml() {
    const list = data?.moments || [];
    return `<section class="asc-section cm-section" id="moments" tabindex="-1" aria-labelledby="cm-moments-title"><div class="asc-section-head"><h2 id="cm-moments-title">Moments</h2><span class="asc-small asc-muted">30 derniers jours</span></div>
      <p class="cm-section-intro">Records, objectifs et séances partagés par toi et tes amis.</p>
      ${list.length ? `<div class="cm-moments">${list
        .map((m) => `<article class="cm-moment" data-kind="${esc(m.kind)}">
          <span class="cm-avatar"><img src="/assets/renaissance/${esc(m.author?.avatar || "scout")}-s.webp" alt="" width="40" height="40" loading="lazy"></span>
          <div class="cm-moment-main"><p class="asc-small asc-muted"><strong>${esc(m.mine ? "Toi" : m.author?.name)}</strong> · ${esc(F().relativeDay(m.created_at))}</p>
            <p class="cm-moment-title">${icon(KIND_ICON[m.kind] || "bolt")}<span>${esc(m.title)}</span></p>
            ${m.detail ? `<p class="cm-moment-detail asc-num">${esc(m.detail)}</p>` : ""}
          </div>
          ${m.mine ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-icon" data-delete-moment="${esc(m.id)}" aria-label="Supprimer ce Moment">${icon("trash")}</button>` : `<button type="button" class="cm-cheer" data-cheer="${esc(m.id)}" aria-pressed="${!!m.cheered}" aria-label="Encourager ${esc(m.author?.name)}">${icon("heart")}<span class="asc-num">${m.cheers || ""}</span></button>`}
        </article>`)
        .join("")}</div>` : `<p class="asc-empty asc-small">Un Moment, c’est un record, un objectif, une balise ou une grosse séance que tu choisis de montrer. Partage-le depuis l’écran de fin de séance ou tes records.</p>`}
      ${list.length ? "" : '<a class="asc-btn asc-btn-secondary asc-btn-sm" href="/records">Voir mes records</a>'}
    </section>`;
  }

  function friendsHtml() {
    const me = data?.me || {};
    const list = data?.friends || [];
    const out = data?.requests_out || [];
    return `<section class="asc-section cm-section" id="amis" tabindex="-1" aria-labelledby="cm-friends-title"><div class="asc-section-head"><h2 id="cm-friends-title">Amis</h2><span class="asc-chip">${list.length} ami${list.length > 1 ? "s" : ""}</span></div>
      <p class="cm-section-intro">Échangez vos codes. Chacun choisit ce qu’il partage.</p>
      ${requestsHtml()}
      <div class="cm-code"><div><p class="asc-small asc-muted">Ton code ami</p><p class="cm-code-value asc-num">${esc(me.friend_code || "—")}</p>
        <p class="asc-small ${me.findable ? "asc-muted" : "cm-warn"}">${me.findable ? "Trouvable : on peut te demander en ami avec ce code." : `Tu n’es pas trouvable. <a href="/profile#reglages">Activer dans Confidentialité</a> pour recevoir des demandes.`}</p></div>
        <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-copy-code="${esc(me.friend_code || "")}">${icon("copy")} Copier</button></div>
      <form class="cm-add" data-add-friend><label class="sr-only" for="cm-code">Code ami</label><input id="cm-code" class="asc-input" name="code" placeholder="Code d’un ami : TN-AB12" autocapitalize="characters" autocomplete="off" maxlength="12"><button type="submit" class="asc-btn asc-btn-primary">${icon("userPlus")} Demander</button></form>
      ${out.length ? `<p class="asc-small asc-muted">${out.length} demande${out.length > 1 ? "s" : ""} en attente de réponse.</p>` : ""}
      ${list.length ? `<div class="asc-list">${list
        .map((f) => `<div class="asc-row"><span class="cm-avatar"><img src="/assets/renaissance/${esc(f.avatar || "scout")}-s.webp" alt="" width="40" height="40" loading="lazy"></span>
          <span class="asc-row-main"><span class="asc-row-title">${esc(f.name)}</span><span class="asc-row-sub">${[f.level ? `Niveau ${f.level}` : "", f.week_days !== null && f.week_days !== undefined ? `${f.week_days} jour${f.week_days > 1 ? "s" : ""} actif${f.week_days > 1 ? "s" : ""} cette semaine` : "", f.last_active ? `actif ${F().relativeDay(f.last_active + "T12:00:00")}` : ""].filter(Boolean).join(" · ") || "Statistiques privées"}</span></span>
          <button type="button" class="asc-btn asc-btn-ghost asc-btn-icon" data-friend-menu="${esc(f.id)}" aria-label="Options pour ${esc(f.name)}">${icon("more")}</button></div>`)
        .join("")}</div>` : `<p class="asc-small asc-muted">Échange vos codes : la personne accepte ta demande, puis vous voyez seulement ce que chacun a choisi de partager.</p>`}
    </section>`;
  }

  function challengesHtml() {
    const list = data?.challenges || [];
    const friends = data?.friends || [];
    return `<section class="asc-section cm-section" id="defis" tabindex="-1" aria-labelledby="cm-challenges-title"><div class="asc-section-head"><h2 id="cm-challenges-title">Défis</h2>${friends.length ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-new-challenge>${icon("plus")} Lancer un défi</button>` : ""}</div>
      <p class="cm-section-intro">Avancez vers le même objectif. La progression de chacun se voit dans son défi.</p>
      ${list.length ? `<div class="cm-challenges">${list
        .map((c) => {
          const m = METRICS[c.metric] || METRICS.effort_minutes;
          const end = new Date(c.ends_at);
          const daysLeft = Math.max(0, Math.ceil((end - Date.now()) / DAY));
          return `<article class="cm-challenge"><div class="asc-between"><h3>${esc(c.title)}</h3><span class="asc-chip">${c.status === "ended" ? "Terminé" : `${daysLeft} j`}</span></div>
            <p class="asc-small asc-muted">${esc(m.label)}${c.sport ? ` · ${esc(SP().label(c.sport))}` : ""} · objectif ${esc(m.fmt(c.target))}</p>
            <ul class="cm-board">${(c.members || [])
              .slice()
              .sort((a, b) => (Number(b.progress) || 0) - (Number(a.progress) || 0))
              .map((p) => `<li><span>${esc(p.name)}${p.status === "invited" ? ' <small class="asc-faint">invité</small>' : ""}</span>${p.status === "joined" ? `<span class="asc-ascent thin"><span style="--p:${Math.min(100, Math.round(((Number(p.progress) || 0) / c.target) * 100))}%"></span></span><strong class="asc-num">${esc(m.fmt(Number(p.progress) || 0))}</strong>` : "<span></span><span></span>"}</li>`)
              .join("")}</ul>
            ${c.my_status === "invited" ? `<div class="asc-row-flex"><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-challenge="${esc(c.id)}" data-act="join">Relever le défi</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-challenge="${esc(c.id)}" data-act="decline">Décliner</button></div>` : c.status !== "ended" ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-challenge="${esc(c.id)}" data-act="leave">Quitter</button>` : ""}
            <p class="asc-small asc-faint">Effort plafonné à 90 min par jour ; séances ajoutées après le départ du défi. Aucune mise, aucune récompense en crédits.</p>
          </article>`;
        })
        .join("")}</div>` : `<p class="asc-small asc-muted">${friends.length ? "Un défi, c’est une période et une mesure commune. Pas de mise : juste la motivation d’avancer ensemble." : "Ajoute un ami pour lancer votre premier défi."}</p>`}
      ${friends.length ? "" : '<a class="asc-btn asc-btn-secondary asc-btn-sm" href="#amis">Ajouter un ami</a>'}
    </section>`;
  }

  function guildHtml() {
    const week = data?.guild;
    if (week && !guild)
      return `<section class="asc-section cm-section" id="guilde" tabindex="-1" aria-labelledby="cm-guild-title"><div class="asc-section-head"><h2 id="cm-guild-title">Guilde</h2></div><p class="asc-small asc-muted">Ta guilde ne s’affiche pas pour le moment. Réessaie dans un instant.</p><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-retry>Réessayer</button></section>`;
    if (!week)
      return `<section class="asc-section cm-section" id="guilde" tabindex="-1" aria-labelledby="cm-guild-title"><div class="asc-section-head"><h2 id="cm-guild-title">Guilde</h2></div>
        <p class="cm-section-intro">Une équipe qui tient une semaine d’effort ensemble : un objectif commun, la part de chacun et une discussion.</p>
        <div class="cm-guild-forms"><form class="cm-add" data-create-guild><label class="sr-only" for="cm-guild-name">Nom de la guilde</label><input id="cm-guild-name" class="asc-input" name="name" maxlength="28" placeholder="Nom de la guilde" required><button type="submit" class="asc-btn asc-btn-secondary">Fonder</button></form>
        <form class="cm-add" data-join-guild><label class="sr-only" for="cm-guild-code">Code de guilde</label><input id="cm-guild-code" class="asc-input" name="code" maxlength="16" placeholder="Code de guilde" autocapitalize="characters" required><button type="submit" class="asc-btn asc-btn-secondary">Rejoindre</button></form></div></section>`;
    const pct = Math.min(100, Math.round((week.minutes / Math.max(1, week.target)) * 100));
    const owner = guild.owner_id === window.state?.user?.id;
    const msgs = (guild.messages || []).slice(-30);
    return `<section class="asc-section cm-section" id="guilde" tabindex="-1" aria-labelledby="cm-guild-title"><p class="asc-eyebrow">Guilde</p><div class="asc-section-head"><h2 id="cm-guild-title">${esc(guild.name)}</h2><span class="asc-small asc-muted">Code ${esc(guild.code || "")}</span></div>
      <p class="cm-section-intro">L’effort de l’équipe cette semaine, puis votre discussion.</p>
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

  function render() {
    if (!root) return;
    root.setAttribute("aria-busy", String(status === "loading"));
    if (status === "transition") {
      root.innerHTML = '<p class="asc-empty" role="status">La session a changé. La communauté revient après la synchronisation du compte.</p>';
      return;
    }
    if (status === "loading") {
      root.innerHTML = `<div class="asc-skeleton" style="height:240px;border-radius:26px"></div><div class="asc-skeleton" style="height:120px;margin-top:24px"></div>`;
      return;
    }
    if (status === "guest") {
      root.innerHTML = `<section class="asc-hero cm-guest"><p class="asc-eyebrow cy">Communauté</p><h2 class="cm-exp-title">Avancer avec les autres, sans bruit.</h2>
        <p class="asc-lead">Retrouve tes amis, partage tes progrès et participe aux expéditions.</p>
        <div class="asc-row-flex"><a class="asc-btn asc-btn-primary" href="/login?mode=signup">Créer un compte</a><a class="asc-btn asc-btn-ghost" href="/login">Se connecter</a></div>
        <p class="asc-small asc-muted">En mode découverte, rien ne quitte ton appareil.</p>
        <ul class="cm-preview">${SECTIONS.map(s => `<li>${icon(s.icon)}<div><strong>${s.title}</strong><p>${s.description}</p></div></li>`).join("")}</ul></section>`;
      return;
    }
    if (status === "offline" || status === "error") {
      root.innerHTML = `<div class="asc-empty"><h2>${status === "offline" ? "Hors ligne" : pending ? "Communauté bientôt disponible" : "Communauté indisponible"}</h2><p>${esc(status === "offline" ? "Tes séances continuent d’être enregistrées sur cet appareil. La communauté revient avec le réseau." : errorText)}</p>${status === "error" && pending ? "" : `<button type="button" class="asc-btn asc-btn-secondary" data-retry>${icon("restore")} Réessayer</button>`}</div>`;
      root.setAttribute("aria-busy", "false");
      return;
    }
    root.innerHTML = `${sectionLinksHtml()}
      <div class="cm-layout"><div class="cm-stream"><p class="cm-column-label">Le fil</p>${expeditionHtml()}${momentsHtml()}</div>
      <div class="cm-circle"><p class="cm-column-label">Ton cercle</p>${friendsHtml()}</div></div>
      <p class="cm-column-label cm-team-label">Avancer en équipe</p><div class="cm-teams">${challengesHtml()}${guildHtml()}</div>`;
    root.setAttribute("aria-busy", "false");
    const chat = root.querySelector(".cm-chat-list");
    if (chat) chat.scrollTop = chat.scrollHeight;
    if (initialSection) {
      initialSection = false;
      const id = location.hash.slice(1);
      const target = SECTIONS.some(s => s.id === id) && document.getElementById(id);
      const job = viewContext;
      if (target) requestAnimationFrame(() => {
        if (!current(job) || !target.isConnected || location.hash !== "#" + id) return;
        target.scrollIntoView({ block: "start", behavior: "instant" });
        target.focus({ preventScroll: true });
      });
    }
  }

  /* ---------- Actions ---------- */
  async function act(fn, ok) {
    const job = viewContext;
    if (!current(job)) return;
    try {
      await fn(job);
      if (!current(job)) return;
      if (ok) window.titanShell.toast({ type: "ok", ...ok });
      await load();
    } catch (e) {
      if (current(job)) window.titanShell.toast({ type: "warn", title: "Pas possible", message: human(e) });
    }
  }

  function friendMenu(id) {
    const job = viewContext;
    if (!current(job)) return;
    const friends = data?.friends || [];
    const f = friends.find((x) => x.id === id);
    if (!f) return;
    const body = document.createElement("div");
    body.className = "asc-list";
    body.innerHTML = `<button type="button" class="asc-row" data-m="challenge">${icon("target")}<span class="asc-row-main"><span class="asc-row-title">Lancer un défi</span></span></button>
      <button type="button" class="asc-row" data-m="remove">${icon("minus")}<span class="asc-row-main"><span class="asc-row-title">Retirer de mes amis</span><span class="asc-row-sub">Sans prévenir ; vous pourrez redevenir amis par code.</span></span></button>
      <button type="button" class="asc-row pf-danger" data-m="block">${icon("lock")}<span class="asc-row-main"><span class="asc-row-title">Bloquer</span><span class="asc-row-sub">Plus aucune demande ni Moment entre vous.</span></span></button>`;
    const d = window.titanShell.sheet({ title: f.name, eyebrow: "Ami", body });
    body.addEventListener("click", (e) => {
      const b = e.target.closest("[data-m]");
      if (!b || !d.open || !current(job)) return;
      d.close();
      if (b.dataset.m === "challenge") return newChallenge([id], job, friends);
      if (b.dataset.m === "remove") return confirm({ title: `Retirer ${f.name} ?`, confirmLabel: "Retirer", action: job => rpc("titan_social_remove", { p_user: id }, job).then(() => reload(job), failed) }, job);
      if (b.dataset.m === "block") return confirm({ title: `Bloquer ${f.name} ?`, message: "Vous ne vous verrez plus dans TITAN. Débloquer reste possible depuis le support.", confirmLabel: "Bloquer", danger: true, action: job => rpc("titan_block_user", { p_blocked_id: id, p_reason: "blocked_from_community" }, job).then(() => reload(job), failed) }, job);
    });
  }

  function newChallenge(preselect = [], job = viewContext, friends = data?.friends || []) {
    if (!current(job)) return;
    const form = document.createElement("form");
    form.className = "asc-stack";
    form.noValidate = true;
    form.innerHTML = `<label class="asc-field"><span>Nom</span><input class="asc-input" name="title" maxlength="60" value="Semaine d’effort" required></label>
      <div class="asc-field"><span>Mesure</span><div class="asc-seg ob-metric" role="group">${Object.entries(METRICS).map(([k, m], i) => `<button type="button" data-metric="${k}" aria-pressed="${i === 0}">${m.label}</button>`).join("")}</div><small>Les minutes d’effort comptent pareil pour tous les sports, 90 au plus par jour.</small></div>
      <label class="asc-field" data-sport-field hidden><span>Sport</span><select name="sport">${["running", "cycling", "walking", "hiking", "trail", "swimming"].filter((s) => window.SPORTS_CONFIG?.[s]).map((s) => `<option value="${s}">${esc(SP().label(s))}</option>`).join("")}</select></label>
      <div class="asc-form-grid"><label class="asc-field"><span>Objectif</span><input class="asc-input" type="number" name="target" min="1" max="100000" value="300" required></label>
      <label class="asc-field"><span>Durée</span><select name="days">${[3, 7, 14, 21, 28].map((d) => `<option value="${d}" ${d === 7 ? "selected" : ""}>${d} jours</option>`).join("")}</select></label></div>
      <fieldset class="pf-privacy"><legend class="seance-label">Inviter</legend>${friends.map((f) => `<label class="auth-check"><input type="checkbox" name="invite" value="${esc(f.id)}" ${preselect.includes(f.id) ? "checked" : ""}><span>${esc(f.name)}</span></label>`).join("")}</fieldset>
      <p class="asc-small jr-edit-error" role="alert"></p>
      <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-cancel>Annuler</button><button type="submit" class="asc-btn asc-btn-primary">Lancer</button></div>`;
    let metric = "effort_minutes";
    const d = window.titanShell.sheet({ title: "Nouveau défi", eyebrow: "Sans mise", body: form });
    form.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || !d.open || !current(job)) return;
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
      if (!d.open || !current(job)) return;
      const err = form.querySelector(".jr-edit-error");
      const invitees = [...form.querySelectorAll("[name=invite]:checked")].map((i) => i.value);
      if (!invitees.length) return (err.textContent = "Invite au moins un ami.");
      const btn = form.querySelector("[type=submit]");
      btn.disabled = true;
      try {
        await rpc("titan_challenge_create", { p_title: form.querySelector("[name=title]").value.trim(), p_metric: metric, p_sport: metric === "distance_km" ? form.querySelector("[name=sport]").value : null, p_target: Number(form.querySelector("[name=target]").value), p_days: Number(form.querySelector("[name=days]").value), p_invitees: invitees }, job);
        if (!current(job)) return;
        d.close();
        window.titanShell.toast({ type: "ok", title: "Défi lancé", message: "Tes amis le trouvent dans leur Communauté." });
        load();
      } catch (error) {
        if (!current(job)) return;
        err.textContent = human(error);
        btn.disabled = false;
      }
    });
  }

  function onClick(e) {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-retry")) return load();
    const job = viewContext;
    if (!current(job)) return clear("transition");
    if (b.dataset.joinExpedition) return act(job => rpc("titan_expedition_join", { p_id: b.dataset.joinExpedition }, job), { title: "Expédition rejointe", message: "Chaque séance compte désormais." });
    if (b.dataset.accept) return act(job => rpc("titan_social_respond", { p_user: b.dataset.accept, p_accept: true }, job), { title: "Nouvel ami" });
    if (b.dataset.decline) return act(job => rpc("titan_social_respond", { p_user: b.dataset.decline, p_accept: false }, job));
    if (b.dataset.cheer) {
      b.disabled = true;
      return rpc("titan_moment_cheer", { p_id: b.dataset.cheer }, job)
        .then((r) => {
          if (!current(job)) return;
          b.setAttribute("aria-pressed", String(!!r?.cheered));
          b.querySelector("span").textContent = r?.count || "";
        })
        .catch((err) => current(job) && window.titanShell.toast({ type: "warn", message: human(err) }))
        .finally(() => (b.disabled = false));
    }
    if (b.dataset.deleteMoment) return confirm({ title: "Supprimer ce Moment ?", confirmLabel: "Supprimer", action: job => rpc("titan_moment_delete", { p_id: b.dataset.deleteMoment }, job).then(() => reload(job), failed) });
    if (b.dataset.copyCode) {
      (navigator.clipboard?.writeText(b.dataset.copyCode) || Promise.reject())
        .then(() => current(job) && window.titanShell.toast({ type: "ok", title: "Code copié", message: b.dataset.copyCode }))
        .catch(() => current(job) && window.titanShell.toast({ type: "warn", title: "Copie impossible", message: `Ton code : ${b.dataset.copyCode}` }));
      return;
    }
    if (b.dataset.friendMenu) return friendMenu(b.dataset.friendMenu);
    if (b.hasAttribute("data-new-challenge")) return newChallenge();
    if (b.dataset.challenge) {
      const a = b.dataset.act;
      return act(job => rpc("titan_challenge_respond", { p_id: b.dataset.challenge, p_action: a }, job).then(() => current(job) && a === "join" && window.TitanAnalytics?.track("challenge_joined")), a === "join" ? { title: "Défi relevé" } : null);
    }
    if (b.hasAttribute("data-leave-guild")) return confirm({ title: "Quitter la guilde ?", message: "Ta part de la semaine reste à toi ; elle ne compte plus pour l’équipe.", confirmLabel: "Quitter", action: job => rpc("titan_leave_guild", {}, job).then(() => reload(job), failed) });
  }

  function onSubmit(e) {
    const f = e.target;
    if (!root.contains(f)) return;
    e.preventDefault();
    if (!current(viewContext)) return clear("transition");
    const v = (n) => (f.querySelector(`[name=${n}]`)?.value || "").trim();
    if (f.hasAttribute("data-add-friend")) {
      const code = v("code").toUpperCase();
      if (!code) return;
      return act(job => rpc("titan_social_request", { p_code: code }, job).then((r) => current(job) && window.titanShell.toast({ type: "ok", title: r?.status === "friends" ? "Vous êtes amis" : "Demande envoyée", message: r?.status === "friends" ? "Vous voyez maintenant ce que chacun partage." : "La personne doit l’accepter." })));
    }
    if (f.hasAttribute("data-create-guild")) return act(job => rpc("titan_create_guild", { p_name: v("name"), p_motto: "" }, job), { title: "Guilde fondée", message: "Partage son code pour réunir ton équipe." });
    if (f.hasAttribute("data-join-guild")) return act(job => rpc("titan_join_guild", { p_code: v("code").toUpperCase() }, job), { title: "Bienvenue dans la guilde" });
    if (f.hasAttribute("data-guild-target")) return act(job => rpc("titan_guild_set_effort_target", { p_minutes: Number(v("minutes")) }, job), { title: "Objectif réglé" });
    if (f.hasAttribute("data-guild-message")) {
      const content = v("content");
      if (!content) return;
      return act(job => rpc("titan_send_guild_message", { p_content: content }, job));
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
