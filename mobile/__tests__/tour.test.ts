import { dismiss, finish, freshTour, goTo, loadTour, progressLabel, restart, saveTour, shouldOffer, TOUR_STEPS } from "../src/lib/tour";

test("twelve steps covering the whole app, each with a title and text, the sensitive ones optional, ends on a concrete first action", () => {
  expect(TOUR_STEPS).toHaveLength(12);
  expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(12);
  for (const s of TOUR_STEPS) {
    expect(s.title.length).toBeGreaterThan(3);
    expect(s.text.length).toBeGreaterThan(40);
  }
  for (const id of ["concept", "sports", "hq", "manual", "gps", "health", "xp", "worlds", "community", "goals", "plans", "first"]) expect(TOUR_STEPS.map((s) => s.id)).toContain(id);
  expect(TOUR_STEPS.filter((s) => s.optional).map((s) => s.id)).toEqual(["health", "plans"]);
  expect(TOUR_STEPS.at(-1)).toMatchObject({ id: "first", action: { target: "record" } });
});

test("the tour never asks for a permission itself: the GPS step says when it will", () => {
  const gps = TOUR_STEPS.find((s) => s.id === "gps")!;
  expect(gps.text).toMatch(/qu’au moment où tu démarres/);
  expect(TOUR_STEPS.every((s) => !/autoriser|accepte la permission/i.test(s.text))).toBe(true);
});

test("progress moves within bounds, resumes, restarts, can be dismissed or finished; the home card offers it until then", () => {
  let s = freshTour();
  expect(shouldOffer(s)).toBe(true);
  expect(progressLabel(s)).toBe("Étape 1 sur 12");
  s = goTo(s, 99);
  expect(s.step).toBe(11);
  s = goTo(s, -4);
  expect(s.step).toBe(0);
  s = goTo(s, 5);
  expect(shouldOffer(s)).toBe(true);
  expect(restart()).toEqual(freshTour());
  expect(shouldOffer(dismiss(s))).toBe(false);
  expect(shouldOffer(finish(s))).toBe(false);
});

test("progress is kept per account and a damaged record falls back to the start", async () => {
  await saveTour("a", goTo(freshTour(), 6));
  await saveTour("b", goTo(freshTour(), 2));
  expect((await loadTour("a")).step).toBe(6);
  expect((await loadTour("b")).step).toBe(2);
  expect((await loadTour("c")).step).toBe(0);
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.setItem("titan.tour.v1:d", JSON.stringify({ v: 9, step: 77 }));
  expect(await loadTour("d")).toEqual(freshTour());
  await AsyncStorage.setItem("titan.tour.v1:e", JSON.stringify({ v: 1, step: 77, done: false, dismissed: false }));
  expect((await loadTour("e")).step).toBe(11);
});
