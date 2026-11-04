/* V11-63 (COM-C2): the progress buddy of the QG. Two friends agree, for 14 days, to support each other: the invited friend accepts or
   declines, and either side may stop at any time. The partner is only ever seen through a count of active days. Nothing is granted: no XP,
   no credit, no ranking. Shown only when the server flag screens.buddy is on, to a signed-in account, and when the server has the functions.
   Every answer is applied only if the account, the client and the epoch are still the ones that asked. */
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
  let owner = null;
  let flight = null;
  let missing = false;
  let busy = false;
  let notice = "";
  let dialog = null;

  const context = () => ({ owner: window.state?.user?.id || null, client: window.titanClient || null, epoch: window.titanAccountTransition?.epoch });
  const same = (a, b) => a && b && a.owner === b.owner && a.client === b.client && a.epoch === b.epoch && !window.titanAccountTransition?.active;
  const guest = () => !context().owner || String(context().owner).startsWith("guest_");
  const on = () => !guest() && window.titanFlags?.enabled?.(FLAG, false) === true;
  const changed = () => window.dispatchEvent(new CustomEvent("titan:buddy-updated"));
  const failure = (error) => {
    const code = Object.keys(MESSAGES).find((k) => String(error?.message || "").includes(k));
    return code ? MESSAGES[code] : "Le serveur ne répond pas pour l’instant. Réessaie dans un moment.";
  };

  function reset() { data = null; flight = null; missing = false; busy = false; notice = ""; if (dialog?.open) dialog.close(); }
  function sync() {
    const id = guest() ? null : context().owner;
    if (id !== owner) { owner = id; reset(); changed(); }
  }

  async function refresh() {
    sync();
    if (!on() || missing || !navigator.onLine) return data;
    if (flight) return flight;
    const ask = context();
    flight = (async () => {
      try {
        const { data: answer, error } = await ask.client.rpc("titan_buddy_v1");
        if (!same(ask, context())) return data;
        if (error) {
          if (error.code === "PGRST202" || /Could not find/.test(error.message || "")) missing = true; else notice = failure(error);
          return data;
        }
        if (answer && typeof answer === "object") { data = answer; notice = ""; }
        return data;
      } catch {
        if (same(ask, context())) notice = "Le binôme ne répond pas pour l’instant.";
        return data;
      } finally { flight = null; if (same(ask, context())) changed(); }
    })();
    return flight;
  }

  async function act(name, args) {
    sync();
    if (busy || !on()) return false;
    const ask = context();
    busy = true; notice = ""; changed();
    let ok = false;
    try {
      const { error } = await ask.client.rpc(name, args);
      if (!same(ask, context())) return false;
      if (error) notice = failure(error); else ok = true;
    } catch (error) {
      if (same(ask, context())) notice = failure(error);
    } finally {
      if (same(ask, context())) { const message = notice; busy = false; await refresh(); if (same(ask, context())) { notice = message || notice; changed(); } } else busy = false;
    }
    return ok;
  }

  function html() {
    sync();
    if (!on() || missing || !data) return "";
    const lock = busy ? "disabled" : "";
    const name = esc(data.partner?.name || "ton ami");
    let body;
    if (data.status === "active") {
      const percent = Math.min(100, Math.round((Number(data.together) / Math.max(1, Number(data.target))) * 100));
      body = `<p><strong>Binômes avec ${name}</strong> · ${Number(data.daysLeft)} jour${Number(data.daysLeft) > 1 ? "s" : ""} restant${Number(data.daysLeft) > 1 ? "s" : ""}</p>
        <span class="asc-ascent thin" role="progressbar" aria-label="Jours actifs à deux" aria-valuemin="0" aria-valuemax="${Number(data.target)}" aria-valuenow="${Math.min(Number(data.target), Number(data.together))}"><span style="--p:${percent}%"></span></span>
        <p class="asc-small asc-muted" data-bd-days>À deux : <strong>${Number(data.together)}</strong> / ${Number(data.target)} jours actifs · toi ${Number(data.myDays)}, ${name} ${Number(data.partnerDays)}</p>
        ${Number(data.nudgesReceived) > 0 ? `<p class="asc-small asc-muted" data-bd-received>${name} t’a encouragé${Number(data.nudgesReceived) > 1 ? ` ${Number(data.nudgesReceived)} fois` : ""}.</p>` : ""}
        <div class="asc-row"><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-bd-nudge="${esc(data.id)}" ${data.nudgedToday ? "disabled" : lock}>${data.nudgedToday ? "Encouragement envoyé" : `Encourager ${name}`}</button>
        <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-bd-end="${esc(data.id)}" ${lock}>Arrêter le binôme</button></div>`;
    } else if (data.status === "pending" && data.role === "invitee") {
      body = `<p><strong>${name}</strong> te propose d’être binômes pendant 14 jours. Rien d’obligatoire : tu peux refuser, ou arrêter quand tu veux.</p>
        <div class="asc-row"><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-bd-respond="true" data-bd-id="${esc(data.id)}" ${lock}>Accepter</button>
        <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-bd-respond="false" data-bd-id="${esc(data.id)}" ${lock}>Refuser</button></div>`;
    } else if (data.status === "pending") {
      body = `<p>Invitation envoyée à <strong>${name}</strong>. Elle attend sa réponse.</p>
        <div class="asc-row"><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-bd-end="${esc(data.id)}" ${lock}>Annuler l’invitation</button></div>`;
    } else {
      const friends = Array.isArray(data.friends) ? data.friends : [];
      body = friends.length
        ? `<p class="asc-muted">Un binôme, c’est un ami avec qui tu avances 14 jours, à votre rythme. Facultatif, et chacun peut arrêter quand il veut.</p>
           <div class="asc-row"><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-bd-choose ${lock}>Choisir un ami</button></div>`
        : `<p class="asc-muted">Un binôme se choisit parmi tes amis. Quand tu auras ajouté un ami, tu pourras lui proposer 14 jours à deux.</p>`;
    }
    return `<section class="asc-section asc-appear qg-bd" data-bd data-status="${esc(data.status)}" aria-labelledby="bd-title"><div class="asc-section-head"><h2 id="bd-title">Ton binôme de progression</h2></div>
      <div class="asc-panel qg-steps-card">${body}${notice ? `<p class="asc-small" role="status" data-bd-notice>${esc(notice)}</p>` : ""}
      <p class="asc-small asc-faint">Tu ne vois de ton binôme que son nombre de jours actifs. Aucun XP ni crédit à gagner.</p></div></section>`;
  }

  function chooser() {
    sync();
    if (!on() || dialog?.open || !data || data.status !== "none") return dialog;
    const ask = context();
    const friends = Array.isArray(data.friends) ? data.friends : [];
    const body = document.createElement("form");
    body.className = "asc-stack";
    body.noValidate = true;
    body.innerHTML = `<p class="asc-muted">Ton ami recevra une invitation et pourra refuser. Le binôme dure 14 jours.</p>
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
    else if (t.matches("[data-bd-respond]")) act("titan_buddy_respond_v1", { p_id: t.dataset.bdId, p_accept: t.dataset.bdRespond === "true" });
    else if (t.matches("[data-bd-nudge]")) act("titan_buddy_nudge_v1", { p_id: t.dataset.bdNudge });
    else if (t.matches("[data-bd-end]")) {
      const id = t.dataset.bdEnd;
      const confirmed = data?.status === "active"
        ? await window.titanShell.confirm({ title: "Arrêter le binôme", message: "Le binôme s’arrête tout de suite pour vous deux. Tu pourras en proposer un autre plus tard.", confirmLabel: "Arrêter", danger: true, action: () => act("titan_buddy_end_v1", { p_id: id }) })
        : (await act("titan_buddy_end_v1", { p_id: id }), true);
      void confirmed;
    }
  });
  window.addEventListener("titan:account-changing", () => { owner = null; reset(); });
  ["titan:account-changed", "titan:flags-updated", "online"].forEach((ev) => window.addEventListener(ev, () => { sync(); refresh(); }));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
  window.TitanBuddy = { html, refresh };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(() => refresh(), 0));
  else setTimeout(() => refresh(), 0);
})();
