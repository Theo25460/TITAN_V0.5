(function () {
  "use strict";
  const R = window.TitanRenaissance,
    I = window.TitanInsights;
  let exercise = "",
    first = "",
    second = "";
  const selectedLogs = () => {
    const days =
        Number(document.getElementById("progress-period")?.value) || 30,
      sport = document.getElementById("progress-sport")?.value || "all";
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - days + 1);
    return I.active(window.state?.history)
      .filter(
        (l) =>
          new Date(l.date) >= from && (sport === "all" || l.sport === sport),
      )
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  };
  const measure = (l) => ({
    duration: window.TitanTraining.duration(l),
    distance: l.unit === "km" ? I.num(l.val) : null,
    volume: l.details?.exercises?.length
      ? I.strength([l]).reduce((n, e) => n + e.volume, 0)
      : null,
    rpe:
      I.num(l.details?.bio?.rpe) >= 1 && I.num(l.details?.bio?.rpe) <= 10
        ? I.num(l.details?.bio?.rpe)
        : null,
  });
  function compare(logs) {
    if (logs.length < 2)
      return `<section class="r-panel r-block"><span class="r-eyebrow">COMPRENDRE LES ÉCARTS</span><h2 style="margin-top:10px">Comparer deux séances</h2><p style="margin-top:12px">Il faut deux séances d’un même sport pour construire une comparaison utile. Change le sport ou la période, ou reviens après une nouvelle séance.</p></section>`;
    if (!logs.some((l) => l.id === first)) first = logs[0].id;
    const a = logs.find((l) => l.id === first),
      candidates = logs.filter((l) => l.sport === a.sport && l.id !== first);
    if (!candidates.some((l) => l.id === second))
      second = candidates[0]?.id || "";
    const b = candidates.find((l) => l.id === second),
      m1 = measure(a),
      m2 = b ? measure(b) : {};
    const options = (entries, id) =>
      entries
        .map(
          (l) =>
            `<option value="${R.esc(l.id)}" ${l.id === id ? "selected" : ""}>${R.esc(R.sport(l.sport))} · ${new Date(l.date).toLocaleDateString("fr-FR")} · ${R.fmt(l.val)} ${R.esc(l.unit)}</option>`,
        )
        .join("");
    const rows = [
      ["Durée", "duration", "min"],
      ["Distance", "distance", "km"],
      ["Volume déclaré", "volume", "kg"],
      ["Ressenti renseigné", "rpe", "/10"],
    ].filter(
      ([, key]) =>
        m1[key] !== null || (m2[key] !== null && m2[key] !== undefined),
    );
    return `<section class="r-panel r-block"><div class="r-section-head"><h2>Deux séances, avec du contexte.</h2>${R.icon("layers")}</div><div class="r-compare-grid"><label>Première séance<select id="compare-first">${options(logs, first)}</select></label><label>Seconde séance du même sport<select id="compare-second" ${!b ? "disabled" : ""}>${b ? options(candidates, second) : "<option>Aucune autre séance de ce sport</option>"}</select></label></div>${b ? `<div class="r-table-scroll"><table class="r-data-table"><caption class="r-small">Première séance comparée à la seconde · ${R.esc(R.sport(a.sport))}</caption><thead><tr><th>Mesure</th><th>Première</th><th>Seconde</th><th>Écart</th></tr></thead><tbody>${rows.map(([label, key, unit]) => `<tr><th scope="row">${label}</th><td>${m1[key] !== null ? R.fmt(m1[key]) : "—"} ${m1[key] !== null ? unit : ""}</td><td>${m2[key] !== null ? R.fmt(m2[key]) : "—"} ${m2[key] !== null ? unit : ""}</td><td>${m1[key] !== null && m2[key] !== null ? (m1[key] - m2[key] > 0 ? "+" : "") + R.fmt(m1[key] - m2[key]) + " " + unit : "Non comparable"}</td></tr>`).join("")}</tbody></table></div><div class="r-shortcuts"><a class="r-button subtle" href="/journal?session=${encodeURIComponent(a.id)}">Première séance ${R.icon("arrow")}</a><a class="r-button subtle" href="/journal?session=${encodeURIComponent(b.id)}">Seconde séance ${R.icon("arrow")}</a></div>` : ""}<p class="r-measure-caption">Un écart décrit les données saisies, pas une amélioration automatique. Le parcours, les exercices, les conditions et l’intention de la séance peuvent différer. Aucun ressenti manquant n’est remplacé par une valeur moyenne.</p></section>`;
  }
  function render() {
    let host = document.getElementById("sport-detail-insights");
    if (!host) return;
    const focused = document.activeElement?.id,
      logs = selectedLogs(),
      strength = I.strength(logs),
      climbing = I.climbing(logs),
      distance = logs.filter((l) => l.unit === "km");
    if (!strength.some((e) => e.key === exercise))
      exercise = strength[0]?.key || "";
    const selected = strength.find((e) => e.key === exercise),
      trendData = I.exerciseTrend(selected),
      trend = trendData.points,
      max = Math.max(1, ...trend.map((t) => t.value));
    const families = [...new Set(logs.map((l) => l.sport))]
      .map((sport) => {
        const rows = logs.filter((l) => l.sport === sport);
        return {
          sport,
          count: rows.length,
          days: new Set(rows.map((l) => window.TitanTraining.dateKey(l.date)))
            .size,
        };
      })
      .sort((a, b) => b.count - a.count);
    host.innerHTML = `${strength.length ? `<section class="r-panel r-block"><div class="r-section-head"><div><span class="r-eyebrow">MUSCULATION · SÉRIES RÉELLES</span><h2 style="margin-top:8px">Tes exercices, dans le détail.</h2></div><a href="/records">Records ${R.icon("arrow")}</a></div><label class="r-small">Exercice et variante <select id="exercise-trend">${strength.map((e) => `<option value="${R.esc(e.key)}" ${e.key === exercise ? "selected" : ""}>${R.esc(e.name)}${e.variant ? " · " + R.esc(e.variant) : ""}</option>`).join("")}</select></label><div class="r-strength-trend" aria-label="Dernières séances de cet exercice. Chaque barre ouvre la séance source.">${trend.map((t) => `<a href="/journal?session=${encodeURIComponent(t.log.id)}" style="height:${Math.max(3, (t.value / max) * 100)}%" title="${new Date(t.log.date).toLocaleDateString("fr-FR")} : ${R.fmt(t.value)} ${trendData.unit}" aria-label="${R.esc(selected.name)}, ${new Date(t.log.date).toLocaleDateString("fr-FR")}, ${R.fmt(t.value)} ${trendData.unit}. Ouvrir la séance."></a>`).join("")}</div><p class="r-measure-caption">${selected?.volume ? "Volume = somme des charges × répétitions des séries renseignées." : "Exercice au poids du corps : nombre de répétitions enregistrées."} Les noms et variantes restent séparés. Ce graphique décrit tes séances ; il ne mesure pas à lui seul un gain de force.</p><div class="r-table-scroll"><table class="r-data-table"><thead><tr><th>Exercice</th><th>Séances</th><th>Séries</th><th>Répétitions</th><th>Volume déclaré</th></tr></thead><tbody>${strength.map((e) => `<tr><th scope="row">${R.esc(e.name)}${e.variant ? "<br><small>" + R.esc(e.variant) + "</small>" : ""}</th><td>${new Set(e.sessions.map((s) => s.log.id)).size}</td><td>${R.fmt(e.sets)}</td><td>${R.fmt(e.reps)}</td><td>${e.volume ? R.fmt(e.volume) + " kg" : "Poids du corps"}</td></tr>`).join("")}</tbody></table></div></section>` : ""}
  ${climbing.length ? `<section class="r-panel r-block"><div class="r-section-head"><div><span class="r-eyebrow">ESCALADE · DES COTATIONS QUI GARDENT LEUR SENS</span><h2 style="margin-top:8px">Essais, réussites et contexte.</h2></div>${R.icon("mountain")}</div><div class="r-table-scroll"><table class="r-data-table"><thead><tr><th>Pratique et système</th><th>Lieu / assurage</th><th>Séances</th><th>Essais saisis</th><th>Réussites saisies</th><th>Cotation réussie</th></tr></thead><tbody>${climbing.map((c) => `<tr><th scope="row">${R.esc(c.discipline)}<br><small>${R.esc(c.system)}</small></th><td>${R.esc([c.location, c.belay].filter(Boolean).join(" · ")) || "—"}</td><td>${c.sessions.length}</td><td>${c.attemptsMeasured ? R.fmt(c.attempts) : "—"}</td><td>${c.successesMeasured ? R.fmt(c.successes) : "—"}</td><td>${c.best ? `<a href="/journal?session=${encodeURIComponent(c.best.log.id)}">${R.esc(c.best.label)}</a>` : "—"}</td></tr>`).join("")}</tbody></table></div><p class="r-measure-caption">Bloc et voie, systèmes de cotation, lieux et assurages restent séparés. Les cotations non reconnues restent dans le journal ; elles ne sont pas classées arbitrairement. Les essais et réussites manquants ne sont pas estimés.</p></section>` : ""}
  ${
    distance.length
      ? `<section class="r-panel r-block"><div class="r-section-head"><div><span class="r-eyebrow">DISTANCE · DURÉE · ALLURE</span><h2 style="margin-top:8px">Relier les chiffres à tes sorties.</h2></div>${R.icon("route")}</div><div class="r-table-scroll"><table class="r-data-table"><thead><tr><th>Séance</th><th>Distance</th><th>Durée</th><th>Allure moyenne</th><th>Vitesse moyenne</th></tr></thead><tbody>${distance
          .slice(0, 15)
          .map((l) => {
            const min = window.TitanTraining.duration(l),
              pace =
                min !== null && Number(l.val) > 0 ? min / Number(l.val) : null,
              totalSeconds = pace === null ? null : Math.round(pace * 60);
            return `<tr><th scope="row"><a href="/journal?session=${encodeURIComponent(l.id)}">${R.esc(R.sport(l.sport))} · ${new Date(l.date).toLocaleDateString("fr-FR")}</a></th><td>${R.fmt(l.val)} km</td><td>${min !== null ? R.fmt(min) + " min" : "—"}</td><td>${totalSeconds !== null ? `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")} /km` : "—"}</td><td>${min > 0 ? R.fmt((Number(l.val) / min) * 60) + " km/h" : "—"}</td></tr>`;
          })
          .join(
            "",
          )}</tbody></table></div><p class="r-measure-caption">Les 15 dernières sorties de la période. Allure = durée ÷ distance ; vitesse = distance ÷ durée. La durée peut être saisie ou issue du temps de déplacement du fichier GPX. Les arrêts, le dénivelé et le terrain peuvent modifier la comparaison.</p></section>`
      : ""
  }
  ${compare(logs)}${families.length ? `<section class="r-block"><div class="r-section-head"><div><span class="r-eyebrow">CHAQUE DISCIPLINE A SA PLACE</span><h2 style="margin-top:8px">Ta pratique par sport</h2></div><a href="/adventure">Continuer l’aventure ${R.icon("arrow")}</a></div><div class="r-mastery-grid">${families.map((f) => `<a class="r-mastery-card" href="/journal?sport=${encodeURIComponent(f.sport)}">${R.icon("medal")}<h3>${R.esc(R.sport(f.sport))}</h3><strong>${f.count} <small>séances</small></strong><p>${f.days} jours de pratique sur la période choisie.</p></a>`).join("")}</div><p class="r-measure-caption">Des repères de pratique enregistrée. Ils ne constituent pas un score de santé ou une certification de maîtrise sportive.</p></section>` : ""}`;
    document
      .getElementById("exercise-trend")
      ?.addEventListener("change", (e) => {
        exercise = e.target.value;
        render();
      });
    document
      .getElementById("compare-first")
      ?.addEventListener("change", (e) => {
        first = e.target.value;
        render();
      });
    document
      .getElementById("compare-second")
      ?.addEventListener("change", (e) => {
        second = e.target.value;
        render();
      });
    if (["exercise-trend", "compare-first", "compare-second"].includes(focused))
      document.getElementById(focused)?.focus();
  }
  window.addEventListener("titan:history-updated", render);
  window.addEventListener("titan:catalog-ready", render);
  document
    .getElementById("progress-period")
    ?.addEventListener("change", render);
  document.getElementById("progress-sport")?.addEventListener("change", render);
  render();
})();
