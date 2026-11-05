/* TITAN GA4 — separate explicit opt-in; no Google request before approval.
   This is independent of the first-party analytics privacy setting. */
(function () {
  "use strict";
  const ID = "G-WYXQPP00H2";
  const KEY = "titan_ga4_consent_v1";
  const EXCLUDED = /^\/(?:auth(?:\/|$)|u\/|update-password(?:\/|$)|supprimer-mon-compte(?:\/|$))/i;
  let started = false;
  let banner = null;
  let settingsButton = null;

  function savedChoice() {
    try {
      const choice = localStorage.getItem(KEY);
      return choice === "granted" || choice === "denied" ? choice : null;
    } catch (_) {
      return null;
    }
  }

  function remember(choice) {
    try {
      localStorage.setItem(KEY, choice);
      return true;
    } catch (_) {
      return false;
    }
  }

  function initTag() {
    if (started || EXCLUDED.test(location.pathname) || savedChoice() !== "granted") return;
    started = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
    window.gtag("consent", "update", { analytics_storage: "granted" });
    window.gtag("js", new Date());
    window.gtag("config", ID, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });
    // Never transmit the query string (OAuth tokens, email links, etc.) or fragment.
    window.gtag("event", "page_view", {
      page_location: location.origin + location.pathname,
      page_title: "TITAN",
      page_referrer: ""
    });
    const loader = document.createElement("script");
    loader.async = true;
    loader.src = "https://www.googletagmanager.com/gtag/js?id=" + ID;
    document.head.appendChild(loader);
  }

  // Conversions: sent only when the player accepted GA4 AND the server has confirmed the fact. No identifier, no e-mail, no sport data, no GPS:
  // the event carries nothing but its name. Each conversion is counted once per browser (a list of names, never of accounts).
  const CONVERSIONS = { sign_up: "sign_up", first_session: "first_session_confirmed", second_session: "second_session_confirmed" };
  const ONCE_KEY = "titan_ga4_once_v1";
  function conversion(name) {
    const eventName = CONVERSIONS[name];
    if (!eventName || !started || savedChoice() !== "granted" || typeof window.gtag !== "function") return false;
    let done = [];
    try { done = JSON.parse(localStorage.getItem(ONCE_KEY) || "[]") || []; } catch (_) {}
    if (done.includes(name)) return false;
    try { localStorage.setItem(ONCE_KEY, JSON.stringify([...done, name].slice(-10))); } catch (_) { return false; }
    window.gtag("event", eventName);
    return true;
  }
  window.TitanGa4 = { conversion };

  // A session counts as a conversion when the SERVER confirmed it (never the local save, never a guest session).
  window.addEventListener("titan:session-confirmed", event => {
    try {
      const owner = event.detail && event.detail.ownerId;
      if (!owner || String(owner).startsWith("guest_") || owner !== (window.state && window.state.user && window.state.user.id)) return;
      const logs = window.TitanProgress ? window.TitanProgress.activeLogs(window.state.history || []) : [];
      const confirmed = logs.filter(l => l.syncStatus !== "pending" && l.syncStatus !== "error" && l.syncStatus !== "local").length;
      if (confirmed === 1) conversion("first_session");
      else if (confirmed === 2) conversion("second_session");
    } catch (_) {}
  });

  function expireAnalyticsCookies() {
    const names = document.cookie.split(";").map(part => part.trim().split("=")[0])
      .filter(name => name === "_ga" || name.startsWith("_ga_"));
    const hostname = location.hostname;
    for (const name of names) {
      document.cookie = name + "=; Max-Age=0; path=/; SameSite=Lax";
      if (hostname === "titan-app.fr" || hostname.endsWith(".titan-app.fr")) {
        document.cookie = name + "=; Max-Age=0; path=/; domain=.titan-app.fr; SameSite=Lax";
      }
    }
  }

  function setChoice(choice) {
    const persisted = remember(choice);
    if (banner) { banner.remove(); banner = null; reserveRoom(); }
    if (choice === "granted") {
      window["ga-disable-" + ID] = false;
      // If storage is unavailable, don't start analytics; show the choice on next visit.
      if (persisted) initTag();
    } else {
      window["ga-disable-" + ID] = true;
      if (typeof window.gtag === "function") {
        window.gtag("consent", "update", { analytics_storage: "denied" });
      }
      expireAnalyticsCookies();
      if (started) location.reload(); // Unload the script after revocation.
    }
    if (settingsButton) settingsButton.textContent = "Statistiques";
  }

  function showBanner() {
    if (banner) return;
    banner = document.createElement("section");
    banner.className = "titan-ga4-banner";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Choix des statistiques Google Analytics");
    const heading = document.createElement("strong");
    heading.textContent = "Statistiques de fréquentation";
    const description = document.createElement("p");
    description.textContent = "Autorises-tu Google Analytics à mesurer les visites sur TITAN ? Aucun suivi Google sans ton accord. Tu peux changer d'avis à tout moment.";
    const privacy = document.createElement("a");
    privacy.href = "/legal_privacy";
    privacy.textContent = "Confidentialité";
    const controls = document.createElement("div");
    controls.className = "titan-ga4-controls";
    const deny = document.createElement("button");
    deny.type = "button";
    deny.textContent = "Refuser";
    deny.addEventListener("click", () => setChoice("denied"));
    const agree = document.createElement("button");
    agree.type = "button";
    agree.textContent = "Accepter";
    agree.addEventListener("click", () => setChoice("granted"));
    controls.append(deny, agree);
    banner.append(heading, description, privacy, controls);
    document.body.appendChild(banner);
    reserveRoom();
    window.addEventListener("resize", reserveRoom);
  }

  function addSettingsButton() {
    settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.className = "titan-ga4-settings";
    settingsButton.textContent = "Statistiques";
    settingsButton.setAttribute("aria-label", "Gérer les statistiques Google Analytics");
    settingsButton.addEventListener("click", showBanner);
    document.addEventListener("click", event => {
      if (event.target instanceof Element && event.target.closest("[data-ga4-open]")) showBanner();
    });
    // On pages with a footer the button lives there, in the flow, like any other link: nothing floats over the content.
    const footer = document.querySelector(".pub-footer .pub-wrap") || document.querySelector("body > footer, .pub-footer");
    if (footer) { footer.appendChild(settingsButton); settingsButton.style.margin = "12px 0 0"; }
    else { settingsButton.classList.add("is-floating"); document.body.appendChild(settingsButton); }
  }

  function addStyles() {
    const style = document.createElement("style");
    // TITAN design: same tokens as the rest of the site (fallbacks only if a page loads without them), compact, never over the desktop rail,
    // above the tab bar on the app screens, and the page keeps a bottom margin of its own height while it is open so nothing stays hidden.
    style.textContent = [
      ".titan-ga4-banner,.titan-ga4-settings{font-family:var(--font-text,system-ui,-apple-system,'Segoe UI',sans-serif);-webkit-font-smoothing:antialiased}",
      ".titan-ga4-banner{position:fixed;z-index:10001;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));box-sizing:border-box;max-width:460px;margin:0 auto;padding:14px 16px;border:1px solid var(--line-2,rgba(150,180,205,.22));border-radius:16px;background:var(--bg-2,#0e141a);color:var(--tx,#eef3f7);box-shadow:0 18px 48px rgba(0,0,0,.55);display:grid;grid-template-columns:1fr auto;grid-template-areas:'t t' 'p p' 'a c';align-items:center;gap:6px 12px}",
      ".titan-ga4-banner strong{grid-area:t;font-family:var(--font-display,'Archivo',system-ui,sans-serif);font-size:15px;font-weight:700;letter-spacing:.01em;line-height:1.25}",
      ".titan-ga4-banner p{grid-area:p;margin:0;font-size:13px;line-height:1.45;color:var(--tx-2,#a8b6c3)}",
      ".titan-ga4-banner>a{grid-area:a;justify-self:start;display:inline-flex;align-items:center;min-height:44px;font-size:13px;font-weight:650;color:var(--cy,#3dd9e8);text-decoration:underline;text-underline-offset:3px}",
      ".titan-ga4-controls{grid-area:c;display:flex;gap:8px}",
      ".titan-ga4-controls button{min-height:44px;min-width:92px;padding:0 16px;border:1px solid var(--line-2,rgba(150,180,205,.28));border-radius:12px;background:transparent;color:var(--tx,#eef3f7);font:700 14px var(--font-text,system-ui,sans-serif);cursor:pointer}",
      ".titan-ga4-controls button:last-child{background:var(--cy,#3dd9e8);border-color:var(--cy,#3dd9e8);color:#031418}",
      ".titan-ga4-controls button:hover{filter:brightness(1.12)}",
      ".titan-ga4-settings{padding:0 14px;min-height:44px;border:1px solid var(--line-2,rgba(150,180,205,.22));border-radius:999px;background:transparent;color:var(--tx-2,#a8b6c3);font-size:12px;font-weight:600;cursor:pointer}",
      ".titan-ga4-settings:hover{color:var(--tx,#eef3f7)}",
      ".titan-ga4-settings.is-floating{position:fixed;z-index:10000;left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));background:var(--bg-2,#0e141a)}",
      ".titan-ga4-settings:focus-visible,.titan-ga4-banner button:focus-visible,.titan-ga4-banner a:focus-visible{outline:3px solid var(--cy,#3dd9e8);outline-offset:2px}",
      "html.titan-ga4-open body{padding-bottom:var(--ga4-h,0px)}",
      "@media(max-width:380px){.titan-ga4-banner{grid-template-areas:'t a' 'p p' 'c c'}.titan-ga4-banner>a{min-height:24px;justify-self:end;white-space:nowrap}.titan-ga4-controls{justify-content:stretch}.titan-ga4-controls button{flex:1}}",
      // Desktop with the side rail: the card sits in the free area, never over the rail.
      "@media(min-width:960px){body[data-territory] .titan-ga4-banner{left:calc(var(--rail,248px) + 16px);margin:0}}",
      // App screens: the tab bar takes the bottom; the choice reopens from Profil.
      "body[data-territory] .titan-ga4-settings,body[data-shell=none] .titan-ga4-settings,body:has(.auth-card) .titan-ga4-settings{display:none}",
      "@media(max-width:959px){body[data-territory] .titan-ga4-banner{bottom:calc(var(--tabbar,68px) + env(safe-area-inset-bottom,0px) + 12px)}body[data-territory] .titan-ga4-banner{--ga4-lift:var(--tabbar,68px)}}",
      "@media(prefers-reduced-motion:no-preference){.titan-ga4-banner{animation:titan-ga4-in .22s ease-out both}@keyframes titan-ga4-in{from{opacity:0;transform:translateY(8px)}}}"
    ].join("");
    document.head.appendChild(style);
  }

  // Keeps the end of the page reachable above the open banner.
  function reserveRoom() {
    const root = document.documentElement;
    if (!banner) { root.classList.remove("titan-ga4-open"); root.style.removeProperty("--ga4-h"); return; }
    root.style.setProperty("--ga4-h", Math.ceil(banner.getBoundingClientRect().height + 24) + "px");
    root.classList.add("titan-ga4-open");
  }

  function boot() {
    addStyles();
    addSettingsButton();
    if (savedChoice() === "granted") initTag();
    if (savedChoice() === null) showBanner();
    window.addEventListener("storage", event => {
      if (event.key === KEY && event.newValue !== event.oldValue) location.reload();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
