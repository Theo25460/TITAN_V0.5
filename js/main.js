/* =========================================
   TITAN OS - NOYAU SYSTÈME (V6.0 - OLYMPIC UPDATE)
   ========================================= */

const SUPABASE_URL = 'https://oubmftfufwwzwpgvrcag.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91Ym1mdGZ1Znd3endwZ3ZyY2FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxOTMyODAsImV4cCI6MjA3OTc2OTI4MH0.sjv09LUsG2ALY7AsJbA-0f8SB6YCDYLIQEiqcQxdfrU';

const supabase = (window.supabase) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const STATE_KEY = 'titan_os_v5_final';

let state = null;
let mapInstance = null;
let tempGpxData = null;

let GAME_SETTINGS = {
    global_xp_mult: 1.0,
    global_gold_mult: 1.0,
    lootbox_price: 200,
    sell_ratio: 0.5,
    maintenance_mode: false,
    maintenance_msg: "Maintenance...",
    base_boss_hp: 25000,
    version: "6.0.0"
};

// --- INIT ---
async function initSystem() {
    try {
        document.body.style.opacity = '0';
        document.body.style.transition = 'opacity 0.4s ease-out';
        
        loadState();
        injectSystemModal();
        await loadDynamicSettings();

        injectSidebar();
        injectMobileHeader();
        updateGlobalUI();

        await syncWithSupabase();
        checkDailyReset();

        injectSidebar();
        injectMobileHeader();
        updateGlobalUI();

        requestAnimationFrame(() => { document.body.style.opacity = '1'; });

        window.alert = function(message) {
            let type = 'info'; let title = 'TITAN OS';
            if(message.includes('ERREUR') || message.includes('Impossible') || message.includes('⛔')) { type = 'danger'; title = 'ERREUR'; }
            else if(message.includes('VALIDÉE') || message.includes('VICTOIRE')) { type = 'success'; title = 'SUCCÈS'; }
            else if(message.includes('NIVEAU') || message.includes('Loot') || message.includes('XP DOUBLÉE')) { type = 'levelup'; title = 'GAIN'; }
            showTitanModal(title, message, type);
        };

        window.addEventListener('storage', (e) => { if (e.key === STATE_KEY) { loadState(); updateGlobalUI(); } });
        console.log("TITAN OS V6.0 READY (OLYMPIC UPDATE).");

    } catch (e) {
        if(e.message === "MAINTENANCE") return;
        console.error(e);
        document.body.style.opacity = '1';
    }
}

async function loadDynamicSettings() {
    if(!supabase) return;
    const { data } = await supabase.from('game_settings').select('*');
    if (data) {
        data.forEach(s => {
            let val = s.value;
            if (!isNaN(val) && val.trim() !== "") val = parseFloat(val);
            if (val === 'true') val = true;
            if (val === 'false') val = false;
            GAME_SETTINGS[s.key] = val;
        });
    }
}

async function syncWithSupabase() {
    if (!supabase) return;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            let { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
            
            if (!profile) {
                const newProfile = { id: session.user.id, username: session.user.user_metadata.full_name || "Recrue", level: 1, xp: 0, credits: 200, is_admin: false };
                await supabase.from('profiles').insert(newProfile);
                profile = newProfile;
            }

            state.user.id = profile.id;
            state.user.name = profile.username;
            state.user.email = session.user.email;
            state.user.level = profile.level;
            state.user.friendCode = profile.friend_code; 
            state.user.xp = profile.xp || 0;
            state.user.credits = profile.credits || 0;
            state.user.isAdmin = (profile.is_admin === true);
            state.user.isGuest = false;

            saveState();
        }
    } catch(e) { console.warn("Sync warning:", e); }
}

// --- HELPER : TALENTS BONUS ---
function getTalentBonus(effectType) {
    if(!state || !state.user.unlockedTalents) return 0;
    let total = 0;
    if(typeof TALENT_TREE === 'undefined') return 0;

    state.user.unlockedTalents.forEach(id => {
        const t = TALENT_TREE.find(x => x.id === id);
        if(t && t.effect.type === effectType) {
            total += t.effect.val;
        }
    });
    return total;
}

