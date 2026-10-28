/* TITAN 300 — share a Moment with friends, on purpose. Nothing is shared automatically.
   Accounts only; the server checks ownership of the session and rate-limits shares. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const owner = () => window.state?.user?.id || null;
  const isGuest = () => !owner() || String(owner()).startsWith("guest_");
  const context = () => ({ owner: owner(), client: window.titanClient, epoch: window.titanAccountTransition?.epoch });
  const current = (job) => job.owner === owner() && job.client === window.titanClient && job.epoch === window.titanAccountTransition?.epoch && !isGuest() && !window.titanAccountTransition?.active;
  const failure = code => Object.assign(new Error(code), { code });
  let opened = null;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const LABEL = { record: "Record", goal: "Objectif", chapter: "Aventure", milestone: "Jalon", session: "Séance", challenge: "Défi", expedition: "Expédition", week: "Semaine" };

  function available() {
    return !isGuest() && Boolean(window.titanClient) && !window.titanAccountTransition?.active;
  }

  /** Opens a confirmation sheet; resolves true when the Moment is shared. */
  function open({ kind = "session", title = "", detail = "", sport = null, logId = null } = {}) {
    if (opened && !current(opened.job)) opened.dialog.close();
    if (!available()) {
      window.titanShell?.toast({ type: "info", title: "Compte requis", message: "Les Moments se partagent avec tes amis depuis un compte." });
      return Promise.resolve(false);
    }
    if (opened?.dialog.open) {
      opened.dialog.querySelector("[name=title]")?.focus();
      return opened.promise;
    }
    const job = context();
    let d;
    const promise = new Promise((resolve) => {
      let done = false, pending = false, closed = false, uncertain = false, attempt = null;
      const body = document.createElement("form");
      body.className = "asc-stack";
      body.setAttribute("aria-busy", "false");
      body.innerHTML = `<div class="sh-preview"><span class="asc-chip">${icon(kind === "record" ? "star" : kind === "chapter" ? "compass" : kind === "goal" ? "flag" : "bolt")}${esc(LABEL[kind] || "Moment")}</span>
          <label class="asc-field"><span>Titre</span><input class="asc-input" name="title" maxlength="90" value="${esc(title)}" required></label>
          <label class="asc-field"><span>Détail <small class="asc-faint">facultatif</small></span><input class="asc-input" name="detail" maxlength="140" value="${esc(detail)}"></label></div>
        <p class="asc-small asc-muted">${icon("lock")} Visible uniquement par tes amis acceptés. Jamais de note, de santé, de poids ni de GPS. Tu peux le supprimer à tout moment.</p>
        <p class="asc-small jr-edit-error" role="alert" hidden></p>
        <a class="asc-small" href="/social#moments" data-review-share hidden>Vérifier mes Moments dans Communauté</a>
        <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-cancel>Annuler</button><button type="submit" class="asc-btn asc-btn-primary">${icon("send")} Partager</button></div>`;
      const wrapper = document.createElement("div");
      const status = document.createElement("p");
      status.className = "asc-small asc-muted";
      status.setAttribute("role", "status");
      wrapper.append(status, body);
      const cancelForAccount = () => d.close();
      d = window.titanShell.sheet({ title: "Partager un Moment", eyebrow: "Communauté", body: wrapper, onClose: () => {
        closed = true;
        if (attempt) { attempt.expired = true; clearTimeout(attempt.timer); attempt.controller.abort(); }
        window.removeEventListener("titan:account-changing", cancelForAccount);
        window.removeEventListener("titan:account-changed", cancelForAccount);
        if (opened?.dialog === d) opened = null;
        if (!done) resolve(false); // Unconfirmed does not mean an already sent write was cancelled.
      } });
      window.addEventListener("titan:account-changing", cancelForAccount);
      window.addEventListener("titan:account-changed", cancelForAccount);
      const live = () => !closed && d.isConnected && d.open && current(job);
      d.addEventListener("cancel", e => { if (pending) e.preventDefault(); });
      d.addEventListener("click", e => {
        if (pending && e.target === d) { e.preventDefault(); e.stopImmediatePropagation(); }
      }, true);
      body.querySelector("[data-cancel]").addEventListener("click", () => { if (!pending) d.close(); });
      body.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (pending || uncertain || done || closed || !d.open || !d.isConnected) return;
        if (!current(job)) { d.close(); return; }
        const err = body.querySelector(".jr-edit-error");
        const btn = body.querySelector("[type=submit]");
        const titleField = body.querySelector("[name=title]");
        const t = titleField.value.trim();
        err.textContent = ""; err.hidden = true;
        if (!t) { err.textContent = "Donne un titre à ce Moment."; err.hidden = false; titleField.focus(); return; }
        if (!navigator.onLine) { err.textContent = "Hors ligne : ton brouillon reste ici. Reconnecte-toi avant de partager."; err.hidden = false; return; }
        const params = {
          p_kind: kind, p_title: t,
          p_detail: body.querySelector("[name=detail]").value.trim() || null,
          p_sport: sport || null,
          p_log_id: UUID.test(String(logId || "")) ? logId : null,
          p_visibility: "friends",
        };
        pending = true;
        const focused = document.activeElement;
        const controls = [...d.querySelectorAll("button,input")].map(el => [el, el.disabled]);
        controls.forEach(([el]) => { el.disabled = true; });
        body.setAttribute("aria-busy", "true");
        status.textContent = "Partage en cours…";
        const task = { expired: false, sent: false, controller: new AbortController(), timer: null };
        attempt = task;
        try {
          const work = (async () => {
            const { data: auth, error: authError } = await job.client.auth.getSession();
            if (task.expired || !live()) throw failure("SHARE_SESSION_CHANGED");
            if (authError) throw authError;
            const session = auth?.session;
            if (!session?.access_token || session.user?.id !== job.owner) throw failure("SHARE_SESSION_CHANGED");
            task.sent = true;
            // The SDK looks up the session again inside fetchWithAuth: preserve this draft's owner.
            const { data, error, status: httpStatus } = await job.client.rpc("titan_moment_share", params)
              .setHeader("Authorization", `Bearer ${session.access_token}`).abortSignal(task.controller.signal);
            if (error) throw Object.assign(new Error(error.message || "Share failed"), {
              code: error.code,
              confirmedRejection: httpStatus >= 400 && httpStatus < 500 && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(error.code || ""),
            });
            if (!UUID.test(String(data?.id || "")) || data.user_id !== job.owner) throw failure("SHARE_UNCONFIRMED");
          })();
          const timeout = new Promise((_, reject) => {
            task.timer = setTimeout(() => { task.expired = true; task.controller.abort(); reject(failure("SHARE_TIMEOUT")); }, 15000);
          });
          await Promise.race([work, timeout]);
          if (task.expired || !live()) { if (!closed) d.close(); return; }
          done = true;
          resolve(true);
          d.close();
          window.titanShell.toast({ type: "ok", title: "Moment partagé", message: "Tes amis le verront dans Communauté." });
        } catch (error) {
          if (!live()) { if (!closed) d.close(); return; }
          if (error?.code === "SHARE_SESSION_CHANGED") { d.close(); return; }
          // No server idempotency key exists here. A lost response must not invite a blind replay.
          uncertain = task.sent && !error?.confirmedRejection;
          const m = String(error?.message || "");
          err.textContent = uncertain ? "Le partage n’a pas pu être confirmé. Vérifie tes Moments dans Communauté avant de le renvoyer."
            : m.includes("SOCIAL_RATE_LIMIT") ? "Tu as déjà partagé beaucoup de Moments aujourd’hui. Réessaie demain."
            : m.includes("Could not find") || error?.code === "PGRST202" ? "Les Moments sont momentanément indisponibles. Réessaie dans un instant."
            : "Partage impossible pour le moment. Ton brouillon est conservé. Vérifie ta connexion puis réessaie.";
          err.hidden = false;
          body.querySelector("[data-review-share]").hidden = !uncertain;
        } finally {
          clearTimeout(task.timer);
          task.expired = true;
          if (attempt === task) attempt = null;
          pending = false;
          controls.forEach(([el, disabled]) => { el.disabled = disabled; });
          btn.disabled = uncertain;
          body.setAttribute("aria-busy", "false");
          status.textContent = "";
          if (live() && [document.body, d].includes(document.activeElement) && [...document.querySelectorAll("dialog[open]")].at(-1) === d) {
            (focused?.isConnected && !focused.disabled ? focused : body.querySelector("[data-cancel]")).focus({ preventScroll: true });
          }
        }
      });
    });
    opened = { dialog: d, promise, job };
    return promise;
  }

  window.TitanShare = { open, available };
})();
