(function () {
  "use strict";
  const toggle = document.querySelector(".menu-toggle"),
    menu = document.getElementById("public-menu");
  const close = () => {
    if (!menu) return;
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Ouvrir le menu");
  };
  toggle?.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    toggle.setAttribute("aria-expanded", String(!menu.hidden));
    toggle.setAttribute(
      "aria-label",
      menu.hidden ? "Ouvrir le menu" : "Fermer le menu",
    );
  });
  menu?.addEventListener("click", (e) => {
    if (e.target.closest("a")) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu && !menu.hidden) {
      close();
      toggle.focus();
    }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".site-header")) close();
  });
  const content = document.getElementById("preview-content");
  if (content) {
    const views = {
      log: content.innerHTML,
      journal: `<p class="tiny-label">Une semaine qui te ressemble.</p><h3>Ton journal, vivant.</h3><div class="preview-week">${["L", "M", "M", "J", "V", "S", "D"].map((d, i) => `<span>${d}<b class="${[0, 2, 4].includes(i) ? "done" : ""}">${[0, 2, 4].includes(i) ? "✓" : "–"}</b></span>`).join("")}</div><div class="preview-row"><strong>Course à pied</strong><span>5,2 km · 32 min</span></div><div class="preview-row"><strong>Musculation</strong><span>45 min · 4 exercices</span></div><div class="preview-row"><strong>Escalade</strong><span>60 min · Voie</span></div><p class="preview-note">Chaque effort trouve sa place.</p>`,
      progress: `<p class="tiny-label">Les 7 derniers jours · Exemple fictif</p><h3>La régularité se construit.</h3><div class="preview-numbers"><div><span>Séances</span><strong>3</strong></div><div><span>Temps d’activité</span><strong>137 <small>min</small></strong></div></div><div class="preview-bars" role="img" aria-label="Exemple : 32 minutes lundi, 45 mercredi, 60 vendredi.">${[53, 2, 75, 2, 100, 2, 2].map((h) => `<i style="height:${h}%"></i>`).join("")}</div><p class="preview-note">Trois sports, une seule histoire. La tienne.</p>`,
    };
    const tabs = [...document.querySelectorAll("[data-preview]")];
    function activate(tab) {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
      });
      content.innerHTML = views[tab.dataset.preview];
      document
        .getElementById("experience-preview")
        .setAttribute("aria-labelledby", tab.id);
    }
    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => activate(tab));
      tab.addEventListener("keydown", (e) => {
        let next;
        if (["ArrowDown", "ArrowRight"].includes(e.key))
          next = tabs[(i + 1) % tabs.length];
        if (["ArrowUp", "ArrowLeft"].includes(e.key))
          next = tabs[(i + tabs.length - 1) % tabs.length];
        if (e.key === "Home") next = tabs[0];
        if (e.key === "End") next = tabs.at(-1);
        if (next) {
          e.preventDefault();
          activate(next);
          next.focus();
        }
      });
    });
  }
  try {
    const saved = JSON.parse(
      localStorage.getItem("titan_os_v12_save") || "null",
    );
    if (saved?.user?.id && !String(saved.user.id).startsWith("guest_")) {
      document.querySelectorAll(".login-link").forEach((a) => {
        a.textContent = "Mon espace";
        a.href = "/aujourdhui";
      });
    }
  } catch (_) {
    /* The website remains usable without local storage. */
  }
})();
