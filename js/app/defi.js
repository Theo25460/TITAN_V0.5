/* V11-66 (COM-E2): the landing of a challenge invitation link. The link carries only a long random token, never personal data. The page
   shows the rules of the challenge (never a name), then asks the player to sign in or sign up if needed, and joins only on an explicit tap.
   Every invalid, spent, expired or revoked link gets the same plain message. Nothing is granted: no XP, no credit. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const root = () => document.getElementById("defi");
  const METRICS = { effort_minutes: "minutes d’effort", active_days: "jours actifs", sessions: "séances", distance_km: "km" };
  const ERRORS = {
    LINK_INVALID: "Ce lien n’est plus valable : il a déjà servi, il a expiré ou il a été retiré. Demande-en un nouveau à ton ami.",
    LINK_OWN_CHALLENGE: "C’est ton propre défi : partage ce lien à un ami.",
    CHALLENGE_FULL: "Ce défi est complet.",
    ACCOUNT_SUSPENDED: "Ton compte est suspendu : tu ne peux pas rejoindre de défi.",
    SOCIAL_RATE_LIMIT: "Beaucoup d’actions en peu de temps. Réessaie plus tard.",
  };
  const token = new URLSearchParams(location.search).get("t") || "";
  const valid = /^[0-9a-f]{64}$/.test(token);
  let busy = false;

  const show = (html) => { const el = root(); if (!el) return; el.innerHTML = html; el.setAttribute("aria-busy", "false"); };
  const invalid = (message = ERRORS.LINK_INVALID) => show(`<div class="asc-empty" data-defi-invalid><h2>Lien indisponible</h2><p>${esc(message)}</p><a class="asc-btn asc-btn-secondary" href="/aujourdhui">Aller au QG</a></div>`);
  const signedIn = () => { const id = window.state?.user?.id; return !!id && !String(id).startsWith("guest_"); };
  const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); };
  const next = () => encodeURIComponent(`/defi?t=${token}`);

  function render(p) {
    const metric = METRICS[p.metric] || p.metric;
    const sport = p.sport ? ` en ${esc(window.TitanSports?.label?.(p.sport) || p.sport)}` : "";
    const actions = signedIn()
      ? `<button type="button" class="asc-btn asc-btn-primary" data-defi-join>Rejoindre le défi</button>`
      : `<p class="asc-small asc-muted">Pour rejoindre, connecte-toi ou crée un compte : tu reviendras ici ensuite.</p>
         <div class="asc-row"><a class="asc-btn asc-btn-primary" href="/login?next=${next()}" data-defi-login>Se connecter</a><a class="asc-btn asc-btn-secondary" href="/login?mode=signup&next=${next()}" data-defi-signup>Créer un compte</a></div>`;
    show(`<section class="asc-panel qg-steps-card" data-defi-card><p class="asc-eyebrow">Défi entre amis</p><h2>${esc(p.title)}</h2>
      <p>Atteindre <strong>${esc(window.TitanFormat.number(p.target))} ${esc(metric)}</strong>${sport}, avant le <strong>${esc(when(p.endsAt))}</strong>.</p>
      <p class="asc-small asc-muted">${Number(p.participants) > 1 ? `${Number(p.participants)} participants déjà.` : "Un participant pour l’instant."} Sans mise : ni XP ni crédit à gagner, le plaisir de se défier.</p>
      <p class="asc-small asc-faint">En rejoignant, ton nom d’utilisateur et ta progression sur ce défi sont visibles des participants. Rien d’autre. Tu peux quitter le défi à tout moment.</p>
      ${actions}<p class="asc-small" role="status" data-defi-notice hidden></p></section>`);
  }

  async function join() {
    if (busy) return;
    busy = true;
    const notice = document.querySelector("[data-defi-notice]");
    const button = document.querySelector("[data-defi-join]");
    if (button) button.disabled = true;
    try {
      const client = window.titanClient || (await window.waitForTitanSupabase?.(8000));
      const { error } = await client.rpc("titan_challenge_link_accept_v1", { p_token: token });
      if (error) {
        const code = Object.keys(ERRORS).find((k) => String(error.message || "").includes(k));
        if (code === "LINK_INVALID") return invalid();
        if (notice) { notice.hidden = false; notice.textContent = code ? ERRORS[code] : "Impossible pour l’instant. Réessaie dans un moment."; }
        if (button) button.disabled = false;
        return;
      }
      window.titanShell?.toast?.({ type: "ok", title: "Défi rejoint", message: "Il t’attend dans la Communauté." });
      location.assign("/social#defis");
    } catch {
      if (notice) { notice.hidden = false; notice.textContent = "Impossible pour l’instant. Réessaie dans un moment."; }
      if (button) button.disabled = false;
    } finally { busy = false; }
  }

  async function boot() {
    if (!root()) return;
    if (!valid) return invalid();
    try {
      const client = window.titanClient || (await window.waitForTitanSupabase?.(8000));
      if (!client) return invalid("Le serveur ne répond pas. Réessaie dans un moment.");
      const { data, error } = await client.rpc("titan_challenge_link_preview_v1", { p_token: token });
      if (error || !data || data.valid !== true) return invalid();
      render(data);
    } catch {
      invalid("Le serveur ne répond pas. Réessaie dans un moment.");
    }
  }
  document.addEventListener("click", (e) => { if (e.target.closest?.("[data-defi-join]")) join(); });
  window.addEventListener("titan:account-changed", () => { if (valid && root() && document.querySelector("[data-defi-card]")) boot(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
