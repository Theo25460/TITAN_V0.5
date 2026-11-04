// Web preview only (TITAN_PREVIEW=1): stands in for native SDKs that cannot load in a browser. Never part of the Android build.
const noop = () => {};
module.exports = new Proxy({ __esModule: true, default: () => ({ initialize: async () => [], setRequestConfiguration: async () => {} }) }, { get: (t, k) => (k in t ? t[k] : noop) });
