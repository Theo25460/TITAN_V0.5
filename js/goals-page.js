(function () {
  "use strict";
  const R = window.TitanRenaissance,
    I = window.TitanInsights;
  const units = {
    sessions: "séances",
    days: "jours actifs",
    minutes: "minutes",
    distance: "km",
  };
  let goals = [],
    loadedOwner = null,
    status = "loading",
    view = "active",
    loadSeq = 0;
  const owner = () => window.state?.user?.id,
    guest = (id) => String(id || "").startsWith("guest_"),
    key = (id) => `titan_goals_v1:${id}`;
  const templates = [
    [
      "Un rythme de reprise",
      "days",
      4,
      28,
      "4 jours de pratique sur quatre semaines, à ajuster.",
    ],
    [
      "Mon mois en mouvement",
      "sessions",
      8,
      28,
      "Un repère de séances, tous sports confondus.",
    ],
    [
      "Prendre du temps pour soi",
      "minutes",
      120,
      28,
      "Un temps cumulé : seules les durées renseignées comptent.",
    ],
    [
      "Mon parcours personnel",
      "distance",
      20,
      28,
      "Une distance cumulée, pour les séances mesurées en kilomètres.",
    ],
  ];
  async function load() {
    const id = owner();
    if (!id) return;
    const seq = ++loadSeq;
    if (loadedOwner !== id) {
      goals = [];
      status = "loading";
      loadedOwner = id;
      render();
    }
    if (guest(id)) {
      try {
        goals = JSON.parse(localStorage.getItem(key(id)) || "[]");
        if (!Array.isArray(goals)) goals = [];
      } catch {
        goals = [];
      }
      status = "local";
      render();
      return;
    }
    try {
      const rows = [];
      let after = null;
      for (;;) {
        if (owner() !== id || seq !== loadSeq) return;
        let query = window.titanClient
          .from("sport_goals")
          .select("*")
          .eq("user_id", id)
          .order("id")
          .limit(500);
        if (after) query = query.gt("id", after);
        const { data, error } = await query;
        if (error) throw error;
        if (owner() !== id || seq !== loadSeq) return;
        rows.push(...data);
        if (data.length < 500) break;
        after = data.at(-1).id;
      }
      goals = rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
      status = "ready";
      try {
        localStorage.setItem(key(id), JSON.stringify(goals));
      } catch {}
    } catch {
      if (owner() !== id || seq !== loadSeq) return;
      status = "error";
      try {
        goals = JSON.parse(localStorage.getItem(key(id)) || "[]");
      } catch {
        goals = [];
      }
    }
    render();
  }
  async function save(fields, old) {
    const id = owner();
    if (id !== loadedOwner)
      throw new Error("Le compte a changé. Actualise la page.");
    if (
      (!old || old.archived_at) &&
      !fields.archived_at &&
      goals.filter((g) => !g.archived_at).length >= 50
    )
      throw new Error(
        "Tu as déjà 50 objectifs actifs. Archive ceux que tu n’utilises plus.",
      );
    if (guest(id)) {
      const row = {
        ...old,
        ...fields,
        id: old?.id || crypto.randomUUID(),
        user_id: id,
        revision: (old?.revision || 0) + 1,
        created_at: old?.created_at || new Date().toISOString(),
      };
      const next = [row, ...goals.filter((g) => g.id !== row.id)];
      localStorage.setItem(key(id), JSON.stringify(next));
      goals = next;
      render();
      return;
    }
    let request = old
      ? window.titanClient
          .from("sport_goals")
          .update(fields)
          .eq("id", old.id)
          .eq("user_id", id)
          .eq("revision", old.revision)
      : window.titanClient
          .from("sport_goals")
          .insert({ ...fields, user_id: id });
    const { data, error } = await request.select().single();
    if (error) {
      if (error.code === "PGRST116")
        throw new Error(
          "Cet objectif a changé sur un autre écran. Actualise avant de le modifier.",
        );
      throw new Error(
        error.message === "GOAL_LIMIT"
          ? "Tu as déjà 50 objectifs actifs. Archive ceux que tu n’utilises plus."
          : "La modification n’a pas été confirmée. Vérifie ta connexion et réessaie.",
      );
    }
    if (owner() !== id) return;
    goals = [data, ...goals.filter((g) => g.id !== data.id)];
    render();
  }
  function render() {
    const host = document.getElementById("goals-content");
    if (!host || !owner()) return;
    const visible = goals.filter((g) =>
        view === "archived" ? g.archived_at : !g.archived_at,
      ),
      logs = window.state?.history || [];
    host.innerHTML = `<div class="r-tabs"><a href="/stats">${R.icon("chart")}Analyses</a><a href="/journal">${R.icon("journal")}Journal</a><a href="/records">${R.icon("trophy")}Records</a><a href="/objectifs" aria-current="page">${R.icon("flag")}Objectifs</a><a href="/bilan">${R.icon("download")}Bilans</a></div><div class="r-section-head"><div><span class="r-eyebrow">UN REPÈRE, PAS UNE OBLIGATION</span><h2 style="margin-top:7px">Mes objectifs</h2></div><button class="r-button primary" id="new-goal">${R.icon("plus")}Créer un objectif</button></div><div class="r-tabs" aria-label="État des objectifs"><button data-goal-view="active" aria-pressed="${view === "active"}">En cours et terminés</button><button data-goal-view="archived" aria-pressed="${view === "archived"}">Archives</button></div>${status === "loading" ? '<p class="r-loading">Chargement des objectifs…</p>' : ""}${status === "error" ? '<div class="r-notice"><span>Affichage de la dernière copie disponible. Les modifications demandent une connexion.</span><button class="r-button" id="retry-goals">Actualiser</button></div>' : ""}<div class="r-goals-grid">${visible
      .map((g) => {
        const p = I.goalProgress(g, logs);
        return `<article class="r-panel r-goal-card"><div class="r-section-head"><span class="r-chip">${g.archived_at ? "Archivé" : p.complete ? "Atteint" : p.upcoming ? "À venir" : p.ended ? "Période terminée" : "En cours"}</span>${R.icon(p.complete ? "check" : "flag")}</div><h3>${R.esc(g.title)}</h3><p class="r-small">${g.sport ? R.esc(R.sport(g.sport)) : "Tous les sports"} · ${new Date(g.start_date + "T12:00:00").toLocaleDateString("fr-FR")} → ${new Date(g.end_date + "T12:00:00").toLocaleDateString("fr-FR")}</p><div class="r-goal-value"><strong>${R.fmt(p.value)}</strong><span>/ ${R.fmt(g.target)} ${units[g.metric]}</span></div><progress value="${Math.min(g.target, p.value)}" max="${g.target}" aria-label="${R.esc(g.title)} : ${R.fmt(p.value)} sur ${R.fmt(g.target)} ${units[g.metric]}"></progress><p class="r-small" style="margin-top:12px">${p.measured} séance(s) contributrice(s)${["minutes", "distance"].includes(g.metric) ? ` sur ${p.sources.length} séances de la période` : ""}. ${p.ended && !p.complete ? "Tu peux ajuster la période ou garder ce repère dans les archives." : ""}</p><details class="r-evidence"><summary>Retrouver les séances sources</summary>${p.contributors.length ? p.contributors.map((l) => `<a href="/journal?session=${encodeURIComponent(l.id)}">${R.esc(R.sport(l.sport))} · ${new Date(l.date).toLocaleDateString("fr-FR")} ${R.icon("arrow")}</a>`).join("") : '<p class="r-small">Aucune séance sur cette période pour le moment.</p>'}</details><div class="r-goal-actions"><button class="r-button subtle" data-goal-edit="${g.id}">${R.icon("edit")}Ajuster</button><button class="r-button subtle" data-goal-archive="${g.id}">${g.archived_at ? "Restaurer" : "Archiver"}</button></div></article>`;
      })
      .join(
        "",
      )}</div>${!visible.length && status !== "loading" ? `<div class="r-panel r-empty"><h3>${view === "archived" ? "Tes archives sont vides." : "Quel chemin veux-tu tracer ?"}</h3><p>Fixe une période et un repère mesurable. Les séances de ton journal alimentent automatiquement l’objectif, y compris après une correction.</p><button class="r-button primary" data-goal-template="0">Commencer avec un modèle</button></div>` : ""}<section class="r-block"><div class="r-section-head"><h2>Un point de départ à personnaliser</h2><span class="r-chip">Inclus gratuitement</span></div><div class="r-goal-templates">${templates.map((t, i) => `<button class="r-panel" data-goal-template="${i}">${R.icon(["leaf", "calendar", "clock", "route"][i])}<h3>${t[0]}</h3><p>${t[4]}</p><span>Personnaliser →</span></button>`).join("")}</div><p class="r-small" style="margin-top:16px">Ces modèles sont des exemples d’organisation, pas des prescriptions d’entraînement. Adapte-les à ta situation. Les objectifs ne donnent aucune XP supplémentaire.</p></section><p class="r-small" style="margin-top:20px">${guest(owner()) ? "Objectifs conservés uniquement sur cet appareil en mode découverte." : "Objectifs privés, accessibles uniquement depuis ton compte."}</p><p class="r-error" id="goals-error" role="status"></p>`;
    document.getElementById("new-goal").onclick = () => edit();
    host
      .querySelectorAll("[data-goal-template]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            edit(null, templates[Number(b.dataset.goalTemplate)])),
      );
    host
      .querySelectorAll("[data-goal-edit]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            edit(goals.find((g) => g.id === b.dataset.goalEdit))),
      );
    host.querySelectorAll("[data-goal-view]").forEach(
      (b) =>
        (b.onclick = () => {
          view = b.dataset.goalView;
          render();
        }),
    );
    host.querySelectorAll("[data-goal-archive]").forEach(
      (b) =>
        (b.onclick = async () => {
          b.disabled = true;
          const g = goals.find((g) => g.id === b.dataset.goalArchive);
          try {
            await save(
              { archived_at: g.archived_at ? null : new Date().toISOString() },
              g,
            );
          } catch (e) {
            document.getElementById("goals-error").textContent = e.message;
            b.disabled = false;
          }
        }),
    );
    document.getElementById("retry-goals")?.addEventListener("click", load);
  }
  function edit(old = null, template = templates[1]) {
    const d = document.createElement("dialog");
    d.className = "r-dialog";
    const today = window.TitanTraining.dateKey(new Date()),
      end = new Date();
    end.setDate(end.getDate() + template[3] - 1);
    const g = old || {
      title: template[0],
      metric: template[1],
      target: template[2],
      start_date: today,
      end_date: window.TitanTraining.dateKey(end),
      sport: null,
    };
    const sports = [
      ...new Set([
        ...(window.state?.history || []).map((l) => l.sport),
        ...(window.state?.user?.favoriteSports || []),
        "running",
        "muscu_builder",
        ...(g.sport ? [g.sport] : []),
      ]),
    ];
    d.innerHTML = `<form class="r-goal-form"><span class="r-eyebrow">MON CAP PERSONNEL</span><h2>${old ? "Ajuster mon objectif" : "Créer mon objectif"}</h2><label>Nom<input name="title" value="${R.esc(g.title)}" maxlength="100" required></label><div class="r-form-grid"><label>Mesure<select name="metric">${Object.entries(
      units,
    )
      .map(
        ([k, v]) =>
          `<option value="${k}" ${g.metric === k ? "selected" : ""}>${v}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Valeur cible<input name="target" type="number" min="0.1" max="1000000" step="any" value="${g.target}" required></label><label>Début<input name="start_date" type="date" value="${g.start_date}" required></label><label>Fin<input name="end_date" type="date" value="${g.end_date}" required></label></div><label>Sport<select name="sport"><option value="">Tous les sports</option>${sports.map((k) => `<option value="${R.esc(k)}" ${g.sport === k ? "selected" : ""}>${R.esc(R.sport(k))}</option>`).join("")}</select></label><p>Les dates sont inclusives. Les valeurs manquantes ne sont pas inventées. Tu peux ajuster ou archiver cet objectif à tout moment.</p><p class="r-error" role="alert"></p><div class="r-dialog-actions"><button class="r-button primary" type="submit">Enregistrer mon objectif</button><button class="r-button subtle" type="button" data-close>Annuler</button></div></form>`;
    document.body.append(d);
    d.querySelector("[data-close]").onclick = () => d.close();
    d.addEventListener("close", () => {
      d.remove();
      document.getElementById("new-goal")?.focus();
    });
    d.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target)),
        button = d.querySelector("[type=submit]");
      button.disabled = true;
      try {
        f.title = f.title.trim();
        f.target = Number(f.target);
        f.sport = f.sport || null;
        if (
          !f.title ||
          new Date(f.end_date) < new Date(f.start_date) ||
          new Date(f.end_date) - new Date(f.start_date) > 730 * 86400000
        )
          throw new Error(
            "Choisis un nom et une période comprise entre 1 jour et 2 ans.",
          );
        if (
          ["sessions", "days"].includes(f.metric) &&
          !Number.isInteger(f.target)
        )
          throw new Error("Choisis un nombre entier de séances ou de jours.");
        await save(f, old);
        d.close();
      } catch (error) {
        d.querySelector("[role=alert]").textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
    d.showModal();
  }
  window.addEventListener("titan:history-updated", () =>
    loadedOwner === owner() ? render() : load(),
  );
  window.addEventListener("online", load);
  document.addEventListener("DOMContentLoaded", load);
  load();
})();
