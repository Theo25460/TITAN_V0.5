/* =========================================
   TITAN OS - MODULE COMBAT (ADVENTURE/TRAINING)
   ========================================= */

// --- CONFIGURATION ---
const GRENADE_CONFIG = { 
    'g_rusty': { dmg: 100, icon: 'ri-checkbox-blank-circle-line', color: '#6d8799' }, 
    'g_frag': { dmg: 250, icon: 'ri-apps-2-line', color: '#94a3b8' }, 
    'g_tac': { dmg: 500, icon: 'ri-focus-3-line', color: '#60a5fa' }, 
    'g_plasma': { dmg: 1000, icon: 'ri-blur-off-line', color: '#a78bfa' }, 
    'g_gold': { dmg: 2000, icon: 'ri-vip-diamond-line', color: '#9ee7ff' } 
};

const BUFF_CONFIG = { 
    'dmg': { icon: 'ri-sword-fill', color: '#ef4444' }, 
    'xp': { icon: 'ri-graduation-cap-fill', color: '#38bdf8' }, 
    'charge': { icon: 'ri-flashlight-fill', color: '#a78bfa' } 
};

// Nombre de mobs à vaincre avant de voir le boss
const MOBS_REQUIRED_BEFORE_BOSS = 5;
const TITAN_COMBAT_SYNC_TIMEOUT_MS = 6500;

// --- FONCTIONS UTILITAIRES ---
function getEnemyImageId(source, prefix) {
    const match = String(source || '').match(new RegExp(`${prefix}_(\\d+)`, 'i'));
    return match ? parseInt(match[1], 10) : null;
}

function getLocalEnemyImage(prefix, id) {
    const num = parseInt(id, 10);
    if (!Number.isFinite(num) || num <= 0) return "./image/logo.png";
    return `./image/${prefix}/${prefix}_${num}.webp`;
}

function getMobImage(randomId) {
    return getLocalEnemyImage('mob', randomId);
}

function getBossImage(bossImgPath, fallbackId) {
    return getLocalEnemyImage('boss', getEnemyImageId(bossImgPath, 'boss') || fallbackId);
}

function getMobImageFromData(mobData, fallbackId) {
    return getMobImage(getEnemyImageId(mobData?.img, 'mob') || mobData?.imageId || fallbackId);
}

function getEnemyWeaknessLabel(enemy, fallback = "Aucune") {
    const value = enemy?.weakness || fallback;
    if (typeof window.titanWeaknessLabel === 'function') return window.titanWeaknessLabel(value);
    return String(value || fallback).toUpperCase();
}

function getCombatEnemyKey(enemy, isBoss, level) {
    const safeId = enemy?.id || enemy?.imageId || enemy?.name || (isBoss ? level : 'unknown');
    return isBoss ? `BOSS_${safeId}_LV${level}` : `MOB_${safeId}`;
}

function getCombatRewardMultiplier(baseGain, rewardPreview) {
    const base = Math.max(1, Number(baseGain) || 1);
    const total = Math.max(1, Number(rewardPreview?.total) || base);
    return Math.max(0.1, Math.min(10, total / base));
}

async function submitCombatVictoryToCloud(enemy, isBoss, level, baseGain, rewardPreview) {
    if (!window.titanClient || !window.titanClient.rpc || !window.state?.user || String(window.state.user.id || '').startsWith('guest_')) {
        return { mode: 'local' };
    }

    try {
        const sessionResult = await (typeof window.titanWithTimeout === 'function'
            ? window.titanWithTimeout(window.titanClient.auth.getSession(), 4000, 'Session combat')
            : window.titanClient.auth.getSession());
        const sessionUserId = sessionResult?.data?.session?.user?.id;
        if (sessionResult?.error || !sessionUserId) {
            return { mode: 'local', error: sessionResult?.error || new Error('NO_CLOUD_SESSION') };
        }

        window.state.user.id = sessionUserId;
        if (typeof window.ensureStateIntegrity === 'function') window.ensureStateIntegrity();
        if (typeof window.titanSetSyncStatus === 'function') window.titanSetSyncStatus('pending', 'Combat cloud...');

        const payload = {
            p_enemy_key: getCombatEnemyKey(enemy, isBoss, level),
            p_enemy_type: isBoss ? 'BOSS' : 'MOB',
            p_enemy_id: String(enemy?.id || enemy?.imageId || ''),
            p_name: enemy?.name || (isBoss ? 'Boss' : 'Mob'),
            p_level: level,
            p_reward_mult: getCombatRewardMultiplier(baseGain, rewardPreview),
            p_damage: Math.max(0, Math.ceil(Number(enemy?.maxHp || 0))),
            p_details: {
                page: 'adventure',
                version: 'v70-front-combat-sync',
                imageId: enemy?.imageId || null,
                rarity: enemy?.rarity || null,
                weakness: enemy?.weakness || null,
                campaignLevel: isBoss ? level : null,
                mobsDefeatedBeforeVictory: window.state?.game?.mobsDefeated || 0
            }
        };

        const result = await (typeof window.titanWithTimeout === 'function'
            ? window.titanWithTimeout(window.titanClient.rpc('titan_submit_combat_victory', payload), TITAN_COMBAT_SYNC_TIMEOUT_MS, 'Victoire combat')
            : window.titanClient.rpc('titan_submit_combat_victory', payload));
        if (result?.error) return { mode: 'error', error: result.error };
        const row = Array.isArray(result?.data) ? result.data[0] : result?.data;
        return row ? { mode: 'rpc', row } : { mode: 'error', error: new Error('COMBAT_RPC_EMPTY') };
    } catch (error) {
        return { mode: 'error', error };
    }
}

