/* TITAN 300 — share a Moment with friends, on purpose. Nothing is shared automatically.
   Accounts only; the server checks ownership of the session and rate-limits shares. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const isGuest = () => String(window.state?.user?.id || "").startsWith("guest_");
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const LABEL = { record: "Record", goal: "Objectif", chapter: "Aventure", milestone: "Jalon", session: "Séance", challenge: "Défi", expedition: "Expédition", week: "Semaine" };

  function available() {
    return !isGuest() && Boolean(window.titanClient);
  }

  /** Opens a confirmation sheet; resolves true when the Moment is shared. */
  function open({ kind = "session", title = "", detail = "", sport = null, logId = null } = {}) {
    if (!available()) {
      window.titanShell?.toast({ type: "info", title: "Compte requis", message: "Les Moments se partagent avec tes amis depuis un compte." });
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      let done = false;
      const body = document.createElement("form");
      body.className = "asc-stack";
      body.innerHTML = `<div class="sh-preview"><span class="asc-chip">${icon(kind === "record" ? "star" : kind === "chapter" ? "compass" : kind === "goal" ? "flag" : "bolt")}${esc(LABEL[kind] || "Moment")}</span>
          <label class="asc-field"><span>Titre</span><input class="asc-input" name="title" maxlength="90" value="${esc(title)}" required></label>
          <label class="asc-field"><span>Détail <small class="asc-faint">facultatif</small></span><input class="asc-input" name="detail" maxlength="140" value="${esc(detail)}"></label></div>
        <p class="asc-small asc-muted">${icon("lock")} Visible uniquement par tes amis acceptés. Jamais de note, de santé, de poids ni de GPS. Tu peux le supprimer à tout moment.</p>
        <p class="asc-small jr-edit-error" role="alert"></p>
        <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-cancel>Annuler</button><button type="submit" class="asc-btn asc-btn-primary">${icon("send")} Partager</button></div>`;
      const d = window.titanShell.sheet({ title: "Partager un Moment", eyebrow: "Communauté", body, onClose: () => !done && resolve(false) });
      body.querySelector("[data-cancel]").addEventListener("click", () => d.close());
      body.addEventListener("submit", async (e) => {
        e.preventDefault();
        const err = body.querySelector(".jr-edit-error");
        const btn = body.querySelector("[type=submit]");
        const t = body.querySelector("[name=title]").value.trim();
        if (!t) return (err.textContent = "Donne un titre à ce Moment.");
        btn.disabled = true;
        try {
          const { error } = await window.titanClient.rpc("titan_moment_share", {
            p_kind: kind,
            p_title: t,
            p_detail: body.querySelector("[name=detail]").value.trim() || null,
            p_sport: sport || null,
            p_log_id: UUID.test(String(logId || "")) ? logId : null,
            p_visibility: "friends",
          });
          if (error) throw error;
          done = true;
          resolve(true);
          d.close();
          window.titanShell.toast({ type: "ok", title: "Moment partagé", message: "Tes amis le verront dans Communauté." });
        } catch (error) {
          const m = String(error?.message || "");
          err.textContent = m.includes("SOCIAL_RATE_LIMIT") ? "Tu as déjà partagé beaucoup de Moments aujourd’hui. Réessaie demain." : m.includes("Could not find") || error?.code === "PGRST202" ? "Les Moments arrivent avec la prochaine mise à jour du serveur." : "Partage impossible pour le moment. Vérifie ta connexion.";
          btn.disabled = false;
        }
      });
    });
  }

  window.TitanShare = { open, available };
})();
