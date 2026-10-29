import * as Haptics from "expo-haptics";

let enabled = true;
export function setHapticsEnabled(value: boolean) {
  enabled = value;
}

/** Discreet tactile feedback; failures (no vibrator, disabled by the system) are ignored. */
export function haptic(kind: "light" | "selection" | "success" | "warning" | "error" = "light") {
  if (!enabled) return;
  const run =
    kind === "selection"
      ? Haptics.selectionAsync()
      : kind === "success"
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        : kind === "warning"
          ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
          : kind === "error"
            ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
            : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  run.catch(() => {});
}
