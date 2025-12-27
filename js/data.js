/* =========================================
   TITAN OS - BASE DE DONNÉES (V7.0 - FINAL FIX)
   ========================================= */

// --- CONFIG GUILDE ---
const GUILD_CONFIG = {
    maxMembers: 10,
    resetPeriod: 7, 
    activeQuestsSlots: 5,
    bossBaseHp: 25000
};

// --- QUÊTES GUILDE ---
const GUILD_QUESTS_DB = [
    { id: 'g1', title: "Synergie", type: 'total_xp', target: 5000, dmg: 500, icon: "ri-flashlight-fill", desc: "5000 XP (Tous sports)" },
    { id: 'g2', title: "Assiduité", type: 'sessions_count', target: 20, dmg: 300, icon: "ri-calendar-check-fill", desc: "20 séances" },
    { id: 'g3', title: "Heures Sup'", type: 'duration_min', target: 1200, dmg: 400, icon: "ri-time-line", desc: "20h d'entraînement" },
    { id: 'g4', title: "Morning", type: 'morning_session', target: 5, dmg: 200, icon: "ri-sun-line", desc: "5 Séances < 10h" },
    { id: 'g5', title: "Night Squad", type: 'night_session', target: 5, dmg: 200, icon: "ri-moon-line", desc: "5 Séances > 20h" },
    { id: 'g6', title: "Intensité", type: 'high_rpe', target: 10, dmg: 350, icon: "ri-fire-fill", desc: "10 Séances RPE > 8" },
    { id: 'g7', title: "Polyvalence", type: 'unique_sports', target: 5, dmg: 250, icon: "ri-shuffle-line", desc: "5 sports différents" },
    { id: 'g8', title: "Cerveau", type: 'mind_xp', target: 1000, dmg: 300, icon: "ri-brain-line", desc: "1000 XP Mental" },
    { id: 'g9', title: "Recrue", type: 'invite', target: 1, dmg: 500, icon: "ri-user-add-line", desc: "Inviter 1 membre" },
    { id: 'g10', title: "Weekend", type: 'weekend_session', target: 10, dmg: 300, icon: "ri-sword-line", desc: "10 Séances Sam/Dim" }
];

// --- SPORTS ---
const SPORTS_CONFIG = {
    cycling_road: { label: "Vélo Route", unit: "km", xp: 5, stat: "endurance", cat: "cardio", icon: "ri-roadster-line", formType: "gps_full", max: 350, refSpeed: 24, extraFields: [] },
    cycling_mtb: { label: "VTT", unit: "km", xp: 8, stat: "agility", cat: "cardio", icon: "ri-riding-line", formType: "gps_full", max: 150, refSpeed: 14, extraFields: [] },
    cycling_indoor: { label: "Home Trainer", unit: "km", xp: 4, stat: "endurance", cat: "cardio", icon: "ri-home-wifi-line", formType: "gps_simple", max: 200, refSpeed: 28, extraFields: [] },
    running_road: { label: "Running", unit: "km", xp: 12, stat: "agility", cat: "cardio", icon: "ri-run-line", formType: "gps_full", max: 80, refSpeed: 9.5, extraFields: [] },
    running_trail: { label: "Trail", unit: "km", xp: 15, stat: "endurance", cat: "cardio", icon: "ri-mountain-line", formType: "gps_full", max: 170, refSpeed: 6.5, extraFields: [] },
    gym_bodybuilding: { label: "Muscu", unit: "kg", xp: 0.05, stat: "strength", cat: "force", icon: "ri-t-shirt-2-line", formType: "builder_gym", max: 50000, extraFields: [] },
    gym_calisthenics: { label: "Street Workout", unit: "reps", xp: 2, stat: "agility", cat: "force", icon: "ri-user-4-line", formType: "simple", max: 1000, extraFields: [] },
    swimming_pool: { label: "Natation", unit: "km", xp: 35, stat: "agility", cat: "cardio", icon: "ri-drop-line", formType: "gps_simple", max: 20, refSpeed: 2.0, extraFields: [] },
    team_football: { label: "Football", unit: "min", xp: 7, stat: "agility", cat: "cardio", icon: "ri-football-line", formType: "simple", max: 120, extraFields: [] },
    tennis: { label: "Tennis", unit: "min", xp: 7, stat: "agility", cat: "mental", icon: "ri-tennis-fill", formType: "simple", max: 240, extraFields: [] },
    hiking: { label: "Rando", unit: "km", xp: 6, stat: "endurance", cat: "endurance", icon: "ri-map-pin-user-line", formType: "gps_full", max: 60, refSpeed: 4.5, extraFields: [] }
};

