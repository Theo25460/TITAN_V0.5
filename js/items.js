const ITEM_DB = [
    // --- TÊTE (Head) ---
    { id: 101, name: "Visière Tactique", type: "head", stat: "mind", val: 2, rare: 1, price: 50, icon: "ri-eye-2-line", desc: "Analyse basique." },
    { id: 102, name: "Casque Lourd", type: "head", stat: "endurance", val: 5, rare: 2, price: 150, icon: "ri-hard-hat-line", desc: "Protection certifiée." },
    { id: 103, name: "Couronne Royale", type: "head", stat: "strength", val: 10, rare: 3, price: 500, icon: "ri-vip-crown-line", desc: "Pour les rois de la fonte." },
    { id: 104, name: "Capuche d'Ombre", type: "head", stat: "agility", val: 4, rare: 2, price: 120, icon: "ri-ghost-line", desc: "Discrétion maximale." },
    { id: 105, name: "Neuro-Casque", type: "head", stat: "mind", val: 12, rare: 3, price: 600, icon: "ri-brain-line", desc: "Interface neuronale directe." },

    // --- TORSE (Chest) ---
    { id: 201, name: "T-shirt Coton", type: "chest", stat: "agility", val: 1, rare: 1, price: 20, icon: "ri-t-shirt-line", desc: "Confortable." },
    { id: 202, name: "Veste Lestée", type: "chest", stat: "strength", val: 8, rare: 2, price: 200, icon: "ri-shield-user-line", desc: "+10kg permanent." },
    { id: 203, name: "Armure Nano", type: "chest", stat: "endurance", val: 15, rare: 3, price: 800, icon: "ri-shield-star-line", desc: "Technologie militaire." },
    { id: 204, name: "Débardeur Gym", type: "chest", stat: "strength", val: 3, rare: 1, price: 40, icon: "ri-t-shirt-2-line", desc: "Pour les guns." },
    { id: 205, name: "Veste Cyberpunk", type: "chest", stat: "agility", val: 14, rare: 3, price: 750, icon: "ri-contrast-drop-line", desc: "Style néon." },

    // --- MAINS (Hands) ---
    { id: 301, name: "Gants de Boxe", type: "hands", stat: "agility", val: 3, rare: 1, price: 60, icon: "ri-boxing-line", desc: "Frappe sec." },
    { id: 302, name: "Sangles Tirage", type: "hands", stat: "strength", val: 5, rare: 2, price: 150, icon: "ri-hand-coin-line", desc: "Grip infini." },
    { id: 303, name: "Gantelet Infini", type: "hands", stat: "mind", val: 20, rare: 3, price: 2000, icon: "ri-magic-line", desc: "Claquement de doigts." },
    { id: 304, name: "Mitaines Tactiques", type: "hands", stat: "endurance", val: 4, rare: 1, price: 50, icon: "ri-hand-heart-line", desc: "Anti-ampoules." },

    // --- JAMBES (Legs) ---
    { id: 401, name: "Short Running", type: "legs", stat: "agility", val: 2, rare: 1, price: 40, icon: "ri-run-line", desc: "Aérodynamique." },
    { id: 402, name: "Legging Comp.", type: "legs", stat: "endurance", val: 6, rare: 2, price: 180, icon: "ri-layout-column-line", desc: "Circulation sanguine." },
    { id: 403, name: "Exosquelette", type: "legs", stat: "strength", val: 15, rare: 3, price: 1000, icon: "ri-robot-line", desc: "Jambes bioniques." },

    // --- PIEDS (Feet) ---
    { id: 501, name: "Baskets Usées", type: "feet", stat: "agility", val: 1, rare: 1, price: 10, icon: "ri-footprint-line", desc: "Ont vu du pays." },
    { id: 502, name: "Bottes Rando", type: "feet", stat: "endurance", val: 5, rare: 2, price: 140, icon: "ri-guide-line", desc: "Tout terrain." },
    { id: 503, name: "Air Propulseurs", type: "feet", stat: "agility", val: 12, rare: 3, price: 900, icon: "ri-rocket-line", desc: "Ça vole presque." },

    // --- ARME (Main Hand) ---
    { id: 601, name: "Haltère 10kg", type: "mainhand", stat: "strength", val: 5, rare: 1, price: 80, icon: "ri-weight-line", desc: "Classique." },
    { id: 602, name: "Kettlebell", type: "mainhand", stat: "endurance", val: 8, rare: 2, price: 200, icon: "ri-notification-badge-line", desc: "Dynamique." },
    { id: 603, name: "Épée d'Obsidienne", type: "mainhand", stat: "strength", val: 15, rare: 3, price: 1200, icon: "ri-sword-fill", desc: "Tranchant absolu." },
    { id: 604, name: "Sabre Laser", type: "mainhand", stat: "mind", val: 12, rare: 3, price: 1100, icon: "ri-flashlight-line", desc: "Arme noble." },

    // --- OFFHAND ---
    { id: 701, name: "Montre Connectée", type: "offhand", stat: "mind", val: 3, rare: 1, price: 100, icon: "ri-watch-line", desc: "Bip Bip." },
    { id: 702, name: "Gourde Protéine", type: "offhand", stat: "strength", val: 4, rare: 1, price: 60, icon: "ri-cup-line", desc: "Shaker." },
    { id: 703, name: "Bouclier Énergétique", type: "offhand", stat: "endurance", val: 10, rare: 3, price: 850, icon: "ri-shield-flash-line", desc: "Impénétrable." },
    { id: 704, name: "Tablette de Savoir", type: "offhand", stat: "mind", val: 8, rare: 2, price: 300, icon: "ri-book-read-line", desc: "Connaissance infinie." }
];
