/* =========================================
   TITAN OS SPORT - CONFIGURATION PUBLIQUE
   ========================================= */

// 1. PARAMÈTRES SYSTÈME
window.GAME_SETTINGS = { version: "102.0" };
window.TITAN_ASSET_VERSION = "102.0";
window.STATE_KEY = 'titan_os_v12_save';
window.CACHE_KEY = 'titan_data_cache_v2';
window.XP_PER_LEVEL_BASE = 2200;
window.AD_INTERVAL_MS = 5 * 60 * 1000; // 5 Minutes
window.TITAN_ENABLE_DEV_TOOLS = false;
window.TITAN_ECONOMY = {
    startingCredits: 200,
    chatGlobalCost: 2,
    chatGuildCost: 3,
    guildCreateCost: 3000,
    freeMessageMaxLength: 280,
    eliteMessageMaxLength: 700,
    globalRetentionHours: 48,
    guildRetentionHours: 72,
    weeklyXpCap: 9600,
    weeklyCreditCap: 1800,
    eliteCapMultiplier: 1,
    shop: {
        chargeWeeklyLimit: 2,
        adDailyLimit: 1,
        adWeeklyLimit: 3,
        adRewardCap: 120,
        chargePriceFloor: 450,
        upgradeBasePrice: 1400,
        upgradeStepPrice: 1150,
        cosmeticCreditsPrice: 650,
        eliteCosmeticsAreVisualOnly: true
    },
    sinks: {
        guildCreate: 3000,
        chatGlobal: 2,
        chatGuild: 3,
        wagerMin: 50,
        wagerMax: 5000
    },
    pacing: {
        targetEndgameWeeks: 52,
        maxRewardSessionsPerWeekHint: 8,
        noXpForRecoveryCheckin: true
    }
};

// 2. CONFIG GLOBALE
window.GLOBAL_CONFIG = { maintenance_mode: false, welcome_message: "" };
window.TITAN_PADDLE = {
    environment: "production",
    clientToken: "live_afddf554625dd67ecb8a03be847",
    elitePriceId: "pri_01ks2mt9tspkhweawb55w7w8nd"
};
window.TITAN_EXTERNAL_URLS = {
    supportEmail: "titanteam.app@gmail.com",
    supportMailto: "mailto:titanteam.app@gmail.com?subject=Feedback%20TITAN%20OS",
    discord: "https://discord.gg/tbgQAAAxrU",
    adsEnabled: false,
    adcashScript: "https://acscdn.com/script/aclib.js",
    adcashAutoTagZoneId: "illqcraznp",
    adcashInPagePushZoneId: "11300038",
    adcashInterstitialZoneId: "11300046",
    adcashInPageMaxAds: 2
};

// 3. CLIENT SUPABASE
window.TITAN_SUPABASE_URL = 'https://oubmftfufwwzwpgvrcag.supabase.co';
window.TITAN_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91Ym1mdGZ1Znd3endwZ3ZyY2FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxOTMyODAsImV4cCI6MjA3OTc2OTI4MH0.sjv09LUsG2ALY7AsJbA-0f8SB6YCDYLIQEiqcQxdfrU';
const SUPABASE_URL = window.TITAN_SUPABASE_URL;
const SUPABASE_KEY = window.TITAN_SUPABASE_ANON_KEY;
window.titanClient = null;
window.TITAN_SUPABASE_CLIENT_OPTIONS = {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'titan_supabase_auth_v1'
    },
    global: {
        headers: {
            'x-client-info': `titan-os-web/${window.GAME_SETTINGS?.version || 'unknown'}`
        }
    },
    realtime: {
        params: {
            eventsPerSecond: 5
        }
    }
};
window.TITAN_SUPABASE_STATUS = window.TITAN_SUPABASE_STATUS || {
    state: 'idle',
    ready: false,
    url: SUPABASE_URL,
    lastCheckedAt: null,
    lastError: null,
    authReachable: false,
    progressionAuthority: 'unknown'
};

function titanSerializeSupabaseError(error) {
    if (!error) return null;
    return {
        code: error.code || error.name || 'SUPABASE_ERROR',
        message: error.message || String(error)
    };
}

function titanSetSupabaseStatus(state, patch = {}) {
    window.TITAN_SUPABASE_STATUS = Object.assign({}, window.TITAN_SUPABASE_STATUS || {}, patch, {
        state,
        lastCheckedAt: new Date().toISOString()
    });
    return window.TITAN_SUPABASE_STATUS;
}

function titanSupabaseTimeout(promise, timeoutMs, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => {
                const error = new Error(`${label || 'Supabase'} timeout`);
                error.code = 'SUPABASE_TIMEOUT';
                reject(error);
            }, timeoutMs);
        })
    ]);
}

