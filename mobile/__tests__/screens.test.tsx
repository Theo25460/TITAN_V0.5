/* Every screen renders with realistic account data, with empty data and while loading: no crash, key content shown. */
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { adventure, archived, atelier, goals, logs, profile, social } from "../test-fixtures/data";

const mockState = { empty: false, loading: false };
const mockQ = (data: unknown) => ({ data: mockState.loading ? undefined : data, isLoading: mockState.loading, isRefetching: false, error: null, refetch: jest.fn() });
const mockMutation = () => ({ mutate: jest.fn(), mutateAsync: jest.fn(async () => ({})), isPending: false });

jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native");
  const nav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), reset: jest.fn(), setOptions: jest.fn(), dispatch: jest.fn() };
  return { ...actual, useNavigation: () => nav, usePreventRemove: jest.fn() };
});
jest.mock("../src/data/auth", () => ({
  useOwner: () => "owner-a",
  useAuth: () => ({ owner: "owner-a", email: "a@titan.test", status: "signedIn", notice: null, clearNotice: jest.fn(), signIn: jest.fn(), signUp: jest.fn(async () => ({ needsConfirmation: true })), signOut: jest.fn(), resetPassword: jest.fn(), resendConfirmation: jest.fn(), updatePassword: jest.fn() }),
}));
jest.mock("../src/data/hooks", () => {
  const actual = jest.requireActual("../src/data/hooks");
  const { Progress } = jest.requireActual("../src/core");
  const { adventure, archived, atelier, goals, logs, profile, social } = jest.requireActual("../test-fixtures/data");
  return {
    ...actual,
    useProfile: () => mockQ(profile),
    usePrefs: () => actual.prefsOf(mockState.empty ? { ...profile, game_state: {} } : profile),
    useLogs: () => {
      const list = mockState.empty || mockState.loading ? [] : logs;
      return { ...mockQ(list), logs: list, active: Progress.activeLogs(list), archived: mockState.empty ? [] : archived, pending: [], confirmed: list };
    },
    useGoals: () => mockQ(mockState.empty ? [] : goals),
    useAdventure: () => mockQ(mockState.empty ? { ...adventure, campaigns: adventure.campaigns.map((c: { chapter: number }) => ({ ...c, chapter: 0 })), rewards: [] } : adventure),
    useAtelier: () => mockQ(atelier),
    useSocial: () => mockQ(mockState.empty ? { ...social, friends: [], requests_in: [], requests_out: [], moments: [], challenges: [], expedition: null, guild: null } : social),
    useCardSettings: () => mockQ({ enabled: true, slug: "abc123", show: { name: true, level: true, totals: false, sports: true, titles: true } }),
    useSavePrefs: mockMutation,
    useSaveGoal: mockMutation,
    useRecordSession: mockMutation,
    useUpdateSession: mockMutation,
    useAdventureAction: mockMutation,
  };
});

