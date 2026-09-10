/* =========================================
   TITAN OS - ARMURERIE & LOOT (V8.0 - LORE)
   ========================================= */

const ITEM_DB = [
    // --- ARMES (PROTOTYPES ISAAC) ---
    { id: 'w1', type: 'mainhand', name: "Marteau-Piqueur Mk.I", icon: "ri-hammer-line", rare: 1, stat: 'strength', val: 5, price: 100, desc: "Outil minier standard reconverti." },
    { id: 'w2', type: 'mainhand', name: "Lame Thermique", icon: "ri-fire-line", rare: 2, stat: 'strength', val: 12, price: 450, desc: "Tranche la glace et la chair." },
    { id: 'w3', type: 'mainhand', name: "Gantelets Hydrauliques", icon: "ri-hand-sanitizer-fill", rare: 2, stat: 'strength', val: 15, price: 600, desc: "Pour broyer les carapaces." },
    { id: 'w4', type: 'mainhand', name: "Fusil Harpon 'Viper'", icon: "ri-anchor-line", rare: 3, stat: 'agility', val: 25, price: 1200, desc: "Idéal contre les cibles rapides." },
    { id: 'w5', type: 'mainhand', name: "Broyeur Tectonique", icon: "ri-earthquake-fill", rare: 4, stat: 'strength', val: 40, price: 3000, desc: "Fait trembler le sol à l'impact." },
    { id: 'w6', type: 'mainhand', name: "LANCE DU CRÉATEUR", icon: "ri-sword-fill", rare: 5, stat: 'strength', val: 100, price: 9999, desc: "Arme mythique forgée dans le Noyau." },

    // --- BOUCLIERS & MODULES ---
    { id: 'o1', type: 'offhand', name: "Plaque d'Acier", icon: "ri-shield-line", rare: 1, stat: 'endurance', val: 5, price: 80, desc: "Une simple tôle de bunker." },
    { id: 'o2', type: 'offhand', name: "Générateur de Champ", icon: "ri-wireless-charging-line", rare: 2, stat: 'endurance', val: 10, price: 400, desc: "Dévie les petits projectiles." },
    { id: 'o3', type: 'offhand', name: "Module de Piratage", icon: "ri-qr-code-line", rare: 3, stat: 'mind', val: 15, price: 900, desc: "Pour interférer avec les Titans Méca." },
    { id: 'o4', type: 'offhand', name: "Noyau d'Aerus", icon: "ri-windy-line", rare: 4, stat: 'agility', val: 30, price: 2500, desc: "Cristal vibrant arraché au Boss." },

    // --- CASQUES (HUD & VISIÈRES) ---
    { id: 'h1', type: 'head', name: "Masque Respiratoire", icon: "ri-user-voice-line", rare: 1, stat: 'endurance', val: 3, price: 50, desc: "Indispensable hors du Bunker." },
    { id: 'h2', type: 'head', name: "Visière Tactique", icon: "ri-eye-2-line", rare: 2, stat: 'mind', val: 8, price: 300, desc: "Affiche les points faibles." },
    { id: 'h3', type: 'head', name: "Casque 'Krampus'", icon: "ri-mickey-line", rare: 3, stat: 'strength', val: 18, price: 1500, desc: "Cornes trophées du roi exilé." },

    // --- PLASTRONS (EXOSQUELETTES) ---
    { id: 'c1', type: 'chest', name: "Gilet Pare-Froid", icon: "ri-t-shirt-line", rare: 1, stat: 'endurance', val: 5, price: 100, desc: "Rembourré mais fragile." },
    { id: 'c2', type: 'chest', name: "Exo-Châssis Léger", icon: "ri-run-line", rare: 2, stat: 'agility', val: 12, price: 500, desc: "Servomoteurs de base." },
    { id: 'c3', type: 'chest', name: "Armure 'M.I.T.' Lourde", icon: "ri-robot-line", rare: 3, stat: 'endurance', val: 25, price: 2000, desc: "Le standard de l'Escadron Jupiter." },
    { id: 'c4', type: 'chest', name: "Cœur de Magma", icon: "ri-fire-fill", rare: 4, stat: 'strength', val: 40, price: 5000, desc: "Forgé dans la strate magmatique." },

    // --- JAMBIÈRES ---
    { id: 'l1', type: 'legs', name: "Pantalon Cargo", icon: "ri-menu-line", rare: 1, stat: 'agility', val: 2, price: 40, desc: "Poches pleines de boulons." },
    { id: 'l2', type: 'legs', name: "Vérins Hydrauliques", icon: "ri-rocket-2-line", rare: 2, stat: 'strength', val: 10, price: 400, desc: "Pour soulever des charges lourdes." },
    { id: 'l3', type: 'legs', name: "Plates en Chitine", icon: "ri-bug-line", rare: 3, stat: 'endurance', val: 20, price: 1200, desc: "Prélevées sur la Matriarche." },

    // --- BOTTES ---
    { id: 'f1', type: 'feet', name: "Bottes Magnétiques", icon: "ri-footprint-line", rare: 1, stat: 'endurance', val: 2, price: 60, desc: "Adhérence sur le métal." },
    { id: 'f2', type: 'feet', name: "Propulseurs de Saut", icon: "ri-flight-takeoff-line", rare: 2, stat: 'agility', val: 8, price: 350, desc: "Pour esquiver les ondes de choc." },
    
    // --- LOOT DE BOSS (Matériaux & Trophées) ---
    { id: 'mat1', type: 'material', name: "Poussière de Cristal", icon: "ri-blur-off-line", rare: 1, price: 50, desc: "Résidu d'Aerus." },
    { id: 'mat2', type: 'material', name: "Acier Corrompu", icon: "ri-contrast-drop-2-line", rare: 1, price: 75, desc: "Métal tordu par le Nouveau Monde." },
    { id: 'mat3', type: 'material', name: "Glande Bioluminescente", icon: "ri-lightbulb-flash-line", rare: 2, price: 150, desc: "Organe de Mob des profondeurs." },
    { id: 'mat4', type: 'material', name: "Processeur Neural", icon: "ri-cpu-line", rare: 3, price: 500, desc: "IA intacte d'un Titan Méca." },
    { id: 'mat5', type: 'material', name: "Sang de Titan", icon: "ri-drop-fill", rare: 4, price: 1000, desc: "Carburant ultra-puissant." }
];