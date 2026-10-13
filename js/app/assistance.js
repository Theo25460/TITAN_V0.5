/* TITAN — voluntary support, prepared behind an explicit deployment flag. No automatic report. */
(function () {
  'use strict';
  function mount(root, options = {}) {
  if (!root || root.dataset.supportEnabled !== 'true') return null;
  if (root._titanSupportMount) return root._titanSupportMount;
  const report = typeof options.captureDiagnostics === 'function';
  const lifetime = new AbortController();
  let disposed = false, subscription = null;
  function dispose() {
    if (disposed) return;
    disposed = true; epoch++; checks++; controller?.abort(); controller = null;
    lifetime.abort(); subscription?.unsubscribe(); subscription = null;
    state = fresh(); verified = owner = client = null; pending = false;
    root.replaceChildren(); delete root._titanSupportMount;
  }
  function usable() {
    if (disposed) return false;
    if (options.isCurrent && !options.isCurrent()) { dispose(); options.onInvalidated?.(); return false; }
    return true;
  }
  const canDismiss = () => !pending && !(state.request?.attempted && !state.receipt);
  const listen = (target, name, callback) => target.addEventListener(name, callback, { signal: lifetime.signal });
  function metric(name, props = {}) {
    if (!usable()) return;
    try { Promise.resolve(window.TitanAnalytics?.track(name, props)).catch(() => {}); } catch { /* Support never depends on product measurement. */ }
  }
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const TOKEN = /^[A-Za-z0-9._~-]{20,8192}$/;
  const CATEGORIES = { bug: 'Bug ou problème technique', compte: 'Compte et connexion', titanplus: 'TITAN+ et remboursement', donnees: 'Données et confidentialité', communaute: 'Communauté et signalement', autre: 'Autre question' };
  let client = null, owner = null, verified = null, epoch = 0, checks = 0, pending = false, controller = null;
  const fresh = () => ({ phase: 'editing', draft: { category: report ? 'bug' : 'autre', message: '', reply: false, diagnostics: null }, request: null, receipt: null, notice: '', error: false });
  let state = fresh();
  const ownerOf = session => typeof session?.user?.id === 'string' && UUID.test(session.user.id) ? session.user.id : null;
  const accountValid = user => typeof user?.id === 'string' && UUID.test(user.id) && user.is_anonymous === false && !!user.email_confirmed_at
    && typeof user.email === 'string' && user.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email);
  const active = job => usable() && job.client === client && client === window.titanClient && job.owner === owner && job.epoch === epoch && job.request === state.request && verified?.id === owner;
  const composed = (message = state.draft.message) => message + (report ? window.TitanSupportDiagnostics.format(state.draft.diagnostics) : '');
  function expectedOwner(id) {
    if (!usable()) return false;
    if (report && id !== options.owner) { dispose(); options.onInvalidated?.(); return false; }
    return true;
  }
  const timed = promise => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('AUTH_UNAVAILABLE')), 8000);
    Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(timer));
  });
  function notice(text, error = false) { state.notice = text; state.error = error; }
  function focus(selector) { root.querySelector(selector)?.focus(); }
  function render(checking = false) {
    if (!usable()) return;
    root.hidden = false;
    root.dataset.supportState = checking ? 'checking' : !verified ? 'unavailable' : state.phase;
    if (!report) document.querySelectorAll('[data-support-category]').forEach(button => {
      button.hidden = !verified; button.disabled = pending || (!state.receipt && state.request?.attempted === true);
    });
    root.replaceChildren();
    root.dispatchEvent(new CustomEvent('titan:support-state', { detail: { phase: root.dataset.supportState, canDismiss: canDismiss() } }));
    const announcement = document.createElement('p'); announcement.className = 'help-notice';
    announcement.setAttribute('role', state.error ? 'alert' : 'status'); announcement.tabIndex = -1;
    announcement.textContent = checking ? 'Vérification de ton accès au formulaire…' : pending ? 'Envoi en cours…' : state.notice;
    root.append(announcement);
    if (!verified) {
      if (!checking && !state.notice) announcement.textContent = 'Le formulaire demande un compte connecté avec une adresse confirmée. Tu peux aussi utiliser ta messagerie ci-dessous.';
      if (!checking) {
        const link = document.createElement('a'); link.className = 'asc-btn asc-btn-secondary'; link.href = '/login?next=%2Fservice%23help-contact'; link.textContent = 'Se connecter'; root.append(link);
        const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'asc-btn asc-btn-ghost'; retry.dataset.supportCheck = ''; retry.textContent = 'Revérifier l’accès'; root.append(retry);
      }
      return;
    }
    // Only fixed markup is parsed. Message, address, status and reference use textContent/value.
    const card = document.createElement('div'); card.className = 'pub-card help-form-card';
    card.innerHTML = `<form id="support-form" novalidate><fieldset id="support-fields"><legend>Ta demande</legend>
      <label for="support-category">Catégorie</label><select id="support-category" name="category"></select>
      <label for="support-message">Décris ta demande</label><textarea id="support-message" name="message" rows="7" maxlength="8000" autocomplete="off" aria-describedby="support-guidance support-count" required></textarea>
      <p id="support-count" class="pub-fine"></p><p id="support-guidance" class="pub-fine">De 10 à 4 000 caractères. N’ajoute ni données de santé, GPS, mot de passe, token, numéro de carte ou clé secrète. Aucune donnée de ton appareil n’est ajoutée automatiquement.</p>
      <label class="help-choice"><input id="support-reply" type="checkbox" name="reply_allowed">J’autorise l’équipe à me répondre à l’adresse vérifiée de mon compte.</label>
      <button type="submit" class="asc-btn asc-btn-primary">Voir l’aperçu</button></fieldset></form>`;
    root.append(card);
    const form = root.querySelector('#support-form'), fields = root.querySelector('#support-fields');
    fields.hidden = state.phase !== 'editing'; fields.disabled = pending || (!state.receipt && state.request?.attempted === true);
    if (pending) form.setAttribute('aria-busy', 'true');
    const category = root.querySelector('#support-category');
    for (const [value, label] of Object.entries(CATEGORIES)) { const option = document.createElement('option'); option.value = value; option.textContent = label; category.append(option); }
    category.value = state.draft.category;
    root.querySelector('#support-message').value = state.draft.message;
    root.querySelector('#support-reply').checked = state.draft.reply;
    if (report) {
      const choice = document.createElement('label'); choice.className = 'help-choice';
      choice.innerHTML = '<input id="support-diagnostics" type="checkbox">J’ajoute les diagnostics techniques affichés ci-dessous (facultatif).';
      const detail = document.createElement('p'); detail.className = 'help-message asc-small'; detail.dataset.supportDiagnosticsPreview = '';
      detail.textContent = state.draft.diagnostics ? window.TitanSupportDiagnostics.format(state.draft.diagnostics).trim() : 'Aucun diagnostic ajouté. Version, module, plateforme, navigateur, type d’appareil, écran, horodatage, réseau et code local uniquement.';
      choice.querySelector('input').checked = !!state.draft.diagnostics;
      fields.insertBefore(choice, fields.querySelector('.help-choice')); fields.insertBefore(detail, choice.nextSibling);
    }
    counter();
    if (state.phase !== 'editing' && !state.receipt) {
      const preview = document.createElement('section'); preview.id = 'support-preview'; preview.className = 'help-preview';
      preview.innerHTML = '<h3 tabindex="-1">Aperçu de ta demande</h3><p data-preview-category></p><p class="help-message" data-preview-message></p><p data-preview-reply></p><div class="pub-cta"></div>';
      preview.querySelector('[data-preview-category]').textContent = CATEGORIES[state.draft.category];
      preview.querySelector('[data-preview-message]').textContent = composed();
      preview.querySelector('[data-preview-reply]').textContent = state.draft.reply ? `Réponse autorisée à ${verified.email}.` : 'Aucune réponse par e-mail autorisée.';
      const actions = preview.querySelector('.pub-cta');
      if (!state.request?.attempted) button(actions, 'Modifier', 'supportEdit');
      button(actions, state.phase === 'uncertain' ? 'Réessayer cette demande' : 'Confirmer l’envoi', 'supportSend');
      card.append(preview);
    }
    if (state.receipt) {
      const result = document.createElement('section'); result.id = 'support-result'; result.className = 'help-preview';
      result.innerHTML = '<h3 tabindex="-1">Demande reçue</h3><p>Ta référence :</p><code id="support-reference" tabindex="0"></code><p data-notification></p><p class="pub-fine">Garde cette référence pour échanger avec l’équipe. Ne renvoie pas cette demande par e-mail.</p><div class="pub-cta"></div>';
      result.querySelector('#support-reference').textContent = state.receipt.reference;
      result.querySelector('[data-notification]').textContent = state.receipt.notification === 'sent' ? 'L’alerte à l’équipe a été acceptée. Cela ne confirme pas sa livraison en boîte.' : 'L’alerte à l’équipe est encore en attente. Ta demande est bien enregistrée.';
      if (state.receipt.notification === 'pending') button(result.querySelector('.pub-cta'), 'Vérifier à nouveau cette demande', 'supportSend');
      button(result.querySelector('.pub-cta'), 'Nouvelle demande', 'supportNew'); card.append(result);
    }
  }
  function button(parent, label, data) { const node = document.createElement('button'); node.type = 'button'; node.className = 'asc-btn asc-btn-secondary'; node.dataset[data] = ''; node.textContent = label; node.disabled = pending; parent.append(node); }
  function counter() { const input = root.querySelector('#support-message'), output = root.querySelector('#support-count'); if (input && output) output.textContent = `${Array.from(composed(input.value)).length} / 4 000 caractères${state.draft.diagnostics ? ', diagnostics inclus' : ''}`; }
  function invalidate(id, recheck = true) {
    if (!expectedOwner(id)) return;
    owner = id; epoch++; checks++; verified = null; state = fresh(); pending = false;
    controller?.abort(); controller = null; render();
    if (recheck) setTimeout(() => checkAccess(), 0);
  }
  async function checkAccess() {
    if (!usable()) return;
    if (!client || client !== window.titanClient) { verified = null; notice('Le formulaire est indisponible pour le moment. Utilise ta messagerie ci-dessous.', true); render(); return; }
    const sequence = ++checks; verified = null; render(true);
    try {
      const result = await timed(client.auth.getSession()); if (sequence !== checks) return;
      const session = result?.data?.session, id = ownerOf(session);
      if (!expectedOwner(id)) return;
      if (id !== owner) { owner = id; epoch++; state = fresh(); }
      const generation = epoch;
      if (result?.error || !id || typeof session.access_token !== 'string' || !TOKEN.test(session.access_token)) throw Error('AUTH_UNAVAILABLE');
      const auth = await timed(client.auth.getUser(session.access_token));
      if (sequence !== checks || generation !== epoch || client !== window.titanClient || !usable()) return;
      if (auth?.error || !accountValid(auth?.data?.user) || auth.data.user.id !== id) throw Error('AUTH_UNAVAILABLE');
      verified = auth.data.user; state.phase = 'editing'; notice(''); render();
    } catch { if (sequence === checks) { verified = null; render(); } }
  }
  async function sessionFor(job, verify = false) {
    const result = await timed(job.client.auth.getSession());
    if (!active(job)) throw Error('CHANGED');
    const session = result?.data?.session, id = ownerOf(session);
    if (id !== job.owner) { invalidate(id); throw Error('CHANGED'); }
    if (result?.error || typeof session?.access_token !== 'string' || !TOKEN.test(session.access_token)) throw Error('AUTH_UNAVAILABLE');
    if (verify) {
      const auth = await timed(job.client.auth.getUser(session.access_token)); if (!active(job)) throw Error('CHANGED');
      const user = auth?.data?.user;
      if (auth?.error) throw Error('AUTH_UNAVAILABLE');
      if (!accountValid(user) || user.id !== job.owner || user.email !== verified.email || user.email_confirmed_at !== verified.email_confirmed_at) { invalidate(id); throw Error('CHANGED'); }
    }
    return session;
  }
  function preview() {
    if (!usable() || !verified || pending || state.phase !== 'editing') return;
    const message = root.querySelector('#support-message').value.trim(), category = root.querySelector('#support-category').value;
    state.draft = { ...state.draft, message, category, reply: root.querySelector('#support-reply').checked };
    const payload = composed(), points = Array.from(payload);
    if (!Object.hasOwn(CATEGORIES, category) || Array.from(message).length < 10 || points.length > 4000 || new TextEncoder().encode(payload).length > 16384
      || /[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(payload) || points.some(ch => ch.codePointAt(0) >= 0xd800 && ch.codePointAt(0) <= 0xdfff)) {
      notice('Décris ta demande avec 10 à 4 000 caractères, sans caractères de contrôle.', true); render(); focus('#support-message'); return;
    }
    state.phase = 'preview'; notice('Rien n’est envoyé avant ta confirmation.'); render(); focus('#support-preview h3');
  }
  async function responseBody(response) {
    if (!response.body) throw Error('UNCERTAIN');
    const reader = response.body.getReader(); let size = 0; const chunks = [];
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 8192) { await reader.cancel(); throw Error('UNCERTAIN'); } chunks.push(value); } }
    finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  }
  async function send() {
    if (!usable() || !verified || pending || !['preview', 'uncertain', 'received'].includes(state.phase) || state.receipt?.notification === 'sent') return;
    if (!navigator.onLine) { metric('support_submission_result', { category: state.draft.category, result: 'offline' }); notice('Hors ligne : reconnecte-toi puis réessaie toi-même. Rien n’est envoyé automatiquement.', true); render(); focus('.help-notice'); return; }
    const previousAttempt = state.request?.attempted === true;
    if (!state.request) {
      if (typeof crypto.randomUUID !== 'function') { metric('support_submission_result', { category: state.draft.category, result: 'unavailable' }); notice('Le formulaire est indisponible pour le moment. Utilise ta messagerie ci-dessous.', true); render(); return; }
      state.request = { attempted: false, body: { request_id: crypto.randomUUID(), category: state.draft.category, message: composed(), reply_allowed: state.draft.reply } };
    }
    const job = { client, owner, epoch, request: state.request }; pending = true; state.phase = 'sending'; render();
    let timer = null, outcome = null;
    try {
      const session = await sessionFor(job, true); await sessionFor(job);
      if (!active(job)) return;
      const transport = new AbortController(); controller = transport; timer = setTimeout(() => transport.abort(), 45000);
      job.request.attempted = true;
      const response = await fetch('/functions/assistance', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(job.request.body), cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: transport.signal });
      const data = await responseBody(response); if (!active(job)) return;
      await sessionFor(job); if (!active(job)) return;
      const received = data?.accepted === true && typeof data.reference === 'string' && UUID.test(data.reference)
        && ((response.status === 200 && data.notification === 'sent') || (response.status === 202 && data.notification === 'pending'));
      if (received && (!state.receipt || state.receipt.reference === data.reference)) {
        outcome = 'received';
        state.receipt = { reference: data.reference, notification: data.notification }; state.phase = 'received'; notice('');
      // A rejected retry cannot disprove receipt of an earlier uncertain POST.
      } else if (!state.receipt && !previousAttempt && [400, 401, 403, 429].includes(response.status) && data?.uncertain !== true) {
        outcome = 'rejected';
        state.request = null; state.phase = 'preview';
        notice({ 400: 'La demande est refusée. Vérifie son contenu.', 401: 'Reconnecte-toi avant de réessayer.', 403: 'Ce compte ne peut pas envoyer de demande. Utilise ta messagerie ci-dessous.', 429: 'Trois nouvelles demandes par heure au maximum. Réessaie plus tard.' }[response.status], true);
      } else throw Error('UNCERTAIN');
    } catch {
      if (!active(job)) return;
      outcome = state.receipt ? 'unavailable' : job.request.attempted ? 'uncertain' : 'unavailable';
      if (state.receipt) { state.phase = 'received'; notice('Ta demande a déjà été reçue. La vérification de l’alerte est indisponible pour le moment ; garde ta référence.', true); }
      else if (job.request.attempted) { state.phase = 'uncertain'; notice('Impossible de confirmer la réception. Réessaie cette même demande pour éviter un doublon. Garde cet onglet ouvert et ne l’envoie pas aussi par e-mail sans vérifier.', true); }
      else { state.phase = 'preview'; notice('Impossible de vérifier ton compte. Réessaie après avoir vérifié ta connexion.', true); }
    } finally {
      clearTimeout(timer);
      if (usable() && (active(job) || (job.epoch === epoch && verified?.id === owner && state.request === null))) {
        pending = false; controller = null; render(); focus(state.receipt ? '#support-result h3' : '.help-notice');
        if (outcome) metric('support_submission_result', { category: job.request.body.category, result: outcome });
      }
    }
  }
  listen(root, 'submit', event => { event.preventDefault(); preview(); });
  listen(root, 'input', event => { if (event.target.id === 'support-message') counter(); });
  listen(root, 'change', event => {
    if (usable() && verified && !pending && state.phase === 'editing' && event.target.id === 'support-category') metric('support_category_selected', { category: event.target.value });
    if (!usable() || !report || pending || state.phase !== 'editing' || event.target.id !== 'support-diagnostics') return;
    state.draft.message = root.querySelector('#support-message').value;
    state.draft.category = root.querySelector('#support-category').value;
    state.draft.reply = root.querySelector('#support-reply').checked;
    state.draft.diagnostics = event.target.checked ? options.captureDiagnostics() : null;
    render(); focus('#support-diagnostics');
  });
  listen(root, 'click', event => {
    if (!usable()) return;
    const button = event.target.closest('button'); if (!button || button.disabled || pending) return;
    if (button.hasAttribute('data-support-check')) checkAccess();
    else if (button.hasAttribute('data-support-send')) send();
    else if (button.hasAttribute('data-support-edit') && !state.request?.attempted) { state.request = null; state.phase = 'editing'; notice(''); render(); focus('#support-message'); }
    else if (button.hasAttribute('data-support-new') && state.receipt) { state = fresh(); render(); focus('#support-message'); }
  });
  if (!report) listen(document, 'click', event => {
    const button = event.target.closest('[data-support-category]');
    if (!button || button.hidden || button.disabled || !verified || pending || (!state.receipt && state.request?.attempted)) return;
    if (state.receipt) state = fresh();
    if (state.phase === 'editing') { state.draft.message = root.querySelector('#support-message').value; state.draft.reply = root.querySelector('#support-reply').checked; }
    state.draft.category = button.dataset.supportCategory; state.phase = 'editing'; state.request = null; notice(''); render(); focus('#support-message');
    metric('support_category_selected', { category: state.draft.category });
    root.scrollIntoView({ block: 'start', behavior: 'auto' });
  });
  listen(window, 'beforeunload', event => { if (!canDismiss()) { event.preventDefault(); event.returnValue = ''; } });
  listen(window, 'pagehide', () => report ? dispose() : invalidate(null, false));
  listen(window, 'pageshow', event => { if (event.persisted) checkAccess(); });
  function script(src) { return new Promise((resolve, reject) => { const node = document.createElement('script'); node.src = src; node.onload = resolve; node.onerror = reject; document.head.append(node); }); }
  async function start() {
    render(true);
    try {
      if (typeof window.initTitanSupabaseClient !== 'function') { await script('/js/vendor/supabase-2.111.0.js'); await script('/js/config.js?v=300.0'); }
      if (!usable()) return;
      client = window.initTitanSupabaseClient(); if (!client?.auth) throw Error('AUTH_UNAVAILABLE');
      subscription = client.auth.onAuthStateChange((event, session) => {
        if (!usable()) return;
        const id = event === 'SIGNED_OUT' ? null : ownerOf(session);
        if (id !== owner || event === 'SIGNED_OUT' || event === 'USER_UPDATED') invalidate(id);
      })?.data?.subscription;
      if (disposed) { subscription?.unsubscribe(); subscription = null; return; }
      metric('support_opened');
      await checkAccess();
    } catch { if (!usable()) return; verified = null; notice('Le formulaire est indisponible pour le moment. Utilise ta messagerie ci-dessous.', true); render(); }
  }
  root._titanSupportMount = { dispose, canDismiss };
  start();
  return root._titanSupportMount;
  }
  window.TitanAssistance = Object.freeze({ mount });
  mount(document.getElementById('help-form'));
})();
