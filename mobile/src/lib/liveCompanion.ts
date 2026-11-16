/* TITAN LIVE companion delivery on Android. The engine decides *whether* to speak (rules, quiet periods, safety); this
   file only decides *how*: one replaceable notification on the silent "recording" channel when the app is not in the
   foreground, a short French voice line when the athlete chose the audio level, a haptic on rest ends. Never a sound
   notification, never a stack of notifications. */
import * as Notifications from "expo-notifications";
import { AppState } from "react-native";
import type { LiveCue, LiveOut } from "../core/live";
import { haptic } from "./haptics";
import { ACCENT, CHANNELS, ensureChannels } from "./notificationChannels";

const NOTIFICATION_ID = "titan-live";

// expo-speech is optional at runtime: a build without the native module (preview, tests) simply stays silent.
type Speech = { speak(text: string, opts?: Record<string, unknown>): void; stop(): void; isSpeakingAsync(): Promise<boolean> };
let speech: Speech | null | undefined;
function voice(): Speech | null {
  if (speech !== undefined) return speech;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    speech = require("expo-speech") as Speech;
  } catch {
    speech = null;
  }
  return speech;
}

export async function speak(text: string) {
  const s = voice();
  if (!s) return;
  try {
    if (await s.isSpeakingAsync()) return; // never talk over itself
    s.speak(text, { language: "fr-FR", rate: 1, pitch: 1 });
  } catch {
    /* voice unavailable: the screen still shows the cue */
  }
}

export async function notify(title: string, body: string) {
  try {
    await ensureChannels();
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: { title, body, color: ACCENT, data: { url: "titan://seance-live" } },
      trigger: { channelId: CHANNELS.recording.id },
    });
  } catch {
    /* notifications refused: nothing else to do */
  }
}

export function clearLiveNotification() {
  void Notifications.dismissNotificationAsync(NOTIFICATION_ID).catch(() => {});
}

/** Delivers the engine's outputs. Returns the cues that the screen should show (always shown, whatever the level). */
export function deliver(outs: LiveOut[], context: { title: string; level: number }): LiveCue[] {
  const shown: LiveCue[] = [];
  const background = AppState.currentState !== "active";
  for (const o of outs) {
    if (o.type === "cue") {
      shown.push(o.cue);
      if (o.cue.id === "rest_over") haptic("success");
      if (o.cue.channels.includes("notification") && background) void notify(context.title, o.cue.text);
      if (o.cue.channels.includes("audio")) void speak(o.cue.text);
    } else if (o.type === "event" && o.narrate) {
      if (context.level >= 3) void speak(o.event.text);
      if (background && context.level >= 1) void notify(context.title, o.event.text);
    } else if (o.type === "mission_done") {
      haptic("success");
      if (context.level >= 2) void speak(`Mission accomplie : ${o.mission.label}.`);
    }
  }
  return shown;
}