// --- CORE : GESTION DES NIVEAUX ---
function checkLevelUp() {
    if (!state) return;

    let leveledUp = false;
    let xpNeeded = state.user.level * 1000;

    while (state.user.xp >= xpNeeded) {
        state.user.xp -= xpNeeded; 
        state.user.level++;        
        leveledUp = true;
        xpNeeded = state.user.level * 1000;
    }

    if (leveledUp) {
        saveState();
        showLevelUpAnim(); // [JUICE] Animation Level Up
        alert(`🎉 NIVEAU ${state.user.level} ATTEINT !\nLa limite d'XP augmente.`);
        injectSidebar(); 
        injectMobileHeader();
    }
}

// --- CORE : ENREGISTREMENT ACTIVITÉ (AVEC COHÉRENCE D'EFFORT) ---
async function logActivity(sportKey, metrics) {
    if (typeof SPORTS_CONFIG === 'undefined') return alert("ERREUR CONFIG");
    const config = SPORTS_CONFIG[sportKey];

    // Vérification Limite
    if(config.max && metrics.val1 > config.max) return alert(`⛔ Limite : ${config.max} ${config.unit}.`);

    // 1. CALCUL XP BASE
    let generatedPower = Math.ceil(metrics.val1 * config.xp);
    if(config.formType === 'builder_gym') { 
        // Pour la muscu, on reste sur le volume (Tonnage)
        let vol=0; 
        metrics.exercises.forEach(ex => vol += ex.weight * ex.reps * ex.sets); 
        generatedPower = Math.ceil(vol * 0.10); 
    }

    // 2. COHÉRENCE & DIFFICULTÉ (Calculateur Olympique)
    let intensityMult = 1.0;
    let speedMsg = "";

    // Cas Cardio avec Distance (val1) et Temps (metrics.duration en min)
    if(config.cat === 'cardio' && config.unit === 'km' && metrics.duration > 0 && config.refSpeed) {
        const durationHours = metrics.duration / 60;
        const actualSpeed = metrics.val1 / durationHours; // km / h
        
        // Ratio de performance : Vitesse Réelle / Vitesse Référence
        let speedRatio = actualSpeed / config.refSpeed;
        
        // On lisse le ratio pour ne pas punir trop sévèrement ou récompenser de façon absurde
        if(speedRatio < 0.8) speedRatio = 0.8; 
        if(speedRatio > 1.5) speedRatio = 1.5;

        intensityMult = speedRatio;
        
        if(intensityMult > 1.05) speedMsg = `\n🚀 Rythme soutenu (x${intensityMult.toFixed(2)})`;
        else if(intensityMult < 0.95) speedMsg = `\n🐌 Rythme tranquille (x${intensityMult.toFixed(2)})`;
    }

    // Cas Dénivelé (Bonus Universel)
    if(metrics.elevation > 0) {
        // +10% XP tous les 100m de D+ (limité à x2)
        const elevBonus = Math.min((metrics.elevation / 100) * 0.1, 1.0);
        intensityMult += elevBonus;
        speedMsg += `\n⛰️ Bonus Dénivelé (+${Math.round(elevBonus*100)}%)`;
    }

    // Application du multiplicateur d'intensité
    generatedPower = Math.floor(generatedPower * intensityMult);


    // 3. MULTIPLICATEURS GLOBAUX & TALENTS
    if (GAME_SETTINGS.global_xp_mult && GAME_SETTINGS.global_xp_mult !== 1.0) {
        generatedPower = Math.floor(generatedPower * GAME_SETTINGS.global_xp_mult);
    }

    const xpBonusPct = getTalentBonus('xp_mult'); 
    if (xpBonusPct > 0) {
        generatedPower = Math.floor(generatedPower * (1 + xpBonusPct));
    }

    const luckyChance = getTalentBonus('lucky_xp'); 
    let isLucky = false;
    if (luckyChance > 0 && Math.random() < luckyChance) {
        generatedPower = generatedPower * 2;
        isLucky = true;
    }

    let isCrit = false;
    if (typeof BOSS_DB !== 'undefined') {
        const bossWeakness = BOSS_DB[state.game.boss.skinId || 0].weak.toLowerCase();
        if (config.cat.toLowerCase() === bossWeakness) { 
            isCrit = true; 
            generatedPower = Math.floor(generatedPower * 1.5); 
        }
    }

    // 4. CRÉDITS & SAUVEGARDE
    let creditGain = Math.ceil(generatedPower/10);
    if (GAME_SETTINGS.global_gold_mult && GAME_SETTINGS.global_gold_mult !== 1.0) creditGain = Math.ceil(creditGain * GAME_SETTINGS.global_gold_mult);
    const goldBonusPct = getTalentBonus('gold_mult');
    if (goldBonusPct > 0) creditGain = Math.floor(creditGain * (1 + goldBonusPct));

    state.user.xp += generatedPower;
    state.user.credits += creditGain;
    
    // Feedback Visuel
    triggerXpEffect('sidebar-xp-bar');
    checkLevelUp();
    
    // Création du Log
    const newLog = { 
        id: Date.now(), 
        date: new Date().toISOString().split('T')[0], 
        sport: config.label, 
        sportKey, 
        icon: config.icon, 
        cat: config.cat, 
        unit: config.unit, 
        xp: generatedPower, 
        value: metrics.val1 || 0, 
        details: "Session", 
        extended: metrics 
    };
    if(tempGpxData) newLog.extended.gpxData = tempGpxData;
    state.history.unshift(newLog);
    state.game.storedDmg += generatedPower;
    saveState();

    // Sync Cloud
    if (!state.user.isGuest && supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            const { error: actError } = await supabase.from('activities').insert({
                user_id: session.user.id,
                sport_key: sportKey,
                value: parseFloat(metrics.val1 || 0),
                xp_earned: generatedPower,
                details: metrics,
                date: new Date().toISOString().split('T')[0],
                duration: metrics.duration ? parseInt(metrics.duration) : null
            });

            if(actError) console.error("Erreur Activity:", actError);

            await supabase.from('profiles').update({ 
                xp: state.user.xp, 
                credits: state.user.credits,
                level: state.user.level 
            }).eq('id', session.user.id);
        }
    }

    let msg = `SÉANCE VALIDÉE !\n+${generatedPower} XP\n+${creditGain} CRÉDITS`;
    msg += speedMsg; // Affiche le bonus/malus vitesse
    if(isCrit) msg += "\n⚡ CRITIQUE (Faiblesse Boss) !";
    if(xpBonusPct > 0) msg += `\n(Bonus Talent: +${Math.round(xpBonusPct*100)}%)`;
    if(isLucky) msg += `\n🍀 CHANCE : XP DOUBLÉE !`;
    alert(msg);

    if(typeof updateCapacitorUI === 'function') updateCapacitorUI();
    try { if(typeof window.checkGuildQuestProgress === 'function') { window.checkGuildQuestProgress(newLog); saveState(); } } catch(e) {}
    tempGpxData = null;
    
    updateGlobalUI();
    injectMobileHeader(); 
}

