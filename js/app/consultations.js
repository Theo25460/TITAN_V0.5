/* V11-57 (COM-F3, COM-F4): votes and the public roadmap, shown under the Communauté. A vote is a preference, never a promise: no reward,
   no ranking, no date. Results of a poll appear only after it closes. Shown only when the server flag screens.consultations is on
   (publication is selective), only to a signed-in account, and only if the server has the functions. Every answer is applied only
   if the account, the client and the epoch are still the ones that asked. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const FLAG = "screens.consultations";
  const STATUS = { doing: "En chantier", planned: "Planifié", study: "À l’étude", wish: "Souhaité", shipped: "Livré" };
  const ORDER = ["doing", "planned", "study", "wish", "shipped"];
  const MESSAGES = {
    NOT_ELIGIBLE: "Les votes s’ouvrent un jour après la création du compte.",
    VOTE_LIMIT_5: "Tu soutiens déjà cinq idées. Retires-en une pour en soutenir une autre.",
    POLL_CLOSED: "Ce vote est terminé.",
    POLL_NOT_OPEN: "Ce vote n’est pas encore ouvert.",
    ITEM_SHIPPED: "Cette idée est déjà livrée.",
    RATE_LIMITED: "Beaucoup de votes en peu de temps. Réessaie dans un instant.",
  };

  let polls = null;
  let roadmap = null;
  let owner = null;
  let flight = null;
  let missing = false;
  let busy = null;
  let notice = "";
  let root = null;

  const context = () => ({ owner: window.state?.user?.id || null, client: window.titanClient || null, epoch: window.titanAccountTransition?.epoch });
  const same = (a, b) => a && b && a.owner === b.owner && a.client === b.client && a.epoch === b.epoch && !window.titanAccountTransition?.active;
  const guest = () => !context().owner || String(context().owner).startsWith("guest_");
  const on = () => !guest() && window.titanFlags?.enabled?.(FLAG, false) === true;

  function reset() { polls = null; roadmap = null; flight = null; missing = false; busy = null; notice = ""; }
  function sync() {
    const id = guest() ? null : context().owner;
    if (id !== owner) { owner = id; reset(); }
  }
  const failure = (error) => {
    const code = Object.keys(MESSAGES).find((k) => String(error?.message || "").includes(k));
    return code ? MESSAGES[code] : "Le serveur ne répond pas pour l’instant. Réessaie dans un moment.";
  };

  async function refresh() {
    sync();
    if (!root || guest() || missing || !navigator.onLine) return render();
    if (!on()) return render();
    if (flight) return flight;
    const ask = context();
    flight = (async () => {
      try {
        const [p, r] = await Promise.all([ask.client.rpc("titan_polls_v1"), ask.client.rpc("titan_roadmap_v1")]);
        if (!same(ask, context())) return;
        const absent = (e) => e && (e.code === "PGRST202" || /Could not find/.test(e.message || ""));
        if (absent(p.error) || absent(r.error)) { missing = true; return; }
        if (p.error || r.error) { notice = "Les votes ne répondent pas pour l’instant."; return; }
        if (Array.isArray(p.data)) polls = p.data;
        if (Array.isArray(r.data)) roadmap = r.data;
        notice = "";
      } catch {
        if (same(ask, context())) notice = "Les votes ne répondent pas pour l’instant.";
      } finally { flight = null; if (same(ask, context())) render(); }
    })();
    return flight;
  }

  async function act(key, name, args) {
    sync();
    if (busy || guest()) return;
    const ask = context();
    busy = key; notice = ""; render();
    try {
      const { error } = await ask.client.rpc(name, args);
      if (!same(ask, context())) return;
      if (error) { notice = failure(error); }
    } catch (error) {
      if (!same(ask, context())) return;
      notice = failure(error);
    } finally {
      if (same(ask, context())) { const message = notice; busy = null; await refresh(); if (same(ask, context())) { notice = message || notice; render(); } } else busy = null;
    }
  }

  const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : window.TitanFormat.longDate(d); };

  function pollHtml(p) {
    const open = p.state === "open";
    const total = (p.options || []).reduce((n, o) => n + (Number(o.votes) || 0), 0);
    const options = (p.options || []).map((o) => {
      if (open) return `<label class="cs-option"><input type="radio" name="poll-${esc(p.id)}" value="${o.position}" ${p.myVote === o.position ? "checked" : ""} ${busy ? "disabled" : ""}> <span>${esc(o.label)}</span></label>`;
      const share = total ? Math.round(((Number(o.votes) || 0) / total) * 100) : 0;
      return `<div class="cs-result"><div class="asc-between"><span>${esc(o.label)}${p.myVote === o.position ? " <span class=\"asc-chip cy\">ton vote</span>" : ""}</span><strong>${Number(o.votes) || 0}</strong></div><span class="asc-ascent thin" role="img" aria-label="${share} %"><span style="--p:${share}%"></span></span></div>`;
    }).join("");
    return `<article class="asc-panel cs-poll" data-poll="${esc(p.id)}" data-state="${esc(p.state)}">
      <p class="asc-eyebrow">${open ? `Vote ouvert jusqu’au ${esc(when(p.closesAt))}` : `Vote terminé le ${esc(when(p.closesAt))}`}</p>
      <h3>${esc(p.title)}</h3>${p.detail ? `<p class="asc-small asc-muted">${esc(p.detail)}</p>` : ""}
      ${open ? `<fieldset class="cs-options" ${busy ? "disabled" : ""}><legend class="sr-only">${esc(p.title)}</legend>${options}</fieldset>
        <button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-poll-vote="${esc(p.id)}" ${busy ? "disabled" : ""}>${p.myVote ? "Changer mon vote" : "Voter"}</button>
        <p class="asc-small asc-faint">Une voix par compte, modifiable jusqu’à la clôture. Le résultat s’affiche une fois le vote terminé.</p>`
        : `<div class="asc-stack-sm">${options}</div><p class="asc-small asc-faint">${total} voix au total. L’équipe décide en dernier ressort : un vote éclaire, il n’engage pas.</p>`}
    </article>`;
  }

  function itemHtml(i) {
    const shipped = i.status === "shipped";
    return `<li class="cs-item" data-item="${esc(i.id)}" data-status="${esc(i.status)}"><div class="asc-between"><div class="asc-stack-sm"><strong>${esc(i.title)}</strong>${i.detail ? `<span class="asc-small asc-muted">${esc(i.detail)}</span>` : ""}
      <span class="asc-small asc-faint">${esc(STATUS[i.status] || i.status)} · ${Number(i.votes) || 0} soutien${(Number(i.votes) || 0) > 1 ? "s" : ""}</span></div>
      ${shipped ? `<span class="asc-chip cy">${icon("check")} Livré</span>` : `<button type="button" class="asc-btn ${i.mine ? "asc-btn-primary" : "asc-btn-secondary"} asc-btn-sm" data-roadmap-vote="${esc(i.id)}" data-on="${i.mine ? "false" : "true"}" aria-pressed="${i.mine ? "true" : "false"}" ${busy ? "disabled" : ""}>${i.mine ? "Je soutiens" : "Soutenir"}</button>`}
      </div></li>`;
  }

  function render() {
    if (!root) return;
    sync();
    if (!on() || missing || (!polls && !roadmap)) { root.innerHTML = ""; root.hidden = true; return; }
    root.hidden = false;
    const groups = ORDER.map((st) => ({ st, items: (roadmap || []).filter((i) => i.status === st) })).filter((g) => g.items.length);
    root.innerHTML = `<section class="asc-section asc-appear" aria-labelledby="cs-title"><div class="asc-section-head"><h2 id="cs-title">Votes et feuille de route</h2></div>
      <p class="asc-small asc-muted">Un vote est une préférence, jamais une promesse : il ne donne ni récompense ni avantage, et un statut n’est pas une date.</p>
      ${notice ? `<p class="asc-small" role="status" data-cs-notice>${esc(notice)}</p>` : ""}
      ${(polls || []).length ? `<div class="asc-stack" data-polls>${polls.map(pollHtml).join("")}</div>` : ""}
      ${groups.length ? `<div class="asc-stack" data-roadmap><h3>Idées à l’étude</h3><p class="asc-small asc-faint">Tu peux soutenir jusqu’à cinq idées à la fois.</p>${groups.map((g) => `<div class="asc-stack-sm"><h4 class="asc-eyebrow">${esc(STATUS[g.st])}</h4><ul class="cs-items">${g.items.map(itemHtml).join("")}</ul></div>`).join("")}</div>` : ""}
    </section>`;
  }

  document.addEventListener("click", (e) => {
    const v = e.target.closest?.("[data-poll-vote]");
    if (v && root?.contains(v)) {
      const id = v.dataset.pollVote;
      const checked = root.querySelector(`[data-poll="${CSS.escape(id)}"] input:checked`);
      if (!checked) { notice = "Choisis une option avant de voter."; render(); return; }
      act(`poll:${id}`, "titan_poll_vote_v1", { p_poll: id, p_option: Number(checked.value) });
      return;
    }
    const r = e.target.closest?.("[data-roadmap-vote]");
    if (r && root?.contains(r)) act(`item:${r.dataset.roadmapVote}`, "titan_roadmap_vote_v1", { p_item: r.dataset.roadmapVote, p_on: r.dataset.on === "true" });
  });
  window.addEventListener("titan:account-changing", () => { owner = null; reset(); render(); });
  window.addEventListener("titan:account-changed", () => { sync(); refresh(); });
  window.addEventListener("online", () => refresh());
  window.addEventListener("titan:flags-updated", () => refresh());

  function boot() {
    root = document.getElementById("consultations");
    if (!root) return;
    root.hidden = true;
    setTimeout(refresh, 0);
  }
  window.TitanConsultations = { refresh };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
