/* Shared, read-only navigation over sport summaries. Never changes sessions or their results. */
(function (root) {
  "use strict";
  const norm = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’'_/().-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const date = (v) => Number.isFinite(Date.parse(v)) ? Date.parse(v) : 0;
  const alphabetical = (a, b) => String(a.label || a.sport).localeCompare(String(b.label || b.sport), "fr") || String(a.sport).localeCompare(String(b.sport));

  function select(entries, options = {}) {
    const q = norm(options.query);
    const favorites = new Set(Array.isArray(options.favorites) ? options.favorites : []);
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const list = (entries || []).filter((s) => {
      if (options.hideEmpty !== false && !s.hasData) return false;
      if (options.sport && options.sport !== "all" && s.sport !== options.sport) return false;
      if (options.family && options.family !== "all" && s.family !== options.family) return false;
      if (options.scope === "favorites" && !favorites.has(s.sport)) return false;
      if (options.scope === "recent" && (!s.hasData || !date(s.last) || date(s.last) < now - 30 * 86400000 || date(s.last) > now)) return false;
      const aliases = Array.isArray(s.aliases) ? s.aliases : [];
      return !q || [s.label, s.sport, ...aliases].some((v) => norm(v).includes(q));
    });
    list.sort((a, b) => {
      if (options.sort === "recent") return date(b.sortLast || b.last) - date(a.sortLast || a.last) || alphabetical(a, b);
      if (options.sort === "mastery") return (Number(b.level) || 0) - (Number(a.level) || 0) || (Number(b.minutes) || 0) - (Number(a.minutes) || 0) || alphabetical(a, b);
      return alphabetical(a, b);
    });
    const size = Math.min(12, Math.max(1, Math.floor(Number(options.pageSize)) || 12));
    const pages = Math.max(1, Math.ceil(list.length / size));
    const requested = Number.isFinite(Number(options.page)) ? Math.floor(Number(options.page)) : 1;
    const page = Math.max(1, Math.min(pages, requested || 1));
    return { items: list.slice((page - 1) * size, page * size), total: list.length, page, pages };
  }

  const api = { select };
  root.TitanSportNavigation = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
