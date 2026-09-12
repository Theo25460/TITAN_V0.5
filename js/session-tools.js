(function () {
  "use strict";
  const clock = document.getElementById("session-timer-clock");
  if (!clock) return;
  const toggle = document.getElementById("session-timer-toggle"),
    status = document.getElementById("session-timer-status");
  const key = () =>
    `titan_session_timer_${window.state?.user?.id || "unassigned"}`;
  let ownerKey = "",
    timer = { elapsed: 0, started: null };
  const elapsed = () =>
    timer.elapsed +
    (timer.started ? Math.max(0, Date.now() - timer.started) : 0);
  function save() {
    try {
      localStorage.setItem(key(), JSON.stringify(timer));
    } catch (_) {
      status.textContent =
        "Le chronomètre reste actif sur cette page ; le stockage est indisponible.";
    }
  }
  function render() {
    if (ownerKey !== key()) {
      ownerKey = key();
      try {
        timer = JSON.parse(localStorage.getItem(ownerKey) || "null") || {
          elapsed: 0,
          started: null,
        };
      } catch (_) {
        timer = { elapsed: 0, started: null };
      }
    }
    const sec = Math.floor(elapsed() / 1000);
    clock.textContent = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
    toggle.textContent = timer.started
      ? "Pause"
      : timer.elapsed
        ? "Reprendre"
        : "Démarrer";
  }
  toggle.addEventListener("click", () => {
    render();
    if (timer.started) {
      timer.elapsed = elapsed();
      timer.started = null;
    } else timer.started = Date.now();
    save();
    render();
  });
  document
    .getElementById("session-timer-reset")
    .addEventListener("click", () => {
      timer = { elapsed: 0, started: null };
      save();
      render();
      status.textContent = "Chronomètre remis à zéro.";
    });
  document
    .getElementById("session-timer-apply")
    .addEventListener("click", () => {
      const conf =
        window.SPORTS_CONFIG?.[document.getElementById("sport-key").value];
      const input =
        document.getElementById("val-2") ||
        (conf?.unit === "min" ||
        /climbing|escalade/i.test(`${conf?.balanceProfile} ${conf?.label}`)
          ? document.getElementById("val-1")
          : null);
      if (!input) {
        status.textContent =
          "Choisis un sport avec une durée pour reporter le temps.";
        return;
      }
      if (elapsed() < 1000) {
        status.textContent =
          "Démarre le chronomètre avant de reporter une durée.";
        return;
      }
      input.value = String(
        Math.min(1440, Math.max(1, Math.round(elapsed() / 60000))),
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
      status.textContent = `${input.value} min reportée(s). Vérifie la durée avant d’enregistrer.`;
    });
  render();
  const interval = setInterval(render, 1000);
  window.addEventListener("pagehide", () => clearInterval(interval), {
    once: true,
  });
})();