// --- SANTÉ ---
const HEALTH_CONFIG = {
    sleep:    { label: "Sommeil",   unit: "h",   target: 8,     weight: 1.5, icon: "ri-moon-line" },
    water:    { label: "Eau",       unit: "L",   target: 2.5,   weight: 1.0, icon: "ri-drop-line" },
    steps:    { label: "Pas",       unit: "pas", target: 10000, weight: 1.0, icon: "ri-footprint-line" },
    nutrition:{ label: "Nutrition", unit: "/5",  target: 5,     weight: 1.2, icon: "ri-restaurant-line" },
    mind:     { label: "Mental",    unit: "/5",  target: 5,     weight: 0.8, icon: "ri-emotion-line" },
    stress:   { label: "Stress",    unit: "/5",  target: 1,     weight: 1.0, icon: "ri-pulse-line", inverse: true }
};

// --- ZONES (Avec Mobs) ---
const ZONES_DB = [
    { id: 1, name: "Le Bunker 101", max: 2000, mob_img: "mob_1.png" }, 
    { id: 2, name: "Ruines de Fer", max: 4000, mob_img: "mob_2.png" },
    { id: 3, name: "Métro Inondé", max: 6000, mob_img: "mob_3.png" }, 
    { id: 4, name: "Désert de Silicium", max: 8000, mob_img: "mob_4.png" },
    { id: 5, name: "Cimetière de Robots", max: 10000, mob_img: "mob_5.png" }, 
    { id: 6, name: "Forêt Bioluminescente", max: 12000, mob_img: "mob_6.png" },
    { id: 7, name: "Marais Toxique", max: 14000, mob_img: "mob_7.png" }, 
    { id: 8, name: "Cité Basse", max: 16000, mob_img: "mob_8.png" },
    { id: 9, name: "Quartier Rouge", max: 18000, mob_img: "mob_9.png" }, 
    { id: 10, name: "Autoroute Magnétique", max: 20000, mob_img: "mob_10.png" },
    { id: 11, name: "Usine de Drones", max: 25000, mob_img: "mob_11.png" }, 
    { id: 12, name: "Laboratoires Alpha", max: 30000, mob_img: "mob_12.png" },
    { id: 13, name: "Sommet des Vents", max: 35000, mob_img: "mob_13.png" }, 
    { id: 14, name: "Tour de Communication", max: 40000, mob_img: "mob_1.png" }, 
    { id: 15, name: "Plateforme Céleste", max: 45000, mob_img: "mob_2.png" }, 
    { id: 16, name: "Station Orbitale", max: 50000, mob_img: "mob_3.png" },
    { id: 17, name: "Base Lunaire", max: 60000, mob_img: "mob_4.png" }, 
    { id: 18, name: "Mines de Mars", max: 70000, mob_img: "mob_5.png" },
    { id: 19, name: "Anneaux de Saturne", max: 80000, mob_img: "mob_6.png" }, 
    { id: 20, name: "Nébuleuse Obscure", max: 90000, mob_img: "mob_7.png" },
    { id: 21, name: "Portail du Vide", max: 100000, mob_img: "mob_8.png" }, 
    { id: 22, name: "Dimension Miroir", max: 120000, mob_img: "mob_9.png" },
    { id: 23, name: "Le Noyau Système", max: 140000, mob_img: "mob_10.png" }, 
    { id: 24, name: "Labyrinthe Mental", max: 160000, mob_img: "mob_11.png" },
    { id: 25, name: "Barrière Psychique", max: 180000, mob_img: "mob_12.png" }, 
    { id: 26, name: "Trône de Glace", max: 200000, mob_img: "mob_13.png" },
    { id: 27, name: "Forge des Étoiles", max: 250000, mob_img: "mob_1.png" }, 
    { id: 28, name: "Horizon des Événements", max: 300000, mob_img: "mob_2.png" },
    { id: 29, name: "Singularité", max: 400000, mob_img: "mob_3.png" }, 
    { id: 30, name: "TITAN PRIME", max: 500000, mob_img: "mob_4.png" }
];

