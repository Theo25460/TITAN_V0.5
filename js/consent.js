/* =========================================
   TITAN OS - CONSENTEMENT COOKIES / PUB
   ========================================= */

(function() {
    const CONSENT_KEY = 'titan_cookie_consent_v1';
    const AUTOTAG_SESSION_KEY = 'titan_adcash_autotag_session_v1';
    const DEFAULT_ADCASH_SRC = 'https://acscdn.com/script/aclib.js';
    const DEFAULT_AUTOTAG_ZONE_ID = 'illqcraznp';
    const DEFAULT_IN_PAGE_PUSH_ZONE_ID = '11300038';
    const DEFAULT_INTERSTITIAL_ZONE_ID = '11300046';
    const DEFAULT_IN_PAGE_MAX_ADS = 2;
    const PUBLIC_AD_PAGES = [
        'index.html',
        'guide.html',
        'service.html',
        'changelog.html'
    ];
    const SOFT_AUTOTAG_PAGES = [
        'index.html',
        'guide.html',
        'service.html',
        'changelog.html'
    ];
    const MAX_ADCASH_FORMAT_ATTEMPTS = 18;
    let adcashFormatAttempts = 0;
    let adcashRetryTimer = null;

    function getAdcashSrc() {
        return window.TITAN_EXTERNAL_URLS?.adcashScript || DEFAULT_ADCASH_SRC;
    }

    function getAutoTagZoneId() {
        return window.TITAN_EXTERNAL_URLS?.adcashAutoTagZoneId
            || window.TITAN_EXTERNAL_URLS?.adcashZoneId
            || DEFAULT_AUTOTAG_ZONE_ID;
    }

    function getInPagePushZoneId() {
        return window.TITAN_EXTERNAL_URLS?.adcashInPagePushZoneId || DEFAULT_IN_PAGE_PUSH_ZONE_ID;
    }

    function getInterstitialZoneId() {
        return window.TITAN_EXTERNAL_URLS?.adcashInterstitialZoneId || DEFAULT_INTERSTITIAL_ZONE_ID;
    }

    function getInPageMaxAds() {
        const configured = Number(window.TITAN_EXTERNAL_URLS?.adcashInPageMaxAds);
        return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 2) : DEFAULT_IN_PAGE_MAX_ADS;
    }

    function getConsent() {
        try { return localStorage.getItem(CONSENT_KEY); }
        catch (_) { return null; }
    }

    function setConsent(value) {
        try { localStorage.setItem(CONSENT_KEY, value); }
        catch (_) {}
    }

    function hasConsent() {
        return getConsent() === 'accepted';
    }

    function getPageName() {
        const path = window.location.pathname || '';
        const trimmed = path.replace(/\/+$/, '');
        let page = (trimmed.split('/').pop() || 'index').toLowerCase();
        if (!page.includes('.')) page = `${page}.html`;
        return page;
    }

    function getAdStatus() {
        if (!window.__titanAdcashStatus) {
            window.__titanAdcashStatus = {
                page: getPageName(),
                eligible: false,
                rewardedEligible: false,
                consent: hasConsent(),
                scriptLoaded: false,
                formats: [],
                error: null,
            };
        }
        window.__titanAdcashStatus.page = getPageName();
        window.__titanAdcashStatus.consent = hasConsent();
        window.__titanAdcashStatus.eligible = isAdsEligiblePage();
        window.__titanAdcashStatus.rewardedEligible = isRewardedAdsEligiblePage();
        return window.__titanAdcashStatus;
    }

    function isBoutiquePage() {
        return getPageName() === 'boutique.html';
    }

    function isEliteUser() {
        if (window.state?.user?.is_elite === true) return true;
        try {
            const raw = localStorage.getItem(window.STATE_KEY || 'titan_os_v12_save');
            if (!raw) return false;
            const saved = JSON.parse(raw);
            return saved?.user?.is_elite === true;
        } catch (_) {
            return false;
        }
    }

    function isRewardedAdsEligiblePage() {
        return window.TITAN_EXTERNAL_URLS?.adsEnabled === true && isBoutiquePage() && !isEliteUser();
    }

    function canRunManualAd() {
        return isAdsEligiblePage() || isRewardedAdsEligiblePage();
    }

    function isPublicContentPage() {
        return PUBLIC_AD_PAGES.includes(getPageName());
    }

    function isSoftAutoTagPage() {
        return SOFT_AUTOTAG_PAGES.includes(getPageName());
    }

    function runAdcashAutoTag() {
        if (!isSoftAutoTagPage() || isBoutiquePage()) return true;
        if (window.__titanAdcashAutoTagStarted) return true;
        if (!window.aclib || typeof window.aclib.runAutoTag !== 'function') return false;

        try {
            if (sessionStorage.getItem(AUTOTAG_SESSION_KEY) === 'started') return true;
        } catch (_) {}

        try {
            window.aclib.runAutoTag({
                zoneId: getAutoTagZoneId(),
            });
            try { sessionStorage.setItem(AUTOTAG_SESSION_KEY, 'started'); } catch (_) {}
            window.__titanAdcashAutoTagStarted = true;
            getAdStatus().formats.push('autotag');
            return true;
        } catch (err) {
            getAdStatus().error = err?.message || 'autotag_failed';
            return false;
        }
    }

    function runInPagePush() {
        if (!isPublicContentPage() || isBoutiquePage()) return true;
        if (window.__titanAdcashInPageStarted) return true;
        if (!window.aclib || typeof window.aclib.runInPagePush !== 'function') return false;

        try {
            window.aclib.runInPagePush({
                zoneId: getInPagePushZoneId(),
                maxAds: getInPageMaxAds(),
            });
            window.__titanAdcashInPageStarted = true;
            getAdStatus().formats.push('in-page-push');
            return true;
        } catch (err) {
            getAdStatus().error = err?.message || 'in_page_push_failed';
            return false;
        }
    }

    function runConfiguredAdcashFormats() {
        const inPageReady = runInPagePush();
        const autoTagReady = runAdcashAutoTag();
        if (inPageReady && autoTagReady) return;

        if (adcashFormatAttempts >= MAX_ADCASH_FORMAT_ATTEMPTS) {
            getAdStatus().error = 'formats_unavailable_after_retry';
            return;
        }

        adcashFormatAttempts += 1;
        window.clearTimeout(adcashRetryTimer);
        adcashRetryTimer = window.setTimeout(runConfiguredAdcashFormats, 500);
    }

    function loadAdcash() {
        const existing = document.querySelector('script[data-titan-adcash="true"]');
        if (existing) return Promise.resolve().then(runConfiguredAdcashFormats);
        if (window.__titanAdcashLoadPromise) return window.__titanAdcashLoadPromise;

        window.__titanAdcashLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.async = true;
            script.src = getAdcashSrc();
            script.dataset.titanAdcash = 'true';
            script.referrerPolicy = 'strict-origin-when-cross-origin';
            script.onload = () => {
                getAdStatus().scriptLoaded = true;
                runConfiguredAdcashFormats();
                resolve();
            };
            script.onerror = () => {
                getAdStatus().error = 'script_load_failed';
                reject(new Error('ADS_SCRIPT_LOAD_FAILED'));
            };
            document.head.appendChild(script);
        });

        return window.__titanAdcashLoadPromise;
    }

    function isAdsEligiblePage() {
        if (window.TITAN_EXTERNAL_URLS?.adsEnabled !== true) return false;
        const robots = document.querySelector('meta[name="robots"]');
        const robotsValue = robots ? String(robots.getAttribute('content') || '').toLowerCase() : '';
        const path = window.location.pathname || '';
        if (isEliteUser()) return false;
        if (robotsValue.includes('noindex')) return false;
        if (/sys_core_override|update-password|login|boutique|training|profile|social|chat|notifications|activities/i.test(path)) return false;
        return isPublicContentPage();
    }

    function shouldShowConsentBanner() {
        return isAdsEligiblePage();
    }

    function closeBanner() {
        const banner = document.getElementById('titan-consent-banner');
        if (banner) banner.remove();
    }

    function showBanner() {
        if (document.getElementById('titan-consent-banner')) return;

        const banner = document.createElement('div');
        banner.id = 'titan-consent-banner';
        banner.setAttribute('role', 'dialog');
        banner.setAttribute('aria-label', 'Consentement publicite');
        banner.style.cssText = [
            'position:fixed',
            'left:16px',
            'right:16px',
            'bottom:16px',
            'z-index:100000',
            'max-width:760px',
            'margin:0 auto',
            'padding:14px',
            'border:1px solid rgba(148,163,184,0.28)',
            'border-radius:8px',
            'background:rgba(2,6,23,0.96)',
            'color:#e2e8f0',
            'box-shadow:0 18px 60px rgba(0,0,0,0.38)',
            'font-family:Inter,system-ui,sans-serif'
        ].join(';');

        banner.innerHTML = `
            <div style="display:flex; gap:14px; align-items:center; justify-content:space-between; flex-wrap:wrap;">
                <div style="min-width:240px; flex:1;">
                    <div style="font-weight:800; letter-spacing:0.02em;">Confidentialite & publicite</div>
                    <div style="margin-top:4px; color:#94a3b8; font-size:0.9rem; line-height:1.4;">
                        Les publicites financent TITAN OS gratuit. En boutique, elles restent volontaires pour les primes.
                    </div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button type="button" data-consent="reject" style="min-height:40px; padding:0 14px; border-radius:6px; border:1px solid rgba(148,163,184,0.34); background:transparent; color:#e2e8f0; font-weight:700;">Refuser</button>
                    <button type="button" data-consent="accept" style="min-height:40px; padding:0 16px; border-radius:6px; border:0; background:#38bdf8; color:#020617; font-weight:900;">Accepter</button>
                </div>
            </div>
        `;

        banner.querySelector('[data-consent="accept"]').addEventListener('click', () => {
            setConsent('accepted');
            closeBanner();
            if (canRunManualAd()) loadAdcash();
        });
        banner.querySelector('[data-consent="reject"]').addEventListener('click', () => {
            setConsent('rejected');
            closeBanner();
        });

        document.body.appendChild(banner);
    }

    window.triggerClickAd = function() {
        if (!canRunManualAd()) {
            return Promise.reject(new Error('ADS_PAGE_BLOCKED'));
        }

        if (!hasConsent()) {
            showBanner();
            return Promise.reject(new Error('ADS_CONSENT_REQUIRED'));
        }

        return loadAdcash().then(() => {
            if (!window.aclib || typeof window.aclib.runInterstitial !== 'function') {
                throw new Error('ADS_UNAVAILABLE');
            }

            window.aclib.runInterstitial({
                zoneId: getInterstitialZoneId(),
            });
        }).catch(err => {
            if (err && err.message === 'ADS_CONSENT_REQUIRED') throw err;
            throw new Error('ADS_UNAVAILABLE');
        });
    };

    window.titanLoadAdcash = loadAdcash;
    window.titanHasAdConsent = hasConsent;
    window.titanCanUseRewardedAds = isRewardedAdsEligiblePage;
    window.titanResetAdConsent = function() {
        try { localStorage.removeItem(CONSENT_KEY); } catch (_) {}
        closeBanner();
        return { ...getAdStatus() };
    };
    window.titanGetAdcashStatus = function() {
        return { ...getAdStatus() };
    };

    document.addEventListener('DOMContentLoaded', () => {
        if (!shouldShowConsentBanner()) return;

        const consent = getConsent();
        if (consent === 'accepted') {
            if (isAdsEligiblePage()) loadAdcash();
            return;
        }

        if (consent !== 'rejected') showBanner();
    });
})();