// --- INITIALISATION ---
document.addEventListener('DOMContentLoaded', () => {
    const checkState = setInterval(() => { 
        if (window.state && window.state.game && typeof window.BOSS_DB !== 'undefined') { 
            clearInterval(checkState); 
            
            if (typeof window.state.game.mobsDefeated === 'undefined') {
                window.state.game.mobsDefeated = 0;
            }
            
            renderAdventurePage(); 
        } 
    }, 100);
    
    setTimeout(() => { clearInterval(checkState); renderAdventurePage(); }, 3000);
});

// --- COEUR DU SYSTÈME : RENDU DE LA PAGE ---
window.renderAdventurePage = function() {
    if(!window.state || !window.state.game) return;
    
    const game = window.state.game;
    const body = document.body;
    
    const mobsCount = game.mobsDefeated || 0;
    const isBossPhase = (mobsCount >= MOBS_REQUIRED_BEFORE_BOSS);
    const lvl = game.bossLevel || 1;

    let name, hp, maxHp, desc, weak, finalImgPath, type;

    // A. LOGIQUE BOSS
    if (isBossPhase) {
        type = 'BOSS';
        body.classList.add('boss-active'); 
        
        const db = window.BOSS_DB || [];
        const bossIdx = (db.length > 0) ? (lvl - 1) % db.length : 0;
        const bossData = db[bossIdx] || { name: "Titan Alpha", baseHp: 5000, img: null, desc: "Cible prioritaire.", weak: "Inconnu", id: 1 };
        
        name = bossData.name;
        const bossImageId = getEnemyImageId(bossData.img, 'boss') || bossData.level || lvl;
        finalImgPath = getBossImage(bossData.img, bossImageId);
        desc = bossData.desc;
        weak = bossData.weak;
        
        if(game.currentEnemy && game.currentEnemy.type === 'BOSS') { 
            hp = game.currentEnemy.hp; 
            maxHp = game.currentEnemy.maxHp; 
            game.currentEnemy.name = name;
            game.currentEnemy.desc = desc;
            game.currentEnemy.imageId = bossImageId;
            game.currentEnemy.imgOverride = finalImgPath;
        } else { 
            maxHp = (bossData.baseHp || 2000) + ((lvl-1)*1000); 
            hp = maxHp; 
            game.currentEnemy = { type: 'BOSS', id: bossData.id, imageId: bossImageId, hp: hp, maxHp: maxHp, name: name, imgOverride: finalImgPath, desc: desc }; 
            
            if(typeof window.saveState === 'function') window.saveState();
        }

        if (typeof window.titanHydrateEnemyMeta === 'function') {
            window.titanHydrateEnemyMeta(game.currentEnemy, bossData, bossImageId, 'BOSS');
        }
        weak = getEnemyWeaknessLabel(game.currentEnemy, bossData.weak || "Inconnu");
        
        document.getElementById('threat-lvl').innerText = "MENACE : ALPHA";
        document.getElementById('threat-lvl').style.color = "var(--danger)";
    } 
    
    // B. LOGIQUE MOB
    else {
        type = 'MOB';
        body.classList.remove('boss-active'); 
        let mobSourceData = null;
        
        if (!game.currentEnemy || game.currentEnemy.type === 'BOSS') {
             // Nouveau Mob
             const mobPool = Array.isArray(window.MOBS_DB) ? window.MOBS_DB.filter(Boolean) : [];
             const randomMobId = Math.floor(Math.random() * Math.max(mobPool.length, 13)) + 1;
             let imageId = randomMobId;
             finalImgPath = getMobImage(randomMobId);
             
             maxHp = 300 + (lvl * 50); 
             hp = maxHp;
             name = "Entité Hostile"; 
             let mobId = randomMobId;
             
             if(mobPool.length > 0) {
                 const m = mobPool[Math.floor(Math.random() * mobPool.length)];
                 if(m) { 
                     mobSourceData = m;
                     name = m.name; 
                     desc = m.desc; 
                     imageId = getEnemyImageId(m.img, 'mob') || getEnemyImageId(m.id, 'mob') || randomMobId;
                     finalImgPath = getMobImageFromData(m, imageId);
                     mobId = m.id;
                 } else { 
                     desc = "Créature standard."; 
                 }
             } else {
                 desc = "Analyse en cours...";
             }

             game.currentEnemy = { type: 'MOB', id: mobId, imageId: imageId, hp: hp, maxHp: maxHp, name: name, imgOverride: finalImgPath, desc: desc };
             
             if(typeof window.saveState === 'function') window.saveState();
        } else {
            // Mob existant : Récupération depuis la base de données (Réhydratation)
            hp = game.currentEnemy.hp;
            maxHp = game.currentEnemy.maxHp;
            let mobId = game.currentEnemy.id;
            let numericMobId = parseInt(mobId, 10);
            let imageId = game.currentEnemy.imageId || getEnemyImageId(game.currentEnemy.imgOverride, 'mob') || (Number.isFinite(numericMobId) ? numericMobId : 1);

            // On va chercher les infos visuelles dans la DB grâce à l'ID
            if (mobId && window.MOBS_DB && window.MOBS_DB.length > 0) {
                const m = window.MOBS_DB.find(x => x.id == mobId) || (Number.isFinite(numericMobId) ? window.MOBS_DB[(numericMobId - 1) % window.MOBS_DB.length] : null);
                if (m) {
                    mobSourceData = m;
                    name = m.name;
                    desc = m.desc || "Entité hostile.";
                    imageId = getEnemyImageId(m.img, 'mob') || imageId;
                    finalImgPath = getMobImageFromData(m, imageId);
                } else {
                    name = "Entité Hostile";
                    desc = "Cible identifiée.";
                    finalImgPath = getMobImage(imageId);
                }
            } else {
                // Fallback de sécurité ultime
                name = game.currentEnemy.name || "Entité Hostile";
                desc = game.currentEnemy.desc || "Analyse en cours...";
                finalImgPath = getMobImage(getEnemyImageId(game.currentEnemy.imgOverride, 'mob') || imageId);
            }

            game.currentEnemy.name = name;
            game.currentEnemy.desc = desc;
            game.currentEnemy.imageId = imageId;
            game.currentEnemy.imgOverride = finalImgPath;
        }

        if (typeof window.titanHydrateEnemyMeta === 'function') {
            window.titanHydrateEnemyMeta(game.currentEnemy, mobSourceData || {}, game.currentEnemy.imageId, 'MOB');
        }
        weak = getEnemyWeaknessLabel(game.currentEnemy, "Aucune");
        document.getElementById('threat-lvl').innerText = `CIBLE ${mobsCount + 1}/${MOBS_REQUIRED_BEFORE_BOSS}`;
        document.getElementById('threat-lvl').style.color = "var(--accent)";
    }

    // 2. MISE À JOUR DOM
    const imgEl = document.getElementById('boss-visual');
    if(imgEl && finalImgPath) {
        if (imgEl.getAttribute('data-active-src') !== finalImgPath) {
            imgEl.setAttribute('data-active-src', finalImgPath);
            imgEl.src = finalImgPath;
        }
    }

    document.getElementById('zone-id').innerText = `SEC-${lvl.toString().padStart(3,'0')}`;
    document.getElementById('boss-name-disp').innerText = name;
    document.getElementById('boss-desc').innerText = desc;
    document.getElementById('boss-lvl-disp').innerText = lvl;
    document.getElementById('boss-weak-val').innerText = weak;
    
    const displayHp = Math.max(0, Math.ceil(hp));
    document.getElementById('boss-hp').innerText = displayHp;
    document.getElementById('boss-max-hp').innerText = Math.ceil(maxHp);
    document.getElementById('boss-fill').style.width = Math.max(0, (hp / maxHp) * 100) + "%";

    updateCapacitorInternal();
    renderTacticalDashboard();
};