// --- UI & NAVIGATION ---
function injectSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar || !state) return;
    const path = window.location.pathname;
    const page = path.split("/").pop().split("?")[0] || 'index.html';
    const isActive = (target) => { if(target === 'index.html' && (page === '' || page === 'index')) return true; return page === target; };
    const user = state.user || {};
    const xpNeeded = user.level * 1000; 
    const xpPercent = Math.min((user.xp / xpNeeded) * 100, 100);
    const hour = new Date().getHours();
    const greeting = (hour >= 5 && hour < 18) ? "Bonjour" : "Bonsoir";

    const adminLink = (user.isAdmin === true) ? `<div class="nav-category" style="color:#ef4444; margin-top:20px;">ZONE RESTREINTE</div><a href="admin.html" class="nav-link ${isActive('admin.html') ? 'active' : ''}" style="color:#fca5a5;"><i class="ri-shield-keyhole-fill"></i> ADMIN PANEL</a>` : '';

    sidebar.innerHTML = `
        <div class="brand"><img src="./images/logo.png" class="brand-logo" alt="Titan OS"><div class="brand-meta"><span class="brand-title">TITAN OS</span><span class="brand-version">v${GAME_SETTINGS.version}</span></div></div>
        <div class="profile-widget" onclick="window.location.href='profile.html'">
            <div class="avatar-circle"><i class="ri-user-3-fill"></i></div>
            <div class="profile-info">
                <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:2px;">${greeting},</div>
                <div class="profile-name" id="sidebar-name">${user.name || 'Recrue'}</div>
                <div style="width:100%; height:4px; background:rgba(255,255,255,0.1); border-radius:4px; margin-top:6px; overflow:hidden;">
                    <div id="sidebar-xp-bar" style="height:100%; background:var(--primary); width:${xpPercent}%;"></div>
                </div>
                <div style="font-size:0.7rem; color:var(--text-muted); margin-top:4px; display:flex; justify-content:space-between;"><span>Niveau ${user.level || 1}</span><span>${Math.floor(xpPercent)}%</span></div>
            </div>
        </div>
        <div class="nav-category">ACTION</div>
        <a href="index.html" class="nav-link ${isActive('index.html') ? 'active' : ''}"><i class="ri-home-5-line"></i> Q.G.</a>
        <a href="training.html" class="nav-link ${isActive('training.html') ? 'active' : ''}"><i class="ri-flashlight-fill"></i> S'ENTRAÎNER</a>
        <div class="nav-category">PROGRESSION</div>
        <a href="activities.html" class="nav-link ${isActive('activities.html') ? 'active' : ''}"><i class="ri-book-read-line"></i> JOURNAL</a>
        <a href="adventure.html" class="nav-link ${isActive('adventure.html') ? 'active' : ''}"><i class="ri-sword-line"></i> AVENTURE</a>
        <a href="talents.html" class="nav-link ${isActive('talents.html') ? 'active' : ''}"><i class="ri-mind-map"></i> TALENTS</a>
        <div class="nav-category">SOCIAL</div>
        <a href="social.html" class="nav-link ${isActive('social.html') ? 'active' : ''}"><i class="ri-team-line"></i> GUILDES & ALLIÉS</a>
        <div class="nav-category">SYSTÈME</div>
        <a href="profile.html" class="nav-link ${isActive('profile.html') ? 'active' : ''}"><i class="ri-settings-4-line"></i> MON PROFIL</a>
        ${adminLink}
    `;
    
    const sbName = document.getElementById('sidebar-name');
    if (sbName) sbName.innerText = user.name || 'Recrue';
}

