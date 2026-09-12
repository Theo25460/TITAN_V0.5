(function () {
  "use strict";
  const key = () =>
    `titan_training_draft_${window.state?.user?.id || "unassigned"}`;
  const form = document.getElementById("training-form");
  let restored = false;
  function restore() {
    if (restored || !window.state?.user) return;
    restored = true;
    let draft;
    try {
      const duplicate = JSON.parse(
        sessionStorage.getItem("titan_duplicate_session") || "null",
      );
      if (duplicate?.ownerId === window.state.user.id) {
        const l = duplicate.log;
        draft = {
          sport: l.sport,
          fields: {
            "val-1":
              ["min", "h"].includes(l.unit) &&
              window.SPORTS_CONFIG?.[l.sport]?.unit !== l.unit
                ? ""
                : l.val,
            "val-2": window.TitanTraining.duration(l) || "",
            "session-note": l.details?.note || "",
          },
          exercises: l.details?.exercises || [],
          extras: l.details?.extras || {},
        };
        sessionStorage.removeItem("titan_duplicate_session");
      } else draft = JSON.parse(localStorage.getItem(key()) || "null");
    } catch (_) {
      return;
    }
    if (!draft?.sport) return;
    if (draft.sport && window.SPORTS_CONFIG?.[draft.sport])
      selectSportByKey(draft.sport);
    for (const [id, val] of Object.entries(draft.fields || {})) {
      const field = document.getElementById(id);
      if (field && field.type !== "file")
        field.type === "checkbox"
          ? (field.checked = Boolean(val))
          : (field.value = val);
    }
    for (const [id, val] of Object.entries(draft.extras || {})) {
      const field = document.getElementById("extra-" + id);
      if (field) field.value = val;
    }
    if (draft.exercises?.length && typeof gymSession !== "undefined") {
      gymSession = draft.exercises;
      renderGymList();
    }
    const status = document.getElementById("session-save-status");
    if (status)
      status.textContent =
        "Brouillon restauré. Vérifie la date et les mesures avant d’enregistrer.";
  }
  function saveDraft() {
    if (!window.state?.user || !restored) return;
    const fields = {};
    form.querySelectorAll("input[id],select[id],textarea[id]").forEach((el) => {
      if (el.type !== "file" && el.id !== "sport-search")
        fields[el.id] = el.type === "checkbox" ? el.checked : el.value;
    });
    try {
      localStorage.setItem(
        key(),
        JSON.stringify({
          sport: document.getElementById("sport-key").value,
          fields,
          exercises: typeof gymSession !== "undefined" ? gymSession : [],
        }),
      );
    } catch (_) {
      document.getElementById("session-save-status").textContent =
        "Brouillon non sauvegardé : stockage plein. Garde cette page ouverte.";
    }
  }
  form.addEventListener("input", saveDraft);
  window.addEventListener("titan:draft-change", saveDraft);
  window.addEventListener("titan:session-stored", () =>
    localStorage.removeItem(key()),
  );
  window.addEventListener("titan:catalog-ready", restore);
  window.addEventListener("DOMContentLoaded", () => setTimeout(restore, 350));
})();
