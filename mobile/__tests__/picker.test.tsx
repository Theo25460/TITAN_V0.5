import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DateTimePickerAndroid, PickerHost } from "../src/components/Picker";
import { addMonths, allowed, monthGrid, monthReachable, sameDay, withDay, withTime } from "../src/lib/calendar";

const metrics = { frame: { x: 0, y: 0, width: 360, height: 740 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const mount = () => render(<SafeAreaProvider initialMetrics={metrics}><PickerHost /></SafeAreaProvider>);

describe("calendar helpers", () => {
  test("a month starts on the right Monday-first column and pads to whole weeks", () => {
    const weeks = monthGrid(2026, 10); // November 2026 starts on a Sunday
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0]!.slice(0, 6).every((c) => c === null)).toBe(true);
    expect(weeks[0]![6]!.getDate()).toBe(1);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(monthGrid(2026, 1).flat().filter(Boolean)).toHaveLength(28);
    expect(monthGrid(2028, 1).flat().filter(Boolean)).toHaveLength(29);
  });
  test("bounds are whole days: today is allowed by a maximum of now, tomorrow is not", () => {
    const now = new Date(2026, 10, 4, 10, 0);
    expect(allowed(new Date(2026, 10, 4, 23, 59), null, now)).toBe(true);
    expect(allowed(new Date(2026, 10, 5), null, now)).toBe(false);
    expect(allowed(new Date(2026, 9, 1), new Date(2026, 9, 2), null)).toBe(false);
    expect(monthReachable(2026, 11, null, now)).toBe(false);
    expect(monthReachable(2026, 10, null, now)).toBe(true);
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
  });
  test("a picked day keeps the time of day, a picked time keeps the day", () => {
    const v = new Date(2026, 10, 4, 18, 30, 12);
    const d = withDay(v, new Date(2026, 9, 20));
    expect([d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([9, 20, 18, 30]);
    const t = withTime(v, 7, 5);
    expect([t.getDate(), t.getHours(), t.getMinutes(), t.getSeconds()]).toEqual([4, 7, 5, 0]);
    expect(sameDay(v, new Date(2026, 10, 4, 1))).toBe(true);
  });
});

describe("TITAN date and time pickers replace the system dialogs", () => {
  test("date: pick a day in a TITAN sheet, confirm, and the form receives it (same contract as the system picker)", () => {
    mount();
    const onChange = jest.fn();
    act(() => DateTimePickerAndroid.open({ value: new Date(2026, 10, 4, 18, 30), mode: "date", maximumDate: new Date(2026, 10, 4, 23, 0), onChange }));
    expect(screen.getByTestId("picker-month").props.children.join("")).toMatch(/novembre 2026/);
    fireEvent.press(screen.getByTestId("picker-day-2"));
    fireEvent.press(screen.getByTestId("picker-ok"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const [event, date] = onChange.mock.calls[0];
    expect(event).toEqual({ type: "set" });
    expect([date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()]).toEqual([10, 2, 18, 30]);
  });

  test("date: the future is not selectable and the next month is out of reach under a maximum of today", () => {
    mount();
    const onChange = jest.fn();
    act(() => DateTimePickerAndroid.open({ value: new Date(2026, 10, 4), mode: "date", maximumDate: new Date(2026, 10, 4), onChange }));
    expect(screen.getByTestId("picker-day-10").props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId("picker-next").props.accessibilityState?.disabled ?? screen.getByTestId("picker-next").props.disabled).toBeTruthy();
    fireEvent.press(screen.getByTestId("picker-prev"));
    expect(screen.getByTestId("picker-month").props.children.join("")).toMatch(/octobre 2026/);
  });

  test("closing the sheet reports 'dismissed' and never a date", () => {
    mount();
    const onChange = jest.fn();
    act(() => DateTimePickerAndroid.open({ value: new Date(2026, 10, 4), mode: "date", onChange }));
    fireEvent.press(screen.getAllByLabelText("Fermer")[0]!);
    expect(onChange).toHaveBeenCalledWith({ type: "dismissed" }, undefined);
  });

  test("time: tapping a row of each wheel sets hours and minutes, the date is kept", () => {
    mount();
    const onChange = jest.fn();
    act(() => DateTimePickerAndroid.open({ value: new Date(2026, 10, 4, 12, 0), mode: "time", is24Hour: true, onChange }));
    fireEvent.press(screen.getByTestId("wheel-h-7"));
    fireEvent.press(screen.getByTestId("wheel-m-45"));
    fireEvent.press(screen.getByTestId("picker-ok"));
    const date: Date = onChange.mock.calls[0][1];
    expect([date.getDate(), date.getHours(), date.getMinutes()]).toEqual([4, 7, 45]);
  });

  test("without a host nothing hangs: the answer is 'dismissed'", () => {
    const onChange = jest.fn();
    DateTimePickerAndroid.open({ value: new Date(), mode: "time", onChange });
    expect(onChange).toHaveBeenCalledWith({ type: "dismissed" });
  });
});
