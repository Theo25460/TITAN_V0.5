/* =========================================
   TITAN OS - COMMS CENTER
   ========================================= */

let titanChatChannel = null;
let activeCommsChannel = 'global';
let cachedGlobalMessages = [];
let cachedGuild = null;
let cachedGuildMessages = [];
let titanSelectedReportTarget = null;

const TITAN_CHAT_LIMITS = {
    maxLength: 280,
    eliteMaxLength: 700,
    maxMessagesPerMinute: 5
};

const COMMS_CHANNELS = [
    {
        id: 'global',
        name: 'Canal Global',
        icon: 'ri-broadcast-fill',
        status: 'Signal public',
        desc: 'Agents connectes, annonces, coordination.'
    },
    {
        id: 'guild',
        name: 'Canal Guilde',
        icon: 'ri-shield-user-fill',
        status: 'Escouade privee',
        desc: 'Messages synchronises de votre guilde active.'
    },
    {
        id: 'briefing',
        name: 'Briefing Systeme',
        icon: 'ri-radar-line',
        status: 'Lecture seule',
        desc: 'Conseils, etiquette et securite du reseau.'
    }
];

document.addEventListener('DOMContentLoaded', () => {
    const boot = setInterval(() => {
        if (window.state && window.state.user) {
            clearInterval(boot);
            initChatSystem();
        }
    }, 150);

    setTimeout(() => clearInterval(boot), 6000);

    const input = document.getElementById('msg-input');
    if (input) {
        input.addEventListener('input', () => {
            resizeInput();
            updateChatComposer();
        });
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    const search = document.getElementById('contact-search');
    if (search) search.addEventListener('input', renderChannels);
});

async function initChatSystem() {
    await loadCloudGuild();
    renderChannels();
    await switchCommsChannel('global');
}

function renderChannels() {
    const contactList = document.getElementById('contact-list');
    if (!contactList) return;

    const query = normalize(document.getElementById('contact-search')?.value || '');
    const guild = getLocalGuild();

    contactList.innerHTML = COMMS_CHANNELS
        .filter(channel => normalize(`${channel.name} ${channel.desc}`).includes(query))
        .map(channel => {
            const locked = channel.id === 'guild' && !guild;
            const active = channel.id === activeCommsChannel;
            const last = channel.id === 'guild' && guild ? `${guild.name} // ${guild.members.length} membre(s)` : channel.desc;
            return `
                <button type="button" class="contact-card ${active ? 'active' : ''} ${locked ? 'locked' : ''}" onclick="${locked ? "window.location.href='social.html'" : `switchCommsChannel('${channel.id}')`}">
                    <div class="c-avatar">
                        <div class="c-img"><i class="${locked ? 'ri-lock-2-line' : channel.icon}"></i></div>
                        <div class="c-status ${channel.id === 'briefing' ? 'status-busy' : 'status-online'}"></div>
                    </div>
                    <div class="c-info">
                        <div class="c-name">${escapeHtml(channel.name)}</div>
                        <div class="c-last">${escapeHtml(locked ? 'Creer ou rejoindre une guilde' : last)}</div>
                    </div>
                    <div class="c-time">${channel.id === 'global' ? 'LIVE' : ''}</div>
                </button>
            `;
        }).join('');
}

async function switchCommsChannel(channelId) {
    activeCommsChannel = channelId;
    renderChannels();
    updateChatComposer();

    const channel = COMMS_CHANNELS.find(item => item.id === channelId) || COMMS_CHANNELS[0];
    const header = document.getElementById('chat-header');
    const inputZone = document.getElementById('chat-input-zone');
    const name = document.getElementById('header-name');
    const avatar = document.getElementById('header-avatar');
    const status = document.getElementById('header-status-text');

    if (header) header.style.display = 'flex';
    if (name) name.innerText = channel.name.toUpperCase();
    if (avatar) avatar.innerHTML = `<i class="${channel.icon}"></i>`;
    if (status) status.innerHTML = `<i class="ri-shield-check-fill"></i> ${channel.status}`;
    if (inputZone) inputZone.style.display = channelId === 'briefing' ? 'none' : 'flex';

    if (channelId === 'global') {
        if (!isConnectedChatUser()) {
            if (inputZone) inputZone.style.display = 'none';
            renderLoginRequiredGlobal();
            return;
        }
        renderMessages(cachedGlobalMessages);
        if (window.titanClient && cachedGlobalMessages.length === 0) await loadGlobalMessages();
        else if (!window.titanClient) renderOfflineGlobal();
    } else if (channelId === 'guild') {
        await renderGuildMessages();
    } else {
        renderBriefing();
    }
}

async function loadGlobalMessages() {
    if (!isConnectedChatUser()) {
        renderLoginRequiredGlobal();
        return;
    }
    const feed = document.getElementById('chat-feed');
    if (feed) feed.innerHTML = `<div class="empty-chat"><i class="ri-loader-4-line ri-spin empty-icon"></i><h2>CHARGEMENT DES MESSAGES</h2><p>Retrouve tes dernières conversations dans quelques instants…</p></div>`;

    let msgs = [];
    let error = null;
    if (typeof window.titanClient.rpc === 'function') {
        const result = await window.titanClient.rpc('titan_list_global_messages');
        msgs = result.data || [];
        error = result.error;
    } else {
        error = new Error('RPC_COMMS_REQUIRED');
    }

    if (error) {
        console.error("[CHAT] Erreur chargement:", error);
        renderOfflineGlobal(error.message);
        return;
    }

    cachedGlobalMessages = msgs || [];
    if (activeCommsChannel === 'global') renderMessages(cachedGlobalMessages);

    if (titanChatChannel) window.titanClient.removeChannel(titanChatChannel);
    titanChatChannel = window.titanClient.channel('public:messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            if (isBlockedSender(payload.new?.sender_id)) return;
            cachedGlobalMessages.push(payload.new);
            if (activeCommsChannel === 'global') {
                displayMessage(payload.new);
                scrollToBottom();
            }
        })
        .subscribe((subStatus) => {
            const statusText = document.getElementById('header-status-text');
            if (statusText && activeCommsChannel === 'global') {
                statusText.innerHTML = subStatus === 'SUBSCRIBED'
                    ? '<i class="ri-shield-check-fill"></i> Signal temps reel'
                    : '<i class="ri-loader-4-line"></i> Synchronisation';
            }
        });
}

