import type { NavigatorScreenParams } from "@react-navigation/native";
import type { TrainingPayload } from "../core/types";

export type TabParams = {
  QG: undefined;
  Progress: { tab?: "week" | "journal" | "records" | "goals" } | undefined;
  Record: undefined;
  Adventure: undefined;
  Profile: undefined;
};

export type RootParams = {
  // Signed out
  /** The guided visit before sign-up. `replay`: opened again on purpose, from Help or the welcome screen. */
  Tour: { replay?: boolean } | undefined;
  Welcome: undefined;
  Login: { email?: string } | undefined;
  Signup: undefined;
  Forgot: { email?: string } | undefined;
  // Signed in
  Onboarding: undefined;
  Tabs: NavigatorScreenParams<TabParams> | undefined;
  /** `replaces`: queue key of a refused session this form corrects (« Corriger et renvoyer », V1.6.1). */
  SessionForm: { sport: string; duplicateOf?: string; quickMinutes?: number; replaces?: string } ;
  /** `follow`: id of a route of the private library to follow during this outing (kept on the phone for offline use). */
  GpsRecord: { sport: string; follow?: string };
  LiveSession: { sport: string };
  Camp: undefined;
  /** `importGpx`: opened to import a file at once (from the planner, when no routing service exists). */
  Routes: { importGpx?: boolean } | undefined;
  /** `id`: a server route id, or the id made on this phone for a route the server has not confirmed yet. */
  Route: { id: string };
  /** V1.7.7 — planning a route (`sport` preselects the routing profile). */
  RoutePlanner: { sport?: string } | undefined;
  /** V1.7.7 — personal points and the useful points nearby. */
  Places: undefined;
  SessionResult: { eventId: string; stored?: { owner: string; payload: TrainingPayload } };
  SessionDetail: { id: string };
  SessionEdit: { id: string };
  Journal: { sport?: string; weekStart?: number } | undefined;
  Records: undefined;
  Career: undefined;
  Goals: undefined;
  Plan: undefined;
  World: { id: string; focus?: "retour" | "indices" | "chroniques" };
  Sentiers: undefined;
  Atelier: undefined;
  Community: { ami?: string; guilde?: string; invitation?: string } | undefined;
  Events: undefined;
  Retro: { year?: number; month?: number } | undefined;
  SaveAccount: undefined;
  Capsules: undefined;
  HistoryImport: undefined;
  Settings: undefined;
  Account: undefined;
  Privacy: undefined;
  Notifications: undefined;
  Sports: undefined;
  PublicCard: undefined;
  Help: undefined;
  Guide: undefined;
  HealthConnect: undefined;
  Steps: undefined;
  Sources: undefined;
  WebHub: undefined;
  Garmin: undefined;
  Feedback: undefined;
  Legal: undefined;
  About: undefined;
  TitanPlus: undefined;
  DeleteAccount: undefined;
  Pending: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootParams {}
  }
}
