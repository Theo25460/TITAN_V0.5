/* TITAN 300 — Aventure: the world reacts to real active days. Server-authoritative for accounts
   (titan_adventure_* RPCs), local for discovery. Badges are cosmetic: no XP, no credits. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const F = () => window.TitanFormat;
  const SP = () => window.TitanSports;
  const A = () => window.TitanAdventure;
  const C = () => window.TitanCodex;
  const NODES = [
    [12, 78],
    [28, 68],
    [41, 81],
    [54, 61],
    [72, 70],
    [86, 47],
    [68, 35],
    [43, 26],
    [57, 13],
  ];
  /* The trail between two beacons, one stretch each (the same curve as before, cut where it passes on a beacon): a stretch
     already walked is inked, the one being walked is marked, the ones ahead stay faint. */
  const TRAIL = ["M12 78 Q17 62 28 68", "M28 68 Q39 74 41 81", "M41 81 Q43 55 54 61", "M54 61 Q65 67 72 70", "M72 70 Q94 63 86 47", "M86 47 Q78 31 68 35", "M68 35 Q29 36 43 26", "M43 26 Q57 16 57 13"];
  /* What sits under the scene and the mission: one view at a time, so the page reads in one screen. The address keeps the view. */
  const VIEWS = [["chapitre", "Chapitre"], ["quetes", "Quêtes"], ["sentiers", "Sentiers"], ["carnet", "Carnet"]];
  // V1.5.4: the notebook of clues (#indices) and a chain between worlds (#quete-…) live in the Carnet view.
  const viewOf = (hash) => VIEWS.find(([id]) => `#${id}` === hash)?.[0] || (/^#(indices|quete-[a-z0-9-]+)$/.test(hash) ? "carnet" : null);

  let root = null;
  let selected = new URLSearchParams(location.search).get("world");
  let busy = false;
  let view = viewOf(location.hash) || "chapitre";

  const isGuest = () => String(window.state?.user?.id || "").startsWith("guest_");
  const done = (p) => Math.max(0, Math.min(9, (p?.chapter || 1) - 1));
  /* A badge is an object, not an icon in a box: the beacon of its chapter in the colour of its world (lit once the server
     confirmed it), and the guardian's own portrait for the ninth. Decorative here: the words beside it say its state. */
  const badgeObject = (world, ch, earned, size = 64) => `<span class="sig-object av-obj${earned ? "" : " is-locked"}${ch.boss ? " is-portrait" : ""}" style="--obj:${size}px" aria-hidden="true">${ch.boss
    ? `<img src="/assets/renaissance/guardian-${world.id}-s.webp" alt="" width="256" height="256" loading="lazy" decoding="async">`
    : window.TitanCrest.beacon(world.color, size, earned).replace('role="img"', 'aria-hidden="true"')}</span>`;
  const state = (cls, ic, text) => `<span class="sig-state${cls ? ` ${cls}` : ""}">${ic ? icon(ic) : ""}${esc(text)}</span>`;

  /** The guardian effort trial is enforced by the v300 server (and the guest engine), which always send effort_target. */
  const effortRule = () => (A()?.snapshot?.campaigns || []).some((c) => c.effort_target != null);
  const SOON = "L’épreuve d’effort du gardien (150 minutes, 90 au plus par jour) n’est pas disponible pour le moment.";

  const personalServer = () => !isGuest() && (A()?.snapshot?.version || 1) >= 4;
  function personalTargetHtml(p) {
    if (!personalServer() || !p.main_objective || p.chapter < 1 || p.chapter > 9) return "";
    return `<p class="asc-small asc-muted" data-personal-target>${p.main_objective.version === 0
      ? "Chapitre déjà commencé : ses conditions sont conservées jusqu’à sa validation."
      : "Cible adaptée à tes 28 jours admissibles précédents, figée au départ de ce chapitre. Le serveur confirme les preuves ; aucun record à battre, aucune échéance."}</p>`;
  }

  function campaign(world) {
    const s = A().snapshot;
    return s?.campaigns?.find((c) => c.id === world.id) || { id: world.id, chapter: 0, evidence: { days: 0, source_ids: [] }, target: 0 };
  }

  function worldsHtml(s, world, focusedWorld) {
    return `<div class="av-worlds" role="tablist" aria-label="Régions">${C()
      .worlds.map((w) => {
        const p = s.campaigns.find((c) => c.id === w.id);
        const finished = p?.chapter >= 10;
        const lit = finished ? 9 : done(p);
        const access = isGuest() ? "Découverte" : window.TitanAdventureAccess?.worldAccess(s, w.id).state !== "open"
          ? "Indisponible" : Number(s.version) < 3 && p?.tier === "plus" ? "TITAN+" : "Gratuit";
        return `<button type="button" role="tab" class="av-world" id="av-tab-${w.id}" data-world="${w.id}" aria-controls="av-region-panel" aria-selected="${w.id === world.id}" tabindex="${w.id === (focusedWorld || world.id) ? 0 : -1}" style="--world:${w.color}">
          <img src="/assets/renaissance/${w.image}-xs.webp" alt="" width="480" height="270" loading="lazy" decoding="async">
          <span class="av-world-copy"><small>${access} · ${finished ? "terminé" : `${done(p)}/9`}</small><strong>${esc(w.name)}</strong><span>${esc(w.subtitle)}</span></span>
          <span class="av-world-pips" aria-hidden="true">${Array.from({ length: 9 }, (_, i) => `<i${i < lit ? ' class="on"' : ""}></i>`).join("")}</span>
        </button>`;
      })
      .join("")}</div>`;
  }

  /* The world as a scene: its painting, the trail inked as far as it was walked, nine beacons, and the guardian's own
     portrait waiting on the ninth. */
  function mapHtml(world, p) {
    const current = p.chapter >= 1 && p.chapter <= 9 ? p.chapter : 0;
    const lit = p.chapter >= 10 ? 9 : done(p);
    return `<section class="av-map" aria-label="Carte des neuf balises : ${esc(world.name)}" style="--world:${world.color}"${window.titanShell?.look?.().map ? ` data-ambiance="${esc(window.titanShell.look().map)}"` : ""}>
      <img class="av-map-img" srcset="/assets/renaissance/${world.image}-small.webp 800w, /assets/renaissance/${world.image}.webp 1600w" sizes="(max-width: 960px) 100vw, 860px" src="/assets/renaissance/${world.image}.webp" alt="" width="1600" height="900" decoding="async">
      <svg class="av-trail" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${TRAIL.map((d, i) => `<path${i < lit - 1 ? ' class="is-done"' : i === lit - 1 && current ? ' class="is-next"' : ""} d="${d}"/>`).join("")}</svg>
      ${world.chapters
        .map((ch, i) => {
          const earned = p.chapter > ch.index;
          const active = current === ch.index;
          return `<button type="button" class="av-node${earned ? " is-earned" : ""}${active ? " is-active" : ""}${ch.boss ? " is-boss" : ""}" data-chapter="${ch.index}" style="left:${NODES[i][0]}%;top:${NODES[i][1]}%" aria-label="Balise ${ch.index} : ${esc(ch.name)}. ${earned ? "Allumée" : active ? "Étape en cours" : "À découvrir"}">${ch.boss ? `<img src="/assets/renaissance/guardian-${world.id}-s.webp" alt="" width="256" height="256" decoding="async">${earned ? icon("check") : ""}` : earned ? icon("check") : `<span>${ch.index}</span>`}</button>`;
        })
        .join("")}
      <div class="av-map-quests" data-quest-map></div>
      <div class="av-map-caption"><strong>${esc(world.name)}</strong><span>${p.chapter >= 10 ? "Les neuf balises brillent." : `${done(p)} balise${done(p) > 1 ? "s" : ""} sur 9`}</span></div>
    </section>`;
  }

  function missionHtml(world, p, s) {
    const locked = !isGuest() && window.TitanAdventureAccess?.worldAccess(s, world.id).state !== "open";
    if (locked)
      return `<section class="av-panel"><p class="asc-eyebrow">Accès indisponible</p><h2 class="asc-h2">${esc(world.name)}</h2><p>${esc(world.intro)}</p>
        <p class="asc-small asc-muted">Cette région n’est pas accessible pour le moment. Tes acquis sont conservés.</p>
        <button type="button" class="asc-btn asc-btn-ghost" data-world="aube">Revenir à l’Aube</button></section>`;
    // A world walked to its end: the notebook of its nine beacons is sealed. The seal is the object of that fact, nothing more.
    if (p.chapter >= 10)
      return `<section class="av-panel is-complete av-done"><div class="av-done-head"><span class="sig-object" style="--obj:84px" aria-hidden="true"><img src="/assets/objects/sceau-exploration-256.webp" alt="" width="256" height="256" decoding="async"></span>
        <div><p class="asc-eyebrow">Campagne accomplie</p><h2 class="asc-h2">${esc(world.guardian)} te reconnaît</h2>${state("is-owned", "check", "Carnet scellé · 9/9")}</div></div>
        <p>${esc(world.ending)}</p><div class="asc-row-flex"><button type="button" class="asc-btn asc-btn-secondary" data-av-view-btn="carnet" data-av-goto>Ouvrir le carnet</button><a class="asc-btn asc-btn-ghost" href="/profile#collection">Voir ma collection</a></div></section>`;
    if (!p.chapter)
      return `<section class="av-panel av-start"><p class="asc-eyebrow cy">Nouvelle campagne</p><h2 class="asc-h2">${esc(world.chapters[0].name)}</h2><p>${esc(world.intro)}</p>
        <fieldset class="av-routes"><legend class="seance-label">Ton chemin</legend>${C()
          .routes.map((r, i) => `<label class="av-route"><input type="radio" name="route" value="${r.id}" ${i === 0 ? "checked" : ""}><span><strong>${esc(r.name)}</strong><small>${esc(r.description)}${r.id === "journal" ? " (10 caractères minimum)" : ""}</small></span></label>`)
          .join("")}</fieldset>
        <details class="asc-note av-rules" data-rpg-departure="${esc(world.id)}"><summary>Comment ton sport fait avancer l’aventure</summary>
        <ol><li>Commence la campagne avant ta prochaine séance. Tes séances précédentes restent dans ton journal ; elles ne sont pas reprises pour cette balise.</li>
        <li>Pratique le sport de ton choix et enregistre ta séance. Les séances admissibles font avancer les jours de l’étape ; le chemin Observation demande aussi une note de 10 caractères minimum.</li>
        <li>Quand tous les objectifs sont atteints, reviens allumer la balise. Le gardien demande aussi l’effort indiqué ; plusieurs séances le même jour ne créent pas plusieurs jours actifs.</li>
        <li>La balise débloque un insigne cosmétique, sans XP ni crédits supplémentaires. Les XP et les crédits d’une séance suivent leurs propres règles. Une pause n’efface pas tes insignes.</li></ol>
        <p class="asc-small">${isGuest() ? "En découverte, la progression est calculée sur cet appareil." : "Avec un compte, ta progression et tes récompenses sont sauvegardées et suivent tous tes appareils."}</p></details>
        <button type="button" class="asc-btn asc-btn-primary" data-start>${icon("compass")} Commencer la campagne</button>
        <p class="asc-small asc-faint">Les séances comptent à partir du départ, une seule fois par jour. Aucune échéance, aucune pénalité.</p></section>`;
    const ch = world.chapters[p.chapter - 1];
    const progress = window.TitanProgress.campaignProgress(p);
    const days = progress.objectives[0].value;
    const effortObjective = progress.objectives.find(o => o.id === "effort");
    const effortTarget = effortObjective?.target || 0;
    const effort = effortObjective?.value || 0;
    const ready = progress.ready;
    const remaining = ready ? "Étape prête à valider." : progress.objectives.filter(o => o.remaining > 0).map(o => o.id === "days" ? `${F().number(o.remaining)} jour${o.remaining > 1 ? "s" : ""} ${p.route === "journal" ? "avec une séance annotée" : "actif" + (o.remaining > 1 ? "s" : "")} à accomplir` : `${F().number(o.remaining)} min d’effort à accomplir`).join(" · ");
    // One dominant card (RPG-131-01): where you are, what is left to do, how far you are, one action, what it brings. The story follows.
    // The proof of the days is drawn one mark a day: what is asked and what is done are counted with the eyes.
    const marks = p.target <= 14
      ? `<span class="av-proof" aria-hidden="true">${Array.from({ length: p.target }, (_, i) => `<i${i < days ? ' class="on"' : ""}></i>`).join("")}</span>`
      : `<span class="asc-ascent"><span style="--p:${Math.round((days / Math.max(1, p.target)) * 100)}%"></span></span>`;
    return `<section class="av-panel av-mission asc-slab${ready ? " is-ready" : ""}" aria-labelledby="av-mission-title">
      <div class="av-mission-head"><div><p class="asc-eyebrow${ready ? " cy" : ""}">Ta mission · Chapitre ${ch.index} / 9${ch.boss ? " · le gardien" : ""}</p><h2 class="asc-h2" id="av-mission-title" tabindex="-1">${esc(ch.name)}</h2></div></div>
      <p class="av-todo"><span class="av-todo-label">${ready ? "C’est prêt" : "À faire"}</span><span data-rpg-remaining>${esc(remaining)}</span></p>
      <div class="av-track"><div class="asc-between"><span>${p.route === "journal" ? "Jours avec une séance annotée" : "Jours actifs"}</span><strong class="asc-num">${days} / ${p.target}</strong></div>${marks}</div>
      ${effortTarget ? `<div class="av-track"><div class="asc-between"><span>Effort pour le gardien</span><strong class="asc-num">${F().number(effort)} / ${effortTarget} min</strong></div><span class="asc-ascent"><span style="--p:${Math.round((effort / effortTarget) * 100)}%"></span></span><p class="asc-small asc-faint">Minutes d’effort depuis le début du chapitre, 90 au plus par jour : l’épreuve récompense la constance, pas une séance démesurée.</p></div>` : ""}
      ${ch.boss && !effortRule() ? `<p class="asc-small asc-faint">${SOON}</p>` : ""}
      ${ready ? `<button type="button" class="asc-btn asc-btn-primary" data-claim="${ch.index}">${icon("star")} ${ch.boss ? "Affronter le gardien" : "Allumer la balise"}</button>` : `<a class="asc-btn asc-btn-primary" href="/training">${icon("plus")} Enregistrer une séance</a>`}
      <p class="av-story">${esc(ch.story)}</p>
      <div class="av-mission-foot"><details class="av-more"><summary>Ce que ça apporte<span class="av-more-prize">${icon("star")} ${esc(ch.title)}</span></summary>
        <p class="asc-small">L’insigne <strong>${esc(ch.title)}</strong>, cosmétique, sans XP ni crédits. Tes XP viennent de l’effort de chaque séance.</p>
        ${personalTargetHtml(p)}
        <div class="av-practice"><p class="asc-eyebrow">Le repère à emporter</p><p>${esc(ch.practice)}</p></div>
      </details>
      <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm av-mission-details" data-chapter="${ch.index}">Détails du chapitre</button></div>
    </section>`;
  }

  function valleyHtml(world, p, snapshot) {
    const owner = window.state?.user?.id;
    if (!owner || snapshot.owner !== owner || window.titanAccountTransition?.active) return "";
    const model = window.TitanCampaignQuests?.plan({ campaign: p, history: window.TitanData?.logs?.() || [], guest: isGuest(), owner,
      effortOf: log => window.TitanProgress.effortOf(log).effortMinutes, serverVersion: snapshot.version });
    if (!model) return "";
    const source = p.evidence?.source_ids?.[0];
    return `<section class="asc-section av-panel" data-valley-encounter>
      <p class="asc-eyebrow">${esc(world.name)} · rencontre du chapitre ${p.chapter}</p>
      <h2 class="asc-h2">${esc(model.encounter.name)}</h2><p>${esc(model.encounter.text)}</p>
      <details class="av-rules" data-rpg-quests="${esc(world.id)}:${p.chapter}"><summary>Missions facultatives · ${model.completed}/3 préparatifs réunis</summary>
        <p class="asc-small asc-muted">Ces missions personnelles accompagnent ton chapitre : elles ne sont pas nécessaires pour allumer la balise et ne donnent ni XP ni crédits supplémentaires. Elles se renouvellent au chapitre suivant, sans pénalité.</p>
        <p class="asc-small asc-muted">${model.authority === "server" ? `Cibles figées par le serveur au départ du chapitre : ${F().number(model.profile.daysTarget)} jour(s) et ${F().number(model.profile.effortTarget)} min d’effort, d’après les jours admissibles des 28 jours précédents (90 min au plus par jour).${model.profile.legacy ? " Chapitre déjà commencé : cibles douces conservées." : ""} Les souvenirs des missions remplies sont confirmés quand tu allumes la balise ; une mission incomplète ne bloque pas la suite.` : `${model.profile.days ? `Cibles indicatives sur les ${model.profile.days} jours actifs des 28 jours avant ce chapitre : ${model.profile.daysTarget} jour(s) et ${model.profile.effortTarget} min d’effort, 90 min au plus par jour.` : "Historique admissible insuffisant avant ce chapitre : départ doux, 1 jour et 15 min d’effort."} ${isGuest() ? "En découverte, ces repères sont calculés sur cet appareil, sans nouveaux souvenirs." : "Ces préparatifs sont indicatifs sur cette version du serveur, sans nouveaux souvenirs."}`}</p>
        <div class="asc-stack">${model.quests.map(q => `<article class="asc-note" data-quest="${q.id}" data-complete="${q.complete}">
          ${icon(q.complete ? "check" : q.id === "note" ? "journal" : "route")}<div class="asc-stack-sm"><strong>${esc(q.name)}</strong>
          <span class="asc-small">${q.available ? `${F().number(q.value)}/${F().number(q.target)} ${esc(q.unit)}${q.complete ? " · préparatif réuni" : ""}` : "Mesure d’effort indisponible sur cette version du serveur."}</span>
          ${q.reward ? `<span class="asc-small asc-muted">Souvenir prévu : ${esc(q.reward)} · ${q.complete ? "prêt à confirmer avec la balise" : "mission à remplir"}. Cosmétique, sans XP ni coins.</span>` : ""}
          ${q.id === "note" ? '<span class="asc-small asc-muted">Une note d’au moins 10 caractères sur une séance citée dans les preuves du chapitre.</span>' : ""}
          ${!q.complete && q.available ? `<a class="asc-link asc-small" href="${q.id === "note" && source ? `/journal?session=${encodeURIComponent(source)}` : "/training"}">${q.id === "note" && source ? "Retrouver la séance dans le journal" : "Enregistrer une séance à ton rythme"}</a>` : ""}
          </div></article>`).join("")}</div>
      </details></section>`;
  }

  /* One place for everything in progress across the four regions (RPG14). Read-only: it only reflects the confirmed snapshot. */
  function questLogHtml(snapshot) {
    const owner = window.state?.user?.id;
    if (!owner || snapshot.owner !== owner || window.titanAccountTransition?.active) return "";
    const rows = C().worlds.map((w) => {
      const p = snapshot.campaigns?.find((c) => c.id === w.id);
      if (!p || !Number.isInteger(p.chapter) || p.chapter < 1 || p.chapter > 9) return null;
      const ch = w.chapters[p.chapter - 1];
      const percent = window.TitanProgress.campaignProgress(p)?.percent ?? 0;
      const model = window.TitanCampaignQuests?.plan({ campaign: p, history: window.TitanData?.logs?.() || [], guest: isGuest(), owner,
        effortOf: log => window.TitanProgress.effortOf(log).effortMinutes, serverVersion: snapshot.version });
      return `<li data-quest-log-world="${esc(w.id)}"><a class="asc-link" href="/adventure?world=${esc(w.id)}"><strong>${esc(w.name)}</strong></a>
        <span class="asc-small">Chapitre ${p.chapter} · ${esc(ch?.title || "")} · balise à ${percent}%${model ? ` · ${model.completed}/3 préparatifs` : ""}</span></li>`;
    }).filter(Boolean);
    const souvenirs = (Array.isArray(snapshot.quest_rewards) ? snapshot.quest_rewards : []).filter(r => window.TitanCampaignQuests?.rewardName(r.quest_id)).length;
    if (!rows.length) return "";
    return `<details class="asc-note av-rules" data-quest-log><summary>Journal de quêtes · ${rows.length} région${rows.length > 1 ? "s" : ""} en cours</summary>
      <ul class="asc-stack-sm">${rows.join("")}</ul>
      <p class="asc-small asc-muted">${souvenirs} souvenir${souvenirs > 1 ? "s" : ""} de quête confirmé${souvenirs > 1 ? "s" : ""}. Tout ici est facultatif : prendre une pause n’efface rien.</p></details>`;
  }

  function weeklyPathsHtml(snapshot) {
    const user = window.state?.user;
    const settings = window.TitanData?.cadenceSettings?.();
    if (!user?.id || user.id !== snapshot.owner || window.titanAccountTransition?.active || !settings) return "";
    const now = new Date();
    const week = F().dateKey(F().weekStart(now));
    const paths = A().weeklyQuestPaths?.(window.TitanData.logs(), settings.target, now, {
      favoriteSports: user.favoriteSports,
      cadencePaused: settings.pauses.includes(week),
    });
    if (!paths) return "";
    return `<section class="asc-section av-panel" aria-labelledby="av-week-paths"><h2 class="asc-h2" id="av-week-paths">Tes pistes de la semaine</h2>
      <p class="asc-small asc-muted">${esc(paths.why)}</p><div class="asc-list">${[paths.main, ...paths.alternatives].map((q, i) => `<a class="asc-row" data-week-path="${i === 0 ? "main" : "alternative"}" data-week-path-id="${esc(q.id)}" href="${esc(q.href)}">
      <span class="asc-row-icon">${icon(q.icon || "leaf")}</span><span class="asc-row-main"><span class="asc-small asc-muted">${i === 0 ? "Piste proposée" : "Alternative facultative"}${q.target ? ` · ${Math.min(q.value, q.target)}/${q.target}` : ""}</span>
      <span class="asc-row-title">${esc(q.name)}</span><span class="asc-row-sub">${esc(q.text)}</span></span>${icon("chevron")}</a>`).join("")}</div>
      <p class="asc-small asc-muted">Ces pistes restent libres et n’ajoutent ni XP ni crédits.</p></section>`;
  }

  function questSouvenirsHtml(world, snapshot) {
    const owner = window.state?.user?.id;
    if (!owner || snapshot.owner !== owner || window.titanAccountTransition?.active || isGuest() || snapshot.version < 3) return "";
    const earned = (Array.isArray(snapshot.quest_rewards) ? snapshot.quest_rewards : []).filter(r => r.world === world.id && Number.isInteger(r.chapter) && r.chapter >= 1 && r.chapter <= 9 && window.TitanCampaignQuests?.rewardName(r.quest_id));
    if (!earned.length) return "";
    // A souvenir is a shard kept in the notebook: an object with its name, its chapter and its state in words.
    return `<section class="asc-section av-panel av-souvenirs-wrap" data-quest-souvenirs><h2 class="asc-h2">Souvenirs de quêtes confirmés</h2><p class="asc-small asc-muted">Conservés dans ton carnet, même après une correction de séance. Ils ne donnent ni XP ni crédits.</p><div class="av-souvenirs">${earned.map(r => `<p class="av-souvenir" data-quest-souvenir><span class="sig-object av-obj" style="--obj:44px" aria-hidden="true">${SHARD}</span><span class="av-souvenir-copy"><small>Chapitre ${r.chapter}</small><strong>${esc(window.TitanCampaignQuests.rewardName(r.quest_id))}</strong></span>${state("is-owned", "check", "Confirmé")}</p>`).join("")}</div></section>`;
  }
  /* The shard of a quest souvenir: a cut stone drawn in the colour of the space (no image exists for it). */
  const SHARD = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 3 39 17 31 45H17L9 17Z" fill="var(--bg-3)" stroke="var(--space)" stroke-width="1.5" stroke-linejoin="round"/><path d="M24 3 24 45M9 17H39M24 3 17 17 24 45 31 17Z" fill="none" stroke="var(--space)" stroke-width="1" stroke-linejoin="round" opacity=".55"/><path d="M24 3 17 17H9Z" fill="var(--space)" opacity=".55"/><path d="M24 3 31 17 24 45Z" fill="var(--space)" opacity=".22"/></svg>';

  function guardianHtml(world, p, snapshot) {
    const owner = window.state?.user?.id;
    const encounter = owner && snapshot?.owner === owner && !window.titanAccountTransition?.active
      ? window.TitanCampaignEncounters?.describe(p, window.TitanProgress.campaignProgress(p)) : null;
    const portrait = (alt) => `<img src="/assets/renaissance/guardian-${esc(world.id)}-s.webp" srcset="/assets/renaissance/guardian-${esc(world.id)}-s.webp 256w, /assets/renaissance/guardian-${esc(world.id)}.webp 640w" sizes="(max-width: 719px) 100vw, 320px" alt="${esc(alt)}" width="256" height="256" loading="lazy" decoding="async">`;
    const finished = p.chapter >= 10;
    // The guardian of the region, as a presence: its portrait, where it stands (ahead, or recognising you), what it will ask.
    const waiting = `<section class="av-guardian${finished ? " is-won" : ""}" style="--world:${world.color}">
      ${portrait(world.guardian)}
      <div><p class="asc-eyebrow">Le gardien de la région</p><h2 class="asc-h2">${esc(world.guardian)}</h2>
        ${finished ? state("is-owned", "check", "Te reconnaît") : state("is-locked", "lock", "Au neuvième chapitre")}
        <p>${finished ? esc(world.ending) : `Au neuvième chapitre, ${esc(world.guardian.toLocaleLowerCase("fr-FR"))} attend ${p.chapter === 9 ? `${p.target} jours actifs${p.effort_target ? ` et ${p.effort_target} minutes d’effort` : ""}. 90 minutes au plus par jour` : personalServer() ? "une cible personnelle fixée au départ de ce chapitre, sur au moins deux jours distincts" : `trois jours actifs${effortRule() ? " et 150 minutes d’effort, 90 au plus par jour" : ""}`}.`}</p></div>
    </section>`;
    if (!encounter) return waiting;
    const boss = encounter.kind === "guardian";
    // The trial of the chapter: an obstacle on the trail, or the guardian itself at the ninth. Its phases are the chapter's own
    // confirmed objectives — nothing else moves it.
    return `<section class="av-panel av-enc${boss ? " is-guardian" : ""}" data-campaign-encounter data-state="${encounter.state}" style="--world:${world.color}">
      ${boss ? `<figure class="av-presence">${portrait("")}</figure>` : ""}
      <div class="av-enc-copy"><p class="asc-eyebrow">${boss ? "Rencontre du gardien" : "Obstacle du chapitre"}</p><h2 class="asc-h2">${esc(encounter.name)}</h2>
        ${boss ? state("is-rare", encounter.ready ? "check" : "shield", encounter.ready ? "Prêt à être affronté" : "Face à toi") : state(encounter.ready ? "is-owned" : "", encounter.ready ? "check" : "route", encounter.ready ? "Passage prêt" : "Sur ton sentier")}
        <p>${esc(encounter.text)}</p>
        ${boss ? `<p class="asc-small" data-guardian-goal>Au neuvième chapitre, ${esc(world.guardian.toLocaleLowerCase("fr-FR"))} attend ${p.target} jours actifs${p.effort_target ? ` et ${p.effort_target} minutes d’effort` : ""}. 90 minutes au plus par jour.</p>` : ""}</div>
      <div class="av-enc-proof">
        <div class="av-track"><div class="asc-between"><span>Avancement de l’épreuve</span><strong class="asc-num">${encounter.percent}%</strong></div>
          <span class="asc-ascent" role="progressbar" aria-label="Avancement de l’épreuve" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${encounter.percent}"><span style="--p:${encounter.percent}%"></span></span></div>
        <h3 class="av-enc-sub">Ce qui fait avancer l’épreuve</h3>
        <ol class="av-phases">${encounter.phases.map((phase, i) => `<li data-phase="${phase.id}" data-state="${phase.state}"><span class="av-phase-mark" aria-hidden="true">${phase.state === "done" ? icon("check") : i + 1}</span><div><strong>${esc(phase.name)} · ${phase.state === "done" ? "preuves réunies" : phase.state === "active" ? "en cours" : "à venir"}</strong><p class="asc-small asc-muted">${F().number(phase.value)}/${F().number(phase.target)} ${esc(phase.unit)}</p></div></li>`).join("")}</ol>
        <p class="asc-small asc-muted">Le pourcentage suit l’objectif le moins avancé du chapitre. Les mêmes séances peuvent faire avancer plusieurs phases ; les preuves déjà réunies sont conservées.</p>
        <p class="asc-small" data-encounter-outcome>${encounter.ready ? `Épreuve prête à valider : utilise « ${boss ? "Affronter le gardien" : "Allumer la balise"} ». Le passage sera confirmé après validation de la campagne.` : "L’épreuve avance avec les jours et l’effort admissibles de ce chapitre. Reviens à ton rythme pour poursuivre."}</p>
      </div>
    </section>${boss ? "" : waiting}`;
  }

  function carnetHtml(world, p) {
    const sealed = p.chapter >= 10;
    // The notebook of the world: nine badges as objects — the beacon of each chapter, the guardian's portrait for the last —
    // and the seal of exploration that closes it once the nine are confirmed.
    return `<section class="av-carnet-wrap" style="--world:${world.color}" aria-labelledby="av-carnet-title"><div class="av-carnet-head">
        <span class="sig-object${sealed ? "" : " is-locked"}" style="--obj:88px" aria-hidden="true"><img src="/assets/objects/sceau-exploration-256.webp" alt="" width="256" height="256" loading="lazy" decoding="async"></span>
        <div><h2 class="asc-h2" id="av-carnet-title">Le carnet</h2><p class="asc-small asc-muted">${esc(world.name)} · ${done(p)}/9 insignes</p>
          ${sealed ? state("is-owned", "check", "Carnet scellé") : state("is-locked", "lock", "Sceau aux neuf balises")}</div></div>
      <div class="av-carnet">${world.chapters
        .map((ch) => {
          const earned = p.chapter > ch.index;
          const current = p.chapter === ch.index;
          return `<button type="button" class="av-carnet-row${earned ? " is-earned" : ""}${current ? " is-current" : ""}" data-chapter="${ch.index}">${badgeObject(world, ch, earned, 68)}<span class="av-carnet-copy"><small>Chapitre ${ch.index}${ch.boss ? " · gardien" : ""}</small><strong>${esc(ch.title)}</strong><span>${esc(ch.name)}</span></span>${earned ? state("is-owned", "check", "Confirmé") : current ? state("", "route", "En cours") : state("is-locked", "lock", "À découvrir")}</button>`;
        })
        .join("")}</div></section>`;
  }

  /* The switch between the four views: each button says where its view stands, in a word or a count. */
  function viewsHtml(p, questsHtml) {
    const ready = (questsHtml.match(/data-quest-claim=/g) || []).length;
    const status = {
      chapitre: p.chapter >= 10 ? "terminé" : p.chapter ? `${p.chapter} / 9` : "à ouvrir",
      quetes: ready ? `${ready} prête${ready > 1 ? "s" : ""}` : questsHtml.includes("data-periodic-quest=") ? "en cours" : "libres",
      sentiers: window.TitanJourneyPanel?.status?.() || (isGuest() ? "compte" : "tes pas"),
      carnet: `${done(p)} / 9`,
    };
    return `<div class="av-views" role="group" aria-label="Explorer ce monde">${VIEWS.map(([id, label]) => `<button type="button" class="av-view-btn" data-av-view-btn="${id}" aria-pressed="${view === id}"><strong>${label}</strong><small data-av-view-status="${id}">${esc(status[id])}</small></button>`).join("")}</div>`;
  }
  function showView(next, { scroll = false, focus = false } = {}) {
    if (!VIEWS.some(([id]) => id === next)) return;
    view = next;
    root.querySelectorAll("[data-av-view]").forEach((el) => { el.hidden = el.dataset.avView !== view; });
    root.querySelectorAll(".av-views [data-av-view-btn]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.avViewBtn === view)));
    const url = new URL(location.href);
    url.hash = view === "chapitre" ? "" : view;
    history.replaceState(history.state, "", url);
    const target = root.querySelector(".av-views");
    if (scroll && target) target.scrollIntoView({ block: "start" });
    if (focus) root.querySelector(`.av-views [data-av-view-btn="${view}"]`)?.focus({ preventScroll: true });
  }

  function render() {
    if (!root) return;
    const journeyHost = root.querySelector("[data-journey-host]");
    const worldTabs = root.querySelector(".av-worlds");
    const tabScroll = worldTabs?.scrollLeft || 0;
    const active = document.activeElement;
    const focusedWorld = worldTabs?.contains(active) ? active.closest('[role="tab"][data-world]')?.dataset.world : null;
    const focusedPath = root.contains(active) ? active.dataset.weekPathId : null;
    const panelFocused = active === root.querySelector("#av-region-panel");
    const missionFocused = active?.id === "av-mission-title";
    const openDeparture = root.querySelector("[data-rpg-departure][open]")?.dataset.rpgDeparture;
    const openQuests = root.querySelector("[data-rpg-quests][open]")?.dataset.rpgQuests;
    const s = A()?.snapshot;
    if (!s) {
      root.innerHTML = `<div class="asc-empty"><h2>${A()?.status === "error" ? "L’aventure est momentanément indisponible" : "Ton univers se prépare…"}</h2><p>Tes séances restent dans ton journal.</p>${A()?.status === "error" ? `<button type="button" class="asc-btn asc-btn-secondary" data-retry>${icon("restore")} Réessayer</button>` : ""}</div>`;
      root.setAttribute("aria-busy", A()?.status === "error" ? "false" : "true");
      return;
    }
    const world = C().worlds.find((w) => w.id === (selected || s.selected_world)) || C().worlds[0];
    selected = world.id;
    const p = campaign(world);
    root.setAttribute("aria-busy", "false");
    const focusedView = root.contains(active) ? active.closest?.(".av-views [data-av-view-btn]")?.dataset.avViewBtn : null;
    const questsHtml = `${window.TitanPeriodicQuests?.html() || ""}${weeklyPathsHtml(s)}${questLogHtml(s)}`;
    const hide = (id) => (view === id ? "" : " hidden");
    root.innerHTML = `
      ${A().status === "cached" ? `<p class="asc-note">${icon("cloud")}<span>Dernière progression connue ; elle se met à jour dès que le serveur répond.</span></p>` : ""}
      ${worldsHtml(s, world, focusedWorld)}
      <div id="av-region-panel" role="tabpanel" aria-labelledby="av-tab-${world.id}" tabindex="0">
        <div class="av-grid">${missionHtml(world, p, s)}${mapHtml(world, p)}</div>
        ${isGuest() ? `<p class="asc-note">${icon("offline")}<span>Mode découverte : l’aventure se joue sur cet appareil. Avec un compte, elle est confirmée par le serveur.</span></p>` : ""}
        ${viewsHtml(p, questsHtml)}
        <div class="av-view av-view-chapitre" data-av-view="chapitre"${hide("chapitre")}>
          <div data-consequence-host></div>
          ${guardianHtml(world, p, s)}
          ${valleyHtml(world, p, s)}
          ${window.titanAccountTransition?.active ? "" : window.TitanJourneyPanel?.worldStoryHtml?.(s, world, window.state?.user?.id) || ""}
          <section class="av-panel" data-rpg-host aria-label="Journal des rencontres"></section>
        </div>
        <div class="av-view av-view-quetes" data-av-view="quetes"${hide("quetes")}>
          ${questsHtml.trim() ? questsHtml : `<div class="sig-empty">${icon("compass")}<h3>Les quêtes suivent ta pratique</h3><p>${isGuest() ? "Les quêtes de la semaine et du mois se calculent avec un compte, d’après tes séances confirmées." : "Elles apparaissent dès que tes premières séances sont enregistrées. Rien à rattraper : elles sont facultatives."}</p><a class="asc-btn asc-btn-secondary" href="/training">${icon("plus")} Enregistrer une séance</a></div>`}
        </div>
        <div class="av-view av-view-sentiers" id="sentiers" data-av-view="sentiers"${hide("sentiers")}>
          <section class="av-sentiers" data-journey-host aria-label="Sentiers et jalons de carrière"></section>
        </div>
        <div class="av-view av-view-carnet" data-av-view="carnet"${hide("carnet")}>
          <section class="av-panel av-indices" id="indices" data-quest-host aria-label="Carnet d’indices"></section>
          ${carnetHtml(world, p)}
          ${questSouvenirsHtml(world, s)}
          <details class="asc-note av-rules"><summary>Les règles de l’aventure</summary>
            <p>Une étape commence quand tu démarres la campagne ou allumes la balise précédente. Une séance compte si elle a été enregistrée après ce départ, une seule fois par jour, quel que soit son volume. Les séances archivées, signalées ou ajoutées plus de 30 jours après leur date ne comptent pas.</p>
            <p>${personalServer() ? "Les nouveaux chapitres adaptent leurs cibles à tes 28 derniers jours admissibles, puis les gardent figées jusqu’à validation. Le gardien demande au moins deux jours distincts et l’effort indiqué, 90 minutes au plus par jour. Les conditions des chapitres déjà commencés sont conservées." : effortRule() ? "Le gardien demande en plus 150 minutes d’effort, 90 au plus par jour. Ces conditions fixes restent celles du mode découverte et de cet ancien contrat." : SOON} Les insignes restent dans ta collection après une correction ou un archivage. Ils ne donnent ni XP ni crédits. Une pause n’enlève rien.</p></details>
        </div>
      </div>
      <p class="asc-small" role="status" id="av-error"></p>`;
    if (journeyHost) root.querySelector("[data-journey-host]").replaceWith(journeyHost);
    window.TitanJourneyPanel?.mount(root.querySelector("[data-journey-host]"));
    // An address that names a view (/adventure#sentiers from the steps page) opens on it, under the scene.
    if (!journeyHost && viewOf(location.hash)) {
      requestAnimationFrame(() => {
        // Read again: another render may have replaced the view between this one and the frame.
        if (viewOf(location.hash) === view) root.querySelector(`[data-av-view="${view}"]`)?.scrollIntoView();
      });
    }
    if (focusedView) root.querySelector(`.av-views [data-av-view-btn="${focusedView}"]`)?.focus({ preventScroll: true });
    window.TitanRpgPanel?.mount(root.querySelector("[data-rpg-host]"), world.id);
    // V1.5.2: the access the Veilleur's outcome opened, reached from the Camp de base (/adventure?world=aube#retour).
    window.TitanConsequencePanel?.mount(root.querySelector("[data-consequence-host]"), world.id);
    // V1.5.4: the notebook of clues and its access from the map (a chain that leaves or reaches this world).
    window.TitanQuestPanel?.mount(root.querySelector("[data-quest-host]"), world.id, root.querySelector("[data-quest-map]"));
    const guide = root.querySelector("[data-rpg-departure]");
    if (guide && guide.dataset.rpgDeparture === openDeparture) guide.open = true;
    const quests = root.querySelector("[data-rpg-quests]");
    if (quests && quests.dataset.rpgQuests === openQuests) quests.open = true;
    root.querySelector(".av-worlds").scrollLeft = tabScroll;
    if (focusedWorld) root.querySelector(`#av-tab-${focusedWorld}`)?.focus({ preventScroll: true });
    else if (panelFocused) root.querySelector("#av-region-panel")?.focus({ preventScroll: true });
    else if (missionFocused) root.querySelector("#av-mission-title")?.focus({ preventScroll: true });
    else if (focusedPath) root.querySelector(`[data-week-path-id="${CSS.escape(focusedPath)}"]`)?.focus({ preventScroll: true });
  }

  async function mutate(action, params) {
    if (busy) return;
    busy = true;
    root.querySelectorAll("[data-start],[data-claim]").forEach((b) => (b.disabled = true));
    try {
      const before = campaign(C().worlds.find((w) => w.id === params.world));
      await A().action(action, params);
      if (action === "start") window.TitanAnalytics?.track("campaign_started", { world: params.world });
      if (action === "claim") {
        window.TitanAnalytics?.track("campaign_progress", { world: params.world, chapter: params.chapter });
        celebrate(C().worlds.find((w) => w.id === params.world), before.chapter);
      }
      render();
      // The pressed button is gone with the old panel: keyboard and screen-reader focus go to the new mission instead of the top of the page.
      if (action === "start" && [document.body, null].includes(document.activeElement)) root.querySelector("#av-mission-title")?.focus({ preventScroll: true });
    } catch (e) {
      const msg = A().message(e);
      const el = document.getElementById("av-error");
      if (el) el.textContent = msg;
      window.titanShell.toast({ type: "warn", title: "Pas encore", message: msg });
      if (e.message === "ADVENTURE_CONFLICT") await A().refresh({ force: true });
    } finally {
      busy = false;
      root.querySelectorAll("[data-start],[data-claim]").forEach((b) => (b.disabled = false));
    }
  }

  /* A beacon was lit: the sheet opens on the painting of the world, with the trail of its nine beacons under it — those already
     lit, the one that just lit, the ones ahead. The guardian keeps its portrait. Everything shown is what the server confirmed. */
  function celebrate(world, index) {
    const ch = world.chapters[index - 1];
    const body = document.createElement("div");
    body.className = "asc-stack av-celebrate";
    const trail = world.chapters.map((c) => `<li class="${c.index < index ? "is-lit" : c.index === index ? "is-lit is-new" : ""}${c.boss ? " is-boss" : ""}">${c.index === index ? `<span>${c.index}</span>` : ""}</li>`).join("");
    body.innerHTML = `<figure class="av-celebrate-art" style="--world:${world.color}">
        <img src="/assets/renaissance/${ch.boss ? `guardian-${world.id}` : `${world.image}-small`}.webp" alt="${ch.boss ? esc(world.guardian) : ""}" width="${ch.boss ? 640 : 800}" height="${ch.boss ? 640 : 450}" decoding="async"${ch.boss ? ' class="is-guardian"' : ""}>
        <ol class="av-celebrate-trail" aria-label="Balise ${index} sur 9">${trail}</ol>
      </figure>
      <div class="av-celebrate-prize">${ch.boss
        ? `<span class="sig-object av-obj" style="--obj:92px" aria-hidden="true"><img src="/assets/objects/sceau-exploration-256.webp" alt="" width="256" height="256" decoding="async"></span>`
        : badgeObject(world, ch, true, 84)}
        <div><p class="asc-eyebrow am">${ch.boss ? "Monde accompli · insigne obtenu" : "Insigne obtenu"}</p><p class="av-celebrate-title">${esc(ch.title)}</p>
        ${ch.boss ? state("is-owned", "check", "Carnet scellé · 9/9") : state("is-owned", "check", `Balise ${index} sur 9`)}</div></div>
      <p class="av-celebrate-story">${esc(ch.boss ? world.ending : ch.story)}</p>
      ${!ch.boss ? `<p class="asc-small asc-muted">Prochaine étape : <strong>${esc(world.chapters[index]?.name || "")}</strong>.</p>` : ""}
      <button type="button" class="asc-btn asc-btn-primary" data-close-celebrate>Continuer</button>`;
    const d = window.titanShell.sheet({ title: ch.boss ? world.guardian : `Balise ${index} allumée`, eyebrow: world.name, body });
    d.classList.add("av-celebrate-sheet");
    d.dataset.space = "aventure";
    body.querySelector("[data-close-celebrate]").addEventListener("click", () => d.close());
  }
  // The capture bench and the journeys open this moment without playing a whole chapter.
  window.TitanAdventureMoment = { celebrate: (worldId, index) => { const w = C().worlds.find((x) => x.id === worldId); if (w && w.chapters[index - 1]) celebrate(w, index); } };

  function openChapter(index) {
    const world = C().worlds.find((w) => w.id === selected) || C().worlds[0];
    const p = campaign(world);
    const ch = world.chapters[index - 1];
    if (!ch) return;
    const earned = p.chapter > index;
    const current = p.chapter === index;
    const ids = current ? p.evidence?.source_ids || [] : (A().snapshot?.rewards || []).find((r) => r.world === world.id && r.chapter === index)?.source_ids || [];
    const logs = [...(window.state?.history || []), ...(window.state?.archivedHistory || [])];
    const body = document.createElement("div");
    body.className = "asc-stack";
    body.innerHTML = `<div class="av-mission-head av-chapter-head" style="--world:${world.color}">${badgeObject(world, ch, earned, 72)}<div><p class="asc-small asc-muted">Insigne · ${esc(ch.title)}</p>${earned ? state("is-owned", "check", "Balise allumée") : current ? state("", "route", "Étape en cours") : state("is-locked", "lock", "À découvrir")}</div></div>
      <p>${esc(ch.story)}</p>
      <div class="av-practice"><p class="asc-eyebrow">Le repère à emporter</p><p>${esc(ch.practice)}</p></div>
      <p class="asc-small">${current ? `Mission : ${p.target} jour${p.target > 1 ? "s" : ""} actif${p.target > 1 ? "s" : ""}${p.route === "journal" ? " avec une note de séance" : ""}${p.effort_target ? ` et ${p.effort_target} minutes d’effort (90 max par jour)` : ""}.` : earned ? "Chapitre validé ; ses conditions ne sont pas recalculées." : personalServer() ? "La cible personnelle sera fixée au départ de ce chapitre." : `Mission : ${ch.target} jour${ch.target > 1 ? "s" : ""} actif${ch.target > 1 ? "s" : ""}${p.route === "journal" ? " avec une note de séance" : ""}${ch.boss && effortRule() ? " et 150 minutes d’effort (90 max par jour)" : ""}.`} Insigne : <strong>${esc(ch.title)}</strong>.</p>
      ${ids.length ? `<div class="asc-stack-sm"><p class="asc-eyebrow">Séances qui ont compté</p><div class="asc-list">${ids
        .map((id) => {
          const l = logs.find((x) => String(x.id) === String(id) || x.client_event_id === id);
          return `<a class="asc-row" href="/journal?session=${encodeURIComponent(id)}"><span class="asc-row-main"><span class="asc-row-title">${l ? esc(SP().label(l.sport)) : "Séance"}</span><span class="asc-row-sub">${l ? esc(F().relativeDay(l.date)) : "Ouvrir dans le journal"}</span></span>${icon("chevron")}</a>`;
        })
        .join("")}</div></div>` : ""}`;
    window.titanShell.sheet({ title: ch.name, eyebrow: `${world.name} · chapitre ${index}`, body });
  }

  let booted = false;
  function onTabKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tab = e.target.closest('.av-worlds [role="tab"]');
    if (!tab) return;
    const tabs = [...tab.parentElement.querySelectorAll('[role="tab"]')];
    const offset = e.key === "ArrowRight" ? 1 : -1;
    const next = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (tabs.indexOf(tab) + offset + tabs.length) % tabs.length;
    e.preventDefault();
    tabs[next].focus();
  }

  function onTabFocus(e) {
    const current = e.target.closest('.av-worlds [role="tab"]');
    if (!current) return;
    current.parentElement.querySelectorAll('[role="tab"]').forEach((tab) => { tab.tabIndex = tab === current ? 0 : -1; });
  }

  function onTabExit(e) {
    const tablist = e.target.closest(".av-worlds");
    if (!tablist || tablist.contains(e.relatedTarget ?? document.activeElement)) return;
    tablist.querySelectorAll('[role="tab"]').forEach((tab) => { tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1; });
  }

  function start() {
    root = document.getElementById("aventure");
    if (!root || !window.state?.user || !window.TitanAdventure || !window.TitanCodex) return;
    if (!booted) {
      booted = true;
      SP()?.ensure?.();
      window.TitanPeriodicQuests?.refresh();
      root.addEventListener("keydown", onTabKey);
      root.addEventListener("focusin", onTabFocus);
      root.addEventListener("focusout", onTabExit);
      root.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.dataset.world) {
          selected = b.dataset.world;
          const url = new URL(location.href);
          url.searchParams.set("world", selected);
          history.replaceState(history.state, "", url);
          render();
          root.querySelector(`#av-tab-${selected}`)?.focus();
          return;
        }
        if (b.dataset.avViewBtn) return showView(b.dataset.avViewBtn, b.hasAttribute("data-av-goto") ? { scroll: true, focus: true } : {});
        if (b.hasAttribute("data-retry")) return A().refresh({ force: true });
        if (b.hasAttribute("data-start")) return mutate("start", { world: selected, route: root.querySelector("[name=route]:checked")?.value || "rhythm" });
        if (b.dataset.claim) return mutate("claim", { world: selected, chapter: Number(b.dataset.claim) });
        if (b.dataset.chapter) return openChapter(Number(b.dataset.chapter));
      });
      A().refresh?.();
    }
    render();
  }
  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      start();
    });
  };
  ["titan:adventure-updated", "titan:history-updated"].forEach((ev) => window.addEventListener(ev, queue));
  window.addEventListener("titan:periodic-quests-updated", () => { if (root && window.TitanAdventure?.snapshot) render(); });
  window.addEventListener("hashchange", () => { const next = viewOf(location.hash); if (next && next !== view && root?.querySelector(".av-views")) showView(next, { scroll: true }); });
  window.addEventListener("titan:account-changing", () => root?.querySelectorAll("[data-valley-encounter], [data-campaign-encounter], [data-quest-souvenirs], [data-world-story]").forEach(el => el.remove()));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
