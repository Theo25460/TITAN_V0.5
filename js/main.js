/* =========================================
   TITAN OS - MAIN CONTROLLER (GAME ENGINE)
   ========================================= */

// 1. CACHE BUSTER STABLE
// Evite de recharger le CSS a chaque navigation, ce qui provoquait des flashes visuels.
const TITAN_ASSET_VERSION = window.TITAN_ASSET_VERSION || '78';
const TITAN_PENDING_TRAINING_KEY = 'titan_pending_training_logs_v1';
const TITAN_TRAINING_SYNC_DIAG_KEY = 'titan_training_sync_diag_v1';
const TITAN_PROGRESS_SNAPSHOT_KEY = 'titan_progression_snapshot_v1';

function recordTrainingSyncDiagnostic(status, info = {}) {
    const entry = Object.assign({
        status,
        at: new Date().toISOString()
    }, info);
    try { localStorage.setItem(TITAN_TRAINING_SYNC_DIAG_KEY, JSON.stringify(entry)); }
    catch (_) {}
    window.titanLastTrainingSyncDiagnostic = entry;
    return entry;
}

window.titanGetTrainingSyncDiagnostic = function() {
    try { return JSON.parse(localStorage.getItem(TITAN_TRAINING_SYNC_DIAG_KEY) || 'null'); }
    catch (_) { return window.titanLastTrainingSyncDiagnostic || null; }
};

function normalizeProgressionSnapshot(snapshot = {}) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    return {
        server_user_id: snapshot.server_user_id || snapshot.user_id || null,
        level: Number.isFinite(Number(snapshot.level)) ? Number(snapshot.level) : null,
        xp: Number.isFinite(Number(snapshot.xp)) ? Number(snapshot.xp) : null,
        credits: Number.isFinite(Number(snapshot.credits)) ? Number(snapshot.credits) : null,
        is_elite: snapshot.is_elite === true,
        is_tester: snapshot.is_tester === true,
        is_suspended: snapshot.is_suspended === true,
        training_total: Number.isFinite(Number(snapshot.training_total)) ? Number(snapshot.training_total) : null,
        training_7d: Number.isFinite(Number(snapshot.training_7d)) ? Number(snapshot.training_7d) : null,
        training_30d: Number.isFinite(Number(snapshot.training_30d)) ? Number(snapshot.training_30d) : null,
        last_training_at: snapshot.last_training_at || null,
        week_start: snapshot.week_start || null,
        weekly_xp_used: Number.isFinite(Number(snapshot.weekly_xp_used)) ? Number(snapshot.weekly_xp_used) : null,
        weekly_credits_used: Number.isFinite(Number(snapshot.weekly_credits_used)) ? Number(snapshot.weekly_credits_used) : null,
        weekly_xp_cap: Number.isFinite(Number(snapshot.weekly_xp_cap)) ? Number(snapshot.weekly_xp_cap) : null,
        weekly_credit_cap: Number.isFinite(Number(snapshot.weekly_credit_cap)) ? Number(snapshot.weekly_credit_cap) : null,
        weekly_xp_remaining: Number.isFinite(Number(snapshot.weekly_xp_remaining)) ? Number(snapshot.weekly_xp_remaining) : null,
        weekly_credits_remaining: Number.isFinite(Number(snapshot.weekly_credits_remaining)) ? Number(snapshot.weekly_credits_remaining) : null,
        authority: snapshot.authority || 'server_authoritative',
        rules_version: snapshot.rules_version || snapshot.server_version || 'unknown',
        checked_at: snapshot.checked_at || new Date().toISOString()
    };
}

function recordProgressionSnapshot(snapshot, source = 'cloud') {
    const normalized = normalizeProgressionSnapshot(snapshot);
    if (!normalized) return null;
    normalized.source = source;
    normalized.received_at = new Date().toISOString();
    try { localStorage.setItem(TITAN_PROGRESS_SNAPSHOT_KEY, JSON.stringify(normalized)); }
    catch (_) {}
    window.titanLastProgressionSnapshot = normalized;

    if (window.state?.user) {
        if (Number.isFinite(normalized.level)) window.state.user.level = normalized.level;
        if (Number.isFinite(normalized.xp)) window.state.user.xp = normalized.xp;
        if (Number.isFinite(normalized.credits)) window.state.user.credits = normalized.credits;
        window.state.user.cloudProgression = normalized;
        if (typeof normalized.is_elite !== 'undefined') window.state.user.is_elite = normalized.is_elite === true;
        if (typeof normalized.is_tester !== 'undefined') window.state.user.is_tester = normalized.is_tester === true;
        if (typeof normalized.is_suspended !== 'undefined') window.state.user.is_suspended = normalized.is_suspended === true;
    }

    return normalized;
}

window.titanGetProgressionSnapshot = function() {
    try { return JSON.parse(localStorage.getItem(TITAN_PROGRESS_SNAPSHOT_KEY) || 'null') || window.titanLastProgressionSnapshot || null; }
    catch (_) { return window.titanLastProgressionSnapshot || null; }
};

window.titanRefreshProgressionSnapshot = async function(options = {}) {
    if (!window.titanClient || typeof window.titanClient.rpc !== 'function') return window.titanGetProgressionSnapshot();
    try {
        const sessionResult = await window.titanClient.auth.getSession();
        const sessionUserId = sessionResult?.data?.session?.user?.id;
        if (!sessionUserId) {
            recordTrainingSyncDiagnostic('snapshot_no_session', { pendingCount: readPendingTrainingLogs().length });
            return window.titanGetProgressionSnapshot();
        }

        const { data, error } = await window.titanClient.rpc('titan_get_progression_snapshot');
        if (error) {
            recordTrainingSyncDiagnostic('snapshot_error', {
                code: error.code || '',
                message: error.message || String(error),
                pendingCount: readPendingTrainingLogs().length
            });
            if (!options.silent && typeof window.showNotification === 'function') {
                window.showNotification('warning', 'PROGRESSION INDISPONIBLE', 'Impossible d’actualiser ta progression pour le moment.');
            }
            return window.titanGetProgressionSnapshot();
        }

        const row = Array.isArray(data) ? data[0] : data;
        const snapshot = recordProgressionSnapshot(row, 'rpc');
        recordTrainingSyncDiagnostic('snapshot_synced', {
            level: snapshot?.level,
            xp: snapshot?.xp,
            credits: snapshot?.credits,
            pendingCount: readPendingTrainingLogs().length
        });
        if (typeof window.updateGlobalUI === 'function') window.updateGlobalUI();
        return snapshot;
    } catch (error) {
        recordTrainingSyncDiagnostic('snapshot_exception', {
            message: error?.message || String(error),
            pendingCount: readPendingTrainingLogs().length
        });
        return window.titanGetProgressionSnapshot();
    }
};

