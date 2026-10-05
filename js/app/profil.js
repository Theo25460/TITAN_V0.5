/* TITAN 300 — Profil: who you are as an athlete (rank, mastery, DNA, collection) and what you control
   (identity, rhythm, privacy, data, account). Official values come from the server for accounts. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const F = () => window.TitanFormat;
  const E = () => window.TitanEffort;
  const P = () => window.TitanProgress;
  const SP = () => window.TitanSports;
  const D = () => window.TitanData;
  const C = () => window.TitanCodex;
  const A = () => window.TitanAdventure;
  const MILESTONES = [1, 10, 25, 50, 100, 200, 365, 500, 1000];
  const HOURS = [10, 25, 50, 100, 250, 500, 1000];
  const PRIVACY = [
    ["publicProfile", "Être trouvable par mon code ami", "Sans cela, personne ne peut t’envoyer de demande d’ami."],
    ["socialPresence", "Mes amis voient quand je suis actif", "Uniquement le jour, jamais l’heure ni le lieu."],
    ["showStats", "Mes amis voient mes statistiques", "Temps, séances, sports. Jamais de santé, de poids, de GPS ni de notes."],
    ["friendRankings", "Apparaître dans les classements entre amis", "Classements par effort normalisé, entre amis uniquement."],
  ];

  let root = null;
  const guest = () => D().isGuest();
  const logs = () => window.state?.history || [];

  function heroHtml() {
    const pr = D().progression();
    const u = window.shellUser?.() || window.titanShell?.user?.() || {};
    const next = pr.nextRank;
    const pct = Math.round(Math.min(1, pr.xp / Math.max(1, pr.next)) * 100);
    return `<section class="asc-hero pf-hero">
      <div class="pf-id"><span class="pf-avatar"${u.frame ? ` data-frame="${esc(u.frame)}"` : ""}><img src="/assets/renaissance/${esc(u.avatar || "scout")}.webp" alt="" width="128" height="128"></span>
        <div><p class="asc-eyebrow cy">${esc(pr.rank.name)}</p><h2 class="pf-name">${esc(guest() ? "Mode découverte" : window.state?.user?.name || "Athlète")}</h2><p class="asc-small asc-muted">${guest() ? "Tes séances restent sur cet appareil" : `Membre depuis ${esc(new Date(window.state?.user?.created_at || P().dna(logs()).first || Date.now()).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }))}`}</p></div></div>
      <div class="pf-level"><div class="asc-between"><span class="pf-level-n">Niveau <strong class="asc-num">${pr.level}</strong></span><span class="asc-small asc-muted asc-num">${F().number(pr.xp)} / ${F().number(pr.next)} XP</span></div>
        <span class="asc-ascent"><span style="--p:${pct}%"></span></span>
        <p class="asc-small asc-muted">${next ? `${esc(next.name)} au niveau ${next.level}` : "Rang le plus haut atteint"}${pr.estimated ? " · estimation du mode découverte" : ""}</p></div>
    </section>`;
  }

  function masteryHtml() {
    const list = P().mastery(logs());
    if (!list.length) return "";
    return `<section class="asc-section" id="maitrise"><div class="asc-section-head"><h2>Maîtrise</h2><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-mastery-help>${icon("help")} Les paliers</button></div>
      <div class="pf-mastery">${list
        .slice(0, 8)
        .map(
          (m) => `<div class="pf-mastery-row" data-family="${esc(m.family)}"><span class="jr-icon">${icon(SP().FAMILY_ICON[SP().familyOf(m.sport)])}</span>
        <span class="pf-mastery-main"><span class="asc-between"><strong>${esc(m.label)}</strong><span class="asc-small">${esc(m.name)} · ${m.level}/10</span></span>
        <span class="asc-ascent thin"><span style="--p:${Math.round(m.progress * 100)}%"></span></span>
        <span class="asc-small asc-faint">${esc(F().duration(m.minutes))} sur ${m.weeks} semaine${m.weeks > 1 ? "s" : ""}${m.next ? ` · ${esc(m.next.name)} : ${m.next.hours} h sur ${m.next.weeks} semaines` : ""}</span></span></div>`,
        )
        .join("")}</div></section>`;
  }

  function dnaHtml() {
    const d = P().dna(logs());
    if (!d.enough)
      return `<section class="asc-section" id="adn"><div class="asc-section-head"><h2>ADN sportif</h2></div><p class="asc-small asc-muted">Ton ADN se dessine à partir de 5 séances : familles de sports, moment de la journée, jour favori, disciplines maîtrisées.</p></section>`;
    const slot = { matin: "du matin", midi: "de la pause de midi", "après-midi": "de l’après-midi", soir: "du soir" }[d.timeOfDay];
    return `<section class="asc-section" id="adn"><div class="asc-section-head"><h2>ADN sportif</h2><span class="asc-small asc-muted">depuis le ${esc(new Date(d.first).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }))}</span></div>
      <div class="pf-dna">
        <div class="wk-stack" role="img" aria-label="${esc(d.families.map((f) => `${f.label} ${Math.round(f.share * 100)} %`).join(", "))}">${d.families.map((f) => `<span data-family="${esc(f.id)}" style="--w:${(f.share * 100).toFixed(1)}%"></span>`).join("")}</div>
        <ul class="wk-legend">${d.families.map((f) => `<li data-family="${esc(f.id)}"><i></i>${esc(f.label)} ${Math.round(f.share * 100)} %</li>`).join("")}</ul>
        <dl class="pf-dna-facts">
          <div><dt>Séances</dt><dd class="asc-num">${F().number(d.sessions)}</dd></div>
          <div><dt>Temps</dt><dd class="asc-num">${esc(F().hours(d.minutes))}</dd></div>
          <div><dt>Semaines actives</dt><dd class="asc-num">${F().number(d.activeWeeks)}</dd></div>
          ${d.distance ? `<div><dt>Distance</dt><dd class="asc-num">${esc(F().distance(d.distance))}</dd></div>` : ""}
        </dl>
        <p class="pf-dna-line">${slot ? `Plutôt <strong>${esc(slot)}</strong>` : ""}${slot && d.favoriteDay ? ", " : ""}${d.favoriteDay ? `surtout le <strong>${esc(d.favoriteDay)}</strong>` : ""}. ${d.topSports.length ? `Tes piliers : ${d.topSports.map((s) => `<strong>${esc(s.label)}</strong>`).join(", ")}.` : ""}</p>
      </div></section>`;
  }

  function collectionHtml() {
    const s = A()?.snapshot;
    const rewards = (s?.rewards || []).slice().sort((a, b) => new Date(b.earned_at) - new Date(a.earned_at));
    const list = P().activeLogs(logs());
    const hours = list.reduce((n, l) => n + (P().minutesOf(l).minutes || 0), 0) / 60;
    const settings = D().cadenceSettings();
    const held = P().cadence(logs(), { target: settings.target, pauses: settings.pauses }).lifetimeHeld;
    const records = (window.TitanInsights?.records?.(logs(), "all", Date.now()) || []).filter((r) => r.kind !== "duration").length;
    const ms = MILESTONES.filter((m) => list.length >= m);
    const hs = HOURS.filter((h) => hours >= h);
    const nextM = MILESTONES.find((m) => list.length < m);
    const nextH = HOURS.find((h) => hours < h);
    const badge = (r) => {
      const w = C()?.worlds.find((x) => x.id === r.world);
      const ch = w?.chapters?.[r.chapter - 1];
      return w && ch ? `<li class="pf-item" style="--world:${w.color}"><span class="av-badge is-earned">${icon(["compass", "route", "journal", "leaf", "layers", "target", "bolt", "shield", "crown"][(r.chapter - 1) % 9])}<small>${String(r.chapter).padStart(2, "0")}</small></span><span><strong>${esc(ch.title)}</strong><small>${esc(w.name)}</small></span></li>` : "";
    };
    return `<section class="asc-section" id="collection"><div class="asc-section-head"><h2>Collection</h2><span class="asc-small asc-muted">${rewards.length + ms.length + hs.length} pièces · <a href="/boutique">Atelier</a></span></div>
      <div class="pf-collection">
        <div class="pf-col-block"><p class="asc-eyebrow">Insignes d’aventure</p>${rewards.length ? `<ul class="pf-items">${rewards.map(badge).join("")}</ul>` : `<p class="asc-small asc-muted">Allume ta première balise dans <a href="/adventure">l’Aventure</a>.</p>`}</div>
        <div class="pf-col-block"><p class="asc-eyebrow">Jalons</p><ul class="pf-chips">${ms.map((m) => `<li>${icon("flag")} ${m} séance${m > 1 ? "s" : ""}</li>`).join("")}${hs.map((h) => `<li>${icon("clock")} ${h} h</li>`).join("")}${held ? `<li>${icon("check")} ${held} semaine${held > 1 ? "s" : ""} tenue${held > 1 ? "s" : ""}</li>` : ""}${records ? `<li>${icon("star")} ${records} record${records > 1 ? "s" : ""}</li>` : ""}</ul>
          <p class="asc-small asc-faint">${nextM ? `Prochain jalon : ${nextM} séances (${nextM - list.length} à venir)` : ""}${nextM && nextH ? " · " : ""}${nextH ? `${nextH} h de pratique` : ""}</p></div>
      </div>
      <p class="asc-small asc-faint">La collection est cosmétique : elle raconte ton parcours sans donner d’XP ni de crédits.</p></section>`;
  }

  function avatarHtml() {
    const s = A()?.snapshot;
    const level = D().progression().level;
    const current = s?.avatar || "scout";
    return `<section class="asc-section" id="personnage"><div class="asc-section-head"><h2>Personnage</h2></div>
      <div class="pf-avatars" role="radiogroup" aria-label="Personnage">${(C()?.avatars || [])
        .map((a) => {
          const locked = a.level > level;
          return `<button type="button" class="pf-avatar-pick" role="radio" data-avatar="${a.id}" aria-checked="${a.id === current}" ${locked ? 'aria-disabled="true"' : ""}><img src="/assets/renaissance/${a.id}.webp" alt="" width="96" height="96" loading="lazy"><strong>${esc(a.name)}</strong><small>${locked ? `Niveau ${a.level}` : esc(a.role)}</small></button>`;
        })
        .join("")}</div></section>`;
  }

  function settingsHtml() {
    const u = window.state?.user || {};
    const privacy = u.privacy || {};
    const settings = D().cadenceSettings();
    const analytics = window.TitanAnalytics?.consent() === "granted";
    return `<section class="asc-section" id="reglages"><div class="asc-section-head"><h2>Réglages</h2></div>
      <div class="pf-settings">
        ${guest() ? "" : `<label class="asc-field"><span>Nom affiché</span><span class="pf-inline"><input class="asc-input" id="pf-name" maxlength="24" value="${esc(u.name || "")}" autocomplete="nickname"><button type="button" class="asc-btn asc-btn-secondary" data-save-name>Enregistrer</button></span></label>`}
        <div class="asc-field"><span>Cadence : jours actifs visés par semaine</span><div class="ob-target pf-target" role="radiogroup" aria-label="Cadence">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<button type="button" role="radio" data-cadence="${n}" aria-checked="${settings.target === n}">${n}</button>`).join("")}</div><small>Une semaine en pause se règle depuis le QG ; elle ne compte ni pour ni contre toi.</small></div>
        <fieldset class="pf-privacy"><legend class="seance-label">Confidentialité</legend>${guest() ? `<p class="asc-small asc-muted">En mode découverte, rien ne quitte cet appareil.</p>` : PRIVACY.map(([k, label, help]) => `<label class="pf-toggle"><input type="checkbox" role="switch" data-privacy="${k}" ${privacy[k] === true ? "checked" : ""}><span><strong>${esc(label)}</strong><small>${esc(help)}</small></span></label>`).join("")}
          <label class="pf-toggle"><input type="checkbox" role="switch" data-analytics ${analytics ? "checked" : ""}><span><strong>Statistiques d’usage</strong><small>Aide à améliorer TITAN. Jamais de santé, de poids, de GPS ni de notes.</small></span></label></fieldset>
      </div></section>`;
  }

  function accountHtml() {
    const s = A()?.snapshot;
    const plus = Boolean(s?.plus || window.state?.user?.is_elite);
    const pending = (window.TitanQueue?.list?.() || []).length;
    return `<section class="asc-section" id="compte"><div class="asc-section-head"><h2>${guest() ? "Garder tes séances" : "Compte et données"}</h2></div>
      ${guest() ? `<div class="asc-note">${icon("cloudUp")}<span>Crée un compte pour sauvegarder ta progression et la retrouver partout. Tes séances de découverte pourront le rejoindre en un geste.</span></div><div class="asc-row-flex pf-actions"><a class="asc-btn asc-btn-primary" href="/login?mode=signup">Créer un compte</a><a class="asc-btn asc-btn-secondary" href="/login">J’ai déjà un compte</a></div>` : `<div class="asc-list">
        <a class="asc-row" href="/boutique"><span class="asc-row-icon">${icon("sparkle")}</span><span class="asc-row-main"><span class="asc-row-title">${plus ? "TITAN+ actif" : "TITAN+"}</span><span class="asc-row-sub">${plus ? "Merci de soutenir TITAN. Aucun avantage de progression, seulement du confort et des cosmétiques." : "Confort, campagnes et cosmétiques. Jamais de progression achetée."}</span></span>${icon("chevron")}</a>
      </div>`}
      <div class="asc-list pf-data">
        <button type="button" class="asc-row" data-export-json><span class="asc-row-icon">${icon("download")}</span><span class="asc-row-main"><span class="asc-row-title">Exporter toutes mes données</span><span class="asc-row-sub">Fichier JSON : profil, séances, objectifs${guest() ? " (données de cet appareil)" : ""}</span></span></button>
        <button type="button" class="asc-row" data-export-csv><span class="asc-row-icon">${icon("journal")}</span><span class="asc-row-main"><span class="asc-row-title">Exporter mon journal</span><span class="asc-row-sub">Tableur CSV, lisible partout</span></span></button>
        <button type="button" class="asc-row" data-clear-cache><span class="asc-row-icon">${icon("restore")}</span><span class="asc-row-main"><span class="asc-row-title">Vider le cache de cet appareil</span><span class="asc-row-sub">Les séances en attente sont conservées</span></span></button>
        ${guest() ? "" : `<button type="button" class="asc-row" data-signout><span class="asc-row-icon">${icon("logout")}</span><span class="asc-row-main"><span class="asc-row-title">Se déconnecter</span><span class="asc-row-sub">${pending ? `${pending} séance(s) attendent l’envoi : elles restent sur cet appareil` : "Tes données restent dans ton compte"}</span></span></button>
        <button type="button" class="asc-row pf-danger" data-delete><span class="asc-row-icon">${icon("trash")}</span><span class="asc-row-main"><span class="asc-row-title">Supprimer mon compte</span><span class="asc-row-sub">Définitif : séances, objectifs, progression</span></span></button>`}
      </div></section>`;
  }

  function render() {
    if (!root) return;
    root.innerHTML = `${heroHtml()}
      <nav class="pf-jump" aria-label="Sections du profil">${[["maitrise", "Maîtrise"], ["adn", "ADN"], ["collection", "Collection"], ["personnage", "Personnage"], ["reglages", "Réglages"], ["compte", "Compte"]].map(([id, l]) => `<a href="#${id}">${l}</a>`).join("")}</nav>
      ${masteryHtml()}${dnaHtml()}${collectionHtml()}${avatarHtml()}${settingsHtml()}${accountHtml()}`;
    root.setAttribute("aria-busy", "false");
    if (location.hash && !root.dataset.scrolled) {
      root.dataset.scrolled = "1";
      document.getElementById(location.hash.slice(1))?.scrollIntoView();
    }
  }

  async function exportJson() {
    let payload = { exportedAt: new Date().toISOString(), source: "device", pendingSessions: window.TitanQueue?.list?.() || [], localState: window.state };
    if (!guest() && window.titanClient && navigator.onLine) {
      try {
        const { data, error } = await window.titanClient.rpc("export_own_data");
        if (!error && data) payload = { ...payload, source: "account", cloud: data };
      } catch {}
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `titan-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    window.titanShell.toast({ type: "ok", title: "Export prêt", message: payload.source === "account" ? "Données du compte et de cet appareil." : "Données de cet appareil." });
  }

  function deleteAccount() {
    const body = document.createElement("form");
    body.className = "asc-stack";
    body.innerHTML = `<p>Ton compte, tes séances, tes objectifs et ta progression seront supprimés définitivement. Exporte d’abord tes données si tu veux les garder.</p>
      <label class="asc-field"><span>Écris SUPPRIMER pour confirmer</span><input class="asc-input" name="confirm" autocomplete="off" autocapitalize="characters"></label>
      <p class="asc-small jr-edit-error" role="alert"></p>
      <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-cancel>Annuler</button><button type="submit" class="asc-btn asc-btn-danger">Supprimer</button></div>`;
    const d = window.titanShell.sheet({ title: "Supprimer mon compte ?", body });
    body.querySelector("[data-cancel]").addEventListener("click", () => d.close());
    body.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = body.querySelector(".jr-edit-error");
      if (body.querySelector("[name=confirm]").value.trim().toUpperCase() !== "SUPPRIMER") return (err.textContent = "Écris SUPPRIMER pour confirmer.");
      const btn = body.querySelector("[type=submit]");
      btn.disabled = true;
      try {
        const { error } = await window.titanClient.rpc("delete_own_account");
        if (error) throw error;
        const id = window.state.user.id;
        await window.titanClient.auth.signOut().catch(() => {});
        await window.TitanQueue?.deleteOwner(id).catch(() => {});
        window.titanSafeClearCache?.();
        location.href = "/";
      } catch {
        err.textContent = "La suppression n’a pas pu être confirmée. Vérifie ta connexion et réessaie ; rien n’a été supprimé localement.";
        btn.disabled = false;
      }
    });
  }

  function onClick(e) {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.cadence) {
      D().setCadenceTarget(Number(b.dataset.cadence));
      return window.titanShell.toast({ type: "ok", title: "Cadence mise à jour", message: `${b.dataset.cadence} jour(s) actif(s) par semaine.` });
    }
    if (b.dataset.avatar) {
      if (b.getAttribute("aria-disabled") === "true") return window.titanShell.toast({ type: "info", title: "Personnage verrouillé", message: "Il se débloque avec les niveaux, jamais avec un achat." });
      return A()
        .action("avatar", { avatar: b.dataset.avatar })
        .then(() => (window.titanShell.refresh(), render()))
        .catch((err) => window.titanShell.toast({ type: "warn", message: A().message(err) }));
    }
    if (b.hasAttribute("data-save-name")) {
      const v = window.titanCleanProfileName?.(document.getElementById("pf-name").value) || "";
      if (v.length < 2) return window.titanShell.toast({ type: "warn", message: "Un nom de 2 caractères minimum." });
      window.state.user.name = v;
      window.saveState?.({ forceCloud: true });
      window.titanShell.refresh();
      return window.titanShell.toast({ type: "ok", title: "Nom enregistré", message: v });
    }
    if (b.hasAttribute("data-mastery-help")) {
      const body = `<p class="asc-small asc-muted">La maîtrise demande du temps <strong>et</strong> de la régularité : les deux seuils doivent être atteints. Toutes les séances comptent, même historiques : elle décrit ton expérience, elle ne rapporte rien.</p><table class="pf-table"><thead><tr><th>Palier</th><th>Heures</th><th>Semaines</th></tr></thead><tbody>${P()
        .MASTERY.map((m) => `<tr><td>${m.level}. ${esc(m.name)}</td><td class="asc-num">${m.hours}</td><td class="asc-num">${m.weeks}</td></tr>`)
        .join("")}</tbody></table>`;
      return window.titanShell.sheet({ title: "Les paliers de maîtrise", eyebrow: "Maîtrise", body });
    }
    if (b.hasAttribute("data-export-json")) return exportJson();
    if (b.hasAttribute("data-export-csv")) return window.titanExportSessionsCSV?.(logs());
    if (b.hasAttribute("data-clear-cache"))
      return window.titanShell.confirm({
        title: "Vider le cache ?",
        message: "Les préférences locales sont effacées et la page se recharge. Les séances en attente et ton compte ne sont pas touchés.",
        confirmLabel: "Vider",
        action: () => {
          window.titanSafeClearCache?.();
          location.reload();
        },
      });
    if (b.hasAttribute("data-signout"))
      return window.titanShell.confirm({
        title: "Se déconnecter ?",
        message: (window.TitanQueue?.list?.() || []).length ? "Des séances attendent encore l’envoi : elles restent sur cet appareil et partiront à ta prochaine connexion." : "Tu retrouveras tout en te reconnectant.",
        confirmLabel: "Se déconnecter",
        action: async () => {
          await window.titanClient?.auth.signOut().catch(() => {});
          window.titanSafeClearCache?.();
          location.href = "/login";
        },
      });
    if (b.hasAttribute("data-delete")) return deleteAccount();
  }

  function onChange(e) {
    const t = e.target;
    if (t.dataset.privacy) {
      window.state.user.privacy = { ...(window.state.user.privacy || {}), [t.dataset.privacy]: t.checked };
      window.saveState?.({ forceCloud: true });
      window.titanShell.toast({ type: "ok", title: "Confidentialité", message: t.checked ? "Partage activé." : "Partage désactivé." });
    }
    if (t.matches("[data-analytics]")) {
      window.TitanAnalytics?.setConsent(t.checked);
      window.titanShell.toast({ type: "ok", title: "Statistiques d’usage", message: t.checked ? "Merci pour ton aide." : "Plus rien n’est envoyé." });
    }
  }

  let booted = false;
  function start() {
    root = document.getElementById("profil");
    if (!root || !window.state?.user || !window.TitanSports) return;
    if (!booted) {
      booted = true;
      SP().ensure();
      root.addEventListener("click", onClick);
      root.addEventListener("change", onChange);
      A()?.refresh?.();
    }
    render();
  }
  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      start();
    });
  };
  ["titan:history-updated", "titan:adventure-updated", "titan:pending-changed"].forEach((ev) => window.addEventListener(ev, queue));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
