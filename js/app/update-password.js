/* TITAN 300 — new password after a recovery e-mail. The recovery link opens a Supabase session in this page. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  document.querySelectorAll("[data-mark]").forEach((el) => (el.innerHTML = window.titanMark?.() || ""));
  const reveal = document.querySelector("[data-reveal]");
  reveal.innerHTML = window.titanIcon?.("eye") || "";
  reveal.addEventListener("click", () => {
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
  const client = () => window.titanClient || window.initTitanSupabaseClient?.();

  let ready = false;
  client()?.auth.onAuthStateChange((event, session) => {
    if (session) ready = true;
  });
  setTimeout(async () => {
    const s = (await client()?.auth.getSession())?.data?.session;
    ready = ready || Boolean(s);
    if (!ready) say("Ce lien a expiré ou a déjà servi. Demande un nouveau lien depuis « Mot de passe oublié ».");
  }, 1200);

  $("pw-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = $("pw").value;
    if (pw.length < 8) return say("Choisis un mot de passe d’au moins 8 caractères."), $("pw").focus();
    if (pw !== $("pw2").value) return say("Les deux mots de passe ne correspondent pas."), $("pw2").focus();
    const btn = $("pw-save");
    btn.disabled = true;
    say("");
    try {
      const { error } = await client().auth.updateUser({ password: pw });
      if (error) throw error;
      say("Mot de passe enregistré. Direction ton QG…", "ok");
      setTimeout(() => location.replace("/aujourdhui"), 1200);
    } catch (err) {
      const m = String(err?.message || "");
      say(/same|different/i.test(m) ? "Choisis un mot de passe différent de l’ancien." : /session|expired|jwt/i.test(m) ? "Ce lien a expiré. Demande un nouveau lien depuis « Mot de passe oublié »." : navigator.onLine ? "Le mot de passe n’a pas pu être enregistré. Réessaie." : "Pas de réseau. Réessaie une fois connecté.");
      btn.disabled = false;
    }
  });
})();