window.titanBuildCloudReadiness = function() {
    const pending = readPendingTrainingLogs();
    const trainingDiag = window.titanGetTrainingSyncDiagnostic?.() || null;
    const profileDiag = window.titanGetProfileSyncDiagnostic?.() || null;
    const snapshot = window.titanGetProgressionSnapshot?.() || window.state?.user?.cloudProgression || null;
    const ageMs = snapshot?.received_at ? Date.now() - Date.parse(snapshot.received_at) : null;
    return {
        pendingCount: pending.length,
        trainingDiag,
        profileDiag,
        snapshot,
        snapshotAgeMs: Number.isFinite(ageMs) ? ageMs : null,
        authoritative: !!snapshot && snapshot.authority !== 'local',
        connectedUser: !!(window.state?.user?.id && !window.state.user.id.startsWith('guest_'))
    };
};

function readPendingTrainingLogs() { return window.TitanQueue?.list() || []; }
function queuePendingTrainingLog(payload, reason = '') {
    const ownerId=window.state?.user?.id;
    return window.TitanQueue.put({key: `${ownerId}:${payload.details.client_event_id}`,ownerId,payload:JSON.parse(JSON.stringify(payload)),reason,status:'pending',queuedAt:new Date().toISOString()});
}
async function submitTrainingSessionToCloud(payload, session) {
    if(!session?.access_token||session.user?.id!==window.state?.user?.id)return {error:new Error('NO_CLOUD_SESSION')};
    // Bind this queued operation to the captured owner's token even if another tab signs in meanwhile.
    const response=await fetch(`${window.TITAN_SUPABASE_URL}/rest/v1/rpc/titan_submit_training_session`,{
        method:'POST',headers:{'Content-Type':'application/json',apikey:window.TITAN_SUPABASE_ANON_KEY,Authorization:`Bearer ${session.access_token}`},
        body:JSON.stringify({p_sport:payload.sport,p_category:payload.category,p_val:payload.val,p_unit:payload.unit,p_details:payload.details,p_date:payload.date}),
        signal:AbortSignal.timeout(20000)
    });
    const body=await response.json();const result=response.ok?{data:body}:{error:body};
    const row=Array.isArray(result.data)?result.data[0]:result.data;
    return result.error?{error:result.error}:row?.log_id?{data:{id:row.log_id,serverReward:row}}:{error:new Error('SERVER_AUTHORITY_REQUIRED')};
}
let trainingFlush;
window.flushPendingTrainingLogs = function(options={}) {
    if(trainingFlush)return trainingFlush;
    const run=async()=>{
        await window.TitanQueue.migrate();
        const session=await window.titanClient?.auth.getSession();const uid=session?.data?.session?.user?.id;
        if(!uid||uid!==window.state?.user?.id)return {sent:0,remaining:readPendingTrainingLogs().length};
        const items=await window.TitanQueue.refresh();let sent=0;
        for(const item of items){
            if(window.state?.user?.id!==uid)break;
            if(item.ownerId!==uid||(item.status==='error'&&!options.retry))continue;
            try {
                const {data,error}=await submitTrainingSessionToCloud(item.payload,session.data.session);
                if(error)throw error;
                const reward=data.serverReward;
                const local=window.state?.user?.id===uid&&window.state.history.find(l=>l.client_event_id===item.payload.details.client_event_id||l.details?.client_event_id===item.payload.details.client_event_id);
                if(local){local.id=data.id;local.syncStatus='confirmed';local.xp=reward.xp;local.revision=1;local.details.serverReward=reward;}
                await window.TitanQueue.remove(item.key);sent++;
                if(window.state?.user?.id===uid){window.state.user.xp=reward.xp_after;window.state.user.credits=reward.credits_after;window.state.user.level=reward.level_after;await window.TitanQueue.saveHistory(uid,[...window.state.history,...(window.state.archivedHistory||[])]);}
            } catch(error){
                const permanent=['22023','22P02','23514','23505','42501'].includes(error.code);
                await window.TitanQueue.put({...item,status:permanent?'error':'pending',reason:error.message||'Connexion indisponible'});
                if(!permanent)break;
            }
        }
        window.saveState?.();window.dispatchEvent(new CustomEvent('titan:history-updated'));
        const remaining=readPendingTrainingLogs().length;
        window.titanSetSyncStatus?.(remaining?'pending':'cloud',remaining?`${remaining} séance(s) sur cet appareil`:'Séances synchronisées');
        return {sent,remaining};
    };
    trainingFlush=(navigator.locks?navigator.locks.request('titan-training-send',run):run()).finally(()=>{trainingFlush=null;});
    return trainingFlush;
};
window.addEventListener('online',()=>window.flushPendingTrainingLogs().catch(()=>{}));

function titanBuildPostSessionSummary(log, rewardResult, analysis = {}, titanResult = {}) {
    const history = window.state?.history || [];
    const weekGoal = Math.max(1, parseInt(window.state?.user?.weeklyGoalSessions, 10) || 3);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);
    const weekSessions = history.filter(item => new Date(item.date) >= weekStart).length;
    const remainingWeek = Math.max(0, weekGoal - weekSessions);
    const records = (titanResult.records || []).map(item => item.label).slice(0, 3);
    const badges = (titanResult.badges || []).map(item => item.label).slice(0, 3);
    const titles = (titanResult.titles || []).map(item => item.label).slice(0, 2);
    const qualities = (titanResult.qualities || []).map(item => item.label).slice(0, 3);
    const contextualRecords = (titanResult.contextualRecords || []).map(item => item.label).slice(0, 3);
    const regularityBadges = (titanResult.regularityBadges || []).map(item => item.label).slice(0, 3);
    const identity = titanResult.identity || {};
    const cooldown = titanResult.cooldown || null;
    const selfCompetition = titanResult.selfCompetition || null;
    const plateau = titanResult.plateau || null;
    const sportLabel = window.SPORTS_CONFIG?.[log.sport]?.label || log.sport || 'Seance';
    const lootParts = [];
    if (records.length) lootParts.push(`${records.length} record(s)`);
    if (badges.length) lootParts.push(`${badges.length} badge(s)`);
    if (titles.length) lootParts.push(`${titles.length} titre(s)`);

    return {
        date: log.date,
        sport: sportLabel,
        value: log.val,
        unit: log.unit || '',
        xp: rewardResult.xp || log.xp || 0,
        credits: rewardResult.credits || 0,
        charge: rewardResult.xp || log.xp || 0,
        storedDmg: window.state?.game?.storedDmg || 0,
        records,
        badges,
        titles,
        qualities,
        contextualRecords,
        regularityBadges,
        archetype: identity.archetype?.label || window.state?.user?.archetype?.label || null,
        reputation: identity.reputation?.primary || window.state?.user?.reputation?.primary || null,
        coachNext: identity.coach?.nextCap || null,
        selfDuel: selfCompetition?.detail || null,
        plateau: plateau?.status === 'watch' ? plateau.action : null,
        cooldown: cooldown ? `${cooldown.label} (${cooldown.duration} min)` : null,
        loot: lootParts.length ? lootParts.join(' + ') : 'Aucun loot direct, progression sportive enregistree.',
        nextObjective: remainingWeek > 0
            ? `Encore ${remainingWeek} seance(s) pour l'objectif hebdo.`
            : 'Objectif hebdo valide, pense recuperation ou variation.',
        recovery: analysis.recovery?.status || null,
        summary: log.details?.summary || titanResult.summary || ''
    };
}
document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
    const href = link.getAttribute('href') || '';
    if (!href.includes('/css/style.css') && !href.includes('./css/style.css')) return;
    const cleanHref = href.split('?')[0];
    if (!href.includes(`v=${TITAN_ASSET_VERSION}`)) {
        link.setAttribute('href', `${cleanHref}?v=${TITAN_ASSET_VERSION}`);
    }
});

