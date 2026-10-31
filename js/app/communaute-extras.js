/* V11-75: a short "Plus loin" row under the four main sections of the Communauté, listing only the optional panels that are actually shown
   (votes and ideas, duel links, clubs, factions, Pantheon). They are switched on one by one from the server, so the row follows what is visible
   and disappears when nothing is. Links only: nothing is sent or stored. */
(function () {
  "use strict";
  const PANELS = [
    ["consultations", "Votes et idées"], ["duels", "Défis par lien"], ["clubs", "Clubs"], ["factions", "Factions"], ["pantheon", "Panthéon"],
  ];
  let nav = null;
  function render() {
    if (!nav) return;
    const shown = PANELS.filter(([id]) => { const el = document.getElementById(id); return el && !el.hidden && el.innerHTML.trim() !== ""; });
    if (!shown.length) { nav.hidden = true; nav.innerHTML = ""; return; }
    nav.hidden = false;
    nav.innerHTML = `<span class="asc-small asc-muted">Plus loin</span> ${shown.map(([id, label]) => `<a class="asc-btn asc-btn-secondary asc-btn-sm" href="#${id}">${window.titanEsc(label)}</a>`).join(" ")}`;
  }
  function boot() {
    nav = document.getElementById("communaute-extras");
    if (!nav) return;
    for (const [id] of PANELS) {
      const el = document.getElementById(id);
      if (el) {
        el.tabIndex = -1;
        new MutationObserver(() => render()).observe(el, { attributes: true, attributeFilter: ["hidden"], childList: true });
      }
    }
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
