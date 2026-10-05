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
  let loading = true;
  let error = "";
  let slot = "frame";
  const guest = () => D().isGuest();
  const plusActive = () => data?.plus?.active === true;

  const messageOf = (e) => {
    const m = String(e?.message || "");
    if (e?.code === "PGRST202" || m.includes("Could not find")) return "L’Atelier ouvre avec la prochaine mise à jour du serveur. Tes crédits sont intacts.";
    if (m.includes("NO_FUNDS")) return "Il te manque des crédits pour cette pièce. Ils viennent de tes séances.";
    if (m.includes("PURCHASE_LIMIT_ONCE")) return "Cette pièce est déjà dans ta collection.";
    if (m.includes("NOT_FOR_SALE")) return "Cette pièce ne s’achète pas : elle se mérite par le rang ou vient avec TITAN+.";
    if (m.includes("NOT_OWNED")) return "Cette pièce n’est pas encore dans ta collection.";
    if (m.includes("ACCOUNT_SUSPENDED")) return "Ton compte est suspendu : l’Atelier est indisponible.";
    return navigator.onLine ? "L’Atelier n’a pas répondu. Réessaie dans un instant." : "Hors ligne : l’Atelier revient avec le réseau.";
  };

  /** Credits a typical session of yours brings, from your recent sessions (estimate shown as such). */
  function creditsPerSession() {
    const recent = (window.state?.history || []).filter((l) => !l.archived_at && Number(l.xp) > 0).slice(-12);
    if (!recent.length) return 45;
    return Math.max(5, Math.round(recent.reduce((n, l) => n + Number(l.xp) * 0.1, 0) / recent.length));
  }

  async function load() {
    if (guest() || !window.titanClient) {
      loading = false;
      return render();
    }
    try {
      const { data: d, error: e } = await window.titanClient.rpc("titan_atelier");
      if (e) throw e;
      data = d;
      error = "";
      syncUser();
      noteActivation();
    } catch (e) {
      error = messageOf(e);
    }
    loading = false;
    render();
  }

  /** The server is the truth: mirror balance, status and look into the local state the shell reads. */
  function syncUser() {
    const u = window.state?.user;
    if (!u || !data) return;
    u.credits = Number(data.credits) || 0;
    u.is_elite = plusActive();
    u.appearance = data.appearance || {};
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
    return `<span class="at-price asc-num">${F().number(item.price)} <small>crédits</small></span>`;
  }

  function action(item) {
    const worn = (data.appearance || {})[item.slot] === item.cosmetic || (!data.appearance?.[item.slot] && item.unlock === "default");
    if (worn) return `<span class="asc-chip cy">${icon("check")} Porté</span>`;
    if (item.owned) return `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-wear="${esc(item.id)}">Porter</button>`;
    if (item.unlock === "plus") return `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-goto-plus>Voir TITAN+</button>`;
    if (item.unlock === "rank") return `<span class="asc-small asc-faint">Niveau ${item.min_level}</span>`;
    const short = item.price - (Number(data.credits) || 0);
    return short > 0 ? `<span class="asc-small asc-faint">Encore ${F().number(short)}</span>` : `<button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-buy="${esc(item.id)}">Débloquer</button>`;
  }

  function itemHtml(item) {
    const short = item.unlock === "credits" && !item.owned ? item.price - (Number(data.credits) || 0) : 0;
    const level = Number(data.level) || 1;
    return `<article class="at-item" data-owned="${item.owned}" data-unlock="${esc(item.unlock)}">
      <div class="at-preview">${preview(item)}</div>
      <div class="at-body"><div class="at-head"><strong>${esc(item.name)}</strong>${condition(item)}</div>
        <p class="asc-small asc-muted">${esc(item.description || "")}</p>
        ${short > 0 ? `<span class="asc-ascent thin"><span style="--p:${Math.round(Math.min(1, (Number(data.credits) || 0) / item.price) * 100)}%"></span></span><p class="asc-small asc-faint">Environ ${Math.ceil(short / creditsPerSession())} séance${Math.ceil(short / creditsPerSession()) > 1 ? "s" : ""} à ton rythme actuel.</p>` : ""}
        ${item.unlock === "rank" && !item.owned ? `<span class="asc-ascent thin"><span style="--p:${Math.round(Math.min(1, level / item.min_level) * 100)}%"></span></span>` : ""}
        <div class="at-action">${action(item)}</div></div></article>`;
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
    const items = (data.items || []).filter((i) => i.slot === slot);
    const meta = SLOTS.find((s) => s.id === slot);
    return `<section class="asc-section" id="collection"><div class="asc-section-head"><h2>Collection</h2><span class="asc-small asc-muted">${(data.items || []).filter((i) => i.owned).length} / ${(data.items || []).length} pièces</span></div>
      <div class="asc-seg at-tabs" role="tablist" aria-label="Type de pièce">${SLOTS.map((s) => `<button type="button" role="tab" data-slot="${s.id}" aria-selected="${s.id === slot}">${esc(s.label)}</button>`).join("")}</div>
      <p class="asc-small asc-muted">${esc(meta.hint)}</p>
      <div class="at-grid">${items.map(itemHtml).join("")}</div></section>`;
  }

  function plusHtml() {
    const p = data?.plus || {};
    const date = (v) => new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    const support = window.TITAN_EXTERNAL_URLS?.supportEmail || "titanteam.app@gmail.com";
    const never = `<ul class="at-never"><li>${icon("close")} Pas d’XP en plus</li><li>${icon("close")} Pas de crédits en plus</li><li>${icon("close")} Pas de plafond relevé</li><li>${icon("close")} Pas d’avance sur les gardiens ni les classements</li></ul>`;
    if (p.active)
      return `<section class="at-plus is-active" id="plus"><p class="asc-eyebrow am">${icon("crown")} TITAN+ actif</p><h2 class="asc-h2">Merci de soutenir TITAN.</h2>
        <p class="asc-small asc-muted">${p.ends_at ? `Accès jusqu’au ${esc(date(p.ends_at))}.` : p.renews_at ? `Prochain renouvellement le ${esc(date(p.renews_at))}.` : "Ton abonnement est confirmé par notre partenaire de paiement."}</p>
        <ul class="at-includes"><li>${icon("compass")} Les forges d’Obsidienne et la citadelle des Aurores : 18 chapitres</li><li>${icon("layers")} 20 routines nommées</li><li>${icon("group")} Jusqu’à 20 sportifs dans l’espace coach</li><li>${icon("sparkle")} 4 pièces de collection TITAN+</li></ul>
        <p class="asc-small asc-faint">Arrêter ou modifier : le lien figure dans l’e-mail de reçu Paddle, ou écris à <a href="mailto:${esc(support)}">${esc(support)}</a>. Ton journal, tes insignes et tes crédits restent à toi.</p></section>`;
    return `<section class="at-plus" id="plus"><p class="asc-eyebrow am">${icon("crown")} TITAN+</p><h2 class="asc-h2">Plus de monde à explorer. Pas plus de puissance.</h2>
      <ul class="at-includes"><li>${icon("compass")} <span><strong>2 campagnes en plus</strong> · les forges d’Obsidienne et la citadelle des Aurores, 18 chapitres</span></li><li>${icon("layers")} <span><strong>20 routines</strong> nommées au lieu de 5</span></li><li>${icon("group")} <span><strong>20 sportifs</strong> dans l’espace coach au lieu de 3</span></li><li>${icon("sparkle")} <span><strong>4 pièces de collection</strong> : Aegis, Givre, Aurores, Obsidienne</span></li></ul>
      ${never}
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
      root.innerHTML = `<p class="asc-note err">${icon("alert")}<span>${esc(error)}</span></p><button type="button" class="asc-btn asc-btn-secondary" data-retry>Réessayer</button>`;
      root.setAttribute("aria-busy", "false");
      return;
    }
    root.innerHTML = `${error ? `<p class="asc-note err">${icon("alert")}<span>${esc(error)}</span></p>` : ""}${walletHtml()}${lookHtml()}${shelfHtml()}${plusHtml()}
      <p class="asc-small asc-faint at-foot">Les pièces sont purement visuelles et restent dans ta collection. Les pièces TITAN+ se portent tant que l’abonnement est actif ; ensuite, ton apparence revient au style d’origine.</p>`;
    root.setAttribute("aria-busy", "false");
  }

  /* ---------- Actions ---------- */
  async function wear(id) {
    const item = data.items.find((i) => i.id === id);
    const { data: look, error: e } = await window.titanClient.rpc("titan_set_appearance", { p_slot: item.slot, p_item: id });
    if (e) throw e;
    data.appearance = look || {};
    syncUser();
    render();
    window.titanShell.toast({ type: "ok", title: `${item.name} porté`, message: item.slot === "map" ? "Ta carte d’aventure change de lumière." : item.slot === "card" ? "Tes prochaines cartes partagées prennent ce style." : "Ton portrait le montre partout dans TITAN." });
  }

  function buy(id) {
    const item = data.items.find((i) => i.id === id);
    const left = (Number(data.credits) || 0) - item.price;
    window.titanShell.confirm({
      title: `Débloquer ${item.name} ?`,
      message: `${F().number(item.price)} crédits. Il t’en restera ${F().number(left)}.`,
      detail: "Une pièce visuelle, gardée dans ta collection. Aucun effet sur l’XP, les gardiens ou les classements.",
      confirmLabel: "Débloquer et porter",
      action: async () => {
        const { data: r, error: e } = await window.titanClient.rpc("titan_purchase_shop_item", { p_item_id: id });
        if (e) throw new Error(messageOf(e));
        const row = Array.isArray(r) ? r[0] : r;
        data.credits = Number(row?.credits_after ?? left);
        item.owned = true;
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
    if (b.dataset.slot) {
      slot = b.dataset.slot;
      render();
      if (b.classList.contains("at-look-slot")) document.getElementById("collection")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (b.dataset.wear)
      return wear(b.dataset.wear).catch((err) => window.titanShell.toast({ type: "warn", message: messageOf(err) }));
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
