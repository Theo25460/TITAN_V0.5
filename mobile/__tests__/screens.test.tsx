/* Every screen renders with realistic account data, with empty data and while loading: no crash, key content shown. */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { Sports } from "../src/core";
import { buildSession, freshDraft, toPayload } from "../src/core/session";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { discardDraft, draftCleanup, loadDrafts, saveDraft } from "../src/data/drafts";
import { ownerKey } from "../src/lib/storage";
import { discard, enqueue, loadQueue } from "../src/data/queue";
import * as network from "../src/lib/network";
import { REFERENCE_NOW, adventure, archived, atelier, goals, logs, profile, social } from "../test-fixtures/data";

jest.setTimeout(60000); // the CI runner is slow when every suite runs in parallel: a screen test took 43 s there against ~20 s locally
const mockState = { empty: false, loading: false, logs: null as unknown[] | null };
const mockNav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), reset: jest.fn(), setOptions: jest.fn(), dispatch: jest.fn() };
const mockQ = (data: unknown) => ({ data: mockState.loading ? undefined : data, isLoading: mockState.loading, isRefetching: false, error: null, refetch: jest.fn() });
const mockMutation = () => ({ mutate: jest.fn(), mutateAsync: jest.fn(async () => ({})), isPending: false });

jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native");
  return { ...actual, useNavigation: () => mockNav, usePreventRemove: jest.fn() };
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
      const list = mockState.empty || mockState.loading ? [] : mockState.logs ?? logs;
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
  Sports: require("../src/screens/settings/SportsScreen").SportsScreen,
  Account: require("../src/screens/settings/AccountScreen").AccountScreen,
  Privacy: require("../src/screens/settings/PrivacyScreen").PrivacyScreen,
  Help: require("../src/screens/settings/HelpScreen").HelpScreen,
  Guide: require("../src/screens/settings/GuideScreen").GuideScreen,
  Feedback: require("../src/screens/settings/FeedbackScreen").FeedbackScreen,
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

