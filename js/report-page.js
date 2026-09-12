(function () {
  "use strict";
  const esc = window.titanEscapeText,
    fmt = (n) =>
      Number(n || 0).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  const date = (d) =>
    new Date(d).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  const sportLabel = (k) => window.SPORTS_CONFIG?.[k]?.label || k;
  let selected = [],
    range = null,
    request = 0;
  function render() {
    const days = Number(document.getElementById("report-period").value),
      sport = document.getElementById("report-sport");
    const value = sport.value,
      history = window.state?.history || [];
    sport.innerHTML =
      '<option value="all">Tous les sports</option>' +
      [...new Set(history.map((l) => l.sport))]
        .map((k) => `<option value="${esc(k)}">${esc(sportLabel(k))}</option>`)
        .join("");
    sport.value = [...sport.options].some((o) => o.value === value)
      ? value
      : "all";
    const end = new Date(),
      start = new Date(end);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - days + 1);
    range = {
      p_from: start.toISOString(),
      p_to: end.toISOString(),
      p_sport: sport.value === "all" ? null : sport.value,
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    const s = window.TitanTraining.summarize(history, days, sport.value, end);
    selected = s.selected;
    document.getElementById("report-identity").textContent =
      window.state?.user?.name || "Mon activité sportive";
    document.getElementById("report-dates").textContent =
      `Du ${date(start)} au ${date(end)} · ${sport.value === "all" ? "Tous les sports" : sportLabel(sport.value)}`;
    const pending = selected.filter((l) => l.syncStatus !== "confirmed").length;
    document.getElementById("report-summary").innerHTML =
      `<div class="tracking-metrics"><article class="tracking-metric"><span>Séances</span><strong>${s.sessions}</strong><small>${s.buckets.filter((b) => b.sessions).length} jours actifs</small></article><article class="tracking-metric"><span>Durée renseignée</span><strong>${s.measured ? fmt(s.minutes) : "—"}</strong><small>min · ${s.measured}/${s.sessions} séances</small></article><article class="tracking-metric"><span>Distance renseignée</span><strong>${s.distanceMeasured ? fmt(s.distance) : "—"}</strong><small>km · ${s.distanceMeasured}/${s.sessions} séances</small></article><article class="tracking-metric"><span>Sports pratiqués</span><strong>${Object.keys(s.counts).length}</strong><small>selon le filtre choisi</small></article></div><p class="tracking-status">${pending ? `${pending} séance(s) conservée(s) sur cet appareil, incluse(s) dans ce résumé. ` : ""}Ce bilan décrit uniquement les activités enregistrées. Les valeurs absentes sont indiquées par un tiret.</p>`;
    document.getElementById("report-sessions").innerHTML = selected.length
      ? `<table class="tracking-table"><caption>Séances de la période</caption><thead><tr><th scope="col">Date</th><th scope="col">Sport</th><th scope="col">Mesure</th><th scope="col">Durée</th></tr></thead><tbody>${selected
          .slice()
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .map(
            (l) =>
              `<tr><td>${esc(date(l.date))}</td><td>${esc(sportLabel(l.sport))}</td><td>${fmt(l.val)} ${esc(l.unit)}</td><td>${window.TitanTraining.duration(l) ? fmt(window.TitanTraining.duration(l)) + " min" : "—"}</td></tr>`,
          )
          .join("")}</tbody></table>`
      : '<p class="tracking-status">Aucune séance sur cette période. Change les filtres ou <a href="/training">enregistre un effort</a>.</p>';
    request++;
    document.getElementById("report-plus-result").replaceChildren();
    document.getElementById("report-plus-status").textContent = "";
  }
  function metricRow(label, key, a, b, has = "sessions", unit = "") {
    const av = a[has] ? fmt(a[key]) + unit : "—",
      bv = b[has] ? fmt(b[key]) + unit : "—";
    const delta =
      a[has] && b[has]
        ? `${a[key] - b[key] > 0 ? "+" : ""}${fmt(a[key] - b[key])}${unit}`
        : "—";
    return `<tr><th scope="row">${label}</th><td>${av}</td><td>${bv}</td><td>${delta}</td></tr>`;
  }
  async function generate() {
    const button = document.getElementById("report-generate"),
      status = document.getElementById("report-plus-status");
    if (
      !window.state?.user?.id ||
      String(window.state.user.id).startsWith("guest_")
    ) {
      status.innerHTML =
        'Connecte-toi à un compte TITAN+ pour générer les analyses. <a href="/login">Se connecter</a> · <a href="/tarifs">Comparer les offres</a>';
      return;
    }
    const owner = window.state.user.id,
      token = ++request,
      params = { ...range };
    button.disabled = true;
    status.textContent =
      "Calcul du bilan à partir de tes séances synchronisées…";
    try {
      const { data, error } = await window.titanClient.rpc(
        "titan_training_insights",
        params,
      );
      if (error) throw error;
      if (token !== request || owner !== window.state?.user?.id) return;
      const a = data.periods.current,
        b = data.periods.previous;
      document.getElementById("report-plus-result").innerHTML =
        `<section class="tracking-panel report-comparison"><span class="tracking-eyebrow">TITAN+ · Bilan comparatif</span><h2>Prendre du recul sur ta pratique.</h2><p class="tracking-status">Séances synchronisées uniquement. Période précédente : du ${esc(date(data.previous_from))} au ${esc(date(data.from))}, date de fin exclue. Les deux intervalles ont la même durée.</p><table class="tracking-table"><thead><tr><th scope="col">Indicateur</th><th scope="col">Période choisie</th><th scope="col">Précédente</th><th scope="col">Écart</th></tr></thead><tbody>${metricRow("Séances", "sessions", a, b)}${metricRow("Minutes renseignées", "minutes", a, b, "duration_measured")}${metricRow("Distance (km)", "distance", a, b, "distance_measured")}${metricRow("Jours actifs", "active_days", a, b)}${metricRow("Charge déclarée (unités)", "reported_load", a, b, "load_measured")}</tbody></table><p class="tracking-status">Charge déclarée = durée en minutes × ressenti d’effort (RPE sur 10). Données complètes pour ${a.load_measured}/${a.sessions} séances sur la période, ${b.load_measured}/${b.sessions} sur la précédente. Les données manquantes peuvent expliquer une partie de l’écart. Ce repère ne constitue pas une mesure de condition physique.</p><h3>La répartition par sport</h3><table class="tracking-table"><thead><tr><th scope="col">Sport</th><th scope="col">Séances</th><th scope="col">Minutes renseignées</th></tr></thead><tbody>${data.sports.map((s) => `<tr><td>${esc(sportLabel(s.sport))}</td><td>${s.sessions}</td><td>${s.duration_measured ? fmt(s.minutes) : "—"} · ${s.duration_measured}/${s.sessions}</td></tr>`).join("")}</tbody></table></section>`;
      status.textContent =
        "Analyses ajoutées au bilan. Elles seront incluses dans l’impression.";
    } catch (error) {
      if (token !== request) return;
      status.innerHTML = String(error.message).includes("TITAN_PLUS_REQUIRED")
        ? 'Ces analyses font partie de TITAN+. Le résumé et l’export CSV restent gratuits. <a href="/tarifs">Voir les offres</a>'
        : "Le calcul est momentanément indisponible. Tes séances restent conservées. Réessaie une fois la connexion rétablie.";
    } finally {
      button.disabled = false;
    }
  }
  document.getElementById("report-period").addEventListener("change", render);
  document.getElementById("report-sport").addEventListener("change", render);
  document
    .getElementById("report-generate")
    .addEventListener("click", generate);
  document
    .getElementById("report-csv")
    .addEventListener("click", () => window.titanExportSessionsCSV(selected));
  document.getElementById("report-print").addEventListener("click", () => {
    document.getElementById("report-note-print").textContent =
      document.getElementById("report-note").value;
    window.print();
  });
  window.addEventListener("titan:history-updated", render);
  window.addEventListener("titan:catalog-ready", render);
  render();
})();
