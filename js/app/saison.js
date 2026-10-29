/* V11-64 (COM-B3, COM-D3): the season of 28 days on the QG, its closing screen and the archive of past seasons. Taking part is voluntary,
   nothing is owed and nothing is lost by resting; only totals and the player's own result are shown, never a ranking, and the results of a
   finished season are frozen by the server. Shown only when the server flag screens.seasons is on, to a signed-in account, and when the
   server has the function. Every answer is applied only if the account, the client and the epoch are still the ones that asked. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const FLAG = "screens.seasons";
  const TTL = 60 * 1000;
  const MESSAGES = {
    NOT_ELIGIBLE: "Tu pourras rejoindre une saison un jour après la création du compte.",
    SEASON_ENDED: "Cette saison est terminée.",
    RATE_LIMITED: "Beaucoup d’actions en peu de temps. Réessaie dans un instant.",
  };

  let data = null;
  let at = 0;
  let owner = null;
  let flight = null;
  let missing = false;
  let busy = false;
  let notice = "";

  const context = () => ({ owner: window.state?.user?.id || null, client: window.titanClient || null, epoch: window.titanAccountTransition?.epoch });
  const same = (a, b) => a && b && a.owner === b.owner && a.client === b.client && a.epoch === b.epoch && !window.titanAccountTransition?.active;
  const guest = () => !context().owner || String(context().owner).startsWith("guest_");
  const on = () => !guest() && window.titanFlags?.enabled?.(FLAG, false) === true;
  const changed = () => window.dispatchEvent(new CustomEvent("titan:season-updated"));
  const n = (v) => window.TitanFormat.number(v);
  const day = (iso) => window.TitanFormat.longDate(new Date(`${iso}T12:00:00`));
  const failure = (error) => {
    const code = Object.keys(MESSAGES).find((k) => String(error?.message || "").includes(k));
    return code ? MESSAGES[code] : "Le serveur ne répond pas pour l’instant. Réessaie dans un moment.";
  };

  function reset() { data = null; at = 0; flight = null; missing = false; busy = false; notice = ""; }
  function sync() {
    const id = guest() ? null : context().owner;
    if (id !== owner) { owner = id; reset(); changed(); }
  }

  async function refresh(force = false) {
    sync();
    if (!on() || missing || !navigator.onLine) return data;
    if (flight) return flight;
    if (!force && data && Date.now() - at < TTL) return data;
    const ask = context();
    flight = (async () => {
      try {
        const { data: answer, error } = await ask.client.rpc("titan_season_v1");
        if (!same(ask, context())) return data;
        if (error) {
          if (error.code === "PGRST202" || /Could not find/.test(error.message || "")) missing = true; else notice = failure(error);
          return data;
        }
        if (answer && typeof answer === "object") { data = answer; at = Date.now(); notice = ""; }
        return data;
      } catch {
        if (same(ask, context())) notice = "La saison ne répond pas pour l’instant.";
        return data;
      } finally { flight = null; if (same(ask, context())) changed(); }
    })();
    return flight;
  }

  async function join(on_) {
    sync();
    if (busy || !on() || !data?.current) return;
    const ask = context();
    busy = true; notice = ""; changed();
    try {
      const { error } = await ask.client.rpc("titan_season_join_v1", { p_season: data.current.id, p_join: on_ });
      if (!same(ask, context())) return;
      if (error) notice = failure(error);
    } catch (error) {
      if (same(ask, context())) notice = failure(error);
    } finally {
      if (same(ask, context())) { const message = notice; busy = false; await refresh(true); if (same(ask, context())) { notice = message || notice; changed(); } } else busy = false;
    }
  }

  function currentHtml(c) {
    const lock = busy ? "disabled" : "";
    const upcoming = c.state === "upcoming";
    const action = c.joined
      ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-ss-join="false" ${lock}>Quitter la saison</button>`
      : `<button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-ss-join="true" ${lock}>Rejoindre la saison</button>`;
    return `<div class="asc-panel qg-steps-card" data-ss-current data-state="${esc(c.state)}"><p><strong>${esc(c.name)}</strong></p>
      <p class="asc-small asc-muted">${upcoming ? "Commence le" : "Du"} ${esc(day(c.startsOn))} au ${esc(day(c.endsOn))} · ${n(c.participants)} participant${Number(c.participants) > 1 ? "s" : ""}</p>
      ${c.rules ? `<p class="asc-small">${esc(c.rules)}</p>` : ""}
      ${c.joined ? `<p class="asc-small asc-muted" data-ss-mine>Ta saison jusqu’ici : <strong>${n(c.myMinutes)}</strong> min d’effort · <strong>${n(c.myDays)}</strong> jour${Number(c.myDays) > 1 ? "s" : ""} actif${Number(c.myDays) > 1 ? "s" : ""}</p>` : ""}
      <div class="asc-row">${action}</div>
      <p class="asc-small asc-faint">Facultative, sans obligation ni pénalité : se reposer fait partie du jeu. Seules les séances faites après ton inscription comptent. Aucun classement, aucun XP ni crédit.</p></div>`;
  }

  function html() {
    sync();
    if (!on() || missing || !data) return "";
    const archive = Array.isArray(data.archive) ? data.archive : [];
    const last = archive[0];
    const justEnded = last && (Date.now() - new Date(`${last.endsOn}T23:59:59`).getTime()) < 8 * 86400000;
    if (!data.current && !archive.length) return "";
    const closing = justEnded
      ? `<div class="asc-panel qg-steps-card" data-ss-closing><p><strong>${icon("check")} ${esc(last.name)} est terminée</strong></p>
          <p class="asc-small asc-muted">${n(last.participants)} participant${Number(last.participants) > 1 ? "s" : ""} · ${n(last.minutes)} min d’effort à eux tous.</p>
          ${last.mine ? `<p class="asc-small">Ta saison : <strong>${n(last.mine.minutes)}</strong> min d’effort · <strong>${n(last.mine.days)}</strong> jour${Number(last.mine.days) > 1 ? "s" : ""} actif${Number(last.mine.days) > 1 ? "s" : ""}. Bravo d’avoir pris part à l’aventure.</p>` : `<p class="asc-small asc-muted">Tu n’y as pas pris part : rien à signaler, la prochaine t’attend quand tu veux.</p>`}</div>`
      : "";
    const old = archive.length
      ? `<details class="asc-small" data-ss-archive><summary>Saisons précédentes (${archive.length})</summary><ul class="rv-list">${archive.map((s) => `<li><strong>${esc(s.name)}</strong> · ${esc(day(s.startsOn))} – ${esc(day(s.endsOn))} · ${n(s.participants)} participant${Number(s.participants) > 1 ? "s" : ""}, ${n(s.minutes)} min${s.mine ? ` · ta part : ${n(s.mine.minutes)} min, ${n(s.mine.days)} j` : ""} <span class="asc-faint">(règles v${Number(s.rulesVersion) || 1})</span></li>`).join("")}</ul></details>`
      : "";
    return `<section class="asc-section asc-appear qg-ss" data-ss aria-labelledby="ss-title"><div class="asc-section-head"><h2 id="ss-title">Saison</h2></div>
      ${data.current ? currentHtml(data.current) : ""}${closing}${notice ? `<p class="asc-small" role="status" data-ss-notice>${esc(notice)}</p>` : ""}${old}</section>`;
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-ss-join]");
    if (b) join(b.dataset.ssJoin === "true");
  });
  window.addEventListener("titan:account-changing", () => { owner = null; reset(); });
  ["titan:account-changed", "titan:flags-updated", "titan:history-updated", "online"].forEach((ev) => window.addEventListener(ev, () => { sync(); refresh(ev === "titan:history-updated"); }));
  window.TitanSeason = { html, refresh };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(() => refresh(), 0));
  else setTimeout(() => refresh(), 0);
})();
