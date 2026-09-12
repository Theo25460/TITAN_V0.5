/* Native page navigation remains immediate. */
window.titanShowBoot=function(){};
window.titanHideBoot=function(){document.documentElement.classList.remove('titan-booting');document.documentElement.classList.add('titan-ready');document.getElementById('titan-boot-screen')?.remove();};
window.titanEscapeText = function(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
};
window.titanEscapeHtml = window.titanEscapeText;
window.titanSafeText = function(value, maxLength = 500) {
    return String(value ?? '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
};

window.titanIsSuspendedError = function(error) {
    const msg = `${error?.code || ''} ${error?.message || error || ''}`.toUpperCase();
    return msg.includes('ACCOUNT_SUSPENDED') || msg.includes('SUSPENDED');
};

window.titanNotifySuspended = function() {
    if (typeof window.showNotification === 'function') {
        window.showNotification('error', 'COMPTE SUSPENDU', 'Action bloquee par moderation.');
    } else {
        console.warn('[TITAN] Compte suspendu: action bloquee.');
    }
};

(function titanFrontMonitoring() {
    if (window.__titanFrontMonitoringReady) return;
    window.__titanFrontMonitoringReady = true;
    const ERROR_KEY = 'titan_front_errors_v1';
    const MAX_ERRORS = 30;

    function readErrors() {
        try { return JSON.parse(localStorage.getItem(ERROR_KEY) || '[]'); }
        catch (_) { return []; }
    }

    window.titanReportClientError = function(source, error, extra = {}) {
        const message = error?.message || String(error || 'Erreur inconnue');
        const entry = {
            at: new Date().toISOString(),
            source: String(source || 'front').slice(0, 80),
            message: message.slice(0, 500),
            page: location.pathname,
            stack: String(error?.stack || '').slice(0, 1200),
            extra
        };
        try {
            const next = [entry, ...readErrors()].slice(0, MAX_ERRORS);
            localStorage.setItem(ERROR_KEY, JSON.stringify(next));
        } catch (_) {}
        return entry;
    };

    window.titanGetClientErrors = function() {
        return readErrors();
    };

    window.addEventListener('error', (event) => {
        window.titanReportClientError('window.error', event.error || event.message, {
            file: event.filename || '',
            line: event.lineno || 0,
            column: event.colno || 0
        });
    });

    window.addEventListener('unhandledrejection', (event) => {
        window.titanReportClientError('unhandledrejection', event.reason || 'Promise rejetee');
    });
})();

(function titanPerformanceMonitoring() {
    if (window.__titanPerformanceMonitoringReady) return;
    window.__titanPerformanceMonitoringReady = true;
    const PERF_KEY = 'titan_front_perf_v1';
    const snapshot = {
        page: location.pathname,
        at: new Date().toISOString(),
        loadMs: null,
        domReadyMs: null,
        lcpMs: null,
        cls: 0
    };

    function savePerf() {
        try { localStorage.setItem(PERF_KEY, JSON.stringify(snapshot)); }
        catch (_) {}
    }

    window.titanGetPerformanceSnapshot = function() {
        try { return JSON.parse(localStorage.getItem(PERF_KEY) || 'null') || snapshot; }
        catch (_) { return snapshot; }
    };

    window.addEventListener('load', () => {
        const nav = performance.getEntriesByType?.('navigation')?.[0];
        if (nav) {
            snapshot.loadMs = Math.round(nav.loadEventEnd || performance.now());
            snapshot.domReadyMs = Math.round(nav.domContentLoadedEventEnd || 0);
        } else {
            snapshot.loadMs = Math.round(performance.now());
        }
        savePerf();
    }, { once: true });

    if ('PerformanceObserver' in window) {
        try {
            new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const last = entries[entries.length - 1];
                if (last) {
                    snapshot.lcpMs = Math.round(last.startTime);
                    savePerf();
                }
            }).observe({ type: 'largest-contentful-paint', buffered: true });
        } catch (_) {}

        try {
            new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    if (!entry.hadRecentInput) snapshot.cls = Number((snapshot.cls + entry.value).toFixed(4));
                });
                savePerf();
            }).observe({ type: 'layout-shift', buffered: true });
        } catch (_) {}
    }
})();

/* =========================================
   TITAN OS - UI MANAGER (VISUALS & DOM)
   ========================================= */

/* --- 1. SYSTÈME DE NOTIFICATIONS (TOAST) --- */
window.setupNotificationSystem = function() { 
    if (document.getElementById('titan-notify-area')) return; 
    
    const style = document.createElement('style'); 
    style.innerHTML = `
        #titan-notify-area { position: fixed; top: 20px; right: 20px; width: 320px; z-index: 100000; display: flex; flex-direction: column; gap: 15px; pointer-events: none; } 
        .titan-toast { background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.1); border-left: 4px solid var(--toast-color, #38bdf8); padding: 16px; border-radius: 4px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 20px var(--toast-color-glow, rgba(0,0,0,0)); display: flex; align-items: flex-start; gap: 15px; color: #fff; pointer-events: auto; animation: toastSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; transform-origin: right center; overflow: hidden; position: relative; } 
        .titan-toast::after { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 2px; background: rgba(255,255,255,0.1); animation: scanLine 2s linear infinite; } 
        .titan-toast.closing { animation: toastFadeOut 0.3s ease forwards; } 
        .t-icon-box { width: 32px; height: 32px; border-radius: 50%; background: rgba(255, 255, 255, 0.05); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; color: var(--toast-color); flex-shrink: 0; border: 1px solid rgba(255,255,255,0.1); } 
        .t-content { flex: 1; } 
        .t-title { font-family: 'Russo One', sans-serif; font-size: 0.85rem; text-transform: uppercase; margin-bottom: 4px; color: var(--toast-color); letter-spacing: 1px; text-shadow: 0 0 10px var(--toast-color-glow); } 
        .t-msg { font-size: 0.8rem; color: #cbd5e1; font-family: 'Outfit', sans-serif; line-height: 1.4; } 
        @keyframes toastSlideIn { from { transform: translateX(100%) scale(0.9); opacity: 0; } to { transform: translateX(0) scale(1); opacity: 1; } } 
        @keyframes toastFadeOut { to { opacity: 0; transform: translateX(20px) scale(0.95); } } 
        @keyframes scanLine { 0% { top: 0%; opacity: 0; } 50% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
    `; 
    document.head.appendChild(style); 
    
    const container = document.createElement('div'); 
    container.id = 'titan-notify-area'; 
    document.body.appendChild(container); 
};

window.showNotification = function(type, title, message) { 
    const normalizedTitle = String(title || '').toUpperCase();
    const normalizedMessage = String(message || '').toUpperCase();
    const isQuietDbDiagnostic = (
        normalizedTitle === 'DB' ||
        normalizedTitle.includes('DB MODE SECOURS') ||
        normalizedMessage.includes('TABLE(S) A VERIFIER') ||
        normalizedMessage.includes('SUPABASE') ||
        normalizedMessage.includes('POSTGREST') ||
        normalizedMessage.includes('PGRST')
    );
    if (isQuietDbDiagnostic) {
        console.warn('[TITAN UI] Notification technique masquee:', { title, message });
        return;
    }
    const isQuietSyncToast = (
        normalizedTitle.includes('SYNC') ||
        normalizedTitle.includes('CLOUD') ||
        normalizedTitle.includes('SAUVEGARDE') ||
        normalizedMessage.includes('CLOUD SYNCHRONISE') ||
        normalizedMessage.includes('SAUVEGARDE LOCALE')
    ) && type !== 'error' && type !== 'warning';
    if (isQuietSyncToast) return;

    let container = document.getElementById('titan-notify-area'); 
    if (!container) { setupNotificationSystem(); container = document.getElementById('titan-notify-area'); } 
    
    const config = { 
        success: { color: '#4ade80', glow: 'rgba(74, 222, 128, 0.2)', icon: 'ri-checkbox-circle-fill' }, 
        warning: { color: '#9ee7ff', glow: 'rgba(126, 220, 255, 0.2)', icon: 'ri-alert-fill' }, 
        error: { color: '#ef4444', glow: 'rgba(239, 68, 68, 0.2)', icon: 'ri-alarm-warning-fill' }, 
        info: { color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.2)', icon: 'ri-information-fill' }, 
        combat: { color: '#f87171', glow: 'rgba(248, 113, 113, 0.2)', icon: 'ri-sword-fill' }, 
        level: { color: '#a78bfa', glow: 'rgba(167, 139, 250, 0.2)', icon: 'ri-vip-crown-2-fill' } 
    }; 
    
    const theme = config[type] || config.info; 
    const toast = document.createElement('div'); 
    toast.className = `titan-toast ${window.titanIsElite && window.titanIsElite() ? 'premium-toast' : ''}`.trim(); 
    toast.style.setProperty('--toast-color', theme.color); 
    toast.style.setProperty('--toast-color-glow', theme.glow);
    
    const safeTitle = window.titanEscapeText(title);
    const safeMessage = window.titanEscapeText(message);
    toast.innerHTML = `
        <div class="t-icon-box"><i class="${theme.icon}"></i></div>
        <div class="t-content">
            <div class="t-title">${safeTitle}</div>
            <div class="t-msg">${safeMessage.replace(/\n/g, '<br>')}</div>
        </div>`; 
    
    container.appendChild(toast); 
    
    setTimeout(() => { 
        if(toast.parentNode) {
            toast.classList.add('closing'); 
            toast.addEventListener('animationend', () => toast.remove()); 
        }
    }, 5000); 
    
    toast.onclick = () => { 
        toast.classList.add('closing'); 
        toast.addEventListener('animationend', () => toast.remove()); 
    };
};

