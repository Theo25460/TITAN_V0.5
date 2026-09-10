/* =========================================
   TITAN OS - SOCIAL CLOUD (CORRECTIF V2)
   ========================================= */

document.addEventListener('DOMContentLoaded', () => {
    const initCheck = setInterval(() => {
        // On vérifie que tout est chargé (State + Client Supabase + User ID)
        if(window.state && window.titanClient && window.state.user && window.state.user.id) {
            clearInterval(initCheck);
            initSocial();
        } 
        // Gestion du cas où le client Supabase n'est pas dispo
        else if (window.state && !window.titanClient) {
            clearInterval(initCheck);
            renderSocialState(document.getElementById('my-friends-list'), 'offline', 'Connexion indisponible', 'Le reseau social est temporairement hors ligne. Reessaie dans quelques instants.');
        }
    }, 200);

    // Sécurité : Arrêt de la recherche après 5 secondes
    setTimeout(() => { clearInterval(initCheck); }, 5000);
});

function initSocial() {
    syncFriendRankingToggle();
    loadMyFriendsV2();
    loadActiveChallenges(); 
}

function renderSocialState(container, type, title, message, action = null) {
    if (!container) return;
    if (typeof window.titanRenderStateBlock === 'function') {
        window.titanRenderStateBlock(container, type, title, message, action);
        return;
    }
    container.innerHTML = `<div style="text-align:center; padding:30px; color:#94a3b8; border:1px dashed rgba(148,163,184,0.22); border-radius:8px;">${escapeHtml(title)}<br><span style="font-size:0.8rem;">${escapeHtml(message || '')}</span></div>`;
}

async function loadMyFriendsV2() {
    const container = document.getElementById('my-friends-list');
    const countBadge = document.getElementById('friend-count');
    const myId = window.state?.user?.id;
    if (!container || !countBadge || !myId) return;

    if (myId.startsWith('guest_')) {
        countBadge.innerText = "0";
        renderFriendRankings([]);
        renderSocialState(container, 'offline', 'Mode invite', 'Creez un compte dans Profil pour acceder au reseau Titan.', { href: 'profile.html', label: 'Ouvrir le profil' });
        return;
    }

    const renderEmpty = () => {
        countBadge.innerText = "0";
        renderFriendRankings([]);
        renderSocialState(container, 'empty', 'Aucun allie', 'Ajoutez un matricule ci-dessus pour former votre reseau.');
    };

    try {
        const rpcFriends = await titanLoadFriendsViaRpc();
        if (rpcFriends) {
            if (rpcFriends.length === 0) return renderEmpty();
            renderFriendCards(container, countBadge, rpcFriends);
            return;
        }

        const { data: relations, error: relError } = await window.titanClient
            .from('friendships')
            .select('user_id_1, user_id_2')
            .or(`user_id_1.eq.${myId},user_id_2.eq.${myId}`);

        if (relError) {
            console.error("[SOCIAL] Erreur Friendships:", relError);
            renderSocialState(container, 'error', 'Erreur base de donnees', relError.message);
            return;
        }
        if (!relations || relations.length === 0) return renderEmpty();

        const friendIds = relations.map(r => (r.user_id_1 === myId) ? r.user_id_2 : r.user_id_1);
        const { data: friends, error: profError } = await window.titanClient
            .from('profiles')
            .select('id, username, level, avatar, friend_code, total_sessions, fav_sport, is_elite')
            .in('id', friendIds);

        if (profError) {
            console.error("[SOCIAL] Erreur Profils:", profError);
            renderSocialState(container, 'error', 'Erreur profils', 'Impossible de lire les profils allies pour le moment.');
            return;
        }
        if (!friends || friends.length === 0) {
            countBadge.innerText = "0";
            renderSocialState(container, 'empty', 'Profils introuvables', 'Les relations existent mais les profils allies ne sont pas lisibles.');
            return;
        }

        renderFriendCards(container, countBadge, friends);
    } catch (e) {
        console.error("[SOCIAL] Exception critique:", e);
        renderSocialState(container, 'error', 'Erreur systeme', e.message || 'Le module social ne peut pas etre charge.');
    }
}

