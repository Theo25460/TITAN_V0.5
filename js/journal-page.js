let selectedActivityId = new URLSearchParams(location.search).get("session");
let lastActivitySignature = "";
let activityViewMode = "list";
let requestedActivitySport = new URLSearchParams(location.search).get("sport");

document.addEventListener("DOMContentLoaded", () => {
  bindActivityControls();

  const checkState = setInterval(() => {
    if (window.state && window.state.game) {
      clearInterval(checkState);
      bootActivityJournal();
      watchActivityJournal();
      if (window.injectMobileHeader) window.injectMobileHeader();
    }
  }, 100);

  setTimeout(() => {
    clearInterval(checkState);
    bootActivityJournal();
    watchActivityJournal();
  }, 3000);
});

function bindActivityControls() {
  [
    "activity-sport-filter",
    "activity-month-filter",
    "activity-intensity-filter",
    "activity-search",
  ].forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.addEventListener("input", renderActivityJournal);
    if (node && node.tagName === "SELECT")
      node.addEventListener("change", renderActivityJournal);
  });
  document.querySelectorAll("[data-activity-view]").forEach((button) => {
    button.addEventListener("click", () => {
      activityViewMode =
        button.dataset.activityView === "calendar" ? "calendar" : "list";
      document.querySelectorAll("[data-activity-view]").forEach((item) => {
        const active = item.dataset.activityView === activityViewMode;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", active ? "true" : "false");
      });
      renderActivityJournal();
    });
  });
  document
    .getElementById("activity-reset-filters")
    ?.addEventListener("click", () => {
      const sport = document.getElementById("activity-sport-filter");
      const month = document.getElementById("activity-month-filter");
      const intensity = document.getElementById("activity-intensity-filter");
      const search = document.getElementById("activity-search");
      if (sport) sport.value = "all";
      if (month) month.value = "";
      if (intensity) intensity.value = "all";
      if (search) search.value = "";
      renderActivityJournal();
    });
}

function watchActivityJournal() {
  if (window.__titanJournalActivityWatch) return;
  window.__titanJournalActivityWatch = true;
  let ticks = 0;
  const timer = setInterval(() => {
    ticks += 1;
    const signature = buildActivitySignature();
    if (signature !== lastActivitySignature) {
      bootActivityJournal();
    }
    if (ticks > 10) clearInterval(timer);
  }, 1500);
}

function bootActivityJournal() {
  renderActivityFilters();
  renderActivityJournal();
}

function buildActivitySignature() {
  const history = Array.isArray(window.state?.history)
    ? window.state.history
    : [];
  const latest = history.length ? history[history.length - 1] : null;
  return `${history.length}:${latest?.id || latest?.date || ""}:${window.state?.user?.is_elite ? "elite" : "free"}`;
}

