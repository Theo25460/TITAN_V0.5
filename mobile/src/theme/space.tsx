import { createContext, useContext, type ReactNode } from "react";
import { spaces, type SpaceId, type SpaceTheme } from "./tokens";

/* Every screen belongs to one space of the app; the space gives its colour to the header field, the primary button, the selected
   chip, the links. A screen pushed on the stack keeps the colour of the space it was opened from by its route, so a person always
   knows where they are: lime is « I record », azure is « I measure », moss is the adventure, chalk is me, coral is the others. */
const ROUTE_SPACE: Record<string, SpaceId> = {
  QG: "qg", Tabs: "qg", Welcome: "qg", Login: "qg", Signup: "qg", Forgot: "qg", Onboarding: "qg", Tour: "qg",
  Record: "seance", SessionForm: "seance", GpsRecord: "seance", LiveSession: "seance", SessionResult: "seance", SessionEdit: "seance", Routes: "seance", Route: "seance", Pending: "seance",
  Progress: "progres", Journal: "progres", Records: "progres", Career: "progres", Goals: "progres", Plan: "progres", SessionDetail: "progres", Retro: "progres", Steps: "progres",
  Adventure: "aventure", World: "aventure", Sentiers: "aventure", Camp: "aventure",
  Profile: "profil", Atelier: "profil", PublicCard: "profil", Capsules: "profil", Settings: "profil", Account: "profil", Privacy: "profil", Notifications: "profil", Sports: "profil",
  Help: "profil", Guide: "profil", HealthConnect: "profil", Sources: "profil", WebHub: "profil", Garmin: "profil", Feedback: "profil", Legal: "profil", About: "profil", TitanPlus: "profil",
  DeleteAccount: "profil", SaveAccount: "profil", HistoryImport: "profil",
  Community: "cercle", Events: "cercle",
};

export function spaceOfRoute(name: string | undefined): SpaceTheme {
  return spaces[(name && ROUTE_SPACE[name]) || "qg"];
}

const SpaceContext = createContext<SpaceTheme>(spaces.qg);

export function SpaceProvider({ space, children }: { space: SpaceTheme | SpaceId; children: ReactNode }) {
  return <SpaceContext.Provider value={typeof space === "string" ? spaces[space] : space}>{children}</SpaceContext.Provider>;
}

/** The space the component is drawn in (the QG's cyan outside any screen: dialogs, toasts). */
export const useSpace = () => useContext(SpaceContext);