function injectMobileHeader() {
    if (document.getElementById('mobileName') && state) {
        document.getElementById('mobileName').innerText = state.user.name;
        document.getElementById('mobileLvl').innerText = state.user.level;
        document.getElementById('mobileCredits').innerText = state.user.credits;
        return;
    }
    const mainContent = document.querySelector('.main-content'); if (!mainContent || !state) return;
    const headerHTML = `
        <div class="mobile-user-bar">
            <div style="display:flex; align-items:center; justify-content:space-between; width:100%; background:rgba(255,255,255,0.05); padding:15px; border-radius:16px; border:1px solid rgba(255,255,255,0.1); margin-bottom:20px;">
                <div style="display:flex; align-items:center; gap:12px;" onclick="window.location.href='profile.html'">
                    <div style="width:40px; height:40px; background:var(--bg-panel); border-radius:50%; border:2px solid var(--accent); display:flex; align-items:center; justify-content:center; color:var(--accent);"><i class="ri-user-3-fill"></i></div>
                    <div>
                        <div style="font-weight:800; font-size:1rem; color:#fff;" id="mobileName">${state.user.name}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">Niv. <span id="mobileLvl">${state.user.level}</span></div>
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:800; color:var(--gold); font-size:1rem;"><span id="mobileCredits">${state.user.credits}</span> $</div>
                    <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Crédits</div>
                </div>
            </div>
        </div>`;
    mainContent.insertAdjacentHTML('afterbegin', headerHTML);
}

