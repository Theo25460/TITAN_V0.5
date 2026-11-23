/* V1.6.2 — Rapprochement des séances, website side. The rules and words are shared with Android (js/core/session-match.js); this file
   only reads the server links (titan_session_matches_v1), shows them in the session sheet and the journal, and sends the athlete's
   reversible decision (titan_resolve_session_match_v1). The server stays the authority: after a decision, the sessions it touched
   are read back from training_logs and placed in the local history, so totals, records and the journal change only when it says so. */
(function () {
  "use strict";
  const M = () => window.TitanSessionMatch;
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const owner = () => window.state?.user?.id || "";
  const isGuest = () => !owner() || String(owner()).startsWith("guest_");
  const allLogs = () => [...(window.state?.history || []), ...(window.state?.archivedHistory || [])];
  const ERR = {
    MATCH_SOURCE_UNKNOWN: "Ce rapprochement date d’avant le détail des sources. Relance l’import depuis la source pour pouvoir le séparer.",
    MATCH_SESSION_GONE: "Ta séance d’origine est archivée : restaure-la d’abord pour y rattacher cet import.",
    MATCH_UNKNOWN: "Ce rapprochement n’existe plus dans ton compte. Recharge le journal.",
    RATE_LIMITED: "Trop de décisions en peu de temps. Réessaie dans une heure.",
    TRAINING_RATE_LIMIT: "Trop de séances créées en peu de temps. Réessaie plus tard.",
  };
  const message = (error) => ERR[String(error?.message || "").trim()] || "La décision n’a pas été enregistrée. Réessaie dans un instant.";

  /* The account's recent links, once per history change (journal badges « À vérifier » / « 2 sources »). */
  let cache = { owner: "", at: 0, rows: null, pending: null };
  window.addEventListener("titan:account-changing", () => { cache = { owner: "", at: 0, rows: null, pending: null }; });
  async function recent() {
    if (isGuest() || !window.titanClient?.rpc || !navigator.onLine) return [];
    const me = owner();
    if (cache.owner === me && cache.rows && Date.now() - cache.at < 120000) return cache.rows;
    if (cache.owner === me && cache.pending) return cache.pending;
    const pending = Promise.resolve(window.titanClient.rpc("titan_session_matches_v1", {})).then(({ data, error }) => {
      if (error || !Array.isArray(data) || owner() !== me) return [];
      cache = { owner: me, at: Date.now(), rows: data, pending: null };
      return data;
    }).catch(() => []);
    cache = { owner: me, at: 0, rows: cache.owner === me ? cache.rows : null, pending };
    return pending;
  }
  const invalidate = () => { cache = { owner: "", at: 0, rows: null, pending: null }; };

  /** Badge of a journal row from the links already read: « À vérifier » or « 2 sources ». */
  function badge(log, rows) {
    if (!log?.id || !rows?.length) return "";
    const mine = rows.filter((r) => r.log_id === log.id || r.linked_log_id === log.id);
    if (!mine.length) return "";
    const review = mine.some((r) => r.needs_review);
    const split = mine.some((r) => r.status === "imported" && r.log_id === log.id);
    const label = review ? "À vérifier" : split ? "Séparée" : `${mine.length + 1} sources`;
    const title = review ? "Une source importée a été rattachée à cette séance : confirme si c’est le même effort." : split ? "Tu as séparé cette séance d’une autre : elle compte à part." : "Une source importée a rejoint cette séance : elle ne compte qu’une fois.";
    return `<span class="asc-chip jr-badge${review ? " am" : ""}" data-match-badge="${review ? "review" : split ? "split" : "linked"}" title="${esc(title)}">${esc(label)}</span>`;
  }

  function sectionHtml(v) {
    const [a, b] = v.sources;
    const diverging = new Set(v.divergences.map((d) => d.field));
    const head = v.sources.map((s) => `<th scope="col"><span class="jr-match-src">${esc(s.label)}</span><small>${esc(s.saved)}</small></th>`).join("");
    const line = (label, field, get) => `<tr${diverging.has(field) ? ' data-diverges="true"' : ""}><th scope="row">${esc(label)}${diverging.has(field) ? ' <span class="jr-match-diff">diffère</span>' : ""}</th>${v.sources.map((s) => `<td>${esc(get(s))}</td>`).join("")}</tr>`;
    const table = a && b ? `<table class="jr-match-table"><thead><tr><th scope="col"><span class="sr-only">Valeur</span></th>${head}</tr></thead><tbody>
      ${line("Début", "start", (s) => s.at)}${line("Durée", "duration", (s) => s.duration)}${line("Distance", "distance", (s) => s.distance)}</tbody></table>` : "";
    const kept = v.rows.filter((r) => r.shownOnly).map((r) => `${r.label} affichée depuis ${v.sources[1]?.label || "la source"}, hors totaux`);
    const buttons = v.actions.map((x, i) => `<button type="button" class="asc-btn ${i === 0 && v.state === "review" ? "asc-btn-primary" : "asc-btn-secondary"} asc-btn-sm" data-match-action="${esc(x.id)}" data-match-source="${esc(v.source)}" data-match-ref="${esc(v.ref)}">${esc(x.label)}</button>`).join("");
    return `<section class="jr-detail-block jr-match" data-match-state="${esc(v.state)}" aria-label="Sources de la séance"><p class="asc-eyebrow">Sources</p>
      <p><strong class="${v.tone === "warn" ? "asc-warn" : ""}">${esc(v.title)}</strong></p><p class="asc-small">${esc(v.text)}</p>
      ${table}
      ${v.reasons.length ? `<ul class="asc-small jr-match-reasons">${v.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
      ${kept.length ? `<p class="asc-small">${esc(kept.join(" · "))}.</p>` : ""}
      ${v.sources.length > 1 ? `<p class="asc-small jr-match-rule">Règle : ${esc(v.rule)}${v.overlap ? ` Recouvrement : ${v.overlap} % de l’effort le plus court.` : ""}</p>` : ""}
      ${v.events.length ? `<details class="jr-match-log"><summary class="asc-small">Historique des décisions (${v.events.length})</summary><ul class="asc-small">${v.events.map((e) => `<li>${esc(e.at)} : ${esc(e.text)} par ${esc(e.by)}</li>`).join("")}</ul></details>` : ""}
      ${buttons ? `<div class="asc-row-flex">${buttons}</div>` : ""}</section>`;
  }

  /** Fill the sheet slot of a confirmed session with its sources. Returns the rows read (or []). */
  async function mount(slot, log, isCurrent) {
    if (!slot || !log?.id || !UUID.test(String(log.id)) || isGuest() || log.syncStatus && log.syncStatus !== "confirmed") return [];
    if (!window.titanClient?.rpc || !navigator.onLine) return [];
    let data, error;
    try { ({ data, error } = await window.titanClient.rpc("titan_session_matches_v1", { p_log_id: log.id })); } catch (e) { error = e; }
    if (!isCurrent() || error || !Array.isArray(data) || !data.length) return [];
    slot.innerHTML = data.map((row) => sectionHtml(M().describe(row, log, allLogs()))).join("");
    return data;
  }

  /** Read back the sessions a decision touched, place them in the local history (the server decides what counts). */
  async function refreshRows(ids, me) {
    const list = [...new Set(ids.filter((id) => id && UUID.test(String(id))))];
    if (!list.length) return;
    const { data } = await window.titanClient.from("training_logs").select("*").in("id", list).eq("user_id", me);
    if (owner() !== me || !Array.isArray(data)) return;
    for (const row of data) window.TitanSessions?.place?.({ ...row, cat: row.category || row.cat, syncStatus: "confirmed" });
    window.TitanQueue?.saveHistory?.(me, [...(window.state.history || []), ...(window.state.archivedHistory || [])]).catch(() => {});
    window.saveState?.();
    window.dispatchEvent(new CustomEvent("titan:history-updated"));
  }

  const CONFIRM = {
    same: { title: "Garder une seule séance ?", message: "L’import reste rattaché à ta séance : il ne compte qu’une fois. Tes valeurs et ta note sont conservées.", label: "Une seule séance" },
    distinct: { title: "Séparer en deux séances ?", message: "L’activité importée devient une séance à part, comptée avec les règles habituelles (récompenses et records). Ta séance n’est pas modifiée.", label: "Deux séances" },
  };
  /** The athlete's decision, confirmed first, sent to the server, then read back. Reversible: the opposite action stays offered. */
  function decide(decision, source, ref, onDone) {
    const me = owner();
    const c = CONFIRM[decision];
    if (!c) return Promise.resolve(null);
    return window.titanShell.confirm({
      title: c.title, message: c.message,
      detail: "Tu peux revenir sur ce choix depuis la fiche de la séance. Un nouvel import de la même activité garde ta décision.",
      confirmLabel: c.label,
      action: async () => {
        if (owner() !== me) throw new Error("Le compte a changé. Rouvre la séance depuis son journal.");
        if (!navigator.onLine) throw new Error("Hors ligne : la décision demande une connexion.");
        const { data, error } = await window.titanClient.rpc("titan_resolve_session_match_v1", { p_source: source, p_external_id: ref, p_decision: decision });
        if (owner() !== me) return;
        if (error || !data) throw new Error(message(error));
        invalidate();
        await refreshRows([data.log_id, data.linked_log_id, data.split_log_id], me);
        window.titanShell.toast({ type: "ok", title: decision === "same" ? "Une seule séance" : "Deux séances distinctes", message: "Ta décision est enregistrée dans ton compte." });
        onDone?.(data);
      },
    });
  }

  window.TitanMatches = { recent, badge, mount, decide, invalidate, sectionHtml };
})();