function renderFriendCards(container, countBadge, friends) {
    countBadge.innerText = friends.length;
    container.innerHTML = "";
    renderFriendRankings(friends);

    friends.sort((a, b) => (b.level || 1) - (a.level || 1)).forEach(f => {
        const avatarUrl = window.getAvatarUrl ? window.getAvatarUrl(f.avatar) : (f.avatar ? `./image/avatar/${f.avatar}` : './image/logo.png');
        const friendDataSafe = encodeURIComponent(JSON.stringify(f));
        const eliteIcon = window.titanRenderPremiumIcon ? window.titanRenderPremiumIcon({ is_elite: f.is_elite === true }) : '';
        const eliteAvatarClass = f.is_elite === true ? 'titan-avatar-frame frame-aegis titan-elite-avatar-effect' : '';

        const div = document.createElement('div');
        div.className = 'friend-card ally';
        div.innerHTML = `
            <div class="f-info">
                <div class="f-avatar ${eliteAvatarClass}">
                    <img src="${avatarUrl}" loading="lazy" decoding="async" onerror="this.src='./image/logo.png'" alt="Avatar">
                </div>
                <div>
                    <div class="f-name">${escapeHtml(f.username) || 'Agent'} ${eliteIcon} <span class="f-id">LVL ${f.level || 1}</span></div>
                    <div class="f-id">${escapeHtml(f.friend_code || '---')}</div>
                </div>
            </div>
            <div class="f-actions">
                <button class="btn-mini vs" onclick="openVs('${friendDataSafe}')" title="Stats"><i class="ri-bar-chart-fill"></i></button>
                <button class="btn-mini wager" onclick="window.openDuelModal('${f.id}')" title="Duel"><i class="ri-sword-fill"></i></button>
                <button class="btn-mini ghost" onclick="window.openGhostModal('${f.id}')" title="Fantome"><i class="ri-ghost-fill"></i></button>
                <button class="btn-mini danger" onclick="blockFriend('${f.id}')" title="Bloquer"><i class="ri-forbid-2-line"></i></button>
                <button class="btn-mini danger" onclick="removeFriend('${f.id}')" title="Retirer cet ami" aria-label="Retirer cet ami"><i class="ri-user-unfollow-line"></i></button>
            </div>
        `;
        container.appendChild(div);
    });
}

function syncFriendRankingToggle() {
    const toggle = document.getElementById('friend-ranking-toggle');
    if (!toggle || !window.state?.user) return;
    const privacy = window.state.user.privacy || {};
    toggle.checked = privacy.friendRankings === true;
}

function toggleFriendRankings(enabled) {
    if (!window.state?.user) return;
    window.state.user.privacy = Object.assign({ publicProfile: true, showStats: true, socialPresence: true, friendRankings: false }, window.state.user.privacy || {});
    window.state.user.privacy.friendRankings = enabled === true;
    if (window.saveState) window.saveState({ forceCloud: true });
    if (window.showNotification) {
        window.showNotification(enabled ? 'success' : 'info', 'CLASSEMENT AMIS', enabled ? 'Participation activee.' : 'Participation masquee.');
    }
    loadMyFriendsV2();
}

function renderFriendRankings(friends = []) {
    const list = document.getElementById('friend-ranking-list');
    if (!list || !window.state?.user) return;
    syncFriendRankingToggle();
    const privacy = window.state.user.privacy || {};
    if (privacy.friendRankings !== true || privacy.showStats === false) {
        list.innerHTML = `<div class="friend-ranking-row"><span class="friend-ranking-rank">OFF</span><span>Classement masque par defaut.</span><span class="friend-ranking-score">PRIVE</span></div>`;
        return;
    }

    const me = window.state.user;
    const rows = [{
        id: me.id,
        username: `${me.name || 'Moi'} (moi)`,
        level: me.level || 1,
        total_sessions: (window.state.history || []).length,
        isMe: true
    }].concat((friends || []).map(friend => ({
        id: friend.id,
        username: friend.username || 'Agent',
        level: friend.level || 1,
        total_sessions: friend.total_sessions || 0,
        isMe: false
    })));

    rows.sort((a, b) => ((b.level || 1) - (a.level || 1)) || ((b.total_sessions || 0) - (a.total_sessions || 0)));
    list.innerHTML = rows.slice(0, 8).map((row, index) => `
        <div class="friend-ranking-row ${row.isMe ? 'me' : ''}">
            <span class="friend-ranking-rank">#${index + 1}</span>
            <span>${escapeHtml(row.username)}</span>
            <span class="friend-ranking-score">LVL ${row.level || 1}</span>
        </div>
    `).join('');
}

