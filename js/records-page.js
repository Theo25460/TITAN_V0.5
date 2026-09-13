(function () {
  "use strict";
  const R = window.TitanRenaissance,
    I = window.TitanInsights;
  let sport = "all",
    kind = "all",
    search = "";
  function render() {
    const host = document.getElementById("records-content");
    if (!host || !window.state?.user) return;
    const focused = document.activeElement?.id,
      position = document.activeElement?.selectionStart;
    const logs = I.active(window.state.history),
      sports = [...new Set(logs.map((l) => l.sport))],
      all = I.records(logs, sport),
      shown = all.filter(
        (r) =>
          (kind === "all" || r.kind === kind) &&
          (!search ||
            (r.label + " " + R.sport(r.sport))
              .toLocaleLowerCase("fr-FR")
              .includes(search.toLocaleLowerCase("fr-FR"))),
      );
    host.innerHTML = `<div class="r-tabs"><a href="/stats">${R.icon("chart")}Analyses</a><a href="/journal">${R.icon("journal")}Journal</a><a href="/records" aria-current="page">${R.icon("trophy")}Records</a><a href="/objectifs">${R.icon("flag")}Objectifs</a><a href="/bilan">${R.icon("download")}Bilans</a></div><section class="r-record-intro"><div><span class="r-eyebrow">LA PROGRESSION A PLUSIEURS VISAGES</span><h2>Un repère, avec son contexte.</h2><p>Chaque carte renvoie à sa séance d’origine. Les résultats sont recalculés après une correction ou un archivage.</p></div><span class="r-record-count">${all.length}<small>repères disponibles</small></span></section><div class="r-data-filters"><label>Sport<select id="record-sport"><option value="all">Tous les sports</option>${sports.map((k) => `<option value="${R.esc(k)}" ${sport === k ? "selected" : ""}>${R.esc(R.sport(k))}</option>`).join("")}</select></label><label>Type<select id="record-kind">${Object.entries(
      {
        all: "Tous les repères",
        distance: "Distance",
        time: "Durée sur une distance",
        duration: "Durée totale",
        strength: "Musculation",
        climbing: "Escalade",
      },
    )
      .map(
        ([k, v]) =>
          `<option value="${k}" ${kind === k ? "selected" : ""}>${v}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Rechercher<input id="record-search" type="search" value="${R.esc(search)}" placeholder="Un sport ou un exercice"></label></div><div class="r-record-grid">${shown.map((r) => `<article class="r-panel r-record"><div class="r-section-head"><span class="r-eyebrow">${R.esc(R.sport(r.sport))}</span>${R.icon(r.kind === "strength" ? "layers" : r.kind === "climbing" ? "mountain" : "trophy")}</div><h3>${R.esc(r.label)}</h3><div class="r-record-value">${typeof r.value === "number" ? R.fmt(r.value) : R.esc(r.value)} <small>${R.esc(r.unit)}</small></div><p>${R.esc(r.context)}</p><a class="r-record-source" href="/journal?session=${encodeURIComponent(r.log.id)}"><span>${new Date(r.log.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span>Voir la séance ${R.icon("arrow")}</a></article>`).join("")}</div>${!shown.length ? `<section class="r-panel r-empty"><h2>${logs.length ? "Aucun repère pour ces filtres." : "Les premiers repères arrivent avec tes séances."}</h2><p>${logs.length ? "Choisis un autre sport ou renseigne les mesures manquantes dans ton journal." : "Enregistre une distance, une durée, des séries ou une cotation réussie. Chaque discipline garde ses propres unités."}</p><a class="r-button primary" href="/training">Enregistrer une séance</a></section>` : ""}<div class="r-notice"><span>Ces repères décrivent les séances enregistrées et les données déclarées. Ils ne certifient pas des performances sportives. Une meilleure valeur n’impose pas de la dépasser à la prochaine séance.</span><a href="/objectifs">Choisir mon cap</a></div>`;
    document.getElementById("record-sport").onchange = (e) => {
      sport = e.target.value;
      render();
    };
    document.getElementById("record-kind").onchange = (e) => {
      kind = e.target.value;
      render();
    };
    document.getElementById("record-search").oninput = (e) => {
      search = e.target.value;
      render();
    };
    if (focused?.startsWith("record-")) {
      document.getElementById(focused)?.focus();
      if (focused === "record-search")
        document.getElementById(focused)?.setSelectionRange(position, position);
    }
  }
  window.addEventListener("titan:history-updated", render);
  window.addEventListener("titan:catalog-ready", render);
  document.addEventListener("DOMContentLoaded", render);
  render();
})();
