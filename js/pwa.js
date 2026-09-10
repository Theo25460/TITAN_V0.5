(function () {
    const isStandalone = () => {
        return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    };

    const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
    let deferredPrompt = null;
    let refreshing = false;

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
        button.setAttribute('aria-label', message || 'Installer TITAN OS');

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
            button.textContent = 'Nouvelle version - recharger';
            button.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:100000;border:1px solid rgba(61,214,198,.35);background:rgba(8,13,22,.94);color:#fff;border-radius:999px;padding:9px 14px;font-weight:900;font-size:.74rem;box-shadow:0 12px 34px rgba(0,0,0,.35);';
            document.body.appendChild(button);
        }
        button.hidden = false;
        button.onclick = () => {
            const worker = registration.waiting;
            if (worker) worker.postMessage({ type: 'SKIP_WAITING' });
            else window.location.reload();
        };
    }

    async function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            if (registration.waiting) showUpdateButton(registration);
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
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
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
            setInstallState('info', 'Sur iPhone: Partager puis Ajouter a l ecran d accueil.');
            return;
        }

        setInstallState('info', 'Menu du navigateur puis Installer l application.');
    }

    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredPrompt = event;
        setInstallState('ready', 'Installer TITAN OS sur cet appareil.');
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
