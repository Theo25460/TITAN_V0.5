/* Server-owned journey presentation, shared unchanged with native. No local source imports or rewards. */
(function(root) {
  'use strict';
  const integer = n => Number.isSafeInteger(n) && n >= 0;
  const text = v => typeof v === 'string' && v.length > 0;
  const date = v => v === null || (text(v) && Number.isFinite(Date.parse(v)));
  const worlds = new Set(['aube', 'marees', 'forge', 'aurores']);
  const daily = d => d === null || (!!d && integer(d.steps) && /^\d{4}-\d{2}-\d{2}$/.test(d.day) &&
    Array.isArray(d.sources) && d.sources.every(text) && text(d.updatedAt) && date(d.updatedAt));
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
  const api = { model };
  root.TitanJourney = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
