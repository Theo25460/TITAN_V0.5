/* The journey is server-owned. Reading a panel never grants a souvenir. */
(function (root) {
  "use strict";
  const esc = value => root.titanEsc(String(value ?? ""));
  const icon = name => root.titanIcon(name);
  const number = value => root.TitanFormat.number(value);
  const date = value => new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const sources = { health_connect: "Santé Connect", garmin: "Garmin" };
  const context = () => ({ owner: root.state?.user?.id, client: root.titanClient, epoch: root.titanAccountTransition?.epoch });
  const same = (a, b) => a && b && a.owner === b.owner && a.client === b.client && a.epoch === b.epoch && !root.titanAccountTransition?.active;
  const button = (action, label) => `<button type="button" class="asc-btn asc-btn-secondary" data-journey-action="${action}">${label}</button>`;
  const bar = (percent, label) => `<span class="asc-ascent thin" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(percent)}"><span style="--p:${percent}%"></span></span>`;
  let account, snapshot, pending, error = "", lastRead = -Infinity;
  let generation = 0;
  const hosts = new Set();

  function reset() {
    generation++;
    account = snapshot = pending = null;
    error = "";
    lastRead = -Infinity;
    for (const host of hosts) host.replaceChildren();
    hosts.clear();
    document.querySelectorAll("[data-journey-scene]").forEach(dialog => dialog.remove());
  }

  function career(model) {
    const next = model.nextCareer;
    const rows = model.snapshot.career.milestones.map(d => `<li>${icon(d.earnedAt ? "medal" : "lock")}<strong>${esc(d.title)}</strong><small>Niveau ${d.level} · ${d.earnedAt ? `Confirmé le ${date(d.earnedAt)}` : "À découvrir"}</small><p>${esc(d.description)}</p></li>`);
    return `<section class="journey-career"><p class="asc-eyebrow">Jalons de carrière</p>
      ${next ? `<h3>Niveau ${next.level} · ${esc(next.title)}</h3><p class="asc-small">${esc(next.description)}</p>` : "<h3>Tous les jalons de cette carrière sont acquis.</h3>"}
      <p class="asc-small asc-muted">${model.careerEarned.length} souvenir(s) acquis · Tes XP et ton rang gardent les mêmes règles.</p>
      ${model.careerReadyCount ? button("sync", "Confirmer mes jalons") : ""}
      <details><summary>Mes jalons de carrière</summary><ol>${rows.join("")}</ol></details></section>`;
  }

  function map(model) {
    const regions = root.TitanCodex.worlds.map(world => {
      const count = model.earned.filter(d => d.world === world.id).length;
      const label = count ? `${count} découverte${count > 1 ? "s" : ""}` : model.next?.world === world.id ? "Le sentier se dessine" : "Sous la brume";
      return `<article class="journey-region ${count ? "is-revealed" : ""}" style="--world:${world.color}">
        <img src="/assets/renaissance/${world.image}-xs.webp" alt="" width="480" height="270" loading="lazy" decoding="async">
        <div>${icon(count ? "compass" : "lock")}<h3>${esc(world.name)}</h3><p>${label}</p></div></article>`;
    });
    return `<div class="journey-map" aria-label="Les quatre régions des sentiers">${regions.join("")}</div>`;
  }

  function explore(model) {
    const s = model.snapshot;
    const today = s.today ? `Aujourd’hui (UTC) : ${number(s.today.steps)} pas · ${esc(s.today.sources.map(id => sources[id] ?? "Source connectée").join(", "))} · reçus le ${date(s.today.updatedAt)}` : "Aucun chiffre reçu pour aujourd’hui. Tes découvertes restent acquises.";
    const observed = s.observedToday;
    const observedLabel = observed ? `${number(observed.steps)} pas aujourd’hui (UTC) · ${esc(observed.sources.map(id => sources[id] ?? "Source connectée").join(", "))}` : "";
    const next = model.next;
    const grand = model.nextGrand;
    const album = model.earned.slice().reverse().map(d => `<li><strong>${esc(d.name)}</strong><p>${esc(d.story)}</p><small>${number(d.steps)} pas · Confirmé le ${date(d.earnedAt)}</small></li>`);
    return `<p class="asc-eyebrow cy">L’éveil des mondes</p><h2 class="asc-h2">Les Sentiers du Titan</h2>
      <p class="asc-small asc-muted">Tes pas explorent les lieux. Tes séances ouvrent les chapitres. Le niveau raconte ta carrière.</p>
      ${map(model)}
      ${model.hasStepData ? `<p class="journey-total"><strong>${number(s.totalSteps)}</strong> pas explorés</p><p class="asc-small asc-muted">${today}</p>` : "<p>Pas de données de pas confirmées pour le moment. Tes séances font toujours avancer les campagnes.</p>"}
      ${observed || s.observedSteps > 0 ? `<div class="journey-next"><p class="asc-eyebrow">Aperçu des pas reçus</p><p>${number(s.observedSteps ?? 0)} pas enregistrés par tes sources connectées.</p>${observed ? `<p class="asc-small asc-muted">${observedLabel}</p>` : ""}<p class="asc-small asc-muted">Ces relevés attendent une vérification avant de débloquer des souvenirs.</p></div>` : ""}
      ${next ? `<div class="journey-next"><p class="asc-eyebrow cy">Prochaine découverte</p><h3>${esc(next.name)}</h3><p>${number(model.remaining)} pas vers cette découverte</p>${bar(model.segmentPercent, "Vers la prochaine découverte")}
      ${grand && grand.id !== next.id ? `<p class="asc-small asc-muted">Grand jalon : ${esc(grand.name)} · encore ${number(model.grandRemaining)} pas.</p>` : ""}</div>` : "<p>La première saga est explorée. Ton aventure continue.</p>"}
      <div class="journey-saga"><p class="asc-small asc-muted">Première saga · ${number(s.totalSteps)} / ${number(s.goal)} pas</p>${bar(model.sagaPercent, "Première saga d’exploration")}</div>
      ${model.readyCount ? button("sync", "Révéler mes découvertes") : ""}
      <p class="asc-small asc-faint">Le maximum journalier des sources vérifiées alimente les sentiers. Les souvenirs sont cosmétiques.</p>
      <details class="journey-album"><summary>Journal de voyage · ${album.length}</summary>${album.length ? `<ol>${album.join("")}</ol>` : "<p>Ton premier souvenir apparaîtra après confirmation d’une découverte.</p>"}</details>
      ${career(model)}<div class="journey-actions">${button("read", "Actualiser les pas confirmés")}<a class="asc-btn asc-btn-ghost" href="/profile#sources">${icon("cloud")} Mes sources de pas</a></div>`;
  }

  function worldStoryHtml(snapshot, world, owner) {
    const story = root.TitanJourney?.worldStory(snapshot, world.id, owner);
    if (!story) return "";
    const scenes = story.scenes.map(scene => `<li class="${scene.earnedAt ? "is-restored" : ""}">
      ${icon(scene.earnedAt ? scene.icon : "lock")}
      <div><strong>${scene.earnedAt ? esc(scene.name) : `Balise ${scene.chapter}`}</strong>
      <p class="asc-small asc-muted">${scene.earnedAt ? esc(scene.description) : "Changement à découvrir après validation."}</p></div>
    </li>`);
    return `<section class="av-panel world-story" data-world-story="${story.version}" style="--world:${world.color}" aria-label="Les changements du monde">
      <h2 class="asc-h2">Le monde change</h2>
      <p class="asc-small asc-muted">${owner.startsWith("guest_") ? "Aperçu de ton aventure sur cet appareil." : "Les balises allumées laissent une trace dans ce monde."}</p>
      <ol>${scenes.join("")}</ol></section>`;
  }

  function paint(host) {
    if (!host.isConnected) { hosts.delete(host); return; }
    if (!same(account, context())) return;
    const open = [...host.querySelectorAll("details")].map(d => d.open);
    const model = root.TitanJourney?.model(snapshot, account.owner);
    const careerOnly = host.dataset.journeyMode === "career";
    if (model) host.innerHTML = careerOnly ? career(model) : explore(model);
    else if (careerOnly && !pending) host.replaceChildren();
    else host.innerHTML = `<h2 class="asc-h2">${careerOnly ? "Jalons de carrière" : "Les Sentiers du Titan"}</h2><p role="status">${pending ? "La carte se prépare…" : "Tes campagnes restent disponibles. Les sentiers attendent une connexion au serveur compatible."}</p>${pending ? "" : button("read", "Réessayer")}`;
    if (error && (!careerOnly || model)) host.insertAdjacentHTML("beforeend", `<p class="asc-small" data-journey-status role="status">${esc(error)}</p>`);
    host.querySelectorAll("details").forEach((d, i) => { d.open = !!open[i]; });
    host.querySelectorAll("button").forEach(b => { b.disabled = !!pending; });
    host.setAttribute("aria-busy", String(!!pending));
  }

  function reveal(discovery, milestone, host) {
    if (!discovery && !milestone) return;
    const title = discovery?.name ?? milestone.title;
    const story = discovery?.story ?? milestone.description;
    const origin = discovery ? `${number(discovery.steps)} pas explorés` : `Niveau ${milestone.level}`;
    const dialog = document.createElement("dialog");
    dialog.className = "journey-reveal";
    dialog.dataset.journeyScene = "";
    dialog.setAttribute("aria-labelledby", "journey-reveal-title");
    dialog.innerHTML = `<p class="asc-eyebrow cy">${discovery ? "Découverte confirmée" : "Jalon de carrière confirmé"}</p><div class="journey-seal" aria-hidden="true">${icon(discovery ? "compass" : "medal")}</div><h2 class="asc-h2" id="journey-reveal-title">${esc(title)}</h2><p>${esc(story)}</p><p class="asc-small asc-muted">${origin} · souvenir cosmétique</p><button class="asc-btn asc-btn-primary" type="button">Continuer l’aventure</button>`;
    dialog.addEventListener("close", () => { dialog.remove(); host.querySelector("button, summary")?.focus({ preventScroll: true }); });
    dialog.querySelector("button").onclick = () => dialog.close();
    document.body.append(dialog);
    dialog.showModal();
  }

  async function request(write, host) {
    if (pending || !same(account, context())) return;
    const ask = account;
    const epoch = generation;
    const previous = snapshot;
    pending = true;
    error = "";
    if (!write) lastRead = Date.now();
    hosts.forEach(paint);
    let timer;
    try {
      const session = (await ask.client?.auth.getSession())?.data?.session;
      if (session?.user?.id !== ask.owner || !same(ask, context()) || epoch !== generation) return;
      const call = ask.client.rpc(write ? "titan_journey_sync_v1" : "titan_journey_snapshot_v1", {}).setHeader("Authorization", `Bearer ${session.access_token}`);
      const result = await Promise.race([call, new Promise((_, reject) => { timer = setTimeout(() => reject(Error("JOURNEY_TIMEOUT")), 15000); })]);
      const currentSession = (await ask.client.auth.getSession())?.data?.session;
      if (!same(ask, context()) || epoch !== generation) return;
      if (currentSession?.user?.id !== ask.owner) { reset(); return; }
      if (result.error || !root.TitanJourney.model(result.data, ask.owner)) throw Error("JOURNEY_UNAVAILABLE");
      snapshot = result.data;
    } catch {
      if (epoch === generation) error = "Les sentiers sont momentanément indisponibles. Tes acquis sont conservés.";
    } finally {
      clearTimeout(timer);
      if (epoch === generation) { pending = false; hosts.forEach(paint); }
    }
    if (write && snapshot && snapshot !== previous && epoch === generation && same(ask, context())) {
      const oldDiscoveries = new Set(previous?.discoveries.filter(d => d.earnedAt).map(d => d.id));
      const oldCareer = new Set(previous?.career.milestones.filter(d => d.earnedAt).map(d => d.id));
      reveal(snapshot.discoveries.find(d => d.earnedAt && !oldDiscoveries.has(d.id)), snapshot.career.milestones.find(d => d.earnedAt && !oldCareer.has(d.id)), host);
    }
  }

  function mount(host, mode = "full") {
    if (!host || root.titanAccountTransition?.active) return;
    const now = context();
    if (!same(account, now)) { reset(); account = now; }
    if (!now.owner || String(now.owner).startsWith("guest_")) {
      if (mode === "full") host.innerHTML = "<h2 class=\"asc-h2\">Les Sentiers du Titan</h2><p>Un compte conserve les découvertes et les jalons. Les quatre campagnes restent accessibles en découverte.</p>";
      return;
    }
    hosts.add(host);
    host.dataset.journeyMode = mode;
    if (!host.dataset.journeyBound) {
      host.dataset.journeyBound = "1";
      host.addEventListener("click", event => {
        const target = event.target.closest("[data-journey-action]");
        if (target && !target.disabled) void request(target.dataset.journeyAction === "sync", host);
      });
    }
    if (!pending && Date.now() - lastRead >= 60000) void request(false, host);
    else paint(host);
  }

  root.TitanJourneyPanel = { mount, reset, worldStoryHtml };
  root.addEventListener("titan:account-changing", reset);
})(window);
