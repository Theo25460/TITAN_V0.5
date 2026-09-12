// CONFIGURATION PLANNING
const DAYS_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const DAY_LABELS = {
  monday: "Lundi",
  tuesday: "Mardi",
  wednesday: "Mercredi",
  thursday: "Jeudi",
  friday: "Vendredi",
  saturday: "Samedi",
  sunday: "Dimanche",
};

const HABITS_LIST = [
  { id: "early_wake", label: "Reveil Tot", icon: "ri-alarm-line" },
  { id: "cold_shower", label: "Douche Froide", icon: "ri-temp-cold-line" },
  { id: "clean_food", label: "Nutrition Propre", icon: "ri-leaf-line" },
  {
    id: "digital_detox",
    label: "Pas d'?cran > 22h",
    icon: "ri-smartphone-line",
  },
  { id: "reading", label: "Lecture / Etude", icon: "ri-book-read-line" },
];

let editingDay = null; // Jour en cours d'edition pour le sport

// HOOK PRINCIPAL
window.renderSports = function () {
  const urlSport = new URLSearchParams(window.location.search).get("sport");
  if (
    urlSport &&
    window.SPORTS_CONFIG &&
    window.SPORTS_CONFIG[urlSport] &&
    !hiddenKeyInput.value
  ) {
    selectSportByKey(urlSport);
  }
  renderRecoveryMonitor(); // Appel du module Elite
  renderSportFocusPanel();
  renderQuickSportSuggestions();
  renderSportSearchGuides();
  renderIntentTags();
  setDefaultSessionDateTime();
  updateNoteCounter();
};

function setDefaultSessionDateTime() {
  const now = new Date();
  const dateInput = document.getElementById("session-date");
  const timeInput = document.getElementById("session-time");
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  if (dateInput && !dateInput.value)
    dateInput.value = localDate.toISOString().slice(0, 10);
  if (timeInput && !timeInput.value)
    timeInput.value = localDate.toISOString().slice(11, 16);
  if (dateInput) dateInput.max = localDate.toISOString().slice(0, 10);
}

