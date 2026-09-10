(function titanHomepageDynamicContent() {
    'use strict';

    async function bootHomepageContent() {
        if (typeof window.titanApplyContentBlock === 'function') {
            await window.titanApplyContentBlock('homepage_hero', {
                title: '#hero-title',
                subtitle: '.hero-eyebrow span',
                body: '#hero-subtitle',
                ctaLabel: '#hero-primary-cta',
                ctaUrl: '#hero-primary-cta'
            });
        }

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