window.showToast = function(message, type = 'info') {
    window.showNotification(type, type === 'success' ? 'TITAN OS' : 'INFO', message);
};

window.titanSetSyncStatus = function(status = 'local', message = '') {
    let pill = document.getElementById('titan-sync-status');
    if (!pill) {
        pill = document.createElement('div');
        pill.id = 'titan-sync-status';
        pill.setAttribute('aria-live', 'off');
        pill.setAttribute('role', 'status');
        document.body.appendChild(pill);

        const style = document.createElement('style');
        style.id = 'titan-sync-status-style';
        style.textContent = `
            #titan-sync-status {
                position: fixed; right: 14px; bottom: 14px; z-index: 99980;
                width: 14px; height: 14px; border-radius: 999px;
                background: rgba(8, 13, 22, 0.74);
                border: 1px solid rgba(148,163,184,0.22);
                box-shadow: 0 8px 20px rgba(0,0,0,0.28);
                pointer-events: auto; opacity: 0.82;
            }
            #titan-sync-status .dot {
                position: absolute; inset: 3px; border-radius: 50%;
                background: var(--accent); box-shadow: 0 0 10px var(--accent);
            }
            #titan-sync-status .label {
                position: absolute; width: 1px; height: 1px; overflow: hidden;
                clip: rect(0 0 0 0); white-space: nowrap;
            }
            #titan-sync-status[data-status="cloud"] .dot { background: var(--success); box-shadow: 0 0 10px rgba(16,185,129,0.75); }
            #titan-sync-status[data-status="error"] .dot,
            #titan-sync-status[data-status="offline"] .dot { background: var(--danger); box-shadow: 0 0 10px rgba(239,68,68,0.75); }
            #titan-sync-status[data-status="pending"] .dot { background: var(--warning); box-shadow: 0 0 10px rgba(126, 220, 255,0.75); }
            @media (max-width: 760px) { #titan-sync-status { right: 12px; bottom: calc(82px + var(--safe-area-bottom)); } }
        `;
        document.head.appendChild(style);
    }

    const labels = {
        local: 'Sauvegarde locale',
        pending: 'Sync en cours',
        cloud: 'Connecte',
        offline: 'Mode hors ligne',
        error: 'Erreur sync'
    };
    pill.dataset.status = status;
    const label = message || labels[status] || labels.local;
    pill.title = label;
    pill.setAttribute('aria-label', label);
    pill.innerHTML = `<span class="dot"></span><span class="label">${window.titanEscapeText(label)}</span>`;
};

window.titanStateBlock = function(type = 'empty', title = 'Aucun contenu', message = '', action = null) {
    const config = {
        empty: { icon: 'ri-inbox-line', color: 'var(--text-muted)' },
        loading: { icon: 'ri-loader-4-line ri-spin', color: 'var(--accent)' },
        error: { icon: 'ri-error-warning-line', color: 'var(--danger)' },
        offline: { icon: 'ri-wifi-off-line', color: 'var(--warning)' },
        success: { icon: 'ri-checkbox-circle-line', color: 'var(--success)' }
    }[type] || { icon: 'ri-information-line', color: 'var(--accent)' };
    const actionHtml = action && action.href
        ? `<a class="btn-action" style="width:auto; min-height:40px; margin-top:12px; padding:10px 14px;" href="${window.titanEscapeText(action.href)}">${window.titanEscapeText(action.label || 'Ouvrir')}</a>`
        : '';
    return `
        <div class="titan-state-block" style="text-align:center; padding:32px 18px; border:1px dashed rgba(148,163,184,0.22); border-radius:8px; color:#94a3b8;">
            <i class="${config.icon}" style="font-size:2rem; color:${config.color}; display:block; margin-bottom:10px;"></i>
            <div style="font-family:'Russo One'; color:#fff; font-size:0.95rem; text-transform:uppercase;">${window.titanEscapeText(title)}</div>
            ${message ? `<div style="font-size:0.8rem; line-height:1.45; margin-top:7px;">${window.titanEscapeText(message)}</div>` : ''}
            ${actionHtml}
        </div>`;
};

window.titanRenderStateBlock = function(target, type, title, message, action) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return false;
    el.innerHTML = window.titanStateBlock(type, title, message, action);
    return true;
};

window.getAvatarUrl = function(avatar) {
    const safeAvatar = String(avatar || '').trim();
    if (!safeAvatar) return './image/logo.png';
    const localAvatar = safeAvatar.match(/^avatar_(\d+)\.(?:png|webp)$/i);
    if (localAvatar) return `./image/avatar/avatar_${localAvatar[1]}.webp`;
    if (!/^[a-z0-9_-]+_\d+\.(png|jpe?g|webp|gif)$/i.test(safeAvatar)) return './image/logo.png';
    if (window.titanClient && window.titanClient.storage) {
        const { data } = window.titanClient.storage.from('avatars').getPublicUrl(safeAvatar);
        if (data && data.publicUrl) return data.publicUrl;
    }
    return './image/logo.png';
};

/* --- 1B. COSMETIQUES PREMIUM (ZERO GAMEPLAY) --- */
window.TITAN_PREMIUM_VISUALS = {
    frames: [
        { id: 'frame-standard', label: 'Standard', icon: 'ri-checkbox-blank-circle-line', className: 'frame-standard', elite: false },
        { id: 'frame-aegis', label: 'Aegis Gold', icon: 'ri-vip-crown-2-line', className: 'frame-aegis', elite: true },
        { id: 'frame-neon', label: 'Neon Core', icon: 'ri-radar-line', className: 'frame-neon', elite: false },
        { id: 'frame-frost', label: 'Cryo Plate', icon: 'ri-snowflake-line', className: 'frame-frost', elite: true },
        { id: 'frame-crimson', label: 'Redline', icon: 'ri-record-circle-line', className: 'frame-crimson', elite: false }
    ],
    grenadeSkins: [
        { id: 'grenade-default', label: 'Standard', icon: 'ri-checkbox-blank-circle-line', className: 'grenade-skin-default', color: '', elite: false },
        { id: 'grenade-plasma', label: 'Plasma', icon: 'ri-blur-off-line', className: 'grenade-skin-plasma', color: '#a78bfa', elite: true },
        { id: 'grenade-gold', label: 'Aurum', icon: 'ri-vip-diamond-line', className: 'grenade-skin-gold', color: '#9ee7ff', elite: true },
        { id: 'grenade-glitch', label: 'Glitch', icon: 'ri-scan-2-line', className: 'grenade-skin-glitch', color: '#22d3ee', elite: false },
        { id: 'grenade-frost', label: 'Cryo', icon: 'ri-snowflake-line', className: 'grenade-skin-frost', color: '#7dd3fc', elite: false }
    ],
    victoryEffects: [
        { id: 'victory-standard', label: 'Standard', icon: 'ri-medal-line', className: 'victory-standard', elite: false },
        { id: 'victory-ion', label: 'Ion Burst', icon: 'ri-flashlight-line', className: 'victory-ion', elite: false },
        { id: 'victory-orbital', label: 'Orbital Seal', icon: 'ri-crosshair-2-line', className: 'victory-orbital', elite: true }
    ]
};

