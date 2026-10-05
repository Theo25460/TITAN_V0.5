/* TITAN 300 — Séance · Prévoir: a typical week as a gentle reference, and this week planned vs done. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const F = () => window.TitanFormat;
  const SP = () => window.TitanSports;
  const D = () => window.TitanData;
  const P = () => window.TitanProgress;
  const DAY = 86400000;
  const NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

  let root = null;

  function weekState() {
    const start = F().weekStart(new Date()).getTime();
    const todayIdx = (new Date().getDay() + 6) % 7;
    const logs = P().activeLogs(window.state?.history || []);
    return D().plan().map((p, i) => {
      const date = new Date(start + i * DAY);
      const key = F().dateKey(date);
      const done = logs.filter((l) => F().dateKey(l.date) === key);
      const matched = p.sport ? done.some((l) => l.sport === p.sport || SP().familyOf(l.sport) === SP().familyOf(p.sport)) : false;
      const state = done.length ? (p.sport && !matched ? "other" : "done") : i < todayIdx ? (p.sport ? "missed" : "rest") : i === todayIdx ? "today" : "future";
      return { ...p, date, done, matched, state, isToday: i === todayIdx };
    });
  }

  function dayCard(d) {
    const fam = d.sport ? SP().familyOf(d.sport) : null;
    const doneLabel = d.done.length ? d.done.map((l) => SP().label(l.sport)).join(", ") : "";
    const status =
      d.state === "done" ? `${icon("check")} ${esc(doneLabel)}` : d.state === "other" ? `${icon("check")} ${esc(doneLabel)} à la place` : d.state === "missed" ? "Non réalisée" : d.state === "rest" ? "Repos" : d.isToday ? (d.sport ? "Aujourd’hui" : "Libre") : d.sport ? "À venir" : "Libre";
    return `<button type="button" class="pv-day" data-day="${d.key}" data-state="${d.state}"${fam ? ` data-family="${esc(fam)}"` : ""} aria-label="${esc(`${NAMES[d.index]} : ${d.sport ? SP().label(d.sport) : "rien de prévu"}. ${status.replace(/<[^>]+>/g, "")}`)}">
      <span class="pv-day-head"><strong>${NAMES[d.index].slice(0, 3)}</strong><span class="asc-num">${d.date.getDate()}</span></span>
      <span class="pv-day-plan">${d.sport ? `${icon(SP().FAMILY_ICON[fam])}<span>${esc(SP().label(d.sport))}${d.minutes ? `<small>${esc(F().duration(d.minutes))}</small>` : ""}</span>` : '<span class="asc-faint">—</span>'}</span>
      <span class="pv-day-status">${status}</span>
    </button>`;
  }

  function render() {
    if (!root) return;
    const week = weekState();
    const planned = week.filter((d) => d.sport).length;
    const target = D().cadenceSettings().target;
    const today = week.find((d) => d.isToday);
    const doneDays = week.filter((d) => d.done.length).length;
    root.innerHTML = `
      ${today?.sport && !today.done.length ? `<section class="asc-hero pv-today"><p class="asc-eyebrow cy">Prévu aujourd’hui</p><h2 class="pv-today-title">${esc(SP().label(today.sport))}</h2><p class="asc-lead">${today.minutes ? `${esc(F().duration(today.minutes))}` : "Durée libre"}${today.note ? ` · ${esc(today.note)}` : ""}</p><div class="asc-row-flex"><a class="asc-btn asc-btn-primary" href="/training?sport=${encodeURIComponent(today.sport)}">${icon("plus")} Enregistrer cette séance</a></div></section>` : ""}
      <section class="asc-section"><div class="asc-section-head"><h2>Cette semaine</h2><span class="asc-small asc-muted">${doneDays} jour${doneDays > 1 ? "s" : ""} actif${doneDays > 1 ? "s" : ""} · ${planned} prévu${planned > 1 ? "s" : ""}</span></div>
        <div class="pv-week">${week.map(dayCard).join("")}</div>
        ${planned && planned < target ? `<p class="asc-note">${icon("info")}<span>Ta cadence vise ${target} jours actifs par semaine et ta semaine type en prévoit ${planned}. Les jours libres comptent aussi dès que tu bouges.</span></p>` : ""}
      </section>
      <section class="asc-section"><div class="asc-section-head"><h2>Ta semaine type</h2><span class="asc-small asc-muted">Touchez un jour pour le modifier</span></div>
        <div class="asc-list">${week
          .map(
            (d) => `<button type="button" class="asc-row" data-day="${d.key}"><span class="asc-row-icon"${d.sport ? ` data-family="${esc(SP().familyOf(d.sport))}"` : ""}>${icon(d.sport ? SP().FAMILY_ICON[SP().familyOf(d.sport)] : "moon")}</span><span class="asc-row-main"><span class="asc-row-title">${NAMES[d.index]}</span><span class="asc-row-sub">${d.sport ? `${esc(SP().label(d.sport))}${d.minutes ? ` · ${esc(F().duration(d.minutes))}` : ""}${d.note ? ` · ${esc(d.note)}` : ""}` : "Repos ou libre"}</span></span>${icon("edit")}</button>`,
          )
          .join("")}</div>
        <p class="asc-small asc-faint pv-foot">Un repère, pas une obligation : une séance différente de celle prévue compte tout autant. Rien n’est perdu si un jour saute.</p>
      </section>`;
    root.setAttribute("aria-busy", "false");
  }

  function openDay(key) {
    const d = D().plan().find((x) => x.key === key);
    if (!d) return;
    const recents = [...new Set((window.state?.history || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date)).map((l) => l.sport))].filter((s) => window.SPORTS_CONFIG?.[s]).slice(0, 8);
    const quick = [...new Set([...recents, ...SP().POPULAR])].filter((s) => window.SPORTS_CONFIG?.[s]).slice(0, 12);
    let sport = d.sport;
    const form = document.createElement("form");
    form.className = "asc-stack";
    form.noValidate = true;
    const chips = () =>
      `<div class="seance-chips">${[...new Set([...(sport ? [sport] : []), ...quick])].map((s) => `<button type="button" class="seance-chip" data-pick="${esc(s)}" aria-pressed="${s === sport}">${esc(SP().label(s))}</button>`).join("")}</div>`;
    form.innerHTML = `
      <div class="seance-search"><label class="sr-only" for="pv-q">Rechercher un sport</label><span class="seance-search-icon">${icon("search")}</span><input id="pv-q" class="asc-input" type="search" autocomplete="off" placeholder="Rechercher un sport"></div>
      <div data-results></div>
      <div data-chips>${chips()}</div>
      <div class="asc-form-grid"><label class="asc-field"><span>Durée prévue <small class="asc-faint">facultatif, en minutes</small></span><input class="asc-input" type="number" inputmode="numeric" min="5" max="600" step="5" name="minutes" value="${esc(d.minutes || "")}"></label>
      <label class="asc-field"><span>Repère <small class="asc-faint">facultatif</small></span><input class="asc-input" name="note" maxlength="80" value="${esc(d.note)}" placeholder="Fractionné, sortie longue, haut du corps…"></label></div>
      <p class="asc-small jr-edit-error" role="alert"></p>
      <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-clear>${icon("moon")} Repos / libre</button><button type="submit" class="asc-btn asc-btn-primary">Enregistrer</button></div>`;
    const dialog = window.titanShell.sheet({ title: NAMES[d.index], eyebrow: "Semaine type", body: form });
    form.addEventListener("input", (e) => {
      if (e.target.id !== "pv-q") return;
      const q = e.target.value.trim();
      form.querySelector("[data-results]").innerHTML = q
        ? `<div class="asc-list">${SP()
            .search(q, { limit: 6 })
            .map((r) => `<button type="button" class="asc-row" data-pick="${esc(r.id)}"><span class="asc-row-main"><span class="asc-row-title">${esc(r.label)}</span><span class="asc-row-sub">${esc(SP().FAMILY_LABEL[r.family])}</span></span></button>`)
            .join("")}</div>`
        : "";
    });
    form.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.pick) {
        sport = b.dataset.pick;
        form.querySelector("[data-chips]").innerHTML = chips();
        form.querySelector("[data-results]").innerHTML = "";
        form.querySelector("#pv-q").value = "";
        return;
      }
      if (b.hasAttribute("data-clear")) {
        D().setPlanDay(key, null);
        dialog.close();
        window.titanShell.toast({ type: "ok", title: `${NAMES[d.index]} libre` });
      }
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const err = form.querySelector(".jr-edit-error");
      if (!sport) return (err.textContent = "Choisis un sport, ou laisse ce jour libre.");
      const minutes = form.querySelector("[name=minutes]").value;
      if (minutes && !(Number(minutes) >= 5 && Number(minutes) <= 600)) return (err.textContent = "Une durée entre 5 minutes et 10 heures.");
      D().setPlanDay(key, { sport, minutes, note: form.querySelector("[name=note]").value });
      dialog.close();
      window.titanShell.toast({ type: "ok", title: `${NAMES[d.index]} : ${SP().label(sport)}` });
    });
  }

  let booted = false;
  function start() {
    root = document.getElementById("prevoir");
    if (!root || !window.state?.user || !window.TitanSports) return;
    if (!booted) {
      booted = true;
      SP().ensure();
      root.addEventListener("click", (e) => {
        const b = e.target.closest("[data-day]");
        if (b) openDay(b.dataset.day);
      });
    }
    render();
  }
  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      start();
    });
  };
  window.addEventListener("titan:history-updated", queue);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
