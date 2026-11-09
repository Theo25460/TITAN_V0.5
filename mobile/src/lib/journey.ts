export type JourneyWorld = 'aube' | 'marees' | 'forge' | 'aurores';
export type Discovery = { id: string; steps: number; world: JourneyWorld; name: string; story: string; kind: 'discovery' | 'milestone' | 'legendary'; earnedAt: string | null };
export type CareerMilestone = { id: string; level: number; title: string; description: string; earnedAt: string | null };
type DailySteps = { day: string; steps: number; sources: string[]; updatedAt: string };
export type JourneySnapshot = {
  version: 1; owner: string; configVersion: number; totalSteps: number; goal: number;
  today: DailySteps | null;
  observedSteps?: number;
  observedToday?: DailySteps | null;
  discoveries: Discovery[];
  career: { level: number; milestones: CareerMilestone[] };
};
export type JourneyModel = { snapshot: JourneySnapshot; earned: Discovery[]; next: Discovery | null; nextGrand: Discovery | null; careerEarned: CareerMilestone[]; nextCareer: CareerMilestone | null; remaining: number; grandRemaining: number; segmentPercent: number; sagaPercent: number; readyCount: number; careerReadyCount: number; hasStepData: boolean };
export const journeyModel = (require('../core/web/journey.js') as { model: (s: unknown, owner: string) => JourneyModel | null }).model;
export const sourceLabel = (s: string) => ({ health_connect: 'Santé Connect', garmin: 'Garmin' }[s] ?? 'Source connectée');
