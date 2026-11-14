/* TITAN heraldry for the website: the seven rank crests (Éclaireur → Légende) and the chapter beacon, exactly like the Android
   application's (mobile/src/components/Crest.tsx) so the two products share one identity. A rank whose sculpted badge was approved
   (design/titan-visual-library/global-v2/approved) is shown as that image, from /assets/ranks; the others keep the vector crest drawn
   here until theirs is approved. Purely visual: a crest is earned by the rank the server confirms. */
(function () {
  "use strict";
  var RANKS = ["eclaireur", "explorateur", "sentinelle", "gardien", "champion", "titan", "legende"];
  var ACCENT = { eclaireur: "#8EA2B3", explorateur: "#7FCBD6", sentinelle: "#3DD9E8", gardien: "#8CEAF2", champion: "#F4BB54", titan: "#F7C96B", legende: "#FFE7A8" };
  var CHEVRONS = { eclaireur: 1, explorateur: 2, sentinelle: 2, gardien: 3, champion: 3, titan: 3, legende: 3 };
  var SHIELD = "M60 14 L100 26 V64 C100 94 82 116 60 128 C38 116 20 94 20 64 V26 Z";
  var INNER = "M60 23 L92 33 V64 C92 89 77 107 60 117 C43 107 28 89 28 64 V33 Z";
  /* Approved sculpted badges, by rank id. Add an id here (and its two files in /assets/ranks) once its badge is approved. */
  var BADGES = ["eclaireur", "explorateur", "sentinelle", "gardien"];
  var seq = 0;

  function rankName(id) {
    var ranks = (window.TitanEffort && window.TitanEffort.RANKS) || [];
    for (var i = 0; i < ranks.length; i++) if (ranks[i].id === id && ranks[i].name) return ranks[i].name;
    return id;
  }

  /** The approved badge of a rank as an image, `size` px wide: the square file holds the whole badge, transparent around it. */
  function badge(id, size) {
    var base = "/assets/ranks/" + id;
    return '<img class="crest crest-badge" src="' + base + '-256.webp" srcset="' + base + "-256.webp 256w, " + base + '-512.webp 512w" sizes="' + size + 'px" width="' + size + '" height="' + size +
      '" alt="Blason ' + rankName(id) + '" decoding="async" draggable="false">';
  }

  function rankIdOf(level) {
    var ranks = window.TitanEffort && window.TitanEffort.RANKS;
    var id = "eclaireur";
    if (ranks) {
      for (var i = 0; i < ranks.length; i++) if ((Number(level) || 1) >= ranks[i].level) id = ranks[i].id;
    }
    return RANKS.indexOf(id) >= 0 ? id : "eclaireur";
  }

  function wings(accent, long) {
    function feather(side, k, len) {
      var x0 = 60 + side * 40, y0 = 52 + k * 11;
      return '<path d="M' + x0 + " " + y0 + " C" + (x0 + side * len * 0.7) + " " + (y0 - 6) + " " + (x0 + side * len) + " " + (y0 - 2) + " " + (x0 + side * (len + 4)) + " " + (y0 + 12) +
        " C" + (x0 + side * len * 0.6) + " " + (y0 + 8) + " " + (x0 + side * 12) + " " + (y0 + 10) + " " + x0 + " " + (y0 + 8) + ' Z" fill="' + accent + '" opacity="' + (0.82 - k * 0.12) + '" stroke="#05070A" stroke-width="1"/>';
    }
    var rows = long ? [0, 1, 2, 3] : [0, 1, 2], base = long ? 36 : 24, out = "";
    rows.forEach(function (k) { out += feather(-1, k, base - k * 3); });
    rows.forEach(function (k) { out += feather(1, k, base - k * 3); });
    return out;
  }

  /** The crest of a rank, `size` px wide (wings, crown and rays included): the approved badge when there is one, the vector crest
      otherwise or when `opts.vector` asks for it. */
  function svg(rank, size, opts) {
    opts = opts || {};
    var id = RANKS.indexOf(rank) >= 0 ? rank : "eclaireur";
    if (!opts.vector && BADGES.indexOf(id) >= 0) return badge(id, size);
    var t = RANKS.indexOf(id), accent = ACCENT[id], uid = "tc" + ++seq, h = Math.round((size * 182) / 172), s = "";
    s += '<svg class="crest" width="' + size + '" height="' + h + '" viewBox="-26 -16 172 182" role="img" aria-label="Blason ' + id + '" xmlns="http://www.w3.org/2000/svg"><defs>' +
      '<radialGradient id="g' + uid + '" cx="60" cy="72" r="70" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="' + accent + '" stop-opacity="' + (0.18 + t * 0.05) + '"/><stop offset="1" stop-color="' + accent + '" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="f' + uid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1B2530"/><stop offset="1" stop-color="#090D12"/></linearGradient>' +
      '<linearGradient id="m' + uid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + accent + '" stop-opacity="0.28"/><stop offset="1" stop-color="' + accent + '" stop-opacity="0"/></linearGradient></defs>';
    if (opts.glow !== false) s += '<circle cx="60" cy="72" r="70" fill="url(#g' + uid + ')"/>';
    if (t >= 6) {
      for (var i = 0; i < 16; i++) {
        var a = (i / 16) * Math.PI * 2, r2 = i % 2 ? 72 : 80;
        s += '<line x1="' + (60 + Math.cos(a) * 66) + '" y1="' + (72 + Math.sin(a) * 66) + '" x2="' + (60 + Math.cos(a) * r2) + '" y2="' + (72 + Math.sin(a) * r2) + '" stroke="' + accent + '" stroke-width="' + (i % 2 ? 2 : 3) + '" stroke-linecap="round" opacity="0.55"/>';
      }
    }
    if (t >= 3) s += wings(accent, t >= 5);
    if (t >= 5) s += '<polygon points="38,22 44,4 52,18 60,-6 68,18 76,4 82,22" fill="' + accent + '" stroke="#05070A" stroke-width="1.5" stroke-linejoin="round"/>';
    s += '<path d="' + SHIELD + '" fill="url(#f' + uid + ')" stroke="' + accent + '" stroke-width="4" stroke-linejoin="round"/>';
    s += '<path d="' + INNER + '" fill="url(#m' + uid + ')" stroke="' + accent + '" stroke-opacity="0.45" stroke-width="1.5" stroke-linejoin="round"/>';
    if (t >= 4) s += '<g stroke="' + accent + '" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.9"><path d="M36 104 C24 90 23 72 31 56"/><path d="M84 104 C96 90 97 72 89 56"/><path d="M30 92 l-7 -2 M27 80 l-7 -4 M30 68 l-6 -6"/><path d="M90 92 l7 -2 M93 80 l7 -4 M90 68 l6 -6"/></g>';
    s += '<g stroke="' + accent + '" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none">';
    for (var c = 0; c < CHEVRONS[id]; c++) { var y = 96 - c * 14; s += '<path d="M42 ' + y + " L60 " + (y - 14) + " L78 " + y + '"/>'; }
    s += "</g>";
    if (t >= 2) s += '<circle cx="60" cy="46" r="' + (t >= 5 ? 7 : 6) + '" fill="' + accent + '" stroke="#05070A" stroke-width="2"/><circle cx="58" cy="44" r="2" fill="#fff" opacity="0.85"/>';
    return s + "</svg>";
  }

  /** The beacon of a chapter, in the colour of its world. */
  function beacon(color, size, lit) {
    color = color || "#3DD9E8";
    lit = lit !== false;
    var uid = "tb" + ++seq, s = '<svg class="crest crest-beacon" width="' + size + '" height="' + size + '" viewBox="0 0 120 120" role="img" aria-label="' + (lit ? "Balise allumée" : "Balise éteinte") + '" xmlns="http://www.w3.org/2000/svg"><defs>' +
      '<radialGradient id="b' + uid + '" cx="60" cy="46" r="48" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="' + color + '" stop-opacity="' + (lit ? 0.55 : 0.08) + '"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="t' + uid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1B2530"/><stop offset="1" stop-color="#0E141A"/></linearGradient></defs><circle cx="60" cy="46" r="48" fill="url(#b' + uid + ')"/>';
    if (lit) [-62, -34, 0, 34, 62].forEach(function (d) { s += '<line x1="60" y1="36" x2="' + (60 + d * 0.78) + '" y2="' + (d === 0 ? 6 : 16) + '" stroke="' + color + '" stroke-width="' + (d === 0 ? 3 : 2) + '" stroke-linecap="round" opacity="' + (d === 0 ? 0.8 : 0.45) + '"/>'; });
    s += '<path d="M44 108 L50 54 H70 L76 108 Z" fill="url(#t' + uid + ')" stroke="' + color + '" stroke-opacity="' + (lit ? 0.9 : 0.35) + '" stroke-width="2.5" stroke-linejoin="round"/>';
    s += '<rect x="40" y="104" width="40" height="8" rx="3" fill="#141C24" stroke="' + color + '" stroke-opacity="' + (lit ? 0.7 : 0.3) + '" stroke-width="2"/>';
    s += '<path d="M46 78 H74 M47.5 92 H72.5" stroke="' + color + '" stroke-opacity="0.35" stroke-width="2"/>';
    s += '<path d="M48 54 H72 L68 40 H52 Z" fill="#141C24" stroke="' + color + '" stroke-opacity="' + (lit ? 0.9 : 0.35) + '" stroke-width="2.5" stroke-linejoin="round"/>';
    s += lit ? '<path d="M60 14 C68 24 72 30 66 42 H54 C48 30 54 24 60 14 Z" fill="' + color + '"/><path d="M60 26 C64 32 65 36 62 42 H58 C55 36 56 32 60 26 Z" fill="#fff" opacity="0.85"/>'
      : '<path d="M54 42 C54 36 57 34 60 30 C63 34 66 36 66 42 Z" fill="none" stroke="' + color + '" stroke-opacity="0.35" stroke-width="2"/>';
    return s + "</svg>";
  }

  window.TitanCrest = { RANKS: RANKS, ACCENT: ACCENT, BADGES: BADGES, rankIdOf: rankIdOf, svg: svg, beacon: beacon };
})();
