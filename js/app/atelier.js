/* TITAN 300 — Atelier: personalise with credits earned by effort. Cosmetics only: the balance, what you own and
   what you wear come from the server (titan_atelier). TITAN+ adds content and comfort, never XP, credits or power. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const F = () => window.TitanFormat;
  const D = () => window.TitanData;
  const SLOTS = [
    { id: "frame", label: "Cadres", hint: "Autour de ton portrait : profil, barre de navigation, carte publique." },
    { id: "map", label: "Ambiances", hint: "La lumière de ta carte d’aventure." },
    { id: "card", label: "Cartes", hint: "Le style des cartes que tu partages." },
  ];
  const RANKS = { 6: "Sentinelle", 10: "Gardien", 15: "Champion", 25: "Titan", 40: "Légende" };
  const CHECKOUT_KEY = "titan_checkout_started_v3:";
  const activationPending = new Set();
  const activationNotified = new Map();
  const receiptLock = (owner, action) => navigator.locks?.request
    ? navigator.locks.request("titan_checkout_receipt:" + owner, () => action(true))
    : Promise.resolve(action(false));
  let loadSequence = 0;
  let catalogueRequest = null;
  const accountContext = () => ({ owner: window.state?.user?.id, client: window.titanClient, epoch: window.titanAccountTransition?.epoch });
  const accountCurrent = (c) => c.owner === window.state?.user?.id && c.client === window.titanClient
    && c.epoch === window.titanAccountTransition?.epoch && !window.titanAccountTransition?.active;

  let root = null;
  let data = null;
  let dataOwner = null;
  let loading = true;
  let error = "";
  let pending = false; // the server does not offer the Atelier yet
  let fallbackPlus = null; // TITAN+ status read from the profile while titan_atelier is missing
  let slot = "frame";
  let collection = "all";
  const guest = () => D().isGuest();
  const plusActive = () => (data?.plus ?? fallbackPlus)?.active === true;
  // Older servers have no permanence field; their credit purchases are already permanent.
  const permanent = (item) => typeof item.permanent === "boolean" ? item.permanent : item.owned && item.unlock !== "plus" && !item.plus_access;
  const missing = (e) => e?.code === "PGRST202" || String(e?.message || "").includes("Could not find");

  const messageOf = (e) => {
    const m = String(e?.message || "");
    if (missing(e)) return "L’Atelier est momentanément indisponible. Tes crédits sont intacts.";
    if (m.includes("NO_FUNDS")) return "Il te manque des crédits pour cette pièce. Ils viennent de tes séances.";
    if (m.includes("RATE_LIMITED")) return "Beaucoup d’achats en peu de temps. Réessaie dans un moment.";
    if (m.includes("PURCHASE_LIMIT_ONCE")) return "Cette pièce est déjà dans ta collection.";
    if (m.includes("NOT_FOR_SALE")) return "Cette pièce ne s’achète pas : elle se mérite par le rang ou vient avec TITAN+.";
    if (m.includes("NOT_OWNED")) return "Cette pièce n’est pas encore dans ta collection.";
    if (m.includes("ACCOUNT_SUSPENDED")) return "Ton compte est suspendu : l’Atelier est indisponible.";
    if (m === "ATELIER_TIMEOUT") return "Le serveur n’a pas répondu en 15 secondes. Réessaie dans un instant.";
    if (m.includes("ACCOUNT_CHANGED")) return "Le compte a changé. Rouvre l’Atelier.";
    return navigator.onLine ? "L’Atelier n’a pas répondu. Réessaie dans un instant." : "Hors ligne : l’Atelier revient avec le réseau.";
  };

  /** Credits a typical session of yours brings, from your recent sessions (estimate shown as such). */
  function creditsPerSession() {
    const recent = (window.state?.history || []).filter((l) => !l.archived_at && Number(l.xp) > 0).slice(-12);
    if (!recent.length) return 45;
    return Math.max(5, Math.round(recent.reduce((n, l) => n + Number(l.xp) * 0.1, 0) / recent.length));
  }

  function cancelCatalogue() {
    const job = catalogueRequest;
    if (!job) return;
    catalogueRequest = null;
    clearTimeout(job.timer);
    job.controller.abort();
  }

  function showLoading(userRetry) {
    const retry = root.querySelector("[data-retry]");
    const restoreFocus = userRetry && retry === document.activeElement;
    const progress = root.querySelector("[data-at-loading]") || document.createElement("p");
    progress.className = "asc-note";
    progress.dataset.atLoading = "";
    progress.setAttribute("role", "status");
    progress.tabIndex = -1;
    // The live status stays outside the busy placeholder/button.
    root.setAttribute("aria-busy", "false");
    root.querySelectorAll(".asc-skeleton").forEach(el => el.setAttribute("aria-busy", "true"));
    root.querySelector("[data-at-error]")?.setAttribute("hidden", "");
    if (!progress.isConnected) root.prepend(progress);
    progress.textContent = "Chargement de l’Atelier…";
    if (retry) {
      retry.disabled = true;
      retry.setAttribute("aria-busy", "true");
    }
    if (restoreFocus) progress.focus({ preventScroll: true });
    return progress;
  }

  function load(userRetry = false) {
    const context = accountContext(), { owner, client } = context;
    if (catalogueRequest && accountCurrent(catalogueRequest.context)) return catalogueRequest.done;
    cancelCatalogue();
    const request = ++loadSequence;
    if (dataOwner && dataOwner !== owner) { data = null; dataOwner = null; fallbackPlus = null; }
    if (guest() || !client || !accountCurrent(context)) {
      loading = false;
      render();
      return Promise.resolve();
    }
    const job = { context, request, controller: new AbortController(), timer: null, done: null };
    catalogueRequest = job;
    loading = !data;
    job.done = readCatalogue(job, userRetry);
    return job.done;
  }

  async function readCatalogue(job, userRetry) {
    const { context, request } = job, { owner, client } = context;
    const current = () => request === loadSequence && accountCurrent(context);
    const progress = !data ? showLoading(userRetry) : null;
    try {
      let query = client.rpc("titan_atelier");
      if (typeof query?.abortSignal === "function") query = query.abortSignal(job.controller.signal);
      const expiry = new Promise((resolve, reject) => {
        job.controller.signal.addEventListener("abort", () => reject(new Error("ATELIER_CANCELLED")), { once: true });
        job.timer = setTimeout(() => { reject(new Error("ATELIER_TIMEOUT")); job.controller.abort(); }, 15000);
      });
      const { data: d, error: e } = await Promise.race([Promise.resolve(query), expiry]);
      if (!current()) return;
      if (d?.owner && d.owner !== owner) return ownerChanged();
      if (e) throw e;
      data = d;
      dataOwner = owner;
      error = "";
      pending = false;
      syncUser();
      noteActivation(context);
    } catch (e) {
      if (!current()) return;
      error = messageOf(e);
      pending = missing(e);
    } finally {
      clearTimeout(job.timer);
      if (catalogueRequest === job) catalogueRequest = null;
    }
    loading = false;
    const restoreFocus = userRetry && progress && document.activeElement === progress;
    const focusedResult = renderOutcome(restoreFocus);
    if (!data && pending) await readPlusFromProfile(context, current).then(() => {
      if (current()) renderOutcome(focusedResult && document.activeElement === focusedResult);
    });
  }

  function renderOutcome(restoreFocus) {
    render();
    if (!restoreFocus) return null;
    const target = root.querySelector("[data-retry]") || root.querySelector("#collection h2") || root.querySelector("[data-at-notice]");
    if (target) {
      if (target.tagName !== "BUTTON") target.tabIndex = -1;
      target.focus({ preventScroll: true });
      // The collection now sits under the reserve and the dressing: the focused result is brought on screen, clear of both bars.
      const box = target.getBoundingClientRect();
      if (box.top < 72 || box.bottom > window.innerHeight - 96) target.scrollIntoView({ block: "center" });
    }
    return target;
  }

  function ownerChanged() {
    ++loadSequence;
    cancelCatalogue();
    data = null;
    dataOwner = null;
    fallbackPlus = null;
    loading = false;
    pending = false;
    error = messageOf(new Error("ACCOUNT_CHANGED"));
    render();
  }

  /** Before the server update, TITAN+ status still comes from the profile the payment webhook writes (read only). */
  async function readPlusFromProfile(context, current) {
    const { owner, client } = context;
    try {
      const { data: p } = await client.from("profiles").select("is_elite, elite_renews_at, elite_ends_at, elite_refunded_at").eq("id", owner).maybeSingle();
      if (!p || !current()) return;
      fallbackPlus = { active: p.is_elite === true && !p.elite_refunded_at && (!p.elite_ends_at || Date.parse(p.elite_ends_at) > Date.now()), renews_at: p.elite_renews_at, ends_at: p.elite_ends_at };
      if (window.state?.user) window.state.user.is_elite = fallbackPlus.active;
      noteActivation(context);
    } catch {}
  }

  /** The server is the truth: mirror balance, status and look into the local state the shell reads. */
  function syncUser() {
    const u = window.state?.user;
    if (!u || !data || u.id !== dataOwner) return;
    u.credits = Number(data.credits) || 0;
    u.is_elite = plusActive();
    u.appearance = data.appearance || {};
    window.titanApplyAtelierAppearance?.(data, u.id);
    window.titanShell?.refresh?.();
  }

  /** A browser receipt is attribution only. The fresh server status grants access; an analytics ack consumes the receipt. */
  async function noteActivation(context) {
    if (!accountCurrent(context)) return;
    const key = CHECKOUT_KEY + context.owner;
    if (activationPending.has(key)) return;
    activationPending.add(key);
    try {
      const pending = await receiptLock(context.owner, writable => {
        if (!accountCurrent(context)) return;
        // The old timestamp has no owner and cannot be migrated safely between accounts.
        if (writable) { try { localStorage.removeItem("titan_checkout_started_v1"); } catch {} }
        // v2 has no preference snapshot; keep its functional confirmation, never infer analytics consent.
        let storedKey = key, raw = localStorage.getItem(key);
        const previousKey = "titan_checkout_started_v2:" + context.owner;
        if (!raw) { storedKey = previousKey; raw = localStorage.getItem(previousKey); }
        if (!raw) return;
        const removeCurrent = () => {
          if (writable && accountCurrent(context) && localStorage.getItem(storedKey) === raw) {
            localStorage.removeItem(storedKey);
            activationNotified.delete(storedKey);
          }
        };
        let receipt;
        try { receipt = JSON.parse(raw); } catch {}
        const now = Date.now();
        if (!receipt || ![2, 3].includes(receipt.v) || receipt.owner !== context.owner || !Number.isSafeInteger(receipt.at)
          || receipt.at <= 0 || receipt.at > now || now - receipt.at >= 3 * 86400000 || typeof receipt.notified !== "boolean") {
          removeCurrent();
          return;
        }
        if (!plusActive()) return;
        if (!receipt.notified) {
          if (localStorage.getItem(storedKey) !== raw) return;
          const alreadyNotified = activationNotified.get(storedKey) === raw;
          activationNotified.set(storedKey, raw);
          if (writable) {
            receipt.notified = true;
            const notifiedRaw = JSON.stringify(receipt);
            try { localStorage.setItem(storedKey, notifiedRaw); raw = notifiedRaw; } catch {}
          }
          if (!alreadyNotified) window.titanShell?.toast({ type: "ok", title: "TITAN+ est actif", message: "Merci. Les avantages TITAN+ sont actifs. Les campagnes restent gratuites." });
        }
        // Without cross-tab locking, keep confirmation read-only and do not measure an unprotected receipt.
        if (!writable) return;
        // Refusal does not prevent the functional confirmation or create a later analytics replay.
        const preferenceCurrent = () => typeof receipt.consent === "string" && receipt.consent === window.TitanAnalytics?.consentSnapshot?.();
        if (receipt.v !== 3 || !preferenceCurrent() || window.TitanAnalytics?.consent() === "denied") {
          removeCurrent();
          return;
        }
        return { raw, consent: receipt.consent };
      });
      if (pending && accountCurrent(context)) {
        // Network/token preparation never holds the receipt lock.
        const accepted = await window.TitanAnalytics?.track("premium_activated", { source: "atelier" });
        await receiptLock(context.owner, writable => {
          if (writable && accountCurrent(context)
            && (accepted === true || pending.consent !== window.TitanAnalytics?.consentSnapshot?.() || window.TitanAnalytics?.consent() === "denied")
            && localStorage.getItem(key) === pending.raw) {
            localStorage.removeItem(key);
            activationNotified.delete(key);
          }
        });
      }
    } catch {} finally { activationPending.delete(key); }
  }

  /* ---------- Pieces: state, collections, pictures ---------- */
  const avatar = () => window.titanShell?.user?.().avatar || "scout";
  const credits = () => Number(data?.credits) || 0;
  const plural = (n, word) => `${F().number(n)} ${word}${n > 1 ? "s" : ""}`;
  const isWorn = (item) => (data.appearance || {})[item.slot] === item.cosmetic || (!data.appearance?.[item.slot] && item.unlock === "default");
  /** worn · owned (kept for good) · lent (TITAN+ lends it while active) · locked. */
  const stateOf = (item) => (isWorn(item) ? "worn" : permanent(item) ? "owned" : item.owned ? "lent" : "locked");
  const wornItem = (s) => (data.items || []).find((i) => i.slot === s && i.cosmetic === (data.appearance || {})[s]) || (data.items || []).find((i) => i.slot === s && i.unlock === "default");

  /* A collection is named after the real way its pieces are obtained (the server's `unlock`), never after a theme. */
  const GROUPS = [
    { id: "default", title: "D’origine", note: "Incluses dès le départ, toujours à toi." },
    { id: "credits", title: "Forgées à l’effort", note: "Tes crédits les acquièrent pour toujours." },
    { id: "rank", title: "Remises au rang", note: "Hors commerce : chacune arrive avec son rang, et reste." },
    { id: "parade", title: "Pièces d’apparat", note: "Les plus rares de l’Atelier. Tes crédits les acquièrent pour toujours ; TITAN+ les prête tant qu’il est actif." },
    { id: "plus", title: "Incluses avec TITAN+", note: "Pour l’instant liées à TITAN+. La mise à jour du catalogue les ouvrira aussi à tes crédits." },
  ];
  const groupOf = (item) => (item.unlock === "credits" ? (item.plus_access ? "parade" : "credits") : GROUPS.some((g) => g.id === item.unlock) ? item.unlock : "credits");

  function preview(item, world = "valley") {
    if (item.slot === "frame")
      return `<span class="at-portrait" data-frame="${esc(item.cosmetic)}"><img src="/assets/renaissance/${esc(avatar())}-s.webp" alt="" width="96" height="96" loading="lazy"></span>`;
    if (item.slot === "map") return `<span class="at-map" data-ambiance="${esc(item.cosmetic)}"><img src="/assets/renaissance/${esc(world)}-small.webp" alt="" width="160" height="100" loading="lazy"><i></i><i></i><i></i></span>`;
    // A picture of the card style with example figures: hidden from assistive technology, which would read them as the user's data
    // (the control around it already names the piece).
    return `<span class="at-card" data-card="${esc(item.cosmetic)}" aria-hidden="true"><small>Course à pied · record</small><b>10 km · 47:12</b><em>TITAN</em></span>`;
  }

  /* The state, in words and in shape (never by colour alone). */
  function stateChip(item) {
    const st = stateOf(item);
    if (st === "worn") return `<span class="sig-state is-worn">${icon("check")} Porté</span>`;
    if (st === "owned") return `<span class="sig-state is-owned">Acquis</span> <span class="at-tenure">définitivement</span>`;
    if (st === "lent") return `<span class="sig-state is-rare">${icon("crown")} Prêt TITAN+</span>`;
    if (item.unlock === "rank") return `<span class="sig-state is-locked">${icon("lock")} Niveau ${esc(item.min_level)}</span>`;
    if (item.unlock === "plus") return `<span class="sig-state is-rare">${icon("crown")} TITAN+</span>`;
    return `<span class="sig-state is-locked">${icon("lock")} <span class="asc-num">${F().number(item.price)}</span> crédits</span>`;
  }

  /* How the piece is held, or the real path to it with the real progress. */
  function pathHtml(item) {
    const st = stateOf(item);
    const level = Number(data.level) || 1;
    if (st === "lent") return `<p class="at-path">Accès temporaire TITAN+</p>${item.unlock === "credits" ? `<p class="at-path is-faint"><span class="asc-num">${F().number(item.price)}</span> crédits pour la garder</p>` : ""}`;
    if (st === "worn") return `<p class="at-path">${item.unlock === "default" ? "Style d’origine" : "Acquis définitivement"}</p>`;
    if (st === "owned") return item.unlock === "default" ? `<p class="at-path">Style d’origine</p>` : item.unlock === "rank" ? `<p class="at-path">Rang ${esc(RANKS[item.min_level] || `niveau ${item.min_level}`)} atteint</p>` : "";
    if (item.unlock === "rank") {
      const left = Math.max(1, item.min_level - level);
      return `<span class="asc-ascent thin" role="progressbar" aria-label="Niveau ${level} sur ${esc(item.min_level)}" aria-valuemin="0" aria-valuemax="${esc(item.min_level)}" aria-valuenow="${Math.min(level, item.min_level)}"><span style="--p:${Math.round(Math.min(1, level / item.min_level) * 100)}%"></span></span>
        <p class="at-path">Rang ${esc(RANKS[item.min_level] || `niveau ${item.min_level}`)} · encore ${left} niveau${left > 1 ? "x" : ""}</p>`;
    }
    if (item.unlock === "plus") return `<p class="at-path">Accès inclus avec TITAN+ pour l’instant</p>`;
    const short = item.price - credits();
    if (short <= 0) return `<p class="at-path is-ready">Ta réserve suffit</p>`;
    const sessions = Math.ceil(short / creditsPerSession());
    return `<span class="asc-ascent thin" role="progressbar" aria-label="${F().number(credits())} crédits sur ${F().number(item.price)}" aria-valuemin="0" aria-valuemax="${esc(item.price)}" aria-valuenow="${credits()}"><span style="--p:${Math.round(Math.min(1, credits() / item.price) * 100)}%"></span></span>
      <p class="at-path">Encore ${F().number(short)} crédits · environ ${sessions} séance${sessions > 1 ? "s" : ""} à ton rythme actuel.</p>`;
  }

  function action(item) {
    const worn = isWorn(item);
    const canRemove = worn && item.unlock !== "default" && (data.items || []).some((i) => i.slot === item.slot && i.unlock === "default" && i.owned);
    const wear = worn ? (canRemove ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-remove="${esc(item.slot)}" aria-label="Retirer ${esc(item.name)}">Retirer</button>` : "") : item.owned ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-wear="${esc(item.id)}" aria-label="Porter ${esc(item.name)}">Porter</button>` : "";
    if (item.unlock === "credits" && !permanent(item)) {
      const keep = item.price > credits() ? "" : `<button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-buy="${esc(item.id)}" aria-label="${item.owned ? "Garder la pièce" : "Débloquer"} ${esc(item.name)}">${item.owned ? "Garder la pièce" : "Débloquer"}</button>`;
      return wear + keep;
    }
    if (wear) return wear;
    if (item.unlock === "plus" && !item.owned) return `<a class="asc-btn asc-btn-ghost asc-btn-sm" data-goto-plus href="/titan-plus">TITAN+</a>`;
    return "";
  }

  /* A piece is an object on its plate: the picture is the « essayer » control, the body says how it is held and what to do. */
  function itemHtml(item) {
    const st = stateOf(item);
    const act = action(item);
    return `<article class="at-item sig-plate" id="at-piece-${esc(item.id)}" data-piece="${esc(item.id)}" data-state="${st}" data-owned="${item.owned}" data-unlock="${esc(item.unlock)}">
      <button type="button" class="at-try" data-preview="${esc(item.id)}" aria-label="Essayer ${esc(item.name)}"><span class="at-preview">${preview(item)}</span><span class="at-try-tag" aria-hidden="true">${icon("eye")} Essayer</span></button>
      <div class="at-body"><div class="at-head"><h4 class="at-name">${esc(item.name)}</h4><p class="at-status">${stateChip(item)}</p></div>
        ${pathHtml(item)}
        ${act ? `<div class="at-action">${act}</div>` : ""}</div></article>`;
  }

  /* ---------- Sections ---------- */
  const chest = (sizes) => `<span class="sig-object is-float at-chest" aria-hidden="true"><img src="/assets/objects/coffre-tactique-256.webp" srcset="/assets/objects/coffre-tactique-256.webp 256w, /assets/objects/coffre-tactique-512.webp 512w" sizes="${sizes}" width="256" height="256" alt="" decoding="async"></span>`;

  /* The reserve: credits are something earned and kept, with where they come from and what they reach. */
  function walletHtml() {
    const cap = Number(data?.week_credit_cap) || 960;
    const week = Number(data?.week_credits) || 0;
    const open = (data.items || []).filter((i) => i.unlock === "credits" && !permanent(i));
    const reach = open.filter((i) => i.price <= credits());
    const next = open.filter((i) => i.price > credits()).sort((a, b) => a.price - b.price)[0];
    const worth = reach.length ? `${reach.length === 1 ? "Une pièce est" : `${reach.length} pièces sont`} à ta portée dès maintenant.`
      : next ? `Encore ${F().number(next.price - credits())} crédits avant ${esc(next.name)}.`
      : open.length ? "" : "Toutes les pièces à crédits sont déjà à toi.";
    const recent = (window.state?.history || []).some((l) => !l.archived_at && Number(l.xp) > 0);
    return `<section class="at-reserve at-wallet sig-plate is-relief is-cyan" aria-labelledby="at-reserve-title">
      ${chest("(min-width: 760px) 176px, 112px")}
      <div class="at-wallet-main"><h2 class="asc-eyebrow cy" id="at-reserve-title">Ta réserve</h2>
        <p class="at-figure"><span class="at-balance asc-num">${F().number(credits())}</span> <span class="at-unit">crédits gagnés à l’effort</span></p>
        ${worth ? `<p class="at-worth">${worth}</p>` : ""}</div>
      <p class="asc-small asc-muted at-copy">Une seule monnaie, gagnée en t’entraînant : 10 % de l’XP de chaque séance. Elle ne s’achète pas.</p>
      <div class="at-week"><div class="asc-between"><span class="asc-small">Gagnés cette semaine</span><span class="asc-small asc-num">${F().number(week)} / ${F().number(cap)}</span></div>
        <span class="asc-ascent thin" role="progressbar" aria-label="Crédits gagnés cette semaine" aria-valuemin="0" aria-valuemax="${cap}" aria-valuenow="${Math.min(week, cap)}"><span style="--p:${Math.round(Math.min(1, week / cap) * 100)}%"></span></span>
        <p class="asc-small asc-faint">${week >= cap ? "Plafond de la semaine atteint. " : ""}Le même plafond pour tout le monde, abonné ou non.</p>
        <details class="at-sources"><summary>D’où viennent tes crédits</summary>
          <ul><li>${icon("bolt")}<span><strong>Chaque séance confirmée</strong> : 10 % de son XP, jusqu’à ${F().number(cap)} crédits par semaine.${recent ? ` Une séance comme les tiennes en rapporte environ ${F().number(creditsPerSession())}.` : ""}</span></li>
            <li>${icon("calendar")}<span><strong>Une semaine tenue</strong> : 50 crédits, une fois par semaine, à réclamer dans l’application Android lorsqu’elle le propose.</span></li>
            <li>${icon("close")}<span><strong>Jamais autrement</strong> : ni paiement, ni TITAN+, ni publicité ne remplit la réserve.</span></li></ul></details></div></section>`;
  }

  /* The next three pieces within reach, so the reward ahead is always visible (credits or rank, never a purchase). */
  function upcomingHtml() {
    const level = Number(data.level) || 1;
    const perSession = creditsPerSession();
    const rows = (data.items || [])
      .filter((i) => !permanent(i) && ((i.unlock === "credits" && Number.isFinite(Number(i.price))) || (i.unlock === "rank" && Number.isFinite(Number(i.min_level)) && Number(i.min_level) > level)))
      .map((i) => {
        if (i.unlock !== "credits") return { item: i, order: 1000 + i.min_level - level, text: `Au niveau ${i.min_level} (rang ${RANKS[i.min_level] || i.min_level}), encore ${i.min_level - level} niveau${i.min_level - level > 1 ? "x" : ""}.` };
        const need = Math.max(0, Math.ceil((i.price - credits()) / perSession));
        return { item: i, order: need, text: i.price <= credits() ? "Tu peux le débloquer maintenant." : `Environ ${need} séance${need > 1 ? "s" : ""} à ton rythme actuel.` };
      })
      .sort((a, b) => a.order - b.order || (Number(a.item.price) || 0) - (Number(b.item.price) || 0))
      .slice(0, 3);
    if (!rows.length) return "";
    return `<section class="asc-section at-reach" id="a-venir" data-upcoming aria-labelledby="at-reach-title"><div class="asc-section-head"><h2 id="at-reach-title">Prochaines récompenses</h2><span class="asc-small asc-muted">Estimations</span></div>
      <ul class="at-reach-list">${rows.map(({ item, text }) => `<li><button type="button" class="at-reach-row" data-goto-piece="${esc(item.id)}"><span class="at-reach-prev">${preview(item)}</span><span class="at-reach-text"><strong>${esc(item.name)}</strong><span class="asc-small asc-muted">${esc(text)}</span></span>${icon("chevron")}</button></li>`).join("")}</ul></section>`;
  }

  /* What I wear, as others see it: the three surfaces at their real proportions. Each one opens its shelf. */
  const lookSlotInner = (s, it, trying) => `<span class="at-look-prev">${preview(it)}</span><span class="at-look-text"><small>${esc(s.label.slice(0, -1))}${trying ? ` · <b class="at-look-trial">essai</b>` : ""}</small><strong>${esc(it.name)}</strong></span><span class="at-look-go" aria-hidden="true">${icon("chevron")}</span>`;
  function lookHtml() {
    const level = Number(data.level) || 1;
    const rank = window.TitanEffort?.rank?.(level)?.name;
    return `<section class="asc-section at-dressing" id="tenue" aria-labelledby="at-dressing-title"><div class="asc-section-head"><h2 id="at-dressing-title">Ce que tu portes</h2><span class="asc-small asc-muted">Niveau ${level}${rank ? ` · ${esc(rank)}` : ""}</span></div>
      <div class="at-look">${SLOTS.map((s) => {
        const it = wornItem(s.id);
        return it ? `<button type="button" class="at-look-slot" data-slot="${s.id}" data-look="${s.id}" aria-label="${esc(s.label.slice(0, -1))} porté : ${esc(it.name)}. Voir les ${esc(s.label.toLowerCase())}">${lookSlotInner(s, it, false)}</button>` : "";
      }).join("")}</div>
      <p class="asc-small asc-faint at-look-note" data-look-note>Touche une pièce pour ouvrir son rayon. « Essayer » la montre sur toi sans rien enregistrer.</p></section>`;
  }

  /* Wide screens: pointing at a plate (or reaching it with the keyboard) shows the piece on the stage. Nothing is saved, nothing is
     sent: leaving the plate puts back what is really worn. */
  const stageTrial = () => window.matchMedia?.("(min-width: 1100px)").matches === true;
  let trial = null;
  function paintLook(item) {
    if (!root || !data || (item ? item.id : null) === trial) return;
    trial = item ? item.id : null;
    const s = item ? SLOTS.find((x) => x.id === item.slot) : null;
    root.querySelectorAll("[data-look]").forEach((b) => {
      const meta = SLOTS.find((x) => x.id === b.dataset.look);
      const worn = wornItem(meta.id);
      const shown = s && s.id === meta.id ? item : worn;
      if (!shown) return;
      const trying = shown !== worn;
      if ((b.dataset.trial || "") === (trying ? shown.id : "")) return;
      b.dataset.trial = trying ? shown.id : "";
      if (!trying) delete b.dataset.trial;
      b.innerHTML = lookSlotInner(meta, shown, trying);
    });
    const note = root.querySelector("[data-look-note]");
    if (note) note.textContent = trial ? "Essai : rien n’est enregistré. Quitte la pièce pour revenir à ce que tu portes." : "Touche une pièce pour ouvrir son rayon. « Essayer » la montre sur toi sans rien enregistrer.";
  }
  function onTrial(e) {
    if (!data || !stageTrial()) return;
    const leaving = e.type === "mouseout" || e.type === "focusout";
    const plate = e.target.closest?.(".at-item");
    if (!plate || !root.contains(plate)) return;
    if (leaving) {
      if (!plate.contains(e.relatedTarget)) paintLook(null);
      return;
    }
    const item = data.items?.find((i) => i.id === plate.dataset.piece);
    if (item) paintLook(item);
  }

  function shelfHtml() {
    const catalog = data.items || [];
    const items = catalog.filter((i) => i.slot === slot && (collection === "all" || (collection === "owned" ? permanent(i) : !permanent(i))));
    const meta = SLOTS.find((s) => s.id === slot);
    const acquired = catalog.filter(permanent).length;
    const borrowed = catalog.filter((i) => i.owned && !permanent(i)).length;
    const groups = GROUPS.map((g) => ({ ...g, items: items.filter((i) => groupOf(i) === g.id) })).filter((g) => g.items.length);
    const empty = collection === "owned" ? ["Rien d’acquis dans ce rayon", "Aucune pièce acquise dans cette catégorie. Découvre ce que tu peux viser dans « À débloquer ».", "locked", "Voir ce qui reste à débloquer"]
      : collection === "locked" ? ["Rayon complet", "Tu as acquis toutes les pièces de cette catégorie.", "all", "Revoir toutes les pièces"]
      : ["Rayon vide", "Aucune pièce dans cette catégorie pour le moment.", "", ""];
    return `<section class="asc-section at-shelf" id="collection"><div class="asc-section-head"><h2>Collection</h2><span class="asc-small asc-muted">${acquired} / ${catalog.length} acquises${borrowed ? ` · ${borrowed} accès TITAN+` : ""}</span></div>
      <div class="asc-seg at-tabs" role="tablist" aria-label="Type de pièce">${SLOTS.map((s) => `<button type="button" role="tab" id="at-tab-${s.id}" data-slot="${s.id}" aria-controls="at-panel-${s.id}" aria-selected="${s.id === slot}" tabindex="${s.id === slot ? 0 : -1}">${esc(s.label)}</button>`).join("")}</div>
      <div id="at-panel-${slot}" role="tabpanel" aria-labelledby="at-tab-${slot}" tabindex="0">
      <div class="at-filters" role="group" aria-label="Filtrer la collection">${[["all", "Tout"], ["owned", "Acquis"], ["locked", "À débloquer"]].map(([id, label]) => `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-collection="${id}" aria-pressed="${collection === id}">${label}</button>`).join("")}</div>
      <p class="asc-small asc-muted at-hint">${esc(meta.hint)}</p>
      ${collection === "owned" ? `<p class="asc-small asc-faint">Tes pièces acquises restent disponibles sans TITAN+. Les accès temporaires sont dans « Tout ».</p>` : ""}
      ${groups.length ? groups.map((g) => `<div class="at-group" data-group="${g.id}" id="at-group-${g.id}"><div class="at-group-head"><h3>${esc(g.title)}</h3><p class="asc-small asc-muted">${esc(g.note)}</p></div><div class="at-grid">${g.items.map(itemHtml).join("")}</div></div>`).join("")
        : `<div class="sig-empty at-empty" data-collection-empty>${icon(collection === "locked" ? "check" : "sparkle")}<h3>${empty[0]}</h3><p>${empty[1]}</p>${empty[2] ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-collection-go="${empty[2]}">${empty[3]}</button>` : ""}</div>`}</div>
      ${SLOTS.filter(s => s.id !== slot).map(s => `<div id="at-panel-${s.id}" role="tabpanel" aria-labelledby="at-tab-${s.id}" tabindex="-1" hidden></div>`).join("")}</section>`;
  }

  /* What no credit reaches: the rank, the worlds of the Aventure and the level decide. Real counts, real next step, and the page
     where each one is worn. Nothing here is for sale and nothing is promised beyond what the account can really reach. */
  function meritHtml() {
    const level = Number(data.level) || 1;
    const plates = [];
    const rankPieces = (data.items || []).filter((i) => i.unlock === "rank").sort((a, b) => a.min_level - b.min_level);
    if (rankPieces.length && window.TitanCrest) {
      const got = rankPieces.filter((i) => i.owned).length;
      const next = rankPieces.find((i) => !i.owned);
      plates.push(`<article class="at-merit sig-plate is-relief"><span class="sig-object at-merit-obj" aria-hidden="true">${window.TitanCrest.svg(window.TitanCrest.rankIdOf(level), 96)}</span>
        <div class="at-merit-body"><h3>Par le rang</h3><p class="at-merit-count"><span class="asc-num">${got}</span> / ${rankPieces.length} cadres remis</p>
        <p class="asc-small asc-muted">${next ? `Prochain : ${esc(next.name)}, au niveau ${esc(next.min_level)} (encore ${Math.max(1, next.min_level - level)} niveau${next.min_level - level > 1 ? "x" : ""}).` : "Tous les cadres de rang sont à toi."}</p>
        <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-goto-group="rank">Voir les cadres de rang</button></div></article>`);
    }
    const snap = window.TitanAdventure?.snapshot;
    const worlds = window.TitanCodex?.worlds || [];
    if (snap && snap.owner === window.state?.user?.id && worlds.length) {
      const rewards = snap.rewards || [];
      const total = worlds.reduce((n, w) => n + (w.chapters?.length || 9), 0);
      plates.push(`<article class="at-merit sig-plate is-relief"><span class="sig-object at-merit-obj" aria-hidden="true"><img src="/assets/objects/sceau-exploration-256.webp" width="256" height="256" alt="" loading="lazy" decoding="async"></span>
        <div class="at-merit-body"><h3>Par l’aventure</h3><p class="at-merit-count"><span class="asc-num">${rewards.length}</span> / ${total} insignes</p>
        <ul class="at-worlds">${worlds.map((w) => { const n = rewards.filter((r) => r.world === w.id).length, of = w.chapters?.length || 9; return `<li><span>${esc(w.name)}</span><span class="asc-num">${n} / ${of}</span><span class="asc-ascent thin" aria-hidden="true"><span style="--p:${Math.round((n / of) * 100)}%"></span></span></li>`; }).join("")}</ul>
        <p class="asc-small asc-muted">Un insigne par chapitre terminé. Chacun se porte comme titre sur ton passeport.</p>
        <div class="asc-row-flex"><a class="asc-btn asc-btn-secondary asc-btn-sm" href="/profile#collection">Choisir mon titre</a><a class="asc-btn asc-btn-ghost asc-btn-sm" href="/adventure">Ouvrir l’Aventure</a></div></div></article>`);
    }
    const avatars = window.TitanCodex?.avatars || [];
    if (avatars.length) {
      const open = avatars.filter((a) => a.level <= level).length;
      const next = avatars.filter((a) => a.level > level).sort((a, b) => a.level - b.level)[0];
      plates.push(`<article class="at-merit sig-plate is-relief"><span class="at-merit-faces" aria-hidden="true">${avatars.slice(0, 6).map((a) => `<img src="/assets/renaissance/${esc(a.id)}-s.webp" width="64" height="64" alt="" loading="lazy" decoding="async"${a.level > level ? ' class="is-locked"' : ""}>`).join("")}</span>
        <div class="at-merit-body"><h3>Par le niveau</h3><p class="at-merit-count"><span class="asc-num">${open}</span> / ${avatars.length} personnages</p>
        <p class="asc-small asc-muted">${next ? `Prochain : ${esc(next.name)}, au niveau ${esc(next.level)}.` : "Tous les personnages sont ouverts."}</p>
        <a class="asc-btn asc-btn-secondary asc-btn-sm" href="/profile#personnage">Choisir mon personnage</a></div></article>`);
    }
    if (!plates.length) return "";
    return `<section class="asc-section at-merits" id="merite" aria-labelledby="at-merit-title"><div class="asc-section-head"><h2 id="at-merit-title">Ce qui se mérite</h2><span class="asc-small asc-muted">Hors crédits</span></div>
      <div class="at-merit-grid">${plates.join("")}</div></section>`;
  }

  function plusHtml() {
    const p = data?.plus || fallbackPlus || { active: false };
    const date = (v) => new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    const support = window.TITAN_EXTERNAL_URLS?.supportEmail || "titanteam.app@gmail.com";
    const never = `<ul class="at-never"><li>${icon("close")} Pas d’XP en plus</li><li>${icon("close")} Pas de crédits en plus</li><li>${icon("close")} Pas de plafond relevé</li><li>${icon("close")} Pas d’avance sur les gardiens ni les classements</li></ul>`;
    if (p.active)
      return `<section class="at-plus is-active sig-plate is-relief is-amber" id="plus"><p class="asc-eyebrow am">${icon("crown")} TITAN+ actif</p><h2 class="asc-h2">Ton accès TITAN+.</h2>
        <p class="asc-small asc-muted">${p.ends_at ? `Accès jusqu’au ${esc(date(p.ends_at))}.` : p.renews_at ? `Prochain renouvellement le ${esc(date(p.renews_at))}.` : "Ton accès TITAN+ est actif."}</p>
        <ul class="at-includes"><li>${icon("layers")} 20 routines nommées</li><li>${icon("group")} Espace coach : 20 sportifs suivis avec TITAN+ seul ; 5 ou 15 avec une offre Coach</li><li>${icon("sparkle")} Accès temporaire à 4 pièces, aussi gagnables avec tes crédits</li></ul>
        <a class="asc-btn asc-btn-secondary" href="/titan-plus#concret">Voir les bénéfices en détail ${icon("arrow")}</a>
        <p class="asc-small asc-faint">Un accès actif peut être offert, de test ou inclus par un coach : il ne prouve pas un paiement. Pour un abonnement, utilise le prestataire indiqué sur ton reçu ; les <a href="/legal_cgu">conditions d’utilisation</a> expliquent la résiliation et les remboursements. Pour une aide : écris à <a href="mailto:${esc(support)}">${esc(support)}</a>. Ton journal, tes insignes et tes crédits restent à toi.</p></section>`;
    return `<section class="at-plus sig-plate is-relief is-amber" id="plus"><p class="asc-eyebrow am">${icon("crown")} TITAN+</p><h2 class="asc-h2">Plus de confort pour ta pratique.</h2>
      <ul class="at-includes"><li>${icon("layers")} <span><strong>20 routines</strong> nommées au lieu de 5</span></li><li>${icon("group")} <span><strong>20 sportifs</strong> suivis avec TITAN+ seul ; 5 ou 15 avec une offre Coach</span></li><li>${icon("sparkle")} <span><strong>Accès temporaire à 4 pièces</strong> : Aegis, Givre, Aurores, Obsidienne, aussi gagnables avec tes crédits</span></li></ul>
      ${never}
      <a class="asc-btn asc-btn-secondary" href="/titan-plus#concret">Voir les bénéfices en détail ${icon("arrow")}</a>
      ${pending && !data ? `<p class="asc-small asc-faint">Le catalogue et ses conditions d’acquisition s’afficheront dès que l’Atelier répond.</p>` : ""}
      ${playBillingOffered() ? `<div class="at-plus-cta"><button type="button" class="asc-btn asc-btn-primary" data-play-checkout ${guest() ? "disabled" : ""}>${icon("crown")} Passer à TITAN+ avec Google Play</button><span class="asc-small asc-muted" data-play-price>Prix et résiliation affichés par Google Play avant paiement.</span></div>` : window.TITAN_PAYMENTS?.webCheckout === true && !window.titanInAndroidApp?.() ? `<div class="at-plus-cta"><button type="button" class="asc-btn asc-btn-primary" data-checkout ${guest() ? "disabled" : ""}>${icon("crown")} Passer à TITAN+</button><span class="asc-small asc-muted">Prix final, période, taxes et résiliation affichés par le prestataire de paiement avant paiement.</span></div>` : `<p class="asc-note">${icon("info")}<span>TITAN+ s’achète uniquement dans l’application Android, avec Google Play. Aucun paiement n’est proposé sur le site.</span></p>`}
      ${guest() && (playBillingOffered() || window.TITAN_PAYMENTS?.webCheckout === true) ? `<p class="asc-small asc-faint">Un compte est nécessaire : l’abonnement se rattache à ton profil.</p>` : ""}
      <p class="asc-small asc-faint">Le journal, les records, les objectifs, l’analyse, les quatre campagnes et la Communauté restent gratuits, sans limite de durée.</p></section>`;
  }

  function render() {
    if (!root) return;
    const focusedSlot = root.contains(document.activeElement) ? document.activeElement.closest('[role="tab"][data-slot]')?.dataset.slot : null;
    trial = null;
    if (guest()) {
      root.innerHTML = `<section class="at-reserve at-wallet at-guest sig-plate is-relief is-cyan">${chest("(min-width: 760px) 176px, 112px")}<div class="at-wallet-main"><p class="asc-eyebrow cy">Atelier</p><h2 class="cm-exp-title">Ton style se gagne à l’effort.</h2>
          <p class="asc-lead">Chaque séance rapporte des crédits. Ils débloquent des cadres, des ambiances de carte et des styles de cartes partageables. Rien ici ne change ta progression.</p>
          <div class="asc-row-flex"><a class="asc-btn asc-btn-primary" href="/login">Créer un compte</a><a class="asc-btn asc-btn-ghost" href="/titan-plus">TITAN+</a></div></div></section>
        ${plusHtml()}`;
      root.setAttribute("aria-busy", "false");
      return;
    }
    if (loading) return;
    if (!data) {
      root.innerHTML = `<p class="asc-small asc-muted" data-at-loading role="status" tabindex="-1"></p><p data-at-notice ${pending ? "" : 'data-at-error role="alert"'} class="asc-note${pending ? "" : " err"}">${icon(pending ? "info" : "alert")}<span>${esc(error)}</span></p>${pending ? "" : `<button type="button" class="asc-btn asc-btn-secondary" data-retry>Réessayer</button>`}${plusHtml()}`;
      root.setAttribute("aria-busy", "false");
      return;
    }
    // One piece to dress with, one reserve to spend: what I own first, then what I wear next to the shelves, then what no credit reaches.
    root.innerHTML = `${error ? `<p class="asc-note err">${icon("alert")}<span>${esc(error)}</span></p>` : ""}
      <div class="at-top">${walletHtml()}${upcomingHtml()}</div>
      <div class="at-floor">${lookHtml()}${shelfHtml()}</div>
      ${meritHtml()}${plusHtml()}
      <p class="asc-small asc-faint at-foot">Tous les styles du catalogue se gagnent gratuitement par les crédits ou le rang. Une pièce acquise avec tes crédits reste à toi après la fin de TITAN+. L’accès inclus par l’abonnement est temporaire : seules les pièces encore non acquises reviennent au style d’origine.</p>
      ${(data.items || []).some((i) => i.unlock === "plus") ? `<p class="asc-note">${icon("info")}<span>Mise à jour du catalogue en attente : les pièces encore marquées TITAN+ deviendront aussi accessibles avec tes crédits d’activité.</span></p>` : ""}`;
    root.setAttribute("aria-busy", "false");
    // The first frame may animate its bars; a redraw after an action never replays them.
    requestAnimationFrame(() => root.classList.add("is-live"));
    if (focusedSlot) {
      root.querySelectorAll('.at-tabs [role="tab"]').forEach(tab => { tab.tabIndex = tab.dataset.slot === focusedSlot ? 0 : -1; });
      root.querySelector(`[role="tab"][data-slot="${focusedSlot}"]`)?.focus({ preventScroll: true });
    }
  }

  function onTabKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tab = e.target.closest('[role="tab"][data-slot]');
    if (!tab || !root.contains(tab)) return;
    const tabs = [...root.querySelectorAll('.at-tabs [role="tab"]')], index = tabs.indexOf(tab);
    const next = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    e.preventDefault();
    tabs.forEach((button, i) => { button.tabIndex = i === next ? 0 : -1; });
    tabs[next].focus();
  }

  function onTabExit(e) {
    if (!e.target.matches('[role="tab"][data-slot]') || (root.contains(e.relatedTarget) && e.relatedTarget?.closest('.at-tabs'))) return;
    root.querySelectorAll('.at-tabs [role="tab"]').forEach(tab => { tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1; });
  }

  /* ---------- Actions ---------- */
  const mutationCurrent = context => dataOwner === context.owner && accountCurrent(context);

  async function mutate(context, name, params) {
    if (!mutationCurrent(context)) return null;
    try {
      const { data: auth, error } = await context.client.auth.getSession();
      if (!mutationCurrent(context)) return null;
      const session = auth?.session;
      if (error || !session?.access_token || session.user?.id !== context.owner) throw new Error("ACCOUNT_CHANGED");
      const result = await context.client.rpc(name, params).setHeader("Authorization", `Bearer ${session.access_token}`);
      if (!mutationCurrent(context)) return null;
      if (result.error) throw result.error;
      return result;
    } catch (error) {
      if (mutationCurrent(context)) throw error;
      return null;
    }
  }

  async function wear(id, removed, context) {
    if (!mutationCurrent(context)) return;
    const item = data.items.find((i) => i.id === id);
    if (!item) return;
    const previous = removed ? data.items.find((i) => i.slot === item.slot && i.cosmetic === data.appearance?.[item.slot]) : item;
    const trigger = document.activeElement;
    const result = await mutate(context, "titan_set_appearance", { p_slot: item.slot, p_item: id });
    if (!result || !mutationCurrent(context)) return;
    data.appearance = result.data || {};
    syncUser();
    const restoreFocus = document.activeElement === trigger && root.contains(trigger);
    render();
    if (restoreFocus) {
      const buttons = [...root.querySelectorAll("button")];
      const next = buttons.find((b) => removed ? b.dataset.wear === previous?.id : b.dataset.remove === item.slot) || buttons.find((b) => b.dataset.preview === previous?.id) || root.querySelector(`[data-collection="${collection}"]`);
      next?.focus({ preventScroll: true });
    }
    window.titanShell.toast({ type: "ok", title: removed ? "Style d’origine rétabli" : `${item.name} porté`, message: removed ? previous && permanent(previous) ? "Ta pièce acquise reste dans ta collection. Tu peux la porter à nouveau." : "Cette pièce reste accessible tant que ton accès TITAN+ est actif. Les pièces acquises restent dans ta collection." : item.slot === "map" ? "Ta carte d’aventure change de lumière." : item.slot === "card" ? "Tes prochaines cartes partagées prennent ce style." : "Ton portrait le montre partout dans TITAN." });
  }

  /* « Essayer » : the piece on the real surface — my portrait as on my passport, a world of the Aventure, my own card —
     before anything is acquired or worn. The sheet only shows: it holds no control that acquires or equips. */
  function cardSample() {
    if (!window.TitanCard?.draw || window.TitanCard.tryStyle !== true) return null;
    const logs = window.state?.history || [];
    const recs = (window.TitanInsights?.records?.(logs, "all", Date.now()) || []).filter((r) => r.log?.date);
    const marks = recs.filter((r) => r.kind !== "duration");
    const best = (marks.length ? marks : recs).slice().sort((x, y) => new Date(y.log.date) - new Date(x.log.date))[0];
    if (!best) return null;
    const sport = window.TitanSports?.label?.(best.sport) || "";
    return { kind: "record", eyebrow: sport ? `Record · ${sport}` : "Record", title: best.label, value: F().recordValue(best.unit, best.value),
      date: new Date(best.log.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }), name: window.TitanCard.userName() };
  }

  function trialNote(item) {
    const st = stateOf(item);
    const level = Number(data.level) || 1;
    if (st === "worn") return permanent(item) ? "Tu la portes en ce moment. Elle est à toi." : "Tu la portes en ce moment grâce à ton accès TITAN+, qui est temporaire. Une acquisition par crédits garde la pièce dans ta collection.";
    if (st === "owned") return "Cette pièce est acquise. Porte-la depuis la collection.";
    if (st === "lent") return "Ton accès TITAN+ est temporaire. Une acquisition par crédits garde la pièce dans ta collection.";
    if (item.unlock === "rank") return `Remise au rang ${RANKS[item.min_level] || `du niveau ${item.min_level}`}, au niveau ${item.min_level}. Tu es au niveau ${level}.`;
    if (item.unlock === "plus") return "Consulte les conditions de la pièce dans la collection pour la débloquer.";
    const short = item.price - credits();
    if (short <= 0) return `Ta réserve suffit : ${F().number(item.price)} crédits, il t’en resterait ${F().number(-short)}. Débloque-la depuis la collection.`;
    const sessions = Math.ceil(short / creditsPerSession());
    return `${F().number(item.price)} crédits : il t’en manque ${F().number(short)}, environ ${sessions} séance${sessions > 1 ? "s" : ""} à ton rythme actuel.`;
  }

  function openPreview(id) {
    const item = data?.items?.find((i) => i.id === id);
    if (!item || window.state?.user?.id !== dataOwner) return;
    const owner = dataOwner;
    const level = Number(data.level) || 1;
    const rank = window.TitanEffort?.rank?.(level)?.name;
    const name = window.titanShell?.user?.().name || "";
    const worlds = window.TitanCodex?.worlds || [];
    let stage;
    if (item.slot === "frame")
      stage = `<div class="at-trial-stage is-frame"><span class="at-portrait" data-frame="${esc(item.cosmetic)}"><img src="/assets/renaissance/${esc(avatar())}-s.webp" alt="" width="144" height="144"></span>
        <p class="at-trial-id"><strong>${esc(name)}</strong><span>Niveau ${level}${rank ? ` · ${esc(rank)}` : ""}</span></p></div>
        <p class="asc-small asc-muted at-trial-where">Sur ton passeport, dans la barre de navigation et sur ta carte publique.</p>`;
    else if (item.slot === "map")
      stage = `<div class="at-trial-stage is-map">${preview(item, worlds[0]?.image || "valley")}</div>
        ${worlds.length > 1 ? `<div class="at-trial-worlds" role="group" aria-label="Monde affiché">${worlds.map((w, i) => `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-trial-world="${esc(w.image)}" aria-pressed="${i === 0}">${esc(w.name)}</button>`).join("")}</div>` : ""}
        <p class="asc-small asc-muted at-trial-where">La lumière de ta carte d’aventure, dans chaque monde.</p>`;
    else
      stage = `<div class="at-trial-stage is-card">${preview(item)}</div>
        <p class="asc-small asc-muted at-trial-where" data-trial-card-note>Le style des images que tu partages : records, semaine, ADN sportif.</p>`;
    const dialog = window.titanShell.sheet({
      title: item.name,
      eyebrow: "Essayage · rien n’est enregistré",
      body: `<div class="at-trial">${stage}
        <p class="at-trial-desc">${esc(item.description || "")}</p>
        <p class="at-status">${stateChip(item)}</p>
        <p class="asc-small asc-muted">${esc(trialNote(item))}</p>
        <p class="asc-small asc-faint">Cet aperçu ne change pas ton style et ne dépense aucun crédit.</p>
        <button type="button" class="asc-btn asc-btn-secondary at-trial-back" data-trial-close>Revenir à la collection</button></div>`,
    });
    if (!dialog) return;
    dialog.classList.add("at-trial-sheet");
    dialog.addEventListener("click", (e) => {
      const b = e.target.closest?.("button");
      if (!b) return;
      if (b.hasAttribute("data-trial-close")) return dialog.close();
      if (b.dataset.trialWorld) {
        const img = dialog.querySelector(".at-map img");
        if (img) img.src = `/assets/renaissance/${b.dataset.trialWorld}-small.webp`;
        dialog.querySelectorAll("[data-trial-world]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      }
    });
    // My own latest record, drawn by the real card renderer in this style. The example card stays if there is none.
    const sample = item.slot === "card" ? cardSample() : null;
    if (sample) window.TitanCard.draw(sample, { style: item.cosmetic }).then((canvas) => {
      const mock = dialog.isConnected && window.state?.user?.id === owner ? dialog.querySelector(".at-trial-stage .at-card") : null;
      if (!mock || !canvas) return;
      canvas.className = "at-card-canvas";
      canvas.dataset.card = item.cosmetic;
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", `Ta carte de record dans le style ${item.name}`);
      mock.replaceWith(canvas);
      const note = dialog.querySelector("[data-trial-card-note]");
      if (note) note.textContent = "Ton dernier record, dessiné dans ce style. Il s’applique aussi à tes cartes de semaine et d’ADN sportif.";
    }).catch(() => {});
  }

  function buy(id) {
    const context = accountContext();
    if (!mutationCurrent(context)) return;
    const item = data.items.find((i) => i.id === id);
    if (!item) return;
    const left = (Number(data.credits) || 0) - item.price;
    const confirmation = window.titanShell.confirm({
      title: `Débloquer ${item.name} ?`,
      message: `${F().number(item.price)} crédits. Il t’en restera ${F().number(left)}.`,
      detail: "Une pièce visuelle, gardée dans ta collection. Aucun effet sur l’XP, les gardiens ou les classements.",
      confirmLabel: "Débloquer et porter",
      action: async () => {
        if (!mutationCurrent(context)) throw new Error(messageOf(new Error("ACCOUNT_CHANGED")));
        const result = await mutate(context, "titan_purchase_shop_item", { p_item_id: id }).catch(error => { throw new Error(messageOf(error)); });
        if (!result || !mutationCurrent(context)) return;
        const row = Array.isArray(result.data) ? result.data[0] : result.data;
        data.credits = Number(row?.credits_after ?? left);
        const purchased = data.items.find((i) => i.id === id);
        if (purchased) Object.assign(purchased, { owned: true, permanent: true });
        syncUser();
        if (purchased) await wear(id, false, context).catch(() => { if (mutationCurrent(context)) render(); });
        else render();
      },
    });
    const dialog = document.activeElement?.closest("dialog.asc-sheet[open]");
    if (!dialog) return;
    dressConfirmation(dialog, item, left);
    const closeStale = () => { if (!mutationCurrent(context)) dialog.close(); };
    const events = ["titan:account-changing", "titan:account-changed"];
    events.forEach(event => window.addEventListener(event, closeStale));
    return confirmation.then((done) => {
      // The control that opened the confirmation is gone once the piece is acquired: the keyboard lands on the piece itself.
      // (Once the sheet has really left the page: until then the rest of the page cannot take the focus.)
      if (done) setTimeout(() => {
        if (mutationCurrent(context) && !document.querySelector("dialog[open]") && (!document.activeElement || document.activeElement === document.body))
          (root.querySelector(`[data-piece="${id}"] .at-action button`) || root.querySelector(`[data-piece="${id}"] [data-preview]`))?.focus({ preventScroll: true });
      }, 0);
      return done;
    }).finally(() => events.forEach(event => window.removeEventListener(event, closeStale)));
  }

  /* What is about to happen, seen before it is confirmed: the piece, and the account of the reserve line by line. */
  function dressConfirmation(dialog, item, left) {
    const stack = dialog.querySelector("[data-sheet-content] > .asc-stack");
    if (!stack) return;
    dialog.classList.add("at-confirm-sheet");
    const block = document.createElement("div");
    block.className = "at-confirm";
    block.innerHTML = `<div class="at-confirm-piece sig-plate">${preview(item)}</div>
      <dl class="at-ledger"><div><dt>Ta réserve</dt><dd class="asc-num">${F().number(credits())}</dd></div>
        <div><dt>${esc(item.name)}</dt><dd class="asc-num">− ${F().number(item.price)}</dd></div>
        <div class="is-total"><dt>Il te restera</dt><dd class="asc-num">${F().number(left)}</dd></div></dl>`;
    // The account says the price and what is left, line by line: the sentence that said the same is not repeated under it.
    stack.querySelector(":scope > p:first-child")?.remove();
    stack.prepend(block);
  }

  /* ADR-004: inside the Android app, when the flag is on and the browser exposes the Digital Goods and Payment Request APIs. */
  const PLAY_BILLING = "https://play.google.com/billing";
  function playBillingOffered() {
    return window.TITAN_PLAY_BILLING?.enabled === true && window.titanInAndroidApp?.() === true
      && typeof window.getDigitalGoodsService === "function" && typeof window.PaymentRequest === "function";
  }
  let playBusy = false;
  async function playCheckout(btn) {
    const context = accountContext();
    if (playBusy || guest() || !accountCurrent(context) || !playBillingOffered()) return;
    playBusy = true;
    btn.disabled = true;
    const sku = window.TITAN_PLAY_BILLING.productId;
    let response = null;
    try {
      const service = await window.getDigitalGoodsService(PLAY_BILLING);
      const [details] = await service.getDetails([sku]);
      if (!details?.price) throw new Error("PLAY_PRODUCT_UNAVAILABLE");
      const request = new PaymentRequest([{ supportedMethods: PLAY_BILLING, data: { sku } }], { total: { label: details.title || "TITAN+", amount: { currency: details.price.currency, value: details.price.value } } });
      response = await request.show();
      const purchaseToken = response?.details?.purchaseToken;
      if (typeof purchaseToken !== "string" || !purchaseToken) throw new Error("PLAY_NO_TOKEN");
      // The server asks Google itself: the token alone grants nothing.
      const session = (await context.client.auth.getSession())?.data?.session;
      if (!session?.access_token || !accountCurrent(context)) throw new Error("ACCOUNT_CHANGED");
      const answer = await fetch("/functions/play-billing", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ purchase_token: purchaseToken, product_id: sku }) });
      const result = await answer.json().catch(() => ({}));
      if (!answer.ok) {
        const known = { purchase_already_used: "Cet achat est déjà rattaché à un autre compte TITAN.", authentication_required: "Reconnecte-toi pour finaliser l’achat.", product_not_allowed: "Cet abonnement n’est pas reconnu." };
        throw Object.assign(new Error("PLAY_SERVER_REFUSED"), { playMessage: known[result?.error] || "Ton achat est enregistré chez Google mais n’a pas pu être confirmé ici pour le moment. Réessaie dans un instant : tu n’es pas débité deux fois." });
      }
      await response.complete("success");
      response = null;
      window.titanShell.toast({ type: "ok", title: result.active ? "TITAN+ activé" : "Achat reçu", message: result.active ? "Ton accès TITAN+." : "Ton abonnement n’est pas actif pour le moment." });
      if (accountCurrent(context)) await load(true);
    } catch (error) {
      if (response) await response.complete("fail").catch(() => {});
      // Closing the Google Play sheet is a choice, not an error.
      if (error?.name !== "AbortError" && accountCurrent(context)) window.titanShell.toast({ type: "warn", title: "Achat non terminé", message: error?.playMessage || (String(error?.message).includes("ACCOUNT_CHANGED") ? messageOf(error) : "L’achat n’a pas pu aboutir. Rien n’est facturé tant que Google ne l’a pas confirmé.") });
    } finally {
      playBusy = false;
      if (btn.isConnected) btn.disabled = false;
    }
  }

  async function checkout(btn) {
    const context = accountContext();
    const consent = window.TitanAnalytics?.consentSnapshot?.() ?? null;
    if (window.TITAN_PAYMENTS?.webCheckout !== true) return;
    if (guest() || !accountCurrent(context)) return;
    btn.disabled = true;
    // Keep the historical event's unit: a subscription CTA action, including an unsuccessful opening.
    window.TitanAnalytics?.track("premium_checkout_started", { source: "atelier" });
    try {
      const opened = await window.openEliteCheckout?.({ button: btn });
      if (opened === true && accountCurrent(context)) {
        try {
          await receiptLock(context.owner, writable => {
            if (!writable || !accountCurrent(context)) return;
            localStorage.setItem(CHECKOUT_KEY + context.owner, JSON.stringify({ v: 3, owner: context.owner, at: Date.now(), notified: false, consent }));
            localStorage.removeItem("titan_checkout_started_v2:" + context.owner);
          });
        } catch {}
      }
    } finally {
      btn.disabled = false;
    }
  }

  function onClick(e) {
    const b = e.target.closest("button");
    if (!b || !root.contains(b)) return;
    if (b.dataset.collection) {
      collection = b.dataset.collection;
      render();
      root.querySelector(`[data-collection="${collection}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (b.dataset.slot) {
      slot = b.dataset.slot;
      render();
      if (b.classList.contains("at-look-slot")) document.getElementById("collection")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (b.dataset.wear || b.dataset.remove) {
      const context = accountContext();
      const removed = b.hasAttribute("data-remove");
      const id = removed ? data?.items?.find((i) => i.slot === b.dataset.remove && i.unlock === "default" && i.owned)?.id : b.dataset.wear;
      if (id) return wear(id, removed, context).catch((error) => {
        if (mutationCurrent(context)) window.titanShell.toast({ type: "warn", message: messageOf(error) });
      });
      return;
    }
    if (b.dataset.collectionGo) {
      collection = b.dataset.collectionGo;
      render();
      root.querySelector(`[data-collection="${collection}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (b.dataset.gotoPiece || b.dataset.gotoGroup) {
      const piece = b.dataset.gotoPiece ? data?.items?.find((i) => i.id === b.dataset.gotoPiece) : null;
      slot = piece ? piece.slot : "frame";
      collection = "all";
      render();
      const target = piece ? root.querySelector(`[data-piece="${piece.id}"]`) : root.querySelector(`[data-group="${b.dataset.gotoGroup}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      (target?.querySelector("[data-preview]") || root.querySelector("#collection h2"))?.focus({ preventScroll: true });
      return;
    }
    if (b.dataset.preview) return openPreview(b.dataset.preview);
    if (b.dataset.buy) return buy(b.dataset.buy);
    if (b.hasAttribute("data-checkout")) return checkout(b);
    if (b.hasAttribute("data-play-checkout")) return playCheckout(b);
    if (b.hasAttribute("data-retry")) {
      if (b.disabled) return;
      return load(true);
    }
  }

  /* Paddle reports a completed checkout; the webhook grants TITAN+ a few seconds later. Poll briefly. */
  window.addEventListener("titan:paddle", (e) => {
    if (e.detail?.name !== "checkout.completed") return;
    let tries = 0;
    const poll = () => load().then(() => !plusActive() && ++tries < 8 && setTimeout(poll, 4000));
    setTimeout(poll, 3000);
  });

  let booted = false;
  function start() {
    root = document.getElementById("atelier");
    if (!root || !window.state?.user || booted) return;
    booted = true;
    root.addEventListener("click", onClick);
    root.addEventListener("keydown", onTabKey);
    root.addEventListener("focusout", onTabExit);
    for (const type of ["mouseover", "mouseout", "focusin", "focusout"]) root.addEventListener(type, onTrial);
    if (location.hash === "#plus") slot = "frame";
    render();
    load().then(() => location.hash && document.getElementById(location.hash.slice(1))?.scrollIntoView());
  }
  window.addEventListener("online", () => booted && load());
  window.addEventListener("titan:account-changing", () => { if (booted) ownerChanged(); else ++loadSequence; });
  window.addEventListener("titan:account-changed", () => booted && load());
  /* The Aventure's snapshot can arrive after the catalogue: only « Ce qui se mérite » reads it, so only that section is redrawn. */
  function refreshMerit() {
    if (!root || !data || guest() || loading) return;
    const current = root.querySelector("#merite");
    if (current?.contains(document.activeElement)) return;
    const html = meritHtml();
    if (current) {
      if (html) current.outerHTML = html;
      else current.remove();
    } else if (html) root.querySelector("#plus")?.insertAdjacentHTML("beforebegin", html);
  }
  window.addEventListener("titan:adventure-updated", () => booted && refreshMerit());
  window.addEventListener("titan:history-updated", () => setTimeout(start, 0));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
