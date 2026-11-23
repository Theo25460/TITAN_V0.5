/* V1.7.2 — Planifié et réalisé: the week as planned on its Monday, the athlete's decisions and the sessions really done, in Séance ›
   Prévoir (this week) and in Progrès › Semaine (any week kept). Rules and words: js/core/week-plan.js (same module on Android).
   Every change is an explicit action of the athlete; a session is never changed here — it is only tied to an occurrence. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const F = () => window.TitanFormat;
  const SP = () => window.TitanSports;
  const P = () => window.TitanProgress;
  const D = () => window.TitanData;
  const WP = () => window.TitanWeekPlan;
  const label = (s) => SP().label(s);
  const idOf = (l) => String(l?.client_event_id || l?.details?.client_event_id || l?.id || "");
  const logOf = (id) => (window.state?.history || []).find((l) => idOf(l) === id) || null;
  const dateOf = (k) => new Date(`${k}T12:00:00`);
  const dayLong = (k) => dateOf(k).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const dayShort = (k) => dateOf(k).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });

  /** The session's own measures, read from the journal entry (never from the plan). */
  function measures(log) {
    if (!log) return "";
    const parts = [];
    const m = P().minutesOf(log);
    if (m?.minutes && !m.estimated) parts.push(F().duration(m.minutes));
    if (log.unit === "km" && Number(log.val) > 0) parts.push(F().distance(Number(log.val)));
    const elev = Number(log.details?.elevation ?? log.details?.elevationGain);
    if (elev > 0) parts.push(`D+ ${Math.round(elev)} m`);
    if (log.syncStatus === "pending") parts.push("en attente d’envoi");
    return parts.join(" · ");
  }
  const sessionLine = (id) => {
    const l = logOf(id);
    if (!l) return "";
    const m = measures(l);
    return `<a class="asc-small" href="/journal?session=${encodeURIComponent(id)}">${esc(label(l.sport))} · ${esc(dayShort(WP().sessionDay(l)))}${m ? ` · ${esc(m)}` : ""}</a>`;
  };

  function referenceNote(v) {
    const s = v.reference.source;
    if (s === "reconstructed") return "Programme de départ reconstitué : cette semaine est antérieure au suivi des semaines, TITAN reprend la semaine type connue à ce moment-là.";
    const pending = WP().revisions(window.state?.user?.schedule || {}).find((r) => r.from && r.from > v.week);
    const start = `Programme de départ : ta semaine type en vigueur le ${dayLong(v.week)}.`;
    return v.current && pending ? `${start} Ta semaine type modifiée s’applique à partir du ${dayLong(pending.from)}.` : start;
  }

  function occurrenceRow(o, v) {
    const w = WP().describe(o, { label });
    const planned = `${label(o.planned.sport)} · ${dayShort(o.planned.day)}${o.planned.minutes ? ` · ${F().duration(o.planned.minutes)}` : ""}`;
    const fam = SP().familyOf(o.effective.sport);
    return `<div class="asc-row wp-occ" data-occurrence="${esc(o.id)}" data-status="${esc(o.status)}"${o.gap ? ` data-gap="${esc(o.gap)}"` : ""}>
      <span class="asc-row-icon" data-family="${esc(fam)}">${icon(o.status === "done" ? "check" : SP().iconOf(o.effective.sport))}</span>
      <span class="asc-row-main"><span class="asc-row-title">${esc(planned)}</span>
        <span class="asc-row-sub" data-occurrence-status>${esc(w.status)}</span>
        ${o.link ? `<span class="asc-row-sub" data-occurrence-session>${sessionLine(o.link.session)}</span>` : ""}
        ${w.notice ? `<span class="asc-row-sub wp-notice" role="note">${icon("info")} ${esc(w.notice)}</span>` : ""}
      </span>
      ${v.editable ? `<button type="button" class="asc-btn ${o.status === "ask" ? "asc-btn-primary" : "asc-btn-ghost"} asc-btn-sm" data-occurrence-act="${esc(o.id)}" aria-label="${esc(`${o.status === "ask" ? "Choisir" : "Ajuster"} : ${planned}`)}">${o.status === "ask" ? "Choisir" : "Ajuster"}</button>` : ""}
    </div>`;
  }

  /** The section for one week. options: { title, editable } */
  function html(v, { title = "Prévu et réalisé", editable = true } = {}) {
    if (!v) return "";
    v.editable = editable;
    const b = WP().summarize(v);
    if (!v.summary.planned && !v.extra.length) return "";
    const extra = v.extra.filter((e) => !e.ask);
    return `<section class="asc-section wp-week" data-week-plan="${esc(v.week)}" aria-labelledby="wp-title-${esc(v.week)}">
      <div class="asc-section-head"><h2 id="wp-title-${esc(v.week)}">${esc(title)}</h2><span class="asc-small asc-muted" data-week-gaps>${v.summary.gaps} écart${v.summary.gaps > 1 ? "s" : ""}</span></div>
      <div class="wp-bilan" data-week-bilan><p class="asc-small">${esc(b.start)}</p>${b.changes ? `<p class="asc-small">${esc(b.changes)}</p>` : ""}${b.result ? `<p class="asc-small"><strong>${esc(b.result)}</strong></p>` : ""}</div>
      ${v.occurrences.length ? `<div class="asc-list">${v.occurrences.map((o) => occurrenceRow(o, v)).join("")}</div>` : ""}
      ${extra.length ? `<h3 class="asc-small asc-muted wp-extra-title">Hors programme</h3><ul class="wp-extra" data-week-extra>${extra.map((e) => `<li data-extra="${esc(e.id)}">${sessionLine(e.id)}</li>`).join("")}</ul>` : ""}
      <p class="asc-small asc-faint">${esc(referenceNote(v))} ${esc(WP().RULES.gap)} Les mesures affichées sont celles du journal.</p>
    </section>`;
  }

  /* ---------- Decisions ---------- */
  let dialog = null;
  function open(v, id, opener, onDone) {
    const o = v.occurrences.find((x) => x.id === id);
    if (!o || dialog?.open) return;
    const owner = D().owner();
    const w = WP().describe(o, { label });
    const body = document.createElement("div");
    body.className = "asc-stack";
    const days = Array.from({ length: 7 }, (_, i) => WP().addDays(v.week, i));
    const free = v.extra.map((e) => e.id).filter((x) => !o.candidates.includes(x));
    const sessionBtn = (sid, text) => `<button type="button" class="asc-row" data-link="${esc(sid)}"><span class="asc-row-main"><span class="asc-row-title">${esc(text)}</span><span class="asc-row-sub">${esc((() => { const l = logOf(sid); return l ? `${label(l.sport)} · ${dayLong(WP().sessionDay(l))}${measures(l) ? ` · ${measures(l)}` : ""}` : ""; })())}</span></span></button>`;
    const recent = [...new Set([o.planned.sport, ...(window.state?.history || []).slice(-60).map((l) => l.sport), ...SP().POPULAR])].filter((s) => window.SPORTS_CONFIG?.[s]).slice(0, 10);
    body.innerHTML = `
      <p class="asc-small">${esc(w.status)}</p>
      ${w.notice ? `<p class="asc-small" role="note">${icon("info")} ${esc(w.notice)}</p>` : ""}
      ${o.candidates.length ? `<section class="asc-stack" aria-label="Séances possibles"><h3 class="asc-small">Quelle séance correspond à ${esc(w.plan)} ?</h3><div class="asc-list">${o.candidates.map((c) => sessionBtn(c, "C’est celle-ci")).join("")}</div>
        <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-none>Aucune de ces séances</button></section>` : ""}
      ${free.length ? `<details><summary>Relier une autre séance de la semaine</summary><div class="asc-list">${free.map((c) => sessionBtn(c, "Relier cette séance")).join("")}</div></details>` : ""}
      <details><summary>Déplacer à un autre jour</summary><div class="seance-chips">${days.map((d) => `<button type="button" class="seance-chip" data-move="${esc(d)}" aria-pressed="${d === o.effective.day}">${esc(dayShort(d))}</button>`).join("")}</div></details>
      <details><summary>Remplacer par un autre sport</summary><div class="seance-chips">${recent.map((s) => `<button type="button" class="seance-chip" data-replace="${esc(s)}" aria-pressed="${s === o.effective.sport}">${esc(label(s))}</button>`).join("")}</div></details>
      <div class="asc-confirm-actions">${o.decision ? `<button type="button" class="asc-btn asc-btn-ghost" data-reset>Annuler ma décision</button>` : ""}${o.decision?.kind !== "skip" ? `<button type="button" class="asc-btn asc-btn-secondary" data-skip>Écarter cette séance</button>` : ""}</div>
      <p class="asc-small jr-edit-error" role="alert" hidden></p>`;
    const err = body.querySelector(".jr-edit-error");
    dialog = window.titanShell.sheet({ title: w.plan, eyebrow: "Planifié et réalisé", body, onClose: () => { dialog = null; if (opener?.isConnected) opener.focus({ preventScroll: true }); } });
    const d = dialog;
    const apply = (decision, ok) => {
      if (D().owner() !== owner || window.titanAccountTransition?.active) { d.close(); return; }
      try {
        D().decideOccurrence(o.id, decision);
      } catch (e) {
        err.textContent = /OTHER_WEEK/.test(e.message) ? "Une séance prévue se déplace dans sa semaine. Sinon, écarte-la." : "Ce choix n’a pas pu être enregistré.";
        err.hidden = false;
        return;
      }
      d.close();
      window.titanShell.toast({ type: "ok", title: ok });
      onDone?.();
    };
    body.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || !d.open) return;
      if (b.dataset.link) apply({ kind: "link", session: b.dataset.link }, "Séance reliée");
      else if (b.hasAttribute("data-none")) apply({ kind: "none" }, "Noté : aucune de ces séances");
      else if (b.dataset.move) apply({ kind: "move", day: b.dataset.move }, `Déplacée ${dayLong(b.dataset.move)}`);
      else if (b.dataset.replace) apply({ kind: "replace", sport: b.dataset.replace, day: o.effective.day }, `Remplacée par ${label(b.dataset.replace)}`);
      else if (b.hasAttribute("data-skip")) apply({ kind: "skip" }, "Séance écartée");
      else if (b.hasAttribute("data-reset")) apply({ kind: "reset" }, "Décision annulée");
    });
  }

  /** Delegated actions on a host that renders html(); `view()` returns the week shown. */
  function bind(host, view, onDone) {
    host.addEventListener("click", (e) => {
      const b = e.target.closest("[data-occurrence-act]");
      if (!b || !host.contains(b)) return;
      const v = view();
      if (v) open(v, b.dataset.occurrenceAct, b, onDone);
    });
  }

  window.TitanWeekPlanView = { html, bind, measures };
})();
