/* =========================================
   TITAN OS - CHAT SYSTEM V6 (REALTIME FULL)
   ========================================= */

document.addEventListener('DOMContentLoaded', () => {
    initChatSystem();

    // Envoi via touche Entrée
    const input = document.getElementById('msg-input');
    if(input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
});

async function initChatSystem() {
    if(!supabase) return;

    // 1. Charger les derniers messages (Historique)
    const { data: msgs, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(50);

    const feed = document.getElementById('chat-feed');
    if(feed) feed.innerHTML = ""; // Clear loader

    if(msgs) {
        msgs.forEach(m => displayMessage(m));
        scrollToBottom();
    }

    // 2. ÉCOUTE TEMPS RÉEL
    supabase.channel('public:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        displayMessage(payload.new);
        scrollToBottom();
    })
    .subscribe();
}

function displayMessage(msg) {
    const feed = document.getElementById('chat-feed');
    if(!feed) return;

    const isMe = (state && state.user && msg.sender_name === state.user.name);

    const div = document.createElement('div');
    div.className = `msg-group ${isMe ? 'mine' : 'theirs'}`;

    // Formatage simple de l'heure
    const time = new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    // On utilise sender_name car c'est stocké en clair dans la table messages simplifiée
    div.innerHTML = `
        <div class="msg-bubble" title="${time}">
            ${!isMe ? `<div style="font-size:0.6rem; color:var(--primary); font-weight:bold; margin-bottom:2px;">${msg.sender_name}</div>` : ''}
            ${escapeHtml(msg.content)}
        </div>
    `;

    feed.appendChild(div);
}

async function sendMessage() {
    const input = document.getElementById('msg-input');
    if(!input) return;
    const text = input.value.trim();

    // Vérifications
    if(!text) return;
    if(!state || state.user.isGuest) return alert("Connectez-vous pour parler sur le canal sécurisé.");

    // Envoi vers Supabase (Le Realtime fera l'affichage local via l'écouteur)
    const { error } = await supabase
        .from('messages')
        .insert([{
            sender_name: state.user.name,
            content: text
        }]);

    if(error) console.error("Erreur envoi:", error);
    else input.value = ""; // Reset champ
}

function scrollToBottom() {
    const feed = document.getElementById('chat-feed');
    if(feed) feed.scrollTop = feed.scrollHeight;
}

function escapeHtml(text) {
    if(!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
