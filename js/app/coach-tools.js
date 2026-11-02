/* TITAN 300 — Coach tools (V11-81): per-link messages, weekly check-in shared at the athlete's choice,
   coach session templates. Mounted by coaching.js into a slot; every callback re-checks the account context. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const MSG = {
    RATE_LIMITED: "Trop de demandes : réessaie dans un instant.",
    SHARING_UNAVAILABLE: "Ce suivi n’est plus actif.",
    BAD_BODY: "Le message est vide ou trop long.",
    BAD_SCORES: "Choisis au moins une note de 1 à 5.",
    BAD_NOTE: "La note est trop longue (500 caractères).",
    TEMPLATE_LIMIT: "Tu as atteint 100 modèles.",
    BAD_TITLE: "Donne un nom au modèle.",
  };
  const human = (e) => MSG[e?.message] || (navigator.onLine ? "La demande n’a pas été confirmée. Réessaie." : "Hors ligne : revient avec le réseau.");
  const SCORES = [["fatigue", "Fatigue"], ["energy", "Énergie"], ["sleep", "Sommeil"], ["motivation", "Motivation"]];
  const fmtAt = (v) => new Date(v).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const fmtWeek = (v) => new Date(v + "T12:00:00Z").toLocaleDateString("fr-FR", { timeZone: "UTC", day: "numeric", month: "short" });

  async function call(ctx, fn, args) {
    if (!ctx.ok()) throw Error("STALE");
    const r = await ctx.client.rpc(fn, args);
    if (!ctx.ok()) throw Error("STALE");
    if (r.error) throw Error(r.error.message || "UNAVAILABLE");
    return r.data;
  }

  function mount(slot, ctx) {
    // ctx: { client, ok(), link, mode, propose(copy) }
    if (!slot || !ctx?.link) return;
    const state = { messages: [], hasMore: false, checkins: [], templates: [], note: "" };
    const q = (s) => slot.querySelector(s);
    const status = (t, bad) => { const n = q("[data-ct-status]"); if (n) { n.textContent = t || ""; n.classList.toggle("err", !!bad); } };

    function draw() {
      const coach = ctx.mode === "coach";
      slot.innerHTML = `<section class="asc-section" data-ct-messages><div class="asc-section-head"><h2>Messages</h2></div>
        ${state.hasMore ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-ct-older>Messages précédents</button>` : ""}
        <div class="co-thread" role="log" aria-live="polite" aria-label="Messages du suivi">${state.messages.length ? state.messages.map((m) => `<div class="co-msg${m.mine ? " is-mine" : ""}"><p>${esc(m.body)}</p><small>${esc(fmtAt(m.at))}${m.mine ? (m.read ? " · lu" : "") : ` · <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-ct-report="${esc(m.id)}">Signaler</button>`}</small></div>`).join("") : '<p class="asc-small asc-muted">Aucun message pour le moment.</p>'}</div>
        <form data-ct-send class="asc-row-flex"><label class="asc-field" style="flex:1"><span class="asc-sr">Message</span><input class="asc-input" name="body" maxlength="1000" placeholder="Écrire à ${coach ? "l’athlète" : "mon coach"}…" required></label><button type="submit" class="asc-btn asc-btn-secondary">Envoyer</button></form>
        <p class="asc-small asc-faint">Messages limités à ce suivi ; ils disparaissent si le suivi est supprimé. Un message peut être signalé.</p></section>
        <section class="asc-section" data-ct-checkins><div class="asc-section-head"><h2>${coach ? "Check-ins partagés" : "Mon check-in de la semaine"}</h2></div>
        ${coach ? "" : `<form data-ct-checkin class="co-checkin">${SCORES.map(([k, l]) => `<label class="asc-field"><span>${l} (1–5)</span><select name="${k}"><option value="">—</option>${[1, 2, 3, 4, 5].map((n) => `<option>${n}</option>`).join("")}</select></label>`).join("")}
          <label class="asc-field"><span>Note (facultatif)</span><input class="asc-input" name="note" maxlength="500"></label>
          <label class="asc-check"><input type="checkbox" name="shared"> Partager avec mon coach</label>
          <button type="submit" class="asc-btn asc-btn-secondary">Enregistrer</button></form>`}
        ${state.checkins.length ? `<ul class="co-checkins">${state.checkins.map((c) => `<li><strong>Semaine du ${esc(fmtWeek(c.week))}</strong> · ${SCORES.filter(([k]) => c.scores?.[k]).map(([k, l]) => `${l} ${Number(c.scores[k])}/5`).join(" · ")}${c.note ? `<br><span class="asc-small">${esc(c.note)}</span>` : ""}${coach ? "" : ` <label class="asc-small"><input type="checkbox" data-ct-share="${esc(c.week)}" ${c.shared ? "checked" : ""}> partagé</label>`}</li>`).join("")}</ul>` : `<p class="asc-small asc-muted">${coach ? "Rien de partagé pour l’instant : le sportif choisit ce qu’il te montre." : "Aucun check-in. Rien n’est visible par ton coach sans ton accord."}</p>`}</section>
        ${coach ? `<section class="asc-section" data-ct-templates><div class="asc-section-head"><h2>Mes modèles</h2></div>
          <ul class="co-templates">${state.templates.map((t) => `<li><strong>${esc(t.title)}</strong> <button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-ct-use="${esc(t.id)}">Utiliser</button> <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-ct-del="${esc(t.id)}">Supprimer</button></li>`).join("") || '<li class="asc-small asc-muted">Aucun modèle.</li>'}</ul>
          <form data-ct-tpl class="asc-form-grid"><label class="asc-field"><span>Nom du modèle</span><input class="asc-input" name="title" maxlength="100" required></label>
          <label class="asc-field"><span>Sport</span><input class="asc-input" name="sport" value="running" required></label>
          <label class="asc-field"><span>Consignes</span><textarea name="instructions" maxlength="2000"></textarea></label>
          <button type="submit" class="asc-btn asc-btn-secondary">Enregistrer le modèle</button></form></section>` : ""}
        <p class="asc-small" role="status" data-ct-status></p>`;
    }

    async function loadAll() {
      try {
        const [m, c, t] = await Promise.all([
          call(ctx, "titan_coach_messages_v1", { p_link: ctx.link, p_before: null }),
          call(ctx, "titan_coach_checkins_v1", { p_link: ctx.link }),
          ctx.mode === "coach" ? call(ctx, "titan_coach_templates_v1", {}) : Promise.resolve([]),
        ]);
        state.messages = m?.rows || [];
        state.hasMore = !!m?.more;
        state.checkins = c?.rows || [];
        state.templates = t || [];
        draw();
        call(ctx, "titan_coach_messages_read_v1", { p_link: ctx.link }).catch(() => {});
      } catch (e) { if (e.message !== "STALE") { slot.innerHTML = `<p class="asc-note err">${esc(human(e))}</p>`; } }
    }

    slot.addEventListener("submit", async (e) => {
      const f = e.target; e.preventDefault();
      const d = new FormData(f);
      try {
        if (f.matches("[data-ct-send]")) {
          await call(ctx, "titan_coach_message_send_v1", { p_link: ctx.link, p_body: String(d.get("body") || "") });
          await loadAll();
        } else if (f.matches("[data-ct-checkin]")) {
          const scores = {}; for (const [k] of SCORES) if (d.get(k)) scores[k] = Number(d.get(k));
          await call(ctx, "titan_coach_checkin_v1", { p_link: ctx.link, p_scores: scores, p_note: d.get("note") || null, p_shared: d.has("shared") });
          await loadAll(); status("Check-in enregistré.");
        } else if (f.matches("[data-ct-tpl]")) {
          await call(ctx, "titan_coach_template_save_v1", { p_id: null, p_title: d.get("title"), p_sport: d.get("sport"), p_instructions: d.get("instructions") || "" });
          await loadAll(); status("Modèle enregistré.");
        }
      } catch (err) { if (err.message !== "STALE") status(human(err), true); }
    });
    slot.addEventListener("change", async (e) => {
      const w = e.target.dataset?.ctShare;
      if (!w) return;
      try { await call(ctx, "titan_coach_checkin_share_v1", { p_link: ctx.link, p_week: w, p_shared: e.target.checked }); status(e.target.checked ? "Partagé avec ton coach." : "Plus partagé."); }
      catch (err) { e.target.checked = !e.target.checked; if (err.message !== "STALE") status(human(err), true); }
    });
    slot.addEventListener("click", async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      try {
        if (b.dataset.ctUse) { ctx.propose(state.templates.find((t) => t.id === b.dataset.ctUse)); }
        else if (b.dataset.ctDel) { await call(ctx, "titan_coach_template_delete_v1", { p_id: b.dataset.ctDel }); await loadAll(); }
        else if (b.dataset.ctReport) { await call(ctx, "titan_coach_message_report_v1", { p_message: b.dataset.ctReport, p_reason: "Signalé depuis le suivi" }); status("Message signalé à l’équipe TITAN."); }
        else if (b.hasAttribute("data-ct-older")) {
          const first = state.messages[0]; if (!first) return;
          const m = await call(ctx, "titan_coach_messages_v1", { p_link: ctx.link, p_before: first.at });
          const rows = m?.rows || []; state.messages = rows.concat(state.messages); state.hasMore = !!m?.more; draw();
        }
      } catch (err) { if (err.message !== "STALE") status(human(err), true); }
    });
    slot.innerHTML = '<div class="asc-skeleton" style="height:80px"></div>';
    loadAll();
  }
  window.TitanCoachTools = { mount };
})();
