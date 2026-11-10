/* TITAN Duo uses the server's 14-day buddy contract. Only the server's counts and acknowledgements are displayed. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const FLAG = "screens.buddy";
  const MESSAGES = {
    BUDDY_NOT_ALLOWED: "Ce binôme n’est pas possible (il faut être amis, sans blocage).",
    BUDDY_ALREADY_PAIRED: "Toi ou cet ami avez déjà un binôme en cours.",
    BUDDY_NOT_FOUND: "Cette invitation n’existe plus.",
    SOCIAL_RATE_LIMIT: "Beaucoup d’actions en peu de temps. Réessaie plus tard.",
  };

  let data = null;
  let scope = null;
  let flight = null;
  let available = false;
  let missing = false;
  let busy = false;
  let notice = "";
  let dialog = null;

  const context = () => ({ owner: window.state?.user?.id || null, client: window.titanClient || null, epoch: window.titanAccountTransition?.epoch });
  const same = (a, b) => a && b && a.owner === b.owner && a.client === b.client && a.epoch === b.epoch && !window.titanAccountTransition?.active;
  const guest = () => !context().owner || String(context().owner).startsWith("guest_");
  const on = () => !guest() && !window.titanAccountTransition?.active && window.titanFlags?.enabled?.(FLAG, false) === true;
  const changed = () => window.dispatchEvent(new CustomEvent("titan:buddy-updated"));
  const failure = (error) => {
    const code = Object.keys(MESSAGES).find((k) => String(error?.message || "").includes(k));
    return code ? MESSAGES[code] : "Le serveur ne répond pas pour l’instant. Réessaie dans un moment.";
  };

  function reset() { data = null; flight = null; available = false; missing = false; busy = false; notice = ""; if (dialog?.open) dialog.close(); }
  function sync() {
    const next = context();
    if (!same(scope, next)) { scope = next; reset(); }
  }

  async function rpc(ask, name, args) {
    const { data: auth } = await ask.client.auth.getSession();
    const session = auth?.session;
    if (!on() || !navigator.onLine || !same(ask, context()) || session?.user?.id !== ask.owner || !session?.access_token) {
      throw new Error("AUTH_REQUIRED");
    }
    return ask.client.rpc(name, args).setHeader("Authorization", `Bearer ${session.access_token}`);
  }

  async function refresh() {
    sync();
    if (!on() || missing || !navigator.onLine) return data;
    if (flight) return flight.promise;
    const ask = context();
    const job = {};
    flight = job;
    const current = () => flight === job && same(ask, context()) && on() && navigator.onLine;
    job.promise = (async () => {
      try {
        const { data: answer, error } = await rpc(ask, "titan_buddy_v1");
        if (!current()) return data;
        if (error) {
          data = null;
          if (error.code === "PGRST202" || /Could not find/.test(error.message || "")) missing = true; else notice = failure(error);
          return data;
        }
        if (["none", "pending", "active"].includes(answer?.status)) { data = answer; available = true; notice = ""; }
        else { data = null; notice = "L’état de ton expédition n’a pas pu être vérifié."; }
        return data;
      } catch {
        if (current()) { data = null; notice = "L’état de ton expédition n’a pas pu être vérifié."; }
        return data;
      } finally { if (flight === job) { flight = null; if (same(ask, context())) changed(); } }
    })();
    return job.promise;
  }

  async function act(name, args) {
    sync();
    if (busy || !on() || !navigator.onLine) return false;
    const ask = context();
    busy = true; notice = ""; changed();
    let ok = false;
    try {
      const { error } = await rpc(ask, name, args);
      if (!same(ask, context())) return false;
      if (error) notice = failure(error); else ok = true;
    } catch (error) {
      if (same(ask, context())) notice = failure(error);
    } finally {
      if (same(ask, context())) {
        const message = notice;
        flight = null;
        await refresh();
        if (same(ask, context())) { busy = false; notice = message || notice; changed(); }
      }
    }
    return ok;
  }

  function html() {
    sync();
    if (!on() || missing || (!data && !available && !notice)) return "";
    const frame = (status, body) => `<section class="asc-section asc-appear qg-bd" data-bd data-status="${esc(status)}" aria-labelledby="bd-title"><div class="asc-section-head"><h2 id="bd-title">TITAN Duo</h2></div><div class="asc-panel qg-steps-card">${body}</div></section>`;
    if (!navigator.onLine) return available ? frame("offline", '<p class="asc-small asc-muted">Reconnecte-toi pour retrouver ton expédition.</p>') : "";
    if (!data) return frame("unavailable", `<p class="asc-small asc-muted" role="status">${esc(notice || "Vérification de ton expédition…")}</p><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-bd-retry>Actualiser</button>`);
    const lock = busy ? "disabled" : "";
    const name = esc(data.partner?.name || "ton ami");
    let body;
    if (data.status === "active") {
      const percent = Math.min(100, Math.round((Number(data.together) / Math.max(1, Number(data.target))) * 100));
      body = `<p><strong>Expédition avec ${name}</strong> · ${Number(data.daysLeft)} jour${Number(data.daysLeft) > 1 ? "s" : ""} restant${Number(data.daysLeft) > 1 ? "s" : ""}</p>
        ${data.together >= data.target ? '<p class="asc-small cy">Objectif commun atteint.</p>' : ""}
        <span class="asc-ascent thin" role="progressbar" aria-label="Jours actifs à deux" aria-valuemin="0" aria-valuemax="${Number(data.target)}" aria-valuenow="${Math.min(Number(data.target), Number(data.together))}"><span style="--p:${percent}%"></span></span>
        <p class="asc-small asc-muted" data-bd-days>À deux : <strong>${Number(data.together)}</strong> / ${Number(data.target)} jours actifs · toi ${Number(data.myDays)}, ${name} ${Number(data.partnerDays)}</p>
        ${Number(data.nudgesReceived) > 0 ? `<p class="asc-small asc-muted" data-bd-received>${name} t’a encouragé${Number(data.nudgesReceived) > 1 ? ` ${Number(data.nudgesReceived)} fois` : ""}.</p>` : ""}
        <div class="asc-row"><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-bd-nudge="${esc(data.id)}" ${data.nudgedToday ? "disabled" : lock}>${data.nudgedToday ? "Encouragement envoyé" : `Encourager ${name}`}</button>
        <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-bd-end="${esc(data.id)}" ${lock}>Arrêter le binôme</button></div>`;
    } else if (data.status === "pending" && data.role === "invitee") {
      body = `<p><strong>${name}</strong> te propose une expédition à deux pendant 14 jours. Rien d’obligatoire : tu peux refuser, ou arrêter quand tu veux.</p>
        <div class="asc-row"><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-bd-respond="true" data-bd-id="${esc(data.id)}" ${lock}>Accepter</button>
        <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-bd-respond="false" data-bd-id="${esc(data.id)}" ${lock}>Refuser</button></div>`;
    } else if (data.status === "pending") {
      body = `<p>Invitation envoyée à <strong>${name}</strong>. Elle attend sa réponse.</p>
        <div class="asc-row"><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-bd-end="${esc(data.id)}" ${lock}>Annuler l’invitation</button></div>`;
    } else {
      const friends = Array.isArray(data.friends) ? data.friends : [];
      body = friends.length
        ? `<p class="asc-muted">Propose une expédition de 14 jours à un ami et avancez à votre rythme. Facultatif, et chacun peut arrêter quand il veut.</p>
           <div class="asc-row"><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-bd-choose ${lock}>Choisir un ami</button></div>`
        : `<p class="asc-muted">Quand tu auras ajouté un ami disponible, tu pourras lui proposer une expédition de 14 jours.</p>`;
    }
    return frame(data.status, `${body}${notice ? `<p class="asc-small" role="status" data-bd-notice>${esc(notice)}</p>` : ""}
      <p class="asc-small asc-muted">Tous les sports comptent. Un jour actif par personne et par jour, confirmé par TITAN. Vos jours actifs s’additionnent.</p>
      <p class="asc-small asc-faint">Seul le total de jours actifs est partagé avec ton ami. Aucun XP ni crédit à gagner.</p>`);
  }

  function chooser() {
    sync();
    if (!on() || dialog?.open || !data || data.status !== "none") return dialog;
    const ask = context();
    const friends = Array.isArray(data.friends) ? data.friends : [];
    const body = document.createElement("form");
    body.className = "asc-stack";
    body.noValidate = true;
    body.innerHTML = `<p class="asc-muted">Ton ami pourra accepter ou refuser. L’expédition de 14 jours commence seulement après son accord.</p>
      <fieldset style="border:0;padding:0;margin:0;display:grid;gap:8px"><legend class="sr-only">Choisis un ami</legend>${friends.map((f, i) => `<label class="rv-share"><input type="radio" name="friend" value="${esc(f.id)}" ${i === 0 ? "checked" : ""}> <span>${esc(f.name)}</span></label>`).join("")}</fieldset>
      <div class="asc-row"><button type="submit" class="asc-btn asc-btn-primary">Envoyer l’invitation</button></div>`;
    const d = window.titanShell.sheet({ title: "Choisir un binôme", eyebrow: "Facultatif", body, onClose: () => { if (dialog === d) dialog = null; } });
    dialog = d;
    body.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!same(ask, context())) { d.close(); return; }
      const friend = new FormData(body).get("friend");
      if (!friend) return;
      await act("titan_buddy_invite_v1", { p_friend: String(friend) });
      d.close();
    });
    return d;
  }

  document.addEventListener("click", async (e) => {
    const t = e.target.closest?.("[data-bd] button");
    if (!t) return;
    if (t.matches("[data-bd-choose]")) chooser();
    else if (t.matches("[data-bd-retry]")) refresh();
    else if (t.matches("[data-bd-respond]")) act("titan_buddy_respond_v1", { p_id: t.dataset.bdId, p_accept: t.dataset.bdRespond === "true" });
    else if (t.matches("[data-bd-nudge]")) act("titan_buddy_nudge_v1", { p_id: t.dataset.bdNudge });
    else if (t.matches("[data-bd-end]")) {
      const id = t.dataset.bdEnd;
      const ask = context();
      if (data?.status === "active") await window.titanShell.confirm({ title: "Arrêter le binôme", message: "L’expédition s’arrête pour vous deux. Le partage de vos jours actifs prend fin.", confirmLabel: "Arrêter", danger: true, action: () => same(ask, context()) && act("titan_buddy_end_v1", { p_id: id }) });
      else await act("titan_buddy_end_v1", { p_id: id });
    }
  });
  window.addEventListener("titan:account-changing", () => { scope = null; reset(); });
  window.addEventListener("offline", () => { data = null; flight = null; if (dialog?.open) dialog.close(); changed(); });
  ["titan:account-changed", "titan:flags-updated", "titan:history-updated", "online"].forEach((ev) => window.addEventListener(ev, () => { sync(); changed(); refresh(); }));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
  window.TitanBuddy = { html, refresh };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(() => refresh(), 0));
  else setTimeout(() => refresh(), 0);
})();
