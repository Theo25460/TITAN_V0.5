(function () {
  "use strict";
  const days = [
    ["monday", "Lundi"],
    ["tuesday", "Mardi"],
    ["wednesday", "Mercredi"],
    ["thursday", "Jeudi"],
    ["friday", "Vendredi"],
    ["saturday", "Samedi"],
    ["sunday", "Dimanche"],
  ];
  const esc = window.titanEscapeText;
  function render() {
    const panel = document.getElementById("weekly-plan");
    if (!panel || !window.state?.user) return;
    const schedule = window.state.user.schedule || {},
      sports = Object.entries(window.SPORTS_CONFIG || {}).sort((a, b) =>
        a[1].label.localeCompare(b[1].label, "fr"),
      );
    panel.innerHTML = `<div class="today-panel-head"><h2>Une semaine qui te ressemble.</h2><span class="tracking-status">Semaine type · Gratuit</span></div><p class="tracking-status">Pose tes envies. Ce planning se répète chaque semaine et reste ajustable : aucune séance n’est enregistrée automatiquement.</p><div class="week-plan-grid">${days.map(([key, label]) => `<label for="plan-${key}"><span>${label}</span><select id="plan-${key}" data-plan-day="${key}"><option value="">Libre / repos</option>${sports.map(([sport, c]) => `<option value="${esc(sport)}" ${schedule[key]?.sport === sport ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</select>${schedule[key]?.sport ? `<a href="/training?sport=${encodeURIComponent(schedule[key].sport)}">Enregistrer ↗</a>` : "<small>À ton rythme</small>"}</label>`).join("")}</div><p class="tracking-status" id="plan-status" role="status"></p>`;
  }
  document.getElementById("weekly-plan")?.addEventListener("change", (e) => {
    const day = e.target.dataset.planDay;
    if (!days.some(([key]) => key === day)) return;
    const sport = e.target.value;
    if (sport && !window.SPORTS_CONFIG?.[sport]) return;
    const u = window.state.user;
    u.schedule = {
      ...u.schedule,
      [day]: { ...u.schedule?.[day], sport: sport || null },
    };
    window.saveState?.();
    render();
    document.getElementById("plan-" + day)?.focus();
    document.getElementById("plan-status").textContent = String(
      u.id,
    ).startsWith("guest_")
      ? "Planning conservé sur cet appareil."
      : "Planning enregistré sur cet appareil. La sauvegarde cloud suit le statut de synchronisation.";
  });
  window.addEventListener("titan:catalog-ready", render);
  window.addEventListener("titan:history-updated", render);
  render();
})();
