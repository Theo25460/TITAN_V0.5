/* TITAN 300 — QG: what matters now. One dominant action, then the week, the ascent and the context. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const F = () => window.TitanFormat;
  const P = () => window.TitanProgress;
  const D = () => window.TitanData;
  const root = () => document.getElementById("qg");
  let goalsCache = [];
  let guestToImport = 0;
  let renderQueued = false;

  const TONE = {
    cy: { eyebrow: "À faire maintenant", cls: "is-accent" },
    am: { eyebrow: "Moment remarquable", cls: "is-record" },
    err: { eyebrow: "Attention", cls: "is-error" },
    ok: { eyebrow: "Aujourd’hui", cls: "is-accent" },
    info: { eyebrow: "Repère", cls: "" },
  };

  function heroHtml(a) {
    const tone = TONE[a.tone] || TONE.cy;
    return `<section class="asc-hero qg-hero ${tone.cls} ${a.value ? "has-figure" : ""} asc-appear" aria-labelledby="qg-hero-title">
      <p class="asc-eyebrow ${a.tone === "am" ? "am" : "cy"}">${esc(a.eyebrow || tone.eyebrow)}</p>
      <h2 id="qg-hero-title" class="qg-hero-title">${esc(a.title)}</h2>
      ${a.value ? `<p class="qg-hero-figure asc-num" aria-label="${esc(a.value)}">${esc(a.value)}</p>` : ""}
      <p class="asc-lead">${esc(a.text)}</p>
      <div class="asc-actions qg-hero-actions">
        <a class="asc-btn asc-btn-primary" href="${esc(a.cta?.href || "/training")}">${esc(a.cta?.label || "Enregistrer une séance")} ${icon("arrow")}</a>
        ${a.why ? `<details class="qg-why"><summary>Pourquoi ce repère ?</summary><p>${esc(a.why)}</p></details>` : ""}
      </div>
    </section>`;
  }

  /** 106 -> 1<small>h</small>46 ; 45 -> 45<small>min</small>. */
  function statDur(min) {
    const m = Math.round(Math.abs(Number(min) || 0));
    if (m < 60) return `${m}<small>min</small>`;
    return `${Math.floor(m / 60)}<small>h</small>${String(m % 60).padStart(2, "0")}`;
  }

  function weekHtml(cad, recapNow) {
    const f = F();
    const w = recapNow.week;
    const notches = cad.weeks
      .map((wk, i) => {
        const last = i === cad.weeks.length - 1;
        const label = last
          ? `Semaine en cours : ${wk.activeDays} jour${wk.activeDays > 1 ? "s" : ""} actif${wk.activeDays > 1 ? "s" : ""} sur ${cad.target}`
          : `Semaine du ${new Date(wk.start + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} : ${
              wk.state === "held" ? "tenue" : wk.state === "pause" ? "en pause" : `${wk.activeDays} jour${wk.activeDays > 1 ? "s" : ""} actif${wk.activeDays > 1 ? "s" : ""}`
            }`;
        return `<span class="asc-notch" data-state="${wk.state}" style="--fill:${wk.fill}%" role="img" aria-label="${esc(label)}" title="${esc(label)}"></span>`;
      })
      .join("");
    const status = cad.remaining === 0
      ? `<strong class="qg-held">${icon("check")} Semaine tenue</strong>`
      : `<strong>${cad.currentDays}/${cad.target}</strong> jours actifs`;
    const delta = recapNow.deltaMinutes;
    return `<section class="asc-section asc-appear" aria-labelledby="qg-week">
      <div class="asc-section-head"><h2 id="qg-week">Cette semaine</h2><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-action="cadence">Semaine type : ${cad.target} jour${cad.target > 1 ? "s" : ""} ${icon("edit")}</button></div>
      <div class="qg-week">
        <div class="qg-cadence">
          <div class="asc-notches" aria-label="Cadence des 8 dernières semaines">${notches}</div>
          <div class="asc-between asc-small"><span class="asc-muted">${status}</span><span class="asc-faint">Cadence ${cad.held}/${cad.window} · ${f.plural(cad.lifetimeHeld, "semaine tenue", "semaines tenues")} au total</span></div>
        </div>
        <div class="asc-stats">
          <div class="asc-stat"><span class="asc-stat-value">${w.sessions}</span><span class="asc-stat-label">séance${w.sessions > 1 ? "s" : ""}</span></div>
          <div class="asc-stat"><span class="asc-stat-value">${statDur(w.minutes)}</span><span class="asc-stat-label">de pratique${w.estimatedMinutes ? " (en partie estimée)" : ""}</span></div>
          ${w.distance ? `<div class="asc-stat"><span class="asc-stat-value">${f.number(w.distance, 1)}<small>km</small></span><span class="asc-stat-label">parcourus</span></div>` : ""}
          <div class="asc-stat"><span class="asc-stat-value ${delta > 0 ? "is-up" : ""}">${delta === null ? "—" : Math.round(delta) === 0 ? "=" : `${delta > 0 ? "+" : "−"}${statDur(delta)}`}</span><span class="asc-stat-label">${delta === null ? "pas encore d’historique" : Math.round(delta) === 0 ? "comme tes semaines habituelles à ce stade" : "vs tes 4 dernières semaines à ce stade"}</span></div>
        </div>
      </div>
    </section>`;
  }

  function ascentHtml(p) {
    const f = F();
    const pct = Math.max(0, Math.min(100, Math.round((p.xp / Math.max(1, p.next)) * 100)));
    const left = Math.max(0, p.next - p.xp);
    const nextRank = p.nextRank ? `Prochain rang : <strong>${esc(p.nextRank.name)}</strong> au niveau ${p.nextRank.level}.` : "Tu as atteint le dernier rang. La progression continue.";
    return `<section class="asc-section qg-ascent asc-appear" aria-labelledby="qg-ascent">
      <div class="asc-section-head"><h2 id="qg-ascent">Ascension</h2><a class="asc-link asc-small" href="/profile">Profil ${icon("chevron")}</a></div>
      <div class="qg-rank">
        <div><p class="asc-eyebrow">${p.guest ? "Rang estimé · découverte" : "Rang TITAN"}</p><p class="qg-rank-name">${esc(p.rank.name)}</p></div>
        <p class="qg-level"><span class="asc-num">${p.level}</span><small>niveau</small></p>
      </div>
      <div class="asc-ascent" role="progressbar" aria-valuemin="0" aria-valuemax="${p.next}" aria-valuenow="${p.xp}" aria-label="Progression vers le niveau ${p.level + 1}"><span style="--p:${pct}%"></span></div>
      <p class="asc-small asc-muted">${f.number(left)} XP avant le niveau ${p.level + 1}. ${nextRank}</p>
      <p class="asc-small asc-faint">1 minute d’effort modéré ≈ 10 XP, quel que soit ton sport.${p.guest ? " En découverte, le calcul est local et indicatif." : ""}</p>
    </section>`;
  }

  function lastHtml(list) {
    const f = F();
    const last = list.slice().sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    if (!last) return "";
    const meta = P().sportMeta(last.sport);
    const m = P().minutesOf(last);
    const main = last.unit === "km" ? f.distance(last.val) : last.unit === "kg" && Number(last.val) > 0 ? f.weight(last.val) : f.duration(m.minutes);
    const sub = [f.relativeDay(last.date), m.minutes && last.unit === "km" ? f.duration(m.minutes) : "", last.unit === "km" && m.minutes && !m.estimated ? f.pace(last.val, m.minutes) : ""]
      .filter(Boolean)
      .join(" · ");
    const sync = last.syncStatus === "pending" ? '<span class="asc-chip warn">En attente</span>' : last.syncStatus === "error" ? '<span class="asc-chip err">À corriger</span>' : last.details?.historical ? '<span class="asc-chip">Historique</span>' : "";
    return `<section class="asc-section asc-appear" aria-labelledby="qg-last">
      <div class="asc-section-head"><h2 id="qg-last">Dernière séance</h2><a class="asc-link asc-small" href="/journal">Journal ${icon("chevron")}</a></div>
      <a class="asc-row" href="/journal?log=${encodeURIComponent(last.client_event_id || last.id)}">
        <span class="asc-row-icon">${icon(familyIcon(meta.family))}</span>
        <span class="asc-row-main"><span class="asc-row-title">${esc(meta.label)}</span><span class="asc-row-sub">${esc(sub)}</span></span>
        <span class="asc-row-end"><strong>${esc(main)}</strong>${sync}</span>
      </a>
    </section>`;
  }

  function familyIcon(family) {
    return { endurance: "run", force: "weight", technique: "mountain", jeu: "target", mobilite: "leaf" }[family] || "bolt";
  }

  function insightsHtml(items) {
    if (!items.length) return "";
    return `<section class="asc-section asc-appear" aria-labelledby="qg-insights">
      <div class="asc-section-head"><h2 id="qg-insights">Repères</h2></div>
      <ul class="asc-list qg-insights">${items
        .map(
          (i) => `<li class="qg-insight" data-tone="${i.tone}">
          <span class="asc-row-icon">${icon(i.tone === "am" ? "trophy" : i.tone === "err" ? "alert" : i.id.startsWith("goal") ? "target" : i.id.startsWith("mastery") ? "ascent" : "sparkle")}</span>
          <div class="asc-row-main"><a class="asc-row-title" href="${esc(i.cta?.href || "#")}">${esc(i.title)}</a><span class="asc-row-sub">${esc(i.text)}</span>
          <details class="qg-why"><summary>Pourquoi ?</summary><p>${esc(i.why)}</p></details></div>
        </li>`,
        )
        .join("")}</ul>
    </section>`;
  }

  function goalHtml(goals, list) {
    const f = F();
    const active = goals.filter((g) => !g.archived_at).map((g) => ({ g, p: window.TitanInsights.goalProgress(g, list) })).filter((x) => !x.p.ended && !x.p.complete);
    if (!active.length)
      return `<a class="asc-row" href="/objectifs"><span class="asc-row-icon">${icon("target")}</span><span class="asc-row-main"><span class="asc-row-title">Fixer un objectif</span><span class="asc-row-sub">Séances, minutes ou kilomètres, sur la période de ton choix.</span></span>${icon("chevron")}</a>`;
    const { g, p } = active.sort((a, b) => b.p.ratio - a.p.ratio)[0];
    const val = g.metric === "distance" ? `${f.number(p.value, 1)} / ${f.number(g.target)} km` : g.metric === "minutes" ? `${f.duration(p.value)} / ${f.duration(g.target)}` : `${p.value} / ${g.target}`;
    return `<a class="asc-row qg-goal" href="/objectifs"><span class="asc-row-icon">${icon("target")}</span><span class="asc-row-main"><span class="asc-row-title">${esc(g.title)}</span>
      <span class="asc-ascent thin" aria-hidden="true"><span style="--p:${Math.round(p.ratio * 100)}%"></span></span>
      <span class="asc-row-sub">${esc(val)} · jusqu’au ${new Date(g.end_date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span></span>${icon("chevron")}</a>`;
  }

  function adventureHtml() {
    const s = window.TitanAdventure?.snapshot;
    const C = window.TitanCodex;
    if (!s || !C) return "";
    const c = (s.campaigns || []).find((x) => x.id === s.selected_world && x.chapter > 0) || (s.campaigns || []).find((x) => x.chapter > 0 && x.chapter <= 9);
    if (!c)
      return `<a class="asc-row" href="/adventure"><span class="asc-row-icon">${icon("compass")}</span><span class="asc-row-main"><span class="asc-row-title">Commencer l’aventure</span><span class="asc-row-sub">Ton premier monde attend tes jours actifs.</span></span>${icon("chevron")}</a>`;
    const world = C.worlds.find((w) => w.id === c.id);
    if (c.chapter > 9)
      return `<a class="asc-row" href="/adventure"><span class="asc-row-icon">${icon("compass")}</span><span class="asc-row-main"><span class="asc-row-title">${esc(world?.name || "Monde")} terminé</span><span class="asc-row-sub">Choisis ton prochain horizon.</span></span>${icon("chevron")}</a>`;
    const chapter = world?.chapters?.[c.chapter - 1];
    const days = Number(c.evidence?.days || 0);
    return `<a class="asc-row" href="/adventure?world=${esc(c.id)}"><span class="asc-row-icon">${icon("compass")}</span><span class="asc-row-main"><span class="asc-row-title">${esc(chapter?.name || `Chapitre ${c.chapter}`)}</span>
      <span class="asc-ascent thin" aria-hidden="true"><span style="--p:${Math.round(Math.min(1, days / Math.max(1, c.target)) * 100)}%"></span></span>
      <span class="asc-row-sub">${esc(world?.name || "")} · chapitre ${c.chapter}/9 · ${Math.min(days, c.target)}/${c.target} jour${c.target > 1 ? "s" : ""}</span></span>${icon("chevron")}</a>`;
  }

  function guestHtml() {
    return `<div class="asc-note qg-guest">${icon("phone")}<div><strong>Mode découverte</strong> · tes séances restent sur cet appareil. <a class="asc-link" href="/login?mode=signup">Créer un compte</a> pour les sauvegarder et les reprendre partout.</div></div>`;
  }

  function render() {
    const el = root();
    if (!el || !window.state?.user || !window.TitanProgress) return;
    const f = F();
    const list = P().activeLogs(D().logs());
    const settings = D().cadenceSettings();
    const now = new Date();
    const ctx = { logs: D().logs(), goals: goalsCache, now, cadenceTarget: settings.target, pauses: settings.pauses, adventure: window.TitanAdventure?.snapshot, pending: D().pending(), plan: D().planToday?.(now) };
    const action = P().nextAction(ctx);
    const others = P().insights(ctx).filter((i) => i.id !== action.id).slice(0, 3);
    const cad = P().cadence(D().logs(), { target: settings.target, pauses: settings.pauses, now });
    const recapNow = P().recap(D().logs(), { now, current: true });
    const name = (window.state.user.name || "").trim();
    document.getElementById("qg-date").textContent = f.longDate(now);
    document.getElementById("qg-title").textContent = D().isGuest() || !name || /^agent$/i.test(name) ? "Ton QG" : `Bonjour, ${name.split(/\s+/)[0]}.`;
    el.innerHTML = `
      ${D().isGuest() ? guestHtml() : ""}
      ${!D().isGuest() && guestToImport ? `<div class="asc-note qg-guest">${icon("upload")}<div><strong>${guestToImport} séance${guestToImport > 1 ? "s" : ""} de découverte</strong> sur cet appareil. <button type="button" class="asc-link" data-action="import-guest" style="background:none;border:0;padding:0">Les ajouter à mon compte</button><p class="asc-small asc-faint">Celles de plus de 30 jours entrent dans ton historique, sans XP.</p></div></div>` : ""}
      ${heroHtml(action)}
      ${weekHtml(cad, recapNow)}
      <div class="asc-grid-2 qg-grid">
        <div>${ascentHtml(D().progression())}</div>
        <div>${lastHtml(list)}
          <section class="asc-section asc-appear" aria-labelledby="qg-paths"><div class="asc-section-head"><h2 id="qg-paths">En cours</h2></div>
            <div class="asc-list">${goalHtml(goalsCache, D().logs())}${adventureHtml()}</div>
          </section>
        </div>
      </div>
      ${insightsHtml(others)}`;
    el.setAttribute("aria-busy", "false");
  }

  function queue() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
  }

  function cadenceSheet() {
    const settings = D().cadenceSettings();
    const week = F().dateKey(F().weekStart(new Date()));
    const paused = settings.pauses.includes(week);
    const body = document.createElement("div");
    body.className = "asc-stack";
    body.innerHTML = `<p class="asc-muted">Combien de jours actifs comptent pour toi une semaine réussie ? Le repos des autres jours ne coûte rien.</p>
      <div class="asc-seg" role="group" aria-label="Jours actifs par semaine">${[1, 2, 3, 4, 5, 6, 7]
        .map((n) => `<button type="button" data-n="${n}" aria-pressed="${n === settings.target}">${n}</button>`)
        .join("")}</div>
      <hr class="asc-divider">
      <div class="asc-between"><div><strong>Semaine en pause</strong><p class="asc-small asc-faint">Vacances, blessure, examens : cette semaine sort de ta cadence au lieu de compter comme manquée.</p></div>
      <button type="button" class="asc-btn ${paused ? "asc-btn-primary" : "asc-btn-secondary"} asc-btn-sm" data-pause aria-pressed="${paused}">${paused ? "En pause" : "Mettre en pause"}</button></div>`;
    const d = window.titanShell.sheet({ title: "Ta semaine type", eyebrow: "Cadence", body });
    body.querySelectorAll("[data-n]").forEach((b) =>
      b.addEventListener("click", () => {
        D().setCadenceTarget(Number(b.dataset.n));
        body.querySelectorAll("[data-n]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        queue();
      }),
    );
    body.querySelector("[data-pause]").addEventListener("click", (e) => {
      const on = D().togglePause(week);
      e.currentTarget.setAttribute("aria-pressed", String(on));
      e.currentTarget.textContent = on ? "En pause" : "Mettre en pause";
      e.currentTarget.className = `asc-btn ${on ? "asc-btn-primary" : "asc-btn-secondary"} asc-btn-sm`;
      queue();
    });
    return d;
  }

  document.addEventListener("click", async (e) => {
    if (e.target.closest('[data-action="cadence"]')) cadenceSheet();
    const imp = e.target.closest('[data-action="import-guest"]');
    if (imp) {
      imp.disabled = true;
      try {
        const n = await D().importGuestSessions();
        guestToImport = 0;
        window.titanShell.toast({ type: "ok", title: "Import lancé", message: `${n} séance${n > 1 ? "s" : ""} rejoignent ton compte. La confirmation arrive dans le journal.` });
      } catch {
        window.titanShell.toast({ type: "err", title: "Import impossible", message: "Réessaie quand tu es connecté." });
      }
      queue();
    }
  });
  ["titan:history-updated", "titan:adventure-updated", "titan:pending-changed"].forEach((ev) => window.addEventListener(ev, queue));
  async function boot() {
    queue();
    window.TitanAdventure?.refresh?.().catch(() => {});
    goalsCache = await D().goals();
    guestToImport = (await D().guestCandidates().catch(() => [])).length;
    queue();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 0));
  else setTimeout(boot, 0);
  window.addEventListener("titan:history-updated", async () => {
    const id = D().owner();
    goalsCache = await D().goals();
    if (D().owner() === id) queue();
  }, { once: true });
})();
