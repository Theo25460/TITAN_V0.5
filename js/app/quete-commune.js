/* V11-62 (COM-B1): the common quest of the week, on the QG. Optional and collective: a player joins on purpose and only sees totals, the
   target, the number of participants and its own share. Nothing is granted by this quest: no XP, no credit, no ranking. Shown only when the
   server flag screens.commonquest is on, to a signed-in account, and when the server has the function. Every answer is applied only if the
   account, the client and the epoch are still the ones that asked. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const FLAG = "screens.commonquest";
  const TTL = 60 * 1000;
  const MESSAGES = {
    NOT_ELIGIBLE: "Tu pourras rejoindre une quête un jour après la création du compte.",
    QUEST_ENDED: "Cette semaine est terminée.",
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
  const changed = () => window.dispatchEvent(new CustomEvent("titan:common-quest-updated"));
  const n = (v) => window.TitanFormat.number(v);
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
    if (!force && data !== null && Date.now() - at < TTL) return data;
    const ask = context();
    flight = (async () => {
      try {
        const { data: answer, error } = await ask.client.rpc("titan_common_quest_v1");
        if (!same(ask, context())) return data;
        if (error) {
          if (error.code === "PGRST202" || /Could not find/.test(error.message || "")) missing = true; else notice = failure(error);
          return data;
        }
        data = answer && typeof answer === "object" ? answer : false;
        at = Date.now(); notice = "";
        return data;
      } catch {
        if (same(ask, context())) notice = "La quête ne répond pas pour l’instant.";
        return data;
      } finally { flight = null; if (same(ask, context())) changed(); }
    })();
    return flight;
  }

  async function join(on_) {
    sync();
    if (busy || !on() || !data) return;
    const ask = context();
    busy = true; notice = ""; changed();
    try {
      const { error } = await ask.client.rpc("titan_common_quest_join_v1", { p_quest: data.id, p_join: on_ });
      if (!same(ask, context())) return;
      if (error) notice = failure(error);
    } catch (error) {
      if (same(ask, context())) notice = failure(error);
    } finally {
      if (same(ask, context())) { const message = notice; busy = false; await refresh(true); if (same(ask, context())) { notice = message || notice; changed(); } } else busy = false;
    }
  }

  function html() {
    sync();
    if (!on() || missing || !data) return "";
    const percent = data.target > 0 ? Math.min(100, Math.round((Number(data.minutes) / Number(data.target)) * 100)) : 0;
    const done = data.state === "done", closed = data.state === "closed";
    const status = done ? `<span class="asc-chip cy">${icon("check")} Objectif atteint ensemble</span>` : closed ? `<span class="asc-chip">Semaine terminée</span>` : "";
    const action = closed ? "" : data.joined
      ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-cq-join="false" ${busy ? "disabled" : ""}>Quitter la quête</button>`
      : `<button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-cq-join="true" ${busy ? "disabled" : ""}>Rejoindre la quête</button>`;
    return `<section class="asc-section asc-appear qg-cq" data-cq data-state="${esc(data.state)}" aria-labelledby="cq-title"><div class="asc-section-head"><h2 id="cq-title">Quête commune de la semaine</h2></div>
      <div class="asc-panel qg-steps-card"><p><strong>${esc(data.title)}</strong></p>${data.detail ? `<p class="asc-small asc-muted">${esc(data.detail)}</p>` : ""}
        <span class="asc-ascent thin" role="progressbar" aria-label="Progression de la quête commune" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="--p:${percent}%"></span></span>
        <p class="asc-small asc-muted"><strong data-cq-total>${n(data.minutes)}</strong> / ${n(data.target)} min d’effort · ${n(data.members)} participant${Number(data.members) > 1 ? "s" : ""}${data.joined ? ` · ta part : ${n(data.mine)} min` : ""}</p>
        ${status}${action || (done || closed) && Number(data.minutes) > 0 ? `<div class="asc-row">${action}${(done || closed) && Number(data.minutes) > 0 && window.TitanCard ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-cq-card>${icon("share")} Partager</button>` : ""}</div>` : ""}
        ${notice ? `<p class="asc-small" role="status" data-cq-notice>${esc(notice)}</p>` : ""}
        <p class="asc-small asc-faint">Facultative : seules les séances faites après ton inscription comptent, chaque sport à égalité, et chacun ne voit que sa propre part. Aucun XP ni crédit à gagner.</p>
      </div></section>`;
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-cq-join]");
    if (b) join(b.dataset.cqJoin === "true");
    else if (e.target.closest?.("[data-cq-card]") && data && window.TitanCard) {
      const quest = data, ask = context();
      window.TitanCard.open({
        kind: "record", eyebrow: "Quête commune", title: quest.title, value: `${n(quest.minutes)} min`,
        detail: `${n(quest.members)} participant${Number(quest.members) > 1 ? "s" : ""}`,
        date: quest.state === "done" ? "Objectif atteint ensemble" : "Semaine terminée",
        context: quest.joined && Number(quest.mine) > 0 ? `Ma part : ${n(quest.mine)} min d’effort.` : "",
        filename: "titan-quete-commune", optIn: true, name: window.TitanCard.userName(), isCurrent: () => same(ask, context()),
      });
    }
  });
  window.addEventListener("titan:account-changing", () => { owner = null; reset(); });
  ["titan:account-changed", "titan:flags-updated", "titan:history-updated", "online"].forEach((ev) => window.addEventListener(ev, () => { sync(); refresh(ev === "titan:history-updated"); }));
  window.TitanCommonQuest = { html, refresh };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(() => refresh(), 0));
  else setTimeout(() => refresh(), 0);
})();
