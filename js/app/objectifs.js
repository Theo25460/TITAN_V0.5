/* TITAN 300 — Objectifs: simple, honest goals (sessions, active days, minutes, distance) over a period.
   Accounts write to sport_goals (RLS + guard trigger, revision check); discovery keeps them on the device. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const F = () => window.TitanFormat;
  const SP = () => window.TitanSports;
  const I = () => window.TitanInsights;
  const D = () => window.TitanData;
  const DAY = 86400000;
  const METRICS = {
    sessions: { label: "Séances", unit: (n) => (n > 1 ? "séances" : "séance"), step: 1, fmt: (v) => F().number(v) },
    days: { label: "Jours actifs", unit: (n) => (n > 1 ? "jours actifs" : "jour actif"), step: 1, fmt: (v) => F().number(v) },
    minutes: { label: "Temps", unit: () => "min", step: 15, fmt: (v) => (v > 0 ? F().duration(v) : "0 min") },
    distance: { label: "Distance", unit: () => "km", step: 1, fmt: (v) => (v > 0 ? F().distance(v) : "0 km") },
  };
  const TEMPLATES = [
    { title: "Un mois en mouvement", metric: "days", target: 12, days: 28, text: "12 jours actifs en 4 semaines, tous sports." },
    { title: "Mes 100 km du mois", metric: "distance", target: 100, days: 30, sport: "running", text: "Course, à ajuster à ton niveau." },
    { title: "10 heures pour moi", metric: "minutes", target: 600, days: 30, text: "Du temps cumulé, seules les durées renseignées comptent." },
    { title: "Retour régulier", metric: "sessions", target: 8, days: 28, text: "8 séances en 4 semaines." },
  ];

  let root = null;
  let goals = [];
  let showArchived = false;

  const owner = () => window.state?.user?.id;
  const guest = () => String(owner() || "").startsWith("guest_");
  const key = () => `titan_goals_v1:${owner()}`;
  const iso = (d) => F().dateKey(d);
  const today = () => iso(new Date());

  async function load(force = false) {
    goals = (await D().goals({ force })) || [];
    render();
  }

  async function save(fields, old) {
    const id = owner();
    if (!id) throw new Error("Session indisponible.");
    const active = goals.filter((g) => !g.archived_at && g.id !== old?.id).length;
    if (!fields.archived_at && (!old || old.archived_at) && active >= 50) throw new Error("Tu as déjà 50 objectifs actifs. Archive ceux que tu n’utilises plus.");
    if (guest()) {
      const row = { ...old, ...fields, id: old?.id || crypto.randomUUID(), user_id: id, revision: (old?.revision || 0) + 1, created_at: old?.created_at || new Date().toISOString() };
      const next = [row, ...goals.filter((g) => g.id !== row.id)];
      localStorage.setItem(key(), JSON.stringify(next));
      await load(true);
      return row;
    }
    if (!navigator.onLine) throw new Error("Hors ligne : les objectifs se synchronisent dès le retour du réseau. Réessaie dans un instant.");
    const q = old ? window.titanClient.from("sport_goals").update(fields).eq("id", old.id).eq("user_id", id).eq("revision", old.revision) : window.titanClient.from("sport_goals").insert({ ...fields, user_id: id });
    const { data, error } = await q.select().single();
    if (error) {
      if (error.code === "PGRST116") throw new Error("Cet objectif a changé sur un autre écran. Recharge la page.");
      throw new Error(String(error.message).includes("GOAL_LIMIT") ? "Tu as déjà 50 objectifs actifs." : "La modification n’a pas été confirmée. Vérifie ta connexion et réessaie.");
    }
    await load(true);
    return data;
  }

  /** Where the goal stands, and what it takes to finish. */
  function status(g) {
    const p = I().goalProgress(g, window.state?.history || [], new Date());
    const m = METRICS[g.metric];
    const target = Number(g.target);
    const from = new Date(`${g.start_date}T00:00:00`).getTime();
    const to = new Date(`${g.end_date}T23:59:59`).getTime();
    const now = Date.now();
    const daysLeft = Math.max(0, Math.ceil((to - now) / DAY));
    const elapsed = Math.min(1, Math.max(0, (now - from) / Math.max(DAY, to - from)));
    let line, state;
    if (p.complete) {
      state = "done";
      line = "Objectif atteint.";
    } else if (p.upcoming) {
      state = "upcoming";
      line = `Commence ${new Date(from).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}.`;
    } else if (p.ended) {
      state = "ended";
      line = `Période terminée à ${Math.round(p.ratio * 100)} %. Prolonge-la ou garde-la comme repère.`;
    } else {
      const expected = target * elapsed;
      const left = target - p.value;
      state = p.value >= expected * 1.05 ? "ahead" : p.value >= expected * 0.85 ? "on" : "behind";
      const leftTxt = g.metric === "minutes" ? F().duration(left) : g.metric === "distance" ? F().distance(left) : `${F().number(left)} ${m.unit(left)}`;
      const per = daysLeft > 0 ? left / daysLeft : left;
      const perTxt = daysLeft >= 7 ? `≈ ${g.metric === "minutes" ? F().duration(per * 7) : g.metric === "distance" ? F().distance(per * 7) : F().number(per * 7, 1)} par semaine` : "";
      line = `${state === "ahead" ? "En avance. " : state === "on" ? "Dans le rythme. " : ""}Reste ${leftTxt} en ${daysLeft} jour${daysLeft > 1 ? "s" : ""}${perTxt ? ` (${perTxt})` : ""}.`;
    }
    return { ...p, state, line, daysLeft, target, elapsed };
  }

  function goalCard(g) {
    const s = status(g);
    const m = METRICS[g.metric];
    const pct = Math.round(s.ratio * 100);
    return `<article class="ob-card" data-state="${s.state}">
      <div class="asc-between"><span class="asc-chip">${esc(g.sport ? SP().label(g.sport) : "Tous les sports")}</span><span class="asc-small asc-muted">${g.archived_at ? "Archivé" : s.ended || s.complete ? `du ${esc(new Date(g.start_date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }))} au ${esc(new Date(g.end_date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }))}` : `jusqu’au ${esc(new Date(g.end_date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" }))}`}</span></div>
      <h3>${esc(g.title)}</h3>
      <p class="ob-value"><strong class="asc-num">${esc(m.fmt(s.value))}</strong><span class="asc-muted"> / ${esc(m.fmt(s.target))}${g.metric === "sessions" || g.metric === "days" ? " " + esc(m.unit(s.target)) : ""}</span></p>
      <div class="ob-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(g.title)} : ${pct} %"><span style="--p:${pct}%"></span>${!s.complete && !s.ended && !s.upcoming ? `<i style="--p:${Math.round(s.elapsed * 100)}%" title="Où en serait un rythme régulier aujourd’hui"></i>` : ""}</div>
      <p class="ob-line">${s.state === "done" ? icon("check") : ""}${esc(s.line)}</p>
      <details class="ob-sources"><summary>${s.contributors.length} séance${s.contributors.length > 1 ? "s" : ""} prise${s.contributors.length > 1 ? "s" : ""} en compte</summary>${s.contributors.length ? `<div class="asc-list">${s.contributors
        .slice()
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 12)
        .map((l) => `<a class="asc-row" href="/journal?session=${encodeURIComponent(window.TitanSessions?.idOf(l) || l.id)}"><span class="asc-row-main"><span class="asc-row-title">${esc(SP().label(l.sport))}</span><span class="asc-row-sub">${esc(F().relativeDay(l.date))}</span></span>${icon("chevron")}</a>`)
        .join("")}</div>` : '<p class="asc-small asc-muted">Aucune séance sur la période pour le moment.</p>'}${g.metric === "minutes" && s.sources.length > s.contributors.length ? `<p class="asc-small asc-faint">${s.sources.length - s.contributors.length} séance(s) sans durée ne comptent pas.</p>` : ""}</details>
      <div class="ob-actions"><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-edit="${esc(g.id)}">${icon("edit")} Ajuster</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-archive="${esc(g.id)}">${icon(g.archived_at ? "restore" : "archive")} ${g.archived_at ? "Restaurer" : "Archiver"}</button></div>
    </article>`;
  }

  function render() {
    if (!root) return;
    const active = goals.filter((g) => !g.archived_at);
    const archived = goals.filter((g) => g.archived_at);
    const current = active.filter((g) => {
      const s = status(g);
      return !s.complete && !s.ended;
    });
    const finished = active.filter((g) => !current.includes(g));
    const list = showArchived ? archived : current;
    root.innerHTML = `
      <div class="asc-between ob-top"><p class="asc-small asc-muted">${showArchived ? `${archived.length} archivé${archived.length > 1 ? "s" : ""}` : `${current.length} en cours`}${guest() ? " · sur cet appareil" : ""}</p>
        <button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-new>${icon("plus")} Nouvel objectif</button></div>
      ${list.length ? `<div class="ob-grid">${list.map(goalCard).join("")}</div>` : showArchived ? '<p class="asc-small asc-muted">Aucun objectif archivé.</p>' : templatesHtml()}
      ${!showArchived && finished.length ? `<section class="asc-section"><div class="asc-section-head"><h2>Terminés</h2></div><div class="ob-grid">${finished.map(goalCard).join("")}</div></section>` : ""}
      <footer class="jr-foot"><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-toggle-archived>${icon(showArchived ? "flag" : "archive")} ${showArchived ? "Objectifs en cours" : `Archives${archived.length ? ` (${archived.length})` : ""}`}</button>
      <p class="asc-small asc-faint">La cadence hebdomadaire se règle depuis le QG ; les objectifs servent aux défis sur une période.</p></footer>`;
    root.setAttribute("aria-busy", "false");
  }

  function templatesHtml() {
    return `<section class="asc-section ob-templates"><div class="asc-section-head"><h2>Pour commencer</h2><span class="asc-small asc-muted">À ajuster avant de valider</span></div>
      <div class="ob-grid">${TEMPLATES.map((t, i) => `<button type="button" class="ob-template" data-template="${i}"><strong>${esc(t.title)}</strong><span class="asc-small asc-muted">${esc(t.text)}</span><span class="asc-chip">${esc(METRICS[t.metric].label)} · ${t.days} jours</span></button>`).join("")}</div></section>`;
  }

  /* ---------- Editor ---------- */
  function sportOptions(selected) {
    const recent = [...new Set((window.state?.history || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date)).map((l) => l.sport))].filter((s) => window.SPORTS_CONFIG?.[s]).slice(0, 12);
    const popular = SP().POPULAR.filter((s) => window.SPORTS_CONFIG?.[s] && !recent.includes(s));
    const opt = (s) => `<option value="${esc(s)}" ${selected === s ? "selected" : ""}>${esc(SP().label(s))}</option>`;
    return `<option value="">Tous les sports</option>${recent.length ? `<optgroup label="Tes sports">${recent.map(opt).join("")}</optgroup>` : ""}<optgroup label="Populaires">${popular.map(opt).join("")}</optgroup>${selected && !recent.includes(selected) && !popular.includes(selected) ? opt(selected) : ""}`;
  }

  function autoTitle(metric, target, sport) {
    const n = Number(target) || 0;
    const what = metric === "minutes" ? F().duration(n) : metric === "distance" ? `${F().number(n)} km` : `${F().number(n)} ${METRICS[metric].unit(n)}`;
    return `${what}${sport ? ` · ${SP().label(sport)}` : ""}`;
  }

  function openEditor(old, template) {
    const base = old || {
      title: template?.title || "",
      metric: template?.metric || "days",
      target: template?.target || 12,
      sport: template?.sport && window.SPORTS_CONFIG?.[template.sport] ? template.sport : "",
      start_date: today(),
      end_date: iso(new Date(Date.now() + ((template?.days || 28) - 1) * DAY)),
    };
    const form = document.createElement("form");
    form.className = "asc-stack ob-form";
    form.noValidate = true;
    let titleTouched = Boolean(old || template);
    form.innerHTML = `
      <div class="asc-field"><span>Mesure</span><div class="asc-seg ob-metric" role="group" aria-label="Mesure">${Object.entries(METRICS).map(([k, m]) => `<button type="button" data-metric="${k}" aria-pressed="${base.metric === k}">${m.label}</button>`).join("")}</div></div>
      <div class="asc-form-grid">
        <label class="asc-field"><span>Cible <small class="asc-faint" data-unit>${esc(base.metric === "minutes" ? "en minutes" : base.metric === "distance" ? "en km" : "")}</small></span><input class="asc-input" type="number" inputmode="decimal" name="target" min="1" max="1000000" step="${base.metric === "distance" ? "0.1" : "1"}" value="${esc(base.target)}" required></label>
        <label class="asc-field"><span>Sport</span><select name="sport">${sportOptions(base.sport || "")}</select></label>
      </div>
      <div class="asc-field"><span>Période</span><div class="asc-seg ob-period" role="group" aria-label="Durée">${[["7", "1 semaine"], ["28", "4 semaines"], ["month", "Ce mois"], ["90", "3 mois"]].map(([k, l]) => `<button type="button" data-period="${k}">${l}</button>`).join("")}</div></div>
      <div class="asc-form-grid"><label class="asc-field"><span>Début</span><input class="asc-input" type="date" name="start_date" value="${esc(base.start_date)}" required></label><label class="asc-field"><span>Fin</span><input class="asc-input" type="date" name="end_date" value="${esc(base.end_date)}" required></label></div>
      <label class="asc-field"><span>Nom</span><input class="asc-input" name="title" maxlength="100" value="${esc(base.title || autoTitle(base.metric, base.target, base.sport))}" required></label>
      <p class="asc-small asc-faint">Les séances déjà enregistrées sur la période comptent. Un objectif ne donne pas d’XP : il sert à te situer.</p>
      <p class="asc-small jr-edit-error" role="alert"></p>
      <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-cancel>Annuler</button><button type="submit" class="asc-btn asc-btn-primary">${old ? "Enregistrer" : "Créer l’objectif"}</button></div>`;
    let metric = base.metric;
    const d = window.titanShell.sheet({ title: old ? "Ajuster l’objectif" : "Nouvel objectif", eyebrow: "Objectifs", body: form });
    const field = (n) => form.querySelector(`[name="${n}"]`);
    const retitle = () => {
      if (!titleTouched) field("title").value = autoTitle(metric, field("target").value, field("sport").value);
    };
    form.addEventListener("input", (e) => {
      if (e.target.name === "title") titleTouched = true;
      else retitle();
    });
    form.addEventListener("change", retitle);
    form.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-cancel")) return d.close();
      if (b.dataset.metric) {
        metric = b.dataset.metric;
        form.querySelectorAll("[data-metric]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        form.querySelector("[data-unit]").textContent = metric === "minutes" ? "en minutes" : metric === "distance" ? "en km" : "";
        field("target").step = metric === "distance" ? "0.1" : "1";
        retitle();
      }
      if (b.dataset.period) {
        const start = new Date();
        let end;
        if (b.dataset.period === "month") {
          start.setDate(1);
          end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        } else end = new Date(start.getTime() + (Number(b.dataset.period) - 1) * DAY);
        field("start_date").value = iso(start);
        field("end_date").value = iso(end);
      }
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = form.querySelector(".jr-edit-error");
      const target = Number(String(field("target").value).replace(",", "."));
      const fields = { title: field("title").value.trim(), metric, target, sport: field("sport").value || null, start_date: field("start_date").value, end_date: field("end_date").value };
      if (!fields.title) return (err.textContent = "Donne un nom à ton objectif.");
      if (!(target > 0) || target > 1000000) return (err.textContent = "Choisis une cible supérieure à zéro.");
      if ((metric === "sessions" || metric === "days") && target !== Math.trunc(target)) return (err.textContent = "Les séances et jours actifs se comptent en nombres entiers.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(fields.end_date) || fields.end_date < fields.start_date) return (err.textContent = "La fin doit suivre le début.");
      if ((new Date(fields.end_date) - new Date(fields.start_date)) / DAY > 730) return (err.textContent = "Une période dure au maximum deux ans.");
      const submit = form.querySelector("[type=submit]");
      submit.disabled = true;
      try {
        await save(fields, old);
        if (!old) window.TitanAnalytics?.track("goal_created", { kind: metric, family: fields.sport ? SP().familyOf(fields.sport) : undefined });
        d.close();
        window.titanShell.toast({ type: "ok", title: old ? "Objectif ajusté" : "Objectif créé", message: fields.title });
      } catch (error) {
        err.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    });
  }

  let booted = false;
  function start() {
    root = document.getElementById("objectifs");
    if (!root || !window.state?.user || !window.TitanInsights) return;
    if (!booted) {
      booted = true;
      SP().ensure();
      root.addEventListener("click", async (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.hasAttribute("data-new")) return openEditor(null);
        if (b.dataset.template) return openEditor(null, TEMPLATES[Number(b.dataset.template)]);
        if (b.hasAttribute("data-toggle-archived")) {
          showArchived = !showArchived;
          return render();
        }
        const g = goals.find((x) => x.id === (b.dataset.edit || b.dataset.archive));
        if (!g) return;
        if (b.dataset.edit) return openEditor(g);
        if (b.dataset.archive)
          window.titanShell.confirm({
            title: g.archived_at ? "Restaurer cet objectif ?" : "Archiver cet objectif ?",
            message: g.archived_at ? "Il revient dans tes objectifs en cours." : "Il quitte la liste et reste dans les archives, avec sa progression.",
            confirmLabel: g.archived_at ? "Restaurer" : "Archiver",
            action: () => save({ archived_at: g.archived_at ? null : new Date().toISOString() }, g),
          });
      });
      load(false);
      return;
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
