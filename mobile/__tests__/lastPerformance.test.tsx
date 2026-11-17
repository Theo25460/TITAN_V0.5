/* AUD-16: « la dernière fois » for each exercise — read from the local journal, matched whatever the case or accents, and reusable
   as the starting sets in one tap. Nothing is estimated (no 1RM). */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { exerciseKey, lastPerformance, type ExerciseDraft } from "../src/core/session";
import type { TrainingLog } from "../src/core/types";
import { ExerciseEditor } from "../src/screens/session/ExerciseEditor";
import { logs } from "../test-fixtures/data";

jest.mock("../src/lib/haptics", () => ({ haptic: jest.fn() }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } };

test("finds the latest session of the exercise, case and accents aside", () => {
  expect(exerciseKey("  Développé   Couché ")).toBe("developpe couche");
  const last = lastPerformance(logs, "squat")!;
  expect(last.summary).toBe("2 séries · 100 kg × 5");
  expect(last.sets.map((s) => [s.weight, s.reps])).toEqual([["100", "5"], ["100", "5"]]);
  expect(lastPerformance(logs, "Tractions")).toBeNull();
  expect(lastPerformance(logs, "   ")).toBeNull();
});

test("the newest session wins and a hold is summarised in seconds", () => {
  const older = logs[1];
  const newer: TrainingLog = { ...older, id: "new", date: new Date().toISOString(), details: { ...older.details, exercises: [{ name: "SQUAT", kind: "weighted", setRows: [{ weight: 110, reps: 3, rir: null }] }] } } as TrainingLog;
  expect(lastPerformance([newer, older], "Squat")!.summary).toBe("1 série · 110 kg × 3");
  const plank: TrainingLog = { ...older, id: "p", details: { exercises: [{ name: "Gainage", kind: "hold", setRows: [{ weight: 0, seconds: 45, rir: null }, { weight: 0, seconds: 60, rir: null }] }] } } as TrainingLog;
  expect(lastPerformance([plank], "gainage")!.summary).toBe("2 × 60 s");
});

function Harness() {
  const [ex, setEx] = useState<ExerciseDraft[]>([{ name: "Squat", variant: "", kind: "weighted", sets: [{ weight: "", reps: "", rir: "", seconds: "" }] }]);
  return <SafeAreaProvider initialMetrics={metrics}><ExerciseEditor exercises={ex} onChange={setEx} bodyweight={false} lastFor={(n) => lastPerformance(logs, n)} /></SafeAreaProvider>;
}

test("the editor shows the last time and « Reprendre » fills the sets", () => {
  render(<Harness />);
  expect(screen.getByText("2 séries · 100 kg × 5")).toBeTruthy();
  fireEvent.press(screen.getByTestId("exercise-0-reuse"));
  expect(screen.getByTestId("exercise-0-set-1-weight").props.value).toBe("100");
  expect(screen.getByTestId("exercise-0-set-1-reps").props.value).toBe("5");
});
