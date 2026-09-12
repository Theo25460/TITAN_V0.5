(function () {
  "use strict";
  function render() {
    if (!window.TitanQueue) return;
    let panel = document.getElementById("pending-panel");
    const items = window.TitanQueue.list();
    if (!panel && items.length) {
      panel = document.createElement("div");
      panel.id = "pending-panel";
      document.querySelector("main")?.append(panel);
    }
    if (!panel) return;
    panel.replaceChildren();
    if (!items.length) return;
    const details = document.createElement("details");
    details.className = "tracking-pending";
    const summary = document.createElement("summary");
    summary.textContent = `${items.length} séance(s) conservée(s) sur cet appareil`;
    details.append(summary);
    const ul = document.createElement("ul");
    for (const item of items) {
      const li = document.createElement("li");
      li.textContent = `${window.SPORTS_CONFIG?.[item.payload.sport]?.label || item.payload.sport} · ${new Date(item.payload.date).toLocaleDateString("fr-FR")} · ${item.status === "error" ? "À corriger : " + item.reason : "En attente de synchronisation"}`;
      ul.append(li);
    }
    details.append(ul);
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "tracking-secondary";
    retry.textContent = "Réessayer";
    retry.onclick = async () => {
      retry.disabled = true;
      try {
        await window.flushPendingTrainingLogs({ retry: true });
      } catch (_) {
        retry.textContent = "Connexion indisponible";
      } finally {
        retry.disabled = false;
      }
    };
    const exp = document.createElement("button");
    exp.type = "button";
    exp.className = "tracking-secondary";
    exp.textContent = "Exporter ces séances";
    exp.onclick = () => window.titanExportPending();
    details.append(retry, exp);
    panel.append(details);
  }
  window.addEventListener("titan:pending-changed", render);
  window.addEventListener("DOMContentLoaded", () =>
    window.TitanQueue?.migrate()
      .then(render)
      .catch(() => {
        window.titanSetSyncStatus?.("error", "Stockage indisponible");
      }),
  );
})();
