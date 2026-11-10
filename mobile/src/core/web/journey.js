/* Server-owned journey presentation, shared unchanged with native. No local source imports or rewards. */
(function(root) {
  'use strict';
  const integer = n => Number.isSafeInteger(n) && n >= 0;
  const text = v => typeof v === 'string' && v.length > 0;
  const date = v => v === null || (text(v) && Number.isFinite(Date.parse(v)));
  const worlds = new Set(['aube', 'marees', 'forge', 'aurores']);
  const daily = d => d === null || (!!d && integer(d.steps) && /^\d{4}-\d{2}-\d{2}$/.test(d.day) &&
    Array.isArray(d.sources) && d.sources.every(text) && text(d.updatedAt) && date(d.updatedAt));
  const storyChapters = [1, 5, 9];
  const storyIcons = ['route', 'leaf', 'shield'];
  const storyV1 = {
    aube: [
      ['Les lanternes du sentier', 'Les premières lanternes jalonnent le chemin sous les arbres.'],
      ['Le pont des racines', 'Le vieux pont relie les deux rives. On peut de nouveau traverser la vallée.'],
      ['Le refuge du Veilleur', 'Le Veilleur rallume le foyer. Le refuge reste ouvert aux voyageurs.'],
    ],
    marees: [
      ['Les feux de la crique', 'Les barques retrouvent le passage balisé jusque dans la crique.'],
      ['Le jardin des courants', 'La marée nourrit de nouveau le jardin à travers les passages libérés.'],
      ['Le phare des passages', 'Le faisceau du phare relie les îles pendant les nuits de brume.'],
    ],
    forge: [
      ['La galerie de cuivre', 'Des veilleuses éclairent à nouveau l’entrée de la galerie.'],
      ['La terrasse des braises', 'L’atelier retrouve sa chaleur et les artisans rouvrent leurs portes.'],
      ['Le foyer de la Forge', 'La dernière braise rallume le foyer commun. Les outils y trouvent leur place.'],
    ],
    aurores: [
      ['La trace dans la neige', 'Des repères réapparaissent et rendent le col visible depuis la vallée.'],
      ['Le balcon des constellations', 'Le balcon s’ouvre sur le ciel. Les voyageurs y retrouvent les premières cartes.'],
      ['L’observatoire des horizons', 'L’observatoire oriente ses miroirs vers les quatre mondes.'],
    ],
  };

  function worldStory(snapshot, world, owner) {
    if (!text(owner) || snapshot?.owner !== owner || !worlds.has(world) || !Array.isArray(snapshot.rewards)) return null;
    const dates = new Map();
    for (const receipt of snapshot.rewards) {
      if (receipt?.world === world && storyChapters.includes(receipt.chapter) && text(receipt.earned_at) && date(receipt.earned_at)) {
        const previous = dates.get(receipt.chapter);
        if (!previous || Date.parse(receipt.earned_at) < Date.parse(previous)) dates.set(receipt.chapter, receipt.earned_at);
      }
    }
    return {
      version: 1,
      scenes: storyV1[world].map(([name, description], index) => {
        const chapter = storyChapters[index];
        return { chapter, name, description, icon: storyIcons[index], earnedAt: dates.get(chapter) ?? null };
      }),
    };
  }
  function ordered(rows, field, validate) {
    if (!Array.isArray(rows) || rows.length > 2000) return false;
    const ids = new Set();
    let last = -1;
    for (const r of rows) {
      if (!r || !text(r.id) || ids.has(r.id) || !integer(r[field]) || r[field] <= 0 || r[field] < last || !date(r.earnedAt) || !validate(r)) return false;
      ids.add(r.id); last = r[field];
    }
    return true;
  }
  function model(s, owner) {
    if (!s || !text(owner) || s.owner !== owner || s.version !== 1 || !integer(s.configVersion) || !integer(s.totalSteps) || !integer(s.goal) || s.goal <= 0) return null;
    if (!ordered(s.discoveries, 'steps', d => worlds.has(d.world) && text(d.name) && text(d.story) && ['discovery', 'milestone', 'legendary'].includes(d.kind))) return null;
    if (!s.career || !integer(s.career.level) || !ordered(s.career.milestones, 'level', d => text(d.title) && text(d.description))) return null;
    if (!daily(s.today) || (s.observedToday !== undefined && !daily(s.observedToday)) ||
        (s.observedSteps !== undefined && !integer(s.observedSteps))) return null;
    const earned = s.discoveries.filter(d => d.earnedAt !== null);
    const next = s.discoveries.find(d => d.earnedAt === null) || null;
    const index = next ? s.discoveries.indexOf(next) : -1;
    const before = index > 0 ? s.discoveries[index - 1].steps : 0;
    const nextGrand = s.discoveries.find(d => d.kind !== 'discovery' && d.earnedAt === null) || null;
    return {
      snapshot: s, earned, next, nextGrand,
      careerEarned: s.career.milestones.filter(d => d.earnedAt !== null),
      nextCareer: s.career.milestones.find(d => d.earnedAt === null) || null,
      remaining: next ? Math.max(0, next.steps - s.totalSteps) : 0,
      grandRemaining: nextGrand ? Math.max(0, nextGrand.steps - s.totalSteps) : 0,
      segmentPercent: next ? Math.max(0, Math.min(100, (s.totalSteps - before) / Math.max(1, next.steps - before) * 100)) : 100,
      sagaPercent: Math.max(0, Math.min(100, s.totalSteps / s.goal * 100)),
      readyCount: s.discoveries.filter(d => d.earnedAt === null && s.totalSteps >= d.steps).length,
      careerReadyCount: s.career.milestones.filter(d => d.earnedAt === null && s.career.level >= d.level).length,
      hasStepData: s.today !== null || s.totalSteps > 0,
    };
  }
  const api = { model, worldStory };
  root.TitanJourney = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