function renderSportFocusPanel() {
  const panel = document.getElementById("sport-focus-panel");
  if (!panel) return;
  const history = Array.isArray(window.state?.history)
    ? window.state.history
    : [];
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekLogs = history.filter(
    (log) => new Date(log.date).getTime() >= since,
  );
  const minutes = weekLogs.reduce((sum, log) => {
    const details = log.details || {};
    const val2 = parseFloat(details.val2);
    if (Number.isFinite(val2) && val2 > 0) return sum + val2;
    if (log.unit === "min") return sum + (parseFloat(log.val) || 0);
    return sum;
  }, 0);
  const sportCounts = {};
  weekLogs.forEach((log) => {
    sportCounts[log.sport] = (sportCounts[log.sport] || 0) + 1;
  });
  const topSportKey = Object.entries(sportCounts).sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0];
  const topSport =
    topSportKey && window.SPORTS_CONFIG?.[topSportKey]
      ? window.SPORTS_CONFIG[topSportKey].label
      : "Aucune dominante";
  const planned = window.titanGetTodayObjective
    ? window.titanGetTodayObjective()
    : null;
  const todayLabel = planned?.sport ? planned.label : "Libre aujourd hui";
  const athlete = window.titanBuildAthleteProfile
    ? window.titanBuildAthleteProfile(history, window.state?.user || {})
    : null;
  const coach = window.titanGetCoachRecommendation
    ? window.titanGetCoachRecommendation(history, window.state?.user || {})
    : null;
  const plateau =
    coach?.plateau ||
    (window.titanDetectPlateau ? window.titanDetectPlateau(history) : null);
  const self =
    coach?.selfCompetition ||
    (window.titanBuildSelfCompetition
      ? window.titanBuildSelfCompetition(history)
      : null);
  const cooldown =
    coach?.cooldown ||
    (window.titanBuildCooldownGuide
      ? window.titanBuildCooldownGuide(null, history)
      : null);
  const catalogCount = Object.keys(window.SPORTS_CONFIG || {}).length;

  panel.innerHTML = `
                <div class="sport-focus-head">
                    <div>
                        <div class="sport-focus-kicker">Tableau d'effort</div>
                        <div class="sport-focus-title">${weekLogs.length ? "Semaine active" : "Premiere trace a poser"}</div>
                        <div class="sport-focus-sub">${escapeUi(coach?.nextCap || (weekLogs.length ? "Priorite aux vraies mesures: duree, distance, volume, sensations." : "Commence par une seance simple. Le reste de TITAN se nourrit de ton journal sportif."))}</div>
                    </div>
                    <div class="session-step-badge"><i class="ri-calendar-check-line"></i> ${escapeUi(todayLabel)}</div>
                </div>
                <div class="sport-focus-grid">
                    <div class="sport-focus-stat"><div class="sport-focus-value">${weekLogs.length}</div><div class="sport-focus-label">seances 7j</div></div>
                    <div class="sport-focus-stat"><div class="sport-focus-value">${Math.round(minutes)}</div><div class="sport-focus-label">minutes notees</div></div>
                    <div class="sport-focus-stat"><div class="sport-focus-value">${escapeUi(topSport)}</div><div class="sport-focus-label">discipline</div></div>
                    <div class="sport-focus-stat"><div class="sport-focus-value">${escapeUi(athlete?.label || "Calibration")}</div><div class="sport-focus-label">profil</div></div>
                </div>
                <div class="sport-readout-row">
                    <div class="sport-readout-chip"><strong>Comparaison</strong>${escapeUi(self?.detail || "Deux traces comparables feront apparaitre une tendance.")}</div>
                    <div class="sport-readout-chip"><strong>Plateau</strong>${escapeUi(plateau?.status === "watch" ? plateau.action : plateau?.detail || "Pas de signal critique.")}</div>
                    <div class="sport-readout-chip"><strong>Retour au calme</strong>${escapeUi(cooldown ? `${cooldown.label} // ${cooldown.duration} min` : "Routine calculee apres une trace.")}</div>
                    <div class="sport-readout-chip"><strong>Catalogue sport</strong>${catalogCount} disciplines disponibles, avec leurs mesures utiles.</div>
                </div>`;
}

function switchView(viewName, tabEl) {
  document
    .querySelectorAll(".view-section")
    .forEach((el) => (el.style.display = "none"));
  document.getElementById("view-" + viewName).style.display = "block";
  document
    .querySelectorAll(".nav-tab")
    .forEach((el) => el.classList.remove("active"));
  if (tabEl) tabEl.classList.add("active");

  if (viewName === "history") renderTrainingHistory();
  if (viewName === "planning") renderPlanning();
}

const searchInput = document.getElementById("sport-search");
const suggestionsDiv = document.getElementById("suggestions-box");
const hiddenKeyInput = document.getElementById("sport-key");
const coreFields = document.getElementById("core-fields");
const analysisModule = document.getElementById("analysis-module");
const outdoorModule = document.getElementById("outdoor-module");
const terrainGrid = document.getElementById("terrain-grid");
const extraContainer = document.getElementById("extra-fields-container");

let gymSession = [];
let tempGpxData = null;
let mapInstance = null;
let histMapInstance = null;
let selectedTags = [];
let activeSportSelectorFamily = "all";
let activeSuggestionIndex = -1;
let currentSuggestionEntries = [];
const SPORT_FAMILY_FILTERS = [
  { id: "all", label: "Tous", query: "" },
  {
    id: "endurance",
    label: "Endurance",
    query: "course velo marche nage trail",
  },
  { id: "force", label: "Force", query: "muscu force haltero calisthenics" },
  { id: "combat", label: "Combat", query: "combat boxe judo lutte karate mma" },
  {
    id: "team",
    label: "Equipe",
    query: "football rugby basket volley handball hockey",
  },
  {
    id: "racket",
    label: "Raquette",
    query: "tennis padel badminton squash ping pong",
  },
  {
    id: "water",
    label: "Eau",
    query: "natation kayak surf voile plongee paddle",
  },
  {
    id: "glide",
    label: "Glisse",
    query: "ski snowboard roller skate patinage",
  },
  {
    id: "precision",
    label: "Precision",
    query: "tir arc golf bowling flechettes petanque",
  },
  {
    id: "mobility",
    label: "Mobilite",
    query: "yoga pilates stretching tai chi mobilite",
  },
];
const SPORT_CATEGORY_LABELS = {
  cardio: "Cardio",
  endurance: "Endurance",
  force: "Force",
  muscu: "Muscu",
  combat: "Combat",
  team: "Equipe",
  outdoor: "Outdoor",
  skill: "Technique",
  mixed: "Multisport",
  mobility: "Mobilite",
  crossfit: "Conditioning",
  zen: "Mobilite",
};
const SPORT_PROFILE_SEARCH_TERMS = {
  endurance: [
    "running",
    "trail",
    "hiking",
    "cycling",
    "swimming",
    "water",
    "glide",
    "outdoor",
  ],
  force: ["strength", "calisthenics", "strength_max"],
  combat: ["combat", "combat_grappling", "combat_striking", "combat_weapon"],
  team: ["team", "football", "rugby", "contact_team", "hockey_team"],
  racket: ["racket"],
  water: ["water", "water_skill", "swimming", "swimming_pool"],
  glide: ["glide", "cycling"],
  precision: ["precision", "score_precision"],
  mobility: ["mobility", "mindbody", "dance"],
};

function renderQuickSportSuggestions() {
  const panel = document.getElementById("quick-sport-panel");
  if (!panel || !window.SPORTS_CONFIG) return;
  const favs = window.titanGetFavoriteSports
    ? window.titanGetFavoriteSports(3)
    : [];
  const today = window.titanGetTodayObjective
    ? window.titanGetTodayObjective()
    : null;
  const items = [];
  if (today && today.sport)
    items.push({
      sport: today.sport,
      label: today.label,
      icon: "ri-calendar-check-line",
      sub: today.planned ? "objectif du jour" : "suggestion",
    });
  getRecentSportKeys().forEach((key) => {
    const recent = window.SPORTS_CONFIG[key];
    if (recent && !items.find((item) => item.sport === key)) {
      items.push({
        sport: key,
        label: recent.label,
        icon: recent.icon,
        sub: "Choisi récemment",
      });
    }
  });
  favs.forEach((f) => {
    if (!items.find((item) => item.sport === f.sport))
      items.push({
        sport: f.sport,
        label: f.label,
        icon: f.icon,
        sub: `${f.count} séances`,
      });
  });
  if (items.length < 4) {
    [
      "running",
      "muscu_builder",
      "cycling_road",
      "swimming",
      "football",
      "yoga",
    ].forEach((key) => {
      const val = window.SPORTS_CONFIG[key];
      if (val && !items.find((item) => item.sport === key)) {
        items.push({
          sport: key,
          label: val.label,
          icon: val.icon || "ri-flashlight-line",
          sub: "Saisie rapide",
        });
      }
    });
    if (items.length === 0) {
      getSportEntries()
        .slice(0, 4)
        .forEach((entry) =>
          items.push({
            sport: entry.key,
            label: entry.conf.label,
            icon: entry.conf.icon || "ri-flashlight-line",
            sub: sportMetaLine(entry.key, entry.conf),
          }),
        );
    }
  }
  panel.innerHTML = items
    .slice(0, 4)
    .map(
      (item) => `
                <button type="button" class="quick-sport-btn" onclick="selectSportByKey('${escapeUi(item.sport)}')">
                    <i class="${safeIconClass(item.icon || "ri-flashlight-line")}" style="color:var(--primary);"></i>
                    <div>${escapeUi(item.label.replace(" (Builder)", "").replace(" (Route)", "").replace(" (Piscine)", ""))}<span>${escapeUi(item.sub)}</span></div>
                </button>`,
    )
    .join("");
}

function renderSportSearchGuides() {
  const target = document.getElementById("sport-search-guides");
  if (!target) return;
  target.innerHTML = SPORT_FAMILY_FILTERS.filter((f) => f.id !== "all")
    .map(
      (filter) => `
                <button type="button" class="sport-search-chip" onclick="applySportSearchPreset('${filter.id}')">${escapeUi(filter.label)}</button>
            `,
    )
    .join("");
}

function applySportSearchPreset(filterId) {
  const filter = SPORT_FAMILY_FILTERS.find((item) => item.id === filterId);
  if (!filter) return;
  searchInput.value = filter.query.split(" ")[0] || filter.label;
  searchInput.focus();
  searchInput.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderIntentTags() {
  const target = document.getElementById("intent-tags");
  if (!target || !window.TITAN_SESSION_TAGS) return;
  target.innerHTML = Object.entries(window.TITAN_SESSION_TAGS)
    .map(
      ([id, tag]) => `
                <button type="button" class="intent-chip ${selectedTags.includes(id) ? "active" : ""}" onclick="toggleIntentTag('${id}')">
                    <i class="${tag.icon}"></i> ${tag.label}
                </button>`,
    )
    .join("");
}

function toggleIntentTag(id) {
  if (selectedTags.includes(id))
    selectedTags = selectedTags.filter((tag) => tag !== id);
  else if (selectedTags.length < 3) selectedTags.push(id);
  else if (window.showToast)
    window.showToast("Maximum 3 intentions par seance.", "warning");
  renderIntentTags();
}

function updateNoteCounter() {
  const note = document.getElementById("session-note");
  const counter = document.getElementById("note-counter");
  if (!note || !counter) return;
  const limit = window.titanNotesLimit
    ? window.titanNotesLimit(window.state?.user)
    : 180;
  note.maxLength = limit;
  counter.innerText = `${note.value.length} / ${limit}`;
  counter.style.color =
    note.value.length >= limit ? "var(--warning)" : "#64748b";
}

function clearSportSelectionPreview() {
  hiddenKeyInput.value = "";
  coreFields.innerHTML = `<div style="color:#94a3b8; font-style:italic; font-size:0.9rem;"><i class="ri-arrow-up-line"></i> Choisis une discipline pour afficher les champs utiles.</div>`;
  extraContainer.replaceChildren();
  analysisModule.style.display = "none";
  outdoorModule.style.display = "none";
  const plannedMatch = document.getElementById("planning-match-msg");
  if (plannedMatch) plannedMatch.style.display = "none";
  const terrain = document.getElementById("selected-terrain");
  if (terrain) terrain.value = "";
  gymSession = [];
}

// AUTOCOMPLETE SPORT
searchInput.addEventListener("input", (e) => {
  const query = normalizeSearchText(e.target.value);
  const previousKey = hiddenKeyInput.value;
  const selected = window.SPORTS_CONFIG?.[previousKey];
  if (!selected || normalizeSearchText(selected.label) !== query) {
    if (previousKey) clearSportSelectionPreview();
    else hiddenKeyInput.value = "";
  }
  suggestionsDiv.innerHTML = "";
  activeSuggestionIndex = -1;
  currentSuggestionEntries = [];
  if (query.length < 1 || !window.SPORTS_CONFIG) {
    suggestionsDiv.classList.remove("show");
    searchInput.setAttribute("aria-expanded", "false");
    return;
  }

  const matches = getSportEntries()
    .map((entry) =>
      Object.assign(entry, { score: sportSearchScore(entry, query) }),
    )
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        String(a.conf.label || "").localeCompare(String(b.conf.label || "")),
    );

  if (matches.length > 0) {
    suggestionsDiv.classList.add("show");
    searchInput.setAttribute("aria-expanded", "true");
    currentSuggestionEntries = matches.slice(0, 36);
    currentSuggestionEntries.forEach((entry, index) => {
      const item = document.createElement("div");
      item.className = "suggestion-item";
      item.id = `sport-suggestion-${index}`;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", "false");
      item.innerHTML = renderSportSuggestion(entry.key, entry.conf);
      item.onclick = () => selectSportByKey(entry.key);
      suggestionsDiv.appendChild(item);
    });
  } else {
    suggestionsDiv.classList.add("show");
    searchInput.setAttribute("aria-expanded", "true");
    suggestionsDiv.innerHTML = `<div class="suggestion-item" style="cursor:default;" role="status"><i class="ri-search-eye-line" style="color:#64748b"></i><div class="suggestion-main"><div class="suggestion-title">Aucun sport trouve</div><div class="suggestion-meta">Essaie une famille: combat, raquette, eau, force, equipe, precision.</div></div></div>`;
  }
});

searchInput.addEventListener("keydown", (event) => {
  if (
    !suggestionsDiv.classList.contains("show") ||
    !currentSuggestionEntries.length
  ) {
    if (event.key === "Escape") suggestionsDiv.classList.remove("show");
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    activeSuggestionIndex =
      (activeSuggestionIndex + delta + currentSuggestionEntries.length) %
      currentSuggestionEntries.length;
    suggestionsDiv
      .querySelectorAll('[role="option"]')
      .forEach((item, index) => {
        const selected = index === activeSuggestionIndex;
        item.setAttribute("aria-selected", selected ? "true" : "false");
        if (selected) {
          searchInput.setAttribute("aria-activedescendant", item.id);
          item.scrollIntoView({ block: "nearest" });
        }
      });
  }
  if (event.key === "Enter" && activeSuggestionIndex >= 0) {
    event.preventDefault();
    selectSportByKey(currentSuggestionEntries[activeSuggestionIndex].key);
  }
  if (event.key === "Escape") {
    suggestionsDiv.classList.remove("show");
    searchInput.setAttribute("aria-expanded", "false");
    searchInput.removeAttribute("aria-activedescendant");
  }
});

document.addEventListener("click", (e) => {
  if (!searchInput.contains(e.target) && !suggestionsDiv.contains(e.target)) {
    suggestionsDiv.classList.remove("show");
    searchInput.setAttribute("aria-expanded", "false");
  }
});

function getRecentSportKeys() {
  try {
    const parsed = JSON.parse(
      localStorage.getItem("titan_recent_sports_v1") || "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter((key) => typeof key === "string").slice(0, 5)
      : [];
  } catch (error) {
    return [];
  }
}

function rememberSportKey(sportKey) {
  const recent = [
    sportKey,
    ...getRecentSportKeys().filter((key) => key !== sportKey),
  ].slice(0, 5);
  localStorage.setItem("titan_recent_sports_v1", JSON.stringify(recent));
}

function selectSportByKey(sportKey) {
  const sport = window.SPORTS_CONFIG ? window.SPORTS_CONFIG[sportKey] : null;
  if (!sport) return;
  searchInput.value = sport.label;
  hiddenKeyInput.value = sportKey;
  suggestionsDiv.classList.remove("show");
  searchInput.setAttribute("aria-expanded", "false");
  searchInput.removeAttribute("aria-activedescendant");
  activeSuggestionIndex = -1;
  currentSuggestionEntries = [];
  rememberSportKey(sportKey);
  generateForm(sportKey);
  checkPlanningMatch(sportKey);
  renderQuickSportSuggestions();
}

// --- MODULE ELITE : RECOVERY MONITOR (FEATURE 1) ---
function renderRecoveryMonitor() {
  const container = document.getElementById("recovery-module-container");
  if (!container) return;
  const recent = (window.state?.history || []).filter(
    (log) =>
      !log.archived_at &&
      Date.now() - new Date(log.date) >= 0 &&
      Date.now() - new Date(log.date) < 48 * 3600000,
  );
  const measured = recent
    .map((log) => window.TitanTraining.load(log))
    .filter((value) => value !== null);
  container.innerHTML = `<section class="tracking-panel"><h2>Ton ressenti, tes mesures</h2><p>${measured.length ? `Charge déclarée sur 48 h : <strong>${Math.round(measured.reduce((a, b) => a + b, 0))}</strong> (minutes × effort ressenti), sur ${measured.length}/${recent.length} séances renseignées.` : "Renseigne la durée et ton effort ressenti pour suivre la charge de tes séances."}</p><p class="tracking-status">Cet indicateur décrit ton entraînement. Il ne mesure pas ta récupération physique.</p></section>`;
}

// --- GESTION DU PLANNING ---

function getTodayKey() {
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return days[new Date().getDay()];
}

function checkPlanningMatch(selectedSportKey) {
  const today = getTodayKey();
  const schedule = window.state.user.schedule || {};
  const planned = schedule[today]?.sport;

  const msgEl = document.getElementById("planning-match-msg");

  if (planned && planned === selectedSportKey) {
    msgEl.style.display = "flex";
    msgEl.innerHTML = `<i class="ri-check-double-line"></i> Ta séance prévue aujourd’hui.`;
  } else {
    msgEl.style.display = "none";
  }
}

function renderPlanning() {
  if (!window.state.user.schedule) window.state.user.schedule = {};
  const container = document.getElementById("planning-container");
  container.innerHTML = "";

  const todayKey = getTodayKey();
  let totalXpGained = 0;

  DAYS_ORDER.forEach((day) => {
    const isToday = day === todayKey;
    const dayData = window.state.user.schedule[day] || {
      sport: null,
      habits: {},
    };

    // Calcul XP Planning
    if (dayData.habits) {
      Object.values(dayData.habits).forEach((val) => {
        if (val) totalXpGained += 5;
      });
    }

    // Affichage Sport Planifie
    let sportHtml = `<div class="planned-sport" onclick="openSportSelector('${day}')"><div class="planned-sport-content"><i class="ri-add-line"></i> Definir Sport</div></div>`;
    if (
      dayData.sport &&
      window.SPORTS_CONFIG &&
      window.SPORTS_CONFIG[dayData.sport]
    ) {
      const s = window.SPORTS_CONFIG[dayData.sport];
      sportHtml = `<div class="planned-sport set" onclick="openSportSelector('${day}')">
                        <div class="planned-sport-content"><i class="${s.icon}"></i> ${s.label}</div>
                        <div style="font-size:0.65rem; color:var(--success); margin-top:2px;">CIBLE</div>
                    </div>`;
    }

    // Affichage Habitudes
    let habitsHtml = "";
    HABITS_LIST.forEach((h) => {
      const isDone = dayData.habits && dayData.habits[h.id];
      habitsHtml += `
                        <div class="habit-chip ${isDone ? "done" : ""}" onclick="toggleHabit('${day}', '${h.id}')">
                            <i class="${h.icon}"></i> ${h.label}
                        </div>
                    `;
    });

    container.innerHTML += `
                    <div class="day-card ${isToday ? "today" : ""}">
                        <div class="day-header">
                            <div class="day-name">${DAY_LABELS[day]}</div>
                            ${isToday ? '<div class="day-badge badge-today">AUJOURD\'HUI</div>' : ""}
                        </div>
                        ${sportHtml}
                        <div class="habits-list">${habitsHtml}</div>
                    </div>
                `;
  });

  document.getElementById("planning-xp-total").innerText =
    totalXpGained + " XP";
  renderSessionCalendar();
}

function renderSessionCalendar() {
  const target = document.getElementById("session-calendar");
  if (!target) return;
  const today = new Date();
  const day = today.getDay() || 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - day + 1);
  const history = window.state.history || [];
  target.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const sameDay = history.some((log) => {
      const ld = new Date(log.date);
      return (
        ld.getFullYear() === d.getFullYear() &&
        ld.getMonth() === d.getMonth() &&
        ld.getDate() === d.getDate()
      );
    });
    const isToday = d.toDateString() === today.toDateString();
    target.innerHTML += `<div class="calendar-cell ${sameDay ? "done" : ""} ${isToday ? "today" : ""}">
                    <div class="calendar-day">${d.toLocaleDateString("fr-FR", { weekday: "short" })}</div>
                    <div style="display:flex; justify-content:space-between; align-items:center;"><span style="font-size:0.7rem; color:#94a3b8;">${d.getDate()}</span><span class="calendar-dot"></span></div>
                </div>`;
  }
}

function toggleHabit(day, habitId) {
  // Initialisation si vide
  if (!window.state.user.schedule) window.state.user.schedule = {};
  if (!window.state.user.schedule[day])
    window.state.user.schedule[day] = { habits: {} };
  if (!window.state.user.schedule[day].habits)
    window.state.user.schedule[day].habits = {};

  const current = window.state.user.schedule[day].habits[habitId] || false;

  // Toggle
  window.state.user.schedule[day].habits[habitId] = !current;

  // Recompense immediate
  if (!current) {
    // On vient de cocher -> Gain XP
    window.state.user.xp = (window.state.user.xp || 0) + 5;
    if (window.showToast)
      window.showToast(`Habitude validee (+5 XP)`, "success");
  } else {
    // On decoche -> Retrait XP (pour eviter le spam clic)
    window.state.user.xp = Math.max(0, (window.state.user.xp || 0) - 5);
  }

  window.saveState();
  renderPlanning();
  if (typeof updateGlobalUI === "function") updateGlobalUI();
}

// --- SELECTEUR DE SPORT (MODAL) ---
function openSportSelector(day) {
  editingDay = day;
  activeSportSelectorFamily = "all";
  renderSportSelectorFilters();
  renderSportSelectorList("");
  document.getElementById("sport-selector-modal").style.display = "flex";
  document.getElementById("selector-search").value = "";
  document.getElementById("selector-search").focus();
}

function filterSportSelector(query) {
  renderSportSelectorList(query);
}

function renderSportSelectorFilters() {
  const filters = document.getElementById("sport-selector-filters");
  if (!filters) return;
  filters.innerHTML = SPORT_FAMILY_FILTERS.map(
    (filter) => `
                <button type="button" class="sport-selector-filter ${activeSportSelectorFamily === filter.id ? "active" : ""}" onclick="setSportSelectorFamily('${filter.id}')">${escapeUi(filter.label)}</button>
            `,
  ).join("");
}

function setSportSelectorFamily(familyId) {
  activeSportSelectorFamily = SPORT_FAMILY_FILTERS.some(
    (filter) => filter.id === familyId,
  )
    ? familyId
    : "all";
  renderSportSelectorFilters();
  renderSportSelectorList(
    document.getElementById("selector-search")?.value || "",
  );
}

function renderSportSelectorList(query) {
  const list = document.getElementById("sport-selector-list");
  if (!list || !window.SPORTS_CONFIG) return;
  const q = normalizeSearchText(query);
  const entries = getSportEntries()
    .filter((entry) => sportFamilyMatches(entry, activeSportSelectorFamily))
    .map((entry) =>
      Object.assign(entry, { score: q ? sportSearchScore(entry, q) : 1 }),
    )
    .filter((entry) => !q || entry.score > 0)
    .sort(
      (a, b) =>
        (q ? b.score - a.score : 0) ||
        String(a.conf.label || "").localeCompare(String(b.conf.label || "")),
    );

  if (!entries.length) {
    list.innerHTML = `<div class="sport-opt" style="cursor:default;"><i class="ri-search-eye-line" style="color:#64748b"></i><div class="sport-opt-main"><div class="sport-opt-label">Aucun sport</div><div class="sport-opt-meta">Change de filtre ou cherche par alias.</div></div></div>`;
    return;
  }

  list.innerHTML = entries
    .slice(0, 90)
    .map(
      (entry) => `
                <div class="sport-opt" onclick="setDaySport('${escapeUi(entry.key)}')">
                    ${renderSportOption(entry.key, entry.conf)}
                </div>
            `,
    )
    .join("");
}

function setDaySport(sportKey) {
  if (!editingDay) return;
  if (!window.state.user.schedule) window.state.user.schedule = {};
  if (!window.state.user.schedule[editingDay])
    window.state.user.schedule[editingDay] = { habits: {} };

  window.state.user.schedule[editingDay].sport = sportKey;
  window.saveState();

  closeSportSelector();
  renderPlanning();
}

function closeSportSelector() {
  document.getElementById("sport-selector-modal").style.display = "none";
  editingDay = null;
}

// --- FIN LOGIQUE PLANNING ---

function escapeUi(value) {
  const escaper = window.titanEscapeHtml || window.titanEscapeHTML;
  return escaper
    ? escaper(value)
    : String(value || "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
}

function safeIconClass(value, fallback = "ri-checkbox-blank-circle-line") {
  const icon = String(value || "").trim();
  return /^ri-[a-z0-9-]+$/i.test(icon) ? icon : fallback;
}

function sportPrograms(conf) {
  const programs = conf?.trackingSummary?.programs;
  return Array.isArray(programs) ? programs.map(String) : [];
}

function isOlympicSport(conf) {
  return sportPrograms(conf).some(
    (program) => program.indexOf("olympic_") === 0,
  );
}

function olympicBadge() {
  return "";
}

function normalizeSearchText(value) {
  return window.titanNormalizeSportSearch
    ? window.titanNormalizeSportSearch(value)
    : String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function sportSearchText(conf, key = "") {
  if (window.titanSportSearchText)
    return window.titanSportSearchText(conf, key);
  const summary = conf?.trackingSummary || {};
  const bits = [
    key,
    conf?.label,
    conf?.cat,
    conf?.balanceProfile,
    conf?.formType,
    summary.officialLabel,
    summary.disciplineGroup,
    summary.environment,
    summary.intensity,
    summary.catalogTier,
  ];
  if (Array.isArray(summary.aliases)) bits.push(...summary.aliases);
  if (Array.isArray(summary.programs)) bits.push(...summary.programs);
  if (Array.isArray(summary.graphs)) bits.push(...summary.graphs);
  if (Array.isArray(summary.searchTokens)) bits.push(...summary.searchTokens);
  if (summary.headline) bits.push(summary.headline);
  return normalizeSearchText(bits.filter(Boolean).join(" "));
}

function sportCategoryLabel(conf) {
  if (window.titanSportCategoryLabel)
    return window.titanSportCategoryLabel(conf);
  const cat = String(conf?.cat || "").toLowerCase();
  if (SPORT_CATEGORY_LABELS[cat]) return SPORT_CATEGORY_LABELS[cat];
  const profile = String(conf?.balanceProfile || "").replace(/_/g, " ");
  return profile ? profile.charAt(0).toUpperCase() + profile.slice(1) : "Sport";
}

function sportMetaLine(key, conf) {
  const summary = conf?.trackingSummary || {};
  const unit = conf?.unit ? `Base ${conf.unit}` : "Base libre";
  const group = summary.disciplineGroup || sportCategoryLabel(conf);
  const gps = String(conf?.formType || "").includes("gps") ? "GPX" : "manuel";
  return `${sportCategoryLabel(conf)} // ${group} // ${unit} // ${gps}`;
}