function updateCapacitorInternal() {
    if(!window.state) return;
    const stored = window.state.game.storedDmg || 0;
    const batteryLvl = (window.state.user.upgrades && window.state.user.upgrades.battery) ? window.state.user.upgrades.battery : 0;
    const max = 500 + (batteryLvl * 250);
    
    const pct = Math.min((stored / max) * 100, 100);
    
    document.getElementById('stored-dmg-text').innerText = Math.floor(stored);
    document.getElementById('stored-bar').style.width = pct + "%";
    
    const btn = document.getElementById('btn-unleash');
    if(btn) {
        if(stored > 0) { 
            btn.disabled = false; 
            btn.classList.add('ready'); 
            btn.innerHTML = (stored >= max) ? `<i class="ri-flashlight-fill"></i> TIR SURCHARGÉ` : `<i class="ri-crosshair-2-fill"></i> FAIRE FEU`; 
            btn.classList.toggle('overcharge', stored >= max); 
        } 
        else { 
            btn.disabled = true; 
            btn.className = 'btn-fire'; 
            btn.innerHTML = `<i class="ri-loader-3-line"></i> CHARGE INSUFFISANTE`; 
        }
    }
}

function renderTacticalDashboard() {
    const buffs = window.state.user.buffs || {};
    let buffHtml = "";
    Object.keys(BUFF_CONFIG).forEach(key => { if(buffs[key] && buffs[key] > Date.now()) buffHtml += `<div class="buff-icon active" style="color:${BUFF_CONFIG[key].color}; border-color:${BUFF_CONFIG[key].color};"><i class="${BUFF_CONFIG[key].icon}"></i></div>`; });
    document.getElementById('buff-container').innerHTML = buffHtml || `<div class="buff-icon" style="opacity:0.3;"><i class="ri-subtract-line"></i></div>`;

    const inv = window.state.user.inventory || {};
    let grenHtml = "";
    const visualSkin = (typeof window.titanGetGrenadeSkin === 'function') ? window.titanGetGrenadeSkin() : null;
    Object.keys(GRENADE_CONFIG).forEach(key => { 
        const gColor = visualSkin && visualSkin.color ? visualSkin.color : GRENADE_CONFIG[key].color;
        const gIcon = visualSkin && visualSkin.icon && visualSkin.id !== 'grenade-default' ? visualSkin.icon : GRENADE_CONFIG[key].icon;
        const gClass = visualSkin ? visualSkin.className : '';
        if(inv[key] > 0) grenHtml += `<div class="grenade-btn ${gClass}" onclick="activateTactical('${key}')" style="border-color:${gColor}aa;"><i class="${gIcon}" style="color:${gColor};"></i><div class="grenade-badge">${inv[key]}</div></div>`; 
    });
    document.getElementById('grenade-container').innerHTML = grenHtml || `<span style="font-size:0.7rem; color:rgba(255,255,255,0.3); align-self:center;">VIDE</span>`;
}

