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
  const CHECKOUT_KEY = "titan_checkout_started_v1";

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
    if (missing(e)) return "L’Atelier ouvre avec la prochaine mise à jour du serveur. Tes crédits sont intacts.";
    if (m.includes("NO_FUNDS")) return "Il te manque des crédits pour cette pièce. Ils viennent de tes séances.";
    if (m.includes("PURCHASE_LIMIT_ONCE")) return "Cette pièce est déjà dans ta collection.";
    if (m.includes("NOT_FOR_SALE")) return "Cette pièce ne s’achète pas : elle se mérite par le rang ou vient avec TITAN+.";
    if (m.includes("NOT_OWNED")) return "Cette pièce n’est pas encore dans ta collection.";
    if (m.includes("ACCOUNT_SUSPENDED")) return "Ton compte est suspendu : l’Atelier est indisponible.";
    if (m.includes("ACCOUNT_CHANGED")) return "Le compte a changé. Rouvre l’Atelier.";
    return navigator.onLine ? "L’Atelier n’a pas répondu. Réessaie dans un instant." : "Hors ligne : l’Atelier revient avec le réseau.";
  };

  /** Credits a typical session of yours brings, from your recent sessions (estimate shown as such). */
  function creditsPerSession() {
    const recent = (window.state?.history || []).filter((l) => !l.archived_at && Number(l.xp) > 0).slice(-12);
    if (!recent.length) return 45;
    return Math.max(5, Math.round(recent.reduce((n, l) => n + Number(l.xp) * 0.1, 0) / recent.length));
  }

  async function load() {
    const owner = window.state?.user?.id;
    if (dataOwner && dataOwner !== owner) { data = null; dataOwner = null; fallbackPlus = null; }
    if (guest() || !window.titanClient) {
      loading = false;
      return render();
    }
    try {
      const { data: d, error: e } = await window.titanClient.rpc("titan_atelier");
      if (window.state?.user?.id !== owner || (d?.owner && d.owner !== owner)) return ownerChanged();
      if (e) throw e;
      data = d;
      dataOwner = owner;
      error = "";
      syncUser();
      noteActivation();
    } catch (e) {
      if (window.state?.user?.id !== owner) return ownerChanged();
      error = messageOf(e);
      pending = missing(e);
    }
    loading = false;
    render();
    if (!data && pending) await readPlusFromProfile().then(render);
  }

  function ownerChanged() {
    data = null;
    dataOwner = null;
    fallbackPlus = null;
    loading = false;
    pending = false;
    error = messageOf(new Error("ACCOUNT_CHANGED"));
    render();
  }

  /** Before the server update, TITAN+ status still comes from the profile the payment webhook writes (read only). */
  async function readPlusFromProfile() {
    const owner = window.state?.user?.id;
    try {
      const { data: p } = await window.titanClient.from("profiles").select("is_elite, elite_renews_at, elite_ends_at").eq("id", owner).maybeSingle();
      if (!p || window.state?.user?.id !== owner) return;
      fallbackPlus = { active: p.is_elite === true, renews_at: p.elite_renews_at, ends_at: p.elite_ends_at };
      if (window.state?.user) window.state.user.is_elite = fallbackPlus.active;
      noteActivation();
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

  /** premium_activated only when a checkout started from this browser is now confirmed by the webhook. */
  function noteActivation() {
    if (!plusActive()) return;
    try {
      const started = Number(localStorage.getItem(CHECKOUT_KEY) || 0);
      if (!started) return;
      localStorage.removeItem(CHECKOUT_KEY);
      if (Date.now() - started < 3 * 86400000) {
        window.TitanAnalytics?.track("premium_activated", { source: "atelier" });
        window.titanShell?.toast({ type: "ok", title: "TITAN+ est actif", message: "Merci. Les campagnes et la collection TITAN+ sont ouvertes." });
      }
    } catch {}
  }

  /* ---------- Previews ---------- */
  const avatar = () => window.titanShell?.user?.().avatar || "scout";
  function preview(item) {
    if (item.slot === "frame")
      return `<span class="at-portrait" data-frame="${esc(item.cosmetic)}"><img src="/assets/renaissance/${esc(avatar())}-s.webp" alt="" width="96" height="96" loading="lazy"></span>`;
    if (item.slot === "map") return `<span class="at-map" data-ambiance="${esc(item.cosmetic)}"><img src="/assets/renaissance/valley-small.webp" alt="" width="160" height="100" loading="lazy"><i></i><i></i><i></i></span>`;
    return `<span class="at-card" data-card="${esc(item.cosmetic)}"><small>Course à pied · record</small><strong>10 km · 47:12</strong><em>TITAN</em></span>`;
  }

  function condition(item) {
    if (item.unlock === "default") return `<span class="asc-small asc-muted">Inclus</span>`;
    if (item.unlock === "rank") return `<span class="asc-chip">${icon("shield")} Rang ${esc(RANKS[item.min_level] || `niveau ${item.min_level}`)}</span>`;
    if (item.unlock === "plus") return `<span class="asc-chip am">${icon("crown")} TITAN+</span>`;
    return `<span class="at-price asc-num">${F().number(item.price)} <small>crédits</small></span>${item.plus_access ? `<span class="asc-chip am">${icon("crown")} Accès TITAN+</span>` : ""}`;
  }

  function action(item) {
    const worn = (data.appearance || {})[item.slot] === item.cosmetic || (!data.appearance?.[item.slot] && item.unlock === "default");
    const canRemove = worn && item.unlock !== "default" && (data.items || []).some((i) => i.slot === item.slot && i.unlock === "default" && i.owned);
    const wear = worn ? `<span class="asc-chip cy">${icon("check")} Porté</span>${canRemove ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-remove="${esc(item.slot)}" aria-label="Retirer ${esc(item.name)}">Retirer</button>` : ""}` : item.owned ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-wear="${esc(item.id)}">Porter</button>` : "";
    if (item.unlock === "credits" && !permanent(item)) {
      const short = item.price - (Number(data.credits) || 0);
      const purchase = short > 0 ? `<span class="asc-small asc-faint">Encore ${F().number(short)} crédits</span>` : `<button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-buy="${esc(item.id)}">${item.owned ? "Garder la pièce" : "Débloquer"}</button>`;
      return wear + purchase;
    }
    if (wear) return wear;
    if (item.unlock === "plus") return `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-goto-plus>Voir TITAN+</button>`;
    if (item.unlock === "rank") return `<span class="asc-small asc-faint">Niveau ${item.min_level}</span>`;
    const short = item.price - (Number(data.credits) || 0);
    return short > 0 ? `<span class="asc-small asc-faint">Encore ${F().number(short)}</span>` : `<button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-buy="${esc(item.id)}">Débloquer</button>`;
  }

  function itemHtml(item) {
    const short = item.unlock === "credits" && !permanent(item) ? item.price - (Number(data.credits) || 0) : 0;
    const level = Number(data.level) || 1;
    return `<article class="at-item" data-owned="${item.owned}" data-unlock="${esc(item.unlock)}">
      <div class="at-preview">${preview(item)}</div>
      <div class="at-body"><div class="at-head"><strong>${esc(item.name)}</strong>${condition(item)}</div>
        <p class="asc-small asc-muted">${esc(item.description || "")}</p>
        ${item.owned ? `<p class="asc-small asc-muted">${permanent(item) ? "Acquis définitivement" : "Accès temporaire TITAN+"}</p>` : ""}
        ${short > 0 ? `<span class="asc-ascent thin"><span style="--p:${Math.round(Math.min(1, (Number(data.credits) || 0) / item.price) * 100)}%"></span></span><p class="asc-small asc-faint">Environ ${Math.ceil(short / creditsPerSession())} séance${Math.ceil(short / creditsPerSession()) > 1 ? "s" : ""} à ton rythme actuel.</p>` : ""}
        ${item.unlock === "rank" && !item.owned ? `<span class="asc-ascent thin"><span style="--p:${Math.round(Math.min(1, level / item.min_level) * 100)}%"></span></span>` : ""}
        <div class="at-action asc-row-flex">${action(item)}<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-preview="${esc(item.id)}" aria-label="Prévisualiser ${esc(item.name)}">Aperçu</button></div></div></article>`;
  }

  /* ---------- Sections ---------- */
  function walletHtml() {
    const cap = Number(data?.week_credit_cap) || 960;
    const week = Number(data?.week_credits) || 0;
    return `<section class="asc-hero at-wallet"><div class="at-wallet-main"><p class="asc-eyebrow cy">Tes crédits</p><p class="at-balance asc-num">${F().number(Number(data?.credits) || 0)}</p>
        <p class="asc-small asc-muted">Une seule monnaie, gagnée en t’entraînant : 10 % de l’XP de chaque séance. Elle ne s’achète pas.</p></div>
      <div class="at-week"><div class="asc-between"><span class="asc-small">Cette semaine</span><span class="asc-small asc-num">${F().number(week)} / ${F().number(cap)}</span></div><span class="asc-ascent thin"><span style="--p:${Math.round(Math.min(1, week / cap) * 100)}%"></span></span>
        <p class="asc-small asc-faint">Le même plafond pour tout le monde, abonné ou non.</p></div></section>`;
  }

  function lookHtml() {
    const a = data.appearance || {};
    const find = (s) => (data.items || []).find((i) => i.slot === s && i.cosmetic === a[s]) || (data.items || []).find((i) => i.slot === s && i.unlock === "default");
    return `<section class="asc-section"><div class="asc-section-head"><h2>Ce que tu portes</h2></div><div class="at-look">${SLOTS.map((s) => {
      const it = find(s.id);
      return it ? `<button type="button" class="at-look-slot" data-slot="${s.id}"><span class="at-look-prev">${preview(it)}</span><span><small>${esc(s.label.slice(0, -1))}</small><strong>${esc(it.name)}</strong></span></button>` : "";
    }).join("")}</div></section>`;
  }

  function shelfHtml() {
    const catalog = data.items || [];
    const items = catalog.filter((i) => i.slot === slot && (collection === "all" || (collection === "owned" ? permanent(i) : !permanent(i))));
    const meta = SLOTS.find((s) => s.id === slot);
    const acquired = catalog.filter(permanent).length;
    const borrowed = catalog.filter((i) => i.owned && !permanent(i)).length;
    return `<section class="asc-section" id="collection"><div class="asc-section-head"><h2>Collection</h2><span class="asc-small asc-muted">${acquired} / ${catalog.length} acquises${borrowed ? ` · ${borrowed} accès TITAN+` : ""}</span></div>
      <div class="asc-seg at-tabs" role="tablist" aria-label="Type de pièce">${SLOTS.map((s) => `<button type="button" role="tab" data-slot="${s.id}" aria-selected="${s.id === slot}">${esc(s.label)}</button>`).join("")}</div>
      <div class="at-filters" role="group" aria-label="Filtrer la collection">${[["all", "Tout"], ["owned", "Acquis"], ["locked", "À débloquer"]].map(([id, label]) => `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-collection="${id}" aria-pressed="${collection === id}">${label}</button>`).join("")}</div>
      <p class="asc-small asc-muted">${esc(meta.hint)}</p>
      ${collection === "owned" ? `<p class="asc-small asc-faint">Tes pièces acquises restent disponibles sans TITAN+. Les accès temporaires sont dans « Tout ».</p>` : ""}
      <div class="at-grid">${items.length ? items.map(itemHtml).join("") : `<p class="asc-note" data-collection-empty>${collection === "owned" ? "Aucune pièce acquise dans cette catégorie. Découvre ce que tu peux viser dans « À débloquer »." : collection === "locked" ? "Tu as acquis toutes les pièces de cette catégorie." : "Aucune pièce dans cette catégorie pour le moment."}</p>`}</div></section>`;
  }

  function plusHtml() {
    const p = data?.plus || fallbackPlus || { active: window.state?.user?.is_elite === true };
    const date = (v) => new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    const support = window.TITAN_EXTERNAL_URLS?.supportEmail || "titanteam.app@gmail.com";
    const never = `<ul class="at-never"><li>${icon("close")} Pas d’XP en plus</li><li>${icon("close")} Pas de crédits en plus</li><li>${icon("close")} Pas de plafond relevé</li><li>${icon("close")} Pas d’avance sur les gardiens ni les classements</li></ul>`;
    if (p.active)
      return `<section class="at-plus is-active" id="plus"><p class="asc-eyebrow am">${icon("crown")} TITAN+ actif</p><h2 class="asc-h2">Merci de soutenir TITAN.</h2>
        <p class="asc-small asc-muted">${p.ends_at ? `Accès jusqu’au ${esc(date(p.ends_at))}.` : p.renews_at ? `Prochain renouvellement le ${esc(date(p.renews_at))}.` : "Ton abonnement est confirmé par notre partenaire de paiement."}</p>
        <ul class="at-includes"><li>${icon("compass")} Les forges d’Obsidienne et la citadelle des Aurores : 18 chapitres</li><li>${icon("layers")} 20 routines nommées</li><li>${icon("group")} Jusqu’à 20 sportifs dans l’espace coach</li><li>${icon("sparkle")} Accès temporaire à 4 pièces, aussi gagnables avec tes crédits</li></ul>
        <p class="asc-small asc-faint">Arrêter ou modifier : le lien figure dans l’e-mail de reçu Paddle, ou écris à <a href="mailto:${esc(support)}">${esc(support)}</a>. Ton journal, tes insignes et tes crédits restent à toi.</p></section>`;
    return `<section class="at-plus" id="plus"><p class="asc-eyebrow am">${icon("crown")} TITAN+</p><h2 class="asc-h2">Plus de monde à explorer. Pas plus de puissance.</h2>
      <ul class="at-includes"><li>${icon("compass")} <span><strong>2 campagnes en plus</strong> · les forges d’Obsidienne et la citadelle des Aurores, 18 chapitres</span></li><li>${icon("layers")} <span><strong>20 routines</strong> nommées au lieu de 5</span></li><li>${icon("group")} <span><strong>20 sportifs</strong> dans l’espace coach au lieu de 3</span></li><li>${icon("sparkle")} <span><strong>Accès temporaire à 4 pièces</strong> : Aegis, Givre, Aurores, Obsidienne, aussi gagnables avec tes crédits</span></li></ul>
      ${never}
      ${pending && !data ? `<p class="asc-small asc-faint">Le catalogue et ses conditions d’acquisition apparaîtront avec la prochaine mise à jour du serveur.</p>` : ""}
      ${window.titanInAndroidApp?.() ? `<p class="asc-note">${icon("info")}<span>TITAN+ se souscrit depuis le site titan-app.fr, dans ton navigateur. L’abonnement s’applique ensuite partout, application comprise.</span></p>` : `<div class="at-plus-cta"><button type="button" class="asc-btn asc-btn-primary" data-checkout ${guest() ? "disabled" : ""}>${icon("crown")} Passer à TITAN+</button><span class="asc-small asc-muted">5 € par mois. Prix final, taxes et résiliation affichés par Paddle avant paiement.</span></div>`}
      ${guest() ? `<p class="asc-small asc-faint">Un compte est nécessaire : l’abonnement se rattache à ton profil.</p>` : ""}
      <p class="asc-small asc-faint">Le journal, les records, les objectifs, l’analyse, les deux premières campagnes et la Communauté restent gratuits, sans limite de durée.</p></section>`;
  }

  function render() {
    if (!root) return;
    if (guest()) {
      root.innerHTML = `<section class="asc-hero at-wallet"><div class="at-wallet-main"><p class="asc-eyebrow cy">Atelier</p><h2 class="cm-exp-title">Ton style se gagne à l’effort.</h2>
          <p class="asc-lead">Chaque séance rapporte des crédits. Ils débloquent des cadres, des ambiances de carte et des styles de cartes partageables. Rien ici ne change ta progression.</p>
          <div class="asc-row-flex"><a class="asc-btn asc-btn-primary" href="/login">Créer un compte</a><a class="asc-btn asc-btn-ghost" href="/tarifs">Gratuit et TITAN+</a></div></div></section>
        ${plusHtml()}`;
      root.setAttribute("aria-busy", "false");
      return;
    }
    if (loading) return;
    if (!data) {
      root.innerHTML = `<p class="asc-note${pending ? "" : " err"}">${icon(pending ? "info" : "alert")}<span>${esc(error)}</span></p>${pending ? "" : `<button type="button" class="asc-btn asc-btn-secondary" data-retry>Réessayer</button>`}${plusHtml()}`;
      root.setAttribute("aria-busy", "false");
      return;
    }
    root.innerHTML = `${error ? `<p class="asc-note err">${icon("alert")}<span>${esc(error)}</span></p>` : ""}${walletHtml()}${lookHtml()}${shelfHtml()}${plusHtml()}
      <p class="asc-small asc-faint at-foot">Tous les styles du catalogue se gagnent gratuitement par les crédits ou le rang. Une pièce acquise avec tes crédits reste à toi après la fin de TITAN+. L’accès inclus par l’abonnement est temporaire : seules les pièces encore non acquises reviennent au style d’origine.</p>
      ${(data.items || []).some((i) => i.unlock === "plus") ? `<p class="asc-note">${icon("info")}<span>Mise à jour du catalogue en attente : les pièces encore marquées TITAN+ deviendront aussi accessibles avec tes crédits d’activité.</span></p>` : ""}`;
    root.setAttribute("aria-busy", "false");
  }

  /* ---------- Actions ---------- */
  async function wear(id, removed = false) {
    const owner = dataOwner;
    if (window.state?.user?.id !== owner) throw new Error("ACCOUNT_CHANGED");
    const item = data.items.find((i) => i.id === id);
    const previous = removed ? data.items.find((i) => i.slot === item.slot && i.cosmetic === data.appearance?.[item.slot]) : item;
    const trigger = document.activeElement;
    const { data: look, error: e } = await window.titanClient.rpc("titan_set_appearance", { p_slot: item.slot, p_item: id });
    if (window.state?.user?.id !== owner) return;
    if (e) throw e;
    data.appearance = look || {};
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

  function openPreview(id) {
    const item = data?.items?.find((i) => i.id === id);
    if (!item || window.state?.user?.id !== dataOwner) return;
    window.titanShell.sheet({
      title: item.name,
      eyebrow: "Aperçu",
      body: `<div class="at-preview at-preview-large">${preview(item)}</div><p class="asc-small asc-muted">${esc(item.description || "")}</p><div class="at-action">${condition(item)}</div><p class="asc-small asc-muted">${permanent(item) ? "Cette pièce est acquise." : item.owned ? "Ton accès TITAN+ est temporaire. Une acquisition par crédits garde la pièce dans ta collection." : "Consulte les conditions de la pièce dans la collection pour la débloquer."}</p><p class="asc-small asc-faint">Cet aperçu ne change pas ton style et ne dépense aucun crédit.</p>`,
    });
  }

  function buy(id) {
    const owner = dataOwner;
    const item = data.items.find((i) => i.id === id);
    const left = (Number(data.credits) || 0) - item.price;
    window.titanShell.confirm({
      title: `Débloquer ${item.name} ?`,
      message: `${F().number(item.price)} crédits. Il t’en restera ${F().number(left)}.`,
      detail: "Une pièce visuelle, gardée dans ta collection. Aucun effet sur l’XP, les gardiens ou les classements.",
      confirmLabel: "Débloquer et porter",
      action: async () => {
        if (window.state?.user?.id !== owner) throw new Error(messageOf(new Error("ACCOUNT_CHANGED")));
        const { data: r, error: e } = await window.titanClient.rpc("titan_purchase_shop_item", { p_item_id: id });
        if (window.state?.user?.id !== owner) return;
        if (e) throw new Error(messageOf(e));
        const row = Array.isArray(r) ? r[0] : r;
        data.credits = Number(row?.credits_after ?? left);
        item.owned = true;
        item.permanent = true;
        await wear(id).catch(() => render());
      },
    });
  }

  async function checkout(btn) {
    if (guest()) return;
    btn.disabled = true;
    try {
      localStorage.setItem(CHECKOUT_KEY, String(Date.now()));
    } catch {}
    window.TitanAnalytics?.track("premium_checkout_started", { source: "atelier" });
    try {
      await window.openEliteCheckout?.({ button: btn });
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
    if (b.dataset.wear)
      return wear(b.dataset.wear).catch((err) => window.titanShell.toast({ type: "warn", message: messageOf(err) }));
    if (b.dataset.remove) {
      const base = data?.items?.find((i) => i.slot === b.dataset.remove && i.unlock === "default" && i.owned);
      if (base) return wear(base.id, true).catch((err) => window.titanShell.toast({ type: "warn", message: messageOf(err) }));
      return;
    }
    if (b.dataset.preview) return openPreview(b.dataset.preview);
    if (b.dataset.buy) return buy(b.dataset.buy);
    if (b.hasAttribute("data-goto-plus")) return document.getElementById("plus")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (b.hasAttribute("data-checkout")) return checkout(b);
    if (b.hasAttribute("data-retry")) {
      loading = true;
      return load();
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
    if (location.hash === "#plus") slot = "frame";
    render();
    load().then(() => location.hash && document.getElementById(location.hash.slice(1))?.scrollIntoView());
  }
  window.addEventListener("online", () => booted && load());
  window.addEventListener("titan:history-updated", () => setTimeout(start, 0));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
