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

  function missing(root, offline, notYet) {
    root.innerHTML = `<section class="asc-hero ap-hero"><p class="asc-eyebrow">Carte d’athlète</p><h1 class="cm-exp-title">${offline ? "Pas de réseau." : notYet ? "Les cartes d’athlète arrivent bientôt." : "Cette carte n’est pas disponible."}</h1>
      <p class="asc-lead">${offline ? "La carte s’affichera dès que la connexion revient." : notYet ? "Elles seront disponibles avec la prochaine mise à jour du serveur." : "Le lien est peut-être ancien, ou son auteur a choisi de ne plus la montrer."}</p>
      <div class="asc-row-flex"><a class="asc-btn asc-btn-primary" href="/">Découvrir TITAN</a></div></section>`;
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

  async function start() {
    const root = document.getElementById("athlete");
    if (!root) return;
    document.querySelectorAll("[data-mark]").forEach((el) => (el.innerHTML = window.titanMark?.() || ""));
    const s = slug();
    if (!/^[a-z0-9]{10}$/.test(s) || !window.titanClient) return missing(root, !navigator.onLine);
    try {
      const call = window.titanClient.rpc("titan_public_card", { p_slug: s });
      const { data, error } = await (typeof AbortSignal.timeout === "function" && call.abortSignal ? call.abortSignal(AbortSignal.timeout(12000)) : call);
      if (error?.code === "PGRST202") return missing(root, false, true);
      if (error || !data) return missing(root, !navigator.onLine);
      render(root, data);
    } catch {
      missing(root, !navigator.onLine);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
