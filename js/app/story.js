/* « Partager » (before V2) — the 9:16 story card of a session or a success, drawn on the device at 1080 × 1920.
   What the card shows and where everything sits comes from js/core/share-story.js (shared unchanged with Android): this file
   only gathers the inputs the page already holds, draws the operations on a canvas, and runs the preview sheet. The athlete
   picks a style (Champ, Feuille, Carnet) and what the picture shows (route, week, date, name), then shares the file where the
   browser really supports it, or downloads it. Nothing is uploaded or published by TITAN; no session, reward, visibility or
   profile setting changes here. The route is a shape without map or coordinates, its first and last 300 m removed. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const S = () => window.TitanShareStory;

  /* ---------- Inputs: only what the page already holds ---------- */
  const userName = () => {
    const u = window.titanShell?.user?.();
    return u && !u.guest ? u.name || "" : "";
  };
  const confirmedLogs = () => (window.state?.history || []).filter((l) => l && !l.archived_at && (l.syncStatus === "confirmed" || !l.syncStatus));

  /** The week of the session as « le programme » draws it (js/core/program-grid.js), its day and line marked. */
  function weekOf(log) {
    const P = window.TitanProgram, Pr = window.TitanProgress, Sp = window.TitanSports;
    if (!P?.week || !log?.date) return null;
    try {
      const pool = confirmedLogs();
      if (!pool.some((l) => l === log || (l.id && l.id === log.id))) pool.push(log);
      const grid = P.week(pool, {
        start: log.date, now: new Date(), maxRows: 3,
        minutesOf: (l) => (Pr?.minutesOf ? Pr.minutesOf(l).minutes || 0 : Number(l?.details?.duration) || 0),
        familyOf: (s) => (Sp?.familyOf ? Sp.familyOf(s) : "endurance"),
        labelOf: (s) => (Sp?.label ? Sp.label(s) : String(s)),
      });
      const d = new Date(log.date);
      return { rows: grid.rows, mark: (d.getDay() + 6) % 7, markRow: grid.rows.findIndex((r) => r.sport === log.sport) };
    } catch { return null; }
  }

  /** The discipline's own measures: the catalogue fields still asked for this sport, and the values of the session. */
  function extrasOf(log) {
    const values = log?.details?.extras;
    if (!values || typeof values !== "object") return null;
    const catalog = window.SPORTS_CONFIG?.[log.sport]?.extraFields || [];
    const fields = window.TitanSportContracts?.entryFields ? window.TitanSportContracts.entryFields(log.sport, catalog, { values }) : catalog;
    return { fields, values };
  }

  /** A session as the moment and the journal sheet show it: the client's own measures and a record it set. */
  function sessionInput(log) {
    const F = window.TitanFormat;
    const rec = (window.TitanMoment?.records?.(log) || []).find((r) => !r.first);
    return {
      sport: window.TitanSports?.label?.(log.sport) || log.sport,
      sportId: log.sport,
      metrics: window.TitanMoment?.metrics?.(log) || [],
      extras: extrasOf(log),
      record: rec ? { label: rec.label, value: F.recordValue(rec.unit, rec.value), previous: rec.previous ? F.recordValue(rec.unit, rec.previous.value) : null } : null,
      week: weekOf(log),
      date: log.date,
      name: userName(),
      historical: window.TitanEffort?.isHistorical?.(log.date) || Boolean(log.details?.historical),
    };
  }

  /** The route of a session, when the account has one (recorded with the Android GPS), as a shape: planar offsets in metres from
      the south-west corner, first and last 300 m removed. Null otherwise. */
  async function routeOf(log) {
    try { return (await window.TitanRoutes?.shapeForSession?.(log)) || null; } catch { return null; }
  }

  /* ---------- Drawing the operations of TitanShareStory.layout ---------- */
  const CUTS = {
    display: [800, "condensed"], figure: [300, "extra-condensed"], figureBold: [700, "extra-condensed"],
    text: [400, "normal"], semi: [600, "normal"], bold: [700, "normal"],
  };
  async function fonts() {
    try {
      await Promise.all(['800 condensed 100px "Archivo"', '300 extra-condensed 100px "Archivo"', '700 extra-condensed 100px "Archivo"', '400 40px "Archivo"', '600 40px "Archivo"', '700 40px "Archivo"'].map((f) => document.fonts.load(f)));
    } catch {}
  }
  function setFont(ctx, font, size, tracking = 0) {
    const [weight, stretch] = CUTS[font] || CUTS.text;
    ctx.font = `${weight} ${size}px "Archivo", system-ui, sans-serif`;
    if ("fontStretch" in ctx) ctx.fontStretch = stretch;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${tracking}px`;
  }
  function ellipsis(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
    return `${t.replace(/[\s,.;:·–-]+$/, "")}…`;
  }
  /** A one-line box: shrunk if the real width is wider than the layout's estimate, then cut. Vertically centred in its line
      height like a line of text in a box (CSS / React Native). */
  function textOp(ctx, op) {
    let size = op.size;
    setFont(ctx, op.font, size, op.tracking || 0);
    while (size > op.size * 0.7 && ctx.measureText(op.text).width > op.w) setFont(ctx, op.font, (size -= 2), op.tracking || 0);
    const t = ellipsis(ctx, op.text, op.w);
    const m = ctx.measureText("Hg");
    const asc = m.fontBoundingBoxAscent ?? size * 0.88, desc = m.fontBoundingBoxDescent ?? size * 0.21;
    ctx.fillStyle = op.color;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = op.align === "right" ? "right" : op.align === "center" ? "center" : "left";
    const x = op.align === "right" ? op.x + op.w : op.align === "center" ? op.x + op.w / 2 : op.x;
    ctx.fillText(t, x, op.y + op.lh / 2 + (asc - desc) / 2);
    ctx.textAlign = "left";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  }
  function rectPath(ctx, op) {
    const { x, y, w, h } = op, r = Math.min(op.radius || 0, w / 2, h / 2), cut = op.cut || 0;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    if (r) ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - (cut || r));
    if (cut) ctx.lineTo(x + w - cut, y + h);
    else if (r) ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    if (r) ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    if (r) ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  function mark(ctx, op) {
    const k = op.size / 32;
    ctx.save();
    ctx.translate(op.x, op.y);
    ctx.fillStyle = op.bg;
    rectPath(ctx, { x: 0, y: 0, w: op.size, h: op.size, radius: 7 * k });
    ctx.fill();
    ctx.strokeStyle = op.fg;
    ctx.lineWidth = 3.2 * k;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const [dy, a] of [[0, 1], [8, 0.5]]) {
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.moveTo(9 * k, (15.5 + dy) * k);
      ctx.lineTo(16 * k, (8.5 + dy) * k);
      ctx.lineTo(23 * k, (15.5 + dy) * k);
      ctx.stroke();
    }
    ctx.restore();
  }
  const images = new Map();
  /** An SVG image, loaded once; null when it cannot be loaded (the card is drawn without it). */
  function image(src) {
    if (!images.has(src)) images.set(src, new Promise((ok) => {
      const img = new Image();
      const timer = setTimeout(() => ok(null), 2500);
      img.onload = () => { clearTimeout(timer); ok(img); };
      img.onerror = () => { clearTimeout(timer); images.delete(src); ok(null); };
      img.src = src;
    }));
    return images.get(src);
  }
  const glyph = (name, color) => {
    if (!window.titanIcon || !name) return Promise.resolve(null);
    const svg = window.titanIcon(name).replace("<svg ", `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" style="color:${color}" `);
    return image(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  };
  /** The brand's contour lines (assets/ascension/contours.svg) inked in `color`. */
  async function relief(ctx, op) {
    const img = await image("/assets/ascension/contours.svg");
    if (!img) return;
    const off = document.createElement("canvas");
    off.width = Math.round(op.w); off.height = Math.round(op.h);
    const o = off.getContext("2d");
    o.drawImage(img, 0, 0, off.width, off.height);
    o.globalCompositeOperation = "source-in";
    o.fillStyle = op.color;
    o.fillRect(0, 0, off.width, off.height);
    ctx.save();
    const c = op.clip;
    if (c) { ctx.beginPath(); ctx.rect(c.x, c.y, c.w, c.h); ctx.clip(); }
    ctx.globalAlpha = op.opacity ?? 1;
    // The asset's strokes are faint on purpose (7 to 34 %): drawn twice they read on a bright field without competing with it.
    ctx.drawImage(off, op.x, op.y);
    ctx.drawImage(off, op.x, op.y);
    ctx.restore();
  }

  /** Draws a model in a style and returns the 1080 × 1920 canvas. */
  async function draw(model, style) {
    await fonts();
    const plan = S().layout(model, style);
    const c = document.createElement("canvas");
    c.width = plan.width;
    c.height = plan.height;
    const ctx = c.getContext("2d");
    for (const op of plan.ops) {
      if (op.t === "fill") { ctx.fillStyle = op.color; ctx.fillRect(0, 0, c.width, c.height); }
      else if (op.t === "rect") {
        ctx.save();
        ctx.globalAlpha = op.opacity ?? 1;
        rectPath(ctx, op);
        if (op.color && op.color !== "transparent") { ctx.fillStyle = op.color; ctx.fill(); }
        if (op.stroke) { ctx.strokeStyle = op.stroke; ctx.lineWidth = op.strokeWidth || 2; ctx.stroke(); }
        ctx.restore();
      } else if (op.t === "line") {
        ctx.strokeStyle = op.color; ctx.lineWidth = op.width || 2;
        ctx.beginPath(); ctx.moveTo(op.x1, op.y1); ctx.lineTo(op.x2, op.y2); ctx.stroke();
      } else if (op.t === "route") {
        ctx.save();
        ctx.strokeStyle = op.color; ctx.lineWidth = op.width; ctx.lineCap = "round"; ctx.lineJoin = "round";
        for (const seg of op.segs) {
          ctx.beginPath();
          seg.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.stroke();
        }
        ctx.restore();
      } else if (op.t === "mark") mark(ctx, op);
      else if (op.t === "relief") await relief(ctx, op);
      else if (op.t === "icon") { const img = await glyph(op.name, op.color); if (img) ctx.drawImage(img, op.x, op.y, op.size, op.size); }
      else if (op.t === "text") textOp(ctx, op);
    }
    return c;
  }

  const blobOf = (canvas) => new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("PNG unavailable"))), "image/png"));

  /** Product analytics of the flow: consent is applied by TitanAnalytics; only `kind` leaves the page, never a sport or a value. */
  const track = (event, kind) => { try { void window.TitanAnalytics?.track?.(S().EVENTS[event], { kind }); } catch {} };

  /* ---------- Preview sheet ---------- */
  /** `request`: { kind: "session" | "achievement", input }. `route`: an optional promise of the session's route shape, drawn as
      soon as it arrives. `isCurrent`: false once the account or the source changed. */
  async function open(request, { isCurrent = () => true, route = null } = {}) {
    if (!S() || !window.titanShell?.sheet) return null;
    const job = { owner: window.state?.user?.id, epoch: window.titanAccountTransition?.epoch };
    let closed = false;
    const current = () => !closed && isCurrent() && job.owner === window.state?.user?.id && job.epoch === window.titanAccountTransition?.epoch && !window.titanAccountTransition?.active;
    const kind = request.kind === "achievement" ? "achievement" : "session";
    const input = { ...request.input };
    const choice = { ...S().DEFAULTS };
    const build = () => (kind === "achievement" ? S().achievement(input, choice) : S().session(input, choice));
    const body = document.createElement("div");
    body.className = "asc-stack cd-sheet st-sheet";
    body.innerHTML = `<div class="cd-preview st-preview"><img alt="Aperçu de l’image à partager" width="1080" height="1920"></div>
      <div class="asc-field st-styles"><span>Style</span><div class="asc-seg" role="group" aria-label="Style de l’image">${S().STYLES.map((id) => `<button type="button" data-style="${id}" aria-pressed="${choice.style === id}">${esc(S().STYLE_LABELS[id])}</button>`).join("")}</div></div>
      <fieldset class="st-options" data-story-options></fieldset>
      <p class="asc-small asc-muted">${icon("lock")} Image créée sur ton appareil. Jamais dessus : fond de carte, coordonnées, lieu, notes, ressenti ou données de santé. Rien n’est publié tant que tu ne la partages pas.</p>
      <p class="asc-small asc-muted" role="status" data-story-status></p>
      <p class="asc-small jr-edit-error" role="alert" data-story-error hidden></p>
      <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-story-retry hidden>Réessayer</button>
      <div class="asc-confirm-actions" data-story-actions aria-busy="false"><button type="button" class="asc-btn asc-btn-secondary" data-story-save>${icon("download")} Télécharger</button><button type="button" class="asc-btn asc-btn-primary" data-story-share>${icon("share")} Partager</button></div>
      <p class="asc-small asc-faint" data-story-help></p>
      <section class="st-discover" aria-labelledby="st-discover-title"><h3 class="asc-h3" id="st-discover-title">Faire découvrir TITAN</h3>
        <p class="asc-small asc-muted">Une adresse écrite sur une image ne se clique pas. Là où c’est possible, envoie le lien à part.</p>
        <div class="asc-row-flex"><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-story-link>${icon("copy")} Copier le lien titan-app.fr</button><a class="asc-btn asc-btn-ghost asc-btn-sm" href="/social#amis" data-story-invite>${icon("userPlus")} Inviter un ami</a></div></section>`;
    const sheet = window.titanShell.sheet({ title: "Partager", eyebrow: kind === "achievement" ? "Succès" : "Séance", body, onClose: () => { closed = true; } });
    const $ = (sel) => body.querySelector(sel);
    const img = $("img"), status = $("[data-story-status]"), error = $("[data-story-error]"), retry = $("[data-story-retry]"), optionsBox = $("[data-story-options]");
    const shareBtn = $("[data-story-share]"), saveBtn = $("[data-story-save]"), actions = $("[data-story-actions]"), help = $("[data-story-help]");
    let canvas = null, file = null, painting = false, pending = false, sequence = 0, failedAction = "paint";
    const live = () => { if (!current()) { if (sheet.open) sheet.close(); return false; } return sheet.isConnected && sheet.open; };
    const sync = () => {
      actions.setAttribute("aria-busy", String(pending || painting));
      shareBtn.disabled = saveBtn.disabled = pending || painting || !canvas;
      body.querySelectorAll("[data-option], [data-style]").forEach((el) => { el.disabled = pending; });
      retry.hidden = pending || painting || !error.textContent;
    };
    const renderOptions = () => {
      const available = S().availableOptions(input, choice.style);
      optionsBox.hidden = !available.length;
      optionsBox.innerHTML = available.length ? `<legend class="asc-eyebrow">Ce que montre l’image</legend>${available.map((id) => `<label class="auth-check"><input type="checkbox" data-option="${id}" ${choice[id] ? "checked" : ""}><span>${esc(S().OPTION_LABELS[id])}${S().OPTION_HINTS[id] ? `<small class="asc-faint"> · ${esc(S().OPTION_HINTS[id])}</small>` : ""}</span></label>`).join("")}` : "";
    };
    const fail = (message, action) => { failedAction = action; error.textContent = message; error.hidden = false; sync(); };
    const canShareFiles = (f) => Boolean(navigator.share && navigator.canShare && navigator.canShare({ files: [f] }));
    help.textContent = navigator.share && navigator.canShare ? "« Partager » ouvre le partage de ton appareil : tu choisis l’application et ce que tu publies." : "Ce navigateur ne partage pas les images : « Partager » télécharge l’image, à publier ensuite depuis l’application de ton choix.";

    async function paint() {
      if (pending || !live()) return;
      const seq = ++sequence;
      painting = true; canvas = null; file = null;
      error.textContent = ""; error.hidden = true;
      status.textContent = "Création de l’image…";
      sync();
      try {
        const next = await draw(build(), choice.style);
        if (seq !== sequence || !live()) return;
        canvas = next;
        img.src = next.toDataURL("image/png");
      } catch {
        if (seq === sequence && live()) fail("L’aperçu n’a pas pu être créé. Réessaie.", "paint");
      } finally {
        if (seq === sequence) { painting = false; status.textContent = ""; sync(); }
      }
    }
    function download(f) {
      const url = URL.createObjectURL(f);
      const a = document.createElement("a");
      a.href = url; a.download = f.name;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      window.titanShell.toast({ type: "ok", title: "Image téléchargée", message: "Retrouve-la dans tes téléchargements." });
    }
    async function act(action) {
      if (pending || painting || !canvas || !live()) return;
      pending = true;
      error.textContent = ""; error.hidden = true;
      status.textContent = "Préparation de l’image…";
      sync();
      try {
        try {
          file ||= new File([await blobOf(canvas)], S().fileName(kind), { type: "image/png" });
        } catch (e) {
          track("failed", kind);
          throw e;
        }
        track("exported", kind);
        if (!live()) return;
        if (action === "share" && canShareFiles(file)) {
          status.textContent = "Partage en cours…";
          track("sheet", kind);
          try {
            await navigator.share({ files: [file], title: "TITAN" });
          } catch (e) {
            if (e?.name !== "AbortError") throw e; // closing the share sheet is not an error
          }
        } else download(file);
      } catch {
        if (live()) fail("L’image n’a pas pu être partagée ou téléchargée. Réessaie, ou utilise « Télécharger ».", action);
      } finally {
        pending = false;
        status.textContent = "";
        sync();
      }
    }
    body.addEventListener("change", (e) => {
      const box = e.target.closest?.("[data-option]");
      if (!box) return;
      choice[box.dataset.option] = box.checked;
      void paint();
    });
    body.addEventListener("click", (e) => {
      const button = e.target.closest?.("[data-style]");
      if (!button || pending || button.dataset.style === choice.style) return;
      choice.style = button.dataset.style;
      body.querySelectorAll("[data-style]").forEach((el) => el.setAttribute("aria-pressed", String(el === button)));
      renderOptions();
      void paint();
    });
    shareBtn.addEventListener("click", () => act("share"));
    saveBtn.addEventListener("click", () => act("save"));
    retry.addEventListener("click", () => (failedAction === "paint" ? paint() : act(failedAction)));
    $("[data-story-link]").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText("https://titan-app.fr");
        window.titanShell.toast({ type: "ok", title: "Lien copié", message: "Colle-le dans ton message, à côté de l’image." });
      } catch {
        window.titanShell.toast({ type: "warn", title: "Copie impossible", message: "Le lien est https://titan-app.fr" });
      }
    });
    renderOptions();
    track("preview", kind);
    // The route arrives from the server after the sheet opens: the card is drawn at once, then again with its route.
    if (route) Promise.resolve(route).then((shape) => {
      if (!shape || !live()) return;
      input.route = shape;
      renderOptions();
      void paint();
    }).catch(() => {});
    await paint();
    return live() ? sheet : null;
  }

  window.TitanStory = { draw, open, sessionInput, routeOf };
})();