function getActivityLogs() {
  const history = document.getElementById("show-archived")?.checked
    ? (window.state?.archivedHistory || []).slice()
    : (window.state?.history || []).slice();
  return history.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function renderActivityFilters() {
  const select = document.getElementById("activity-sport-filter");
  if (!select) return;
  const current = select.value || "all";
  const logs = getActivityLogs();
  const sports = Array.from(
    new Set(logs.map((log) => log.sport).filter(Boolean)),
  ).sort((a, b) => sportName(a).localeCompare(sportName(b)));
  select.innerHTML =
    '<option value="all">Tous les sports</option>' +
    sports
      .map(
        (sport) =>
          `<option value="${escapeText(sport)}">${escapeText(sportName(sport))}</option>`,
      )
      .join("");
  select.value = sports.includes(current) ? current : "all";
  if (requestedActivitySport && sports.includes(requestedActivitySport)) {
    select.value = requestedActivitySport;
    requestedActivitySport = null;
  }

  const note = document.getElementById("activity-elite-note");
  if (note) {
    note.hidden = true;
    note.textContent = "";
  }
}

function renderActivityJournal() {
  const feed = document.getElementById("activity-feed");
  const calendar = document.getElementById("activity-calendar");
  const count = document.getElementById("activity-count");
  if (!feed) return;

  const filters = getActivityFilters();
  let logs = getActivityLogs().filter((log) =>
    activityMatchesFilters(log, filters),
  );
  lastActivitySignature = buildActivitySignature();
  if (count)
    count.textContent = `${logs.length} ${logs.length > 1 ? "séances" : "séance"}`;

  if (!logs.length) {
    feed.hidden = false;
    if (calendar) calendar.hidden = true;
    feed.innerHTML =
      '<div class="activity-empty"><strong>Aucune séance trouvée.</strong><span>Ajuste les filtres ou ajoute un premier effort.</span><a href="./training.html">Enregistrer une séance</a></div>';
    renderActivityDetail(null);
    return;
  }

  if (!logs.some((log) => getActivityId(log) === selectedActivityId)) {
    selectedActivityId = getActivityId(logs[0]);
  }

  if (activityViewMode === "calendar") {
    feed.hidden = true;
    if (calendar) {
      calendar.hidden = false;
      calendar.innerHTML = renderActivityCalendar(logs, filters.month);
    }
  } else {
    feed.hidden = false;
    if (calendar) calendar.hidden = true;
    let previousDay = "";
    feed.innerHTML = logs
      .map((log) => {
        const day = new Date(log.date || 0).toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        });
        const heading =
          day !== previousDay
            ? `<h3 class="activity-day-heading">${escapeText(day)}</h3>`
            : "";
        previousDay = day;
        return (
          heading +
          renderActivityCard(log, getActivityId(log) === selectedActivityId)
        );
      })
      .join("");
  }
  feed.querySelectorAll(".activity-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectedActivityId = card.dataset.activityId || null;
      renderActivityJournal();
    });
  });

  renderActivityDetail(
    logs.find((log) => getActivityId(log) === selectedActivityId) || logs[0],
  );
}

function renderActivityCalendar(logs, requestedMonth) {
  const fallback = logs[0]?.date ? new Date(logs[0].date) : new Date();
  const parts = requestedMonth
    ? requestedMonth.split("-").map(Number)
    : [fallback.getFullYear(), fallback.getMonth() + 1];
  const year = parts[0];
  const monthIndex = Math.max(0, Math.min(11, (parts[1] || 1) - 1));
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const offset = (firstDay.getDay() + 6) % 7;
  const byDay = new Map();
  logs.forEach((log) => {
    const date = new Date(log.date || 0);
    if (date.getFullYear() !== year || date.getMonth() !== monthIndex) return;
    const day = date.getDate();
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(log);
  });
  const blanks = Array.from(
    { length: offset },
    () => '<div class="activity-calendar-day empty" aria-hidden="true"></div>',
  ).join("");
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const entries = byDay.get(day) || [];
    const sessions = entries
      .slice(0, 3)
      .map(
        (log) =>
          `<button type="button" data-calendar-activity="${escapeText(getActivityId(log))}" title="${escapeText(sportName(log.sport))}"><span>${escapeText(sportName(log.sport))}</span></button>`,
      )
      .join("");
    return `<div class="activity-calendar-day ${entries.length ? "has-session" : ""}"><strong>${day}</strong>${sessions}${entries.length > 3 ? `<small>+${entries.length - 3}</small>` : ""}</div>`;
  }).join("");
  setTimeout(() => {
    document.querySelectorAll("[data-calendar-activity]").forEach((button) =>
      button.addEventListener("click", () => {
        selectedActivityId = button.dataset.calendarActivity;
        renderActivityDetail(
          logs.find((log) => getActivityId(log) === selectedActivityId),
        );
      }),
    );
  }, 0);
  return `<div class="activity-calendar-title">${escapeText(firstDay.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }))}</div><div class="activity-calendar-weekdays"><span>Lun</span><span>Mar</span><span>Mer</span><span>Jeu</span><span>Ven</span><span>Sam</span><span>Dim</span></div><div class="activity-calendar-grid">${blanks}${days}</div>`;
}

function normalizeActivitySearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getActivityFilters() {
  return {
    sport: document.getElementById("activity-sport-filter")?.value || "all",
    month: document.getElementById("activity-month-filter")?.value || "",
    intensity:
      document.getElementById("activity-intensity-filter")?.value || "all",
    search: normalizeActivitySearch(
      document.getElementById("activity-search")?.value || "",
    ),
  };
}

function activityMatchesFilters(log, filters) {
  if (filters.sport !== "all" && log.sport !== filters.sport) return false;
  if (filters.month && activityMonth(log) !== filters.month) return false;
  if (
    filters.intensity !== "all" &&
    activityIntensity(log).key !== filters.intensity
  )
    return false;
  if (filters.search) {
    const details = log.details || {};
    const text = normalizeActivitySearch(
      `${sportName(log.sport)} ${log.cat || ""} ${details.summary || ""} ${details.note || ""} ${(details.tags || []).join(" ")} ${Object.values(details.extras || {}).join(" ")}`,
    );
    if (!text.includes(filters.search)) return false;
  }
  return true;
}

function renderActivityCard(log, active) {
  const metrics = activityMetrics(log).slice(0, 3);
  const intensity = activityIntensity(log);
  return `
                <button type="button" class="activity-card ${active ? "active" : ""}" data-activity-id="${escapeText(getActivityId(log))}">
                    <div class="activity-card-top">
                        <div class="activity-title">
                            <strong>${escapeText(sportName(log.sport))}</strong>
                            <span>${escapeText(activityDate(log))}</span>
                        </div>
                        <span class="activity-chip">${escapeText(intensity.label)}</span>
                    </div>
                    <div class="activity-chips">
                        ${metrics.map((metric) => `<span class="activity-chip">${escapeText(metric.label)}: ${escapeText(metric.value)}</span>`).join("")}
                    </div>
                    <div class="activity-card-bottom">
                        <span>${escapeText(activitySummary(log))}</span>
                        <span class="activity-chip reward">${log.syncStatus === "confirmed" ? "Synchronisée" : log.syncStatus === "error" ? "À corriger" : "Sur cet appareil"}</span>
                    </div>
                </button>`;
}

function renderActivityDetail(log) {
  const panel = document.getElementById("activity-detail");
  if (!panel) return;
  if (!log) {
    panel.innerHTML = `
                    <h3>Sélectionne une séance</h3>
                    <p>Le détail apparaît ici avec les mesures importantes selon le sport.</p>
                    <div class="activity-detail-grid">
                        <div class="activity-detail-metric"><span>Sport</span><strong>-</strong></div>
                        <div class="activity-detail-metric"><span>Effort</span><strong>-</strong></div>
                    </div>`;
    return;
  }

  const metrics = activityMetrics(log, true).slice(0, 8);
  const details = log.details || {};
  const note = details.note
    ? `<p>${escapeText(details.note)}</p>`
    : `<p>${escapeText(activitySummary(log))}</p>`;
  panel.innerHTML = `
                <h3>${escapeText(sportName(log.sport))}</h3>
                ${note}
                <div class="activity-detail-grid">
                    <div class="activity-detail-metric"><span>Date</span><strong>${escapeText(activityDate(log, true))}</strong></div>
                    <div class="activity-detail-metric"><span>Intensité</span><strong>${escapeText(activityIntensity(log).label)}</strong></div>
                    ${metrics.map((metric) => `<div class="activity-detail-metric"><span>${escapeText(metric.label)}</span><strong>${escapeText(metric.value)}</strong></div>`).join("")}
                    <div class="activity-detail-metric activity-reward-discrete"><span>Progression TITAN</span>${String(window.state?.user?.id||'').startsWith('guest_')?'<a href="/personnage">Voir mon niveau de découverte</a>':log.syncStatus&&log.syncStatus!=='confirmed'?'<strong>Confirmation en attente</strong>':`<strong>+${escapeText(Math.round(Number(log.xp || 0)))} XP</strong>`}</div>
                </div>
                <div class="activity-detail-actions"><a href="./training.html?sport=${encodeURIComponent(log.sport || "")}"><i class="ri-restart-line"></i> Reprendre ce sport</a><button type="button" class="tracking-secondary" data-session-action="edit" data-session-id="${escapeText(String(log.id))}">Modifier</button><button type="button" class="tracking-secondary" data-session-action="duplicate" data-session-id="${escapeText(String(log.id))}">Dupliquer</button><button type="button" class="tracking-secondary" data-session-action="${log.archived_at ? "restore" : "archive"}" data-session-id="${escapeText(String(log.id))}">${log.archived_at ? "Restaurer" : "Archiver"}</button></div>
                ${renderActivityReadout(log)}`;
}