window.TITAN_COSMETIC_ITEMS = [
    { id: 'cos_frame_neon', cosmeticId: 'frame-neon', type: 'cosmetic', category: 'cosmetic', name: 'Cadre Neon Core', icon: 'ri-radar-line', price: 450, desc: 'Contour cyan lumineux pour ton profil.', requiresElite: false },
    { id: 'cos_frame_crimson', cosmeticId: 'frame-crimson', type: 'cosmetic', category: 'cosmetic', name: 'Cadre Redline', icon: 'ri-record-circle-line', price: 700, desc: 'Finition rouge orbital gagnée avec tes crédits.', requiresElite: false },
    { id: 'cos_grenade_glitch', cosmeticId: 'grenade-glitch', type: 'cosmetic', category: 'cosmetic', name: 'Effet Glitch', icon: 'ri-scan-2-line', price: 600, desc: 'Effet visuel parasite dans l’aventure, sans puissance ajoutée.', requiresElite: false },
    { id: 'cos_grenade_frost', cosmeticId: 'grenade-frost', type: 'cosmetic', category: 'cosmetic', name: 'Effet Cryo', icon: 'ri-snowflake-line', price: 800, desc: 'Traînée glacée purement visuelle.', requiresElite: false },
    { id: 'cos_victory_ion', cosmeticId: 'victory-ion', type: 'cosmetic', category: 'cosmetic', name: 'Victoire Ion Burst', icon: 'ri-flashlight-line', price: 950, desc: 'Animation de victoire débloquée avec tes crédits.', requiresElite: false },
    { id: 'cos_frame_aegis', cosmeticId: 'frame-aegis', type: 'cosmetic', category: 'cosmetic', name: 'Cadre Aegis Gold', icon: 'ri-vip-crown-2-line', price: 0, desc: 'Cadre de la collection TITAN+, sans bonus de statistiques.', requiresElite: true },
    { id: 'cos_frame_frost', cosmeticId: 'frame-frost', type: 'cosmetic', category: 'cosmetic', name: 'Cadre Cryo Plate', icon: 'ri-snowflake-line', price: 0, desc: 'Finition froide de la collection TITAN+.', requiresElite: true },
    { id: 'cos_grenade_plasma', cosmeticId: 'grenade-plasma', type: 'cosmetic', category: 'cosmetic', name: 'Effet Plasma', icon: 'ri-blur-off-line', price: 0, desc: 'Habillage plasma TITAN+, uniquement visuel.', requiresElite: true },
    { id: 'cos_grenade_gold', cosmeticId: 'grenade-gold', type: 'cosmetic', category: 'cosmetic', name: 'Effet Aurum', icon: 'ri-vip-diamond-line', price: 0, desc: 'Finition or TITAN+, sans dégât supplémentaire.', requiresElite: true },
    { id: 'cos_victory_orbital', cosmeticId: 'victory-orbital', type: 'cosmetic', category: 'cosmetic', name: 'Victoire Orbital Seal', icon: 'ri-crosshair-2-line', price: 0, desc: 'Signature de victoire TITAN+ sans gain caché.', requiresElite: true }
];

window.titanIsElite = function(user = window.state?.user) {
    return !!(user && user.is_elite === true);
};

window.titanGetCosmetics = function(user = window.state?.user) {
    return user && user.cosmetics ? user.cosmetics : { unlocked: [], active: {} };
};

window.titanGetVisualById = function(id) {
    const all = [
        ...window.TITAN_PREMIUM_VISUALS.frames,
        ...window.TITAN_PREMIUM_VISUALS.grenadeSkins,
        ...window.TITAN_PREMIUM_VISUALS.victoryEffects
    ];
    return all.find(item => item.id === id) || null;
};

window.titanIsCosmeticUnlocked = function(id, user = window.state?.user) {
    const visual = window.titanGetVisualById(id);
    if (visual && visual.elite && window.titanIsElite(user)) return true;
    const unlocked = window.titanGetCosmetics(user).unlocked || [];
    return unlocked.includes(id);
};

window.titanGetActiveCosmetic = function(slot, fallbackId) {
    const user = window.state?.user;
    const active = window.titanGetCosmetics(user).active || {};
    const id = active[slot] || fallbackId;
    return window.titanIsCosmeticUnlocked(id, user) ? id : fallbackId;
};

window.titanActivateCosmetic = function(slot, id) {
    if (!window.state || !window.state.user || !window.titanIsCosmeticUnlocked(id)) return false;
    if (!window.state.user.cosmetics) window.state.user.cosmetics = { unlocked: [], active: {} };
    if (!window.state.user.cosmetics.active) window.state.user.cosmetics.active = {};
    window.state.user.cosmetics.active[slot] = id;
    if (typeof window.saveState === 'function') window.saveState({ forceCloud: true });
    if (typeof window.updateGlobalUI === 'function') window.updateGlobalUI();
    return true;
};

window.titanUnlockCosmetic = function(id) {
    if (!window.state || !window.state.user) return false;
    const visual = window.titanGetVisualById(id);
    if (visual?.elite && !window.titanIsElite()) {
        if (typeof window.showNotification === 'function') window.showNotification('warning', 'TITAN+ REQUIS', 'Ce cosmétique appartient à la collection TITAN+.');
        return false;
    }
    if (!window.state.user.cosmetics) window.state.user.cosmetics = { unlocked: [], active: {} };
    if (!Array.isArray(window.state.user.cosmetics.unlocked)) window.state.user.cosmetics.unlocked = [];
    if (!window.state.user.cosmetics.unlocked.includes(id)) window.state.user.cosmetics.unlocked.push(id);
    if (typeof window.saveState === 'function') window.saveState({ forceCloud: true });
    return true;
};

window.titanGetShopEconomy = function() {
    const economy = window.TITAN_ECONOMY || {};
    return Object.assign({
        chargeWeeklyLimit: 2,
        adDailyLimit: 1,
        adWeeklyLimit: 3,
        adRewardCap: 120,
        chargePriceFloor: 450,
        upgradeBasePrice: 1400,
        upgradeStepPrice: 1150,
        cosmeticCreditsPrice: 0
    }, economy.shop || {});
};

window.titanNormalizeShopItem = function(item) {
    const source = Object.assign({}, item || {});
    const shopEco = window.titanGetShopEconomy ? window.titanGetShopEconomy() : {};
    source.category = source.category || source.type || 'misc';
    source.price = Math.max(0, Number(source.price || 0));
    source.effectVal = Number(source.effectVal || source.effect_val || 0);
    source.requiresElite = source.requiresElite === true || source.elite_only === true || source.requires_elite === true;
    source.cooldown = Object.assign({ type: 'none', max: 0 }, source.cooldown || {});
    if (source.type === 'charge') {
        source.price = Math.max(source.price, Math.max(shopEco.chargePriceFloor || 450, Math.round(Math.max(1, source.effectVal || 1) * 90)));
        source.cooldown.type = 'weekly';
        source.cooldown.max = Math.min(Number(source.cooldown.max || shopEco.chargeWeeklyLimit || 2), shopEco.chargeWeeklyLimit || 2);
        source.economyNote = `${source.cooldown.max}/semaine pour eviter le spam combat.`;
    } else if (source.type === 'upgrade') {
        const level = Math.max(1, Number(source.effectVal || 1));
        source.price = Math.max(source.price, (shopEco.upgradeBasePrice || 1400) + (level - 1) * (shopEco.upgradeStepPrice || 1150));
        if (!source.cooldown.type || source.cooldown.type === 'none') source.cooldown.type = 'once';
        source.economyNote = 'Progression permanente, prix volontairement haut.';
    } else if (source.type === 'ad') {
        source.price = 0;
        source.effectVal = Math.min(Math.max(0, source.effectVal || 0), shopEco.adRewardCap || 120);
        source.cooldown.type = 'daily';
        source.cooldown.max = shopEco.adDailyLimit || 1;
        source.economyNote = `${source.effectVal} credits max, volontaire et limite.`;
    } else if (source.type === 'cosmetic') {
        source.price = source.requiresElite ? 0 : Math.max(source.price, shopEco.cosmeticCreditsPrice || 450);
        source.cooldown.type = 'once';
        source.cooldown.max = 1;
        source.economyNote = source.requiresElite
            ? 'Inclus dans TITAN+. Visuel uniquement, aucun avantage de puissance.'
            : 'À débloquer avec les crédits gagnés par le sport. Visuel uniquement.';
    }
    return source;
};

