/* H4: the player's implementation intention (« Quand je rentre du travail, je cours 20 minutes »), kept on the phone, per account.
   Said back in the reminders and on the QG: a habit anchored to a moment of the day is a habit that holds. */
import { ownerKey, readJSON, writeJSON } from "./storage";

const key = (owner: string) => ownerKey("intention", owner);
export const readIntention = async (owner: string) => {
  const v = await readJSON<string | null>(key(owner), null);
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : null;
};
export const writeIntention = (owner: string, text: string | null) => writeJSON(key(owner), text && text.trim() ? text.trim().slice(0, 80) : null);
