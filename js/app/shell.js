/* TITAN 300 — application shell.
   One navigation for every app page: desktop rail, mobile top bar and tab bar.
   Also owns toasts, sheets and the sync indicator, and replaces the legacy
   injectSidebar / showNotification / titanSetSyncStatus globals in place. */
(function () {
  "use strict";
  const icon = (n, c) => (window.titanIcon ? window.titanIcon(n, c) : "");
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  window.titanEsc = esc;

  const TERRITORIES = [
    { id: "qg", label: "QG", href: "/aujourdhui", icon: "home" },
    { id: "progres", label: "Progrès", href: "/stats", icon: "chart" },
    { id: "seance", label: "Séance", href: "/training", icon: "plus", record: true },
    { id: "aventure", label: "Aventure", href: "/adventure", icon: "compass" },
    { id: "profil", label: "Profil", href: "/profile", icon: "user" },
  ];
  const SECONDARY = [
    { id: "communaute", label: "Communauté", href: "/social", icon: "group" },
    { id: "coaching", label: "Coaching", href: "/coaching", icon: "shield" },
    { id: "atelier", label: "Atelier", href: "/boutique", icon: "sparkle" },
    { id: "aide", label: "Aide", href: "/service", icon: "help" },
  ];
  /* Pages of a territory; a page opts in with <nav class="asc-subnav" data-subnav></nav>. */
  const SUBNAV = {
    progres: [
      { label: "Semaine", href: "/stats" },
      { label: "Journal", href: "/journal" },
      { label: "Records", href: "/records" },
      { label: "Objectifs", href: "/objectifs" },
    ],
    seance: [
      { label: "Enregistrer", href: "/training" },
      { label: "Prévoir", href: "/prevoir" },
    ],
  };
  const AVATARS = ["scout", "ranger", "keeper", "artisan", "navigator", "sentinel"];

  let syncState = { state: navigator.onLine ? "local" : "offline", label: "" };
  let explicitSync = null;

  function territory() {
    return document.body.dataset.territory || "";
  }

  function snapshot() {
    const id = window.state?.user?.id;
    if (!id) return null;
    if (window.TitanAdventure?.snapshot?.owner === id) return window.TitanAdventure.snapshot;
    try {
      const s = JSON.parse(localStorage.getItem("titan_adventure_v1:" + id) || "null");
      return s?.owner === id ? s : null;
    } catch {
      return null;
    }
  }

  function user() {
    const u = window.state?.user || {};
    const s = snapshot();
    const guest = !u.id || String(u.id).startsWith("guest_");
    return {
      id: u.id || null,
      guest,
      name: guest ? "Découverte" : u.name || u.username || "Athlète",
      level: Number(s?.level ?? u.level ?? 1) || 1,
      avatar: AVATARS.includes(s?.avatar) ? s.avatar : "scout",
      frame: guest ? null : look().frame,
    };
  }

  /* Equipped cosmetics as last confirmed by the server (titan_atelier / profile row). Display only:
     TITAN+ pieces fall back to the default look as soon as the local status says the plan ended. */
  const PLUS_PIECES = new Set(["frame-aegis", "frame-frost", "map-aurora", "card-obsidian"]);
  function look() {
    const a = window.state?.user?.appearance || {};
    const out = {};
    for (const k of ["frame", "map", "card"]) {
      const v = String(a[k] || "");
      if (!/^[a-z]+-[a-z]+$/.test(v) || v.endsWith("-default") || v === "frame-standard") continue;
      if (PLUS_PIECES.has(v) && window.state?.user?.is_elite !== true) continue;
      out[k] = v;
    }
    return out;
  }

  function avatarImg(u) {
    return `<span class="asc-avatar"${u.frame ? ` data-frame="${u.frame}"` : ""}><img src="/assets/renaissance/${u.avatar}-s.webp" alt="" width="64" height="64" loading="lazy" decoding="async"></span>`;
  }

  function computeSync() {
    if (!navigator.onLine) return { state: "offline", label: "Hors ligne — tes séances restent sur cet appareil" };
    const pending = window.TitanQueue?.list?.().length || 0;
    if (explicitSync?.state === "error") return explicitSync;
    if (pending) return { state: "pending", label: `${pending} séance${pending > 1 ? "s" : ""} en attente de synchronisation` };
    if (user().guest) return { state: "local", label: "Découverte : données sur cet appareil" };
    return { state: "cloud", label: "Synchronisé" };
  }

  function navLink(t, cls) {
    const current = territory() === t.id ? ' aria-current="page"' : "";
    return `<a class="${cls}${t.record && cls === "asc-rail-link" ? " asc-rail-record" : ""}" href="${t.href}"${current}>${icon(t.icon)}<span>${t.record && cls === "asc-rail-link" ? "Nouvelle séance" : t.label}</span></a>`;
  }

  function render() {
    const root = document.body;
    if (!root.classList.contains("asc")) return;
    if (root.dataset.shell === "none") {
      // Focused flows (onboarding): no navigation, but toasts still have a home.
      if (!document.querySelector(".asc-toasts")) {
        const t = document.createElement("div");
        t.className = "asc-toasts";
        t.setAttribute("role", "status");
        t.setAttribute("aria-live", "polite");
        root.append(t);
      }
      return;
    }
    const u = user();
    syncState = computeSync();
    const title = document.body.dataset.title || document.title.split("—")[0].trim();

    let rail = document.querySelector(".asc-rail");
    if (!rail) {
      rail = document.createElement("nav");
      rail.className = "asc-rail";
      rail.setAttribute("aria-label", "Navigation principale");
      root.prepend(rail);
    }
    rail.innerHTML = `
      <a class="asc-brand" href="/aujourdhui" aria-label="TITAN, QG">${window.titanMark ? window.titanMark() : ""}TITAN</a>
      <div class="asc-rail-nav">
        ${TERRITORIES.filter((t) => !t.record).slice(0, 2).map((t) => navLink(t, "asc-rail-link")).join("")}
        ${navLink(TERRITORIES.find((t) => t.record), "asc-rail-link")}
        ${TERRITORIES.filter((t) => !t.record).slice(2).map((t) => navLink(t, "asc-rail-link")).join("")}
      </div>
      <div class="asc-rail-sub">${SECONDARY.map((t) => navLink(t, "asc-rail-link")).join("")}</div>
      <a class="asc-rail-foot" href="/profile">${avatarImg(u)}<span><strong>${esc(u.name)}</strong><small><span class="asc-sync" data-state="${syncState.state}" title="${esc(syncState.label)}"></span>${u.guest ? "Sur cet appareil" : `Niveau ${u.level}`}</small></span></a>`;

    let top = document.querySelector(".asc-topbar");
    if (!top) {
      top = document.createElement("header");
      top.className = "asc-topbar";
      root.prepend(top);
    }
    const isHome = territory() === "qg";
    top.innerHTML = `
      ${isHome ? `<a class="asc-brand" href="/aujourdhui" aria-label="TITAN">${window.titanMark ? window.titanMark() : ""}TITAN</a><span class="asc-topbar-title"></span>` : `<span class="asc-topbar-title">${esc(title)}</span>`}
      ${isHome ? '<span style="flex:1"></span>' : ""}
      <button type="button" class="asc-btn asc-btn-ghost asc-btn-icon asc-more" data-shell-more aria-label="Plus : Communauté, Coaching, Atelier, Aide"${SECONDARY.some((t) => t.id === territory()) ? ' aria-current="page"' : ""}>${icon("menu")}</button>
      <a class="asc-me" href="/profile" aria-label="Profil : ${esc(u.name)}${u.guest ? "" : `, niveau ${u.level}`}. ${esc(syncState.label)}">
        <span class="asc-sync" data-state="${syncState.state}"></span>
        <span class="asc-me-level">${u.guest ? "Découverte" : `NIV ${u.level}`}</span>
        ${avatarImg(u)}
      </a>`;

    let tabs = document.querySelector(".asc-tabbar");
    if (!tabs) {
      tabs = document.createElement("nav");
      tabs.className = "asc-tabbar";
      tabs.setAttribute("aria-label", "Navigation principale");
      root.append(tabs);
    }
    tabs.innerHTML = TERRITORIES.map((t) => {
      const current = territory() === t.id ? ' aria-current="page"' : "";
      if (t.record)
        return `<a class="asc-tab asc-tab-record" href="${t.href}"${current} aria-label="Enregistrer une séance"><span class="asc-tab-plus">${icon("plus")}</span><span>${t.label}</span></a>`;
      return `<a class="asc-tab" href="${t.href}"${current}>${icon(t.icon)}<span>${t.label}</span></a>`;
    }).join("");

    const sub = document.querySelector("[data-subnav]");
    const pages = SUBNAV[territory()];
    if (sub && pages) {
      const here = location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
      sub.setAttribute("aria-label", "Pages de " + (TERRITORIES.find((t) => t.id === territory())?.label || "la section"));
      sub.innerHTML = pages.map((p) => `<a href="${p.href}"${here === p.href ? ' aria-current="page"' : ""}>${esc(p.label)}</a>`).join("");
    }

    if (!document.querySelector(".asc-toasts")) {
      const t = document.createElement("div");
      t.className = "asc-toasts";
      t.setAttribute("role", "status");
      t.setAttribute("aria-live", "polite");
      root.append(t);
    }
  }

  let renderQueued = false;
  function refresh() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
  }

  /* ---------- Toasts ---------- */
  const QUIET = /^(DB|SYNC|CLOUD|SAUVEGARDE)|SUPABASE|POSTGREST|PGRST|TABLE\(S\) A VERIFIER|DB MODE SECOURS/i;
  function sentence(s) {
    const v = String(s || "").trim();
    if (!v) return "";
    if (v === v.toUpperCase() && /[A-ZÀ-Ü]{3}/.test(v)) return v.charAt(0) + v.slice(1).toLowerCase();
    return v;
  }
  function toast({ type = "info", title = "", message = "", timeout = 4800 } = {}) {
    const box = document.querySelector(".asc-toasts");
    if (!box) return null;
    const kind = { success: "ok", ok: "ok", level: "ok", error: "err", err: "err", warning: "warn", warn: "warn" }[type] || "info";
    const ic = { ok: "check", err: "alert", warn: "alert", info: "info" }[kind];
    const el = document.createElement("div");
    el.className = `asc-toast ${kind}`;
    el.innerHTML = `${icon(ic)}<div>${title ? `<strong>${esc(sentence(title))}</strong>` : ""}${message ? `<p>${esc(message)}</p>` : ""}</div>`;
    el.addEventListener("click", () => el.remove());
    box.append(el);
    while (box.children.length > 3) box.firstElementChild.remove();
    if (timeout) setTimeout(() => el.remove(), timeout);
    return el;
  }

  /* ---------- Sheets ---------- */
  function sheet({ title = "", eyebrow = "", body = "", onClose } = {}) {
    const d = document.createElement("dialog");
    d.className = "asc-sheet";
    d.setAttribute("aria-label", title);
    d.innerHTML = `<div class="asc-sheet-body"><div class="asc-sheet-head"><div class="asc-stack-sm">${eyebrow ? `<p class="asc-eyebrow">${esc(eyebrow)}</p>` : ""}<h2 class="asc-h2">${esc(title)}</h2></div><button type="button" class="asc-btn asc-btn-ghost asc-btn-icon" data-close aria-label="Fermer">${icon("close")}</button></div><div data-sheet-content></div></div>`;
    const content = d.querySelector("[data-sheet-content]");
    if (body instanceof Node) content.append(body);
    else content.innerHTML = body;
    d.querySelector("[data-close]").addEventListener("click", () => d.close());
    d.addEventListener("click", (e) => {
      if (e.target === d) d.close();
    });
    d.addEventListener("close", () => {
      d.remove();
      onClose?.();
    });
    document.body.append(d);
    d.showModal();
    return d;
  }

  /** Accessible confirmation; resolves true only on an explicit confirm. `action` may be async and throw. */
  function confirm({ title = "", message = "", detail = "", confirmLabel = "Confirmer", danger = false, action } = {}) {
    return new Promise((resolve) => {
      let done = false;
      const body = document.createElement("div");
      body.className = "asc-stack";
      body.innerHTML = `${message ? `<p>${esc(message)}</p>` : ""}${detail ? `<p class="asc-small asc-muted">${esc(detail)}</p>` : ""}<p class="asc-small" role="alert" data-error></p>
        <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-cancel>Annuler</button><button type="button" class="asc-btn ${danger ? "asc-btn-danger" : "asc-btn-primary"}" data-ok>${esc(confirmLabel)}</button></div>`;
      const d = sheet({ title, body, onClose: () => !done && resolve(false) });
      body.querySelector("[data-cancel]").addEventListener("click", () => d.close());
      const ok = body.querySelector("[data-ok]");
      ok.addEventListener("click", async () => {
        ok.disabled = true;
        try {
          if (action) await action();
          done = true;
          resolve(true);
          d.close();
        } catch (error) {
          body.querySelector("[data-error]").textContent = error?.message || "Action impossible pour le moment.";
          ok.disabled = false;
        }
      });
      setTimeout(() => ok.focus(), 30);
    });
  }

  /* Secondary destinations on mobile: one tap from the top bar, out of the main tab bar. */
  function openMore() {
    const body = `<nav class="asc-list" aria-label="Plus">${SECONDARY.map((t) => `<a class="asc-row" href="${t.href}"${territory() === t.id ? ' aria-current="page"' : ""}><span class="asc-row-icon">${icon(t.icon)}</span><span class="asc-row-main"><span class="asc-row-title">${esc(t.label)}</span><span class="asc-row-sub">${esc(MORE_HINTS[t.id] || "")}</span></span>${icon("chevron")}</a>`).join("")}</nav>
      <p class="asc-small asc-faint asc-more-legal"><a href="/legal_cgu">Conditions</a> · <a href="/legal_privacy">Confidentialité</a> · <a href="/changelog">Nouveautés</a></p>`;
    sheet({ title: "Plus", body });
  }
  const MORE_HINTS = {
    communaute: "Expéditions, amis, défis, guilde",
    coaching: "Partager tes séances avec un coach, sous ton contrôle",
    atelier: "Personnalisation et TITAN+",
    aide: "Questions, contact, signaler un problème",
  };
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-shell-more]")) openMore();
  });

  /* ---------- Legacy compatibility ---------- */
  window.titanShell = { refresh, toast, sheet, confirm, user, look, territories: TERRITORIES, esc };
  window.injectSidebar = refresh;
  window.injectMobileHeader = refresh;
  window.injectMobileNav = refresh;
  window.setupNotificationSystem = () => {};
  window.showNotification = function (type, title, message) {
    if (QUIET.test(String(title || "")) || QUIET.test(String(message || ""))) {
      if (type !== "error") return;
    }
    toast({ type, title, message });
  };
  window.showToast = (message, type = "info") => toast({ type, message });
  window.titanSetSyncStatus = function (status = "local", message = "") {
    explicitSync = status === "error" ? { state: "error", label: message || "Synchronisation impossible" } : null;
    refresh();
  };

  ["titan:adventure-updated", "titan:history-updated", "titan:pending-changed", "online", "offline"].forEach((ev) =>
    window.addEventListener(ev, () => {
      if (ev === "online") explicitSync = null;
      refresh();
    }),
  );
  window.addEventListener("offline", () =>
    toast({ type: "warn", title: "Hors ligne", message: "Tu peux continuer : tes séances restent sur cet appareil et partiront au retour du réseau." }),
  );
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