window.titanGetShopCatalog = function() {
    const base = Array.isArray(window.SHOP_DB) ? window.SHOP_DB : [];
    const existing = new Set(base.map(item => item.id));
    const cosmetics = (window.TITAN_COSMETIC_ITEMS || []).filter(item => !existing.has(item.id));
    return [...base, ...cosmetics]
        .map(item => window.titanNormalizeShopItem ? window.titanNormalizeShopItem(item) : item)
        .filter(item => item.type !== 'ad' || window.TITAN_EXTERNAL_URLS?.adsEnabled === true);
};

window.titanGetAvatarFrameClass = function(user = window.state?.user) {
    const id = window.titanGetActiveCosmetic('avatarFrame', 'frame-standard');
    const frame = window.TITAN_PREMIUM_VISUALS.frames.find(item => item.id === id);
    return frame ? frame.className : 'frame-standard';
};

window.titanGetGrenadeSkin = function() {
    const id = window.titanGetActiveCosmetic('grenadeSkin', 'grenade-default');
    return window.TITAN_PREMIUM_VISUALS.grenadeSkins.find(item => item.id === id) || window.TITAN_PREMIUM_VISUALS.grenadeSkins[0];
};

window.titanRenderPremiumIcon = function(user = window.state?.user) {
    return window.titanIsElite(user) ? '<span class="titan-premium-icon" title="Membre TITAN+"><i class="ri-vip-crown-2-fill"></i></span>' : '';
};

window.titanRenderEliteMark = function(user = window.state?.user) {
    return window.titanIsElite(user) ? '<span class="titan-elite-mark"><i class="ri-vip-crown-2-fill"></i> TITAN+</span>' : '';
};

window.triggerTitanVictoryEffect = function(kind = 'target') {
    const effectId = window.titanGetActiveCosmetic('victoryEffect', 'victory-standard');
    if (effectId === 'victory-standard') return;
    const fx = document.createElement('div');
    fx.className = `titan-victory-fx ${effectId === 'victory-orbital' ? 'orbital' : 'ion'}`;
    fx.innerHTML = `<div class="victory-fx-ring"></div><div class="victory-fx-label"><i class="ri-shield-flash-line"></i> ${kind === 'boss' ? 'BOSS NEUTRALISE' : 'CIBLE NEUTRALISEE'}</div>`;
    document.body.appendChild(fx);
    setTimeout(() => fx.remove(), 1800);
};

/* --- 2. INJECTION ÉLÉMENTS GLOBAUX --- */
window.injectSidebar = function() {
    const sb = document.querySelector('.sidebar');
    if (!sb) return;
    const u = (window.state && window.state.user) ? window.state.user : { name: '...', level: 0, avatar: null };
    const userAvatar = u.avatar;
    const avatarHTML = userAvatar ? `<img src="${window.getAvatarUrl(userAvatar)}" class="avatar-img" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.src='./image/logo.png'" alt="Avatar du joueur">` : `<div class="avatar-circle"><i class="ri-user-3-fill"></i></div>`;
    
    // Fonction helper pour class active
    const pg = (n) => window.location.pathname.includes(n) ? 'active' : '';

    const dbIssues = window.TITAN_DB_STATUS && window.TITAN_DB_STATUS.issues ? window.TITAN_DB_STATUS.issues.length : 0;
    const dbBadge = !window.titanClient
        ? `<span class="db-status-dot local" title="DB locale"></span>`
        : (dbIssues > 0
            ? `<span class="db-status-dot warning" title="DB secours"></span>`
            : `<span class="db-status-dot" title="DB online"></span>`);

    sb.innerHTML = `
    <a class="brand" href="/aujourdhui"><span class="brand-symbol" aria-hidden="true">↗</span><div class="brand-meta"><span class="brand-title">TITAN.</span><span class="brand-version">Tous tes sports. Ton histoire.</span></div></a>
    <a class="profile-widget" href="/profile">
        <div style="width:45px; height:45px; border-radius:50%; overflow:hidden; border:2px solid var(--accent); background:#1e2538; display:flex; align-items:center; justify-content:center;">${avatarHTML}</div>
        <div class="profile-info"><div class="profile-name">${window.titanEscapeText(u.name)}</div><div style="font-size:0.7rem;color:#94a3b8;">Niveau ${u.level}</div><div class="profile-meta-line">${dbBadge}</div></div>
    </div>
    <div class="nav-category">ESSENTIEL</div>
    <a href="index.html" class="nav-link ${pg('index.html')}"><i class="ri-home-5-line"></i> AUJOURD'HUI</a>
    <a href="training.html" class="nav-link ${pg('training.html')}"><i class="ri-add-circle-line"></i> ENREGISTRER</a>
    <a href="journal.html" class="nav-link ${pg('journal.html')}"><i class="ri-calendar-check-line"></i> JOURNAL</a>
    <a href="stats.html" class="nav-link ${pg('stats.html')}"><i class="ri-line-chart-line"></i> PROGRÈS</a>
    <a href="profile.html" class="nav-link ${pg('profile.html')}"><i class="ri-user-3-line"></i> PROFIL</a>
    <div class="nav-category">PLUS</div>
    <a href="adventure.html" class="nav-link ${pg('adventure.html')}"><i class="ri-compass-3-line"></i> AVENTURE</a>
    <a href="boutique.html" class="nav-link ${pg('boutique.html')}"><i class="ri-store-3-line"></i> ARMURERIE</a>
    <div class="nav-category">SYSTÈME</div>
    <a href="social.html" class="nav-link ${pg('social.html')}"><i class="ri-team-line"></i> SOCIAL</a>
    <a href="talents.html" class="nav-link ${pg('talents.html')}"><i class="ri-mind-map"></i> TALENTS</a>
    <a href="profile.html" class="nav-link ${pg('profile.html')}"><i class="ri-settings-4-line"></i> PROFIL</a>`;
};

window.injectMobileHeader = function() { 
    const m = document.querySelector('.main-content'); 
    if(!m || document.querySelector('.mobile-user-bar')) return; 
    
    const u = (window.state && window.state.user) ? window.state.user : { name: '...', level: 0, credits: 0, avatar: null };
    const avatarHTML = u.avatar ? `<img src="${window.getAvatarUrl(u.avatar)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='./image/logo.png'" alt="Avatar du joueur">` : `<i class="ri-user-3-fill"></i>`;
    
    m.insertAdjacentHTML('afterbegin', `
    <div class="mobile-user-bar">
        <div style="display:flex;align-items:center;justify-content:space-between;width:100%;background:rgba(255,255,255,0.05);padding:15px;border-radius:16px;margin-bottom:20px;">
            <div style="display:flex;gap:12px;" onclick="window.location.href='profile.html'">
                <div style="width:40px;height:40px;background:#1e2538;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#38bdf8;border:1px solid #38bdf8;overflow:hidden;">${avatarHTML}</div>
                <div><div style="font-weight:800;color:#fff;">${window.titanEscapeText(u.name)}</div><div style="font-size:0.75rem;color:#94a3b8;">Niv. ${Math.floor(Number(u.level) || 0)}</div></div>
            </div>
            <div style="text-align:right;"><div style="font-weight:800;color:#9ee7ff;">${Math.floor(u.credits)} $</div></div>
        </div>
    </div>`); 
};

