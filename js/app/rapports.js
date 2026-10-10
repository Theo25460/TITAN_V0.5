/* TITAN — personal practice reports; fresh owner and entitlement for every preview/export. */
(function () {
  "use strict";
  const D = () => window.TitanData, R = () => window.TitanReports;
  const esc = v => window.titanEsc(v);
  const label = id => window.TitanSports.label(id);
  const duration = n => n === 0 ? "0 min" : window.TitanFormat.duration(n);
  const date = v => new Date(v + "T12:00:00Z").toLocaleDateString("fr-FR", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
  const last = v => { const d = new Date(v + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
  let root, panel, form, status, output, shown = null, sequence = 0, pending = null, refreshTimer = null;
  let offline = !navigator.onLine, page = 0, search = "";
  let shownEpoch = null;
  function clear(message = "") {
    sequence++;
    if (pending) { clearTimeout(pending.timer); pending.controller.abort(); pending = null; }
    clearTimeout(refreshTimer); refreshTimer = null;
    shown = null; shownEpoch = null; page = 0; search = "";
    output.innerHTML = ""; output.removeAttribute("aria-busy");
    form.querySelector("button[type=submit]").disabled = false;
    status.innerHTML = message ? `<p>${esc(message)}</p>` : "";
  }
  function sportRows() {
    if (!shown) return;
    const q = search.trim().toLocaleLowerCase("fr-FR");
    const rows = shown.sports.filter(s => !q || `${label(s.sport)} ${s.sport}`.toLocaleLowerCase("fr-FR").includes(q));
    const pages = Math.max(1, Math.ceil(rows.length / 20)); page = Math.min(page, pages - 1);
    output.querySelector("#report-sport-rows").innerHTML = rows.slice(page * 20, (page + 1) * 20).map(s => `<tr><th scope="row">${esc(label(s.sport))}</th><td>${s.sessions}</td><td>${s.active_days}</td><td>${esc(duration(s.minutes))}</td></tr>`).join("") || '<tr><td colspan="4">Aucun sport trouvé.</td></tr>';
    output.querySelector("#report-page").textContent = `Page ${page + 1} sur ${pages} · ${rows.length} sport(s)`;
    output.querySelector("#report-prev").disabled = page === 0;
    output.querySelector("#report-next").disabled = page >= pages - 1;
  }
  function results(j) {
    shown = j;
    shownEpoch = window.titanAccountTransition?.epoch;
    output.innerHTML = `<div class="report-results compare-results"><h3 id="report-title">${esc(date(j.from))} – ${esc(date(last(j.to)))}</h3>
      <p><strong>${j.current ? "Bilan provisoire" : "Période complète"}</strong> · ${esc(j.timezone)}. Calcul arrêté au ${esc(new Date(j.as_of).toLocaleString("fr-FR", { timeZone: j.timezone }))}.</p>
      <dl class="report-metrics">${[["sessions", "Séances", String], ["active_days", "Jours actifs", String], ["minutes", "Temps de pratique", duration]].map(([key, title, fmt]) => `<div><dt>${title}</dt><dd data-report-metric="${key}">${esc(fmt(j[key]))}</dd></div>`).join("")}</dl>
      <p class="asc-small">${j.estimated_sessions ? `${j.estimated_sessions} durée(s) estimée(s), incluse(s) dans le temps de pratique.` : "Toutes les durées sont renseignées."} Une date compte une seule fois au total, même avec plusieurs sports ; les jours par sport ne se somment pas.</p>
      <p class="asc-small asc-muted">Historique synchronisé uniquement. ${j.current ? "Les jours ou mois à venir ne sont pas encore observés. " : ""}Plus de volume ne signifie pas meilleure performance.</p>
      ${j.sessions === 0 ? '<p>Aucune séance synchronisée dans cette période.</p>' : ""}
      <div class="view-actions"><button type="button" id="report-export" class="asc-btn asc-btn-secondary">Exporter le bilan CSV</button><button type="button" id="report-save-view" class="asc-btn asc-btn-secondary">Enregistrer cette vue</button></div><p class="asc-small asc-muted">Le téléchargement recalcule le bilan avec ton accès actuel. Le CSV contient les totaux, les sports et le calendrier.</p>
      <section><h4>Répartition par sport</h4><label for="report-sport-search">Rechercher dans ce bilan</label><input class="asc-input" type="search" id="report-sport-search" placeholder="Nom du sport" autocomplete="off">
        <div class="compare-table-wrap" tabindex="0" role="region" aria-label="Répartition du bilan par sport"><table class="compare-table"><thead><tr><th scope="col">Sport</th><th scope="col">Séances</th><th scope="col">Jours</th><th scope="col">Temps</th></tr></thead><tbody id="report-sport-rows"></tbody></table></div>
        <div class="report-pages"><button type="button" class="asc-btn asc-btn-secondary" id="report-prev">Précédente</button><span id="report-page" role="status"></span><button type="button" class="asc-btn asc-btn-secondary" id="report-next">Suivante</button></div></section>
      <details id="report-calendar"><summary>Voir ${j.period === "month" ? "jour par jour" : "mois par mois"}</summary><div class="compare-table-wrap" tabindex="0" role="region" aria-label="Calendrier du bilan"><table class="compare-table"><thead><tr><th scope="col">Période</th><th scope="col">Séances</th><th scope="col">Jours</th><th scope="col">Temps</th></tr></thead><tbody>${j.series.map(s => `<tr><th scope="row">${esc(date(s.from))}</th><td>${s.sessions}</td><td>${s.active_days}</td><td>${esc(duration(s.minutes))}${s.estimated_sessions ? `<small>${s.estimated_sessions} estimée(s)</small>` : ""}</td></tr>`).join("")}</tbody></table></div></details>
      <details><summary>Voir les séances sources</summary><p class="asc-small">Les ${j.sources.length} plus récentes, sur ${j.sessions} séance(s).</p><ul class="report-sources compare-sources">${j.sources.map(s => `<li><a href="/journal?session=${encodeURIComponent(s.id)}">${esc(label(s.sport))} · ${esc(new Date(s.date).toLocaleDateString("fr-FR", { timeZone: j.timezone }))} · ${esc(duration(s.minutes))}${s.estimated ? " (estimée)" : ""}</a></li>`).join("")}</ul></details>
    </div>`;
    sportRows();
  }
  async function load(download = false) {
    clear();
    const request = sequence, owner = D().owner(), epoch = window.titanAccountTransition?.epoch, client = window.titanClient;
    const current = () => request === sequence && D().owner() === owner && !D().isGuest() && client === window.titanClient
      && window.titanAccountTransition?.epoch === epoch && !window.titanAccountTransition?.active && panel.open && !document.hidden && !offline && navigator.onLine;
    form.hidden = D().isGuest();
    if (window.titanAccountTransition?.active) return clear("La session a changé. Attends la synchronisation du compte ou reconnecte-toi.");
    if (D().isGuest()) {
      status.innerHTML = '<p>Ton bilan TITAN+ demande un compte et un historique synchronisé. Tes statistiques et exports de base restent gratuits.</p><a class="asc-btn asc-btn-secondary" href="/profile">Accéder à mon compte</a>'; return;
    }
    if (offline || !navigator.onLine) return clear("Hors ligne : le bilan revient avec la connexion. Tes statistiques de base restent accessibles.");
    if (!client) return clear("La connexion au serveur n’est pas prête. Réessaie dans un instant.");
    const [period, offset] = form.querySelector("#report-period").value.split(":");
    const options = { p_period: period, p_offset: Number(offset), p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" };
    const job = { controller: new AbortController(), timer: null }; pending = job;
    output.setAttribute("aria-busy", "true"); form.querySelector("button[type=submit]").disabled = true;
    status.innerHTML = download ? "<p>Recalcul avant téléchargement…</p>" : "<p>Calcul du bilan…</p>";
    try {
      let query = client.rpc("titan_practice_report", options);
      if (typeof query?.abortSignal === "function") query = query.abortSignal(job.controller.signal);
      const expiry = new Promise((resolve, reject) => {
        job.controller.signal.addEventListener("abort", () => reject(new Error("REPORT_CANCELLED")), { once: true });
        job.timer = setTimeout(() => { reject(new Error("REPORT_TIMEOUT")); job.controller.abort(); }, 15000);
      });
      const { data: j, error } = await Promise.race([Promise.resolve(query), expiry]);
      if (!current()) return;
      if (error) throw error;
      if (j?.version !== 1 || j.owner !== owner) throw new Error("INVALID_REPORT_RESPONSE");
      if (j.available === false && j.reason === "premium_required") {
        status.innerHTML = '<p>TITAN+ ajoute les bilans mensuels et annuels avec leur CSV agrégé. Ton journal et ses exports CSV/JSON restent gratuits.</p><a class="asc-btn asc-btn-secondary" href="/tarifs#concret">Voir les bénéfices TITAN+</a>'; return;
      }
      if (!R().valid(j, options, owner)) throw new Error("INVALID_REPORT_RESPONSE");
      results(j); status.innerHTML = "<p>Bilan calculé.</p>";
      if (download && current()) {
        const url = URL.createObjectURL(new Blob([R().csv(j, label)], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a"); a.href = url; a.download = `titan-bilan-${j.period}-${j.from}.csv`;
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        status.innerHTML = "<p>Bilan recalculé et CSV téléchargé.</p>";
      }
      refreshTimer = setTimeout(() => { if (panel.open && !document.hidden) load(); }, 60000);
    } catch (e) {
      if (!current()) return;
      const missing = e?.code === "PGRST202" || String(e?.message || "").includes("Could not find");
      clear(missing ? "Les bilans ouvrent avec la prochaine mise à jour du serveur. Tes exports de base restent disponibles."
        : e?.message === "REPORT_TIMEOUT" ? "Le serveur n’a pas répondu en 15 secondes. Réessaie dans un instant."
          : "Le bilan n’a pas répondu correctement. Réessaie dans un instant.");
    } finally {
      clearTimeout(job.timer);
      if (pending === job) pending = null;
      if (request === sequence) { output.removeAttribute("aria-busy"); form.querySelector("button[type=submit]").disabled = false; }
    }
  }
  function start() {
    root = document.getElementById("bilans"); if (!root) return;
    root.innerHTML = `<details id="report-panel" class="compare-panel"><summary>Mon bilan de pratique <span class="asc-pill">TITAN+</span></summary><div class="compare-body"><p>Retrouve tes séances, tes jours actifs et ton temps de pratique dans un bilan mensuel ou annuel.</p>
      <form id="report-form"><div class="report-controls"><label for="report-period">Période du bilan</label><select id="report-period" class="asc-select"><option value="month:0">Ce mois</option><option value="month:1">Mois précédent</option><option value="year:0">Cette année</option><option value="year:1">Année précédente</option></select></div><button type="submit" id="report-submit" class="asc-btn asc-btn-primary">Calculer mon bilan</button></form>
      <div id="report-status" role="status" aria-live="polite"></div><div id="report-output"></div></div></details>`;
    panel = root.querySelector("details"); form = root.querySelector("form"); status = root.querySelector("#report-status"); output = root.querySelector("#report-output");
    panel.addEventListener("toggle", () => panel.open ? load() : clear());
    form.addEventListener("submit", e => { e.preventDefault(); load(); });
    form.querySelector("select").addEventListener("change", () => clear("Période modifiée. Calcule le bilan pour ces paramètres."));
    output.addEventListener("input", e => { if (e.target.id === "report-sport-search") { search = e.target.value; page = 0; sportRows(); } });
    output.addEventListener("click", e => {
      const id = e.target.closest("button")?.id;
      if (id === "report-export") load(true);
      if (id === "report-save-view" && shown && shown.owner === D().owner() && shownEpoch === window.titanAccountTransition?.epoch && !window.titanAccountTransition?.active)
        window.dispatchEvent(new CustomEvent("titan:analysis-view-save", { detail: { owner: shown.owner, epoch: shownEpoch, kind: "report", options: { period: shown.period, offset: shown.offset } } }));
      if (id === "report-prev" || id === "report-next") { page += id === "report-next" ? 1 : -1; sportRows(); }
    });
    window.addEventListener("titan:analysis-view-selected", e => {
      const d = e.detail;
      if (!d || d.owner !== D().owner() || d.epoch !== window.titanAccountTransition?.epoch || window.titanAccountTransition?.active
        || D().isGuest() || document.hidden || offline || !navigator.onLine || d.view?.kind !== "report" || !window.TitanAnalysisViews.validView(d.view)) return;
      form.querySelector("#report-period").value = `${d.view.options.period}:${d.view.options.offset}`;
      if (panel.open) load(); else panel.open = true;
      panel.scrollIntoView({ block: "nearest" }); form.querySelector("#report-submit").focus();
    });
    const refresh = () => panel.open && !document.hidden ? load() : clear();
    ["titan:history-updated", "titan:adventure-updated", "focus", "pageshow", "titan:account-changed"].forEach(ev => window.addEventListener(ev, refresh));
    window.addEventListener("titan:account-changing", () => clear("La session a changé. Attends la synchronisation du compte ou reconnecte-toi."));
    window.addEventListener("offline", () => { offline = true; clear("Hors ligne : le bilan revient avec la connexion."); });
    window.addEventListener("online", () => { offline = false; refresh(); });
    document.addEventListener("visibilitychange", () => document.hidden ? clear() : refresh());
    if (location.hash === "#bilans") panel.open = true;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
