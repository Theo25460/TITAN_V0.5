/* TITAN — Google Play links on the public pages and the shared athlete card (GP12 to GP15, SEO09). Loaded only by pages generated with
   the public listing (tools/data/play-store.json) and by athlete.html, which carries the same listing.
   - Every link leads to the exact public listing, with no added parameter: the address is the one a person can check.
   - GP13: links whose page carries no valid listing are removed, so a wrong address can never be followed.
   - GP14: inside the Android app (Trusted Web Activity) TITAN is already installed: the links are removed. An installed PWA hides them
     in CSS (public.css), before any script runs.
   - GP15: no fixed bar, no pop-up: the links sit in the page (hero, closing call to action, footer, athlete card) and never cover it.
   - Measure: this script sends nothing. Each link has a stable id per placement (play-hero, play-final, play-footer, play-athlete-card):
     if the GA4 property records outbound clicks (Enhanced measurement), a visitor who accepted GA4 is counted with that id, and no one
     else. A click is not an installation. */
(function () {
  "use strict";
  const LISTING = /^https:\/\/play\.google\.com\/store\/apps\/details\?id=fr\.titanapp\.app$/;
  const meta = document.querySelector('meta[name="titan-play-store"]');
  const listing = meta ? String(meta.getAttribute("content") || "") : "";

  const inAndroidApp = () => {
    try {
      if (new URLSearchParams(location.search).get("source") === "twa" || document.referrer.startsWith("android-app://")) return true;
      return localStorage.getItem("titan_twa") === "1";
    } catch {
      return false;
    }
  };
  const installed = () => {
    try { return window.matchMedia("(display-mode: standalone)").matches; } catch { return false; }
  };
  const ok = LISTING.test(listing) && !inAndroidApp() && !installed();
  window.TitanPlayStore = Object.freeze({ listing: ok ? listing : "" });

  const sweep = () => {
    if (ok) {
      document.querySelectorAll("a[data-play-store]").forEach((a) => {
        if (a.getAttribute("href") !== listing) a.setAttribute("href", listing);
      });
      return;
    }
    document.documentElement.classList.add("titan-no-play");
    document.querySelectorAll("[data-play-store-zone], [data-play-store]").forEach((el) => el.remove());
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sweep, { once: true });
  else sweep();
})();
