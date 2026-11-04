/* TITAN — Google Play link on the public pages (GP12 to GP15, SEO09). Loaded only when the site was generated with a public
   listing URL (tools/data/play-store.json); until then no page references it.
   - GP13: nothing is shown unless the page carries a valid listing URL.
   - GP14: nothing is shown inside the Android app (Trusted Web Activity), where the application is already installed.
   - GP15: on Android phones in a browser, a slim dismissible bar at the bottom of the page; the web stays fully usable.
   - GP12: the link carries a Play "referrer" with the page, without any personal data. */
(function () {
  "use strict";
  const LISTING = /^https:\/\/play\.google\.com\/store\/apps\/details\?id=fr\.titanapp\.app$/;
  const DISMISS_KEY = "titan_play_bar_dismissed";
  const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;
  const meta = document.querySelector('meta[name="titan-play-store"]');
  const base = meta ? String(meta.getAttribute("content") || "") : "";
  if (!LISTING.test(base)) return;

  const inAndroidApp = () => {
    try {
      if (new URLSearchParams(location.search).get("source") === "twa" || document.referrer.startsWith("android-app://")) return true;
      return localStorage.getItem("titan_twa") === "1";
    } catch {
      return false;
    }
  };
  if (inAndroidApp()) {
    document.querySelectorAll("[data-play-store]").forEach((el) => el.remove());
    return;
  }

  const slug = (location.pathname.replace(/^\/+|\/+$/g, "").replace(/\.html$/, "").replace(/[^a-z0-9_-]+/gi, "-") || "accueil").toLowerCase().slice(0, 40);
  const href = `${base}&referrer=${encodeURIComponent(`utm_source=titan-site&utm_medium=web&utm_campaign=${slug}`)}`;

  document.querySelectorAll("a[data-play-store]").forEach((a) => {
    a.setAttribute("href", href);
    a.removeAttribute("hidden");
  });

  const dismissed = () => {
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY));
      return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_MS;
    } catch {
      return false;
    }
  };
  const androidPhone = /Android/i.test(navigator.userAgent || "") && /Mobile/i.test(navigator.userAgent || "");
  const installed = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  if (!androidPhone || installed || dismissed()) return;

  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "/css/play-store.css?v=300.0";
  document.head.append(css);

  const bar = document.createElement("aside");
  bar.className = "play-bar";
  bar.setAttribute("aria-label", "Application Android");
  const text = document.createElement("span");
  text.textContent = "TITAN existe aussi sur Android.";
  const link = document.createElement("a");
  link.className = "asc-btn asc-btn-secondary";
  link.href = href;
  link.rel = "noopener";
  link.textContent = "Google Play";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "asc-btn asc-btn-ghost";
  close.setAttribute("aria-label", "Masquer cette proposition");
  close.textContent = "×";
  close.addEventListener("click", () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    bar.remove();
    document.body.classList.remove("has-play-bar");
  });
  bar.append(text, link, close);
  document.body.append(bar);
  document.body.classList.add("has-play-bar");
})();
