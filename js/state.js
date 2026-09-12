/* =========================================
   TITAN OS - STATE MANAGEMENT (DATA & SYNC)
   ========================================= */

window.TITAN_DB_STATUS = window.TITAN_DB_STATUS || { issues: [], softIssues: [] };
window.TITAN_DB_STATUS.issues = window.TITAN_DB_STATUS.issues || [];
window.TITAN_DB_STATUS.softIssues = window.TITAN_DB_STATUS.softIssues || [];
window.TITAN_CLOUD_SYNC_DELAY_MS = 2000;
window.TITAN_CACHE_RECONCILIATION_VERSION = 'v1';
const TITAN_PROFILE_SYNC_DIAG_KEY = 'titan_profile_sync_diag_v1';
const TITAN_CORE_DATA_TABLES = new Set(['mobs', 'bosses', 'sports', 'shop_items']);
const TITAN_SOFT_DATA_TABLES = new Set([
    'achievements_config',
    'global_config',
    'fun_stats',
    'talents',
    'user_achievements',
    'shop_history',
    'social_challenges'
]);

function isCloudUser() {
    return !!(window.state && window.state.user && window.state.user.id && !window.state.user.id.startsWith('guest_'));
}

function trackDbIssue(scope, error) {
    if (!error) return;
    if (typeof window.titanSetSyncStatus === 'function') {
        window.titanSetSyncStatus(error.code === 'OFFLINE_CACHE' ? 'offline' : 'error', error.message || 'Sync partielle');
    }
    const issue = {
        scope,
        code: error.code || 'UNKNOWN',
        message: error.message || String(error)
    };
    window.TITAN_DB_STATUS.issues.push(issue);
    console.warn(`[TITAN DB] ${scope}:`, error);
}

function trackDbSoftIssue(scope, error) {
    if (!error) return;
    const issue = {
        scope,
        code: error.code || 'UNKNOWN',
        message: error.message || String(error)
    };
    window.TITAN_DB_STATUS.softIssues.push(issue);
    console.warn(`[TITAN DB][soft] ${scope}:`, error);
}

function recordProfileSyncDiagnostic(status, info = {}) {
    const entry = Object.assign({
        status,
        at: new Date().toISOString()
    }, info);
    try { localStorage.setItem(TITAN_PROFILE_SYNC_DIAG_KEY, JSON.stringify(entry)); }
    catch (_) {}
    window.titanLastProfileSyncDiagnostic = entry;
    return entry;
}

window.titanGetProfileSyncDiagnostic = function() {
    try { return JSON.parse(localStorage.getItem(TITAN_PROFILE_SYNC_DIAG_KEY) || 'null'); }
    catch (_) { return window.titanLastProfileSyncDiagnostic || null; }
};