window.injectMobileNav = function() {
    if (window.innerWidth <= 1024) {
        if (document.querySelector('.mobile-nav')) return;
        const nav = document.createElement('nav');
        nav.className = 'mobile-nav';
        
        const p = (n) => window.location.pathname.includes(n) ? 'active' : '';
        const isHome = window.location.pathname.endsWith('/') || window.location.pathname.includes('index.html');
        
        nav.innerHTML = `
            <a href="index.html" class="mobile-nav-link ${isHome ? 'active' : ''}"><i class="ri-home-5-line"></i><span>ACCUEIL</span></a>
            <a href="training.html" class="mobile-nav-link ${p('training.html')}"><i class="ri-add-circle-line"></i><span>AJOUTER</span></a>
            <a href="journal.html" class="mobile-nav-link ${p('journal.html')}"><i class="ri-calendar-check-line"></i><span>JOURNAL</span></a>
            <a href="stats.html" class="mobile-nav-link ${p('stats.html')}"><i class="ri-line-chart-line"></i><span>PROGRÈS</span></a>
            <a href="profile.html" class="mobile-nav-link ${p('profile.html')}"><i class="ri-user-3-line"></i><span>PROFIL</span></a>
        `;
        document.body.appendChild(nav);
    }
};

window.injectFavicon = function() {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.type = 'image/png'; link.href = './image/logo.png?v=3'; 
};

window.triggerMaintenanceScreen = function() {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return;
    document.body.innerHTML = ''; document.body.style.overflow = 'hidden';
    
    const wall = document.createElement('div'); 
    wall.style.cssText = `position:fixed; top:0; left:0; width:100%; height:100%; background:#0b1120; z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; color:white; font-family:'Segoe UI', sans-serif; text-align:center; padding:20px;`;
    
    wall.innerHTML = `
        <i class="ri-tools-fill" style="font-size:4rem; color:#9ee7ff; margin-bottom:20px; animation:pulse 2s infinite"></i>
        <h1 style="text-transform:uppercase; letter-spacing:2px; font-weight:900; margin-bottom:10px;">Maintenance en cours</h1>
        <p style="color:#94a3b8; max-width:400px; line-height:1.6; font-size:1.1rem;">Le système Titan OS reçoit une mise à jour critique.<br>Veuillez patienter quelques instants.</p>
        <div style="margin-top:30px; font-family:monospace; color:#38bdf8; opacity:0.6;">CODE: SYS_UPDATE_V${window.GAME_SETTINGS.version}</div>`;
    
    const style = document.createElement('style'); 
    style.innerHTML = `@keyframes pulse { 0% { opacity: 0.5; transform: scale(0.95); } 50% { opacity: 1; transform: scale(1.05); } 100% { opacity: 0.5; transform: scale(0.95); } }`; 
    document.head.appendChild(style); 
    document.body.appendChild(wall);
};

/* --- 3. MISES À JOUR DYNAMIQUES UI --- */
window.updateGlobalUI = function() {
    if (!window.state || !window.state.user) return;
    const creds = isNaN(window.state.user.credits) ? 0 : window.state.user.credits;
    
    document.querySelectorAll('#global-credits, #mobileCredits, #dash-credits').forEach(el => el.innerText = Math.floor(creds));
    
    if(document.getElementById('dash-xp')) document.getElementById('dash-xp').innerText = window.state.user.xp || 0;
    if(document.getElementById('dash-lvl')) document.getElementById('dash-lvl').innerText = window.state.user.level || 1;
    
    if(document.getElementById('talent-pts')) {
        const totalPoints = Math.max(0, (window.state.user.level || 1) - 1);
        let spent = 0;
        if(window.TALENT_TREE && window.state.user.unlockedTalents) {
            window.state.user.unlockedTalents.forEach(id => { if(window.TALENT_TREE[id]) spent += window.TALENT_TREE[id].cost; });
        }
        document.getElementById('talent-pts').innerText = (totalPoints - spent);
    }

    if (document.querySelector('.mobile-user-bar') && typeof window.injectMobileHeader === 'function') window.injectMobileHeader();
    if (document.querySelector('.sidebar') && typeof window.injectSidebar === 'function') window.injectSidebar();

    // --- INJECTION BOUTON DEV (TESTEUR UNIQUEMENT) ---
    if (window.TITAN_ENABLE_DEV_TOOLS === true && window.state && window.state.user && window.state.user.is_tester) {
        let devBtn = document.getElementById('secret-dev-btn');
        if (!devBtn) {
            // Crée le bouton uniquement sur le dashboard (index.html)
            if (window.location.pathname.endsWith('/') || window.location.pathname.endsWith('index.html')) {
                devBtn = document.createElement('a');
                devBtn.id = 'secret-dev-btn';
                devBtn.href = 'sys_core_override_99.html';
                devBtn.innerHTML = '<i class="ri-terminal-box-fill"></i> DEV MODE';
                devBtn.style.cssText = `
                    position: fixed; bottom: 80px; left: 15px; z-index: 9999;
                    background: #22c55e; color: #000; font-family: 'Russo One';
                    padding: 10px 15px; border-radius: 8px; text-decoration: none;
                    box-shadow: 0 0 15px rgba(34, 197, 94, 0.5); font-size: 0.8rem;
                `;
                document.body.appendChild(devBtn);
            }
        }
    }
};

