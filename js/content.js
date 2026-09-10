(function titanDynamicContent() {
    'use strict';

    const cache = {
        blocks: new Map(),
        pages: new Map(),
        announcements: new Map(),
        settings: new Map()
    };

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    async function getClient() {
        try {
            if (typeof window.waitForTitanSupabase === 'function') {
                return await window.waitForTitanSupabase(2200);
            }
            if (typeof window.initTitanSupabaseClient === 'function') {
                return window.initTitanSupabaseClient();
            }
            return window.titanClient || null;
        } catch (_) {
            return null;
        }
    }

    function isVisibleNow(row) {
        const now = Date.now();
        const starts = row.starts_at ? Date.parse(row.starts_at) : null;
        const ends = row.ends_at ? Date.parse(row.ends_at) : null;
        return (!starts || starts <= now) && (!ends || ends >= now);
    }

    window.getContentBlock = async function getContentBlock(key) {
        if (!key) return null;
        if (cache.blocks.has(key)) return cache.blocks.get(key);
        const client = await getClient();
        if (!client) return null;
        try {
            const { data, error } = await client
                .from('content_blocks')
                .select('*')
                .eq('key', key)
                .eq('is_active', true)
                .maybeSingle();
            if (error || !data) return null;
            cache.blocks.set(key, data);
            return data;
        } catch (error) {
            console.warn('[TITAN CONTENT] getContentBlock fallback:', error);
            return null;
        }
    };

    window.getContentBlocksByPage = async function getContentBlocksByPage(page) {
        if (!page) return [];
        if (cache.pages.has(page)) return cache.pages.get(page);
        const client = await getClient();
        if (!client) return [];
        try {
            const { data, error } = await client
                .from('content_blocks')
                .select('*')
                .eq('page', page)
                .eq('is_active', true)
                .order('sort_order', { ascending: true });
            if (error) return [];
            const rows = Array.isArray(data) ? data : [];
            cache.pages.set(page, rows);
            rows.forEach((row) => row.key && cache.blocks.set(row.key, row));
            return rows;
        } catch (error) {
            console.warn('[TITAN CONTENT] getContentBlocksByPage fallback:', error);
            return [];
        }
    };

    window.loadActiveAnnouncements = async function loadActiveAnnouncements(placement = 'all') {
        const key = String(placement || 'all');
        if (cache.announcements.has(key)) return cache.announcements.get(key);
        const client = await getClient();
        if (!client) return [];
        try {
            const { data, error } = await client
                .from('announcements')
                .select('*')
                .eq('is_active', true)
                .in('placement', [key, 'all'])
                .order('priority', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(8);
            if (error) return [];
            const rows = (Array.isArray(data) ? data : []).filter(isVisibleNow);
            cache.announcements.set(key, rows);
            return rows;
        } catch (error) {
            console.warn('[TITAN CONTENT] announcements fallback:', error);
            return [];
        }
    };

    window.titanApplyContentBlock = async function titanApplyContentBlock(key, targets = {}) {
        const block = await window.getContentBlock(key);
        if (!block) return null;

        setText(targets.title, block.title);
        setText(targets.subtitle, block.subtitle);
        setText(targets.body, block.body);
        setText(targets.ctaLabel, block.cta_label);
        setAttr(targets.ctaUrl, 'href', block.cta_url);
        setAttr(targets.imageUrl, 'src', block.image_url);

        return block;
    };

    window.titanRenderActiveAnnouncements = async function titanRenderActiveAnnouncements(placement, target) {
        injectAnnouncementStyles();
        const container = typeof target === 'string' ? document.querySelector(target) : target;
        if (!container) return [];
        const rows = await window.loadActiveAnnouncements(placement);
        if (!rows.length) {
            container.hidden = true;
            container.innerHTML = '';
            return [];
        }
        container.hidden = false;
        container.classList.add('titan-announcements');
        container.innerHTML = rows.map((row) => `
            <article class="titan-announcement titan-announcement-${escapeHtml(row.type || 'info')}">
                <div>
                    <strong>${escapeHtml(row.title)}</strong>
                    <span>${escapeHtml(row.message)}</span>
                </div>
                ${row.cta_label && row.cta_url ? `<a href="${escapeHtml(row.cta_url)}">${escapeHtml(row.cta_label)}</a>` : ''}
            </article>
        `).join('');
        return rows;
    };

    window.titanTrackEvent = async function titanTrackEvent(eventName, metadata = {}) {
        const client = await getClient();
        if (!client || !eventName) return false;
        try {
            let userId = null;
            if (client.auth) {
                const session = await client.auth.getSession();
                userId = session?.data?.session?.user?.id || null;
            }
            const { error } = await client.from('analytics_events').insert({
                user_id: userId,
                event_name: String(eventName).slice(0, 120),
                page: location.pathname,
                source: new URLSearchParams(location.search).get('utm_source') || null,
                referrer: document.referrer || null,
                metadata
            });
            return !error;
        } catch (_) {
            return false;
        }
    };

    function setText(selector, value) {
        if (!selector || value === null || typeof value === 'undefined' || value === '') return;
        const node = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (node) node.textContent = value;
    }

    function setAttr(selector, attr, value) {
        if (!selector || !value) return;
        const node = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (node) node.setAttribute(attr, value);
    }

    function injectAnnouncementStyles() {
        if (document.getElementById('titan-announcement-styles')) return;
        const style = document.createElement('style');
        style.id = 'titan-announcement-styles';
        style.textContent = `
            .titan-announcements{display:grid;gap:10px;margin:14px 0 0}
            .titan-announcement{display:flex;justify-content:space-between;gap:12px;align-items:center;border:1px solid rgba(126,220,255,.24);border-radius:8px;padding:12px 14px;background:rgba(8,16,26,.86);color:#dff7ff}
            .titan-announcement strong{display:block;color:#fff;text-transform:uppercase;font-size:.84rem}
            .titan-announcement span{display:block;color:#b9cad8;margin-top:2px}
            .titan-announcement a{flex:0 0 auto;color:#07111c;background:#9ee7ff;border-radius:8px;padding:8px 10px;font-weight:900;text-decoration:none}
            .titan-announcement-warning{border-color:rgba(245,165,36,.34)}
            .titan-announcement-maintenance{border-color:rgba(255,93,112,.38)}
            @media(max-width:640px){.titan-announcement{align-items:flex-start;flex-direction:column}.titan-announcement a{width:100%;text-align:center}}
        `;
        document.head.appendChild(style);
    }
})();
