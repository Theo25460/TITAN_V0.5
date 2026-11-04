/* V11-79: the in-app feedback (a problem or an idea) is written here and sent by the user from their own mail app. Nothing is sent by TITAN,
   no ticket is created and nothing is confirmed on the user's behalf: the user reads the message, then sends it. Technical details
   (app, Android and phone model) are added only when the user ticks the box, and they never include the account, the e-mail or any session. */
import { SUPPORT_EMAIL } from "./config";

export type FeedbackKind = "problem" | "idea";
export type TechnicalInfo = { app: string; android: string; device: string };

export const FEEDBACK_MIN = 10;
export const FEEDBACK_MAX = 1500;

export const clean = (text: string) => text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\r\n?/g, "\n").trim();

/** null when the message can be written, otherwise the sentence to show. */
export function problemWith(text: string): string | null {
  const t = clean(text);
  if (t.length < FEEDBACK_MIN) return `Décris ton retour en au moins ${FEEDBACK_MIN} caractères.`;
  if (t.length > FEEDBACK_MAX) return `Ton retour dépasse ${FEEDBACK_MAX} caractères : garde l’essentiel.`;
  return null;
}

export function composeMail(kind: FeedbackKind, text: string, info: TechnicalInfo | null): { to: string; subject: string; body: string; url: string } {
  const subject = kind === "problem" ? "TITAN Android — Problème" : "TITAN Android — Idée";
  const body = [clean(text).slice(0, FEEDBACK_MAX), info ? `\n— Informations techniques (facultatives) —\nApplication : ${info.app}\nAndroid : ${info.android}\nTéléphone : ${info.device}` : ""].join("");
  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { to: SUPPORT_EMAIL, subject, body, url };
}
