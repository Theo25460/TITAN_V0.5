(function () {
  "use strict";
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const find = (id) =>
    [
      ...(window.state?.history || []),
      ...(window.state?.archivedHistory || []),
    ].find((l) => String(l.id) === id);
  function replace(row) {
    const log = {
      ...row,
      cat: row.category || row.cat,
      syncStatus: "confirmed",
    };
    window.state.history = (window.state.history || []).filter(
      (l) => l.id !== row.id,
    );
    window.state.archivedHistory = (window.state.archivedHistory || []).filter(
      (l) => l.id !== row.id,
    );
    (row.archived_at
      ? window.state.archivedHistory
      : window.state.history
    ).push(log);
    window.TitanQueue.saveHistory(window.state.user.id, [
      ...window.state.history,
      ...window.state.archivedHistory,
    ]).catch(() =>
      window.titanSetSyncStatus?.("error", "Cache hors ligne indisponible"),
    );
    window.saveState?.();
    window.dispatchEvent(new CustomEvent("titan:history-updated"));
  }
  function dialog(title, body, onSubmit) {
    const d = document.createElement("dialog");
    d.className = "tracking-dialog";
    d.innerHTML = `<form><h2>${esc(title)}</h2>${body}<p role="alert"></p><menu><button type="button" class="tracking-secondary" data-close>Annuler</button><button class="tracking-action" type="submit">Confirmer</button></menu></form>`;
    document.body.append(d);
    d.querySelector("[data-close]").onclick = () => d.close();
    d.addEventListener("close", () => d.remove());
    d.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      const button = d.querySelector("[type=submit]");
      button.disabled = true;
      try {
        await onSubmit(new FormData(e.target));
        d.close();
      } catch (error) {
        d.querySelector("[role=alert]").textContent = error.message.includes(
          "CONFLICT",
        )
          ? "Cette séance a changé sur un autre appareil. Actualise le journal."
          : error.message;
      } finally {
        button.disabled = false;
      }
    };
    d.showModal();
  }
  async function update(log, patch) {
    if (String(window.state?.user?.id).startsWith("guest_")) {
      const row = {
        ...log,
        ...("val" in patch ? { val: patch.val } : {}),
        ...("date" in patch ? { date: patch.date } : {}),
        revision: (log.revision || 1) + 1,
        syncStatus: "local",
        details: { ...log.details },
      };
      if ("note" in patch) row.details.note = patch.note;
      if ("val" in patch) row.details.val1 = row.val;
      if ("date" in patch) row.details.performedAt = row.date;
      if ("val" in patch || "duration" in patch) delete row.details.summary;
      if ("duration" in patch) {
        row.details.duration = patch.duration;
        row.details.val2 = patch.duration;
      }
      if ("archived" in patch)
        row.archived_at = patch.archived ? new Date().toISOString() : null;
      await window.TitanQueue.saveGuestSession(window.state.user.id, row);
      window.state.history = (window.state.history || []).filter(
        (l) => l.id !== row.id,
      );
      window.state.archivedHistory = (
        window.state.archivedHistory || []
      ).filter((l) => l.id !== row.id);
      (row.archived_at
        ? window.state.archivedHistory
        : window.state.history
      ).push(row);
      window.saveState?.();
      window.dispatchEvent(new CustomEvent("titan:history-updated"));
      return;
    }
    if (log.syncStatus && log.syncStatus !== "confirmed")
      throw new Error(
        "Synchronise cette séance avant de la modifier. Tes données restent conservées sur cet appareil.",
      );
    const { data, error } = await window.titanClient.rpc(
      "titan_update_training_session",
      { p_id: log.id, p_revision: log.revision || 1, p_patch: patch },
    );
    if (error) throw error;
    replace(data);
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-session-action]");
    if (!b) return;
    const log = find(b.dataset.sessionId);
    if (!log) return;
    if (b.dataset.sessionAction === "duplicate") {
      sessionStorage.setItem(
        "titan_duplicate_session",
        JSON.stringify({ ownerId: window.state.user.id, log }),
      );
      location.href = `./training.html?sport=${encodeURIComponent(log.sport)}`;
      return;
    }
    if (
      b.dataset.sessionAction === "archive" ||
      b.dataset.sessionAction === "restore"
    ) {
      const archive = b.dataset.sessionAction === "archive";
      dialog(
        archive ? "Archiver cette séance ?" : "Restaurer cette séance ?",
        `<p>${archive ? "Elle sera retirée des statistiques et restera accessible dans les archives." : "Elle réapparaîtra dans ton journal et tes statistiques."}</p><p class="tracking-status">Les récompenses déjà obtenues restent inchangées. Aucune nouvelle récompense n’est attribuée.</p>`,
        () => update(log, { archived: archive }),
      );
      return;
    }
    const date = new Date(
      new Date(log.date).getTime() -
        new Date(log.date).getTimezoneOffset() * 60000,
    )
      .toISOString()
      .slice(0, 16);
    const measuredSets = Boolean(log.details?.exercises?.length);
    dialog(
      "Modifier la séance",
      `<label>Date et heure<input name="date" type="datetime-local" value="${date}" required></label><label>Valeur (${esc(log.unit)})<input name="val" type="number" step="any" min="0.01" max="300000" value="${Number(log.val)}" ${measuredSets ? "readonly" : ""} required></label>${measuredSets ? '<p class="tracking-status">Le volume provient des séries enregistrées. Pour changer les exercices, duplique la séance, puis archive l’original si nécessaire.</p>' : ""}<label>Durée (min)<input name="duration" type="number" min="1" max="1440" step="any" value="${window.TitanTraining.duration(log) || ""}" ${["min", "h"].includes(log.unit) ? "readonly" : ""}></label><label>Note<textarea name="note" maxlength="2000">${esc(log.details?.note || "")}</textarea></label><p class="tracking-status">Les statistiques sont recalculées à partir des mesures corrigées. Les récompenses restent celles de la séance initiale.</p>`,
      (data) => {
        const patch = {
          date: new Date(data.get("date")).toISOString(),
          note: data.get("note"),
        };
        if (!measuredSets) patch.val = Number(data.get("val"));
        if (log.unit === "min") patch.duration = patch.val ?? Number(log.val);
        else if (log.unit === "h") patch.duration = (patch.val ?? Number(log.val)) * 60;
        else if (data.get("duration"))
          patch.duration = Number(data.get("duration"));
        return update(log, patch);
      },
    );
  });
  window.addEventListener("titan:history-updated", () =>
    window.bootActivityJournal?.(),
  );
})();