// 2. INITIALISATION DU SYSTÈME
document.addEventListener('DOMContentLoaded', () => {
    // A. Initialisation UI de base
    if(typeof window.setupNotificationSystem === 'function') window.setupNotificationSystem();
    if(typeof window.injectMobileNav === 'function') window.injectMobileNav();
    if(typeof window.injectFavicon === 'function') window.injectFavicon();
    
    // B. Chargement des données
    if(typeof window.loadState === 'function') window.loadState();
    const cacheOwner=window.state?.user?.id;
    window.TitanQueue?.readHistory(cacheOwner).then(async logs=>{await window.TitanQueue.migrate();if(window.state?.user?.id!==cacheOwner||window.titanCloudHistoryLoadedAt)return;const merged=new Map(logs.map(l=>[l.client_event_id||l.id,l]));for(const item of window.TitanQueue.list()){const id=item.payload.details.client_event_id;if(!merged.has(id))merged.set(id,{...item.payload,id,client_event_id:id,cat:item.payload.category,xp:0,syncStatus:item.status});}if(merged.size){const all=[...merged.values()];window.state.history=all.filter(l=>!l.archived_at);window.state.archivedHistory=all.filter(l=>l.archived_at);window.dispatchEvent(new CustomEvent('titan:history-updated'));}}).catch(()=>{});
    
    // C. Construction de l'interface
    if(typeof window.injectSidebar === 'function') window.injectSidebar();
    if(typeof window.injectMobileHeader === 'function') window.injectMobileHeader();
    if(typeof window.updateGlobalUI === 'function') window.updateGlobalUI();
    
    // D. Démarrage du Moteur
    initSystem();

    // E. Écouteur Auth Supabase
    setupTitanAuthListener();
});

async function setupTitanAuthListener() {
    if (window.__titanAuthListenerBound) return;
    if (!window.titanClient && typeof window.waitForTitanSupabase === 'function') {
        await window.waitForTitanSupabase(2500);
    }
    if (!window.titanClient || window.__titanAuthListenerBound) return;

    window.__titanAuthListenerBound = true;
    window.titanClient.auth.onAuthStateChange((event, session) => {
        setTimeout(async()=>{
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
            if(typeof window.syncWithSupabase === 'function') await window.syncWithSupabase();
            if(typeof window.flushPendingTrainingLogs === 'function') await window.flushPendingTrainingLogs();
            if(typeof window.titanRefreshProgressionSnapshot === 'function') await window.titanRefreshProgressionSnapshot({ silent: true });
        }
        },0);
    });
}

async function initSystem() {
    try {
        if (!window.titanClient && typeof window.waitForTitanSupabase === 'function') {
            await window.waitForTitanSupabase(2500);
        }

        // 1. Charger les données serveur (Items, Mobs, etc.)
        if(typeof window.loadServerData === 'function') await window.loadServerData();
        
        // 2. Rendu des pages spécifiques (si présentes)
        if ((document.getElementById('sports-grid') || document.getElementById('sport-search')) && typeof window.renderSports === 'function') window.renderSports();
        if (document.getElementById('discipline-catalog-grid') && typeof window.renderDisciplinePage === 'function') window.renderDisciplinePage();
        if (document.getElementById('history-list') && typeof window.renderHistory === 'function') window.renderHistory();
        if (typeof window.renderShop === 'function') window.renderShop(); // Si présent dans boutique.html

        // 3. Sync & Reset
        if(typeof window.syncWithSupabase === 'function') await window.syncWithSupabase();
        if(typeof window.flushPendingTrainingLogs === 'function') await window.flushPendingTrainingLogs();
        if(typeof window.titanRefreshProgressionSnapshot === 'function') await window.titanRefreshProgressionSnapshot({ silent: true });
        if(typeof window.checkDailyReset === 'function') await window.checkDailyReset();
        
        // 4. Marketing & UI Updates
        if(typeof window.initMarketingOps === 'function') window.initMarketingOps();
        if(typeof window.injectSidebar === 'function') window.injectSidebar(); 
        if(typeof window.injectMobileHeader === 'function') window.injectMobileHeader();
        if(typeof window.updateGlobalUI === 'function') window.updateGlobalUI();
        if(typeof window.setupElitePayment === 'function') window.setupElitePayment(); 
        
        // 5. News & Messages
        if(typeof window.checkNewsStatus === 'function') window.checkNewsStatus();
        if(typeof window.titanMaybeShowFirstRunGuide === 'function') {
            setTimeout(() => window.titanMaybeShowFirstRunGuide(), 520);
        }

        // 6. MODULE DEV
        if(typeof window.initDevTools === 'function') window.initDevTools();

        // 7. Hooks pour pages spécifiques (Adventure/Arena)
        if (window.location.pathname.includes('adventure.html') || document.getElementById('arena-box')) {
            if (window.renderAdventureUI) window.renderAdventureUI();
            if (window.updateCapacitorUI) window.updateCapacitorUI();
        }
        if (typeof window.titanHideBoot === 'function') window.titanHideBoot();
    } catch (e) { 
        console.error("ERREUR CRITIQUE MOTEUR:", e); 
        if (typeof window.titanHideBoot === 'function') window.titanHideBoot(true);
    }
}

/* =========================================
   LOGIQUE DE JEU (XP, CHARGE, NIVEAUX)
   ========================================= */

window.logActivity = async function(sportKey, dataInput) {
    if(!window.state||!window.SPORTS_CONFIG?.[sportKey])throw new Error('Choisis un sport.');
    if(!window.TitanQueue)throw new Error('Le stockage de cet appareil est indisponible. Exporte tes données avant de continuer.');
    const config=window.SPORTS_CONFIG[sportKey];
    const details=window.titanSanitizeSessionDetails?window.titanSanitizeSessionDetails(dataInput,window.state.user,sportKey):dataInput;
    const weighted=(details.exercises||[]).reduce((n,e)=>n+(Number(e.volume)||0),0);
    const reps=(details.exercises||[]).reduce((n,e)=>n+(Number(e.totalReps)||0),0);
    const value=Number(details.val1)||(weighted>0?weighted:reps);
    if(!Number.isFinite(value)||value<=0)throw new Error('Renseigne une valeur supérieure à zéro.');
    details.client_event_id=details.client_event_id||crypto.randomUUID();details.schemaVersion=2;
    details.timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
    const date=details.performedAt||new Date().toISOString();
    if(details.exercises?.length&&!details.exercises.some(e=>Number(e.volume)>0))details.unitOverride='reps';
    const payload={sport:sportKey,category:config.cat||'training',val:value,unit:details.unitOverride||config.unit||'',date,details};
    // The durable write MUST succeed before clearing the form or celebrating a save.
    const guest=String(window.state.user.id).startsWith('guest_');
    const log={...payload,id:details.client_event_id,client_event_id:details.client_event_id,cat:payload.category,xp:0,syncStatus:guest?'local':'pending',revision:1};
    if(guest)await window.TitanQueue.saveGuestSession(window.state.user.id,log);
    else await queuePendingTrainingLog(payload);
    window.state.history=window.state.history||[];
    if(!window.state.history.some(l=>l.client_event_id===log.client_event_id))window.state.history.push(log);
    window.saveState?.();window.dispatchEvent(new CustomEvent('titan:history-updated'));
    window.flushPendingTrainingLogs().catch(()=>window.titanSetSyncStatus?.('pending','Séance conservée sur cet appareil'));
    window.showNotification?.('success','Séance conservée',guest?'Enregistrée sur cet appareil. Retrouve-la dans ton journal.':'Enregistrée sur cet appareil. La confirmation cloud apparaît dans le journal.');
    return log;
};

