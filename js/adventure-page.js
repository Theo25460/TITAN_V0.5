(function () {
  "use strict";
  const R = window.TitanRenaissance,
    C = window.TitanCodex,
    A = window.TitanAdventure;
  let selected = new URLSearchParams(location.search).get("world"),
    busy = false;
  const coordinates = [
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
  function render() {
    const host = document.getElementById("adventure-content"),
      s = A.snapshot;
    if (!host) return;
    if (!s) {
      host.innerHTML = `<div class="r-panel"><h2>${A.status === "error" ? "Ta progression est temporairement indisponible." : "Ton univers se prépare…"}</h2><p>Les séances et leurs données restent dans ton journal.</p>${A.status === "error" ? '<button class="r-button" id="retry-adventure">Réessayer</button>' : ""}</div>`;
      document
        .getElementById("retry-adventure")
        ?.addEventListener("click", () => A.refresh({ force: true }));
      return;
    }
    const world =
      C.worlds.find((w) => w.id === (selected || s.selected_world)) ||
      C.worlds[0];
    selected = world.id;
    const p = s.campaigns.find((c) => c.id === world.id),
      chapter = world.chapters[Math.max(0, p.chapter - 1)],
      locked = world.tier === "plus" && !s.plus;
    host.innerHTML = `<div class="r-world-picker" aria-label="Choisir une région">${C.worlds
      .map((w) => {
        const progress = s.campaigns.find((c) => c.id === w.id);
        return `<button class="r-world-card ${w.id === world.id ? "selected" : ""}" data-world="${w.id}" aria-pressed="${w.id === world.id}" style="--world-color:${w.color}"><img src="/assets/renaissance/${w.image}-small.webp" alt="" width="800" height="450" loading="lazy"><span class="r-world-card-copy"><small>${w.tier === "free" ? "GRATUIT" : "TITAN+"} · ${Math.max(0, (progress?.chapter || 1) - 1)}/9</small><strong>${R.esc(w.name)}</strong><span>${R.esc(w.subtitle)}</span></span></button>`;
      })
      .join("")}</div>
   <div class="r-adventure-heading"><div>${R.status(s)}<h2>${R.esc(world.name)}</h2><p>${R.esc(p.chapter === 10 ? world.ending : world.intro)}</p></div><div class="r-region-completion">${R.chapterBadge(world, 9, p.chapter === 10)}<span>${Math.max(0, (p.chapter || 1) - 1)} / 9<small>étapes accomplies</small></span></div></div>
   <div class="r-expedition-grid"><section class="r-world-map" aria-label="Carte des neuf étapes de ${R.esc(world.name)}"><img class="r-map-landscape" srcset="/assets/renaissance/${world.image}-small.webp 800w, /assets/renaissance/${world.image}.webp 1600w" sizes="(max-width:700px) 100vw,70vw" src="/assets/renaissance/${world.image}.webp" alt="" width="1600" height="900"><svg class="r-map-trail" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M12 78 Q17 62 28 68 T41 81 Q43 55 54 61 T72 70 Q94 63 86 47 T68 35 Q29 36 43 26 T57 11"/></svg>${world.chapters
     .map((ch, i) => {
       const earned = p.chapter > ch.index,
         active = (p.chapter || 1) === ch.index;
       return `<button class="r-map-node ${earned ? "earned" : ""} ${active ? "active" : ""}" data-chapter="${ch.index}" style="left:${coordinates[i][0]}%;top:${coordinates[i][1]}%" aria-label="Étape ${ch.index} : ${R.esc(ch.name)}. ${earned ? "Accomplie" : active ? "Étape actuelle" : "À découvrir"}"><span>${earned ? R.icon("check") : ch.boss ? R.icon("crown") : String(ch.index).padStart(2, "0")}</span>${active ? "<small>TON PROCHAIN PAS</small>" : ""}</button>`;
     })
     .join(
       "",
     )}<div class="r-map-caption">${R.icon("compass")} Choisis une balise pour découvrir son histoire.</div></section>
   <aside class="r-panel r-expedition-detail">${locked ? `<span class="r-eyebrow">CAMPAGNE TITAN+</span><h2>Un nouvel horizon</h2><p>${R.esc(world.intro)}</p><p>9 chapitres et 9 insignes cosmétiques. Les mêmes règles de progression, sans bonus de puissance.</p><a class="r-button primary" href="/boutique">Découvrir TITAN+</a><button class="r-button subtle" data-world="aube">Revenir à l’Aube</button>` : p.chapter === 10 ? `<span class="r-eyebrow">CAMPAGNE ACCOMPLIE</span>${R.chapterBadge(world, 9, true)}<h2>${R.esc(world.guardian)}</h2><p>${R.esc(world.ending)}</p><a class="r-button primary" href="/personnage">Voir ma collection</a>` : `<span class="r-eyebrow">ÉTAPE ${chapter.index} / 9 ${chapter.boss ? "· LE GARDIEN" : ""}</span><h2>${R.esc(chapter.name)}</h2><p>${R.esc(chapter.story)}</p><div class="r-practice"><span>${R.icon("journal")} Le repère à emporter</span><p>${R.esc(chapter.practice)}</p></div>${p.chapter ? `<div class="r-mission-track"><progress value="${Math.min(p.target, p.evidence.days)}" max="${p.target}" aria-label="${p.evidence.days} jours sur ${p.target}"></progress><strong>${Math.min(p.target, p.evidence.days)} / ${p.target}</strong></div><p class="r-small">${p.route === "journal" ? "Jours avec une séance annotée (10 caractères minimum)." : "Jours avec une séance confirmée."} Depuis le début de cette étape, un seul apport par jour. Aucune échéance.</p><button class="r-button ${p.evidence.days >= p.target ? "primary" : "subtle"}" data-chapter="${chapter.index}">${p.evidence.days >= p.target ? "Ouvrir la récompense" : "Voir la mission"} ${R.icon("arrow")}</button>` : `<fieldset class="r-route-choice"><legend>Choisis ton chemin</legend>${C.routes.map((r, i) => `<label><input type="radio" name="adventure-route" value="${r.id}" ${i === 0 ? "checked" : ""}><span><strong>${r.name}</strong><small>${r.description}</small></span></label>`).join("")}</fieldset><button class="r-button primary" id="start-campaign">Commencer la campagne ${R.icon("arrow")}</button>`}<p class="r-reward-preview">${R.icon("medal")} Insigne à gagner : <strong>${R.esc(chapter.title)}</strong></p>`}<p class="r-error" id="adventure-error" role="status"></p></aside></div>
   <section class="r-guardian-card r-block"><img src="/assets/renaissance/guardian-${world.id}.webp" alt="${R.esc(world.guardian)}" width="640" height="640" loading="lazy"><div><span class="r-eyebrow">LE GARDIEN DE CETTE RÉGION</span><h2>${R.esc(world.guardian)}</h2><p>${p.chapter === 10 ? R.esc(world.ending) : `Au bout du chemin, ${R.esc(world.guardian.toLocaleLowerCase("fr-FR"))} attend ton dernier chapitre. Chaque journée de pratique éclaire un peu plus la route.`}</p><button class="r-button subtle" data-chapter="9">${p.chapter === 10 ? "Revoir le dernier chapitre" : "Découvrir la rencontre"} ${R.icon("arrow")}</button></div></section><section class="r-block"><div class="r-section-head"><h2>Ton carnet d’expédition</h2><a href="/personnage">Collection ${R.icon("arrow")}</a></div><div class="r-chapter-list">${world.chapters.map((ch) => `<button data-chapter="${ch.index}" class="r-chapter-row ${p.chapter > ch.index ? "earned" : ""}">${R.chapterBadge(world, ch.index, p.chapter > ch.index)}<span><small>ÉTAPE ${ch.index} ${ch.boss ? "· GARDIEN" : ""}</small><strong>${R.esc(ch.name)}</strong><span>${R.esc(ch.title)}</span></span>${R.icon(p.chapter > ch.index ? "check" : "arrow")}</button>`).join("")}</div></section>
   <details class="r-panel r-block r-rules"><summary>Comprendre les règles de l’aventure</summary><p>Chaque étape commence lorsque tu démarres la campagne ou récupères la récompense précédente. Une séance peut contribuer si elle a été enregistrée après ce départ et pratiquée au plus tôt ce jour-là, dans le fuseau choisi au démarrage. Les séances archivées, signalées ou refusées ne comptent pas.</p><p>Une journée compte une seule fois, quel que soit le nombre ou le volume de séances. La voie Observation demande une note personnelle d’au moins 10 caractères. Le texte de conseil est une piste pratique ; cocher une action ne suffit jamais à valider la mission.</p><p>Les insignes gagnés restent dans la collection après une correction ou un archivage. Ils ne donnent ni XP ni crédits supplémentaires. Les XP, niveaux et crédits sportifs conservent leurs règles et plafonds habituels. Une pause n’enlève aucun niveau.</p><p>En découverte, les campagnes gratuites se jouent localement. Cette progression est distincte de celle d’un compte synchronisé. Les séances manuelles et importées décrivent tes déclarations ; elles ne certifient pas une performance.</p></details>`;
    host.querySelectorAll("[data-world]").forEach((b) =>
      b.addEventListener("click", () => {
        selected = b.dataset.world;
        render();
        document.querySelector(`[data-world="${selected}"]`)?.focus();
      }),
    );
    host
      .querySelectorAll("[data-chapter]")
      .forEach((b) =>
        b.addEventListener("click", () =>
          openChapter(world, Number(b.dataset.chapter)),
        ),
      );
    document
      .getElementById("start-campaign")
      ?.addEventListener("click", () =>
        mutate("start", {
          world: world.id,
          route:
            document.querySelector('[name="adventure-route"]:checked')?.value ||
            "rhythm",
        }),
      );
  }
  async function mutate(action, params) {
    if (busy) return;
    busy = true;
    document
      .querySelectorAll("#start-campaign,#claim-chapter")
      .forEach((b) => (b.disabled = true));
    try {
      await A.action(action, params);
      document.getElementById("chapter-dialog")?.close();
      render();
      document
        .querySelector(`[data-chapter="${params.chapter || 1}"]`)
        ?.focus();
    } catch (e) {
      const el =
        document.getElementById("chapter-error") ||
        document.getElementById("adventure-error");
      if (el) el.textContent = A.message(e);
      if (e.message === "ADVENTURE_CONFLICT") await A.refresh({ force: true });
    } finally {
      busy = false;
      document
        .querySelectorAll("#start-campaign,#claim-chapter")
        .forEach((b) => (b.disabled = false));
    }
  }
  function openChapter(world, index) {
    document.getElementById("chapter-dialog")?.remove();
    const ch = world.chapters[index - 1],
      s = A.snapshot,
      p = s.campaigns.find((c) => c.id === world.id),
      earned = p.chapter > index,
      current = p.chapter === index,
      locked = world.tier === "plus" && !s.plus;
    const dialog = document.createElement("dialog");
    dialog.id = "chapter-dialog";
    dialog.className = "r-dialog";
    dialog.setAttribute("aria-labelledby", "chapter-title");
    dialog.innerHTML = `<button class="r-close" aria-label="Fermer">${R.icon("close")}</button><span class="r-eyebrow">${R.esc(world.name)} · ÉTAPE ${index}</span>${R.chapterBadge(world, index, earned || current)}${ch.boss ? `<img class="r-chapter-guardian" src="/assets/renaissance/guardian-${world.id}.webp" alt="${R.esc(world.guardian)}" width="640" height="640">` : ""}<h2 id="chapter-title">${R.esc(ch.name)}</h2><p>${R.esc(ch.story)}</p><div class="r-practice"><span>${R.icon("journal")} Le repère à emporter</span><p>${R.esc(ch.practice)}</p></div><p>${earned ? "Insigne obtenu :" : `Objectif : ${ch.target} jours de pratique${p.route === "journal" ? " avec une note de séance" : ""}. Récompense :`} <strong>${R.esc(ch.title)}</strong>.</p>${current && p.evidence.source_ids.length ? `<details class="r-evidence"><summary>${p.evidence.source_ids.length} journée(s) contributrice(s)</summary>${p.evidence.source_ids.map((id, i) => `<a href="/journal?session=${encodeURIComponent(id)}">Voir la séance ${i + 1} ${R.icon("arrow")}</a>`).join("")}</details>` : ""}<p id="chapter-error" class="r-error" role="status"></p><div class="r-dialog-actions">${current && !locked && p.evidence.days >= p.target ? `<button id="claim-chapter" class="r-button primary">Récupérer mon insigne ${R.icon("star")}</button>` : current && !locked ? '<a class="r-button primary" href="/training">Enregistrer une séance</a>' : locked ? '<a class="r-button primary" href="/boutique">Découvrir TITAN+</a>' : `<button class="r-button primary r-close-action">${earned ? "Continuer mon aventure" : "Revenir à la carte"}</button>`}<button class="r-button subtle r-close-action">Fermer</button></div>`;
    document.body.append(dialog);
    dialog
      .querySelectorAll(".r-close,.r-close-action")
      .forEach((b) => b.addEventListener("click", () => dialog.close()));
    dialog
      .querySelector("#claim-chapter")
      ?.addEventListener("click", () =>
        mutate("claim", { world: world.id, chapter: index }),
      );
    dialog.addEventListener("close", () => {
      dialog.remove();
      document.querySelector(`[data-chapter="${index}"]`)?.focus();
    });
    dialog.showModal();
  }
  window.addEventListener("titan:adventure-updated", render);
  document.addEventListener("DOMContentLoaded", render);
  render();
})();
