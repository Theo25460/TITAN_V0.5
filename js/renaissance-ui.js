(function (root) {
  "use strict";
  const esc = (value) => root.titanEscapeText(value);
  const fmt = (n) =>
    Number(n || 0).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  const icon = (name) => root.titanIcon(name);
  const sport = (key) =>
    (root.SPORTS_CONFIG?.[key]?.label || key || "Séance").replace(
      / \((Route|Builder|Piscine)\)/g,
      "",
    );
  function status(s) {
    if (s?.local)
      return '<span class="r-status local">Découverte · sur cet appareil</span>';
    if (root.TitanAdventure?.status === "cached")
      return '<span class="r-status local">Dernière progression connue</span>';
    if (!s)
      return '<span class="r-status local">Progression en cours de chargement</span>';
    return '<span class="r-status">Progression synchronisée</span>';
  }
  function character(s, { compact = false } = {}) {
    if (!s || s.owner !== root.state?.user?.id) return '<section class="r-character r-loading" style="min-height:320px" role="status">Ton personnage se prépare…</section>';
    const u = root.state?.user || {},
      level = s?.level || u.level || 1,
      xp = s?.xp ?? u.xp ?? 0,
      required =
        s?.next_level_xp || root.TitanAdventure.levelRequirement(level);
    const avatar =
      root.TitanCodex.avatars.find((a) => a.id === s?.avatar) ||
      root.TitanCodex.avatars[0];
    const rank = root.TitanAdventure.rank(level),
      nextRank = root.TitanCodex.ranks.find((r) => r.level > level);
    return `<section class="r-character ${compact ? "compact" : ""}"><div class="r-character-portrait"><img src="/assets/renaissance/${avatar.id}.webp" alt="${esc(avatar.name)}" width="640" height="640"><span class="r-level-orb"><small>NIV.</small>${fmt(level)}</span></div><div class="r-character-copy"><span class="r-eyebrow">${esc(rank.name)}</span><h2>${esc(u.name && u.name !== "Recrue" ? u.name : avatar.name)}</h2><p>${esc(avatar.role)}</p><div class="r-xp-label"><span>${fmt(xp)} XP</span><span>${fmt(required)} XP</span></div><progress class="r-xp" value="${Math.min(required, xp)}" max="${required}" aria-label="Niveau ${level} : ${fmt(xp)} XP sur ${fmt(required)}"></progress><p class="r-small">${fmt(Math.max(0, required - xp))} XP avant le niveau ${level + 1}</p><div class="r-character-footer"><span>${icon("shield")}${nextRank ? `${esc(nextRank.name)} au niveau ${nextRank.level}` : "Rang Légende"}</span><a href="/personnage">Personnaliser ${icon("arrow")}</a></div></div></section>`;
  }
  function chapterBadge(world, index, earned = false) {
    const symbols = [
      "compass",
      "route",
      "journal",
      "leaf",
      "layers",
      "target",
      "bolt",
      "shield",
      "crown",
    ];
    return `<span class="r-insignia ${earned ? "earned" : ""}" style="--world-color:${world.color}">${icon(symbols[(index - 1) % 9])}<small>${String(index).padStart(2, "0")}</small></span>`;
  }
  function current(s) {
    const world =
      root.TitanCodex.worlds.find((w) => w.id === s?.selected_world) ||
      root.TitanCodex.worlds[0];
    const progress = s?.campaigns?.find((c) => c.id === world.id);
    return {
      world,
      progress,
      chapter: world.chapters[Math.max(0, (progress?.chapter || 1) - 1)],
    };
  }
  function mission(s) {
    if (!s || s.owner !== root.state?.user?.id) return '<section class="r-panel r-mission r-loading" style="min-height:280px" role="status">Ta campagne se prépare…</section>';
    const { world, progress: p, chapter } = current(s);
    if (p?.chapter === 10)
      return `<section class="r-panel r-mission"><div class="r-section-head"><span class="r-eyebrow">Campagne terminée</span>${icon("crown")}</div><h2>${esc(world.name)}</h2><p>${esc(world.ending)}</p><a class="r-button" href="/adventure">Explorer une autre région ${icon("arrow")}</a></section>`;
    return `<section class="r-panel r-mission"><div class="r-section-head"><span class="r-eyebrow">${p?.chapter ? "Ta mission active" : "Ton aventure t’attend"}</span><span class="r-chip">${world.tier === "free" ? "Campagne gratuite" : "TITAN+"}</span></div><div class="r-mission-title">${chapterBadge(world, chapter.index, true)}<div><small>${esc(world.name)} · ${chapter.index}/9</small><h2>${esc(chapter.name)}</h2></div></div><p>${esc(chapter.story)}</p><div class="r-mission-track"><progress value="${Math.min(chapter.target, p?.evidence?.days || 0)}" max="${chapter.target}" aria-label="Mission : ${p?.evidence?.days || 0} jours sur ${chapter.target}"></progress><strong>${Math.min(chapter.target, p?.evidence?.days || 0)} / ${chapter.target}</strong></div><p class="r-small">${p?.route === "journal" ? "Jours avec une séance et une note personnelle (10 caractères minimum)." : "Jours avec une séance enregistrée après le début de cette étape."} Sans date limite.</p><a class="r-button ${p?.evidence?.days >= chapter.target ? "primary" : ""}" href="/adventure">${!p?.chapter ? "Commencer l’aventure" : p.evidence.days >= chapter.target ? "Ouvrir la récompense" : "Voir la carte"} ${icon("arrow")}</a></section>`;
  }
  root.TitanRenaissance = {
    esc,
    fmt,
    icon,
    sport,
    status,
    character,
    current,
    chapterBadge,
    mission,
  };
})(window);