// --- BOUTIQUE / ITEMS / MISC ---
function loadState() {
    const stored = localStorage.getItem(STATE_KEY);
    if (stored) {
        state = JSON.parse(stored);
        if(!state.inventory) state.inventory = [];
        if(!state.equipped) state.equipped = {};
        if(!state.user.achievements) state.user.achievements = [];
        if(state.user.isGuest === undefined) state.user.isGuest = true;
        if(!state.game.storedDmg) state.game.storedDmg = 0;
        if(!state.myGuild) state.myGuild = null;
        if(!state.user.unlockedTalents) state.user.unlockedTalents = []; 
        if(state.user.talentPoints === undefined) state.user.talentPoints = 0;
    } else {
        state = { 
            user: { name: "Recrue", friendCode: "TN-GUEST", level: 1, xp: 0, credits: 200, bio: { age: 20, weight: 70, height: 175 }, talentPoints: 0, unlockedTalents: [], dailyXp: 0, lastDailyReset: new Date().toISOString().split('T')[0], healthMultiplier: 1.0, dailyHealth: null, isGuest: true, isAdmin: false, achievements: [] }, 
            notifications: { chat: 0, quests: 1 }, 
            stats: { strength: 0, agility: 0, mind: 0, endurance: 0 }, 
            history: [], 
            inventory: [], 
            equipped: {}, 
            game: { boss: { skinId: 0, hp: 3000, maxHp: 3000, lvl: 1 }, storedDmg: 0, campaign: { stage: 1, progress: 0 }, quests: [], combatLog: [] }, 
            social: { friends: [] }, 
            myGuild: null 
        };
        saveState();
    }
}
function saveState() { try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); updateGlobalUI(); } catch (e) { console.error("Erreur SaveState", e); } }
function updateGlobalUI() { if(state && document.getElementById('global-credits')) document.getElementById('global-credits').innerText = state.user.credits; }
function checkDailyReset() {
    if(!state) return; const today = new Date().toISOString().split('T')[0];
    if (state.user.lastDailyReset !== today) {
        state.user.dailyXp = 0; state.user.lastDailyReset = today; state.user.dailyHealth = null; state.user.healthMultiplier = 1.0;
        
        const dailyChargeBonus = getTalentBonus('daily_charge'); 
        if(dailyChargeBonus > 0) {
            state.game.storedDmg += dailyChargeBonus;
            alert(`TALENT TITAN : +${dailyChargeBonus} Charge Énergétique reçue !`);
        }

        if (typeof QUEST_TEMPLATES !== 'undefined') {
            const easy = QUEST_TEMPLATES.filter(q => q.diff === 1); const medium = QUEST_TEMPLATES.filter(q => q.diff === 2); const hard = QUEST_TEMPLATES.filter(q => q.diff === 3);
            state.game.quests = [
                { ...easy[Math.floor(Math.random() * easy.length)], current: 0, done: false, id: Date.now()+1 },
                { ...medium[Math.floor(Math.random() * medium.length)], current: 0, done: false, id: Date.now()+2 },
                { ...hard[Math.floor(Math.random() * hard.length)], current: 0, done: false, id: Date.now()+3 }
            ];
        }
        saveState();
    }
}
function handleFileImport(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const parser = new DOMParser(); const xmlDoc = parser.parseFromString(e.target.result, "text/xml"); const trkpts = xmlDoc.getElementsByTagName("trkpt");
            let latlngs = [], dist = 0, ele = 0, time = 0;
            for (let i = 0; i < trkpts.length; i++) {
                const lat = parseFloat(trkpts[i].getAttribute("lat")); const lon = parseFloat(trkpts[i].getAttribute("lon")); const eleVal = trkpts[i].getElementsByTagName("ele")[0] ? parseFloat(trkpts[i].getElementsByTagName("ele")[0].textContent) : 0;
                latlngs.push([lat, lon]);
                if (i > 0) { const p1 = latlngs[i-1]; const R = 6371; const dLat = (lat - p1[0]) * Math.PI / 180; const dLon = (lon - p1[1]) * Math.PI / 180; const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(p1[0] * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2); const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); dist += R * c; const dEle = eleVal - (trkpts[i-1].eleVal || eleVal); if (dEle > 0) ele += dEle; } trkpts[i].eleVal = eleVal;
            }
            time = Math.round(dist * 6); const timeTagFirst = xmlDoc.getElementsByTagName("time")[0]; const timeTagLast = xmlDoc.getElementsByTagName("time")[xmlDoc.getElementsByTagName("time").length - 1]; if(timeTagFirst && timeTagLast) { const start = new Date(timeTagFirst.textContent); const end = new Date(timeTagLast.textContent); time = Math.round((end - start) / 60000); }
            tempGpxData = { dist: dist.toFixed(2), time: time, ele: Math.round(ele), track: latlngs };
            if(typeof applyGpxToForm === 'function') { applyGpxToForm(tempGpxData, input.parentElement); initMap('map-container', latlngs); } else if(window.location.pathname.includes('activities.html') && currentEditingLogId) { updateActivityWithGpx(currentEditingLogId, tempGpxData); }
        };
        reader.readAsText(input.files[0]);
    }
}
function initMap(containerId, coords) {
    if(!document.getElementById(containerId)) return; document.getElementById(containerId).style.display = 'block'; document.getElementById(containerId).classList.add('active');
    if(mapInstance) { mapInstance.remove(); mapInstance = null; }
    if(typeof L !== 'undefined') { mapInstance = L.map(containerId).setView(coords[0], 13); L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19 }).addTo(mapInstance); const polyline = L.polyline(coords, {color: '#fb923c', weight: 4}).addTo(mapInstance); mapInstance.fitBounds(polyline.getBounds()); }
}
let currentEditingLogId = null;
function triggerGpxUpload(logId) { currentEditingLogId = logId; const input = document.createElement('input'); input.type = 'file'; input.accept = '.gpx'; input.onchange = (e) => handleFileImport(e.target); input.click(); }
function updateActivityWithGpx(logId, gpxData) { const logIndex = state.history.findIndex(l => l.id === logId); if(logIndex > -1) { if(!state.history[logIndex].extended) state.history[logIndex].extended = {}; state.history[logIndex].extended.gpxData = gpxData; saveState(); alert("GPX Ajouté avec succès !"); location.reload(); } }
function viewMap(logId) { const log = state.history.find(l => l.id === logId); if(log && log.extended && log.extended.gpxData) { document.getElementById('map-modal').style.display = 'flex'; setTimeout(() => { initMap('modal-map-container', log.extended.gpxData.track); }, 100); } }
function closeMapModal() { document.getElementById('map-modal').style.display = 'none'; }

