/* TITAN 300 — personal period comparisons. All aggregates and access decisions come from the server. */
(function () {
  "use strict";
  const esc = (v) => window.titanEsc(v);
  const F = () => window.TitanFormat;
  const SP = () => window.TitanSports;
  const D = () => window.TitanData;
  const uuid = (v) => typeof v === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
  const day = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
  const nonnegative = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
  const count = (v) => nonnegative(v) && Number.isInteger(v);
  const duration = (v) => v === 0 ? "0 min" : F().duration(v);
  const date = (v) => new Date(`${v}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const lastDay = (v) => { const d = new Date(`${v}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
  let root, panel, form, status, output;
  let sport = null, sequence = 0, timer = null, ownerShown = null, offline = !navigator.onLine;

  function clear(message = "") {
    sequence++;
    clearTimeout(timer);
    timer = null;
    output.innerHTML = "";
    output.removeAttribute("aria-busy");
    form.querySelector("button[type=submit]").disabled = false;
    status.innerHTML = message ? `<p>${esc(message)}</p>` : "";
  }

  // Fail closed on a malformed/stale contract rather than display plausible invented numbers.
  function valid(j, options) {
    if (j?.version !== 1 || j.weeks !== options.p_weeks || j.sport !== options.p_sport || j.timezone !== options.p_timezone || !Number.isFinite(Date.parse(j.as_of))) return false;
    for (const p of [j.recent, j.previous]) {
      if (!p || !day(p.from) || !day(p.to) || p.from >= p.to || !count(p.sessions) || !count(p.active_days) || p.active_days > j.weeks * 7 || !nonnegative(p.minutes) || !count(p.estimated_sessions) || p.estimated_sessions > p.sessions) return false;
      if (!Array.isArray(p.series) || p.series.length !== j.weeks || !Array.isArray(p.sources) || p.sources.length > 5) return false;
      if (p.series.some(w => !day(w.from) || !day(w.to) || !count(w.sessions) || !count(w.active_days) || !nonnegative(w.minutes))) return false;
      if (p.sources.some(s => !uuid(s.id) || typeof s.sport !== "string" || !Number.isFinite(Date.parse(s.date)) || !nonnegative(s.minutes) || typeof s.estimated !== "boolean")) return false;
    }
    return j.previous.to === j.recent.from;
  }

  function difference(a, b, unit) {
    if (a === 0 && b === 0) return "Aucune pratique dans ces périodes.";
    if (b === 0) return "Pas de référence pour un pourcentage.";
    const delta = a - b, ratio = Math.round(delta / b * 100);
    const amount = unit === "minutes" ? duration(Math.abs(delta)) : `${Math.abs(delta)}`;
    return delta === 0 ? "Même volume." : `${delta > 0 ? "+" : "−"}${amount} (${ratio > 0 ? "+" : ""}${ratio} %)`;
  }

  function sources(p, label, zone) {
    return `<section><h4>${label}</h4><p class="asc-small asc-muted">${p.sources.length} exemple${p.sources.length > 1 ? "s" : ""} sur ${p.sessions} séance${p.sessions > 1 ? "s" : ""} ; les plus récentes.</p>${p.sources.length ? `<ul class="compare-sources">${p.sources.map(s => `<li><a href="/journal?session=${encodeURIComponent(s.id)}">${esc(SP().label(s.sport))} · ${esc(new Date(s.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: zone }))} · ${esc(duration(s.minutes))}${s.estimated ? " (estimée)" : ""}</a></li>`).join("")}</ul>` : '<p class="asc-small">Aucune séance dans cette période.</p>'}</section>`;
  }

  function results(j) {
    const a = j.recent, b = j.previous;
    const range = (p) => `${date(p.from)} – ${date(lastDay(p.to))}`;
    const metrics = [["sessions", "Séances", v => String(v)], ["active_days", "Jours actifs", v => String(v)], ["minutes", "Temps de pratique", duration]];
    output.innerHTML = `<div class="compare-results"><h3 id="compare-period-title">${j.weeks} semaines · ${esc(j.sport ? SP().label(j.sport) : "Tous les sports")}</h3>
      <p class="asc-small">Semaines complètes du lundi au dimanche ; la semaine courante est exclue. Fuseau : ${esc(j.timezone)}.</p>
      <div class="compare-table-wrap" tabindex="0" role="region" aria-label="Comparaison des périodes"><table class="compare-table"><caption class="sr-only">Pratique récente comparée à la période précédente de même durée</caption><thead><tr><th scope="col">Repère</th><th scope="col">Récente<small>${esc(range(a))}</small></th><th scope="col">Précédente<small>${esc(range(b))}</small></th></tr></thead><tbody>${metrics.map(([key, label, fmt]) => `<tr data-comparison-metric="${key}"><th scope="row">${label}<small>${esc(difference(a[key], b[key], key))}</small></th><td>${esc(fmt(a[key]))}</td><td>${esc(fmt(b[key]))}</td></tr>`).join("")}</tbody></table></div>
      <p class="asc-small">${a.estimated_sessions + b.estimated_sessions ? `${a.estimated_sessions + b.estimated_sessions} séance(s) avec une durée estimée ; elles sont incluses dans le temps de pratique.` : "Toutes les durées de ces périodes sont renseignées."} Les jours actifs comptent chaque date une seule fois, même avec plusieurs sports.</p>
      <p class="asc-small asc-muted">Plus de volume ne signifie pas meilleure performance. Les repos et les changements de sport peuvent expliquer les écarts. Historique synchronisé uniquement ; les séances en attente sur cet appareil ne sont pas incluses. Calcul du ${esc(new Date(j.as_of).toLocaleString("fr-FR", { timeZone: j.timezone }))}.</p>
      ${a.sessions + b.sessions === 0 ? '<p>Aucune séance synchronisée dans ces périodes. Essaie un autre sport ou une période plus longue.</p>' : ""}
      <details id="compare-weekly"><summary>Voir semaine par semaine</summary><div class="compare-table-wrap" tabindex="0" role="region" aria-label="Semaines comparées"><table class="compare-table"><thead><tr><th scope="col">Semaine</th><th scope="col">Récente</th><th scope="col">Précédente</th></tr></thead><tbody>${a.series.map((w, i) => `<tr><th scope="row">${i + 1}</th>${[w, b.series[i]].map(v => `<td><small>${esc(date(v.from))}</small>${esc(duration(v.minutes))}<small>${v.sessions} séance(s) · ${v.active_days} jour(s) actif(s)</small></td>`).join("")}</tr>`).join("")}</tbody></table></div></details>
      <details><summary>Voir les séances sources</summary><div class="compare-source-grid">${sources(a, "Période récente", j.timezone)}${sources(b, "Période précédente", j.timezone)}</div></details>
    </div>`;
  }

  async function load() {
    clear();
    const request = sequence, owner = D().owner();
    ownerShown = owner;
    form.hidden = D().isGuest();
    if (window.titanAccountTransition?.active) return clear("La session a changé. Attends la synchronisation du compte ou reconnecte-toi.");
    if (D().isGuest()) {
      status.innerHTML = '<p>Les comparaisons TITAN+ demandent un compte et un historique synchronisé. Ton récap et tes analyses de base restent gratuits.</p><a class="asc-btn asc-btn-secondary" href="/profile">Accéder à mon compte</a>';
      return;
    }
    if (offline || !navigator.onLine) return clear("Hors ligne : les comparaisons reviennent avec la connexion. Tes statistiques de base restent accessibles.");
    if (!window.titanClient) return clear("La connexion au serveur n’est pas prête. Réessaie dans un instant.");
    const options = { p_weeks: Number(form.querySelector("#compare-weeks").value), p_sport: sport, p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" };
    output.setAttribute("aria-busy", "true");
    form.querySelector("button[type=submit]").disabled = true;
    status.innerHTML = "<p>Calcul des périodes…</p>";
    try {
      const { data: j, error } = await window.titanClient.rpc("titan_compare_periods", options);
      if (request !== sequence || D().owner() !== owner || D().isGuest()) return;
      if (error) throw error;
      if (!j || j.owner !== owner) throw new Error("INVALID_COMPARISON_RESPONSE");
      if (j.available === false) {
        status.innerHTML = '<p>TITAN+ ajoute les comparaisons de périodes et le filtre par sport. Ton historique, tes records et tes analyses de base restent gratuits.</p><a class="asc-btn asc-btn-secondary" href="/tarifs#concret">Voir les bénéfices TITAN+</a>';
      } else {
        if (j.available !== true || !valid(j, options)) throw new Error("INVALID_COMPARISON_RESPONSE");
        results(j);
        status.innerHTML = "<p>Comparaison calculée.</p>";
        timer = setTimeout(() => { if (panel.open && !document.hidden) load(); }, 60000);
      }
    } catch (e) {
      if (request !== sequence || D().owner() !== owner) return;
      const missing = e?.code === "PGRST202" || String(e?.message || "").includes("Could not find");
      clear(missing ? "Les comparaisons ouvrent avec la prochaine mise à jour du serveur. Tes statistiques de base restent disponibles." : "La comparaison n’a pas répondu correctement. Réessaie dans un instant.");
    } finally {
      if (D().owner() === owner && request === sequence) {
        output.removeAttribute("aria-busy");
        form.querySelector("button[type=submit]").disabled = false;
      }
    }
  }

  function choose(id) {
    sport = id;
    form.querySelector("#compare-sport-q").value = "";
    form.querySelector("#compare-sport-results").innerHTML = "";
    form.querySelector("#compare-sport-current").textContent = id ? SP().label(id) : "Tous les sports";
    clear("Filtre modifié. Lance la comparaison pour ces paramètres.");
    form.querySelector("#compare-submit").focus();
  }

  function start() {
    root = document.getElementById("analyses");
    if (!root) return;
    root.innerHTML = `<details class="compare-panel" id="compare-panel"><summary>Comparer mes périodes <span class="asc-pill">TITAN+</span></summary><div class="compare-body"><p>Prends du recul sur tes séances, tes jours actifs et ton temps de pratique. Les statistiques ci-dessus restent gratuites.</p>
      <form id="compare-form"><div class="compare-controls"><div><label for="compare-weeks">Période</label><select class="asc-select" id="compare-weeks"><option value="4">4 semaines</option><option value="12">12 semaines</option><option value="26">26 semaines</option></select></div><div><label for="compare-sport-q">Sport</label><input class="asc-input" type="search" id="compare-sport-q" placeholder="Rechercher un sport" autocomplete="off" aria-describedby="compare-sport-current"><div id="compare-sport-results" role="group" aria-label="Sports trouvés"></div><p class="asc-small"><span id="compare-sport-current" aria-live="polite">Tous les sports</span> <button type="button" class="asc-btn asc-btn-ghost" id="compare-all">Tous les sports</button></p></div></div><button type="submit" class="asc-btn asc-btn-primary" id="compare-submit">Comparer</button></form>
      <div id="compare-status" role="status" aria-live="polite"></div><div id="compare-output"></div></div></details>`;
    panel = root.querySelector("details"); form = root.querySelector("form"); status = root.querySelector("#compare-status"); output = root.querySelector("#compare-output");
    panel.addEventListener("toggle", () => panel.open ? load() : clear());
    form.addEventListener("submit", e => { e.preventDefault(); load(); });
    form.querySelector("#compare-weeks").addEventListener("change", () => clear("Période modifiée. Lance la comparaison pour ces paramètres."));
    form.querySelector("#compare-sport-q").addEventListener("input", e => {
      const matches = SP().search(e.target.value, { limit: 12 });
      form.querySelector("#compare-sport-results").innerHTML = matches.map(s => `<button class="asc-btn asc-btn-secondary" type="button" data-sport="${esc(s.id)}">${esc(s.label)}</button>`).join("") || (e.target.value ? "<p>Aucun sport trouvé. Essaie un autre nom.</p>" : "");
    });
    form.querySelector("#compare-sport-results").addEventListener("click", e => { const b = e.target.closest("[data-sport]"); if (b) choose(b.dataset.sport); });
    form.querySelector("#compare-all").addEventListener("click", () => choose(null));
    const refresh = () => {
      if (ownerShown !== D().owner()) { sport = null; choose(null); clear(); }
      if (panel.open && !document.hidden) load(); else clear();
    };
    ["titan:history-updated", "titan:adventure-updated", "focus", "pageshow"].forEach(ev => window.addEventListener(ev, refresh));
    window.addEventListener("titan:account-changing", () => clear("La session a changé. Attends la synchronisation du compte ou reconnecte-toi."));
    window.addEventListener("titan:account-changed", refresh);
    window.addEventListener("offline", () => { offline = true; clear("Hors ligne : les comparaisons reviennent avec la connexion."); });
    window.addEventListener("online", () => { offline = false; refresh(); });
    document.addEventListener("visibilitychange", () => document.hidden ? clear() : refresh());
    if (location.hash === "#analyses") panel.open = true;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
