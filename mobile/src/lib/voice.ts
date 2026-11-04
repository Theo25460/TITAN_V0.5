/* TITAN's voice on the QG (immersion): one short line, direct and warm, that speaks of the player's own journey. Pure and deterministic.
   Rules of the house: it states what is true (a beacon is ready, the week is held), it never scolds, never counts missed days, never
   asks the player to come back, and never promises a reward that is not confirmed by the server. */
export type VoiceContext = {
  hour: number;
  /** Day of the year, to vary the quiet lines without randomness. */
  dayOfYear: number;
  sessions: number;
  sessionsToday: number;
  weekDays: number;
  weekTarget: number;
  chapterReady: boolean;
  worldName: string | null;
  stepsRatio: number | null;
  /** Whole days since the last visit, or null when unknown. */
  daysAway: number | null;
};

const pick = <T,>(list: readonly T[], day: number) => list[Math.abs(day) % list.length]!;

export function voiceLine(c: VoiceContext): string {
  if (c.sessions === 0) return "Ta première balise t’attend : une séance, même courte, suffit pour allumer le chemin.";
  if (c.sessionsToday > 0) return pick(["Belle séance. Ton chemin avance.", "C’est noté. Ce que tu viens de faire compte.", "Bien joué : l’effort est dans ton journal."], c.dayOfYear);
  if (c.chapterReady) return c.worldName ? `Une balise est prête à s’allumer dans ${c.worldName}.` : "Une balise est prête à s’allumer.";
  if (c.daysAway !== null && c.daysAway >= 3) return c.worldName ? `Content de te revoir. ${c.worldName} t’attendait, sans pression.` : "Content de te revoir. Tout est là, à ton rythme.";
  if (c.weekTarget > 0 && c.weekDays >= c.weekTarget) return "Semaine tenue. Le repos fait aussi avancer.";
  if (c.stepsRatio !== null && c.stepsRatio >= 1) return "Objectif de pas atteint : tu as bien marché aujourd’hui.";
  if (c.hour < 5) return "Il est tard : le repos fait partie de la progression.";
  if (c.hour < 12) return pick(["Une bonne journée pour avancer.", "Le chemin commence par un premier pas.", "Prêt quand tu l’es."], c.dayOfYear);
  if (c.hour < 18) return pick(["Il reste de la place pour une sortie.", "Ton monde t’attend, à ton rythme.", "Un peu de mouvement, et le chemin avance."], c.dayOfYear);
  return pick(["Pose la journée : ton chemin est toujours là.", "Une séance légère, ou le repos : les deux comptent.", "Le soir aussi, on avance."], c.dayOfYear);
}

export const dayOfYear = (d: Date) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86_400_000);
