import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SessionEditScreen } from "../src/screens/session/SessionEditScreen";
import type { TrainingLog } from "../src/core/types";
let mockOwner = "owner-a";
let mockOnline = true;
const mockSave = jest.fn();
const mockToast = jest.fn();
let mockLog: TrainingLog;
jest.mock("../src/data/auth", () => ({ useOwner: () => mockOwner }));
jest.mock("../src/data/hooks", () => ({ useLogs: () => ({ logs: [mockLog], archived: [] }), useProfile: () => ({ data: { is_elite: true } }), useUpdateSession: () => ({ mutateAsync: mockSave, isPending: false }) }));
jest.mock("../src/lib/network", () => ({ useOnline: () => mockOnline }));
jest.mock("../src/components/Toast", () => ({ useToast: () => mockToast }));
jest.mock("../src/components/Screen", () => ({ Screen: ({ children, footer }: any) => <>{children}{footer}</> }));
const navigation = { goBack: jest.fn() };
const props = { navigation, route: { params: { id: "hold-log" } } } as any;
beforeEach(() => {
  jest.clearAllMocks();
  mockOwner = "owner-a";
  mockOnline = true;
  mockSave.mockResolvedValue({});
  mockLog = { id: "hold-log", user_id: "owner-a", sport: "bodyweight", val: 0.75, unit: "min", xp: 100, date: "2026-10-21T12:00:00Z", revision: 1, syncStatus: "confirmed", details: { exercises: [{ name: "Gainage", variant: "", kind: "hold", setRows: [{ weight: 0, seconds: 45, rir: null }] }] } };
});
test("edit timed set keeps kind and seconds in the actual correction patch", async () => {
  render(<SessionEditScreen {...props} />);
  expect(screen.getByLabelText("Série 1, secondes").props.value).toBe("45");
  fireEvent.changeText(screen.getByLabelText("Série 1, secondes"), "60");
  fireEvent.press(screen.getByText("Enregistrer la correction"));
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith({ log: mockLog, patch: { exercises: [{ name: "Gainage", variant: "", kind: "hold", setRows: [{ weight: 0, seconds: 60, rir: null }] }] } }));
});
test("clearing a catalog value sends null through the correction RPC", async () => {
  mockLog = { ...mockLog, sport: "cycling", val: 20, unit: "km", details: { extras: { cadence: 80 } } };
  render(<SessionEditScreen {...props} />);
  fireEvent.changeText(screen.getByTestId("metric-cadence"), "");
  fireEvent.press(screen.getByText("Enregistrer la correction"));
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith({ log: mockLog, patch: { extras: { cadence: null } } }));
});
test("audit: a correction is checked like the website's (shared bounds on the final distance and duration) before it is sent", async () => {
  mockLog = { ...mockLog, sport: "running", val: 42.2, unit: "km", details: { duration: 180, val2: 180 } };
  render(<SessionEditScreen {...props} />);
  // A marathon corrected to one minute: the speed is implausible, nothing is sent.
  fireEvent.changeText(screen.getByLabelText("Durée en minutes (facultatif)"), "1");
  fireEvent.press(screen.getByText("Enregistrer la correction"));
  expect(await screen.findByText(/vitesse moyenne semble irréaliste/)).toBeTruthy();
  // The kept duration counts too: a distance corrected beyond the cap is refused with the duration untouched.
  fireEvent.changeText(screen.getByLabelText("Durée en minutes (facultatif)"), "180");
  fireEvent.changeText(screen.getByLabelText("Distance (km)"), "1200");
  fireEvent.press(screen.getByText("Enregistrer la correction"));
  expect(await screen.findByText(/limitée à 1000 km/)).toBeTruthy();
  expect(mockSave).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText("Distance (km)"), "42,4");
  fireEvent.press(screen.getByText("Enregistrer la correction"));
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith({ log: mockLog, patch: { val: 42.4 } }));
});
test("audit: a server refusal of a correction asks to correct the values, not to delete the session", async () => {
  mockSave.mockRejectedValue({ code: "23514", message: "TRAINING_REJECTED" });
  render(<SessionEditScreen {...props} />);
  fireEvent.changeText(screen.getByLabelText("Série 1, secondes"), "60");
  fireEvent.press(screen.getByText("Enregistrer la correction"));
  expect(await screen.findByText(/Corrige-la, puis réessaie/)).toBeTruthy();
  expect(screen.queryByText(/Supprime-la/)).toBeNull();
});
test("offline correction stays blocked", () => {
  mockOnline = false;
  render(<SessionEditScreen {...props} />);
  fireEvent.changeText(screen.getByLabelText("Série 1, secondes"), "60");
  fireEvent.press(screen.getByText("Enregistrer la correction"));
  expect(mockSave).not.toHaveBeenCalled();
});
test("late correction after account change produces no success in the new account", async () => {
  let finish!: () => void;
  mockSave.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  const view = render(<SessionEditScreen {...props} />);
  fireEvent.changeText(screen.getByLabelText("Série 1, secondes"), "60");
  fireEvent.press(screen.getByText("Enregistrer la correction"));
  mockOwner = "owner-b";
  view.rerender(<SessionEditScreen {...props} />);
  await act(async () => finish());
  expect(mockToast).not.toHaveBeenCalled();
  expect(navigation.goBack).not.toHaveBeenCalled();
});
