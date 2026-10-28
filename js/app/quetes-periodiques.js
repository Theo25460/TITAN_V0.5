/* V11-13 / V11-15: the optional weekly and monthly quests (server: titan_periodic_quests_v1 / titan_periodic_quest_claim_v1).
   Every answer is applied only if the account, the client and the epoch are still the ones that asked. Nothing here grants XP or credits:
   a finished quest gives a cosmetic keepsake the server records once. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const T = () => window.TitanPeriodicQuestText;
  const TTL = 60 * 1000;

  let data = null;
  let at = 0;
  let owner = null;
  let flight = null;
  let claiming = null;
  let failure = "";
  let missing = false;

  const context = () => ({ owner: window.state?.user?.id || null, client: window.titanClient || null, epoch: window.titanAccountTransition?.epoch });
  const same = (a, b) => a && b && a.owner === b.owner && a.client === b.client && a.epoch === b.epoch && !window.titanAccountTransition?.active;
  const guest = () => !context().owner || String(context().owner).startsWith("guest_");
  const changed = () => window.dispatchEvent(new CustomEvent("titan:periodic-quests-updated"));

  function reset() {
    data = null; at = 0; flight = null; claiming = null; failure = ""; missing = false;
  }
  function sync() {
    const id = guest() ? null : context().owner;
    if (id !== owner) { owner = id; reset(); changed(); }
  }

  async function refresh(force = false) {
    sync();
    if (guest() || missing || !navigator.onLine) return data;
    if (flight) return flight;
    if (!force && data && Date.now() - at < TTL) return data;
    const ask = context();
    flight = (async () => {
      try {
        const client = ask.client;
        if (!client || typeof client.rpc !== "function") return data;
        const { data: answer, error } = await client.rpc("titan_periodic_quests_v1");
        if (!same(ask, context())) return data;
        if (error) {
          if (error.code === "PGRST202" || /Could not find/.test(error.message || "")) missing = true;
          else failure = "Les quêtes ne répondent pas pour l’instant.";
          return data;
        }
        if (answer && typeof answer === "object" && answer.week && answer.month) { data = answer; at = Date.now(); failure = ""; }
        return data;
      } catch {
        if (same(ask, context())) failure = "Les quêtes ne répondent pas pour l’instant.";
        return data;
      } finally {
        flight = null;
        if (same(ask, context())) changed();
      }
    })();
    return flight;
  }

  async function claim(scope) {
    sync();
    if (guest() || claiming || !data) return false;
    const ask = context();
    claiming = scope;
    changed();
    try {
      const { data: answer, error } = await ask.client.rpc("titan_periodic_quest_claim_v1", { p_scope: scope });
      if (!same(ask, context())) return false;
      if (error) throw error;
      if (answer && answer.week && answer.month) { data = answer; at = Date.now(); failure = ""; }
      return true;
    } catch (error) {
      if (same(ask, context())) {
        const m = String(error?.message || "");
        failure = m.includes("RATE_LIMITED") ? "Trop de demandes. Réessaie dans un instant." : m.includes("QUEST_INCOMPLETE") ? "Cette quête n’est pas encore terminée." : "Le souvenir n’a pas pu être récupéré. Réessaie.";
      }
      return false;
    } finally {
      if (same(ask, context())) { claiming = null; changed(); } else claiming = null;
    }
  }

  function card(q) {
    const d = T()?.describe(q, { sportLabel: (s) => window.TitanSports?.label?.(s) || s });
    if (!d) return "";
    const unit = d.target > 1 ? d.unit[1] : d.unit[0];
    const action = d.state === "ready"
      ? `<button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-quest-claim="${esc(d.scope)}" ${claiming ? "disabled" : ""}>${icon("star")} Récupérer mon souvenir</button>`
      : d.state === "claimed" ? `<span class="asc-chip cy">${icon("check")} Souvenir récupéré</span>` : "";
    return `<article class="asc-note av-pq" data-periodic-quest="${esc(d.scope)}" data-kind="${esc(d.kind)}" data-state="${d.state}">
      <div class="asc-stack-sm"><p class="asc-eyebrow">${esc(d.scopeLabel)} · facultative</p><strong>${esc(d.title)}</strong>
      <span class="asc-small">${esc(d.text)}</span>
      <span class="asc-ascent thin" role="progressbar" aria-label="${esc(d.scopeLabel)}" aria-valuemin="0" aria-valuemax="${d.target}" aria-valuenow="${d.value}"><span style="--p:${d.percent}%"></span></span>
      <span class="asc-small asc-muted">${d.value}/${d.target} ${esc(unit)}</span>
      ${action}</div></article>`;
  }

  /** The panel for the Aventure screen; empty for a guest, a server without the function, or while nothing is known yet. */
  function html() {
    sync();
    if (guest() || missing || !data) return failure && !guest() && !missing ? `<p class="asc-small asc-faint" data-periodic-quests-error role="status">${esc(failure)}</p>` : "";
    const s = data.souvenirs || {};
    return `<section class="asc-section av-panel" data-periodic-quests aria-labelledby="pq-title"><div class="asc-section-head"><h2 id="pq-title">Tes quêtes du moment</h2></div>
      <p class="asc-small asc-muted">Deux repères facultatifs, calculés d’après ta pratique réelle. Les terminer donne un souvenir décoratif : ni XP, ni crédits, et rien n’est perdu si tu passes.</p>
      <div class="asc-stack">${card(data.week)}${card(data.month)}</div>
      ${failure ? `<p class="asc-small asc-faint" role="status">${esc(failure)}</p>` : ""}
      ${(Number(s.weeks) || 0) + (Number(s.months) || 0) ? `<p class="asc-small asc-faint" data-pq-souvenirs>${Number(s.weeks) || 0} souvenir${(Number(s.weeks) || 0) > 1 ? "s" : ""} de semaine · ${Number(s.months) || 0} de mois</p>` : ""}</section>`;
  }

  document.addEventListener("click", (event) => {
    const b = event.target.closest?.("[data-quest-claim]");
    if (b) claim(b.dataset.questClaim);
  });
  window.addEventListener("titan:history-updated", () => { at = 0; refresh(true); });
  window.addEventListener("titan:account-changing", () => { reset(); owner = null; });

  window.TitanPeriodicQuests = { refresh, claim, html, get: () => data };
})();
