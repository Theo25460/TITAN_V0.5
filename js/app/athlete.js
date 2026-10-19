/* TITAN 300 — public athlete card (/u/<link>). Readable without an account; shows only what the athlete
   chose in Profil > Profil public. The server never returns notes, health, weight, GPS or session dates. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const F = () => window.TitanFormat;
  const SP = () => window.TitanSports;
  const P = () => window.TitanProgress;
  const E = () => window.TitanEffort;
  const AVATARS = ["scout", "ranger", "keeper", "artisan", "navigator", "sentinel"];
  const FRAME = /^frame-[a-z]+$/;

  const slug = () => {
    const m = location.pathname.match(/^\/u\/([a-z0-9]{10})\/?$/i);
    return (m ? m[1] : new URLSearchParams(location.search).get("c") || "").toLowerCase();
  };

  function missing(root, offline, notYet, temporary = false) {
    root.innerHTML = `<section class="asc-hero ap-hero"><p class="asc-eyebrow">Carte d’athlète</p><h1 class="cm-exp-title">${offline ? "Pas de réseau." : notYet ? "Les cartes d’athlète arrivent bientôt." : temporary ? "Carte temporairement indisponible." : "Cette carte n’est pas disponible."}</h1>
      <p class="asc-lead">${offline ? "La carte s’affichera dès que la connexion revient." : notYet ? "Elles seront disponibles avec la prochaine mise à jour du serveur." : temporary ? "Le serveur n’a pas répondu correctement. Tu peux réessayer." : "Le lien est peut-être ancien, ou son auteur a choisi de ne plus la montrer."}</p>
      <div class="asc-row-flex">${offline || temporary ? '<button type="button" id="athlete-retry" class="asc-btn asc-btn-primary">Réessayer</button>' : ""}<a class="asc-btn asc-btn-primary" href="/">Découvrir TITAN</a></div></section>`;
    root.setAttribute("aria-busy", "false");
  }

  function render(root, c) {
    const avatar = AVATARS.includes(c.avatar) ? c.avatar : "scout";
    const frame = FRAME.test(c.appearance?.frame || "") ? c.appearance.frame : "";
    const rank = c.level ? E().rank(c.level) : null;
    const since = c.member_since ? new Date(`${c.member_since}-01T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : "";
    const sports = (c.sports || []).map((s) => {
      const hours = (Number(s.minutes) || 0) / 60;
      const m = P().masteryLevel(hours, Number(s.weeks) || 0);
      return { ...s, hours, mastery: m, family: SP().familyOf(s.sport) };
    });
    document.title = `${c.name} — carte d’athlète TITAN`;
    root.innerHTML = `
      <section class="asc-hero ap-hero">
        <div class="pf-id"><span class="pf-avatar"${frame ? ` data-frame="${esc(frame)}"` : ""}><img src="/assets/renaissance/${avatar}-s.webp" alt="" width="128" height="128"></span>
          <div>${rank ? `<p class="asc-eyebrow cy">${esc(rank.name)} · niveau ${esc(c.level)}</p>` : `<p class="asc-eyebrow cy">Athlète TITAN</p>`}<h1 class="pf-name">${esc(c.name)}</h1>${since ? `<p class="asc-small asc-muted">Sur TITAN depuis ${esc(since)}</p>` : ""}</div></div>
        ${c.totals ? `<dl class="wk-stats ap-totals"><div><dt>Séances</dt><dd class="asc-num">${F().number(c.totals.sessions)}</dd></div><div><dt>Temps</dt><dd class="asc-num">${esc(F().hours(c.totals.minutes))}</dd></div><div><dt>Semaines actives</dt><dd class="asc-num">${F().number(c.totals.weeks)}</dd></div></dl>` : ""}
      </section>
      ${sports.length ? `<section class="asc-section"><div class="asc-section-head"><h2>Sports et maîtrise</h2></div><div class="pf-mastery">${sports
        .map(
          (s) => `<div class="pf-mastery-row" data-family="${esc(s.family)}"><span class="jr-icon">${icon(SP().FAMILY_ICON[s.family])}</span>
          <span class="pf-mastery-main"><span class="asc-between"><strong>${esc(SP().label(s.sport))}</strong><span class="asc-small">${esc(s.mastery.name)} · ${s.mastery.level}/10</span></span>
          <span class="asc-ascent thin"><span style="--p:${Math.round(((s.mastery.level - 1 + s.mastery.progress) / 10) * 100)}%"></span></span>
          <span class="asc-small asc-muted">${esc(F().hours(s.minutes))} · ${F().number(s.sessions)} séance${s.sessions > 1 ? "s" : ""} · ${F().number(s.weeks)} semaine${s.weeks > 1 ? "s" : ""}</span></span></div>`,
        )
        .join("")}</div></section>` : ""}
      ${c.titles ? `<section class="asc-section"><div class="asc-section-head"><h2>Distinctions</h2></div><ul class="pf-chips">${c.titles.map((t) => `<li>${icon("mountain")} ${esc(t.title)} <small class="asc-faint">· ${esc(t.expedition)}</small></li>`).join("")}${c.insignia ? `<li>${icon("compass")} ${F().number(c.insignia)} insigne${c.insignia > 1 ? "s" : ""} d’aventure</li>` : ""}</ul>${!c.titles.length && !c.insignia ? `<p class="asc-small asc-muted">Les premières distinctions arrivent avec l’aventure et les expéditions.</p>` : ""}</section>` : ""}
      <section class="ap-cta"><p class="asc-eyebrow">TITAN</p><h2 class="asc-h2">Ton sport réel, une progression longue.</h2><p class="asc-small asc-muted">Journal multisport, records, maîtrise et une aventure qui avance avec tes séances. Gratuit, sans publicité.</p><a class="asc-btn asc-btn-primary" href="/">Découvrir TITAN</a></section>
      <p class="asc-small asc-faint ap-foot">Carte publiée par son auteur, qui choisit ce qu’elle montre. Données déclarées dans TITAN ; maîtrise = heures et semaines de pratique. Un problème ? <a href="mailto:${esc(window.TITAN_EXTERNAL_URLS?.supportEmail || "titanteam.app@gmail.com")}">Signaler cette carte</a>.</p>`;
    root.setAttribute("aria-busy", "false");
  }

  function start() {
    const root = document.getElementById("athlete"), status = document.getElementById("athlete-status");
    if (!root || !status) return;
    document.querySelectorAll("[data-mark]").forEach((el) => (el.innerHTML = window.titanMark?.() || ""));
    let pending = null, sequence = 0, recoverable = false;
    function cancel() {
      sequence++;
      if (pending) { clearTimeout(pending.timer); pending.controller.abort(); pending = null; }
    }
    function unavailable(offline = false, notYet = false, temporary = false, message = "") {
      const focused = document.activeElement;
      recoverable = offline || temporary;
      missing(root, offline, notYet, temporary);
      status.textContent = message || (offline ? "Hors ligne. La carte sera relue à la reconnexion." : temporary ? "Lecture impossible. Tu peux réessayer." : notYet ? "Cartes bientôt disponibles." : "Carte indisponible.");
      if (focused?.id === "athlete-retry" && !document.querySelector('dialog[open]')
        && [focused, document.body, root].includes(document.activeElement)) root.querySelector("#athlete-retry")?.focus();
    }
    async function load(user = false) {
      if (pending) return;
      const s = slug(), client = window.titanClient;
      document.title = "Carte d’athlète — TITAN";
      if (!/^[a-z0-9]{10}$/.test(s)) return unavailable();
      if (!navigator.onLine) return unavailable(true);
      if (!client) return unavailable(false, false, true);
      const focused = document.activeElement, restoreFocus = user && focused?.id === "athlete-retry";
      const request = ++sequence;
      const job = { controller: new AbortController(), timer: null }; pending = job; recoverable = false;
      const current = () => pending === job && sequence === request && slug() === s && window.titanClient === client && navigator.onLine;
      root.setAttribute("aria-busy", "true");
      const retry = root.querySelector("#athlete-retry"); if (retry) retry.disabled = true;
      status.textContent = "Chargement de la carte…";
      try {
        let call = client.rpc("titan_public_card", { p_slug: s });
        if (typeof call?.abortSignal === "function") call = call.abortSignal(job.controller.signal);
        const expiry = new Promise((resolve, reject) => {
          job.controller.signal.addEventListener("abort", () => reject(new Error("ATHLETE_CANCELLED")), { once: true });
          job.timer = setTimeout(() => { reject(new Error("ATHLETE_TIMEOUT")); job.controller.abort(); }, 12000);
        });
        const { data, error } = await Promise.race([Promise.resolve(call), expiry]);
        if (!current()) return;
        if (error?.code === "PGRST202") unavailable(false, true);
        else if (error) throw error;
        else if (!data) unavailable();
        else { render(root, data); status.textContent = "Carte chargée."; }
      } catch (error) {
        if (!current()) return;
        unavailable(false, false, true, error?.message === "ATHLETE_TIMEOUT" ? "Le serveur n’a pas répondu en 12 secondes. Tu peux réessayer." : "Lecture impossible. Tu peux réessayer.");
      } finally {
        clearTimeout(job.timer);
        const valid = current();
        if (pending === job) {
          pending = null; root.setAttribute("aria-busy", "false");
          const button = root.querySelector("#athlete-retry"); if (button) button.disabled = false;
        }
        if (valid && restoreFocus && !document.querySelector('dialog[open]')
          && [focused, document.body, root].includes(document.activeElement)) {
          const target = root.querySelector("#athlete-retry") || root.querySelector("h1");
          if (target) { if (target.tagName === "H1") target.tabIndex = -1; target.focus(); }
        }
      }
    }
    root.addEventListener("click", event => { if (event.target.closest("#athlete-retry")) load(true); });
    window.addEventListener("online", () => { if (recoverable) load(); });
    window.addEventListener("offline", () => { if (pending || recoverable) { cancel(); unavailable(true); } });
    window.addEventListener("popstate", () => {
      cancel(); root.innerHTML = '<div class="asc-skeleton" style="height:260px;border-radius:26px"></div>'; load();
    });
    load();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
