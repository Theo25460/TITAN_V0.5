/* V1.6.4 — Migration de l’historique, website side. The reading rules are shared with Android (js/core/history-migration.js); this
   file shows them: choose a file, check its columns and classify the unknown sports, see what each row will become against the journal,
   send the batch in chunks the server records row by row (titan_import_batch_rows_v1), and read the batch report back from the server
   (titan_import_batch_v1) — on this device or another — with a withdrawal whose effects are shown before anything changes.
   Nothing is kept on the device: the server knows the next row of a batch, so reopening the same file resumes it. */
(function () {
  "use strict";
  const M = () => window.TitanMigration;
  const SP = () => window.TitanSports;
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const owner = () => window.state?.user?.id || "";
  const isGuest = () => !owner() || String(owner()).startsWith("guest_");
  const icon = (n) => window.titanIcon?.(n) || "";
  const nf = (n) => Number(n || 0).toLocaleString("fr-FR");
  /** « 1 ajoutée », « 3 ajoutées »: the count and its word agree. */
  const pl = (n, one, many = `${one}s`) => `${nf(n)} ${Number(n) > 1 ? many : one}`;
  const PLAN = { add: "À ajouter", link: "Déjà au journal", review: "À vérifier", skip: "Ignorées" };
  const STATUS = { open: "En cours", done: "Terminé", withdrawn: "Retiré" };
  const WITHDRAWN = { removed: "retirée", detached: "lien défait, séance gardée", kept_corrected: "gardée (corrigée depuis)", kept_linked: "gardée (une autre source s’y rattache)", kept_split: "gardée (séparée par toi)", kept_rewarded: "gardée (récompensée)", gone: "déjà supprimée", none: "" };
  const ERR = {
    RATE_LIMITED: "Trop d’envois en peu de temps. Réessaie dans une heure : l’import reprendra où il s’est arrêté.",
    IMPORT_BATCH_TOO_MANY: "Tu as déjà 5 imports en cours. Termine-les ou retire-les avant d’en commencer un autre.",
    IMPORT_BATCH_WITHDRAWN: "Ce lot a été retiré. Rouvre le fichier pour l’importer de nouveau.",
    IMPORT_BATCH_UNKNOWN: "Ce lot n’existe plus dans ton compte.",
    PROFILE_UNAVAILABLE: "Ton compte ne peut pas importer pour le moment.",
  };
  const message = (e) => {
    const m = String(e?.message || "").trim();
    if (ERR[m]) return ERR[m];
    if (e?.code === "PGRST202" || /Could not find the function/.test(m)) return "L’import d’historique n’est pas encore ouvert sur le serveur.";
    return navigator.onLine ? "Le serveur n’a pas répondu. Réessaie : l’import reprend à la ligne où il s’est arrêté." : "Tu es hors ligne. Reconnecte-toi puis reprends : rien n’est perdu.";
  };
  async function rpc(name, args) {
    const { data, error } = await window.titanClient.rpc(name, args);
    if (error) throw error;
    return data;
  }
  const TZS = ["Europe/Paris", "Europe/Brussels", "Europe/Zurich", "Europe/London", "UTC", "America/Montreal", "America/New_York", "America/Los_Angeles", "Africa/Casablanca", "Indian/Reunion", "Pacific/Noumea"];
  const deviceTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris"; } catch { return "Europe/Paris"; } };

  let st = null;
  let sheet = null;
  const fresh = () => ({ step: "pick", owner: owner(), file: null, parsed: null, preview: null, opts: { tz: deviceTz(), order: null, allowDateOnly: false, sportMap: {}, mapping: null }, mapError: null,
    batch: null, report: null, filter: "", offset: 0, busy: false, error: "", paused: "", batches: null });

  const dayTime = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"; };
  const label = (id) => SP()?.label?.(id) || id || "";
  function itemLine(r) {
    if (r.status !== "ready") return `Ligne ${r.row} · ${esc(M().REASONS[r.reason] || r.reason)}${r.sportRaw ? ` (« ${esc(r.sportRaw)} »)` : ""}`;
    const it = r.item;
    const bits = [label(it.sport), dayTime(it.startedAt), `${String(it.minutes).replace(".", ",")} min`];
    if (it.km) bits.push(`${String(it.km).replace(".", ",")} km`);
    if (it.value) bits.push(`${nf(it.value)} ${it.unit}`);
    const why = r.plan === "link" || r.plan === "review" ? (r.with?.inFile ? " — même effort qu’une ligne plus haut" : ` — avec ta séance du ${dayTime(r.with?.date)}`) : "";
    const dst = r.dst === "gap" ? " — heure d’été : heure sautée, avancée d’une heure" : r.dst === "repeated" ? " — heure d’hiver : première des deux" : "";
    return `Ligne ${r.row} · ${esc(bits.join(" · "))}${esc(why)}${esc(dst)}`;
  }

  /* ---------- steps ---------- */
  function pickHtml() {
    const list = st.batches;
    return `<div class="asc-stack" data-mig-step="pick">
      <p class="asc-small">Fais entrer des années de pratique dans ton journal. Les séances de plus de 30 jours entrent comme historique : comptées dans tes totaux et tes records, sans XP ni crédit. Une séance déjà au journal n’est jamais doublée et tes corrections ne sont jamais remplacées.</p>
      <ul class="asc-small mig-formats">
        <li><strong>Export TITAN</strong> : le CSV « Exporter (CSV) » du journal, ou le JSON « Exporter toutes mes données ».</li>
        <li><strong>CSV « TITAN historique v1 »</strong> : colonnes date, heure, sport, durée, distance, unité, ressenti, note, identifiant (ordre libre, « ; » ou « , »). <button type="button" class="asc-link" data-mig-template>Télécharger le modèle</button></li>
        <li><strong>Strava</strong> : activities.csv de l’archive de ton compte.</li>
      </ul>
      <label class="asc-btn asc-btn-primary mig-file">${icon("upload")} Choisir un fichier<input type="file" accept=".csv,.json,.txt,text/csv,application/json" data-mig-file class="sr-only"></label>
      ${st.error ? `<p class="asc-small" role="alert" data-mig-error>${esc(st.error)}</p>` : ""}
      <section class="asc-stack-sm" aria-label="Mes imports"><p class="asc-eyebrow">Mes imports</p>
      ${list === null ? `<p class="asc-small asc-muted">Chargement…</p>` : !list.length ? `<p class="asc-small asc-muted">Aucun import pour le moment.</p>`
        : `<ul class="mig-batches">${list.map((b) => `<li data-mig-batch="${esc(b.id)}"><span><strong>${esc(b.file_name || M().FORMATS[b.format] || "Fichier")}</strong> · ${esc(STATUS[b.status] || b.status)}${b.status === "open" ? ` (${nf(b.done_rows)}/${nf(b.total_rows)} lignes)` : ""}<br><small>${esc(dayTime(b.created_at))} · ${pl(b.counts.added, "ajoutée")} · ${pl(b.counts.linked, "associée")} · ${pl(b.counts.duplicate, "déjà importée", "déjà importées")} · ${pl(b.counts.skipped, "ignorée")}</small>${b.status === "open" ? `<br><small>Pour reprendre, choisis à nouveau ce fichier.</small>` : ""}</span><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-mig-report="${esc(b.id)}">Rapport</button></li>`).join("")}</ul>`}
      </section></div>`;
  }

  function mapHtml() {
    const head = st.mapError?.head || st.parsed?.head || [];
    const map = st.opts.mapping || st.mapError?.mapping || {};
    const fields = [["date", "Date", true], ["time", "Heure", false], ["sport", "Sport", true], ["duration", "Durée", true], ["distance", "Distance", false], ["unit", "Unité de distance", false], ["rpe", "Ressenti", false], ["note", "Note", false], ["id", "Identifiant", false]];
    const sel = (f, req) => `<select class="jr-select" data-mig-map="${f}" aria-label="Colonne ${f}"><option value="-1">${req ? "— à choisir —" : "— aucune —"}</option>${head.map((h, i) => `<option value="${i}" ${Number(map[f]) === i ? "selected" : ""}>${esc(h || `Colonne ${i + 1}`)}</option>`).join("")}</select>`;
    return `<div class="asc-stack" data-mig-step="map"><p class="asc-small">${st.mapError ? esc(st.mapError.message) + " " : ""}Indique quelle colonne de ton fichier correspond à chaque donnée.</p>
      <div class="mig-grid">${fields.map(([f, l, req]) => `<label class="asc-small">${esc(l)}${req ? " *" : ""}${sel(f, req)}</label>`).join("")}
        <label class="asc-small">Durée exprimée en<select class="jr-select" data-mig-opt="durationUnit">${[["min", "minutes"], ["s", "secondes"], ["h", "heures"]].map(([k, l]) => `<option value="${k}" ${(map.durationUnit || "min") === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="asc-small">Distance exprimée en<select class="jr-select" data-mig-opt="distanceUnit">${[["km", "km"], ["m", "mètres"], ["mi", "miles"]].map(([k, l]) => `<option value="${k}" ${(map.distanceUnit || "km") === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-mig-back>Changer de fichier</button><button type="button" class="asc-btn asc-btn-primary" data-mig-apply-map>Voir l’aperçu</button></div></div>`;
  }

  function sportOptions(selected) {
    const all = (SP()?.all?.() || []).slice().sort((a, b) => a.label.localeCompare(b.label, "fr"));
    return `<option value="">— à classer —</option><option value="skip" ${selected === "skip" ? "selected" : ""}>Ignorer ces lignes</option>${all.map((s) => `<option value="${esc(s.id)}" ${selected === s.id ? "selected" : ""}>${esc(s.label)}</option>`).join("")}`;
  }

  function previewHtml() {
    const p = st.preview, parsed = st.parsed;
    const local = parsed.format === "csv_profile";
    const unknown = Object.entries(parsed.unknownSports);
    const pending = unknown.filter(([k]) => !st.opts.sportMap[k]).length;
    const group = (plan) => {
      const list = p.rows.filter((r) => r.plan === plan);
      if (!list.length) return "";
      const shown = list.slice(0, 100);
      return `<details class="mig-group" data-mig-plan="${plan}"${plan === "skip" || plan === "review" ? " open" : ""}><summary><strong>${PLAN[plan]}</strong> · <span data-mig-count="${plan}">${nf(list.length)}</span></summary>
        <ul class="asc-small">${shown.map((r) => `<li data-mig-row="${r.row}">${itemLine(r)}</li>`).join("")}</ul>${list.length > shown.length ? `<p class="asc-small asc-muted">… et ${nf(list.length - shown.length)} autres lignes, toutes dans le rapport final.</p>` : ""}</details>`;
    };
    const reasons = Object.entries(p.reasons).map(([k, n]) => `<li>${nf(n)} · ${esc(M().REASONS[k] || k)}</li>`).join("");
    return `<div class="asc-stack" data-mig-step="preview">
      <p class="asc-small"><strong>${esc(st.file.name)}</strong> · ${esc(M().FORMATS[parsed.format])} · ${nf(parsed.total)} lignes${parsed.format !== "titan_json" ? ` · <button type="button" class="asc-link" data-mig-edit-map>Modifier les colonnes</button>` : ""}</p>
      ${local ? `<div class="mig-grid"><label class="asc-small">Les heures du fichier sont celles de<select class="jr-select" data-mig-opt="tz">${[...new Set([deviceTz(), ...TZS])].map((z) => `<option value="${esc(z)}" ${st.opts.tz === z ? "selected" : ""}>${esc(z)}</option>`).join("")}</select></label>
        <label class="asc-small">Dates écrites<select class="jr-select" data-mig-opt="order"><option value="dmy" ${parsed.order === "dmy" ? "selected" : ""}>jour/mois/année</option><option value="mdy" ${parsed.order === "mdy" ? "selected" : ""}>mois/jour/année</option></select></label>
        <label class="asc-small mig-check"><input type="checkbox" data-mig-opt="allowDateOnly" ${st.opts.allowDateOnly ? "checked" : ""}> Lignes sans heure : les placer à midi</label></div>`
        : `<p class="asc-small asc-muted">${parsed.format === "strava_csv" ? "Heures lues en UTC, comme Strava les exporte." : "Heures lues avec le fuseau écrit dans l’export."} Les distances en m ou en miles sont converties.</p>`}
      ${unknown.length ? `<section class="asc-stack-sm" data-mig-sports aria-label="Sports à classer"><p class="asc-eyebrow">Sports à classer${pending ? ` · ${pending} restant${pending > 1 ? "s" : ""}` : ""}</p>
        ${unknown.map(([raw, n]) => `<label class="asc-small mig-sport">« ${esc(raw)} » · ${nf(n)} ligne${n > 1 ? "s" : ""}<select class="jr-select" data-mig-sport="${esc(raw)}">${sportOptions(st.opts.sportMap[raw])}</select></label>`).join("")}
        ${pending ? `<p class="asc-small asc-muted">Les lignes d’un sport non classé seront ignorées et listées dans le rapport.</p>` : ""}</section>` : ""}
      <div class="mig-counts" role="status" data-mig-summary><span><strong>${nf(p.counts.add)}</strong> à ajouter</span><span><strong>${nf(p.counts.link)}</strong> déjà au journal</span><span><strong>${nf(p.counts.review)}</strong> à vérifier</span><span><strong>${nf(p.counts.skip)}</strong> ignorée${p.counts.skip > 1 ? "s" : ""}</span></div>
      ${reasons ? `<ul class="asc-small mig-reasons">${reasons}</ul>` : ""}
      ${["add", "link", "review", "skip"].map(group).join("")}
      <p class="asc-small asc-muted">Aperçu calculé sur le journal de cet appareil avec la règle du serveur ; le serveur décide ligne par ligne et le rapport final fait foi. « À vérifier » : comptée une seule fois, à confirmer depuis la fiche de la séance.</p>
      <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-mig-back>Changer de fichier</button><button type="button" class="asc-btn asc-btn-primary" data-mig-run ${p.counts.total ? "" : "disabled"}>Importer ${nf(parsed.total)} lignes</button></div></div>`;
  }

  function runHtml() {
    const b = st.batch;
    const done = b ? Number(b.done_rows) : 0, total = b ? Number(b.total_rows) : st.parsed.total;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const pause = st.paused === "limited"
      ? `Limite du jour atteinte : 300 séances d’historique par jour. ${nf(total - done)} lignes restent. Reviens demain et choisis à nouveau ce fichier : l’import reprend à la ligne ${nf(b.next_row)}, sur cet appareil ou un autre.`
      : st.paused === "busy" ? "Une séance de ton journal est en cours de modification. Reprends dans un instant." : "";
    return `<div class="asc-stack" data-mig-step="run"><p class="asc-small"><strong>${esc(st.file?.name || "")}</strong>${b?.resumed ? " · reprise du lot déjà commencé" : ""}</p>
      <div class="asc-ascent mig-progress" role="progressbar" aria-label="Import de l’historique" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
      <p class="asc-small" data-mig-progress>${nf(done)} / ${nf(total)} lignes traitées${b ? ` · ${pl(b.counts.added, "ajoutée")} · ${pl(b.counts.linked, "associée")} · ${pl(b.counts.duplicate, "déjà importée", "déjà importées")} · ${pl(b.counts.skipped, "ignorée")}` : ""}</p>
      ${pause ? `<p class="asc-small" role="status" data-mig-paused="${esc(st.paused)}">${esc(pause)}</p>` : ""}
      ${st.error ? `<p class="asc-small" role="alert" data-mig-error>${esc(st.error)}</p>` : ""}
      <div class="asc-confirm-actions">${st.busy ? `<span class="asc-small asc-muted">Import en cours…</span>` : `<button type="button" class="asc-btn asc-btn-primary" data-mig-run>${b && done ? "Reprendre" : "Importer"}</button>`}${b ? `<button type="button" class="asc-btn asc-btn-secondary" data-mig-report="${esc(b.id)}" ${st.busy ? "disabled" : ""}>Rapport du lot</button>` : ""}</div></div>`;
  }

  function reportHtml() {
    const r = st.report;
    const m = M().measure(r);
    const rows = r.rows || [];
    const outcomes = [["", "Toutes"], ["added", "Ajoutées"], ["linked", "Associées"], ["duplicate", "Déjà importées"], ["skipped", "Ignorées"]];
    const line = (x) => {
      const s = x.session;
      const what = s ? esc(`${label(s.sport)} · ${dayTime(s.date)} · ${String(s.val).replace(".", ",")} ${s.unit || ""}${s.archived ? " · archivée" : ""}${s.corrected ? " · corrigée depuis" : ""}`) : "";
      const why = x.reason ? esc(M().REASONS[x.reason] || x.reason) : "";
      const review = x.needs_review ? " · à vérifier" : "";
      const w = x.withdrawn && WITHDRAWN[x.withdrawn] ? ` · retrait : ${WITHDRAWN[x.withdrawn]}` : "";
      return `<li data-mig-report-row="${x.row}" data-outcome="${esc(x.outcome)}">Ligne ${x.row} · <strong>${esc(M().OUTCOMES[x.outcome] || x.outcome)}</strong>${review}${what ? ` · ${what}` : ""}${why ? ` · ${why}` : ""}${esc(w)}</li>`;
    };
    const effects = r.status === "withdrawn" && r.withdraw_report ? M().withdrawText(r.withdraw_report).map((t) => `<li>${esc(t)}</li>`).join("") : "";
    return `<div class="asc-stack" data-mig-step="report" data-mig-status="${esc(r.status)}">
      <p class="asc-small"><strong>${esc(r.file_name || M().FORMATS[r.format] || "Lot")}</strong> · ${esc(STATUS[r.status] || r.status)} · lot ${esc(String(r.id).slice(0, 8))} · ${esc(dayTime(r.created_at))}</p>
      <div class="mig-counts" data-mig-final><span><strong>${nf(r.counts.added)}</strong> ajoutée${r.counts.added > 1 ? "s" : ""}</span><span><strong>${nf(r.counts.linked)}</strong> associée${r.counts.linked > 1 ? "s" : ""}${r.counts.review ? ` (dont ${nf(r.counts.review)} à vérifier)` : ""}</span><span><strong>${nf(r.counts.duplicate)}</strong> déjà importée${r.counts.duplicate > 1 ? "s" : ""}</span><span><strong>${nf(r.counts.skipped)}</strong> ignorée${r.counts.skipped > 1 ? "s" : ""}</span></div>
      <p class="asc-small" data-mig-measure>${nf(m.explained)} / ${nf(m.total)} lignes importées ou expliquées (${String(m.rate).replace(".", ",")} %) · ${pl(m.duplicates, "doublon évité", "doublons évités")}${m.seconds !== null ? ` · rapport final en ${nf(m.seconds)} s` : ""}</p>
      ${effects ? `<section aria-label="Retrait du lot"><p class="asc-eyebrow">Retiré le ${esc(dayTime(r.withdrawn_at))}</p><ul class="asc-small" data-mig-effects>${effects}</ul></section>` : ""}
      <div class="asc-seg" role="group" aria-label="Lignes">${outcomes.map(([k, l]) => `<button type="button" data-mig-filter="${k}" aria-pressed="${st.filter === k}">${l}</button>`).join("")}</div>
      <ul class="asc-small mig-report-rows">${rows.map(line).join("") || "<li>Aucune ligne.</li>"}</ul>
      ${rows.length === 200 ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-mig-more>Lignes suivantes</button>` : ""}
      ${st.error ? `<p class="asc-small" role="alert" data-mig-error>${esc(st.error)}</p>` : ""}
      <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-mig-back>Mes imports</button>${r.status !== "withdrawn" ? `<button type="button" class="asc-btn asc-btn-danger" data-mig-withdraw>Retirer ce lot…</button>` : ""}</div></div>`;
  }

  function render() {
    if (!sheet?.isConnected || !st) return;
    const box = sheet.querySelector("[data-sheet-content]");
    const html = st.step === "map" ? mapHtml() : st.step === "preview" ? previewHtml() : st.step === "run" ? runHtml() : st.step === "report" ? reportHtml() : pickHtml();
    const focused = document.activeElement?.matches?.("[data-mig-sport],[data-mig-opt],[data-mig-map]") ? document.activeElement.getAttribute("data-mig-sport") || document.activeElement.getAttribute("data-mig-opt") || document.activeElement.getAttribute("data-mig-map") : null;
    box.innerHTML = html;
    if (focused) box.querySelector(`[data-mig-sport="${CSS.escape(focused)}"],[data-mig-opt="${CSS.escape(focused)}"],[data-mig-map="${CSS.escape(focused)}"]`)?.focus();
  }
  const current = () => st && st.owner === owner() && sheet?.isConnected;

  /* ---------- actions ---------- */
  async function loadBatches() {
    try { st.batches = await rpc("titan_import_batches_v1", {}); } catch (e) { st.batches = []; st.error = message(e); }
    if (current()) render();
  }
  function reparse() {
    try {
      st.parsed = M().parse(st.file.text, { name: st.file.name, mapping: st.opts.mapping, tz: st.opts.tz, order: st.opts.order, allowDateOnly: st.opts.allowDateOnly, sportMap: st.opts.sportMap });
      st.mapError = null;
      st.preview = M().preview(st.parsed, [...(window.state?.history || []), ...(window.state?.archivedHistory || [])].filter((l) => l.syncStatus !== "error"));
      st.step = "preview";
    } catch (e) {
      if (e.code === "MAPPING_REQUIRED") { st.mapError = { message: e.message, head: e.head, mapping: e.mapping }; st.opts.mapping = { ...e.mapping }; st.step = "map"; }
      else { st.error = e.message || "Ce fichier est illisible."; st.step = "pick"; }
    }
  }
  async function readFile(file) {
    st.error = "";
    if (!file) return;
    if (file.size > M().LIMITS.maxBytes) { st.error = "Ce fichier dépasse 20 Mo : découpe-le en plusieurs fichiers."; return render(); }
    const text = await file.text();
    if (!current()) return;
    st.file = { name: file.name.slice(0, 120), text };
    st.opts = { ...st.opts, mapping: null, order: null, sportMap: {} };
    reparse();
    render();
  }
  async function reloadHistory(account) {
    try {
      const { logs } = await window.TitanTraining.paginate(window.titanClient, account);
      if (owner() !== account) return;
      const confirmed = logs.map((l) => ({ ...l, cat: l.category, syncStatus: "confirmed" }));
      const ids = new Set(confirmed.map((l) => l.client_event_id));
      const provisional = (window.state.history || []).filter((l) => l.syncStatus && l.syncStatus !== "confirmed" && !ids.has(l.client_event_id));
      window.state.history = [...confirmed.filter((l) => !l.archived_at), ...provisional];
      window.state.archivedHistory = confirmed.filter((l) => l.archived_at);
      await window.TitanQueue?.saveHistory?.(account, confirmed).catch(() => {});
      window.dispatchEvent(new CustomEvent("titan:history-updated"));
    } catch { /* the journal reloads on its next synchronisation */ }
  }
  async function run() {
    if (st.busy || !st.parsed) return;
    const account = owner();
    st.busy = true; st.error = ""; st.paused = ""; st.step = "run";
    render();
    let changed = false;
    try {
      let b = await rpc("titan_import_batch_open_v1", { p_format: st.parsed.format, p_file_hash: M().fileHash(st.file.text), p_total: st.parsed.total, p_file_name: st.file.name });
      if (!current()) return;
      st.batch = b;
      render();
      outer: while (b.status === "open") {
        const list = M().chunks(st.parsed, b.next_row);
        if (!list.length) break;
        for (const items of list) {
          const r = await rpc("titan_import_batch_rows_v1", { p_batch: b.id, p_items: items });
          if (!current()) return;
          if (r.processed) changed = true;
          b = { ...r, resumed: st.batch?.resumed };
          st.batch = b;
          if (r.limited || r.busy) { st.paused = r.limited ? "limited" : "busy"; break outer; }
          render();
        }
      }
      if (b.status !== "open") await openReport(b.id);
    } catch (e) {
      if (current()) st.error = message(e);
    } finally {
      if (st && st.owner === account) st.busy = false;
      if (current()) render();
      if (changed) reloadHistory(account);
    }
  }
  async function openReport(id, { keepFilter = false } = {}) {
    if (!keepFilter) { st.filter = ""; st.offset = 0; }
    st.error = "";
    try {
      const r = await rpc("titan_import_batch_v1", { p_batch: id, p_outcome: st.filter || null, p_offset: st.offset, p_limit: 200 });
      if (!current()) return;
      st.report = r; st.step = "report";
    } catch (e) { if (current()) st.error = message(e); }
    if (current()) render();
  }
  async function withdraw() {
    const id = st.report?.id;
    if (!id) return;
    const account = owner();
    let preview;
    try { preview = await rpc("titan_import_batch_withdraw_v1", { p_batch: id, p_apply: false }); } catch (e) { st.error = message(e); return render(); }
    if (!current()) return;
    const lines = M().withdrawText(preview.effects);
    const confirmed = await window.titanShell.confirm({
      title: "Retirer ce lot ?",
      message: lines.join(" "),
      detail: "Seules les séances que ce lot a ajoutées et que tu n’as pas touchées sont retirées. Tes séances déjà présentes et tes corrections restent telles quelles. Tu pourras réimporter le fichier ensuite.",
      confirmLabel: preview.effects.remove ? `Retirer ${preview.effects.remove} séance${preview.effects.remove > 1 ? "s" : ""}` : "Retirer le lot",
      danger: true,
      action: async () => {
        if (owner() !== account) throw new Error("Le compte a changé.");
        await rpc("titan_import_batch_withdraw_v1", { p_batch: id, p_apply: true });
      },
    });
    if (!confirmed || owner() !== account) return;
    await reloadHistory(account);
    if (current()) await openReport(id);
  }
  function template() {
    const csv = M().profileCsv([
      { id: "seance-1", date: "12/03/2024", time: "07:15", sport: "Course à pied", duration: "0:52:10", distance: "10,4", unit: "km", rpe: "6", note: "Fractionné" },
      { id: "seance-2", date: "13/03/2024", time: "18:00", sport: "Musculation en salle", duration: "1:00", distance: "", unit: "", rpe: "7", note: "" },
    ]);
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "titan-historique-modele.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function onClick(e) {
    const t = e.target.closest("button, [data-mig-template]");
    if (!t || !st || st.busy) return;
    if (t.hasAttribute("data-mig-template")) return template();
    if (t.hasAttribute("data-mig-back")) { st = { ...fresh(), batches: null }; render(); return loadBatches(); }
    if (t.hasAttribute("data-mig-edit-map")) { st.opts.mapping = { ...(st.parsed.mapping || {}) }; st.mapError = null; st.step = "map"; return render(); }
    if (t.hasAttribute("data-mig-apply-map")) {
      const map = { ...(st.opts.mapping || {}) };
      sheet.querySelectorAll("[data-mig-map]").forEach((s) => { map[s.getAttribute("data-mig-map")] = Number(s.value); });
      sheet.querySelectorAll("[data-mig-step=map] [data-mig-opt]").forEach((s) => { map[s.getAttribute("data-mig-opt")] = s.value; });
      st.opts.mapping = map;
      reparse();
      return render();
    }
    if (t.hasAttribute("data-mig-run")) return run();
    if (t.hasAttribute("data-mig-report")) return openReport(t.getAttribute("data-mig-report"));
    if (t.hasAttribute("data-mig-filter")) { st.filter = t.getAttribute("data-mig-filter"); st.offset = 0; return openReport(st.report.id, { keepFilter: true }); }
    if (t.hasAttribute("data-mig-more")) { st.offset += 200; return openReport(st.report.id, { keepFilter: true }); }
    if (t.hasAttribute("data-mig-withdraw")) return withdraw();
  }
  function onChange(e) {
    const t = e.target;
    if (!st) return;
    if (t.matches("[data-mig-file]")) return readFile(t.files?.[0]);
    if (st.step !== "preview") return;
    if (t.matches("[data-mig-sport]")) {
      const raw = t.getAttribute("data-mig-sport");
      if (t.value) st.opts.sportMap[raw] = t.value; else delete st.opts.sportMap[raw];
    } else if (t.matches("[data-mig-opt]")) {
      const k = t.getAttribute("data-mig-opt");
      st.opts[k] = t.type === "checkbox" ? t.checked : t.value;
    } else return;
    reparse();
    render();
  }

  function open() {
    if (sheet?.isConnected) return sheet;
    st = fresh();
    if (isGuest()) {
      sheet = window.titanShell.sheet({ title: "Importer un historique", eyebrow: "Journal", body: `<p class="asc-small">Connecte-toi pour importer ton historique : il est rangé dans ton compte, pas seulement sur cet appareil.</p>` });
      return sheet;
    }
    sheet = window.titanShell.sheet({ title: "Importer un historique", eyebrow: "Journal", body: "", onClose: () => { if (st?.busy) st.owner = ""; st = null; sheet = null; } });
    sheet.classList.add("mig-sheet");
    sheet.addEventListener("click", onClick);
    sheet.addEventListener("change", onChange);
    render();
    loadBatches();
    return sheet;
  }
  window.addEventListener("titan:account-changing", () => { if (sheet?.isConnected) sheet.close(); });
  window.titanHistoryMigration = { open };
})();