function getSportEntries() {
  if (window.titanSportEntriesFromConfig)
    return window.titanSportEntriesFromConfig(window.SPORTS_CONFIG || {});
  const blocked = new Set(window.TITAN_NON_SPORT_CATALOG_IDS || []);
  return Object.entries(window.SPORTS_CONFIG || {})
    .filter(([key, conf]) => conf && !blocked.has(key) && conf.label)
    .map(([key, conf]) => ({ key, conf, search: sportSearchText(conf, key) }));
}

function sportSearchScore(entry, query) {
  if (window.titanSportSearchScore)
    return window.titanSportSearchScore(entry, query);
  const q = normalizeSearchText(query);
  if (!q) return 1;
  const label = normalizeSearchText(entry.conf?.label || "");
  const aliases = Array.isArray(entry.conf?.trackingSummary?.aliases)
    ? entry.conf.trackingSummary.aliases.map(normalizeSearchText)
    : [];
  if (label === q || entry.key === q) return 120;
  if (label.startsWith(q)) return 90;
  if (aliases.some((alias) => alias === q || alias.startsWith(q))) return 82;
  const words = entry.search.split(/\s+/).filter(Boolean);
  if (words.some((word) => word === q)) return 72;
  if (words.some((word) => word.startsWith(q))) return 58;
  if (entry.search.includes(q)) return 34;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (
    tokens.length > 1 &&
    tokens.every((token) => entry.search.includes(token))
  )
    return 48;
  return 0;
}

function sportFamilyMatches(entry, familyId) {
  if (window.titanSportFamilyMatches)
    return window.titanSportFamilyMatches(entry, familyId);
  if (!familyId || familyId === "all") return true;
  const terms = SPORT_PROFILE_SEARCH_TERMS[familyId] || [];
  if (!terms.length) return true;
  const haystack = sportSearchText(entry.conf, entry.key);
  return terms.some((term) => haystack.includes(normalizeSearchText(term)));
}

function renderSportSuggestion(key, conf) {
  return `<i class="${safeIconClass(conf.icon)}" style="color:var(--primary); margin-top:2px;"></i>
                <div class="suggestion-main">
                    <div class="suggestion-title"><strong>${escapeUi(conf.label)}</strong>${olympicBadge(conf)}</div>
                    <div class="suggestion-meta">${escapeUi(sportMetaLine(key, conf))}</div>
                </div>`;
}

function renderSportOption(key, conf) {
  return `<i class="${safeIconClass(conf.icon)}" style="color:var(--primary); margin-top:2px;"></i>
                <div class="sport-opt-main">
                    <div class="sport-opt-label"><strong>${escapeUi(conf.label)}</strong>${olympicBadge(conf)}</div>
                    <div class="sport-opt-meta">${escapeUi(sportMetaLine(key, conf))}</div>
                </div>`;
}

function normalizedExtraFields(conf) {
  if (/climbing|escalade/i.test(`${conf.balanceProfile} ${conf.label}`))
    return [
      {
        id: "climbing_discipline",
        label: "Pratique",
        type: "select",
        options: ["Bloc", "Voie"],
      },
      {
        id: "belay",
        label: "Assurage (voie)",
        type: "select",
        options: ["Tête", "Moulinette", "Auto-assurage"],
      },
      {
        id: "location",
        label: "Lieu",
        type: "select",
        options: ["Salle", "Extérieur"],
      },
      {
        id: "grade_system",
        label: "Système de cotation",
        type: "select",
        options: ["Français voie", "Fontainebleau bloc", "V-scale bloc"],
      },
      {
        id: "max_attempt",
        label: "Cotation tentée",
        type: "text",
        placeholder: "Ex. 6a / 6A / V3",
      },
      {
        id: "max_done",
        label: "Cotation réussie",
        type: "text",
        placeholder: "Ex. 5c / 5C / V2",
      },
      { id: "attempts", label: "Essais", type: "number", min: 0, max: 200 },
      {
        id: "successful_routes",
        label: "Blocs ou voies réussis",
        type: "number",
        min: 0,
        max: 200,
      },
    ];
  if (!conf) return [];
  if (window.titanNormalizeExtraFields)
    return window.titanNormalizeExtraFields(conf.extraFields || []);
  return Array.isArray(conf.extraFields) ? conf.extraFields : [];
}

function currentExtraValues() {
  const values = {};
  document.querySelectorAll("[data-extra-field]").forEach((el) => {
    values[el.dataset.extraField] =
      el.type === "checkbox" ? el.checked : el.value;
  });
  return values;
}

function updateExtraFieldVisibility() {
  const values = currentExtraValues();
  document.querySelectorAll("[data-extra-wrap]").forEach((wrap) => {
    let field = {};
    try {
      field = JSON.parse(wrap.dataset.field || "{}");
    } catch (e) {
      field = {};
    }
    const visible = window.titanExtraFieldIsVisible
      ? window.titanExtraFieldIsVisible(field, values)
      : true;
    wrap.style.display = visible ? "block" : "none";
    const input = wrap.querySelector("[data-extra-field]");
    if (!visible && input) {
      if (input.type === "checkbox") input.checked = false;
      else input.value = "";
    }
  });
}

function buildExtraInput(field) {
  const id = escapeUi(field.id);
  const label = escapeUi(field.label || field.id);
  const min =
    field.min !== null && field.min !== undefined
      ? ` min="${escapeUi(field.min)}"`
      : "";
  const max =
    field.max !== null && field.max !== undefined
      ? ` max="${escapeUi(field.max)}"`
      : "";
  const step = field.step
    ? ` step="${escapeUi(field.step)}"`
    : field.type === "number"
      ? ' step="1"'
      : "";
  const placeholder = field.placeholder
    ? ` placeholder="${escapeUi(field.placeholder)}"`
    : "";
  const eliteBadge = field.eliteOnly
    ? ` <span style="color:#9ee7ff; font-size:0.66rem;">ELITE</span>`
    : "";
  let inputHtml = "";

  if (field.type === "select") {
    const options =
      `<option value="">Choisir...</option>` +
      (field.options || [])
        .map((o) => `<option value="${escapeUi(o)}">${escapeUi(o)}</option>`)
        .join("");
    inputHtml = `<select id="extra-${id}" data-extra-field="${id}" class="input-tech" style="padding:12px;" onchange="updateExtraFieldVisibility(); updateRewardPreview();">${options}</select>`;
  } else if (field.type === "checkbox") {
    inputHtml = `<label style="display:flex; align-items:center; gap:8px; color:#cbd5e1; font-size:0.85rem;"><input type="checkbox" id="extra-${id}" data-extra-field="${id}" onchange="updateExtraFieldVisibility(); updateRewardPreview();"> Oui</label>`;
  } else {
    const type = field.type === "number" ? "number" : "text";
    inputHtml = `<input type="${type}" id="extra-${id}" data-extra-field="${id}" class="input-tech" ${placeholder}${min}${max}${step} style="padding:12px;" oninput="updateExtraFieldVisibility(); updateRewardPreview();">`;
  }

  return `<div class="form-group" data-extra-wrap="${id}" data-field="${escapeUi(JSON.stringify(field))}" style="margin-bottom:10px;"><label class="form-label" for="extra-${id}">${label}${field.unit ? ` (${escapeUi(field.unit)})` : ""}${eliteBadge}</label>${inputHtml}</div>`;
}

