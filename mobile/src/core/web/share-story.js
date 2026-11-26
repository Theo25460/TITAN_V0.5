/* TITAN — story cards (« Partager »): what a 9:16 image of a session or a success shows, and where every element sits. The same
   rules and the same layout on the website and on Android (copied unchanged to mobile/src/core/web by scripts/sync-web-core.mjs):
   `layout()` returns a list of drawing operations on the 1080 × 1920 grid of the exported picture, and each client only draws them
   (js/app/story.js on a canvas, mobile/src/components/StoryCard.tsx with views and SVG). Pure: no DOM, no network, no storage.

   Three styles, chosen by the athlete: « Champ » (the flat colour field of the app, the route or the figure in its ink, the week
   under it), « Feuille » (a results sheet on the night ground) and « Carnet » (a ruled training notebook in chalk).

   The card is a picture the athlete chooses to send. It shows only values the client already displays, in plain units. The
   route is a shape: the client trims its first and last 300 m and hands over planar offsets, never coordinates, and no map is
   drawn under it. Never drawn: a place, an address, a note, a body signal (perceived effort, heart rate, pain, body weight), the
   time of day. The name is off until the athlete ticks it. Building a card changes nothing on the server. */
(function (root) {
  "use strict";

  const SIZE = { width: 1080, height: 1920 };
  /** Story apps lay their own interface over the picture (progress bar and account on top, reply field at the bottom). */
  const SAFE = { top: 250, bottom: 340, side: 96 };
  const SITE = "titan-app.fr";
  const TAGLINE = "Tous tes sports. Une seule progression.";

  const STYLES = ["champ", "feuille", "carnet"];
  const STYLE_LABELS = Object.freeze({ champ: "Champ", feuille: "Feuille", carnet: "Carnet" });
  /** The athlete's choices, and their defaults. The route is shown when there is one (the owner's decision of 26 November 2026). */
  const DEFAULTS = Object.freeze({ style: "champ", name: false, date: true, route: true, week: true });
  const OPTION_LABELS = Object.freeze({ route: "Afficher le tracé", week: "Afficher ma semaine", date: "Afficher la date", name: "Afficher mon nom" });
  const OPTION_HINTS = Object.freeze({ route: "Sans fond de carte ni coordonnées ; 300 m masqués au départ et à l’arrivée." });

  /** Product analytics of the flow (consent applies on each client). Never a sport, a value or a name: only `kind`. */
  const EVENTS = Object.freeze({ preview: "share_preview_opened", exported: "share_export_succeeded", failed: "share_export_failed", sheet: "share_sheet_opened" });

  /** The measures of a session (as `sessionMetrics` / `TitanMoment.metrics` label them) that may be drawn. « Ressenti » is a body
      signal and is never drawn; anything unknown is dropped rather than guessed. */
  const FACTS = ["Distance", "Durée", "Allure", "Vitesse", "Dénivelé", "Exercices", "Séries", "Volume", "Répétitions", "Meilleure", "Réussites", "Valeur"];
  /** The one big figure: what was covered, the hardest grade, the load moved, then the time. */
  const HERO = ["Score", "Distance", "Meilleure", "Volume", "Répétitions", "Durée", "Valeur", "Séries", "Exercices"];
  const LIMITS = { title: 48, label: 26, value: 18, detail: 72, name: 32, week: 16 };

  /* ---------- Text helpers ---------- */

  const CONTROL = new RegExp("[" + [[0, 31], [127, 159], [0x200b, 0x200f], [0x2028, 0x202e], [0x2066, 0x2069]].map(([a, b]) => String.fromCharCode(a) + "-" + String.fromCharCode(b)).join("") + "]", "g");

  /** One line of text, without control characters, cut at a word with an ellipsis when longer than `max` characters.
      @param {unknown} text @param {number} max @returns {string} */
  function clip(text, max) {
    const s = (typeof text === "string" || typeof text === "number" ? String(text) : "").replace(CONTROL, " ").replace(/\s+/g, " ").trim();
    if (s.length <= max) return s;
    const cut = s.slice(0, Math.max(1, max - 1));
    const space = cut.lastIndexOf(" ");
    return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:·–-]+$/, "")}…`;
  }

  /** A displayable measured value: a non-empty string that is not a placeholder for an unknown or zero value.
      @param {unknown} v @returns {boolean} */
  function measured(v) {
    if (typeof v !== "string" && typeof v !== "number") return false;
    const s = String(v).trim();
    return s !== "" && s !== "—" && s !== "-" && !/NaN|undefined|null|Infinity/.test(s) && !/^0(?:[,.]0+)?(?:\s|$)/.test(s);
  }

  /** @param {unknown} raw */
  function options(raw) {
    /** @type {any} */
    const o = raw && typeof raw === "object" ? raw : {};
    const flag = (/** @type {string} */ k) => (o[k] === undefined ? /** @type {any} */ (DEFAULTS)[k] : o[k] === true);
    return { style: STYLES.includes(o.style) ? o.style : DEFAULTS.style, name: o.name === true, date: flag("date"), route: flag("route"), week: flag("week") };
  }

  /** @param {unknown} date @param {"long" | "short"} [form] @returns {string | null} */
  function dateText(date, form = "long") {
    if (date === null || date === undefined || date === "") return null;
    const d = new Date(/** @type {any} */ (date));
    if (Number.isNaN(d.getTime())) return null;
    if (form === "short") return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
    const s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /** « 10,2 km » → number « 10,2 » and unit « km », so the unit can be set smaller. Only when a space separates a unit without
      digits (« 6b+ » or « 1 h 05 » stay whole). @param {string} value */
  function splitUnit(value) {
    const m = /^([+-]?[\d.,:]+(?:\s\d{3})*)\s+([^\d\s][^\d]{0,9})$/.exec(String(value).replace(/[  ]/g, " "));
    return m ? { number: m[1], unit: m[2] } : { number: String(value), unit: "" };
  }

  /* ---------- Sport-specific measures (every discipline of the catalogue) ---------- */

  /** Structured keys an entry form already shows through the client's own measures, and fields never drawn: body signals,
      self-ratings, places, people, free text. */
  const SKIP = new Set("attempts successful_routes routes grade_max max_done max_tried climbing_discipline grade_system location belay sets reps top_load volume working_sets rir exercise lift best_set distance elevation avg_speed avg_pace pool pool_length pace_100m".split(" "));
  const PRIVATE = /(^|_)(hr|bpm|heart|pulse|pain|weight|poids|bmi|calor|kcal|sleep|hrv|spo2|lat|lon|gps|location|address|place|spot|note|notes|comment|partner|opponent|coach|rpe|mood)(_|$)|score$|quality|intensity|difficulty|feeling/;
  const PAIRS = [["score_for", "score_against", "Score"], ["sets_won", "sets_lost", "Sets"], ["games_won", "games_lost", "Jeux"], ["points_for", "points_against", "Points"], ["wins", "losses", "Victoires – défaites"]];

  /** @param {number} n */
  const num = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10).replace(".", ","));

  /** Up to `max` [label, value] pairs from the discipline's own fields (catalogue `extraFields`) and the session's `extras`.
      @param {any} fields @param {any} values @param {number} [max] @returns {[string, string][]} */
  function extraFacts(fields, values, max = 4) {
    if (!Array.isArray(fields) || !values || typeof values !== "object") return [];
    /** @type {[string, string][]} */
    const out = [];
    const used = new Set();
    for (const [a, b, label] of PAIRS) {
      const x = Number(values[a]), y = Number(values[b]);
      if (values[a] !== undefined && values[b] !== undefined && values[a] !== "" && values[b] !== "" && Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0) {
        out.push([label, `${num(x)} – ${num(y)}`]);
        used.add(a); used.add(b);
      }
    }
    const list = fields.filter((f) => f && typeof f.id === "string" && !f.eliteOnly).slice().sort((p, q) => (p.priority || 99) - (q.priority || 99));
    for (const f of list) {
      if (out.length >= max) break;
      if (used.has(f.id) || SKIP.has(f.id) || PRIVATE.test(f.id) || f.unit === "bpm") continue;
      const v = values[f.id];
      if (v === undefined || v === null || v === "") continue;
      const label = clip(f.label, LIMITS.label);
      if (!label) continue;
      if (f.type === "number") {
        const n = Number(String(v).replace(",", "."));
        if (!Number.isFinite(n) || n <= 0) continue;
        const unit = typeof f.unit === "string" && f.unit && f.unit !== "points" ? f.unit : "";
        out.push([label, clip(unit ? `${num(n)}${unit === "%" ? " %" : ` ${unit}`}` : num(n), LIMITS.value)]);
      } else if (f.type === "select") {
        const opt = (Array.isArray(f.options) ? f.options : []).find((o) => (o && typeof o === "object" ? o.value : o) === v);
        const text = opt && typeof opt === "object" ? opt.label : opt;
        if (typeof text === "string" && text.trim()) out.push([label, clip(text, LIMITS.value)]);
      }
      used.add(f.id);
    }
    return out.slice(0, max);
  }

  /* ---------- Route shape ---------- */

  /** Planar offsets (x east, y north, any unit) of one or more segments → points in [0,1]×[0,1] keeping the shape's proportions,
      with `aspect` = width / height. At most 900 points. Null when there is nothing to draw.
      @param {any} route */
  function routeShape(route) {
    const segs = Array.isArray(route?.segs) ? route.segs : null;
    if (!segs) return null;
    const pts = segs.map((s) => (Array.isArray(s) ? s.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) : [])).filter((s) => s.length >= 2);
    const all = pts.flat();
    if (all.length < 2) return null;
    const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = maxX - minX, h = maxY - minY, span = Math.max(w, h);
    if (!(span > 0)) return null;
    const step = Math.max(1, Math.ceil(all.length / 900));
    const norm = pts.map((s) => s.filter((_, i) => i % step === 0 || i === s.length - 1).map((p) => [Math.round(((p[0] - minX) / span) * 10000) / 10000, Math.round(((maxY - p[1]) / span) * 10000) / 10000]));
    return { aspect: w / Math.max(h, span * 0.05), width: w / span, height: h / span, segs: norm };
  }

  /* ---------- Week (TitanProgram.week, reduced to what the card draws) ---------- */

  const FAMILY_COLORS = { endurance: "#3DD9E8", force: "#7C93FF", technique: "#B693FF", jeu: "#57D39B", mobilite: "#8EA2B3" };
  /** @param {any} week */
  function weekGrid(week) {
    if (!week || !Array.isArray(week.rows) || !week.rows.length) return null;
    const rows = week.rows.slice(0, 3).map((/** @type {any} */ r) => ({
      label: clip(r.label, LIMITS.week),
      color: /** @type {any} */ (FAMILY_COLORS)[r.family] || FAMILY_COLORS.endurance,
      cells: Array.from({ length: 7 }, (_, i) => Math.max(0, Math.min(4, Math.round(Number(Array.isArray(r.cells) ? (r.cells[i] && typeof r.cells[i] === "object" ? r.cells[i].level : r.cells[i]) : 0) || 0)))),
    })).filter((/** @type {any} */ r) => r.label && r.cells.some((/** @type {number} */ c) => c > 0));
    if (!rows.length) return null;
    const mark = Number.isInteger(week.mark) && week.mark >= 0 && week.mark < 7 ? week.mark : -1;
    return { letters: ["L", "M", "M", "J", "V", "S", "D"], rows, mark, markRow: Number.isInteger(week.markRow) ? week.markRow : -1 };
  }

  /* ---------- Content ---------- */

  /** @param {any} o @param {{ name: boolean, date: boolean }} opt */
  const common = (o, opt) => ({
    date: opt.date ? dateText(o.date) : null,
    dateShort: opt.date ? dateText(o.date, "short") : null,
    name: opt.name ? clip(o.name, LIMITS.name) || null : null,
    url: SITE,
    tagline: TAGLINE,
  });

  /** The card of one session.
      input: { sport, sportId?, family?, metrics: [label, value][] (the client's own list), extras?: { fields, values } (the
      discipline's catalogue fields and the session's values), record?: { label, value, previous? } (a record this session set),
      route?: { segs } (planar offsets, ends already trimmed), week?: (TitanProgram.week reduced: rows of { label, family, cells }
      and `mark`, the day of this session), date, name, historical? }.
      @param {any} input @param {unknown} [rawOptions] */
  function session(input, rawOptions) {
    /** @type {any} */
    const o = input && typeof input === "object" ? input : {};
    const opt = options(rawOptions);
    /** @type {[string, string][]} */
    const metrics = (Array.isArray(o.metrics) ? o.metrics : [])
      .filter((/** @type {unknown} */ m) => Array.isArray(m) && FACTS.includes(m[0]) && measured(m[1]))
      .map((/** @type {[string, unknown]} */ m) => [m[0], clip(m[1], LIMITS.value)]);
    const extras = extraFacts(o.extras?.fields, o.extras?.values);
    /** @type {[string, string][]} */
    const all = [...metrics, ...extras].filter(([k], i, a) => a.findIndex(([j]) => j === k) === i);
    const lead = HERO.map((k) => all.find(([j]) => j === k)).find(Boolean) || all[0];
    const facts = all.filter((m) => m !== lead).slice(0, 6);
    const rec = o.record && measured(o.record.value) && clip(o.record.label, LIMITS.label) ? o.record : null;
    const route = opt.route ? routeShape(o.route) : null;
    return {
      kind: "session",
      tone: rec ? "amber" : "lime",
      eyebrow: rec ? "Nouveau record" : "Séance",
      title: clip(o.sport, LIMITS.title) || "Séance",
      sportId: typeof o.sportId === "string" ? o.sportId : null,
      hero: lead ? { value: lead[1], label: lead[0], ...splitUnit(lead[1]) } : null,
      facts,
      record: rec ? { label: clip(rec.label, LIMITS.label), value: clip(rec.value, LIMITS.value), previous: measured(rec.previous) ? clip(rec.previous, LIMITS.value) : null } : null,
      progress: null,
      route,
      week: opt.week ? weekGrid(o.week) : null,
      historical: Boolean(o.historical),
      ...common(o, opt),
    };
  }

  /** The card of a success: a personal record or a milestone.
      input: { type: "record" | "milestone", title, value, label?, sport?, sportId?, previous?, progress?, date, name }.
      @param {any} input @param {unknown} [rawOptions] */
  function achievement(input, rawOptions) {
    /** @type {any} */
    const o = input && typeof input === "object" ? input : {};
    const opt = options(rawOptions);
    const type = o.type === "record" ? "record" : "milestone";
    const value = measured(o.value) ? clip(o.value, LIMITS.value) : null;
    const sport = clip(o.sport, LIMITS.title);
    const progress = measured(o.previous) ? `avant : ${clip(o.previous, LIMITS.value)}` : type === "record" && o.previous === null ? "Premier repère" : clip(o.progress, LIMITS.detail) || null;
    return {
      kind: "achievement",
      tone: type === "record" ? "amber" : "cyan",
      eyebrow: type === "record" ? (sport ? `Record personnel · ${sport}` : "Record personnel") : "Jalon atteint",
      title: clip(o.title, LIMITS.title) || (type === "record" ? "Record personnel" : "Jalon"),
      sportId: typeof o.sportId === "string" ? o.sportId : null,
      hero: value ? { value, label: clip(o.label, LIMITS.label) || "", ...splitUnit(value) } : null,
      facts: [],
      record: null,
      progress,
      route: null,
      week: null,
      historical: false,
      ...common(o, opt),
    };
  }

  /** The choices that make sense for an input and a style: the route needs a route, the week a week, the name a name.
      @param {any} input @param {string} [style] @returns {("route" | "week" | "date" | "name")[]} */
  function availableOptions(input, style = DEFAULTS.style) {
    /** @type {any} */
    const o = input && typeof input === "object" ? input : {};
    /** @type {("route" | "week" | "date" | "name")[]} */
    const out = [];
    if (routeShape(o.route)) out.push("route");
    if ((style === "champ" || style === "feuille") && weekGrid(o.week)) out.push("week");
    if (dateText(o.date)) out.push("date");
    if (clip(o.name, LIMITS.name)) out.push("name");
    return out;
  }

  /** The file name of the export: no date, no name, no sport. @param {string} kind */
  const fileName = (kind) => (kind === "achievement" ? "titan-succes.png" : "titan-seance.png");

  /* ---------- Layout ---------- */

  /* Advance widths of Archivo (per 100 px) in the six cuts the card uses, measured on css/fonts/archivo-latin-variable.woff2
     (display = width 75 weight 800, figure = width 62 weight 300, figureBold = 62/700, text/semi/bold = 100/400/600/700; the
     Android instances of tools/fonts/build-archivo-instances.py are the same cuts). Both clients wrap and fit text from these
     figures, so a line breaks at the same word on the phone and on the website. */
  const CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ éèàçêâ’'.,:;!?-–·/+%()«»…";
  const ADV = {
    display: "49,45,49,49,49,49,49,46,49,49,49,49,47,49,48,29,48,49,24,24,49,24,73,49,49,49,49,32,45,30,49,45,68,48,44,42,58,57,59,59,54,48,63,60,27,50,59,48,76,60,63,55,63,58,54,53,59,56,80,57,57,54,14,48,48,49,47,48,49,22,22,25,25,26,26,28,48,27,37,25,28,56,80,37,37,50,50,75",
    figure: "38,34,39,39,36,40,38,34,37,38,38,38,36,38,38,20,35,37,17,17,34,17,57,37,38,38,38,22,32,19,37,29,48,33,29,33,42,45,48,49,43,38,51,49,19,35,45,36,59,49,52,44,52,47,42,41,48,43,64,45,48,43,13,38,38,38,36,38,38,18,16,19,19,22,22,24,37,24,31,21,25,46,61,30,30,37,37,56",
    figureBold: "42,36,41,42,40,42,42,37,41,42,41,41,39,41,41,25,39,41,20,20,41,20,61,41,41,41,41,26,36,24,41,36,56,39,36,36,48,47,50,50,45,39,53,50,23,41,50,40,66,50,54,47,54,49,45,45,49,46,69,48,48,46,12,41,41,41,39,41,41,19,19,21,21,22,22,25,40,24,31,21,27,50,68,35,35,43,43,62",
    text: "57,52,57,57,55,57,57,55,57,57,54,57,52,57,55,28,56,56,22,22,51,22,86,56,57,57,57,33,51,30,56,50,72,51,50,50,68,70,73,73,68,61,80,74,27,56,66,54,85,74,79,66,79,73,67,61,73,65,92,68,65,63,21,55,55,54,52,55,54,24,21,28,28,30,30,27,58,33,50,33,29,62,95,35,35,55,55,84",
    semi: "57,58,58,58,58,57,58,58,58,57,56,59,55,59,56,31,59,58,25,25,54,25,86,58,60,59,59,36,54,31,58,53,76,55,53,51,71,71,72,73,67,61,79,73,28,58,69,57,84,73,78,67,78,72,67,62,72,67,95,69,68,63,20,56,56,56,55,56,56,28,25,30,30,34,34,29,61,33,50,33,30,64,97,36,36,57,57,96",
    bold: "59,60,60,60,60,59,60,60,60,59,58,61,57,61,58,32,61,60,27,26,57,27,89,60,61,61,61,38,56,34,60,55,80,57,55,52,72,72,73,74,68,62,80,75,30,60,72,59,87,75,79,68,79,73,68,64,75,69,96,71,70,65,20,58,58,58,57,58,58,28,25,31,31,33,33,30,61,33,50,33,30,64,97,36,36,58,58,97",
  };
  /** @type {Record<string, Record<string, number>>} */
  const WIDTHS = {};
  for (const [font, list] of Object.entries(ADV)) {
    const values = list.split(",").map(Number);
    WIDTHS[font] = {};
    [...CHARS].forEach((c, i) => { WIDTHS[font][c] = (values[i] ?? 50) / 100; });
  }
  /** Estimated width in px of `text` in `font` at `size` (2 % margin so a line never ends exactly on the edge).
      @param {string} text @param {string} font @param {number} size @param {number} [tracking] */
  function measure(text, font, size, tracking = 0) {
    const table = WIDTHS[font] || WIDTHS.text;
    let w = 0;
    for (const c of String(text)) w += table[c] ?? table[c.toLowerCase()] ?? (/\s/.test(c) ? table[" "] : 0.55);
    return (w * size + tracking * Math.max(0, [...String(text)].length - 1)) * 1.02;
  }
  /** The largest size from `size` down to `min` (steps of 2) at which `text` fits `room`. */
  function fit(/** @type {string} */ text, /** @type {string} */ font, /** @type {number} */ size, /** @type {number} */ room, min = size * 0.5, tracking = 0) {
    let s = size;
    while (s > min && measure(text, font, s, tracking) > room) s -= 2;
    return s;
  }
  /** Breaks `text` into at most `max` lines of `room` px; the last line ends with an ellipsis when the text is longer. */
  function wrap(/** @type {string} */ text, /** @type {string} */ font, /** @type {number} */ size, /** @type {number} */ room, /** @type {number} */ max) {
    const words = String(text).split(" ").filter(Boolean);
    /** @type {string[]} */
    const lines = [];
    let line = "";
    for (let i = 0; i < words.length; i++) {
      const test = line ? `${line} ${words[i]}` : words[i];
      if (!line || measure(test, font, size) <= room) { line = test; continue; }
      lines.push(line);
      line = words[i];
      if (lines.length === max) { line = ""; lines[max - 1] = ellipsize(`${lines[max - 1]} ${words.slice(i).join(" ")}`, font, size, room); break; }
    }
    if (line) lines.push(line);
    return lines.map((l) => (measure(l, font, size) > room ? ellipsize(l, font, size, room) : l));
  }
  function ellipsize(/** @type {string} */ text, /** @type {string} */ font, /** @type {number} */ size, /** @type {number} */ room) {
    let t = text;
    while (t.length > 1 && measure(`${t}…`, font, size) > room) t = t.slice(0, -1);
    return t === text ? t : `${t.replace(/[\s,.;:·–-]+$/, "")}…`;
  }

  /** The glyph of the discipline from the shared catalogue (js/core/sports.js), a trophy for a record, a flag for a milestone. */
  function iconName(/** @type {any} */ model) {
    if (model.sportId) {
      try {
        const id = /** @type {any} */ (root).TitanSports?.iconOf?.(model.sportId);
        if (typeof id === "string" && id) return id;
      } catch {}
    }
    return model.kind === "achievement" ? (model.tone === "amber" ? "trophy" : "flag") : "bolt";
  }

  const C = {
    ground: "#090C10", panel: "#131920", chalk: "#E9EDE8", chalkInk: "#0E1216", tx: "#F1F3EF", tx2: "#AEB7BD", tx3: "#838E97",
    line: "rgba(226,234,236,0.17)", lime: "#D7F25A", limeInk: "#161C00", amber: "#F4BB54", amberInk: "#1D1302", cyan: "#3DD9E8", cyanInk: "#02181B",
  };
  const TONES = { lime: [C.lime, C.limeInk], amber: [C.amber, C.amberInk], cyan: [C.cyan, C.cyanInk] };
  /** A colour of the ink at a strength (text on a colour is its ink at 100 % or about 80 %, never grey). */
  const alpha = (/** @type {string} */ hex, /** @type {number} */ a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

  /** Operations: fill, rect (opt. `cut` = 45° lower-right corner, `opacity`, `stroke` and `dash`), line, text (one line in a box:
      x, y = top, w, lh; `size` already fitted; `align`), route (polylines in px), mark (the TITAN mark), icon (a glyph of the
      shared icon set), relief (the brand's contour lines, inked in `color`, clipped to the box). */
  function layout(/** @type {any} */ model, /** @type {unknown} */ style) {
    const s = STYLES.includes(/** @type {string} */ (style)) ? /** @type {string} */ (style) : DEFAULTS.style;
    /** @type {any[]} */
    const ops = [];
    const L = SAFE.side, W = SIZE.width - SAFE.side * 2, R = L + W, TOP = SAFE.top, BOTTOM = SIZE.height - SAFE.bottom;
    /** One line of text at a fitted size; returns the op. */
    const text = (/** @type {any} */ o) => {
      const size = o.fit === false ? o.size : fit(o.text, o.font, o.size, o.w, o.min ?? o.size * 0.6, o.tracking || 0);
      const op = { t: "text", align: "left", tracking: 0, lh: Math.round(size * 1.15), ...o, size, text: measure(o.text, o.font, size, o.tracking || 0) > o.w ? ellipsize(o.text, o.font, size, o.w) : o.text };
      delete op.fit; delete op.min;
      ops.push(op);
      return op;
    };
    /** The mark and the word TITAN; returns its width. */
    const brand = (/** @type {number} */ x, /** @type {number} */ y, /** @type {string} */ ink, /** @type {string} */ markBg, /** @type {string} */ markFg) => {
      ops.push({ t: "mark", x, y, size: 64, bg: markBg, fg: markFg });
      text({ x: x + 84, y: y + 6, w: 260, text: "TITAN", font: "display", size: 46, lh: 52, color: ink, tracking: 6, fit: false });
      return 84 + measure("TITAN", "display", 46, 6);
    };
    /** The route shape fitted (centred, proportions kept) into a box. */
    const route = (/** @type {any} */ shape, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w, /** @type {number} */ h, /** @type {string} */ color, /** @type {number} */ width, align = "center") => {
      const k = Math.min(w / Math.max(shape.width, 0.001), h / Math.max(shape.height, 0.001));
      const dx = align === "right" ? x + w - shape.width * k : x + (w - shape.width * k) / 2, dy = y + (h - shape.height * k) / 2;
      ops.push({ t: "route", color, width, segs: shape.segs.map((/** @type {number[][]} */ seg) => seg.map(([px, py]) => [Math.round((dx + px * k) * 10) / 10, Math.round((dy + py * k) * 10) / 10])) });
    };
    const footerLeft = model.name || model.tagline;
    /** « Ma semaine »: the week of the session as TITAN's programme draws it, the session's day framed in `accent`. */
    const WEEK_ROW = 52, WEEK_GAP = 10;
    const weekHeight = (/** @type {any} */ wk) => 34 + 12 + wk.rows.length * (WEEK_ROW + WEEK_GAP) - WEEK_GAP;
    const drawWeek = (/** @type {any} */ wk, /** @type {number} */ y, /** @type {string} */ accent) => {
      const labelW = 230, cell = (W - labelW - WEEK_GAP * 7) / 7;
      text({ x: L, y, w: labelW, text: "Ma semaine", font: "semi", size: 26, lh: 34, color: C.tx3, fit: false });
      wk.letters.forEach((/** @type {string} */ d, /** @type {number} */ i) => text({ x: L + labelW + WEEK_GAP + i * (cell + WEEK_GAP), y, w: cell, text: d, font: "bold", size: 24, lh: 34, color: i === wk.mark ? accent : C.tx3, align: "center", fit: false }));
      wk.rows.forEach((/** @type {any} */ r, /** @type {number} */ j) => {
        const ry = y + 46 + j * (WEEK_ROW + WEEK_GAP);
        text({ x: L, y: ry + 10, w: labelW - 16, text: r.label, font: "semi", size: 26, lh: 32, color: C.tx2, min: 20 });
        r.cells.forEach((/** @type {number} */ lv, /** @type {number} */ i) => {
          const cx = L + labelW + WEEK_GAP + i * (cell + WEEK_GAP);
          if (lv > 0) ops.push({ t: "rect", x: cx, y: ry, w: cell, h: WEEK_ROW, color: r.color, opacity: [0, 0.34, 0.56, 0.78, 1][lv], radius: 4 });
          else ops.push({ t: "rect", x: cx + cell / 2 - 3, y: ry + WEEK_ROW / 2 - 3, w: 6, h: 6, color: C.line, radius: 3 });
          if (i === wk.mark && j === wk.markRow) ops.push({ t: "rect", x: cx - 6, y: ry - 6, w: cell + 12, h: WEEK_ROW + 12, color: "transparent", stroke: accent, strokeWidth: 4, radius: 6 });
        });
      });
    };

    if (s === "champ") {
      const [field, ink] = /** @type {any} */ (TONES)[model.tone] || TONES.lime;
      const soft = alpha(ink, 0.8);
      // Ground first, bottom-up: footer, week, record, facts. The field takes the rest of the height.
      /** @type {{ h: number, draw: (y: number) => void }[]} */
      const ground = [];
      if (model.facts.length) {
        const facts = model.facts.slice(0, 3);
        const col = (W - 48 * (facts.length - 1)) / facts.length;
        ground.push({ h: 34 + 8 + 74, draw: (y) => facts.forEach(([k, v], i) => {
          const x = L + i * (col + 48);
          text({ x, y, w: col, text: k, font: "semi", size: 28, lh: 34, color: C.tx3, min: 22 });
          text({ x, y: y + 42, w: col, text: v, font: "figureBold", size: 64, lh: 74, color: C.tx, min: 40 });
        }) });
      }
      if (model.record) {
        const r = model.record;
        ground.push({ h: 64, draw: (y) => {
          ops.push({ t: "line", x1: L, y1: y, x2: R, y2: y, color: C.line, width: 2 });
          const label = text({ x: L, y: y + 18, w: W * 0.5, text: `Record · ${r.label}`, font: "bold", size: 32, lh: 40, color: C.amber, min: 24 });
          const lw = measure(label.text, "bold", label.size) + 24;
          text({ x: L + lw, y: y + 14, w: W - lw, text: r.previous ? `${r.value}  ·  avant ${r.previous}` : r.value, font: "figureBold", size: 44, lh: 48, color: C.amber, align: "right", min: 28 });
        } });
      }
      if (model.kind === "achievement" && model.progress) {
        const p = wrap(model.progress, "semi", 40, W, 2);
        ground.unshift({ h: p.length * 50, draw: (y) => p.forEach((l, i) => text({ x: L, y: y + i * 50, w: W, text: l, font: "semi", size: 40, lh: 50, color: C.tx, fit: false })) });
      }
      /** @type {any} */
      let week = model.week;
      if (week) ground.push({ h: weekHeight(week), draw: (y) => drawWeek(week, y, field), week: true });
      const footerH = 40 + 44;
      const gap = 52;
      let groundH = ground.reduce((n, g) => n + g.h, 0) + gap * ground.length;
      // A field that keeps room for the route or the figure: the week goes first when space is short.
      const minField = model.route ? 880 : 660;
      const tooTall = () => TOP + minField > BOTTOM - footerH - groundH;
      const last = ground[ground.length - 1];
      if (week && tooTall() && last && /** @type {any} */ (last).week && week.rows.length > 1 && week.rows[week.markRow]) {
        // First keep only the line of this session's sport, then give the week up altogether.
        week = { ...week, rows: [week.rows[week.markRow]], markRow: 0 };
        last.h = weekHeight(week);
        groundH = ground.reduce((n, g) => n + g.h, 0) + gap * ground.length;
      }
      if (week && tooTall() && last && /** @type {any} */ (last).week) {
        ground.pop();
        groundH = ground.reduce((n, g) => n + g.h, 0) + gap * ground.length;
      }
      const fieldBottom = Math.min(BOTTOM - footerH - groundH - 12, 1460);
      ops.push({ t: "fill", color: C.ground });
      ops.push({ t: "rect", x: 0, y: 0, w: SIZE.width, h: fieldBottom, color: field, cut: 120 });
      ops.push({ t: "relief", x: 300, y: -140, w: 980, h: 735, color: ink, opacity: model.route ? 0.5 : 1, clip: { x: 0, y: 0, w: SIZE.width, h: Math.min(fieldBottom, 760) } });
      brand(L, TOP, ink, ink, field);
      if (model.date) text({ x: L + 420, y: TOP + 14, w: W - 420, text: model.date, font: "semi", size: 30, lh: 36, color: soft, align: "right", min: 22 });
      // The figure sits on the lower edge of the field, the name of the discipline above it, the route above both.
      let y = fieldBottom - 72;
      if (model.hero) {
        const unitSize = (/** @type {number} */ n) => Math.round(n * 0.4);
        let size = model.route ? 250 : 330;
        const room = W - 24;
        while (size > 120 && measure(model.hero.number, "figure", size) + (model.hero.unit ? 10 + measure(model.hero.unit, "figure", unitSize(size)) : 0) > room) size -= 4;
        y -= size * 0.86;
        const nw = measure(model.hero.number, "figure", size);
        text({ x: L - 8, y, w: nw + 8, text: model.hero.number, font: "figure", size, lh: Math.round(size * 0.9), color: ink, tracking: -3, fit: false });
        if (model.hero.unit) text({ x: L + nw + 6, y: y + size * 0.9 - unitSize(size) * 1.2, w: W - nw - 6, text: model.hero.unit, font: "figure", size: unitSize(size), lh: Math.round(unitSize(size) * 1.1), color: ink, fit: false });
        const label = model.kind === "achievement" ? model.hero.label : model.hero.unit && ["Distance", "Durée"].includes(model.hero.label) ? "" : model.hero.label;
        if (label) {
          text({ x: L, y: y - 52, w: W, text: label, font: "semi", size: 30, lh: 36, color: soft, fit: false });
          y -= 52;
        }
        y -= 28;
      }
      const titleSize = 84;
      const lines = wrap(model.title, "display", titleSize, W - 92, model.kind === "achievement" ? 3 : 2);
      y -= lines.length * Math.round(titleSize * 1.02);
      const titleTop = y;
      lines.forEach((l, i) => text({ x: L + 92, y: titleTop + i * Math.round(titleSize * 1.02), w: W - 92, text: l, font: "display", size: titleSize, lh: Math.round(titleSize * 1.02), color: ink, min: 56 }));
      ops.push({ t: "icon", name: iconName(model), x: L, y: titleTop + 10, size: 72, color: ink });
      if (model.kind === "achievement" || model.eyebrow === "Nouveau record") text({ x: L, y: titleTop - 50, w: W, text: model.eyebrow, font: "bold", size: 30, lh: 36, color: soft, fit: false });
      if (model.route) {
        const top = TOP + 120, bottom = titleTop - (model.eyebrow === "Nouveau record" ? 90 : 56);
        if (bottom - top > 160) route(model.route, L, top, W, bottom - top, ink, 9);
      }
      let gy = fieldBottom + gap;
      for (const g of ground) { g.draw(gy); gy += g.h + gap; }
      text({ x: L, y: BOTTOM - 40, w: W * 0.6, text: footerLeft, font: model.name ? "bold" : "semi", size: 28, lh: 36, color: C.tx2, min: 22 });
      text({ x: L + W * 0.6, y: BOTTOM - 40, w: W * 0.4, text: model.url, font: "semi", size: 30, lh: 36, color: field, align: "right", fit: false });
    } else if (s === "feuille") {
      const accent = model.tone === "amber" ? C.amber : model.tone === "cyan" ? C.cyan : C.lime;
      ops.push({ t: "fill", color: C.ground });
      brand(L, TOP, C.tx, "#05070a", C.cyan);
      text({ x: L + 380, y: TOP + 14, w: W - 380, text: [model.kind === "achievement" ? (model.tone === "amber" ? "Feuille de record" : "Jalon") : "Feuille de séance", model.dateShort].filter(Boolean).join(" · "), font: "semi", size: 28, lh: 36, color: C.tx2, align: "right", min: 22 });
      ops.push({ t: "rect", x: L, y: TOP + 92, w: W, h: 3, color: C.tx });
      let y = TOP + 128;
      if (model.kind === "achievement") { text({ x: L, y, w: W, text: model.eyebrow, font: "bold", size: 30, lh: 38, color: accent, min: 22 }); y += 52; }
      const titleSize = fit(model.title.split(" ").sort((a, b) => b.length - a.length)[0] || "", "display", 150, W, 96);
      const tl = wrap(model.title, "display", titleSize, W, 2);
      const step = Math.round(titleSize * 0.96);
      tl.forEach((l, i) => text({ x: L, y: y + i * step, w: W, text: l, font: "display", size: titleSize, lh: step, color: C.tx, min: 70 }));
      y += tl.length * step + 44;
      // Rows of the sheet: the figure first, then the measures, then the record. They stop before the footer, never over it.
      /** @type {{ label: string, value: string, size: number, font: string, color: string, detail?: string | null }[]} */
      const rows = [];
      if (model.hero) rows.push({ label: model.hero.label || (model.kind === "achievement" ? (model.tone === "amber" ? "Record" : "Atteint") : "Mesure"), value: model.hero.value, size: 104, font: "figure", color: model.kind === "achievement" ? accent : C.tx });
      for (const [k, v] of model.facts) rows.push({ label: k, value: v, size: 58, font: "figureBold", color: C.tx });
      if (model.record) rows.push({ label: `Record · ${model.record.label}`, value: model.record.value, size: 58, font: "figureBold", color: C.amber, detail: model.record.previous ? `avant ${model.record.previous}` : null });
      const rowH = (/** @type {any} */ r) => Math.round(r.size * 1.05) + 28 + (r.detail ? 44 : 0);
      const footer = BOTTOM - 40;
      const tableH = rows.reduce((n, r) => n + rowH(r), 0);
      const routeH = model.route ? Math.min(460, footer - 48 - tableH - y - 40) : 0;
      if (model.route && routeH >= 220) {
        ops.push({ t: "rect", x: L, y, w: W, h: routeH, color: C.panel, cut: 40 });
        route(model.route, L + 48, y + 40, W - 96, routeH - 80, accent, 7);
        y += routeH + 32;
      }
      for (const r of rows) {
        const h = rowH(r);
        if (y + h > footer - 32) break;
        const valueW = Math.min(W * 0.72, measure(r.value, r.font, r.size) + 4);
        const label = text({ x: L, y: y + 10 + Math.round(r.size * 1.05) - 44, w: W - valueW - 24, text: r.label, font: "semi", size: 32, lh: 40, color: r.color === C.amber ? C.amber : C.tx2, min: 22 });
        void label;
        text({ x: R - valueW, y: y + 10, w: valueW, text: r.value, font: r.font, size: r.size, lh: Math.round(r.size * 1.05), color: r.color, align: "right", min: r.size * 0.6 });
        if (r.detail) text({ x: L, y: y + h - 14 - 32, w: W, text: r.detail, font: "semi", size: 26, lh: 32, color: C.tx3, align: "right", fit: false });
        ops.push({ t: "line", x1: L, y1: y + h, x2: R, y2: y + h, color: C.line, width: 2 });
        y += h;
      }
      if (model.progress) {
        const p = wrap(model.progress, "semi", 40, W, 3);
        p.forEach((l, i) => text({ x: L, y: y + 32 + i * 52, w: W, text: l, font: "semi", size: 40, lh: 52, color: C.tx, fit: false }));
        y += 32 + p.length * 52;
      }
      if (model.week && footer - 48 - y >= weekHeight(model.week) + 40) drawWeek(model.week, y + 56, accent);
      text({ x: L, y: footer, w: W * 0.62, text: footerLeft, font: model.name ? "bold" : "semi", size: 28, lh: 36, color: C.tx2, min: 22 });
      text({ x: L + W * 0.62, y: footer, w: W * 0.38, text: model.url, font: "semi", size: 30, lh: 36, color: accent, align: "right", fit: false });
    } else {
      // Carnet: a chalk page ruled every 80 px with a margin; text sits on the rules.
      const ink = C.chalkInk, soft = alpha(C.chalkInk, 0.72), pitch = 80, left = 186, room = R - left;
      ops.push({ t: "fill", color: C.chalk });
      for (let ry = pitch; ry < SIZE.height; ry += pitch) ops.push({ t: "line", x1: 0, y1: ry, x2: SIZE.width, y2: ry, color: alpha(ink, 0.1), width: 2 });
      ops.push({ t: "line", x1: 150, y1: 0, x2: 150, y2: SIZE.height, color: alpha(ink, 0.28), width: 3 });
      const on = (/** @type {number} */ rule, /** @type {number} */ size) => rule * pitch - Math.round(size * 1.02) + Math.round(size * 0.2);
      let rule = 4; // first written rule: y = 320
      text({ x: left, y: on(rule, 32), w: room * 0.6, text: model.date || (model.kind === "achievement" ? model.eyebrow : "Séance"), font: "bold", size: 32, lh: Math.round(32 * 1.02), color: soft, min: 24 });
      if (model.name) text({ x: left + room * 0.6, y: on(rule, 32), w: room * 0.4, text: model.name, font: "bold", size: 32, lh: Math.round(32 * 1.02), color: soft, align: "right", min: 22 });
      rule += 2;
      // One line of title fills a rule and a half at 112 px; two lines are set at 74 px, one per rule.
      const big = wrap(model.title, "display", 112, room, 1);
      const titleSize = big.length === 1 && !big[0].endsWith("…") ? 112 : 74;
      const tl = titleSize === 112 ? big : wrap(model.title, "display", 74, room, 2);
      ops.push({ t: "icon", name: iconName(model), x: 52, y: on(rule, titleSize) + titleSize * 0.22, size: 72, color: ink });
      tl.forEach((l, i) => { text({ x: left, y: on(rule, titleSize), w: room, text: l, font: "display", size: titleSize, lh: Math.round(titleSize * 1.02), color: ink, min: 56 }); if (i < tl.length - 1) rule += 1; });
      rule += 1;
      if (model.kind === "achievement" && model.eyebrow) { text({ x: left, y: on(rule, 30), w: room, text: model.eyebrow, font: "bold", size: 30, lh: 31, color: soft, min: 22 }); rule += 1; }
      // Lines left for the route, the figure, the measures, the record, above the footer rule (BOTTOM).
      const lastRule = Math.floor(BOTTOM / pitch) - 1;
      const rest = (model.hero ? 2 : 0) + Math.min(model.facts.length, 4) + (model.record ? 1 : 0) + (model.progress ? 1 : 0);
      const routeRules = model.route ? Math.min(6, lastRule - rule - rest - 1) : 0;
      if (model.route && routeRules >= 3) {
        route(model.route, left, rule * pitch + 20, room, routeRules * pitch - 40, ink, 6);
        rule += routeRules;
      }
      rule += 1;
      if (model.hero) {
        rule += 1;
        const size = fit(model.hero.value, "figure", 176, room, 100);
        text({ x: left - 6, y: on(rule, size) + 10, w: room, text: model.hero.value, font: "figure", size, lh: Math.round(size * 1.02), color: ink, tracking: -2, fit: false });
        if (model.hero.label) text({ x: left, y: on(rule + 1, 30), w: room, text: model.hero.label, font: "semi", size: 30, lh: 31, color: soft, fit: false });
        rule += 2;
      }
      for (const [k, v] of model.facts.slice(0, 4)) {
        if (rule > lastRule - (model.record ? 2 : 1)) break;
        text({ x: left, y: on(rule, 40), w: 330, text: k, font: "text", size: 40, lh: 41, color: soft, min: 26 });
        text({ x: left + 340, y: on(rule, 52), w: room - 340, text: v, font: "figureBold", size: 52, lh: 53, color: ink, min: 34 });
        rule += 1;
      }
      if (model.record && rule <= lastRule - 1) {
        const r = model.record;
        const line = `Record · ${r.label} — ${r.value}${r.previous ? ` (avant ${r.previous})` : ""}`;
        const size = fit(line, "semi", 40, room - 32, 26);
        ops.push({ t: "rect", x: left - 14, y: rule * pitch - 50, w: Math.min(room + 14, measure(line, "semi", size) + 32), h: 60, color: C.amber, radius: 4 });
        text({ x: left, y: on(rule, size) - 2, w: room - 16, text: line, font: "semi", size, lh: Math.round(size * 1.02), color: C.amberInk, fit: false });
        rule += 1;
      }
      if (model.progress && rule <= lastRule - 1) {
        text({ x: left, y: on(rule, 40), w: room, text: model.progress, font: "text", size: 40, lh: 41, color: ink, min: 26 });
      }
      const fy = (lastRule + 1) * pitch;
      ops.push({ t: "mark", x: left, y: fy - 64 - 8, size: 56, bg: ink, fg: C.chalk });
      text({ x: left + 74, y: fy - 64, w: 220, text: "TITAN", font: "display", size: 42, lh: 48, color: ink, tracking: 6, fit: false });
      text({ x: left + 300, y: fy - 58, w: room - 300, text: model.url, font: "semi", size: 30, lh: 36, color: ink, align: "right", fit: false });
    }
    return { width: SIZE.width, height: SIZE.height, style: s, ops };
  }

  const api = { SIZE, SAFE, SITE, TAGLINE, STYLES, STYLE_LABELS, DEFAULTS, OPTION_LABELS, OPTION_HINTS, EVENTS, FACTS, LIMITS, clip, measured, options, dateText, splitUnit, extraFacts, routeShape, weekGrid, session, achievement, availableOptions, fileName, layout, measure, wrap };
  /** @type {any} */ (root).TitanShareStory = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
