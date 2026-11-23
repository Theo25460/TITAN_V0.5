/* V1.7.3 — Bilan et ajustements: the bilan of a week in Progrès › Semaine (one observation, its source sessions, the actions on the
   week after) and the adjustments it decided in Séance › Prévoir (with their origin and their undo). Rules and words:
   js/core/week-review.js (same module on Android). Nothing is written until the athlete confirms in the preview; closing the bilan,
   « Pas maintenant » or « Annuler » in the preview writes nothing. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const SP = () => window.TitanSports;
  const D = () => window.TitanData;
  const WP = () => window.TitanWeekPlan;
  const WR = () => window.TitanWeekReview;
  const label = (s) => SP().label(s);
  const idOf = (l) => String(l?.client_event_id || l?.details?.client_event_id || l?.id || "");
  const logOf = (id) => (window.state?.history || []).find((l) => idOf(l) === id) || null;
  const dateOf = (k) => new Date(`${k}T12:00:00`);
  const dayLong = (k) => (k ? dateOf(k).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "");
  const dayShort = (k) => dateOf(k).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  const NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const dismissed = new Set(); // « Pas maintenant »: hidden for this page only, nothing stored.

  /** One source session: its sport, its day and its own measures, opening its sheet in the journal. */
  function source(id) {
    const l = logOf(id);
    if (!l) return "";
    const m = WR().measureOf(l);
    return `<li data-review-source="${esc(id)}"><a class="asc-small" href="/journal?session=${encodeURIComponent(id)}">${esc(label(l.sport))} · ${esc(dayShort(WP().sessionDay(l)))}${m ? ` · ${esc(m)}` : ""}</a></li>`;
  }
  function sources(ids, max = 6) {
    const list = [...new Set(ids)].filter((id) => logOf(id));
    if (!list.length) return "";
    const more = list.length - max;
    return `<details class="wr-sources" data-review-sources><summary>${list.length === 1 ? "La séance source" : `Les ${list.length} séances sources`}</summary><ul>${list.slice(0, max).map(source).join("")}</ul>${more > 0 ? `<p class="asc-small asc-faint">Et ${more} autre${more > 1 ? "s" : ""} dans le journal.</p>` : ""}</details>`;
  }

  function followUpHtml(r) {
    const f = r.followUp;
    if (!f) return "";
    const w = WR().describeFollowUp(f, { label, dayLong });
    return `<div class="wr-follow" data-review-follow="${esc(f.state || "undone")}" data-tone="${esc(w.tone)}">
      <p class="asc-small" data-review-decided>${icon("calendar")} ${esc(w.decided)}</p>
      <p class="asc-small"><strong data-review-observed>${esc(w.observed)}</strong></p>
      ${f.session ? `<ul class="wr-source-one">${source(f.session)}</ul>` : ""}
    </div>`;
  }

  function decidedHtml(r) {
    const d = r.actions.decided;
    if (!d) return "";
    const sport = d.observation?.slot?.sport;
    const what = WR().describeAction(d.action, { label, sport });
    const when = new Date(d.undone || d.at).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    if (d.undone) return `<p class="asc-small asc-muted" data-review-choice="undone">${icon("info")} Choix annulé le ${esc(when)} : ${esc(what[0].toLowerCase() + what.slice(1))}. Le programme a repris sa forme d’avant.</p>`;
    return `<div class="wr-choice" data-review-choice="on">
      <p class="asc-small">${icon("check")} <strong>Ton choix :</strong> ${esc(what)}${d.action.kind === "move" ? "" : ` (semaine du ${esc(dayLong(d.target))})`}. Choisi le ${esc(when)} à ce bilan.</p>
      ${r.actions.open ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-review-undo="${esc(r.week)}">Annuler ce choix</button>` : ""}
    </div>`;
  }

  function actionsHtml(r) {
    const a = r.actions;
    const d = a.decided;
    if (!a.open || (d && !d.undone) || dismissed.has(r.week)) return "";
    const obs = r.observation;
    const s = obs.suggestion;
    const btn = (attrs, text, primary) => `<button type="button" class="asc-btn ${primary ? "asc-btn-primary" : "asc-btn-secondary"} asc-btn-sm" ${attrs}>${esc(text)}</button>`;
    const out = [];
    if (s.kind === "move" && a.move && s.to !== null && a.move.from.includes(s.from) && a.move.to.includes(s.to)) {
      const text = s.scope === "type" ? `Garder le ${WP().DAY_NAMES[s.to]} dans ma semaine type` : `Tester le ${WP().DAY_NAMES[s.to]} la semaine prochaine`;
      out.push(btn(`data-review-act="move" data-from="${s.from}" data-to="${s.to}" data-scope="${s.scope}"`, text, true));
    }
    if (obs.kind === "short") out.push(`<a class="asc-btn asc-btn-primary asc-btn-sm" href="/training" data-review-enrich>${icon("plus")} Enrichir mon historique</a>`);
    if (a.keep) out.push(btn(`data-review-act="keep"`, obs.kind === "short" ? "Garder mon plan" : "Reconduire le plan", s.kind === "keep" && obs.kind !== "short"));
    if (a.move) out.push(btn(`data-review-act="move"${s.kind === "move" ? ` data-from="${s.from}"` : ""}`, s.kind === "move" ? "Déplacer à un autre jour" : "Déplacer un créneau", false));
    if (a.pause) out.push(btn(`data-review-act="pause"`, `Mettre la semaine du ${dayShort(a.target)} en pause`, false));
    out.push(`<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-review-dismiss="${esc(r.week)}">Pas maintenant</button>`);
    return `<div class="wr-actions" role="group" aria-label="Ajuster la semaine du ${esc(dayLong(a.target))}" data-review-actions>${out.join("")}</div>
      <p class="asc-small asc-faint">${esc(WR().RULES.choice)}</p>`;
  }

  /** The bilan of week r (WR().review). options: { title } */
  function html(r, { title = "Bilan et ajustement" } = {}) {
    if (!r || !WR()) return "";
    const obs = r.observation;
    const w = WR().describeObservation(obs, { label });
    if (obs.kind === "short" && !obs.followed && !r.followUp && !r.actions.decided && !(window.state?.history || []).length) return "";
    return `<section class="asc-section wr-review" data-week-review="${esc(r.week)}" data-observation="${esc(obs.kind)}" aria-labelledby="wr-title-${esc(r.week)}">
      <div class="asc-section-head"><h2 id="wr-title-${esc(r.week)}">${esc(title)}</h2><span class="asc-small asc-muted">Pour la semaine du ${esc(dayShort(r.target))}</span></div>
      ${followUpHtml(r)}
      <div class="wr-observation" data-review-observation>
        <p><strong>${esc(w.title)}</strong></p>
        ${w.text ? `<p class="asc-small">${esc(w.text)}</p>` : ""}
        ${w.lines?.length ? `<ul class="wr-lines">${w.lines.map((x) => `<li class="asc-small">${esc(x)}</li>`).join("")}</ul>` : ""}
        ${sources(obs.sources)}
      </div>
      ${decidedHtml(r)}
      ${actionsHtml(r)}
      <p class="asc-small asc-faint">${esc(WR().RULES.window)} ${esc(WR().RULES.count)}</p>
    </section>`;
  }

  /* ---------- The preview and the confirmation ---------- */
  let dialog = null;
  function open(r, act, opener, onDone) {
    if (dialog?.open) return;
    const owner = D().owner();
    const a = r.actions;
    const obs = r.observation;
    const ref = WP().reference(window.state?.user?.schedule || {}, a.target, { current: WP().weekOf(window.TitanFormat.dateKey(new Date())) }).days;
    const choice = act.kind === "move"
      ? { kind: "move", from: Number.isInteger(act.from) && a.move.from.includes(act.from) ? act.from : a.move.from[0], to: Number.isInteger(act.to) && a.move.to.includes(act.to) ? act.to : null, scope: act.scope === "type" ? "type" : "next" }
      : { kind: act.kind };
    if (choice.kind === "move" && choice.to === null) {
      const s = obs.suggestion;
      choice.to = s.kind === "move" && s.from === choice.from && a.move.to.includes(s.to) ? s.to : a.move.to[0];
    }
    const body = document.createElement("div");
    body.className = "asc-stack wr-sheet";
    const chip = (attr, value, text, on) => `<button type="button" class="seance-chip" ${attr}="${value}" aria-pressed="${on}">${esc(text)}</button>`;
    const draw = () => {
      let pv = null, error = "";
      try { pv = D().previewAdjustment(r.week, choice); } catch (e) { error = "Ce choix n’est pas possible pour cette semaine."; }
      const words = pv ? WR().describePreview(pv, { label, dayLong }) : null;
      body.innerHTML = `
        ${choice.kind === "move" ? `
          <fieldset class="wr-field"><legend class="asc-small">Le créneau à déplacer</legend><div class="seance-chips">${a.move.from.map((i) => chip("data-from", i, `${NAMES[i]} · ${label(ref[i]?.sport || "")}`, i === choice.from)).join("")}</div></fieldset>
          <fieldset class="wr-field"><legend class="asc-small">Vers</legend><div class="seance-chips">${a.move.to.map((i) => chip("data-to", i, NAMES[i], i === choice.to)).join("")}</div></fieldset>
          <fieldset class="wr-field"><legend class="asc-small">Appliquer à</legend><div class="seance-chips" role="radiogroup">
            ${chip("data-scope", "next", `La semaine du ${dayShort(a.target)} seulement`, choice.scope === "next")}
            ${chip("data-scope", "type", "Ma semaine type", choice.scope === "type")}</div></fieldset>` : ""}
        <section class="wr-preview" aria-live="polite" data-review-preview>
          <h3 class="asc-small">Aperçu</h3>
          ${words ? `<ul>${words.lines.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="asc-small" data-review-where>${esc(words.where)}</p><p class="asc-small asc-faint">${esc(words.undo)}</p>` : `<p class="asc-small" role="alert">${esc(error)}</p>`}
        </section>
        <p class="asc-small asc-faint">Origine : bilan de la semaine du ${esc(dayLong(r.week))} · ${esc(WR().describeObservation(obs, { label }).title)}.</p>
        <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-review-cancel>Annuler</button><button type="button" class="asc-btn asc-btn-primary" data-review-confirm ${pv ? "" : "disabled"}>Confirmer</button></div>
        <p class="asc-small jr-edit-error" role="alert" hidden></p>`;
    };
    draw();
    const titles = { keep: "Reconduire le plan", pause: "Mettre la semaine en pause", move: "Déplacer un créneau" };
    dialog = window.titanShell.sheet({ title: titles[choice.kind], eyebrow: "Bilan et ajustement", body, onClose: () => { dialog = null; if (opener?.isConnected) opener.focus({ preventScroll: true }); } });
    const d = dialog;
    body.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || !d.open) return;
      if (b.dataset.from !== undefined) { choice.from = Number(b.dataset.from); draw(); body.querySelector(`[data-from="${choice.from}"]`)?.focus(); return; }
      if (b.dataset.to !== undefined) { choice.to = Number(b.dataset.to); draw(); body.querySelector(`[data-to="${choice.to}"]`)?.focus(); return; }
      if (b.dataset.scope) { choice.scope = b.dataset.scope; draw(); body.querySelector(`[data-scope="${choice.scope}"]`)?.focus(); return; }
      if (b.hasAttribute("data-review-cancel")) { d.close(); return; }
      if (b.hasAttribute("data-review-confirm")) {
        if (D().owner() !== owner || window.titanAccountTransition?.active) { d.close(); return; }
        try {
          D().applyAdjustment(r.week, choice);
        } catch {
          const err = body.querySelector(".jr-edit-error");
          err.textContent = "Ce choix n’a pas pu être enregistré.";
          err.hidden = false;
          return;
        }
        d.close();
        window.titanShell.toast({ type: "ok", title: "Ajustement enregistré", message: `Visible dans Séance › Prévoir pour la semaine du ${dayLong(r.target)}. Tu peux l’annuler.` });
        onDone?.();
      }
    });
  }

  function undo(week, onDone) {
    try {
      const r = D().undoAdjustment(week);
      window.titanShell.toast({ type: "ok", title: "Choix annulé", message: r.kept.length ? "Une modification faite ensuite à la main a été gardée." : "Le programme a repris sa forme d’avant." });
    } catch {
      window.titanShell.toast({ type: "err", title: "Annulation impossible", message: "La semaine concernée est terminée." });
      return;
    }
    onDone?.();
  }

  /** Delegated actions on a host that renders html(); `view()` returns the bilan shown. */
  function bind(host, view, onDone) {
    host.addEventListener("click", (e) => {
      const b = e.target.closest("[data-review-act], [data-review-undo], [data-review-dismiss]");
      if (!b || !host.contains(b)) return;
      if (b.dataset.reviewDismiss) { dismissed.add(b.dataset.reviewDismiss); onDone?.(); return; }
      if (b.dataset.reviewUndo) { undo(b.dataset.reviewUndo, onDone); return; }
      const r = view();
      if (!r) return;
      open(r, { kind: b.dataset.reviewAct, from: b.dataset.from !== undefined ? Number(b.dataset.from) : undefined, to: b.dataset.to !== undefined ? Number(b.dataset.to) : undefined, scope: b.dataset.scope }, b, onDone);
    });
  }

  /* ---------- Séance › Prévoir: the adjustments that act on a week, with their origin and their undo ---------- */
  function adjustmentsHtml(week, { title } = {}) {
    const list = D().adjustments ? D().adjustments(week) : [];
    if (!list.length) return "";
    const today = window.TitanFormat.dateKey(new Date());
    const rows = list.map((rv) => {
      const sport = rv.observation?.slot?.sport;
      const what = WR().describeAction(rv.action, { label, sport });
      const scope = rv.action.kind === "move" && rv.action.scope === "type" ? `Semaine type modifiée à partir du ${dayLong(rv.applied?.from)}` : `Semaine du ${dayLong(rv.target)}`;
      const canUndo = WP().addDays(rv.target, 6) >= today;
      return `<div class="asc-row wr-adjust" data-adjustment="${esc(rv.week)}" data-kind="${esc(rv.action.kind)}">
        <span class="asc-row-icon">${icon(rv.action.kind === "pause" ? "moon" : rv.action.kind === "keep" ? "check" : "calendar")}</span>
        <span class="asc-row-main"><span class="asc-row-title">${esc(what)}</span>
          <span class="asc-row-sub">${esc(scope)} · choisi au bilan de la semaine du ${esc(dayLong(rv.week))}</span></span>
        ${canUndo ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-review-undo="${esc(rv.week)}" aria-label="${esc(`Annuler : ${what}`)}">Annuler</button>` : ""}
      </div>`;
    }).join("");
    return `<section class="asc-section wr-adjustments" data-adjustments="${esc(week)}"><div class="asc-section-head"><h2>${esc(title || "Ajustements du bilan")}</h2></div><div class="asc-list">${rows}</div></section>`;
  }

  /** The days of the programme of a week once the bilan's choice applied (Séance › Prévoir, the week after). */
  function nextWeekHtml(week) {
    const list = D().adjustments ? D().adjustments(week) : [];
    if (!list.length) return "";
    const v = D().weekPlan(week);
    if (!v) return "";
    const days = v.occurrences.filter((o) => o.status !== "skipped").map((o) => `<li data-next-occurrence="${esc(o.id)}">${esc(`${label(o.effective.sport)} · ${dayLong(o.effective.day)}`)}${o.decision?.origin ? ` <span class="asc-small asc-muted">(choisi au bilan)</span>` : ""}</li>`).join("");
    return `<div class="wr-next" data-next-week="${esc(week)}"><h3 class="asc-small">Programme de la semaine du ${esc(dayLong(week))}${v.paused ? " · en pause" : ""}</h3><ul>${days || "<li>Rien de prévu</li>"}</ul></div>`;
  }

  window.TitanWeekReviewView = { html, bind, adjustmentsHtml, nextWeekHtml, undo };
})();
