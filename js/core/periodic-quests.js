/* V11-13 / V11-15: wording of the weekly and monthly quests the server computes (titan_periodic_quests_v1). Pure: no rule lives here,
   the server decides the kind, the target and the progress; this only says it kindly. Optional, never a punishment, cosmetic keepsake only. */
/**
 * @typedef {Record<string, unknown>} QuestTarget
 * @typedef {{ title: string, text: string, key: string, unit: string[] }} QuestWording
 */
(function (root) {
  "use strict";
  /** @param {number} n @param {string} one @param {string} many */
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  /** @param {unknown} v */
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  /** @type {Record<string, (t: QuestTarget) => QuestWording>} */
  const TEXT = {
    starter: (t) => ({ title: "Une première séance cette semaine", text: `Fais une séance d’au moins ${n(t.minSessionMinutes)} minutes, dans le sport que tu veux.`, key: "sessions", unit: ["séance", "séances"] }),
    return: (t) => ({ title: "Reprendre à ton rythme", text: `Aucune pression : une seule séance d’au moins ${n(t.minSessionMinutes)} minutes suffit pour reprendre.`, key: "sessions", unit: ["séance", "séances"] }),
    constancy: (t) => ({ title: "Garder ton rythme", text: `Ton rythme habituel : ${plural(n(t.days), "jour actif", "jours actifs")} cette semaine.`, key: "days", unit: ["jour", "jours"] }),
    progress: (t) => ({ title: "Un cran de plus, sans forcer", text: `Environ 10 % de temps en plus que d’habitude : ${n(t.minutes)} minutes cette semaine. Une semaine plus calme n’enlève rien.`, key: "minutes", unit: ["minute", "minutes"] }),
    multisport: (t) => ({ title: "Varier à ta façon", text: `${plural(n(t.sports), "sport", "sports")} différents parmi ceux que tu pratiques déjà, ce mois-ci. Pas besoin d’en découvrir un nouveau.`, key: "sports", unit: ["sport", "sports"] }),
    regularity: (t) => ({ title: "Rester régulier ce mois-ci", text: `${plural(n(t.days), "jour actif", "jours actifs")} dans le mois, à ta façon.`, key: "days", unit: ["jour", "jours"] }),
  };

  /** One quest object of the server answer -> what the screen shows. Unknown kinds are not shown. */
  /** @param {any} q @param {{ sportLabel?: (sport: string) => string }} [options] */
  function describe(q, { sportLabel = (s) => s } = {}) {
    const wording = q && typeof q === "object" ? TEXT[q.kind] : undefined;
    if (!wording || !q.target || typeof q.target !== "object") return null;
    const base = wording(q.target);
    const target = n(q.target[base.key]);
    const value = Math.min(target, n(q.progress?.[base.key]));
    return {
      scope: q.scope === "month" ? "month" : "week",
      kind: q.kind,
      scopeLabel: q.scope === "month" ? "Quête du mois" : "Quête de la semaine",
      title: base.title,
      text: base.text,
      value, target, percent: target > 0 ? Math.round((value / target) * 100) : 0,
      unit: base.unit,
      state: q.claimed ? "claimed" : q.complete ? "ready" : "open",
      focus: Array.isArray(q.focus) ? q.focus.slice(0, 3).map(sportLabel) : [],
    };
  }

  const api = { describe };
  /** @type {any} */ (root).TitanPeriodicQuestText = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
