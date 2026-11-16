/* AUD-21: capture a rendered card as a 1080×1920 PNG and hand it to Android's share sheet (Instagram, WhatsApp, Snapchat…).
   The picture stays on the phone until the person chooses where it goes; TITAN uploads nothing. */
import * as Sharing from "expo-sharing";
import type { RefObject } from "react";
import { captureRef } from "react-native-view-shot";

export async function shareCardImage(ref: RefObject<unknown>, title = "Partager ma séance"): Promise<void> {
  if (!ref.current) throw new Error("La carte n’est pas encore prête.");
  if (!(await Sharing.isAvailableAsync())) throw new Error("Le partage d’image n’est pas disponible sur cet appareil.");
  const uri = await captureRef(ref, { format: "png", quality: 1, width: 1080, height: 1920, result: "tmpfile" });
  await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: title, UTI: "public.png" });
}
