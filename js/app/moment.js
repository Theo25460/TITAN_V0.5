/* TITAN 300 — the moment after a session: what you did, what the server confirmed, and what to do next. */
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
    // After a cloud reload, serverReward can be the stored flag `true` instead of the receipt.
    const sr = log.details?.serverReward;
    const r = sr && typeof sr === "object" ? sr : log.syncStatus === "confirmed" ? { xp: log.xp, requested_xp: log.details?.requestedXp ?? log.xp } : null;
    if (!isGuest() && log.syncStatus === "error") {
      const queued = window.TitanQueue?.list?.().find(item => item.payload?.details?.client_event_id === idOf(log));
      return { state: "pending", big: "Envoi refusé", sub: queued?.deferred
        ? "La séance est conservée sur cet appareil et sera renvoyée automatiquement."
        : "La séance est conservée sur cet appareil. Retrouve les options de reprise dans le journal." };
    }
    if (historical)
      return {
        state: "history",
        big: "Historique",
        sub:
          isGuest() || log.syncStatus === "confirmed"
            ? "Ajoutée à ton historique, à tes statistiques et à tes records. Sans XP : seules les séances des 30 derniers jours en rapportent."
            : "Gardée sur cet appareil, sans XP. Le serveur ne l’a pas encore acceptée : elle partira d’elle-même dès qu’il le pourra.",
      };
    if (isGuest()) return { state: "local", big: "Gardée sur cet appareil", sub: "Tu pourras ajouter cette séance à ton compte après inscription." };
    if (log.syncStatus === "confirmed" && r && r.reward_held) {
      const hours = Math.max(1, Math.ceil((new Date(r.release_at) - Date.now()) / 3600000)) || 24;
      return { state: "pending", big: "Récompense en vérification", sub: `Tes ${F().number(r.held_xp)} XP et ${F().number(r.held_credits)} crédits arrivent d’eux-mêmes d’ici ${F().number(hours)} h, après une vérification de routine.` };
    }
    if (log.syncStatus === "confirmed" && r) {
      const capped = Number(r.requested_xp) > Number(r.xp);
      const lines = [];
      if (capped) lines.push(Number(r.xp) > 0 ? `Plafond de fair-play atteint : ${F().number(r.xp)} XP comptés sur ${F().number(r.requested_xp)}.` : "Plafond de fair-play du jour ou de la semaine atteint : la séance compte pour tes statistiques, pas pour l’XP.");
      else lines.push("Confirmée par le serveur.");
      if (Number(r.leveled_up) > 0) lines.push(`Niveau ${F().number(r.level_after)} atteint.`);
      return { state: capped ? "capped" : "confirmed", big: `+${F().number(r.xp)} XP`, sub: lines.join(" "), credits: Number(r.credits) || 0, levelUp: Number(r.leveled_up) > 0 ? Number(r.level_after) : null, xp: Number(r.xp) || 0, levelAfter: Number(r.level_after) || null, xpAfter: Number(r.xp_after) || null };
    }
    const offline = !navigator.onLine;
    return { state: "pending", big: "Confirmation en attente", sub: offline ? "Hors ligne, la séance est conservée sur cet appareil et partira dès le retour du réseau." : "Conservée sur cet appareil. Confirmation du serveur en cours…" };
  }

  function cadenceHtml(log) {
    const settings = window.TitanData?.cadenceSettings?.() || { target: 3, pauses: [] };
    const c = P().cadence(window.state?.history || [], { target: settings.target, pauses: settings.pauses, now: new Date() });
    if (c.currentPaused) return `<p class="asc-small asc-muted">Cadence en pause. Ta séance reste dans ton journal.</p>`;
    const t = new Date(log.date);
    if (F().weekStart(t).getTime() !== F().weekStart(new Date()).getTime()) return "";
    const days = c.currentDays;
    const notches = Array.from({ length: c.target }, (_, i) => `<span class="asc-notch" data-state="${i < days ? "held" : "current"}" style="--fill:0%"></span>`).join("");
    const text = days >= c.target ? (days === c.target ? "Semaine tenue. Tout ce qui suit est du bonus, pas une obligation." : `Semaine tenue, ${days} jours actifs.`) : `Encore ${c.remaining} jour${c.remaining > 1 ? "s" : ""} actif${c.remaining > 1 ? "s" : ""} pour tenir ta semaine.`;
    return `<section class="moment-block"><div class="asc-between"><p class="moment-label">Ta semaine</p><span class="asc-small asc-muted">${days}/${c.target} jours actifs</span></div>
      <div class="asc-notches moment-notches" style="grid-template-columns:repeat(${c.target},1fr)" aria-hidden="true">${notches}</div><p class="asc-small asc-muted">${esc(text)}</p></section>`;
  }

  function masteryHtml(log) {
    const m = P().mastery(window.state?.history || []).find((x) => x.sport === log.sport);
    if (!m) return "";
    const pct = Math.round(m.progress * 100);
    return `<section class="moment-block"><div class="asc-between"><p class="moment-label">Maîtrise · ${esc(m.label)}</p><span class="asc-small asc-muted">${esc(m.name)}</span></div>
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

  /* La révélation de progression (web): the gain counts up while the level bar moves from where it stood to where it stands; on a new level the rank crest settles beside the figure.
     Decorative (aria-hidden: the text of the reward right below says everything); only for a gain the server confirmed; once per opening of the sheet;
     the final state is shown at once with "reduire les animations". */
  const reducedMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  function hero(log, play) {
    const rw = reward(log);
    if (!(rw.state === "confirmed" || rw.state === "capped") || !(rw.xp > 0) || !window.TitanCrest) return "";
    const level = rw.levelAfter || 1;
    const need = Math.max(1, E().levelRequirement ? E().levelRequirement(level) : 1);
    const after = rw.xpAfter === null ? 0 : Math.max(0, Math.min(1, rw.xpAfter / need));
    const from = rw.levelUp ? 0 : Math.max(0, Math.min(1, Math.max(0, (rw.xpAfter ?? 0) - rw.xp) / need));
    const to = rw.levelUp ? 1 : after;
    const animate = play && !reducedMotion();
    const rank = window.TitanCrest.rankIdOf(level);
    const known = rw.levelAfter !== null && rw.xpAfter !== null;
    // The gain is the figure; the level it moves is the same bar as on the QG. Before this session the bar stood at `from`
    // (drawn as a quieter tone under the fill), after it at `to`.
    return `<section class="moment-hero${animate ? "" : " struck"}" aria-hidden="true" data-level-up="${rw.levelUp ? 1 : 0}" data-play="${animate ? 1 : 0}" data-to="${to}" style="--accent:${window.TitanCrest.ACCENT[rank]}">
      <div class="moment-ring moment-climb">
        <p class="moment-climb-figure"><span class="moment-ring-xp asc-num" data-count="${rw.xp}">+${F().number(rw.xp)}</span><small>XP</small></p>
        ${known ? `<div class="moment-climb-bar"><span class="mc-before" style="width:${(from * 100).toFixed(2)}%"></span><span class="mc-fill" style="width:${((animate ? from : to) * 100).toFixed(2)}%"></span></div>
        <p class="moment-climb-legend"><span>${rw.levelUp ? `Niveau ${F().number(level)} atteint` : `Niveau ${F().number(level)}`}</span><span>${rw.levelUp ? esc(E().rank(level).name) : `vers le niveau ${F().number(level + 1)}`}</span></p>` : ""}
        ${rw.levelUp ? `<div class="moment-crest">${window.TitanCrest.svg(rank, 104)}</div>` : ""}
      </div>
    </section>`;
  }
  function playHero(root) {
    const h = root.querySelector(".moment-hero[data-play='1']");
    if (!h) return;
    const fill = h.querySelector(".mc-fill"), num = h.querySelector(".moment-ring-xp");
    const to = Number(h.dataset.to) || 0, xp = Number(num?.dataset.count) || 0;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (fill) fill.style.width = `${(to * 100).toFixed(2)}%`;
      const t0 = performance.now();
      const step = (now) => { const k = Math.min(1, (now - t0 - 200) / 900); const v = k <= 0 ? 0 : Math.round(xp * (1 - Math.pow(1 - k, 4))); if (num) num.textContent = "+" + F().number(v); if (k < 1) requestAnimationFrame(step); else if (num) num.textContent = "+" + F().number(xp); };
      requestAnimationFrame(step);
      setTimeout(() => h.classList.add("struck"), 1300);
    }));
  }

  /* One reasonable next step, in one sentence (V13-43). It never promises a gain: it says what is left to do, or that nothing is. */
  function nextStep(log, rw) {
    if (rw.state === "pending" && log.syncStatus === "error") return "Ouvre le journal pour vérifier cette séance : elle y reste, avec les options de reprise.";
    if (isGuest()) return "Crée un compte pour garder cette séance partout, ou continue en mode découverte.";
    if (rw.state === "history") return "Rien d’autre à faire : ton journal et tes records sont à jour.";
    if (log.syncStatus !== "confirmed") return "Rien à faire : la confirmation arrive d’elle-même, tu peux fermer cette fenêtre.";
    if (rw.state === "pending") return "Rien à faire : la récompense arrive d’elle-même si rien n’est trouvé.";
    const s = window.TitanAdventure?.snapshot, C = window.TitanCodex;
    if (s && C && s.owner === window.state?.user?.id) {
      const c = (s.campaigns || []).find((x) => x.id === s.selected_world && x.chapter > 0 && x.chapter <= 9) || (s.campaigns || []).find((x) => x.chapter > 0 && x.chapter <= 9);
      if (!c) return "Choisis un monde dans l’aventure : tes prochains jours actifs y compteront.";
      const progress = P().campaignProgress?.(c);
      if (progress?.ready) return "Ton chapitre est prêt : ouvre l’aventure pour allumer la balise.";
      const left = (progress?.objectives || []).filter((o) => o.remaining > 0).map((o) => `${F().number(o.remaining)} ${o.id === "days" ? `jour${o.remaining > 1 ? "s" : ""} actif${o.remaining > 1 ? "s" : ""}` : "min d’effort"}`).join(" et ");
      if (left) return `Encore ${left} pour terminer ton chapitre.`;
    }
    return "Reviens quand tu veux : un jour de repos ne te retire rien.";
  }

  /* Three parts, in the order the session happened: what you did, what it changed (only what is confirmed, or an explicit wait),
     what comes next. The XP figure is shown once: in the ring when the server confirmed it, in plain text otherwise. */
  function html(log, play) {
    const rw = reward(log);
    const recs = records(log);
    const m = metrics(log);
    const ring = hero(log, play);
    // The session leads with one figure set large on the field (its distance, its volume, or its time); the rest follows as a row.
    // A record that fell leads instead: it is what the session will be remembered for, and the field turns amber.
    const top = recs.find((r) => !r.first) || null;
    const lead = top ? [`Record · ${top.label}`, fmtRecord(top)] : m.find(([k]) => k === "Distance") || m.find(([k]) => k === "Volume") || m.find(([k]) => k === "Durée") || m[0];
    const rest = top ? m : m.filter((x) => x !== lead);
    const others = recs.filter((r) => r !== top);
    return `<div class="moment" data-state="${rw.state}"${top ? ' data-record="1"' : ""}>
      <div class="moment-field">
        <h3 class="moment-label">Tu as fait</h3>
        ${lead ? `<p class="moment-lead"><span class="asc-num">${esc(lead[1])}</span><small>${esc(lead[0])}${top && top.previous ? `<br>avant : ${esc(fmtRecord(top, top.previous.value))}` : ""}</small></p>` : ""}
        <dl class="moment-metrics">${rest.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="asc-num">${esc(v)}</dd></div>`).join("")}${lead && !top ? `<div class="sr-only"><dt>${esc(lead[0])}</dt><dd>${esc(lead[1])}</dd></div>` : ""}</dl>
      </div>
      ${others.length ? `<section class="moment-block moment-records"><p class="moment-label am">${others.every((r) => r.first) ? (others.length > 1 ? "Premiers repères" : "Premier repère") : others.length > 1 ? "Autres records" : "Autre record"}</p>${others
        .map((r) => `<div class="moment-record"><span class="moment-record-label">${esc(r.label)}</span><strong class="asc-num">${esc(fmtRecord(r))}</strong><span class="asc-small asc-faint">${r.previous ? `avant : ${esc(fmtRecord(r, r.previous.value))}` : "ta référence pour la suite"}</span></div>`)
        .join("")}</section>` : ""}
      <h3 class="moment-label">Ce que ça change</h3>
      <div class="moment-gain${ring ? " has-ring" : ""}">
        ${ring}
        <section class="moment-reward" data-state="${rw.state}" aria-live="polite">
          <p class="moment-xp asc-num${ring ? " sr-only" : ""}">${esc(rw.big)}</p>
          <p class="asc-small">${esc(rw.sub)}</p>
          ${rw.credits > 0 ? `<p class="asc-small">+${F().number(rw.credits)} crédits</p>` : ""}
          ${rw.levelUp ? `<p class="moment-level">${icon("ascent")} Niveau ${F().number(rw.levelUp)} · ${esc(E().rank(rw.levelUp).name)}</p>` : ""}
        </section>
      </div>
      ${cadenceHtml(log)}
      ${masteryHtml(log)}
      ${adventureHtml(log)}
      <h3 class="moment-label">Et ensuite ?</h3>
      <p class="moment-next">${esc(nextStep(log, rw))}</p>
      <div class="moment-actions">
        ${window.TitanShare?.available() && !E().isHistorical(log.date) ? `<button type="button" class="asc-btn asc-btn-ghost moment-share" data-moment="share">${icon("send")} Partager avec mes amis</button>` : ""}
        ${isGuest() ? `<a class="asc-btn asc-btn-primary" href="/login?mode=signup" data-moment-signup>${icon("user")} Créer un compte et garder ma séance</a>` : ""}
        <button type="button" class="asc-btn ${isGuest() ? "asc-btn-secondary" : "asc-btn-primary"}" data-moment="done">Terminé</button>
        <a class="asc-btn asc-btn-secondary" href="/journal">${icon("journal")} Voir dans le journal</a>
      </div>
    </div>`;
  }

  function open(log) {
    if (!log || !window.titanShell?.sheet || !window.state?.user?.id || window.titanAccountTransition?.active) return;
    const job = { owner: window.state.user.id, client: window.titanClient, epoch: window.titanAccountTransition?.epoch };
    const currentContext = () => job.owner === window.state?.user?.id && job.client === window.titanClient
      && job.epoch === window.titanAccountTransition?.epoch && !window.titanAccountTransition?.active;
    let closed = false, focusTimer = null;
    const when = F().relativeDay(log.date);
    const body = document.createElement("div");
    let played = false;
    const firstHtml = () => { const l = current(log); const play = !played && l.syncStatus === "confirmed"; const out = html(l, play); if (play && out.includes("moment-hero")) played = true; return out; };
    body.innerHTML = firstHtml();
    const broken = records(current(log)).filter((r) => !r.first);
    if (broken.length) window.TitanAnalytics?.track("record_unlocked", { kind: broken[0].kind, family: S().familyOf(log.sport) });
    const historical = E().isHistorical(log.date);
    const dialog = window.titanShell.sheet({
      title: S().label(log.sport),
      eyebrow: `${historical ? "Ajoutée à ton historique" : "Séance enregistrée"} · ${when}`,
      body,
      onClose: () => {
        closed = true;
        clearTimeout(focusTimer);
        // The session page redraws its list behind the sheet (history update): the element that had the focus may be gone, and the
        // focus would fall on the page body. Hand it to the page title instead, once the browser has finished closing the dialog.
        setTimeout(() => {
          if (document.activeElement === document.body && !document.querySelector("dialog[open]")) document.querySelector("[data-pick-title], [data-hub-title]")?.focus({ preventScroll: true });
        }, 0);
        window.removeEventListener("titan:history-updated", update);
        window.removeEventListener("titan:adventure-updated", update);
        window.removeEventListener("titan:account-changing", closeForAccount);
        window.removeEventListener("titan:account-changed", closeForAccount);
      },
    });
    dialog.classList.add("moment-sheet");
    // The end of a session is set in the lime of the Séance space, whatever page it opens over; a record turns its field amber.
    dialog.dataset.space = "seance";
    const markRecord = () => dialog.toggleAttribute("data-record", !!body.querySelector(".moment[data-record]"));
    markRecord();
    const initialFocus = document.activeElement;
    const live = () => !closed && dialog.isConnected && dialog.open && currentContext();
    const topmost = () => [...document.querySelectorAll("dialog[open]")].at(-1) === dialog;
    function closeForAccount() { dialog.close(); }
    function restoreAction(selector) {
      if (!live() || !topmost() || ![document.body, dialog].includes(document.activeElement)) return;
      (body.querySelector(selector) || body.querySelector("[data-moment='done']"))?.focus({ preventScroll: true });
    }
    let wasConfirmed = current(log).syncStatus === "confirmed";
    function update() {
      if (!live()) { if (dialog.open) dialog.close(); return; }
      const focused = document.activeElement;
      const action = body.contains(focused) ? focused.closest("[data-moment], a[href]") : null;
      const selector = action?.hasAttribute("data-moment") ? `[data-moment="${CSS.escape(action.dataset.moment)}"]`
        : action ? `a[href="${CSS.escape(action.getAttribute("href"))}"]` : null;
      const l = current(log);
      body.innerHTML = firstHtml();
      markRecord();
      playHero(body);
      if (selector) restoreAction(selector);
      if (!wasConfirmed && l.syncStatus === "confirmed") {
        wasConfirmed = true;
        window.TitanAdventure?.refresh?.({ force: true });
      }
    }
    const openedAt = performance.now();
    body.addEventListener("click", (e) => {
      if (!live()) { if (dialog.open) dialog.close(); return; }
      // The sheet opens under the pointer that just saved: the second click of a double click on « Enregistrer » is not a choice made here.
      if (e.detail > 1 && performance.now() - openedAt < 700) return;
      if (e.target.closest("[data-moment='done']")) dialog.close();
      if (e.target.closest("[data-moment='share']")) {
        const l = current(log);
        const rec = records(l).find((r) => !r.first);
        const m = metrics(l).filter(([k]) => k !== "Ressenti").slice(0, 3).map(([, v]) => v).join(" · ");
        window.TitanShare.open({
          kind: rec ? "record" : "session",
          title: rec ? `${S().label(l.sport)} : ${rec.label.toLowerCase()} ${fmtRecord(rec)}` : `${S().label(l.sport)} · ${m}`,
          detail: rec ? (rec.previous ? `avant : ${fmtRecord(rec, rec.previous.value)}` : "") : "",
          sport: l.sport,
          logId: l.syncStatus === "confirmed" ? l.id : null,
        }).then(() => restoreAction("[data-moment='share']"));
      }
    });
    playHero(body);
    window.addEventListener("titan:history-updated", update);
    window.addEventListener("titan:adventure-updated", update);
    window.addEventListener("titan:account-changing", closeForAccount);
    window.addEventListener("titan:account-changed", closeForAccount);
    focusTimer = setTimeout(() => {
      if (live() && topmost() && [initialFocus, document.body, dialog].includes(document.activeElement)) body.querySelector("[data-moment='done']")?.focus({ preventScroll: true }); // scrolling to the button would hide the progression above it
    }, 30);
    return dialog;
  }

  window.TitanMoment = { open, metrics, reward };
})();
