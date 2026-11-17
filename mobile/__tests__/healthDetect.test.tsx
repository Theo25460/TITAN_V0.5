/* AUD-27: Health Connect sessions of the last 48 hours missing from the journal are offered on the QG, without asking any permission. */
import { render, screen } from "@testing-library/react-native";
import { HealthDetectCard, newHealthSessions } from "../src/components/HealthDetectCard";
import type { TrainingLog } from "../src/core/types";
import { _setHealthConnectForTests, createHealthConnect, type SessionCandidate } from "../src/lib/healthConnect";

jest.mock("@react-navigation/native", () => ({ ...jest.requireActual("@react-navigation/native"), useNavigation: () => ({ navigate: jest.fn() }) }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "u1" }));
const mockSources = jest.fn(async () => [{ source: "health_connect", granted: true }]);
jest.mock("../src/data/api", () => ({ sourcesStatus: () => mockSources() }));

const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const run: SessionCandidate = { externalId: "hc-1", sport: "running", startedAt: iso(3 * 3600_000), minutes: 32, title: null };
const old: SessionCandidate = { externalId: "hc-2", sport: "cycling", startedAt: iso(72 * 3600_000), minutes: 60, title: null };
const logged: SessionCandidate = { externalId: "hc-3", sport: "yoga", startedAt: iso(5 * 3600_000), minutes: 20, title: null };
const logs = [{ id: "l1", sport: "yoga", date: iso(5 * 3600_000 - 10 * 60_000) }] as TrainingLog[];

test("keeps only recent sessions the journal does not hold", () => {
  expect(newHealthSessions([run, old, logged], logs, now).map((c) => c.externalId)).toEqual(["hc-1"]);
});

test("the card appears only with the permission already granted", async () => {
  const fake = { ...createHealthConnect(null), availability: async () => "ready" as const, granted: async () => ({ steps: false, exercise: true }), readSessions: async () => [run] };
  _setHealthConnectForTests(fake as never);
  render(<HealthDetectCard logs={[]} />);
  expect(await screen.findByTestId("qg-health-detect")).toBeTruthy();
  _setHealthConnectForTests({ ...fake, granted: async () => ({ steps: false, exercise: false }) } as never);
  const second = render(<HealthDetectCard logs={[]} />);
  await new Promise((r) => setTimeout(r, 20));
  expect(second.queryByTestId("qg-health-detect")).toBeNull();
  _setHealthConnectForTests(null);
});

test("Lot C: the Android permission alone is not TITAN's consent — after « Arrêter » nothing is read", async () => {
  const reads = jest.fn(async () => [run]);
  _setHealthConnectForTests({ ...createHealthConnect(null), availability: async () => "ready" as const, granted: async () => ({ steps: false, exercise: true }), readSessions: reads } as never);
  mockSources.mockResolvedValueOnce([{ source: "health_connect", granted: false }]);
  const view = render(<HealthDetectCard logs={[]} />);
  await new Promise((r) => setTimeout(r, 20));
  expect(view.queryByTestId("qg-health-detect")).toBeNull();
  expect(reads).not.toHaveBeenCalled();
  _setHealthConnectForTests(null);
});

test("Lot C: a treadmill session already typed as a run is not offered again", () => {
  const treadmill: SessionCandidate = { externalId: "hc-9", sport: "treadmill", startedAt: iso(2 * 3600_000), minutes: 40, title: null };
  const typed = [{ id: "t", sport: "running", unit: "km", val: 7, date: iso(2 * 3600_000 - 5 * 60_000), details: { duration: 40 } }] as unknown as TrainingLog[];
  expect(newHealthSessions([treadmill], typed, now)).toEqual([]);
});
