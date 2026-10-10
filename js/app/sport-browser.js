/* Accessible controls shared by Records and private Maîtrise. Favorites use existing profile storage. */
(function () {
  "use strict";
  const esc = (v) => window.titanEsc(v);
  const SP = () => window.TitanSports;
  const favorites = () => Array.isArray(window.state?.user?.favoriteSports) ? window.state.user.favoriteSports : [];
  const option = (value, label, current) => `<option value="${esc(value)}"${value === current ? " selected" : ""}>${esc(label)}</option>`;

  function entries(data) {
    const map = new Map(SP().all().map((s) => [s.id, { sport: s.id, label: s.label, family: s.family, hasData: false }]));
    for (const sport of favorites()) {
      if (typeof sport === "string" && sport && !map.has(sport)) map.set(sport, { sport, label: SP().label(sport), family: SP().familyOf(sport), hasData: false });
    }
    for (const s of data) map.set(s.sport, { ...map.get(s.sport), label: SP().label(s.sport), family: SP().familyOf(s.sport), ...s, hasData: true });
    return [...map.values()].map((s) => ({ ...s, aliases: SP().aliasesOf?.(s.sport) || SP().conf(s.sport)?.aliases || [] }));
  }

  function preserveFocus(render) {
    const el = document.activeElement;
    const id = el?.id;
    const selection = el?.type === "search" ? [el.selectionStart, el.selectionEnd] : null;
    render();
    if (!id) return;
    const next = document.getElementById(id);
    if (!next) return;
    next.focus({ preventScroll: true });
    if (selection) next.setSelectionRange(...selection);
  }

  function favoriteButton(sport, label) {
    const picked = favorites().includes(sport);
    return `<button type="button" id="favorite-${esc(sport)}" class="asc-btn asc-btn-ghost asc-btn-sm sn-favorite" data-sport-favorite="${esc(sport)}" aria-pressed="${picked}" aria-label="${esc(`${picked ? "Retirer" : "Ajouter"} ${label} ${picked ? "des" : "aux"} favoris`)}">${window.titanIcon("star")}<span class="sr-only">Favori</span></button>`;
  }

  function create(id, { sorts = [["alphabetical", "Nom A–Z"], ["recent", "Plus récents"]], defaultSort = "alphabetical" } = {}) {
    const settings = { query: "", scope: "all", family: "all", sort: defaultSort, hideEmpty: true, page: 1, sport: "all" };
    let result = { total: 0, page: 1, pages: 1 };
    let timer;
    function select(list) {
      result = window.TitanSportNavigation.select(list, { ...settings, favorites: favorites() });
      settings.page = result.page;
      return result;
    }
    function controls() {
      return `<div class="sn-controls" role="group" aria-label="Navigation des sports">
        <label class="sn-search" for="${id}-query"><span class="asc-small asc-muted">Rechercher un sport</span><input type="search" class="asc-input" id="${id}-query" data-nav="query" placeholder="Nom ou alias du sport" value="${esc(settings.query)}" autocomplete="off"></label>
        <div class="sn-selects">
          <label><span class="asc-small asc-muted">Sports</span><select id="${id}-scope" data-nav="scope">${[["all", "Tous les sports"], ["favorites", "Favoris"], ["recent", "Pratiqués depuis 30 jours"]].map(([v, l]) => option(v, l, settings.scope)).join("")}</select></label>
          <label><span class="asc-small asc-muted">Catégorie</span><select id="${id}-family" data-nav="family">${option("all", "Toutes les catégories", settings.family)}${Object.entries(SP().FAMILY_LABEL).map(([v, l]) => option(v, l, settings.family)).join("")}</select></label>
          <label><span class="asc-small asc-muted">Trier par</span><select id="${id}-sort" data-nav="sort">${sorts.map(([v, l]) => option(v, l, settings.sort)).join("")}</select></label>
        </div>
        <label class="sn-hide asc-small"><input type="checkbox" id="${id}-hide" data-nav="hideEmpty"${settings.hideEmpty ? " checked" : ""}> Masquer les sports sans données</label>
        ${settings.sport !== "all" ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" id="${id}-sport-clear" data-nav-page="clear">${esc(SP().label(settings.sport))} · Tous les sports</button>` : ""}
      </div>`;
    }
    function footer() {
      return `<div class="sn-footer"><p class="asc-small asc-muted" role="status" aria-live="polite">${result.total} sport${result.total === 1 ? "" : "s"}${result.pages > 1 ? ` · page ${result.page} sur ${result.pages}` : ""}</p>
        ${result.pages > 1 ? `<nav class="sn-pages" aria-label="Pages de sports"><button type="button" id="${id}-previous" class="asc-btn asc-btn-secondary asc-btn-sm" data-nav-page="previous" aria-label="Page précédente"${result.page === 1 ? " disabled" : ""}>Précédent</button><button type="button" id="${id}-next" class="asc-btn asc-btn-secondary asc-btn-sm" data-nav-page="next" aria-label="Page suivante"${result.page === result.pages ? " disabled" : ""}>Suivant</button></nav>` : ""}</div>`;
    }
    function empty() {
      return `<div class="asc-empty" data-nav-empty><h3>Aucun sport à afficher</h3><p>Essaie un autre nom, change les filtres ou affiche les sports sans données.</p><button type="button" id="${id}-reset" class="asc-btn asc-btn-secondary" data-nav-page="reset">Réinitialiser les filtres</button></div>`;
    }
    function track(kind) {
      window.TitanAnalytics?.track(kind === "query" ? "sport_navigation_searched" : "sport_navigation_filtered", { source: id, kind: kind === "hideEmpty" ? "hide_empty" : kind, count: result.total });
    }
    function handle(e) {
      const t = e.target.closest("[data-nav],[data-nav-page],[data-sport-favorite]");
      if (!t) return false;
      if (t.dataset.sportFavorite) {
        if (e.type !== "click" || !window.state?.user) return false;
        const sport = t.dataset.sportFavorite;
        const list = favorites();
        window.state.user.favoriteSports = list.includes(sport) ? list.filter((s) => s !== sport) : [...new Set([...list, sport])];
        window.saveState?.({ forceCloud: true });
        window.dispatchEvent(new CustomEvent("titan:history-updated"));
        return true;
      }
      if (t.dataset.navPage) {
        if (e.type !== "click" || t.disabled) return false;
        const action = t.dataset.navPage;
        if (action === "next") settings.page++;
        if (action === "previous") settings.page--;
        if (action === "clear") { settings.sport = "all"; settings.page = 1; }
        if (action === "reset") Object.assign(settings, { query: "", scope: "all", family: "all", sort: defaultSort, hideEmpty: true, page: 1, sport: "all" });
        return true;
      }
      const key = t.dataset.nav;
      if (!(key in settings) || e.type !== (key === "query" ? "input" : "change")) return false;
      settings[key] = key === "hideEmpty" ? t.checked : t.value;
      settings.page = 1;
      if (key === "query") {
        settings.sport = "all";
        clearTimeout(timer);
        if (settings.query.trim()) timer = setTimeout(() => track("query"), 400);
      } else setTimeout(() => track(key), 0);
      return true;
    }
    return { settings, select, controls, footer, empty, handle };
  }
  window.TitanSportBrowser = { create, entries, favoriteButton, preserveFocus };
})();