window.titanGetSupabaseConnectionStatus = function() {
    return Object.assign({}, window.TITAN_SUPABASE_STATUS || {});
};

window.initTitanSupabaseClient = function() {
    if (window.titanClient) return window.titanClient;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        titanSetSupabaseStatus('config_missing', {
            ready: false,
            lastError: { code: 'SUPABASE_CONFIG_MISSING', message: 'URL ou cle Supabase absente.' }
        });
        return null;
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        titanSetSupabaseStatus('library_missing', {
            ready: false,
            lastError: { code: 'SUPABASE_LIBRARY_MISSING', message: 'Librairie Supabase non chargee.' }
        });
        return null;
    }

    try {
        window.titanClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, window.TITAN_SUPABASE_CLIENT_OPTIONS);
        titanSetSupabaseStatus('client_ready', {
            ready: true,
            lastError: null
        });
        return window.titanClient;
    } catch (error) {
        titanSetSupabaseStatus('client_error', {
            ready: false,
            lastError: titanSerializeSupabaseError(error)
        });
        console.warn('[TITAN SUPABASE] Initialisation impossible:', error);
        return null;
    }
};

window.waitForTitanSupabase = function(timeoutMs = 2500) {
    const existing = window.initTitanSupabaseClient();
    if (existing) return Promise.resolve(existing);

    return new Promise(resolve => {
        const start = Date.now();
        const timer = setInterval(() => {
            const client = window.initTitanSupabaseClient();
            if (client || Date.now() - start >= timeoutMs || window.TITAN_SUPABASE_LOAD_FAILED) {
                clearInterval(timer);
                resolve(client || null);
            }
        }, 100);
    });
};

window.titanTestSupabaseConnection = async function(options = {}) {
    const timeoutMs = Number(options.timeoutMs || 5000);
    const includeProgression = options.includeProgression !== false;
    const client = await window.waitForTitanSupabase(timeoutMs);
    if (!client || !client.auth) {
        return titanSetSupabaseStatus('client_unavailable', {
            ready: false,
            authReachable: false,
            progressionAuthority: 'unknown',
            lastError: { code: 'SUPABASE_CLIENT_UNAVAILABLE', message: 'Client Supabase indisponible.' }
        });
    }

    try {
        titanSetSupabaseStatus('checking', { ready: true, lastError: null });
        const sessionResult = await titanSupabaseTimeout(client.auth.getSession(), timeoutMs, 'Session Supabase');
        const userId = sessionResult?.data?.session?.user?.id || null;
        if (sessionResult?.error) throw sessionResult.error;

        let progressionAuthority = userId ? 'not_checked' : 'anonymous';
        if (includeProgression && userId && typeof client.rpc === 'function') {
            const snapshot = await titanSupabaseTimeout(client.rpc('titan_get_progression_snapshot'), timeoutMs, 'Snapshot progression');
            if (snapshot?.error) throw snapshot.error;
            progressionAuthority = snapshot?.data ? 'server_authoritative' : 'empty';
        }

        return titanSetSupabaseStatus(userId ? 'authenticated' : 'anonymous_ready', {
            ready: true,
            authReachable: true,
            userId,
            progressionAuthority,
            lastError: null
        });
    } catch (error) {
        return titanSetSupabaseStatus('connection_error', {
            ready: true,
            authReachable: false,
            progressionAuthority: 'unknown',
            lastError: titanSerializeSupabaseError(error)
        });
    }
};

window.initTitanSupabaseClient();

// 4. CONTENEURS DE DONNÉES (Initialisés vides pour remplissage SQL)
// Plus de données en dur ici, tout vient de loadServerData()
window.state = null;
window.lastCloudSync = 0;

window.SPORTS_CONFIG = {};       // Sera rempli par la table 'sports'
window.TALENT_PATHS = [];        // Sera rempli par la table 'talent_paths' (si existante) ou géré par l'UI
window.TALENT_TREE = {};         // Sera rempli par la table 'talents'
window.FUN_STATS_DB = [];        // Sera rempli par la table 'fun_stats'
window.MOBS_DB = [];             // Sera rempli par la table 'mobs'
window.BOSS_DB = [];             // Sera rempli par la table 'bosses'
window.ACHIEVEMENTS_DB = [];     // Sera rempli par la table 'achievements_config'
window.SHOP_DB = [];             // Sera rempli par la table 'shop_items'

window.PURCHASE_HISTORY = [];
window.ACTIVE_CHALLENGES = [];
window.cachedNewsData = null;


