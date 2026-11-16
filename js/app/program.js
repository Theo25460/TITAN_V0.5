/* TITAN — « le programme » on the website: the renderer of js/core/program-grid.js (the same figure as the Android component
   mobile/src/components/ProgramGrid.tsx). One line per sport, one column per day (a week) or per week (a period). A cell is inked
   in the colour of the sport's family, darker when the day was long; a day still to come in the usual week is a dashed frame; a
   past day without a session is a small dot. Rest is never drawn as a fault. The figure is one accessible element (role="img")
   with a sentence, not forty unlabeled squares. Pure: it returns an HTML string and touches nothing. */
(function () {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const icon = (n) => (window.titanIcon ? window.titanIcon(n) : "");
  const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const FAMILIES = ["endurance", "force", "technique", "jeu", "mobilite"];
  const sessions = (n) => `${n} séance${n > 1 ? "s" : ""}`;
  const duration = (m) => (window.TitanFormat?.duration ? window.TitanFormat.duration(Math.round(m)) : `${Math.round(m)} min`);

  /* The same accessors as mobile/src/core/program.ts: minutes from the journal's own function, family and label from the catalogue. */
  function bound() {
    const P = window.TitanProgress, S = window.TitanSports;
    return {
      minutesOf: (l) => (P?.minutesOf ? P.minutesOf(l).minutes || 0 : Number(l?.details?.duration) || 0),
      familyOf: (s) => (S?.familyOf ? S.familyOf(s) : "endurance"),
      labelOf: (s) => (S?.label ? S.label(s) : String(s)),
    };
  }
  const week = (logs, options = {}) => window.TitanProgram.week(logs, { ...bound(), ...options });
  const span = (logs, options = {}) => window.TitanProgram.span(logs, { ...bound(), ...options });

  const fam = (family) => (FAMILIES.includes(family) ? family : "none");

  function cell(c, { planned, future, mark, title }) {
    const cls = `prg-cell${mark ? " is-mark" : ""}`;
    const tip = title ? ` title="${esc(title)}"` : "";
    if (c) return `<i class="${cls}"${tip}><b class="prg-ink" data-level="${Math.max(1, Math.min(4, c.level || 1))}"></b></i>`;
    if (planned) return `<i class="${cls}"${tip}><b class="prg-frame"></b></i>`;
    return `<i class="${cls}">${future ? "" : '<b class="prg-dot"></b>'}</i>`;
  }

  function line({ sport, label, sub, family, cells }) {
    const S = window.TitanSports;
    const mark = sport && S?.iconOf ? icon(S.iconOf(sport)) : '<span class="prg-swatch"></span>';
    return `<div class="prg-line" data-family="${fam(family)}"><span class="prg-name">${mark}<span class="prg-text"><strong>${esc(label)}</strong><small>${esc(sub)}</small></span></span><span class="prg-cells">${cells}</span></div>`;
  }

  /** The figure as an HTML string. options: { label (start of the accessible name), id, className }. */
  function html(grid, options = {}) {
    if (!grid) return "";
    const wk = grid.kind === "week" ? grid : null;
    const columns = wk ? wk.days.length : grid.columns.length;
    const empty = !grid.rows.length && !grid.more;
    const name = options.label || (wk ? "Programme de la semaine" : `Programme des ${columns} dernières semaines`);
    // A sport planned later this week that has no session yet gets its own line, so the usual week is visible from Monday morning.
    const plannedOnly = wk ? wk.planned.filter((p) => p.row < 0).reduce((list, p) => {
      const hit = list.find((x) => x.sport === p.sport);
      if (hit) hit.days.push(p.day); else list.push({ sport: p.sport, label: p.label, family: p.family, days: [p.day] });
      return list;
    }, []) : [];
    const heads = wk
      ? wk.days.map((d) => `<span class="prg-col${d.today ? " is-mark" : ""}">${d.letter}</span>`)
      : grid.columns.map((c, i, all) => {
          const text = c.current ? "Sem." : i === 0 || c.date <= 7 ? MONTHS[c.month].slice(0, 3) : all.length > 10 ? "" : String(c.date);
          return `<span class="prg-col${c.current ? " is-mark" : ""}">${text}</span>`;
        });
    const at = (i) => (wk ? { future: wk.days[i].future, mark: wk.days[i].today } : { future: false, mark: grid.columns[i].current });
    const tipOf = (c, i) => {
      if (!c) return "";
      const when = wk ? wk.days[i].name : `semaine du ${grid.columns[i].date} ${MONTHS[grid.columns[i].month]}`;
      return `${when} : ${duration(c.minutes)}${c.sessions > 1 ? `, ${sessions(c.sessions)}` : ""}`;
    };
    const rows = grid.rows.map((r, rowIndex) => line({
      sport: r.sport, label: r.label, family: r.family, sub: `${sessions(r.sessions)} · ${duration(r.minutes)}`,
      cells: r.cells.map((c, i) => cell(c, { ...at(i), planned: !!wk && wk.planned.some((p) => p.row === rowIndex && p.day === i), title: c ? tipOf(c, i) : wk ? `${wk.days[i].name} : prévu` : "" })).join(""),
    }));
    const planned = plannedOnly.map((p) => line({
      sport: p.sport, label: p.label, family: p.family, sub: "Prévu cette semaine",
      cells: wk.days.map((d) => cell(null, { planned: p.days.includes(d.index), future: true, mark: d.today, title: `${d.name} : prévu` })).join(""),
    }));
    const more = grid.more ? line({
      label: `${grid.more.sports} autre${grid.more.sports > 1 ? "s" : ""} sport${grid.more.sports > 1 ? "s" : ""}`, family: "none",
      sub: `${sessions(grid.more.sessions)} · ${duration(grid.more.minutes)}`,
      cells: grid.more.cells.map((c, i) => cell(c, { ...at(i), title: tipOf(c, i) })).join(""),
    }) : "";
    const none = empty && !plannedOnly.length ? line({
      label: "Aucune séance", family: "none", sub: wk ? "Rien encore cette semaine" : "sur cette période",
      cells: Array.from({ length: columns }, (_, i) => cell(null, at(i))).join(""),
    }) : "";
    return `<div class="prg${options.className ? " " + esc(options.className) : ""}"${options.id ? ` id="${esc(options.id)}"` : ""} data-kind="${wk ? "week" : "span"}" style="--prg-cols:${columns}" role="img" aria-label="${esc(`${name}. ${window.TitanProgram.describe(grid)}`)}">
      <div class="prg-line prg-head"><span class="prg-name"></span><span class="prg-cells">${heads.join("")}</span></div>
      ${rows.join("")}${planned.join("")}${more}${none}
    </div>`;
  }

  /** What the colours of the lines mean, for the families present in a grid (colour is never the only carrier: each line is named). */
  function legend(grid) {
    const S = window.TitanSports;
    const seen = [...new Set((grid?.rows || []).map((r) => r.family))].filter((f) => FAMILIES.includes(f));
    if (seen.length < 2) return "";
    return `<ul class="prg-legend" aria-label="Familles de sports">${seen.map((f) => `<li data-family="${f}"><i></i>${esc(S?.FAMILY_LABEL?.[f] || f)}</li>`).join("")}</ul>`;
  }

  window.TitanProgramView = { week, span, html, legend };
})();
