(function () {
  "use strict";
  const R = window.TitanRenaissance;
  function render() {
    const u = window.state?.user,
      host = document.getElementById("today-content");
    if (!u || !host) return;
    const focused = document.activeElement?.id;
    const now = new Date(),
      start = new Date(now);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    start.setHours(0, 0, 0, 0);
    const logs = window.TitanAdventure.activeLogs(window.state.history).sort(
      (a, b) => new Date(b.date) - new Date(a.date),
    );
    const week = logs.filter((l) => new Date(l.date) >= start),
      s = window.TitanAdventure.snapshot;
    const minutes = week
      .map(window.TitanTraining.duration)
      .filter((n) => n !== null)
      .reduce((a, b) => a + b, 0);
    const goal = Math.min(14, Math.max(1, Number(u.weeklyGoalSessions) || 3));
    const returning =
      logs.length && now - new Date(logs[0].date) > 14 * 86400000;
    document.getElementById("today-date").textContent = now.toLocaleDateString(
      "fr-FR",
      { weekday: "long", day: "numeric", month: "long" },
    );
    document.getElementById("today-greeting").textContent = "Ton camp de base.";
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = window.TitanTraining.dateKey(d),
        done = week.some((l) => window.TitanTraining.dateKey(l.date) === key);
      return `<div class="r-week-day ${done ? "done" : ""} ${key === window.TitanTraining.dateKey(now) ? "current" : ""}" title="${R.esc(d.toLocaleDateString("fr-FR"))} · ${done ? "Séance enregistrée" : "Aucune séance"}"><span>${d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")}</span><b>${done ? R.icon("check") : d.getDate()}</b></div>`;
    }).join("");
    host.innerHTML = `<div class="r-hero-grid"><section class="r-hero"><picture><source media="(max-width:600px)" srcset="/assets/renaissance/valley-small.webp"><img src="/assets/renaissance/valley.webp" width="1600" height="900" alt="Les portes de pierre de la vallée de l’Aube" fetchpriority="high"></picture>${R.status(s)}<div class="r-hero-content"><span class="r-eyebrow">TON EFFORT. TON AVENTURE.</span><h2>${returning ? "Ton chemin<br>t’attend <em>toujours.</em>" : "Le prochain<br>chapitre, <em>c’est toi.</em>"}</h2><p>${returning ? "Ton niveau est conservé. Reprends avec une séance à ta mesure, puis ajuste ton objectif de la semaine." : "Chaque séance fait grandir ton personnage et éclaire un nouveau chemin. À ton rythme, avec tes sports."}</p></div><div class="r-hero-bottom"><a class="r-button primary" href="/training">${R.icon("plus")}${logs.length ? "Enregistrer une séance" : "Ma première séance"}</a><span>Du mouvement réel.<br>Des progrès qui restent.</span></div></section>${R.character(s)}</div>
    <div class="r-dashboard-grid">${R.mission(s)}<section class="r-panel"><div class="r-section-head"><h2>Ta semaine, à ton rythme.</h2><a href="/stats">Progrès ${R.icon("arrow")}</a></div><div class="r-week-total"><strong>${week.length}</strong><span>séances · ${R.fmt(minutes)} min renseignées</span></div><div class="r-week-days" aria-label="Séances de la semaine">${days}</div><label class="r-goal-control" for="weekly-session-goal">Mon repère hebdomadaire<select id="weekly-session-goal">${Array.from({ length: 14 }, (_, i) => `<option value="${i + 1}" ${goal === i + 1 ? "selected" : ""}>${i + 1} séance${i ? "s" : ""}</option>`).join("")}</select></label><progress value="${Math.min(goal, week.length)}" max="${goal}" aria-label="${week.length} séances sur ${goal}"></progress><p class="r-small" style="margin-top:12px">${week.length >= goal ? "Repère atteint. Profite du chemin parcouru." : "Un repère ajustable. Les jours sans séance font aussi partie de la semaine."}</p></section></div>
    <section class="r-block"><div class="r-section-head"><div><span class="r-eyebrow">LES PETITS PAS FONT LES GRANDS VOYAGES</span><h2 style="margin-top:7px">Tes repères de la semaine</h2></div><a href="/objectifs">Mes objectifs ${R.icon("arrow")}</a></div><div class="r-quest-grid">${window.TitanAdventure.weeklyQuests(
      logs,
      goal,
      now,
    )
      .map(
        (q) =>
          `<article class="r-quest"><div class="r-quest-header">${R.icon(q.icon)}<span>${q.value >= q.target ? "Accompli" : `${Math.min(q.value, q.target)} / ${q.target}`}</span></div><h3>${R.esc(q.name)}</h3><p>${R.esc(q.text)}</p><progress value="${Math.min(q.value, q.target)}" max="${q.target}" aria-label="${R.esc(q.name)} : ${q.value} ${R.esc(q.unit)} sur ${q.target}"></progress><a href="${q.href}">${q.value >= q.target ? "Voir mes séances" : "Faire le prochain pas"} ${R.icon("arrow")}</a></article>`,
      )
      .join(
        "",
      )}</div><p class="r-small" style="margin-top:12px">Ces repères personnels se renouvellent chaque lundi. L’XP vient de tes séances confirmées ; aucun bonus caché.</p></section>
    <section class="r-panel r-block"><div class="r-section-head"><h2>Les traces de ton aventure</h2><a href="/journal">Tout le journal ${R.icon("arrow")}</a></div>${
      logs.length
        ? `<div class="r-session-list">${logs
            .slice(0, 3)
            .map(
              (l) =>
                `<a class="r-session" href="/journal?session=${encodeURIComponent(l.id)}"><span class="r-sport-tile">${R.icon(l.unit === "km" ? "route" : l.details?.exercises?.length ? "layers" : "bolt")}</span><div><strong>${R.esc(R.sport(l.sport))}</strong><small>${R.fmt(l.val)} ${R.esc(l.unit)}${window.TitanTraining.duration(l) && l.unit !== "min" ? ` · ${R.fmt(window.TitanTraining.duration(l))} min` : ""}</small></div><span>${new Date(l.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}<small>${l.syncStatus === "confirmed" || l.details?.serverReward === true ? "Confirmée" : "Sur cet appareil"}</small></span></a>`,
            )
            .join("")}</div>`
        : `<div class="r-empty"><h3>Un premier effort. Une première trace.</h3><p>Choisis ton sport, renseigne ta séance et retrouve ici tes données. Ton personnage et tes missions avancent avec toi.</p><a class="r-button primary" href="/training">Commencer ${R.icon("arrow")}</a></div>`
    }<div class="r-shortcuts"><a class="r-button subtle" href="/training?sport=running">${R.icon("route")}Course</a><a class="r-button subtle" href="/training?sport=muscu_builder">${R.icon("layers")}Musculation</a><a class="r-button subtle" href="/sports">${R.icon("compass")}Explorer les sports</a><a class="r-button subtle" href="/bilan">${R.icon("download")}Mon bilan</a></div></section>
    ${String(u.id).startsWith("guest_") ? '<div class="r-notice"><span>Tu explores TITAN sur cet appareil. Le niveau de découverte est une simulation locale ; les niveaux du compte suivent les récompenses du serveur.</span><a href="/login">Créer mon compte</a></div>' : ""}
    ${window.TitanAdventure.status === "error" ? '<div class="r-notice"><span>La progression de ton personnage est momentanément indisponible. Tes séances restent accessibles.</span><button class="r-button subtle" id="adventure-retry">Réessayer</button></div>' : ""}`;
    document
      .getElementById("weekly-session-goal")
      ?.addEventListener("change", (e) => {
        window.state.user.weeklyGoalSessions = Number(e.target.value);
        window.saveState?.();
        render();
      });
    document
      .getElementById("adventure-retry")
      ?.addEventListener("click", () =>
        window.TitanAdventure.refresh({ force: true }),
      );
    if (focused === "weekly-session-goal")
      document.getElementById(focused)?.focus();
  }
  window.addEventListener("titan:history-updated", render);
  window.addEventListener("titan:catalog-ready", render);
  window.addEventListener("titan:adventure-updated", render);
  document.addEventListener("DOMContentLoaded", render);
  render();
})();
