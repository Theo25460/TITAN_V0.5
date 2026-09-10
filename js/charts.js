/* =========================================
   TITAN OS - MODULE GRAPHIQUES (V19.0)
   Gestion avancée des visualisations Chart.js
   ========================================= */

// --- CONFIGURATION GLOBALE CHART.JS ---
Chart.defaults.color = '#64748b';
Chart.defaults.font.family = "'Outfit', sans-serif";
Chart.defaults.scale.grid.color = 'rgba(255, 255, 255, 0.05)';
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.9)';
Chart.defaults.plugins.tooltip.borderColor = 'rgba(255, 255, 255, 0.1)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.titleFont = { family: "'Russo One', sans-serif", size: 13 };
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 8;

// --- PALETTE DE COULEURS ---
const COLORS = {
    force: '#ef4444',   // Rouge
    cardio: '#38bdf8',  // Bleu
    mental: '#a78bfa',  // Violet
    combat: '#9ee7ff',  // Jaune
    skill: '#4ade80',   // Vert
    team: '#7edcff',    // Bleu electrique
    bg: 'rgba(15, 23, 42, 0.8)'
};

/**
 * Initialise tous les graphiques de la page Stats
 * @param {Array} history - Historique des sessions
 */
function initCharts(history) {
    if (!history) return;

    renderRadar(history);
    renderWeeklyStacked(history);
    renderEvolution(history);
    renderDistribution(history);
}

// --- 1. RADAR : PROFIL ATHLÉTIQUE ---
function renderRadar(history) {
    const ctx = document.getElementById('radarChart')?.getContext('2d');
    if (!ctx) return;

    // Calcul des scores par catégorie
    const cats = { 'Force': 0, 'Cardio': 0, 'Combat': 0, 'Mental': 0, 'Technique': 0 };
    
    history.forEach(log => {
        let c = log.cat || 'cardio';
        // Mapping des catégories
        if (c === 'force') cats['Force'] += log.xp;
        else if (c === 'cardio' || c === 'endurance') cats['Cardio'] += log.xp;
        else if (c === 'combat') cats['Combat'] += log.xp;
        else if (c === 'mental') cats['Mental'] += log.xp;
        else if (c === 'skill' || c === 'team') cats['Technique'] += log.xp;
        else cats['Cardio'] += log.xp; // Default
    });

    // Création du graphique
    new Chart(ctx, {
        type: 'radar',
        data: {
            labels: Object.keys(cats),
            datasets: [{
                label: 'Profil XP',
                data: Object.values(cats),
                backgroundColor: 'rgba(56, 189, 248, 0.2)',
                borderColor: '#38bdf8',
                borderWidth: 2,
                pointBackgroundColor: '#0f172a',
                pointBorderColor: '#38bdf8',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#38bdf8'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: 'rgba(255,255,255,0.1)' },
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    pointLabels: {
                        color: '#cbd5e1',
                        font: { family: "'Russo One', sans-serif", size: 10 }
                    },
                    ticks: { display: false, backdropColor: 'transparent' }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

// --- 2. BARRES EMPILÉES : VOLUME HEBDOMADAIRE ---
function renderWeeklyStacked(history) {
    const ctx = document.getElementById('weeklyChart')?.getContext('2d');
    if (!ctx) return;

    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const labels = [];
    
    // Init datasets
    const dataForce = [], dataCardio = [], dataMental = [], dataAutre = [];
    
    const today = new Date();
    
    // Boucle sur les 7 derniers jours (de J-6 à J)
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        labels.push(days[d.getDay()]); // Nom du jour
        const dateStr = d.toLocaleDateString('fr-FR');
        
        // Filtre sessions du jour
        const sessions = history.filter(l => l.date === dateStr);
        
        // Somme par catégorie pour ce jour
        let f=0, c=0, m=0, a=0;
        sessions.forEach(s => {
            if(s.cat === 'force' || s.cat === 'combat') f += s.xp;
            else if(s.cat === 'cardio' || s.cat === 'endurance') c += s.xp;
            else if(s.cat === 'mental') m += s.xp;
            else a += s.xp;
        });
        
        dataForce.push(f);
        dataCardio.push(c);
        dataMental.push(m);
        dataAutre.push(a);
    }

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Force', data: dataForce, backgroundColor: COLORS.force, borderRadius: 2, barThickness: 12 },
                { label: 'Cardio', data: dataCardio, backgroundColor: COLORS.cardio, borderRadius: 2, barThickness: 12 },
                { label: 'Mental', data: dataMental, backgroundColor: COLORS.mental, borderRadius: 2, barThickness: 12 },
                { label: 'Tech/Autre', data: dataAutre, backgroundColor: COLORS.skill, borderRadius: 2, barThickness: 12 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { 
                    stacked: true, 
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 10 } }
                },
                y: { 
                    stacked: true, 
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { display: false } // Masque les valeurs Y pour épurer
                }
            },
            plugins: {
                legend: { 
                    position: 'bottom', 
                    labels: { boxWidth: 8, padding: 15, font: { size: 10 }, color: '#cbd5e1', usePointStyle: true } 
                },
                tooltip: { 
                    mode: 'index', 
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) { label += ': '; }
                            if (context.parsed.y !== null) { label += context.parsed.y + ' XP'; }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

// --- 3. LIGNE : ÉVOLUTION (30 JOURS AVEC DÉGRADÉ) ---
function renderEvolution(history) {
    const ctx = document.getElementById('evolutionChart')?.getContext('2d');
    if (!ctx) return;

    // Prépare les 30 derniers jours
    const last30Days = {};
    const today = new Date();
    for(let i=29; i>=0; i--) {
        const d = new Date(); 
        d.setDate(today.getDate()-i);
        // Clé format JJ/MM pour l'affichage
        const k = d.toLocaleDateString('fr-FR').slice(0,5); 
        last30Days[k] = 0;
    }

    // Remplit avec l'historique
    history.forEach(log => {
        // Supposant log.date format JJ/MM/AAAA
        const parts = log.date.split('/');
        if(parts.length === 3) {
            const k = parts[0] + '/' + parts[1];
            // Si la date est dans notre fenêtre de 30 jours
            if(last30Days.hasOwnProperty(k)) last30Days[k] += log.xp;
        }
    });

    const labels = Object.keys(last30Days);
    const data = Object.values(last30Days);

    // Création dégradé (Vert Matrix/Tech)
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(74, 222, 128, 0.4)'); // Vert clair opaque
    gradient.addColorStop(1, 'rgba(74, 222, 128, 0.0)'); // Transparent

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Volume Quotidien (XP)',
                data: data,
                borderColor: '#4ade80', // Vert fluo
                backgroundColor: gradient,
                borderWidth: 2,
                fill: true,
                tension: 0.4, // Courbe lisse
                pointRadius: 0, // Pas de points par défaut
                pointHoverRadius: 4,
                pointHoverBackgroundColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            scales: {
                x: { 
                    grid: { display: false }, 
                    ticks: { 
                        maxTicksLimit: 6, 
                        font: { size: 9 },
                        color: '#64748b'
                    } 
                },
                y: { display: false } // Pas d'axe Y visible
            },
            plugins: { legend: { display: false } }
        }
    });
}

// --- 4. DOUGHNUT : RÉPARTITION PAR SPORT (TOP 5) ---
function renderDistribution(history) {
    const ctx = document.getElementById('distribChart')?.getContext('2d');
    if (!ctx) return;

    const sports = {};
    history.forEach(h => {
        sports[h.sport] = (sports[h.sport] || 0) + 1; // Compte le nombre de séances
    });

    // Tri et Top 5
    const sorted = Object.entries(sports).sort((a,b) => b[1] - a[1]);
    const top = sorted.slice(0, 5);
    // Aggrégation des "Autres"
    const others = sorted.slice(5).reduce((acc, curr) => acc + curr[1], 0);

    const labels = top.map(x => x[0]);
    const data = top.map(x => x[1]);
    
    const bgColors = [COLORS.force, COLORS.cardio, COLORS.mental, COLORS.combat, COLORS.skill];

    if(others > 0) { 
        labels.push('Autres'); 
        data.push(others); 
        bgColors.push('#64748b'); // Gris pour autres
    }

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: bgColors,
                borderWidth: 0,
                hoverOffset: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    position: 'right', 
                    labels: { 
                        boxWidth: 8, 
                        color: '#cbd5e1', 
                        font: { size: 10 },
                        usePointStyle: true
                    } 
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = Math.round((value / total) * 100) + '%';
                            return `${label}: ${value} (${percentage})`;
                        }
                    }
                }
            },
            cutout: '75%' // Doughnut fin
        }
    });
}

