import { useCallback, useEffect, useRef, useState } from "react";
import { Alert as NativeAlert, AccessibilityInfo, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useReducedMotion } from "../lib/motion";
import { colors, radius, space } from "../theme/tokens";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { T } from "./Text";

/* TITAN dialogs (V12-08). One drop-in replacement for the system alert so every confirmation looks and behaves like TITAN:
   dark card, cyan primary action, red only for what is really destructive, 48 dp buttons that wrap on large fonts, the Android back
   gesture and a tap outside both mean "cancel". The signature is the one of Alert.alert on purpose: `Alert.alert(title, message, buttons)`.
   Dialogs queue instead of replacing each other; a button runs once even if it is tapped twice. */

export type DialogButton = { text: string; style?: "default" | "cancel" | "destructive"; onPress?: () => unknown };
type Entry = { id: number; title: string; message?: string; buttons: DialogButton[] };

let counter = 0;
let queue: Entry[] = [];
let listener: ((current: Entry | null) => void) | null = null;
let hosted = 0;

const emit = () => listener?.(queue[0] ?? null);

/** The dialog API: same shape as the system Alert so call sites can be migrated mechanically. */
export const Alert = {
  alert(title: string, message?: string, buttons?: DialogButton[]) {
    const list = buttons?.length ? buttons : [{ text: "OK", style: "default" as const }];
    // No host mounted (very early start, isolated tests): never lose a confirmation, fall back to the system dialog.
    if (!hosted) {
      NativeAlert.alert(title, message, list as Parameters<typeof NativeAlert.alert>[2]);
      return;
    }
    queue.push({ id: ++counter, title, message, buttons: list });
    if (queue.length === 1) emit();
  },
};

/** Test helper: forget every pending dialog. */
export function resetDialogs() {
  queue = [];
  emit();
}

function settle(id: number) {
  if (queue[0]?.id !== id) return false;
  queue = queue.slice(1);
  emit();
  return true;
}

/** Mount once near the root (inside the safe area provider). */
export function DialogHost() {
  const [current, setCurrent] = useState<Entry | null>(queue[0] ?? null);
  useEffect(() => {
    hosted += 1;
    listener = setCurrent;
    setCurrent(queue[0] ?? null);
    return () => {
      hosted -= 1;
      if (listener === setCurrent) listener = null;
    };
  }, []);
  return current ? <DialogView key={current.id} entry={current} /> : null;
}

function DialogView({ entry }: { entry: Entry }) {
  const reduced = useReducedMotion();
  const done = useRef(false);
  const cancel = entry.buttons.find((b) => b.style === "cancel");
  const destructive = entry.buttons.some((b) => b.style === "destructive");
  // Actions first (in the given order), the cancel choice last: the safe way out is always the same place.
  const ordered = [...entry.buttons.filter((b) => b.style !== "cancel"), ...(cancel ? [cancel] : [])];

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility([entry.title, entry.message].filter(Boolean).join(". "));
  }, [entry.message, entry.title]);

  const choose = useCallback(
    (button?: DialogButton) => {
      if (done.current) return;
      done.current = true;
      settle(entry.id);
      // The handler runs after the dialog left, so a handler that opens another dialog or navigates never races with this one.
      if (button?.onPress) setTimeout(() => void Promise.resolve(button.onPress!()).catch(() => {}), 0);
    },
    [entry.id],
  );

  // Back gesture and tap outside: the cancel choice when there is one, otherwise simply close (a lone "OK" is a notice).
  const dismiss = useCallback(() => choose(cancel ?? (entry.buttons.length === 1 ? entry.buttons[0] : undefined)), [cancel, choose, entry.buttons]);

  return (
    <Modal visible transparent animationType={reduced ? "none" : "fade"} onRequestClose={dismiss} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.wrap} testID="titan-dialog">
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Fermer" accessibilityRole="button">
          <View style={styles.scrim} />
        </Pressable>
        <View style={[styles.card, destructive && styles.cardDanger]} accessibilityViewIsModal accessibilityRole="alert">
          <View style={[styles.badge, destructive && { backgroundColor: colors.errSoft }]}>
            <Icon name={destructive ? "alert" : "info"} size={22} color={destructive ? colors.err : colors.cy} />
          </View>
          <T variant="h3" center>
            {entry.title}
          </T>
          {entry.message ? (
            <ScrollView style={styles.body} contentContainerStyle={{ paddingVertical: 2 }}>
              <T variant="small" center>
                {entry.message}
              </T>
            </ScrollView>
          ) : null}
          <View style={styles.actions}>
            {ordered.map((b, i) => {
              const kind = b.style === "cancel" ? (ordered.length === 1 ? "primary" : "ghost") : b.style === "destructive" ? "danger" : i === 0 ? "primary" : "secondary";
              return (
                <Button
                  key={`${b.text}-${i}`}
                  label={b.text}
                  kind={kind}
                  onPress={() => choose(b)}
                  testID={`dialog-${b.style ?? "default"}-${i}`}
                />
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.s5, paddingVertical: space.s6 },
  scrim: { flex: 1, backgroundColor: colors.scrim },
  card: { width: "100%", maxWidth: 420, maxHeight: "92%", gap: space.s3, padding: space.s5, borderRadius: radius.r3, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line2, elevation: 12 },
  cardDanger: { borderColor: "rgba(242,102,95,0.4)" },
  badge: { alignSelf: "center", width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.cySoft },
  body: { flexGrow: 0 },
  actions: { gap: space.s2, marginTop: space.s2 },
});