function renderActivityReadout(log) {
  const exercises = log.details?.exercises || [];
  if (!exercises.length)
    return '<p class="tracking-status">Le ressenti et la durée sont facultatifs. Les renseigner facilite la comparaison de tes séances dans le bilan.</p>';
  return (
    '<details class="activity-detail-section"><summary>Voir les exercices et les séries</summary>' +
    exercises
      .map(
        (ex) =>
          "<h4>" +
          escapeText(ex.name) +
          '</h4><table class="tracking-table"><thead><tr><th>Série</th><th>Kg</th><th>Rép.</th><th>RIR</th></tr></thead><tbody>' +
          (ex.setRows?.length
            ? ex.setRows
            : Array.from(
                { length: Math.min(30, Number(ex.sets) || 1) },
                () => ex,
              )
          )
            .map(
              (r, i) =>
                "<tr><td>" +
                (i + 1) +
                "</td><td>" +
                escapeText(r.weight ?? "—") +
                "</td><td>" +
                escapeText(r.reps ?? "—") +
                "</td><td>" +
                escapeText(r.rir ?? "—") +
                "</td></tr>",
            )
            .join("") +
          "</tbody></table>",
      )
      .join("") +
    "</details>"
  );
}

function activityMetrics(log, detailed = false) {
  const details = log.details || {};
  const extras = details.extras || {};
  const metrics = [];
  const exercises = Array.isArray(details.exercises) ? details.exercises : [];
  const unit = log.unit || "";
  const value = Number(log.val || 0);
  const val1 = unit === "km" ? value : 0;
  const val2 = window.TitanTraining.duration(log);
  const ascent = Number(details.gpxStats?.ascent || details.elevation || 0);

  if (exercises.length) {
    const volume = exercises.reduce(
      (acc, ex) =>
        acc +
        (Number(ex.volume || 0) ||
          Number(ex.weight || 0) * Number(ex.sets || 0) * Number(ex.reps || 0)),
      0,
    );
    const sets = exercises.reduce((acc, ex) => acc + Number(ex.sets || 0), 0);
    const reps = exercises.reduce(
      (acc, ex) =>
        acc +
        (Number(ex.totalReps || 0) ||
          Number(ex.sets || 0) * Number(ex.reps || 0)),
      0,
    );
    metrics.push({ label: "Exercices", value: exercises.length });
    metrics.push({ label: "Séries", value: sets });
    metrics.push({ label: "Reps", value: reps });
    if (volume)
      metrics.push({
        label: "Volume",
        value: `${Math.round(volume).toLocaleString("fr-FR")} kg`,
      });
    if (extras.muscle_group || extras.muscles || extras.zone)
      metrics.push({
        label: "Zone",
        value: extras.muscle_group || extras.muscles || extras.zone,
      });
  } else if (unit === "km") {
    if (val1)
      metrics.push({ label: "Distance", value: `${formatNumber(val1, 2)} km` });
    if (val2)
      metrics.push({ label: "Durée", value: `${Math.round(val2)} min` });
    if (val1 && val2)
      metrics.push({
        label: "Vitesse",
        value: `${formatNumber(val1 / (val2 / 60), 1)} km/h`,
      });
    if (ascent)
      metrics.push({ label: "D+", value: `+${Math.round(ascent)} m` });
  } else {
    metrics.push({
      label: ["min", "h"].includes(unit) ? "Durée" : "Mesure",
      value: `${formatNumber(value, 1)} ${unit || "pts"}`,
    });
    if (val2 && !["min", "h"].includes(unit))
      metrics.push({ label: "Durée", value: `${Math.round(val2)} min` });
  }

  const climbAttempt =
    extras.level_attempted || extras.niveau_tente || extras.max_attempted;
  const climbDone =
    extras.level_done || extras.niveau_reussi || extras.max_done;
  if (climbAttempt) metrics.push({ label: "Tente", value: climbAttempt });
  if (climbDone) metrics.push({ label: "Reussi", value: climbDone });
  if (extras.session_type || extras.type || log.cat)
    metrics.push({
      label: "Type",
      value: extras.session_type || extras.type || log.cat,
    });
  if (extras.style) metrics.push({ label: "Style", value: extras.style });
  if (details.bio?.rpe)
    metrics.push({ label: "RPE", value: `${details.bio.rpe}/10` });
  if (window.titanCollectSessionMetrics) {
    window
      .titanCollectSessionMetrics(log)
      .filter((metric) => metric.definition?.source === "extra")
      .forEach((metric) => {
        if (!metrics.some((item) => item.label === metric.definition.label)) {
          metrics.push({
            label: metric.definition.label,
            value: metric.display,
          });
        }
      });
  }
  if (detailed && Array.isArray(details.tags) && details.tags.length)
    metrics.push({ label: "Tags", value: details.tags.join(", ") });
  return metrics;
}

