/* TITAN V2 — démonstrateur d'habillage (A1 bis). Script de DÉMONSTRATION uniquement : injecté par
   design/v2-visual/demo/capture-habillage.mjs dans les vraies pages servies localement (compte connecté simulé,
   tools/visual/fixture-connected.mjs). Il ne touche à aucune donnée, aucun appel serveur, aucune règle : il pose des objets,
   le compteur de pas et la vitrine dans le DOM déjà rendu. Les valeurs de pas et la vitrine sont des FIXTURES synthétiques.
   Chaque nœud ajouté porte data-v2-demo. B2 remplacera ces insertions par les vrais composants (voir VISUAL_INTEGRATION_PLAN). */
(function () {
  "use strict";
  const A = (id, size = 256) => `/__v2/objects/${id}-${size}.webp`;
  const obj = (id, size, cls = "", alt = "") => `<img class="v2-object ${cls}" src="${A(id, size)}" width="${size}" height="${size}" alt="${alt}" ${alt ? "" : 'aria-hidden="true"'} decoding="async" data-v2-demo>`;
  const svg = async (path) => (await fetch(`/__v2/svg/${path}`)).text();
  const FAMILY_OBJECT = { endurance: "running-shoe", force: "dumbbell", technique: "climbing-hold", jeu: "ball", mobilite: "yoga-mat" };
  const page = location.pathname.replace(/\/$/, "") || "/";
  const done = [];

  async function qg() {
    const hero = document.querySelector(".qg-hero");
    if (hero && !hero.querySelector(".v2-hero-object")) {
      const toAdventure = hero.querySelector('a[href*="adventure"]');
      const id = hero.classList.contains("is-record") ? "record-medal" : toAdventure ? "beacon-lit" : "stopwatch";
      hero.classList.add("v2-has-object");
      hero.insertAdjacentHTML("beforeend", obj(id, 256, "v2-hero-object"));
      done.push(`qg-hero:${id}`);
    }
    const status = document.querySelector(".qg-status") || document.querySelector(".qg-pulse")?.parentElement;
    const isGuest = !window.state?.user?.id || String(window.state.user.id).startsWith("guest_");
    if (status && !status.querySelector(".v2-steps") && !isGuest) { // the product hides steps for a guest: so does the demo
      const icon = await svg("icons/ic-steps.svg");
      const steps = 7412, goal = 8000, usual = 5900; // fixture synthétique
      status.insertAdjacentHTML("beforeend", `<a class="v2-steps" href="/stats#pas" data-v2-demo data-state="today" aria-label="Pas aujourd’hui : 7 412 sur un objectif de 8 000. D’habitude à cette heure : 5 900. Voir le détail.">
        <span class="v2-steps-icon" aria-hidden="true">${icon}</span>
        <span aria-hidden="true"><span class="v2-steps-figure">7 412<small>pas</small></span></span>
        <span class="v2-steps-label" aria-hidden="true">objectif 8 000</span>
        <span class="v2-steps-bar" aria-hidden="true" style="--v2-pct:${(steps / goal * 100).toFixed(1)}%;--v2-usual:${(usual / goal * 100).toFixed(1)}%"><i></i><b></b></span>
        <span class="v2-steps-meta" aria-hidden="true"><span>Santé Connect · relevé à 10 h 42</span><span>588 pour l’objectif</span></span></a>`);
      done.push("qg-steps");
    }
  }

  function vitrineHtml() {
    const items = [ // fixture synthétique, cohérente avec le compte simulé (records de musculation, semaines tenues)
      ["record-medal", "Record", "Développé couché 62,5 kg", "is-record"],
      ["week-pennant", "Semaines tenues", "7 sur les 8 dernières", ""],
      ["trophy", "Défi à deux", "Gagné en octobre", ""],
      ["exploration-seal", "Sceau d’exploration", "Vallée de l’Aube", ""],
      ["rope-carabiner", "Grande Cordée", "À gagner", "is-locked"],
    ];
    return `<section class="v2-vitrine" aria-labelledby="v2-vitrine-title" data-v2-demo>
      <div class="asc-section-head"><h2 id="v2-vitrine-title">Ma vitrine</h2><a class="asc-link" href="/carriere">Tout voir</a></div>
      <ul class="v2-vitrine-shelf" role="list">${items.map(([id, t, s, cls]) => `<li class="v2-vitrine-item ${cls}"><span class="v2-vitrine-stand">${obj(id, 256, cls.includes("locked") ? "is-locked" : "")}</span><strong>${t}</strong><small>${s}</small></li>`).join("")}</ul></section>`;
  }
  function profil() {
    const hero = document.querySelector(".pf-hero");
    const anchor = document.querySelector(".pf-sports") || hero?.parentElement?.querySelector("section:nth-of-type(2)");
    if (anchor && !document.querySelector(".v2-vitrine")) { anchor.insertAdjacentHTML("beforebegin", vitrineHtml()); done.push("profil-vitrine"); }
  }

  function swapImages() {
    const swaps = [["relique-maitrise", "record-medal"], ["coffre-tactique", "supply-chest"], ["sceau-exploration", "exploration-seal"]];
    for (const img of document.querySelectorAll("img")) {
      for (const [from, to] of swaps) if ((img.currentSrc || img.src).includes(from)) { img.src = A(to, 256); img.removeAttribute("srcset"); img.dataset.v2Demo = "swap"; done.push(`swap:${from}->${to}`); }
    }
  }

  function progres() {
    const held = [...document.querySelectorAll("p, span, small")].find((n) => /semaines? tenues?/i.test(n.textContent) && n.children.length < 3 && n.textContent.length < 90);
    if (held && !document.querySelector(".v2-held-object")) {
      held.insertAdjacentHTML("afterbegin", `<img class="v2-object v2-held-object" src="${A("week-pennant", 128)}" width="40" height="40" alt="" aria-hidden="true" style="--v2-object:40px;display:inline-block;vertical-align:middle;margin:-10px 6px -8px -4px" data-v2-demo>`);
      done.push("progres-held");
    }
  }

  function aventure() {
    const slab = document.querySelector(".av-mission");
    if (slab && !slab.querySelector(".v2-motif")) {
      const world = new URLSearchParams(location.search).get("world") || document.querySelector("[data-world].is-current, [data-world][aria-current]")?.dataset.world || "marees";
      slab.style.position = slab.style.position || "relative";
      slab.insertAdjacentHTML("afterbegin", `<span class="v2-motif" data-world="${world === "archipel" ? "marees" : world}" aria-hidden="true" data-v2-demo></span>`);
      const head = slab.querySelector("h2, h3");
      if (head) head.insertAdjacentHTML("beforebegin", obj(world === "forges" ? "anvil" : world === "aurores" ? "aurora-beacon-lit" : world === "aube" ? "veilleur-stone" : "buoy", 256, "v2-hero-object", ""));
      slab.classList.add("v2-mission"); done.push(`aventure-motif:${world}`);
    }
  }

  async function resultat() {
    const S = window.TitanSports || window.TITAN_SPORTS;
    const logs = (window.state?.history || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const log = logs.find((l) => l.syncStatus === "confirmed" || l.id) || logs[0];
    if (!log || !window.TitanMoment) { done.push("resultat:unavailable"); return; }
    const dialog = window.TitanMoment.open(log);
    await new Promise((r) => setTimeout(r, 900));
    const d = dialog || document.querySelector("dialog.moment-sheet[open]");
    if (!d) { done.push("resultat:not-open"); return; }
    if (window.__v2OnlyMoment) { done.push(`resultat-before:${log.sport}`); return; }
    const fam = (window.titanSportFamily?.(log.sport)) || (window.SPORTS_CONFIG?.[log.sport]?.family) || "endurance";
    const id = d.hasAttribute("data-record") ? "record-medal" : FAMILY_OBJECT[fam] || "running-shoe";
    const field = d.querySelector(".moment-field");
    if (field && !d.querySelector(".v2-moment-object")) { field.classList.add("v2-has-object"); field.insertAdjacentHTML("afterbegin", obj(id, 256, "v2-moment-object")); done.push(`resultat:${id}:${log.sport}`); }
    else done.push("resultat:no-field");
  }

  // Empty states: the existing text stays (it is native and translatable); the leading glyph gives way to the drawing of the family.
  async function emptyStates() {
    const RULES = [[/journal commence|première séance|statistiques répondront/i, "empty-states/empty-no-session.svg"], [/aucune séance ne correspond|aucun résultat/i, "empty-states/empty-no-result.svg"],
      [/archivée/i, "empty-states/empty-no-result.svg"], [/aucun record/i, "empty-states/empty-no-record.svg"], [/aucun ami|pas encore d.ami/i, "empty-states/empty-no-friend.svg"],
      [/aucun défi/i, "empty-states/empty-no-challenge.svg"], [/aucune quête/i, "empty-states/empty-no-quest.svg"], [/hors ligne|pas de réseau/i, "states/state-offline.svg"]];
    for (const el of document.querySelectorAll(".asc-empty, .sig-empty")) {
      if (el.dataset.v2Demo) continue;
      const text = el.querySelector("h2, h3")?.textContent || el.textContent;
      const rule = RULES.find(([re]) => re.test(text)); if (!rule) continue;
      const art = await svg(rule[1]);
      el.querySelector(":scope > svg, :scope > img, :scope > .rc-relic, :scope > picture")?.remove();
      el.insertAdjacentHTML("afterbegin", `<span class="v2-empty-art" aria-hidden="true" data-v2-demo>${art}</span>`);
      el.classList.add("v2-has-art"); el.dataset.v2Demo = "empty"; done.push(`empty:${rule[1]}`);
    }
  }

  async function run() {
    if (window.__v2OnlyMoment) { if (new URLSearchParams(location.search).has("v2moment")) await resultat(); window.__v2Demo = done; return; }
    if (page === "/aujourdhui") await qg();
    if (page === "/profile") profil();
    if (page === "/stats") progres();
    if (page === "/adventure") aventure();
    swapImages();
    await emptyStates();
    if (new URLSearchParams(location.search).has("v2moment")) await resultat();
    window.__v2Demo = done;
  }
  window.__v2Run = run;
})();
