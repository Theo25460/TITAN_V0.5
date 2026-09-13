(function () {
  "use strict";
  const R = window.TitanRenaissance,
    I = window.TitanInsights;
  const owner = () => window.state?.user?.id,
    guest = () => String(owner() || "").startsWith("guest_");
  let snapshot = null,
    mode = "athlete",
    selected = "",
    sequence = 0,
    detailSequence = 0,
    loadedOwner = null,
    loading = true,
    error = "",
    sessions = null,
    assignments = null;
  const today = () => new Date().toISOString().slice(0, 10);
  let toDate = today(),
    fromDate = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const date = (value) =>
    new Date(
      String(value).length === 10 ? value + "T12:00:00Z" : value,
    ).toLocaleDateString("fr-FR", { timeZone: "UTC" });
  const messages = {
    AUTH_REQUIRED: "Connecte-toi pour utiliser le partage privé.",
    ACCOUNT_CHANGED: "Le compte a changé. Recharge cet espace.",
    INVITE_UNAVAILABLE: "Ce code est indisponible, expiré ou déjà utilisé.",
    INVITE_LIMIT:
      "Tu as déjà plusieurs invitations en attente. Annule celles qui ne servent plus.",
    COACH_CAPACITY:
      "La capacité de suivi du coach est atteinte : 3 sportifs en Classique, 20 avec TITAN+.",
    ATHLETE_CAPACITY:
      "Cinq partages sont déjà actifs. Révoque ceux dont tu n’as plus besoin.",
    CONSENT_REQUIRED: "Le partage demande ton accord explicite.",
    COACH_CONFLICT:
      "Une modification plus récente existe. Actualise cet espace avant de recommencer.",
    SHARING_UNAVAILABLE: "Ce partage a été révoqué ou n’est plus accessible.",
    INVALID_PERIOD: "Vérifie la période choisie et les dates de partage.",
    INVALID_SESSION:
      "Choisis une séance personnelle du même sport, dans la période autorisée et non archivée.",
    SESSION_ALREADY_LINKED: "Cette séance est déjà reliée à une proposition.",
    INVALID_TRANSITION: "Cette proposition a changé. Actualise son état.",
    ASSIGNMENT_LIMIT: "La limite de propositions de ce suivi est atteinte.",
  };
  const message = (e) =>
    messages[e?.message] ||
    "La demande n’a pas été confirmée. Vérifie ta connexion puis réessaie.";
  async function rpc(action, data = {}) {
    const id = owner(),
      session = (await window.titanClient?.auth.getSession())?.data?.session;
    if (!id || session?.user?.id !== id || owner() !== id)
      throw Error("AUTH_REQUIRED");
    const response = await fetch(
      `${window.TITAN_SUPABASE_URL}/rest/v1/rpc/titan_coach_portal`,
      {
        method: "POST",
        headers: {
          apikey: window.TITAN_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_action: action, p_data: data }),
        signal: AbortSignal.timeout(15000),
      },
    );
    const result = await response.json();
    if (owner() !== id) throw Error("ACCOUNT_CHANGED");
    if (!response.ok) throw Error(result.message || "UNAVAILABLE");
    return result;
  }
  const links = () =>
    snapshot?.links?.filter((l) =>
      mode === "coach" ? l.coach_id === owner() : l.athlete_id === owner(),
    ) || [];
  const current = () => links().find((l) => l.id === selected);
  async function load() {
    const id = owner();
    if (!id) return;
    const seq = ++sequence;
    if (loadedOwner !== id) {
      snapshot = null;
      sessions = null;
      assignments = null;
      selected = "";
      loadedOwner = id;
      loading = true;
      render();
    }
    if (guest()) {
      loading = false;
      error = "";
      render();
      return;
    }
    try {
      const next = await rpc("snapshot");
      if (seq !== sequence || id !== owner()) return;
      const previous = current();
      snapshot = next;
      loading = false;
      error = "";
      if (!links().some((l) => l.id === selected))
        selected = links()[0]?.id || "";
      if (
        previous?.id !== current()?.id ||
        previous?.revision !== current()?.revision
      ) {
        sessions = null;
        assignments = null;
      }
      render();
      if (selected) await loadDetail();
    } catch (e) {
      if (seq !== sequence || id !== owner()) return;
      snapshot = null;
      sessions = null;
      assignments = null;
      loading = false;
      error = message(e);
      render();
    }
  }
  async function loadDetail({
    moreSessions = false,
    moreAssignments = false,
  } = {}) {
    const link = current();
    if (!link) return;
    const seq = ++detailSequence,
      id = owner();
    const query = { link_id: link.id, from_date: fromDate, to_date: toDate };
    try {
      const [logs, tasks] = await Promise.all([
        moreAssignments
          ? Promise.resolve(sessions)
          : rpc("sessions", {
              ...query,
              offset: moreSessions ? sessions?.rows.length || 0 : 0,
            }),
        moreSessions
          ? Promise.resolve(assignments)
          : rpc("assignments", {
              link_id: link.id,
              offset: moreAssignments ? assignments?.rows.length || 0 : 0,
            }),
      ]);
      if (seq !== detailSequence || owner() !== id || current()?.id !== link.id)
        return;
      if (
        (logs && logs.revision !== link.revision) ||
        (tasks && tasks.revision !== link.revision)
      ) {
        sessions = null;
        assignments = null;
        await load();
        return;
      }
      sessions = moreSessions
        ? {
            ...logs,
            rows: [
              ...new Map(
                [...(sessions?.rows || []), ...logs.rows].map((l) => [l.id, l]),
              ).values(),
            ],
          }
        : logs;
      assignments = moreAssignments
        ? {
            ...tasks,
            rows: [
              ...new Map(
                [...(assignments?.rows || []), ...tasks.rows].map((l) => [
                  l.id,
                  l,
                ]),
              ).values(),
            ],
          }
        : tasks;
      error = "";
      render();
    } catch (e) {
      if (seq !== detailSequence || owner() !== id) return;
      sessions = null;
      assignments = null;
      error = message(e);
      if (e.message === "SHARING_UNAVAILABLE") snapshot = null;
      render();
    }
  }
  function dialog(title, body, submitLabel, onSubmit) {
    const d = document.createElement("dialog");
    d.className = "r-dialog r-coach-dialog";
    d.setAttribute("aria-labelledby", "coach-dialog-title");
    d.innerHTML = `<form><span class="r-eyebrow">ESPACE COACH · PARTAGE PRIVÉ</span><h2 id="coach-dialog-title">${title}</h2>${body}<p class="r-error" role="alert"></p><div class="r-dialog-actions">${onSubmit ? `<button class="r-button primary" type="submit">${submitLabel}</button>` : ""}<button class="r-button subtle" type="button" data-close>${onSubmit ? "Annuler" : "Fermer"}</button></div></form>`;
    const id = owner();
    document.body.append(d);
    d.querySelector("[data-close]").onclick = () => d.close();
    d.addEventListener("close", () => {
      d.remove();
      document.getElementById("coach-refresh")?.focus();
    });
    d.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      const b = d.querySelector("[type=submit]");
      b.disabled = true;
      try {
        if (id !== owner()) throw Error("ACCOUNT_CHANGED");
        await onSubmit(new FormData(e.target), d);
        if (d.open) d.close();
        await load();
      } catch (e) {
        d.querySelector("[role=alert]").textContent = message(e);
      } finally {
        b.disabled = false;
      }
    };
    d.showModal();
    return d;
  }
  const scopeFields = (l) =>
    `<p>Le coach pourra consulter les <strong>dates, sports, mesures et durées</strong> des séances comprises dans le périmètre ci-dessous, puis te proposer des séances. Il ne peut pas modifier ton journal.</p><div class="r-form-grid"><label>Partager à partir du<input name="since_date" type="date" value="${l?.since_date || today()}" min="2000-01-01" max="${today()}" required></label><label>Sport partagé<select name="sport"><option value="">Tous mes sports</option>${Object.entries(
      window.SPORTS_CONFIG || {},
    )
      .sort((a, b) => a[1].label.localeCompare(b[1].label, "fr"))
      .map(
        ([k, c]) =>
          `<option value="${R.esc(k)}" ${l?.sport === k ? "selected" : ""}>${R.esc(c.label)}</option>`,
      )
      .join(
        "",
      )}</select></label></div><label class="r-checkbox"><input type="checkbox" name="share_details" ${l?.share_details ? "checked" : ""}><span>Partager aussi les séries, charges, répétitions, RIR et les détails techniques d’escalade.</span></label><label class="r-checkbox"><input type="checkbox" name="share_notes" ${l?.share_notes ? "checked" : ""}><span>Partager mes notes personnelles de séance. Vérifie leur contenu avant d’autoriser cet accès.</span></label><p class="r-small">Les traces GPS, lieux détaillés, données de sommeil, poids corporel et autres données de forme ne sont jamais inclus. Les limites de dates de cet espace utilisent UTC. Tu peux réduire ou révoquer le partage à tout moment.</p>`;
  function scopeData(f) {
    return {
      since_date: f.get("since_date"),
      sport: f.get("sport") || null,
      share_details: f.has("share_details"),
      share_notes: f.has("share_notes"),
    };
  }
  function join() {
    dialog(
      "J’ai reçu une invitation",
      `<label>Code privé du coach<input name="token" autocomplete="off" autocapitalize="none" spellcheck="false" minlength="48" maxlength="48" required placeholder="Code de 48 caractères"></label><p>Colle le code transmis personnellement par ton coach. L’étape suivante affiche son nom et les options de partage. Aucun accès n’est encore accordé.</p>`,
      "Vérifier le code",
      async (f, d) => {
        const token = String(f.get("token")).trim(),
          preview = await rpc("preview", { token });
        d.close();
        dialog(
          `Partager avec ${R.esc(preview.coach_name || "ce coach")}`,
          `${scopeFields()}<label class="r-checkbox r-consent"><input type="checkbox" name="consent" required><span>J’autorise ce coach à consulter les données sélectionnées et à me proposer des séances.</span></label>`,
          "Activer ce partage",
          async (data) => {
            const r = await rpc("accept", {
              token,
              ...scopeData(data),
              consent: data.has("consent"),
            });
            mode = "athlete";
            selected = r.id;
          },
        );
      },
    );
  }
  async function invite() {
    const button = document.getElementById("coach-invite");
    button.disabled = true;
    try {
      const r = await rpc("invite");
      dialog(
        "Ton invitation est prête",
        `<p>Transmets ce code à une seule personne. Elle devra vérifier ton identité et choisir les données qu’elle accepte de partager. Le code expire le ${date(r.expires_at)} et ne peut être utilisé qu’une fois.</p><label>Code privé<input readonly value="${R.esc(r.token)}" aria-label="Code privé à transmettre"></label><button type="button" class="r-button subtle" id="copy-coach-code">${R.icon("download")}Copier le code</button><p id="copy-code-status" class="r-small" role="status">Le code n’est affiché qu’ici. Tu peux annuler une invitation inutilisée depuis cet espace.</p>`,
      );
      document.getElementById("copy-coach-code").onclick = async () => {
        try {
          await navigator.clipboard.writeText(r.token);
          document.getElementById("copy-code-status").textContent =
            "Code copié. Transmets-le par le canal de ton choix.";
        } catch {
          document.getElementById("copy-code-status").textContent =
            "Sélectionne le code pour le copier manuellement.";
        }
      };
      await load();
    } catch (e) {
      error = message(e);
      render();
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }
  function changeScope() {
    const l = current();
    dialog(
      "Choisir ce que je partage",
      scopeFields(l),
      "Enregistrer mes choix",
      async (f) => {
        await rpc("scope", {
          link_id: l.id,
          revision: l.revision,
          ...scopeData(f),
        });
        sessions = null;
        assignments = null;
      },
    );
  }
  function revoke() {
    const l = current(),
      other = mode === "coach" ? l.athlete_name : l.coach_name;
    dialog(
      "Arrêter ce partage",
      `<p>Le suivi avec <strong>${R.esc(other || "cette personne")}</strong> s’arrêtera. Le coach ne pourra plus charger les séances et les propositions liées à ce partage ne seront plus accessibles. Ton journal personnel reste conservé.</p><p>Les informations déjà lues ou copiées par le destinataire ne peuvent pas être retirées de sa mémoire ou de ses propres fichiers. Pour reprendre le suivi, une nouvelle invitation sera nécessaire.</p>`,
      "Révoquer le partage",
      async () => {
        await rpc("revoke", { link_id: l.id, revision: l.revision });
        sessions = null;
        assignments = null;
        selected = "";
      },
    );
  }
  function propose(copy) {
    const l = current();
    dialog(
      copy ? "Réutiliser cette séance" : "Proposer une séance",
      `<label>Nom de la séance<input name="title" value="${R.esc(copy?.title || "")}" maxlength="100" required placeholder="Ex. Reprise · séance A"></label><div class="r-form-grid"><label>Sport<select name="sport" required>${Object.entries(
        window.SPORTS_CONFIG || {},
      )
        .sort((a, b) => a[1].label.localeCompare(b[1].label, "fr"))
        .map(
          ([k, c]) =>
            `<option value="${R.esc(k)}" ${k === (copy?.sport || l.sport || "running") ? "selected" : ""}>${R.esc(c.label)}</option>`,
        )
        .join(
          "",
        )}</select></label><label>Date prévue<input type="date" name="planned_date" value="${today()}" min="${new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)}" max="${new Date(Date.now() + 366 * 86400000).toISOString().slice(0, 10)}" required></label></div><label>Consignes et intention<textarea name="instructions" maxlength="2000" rows="5" placeholder="Objectif de la séance, exercices ou repères discutés ensemble…">${R.esc(copy?.instructions || "")}</textarea></label><p class="r-small">Le sportif choisit d’accepter ou de décliner. Cette proposition n’ajoute pas automatiquement une séance à son journal et ne donne pas d’XP.</p>`,
      "Envoyer la proposition",
      (f) => rpc("assign", { link_id: l.id, ...Object.fromEntries(f) }),
    );
  }
  function taskAction(task, status) {
    if (status === "completed") {
      const l = current(),
        logs = I.active(window.state.history).filter(
          (x) =>
            x.sport === task.sport &&
            new Date(x.date) >= new Date(l.since_date + "T00:00:00Z") &&
            new Date(x.date) >= new Date(task.created_at) - 7 * 86400000,
        );
      dialog(
        "Relier la séance réalisée",
        `<p>Choisis une séance personnelle du même sport. Le serveur vérifie qu’elle appartient à ton compte et qu’elle n’est pas déjà reliée à une autre proposition.</p>${logs.length ? `<label>Séance du journal<select name="session_id">${logs.map((x) => `<option value="${R.esc(x.id)}">${date(x.date)} · ${R.esc(R.sport(x.sport))} · ${R.fmt(x.val)} ${R.esc(x.unit)}</option>`).join("")}</select></label>` : '<p>Aucune séance correspondante dans ton journal pour le moment.</p><a class="r-button primary" href="/training?sport=' + encodeURIComponent(task.sport) + '">Enregistrer ma séance</a>'}`,
        "Confirmer la réalisation",
        logs.length
          ? (f) =>
              rpc("assignment_status", {
                id: task.id,
                revision: task.revision,
                status,
                session_id: f.get("session_id"),
              })
          : null,
      );
    } else
      dialog(
        status === "cancelled"
          ? "Annuler la proposition"
          : status === "accepted"
            ? "Accepter cette séance"
            : "Décliner cette séance",
        `<p>${R.esc(task.title)} · ${date(task.planned_date)}</p><p>Le statut sera visible par ton partenaire de suivi. Ton journal personnel ne sera pas modifié.</p>`,
        "Confirmer",
        () =>
          rpc(
            status === "cancelled" ? "cancel_assignment" : "assignment_status",
            { id: task.id, revision: task.revision, status },
          ),
      );
  }
  function taskCards() {
    const labels = {
      proposed: "À accepter",
      accepted: "Prévue",
      declined: "Déclinée",
      completed: "Réalisée",
      cancelled: "Annulée",
    };
    return (assignments?.rows || [])
      .map(
        (t) =>
          `<article class="r-coach-task"><div class="r-section-head"><span class="r-chip">${labels[t.status]}</span><span class="r-small">${date(t.planned_date)}</span></div><h3>${R.esc(t.title)}</h3><p class="r-small">${R.esc(R.sport(t.sport))}</p><p class="r-coach-instructions">${R.esc(t.instructions)}</p><div class="r-coach-actions">${mode === "athlete" && t.status === "proposed" ? `<button class="r-button subtle" data-task="${t.id}" data-status="accepted">Accepter</button><button class="r-button subtle" data-task="${t.id}" data-status="declined">Décliner</button>` : ""}${mode === "athlete" && t.status === "accepted" ? `<a class="r-button primary" href="/training?sport=${encodeURIComponent(t.sport)}">Enregistrer la séance</a><button class="r-button subtle" data-task="${t.id}" data-status="completed">Relier une séance réalisée</button><button class="r-button subtle" data-task="${t.id}" data-status="declined">Décliner</button>` : ""}${mode === "coach" ? `<button class="r-button subtle" data-reuse="${t.id}">Réutiliser</button>${["proposed", "accepted"].includes(t.status) ? `<button class="r-button subtle" data-task="${t.id}" data-status="cancelled">Annuler</button>` : ""}` : ""}${t.status === "completed" ? '<p class="r-small">Une séance du journal a été reliée par le sportif. Une correction ou un archivage ultérieur peut modifier les données consultables.</p>' : ""}</div></article>`,
      )
      .join("");
  }
  function rows() {
    return (sessions?.rows || [])
      .map((l) => {
        const minutes = window.TitanTraining.duration(l),
          ex = I.strength([l]);
        return `<details class="r-shared-session"><summary><strong>${R.esc(R.sport(l.sport))}</strong><span>${date(l.date)}</span><span>${R.fmt(l.val)} ${R.esc(l.unit)}${minutes !== null ? " · " + R.fmt(minutes) + " min" : ""}</span></summary>${ex.length ? `<div class="r-table-scroll"><table class="r-data-table"><thead><tr><th>Exercice</th><th>Séries</th><th>Répétitions</th><th>Volume</th></tr></thead><tbody>${ex.map((e) => `<tr><th>${R.esc(e.name)} ${R.esc(e.variant)}</th><td>${e.sets}</td><td>${e.reps}</td><td>${e.volume ? R.fmt(e.volume) + " kg" : "Poids du corps"}</td></tr>`).join("")}</tbody></table></div>` : ""}${l.details?.extras?.grade_system ? `<p class="r-small">${R.esc([l.details.extras.climbing_discipline, l.details.extras.grade_system, l.details.extras.belay, l.details.extras.max_done].filter(Boolean).join(" · "))}</p>` : ""}${l.details?.note ? `<p class="r-coach-instructions">${R.esc(l.details.note)}</p>` : '<p class="r-small">Aucune note partagée pour cette séance.</p>'}<p class="r-small">Mesures déclarées dans le journal. Aucune trace de localisation n’est partagée.</p></details>`;
      })
      .join("");
  }
  function render() {
    const host = document.getElementById("coaching-content");
    if (!host || !owner()) return;
    const focused = document.activeElement?.id,
      l = current(),
      list = links();
    host.innerHTML = `<div class="r-tabs" aria-label="Choisir mon espace"><button data-mode="athlete" aria-pressed="${mode === "athlete"}">${R.icon("user")}Je suis sportif</button><button data-mode="coach" aria-pressed="${mode === "coach"}">${R.icon("group")}J’accompagne des sportifs</button><button id="coach-refresh">${R.icon("route")}Actualiser</button></div><div class="r-notice"><span>${R.icon("shield")} Un partage choisi, limité et révocable. Ton compte et celui de ton coach restent distincts.</span></div>${guest() ? `<section class="r-coach-intro r-panel"><img src="/assets/renaissance/keeper.webp" width="640" height="640" alt="La Gardienne de TITAN"><div><span class="r-eyebrow">SPORTIFS · COACHS · ÉDUCATEURS</span><h2>Un suivi qui se construit à deux.</h2><p>Le coach prépare une invitation. Le sportif choisit la période, le sport et les détails qu’il accepte de partager. Vous retrouvez les séances et les propositions dans cet espace.</p><div class="r-shortcuts"><a class="r-button primary" href="/login">Me connecter</a><a class="r-button subtle" href="/pour-les-coachs">Comprendre le fonctionnement</a></div></div></section><div class="r-goal-templates r-block"><article class="r-panel"><h3>3 sportifs en Classique</h3><p>Invitations, consentement, lecture des séances et propositions d’entraînement inclus gratuitement.</p></article><article class="r-panel"><h3>20 sportifs avec TITAN+</h3><p>Une capacité étendue pour le même fonctionnement. Le sportif n’a pas besoin d’être abonné.</p></article></div>` : loading ? '<p class="r-loading">Chargement de ton espace privé…</p>' : snapshot ? `<section class="r-panel r-coach-toolbar"><div><span class="r-eyebrow">${mode === "coach" ? "LES SPORTIFS QUE J’ACCOMPAGNE" : "LES COACHS AVEC QUI JE PARTAGE"}</span><h2>${mode === "coach" ? list.length + " / " + snapshot.capacity + " suivis actifs" : list.length + " partage" + (list.length > 1 ? "s" : "") + " actif" + (list.length > 1 ? "s" : "")}</h2><p>${mode === "coach" ? "Le sportif garde la main sur le périmètre partagé. Tu peux proposer des séances sans modifier son journal." : "Choisis précisément qui peut lire tes données. Aucune appartenance à un groupe ne remplace ton accord."}</p></div><button id="${mode === "coach" ? "coach-invite" : "coach-join"}" class="r-button primary">${R.icon("plus")}${mode === "coach" ? "Créer une invitation" : "J’ai reçu un code"}</button></section>${mode === "coach" && snapshot.invites.length ? `<details class="r-panel r-block"><summary>${snapshot.invites.length} invitation(s) en attente</summary><div class="r-coach-invites">${snapshot.invites.map((v) => `<div><span>Créée le ${date(v.created_at)} · expire le ${date(v.expires_at)}</span><button class="r-button subtle" data-cancel-invite="${v.id}">Annuler</button></div>`).join("")}</div></details>` : ""}${list.length ? `<div class="r-coach-layout r-block"><aside class="r-coach-people" aria-label="Mes suivis">${list.map((item) => `<button class="r-panel ${item.id === selected ? "selected" : ""}" data-link="${item.id}" aria-pressed="${item.id === selected}">${R.icon(mode === "coach" ? "user" : "group")}<strong>${R.esc((mode === "coach" ? item.athlete_name : item.coach_name) || "Compte TITAN")}</strong><small>Depuis le ${date(item.accepted_at)}</small></button>`).join("")}</aside><div class="r-coach-detail">${l ? `<section class="r-panel"><div class="r-section-head"><h2>${R.esc((mode === "coach" ? l.athlete_name : l.coach_name) || "Mon suivi")}</h2><span class="r-chip">Partage actif</span></div><p class="r-small">Depuis le ${date(l.since_date)} · ${l.sport ? R.esc(R.sport(l.sport)) : "Tous les sports"} · ${l.share_details ? "Détails techniques inclus" : "Mesures essentielles"} · ${l.share_notes ? "Notes incluses" : "Notes privées"}</p><div class="r-coach-actions">${mode === "athlete" ? '<button class="r-button subtle" id="coach-scope">Modifier mon partage</button>' : '<button class="r-button primary" id="coach-propose">Proposer une séance</button>'}<button class="r-button subtle" id="coach-revoke">Arrêter le partage</button></div></section><section class="r-panel r-block"><div class="r-section-head"><h2>Les séances proposées</h2><span class="r-small">${assignments?.total ?? "…"} proposition(s)</span></div>${assignments ? (assignments.rows.length ? `<div class="r-coach-tasks">${taskCards()}</div>${assignments.rows.length < assignments.total ? '<button class="r-button subtle" id="more-coach-tasks">Voir les propositions précédentes</button>' : ""}` : "<p>Aucune proposition pour le moment. Le coach peut préparer une séance et le sportif choisit de l’accepter.</p>") : '<p class="r-loading">Chargement des propositions…</p>'}</section><section class="r-panel r-block"><div class="r-section-head"><h2>${mode === "coach" ? "Les séances partagées" : "Ce que mon coach peut consulter"}</h2></div><form id="coach-period" class="r-coach-period"><label>Du<input id="coach-from" type="date" name="from" value="${fromDate}" max="${today()}" required></label><label>Au<input id="coach-to" type="date" name="to" value="${toDate}" max="${today()}" required></label><button class="r-button subtle" type="submit">Appliquer</button></form><p class="r-small">Dates inclusives en UTC · 366 jours maximum · le début effectif respecte le consentement du sportif.</p>${sessions ? `<p class="r-small">${sessions.rows.length} séance(s) affichée(s) sur ${sessions.total}. Les corrections et archivages sont repris à la prochaine actualisation.</p>${sessions.rows.length ? rows() : '<p class="r-empty">Aucune séance partagée sur cette période.</p>'}${sessions.rows.length < sessions.total ? '<button class="r-button subtle" id="more-coach-sessions">Charger les séances suivantes</button>' : ""}` : '<p class="r-loading">Chargement des séances autorisées…</p>'}</section>` : ""}</div></div>` : `<section class="r-panel r-empty r-block"><h2>${mode === "coach" ? "Prêt pour le premier suivi ?" : "Tu gardes la main."}</h2><p>${mode === "coach" ? "Crée une invitation et transmets le code à ton sportif. Aucun accès ne s’ouvre tant qu’il n’a pas choisi son partage." : "Ton journal reste privé. Seul un code accepté avec ton accord ouvre un suivi avec un coach."}</p></section>`}` : ""}<p id="coaching-error" class="r-error" role="status">${R.esc(error)}</p><p class="r-small r-block">Cet espace facilite l’organisation et la discussion. TITAN ne vérifie pas les qualifications d’un coach. Vérifie son identité avant d’accepter son invitation. Les propositions ne constituent pas une évaluation médicale.</p>`;
    host.querySelectorAll("[data-mode]").forEach(
      (b) =>
        (b.onclick = () => {
          mode = b.dataset.mode;
          selected = links()[0]?.id || "";
          sessions = null;
          assignments = null;
          render();
          if (selected) loadDetail();
        }),
    );
    document.getElementById("coach-refresh").onclick = load;
    document.getElementById("coach-invite")?.addEventListener("click", invite);
    document.getElementById("coach-join")?.addEventListener("click", join);
    document
      .getElementById("coach-scope")
      ?.addEventListener("click", changeScope);
    document.getElementById("coach-revoke")?.addEventListener("click", revoke);
    document
      .getElementById("coach-propose")
      ?.addEventListener("click", () => propose());
    host.querySelectorAll("[data-link]").forEach(
      (b) =>
        (b.onclick = () => {
          selected = b.dataset.link;
          sessions = null;
          assignments = null;
          const share = current();
          if (fromDate < share.since_date) fromDate = share.since_date;
          render();
          loadDetail();
        }),
    );
    host
      .querySelectorAll("[data-cancel-invite]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            dialog(
              "Annuler cette invitation",
              "<p>Le code correspondant ne pourra plus être accepté. Les suivis déjà actifs restent disponibles.</p>",
              "Annuler l’invitation",
              () => rpc("cancel_invite", { id: b.dataset.cancelInvite }),
            )),
      );
    host.querySelectorAll("[data-task]").forEach(
      (b) =>
        (b.onclick = () =>
          taskAction(
            assignments.rows.find((t) => t.id === b.dataset.task),
            b.dataset.status,
          )),
    );
    host
      .querySelectorAll("[data-reuse]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            propose(assignments.rows.find((t) => t.id === b.dataset.reuse))),
      );
    document
      .getElementById("more-coach-tasks")
      ?.addEventListener("click", () => loadDetail({ moreAssignments: true }));
    document
      .getElementById("more-coach-sessions")
      ?.addEventListener("click", () => loadDetail({ moreSessions: true }));
    document.getElementById("coach-period")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      fromDate = f.get("from");
      toDate = f.get("to");
      sessions = null;
      loadDetail();
    });
    if (focused && document.getElementById(focused))
      document.getElementById(focused).focus();
  }
  // Shared sessions are deliberately kept in memory only, and removed when the account or authorization changes.
  window.addEventListener("titan:history-updated", () => {
    if (loadedOwner !== owner()) load();
  });
  window.addEventListener("online", load);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) load();
    else {
      sessions = null;
      assignments = null;
      render();
    }
  });
  window.addEventListener("pagehide", () => {
    sessions = null;
    assignments = null;
    snapshot = null;
  });
  document.addEventListener("DOMContentLoaded", load);
  load();
})();