// --- BOSS (24 Boss) ---
const BOSS_DB = [
    { id: 0, name: "GIGAS - Le Gardien", baseHp: 2000, weak: "Force", img: "boss_1.png", desc: "Gardien du Bunker." },
    { id: 1, name: "Viper - Assassin", baseHp: 3000, weak: "Agilité", img: "boss_2.png", desc: "Rapide et létale." },
    { id: 2, name: "Le Molosse Cyber", baseHp: 3500, weak: "Force", img: "boss_3.png", desc: "Une bête de métal." },
    { id: 3, name: "L'Esprit Corrompu", baseHp: 4500, weak: "Mental", img: "boss_4.png", desc: "Entité psychique." },
    { id: 4, name: "Colosse de Pierre", baseHp: 6000, weak: "Endurance", img: "boss_5.png", desc: "Montagne vivante." },
    { id: 5, name: "Reine des Essaims", baseHp: 7500, weak: "Agilité", img: "boss_6.png", desc: "Contrôle les drones." },
    { id: 6, name: "Général Chrome", baseHp: 9000, weak: "Force", img: "boss_7.png", desc: "Vétéran de guerre." },
    { id: 7, name: "Ombre du Néant", baseHp: 11000, weak: "Mental", img: "boss_8.png", desc: "Frappe des ténèbres." },
    { id: 8, name: "Hydre Mécanique", baseHp: 13500, weak: "Endurance", img: "boss_9.png", desc: "Têtes multiples." },
    { id: 9, name: "Le Juge Suprême", baseHp: 15000, weak: "Mental", img: "boss_10.png", desc: "Pèse votre âme." },
    { id: 10, name: "Dragon Solaire", baseHp: 18000, weak: "Agilité", img: "boss_11.png", desc: "Chaleur intense." },
    { id: 11, name: "Sentinelle Omega", baseHp: 22000, weak: "Mental", img: "boss_12.png", desc: "Voit tout." },
    { id: 12, name: "Le Dévoreur", baseHp: 30000, weak: "Force", img: "boss_13.png", desc: "Mange la matière." },
    { id: 13, name: "Avatar du Chaos", baseHp: 40000, weak: "Endurance", img: "boss_14.png", desc: "Entropie incarnée." },
    { id: 14, name: "TITAN PRIMORDIAL", baseHp: 75000, weak: "Tout", img: "boss_15.png", desc: "L'Origine." },
    { id: 15, name: "Spectre Quantique", baseHp: 85000, weak: "Mental", img: "boss_16.png", desc: "Instable." },
    { id: 16, name: "Chevalier Plasma", baseHp: 95000, weak: "Force", img: "boss_17.png", desc: "Armure brûlante." },
    { id: 17, name: "Reine des Glaces", baseHp: 105000, weak: "Endurance", img: "boss_18.png", desc: "Froid absolu." },
    { id: 18, name: "Golem de Lave", baseHp: 120000, weak: "Agilité", img: "boss_19.png", desc: "Fusion nucléaire." },
    { id: 19, name: "L'Oublié", baseHp: 140000, weak: "Mental", img: "boss_20.png", desc: "Glitch système." },
    { id: 20, name: "Valkyrie 2.0", baseHp: 160000, weak: "Agilité", img: "boss_21.png", desc: "Vitesse lumière." },
    { id: 21, name: "Kraken Céleste", baseHp: 180000, weak: "Force", img: "boss_22.png", desc: "Monstre orbital." },
    { id: 22, name: "Thanatos", baseHp: 200000, weak: "Tout", img: "boss_23.png", desc: "La Mort Digitale." },
    { id: 23, name: "LE CRÉATEUR", baseHp: 500000, weak: "Tout", img: "boss_24.png", desc: "Admin Système." }
];

