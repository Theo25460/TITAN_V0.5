/* TITAN 300 — Recours: the player sees which of their sessions are excluded (or their account suspended), contests them
   with a reasoned message and reads the team's answer. Server rules: titan_my_review_state_v1, titan_appeal_submit_v1,
   titan_my_appeals_v1. Nothing is automatic and nothing is decided here. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const ERRORS = {
    MESSAGE_REQUIRED: "Écris entre 10 et 500 caractères.",
    NOT_EXCLUDED: "Cette séance n’est plus exclue : il n’y a plus rien à contester.",
    NOT_SUSPENDED: "Ton compte n’est pas suspendu.",
    SESSION_NOT_FOUND: "Cette séance n’existe plus.",
    APPEAL_ALREADY_OPEN: "Un recours est déjà en cours pour cela.",
    APPEAL_LIMIT: "Tu as déjà cinq recours en attente : attends une réponse.",
    APPEAL_COOLDOWN: "Ton dernier recours a été refusé il y a moins de 7 jours : tu pourras en déposer un nouveau ensuite.",
    AUTH_REQUIRED: "Connecte-toi pour déposer un recours.",
    ANSWER_REQUIRED: "Écris entre 3 et 500 caractères.",
    REQUEST_NOT_OPEN: "Tu as déjà répondu à cette demande.",
    REQUEST_NOT_FOUND: "Cette demande n’existe plus.",
  };
  const VERIFY_STATUS = { open: "À traiter", answered: "Réponse envoyée", closed: "Clôturée" };
  const STATUS = { open: "En cours d’examen", accepted: "Accepté", declined: "Refusé" };
  const TIMEOUT_MS = 8000;
  const root = () => document.getElementById("recours");
  let token = 0;
  let busy = false;
  let sendId = 0;
  let loadedOnce = false;
  let opener = null;

  const context = () => ({ owner: window.state?.user?.id, client: window.titanClient, epoch: window.titanAccountTransition?.epoch });
  const same = (a, b) => !!a.owner && a.owner === b.owner && a.client === b.client && a.epoch === b.epoch;
  const isGuest = (id) => !id || String(id).startsWith("guest_");
  const errorText = (error, fallback = "Le recours n’a pas pu être envoyé. Réessaie dans un instant.") => {
    const message = String((error && error.message) || error || "");
    const code = Object.keys(ERRORS).find((key) => message.includes(key));
    return code ? ERRORS[code] : fallback;
  };
  const date = (value) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  };
  const withTimeout = (promise) =>
    Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), TIMEOUT_MS))]);

  function show(html) {
    const el = root();
    if (!el) return;
    el.innerHTML = html;
    el.setAttribute("aria-busy", "false");
  }

  function sessionLine(s) {
    const what = `${esc(s.sport)} · ${esc(date(s.date))}${Number.isFinite(Number(s.value)) ? ` · ${esc(String(Number(s.value)))} ${esc(s.unit || "")}` : ""}`;
    const action = s.hasOpenAppeal
      ? '<span class="asc-chip">Recours en cours</span>'
      : `<button type="button" class="asc-btn asc-btn-secondary" data-appeal-open="session" data-session="${esc(s.id)}">Contester</button>`;
    return `<li class="asc-row"><span>${what}</span>${action}</li>`;
  }

  function appealLine(a) {
    const target = a.kind === "session" ? "Séance exclue" : "Compte suspendu";
    const note = a.decisionNote ? `<p class="asc-note">Réponse de l’équipe : ${esc(a.decisionNote)}</p>` : "";
    return `<li class="asc-row"><span><strong>${esc(target)}</strong> · ${esc(date(a.createdAt))}</span><span class="asc-chip" data-status="${esc(a.status)}">${esc(STATUS[a.status] || a.status)}</span>${note}</li>`;
  }

  function verifyLine(r) {
    const answer = r.answer ? `<p class="asc-note">Ta réponse : ${esc(r.answer)}</p>` : "";
    const form = r.status === "open"
      ? `<form class="asc-form" data-verify-send data-id="${esc(r.id)}" novalidate>
          <label for="verify-answer-${esc(r.id)}">Ta réponse (3 à 500 caractères)</label>
          <textarea id="verify-answer-${esc(r.id)}" name="answer" rows="4" maxlength="500" required aria-describedby="verify-error-${esc(r.id)}"></textarea>
          <p class="asc-note" id="verify-error-${esc(r.id)}" role="alert" tabindex="-1" data-verify-error hidden></p>
          <div class="asc-row-flex"><button type="submit" class="asc-btn asc-btn-primary">Envoyer ma réponse</button></div>
        </form>`
      : "";
    return `<li class="asc-row"><span><strong>Demande de l’équipe</strong> · ${esc(date(r.createdAt))}</span><span class="asc-chip" data-status="${esc(r.status)}">${esc(VERIFY_STATUS[r.status] || r.status)}</span><p>${esc(r.message)}</p>${answer}${form}</li>`;
  }

  function verifySection(verification) {
    const list = Array.isArray(verification?.requests) ? verification.requests : [];
    if (!list.length) return "";
    return `<section id="verification" aria-labelledby="rec-verif"><h2 id="rec-verif">Vérifications demandées</h2><p class="asc-note">Une personne de l’équipe te demande de confirmer quelque chose. Répondre ne déclenche aucune sanction : ta réponse est relue par une personne.</p><ul class="asc-list">${list.map(verifyLine).join("")}</ul></section>`;
  }

  function render(state, appeals, verification) {
    const sessions = Array.isArray(state?.excludedSessions) ? state.excludedSessions : [];
    const list = Array.isArray(appeals?.appeals) ? appeals.appeals : [];
    const suspended = !!state?.account?.suspended;
    const hasOpenAccount = list.some((a) => a.kind === "account" && a.status === "open");
    let html = verifySection(verification);
    html += '<p class="asc-note">Une séance peut être mise à l’écart des classements et des défis le temps d’une vérification, et ton compte peut être suspendu. Si tu penses que c’est une erreur, explique-le ici : une personne de l’équipe relit ta demande et te répond. Rien n’est supprimé et aucune décision n’est automatique.</p>';
    html += '<section aria-labelledby="rec-compte"><h2 id="rec-compte">Ton compte</h2>';
    if (suspended) {
      html += `<p>Ton compte est actuellement ${state.account.banned ? "bloqué" : "suspendu"}.</p>`;
      html += hasOpenAccount ? '<p><span class="asc-chip">Recours en cours</span></p>' : '<button type="button" class="asc-btn asc-btn-secondary" data-appeal-open="account">Contester</button>';
    } else {
      html += "<p>Ton compte n’est pas suspendu.</p>";
    }
    html += '</section><section aria-labelledby="rec-seances"><h2 id="rec-seances">Séances exclues</h2>';
    html += sessions.length ? `<ul class="asc-list">${sessions.map(sessionLine).join("")}</ul>` : "<p>Aucune de tes séances n’est exclue.</p>";
    html += '</section><div data-appeal-form></div><section aria-labelledby="rec-reponses"><h2 id="rec-reponses">Tes recours</h2>';
    html += list.length ? `<ul class="asc-list">${list.map(appealLine).join("")}</ul>` : "<p>Tu n’as déposé aucun recours.</p>";
    html += '</section><p class="asc-note" role="status" tabindex="-1" data-appeal-live></p>';
    show(html);
  }

  function formHtml(kind, session) {
    return `<form class="asc-form" data-appeal-send data-kind="${esc(kind)}" data-session="${esc(session || "")}" novalidate>
      <h2>${kind === "session" ? "Contester cette séance" : "Contester la suspension"}</h2>
      <label for="appeal-message">Ce qui s’est passé (10 à 500 caractères)</label>
      <textarea id="appeal-message" name="message" rows="5" maxlength="500" required aria-describedby="appeal-help appeal-error"></textarea>
      <p id="appeal-help" class="asc-note">Reste factuel : ton matériel, le contexte, ce qui explique la séance. Ne mets pas de données de santé.</p>
      <p class="asc-note" id="appeal-error" role="alert" tabindex="-1" data-appeal-error hidden></p>
      <div class="asc-row-flex"><button type="submit" class="asc-btn asc-btn-primary">Envoyer le recours</button><button type="button" class="asc-btn asc-btn-ghost" data-appeal-cancel>Annuler</button></div>
    </form>`;
  }

  async function load() {
    loadedOnce = true;
    const run = ++token;
    const ctx = context();
    const el = root();
    if (!el) return false;
    if (isGuest(ctx.owner) || !ctx.client) {
      show('<p class="asc-note" role="status">Connecte-toi pour contester une décision. <a href="/login">Se connecter</a></p>');
      return false;
    }
    try {
      const [state, appeals] = await withTimeout(Promise.all([ctx.client.rpc("titan_my_review_state_v1"), ctx.client.rpc("titan_my_appeals_v1")]));
      if (run !== token || !same(ctx, context())) return false;
      if (state.error || appeals.error) throw state.error || appeals.error;
      // The verification list is optional: an older server without it shows the rest of the page as before.
      let verification = null;
      try {
        const v = await withTimeout(ctx.client.rpc("titan_my_verification_requests_v1"));
        if (!v.error) verification = v.data;
      } catch {}
      if (run !== token || !same(ctx, context())) return false;
      render(state.data, appeals.data, verification);
      if (location.hash === "#verification") root()?.querySelector("#verification")?.scrollIntoView?.();
      return true;
    } catch (error) {
      if (run !== token || !same(ctx, context())) return false;
      const old = /could not find the function|PGRST202/i.test(String(error?.message || "")) || error?.code === "PGRST202";
      show(`<p class="asc-note" role="alert">${old ? "Le service de recours n’est pas encore disponible." : "Impossible de charger tes recours pour le moment."} <button type="button" class="asc-btn asc-btn-secondary" data-appeal-retry>Réessayer</button></p>`);
      return false;
    }
  }

  async function send(form) {
    if (busy) return;
    const ctx = context();
    const message = String(form.elements.message.value || "").trim();
    const error = form.querySelector("[data-appeal-error]");
    const button = form.querySelector('[type="submit"]');
    const mine = ++sendId;
    const fail = (text) => { error.textContent = text; error.hidden = false; error.focus(); };
    error.hidden = true;
    if (message.length < 10 || message.length > 500) { fail(ERRORS.MESSAGE_REQUIRED); form.elements.message.focus(); return; }
    busy = true;
    button.disabled = true;
    button.textContent = "Envoi…";
    try {
      const kind = form.dataset.kind;
      const { error: rpcError } = await withTimeout(ctx.client.rpc("titan_appeal_submit_v1", { p_kind: kind, p_session: kind === "session" ? form.dataset.session : null, p_message: message }));
      if (!same(ctx, context())) return;
      if (rpcError) throw rpcError;
      busy = false;
      if (await load() && same(ctx, context())) {
        const live = root()?.querySelector("[data-appeal-live]");
        if (live) { live.textContent = "Recours envoyé. Tu verras la réponse ici."; live.focus(); }
      }
    } catch (e) {
      if (!same(ctx, context())) return;
      fail(e && e.message === "TIMEOUT" ? "Le serveur ne répond pas. Ton texte est conservé : réessaie." : errorText(e));
      button.disabled = false;
      button.textContent = "Envoyer le recours";
    } finally {
      if (mine === sendId) busy = false;
    }
  }

  async function sendAnswer(form) {
    if (busy) return;
    const ctx = context();
    const answer = String(form.elements.answer.value || "").trim();
    const error = form.querySelector("[data-verify-error]");
    const button = form.querySelector('[type="submit"]');
    const mine = ++sendId;
    const fail = (text) => { error.textContent = text; error.hidden = false; error.focus(); };
    error.hidden = true;
    if (answer.length < 3 || answer.length > 500) { fail(ERRORS.ANSWER_REQUIRED); form.elements.answer.focus(); return; }
    busy = true;
    button.disabled = true;
    button.textContent = "Envoi…";
    try {
      const { error: rpcError } = await withTimeout(ctx.client.rpc("titan_verification_answer_v1", { p_id: Number(form.dataset.id), p_answer: answer }));
      if (!same(ctx, context())) return;
      if (rpcError) throw rpcError;
      busy = false;
      if (typeof window.titanRefreshVerificationAlert === "function") window.titanRefreshVerificationAlert();
      if (await load() && same(ctx, context())) {
        const live = root()?.querySelector("[data-appeal-live]");
        if (live) { live.textContent = "Réponse envoyée. Merci."; live.focus(); }
      }
    } catch (e) {
      if (!same(ctx, context())) return;
      fail(e && e.message === "TIMEOUT" ? "Le serveur ne répond pas. Ton texte est conservé : réessaie." : errorText(e, "La réponse n’a pas pu être envoyée. Réessaie dans un instant."));
      button.disabled = false;
      button.textContent = "Envoyer ma réponse";
    } finally {
      if (mine === sendId) busy = false;
    }
  }

  function start() {
    const el = root();
    if (!el) return;
    el.addEventListener("click", (event) => {
      const open = event.target.closest("[data-appeal-open]");
      if (open) {
        opener = open;
        const slot = el.querySelector("[data-appeal-form]");
        slot.innerHTML = formHtml(open.dataset.appealOpen, open.dataset.session);
        slot.querySelector("textarea").focus();
        return;
      }
      if (event.target.closest("[data-appeal-cancel]")) { el.querySelector("[data-appeal-form]").innerHTML = ""; if (opener && opener.isConnected) opener.focus(); return; }
      if (event.target.closest("[data-appeal-retry]")) load();
    });
    el.addEventListener("submit", (event) => {
      const answerForm = event.target.closest("[data-verify-send]");
      if (answerForm) { event.preventDefault(); sendAnswer(answerForm); return; }
      const form = event.target.closest("[data-appeal-send]");
      if (!form) return;
      event.preventDefault();
      send(form);
    });
    load();
  }

  window.addEventListener("titan:account-changing", () => { token++; sendId++; busy = false; loadedOnce = false; const el = root(); if (el) { el.innerHTML = ""; el.setAttribute("aria-busy", "true"); } });
  window.addEventListener("titan:account-changed", () => load());
  let first = true;
  window.addEventListener("titan:history-updated", () => { if (first) { first = false; if (!loadedOnce) load(); } });
  const boot = () => setTimeout(start, 0);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