// --- AVENTURE & COMBAT (JUICE INTÉGRÉ) ---

function unleashEnergy() {
    const rawDmg = state.game.storedDmg;
    if(rawDmg <= 0) return;
    let multiplier = 0.5;
    
    // Logique bonus
    if(rawDmg >= 500) multiplier = 1.5; else if(rawDmg >= 100) multiplier = 1.0;
    
    const finalDmg = Math.floor(rawDmg * multiplier);
    state.game.boss.hp -= finalDmg;
    if(state.game.boss.hp < 0) state.game.boss.hp = 0;
    state.game.storedDmg = 0;
    saveState();
    
    updateCapacitorUI();
    
    // [JUICE] 1. Tremblement du boss
    triggerShake('boss-visual'); 
    
    // [JUICE] 2. Dégâts flottants (Position centrale approximative)
    const bossVisual = document.getElementById('boss-visual');
    if(bossVisual) {
        const rect = bossVisual.getBoundingClientRect();
        // On vise le centre de l'image pour l'effet
        showDamage(finalDmg, rect.left + rect.width/2, rect.top + rect.height/2);
    }
    
    // Mise à jour visuelle (barre de vie)
    const bossFill = document.getElementById('boss-fill');
    const bossHpTxt = document.getElementById('boss-hp');
    if(bossFill && bossHpTxt) {
        const pct = (state.game.boss.hp / state.game.boss.maxHp) * 100;
        bossFill.style.width = pct + "%";
        bossHpTxt.innerText = Math.ceil(state.game.boss.hp);
    }
    
    if (state.game.boss.hp <= 0) setTimeout(() => bossDeathSequence(), 1000);
}