window.addCharge = function(amount) {
    if (!window.state) return;
    if (!window.state.game) window.state.game = { phase: 'BOSS', bossLevel: 1, storedDmg: 0, currentEnemy: null, mobsDefeated: 0 };
    if (isNaN(amount) || amount <= 0) return;
    
    const game = window.state.game;
    const user = window.state.user;
    const batteryLvl = (user.upgrades && user.upgrades.battery) ? user.upgrades.battery : 0;
    
    const caps = [500, 1000, 1500, 2500, 4000, 9999];
    const maxCapacitor = caps[batteryLvl] || 500;

    let recoveryMult = 1;
    if (window.state.user.unlockedTalents && window.TALENT_TREE) {
        window.state.user.unlockedTalents.forEach(tId => {
            const t = window.TALENT_TREE[tId];
            if (t && t.stat === 'recovery') recoveryMult += t.bonus;
        });
    }

    if (isNaN(game.storedDmg)) game.storedDmg = 0;
    game.storedDmg += Math.floor(amount * recoveryMult);
    
    if (game.storedDmg > maxCapacitor) game.storedDmg = maxCapacitor;
    
    if(typeof window.saveState === 'function') window.saveState();
    if (typeof window.updateCapacitorUI === 'function') window.updateCapacitorUI();
};

window.titanGetLevelRequirement = function(level = window.state?.user?.level || 1) {
    const safeLevel = Math.max(1, Number(level) || 1);
    const base = window.XP_PER_LEVEL_BASE || 2200;
    return Math.floor(base * Math.pow(safeLevel, 1.18));
};

window.checkLevelUp = function() {
    if (!window.state?.user) return;

    let leveled = 0;
    while (window.state.user.xp >= window.titanGetLevelRequirement(window.state.user.level) && leveled < 4) {
        const req = window.titanGetLevelRequirement(window.state.user.level);
        window.state.user.xp -= req;
        window.state.user.level++;
        const levelBonus = Math.max(150, Math.floor(180 + (window.state.user.level * 35)));
        window.state.user.credits += levelBonus;
        leveled++;
    }

    if (leveled > 0) {
        const label = leveled === 1 ? `Niveau ${window.state.user.level} atteint !` : `${leveled} niveaux gagnes. Niveau ${window.state.user.level} atteint !`;
        if(typeof window.showNotification === 'function') window.showNotification('level', 'NIVEAU SUPERIEUR', label);
        if(typeof window.saveState === 'function') window.saveState();
    }
};

window.unlockAchievement = async function(achId) {
    if (!window.state || !window.state.user) return;
    if (!window.state.user.unlockedAchievements) window.state.user.unlockedAchievements = [];
    if (window.state.user.unlockedAchievements.includes(achId)) return;

    const ach = window.ACHIEVEMENTS_DB ? window.ACHIEVEMENTS_DB.find(a => a.id === achId) : null;
    const reward = ach ? ach.reward : 500; 
    const isCloudUser = window.titanClient && window.state.user.id && !window.state.user.id.startsWith('guest_');
    let serverClaim = null;
    let serverClaimFailed = false;

    if (isCloudUser && typeof window.titanClient.rpc === 'function') {
        const { data, error } = await window.titanClient.rpc('titan_claim_achievement', { p_achievement_id: achId });
        if (!error) serverClaim = Array.isArray(data) ? (data[0] || null) : data;
        else {
            serverClaimFailed = true;
            console.warn("Achievement RPC Error:", error);
        }
    }

    if (isCloudUser && (serverClaimFailed || !serverClaim)) {
        if(typeof window.showNotification === 'function') window.showNotification('warning', 'SUCCES EN ATTENTE', 'Validation serveur requise avant recompense.');
        return;
    }

    window.state.user.unlockedAchievements.push(achId);
    const rewardCredits = serverClaim ? Number(serverClaim.reward_credits || 0) : reward;
    if (serverClaim && Number.isFinite(Number(serverClaim.credits_after))) {
        window.state.user.credits = Number(serverClaim.credits_after);
    } else {
        window.state.user.credits += rewardCredits;
    }
    
    if(typeof window.showNotification === 'function') {
        const rewardText = rewardCredits > 0 ? ` (+${rewardCredits} Credits)` : '';
        window.showNotification('success', 'SUCCES DEBLOQUE', `"${ach ? ach.title : 'Nouveau'}"${rewardText}`);
    }
    if(typeof window.saveState === 'function') window.saveState();

    if (isCloudUser && !serverClaim) {
        const { error } = await window.titanClient
            .from('user_achievements')
            .upsert({ user_id: window.state.user.id, achievement_id: achId }, { onConflict: 'user_id,achievement_id', ignoreDuplicates: true });
        if (error) console.warn("Achievement DB Error:", error);
    }
};

/* =========================================
   SYSTÈME DE BOUTIQUE (TRANSACTIONS)
   ========================================= */

