/* TITAN 300 — new password after a recovery e-mail. The recovery link opens a Supabase session in this page. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let saving = false;
  let interacted = false;
  let localError = null;
  document.querySelectorAll("[data-mark]").forEach((el) => (el.innerHTML = window.titanMark?.() || ""));
  const reveal = document.querySelector("[data-reveal]");
  reveal.innerHTML = window.titanIcon?.("eye") || "";
  reveal.addEventListener("click", () => {
    if (saving || reveal.disabled) return;
    const show = $("pw").type === "password";
    $("pw").type = $("pw2").type = show ? "text" : "password";
    reveal.setAttribute("aria-label", show ? "Masquer le mot de passe" : "Afficher le mot de passe");
  });
  const say = (text, type = "err") => {
    const m = $("pw-msg");
    m.hidden = !text;
    m.textContent = text || "";
    m.dataset.kind = type;
  };
  function clearLocalError() {
    if (!localError) return;
    const field = localError.field;
    field.removeAttribute("aria-invalid");
    const refs = (field.getAttribute("aria-describedby") || "").split(/\s+/).filter(id => id && id !== "pw-msg");
    if (refs.length) field.setAttribute("aria-describedby", refs.join(" "));
    else field.removeAttribute("aria-describedby");
    localError = null;
  }
  function invalidField(id, text) {
    clearLocalError();
    say(text);
    const field = $(id);
    localError = { field, confirmation: id === "pw2" };
    field.setAttribute("aria-invalid", "true");
    const refs = new Set((field.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
    refs.add("pw-msg");
    field.setAttribute("aria-describedby", [...refs].join(" "));
    field.focus();
  }
  for (const event of ["input", "change"]) $("pw-form").addEventListener(event, e => {
    if (saving || !localError) return;
    if (e.target !== localError.field && !(localError.confirmation && (e.target === $("pw") || e.target === $("pw2")))) return;
    clearLocalError();
    say("");
  });
  const client = () => window.titanClient || window.initTitanSupabaseClient?.();

  let ready = false;
  client()?.auth.onAuthStateChange((event, session) => {
    if (session) ready = true;
  });
  setTimeout(async () => {
    try {
      const c = client();
      if (!c) throw new Error("Auth unavailable");
      const result = await c.auth.getSession();
      if (result?.error) throw result.error;
      ready = ready || Boolean(result?.data?.session);
      if (!ready && !interacted) say("Ce lien a expiré ou a déjà servi. Demande un nouveau lien depuis « Mot de passe oublié ».");
    } catch {
      // This background diagnostic must not replace validation or an update result.
      if (!interacted) say(navigator.onLine ? "Ce lien n’a pas pu être vérifié. Vérifie ton réseau puis réessaie." : "Pas de réseau. Réessaie une fois connecté.");
    }
  }, 1200);

  $("pw-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (saving) return;
    interacted = true;
    clearLocalError();
    const pw = $("pw").value;
    if (pw.length < 8) return invalidField("pw", "Choisis un mot de passe d’au moins 8 caractères.");
    if (pw !== $("pw2").value) return invalidField("pw2", "Les deux mots de passe ne correspondent pas.");
    const c = client();
    if (!c) return say("Le service de connexion est indisponible. Vérifie ton réseau puis réessaie.");
    const form = $("pw-form");
    const btn = $("pw-save");
    saving = true;
    const controls = new Map();
    form.querySelectorAll("input, button").forEach(control => {
      controls.set(control, control.disabled);
      control.disabled = true;
    });
    const busy = form.getAttribute("aria-busy");
    form.setAttribute("aria-busy", "true");
    const notice = document.createElement("p");
    notice.className = "asc-small asc-muted";
    notice.setAttribute("role", "status");
    notice.textContent = "Enregistrement en cours…";
    form.after(notice);
    say("");
    let success = false;
    try {
      const { error } = await c.auth.updateUser({ password: pw });
      if (error) throw error;
      success = true;
      say("Mot de passe enregistré. Direction ton QG…", "ok");
      setTimeout(() => location.replace("/aujourdhui"), 1200);
    } catch (err) {
      const m = String(err?.message || "");
      say(/same|different/i.test(m) ? "Choisis un mot de passe différent de l’ancien." : /session|expired|jwt/i.test(m) ? "Ce lien a expiré. Demande un nouveau lien depuis « Mot de passe oublié »." : navigator.onLine ? "Le mot de passe n’a pas pu être enregistré. Réessaie." : "Pas de réseau. Réessaie une fois connecté.");
    } finally {
      notice.remove();
      if (busy === null) form.removeAttribute("aria-busy");
      else form.setAttribute("aria-busy", busy);
      // Success stays reserved until navigation; a failure restores the draft and retry.
      if (!success) {
        saving = false;
        controls.forEach((disabled, control) => { control.disabled = disabled; });
        if (!btn.disabled && document.activeElement === document.body) btn.focus();
      }
    }
  });
})();
