/* TITAN — story cards (« Partager »): what a 9:16 image of a session or a success may show, the same rules on the website and
   on Android (copied unchanged to mobile/src/core/web by scripts/sync-web-core.mjs). Pure: no DOM, no network, no storage.

   The card is a picture the athlete chooses to send. It shows only measured values that the client already displays, in plain
   units, and never: a GPS trace, coordinates, a place, an address, a note, a body signal (perceived effort, heart rate, weight),
   the time of day. The name is off until the athlete ticks it; the date and the confirmed XP can be hidden. Building a card
   changes nothing: no session, XP, visibility or profile setting is read for writing here. */
(function (root) {
  "use strict";

  /** The exported picture: a vertical story at 1080 × 1920. Every length below is in pixels of that picture. */
  const SIZE = { width: 1080, height: 1920 };
  /** Story apps lay their own interface over the picture (progress bar and account on top, reply field at the bottom): the
      card keeps its information inside these margins. */
  const SAFE = { top: 250, bottom: 340, side: 96 };
  const SITE = "titan-app.fr";
  const TAGLINE = "Tous tes sports. Une seule progression.";

  /** The athlete's choices, and their defaults: nothing that identifies a person is drawn unless they ask for it. */
  const DEFAULTS = Object.freeze({ name: false, date: true, xp: true });
  const OPTION_LABELS = Object.freeze({ name: "Afficher mon nom", date: "Afficher la date", xp: "Afficher l’XP et le niveau" });

  /** Product analytics of the flow (consent applies on each client). Never a sport, a value or a name: only `kind`. */
  const EVENTS = Object.freeze({ preview: "share_preview_opened", exported: "share_export_succeeded", failed: "share_export_failed", sheet: "share_sheet_opened" });

  /** The measures of a session (as `sessionMetrics` / `TitanMoment.metrics` label them) that may be drawn. « Ressenti » is a
      body signal and is never drawn; anything unknown is dropped rather than guessed. */
  const FACTS = ["Distance", "Durée", "Allure", "Vitesse", "Dénivelé", "Exercices", "Séries", "Volume", "Répétitions", "Meilleure", "Réussites", "Valeur"];
  const MAX_FACTS = 3;
  /** The one big figure of a session: what was covered, the hardest grade, the load moved, then the time. The other measures
      follow in the client's own order. */
  const HERO = ["Distance", "Meilleure", "Volume", "Répétitions", "Durée", "Valeur", "Séries", "Exercices"];
  const LIMITS = { title: 48, eyebrow: 40, value: 18, label: 28, detail: 72, name: 32 };

  /** One line of text, without control characters, cut at a word boundary with an ellipsis when longer than `max`.
      @param {unknown} text @param {number} max @returns {string} */
  function clip(text, max) {
    // eslint-disable-next-line no-control-regex
    const s = (typeof text === "string" || typeof text === "number" ? String(text) : "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim();
    if (s.length <= max) return s;
    const cut = s.slice(0, Math.max(1, max - 1));
    const space = cut.lastIndexOf(" ");
    return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:·–-]+$/, "")}…`;
  }

  /** A displayable measured value: a non-empty string that is not a placeholder for an unknown value.
      @param {unknown} v @returns {boolean} */
  function measured(v) {
    if (typeof v !== "string" && typeof v !== "number") return false;
    const s = String(v).trim();
    return s !== "" && s !== "—" && s !== "-" && !/NaN|undefined|null|Infinity/.test(s) && !/^0(?:[,.]0+)?(?:\s|$)/.test(s);
  }

  /** @param {unknown} raw @returns {{ name: boolean, date: boolean, xp: boolean }} */
  function options(raw) {
    const o = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
    return { name: o.name === true, date: o.date === undefined ? DEFAULTS.date : o.date === true, xp: o.xp === undefined ? DEFAULTS.xp : o.xp === true };
  }

  /** « 26 novembre 2026 », or null for an invalid date. @param {unknown} date @returns {string | null} */
  function dateText(date) {
    if (date === null || date === undefined || date === "") return null;
    const d = new Date(/** @type {any} */ (date));
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  }

  const int = (/** @type {unknown} */ v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
  const thousands = (/** @type {number} */ n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");

  /** The confirmed reward line. Only a gain the server confirmed is drawn; an estimate, a held or a capped-to-zero reward is not.
      @param {any} xp @param {boolean} shown */
  function rewardLines(xp, shown) {
    if (!shown || !xp || xp.confirmed !== true) return { xp: null, level: null };
    const amount = int(xp.amount);
    const level = int(xp.level);
    const rank = clip(xp.rankName, 24);
    return { xp: amount > 0 ? `+${thousands(amount)} XP` : null, level: level > 0 ? `Niveau ${level}${rank ? ` · ${rank}` : ""}` : null };
  }

  /** @param {any} o @param {{ name: boolean, date: boolean, xp: boolean }} opt */
  function common(o, opt) {
    return {
      date: opt.date ? dateText(o.date) : null,
      name: opt.name ? clip(o.name, LIMITS.name) || null : null,
      url: SITE,
      tagline: TAGLINE,
    };
  }

  /** The card of one session.
      input: { sport: label, metrics: [label, value][] (the client's own list), record?: { label, value, previous? } (a record this
      session set, not a first mark), xp?: { confirmed, amount, level, rankName }, date, name, historical? }.
      @param {any} input @param {unknown} [rawOptions] */
  function session(input, rawOptions) {
    const o = input && typeof input === "object" ? input : {};
    const opt = options(rawOptions);
    const facts = /** @type {[string, string][]} */ ((Array.isArray(o.metrics) ? o.metrics : [])
      .filter((/** @type {unknown} */ m) => Array.isArray(m) && FACTS.includes(m[0]) && measured(m[1]))
      .map((/** @type {[string, unknown]} */ m) => [m[0], clip(m[1], LIMITS.value)]));
    const unique = facts.filter(([k], i) => facts.findIndex(([j]) => j === k) === i);
    const rec = o.record && measured(o.record.value) && clip(o.record.label, LIMITS.label) ? o.record : null;
    const lead = HERO.map((k) => unique.find(([j]) => j === k)).find(Boolean) || unique[0];
    const rest = unique.filter((m) => m !== lead);
    const hero = lead ? { value: lead[1], label: lead[0] } : null;
    return {
      kind: "session",
      accent: rec ? "amber" : "cyan",
      eyebrow: rec ? "Nouveau record" : o.historical ? "Séance de mon historique" : "Séance",
      title: clip(o.sport, LIMITS.title) || "Séance",
      hero,
      facts: rest.slice(0, MAX_FACTS),
      highlight: rec ? { label: `Record · ${clip(rec.label, LIMITS.label)}`, value: clip(rec.value, LIMITS.value), detail: measured(rec.previous) ? `avant : ${clip(rec.previous, LIMITS.value)}` : null } : null,
      progress: null,
      ...rewardLines(o.xp, opt.xp && !o.historical),
      ...common(o, opt),
    };
  }

  /** The card of a success: a personal record, a milestone or a level.
      input: { type: "record" | "milestone" | "level", title, value, label?, sport?, previous?, progress?, date, name }.
      @param {any} input @param {unknown} [rawOptions] */
  function achievement(input, rawOptions) {
    const o = input && typeof input === "object" ? input : {};
    const opt = options(rawOptions);
    const type = ["record", "milestone", "level"].includes(o.type) ? o.type : "milestone";
    const value = measured(o.value) ? clip(o.value, LIMITS.value) : null;
    const sport = clip(o.sport, LIMITS.title);
    const progress = measured(o.previous) ? `avant : ${clip(o.previous, LIMITS.value)}` : o.type === "record" && o.previous === null ? "Premier repère" : clip(o.progress, LIMITS.detail) || null;
    return {
      kind: "achievement",
      accent: type === "level" ? "cyan" : "amber",
      eyebrow: type === "record" ? (sport ? `Record personnel · ${sport}` : "Record personnel") : type === "level" ? "Nouveau niveau" : "Jalon atteint",
      title: clip(o.title, LIMITS.title) || (type === "record" ? "Record personnel" : "Succès"),
      hero: value ? { value, label: clip(o.label, LIMITS.label) || "" } : null,
      facts: [],
      highlight: null,
      progress,
      xp: null,
      level: null,
      ...common(o, opt),
    };
  }

  /** Which choices make sense for a given input (the name box needs a name, the XP box a confirmed gain).
      @param {any} input @returns {("name" | "date" | "xp")[]} */
  function availableOptions(input) {
    const o = input && typeof input === "object" ? input : {};
    /** @type {("name" | "date" | "xp")[]} */
    const out = [];
    if (clip(o.name, LIMITS.name)) out.push("name");
    if (dateText(o.date)) out.push("date");
    if (!o.historical && o.xp && o.xp.confirmed === true && (int(o.xp.amount) > 0 || int(o.xp.level) > 0)) out.push("xp");
    return out;
  }

  /** The file name of the export: no date, no name, no sport. @param {string} kind */
  const fileName = (kind) => (kind === "achievement" ? "titan-succes.png" : "titan-seance.png");

  const api = { SIZE, SAFE, SITE, TAGLINE, DEFAULTS, OPTION_LABELS, EVENTS, FACTS, LIMITS, clip, measured, options, dateText, session, achievement, availableOptions, fileName };
  /** @type {any} */ (root).TitanShareStory = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