function getUnifiedPurchaseHistory() {
    const serverHistory = Array.isArray(window.PURCHASE_HISTORY) ? window.PURCHASE_HISTORY : [];
    const localHistory = window.state?.user?.purchase_history || [];
    const seen = new Set();
    return [...serverHistory, ...localHistory].filter(Boolean).filter(row => {
        const key = `${row.item_id || row.itemId}:${row.purchased_at || row.date || row.created_at || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function getPurchaseDate(row) {
    return new Date(row.purchased_at || row.date || row.created_at || 0);
}

window.checkPurchaseLimit = function(item) {
    if(!item.cooldown || item.cooldown.type === 'none') return true;
    const history = getUnifiedPurchaseHistory();
    const catalog = (typeof window.titanGetShopCatalog === 'function') ? window.titanGetShopCatalog() : (window.SHOP_DB || []);
    const sameTypeIds = new Set((catalog || []).filter(entry => entry.type === item.type).map(entry => String(entry.id)));
    const now = new Date();

    if (item.type === 'charge') {
        const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        const recentCharges = history.filter(p => sameTypeIds.has(String(p.item_id || p.itemId)) && getPurchaseDate(p) > sevenDaysAgo);
        return recentCharges.length < (window.titanGetShopEconomy?.().chargeWeeklyLimit || item.cooldown.max || 2);
    }

    if (item.type === 'ad') {
        const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        const recentAds = history.filter(p => sameTypeIds.has(String(p.item_id || p.itemId)) && getPurchaseDate(p) > sevenDaysAgo);
        if (recentAds.length >= (window.titanGetShopEconomy?.().adWeeklyLimit || 3)) return false;
    }

    const purchases = history.filter(p => (p.item_id || p.itemId) === item.id);
    if(purchases.length === 0) return true;

    if(item.cooldown.type === 'once') return purchases.length < (item.cooldown.max || 1);
    
    if(item.cooldown.type === 'daily') {
        const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        const recentPurchase = purchases.find(p => getPurchaseDate(p) > twentyFourHoursAgo);
        return !recentPurchase;
    }

    if(item.cooldown.type === 'weekly') {
        const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        const recentPurchases = purchases.filter(p => getPurchaseDate(p) > sevenDaysAgo);
        return recentPurchases.length < (item.cooldown.max || 2);
    }

    return true;
};

async function purchaseShopItemOnServer(item) {
    if (!item || !window.titanClient || !window.titanClient.rpc) return null;
    if (!window.state?.user?.id || window.state.user.id.startsWith('guest_')) return null;

    try {
        const { data, error } = await window.titanClient.rpc('titan_purchase_shop_item', { p_item_id: item.id });
        if (error) {
            const msg = `${error.code || ''} ${error.message || ''}`.toUpperCase();
            if (error.code === 'PGRST202' || msg.includes('FUNCTION') || msg.includes('TITAN_PURCHASE_SHOP_ITEM')) return null;
            if (msg.includes('NO_FUNDS')) throw new Error('NO_FUNDS');
            if (msg.includes('DAILY')) throw new Error('LIMITE_ATTEINTE');
            if (msg.includes('WEEKLY')) throw new Error('LIMITE_HEBDO');
            if (msg.includes('LIMIT') || msg.includes('ONCE')) throw new Error('STOCK_EPUISE');
            if (window.titanIsSuspendedError?.(error)) throw new Error('ACCOUNT_SUSPENDED');
            throw error;
        }
        return Array.isArray(data) ? (data[0] || null) : (data || null);
    } catch (err) {
        if (err && ['NO_FUNDS', 'LIMITE_ATTEINTE', 'LIMITE_HEBDO', 'STOCK_EPUISE', 'ACCOUNT_SUSPENDED'].includes(err.message)) throw err;
        console.warn('[TITAN SHOP] Achat serveur indisponible:', err);
        return null;
    }
}

window.buyItem = async function(itemId, options = {}) {
    if(!window.state || !window.state.user) return;

    window.__titanPurchaseLocks = window.__titanPurchaseLocks || {};
    const lockKey = String(itemId || '');
    if (window.__titanPurchaseLocks[lockKey]) {
        if(typeof window.showNotification === 'function') window.showNotification('info', 'TRANSACTION', 'Validation deja en cours.');
        return;
    }
    window.__titanPurchaseLocks[lockKey] = Date.now();

    const btn = options?.button && options.button.nodeType === 1 ? options.button : null;
    const catalog = (typeof window.titanGetShopCatalog === 'function') ? window.titanGetShopCatalog() : (window.SHOP_DB || []);
    const item = catalog ? catalog.find(i => i.id === itemId) : null;
    
    if(!item) {
        delete window.__titanPurchaseLocks[lockKey];
        return (typeof window.showNotification === 'function') && window.showNotification('error', 'ERREUR', 'Article introuvable.');
    }

    let originalText = "";
    if (btn) {
        if(btn.disabled || btn.classList.contains('disabled')) {
            delete window.__titanPurchaseLocks[lockKey];
            return;
        }
        originalText = btn.innerHTML;
        btn.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> EN COURS...`;
        btn.classList.add('disabled');
        btn.disabled = true;
    }

    try {
        if (window.titanClient && window.state.user.id && !window.state.user.id.startsWith('guest_') && item.cooldown) {
            if (item.cooldown.type === 'daily') {
                const twentyFourHoursAgo = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();
                const { data, error } = await window.titanClient
                    .from('shop_history')
                    .select('id')
                    .eq('user_id', window.state.user.id)
                    .eq('item_id', item.id)
                    .gte('purchased_at', twentyFourHoursAgo)
                    .limit(1);
                if (error || (data && data.length > 0)) throw new Error("LIMITE_ATTEINTE");
            }
            else if (item.cooldown.type === 'weekly') {
                const sevenDaysAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString();
                const { count, error } = await window.titanClient
                    .from('shop_history')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', window.state.user.id)
                    .eq('item_id', item.id)
                    .gte('purchased_at', sevenDaysAgo);
                if (error) throw new Error("ERREUR_RESEAU");
                const maxAllowed = item.cooldown.max || 3;
                if (count >= maxAllowed) throw new Error("LIMITE_HEBDO");
            }
        } else {
            if(!window.checkPurchaseLimit(item)) throw new Error("STOCK_EPUISE");
        }

        if(item.requiresElite && !(window.state.user.is_elite === true)) {
            throw new Error("ELITE_REQ");
        }

        if(item.type === 'ad') {
            if(typeof window.triggerClickAd !== 'function') throw new Error("ADS_UNAVAILABLE");
            if (btn) btn.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> PUBLICITE...`;
            await window.triggerClickAd();
            if (btn) btn.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> VALIDATION...`;
            await new Promise(resolve => setTimeout(resolve, 10000));
            if(typeof window.checkPurchaseLimit === 'function' && !window.checkPurchaseLimit(item)) throw new Error("STOCK_EPUISE");
        } 
        else {
            if(item.type === 'upgrade') {
                const currentLvl = window.state.user.upgrades.battery || 0;
                if(item.effectVal > currentLvl + 1) throw new Error("LEVEL_REQ");
            }
            if(window.state.user.credits < item.price) throw new Error("NO_FUNDS");
        }

        await finalizePurchase(item, (item.type === 'ad' ? 0 : item.price));

    } catch (err) {
        if (btn) {
            btn.innerHTML = originalText;
            btn.classList.remove('disabled');
            btn.disabled = false;
        }

        let title = 'ERREUR';
        let msg = 'Transaction annulée.';
        
        if (err.message === "LIMITE_ATTEINTE") { title = 'LIMITE'; msg = 'Reviens dans 24h.'; }
        else if (err.message === "LIMITE_HEBDO") { title = 'LIMITE SEMAINE'; msg = `Max ${item.cooldown ? (item.cooldown.max || 3) : 3} par semaine.`; }
        else if (err.message === "STOCK_EPUISE") { title = 'STOCK'; msg = 'Limite atteinte.'; }
        else if (err.message === "NO_FUNDS") { title = 'FOND INSUFFISANTS'; msg = `Manque ${item.price - window.state.user.credits} Crédits.`; }
        else if (err.message === "LEVEL_REQ") { title = 'VERROUILLÉ'; msg = 'Niveau précédent requis.'; }
        else if (err.message === "ELITE_REQ") { title = 'TITAN+ REQUIS'; msg = 'Ce cosmétique appartient à la collection TITAN+.'; }
        else if (err.message === "ACCOUNT_SUSPENDED") { title = 'COMPTE SUSPENDU'; msg = 'Action bloquee par moderation.'; }
        else if (err.message === "ADS_CONSENT_REQUIRED") { title = 'CONSENTEMENT'; msg = 'Accepte la publicite pour recuperer cette prime.'; }
        else if (err.message === "ADS_PAGE_BLOCKED") { title = 'PUB DESACTIVEE'; msg = 'Cette page ne peut pas charger de publicite.'; }
        else if (err.message === "ADS_UNAVAILABLE") { title = 'PUB INDISPONIBLE'; msg = 'Reessaie dans quelques instants.'; }
        else if (err.message === "SERVER_AUTHORITY_REQUIRED") { title = 'VALIDATION SERVEUR'; msg = 'Achat bloque tant que la RPC boutique n est pas disponible.'; }
        
        if(typeof window.showNotification === 'function') window.showNotification('error', title, msg);
    } finally {
        delete window.__titanPurchaseLocks[lockKey];
    }
};

async function finalizePurchase(item, cost) {
    const serverPurchase = await purchaseShopItemOnServer(item);
    const isCloudUser = !!(window.titanClient && window.state?.user?.id && !window.state.user.id.startsWith('guest_'));
    if (isCloudUser && !serverPurchase) {
        throw new Error('SERVER_AUTHORITY_REQUIRED');
    }
    const serverPurchasedAt = serverPurchase?.purchased_at || serverPurchase?.purchasedAt || null;
    if (serverPurchase && typeof serverPurchase.credits_after !== 'undefined') {
        window.state.user.credits = Number(serverPurchase.credits_after || 0);
    } else {
        window.state.user.credits -= cost;
    }
    let msg = "";
    const now = serverPurchasedAt || new Date().toISOString();
    if (!window.state.user.purchase_history) window.state.user.purchase_history = [];
    window.state.user.purchase_history.push({ item_id: item.id, itemId: item.id, purchased_at: now, date: now, mode: serverPurchase ? 'server' : 'local' });
    
    if (item.type === 'cosmetic') {
        if (item.cosmeticId && typeof window.titanUnlockCosmetic === 'function') window.titanUnlockCosmetic(item.cosmeticId);
        msg = `${item.name} ajoute a la collection.`;
    }
    else if (item.type === 'charge') {
        window.addCharge(item.effectVal);
        msg = `Surcharge activée : +${item.effectVal} Energie !`;
    }
    else if (item.type === 'upgrade') {
        window.state.user.upgrades.battery = item.effectVal;
        msg = `Système mis à niveau : MK${item.effectVal}.`;
    }
    else if (item.type === 'ad') {
        if (!serverPurchase) window.state.user.credits += item.effectVal;
        msg = `Prime publicitaire : +${item.effectVal} Crédits.`;
    }
    else {
        msg = `${item.name} acquis !`;
    }

    if(typeof window.saveState === 'function') window.saveState({ forceCloud: true });
    if(typeof window.showNotification === 'function') window.showNotification('success', 'TRANSACTION VALIDÉE', msg);
    if(typeof window.updateGlobalUI === 'function') window.updateGlobalUI();

    if (window.titanClient && window.state.user.id && !window.state.user.id.startsWith('guest_')) {
        if(!window.PURCHASE_HISTORY) window.PURCHASE_HISTORY = [];
        window.PURCHASE_HISTORY.push({ item_id: item.id, user_id: window.state.user.id, purchased_at: now, mode: serverPurchase ? 'server' : 'local' });
        if (!serverPurchase) {
            const { error } = await window.titanClient.from('shop_history').insert({ user_id: window.state.user.id, item_id: item.id });
            if (error) {
                console.warn("Shop history DB Error:", error);
                if(typeof window.showNotification === 'function') window.showNotification('warning', 'ACHAT LOCAL', 'Historique boutique non synchronise.');
            }
        }
    }
    
    if(typeof window.renderShop === 'function') window.renderShop();
}

/* =========================================
   SOCIAL (DÉFIS & PARIS)
   ========================================= */

window.createWager = async function() {window.showNotification?.('info','Défis','Les mises en crédits sont désactivées. Utilise un défi sportif sans mise.');};
window.createGhost = async function(opponentId,sport,targetVal) {
    const {error}=await window.titanClient.rpc('titan_create_social_challenge',{p_opponent:opponentId,p_sport:sport,p_target:targetVal});
    window.showNotification?.(error?'error':'success','Défi sportif',error?'Le défi n’a pas pu être créé.':'Invitation créée, sans mise de crédits.');
};
window.checkActiveChallenges = async function() {};
window.resolveWagers = async function() {};

window.getCurrentWeekId = function(d = new Date()) {
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    return d.getFullYear() + "-W" + week;
};

function titanWeekIndexFromId(weekId) {
    const match = String(weekId || '').match(/^(\d{4})-W(\d{1,2})$/);
    if (!match) return null;
    return (parseInt(match[1], 10) * 53) + parseInt(match[2], 10);
}

window.validateWeeklyActivity = async function() {
    const user = window.state.user; const currentWeek = window.getCurrentWeekId();
    if (user.last_week_id === currentWeek) return;
    
    const previousWeek = user.last_week_id || '';
    const previousIndex = titanWeekIndexFromId(previousWeek);
    const currentIndex = titanWeekIndexFromId(currentWeek);
    const missedWeeks = previousIndex && currentIndex ? Math.max(0, currentIndex - previousIndex - 1) : 0;
    if (isNaN(user.streak_shields)) user.streak_shields = 1;

    let streakMessage = 'Semaine validee !';
    if (!previousWeek || !previousIndex || !currentIndex) {
        user.streak_count = Math.max(1, user.streak_count || 0);
    } else if (missedWeeks === 0) {
        user.streak_count = (user.streak_count || 0) + 1;
    } else if (missedWeeks === 1 && user.streak_shields > 0) {
        user.streak_shields -= 1;
        user.streak_count = (user.streak_count || 0) + 1;
        streakMessage = 'Semaine manquee absorbee par une protection.';
    } else {
        user.streak_count = 1;
        streakMessage = 'Nouvelle serie lancee.';
    }

    if (user.streak_count > 0 && user.streak_count % 4 === 0 && user.streak_shields < 2) {
        user.streak_shields += 1;
        streakMessage += ' Protection gagnee.';
    }
    user.last_week_id = currentWeek; 
    if(typeof window.saveState === 'function') window.saveState();
    
    const bonus = Math.min(user.streak_count * 5, 50);
    if(typeof window.showNotification === 'function') {
        window.showNotification('success', 'SERIE HEBDO', `${streakMessage} Bonus actuel : +${bonus}% | Protections: ${user.streak_shields}`);
        return;
    }
    if(typeof window.showNotification === 'function') window.showNotification('success', 'SÉRIE HEBDO', `Semaine validée ! Bonus actuel : +${bonus}%`);
};

window.calculateRewardsWithBonus = function(baseCredits) {
    const streak = window.state.user.streak_count || 0;
    const bonusPercent = Math.min(streak * 5, 50);
    const bonusAmount = Math.floor(baseCredits * (bonusPercent / 100));
    return { total: baseCredits + bonusAmount, base: baseCredits, bonus: bonusAmount, percent: bonusPercent };
};

window.loadTitanPaddleSdk = function() {
    if (window.Paddle) return Promise.resolve(window.Paddle);
    if (window.__titanPaddleSdkPromise) return window.__titanPaddleSdkPromise;

    window.__titanPaddleSdkPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
        script.async = true;
        script.onload = () => window.Paddle ? resolve(window.Paddle) : reject(new Error('Paddle SDK unavailable'));
        script.onerror = () => reject(new Error('Paddle SDK load failed'));
        document.head.appendChild(script);
    });

    return window.__titanPaddleSdkPromise;
};

