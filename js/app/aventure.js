/* TITAN 300 — Aventure: the world reacts to real active days. Server-authoritative for accounts
   (titan_adventure_* RPCs), local for discovery. Badges are cosmetic: no XP, no credits. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const F = () => window.TitanFormat;
  const SP = () => window.TitanSports;
  const A = () => window.TitanAdventure;
  const C = () => window.TitanCodex;
  const NODES = [
    [12, 78],
    [28, 68],
    [41, 81],
    [54, 61],
    [72, 70],
    [86, 47],
    [68, 35],
    [43, 26],
    [57, 11],
  ];
  const BADGE_ICONS = ["compass", "route", "journal", "leaf", "layers", "target", "bolt", "shield", "crown"];

  let root = null;
  let selected = new URLSearchParams(location.search).get("world");
  let busy = false;

  const isGuest = () => String(window.state?.user?.id || "").startsWith("guest_");
  const badge = (world, index, earned) => `<span class="av-badge${earned ? " is-earned" : ""}" style="--world:${world.color}">${icon(BADGE_ICONS[(index - 1) % 9])}<small>${String(index).padStart(2, "0")}</small></span>`;
  const done = (p) => Math.max(0, Math.min(9, (p?.chapter || 1) - 1));

  function campaign(world) {
    const s = A().snapshot;
    return s?.campaigns?.find((c) => c.id === world.id) || { id: world.id, chapter: 0, evidence: { days: 0, source_ids: [] }, target: 0 };
  }

  function worldsHtml(s, world) {
    return `<div class="av-worlds" role="tablist" aria-label="Régions">${C()
      .worlds.map((w) => {
        const p = s.campaigns.find((c) => c.id === w.id);
        const finished = p?.chapter >= 10;
        return `<button type="button" role="tab" class="av-world" data-world="${w.id}" aria-selected="${w.id === world.id}" style="--world:${w.color}">
          <img src="/assets/renaissance/${w.image}-xs.webp" alt="" width="480" height="270" loading="lazy" decoding="async">
          <span class="av-world-copy"><small>${w.tier === "plus" ? "TITAN+" : "Gratuit"} · ${finished ? "terminé" : `${done(p)}/9`}</small><strong>${esc(w.name)}</strong><span>${esc(w.subtitle)}</span></span>
          <span class="av-world-bar"><span style="--p:${Math.round((finished ? 9 : done(p)) / 9 * 100)}%"></span></span>
        </button>`;
      })
      .join("")}</div>`;
  }

  function mapHtml(world, p) {
    const current = p.chapter >= 1 && p.chapter <= 9 ? p.chapter : 0;
    return `<section class="av-map" aria-label="Carte des neuf balises : ${esc(world.name)}" style="--world:${world.color}"${window.titanShell?.look?.().map ? ` data-ambiance="${esc(window.titanShell.look().map)}"` : ""}>
      <img class="av-map-img" srcset="/assets/renaissance/${world.image}-small.webp 800w, /assets/renaissance/${world.image}.webp 1600w" sizes="(max-width: 960px) 100vw, 860px" src="/assets/renaissance/${world.image}.webp" alt="" width="1600" height="900" decoding="async">
      <svg class="av-trail" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M12 78 Q17 62 28 68 T41 81 Q43 55 54 61 T72 70 Q94 63 86 47 T68 35 Q29 36 43 26 T57 11"/></svg>
      ${world.chapters
        .map((ch, i) => {
          const earned = p.chapter > ch.index;
          const active = current === ch.index;
          return `<button type="button" class="av-node${earned ? " is-earned" : ""}${active ? " is-active" : ""}${ch.boss ? " is-boss" : ""}" data-chapter="${ch.index}" style="left:${NODES[i][0]}%;top:${NODES[i][1]}%" aria-label="Balise ${ch.index} : ${esc(ch.name)}. ${earned ? "Allumée" : active ? "Étape en cours" : "À découvrir"}">${earned ? icon("check") : ch.boss ? icon("crown") : ch.index}</button>`;
        })
        .join("")}
      <div class="av-map-caption"><strong>${esc(world.name)}</strong><span>${p.chapter >= 10 ? "Les neuf balises brillent." : `${done(p)} balise${done(p) > 1 ? "s" : ""} allumée${done(p) > 1 ? "s" : ""} sur 9`}</span></div>
    </section>`;
  }

  function missionHtml(world, p, s) {
    const locked = world.tier === "plus" && !s.plus;
    if (locked)
      return `<section class="av-panel"><p class="asc-eyebrow">Campagne TITAN+</p><h2 class="asc-h2">${esc(world.name)}</h2><p>${esc(world.intro)}</p>
        <p class="asc-small asc-muted">9 chapitres, 9 insignes cosmétiques et un gardien. Les mêmes règles de progression que les campagnes gratuites : aucun bonus de puissance, aucune XP en plus.</p>
        <div class="asc-row-flex"><a class="asc-btn asc-btn-primary" href="/boutique">Découvrir TITAN+</a><button type="button" class="asc-btn asc-btn-ghost" data-world="aube">Revenir à l’Aube</button></div></section>`;
    if (p.chapter >= 10)
      return `<section class="av-panel is-complete"><p class="asc-eyebrow">Campagne accomplie</p><h2 class="asc-h2">${esc(world.guardian)} te reconnaît</h2><p>${esc(world.ending)}</p><div class="asc-row-flex"><a class="asc-btn asc-btn-secondary" href="/profile#collection">Voir ma collection</a></div></section>`;
    if (!p.chapter)
      return `<section class="av-panel"><p class="asc-eyebrow cy">Nouvelle campagne</p><h2 class="asc-h2">${esc(world.chapters[0].name)}</h2><p>${esc(world.intro)}</p>
        <fieldset class="av-routes"><legend class="seance-label">Ton chemin</legend>${C()
          .routes.map((r, i) => `<label class="av-route"><input type="radio" name="route" value="${r.id}" ${i === 0 ? "checked" : ""}><span><strong>${esc(r.name)}</strong><small>${esc(r.description)}${r.id === "journal" ? " (10 caractères minimum)" : ""}</small></span></label>`)
          .join("")}</fieldset>
        <button type="button" class="asc-btn asc-btn-primary" data-start>${icon("compass")} Commencer la campagne</button>
        <p class="asc-small asc-faint">Les séances comptent à partir du départ, une seule fois par jour. Aucune échéance, aucune pénalité.</p></section>`;
    const ch = world.chapters[p.chapter - 1];
    const days = Math.min(p.target, Number(p.evidence?.days || 0));
    const effortTarget = Number(p.effort_target || (ch.boss ? 150 : 0));
    const effort = Math.min(effortTarget, Number(p.evidence?.effort || 0));
    const ready = days >= p.target && effort >= effortTarget;
    return `<section class="av-panel${ready ? " is-ready" : ""}">
      <div class="av-mission-head">${badge(world, ch.index, ready)}<div><p class="asc-eyebrow${ready ? " cy" : ""}">Chapitre ${ch.index} / 9${ch.boss ? " · le gardien" : ""}</p><h2 class="asc-h2">${esc(ch.name)}</h2></div></div>
      <p>${esc(ch.story)}</p>
      <div class="av-track"><div class="asc-between"><span>${p.route === "journal" ? "Jours avec une séance annotée" : "Jours actifs"}</span><strong class="asc-num">${days} / ${p.target}</strong></div><span class="asc-ascent"><span style="--p:${Math.round((days / Math.max(1, p.target)) * 100)}%"></span></span></div>
      ${effortTarget ? `<div class="av-track"><div class="asc-between"><span>Effort pour le gardien</span><strong class="asc-num">${F().number(effort)} / ${effortTarget} min</strong></div><span class="asc-ascent"><span style="--p:${Math.round((effort / effortTarget) * 100)}%"></span></span><p class="asc-small asc-faint">Minutes d’effort depuis le début du chapitre, 90 au plus par jour : l’épreuve récompense la constance, pas une séance démesurée.</p></div>` : ""}
      <div class="av-practice"><p class="asc-eyebrow">Le repère à emporter</p><p>${esc(ch.practice)}</p></div>
      ${ready ? `<button type="button" class="asc-btn asc-btn-primary" data-claim="${ch.index}">${icon("star")} ${ch.boss ? "Affronter le gardien" : "Allumer la balise"}</button>` : `<a class="asc-btn asc-btn-primary" href="/training">${icon("plus")} Enregistrer une séance</a>`}
      <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-chapter="${ch.index}">Détails du chapitre</button>
      <p class="asc-small asc-muted">Insigne : <strong>${esc(ch.title)}</strong>. Cosmétique : il ne donne ni XP ni crédits.</p>
    </section>`;
  }

  function guardianHtml(world, p) {
    const finished = p.chapter >= 10;
    return `<section class="av-guardian" style="--world:${world.color}">
      <img src="/assets/renaissance/guardian-${world.id}-s.webp" alt="${esc(world.guardian)}" width="256" height="256" loading="lazy" decoding="async">
      <div><p class="asc-eyebrow">Le gardien de la région</p><h2 class="asc-h2">${esc(world.guardian)}</h2>
        <p>${finished ? esc(world.ending) : `Au neuvième chapitre, ${esc(world.guardian.toLocaleLowerCase("fr-FR"))} attend trois jours actifs et 150 minutes d’effort. Pas plus de 90 par jour : il mesure ta constance, pas une journée héroïque.`}</p></div>
    </section>`;
  }

  function carnetHtml(world, p) {
    return `<section class="asc-section"><div class="asc-section-head"><h2>Le carnet</h2><span class="asc-small asc-muted">${done(p)}/9 insignes</span></div>
      <div class="av-carnet">${world.chapters
        .map((ch) => {
          const earned = p.chapter > ch.index;
          return `<button type="button" class="av-carnet-row${earned ? " is-earned" : ""}" data-chapter="${ch.index}">${badge(world, ch.index, earned)}<span><small>Chapitre ${ch.index}${ch.boss ? " · gardien" : ""}</small><strong>${esc(ch.name)}</strong><span>${esc(ch.title)}</span></span>${icon(earned ? "check" : "chevron")}</button>`;
        })
        .join("")}</div></section>`;
  }

  function render() {
    if (!root) return;
    const s = A()?.snapshot;
    if (!s) {
      root.innerHTML = `<div class="asc-empty"><h2>${A()?.status === "error" ? "L’aventure est momentanément indisponible" : "Ton univers se prépare…"}</h2><p>Tes séances restent dans ton journal.</p>${A()?.status === "error" ? `<button type="button" class="asc-btn asc-btn-secondary" data-retry>${icon("restore")} Réessayer</button>` : ""}</div>`;
      return;
    }
    const world = C().worlds.find((w) => w.id === (selected || s.selected_world)) || C().worlds[0];
    selected = world.id;
    const p = campaign(world);
    root.innerHTML = `
      ${isGuest() ? `<p class="asc-note">${icon("offline")}<span>Mode découverte : l’aventure se joue sur cet appareil. Avec un compte, elle est confirmée par le serveur.</span></p>` : ""}
      ${A().status === "cached" ? `<p class="asc-note">${icon("cloud")}<span>Dernière progression connue ; elle se met à jour dès que le serveur répond.</span></p>` : ""}
      ${worldsHtml(s, world)}
      <div class="av-grid">${mapHtml(world, p)}${missionHtml(world, p, s)}</div>
      ${guardianHtml(world, p)}
      ${carnetHtml(world, p)}
      <details class="asc-note av-rules"><summary>Les règles de l’aventure</summary>
        <p>Une étape commence quand tu démarres la campagne ou allumes la balise précédente. Une séance compte si elle a été enregistrée après ce départ, une seule fois par jour, quel que soit son volume. Les séances archivées, signalées ou ajoutées plus de 30 jours après leur date ne comptent pas.</p>
        <p>Le gardien demande en plus 150 minutes d’effort, 90 au plus par jour. Les insignes restent dans ta collection après une correction ou un archivage. Ils ne donnent ni XP ni crédits. Une pause n’enlève rien.</p></details>
      <p class="asc-small" role="status" id="av-error"></p>`;
  }

  async function mutate(action, params) {
    if (busy) return;
    busy = true;
    root.querySelectorAll("[data-start],[data-claim]").forEach((b) => (b.disabled = true));
    try {
      const before = campaign(C().worlds.find((w) => w.id === params.world));
      await A().action(action, params);
      if (action === "start") window.TitanAnalytics?.track("campaign_started", { world: params.world });
      if (action === "claim") {
        window.TitanAnalytics?.track("campaign_progress", { world: params.world, chapter: params.chapter });
        celebrate(C().worlds.find((w) => w.id === params.world), before.chapter);
      }
      render();
    } catch (e) {
      const msg = A().message(e);
      const el = document.getElementById("av-error");
      if (el) el.textContent = msg;
      window.titanShell.toast({ type: "warn", title: "Pas encore", message: msg });
      if (e.message === "ADVENTURE_CONFLICT") await A().refresh({ force: true });
    } finally {
      busy = false;
      root.querySelectorAll("[data-start],[data-claim]").forEach((b) => (b.disabled = false));
    }
  }

  function celebrate(world, index) {
    const ch = world.chapters[index - 1];
    const body = document.createElement("div");
    body.className = "asc-stack av-celebrate";
    body.innerHTML = `${ch.boss ? `<img src="/assets/renaissance/guardian-${world.id}.webp" alt="${esc(world.guardian)}" width="640" height="640">` : `<div class="av-celebrate-badge">${badge(world, index, true)}</div>`}
      <p class="asc-eyebrow am">Insigne obtenu</p><p class="av-celebrate-title">${esc(ch.title)}</p>
      <p>${esc(ch.boss ? world.ending : ch.story)}</p>
      ${!ch.boss ? `<p class="asc-small asc-muted">Prochaine étape : <strong>${esc(world.chapters[index]?.name || "")}</strong>.</p>` : ""}
      <button type="button" class="asc-btn asc-btn-primary" data-close-celebrate>Continuer</button>`;
    const d = window.titanShell.sheet({ title: ch.boss ? world.guardian : `Balise ${index} allumée`, eyebrow: world.name, body });
    body.querySelector("[data-close-celebrate]").addEventListener("click", () => d.close());
  }

  function openChapter(index) {
    const world = C().worlds.find((w) => w.id === selected) || C().worlds[0];
    const p = campaign(world);
    const ch = world.chapters[index - 1];
    if (!ch) return;
    const earned = p.chapter > index;
    const current = p.chapter === index;
    const ids = current ? p.evidence?.source_ids || [] : (A().snapshot?.rewards || []).find((r) => r.world === world.id && r.chapter === index)?.source_ids || [];
    const logs = [...(window.state?.history || []), ...(window.state?.archivedHistory || [])];
    const body = document.createElement("div");
    body.className = "asc-stack";
    body.innerHTML = `<div class="av-mission-head">${badge(world, index, earned)}<p class="asc-small asc-muted">${earned ? "Balise allumée" : current ? "Étape en cours" : "À découvrir"}</p></div>
      <p>${esc(ch.story)}</p>
      <div class="av-practice"><p class="asc-eyebrow">Le repère à emporter</p><p>${esc(ch.practice)}</p></div>
      <p class="asc-small">Mission : ${ch.target} jour${ch.target > 1 ? "s" : ""} actif${ch.target > 1 ? "s" : ""}${p.route === "journal" ? " avec une note de séance" : ""}${ch.boss ? " et 150 minutes d’effort (90 max par jour)" : ""}. Insigne : <strong>${esc(ch.title)}</strong>.</p>
      ${ids.length ? `<div class="asc-stack-sm"><p class="asc-eyebrow">Séances qui ont compté</p><div class="asc-list">${ids
        .map((id) => {
          const l = logs.find((x) => String(x.id) === String(id) || x.client_event_id === id);
          return `<a class="asc-row" href="/journal?session=${encodeURIComponent(id)}"><span class="asc-row-main"><span class="asc-row-title">${l ? esc(SP().label(l.sport)) : "Séance"}</span><span class="asc-row-sub">${l ? esc(F().relativeDay(l.date)) : "Ouvrir dans le journal"}</span></span>${icon("chevron")}</a>`;
        })
        .join("")}</div></div>` : ""}`;
    window.titanShell.sheet({ title: ch.name, eyebrow: `${world.name} · chapitre ${index}`, body });
  }

  let booted = false;
  function start() {
    root = document.getElementById("aventure");
    if (!root || !window.state?.user || !window.TitanAdventure || !window.TitanCodex) return;
    if (!booted) {
      booted = true;
      SP()?.ensure?.();
      root.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.dataset.world) {
          selected = b.dataset.world;
          history.replaceState(null, "", `/adventure?world=${selected}`);
          render();
          root.querySelector(`[data-world="${selected}"]`)?.focus();
          return;
        }
        if (b.hasAttribute("data-retry")) return A().refresh({ force: true });
        if (b.hasAttribute("data-start")) return mutate("start", { world: selected, route: root.querySelector("[name=route]:checked")?.value || "rhythm" });
        if (b.dataset.claim) return mutate("claim", { world: selected, chapter: Number(b.dataset.claim) });
        if (b.dataset.chapter) return openChapter(Number(b.dataset.chapter));
      });
      A().refresh?.();
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
  ["titan:adventure-updated", "titan:history-updated"].forEach((ev) => window.addEventListener(ev, queue));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
