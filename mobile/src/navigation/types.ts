import type { NavigatorScreenParams } from "@react-navigation/native";

export type TabParams = {
  QG: undefined;
  Progress: { tab?: "week" | "journal" | "records" | "goals" } | undefined;
  Record: undefined;
  Adventure: undefined;
  Profile: undefined;
};

export type RootParams = {
  // Signed out
  Welcome: undefined;
  Login: { email?: string } | undefined;
  Signup: undefined;
  Forgot: { email?: string } | undefined;
  // Signed in
  Onboarding: undefined;
  Tabs: NavigatorScreenParams<TabParams> | undefined;
  SessionForm: { sport: string; duplicateOf?: string } ;
  SessionResult: { eventId: string };
  SessionDetail: { id: string };
  SessionEdit: { id: string };
  Journal: { sport?: string } | undefined;
  Records: undefined;
  Goals: undefined;
  Plan: undefined;
  World: { id: string };
  Atelier: undefined;
  Community: undefined;
  Settings: undefined;
  Account: undefined;
  Privacy: undefined;
  Notifications: undefined;
  Sports: undefined;
  PublicCard: undefined;
  Help: undefined;
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
