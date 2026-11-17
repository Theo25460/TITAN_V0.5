/* TITAN — the navigation, drawn before the page.
   This small file is the first script of an application page (after icons.js and crest.js). It draws the rail, the top row of a
   phone and the tab bar at once, from what this device remembers of the account (name, level, portrait, frame, rank), so the
   navigation is on the very first frame of every page instead of arriving once all scripts are read. shell.js then calls the
   same `mount` with the live account: identical markup touches nothing. Nothing here talks to the server or decides anything. */
(function () {
  "use strict";
  const icon = (n, c) => (window.titanIcon ? window.titanIcon(n, c) : "");
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

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
    { id: "aide", label: "Assistance", href: "/service", icon: "help" },
  ];
  const AVATARS = ["scout", "ranger", "keeper", "artisan", "navigator", "sentinel"];
  const KEY = "titan_shell_nav_v1";
  const GUEST = { id: null, guest: true, name: "Découverte", level: 1, avatar: "scout", frame: null, rank: "eclaireur" };

  const territory = () => document.body?.dataset.territory || "";

  /* What the device remembers of the navigation's account: read strictly, so a damaged entry can only fall back to the visitor. */
  function remembered() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!v || typeof v !== "object" || v.guest) return GUEST;
      const name = typeof v.name === "string" ? v.name.slice(0, 60) : "";
      const level = Math.floor(Number(v.level));
      if (!name || !(level >= 1 && level <= 500)) return GUEST;
      return {
        id: typeof v.id === "string" ? v.id.slice(0, 64) : null,
        guest: false,
        name,
        level,
        avatar: AVATARS.includes(v.avatar) ? v.avatar : "scout",
        frame: typeof v.frame === "string" && /^[a-z]+-[a-z]+$/.test(v.frame) ? v.frame : null,
        rank: typeof v.rank === "string" && /^[a-z]+$/.test(v.rank) ? v.rank : "eclaireur",
      };
    } catch {
      return GUEST;
    }
  }
  function remember(u) {
    try {
      if (!u || u.guest) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, JSON.stringify({ id: u.id, guest: false, name: u.name, level: u.level, avatar: u.avatar, frame: u.frame || null, rank: u.rank || "eclaireur" }));
    } catch {}
  }
  function forget() {
    try { localStorage.removeItem(KEY); } catch {}
  }

  function avatarImg(u) {
    return `<span class="asc-avatar"${u.frame ? ` data-frame="${esc(u.frame)}"` : ""}><img src="/assets/renaissance/${u.avatar}-s.webp" alt="" width="64" height="64" loading="lazy" decoding="async"></span>`;
  }
  /* The rank worn in the navigation: the sculpted crest when the rank has one, nothing otherwise (the level says it in words). */
  function crestImg(u, size) {
    const c = window.TitanCrest;
    if (u.guest || !c || !c.BADGES || c.BADGES.indexOf(u.rank) < 0) return "";
    return `<img class="asc-nav-crest" src="/assets/ranks/${u.rank}-256.webp" alt="" width="${size}" height="${size}" decoding="async" draggable="false">`;
  }
  function navLink(t, cls) {
    const current = territory() === t.id ? ' aria-current="page"' : "";
    return `<a class="${cls}${t.record && cls === "asc-rail-link" ? " asc-rail-record" : ""}" href="${t.href}"${current}>${icon(t.icon)}<span>${t.record && cls === "asc-rail-link" ? "Nouvelle séance" : t.label}</span></a>`;
  }

  // A refresh whose markup is identical touches nothing: no node is replaced, nothing repaints, no focus or hover is lost (EQ-006).
  function put(el, html) {
    if (el.__shellHtml === html) return;
    el.__shellHtml = html;
    el.innerHTML = html;
  }

  /** Draws (or updates) the rail, the top row and the tab bar for account `u` and sync state `sync`. */
  function mount(u, sync) {
    const root = document.body;
    if (!root || !root.classList.contains("asc") || root.dataset.shell === "none") return;
    sync = sync || { state: "local", label: "" };
    const title = root.dataset.title || document.title.split("—")[0].trim();

    let rail = document.querySelector(".asc-rail");
    if (!rail) {
      rail = document.createElement("nav");
      rail.className = "asc-rail";
      rail.setAttribute("aria-label", "Navigation principale");
      root.prepend(rail);
    }
    put(rail, `
      <a class="asc-brand" href="/aujourdhui" aria-label="TITAN, QG">${window.titanMark ? window.titanMark() : ""}TITAN</a>
      <div class="asc-rail-nav">
        ${TERRITORIES.filter((t) => !t.record).slice(0, 2).map((t) => navLink(t, "asc-rail-link")).join("")}
        ${navLink(TERRITORIES.find((t) => t.record), "asc-rail-link")}
        ${TERRITORIES.filter((t) => !t.record).slice(2).map((t) => navLink(t, "asc-rail-link")).join("")}
      </div>
      <div class="asc-rail-sub">${SECONDARY.map((t) => navLink(t, "asc-rail-link")).join("")}</div>
      <a class="asc-rail-foot" href="/profile">${avatarImg(u)}<span><strong>${esc(u.name)}</strong><small><span class="asc-sync" data-state="${sync.state}" title="${esc(sync.label)}"></span>${u.guest ? "Sur cet appareil" : `Niveau ${u.level}`}</small></span>${crestImg(u, 34)}</a>`);

    let top = document.querySelector(".asc-topbar");
    if (!top) {
      top = document.createElement("header");
      top.className = "asc-topbar";
      root.prepend(top);
    }
    const isHome = territory() === "qg";
    put(top, `
      ${isHome ? `<a class="asc-brand" href="/aujourdhui" aria-label="TITAN">${window.titanMark ? window.titanMark() : ""}TITAN</a><span class="asc-topbar-title"></span>` : `<span class="asc-topbar-title">${esc(title)}</span>`}
      ${isHome ? '<span style="flex:1"></span>' : ""}
      <button type="button" class="asc-btn asc-btn-ghost asc-btn-icon asc-more" data-shell-more aria-label="Plus : Communauté, Coaching, Atelier, Assistance"${SECONDARY.some((t) => t.id === territory()) ? ' aria-current="page"' : ""}>${icon("menu")}</button>
      <a class="asc-me" href="/profile" aria-label="Profil : ${esc(u.name)}${u.guest ? "" : `, niveau ${u.level}`}. ${esc(sync.label)}">
        <span class="asc-sync" data-state="${sync.state}"></span>
        <span class="asc-me-level">${u.guest ? "Découverte" : `NIV ${u.level}`}</span>
        ${avatarImg(u)}
      </a>`);

    let tabs = document.querySelector(".asc-tabbar");
    if (!tabs) {
      tabs = document.createElement("nav");
      tabs.className = "asc-tabbar";
      tabs.setAttribute("aria-label", "Navigation principale");
      root.append(tabs);
    }
    put(tabs, TERRITORIES.map((t) => {
      const current = territory() === t.id ? ' aria-current="page"' : "";
      if (t.record)
        return `<a class="asc-tab asc-tab-record" href="${t.href}"${current} aria-label="Enregistrer une séance"><span class="asc-tab-plus">${icon("plus")}</span><span>${t.label}</span></a>`;
      return `<a class="asc-tab" href="${t.href}"${current}>${icon(t.icon)}<span>${t.label}</span></a>`;
    }).join(""));
  }

  // TITAN's own « Animations réduites » applies from the first frame, page transition included (shell.js keeps it up to date).
  try { if (localStorage.getItem("titan_motion_v1") === "reduced") document.documentElement.setAttribute("data-motion", "reduced"); } catch {}

  window.titanShellNav = { TERRITORIES, SECONDARY, AVATARS, mount, remember, forget, remembered, put };
  window.addEventListener("titan:account-changing", forget);
  // First frame: the remembered account (or the visitor). shell.js confirms it with the live one.
  mount(remembered(), null);
})();
