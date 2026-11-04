import { fireEvent, render, screen } from "@testing-library/react-native";
import { SinceCard } from "../src/components/SinceCard";
import type { TrainingLog } from "../src/core/types";
import { MIN_AWAY_MS, sinceLastVisit } from "../src/lib/visit";

jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));

const NOW = Date.parse("2026-11-04T10:00:00Z");
const log = (over: Partial<TrainingLog>): TrainingLog => ({ id: "l", sport: "running", val: 5, unit: "km", xp: 120, date: "2026-11-03T18:00:00Z", created_at: "2026-11-03T18:05:00Z", details: { duration: 30 }, syncStatus: "confirmed", ...over }) as TrainingLog;

describe("Depuis ta dernière visite (V12-38)", () => {
  test("counts only confirmed, unarchived sessions created after the last visit", () => {
    const since = NOW - 2 * 86_400_000;
    const r = sinceLastVisit([log({ id: "a" }), log({ id: "b", xp: 80 }), log({ id: "old", created_at: "2026-10-01T10:00:00Z", date: "2026-10-01T10:00:00Z" }), log({ id: "wait", syncStatus: "pending" }), log({ id: "arch", archived_at: "2026-11-04T08:00:00Z" })], since, NOW)!;
    expect(r).toEqual({ sessions: 2, xp: 200, minutes: 60, away: "2 jours" });
  });

  test("says nothing after a short break, on a first visit, or when nothing happened: never a negative or a missed day", () => {
    expect(sinceLastVisit([log({})], NOW - MIN_AWAY_MS + 60_000, NOW)).toBeNull();
    expect(sinceLastVisit([log({})], null, NOW)).toBeNull();
    expect(sinceLastVisit([], NOW - 3 * 86_400_000, NOW)).toBeNull();
    expect(sinceLastVisit([log({})], NOW - 86_400_000 * 1.2, NOW)?.away).toBe("hier");
  });

  test("the card is compact, readable by TalkBack and can be closed (which stamps the visit)", () => {
    jest.useFakeTimers({ now: NOW });
    const onClose = jest.fn();
    render(<SinceCard logs={[log({})]} since={NOW - 2 * 86_400_000} onClose={onClose} />);
    expect(screen.getByText(/1 séance enregistrée · 30 min · \+120 XP/)).toBeTruthy();
    fireEvent.press(screen.getByTestId("since-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("since-card")).toBeNull();
    jest.useRealTimers();
  });

  test("nothing is shown while the last visit is still unknown", () => {
    render(<SinceCard logs={[log({})]} since={undefined} onClose={jest.fn()} />);
    expect(screen.queryByTestId("since-card")).toBeNull();
  });
});
