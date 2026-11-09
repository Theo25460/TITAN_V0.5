/* Local fixtures for the browser preview. This module is never used by Android builds. */
import { useState } from 'react';
import type { JourneySnapshot } from '../../src/lib/journey';
import { previewState } from '../state';

const at = '2026-11-05T12:00:00Z';
const initial: JourneySnapshot = {
  version: 1, owner: 'owner-a', configVersion: 1, totalSteps: 34000, goal: 30000000,
  today: { day: '2026-11-05', steps: 6400, sources: ['health_connect'], updatedAt: at },
  discoveries: [
    { id: 'a', steps: 10000, world: 'aube', name: 'La première trace', story: 'Les lucioles dessinent une lisière.', kind: 'milestone', earnedAt: at },
    { id: 'b', steps: 30000, world: 'aube', name: 'Le refuge des cèdres', story: 'Une lumière attend sous les branches.', kind: 'milestone', earnedAt: null },
    { id: 'c', steps: 75000, world: 'aube', name: 'La source des lucioles', story: 'La brume révèle la source.', kind: 'milestone', earnedAt: null },
    { id: 'd', steps: 1000000, world: 'marees', name: 'Les cartes des marées', story: 'Le sentier rejoint la côte.', kind: 'milestone', earnedAt: null },
    { id: 'e', steps: 10000000, world: 'forge', name: 'Le foyer des Titans', story: 'Le cuivre garde la mémoire du voyage.', kind: 'milestone', earnedAt: null },
    { id: 'f', steps: 30000000, world: 'aurores', name: 'La mémoire des constellations', story: 'Les quatre mondes retrouvent leur lien.', kind: 'milestone', earnedAt: null },
  ],
  career: { level: 8, milestones: [
    { id: 'c5', level: 5, title: 'Les premières lueurs', description: 'Un souvenir de tes premières séances.', earnedAt: at },
    { id: 'c10', level: 10, title: 'Le passeur des balises', description: 'Un souvenir gagné avec tes séances.', earnedAt: null },
  ] },
};
export function useJourney() {
  const [snapshot, setSnapshot] = useState<JourneySnapshot>(() => previewState.empty ? {
    ...initial, totalSteps: 0, today: null, discoveries: initial.discoveries.map(d => ({ ...d, earnedAt: null })),
    career: { level: 1, milestones: initial.career.milestones.map(d => ({ ...d, earnedAt: null })) },
  } : initial);
  const sync = async () => {
    const updated = { ...snapshot, discoveries: snapshot.discoveries.map(d => ({ ...d, earnedAt: d.earnedAt ?? (d.steps <= snapshot.totalSteps ? at : null) })) };
    setSnapshot(updated);
    return updated;
  };
  return { snapshot, loading: previewState.loading, error: null, busy: false, refresh: async () => {}, sync };
}
