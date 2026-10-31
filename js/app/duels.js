/* V11-66 (COM-C1, COM-E2): invitation links for the player's own friends' challenges, and the frozen result of finished ones, under the
   Communauté. A link is shown once, serves once and expires; it carries no personal data. The result of a finished challenge is frozen by the
   server. Nothing is granted: no XP, no credit, no prize. Shown only when the server flag screens.duels is on, to a signed-in account, and
   when the server has the functions. Every answer is applied only if the account, the client and the epoch are still the ones that asked. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const FLAG = "screens.duels";
  const MESSAGES = {
    LINK_LIMIT_5: "Tu as déjà cinq liens en attente pour ce défi : retire-en un ou attends qu’un ami s’en serve.",
    CHALLENGE_ENDED: "Ce défi est terminé.",
    CHALLENGE_NOT_FOUND: "Ce défi n’existe plus.",
    SOCIAL_RATE_LIMIT: "Beaucoup d’actions en peu de temps. Réessaie plus tard.",
  };

  let data = null;
  let owner = null;
  let flight = null;
  let missing = false;
  let busy = false;
  let notice = "";
  let root = null;
  let fresh = null;       // { challenge, url } the link just created, kept in memory only
  let results = null;     // { id, data } the result being read

  const context = () => ({ owner: window.state?.user?.id || null, client: window.titanClient || null, epoch: window.titanAccountTransition?.epoch });
  const same = (a, b) => a && b && a.owner === b.owner && a.client === b.client && a.epoch === b.epoch && !window.titanAccountTransition?.active;
  const guest = () => !context().owner || String(context().owner).startsWith("guest_");
  const on = () => !guest() && window.titanFlags?.enabled?.(FLAG, false) === true;
  const failure = (error) => {
    const code = Object.keys(MESSAGES).find((k) => String(error?.message || "").includes(k));
    return code ? MESSAGES[code] : "Le serveur ne répond pas pour l’instant. Réessaie dans un moment.";
  };
  const date = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }); };

  function reset() { data = null; flight = null; missing = false; busy = false; notice = ""; fresh = null; results = null; }
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
        const { data: answer, error } = await ask.client.rpc("titan_challenge_links_v1");
        if (!same(ask, context())) return;
        if (error) { if (error.code === "PGRST202" || /Could not find/.test(error.message || "")) missing = true; else notice = failure(error); return; }
        if (answer && typeof answer === "object") { data = answer; notice = ""; }
      } catch { if (same(ask, context())) notice = "Les défis ne répondent pas pour l’instant."; }
      finally { flight = null; if (same(ask, context())) render(); }
    })();
    return flight;
  }

  async function act(name, args, after) {
    sync();
    if (busy || !on()) return;
    const ask = context();
    busy = true; notice = ""; render();
    try {
      const { data: answer, error } = await ask.client.rpc(name, args);
      if (!same(ask, context())) return;
      if (error) notice = failure(error); else after?.(answer);
    } catch (error) {
      if (same(ask, context())) notice = failure(error);
    } finally {
      if (same(ask, context())) { const message = notice; busy = false; await refresh(); if (same(ask, context())) { notice = message || notice; render(); } } else busy = false;
    }
  }

  function render() {
    if (!root) return;
    if (!on() || missing || !data) { root.innerHTML = ""; root.hidden = true; return; }
    const mine = Array.isArray(data.mine) ? data.mine : [];
    const ended = Array.isArray(data.ended) ? data.ended : [];
    if (!mine.length && !ended.length) { root.innerHTML = ""; root.hidden = true; return; }
    root.hidden = false;
    const lock = busy ? "disabled" : "";
    const own = mine.map((c) => {
      const links = (c.links || []).map((l) => `<li class="asc-between" data-duel-link="${esc(l.id)}"><span class="asc-small">${l.used ? "Lien utilisé" : `Lien en attente · expire le ${esc(date(l.expiresAt))}`}</span>${l.used ? "" : `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-duel-revoke="${esc(l.id)}" ${lock}>Retirer</button>`}</li>`).join("");
      const shown = fresh && fresh.challenge === c.id
        ? `<div class="asc-note" data-duel-fresh><p class="asc-small">Voici ton lien. Il ne s’affichera plus : copie-le maintenant. Il sert une seule fois et expire dans 7 jours au plus.</p>
           <input class="asc-input" readonly value="${esc(fresh.url)}" aria-label="Lien d’invitation" data-duel-url>
           <div class="asc-row"><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-duel-copy>Copier le lien</button>${navigator.share ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-duel-share>Partager</button>` : ""}</div></div>`
        : "";
      return `<article class="asc-panel qg-steps-card" data-duel="${esc(c.id)}"><p><strong>${esc(c.title)}</strong> <span class="asc-small asc-muted">· jusqu’au ${esc(date(c.endsAt))}</span></p>
        ${links ? `<ul class="rv-list">${links}</ul>` : ""}${shown}
        <div class="asc-row"><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-duel-create="${esc(c.id)}" ${lock}>Créer un lien d’invitation</button></div></article>`;
    }).join("");
    const done = ended.map((c) => {
      const open = results && results.id === c.id && results.data;
      const list = open ? `<ol class="rv-list" data-duel-results>${(results.data.results || []).map((r) => `<li class="asc-between"><span>${esc(r.name)}${r.me ? " (toi)" : ""}</span><span><strong>${esc(window.TitanFormat.number(r.progress))}</strong> / ${esc(window.TitanFormat.number(results.data.target))}${r.reached ? " ✓" : ""}</span></li>`).join("")}</ol><p class="asc-small asc-faint">Résultat figé à la fin du défi. Ni XP ni crédit, juste le plaisir de s’être mesurés.</p>` : "";
      return `<article class="asc-panel qg-steps-card" data-duel-ended="${esc(c.id)}"><div class="asc-between"><span><strong>${esc(c.title)}</strong> <span class="asc-small asc-muted">· terminé le ${esc(date(c.endedAt))}</span></span>
        ${open ? (window.TitanCard && (results.data.results || []).some((r) => r.me) ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-duel-card="${esc(c.id)}">Partager</button>` : "") : `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-duel-result="${esc(c.id)}" ${lock}>Voir le résultat</button>`}</div>${list}</article>`;
    }).join("");
    root.innerHTML = `<section class="asc-section asc-appear" aria-labelledby="duel-title"><div class="asc-section-head"><h2 id="duel-title">Défis par lien</h2></div>
      <p class="asc-small asc-muted">Invite quelqu’un qui n’est pas encore ton ami à rejoindre un de tes défis. Le lien ne contient aucune donnée personnelle, sert une seule fois et peut être retiré à tout moment.</p>
      ${notice ? `<p class="asc-small" role="status" data-duel-notice>${esc(notice)}</p>` : ""}<div class="asc-stack">${own}${done}</div></section>`;
  }

  document.addEventListener("click", async (e) => {
    const t = e.target.closest?.("#duels button");
    if (!t || !root) return;
    if (t.dataset.duelCreate) {
      const challenge = t.dataset.duelCreate;
      act("titan_challenge_link_create_v1", { p_challenge: challenge }, (answer) => { if (answer?.token) fresh = { challenge, url: `${location.origin}/defi?t=${answer.token}` }; });
    } else if (t.dataset.duelRevoke) act("titan_challenge_link_revoke_v1", { p_invite: t.dataset.duelRevoke });
    else if (t.dataset.duelResult) {
      const id = t.dataset.duelResult;
      act("titan_challenge_result_v1", { p_id: id }, (answer) => { results = { id, data: answer }; });
    } else if (t.dataset.duelCard && results?.id === t.dataset.duelCard && window.TitanCard) {
      const r = (results.data.results || []).find((x) => x.me), ask = context();
      const title = (data?.ended || []).find((c) => c.id === results.id)?.title || "Défi";
      if (r) window.TitanCard.open({
        kind: "record", eyebrow: "Défi entre amis", title, value: `${window.TitanFormat.number(r.progress)} / ${window.TitanFormat.number(results.data.target)}`,
        detail: r.reached ? "Objectif atteint" : "", date: `${(results.data.results || []).length} participant${(results.data.results || []).length > 1 ? "s" : ""}`,
        filename: "titan-defi", optIn: true, name: window.TitanCard.userName(), isCurrent: () => same(ask, context()),
      });
    } else if (t.matches("[data-duel-copy]")) {
      try { await navigator.clipboard.writeText(fresh.url); window.titanShell?.toast?.({ type: "ok", message: "Lien copié." }); } catch { root.querySelector("[data-duel-url]")?.select(); }
    } else if (t.matches("[data-duel-share]")) {
      try { await navigator.share({ title: "Un défi t’attend sur TITAN", url: fresh.url }); } catch { /* cancelled */ }
    }
  });
  window.addEventListener("titan:account-changing", () => { owner = null; reset(); render(); });
  ["titan:account-changed", "titan:flags-updated", "online"].forEach((ev) => window.addEventListener(ev, () => { sync(); refresh(); }));
  window.TitanDuels = { refresh };
  function boot() { root = document.getElementById("duels"); if (!root) return; root.hidden = true; setTimeout(refresh, 0); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
