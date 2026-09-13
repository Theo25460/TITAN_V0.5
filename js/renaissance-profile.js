(function () {
  "use strict";
  const R = window.TitanRenaissance,
    A = window.TitanAdventure;
  let exporting = false;
  function render() {
    const host = document.getElementById("renaissance-profile"),
      s = A.snapshot;
    if (!host || !window.state?.user) return;
    host.innerHTML = `<div class="r-profile-identity">${R.character(s)}<section class="r-panel"><span class="r-eyebrow">TON COMPTE, TES CHOIX</span><h2>Le personnage avance.<br>Tu gardes la main.</h2><p>Retrouve tes avatars et tes insignes, choisis tes partages et conserve une copie de tes données.</p><div class="r-profile-shortcuts"><a href="/personnage">${R.icon("user")}Personnage et collection ${R.icon("arrow")}</a><a href="/coaching">${R.icon("group")}Mes suivis avec un coach ${R.icon("arrow")}</a><a href="#privacy-section">${R.icon("shield")}Confidentialité sociale ${R.icon("arrow")}</a><a href="/tarifs">${R.icon("crown")}Mon offre TITAN ${R.icon("arrow")}</a></div><p class="r-small">${R.status(s)}</p></section></div>`;
  }
  function organize() {
    const oldHeader = document.querySelector(".profile-header"),
      avatar = document.getElementById("avatar-section"),
      cosmetics = document.getElementById("cosmetic-section"),
      identity = document.getElementById("identity-os-section");
    if (oldHeader && !document.getElementById("legacy-identity")) {
      const details = document.createElement("details");
      details.className = "r-panel r-block r-legacy-identity";
      details.id = "legacy-identity";
      details.innerHTML =
        "<summary>Avatar social et collection existante</summary><p>Ton personnage d’aventure se choisit dans Personnage. Les anciens avatars et accessoires restent disponibles ici pour ton identité dans les espaces sociaux.</p>";
      document.getElementById("privacy-section")?.before(details);
      for (const el of [oldHeader, identity, avatar, cosmetics])
        if (el) details.append(el);
    }
    document
      .getElementById("name-input")
      ?.setAttribute("aria-label", "Mon pseudo");
    render();
  }
  function download(payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `titan-donnees-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  const parseLocal = (prefix, id) => {
    try {
      return JSON.parse(localStorage.getItem(prefix + id) || "null");
    } catch {
      return null;
    }
  };
  window.exportData = async function () {
    if (exporting || !window.state?.user) return;
    exporting = true;
    const id = window.state.user.id,
      local = String(id).startsWith("guest_");
    const captured = {
      user: structuredClone(window.state.user),
      history: structuredClone(window.state.history || []),
      archivedHistory: structuredClone(window.state.archivedHistory || []),
      game: structuredClone(window.state.game || {}),
    };
    let payload = {
      exportedAt: new Date().toISOString(),
      owner: id,
      source: local ? "decouverte-locale" : "compte",
      localState: captured,
      pendingSessions: structuredClone(
        window.titanGetPendingTrainingLogs?.() || [],
      ),
      adventure: parseLocal("titan_adventure_v1:", id),
      goals: parseLocal("titan_goals_v1:", id),
    };
    try {
      if (!local) {
        const session = (await window.titanClient.auth.getSession())?.data
          ?.session;
        if (session?.user?.id !== id || window.state.user.id !== id)
          throw Error("ACCOUNT_CHANGED");
        const headers = {
          apikey: window.TITAN_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        };
        async function request(path, options = {}) {
          const response = await fetch(
            `${window.TITAN_SUPABASE_URL}/rest/v1/${path}`,
            { headers, ...options, signal: AbortSignal.timeout(20000) },
          );
          if (!response.ok) throw Error("EXPORT_UNAVAILABLE");
          const value = await response.json();
          if (window.state?.user?.id !== id) throw Error("ACCOUNT_CHANGED");
          return value;
        }
        async function table(name, column = "user_id") {
          let rows = [],
            offset = 0;
          for (;;) {
            const page = await request(
              `${name}?${column}=eq.${encodeURIComponent(id)}&select=*&order=id.asc&limit=500&offset=${offset}`,
            );
            rows.push(...page);
            if (page.length < 500) return rows;
            offset += page.length;
          }
        }
        const [cloud, goals, coaching, adventure] = await Promise.all([
          request("rpc/export_own_data", { method: "POST", body: "{}" }),
          table("sport_goals"),
          request("rpc/titan_coach_portal", {
            method: "POST",
            body: JSON.stringify({ p_action: "snapshot", p_data: {} }),
          }),
          request("rpc/titan_adventure_snapshot", {
            method: "POST",
            body: "{}",
          }),
        ]);
        // Each assignment page is authorized again; sessions shared by another athlete are never exported here.
        const assignmentRows = [];
        for (const link of coaching.links) {
          let offset = 0;
          for (;;) {
            const page = await request("rpc/titan_coach_portal", {
              method: "POST",
              body: JSON.stringify({
                p_action: "assignments",
                p_data: { link_id: link.id, offset },
              }),
            });
            assignmentRows.push(...page.rows);
            offset += page.rows.length;
            if (offset >= page.total) break;
            if (!page.rows.length) throw Error("EXPORT_INCOMPLETE");
          }
        }
        payload = {
          ...payload,
          cloud,
          goals,
          adventure,
          coaching: { ...coaching, assignments: assignmentRows },
        };
      }
      if (window.state?.user?.id !== id) throw Error("ACCOUNT_CHANGED");
      download(payload);
      window.showNotification?.(
        "success",
        "Export prêt",
        "Le fichier contient ton journal, tes objectifs, ton aventure et tes suivis autorisés.",
      );
    } catch (e) {
      window.showNotification?.(
        "error",
        "Export non terminé",
        e.message === "ACCOUNT_CHANGED"
          ? "Le compte a changé. Aucun fichier n’a été créé."
          : "Une partie des données n’a pas pu être chargée. Reconnecte-toi puis réessaie. Le journal propose aussi un export CSV des séances présentes sur cet appareil.",
      );
    } finally {
      exporting = false;
    }
  };
  window.clearCacheAction = function () {
    const d = document.createElement("dialog");
    d.className = "r-dialog";
    d.innerHTML =
      '<h2>Actualiser les fichiers de l’application</h2><p>Les images et fichiers de l’interface seront retéléchargés. Tes séances, brouillons, objectifs, personnages et préférences conservés sur cet appareil restent en place.</p><p class="r-small">Une connexion est nécessaire pour recharger les fichiers.</p><div class="r-dialog-actions"><button class="r-button primary" id="confirm-refresh-files">Actualiser les fichiers</button><button class="r-button subtle" data-close>Annuler</button></div><p class="r-error" role="status"></p>';
    document.body.append(d);
    d.querySelector("[data-close]").onclick = () => d.close();
    d.addEventListener("close", () => d.remove());
    d.querySelector("#confirm-refresh-files").onclick = async () => {
      const b = d.querySelector("#confirm-refresh-files");
      b.disabled = true;
      try {
        if (!navigator.onLine) throw Error("offline");
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(
            keys
              .filter((k) => k.startsWith("titan-os-"))
              .map((k) => caches.delete(k)),
          );
        }
        location.reload();
      } catch {
        d.querySelector("[role=status]").textContent =
          "Reconnecte-toi puis réessaie. Tes données ont été conservées.";
        b.disabled = false;
      }
    };
    d.showModal();
  };
  window.addEventListener("titan:adventure-updated", render);
  document.addEventListener("DOMContentLoaded", organize);
  if (document.readyState !== "loading") organize();
})();