async function titanLoadFriendsViaRpc() {
    if (!window.titanClient || typeof window.titanClient.rpc !== 'function') return null;
    const { data, error } = await window.titanClient.rpc('titan_list_my_friends');
    if (error) {
        if (error.code !== 'PGRST202') console.warn("[SOCIAL] RPC amis indisponible:", error);
        return null;
    }
    return Array.isArray(data) ? data : [];
}

async function titanFindProfileByFriendCode(code) {
    if (window.titanClient && typeof window.titanClient.rpc === 'function') {
        const { data, error } = await window.titanClient.rpc('titan_find_profile_by_friend_code', { p_friend_code: code });
        if (!error && Array.isArray(data)) return data[0] || null;
        if (error && error.code !== 'PGRST202') console.warn("[SOCIAL] RPC matricule indisponible:", error);
    }

    const { data, error } = await window.titanClient
        .from('profiles')
        .select('id, username, friend_code, level, avatar, is_elite, is_suspended')
        .eq('friend_code', code)
        .maybeSingle();
    if (error) throw error;
    return data || null;
}

async function titanAddFriendByCode(code) {
    if (!window.titanClient || typeof window.titanClient.rpc !== 'function') return null;
    const { data, error } = await window.titanClient.rpc('titan_add_friend_by_code', { p_friend_code: code });
    if (error) {
        if (error.code !== 'PGRST202') throw error;
        return null;
    }
    return Array.isArray(data) ? (data[0] || null) : data;
}

/* --- CHARGEMENT DES AMIS --- */
async function loadMyFriends() {
    return loadMyFriendsV2();

    const container = document.getElementById('my-friends-list');
    const countBadge = document.getElementById('friend-count');
    
    // 1. Vérification ID Utilisateur
    const myId = window.state.user.id;

    if (!myId) return;

    // Si c'est un compte invité (local), pas de social possible
    if (myId.startsWith('guest_')) {
        countBadge.innerText = "0";
        container.innerHTML = `
            <div style="text-align:center; padding:30px; color:#94a3b8; background:rgba(255,255,255,0.05); border-radius:8px;">
                <i class="ri-user-unfollow-line" style="font-size:2rem; margin-bottom:10px; display:block;"></i>
                Mode Invité détecté.<br>
                <span style="font-size:0.8rem;">Créez un compte dans PROFIL pour accéder au réseau Titan.</span>
            </div>`;
        return;
    }

    const rpcFriends = await titanLoadFriendsViaRpc();
    if (rpcFriends) {
        if (rpcFriends.length === 0) {
            countBadge.innerText = "0";
            container.innerHTML = `<div style="text-align:center; padding:30px; font-size:0.8rem; color:#64748b;">Aucun allié. Ajoutez un matricule ci-dessus.</div>`;
            return;
        }
        renderFriendCards(container, countBadge, rpcFriends);
        return;
    }
    
    try {
        // 2. Récupération des relations (Table friendships)
        // On cherche toutes les lignes où je suis user_1 OU user_2
        const { data: relations, error: relError } = await window.titanClient
            .from('friendships') 
            .select('user_id_1, user_id_2')
            .or(`user_id_1.eq.${myId},user_id_2.eq.${myId}`);

        if (relError) {
            console.error("[SOCIAL] Erreur Friendships:", relError);
            container.innerHTML = `<div style="color:#ef4444; text-align:center;">Erreur accès base de données (${relError.message}).</div>`;
            return;
        }

        if (!relations || relations.length === 0) {
            countBadge.innerText = "0";
            container.innerHTML = `<div style="text-align:center; padding:30px; font-size:0.8rem; color:#64748b;">Aucun allié. Ajoutez un matricule ci-dessus.</div>`;
            return;
        }

        // 3. Extraction des IDs des amis (l'autre ID, pas le mien)
        const friendIds = relations.map(r => (r.user_id_1 === myId) ? r.user_id_2 : r.user_id_1);

        // 4. Récupération des profils complets (Table profiles)
        const { data: friends, error: profError } = await window.titanClient
            .from('profiles')
            .select('id, username, level, avatar, friend_code, total_sessions, fav_sport, is_elite')
            .in('id', friendIds);

        if (profError) {
            console.error("[SOCIAL] Erreur Profils:", profError);
            container.innerHTML = `<div style="color:#ef4444; text-align:center;">Erreur lecture profils.</div>`;
            return;
        }

        // Si on a des relations mais qu'on ne trouve pas les profils
        if (!friends || friends.length === 0) {
            countBadge.innerText = "0";
            container.innerHTML = `<div style="text-align:center; padding:30px; font-size:0.8rem; color:#64748b;">Profils introuvables.</div>`;
            return;
        }

        // 5. Affichage
        countBadge.innerText = friends.length;
        container.innerHTML = "";
        
        friends.sort((a, b) => (b.level || 1) - (a.level || 1)).forEach(f => {
            const avatarUrl = window.getAvatarUrl ? window.getAvatarUrl(f.avatar) : (f.avatar ? `./image/avatar/${f.avatar}` : './image/logo.png');
            const friendDataSafe = encodeURIComponent(JSON.stringify(f));
            const eliteIcon = window.titanRenderPremiumIcon ? window.titanRenderPremiumIcon({ is_elite: f.is_elite === true }) : '';
            const eliteAvatarClass = f.is_elite === true ? 'titan-avatar-frame frame-aegis titan-elite-avatar-effect' : '';

            const div = document.createElement('div');
            div.className = 'friend-card ally';
            div.innerHTML = `
                <div class="f-info">
                    <div class="f-avatar ${eliteAvatarClass}">
                        <img src="${avatarUrl}" loading="lazy" decoding="async" onerror="this.src='./image/logo.png'" alt="Avatar">
                    </div>
                    <div>
                        <div class="f-name">${escapeHtml(f.username) || 'Agent'} ${eliteIcon} <span class="f-id">LVL ${f.level || 1}</span></div>
                        <div class="f-id">${f.friend_code || '---'}</div>
                    </div>
                </div>
                <div class="f-actions">
                    <button class="btn-mini vs" onclick="openVs('${friendDataSafe}')" title="Stats"><i class="ri-bar-chart-fill"></i></button>
                    <button class="btn-mini wager" onclick="window.openDuelModal('${f.id}')" title="Duel"><i class="ri-sword-fill"></i></button>
                    <button class="btn-mini ghost" onclick="window.openGhostModal('${f.id}')" title="Fantôme"><i class="ri-ghost-fill"></i></button>
                    <button class="btn-mini danger" onclick="removeFriend('${f.id}')" title="Retirer cet ami" aria-label="Retirer cet ami"><i class="ri-user-unfollow-line"></i></button>
                </div>
            `;
            container.appendChild(div);
        });

    } catch (e) { 
        console.error("[SOCIAL] Exception critique:", e);
        container.innerHTML = `<div style="text-align:center; color:#ef4444;">Erreur système.</div>`;
    }
}

