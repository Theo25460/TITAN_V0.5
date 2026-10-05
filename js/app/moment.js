/* TITAN 300 — the moment after a session: what you did, what it changed, what it is worth.
   XP shown before the server answers is an estimate and says so; the official value replaces it
   as soon as the receipt arrives (titan:history-updated). */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const F = () => window.TitanFormat;
  const E = () => window.TitanEffort;
  const P = () => window.TitanProgress;
  const S = () => window.TitanSports;
  const DAY = 86400000;

  const idOf = (l) => l?.client_event_id || l?.details?.client_event_id || l?.id;
  const current = (log) => (window.state?.history || []).find((l) => idOf(l) === idOf(log)) || log;
  const isGuest = () => String(window.state?.user?.id || "").startsWith("guest_");

  function metrics(log) {
    const d = log.details || {};
    const out = [];
    const minutes = window.TitanTraining?.duration(log);
    if (log.unit === "km") {
      out.push(["Distance", F().distance(log.val)]);
      if (minutes) {
        out.push(["Durée", F().clock(minutes)]);
        out.push(S().paceMode(log.sport) === "pace" ? ["Allure", F().pace(log.val, minutes)] : ["Vitesse", F().speed(log.val, minutes)]);
      }
      const elev = Number(d.elevation || d.gpxStats?.ascent);
      if (elev > 0) out.push(["Dénivelé", `+${F().number(elev)} m`]);
    } else if (log.unit === "m") {
      out.push(["Distance", `${F().number(log.val)} m`]);
      if (minutes) {
        out.push(["Durée", F().clock(minutes)]);
        const sec = Math.round((minutes * 60) / (Number(log.val) / 100));
        out.push(["Allure", `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} /100 m`]);
      }
    } else if (Array.isArray(d.exercises) && d.exercises.length) {
      const sets = d.exercises.reduce((n, e) => n + (e.setRows?.length || Number(e.sets) || 0), 0);
      const volume = d.exercises.reduce((n, e) => n + (Number(e.volume) || 0), 0);
      const reps = d.exercises.reduce((n, e) => n + (Number(e.totalReps) || 0), 0);
      out.push(["Exercices", F().number(d.exercises.length)]);
      out.push(["Séries", F().number(sets)]);
      if (volume > 0) out.push(["Volume", F().weight(volume)]);
      else if (reps > 0) out.push(["Répétitions", F().number(reps)]);
      if (minutes) out.push(["Durée", F().duration(minutes)]);
    } else {
      if (minutes) out.push(["Durée", F().duration(minutes)]);
      else out.push(["Valeur", `${F().number(log.val)} ${log.unit || ""}`.trim()]);
      const x = d.extras || {};
      if (x.max_done) out.push(["Meilleure", x.max_done]);
      if (Number.isFinite(Number(x.successful_routes)) && x.successful_routes !== undefined) out.push(["Réussites", x.attempts ? `${x.successful_routes}/${x.attempts}` : String(x.successful_routes)]);
    }
    const rpe = Number(d.bio?.rpe);
    if (rpe >= 1 && rpe <= 10) out.push(["Ressenti", `${rpe}/10`]);
    return out.slice(0, 5);
  }

  const fmtRecord = (r, value = r.value) => F().recordValue(r.unit, value);

  function records(log) {
    const t = new Date(log.date).getTime();
    if (!Number.isFinite(t)) return [];
    return P()
      .newRecords(window.state?.history || [], t, t + 1, Date.now() + 1000)
      .filter((r) => idOf(r.log) === idOf(log))
      .sort((a, b) => (a.kind === "duration") - (b.kind === "duration"))
      .slice(0, 3);
  }

  function reward(log) {
    const historical = E().isHistorical(log.date);
    const r = log.details?.serverReward;
    if (historical) return { state: "history", big: "Historique", sub: "Ajoutée à ton historique, à tes statistiques et à tes records. Sans XP : seules les séances des 30 derniers jours en rapportent." };
    const est = P().effortOf(log);
    if (isGuest()) return { state: "local", big: `≈ ${F().number(est.xp)} XP`, sub: "Estimation du mode découverte. Crée ton compte pour rendre ta progression officielle : tes séances te suivent." };
    if (log.syncStatus === "confirmed" && r) {
      const capped = Number(r.requested_xp) > Number(r.xp);
      const lines = [];
      if (capped) lines.push(Number(r.xp) > 0 ? `Plafond de fair-play atteint : ${F().number(r.xp)} XP comptés sur ${F().number(r.requested_xp)}.` : "Plafond de fair-play du jour ou de la semaine atteint : la séance compte pour tes statistiques, pas pour l’XP.");
      else lines.push("Confirmée par le serveur.");
      if (Number(r.leveled_up) > 0) lines.push(`Niveau ${F().number(r.level_after)} atteint.`);
      return { state: capped ? "capped" : "confirmed", big: `+${F().number(r.xp)} XP`, sub: lines.join(" "), levelUp: Number(r.leveled_up) > 0 ? Number(r.level_after) : null };
    }
    const offline = !navigator.onLine;
    return { state: "pending", big: `≈ ${F().number(est.xp)} XP`, sub: offline ? "Hors ligne : la séance est conservée sur cet appareil et partira dès le retour du réseau." : "Conservée sur cet appareil. Confirmation du serveur en cours…" };
  }

  function cadenceHtml(log) {
    const settings = window.TitanData?.cadenceSettings?.() || { target: 3, pauses: [] };
    const c = P().cadence(window.state?.history || [], { target: settings.target, pauses: settings.pauses, now: new Date() });
    const t = new Date(log.date);
    if (F().weekStart(t).getTime() !== F().weekStart(new Date()).getTime()) return "";
    const days = c.currentDays;
    const notches = Array.from({ length: c.target }, (_, i) => `<span class="asc-notch" data-state="${i < days ? "held" : "current"}" style="--fill:0%"></span>`).join("");
    const text = days >= c.target ? (days === c.target ? "Semaine tenue. Tout ce qui suit est du bonus, pas une obligation." : `Semaine tenue, ${days} jours actifs.`) : `Encore ${c.remaining} jour${c.remaining > 1 ? "s" : ""} actif${c.remaining > 1 ? "s" : ""} pour tenir ta semaine.`;
    return `<section class="moment-block"><div class="asc-between"><p class="asc-eyebrow">Ta semaine</p><span class="asc-small asc-muted">${days}/${c.target} jours actifs</span></div>
      <div class="asc-notches moment-notches" style="grid-template-columns:repeat(${c.target},1fr)" aria-hidden="true">${notches}</div><p class="asc-small asc-muted">${esc(text)}</p></section>`;
  }

  function masteryHtml(log) {
    const m = P().mastery(window.state?.history || []).find((x) => x.sport === log.sport);
    if (!m) return "";
    const pct = Math.round(m.progress * 100);
    return `<section class="moment-block"><div class="asc-between"><p class="asc-eyebrow">Maîtrise · ${esc(m.label)}</p><span class="asc-small asc-muted">${esc(m.name)}</span></div>
      <span class="asc-ascent thin" aria-hidden="true"><span style="--p:${pct}%"></span></span>
      <p class="asc-small asc-muted">${m.next ? `${pct} % vers ${esc(m.next.name)} · ${F().duration(m.minutes)} sur ${F().number(m.weeks)} semaine${m.weeks > 1 ? "s" : ""}` : "Niveau Référence : le sommet de cette discipline."}</p></section>`;
  }

  function adventureHtml(log) {
    if (isGuest() || E().isHistorical(log.date)) return "";
    const s = window.TitanAdventure?.snapshot;
    const C = window.TitanCodex;
    if (!s || !C || s.owner !== window.state?.user?.id) return "";
    const c = (s.campaigns || []).find((x) => x.id === s.selected_world && x.chapter > 0 && x.chapter <= 9) || (s.campaigns || []).find((x) => x.chapter > 0 && x.chapter <= 9);
    if (!c) return "";
    const world = C.worlds.find((w) => w.id === c.id);
    const chapter = world?.chapters?.[c.chapter - 1];
    const days = Math.min(Number(c.evidence?.days || 0), c.target);
    return `<a class="asc-row moment-adventure" href="/adventure?world=${esc(c.id)}"><span class="asc-row-icon">${icon("compass")}</span><span class="asc-row-main"><span class="asc-row-title">${esc(chapter?.name || `Chapitre ${c.chapter}`)}</span>
      <span class="asc-row-sub">${esc(world?.name || "Aventure")} · ${days}/${c.target} jour${c.target > 1 ? "s" : ""} actif${c.target > 1 ? "s" : ""}${log.syncStatus === "confirmed" ? "" : " · mis à jour après confirmation"}</span></span>${icon("chevron")}</a>`;
  }

  function html(log) {
    const rw = reward(log);
    const recs = records(log);
    const m = metrics(log);
    return `<div class="moment" data-state="${rw.state}">
      <dl class="moment-metrics">${m.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="asc-num">${esc(v)}</dd></div>`).join("")}</dl>
      <section class="moment-reward" data-state="${rw.state}" aria-live="polite">
        <p class="moment-xp asc-num">${esc(rw.big)}</p>
        <p class="asc-small">${esc(rw.sub)}</p>
        ${rw.levelUp ? `<p class="moment-level">${icon("ascent")} Niveau ${F().number(rw.levelUp)} · ${esc(E().rank(rw.levelUp).name)}</p>` : ""}
      </section>
      ${recs.length ? `<section class="moment-block moment-records"><p class="asc-eyebrow am">${recs.every((r) => r.first) ? (recs.length > 1 ? "Premiers repères" : "Premier repère") : recs.length > 1 ? "Records" : "Record"}</p>${recs
        .map((r) => `<div class="moment-record"><span class="moment-record-label">${esc(r.label)}</span><strong class="asc-num">${esc(fmtRecord(r))}</strong><span class="asc-small asc-faint">${r.previous ? `avant : ${esc(fmtRecord(r, r.previous.value))}` : "ta référence pour la suite"}</span></div>`)
        .join("")}</section>` : ""}
      ${cadenceHtml(log)}
      ${masteryHtml(log)}
      ${adventureHtml(log)}
      <div class="moment-actions">
        <button type="button" class="asc-btn asc-btn-primary" data-moment="done">Terminé</button>
        <a class="asc-btn asc-btn-secondary" href="/journal">${icon("journal")} Voir dans le journal</a>
      </div>
    </div>`;
  }

  function open(log) {
    if (!log || !window.titanShell?.sheet) return;
    const when = F().relativeDay(log.date);
    const body = document.createElement("div");
    body.innerHTML = html(current(log));
    const broken = records(current(log)).filter((r) => !r.first);
    if (broken.length) window.TitanAnalytics?.track("record_unlocked", { kind: broken[0].kind, family: S().familyOf(log.sport) });
    const historical = E().isHistorical(log.date);
    const dialog = window.titanShell.sheet({
      title: S().label(log.sport),
      eyebrow: `${historical ? "Ajoutée à ton historique" : "Séance enregistrée"} · ${when}`,
      body,
      onClose: () => {
        window.removeEventListener("titan:history-updated", update);
        window.removeEventListener("titan:adventure-updated", update);
      },
    });
    dialog.classList.add("moment-sheet");
    let wasConfirmed = current(log).syncStatus === "confirmed";
    function update() {
      const l = current(log);
      body.innerHTML = html(l);
      if (!wasConfirmed && l.syncStatus === "confirmed") {
        wasConfirmed = true;
        window.TitanAdventure?.refresh?.({ force: true });
      }
    }
    body.addEventListener("click", (e) => {
      if (e.target.closest("[data-moment='done']")) dialog.close();
    });
    window.addEventListener("titan:history-updated", update);
    window.addEventListener("titan:adventure-updated", update);
    setTimeout(() => body.querySelector("[data-moment='done']")?.focus(), 30);
    return dialog;
  }

  window.TitanMoment = { open, metrics, reward };
})();