// --- 5. STATS INSOLITES (FUN STATS) ---
window.renderFunStats = function(tKg, tKm, tMin, tH, tXp) {
    const container = document.getElementById('fun-container');
    // Vérification de sécurité : si le conteneur ou la DB n'existent pas, on arrête
    if (!container || typeof FUN_STATS_DB === 'undefined') return;

    container.innerHTML = "";
    let countItems = 0;

    // On parcourt chaque stat insolite définie dans data.js
    FUN_STATS_DB.forEach(item => {
        let userVal = 0;

        // On associe les données utilisateur au type de stat insolite
        if (item.type === 'weight') userVal = tKg;       // Poids total soulevé
        else if (item.type === 'dist') userVal = tKm;    // Distance totale parcourue
        else if (item.type === 'time') userVal = tMin;   // Temps total (en minutes)
        
        // Estimation calorique approximative si non calculée (ex: 1 XP = 0.5 cal pour le fun)
        else if (item.type === 'cal') userVal = tXp * 0.5; 
        
        // Pour la hauteur, on peut utiliser la distance comme proxy ou l'ignorer si pas de 'elevation'
        else if (item.type === 'height') userVal = tKm * 10; // Estimation fictive pour l'exemple

        // Calcul du nombre de fois que l'utilisateur a "réalisé" l'objet
        const ratio = userVal / item.val;

        // Si l'utilisateur a complété au moins 1 unité (ex: soulevé au moins 1 vache)
        if (ratio >= 1) {
            countItems++;
            const displayVal = Math.floor(ratio).toLocaleString(); // Enlève les virgules
            
            // Génération du HTML
            const html = `
            <div class="fun-card type-${item.type}">
                <div class="fun-icon-box"><i class="${item.icon}"></i></div>
                <div class="fun-val">${displayVal}</div>
                <div class="fun-label">${item.label}</div>
                <div class="fun-sub">équivalents</div>
            </div>`;
            
            container.innerHTML += html;
        }
    });

    // Si aucune stat n'est débloquée
    if (countItems === 0) {
        container.innerHTML = `
        <div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);">
            <i class="ri-flask-line" style="font-size:2rem; margin-bottom:10px; display:block;"></i>
            Données insuffisantes pour générer des anomalies.<br>
            <span style="font-size:0.8rem;">Continue l'entraînement pour débloquer le Labo.</span>
        </div>`;
    }
};
