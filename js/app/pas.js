/* V11-56 (HC-P0-06): the quiet "Pas aujourd'hui" card of the QG. Steps come only from the account's own daily-activity layer
   (titan_daily_activity_v1, written by the native app once the player connected Santé Connect); the web never reads a sensor.
   Steps are not a session: no XP, no credits, no quest. A day without a number is "no data", never zero. An answer is applied only if
   the account, the client and the epoch are still the ones that asked. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const S = () => window.TitanSteps;
  const TTL = 60 * 1000;

  let days = null;
  let at = 0;
  let owner = null;
  let flight = null;
  let missing = false;
  let failure = false;
  let dialog = null;

  const context = () => ({ owner: window.state?.user?.id || null, client: window.titanClient || null, epoch: window.titanAccountTransition?.epoch });
  const same = (a, b) => a && b && a.owner === b.owner && a.client === b.client && a.epoch === b.epoch && !window.titanAccountTransition?.active;
  const guest = () => !context().owner || String(context().owner).startsWith("guest_");
  const changed = () => window.dispatchEvent(new CustomEvent("titan:steps-updated"));
  const goalKey = () => `titan_steps_goal_${context().owner}`;
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  function goal() {
    try { return S().goalOf(localStorage.getItem(goalKey())); } catch { return null; }
  }
  function setGoal(value) {
    try {
      const g = S().goalOf(value);
      if (g) localStorage.setItem(goalKey(), String(g)); else localStorage.removeItem(goalKey());
    } catch { /* the goal is only a convenience */ }
    changed();
  }

  function reset() { days = null; at = 0; flight = null; missing = false; failure = false; if (dialog?.open) dialog.close(); }
  function sync() {
    const id = guest() ? null : context().owner;
    if (id !== owner) { owner = id; reset(); changed(); }
  }

  async function refresh(force = false) {
    sync();
    if (guest() || missing || !navigator.onLine) return days;
    if (flight) return flight;
    if (!force && days && Date.now() - at < TTL) return days;
    const ask = context();
    flight = (async () => {
      try {
        const client = ask.client;
        if (!client || typeof client.rpc !== "function") return days;
        const today = new Date();
        const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
        const { data, error } = await client.rpc("titan_daily_activity_v1", { p_from: dayKey(from), p_to: dayKey(today) });
        if (!same(ask, context())) return days;
        if (error) {
          if (error.code === "PGRST202" || /Could not find/.test(error.message || "")) missing = true; else failure = true;
          return days;
        }
        if (Array.isArray(data)) { days = data; at = Date.now(); failure = false; }
        return days;
      } catch {
        if (same(ask, context())) failure = true;
        return days;
      } finally {
        flight = null;
        if (same(ask, context())) changed();
      }
    })();
    return flight;
  }

  const LETTERS = ["D", "L", "M", "M", "J", "V", "S"];
  const letter = (key) => { const [y, m, d] = key.split("-").map(Number); return LETTERS[new Date(y, m - 1, d).getDay()]; };
  const n = (v) => window.TitanFormat.number(v);

  function when(iso) {
    const t = new Date(iso);
    if (!iso || Number.isNaN(t.getTime())) return "";
    const same = dayKey(t) === dayKey();
    return same ? `aujourd’hui à ${window.TitanFormat.time(t)}` : `le ${window.TitanFormat.longDate(t)}`;
  }

  /** The card for the QG; empty for a guest, a server without the function, or while the account has no steps at all. */
  function html() {
    sync();
    if (guest() || missing || !days || !S()) return "";
    const s = S().summarize(days, { today: dayKey(), goal: goal() });
    if (s.empty) return "";
    const max = Math.max(1, ...s.week.map((d) => d.steps || 0), s.goal || 0);
    const today = s.today;
    const bars = s.week.map((d, i) => `<div class="wk-day${i === 6 ? " is-today" : ""}"><div class="wk-bar"><span data-on="${d.steps ? "true" : "false"}" style="--h:${d.steps ? Math.max(4, Math.round((d.steps / max) * 100)) : 0}%"></span></div><span class="wk-day-l">${letter(d.day)}</span></div>`).join("");
    const summary = s.week.map((d) => `${letter(d.day)} ${d.steps === null ? "sans donnée" : n(d.steps)}`).join(", ");
    const source = today ? S().sourceName(today.sources?.[0]) : "";
    const stamp = when(s.lastUpdate || "");
    return `<section class="asc-section asc-appear qg-steps" data-steps aria-labelledby="qg-steps-title">
      <div class="asc-section-head"><h2 id="qg-steps-title">Pas aujourd’hui</h2><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-action="steps-goal">${s.goal ? "Objectif" : "Fixer un objectif"}</button></div>
      <div class="asc-panel qg-steps-card">
        ${today ? `<p class="qg-steps-value"><strong data-steps-today>${n(today.steps)}</strong> <span class="asc-muted">pas</span></p>` : `<p class="asc-muted" data-steps-none>Pas encore de donnée aujourd’hui.</p>`}
        ${s.goalPercent !== null ? `<span class="asc-ascent thin" role="progressbar" aria-label="Objectif de pas" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s.goalPercent}"><span style="--p:${s.goalPercent}%"></span></span><p class="asc-small asc-muted">Objectif ${n(s.goal)} pas · ${s.goalPercent} %</p>` : ""}
        <div class="wk-days" role="img" aria-label="Pas des sept derniers jours : ${esc(summary)}">${bars}</div>
        <p class="asc-small asc-muted">Moyenne des 7 derniers jours : <strong>${s.average7 === null ? "—" : n(s.average7)}</strong> pas par jour, sur ${s.week.filter((d) => d.steps !== null).length} jour${s.week.filter((d) => d.steps !== null).length > 1 ? "s" : ""} renseigné${s.week.filter((d) => d.steps !== null).length > 1 ? "s" : ""}${s.daysWithData30 > 7 ? ` · 30 jours : ${n(s.average30)}` : ""}.</p>
        <p class="asc-small asc-faint" data-steps-note>${source ? `Source : ${esc(source)}. ` : ""}${stamp ? `Dernière mise à jour ${esc(stamp)}. ` : ""}Les pas ne comptent ni comme une séance, ni pour l’XP.${failure || !navigator.onLine ? " Dernière valeur connue, la synchronisation n’a pas répondu." : ""}</p>
      </div></section>`;
  }

  /** The 30-day line of the monthly screen (Progrès): the average, the days with a number, the best day, thirty small bars. Empty without data. */
  function monthHtml() {
    sync();
    if (guest() || missing || !days || !S()) return "";
    const s = S().summarize(days, { today: dayKey(), goal: goal() });
    if (s.empty) return "";
    const series = [];
    for (let i = 29; i >= 0; i--) { const key = S().shift(dayKey(), -i); const e = days.find((d) => d.day === key); series.push({ day: key, steps: e && Number.isFinite(Number(e.steps)) ? Number(e.steps) : null }); }
    const max = Math.max(1, ...series.map((d) => d.steps || 0));
    const best = series.reduce((m, d) => (d.steps !== null && (!m || d.steps > m.steps) ? d : m), null);
    const bars = series.map((d) => `<span class="qg-steps-bar" data-on="${d.steps ? "true" : "false"}" style="--h:${d.steps ? Math.max(6, Math.round((d.steps / max) * 100)) : 0}%"></span>`).join("");
    return `<section class="asc-section asc-appear" data-steps-month aria-labelledby="pas-month-title"><div class="asc-section-head"><h2 id="pas-month-title">Pas, 30 derniers jours</h2></div>
      <div class="asc-panel qg-steps-card">
        <p class="qg-steps-value"><strong>${n(s.average30)}</strong> <span class="asc-muted">pas par jour en moyenne</span></p>
        <div class="qg-steps-spark" role="img" aria-label="Pas par jour sur trente jours, ${s.daysWithData30} jours renseignés${best ? `, le plus haut : ${esc(n(best.steps))}` : ""}">${bars}</div>
        <p class="asc-small asc-muted">${s.daysWithData30} jour${s.daysWithData30 > 1 ? "s" : ""} sur 30 avec un chiffre${best ? ` · meilleur jour : ${n(best.steps)} pas` : ""}. Un jour sans chiffre n’est pas un jour à zéro.</p>
        <p class="asc-small asc-faint">Les pas ne comptent ni comme une séance, ni pour l’XP.</p>
      </div></section>`;
  }

  function goalSheet() {
    sync();
    if (guest() || !days || dialog?.open) return dialog;
    const ask = context();
    const body = document.createElement("form");
    body.className = "asc-stack";
    body.noValidate = true;
    body.innerHTML = `<p class="asc-muted">Un repère facultatif, rien de plus : il ne change ni ta progression ni tes récompenses, et tu peux le retirer à tout moment.</p>
      <label class="asc-field"><span>Pas par jour (1 000 à 100 000)</span><input class="asc-input" type="number" inputmode="numeric" min="1000" max="100000" step="500" name="goal" value="${goal() || 8000}" required></label>
      <p class="asc-small" role="alert" data-goal-error hidden></p>
      <div class="asc-row"><button type="submit" class="asc-btn asc-btn-primary">Enregistrer</button><button type="button" class="asc-btn asc-btn-secondary" data-goal-clear>Retirer l’objectif</button></div>`;
    const d = window.titanShell.sheet({ title: "Objectif de pas", eyebrow: "Facultatif", body, onClose: () => { if (dialog === d) dialog = null; } });
    dialog = d;
    body.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!same(ask, context())) { d.close(); return; }
      const g = S().goalOf(new FormData(body).get("goal"));
      const err = body.querySelector("[data-goal-error]");
      if (!g) { err.hidden = false; err.textContent = "Choisis un nombre entre 1 000 et 100 000."; return; }
      setGoal(g); d.close();
    });
    body.querySelector("[data-goal-clear]").addEventListener("click", () => { if (same(ask, context())) setGoal(null); d.close(); });
    return d;
  }

  document.addEventListener("click", (e) => { if (e.target.closest?.('[data-action="steps-goal"]')) goalSheet(); });
  ["titan:account-changed", "titan:history-updated"].forEach((ev) => window.addEventListener(ev, () => { sync(); refresh(); }));
  window.addEventListener("titan:account-changing", () => { owner = null; reset(); });
  window.addEventListener("online", () => refresh(true));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
  window.TitanStepsCard = { html, monthHtml, refresh, goal };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(() => refresh(), 0));
  else setTimeout(() => refresh(), 0);
})();
