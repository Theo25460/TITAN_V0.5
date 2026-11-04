/* V11-65 (COM-C4): the fair ranking among friends, on the QG. It is optional: nobody appears, and nobody sees the others, unless they chose
   to take part. It rewards regularity and progress, never volume (the formula is shown), lists only friends who also chose to take part,
   and grants nothing. Shown only when the server flag screens.ranking is on, to a signed-in account, and when the server has the functions.
   Every answer is applied only if the account, the client and the epoch are still the ones that asked. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const FLAG = "screens.ranking";
  const TTL = 60 * 1000;

  let data = null;
  let at = 0;
  let sport = "";
  let owner = null;
  let flight = null;
  let missing = false;
  let busy = false;
  let notice = "";

  const context = () => ({ owner: window.state?.user?.id || null, client: window.titanClient || null, epoch: window.titanAccountTransition?.epoch });
  const same = (a, b) => a && b && a.owner === b.owner && a.client === b.client && a.epoch === b.epoch && !window.titanAccountTransition?.active;
  const guest = () => !context().owner || String(context().owner).startsWith("guest_");
  const on = () => !guest() && window.titanFlags?.enabled?.(FLAG, false) === true;
  const changed = () => window.dispatchEvent(new CustomEvent("titan:ranking-updated"));
  const n = (v) => window.TitanFormat.number(v);

  function reset() { data = null; at = 0; sport = ""; flight = null; missing = false; busy = false; notice = ""; }
  function sync() {
    const id = guest() ? null : context().owner;
    if (id !== owner) { owner = id; reset(); changed(); }
  }

  async function refresh(force = false) {
    sync();
    if (!on() || missing || !navigator.onLine) return data;
    if (flight) return flight;
    if (!force && data && Date.now() - at < TTL) return data;
    const ask = context(), asked = sport;
    flight = (async () => {
      try {
        const { data: answer, error } = await ask.client.rpc("titan_ranking_v1", { p_sport: asked || null });
        if (!same(ask, context())) return data;
        if (error) {
          if (error.code === "PGRST202" || /Could not find/.test(error.message || "")) missing = true; else notice = "Le classement ne répond pas pour l’instant.";
          return data;
        }
        if (answer && typeof answer === "object" && asked === sport) { data = answer; at = Date.now(); notice = ""; }
        return data;
      } catch {
        if (same(ask, context())) notice = "Le classement ne répond pas pour l’instant.";
        return data;
      } finally { flight = null; if (same(ask, context())) changed(); }
    })();
    return flight;
  }

  async function setOptIn(value) {
    sync();
    if (busy || !on()) return;
    const ask = context();
    busy = true; notice = ""; changed();
    try {
      const { error } = await ask.client.rpc("titan_ranking_set_v1", { p_on: value });
      if (!same(ask, context())) return;
      if (error) notice = "Impossible pour l’instant. Réessaie dans un moment.";
    } catch {
      if (same(ask, context())) notice = "Impossible pour l’instant. Réessaie dans un moment.";
    } finally {
      if (same(ask, context())) { const message = notice; busy = false; await refresh(true); if (same(ask, context())) { notice = message || notice; changed(); } } else busy = false;
    }
  }

  function sports() {
    const seen = new Map();
    for (const l of window.state?.history || []) if (l && l.sport && !l.archived_at) seen.set(l.sport, (seen.get(l.sport) || 0) + 1);
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => ({ id, label: window.TitanSports?.label?.(id) || id }));
  }

  function html() {
    sync();
    if (!on() || missing || !data) return "";
    const lock = busy ? "disabled" : "";
    const formula = `<details class="asc-small" data-rk-formula><summary>Comment c’est calculé</summary>
      <p>Le score vaut 100 au plus et récompense la <strong>régularité</strong> (60 %) et le <strong>progrès</strong> (40 %), pas le volume.</p>
      <ul><li>Régularité : tes jours actifs sur 28 jours, divisés par 12. Douze jours actifs (trois par semaine) donnent le maximum, en faire plus ne rapporte rien.</li>
      <li>Progrès : ton effort des 14 derniers jours comparé aux 14 jours d’avant. Une quinzaine plus calme compte pour zéro, jamais en négatif.</li></ul>
      <p>Les séances suspectes, archivées ou importées de l’historique ne comptent pas. Rien ne s’achète, et les mêmes scores partagent le même rang.</p></details>`;
    let body;
    if (!data.optedIn) {
      body = `<p class="asc-muted">Un classement entre amis qui récompense la régularité et le progrès plutôt que le volume. Facultatif : tant que tu n’y participes pas, tu n’apparais pas et tu ne vois personne.</p>
        <div class="asc-row"><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-rk-opt="true" ${lock}>Participer</button></div>`;
    } else {
      const entries = Array.isArray(data.entries) ? data.entries : [];
      const options = sports();
      const filter = options.length ? `<label class="asc-field"><span class="asc-small">Sport</span><select class="asc-input" data-rk-sport><option value="">Tous les sports</option>${options.map((o) => `<option value="${esc(o.id)}"${o.id === sport ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label>` : "";
      const list = entries.length
        ? `<ol class="rv-list" data-rk-list>${entries.map((e) => `<li class="asc-between" data-rk-entry${e.me ? " data-me" : ""}><span><strong>${Number(e.rank)}.</strong> ${esc(e.name)}${e.me ? " (toi)" : ""}<br><span class="asc-small asc-muted">${Number(e.activeDays)} jour${Number(e.activeDays) > 1 ? "s" : ""} actif${Number(e.activeDays) > 1 ? "s" : ""} · progrès ${Number(e.progressPct)} %</span></span><strong>${Number(e.score)}</strong></li>`).join("")}</ol>`
        : `<p class="asc-muted" data-rk-empty>Personne n’a encore de score sur les 28 derniers jours${sport ? " pour ce sport" : ""}. Une séance suffit pour apparaître.</p>`;
      body = `${filter}${list}<div class="asc-row"><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-rk-opt="false" ${lock}>Ne plus participer</button></div>`;
    }
    return `<section class="asc-section asc-appear qg-rk" data-rk aria-labelledby="rk-title"><div class="asc-section-head"><h2 id="rk-title">Classement entre amis</h2></div>
      <div class="asc-panel qg-steps-card">${body}${formula}${notice ? `<p class="asc-small" role="status" data-rk-notice>${esc(notice)}</p>` : ""}
      <p class="asc-small asc-faint">Seuls tes amis qui participent aussi apparaissent. Aucun XP ni crédit à gagner.</p></div></section>`;
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-rk-opt]");
    if (b) setOptIn(b.dataset.rkOpt === "true");
  });
  document.addEventListener("change", (e) => {
    const s = e.target.closest?.("[data-rk-sport]");
    if (s) { sport = s.value; data = null; changed(); refresh(true); }
  });
  window.addEventListener("titan:account-changing", () => { owner = null; reset(); });
  ["titan:account-changed", "titan:flags-updated", "titan:history-updated", "online"].forEach((ev) => window.addEventListener(ev, () => { sync(); refresh(ev === "titan:history-updated"); }));
  window.TitanRanking = { html, refresh };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(() => refresh(), 0));
  else setTimeout(() => refresh(), 0);
})();