function titanIsOptionalBackendMissing(error) {
    const text = `${error?.code || ''} ${error?.message || error || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    return (
        text.includes('pgrst202') ||
        text.includes('pgrst205') ||
        text.includes('could not find the function') ||
        text.includes('could not find the table') ||
        text.includes('schema cache')
    );
}

function extractMissingColumn(error) {
    const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
    const patterns = [
        /'([^']+)' column/i,
        /column ['"]?([a-zA-Z0-9_]+)['"]?/i,
        /schema cache.*['"]([a-zA-Z0-9_]+)['"]/i
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) return match[1];
    }
    return null;
}

function cloneStateForCloud(state) {
    try {
        return JSON.parse(JSON.stringify(state));
    } catch (e) {
        console.warn("[TITAN DB] Impossible de cloner l'etat avant sync cloud:", e);
        return state;
    }
}

function compactLocalTrainingDetails(details = {}) {
    const reward = details.serverReward && typeof details.serverReward === 'object' ? details.serverReward : null;
    const rewardMeta = details.rewardMeta && typeof details.rewardMeta === 'object' ? details.rewardMeta : null;
    const gpxStats = details.gpxStats && typeof details.gpxStats === 'object' ? {
        pace: details.gpxStats.pace || '',
        speed: details.gpxStats.speed || '',
        movingMinutes: Number(details.gpxStats.movingMinutes || 0),
        ascent: Number(details.gpxStats.ascent || 0)
    } : null;
    return {
        client_event_id: details.client_event_id,
        schemaVersion: details.schemaVersion,
        timezone: details.timezone,
        val1: Number(details.val1 || 0),
        val2: Number(details.val2 || 0),
        elevation: Number(details.elevation || 0),
        load: Number(details.load || 0),
        summary: String(details.summary || '').slice(0, 220),
        note: String(details.note || '').slice(0, 220),
        performedAt: String(details.performedAt || '').slice(0, 32),
        tags: Array.isArray(details.tags) ? details.tags.slice(0, 3) : [],
        exercises: Array.isArray(details.exercises) ? details.exercises.slice(0, 80).map(ex => ({
            name: String(ex?.name || '').slice(0, 80),
            weight: Number(ex?.weight || 0),
            sets: Number(ex?.sets || 0),
            reps: Number(ex?.reps || 0),
            rir: Number(ex?.rir || 0),
            totalReps: Number(ex?.totalReps || 0),
            volume: Number(ex?.volume || 0),
            setRows: Array.isArray(ex?.setRows) ? ex.setRows.slice(0, 30).map(set => ({ weight: Number(set?.weight || 0), reps: Number(set?.reps || 0), rir: Number(set?.rir || 0) })) : [],
            notes: String(ex?.notes || '').slice(0, 180)
        })) : [],
        bio: details.bio && typeof details.bio === 'object' ? {
            rpe: Number(details.bio.rpe || 0),
            sleep: Number(details.bio.sleep || 0),
            nutrition: Number(details.bio.nutrition || 0)
        } : null,
        extras: details.extras && typeof details.extras === 'object' ? details.extras : {},
        gpxStats,
        rewardMeta: rewardMeta ? {
            credits: Number(rewardMeta.credits || 0),
            weeklyCapped: rewardMeta.weeklyCapped === true,
            rulesVersion: rewardMeta.rulesVersion || ''
        } : null,
        serverReward: reward ? {
            xp: Number(reward.xp || 0),
            credits: Number(reward.credits || 0),
            weekly_xp_remaining: Number(reward.weekly_xp_remaining || 0)
        } : null
    };
}

function compactLocalTrainingLog(log = {}) {
    return {
        id: log.id || null,
        client_event_id: log.client_event_id || log.details?.client_event_id || null,
        syncStatus: log.syncStatus || "confirmed",
        revision: log.revision || 1,
        archived_at: log.archived_at || null,
        date: log.date || null,
        sport: log.sport || null,
        cat: log.cat || log.category || 'training',
        val: Number(log.val || 0),
        unit: log.unit || '',
        xp: Number(log.xp || 0),
        details: compactLocalTrainingDetails(log.details || {})
    };
}

function cloneProfileStateForCloud(state) {
    const snapshot = cloneStateForCloud(state);
    if (!snapshot || typeof snapshot !== 'object') return snapshot;
    snapshot.history = [];
    snapshot.archivedHistory = [];
    if (snapshot.user && Array.isArray(snapshot.user.purchase_history)) snapshot.user.purchase_history = [];
    snapshot.meta = Object.assign({}, snapshot.meta || {}, { historyAuthority: 'training_logs' });
    return snapshot;
}

function cloneStateForLocalStorage(state) {
    const snapshot = cloneStateForCloud(state);
    if (!snapshot || typeof snapshot !== 'object') return snapshot;
    snapshot.archivedHistory = [];
    const isConnected = !!(snapshot.user?.id && !String(snapshot.user.id).startsWith('guest_'));
    if (!isConnected) return snapshot;

    snapshot.history = (Array.isArray(snapshot.history) ? snapshot.history : [])
        .sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,50)
        .map(compactLocalTrainingLog);
    if (snapshot.user && Array.isArray(snapshot.user.purchase_history)) snapshot.user.purchase_history = [];
    snapshot.meta = Object.assign({}, snapshot.meta || {}, {
        historyAuthority: 'training_logs',
        localHistoryWindow: 50
    });
    return snapshot;
}

function getStateUpdatedAtValue(state) {
    const raw = state?.meta?.updatedAt || state?.updatedAt || null;
    const value = raw ? Date.parse(raw) : 0;
    return Number.isFinite(value) ? value : 0;
}

function titanHashString(value) {
    let hash = 2166136261;
    const input = String(value || '');
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
}

function titanBuildCacheReconciliationPayload(state) {
    if (!state || typeof state !== 'object') return null;

    const user = state.user || {};
    const history = Array.isArray(state.history) ? state.history : [];
    const inventory = user.inventory || state.inventory || {};
    return {
        user: {
            id: user.id || null,
            name: user.name || user.username || null,
            level: Number(user.level || 1),
            xp: Number(user.xp || 0),
            credits: Number(user.credits || 0),
            avatar: user.avatar || null,
            inventory,
            unlockedAchievements: Array.isArray(user.unlockedAchievements) ? user.unlockedAchievements : [],
            unlockedTalents: Array.isArray(user.unlockedTalents) ? user.unlockedTalents : []
        },
        game: {
            bossLevel: Number(state.game?.bossLevel || 1),
            mobsDefeated: Number(state.game?.mobsDefeated || 0),
            storedDmg: Number(state.game?.storedDmg || 0)
        },
        history: history.map(log => ({
            id: log?.id || null,
            date: log?.date || null,
            sport: log?.sport || null,
            xp: Number(log?.xp || 0),
            val: Number(log?.val || 0)
        })),
        meta: {
            updatedAt: state.meta?.updatedAt || state.updatedAt || null,
            reconciliationVersion: window.TITAN_CACHE_RECONCILIATION_VERSION
        }
    };
}

function titanHasMeaningfulLocalProgress(state) {
    if (!state || !state.user) return false;
    const user = state.user;
    const history = Array.isArray(state.history) ? state.history : [];
    const inventory = user.inventory || state.inventory || {};
    return !!(
        user.avatar ||
        Number(user.level || 1) > 1 ||
        Number(user.xp || 0) > 0 ||
        Number(user.credits || 0) > 200 ||
        history.length > 0 ||
        Object.keys(inventory || {}).length > 1 ||
        (Array.isArray(user.unlockedAchievements) && user.unlockedAchievements.length > 0) ||
        (Array.isArray(user.unlockedTalents) && user.unlockedTalents.length > 0)
    );
}

window.titanMaybeSubmitCacheReconciliation = async function(localStateSnapshot) {
    if (!window.titanClient || !localStateSnapshot || !titanHasMeaningfulLocalProgress(localStateSnapshot)) return null;
    if (!window.titanClient.rpc || typeof window.titanClient.rpc !== 'function') return null;
    let storageKey = '';
    let signature = '';

    try {
        const sessionResult = await withTitanTimeout(window.titanClient.auth.getSession(), 4000, 'Session audit cache');
        const userId = sessionResult?.data?.session?.user?.id;
        if (!userId) return null;

        const localId = localStateSnapshot?.user?.id || '';
        if (localId && localId !== userId && !String(localId).startsWith('guest_')) return null;

        const payload = titanBuildCacheReconciliationPayload(localStateSnapshot);
        if (!payload) return null;

        signature = titanHashString(JSON.stringify(payload));
        storageKey = `titan_cache_reconciliation_${window.TITAN_CACHE_RECONCILIATION_VERSION}_${userId}`;
        const previous = safeObject(localStorage.getItem(storageKey));
        if (previous.signature === signature && Date.now() - Number(previous.sentAt || 0) < 24 * 60 * 60 * 1000) {
            return null;
        }

        const { data, error } = await withTitanTimeout(
            window.titanClient.rpc('titan_submit_cache_reconciliation', { p_local_state: payload }),
            6000,
            'Audit cache local'
        );

        if (error) {
            if (titanIsOptionalBackendMissing(error)) {
                trackDbSoftIssue('cache.reconciliation.optional', error);
                localStorage.setItem(storageKey, JSON.stringify({
                    signature,
                    sentAt: Date.now(),
                    skipped: true,
                    reason: error.code || 'OPTIONAL_BACKEND_MISSING'
                }));
                return null;
            }
            trackDbIssue('cache.reconciliation', error);
            return null;
        }

        localStorage.setItem(storageKey, JSON.stringify({
            signature,
            sentAt: Date.now(),
            reportId: data?.reportId || null
        }));

        const diff = data?.differences || {};
        const hasUsefulDiff = !!(
            diff.avatarDiff ||
            Number(diff.historyCountDelta || 0) > 0 ||
            Number(diff.levelDelta || 0) > 0 ||
            Number(diff.creditsDelta || 0) > 0 ||
            Number(diff.inventoryItemCountDelta || 0) > 0
        );

        if (hasUsefulDiff && typeof window.showNotification === 'function') {
            window.showNotification('info', 'AUDIT CACHE', 'Progression locale comparee au cloud. Rapport securise cree.');
        }

        return data;
    } catch (error) {
        if (titanIsOptionalBackendMissing(error)) {
            trackDbSoftIssue('cache.reconciliation.optional', error);
            if (storageKey && signature) {
                localStorage.setItem(storageKey, JSON.stringify({
                    signature,
                    sentAt: Date.now(),
                    skipped: true,
                    reason: error.code || 'OPTIONAL_BACKEND_MISSING'
                }));
            }
            return null;
        }
        trackDbIssue('cache.reconciliation', error);
        return null;
    }
};

function safeArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }
    return [];
}

function safeObject(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (e) {
            return {};
        }
    }
    return {};
}

function mapDynamicCreature(creature, kind) {
    const metadata = safeObject(creature.metadata);
    const level = Number(creature.required_level || metadata.level || 1) || 1;
    const id = creature.slug || creature.id;
    if (kind === 'boss') {
        return {
            id,
            name: creature.name,
            baseHp: Number(metadata.hp_max || metadata.baseHp || (900 + level * 160)),
            weak: metadata.weakness || creature.required_grade || 'general',
            level,
            img: creature.image_url,
            desc: creature.description || '',
            source: 'creatures'
        };
    }
    return {
        id,
        name: creature.name,
        img: creature.image_url,
        desc: creature.description || '',
        weak: metadata.weakness || creature.required_grade || 'general',
        rarity: creature.rarity,
        required_level: level,
        type: creature.type,
        source: 'creatures'
    };
}

function dedupeById(rows) {
    const seen = new Set();
    return safeArray(rows).filter(row => {
        const key = String(row?.id || row?.name || '').toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

window.titanCleanProfileName = window.titanCleanProfileName || function(value) {
    const base = typeof window.titanSafeText === 'function'
        ? window.titanSafeText(value, 24)
        : String(value ?? '').replace(/[\u0000-\u001F\u007F<>]/g, '').slice(0, 24);
    try {
        return base.replace(/[^\p{L}\p{N} _.'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
    } catch (_) {
        return base.replace(/[^A-Za-z0-9 _.'-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
    }
};

async function pushProfileStateToCloud() {
    if (!window.titanClient || !isCloudUser()) return null;

    if (typeof window.titanSetSyncStatus === 'function') window.titanSetSyncStatus('pending', 'Sauvegarde…');
    window.lastCloudSync = Date.now();
    const stateSnapshot = cloneProfileStateForCloud(window.state);
    const avatarValue = String(window.state.user.avatar || '').trim();
    const safeAvatar = /^avatar_\d+\.png$/i.test(avatarValue) || /^[a-z0-9_-]+_\d+\.(png|jpe?g|webp|gif)$/i.test(avatarValue)
        ? avatarValue
        : null;
    const updatePayload = {
        game_state: stateSnapshot,
        username: window.titanCleanProfileName(window.state.user.name) || 'Agent',
        avatar: safeAvatar,
        inventory: window.state.user.inventory,
        friend_code: window.state.user.friend_code,
        privacy: window.state.user.privacy || { publicProfile: true, showStats: true, socialPresence: true, friendRankings: false },
        streak_count: window.state.user.streak_count,
        last_week_id: window.state.user.last_week_id,
        updated_at: new Date().toISOString()
    };

    if (window.state.user.last_seen_news_version) {
        updatePayload.last_seen_news_version = window.state.user.last_seen_news_version;
    }

    if (typeof window.titanClient.rpc === 'function') {
        try {
            const { data, error } = await withTitanTimeout(
                window.titanClient.rpc('titan_save_profile_state', {
                    p_state: stateSnapshot,
                    p_username: updatePayload.username,
                    p_avatar: updatePayload.avatar,
                    p_inventory: updatePayload.inventory || {},
                    p_privacy: updatePayload.privacy || {},
                    p_streak_count: updatePayload.streak_count || 0,
                    p_last_week_id: updatePayload.last_week_id || '',
                    p_last_seen_news_version: updatePayload.last_seen_news_version || null
                }),
                7000,
                'Sauvegarde profil cloud'
            );

            if (!error) {
                applyCloudProfileStateResult(data);
                recordProfileSyncDiagnostic('synced', {
                    mode: 'rpc',
                    userId: window.state.user.id,
                    updatedAt: data?.updated_at || new Date().toISOString()
                });
                if (typeof window.titanSetSyncStatus === 'function') window.titanSetSyncStatus(window.TitanQueue?.list().length ? 'pending' : 'cloud', window.TitanQueue?.list().length ? 'Séance(s) en attente' : 'Synchronisé');
                if (typeof window.titanRefreshProgressionSnapshot === 'function') {
                    window.titanRefreshProgressionSnapshot({ silent: true }).catch(refreshError => {
                        trackDbSoftIssue('progression.snapshot.after_profile_sync', refreshError);
                    });
                }
                return null;
            }

            recordProfileSyncDiagnostic('error', {
                mode: 'rpc_required',
                code: error.code || '',
                message: error.message || String(error)
            });
            trackDbIssue('profiles.state.rpc', error);
            return error;
        } catch (rpcError) {
            recordProfileSyncDiagnostic('error', {
                mode: 'rpc_required',
                code: rpcError?.code || '',
                message: rpcError?.message || String(rpcError)
            });
            trackDbIssue('profiles.state.rpc', rpcError);
            return rpcError;
        }
    }

    const error = new Error('PROFILE_STATE_RPC_REQUIRED');
    error.code = 'PROFILE_STATE_RPC_REQUIRED';
    recordProfileSyncDiagnostic('error', {
        mode: 'rpc_required',
        message: 'La progression cloud doit passer par titan_save_profile_state.'
    });
    if (typeof window.titanSetSyncStatus === 'function') {
        window.titanSetSyncStatus('error', 'Sauvegarde indisponible');
    }
    return error;
}

function applyCloudProfileStateResult(profileResult) {
    const profile = profileResult && typeof profileResult === 'object' ? profileResult : {};
    if (!window.state?.user) return;
    if (profile.state_version) window.state.meta=Object.assign({},window.state.meta,{profileVersion:profile.state_version});
    if (profile.friend_code) window.state.user.friend_code = profile.friend_code;
    if (typeof profile.is_elite !== 'undefined') window.state.user.is_elite = profile.is_elite === true;
    if (typeof profile.is_tester !== 'undefined') window.state.user.is_tester = profile.is_tester === true;
    if (typeof profile.is_suspended !== 'undefined') window.state.user.is_suspended = profile.is_suspended === true;
    if (profile.last_seen_news_version) window.state.user.last_seen_news_version = profile.last_seen_news_version;
    if (typeof profile.credits !== 'undefined' && Number.isFinite(Number(profile.credits))) window.state.user.credits = Number(profile.credits);
    if (typeof profile.xp !== 'undefined' && Number.isFinite(Number(profile.xp))) window.state.user.xp = Number(profile.xp);
    if (typeof profile.level !== 'undefined' && Number.isFinite(Number(profile.level))) window.state.user.level = Number(profile.level);
}

window.safeProfileUpdate = async function(payload, userId) {
    if (!window.titanClient || !userId) return null;

    const cleanPayload = Object.assign({}, payload);
    const sensitiveKeys = ['game_state', 'credits', 'xp', 'level', 'inventory', 'streak_count', 'last_week_id'];
    if (sensitiveKeys.some(key => Object.prototype.hasOwnProperty.call(cleanPayload, key))) {
        const error = new Error('PROFILE_STATE_RPC_REQUIRED');
        error.code = 'PROFILE_STATE_RPC_REQUIRED';
        recordProfileSyncDiagnostic('blocked_direct_update', {
            keys: Object.keys(cleanPayload).filter(key => sensitiveKeys.includes(key)).join(',')
        });
        trackDbIssue('profiles.update.direct_blocked', error);
        return error;
    }
    for (let attempt = 0; attempt < 8; attempt++) {
        const { error } = await window.titanClient
            .from('profiles')
            .update(cleanPayload)
            .eq('id', userId);

        if (!error) return null;

        const missingColumn = extractMissingColumn(error);
        if (missingColumn && Object.prototype.hasOwnProperty.call(cleanPayload, missingColumn)) {
            console.warn(`[TITAN DB] Colonne profiles absente ignoree: ${missingColumn}`);
            delete cleanPayload[missingColumn];
            continue;
        }

        trackDbIssue('profiles.update', error);
        return error;
    }

    return null;
};

async function safeProfileInsert(payload) {
    const error = new Error('PROFILE_CREATE_RPC_REQUIRED');
    error.code = 'PROFILE_CREATE_RPC_REQUIRED';
    recordProfileSyncDiagnostic('blocked_direct_insert', {
        keys: Object.keys(payload || {}).join(',')
    });
    trackDbIssue('profiles.insert.direct_blocked', error);
    return error;
}

// 1. CHARGEMENT LOCAL
window.loadState = function() {
    try {
        const stored = localStorage.getItem(window.STATE_KEY);
        if (stored) {
            window.state = JSON.parse(stored);
            ensureStateIntegrity();
        } else {
            createDefaultState();
        }

        if (window.state && window.state.admin_message) {
            if (window.showNotification) window.showNotification('info', 'MESSAGE ADMIN', window.state.admin_message);
            else console.warn('[MESSAGE ADMIN]', window.state.admin_message);
            delete window.state.admin_message;
            saveState();
        }
    } catch (e) {
        console.error("Erreur lecture sauvegarde locale:", e);
        createDefaultState();
    }
};

// 2. VERIFICATION ET REPARATION DES DONNEES
window.ensureStateIntegrity = function() {
    if (!window.state) window.state = {};

    const previousUser = window.state.user || {};
    window.state.user = Object.assign({
        id: 'guest_' + Date.now(),
        name: "Recrue",
        level: 1,
        xp: 0,
        credits: 0,
        dailyXp: 0,
        lastDailyReset: null,
        avatar: null,
        buffs: {},
        upgrades: { battery: 0, marketing: 0 },
        inventory: {},
        is_elite: false,
        is_tester: false,
        is_suspended: false,
        streak_count: 0,
        streak_shields: 1,
        last_week_id: "",
        friend_code: null,
        unlockedTalents: [],
        unlockedAchievements: [],
        records: {},
        disciplineBadges: {},
        disciplineGoals: {},
        physicalQualities: {},
        coachSnapshot: null,
        archetype: null,
        reputation: null,
        campaignProfession: null,
        freshnessScore: null,
        returnPlan: null,
        loadCalendar: [],
        personalRivals: [],
        contextualRecords: [],
        plateauSignal: null,
        cooldownGuide: null,
        regularityBadges: [],
        monthlyReports: [],
        relics: [],
        campaignSeason: { id: 'season-01', label: 'Cycle Ferrite', progress: 0 },
        guildRole: null,
        dailyHealth: null,
        recoveryCheckIns: [],
        lastSessionSummary: null,
        adventureJournal: [],
        weeklyGoalSessions: 3,
        privacy: { publicProfile: true, showStats: true, socialPresence: true, friendRankings: false },
        unlockedTitles: ['title-recruit'],
        activeTitle: 'title-recruit',
        purchase_history: [],
        cosmetics: {
            unlocked: ['frame-standard', 'grenade-default', 'victory-standard'],
            active: {
                avatarFrame: 'frame-standard',
                grenadeSkin: 'grenade-default',
                victoryEffect: 'victory-standard'
            }
        }
    }, previousUser);

    if (isNaN(window.state.user.credits)) window.state.user.credits = 0;
    if (isNaN(window.state.user.xp)) window.state.user.xp = 0;
    if (isNaN(window.state.user.level)) window.state.user.level = 1;
    if (isNaN(window.state.user.dailyXp)) window.state.user.dailyXp = 0;
    if (isNaN(window.state.user.streak_count)) window.state.user.streak_count = 0;
    if (isNaN(window.state.user.streak_shields)) window.state.user.streak_shields = 1;
    if (typeof window.state.user.is_tester === 'undefined') window.state.user.is_tester = false;
    if (typeof window.state.user.is_elite === 'undefined') window.state.user.is_elite = false;
    if (typeof window.state.user.is_suspended === 'undefined') window.state.user.is_suspended = false;

    if (window.state.inventory && !previousUser.inventory) {
        window.state.user.inventory = window.state.inventory;
    }
    if (!window.state.user.inventory) window.state.user.inventory = {};
    if (!window.state.user.inventory.g_rusty && window.state.inventory?.g_rusty) {
        window.state.user.inventory.g_rusty = window.state.inventory.g_rusty;
    }
    window.state.inventory = window.state.user.inventory;

    if (!window.state.game) window.state.game = {};
    window.state.game = Object.assign({
        phase: 'BOSS',
        bossLevel: 1,
        storedDmg: 0,
        currentEnemy: null,
        mobsDefeated: 0,
        bestiary: {},
        adventureLog: [],
        zones: {},
        lastTrainingSport: null,
        lastTrainingFamily: null
    }, window.state.game);
    if (isNaN(window.state.game.storedDmg)) window.state.game.storedDmg = 0;
    if (isNaN(window.state.game.bossLevel)) window.state.game.bossLevel = 1;
    if (isNaN(window.state.game.mobsDefeated)) window.state.game.mobsDefeated = 0;

    if (!window.state.quests) window.state.quests = { daily: [], lastGen: null };
    if (!window.state.user.buffs) window.state.user.buffs = {};
    if (!window.state.user.upgrades) window.state.user.upgrades = { battery: 0, marketing: 0 };
    if (!window.state.user.unlockedTalents) window.state.user.unlockedTalents = [];
    if (!window.state.user.unlockedAchievements) window.state.user.unlockedAchievements = [];
    if (!window.state.user.records) window.state.user.records = {};
    if (!window.state.user.disciplineBadges) window.state.user.disciplineBadges = {};
    if (!window.state.user.disciplineGoals) window.state.user.disciplineGoals = {};
    if (!window.state.user.physicalQualities) window.state.user.physicalQualities = {};
    if (typeof window.state.user.coachSnapshot === 'undefined') window.state.user.coachSnapshot = null;
    if (typeof window.state.user.archetype === 'undefined') window.state.user.archetype = null;
    if (typeof window.state.user.reputation === 'undefined') window.state.user.reputation = null;
    if (typeof window.state.user.campaignProfession === 'undefined') window.state.user.campaignProfession = null;
    if (typeof window.state.user.freshnessScore === 'undefined') window.state.user.freshnessScore = null;
    if (typeof window.state.user.returnPlan === 'undefined') window.state.user.returnPlan = null;
    if (!Array.isArray(window.state.user.loadCalendar)) window.state.user.loadCalendar = [];
    if (!Array.isArray(window.state.user.personalRivals)) window.state.user.personalRivals = [];
    if (!Array.isArray(window.state.user.contextualRecords)) window.state.user.contextualRecords = [];
    if (typeof window.state.user.plateauSignal === 'undefined') window.state.user.plateauSignal = null;
    if (typeof window.state.user.cooldownGuide === 'undefined') window.state.user.cooldownGuide = null;
    if (!Array.isArray(window.state.user.regularityBadges)) window.state.user.regularityBadges = [];
    if (!Array.isArray(window.state.user.monthlyReports)) window.state.user.monthlyReports = [];
    if (!Array.isArray(window.state.user.relics)) window.state.user.relics = [];
    window.state.user.campaignSeason = Object.assign({ id: 'season-01', label: 'Cycle Ferrite', progress: 0 }, window.state.user.campaignSeason || {});
    if (typeof window.state.user.guildRole === 'undefined') window.state.user.guildRole = null;
    if (typeof window.state.user.dailyHealth === 'undefined') window.state.user.dailyHealth = null;
    if (!Array.isArray(window.state.user.recoveryCheckIns)) window.state.user.recoveryCheckIns = [];
    if (!Array.isArray(window.state.user.adventureJournal)) window.state.user.adventureJournal = [];
    if (isNaN(window.state.user.weeklyGoalSessions)) window.state.user.weeklyGoalSessions = 3;
    window.state.user.privacy = Object.assign({ publicProfile: true, showStats: true, socialPresence: true, friendRankings: false }, window.state.user.privacy || {});
    if (!window.state.user.unlockedTitles) window.state.user.unlockedTitles = ['title-recruit'];
    if (!window.state.user.unlockedTitles.includes('title-recruit')) window.state.user.unlockedTitles.unshift('title-recruit');
    if (!window.state.user.activeTitle) window.state.user.activeTitle = 'title-recruit';
    if (!window.state.user.purchase_history) window.state.user.purchase_history = [];
    if (!window.state.user.cosmetics) window.state.user.cosmetics = {};
    if (!Array.isArray(window.state.user.cosmetics.unlocked)) {
        window.state.user.cosmetics.unlocked = ['frame-standard', 'grenade-default', 'victory-standard'];
    }
    ['frame-standard', 'grenade-default', 'victory-standard'].forEach(id => {
        if (!window.state.user.cosmetics.unlocked.includes(id)) window.state.user.cosmetics.unlocked.push(id);
    });
    if (!window.state.user.cosmetics.active) window.state.user.cosmetics.active = {};
    if (!window.state.user.cosmetics.active.avatarFrame) window.state.user.cosmetics.active.avatarFrame = 'frame-standard';
    if (!window.state.user.cosmetics.active.grenadeSkin) window.state.user.cosmetics.active.grenadeSkin = 'grenade-default';
    if (!window.state.user.cosmetics.active.victoryEffect) window.state.user.cosmetics.active.victoryEffect = 'victory-standard';
    if (!window.state.history) window.state.history = [];
    if (!window.state.game.bestiary) window.state.game.bestiary = {};
    if (!window.state.game.adventureLog) window.state.game.adventureLog = [];
    if (!window.state.game.zones) window.state.game.zones = {};
    if (!window.state.meta) window.state.meta = {};

    window.state.user.isGuest = !window.state.user.id || window.state.user.id.startsWith('guest_');
};

// 3. CREATION D'UNE NOUVELLE SAUVEGARDE
window.createDefaultState = function() {
    window.state = {
        user: {
            id: 'guest_' + Date.now(),
            name: "Recrue",
            level: 1,
            xp: 0,
            credits: 200,
            dailyXp: 0,
            lastDailyReset: null,
            avatar: null,
            buffs: {},
            upgrades: { battery: 0, marketing: 0 },
            inventory: { g_rusty: 3 },
            is_elite: false,
            is_tester: false,
            is_suspended: false,
            streak_count: 0,
            streak_shields: 1,
            last_week_id: "",
            friend_code: null,
            unlockedTalents: [],
            unlockedAchievements: [],
            records: {},
            disciplineBadges: {},
            disciplineGoals: {},
            physicalQualities: {},
            coachSnapshot: null,
            archetype: null,
            reputation: null,
            campaignProfession: null,
            freshnessScore: null,
            returnPlan: null,
            loadCalendar: [],
            personalRivals: [],
            contextualRecords: [],
            plateauSignal: null,
            cooldownGuide: null,
            regularityBadges: [],
            monthlyReports: [],
            relics: [],
            campaignSeason: { id: 'season-01', label: 'Cycle Ferrite', progress: 0 },
            guildRole: null,
            dailyHealth: null,
            recoveryCheckIns: [],
            lastSessionSummary: null,
            adventureJournal: [],
            weeklyGoalSessions: 3,
            privacy: { publicProfile: true, showStats: true, socialPresence: true, friendRankings: false },
            unlockedTitles: ['title-recruit'],
            activeTitle: 'title-recruit',
            purchase_history: [],
            cosmetics: {
                unlocked: ['frame-standard', 'grenade-default', 'victory-standard'],
                active: {
                    avatarFrame: 'frame-standard',
                    grenadeSkin: 'grenade-default',
                    victoryEffect: 'victory-standard'
                }
            }
        },
        inventory: { g_rusty: 3 },
        game: { phase: 'BOSS', bossLevel: 1, storedDmg: 0, currentEnemy: null, mobsDefeated: 0, bestiary: {}, adventureLog: [], zones: {}, lastTrainingSport: null, lastTrainingFamily: null },
        history: [],
        quests: { daily: [], lastGen: null },
        meta: { updatedAt: new Date().toISOString() }
    };
    window.state.inventory = window.state.user.inventory;
    saveState();
};

// 4. SAUVEGARDE (LOCALE & CLOUD)
window.saveState = function(options = {}) {
    if (!window.state) return;

    const saveOptions = (options === true) ? { forceCloud: true } : options;
    ensureStateIntegrity();
    window.state.meta.updatedAt = new Date().toISOString();
    localStorage.setItem(window.STATE_KEY, JSON.stringify(cloneStateForLocalStorage(window.state)));
    if (typeof window.titanSetSyncStatus === 'function') window.titanSetSyncStatus('local', 'Sur cet appareil');

    if (typeof window.updateGlobalUI === 'function') window.updateGlobalUI();

    if (window.titanClient && isCloudUser()) {
        const now = Date.now();
        const delay = window.TITAN_CLOUD_SYNC_DELAY_MS || 2000;
        const elapsed = now - (window.lastCloudSync || 0);
        const canSyncNow = saveOptions.forceCloud || !window.lastCloudSync || elapsed >= delay;

        if (canSyncNow) {
            if (window.cloudSyncTimer) {
                clearTimeout(window.cloudSyncTimer);
                window.cloudSyncTimer = null;
            }
            pushProfileStateToCloud();
        } else {
            if (window.cloudSyncTimer) clearTimeout(window.cloudSyncTimer);
            window.cloudSyncTimer = setTimeout(() => {
                window.cloudSyncTimer = null;
                pushProfileStateToCloud();
            }, Math.max(100, delay - elapsed));
        }
    }
};

// 5. CHARGEMENT DONNEES SERVEUR (DATA GAME)
window.loadServerData = async function() {
    window.TITAN_DB_STATUS.issues = [];
    window.TITAN_DB_STATUS.softIssues = [];
    const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

    const cached = localStorage.getItem(window.CACHE_KEY);
    let cachedData = null;
    let cachedAt = 0;
    if (cached) {
        try {
            const parsedCache = JSON.parse(cached);
            cachedData = parsedCache && parsedCache.data ? parsedCache.data : parsedCache;
            cachedAt = Number(parsedCache?.cachedAt || 0);
            const cacheAge = cachedAt ? Date.now() - cachedAt : Number.POSITIVE_INFINITY;
            const cacheIsFresh = cacheAge <= CACHE_MAX_AGE_MS;
            if (cacheIsFresh) {
                applyGameData(cachedData);
                window.TITAN_DB_STATUS.cache = { source: 'warm-cache', stale: false, ageMs: cacheAge };
            }
        } catch (e) {
            console.error("Cache invalide", e);
        }
    }

    if (!window.titanClient) {
        if (cachedData && !window.TITAN_DB_STATUS.cache) {
            applyGameData(cachedData);
            window.TITAN_DB_STATUS.cache = { source: 'offline-cache', stale: true, ageMs: cachedAt ? Date.now() - cachedAt : null };
            trackDbSoftIssue('supabase.client', { code: 'OFFLINE_CACHE', message: 'Client Supabase indisponible, donnees serveur en cache.' });
        }
        return;
    }

    try {
        const queries = [
            ['mobs', window.titanClient.from('mobs').select('*')],
            ['bosses', window.titanClient.from('bosses').select('*').order('level', { ascending: true })],
            ['creatures', window.titanClient.from('creatures').select('*').eq('is_active', true).order('sort_order', { ascending: true })],
            ['talents', window.titanClient.from('talents').select('*')],
            ['sports', window.titanClient.from('sports').select('*')],
            ['achievements_config', window.titanClient.from('achievements_config').select('*')],
            ['global_config', window.titanClient.from('global_config').select('*')],
            ['fun_stats', window.titanClient.from('fun_stats').select('*')],
            ['user_achievements', isCloudUser() ? window.titanClient.from('user_achievements').select('achievement_id').eq('user_id', window.state.user.id) : Promise.resolve({ data: [] })],
            ['shop_items', window.titanClient.from('shop_items').select('*').eq('is_active', true)],
            ['shop_history', isCloudUser() ? window.titanClient.from('shop_history').select('*').eq('user_id', window.state.user.id) : Promise.resolve({ data: [] })],
            ['social_challenges', isCloudUser() ? window.titanClient.from('social_challenges').select('*').or(`challenger_id.eq.${window.state.user.id},opponent_id.eq.${window.state.user.id}`) : Promise.resolve({ data: [] })]
        ];

        const page=location.pathname.replace(/\.html$/, '');
        const gamePage=/adventure|talents|boutique|trophies|admin/.test(page);
        const optional=new Set(['mobs','bosses','creatures','talents','fun_stats','shop_items','shop_history']);
        if(!gamePage)queries.forEach((entry,index)=>{if(optional.has(entry[0]))queries[index]=[entry[0],Promise.resolve({data:null,error:null})];});
        const DB_QUERY_TIMEOUT_MS = 10000;
        const results = await Promise.all(queries.map(([name, query]) => Promise.race([
            Promise.resolve(query),
            new Promise(resolve => {
                setTimeout(() => {
                    resolve({
                        data: null,
                        error: {
                            code: 'TIMEOUT',
                            message: `Chargement ${name} trop long, mode secours local.`
                        }
                    });
                }, DB_QUERY_TIMEOUT_MS);
            })
        ])));
        const fallbackKeyByTable = {
            mobs: 'mobs',
            bosses: 'bosses',
            creatures: 'creatures',
            talents: 'talents',
            sports: 'sports',
            achievements_config: 'achievements',
            global_config: 'globalConf',
            fun_stats: 'funStats',
            shop_items: 'shopItems',
            user_achievements: 'userUnlocks',
            shop_history: 'shopHistory',
            social_challenges: 'socialChallenges'
        };
        results.forEach((result, index) => {
            if (!result.error) return;
            const tableName = queries[index][0];
            const fallbackKey = fallbackKeyByTable[tableName];
            const fallbackValue = fallbackKey ? cachedData?.[fallbackKey] : null;
            const hasFallback = Array.isArray(fallbackValue);
            const isCoreTable = TITAN_CORE_DATA_TABLES.has(tableName);
            const isSoftTable = TITAN_SOFT_DATA_TABLES.has(tableName);
            const canRecoverLocally = hasFallback || isSoftTable || !isCoreTable;
            trackDbSoftIssue(tableName, Object.assign({}, result.error, {
                recoverable: canRecoverLocally,
                coreTable: isCoreTable
            }));
        });
        if (!results[4].error && Array.isArray(results[4].data) && results[4].data.length === 0) {
            trackDbSoftIssue('sports', {
                code: 'EMPTY_RESULT',
                message: 'Catalogue distant vide: conservation du catalogue local actif.',
                recoverable: true,
                coreTable: true
            });
        }

        const freshData = {
            mobs: results[0].data || cachedData?.mobs || [],
            bosses: results[1].data || cachedData?.bosses || [],
            creatures: results[2].data || cachedData?.creatures || [],
            talents: results[3].data || cachedData?.talents || [],
            sports: Array.isArray(results[4].data) && results[4].data.length
                ? results[4].data
                : (Array.isArray(cachedData?.sports) && cachedData.sports.length ? cachedData.sports : null),
            achievements: results[5].data || cachedData?.achievements || [],
            globalConf: results[6].data || cachedData?.globalConf || [],
            funStats: results[7].data || cachedData?.funStats || [],
            userUnlocks: results[8].data || [],
            shopItems: results[9].data || cachedData?.shopItems || [],
            shopHistory: results[10].data || [],
            socialChallenges: results[11].data || []
        };

        applyGameData(freshData);
        if (window.TITAN_DB_STATUS.issues.length === 0 && window.TITAN_DB_STATUS.softIssues.length === 0) {
            localStorage.setItem(window.CACHE_KEY, JSON.stringify({
                version: 'v2',
                cachedAt: Date.now(),
                data: freshData
            }));
            window.TITAN_DB_STATUS.cache = { source: 'network', stale: false, ageMs: 0 };
        }

        if (window.TITAN_DB_STATUS.issues.length > 0) {
            console.warn('[TITAN DB] Diagnostic masque cote utilisateur:', window.TITAN_DB_STATUS.issues);
        }
        if (window.TITAN_DB_STATUS.softIssues.length > 0) {
            console.warn('[TITAN DB] Tables non critiques en secours:', window.TITAN_DB_STATUS.softIssues);
        }
    } catch (err) {
        trackDbSoftIssue('loadServerData', err);
        console.warn("[TITAN OS] Erreur chargement serveur, mode secours actif", err);
    }
};

window.applyGameData = function(data) {
    data = data || {};
    const dynamicCreatures = safeArray(data.creatures).filter(c => c && c.is_active !== false);
    const dynamicMobs = dynamicCreatures
        .filter(c => !['boss'].includes(String(c.type || '').toLowerCase()))
        .map(c => mapDynamicCreature(c, 'mob'));
    const dynamicBosses = dynamicCreatures
        .filter(c => String(c.type || '').toLowerCase() === 'boss')
        .map(c => mapDynamicCreature(c, 'boss'));

    if (data.mobs || data.creatures) {
        window.MOBS_DB = dedupeById([
            ...safeArray(data.mobs).map(m => ({ id: m.id, name: m.name, img: m.image_url, desc: m.description, weak: m.weakness, rarity: m.rarity, level: m.id, source: 'mobs' })),
            ...dynamicMobs
        ]);
    }
    if (data.bosses || data.creatures) window.BOSS_DB = dedupeById([
            ...safeArray(data.bosses)
                .map(b => ({ id: b.id, name: b.name, baseHp: b.hp_max, weak: b.weakness, level: b.level, img: b.image_url, desc: b.description || "", source: 'bosses' })),
            ...dynamicBosses
        ])
        .slice()
        .sort((a, b) => (Number(a.level) || 0) - (Number(b.level) || 0))
        .map(b => ({ id: b.id, name: b.name, baseHp: b.baseHp, weak: b.weak, level: b.level, img: b.img, desc: b.desc || "", rarity: b.rarity, required_level: b.required_level, source: b.source }));
    if (data.achievements) window.ACHIEVEMENTS_DB = safeArray(data.achievements).map(a => ({ id: a.id, title: a.title, desc: a.description, icon: a.icon, target: a.target_value, reward: a.reward_credits, type: String(a.id || '').split('_')[0] }));

    window.TALENT_TREE = {};
    if (data.talents) {
        safeArray(data.talents).forEach(t => {
            window.TALENT_TREE[t.id] = { id: t.id, name: t.name, icon: t.icon, desc: t.description, cost: t.cost, stat: t.stat_modifier, bonus: t.bonus_value, prev: t.prerequisite_id, path: t.path, type: t.is_major ? 'major' : 'normal' };
        });
    }

    if (data.funStats) {
        window.FUN_STATS_DB = safeArray(data.funStats).map(f => ({ id: f.id, type: f.type, val: f.val, label: f.label, icon: f.icon }));
    }

    if (data.sports) {
        window.SPORTS_CONFIG = {};
        safeArray(data.sports).forEach(s => {
            if (s.is_active !== false) {
                window.SPORTS_CONFIG[s.id] = {
                    label: s.label,
                    name: s.name || s.label,
                    slug: s.slug || s.id,
                    description: s.description || safeObject(s.tracking_summary).headline || '',
                    unit: s.unit,
                    xp: s.xp_multiplier,
                    cat: s.category,
                    icon: s.icon,
                    formType: s.form_type,
                    extraFields: safeArray(s.extra_fields),
                    requiredFields: safeObject(s.required_fields),
                    xpRules: safeObject(s.xp_rules),
                    xpFormula: safeObject(s.xp_formula),
                    creditsFormula: safeObject(s.credits_formula),
                    validationRules: safeObject(s.validation_rules),
                    suspiciousRules: safeObject(s.suspicious_rules),
                    balanceProfile: s.balance_profile || '',
                    trackingSummary: safeObject(s.tracking_summary),
                    trackingVersion: s.tracking_version || '',
                    sortOrder: Number(s.sort_order || 0)
                };
            }
        });
        if (typeof window.titanEnhanceSportsConfig === 'function') {
            window.titanEnhanceSportsConfig(window.SPORTS_CONFIG);
        }
        window.dispatchEvent(new CustomEvent('titan:catalog-ready', {
            detail: { count: Object.keys(window.SPORTS_CONFIG).length }
        }));
    }

    window.SHOP_DB = [];
    if (data.shopItems) {
        window.SHOP_DB = safeArray(data.shopItems).map(i => ({
            id: i.id,
            name: i.name,
            desc: i.description,
            price: i.price,
            type: i.type,
            category: i.category || i.type,
            icon: i.icon,
            effectVal: i.effect_val,
            cooldown: { type: i.cooldown_type, max: i.cooldown_max },
            requiresElite: i.requires_elite === true || i.elite_only === true,
            economyTier: i.economy_tier || null,
            cosmeticId: i.cosmetic_id || null
        }));
    }

    window.PURCHASE_HISTORY = safeArray(data.shopHistory);
    if (window.state && window.state.user && Array.isArray(window.PURCHASE_HISTORY)) {
        window.state.user.purchase_history = window.PURCHASE_HISTORY.map(p => ({
            item_id: p.item_id,
            itemId: p.item_id,
            purchased_at: p.purchased_at,
            date: p.purchased_at
        }));
    }
    window.ACTIVE_CHALLENGES = safeArray(data.socialChallenges);

    if (data.globalConf) {
        safeArray(data.globalConf).forEach(conf => {
            if (conf.is_active && conf.key === 'maintenance_mode' && conf.value === 'true') {
                if (window.GLOBAL_CONFIG) window.GLOBAL_CONFIG.maintenance_mode = true;
                if (typeof window.triggerMaintenanceScreen === 'function') window.triggerMaintenanceScreen();
            }
        });
    }

    if (data.userUnlocks && window.state && window.state.user) {
        window.state.user.unlockedAchievements = safeArray(data.userUnlocks).map(u => u.achievement_id);
    }
};

function withTitanTimeout(promise, timeoutMs, scope) {
    return Promise.race([
        Promise.resolve(promise),
        new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    data: null,
                    error: {
                        code: 'TIMEOUT',
                        message: `${scope} trop long, mode local.`
                    }
                });
            }, timeoutMs);
        })
    ]);
}

window.titanWithTimeout = withTitanTimeout;

window.titanRetry = async function(task, options = {}) {
    const retries = Math.max(0, parseInt(options.retries, 10) || 0);
    const delayMs = Math.max(0, parseInt(options.delayMs, 10) || 250);
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await task(attempt);
        } catch (error) {
            lastError = error;
            if (attempt < retries && delayMs > 0) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }
    throw lastError;
};

// 6. SYNC PROFIL UTILISATEUR (AUTH)
window.syncWithSupabase = async function() {
    if (!window.titanClient) {
        if (typeof window.titanSetSyncStatus === 'function') window.titanSetSyncStatus('offline', 'Connexion indisponible');
        return;
    }

    try {
        if (typeof window.titanSetSyncStatus === 'function') window.titanSetSyncStatus('pending', 'Récupération…');
        const sessionResult = await withTitanTimeout(window.titanClient.auth.getSession(), 4000, 'Session Supabase');
        if (sessionResult.error) {
            trackDbIssue('auth.session', sessionResult.error);
            return;
        }

        const { data: { session } } = sessionResult;
        if (!session) {
            if (typeof window.titanSetSyncStatus === 'function') window.titanSetSyncStatus('local', 'Sur cet appareil');
            return;
        }

        let { data: profile, error } = await withTitanTimeout(window.titanClient
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle(), 4000, 'Profil Supabase');

        if (error) {
            trackDbIssue('profiles.select', error);
            return;
        }

        if (!profile) {
            if (!window.state) createDefaultState();
            window.state.user.id = session.user.id;
            ensureStateIntegrity();
            const signupName = session.user.user_metadata?.username || session.user.user_metadata?.full_name || "Agent";

            if (!window.titanClient.rpc || typeof window.titanClient.rpc !== 'function') {
                const rpcRequiredError = new Error('PROFILE_CREATE_RPC_REQUIRED');
                rpcRequiredError.code = 'PROFILE_CREATE_RPC_REQUIRED';
                trackDbIssue('profiles.create.rpc', rpcRequiredError);
                return;
            }

            const stateSnapshot = cloneProfileStateForCloud(window.state);
            const { data: createdProfile, error: createProfileError } = await withTitanTimeout(
                window.titanClient.rpc('titan_save_profile_state', {
                    p_state: stateSnapshot,
                    p_username: window.titanCleanProfileName(signupName) || 'Agent',
                    p_avatar: window.state.user.avatar || null,
                    p_inventory: window.state.user.inventory || {},
                    p_privacy: window.state.user.privacy || { publicProfile: true, showStats: true, socialPresence: true, friendRankings: false },
                    p_streak_count: window.state.user.streak_count || 0,
                    p_last_week_id: window.state.user.last_week_id || '',
                    p_last_seen_news_version: window.state.user.last_seen_news_version || null
                }),
                5000,
                'Creation profil RPC'
            );

            if (createProfileError) {
                trackDbIssue('profiles.create.rpc', createProfileError);
                return;
            }
            recordProfileSyncDiagnostic('created', { mode: 'rpc', userId: session.user.id });
            profile = createdProfile || { id: session.user.id, username: signupName, game_state: stateSnapshot };
        }

        if (profile.is_suspended === true) {
            const reason = profile.suspension_reason || "Compte suspendu par l'administration TITAN OS.";
            if (window.showNotification) window.showNotification('error', 'ACCES SUSPENDU', reason);
            else console.warn('[ACCES SUSPENDU]', reason);
            await window.titanClient.auth.signOut();
            localStorage.removeItem(window.STATE_KEY);
            createDefaultState();
            saveState({ forceCloud: false });
            window.location.href = 'login.html';
            return;
        }

        if (!profile.friend_code) {
            if (window.titanClient.rpc) {
                const { data: assignedCode, error: assignError } = await withTitanTimeout(
                    window.titanClient.rpc('titan_assign_friend_code'),
                    4000,
                    'Generation code ami'
                );
                if (!assignError && assignedCode) {
                    profile.friend_code = assignedCode;
                } else if (assignError && assignError.code !== 'PGRST202') {
                    trackDbIssue('profiles.friend_code.assign', assignError);
                }
            }
        }

        if (!profile.friend_code) {
            const friendCodeError = new Error('FRIEND_CODE_RPC_REQUIRED');
            friendCodeError.code = 'FRIEND_CODE_RPC_REQUIRED';
            trackDbSoftIssue('profiles.friend_code.assign', friendCodeError);
        }

        const localStateBeforeSync = window.state ? cloneStateForCloud(window.state) : null;
        const localBelongsToSession = localStateBeforeSync?.user?.id === session.user.id;
        const localUpdatedAt = getStateUpdatedAtValue(localStateBeforeSync);
        const cloudUpdatedAt = getStateUpdatedAtValue(profile.game_state) || (profile.updated_at ? Date.parse(profile.updated_at) : 0);
        const localNeedsReview = !!(localBelongsToSession && localUpdatedAt && (!cloudUpdatedAt || localUpdatedAt > cloudUpdatedAt + 1000));
        const keepLocalGameState = false;
        if (typeof window.titanMaybeSubmitCacheReconciliation === 'function') {
            window.titanMaybeSubmitCacheReconciliation(localStateBeforeSync);
        }
        if (localNeedsReview && typeof window.showNotification === 'function') {
            window.showNotification('info', 'CACHE EN REVUE', 'Le cloud reste prioritaire. Un audit verifie la progression locale.');
        }

        if (!window.state) createDefaultState();
        if (!keepLocalGameState && profile.game_state && profile.game_state.user) window.state = profile.game_state;
        ensureStateIntegrity();

        if (!keepLocalGameState && profile.credits !== null && typeof profile.credits !== 'undefined') window.state.user.credits = profile.credits;
        if (!keepLocalGameState && profile.level !== null && typeof profile.level !== 'undefined') window.state.user.level = profile.level;
        if (!keepLocalGameState && profile.xp !== null && typeof profile.xp !== 'undefined') window.state.user.xp = profile.xp;
        if (!keepLocalGameState && profile.inventory) window.state.user.inventory = profile.inventory;
        window.state.inventory = window.state.user.inventory;
        window.state.user.is_elite = (profile.is_elite === true);
        window.state.user.is_tester = (profile.is_tester === true);
        window.state.user.is_suspended = (profile.is_suspended === true);

        if (profile.username) window.state.user.name = profile.username;
        if (profile.avatar) window.state.user.avatar = profile.avatar;
        if (profile.privacy) window.state.user.privacy = Object.assign({ publicProfile: true, showStats: true, socialPresence: true, friendRankings: false }, profile.privacy || {});
        if (profile.streak_count !== undefined) window.state.user.streak_count = profile.streak_count;
        if (profile.last_week_id !== undefined) window.state.user.last_week_id = profile.last_week_id;
        if (profile.friend_code) window.state.user.friend_code = profile.friend_code;
        if (profile.last_seen_news_version) window.state.user.last_seen_news_version = profile.last_seen_news_version;

        window.state.user.id = profile.id || session.user.id;
        ensureStateIntegrity();

        const historyResult = await window.TitanTraining.paginate(window.titanClient,session.user.id);
        await window.TitanQueue.migrate();
        const pending=await window.TitanQueue.refresh();
        const confirmed=historyResult.logs.map(l=>({...l,cat:l.category,syncStatus:'confirmed'}));
        const ids=new Set(confirmed.map(l=>l.client_event_id));
        const provisional=pending.filter(i=>i.ownerId===session.user.id&&!ids.has(i.payload.details.client_event_id)).map(i=>({...i.payload,id:i.payload.details.client_event_id,client_event_id:i.payload.details.client_event_id,cat:i.payload.category,xp:0,syncStatus:i.status}));
        await window.TitanQueue.saveHistory(session.user.id,confirmed);
        window.titanCloudHistoryLoadedAt=Date.now();
        window.state.archivedHistory=confirmed.filter(l=>l.archived_at);
        window.state.history=[...confirmed.filter(l=>!l.archived_at),...provisional];
        window.state.meta=Object.assign({},window.state.meta,{profileVersion:profile.state_version,historyTotal:historyResult.total});
        window.dispatchEvent(new CustomEvent('titan:history-updated'));

        // Legacy wagers are not settled by the browser.

        ensureStateIntegrity();
        saveState({ forceCloud: keepLocalGameState });
        if (typeof window.updateGlobalUI === 'function') window.updateGlobalUI();
        if (document.getElementById('history-list') && typeof window.renderHistory === 'function') window.renderHistory();
        if (document.getElementById('sports-grid') && typeof window.renderSports === 'function') window.renderSports();
        if (typeof window.titanSetSyncStatus === 'function') window.titanSetSyncStatus(window.TitanQueue?.list().length ? 'pending' : 'cloud', window.TitanQueue?.list().length ? 'Séance(s) en attente' : 'Synchronisé');
    } catch (e) {
        console.error("Erreur Sync:", e);
        trackDbIssue('syncWithSupabase', e);
        window.dispatchEvent(new CustomEvent('titan:history-error'));
    }
};

window.checkDailyReset = async function() {
    if (!window.state) return;
    const todayDateStr = new Date().toISOString().split('T')[0];
    if (window.state.user.lastDailyReset !== todayDateStr) {
        window.state.user.dailyXp = 0;
        window.state.user.lastDailyReset = todayDateStr;
        saveState();
    }
};

function generateFriendCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "TN-";
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}
