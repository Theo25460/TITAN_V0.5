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

  const icon = (n) => window.titanIcon(n);
  const show = (html) => { const el = root(); if (!el) return; el.innerHTML = html; el.setAttribute("aria-busy", "false"); };
  const invalid = (message = ERRORS.LINK_INVALID) => show(`<div class="sig-empty df-invalid" data-defi-invalid>${icon("link")}<h2>Lien indisponible</h2><p>${esc(message)}</p><a class="asc-btn asc-btn-secondary" href="/aujourdhui">Aller au QG</a></div>`);
  const signedIn = () => { const id = window.state?.user?.id; return !!id && !String(id).startsWith("guest_"); };
  const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); };
  const next = () => encodeURIComponent(`/defi?t=${token}`);
  const heading = (text) => { const h = document.querySelector(".asc-page-head h1"); if (h) h.textContent = text; };
  /* Each route of the Grande Cordée crosses one world of the Adventure: its painting is the first thing a guest sees. */
  const VIEW = { aube: "valley", marees: "archipelago", forge: "forge", aurores: "aurora" };

  /* What the page asks of whoever opened the link: join on a tap when signed in; otherwise an account first, then back here. */
  const actionsHtml = (label) => signedIn()
    ? `<div class="asc-actions df-actions"><button type="button" class="asc-btn asc-btn-primary" data-defi-join>${label}</button></div>`
    : `<div class="df-actions"><div class="asc-actions"><a class="asc-btn asc-btn-primary" href="/login?mode=signup&next=${next()}" data-defi-signup>Créer un compte</a><a class="asc-btn asc-btn-secondary" href="/login?next=${next()}" data-defi-login>Se connecter</a></div>
        <p class="asc-small asc-muted">Pour rejoindre, connecte-toi ou crée un compte : tu reviendras ici ensuite. Ouvrir cette page ne t’engage à rien.</p></div>`;
  const privacyHtml = (text) => `<p class="cm-privacy">${icon("eye")}<span><strong>Ce que les autres verront :</strong> ${text}</span></p>`;

  /* Social lot C: a Grande Cordée link says what it is — a common goal across sports — still without any name. */
  function renderCordee(p) {
    const C = window.TitanCordee;
    const route = C?.ROUTES?.[p.route];
    const pace = C?.PACES?.[p.pace];
    const view = VIEW[p.route];
    heading("Une cordée t’attend");
    show(`<article class="sig-plate df-card" data-defi-card data-defi-cordee>
      ${view ? `<div class="cm-cordee-view"><img src="/assets/renaissance/${view}-small.webp" srcset="/assets/renaissance/${view}-xs.webp 480w, /assets/renaissance/${view}-small.webp 800w" sizes="(min-width: 960px) 720px, 100vw" alt="" width="800" height="450" decoding="async"></div>` : ""}
      <div class="df-top${view ? " is-over" : ""}"><p class="asc-eyebrow">Grande Cordée · invitation</p><h2>${esc(p.title)}</h2>
        ${route ? `<p class="cm-cordee-intro">${esc(route.intro)}</p>` : ""}</div>
      <div class="df-body">
        <p class="df-goal">Un objectif commun, chacun avec son sport : <strong>${esc(window.TitanFormat.number(p.target))} longueurs</strong> par membre${pace ? ` (allure ${esc(pace.label.toLowerCase())})` : ""}, avant le <strong>${esc(when(p.endsAt))}</strong>.</p>
        <ul class="df-facts">
          <li>${icon("group")}<span>${Number(p.participants) > 1 ? `${Number(p.participants)} membres déjà.` : "Un membre pour l’instant."} Personne n’atteint le sommet seul.</span></li>
          <li>${icon("clock")}<span>Un jour avec 12 minutes d’effort confirmé apporte une longueur, 35 minutes deux. Chaque nouvelle famille de sport ouvre des longueurs en plus.</span></li>
          <li>${icon("medal")}<span>Ni XP ni crédit : un titre au sommet. Tu peux quitter à tout moment.</span></li>
        </ul>
        ${route ? `<ol class="cm-cordee-camps df-camps" aria-label="Les quatre camps de la route" style="--pn:0"><li class="cm-cordee-start" aria-hidden="true"><span class="cm-cordee-camp-dot"></span><span class="cm-cordee-camp-text"><small>Départ</small></span></li>${route.camps.map(([name], i) => `<li data-reached="false"${i === 3 ? ' data-summit="true"' : ""}><span class="cm-cordee-camp-dot" aria-hidden="true">${i === 3 ? icon("flag") : i + 1}</span><span class="cm-cordee-camp-text"><strong>${esc(name)}</strong><small>${i === 3 ? "Sommet" : `Camp à ${(i + 1) * 25} %`}</small></span></li>`).join("")}</ol>` : ""}
        ${privacyHtml("En rejoignant, ton pseudo et tes longueurs sont visibles des membres qui sont tes amis et de la personne qui t’a invité ; les autres voient « Membre de la cordée ».")}
        ${actionsHtml("S’encorder")}<p class="asc-small df-notice" role="status" data-defi-notice hidden></p>
      </div></article>`);
  }

  function render(p) {
    if (p.kind === "cordee") return renderCordee(p);
    const metric = METRICS[p.metric] || p.metric;
    const sport = p.sport ? ` en ${esc(window.TitanSports?.label?.(p.sport) || p.sport)}` : "";
    heading("Un défi t’attend");
    show(`<article class="sig-plate is-relief df-card" data-defi-card>
      <div class="df-top"><p class="asc-eyebrow">Défi entre amis · invitation</p><h2>${esc(p.title)}</h2></div>
      <div class="df-body">
        <p class="df-goal">Atteindre <strong>${esc(window.TitanFormat.number(p.target))} ${esc(metric)}</strong>${sport}, avant le <strong>${esc(when(p.endsAt))}</strong>.</p>
        <ul class="df-facts">
          <li>${icon("group")}<span>${Number(p.participants) > 1 ? `${Number(p.participants)} participants déjà.` : "Un participant pour l’instant."}</span></li>
          <li>${icon("heart")}<span>Sans mise : ni XP ni crédit à gagner, le plaisir de se défier.</span></li>
          <li>${icon("clock")}<span>Effort plafonné à 90 min par jour ; seules les séances ajoutées après ton arrivée comptent. Tu peux quitter le défi à tout moment.</span></li>
        </ul>
        ${privacyHtml("En rejoignant, ton nom d’utilisateur et ta progression sur ce défi sont visibles des participants. Rien d’autre.")}
        ${actionsHtml("Rejoindre le défi")}<p class="asc-small df-notice" role="status" data-defi-notice hidden></p>
      </div></article>`);
  }

  async function join() {
    if (busy) return;
    busy = true;
    const notice = document.querySelector("[data-defi-notice]");
    const button = document.querySelector("[data-defi-join]");
    const label = button?.textContent || "";
    const release = () => { if (button) { button.disabled = false; button.removeAttribute("aria-busy"); button.textContent = label; } };
    if (button) { button.disabled = true; button.setAttribute("aria-busy", "true"); button.textContent = "Un instant…"; }
    if (notice) notice.hidden = true;
    try {
      const client = window.titanClient || (await window.waitForTitanSupabase?.(8000));
      const { error } = await client.rpc("titan_challenge_link_accept_v1", { p_token: token });
      if (error) {
        const code = Object.keys(ERRORS).find((k) => String(error.message || "").includes(k));
        if (code === "LINK_INVALID") return invalid();
        if (notice) { notice.hidden = false; notice.textContent = code ? ERRORS[code] : "Impossible pour l’instant. Réessaie dans un moment."; }
        release();
        return;
      }
      const cordee = !!document.querySelector("[data-defi-cordee]");
      window.titanShell?.toast?.({ type: "ok", title: cordee ? "Tu es encordé" : "Défi rejoint", message: "Il t’attend dans la Communauté." });
      location.assign(cordee ? "/social#cordee" : "/social#defis");
    } catch {
      if (notice) { notice.hidden = false; notice.textContent = "Impossible pour l’instant. Réessaie dans un moment."; }
      release();
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
