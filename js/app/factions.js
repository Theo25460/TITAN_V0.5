/* V11-74 (COM-D2): the three factions, under the Communauté. A player may join one on purpose; the first choice can be corrected once, then a
   change waits thirty days. A faction shows its number of members and its effort of the week only from five members, never a name. Distinct
   from the personal guild and from clubs. No XP, credit or advantage. Shown only when the server flag screens.factions is on, to a signed-in
   account, and when the server has the functions. Every answer is applied only if the account, the client and the epoch are still the ones
   that asked. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const FLAG = "screens.factions";
  const MESSAGES = {
    NOT_ELIGIBLE: "Tu pourras choisir une faction un jour après la création du compte.",
    FACTION_CHANGE_LOCKED: "Tu as changé de faction récemment : le prochain changement sera possible à la date indiquée.",
    FACTION_NOT_FOUND: "Cette faction n’existe plus.",
    RATE_LIMITED: "Beaucoup d’actions en peu de temps. Réessaie dans un instant.",
  };
  const ICONS = { sunrise: "sun", anvil: "hammer", path: "route" };

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
  const n = (v) => window.TitanFormat.number(v);
  const failure = (error) => {
    const code = Object.keys(MESSAGES).find((k) => String(error?.message || "").includes(k));
    return code ? MESSAGES[code] : "Le serveur ne répond pas pour l’instant. Réessaie dans un moment.";
  };
  const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }); };

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
        const { data: answer, error } = await ask.client.rpc("titan_faction_v1");
        if (!same(ask, context())) return;
        if (error) { if (error.code === "PGRST202" || /Could not find/.test(error.message || "")) missing = true; else notice = failure(error); return; }
        if (answer && typeof answer === "object") { data = answer; notice = ""; }
      } catch { if (same(ask, context())) notice = "Les factions ne répondent pas pour l’instant."; }
      finally { flight = null; if (same(ask, context())) render(); }
    })();
    return flight;
  }

  async function choose(key) {
    sync();
    if (busy || !on()) return;
    const ask = context();
    busy = true; notice = ""; render();
    try {
      const { error } = await ask.client.rpc("titan_faction_choose_v1", { p_key: key });
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
    if (!on() || missing || !data || !Array.isArray(data.factions)) { root.innerHTML = ""; root.hidden = true; return; }
    root.hidden = false;
    const lock = busy ? "disabled" : "";
    const canChange = !data.canChangeAt || new Date(data.canChangeAt).getTime() <= Date.now() + 1000;
    const cards = data.factions.map((f) => {
      const mine = data.mine === f.key;
      const stats = f.members === null || f.members === undefined ? `<p class="asc-small asc-faint">Les chiffres apparaissent à partir de cinq membres.</p>`
        : `<p class="asc-small asc-muted"><strong>${n(f.members)}</strong> membre${Number(f.members) > 1 ? "s" : ""} · <strong>${n(f.minutes)}</strong> min d’effort cette semaine</p>`;
      const action = mine ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-faction-leave ${lock || (canChange ? "" : "disabled")}>Quitter</button>`
        : `<button type="button" class="asc-btn ${data.mine ? "asc-btn-secondary" : "asc-btn-primary"} asc-btn-sm" data-faction-join="${esc(f.key)}" ${lock || (data.mine && !canChange ? "disabled" : "")}>${data.mine ? "Passer à cette faction" : "Rejoindre"}</button>`;
      return `<article class="asc-panel qg-steps-card" data-faction="${esc(f.key)}" ${mine ? 'data-mine="true"' : ""}><p><strong>${esc(f.name)}</strong>${mine ? ` <span class="asc-chip cy">${window.titanIcon ? window.titanIcon("check") : ""} La tienne</span>` : ""}</p>
        <p class="asc-small asc-muted">${esc(f.motto)}</p>${stats}<div class="asc-row">${action}</div></article>`;
    }).join("");
    const lockNote = data.canChangeAt && !canChange ? `<p class="asc-small asc-muted" data-faction-lock>Tu pourras changer de faction à partir du ${esc(when(data.canChangeAt))}.</p>` : "";
    root.innerHTML = `<section class="asc-section asc-appear" aria-labelledby="faction-title"><div class="asc-section-head"><h2 id="faction-title">Factions</h2></div>
      <p class="asc-small asc-muted">Trois camps pour porter une identité commune. Choisir est facultatif : seules tes séances faites depuis ton arrivée comptent, une seule faction à la fois, et personne ne voit ta contribution. Aucun XP ni avantage.</p>
      ${notice ? `<p class="asc-small" role="status" data-faction-notice>${esc(notice)}</p>` : ""}${lockNote}
      <div class="asc-stack">${cards}</div></section>`;
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest?.("#factions button");
    if (!t || !root) return;
    if (t.dataset.factionJoin) choose(t.dataset.factionJoin);
    else if (t.matches("[data-faction-leave]")) {
      if (window.titanShell?.confirm) window.titanShell.confirm({ title: "Quitter ta faction ?", message: "Tu pourras en rejoindre une autre, mais seulement dans trente jours.", confirmLabel: "Quitter", action: async () => { choose(null); } });
      else choose(null);
    }
  });
  window.addEventListener("titan:account-changing", () => { owner = null; reset(); render(); });
  ["titan:account-changed", "titan:flags-updated", "online"].forEach((ev) => window.addEventListener(ev, () => { sync(); refresh(); }));
  window.TitanFactions = { refresh };
  function boot() { root = document.getElementById("factions"); if (!root) return; root.hidden = true; setTimeout(refresh, 0); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
