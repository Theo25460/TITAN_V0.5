/* Wearable titles: an adventure insignia (one per chapter) or an expedition title. Pure naming and listing; the server
   decides what is earned and stores the choice (titan_set_displayed_title). Cosmetic only. */
(function (root) {
  "use strict";
  /** @param {string} world @param {number} chapter */
  const chapterKey = (world, chapter) => `chapter:${world}:${chapter}`;
  /** @param {string} id */
  const expeditionKey = (id) => `exp:${id}`;

  /** @param {any} catalog @param {string} world @param {number} chapter */
  function chapterTitle(catalog, world, chapter) {
    const w = catalog?.worlds?.find((/** @type {any} */ x) => x.id === world);
    const ch = w?.chapters?.[chapter - 1];
    return ch?.title ? { label: ch.title, world: w.name, color: w.color } : null;
  }

  /** Everything the account can wear, newest first: [{ key, label, source, detail }]. */
  /** @param {{ rewards?: any[], expeditionTitles?: any[], catalog?: any }} [input] */
  function earned({ rewards = [], expeditionTitles = [], catalog } = {}) {
    /** @type {{ key: string, label: string, source: string, detail: string, color?: string }[]} */
    const out = [];
    for (const r of rewards.slice().sort((a, b) => new Date(b.earned_at).getTime() - new Date(a.earned_at).getTime())) {
      const t = chapterTitle(catalog, r.world, r.chapter);
      if (t) out.push({ key: chapterKey(r.world, r.chapter), label: t.label, source: "chapter", detail: `${t.world} · chapitre ${r.chapter}`, color: t.color });
    }
    for (const t of expeditionTitles) {
      if (t?.id && t.title) out.push({ key: expeditionKey(t.id), label: t.title, source: "expedition", detail: t.expedition || "Expédition" });
    }
    return out;
  }

  /** Readable name of a worn title: the server label for expeditions, the catalogue for insignias. */
  /** @param {unknown} key @param {{ catalog?: any, serverLabel?: string | null }} [options] */
  function label(key, { catalog, serverLabel } = {}) {
    if (typeof key !== "string") return null;
    if (key.startsWith("exp:")) return serverLabel || null;
    const m = key.match(/^chapter:(aube|marees|forge|aurores):([1-9])$/);
    return m ? chapterTitle(catalog, String(m[1]), Number(m[2]))?.label || null : null;
  }

  const api = { earned, label, chapterKey, expeditionKey };
  /** @type {any} */ (root).TitanTitles = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