// --- TALENTS (Structure OBJET pour éviter les bugs) ---
const TALENT_TREE = {
    'str_1': { id: 'str_1', name: "Fondations", icon: "ri-home-8-fill", desc: "+5% Force", cost: 1, stat: 'strength', bonus: 0.05, prev: null, path: 'titan' },
    'str_2': { id: 'str_2', name: "Peau de Fer", icon: "ri-shield-fill", desc: "+10% Défense", cost: 1, stat: 'endurance', bonus: 0.10, prev: 'str_1', path: 'titan' },
    'str_3': { id: 'str_3', name: "Force Brute", icon: "ri-hammer-fill", desc: "+10% Force", cost: 2, stat: 'strength', bonus: 0.10, prev: 'str_2', path: 'titan' },
    'str_4': { id: 'str_4', name: "Adrénaline", icon: "ri-pulse-fill", desc: "+15% XP Muscu", cost: 3, stat: 'strength', bonus: 0.15, prev: 'str_3', path: 'titan' },
    'str_5': { id: 'str_5', name: "GIGANTISME", icon: "ri-vip-crown-fill", desc: "XP Force x1.5", cost: 5, stat: 'strength', bonus: 0.50, prev: 'str_4', path: 'titan', type: 'major' },

    'agi_1': { id: 'agi_1', name: "Échauffement", icon: "ri-run-line", desc: "+5% Agilité", cost: 1, stat: 'agility', bonus: 0.05, prev: null, path: 'spectre' },
    'agi_2': { id: 'agi_2', name: "Souffle Infini", icon: "ri-windy-fill", desc: "+10% Endurance", cost: 1, stat: 'endurance', bonus: 0.10, prev: 'agi_1', path: 'spectre' },
    'agi_3': { id: 'agi_3', name: "Foulée Rapide", icon: "ri-speed-line", desc: "+10% Agilité", cost: 2, stat: 'agility', bonus: 0.10, prev: 'agi_2', path: 'spectre' },
    'agi_4': { id: 'agi_4', name: "Flux Flow", icon: "ri-blur-off-line", desc: "+15% XP Cardio", cost: 3, stat: 'agility', bonus: 0.15, prev: 'agi_3', path: 'spectre' },
    'agi_5': { id: 'agi_5', name: "SONIC BOOM", icon: "ri-flashlight-fill", desc: "XP Cardio x1.5", cost: 5, stat: 'agility', bonus: 0.50, prev: 'agi_4', path: 'spectre', type: 'major' },

    'int_1': { id: 'int_1', name: "Focus", icon: "ri-eye-2-line", desc: "+5% Mental", cost: 1, stat: 'mind', bonus: 0.05, prev: null, path: 'operator' },
    'int_2': { id: 'int_2', name: "Optimisation", icon: "ri-settings-4-fill", desc: "+10% Crédits", cost: 1, stat: 'gold', bonus: 0.10, prev: 'int_1', path: 'operator' },
    'int_3': { id: 'int_3', name: "Discipline", icon: "ri-medal-2-fill", desc: "+10% Mental", cost: 2, stat: 'mind', bonus: 0.10, prev: 'int_2', path: 'operator' },
    'int_4': { id: 'int_4', name: "Érudition", icon: "ri-book-mark-fill", desc: "+15% XP Mental", cost: 3, stat: 'mind', bonus: 0.15, prev: 'int_3', path: 'operator' },
    'int_5': { id: 'int_5', name: "CORTEX", icon: "ri-mind-map", desc: "XP Mental x1.5", cost: 5, stat: 'mind', bonus: 0.50, prev: 'int_4', path: 'operator', type: 'major' }
};

const TALENT_PATHS = [
    { id: 'titan', name: "TITAN", subtitle: "Force & Tanking", color: "#ef4444", icon: "ri-sword-fill" },
    { id: 'spectre', name: "SPECTRE", subtitle: "Vitesse & Cardio", color: "#38bdf8", icon: "ri-run-line" },
    { id: 'operator', name: "OPERATOR", subtitle: "Savoir & Fortune", color: "#facc15", icon: "ri-book-open-line" }
];

const ACHIEVEMENTS_DB = [
    { id: 'sess_1', title: "Premier Pas", desc: "1 séance validée", icon: "ri-flag-fill", target: 1, type: "sessions" },
    { id: 'sess_10', title: "La Routine", desc: "10 séances validées", icon: "ri-refresh-line", target: 10, type: "sessions" },
    { id: 'lvl_5', title: "Novice", desc: "Niveau 5", icon: "ri-number-5", target: 5, type: "level" },
    { id: 'gold_1k', title: "Épargne", desc: "1000 Crédits", icon: "ri-coin-line", target: 1000, type: "credits" }
];

// Anti-crash: Mobs de secours si main.js les cherche
const MOBS_DB = [];
const QUEST_TEMPLATES = [
    { diff: 1, desc: "Petite Séance", type: "session", target: 1, reward: 20 },
    { diff: 2, desc: "Gros Volume", type: "vol_kg", target: 5000, reward: 80 }
];