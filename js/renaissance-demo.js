(function () {
  "use strict";
  const host = document.getElementById("renaissance-demo"),
    tabs = [...document.querySelectorAll("[data-demo]")];
  if (!host) return;
  const views = {
    sport: host.innerHTML,
    personnage: `<p class="eyebrow">EXEMPLE FICTIF · LE PERSONNAGE</p><h3>Ton niveau garde le fil.</h3><div class="rp-demo-numbers"><div><strong>6</strong><span>niveau</span></div><div><strong>4</strong><span>avatars accessibles</span></div><div><strong>7</strong><span>rangs à explorer</span></div></div><div class="rp-demo-row"><strong>Rang actuel</strong><span>Sentinelle</span></div><div class="rp-demo-row"><strong>Prochain rang</strong><span>Gardien · niveau 10</span></div><div class="rp-demo-row"><strong>Après une pause</strong><span>Niveau conservé</span></div><p class="rp-fine">Les XP officielles sont confirmées par le serveur. Le niveau décrit le jeu, pas une aptitude physique certifiée.</p>`,
    aventure: `<p class="eyebrow">EXEMPLE FICTIF · LA VALLÉE DE L’AUBE</p><h3>Le refuge des cèdres.</h3><p class="rp-muted">Les trois premiers insignes sont acquis. Une nouvelle étape s’ouvre, sans date limite.</p><div class="rp-demo-trail" aria-label="Exemple : 3 étapes accomplies sur 9"><span>✓</span><i></i><span>✓</span><i></i><span>✓</span><i></i><span>04</span><i></i><span>…</span><i></i><span>09</span></div><div class="rp-demo-row"><strong>Mission de cette étape</strong><span>2 jours de pratique</span></div><div class="rp-demo-row"><strong>Insigne à gagner</strong><span>Gardien du rythme</span></div><p class="rp-fine">Les séances doivent être enregistrées après le départ de l’étape. Une journée compte une seule fois.</p>`,
  };
  function activate(tab) {
    tabs.forEach((t) => {
      t.setAttribute("aria-selected", String(t === tab));
      t.tabIndex = t === tab ? 0 : -1;
    });
    host.innerHTML = views[tab.dataset.demo];
    host.setAttribute("aria-labelledby", tab.id);
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => activate(tab));
    tab.addEventListener("keydown", (e) => {
      let target;
      if (["ArrowRight", "ArrowDown"].includes(e.key))
        target = tabs[(i + 1) % tabs.length];
      if (["ArrowLeft", "ArrowUp"].includes(e.key))
        target = tabs[(i + tabs.length - 1) % tabs.length];
      if (e.key === "Home") target = tabs[0];
      if (e.key === "End") target = tabs.at(-1);
      if (target) {
        e.preventDefault();
        activate(target);
        target.focus();
      }
    });
  });
})();
