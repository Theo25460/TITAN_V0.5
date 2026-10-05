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

  let root = null;
  let data = null;
  let guild = null;
  let status = "loading";
  let errorText = "";
  let pending = false; // the server does not offer the Communauté yet

  const isGuest = () => String(window.state?.user?.id || "").startsWith("guest_");
  const rpc = async (name, params = {}) => {
    const { data: d, error } = await window.titanClient.rpc(name, params);
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

  async function load() {
    if (isGuest() || !window.titanClient) {
      status = "guest";
      return render();
    }
    if (!navigator.onLine) {
      status = "offline";
      return render();
    }
    try {
      data = await rpc("titan_social_overview");
      guild = data?.guild ? await rpc("titan_get_my_guild").catch(() => null) : null;
      status = "ready";
    } catch (e) {
      errorText = human(e);
      pending = e?.code === "PGRST202" || String(e?.message || "").includes("Could not find the function");
      status = "error";
    }
    render();
  }

  /* ---------- Sections ---------- */
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
    return `<section class="asc-section"><div class="asc-section-head"><h2>Demandes d’amis</h2></div><div class="asc-list">${list
      .map((r) => `<div class="asc-row"><span class="cm-avatar"><img src="/assets/renaissance/${esc(r.avatar || "scout")}-s.webp" alt="" width="40" height="40" loading="lazy"></span><span class="asc-row-main"><span class="asc-row-title">${esc(r.name)}</span><span class="asc-row-sub">veut t’ajouter</span></span>
        <span class="cm-actions"><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-accept="${esc(r.id)}">Accepter</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-decline="${esc(r.id)}">Refuser</button></span></div>`)
      .join("")}</div></section>`;
  }

  function momentsHtml() {
    const list = data?.moments || [];
    return `<section class="asc-section" id="moments"><div class="asc-section-head"><h2>Moments</h2><span class="asc-small asc-muted">30 derniers jours</span></div>
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
    </section>`;
  }

  function friendsHtml() {
    const me = data?.me || {};
    const list = data?.friends || [];
    const out = data?.requests_out || [];
    return `<section class="asc-section" id="amis"><div class="asc-section-head"><h2>Amis</h2><span class="asc-small asc-muted">${list.length}</span></div>
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
    return `<section class="asc-section" id="defis"><div class="asc-section-head"><h2>Défis</h2>${friends.length ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-new-challenge>${icon("plus")} Lancer un défi</button>` : ""}</div>
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
    </section>`;
  }

  function guildHtml() {
    const week = data?.guild;
    if (week && !guild)
      return `<section class="asc-section" id="guilde"><div class="asc-section-head"><h2>Guilde</h2></div><p class="asc-small asc-muted">Ta guilde ne s’affiche pas pour le moment. Réessaie dans un instant.</p></section>`;
    if (!week)
      return `<section class="asc-section" id="guilde"><div class="asc-section-head"><h2>Guilde</h2></div>
        <p class="asc-small asc-muted">Une guilde, c’est une équipe qui tient une semaine d’effort ensemble : un objectif commun, la part de chacun, un fil de discussion.</p>
        <div class="cm-guild-forms"><form class="cm-add" data-create-guild><input class="asc-input" name="name" maxlength="28" placeholder="Nom de la guilde" required><button type="submit" class="asc-btn asc-btn-secondary">Fonder</button></form>
        <form class="cm-add" data-join-guild><input class="asc-input" name="code" maxlength="16" placeholder="Code de guilde" autocapitalize="characters" required><button type="submit" class="asc-btn asc-btn-secondary">Rejoindre</button></form></div></section>`;
    const pct = Math.min(100, Math.round((week.minutes / Math.max(1, week.target)) * 100));
    const owner = guild.owner_id === window.state?.user?.id;
    const msgs = (guild.messages || []).slice(-30);
    return `<section class="asc-section" id="guilde"><div class="asc-section-head"><h2>${esc(guild.name)}</h2><span class="asc-small asc-muted">Code ${esc(guild.code || "")}</span></div>
      <div class="cm-guild"><div class="asc-between"><span>Semaine d’effort</span><strong class="asc-num">${F().number(week.minutes)} / ${F().number(week.target)} min</strong></div>
        <span class="asc-ascent"><span style="--p:${pct}%"></span></span>
        <ul class="cm-board">${(week.members || []).map((m) => `<li><span>${esc(m.name)}${m.role === "owner" ? ' <small class="asc-faint">fondateur</small>' : ""}</span><span class="asc-ascent thin"><span style="--p:${Math.min(100, Math.round((m.minutes / Math.max(1, week.target)) * 100))}%"></span></span><strong class="asc-num">${F().number(m.minutes)} min</strong></li>`).join("")}</ul>
        ${owner ? `<form class="cm-add" data-guild-target><label class="sr-only" for="cm-target">Objectif hebdomadaire en minutes</label><input id="cm-target" class="asc-input" type="number" min="60" max="100000" step="30" name="minutes" value="${esc(week.target)}"><button type="submit" class="asc-btn asc-btn-ghost">Régler l’objectif</button></form>` : ""}
      </div>
      <div class="cm-chat"><div class="cm-chat-list" role="log" aria-label="Discussion de guilde">${msgs.length ? msgs.map((m) => `<p><strong>${esc(m.sender_name)}</strong> ${esc(m.content)}</p>`).join("") : '<p class="asc-small asc-muted">Aucun message. Les messages s’effacent après 72 h.</p>'}</div>
        <form class="cm-add" data-guild-message><label class="sr-only" for="cm-msg">Message</label><input id="cm-msg" class="asc-input" name="content" maxlength="280" placeholder="Un mot pour l’équipe"><button type="submit" class="asc-btn asc-btn-secondary">${icon("send")}</button></form></div>
      <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-leave-guild>Quitter la guilde</button>
    </section>`;
  }

  function render() {
    if (!root) return;
    if (status === "loading") {
      root.innerHTML = `<div class="asc-skeleton" style="height:240px;border-radius:26px"></div><div class="asc-skeleton" style="height:120px;margin-top:24px"></div>`;
      return;
    }
    if (status === "guest") {
      root.innerHTML = `<section class="asc-hero cm-guest"><p class="asc-eyebrow cy">Communauté</p><h2 class="cm-exp-title">Avancer avec les autres, sans bruit.</h2>
        <p class="asc-lead">Des expéditions où chaque minute d’effort compte pareil, des amis qui acceptent ta demande, des défis sans mise et des Moments que tu choisis de montrer.</p>
        <div class="asc-row-flex"><a class="asc-btn asc-btn-primary" href="/login?mode=signup">Créer un compte</a><a class="asc-btn asc-btn-ghost" href="/login">Se connecter</a></div>
        <p class="asc-small asc-muted">En mode découverte, rien ne quitte ton appareil.</p></section>`;
      return;
    }
    if (status === "offline" || status === "error") {
      root.innerHTML = `<div class="asc-empty"><h2>${status === "offline" ? "Hors ligne" : pending ? "Communauté bientôt disponible" : "Communauté indisponible"}</h2><p>${esc(status === "offline" ? "Tes séances continuent d’être enregistrées sur cet appareil. La communauté revient avec le réseau." : errorText)}</p>${status === "error" && pending ? "" : `<button type="button" class="asc-btn asc-btn-secondary" data-retry>${icon("restore")} Réessayer</button>`}</div>`;
      root.setAttribute("aria-busy", "false");
      return;
    }
    root.innerHTML = `${expeditionHtml()}${requestsHtml()}
      <nav class="pf-jump" aria-label="Sections"><a href="#moments">Moments</a><a href="#amis">Amis</a><a href="#defis">Défis</a><a href="#guilde">Guilde</a></nav>
      ${momentsHtml()}${friendsHtml()}${challengesHtml()}${guildHtml()}`;
    root.setAttribute("aria-busy", "false");
    const chat = root.querySelector(".cm-chat-list");
    if (chat) chat.scrollTop = chat.scrollHeight;
  }

  /* ---------- Actions ---------- */
  async function act(fn, ok) {
    try {
      await fn();
      if (ok) window.titanShell.toast({ type: "ok", ...ok });
      await load();
    } catch (e) {
      window.titanShell.toast({ type: "warn", title: "Pas possible", message: human(e) });
    }
  }

  function friendMenu(id) {
    const f = (data?.friends || []).find((x) => x.id === id);
    if (!f) return;
    const body = document.createElement("div");
    body.className = "asc-list";
    body.innerHTML = `<button type="button" class="asc-row" data-m="challenge">${icon("target")}<span class="asc-row-main"><span class="asc-row-title">Lancer un défi</span></span></button>
      <button type="button" class="asc-row" data-m="remove">${icon("minus")}<span class="asc-row-main"><span class="asc-row-title">Retirer de mes amis</span><span class="asc-row-sub">Sans prévenir ; vous pourrez redevenir amis par code.</span></span></button>
      <button type="button" class="asc-row pf-danger" data-m="block">${icon("lock")}<span class="asc-row-main"><span class="asc-row-title">Bloquer</span><span class="asc-row-sub">Plus aucune demande ni Moment entre vous.</span></span></button>`;
    const d = window.titanShell.sheet({ title: f.name, eyebrow: "Ami", body });
    body.addEventListener("click", (e) => {
      const b = e.target.closest("[data-m]");
      if (!b) return;
      d.close();
      if (b.dataset.m === "challenge") return newChallenge([id]);
      if (b.dataset.m === "remove") return window.titanShell.confirm({ title: `Retirer ${f.name} ?`, confirmLabel: "Retirer", action: () => rpc("titan_social_remove", { p_user: id }).then(load, failed) });
      if (b.dataset.m === "block") return window.titanShell.confirm({ title: `Bloquer ${f.name} ?`, message: "Vous ne vous verrez plus dans TITAN. Débloquer reste possible depuis le support.", confirmLabel: "Bloquer", danger: true, action: () => rpc("titan_block_user", { p_blocked_id: id, p_reason: "blocked_from_community" }).then(load, failed) });
    });
  }

  function newChallenge(preselect = []) {
    const friends = data?.friends || [];
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
      if (!b) return;
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
      const err = form.querySelector(".jr-edit-error");
      const invitees = [...form.querySelectorAll("[name=invite]:checked")].map((i) => i.value);
      if (!invitees.length) return (err.textContent = "Invite au moins un ami.");
      const btn = form.querySelector("[type=submit]");
      btn.disabled = true;
      try {
        await rpc("titan_challenge_create", { p_title: form.querySelector("[name=title]").value.trim(), p_metric: metric, p_sport: metric === "distance_km" ? form.querySelector("[name=sport]").value : null, p_target: Number(form.querySelector("[name=target]").value), p_days: Number(form.querySelector("[name=days]").value), p_invitees: invitees });
        d.close();
        window.titanShell.toast({ type: "ok", title: "Défi lancé", message: "Tes amis le trouvent dans leur Communauté." });
        load();
      } catch (error) {
        err.textContent = human(error);
        btn.disabled = false;
      }
    });
  }

  function onClick(e) {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-retry")) return load();
    if (b.dataset.joinExpedition) return act(() => rpc("titan_expedition_join", { p_id: b.dataset.joinExpedition }), { title: "Expédition rejointe", message: "Chaque séance compte désormais." });
    if (b.dataset.accept) return act(() => rpc("titan_social_respond", { p_user: b.dataset.accept, p_accept: true }), { title: "Nouvel ami" });
    if (b.dataset.decline) return act(() => rpc("titan_social_respond", { p_user: b.dataset.decline, p_accept: false }));
    if (b.dataset.cheer) {
      b.disabled = true;
      return rpc("titan_moment_cheer", { p_id: b.dataset.cheer })
        .then((r) => {
          b.setAttribute("aria-pressed", String(!!r?.cheered));
          b.querySelector("span").textContent = r?.count || "";
        })
        .catch((err) => window.titanShell.toast({ type: "warn", message: human(err) }))
        .finally(() => (b.disabled = false));
    }
    if (b.dataset.deleteMoment) return window.titanShell.confirm({ title: "Supprimer ce Moment ?", confirmLabel: "Supprimer", action: () => rpc("titan_moment_delete", { p_id: b.dataset.deleteMoment }).then(load, failed) });
    if (b.dataset.copyCode) {
      (navigator.clipboard?.writeText(b.dataset.copyCode) || Promise.reject())
        .then(() => window.titanShell.toast({ type: "ok", title: "Code copié", message: b.dataset.copyCode }))
        .catch(() => window.titanShell.toast({ type: "warn", title: "Copie impossible", message: `Ton code : ${b.dataset.copyCode}` }));
      return;
    }
    if (b.dataset.friendMenu) return friendMenu(b.dataset.friendMenu);
    if (b.hasAttribute("data-new-challenge")) return newChallenge();
    if (b.dataset.challenge) {
      const a = b.dataset.act;
      return act(() => rpc("titan_challenge_respond", { p_id: b.dataset.challenge, p_action: a }).then(() => a === "join" && window.TitanAnalytics?.track("challenge_joined")), a === "join" ? { title: "Défi relevé" } : null);
    }
    if (b.hasAttribute("data-leave-guild")) return window.titanShell.confirm({ title: "Quitter la guilde ?", message: "Ta part de la semaine reste à toi ; elle ne compte plus pour l’équipe.", confirmLabel: "Quitter", action: () => rpc("titan_leave_guild").then(load, failed) });
  }

  function onSubmit(e) {
    const f = e.target;
    if (!root.contains(f)) return;
    e.preventDefault();
    const v = (n) => (f.querySelector(`[name=${n}]`)?.value || "").trim();
    if (f.hasAttribute("data-add-friend")) {
      const code = v("code").toUpperCase();
      if (!code) return;
      return act(() => rpc("titan_social_request", { p_code: code }).then((r) => window.titanShell.toast({ type: "ok", title: r?.status === "friends" ? "Vous êtes amis" : "Demande envoyée", message: r?.status === "friends" ? "Vous voyez maintenant ce que chacun partage." : "La personne doit l’accepter." })));
    }
    if (f.hasAttribute("data-create-guild")) return act(() => rpc("titan_create_guild", { p_name: v("name"), p_motto: "" }), { title: "Guilde fondée", message: "Partage son code pour réunir ton équipe." });
    if (f.hasAttribute("data-join-guild")) return act(() => rpc("titan_join_guild", { p_code: v("code").toUpperCase() }), { title: "Bienvenue dans la guilde" });
    if (f.hasAttribute("data-guild-target")) return act(() => rpc("titan_guild_set_effort_target", { p_minutes: Number(v("minutes")) }), { title: "Objectif réglé" });
    if (f.hasAttribute("data-guild-message")) {
      const content = v("content");
      if (!content) return;
      return act(() => rpc("titan_send_guild_message", { p_content: content }));
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
      render();
      load();
    }
  }
  window.addEventListener("titan:history-updated", () => setTimeout(start, 0));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
