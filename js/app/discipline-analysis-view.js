/* TITAN — V1.7.5 Analyse avancée par discipline, on Progrès › Semaine (stats.html).
   Three depth views from js/core/discipline-analysis.js (shared with Android): endurance on a comparable route and distance, force
   per exercise and variant, escalade per grade scale. Each metric shows its value side by side with the reference (the period
   before, a training block or one session), its coverage, its rule and its source, and every session behind it opens in the
   journal. A missing value stays « — » and a session without the value stays a gap in the series: nothing is interpolated.
   A plain-text reading of the result is given under the table. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const A = () => window.TitanDisciplineAnalysis;
  const SP = () => window.TitanSports;
  const D = () => window.TitanData;
  const logs = () => window.state?.history || [];
  const DISC = [["endurance", "Endurance"], ["strength", "Force"], ["climbing", "Escalade"]];
  const WEEKS = [6, 12, 26];
  const DIR = { better: "en progrès", worse: "en retrait", stable: "stable" };

  const ui = { discipline: "endurance", sport: null, group: null, reference: "period", weeks: 12 };

  function referenceOf(value, blocks) {
    if (value === "none") return null;
    if (value.startsWith("block:")) {
      const b = blocks.find((x) => `block:${x.id}` === value);
      return b ? { kind: "block", id: b.id, title: b.title, start: b.start, end: b.end } : { kind: "period" };
    }
    if (value.startsWith("session:")) return { kind: "session", id: value.slice(8) };
    return { kind: "period" };
  }
  const byId = (id) => logs().find((l) => String(l.id) === String(id) || l.client_event_id === id);
  const sessionLink = (id, now) => {
    const l = byId(id);
    const when = l ? A().dateText(new Date(l.date).getTime(), now) : id;
    return `<a href="/journal?session=${encodeURIComponent(id)}" data-analysis-source="${esc(id)}">${esc(when)}</a>`;
  };

  function sideCell(side, now) {
    if (!side) return `<td data-side="none">—</td>`;
    const proof = side.from ? `<small>${sessionLink(side.from, now)}</small>` : "";
    return `<td data-side="${side.measured ? "measured" : "absent"}"><strong>${esc(side.display)}</strong>${proof}<small>${side.measured}/${side.total} séance${side.total > 1 ? "s" : ""}${side.missing ? ` · ${esc(side.missing)}` : ""}</small></td>`;
  }

  function seriesHtml(v, now) {
    const pts = v.series;
    if (!pts.length) return "";
    const values = pts.map((p) => p.value).filter((x) => x !== null);
    const lower = v.rows.find((r) => r.id === v.seriesMetric)?.better === "lower";
    const max = Math.max(...values), min = Math.min(...values);
    // A taller bar is better (faster, heavier, harder); a session without the value is an empty slot, never filled in.
    const h = (x) => (x === null ? 0 : max === min ? 70 : Math.round(25 + (75 * (lower ? max - x : x - min)) / (max - min)));
    const label = (p) => `${A().dateText(new Date(p.date).getTime(), now)} : ${p.display}${p.side === "reference" ? " (référence)" : ""}`;
    const metric = v.rows.find((r) => r.id === v.seriesMetric)?.label.replace(/ \(médiane\)$/, "") || "";
    return `<figure class="da-series"><figcaption class="asc-small asc-muted">${esc(metric)} séance par séance · ${A().DISCIPLINES[v.discipline] === "Escalade" ? "barre plus haute : cotation plus dure" : "barre plus haute : meilleur"}</figcaption>
      <div class="wk-chart" role="img" aria-label="${esc(pts.map(label).join(", "))}">${pts.map((p) => `<span class="wk-col${p.side === "reference" ? " is-ref" : ""}${p.value === null ? " is-gap" : ""}" data-point="${esc(p.id)}"><span class="wk-col-bar" style="--h:${h(p.value)}%"></span><span class="wk-col-l">${esc(p.value === null ? "—" : A().dateText(new Date(p.date).getTime(), now))}</span></span>`).join("")}</div>
      <p class="asc-small asc-faint wk-values">${pts.map((p) => esc(label(p))).join(" · ")}</p></figure>`;
  }

  function levelsHtml(v) {
    if (!v.levels) return "";
    const ref = new Map((v.levels.reference || []).map((l) => [l.grade, l]));
    const grades = [...new Set([...(v.levels.current || []), ...(v.levels.reference || [])].sort((a, b) => b.score - a.score).map((l) => l.grade))];
    if (!grades.length) return "";
    const cur = new Map((v.levels.current || []).map((l) => [l.grade, l]));
    const cell = (l) => (l ? `${l.done} réussie${l.done > 1 ? "s" : ""} · ${l.tried} tentée${l.tried > 1 ? "s" : ""}${l.measured ? `<small>${l.successes}/${l.attempts} réussites/essais</small>` : ""}` : "—");
    return `<div class="compare-table-wrap" tabindex="0" role="region" aria-label="Niveaux de cotation"><table class="compare-table" data-levels><caption>Par niveau, en ${esc(v.group.scale)} : séances dont c’est la meilleure réussite ou la meilleure tentative</caption>
      <thead><tr><th scope="col">Niveau</th><th scope="col">Période</th>${v.levels.reference ? `<th scope="col">Référence</th>` : ""}</tr></thead>
      <tbody>${grades.map((g) => `<tr data-level="${esc(g)}"><th scope="row">${esc(g)}</th><td>${cell(cur.get(g))}</td>${v.levels.reference ? `<td>${cell(ref.get(g))}</td>` : ""}</tr>`).join("")}</tbody></table></div>`;
  }

  function html() {
    if (!A() || !logs().length) return "";
    const now = Date.now();
    const blocks = (D()?.blocks?.() || []).filter((b) => b.start && b.end && b.state !== "removed");
    const sports = ui.discipline === "endurance" ? A().sports(logs(), "endurance") : [];
    if (ui.discipline === "endurance" && !sports.some((s) => s.sport === ui.sport)) ui.sport = sports[0]?.sport || null;
    const sport = ui.discipline === "endurance" ? ui.sport || undefined : undefined;
    const groups = A().groups(logs(), ui.discipline, { sport });
    if (!groups.some((g) => g.id === ui.group)) ui.group = groups[0]?.id || null;
    const v = A().view(logs(), { discipline: ui.discipline, sport, group: ui.group || undefined, now: new Date(now), weeks: ui.weeks, reference: referenceOf(ui.reference, blocks) });
    if (!v) return "";
    const members = v.group ? [...new Set([...(v.current.sessions || []), ...((v.reference && v.reference.kind !== "session" && v.reference.sessions) || [])])] : [];
    const refOptions = [["period", `${ui.weeks} semaines d’avant`], ...blocks.map((b) => [`block:${b.id}`, `Bloc « ${b.title} »`]), ...logs().filter((l) => v.group && (l.sport === v.group.sport)).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 40).map((l) => [`session:${l.client_event_id || l.id}`, `Séance du ${A().dateText(new Date(l.date).getTime(), now)}${members.includes(l.id) ? "" : " (hors groupe)"}`]), ["none", "Aucune référence"]];
    if (!refOptions.some(([k]) => k === ui.reference)) ui.reference = "period";
    const select = (name, label, options, value) => `<label class="asc-field da-field"><span>${esc(label)}</span><select data-analysis-${name}>${options.map(([k, t]) => `<option value="${esc(k)}"${k === value ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
    const controls = `<div class="asc-seg da-disc" role="group" aria-label="Discipline">${DISC.map(([k, t]) => `<button type="button" data-analysis-discipline="${k}" aria-pressed="${ui.discipline === k}">${t}</button>`).join("")}</div>
      <div class="da-controls">${ui.discipline === "endurance" ? select("sport", "Sport", sports.map((s) => [s.sport, `${s.label} (${s.sessions})`]), ui.sport) : ""}
      ${groups.length ? select("group", ui.discipline === "endurance" ? "Sorties comparables" : ui.discipline === "strength" ? "Exercice et variante" : "Échelle et discipline", groups.map((g) => [g.id, `${g.label} · ${g.sessions} séance${g.sessions > 1 ? "s" : ""}`]), ui.group) : ""}
      ${select("weeks", "Période", WEEKS.map((w) => [String(w), `${w} dernières semaines`]), String(ui.weeks))}
      ${v.group ? select("reference", "Comparer avec", refOptions, ui.reference) : ""}</div>`;
    const status = v.status === "ok" ? "" : v.status === "limited" ? "Analyse avec limites" : "Données insuffisantes pour une tendance";
    const body = !v.group ? `<p class="asc-small" data-analysis-empty>${esc(v.limits.join(" "))}</p>` : `
      ${status ? `<p class="asc-small da-status" data-analysis-status-text>${esc(status)}</p>` : ""}
      <div class="compare-table-wrap" tabindex="0" role="region" aria-label="Analyse côte à côte, tableau défilant"><table class="compare-table da-table" data-analysis-table>
        <caption>${esc(v.group.label)}</caption>
        <thead><tr><th scope="col">Mesure</th><th scope="col">Période<small>${esc(v.current.label)}</small></th><th scope="col">Référence<small>${esc(v.reference ? v.reference.label : "aucune")}</small></th><th scope="col">Écart</th></tr></thead>
        <tbody>${v.rows.map((r) => `<tr data-metric="${esc(r.id)}" data-status="${esc(r.status)}" data-direction="${esc(r.direction)}"><th scope="row">${esc(r.label)}<details class="da-rule"><summary>Règle et source</summary><small>${esc(r.rule)}</small><small>Source : ${esc(r.provenance)}</small>${r.current.sessions.length ? `<small>Séances : ${r.current.sessions.map((id) => sessionLink(id, now)).join(", ")}</small>` : ""}</details></th>${sideCell(r.current, now)}${v.reference && v.reference.status === "ok" ? sideCell(r.reference, now) : `<td data-side="none">—</td>`}<td>${esc(DIR[r.direction] || (r.reason === "short" ? "sans verdict" : "—"))}</td></tr>`).join("")}</tbody>
      </table></div>
      ${v.reference?.note ? `<p class="asc-small da-note" data-analysis-reference-note>${esc(v.reference.note)}</p>` : ""}
      ${seriesHtml(v, now)}
      ${levelsHtml(v)}
      <details class="da-criteria"><summary>Règle du groupe (version ${esc(v.version)})</summary><ul class="asc-small">${v.group.criteria.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></details>
      <section class="da-reading" aria-label="Lecture du résultat"><h4>Lecture</h4><ul class="asc-small" data-analysis-reading>${A().reading(v).map((t) => `<li>${esc(t)}</li>`).join("")}</ul></section>`;
    return `<section class="asc-section da" id="analyse-discipline" data-analysis data-discipline="${esc(v.discipline)}" data-status="${esc(v.status)}" data-signature="${esc(v.signature)}" aria-labelledby="da-title">
      <div class="asc-section-head"><h2 id="da-title">Analyse par discipline</h2></div>
      <p class="asc-small asc-muted">Une mesure propre à ta discipline, comparée à une période, un bloc ou une séance, avec les séances qui l’expliquent. Seules les séances confirmées comptent ; une valeur absente reste absente.</p>
      ${controls}${body}</section>`;
  }

  /** Re-render through `rerender`, then put the focus back on the control that changed. */
  function bind(root, rerender) {
    const again = (selector) => { rerender(); root.querySelector(selector)?.focus({ preventScroll: true }); };
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-analysis-discipline]");
      if (!b) return;
      ui.discipline = b.dataset.analysisDiscipline;
      ui.group = null;
      ui.reference = "period";
      again(`[data-analysis-discipline="${ui.discipline}"]`);
    });
    root.addEventListener("change", (e) => {
      const s = e.target.closest("select");
      if (!s || !s.closest("[data-analysis]")) return;
      if (s.hasAttribute("data-analysis-sport")) { ui.sport = s.value; ui.group = null; ui.reference = "period"; again("[data-analysis-sport]"); }
      else if (s.hasAttribute("data-analysis-group")) { ui.group = s.value; ui.reference = "period"; again("[data-analysis-group]"); }
      else if (s.hasAttribute("data-analysis-weeks")) { ui.weeks = Number(s.value) || 12; again("[data-analysis-weeks]"); }
      else if (s.hasAttribute("data-analysis-reference")) { ui.reference = s.value; again("[data-analysis-reference]"); }
    });
  }

  window.TitanDisciplineAnalysisView = { html, bind, state: ui };
})();
