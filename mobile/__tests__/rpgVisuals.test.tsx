import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { RANK_IDS, RankCrest, rankIdOf, BeaconEmblem } from "../src/components/Crest";
import { emberPlan } from "../src/components/Embers";
import { ProgressReveal, revealPlan, type RevealInput } from "../src/components/ProgressReveal";

let mockReduced = false;
jest.mock("../src/lib/motion", () => ({ useReducedMotion: () => mockReduced, reducedMotion: () => mockReduced }));

const base: RevealInput = { xp: 641, credits: 64, level: 7, levelXp: 1850, need: 6275, leveledUp: false, record: null };

describe("RPG heraldry", () => {
  test("the rank ladder maps levels to crests, from Éclaireur to Légende", () => {
    expect([1, 2, 3, 6, 10, 15, 25, 40, 99].map(rankIdOf)).toEqual(["eclaireur", "eclaireur", "explorateur", "sentinelle", "gardien", "champion", "titan", "legende", "legende"]);
    expect(RANK_IDS).toHaveLength(7);
  });
  test("every rank has a crest, named for screen readers, and the beacon can be lit or out", () => {
    for (const id of RANK_IDS) {
      const { unmount } = render(<RankCrest rank={id} size={96} />);
      expect(screen.getByLabelText(/^Blason /)).toBeTruthy();
      unmount();
    }
    render(<BeaconEmblem lit />);
    expect(screen.getByLabelText("Balise allumée")).toBeTruthy();
  });
  test("embers are deterministic for a seed (same burst, stable tests) and stay in range", () => {
    const a = emberPlan(20, 5, ["#fff"]);
    expect(emberPlan(20, 5, ["#fff"])).toEqual(a);
    expect(emberPlan(20, 6, ["#fff"])).not.toEqual(a);
    expect(a.every((e) => e.rise > 0 && e.duration >= 1100 && e.size >= 2)).toBe(true);
  });
});

describe("La révélation de progression", () => {
  beforeEach(() => { mockReduced = false; jest.useFakeTimers(); });
  afterEach(() => jest.useRealTimers());

  test("the plan comes from the receipt alone: where the ring starts, where it ends, whether it waits for a tap", () => {
    const p = revealPlan(base);
    expect(p.from).toBeCloseTo(1209 / 6275, 3);
    expect(p.to).toBeCloseTo(1850 / 6275, 3);
    expect(p.holds).toBe(false);
    expect(p.autoCloseMs).toBeGreaterThan(2000);
    const up = revealPlan({ ...base, level: 8, levelXp: 240, leveledUp: true });
    expect(up).toMatchObject({ from: 0, to: 1, holds: true, autoCloseMs: null, rank: "sentinelle" });
    expect(revealPlan({ ...base, level: 6, leveledUp: true }).newRank).toBe(true); // 5 → 6 crosses into Sentinelle
    expect(revealPlan({ ...base, level: 8, leveledUp: true }).newRank).toBe(false);
  });

  test("an ordinary gain shows the XP and closes by itself; a tap skips it", () => {
    const onDone = jest.fn();
    render(<ProgressReveal input={base} onDone={onDone} />);
    expect(screen.getByTestId("progress-reveal")).toBeTruthy();
    expect(screen.getByLabelText("641 XP")).toBeTruthy();
    expect(screen.getByText(/\+64 crédits/)).toBeTruthy();
    act(() => { jest.advanceTimersByTime(3300); });
    act(() => { jest.advanceTimersByTime(400); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test("a level-up holds until the player taps Continuer, and names the new level and rank", () => {
    const onDone = jest.fn();
    render(<ProgressReveal input={{ ...base, level: 8, levelXp: 240, leveledUp: true, record: "Plus longue distance 15 km" }} onDone={onDone} />);
    act(() => { jest.advanceTimersByTime(6000); });
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText("Niveau 8")).toBeTruthy();
    expect(screen.getByText(/Record battu · Plus longue distance 15 km/)).toBeTruthy();
    fireEvent.press(screen.getByTestId("reveal-continue"));
    act(() => { jest.advanceTimersByTime(400); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test("with reduced motion there is no cinematic and nothing blocks the screen behind", () => {
    mockReduced = true;
    const onDone = jest.fn();
    render(<ProgressReveal input={base} onDone={onDone} />);
    expect(screen.queryByTestId("progress-reveal")).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
