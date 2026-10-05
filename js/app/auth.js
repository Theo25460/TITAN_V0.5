/* TITAN 300 — sign in, create an account, recover access, or try without an account.
   The profile row is created by the server (auth trigger); the browser never sets XP, level or credits. */
(function () {
  "use strict";
  const SITE = "https://titan-app.fr";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const icon = (n) => window.titanIcon(n);
  const $ = (s) => document.querySelector(s);
  class UserError extends Error {}
  let mode = new URLSearchParams(location.search).get("mode") === "signup" ? "signup" : "signin";
  let busy = false;
  let lastEmail = "";

  const client = () => window.titanClient || window.initTitanSupabaseClient?.();

  function nextUrl(fallback = "/aujourdhui") {
    const requested = new URLSearchParams(location.search).get("next");
    if (!requested) return fallback;
    try {
      const t = new URL(requested, location.origin);
      return t.origin === location.origin && !t.pathname.startsWith("//") ? t.pathname + t.search + t.hash : fallback;
    } catch {
      return fallback;
    }
  }

  const MESSAGES = [
    [/invalid login|invalid credentials/i, "E-mail ou mot de passe incorrect."],
    [/email not confirmed/i, "Confirme d’abord ton adresse : le lien est dans l’e-mail de bienvenue."],
    [/already registered|already exists/i, "Un compte existe déjà avec cet e-mail. Connecte-toi ou réinitialise ton mot de passe."],
    [/password.*(6|8)|weak password/i, "Choisis un mot de passe d’au moins 8 caractères."],
    [/rate limit|too many/i, "Trop de tentatives. Patiente une minute avant de réessayer."],
    [/fetch|network|failed to/i, "Connexion impossible. Vérifie ton réseau puis réessaie."],
  ];
  const human = (e) => MESSAGES.find(([re]) => re.test(String(e?.message || e)))?.[1] || "Action impossible pour le moment. Réessaie dans un instant.";

  function view() {
    const signup = mode === "signup";
    return `
      <div class="auth-tabs asc-seg" role="tablist" aria-label="Connexion ou inscription">
        <button type="button" role="tab" data-mode="signin" aria-selected="${!signup}">Se connecter</button>
        <button type="button" role="tab" data-mode="signup" aria-selected="${signup}">Créer un compte</button>
      </div>
      <form id="auth-form" class="asc-stack" novalidate>
        ${signup ? `<label class="asc-field"><span>Nom affiché</span><input class="asc-input" name="name" autocomplete="nickname" maxlength="24" minlength="2" required placeholder="Ton prénom ou un pseudo"><small>Visible seulement si tu partages quelque chose. Ton profil est privé par défaut.</small></label>` : ""}
        <label class="asc-field"><span>E-mail</span><input class="asc-input" name="email" type="email" autocomplete="email" inputmode="email" required value="${esc(lastEmail)}"></label>
        <label class="asc-field"><span>Mot de passe</span><span class="auth-pass"><input class="asc-input" name="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" minlength="${signup ? 8 : 1}" required><button type="button" class="asc-btn asc-btn-ghost asc-btn-icon" data-reveal aria-label="Afficher le mot de passe">${icon("eye")}</button></span>${signup ? "<small>8 caractères minimum. Une phrase courte est plus sûre qu’un mot compliqué.</small>" : ""}</label>
        ${
          signup
            ? `<label class="auth-check"><input type="checkbox" name="terms" required><span>J’accepte les <a href="/legal_cgu" target="_blank" rel="noopener">conditions d’utilisation</a> et la <a href="/legal_privacy" target="_blank" rel="noopener">politique de confidentialité</a>.</span></label>
               <label class="auth-check"><input type="checkbox" name="analytics"><span>J’aide à améliorer TITAN avec des statistiques d’usage. Jamais de santé, de poids, de GPS ni de notes. <small class="asc-faint">Facultatif, modifiable à tout moment.</small></span></label>`
            : ""
        }
        <p class="auth-msg" role="alert" aria-live="assertive"></p>
        <button type="submit" class="asc-btn asc-btn-primary asc-btn-block auth-submit">${signup ? "Créer mon compte" : "Se connecter"}</button>
        ${signup ? "" : `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm auth-forgot" data-forgot>Mot de passe oublié ?</button>`}
      </form>
      <div class="auth-or"><span>ou</span></div>
      <button type="button" class="asc-btn asc-btn-secondary asc-btn-block" data-guest>${icon("offline")} Essayer sans compte</button>
      <p class="asc-small asc-faint auth-guest-note">Mode découverte : tes séances restent sur cet appareil. Tu pourras les rattacher à un compte plus tard.</p>`;
  }

  function render() {
    $("#auth").innerHTML = view();
    $("#auth-title").textContent = mode === "signup" ? "Commence ton ascension." : "Content de te revoir.";
  }

  function message(text, kind = "err") {
    const el = $(".auth-msg");
    if (!el) return;
    el.textContent = text;
    el.dataset.kind = kind;
  }

  function sent(email, kind) {
    $("#auth").innerHTML = `<div class="asc-stack auth-sent">
      <span class="auth-sent-icon">${icon("send")}</span>
      <h2 class="asc-h3">${kind === "reset" ? "Lien envoyé" : "Vérifie ta boîte mail"}</h2>
      <p>${kind === "reset" ? "Si un compte existe pour" : "Un lien de confirmation part vers"} <strong>${esc(email)}</strong>. ${kind === "reset" ? "Il te permettra de choisir un nouveau mot de passe." : "Ouvre-le sur cet appareil pour activer ton compte."}</p>
      <p class="asc-small asc-muted">Rien reçu après quelques minutes ? Regarde dans les indésirables.</p>
      ${kind === "signup" ? `<button type="button" class="asc-btn asc-btn-secondary" data-resend="${esc(email)}">Renvoyer l’e-mail</button>` : ""}
      <button type="button" class="asc-btn asc-btn-ghost" data-mode="signin">Retour à la connexion</button>
      <p class="auth-msg" role="alert"></p></div>`;
  }

  async function submit(form) {
    if (busy) return;
    const fd = new FormData(form);
    const email = String(fd.get("email") || "").trim().toLowerCase();
    const password = String(fd.get("password") || "");
    lastEmail = email;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return message("Indique une adresse e-mail valide.");
    const c = client();
    if (!c) return message("Le service de connexion est indisponible. Vérifie ton réseau puis réessaie.");
    busy = true;
    const btn = form.querySelector(".auth-submit");
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    try {
      if (mode === "signin") {
        if (!password) throw new UserError("Indique ton mot de passe.");
        const { error } = await c.auth.signInWithPassword({ email, password });
        if (error) throw error;
        location.href = nextUrl();
        return;
      }
      const name = String(fd.get("name") || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
      if (name.length < 2) throw new UserError("Choisis un nom de 2 caractères minimum.");
      if (password.length < 8) throw new UserError("Choisis un mot de passe d’au moins 8 caractères.");
      if (!fd.get("terms")) throw new UserError("Accepte les conditions pour créer ton compte.");
      window.TitanAnalytics?.setConsent(Boolean(fd.get("analytics")));
      const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: `${SITE}/onboarding`, data: { full_name: name, username: name } } });
      if (error) throw error;
      window.TitanAnalytics?.track("signup");
      if (data?.session) {
        location.href = "/onboarding";
        return;
      }
      sent(email, "signup");
    } catch (error) {
      message(error instanceof UserError ? error.message : human(error));
    } finally {
      busy = false;
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
    }
  }

  async function forgot() {
    const email = String(document.querySelector("[name=email]")?.value || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return message("Indique ton e-mail ci-dessus, puis touche « Mot de passe oublié ? ».");
    const c = client();
    if (!c) return message("Le service de connexion est indisponible.");
    try {
      const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: `${SITE}/update-password` });
      if (error) throw error;
      sent(email, "reset");
    } catch (error) {
      message(human(error));
    }
  }

  async function guest() {
    try {
      await client()?.auth.signOut({ scope: "local" });
    } catch {}
    try {
      // Discovery keeps its stable device id: earlier local sessions come back.
      sessionStorage.setItem("titan_enter_discovery", "1");
    } catch {}
    location.href = "/onboarding";
  }

  document.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.mode) {
      mode = b.dataset.mode;
      render();
      document.querySelector("[name=" + (mode === "signup" ? "name" : "email") + "]")?.focus();
      return;
    }
    if (b.hasAttribute("data-reveal")) {
      const input = b.parentElement.querySelector("input");
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      b.setAttribute("aria-label", show ? "Masquer le mot de passe" : "Afficher le mot de passe");
      b.innerHTML = icon(show ? "eyeOff" : "eye");
      return;
    }
    if (b.hasAttribute("data-forgot")) return forgot();
    if (b.hasAttribute("data-guest")) return guest();
    if (b.dataset.resend) {
      b.disabled = true;
      try {
        const { error } = await client().auth.resend({ type: "signup", email: b.dataset.resend, options: { emailRedirectTo: `${SITE}/onboarding` } });
        if (error) throw error;
        message("E-mail renvoyé.", "ok");
      } catch (error) {
        message(human(error));
      } finally {
        setTimeout(() => (b.disabled = false), 30000);
      }
    }
  });
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "auth-form") return;
    e.preventDefault();
    submit(e.target);
  });

  async function boot() {
    for (const id of ["auth-mark", "auth-mark-m"]) {
      const el = document.getElementById(id);
      if (el && window.titanMark) el.innerHTML = window.titanMark();
    }
    render();
    // Already signed in: go straight on.
    try {
      const session = (await client()?.auth.getSession())?.data?.session;
      if (session?.user) {
        $("#auth").insertAdjacentHTML("afterbegin", `<p class="asc-note">${icon("check")}<span>Tu es déjà connecté. <a href="${esc(nextUrl())}">Continuer</a></span></p>`);
      }
    } catch {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
