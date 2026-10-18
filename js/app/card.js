/* TITAN 300 — shareable image cards (record, week, sports DNA), drawn locally on a canvas.
   Nothing is uploaded: the athlete previews the image, then shares it or saves it. Never drawn: health,
   body weight, GPS, notes. Style follows the card piece worn in the Atelier. */
(function () {
  "use strict";
  const icon = (n, c) => window.titanIcon(n, c);
  const W = 1080;
  const H = 1350;
  const PAD = 88;
  const STYLES = {
    default: { bg: ["#05070a", "#0b1117"], glow: "rgba(61,217,232,0.16)", tx: "#eef3f7", tx2: "#a8b6c3", ac: "#3dd9e8", line: "rgba(150,180,205,0.22)", track: "rgba(150,180,205,0.14)" },
    "card-chalk": { bg: ["#eceee9", "#dfe3dd"], glow: "rgba(42,111,122,0.10)", tx: "#1b2228", tx2: "#4a5560", ac: "#2a6f7a", line: "rgba(27,34,40,0.18)", track: "rgba(27,34,40,0.10)" },
    "card-ember": { bg: ["#2a120a", "#7a3418"], glow: "rgba(244,187,84,0.18)", tx: "#fff3e6", tx2: "#f1cdb0", ac: "#f4bb54", line: "rgba(244,187,84,0.3)", track: "rgba(255,243,230,0.14)" },
    "card-obsidian": { bg: ["#07060b", "#1d1530"], glow: "rgba(182,147,255,0.18)", tx: "#efeaff", tx2: "#bdb2dc", ac: "#b693ff", line: "rgba(182,147,255,0.3)", track: "rgba(239,234,255,0.12)" },
  };
  const FAMILY = { endurance: "#3dd9e8", force: "#7c93ff", technique: "#b693ff", jeu: "#57d39b", mobilite: "#8ea2b3" };
  const DAYS = ["L", "M", "M", "J", "V", "S", "D"];

  /** The QR encoder (vendored, MIT) is only fetched when a QR is actually drawn. */
  let qrLoading = null;
  let qrAttempts = 0;
  function loadQr() {
    if (typeof window.qrcode === "function") return Promise.resolve(window.qrcode);
    return (qrLoading ||= new Promise((ok) => {
      const sc = document.createElement("script");
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        sc.onload = sc.onerror = null;
        const encoder = typeof window.qrcode === "function" ? window.qrcode : null;
        if (!encoder) sc.remove();
        qrLoading = null;
        ok(encoder);
      };
      // Keep the null-on-failure contract for profile callers, but let the next attempt retry.
      const timer = setTimeout(finish, 8000);
      // A removed, stalled script can still be in flight in the browser. A retry must not join it.
      const attempt = qrAttempts++;
      sc.src = `/js/vendor/qrcode-generator-1.4.4.js${attempt ? `?retry=${attempt}` : ""}`;
      sc.onload = sc.onerror = finish;
      document.head.append(sc);
    }));
  }

  // Only a definitive answer is kept for the page: a timeout or a network error asks again next time.
  const accountContext = () => ({ owner: window.state?.user?.id, client: window.titanClient, epoch: window.titanAccountTransition?.epoch });
  const accountCurrent = job => !!job.owner && job.owner === window.state?.user?.id && job.client === window.titanClient && job.epoch === window.titanAccountTransition?.epoch && !window.titanAccountTransition?.active;
  let linkPromise = null, linkContext = null;
  const resetLink = () => { linkPromise = linkContext = null; };
  window.addEventListener("titan:account-changing", resetLink);
  function publicLink() {
    const job = accountContext();
    if (!accountCurrent(job) || String(job.owner).startsWith("guest_") || !job.client || !navigator.onLine) return Promise.resolve(false);
    if (linkPromise && linkContext && linkContext.owner === job.owner && linkContext.client === job.client && linkContext.epoch === job.epoch) return linkPromise;
    linkContext = job;
    let request;
    request = (async () => {
      const r = await Promise.race([job.client.rpc("titan_public_card_settings"), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 3000))]);
      if (r?.error && r.error.code !== "PGRST202" && linkPromise === request) linkPromise = null;
      if (!accountCurrent(job)) return false;
      return r?.data?.enabled && r.data.slug ? `https://titan-app.fr/u/${r.data.slug}` : false;
    })().catch(() => { if (linkPromise === request) linkPromise = null; return false; });
    linkPromise = request;
    return request;
  }

  function style() {
    const id = window.titanShell?.look?.().card;
    return STYLES[id] || STYLES.default;
  }

  async function fonts() {
    try {
      await Promise.all([document.fonts.load('800 200px "Archivo"'), document.fonts.load('600 40px "Manrope"'), document.fonts.load('700 40px "Manrope"')]);
    } catch {}
  }

  const font = (weight, size, family = "Manrope") => `${weight} ${size}px "${family}", system-ui, sans-serif`;
  const display = (size) => `800 ${size}px "Archivo", "Arial Narrow", system-ui, sans-serif`;

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
  }

  /** Writes text and shrinks it until it fits the width. Returns the size used. */
  function fit(ctx, text, x, y, maxW, size, make) {
    let s = size;
    ctx.font = make(s);
    while (s > 40 && ctx.measureText(text).width > maxW) ctx.font = make((s -= 6));
    ctx.fillText(text, x, y);
    return s;
  }

  function wrap(ctx, text, x, y, maxW, lineH, maxLines = 3) {
    const words = String(text).split(/\s+/);
    let line = "";
    let n = 0;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, y + n * lineH);
        line = w;
        if (++n >= maxLines) return n;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, y + n * lineH), n++;
    return n;
  }

  function background(ctx, st) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, st.bg[0]);
    g.addColorStop(1, st.bg[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const r = ctx.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, W * 0.9);
    r.addColorStop(0, st.glow);
    r.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, W, H);
  }

  function header(ctx, st, eyebrow) {
    ctx.fillStyle = st.tx;
    ctx.font = display(46);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "6px";
    ctx.fillText("TITAN", PAD, 140);
    ctx.fillStyle = st.ac;
    ctx.font = font(700, 28);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "4px";
    ctx.fillText(String(eyebrow || "").toUpperCase(), PAD, 250);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  }

  function footer(ctx, st, name, qr) {
    ctx.strokeStyle = st.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, 1150);
    ctx.lineTo(W - PAD, 1150);
    ctx.stroke();
    ctx.fillStyle = st.tx;
    ctx.font = font(700, 36);
    if (name) ctx.fillText(name, PAD, 1232);
    ctx.fillStyle = st.tx2;
    ctx.font = font(600, 28);
    ctx.fillText(qr ? "Mon profil TITAN" : "titan-app.fr", PAD, name ? 1282 : 1232);
    if (qr && window.qrcode) {
      const q = window.qrcode(0, "M");
      q.addData(qr);
      q.make();
      const n = q.getModuleCount();
      const size = 150;
      const x = W - PAD - size;
      const y = 1172;
      ctx.fillStyle = "#ffffff";
      rr(ctx, x - 10, y - 10, size + 20, size + 20, 14);
      ctx.fill();
      ctx.fillStyle = "#05070a";
      const cell = size / n;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect(x + c * cell, y + r * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }

  function stats(ctx, st, list, y) {
    const colW = (W - PAD * 2) / Math.max(1, list.length);
    list.forEach(([label, value], i) => {
      const x = PAD + i * colW;
      ctx.fillStyle = st.tx2;
      ctx.font = font(600, 28);
      ctx.fillText(label, x, y);
      ctx.fillStyle = st.tx;
      fit(ctx, String(value), x, y + 78, colW - 24, 72, display);
    });
  }

  function familyBar(ctx, st, families, y) {
    const w = W - PAD * 2;
    let x = PAD;
    ctx.save();
    rr(ctx, PAD, y, w, 44, 22);
    ctx.clip();
    ctx.fillStyle = st.track;
    ctx.fillRect(PAD, y, w, 44);
    for (const f of families) {
      const fw = Math.max(6, w * f.share);
      ctx.fillStyle = FAMILY[f.id] || st.ac;
      ctx.fillRect(x, y, fw - 4, 44);
      x += fw;
    }
    ctx.restore();
    let ly = y + 100;
    ctx.font = font(600, 30);
    for (const f of families.slice(0, 4)) {
      ctx.fillStyle = FAMILY[f.id] || st.ac;
      rr(ctx, PAD, ly - 22, 22, 22, 6);
      ctx.fill();
      ctx.fillStyle = st.tx;
      ctx.fillText(`${f.label} · ${Math.round(f.share * 100)} %`, PAD + 40, ly);
      ly += 48;
    }
    return ly;
  }

  function dayBars(ctx, st, days, y) {
    const max = Math.max(60, ...days);
    const gap = 22;
    const bw = (W - PAD * 2 - gap * 6) / 7;
    days.forEach((m, i) => {
      const x = PAD + i * (bw + gap);
      ctx.fillStyle = st.track;
      rr(ctx, x, y, bw, 200, 14);
      ctx.fill();
      if (m > 0) {
        const h = Math.max(16, (m / max) * 200);
        ctx.fillStyle = st.ac;
        rr(ctx, x, y + 200 - h, bw, h, 14);
        ctx.fill();
      }
      ctx.fillStyle = st.tx2;
      ctx.font = font(700, 26);
      ctx.textAlign = "center";
      ctx.fillText(DAYS[i], x + bw / 2, y + 246);
      ctx.textAlign = "left";
    });
  }

  /** Draws the card and returns the canvas. */
  async function draw(o, { qr = null } = {}) {
    await fonts();
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    const st = style();
    background(ctx, st);
    header(ctx, st, o.eyebrow);
    const maxW = W - PAD * 2;
    if (o.kind === "record") {
      ctx.fillStyle = st.tx2;
      ctx.font = font(700, 50);
      wrap(ctx, o.title, PAD, 360, maxW, 60, 2);
      ctx.fillStyle = st.tx;
      fit(ctx, o.value, PAD, 640, maxW, 230, display);
      ctx.fillStyle = st.ac;
      ctx.font = font(700, 40);
      if (o.detail) ctx.fillText(o.detail, PAD, 740);
      ctx.fillStyle = st.tx2;
      ctx.font = font(600, 34);
      if (o.date) ctx.fillText(o.date, PAD, o.detail ? 800 : 740);
      if (o.context) {
        ctx.font = font(600, 30);
        wrap(ctx, o.context, PAD, 900, maxW, 42, 3);
      }
    } else if (o.kind === "week") {
      ctx.fillStyle = st.tx;
      ctx.font = display(96);
      const n = wrap(ctx, o.title, PAD, 380, maxW, 100, 2);
      ctx.fillStyle = st.tx2;
      ctx.font = font(600, 34);
      if (o.detail) wrap(ctx, o.detail, PAD, 380 + n * 100 + 10, maxW, 46, 2);
      stats(ctx, st, o.stats || [], 700);
      if (o.days) dayBars(ctx, st, o.days, 860);
    } else {
      ctx.fillStyle = st.tx;
      ctx.font = display(96);
      wrap(ctx, o.title, PAD, 380, maxW, 100, 1);
      const ly = familyBar(ctx, st, o.families || [], 450);
      stats(ctx, st, o.stats || [], Math.max(ly + 50, 860));
      if (o.detail) {
        ctx.fillStyle = st.tx2;
        ctx.font = font(600, 30);
        wrap(ctx, o.detail, PAD, Math.max(ly + 50, 860) + 150, maxW, 42, 2);
      }
    }
    if (qr && !(await loadQr())) {
      const error = new Error("QR encoder unavailable");
      error.code = "CARD_QR_UNAVAILABLE";
      throw error;
    }
    footer(ctx, st, o.name || "", qr);
    return c;
  }

  const blobOf = (canvas) => new Promise((ok, fail) => canvas.toBlob((b) => b ? ok(b) : fail(new Error("PNG unavailable")), "image/png"));

  /** Preview sheet with Share / Save. */
  async function open(o) {
    const job = accountContext();
    if (!accountCurrent(job) || (o.isCurrent && !o.isCurrent())) return null;
    let cancelled = false, sheet = null;
    const current = () => !cancelled && accountCurrent(job) && (!o.isCurrent || o.isCurrent());
    const cleanup = () => {
      window.removeEventListener("titan:account-changing", stop);
      window.removeEventListener("titan:account-changed", stop);
      window.removeEventListener("titan:history-updated", check);
    };
    function stop() { cancelled = true; if (sheet?.open) sheet.close(); cleanup(); }
    function check() { if (!current()) stop(); }
    window.addEventListener("titan:account-changing", stop);
    window.addEventListener("titan:account-changed", stop);
    window.addEventListener("titan:history-updated", check);
    const link = await publicLink();
    if (!current()) { cleanup(); return null; }
    const body = document.createElement("div");
    body.className = "asc-stack cd-sheet";
    body.innerHTML = `<div class="cd-preview"><img alt="Aperçu de l’image" width="${W}" height="${H}"></div>
      ${link ? `<label class="auth-check"><input type="checkbox" data-qr checked><span>Ajouter le QR de mon profil public</span></label>` : ""}
      <p class="asc-small asc-muted">${icon("lock")} L’image est créée sur ton appareil. Rien n’est publié tant que tu ne la partages pas.</p>
      <p class="asc-small asc-muted" role="status" data-card-status></p>
      <p class="asc-small jr-edit-error" role="alert" data-card-error hidden></p>
      <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-card-retry hidden>Réessayer l’aperçu</button>
      <div class="asc-confirm-actions" data-card-actions aria-busy="false"><button type="button" class="asc-btn asc-btn-secondary" data-save>${icon("download")} Enregistrer</button><button type="button" class="asc-btn asc-btn-primary" data-share>${icon("share")} Partager</button></div>`;
    sheet = window.titanShell.sheet({ title: "Image à partager", eyebrow: o.eyebrow || "TITAN", body, onClose: stop });
    const img = body.querySelector("img");
    const qr = body.querySelector("[data-qr]");
    const shareBtn = body.querySelector("[data-share]");
    const saveBtn = body.querySelector("[data-save]");
    const retry = body.querySelector("[data-card-retry]");
    const actions = body.querySelector("[data-card-actions]");
    const status = body.querySelector("[data-card-status]");
    const error = body.querySelector("[data-card-error]");
    const available = () => {
      if (!current()) { stop(); return false; }
      return sheet.isConnected && sheet.open;
    };
    let canvas = null;
    let file = null;
    let pending = false;
    let painting = false;
    let paintSequence = 0;
    const syncActions = () => {
      actions.setAttribute("aria-busy", String(pending || painting));
      saveBtn.disabled = shareBtn.disabled = pending || painting || !canvas;
      if (qr) qr.disabled = pending;
      retry.disabled = pending || painting;
      retry.hidden = pending || painting || Boolean(canvas);
    };
    const paint = async () => {
      if (pending || !available()) return;
      const sequence = ++paintSequence;
      const retryHadFocus = document.activeElement === retry;
      painting = true;
      canvas = null;
      file = null;
      img.removeAttribute("src");
      error.textContent = "";
      error.hidden = true;
      status.textContent = "Création de l’image…";
      syncActions();
      try {
        const next = await draw(o, { qr: link && qr?.checked ? link : null });
        if (sequence !== paintSequence || !available()) return;
        const preview = next.toDataURL("image/png");
        canvas = next;
        img.src = preview;
      } catch (e) {
        if (sequence === paintSequence && available()) {
          error.textContent = e?.code === "CARD_QR_UNAVAILABLE"
            ? "Le QR n’a pas pu être chargé. Réessaie l’aperçu ou décoche le QR pour créer l’image sans lien de profil."
            : "L’aperçu n’a pas pu être créé. Réessaie avant d’enregistrer ou de partager l’image.";
          error.hidden = false;
        }
      } finally {
        if (sequence === paintSequence) {
          painting = false;
          syncActions();
          if (available()) {
            status.textContent = "";
            if (retryHadFocus && [document.body, sheet].includes(document.activeElement)) (canvas ? saveBtn : retry).focus({ preventScroll: true });
          }
        }
      }
    };
    qr?.addEventListener("change", () => { void paint(); });
    retry.addEventListener("click", () => { void paint(); });
    const ensureFile = async () => (file ||= new File([await blobOf(canvas)], `${o.filename || "titan"}.png`, { type: "image/png" }));
    const canShareFiles = (f) => Boolean(navigator.canShare && navigator.share && navigator.canShare({ files: [f] }));
    const act = async (kind, button) => {
      if (pending || painting || !canvas || !available()) return;
      pending = true;
      const hadFocus = document.activeElement === button;
      const controls = [...body.querySelectorAll("button, input")].map(el => [el, el.disabled]);
      controls.forEach(([el]) => { el.disabled = true; });
      actions.setAttribute("aria-busy", "true");
      error.textContent = "";
      error.hidden = true;
      status.textContent = "Préparation de l’image…";
      try {
        const f = await ensureFile();
        if (!available()) return;
        if (kind === "share" && canShareFiles(f)) {
          status.textContent = "Partage en cours…";
          try {
            await navigator.share({ files: [f], title: "TITAN" });
          } catch (e) {
            if (e?.name !== "AbortError") throw e;
          }
        } else save(f);
      } catch {
        if (available()) {
          error.textContent = "L’image n’a pas pu être enregistrée ou partagée. Réessaie, ou utilise Enregistrer si le partage reste indisponible.";
          error.hidden = false;
        }
      } finally {
        pending = false;
        controls.forEach(([el, disabled]) => { el.disabled = disabled; });
        syncActions();
        status.textContent = "";
        if (available() && hadFocus && [document.body, sheet].includes(document.activeElement)) button.focus({ preventScroll: true });
      }
    };
    shareBtn.addEventListener("click", () => act("share", shareBtn));
    saveBtn.addEventListener("click", () => act("save", saveBtn));
    function save(f) {
      const url = URL.createObjectURL(f);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      window.titanShell.toast({ type: "ok", title: "Image enregistrée", message: "Retrouve-la dans tes téléchargements." });
    }
    await paint();
    return current() && sheet.open ? sheet : null;
  }

  const userName = () => {
    const u = window.titanShell?.user?.();
    return u && !u.guest ? u.name : "";
  };

  window.TitanCard = { draw, open, userName, loadQr, STYLES, resetLink };
})();
