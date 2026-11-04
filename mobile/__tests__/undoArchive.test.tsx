/* Reversible actions do not ask "are you sure?": they happen, and "Annuler" in the toast undoes them (V12-17). */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider } from "../src/components/Toast";
import { logs } from "../test-fixtures/data";

const mockUpdate = jest.fn();
const mockConfirmed = { ...logs[1], syncStatus: "confirmed", revision: 3 };
const confirmed = mockConfirmed;
const mockLogs = { logs: [mockConfirmed], archived: [] as unknown[] };
jest.mock("../src/data/hooks", () => ({
  ...jest.requireActual("../src/data/hooks"),
  useLogs: () => mockLogs,
  useUpdateSession: () => ({ mutateAsync: (...a: unknown[]) => mockUpdate(...a), isPending: false }),
}));
jest.mock("../src/lib/network", () => ({ ...jest.requireActual("../src/lib/network"), useOnline: () => true }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a", useAuth: () => ({ owner: "owner-a" }) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SessionDetailScreen } = require("../src/screens/session/SessionDetailScreen");
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const nav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };

test("archiving a session happens at once and can be undone from the toast with the new revision", async () => {
  mockUpdate.mockResolvedValueOnce({ ...confirmed, archived_at: "2026-11-04T10:00:00Z", revision: 4 }).mockResolvedValueOnce({ ...confirmed, revision: 5 });
  render(
    <QueryClientProvider client={new QueryClient()}>
    <SafeAreaProvider initialMetrics={metrics}>
      <ToastProvider>
        <SessionDetailScreen navigation={nav} route={{ key: "k", name: "SessionDetail", params: { id: confirmed.id } }} />
      </ToastProvider>
    </SafeAreaProvider>
    </QueryClientProvider>,
  );
  fireEvent.press(screen.getByRole("button", { name: "Archiver" }));
  await waitFor(() => expect(screen.getByText("Séance archivée")).toBeTruthy());
  // No confirmation dialog: the patch went out immediately, and the screen went back to the journal.
  expect(mockUpdate).toHaveBeenCalledWith({ log: confirmed, patch: { archived: true } });
  expect(nav.goBack).toHaveBeenCalled();
  fireEvent.press(screen.getByTestId("toast-action"));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
  // The undo is built on the row the server returned (revision 4), never on the stale one.
  expect(mockUpdate.mock.calls[1][0]).toEqual({ log: expect.objectContaining({ revision: 4 }), patch: { archived: false } });
  await waitFor(() => expect(screen.getByText("Séance restaurée")).toBeTruthy());
});