window.buildEliteCheckoutData = function() {
    if (!window.state || !window.state.user || window.state.user.id.startsWith('guest_')) return null;

    const paddleConfig = window.TITAN_PADDLE || {};
    if (!paddleConfig.clientToken || !paddleConfig.elitePriceId) return null;

    return {
        clientToken: paddleConfig.clientToken,
        environment: paddleConfig.environment || 'production',
        checkout: {
            items: [{ priceId: paddleConfig.elitePriceId, quantity: 1 }],
            customData: { user_id: window.state.user.id },
            settings: {
                displayMode: 'overlay',
                theme: 'dark',
                locale: 'fr'
            }
        }
    };
};

window.initTitanPaddleCheckout = async function(checkoutData) {
    const paddle = await window.loadTitanPaddleSdk();
    if (!window.__titanPaddleInitialized) {
        if (checkoutData.environment === 'sandbox' && paddle.Environment && typeof paddle.Environment.set === 'function') {
            paddle.Environment.set('sandbox');
        }
        paddle.Initialize({ token: checkoutData.clientToken });
        window.__titanPaddleInitialized = true;
    }
    return paddle;
};

window.openEliteCheckout = async function(options = {}) {
    const now = Date.now();
    if (window.__titanEliteCheckoutLock && now - window.__titanEliteCheckoutLock < 5000) {
        if(typeof window.showNotification === 'function') window.showNotification('info', 'PAIEMENT', 'Ouverture du paiement deja en cours.');
        return false;
    }
    window.__titanEliteCheckoutLock = now;

    const btn = options?.button && options.button.nodeType === 1 ? options.button : null;
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> OUVERTURE...`;
        btn.classList.add('disabled');
        btn.setAttribute('aria-busy', 'true');
        btn.style.pointerEvents = 'none';
    }

    const checkoutData = window.buildEliteCheckoutData();
    if (!window.state || !window.state.user || window.state.user.id.startsWith('guest_')) {
        if(typeof window.showNotification === 'function') window.showNotification('error', 'CONNEXION REQUISE', 'Connecte-toi pour rattacher Elite a ton profil.');
        if (btn) {
            btn.innerHTML = originalText;
            btn.classList.remove('disabled');
            btn.removeAttribute('aria-busy');
            btn.style.pointerEvents = '';
        }
        setTimeout(() => { delete window.__titanEliteCheckoutLock; }, 1500);
        setTimeout(() => { window.location.href = 'login.html'; }, 700);
        return false;
    }

    if (!checkoutData) {
        if(typeof window.showNotification === 'function') window.showNotification('error', 'PAIEMENT', 'Le checkout Paddle Elite doit encore etre configure.');
        if (btn) {
            btn.innerHTML = originalText;
            btn.classList.remove('disabled');
            btn.removeAttribute('aria-busy');
            btn.style.pointerEvents = '';
        }
        setTimeout(() => { delete window.__titanEliteCheckoutLock; }, 1500);
        return false;
    }

    try {
        const paddle = await window.initTitanPaddleCheckout(checkoutData);
        paddle.Checkout.open(checkoutData.checkout);
        return true;
    } catch (error) {
        console.error('[Elite] Paddle checkout unavailable:', error);
        if(typeof window.showNotification === 'function') window.showNotification('error', 'PAIEMENT', 'Impossible d ouvrir Paddle pour le moment.');
        return false;
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.classList.remove('disabled');
            btn.removeAttribute('aria-busy');
            btn.style.pointerEvents = '';
        }
        setTimeout(() => { delete window.__titanEliteCheckoutLock; }, 1500);
    }
};

window.setupElitePayment = function() {
    const btn = document.getElementById('buy-elite-btn');
    if (!btn) return;
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.openEliteCheckout({ button: newBtn });
    });
};

/* =========================================
   MARKETING
   ========================================= */

window.initMarketingOps = function() {
    localStorage.removeItem('titan_last_ad_timestamp');
};
if (typeof window.checkAdTimer !== 'function') window.checkAdTimer = function() {};
if (typeof window.triggerAdScript !== 'function') window.triggerAdScript = function() {};
if (typeof window.triggerClickAd !== 'function') {
    window.triggerClickAd = function() {
        return Promise.reject(new Error('ADS_UNAVAILABLE'));
    };
}
if (typeof window.detectAdBlock !== 'function') window.detectAdBlock = function() {};
if (typeof window.triggerLockout !== 'function') window.triggerLockout = function() {};

/* =========================================
   MODULE DEV (TESTEUR)
   ========================================= */

window.initDevTools = function() {
    if (window.TITAN_ENABLE_DEV_TOOLS !== true) return;
    // Sécurité : n'affiche le panneau QUE si l'utilisateur a le statut testeur
    if (!window.state || !window.state.user || window.state.user.is_tester !== true) return;
    if (document.getElementById('titan-dev-panel')) return;

    // Conteneur principal du menu
    const devUI = document.createElement('div');
    devUI.id = 'titan-dev-panel';
    devUI.style.cssText = `
        position: fixed; bottom: 20px; left: 20px; z-index: 100000;
        background: rgba(10, 10, 15, 0.95); border: 1px solid #22c55e;
        border-radius: 8px; width: 320px; max-height: 80vh; overflow-y: auto;
        box-shadow: 0 0 30px rgba(34, 197, 94, 0.2); font-family: 'Courier New', monospace;
        color: #fff; display: flex; flex-direction: column; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        transform: translateX(calc(-100% - 25px));
    `;

    // Le code HTML interne du panneau (Boutons d'actions)
    devUI.innerHTML = `
        <div style="padding: 12px; background: #22c55e; color: #000; font-family: 'Russo One'; text-align: center; letter-spacing: 1px;">TITAN DEV MODE</div>
        <div style="padding: 15px; display: flex; flex-direction: column; gap: 20px; font-size: 0.8rem;">
            
            <div>
                <div style="color: #22c55e; margin-bottom: 8px; border-bottom: 1px dashed #22c55e; padding-bottom: 3px;">[ ECONOMY ]</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <button onclick="devAdd('credits', 10000)" style="background:#1e293b; border:1px solid #475569; color:#fff; padding:8px; border-radius:4px; cursor:pointer;">+10k CR</button>
                    <button onclick="devAdd('xp', 5000)" style="background:#1e293b; border:1px solid #475569; color:#fff; padding:8px; border-radius:4px; cursor:pointer;">+5k XP</button>
                    <button onclick="devMaxCharge()" style="background:#1e293b; border:1px solid #475569; color:#fff; padding:8px; border-radius:4px; cursor:pointer; grid-column: span 2;">MAX BATTERY</button>
                </div>
            </div>

            <div>
                <div style="color: #ef4444; margin-bottom: 8px; border-bottom: 1px dashed #ef4444; padding-bottom: 3px;">[ COMBAT ]</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <button onclick="devKill()" style="background:#1e293b; border:1px solid #475569; color:#fff; padding:8px; border-radius:4px; cursor:pointer;">KILL MOB</button>
                    <button onclick="devForceBoss()" style="background:#1e293b; border:1px solid #475569; color:#fff; padding:8px; border-radius:4px; cursor:pointer;">SPAWN BOSS</button>
                    <button onclick="devGiveGrenades()" style="background:#1e293b; border:1px solid #475569; color:#fff; padding:8px; border-radius:4px; cursor:pointer; grid-column: span 2;">+10 ALL GRENADES</button>
                </div>
            </div>

            <div>
                <div style="color: #38bdf8; margin-bottom: 8px; border-bottom: 1px dashed #38bdf8; padding-bottom: 3px;">[ SYSTEM ]</div>
                <div style="display: grid; grid-template-columns: 1fr; gap: 8px;">
                    <button onclick="devToggleElite()" style="background:#1e293b; border:1px solid #475569; color:#fff; padding:8px; border-radius:4px; cursor:pointer;">TOGGLE ELITE</button>
                    <button onclick="devResetShop()" style="background:#1e293b; border:1px solid #475569; color:#fff; padding:8px; border-radius:4px; cursor:pointer;">RESET SHOP LIMITS</button>
                    <button onclick="devCaptureState()" style="background:#1e293b; border:1px solid #475569; color:#fff; padding:8px; border-radius:4px; cursor:pointer;">CAPTURE STATE</button>
                </div>
            </div>
        </div>
    `;

    // Le bouton pour ouvrir/fermer le panneau
    const toggleBtn = document.createElement('div');
    toggleBtn.innerHTML = '<i class="ri-terminal-box-fill"></i>';
    toggleBtn.style.cssText = `
        position: absolute; right: -45px; bottom: 15px; width: 45px; height: 45px;
        background: #22c55e; color: #000; display: flex; align-items: center; justify-content: center;
        border-radius: 0 8px 8px 0; cursor: pointer; font-size: 1.5rem;
        box-shadow: 5px 0 15px rgba(34, 197, 94, 0.3); border: 1px solid #16a34a; border-left: none;
    `;
    
    let isOpen = false;
    toggleBtn.onclick = () => {
        isOpen = !isOpen;
        devUI.style.transform = isOpen ? 'translateX(0)' : 'translateX(calc(-100% - 25px))';
    };
    
    devUI.appendChild(toggleBtn);
    document.body.appendChild(devUI);
};

// --- LOGIQUE DES ACTIONS DEV ---
function titanCanUseDevTools() {
    return !!(
        window.TITAN_ENABLE_DEV_TOOLS === true &&
        window.state &&
        window.state.user &&
        window.state.user.is_tester === true
    );
}

window.devAdd = function(type, val) {
    if (!titanCanUseDevTools()) return false;
    if(type === 'credits') window.state.user.credits += val;
    if(type === 'xp') { window.state.user.xp += val; window.checkLevelUp(); }
    if(typeof window.saveState === 'function') window.saveState();
    if(typeof window.updateGlobalUI === 'function') window.updateGlobalUI();
    if(typeof window.showNotification === 'function') window.showNotification('success', 'DEV MODE', `+${val} ${type.toUpperCase()}`);
};

window.devMaxCharge = function() {
    if (!titanCanUseDevTools()) return false;
    if(!window.state.game) return;
    window.state.game.storedDmg = 99999;
    if(typeof window.saveState === 'function') window.saveState();
    if(typeof window.updateCapacitorUI === 'function') window.updateCapacitorUI();
    if(typeof window.showNotification === 'function') window.showNotification('success', 'DEV MODE', 'Batterie surchargee.');
};

window.devKill = function() {
    if (!titanCanUseDevTools()) return false;
    if(window.state.game && window.state.game.currentEnemy) {
        window.state.game.currentEnemy.hp = 0;
        if(typeof window.renderAdventureUI === 'function') window.renderAdventureUI();
        if(typeof window.fireMainWeapon === 'function') window.fireMainWeapon(); // Simule un tir pour déclencher la victoire
    }
};

window.devForceBoss = function() {
    if (!titanCanUseDevTools()) return false;
    if(window.state.game) {
        window.state.game.mobsDefeated = 5; // Simule qu'on a tué les 5 mobs
        window.state.game.currentEnemy = null; // Force le respawn au prochain rendu
        if(typeof window.renderAdventureUI === 'function') window.renderAdventureUI();
        if(typeof window.showNotification === 'function') window.showNotification('error', 'DEV MODE', 'Boss force.');
    }
};

window.devGiveGrenades = function() {
    if (!titanCanUseDevTools()) return false;
    if(!window.state.user.inventory) window.state.user.inventory = {};
    ['g_rusty', 'g_frag', 'g_tac', 'g_plasma', 'g_gold'].forEach(g => {
        window.state.user.inventory[g] = (window.state.user.inventory[g] || 0) + 10;
    });
    if(typeof window.saveState === 'function') window.saveState();
    if(typeof window.renderAdventureUI === 'function') window.renderAdventureUI();
    if(typeof window.showNotification === 'function') window.showNotification('success', 'DEV MODE', 'Inventaire de test recharge.');
};

window.devToggleElite = function() {
    if (!titanCanUseDevTools()) return false;
    window.state.user.is_elite = !window.state.user.is_elite;
    if(typeof window.saveState === 'function') window.saveState();
    if(typeof window.updateGlobalUI === 'function') window.updateGlobalUI();
    if(typeof window.showNotification === 'function') window.showNotification('info', 'DEV MODE', 'Statut Elite: ' + (window.state.user.is_elite ? 'ACTIF' : 'INACTIF'));
};

window.devResetShop = function() {
    if (!titanCanUseDevTools()) return false;
    window.PURCHASE_HISTORY = [];
    if (window.state.user.purchase_history) window.state.user.purchase_history = [];
    if(typeof window.saveState === 'function') window.saveState({ forceCloud: true });
    if(typeof window.showNotification === 'function') window.showNotification('success', 'DEV MODE', 'Limites boutique effacees.');
};

window.devCaptureState = function() {
    if (!titanCanUseDevTools()) return false;
    window.__titanLastDebugState = window.state;
    if(typeof window.showNotification === 'function') {
        window.showNotification('info', 'DEV MODE', 'State capture dans window.__titanLastDebugState.');
    }
    return true;
};