/* eslint-disable @typescript-eslint/no-require-imports */
const S = {
  Home: require("../src/screens/home/HomeScreen").HomeScreen,
  Progress: require("../src/screens/progress/ProgressScreen").ProgressScreen,
  Journal: require("../src/screens/progress/JournalScreen").JournalScreen,
  Records: require("../src/screens/progress/RecordsScreen").RecordsScreen,
  Goals: require("../src/screens/progress/GoalsScreen").GoalsScreen,
  Plan: require("../src/screens/progress/PlanScreen").PlanScreen,
  Record: require("../src/screens/session/RecordScreen").RecordScreen,
  Form: require("../src/screens/session/SessionFormScreen").SessionFormScreen,
  Result: require("../src/screens/session/SessionResultScreen").SessionResultScreen,
  Detail: require("../src/screens/session/SessionDetailScreen").SessionDetailScreen,
  Edit: require("../src/screens/session/SessionEditScreen").SessionEditScreen,
  Pending: require("../src/screens/session/PendingScreen").PendingScreen,
  Adventure: require("../src/screens/adventure/AdventureScreen").AdventureScreen,
  World: require("../src/screens/adventure/WorldScreen").WorldScreen,
  Profile: require("../src/screens/profile/ProfileScreen").ProfileScreen,
  Atelier: require("../src/screens/profile/AtelierScreen").AtelierScreen,
  Card: require("../src/screens/profile/PublicCardScreen").PublicCardScreen,
  Community: require("../src/screens/community/CommunityScreen").CommunityScreen,
  Settings: require("../src/screens/settings/SettingsScreen").SettingsScreen,
  Account: require("../src/screens/settings/AccountScreen").AccountScreen,
  Privacy: require("../src/screens/settings/PrivacyScreen").PrivacyScreen,
  Help: require("../src/screens/settings/HelpScreen").HelpScreen,
  Legal: require("../src/screens/settings/LegalScreen").LegalScreen,
  Plus: require("../src/screens/settings/TitanPlusScreen").TitanPlusScreen,
  Delete: require("../src/screens/settings/DeleteAccountScreen").DeleteAccountScreen,
  Welcome: require("../src/screens/auth/WelcomeScreen").WelcomeScreen,
  Login: require("../src/screens/auth/LoginScreen").LoginScreen,
  Signup: require("../src/screens/auth/SignupScreen").SignupScreen,
  Onboarding: require("../src/screens/auth/OnboardingScreen").OnboardingScreen,
};
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { ToastProvider } = require("../src/components/Toast");
const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
/* eslint-enable @typescript-eslint/no-require-imports */

