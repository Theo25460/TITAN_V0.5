(function titanDynamicPage() {
    'use strict';

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function getSlug() {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get('slug') || params.get('page') || '';
        return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    async function getClient() {
        if (typeof window.waitForTitanSupabase === 'function') return window.waitForTitanSupabase(2500);
        if (typeof window.initTitanSupabaseClient === 'function') return window.initTitanSupabaseClient();
        return window.titanClient || null;
    }

    async function loadPage() {
        const target = document.getElementById('dynamic-page');
        const slug = getSlug();
        if (!target) return;
        if (!slug) {
            renderNotFound(target);
            return;
        }

        const client = await getClient();
        if (!client) {
            renderNotFound(target);
            return;
        }

        try {
            const { data, error } = await client
                .from('dynamic_pages')
                .select('*')
                .eq('slug', slug)
                .eq('status', 'published')
                .maybeSingle();

            if (error || !data) {
                renderNotFound(target);
                return;
            }

            document.title = data.meta_title || data.title || 'TITAN OS';
            const meta = document.querySelector('meta[name="description"]');
            if (meta && data.meta_description) meta.setAttribute('content', data.meta_description);
            const canonical = document.querySelector('link[rel="canonical"]');
            if (canonical) canonical.setAttribute('href', `${location.origin}${location.pathname}?slug=${encodeURIComponent(slug)}`);

            if (data.is_indexable === false) {
                let robots = document.querySelector('meta[name="robots"]');
                if (!robots) {
                    robots = document.createElement('meta');
                    robots.setAttribute('name', 'robots');
                    document.head.appendChild(robots);
                }
                robots.setAttribute('content', 'noindex, nofollow');
            }

            target.innerHTML = `
                ${data.cover_image_url ? `<img class="dynamic-cover" src="${escapeHtml(data.cover_image_url)}" alt="">` : ''}
                <div class="dynamic-kicker">/pages/${escapeHtml(slug)}</div>
                <h1>${escapeHtml(data.title)}</h1>
                <div class="dynamic-content">${data.content || ''}</div>
            `;

            if (typeof window.titanTrackEvent === 'function') {
                window.titanTrackEvent('dynamic_page_opened', { slug });
            }
        } catch (error) {
            console.warn('[TITAN PAGE]', error);
            renderNotFound(target);
        }
    }

    function renderNotFound(target) {
        target.innerHTML = `
            <div class="dynamic-state">
                <i class="ri-error-warning-line" aria-hidden="true"></i>
                <h1>Page introuvable</h1>
                <span>Cette page n'est pas publiee ou n'existe plus.</span>
            </div>
        `;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadPage, { once: true });
    } else {
        loadPage();
    }
})();