function updateCapacitorUI() {
    const valEl = document.getElementById('stored-dmg');
    const barEl = document.getElementById('stored-bar');
    const btn = document.getElementById('btn-unleash');
    if(!valEl) return;
    
    const rawDmg = state.game.storedDmg || 0;
    let multiplier = 0.5;
    let statusText = "INSTABLE (x0.5)";
    let barColor = "#ef4444";
    let visualPct = Math.min((rawDmg / 100) * 100, 100);
    
    if(rawDmg >= 500) { multiplier = 1.5; statusText = "SURCHARGE (x1.5)"; barColor = "#facc15"; visualPct = 100; }
    else if (rawDmg >= 100) { multiplier = 1.0; statusText = "STABLE (x1.0)"; barColor = "#38bdf8"; visualPct = Math.min((rawDmg / 500) * 100, 100); }
    
    const finalPredict = Math.floor(rawDmg * multiplier);
    valEl.innerHTML = `${rawDmg} <span style="font-size:0.8rem; color:${barColor}">${statusText}</span>`;
    barEl.style.width = visualPct + "%";
    barEl.style.background = barColor;
    
    if(rawDmg > 0) {
        btn.disabled = false;
        btn.innerHTML = `<i class="ri-flashlight-fill"></i> TIRER (${finalPredict} DÉGÂTS)`;
        if(btn.classList.contains('fire-btn')) {
             if(rawDmg >= 500) btn.className = "fire-btn overcharge";
             else btn.className = "fire-btn ready";
        }
    } else {
        btn.disabled = true;
        btn.innerHTML = "CHARGE VIDE";
        if(btn.classList.contains('fire-btn')) btn.className = "fire-btn";
    }
}

function bossDeathSequence() {
    alert("⚠️ CIBLE ÉLIMINÉE !\n\nRécompense : +500 Crédits\nNiveau de Menace Augmenté.");
    state.user.credits += 500; state.game.boss.lvl++;
    state.game.boss.maxHp = Math.floor(state.game.boss.maxHp * 1.2);
    state.game.boss.hp = state.game.boss.maxHp;
    if(typeof BOSS_DB !== 'undefined') state.game.boss.skinId = state.game.boss.lvl % BOSS_DB.length;
    saveState(); window.location.reload();
}

async function buyLootBox() {
    let PRICE = GAME_SETTINGS.lootbox_price || 200;
    const discount = getTalentBonus('discount'); 
    if(discount > 0) PRICE = Math.floor(PRICE * (1 - discount));

    if (state.user.credits < PRICE) { alert(`CRÉDITS INSUFFISANTS ! (Prix: ${PRICE}$)`); return; }
    
    state.user.credits -= PRICE;
    finalizeLootBox();
    
    if(supabase && !state.user.isGuest) { 
        await supabase.from('profiles').update({ credits: state.user.credits }).eq('id', state.user.id); 
    }
}

function finalizeLootBox() {
    if (typeof ITEM_DB === 'undefined') return alert("Erreur DB.");
    const item = ITEM_DB[Math.floor(Math.random() * ITEM_DB.length)];
    state.inventory.push(item.id); saveState();
    if(!state.user.isGuest && supabase) { supabase.from('inventory').insert({ user_id: state.user.id, item_id: item.id }).then(); }
    if (typeof playLootAnimation === 'function') playLootAnimation(item);
    else { alert("Loot : " + item.name); window.location.reload(); }
    updateGlobalUI();
}

function equipItem(id) { const item = ITEM_DB.find(i => i.id === id); if (!item) return; const current = state.equipped[item.type]; if (current) state.inventory.push(current); state.equipped[item.type] = id; state.inventory.splice(state.inventory.indexOf(id), 1); saveState(); refreshProfileUI(); }
function unequip(slot) { const id = state.equipped[slot]; if (!id) return; state.inventory.push(id); state.equipped[slot] = null; saveState(); refreshProfileUI(); }

