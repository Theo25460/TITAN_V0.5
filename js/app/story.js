/* « Partager » (before V2) — the 9:16 story card of a session or a success, drawn on the device at 1080 × 1920.
   The content rules are shared with Android (js/core/share-story.js); the layout mirrors mobile/src/components/StoryCard.tsx on the
   same 1080 grid. The athlete previews the exact picture, chooses what it shows (name off by default, date and confirmed XP can be
   hidden), then shares the file where the browser really supports it, or downloads it. Nothing is uploaded or published by TITAN;
   no session, reward, visibility or profile setting changes here. Never drawn: GPS trace, place, coordinates, note, body signals. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const S = () => window.TitanShareStory;
  const C = { bg: "#090C10", bg2: "#131920", line2: "rgba(226,234,236,0.17)", tx: "#F1F3EF", tx2: "#AEB7BD", tx3: "#838E97", cy: "#3DD9E8", am: "#F4BB54" };

  /* ---------- Inputs: only what the opening screen already shows ---------- */
  const userName = () => {
    const u = window.titanShell?.user?.();
    return u && !u.guest ? u.name || "" : "";
  };

  /** A session as the moment and the journal sheet show it: the client's own measures, a record it set, and the XP the server
      confirmed (none while pending, refused, held or for a historical session). */
  function sessionInput(log) {
    const metrics = window.TitanMoment?.metrics?.(log) || [];
    const rec = (window.TitanMoment?.records?.(log) || []).find((r) => !r.first);
    const F = window.TitanFormat;
    const rw = window.TitanMoment?.reward?.(log);
    const historical = window.TitanEffort?.isHistorical?.(log.date) || Boolean(log.details?.historical);
    const confirmed = rw && (rw.state === "confirmed" || rw.state === "capped");
    const level = confirmed && Number(rw.levelAfter) > 0 ? Number(rw.levelAfter) : null;
    let rankName = null;
    try { rankName = level ? window.TitanEffort?.rank?.(level)?.name || null : null; } catch { rankName = null; }
    return {
      sport: window.TitanSports?.label?.(log.sport) || log.sport,
      sportId: log.sport,
      metrics,
      record: rec ? { label: rec.label, value: F.recordValue(rec.unit, rec.value), previous: rec.previous ? F.recordValue(rec.unit, rec.previous.value) : null } : null,
      xp: confirmed && !historical ? { confirmed: true, amount: Number(rw.xp) || 0, level, rankName } : null,
      date: log.date,
      name: userName(),
      historical,
    };
  }

  /* ---------- Drawing ---------- */
  const { width: W, height: H } = { width: 1080, height: 1920 };

  async function fonts() {
    try {
      await Promise.all(['800 condensed 100px "Archivo"', '300 extra-condensed 100px "Archivo"', '700 extra-condensed 100px "Archivo"', '600 40px "Archivo"', '400 40px "Archivo"', '700 40px "Archivo"'].map((f) => document.fonts.load(f)));
    } catch {}
  }
  /** Archivo is variable in width: display is condensed, figures are extra-condensed (DESIGN.md), as on Android. */
  function setFont(ctx, weight, size, stretch = "normal") {
    ctx.font = `${weight} ${size}px "Archivo", system-ui, sans-serif`;
    if ("fontStretch" in ctx) ctx.fontStretch = stretch;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  }
  const CUT = {
    display: (ctx, size) => setFont(ctx, 800, size, "condensed"),
    figure: (ctx, size) => setFont(ctx, 300, size, "extra-condensed"),
    figureBold: (ctx, size) => setFont(ctx, 700, size, "extra-condensed"),
    semi: (ctx, size) => setFont(ctx, 600, size),
    text: (ctx, size) => setFont(ctx, 400, size),
    bold: (ctx, size) => setFont(ctx, 700, size),
  };
  /** Same rule as Android's fitSize: the largest size up to `base` for `room` px, from an average advance in font sizes. */
  const fitSize = (text, base, room, em) => Math.max(Math.round(base * 0.4), Math.min(base, Math.floor(room / Math.max(1, [...String(text)].length * em))));

  /** Cuts `text` to `maxLines` lines of `maxW` px (measured with the current font), the last one ending with an ellipsis if needed. */
  function lines(ctx, text, maxW, maxLines) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const out = [];
    let line = "";
    for (let i = 0; i < words.length; i++) {
      const test = line ? `${line} ${words[i]}` : words[i];
      if (ctx.measureText(test).width <= maxW || !line) { line = test; continue; }
      out.push(line);
      line = words[i];
      if (out.length === maxLines) { line = ""; out[maxLines - 1] = ellipsis(ctx, `${out[maxLines - 1]} ${words.slice(i).join(" ")}`, maxW); break; }
    }
    if (line) out.push(line);
    return out.map((l) => (ctx.measureText(l).width > maxW ? ellipsis(ctx, l, maxW) : l));
  }
  function ellipsis(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
    return `${t.replace(/[\s,.;:·–-]+$/, "")}…`;
  }
  /** One line shrunk until it fits (never below `min`), then cut. Returns the size used. */
  function fitLine(ctx, cut, text, maxW, size, min) {
    let s = size;
    cut(ctx, s);
    while (s > min && ctx.measureText(text).width > maxW) cut(ctx, (s -= 4));
    return { size: s, text: ellipsis(ctx, text, maxW) };
  }

  /** The TITAN mark (image/titan-mark.svg, the app icon): two chevrons on a night square, drawn as vectors so it is always sharp. */
  function mark(ctx, x, y, size) {
    const k = size / 100;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#05070a";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(0, 0, size, size, 22 * k) : ctx.rect(0, 0, size, size);
    ctx.fill();
    ctx.strokeStyle = C.cy;
    ctx.lineWidth = 3.2 * 3.125 * k;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const chevron = (dy, alpha) => {
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(9 * 3.125 * k, (15.5 + dy) * 3.125 * k);
      ctx.lineTo(16 * 3.125 * k, (8.5 + dy) * 3.125 * k);
      ctx.lineTo(23 * 3.125 * k, (15.5 + dy) * 3.125 * k);
      ctx.stroke();
    };
    chevron(0, 1);
    chevron(8, 0.5);
    ctx.restore();
  }

  /** The glyph of the discipline (or a trophy for a success) as an image, in the accent colour; null if it cannot be loaded. */
  function glyph(name, color) {
    return new Promise((ok) => {
      if (!window.titanIcon) return ok(null);
      const svg = window.titanIcon(name).replace("<svg ", `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" style="color:${color}" `);
      const img = new Image();
      const timer = setTimeout(() => ok(null), 1500);
      img.onload = () => { clearTimeout(timer); ok(img); };
      img.onerror = () => { clearTimeout(timer); ok(null); };
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
  }
  function iconName(sportId, kind) {
    try { if (sportId && window.TitanSports?.iconOf) return window.TitanSports.iconOf(sportId); } catch {}
    return kind === "achievement" ? "trophy" : "bolt";
  }

  /** Draws a model (TitanShareStory.session/achievement) and returns the 1080 × 1920 canvas. */
  async function draw(model, { sportId = null } = {}) {
    await fonts();
    const SAFE = S().SAFE;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    ctx.textBaseline = "top";
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    const left = SAFE.side;
    const room = W - SAFE.side * 2;
    const accent = model.accent === "amber" ? C.am : C.cy;
    const dense = Boolean(model.highlight) || (Boolean(model.xp) && model.facts.length > 0);
    const top = SAFE.top;
    const bottom = H - SAFE.bottom;

    // Brand row.
    mark(ctx, left, top, 92);
    CUT.display(ctx, 70);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "9px";
    ctx.fillStyle = C.tx;
    ctx.fillText("TITAN", left + 92 + 26, top + 8);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    if (model.date) {
      CUT.semi(ctx, 32);
      ctx.fillStyle = C.tx2;
      ctx.textAlign = "right";
      ctx.fillText(ellipsis(ctx, model.date, room - 400), W - SAFE.side, top + 28);
      ctx.textAlign = "left";
    }

    // Footer, from the bottom margin up.
    const footer = [];
    if (model.name) footer.push({ cut: CUT.bold, size: 44, color: C.tx, text: model.name });
    footer.push({ cut: CUT.semi, size: 36, color: C.tx, text: model.tagline });
    footer.push({ cut: CUT.semi, size: 36, color: C.cy, text: model.url });
    const footerH = footer.reduce((n, f) => n + f.size * 1.12, 0) + (footer.length - 1) * 6;
    const footerTop = bottom - footerH;
    ctx.fillStyle = C.line2;
    ctx.fillRect(left, footerTop - 28 - 3, room, 3);
    let fy = footerTop;
    for (const f of footer) {
      f.cut(ctx, f.size);
      ctx.fillStyle = f.color;
      ctx.fillText(ellipsis(ctx, f.text, room), left, fy + f.size * 0.06);
      fy += f.size * 1.12 + 6;
    }

    // The middle block: laid out first, then centred between the brand row and the footer rule.
    const blocks = [];
    const titleSize = dense ? 92 : 108;
    CUT.display(ctx, titleSize);
    const titleLines = lines(ctx, model.title, room, model.highlight ? 1 : 2);
    blocks.push({ h: 60 + 14 + titleLines.length * titleSize * 1.06, paint: async (y) => {
      const img = await glyph(iconName(sportId, model.kind), accent);
      if (img) ctx.drawImage(img, left, y, 60, 60);
      CUT.semi(ctx, 40);
      ctx.fillStyle = accent;
      ctx.fillText(ellipsis(ctx, model.eyebrow, room - 78), left + (img ? 78 : 0), y + 8);
      CUT.display(ctx, titleSize);
      ctx.fillStyle = C.tx;
      titleLines.forEach((l, i) => ctx.fillText(l, left, y + 74 + i * titleSize * 1.06 + titleSize * 0.03));
    } });
    if (model.hero) {
      const size = fitSize(model.hero.value, dense ? 200 : 300, room, 0.4);
      blocks.push({ h: size + (model.hero.label ? 45 : 0), paint: (y) => {
        const hero = fitLine(ctx, CUT.figure, model.hero.value, room, size, size * 0.5);
        if ("letterSpacing" in ctx) ctx.letterSpacing = "-3px";
        ctx.fillStyle = C.tx;
        ctx.fillText(hero.text, left - 4, y - hero.size * 0.04);
        if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
        if (model.hero.label) {
          CUT.semi(ctx, 40);
          ctx.fillStyle = C.tx2;
          ctx.fillText(ellipsis(ctx, model.hero.label, room), left, y + size + 2);
        }
      } });
    }
    if (model.facts.length) {
      blocks.push({ h: 34 + 36 + 6 + 85, paint: (y) => {
        ctx.fillStyle = C.line2;
        ctx.fillRect(left, y, room, 3);
        const n = model.facts.length;
        const col = (room - 28 * (n - 1)) / n;
        model.facts.forEach(([label, value], i) => {
          const x = left + i * (col + 28);
          CUT.semi(ctx, 32);
          ctx.fillStyle = C.tx3;
          ctx.fillText(ellipsis(ctx, label, col), x, y + 34);
          const v = fitLine(ctx, CUT.figureBold, value, col, 76, 46);
          ctx.fillStyle = C.tx;
          ctx.fillText(v.text, x, y + 34 + 36 + 6 + (76 - v.size) * 0.5);
        });
      } });
    }
    if (model.highlight) {
      const h = model.highlight;
      const vSize = fitSize(h.value, 96, room - 64, 0.45);
      const height = 32 + 40 + 6 + vSize * 1.12 + (h.detail ? 6 + 38 : 0) + 32;
      blocks.push({ h: height, paint: (y) => {
        ctx.fillStyle = C.bg2;
        ctx.beginPath();
        // La coupe: the 45° corner of what is primary (DESIGN.md § 11).
        const cut = 40, r = 12;
        ctx.moveTo(left + r, y);
        ctx.lineTo(left + room - r, y);
        ctx.quadraticCurveTo(left + room, y, left + room, y + r);
        ctx.lineTo(left + room, y + height - cut);
        ctx.lineTo(left + room - cut, y + height);
        ctx.lineTo(left + r, y + height);
        ctx.quadraticCurveTo(left, y + height, left, y + height - r);
        ctx.lineTo(left, y + r);
        ctx.quadraticCurveTo(left, y, left + r, y);
        ctx.fill();
        CUT.semi(ctx, 36);
        ctx.fillStyle = C.am;
        ctx.fillText(ellipsis(ctx, h.label, room - 64), left + 32, y + 32);
        const v = fitLine(ctx, CUT.figureBold, h.value, room - 64, vSize, vSize * 0.5);
        ctx.fillText(v.text, left + 32, y + 32 + 40 + 6);
        if (h.detail) {
          CUT.text(ctx, 34);
          ctx.fillStyle = C.tx2;
          ctx.fillText(ellipsis(ctx, h.detail, room - 64), left + 32, y + 32 + 40 + 6 + vSize * 1.12 + 6);
        }
      } });
    }
    if (model.progress) {
      CUT.text(ctx, 42);
      const pl = lines(ctx, model.progress, room, 2);
      blocks.push({ h: pl.length * 47, paint: (y) => {
        CUT.text(ctx, 42);
        ctx.fillStyle = C.tx2;
        pl.forEach((l, i) => ctx.fillText(l, left, y + i * 47));
      } });
    }
    if (model.xp || model.level) {
      blocks.push({ h: 88, paint: (y) => {
        let x = left;
        if (model.xp) {
          CUT.figureBold(ctx, 84);
          ctx.fillStyle = C.cy;
          ctx.fillText(model.xp, x, y);
          x += ctx.measureText(model.xp).width + 24;
        }
        if (model.level) {
          CUT.semi(ctx, 36);
          ctx.fillStyle = C.tx2;
          ctx.fillText(ellipsis(ctx, model.level, left + room - x), x, y + 42);
        }
      } });
    }
    const gap = dense ? 24 : 40;
    const total = blocks.reduce((n, b) => n + b.h, 0) + gap * (blocks.length - 1);
    const areaTop = top + 92, areaBottom = footerTop - 31;
    let y = Math.max(areaTop + 24, areaTop + (areaBottom - areaTop - total) / 2);
    for (const b of blocks) {
      await b.paint(y);
      y += b.h + gap;
    }
    return c;
  }

  const blobOf = (canvas) => new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("PNG unavailable"))), "image/png"));

  /** Product analytics of the flow: consent is applied by TitanAnalytics; only `kind` leaves the page, never a sport or a value. */
  const track = (event, kind) => { try { void window.TitanAnalytics?.track?.(S().EVENTS[event], { kind }); } catch {} };

  /* ---------- Preview sheet ---------- */
  /** `request`: { kind: "session" | "achievement", input }. `isCurrent`: false once the account or the source changed. */
  async function open(request, { isCurrent = () => true } = {}) {
    if (!S() || !window.titanShell?.sheet) return null;
    const accountOf = () => ({ owner: window.state?.user?.id, epoch: window.titanAccountTransition?.epoch });
    const job = accountOf();
    const current = () => !closed && isCurrent() && job.owner === window.state?.user?.id && job.epoch === window.titanAccountTransition?.epoch && !window.titanAccountTransition?.active;
    let closed = false;
    const kind = request.kind === "achievement" ? "achievement" : "session";
    const available = S().availableOptions(request.input);
    const choice = { ...S().DEFAULTS };
    const build = () => (kind === "achievement" ? S().achievement(request.input, choice) : S().session(request.input, choice));
    const body = document.createElement("div");
    body.className = "asc-stack cd-sheet st-sheet";
    body.innerHTML = `<div class="cd-preview st-preview"><img alt="Aperçu de l’image à partager" width="${W}" height="${H}"></div>
      <p class="asc-small asc-muted">${icon("lock")} Aperçu de l’image 1080 × 1920, créée sur ton appareil. Rien n’est publié tant que tu ne la partages pas.</p>
      ${available.length ? `<fieldset class="st-options"><legend class="asc-eyebrow">Ce que montre l’image</legend>${available.map((id) => `<label class="auth-check"><input type="checkbox" data-option="${id}" ${choice[id] ? "checked" : ""}><span>${esc(S().OPTION_LABELS[id])}</span></label>`).join("")}</fieldset>` : ""}
      <p class="asc-small asc-faint">Jamais sur l’image : tracé GPS, lieu, adresse, notes, ressenti ou données de santé. La visibilité de ta séance et de ton profil ne change pas.</p>
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
    const img = $("img"), status = $("[data-story-status]"), error = $("[data-story-error]"), retry = $("[data-story-retry]");
    const shareBtn = $("[data-story-share]"), saveBtn = $("[data-story-save]"), actions = $("[data-story-actions]"), help = $("[data-story-help]");
    let canvas = null, file = null, painting = false, pending = false, sequence = 0, failedAction = "paint";
    const live = () => { if (!current()) { if (sheet.open) sheet.close(); return false; } return sheet.isConnected && sheet.open; };
    const sync = () => {
      actions.setAttribute("aria-busy", String(pending || painting));
      shareBtn.disabled = saveBtn.disabled = pending || painting || !canvas;
      body.querySelectorAll("[data-option]").forEach((el) => { el.disabled = pending; });
      retry.hidden = pending || painting || !error.textContent;
    };
    const fail = (message, action) => { failedAction = action; error.textContent = message; error.hidden = false; sync(); };
    const canShareFiles = (f) => Boolean(navigator.share && navigator.canShare && navigator.canShare({ files: [f] }));
    help.textContent = navigator.share && navigator.canShare ? "« Partager » ouvre le partage de ton appareil : tu choisis l’application et ce que tu publies." : "Ce navigateur ne partage pas les images : « Partager » télécharge l’image, à publier ensuite depuis l’application de ton choix.";

    async function paint() {
      if (pending || !live()) return;
      const seq = ++sequence;
      painting = true; canvas = null; file = null;
      img.removeAttribute("src");
      error.textContent = ""; error.hidden = true;
      status.textContent = "Création de l’image…";
      sync();
      try {
        const next = await draw(build(), { sportId: request.input.sportId || null });
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
    track("preview", kind);
    await paint();
    return live() ? sheet : null;
  }

  window.TitanStory = { draw, open, sessionInput, fitSize };
})();
