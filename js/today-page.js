(function () {
  "use strict";
  const esc = window.titanEscapeText;
  const label = (k) =>
    (window.SPORTS_CONFIG?.[k]?.label || k)
      .replace(" (Route)", "")
      .replace(" (Builder)", "")
      .replace(" (Piscine)", "");
  const fmt = (n) =>
    Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  function render() {
    const user = window.state?.user;
    if (!user) return;
    const now = new Date(),
      start = new Date(now);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    start.setHours(0, 0, 0, 0);
    const history = (window.state.history || [])
      .filter((l) => !l.archived_at)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const week = history.filter(
      (l) => new Date(l.date) >= start && new Date(l.date) <= now,
    );
    const mins = week
        .map(window.TitanTraining.duration)
        .filter((n) => n !== null)
        .reduce((a, b) => a + b, 0),
      goal = Math.min(14, Math.max(1, Number(user.weeklyGoalSessions) || 3));
    document.getElementById("today-date").textContent = now.toLocaleDateString(
      "fr-FR",
      { weekday: "long", day: "numeric", month: "long" },
    );
    document.getElementById("today-greeting").textContent =
      user.name && !["Recrue", "Agent"].includes(user.name)
        ? `À toi de jouer, ${user.name}.`
        : "Du mouvement. À ta façon.";
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = window.TitanTraining.dateKey(d),
        logs = week.filter((l) => window.TitanTraining.dateKey(l.date) === key);
      return `<div class="today-day ${logs.length ? "done" : ""} ${key === window.TitanTraining.dateKey(now) ? "current" : ""}" title="${esc(d.toLocaleDateString("fr-FR"))} : ${logs.length} séance(s)"><span>${d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")}</span><b>${logs.length ? "✓" : d.getDate()}</b></div>`;
    }).join("");
    document.getElementById("today-content").innerHTML =
      `<div class="today-grid"><section class="today-week"><div class="today-panel-head"><h2>Ta semaine, en mouvement.</h2><a href="/stats">Voir mes progrès ↗</a></div><div class="today-total"><strong>${week.length}</strong><span>séance${week.length > 1 ? "s" : ""} · ${fmt(mins)} min renseignées</span></div><div class="today-calendar" aria-label="Séances de la semaine">${days}</div><div class="today-goal"><label for="weekly-session-goal">Ton objectif hebdomadaire<select id="weekly-session-goal">${Array.from({ length: 14 }, (_, i) => `<option value="${i + 1}" ${goal === i + 1 ? "selected" : ""}>${i + 1} séance${i ? "s" : ""}</option>`).join("")}</select></label><progress value="${Math.min(goal, week.length)}" max="${goal}" aria-label="${week.length} séances sur un objectif de ${goal}"></progress><p class="today-caption">${week.length >= goal ? "Ton objectif est atteint. Savoure le chemin parcouru." : "Un repère personnel, à ajuster selon tes envies et ta disponibilité."}</p></div></section><aside class="today-inspiration"><span class="tracking-eyebrow">Le prochain pas t’appartient</span><h2>${history.length ? "Reprends ton élan." : "Le plus beau départ, c’est le tien."}</h2><p>${history.length ? `Envie de reprendre ${esc(label(history[0].sport).toLowerCase())} ? Ton journal garde les repères de ta dernière séance.` : "Course, musculation, escalade… Commence avec le sport qui te donne envie."}</p><a href="/training${history.length ? "?sport=" + encodeURIComponent(history[0].sport) : ""}">${history.length ? "Reprendre ce sport" : "Choisir mon sport"} →</a></aside></div><section class="today-recent"><div class="today-panel-head"><h2>Tes derniers efforts.</h2><a href="/journal">Tout le journal ↗</a></div>${
        history.length
          ? history
              .slice(0, 3)
              .map(
                (l) =>
                  `<a class="today-session" href="/journal?session=${encodeURIComponent(l.id)}"><i class="${/^ri-[a-z0-9-]+$/.test(window.SPORTS_CONFIG?.[l.sport]?.icon || "") ? window.SPORTS_CONFIG[l.sport].icon : "ri-run-line"}" aria-hidden="true"></i><div><strong>${esc(label(l.sport))}</strong><small>${fmt(l.val)} ${esc(l.unit)}${window.TitanTraining.duration(l) && l.unit !== "min" ? " · " + fmt(window.TitanTraining.duration(l)) + " min" : ""}</small></div><span>${new Date(l.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}<br>${l.syncStatus === "confirmed" ? "Synchronisée" : "Sur cet appareil"}</span></a>`,
              )
              .join("")
          : `<div class="today-start"><div><h3>Ton histoire sportive commence ici.</h3><p>Pas besoin de battre un record. Note simplement ta prochaine séance et retrouve-la ici.</p></div><a class="tracking-action" href="/training">Ma première séance ↗</a></div>`
      }<div class="today-shortcuts"><a href="/training?sport=running"><i class="ri-run-line" aria-hidden="true"></i> Course</a><a href="/training?sport=muscu_builder"><i class="ri-boxing-line" aria-hidden="true"></i> Musculation</a><a href="/sports"><i class="ri-search-line" aria-hidden="true"></i> Tous les sports</a></div></section>${String(user.id).startsWith("guest_") ? '<div class="today-local">Tu explores TITAN en mode invité. Tes séances sont conservées sur cet appareil.<a href="/login">Créer un compte</a></div>' : `<p class="today-level">Ta progression TITAN · Niveau ${Number(user.level) || 1}<a href="/trophies">Mes trophées →</a></p>`}`;
    document
      .getElementById("weekly-session-goal")
      .addEventListener("change", (e) => {
        window.state.user.weeklyGoalSessions = Number(e.target.value);
        window.saveState?.();
        const focusValue = e.target.value;
        render();
        document.getElementById("weekly-session-goal").focus();
        window.showNotification?.(
          "success",
          "Objectif ajusté",
          `${focusValue} séances par semaine. Tu peux le changer à tout moment.`,
        );
      });
  }
  window.addEventListener("titan:history-updated", render);
  window.addEventListener("titan:catalog-ready", render);
  document.addEventListener("DOMContentLoaded", render);
  render();
})();
