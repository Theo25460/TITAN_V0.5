/* V11-74 (COM-D4): the Pantheon of the Titans, under the Communauté. A gallery of dated distinctions that come from rules (pioneer, a season taken
   part in until its close, a friendly challenge taken up), never from a ranking: most recent first. A player appears only after opting in, with a
   public profile, and can leave at once. No XP, credit or prize. Shown only when the server flag screens.pantheon is on, to a signed-in account,
   and when the server has the functions. Every answer is applied only if the account, the client and the epoch are still the ones that asked.
   Every name is escaped. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const FLAG = "screens.pantheon";
  const MESSAGES = {
    NOT_ELIGIBLE: "Tu pourras figurer au Panthéon un jour après la création du compte.",
    RATE_LIMITED: "Beaucoup d’actions en peu de temps. Réessaie dans un instant.",
  };

  let data = null;
  let owner = null;
  let flight = null;
  let missing = false;
  let busy = false;
  let notice = "";
  let root = null;

  const context = () => ({ owner: window.state?.user?.id || null, client: window.titanClient || null, epoch: window.titanAccountTransition?.epoch });
  const same = (a, b) => a && b && a.owner === b.owner && a.client === b.client && a.epoch === b.epoch && !window.titanAccountTransition?.active;
  const guest = () => !context().owner || String(context().owner).startsWith("guest_");
  const on = () => !guest() && window.titanFlags?.enabled?.(FLAG, false) === true;
  const failure = (error) => {
    const code = Object.keys(MESSAGES).find((k) => String(error?.message || "").includes(k));
    return code ? MESSAGES[code] : "Le serveur ne répond pas pour l’instant. Réessaie dans un moment.";
  };
  const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); };

  function reset() { data = null; flight = null; missing = false; busy = false; notice = ""; }
  function sync() {
    const id = guest() ? null : context().owner;
    if (id !== owner) { owner = id; reset(); render(); }
  }

  async function refresh() {
    sync();
    if (!root || !on() || missing || !navigator.onLine) return render();
    if (flight) return flight;
    const ask = context();
    flight = (async () => {
      try {
        const { data: answer, error } = await ask.client.rpc("titan_pantheon_v1");
        if (!same(ask, context())) return;
        if (error) { if (error.code === "PGRST202" || /Could not find/.test(error.message || "")) missing = true; else notice = failure(error); return; }
        if (answer && typeof answer === "object") { data = answer; notice = ""; }
      } catch { if (same(ask, context())) notice = "Le Panthéon ne répond pas pour l’instant."; }
      finally { flight = null; if (same(ask, context())) render(); }
    })();
    return flight;
  }

  async function setOptIn(value) {
    sync();
    if (busy || !on()) return;
    const ask = context();
    busy = true; notice = ""; render();
    try {
      const { error } = await ask.client.rpc("titan_pantheon_set_v1", { p_on: value });
      if (!same(ask, context())) return;
      if (error) notice = failure(error);
    } catch (error) {
      if (same(ask, context())) notice = failure(error);
    } finally {
      if (same(ask, context())) { const message = notice; busy = false; await refresh(); if (same(ask, context())) { notice = message || notice; render(); } } else busy = false;
    }
  }

  function render() {
    if (!root) return;
    if (!on() || missing || !data) { root.innerHTML = ""; root.hidden = true; return; }
    root.hidden = false;
    const entries = (Array.isArray(data.entries) ? data.entries.slice() : []).sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());   // most recent first, whatever the order received
    const lock = busy ? "disabled" : "";
    const state = data.mine
      ? `<p class="asc-small">${data.hiddenByTeam ? "L’équipe TITAN a masqué ton entrée. " : data.profilePublic ? "Tu figures au Panthéon. " : "Tu as accepté de figurer, mais ton profil est privé : rien n’est montré tant qu’il le reste. "}<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-pantheon-off ${lock}>Retirer mon nom</button></p>`
      : `<p class="asc-small">Tu ne figures pas au Panthéon. Pour y paraître, ton profil doit être public ; tu peux t’en retirer à tout moment. <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-pantheon-on ${lock}>Apparaître au Panthéon</button></p>`;
    const list = entries.length
      ? `<ul class="rv-list" data-pantheon-list>${entries.map((e) => `<li class="asc-between"><span><strong>${esc(e.name)}</strong>${e.me ? " (toi)" : ""}<br><span class="asc-small asc-muted">${esc(e.label)}</span></span><span class="asc-small asc-muted">${esc(when(e.at))}</span></li>`).join("")}</ul>`
      : `<p class="asc-small asc-muted">Personne ne figure encore au Panthéon.</p>`;
    root.innerHTML = `<section class="asc-section asc-appear" aria-labelledby="pantheon-title"><div class="asc-section-head"><h2 id="pantheon-title">Panthéon des Titans</h2></div>
      <p class="asc-small asc-muted">Une galerie de distinctions datées, issues de règles et jamais d’un classement : les plus récentes d’abord. Aucun XP ni récompense.</p>
      ${notice ? `<p class="asc-small" role="status" data-pantheon-notice>${esc(notice)}</p>` : ""}${state}${list}</section>`;
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest?.("#pantheon button");
    if (!t || !root) return;
    if (t.matches("[data-pantheon-on]")) setOptIn(true);
    else if (t.matches("[data-pantheon-off]")) setOptIn(false);
  });
  window.addEventListener("titan:account-changing", () => { owner = null; reset(); render(); });
  ["titan:account-changed", "titan:flags-updated", "online"].forEach((ev) => window.addEventListener(ev, () => { sync(); refresh(); }));
  window.TitanPantheon = { refresh };
  function boot() { root = document.getElementById("pantheon"); if (!root) return; root.hidden = true; setTimeout(refresh, 0); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
