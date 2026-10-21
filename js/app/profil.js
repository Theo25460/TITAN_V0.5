/* TITAN 300 — Profil: who you are as an athlete (rank, mastery, DNA, collection) and what you control
   (identity, rhythm, privacy, data, account). Official values come from the server for accounts. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const F = () => window.TitanFormat;
  const E = () => window.TitanEffort;
  const P = () => window.TitanProgress;
  const SP = () => window.TitanSports;
  const D = () => window.TitanData;
  const C = () => window.TitanCodex;
  const A = () => window.TitanAdventure;
  const B = () => window.TitanSportBrowser;
  const MILESTONES = [1, 10, 25, 50, 100, 200, 365, 500, 1000];
  const HOURS = [10, 25, 50, 100, 250, 500, 1000];
  const PRIVACY = [
    ["publicProfile", "Être trouvable par mon code ami", "Sans cela, personne ne peut t’envoyer de demande d’ami."],
    ["socialPresence", "Mes amis voient quand je suis actif", "Uniquement le jour, jamais l’heure ni le lieu."],
    ["showStats", "Mes amis voient mes statistiques", "Temps, séances, sports. Jamais de santé, de poids, de GPS ni de notes."],
    ["friendRankings", "Apparaître dans les classements entre amis", "Classements par effort normalisé, entre amis uniquement."],
  ];

  let root = null;
  let masteryNavigation = null;
  let avatarTask = null;
  let exportTask = null;
  let cardTask = null;
  let cardConfirmation = null;
  let deleteTask = null;
  let deleteDialog = null;
  let cacheConfirmation = null;
  let card = null; // public card settings (server)
  let cardUnavailable = false; // the server does not offer public cards yet
  let titles = null; // expedition titles earned (server)
  let worn = null; // worn title {key,label} (server); null until read
  let wornTask = null; // a title change in flight
  const guest = () => D().isGuest();
  const BLOCKS = [
    ["name", "Mon nom affiché", "Sinon : « Athlète TITAN »."],
    ["level", "Mon niveau et mon rang", ""],
    ["totals", "Séances, temps et semaines actives", "Des totaux, jamais le détail des séances."],
    ["sports", "Mes sports et leur maîtrise", "Jusqu’à six sports, sans dates ni lieux."],
    ["titles", "Mes titres d’expédition et insignes", ""],
  ];
  const logs = () => window.state?.history || [];

  function heroHtml() {
    const pr = D().progression();
    const u = window.shellUser?.() || window.titanShell?.user?.() || {};
    const next = pr.nextRank;
    const pct = Math.round(Math.min(1, pr.xp / Math.max(1, pr.next)) * 100);
    return `<section class="asc-hero pf-hero">
      <div class="pf-id"><span class="pf-avatar"${u.frame ? ` data-frame="${esc(u.frame)}"` : ""}><img src="/assets/renaissance/${esc(u.avatar || "scout")}-s.webp" alt="" width="128" height="128"></span>
        <div><p class="asc-eyebrow cy">${esc(pr.rank.name)}</p><h2 class="pf-name">${esc(guest() ? "Mode découverte" : window.state?.user?.name || "Athlète")}</h2>${wornName() ? `<p class="pf-title" data-pf-title>${icon("star")} ${esc(wornName())}</p>` : ""}<p class="asc-small asc-muted">${guest() ? "Tes séances restent sur cet appareil" : `Membre depuis ${esc(new Date(window.state?.user?.created_at || P().dna(logs()).first || Date.now()).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }))}`}</p></div></div>
      <div class="pf-level"><div class="asc-between"><span class="pf-level-n">Niveau <strong class="asc-num">${pr.level}</strong></span>${pr.guest || pr.confirmed ? `<span class="asc-small asc-muted asc-num">${F().number(pr.xp)} / ${F().number(pr.next)} XP</span>` : ""}</div>
        ${pr.guest || pr.confirmed ? `<span class="asc-ascent"><span style="--p:${pct}%"></span></span>` : ""}
        <p class="asc-small asc-muted">${next ? `${esc(next.name)} au niveau ${next.level}` : "Rang le plus haut atteint"}${pr.estimated ? " · estimation du mode découverte" : ""}</p></div>
    </section>`;
  }

  function masteryHtml() {
    const list = P().mastery(logs());
    const result = masteryNavigation.select(B().entries(list));
    return `<section class="asc-section" id="maitrise"><div class="asc-section-head"><h2>Maîtrise</h2><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-mastery-help>${icon("help")} Les paliers</button></div>
      ${masteryNavigation.controls()}
      <div class="pf-mastery">${result.items
        .map(
          (m) => `<div class="pf-mastery-row" data-family="${esc(m.family)}"><span class="jr-icon">${icon(SP().FAMILY_ICON[SP().familyOf(m.sport)])}</span>
        ${m.hasData ? `
        <span class="pf-mastery-main"><span class="asc-between"><strong>${esc(m.label)}</strong><span class="asc-small">${esc(m.name)} · ${m.level}/10</span></span>
        <span class="asc-ascent thin"><span style="--p:${Math.round(m.progress * 100)}%"></span></span>
        <span class="asc-small asc-faint">${esc(F().duration(m.minutes))} sur ${m.weeks} semaine${m.weeks > 1 ? "s" : ""}${m.next ? ` · ${esc(m.next.name)} : ${m.next.hours} h sur ${m.next.weeks} semaines` : ""}</span></span>` : `<span class="pf-mastery-main"><strong>${esc(m.label)}</strong><span class="asc-small asc-muted">Aucune pratique enregistrée. <a href="/training?sport=${encodeURIComponent(m.sport)}">Ajouter une séance</a></span></span>`}
        ${B().favoriteButton(m.sport, m.label)}</div>`,
        )
        .join("")}</div>${result.total ? "" : masteryNavigation.empty()}${masteryNavigation.footer()}</section>`;
  }

  function renderMastery() {
    const section = root?.querySelector("#maitrise");
    if (section) B().preserveFocus(() => { section.outerHTML = masteryHtml(); });
  }

  function dnaHtml() {
    const d = P().dna(logs());
    if (!d.enough)
      return `<section class="asc-section" id="adn"><div class="asc-section-head"><h2>ADN sportif</h2></div><p class="asc-small asc-muted">Ton ADN se dessine à partir de 5 séances : familles de sports, moment de la journée, jour favori, disciplines maîtrisées.</p></section>`;
    const slot = { matin: "du matin", midi: "de la pause de midi", "après-midi": "de l’après-midi", soir: "du soir" }[d.timeOfDay];
    return `<section class="asc-section" id="adn"><div class="asc-section-head"><h2>ADN sportif</h2>${window.TitanCard ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-dna-card>${icon("share")} Image</button>` : `<span class="asc-small asc-muted">depuis le ${esc(new Date(d.first).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }))}</span>`}</div>
      <div class="pf-dna">
        <div class="wk-stack" role="img" aria-label="${esc(d.families.map((f) => `${f.label} ${Math.round(f.share * 100)} %`).join(", "))}">${d.families.map((f) => `<span data-family="${esc(f.id)}" style="--w:${(f.share * 100).toFixed(1)}%"></span>`).join("")}</div>
        <ul class="wk-legend">${d.families.map((f) => `<li data-family="${esc(f.id)}"><i></i>${esc(f.label)} ${Math.round(f.share * 100)} %</li>`).join("")}</ul>
        <dl class="pf-dna-facts">
          <div><dt>Séances</dt><dd class="asc-num">${F().number(d.sessions)}</dd></div>
          <div><dt>Temps</dt><dd class="asc-num">${esc(F().hours(d.minutes))}</dd></div>
          <div><dt>Semaines actives</dt><dd class="asc-num">${F().number(d.activeWeeks)}</dd></div>
          ${d.distance ? `<div><dt>Distance</dt><dd class="asc-num">${esc(F().distance(d.distance))}</dd></div>` : ""}
        </dl>
        <p class="pf-dna-line">${slot ? `Plutôt <strong>${esc(slot)}</strong>` : ""}${slot && d.favoriteDay ? ", " : ""}${d.favoriteDay ? `surtout le <strong>${esc(d.favoriteDay)}</strong>` : ""}. ${d.topSports.length ? `Tes piliers : ${d.topSports.map((s) => `<strong>${esc(s.label)}</strong>`).join(", ")}.` : ""}</p>
      </div></section>`;
  }

  /* Wear (or take off) one earned title. Same account/client/epoch guards as the public card write; the server checks ownership. */
  async function wearTitle(key) {
    if (wornTask || cardTask || !worn || !cardContextValid(bitsContext)) return false;
    const context = bitsContext;
    const job = { context, focus: key ? `[data-wear-title="${key}"]` : "[data-wear-title='']" };
    wornTask = job;
    render();
    try {
      const session = await readBitsSession(job);
      if (wornTask !== job || !bitsCurrent(job)) return false;
      const { data, error } = await context.client.rpc("titan_set_displayed_title", { p_key: key || null })
        .setHeader("Authorization", `Bearer ${session.access_token}`);
      if (wornTask !== job || !bitsCurrent(job)) return false;
      if (error) throw error;
      await readBitsSession(job);
      if (wornTask !== job || !bitsCurrent(job)) return false;
      worn = { key: data?.key || null, label: data?.label || null };
      return true;
    } catch (error) {
      if (wornTask === job && bitsCurrent(job)) throw error;
      return false;
    } finally {
      if (wornTask === job) {
        const current = bitsCurrent(job);
        wornTask = null;
        if (current) {
          const restoreFocus = job.focus && document.activeElement === document.body;
          render();
          if (restoreFocus && document.activeElement === document.body) root.querySelector(job.focus)?.focus({ preventScroll: true });
        }
      }
    }
  }
  const wornName = () => (worn?.key ? window.TitanTitles?.label(worn.key, { catalog: C(), serverLabel: worn.label }) : null);

  function titleBlockHtml() {
    if (guest() || !worn || !window.TitanTitles) return "";
    const options = window.TitanTitles.earned({ rewards: A()?.snapshot?.rewards || [], expeditionTitles: titles || [], catalog: C() });
    const name = wornName();
    return `<div class="pf-col-block" data-title-block><p class="asc-eyebrow">Titre porté</p>
      <p class="asc-small ${name ? "" : "asc-muted"}" data-worn-title>${name ? `Tu portes « ${esc(name)} », visible sur ton profil${card?.enabled ? " et ta carte publique (si les titres sont affichés)" : ""}.` : options.length ? "Aucun titre porté. Choisis-en un parmi ceux que tu as gagnés." : "Gagne un insigne d’aventure pour porter ton premier titre."}</p>
      ${options.length ? `<ul class="pf-chips" role="group" aria-label="Titres gagnés">${options.map((t) => `<li><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-wear-title="${esc(t.key)}" aria-pressed="${worn.key === t.key}" ${wornTask ? "disabled" : ""}>${icon(t.source === "expedition" ? "mountain" : "star")} ${esc(t.label)}${worn.key === t.key ? " · porté" : ""}</button></li>`).join("")}</ul>
      ${worn.key ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-wear-title="" ${wornTask ? "disabled" : ""}>Ne plus porter de titre</button>` : ""}` : ""}
      <p class="asc-small asc-faint">Un titre est purement décoratif : il ne donne ni XP ni crédits.</p></div>`;
  }

  function collectionHtml() {
    const s = A()?.snapshot;
    const rewards = (s?.rewards || []).slice().sort((a, b) => new Date(b.earned_at) - new Date(a.earned_at));
    const list = P().activeLogs(logs());
    const hours = list.reduce((n, l) => n + (P().minutesOf(l).minutes || 0), 0) / 60;
    const settings = D().cadenceSettings();
    const held = P().cadence(logs(), { target: settings.target, pauses: settings.pauses }).lifetimeHeld;
    const records = (window.TitanInsights?.records?.(logs(), "all", Date.now()) || []).filter((r) => r.kind !== "duration").length;
    const ms = MILESTONES.filter((m) => list.length >= m);
    const hs = HOURS.filter((h) => hours >= h);
    const nextM = MILESTONES.find((m) => list.length < m);
    const nextH = HOURS.find((h) => hours < h);
    const badge = (r) => {
      const w = C()?.worlds.find((x) => x.id === r.world);
      const ch = w?.chapters?.[r.chapter - 1];
      return w && ch ? `<li class="pf-item" style="--world:${w.color}"><span class="av-badge is-earned">${icon(["compass", "route", "journal", "leaf", "layers", "target", "bolt", "shield", "crown"][(r.chapter - 1) % 9])}<small>${String(r.chapter).padStart(2, "0")}</small></span><span><strong>${esc(ch.title)}</strong><small>${esc(w.name)}</small></span></li>` : "";
    };
    return `<section class="asc-section" id="collection"><div class="asc-section-head"><h2>Collection</h2><span class="asc-small asc-muted">${rewards.length + ms.length + hs.length} pièces · <a href="/boutique">Atelier</a></span></div>
      <div class="pf-collection">
        <div class="pf-col-block"><p class="asc-eyebrow">Insignes d’aventure</p>${rewards.length ? `<ul class="pf-items">${rewards.map(badge).join("")}</ul>` : `<p class="asc-small asc-muted">Allume ta première balise dans <a href="/adventure">l’Aventure</a>.</p>`}</div>
        ${titles?.length ? `<div class="pf-col-block"><p class="asc-eyebrow">Titres d’expédition</p><ul class="pf-chips">${titles.map((t) => `<li>${icon("mountain")} ${esc(t.title)} <small class="asc-faint">· ${esc(t.expedition)}</small></li>`).join("")}</ul></div>` : ""}
        ${titleBlockHtml()}
        <div class="pf-col-block"><p class="asc-eyebrow">Jalons</p><ul class="pf-chips">${ms.map((m) => `<li>${icon("flag")} ${m} séance${m > 1 ? "s" : ""}</li>`).join("")}${hs.map((h) => `<li>${icon("clock")} ${h} h</li>`).join("")}${held ? `<li>${icon("check")} ${held} semaine${held > 1 ? "s" : ""} tenue${held > 1 ? "s" : ""}</li>` : ""}${records ? `<li>${icon("star")} ${records} record${records > 1 ? "s" : ""}</li>` : ""}</ul>
          <p class="asc-small asc-faint">${nextM ? `Prochain jalon : ${nextM} séances (${nextM - list.length} à venir)` : ""}${nextM && nextH ? " · " : ""}${nextH ? `${nextH} h de pratique` : ""}</p></div>
      </div>
      <p class="asc-small asc-faint">La collection est cosmétique : elle raconte ton parcours sans donner d’XP ni de crédits.</p></section>`;
  }

  function avatarHtml() {
    const s = A()?.snapshot;
    const level = D().progression().level;
    const current = s?.avatar || "scout";
    const avatars = C()?.avatars || [];
    const tabAvatar = avatars.find(a => a.id === current && a.level <= level) || avatars.find(a => a.level <= level);
    return `<section class="asc-section" id="personnage"><div class="asc-section-head"><h2>Personnage</h2></div>
      <div class="pf-avatars" role="radiogroup" aria-label="Personnage">${avatars
        .map((a) => {
          const locked = a.level > level;
          return `<button type="button" class="pf-avatar-pick" role="radio" data-avatar="${a.id}" aria-checked="${a.id === current}" tabindex="${a.id === tabAvatar?.id ? 0 : -1}" ${locked ? 'aria-disabled="true"' : ""}><img src="/assets/renaissance/${a.id}-s.webp" alt="" width="96" height="96" loading="lazy"><strong>${esc(a.name)}</strong><small>${locked ? `Niveau ${a.level}` : esc(a.role)}</small></button>`;
        })
        .join("")}</div></section>`;
  }

  function settingsHtml() {
    const u = window.state?.user || {};
    const privacy = u.privacy || {};
    const settings = D().cadenceSettings();
    const analytics = window.TitanAnalytics?.consent() === "granted";
    return `<section class="asc-section" id="reglages"><div class="asc-section-head"><h2>Réglages</h2></div>
      <div class="pf-settings">
        ${guest() ? "" : `<label class="asc-field"><span>Nom affiché</span><span class="pf-inline"><input class="asc-input" id="pf-name" maxlength="24" value="${esc(u.name || "")}" autocomplete="nickname"><button type="button" class="asc-btn asc-btn-secondary" data-save-name>Enregistrer</button></span></label>`}
        <div class="asc-field"><span>Cadence : jours actifs visés par semaine</span><div class="ob-target pf-target" role="radiogroup" aria-label="Cadence">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<button type="button" role="radio" data-cadence="${n}" aria-checked="${settings.target === n}" tabindex="${settings.target === n ? 0 : -1}">${n}</button>`).join("")}</div><small>Une semaine en pause se règle depuis le QG ; elle ne compte ni pour ni contre toi.</small></div>
        <fieldset class="pf-privacy"><legend class="seance-label">Confidentialité</legend>${guest() ? `<p class="asc-small asc-muted">En mode découverte, rien ne quitte cet appareil.</p>` : PRIVACY.map(([k, label, help]) => `<label class="pf-toggle"><input type="checkbox" role="switch" data-privacy="${k}" ${privacy[k] === true ? "checked" : ""}><span><strong>${esc(label)}</strong><small>${esc(help)}</small></span></label>`).join("")}
          <label class="pf-toggle"><input type="checkbox" role="switch" data-analytics ${analytics ? "checked" : ""}><span><strong>Statistiques d’usage</strong><small>Aide à améliorer TITAN. Jamais de santé, de poids, de GPS ni de notes.</small></span></label></fieldset>
      </div></section>`;
  }

  function publicHtml() {
    if (guest()) return "";
    if (!card) return `<section class="asc-section" id="public"><div class="asc-section-head"><h2>Profil public</h2></div><p class="asc-small asc-muted">${cardUnavailable ? "La carte d’athlète publique arrive avec la prochaine mise à jour du serveur." : !navigator.onLine ? "Disponible avec le réseau." : cardFailed || !window.titanClient ? "Profil public indisponible pour le moment. Réessaie plus tard." : "Chargement…"}</p></section>`;
    const url = card.slug ? `https://titan-app.fr/u/${card.slug}` : "";
    let qr = "";
    if (card.enabled && url && !window.qrcode) window.TitanCard?.loadQr().then((q) => q && render());
    if (card.enabled && url && window.qrcode) {
      const q = window.qrcode(0, "M");
      q.addData(url);
      q.make();
      qr = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    }
    return `<section class="asc-section" id="public"><div class="asc-section-head"><h2>Profil public</h2></div>
      <div class="pf-public" aria-busy="${Boolean(cardTask)}">
        <label class="pf-toggle"><input type="checkbox" role="switch" id="pf-card-enabled" data-card-enabled ${cardTask ? "disabled" : ""} ${card.enabled ? "checked" : ""}><span><strong>Une carte d’athlète accessible par lien</strong><small>Désactivée par défaut. Le lien est impossible à deviner ; pas de référencement dans les moteurs de recherche.</small></span></label>
        ${card.enabled ? `<div class="pf-public-share"><div class="pf-qr" role="img" aria-label="QR code de ton profil public">${qr}</div>
          <div class="asc-stack-sm"><input class="asc-input asc-num" readonly value="${esc(url)}" aria-label="Lien de ton profil public">
            <div class="asc-row-flex"><a class="asc-btn asc-btn-secondary asc-btn-sm" href="/u/${esc(card.slug)}" target="_blank" rel="noopener">${icon("eye")} Voir</a><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-card-copy>${icon("copy")} Copier</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" id="pf-card-relink" data-card-relink ${cardTask ? "disabled" : ""}>${icon("restore")} Nouveau lien</button></div></div></div>
        <fieldset class="pf-privacy"><legend class="seance-label">Ce que la carte montre</legend>${BLOCKS.map(([k, label, help]) => `<label class="pf-toggle"><input type="checkbox" role="switch" id="pf-card-show-${k}" data-card-show="${k}" ${cardTask ? "disabled" : ""} ${card.show?.[k] !== false ? "checked" : ""}><span><strong>${esc(label)}</strong>${help ? `<small>${esc(help)}</small>` : ""}</span></label>`).join("")}</fieldset>
        <p class="asc-small asc-faint">Jamais affichés : santé, poids, GPS, notes, dates et heures des séances, amis, guilde, e-mail.</p>` : ""}
      </div>${cardTask ? `<p class="asc-small asc-muted" role="status" data-card-progress>Enregistrement du profil public…</p>` : ""}</section>`;
  }

  const cardContextValid = context => bitsCurrent({ context });
  const cardMutationCurrent = job => cardTask === job && bitsCurrent(job);

  async function saveCard(enabled, show, relink = false, expected = bitsContext, focus = null) {
    if (cardTask || !card || !cardContextValid(expected)) return false;
    const job = { context: expected, focus };
    cardTask = job;
    render();
    try {
      const session = await readBitsSession(job);
      if (!cardMutationCurrent(job)) return false;
      const { data, error } = await expected.client.rpc("titan_public_card_save", { p_enabled: enabled, p_show: { ...(show || {}) }, p_new_link: relink })
        .setHeader("Authorization", `Bearer ${session.access_token}`);
      if (!cardMutationCurrent(job)) return false;
      if (error) throw error;
      await readBitsSession(job);
      if (!cardMutationCurrent(job)) return false;
      if (!data) throw new Error("PUBLIC_CARD_EMPTY_RESPONSE");
      card = data;
      window.TitanCard?.resetLink?.();
      return true;
    } catch (error) {
      if (cardMutationCurrent(job)) throw error;
      return false;
    } finally {
      // A response from A cannot release B's newer mutation or restore its old controls.
      if (cardTask === job) {
        const current = cardMutationCurrent(job);
        cardTask = null;
        if (current) {
          const restoreFocus = focus && document.activeElement === document.body;
          render();
          if (restoreFocus && document.activeElement === document.body) root.querySelector(focus)?.focus({ preventScroll: true });
        }
      }
    }
  }

  let bitsContext = null;
  let bitsTask = null;
  let cardFailed = false;
  const serverBitsContext = () => ({ owner: window.state?.user?.id, client: window.titanClient, epoch: window.titanAccountTransition?.epoch });
  const sameBitsContext = (a, b) => a && b && a.owner === b.owner && a.client === b.client && a.epoch === b.epoch;
  const bitsCurrent = job => job && job.context === bitsContext && sameBitsContext(job.context, serverBitsContext())
    && !window.titanAccountTransition?.active && !guest();

  function resetServerBits() {
    bitsContext = null;
    bitsTask = null;
    cardTask = null;
    cardConfirmation = null;
    deleteTask = null;
    deleteDialog = null;
    cacheConfirmation = null;
    card = null;
    titles = null;
    worn = null;
    wornTask = null;
    cardUnavailable = false;
    cardFailed = false;
  }

  function syncServerBits() {
    const next = serverBitsContext();
    if (!sameBitsContext(bitsContext, next)) {
      resetServerBits();
      bitsContext = next;
    }
  }

  async function readBitsSession(job) {
    const { data, error } = await job.context.client.auth.getSession();
    if (!bitsCurrent(job)) throw new Error("PROFILE_READ_CONTEXT_CHANGED");
    const session = data?.session;
    if (error || !session?.access_token || session.user?.id !== job.context.owner) throw new Error("PROFILE_READ_SESSION_CHANGED");
    return session;
  }

  async function loadServerBits() {
    if (bitsTask || card || cardUnavailable || guest() || !window.titanClient || !navigator.onLine || window.titanAccountTransition?.active) return;
    const job = { context: bitsContext };
    bitsTask = job;
    const within = p => {
      let timer;
      return Promise.race([p, new Promise((_, no) => { timer = setTimeout(() => no(new Error("timeout")), 8000); })]).finally(() => clearTimeout(timer));
    };
    try {
      const session = await readBitsSession(job);
      const rpc = name => within(job.context.client.rpc(name).setHeader("Authorization", `Bearer ${session.access_token}`));
      const [c, t] = await Promise.allSettled([rpc("titan_public_card_settings"), rpc("titan_expedition_titles")]);
      if (!bitsCurrent(job)) return;
      // The SDK can change session without a public transition while these reads are pending.
      await readBitsSession(job);
      const err = c.status === "fulfilled" ? c.value.error : c.reason;
      if (!err && c.value.data) card = c.value.data;
      else if (err?.code === "PGRST202" || /Could not find/.test(err?.message || "")) cardUnavailable = true;
      cardFailed = !card && !cardUnavailable;
      if (t.status === "fulfilled" && !t.value.error && Array.isArray(t.value.data)) titles = t.value.data;
      // The worn title is a separate, best-effort read on the same session: an older server simply shows no picker.
      try {
        const w = await within(job.context.client.rpc("titan_displayed_title").setHeader("Authorization", `Bearer ${session.access_token}`));
        if (bitsCurrent(job) && !w.error && w.data && typeof w.data === "object") worn = { key: w.data.key || null, label: w.data.label || null };
      } catch {}
    } catch {
      if (bitsCurrent(job)) cardFailed = true;
    } finally {
      // An old account's finally cannot release the next account's reads or repaint its state.
      if (bitsTask === job) {
        bitsTask = null;
        if (bitsCurrent(job)) render();
      }
    }
  }

  function dnaCard() {
    const d = P().dna(logs());
    window.TitanCard.open({
      kind: "dna",
      eyebrow: `ADN sportif · ${D().progression().rank.name}`,
      title: "Mon ADN sportif",
      families: d.families.map((f) => ({ id: f.id, label: f.label, share: f.share })),
      stats: [["Séances", F().number(d.sessions)], ["Temps", F().hours(d.minutes)], ["Semaines", F().number(d.activeWeeks)]],
      detail: d.topSports.length ? `Mes piliers : ${d.topSports.map((x) => x.label).join(", ")}.` : "",
      name: window.TitanCard.userName(),
      filename: "titan-adn",
    }).catch(() => window.titanShell.toast({ type: "warn", message: "L’image n’a pas pu être créée." }));
  }

  function accountHtml() {
    const s = A()?.snapshot;
    const plus = Boolean(s?.plus || window.state?.user?.is_elite);
    const pending = (window.TitanQueue?.list?.() || []).length;
    return `<section class="asc-section" id="compte"><div class="asc-section-head"><h2>${guest() ? "Garder tes séances" : "Compte et données"}</h2></div>
      ${guest() ? `<div class="asc-note">${icon("cloudUp")}<span>Crée un compte pour sauvegarder ta progression et la retrouver partout. Tes séances de découverte pourront le rejoindre en un geste.</span></div><div class="asc-row-flex pf-actions"><a class="asc-btn asc-btn-primary" href="/login?mode=signup">Créer un compte</a><a class="asc-btn asc-btn-secondary" href="/login">J’ai déjà un compte</a></div>` : `<div class="asc-list">
        <a class="asc-row" href="/boutique"><span class="asc-row-icon">${icon("sparkle")}</span><span class="asc-row-main"><span class="asc-row-title">${plus ? "TITAN+ actif" : "TITAN+"}</span><span class="asc-row-sub">${plus ? "Merci de soutenir TITAN. Aucun avantage de progression, seulement du confort et des cosmétiques." : "Confort, campagnes et cosmétiques. Jamais de progression achetée."}</span></span>${icon("chevron")}</a>
        <a class="asc-row" href="/recours"><span class="asc-row-icon">${icon("info")}</span><span class="asc-row-main"><span class="asc-row-title">Séances contrôlées et recours</span><span class="asc-row-sub">Voir une séance mise de côté et contester la décision.</span></span>${icon("chevron")}</a>
      </div>`}
      <div class="asc-list pf-data">
        <button type="button" class="asc-row" id="pf-export-json" data-export-json${exportTask ? " disabled" : ""}><span class="asc-row-icon">${icon("download")}</span><span class="asc-row-main"><span class="asc-row-title">Exporter toutes mes données</span><span class="asc-row-sub">Fichier JSON : profil, séances, objectifs${guest() ? " (données de cet appareil)" : ""}</span></span></button>
        <button type="button" class="asc-row" data-export-csv><span class="asc-row-icon">${icon("journal")}</span><span class="asc-row-main"><span class="asc-row-title">Exporter mon journal</span><span class="asc-row-sub">Tableur CSV, lisible partout</span></span></button>
        <button type="button" class="asc-row" data-clear-cache><span class="asc-row-icon">${icon("restore")}</span><span class="asc-row-main"><span class="asc-row-title">Vider le cache de cet appareil</span><span class="asc-row-sub">Les séances en attente sont conservées</span></span></button>
        ${guest() ? "" : `<button type="button" class="asc-row" data-signout><span class="asc-row-icon">${icon("logout")}</span><span class="asc-row-main"><span class="asc-row-title">Se déconnecter</span><span class="asc-row-sub">${pending ? `${pending} séance(s) attendent l’envoi : elles restent sur cet appareil` : "Tes données restent dans ton compte"}</span></span></button>
        <button type="button" class="asc-row pf-danger" data-delete><span class="asc-row-icon">${icon("trash")}</span><span class="asc-row-main"><span class="asc-row-title">Supprimer mon compte</span><span class="asc-row-sub">Définitif : séances, objectifs, progression</span></span></button>`}
      </div>${exportTask ? `<p class="asc-small asc-muted" role="status" data-export-progress>Préparation de l’export…</p>` : ""}</section>`;
  }

  function render() {
    if (!root) return;
    // Capture focus at render time so a late avatar response cannot reclaim it.
    const focused = root.contains(document.activeElement) ? document.activeElement.closest('[role="radio"]') : null;
    const attribute = focused?.hasAttribute("data-cadence") ? "data-cadence" : focused?.hasAttribute("data-avatar") ? "data-avatar" : null;
    const value = attribute ? focused.getAttribute(attribute) : null;
    B().preserveFocus(() => { root.innerHTML = `${heroHtml()}
      <nav class="pf-jump" aria-label="Sections du profil">${[["maitrise", "Maîtrise"], ["adn", "ADN"], ["collection", "Collection"], ["personnage", "Personnage"], ["reglages", "Réglages"], ...(guest() ? [] : [["public", "Public"]]), ["compte", "Compte"]].map(([id, l]) => `<a href="#${id}">${l}</a>`).join("")}</nav>
      ${masteryHtml()}${dnaHtml()}${collectionHtml()}${avatarHtml()}${settingsHtml()}${publicHtml()}${accountHtml()}`; });
    if (attribute && document.activeElement === document.body) {
      const next = [...root.querySelectorAll(`[role="radio"][${attribute}]`)].find(radio => radio.getAttribute(attribute) === value && radio.getAttribute("aria-disabled") !== "true");
      if (next) {
        next.closest('[role="radiogroup"]').querySelectorAll('[role="radio"]').forEach(radio => { radio.tabIndex = radio === next ? 0 : -1; });
        next.focus({ preventScroll: true });
      }
    }
    root.setAttribute("aria-busy", "false");
    if (location.hash && !root.dataset.scrolled) {
      root.dataset.scrolled = "1";
      document.getElementById(location.hash.slice(1))?.scrollIntoView();
    }
  }

  const exportContextCurrent = job => job && job === exportTask && job.owner === window.state?.user?.id
    && job.client === window.titanClient && job.epoch === window.titanAccountTransition?.epoch
    && !window.titanAccountTransition?.active;

  function resetExportUi() {
    const button = root?.querySelector("[data-export-json]");
    if (button) button.disabled = false;
    root?.querySelector("[data-export-progress]")?.remove();
  }

  async function exportJson() {
    if (window.titanAccountTransition?.active || exportContextCurrent(exportTask)) return;
    if (exportTask) resetExportUi();
    const job = { owner: window.state?.user?.id, client: window.titanClient, epoch: window.titanAccountTransition?.epoch, startedOnline: navigator.onLine };
    exportTask = job;
    const button = root.querySelector("[data-export-json]");
    button.disabled = true;
    const progress = document.createElement("p");
    progress.className = "asc-small asc-muted";
    progress.setAttribute("role", "status");
    progress.setAttribute("data-export-progress", "");
    progress.textContent = "Préparation de l’export…";
    button.closest(".pf-data").after(progress);
    try {
      // Freeze the device part before the first await: subsequent edits belong to a later export.
      let payload = JSON.parse(JSON.stringify({ exportedAt: new Date().toISOString(), source: "device", pendingSessions: window.TitanQueue?.list?.() || [], localState: window.state }));
      const discovery = !job.owner || String(job.owner).startsWith("guest_");
      let localOnly = !discovery;
      if (!discovery && job.client && job.startedOnline) {
        const { data: auth, error: authError } = await job.client.auth.getSession();
        if (!exportContextCurrent(job)) return;
        const session = auth?.session;
        if (authError || !session?.access_token || session.user?.id !== job.owner) throw new Error("PROFILE_EXPORT_SESSION_CHANGED");
        try {
          // The SDK's later session lookup must not change this request's owner.
          const { data, error } = await job.client.rpc("export_own_data").setHeader("Authorization", `Bearer ${session.access_token}`);
          if (!exportContextCurrent(job)) return;
          if (error) throw error;
          if (!data || data.userId !== job.owner) throw new Error("PROFILE_EXPORT_OWNER_CHANGED");
          payload = { ...payload, source: "account", cloud: data };
          localOnly = false;
        } catch (error) {
          if (error?.message === "PROFILE_EXPORT_OWNER_CHANGED") throw error;
          // Network/server failure may still yield the frozen device data, after the session check below.
        }
      }
      if (!exportContextCurrent(job)) return;
      if (!discovery && job.client && job.startedOnline) {
        const { data: auth, error } = await job.client.auth.getSession();
        if (!exportContextCurrent(job)) return;
        if (error || !auth?.session?.access_token || auth.session.user?.id !== job.owner) throw new Error("PROFILE_EXPORT_SESSION_CHANGED");
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `titan-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      window.titanShell.toast(localOnly
        ? { type: "warn", title: "Export local prêt", message: "Le fichier contient seulement les données de cet appareil." }
        : { type: "ok", title: "Export prêt", message: payload.source === "account" ? "Données du compte et de cet appareil." : "Données de cet appareil." });
    } catch {
      if (exportContextCurrent(job)) window.titanShell.toast({ type: "warn", title: "Export interrompu", message: "Vérifie ta connexion et ton compte, puis réessaie." });
    } finally {
      // An obsolete response cannot unlock an export started by the next account.
      if (exportTask === job) {
        const current = exportContextCurrent(job);
        exportTask = null;
        resetExportUi();
        if (current && document.activeElement === document.body) root.querySelector("[data-export-json]")?.focus({ preventScroll: true });
      }
    }
  }

  const deletionCurrent = job => deleteTask === job && bitsCurrent(job);

  function deleteAccount() {
    if (!bitsCurrent({ context: bitsContext }) || (deleteDialog && bitsCurrent(deleteDialog))) return;
    const dialog = { context: bitsContext };
    deleteDialog = dialog;
    let pending = false, serverDeleted = false;
    const body = document.createElement("form");
    body.className = "asc-stack";
    const plusActive = Boolean(A()?.snapshot?.plus || window.state?.user?.is_elite);
    body.innerHTML = `<p>Ton compte, tes séances, tes objectifs et ta progression seront supprimés définitivement. Exporte d’abord tes données si tu veux les garder.</p>
      ${plusActive ? `<p class="asc-note" data-delete-plus>${icon("info")}<span>Si tu as un abonnement TITAN+ payant, il n’est pas résilié automatiquement par la suppression du compte. Résilie-le d’abord (lien du reçu Paddle, ou Google Play si tu t’es abonné dans l’application) pour ne plus être facturé.</span></p>` : ""}
      <label class="asc-field"><span>Écris SUPPRIMER pour confirmer</span><input class="asc-input" name="confirm" autocomplete="off" autocapitalize="characters"></label>
      <p class="asc-small jr-edit-error" role="alert"></p>
      <p class="asc-small asc-muted" role="status" data-delete-progress></p>
      <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-cancel>Annuler</button><button type="submit" class="asc-btn asc-btn-danger">Supprimer</button></div>`;
    const d = window.titanShell.sheet({ title: "Supprimer mon compte ?", body, onClose: () => { if (deleteDialog === dialog) deleteDialog = null; } });
    const input = body.querySelector("[name=confirm]"), btn = body.querySelector("[type=submit]");
    const cancel = body.querySelector("[data-cancel]"), close = d.querySelector("[data-close]");
    const err = body.querySelector(".jr-edit-error"), progress = body.querySelector("[data-delete-progress]");
    const changed = "Le compte a changé. Ferme cette fenêtre, puis réessaie depuis le compte voulu.";
    const setPending = value => {
      pending = value;
      const current = bitsCurrent(dialog);
      input.disabled = value || serverDeleted || !current;
      btn.disabled = value || !current;
      btn.textContent = serverDeleted ? value ? "Nettoyage en cours…" : "Réessayer le nettoyage" : "Supprimer";
      cancel.disabled = close.disabled = value;
      progress.textContent = value ? serverDeleted ? "Nettoyage de cet appareil…" : "Suppression en cours…" : "";
    };
    cancel.addEventListener("click", () => d.close());
    d.addEventListener("cancel", e => { if (pending) e.preventDefault(); });
    d.addEventListener("click", e => {
      if (pending && (e.target === d || e.target.closest?.("[data-close], [data-cancel]"))) {
        e.preventDefault(); e.stopImmediatePropagation();
      }
    }, true);
    body.addEventListener("submit", async e => {
      e.preventDefault();
      if (pending || deleteTask || !d.open) return;
      if (!bitsCurrent(dialog)) { err.textContent = changed; setPending(false); return; }
      if (!serverDeleted && input.value.trim().toUpperCase() !== "SUPPRIMER") {
        err.textContent = "Écris SUPPRIMER pour confirmer.";
        input.focus();
        return;
      }
      const job = { context: dialog.context };
      deleteTask = job;
      err.textContent = "";
      setPending(true);
      try {
        const session = await readBitsSession(job);
        if (!deletionCurrent(job)) return;
        if (!serverDeleted) {
          const { data, error } = await job.context.client.rpc("delete_own_account")
            .setHeader("Authorization", `Bearer ${session.access_token}`);
          if (!deletionCurrent(job)) return;
          if (error) throw error;
          if (data?.userId !== job.context.owner) throw new Error("DELETE_OWNER_UNCONFIRMED");
          serverDeleted = true;
          setPending(true);
        }
        await readBitsSession(job);
        if (!deletionCurrent(job)) return;
        // Only this captured owner may be purged, even if IndexedDB completes after a switch.
        await window.TitanQueue?.deleteOwner(job.context.owner);
        if (!deletionCurrent(job)) return;
        await readBitsSession(job);
        if (!deletionCurrent(job)) return;
        // The RPC removes auth.users. A dynamic SDK signOut here could instead remove B's session.
        // Clear the persisted Auth cache synchronously under the still-validated context, then leave.
        if (typeof window.titanSafeClearCache !== "function") throw new Error("DELETE_CACHE_UNAVAILABLE");
        window.titanSafeClearCache();
        location.href = "/";
      } catch {
        if (deletionCurrent(job)) err.textContent = serverDeleted
          ? "Compte supprimé. Le nettoyage de cet appareil n’a pas été confirmé. Vérifie le compte actif, puis réessaie."
          : "La suppression n’a pas pu être confirmée. Vérifie ta connexion et réessaie ; rien n’a été supprimé localement.";
      } finally {
        if (deleteTask === job) deleteTask = null;
        if (d.open) {
          if (!bitsCurrent(dialog)) err.textContent = changed;
          setPending(false);
        }
      }
    });
  }

  const avatarContextCurrent = task => task && task.owner === window.state?.user?.id && task.client === window.titanClient
    && task.epoch === window.titanAccountTransition?.epoch && !window.titanAccountTransition?.active;

  const cacheContextCurrent = confirmation => confirmation && cacheConfirmation === confirmation
    && confirmation.context === bitsContext && sameBitsContext(confirmation.context, serverBitsContext())
    && confirmation.guest === guest() && !window.titanAccountTransition?.active;

  function clearCache() {
    if (!bitsContext || window.titanAccountTransition?.active || cacheContextCurrent(cacheConfirmation)) return;
    const confirmation = { context: bitsContext, guest: guest() };
    cacheConfirmation = confirmation;
    return window.titanShell.confirm({
      title: "Vider le cache ?",
      message: "Les préférences locales sont effacées et la page se recharge. Les séances en attente et ton compte ne sont pas touchés.",
      confirmLabel: "Vider",
      action: () => {
        if (!cacheContextCurrent(confirmation)) throw new Error("Le compte a changé. Ferme cette fenêtre, puis réessaie.");
        try {
          if (typeof window.titanSafeClearCache !== "function") throw new Error("CACHE_UNAVAILABLE");
          window.titanSafeClearCache();
        } catch {
          throw new Error("Le nettoyage du cache n’a pas pu être terminé. Réessaie ou recharge la page.");
        }
        location.reload();
      },
    }).finally(() => { if (cacheConfirmation === confirmation) cacheConfirmation = null; });
  }

  async function selectAvatar(avatar) {
    if (avatarTask && !avatarContextCurrent(avatarTask)) avatarTask = null;
    if (window.titanAccountTransition?.active) return;
    if (avatarTask) {
      avatarTask.next = avatar;
      return;
    }
    const task = { owner: window.state?.user?.id, client: window.titanClient, epoch: window.titanAccountTransition?.epoch, next: avatar };
    avatarTask = task;
    try {
      // Keep the latest choice while one mutation is pending; the next action
      // then uses the confirmed revision through the existing adventure engine.
      while (task.next && avatarTask === task && avatarContextCurrent(task)) {
        const next = task.next;
        task.next = null;
        try {
          await A().action("avatar", { avatar: next });
          if (avatarTask !== task || !avatarContextCurrent(task)) return;
          window.titanShell.refresh();
          render();
        } catch (err) {
          if (avatarTask !== task || !avatarContextCurrent(task)) return;
          window.titanShell.toast({ type: "warn", message: A().message(err) });
        }
      }
    } finally {
      if (avatarTask === task) avatarTask = null;
    }
  }

  function onRadioKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) return;
    const radio = e.target.closest('[role="radio"][data-cadence], [role="radio"][data-avatar]');
    if (!radio || !root.contains(radio)) return;
    e.preventDefault();
    if (radio.disabled || radio.getAttribute("aria-disabled") === "true") return;
    if (e.key === " ") {
      if (radio.getAttribute("aria-checked") !== "true" || (radio.dataset.avatar && avatarContextCurrent(avatarTask))) radio.click();
      return;
    }
    const group = radio.closest('[role="radiogroup"]');
    const radios = [...group.querySelectorAll('[role="radio"]')].filter(button => !button.disabled && button.getAttribute("aria-disabled") !== "true");
    const direction = ["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : -1;
    const next = radios[(radios.indexOf(radio) + direction + radios.length) % radios.length];
    group.querySelectorAll('[role="radio"]').forEach(button => { button.tabIndex = button === next ? 0 : -1; });
    next.focus();
    if (next.getAttribute("aria-checked") !== "true" || (next.dataset.avatar && avatarContextCurrent(avatarTask))) next.click();
  }

  function onRadioExit(e) {
    const group = e.target.closest('[role="radiogroup"]');
    if (!group || !root.contains(group) || group.contains(e.relatedTarget)) return;
    const radios = [...group.querySelectorAll('[role="radio"]')];
    const enabled = radios.filter(radio => !radio.disabled && radio.getAttribute("aria-disabled") !== "true");
    const entry = enabled.find(radio => radio.getAttribute("aria-checked") === "true") || enabled[0];
    radios.forEach(radio => { radio.tabIndex = radio === entry ? 0 : -1; });
  }

  function onClick(e) {
    if (masteryNavigation.handle(e)) return renderMastery();
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.cadence) {
      D().setCadenceTarget(Number(b.dataset.cadence));
      return window.titanShell.toast({ type: "ok", title: "Cadence mise à jour", message: `${b.dataset.cadence} jour(s) actif(s) par semaine.` });
    }
    if (b.dataset.avatar) {
      if (b.getAttribute("aria-disabled") === "true") return window.titanShell.toast({ type: "info", title: "Personnage verrouillé", message: "Il se débloque avec les niveaux, jamais avec un achat." });
      return selectAvatar(b.dataset.avatar);
    }
    if (b.hasAttribute("data-save-name")) {
      const v = window.titanCleanProfileName?.(document.getElementById("pf-name").value) || "";
      if (v.length < 2) return window.titanShell.toast({ type: "warn", message: "Un nom de 2 caractères minimum." });
      window.state.user.name = v;
      window.saveState?.({ forceCloud: true });
      window.titanShell.refresh();
      return window.titanShell.toast({ type: "ok", title: "Nom enregistré", message: v });
    }
    if (b.hasAttribute("data-mastery-help")) {
      const body = `<p class="asc-small asc-muted">La maîtrise demande du temps <strong>et</strong> de la régularité : les deux seuils doivent être atteints. Toutes les séances comptent, même historiques : elle décrit ton expérience, elle ne rapporte rien.</p><table class="pf-table"><thead><tr><th>Palier</th><th>Heures</th><th>Semaines</th></tr></thead><tbody>${P()
        .MASTERY.map((m) => `<tr><td>${m.level}. ${esc(m.name)}</td><td class="asc-num">${m.hours}</td><td class="asc-num">${m.weeks}</td></tr>`)
        .join("")}</tbody></table>`;
      return window.titanShell.sheet({ title: "Les paliers de maîtrise", eyebrow: "Maîtrise", body });
    }
    if (b.hasAttribute("data-dna-card")) return dnaCard();
    if (b.hasAttribute("data-card-copy"))
      return (navigator.clipboard?.writeText(`https://titan-app.fr/u/${card.slug}`) || Promise.reject()).then(
        () => window.titanShell.toast({ type: "ok", title: "Lien copié" }),
        () => window.titanShell.toast({ type: "warn", message: "Copie impossible : sélectionne le lien pour le copier." }),
      );
    if (b.hasAttribute("data-card-relink")) {
      if (cardTask || !card || !cardContextValid(bitsContext) || (cardConfirmation && bitsCurrent(cardConfirmation))) return;
      const confirmation = { context: bitsContext };
      cardConfirmation = confirmation;
      return window.titanShell.confirm({
        title: "Créer un nouveau lien ?",
        message: "L’ancien lien et les QR codes déjà partagés cesseront de fonctionner.",
        confirmLabel: "Nouveau lien",
        action: async () => {
          if (cardTask) throw new Error("Une modification est déjà en cours. Réessaie après sa confirmation.");
          try {
            const applied = await saveCard(null, null, true, confirmation.context);
            if (!applied) throw new Error("PUBLIC_CARD_CONTEXT_CHANGED");
          } catch (error) {
            throw new Error(error?.message === "PUBLIC_CARD_CONTEXT_CHANGED"
              ? "Le compte a changé. Ferme cette fenêtre, puis réessaie."
              : "Le changement de lien n’a pas pu être confirmé. Vérifie ton compte et ta connexion.");
          }
        },
      }).finally(() => { if (cardConfirmation === confirmation) cardConfirmation = null; });
    }
    if (b.hasAttribute("data-export-json")) return exportJson();
    if (b.hasAttribute("data-export-csv")) return window.titanExportSessionsCSV?.(logs());
    if (b.hasAttribute("data-clear-cache")) return clearCache();
    if (b.hasAttribute("data-signout"))
      return window.titanShell.confirm({
        title: "Se déconnecter ?",
        message: (window.TitanQueue?.list?.() || []).length ? "Des séances attendent encore l’envoi : elles restent sur cet appareil et partiront à ta prochaine connexion." : "Tu retrouveras tout en te reconnectant.",
        confirmLabel: "Se déconnecter",
        action: async () => {
          await window.titanClient?.auth.signOut().catch(() => {});
          window.titanSafeClearCache?.();
          location.href = "/login";
        },
      });
    if (b.dataset.wearTitle !== undefined) {
      const key = b.dataset.wearTitle;
      return wearTitle(key)
        .then(applied => applied && window.titanShell.toast({ type: "ok", title: key ? "Titre porté" : "Titre retiré", message: key ? `« ${wornName() || "Titre"} » apparaît sur ton profil.` : "Ton profil n’affiche plus de titre." }))
        .catch(err => {
          const m = String(err?.message || "");
          window.titanShell.toast({ type: "warn", message: m.includes("RATE_LIMITED") ? "Trop de changements de titre. Réessaie dans une heure." : m.includes("NOT_EARNED") ? "Ce titre n’est pas encore gagné." : err?.code === "PGRST202" || m.includes("Could not find") ? "Les titres arrivent avec la prochaine mise à jour du serveur." : "Modification non confirmée. Vérifie ta connexion, puis réessaie." });
        });
    }
    if (b.hasAttribute("data-delete")) return deleteAccount();
  }

  function onChange(e) {
    if (masteryNavigation.handle(e)) return renderMastery();
    const t = e.target;
    if (t.dataset.privacy) {
      window.state.user.privacy = { ...(window.state.user.privacy || {}), [t.dataset.privacy]: t.checked };
      window.saveState?.({ forceCloud: true });
      window.titanShell.toast({ type: "ok", title: "Confidentialité", message: t.checked ? "Partage activé." : "Partage désactivé." });
    }
    if (t.matches("[data-card-enabled]") || t.dataset.cardShow) {
      if (cardTask || !card || !cardContextValid(bitsContext)) { render(); return; }
      const context = bitsContext;
      const enabled = t.matches("[data-card-enabled]") ? t.checked : null;
      const show = t.dataset.cardShow ? { [t.dataset.cardShow]: t.checked } : {};
      const focus = enabled !== null ? "[data-card-enabled]" : `[data-card-show="${t.dataset.cardShow}"]`;
      return saveCard(enabled, show, false, context, focus)
        .then(applied => applied && cardContextValid(context) && enabled !== null && window.titanShell.toast({ type: "ok", title: enabled ? "Profil public activé" : "Profil public désactivé", message: enabled ? "Seuls ceux qui ont le lien peuvent le voir." : "Le lien ne mène plus nulle part." }))
        .catch(err => {
          if (!cardContextValid(context)) return;
          const m = String(err?.message || "");
          window.titanShell.toast({ type: "warn", message: err?.code === "PGRST202" || m.includes("Could not find") ? "Le profil public arrive avec la prochaine mise à jour du serveur." : "Modification non confirmée. Vérifie ta connexion, puis réessaie." });
        });
    }
    if (t.matches("[data-analytics]")) {
      const saved = window.TitanAnalytics?.setConsent(t.checked);
      if (saved !== true) {
        window.titanShell.toast({ type: "warn", title: "Choix non enregistré", message: "Ton choix vaut pour cette page. Après navigation ou rechargement, l’ancien réglage peut revenir. Réessaie avant de quitter cette page." });
        return;
      }
      window.titanShell.toast({ type: "ok", title: "Statistiques d’usage", message: t.checked ? "Merci pour ton aide." : "Plus rien n’est envoyé." });
    }
  }

  let booted = false;
  function start() {
    root = document.getElementById("profil");
    if (!root || !window.state?.user || !window.TitanSports || !B()) return;
    syncServerBits();
    if (avatarTask && !avatarContextCurrent(avatarTask)) avatarTask = null;
    if (exportTask && !exportContextCurrent(exportTask)) { exportTask = null; resetExportUi(); }
    if (!booted) {
      booted = true;
      SP().ensure();
      masteryNavigation = B().create("mastery", { defaultSort: "mastery", sorts: [["mastery", "Maîtrise la plus élevée"], ["alphabetical", "Nom A–Z"], ["recent", "Pratique la plus récente"]] });
      root.addEventListener("click", onClick);
      root.addEventListener("keydown", onRadioKey);
      root.addEventListener("focusout", onRadioExit);
      root.addEventListener("change", onChange);
      root.addEventListener("input", (e) => { if (masteryNavigation.handle(e)) renderMastery(); });
      A()?.refresh?.();
    }
    render();
    loadServerBits();
  }
  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      start();
    });
  };
  ["titan:history-updated", "titan:adventure-updated", "titan:pending-changed"].forEach((ev) => window.addEventListener(ev, queue));
  window.addEventListener("titan:account-changing", () => { avatarTask = null; exportTask = null; resetExportUi(); resetServerBits(); render(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
