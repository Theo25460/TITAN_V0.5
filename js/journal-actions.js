(function () {
  "use strict";
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const find = (id) =>
    [
      ...(window.state?.history || []),
      ...(window.state?.archivedHistory || []),
    ].find((l) => String(l.id) === id);
  function replace(row) {
    const log = {
      ...row,
      cat: row.category || row.cat,
      syncStatus: "confirmed",
    };
    window.state.history = (window.state.history || []).filter(
      (l) => l.id !== row.id,
    );
    window.state.archivedHistory = (window.state.archivedHistory || []).filter(
      (l) => l.id !== row.id,
    );
    (row.archived_at
      ? window.state.archivedHistory
      : window.state.history
    ).push(log);
    window.TitanQueue.saveHistory(window.state.user.id, [
      ...window.state.history,
      ...window.state.archivedHistory,
    ]).catch(() =>
      window.titanSetSyncStatus?.("error", "Cache hors ligne indisponible"),
    );
    window.saveState?.();
    window.dispatchEvent(new CustomEvent("titan:history-updated"));
  }
  function dialog(title, body, onSubmit) {
    const d = document.createElement("dialog");
    d.className = "tracking-dialog";
    d.innerHTML = `<form><h2>${esc(title)}</h2>${body}<p role="alert"></p><menu><button type="button" class="tracking-secondary" data-close>Annuler</button><button class="tracking-action" type="submit">Confirmer</button></menu></form>`;
    document.body.append(d);
    d.querySelector("[data-close]").onclick = () => d.close();
    d.addEventListener("close", () => d.remove());
    d.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      const button = d.querySelector("[type=submit]");
      button.disabled = true;
      try {
        await onSubmit(new FormData(e.target));
        d.close();
      } catch (error) {
        d.querySelector("[role=alert]").textContent = error.message.includes(
          "CONFLICT",
        )
          ? "Cette séance a changé sur un autre appareil. Actualise le journal."
          : error.message;
      } finally {
        button.disabled = false;
      }
    };
    d.showModal();
  }
  async function update(log, patch) {
    const requestOwner = window.state?.user?.id;
    if (String(window.state?.user?.id).startsWith("guest_")) {
      const row = {
        ...log,
        ...("val" in patch ? { val: patch.val } : {}),
        ...("date" in patch ? { date: patch.date } : {}),
        revision: (log.revision || 1) + 1,
        syncStatus: "local",
        details: { ...log.details },
      };
      if ("note" in patch) row.details.note = patch.note;
      if ("exercises" in patch) {
        row.details.exercises = patch.exercises.map((ex) => {
          const rows = window.TitanInsights.sets(ex);
          return {
            ...ex,
            setRows: rows,
            sets: rows.length,
            totalReps: rows.reduce((n, s) => n + s.reps, 0),
            volume: rows.reduce((n, s) => n + s.weight * s.reps, 0),
            weight: Math.max(0, ...rows.map((s) => s.weight)),
          };
        });
        const volume = row.details.exercises.reduce(
          (n, ex) => n + ex.volume,
          0,
        );
        row.val =
          volume ||
          row.details.exercises.reduce((n, ex) => n + ex.totalReps, 0);
        row.unit = volume ? "kg" : "reps";
        row.details.unitOverride = row.unit;
        row.details.val1 = row.val;
        delete row.details.summary;
      }
      if ("extras" in patch) {
        row.details.extras = { ...row.details.extras, ...patch.extras };
        delete row.details.summary;
      }
      if ("val" in patch) row.details.val1 = row.val;
      if ("date" in patch) row.details.performedAt = row.date;
      if ("val" in patch || "duration" in patch) delete row.details.summary;
      if ("duration" in patch) {
        row.details.duration = patch.duration;
        row.details.val2 = patch.duration;
        if (patch.duration === null && row.details.gpxStats) {
          row.details.gpxStats = { ...row.details.gpxStats };
          delete row.details.gpxStats.movingMinutes;
        }
      }
      if ("archived" in patch)
        row.archived_at = patch.archived ? new Date().toISOString() : null;
      await window.TitanQueue.saveGuestSession(window.state.user.id, row);
      if (window.state?.user?.id !== requestOwner) return;
      window.state.history = (window.state.history || []).filter(
        (l) => l.id !== row.id,
      );
      window.state.archivedHistory = (
        window.state.archivedHistory || []
      ).filter((l) => l.id !== row.id);
      (row.archived_at
        ? window.state.archivedHistory
        : window.state.history
      ).push(row);
      window.saveState?.();
      window.dispatchEvent(new CustomEvent("titan:history-updated"));
      return;
    }
    if (log.syncStatus && log.syncStatus !== "confirmed")
      throw new Error(
        "Synchronise cette séance avant de la modifier. Tes données restent conservées sur cet appareil.",
      );
    const { data, error } = await window.titanClient.rpc(
      "titan_update_training_session",
      { p_id: log.id, p_revision: log.revision || 1, p_patch: patch },
    );
    if (error) throw error;
    if (
      window.state?.user?.id !== requestOwner ||
      data?.user_id !== requestOwner
    )
      return;
    replace(data);
  }
  function setRow(exIndex, setIndex, set) {
    return `<div class="r-edit-set"><span>Série ${setIndex + 1}</span><label>kg<input name="ex.${exIndex}.set.${setIndex}.weight" type="number" min="0" max="1000" step="any" value="${Number(set.weight) || 0}" required></label><label>rép.<input name="ex.${exIndex}.set.${setIndex}.reps" type="number" min="1" max="500" step="1" value="${Number(set.reps) || 1}" required></label><label>RIR<input name="ex.${exIndex}.set.${setIndex}.rir" type="number" min="0" max="10" step="any" value="${set.rir === null || set.rir === undefined ? "" : Number(set.rir)}"></label><button type="button" class="r-remove-set" aria-label="Retirer cette série">×</button></div>`;
  }
  function exerciseFields(exercises) {
    return `<div class="r-set-editor">${exercises
      .map(
        (ex, i) =>
          `<fieldset data-edit-exercise="${i}"><legend>${esc(ex.name)}</legend><input type="hidden" name="ex.${i}.name" value="${esc(ex.name)}"><input type="hidden" name="ex.${i}.variant" value="${esc(ex.variant || "")}"><input type="hidden" name="ex.${i}.equipment" value="${esc(ex.equipment || "")}"><div class="r-edit-sets">${window.TitanInsights.sets(
            ex,
          )
            .map((s, j) => setRow(i, j, s))
            .join(
              "",
            )}</div><button class="tracking-secondary" type="button" data-add-edit-set>Ajouter une série</button></fieldset>`,
      )
      .join(
        "",
      )}<p class="tracking-status">Le volume est recalculé à partir des charges et répétitions. RIR facultatif : répétitions que tu estimais encore pouvoir faire.</p></div>`;
  }
  function editedExercises(data) {
    return [...data.keys()]
      .filter((k) => /^ex\.\d+\.name$/.test(k))
      .map((key) => {
        const prefix = key.slice(0, -4);
        const indexes = [...data.keys()]
          .filter((k) => k.startsWith(prefix + "set.") && k.endsWith(".weight"))
          .map((k) => k.slice(0, -6));
        return {
          name: data.get(key),
          variant: data.get(prefix + "variant"),
          equipment: data.get(prefix + "equipment"),
          setRows: indexes.map((k) => ({
            weight: Number(data.get(k + "weight")),
            reps: Number(data.get(k + "reps")),
            rir:
              data.get(k + "rir") === "" ? null : Number(data.get(k + "rir")),
          })),
        };
      });
  }
  document.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add-edit-set]");
    if (add) {
      const ex = add.closest("[data-edit-exercise]"),
        rows = ex.querySelector(".r-edit-sets");
      if (rows.children.length >= 30) return;
      const index = Number(ex.dataset.editExercise),
        next =
          Math.max(
            -1,
            ...[...rows.querySelectorAll('input[name$=".weight"]')].map((i) =>
              Number(i.name.split(".")[3]),
            ),
          ) + 1;
      rows.insertAdjacentHTML(
        "beforeend",
        setRow(index, next, { weight: 0, reps: 8, rir: null }),
      );
      rows.lastElementChild.querySelector("input")?.focus();
    }
    const remove = e.target.closest(".r-remove-set");
    if (remove) {
      const rows = remove.closest(".r-edit-sets");
      if (rows.children.length <= 1) return;
      remove.closest(".r-edit-set").remove();
      rows.querySelector("input")?.focus();
    }
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-session-action]");
    if (!b) return;
    const log = find(b.dataset.sessionId);
    if (!log) return;
    if (b.dataset.sessionAction === "duplicate") {
      sessionStorage.setItem(
        "titan_duplicate_session",
        JSON.stringify({ ownerId: window.state.user.id, log }),
      );
      location.href = `./training.html?sport=${encodeURIComponent(log.sport)}`;
      return;
    }
    if (
      b.dataset.sessionAction === "archive" ||
      b.dataset.sessionAction === "restore"
    ) {
      const archive = b.dataset.sessionAction === "archive";
      dialog(
        archive ? "Archiver cette séance ?" : "Restaurer cette séance ?",
        `<p>${archive ? "Elle sera retirée des statistiques et restera accessible dans les archives." : "Elle réapparaîtra dans ton journal et tes statistiques."}</p><p class="tracking-status">Les récompenses déjà obtenues restent inchangées. Aucune nouvelle récompense n’est attribuée.</p>`,
        () => update(log, { archived: archive }),
      );
      return;
    }
    const date = new Date(
      new Date(log.date).getTime() -
        new Date(log.date).getTimezoneOffset() * 60000,
    )
      .toISOString()
      .slice(0, 16);
    const measuredSets = Boolean(log.details?.exercises?.length);
    const climbing =
      /climb|escalade|bould/i.test(log.sport) ||
      Boolean(
        log.details?.extras?.grade_system ||
        log.details?.extras?.climbing_discipline,
      );
    const climbingKeys = [
      ["climbing_discipline", "Pratique (bloc, voie…)"],
      ["grade_system", "Système de cotation"],
      ["belay", "Assurage"],
      ["location", "Lieu ou contexte"],
      ["max_attempt", "Meilleure cotation tentée"],
      ["max_done", "Meilleure cotation réussie"],
      ["attempts", "Nombre d’essais"],
      ["successful_routes", "Nombre de réussites"],
    ];
    const climbingFields = climbing
      ? `<fieldset><legend>Repères d’escalade</legend>${climbingKeys.map(([key, label]) => {const value=log.details?.extras?.[key]??'';if(key==='grade_system'){const systems=[...new Set(['','Français voie','Fontainebleau bloc','V-scale bloc',value])];return `<label>${label}<select name="extra.${key}">${systems.map(system=>`<option value="${esc(system)}" ${system===value?'selected':''}>${esc(system||'Non renseigné')}</option>`).join('')}</select></label>`;}return `<label>${label}<input name="extra.${key}" value="${esc(value)}" ${["attempts", "successful_routes"].includes(key) ? 'type="number" min="0" max="200" step="1"' : 'maxlength="120"'}></label>`;}).join("")}<p class="tracking-status">Garde le même système et le même contexte pour comparer les séances. Un champ vide reste une donnée absente.</p></fieldset>`
      : "";
    dialog(
      "Modifier la séance",
      `<label>Date et heure<input name="date" type="datetime-local" value="${date}" required></label>${measuredSets ? exerciseFields(log.details.exercises) : `<label>Valeur (${esc(log.unit)})<input name="val" type="number" step="any" min="0.01" max="300000" value="${Number(log.val)}" required></label>`}${climbingFields}<label>Durée (min)<input name="duration" type="number" min="1" max="1440" step="any" value="${window.TitanTraining.duration(log) || ""}" ${["min", "h"].includes(log.unit) ? "readonly" : ""}></label><label>Note<textarea name="note" maxlength="2000">${esc(log.details?.note || log.details?.notes || "")}</textarea></label><p class="tracking-status">Les statistiques sont recalculées à partir des mesures corrigées. Les récompenses restent celles de la séance initiale.</p>`,
      (data) => {
        const patch = {
          date: new Date(data.get("date")).toISOString(),
          note: data.get("note"),
        };
        if (!measuredSets) patch.val = Number(data.get("val"));
        else patch.exercises = editedExercises(data);
        if (climbing)
          patch.extras = Object.fromEntries(
            climbingKeys.map(([key]) => {
              const value = String(data.get("extra." + key) || "").trim();
              return [
                key,
                value === ""
                  ? null
                  : ["attempts", "successful_routes"].includes(key)
                    ? Number(value)
                    : value,
              ];
            }),
          );
        if (log.unit === "min") patch.duration = patch.val ?? Number(log.val);
        else if (log.unit === "h")
          patch.duration = (patch.val ?? Number(log.val)) * 60;
        else if (data.get("duration"))
          patch.duration = Number(data.get("duration"));
        else patch.duration = null;
        return update(log, patch);
      },
    );
  });
  window.addEventListener("titan:history-updated", () =>
    window.bootActivityJournal?.(),
  );
})();