const nav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), setOptions: jest.fn(), reset: jest.fn(), dispatch: jest.fn() };
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const show = (el: ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SafeAreaProvider initialMetrics={metrics}>
        <ToastProvider>{el}</ToastProvider>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
const props = (params: object = {}) => ({ navigation: nav, route: { key: "k", name: "x", params } });

beforeEach(() => {
  mockState.empty = false;
  mockState.loading = false;
});

describe("with account data", () => {
  test("QG", () => {
    show(<S.Home />);
    expect(screen.getByText(/Athlète Test/)).toBeTruthy();
    expect(screen.getByText(/Niveau 4/)).toBeTruthy();
    expect(screen.getByText("Ma semaine")).toBeTruthy();
  });
  test("Progrès : semaine, tendances, maîtrise", () => {
    show(<S.Progress />);
    expect(screen.getByText("Cette semaine")).toBeTruthy();
    fireEvent.press(screen.getByText("Tendances"));
    expect(screen.getByText("Temps de pratique par semaine")).toBeTruthy();
    fireEvent.press(screen.getByText("Maîtrise"));
    expect(screen.getByText("Maîtrise par discipline")).toBeTruthy();
  });
  test("Journal, Records, Objectifs, Semaine type", () => {
    show(<S.Journal {...props()} />);
    expect(screen.getAllByText(/Course à pied/).length).toBeGreaterThan(0);
    fireEvent.press(screen.getByText(/Archives/));
    expect(screen.getByText(/Marche/)).toBeTruthy();
    show(<S.Records />);
    expect(screen.getByText("Plus longue distance")).toBeTruthy();
    expect(screen.getByText("6B+")).toBeTruthy();
    show(<S.Goals />);
    expect(screen.getByText("Un mois en mouvement")).toBeTruthy();
    show(<S.Plan />);
    expect(screen.getByText("Lundi")).toBeTruthy();
  });
  test("Séance : choix, formulaire par famille, résultat, fiche, correction", () => {
    show(<S.Record />);
    expect(screen.getByText("Qu’as-tu fait ?")).toBeTruthy();
    for (const sport of ["running", "swimming", "muscu_gym", "bodyweight", "bouldering", "yoga", "tennis"]) {
      show(<S.Form {...props({ sport })} />);
      expect(screen.getAllByText("Enregistrer la séance").length).toBeGreaterThan(0);
    }
    show(<S.Result {...props({ eventId: logs[0].client_event_id })} />);
    expect(screen.getByText("10 km")).toBeTruthy();
    show(<S.Detail {...props({ id: logs[1].id })} />);
    expect(screen.getByText("Squat")).toBeTruthy();
    show(<S.Edit {...props({ id: logs[0].id })} />);
    expect(screen.getByText("Enregistrer la correction")).toBeTruthy();
    show(<S.Pending />);
    expect(screen.getByText("Tout est synchronisé")).toBeTruthy();
  });
  test("Aventure et monde (chapitre en cours, gardien, région à venir)", () => {
    show(<S.Adventure />);
    expect(screen.getByText(/La vallée de l’Aube/)).toBeTruthy();
    expect(screen.getAllByText(/Accès gratuit/).length).toBe(2);
    show(<S.World {...props({ id: "aube" })} />);
    expect(screen.getByText(/Chapitre 3\/9/)).toBeTruthy();
    show(<S.World {...props({ id: "marees" })} />);
    expect(screen.getAllByText(/min d’effort/).length).toBeGreaterThan(0);
    show(<S.World {...props({ id: "forge" })} />);
    expect(screen.getByText("Région à venir")).toBeTruthy();
  });
  test("Profil, Atelier, carte publique", () => {
    show(<S.Profile />);
    expect(screen.getByText(/TN-ABCD/)).toBeTruthy();
    show(<S.Atelier />);
    expect(screen.getByText("Cadre Cime")).toBeTruthy();
    fireEvent.press(screen.getByText("Ambiances"));
    expect(screen.getByText("Brume")).toBeTruthy();
    show(<S.Card />);
    expect(screen.getByText(/titan-app.fr\/u\/abc123/)).toBeTruthy();
  });
  test("Communauté : amis, moments, défis, guilde", () => {
    show(<S.Community />);
    expect(screen.getByText("Sam")).toBeTruthy();
    fireEvent.press(screen.getByText("Moments"));
    expect(screen.getByText("Squat 100 kg")).toBeTruthy();
    fireEvent.press(screen.getByText("Défis"));
    expect(screen.getByText("Semaine active")).toBeTruthy();
    expect(screen.getByText("La traversée")).toBeTruthy();
    fireEvent.press(screen.getByText("Guilde"));
    expect(screen.getByText("Membres")).toBeTruthy();
  });
  test("Réglages, compte, confidentialité, aide, légal, TITAN+, suppression", () => {
    for (const C of [S.Settings, S.Account, S.Privacy, S.Help, S.Legal, S.Plus, S.Delete]) show(<C />);
    expect(screen.getByText("Supprimer définitivement ton compte")).toBeTruthy();
  });
  test("Accès : accueil, connexion, inscription, onboarding", () => {
    show(<S.Welcome {...props()} />);
    expect(screen.getByText("Créer mon compte")).toBeTruthy();
    show(<S.Login {...props()} />);
    fireEvent.press(screen.getByTestId("login-submit"));
    expect(screen.getByText("Indique une adresse e-mail valide.")).toBeTruthy();
    show(<S.Signup {...props()} />);
    fireEvent.press(screen.getByTestId("signup-submit"));
    expect(screen.getByText("Accepte les conditions pour créer ton compte.")).toBeTruthy();
    show(<S.Onboarding />);
    expect(screen.getByText("Qu’est-ce que tu pratiques ?")).toBeTruthy();
  });
});

describe("new account (no data)", () => {
  beforeEach(() => {
    mockState.empty = true;
  });
  test("empty states guide to the first session", () => {
    show(<S.Home />);
    expect(screen.getByText("Ta première séance")).toBeTruthy();
    show(<S.Progress />);
    expect(screen.getByText("Tes statistiques commencent ici")).toBeTruthy();
    show(<S.Records />);
    expect(screen.getByText("Pas encore de record")).toBeTruthy();
    show(<S.Goals />);
    expect(screen.getByText("Fixe-toi un cap")).toBeTruthy();
    show(<S.Journal {...props()} />);
    expect(screen.getByText("Ton journal est vide")).toBeTruthy();
    show(<S.World {...props({ id: "aube" })} />);
    expect(screen.getByText("Commencer la campagne")).toBeTruthy();
    show(<S.Community />);
    expect(screen.getByText("Pas encore d’amis")).toBeTruthy();
  });
});

describe("loading", () => {
  test("screens show placeholders instead of crashing", () => {
    mockState.loading = true;
    for (const C of [S.Home, S.Progress, S.Adventure, S.Atelier, S.Community, S.Goals, S.Privacy]) show(<C />);
    show(<S.World {...props({ id: "aube" })} />);
  });
});