function applyImpactEffect() { 
    const v = document.getElementById('boss-visual'); 
    if(v) { 
        v.classList.remove('hit-anim'); 
        void v.offsetWidth; 
        v.classList.add('hit-anim'); 
        setTimeout(() => { v.classList.remove('hit-anim'); }, 300);
    } 
}

window.fireMainWeapon = function() {
    const game = window.state.game;
    const enemy = game.currentEnemy;
    
    if(!enemy || enemy.hp <= 0 || window.victoryPending) return;
    
    let damage = game.storedDmg || 0;
    if(damage <= 0) return;

    enemy.hp -= damage;
    game.storedDmg = 0; 
    if (enemy.hp < 0) enemy.hp = 0;

    applyImpactEffect(); 
    renderAdventurePage();
    
    if(typeof window.saveState === 'function') window.saveState({ forceCloud: true });
    if(enemy.hp <= 0) handleLocalVictory();
};

window.activateTactical = function(id) {
    const inv = window.state.user.inventory;
    const enemy = window.state.game.currentEnemy;
    
    if(!inv || !inv[id] || inv[id] <= 0) return;
    if(!enemy || enemy.hp <= 0 || window.victoryPending) return;
    
    let damage = GRENADE_CONFIG[id].dmg;
    if(window.state.user.buffs && window.state.user.buffs.dmg > Date.now()) damage *= 1.25;
    
    enemy.hp -= Math.floor(damage);
    inv[id]--; 
    
    if (enemy.hp < 0) enemy.hp = 0;
    
    applyImpactEffect(); 
    renderAdventurePage();
    
    if(typeof window.saveState === 'function') window.saveState({ forceCloud: true });
    if(enemy.hp <= 0) handleLocalVictory();
};