/* --- AJOUT D'AMI --- */
async function addFriendAction() {
    const input = document.getElementById('friend-code-input');
    const code = normalizeFriendCode(input.value);
    
    // Vérifications de base
    if (!code) return;
    if (!/^TN-[A-Z2-9]{4,8}$/.test(code)) return notifySocial('warning', 'MATRICULE', 'Format invalide. Exemple attendu : TN-AB12CD.');
    if (!window.state.user.id || window.state.user.id.startsWith('guest_')) return notifySocial('warning', 'CONNEXION', 'Connectez-vous pour ajouter des amis.');
    if (code === window.state.user.friend_code) return notifySocial('warning', 'MATRICULE', 'Vous ne pouvez pas vous ajouter vous-meme.');

    const btn = document.querySelector('.btn-add');
    const orgHTML = btn.innerHTML;
    btn.innerHTML = `<i class="ri-loader-4-line rotating"></i>`; // Loading icon

    try {
        const serverFriend = await titanAddFriendByCode(code);
        if (serverFriend) {
            notifySocial('success', 'ALLIE RECRUTE', `${serverFriend.username || code} ajoute !`);
            input.value = "";
            loadMyFriendsV2();
            return;
        }

        // 1. Chercher l'ID de l'ami via son code
        const friendProfile = await titanFindProfileByFriendCode(code);
        if (!friendProfile) { 
            notifySocial('warning', 'MATRICULE', 'Matricule introuvable.'); 
            btn.innerHTML = orgHTML; 
            return; 
        }
        if (friendProfile.is_suspended) {
            notifySocial('warning', 'AGENT SUSPENDU', 'Cet agent ne peut pas etre ajoute.');
            btn.innerHTML = orgHTML;
            return;
        }

        // 2. Vérifier si l'amitié existe déjà
        const { data: existing } = await window.titanClient
            .from('friendships')
            .select('*')
            .or(`and(user_id_1.eq.${window.state.user.id},user_id_2.eq.${friendProfile.id}),and(user_id_1.eq.${friendProfile.id},user_id_2.eq.${window.state.user.id})`);

        if(existing && existing.length > 0) {
            notifySocial('info', 'DEJA ALLIE', 'Cet agent est deja dans vos allies.');
            btn.innerHTML = orgHTML;
            return;
        }

        // 3. Créer l'amitié (INSERTION)
        // Note: On n'envoie PAS de status car la table n'a pas cette colonne.
        const { error: insertError } = await window.titanClient.from('friendships').insert({ 
            user_id_1: window.state.user.id, 
            user_id_2: friendProfile.id
        });
        
        // Si erreur, on l'affiche et on arrête
        if (insertError) {
            console.error("Erreur Insertion:", insertError);
            if (window.titanIsSuspendedError?.(insertError) && window.titanNotifySuspended) window.titanNotifySuspended();
            else notifySocial('error', 'ERREUR BASE', `${insertError.message} (${insertError.code})`);
            btn.innerHTML = orgHTML;
            return;
        }
        
        // SUCCÈS
        notifySocial('success', 'ALLIE RECRUTE', `${friendProfile.username} ajoute !`);
        
        input.value = "";
        loadMyFriendsV2();
        
    } catch (e) { 
        console.error(e); 
        notifySocial('error', 'ERREUR SOCIAL', e.message);
    } finally { 
        btn.innerHTML = orgHTML; 
    }
}

