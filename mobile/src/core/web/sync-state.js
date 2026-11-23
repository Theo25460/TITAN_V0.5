/* V1.6.1 — Sync state of one session: the same words in the website journal and in the Android app (copied unchanged by
   mobile/scripts/sync-web-core.mjs). Pure. It reads only what a client really holds — the confirmed server row, and this device's
   durable queue item (status, attempts, last attempt, reason) — and says which state the session is in and which EXISTING action
   recovers it. It never claims a server state it has not received:
   - « Sur cet appareil »            stored durably here, not sent yet (or discovery mode, which never leaves the device);
   - « En attente d’envoi »          sent at least once, the last attempt failed for a temporary reason; it leaves again by itself;
   - « Confirmée dans ton compte »   the server returned its receipt: the same entry exists on every device of the account;
   - « Refusée : à corriger »        the server refused it for good; the entry stays here, with its fields, until corrected or removed. */
(function (root) {
  "use strict";
  const F = () => root.TitanFormat || (typeof require === "function" ? require("./format.js") : null);

  const STATES = {
    local: { label: "Sur cet appareil", short: "Sur cet appareil", tone: "muted", text: "Mode découverte : cette séance est enregistrée seulement sur cet appareil. Crée ton compte pour la retrouver ailleurs." },
    stored: { label: "Sur cet appareil", short: "Sur cet appareil", tone: "warn", text: "Enregistrée sur cet appareil, pas encore envoyée à ton compte. Elle part dès que la connexion le permet." },
    sending: { label: "Envoi en cours", short: "Envoi…", tone: "warn", text: "Envoi vers ton compte en cours. Elle reste enregistrée sur cet appareil jusqu’à la confirmation." },
    pending: { label: "En attente d’envoi", short: "En attente", tone: "warn", text: "Enregistrée sur cet appareil. Le dernier envoi n’a pas abouti : elle repart automatiquement au retour du réseau." },
    confirmed: { label: "Confirmée dans ton compte", short: "Confirmée", tone: "ok", text: "Le serveur l’a enregistrée : tu retrouves cette même séance sur le site et sur tes autres appareils." },
    refused: { label: "Refusée : à corriger", short: "À corriger", tone: "err", text: "Le serveur ne l’a pas acceptée. Ta saisie reste conservée sur cet appareil." },
  };

  /** The recovery actions each client already has; the label is shared, the client wires its own existing flow. */
  const ACTIONS = {
    send: "Envoyer maintenant",
    correct: "Corriger et renvoyer",
    discard: "Retirer de cet appareil",
    export: "Exporter une copie",
  };

  /* Why a refused session was refused decides how it is recovered (server: titan_submit_training_session). */
  const REFUSAL = {
    validation: { text: "Le serveur a refusé une valeur de cette séance. Ta saisie est conservée : corrige-la, la séance corrigée remplace celle-ci sans créer de doublon.", actions: ["correct", "discard"] },
    conflict: { text: "Une autre version de cette séance est déjà dans ton compte. Vérifie ton journal : si elle y figure, retire celle-ci de cet appareil.", actions: ["discard"] },
    account: { text: "Ce compte n’a pas pu enregistrer la séance. Reconnecte-toi puis renvoie-la : elle reste conservée ici.", actions: ["send", "discard"] },
  };

  /** "validation" | "conflict" | "account" for a refusal; "temporary" otherwise. `code` is the server code the client kept. */
  function reasonKind(code, refused = true) {
    const c = String(code || "");
    if (!refused) return "temporary";
    if (/EVENT_CONTENT_CONFLICT|23505/.test(c)) return "conflict";
    if (/42501|AUTH_REQUIRED|PROFILE_UNAVAILABLE|ACCOUNT_/.test(c)) return "account";
    return "validation";
  }

  const eventOf = (log, item) => String(item?.payload?.details?.client_event_id || log?.client_event_id || log?.details?.client_event_id || "");

  /** One of: local, stored, sending, pending, confirmed, refused. The device queue is the truth until the server receipt arrives. */
  function stateOf({ log = null, item = null, sending = false, guest = false } = {}) {
    if (log?.syncStatus === "confirmed") return "confirmed";
    if (item) {
      if (item.status === "error" && !item.deferred) return "refused";
      if (sending) return "sending";
      return Number(item.attempts) > 0 || item.lastAttemptAt || item.reason || item.deferred ? "pending" : "stored";
    }
    const s = log?.syncStatus;
    if (guest || s === "local") return "local";
    if (s === "error") return "refused";
    if (s === "pending" || s === "sending") return "stored";
    return "confirmed";
  }

  const when = (iso, now) => {
    const f = F();
    const d = new Date(iso);
    if (!iso || Number.isNaN(d.getTime()) || !f) return null;
    return `${f.relativeDay(d, new Date(now))} à ${f.time(d)}`;
  };

  /** What the journal and the session sheet show: { state, label, short, tone, text, kind, facts: [{ label, value }], actions }. */
  function describe({ log = null, item = null, sending = false, guest = false, online = true, now = Date.now() } = {}) {
    const state = stateOf({ log, item, sending, guest });
    const base = STATES[state];
    const refused = state === "refused";
    const kind = item?.deferred ? "deferred" : reasonKind(item?.code || log?.syncCode, refused);
    let text = base.text;
    let actions = [];
    if (state === "stored" || state === "pending") actions = ["send"];
    if (kind === "deferred") {
      text = "Séance de plus de 30 jours : le serveur ne l’accepte pas encore. Elle reste ici et repart automatiquement ; tu peux en exporter une copie.";
      actions = ["export"];
    }
    if (refused) ({ text, actions } = REFUSAL[kind] || REFUSAL.validation);
    const facts = [];
    const queuedAt = when(item?.queuedAt, now);
    if (queuedAt && state !== "confirmed") facts.push({ label: "Enregistrée sur cet appareil", value: queuedAt });
    const attempts = Number(item?.attempts) || 0;
    const last = when(item?.lastAttemptAt, now);
    if (last && state !== "confirmed") facts.push({ label: "Dernière tentative", value: attempts > 1 ? `${last} (${attempts} essais)` : last });
    if (item?.reason && state !== "confirmed") facts.push({ label: refused ? "Motif du refus" : "Motif", value: String(item.reason) });
    if (state === "confirmed" && !guest) {
      const r = log?.details?.serverReward;
      const receipt = r && typeof r === "object" ? r : {};
      const xp = Number(receipt.xp ?? log?.xp) || 0;
      facts.push({ label: "Reçu du serveur", value: log?.details?.historical ? "séance historique, sans XP" : receipt.reward_held ? "récompense en vérification" : `+${xp} XP` });
    }
    const ref = eventOf(log, item);
    if (ref && state !== "local") facts.push({ label: "Référence", value: ref.slice(0, 8) });
    if (!online && actions.includes("send") && state !== "refused") text += " Hors ligne pour l’instant.";
    return { state, label: base.label, short: base.short, tone: base.tone, text, kind, facts, actions: actions.map((id) => ({ id, label: ACTIONS[id] })) };
  }

  /** A corrected session replaces a refused one only: never a session that may be on its way to the server. */
  const replaceable = (item) => !!item && item.status === "error" && !item.deferred;

  const api = { STATES, ACTIONS, REFUSAL, reasonKind, stateOf, describe, replaceable, eventOf };
  root.TitanSyncState = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
