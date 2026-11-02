/* Writes an export to the app cache and opens the Android share sheet (save to Files, Drive, e-mail…). */
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

export async function shareTextFile(name: string, contents: string, mimeType: string) {
  if (!FileSystem.cacheDirectory) throw new Error("Stockage indisponible.");
  const uri = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.writeAsStringAsync(uri, contents, { encoding: FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) throw new Error("Le partage de fichiers n’est pas disponible sur cet appareil.");
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: name });
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\n");