function renderMessages(messages) {
    const feed = document.getElementById('chat-feed');
    if (!feed) return;

    feed.innerHTML = '';
    if (!messages || messages.length === 0) {
        feed.innerHTML = `<div class="chat-date-sep">CANAL OUVERT</div>`;
        return;
    }

    let lastDay = '';
    messages.filter(msg => !isBlockedSender(msg.sender_id)).forEach(msg => {
        const day = new Date(msg.created_at || Date.now()).toLocaleDateString();
        if (day !== lastDay) {
            lastDay = day;
            feed.insertAdjacentHTML('beforeend', `<div class="chat-date-sep">${day}</div>`);
        }
        displayMessage(msg);
    });
    scrollToBottom();
}

function renderOfflineGlobal(reason = '') {
    const feed = document.getElementById('chat-feed');
    if (!feed) return;
    feed.innerHTML = `
        <div class="empty-chat">
            <i class="ri-cloud-off-line empty-icon"></i>
            <h2>RELAIS INDISPONIBLE</h2>
            <p>${escapeHtml(reason || 'La base temps reel est hors ligne. Les messages cloud restent indisponibles jusqu au retour reseau.')}</p>
        </div>`;
}

function renderLoginRequiredGlobal() {
    const feed = document.getElementById('chat-feed');
    if (!feed) return;
    feed.innerHTML = `
        <div class="empty-chat">
            <i class="ri-lock-2-line empty-icon"></i>
            <h2>CONNEXION REQUISE</h2>
            <p>Le canal global est reserve aux agents connectes pour proteger les identifiants et les messages.</p>
            <a class="btn-primary" href="login.html">SE CONNECTER</a>
        </div>`;
}

async function renderGuildMessages() {
    const guild = await loadCloudGuild();
    const feed = document.getElementById('chat-feed');
    if (!feed) return;

    if (!guild) {
        feed.innerHTML = `<div class="empty-chat"><i class="ri-shield-user-line empty-icon"></i><h2>AUCUNE ÉQUIPE</h2><p>Crée ou rejoins une équipe depuis la page Communauté pour ouvrir cette conversation.</p></div>`;
        return;
    }

    const messages = await loadGuildMessages();
    if (messages.length === 0) {
        feed.innerHTML = `<div class="chat-date-sep">${escapeHtml(guild.name)} // CANAL GUILDE OUVERT</div>`;
        return;
    }
    renderMessages(messages);
}