function activityIntensity(log) {
  const details = log.details || {};
  const rpe = Number(details.bio?.rpe || 0);
  if (rpe < 1 || rpe > 10)
    return { key: "unknown", label: "Ressenti non renseigné" };
  const value = rpe;
  if (value >= 8) return { key: "hard", label: "Intense" };
  if (value >= 5) return { key: "moderate", label: "Modérée" };
  return { key: "light", label: "Légère" };
}

function activityReward(log) {
  const reward = log.details?.serverReward || log.details?.rewardMeta || {};
  return {
    credits: Math.round(Number(reward.credits || reward.awardedCredits || 0)),
  };
}

function activitySummary(log) {
  const metrics = activityMetrics(log).slice(0, 2);
  return metrics.length
    ? metrics.map((metric) => `${metric.label} ${metric.value}`).join(" - ")
    : "Seance enregistree dans TITAN OS.";
}

function sportName(sport) {
  if (window.SPORTS_CONFIG && window.SPORTS_CONFIG[sport]?.label)
    return window.SPORTS_CONFIG[sport].label;
  return sport || "Sport libre";
}

function getActivityId(log) {
  return String(
    log.id || `${log.date || ""}_${log.sport || ""}_${log.xp || 0}`,
  );
}

function activityMonth(log) {
  const date = new Date(log.date || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function activityDate(log, withTime = false) {
  const date = new Date(log.date || Date.now());
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return date.toLocaleDateString(
    "fr-FR",
    withTime
      ? {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }
      : { day: "2-digit", month: "short", year: "numeric" },
  );
}

function formatNumber(value, digits = 1) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return number.toLocaleString("fr-FR", { maximumFractionDigits: digits });
}

function escapeText(value) {
  if (window.titanEscapeText) return window.titanEscapeText(value);
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

function escapeAttr(value) {
  return escapeText(value);
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}
