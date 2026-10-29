/* V11-70 (COM-B5): the world goal, on the QG. A long collective goal in three levels, optional: a player joins on purpose and only sees totals,
   the levels, the number of participants and its own share. Nothing is granted by it: no XP, no credit, no ranking. Shown only when the server
   flag screens.worldgoal is on, to a signed-in account, and when the server has the function. Every answer is applied only if the account, the
   client and the epoch are still the ones that asked. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const FLAG = "screens.worldgoal";
  const TTL = 60 * 1000;
  const MESSAGES = {
    NOT_ELIGIBLE: "Tu pourras rejoindre un objectif un jour après la création du compte.",
    GOAL_ENDED: "Cet objectif est terminé.",
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
  const changed = () => window.dispatchEvent(new CustomEvent("titan:world-goal-updated"));
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
        const { data: answer, error } = await ask.client.rpc("titan_world_goal_v1");
        if (!same(ask, context())) return data;
        if (error) {
          if (error.code === "PGRST202" || /Could not find/.test(error.message || "")) missing = true; else notice = failure(error);
          return data;
        }
        data = answer && typeof answer === "object" ? answer : false;
        at = Date.now(); notice = "";
        return data;
      } catch {
        if (same(ask, context())) notice = "L’objectif ne répond pas pour l’instant.";
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
      const { error } = await ask.client.rpc("titan_world_goal_join_v1", { p_goal: data.id, p_join: on_ });
      if (!same(ask, context())) return;
      if (error) notice = failure(error);
    } catch (error) {
      if (same(ask, context())) notice = failure(error);
    } finally {
      if (same(ask, context())) { const message = notice; busy = false; await refresh(true); if (same(ask, context())) { notice = message || notice; changed(); } } else busy = false;
    }
  }

  const day = (iso) => window.TitanFormat.longDate(new Date(`${iso}T12:00:00`));
  const NAMES = ["", "Premier palier", "Deuxième palier", "Troisième palier"];

  function html() {
    sync();
    if (!on() || missing || !data) return "";
    const levels = Array.isArray(data.levels) ? data.levels.map(Number) : [];
    const top = levels[2] || 1;
    const percent = Math.min(100, Math.round((Number(data.minutes) / top) * 100));
    const closed = data.state === "closed", upcoming = data.state === "upcoming", level = Number(data.level) || 0;
    const status = level ? `<span class="asc-chip cy">${icon("check")} ${NAMES[level]} atteint ensemble</span>` : closed ? `<span class="asc-chip">Objectif terminé</span>` : "";
    const action = closed ? "" : data.joined
      ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-wg-join="false" ${busy ? "disabled" : ""}>Quitter l’objectif</button>`
      : `<button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-wg-join="true" ${busy ? "disabled" : ""}>Rejoindre l’objectif</button>`;
    const share = level > 0 && window.TitanCard ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-wg-card>${icon("share")} Partager</button>` : "";
    const marks = levels.map((v, i) => `<li${level > i ? ' data-reached="true"' : ""}>${NAMES[i + 1]} : ${n(v)} min${level > i ? " ✓" : ""}</li>`).join("");
    return `<section class="asc-section asc-appear qg-wg" data-wg data-state="${esc(data.state)}" aria-labelledby="wg-title"><div class="asc-section-head"><h2 id="wg-title">Objectif collectif</h2></div>
      <div class="asc-panel qg-steps-card"><p><strong>${esc(data.title)}</strong></p>${data.detail ? `<p class="asc-small asc-muted">${esc(data.detail)}</p>` : ""}
        <p class="asc-small asc-muted">${upcoming ? "Commence le" : "Du"} ${esc(day(data.startsOn))} au ${esc(day(data.endsOn))}</p>
        <span class="asc-ascent thin" role="progressbar" aria-label="Progression de l’objectif collectif" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="--p:${percent}%"></span></span>
        <p class="asc-small asc-muted"><strong data-wg-total>${n(data.minutes)}</strong> min d’effort à tous · ${n(data.members)} participant${Number(data.members) > 1 ? "s" : ""}${data.joined ? ` · ta part : ${n(data.mine)} min` : ""}</p>
        <ul class="rv-list" data-wg-levels>${marks}</ul>
        ${status}${action || share ? `<div class="asc-row">${action}${share}</div>` : ""}
        ${notice ? `<p class="asc-small" role="status" data-wg-notice>${esc(notice)}</p>` : ""}
        <p class="asc-small asc-faint">Facultatif, sans obligation ni pénalité : seules les séances faites après ton inscription comptent, chaque sport à égalité et au plus 90 minutes d’effort par jour. Chacun ne voit que sa propre part. Aucun XP ni crédit à gagner.</p>
      </div></section>`;
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-wg-join]");
    if (b) join(b.dataset.wgJoin === "true");
    else if (e.target.closest?.("[data-wg-card]") && data && window.TitanCard && Number(data.level) > 0) {
      const goal = data, ask = context(), lvl = Number(goal.level);
      window.TitanCard.open({
        kind: "record", eyebrow: "Objectif collectif", title: goal.title, value: `${n(goal.minutes)} min`,
        detail: `${n(goal.members)} participant${Number(goal.members) > 1 ? "s" : ""}`, date: `${NAMES[lvl]} atteint ensemble`,
        context: goal.joined && Number(goal.mine) > 0 ? `Ma part : ${n(goal.mine)} min d’effort.` : "",
        filename: "titan-objectif-collectif", optIn: true, name: window.TitanCard.userName(), isCurrent: () => same(ask, context()),
      });
    }
  });
  window.addEventListener("titan:account-changing", () => { owner = null; reset(); });
  ["titan:account-changed", "titan:flags-updated", "titan:history-updated", "online"].forEach((ev) => window.addEventListener(ev, () => { sync(); refresh(ev === "titan:history-updated"); }));
  window.TitanWorldGoal = { html, refresh };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(() => refresh(), 0));
  else setTimeout(() => refresh(), 0);
})();
