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
  };
  const STATUS = { open: "En cours d’examen", accepted: "Accepté", declined: "Refusé" };
  const TIMEOUT_MS = 8000;
  const root = () => document.getElementById("recours");
  let token = 0;
  let busy = false;

  const context = () => ({ owner: window.state?.user?.id, client: window.titanClient, epoch: window.titanAccountTransition?.epoch });
  const same = (a, b) => !!a.owner && a.owner === b.owner && a.client === b.client && a.epoch === b.epoch;
  const isGuest = (id) => !id || String(id).startsWith("guest_");
  const errorText = (error) => {
    const message = String((error && error.message) || error || "");
    const code = Object.keys(ERRORS).find((key) => message.includes(key));
    return code ? ERRORS[code] : "Le recours n’a pas pu être envoyé. Réessaie dans un instant.";
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

  function render(state, appeals) {
    const sessions = Array.isArray(state?.excludedSessions) ? state.excludedSessions : [];
    const list = Array.isArray(appeals?.appeals) ? appeals.appeals : [];
    const suspended = !!state?.account?.suspended;
    const hasOpenAccount = list.some((a) => a.kind === "account" && a.status === "open");
    let html = '<p class="asc-note">Une séance peut être mise à l’écart des classements et des défis le temps d’une vérification, et ton compte peut être suspendu. Si tu penses que c’est une erreur, explique-le ici : une personne de l’équipe relit ta demande et te répond. Rien n’est supprimé et aucune décision n’est automatique.</p>';
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
    html += "</section>";
    show(html);
  }

  function formHtml(kind, session) {
    return `<form class="asc-form" data-appeal-send data-kind="${esc(kind)}" data-session="${esc(session || "")}" novalidate>
      <h2>${kind === "session" ? "Contester cette séance" : "Contester la suspension"}</h2>
      <label for="appeal-message">Ce qui s’est passé (10 à 500 caractères)</label>
      <textarea id="appeal-message" name="message" rows="5" maxlength="500" required aria-describedby="appeal-help"></textarea>
      <p id="appeal-help" class="asc-note">Reste factuel : ton matériel, le contexte, ce qui explique la séance. Ne mets pas de données de santé.</p>
      <p class="asc-note" role="alert" data-appeal-error hidden></p>
      <div class="asc-row-flex"><button type="submit" class="asc-btn asc-btn-primary">Envoyer le recours</button><button type="button" class="asc-btn asc-btn-ghost" data-appeal-cancel>Annuler</button></div>
    </form>`;
  }

  async function load() {
    const run = ++token;
    const ctx = context();
    const el = root();
    if (!el) return;
    if (isGuest(ctx.owner) || !ctx.client) {
      show('<p class="asc-note" role="status">Connecte-toi pour contester une décision. <a href="/login">Se connecter</a></p>');
      return;
    }
    try {
      const [state, appeals] = await withTimeout(Promise.all([ctx.client.rpc("titan_my_review_state_v1"), ctx.client.rpc("titan_my_appeals_v1")]));
      if (run !== token || !same(ctx, context())) return;
      if (state.error || appeals.error) throw state.error || appeals.error;
      render(state.data, appeals.data);
    } catch (error) {
      if (run !== token || !same(ctx, context())) return;
      const old = /could not find the function|PGRST202/i.test(String(error?.message || "")) || error?.code === "PGRST202";
      show(`<p class="asc-note" role="alert">${old ? "Le service de recours n’est pas encore disponible." : "Impossible de charger tes recours pour le moment."} <button type="button" class="asc-btn asc-btn-secondary" data-appeal-retry>Réessayer</button></p>`);
    }
  }

  async function send(form) {
    if (busy) return;
    const ctx = context();
    const message = String(form.elements.message.value || "").trim();
    const error = form.querySelector("[data-appeal-error]");
    const button = form.querySelector('[type="submit"]');
    const fail = (text) => { error.textContent = text; error.hidden = false; };
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
      await load();
      const live = root();
      if (live) live.insertAdjacentHTML("afterbegin", '<p class="asc-note" role="status">Recours envoyé. Tu verras la réponse ici.</p>');
    } catch (e) {
      if (!same(ctx, context())) return;
      fail(e && e.message === "TIMEOUT" ? "Le serveur ne répond pas. Ton texte est conservé : réessaie." : errorText(e));
      button.disabled = false;
      button.textContent = "Envoyer le recours";
    } finally {
      busy = false;
    }
  }

  function start() {
    const el = root();
    if (!el) return;
    el.addEventListener("click", (event) => {
      const open = event.target.closest("[data-appeal-open]");
      if (open) {
        const slot = el.querySelector("[data-appeal-form]");
        slot.innerHTML = formHtml(open.dataset.appealOpen, open.dataset.session);
        slot.querySelector("textarea").focus();
        return;
      }
      if (event.target.closest("[data-appeal-cancel]")) { el.querySelector("[data-appeal-form]").innerHTML = ""; return; }
      if (event.target.closest("[data-appeal-retry]")) load();
    });
    el.addEventListener("submit", (event) => {
      const form = event.target.closest("[data-appeal-send]");
      if (!form) return;
      event.preventDefault();
      send(form);
    });
    load();
  }

  window.addEventListener("titan:account-changing", () => { token++; busy = false; const el = root(); if (el) { el.innerHTML = ""; el.setAttribute("aria-busy", "true"); } });
  window.addEventListener("titan:account-changed", () => load());
  let first = true;
  window.addEventListener("titan:history-updated", () => { if (first) { first = false; load(); } });
  const boot = () => setTimeout(start, 0);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