const SPORT_PROFILE_LABELS = {
  football: "Sports collectifs avec poste et actions decisives",
  cycling: "Distance, duree, denivele, puissance et cadence",
  running: "Allure, duree, intervalles, surface et intensite",
  trail: "Distance, D+ reel, technicite et ravitaillement",
  hiking: "Temps long, D+, sac, navigation et terrain",
  swimming: "Distance, nage, bassin, educatifs et rythme",
  racket: "Sets, points directs, echanges et resultat",
  team: "Role, score, actions offensives et defensives",
  combat: "Rounds, sparring, frappes propres et controle",
  strength: "Volume utile, top set, echec et preparation",
  climbing: "Bloc, voie, essais, niveau tente et niveau reussi",
  mixed: "Format, rounds, mouvements et score",
  mobility: "Duree, zone cible, respiration et douleur",
  water: "Conditions, autonomie et technique",
  glide: "Descentes, surface, figures et chutes",
  skill: "Sequences, precision, routine et mobilite",
  precision: "Tentatives, reussites et precision",
  outdoor: "Trace GPS, temps utile, D+ et terrain",
  generic: "Volume, duree, ressentis et donnees specifiques",
};

function sportIdentityHtml(key, conf) {
  const profile = conf.balanceProfile || "generic";
  const unitLabel =
    conf.unit === "km"
      ? "distance"
      : conf.unit === "kg"
        ? "volume"
        : conf.unit === "min"
          ? "duree"
          : "volume";
  const trackingLine =
    conf.trackingSummary?.headline ||
    SPORT_PROFILE_LABELS[profile] ||
    SPORT_PROFILE_LABELS.generic;
  return `
                <div class="sport-identity-panel">
                    <div class="sport-identity-card">
                        <strong>${escapeUi(profile.toUpperCase())}</strong>
                        <span>${escapeUi(trackingLine)}</span>
                    </div>
                    <div class="sport-identity-card">
                        <strong>${escapeUi(unitLabel)} + ressenti</strong>
                        <span>Commence par la mesure principale. Les détails restent facultatifs.</span>
                    </div>
                </div>
                <details class="reward-preview-details">
                    <summary>Progression TITAN estimée</summary>
                    <div class="reward-preview-box" id="reward-preview">
                        <div><span>XP</span><strong id="reward-preview-xp">--</strong></div>
                        <div><span>Crédits</span><strong id="reward-preview-credits">--</strong></div>
                        <div><span>Limite</span><strong id="reward-preview-cap">Semaine</strong></div>
                    </div>
                </details>`;
}

function collectCurrentMetrics() {
  const key = hiddenKeyInput.value;
  const conf = window.SPORTS_CONFIG?.[key];
  if (!key || !conf) return null;
  const val1Input = document.getElementById("val-1");
  const val2Input = document.getElementById("val-2");
  const elevationInput = document.getElementById("val-elev");
  const metrics = {
    val1: val1Input
      ? parseFloat(String(val1Input.value || "").replace(",", ".")) || 0
      : 0,
    val2:
      val2Input && val2Input.value !== ""
        ? parseFloat(String(val2Input.value || "").replace(",", ".")) || 0
        : null,
    elevation:
      elevationInput && elevationInput.value !== ""
        ? parseFloat(String(elevationInput.value || "").replace(",", ".")) || 0
        : 0,
    exercises: gymSession,
    bio: {
      rpe: document.getElementById("bio-rpe")?.value || 5,
      sleep: document.getElementById("bio-sleep")?.value || 3,
      nutrition: document.getElementById("bio-nutri")?.value || 3,
    },
    tags: selectedTags.slice(0, 3),
    extras: currentExtraValues(),
  };
  const terrainVal = document.getElementById("selected-terrain")?.value;
  if (terrainVal) metrics.extras.terrain = terrainVal;
  if (tempGpxData) {
    metrics.hasGpx = true;
    metrics.gpxPath = tempGpxData.path;
    metrics.gpxStats = tempGpxData.stats;
  }
  return { key, conf, metrics };
}

function updateRewardPreview() {
  const xpNode = document.getElementById("reward-preview-xp");
  const creditsNode = document.getElementById("reward-preview-credits");
  const capNode = document.getElementById("reward-preview-cap");
  if (!xpNode || !creditsNode || !capNode) return;
  const current = collectCurrentMetrics();
  if (!current) return;
  const { key, conf, metrics } = current;
  const weightedVolume = Array.isArray(metrics.exercises)
    ? metrics.exercises.reduce(
        (acc, ex) =>
          acc +
          (Number(ex.volume || 0) ||
            Number(ex.weight || 0) *
              Number(ex.sets || 0) *
              Number(ex.reps || 0)),
        0,
      )
    : 0;
  const bodyweightVolume = Array.isArray(metrics.exercises)
    ? metrics.exercises.reduce(
        (acc, ex) =>
          acc +
          (Number(ex.totalReps || 0) ||
            Number(ex.sets || 0) * Number(ex.reps || 0)),
        0,
      )
    : 0;
  const numericValue =
    metrics.val1 || (weightedVolume > 0 ? weightedVolume : bodyweightVolume);
  const eliteCapMult = 1;
  const capLabel = `${Math.round((window.TITAN_ECONOMY?.weeklyXpCap || 9600) * eliteCapMult)} XP / ${Math.round((window.TITAN_ECONOMY?.weeklyCreditCap || 1800) * eliteCapMult)} CR`;
  if (!numericValue || numericValue <= 0) {
    xpNode.textContent = "--";
    creditsNode.textContent = "--";
    capNode.textContent = capLabel;
    return;
  }
  try {
    const analysis = window.titanAnalyzeSession
      ? window.titanAnalyzeSession(key, metrics, numericValue)
      : {};
    const reward = window.titanComputeSessionRewards
      ? window.titanComputeSessionRewards(key, metrics, numericValue, analysis)
      : null;
    if (!reward) throw new Error("no reward");
    xpNode.textContent = `~${Math.max(0, Math.round(reward.xp || 0))}`;
    creditsNode.textContent = `~${Math.max(0, Math.round(reward.credits || 0))}`;
    capNode.textContent = reward.weeklyCapped ? "Plafond atteint" : capLabel;
  } catch (_) {
    xpNode.textContent = "--";
    creditsNode.textContent = "--";
  }
}

function generateForm(key) {
  const conf = window.SPORTS_CONFIG[key];
  if (!conf) return;
  gymSession = [];
  analysisModule.style.display = "block";

  const isOutdoor =
    ["gps_full", "gps_simple"].includes(conf.formType) ||
    conf.cat === "outdoor";
  outdoorModule.style.display = isOutdoor ? "block" : "none";
  if (isOutdoor) generateTerrainGrid();

  let html = `
                <div class="sport-form-hint">
                    <i class="${conf.icon || "ri-run-line"}" style="color:var(--accent);"></i>
                    ${escapeUi(conf.label || "Ton sport")} · Note tes mesures, à ton rythme.
                </div>
                `;

  if (conf.formType === "gym_builder" || conf.formType === "builder_gym") {
    html += `
                <div class="form-group"><label class="form-label" for="val-2">Durée de la séance (min, facultative)</label><input id="val-2" type="number" class="input-tech" min="1" max="1440" inputmode="numeric" placeholder="Ex. 45"></div><div class="gym-builder">
                    <div class="gym-builder-head">
                        <div><strong>Séance de musculation</strong><span>Chaque série reste modifiable séparément.</span></div>
                        <div class="gym-routine-actions">
                            <button type="button" class="btn-secondary" onclick="loadGymRoutine()"><i class="ri-history-line"></i> Mes routines</button>
                            <button type="button" class="btn-secondary" onclick="saveGymRoutine()"><i class="ri-bookmark-line"></i> Mémoriser</button>
                        </div>
                    </div>
                    <div class="gym-add-grid">
                        <label><span>Exercice</span><input type="text" id="ex-name" class="input-tech" placeholder="Ex. Squat"></label>
                        <label><span>Charge</span><input type="number" id="ex-weight" class="input-tech" min="0" step="0.5" inputmode="decimal" placeholder="kg"></label>
                        <label><span>Séries</span><input type="number" id="ex-sets" class="input-tech" min="1" max="20" inputmode="numeric" placeholder="3"></label>
                        <label><span>Rép.</span><input type="number" id="ex-reps" class="input-tech" min="1" max="500" inputmode="numeric" placeholder="8"></label>
                        <label><span>RIR (répétitions en réserve)</span><input type="number" id="ex-rir" class="input-tech" min="0" max="10" inputmode="numeric" placeholder="2"></label>
                    </div>
                    <div style="margin-bottom:15px;">
                        <label class="form-label" for="ex-notes">Note d'exercice (facultatif)</label>
                        <input type="text" id="ex-notes" class="input-tech" placeholder="Tempo, variante, sensation…" style="width:100%;">
                    </div>
                    <button type="button" class="btn btn-action" style="margin-bottom:20px;" onclick="addExercise()">
                        <i class="ri-add-circle-line"></i> AJOUTER L'EXERCICE
                    </button>
                    <div id="gym-last-performance" class="gym-last-performance" aria-live="polite"></div>
                    <div id="gym-list" style="display:flex; flex-direction:column; gap:8px;"></div>
                    <div style="margin-top:15px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center;">
                        <span style="color:#94a3b8; font-size:0.8rem;">VOLUME TOTAL</span>
                        <span style="color:var(--primary); font-family:'Russo One'; font-size:1.2rem;"><span id="gym-vol">0</span> <span id="gym-unit">KG</span></span>
                    </div>
                </div>`;
  } else if (
    /climbing|escalade/i.test(`${conf.balanceProfile} ${conf.label}`)
  ) {
    html += `<label class="form-label" for="val-1">Durée de la séance (min)</label><input id="val-1" class="input-tech" type="number" min="1" max="1440" inputmode="numeric" placeholder="Ex. 60" required><p class="tracking-status">Bloc ou voie : la durée suffit. Les cotations et essais sont facultatifs.</p>`;
  } else if (conf.formType === "gps_full") {
    html += `<div class="sport-metric-grid"><div class="form-group sport-metric-field"><label class="form-label" for="val-1">Distance (${conf.unit}, facultative)</label><input type="number" inputmode="decimal" step="0.01" min="0" id="val-1" class="input-tech" placeholder="0.00" oninput="updateRewardPreview()"></div><div class="form-group sport-metric-field"><label class="form-label" for="val-2">Durée active (min)</label><input type="number" inputmode="numeric" min="0" id="val-2" class="input-tech" placeholder="Minutes" oninput="updateRewardPreview()"></div></div><div class="form-group sport-metric-field"><label class="form-label" for="val-elev" style="color:var(--warning);"><i class="ri-bar-chart-fill"></i> Dénivelé positif (m, facultatif)</label><input type="number" inputmode="numeric" min="0" id="val-elev" class="input-tech" placeholder="D+" oninput="updateRewardPreview()"></div>`;
  } else {
    html += `<div class="sport-metric-grid ${conf.unit === "min" ? "single" : ""}"><div class="form-group sport-metric-field"><label class="form-label" for="val-1">${conf.unit === "min" ? "Durée (min)" : `Volume (${conf.unit})`}</label><input type="number" inputmode="decimal" step="0.01" min="0" id="val-1" class="input-tech" placeholder="Valeur" oninput="updateRewardPreview()"></div>`;
    if (conf.unit !== "min") {
      html += `<div class="form-group sport-metric-field"><label class="form-label" for="val-2">Durée (min) <span style="font-size:0.7rem; color:#94a3b8;">(optionnel)</span></label><input type="number" inputmode="numeric" min="0" id="val-2" class="input-tech" placeholder="Temps" oninput="updateRewardPreview()"></div>`;
    }
    html += `</div>`;
  }

  const fields = normalizedExtraFields(conf);
  if (fields.length > 0) {
    html += `<details style="margin-top:20px; padding-top:20px; border-top:1px solid var(--titan-line);"><summary class="form-label" style="cursor:pointer;margin-bottom:15px;">Détails du sport · facultatif</summary><div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">`;
    fields.forEach((field) => {
      html += buildExtraInput(field);
    });
    html += `</div></details>`;
  }
  coreFields.innerHTML = html;
  extraContainer.innerHTML = "";
  updateExtraFieldVisibility();
  if (tempGpxData) applyGpxToForm(tempGpxData);
  updateRewardPreview();
}