(function titanFirstRunGuide() {
    if (window.__titanFirstRunGuideReady) return;
    window.__titanFirstRunGuideReady = true;

    const GUIDE_VERSION = 'v2';
    const GUIDE_KEY = `titan_first_run_guide_${GUIDE_VERSION}`;
    const blockedFiles = new Set([
        'guide.html',
        'onboarding.html',
        'service.html',
        'partenariats.html',
        'login.html',
        'update-password.html',
        'legal_hub.html',
        'legal_cgu.html',
        'legal_privacy.html',
        'legal_mentions.html',
        'network-error.html',
        '404.html'
    ]);
    let guideOpen = false;

    function currentFile() {
        if (typeof titanCurrentFile === 'function') return titanCurrentFile();
        const clean = String(window.location.pathname || '').replace(/\/+$/, '').split('/').pop();
        return clean || 'index.html';
    }

    function isCloudUserReady() {
        const id = window.state?.user?.id || '';
        return !!id && !String(id).startsWith('guest_');
    }

    function markSeen() {
        try { localStorage.setItem(GUIDE_KEY, new Date().toISOString()); } catch (_) {}
        if (window.state) {
            window.state.meta = window.state.meta || {};
            window.state.meta.firstRunGuideSeen = true;
            window.state.meta.firstRunGuideVersion = GUIDE_VERSION;
            if (typeof window.saveState === 'function') window.saveState({ forceCloud: true });
        }
    }

    window.titanCloseFirstRunGuide = function(targetHref = '') {
        const overlay = document.getElementById('titan-first-run-guide');
        markSeen();
        guideOpen = false;
        if (overlay) {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 180);
        }
        if (targetHref) {
            setTimeout(() => { window.location.href = targetHref; }, 120);
        }
    };

    window.titanResetFirstRunGuide = function() {
        try {
            localStorage.removeItem(GUIDE_KEY);
            localStorage.removeItem('titan_first_run_guide_v1');
        } catch (_) {}
        if (window.state) {
            window.state.meta = window.state.meta || {};
            window.state.meta.firstRunGuideSeen = false;
            window.state.meta.firstRunGuideVersion = null;
        }
        window.titanMaybeShowFirstRunGuide(true);
    };

    window.titanMaybeShowFirstRunGuide = function(force = false) {
        let forced = !!force;
        try {
            if (localStorage.getItem('titan_force_first_run_guide') === '1') {
                forced = true;
                localStorage.removeItem('titan_force_first_run_guide');
                localStorage.removeItem(GUIDE_KEY);
            }
        } catch (_) {}
        if (guideOpen || document.getElementById('titan-first-run-guide')) return;
        if (!forced && blockedFiles.has(currentFile())) return;
        if (!forced && !isCloudUserReady()) return;
        try {
            if (!forced && localStorage.getItem(GUIDE_KEY)) return;
        } catch (_) {}
        if (!forced && window.state?.meta?.firstRunGuideSeen && window.state?.meta?.firstRunGuideVersion === GUIDE_VERSION) {
            try { localStorage.setItem(GUIDE_KEY, 'state'); } catch (_) {}
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'titan-first-run-guide';
        overlay.className = 'titan-first-run-guide active';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'titan-guide-title');
        overlay.innerHTML = `
            <div class="titan-guide-panel">
                <button class="titan-guide-close" type="button" onclick="titanCloseFirstRunGuide()" aria-label="Fermer le guide">
                    <i class="ri-close-line"></i>
                </button>
                <div class="titan-guide-kicker">Premiere connexion</div>
                <h2 id="titan-guide-title">Bienvenue dans TITAN OS.</h2>
                <p class="titan-guide-copy">Le parcours reste volontairement court: tu lis le QG, tu enregistres une seance, puis tu regardes ce qui bouge: XP, credits, charge, radar, boss, journal et prochain cap.</p>
                <div class="titan-guide-steps">
                    <div class="titan-guide-step">
                        <i class="ri-dashboard-3-line"></i>
                        <div><strong>1. QG</strong><span>Lis seulement la priorite, le coach et tes limites de semaine. Le reste attend dans les modules.</span></div>
                    </div>
                    <div class="titan-guide-step">
                        <i class="ri-run-line"></i>
                        <div><strong>2. Sport</strong><span>Ajoute ta première séance avec sa durée et son intensité. Connecté, ton compte sauvegarde et vérifie automatiquement ta progression.</span></div>
                    </div>
                    <div class="titan-guide-step">
                        <i class="ri-coin-line"></i>
                        <div><strong>3. Economie</strong><span>XP et credits montent avec les missions, mais les plafonds evitent de finir trop vite.</span></div>
                    </div>
                    <div class="titan-guide-step">
                        <i class="ri-sword-line"></i>
                        <div><strong>4. Aventure</strong><span>Les boss donnent du sens a tes efforts. Le combat contre toi-meme arrive plus tard dans la campagne.</span></div>
                    </div>
                    <div class="titan-guide-step">
                        <i class="ri-line-chart-line"></i>
                        <div><strong>5. Progres</strong><span>Va dans Progres pour comprendre charge, fraicheur, radar, records contextualises, plateaux et duels contre toi.</span></div>
                    </div>
                    <div class="titan-guide-step">
                        <i class="ri-team-line"></i>
                        <div><strong>6. Reseau</strong><span>Amis, guilde et messages restent secondaires: utiles, mais jamais obligatoires pour jouer.</span></div>
                    </div>
                    <div class="titan-guide-step">
                        <i class="ri-store-3-line"></i>
                        <div><strong>7. Boutique</strong><span>Les cosmétiques personnalisent ton expérience sans modifier ta puissance ni tes récompenses.</span></div>
                    </div>
                    <div class="titan-guide-step">
                        <i class="ri-question-line"></i>
                        <div><strong>8. Aide</strong><span>Le guide explique l’XP, les crédits, les objectifs, l’aventure, TITAN+ et les particularités de chaque sport.</span></div>
                    </div>
                </div>
                <div class="titan-guide-actions">
                    <button type="button" class="btn-primary titan-guide-primary" onclick="titanCloseFirstRunGuide('training.html')">
                        <i class="ri-flashlight-line"></i> Premiere mission
                    </button>
                    <button type="button" class="titan-guide-secondary" onclick="titanCloseFirstRunGuide('guide.html#guide-demarrage')">
                        <i class="ri-compass-3-line"></i> Guide complet
                    </button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        guideOpen = true;
    };

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && document.getElementById('titan-first-run-guide')) {
            window.titanCloseFirstRunGuide();
        }
    });
})();

window.renderSports = function() {
    const grid = document.getElementById('sports-grid');
    if(!grid) return;
    
    grid.innerHTML = '';
    const sports = Object.entries(window.SPORTS_CONFIG);
    
    if(sports.length === 0) {
        grid.innerHTML = '<div style="color:#64748b; text-align:center; padding:20px;">Chargement des protocoles...</div>';
        return;
    }

    sports.forEach(([id, s]) => {
        const item = document.createElement('div');
        item.className = 'grid-item'; 
        item.dataset.cat = s.cat || 'other'; 
        item.onclick = () => window.location.href = `training.html?sport=${id}`;
        
        item.innerHTML = `
            <i class="${s.icon || 'ri-flashlight-fill'} sport-icon"></i>
            <span class="sport-label">${s.label}</span>
        `;
        
        grid.appendChild(item);
    });
};

window.renderHistory = function() {
    const list = document.getElementById('history-list');
    if(!list) return;
    
    const logs = window.state.history || [];
    if(logs.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">Aucune mission terminée.</div>';
        return;
    }

    list.innerHTML = logs.sort((a,b) => new Date(b.date) - new Date(a.date)).map(log => {
        const sportLabel = (window.SPORTS_CONFIG[log.sport] ? window.SPORTS_CONFIG[log.sport].label : log.sport).toUpperCase();
        
        return `
        <div class="history-card ${log.eliteTrace ? 'elite-trace' : ''}" onclick="if(typeof openSessionModal === 'function') openSessionModal('${log.id}')">
            <div style="display:flex; align-items:center; gap:12px;">
                <div style="width:40px; height:40px; background:rgba(56,189,248,0.1); border-radius:50%; display:flex; align-items:center; justify-content:center; color:var(--accent); border:1px solid var(--accent);">
                    <i class="${window.SPORTS_CONFIG[log.sport]?.icon || 'ri-check-line'}"></i>
                </div>
                <div>
                    <div style="font-family:'Russo One'; color:#fff; font-size:0.9rem;">${sportLabel}</div>
                    <div style="font-size:0.7rem; color:#64748b; font-family:'Courier New';">${new Date(log.date).toLocaleDateString()}</div>
                </div>
            </div>
            <div style="text-align:right;">
                <div style="font-family:'Russo One'; color:#fff;">${log.val} <span style="font-size:0.6rem; color:#64748b;">${log.unit}</span></div>
                <div style="font-size:0.7rem; color:var(--success); font-weight:800;">+${log.xp} XP</div>
            </div>
        </div>`;
    }).join('');
};

window.fixPath = function(path, type) {
    if (!path) return `./image/logo.png`;
    const clean = path.replace(/^.*[\\\/]/, '');
    return `./image/${type}/${clean}`;
};

/* --- 4. SYSTEME NEWS (UI) --- */
window.checkNewsStatus = async function() {
    if (!window.titanClient) return;
    const btn = document.getElementById('news-trigger-btn');
    if (!btn) return;

    if (!window.cachedNewsData) {
        const { data: news } = await window.titanClient
            .from('news_updates')
            .select('*')
            .eq('active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        if (news) window.cachedNewsData = news;
    }

    if (!window.cachedNewsData) return;

    let lastSeenVersion = "none";
    if (window.state.user.id.startsWith('guest_')) {
        lastSeenVersion = localStorage.getItem('titan_last_news_version') || "none";
    } else {
        lastSeenVersion = window.state.user.last_seen_news_version || "none";
    }
    
    if (window.cachedNewsData.version_id !== lastSeenVersion) {
        btn.classList.add('news-unread');
        btn.innerHTML = `<i class="ri-notification-3-fill"></i> TRANSMISSION`;
    } else {
        btn.classList.remove('news-unread');
        btn.innerHTML = `<i class="ri-radio-2-fill"></i> TRANSMISSIONS`;
    }
};

window.openSystemNews = async function(forceOpen = false) {
    const modal = document.getElementById('titan-news-modal');
    if (!modal) return;

    if (!window.cachedNewsData && window.titanClient) {
        const { data: news } = await window.titanClient
            .from('news_updates')
            .select('*')
            .eq('active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        if (news) window.cachedNewsData = news;
    }

    const newsData = window.cachedNewsData || { 
        title: "CANAL SÉCURISÉ", 
        message: "Aucune transmission active.\nRestez à l'écoute, agent.", 
        version_id: "none" 
    };

    const titleEl = document.getElementById('news-title');
    const msgEl = document.getElementById('news-message');
    if (titleEl) titleEl.textContent = newsData.title;
    if (msgEl) msgEl.textContent = newsData.message;

    modal.classList.add('active');

    if (newsData.version_id !== "none") {
        localStorage.setItem('titan_last_news_version', newsData.version_id);
        if (window.state.user.id && !window.state.user.id.startsWith('guest_') && window.titanClient) {
            window.state.user.last_seen_news_version = newsData.version_id;
            if (typeof window.saveState === 'function') {
                window.saveState({ forceCloud: true });
            }
        }
        const btn = document.getElementById('news-trigger-btn');
        if (btn) {
            btn.classList.remove('news-unread');
            btn.innerHTML = `<i class="ri-radio-2-fill"></i> TRANSMISSIONS`;
        }
    }
};

window.closeSystemNews = function() {
    const modal = document.getElementById('titan-news-modal');
    if (modal) modal.classList.remove('active');
};

/* --- 5. MARKETING OPS --- */
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

/* --- 6. NAVIGATION IMMERSIVE UNIFIEE --- */
window.TITAN_NAV_LINKS = [
    { section: 'ESSENTIEL', href: 'aujourdhui.html', match: 'aujourdhui.html', icon: 'ri-home-5-line', label: 'Aujourd’hui', short: 'Aujourd’hui', desc: 'Ta vue du jour', mobile: true },
    { section: 'ESSENTIEL', href: 'training.html', match: 'training.html', icon: 'ri-add-circle-line', label: 'Enregistrer', short: 'Ajouter', desc: 'Noter une séance', mobile: true },
    { section: 'ESSENTIEL', href: 'journal.html', match: 'journal.html', icon: 'ri-calendar-check-line', label: 'Journal', short: 'Journal', desc: 'Toutes tes séances', mobile: true },
    { section: 'ESSENTIEL', href: 'stats.html', match: 'stats.html', icon: 'ri-line-chart-line', label: 'Progrès', short: 'Progrès', desc: 'Tendances sportives', mobile: true },
    { section: 'ESSENTIEL', href: 'profile.html', match: 'profile.html', icon: 'ri-user-3-line', label: 'Profil', short: 'Profil', desc: 'Compte et préférences', mobile: true }
];

window.TITAN_SECONDARY_LINKS = [
    {section: 'PROGRESSION',href: 'bilan.html',match: 'bilan.html',icon: 'ri-file-chart-line',label: 'Mon bilan',desc: 'Exports et analyses TITAN+'},
    { section: 'ENSEMBLE', href: 'social.html', match: 'social.html', icon: 'ri-team-line', label: 'Communauté', desc: 'Alliés, équipes et défis' },
    { section: 'ENSEMBLE', href: 'chat.html', match: 'chat.html', icon: 'ri-message-3-line', label: 'Messages', desc: 'Échanges avec tes alliés' },
    { section: 'PROGRESSION', href: 'adventure.html', match: 'adventure.html', icon: 'ri-compass-3-line', label: 'Aventure', desc: 'Défis et récit optionnels' },
    { section: 'PROGRESSION', href: 'trophies.html', match: 'trophies.html', icon: 'ri-trophy-line', label: 'Trophées', desc: 'Étapes débloquées' },
    { section: 'PROGRESSION', href: 'health.html', match: 'health.html', icon: 'ri-heart-pulse-line', label: 'Forme', desc: 'Récupération et équilibre' },
    { section: 'PERSONNALISER', href: 'disciplines.html', match: 'disciplines.html', icon: 'ri-medal-2-line', label: 'Mes sports', desc: 'Disciplines favorites' },
    { section: 'PERSONNALISER', href: 'talents.html', match: 'talents.html', icon: 'ri-route-line', label: 'Parcours', desc: 'Orienter ta progression' },
    { section: 'PERSONNALISER', href: 'boutique.html', match: 'boutique.html', icon: 'ri-palette-line', label: 'Boutique', desc: 'Cosmétiques et TITAN+' }
];

window.TITAN_UTILITY_LINKS = [
    { href: 'onboarding.html', match: 'onboarding.html', icon: 'ri-flag-line', label: 'BIEN DÉMARRER', desc: 'Premiers pas guidés' },
    { href: 'guide.html', match: 'guide.html', icon: 'ri-book-open-line', label: 'GUIDE', desc: 'Comprendre TITAN OS' },
    { href: 'algorithme.html', match: 'algorithme.html', icon: 'ri-question-line', label: 'MÉTHODE', desc: 'Comment la progression est calculée' },
    { href: 'notifications.html', match: 'notifications.html', icon: 'ri-notification-3-line', label: 'ALERTES', desc: 'Ce qui mérite ton attention' },
    { href: 'changelog.html', match: 'changelog.html', icon: 'ri-sparkling-line', label: 'NOUVEAUTÉS', desc: 'Les dernières améliorations' },
    { href: 'partenariats.html', match: 'partenariats.html', icon: 'ri-handshake-line', label: 'PARTENAIRES', desc: 'Offres pour les structures' },
    { href: 'legal_hub.html', match: 'legal_hub.html', icon: 'ri-shield-check-line', label: 'CONFIDENTIALITÉ', desc: 'Droits et documents utiles' },
    { href: window.TITAN_EXTERNAL_URLS?.supportMailto || '#', match: 'mailto:', icon: 'ri-customer-service-2-line', label: 'NOUS ÉCRIRE', desc: 'Aide et retours' },
    { href: 'login.html', match: 'login.html', icon: 'ri-login-circle-line', label: 'CONNEXION', desc: 'Retrouver ton compte' }
];

window.TITAN_SERVICE_HUB_LINK = {
    href: 'service.html',
    match: 'service.html',
    icon: 'ri-lifebuoy-line',
    label: 'Aide',
    desc: 'Guide, confidentialité et support'
};

function titanRouteToFile(value) {
    const clean = String(value || '').replace(/\/+$/, '').split('/').pop() || 'index';
    if (!clean || clean === 'index') return 'index.html';
    return clean.includes('.') ? clean : `${clean}.html`;
}

function titanCurrentFile() {
    return titanRouteToFile(window.location.pathname || '');
}

function titanPrimaryNavLinks() {
    return window.TITAN_NAV_LINKS || [];
}

function titanIsCurrentLink(link) {
    const file = titanCurrentFile();
    if (link.match === 'index.html') return file === '' || file === 'index.html';
    return file === link.match || (window.location.pathname || '').includes(link.match);
}

function titanNavClass(link, baseClass) {
    return `${baseClass} ${titanIsCurrentLink(link) ? 'active' : ''}`.trim();
}

function titanGroupLinks(links) {
    return links.reduce((acc, link) => {
        if (!acc[link.section]) acc[link.section] = [];
        acc[link.section].push(link);
        return acc;
    }, {});
}

function titanRenderLink(link, baseClass) {
    const desc = link.desc ? `<span>${link.desc}</span>` : '';
    return `<a href="${link.href}" class="${titanNavClass(link, baseClass)}" aria-label="${link.label}">
        <i class="${link.icon}"></i>
        <strong>${link.label}</strong>
        ${desc}
    </a>`;
}

function titanRenderGroupedNav(baseClass, links = titanPrimaryNavLinks()) {
    const grouped = titanGroupLinks(links);
    return Object.keys(grouped).map(section => {
        const links = grouped[section].map(link => titanRenderLink(link, baseClass)).join('');
        return `<div class="nav-sector"><div class="nav-category">${section}</div>${links}</div>`;
    }).join('');
}

function titanRenderServiceHub(mode = 'sidebar') {
    const active = titanIsCurrentLink(window.TITAN_SERVICE_HUB_LINK) || window.TITAN_UTILITY_LINKS.some(link => titanIsCurrentLink(link));
    if (mode === 'drawer') {
        const links = window.TITAN_UTILITY_LINKS.map(link => titanRenderLink(link, 'drawer-link drawer-link-service')).join('');
        return `<details class="service-hub service-hub-drawer" ${active ? 'open' : ''}>
            <summary><i class="ri-lifebuoy-line"></i><span><strong>Aide</strong><small>Guide, confidentialité et support</small></span></summary>
            <div class="service-hub-grid">${links}</div>
        </details>`;
    }
    return titanRenderLink(window.TITAN_SERVICE_HUB_LINK, 'nav-link nav-link-utility service-hub-entry');
}

function titanSetMobileMenu(open) {
    const drawer = document.querySelector('.mobile-menu-panel');
    const overlay = document.querySelector('.mobile-menu-overlay');
    const toggle = document.querySelector('.mobile-menu-toggle');
    document.body.classList.toggle('mobile-menu-open', !!open);
    document.querySelector('.layout')?.toggleAttribute('inert',!!open);
    document.querySelector('.mobile-nav')?.toggleAttribute('inert',!!open);
    if (drawer) {drawer.setAttribute('aria-hidden', open ? 'false' : 'true');drawer.inert=!open;if(open)drawer.querySelector('button,a')?.focus();else if(drawer.contains(document.activeElement))toggle?.focus();}
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (overlay) overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.querySelector('.layout')?.toggleAttribute('inert',!!open);
    document.querySelector('.mobile-nav')?.toggleAttribute('inert',!!open);
}

function titanToggleMobileMenu() {
    titanSetMobileMenu(!document.body.classList.contains('mobile-menu-open'));
}

window.titanSetMobileMenu = titanSetMobileMenu;
window.titanToggleMobileMenu = titanToggleMobileMenu;

window.injectSidebar = function() {
    const sb = document.querySelector('.sidebar');
    if (!sb) return;
    const u = (window.state && window.state.user) ? window.state.user : { name: '...', level: 0, avatar: null, credits: 0 };
    const avatarHTML = u.avatar ? `<img src="${window.getAvatarUrl(u.avatar)}" class="avatar-img" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.src='./image/logo.png'" alt="Avatar du joueur">` : `<div class="avatar-circle"><i class="ri-user-3-fill"></i></div>`;
    const avatarFrameClass = window.titanGetAvatarFrameClass ? window.titanGetAvatarFrameClass(u) : 'frame-standard';
    const eliteAvatarClass = window.titanIsElite && window.titanIsElite(u) ? 'titan-elite-avatar-effect' : '';
    const dbIssues = window.TITAN_DB_STATUS && window.TITAN_DB_STATUS.issues ? window.TITAN_DB_STATUS.issues.length : 0;
    const dbBadge = !window.titanClient
        ? `<span class="db-status-dot local" title="Mode hors ligne"></span>`
        : (dbIssues > 0
            ? `<span class="db-status-dot warning" title="Sauvegarde différée"></span>`
            : `<span class="db-status-dot" title="Sauvegarde active"></span>`);
    const eliteBadge = window.titanRenderEliteMark ? window.titanRenderEliteMark(u) : (u.is_elite ? `<span class="brand-version elite-mini"><i class="ri-vip-crown-2-fill"></i> TITAN+</span>` : '');
    const activeTitle = window.titanGetActiveTitle ? window.titanGetActiveTitle(u) : null;
    const titleBadge = activeTitle ? `<span class="brand-version title-chip" style="color:#9ee7ff;" title="${window.titanEscapeText(activeTitle.label)}"><i class="${activeTitle.icon}"></i> ${window.titanEscapeText(activeTitle.label)}</span>` : '';
    const primaryLinks = titanPrimaryNavLinks();
    const navHtml = titanRenderGroupedNav('nav-link', primaryLinks);
    const secondaryHtml = titanRenderGroupedNav('nav-link nav-link-secondary', window.TITAN_SECONDARY_LINKS || []);
    const utilityHtml = titanRenderServiceHub('sidebar');

    sb.innerHTML = `
    <div class="sidebar-shell">
    <a class="brand" href="/aujourdhui"><span class="brand-symbol" aria-hidden="true">↗</span><div class="brand-meta"><span class="brand-title">TITAN.</span><span class="brand-version">Tous tes sports. Ton histoire.</span></div></a>
    <a class="profile-widget" href="/profile">
        <div class="profile-avatar-shell titan-avatar-frame ${avatarFrameClass} ${eliteAvatarClass}">${avatarHTML}</div>
        <div class="profile-info"><div class="profile-name">${window.titanEscapeText(u.name)}</div><div style="font-size:0.7rem;color:#94a3b8;">Niveau ${u.level}</div><div class="profile-meta-line">${dbBadge}${eliteBadge}</div></div>
    </a>
    <div class="sidebar-nav">${navHtml}<details class="sidebar-more"><summary><i class="ri-apps-2-line"></i><span>Explorer</span></summary>${secondaryHtml}</details></div>
    <div class="sidebar-footer">${utilityHtml}</div>
    </div>`;
};

window.injectMobileHeader = function() {
    const m = document.querySelector('.main-content');
    if (!m) return;
    const u = (window.state && window.state.user) ? window.state.user : { name: '...', level: 0, credits: 0, avatar: null };
    const avatarHTML = u.avatar ? `<img src="${window.getAvatarUrl(u.avatar)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='./image/logo.png'" alt="Avatar du joueur">` : `<i class="ri-user-3-fill"></i>`;
    const avatarFrameClass = window.titanGetAvatarFrameClass ? window.titanGetAvatarFrameClass(u) : 'frame-standard';
    const eliteAvatarClass = window.titanIsElite && window.titanIsElite(u) ? 'titan-elite-avatar-effect' : '';
    const activeTitle = window.titanGetActiveTitle ? window.titanGetActiveTitle(u) : null;
    const compactTitle = activeTitle ? ` // ${activeTitle.label}` : ' // TITAN OS';
    let bar = document.querySelector('.mobile-user-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.className = 'mobile-user-bar';
        m.insertAdjacentElement('afterbegin', bar);
    }
    bar.innerHTML = `
        <div class="mobile-agent-card">
            <button class="mobile-menu-toggle" type="button" onclick="titanToggleMobileMenu()" aria-label="Ouvrir la navigation" aria-expanded="false">
                <i class="ri-menu-4-line"></i>
            </button>
            <div class="mobile-agent-main" onclick="window.location.href='profile.html'">
                <div class="mobile-avatar titan-avatar-frame ${avatarFrameClass} ${eliteAvatarClass}">${avatarHTML}</div>
                <div><div class="mobile-agent-name">${window.titanEscapeText(u.name)} ${window.titanRenderPremiumIcon ? window.titanRenderPremiumIcon(u) : ''}</div><div class="mobile-agent-sub" title="${window.titanEscapeText(compactTitle)}">Niv. ${u.level}${window.titanEscapeText(compactTitle)}</div></div>
            </div>
            <div class="mobile-wallet"><div>${Math.floor(u.credits || 0)} <small>CR</small></div><span>${u.is_elite ? 'TITAN+' : 'GRATUIT'}</span></div>
        </div>`;
    window.injectMobileMenu();
};

window.injectMobileNav = function() {
    let nav = document.querySelector('.mobile-nav');
    const shouldAppend = !nav;
    if (!nav) {
        nav = document.createElement('nav');
        nav.className = 'mobile-nav';
    }
    nav.setAttribute('aria-label', 'Navigation rapide');
    const links = titanPrimaryNavLinks()
        .filter(link => link.mobile)
    nav.style.setProperty('--titan-mobile-nav-items', String(Math.max(1, links.length)));
    nav.innerHTML = links
        .map(link => {
            const label = link.short || link.label;
            return `<a href="${link.href}" class="${titanNavClass(link, 'mobile-nav-link')}" aria-label="${link.label}"><i class="${link.icon}"></i><span>${label}</span></a>`;
        })
        .join('');
    if (shouldAppend) document.body.appendChild(nav);
    window.injectMobileMenu();
};

window.injectMobileMenu = function() {
    if (document.querySelector('.mobile-menu-panel')) return;
    const overlay = document.createElement('div');
    overlay.className = 'mobile-menu-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('onclick', 'titanSetMobileMenu(false)');

    const panel = document.createElement('aside');
    panel.className = 'mobile-menu-panel';panel.inert=true;
    panel.setAttribute('aria-hidden', 'true');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Navigation complete');
    const primaryLinks = titanPrimaryNavLinks();
    const secondary = titanRenderGroupedNav('drawer-link drawer-link-secondary', window.TITAN_SECONDARY_LINKS || []);
    const utilities = titanRenderServiceHub('drawer');
    panel.innerHTML = `
            <div class="drawer-head">
            <div><span class="drawer-kicker">TITAN OS</span><strong>Explorer TITAN</strong></div>
            <button type="button" class="drawer-close" onclick="titanSetMobileMenu(false)" aria-label="Fermer la navigation"><i class="ri-close-line"></i></button>
        </div>
        <div class="drawer-nav">${titanRenderGroupedNav('drawer-link', primaryLinks)}${secondary}</div>
        <div class="drawer-utilities">${utilities}</div>`;

    document.body.appendChild(overlay);
    document.body.appendChild(panel);
};

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') titanSetMobileMenu(false);
    if(event.key==='Tab'&&document.body.classList.contains('mobile-menu-open')){
        const nodes=[...document.querySelectorAll('.mobile-menu-panel a[href],.mobile-menu-panel button,.mobile-menu-panel summary')].filter(el=>el.getClientRects().length&&!el.disabled);
        const first=nodes[0],last=nodes.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
});

window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) titanSetMobileMenu(false);
});