function sellItem(id) {
    const item = ITEM_DB.find(i => i.id === id); if (!item) return;
    let ratio = GAME_SETTINGS.sell_ratio || 0.5;
    const sellBonus = getTalentBonus('sell_boost'); 
    ratio += sellBonus; 

    const sellPrice = Math.floor(item.price * ratio);
    
    if(confirm(`Vendre ${item.name} pour ${sellPrice} $ ?`)) {
        state.user.credits += sellPrice; state.inventory.splice(state.inventory.indexOf(id), 1); saveState();
        refreshProfileUI(); updateGlobalUI();
        if(!state.user.isGuest && supabase) supabase.from('profiles').update({ credits: state.user.credits }).eq('id', state.user.id).then();
    }
}

function refreshProfileUI() { if(typeof renderDoll === 'function') renderDoll(); if(typeof renderInventory === 'function') renderInventory(); if(typeof calculateTotalStats === 'function') { const s = calculateTotalStats(); if(typeof renderRadar === 'function') renderRadar(s); } }
async function logout() { if(confirm("Déconnexion ?")) { if(supabase) await supabase.auth.signOut(); localStorage.removeItem(STATE_KEY); window.location.href = 'login.html'; } }
function injectSystemModal() { if(!document.getElementById('titan-sys-modal')) { document.body.insertAdjacentHTML('beforeend', `<div id="titan-sys-modal" class="sys-modal-overlay"><div id="titan-modal-card" class="sys-modal-card modal-type-info"><div class="levelup-rays" id="lvl-rays" style="display:none;"></div><div class="sys-icon-box"><i id="sys-icon" class="ri-information-line"></i></div><h2 class="titular sys-title" id="sys-title">TITRE</h2><p class="sys-msg" id="sys-msg">Message...</p><button class="sys-btn" onclick="closeTitanModal()">REÇU</button></div></div>`); } }
function showTitanModal(t, m, type) { const el = document.getElementById('titan-sys-modal'); const card = document.getElementById('titan-modal-card'); if(el && card){ card.className = 'sys-modal-card modal-type-' + type; document.getElementById('sys-title').innerText = t; document.getElementById('sys-msg').innerHTML = m; el.classList.add('active'); } }
function closeTitanModal() { document.getElementById('titan-sys-modal')?.classList.remove('active'); }

// --- FONCTIONS JUICE (NEW) ---

// 1. Shake Effect
function triggerShake(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.classList.remove('boss-shake');
        void element.offsetWidth; // Force Reflow
        element.classList.add('boss-shake');
    }
}

// 2. Floating Damage
function showDamage(damage, x, y) {
    const damageEl = document.createElement('div');
    damageEl.innerText = "-" + damage;
    damageEl.classList.add('damage-number');
    
    // Position aléatoire légère
    const randomX = (Math.random() - 0.5) * 40; 
    const randomY = (Math.random() - 0.5) * 20;

    damageEl.style.left = `${x + randomX}px`;
    damageEl.style.top = `${y + randomY}px`;
    
    document.body.appendChild(damageEl);

    setTimeout(() => { damageEl.remove(); }, 1000);
}

// 3. XP Flash
function triggerXpEffect(xpBarId) {
    const xpBar = document.getElementById(xpBarId);
    if (xpBar) {
        xpBar.classList.remove('xp-gain-effect');
        void xpBar.offsetWidth;
        xpBar.classList.add('xp-gain-effect');
    }
}

// 4. Level Up Overlay
function showLevelUpAnim() {
    let lvlText = document.getElementById('level-up-msg');
    if (!lvlText) {
        lvlText = document.createElement('div');
        lvlText.id = 'level-up-msg';
        lvlText.innerText = "LEVEL UP!";
        lvlText.classList.add('level-up-text');
        document.body.appendChild(lvlText);
    }
    
    lvlText.classList.add('level-up-active');
    setTimeout(() => { lvlText.classList.remove('level-up-active'); }, 2000);
}

document.addEventListener('DOMContentLoaded', initSystem);