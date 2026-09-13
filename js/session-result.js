(function () {
  "use strict";
  const R = window.TitanRenaissance,
    A = window.TitanAdventure;
  let current = null,
    dialog = null;
  function render() {
    if (!current || !dialog?.open) return;
    if (window.state?.user?.id !== current.owner) {
      dialog.close();
      return;
    }
    const log =
      (window.state.history || []).find(
        (l) =>
          (l.client_event_id || l.details?.client_event_id || l.id) ===
          current.event,
      ) || current.log;
    const guest = String(current.owner).startsWith("guest_"),
      confirmed =
        log.syncStatus === "confirmed" || log.details?.serverReward === true;
    const reward =
        typeof log.details?.serverReward === "object"
          ? log.details.serverReward
          : null,
      s = A.snapshot,
      mission = R.current(s),
      p = mission.progress;
    const duration = window.TitanTraining.duration(log),
      records = window.TitanInsights.records(window.state.history).filter(
        (r) => String(r.log.id) === String(log.id),
      );
    const ready = confirmed || guest;
    dialog.querySelector("#result-body").innerHTML =
      `<div class="r-result-banner"><img src="/assets/renaissance/valley-small.webp" alt="" width="800" height="450"><span class="r-eyebrow">UN EFFORT DE PLUS DANS TON HISTOIRE</span></div><div class="r-result-content"><span class="r-chip">${guest ? "Découverte · enregistrée sur cet appareil" : confirmed ? "Séance confirmée" : "Séance conservée · confirmation en cours"}</span><h2 id="result-title">${reward?.leveled_up > 0 ? `Bienvenue au niveau ${reward.level_after}.` : "Une séance de plus dans ton histoire."}</h2><p>${R.esc(R.sport(log.sport))} · ${new Date(log.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</p><div class="r-result-metrics"><article><span>${log.unit === "kg" ? "Volume enregistré" : "Mesure enregistrée"}</span><strong>${R.fmt(log.val)}<small>${R.esc(log.unit)}</small></strong></article><article><span>Durée</span><strong>${duration !== null ? R.fmt(duration) : "—"}<small>${duration !== null ? "min" : "non renseignée"}</small></strong></article><article><span>${guest ? "Niveau de découverte" : "XP de la séance"}</span><strong>${guest ? s?.level || 1 : confirmed ? "+" + R.fmt(log.xp) : "…"}<small>${guest ? "simulation locale" : confirmed ? "XP confirmée" : "à confirmer"}</small></strong></article></div>${
        records.length
          ? `<div class="r-result-records">${R.icon("trophy")}<div><strong>${records.length === 1 ? "Un repère dans ton parcours" : `${records.length} repères dans ton parcours`}</strong><p>${records
              .slice(0, 3)
              .map((r) => R.esc(r.label))
              .join(
                " · ",
              )}. Consulte les critères et la séance source dans tes records.</p></div></div>`
          : ""
      }
  <section class="r-result-adventure"><div>${R.chapterBadge(mission.world, mission.chapter?.index || 9, true)}</div><div><span class="r-eyebrow">L’AVENTURE</span><h3>${R.esc(mission.chapter?.name || mission.world.name)}</h3><p>${p?.chapter === 10 ? "Cette campagne est accomplie. Un nouvel horizon t’attend." : !p?.chapter ? "Ta première campagne attend son départ. Choisis ton chemin pour activer une mission." : ready ? `${Math.min(p.target, p.evidence.days)} / ${p.target} jours pour cette étape. ${p.evidence.days >= p.target ? "Ta récompense est prête." : "Un seul apport par jour ; toutes tes séances restent dans le journal."}` : "La mission sera actualisée après confirmation de ta séance."}</p></div></section><p class="r-small">${guest ? "En découverte, le niveau est calculé localement pour explorer le jeu. Il ne remplace pas la progression d’un compte." : confirmed ? "Les XP affichées viennent de la réponse du serveur. Les quêtes donnent des récompenses cosmétiques." : "Tu peux fermer cet écran : la séance reste conservée sur cet appareil et sera synchronisée quand la connexion le permettra."}</p><div class="r-dialog-actions"><a class="r-button primary" href="/adventure">${p?.evidence?.days >= p?.target && p?.chapter > 0 ? "Ouvrir ma récompense" : "Voir mon aventure"} ${R.icon("arrow")}</a><a class="r-button subtle" href="/journal?session=${encodeURIComponent(log.id)}">Voir ma séance</a><button type="button" class="r-button subtle" data-result-close>Continuer</button></div></div>`;
    dialog.querySelector("[data-result-close]").onclick = () => dialog.close();
  }
  window.TitanSessionResult = {
    open(log) {
      dialog?.close();
      current = {
        event: log.client_event_id || log.id,
        owner: window.state.user.id,
        log,
      };
      dialog = document.createElement("dialog");
      const created = dialog;
      dialog.className = "r-dialog r-result-dialog";
      dialog.setAttribute("aria-labelledby", "result-title");
      dialog.innerHTML = `<button type="button" class="r-close" aria-label="Fermer le résultat de séance">${R.icon("close")}</button><div id="result-body"></div>`;
      document.body.append(dialog);
      dialog.querySelector(".r-close").onclick = () => created.close();
      dialog.addEventListener("close", () => {
        created.remove();
        if (dialog === created) {
          dialog = null;
          current = null;
          document.getElementById("sport-search")?.focus();
        }
      });
      dialog.showModal();
      render();
      A.refresh({ force: true });
    },
  };
  window.addEventListener("titan:history-updated", render);
  window.addEventListener("titan:adventure-updated", render);
})();
