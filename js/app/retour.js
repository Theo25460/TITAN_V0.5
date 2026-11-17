/* « Depuis ta dernière visite » on the website (social lot D). Behind the server flag screens.digest. Reads public.titan_social_digest_v1
   with the time this device last showed it to this account (localStorage, per account, a convenience only: without it, 7 days).
   Shown only when something happened; worded by js/core/social-digest.js; nothing is pushed, nothing is counted against anyone. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n) => window.titanIcon(n);
  const FLAG = "screens.digest";
  const KEY = (owner) => `titan_social_seen_v1:${owner}`;
  const ICONS = { celebrate: "medal", together: "route", circle: "heart", memory: "compass", suggest: "sparkle" };
  let root = null;
  let scope = null;
  let shown = null; // { owner, lines }

  const context = () => ({ owner: window.state?.user?.id || null, client: window.titanClient || null, epoch: window.titanAccountTransition?.epoch });
  const same = (a, b) => a && b && a.owner === b.owner && a.client === b.client && a.epoch === b.epoch && !window.titanAccountTransition?.active;
  const guest = () => !context().owner || String(context().owner).startsWith("guest_");
  const on = () => !guest() && !window.titanAccountTransition?.active && window.titanFlags?.enabled?.(FLAG, false) === true;
  const seen = (owner) => { try { const v = localStorage.getItem(KEY(owner)); return v && !Number.isNaN(Date.parse(v)) ? v : null; } catch { return null; } };
  const remember = (owner) => { try { localStorage.setItem(KEY(owner), new Date().toISOString()); } catch { /* private mode: 7 days next time */ } };

  function render() {
    if (!root) return;
    const lines = shown && same(scope, context()) ? shown.lines : [];
    if (!on() || !lines.length || !lines.some((l) => l.kind !== "suggest")) { root.hidden = true; root.innerHTML = ""; return; }
    root.hidden = false;
    root.innerHTML = `<div class="asc-section-head"><h2 id="retour-title">Depuis ta dernière visite</h2></div>
      <ul class="asc-list cm-retour" data-retour>${lines.map((l) => `<li class="asc-row" data-retour-line="${esc(l.id)}">${icon(ICONS[l.kind] || "dot")}<span class="asc-row-main"><span class="asc-row-title">${esc(l.text)}</span></span>
        ${l.kind === "suggest" ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-retour-cordee="${esc(l.pace || "")}">Former une cordée</button>` : `<a class="asc-btn asc-btn-ghost asc-btn-sm" href="${esc(l.href)}">Voir</a>`}</li>`).join("")}</ul>`;
  }

  async function refresh() {
    const ask = context();
    scope = ask;
    if (!root || !on() || !navigator.onLine) return render();
    try {
      const { data: auth } = await ask.client.auth.getSession();
      const session = auth?.session;
      if (!same(ask, context()) || session?.user?.id !== ask.owner || !session?.access_token) return;
      const since = seen(ask.owner);
      const { data, error } = await ask.client.rpc("titan_social_digest_v1", { p_since: since }).setHeader("Authorization", `Bearer ${session.access_token}`);
      if (!same(ask, context()) || error) return render();
      shown = { owner: ask.owner, lines: window.TitanSocialDigest.lines(data) };
      const pace = shown.lines.find((l) => l.kind === "suggest")?.pace;
      if (pace && window.TitanCordeeView) window.TitanCordeeView.suggestedPace = pace;
      render();
      // What was shown is now seen: the next visit starts from here.
      remember(ask.owner);
    } catch { if (same(ask, context())) render(); }
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-retour-cordee]");
    if (!b) return;
    if (window.TitanCordeeView) window.TitanCordeeView.suggestedPace = b.dataset.retourCordee || "douce";
    const create = document.querySelector("#cordee [data-cordee-new]");
    if (create) create.click(); else document.getElementById("cordee")?.scrollIntoView({ block: "start" });
  });
  window.addEventListener("titan:account-changing", () => { shown = null; render(); });
  ["titan:account-changed", "titan:flags-updated"].forEach((ev) => window.addEventListener(ev, () => { shown = null; refresh(); }));
  function start() { root = document.getElementById("retour"); if (root) refresh(); }
  window.TitanRetour = { refresh };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0)); else setTimeout(start, 0);
})();