function notifySocial(type, title, message) {
    if (window.showNotification) window.showNotification(type, title, message);
    else console.warn(`[${title}] ${message}`);
}

function normalizeFriendCode(value) {
    const clean = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean) return '';
    if (clean.startsWith('TN') && !clean.startsWith('TN-')) return `TN-${clean.slice(2)}`;
    return String(value || '').trim().toUpperCase();
}

/* --- SUPPRESSION AMI --- */
async function removeFriend(friendId) {
    const now = Date.now();
    if (window.__titanPendingFriendRemoval !== friendId || now - (window.__titanPendingFriendRemovalAt || 0) > 5000) {
        window.__titanPendingFriendRemoval = friendId;
        window.__titanPendingFriendRemovalAt = now;
        notifySocial('warning', 'CONFIRMATION', 'Cliquez une seconde fois pour retirer cet allie.');
        return;
    }
    window.__titanPendingFriendRemoval = null;
    
    const myId = window.state.user.id;
    try {
        const { error } = await window.titanClient.from('friendships').delete()
            .or(`and(user_id_1.eq.${myId},user_id_2.eq.${friendId}),and(user_id_1.eq.${friendId},user_id_2.eq.${myId})`);
            
        if(error) throw error;
        
        loadMyFriendsV2();
        if(window.showNotification) window.showNotification('info', 'SUPPRESSION', 'Liaison rompue.');
        
    } catch(e) {
        console.error("Erreur suppression:", e);
        notifySocial('error', 'SUPPRESSION', `Impossible de supprimer : ${e.message}`);
    }
}

async function blockFriend(friendId) {
    const now = Date.now();
    if (window.__titanPendingFriendBlock !== friendId || now - (window.__titanPendingFriendBlockAt || 0) > 5000) {
        window.__titanPendingFriendBlock = friendId;
        window.__titanPendingFriendBlockAt = now;
        notifySocial('warning', 'CONFIRMATION', 'Cliquez une seconde fois pour bloquer cet agent.');
        return;
    }
    window.__titanPendingFriendBlock = null;

    try {
        if (window.titanClient?.rpc) {
            const { error } = await window.titanClient.rpc('titan_block_user', { p_blocked_id: friendId, p_reason: 'blocked_from_social' });
            if (error && error.code !== 'PGRST202') throw error;
        }
        try {
            const blocked = new Set(JSON.parse(localStorage.getItem('titan_blocked_senders') || '[]'));
            blocked.add(friendId);
            localStorage.setItem('titan_blocked_senders', JSON.stringify([...blocked]));
        } catch (_) {}
        notifySocial('success', 'AGENT BLOQUE', 'Demandes et messages locaux masques.');
        loadMyFriendsV2();
    } catch (e) {
        console.error("Erreur blocage:", e);
        notifySocial('error', 'BLOCAGE', `Impossible de bloquer : ${e.message}`);
    }
}

