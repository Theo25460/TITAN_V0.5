(function titanHomepageDynamicContent() {
    'use strict';

    async function bootHomepageContent() {
        // The primary product promise is versioned with the page to avoid late hero replacement.
        if (typeof window.titanRenderActiveAnnouncements === 'function') {
            await window.titanRenderActiveAnnouncements('homepage', '#homepage-announcements');
        }

        if (typeof window.titanTrackEvent === 'function') {
            window.titanTrackEvent('page_view', { page_key: 'homepage' });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootHomepageContent, { once: true });
    } else {
        bootHomepageContent();
    }
})();
