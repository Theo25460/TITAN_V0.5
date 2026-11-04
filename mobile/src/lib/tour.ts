/* The first-use tour: twelve short steps over the REAL screens. Pure data + a per-account progress record kept on the phone.
   Nothing is forced, no permission is requested by the tour itself (each permission is asked only on the screen where its use is
   obvious), and there is no advertising anywhere in it. */
import type { IconName } from "../components/Icon";
import { ownerKey, readJSON, writeJSON } from "./storage";

export type Target = "sports" | "record" | "journal" | "adventure" | "community" | "goals" | "health" | "steps" | "plus" | "progress";
export type TourGoalId = "favorites" | "firstSession" | "stepsGoal";
export type TourStep = { id: string; icon: IconName; title: string; text: string; action?: { label: string; target: Target }; optional?: boolean; goal?: { id: TourGoalId; text: string } };

export const TOUR_STEPS: readonly TourStep[] = [
  { id: "concept", icon: "mountain", title: "Bienvenue dans TITAN", text: "TITAN transforme ton sport réel en aventure : chaque effort, quel que soit le sport, te fait progresser. Pas de pression, pas de classement public : tu avances à ton rythme." },
  { id: "sports", icon: "star", title: "Tes sports favoris", text: "Choisis jusqu’à cinq sports : ils s’affichent en premier partout. Tu peux en changer à tout moment, et les 260 sports du catalogue restent accessibles.", action: { label: "Choisir mes sports", target: "sports" }, goal: { id: "favorites", text: "Choisis au moins un sport favori" } },
  { id: "hq", icon: "home", title: "Le QG", text: "Ton point de départ : ta semaine, tes pas du jour, ta prochaine étape et tes dernières séances, en un coup d’œil." },
  { id: "manual", icon: "plus", title: "Enregistrer une séance", text: "Choisis le sport : le formulaire s’adapte (durée, distance, séries…). Sans connexion, la séance reste sur ton téléphone et part toute seule au retour du réseau.", action: { label: "Ouvrir « Séance »", target: "record" }, goal: { id: "firstSession", text: "Enregistre une première séance, même courte" } },
  { id: "gps", icon: "route", title: "Le suivi GPS", text: "Pour la course, la marche, le vélo : démarre, mets en pause, termine. TITAN mesure distance, allure et dénivelé fiable, et continue écran verrouillé. Il ne demande ta position qu’au moment où tu démarres, et ta trace reste sur ton téléphone.", action: { label: "Voir « Séance »", target: "record" } },
  { id: "health", icon: "heart", title: "Tes pas", text: "TITAN peut compter tes pas avec le capteur de ton téléphone, sans compte tiers : tu l’actives en un geste et le nombre bouge pendant que tu marches. Santé Connect reste facultatif, pour les pas de ta montre. Les pas ne créent ni séance ni récompense.", action: { label: "Voir mes pas", target: "steps" }, optional: true, goal: { id: "stepsGoal", text: "Fixe un objectif de pas" } },
  { id: "xp", icon: "bolt", title: "XP et niveaux", text: "Chaque séance rapporte de l’XP selon l’effort réel (durée, intensité), jamais selon le sport. Le serveur confirme tes gains : ils ne se perdent pas et ne se doublent pas." },
  { id: "worlds", icon: "mountain", title: "Les quatre mondes", text: "Tes efforts allument les balises de l’aventure : quatre mondes, des chapitres, des gardiens à vaincre. Se reposer fait aussi partie du jeu.", action: { label: "Ouvrir l’aventure", target: "adventure" } },
  { id: "community", icon: "group", title: "Quêtes, défis et communauté", text: "Entre amis, avec ton code ami : défis par lien, quêtes communes, saisons. Tout est choisi par toi, privé par défaut.", action: { label: "Ouvrir la communauté", target: "community" } },
  { id: "goals", icon: "target", title: "Tes objectifs", text: "Fixe un rythme hebdomadaire et des objectifs personnels. TITAN suit ta régularité sans te culpabiliser.", action: { label: "Voir mes objectifs", target: "goals" } },
  { id: "plans", icon: "crown", title: "TITAN+ et Coach (facultatif)", text: "TITAN+ retire les publicités et ajoute des analyses. Les offres Coach permettent d’accompagner 5 ou 15 sportifs, qui bénéficient alors de TITAN+. Rien n’est obligatoire pour progresser.", action: { label: "Voir les offres", target: "plus" }, optional: true },
  { id: "first", icon: "check", title: "À toi de jouer", text: "Une première action concrète : enregistre une séance, même courte, pour allumer ta première balise.", action: { label: "Enregistrer ma première séance", target: "record" } },
];

export type TourState = { v: 1; step: number; done: boolean; dismissed: boolean };
export const freshTour = (): TourState => ({ v: 1, step: 0, done: false, dismissed: false });

const clamp = (n: number) => Math.max(0, Math.min(TOUR_STEPS.length - 1, Math.round(n) || 0));
export const goTo = (s: TourState, step: number): TourState => ({ ...s, step: clamp(step) });
export const finish = (s: TourState): TourState => ({ ...s, done: true, step: TOUR_STEPS.length - 1 });
export const dismiss = (s: TourState): TourState => ({ ...s, dismissed: true });
export const restart = (): TourState => freshTour();
/** The home card offers the tour until it was finished or dismissed. */
export const shouldOffer = (s: TourState) => !s.done && !s.dismissed;
export const progressLabel = (s: TourState) => `Étape ${s.step + 1} sur ${TOUR_STEPS.length}`;

/** Last known tour state per account, kept in memory so a screen that remounts starts from the answer instead of from "unknown"
    (an invitation that appears one frame late pushes the whole QG down: V12-05). */
const known = new Map<string, TourState>();
export const peekTour = (owner: string): TourState | null => known.get(owner) ?? null;

export async function loadTour(owner: string): Promise<TourState> {
  const s = await readJSON<TourState>(ownerKey("tour", owner), freshTour());
  const tour = s && s.v === 1 ? { ...s, step: clamp(s.step) } : freshTour();
  known.set(owner, tour);
  return tour;
}
export const saveTour = (owner: string, s: TourState) => {
  known.set(owner, s);
  return writeJSON(ownerKey("tour", owner), s).catch(() => {});
};
