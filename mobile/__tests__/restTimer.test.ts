import { adjustRest, restDone, restLabel, restLeft, startRest } from "../src/lib/restTimer";

test("rest timer counts down, finishes and formats", () => {
  const r = startRest(1000, 90);
  expect(restLeft(r, 1000)).toBe(90);
  expect(restLeft(r, 1000 + 30_001)).toBe(60);
  expect(restDone(r, 1000 + 89_999)).toBe(false);
  expect(restDone(r, 1000 + 90_000)).toBe(true);
  expect(restLeft(r, 1000 + 200_000)).toBe(0);
  expect(restLabel(75)).toBe("1:15");
  expect(restLabel(5)).toBe("0:05");
});
test("rest duration is bounded and adjustable", () => {
  expect(startRest(0, 5)?.total).toBe(10);
  expect(startRest(0, 5000)?.total).toBe(600);
  expect(startRest(0, NaN)?.total).toBe(90);
  const r = startRest(0, 60);
  expect(restLeft(adjustRest(r, 10_000, 30), 10_000)).toBe(80);
  expect(adjustRest(r, 10_000, -100)).toBeNull();
  expect(adjustRest(null, 0, 15)).toBeNull();
});
