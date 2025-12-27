/* =========================================
   TITAN OS - SOCIAL MODULE (CLEANED V5.5)
   ========================================= */

document.addEventListener('DOMContentLoaded', () => {
    // Petit délai pour s'assurer que main.js a chargé le "state"
    setTimeout(() => {
        if(window.state) {
            renderFriendsList();
            updateFriendCount();
        }
    }, 500);
});

// --- GESTION DES AMIS ---

async function addFriendAction() {
    const input = document.getElementById('friend-code-input');
    const code = input.value.trim().toUpperCase();

    // 1. Validations de base
    if (!code) return alert("Veuillez entrer un matricule.");
    
    // On vérifie si state est bien chargé
    if (!state || !state.user) return alert("Erreur système : Profil non chargé.");

    if (code === state.user.friendCode) return alert("Vous ne pouvez pas vous ajouter vous-même.");

    // Vérifie si l'ami existe déjà dans la liste locale
    if (!state.social) state.social = { friends: [] };
    if (!state.social.friends) state.social.friends = [];
    
    const alreadyFriend = state.social.friends.find(f => f.code === code);
    if(alreadyFriend) return alert("Cet allié est déjà dans votre liste.");

    // 2. Recherche du profil (Simulation ou Supabase)
    let friendName = "Inconnu";
    let friendLvl = 1;

    // Si Supabase est connecté, on essaie de trouver le vrai pseudo
    if(typeof supabase !== 'undefined' && supabase) {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('username, level')
                .eq('friend_code', code)
                .single();
            
            if(error || !data) {
                // Si pas trouvé en base, on bloque l'ajout (sécurité)
                // Tu peux commenter ces 2 lignes si tu veux autoriser l'ajout de codes "fictifs" pour tester
                alert("Matricule introuvable dans la base de données.");
                return;
            } else {
                friendName = data.username;
                friendLvl = data.level;
            }
        } catch (err) {
            console.warn("Erreur recherche ami:", err);
        }
    } else {
        // Mode hors ligne / local pour test
        console.log("Mode hors-ligne : Ajout simulé");
    }

    // 3. Ajout au State Local
    state.social.friends.push({
        code: code,
        name: friendName,
        level: friendLvl,
        addedAt: new Date().toISOString()
    });
    
    // 4. Sauvegarde
    saveState();
    renderFriendsList();
    updateFriendCount();
    
    input.value = "";
    alert(`Allié ${friendName} (Niv. ${friendLvl}) ajouté avec succès !`);
}

function renderFriendsList() {
    const container = document.getElementById('friends-list-container');
    if(!container) return;
    
    container.innerHTML = "";

    // Sécurité si le tableau est vide ou inexistant
    if (!state.social || !state.social.friends || state.social.friends.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; color:var(--text-muted); font-style:italic; padding:30px;">
                <i class="ri-ghost-line" style="font-size: 2rem; opacity: 0.3; display: block; margin-bottom: 10px;"></i>
                Aucun allié connecté sur le réseau.
            </div>`;
        return;
    }

    // Génération des cartes
    state.social.friends.forEach(friend => {
        const div = document.createElement('div');
        div.className = 'friend-card';
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:15px;">
                <div style="width:40px; height:40px; background:#10141e; border-radius:50%; border:1px solid var(--accent); display:flex; align-items:center; justify-content:center; color:var(--accent);">
                    <i class="ri-user-3-line"></i>
                </div>
                <div>
                    <div style="font-weight:bold; color:#fff;">${friend.name}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">Niv. ${friend.level} | <span style="font-family:'Outfit'; color:var(--gold);">${friend.code}</span></div>
                </div>
            </div>
            <button class="btn" style="padding:8px; background:rgba(239,68,68,0.1); color:var(--danger); border:1px solid rgba(239,68,68,0.3); border-radius:8px; cursor:pointer; transition:0.2s;" onclick="removeFriend('${friend.code}')" title="Retirer l'allié">
                <i class="ri-user-unfollow-line"></i>
            </button>
        `;
        container.appendChild(div);
    });
}

function removeFriend(code) {
    if(confirm("Voulez-vous vraiment retirer cet allié de votre liste ?")) {
        state.social.friends = state.social.friends.filter(f => f.code !== code);
        saveState();
        renderFriendsList();
        updateFriendCount();
    }
}

function updateFriendCount() {
    const countBadge = document.getElementById('friend-count');
    if(countBadge && state.social && state.social.friends) {
        countBadge.innerText = state.social.friends.length;
    }
}