/* Minimal, consent-only support metadata. No browser globals or storage are read here. */
(function () {
  'use strict';
  const allowed = {
    platform: ['Android', 'iOS', 'Windows', 'macOS', 'Linux', 'autre'],
    browser: ['Chrome', 'Firefox', 'Safari', 'Edge', 'Samsung Internet', 'Opera', 'autre'],
    device: ['mobile', 'tablette', 'ordinateur', 'indéterminé'],
    network: ['en ligne', 'hors ligne', 'inconnu'],
    code: ['COMMUNITY_LOAD_FAILED', 'COMMUNITY_RESPONSE_INVALID']
  };
  /** @param {keyof typeof allowed} key @param {unknown} value @param {string} fallback */
  const choice = (key, value, fallback) => typeof value === 'string' && allowed[key].includes(value) ? value : fallback;
  /** @param {unknown} value */
  const version = value => typeof value === 'string' && /^\d{1,4}(?:\.\d{1,4}){1,3}$/.test(value) ? value : 'inconnue';
  /** @param {unknown} value */
  const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value ? value : 'inconnu';
  /** @param {{ userAgent?: unknown, mobile?: unknown, version?: unknown, build?: unknown, now?: unknown, online?: unknown }} [env] @param {string} [code] */
  function capture(env = {}, code) {
    const ua = typeof env.userAgent === 'string' && env.userAgent.length <= 2048 ? env.userAgent : '';
    const platform = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Macintosh|Mac OS X/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'autre';
    const browser = /SamsungBrowser\//i.test(ua) ? 'Samsung Internet' : /Edg(?:e|A|iOS)?\//i.test(ua) ? 'Edge' : /OPR\/|Opera\//i.test(ua) ? 'Opera' : /Firefox\/|FxiOS\//i.test(ua) ? 'Firefox' : /Chrome\/|CriOS\//i.test(ua) ? 'Chrome' : /Safari\//i.test(ua) ? 'Safari' : 'autre';
    const device = /iPad/i.test(ua) || (platform === 'Android' && !/Mobile/i.test(ua)) ? 'tablette' : /Mobile|iPhone|iPod/i.test(ua) || env.mobile === true ? 'mobile' : ['Windows', 'macOS', 'Linux'].includes(platform) ? 'ordinateur' : 'indéterminé';
    return Object.freeze({ version: version(env.version), build: version(env.build), platform, browser, device,
      screen: 'Communauté', timestamp: timestamp(env.now), network: env.online === true ? 'en ligne' : env.online === false ? 'hors ligne' : 'inconnu',
      code: choice('code', code, 'COMMUNITY_LOAD_FAILED') });
  }
  /** @param {any} data */
  function format(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return '';
    return '\n\nDiagnostics autorisés :\n' + [
      `Version : ${version(data.version)}`, `Module : ${version(data.build)}`,
      `Plateforme : ${choice('platform', data.platform, 'autre')}`, `Navigateur : ${choice('browser', data.browser, 'autre')}`,
      `Appareil : ${choice('device', data.device, 'indéterminé')}`, 'Écran : Communauté',
      `Horodatage du diagnostic : ${timestamp(data.timestamp)}`, `Réseau : ${choice('network', data.network, 'inconnu')}`,
      `Code : ${choice('code', data.code, 'COMMUNITY_LOAD_FAILED')}`
    ].join('\n');
  }
  /** @type {any} */ (window).TitanSupportDiagnostics = Object.freeze({ capture, format });
})();
