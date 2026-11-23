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
  let showcase = null; // showcase [{key,label}] (server, V11-23); null until read
  let showcaseTask = null;
  let garminLinked = null; // true/false once titan_garmin_status_v1 answered (an authorised source is not necessarily linked); null = unknown
  let garminDailiesAuthorized = false;
  let sources = null; // connected activity sources [{source,granted,imported,...}] (server, V11-30); null until read
  let center = null; // V1.6.5: titan_source_center_v1 (consent, runs, coverage, batch); null on a server without bundle v24
  let sourcesTask = null;
  let pioneer = null; // Pionnier badge {granted, cohort} (server, V11-60); null until read
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
    // Who I am, on the chalk field of this space: the face, the name, the rank and its crest, and the XP towards the next level.
    return `<section class="pf-hero asc-on-field" aria-label="Mon identité">
      <div class="pf-id"><span class="pf-avatar"${u.frame ? ` data-frame="${esc(u.frame)}"` : ""}><img src="/assets/renaissance/${esc(u.avatar || "scout")}-s.webp" alt="" width="128" height="128"></span>
        <div class="pf-id-main"><h2 class="pf-name">${esc(guest() ? "Mode découverte" : window.state?.user?.name || "Athlète")}</h2><p class="pf-rank"><span class="pf-level-n">Niveau <strong class="asc-num">${pr.level}</strong></span> · ${esc(pr.rank.name)}</p>${wornName() ? `<p class="pf-title" data-pf-title>${icon("star")} ${esc(wornName())}</p>` : ""}${pioneer?.cohort ? `<p class="pf-title" data-pf-pioneer>${icon("flag")} Pionnier · ${esc(pioneer.cohort)}</p>` : ""}<p class="asc-small pf-since">${guest() ? "Tes séances restent sur cet appareil" : `Membre depuis ${esc(new Date(window.state?.user?.created_at || P().dna(logs()).first || Date.now()).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }))}`}</p></div>
        ${window.TitanCrest ? `<span class="pf-crest sig-object">${window.TitanCrest.svg(window.TitanCrest.rankIdOf(pr.level), 118)}</span>` : ""}</div>
      <div class="pf-level"><div class="pf-level-main">
        ${pr.guest || pr.confirmed ? `<span class="asc-ascent" role="progressbar" aria-label="Progression vers le niveau suivant" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="--p:${pct}%"></span></span>` : ""}
        <div class="asc-between"><p class="asc-small">${pr.guest || pr.confirmed ? `Vers le niveau ${pr.level + 1} · ` : "Progression en attente de synchronisation · "}${next ? `Prochain rang : ${esc(next.name)} au niveau ${next.level}` : "Rang le plus haut atteint"}${pr.estimated ? " · estimation du mode découverte" : ""}</p>${pr.guest || pr.confirmed ? `<span class="asc-small asc-num pf-xp">${F().number(pr.xp)} / ${F().number(pr.next)} XP</span>` : ""}</div></div></div>
      <nav class="pf-ways" aria-label="Mon passeport, mon style, ma carte"><a class="asc-btn asc-btn-secondary" data-profile-personalize href="#personnage">${icon("settings")} Personnaliser</a>${guest() ? "" : `<a class="asc-btn asc-btn-secondary" data-profile-atelier href="/boutique">${icon("sparkle")} Atelier</a><a class="asc-btn asc-btn-secondary" data-profile-card href="#public">${icon("share")} Carte publique</a>`}</nav>
    </section>`;
  }

  /* My sports as my programme of the last eight weeks: which ones, how often. The figures themselves live in Progrès. */
  function sportsHtml() {
    const V = window.TitanProgramView;
    const list = P().activeLogs ? P().activeLogs(logs()) : logs();
    const grid = V && window.TitanProgram && list.length ? V.span(list, { weeks: 8, maxRows: 5 }) : null;
    return `<section class="pf-sports" aria-labelledby="pf-sports-title">
      <div class="asc-section-head"><h2 id="pf-sports-title">Mes sports</h2><a class="asc-link pf-sport-passport" href="/stats">Mon parcours sportif ${icon("chevron")}</a></div>
      ${grid && (grid.rows.length || grid.more) ? V.html(grid, { label: "Mes sports sur les 8 dernières semaines" }) : `<p class="asc-small asc-muted">Enregistre une séance : tes sports, tes records et ta maîtrise apparaîtront ici.</p>`}
    </section>`;
  }

  /* What the effort earned, one line each: the latest record (amber is the colour of records), the insignia, the credits. Each line
     leads to the page that holds the whole list, so nothing is repeated here. */
  function earnedHtml() {
    const s = A()?.snapshot;
    const mine = s && s.owner === window.state?.user?.id ? s : null;
    const recs = (window.TitanInsights?.records?.(logs(), "all", Date.now()) || []).filter((r) => r.log?.date);
    const marks = recs.filter((r) => r.kind !== "duration");
    const best = (marks.length ? marks : recs).slice().sort((a, b) => new Date(b.log.date) - new Date(a.log.date))[0];
    const worlds = window.TitanCodex?.worlds?.length || 4;
    const row = (href, name, tone, title, sub, value) => `<a class="pf-earned-row${tone ? " is-" + tone : ""}" href="${href}">${icon(name)}<span class="pf-earned-text"><strong>${title}</strong><small>${sub}</small></span>${value ? `<span class="pf-earned-value asc-num">${value}</span>` : ""}${icon("chevron")}</a>`;
    const lines = [
      best ? row("/records", "trophy", "record", `${esc(best.label)} · ${esc(SP().label(best.sport))}`, recs.length > 1 ? `et ${recs.length - 1} autre${recs.length > 2 ? "s" : ""} record${recs.length > 2 ? "s" : ""} dans ton livre` : "Ton record le plus récent", esc(F().recordValue(best.unit, best.value))) : "",
      mine ? row("/adventure", "medal", "", "Insignes d’aventure", "Un insigne par chapitre terminé", `${(mine.rewards || []).length}<small> / ${worlds * 9}</small>`) : "",
      mine && !guest() ? row("/boutique", "sparkle", "", "Crédits", "À dépenser à l’Atelier", esc(F().number(mine.credits || 0))) : "",
    ].join("");
    return lines ? `<nav class="pf-earned" aria-label="Ce que mon effort a gagné">${lines}</nav>` : "";
  }

  function masteryHtml() {
    const list = P().mastery(logs());
    const result = masteryNavigation.select(B().entries(list));
    return `<section class="asc-section" id="maitrise"><div class="asc-section-head"><h2>Maîtrise</h2><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-mastery-help>${icon("help")} Les paliers</button></div>
      ${masteryNavigation.controls()}
      <div class="pf-mastery">${result.items
        .map(
          (m) => `<div class="pf-mastery-row" data-family="${esc(m.family)}"><span class="jr-icon">${icon(SP().iconOf(m.sport))}</span>
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
    const job = { context, focus: key ? `[data-wear-title="${CSS.escape(key)}"]` : "[data-wear-title='']" };
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

  /* V11-23: up to three earned titles shown on the public card. Same account/client/epoch guards as wearing a title; the server checks ownership. */
  async function toggleShowcase(key) {
    if (showcaseTask || wornTask || cardTask || !showcase || !cardContextValid(bitsContext)) return false;
    const context = bitsContext;
    const keys = showcase.map((x) => x.key);
    const next = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key].slice(0, 3);
    const job = { context, focus: `[data-showcase-toggle="${CSS.escape(key)}"]` };
    showcaseTask = job;
    render();
    try {
      const session = await readBitsSession(job);
      if (showcaseTask !== job || !bitsCurrent(job)) return false;
      const { data, error } = await context.client.rpc("titan_set_showcase_v1", { p_keys: next }).setHeader("Authorization", `Bearer ${session.access_token}`);
      if (showcaseTask !== job || !bitsCurrent(job)) return false;
      if (error) throw error;
      await readBitsSession(job);
      if (showcaseTask !== job || !bitsCurrent(job)) return false;
      showcase = (Array.isArray(data) ? data : []).filter((x) => x && typeof x.key === "string").map((x) => ({ key: x.key, label: x.label || null }));
      return true;
    } catch (error) {
      if (showcaseTask === job && bitsCurrent(job)) throw error;
      return false;
    } finally {
      if (showcaseTask === job) {
        const current = bitsCurrent(job);
        showcaseTask = null;
        if (current) {
          const restoreFocus = document.activeElement === document.body;
          render();
          if (restoreFocus && document.activeElement === document.body) root.querySelector(job.focus)?.focus({ preventScroll: true });
        }
      }
    }
  }

  const SOURCE_NAMES = { health_connect: "Santé Connect", garmin: "Garmin" };
  /* What Garmin answered when TITAN asked to be removed there (`withdrawn`, `refused`, `unavailable`, `skipped`, or null when the request
     itself failed). The link and the tokens are gone on TITAN's side whatever the answer, so the player must be told when a step is left
     for them in Garmin Connect: TITAN can no longer retry (same wording as the Android app). */
  let garminWithdrawal = undefined;
  const GARMIN_WITHDRAWN = "Garmin est déconnecté : TITAN a été retiré de ton compte Garmin et plus aucune activité n’est importée. Les séances déjà importées restent dans ton journal.";
  const GARMIN_UNCONFIRMED = "L’autorisation Garmin a été retirée dans TITAN : plus aucune activité n’est importée. Garmin n’a pas confirmé le retrait de son côté : pour le terminer, retire TITAN des applications connectées de ton compte Garmin Connect. Les séances déjà importées restent dans ton journal.";
  const garminWithdrawalMessage = (provider) => provider === "withdrawn" ? GARMIN_WITHDRAWN : GARMIN_UNCONFIRMED;

  /* V11-30: stop a connected source, or archive what it brought. Same account/client/epoch guards; the server only acts on the caller's own rows. */
  async function sourceAction(kind, source) {
    if (sourcesTask || !sources || !cardContextValid(bitsContext)) return false;
    const context = bitsContext;
    const job = { context, focus: `[data-source-${kind}="${CSS.escape(source)}"]`, kind };
    sourcesTask = job;
    render();
    try {
      const session = await readBitsSession(job);
      if (sourcesTask !== job || !bitsCurrent(job)) return false;
      // Garmin: TITAN is withdrawn at Garmin first (best effort); the local consent is withdrawn in any case so the player can always leave.
      if (kind === "revoke" && source === "garmin") {
        let provider = null;
        try {
          const response = await fetch("/.netlify/functions/garmin?action=disconnect", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, signal: AbortSignal.timeout(10000) });
          const data = response.ok ? await response.json().catch(() => null) : null;
          provider = typeof data?.provider === "string" ? data.provider : null;
        } catch { /* the consent withdrawal below still ends the import; the player is told Garmin did not confirm */ }
        if (sourcesTask !== job || !bitsCurrent(job)) return false;
        job.provider = provider;
      }
      const call = kind === "revoke"
        ? context.client.rpc("titan_set_source_consent_v1", { p_source: source, p_granted: false })
        : context.client.rpc("titan_archive_imported_v1", { p_source: source });
      const { error } = await call.setHeader("Authorization", `Bearer ${session.access_token}`);
      if (sourcesTask !== job || !bitsCurrent(job)) return false;
      if (error) throw error;
      const fresh = await context.client.rpc("titan_sources_v1").setHeader("Authorization", `Bearer ${session.access_token}`);
      if (sourcesTask !== job || !bitsCurrent(job)) return false;
      if (!fresh.error && Array.isArray(fresh.data)) sources = fresh.data.filter((x) => x && typeof x.source === "string");
      if (center) {
        const again = await context.client.rpc("titan_source_center_v1").setHeader("Authorization", `Bearer ${session.access_token}`);
        if (sourcesTask !== job || !bitsCurrent(job)) return false;
        if (!again.error && again.data && Array.isArray(again.data.sources)) center = again.data;
      }
      if (kind === "revoke" && source === "garmin") {
        garminLinked = false;
        garminDailiesAuthorized = false;
        garminWithdrawal = job.provider;
      }
      return true;
    } catch (error) {
      if (sourcesTask === job && bitsCurrent(job)) throw error;
      return false;
    } finally {
      if (sourcesTask === job) {
        const current = bitsCurrent(job);
        sourcesTask = null;
        if (current) {
          const restoreFocus = document.activeElement === document.body;
          render();
          if (restoreFocus && document.activeElement === document.body) root.querySelector(job.focus)?.focus({ preventScroll: true });
        }
      }
    }
  }

  /* V11-05: "Connecter Garmin" is behind the server flag screens.garmin (off unless the owner turns it on after Garmin's agreement and the real tests).
     Consent first, then the server builds the Garmin consent address (PKCE) and the player goes there. */
  const garminOn = () => !guest() && window.titanFlags?.enabled?.("screens.garmin", false) === true;
  const garminDailiesOn = () => garminOn() && window.titanFlags?.enabled?.("screens.garmin_dailies", false) === true;
  let garminTask = null;
  async function connectGarmin(dailies) {
    if (garminTask || sourcesTask || !cardContextValid(bitsContext) || (dailies && !garminDailiesOn())) return false;
    const context = bitsContext;
    const job = { context, focus: dailies ? '[data-garmin-connect="dailies"]' : '[data-garmin-connect=""]' };
    garminTask = job;
    render();
    try {
      const session = await readBitsSession(job);
      if (garminTask !== job || !bitsCurrent(job)) return false;
      if (!(dailies && garminLinked === true)) {
        const consent = await context.client.rpc("titan_set_source_consent_v1", { p_source: "garmin", p_granted: true }).setHeader("Authorization", `Bearer ${session.access_token}`);
        if (garminTask !== job || !bitsCurrent(job)) return false;
        if (consent.error) throw consent.error;
      }
      const response = await fetch(`/.netlify/functions/garmin?action=start${dailies ? "&dailies=1" : ""}`, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, signal: AbortSignal.timeout(10000) });
      if (garminTask !== job || !bitsCurrent(job)) return false;
      const data = response.ok ? await response.json().catch(() => null) : null;
      if (!data || typeof data.url !== "string" || !/^https:\/\//.test(data.url)) throw new Error("GARMIN_UNAVAILABLE");
      await readBitsSession(job);
      if (garminTask !== job || !bitsCurrent(job)) return false;
      location.assign(data.url);
      return true;
    } catch (error) {
      if (garminTask === job && bitsCurrent(job)) throw error;
      return false;
    } finally {
      if (garminTask === job) {
        const current = bitsCurrent(job);
        garminTask = null;
        if (current) render();
      }
    }
  }

  function garminConnectHtml() {
    if (!garminOn()) return "";
    const activityConnect = !(sources || []).some((x) => x.source === "garmin" && x.granted) || garminLinked === false;
    const dailies = garminDailiesOn();
    if (!activityConnect && !dailies) return "";
    const busy = garminTask ? ' disabled aria-busy="true"' : "";
    return `<section class="asc-section" data-garmin-block aria-labelledby="pf-garmin"><div class="asc-section-head"><h2 id="pf-garmin">Garmin</h2></div>
      ${activityConnect ? `<p class="asc-small asc-muted">Relie ta montre Garmin : tes séances arrivent dans ton journal sans les saisir. Tu choisis ce que Garmin partage sur son écran, tu peux tout retirer ici à tout moment, et rien n’est repris sans ton accord.</p>
      <button type="button" class="asc-btn asc-btn-secondary" data-garmin-connect${busy}>${icon("cloudUp")} Connecter Garmin</button>` : ""}
      ${dailies ? `<p class="asc-small asc-muted">Si tu l’autorises chez Garmin, seul ton total de pas par jour alimente les Sentiers du Titan. Tu peux retirer ce partage dans Garmin Connect.</p>
      ${garminDailiesAuthorized ? '<p class="asc-small">Pas Garmin autorisés</p>' : `<button type="button" class="asc-btn asc-btn-secondary" data-garmin-connect="dailies"${busy}>${activityConnect ? "Connecter Garmin et autoriser les pas" : "Autoriser les pas Garmin"}</button>`}` : ""}</section>`;
  }

  /* V1.6.5 — Centre des sources: one row per source with what it really provides, where it stopped and what to do
     (js/core/source-center.js, the same diagnosis as the Android app). The website cannot read Santé Connect: it shows the state the
     phone reported and sends the athlete to the app to resume. « Connecté » only for an access that works. */
  function centerHtml() {
    const TS = window.TitanSources;
    const known = center.sources.map((x) => x.source);
    const order = [...["health_connect", "garmin"].filter((x) => known.includes(x)), ...(center.batch ? ["archive"] : [])];
    if (!order.length) return "";
    const busy = sourcesTask ? " disabled" : "";
    const label = (id) => window.TitanSports?.label?.(id) || id;
    const rows = TS.center(center, { now: Date.now(), here: false, order }).map((d) => {
      const entry = center.sources.find((x) => x.source === d.source) || null;
      const got = d.coverage.fields.filter((f) => f.covered).map((f) => f.label);
      const missing = d.coverage.fields.filter((f) => !f.covered && f.note).map((f) => `${f.label} (${f.note.replace(/\.$/, "")})`);
      const facts = [
        d.lastSuccessText ? `<li><span>Dernière réussite</span> ${esc(d.lastSuccessText)}</li>` : d.kind !== "file_batch" ? "<li><span>Dernière réussite</span> aucune</li>" : "",
        d.lastAttemptText && d.lastAttemptText !== d.lastSuccessText ? `<li><span>Dernière tentative</span> ${esc(d.lastAttemptText)}</li>` : "",
        d.kind !== "file_batch" ? `<li><span>Reçu</span> ${esc(got.join(", "))}</li>` : "",
        missing.length ? `<li><span>Non transmis</span> ${esc(missing.join(" ; "))}</li>` : "",
        d.coverage.sports.length ? `<li><span>Sports reçus</span> ${esc(d.coverage.sports.map((x) => `${label(x.sport)} (${x.n})`).join(", "))}</li>` : "",
        d.exclusions.length ? `<li data-source-exclusions><span>Exclues à la dernière lecture</span> ${esc(d.exclusions.map((x) => `${x.n} ${x.label}`).join(", "))}</li>` : "",
        d.kind === "device_read" ? `<li><span>Reprise</span> ${esc(d.replayNote)} Elle se fait dans l’application Android : Sources et capteurs › Santé Connect.</li>` : d.kind === "push" ? `<li><span>Reprise</span> ${esc(d.replayNote)}</li>` : "",
      ].join("");
      const actions = [
        ...d.actions.filter((a) => a.id === "review").map((a) => `<a class="asc-btn asc-btn-secondary asc-btn-sm" href="/journal" data-source-review="${esc(d.source)}">${esc(a.label)} (${a.n})</a>`),
        ...d.actions.filter((a) => a.id === "resume_batch" || a.id === "open_import").map((a) => `<a class="asc-btn asc-btn-secondary asc-btn-sm" href="/journal" data-source-import>${esc(a.label)}</a>`),
        entry?.consent?.granted ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-source-revoke="${esc(d.source)}"${busy}>Retirer l’accès</button>` : "",
        d.counts.imported > 0 ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-source-archive="${esc(d.source)}"${busy}>Archiver ce que ${esc(d.name)} a apporté</button>` : "",
      ].join("");
      const garminHint = d.actions.some((a) => a.id === "connect_garmin" || a.id === "finish_garmin") && garminOn() ? "<p class=\"asc-small\">Utilise « Connecter Garmin » ci-dessus.</p>" : "";
      return `<div class="asc-row pf-source" data-source="${esc(d.source)}" data-source-state="${esc(d.state)}"><span class="asc-row-icon">${icon(d.kind === "file_batch" ? "upload" : "cloudUp")}</span><span class="asc-row-main">
          <span class="asc-row-title">${esc(d.name)} <span class="asc-chip pf-source-chip" data-tone="${esc(d.tone)}">${esc(d.label)}</span></span>
          <span class="asc-row-sub">${esc(d.detail)}</span></span></div>
        <ul class="pf-source-facts">${facts}</ul>${garminHint}<div class="asc-row-flex">${actions}</div>`;
    }).join("");
    return `<section id="sources-connectees" class="asc-section" data-sources-block data-source-center aria-labelledby="pf-sources"><div class="asc-section-head"><h2 id="pf-sources">Centre des sources</h2></div>
      ${garminWithdrawal !== undefined ? `<p class="asc-note${garminWithdrawal === "withdrawn" ? "" : " warn"}" role="status" data-garmin-withdrawal="${esc(garminWithdrawal || "unconfirmed")}">${icon(garminWithdrawal === "withdrawn" ? "check" : "info")}<span>${esc(garminWithdrawalMessage(garminWithdrawal))}</span></p>` : ""}
      <p class="asc-small asc-muted">Ce que chaque source fournit vraiment, où elle s’est arrêtée et comment reprendre. « Connecté » n’est dit que pour un accès qui fonctionne.</p>
      <div class="asc-list">${rows}</div>
      <p class="asc-small asc-faint">Une séance déjà dans ton journal n’est jamais modifiée par une source : tes corrections restent. Retirer l’accès arrête la collecte ; archiver retire seulement les séances reçues du journal.</p></section>`;
  }

  function sourcesBlockHtml() {
    if (!guest() && center && window.TitanSources) return centerHtml();
    if (guest() || !sources || !sources.length) return "";
    return `<section id="sources-connectees" class="asc-section" data-sources-block aria-labelledby="pf-sources"><div class="asc-section-head"><h2 id="pf-sources">Sources connectées</h2></div>
      ${garminWithdrawal !== undefined ? `<p class="asc-note${garminWithdrawal === "withdrawn" ? "" : " warn"}" role="status" data-garmin-withdrawal="${esc(garminWithdrawal || "unconfirmed")}">${icon(garminWithdrawal === "withdrawn" ? "check" : "info")}<span>${esc(garminWithdrawalMessage(garminWithdrawal))}</span></p>` : ""}
      <div class="asc-list">${sources.map((x) => {
        const name = SOURCE_NAMES[x.source] || x.source;
        const since = x.granted_at ? new Date(x.granted_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "";
        const busy = sourcesTask ? " disabled" : "";
        return `<div class="asc-row" data-source="${esc(x.source)}"><span class="asc-row-icon">${icon("cloudUp")}</span><span class="asc-row-main"><span class="asc-row-title">${esc(name)} · ${x.granted ? "autorisée" : "retirée"}</span>
          <span class="asc-row-sub">${x.granted ? `Autorisée depuis le ${esc(since)}. ${x.source === "garmin" && garminLinked === false ? "La liaison avec Garmin n’est pas terminée : utilise « Connecter Garmin » ci-dessus. " : ""}` : "Plus aucune séance n’est reçue. "}${Number(x.imported) || 0} séance${x.imported > 1 ? "s" : ""} reçue${x.imported > 1 ? "s" : ""} et gardée${x.imported > 1 ? "s" : ""} dans ton journal${x.linked ? `, ${x.linked} rattachée${x.linked > 1 ? "s" : ""} à une séance déjà saisie` : ""}.</span></span></div>
        <div class="asc-row-flex">${x.granted ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-source-revoke="${esc(x.source)}"${busy}>Retirer l’accès</button>` : ""}${x.imported > 0 ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-source-archive="${esc(x.source)}"${busy}>Archiver ce que ${esc(name)} a apporté</button>` : ""}</div>`;
      }).join("")}</div>
      <p class="asc-small asc-faint">Retirer l’accès arrête les imports. Tes récompenses déjà reçues restent acquises ; archiver retire seulement les séances reçues du journal.</p></section>`;
  }

  function showcaseBlockHtml() {
    if (guest() || !showcase || !window.TitanTitles) return "";
    const options = window.TitanTitles.earned({ rewards: A()?.snapshot?.rewards || [], expeditionTitles: titles || [], catalog: C() });
    if (!options.length) return "";
    const picked = new Set(showcase.map((x) => x.key));
    const full = picked.size >= 3;
    return `<div class="pf-col-block" data-showcase-block><p class="asc-eyebrow">Vitrine</p>
      <p class="asc-small asc-muted">Choisis jusqu’à trois distinctions à montrer sur ta carte publique${card?.enabled ? "" : " (quand tu l’activeras)"} — ${picked.size} sur 3.</p>
      <ul class="pf-chips" role="group" aria-label="Distinctions de la vitrine">${options.map((t) => `<li class="pf-chip-choice"><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-showcase-toggle="${esc(t.key)}" aria-pressed="${picked.has(t.key)}" ${showcaseTask || (full && !picked.has(t.key)) ? "disabled" : ""}>${icon(t.source === "expedition" ? "mountain" : "star")} ${esc(t.label)}</button></li>`).join("")}</ul>
      <p class="asc-small asc-faint">Purement décoratif : aucune distinction ne donne d’XP ni de crédits.</p></div>`;
  }

  function titleBlockHtml() {
    if (guest() || !worn || !window.TitanTitles) return "";
    const options = window.TitanTitles.earned({ rewards: A()?.snapshot?.rewards || [], expeditionTitles: titles || [], catalog: C() });
    const name = wornName();
    return `<div class="pf-col-block" data-title-block><p class="asc-eyebrow">Titre porté</p>
      <p class="asc-small ${name ? "" : "asc-muted"}" data-worn-title>${name ? `Tu portes « ${esc(name)} », visible sur ton profil${card?.enabled ? " et ta carte publique (si les titres sont affichés)" : ""}.` : options.length ? "Aucun titre porté. Choisis-en un parmi ceux que tu as gagnés." : "Gagne un insigne d’aventure pour porter ton premier titre."}</p>
      ${options.length ? `<ul class="pf-chips" role="group" aria-label="Titres gagnés">${options.map((t) => `<li class="pf-chip-choice"><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-wear-title="${esc(t.key)}" aria-pressed="${worn.key === t.key}" ${wornTask ? "disabled" : ""}>${icon(t.source === "expedition" ? "mountain" : "star")} ${esc(t.label)}${worn.key === t.key ? " · porté" : ""}</button></li>`).join("")}</ul>
      ${worn.key ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-wear-title="" ${wornTask ? "disabled" : ""}>Ne plus porter de titre</button>` : ""}` : ""}
      <p class="asc-small asc-faint">Un titre est purement décoratif : il ne donne ni XP ni crédits.</p></div>`;
  }

  /* V11-12: long efforts recognised on their own, cosmetic only (no XP, no credits). */
  function enduranceBlockHtml() {
    const h = window.TitanEndurance?.highlights(logs());
    if (!h || (!h.earned.length && !(h.bests.distanceKm > 0))) return "";
    return `<div class="pf-col-block" data-endurance-block><p class="asc-eyebrow">Exploits d’endurance</p>
      ${h.earned.length ? `<ul class="pf-chips">${h.earned.map((e) => `<li data-endurance="${esc(e.key)}">${icon(e.family === "elevation" ? "mountain" : e.family === "duration" ? "clock" : "route")} ${esc(e.label)}</li>`).join("")}</ul>` : ""}
      ${h.next.length ? `<p class="asc-small asc-faint">Prochain${h.next.length > 1 ? "s" : ""} : ${h.next.map((n) => esc(n.label)).join(" · ")}. Une seule sortie suffit, sans XP en plus : ce sont des souvenirs.</p>` : ""}
      ${h.earned.length && window.TitanCard ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-endurance-card>${icon("share")} Image de mon plus bel exploit</button>` : ""}</div>`;
  }

  /* V11-12 follow-up: the best endurance exploit as a shareable card. One session only, no place, no route. */
  function enduranceCard() {
    const h = window.TitanEndurance?.highlights(logs());
    const best = h?.earned?.[0];
    if (!best || !window.TitanCard) return;
    window.TitanCard.open({
      kind: "record",
      eyebrow: "Exploit d’endurance",
      title: best.family === "elevation" ? "Dénivelé en une sortie" : best.family === "duration" ? "Durée en une sortie" : "Distance en une sortie",
      value: best.label,
      detail: h.bests.distanceKm > 0 ? `Plus longue sortie : ${F().distance(h.bests.distanceKm)}` : "",
      name: window.TitanCard.userName(),
      filename: "titan-exploit",
    });
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
        ${showcaseBlockHtml()}
        ${enduranceBlockHtml()}
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

  const METRICS = { sessions: "Séances", time: "De pratique", weeks: "Semaines tenues", favorite: "Sport le plus pratiqué" };
  const DEFAULT_METRICS = ["sessions", "time", "weeks"];
  const metricOwner = () => window.state?.user?.id || "discovery";
  const metricsKey = () => `titan_profile_metrics_v13_${metricOwner()}`;
  const validMetrics = value => Array.isArray(value) && value.length === 3 && new Set(value).size === 3
    && value.every(key => Object.hasOwn(METRICS, key));

  function metricChoices() {
    try {
      const choices = JSON.parse(localStorage.getItem(metricsKey()));
      if (validMetrics(choices)) return choices;
    } catch { /* storage may be unavailable */ }
    return DEFAULT_METRICS;
  }

  function passportStatsHtml() {
    const dna = P().dna(logs());
    const cadence = P().cadence(logs(), D().cadenceSettings());
    const values = {
      sessions: F().number(dna.sessions),
      time: F().hours(dna.minutes),
      weeks: F().number(cadence.lifetimeHeld),
      favorite: dna.topSports[0]?.label || "À découvrir",
    };
    return `<dl class="pf-passport-stats" aria-label="Mon sport en trois chiffres">${metricChoices().map(key =>
      `<div data-profile-metric="${key}"><dt>${METRICS[key]}</dt><dd>${esc(values[key])}</dd></div>`).join("")}</dl>`;
  }

  function identityHtml() {
    const u = window.state?.user || {};
    const choices = metricChoices();
    return `<section class="asc-section" id="identite"><div class="asc-section-head"><h2>Mon passeport</h2></div>
        ${guest() ? "" : `<label class="asc-field"><span>Nom affiché</span><span class="pf-inline"><input class="asc-input" id="pf-name" maxlength="24" value="${esc(u.name || "")}" autocomplete="nickname"><button type="button" class="asc-btn asc-btn-secondary" data-save-name>Enregistrer</button></span></label>`}
      <fieldset class="pf-metric-choices"><legend>Mes trois indicateurs</legend>
        <p class="asc-small asc-muted">Ces choix restent sur cet appareil, pour ce compte.</p>
        ${choices.map((key, slot) => `<label class="asc-field"><span>Indicateur ${slot + 1}</span>
          <select class="asc-input" data-profile-metric-slot="${slot}" data-profile-metric-owner="${esc(metricOwner())}">
            ${Object.entries(METRICS).filter(([id]) => id === key || !choices.includes(id)).map(([id, label]) =>
              `<option value="${id}"${id === key ? " selected" : ""}>${label}</option>`).join("")}
          </select></label>`).join("")}
      </fieldset></section>`;
  }

  function cadenceHtml() {
    const settings = D().cadenceSettings();
    return `<section class="asc-section" id="cadence"><div class="asc-section-head"><h2>Régularité</h2></div>
        <div class="asc-field"><span>Cadence : jours actifs visés par semaine</span><div class="ob-target pf-target" role="radiogroup" aria-label="Cadence">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<button type="button" role="radio" data-cadence="${n}" aria-checked="${settings.target === n}" tabindex="${settings.target === n ? 0 : -1}">${n}</button>`).join("")}</div><small>Une semaine en pause se règle depuis le QG ; elle ne compte ni pour ni contre toi.</small></div>
      </section>`;
  }

  function settingsHtml() {
    const privacy = window.state?.user?.privacy || {};
    const analytics = window.TitanAnalytics?.consent() === "granted";
    return `<section class="asc-section" id="reglages"><div class="asc-section-head"><h2>Confidentialité</h2></div>
      <div class="pf-settings">
        <fieldset class="pf-privacy"><legend class="seance-label">Confidentialité</legend>${guest() ? `<p class="asc-small asc-muted">En mode découverte, rien ne quitte cet appareil.</p>` : PRIVACY.map(([k, label, help]) => `<label class="pf-toggle"><input type="checkbox" role="switch" data-privacy="${k}" ${privacy[k] === true ? "checked" : ""}><span><strong>${esc(label)}</strong><small>${esc(help)}</small></span></label>`).join("")}
          <label class="pf-toggle"><input type="checkbox" role="switch" data-analytics ${analytics ? "checked" : ""}><span><strong>Statistiques d’usage</strong><small>Aide à améliorer TITAN. Jamais de santé, de poids, de GPS ni de notes.</small></span></label>
          <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" style="white-space:normal" data-ga4-open>Mesure de fréquentation (Google Analytics)</button></fieldset>
      </div></section>`;
  }

  const GROUP_ICONS = { identity: "user", sport: "run", account: "link", preferences: "settings" };
  function profileGroup(id, title, subtitle, body, opened) {
    return `<details class="pf-passport-group" data-profile-group="${id}"${opened.has(id) ? " open" : ""}>
      <summary><i class="pf-group-icon" aria-hidden="true">${icon(GROUP_ICONS[id] || "dot")}</i><span><strong>${title}</strong><small>${subtitle}</small></span>${icon("chevron")}</summary>
      <div class="pf-group-body">${body}</div></details>`;
  }

  function publicHtml() {
    if (guest()) return "";
    if (!card) return `<section class="asc-section" id="public"><div class="asc-section-head"><h2>Profil public</h2></div><p class="asc-small asc-muted">${cardUnavailable ? "La carte d’athlète publique est momentanément indisponible." : !navigator.onLine ? "Disponible avec le réseau." : cardFailed || !window.titanClient ? "Profil public indisponible pour le moment. Réessaie plus tard." : "Chargement…"}</p></section>`;
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
    garminWithdrawal = undefined;
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
    showcase = null;
    showcaseTask = null;
    sources = null;
    center = null;
    garminLinked = null;
    garminDailiesAuthorized = false;
    pioneer = null;
    sourcesTask = null;
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
        if (!bitsCurrent(job)) return;
        await readBitsSession(job);
        if (bitsCurrent(job) && !w.error && w.data && typeof w.data === "object") worn = { key: w.data.key || null, label: w.data.label || null };
      } catch {}
      // The showcase is another best-effort read (V11-23): an older server simply shows no picker.
      try {
        const v = await within(job.context.client.rpc("titan_showcase_v1").setHeader("Authorization", `Bearer ${session.access_token}`));
        if (!bitsCurrent(job)) return;
        await readBitsSession(job);
        if (bitsCurrent(job) && !v.error && Array.isArray(v.data)) showcase = v.data.filter((x) => x && typeof x.key === "string").map((x) => ({ key: x.key, label: x.label || null }));
      } catch {}
      // The Pionnier badge (V11-60) is another best-effort read: an older server simply shows none.
      try {
        const v = await within(job.context.client.rpc("titan_pioneer_v1").setHeader("Authorization", `Bearer ${session.access_token}`));
        if (!bitsCurrent(job)) return;
        await readBitsSession(job);
        if (bitsCurrent(job) && !v.error && v.data && typeof v.data === "object") pioneer = v.data.granted === true ? { cohort: String(v.data.cohort || "").slice(0, 40) } : { cohort: null };
      } catch {}
      // Connected activity sources (V11-30): shown only when the account allowed one.
      try {
        const v = await within(job.context.client.rpc("titan_sources_v1").setHeader("Authorization", `Bearer ${session.access_token}`));
        if (!bitsCurrent(job)) return;
        await readBitsSession(job);
        if (bitsCurrent(job) && !v.error && Array.isArray(v.data)) sources = v.data.filter((x) => x && typeof x.source === "string");
      } catch {}
      // V1.6.5: the center (runs, coverage, who withdrew) once bundle v24 is applied; without it, the list above is shown as before.
      try {
        const v = await within(job.context.client.rpc("titan_source_center_v1").setHeader("Authorization", `Bearer ${session.access_token}`));
        if (!bitsCurrent(job)) return;
        await readBitsSession(job);
        if (bitsCurrent(job)) center = !v.error && v.data && Array.isArray(v.data.sources) ? v.data : null;
      } catch {}
      // The consent is given BEFORE the Garmin screen: when the player leaves that screen without finishing, the source is authorised but not
      // linked. The real link state decides whether "Connecter Garmin" stays offered.
      try {
        if ((sources || []).some((x) => x.source === "garmin" && x.granted)) {
          const g = await within(job.context.client.rpc("titan_garmin_status_v1").setHeader("Authorization", `Bearer ${session.access_token}`));
          if (!bitsCurrent(job)) return;
          await readBitsSession(job);
          if (bitsCurrent(job) && !g.error && g.data && typeof g.data.linked === "boolean") {
            garminLinked = g.data.linked;
            garminDailiesAuthorized = garminLinked && g.data.dailies_authorized === true;
          }
        }
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
    const plus = s && !s.local && s.owner === window.state?.user?.id && typeof s.plus === "boolean" ? s.plus : null;
    const subscription = plus === true ? "Accès TITAN+ actif · origine à consulter"
      : plus === false ? "Consulter les offres et la gestion de l’abonnement"
      : "Accès non vérifié · consulter les offres";
    return `<section class="asc-section" id="compte"><div class="asc-section-head"><h2>${guest() ? "Garder tes séances" : "Compte et données"}</h2></div>
      ${guest() ? `<div class="asc-note">${icon("cloudUp")}<span>Crée un compte pour sauvegarder ta progression et la retrouver partout. Tes séances de découverte pourront le rejoindre en un geste.</span></div><div class="asc-row-flex pf-actions"><a class="asc-btn asc-btn-primary" href="/login?mode=signup">Créer un compte</a><a class="asc-btn asc-btn-secondary" href="/login">J’ai déjà un compte</a></div>` : `<div class="asc-list">
        <a class="asc-row" href="${plus ? "/boutique" : "/titan-plus"}"><span class="asc-row-icon">${icon("sparkle")}</span><span class="asc-row-main"><span class="asc-row-title">TITAN+</span><span class="asc-row-sub">${subscription}</span></span>${icon("chevron")}</a>
        <a class="asc-row" href="/recours"><span class="asc-row-icon">${icon("info")}</span><span class="asc-row-main"><span class="asc-row-title">Séances contrôlées et recours</span><span class="asc-row-sub">Voir une séance mise de côté et contester la décision.</span></span>${icon("chevron")}</a>
      </div>`}
      ${garminConnectHtml()}
      ${sourcesBlockHtml()}
      <div class="asc-list pf-data">
        <button type="button" class="asc-row" id="pf-export-json" data-export-json${exportTask ? " disabled" : ""}><span class="asc-row-icon">${icon("download")}</span><span class="asc-row-main"><span class="asc-row-title">Exporter toutes mes données</span><span class="asc-row-sub">Fichier JSON : profil, séances, objectifs${guest() ? " (données de cet appareil)" : ""}</span></span></button>
        <button type="button" class="asc-row" data-export-csv><span class="asc-row-icon">${icon("journal")}</span><span class="asc-row-main"><span class="asc-row-title">Exporter mon journal</span><span class="asc-row-sub">Tableur CSV, lisible partout</span></span></button>
      </div>${exportTask ? `<p class="asc-small asc-muted" role="status" data-export-progress>Préparation de l’export…</p>` : ""}</section>`;
  }

  /* The one irreversible action of the page stands alone at the end of its group, away from the exports a thumb reaches for. */
  function dangerHtml() {
    return guest() ? "" : `<section class="asc-section pf-danger-zone" aria-labelledby="pf-danger-title"><div class="asc-section-head"><h2 id="pf-danger-title">Quitter TITAN</h2></div>
      <div class="asc-list"><button type="button" class="asc-row pf-danger" data-delete><span class="asc-row-icon">${icon("trash")}</span><span class="asc-row-main"><span class="asc-row-title">Supprimer mon compte</span><span class="asc-row-sub">Définitif : séances, objectifs, progression</span></span></button></div>
      <p class="asc-small asc-faint">Une confirmation écrite est demandée avant toute suppression. Exporte d’abord tes données si tu veux les garder.</p></section>`;
  }

  function preferencesHtml() {
    return `<section class="asc-section" id="preferences"><div class="asc-list">
        <a class="asc-row" href="/prevoir"><span class="asc-row-icon">${icon("bell")}</span><span class="asc-row-main"><span class="asc-row-title">Planning et rappels</span><span class="asc-row-sub">Prévoir mes prochaines séances</span></span>${icon("chevron")}</a>
        <button type="button" class="asc-row" data-motion-toggle aria-pressed="${(() => { try { return localStorage.getItem("titan_motion_v1") === "reduced"; } catch { return false; } })()}"><span class="asc-row-icon">${icon("sparkle")}</span><span class="asc-row-main"><span class="asc-row-title">Animations réduites</span><span class="asc-row-sub">Limite les mouvements dans TITAN (en plus du réglage de ton appareil)</span></span></button>
        <a class="asc-row" href="/service"><span class="asc-row-icon">${icon("info")}</span><span class="asc-row-main"><span class="asc-row-title">Assistance</span><span class="asc-row-sub">Aide, problème technique, compte, données</span></span>${icon("chevron")}</a>
        <a class="asc-row" href="/legal_hub"><span class="asc-row-icon">${icon("info")}</span><span class="asc-row-main"><span class="asc-row-title">Informations légales</span></span>${icon("chevron")}</a>
        <button type="button" class="asc-row" data-clear-cache><span class="asc-row-icon">${icon("restore")}</span><span class="asc-row-main"><span class="asc-row-title">Vider le cache de cet appareil</span><span class="asc-row-sub">Les séances en attente sont conservées</span></span></button>
      </div></section>`;
  }

  function revealSection(hash, scroll = false) {
    if (!hash?.startsWith("#") || !root) return;
    const target = document.getElementById(hash.slice(1));
    if (!target || !root.contains(target)) return;
    for (let group = target.closest("details"); group; group = group.parentElement.closest("details")) group.open = true;
    if (scroll) target.scrollIntoView();
  }

  /* Where a focused control without an id sits in the profile: its tag and stable attributes, its rank among the controls that share
     them, and the start of its label. Enough to find the same control in the redrawn page, and to give up if the page changed. */
  function focusPlace(el) {
    const stable = [...el.attributes].filter(a => a.name.startsWith("data-") || ["href", "name", "type", "role", "aria-label"].includes(a.name));
    const selector = el.tagName.toLowerCase() + stable.map(a => `[${a.name}="${a.value.replace(/["\\]/g, "\\$&")}"]`).join("");
    try {
      const index = [...root.querySelectorAll(selector)].indexOf(el);
      return index < 0 ? null : { selector, index, text: el.textContent.trim().slice(0, 60) };
    } catch (_) { return null; }
  }

  function render() {
    if (!root) return;
    // Capture focus at render time so a late avatar response cannot reclaim it.
    const focused = root.contains(document.activeElement) ? document.activeElement.closest('[role="radio"]') : null;
    const attribute = focused?.hasAttribute("data-cadence") ? "data-cadence" : focused?.hasAttribute("data-avatar") ? "data-avatar" : null;
    const value = attribute ? focused.getAttribute(attribute) : null;
    const opened = new Set([...root.querySelectorAll("[data-profile-group][open]")].map(group => group.dataset.profileGroup));
    // Any other focused control of the profile (a link, a button, a section heading reached with Tab) is found again after the redraw:
    // a save that completes in the background must not send the keyboard back to the top of the page.
    const place = !attribute && root.contains(document.activeElement) && !document.activeElement.id ? focusPlace(document.activeElement) : null;
    // Short on purpose: identity, three figures, the programme, one line each for what was earned, then the groups. What Progrès
    // and Aventure already show is one tap away, not repeated; the career milestones live in « Mon identité ».
    B().preserveFocus(() => { root.innerHTML = `${heroHtml()}
      <div class="pf-body">${passportStatsHtml()}
      ${sportsHtml()}
      ${earnedHtml()}
      <div class="pf-groups">
      ${profileGroup("identity", "Mon identité", "Personnage, titres, collection et jalons", `${identityHtml()}${avatarHtml()}<div data-profile-career></div>${collectionHtml()}${publicHtml()}`, opened)}
      ${profileGroup("sport", "Mon sport", "Favoris, objectifs et historique", `<nav class="pf-sport-links" aria-label="Mon sport"><a class="asc-btn asc-btn-secondary" href="/objectifs">Mes objectifs</a><a class="asc-btn asc-btn-secondary" href="/journal">Mon historique</a></nav>${cadenceHtml()}${masteryHtml()}${dnaHtml()}`, opened)}
      ${profileGroup("account", "Connexions &amp; compte", "Sources, confidentialité et abonnement", `<section class="asc-section" id="sources"><div class="asc-section-head"><h2>Sources et capteurs</h2></div><p class="asc-small asc-muted">Tes autorisations et sources disponibles apparaissent ici. Les capteurs du téléphone se règlent dans l’application Android.</p></section>${accountHtml()}${settingsHtml()}${dangerHtml()}`, opened)}
      ${profileGroup("preferences", "Aide &amp; préférences", "Rappels, affichage et assistance", preferencesHtml(), opened)}
      </div>
      ${guest() ? "" : `<button type="button" class="asc-btn asc-btn-ghost pf-signout" data-signout>${icon("logout")} Se déconnecter</button>`}</div>`; });
    window.TitanJourneyPanel?.mount(root.querySelector("[data-profile-career]"), "career");
    if (attribute && document.activeElement === document.body) {
      const next = [...root.querySelectorAll(`[role="radio"][${attribute}]`)].find(radio => radio.getAttribute(attribute) === value && radio.getAttribute("aria-disabled") !== "true");
      if (next) {
        next.closest('[role="radiogroup"]').querySelectorAll('[role="radio"]').forEach(radio => { radio.tabIndex = radio === next ? 0 : -1; });
        next.focus({ preventScroll: true });
      }
    }
    if (place && document.activeElement === document.body) {
      const again = root.querySelectorAll(place.selector)[place.index];
      if (again && again.textContent.trim().slice(0, 60) === place.text) again.focus({ preventScroll: true });
    }
    root.setAttribute("aria-busy", "false");
    if (location.hash && !root.dataset.scrolled) {
      root.dataset.scrolled = "1";
      revealSection(location.hash, true);
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
        if (!serverDeleted) {
          const session = await readBitsSession(job);
          if (!deletionCurrent(job)) return;
          // A Garmin link is withdrawn at Garmin first, on a best-effort basis: it never blocks the deletion (GAR-12).
          if ((sources || []).some((x) => x.source === "garmin" && x.granted)) {
            try {
              await fetch("/.netlify/functions/garmin?action=disconnect", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, signal: AbortSignal.timeout(8000) });
            } catch { /* Garmin unreachable: the account is deleted anyway, the link dies with it */ }
            if (!deletionCurrent(job)) return;
          }
          const { data, error } = await job.context.client.rpc("delete_own_account")
            .setHeader("Authorization", `Bearer ${session.access_token}`);
          if (error) throw error;
          if (data?.userId !== job.context.owner || ![0, 1].includes(data.deleted?.auth_users)) throw new Error("DELETE_OWNER_UNCONFIRMED");
          serverDeleted = true;
          if (deletionCurrent(job)) setPending(true);
        }
        // A verified receipt authorizes erasure even after the deleted owner's credentials disappear.
        await window.TitanQueue?.deleteOwner(job.context.owner);
        try {
          const saved = JSON.parse(localStorage.getItem(window.STATE_KEY) || "null");
          if (saved?.user?.id === job.context.owner) localStorage.removeItem(window.STATE_KEY);
        } catch { /* The shared cache may be unreadable. */ }
        if (!deletionCurrent(job)) return;
        const { data: auth, error: authError } = await job.context.client.auth.getSession();
        if (!deletionCurrent(job)) return;
        const session = auth?.session;
        const removedSession = session === null && (!authError || ["refresh_token_not_found", "session_not_found", "user_not_found"].includes(authError.code));
        if (!removedSession && (authError || !session?.access_token || session.user?.id !== job.context.owner)) throw new Error("PROFILE_READ_SESSION_CHANGED");
        // Shared cache and navigation still require the same context and no foreign session.
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
    const anchor = e.target.closest('a[href^="#"]');
    if (anchor) revealSection(anchor.getAttribute("href"));
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
    if (b.hasAttribute("data-endurance-card")) return enduranceCard();
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
    // V1.6.3: « Tout ton journal » — the journal and its archives, each row with its state (js/core/history-ledger.js).
    if (b.hasAttribute("data-export-csv")) return window.titanExportSessionsCSV?.([...logs(), ...(window.state?.archivedHistory || [])]);
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
    if (b.hasAttribute("data-garmin-connect")) {
      return connectGarmin(b.dataset.garminConnect === "dailies").catch(() => window.titanShell.toast({ type: "warn", message: "Garmin n’est pas disponible pour le moment. Réessaie plus tard." }));
    }
    const sourceKind = b.dataset.sourceRevoke !== undefined ? "revoke" : b.dataset.sourceArchive !== undefined ? "archive" : null;
    if (sourceKind) {
      const source = sourceKind === "revoke" ? b.dataset.sourceRevoke : b.dataset.sourceArchive;
      // V1.6.5: a withdrawal says what stops, what stays and how to archive before it happens (same words as the Android app).
      const entry = (center?.sources || []).find((x) => x.source === source) || (sources || []).find((x) => x.source === source) || null;
      const lines = sourceKind === "revoke" ? window.TitanSources?.withdrawText?.(source, entry ? { counts: entry.counts || { imported: entry.imported } } : null) || [] : [];
      const asked = sourceKind === "revoke" && lines.length
        ? window.titanShell.confirm({ title: `Retirer ${SOURCE_NAMES[source] || source} ?`, message: lines[0], detail: lines.slice(1).join(" "), confirmLabel: "Retirer l’accès", danger: true })
        : Promise.resolve(true);
      return asked.then((yes) => (yes ? sourceAction(sourceKind, source) : false))
        .then((done) => {
          if (!done) return done;
          const garmin = sourceKind === "revoke" && source === "garmin";
          const unconfirmed = garmin && garminWithdrawal !== "withdrawn";
          window.titanShell.toast({ type: unconfirmed ? "warn" : "ok", title: sourceKind === "revoke" ? (unconfirmed ? "Accès retiré dans TITAN" : "Accès retiré") : "Séances archivées",
            message: garmin ? (unconfirmed ? "Garmin n’a pas confirmé le retrait : termine-le dans Garmin Connect. Le détail est affiché dans « Sources connectées »." : "TITAN a aussi été retiré de ton compte Garmin.")
              : sourceKind === "revoke" ? "Plus aucune séance ne sera reçue de cette source." : "Les séances reçues ne sont plus dans ton journal. La page se recharge pour le montrer." });
          return done;
        })
        .then((done) => { if (done && sourceKind === "archive") setTimeout(() => location.reload(), 1200); })
        .catch(() => window.titanShell.toast({ type: "warn", message: "Cette action n’a pas pu être faite. Réessaie." }));
    }
    if (b.dataset.showcaseToggle !== undefined) {
      return toggleShowcase(b.dataset.showcaseToggle)
        .catch((err) => {
          const m = String(err?.message || "");
          window.titanShell.toast({ type: "warn", message: m.includes("RATE_LIMITED") ? "Trop de changements de vitrine. Réessaie dans une heure." : m.includes("NOT_EARNED") ? "Cette distinction n’est pas encore gagnée." : "La vitrine n’a pas pu être modifiée. Réessaie." });
        });
    }
    if (b.dataset.wearTitle !== undefined) {
      const key = b.dataset.wearTitle;
      return wearTitle(key)
        .then(applied => applied && window.titanShell.toast({ type: "ok", title: key ? "Titre porté" : "Titre retiré", message: key ? `« ${wornName() || "Titre"} » apparaît sur ton profil.` : "Ton profil n’affiche plus de titre." }))
        .catch(err => {
          const m = String(err?.message || "");
          window.titanShell.toast({ type: "warn", message: m.includes("RATE_LIMITED") ? "Trop de changements de titre. Réessaie dans une heure." : m.includes("NOT_EARNED") ? "Ce titre n’est pas encore gagné." : err?.code === "PGRST202" || m.includes("Could not find") ? "Les titres sont momentanément indisponibles." : "Modification non confirmée. Vérifie ta connexion, puis réessaie." });
        });
    }
    if (b.hasAttribute("data-delete")) return deleteAccount();
  }

  function onChange(e) {
    if (masteryNavigation.handle(e)) return renderMastery();
    const t = e.target;
    if (t.matches("[data-profile-metric-slot]")) {
      if (window.titanAccountTransition?.active || t.dataset.profileMetricOwner !== metricOwner()) return;
      const slot = Number(t.dataset.profileMetricSlot);
      const next = metricChoices().map((key, i) => i === slot ? t.value : key);
      if (!validMetrics(next)) return;
      try {
        localStorage.setItem(metricsKey(), JSON.stringify(next));
        render();
        root.querySelector(`[data-profile-metric-slot="${slot}"]`)?.focus({ preventScroll: true });
      } catch {
        window.titanShell.toast({ type: "warn", message: "Choix non enregistré. Réessaie avant de quitter cette page." });
      }
      return;
    }
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
          window.titanShell.toast({ type: "warn", message: err?.code === "PGRST202" || m.includes("Could not find") ? "Le profil public est momentanément indisponible." : "Modification non confirmée. Vérifie ta connexion, puis réessaie." });
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
  /* GAR-03: the return from Garmin lands here with ?garmin=<result>. Said once in words, then the address is cleaned. */
  const GARMIN_RESULTS = {
    ok: ["info", "Garmin : confirmation requise", "Connecte-toi à ton compte TITAN pour vérifier la liaison dans Sources et capteurs."],
    refused: ["warn", "Liaison annulée", "Tu as refusé l’accès sur l’écran Garmin : rien n’a été relié."],
    permission: ["warn", "Accès aux activités manquant", "Garmin n’a pas accordé l’accès aux activités : coche-le sur l’écran Garmin et réessaie."],
    conflict: ["warn", "Compte Garmin déjà relié", "Ce compte Garmin est déjà relié à un autre compte TITAN. Retire d’abord la liaison de l’autre compte."],
    consent: ["warn", "Autorisation manquante", "Autorise d’abord Garmin dans TITAN, puis recommence la liaison."],
    error: ["warn", "Liaison impossible", "La liaison avec Garmin n’a pas abouti. Réessaie dans un moment."],
  };
  const GARMIN_REASONS = {
    state: "Cette autorisation a expiré ou ne peut plus être vérifiée. Recommence depuis Sources et capteurs et termine sous dix minutes. Assistance : GARMIN_STATE.",
    code: "Le code d’autorisation Garmin manque. Recommence la connexion et termine tous les écrans Garmin. Assistance : GARMIN_CODE.",
    token: "L’échange d’autorisation Garmin a échoué. Recommence une fois. Si cela persiste, contacte l’assistance avec GARMIN_TOKEN.",
    identity: "Le compte Garmin n’a pas pu être identifié. Vérifie le compte connecté chez Garmin, puis réessaie. Assistance : GARMIN_IDENTITY.",
    permissions: "L’accès aux activités Garmin manque. Recommence et autorise les activités sur l’écran Garmin. Assistance : GARMIN_PERMISSIONS.",
    link: "La liaison n’a pas pu être enregistrée dans TITAN. Actualise Sources et capteurs avant de réessayer. Assistance : GARMIN_LINK.",
    storage: "L’autorisation n’a pas pu être enregistrée de façon sécurisée. Actualise Sources et capteurs avant de réessayer. Assistance : GARMIN_STORAGE.",
  };
  let garminReturnController = null;

  async function garminReturn() {
    const query = new URLSearchParams(location.search);
    const status = query.get("garmin");
    if (!status) return;
    const job = { context: bitsContext };
    if (status === "complete" && (guest() || !bitsCurrent(job) || !job.context.client)) return;
    const reason = query.get("garmin_reason");
    try { history.replaceState(null, "", location.pathname + location.hash); } catch { /* the notice still shows */ }
    const notice = ([type, title, message]) => window.titanShell?.toast?.({ type, title, message });
    const tellOutcome = (value, stage) => {
      if (value === "error" && Object.hasOwn(GARMIN_REASONS, stage)) {
        return notice(["warn", "Liaison Garmin à reprendre", GARMIN_REASONS[stage]]);
      }
      return notice(Object.hasOwn(GARMIN_RESULTS, value) ? GARMIN_RESULTS[value] : GARMIN_RESULTS.error);
    };
    if (status !== "ok" && status !== "complete") return tellOutcome(status, reason);

    if (guest() || !bitsCurrent(job) || !job.context.client) return notice(GARMIN_RESULTS.ok);
    let timer;
    try {
      const session = await readBitsSession(job);
      if (!bitsCurrent(job)) return;
      if (status === "complete") {
        const controller = new AbortController();
        garminReturnController = controller;
        const deadline = setTimeout(() => controller.abort(), 20_000);
        try {
          const completion = await fetch("/.netlify/functions/garmin?action=complete", { method: "POST", credentials: "same-origin", headers: { Authorization: `Bearer ${session.access_token}` }, signal: controller.signal });
          const result = await completion.json().catch(() => null);
          if (!bitsCurrent(job)) return;
          if (!completion.ok || result?.garmin !== "ok") return tellOutcome(result?.garmin, result?.garmin_reason);
        } finally {
          clearTimeout(deadline);
          if (garminReturnController === controller) garminReturnController = null;
        }
      }
      const response = await Promise.race([
        job.context.client.rpc("titan_garmin_status_v1").setHeader("Authorization", `Bearer ${session.access_token}`),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("GARMIN_STATUS_TIMEOUT")), 8000); }),
      ]);
      if (!bitsCurrent(job)) return;
      await readBitsSession(job);
      if (!bitsCurrent(job)) return;
      if (response.error || typeof response.data?.linked !== "boolean") throw new Error("GARMIN_STATUS_UNCONFIRMED");
      garminLinked = response.data.linked;
      garminDailiesAuthorized = garminLinked && response.data.dailies_authorized === true;
      render();
      notice(garminLinked
        ? ["ok", "Garmin relié", "Le serveur confirme la liaison. Tes prochaines séances Garmin arriveront dans ton journal."]
        : ["warn", "Liaison Garmin non confirmée", "Le serveur ne confirme aucune liaison. Ouvre Sources et capteurs, puis relance la connexion Garmin."]);
    } catch {
      if (bitsCurrent(job)) notice(["warn", "Liaison Garmin à vérifier", "La liaison n’a pas pu être vérifiée. Actualise Sources et capteurs avec une connexion réseau avant de recommencer."]);
    } finally {
      clearTimeout(timer);
    }
  }

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
    garminReturn();
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
  ["titan:account-changed", "titan:history-updated", "titan:adventure-updated", "titan:pending-changed"].forEach((ev) => window.addEventListener(ev, queue));
  window.addEventListener("hashchange", () => revealSection(location.hash, true));
  window.addEventListener("titan:account-changing", () => { garminReturnController?.abort(); avatarTask = null; exportTask = null; resetExportUi(); resetServerBits(); render(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
