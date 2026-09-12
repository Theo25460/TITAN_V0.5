(function () {
  "use strict";
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const label = (k) => window.SPORTS_CONFIG?.[k]?.label || k;
  const fmt = (n) =>
    Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  function render() {
    const history = window.state?.history || [];
    const content = document.getElementById("progress-content");
    if (!content) return;
    const sport = document.getElementById("progress-sport");
    const selected = sport.value;
    sport.innerHTML =
      '<option value="all">Tous les sports</option>' +
      [...new Set(history.map((l) => l.sport))]
        .map((k) => `<option value="${esc(k)}">${esc(label(k))}</option>`)
        .join("");
    sport.value = [...sport.options].some((o) => o.value === selected)
      ? selected
      : "all";
    const days = Number(document.getElementById("progress-period").value);
    const s = window.TitanTraining.summarize(history, days, sport.value);
    const status = document.getElementById("progress-status");
    status.textContent = window.state?.user?.id?.startsWith("guest_")
      ? "Mode invité · séances conservées sur cet appareil."
      : "Mesures issues des séances enregistrées. Les durées manquantes ne sont pas estimées.";
    if (!s.sessions) {
      content.innerHTML = `<section class="tracking-empty"><div class="tracking-empty-icon"><i class="ri-line-chart-line" aria-hidden="true"></i></div><h2>${history.length ? "Une période sans séance." : "Tout commence par une séance."}</h2><p>${history.length ? "Change la période ou le sport pour retrouver tes activités." : "Une sortie, quelques séries ou une séance d’escalade : enregistre ton premier effort pour voir tes progrès ici."}</p><a href="./training.html" class="tracking-action">Enregistrer une séance <i class="ri-arrow-right-line" aria-hidden="true"></i></a></section>`;
      return;
    }
    const bars = window.TitanTraining.chartBuckets(s.buckets);
    const max = Math.max(1, ...bars.map((b) => b.minutes));
    const previous = window.TitanTraining.summarize(
      history,
      days,
      sport.value,
      new Date(Date.now() - days * 86400000),
    );
    const diff = s.sessions - previous.sessions;
    const observation = previous.sessions
      ? `${Math.abs(diff)} séance${Math.abs(diff) > 1 ? "s" : ""} ${diff >= 0 ? "de plus" : "de moins"} que sur les ${days} jours précédents. Compare aussi la durée et le type de sport avant d’en tirer une conclusion.`
      : "Cette période constitue ton premier point de comparaison. Ta tendance se précisera au fil des séances.";
    content.innerHTML = `<div class="tracking-metrics"><article class="tracking-metric"><span>Séances</span><strong>${s.sessions}</strong><small>sur ${days} jours</small></article><article class="tracking-metric"><span>Temps d’activité</span><strong>${s.measured ? fmt(s.minutes) : "—"} <span style="display:inline">min</span></strong><small>${s.measured}/${s.sessions} durées renseignées</small></article><article class="tracking-metric"><span>Distance</span><strong>${s.distanceMeasured ? fmt(s.distance) : "—"} <span style="display:inline">km</span></strong><small>${s.distanceMeasured}/${s.sessions} distances renseignées</small></article><article class="tracking-metric"><span>Jours actifs</span><strong>${s.buckets.filter((b) => b.sessions).length}</strong><small>à ton rythme</small></article></div>
 <div class="tracking-grid"><section class="tracking-panel"><h2>Le rythme de tes séances</h2><div class="tracking-chart" role="img" aria-label="Minutes par intervalle. Les valeurs sont disponibles dans le tableau ci-dessous.">${bars.map((b) => `<span style="height:${b.minutes ? Math.max(3, (b.minutes / max) * 100) : 1}%" title="${esc(b.date)}${b.endDate !== b.date ? " au " + esc(b.endDate) : ""} : ${fmt(b.minutes)} min, ${b.sessions} séance(s)"></span>`).join("")}</div><div class="tracking-chart-labels"><span>${esc(s.buckets[0]?.date)}</span><span>Aujourd’hui</span></div><p class="tracking-observation">${esc(observation)}</p><details><summary>Voir les valeurs du graphique</summary><table class="tracking-table"><thead><tr><th scope="col">Jour</th><th scope="col">Séances</th><th scope="col">Minutes renseignées</th></tr></thead><tbody>${s.buckets
   .filter((b) => b.sessions)
   .map(
     (b) =>
       `<tr><td>${esc(b.date)}</td><td>${b.sessions}</td><td>${fmt(b.minutes)}</td></tr>`,
   )
   .join("")}</tbody></table></details></section>
 <section class="tracking-panel"><h2>Tes sports, ta combinaison</h2><div class="tracking-distribution">${Object.entries(
   s.counts,
 )
   .sort((a, b) => b[1] - a[1])
   .map(
     ([k, n]) =>
       `<div><span>${esc(label(k))}</span><strong>${n} séance(s)</strong><progress value="${n}" max="${s.sessions}" aria-label="${esc(label(k))}"></progress></div>`,
   )
   .join(
     "",
   )}</div><p class="tracking-observation">Cette répartition décrit ta pratique enregistrée. Elle ne mesure pas tes capacités physiques.</p><a href="./journal.html" class="tracking-secondary">Ouvrir le journal</a></section></div>`;
  }
  window.addEventListener("titan:history-updated", render);
  window.addEventListener("titan:catalog-ready", render);
  window.addEventListener("titan:history-error", () => {
    document.getElementById("progress-status").textContent =
      "Historique cloud incomplet : seules les séances disponibles sur cet appareil sont affichées. Réessaie depuis ton profil.";
  });
  document.getElementById("progress-period").addEventListener("change", render);
  document.getElementById("progress-sport").addEventListener("change", render);
  render();
})();
