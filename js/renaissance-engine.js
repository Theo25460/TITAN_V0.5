(function (root) {
  "use strict";
  const C = root.TitanCodex;
  // v300: same curve as the server (500 × L^1.3); TitanEffort is the single source when loaded.
  const levelRequirement = (level) =>
    root.TitanEffort?.levelRequirement(level) ??
    Math.round(500 * Math.pow(Math.max(1, Number(level) || 1), 1.3));
  const rank = (level) =>
    [...C.ranks].reverse().find((r) => level >= r.level) || C.ranks[0];
  const activeLogs = (logs, now = Date.now()) =>
    (logs || []).filter(
      (l) =>
        !l.archived_at &&
        Number.isFinite(new Date(l.date).getTime()) &&
        new Date(l.date).getTime() <= now,
    );
  const dateKey = (value) =>
    root.TitanTraining?.dateKey(value) ||
    new Date(value).toLocaleDateString("sv-SE");
  function weeklyQuests(logs, goal = 3, now = new Date()) {
    const start = new Date(now);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    start.setHours(0, 0, 0, 0);
    const week = activeLogs(logs, now.getTime()).filter(
      (l) => new Date(l.date) >= start,
    );
    const days = new Set(week.map((l) => dateKey(l.date))).size;
    const noted = week.filter(
      (l) =>
        String(l.details?.note || l.details?.notes || "").trim().length >= 10,
    );
    const timed = week.filter(
      (l) =>
        root.TitanTraining?.duration(l) !== null &&
        root.TitanTraining?.duration(l) > 0,
    );
    return [
      {
        id: "rhythm",
        name: "Un rythme à toi",
        text: `Ton repère choisi : ${goal} séances cette semaine.`,
        value: week.length,
        target: goal,
        unit: "séances",
        icon: "flag",
        href: "/training",
      },
      {
        id: "perspective",
        name: "Une trace qui compte",
        text: "Note un ressenti ou un repère à retrouver.",
        value: Math.min(1, noted.length),
        target: 1,
        unit: "séance annotée",
        icon: "journal",
        href: "/journal",
      },
      {
        id: "context",
        name: "Des données lisibles",
        text: "Renseigne la durée de deux séances pour mieux les comparer.",
        value: Math.min(2, timed.length),
        target: 2,
        unit: "durées renseignées",
        icon: "clock",
        href: "/journal",
      },
      {
        id: "return",
        name: "Le plaisir de revenir",
        text: "Pratique sur deux jours, à ton rythme.",
        value: Math.min(2, days),
        target: 2,
        unit: "jours actifs",
        icon: "leaf",
        href: "/training",
      },
    ];
  }
  /** Discovery estimate with the server rules: effort XP, 1800/day, nothing for history sessions. */
  function simulate(logs) {
    let xp = 0,
      level = 1;
    const daily = new Map();
    const E = root.TitanEffort;
    for (const l of activeLogs(logs)) {
      const created = new Date(l.created_at || Date.now()).getTime();
      if (E?.isHistorical(l.date, created)) continue;
      const day = dateKey(l.date);
      const reward = E
        ? E.effort({ sport: l.sport, profile: root.SPORTS_CONFIG?.[l.sport]?.balanceProfile, unit: l.unit, val: l.val, details: l.details }).xp
        : Math.floor((root.TitanTraining?.duration(l) || 15) * 10);
      daily.set(day, Math.min(E?.DAILY_XP_CAP || 1800, (daily.get(day) || 0) + reward));
    }
    for (const amount of daily.values()) xp += amount;
    while (xp >= levelRequirement(level) && level < 100) {
      xp -= levelRequirement(level);
      level++;
    }
    return { xp, level, next_level_xp: levelRequirement(level) };
  }
  const api = {
    levelRequirement,
    rank,
    activeLogs,
    weeklyQuests,
    simulate,
    snapshot: null,
    status: "loading",
    error: null,
  };
  root.TitanAdventure = api;
  if (typeof document === "undefined") return;
  const owner = () => root.state?.user?.id;
  const isGuest = (id) => String(id || "").startsWith("guest_");
  const key = (id) => `titan_adventure_v1:${id}`;
  let pending = null,
    sequence = 0,
    lastOwner = null;
  function readLocal(id) {
    try {
      const s = JSON.parse(localStorage.getItem(key(id)) || "null");
      return s?.owner === id ? s : null;
    } catch {
      return null;
    }
  }
  // Render the owner's last known character immediately; the next refresh still validates it.
  const cachedAtBoot = owner() ? readLocal(owner()) : null;
  if (cachedAtBoot) {
    api.snapshot = cachedAtBoot;
    api.status = "cached";
    lastOwner = cachedAtBoot.owner;
  }
  function guestSnapshot(id) {
    const saved = readLocal(id) || {};
    const history = activeLogs(root.state?.history);
    const campaigns = C.worlds.map((w) => {
      const old = saved.campaigns?.find((c) => c.id === w.id),
        chapter = old?.chapter || 0;
      const consumed = new Set(
        (saved.rewards || [])
          .filter((r) => r.world === w.id)
          .flatMap((r) => r.source_ids || []),
      );
      const eligible =
        chapter > 0 && chapter < 10
          ? history.filter(
              (l) =>
                !consumed.has(l.id) &&
                new Date(l.created_at || l.date) >= new Date(old.started_at) &&
                dateKey(l.date) >= dateKey(old.started_at) &&
                (old.route !== "journal" ||
                  String(l.details?.note || l.details?.notes || "").trim()
                    .length >= 10),
            )
          : [];
      const unique = [
        ...new Map(eligible.map((l) => [dateKey(l.date), l])).values(),
      ];
      // Guardian trial (chapter 9): 150 effort minutes, at most 90 counted per day.
      const effortByDay = new Map();
      for (const l of eligible) {
        const m = root.TitanProgress?.effortOf(l)?.effortMinutes || 0;
        effortByDay.set(dateKey(l.date), (effortByDay.get(dateKey(l.date)) || 0) + m);
      }
      const effort = Math.round([...effortByDay.values()].reduce((n, m) => n + Math.min(90, m), 0));
      return {
        id: w.id,
        tier: w.tier,
        chapter,
        route: old?.route || "rhythm",
        started_at: old?.started_at || null,
        target: w.chapters[chapter - 1]?.target || 0,
        effort_target: chapter === 9 ? 150 : 0,
        evidence: { days: unique.length, effort, source_ids: unique.map((l) => l.id) },
        completed_at: old?.completed_at || null,
      };
    });
    return {
      version: 1,
      owner: id,
      ...simulate(history),
      credits: 0,
      plus: false,
      avatar: saved.avatar || "scout",
      selected_world: saved.selected_world || "aube",
      revision: saved.revision || 0,
      rewards: saved.rewards || [],
      campaigns,
      generated_at: new Date().toISOString(),
      local: true,
    };
  }
  function publish(s, status = "ready") {
    if (s?.owner !== owner()) return;
    api.snapshot = s;
    api.status = status;
    api.error = null;
    lastOwner = s.owner;
    try {
      localStorage.setItem(key(s.owner), JSON.stringify(s));
    } catch {}
    root.dispatchEvent(new CustomEvent("titan:adventure-updated"));
  }
  async function rpc(name, params, id) {
    const session = (await root.titanClient?.auth.getSession())?.data?.session;
    if (session?.user?.id !== id || owner() !== id)
      throw new Error("AUTH_REQUIRED");
    const response = await fetch(
      `${root.TITAN_SUPABASE_URL}/rest/v1/rpc/${name}`,
      {
        method: "POST",
        headers: {
          apikey: root.TITAN_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(15000),
      },
    );
    const value = await response.json();
    if (!response.ok) throw new Error(value.message || "ADVENTURE_UNAVAILABLE");
    if (owner() !== id) throw new Error("ACCOUNT_CHANGED");
    return value;
  }
  api.refresh = async function ({ force = false } = {}) {
    const id = owner();
    if (!id) return;
    if (lastOwner !== id) {
      api.snapshot = null;
      api.status = "loading";
      lastOwner = id;
    }
    if (isGuest(id)) {
      publish(guestSnapshot(id));
      return api.snapshot;
    }
    if (pending?.owner === id && !force) return pending.promise;
    const seq = ++sequence;
    const promise = (async () => {
      try {
        const s = await rpc("titan_adventure_snapshot", {}, id);
        if (seq === sequence) publish(s);
        return s;
      } catch (error) {
        if (owner() !== id || seq !== sequence) return;
        api.error = error.message;
        const cached = readLocal(id);
        if (cached) publish(cached, "cached");
        else {
          api.status = "error";
          root.dispatchEvent(new CustomEvent("titan:adventure-updated"));
        }
      } finally {
        if (pending?.sequence === seq) pending = null;
      }
    })();
    pending = { owner: id, sequence: seq, promise };
    return promise;
  };
  api.action = async function (action, params = {}) {
    const id = owner(),
      s = api.snapshot;
    if (!s || s.owner !== id) throw new Error("ADVENTURE_UNAVAILABLE");
    if (isGuest(id)) {
      const next = structuredClone(guestSnapshot(id));
      const c = next.campaigns.find((c) => c.id === params.world);
      if (action === "avatar") {
        const a = C.avatars.find((a) => a.id === params.avatar);
        if (!a || a.level > next.level) throw new Error("AVATAR_LOCKED");
        next.avatar = a.id;
      } else {
        if (!c) throw new Error("INVALID_WORLD");
        if (["start", "claim"].includes(action) && c.tier === "plus")
          throw new Error("TITAN_PLUS_REQUIRED");
        if (action === "start" && !c.chapter) {
          c.chapter = 1;
          c.target = C.worlds.find((w) => w.id === c.id).chapters[0].target;
          c.route = params.route || "rhythm";
          c.started_at = new Date().toISOString();
        }
        if (action === "claim") {
          if (c.chapter !== params.chapter || c.evidence.days < c.target)
            throw new Error("QUEST_INCOMPLETE");
          if ((c.effort_target || 0) > (c.evidence.effort || 0))
            throw new Error("GUARDIAN_EFFORT_INCOMPLETE");
          next.rewards.push({
            world: c.id,
            chapter: c.chapter,
            source_ids: c.evidence.source_ids,
            earned_at: new Date().toISOString(),
          });
          c.chapter++;
          c.started_at = new Date().toISOString();
          c.evidence = { days: 0, effort: 0, source_ids: [] };
          c.target =
            C.worlds.find((w) => w.id === c.id).chapters[c.chapter - 1]
              ?.target || 0;
          if (c.chapter === 10) c.completed_at = new Date().toISOString();
        }
        next.selected_world = c.id;
      }
      next.revision++;
      // A local action is only successful once it can survive a reload.
      try {
        localStorage.setItem(key(id), JSON.stringify(next));
      } catch {
        throw new Error("LOCAL_STORAGE_UNAVAILABLE");
      }
      publish(next);
      return next;
    }
    ++sequence; // discard an older in-flight snapshot after a mutation
    const next = await rpc(
      "titan_adventure_action",
      {
        p_action: action,
        p_world: params.world || null,
        p_route: params.route || "rhythm",
        p_avatar: params.avatar || null,
        p_revision: s.revision,
        p_chapter: params.chapter || null,
        p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      id,
    );
    publish(next);
    return next;
  };
  api.message = (error) =>
    ({
      LOCAL_STORAGE_UNAVAILABLE:
        "Le stockage de cet appareil est indisponible. La modification n’a pas été enregistrée. Libère de l’espace puis réessaie.",
      ADVENTURE_CONFLICT:
        "Ta progression a changé sur un autre écran. Actualise puis réessaie.",
      TITAN_PLUS_REQUIRED:
        "Cette campagne fait partie de TITAN+. Les deux premières restent gratuites.",
      AUTH_REQUIRED: "Reconnecte-toi pour retrouver ta progression.",
      QUEST_INCOMPLETE: "La mission n’est pas encore terminée.",
      GUARDIAN_EFFORT_INCOMPLETE:
        "Le gardien attend encore de l’effort : 150 minutes depuis le début du chapitre, 90 au plus par jour.",
      AVATAR_LOCKED: "Ce personnage se débloque à un prochain niveau.",
    })[error?.message] ||
    "La progression n’a pas pu être confirmée. Tes séances restent conservées. Réessaie dans un instant.";
  let refreshTimer;
  const schedule = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => api.refresh(), 150);
  };
  root.addEventListener("titan:history-updated", schedule);
  root.addEventListener("online", schedule);
  document.addEventListener("DOMContentLoaded", schedule);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) schedule();
  });
  schedule();
})(typeof window === "undefined" ? globalThis : window);
