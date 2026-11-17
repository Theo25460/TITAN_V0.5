/* AUD-30: a spoken split at every kilometre of a GPS outing (« 3 kilomètres, en 16 minutes 40, allure 5 minutes 33 au kilomètre »),
   in French, through the phone's own text-to-speech (no network, nothing recorded). On by default, one tap to mute, remembered on
   this phone. Limit (to check on device): Android may delay JavaScript while the screen is off, so a split can be announced late. */
import * as Speech from "expo-speech";
import { readJSON, writeJSON } from "./storage";

const KEY = "titan.gps.voice.v1";

const spokenDuration = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return [h ? `${h} heure${h > 1 ? "s" : ""}` : "", m ? `${m} minute${m > 1 ? "s" : ""}` : "", !h && r ? `${r}` : ""].filter(Boolean).join(" ");
};

/** The sentence for a crossed kilometre, or null when no new whole kilometre was reached. */
export function splitAnnouncement(prevKm: number, km: number, activeSeconds: number, paceMode: "pace" | "speed"): string | null {
  const whole = Math.floor(km);
  if (whole < 1 || whole <= Math.floor(prevKm)) return null;
  const head = `${whole} kilomètre${whole > 1 ? "s" : ""}, en ${spokenDuration(activeSeconds)}`;
  if (km <= 0 || activeSeconds <= 0) return `${head}.`;
  if (paceMode === "pace") return `${head}, allure ${spokenDuration(activeSeconds / km)} au kilomètre.`;
  return `${head}, ${Math.round((km / activeSeconds) * 3600 * 10) / 10} kilomètres heure de moyenne.`.replace(".", ",").replace(/,$/, ".");
}

export const voiceEnabled = () => readJSON<boolean>(KEY, true);
export const setVoiceEnabled = (on: boolean) => writeJSON(KEY, on);

export function speak(text: string) {
  try {
    Speech.stop();
    Speech.speak(text, { language: "fr-FR", rate: 1.0 });
  } catch {
    // Text-to-speech missing on the phone: the screen still shows everything.
  }
}
