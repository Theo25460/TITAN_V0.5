(function titanPublicRelaunch() {
    'use strict';

    const routeFile = () => {
        const clean = String(window.location.pathname || '/')
            .replace(/\/+$/, '')
            .split('/')
            .pop() || 'index';
        return clean.includes('.') ? clean : `${clean}.html`;
    };

    const routeKey = () => routeFile().replace(/\.html$/i, '') || 'index';

    function ensureDocumentLandmarks() {
        document.documentElement.lang = 'fr';
        if (document.body && !document.body.dataset.page) {
            document.body.dataset.page = routeKey();
        }

        const main = document.querySelector('main');
        if (!main) return;
        if (!main.id) main.id = 'contenu-principal';

        if (!document.querySelector('.skip-link')) {
            const skip = document.createElement('a');
            skip.className = 'skip-link';
            skip.href = `#${main.id}`;
            skip.textContent = 'Aller au contenu';
            document.body.insertAdjacentElement('afterbegin', skip);
        }
    }

    function markCurrentLinks(root = document) {
        const current = routeFile();
        root.querySelectorAll('a[href]').forEach(link => {
            const rawHref = String(link.getAttribute('href') || '').trim();
            if (!rawHref || rawHref.startsWith('#')) return;
            let url;
            try {
                url = new URL(rawHref, window.location.href);
            } catch (_) {
                return;
            }
            if (url.origin !== window.location.origin) return;
            const file = (url.pathname.replace(/\/+$/, '').split('/').pop() || 'index');
            const normalized = file.includes('.') ? file : `${file}.html`;
            if (normalized === current) link.setAttribute('aria-current', 'page');
            else if (link.getAttribute('aria-current') === 'page') link.removeAttribute('aria-current');
        });
    }

    function improveControls(root = document) {
        root.querySelectorAll('button, [role="button"]').forEach(control => {
            if (control.getAttribute('aria-label')) return;
            const visibleText = String(control.textContent || '').replace(/\s+/g, ' ').trim();
            if (visibleText) return;
            const title = control.getAttribute('title');
            if (title) control.setAttribute('aria-label', title);
        });

        root.querySelectorAll('a[target="_blank"]').forEach(link => {
            const rel = new Set(String(link.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
            rel.add('noopener');
            rel.add('noreferrer');
            link.setAttribute('rel', Array.from(rel).join(' '));
        });

        root.querySelectorAll('img').forEach((img, index) => {
            const source = String(img.getAttribute('src') || '');
            if (!img.hasAttribute('alt') || (!img.alt && /logo/i.test(source))) {
                img.alt = 'TITAN OS Sport';
            }
            if (index > 0 && !img.hasAttribute('loading')) img.loading = 'lazy';
            if (!img.hasAttribute('decoding')) img.decoding = 'async';
        });
    }

    function setCurrentYear() {
        document.querySelectorAll('[data-current-year]').forEach(node => {
            node.textContent = String(new Date().getFullYear());
        });
    }

    function announceNetworkState() {
        let status = document.getElementById('titan-network-status');
        if (!status) {
            status = document.createElement('div');
            status.id = 'titan-network-status';
            status.className = 'sr-only';
            status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite');
            document.body.appendChild(status);
        }

        window.addEventListener('offline', () => {
            status.textContent = 'Tu es hors connexion. Les données déjà chargées restent disponibles.';
        });
        window.addEventListener('online', () => {
            status.textContent = 'La connexion est revenue.';
        });
    }

    function observeDynamicNavigation() {
        if (!window.MutationObserver) return;
        const observer = new MutationObserver(records => {
            const relevant = records.some(record => Array.from(record.addedNodes || []).some(node =>
                node.nodeType === 1 && (node.matches?.('nav, .sidebar, .mobile-nav, .mobile-menu-panel') || node.querySelector?.('a[href]'))
            ));
            if (!relevant) return;
            markCurrentLinks();
            improveControls();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function boot() {
        document.documentElement.classList.add('titan-v100');
        ensureDocumentLandmarks();
        markCurrentLinks();
        improveControls();
        setCurrentYear();
        announceNetworkState();
        observeDynamicNavigation();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();
