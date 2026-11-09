/* Writes an export to the app cache and opens the Android share sheet (save to Files, Drive, e-mail…). */
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { randomUUID } from "expo-crypto";

const EXPORT_TTL = 24 * 60 * 60 * 1000;

async function pruneExports(root: string, before: number) {
  const names = await FileSystem.readDirectoryAsync(root).catch(() => []);
  const expired = names.filter(name => /^\d{13}-[0-9a-f-]{36}$/i.test(name) && Number(name.slice(0, 13)) < before);
  await Promise.allSettled(expired.map(name => FileSystem.deleteAsync(root + name, { idempotent: true })));
}

export async function shareTextFile(name: string, contents: string, mimeType: string) {
  if (!FileSystem.cacheDirectory) throw new Error("Stockage indisponible.");
  if (!name || name === "." || name === ".." || /[/\\%?#\x00-\x1f]/.test(name)) throw new Error("Nom de fichier invalide.");
  if (!(await Sharing.isAvailableAsync())) throw new Error("Le partage de fichiers n’est pas disponible sur cet appareil.");
  const root = `${FileSystem.cacheDirectory}titan-exports/`;
  const now = Date.now();
  await pruneExports(root, now - EXPORT_TTL);
  const directory = `${root}${now}-${randomUUID()}/`;
  const uri = directory + name;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  try {
    await FileSystem.writeAsStringAsync(uri, contents, { encoding: FileSystem.EncodingType.UTF8 });
  } catch (error) {
    await FileSystem.deleteAsync(directory, { idempotent: true }).catch(() => {});
    throw error;
  }
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: name });
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\n");