function generateTerrainGrid() {
  const terrains =
    typeof TERRAIN_CONDITIONS !== "undefined" && TERRAIN_CONDITIONS.length
      ? TERRAIN_CONDITIONS
      : [
          {
            id: "flat_road",
            label: "Plat",
            icon: "ri-road-map-line",
            color: "#94a3b8",
          },
          {
            id: "rolling",
            label: "Vallonne",
            icon: "ri-landscape-line",
            color: "#38bdf8",
          },
          {
            id: "climb",
            label: "Cote",
            icon: "ri-bar-chart-fill",
            color: "#9ee7ff",
          },
          {
            id: "mountain",
            label: "Montagne",
            icon: "ri-mountain-line",
            color: "#d7e8f2",
          },
          {
            id: "mud_trail",
            label: "Boue/Sentier",
            icon: "ri-footprint-line",
            color: "#4ade80",
          },
          {
            id: "snow_technical",
            label: "Neige/Tech",
            icon: "ri-snowy-line",
            color: "#e0f2fe",
          },
        ];
  terrainGrid.innerHTML = "";
  terrains.forEach((t) => {
    const el = document.createElement("div");
    el.className = "terrain-opt";
    el.onclick = () => selectTerrain(t.id, el);
    el.innerHTML = `<i class="${t.icon} terrain-icon" style="color:${t.color}"></i><span class="terrain-label">${t.label}</span>`;
    terrainGrid.appendChild(el);
  });
}
function selectTerrain(id, el) {
  document
    .querySelectorAll(".terrain-opt")
    .forEach((d) => d.classList.remove("selected"));
  el.classList.add("selected");
  document.getElementById("selected-terrain").value = id;
}

function gpxDistanceKm(a, b) {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const safeH = Math.min(1, Math.max(0, h));
  return 6371 * 2 * Math.atan2(Math.sqrt(safeH), Math.sqrt(1 - safeH));
}

function simplifyGpxPath(points, maxPoints = 900) {
  if (points.length <= maxPoints) return points.map((p) => [p.lat, p.lon]);
  const step = Math.ceil(points.length / maxPoints);
  const path = points
    .filter((_, index) => index % step === 0)
    .map((p) => [p.lat, p.lon]);
  const last = points[points.length - 1];
  const lastPath = path[path.length - 1];
  if (lastPath && (lastPath[0] !== last.lat || lastPath[1] !== last.lon))
    path.push([last.lat, last.lon]);
  return path;
}

function uniqueXmlNodes(nodes) {
  const seen = new Set();
  return nodes.filter((node) => {
    if (!node || seen.has(node)) return false;
    seen.add(node);
    return true;
  });
}

function getGpxNodes(xmlDoc, tagName) {
  const normalizedTag = String(tagName || "").toLowerCase();
  const byLocalName = Array.from(xmlDoc.getElementsByTagName("*") || []).filter(
    (node) => {
      const localName = String(node.localName || node.nodeName || "")
        .split(":")
        .pop()
        .toLowerCase();
      return localName === normalizedTag;
    },
  );
  return uniqueXmlNodes([
    ...Array.from(xmlDoc.getElementsByTagName(tagName)),
    ...Array.from(
      xmlDoc.getElementsByTagNameNS
        ? xmlDoc.getElementsByTagNameNS("*", tagName)
        : [],
    ),
    ...byLocalName,
  ]);
}

function getGpxChildText(node, tagName) {
  const direct = node.getElementsByTagName(tagName)[0];
  const namespaced = node.getElementsByTagNameNS
    ? node.getElementsByTagNameNS("*", tagName)[0]
    : null;
  const normalizedTag = String(tagName || "").toLowerCase();
  const local = Array.from(node.getElementsByTagName("*") || []).find(
    (child) => {
      const localName = String(child.localName || child.nodeName || "")
        .split(":")
        .pop()
        .toLowerCase();
      return localName === normalizedTag;
    },
  );
  return (direct || namespaced || local)?.textContent || "";
}

function collectGpxPoints(xmlDoc) {
  const sources = [
    { type: "track", nodes: getGpxNodes(xmlDoc, "trkpt") },
    { type: "route", nodes: getGpxNodes(xmlDoc, "rtept") },
    { type: "waypoint", nodes: getGpxNodes(xmlDoc, "wpt") },
  ];
  const source = sources.find((item) => item.nodes.length >= 2) ||
    sources.find((item) => item.nodes.length > 0) || {
      type: "unknown",
      nodes: [],
    };
  const points = [];
  source.nodes.forEach((node) => {
    const lat = parseFloat(node.getAttribute("lat"));
    const lon = parseFloat(node.getAttribute("lon"));
    const eleText = getGpxChildText(node, "ele");
    const timeText = getGpxChildText(node, "time");
    const ele = eleText !== "" ? parseFloat(eleText) : null;
    const timeMs = timeText ? new Date(timeText).getTime() : null;
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      return;
    points.push({
      lat,
      lon,
      ele: Number.isFinite(ele) ? ele : null,
      time: Number.isFinite(timeMs) ? timeMs : null,
    });
  });
  return { sourceType: source.type, points };
}

function resetGpxImport(input = null) {
  if (input) input.value = "";
  const preview = document.getElementById("gpx-preview");
  const upload = document.getElementById("upload-text");
  const mapContainer = document.getElementById("map-container");
  if (preview) preview.style.display = "none";
  if (upload)
    upload.innerHTML = `<i class="ri-upload-cloud-2-line" style="font-size:2rem; color:#94a3b8; margin-bottom:5px;"></i><div style="font-weight:800; color:#fff;">IMPORTER GPX</div><div style="font-size:0.7rem; color:#64748b;">Compatible GPX trace ou route</div>`;
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }
  if (mapContainer) {
    mapContainer.classList.remove("active");
    mapContainer.innerHTML = "";
  }
  tempGpxData = null;
  updateRewardPreview();
}

function showGpxError(input, message) {
  resetGpxImport(input);
  if (window.showNotification) window.showNotification("error", "GPX", message);
  else console.warn("[GPX]", message);
}

function handleFileImport(input) {
  const file = input.files[0];
  if (!file) return;
  const maxBytes = window.titanIsElite?.(window.state?.user)
    ? 8 * 1024 * 1024
    : 3 * 1024 * 1024;
  if (!/\.gpx$/i.test(file.name || "")) {
    return showGpxError(input, "Format attendu: fichier .gpx.");
  }
  if (file.size > maxBytes) {
    return showGpxError(
      input,
      `Fichier trop lourd (${Math.round(file.size / 1024 / 1024)} Mo).`,
    );
  }
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const text = String(e.target.result || "");
      if (!text.trim()) return showGpxError(input, "Fichier GPX vide.");
      if (text.length > maxBytes + 1024)
        return showGpxError(
          input,
          "Fichier GPX trop volumineux apres lecture.",
        );
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "text/xml");
      if (xmlDoc.getElementsByTagName("parsererror").length > 0)
        return showGpxError(input, "Fichier GPX mal forme.");
      const collected = collectGpxPoints(xmlDoc);
      const points = collected.points;
      if (points.length === 0)
        return showGpxError(input, "Fichier GPX invalide ou vide.");
      if (points.length > 30000)
        return showGpxError(input, "Trace trop longue pour cette version.");
      if (points.length < 2)
        return showGpxError(input, "Trace GPX sans coordonnees exploitables.");

      let totalDist = 0;
      let ascent = 0;
      let descent = 0;
      let movingMs = 0;
      let ignoredPoints = 0;
      const cleanPoints = [points[0]];
      for (let i = 1; i < points.length; i++) {
        const prev = cleanPoints[cleanPoints.length - 1];
        const curr = points[i];
        const segmentKm = gpxDistanceKm(prev, curr);
        const dtMs = curr.time && prev.time ? curr.time - prev.time : null;
        const speedKmh = dtMs && dtMs > 0 ? segmentKm / (dtMs / 3600000) : null;
        if (dtMs !== null && (dtMs < 0 || speedKmh > 160)) {
          ignoredPoints++;
          continue;
        }
        if (
          segmentKm < 0.002 &&
          curr.ele !== null &&
          prev.ele !== null &&
          Math.abs(curr.ele - prev.ele) < 2
        ) {
          continue;
        }
        totalDist += segmentKm;
        if (dtMs && segmentKm > 0.008 && dtMs <= 20 * 60 * 1000)
          movingMs += dtMs;
        if (curr.ele !== null && prev.ele !== null) {
          const deltaEle = curr.ele - prev.ele;
          if (Math.abs(deltaEle) >= 3) {
            if (deltaEle > 0) ascent += deltaEle;
            else descent += Math.abs(deltaEle);
          }
        }
        cleanPoints.push(curr);
      }
      if (cleanPoints.length < 2 || totalDist <= 0)
        return showGpxError(input, "Trace GPX trop courte ou inexploitable.");

      const firstTime = cleanPoints.find((p) => p.time)?.time || null;
      const lastTime =
        [...cleanPoints].reverse().find((p) => p.time)?.time || null;
      const elapsedMinutes =
        firstTime && lastTime && lastTime > firstTime
          ? Math.round((lastTime - firstTime) / 60000)
          : 0;
      const fallbackMinutes =
        cleanPoints.length >= 2
          ? Math.max(1, Math.round(cleanPoints.length / 45))
          : 1;
      const totalMinutes = Math.max(
        1,
        Math.round(
          (movingMs > 0 ? movingMs / 60000 : elapsedMinutes) ||
            elapsedMinutes ||
            fallbackMinutes,
        ),
      );
      const avgSpeed =
        totalDist > 0 ? (totalDist / (totalMinutes / 60)).toFixed(1) : "0.0";
      const dist = Number(totalDist.toFixed(2));
      const simplifiedPath = simplifyGpxPath(cleanPoints);
      const pace = window.titanFormatPace
        ? window.titanFormatPace(dist, totalMinutes)
        : "--";
      tempGpxData = {
        dist,
        time: totalMinutes,
        ele: Math.max(0, Math.round(ascent)),
        path: simplifiedPath,
        stats: {
          pace,
          speed: avgSpeed + " km/h",
          points: simplifiedPath.length,
          rawPoints: points.length,
          cleanPoints: cleanPoints.length,
          ignoredPoints,
          movingMinutes: totalMinutes,
          elapsedMinutes,
          ascent: Math.max(0, Math.round(ascent)),
          descent: Math.max(0, Math.round(descent)),
          sourceType: collected.sourceType,
        },
      };

      input.value = "";
      document.getElementById("upload-text").innerHTML =
        `<div style="font-weight:800; color:var(--success);"><i class="ri-check-line"></i> GPX OK (${simplifiedPath.length} pts utiles)</div><div style="font-size:0.7rem; color:#94a3b8; margin-top:5px;">Source ${escapeUi(collected.sourceType)} // ${points.length} pts lus</div>`;
      document.getElementById("gpx-preview").style.display = "block";
      document.getElementById("gpx-dist").innerText = tempGpxData.dist + " km";
      document.getElementById("gpx-time").innerText = tempGpxData.time + " min";
      document.getElementById("gpx-ele").innerText = tempGpxData.ele + " m";
      document.getElementById("gpx-pace").innerText =
        tempGpxData.stats.pace + " // " + tempGpxData.stats.speed;

      if (hiddenKeyInput.value) applyGpxToForm(tempGpxData);
      updateRewardPreview();
      drawRouteOnMap(simplifiedPath);
    } catch (error) {
      window.titanReportClientError?.("gpx.import", error);
      showGpxError(input, "Import GPX impossible sur ce fichier.");
    }
  };
  reader.onerror = function () {
    showGpxError(input, "Lecture du fichier GPX impossible.");
  };
  reader.readAsText(file);
}

