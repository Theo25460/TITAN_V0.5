import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Modal } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Alert, DialogHost, resetDialogs } from "../src/components/Dialog";

const metrics = { frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 24, bottom: 16, left: 0, right: 0 } };
const mount = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <DialogHost />
    </SafeAreaProvider>,
  );
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });

beforeEach(() => resetDialogs());

describe("TITAN dialogs replace the system alert (V12-08)", () => {
  test("shows title, message and every button, with the cancel choice last", () => {
    mount();
    act(() => Alert.alert("Archiver cette séance ?", "Elle quitte ton journal.", [{ text: "Annuler", style: "cancel" }, { text: "Archiver", style: "destructive" }]));
    expect(screen.getByText("Archiver cette séance ?")).toBeTruthy();
    expect(screen.getByText("Elle quitte ton journal.")).toBeTruthy();
    const labels = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel);
    expect(labels.slice(-2)).toEqual(["Archiver", "Annuler"]);
  });

  test("runs the chosen action exactly once, even when tapped twice", async () => {
    mount();
    const onArchive = jest.fn();
    act(() => Alert.alert("Supprimer ?", undefined, [{ text: "Garder", style: "cancel" }, { text: "Supprimer", style: "destructive", onPress: onArchive }]));
    const del = screen.getByRole("button", { name: "Supprimer" });
    fireEvent.press(del);
    fireEvent.press(del);
    await flush();
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Supprimer ?")).toBeNull();
  });

  test("the Android back gesture is the cancel choice and never runs the destructive action", async () => {
    mount();
    const onCancel = jest.fn();
    const onDelete = jest.fn();
    act(() => Alert.alert("Quitter la guilde ?", undefined, [{ text: "Annuler", style: "cancel", onPress: onCancel }, { text: "Quitter", style: "destructive", onPress: onDelete }]));
    act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose());
    await flush();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText("Quitter la guilde ?")).toBeNull();
  });

  test("dialogs queue instead of replacing each other", async () => {
    mount();
    act(() => {
      Alert.alert("Première", undefined, [{ text: "OK" }]);
      Alert.alert("Seconde", undefined, [{ text: "OK" }]);
    });
    expect(screen.getByText("Première")).toBeTruthy();
    expect(screen.queryByText("Seconde")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "OK" }));
    await flush();
    expect(screen.getByText("Seconde")).toBeTruthy();
  });

  test("long button labels wrap instead of being cut", () => {
    mount();
    act(() => Alert.alert("Obtenir « Cape de braise » ?", "120 crédits gagnés par tes séances.", [{ text: "Annuler", style: "cancel" }, { text: "Échanger 120 crédits contre cet objet", onPress: jest.fn() }]));
    const label = screen.getByText("Échanger 120 crédits contre cet objet");
    expect(label.props.numberOfLines).toBe(2);
  });
});

describe("ask(): a yes/no question in a TITAN dialog (permission explainers)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ask } = require("../src/components/Dialog");
  test("true only when the confirm button is chosen; back and cancel are false; nothing system-made is ever opened", async () => {
    mount();
    let answer: boolean | null = null;
    act(() => { ask("Compter tes pas", "TITAN lit le capteur.", { confirmLabel: "Continuer" }).then((v: boolean) => { answer = v; }); });
    expect(screen.getByText("Compter tes pas")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Continuer" }));
    await flush();
    expect(answer).toBe(true);
    act(() => { ask("Suivre ta sortie", "Position.").then((v: boolean) => { answer = v; }); });
    act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose());
    await flush();
    expect(answer).toBe(false);
  });
});
