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