function applyGpxToForm(data) {
  const key = hiddenKeyInput.value;
  if (!key) return;
  const conf = window.SPORTS_CONFIG[key];
  const v1 = document.getElementById("val-1");
  const v2 = document.getElementById("val-2");
  const vEle = document.getElementById("val-elev");
  if (conf.unit === "km" && v1) v1.value = data.dist;
  else if (conf.unit === "m" && v1) v1.value = Math.round(data.dist * 1000);
  else if ((conf.unit === "min" || conf.unit === "h") && v1)
    v1.value = data.time;
  if (v2 && (!v2.value || String(conf.formType || "").includes("gps")))
    v2.value = data.time;
  if (vEle) vEle.value = data.ele;
  updateRewardPreview();
}

function drawRouteOnMap(latlngs) {
  const container = document.getElementById("map-container");
  container.classList.add("active");
  if (typeof L === "undefined") {
    container.innerHTML =
      '<div style="padding:20px; color:#9ee7ff; text-align:center;">Carte indisponible hors ligne.</div>';
    return;
  }
  if (mapInstance) {
    mapInstance.remove();
  }
  mapInstance = L.map("map-container").fitBounds(L.latLngBounds(latlngs));
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap",
    maxZoom: 19,
  }).addTo(mapInstance);
  L.polyline(latlngs, { color: "#7edcff", weight: 4, opacity: 0.86 }).addTo(
    mapInstance,
  );
}

function addExercise() {
  const name = document.getElementById("ex-name").value.trim();
  const w = parseFloat(document.getElementById("ex-weight").value) || 0;
  const s = parseInt(document.getElementById("ex-sets").value) || 0;
  const r = parseInt(document.getElementById("ex-reps").value) || 0;
  const rir = Math.max(
    0,
    Math.min(10, parseInt(document.getElementById("ex-rir").value) || 0),
  );
  const notes = document.getElementById("ex-notes").value || "";

  if (!name || w < 0 || s === 0 || r === 0) {
    window.showNotification?.(
      "warning",
      "MUSCULATION",
      "Ajoute un exercice, au moins une série et une répétition.",
    );
    return;
  }

  const exercise = {
    name,
    weight: w,
    sets: s,
    reps: r,
    rir,
    notes,
    setRows: Array.from({ length: Math.min(s, 20) }, () => ({
      weight: w,
      reps: r,
      rir,
    })),
  };
  recalculateGymExercise(exercise);
  gymSession.push(exercise);

  document.getElementById("ex-name").value = "";
  document.getElementById("ex-sets").value = "";
  document.getElementById("ex-reps").value = "";
  document.getElementById("ex-rir").value = "";
  document.getElementById("ex-notes").value = "";
  document.getElementById("ex-name").focus();

  renderGymList();
  updateRewardPreview();
}

function renderGymList() {
  window.dispatchEvent(new CustomEvent("titan:draft-change"));
  const div = document.getElementById("gym-list");
  if (!div) return;
  div.innerHTML = "";
  let totalVol = 0;
  let bodyweightReps = 0;

  gymSession.forEach((ex, idx) => {
    recalculateGymExercise(ex);
    const vol = Number(ex.volume || 0);
    totalVol += vol;
    if (!vol) bodyweightReps += Number(ex.totalReps || 0);
    const previous = findPreviousExercise(ex.name);
    const rows = ex.setRows
      .map(
        (set, setIdx) => `
                    <div class="gym-set-row">
                        <span class="gym-set-index">${setIdx + 1}</span>
                        <label><span>kg</span><input type="number" min="0" step="0.5" inputmode="decimal" value="${Number(set.weight || 0)}" onchange="updateGymSet(${idx}, ${setIdx}, 'weight', this.value)"></label>
                        <label><span>rép.</span><input type="number" min="1" max="500" inputmode="numeric" value="${Number(set.reps || 0)}" onchange="updateGymSet(${idx}, ${setIdx}, 'reps', this.value)"></label>
                        <label><span>RIR (répétitions en réserve)</span><input type="number" min="0" max="10" inputmode="numeric" value="${Number(set.rir || 0)}" onchange="updateGymSet(${idx}, ${setIdx}, 'rir', this.value)"></label>
                        <button type="button" class="gym-icon-button danger" aria-label="Supprimer la série ${setIdx + 1}" onclick="removeGymSet(${idx}, ${setIdx})"><i class="ri-close-line"></i></button>
                    </div>`,
      )
      .join("");

    div.innerHTML += `
                <div class="exo-item gym-exercise-card">
                    <div class="gym-exercise-head">
                        <div><strong>${escapeUi(ex.name)}</strong><span>${vol ? `${Math.round(vol).toLocaleString("fr-FR")} kg de volume` : `${ex.totalReps} répétitions`}</span></div>
                        <div class="gym-exercise-actions">
                            <button type="button" class="gym-icon-button" aria-label="Monter ${escapeUi(ex.name)}" onclick="moveExercise(${idx}, -1)"><i class="ri-arrow-up-line"></i></button>
                            <button type="button" class="gym-icon-button" aria-label="Descendre ${escapeUi(ex.name)}" onclick="moveExercise(${idx}, 1)"><i class="ri-arrow-down-line"></i></button>
                            <button type="button" class="gym-icon-button" aria-label="Dupliquer ${escapeUi(ex.name)}" onclick="duplicateExercise(${idx})"><i class="ri-file-copy-line"></i></button>
                            <button type="button" class="gym-icon-button danger" aria-label="Supprimer ${escapeUi(ex.name)}" onclick="removeEx(${idx})"><i class="ri-delete-bin-line"></i></button>
                        </div>
                    </div>
                    ${previous ? `<div class="gym-previous"><i class="ri-history-line"></i> Dernière fois : ${escapeUi(previous)}</div>` : ""}
                    <div class="gym-set-head" aria-hidden="true"><span>Série</span><span>Charge</span><span>Rép.</span><span>RIR (répétitions en réserve)</span><span></span></div>
                    ${rows}
                    <button type="button" class="btn-secondary gym-add-set" onclick="addGymSet(${idx})"><i class="ri-add-line"></i> Ajouter une série</button>
                    ${ex.notes ? `<div class="gym-exercise-note">${escapeUi(ex.notes)}</div>` : ""}
                </div>`;
  });

  document.getElementById("gym-vol").innerText = (
    totalVol > 0 ? totalVol : bodyweightReps
  ).toLocaleString();
  const unitNode = document.getElementById("gym-unit");
  if (unitNode) unitNode.innerText = totalVol > 0 ? "KG" : "REPS";
}

function recalculateGymExercise(ex) {
  if (!Array.isArray(ex.setRows) || !ex.setRows.length) {
    ex.setRows = Array.from(
      { length: Math.max(1, Number(ex.sets || 1)) },
      () => ({
        weight: Number(ex.weight || 0),
        reps: Number(ex.reps || 1),
        rir: Number(ex.rir || 0),
      }),
    );
  }
  ex.setRows = ex.setRows.slice(0, 30).map((set) => ({
    weight: Math.max(0, Number(set.weight || 0)),
    reps: Math.max(1, Math.min(500, Number(set.reps || 1))),
    rir: Math.max(0, Math.min(10, Number(set.rir || 0))),
  }));
  ex.sets = ex.setRows.length;
  ex.totalReps = ex.setRows.reduce((sum, set) => sum + set.reps, 0);
  ex.volume = ex.setRows.reduce((sum, set) => sum + set.weight * set.reps, 0);
  ex.weight = Math.max(0, ...ex.setRows.map((set) => set.weight));
  ex.reps = Math.max(1, Math.round(ex.totalReps / ex.sets));
  ex.rir = Math.round(
    ex.setRows.reduce((sum, set) => sum + set.rir, 0) / ex.sets,
  );
}

function updateGymSet(exIdx, setIdx, field, value) {
  const exercise = gymSession[exIdx];
  const set = exercise?.setRows?.[setIdx];
  if (!set || !["weight", "reps", "rir"].includes(field)) return;
  set[field] = Number(value || 0);
  recalculateGymExercise(exercise);
  renderGymList();
  updateRewardPreview();
}

function addGymSet(idx) {
  const exercise = gymSession[idx];
  if (!exercise || exercise.setRows.length >= 30) return;
  const previous = exercise.setRows[exercise.setRows.length - 1] || {
    weight: 0,
    reps: 8,
    rir: 2,
  };
  exercise.setRows.push({ ...previous });
  renderGymList();
  updateRewardPreview();
}

function removeGymSet(exIdx, setIdx) {
  const exercise = gymSession[exIdx];
  if (!exercise) return;
  if (exercise.setRows.length === 1) return removeEx(exIdx);
  exercise.setRows.splice(setIdx, 1);
  renderGymList();
  updateRewardPreview();
}

function duplicateExercise(idx) {
  const source = gymSession[idx];
  if (!source) return;
  gymSession.splice(idx + 1, 0, JSON.parse(JSON.stringify(source)));
  renderGymList();
  updateRewardPreview();
}

function moveExercise(idx, direction) {
  const target = idx + direction;
  if (target < 0 || target >= gymSession.length) return;
  [gymSession[idx], gymSession[target]] = [gymSession[target], gymSession[idx]];
  renderGymList();
}

function findPreviousExercise(name) {
  const target = normalizeSearchText(name);
  const logs = Array.isArray(window.state?.history)
    ? window.state.history.slice().reverse()
    : [];
  for (const log of logs) {
    const match = (log.details?.exercises || []).find(
      (ex) => normalizeSearchText(ex.name) === target,
    );
    if (match)
      return `${match.sets || match.setRows?.length || 0} séries · ${match.weight || 0} kg · ${match.reps || 0} rép.`;
  }
  return "";
}

function saveGymRoutine() {
  if (!gymSession.length)
    return window.showNotification?.(
      "warning",
      "ROUTINE",
      "Ajoute au moins un exercice.",
    );
  if (!window.state.user.gymRoutines) window.state.user.gymRoutines = [];
  window.state.user.gymRoutines.unshift({
    id: `routine_${Date.now()}`,
    label: `Routine du ${new Date().toLocaleDateString("fr-FR")}`,
    exercises: JSON.parse(JSON.stringify(gymSession)),
  });
  window.state.user.gymRoutines = window.state.user.gymRoutines.slice(0, 5);
  window.saveState?.();
  window.showNotification?.("success", "ROUTINE", "Routine mémorisée.");
}

function loadGymRoutine() {
  const routine = window.state?.user?.gymRoutines?.[0];
  if (!routine?.exercises?.length)
    return window.showNotification?.(
      "info",
      "ROUTINE",
      "Aucune routine mémorisée.",
    );
  gymSession = JSON.parse(JSON.stringify(routine.exercises));
  gymSession.forEach(recalculateGymExercise);
  renderGymList();
  updateRewardPreview();
}

function removeEx(idx) {
  gymSession.splice(idx, 1);
  renderGymList();
  updateRewardPreview();
}

