/* « Partager » (before V2): turns the rendered story card into a 1080 × 1920 PNG on the phone, then either hands it to Android's share
   sheet or writes it into a folder the person picks. Nothing is uploaded by TITAN and no storage or media permission is requested:
   - share: a file in the app cache, offered through expo-sharing (a content:// URI with a temporary read grant, MIME image/png);
   - save: the system folder picker (Storage Access Framework), which grants access to that one folder only.
   Opening the share sheet is not a publication: the result only says the sheet was opened and closed. */
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { RefObject } from "react";
import { captureRef } from "react-native-view-shot";
import { ShareStory } from "../core/shareStory";

export const STORY_MIME = "image/png";
const SAVE_DIR_KEY = "titan.story.saveDir";

export class StoryExportError extends Error {
  constructor(public code: "not_ready" | "capture" | "unavailable" | "save", message: string) {
    super(message);
  }
}

/** Renders the card to a PNG file of exactly 1080 × 1920 in the app cache and returns its file:// URI. */
export async function captureStory(ref: RefObject<unknown>): Promise<string> {
  if (!ref.current) throw new StoryExportError("not_ready", "La carte n’est pas encore prête. Réessaie dans un instant.");
  try {
    return await captureRef(ref as RefObject<never>, { format: "png", quality: 1, width: ShareStory.SIZE.width, height: ShareStory.SIZE.height, result: "tmpfile", fileName: "titan-story" });
  } catch {
    throw new StoryExportError("capture", "L’image n’a pas pu être créée. Réessaie.");
  }
}

/** Opens the Android share sheet with the picture. Resolves when the sheet closes, whatever the person chose there. */
export async function shareStoryFile(uri: string, title: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new StoryExportError("unavailable", "Le partage d’image n’est pas disponible sur cet appareil. Utilise « Enregistrer ».");
  await Sharing.shareAsync(uri, { mimeType: STORY_MIME, dialogTitle: title, UTI: "public.png" });
}

type Store = { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; remove(key: string): Promise<void> };

/** Writes the picture into a folder chosen with the system picker. The folder granted last time is tried first; when it is gone or
    no longer writable the picker opens again. Returns null when the person closes the picker without choosing. */
export async function saveStoryFile(uri: string, fileName: string, store: Store): Promise<string | null> {
  const SAF = FileSystem.StorageAccessFramework;
  if (!SAF) throw new StoryExportError("unavailable", "L’enregistrement n’est pas disponible sur cet appareil. Utilise « Partager » puis l’application de ton choix.");
  const data = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const base = fileName.replace(/\.png$/i, "");
  const write = async (dir: string) => {
    const target = await SAF.createFileAsync(dir, base, STORY_MIME);
    await SAF.writeAsStringAsync(target, data, { encoding: FileSystem.EncodingType.Base64 });
    return target;
  };
  const known = await store.get(SAVE_DIR_KEY).catch(() => null);
  if (known) {
    try {
      return await write(known);
    } catch {
      await store.remove(SAVE_DIR_KEY).catch(() => {});
    }
  }
  const granted = await SAF.requestDirectoryPermissionsAsync(SAF.getUriForDirectoryInRoot("Pictures"));
  if (!granted.granted) return null;
  try {
    const target = await write(granted.directoryUri);
    await store.set(SAVE_DIR_KEY, granted.directoryUri).catch(() => {});
    return target;
  } catch {
    throw new StoryExportError("save", "L’image n’a pas pu être enregistrée dans ce dossier. Choisis-en un autre ou utilise « Partager ».");
  }
}
