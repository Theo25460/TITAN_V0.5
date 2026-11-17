/* « Plus loin », under the four main sections of the Communauté: the optional panels the server opens one by one (votes and ideas, duel
   links, clubs, factions, Pantheon). Each used to be laid out in full under the page, 10 500 px on a phone for a signed-in account.
   They are folded rows now: a row shows only when its panel has something to show, opens in place, and the device remembers which
   ones its owner keeps open. A link to #clubs (or any panel) opens its row. Nothing is sent or stored elsewhere. */
(function () {
  "use strict";
  const PANELS = ["consultations", "duels", "clubs", "factions", "pantheon"];
  const KEY = "titan_cm_open_v1";
  let section = null;
  const row = (id) => document.getElementById(id)?.closest("details.asc-fold") || null;
  function stored() {
    try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return new Set(Array.isArray(v) ? v : []); } catch { return new Set(); }
  }
  function render() {
    if (!section) return;
    let any = false;
    for (const id of PANELS) {
      const el = document.getElementById(id), fold = row(id);
      if (!el || !fold) continue;
      const shown = !el.hidden && el.innerHTML.trim() !== "";
      fold.hidden = !shown;
      any = any || shown;
    }
    section.hidden = !any;
  }
  function openFor(hash) {
    const id = String(hash || "").replace(/^#/, "");
    if (!PANELS.includes(id)) return;
    const fold = row(id);
    if (!fold || fold.hidden) return;
    fold.open = true;
    fold.scrollIntoView({ block: "start" });
  }
  function boot() {
    section = document.getElementById("communaute-extras");
    if (!section) return;
    const open = stored();
    for (const id of PANELS) {
      const el = document.getElementById(id), fold = row(id);
      if (!el || !fold) continue;
      el.tabIndex = -1;
      fold.open = open.has(id);
      fold.addEventListener("toggle", () => {
        const now = stored();
        if (fold.open) now.add(id); else now.delete(id);
        try { localStorage.setItem(KEY, JSON.stringify([...now])); } catch { /* storage refused: the row still opens */ }
      });
      new MutationObserver(() => { render(); if (location.hash === `#${id}`) openFor(location.hash); }).observe(el, { attributes: true, attributeFilter: ["hidden"], childList: true });
    }
    window.addEventListener("hashchange", () => openFor(location.hash));
    render();
    openFor(location.hash);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