function renderBriefing() {
    const feed = document.getElementById('chat-feed');
    if (!feed) return;
    feed.innerHTML = `
        <div class="briefing-card">
            <i class="ri-radar-line"></i>
            <h2>BRIEFING COMMS</h2>
            <p>Les messages coutent des credits pour garder le reseau propre. Global: ${getChatCost('global')} credits, guilde: ${getChatCost('guild')} credits.</p>
            <p>Limite: ${getChatMaxLength()} caracteres${isEliteChatUser() ? ' Elite' : ''}. Retention: ${getRetentionHours('global')}h global, ${getRetentionHours('guild')}h guilde.</p>
        </div>`;
}

function displayMessage(msg) {
    const feed = document.getElementById('chat-feed');
    if (!feed) return;
    if (isBlockedSender(msg.sender_id)) return;

    const currentName = window.state?.user?.name || '';
    const currentId = window.state?.user?.id || '';
    const isMe = (msg.sender_id && msg.sender_id === currentId) || (!msg.sender_id && msg.sender_name === currentName);
    const time = new Date(msg.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const sender = escapeHtml(msg.sender_name || 'Agent');
    const senderBadge = msg.channel === 'guild' ? '<span class="msg-chip">GUILDE</span>' : '';
    const reportAction = (!isMe && msg.sender_id)
        ? `<button type="button" class="msg-report-btn" onclick="openReportModal('${encodeURIComponent(msg.sender_id)}','${encodeURIComponent(msg.sender_name || 'Agent')}','${encodeURIComponent(msg.id || '')}')" title="Signaler / bloquer"><i class="ri-error-warning-line"></i></button>`
        : '';

    const div = document.createElement('div');
    div.className = `msg-group ${isMe ? 'mine' : 'theirs'}`;
    div.innerHTML = `
        <div class="msg-bubble">
            <div class="msg-author">${sender}${senderBadge}</div>
            ${escapeHtml(msg.content)}
        </div>
        <div class="msg-meta">${time}${reportAction}</div>
    `;
    feed.appendChild(div);
}

async function sendMessage() {
    const input = document.getElementById('msg-input');
    if (!input) return;

    const text = sanitizeChatMessage(input.value);
    if (!text) return;
    if (!canSendChatMessage()) {
        if (window.showNotification) window.showNotification('warning', 'COMMS', 'Ralentis le rythme. Limite anti-spam active.');
        return;
    }

    if (!window.state || !window.state.user || window.state.user.id.startsWith('guest_')) {
        if (window.showNotification) window.showNotification('warning', 'COMMS', 'Connecte-toi pour envoyer un message.');
        else console.warn('[COMMS] Connexion requise pour parler sur le canal securise.');
        return;
    }

    if (activeCommsChannel === 'guild') {
        const guild = await loadCloudGuild();
        if (!guild) return;
        if (!window.titanClient?.rpc) {
            if (window.showNotification) window.showNotification('warning', 'GUILDE OFFLINE', 'Canal guilde cloud indisponible.');
            return;
        }
        const { data, error } = await window.titanClient.rpc('titan_send_guild_message', { p_content: text });
        if (error) {
            console.error('[COMMS] Envoi guilde:', error);
            if (window.titanIsSuspendedError?.(error) && window.titanNotifySuspended) window.titanNotifySuspended();
            else if (window.showNotification) window.showNotification('error', 'GUILDE', economyErrorMessage(error));
            return;
        }
        applyEconomyResult(data);
        if (data?.content) cachedGuildMessages.push(data);
        input.value = '';
        resizeInput();
        updateChatComposer();
        await renderGuildMessages();
        scrollToBottom();
        return;
    }

    if (activeCommsChannel !== 'global') return;
    if (!window.titanClient) {
        if (window.showNotification) window.showNotification('warning', 'COMMS OFFLINE', 'Relais global indisponible.');
        return;
    }

    if (typeof window.titanClient.rpc !== 'function') {
        if (window.showNotification) window.showNotification('error', 'COMMS', 'Relais serveur requis pour envoyer.');
        return;
    }

    const { data, error } = await window.titanClient.rpc('titan_send_global_message', { p_content: text });

    if (error) {
        console.error("Erreur envoi:", error);
        if (window.titanIsSuspendedError?.(error) && window.titanNotifySuspended) window.titanNotifySuspended();
        else if (window.showNotification) window.showNotification('error', 'COMMS', economyErrorMessage(error));
    } else {
        applyEconomyResult(data);
        if (data?.content) {
            cachedGlobalMessages.push(data);
            if (activeCommsChannel === 'global') {
                displayMessage(data);
                scrollToBottom();
            }
        }
        input.value = "";
        resizeInput();
        updateChatComposer();
    }
}

function getLocalGuild() {
    return cachedGuild;
}

async function loadCloudGuild() {
    if (!isConnectedChatUser() || !window.titanClient?.rpc) {
        cachedGuild = null;
        return null;
    }
    const { data, error } = await window.titanClient.rpc('titan_get_my_guild');
    if (error) {
        if (error.code !== 'PGRST202') console.warn('[COMMS] Guilde cloud indisponible:', error);
        cachedGuild = null;
        return null;
    }
    cachedGuild = data || null;
    return cachedGuild;
}

async function loadGuildMessages() {
    if (!cachedGuild || !window.titanClient?.rpc) {
        cachedGuildMessages = [];
        return [];
    }
    const { data, error } = await window.titanClient.rpc('titan_list_guild_messages');
    if (error) {
        if (error.code !== 'PGRST202') console.warn('[COMMS] Messages guilde indisponibles:', error);
        return cachedGuildMessages;
    }
    cachedGuildMessages = Array.isArray(data) ? data : [];
    return cachedGuildMessages;
}

function sanitizeChatMessage(value) {
    const maxLength = getChatMaxLength();
    if (typeof window.titanSafeText === 'function') return window.titanSafeText(value, maxLength);
    return String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function isEliteChatUser() {
    return !!(window.titanIsElite?.(window.state?.user) || window.state?.user?.is_elite);
}

function getChatMaxLength() {
    const economy = window.TITAN_ECONOMY || {};
    return isEliteChatUser()
        ? (economy.eliteMessageMaxLength || TITAN_CHAT_LIMITS.eliteMaxLength)
        : (economy.freeMessageMaxLength || TITAN_CHAT_LIMITS.maxLength);
}

function getChatCost(channel = activeCommsChannel) {
    const economy = window.TITAN_ECONOMY || {};
    return channel === 'guild'
        ? (economy.chatGuildCost || 3)
        : (economy.chatGlobalCost || 2);
}

function getRetentionHours(channel = activeCommsChannel) {
    const economy = window.TITAN_ECONOMY || {};
    return channel === 'guild'
        ? (economy.guildRetentionHours || 72)
        : (economy.globalRetentionHours || 48);
}

function updateChatComposer() {
    const input = document.getElementById('msg-input');
    const inputZone = document.getElementById('chat-input-zone');
    if (!input || !inputZone) return;
    const maxLength = getChatMaxLength();
    const cost = getChatCost(activeCommsChannel);
    const remaining = Math.max(0, maxLength - String(input.value || '').length);
    input.maxLength = maxLength;
    input.placeholder = `Message (${cost} credits, ${maxLength} caracteres max)`;

    let hint = document.getElementById('chat-economy-hint');
    if (!hint) {
        hint = document.createElement('div');
        hint.id = 'chat-economy-hint';
        hint.className = 'chat-economy-hint';
        inputZone.insertBefore(hint, inputZone.firstChild);
    }
    hint.innerHTML = `<i class="ri-coin-line"></i> ${cost} credits · ${remaining}/${maxLength} · auto ${getRetentionHours(activeCommsChannel)}h`;
}

function applyEconomyResult(data) {
    if (!data || typeof data !== 'object') return;
    const creditsAfter = Number(data.credits_after ?? data.economy?.credits_after);
    if (Number.isFinite(creditsAfter) && window.state?.user) {
        window.state.user.credits = creditsAfter;
        if (window.saveState) window.saveState({ forceCloud: true });
        if (window.updateGlobalUI) window.updateGlobalUI();
    }
    if (data.cost && window.showNotification) {
        window.showNotification('info', 'COUT RESEAU', `${data.cost} credit(s) consomme(s).`);
    }
}

function economyErrorMessage(error) {
    const msg = String(error?.message || error || '');
    if (msg.includes('INSUFFICIENT_CREDITS')) return 'Credits insuffisants pour cette action.';
    if (msg.includes('CHAT_RATE_LIMIT')) return 'Ralentis le rythme. Limite anti-spam active.';
    if (msg.includes('MESSAGE_EMPTY') || msg.includes('EMPTY_MESSAGE')) return 'Message vide.';
    return msg || 'Action impossible.';
}

function canSendChatMessage() {
    const key = `titan_chat_rate_${window.state?.user?.id || 'guest'}`;
    const now = Date.now();
    let stamps = [];
    try { stamps = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
    stamps = stamps.filter(ts => now - Number(ts) < 60 * 1000);
    if (stamps.length >= TITAN_CHAT_LIMITS.maxMessagesPerMinute) return false;
    stamps.push(now);
    localStorage.setItem(key, JSON.stringify(stamps));
    return true;
}

function isConnectedChatUser() {
    const userId = window.state?.user?.id || '';
    return !!(window.titanClient && userId && !String(userId).startsWith('guest_'));
}

function getBlockedSenders() {
    try {
        const raw = JSON.parse(localStorage.getItem('titan_blocked_senders') || '[]');
        return Array.isArray(raw) ? raw : [];
    } catch {
        return [];
    }
}

function isBlockedSender(senderId) {
    return !!(senderId && getBlockedSenders().includes(senderId));
}

function blockSender(senderId) {
    if (!senderId) return;
    const blocked = new Set(getBlockedSenders());
    blocked.add(senderId);
    localStorage.setItem('titan_blocked_senders', JSON.stringify([...blocked]));
    cachedGlobalMessages = cachedGlobalMessages.filter(msg => msg.sender_id !== senderId);
    if (activeCommsChannel === 'global') renderMessages(cachedGlobalMessages);
}

function resizeInput() {
    const input = document.getElementById('msg-input');
    if (!input) return;
    input.style.height = '24px';
    input.style.height = `${Math.min(96, input.scrollHeight)}px`;
}

function scrollToBottom() {
    const feed = document.getElementById('chat-feed');
    if (feed) feed.scrollTop = feed.scrollHeight;
}

function normalize(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeFriendCode(value) {
    const clean = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean) return '';
    if (clean.startsWith('TN') && !clean.startsWith('TN-')) return `TN-${clean.slice(2)}`;
    return String(value || '').trim().toUpperCase();
}

async function addFriendByCodeFromChat() {
    const input = document.getElementById('chat-friend-code');
    const code = normalizeFriendCode(input?.value);
    if (!code) return;
    if (!/^TN-[A-Z2-9]{4,8}$/.test(code)) {
        if (window.showNotification) window.showNotification('warning', 'MATRICULE', 'Format attendu: TN-AB12CD.');
        return;
    }
    if (!window.titanClient || !window.state?.user || window.state.user.id.startsWith('guest_')) {
        if (window.showNotification) window.showNotification('warning', 'COMMS', 'Connexion requise pour ajouter un allie.');
        return;
    }
    if (code === window.state.user.friend_code) {
        if (window.showNotification) window.showNotification('warning', 'MATRICULE', 'Impossible de vous ajouter vous-meme.');
        return;
    }

    if (typeof window.titanClient.rpc === 'function') {
        const addResult = await window.titanClient.rpc('titan_add_friend_by_code', { p_friend_code: code });
        if (!addResult.error) {
            const added = Array.isArray(addResult.data) ? addResult.data[0] : addResult.data;
            if (input) input.value = '';
            if (window.showNotification) window.showNotification('success', 'ALLIE RECRUTE', `${added?.username || code} ajoute via matricule.`);
            return;
        }
        if (addResult.error.code !== 'PGRST202') {
            console.warn('[TITAN CHAT] Ajout allie indisponible:', addResult.error);
            if (window.showNotification) window.showNotification('error', 'MATRICULE', 'Action indisponible pour le moment.');
            return;
        }
    }

    let friendProfile = null;
    let searchError = null;
    if (typeof window.titanClient.rpc === 'function') {
        const rpcResult = await window.titanClient.rpc('titan_find_profile_by_friend_code', { p_friend_code: code });
        if (!rpcResult.error && Array.isArray(rpcResult.data)) friendProfile = rpcResult.data[0] || null;
        else if (rpcResult.error && rpcResult.error.code !== 'PGRST202') searchError = rpcResult.error;
    }
    if (!friendProfile && !searchError) {
        const fallback = await window.titanClient
            .from('profiles')
            .select('id, username, friend_code, is_suspended')
            .eq('friend_code', code)
            .maybeSingle();
        friendProfile = fallback.data;
        searchError = fallback.error;
    }

    if (searchError) {
        console.warn('[TITAN CHAT] Recherche matricule indisponible:', searchError);
        if (window.showNotification) window.showNotification('error', 'MATRICULE', 'Recherche indisponible pour le moment.');
        return;
    }
    if (!friendProfile || friendProfile.is_suspended) {
        if (window.showNotification) window.showNotification('warning', 'MATRICULE', 'Agent introuvable ou indisponible.');
        return;
    }

    const myId = window.state.user.id;
    const { data: existing } = await window.titanClient
        .from('friendships')
        .select('user_id_1')
        .or(`and(user_id_1.eq.${myId},user_id_2.eq.${friendProfile.id}),and(user_id_1.eq.${friendProfile.id},user_id_2.eq.${myId})`);

    if (existing && existing.length > 0) {
        if (window.showNotification) window.showNotification('info', 'ALLIE', 'Cet agent est deja dans votre reseau.');
        return;
    }

    const { error } = await window.titanClient.from('friendships').insert({
        user_id_1: myId,
        user_id_2: friendProfile.id
    });
    if (error) {
        if (window.titanIsSuspendedError?.(error) && window.titanNotifySuspended) window.titanNotifySuspended();
        else {
            console.warn('[TITAN CHAT] Creation relation indisponible:', error);
            if (window.showNotification) window.showNotification('error', 'MATRICULE', 'Impossible d ajouter cet allie maintenant.');
        }
        return;
    }
    if (input) input.value = '';
    if (window.showNotification) window.showNotification('success', 'ALLIE RECRUTE', `${friendProfile.username || code} ajoute via matricule.`);
}

function escapeHtml(text) {
    if (typeof window.titanEscapeHtml === 'function') return window.titanEscapeHtml(text);
    if (!text) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function openReportModal(senderId = '', senderName = '', messageId = '') {
    titanSelectedReportTarget = senderId ? {
        senderId: decodeURIComponent(senderId),
        senderName: decodeURIComponent(senderName || ''),
        messageId: decodeURIComponent(messageId || '')
    } : null;
    const modal = document.getElementById('report-modal');
    if (modal) modal.style.display = 'flex';
}

function closeReportModal() {
    const modal = document.getElementById('report-modal');
    if (modal) modal.style.display = 'none';
}

async function confirmReport() {
    closeReportModal();
    const target = titanSelectedReportTarget;
    if (!window.titanClient || !window.state?.user || window.state.user.id.startsWith('guest_')) {
        if (window.showNotification) window.showNotification('info', 'SIGNALEMENT', 'Signalement note localement.');
        return;
    }

    const hasMessageRpc = !!(
        target?.messageId &&
        typeof window.titanClient.rpc === 'function'
    );
    if (hasMessageRpc) {
        const { error } = await window.titanClient.rpc('titan_report_chat_message', {
            p_message_id: target.messageId,
            p_reason: 'chat_abuse'
        });
        if (!error) {
            if (window.showNotification) window.showNotification('info', 'SIGNALEMENT', 'Message transmis a la moderation.');
            return;
        }
        if (error.code !== 'PGRST202') console.warn('[COMMS] Signalement message RPC indisponible:', error);
    }

    const payload = {
        reporter_id: window.state.user.id,
        target_user_id: target?.senderId || null,
        reason: 'chat_abuse',
        details: `Canal ${activeCommsChannel}. Agent: ${target?.senderName || 'inconnu'}. Message: ${target?.messageId || 'non precise'}`
    };
    const { error } = await window.titanClient.from('titan_moderation_reports').insert(payload);
    if (error && window.showNotification) window.showNotification('warning', 'SIGNALEMENT LOCAL', 'La moderation cloud est indisponible.');
    else if (window.showNotification) window.showNotification('info', 'SIGNALEMENT', 'Rapport transmis a la moderation.');
}

async function confirmBlock() {
    closeReportModal();
    const targetId = titanSelectedReportTarget?.senderId || '';
    if (!targetId) {
        if (window.showNotification) window.showNotification('info', 'BLOCAGE', 'Aucun agent cible.');
        return;
    }

    blockSender(targetId);

    const canSyncBlock = !!(
        window.titanClient &&
        window.state?.user?.id &&
        !window.state.user.id.startsWith('guest_') &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId)
    );

    if (canSyncBlock && typeof window.titanClient.rpc === 'function') {
        const { error } = await window.titanClient.rpc('titan_block_user', {
            p_blocked_id: targetId,
            p_reason: 'chat_block'
        });
        if (!error) {
            if (window.showNotification) window.showNotification('info', 'BLOCAGE', 'Agent masque et bloque cote cloud.');
            return;
        }
        if (error.code !== 'PGRST202') console.warn('[COMMS] Blocage cloud indisponible:', error);
    }

    if (window.showNotification) window.showNotification('info', 'BLOCAGE', 'Agent masque sur cet appareil.');
}