beforeAll(() => {
  // Only the clock is frozen (on the fixtures' reference evening); timers, microtasks and interactions keep running normally.
  jest.useFakeTimers({ now: REFERENCE_NOW, doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame", "requestIdleCallback", "cancelIdleCallback", "performance", "hrtime"] });
});
afterAll(() => { jest.useRealTimers(); });
beforeEach(() => {
  mockState.empty = false;
  mockState.loading = false;
  mockState.logs = null;
});

describe("with account data", () => {
  test("QG", () => {
    show(<S.Home />);
    expect(screen.getByText(/Athlète Test/)).toBeTruthy();
    // The character is read in the banner: level, rank and the XP towards the next level, without opening the profile.
    expect(screen.getByText(/Niveau 4 ·/)).toBeTruthy();
    expect(screen.getByText(/XP vers le niveau 5/)).toBeTruthy();
    expect(screen.getByTestId("week-tile")).toBeTruthy();
    // The chapter in progress is always visible (it used to sit behind "Mes repères d’ascension").
    expect(screen.getByTestId("qg-chapter")).toBeTruthy();
    expect(screen.queryByText("Mes repères d’ascension")).toBeNull();
    // No permission or connection button on the QG: steps are one optional line.
    expect(screen.queryByTestId("steps-start-open")).toBeNull();
    expect(screen.queryByTestId("steps-connect-open")).toBeNull();
    // Recording is always one tap from the QG, whatever the priority of the day is (V12-31).
    expect(screen.queryByText("Refaire ma dernière séance") ?? screen.queryByTestId("qg-hero-cta") ?? screen.queryByTestId("qg-record")).toBeTruthy();
  });
  test("QG sans historique : une invitation claire à enregistrer la première séance", () => {
    mockState.empty = true;
    try {
      show(<S.Home />);
      expect(screen.queryByText("Refaire ma dernière séance")).toBeNull();
      expect(screen.queryByTestId("qg-hero-cta") ?? screen.queryByTestId("qg-record")).toBeTruthy();
      // A newcomer reads what TITAN is, in plain words, and no empty week ring.
      expect(screen.getByText(/TITAN enregistre tes séances de sport/)).toBeTruthy();
      expect(screen.queryByTestId("week-tile")).toBeNull();
      expect(screen.getByText(/Choisis un monde/)).toBeTruthy();
    } finally {
      mockState.empty = false;
    }
  });
  test("QG reprend le brouillon du compte depuis son action principale", async () => {
    const draft = { ...freshDraft("yoga"), durM: "25" };
    await loadDrafts("owner-a");
    await saveDraft("owner-a", draft);
    const cleanup = draftCleanup("owner-a", draft);
    const view = show(<S.Home />);
    try {
      expect(screen.queryByTestId("qg-record-primary")).toBeNull();
      expect(screen.queryByTestId("repeat-last")).toBeNull();
      fireEvent.press(screen.getByRole("button", { name: "Reprendre le brouillon" }));
      expect(mockNav.navigate).toHaveBeenLastCalledWith("SessionForm", { sport: "yoga" });
    } finally {
      view.unmount();
      await cleanup();
    }
  });
  test("QG montre les 8 dernières semaines et la séance à refaire (AUD-24)", () => {
    show(<S.Home />);
    expect(screen.queryByTestId("qg-cadence")).toBeNull();
    fireEvent.press(screen.getByTestId("qg-details"));
    expect(screen.getByTestId("qg-cadence")).toBeTruthy();
    expect(screen.getByText("Mes 8 dernières semaines")).toBeTruthy();
    expect(screen.getByTestId("repeat-last")).toBeTruthy();
  });
  test("QG garde l’accès aux événements et à la communauté pendant le chargement (AUD-23/24)", () => {
    mockState.loading = true;
    show(<S.Home />);
    fireEvent.press(screen.getByTestId("qg-events"));
    expect(mockNav.navigate).toHaveBeenLastCalledWith("Events");
    fireEvent.press(screen.getByTestId("qg-community"));
    expect(mockNav.navigate).toHaveBeenLastCalledWith("Community");
  });
  test("QG ouvre les séances en attente et propose une action locale hors ligne", async () => {
    const online = jest.spyOn(network, "useOnline").mockReturnValue(false);
    await loadQueue("owner-a");
    const item = await enqueue("owner-a", toPayload(buildSession({ ...freshDraft("yoga"), durM: "25" }), "yoga", "qg-pending", "UTC"));
    const view = show(<S.Home />);
    try {
      fireEvent.press(screen.getByRole("button", { name: "Voir les séances en attente" }));
      expect(mockNav.navigate).toHaveBeenLastCalledWith("Pending");
      expect(screen.getByTestId("offline-banner")).toBeTruthy();
    } finally {
      view.unmount();
      online.mockRestore();
      await discard("owner-a", item.key);
    }
  });
  test("Progrès : semaine, tendances, maîtrise", async () => {
    show(<S.Progress />);
    expect(screen.getByText("Cette semaine")).toBeTruthy();
    expect(screen.getByText("Ma semaine, mon chapitre")).toBeTruthy();
    expect(screen.getAllByText("2 séances confirmées · 2 jours actifs.")).toHaveLength(2);
    fireEvent.press(screen.getByText("Tendances"));
    expect(screen.getByText("Tes questions")).toBeTruthy();
    expect(screen.getByText("Où va mon temps ?")).toBeTruthy();
    // The secondary figures are computed after the first paint (src/lib/deferred.ts): wait for them instead of reading them at once.
    expect(await screen.findByText("Combien de semaines ai-je tenues ?")).toBeTruthy();
    expect(screen.getByText("Sur la durée")).toBeTruthy();
    fireEvent.press(screen.getByText("Maîtrise"));
    expect(screen.getByText("Maîtrise par discipline")).toBeTruthy();
  });
  test("le bilan ouvre le journal limité aux séances de sa semaine", () => {
    show(<S.Progress />);
    fireEvent.press(screen.getAllByText("Voir les séances de la semaine")[0]);
    const weekStart = new Date(2026, 9, 26).getTime();
    expect(mockNav.navigate).toHaveBeenLastCalledWith("Journal", { weekStart });
    show(<S.Journal {...props({ weekStart })} />);
    expect(screen.getAllByText(/Course à pied/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Natation/)).toBeNull();
    expect(screen.getByText(/2 séances ·/)).toBeTruthy();
    expect(screen.getByText("Voir tout le journal")).toBeTruthy();
  });
  test("Journal, Records, Objectifs, Semaine type", () => {
    show(<S.Journal {...props()} />);
    expect(screen.getAllByText(/Course à pied/).length).toBeGreaterThan(0);
    fireEvent.press(screen.getByText(/Archives/));
    expect(screen.getAllByText(/Marche/).length).toBeGreaterThan(0);
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
    expect(screen.getAllByText("10 km").length).toBeGreaterThan(0);
    // A reward held for review (server migration 20261020000000) is never shown as "+0 XP confirmés".
    require("../src/data/receipts").rememberReceipt("owner-a", logs[0].client_event_id, { log_id: logs[0].id, xp: 0, credits: 0, credits_after: 0, xp_after: 0, level_after: 4, level_bonus: 0, leveled_up: 0, requested_xp: 594, requested_credits: 59, weekly_xp_remaining: 0, weekly_credits_remaining: 0, server_version: "300", reward_held: true, held_xp: 594, held_credits: 59, release_at: new Date(Date.now() + 5 * 3600000).toISOString() });
    show(<S.Result {...props({ eventId: logs[0].client_event_id })} />);
    expect(screen.getByText("Récompense en vérification")).toBeTruthy();
    expect(screen.queryByText(/XP confirmés/)).toBeNull();
    show(<S.Detail {...props({ id: logs[1].id })} />);
    expect(screen.getAllByText(/Squat/).length).toBeGreaterThanOrEqual(2); // exercise + the record it set
    expect(screen.getByText(/Records? établis? ce jour-là/)).toBeTruthy();
    show(<S.Edit {...props({ id: logs[0].id })} />);
    expect(screen.getByText("Enregistrer la correction")).toBeTruthy();
    show(<S.Pending />);
    expect(screen.getByText("Tout est synchronisé")).toBeTruthy();
  });
  test("Aventure sans campagne : une seule invitation, choisir un premier monde", () => {
    mockState.empty = true;
    try {
      show(<S.Adventure />);
      const main = within(screen.getByTestId("adventure-main"));
      expect(main.getByText("Choisis ton premier monde")).toBeTruthy();
      fireEvent.press(main.getByTestId("adventure-main-cta"));
      expect(mockNav.navigate).toHaveBeenLastCalledWith("World", { id: "aube" });
      expect(screen.getByTestId("world-aube")).toBeTruthy();
    } finally {
      mockState.empty = false;
    }
  });
  test("Aventure et monde (chapitre en cours, gardien, région à venir)", () => {
    show(<S.Adventure />);
    // One dominant card first: the chapter in progress, what it asks, what it gives, one action (RPG-131-01).
    const main = within(screen.getByTestId("adventure-main"));
    expect(main.getByText(/La vallée de l’Aube · chapitre 3\/9/)).toBeTruthy();
    expect(main.getByText("Le carnet du passeur")).toBeTruthy();
    expect(main.getByText(/À la clé : un insigne et le titre « Conteur »/)).toBeTruthy();
    // The fixture's chapter has its two active days: the single action is to light the beacon, in the world screen (where the server call lives).
    fireEvent.press(main.getByTestId("adventure-main-cta"));
    expect(mockNav.navigate).toHaveBeenLastCalledWith("World", { id: "aube" });
    // The four worlds stay one tap away, as a compact selector with the same test identifiers.
    for (const id of ["aube", "marees", "forge", "aurores"]) expect(screen.getByTestId(`world-${id}`)).toBeTruthy();
    expect(screen.getAllByText(/La vallée de l’Aube/).length).toBe(3); // chapter card + world tile + collection row
    // A world the snapshot does not confirm says so in the player's words, with no invented unlock condition and no server jargon.
    expect(screen.getAllByText("Disponibilité à confirmer").length).toBe(2);
    expect(screen.queryByText(/auprès du serveur/)).toBeNull();
    expect(screen.getByTestId("world-forge").props.accessibilityLabel).toMatch(/Les forges d’Obsidienne.*Disponibilité à confirmer/);
    expect(screen.getByTestId("world-aube").props.accessibilityLabel).toMatch(/Chapitre 3 sur 9, balise prête à allumer, monde en cours/);
    expect(screen.getByText("2 insignes sur 36")).toBeTruthy();
    show(<S.World {...props({ id: "aube" })} />);
    expect(screen.getByText(/Chapitre 3\/9/)).toBeTruthy();
    expect(screen.getByText("Les ronces du passeur")).toBeTruthy(); // the chapter's narrative obstacle
    fireEvent.press(screen.getByText("Détail des neuf chapitres"));
    expect(screen.getByText("Insigne · Bâtisseur de ponts")).toBeTruthy(); // earned step on the path
    show(<S.World {...props({ id: "marees" })} />);
    expect(screen.getAllByText("La Gardienne des courants").length).toBe(2); // hero + guardian encounter
    expect(screen.getByText("Traverser le courant")).toBeTruthy(); // guardian phase
    expect(screen.getByText("Enregistrer une séance")).toBeTruthy(); // the way forward is a real session
    show(<S.World {...props({ id: "forge" })} />);
    expect(screen.getByText("Disponibilité à confirmer")).toBeTruthy();
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
    for (const C of [S.Settings, S.Sports, S.Account, S.Privacy, S.Help, S.Legal, S.Plus, S.Delete]) show(<C />);
    expect(screen.getByText("Supprimer définitivement ton compte")).toBeTruthy();
  });
  test("Visite guidée : douze étapes facultatives sur les vrais écrans, progression gardée par compte, reprise, relance, passage", async () => {
    nav.navigate.mockClear(); nav.goBack.mockClear();
    const { TOUR_STEPS, loadTour } = require("../src/lib/tour");
    expect(TOUR_STEPS).toHaveLength(12);
    const view = show(<S.Guide navigation={nav} />);
    expect(await screen.findByText("Bienvenue dans TITAN")).toBeTruthy();
    expect(screen.getByText("Étape 1 sur 12")).toBeTruthy();
    fireEvent.press(screen.getByTestId("guide-next"));
    expect(screen.getByText("Tes sports favoris")).toBeTruthy();
    expect(screen.getByTestId("guide-goal-favorites")).toBeTruthy(); // optional mini-goal, ticked from the real preferences
    fireEvent.press(screen.getByTestId("guide-open"));
    expect(nav.navigate).toHaveBeenLastCalledWith("Sports");
    fireEvent.press(screen.getByTestId("guide-next"));
    fireEvent.press(screen.getByTestId("guide-next"));
    expect(screen.getByText("Enregistrer une séance")).toBeTruthy();
    fireEvent.press(screen.getByTestId("guide-open"));
    expect(nav.navigate).toHaveBeenLastCalledWith("Tabs", { screen: "Record" });
    fireEvent.press(screen.getByTestId("guide-next"));
    expect(screen.getByText("Le suivi GPS")).toBeTruthy();
    expect(screen.getByText(/Il ne demande ta position qu’au moment où tu démarres/)).toBeTruthy();
    fireEvent.press(screen.getByTestId("guide-next"));
    expect(screen.getByText("Tes pas")).toBeTruthy();
    expect(screen.getByText("Facultatif")).toBeTruthy();
    fireEvent.press(screen.getByTestId("guide-open"));
    expect(nav.navigate).toHaveBeenLastCalledWith("Steps");
    fireEvent.press(screen.getByTestId("guide-prev"));
    expect(screen.getByText("Le suivi GPS")).toBeTruthy();
    // leaving keeps the step for this account; reopening resumes there
    await waitFor(async () => expect((await loadTour("owner-a")).step).toBe(4));
    view.unmount();
    show(<S.Guide navigation={nav} />);
    expect(await screen.findByText("Le suivi GPS")).toBeTruthy();
    fireEvent.press(screen.getByTestId("guide-restart"));
    expect(screen.getByText("Bienvenue dans TITAN")).toBeTruthy();
    fireEvent.press(screen.getByTestId("guide-skip"));
    expect(nav.goBack).toHaveBeenCalledTimes(1);
    await waitFor(async () => expect((await loadTour("owner-a")).dismissed).toBe(true));
  });
  test("Retour : message vérifié, informations techniques facultatives, e-mail ouvert par l'utilisateur", async () => {
    const { Linking } = require("react-native");
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    show(<S.Feedback />);
    fireEvent.press(screen.getByTestId("feedback-send"));
    await act(async () => {});
    expect(screen.getByText(/au moins 10 caractères/)).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId("feedback-text"), "Le chronomètre s’arrête quand je verrouille l’écran.");
    fireEvent.press(screen.getByTestId("feedback-send"));
    await screen.findByTestId("feedback-opened");
    const url = decodeURIComponent(String(open.mock.calls[0][0]));
    expect(url).toContain("mailto:titanteam.app@gmail.com");
    expect(url).toContain("Problème");
    expect(url).not.toContain("Informations techniques");
    open.mockClear();
    fireEvent.press(screen.getByLabelText("Ajouter des informations techniques"));
    expect(screen.getByText(/Ce qui sera ajouté au message/)).toBeTruthy();
    fireEvent.press(screen.getByTestId("feedback-send"));
    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(decodeURIComponent(String(open.mock.calls[0][0]))).toContain("Informations techniques");
    open.mockRejectedValueOnce(new Error("no mail app"));
    fireEvent.press(screen.getByTestId("feedback-send"));
    await screen.findByTestId("feedback-failed");
    open.mockRestore();
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

describe("discipline-specific native entry", () => {
  test("cycling exposes cadence and watts, and optional fields expand", () => {
    show(<S.Form {...props({ sport: "cycling" })} />);
    expect(screen.getByText("Cadence moyenne")).toBeTruthy();
    expect(screen.getByText("Puissance moyenne")).toBeTruthy();
    fireEvent.press(screen.getByText("Autres mesures (facultatif)"));
    expect(screen.getByText("Puissance maximale")).toBeTruthy();
  });
});

describe("V1.3.1 · unités, confidentialité et coaching", () => {
  test("les kilomètres ne sont jamais un total anonyme entre sports", () => {
    const { kmBySport } = require("../src/screens/progress/ProgressScreen");
    const day = (n: number) => new Date(2026, 10, n, 12).toISOString();
    const rows = [
      { sport: "running", unit: "km", val: 10, date: day(3) },
      { sport: "running", unit: "km", val: "5.5", date: day(4) },
      { sport: "cycling", unit: "km", val: 42, date: day(5) },
      { sport: "swimming", unit: "m", val: 1500, date: day(5) }, // metres are not kilometres
      { sport: "running", unit: "km", val: 8, date: day(20) }, // outside the period
    ];
    const km = kmBySport(rows, new Date(2026, 10, 1).getTime(), new Date(2026, 10, 8).getTime());
    expect(km.map((k: { sport: string; km: number }) => [k.sport, k.km])).toEqual([["cycling", 42], ["running", 15.5]]);
  });
  test("Progrès : une seule discipline en kilomètres garde le libellé simple", () => {
    show(<S.Progress />);
    expect(screen.getAllByText("parcourus").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("km-detail")).toBeNull();
  });
  test("audit : une séance refusée, signalée ou en vérification n’entre ni dans les km par sport ni dans la grille de la semaine", () => {
    const held = ["rejected", "flagged", "pending_review"].map((status, n) => ({ ...logs[0], id: `held-${status}`, client_event_id: `held-${status}`, sport: "cycling", val: 40 + n, status }));
    mockState.logs = [...logs, ...held];
    try {
      show(<S.Progress />);
      expect(screen.queryByTestId("km-detail")).toBeNull();
      expect(screen.queryByText("parcourus, tous sports")).toBeNull();
      expect(screen.queryByLabelText(new RegExp(`${Sports.label("cycling")} :`))).toBeNull();
      expect(screen.getAllByLabelText(new RegExp(`${Sports.label("running")} : 1 séance`)).length).toBeGreaterThan(0);
    } finally {
      mockState.logs = null;
    }
  });
  test("Confidentialité : ce qu’un coach voit et où arrêter le partage", () => {
    show(<S.Privacy />);
    expect(screen.getByText("Suivi par un coach")).toBeTruthy();
    expect(screen.getByText(/ne modifie jamais ton journal/)).toBeTruthy();
    expect(screen.getByText(/Sans invitation acceptée de ta part, aucun coach ne voit rien/)).toBeTruthy();
    expect(screen.getByTestId("privacy-coaching")).toBeTruthy();
  });
  test("Communauté : qui voit mes Moments", () => {
    show(<S.Community />);
    expect(screen.getByText(/Tes Moments ne sont vus que par les amis que tu as acceptés/)).toBeTruthy();
  });
});

describe("V1.3.1 · grand texte et petit écran", () => {
  test.each([[320, 1], [412, 2]])("QG et Aventure gardent leurs accès à %i dp, texte × %i", (width, fontScale) => {
    const dimensions = jest.spyOn(require("react-native"), "useWindowDimensions").mockReturnValue({ width, height: 740, scale: 2, fontScale });
    try {
      show(<S.Home />);
      // The accesses stack instead of squeezing their labels; each keeps its name, its hint and its destination. Since the
      // consolidation of 16 November they lead where the tab bar does not (events, community): Sport, Aventure and Progrès are tabs.
      for (const [name, target] of [["Quêtes et événements", "Events"], ["Ma communauté", "Community"]]) {
        const access = screen.getByRole("button", { name });
        expect(access.props.accessibilityHint).toBeTruthy();
        fireEvent.press(access);
        expect(mockNav.navigate).toHaveBeenLastCalledWith(target);
      }
      expect(screen.getByTestId("qg-progress")).toBeTruthy();
      // No text of the new blocks is clipped to one line.
      expect(screen.getByText("Le carnet du passeur").props.numberOfLines).toBeUndefined();
      show(<S.Adventure />);
      expect(screen.getByTestId("adventure-main-cta")).toBeTruthy();
      for (const id of ["aube", "marees", "forge", "aurores"]) expect(screen.getByTestId(`world-${id}`)).toBeTruthy();
    } finally {
      dimensions.mockRestore();
    }
  });
});

describe("V1.3.1 · import GPX", () => {
  test("un fichier dont la taille n’est pas donnée est mesuré avant d’être lu, et refusé s’il est trop lourd", async () => {
    const picker = require("expo-document-picker");
    const files = require("expo-file-system/legacy");
    const pick = jest.spyOn(picker, "getDocumentAsync").mockResolvedValue({ canceled: false, assets: [{ uri: "file:///cache/DocumentPicker/sortie.gpx", name: "sortie.gpx" }] });
    const info = jest.spyOn(files, "getInfoAsync").mockResolvedValue({ exists: true, size: 20 * 1024 * 1024 });
    const read = jest.spyOn(files, "readAsStringAsync").mockResolvedValue("<gpx/>");
    try {
      show(<S.Form {...props({ sport: "running" })} />);
      await act(async () => { fireEvent.press(screen.getByTestId("gpx-import")); });
      await waitFor(() => expect(screen.getByText("Fichier trop lourd")).toBeTruthy());
      expect(info).toHaveBeenCalledWith("file:///cache/DocumentPicker/sortie.gpx");
      expect(read).not.toHaveBeenCalled();
    } finally {
      pick.mockRestore(); info.mockRestore(); read.mockRestore();
    }
  });
});

describe("V1.3.1 · textes sensibles", () => {
  test("Supprimer mon compte : l’abonnement Google Play n’est pas résilié, dit avant la confirmation", () => {
    show(<S.Delete {...props()} />);
    const warning = within(screen.getByTestId("delete-subscription-warning"));
    expect(warning.getByText("Supprimer ton compte ne résilie pas un abonnement.")).toBeTruthy();
    expect(warning.getByText(/arrête-le d’abord dans tes abonnements Google Play/)).toBeTruthy();
    expect(screen.getByText(/tes parcours GPS et tes pas/)).toBeTruthy();
  });
});

describe("audit · séance GPS en attente", () => {
  test("« Refaire cette séance » du même sport annonce la séance GPS en attente sans la remplacer ; son propre formulaire la reprend", async () => {
    const stored = async () => JSON.parse((await AsyncStorage.getItem(ownerKey("draft", "owner-a")))!);
    await loadDrafts("owner-a");
    await saveDraft("owner-a", { ...freshDraft("running"), distance: "10.02", durM: "52", gpsRouteId: "route-1" }, { release: true });
    try {
      const redo = show(<S.Form {...props({ sport: "running", duplicateOf: logs[0].id })} />);
      expect(screen.getByTestId("pinned-recording")).toBeTruthy();
      expect(screen.getByTestId("distance").props.value).toBe("10");
      await act(async () => { fireEvent.changeText(screen.getByTestId("distance"), "12"); });
      expect(await stored()).toMatchObject({ draft: { gpsRouteId: "route-1", distance: "10.02" } });
      expect(screen.getByTestId("pinned-recording")).toBeTruthy();
      redo.unmount();
      show(<S.Form {...props({ sport: "running" })} />);
      expect(screen.queryByTestId("pinned-recording")).toBeNull();
      expect(screen.getByTestId("distance").props.value).toBe("10.02");
      await act(async () => { fireEvent.changeText(screen.getByTestId("distance"), "10.5"); });
      expect(await stored()).toMatchObject({ draft: { gpsRouteId: "route-1", distance: "10.5" } });
    } finally {
      await act(async () => { await discardDraft("owner-a"); });
    }
  });
});
