export type AccessSnapshot = { version: number; plus: boolean; campaigns: { id: string; tier: string }[] };
export type WorldAccess = { state: "open" | "unavailable"; reason?: string };
const access = require("../core/web/adventure-access.js") as { worldAccess: (snapshot: AccessSnapshot | null | undefined, worldId: string) => WorldAccess };
export const worldAccess = access.worldAccess;
