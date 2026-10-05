/* TITAN 300 — onboarding in under two minutes: your sports, your rhythm, your privacy, your first session.
   Nothing here grants XP or credits; it only stores preferences on the athlete's own state. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const SP = () => window.TitanSports;
  const D = () => window.TitanData;

  const STEPS = ["sports", "rythme", "prive", "go"];
  let step = 0;
  let picked = [];
  let target = 3;
  let analytics = false;
  let query = "";
  let limitHit = false;
  let root = null;

  const guest = () => String(window.state?.user?.id || "").startsWith("guest_");

  function progress() {
    return `<div class="ob-steps" role="progressbar" aria-valuemin="1" aria-valuemax="${STEPS.length}" aria-valuenow="${step + 1}" aria-label="Étape ${step + 1} sur ${STEPS.length}">${STEPS.map((_, i) => `<span${i <= step ? ' data-on="true"' : ""}></span>`).join("")}</div>`;
  }

  function sportsStep() {
    const results = query ? SP().search(query, { limit: 8 }) : [];
    const popular = SP().POPULAR.filter((s) => window.SPORTS_CONFIG?.[s]);
    const chips = [...new Set([...picked, ...popular])];
    return `<p class="asc-eyebrow cy">1 · Tes sports</p>
      <h1>Qu’est-ce que tu pratiques ?</h1>
      <p class="asc-lead">Choisis jusqu’à 5 sports. Ils seront en tête quand tu enregistres une séance. Tu peux en pratiquer d’autres à tout moment.</p>
      <div class="seance-search"><label class="sr-only" for="ob-q">Rechercher un sport</label><span class="seance-search-icon">${icon("search")}</span><input id="ob-q" class="asc-input" type="search" autocomplete="off" placeholder="Padel, natation, escalade…" value="${esc(query)}"></div>
      ${results.length ? `<div class="seance-chips ob-results">${results.map((r) => `<button type="button" class="seance-chip" data-pick="${esc(r.id)}" aria-pressed="${picked.includes(r.id)}">${icon(SP().FAMILY_ICON[r.family])}${esc(r.label)}</button>`).join("")}</div>` : ""}
      <div class="seance-chips">${chips.map((id) => `<button type="button" class="seance-chip" data-pick="${esc(id)}" aria-pressed="${picked.includes(id)}">${icon(SP().FAMILY_ICON[SP().familyOf(id)])}${esc(SP().label(id))}</button>`).join("")}</div>
      <p class="asc-small asc-muted" aria-live="polite">${limitHit ? "5 sports maximum : retire-en un pour en choisir un autre. " : ""}${picked.length ? `${picked.length}/5 : ${esc(picked.map((s) => SP().label(s)).join(", "))}` : "Aucun sport choisi pour l’instant."}</p>`;
  }

  function rhythmStep() {
    return `<p class="asc-eyebrow cy">2 · Ton rythme</p>
      <h1>Combien de jours actifs par semaine ?</h1>
      <p class="asc-lead">C’est ta cadence. Une semaine où tu l’atteins est une semaine tenue. Pas de série à casser : une semaine calme ne t’enlève rien.</p>
      <div class="ob-target" role="radiogroup" aria-label="Jours actifs par semaine">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<button type="button" role="radio" data-target="${n}" aria-checked="${target === n}">${n}</button>`).join("")}</div>
      <p class="asc-small asc-muted">${target <= 2 ? "Un départ solide, facile à tenir dans une semaine chargée." : target <= 4 ? "Le rythme le plus courant pour progresser durablement." : "Un rythme soutenu : pense aux jours de récupération."} Modifiable à tout moment depuis le QG.</p>`;
  }

  function privacyStep() {
    return `<p class="asc-eyebrow cy">3 · Ce qui t’appartient</p>
      <h1>Tes données restent à toi.</h1>
      <ul class="ob-promises">
        <li>${icon("lock")}<span><strong>Profil privé par défaut.</strong> Rien n’est visible des autres tant que tu ne le partages pas.</span></li>
        <li>${icon("shield")}<span><strong>Aucune progression à acheter.</strong> L’XP vient uniquement de tes séances réelles. TITAN+ ne donne que du confort et des cosmétiques.</span></li>
        <li>${icon("download")}<span><strong>Export à tout moment.</strong> Ton journal se télécharge en CSV.</span></li>
      </ul>
      <label class="auth-check"><input type="checkbox" data-analytics ${analytics ? "checked" : ""}><span>J’aide à améliorer TITAN avec des statistiques d’usage. Jamais de santé, de poids, de GPS ni de notes. <small class="asc-faint">Facultatif.</small></span></label>`;
  }

  function goStep() {
    const first = picked[0];
    return `<p class="asc-eyebrow cy">4 · C’est parti</p>
      <h1>Ta première séance débloque ta première balise.</h1>
      <p class="asc-lead">${guest() ? "Tu es en mode découverte : tes séances restent sur cet appareil et pourront rejoindre un compte plus tard." : "Ton compte est prêt."} Enregistre une séance récente, même courte : la vallée de l’Aube s’allume avec tes jours actifs.</p>
      <div class="asc-stack-sm ob-go">
        <a class="asc-btn asc-btn-primary asc-btn-block" data-finish href="/training${first ? `?sport=${encodeURIComponent(first)}` : ""}">${icon("plus")} ${first ? `Enregistrer une séance de ${esc(SP().label(first).toLowerCase())}` : "Enregistrer ma première séance"}</a>
        <a class="asc-btn asc-btn-ghost asc-btn-block" data-finish href="/aujourdhui">Découvrir mon QG d’abord</a>
      </div>`;
  }

  function render() {
    if (!root) return;
    const body = [sportsStep, rhythmStep, privacyStep, goStep][step]();
    root.innerHTML = `${progress()}<div class="ob-body">${body}</div>
      ${step < STEPS.length - 1 ? `<div class="ob-nav">${step > 0 ? `<button type="button" class="asc-btn asc-btn-ghost" data-back>${icon("chevronLeft")} Retour</button>` : '<span></span>'}<button type="button" class="asc-btn asc-btn-primary" data-next>${step === 0 && !picked.length ? "Passer" : "Continuer"}</button></div>` : step > 0 ? `<div class="ob-nav"><button type="button" class="asc-btn asc-btn-ghost" data-back>${icon("chevronLeft")} Retour</button><span></span></div>` : ""}`;
    root.querySelector("h1")?.setAttribute("tabindex", "-1");
  }

  function finish() {
    const u = window.state?.user;
    if (!u) return;
    u.favoriteSports = picked.slice(0, 5);
    u.weeklyGoalSessions = target;
    u.onboardedAt = new Date().toISOString();
    u.onboardingComplete = true; // kept by every server version
    window.TitanAnalytics?.setConsent(analytics);
    const saved = window.saveState?.({ forceCloud: true });
    window.TitanAnalytics?.track("onboarding_completed", { count: picked.length });
    return saved;
  }

  function start() {
    root = document.getElementById("onboarding");
    if (!root || !window.state?.user || !window.TitanSports) return;
    if (root.dataset.ready) return;
    // Already set up (e.g. "Commencer" clicked again from the public site): straight to the QG.
    if ((window.state.user.onboardedAt || window.state.user.onboardingComplete) && !new URLSearchParams(location.search).has("again")) return location.replace("/aujourdhui");
    root.dataset.ready = "1";
    document.querySelectorAll("[data-mark]").forEach((el) => (el.innerHTML = window.titanMark?.() || ""));
    SP().ensure();
    const u = window.state.user;
    picked = Array.isArray(u.favoriteSports) ? u.favoriteSports.filter((s) => window.SPORTS_CONFIG?.[s]).slice(0, 5) : [];
    target = Math.min(7, Math.max(1, parseInt(u.weeklyGoalSessions, 10) || 3));
    analytics = window.TitanAnalytics?.consent() === "granted";
    render();
    root.addEventListener("input", (e) => {
      if (e.target.id !== "ob-q") return;
      query = e.target.value;
      render();
      const q = document.getElementById("ob-q");
      q.focus();
      q.setSelectionRange(q.value.length, q.value.length);
    });
    root.addEventListener("change", (e) => {
      if (e.target.matches("[data-analytics]")) analytics = e.target.checked;
    });
    root.addEventListener("click", (e) => {
      const fin = e.target.closest("[data-finish]");
      if (fin) {
        e.preventDefault();
        // Local state is saved synchronously; wait for the cloud save (2.5 s at most) before leaving.
        Promise.race([Promise.resolve(finish()).catch(() => {}), new Promise((r) => setTimeout(r, 2500))]).finally(() => (location.href = fin.getAttribute("href")));
        return;
      }
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.pick) {
        const id = b.dataset.pick;
        limitHit = false;
        if (picked.includes(id)) picked = picked.filter((s) => s !== id);
        else if (picked.length < 5) picked.push(id);
        else limitHit = true;
        query = "";
        return render();
      }
      if (b.dataset.target) {
        target = Number(b.dataset.target);
        return render();
      }
      if (b.hasAttribute("data-next")) {
        step = Math.min(STEPS.length - 1, step + 1);
        render();
        root.querySelector("h1")?.focus();
        return;
      }
      if (b.hasAttribute("data-back")) {
        step = Math.max(0, step - 1);
        render();
        root.querySelector("h1")?.focus();
      }
    });
  }
  window.addEventListener("titan:history-updated", () => setTimeout(start, 0));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
