(function () {
  "use strict";
  const R = window.TitanRenaissance,
    A = window.TitanAdventure,
    C = window.TitanCodex;
  let filter = "all";
  function render() {
    const host = document.getElementById("character-content"),
      s = A.snapshot;
    if (!host || !window.state?.user) return;
    if (!s) {
      host.innerHTML = `<div class="r-panel"><p>${A.status === "error" ? "Impossible de charger le personnage pour le moment." : "Chargement de ton personnage…"}</p><button id="character-retry" class="r-button">Actualiser</button></div>`;
      document.getElementById("character-retry").onclick = () =>
        A.refresh({ force: true });
      return;
    }
    const logs = window.TitanInsights.active(window.state.history),
      days = new Set(logs.map((l) => window.TitanTraining.dateKey(l.date)))
        .size;
    host.innerHTML = `<div class="r-tabs"><a aria-current="page" href="/personnage">${R.icon("user")}Personnage</a><a href="/profile">${R.icon("shield")}Compte et confidentialité</a><a href="/trophies">${R.icon("trophy")}Trophées sportifs</a></div><div class="r-avatar-current">${R.character(s)}<div class="r-career-grid"><div class="r-career"><span>Jours de pratique enregistrés</span><strong>${R.fmt(days)}</strong><span>Ton niveau ne baisse pas après une pause.</span></div><div class="r-career"><span>Séances dans ton journal</span><strong>${R.fmt(logs.length)}</strong><a href="/journal">Retrouver mes efforts →</a></div><div class="r-career"><span>Insignes d’expédition</span><strong>${s.rewards.length}<small> / 36</small></strong><span>Des étapes, sans bonus de puissance.</span></div><div class="r-career"><span>Régions accomplies</span><strong>${s.campaigns.filter((c) => c.chapter === 10).length}<small> / 4</small></strong><a href="/adventure">Continuer l’aventure →</a></div></div></div><div class="r-section-head"><h2>Les rangs de ton parcours</h2>${R.status(s)}</div><div class="r-rank-track">${C.ranks.map((r) => `<div class="r-rank ${s.level >= r.level ? "earned" : ""}">${R.icon(r.level >= 25 ? "crown" : "shield")}<strong>${R.esc(r.name)}</strong><small>Niveau ${r.level}</small></div>`).join("")}</div><p class="r-small" style="margin-top:14px">Les rangs reflètent l’expérience gagnée dans TITAN. Ils ne mesurent pas une capacité physique ou un niveau sportif certifié.</p><section class="r-block"><div class="r-section-head"><div><span class="r-eyebrow">CHOISIS QUI PORTE TON HISTOIRE</span><h2 style="margin-top:8px">Six visages. Ton aventure.</h2></div></div><p class="r-small" style="margin-bottom:20px">Tous les personnages se débloquent avec les niveaux, sans abonnement. Leur apparence ne change pas les récompenses.</p><div class="r-avatar-grid">${C.avatars.map((a) => `<article class="r-avatar-card ${s.level < a.level ? "locked" : ""}"><img src="/assets/renaissance/${a.id}.webp" alt="${R.esc(a.name)}" width="640" height="640" loading="lazy"><div class="r-avatar-info"><span class="r-chip">${s.avatar === a.id ? "Ton personnage" : s.level >= a.level ? "Disponible" : `Niveau ${a.level}`}</span><h3>${R.esc(a.name)}</h3><p>${R.esc(a.role)}</p><button class="r-button ${s.avatar === a.id ? "primary" : "subtle"}" data-avatar="${a.id}" ${s.avatar === a.id || s.level < a.level ? "disabled" : ""}>${s.avatar === a.id ? "Équipé" : s.level < a.level ? "À débloquer" : "Choisir"}</button></div></article>`).join("")}</div><p class="r-error" id="character-error" role="status"></p></section><section class="r-block"><div class="r-section-head"><h2>Ta collection d’expédition</h2><label class="r-small">Afficher <select id="collection-filter"><option value="all" ${filter === "all" ? "selected" : ""}>Tous les insignes</option><option value="earned" ${filter === "earned" ? "selected" : ""}>Mes insignes</option></select></label></div><div class="r-collection-grid">${C.worlds
      .flatMap((w) =>
        w.chapters
          .filter(
            (ch) =>
              filter === "all" ||
              s.rewards.some((r) => r.world === w.id && r.chapter === ch.index),
          )
          .map((ch) => {
            const reward = s.rewards.find(
              (r) => r.world === w.id && r.chapter === ch.index,
            );
            return `<a href="/adventure?world=${w.id}" class="r-collection-item">${R.chapterBadge(w, ch.index, !!reward)}<strong>${R.esc(ch.title)}</strong><small>${reward ? new Date(reward.earned_at).toLocaleDateString("fr-FR") : R.esc(w.name)}</small></a>`;
          }),
      )
      .join(
        "",
      )}</div>${filter === "earned" && !s.rewards.length ? '<div class="r-panel"><h3>Une collection à écrire.</h3><p>Commence une campagne, puis enregistre une séance. Ta première balise t’attend.</p><a class="r-button primary" href="/adventure">Commencer</a></div>' : ""}</section>`;
    host.querySelectorAll("[data-avatar]").forEach((b) =>
      b.addEventListener("click", async () => {
        b.disabled = true;
        try {
          await A.action("avatar", { avatar: b.dataset.avatar });
        } catch (e) {
          document.getElementById("character-error").textContent = A.message(e);
          b.disabled = false;
        }
      }),
    );
    document
      .getElementById("collection-filter")
      ?.addEventListener("change", (e) => {
        filter = e.target.value;
        render();
        document.getElementById("collection-filter").focus();
      });
  }
  window.addEventListener("titan:adventure-updated", render);
  window.addEventListener("titan:history-updated", render);
  document.addEventListener("DOMContentLoaded", render);
  render();
})();
