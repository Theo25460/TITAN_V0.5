/* « Depuis ta dernière visite » (social lot D). Shared unchanged by the website and the Android app (mobile/scripts/sync-web-core.mjs).
   Pure: words the server digest (public.titan_social_digest_v1) as a few lines, each with where it leads. Rules of the wording:
   only what happened (never what did not), friends named only when the server named them, no counter of missed days, no urgency,
   nothing when nothing happened. A rest is never mentioned. */
(function (root) {
  "use strict";
  const Cordee = () => root.TitanCordee || (typeof require === "function" ? require("./cordee.js") : null);
  const int = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  const names = (list, max = 2) => {
    const l = (list || []).filter((x) => typeof x === "string" && x.trim());
    if (!l.length) return "";
    if (l.length <= max) return l.join(" et ");
    return `${l.slice(0, max).join(", ")} et ${plural(l.length - max, "autre ami", "autres amis")}`;
  };
  const daysAgo = (iso, now) => Math.max(0, Math.round((now - new Date(iso).getTime()) / 86400000));

  /** Lines for a digest: [{ id, text, href, kind: "celebrate" | "circle" | "together" | "memory" | "suggest" }]. Empty when nothing happened. */
  function lines(d, now = Date.now()) {
    if (!d || typeof d !== "object") return [];
    const C = Cordee();
    const out = [];
    for (const c of d.cordees || []) {
      const route = C?.ROUTES?.[c.route];
      if (!route) continue;
      if (c.summitedSince && c.earned) out.push({ id: `summit-${c.id}`, kind: "celebrate", href: "#cordee", text: `Sommet atteint : ${route.name}. Le titre « ${route.title} » t’attend.` });
      // V1.8.3: a cordée that follows a finished one, started by the group without me yet: the answer it waits for.
      else if (c.status === "active" && c.myStatus === "invited" && C?.ROUTES?.[c.follows]) out.push({ id: `cordee-invite-${c.id}`, kind: "together", href: "#cordee", text: `Ton groupe de « ${C.ROUTES[c.follows].name} » est reparti sur « ${route.name} », compteurs à zéro. Tu peux t’encorder ou décliner.` });
      else if (c.status === "active" && c.myStatus === "invited") out.push({ id: `cordee-invite-${c.id}`, kind: "together", href: "#cordee", text: `On t’attend dans la cordée « ${route.name} ». Tu peux t’encorder ou décliner.` });
      else if (c.status === "active") out.push({ id: `cordee-${c.id}`, kind: "together", href: "#cordee", text: `${route.name} : ${plural(int(c.camps), "camp atteint", "camps atteints")} sur 4, ${int(c.percent)} % de l’objectif commun${int(c.mine) ? ` — ta part : ${plural(int(c.mine), "longueur", "longueurs")}` : ""}.` });
    }
    // V1.8.3: a finished cordée whose group proposes to set off again. Only an answer that is waiting (never a reminder to someone who
    // already declined) and the state of my own proposal; a started one is the invitation above.
    for (const s of d.suites || []) {
      const from = C?.ROUTES?.[s.route];
      if (!from) continue;
      const list = (s.proposals || []).filter((p) => p && C.ROUTES[p.route]);
      const waiting = list.filter((p) => p.status === "open" && !p.mine && !p.myAnswer && (p.turn || []).includes("accept"));
      if (waiting.length >= 2) out.push({ id: `suite-choice-${s.id}`, kind: "together", href: "#cordee", text: `Ta cordée de « ${from.name} » propose ${plural(waiting.length, "itinéraire", "itinéraires")} pour repartir : choisis celui qui te va, ou aucun.` });
      else if (waiting.length === 1) out.push({ id: `suite-${waiting[0].id}`, kind: "together", href: "#cordee", text: `${waiting[0].by && waiting[0].by !== "Membre de la cordée" ? waiting[0].by : "Un membre"} propose à ta cordée de « ${from.name} » de repartir sur ${C.itinerary(waiting[0])}. Accepte ou décline quand tu veux.` });
      for (const p of list.filter((x) => x.status === "open" && x.mine)) {
        out.push({ id: `suite-mine-${p.id}`, kind: "together", href: "#cordee", text: `Ta proposition pour repartir sur « ${C.ROUTES[p.route].name} » : ${int(p.yes)} sur ${int(p.eligible)} ${int(p.yes) > 1 ? "ont accepté" : "a accepté"}.` });
      }
    }
    const duo = d.duo;
    if (duo?.status === "finished") out.push({ id: "duo-finished", kind: duo.reached ? "celebrate" : "together", href: "/aujourdhui", text: duo.reached ? `TITAN Duo réussi${duo.partner ? ` avec ${duo.partner}` : ""} : ${int(duo.together)} / ${int(duo.target)} jours actifs.` : `Votre TITAN Duo est terminé : ${int(duo.together)} / ${int(duo.target)} jours actifs. Ce qui est fait reste fait.` });
    else if (duo?.status === "invited") out.push({ id: "duo-invited", kind: "together", href: "/aujourdhui", text: `${duo.partner || "Un ami"} te propose un TITAN Duo de 14 jours.` });
    else if (duo?.status === "active") out.push({ id: "duo-active", kind: "together", href: "/aujourdhui", text: `TITAN Duo avec ${duo.partner || "ton ami"} : ${int(duo.together)} / ${int(duo.target)} jours actifs à deux.` });
    for (const ch of d.challengesEnded || []) out.push({ id: `challenge-${ch.id}`, kind: ch.reached ? "celebrate" : "together", href: "#defis", text: ch.reached ? `Défi « ${ch.title} » : objectif atteint.` : `Le défi « ${ch.title} » est terminé.` });
    const fm = d.friendMoments || {};
    if (int(fm.count)) {
      const authors = [...new Set((fm.latest || []).map((m) => m.author))];
      out.push({ id: "moments", kind: "circle", href: "#moments", text: `${names(authors) || "Tes amis"} ${authors.length === 1 ? "a" : "ont"} partagé ${plural(int(fm.count), "Moment", "Moments")}${fm.latest?.[0]?.title ? `, dont « ${fm.latest[0].title} »` : ""}.` });
    }
    if (int(d.cheersReceived)) out.push({ id: "cheers", kind: "circle", href: "#moments", text: `${plural(int(d.cheersReceived), "encouragement reçu", "encouragements reçus")} sur tes Moments.` });
    if (int(d.requestsIn)) out.push({ id: "requests", kind: "circle", href: "#amis", text: `${plural(int(d.requestsIn), "demande d’ami", "demandes d’ami")} à regarder quand tu veux.` });
    if ((d.friendsActive || []).length) out.push({ id: "active", kind: "circle", href: "#amis", text: `${names(d.friendsActive, 3)} ${d.friendsActive.length > 1 ? "ont bougé" : "a bougé"} depuis ta dernière visite.` });
    for (const m of (d.memories || []).slice(0, 1)) {
      const route = C?.ROUTES?.[m.route];
      if (route) out.push({ id: `memory-${m.id}`, kind: "memory", href: "#cordee", text: `Souvenir : il y a ${plural(daysAgo(m.summitedAt, now), "jour", "jours")}, vous atteigniez ${route.camps[3][0]} à ${int(m.members)}.` });
    }
    const s = d.suggestion;
    if (s?.kind === "cordee" && C?.PACES?.[s.pace]) {
      const pace = C.PACES[s.pace].label.toLowerCase();
      out.push({ id: "suggest", kind: "suggest", href: "#cordee", pace: s.pace,
        text: int(s.friends) ? `Envie d’avancer à plusieurs ? Une cordée à l’allure ${pace} irait bien avec ${plural(int(s.activeDays28), "jour actif", "jours actifs")} ces quatre dernières semaines.` : `Une cordée se forme aussi seul·e, ou avec un ami invité par lien : allure ${pace} conseillée.` });
    }
    return out;
  }

  /** Whether the digest has anything worth showing: a suggestion alone is not news. */
  const hasNews = (d, now) => lines(d, now).some((l) => l.kind !== "suggest");

  const api = { lines, hasNews };
  root.TitanSocialDigest = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
