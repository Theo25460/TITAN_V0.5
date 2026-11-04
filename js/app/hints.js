/* TITAN — contextual hints (UX08). A short note on the few screens where the action is not obvious, shown on the first visits only,
   dismissible for good, remembered on this device. Nothing is sent anywhere; text only. */
(function () {
  "use strict";
  const MAX_VISITS = 3;
  const HINTS = {
    "/records": ["records", "Un record compte seulement s’il bat ta marque précédente, pour le même sport et la même mesure. Chaque record garde la séance qui l’a établi."],
    "/objectifs": ["goals", "Choisis ce que tu veux mesurer (séances, jours actifs, minutes ou kilomètres), une période et une cible : TITAN te montre où tu en es et si ton rythme y mène."],
    "/prevoir": ["planner", "Place tes séances types sur ta semaine ; le QG te rappelle celles du jour. Rien n’est obligatoire : sauter une séance ne coûte rien."],
    "/stats": ["week", "Le récap compare ta semaine à tes semaines habituelles. Chaque réponse de « Tes questions » dit sur quelles séances elle repose."],
    "/journal": ["journal", "Touche une séance pour la voir en détail, la corriger ou l’archiver. Une séance archivée sort de tes statistiques."],
  };
  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* the hint may show again: harmless */ } };

  function show() {
    const path = location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
    const entry = HINTS[path];
    const main = document.getElementById("contenu");
    if (!entry || !main || main.querySelector("[data-hint]")) return;
    const [id, text] = entry;
    if (get(`titan.hint.${id}.done`)) return;
    const visits = Number(get(`titan.hint.${id}.visits`)) || 0;
    if (visits >= MAX_VISITS) return;
    set(`titan.hint.${id}.visits`, String(visits + 1));
    const note = document.createElement("aside");
    note.className = "asc-note asc-hint";
    note.setAttribute("role", "note");
    note.setAttribute("data-hint", id);
    const p = document.createElement("p");
    p.textContent = text;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "asc-btn asc-btn-secondary asc-btn-sm";
    button.textContent = "Compris";
    button.addEventListener("click", () => { set(`titan.hint.${id}.done`, "1"); note.remove(); });
    note.append(p, button);
    const anchor = main.querySelector("[data-subnav]") || main.querySelector(".asc-page-head");
    if (anchor) anchor.after(note); else main.prepend(note);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show);
  else show();
})();
