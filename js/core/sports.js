/* TITAN 300 — sport model.
   A sport is not a label: each one belongs to an entry form (what is measured) and a family
   (how it shows up in the DNA). Works offline from the generated snapshot and enriches itself
   with the online catalog (sport-specific fields) when available. */
(function (root) {
  "use strict";
  const LABELS = {
    running: "Course à pied", walking: "Marche", cycling: "Vélo", muscu_gym: "Musculation en salle",
    muscu_builder: "Musculation", muscu_home: "Musculation à la maison", swimming: "Natation", yoga: "Yoga",
    trail: "Trail", treadmill: "Tapis de course", cycling_road: "Cyclisme sur route", cycling_indoor: "Vélo d’intérieur",
  };

  /** Entry forms. */
  const FORMS = {
    distance: { label: "Distance et durée", measures: ["distance", "duration", "elevation"] },
    swim: { label: "Natation", measures: ["meters", "duration", "pool"] },
    strength: { label: "Exercices et séries", measures: ["exercises", "duration"] },
    bodyweight: { label: "Mouvements au poids du corps", measures: ["movements", "duration"] },
    climbing: { label: "Escalade", measures: ["climbing", "duration"] },
    practice: { label: "Durée et intensité", measures: ["duration"] },
  };

  const PROFILE_FAMILY = {
    running: "endurance", trail: "endurance", mountain_endurance: "endurance", hiking: "endurance",
    cycling: "endurance", mtb: "endurance", swimming: "endurance", water: "endurance", glide: "endurance",
    mixed: "endurance", mixed_conditioning: "endurance", speed: "endurance",
    strength: "force", strength_max: "force", calisthenics: "force",
    climbing: "technique", skill: "technique", precision: "technique", gym_skill: "technique", dance: "technique",
    team: "jeu", football: "jeu", rugby: "jeu", hockey_team: "jeu", contact_team: "jeu", racket: "jeu",
    combat: "jeu", combat_grappling: "jeu", combat_striking: "jeu", combat_weapon: "jeu",
    mobility: "mobilite", mindbody: "mobilite",
  };
  const FAMILY_LABEL = { endurance: "Endurance", force: "Force", technique: "Technique", jeu: "Jeu & combat", mobilite: "Mobilité" };
  const FAMILY_ICON = { endurance: "run", force: "weight", technique: "mountain", jeu: "target", mobilite: "leaf" };

  /** Sports that open the picker: one tap for most people. */
  const POPULAR = ["running", "walking", "cycling", "muscu_gym", "swimming", "trail", "hiking", "bouldering", "climbing_route", "yoga", "football", "tennis", "padel", "hiit", "bodyweight", "rowing_machine"];

  const PACE_PROFILES = new Set(["running", "trail", "mountain_endurance", "hiking"]);

  const QUERY_EXPANSIONS = {
    courir: ["running", "trail"], course: ["running"], footing: ["running"], jogging: ["running"], run: ["running"],
    velo: ["cycling", "cycling_road", "mountain_bike"], muscu: ["muscu_gym", "muscu_builder", "muscu_home"],
    salle: ["muscu_gym"], foot: ["football"], rando: ["hiking"], nage: ["swimming"], piscine: ["swimming"],
    escalade: ["bouldering", "climbing_route", "sport_climbing"], grimpe: ["bouldering", "climbing_route"],
    bloc: ["bouldering"], marche: ["walking", "nordic_walk", "hiking"],
    nager: ["swimming"], natation: ["swimming"], paddle: ["paddle", "padel"], padle: ["padel"], vtt: ["mountain_bike"],
    tennis: ["tennis"], boxe: ["boxing"], muscul: ["muscu_gym"], musculation: ["muscu_gym", "muscu_home"], etirements: ["stretching"],
  };

  const norm = (v) =>
    String(v || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[’'_/().-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  let snapshotIndex = null;
  function snapshot() {
    if (snapshotIndex) return snapshotIndex;
    snapshotIndex = new Map();
    for (const [id, label, unit, cat, profile, aliases, sort] of root.TITAN_SPORTS_SNAPSHOT || [])
      snapshotIndex.set(id, { id, label, unit, cat, balanceProfile: profile, aliases: String(aliases || "").split("|").filter(Boolean), sortOrder: sort });
    return snapshotIndex;
  }

  /** Fill missing sports in SPORTS_CONFIG from the snapshot, never overriding online entries. */
  function ensure() {
    root.SPORTS_CONFIG = root.SPORTS_CONFIG || {};
    let added = 0;
    for (const [id, s] of snapshot()) {
      if (root.SPORTS_CONFIG[id]) continue;
      root.SPORTS_CONFIG[id] = {
        label: s.label, name: s.label, unit: s.unit, cat: s.cat, balanceProfile: s.balanceProfile,
        extraFields: [], aliases: s.aliases, sortOrder: s.sortOrder, offline: true,
        formType: s.unit === "km" ? "gps_full" : "duration",
      };
      added++;
    }
    return added;
  }

  function conf(id) {
    return root.SPORTS_CONFIG?.[id] || (snapshot().get(id) ? { ...snapshot().get(id) } : null);
  }

  function label(id) {
    const s = snapshot().get(id);
    return LABELS[id] || s?.label || conf(id)?.label || String(id || "Séance").replace(/_/g, " ");
  }

  /** Online rows carry aliases in trackingSummary; keep the offline vocabulary as a fallback. */
  function aliasesOf(id) {
    const c = conf(id) || {};
    const groups = [c.aliases, c.trackingSummary?.aliases, snapshot().get(id)?.aliases];
    return [...new Set(groups.flatMap((list) => Array.isArray(list) ? list.filter((s) => typeof s === "string") : []))];
  }

  function profileOf(id) {
    const c = conf(id) || {};
    return c.balanceProfile || c.balance_profile || snapshot().get(id)?.balanceProfile || "";
  }

  function unitOf(id) {
    return conf(id)?.unit || snapshot().get(id)?.unit || "min";
  }

  function familyOf(id) {
    return PROFILE_FAMILY[profileOf(id)] || "endurance";
  }

  function formOf(id) {
    const profile = profileOf(id);
    const unit = unitOf(id);
    if (profile === "climbing") return "climbing";
    if (profile === "swimming" && unit === "m") return "swim";
    if (unit === "km") return "distance";
    if (unit === "kg") return "strength";
    if (profile === "calisthenics") return "bodyweight";
    return "practice";
  }

  /** Pace (min/km) for runners and walkers, speed for wheels, skis and boats. */
  function paceMode(id) {
    return PACE_PROFILES.has(profileOf(id)) ? "pace" : "speed";
  }

  function hasElevation(id) {
    const p = profileOf(id);
    return ["trail", "mountain_endurance", "hiking", "cycling", "mtb", "glide"].includes(p) || /trail|rando|hiking|ski|vtt/i.test(id);
  }

  function all() {
    ensure();
    return Object.keys(root.SPORTS_CONFIG || {}).map((id) => ({ id, label: label(id), family: familyOf(id), form: formOf(id) }));
  }

  /** Ranked search: label start > word start > alias > contains, popular sports first on ties. */
  function search(query, { limit = 12 } = {}) {
    ensure();
    const q = norm(query);
    if (!q) return [];
    const expanded = new Set(QUERY_EXPANSIONS[q] || []);
    const results = [];
    for (const id of Object.keys(root.SPORTS_CONFIG)) {
      const lab = norm(label(id));
      const aliases = aliasesOf(id).map(norm);
      let score = 0;
      if (expanded.has(id)) score = Math.max(score, 120 - [...expanded].indexOf(id));
      if (lab === q) score = Math.max(score, 110);
      if (lab.startsWith(q)) score = Math.max(score, 90);
      if (lab.split(" ").some((w) => w.startsWith(q))) score = Math.max(score, 70);
      if (aliases.some((a) => a === q)) score = Math.max(score, 85);
      if (aliases.some((a) => a.startsWith(q) || a.split(" ").some((w) => w.startsWith(q)))) score = Math.max(score, 60);
      if (lab.includes(q)) score = Math.max(score, 40);
      if (!score) continue;
      const pop = POPULAR.indexOf(id);
      if (pop >= 0) score += 8 - Math.min(7, pop / 2);
      results.push({ id, label: label(id), family: familyOf(id), form: formOf(id), score });
    }
    return results.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "fr")).slice(0, limit);
  }

  const api = { FORMS, FAMILY_LABEL, FAMILY_ICON, POPULAR, norm, ensure, conf, label, aliasesOf, profileOf, unitOf, familyOf, formOf, paceMode, hasElevation, all, search };
  root.TitanSports = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