async function handleSubmit(e) {
  e.preventDefault();
  if (window.titanSubmitting) return;
  window.titanSubmitting = true;
  const submitButton = document.querySelector('#training-form [type="submit"]');
  if (submitButton) submitButton.disabled = true;

  try {
    const key = hiddenKeyInput.value;
    if (!key)
      return window.showNotification
        ? window.showNotification("warning", "SEANCE", "Selectionnez un sport.")
        : console.warn("[SEANCE] Sport requis.");
    const conf = window.SPORTS_CONFIG[key];
    const val1Input = document.getElementById("val-1");
    const val2Input = document.getElementById("val-2");
    const elevationInput = document.getElementById("val-elev");
    const metrics = {
      val1: val1Input ? parseFloat(val1Input.value) : 0,
      val2:
        val2Input && val2Input.value !== ""
          ? parseFloat(val2Input.value)
          : null,
      elevation:
        elevationInput && elevationInput.value !== ""
          ? parseFloat(elevationInput.value)
          : 0,
      exercises: gymSession,
      bio: {
        rpe: document.getElementById("bio-rpe").value,
        sleep: document.getElementById("bio-sleep").value,
        nutrition: document.getElementById("bio-nutri").value,
      },
      note: document.getElementById("session-note")
        ? document.getElementById("session-note").value
        : "",
      tags: selectedTags.slice(0, 3),
      extras: {},
    };
    if (/climbing|escalade/i.test(`${conf.balanceProfile} ${conf.label}`)) {
      metrics.unitOverride = "min";
      metrics.val2 = metrics.val1;
    }
    if (conf.unit === "km" && !metrics.val1 && metrics.val2 > 0) {
      metrics.unitOverride = "min";
      metrics.val1 = metrics.val2;
    }
    const dateValue = document.getElementById("session-date")?.value;
    const timeValue = document.getElementById("session-time")?.value || "12:00";
    if (dateValue) {
      const performedAt = new Date(`${dateValue}T${timeValue}:00`);
      if (
        Number.isNaN(performedAt.getTime()) ||
        performedAt.getTime() > Date.now() + 60000
      ) {
        return window.showNotification?.(
          "warning",
          "DATE",
          "Choisis une date et une heure valides, non futures.",
        );
      }
      metrics.performedAt = performedAt.toISOString();
    }
    const terrainVal = document.getElementById("selected-terrain").value;
    if (terrainVal) metrics.extras.terrain = terrainVal;

    const activeExtraFields = normalizedExtraFields(conf);
    const visibilityValues = currentExtraValues();
    if (activeExtraFields.length) {
      activeExtraFields.forEach((field) => {
        const isVisible = window.titanExtraFieldIsVisible
          ? window.titanExtraFieldIsVisible(field, visibilityValues)
          : true;
        if (!isVisible) return;
        const el = document.getElementById(`extra-${field.id}`);
        if (el && (el.type === "checkbox" || el.value))
          metrics.extras[field.id] =
            el.type === "checkbox" ? el.checked : el.value;
      });
    }

    if (tempGpxData) {
      metrics.hasGpx = true;
      metrics.gpxPath = tempGpxData.path;
      metrics.gpxStats = tempGpxData.stats;
    }

    // --- CHECK PLANNING BOOST ---
    const today = getTodayKey();
    const scheduledSport = window.state.user.schedule?.[today]?.sport;
    if (scheduledSport && scheduledSport === key) {
      metrics.isPlanned = true; // Flag pour main.js (logActivity)
      if (window.showToast)
        window.showToast("DISCIPLINE RESPECTEE : BONUS XP !", "success");
    }

    // Appel ? la fonction centrale de Main.js
    const savedLog = await logActivity(key, metrics);
    if (!savedLog) return;
    window.dispatchEvent(new CustomEvent("titan:session-stored"));

    document.getElementById("training-form").reset();
    coreFields.innerHTML = `<div style="text-align:center; color:#94a3b8; font-style:italic; font-size:0.9rem;"><i class="ri-arrow-up-line"></i> Choisis une discipline pour afficher les champs utiles.</div>`;
    searchInput.value = "";
    hiddenKeyInput.value = "";
    gymSession = [];
    selectedTags = [];
    renderIntentTags();
    updateNoteCounter();
    analysisModule.style.display = "none";
    outdoorModule.style.display = "none";
    resetGpxImport(document.getElementById("file-upload"));
    setDefaultSessionDateTime();
    const status = document.getElementById("session-save-status");
    if (status)
      status.innerHTML = `<i class="ri-checkbox-circle-fill"></i> Séance conservée sur cet appareil.${String(window.state.user.id).startsWith("guest_") ? "" : " Synchronisation en cours."} <a href="./journal.html">Voir dans le journal</a>`;
    document
      .querySelector(".training-card")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    if (window.showNotification)
      window.showNotification("error", "Séance non enregistrée", err.message);
    else console.error("[TRAINING]", err);
  } finally {
    window.titanSubmitting = false;
    if (submitButton) submitButton.disabled = false;
  }
}

function sessionCredits(log) {
  const details = log.details || {};
  const reward = details.serverReward || details.rewardMeta || {};
  return Number(reward.credits ?? reward.requestedCredits ?? 0) || 0;
}

function sessionMetricChips(log) {
  const details = log.details || {};
  const chips = [];
  const duration = Number(
    details.gpxStats?.movingMinutes ||
      details.val2 ||
      (log.unit === "min" ? log.val : 0),
  );
  const distance =
    log.unit === "km" ? Number(log.val || 0) : Number(details.val1 || 0);
  const ascent = Number(details.gpxStats?.ascent || details.elevation || 0);
  const credits = sessionCredits(log);
  if (duration > 0)
    chips.push(
      `<span class="session-metric-chip">${Math.round(duration)} min</span>`,
    );
  if (log.unit === "km" && distance > 0)
    chips.push(
      `<span class="session-metric-chip">${Number(distance).toFixed(distance >= 10 ? 1 : 2)} km</span>`,
    );
  if (log.unit === "kg" && Number(log.val) > 0)
    chips.push(
      `<span class="session-metric-chip">${Number(log.val).toLocaleString("fr-FR")} kg</span>`,
    );
  if (ascent > 0)
    chips.push(
      `<span class="session-metric-chip">D+ ${Math.round(ascent)} m</span>`,
    );
  if (details.gpxStats?.pace)
    chips.push(
      `<span class="session-metric-chip">${escapeUi(details.gpxStats.pace)}</span>`,
    );
  if (credits > 0)
    chips.push(`<span class="session-metric-chip warn">+${credits} CR</span>`);
  if (
    details.rewardMeta?.weeklyCapped ||
    Number(details.serverReward?.weekly_xp_remaining) === 0
  )
    chips.push(`<span class="session-metric-chip warn">Plafond</span>`);
  return chips.length
    ? `<div class="session-metric-line">${chips.join("")}</div>`
    : "";
}

function sessionCoachBlock(log) {
  if (!window.titanGetSessionCoachingReadout) return "";
  const readout = window.titanGetSessionCoachingReadout(
    log,
    window.state?.history || [],
  );
  const bullets = (readout.bullets || [])
    .map(
      (item) =>
        `<div style="color:#cbd5e1; font-size:0.82rem; line-height:1.45;">${escapeUi(item)}</div>`,
    )
    .join("");
  const trends = (readout.trends || [])
    .map((item) => {
      const unit = item.definition?.unit ? ` ${item.definition.unit}` : "";
      const average = Number(item.average || 0).toLocaleString("fr-FR", {
        maximumFractionDigits: item.definition?.id === "pace" ? 2 : 1,
      });
      const tint =
        item.status === "up"
          ? "#9ee7ff"
          : item.status === "down"
            ? "#fda4af"
            : "#94a3b8";
      return `<div style="background:rgba(0,0,0,0.28); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:10px; min-width:0;">
                    <div style="font-size:0.68rem; color:#7892a2; text-transform:uppercase; font-weight:900;">${escapeUi(item.definition?.label || "Metrice")}</div>
                    <div style="font-family:'Russo One'; color:#fff; margin-top:5px;">${escapeUi(item.display || "--")}</div>
                    <div style="font-size:0.7rem; color:${tint}; margin-top:5px;">Moy. ${escapeUi(average + unit)} sur ${escapeUi(item.count || 0)} trace(s)</div>
                </div>`;
    })
    .join("");
  return `<div style="margin-bottom:20px; background:rgba(126,220,255,0.06); border:1px solid rgba(126,220,255,0.18); border-radius:12px; padding:15px;">
                <div style="font-size:0.8rem; color:var(--accent); margin-bottom:8px; text-transform:uppercase; letter-spacing:1px; font-weight:bold;"><i class="ri-line-chart-line"></i> LECTURE COACH</div>
                <div style="font-family:'Russo One'; color:#fff; margin-bottom:10px;">${escapeUi(readout.headline || "Trace exploitable")}</div>
                <div style="display:grid; gap:6px;">${bullets || '<div style="color:#cbd5e1; font-size:0.82rem;">Ajoute des donnees specifiques pour densifier le suivi.</div>'}</div>
                <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-top:12px;">${trends || '<div style="grid-column:1/-1; color:#94a3b8; font-size:0.8rem;">Les comparaisons apparaissent apres plusieurs traces comparables.</div>'}</div>
            </div>`;
}

function renderTrainingHistory() {
  const list = document.getElementById("training-history-list");
  // window.state est maintenant garanti par state.js
  if (
    !window.state ||
    !window.state.history ||
    window.state.history.length === 0
  ) {
    list.innerHTML = `<div style="text-align:center; padding:40px; color:#64748b; font-family:'Courier New'; border:1px dashed rgba(255,255,255,0.1); border-radius:8px;">AUCUNE SEANCE ENREGISTREE</div>`;
    return;
  }
  list.innerHTML = "";
  [...window.state.history].reverse().forEach((log) => {
    const dateObj = new Date(log.date);
    const dateStr =
      dateObj.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) +
      " - " +
      dateObj.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    let sportLabel = log.sport;
    if (window.SPORTS_CONFIG && window.SPORTS_CONFIG[log.sport]) {
      sportLabel = window.SPORTS_CONFIG[log.sport].label;
    }
    const hasMap =
      log.details && log.details.gpxPath && log.details.gpxPath.length > 0;
    const tagsHtml = (log.details?.tags || [])
      .map(
        (tag) =>
          `<span class="session-tag-mini">${escapeUi(window.TITAN_SESSION_TAGS?.[tag]?.label || tag)}</span>`,
      )
      .join("");
    const summaryHtml = log.details?.summary
      ? `<div class="session-summary">${escapeUi(log.details.summary)}</div>`
      : "";
    const metricsHtml = sessionMetricChips(log);

    list.innerHTML += `
                <div class="hist-card" onclick="openSessionDetails(${log.id})">
                    <div>
                        <div class="hist-sport">${escapeUi(sportLabel)} ${hasMap ? '<i class="ri-map-pin-line" style="color:var(--accent); font-size:0.8rem;"></i>' : ""}</div>
                        <div class="hist-date">${dateStr}</div>
                        ${summaryHtml}
                        ${tagsHtml ? `<div class="session-meta-line">${tagsHtml}</div>` : ""}
                        ${metricsHtml}
                    </div>
                    <div style="text-align:right;">
                        <div class="hist-val">${log.val} ${log.unit || ""}</div>
                        <div style="font-size:0.7rem; color:#38bdf8;">+${log.xp} XP</div>
                    </div>
                </div>`;
  });
}

