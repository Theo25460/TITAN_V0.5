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
    if (banner) { banner.remove(); banner = null; }
    if (choice === "granted") {
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
    heading.textContent = "Statistiques anonymisées de fréquentation";
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
  }

  function addSettingsButton() {
    settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.className = "titan-ga4-settings";
    settingsButton.textContent = "Statistiques";
    settingsButton.setAttribute("aria-label", "Gérer les statistiques Google Analytics");
    settingsButton.addEventListener("click", showBanner);
    document.body.appendChild(settingsButton);
  }

  function addStyles() {
    const style = document.createElement("style");
    style.textContent = [
      ".titan-ga4-settings{position:fixed;z-index:10000;left:9px;bottom:9px;padding:5px 9px;border-radius:999px;border:1px solid #5c6674;background:#101821;color:#e8edf3;font:12px system-ui,sans-serif;cursor:pointer;opacity:.8}",
      ".titan-ga4-settings:focus-visible,.titan-ga4-banner button:focus-visible,.titan-ga4-banner a:focus-visible{outline:3px solid #77c9fb;outline-offset:2px}",
      ".titan-ga4-banner{position:fixed;z-index:10001;bottom:42px;left:12px;right:12px;max-width:470px;box-sizing:border-box;padding:18px;border:1px solid #657182;border-radius:14px;background:#111922;color:#f2f5f9;box-shadow:0 15px 45px #0009;font:14px/1.5 system-ui,sans-serif}",
      ".titan-ga4-banner strong{display:block;font-size:15px}.titan-ga4-banner p{margin:8px 0}.titan-ga4-banner a{color:#9bdafa}",
      ".titan-ga4-controls{display:flex;gap:10px;margin-top:14px}.titan-ga4-controls button{flex:1;min-height:42px;padding:9px;border:1px solid #acbacb;border-radius:9px;background:#222f3d;color:white;font:600 14px system-ui,sans-serif;cursor:pointer}",
      ".titan-ga4-controls button:last-child{background:#d5f0fb;border-color:#d5f0fb;color:#102232}",
      "@media(min-width:520px){.titan-ga4-banner{right:auto;min-width:420px}}"
    ].join("");
    document.head.appendChild(style);
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
