(function () {
  "use strict";
  const esc = window.titanEscapeText;
  function modal(title, content, onSubmit) {
    const d = document.createElement("dialog");
    d.className = "tracking-dialog";
    d.innerHTML = `<form><h2>${title}</h2>${content}<p role="alert"></p><menu><button type="button" class="tracking-secondary" data-cancel>Annuler</button><button class="tracking-action" type="submit">Confirmer</button></menu></form>`;
    document.body.append(d);
    d.querySelector("[data-cancel]").onclick = () => d.close();
    d.onclose = () => d.remove();
    d.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      try {
        onSubmit(new FormData(e.target));
        d.close();
      } catch (error) {
        d.querySelector("[role=alert]").textContent = error.message;
      }
    };
    d.showModal();
  }
  window.saveGymRoutine = function () {
    if (!gymSession.length)
      return window.showNotification?.(
        "info",
        "Ta bibliothèque",
        "Ajoute au moins un exercice avant de mémoriser une routine.",
      );
    const routines = window.state.user.gymRoutines || [],
      limit = window.titanIsElite() ? 20 : 5;
    modal(
      "Mémoriser cette routine",
      `<label for="routine-name">Nom de la routine<input id="routine-name" name="name" required maxlength="60" placeholder="Ex. Haut du corps · séance A"></label><p class="tracking-status">${routines.length}/${limit} routines. Un nom existant remplace la routine correspondante. Gratuit : 5 routines · TITAN+ : 20.</p>`,
      (data) => {
        const name = String(data.get("name")).trim();
        if (!name) throw new Error("Donne un nom à ta routine.");
        const existing = routines.find(
          (r) =>
            r.label.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr"),
        );
        if (!existing && routines.length >= limit)
          throw new Error(
            `Ta bibliothèque contient déjà ${limit} routines. Utilise le nom d’une routine à remplacer.`,
          );
        window.state.user.gymRoutines = [
          {
            id: existing?.id || crypto.randomUUID(),
            label: name,
            exercises: JSON.parse(JSON.stringify(gymSession)),
          },
          ...routines.filter((r) => r !== existing),
        ];
        window.saveState?.();
        window.showNotification?.("success", "Routine mémorisée", name);
      },
    );
  };
  window.loadGymRoutine = function () {
    const routines = window.state?.user?.gymRoutines || [];
    if (!routines.length)
      return window.showNotification?.(
        "info",
        "Ta bibliothèque",
        "Mémorise ta première routine depuis une séance de musculation.",
      );
    modal(
      "Choisir une routine",
      `<label for="routine-choice">Ta bibliothèque<select id="routine-choice" name="routine">${routines.map((r, i) => `<option value="${i}">${esc(r.label)} · ${r.exercises.length} exercices</option>`).join("")}</select></label><p class="tracking-status">Les exercices de cette routine remplaceront ceux du formulaire. Les séances déjà enregistrées restent dans ton journal.</p>`,
      (data) => {
        gymSession = JSON.parse(
          JSON.stringify(routines[Number(data.get("routine"))].exercises),
        );
        gymSession.forEach(recalculateGymExercise);
        renderGymList();
        updateRewardPreview();
        document
          .getElementById("training-form")
          .dispatchEvent(new Event("input", { bubbles: true }));
      },
    );
  };
})();