/* --- AFFICHAGE STATS VS --- */
function openVs(friendDataEncoded) {
    try {
        const friend = JSON.parse(decodeURIComponent(friendDataEncoded));
        const me = window.state.user;
        const mySessions = window.state.history ? window.state.history.length : 0;
        
        // Calcul favori Moi
        let myFav = "POLYVALENT";
        if(window.state.history && window.state.history.length > 0) {
            const counts = {};
            window.state.history.forEach(x => counts[x.sport] = (counts[x.sport]||0)+1);
            const top = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b, null);
            if(top) myFav = top;
        }

        // Affichage Moi
        if(document.getElementById('vs-my-name')) document.getElementById('vs-my-name').innerText = me.name;
        if(document.getElementById('vs-my-lvl')) document.getElementById('vs-my-lvl').innerText = "NIV " + me.level;
        if(document.getElementById('vs-my-avatar')) document.getElementById('vs-my-avatar').innerHTML = `<img src="${window.getAvatarUrl ? window.getAvatarUrl(me.avatar || 'avatar_1.png') : './image/avatar/' + (me.avatar || 'avatar_1.png')}" loading="lazy" decoding="async" onerror="this.src='./image/logo.png'" alt="Avatar du joueur">`;
        if(document.getElementById('vs-my-sessions')) document.getElementById('vs-my-sessions').innerText = mySessions;
        if(document.getElementById('vs-my-sport')) document.getElementById('vs-my-sport').innerText = myFav.toUpperCase();

        // Affichage Adversaire
        if(document.getElementById('vs-op-name')) document.getElementById('vs-op-name').innerText = friend.username || 'Agent';
        if(document.getElementById('vs-op-lvl')) document.getElementById('vs-op-lvl').innerText = "NIV " + (friend.level || 1);
        if(document.getElementById('vs-op-avatar')) document.getElementById('vs-op-avatar').innerHTML = `<img src="${window.getAvatarUrl ? window.getAvatarUrl(friend.avatar || 'avatar_1.png') : './image/avatar/' + (friend.avatar || 'avatar_1.png')}" loading="lazy" decoding="async" onerror="this.src='./image/logo.png'" alt="Avatar de l'adversaire">`;
        if(document.getElementById('vs-op-sessions')) document.getElementById('vs-op-sessions').innerText = friend.total_sessions || 0;
        if(document.getElementById('vs-op-sport')) document.getElementById('vs-op-sport').innerText = (friend.fav_sport || "POLYVALENT").toUpperCase();

        // Texte fun
        const diff = me.level - (friend.level || 1);
        const txt = diff > 0 ? "Vous avez l'avantage tactique." : (diff < 0 ? "Adversaire supérieur. Prudence." : "Forces égales.");
        if(document.getElementById('vs-fun-text')) document.getElementById('vs-fun-text').innerText = txt;

        document.getElementById('vs-modal').classList.add('open');
    } catch(e) {
        console.error("Erreur ouverture VS:", e);
    }
}

function escapeHtml(text) {
    if (typeof window.titanEscapeHtml === 'function') return window.titanEscapeHtml(text);
    if (!text) return text;
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* --- CHARGEMENT CHALLENGES --- */
async function loadActiveChallenges() {
    const container = document.getElementById('challenges-container');
    const box = document.getElementById('active-challenges-list');
    
    if(!container || !box) return;

    if(!window.ACTIVE_CHALLENGES || window.ACTIVE_CHALLENGES.length === 0) {
        box.style.display = 'none';
        return;
    }

    box.style.display = 'block';
    container.innerHTML = window.ACTIVE_CHALLENGES.map(c => {
        const isWager = c.type === 'wager';
        const tagClass = isWager ? 'duel' : 'ghost';
        const icon = isWager ? 'ri-sword-fill' : 'ri-ghost-fill';
        const typeLabel = isWager ? 'DUEL' : 'FANTÔME';
        
        let label = c.sport ? c.sport.replace(/_/g, ' ').toUpperCase() : 'DÉFI';
        if(isWager) label += " (50$)";
        const safeLabel = escapeHtml(label);
        const safeStatus = escapeHtml(c.status || 'EN COURS');
        
        return `
            <div class="challenge-item">
                <div style="display:flex; align-items:center;">
                    <div class="c-tag ${tagClass}"><i class="${icon}"></i> ${typeLabel}</div>
                    <span style="color:#cbd5e1;">${safeLabel}</span>
                </div>
                <div style="color:var(--accent); font-family:'Russo One'; font-size:0.7rem;">${safeStatus}</div>
            </div>
        `;
    }).join('');
}
