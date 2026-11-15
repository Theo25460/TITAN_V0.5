(function () {
    const isStandalone = () => {
        return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    };

    const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
    let deferredPrompt = null;
    let refreshing = false;
    let updateRequested = false;
    let autoApplied = false;
    let touched = false;

    function setInstallState(state, message) {
        const button = document.getElementById('pwa-install-button');
        const hint = document.getElementById('pwa-install-hint');
        if (!button) return;

        if (state === 'installed') {
            button.style.display = 'none';
            if (hint) hint.textContent = '';
            return;
        }

        button.style.display = 'inline-flex';
        button.classList.toggle('is-ready', state === 'ready');
        button.classList.toggle('is-info', state === 'info');
        button.setAttribute('aria-label', message || 'Installer TITAN');

        const label = button.querySelector('[data-pwa-label]');
        if (label) label.textContent = state === 'ready' ? 'Installer' : 'PWA';
        if (hint) {
            hint.textContent = message || '';
            hint.hidden = !message;
        }
    }

    function showUpdateButton(registration) {
        let button = document.getElementById('titan-update-button');
        if (!button) {
            button = document.createElement('button');
            button.id = 'titan-update-button';
            button.type = 'button';
            button.textContent = 'Nouvelle version : recharger';
            // TITAN design (same tokens as the pages); sits above the tab bar when there is one, and above the consent card (z-index below it is never needed: it stacks).
            button.style.cssText = 'position:fixed;left:50%;bottom:calc(' + (document.querySelector('.asc-tabbar') ? 'var(--tabbar,68px) + ' : '') + '16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:1000;max-width:calc(100% - 32px);min-height:44px;border:1px solid var(--cy,#3dd9e8);background:var(--bg-2,#0e141a);color:var(--tx,#eef3f7);border-radius:999px;padding:0 18px;font:700 14px var(--font-text,system-ui,sans-serif);box-shadow:0 12px 34px rgba(0,0,0,.45);cursor:pointer;';
            document.body.appendChild(button);
        }
        button.hidden = false;
        button.onclick = () => {
            if (window.titanSubmitting) return;
            document.getElementById("training-form")?.dispatchEvent(new Event("input", {bubbles:true}));
            updateRequested = true;
            autoApplied = false;
            const worker = registration.waiting;
            if (worker) worker.postMessage({ type: 'SKIP_WAITING' });
            else window.location.reload();
        };
    }

    // A version downloaded during an earlier page is applied as this page starts, before anything is typed on it: the old worker
    // otherwise keeps answering from its cache (stale styles after a deploy, several cache generations kept) until the button is pressed.
    // An update that arrives while the page is in use still only shows the button: nothing reloads under the user's hands.
    function applyWaitingUpdate(registration) {
        let recent = false;
        try { recent = Date.now() - Number(sessionStorage.getItem('titan_sw_auto_update') || 0) < 60000; } catch (_) { recent = true; }
        if (!navigator.serviceWorker.controller || window.titanSubmitting || recent || !registration.waiting) {
            showUpdateButton(registration);
            return;
        }
        try { sessionStorage.setItem('titan_sw_auto_update', String(Date.now())); } catch (_) {}
        updateRequested = true;
        autoApplied = true;
        ['pointerdown', 'keydown'].forEach(type => window.addEventListener(type, () => { touched = true; }, { once: true, capture: true, passive: true }));
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        // If the new worker does not take over (it was replaced, or the browser refused), fall back to the visible button.
        setTimeout(() => { if (!refreshing && autoApplied && registration.waiting) { autoApplied = false; updateRequested = false; showUpdateButton(registration); } }, 4000);
    }

    async function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        // Development previews must never mix a cached release with edited source.
        // Opt in locally with localStorage.titan_sw_dev = "1" to test the offline shell on a preview build.
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
        let devSw = false;
        try { devSw = local && localStorage.getItem('titan_sw_dev') === '1'; } catch (_) {}
        if (local && !devSw) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(registration => registration.unregister()));
            return;
        }
        try {
            const registration = await navigator.serviceWorker.register(devSw ? '/sw.js?dev=1' : '/sw.js');
            if (registration.waiting) applyWaitingUpdate(registration);
            registration.addEventListener('updatefound', () => {
                const worker = registration.installing;
                if (!worker) return;
                worker.addEventListener('statechange', () => {
                    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdateButton(registration);
                    }
                });
            });
        } catch (error) {
            console.warn('[TITAN PWA] Service worker registration failed', error);
        }
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data?.type !== 'OFFLINE_CACHE_PARTIAL') return;
            window.titanSetSyncStatus?.('error', 'Installation hors ligne incomplète : reconnecte-toi pour la terminer.');
        });
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing || !updateRequested) return;
            // Applied by itself at page start: if the page is already in use, it stays as it is (it is the current build's page) and the
            // new worker simply serves the next one.
            if (autoApplied && touched) { autoApplied = false; updateRequested = false; return; }
            refreshing = true;
            window.location.reload();
        });
    }

    async function handleInstallClick() {
        if (isStandalone()) {
            setInstallState('installed');
            return;
        }

        if (deferredPrompt) {
            const promptEvent = deferredPrompt;
            deferredPrompt = null;
            promptEvent.prompt();
            await promptEvent.userChoice.catch(() => null);
            setInstallState('info', 'Installation disponible depuis le menu du navigateur si besoin.');
            return;
        }

        if (isIos()) {
            setInstallState('info', 'Sur iPhone : Partager, puis « Sur l’écran d’accueil ».');
            return;
        }

        setInstallState('info', 'Menu du navigateur, puis « Installer l’application ».');
    }

    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredPrompt = event;
        setInstallState('ready', 'Installer TITAN sur cet appareil.');
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        setInstallState('installed');
    });

    document.addEventListener('DOMContentLoaded', () => {
        registerServiceWorker();

        const button = document.getElementById('pwa-install-button');
        if (button) button.addEventListener('click', handleInstallClick);

        if (isStandalone()) {
            setInstallState('installed');
        } else if (isIos()) {
            setInstallState('info', 'Installable depuis Partager sur iPhone.');
        } else {
            setInstallState('info', 'Installation possible depuis le navigateur.');
        }
    });
})();
