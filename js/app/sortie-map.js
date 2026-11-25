/* TITAN — V1.7.7 the map of an outing, drawn on a canvas with the arithmetic of js/core/gps-map.js.
   What is drawn: the travelled trace (cyan, one line per piece — a pause or a hole is never bridged), the route to follow (amber,
   dashed and thinner), the start, the athlete's own places, and the position with its accuracy circle and a heading arrow when the
   browser gives one. The ground is neutral (a faint grid that moves with the map) unless a tile provider is configured through
   window.TITAN_MAP = { tiles, attribution } AND the athlete turned the base map on: no map server is contacted otherwise, so looking
   at a trace reveals nothing about where it is. Follow mode keeps the position in the middle; a drag switches it off and shows
   « Recentrer ». Nothing here records or stores a position. */
(function () {
  "use strict";
  const M = () => window.TitanGpsMap;
  const GAP_MS = 30000;
  const FOLLOW_ZOOM = 16;

  function create(host, options) {
    const o = { interactive: true, tiles: false, ...(options || {}) };
    const canvas = host.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const recenterBtn = host.querySelector("[data-map-recenter]");
    const scaleEl = host.querySelector("[data-map-scale]");
    const attributionEl = host.querySelector("[data-map-attribution]");
    const config = window.TITAN_MAP || null;
    const useTiles = () => o.tiles === true && M().tilesConfigured(config);
    const tileCache = new Map();
    let data = { segs: [], route: null, pos: null, places: [], state: "good" };
    let view = null, follow = true, w = 0, h = 0, dpr = 1, raf = 0, dead = false;
    const colour = {};

    function readColours() {
      const cs = getComputedStyle(host);
      for (const [k, v] of [["bg", "--bg-1"], ["grid", "--line"], ["trace", "--cy"], ["route", "--am"], ["ink", "--tx"], ["muted", "--tx-3"], ["ground", "--bg"]]) colour[k] = cs.getPropertyValue(v).trim() || "#888";
    }
    function resize() {
      const box = canvas.getBoundingClientRect();
      const nw = Math.max(1, Math.round(box.width)), nh = Math.max(1, Math.round(box.height)), nd = Math.min(3, window.devicePixelRatio || 1);
      if (nw === w && nh === h && nd === dpr) return false;
      w = nw; h = nh; dpr = nd;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      return true;
    }
    const everything = () => [...data.segs.flat(), ...(data.route ? data.route.segs.flat() : []), ...(data.pos ? [data.pos] : [])];
    function fit() {
      const pts = everything();
      if (pts.length) view = M().fitView(pts, w, h, Math.min(36, Math.max(16, Math.min(w, h) * 0.12)), { maxZoom: 17 });
    }
    function settle() {
      if (!w || !h) return;
      if (!o.interactive) return fit();
      if (follow && data.pos) view = { lat: data.pos.lat, lon: data.pos.lon, z: view ? view.z : FOLLOW_ZOOM };
      else if (!view) fit();
    }

    function line(points, breakOnGap) {
      let open = false, px = null, prevT = null;
      for (const p of points) {
        const s = M().toScreen(p, view, w, h);
        const cut = breakOnGap && prevT !== null && Number.isFinite(p.t) && p.t - prevT > GAP_MS;
        if (!open || cut) { ctx.moveTo(s.x, s.y); open = true; px = s; }
        else if (Math.abs(s.x - px.x) + Math.abs(s.y - px.y) >= 1) { ctx.lineTo(s.x, s.y); px = s; }
        prevT = Number.isFinite(p.t) ? p.t : null;
      }
    }
    function tile(t) {
      let img = tileCache.get(t.key);
      if (!img) {
        img = new Image();
        img.decoding = "async";
        img.onload = () => schedule();
        img.onerror = () => { img.failed = true; };
        img.src = M().tileUrl(t, config.tiles);
        tileCache.set(t.key, img);
        if (tileCache.size > 160) tileCache.delete(tileCache.keys().next().value);
      }
      if (img.complete && !img.failed && img.naturalWidth) ctx.drawImage(img, t.left, t.top, Math.ceil(t.size), Math.ceil(t.size));
    }
    function grid() {
      const bar = M().scaleBar(view, 120), step = Math.max(24, bar.px);
      const c = M().worldPx(view.lat, view.lon, view.z);
      ctx.beginPath();
      for (let x = (((w / 2 - c.x) % step) + step) % step; x < w; x += step) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); }
      for (let y = (((h / 2 - c.y) % step) + step) % step; y < h; y += step) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); }
      ctx.strokeStyle = colour.grid; ctx.lineWidth = 1; ctx.stroke();
    }
    function ring(p, r, fill, stroke, width) {
      const s = M().toScreen(p, view, w, h);
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width || 2; ctx.stroke(); }
      return s;
    }

    function draw() {
      raf = 0;
      if (dead) return;
      resize();
      if (!view) settle();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = colour.bg; ctx.fillRect(0, 0, w, h);
      if (!view) return;
      if (useTiles()) for (const t of M().tilesFor(view, w, h)) tile(t);
      else grid();
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      if (data.route) {
        ctx.beginPath();
        for (const s of data.route.segs) line(s, false);
        ctx.strokeStyle = colour.route; ctx.lineWidth = 3; ctx.setLineDash([9, 8]); ctx.stroke(); ctx.setLineDash([]);
        const first = data.route.segs[0] && data.route.segs[0][0], lastSeg = data.route.segs[data.route.segs.length - 1], end = lastSeg && lastSeg[lastSeg.length - 1];
        if (end) ring(end, 5, colour.route, colour.ground, 2);
        if (first && !data.segs.length) ring(first, 6, colour.ground, colour.route, 3);
      }
      if (data.segs.length) {
        ctx.beginPath();
        for (const s of data.segs) line(s, true);
        ctx.strokeStyle = colour.ground; ctx.lineWidth = 7.5; ctx.stroke(); // a dark edge keeps the trace readable on a base map and on the route
        ctx.strokeStyle = colour.trace; ctx.lineWidth = 4.5; ctx.stroke();
        const start = data.segs.find((s) => s.length);
        if (start) ring(start[0], 6, colour.ground, colour.ink, 3);
      }
      for (const place of data.places || []) {
        const s = M().toScreen(place, view, w, h);
        if (s.x < -20 || s.y < -20 || s.x > w + 20 || s.y > h + 20) continue;
        ctx.beginPath(); ctx.moveTo(s.x, s.y - 7); ctx.lineTo(s.x + 7, s.y); ctx.lineTo(s.x, s.y + 7); ctx.lineTo(s.x - 7, s.y); ctx.closePath();
        ctx.fillStyle = colour.ground; ctx.fill(); ctx.strokeStyle = colour.ink; ctx.lineWidth = 2; ctx.stroke();
        if (view.z >= 14.5 && place.name) { ctx.font = "600 12px Archivo, system-ui, sans-serif"; ctx.fillStyle = colour.ink; ctx.fillText(String(place.name).slice(0, 24), s.x + 11, s.y + 4); }
      }
      if (data.pos) {
        const p = data.pos, live = data.state === "good" || data.state === "fair";
        const s = M().toScreen(p, view, w, h);
        if (Number.isFinite(p.acc) && p.acc > 0) {
          const r = Math.min(Math.max(w, h), p.acc / M().metersPerPx(p.lat, view.z));
          if (r > 9) { ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.globalAlpha = 0.14; ctx.fillStyle = live ? colour.trace : colour.muted; ctx.fill(); ctx.globalAlpha = 0.5; ctx.strokeStyle = live ? colour.trace : colour.muted; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1; }
        }
        if (live && Number.isFinite(p.hdg)) {
          const a = (p.hdg * Math.PI) / 180;
          ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(a);
          ctx.beginPath(); ctx.moveTo(0, -19); ctx.lineTo(7, -9); ctx.lineTo(-7, -9); ctx.closePath();
          ctx.fillStyle = colour.ink; ctx.fill(); ctx.restore();
        }
        ctx.beginPath(); ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = live ? colour.trace : colour.bg; ctx.fill();
        ctx.strokeStyle = live ? colour.ink : colour.muted; ctx.lineWidth = 3; ctx.stroke();
      }
      if (scaleEl) {
        const bar = M().scaleBar(view, 96);
        scaleEl.style.setProperty("--gps-scale", `${bar.px}px`);
        const label = scaleEl.querySelector("span");
        if (label && label.textContent !== bar.label) label.textContent = bar.label;
      }
    }
    /* Drawn at once: a position must appear without waiting for a frame the browser may never give a hidden or throttled page. A drag
       asks for many redraws, so those go through the next frame. */
    function schedule() { if (!raf && !dead) raf = requestAnimationFrame(draw); }
    function setFollow(on) {
      follow = on;
      if (recenterBtn) recenterBtn.hidden = on || !data.pos;
      host.dataset.follow = on ? "on" : "off";
    }

    const api = {
      set(patch) { data = { ...data, ...patch }; if (!data.places) data.places = []; settle(); if (recenterBtn) recenterBtn.hidden = follow || !data.pos; draw(); },
      fit() { fit(); draw(); },
      recenter() { setFollow(true); if (data.pos) view = { lat: data.pos.lat, lon: data.pos.lon, z: view ? Math.max(view.z, 14) : FOLLOW_ZOOM }; else fit(); draw(); },
      zoom(dz) { if (!view) return; view = M().zoomBy(view, dz, follow || !o.interactive ? null : { x: w / 2, y: h / 2 }, w, h); draw(); },
      option(patch) { Object.assign(o, patch); if (attributionEl) { attributionEl.hidden = !useTiles(); attributionEl.textContent = useTiles() ? String(config.attribution) : ""; } draw(); },
      refresh() { readColours(); if (resize()) settle(); draw(); },
      get following() { return follow; },
      get view() { return view; },
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); observer?.disconnect(); },
    };

    readColours();
    resize();
    let observer = null;
    if (typeof ResizeObserver === "function") { observer = new ResizeObserver(() => { if (resize()) { settle(); draw(); } }); observer.observe(canvas); }
    api.option({});

    if (o.interactive) {
      const pointers = new Map();
      let moved = 0, pinch = 0;
      const spread = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
      const local = (e) => { const box = canvas.getBoundingClientRect(); return { x: e.clientX - box.left, y: e.clientY - box.top }; };
      canvas.addEventListener("pointerdown", (e) => {
        if (e.button > 0) return;
        try { canvas.setPointerCapture(e.pointerId); } catch {}
        pointers.set(e.pointerId, local(e)); moved = 0; pinch = pointers.size === 2 ? spread() : 0;
      });
      canvas.addEventListener("pointermove", (e) => {
        const before = pointers.get(e.pointerId);
        if (!before || !view) return;
        const at = local(e);
        pointers.set(e.pointerId, at);
        if (pointers.size === 1) {
          moved += Math.abs(at.x - before.x) + Math.abs(at.y - before.y);
          if (moved < 6 && follow) return; // a tap is not a drag
          if (follow) setFollow(false);
          view = M().panBy(view, at.x - before.x, at.y - before.y);
        } else if (pointers.size === 2) {
          const d = spread(), [a, b] = [...pointers.values()];
          if (pinch > 0 && d > 0) view = M().zoomBy(view, Math.log2(d / pinch), follow ? null : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, w, h);
          pinch = d;
        }
        schedule();
      });
      const lift = (e) => { pointers.delete(e.pointerId); pinch = 0; };
      canvas.addEventListener("pointerup", lift);
      canvas.addEventListener("pointercancel", lift);
      canvas.addEventListener("wheel", (e) => {
        if (!view) return;
        e.preventDefault();
        view = M().zoomBy(view, -e.deltaY / (e.deltaMode ? 12 : 320), follow ? null : local(e), w, h);
        schedule();
      }, { passive: false });
      canvas.addEventListener("keydown", (e) => {
        if (!view) return;
        const pan = { ArrowLeft: [56, 0], ArrowRight: [-56, 0], ArrowUp: [0, 56], ArrowDown: [0, -56] }[e.key];
        if (pan) { setFollow(false); view = M().panBy(view, pan[0], pan[1]); }
        else if (e.key === "+" || e.key === "=") view = M().zoomBy(view, 1);
        else if (e.key === "-") view = M().zoomBy(view, -1);
        else if (e.key === "0" || e.key === "Home") return void (e.preventDefault(), api.recenter());
        else return;
        e.preventDefault(); draw();
      });
      host.addEventListener("click", (e) => {
        const z = e.target.closest("[data-map-zoom]");
        if (z) return api.zoom(Number(z.dataset.mapZoom));
        if (e.target.closest("[data-map-recenter]")) { api.recenter(); canvas.focus({ preventScroll: true }); }
      });
      setFollow(true);
    }
    return api;
  }

  /** The markup of a map block. `interactive` adds the controls on the edges (zoom, recentre, scale); never over the centre. */
  function html(opts) {
    const o = opts || {}, esc = window.titanEsc, icon = window.titanIcon;
    return `<div class="gps-map${o.interactive ? "" : " gps-map-static"}" data-map>
      <canvas ${o.interactive ? 'tabindex="0" ' : ""}role="img" aria-label="${esc(o.label || "Carte de la sortie")}"${o.interactive ? ' aria-describedby="gps-map-keys"' : ""}></canvas>
      ${o.interactive ? `<p class="sr-only" id="gps-map-keys">Flèches pour déplacer la carte, plus et moins pour le zoom, zéro pour recentrer sur ta position.</p>
      <div class="gps-map-zoom"><button type="button" data-map-zoom="1" aria-label="Zoomer">${icon("plus")}</button><button type="button" data-map-zoom="-1" aria-label="Dézoomer">${icon("minus")}</button></div>
      <button type="button" class="gps-map-recenter" data-map-recenter hidden>${icon("target")}<span>Recentrer</span></button>` : ""}
      <div class="gps-map-scale" data-map-scale aria-hidden="true"><i></i><span></span></div>
      <p class="gps-map-caption">${esc(o.caption || "Fond neutre : trace et position seulement")}</p>
      <p class="gps-map-attribution" data-map-attribution hidden></p>
    </div>`;
  }

  window.TitanSortieMap = { create, html };
})();
