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
  /** The family marks (filters, family tabs, the legend of the programme). Drawn in js/app/sport-icons.js. */
  const FAMILY_ICON = { endurance: "family-endurance", force: "family-force", technique: "family-technique", jeu: "family-jeu", mobilite: "family-mobilite" };

  /* Sport icons — docs/design/SPORT_ICONS.md.
     Every sport of the catalogue has its own glyph named after it: running → "sport-running", ski_touring → "sport-ski-touring"
     (tests/sport-icons.test.mjs checks that each one exists). The few sports that share a drawing are listed here, with the reason. */
  const ICON_SHARED = {
    lacrosse_sixes: "sport-lacrosse", // same stick, same ball: only the format of the game changes
    camogie: "sport-hurling", // the same hurley and sliotar, played by women
    freestyle_wrestling: "sport-wrestling-singlet", // the same singlet; the two styles differ by the holds allowed, not by anything visible
    greco_roman_wrestling: "sport-wrestling-singlet",
  };
  /** A sport the offline catalogue does not know yet (added on the server since the last snapshot): the closest drawing by its name,
      else the mark of its family. Order matters: the first rule that matches wins. */
  const ICON_RULES = [
    ["sport-wheelchair-tennis", /wheelchair.*tennis|tennis.*fauteuil/],
    ["sport-wheelchair-basketball", /wheelchair|fauteuil/],
    ["sport-table-tennis", /table.?tennis|ping.?pong/],
    ["sport-beach-tennis", /beach.?tennis/],
    ["sport-padel", /padel|paddle.?tennis/],
    ["sport-badminton", /badminton/],
    ["sport-squash", /squash/],
    ["sport-pickleball", /pickle/],
    ["sport-tennis", /tennis|racket|racquet|raquette/],
    ["sport-beach-volleyball", /beach.?volley/],
    ["sport-volleyball", /volley/],
    ["sport-beach-soccer", /beach.?soccer/],
    ["sport-futsal", /futsal|five|foot.?salle/],
    ["sport-american-football", /american.?football|football.?americain/],
    ["sport-football", /football|soccer|^foot/],
    ["sport-basketball", /basket/],
    ["sport-handball", /handball|hand/],
    ["sport-rugby", /rugby/],
    ["sport-ice-hockey", /ice.?hockey|hockey.?glace/],
    ["sport-field-hockey", /hockey/],
    ["sport-baseball", /baseball|softball/],
    ["sport-golf", /golf/],
    ["sport-boxing", /box|boxe|pugil/],
    ["sport-judo", /judo|jujitsu|ju.?jitsu/],
    ["sport-karate", /karate|kata/],
    ["sport-wrestling", /wrestl|lutte|grappl/],
    ["sport-fencing", /fencing|escrime|sabre|epee|fleuret/],
    ["sport-mma", /mma|combat|martial|fight/],
    ["sport-mountain-bike", /mtb|vtt|mountain.?bike|enduro|downhill/],
    ["sport-gravel", /gravel/],
    ["sport-bmx", /bmx/],
    ["sport-cycling-indoor", /indoor.?cycl|home.?trainer|zwift|rouleau/],
    ["sport-spinning", /spin|biking/],
    ["sport-cycling-road", /road.?cycl|route/],
    ["sport-cycling", /cycl|bike|velo/],
    ["sport-open-water-swimming", /open.?water|eau.?libre/],
    ["sport-swimming", /swim|natation|nage/],
    ["sport-surfing", /surf/],
    ["sport-kayak", /kayak|canoe|canoe|pirogue/],
    ["sport-rowing-machine", /rowing.?machine|ergo|rameur/],
    ["sport-rowing", /rowing|aviron/],
    ["sport-sailing", /sail|voile/],
    ["sport-paddle", /sup|paddle/],
    ["sport-diving", /diving|plongee|scuba/],
    ["sport-alpine-skiing", /alpine|ski.?alpin|downhill.?ski|piste/],
    ["sport-cross-country-skiing", /cross.?country|ski.?de.?fond|nordic.?ski/],
    ["sport-ski-touring", /touring|randonnee.?ski|skimo/],
    ["sport-snowboard", /snowboard/],
    ["sport-ice-skating", /skat|patin/],
    ["sport-roller", /roller|rollerblade|inline/],
    ["sport-skateboarding", /skateboard/],
    ["sport-bouldering", /boulder|bloc/],
    ["sport-ice-climbing", /ice.?climb|cascade/],
    ["sport-climbing", /climb|escalade|grimpe/],
    ["sport-alpinism", /alpin|mountaineer/],
    ["sport-trail", /trail|ultra/],
    ["sport-treadmill", /treadmill|tapis/],
    ["sport-running", /run|course|jog|marathon|footing/],
    ["sport-nordic-walk", /nordic.?walk|marche.?nordique/],
    ["sport-hiking", /hik|rando|trek/],
    ["sport-walking", /walk|marche/],
    ["sport-triathlon", /triathlon/],
    ["sport-hiit", /hiit|tabata|interval/],
    ["sport-crossfit", /crossfit|functional|wod/],
    ["sport-kettlebell", /kettlebell/],
    ["sport-weightlifting", /weightlift|halterophilie|olympic.?lift/],
    ["sport-powerlifting", /powerlift|deadlift|force.?athletique/],
    ["sport-muscu-gym", /gym|muscu|strength|weight|fitness/],
    ["sport-street-workout", /calisthen|street.?workout/],
    ["sport-pilates", /pilates/],
    ["sport-yoga", /yoga/],
    ["sport-stretching", /stretch|etirement|souplesse/],
    ["sport-yoga-mobility", /mobil/],
    ["sport-ballet", /ballet|classique/],
    ["sport-dance", /danc|danse/],
    ["sport-gymnastics", /gymnast/],
    ["sport-archery", /archery|tir a l arc/],
    ["sport-shooting", /shoot|tir/],
    ["sport-equestrian", /horse|equest|equitation|cheval/],
  ];
  function iconOf(id) {
    const key = String(id || "");
    if (ICON_SHARED[key]) return ICON_SHARED[key];
    if (snapshot().has(key)) return "sport-" + key.replace(/_/g, "-");
    const name = norm(key + " " + (conf(key)?.label || ""));
    for (const [icon, re] of ICON_RULES) if (re.test(name)) return icon;
    return FAMILY_ICON[familyOf(id)] || FAMILY_ICON.endurance;
  }

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
    for (const [id, label, unit, cat, profile, aliases, sort, fields] of root.TITAN_SPORTS_SNAPSHOT || [])
      snapshotIndex.set(id, { id, label, unit, cat, balanceProfile: profile, aliases: String(aliases || "").split("|").filter(Boolean), sortOrder: sort, extraFields: fields || [] });
    return snapshotIndex;
  }

  /** Fill missing sports in SPORTS_CONFIG from the snapshot, never overriding online entries. */
  function ensure() {
    root.SPORTS_CONFIG = root.SPORTS_CONFIG || {};
    let added = 0;
    for (const [id, s] of snapshot()) {
      if (root.SPORTS_CONFIG[id]) {
        if (root.SPORTS_CONFIG[id].catalogSource === 'fallback') Object.assign(root.SPORTS_CONFIG[id], {
          extraFields: JSON.parse(JSON.stringify(s.extraFields)), catalogSource: 'offline', offline: true,
        });
        continue;
      }
      root.SPORTS_CONFIG[id] = {
        label: s.label, name: s.label, unit: s.unit, cat: s.cat, balanceProfile: s.balanceProfile,
        extraFields: JSON.parse(JSON.stringify(s.extraFields)), aliases: s.aliases, sortOrder: s.sortOrder, offline: true, catalogSource: 'offline',
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

  /** The distance form asks for a positive elevation when the family climbs, or when the discipline's own catalogue measures it
      (orienteering, obstacle course, rogaining): the form owns that field, so it must not vanish from both places. */
  function hasElevation(id) {
    const p = profileOf(id);
    if (["trail", "mountain_endurance", "hiking", "cycling", "mtb", "glide"].includes(p) || /trail|rando|hiking|ski|vtt/i.test(id)) return true;
    return formOf(id) === "distance" && (conf(id)?.extraFields || []).some((f) => f && f.id === "elevation");
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

  const api = { FORMS, FAMILY_LABEL, FAMILY_ICON, ICON_SHARED, iconOf, POPULAR, norm, ensure, conf, label, aliasesOf, profileOf, unitOf, familyOf, formOf, paceMode, hasElevation, all, search };
  root.TitanSports = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
