/* V11-61 (COM-B7): the daily rendezvous of the QG. "Quel est ton objectif aujourd'hui ?" is optional: one short sentence for the day,
   private unless the player shares it with friends, ticked when kept, encouraged by friends (a count, never names). No streak, no
   missed-day counter, nothing for a rest day, nothing published automatically. Shown only when the server flag screens.intents is on, to a
   signed-in account, and when the server has the functions. Every answer is applied only if the account, the client and the epoch are
   still the ones that asked. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const FLAG = "screens.intents";
  const MESSAGES = {
    DAY_OUT_OF_RANGE: "Ce jour n’est pas disponible. Recharge la page.",
    INTENT_TOO_SHORT: "Écris une phrase d’au moins trois caractères.",
    RATE_LIMIT: "Beaucoup d’actions en peu de temps. Réessaie plus tard.",
    SOCIAL_RATE_LIMIT: "Beaucoup d’actions en peu de temps. Réessaie plus tard.",
    CHEER_NOT_ALLOWED: "Cet encouragement n’est plus possible.",
    ACCOUNT_SUSPENDED: "Le compte est suspendu.",
  };

  let data = null;
  let owner = null;
  let flight = null;
  let missing = false;
  let busy = null;
  let notice = "";
  let dialog = null;
  let dayOfData = "";

  const context = () => ({ owner: window.state?.user?.id || null, client: window.titanClient || null, epoch: window.titanAccountTransition?.epoch });
  const same = (a, b) => a && b && a.owner === b.owner && a.client === b.client && a.epoch === b.epoch && !window.titanAccountTransition?.active;
  const guest = () => !context().owner || String(context().owner).startsWith("guest_");
  const on = () => !guest() && window.titanFlags?.enabled?.(FLAG, false) === true;
  const changed = () => window.dispatchEvent(new CustomEvent("titan:intents-updated"));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const failure = (error) => {
    const code = Object.keys(MESSAGES).find((k) => String(error?.message || "").includes(k));
    return code ? MESSAGES[code] : "Le serveur ne répond pas pour l’instant. Réessaie dans un moment.";
  };

  function reset() { data = null; flight = null; missing = false; busy = null; notice = ""; dayOfData = ""; if (dialog?.open) dialog.close(); }
  function sync() {
    const id = guest() ? null : context().owner;
    if (id !== owner) { owner = id; reset(); changed(); }
    if (data && dayOfData !== today()) { data = null; dayOfData = ""; }
  }

  async function refresh() {
    sync();
    if (!on() || missing || !navigator.onLine) return data;
    if (flight) return flight;
    const ask = context(), day = today();
    flight = (async () => {
      try {
        const { data: answer, error } = await ask.client.rpc("titan_intents_v1", { p_day: day });
        if (!same(ask, context())) return data;
        if (error) {
          if (error.code === "PGRST202" || /Could not find/.test(error.message || "")) missing = true; else notice = failure(error);
          return data;
        }
        if (answer && typeof answer === "object") { data = answer; dayOfData = day; notice = ""; }
        return data;
      } catch {
        if (same(ask, context())) notice = "Le rendez-vous ne répond pas pour l’instant.";
        return data;
      } finally { flight = null; if (same(ask, context())) changed(); }
    })();
    return flight;
  }

  async function act(key, name, args, after) {
    sync();
    if (busy || !on()) return false;
    const ask = context();
    busy = key; notice = ""; changed();
    try {
      const { error } = await ask.client.rpc(name, args);
      if (!same(ask, context())) return false;
      if (error) { notice = failure(error); return false; }
      after?.();
      return true;
    } catch (error) {
      if (same(ask, context())) notice = failure(error);
      return false;
    } finally {
      if (same(ask, context())) { const message = notice; busy = null; await refresh(); if (same(ask, context())) { notice = message || notice; changed(); } } else busy = null;
    }
  }

  function html() {
    sync();
    if (!on() || missing || !data) return "";
    const mine = data.mine;
    const friends = Array.isArray(data.friends) ? data.friends : [];
    const lock = busy ? "disabled" : "";
    const head = `<div class="asc-section-head"><h2 id="rv-title">Ton rendez-vous du jour</h2></div>`;
    const own = mine
      ? `<div class="asc-panel rv-mine" data-rv-mine data-done="${mine.done ? "true" : "false"}"><p class="rv-text"><strong>${esc(mine.intent)}</strong></p>
          <p class="asc-small asc-muted">${mine.visibility === "friends" ? "Visible de tes amis." : "Privé : toi seul le vois."}${Number(mine.cheers) > 0 ? ` ${Number(mine.cheers)} ami${Number(mine.cheers) > 1 ? "s t’encouragent" : " t’encourage"}.` : ""}</p>
          <div class="asc-row"><button type="button" class="asc-btn ${mine.done ? "asc-btn-secondary" : "asc-btn-primary"} asc-btn-sm" data-rv-done="${mine.done ? "false" : "true"}" aria-pressed="${mine.done ? "true" : "false"}" ${lock}>${mine.done ? "C’est fait ✓" : "C’est fait"}</button>
          <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-rv-edit ${lock}>Modifier</button>
          <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-rv-clear ${lock}>Effacer</button></div></div>`
      : `<div class="asc-panel rv-empty" data-rv-empty><p class="asc-muted">Quel est ton objectif aujourd’hui ? C’est facultatif : un jour de repos est aussi un bon objectif, et rien n’est compté ni perdu.</p>
          <button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-rv-edit ${lock}>Poser mon objectif</button></div>`;
    const list = friends.length
      ? `<div class="asc-stack-sm" data-rv-friends><h3 class="asc-eyebrow">Ce que visent tes amis</h3><ul class="rv-list">${friends.map((f) => `<li class="asc-between" data-rv-friend="${esc(f.userId)}"><span><strong>${esc(f.name)}</strong> · ${esc(f.intent)}${f.done ? ` <span class="asc-chip cy">${icon("check")} fait</span>` : ""}</span>
          <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-rv-cheer="${esc(f.userId)}" data-on="${f.cheered ? "false" : "true"}" aria-pressed="${f.cheered ? "true" : "false"}" ${lock}>${f.cheered ? "Encouragé" : "Encourager"}</button></li>`).join("")}</ul></div>`
      : "";
    return `<section class="asc-section asc-appear qg-rv" data-rv aria-labelledby="rv-title">${head}${own}${notice ? `<p class="asc-small" role="status" data-rv-notice>${esc(notice)}</p>` : ""}${list}</section>`;
  }

  function sheet() {
    sync();
    if (!on() || dialog?.open) return dialog;
    const ask = context(), mine = data?.mine;
    const body = document.createElement("form");
    body.className = "asc-stack";
    body.noValidate = true;
    body.innerHTML = `<p class="asc-muted">Une phrase courte, pour aujourd’hui seulement. Rien n’est publié sans ton choix.</p>
      <label class="asc-field"><span>Mon objectif du jour</span><input class="asc-input" name="intent" maxlength="80" placeholder="Courir 30 minutes" value="${esc(mine?.intent || "")}" required></label>
      <label class="rv-share"><input type="checkbox" name="friends" ${mine?.visibility === "friends" ? "checked" : ""}> Visible de mes amis</label>
      <p class="asc-small" role="alert" data-rv-error hidden></p>
      <div class="asc-row"><button type="submit" class="asc-btn asc-btn-primary">Enregistrer</button></div>`;
    const d = window.titanShell.sheet({ title: "Mon objectif du jour", eyebrow: "Facultatif", body, onClose: () => { if (dialog === d) dialog = null; } });
    dialog = d;
    body.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!same(ask, context())) { d.close(); return; }
      const text = String(new FormData(body).get("intent") || "").trim();
      const err = body.querySelector("[data-rv-error]");
      if (text.length < 3) { err.hidden = false; err.textContent = MESSAGES.INTENT_TOO_SHORT; return; }
      const ok = await act("set", "titan_intent_set_v1", { p_day: today(), p_text: text, p_visibility: body.elements.friends.checked ? "friends" : "private" });
      if (ok) d.close(); else { err.hidden = false; err.textContent = notice || "Impossible pour l’instant."; }
    });
    return d;
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest?.("[data-rv] button");
    if (!t) return;
    if (t.matches("[data-rv-edit]")) sheet();
    else if (t.matches("[data-rv-done]")) act("done", "titan_intent_done_v1", { p_day: today(), p_done: t.dataset.rvDone === "true" });
    else if (t.matches("[data-rv-clear]")) act("clear", "titan_intent_clear_v1", { p_day: today() });
    else if (t.matches("[data-rv-cheer]")) act(`cheer:${t.dataset.rvCheer}`, "titan_intent_cheer_v1", { p_owner: t.dataset.rvCheer, p_day: today(), p_on: t.dataset.on === "true" });
  });
  window.addEventListener("titan:account-changing", () => { owner = null; reset(); });
  ["titan:account-changed", "titan:flags-updated", "online"].forEach((ev) => window.addEventListener(ev, () => { sync(); refresh(); }));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
  window.TitanIntents = { html, refresh };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(() => refresh(), 0));
  else setTimeout(() => refresh(), 0);
})();