async function handleLocalVictory() {
    if(window.victoryPending) return; 
    window.victoryPending = true;

    const game = window.state.game;
    const defeatedEnemy = game.currentEnemy ? Object.assign({}, game.currentEnemy) : null;
    if (!defeatedEnemy) {
        window.victoryPending = false;
        return;
    }

    const isBoss = (defeatedEnemy.type === 'BOSS');
    const lvl = game.bossLevel || 1;
    
    const baseGain = isBoss ? (500 * lvl) : 50;
    
    let finalReward = { total: baseGain, base: baseGain, bonus: 0, percent: 0 };
    if(typeof window.calculateRewardsWithBonus === 'function') {
        finalReward = window.calculateRewardsWithBonus(baseGain);
    }

    let combatXp = isBoss ? Math.min(900, Math.floor(baseGain * 0.22)) : 18;
    const cloudVictory = await submitCombatVictoryToCloud(defeatedEnemy, isBoss, lvl, baseGain, finalReward);

    if (cloudVictory.mode === 'rpc' && cloudVictory.row) {
        const row = cloudVictory.row;
        finalReward = {
            total: Number(row.reward_credits || 0),
            base: Number(row.reward_credits || 0),
            bonus: 0,
            percent: 0
        };
        combatXp = Number(row.reward_xp || 0);
        if (Number.isFinite(Number(row.credits_after))) window.state.user.credits = Number(row.credits_after);
        if (Number.isFinite(Number(row.xp_after))) window.state.user.xp = Number(row.xp_after);
        if (Number.isFinite(Number(row.level_after))) window.state.user.level = Number(row.level_after);
        if (typeof window.titanSetSyncStatus === 'function') window.titanSetSyncStatus('cloud', 'Combat synchronise');
    } else {
        if (cloudVictory.error && cloudVictory.mode === 'error') {
            console.warn('[TITAN COMBAT] Victoire cloud indisponible, recompense locale:', cloudVictory.error);
            if (typeof window.titanSetSyncStatus === 'function') window.titanSetSyncStatus('error', 'Combat local');
            if (typeof window.showNotification === 'function') {
                window.showNotification('warning', 'COMBAT LOCAL', 'Victoire gardee dans ta sauvegarde locale. RPC combat a verifier.');
            }
        }
        window.state.user.credits += finalReward.total;
        window.state.user.xp += combatXp;
        if (typeof window.checkLevelUp === 'function') window.checkLevelUp();
    }

    if (typeof window.titanRegisterCombatVictory === 'function') {
        window.titanRegisterCombatVictory(defeatedEnemy, isBoss, finalReward);
    }

    if(isBoss) {
        game.bossLevel++;
        game.mobsDefeated = 0; 
        game.currentEnemy = null; 
    } else {
        game.mobsDefeated = (game.mobsDefeated || 0) + 1;
        game.currentEnemy = null; 
    }

    document.getElementById('vic-base').innerText = finalReward.base;
    document.getElementById('vic-bonus').innerText = `+${finalReward.percent}%`;
    document.getElementById('vic-total').innerText = finalReward.total;
    
    document.getElementById('victory-modal').style.display = 'flex';
    if(typeof window.triggerTitanVictoryEffect === 'function') window.triggerTitanVictoryEffect(isBoss ? 'boss' : 'target');
    
    if(typeof window.saveState === 'function') window.saveState({ forceCloud: true });
}

window.closeVictory = function() {
    const modal = document.getElementById('victory-modal');
    if(modal) modal.style.display = 'none';
    
    window.victoryPending = false;
    
    window.renderAdventurePage();
    
    if(typeof window.saveState === 'function') window.saveState();
};

window.renderAdventureUI = renderAdventurePage;
window.updateCapacitorUI = updateCapacitorInternal;