function openSessionDetails(id) {
  const log = window.state.history.find((l) => l.id === id);
  if (!log) return;
  let sportLabel = log.sport;
  if (window.SPORTS_CONFIG && window.SPORTS_CONFIG[log.sport])
    sportLabel = window.SPORTS_CONFIG[log.sport].label;
  const details = log.details || {};

  let mapHtml = "";
  if (details.gpxPath && details.gpxPath.length > 0) {
    mapHtml = `<div id="history-map"></div>`;
  }

  // --- NOUVEAU BLOC DETAILS INTELLIGENT ---
  let sessionDetailsHtml = "";

  // CAS 1: MUSCU (Liste des exos)
  if (
    details.exercises &&
    Array.isArray(details.exercises) &&
    details.exercises.length > 0
  ) {
    sessionDetailsHtml += `<div style="margin-bottom:20px; background:rgba(255,255,255,0.03); border-radius:12px; padding:15px; border:1px solid rgba(255,255,255,0.05);">
                    <div style="font-size:0.8rem; color:#94a3b8; margin-bottom:10px; text-transform:uppercase; letter-spacing:1px; font-weight:bold;"><i class="ri-list-check"></i> SEANCE DETAILLEE</div>
                    <div style="display:flex; flex-direction:column; gap:8px;">`;

    details.exercises.forEach((ex) => {
      sessionDetailsHtml += `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.2); padding:10px; border-radius:8px; border-left:3px solid var(--accent);">
                        <div>
                            <div style="color:#fff; font-weight:bold; font-size:0.95rem;">${escapeUi(ex.name)}</div>
                            ${ex.notes ? `<div style="font-size:0.75rem; color:#64748b; font-style:italic;">"${escapeUi(ex.notes)}"</div>` : ""}
                        </div>
                        <div style="text-align:right;">
                            <div style="color:var(--primary); font-family:'Russo One';">${ex.weight} kg</div>
                            <div style="font-size:0.8rem; color:#94a3b8;">${ex.sets} x ${ex.reps}</div>
                        </div>
                    </div>`;
    });
    sessionDetailsHtml += `</div></div>`;
  }

  // CAS 2: OUTDOOR / GPS / CARDIO (Dist, Duree, D+, Vitesse)
  else if (details.val1 || details.elevation) {
    let m1Label = "VOLUME";
    let m1Val = details.val1 || 0;
    let m1Unit = log.unit || "";

    // Si c'est un sport GPS, val1 est souvent la distance
    if (["km", "m"].includes(log.unit)) m1Label = "DISTANCE";

    sessionDetailsHtml += `<div style="margin-bottom:20px; background:rgba(255,255,255,0.03); border-radius:12px; padding:15px; border:1px solid rgba(255,255,255,0.05);">
                    <div style="font-size:0.8rem; color:#94a3b8; margin-bottom:15px; text-transform:uppercase; letter-spacing:1px; font-weight:bold;"><i class="ri-dashboard-3-line"></i> STATS CLES</div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                        <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; text-align:center;">
                            <div style="font-size:0.7rem; color:#64748b;">${m1Label}</div>
                            <div style="font-size:1.1rem; color:#fff; font-family:'Russo One';">${m1Val} ${m1Unit}</div>
                        </div>`;

    if (details.val2) {
      sessionDetailsHtml += `
                        <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; text-align:center;">
                            <div style="font-size:0.7rem; color:#64748b;">DUREE</div>
                            <div style="font-size:1.1rem; color:#fff; font-family:'Russo One';">${details.val2} min</div>
                        </div>`;
    }

    if (details.elevation) {
      sessionDetailsHtml += `
                        <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; text-align:center; border:1px solid rgba(126, 220, 255, 0.26);">
                            <div style="font-size:0.7rem; color:#9ee7ff;">DENIVELE</div>
                            <div style="font-size:1.1rem; color:#9ee7ff; font-family:'Russo One';">+${details.elevation} m</div>
                        </div>`;
    }

    // Calcul Vitesse Moyenne (Si on a Km et Min)
    if (log.unit === "km" && details.val1 > 0 && details.val2 > 0) {
      let speed = (details.val1 / (details.val2 / 60)).toFixed(1);
      sessionDetailsHtml += `
                        <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; text-align:center;">
                            <div style="font-size:0.7rem; color:#64748b;">VITESSE MOY.</div>
                            <div style="font-size:1.1rem; color:#fff; font-family:'Russo One';">${speed} km/h</div>
                        </div>`;
    }

    sessionDetailsHtml += `</div></div>`;
  }

  if (details.gpxStats) {
    const stats = details.gpxStats || {};
    const ignored = Number(stats.ignoredPoints || 0);
    sessionDetailsHtml += `<div style="margin-bottom:20px; background:rgba(126,220,255,0.055); border-radius:12px; padding:15px; border:1px solid rgba(126,220,255,0.18);">
                    <div style="font-size:0.8rem; color:#9ee7ff; margin-bottom:15px; text-transform:uppercase; letter-spacing:1px; font-weight:bold;"><i class="ri-route-line"></i> TRACE GPX NETTOYEE</div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                        <div style="background:rgba(0,0,0,0.28); padding:10px; border-radius:8px; text-align:center;"><div style="font-size:0.7rem; color:#64748b;">DUREE ACTIVE</div><div style="font-size:1.05rem; color:#fff; font-family:'Russo One';">${Math.round(Number(stats.movingMinutes || details.val2 || 0))} min</div></div>
                        <div style="background:rgba(0,0,0,0.28); padding:10px; border-radius:8px; text-align:center;"><div style="font-size:0.7rem; color:#64748b;">D+ CUMULE</div><div style="font-size:1.05rem; color:#9ee7ff; font-family:'Russo One';">+${Math.round(Number(stats.ascent || details.elevation || 0))} m</div></div>
                        <div style="background:rgba(0,0,0,0.28); padding:10px; border-radius:8px; text-align:center;"><div style="font-size:0.7rem; color:#64748b;">ALLURE</div><div style="font-size:1.05rem; color:#fff; font-family:'Russo One';">${escapeUi(stats.pace || "--")}</div></div>
                        <div style="background:rgba(0,0,0,0.28); padding:10px; border-radius:8px; text-align:center;"><div style="font-size:0.7rem; color:#64748b;">POINTS</div><div style="font-size:1.05rem; color:#fff; font-family:'Russo One';">${Math.round(Number(stats.cleanPoints || stats.rawPoints || stats.points || 0))}${ignored ? ` / ${ignored} ignores` : ""}</div></div>
                    </div>
                </div>`;
  }

  if (
    details.extras &&
    window.SPORTS_CONFIG &&
    window.SPORTS_CONFIG[log.sport]
  ) {
    const conf = window.SPORTS_CONFIG[log.sport];
    const fields = normalizedExtraFields(conf).filter(
      (field) =>
        details.extras[field.id] !== undefined &&
        details.extras[field.id] !== "",
    );
    if (fields.length) {
      sessionDetailsHtml += `<div style="margin-bottom:20px; background:rgba(255,255,255,0.03); border-radius:12px; padding:15px; border:1px solid rgba(255,255,255,0.05);">
                        <div style="font-size:0.8rem; color:#94a3b8; margin-bottom:15px; text-transform:uppercase; letter-spacing:1px; font-weight:bold;"><i class="ri-equalizer-line"></i> DONNEES SPECIFIQUES</div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">`;
      fields.forEach((field) => {
        const value = details.extras[field.id];
        sessionDetailsHtml += `<div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; text-align:center;">
                            <div style="font-size:0.7rem; color:#64748b;">${escapeUi(field.label)}</div>
                            <div style="font-size:1rem; color:#fff; font-family:'Russo One';">${escapeUi(value)}${field.unit ? " " + escapeUi(field.unit) : ""}</div>
                        </div>`;
      });
      sessionDetailsHtml += `</div></div>`;
    }
  }

  if (
    details.summary ||
    details.note ||
    (details.tags && details.tags.length)
  ) {
    const noteText = details.note ? escapeUi(details.note) : "";
    const tags = (details.tags || [])
      .map(
        (tag) =>
          `<span class="session-tag-mini">${escapeUi(window.TITAN_SESSION_TAGS?.[tag]?.label || tag)}</span>`,
      )
      .join("");
    sessionDetailsHtml += `<div style="margin-bottom:20px; background:rgba(56,189,248,0.06); border:1px solid rgba(56,189,248,0.18); border-radius:12px; padding:15px;">
                    <div style="font-size:0.8rem; color:var(--accent); margin-bottom:8px; text-transform:uppercase; letter-spacing:1px; font-weight:bold;"><i class="ri-file-list-3-line"></i> RAPPORT</div>
                    ${details.summary ? `<div style="color:#cbd5e1; font-size:0.84rem; line-height:1.45;">${escapeUi(details.summary)}</div>` : ""}
                    ${noteText ? `<div style="margin-top:10px; color:#fff; font-size:0.82rem; border-top:1px dashed rgba(255,255,255,0.12); padding-top:8px;">${noteText}</div>` : ""}
                    ${tags ? `<div class="session-meta-line" style="margin-top:10px;">${tags}</div>` : ""}
                </div>`;
  }

  sessionDetailsHtml += sessionCoachBlock(log);

  let bioHtml = "";
  if (details.bio) {
    const b = details.bio;
    bioHtml = `<div style="background:rgba(255,255,255,0.03); padding:10px; border-radius:8px; margin-bottom:10px;"><div class="detail-row"><span class="detail-label">RESSENTI</span><div>${b.rpe}/10 <div class="bio-bar-wrapper"><div class="bio-bar-fill" style="width:${b.rpe * 10}%; background:${getColor(b.rpe, 10)}"></div></div></div></div><div class="detail-row"><span class="detail-label">SOMMEIL</span><div>${b.sleep}/5 <div class="bio-bar-wrapper"><div class="bio-bar-fill" style="width:${b.sleep * 20}%; background:${getColor(b.sleep, 5)}"></div></div></div></div><div class="detail-row"><span class="detail-label">NUTRITION</span><div>${b.nutrition}/5 <div class="bio-bar-wrapper"><div class="bio-bar-fill" style="width:${b.nutrition * 20}%; background:${getColor(b.nutrition, 5)}"></div></div></div></div></div>`;
  }

  const isElite = window.state.user.is_elite;
  let eliteHtml = `
            <div class="elite-block">
                <div class="elite-header"><i class="ri-vip-crown-fill"></i> ANALYSE TITAN A.I.</div>
                <div class="elite-grid">
                    <div class="elite-stat"><div class="elite-label">ESTIMATION</div><div class="elite-value" id="ai-val-1">-</div></div>
                    <div class="elite-stat"><div class="elite-label">INTENSITE</div><div class="elite-value" id="ai-val-2">-</div></div>
                </div>
                <div id="elite-lock-overlay" class="elite-lock" style="display:${isElite ? "none" : "flex"}">
                    <i class="ri-lock-2-fill" style="color:#9ee7ff; font-size:1.5rem; margin-bottom:5px;"></i>
                    <button onclick="window.location.href='boutique.html'" style="background:#9ee7ff; border:none; padding:4px 10px; border-radius:4px; font-family:'Russo One'; font-size:0.7rem; cursor:pointer;">DEBLOQUER</button>
                </div>
            </div>`;

  if (isElite) {
    setTimeout(() => {
      document.getElementById("ai-val-1").innerText = "OPTIMAL";
      document.getElementById("ai-val-2").innerText = "A+";
    }, 100);
  }

  // --- INTEGRATION DU BLOC DETAILS DANS LE HTML FINAL ---
  const credits = sessionCredits(log);
  let contentHtml = `<div style="text-align:center; margin-bottom:20px;"><div style="font-family:'Russo One'; font-size:1.5rem; color:var(--primary); text-transform:uppercase;">${escapeUi(sportLabel)}</div><div style="font-family:'Courier New'; color:#94a3b8; font-size:0.8rem;">${escapeUi(new Date(log.date).toLocaleString())}</div></div>${mapHtml}${sessionDetailsHtml}<div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:8px; margin-bottom:20px;"><div class="detail-row"><span class="detail-label">PERFORMANCE</span><span class="detail-val" style="font-size:1.1rem; color:var(--primary);">${escapeUi(log.val)} ${escapeUi(log.unit)}</span></div>${bioHtml}<div class="detail-row" style="margin-top:10px; border-top:1px solid rgba(255,255,255,0.1); padding-top:10px;"><span class="detail-label">RECOMPENSE</span><span class="detail-val" style="color:#38bdf8;">+${escapeUi(log.xp)} XP${credits ? ` | +${credits} CR` : ""}</span></div></div>${eliteHtml}`;

  document.getElementById("modal-content").innerHTML = contentHtml;
  document.getElementById("session-modal-overlay").style.display = "flex";

  if (details.gpxPath && details.gpxPath.length > 0) {
    setTimeout(() => {
      if (typeof L === "undefined") return;
      if (histMapInstance) {
        histMapInstance.remove();
      }
      histMapInstance = L.map("history-map");
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { attribution: "&copy; OpenStreetMap", maxZoom: 19 },
      ).addTo(histMapInstance);
      const polyline = L.polyline(details.gpxPath, {
        color: "#7edcff",
        weight: 4,
        opacity: 0.86,
      }).addTo(histMapInstance);
      histMapInstance.fitBounds(polyline.getBounds());
    }, 200);
  }
}

function closeSessionModal(e, force = false) {
  if (force || e.target.id === "session-modal-overlay") {
    document.getElementById("session-modal-overlay").style.display = "none";
    if (histMapInstance) {
      histMapInstance.remove();
      histMapInstance = null;
    }
  }
}
function getColor(val, max) {
  const pct = val / max;
  if (pct <= 0.33) return "#ef4444";
  if (pct <= 0.66) return "#9ee7ff";
  return "#4ade80";
}

// Maintient les vues dans le contenu principal, y compris avec les parseurs WebView stricts.
document.addEventListener("DOMContentLoaded", () => {
  const main = document.querySelector(".main-content");
  ["view-new", "view-history", "view-planning"].forEach((id) => {
    const view = document.getElementById(id);
    if (main && view && view.parentElement !== main) main.appendChild(view);
  });
  setTimeout(() => {
    document.getElementById("view-new").style.display = "block";
  }, 120);
});
