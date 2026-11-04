/* Voluntary Community report. Deployment flag, verified account and explicit confirmation required. */
(function () {
  'use strict';
  let active = null;
  const current = job => !!job && job.owner === window.state?.user?.id && job.client === window.titanClient
    && job.epoch === window.titanAccountTransition?.epoch && !window.titanAccountTransition?.active;
  function open(code, job, trigger) {
    if (document.body.dataset.supportEnabled !== 'true' || !current(job) || !window.TitanAssistance || !window.TitanSupportDiagnostics) return;
    if (active) {
      if (current(active.job)) { active.dialog.querySelector('#support-message, .help-notice')?.focus(); return; }
      active.close(true);
    }
    const dialog = document.createElement('dialog'); dialog.className = 'asc-sheet help-report'; dialog.setAttribute('aria-label', 'Envoyer un rapport');
    dialog.innerHTML = '<div class="asc-sheet-body"><div class="asc-sheet-head"><div><p class="asc-eyebrow">Assistance</p><h2 class="asc-h2">Envoyer un rapport</h2></div><button type="button" class="asc-btn asc-btn-ghost asc-btn-icon" data-report-close aria-label="Fermer le rapport">×</button></div><p class="asc-small">Décris l’erreur de chargement de Communauté. Tu choisis le contenu et confirmes avant l’envoi.</p><div id="help-form" data-support-enabled="true"></div><p class="asc-small" data-report-fallback><a href="/service#help-communaute">Ouvrir Assistance</a> · <a href="mailto:titanteam.app@gmail.com?subject=TITAN%20%E2%80%94%20Assistance%20%E2%80%94%20Communaut%C3%A9">Écrire un e-mail à l’équipe</a></p></div>';
    const root = dialog.querySelector('#help-form'), closeButton = dialog.querySelector('[data-report-close]');
    const lifetime = new AbortController(); let handle = null, closed = false;
    const listen = (target, name, fn) => target.addEventListener(name, fn, { signal: lifetime.signal });
    function close(force = false) {
      if (closed || (!force && handle && !handle.canDismiss())) return;
      closed = true; lifetime.abort(); handle?.dispose();
      if (dialog.open) dialog.close(); dialog.remove();
      if (active?.dialog === dialog) active = null;
      if (current(job) && trigger?.isConnected) trigger.focus();
    }
    active = { dialog, job, close };
    listen(closeButton, 'click', () => close());
    listen(dialog, 'click', event => { if (event.target === dialog) close(); });
    listen(dialog, 'cancel', event => { event.preventDefault(); close(); });
    listen(dialog, 'close', () => close(true));
    listen(root, 'titan:support-state', event => {
      closeButton.disabled = !event.detail.canDismiss;
      dialog.querySelector('[data-report-fallback]').hidden = !event.detail.canDismiss;
    });
    for (const name of ['titan:account-changing', 'titan:account-changed', 'pagehide']) listen(window, name, () => close(true));
    document.body.append(dialog); dialog.showModal();
    handle = window.TitanAssistance.mount(root, {
      owner: job.owner, isCurrent: () => current(job), onInvalidated: () => close(true),
      captureDiagnostics: () => window.TitanSupportDiagnostics.capture({
        version: window.GAME_SETTINGS?.version, build: '300.4', userAgent: navigator.userAgent,
        mobile: navigator.userAgentData?.mobile, now: new Date().toISOString(), online: navigator.onLine
      }, code)
    });
    if (closed) handle?.dispose();
  }
  window.TitanSupportReports = Object.freeze({ open });
})();
