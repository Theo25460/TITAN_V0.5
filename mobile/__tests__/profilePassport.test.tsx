import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ProfileScreen } from "../src/screens/profile/ProfileScreen";

const mockNavigate = jest.fn();
const mockAvatar = jest.fn(async (_value: unknown) => ({}));
const mockWrite = jest.fn(async (_key: string, _value: unknown) => {});
const mockRead = jest.fn(async (_key: string, fallback: unknown) => fallback);
let mockOwner = "owner-a";
let mockAccess: boolean | undefined = true;
const NAME = "Un pseudo très long de trente-cinq caractères";

jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock("../src/components/Screen", () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("../src/components/Sheet", () => ({ Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => visible ? children : null }));
jest.mock("../src/components/Avatar", () => ({ Avatar: () => null }));
jest.mock("../src/components/Crest", () => ({
  RankCrest: ({ size }: { size: number }) => {
    const { View } = require("react-native");
    return <View testID="rank-crest" style={{ width: size, height: size }} />;
  },
  rankIdOf: () => "bronze",
}));
jest.mock("../src/components/Icon", () => ({ Icon: () => null }));
jest.mock("../src/components/JourneyCard", () => ({
  CareerMilestones: ({ owner }: { owner: string }) => {
    const { View } = require("react-native");
    return <View testID="career-milestones" accessibilityLabel={owner} />;
  },
}));
jest.mock("../src/components/Toast", () => ({ useToast: () => jest.fn() }));
jest.mock("../src/lib/motion", () => ({ useReducedMotion: () => true }));
jest.mock("../src/lib/network", () => ({ useOnline: () => true }));
jest.mock("../src/lib/storage", () => ({
  ownerKey: (scope: string, owner: string) => `titan.${scope}.v1:${owner}`,
  readJSON: (key: string, fallback: unknown) => mockRead(key, fallback),
  writeJSON: (key: string, value: unknown) => mockWrite(key, value),
}));
jest.mock("../src/data/auth", () => ({ useAuth: () => ({ owner: mockOwner, email: "test@example.test", signOut: jest.fn() }) }));
jest.mock("../src/data/queue", () => ({ useQueue: () => ({ items: [] }) }));
jest.mock("../src/data/hooks", () => ({
  useProfile: () => ({ data: { id: mockOwner, username: NAME, level: 1, xp: 0 }, refetch: jest.fn() }),
  useAdventure: () => ({ data: { owner: mockOwner, level: 10, xp: 400, next_level_xp: 1000, avatar: "scout" } }),
  useAdventureAction: () => ({ mutateAsync: mockAvatar, isPending: false }),
  useAtelier: () => ({ data: mockAccess === undefined ? undefined : { plus: { active: mockAccess } }, isLoading: false, refetch: jest.fn() }),
  useSocial: () => ({ data: { me: { friend_code: "TN-TEST" } }, refetch: jest.fn() }),
  usePrefs: () => ({ weeklyGoalSessions: 3, cadencePauses: [], favoriteSports: [] }),
  useLogs: () => ({ active: [] }),
}));
jest.mock("../src/core", () => ({
  Codex: { avatars: [{ id: "scout", name: "Éclaireuse", level: 1 }, { id: "warden", name: "Gardien", level: 20 }] },
  EffortRules: { rank: () => ({ name: "Sentinelle" }), levelRequirement: () => 1000 },
  Format: { number: String, hours: (minutes: number) => `${minutes / 60} h`, plural: String },
  Progress: { dna: () => ({ sessions: 12, minutes: 600, topSports: [{ label: "Natation" }] }), cadence: () => ({ lifetimeHeld: 4 }) },
  Sports: { label: String },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockOwner = "owner-a";
  mockAccess = true;
});

test("shows the confirmed rank and three metrics, with two actions to sources and subscription", async () => {
  const view = render(<ProfileScreen />);
  await act(async () => {});
  expect(view.getByText("Niveau 10 · Sentinelle")).toBeTruthy();
  expect(view.getByText("Vers le niveau 11")).toBeTruthy();
  expect(view.getByText(NAME).props.numberOfLines).toBeUndefined();
  expect(view.getByTestId("rank-crest")).toBeTruthy();
  expect(view.getByTestId("profile-metrics").children).toHaveLength(3);
  expect(view.getByTestId("career-milestones").props.accessibilityLabel).toBe("owner-a");
  for (const title of ["Mon identité", "Mon sport", "Connexions & compte", "Aide & préférences"]) {
    expect(view.getByLabelText(title).props.accessibilityState.expanded).toBe(false);
  }
  fireEvent.press(view.getByLabelText("Mon parcours sportif"));
  expect(mockNavigate).toHaveBeenLastCalledWith("Tabs", { screen: "Progress" });
  expect(view.queryByTestId("profile-sources")).toBeNull();
  fireEvent.press(view.getByLabelText("Connexions & compte"));
  fireEvent.press(view.getByTestId("profile-sources"));
  expect(mockNavigate).toHaveBeenLastCalledWith("Sources");
  expect(view.getByText("Accès TITAN+ actif · origine à consulter")).toBeTruthy();
  fireEvent.press(view.getByTestId("profile-subscription"));
  expect(mockNavigate).toHaveBeenLastCalledWith("TitanPlus");
  fireEvent.press(view.getByTestId("profile-web"));
  expect(mockNavigate).toHaveBeenLastCalledWith("WebHub");
});

test("personalisation saves exactly three metrics per owner and keeps locked avatars unavailable", async () => {
  const view = render(<ProfileScreen />);
  await act(async () => {});
  fireEvent.press(view.getByLabelText("Personnaliser"));
  fireEvent.press(view.getByLabelText("Afficher Sport le plus pratiqué en position 1"));
  await waitFor(() => expect(view.getByLabelText("Sport le plus pratiqué : Natation")).toBeTruthy());
  expect(mockWrite).toHaveBeenCalledWith("titan.profile-metrics.v1:owner-a", ["favorite", "time", "weeks"]);
  fireEvent.press(view.getByLabelText("Gardien. Niveau 20 requis"));
  expect(mockAvatar).not.toHaveBeenCalled();
  await act(async () => { fireEvent.press(view.getByLabelText("Éclaireuse. Personnage actuel")); });
  expect(mockAvatar).toHaveBeenCalledWith({ action: "avatar", params: { avatar: "scout" } });
  mockOwner = "owner-b";
  view.rerender(<ProfileScreen />);
  await waitFor(() => expect(view.getByLabelText("Séances : 12")).toBeTruthy());
  expect(view.queryByLabelText("Sport le plus pratiqué : Natation")).toBeNull();
});

test("an unavailable entitlement reads as unverified", async () => {
  mockAccess = undefined;
  const view = render(<ProfileScreen />);
  await act(async () => {});
  fireEvent.press(view.getByLabelText("Connexions & compte"));
  expect(view.getByText("Accès non vérifié · réessayer dans l’offre")).toBeTruthy();
});

test("a late storage read cannot undo the metric just selected", async () => {
  let complete!: (value: unknown) => void;
  mockRead.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const view = render(<ProfileScreen />);
  fireEvent.press(view.getByLabelText("Personnaliser"));
  fireEvent.press(view.getByLabelText("Afficher Sport le plus pratiqué en position 1"));
  await waitFor(() => expect(view.getByLabelText("Sport le plus pratiqué : Natation")).toBeTruthy());
  await act(async () => { complete(["sessions", "time", "weeks"]); });
  expect(view.getByLabelText("Sport le plus pratiqué : Natation")).toBeTruthy();
});

test("a narrow screen at 200% text keeps the full name and rank crest", async () => {
  const dimensions = jest.spyOn(require("react-native"), "useWindowDimensions")
    .mockReturnValue({ width: 320, height: 740, fontScale: 2, scale: 1 });
  try {
    const view = render(<ProfileScreen />);
    await act(async () => {});
    expect(view.getByTestId("rank-crest").props.style.width).toBe(48);
    expect(view.getByText(NAME).props.maxFontSizeMultiplier).toBe(2);
    expect(view.getByText(NAME).props.numberOfLines).toBeUndefined();
    expect(view.getByTestId("profile-metrics").children).toHaveLength(3);
  } finally {
    dimensions.mockRestore();
  }
});
