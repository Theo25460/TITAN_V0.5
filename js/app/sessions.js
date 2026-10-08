/* TITAN 300 — operations on recorded sessions (find, correct, archive, restore, duplicate).
   Accounts go through the titan_update_training_session RPC (revision check, server-side validation);
   discovery sessions are rewritten in the device store. Corrections never change rewards already given. */
(function () {
  "use strict";
  const idOf = (l) => String(l?.client_event_id || l?.details?.client_event_id || l?.id || "");
  const all = () => [...(window.state?.history || []), ...(window.state?.archivedHistory || [])];
  const isGuest = () => String(window.state?.user?.id || "").startsWith("guest_");

  function find(id) {
    const key = String(id || "");
    return all().find((l) => idOf(l) === key || String(l.id) === key) || null;
  }

  /** Source links can address sessions older than the bounded device history. No cache write. */
  async function resolve(id) {
    const owner = window.state?.user?.id;
    const local = find(id);
    if (local && (!local.user_id || local.user_id === owner)) return local;
    if (!owner || isGuest() || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(id))) return null;
    if (!navigator.onLine || !window.titanClient) throw new Error("Hors ligne : ouvre cette séance une fois la connexion revenue.");
    const { data, error } = await window.titanClient.from("training_logs").select("*").eq("id", id).eq("user_id", owner).maybeSingle();
    if (window.state?.user?.id !== owner) return null;
    if (error) throw new Error("La séance n’a pas répondu. Réessaie dans un instant.");
    if (!data || data.user_id !== owner || data.id !== id) return null;
    return { ...data, cat: data.category || data.cat, syncStatus: "confirmed" };
  }

  function place(row) {
    const key = idOf(row);
    window.state.history = (window.state.history || []).filter((l) => idOf(l) !== key && l.id !== row.id);
    window.state.archivedHistory = (window.state.archivedHistory || []).filter((l) => idOf(l) !== key && l.id !== row.id);
    (row.archived_at ? window.state.archivedHistory : window.state.history).push(row);
  }

  function summarizeExercises(exercises) {
    return exercises.map((ex) => {
      const rows = ex.setRows.map((s) => ({ weight: Number(s.weight) || 0, reps: Math.max(1, Math.round(Number(s.reps) || 1)), rir: s.rir === null || s.rir === "" || s.rir === undefined ? null : Number(s.rir) }));
      return {
        ...ex,
        setRows: rows,
        sets: rows.length,
        totalReps: rows.reduce((n, s) => n + s.reps, 0),
        volume: rows.reduce((n, s) => n + s.weight * s.reps, 0),
        weight: Math.max(0, ...rows.map((s) => s.weight)),
      };
    });
  }

  function applyLocally(log, patch) {
    const row = { ...log, revision: (log.revision || 1) + 1, syncStatus: "local", details: { ...(log.details || {}) } };
    if ("val" in patch) {
      row.val = patch.val;
      row.details.val1 = patch.val;
    }
    if ("date" in patch) {
      row.date = patch.date;
      row.details.performedAt = patch.date;
    }
    if ("note" in patch) row.details.note = patch.note;
    if ("exercises" in patch) {
      row.details.exercises = summarizeExercises(patch.exercises);
      const volume = row.details.exercises.reduce((n, ex) => n + ex.volume, 0);
      row.val = volume || row.details.exercises.reduce((n, ex) => n + ex.totalReps, 0);
      row.unit = volume ? "kg" : "reps";
      row.details.unitOverride = row.unit;
      row.details.val1 = row.val;
    }
    if ("extras" in patch) row.details.extras = { ...(row.details.extras || {}), ...patch.extras };
    if ("duration" in patch) {
      row.details.duration = patch.duration;
      row.details.val2 = patch.duration;
      if (patch.duration === null && row.details.gpxStats) {
        row.details.gpxStats = { ...row.details.gpxStats };
        delete row.details.gpxStats.movingMinutes;
      }
    }
    if ("archived" in patch) row.archived_at = patch.archived ? new Date().toISOString() : null;
    delete row.details.summary;
    return row;
  }

  const MESSAGES = {
    CONFLICT: "Cette séance a changé sur un autre appareil. Recharge le journal puis recommence.",
    SESSION_INVALID: "Une valeur n’est pas valide pour cette séance.",
    EXERCISES_INVALID: "Garde entre 1 et 30 exercices.",
    SETS_INVALID: "Chaque exercice garde entre 1 et 30 séries.",
    SET_INVALID: "Une série a une charge ou un nombre de répétitions invalide.",
    RIR_INVALID: "Le RIR va de 0 à 10, ou reste vide.",
    DURATION_INVALID: "La durée va de 1 minute à 24 heures.",
    EXTRAS_INVALID: "Un détail d’escalade n’est pas valide.",
  };
  function humanize(error) {
    const raw = String(error?.message || error || "");
    const code = Object.keys(MESSAGES).find((k) => raw.includes(k));
    return new Error(code ? MESSAGES[code] : raw || "Modification impossible pour le moment.");
  }

  async function update(log, patch) {
    const owner = window.state?.user?.id;
    if (!owner) throw new Error("Session indisponible.");
    if (isGuest()) {
      const row = applyLocally(log, patch);
      await window.TitanQueue.saveGuestSession(owner, row);
      if (window.state?.user?.id !== owner) return null;
      place(row);
      window.saveState?.();
      window.dispatchEvent(new CustomEvent("titan:history-updated"));
      return row;
    }
    if (log.syncStatus && log.syncStatus !== "confirmed")
      throw new Error("Cette séance attend encore la synchronisation. Elle est conservée sur cet appareil ; tu pourras la corriger une fois envoyée.");
    if (!navigator.onLine) throw new Error("Hors ligne : la correction d’une séance déjà synchronisée demande une connexion.");
    const { data, error } = await window.titanClient.rpc("titan_update_training_session", { p_id: log.id, p_revision: log.revision || 1, p_patch: patch });
    if (error) throw humanize(error);
    if (window.state?.user?.id !== owner || data?.user_id !== owner) return null;
    const row = { ...data, cat: data.category || data.cat, syncStatus: "confirmed" };
    place(row);
    window.TitanQueue.saveHistory(owner, [...window.state.history, ...window.state.archivedHistory]).catch(() => window.titanSetSyncStatus?.("error", "Cache hors ligne indisponible"));
    window.saveState?.();
    window.dispatchEvent(new CustomEvent("titan:history-updated"));
    return row;
  }

  const archive = (log) => update(log, { archived: true });
  const restore = (log) => update(log, { archived: false });

  function duplicate(log) {
    try {
      sessionStorage.setItem("titan_duplicate_session", JSON.stringify({ ownerId: window.state.user.id, log }));
    } catch {}
    location.href = `/training?sport=${encodeURIComponent(log.sport)}`;
  }

  /** The previous active session of the same sport, for comparisons. */
  function previousOf(log) {
    const t = new Date(log.date).getTime();
    return (window.state?.history || [])
      .filter((l) => l.sport === log.sport && idOf(l) !== idOf(log) && !l.archived_at && new Date(l.date).getTime() < t)
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;
  }

  window.TitanSessions = { idOf, find, resolve, update, archive, restore, duplicate, previousOf, applyLocally, humanize };
})();
