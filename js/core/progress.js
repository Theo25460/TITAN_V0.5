/* TITAN 300 — progression layers computed from the journal.
   Cadence (no streaks), mastery per discipline, weekly summaries and recap,
   TITAN DNA and the deterministic insight engine. Every output is explainable:
   numbers come with their sources and every insight carries its "why". */
(function (root) {
  "use strict";
  const DAY = 86400000;
  const F = () => root.TitanFormat;
  const E = () => root.TitanEffort;
  const T = () => root.TitanTraining;
  const I = () => root.TitanInsights;

  /* ---------- Sports and families ---------- */
  const FAMILIES = {
    endurance: { label: "Endurance", color: "--fam-endurance" },
    force: { label: "Force", color: "--fam-force" },
    technique: { label: "Technique", color: "--fam-technique" },
    jeu: { label: "Jeu & combat", color: "--fam-jeu" },
    mobilite: { label: "Mobilité", color: "--fam-mobilite" },
  };
  const PROFILE_FAMILY = {
    running: "endurance", trail: "endurance", mountain_endurance: "endurance", hiking: "endurance",
    cycling: "endurance", mtb: "endurance", swimming: "endurance", water: "endurance", glide: "endurance",
    mixed: "endurance", mixed_conditioning: "endurance", speed: "endurance", cardio: "endurance", endurance: "endurance",
    strength: "force", strength_max: "force", calisthenics: "force", force: "force",
    climbing: "technique", skill: "technique", precision: "technique", gym_skill: "technique", dance: "technique",
    team: "jeu", football: "jeu", rugby: "jeu", hockey_team: "jeu", contact_team: "jeu", racket: "jeu",
    racket_fast: "jeu", padel: "jeu", handball: "jeu", volleyball: "jeu",
    combat: "jeu", combat_grappling: "jeu", combat_striking: "jeu", combat_weapon: "jeu",
    mobility: "mobilite", mindbody: "mobilite",
  };

  function sportMeta(key) {
    const conf = root.SPORTS_CONFIG?.[key] || {};
    const profile = conf.balanceProfile || conf.balance_profile || conf.cat || "";
    return {
      key,
      label: conf.label || conf.name || String(key || "Séance").replace(/_/g, " "),
      profile,
      family: PROFILE_FAMILY[profile] || PROFILE_FAMILY[conf.cat] || "endurance",
      unit: conf.unit || "",
      icon: conf.icon || "",
    };
  }

  /* ---------- Journal helpers ---------- */
  function activeLogs(logs, now = Date.now()) {
    const t = now instanceof Date ? now.getTime() : now;
    return (logs || []).filter(
      (l) => l && !l.archived_at && Number.isFinite(new Date(l.date).getTime()) && new Date(l.date).getTime() <= t + 10 * 60000,
    );
  }

  function effortOf(log) {
    const meta = sportMeta(log.sport);
    const fromServer = log.details?.effort;
    if (fromServer && Number.isFinite(Number(fromServer.effort_minutes))) {
      return {
        minutes: Number(fromServer.minutes),
        estimated: !!fromServer.estimated,
        effortMinutes: Number(fromServer.effort_minutes),
        xp: Number(fromServer.xp),
      };
    }
    return E().effort({ sport: log.sport, profile: meta.profile, unit: log.unit, val: log.val, details: log.details || {} });
  }

  /** Declared minutes when available, else the transparent estimate. */
  function minutesOf(log) {
    const declared = T()?.duration?.(log);
    if (declared !== null && declared !== undefined) return { minutes: declared, estimated: false };
    const e = effortOf(log);
    return { minutes: e.minutes, estimated: true };
  }

  const weekKey = (date) => F().dateKey(F().weekStart(date));

  /* ---------- Cadence ---------- */
  /**
   * Weekly rhythm without streaks. A week is "held" when the chosen number of active days is reached.
   * Paused weeks leave the window instead of counting as missed.
   */
  function cadence(logs, { target = 3, pauses = [], now = new Date(), window = 8 } = {}) {
    const goal = Math.min(7, Math.max(1, Math.round(Number(target) || 3)));
    const paused = new Set((pauses || []).map((p) => weekKey(p)));
    const days = new Map();
    for (const l of activeLogs(logs, now)) {
      const wk = weekKey(l.date);
      if (!days.has(wk)) days.set(wk, new Set());
      days.get(wk).add(F().dateKey(l.date));
    }
    const current = F().weekStart(now);
    const weeks = [];
    let cursor = new Date(current);
    let guard = 0;
    while (weeks.length < window && guard < 60) {
      const key = F().dateKey(cursor);
      const isCurrent = cursor.getTime() === current.getTime();
      const active = days.get(key)?.size || 0;
      if (paused.has(key) && !isCurrent) {
        weeks.push({ start: key, activeDays: active, state: "pause", fill: 0 });
      } else {
        const held = active >= goal;
        weeks.push({
          start: key,
          activeDays: active,
          state: held ? "held" : isCurrent ? "current" : active > 0 ? "partial" : "missed",
          fill: Math.round(Math.min(1, active / goal) * 100),
        });
      }
      cursor = new Date(cursor.getTime() - 7 * DAY);
      cursor.setHours(0, 0, 0, 0);
      cursor = F().weekStart(cursor);
      guard++;
    }
    weeks.reverse();
    const counted = weeks.filter((w) => w.state !== "pause");
    const held = counted.filter((w) => w.state === "held").length;
    let lifetimeHeld = 0;
    for (const [key, set] of days) if (set.size >= goal && !paused.has(key)) lifetimeHeld++;
    const thisWeek = weeks[weeks.length - 1];
    const remaining = Math.max(0, goal - (thisWeek?.activeDays || 0));
    const daysLeft = 7 - ((new Date(now).getDay() + 6) % 7);
    return {
      target: goal,
      weeks,
      held,
      window: counted.length,
      lifetimeHeld,
      currentDays: thisWeek?.activeDays || 0,
      remaining,
      daysLeftInWeek: daysLeft,
      reachable: remaining <= daysLeft,
    };
  }

  /* ---------- Mastery ---------- */
  const MASTERY = [
    { level: 1, name: "Découverte", hours: 0, weeks: 0 },
    { level: 2, name: "Initiation", hours: 2, weeks: 2 },
    { level: 3, name: "Pratique", hours: 6, weeks: 4 },
    { level: 4, name: "Régularité", hours: 12, weeks: 8 },
    { level: 5, name: "Solidité", hours: 20, weeks: 12 },
    { level: 6, name: "Expérience", hours: 32, weeks: 20 },
    { level: 7, name: "Expertise", hours: 50, weeks: 30 },
    { level: 8, name: "Maîtrise", hours: 75, weeks: 45 },
    { level: 9, name: "Excellence", hours: 110, weeks: 65 },
    { level: 10, name: "Référence", hours: 160, weeks: 90 },
  ];

  function masteryLevel(hours, weeks) {
    let current = MASTERY[0];
    for (const m of MASTERY) if (hours >= m.hours && weeks >= m.weeks) current = m;
    const next = MASTERY.find((m) => m.level === current.level + 1) || null;
    let progress = 1;
    if (next) {
      const ph = (hours - current.hours) / Math.max(0.01, next.hours - current.hours);
      const pw = (weeks - current.weeks) / Math.max(1, next.weeks - current.weeks);
      progress = Math.max(0, Math.min(1, Math.min(ph, pw)));
    }
    return { ...current, next, progress };
  }

  function mastery(logs, now = new Date()) {
    const map = new Map();
    for (const l of activeLogs(logs, now)) {
      const meta = sportMeta(l.sport);
      const g = map.get(l.sport) || { sport: l.sport, label: meta.label, family: meta.family, minutes: 0, estimatedMinutes: 0, sessions: 0, weeks: new Set(), last: null };
      const m = minutesOf(l);
      g.minutes += m.minutes || 0;
      if (m.estimated) g.estimatedMinutes += m.minutes || 0;
      g.sessions++;
      g.weeks.add(weekKey(l.date));
      if (!g.last || new Date(l.date) > new Date(g.last)) g.last = l.date;
      map.set(l.sport, g);
    }
    return [...map.values()]
      .map((g) => {
        const hours = g.minutes / 60;
        const lvl = masteryLevel(hours, g.weeks.size);
        return {
          sport: g.sport,
          label: g.label,
          family: g.family,
          sessions: g.sessions,
          minutes: Math.round(g.minutes),
          estimatedMinutes: Math.round(g.estimatedMinutes),
          hours: Math.round(hours * 10) / 10,
          weeks: g.weeks.size,
          last: g.last,
          level: lvl.level,
          name: lvl.name,
          next: lvl.next,
          progress: lvl.progress,
        };
      })
      .sort((a, b) => b.level - a.level || b.minutes - a.minutes);
  }

  /* ---------- Weeks ---------- */
  function summarize(list) {
    const out = { sessions: 0, activeDays: 0, minutes: 0, estimatedMinutes: 0, distance: 0, effortMinutes: 0, xp: 0, bySport: {} };
    const days = new Set();
    for (const l of list) {
      out.sessions++;
      days.add(F().dateKey(l.date));
      const m = minutesOf(l);
      out.minutes += m.minutes || 0;
      if (m.estimated) out.estimatedMinutes += m.minutes || 0;
      if (l.unit === "km" && Number(l.val) > 0) out.distance += Number(l.val);
      out.effortMinutes += effortOf(l).effortMinutes || 0;
      out.xp += Number(l.xp) || 0;
      const s = (out.bySport[l.sport] = out.bySport[l.sport] || { sport: l.sport, label: sportMeta(l.sport).label, sessions: 0, minutes: 0 });
      s.sessions++;
      s.minutes += m.minutes || 0;
    }
    out.activeDays = days.size;
    out.minutes = Math.round(out.minutes);
    out.estimatedMinutes = Math.round(out.estimatedMinutes);
    out.effortMinutes = Math.round(out.effortMinutes);
    out.distance = Math.round(out.distance * 10) / 10;
    return out;
  }

  function weekLogs(logs, start) {
    const from = F().weekStart(start).getTime();
    const to = from + 7 * DAY;
    return activeLogs(logs).filter((l) => {
      const t = new Date(l.date).getTime();
      return t >= from && t < to;
    });
  }

  /** Records whose source session belongs to [from, to[ and beat a previous mark. */
  function newRecords(logs, from, to, now = Date.now()) {
    if (!I()?.records) return [];
    const at = now instanceof Date ? now.getTime() : now;
    const pool = activeLogs(logs, at);
    const all = I().records(pool, "all", at);
    const earlier = I().records(pool.filter((l) => new Date(l.date).getTime() < from), "all", at);
    const out = [];
    for (const r of all) {
      const t = new Date(r.log.date).getTime();
      if (t < from || t >= to) continue;
      const before = earlier.find((p) => p.id === r.id);
      out.push({ ...r, previous: before || null, first: !before });
    }
    return out.filter((r) => !r.first || r.kind === "strength" || r.kind === "climbing" || r.kind === "time");
  }

  /** Weekly recap: last completed week by default. */
  function recap(logs, { now = new Date(), goals = [], current = false } = {}) {
    const thisWeek = F().weekStart(now);
    const start = current ? thisWeek : new Date(thisWeek.getTime() - 7 * DAY);
    const from = F().weekStart(start).getTime();
    const to = from + 7 * DAY;
    const week = summarize(weekLogs(logs, start));
    const previous = [1, 2, 3, 4].map((k) => summarize(weekLogs(logs, new Date(from - k * 7 * DAY))));
    const withData = previous.filter((w) => w.sessions > 0);
    const avg = (key) => (withData.length ? withData.reduce((n, w) => n + w[key], 0) / withData.length : null);
    const baseline = { sessions: avg("sessions"), minutes: avg("minutes"), distance: avg("distance"), weeks: withData.length };
    const top = Object.values(week.bySport).sort((a, b) => b.minutes - a.minutes || b.sessions - a.sessions)[0] || null;
    const records = newRecords(logs, from, to, now);
    const goalLines = (goals || [])
      .filter((g) => !g.archived_at && I()?.goalProgress)
      .map((g) => {
        const end = I().goalProgress(g, logs, new Date(to - 1));
        const startState = I().goalProgress(g, logs.filter((l) => new Date(l.date).getTime() < from), new Date(from - 1));
        return { goal: g, value: end.value, before: startState.value, ratio: end.ratio, complete: end.complete, completedThisWeek: end.complete && !startState.complete };
      })
      .filter((g) => g.value > g.before);
    const best = Math.max(0, ...previous.map((w) => w.minutes));
    return {
      from: new Date(from),
      to: new Date(to - 1),
      week,
      baseline,
      deltaMinutes: baseline.minutes === null ? null : week.minutes - baseline.minutes,
      deltaSessions: baseline.sessions === null ? null : week.sessions - baseline.sessions,
      topSport: top,
      records,
      goals: goalLines,
      bestOfRecentWeeks: week.minutes > 0 && week.minutes > best && withData.length >= 2,
      empty: week.sessions === 0,
    };
  }

  /* ---------- TITAN DNA ---------- */
  function dna(logs, now = new Date()) {
    const list = activeLogs(logs, now);
    const total = summarize(list);
    const families = {};
    const slots = { matin: 0, midi: 0, "après-midi": 0, soir: 0 };
    const weekdays = [0, 0, 0, 0, 0, 0, 0];
    for (const l of list) {
      const meta = sportMeta(l.sport);
      const m = minutesOf(l).minutes || 0;
      families[meta.family] = (families[meta.family] || 0) + m;
      const d = new Date(l.date);
      const h = d.getHours();
      if (!(h === 12 && d.getMinutes() === 0)) slots[h < 11 ? "matin" : h < 14 ? "midi" : h < 18 ? "après-midi" : "soir"] += 1;
      weekdays[(d.getDay() + 6) % 7] += 1;
    }
    const famTotal = Object.values(families).reduce((a, b) => a + b, 0) || 1;
    const familyShare = Object.entries(families)
      .map(([id, minutes]) => ({ id, label: FAMILIES[id]?.label || id, minutes: Math.round(minutes), share: minutes / famTotal }))
      .sort((a, b) => b.minutes - a.minutes);
    const slotEntries = Object.entries(slots).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const dayNames = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
    const favDay = weekdays.some((n) => n > 0) ? dayNames[weekdays.indexOf(Math.max(...weekdays))] : null;
    const weeks = new Set(list.map((l) => weekKey(l.date)));
    const sorted = list.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    return {
      sessions: total.sessions,
      minutes: total.minutes,
      estimatedMinutes: total.estimatedMinutes,
      distance: total.distance,
      activeWeeks: weeks.size,
      first: sorted[0]?.date || null,
      families: familyShare,
      topSports: Object.values(total.bySport).sort((a, b) => b.minutes - a.minutes).slice(0, 3),
      timeOfDay: slotEntries.length ? slotEntries[0][0] : null,
      favoriteDay: favDay,
      masteries: mastery(list, now).slice(0, 4),
      enough: total.sessions >= 5,
    };
  }

  /* ---------- Insight engine ---------- */
  const MILESTONES_SESSIONS = [1, 10, 25, 50, 100, 150, 200, 300, 365, 500, 750, 1000];
  const MILESTONES_HOURS = [10, 25, 50, 100, 200, 300, 500, 1000];

  function insights({ logs = [], goals = [], now = new Date(), cadenceTarget = 3, pauses = [], adventure = null, pending = [] } = {}) {
    const f = F();
    const list = activeLogs(logs, now);
    const out = [];
    const nowT = new Date(now).getTime();
    const sorted = list.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    const last = sorted[0] || null;

    // Pending corrections come first: nothing may disappear silently.
    const broken = (pending || []).filter((p) => p.status === "error");
    if (broken.length)
      out.push({
        id: "sync-error",
        priority: 100,
        tone: "err",
        title: `${f.plural(broken.length, "séance attend", "séances attendent")} une correction`,
        text: "Elles sont conservées sur cet appareil. Ouvre-les pour les corriger ou les exporter.",
        why: "Le serveur a refusé ces enregistrements. Ils ne sont ni perdus ni synchronisés.",
        cta: { label: "Voir les séances", href: "/journal#attente" },
      });

    // Adventure chapter ready to be claimed.
    for (const c of adventure?.campaigns || []) {
      const days = Number(c.evidence?.days || 0);
      const effort = Number(c.evidence?.effort || 0);
      if (c.chapter >= 1 && c.chapter <= 9 && c.target > 0 && days >= c.target && effort >= (c.effort_target || 0))
        out.push({
          id: `chapter-${c.id}`,
          priority: 90,
          tone: "cy",
          title: c.chapter === 9 ? "Le gardien t’attend" : `Le chapitre ${c.chapter} est prêt`,
          text: "Tes séances ont ouvert la voie. Va découvrir la suite.",
          why: `${f.plural(days, "jour actif validé", "jours actifs validés")} pour ${c.target} demandé${c.target > 1 ? "s" : ""}.`,
          cta: { label: "Ouvrir l’aventure", href: `/adventure?world=${c.id}` },
        });
    }

    // Goals close to completion.
    for (const g of goals || []) {
      if (g.archived_at || !I()?.goalProgress) continue;
      const p = I().goalProgress(g, logs, now);
      if (p.complete || p.ended || p.upcoming || p.ratio < 0.7) continue;
      const left = Number(g.target) - p.value;
      const unit = { distance: "km", minutes: "min", sessions: "séance", days: "jour actif" }[g.metric] || "";
      const leftText =
        g.metric === "distance" ? f.distance(left) : g.metric === "minutes" ? f.duration(left) : f.plural(Math.ceil(left), unit, unit + "s");
      out.push({
        id: `goal-${g.id}`,
        priority: 80 + Math.round(p.ratio * 10),
        tone: "cy",
        title: `Encore ${leftText} pour « ${g.title} »`,
        text: `Tu es à ${Math.round(p.ratio * 100)} %.`,
        why: `Objectif jusqu’au ${new Date(`${g.end_date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}, ${f.plural(p.contributors.length, "séance contributrice", "séances contributrices")}.`,
        cta: { label: "Voir l’objectif", href: "/objectifs" },
      });
    }

    // Recent records (last 7 days).
    const recent = newRecords(logs, nowT - 7 * DAY, nowT + DAY, nowT).filter((r) => !r.first);
    for (const r of recent.slice(0, 2)) {
      const val = r.unit === "km" ? f.distance(r.value) : r.unit === "min" ? f.duration(r.value) : r.unit === "kg" ? f.weight(r.value) : `${r.value} ${r.unit}`.trim();
      const prev = r.previous
        ? r.previous.unit === "km" ? f.distance(r.previous.value) : r.previous.unit === "min" ? f.duration(r.previous.value) : r.previous.unit === "kg" ? f.weight(r.previous.value) : `${r.previous.value}`
        : null;
      out.push({
        id: `record-${r.id}`,
        priority: 75,
        tone: "am",
        title: `Record : ${r.label.toLowerCase()} — ${val}`,
        text: `${sportMeta(r.sport).label}, ${f.relativeDay(r.log.date, now)}.`,
        why: prev ? `Précédent repère : ${prev}. ${r.context}` : r.context,
        cta: { label: "Voir les records", href: "/records" },
      });
    }

    // Cadence: one day away from holding the week.
    const cad = cadence(logs, { target: cadenceTarget, pauses, now });
    if (cad.remaining > 0 && cad.reachable && cad.currentDays > 0)
      out.push({
        id: "cadence",
        priority: cad.remaining === 1 ? 70 : 40,
        tone: "cy",
        title: cad.remaining === 1 ? "Un jour actif de plus et ta semaine est tenue" : `Encore ${cad.remaining} jours actifs pour tenir ta semaine`,
        text: `${cad.currentDays}/${cad.target} cette semaine. Une séance courte compte autant qu’une longue.`,
        why: `Ta semaine type : ${cad.target} jours actifs. Il reste ${f.plural(cad.daysLeftInWeek, "jour", "jours")} cette semaine. Le repos ne fait jamais perdre de semaine déjà tenue.`,
        cta: { label: "Enregistrer une séance", href: "/training" },
      });

    // Return after a pause: welcome back, never blame.
    if (last) {
      const gap = f.daysSince(last.date, now);
      if (gap >= 10)
        out.push({
          id: "return",
          priority: 65,
          tone: "cy",
          title: "Content de te revoir",
          text: "Une séance de 20 minutes suffit pour reprendre le fil.",
          why: `Dernière séance ${f.relativeDay(last.date, now)} (${gap} jours). Tes niveaux, insignes et semaines tenues sont intacts.`,
          cta: { label: "Reprendre", href: "/training" },
        });
    }

    // Frequency trend over 14 days.
    const count = (from, to) => list.filter((l) => { const t = new Date(l.date).getTime(); return t >= from && t < to; }).length;
    const recent14 = count(nowT - 14 * DAY, nowT + DAY);
    const prev14 = count(nowT - 28 * DAY, nowT - 14 * DAY);
    if (prev14 >= 4 && recent14 >= prev14 * 1.5)
      out.push({
        id: "freq-up",
        priority: 35,
        tone: "cy",
        title: "Tu pratiques davantage",
        text: `${recent14} séances sur 14 jours, contre ${prev14} avant.`,
        why: "Comparaison des 14 derniers jours avec les 14 précédents.",
        cta: { label: "Voir l’évolution", href: "/stats" },
      });
    else if (prev14 >= 4 && recent14 <= prev14 * 0.5)
      out.push({
        id: "freq-down",
        priority: 30,
        tone: "info",
        title: "Rythme plus calme ces derniers jours",
        text: `${recent14} séance${recent14 > 1 ? "s" : ""} sur 14 jours, contre ${prev14} avant.`,
        why: "Comparaison des 14 derniers jours avec les 14 précédents. Une période plus calme peut être voulue : la cadence te laisse déclarer une pause.",
        cta: { label: "Voir l’évolution", href: "/stats" },
      });

    // A sport practised regularly, then left aside.
    const bySport = new Map();
    for (const l of list) {
      if (new Date(l.date).getTime() < nowT - 90 * DAY) continue;
      const g = bySport.get(l.sport) || { n: 0, last: 0 };
      g.n++;
      g.last = Math.max(g.last, new Date(l.date).getTime());
      bySport.set(l.sport, g);
    }
    for (const [sport, g] of bySport) {
      const gap = Math.floor((nowT - g.last) / DAY);
      if (g.n >= 4 && gap >= 21 && (!last || last.sport !== sport)) {
        out.push({
          id: `neglected-${sport}`,
          priority: 25,
          tone: "info",
          title: `${sportMeta(sport).label} : ${Math.floor(gap / 7)} semaines sans séance`,
          text: "Simple repère, pas un reproche.",
          why: `${g.n} séances sur les 90 derniers jours, la dernière ${f.relativeDay(g.last, now)}.`,
          cta: { label: "Voir l’historique", href: `/journal?sport=${encodeURIComponent(sport)}` },
        });
        break;
      }
    }

    // Milestones within reach.
    const nextSession = MILESTONES_SESSIONS.find((m) => m > list.length);
    if (nextSession && nextSession - list.length <= 2 && list.length >= 5)
      out.push({
        id: "milestone-sessions",
        priority: 45,
        tone: "am",
        title: nextSession - list.length === 1 ? `Ta prochaine séance sera la ${nextSession}e` : `Plus que ${nextSession - list.length} séances avant la ${nextSession}e`,
        text: "Un jalon de ta collection.",
        why: `${list.length} séances enregistrées depuis ton début.`,
        cta: { label: "Enregistrer une séance", href: "/training" },
      });
    const totalHours = summarize(list).minutes / 60;
    const nextHours = MILESTONES_HOURS.find((h) => h > totalHours);
    if (nextHours && nextHours - totalHours <= Math.max(1, nextHours * 0.04))
      out.push({
        id: "milestone-hours",
        priority: 44,
        tone: "am",
        title: `${f.duration((nextHours - totalHours) * 60)} avant ${nextHours} heures de pratique`,
        text: "Un jalon de ta collection.",
        why: `${f.number(totalHours, 1)} h de pratique cumulées (durées renseignées et estimées).`,
        cta: { label: "Voir mon profil", href: "/profile" },
      });

    // Mastery within reach.
    for (const m of mastery(list, now)) {
      if (m.next && m.progress >= 0.85) {
        const needH = Math.max(0, m.next.hours - m.hours);
        const needW = Math.max(0, m.next.weeks - m.weeks);
        out.push({
          id: `mastery-${m.sport}`,
          priority: 42,
          tone: "cy",
          title: `${m.label} : maîtrise ${m.next.level} en vue`,
          text: `${m.next.name}, à ${needH > 0 ? f.duration(needH * 60) : ""}${needH > 0 && needW > 0 ? " et " : ""}${needW > 0 ? f.plural(needW, "semaine", "semaines") : ""} de pratique.`,
          why: `La maîtrise mesure la pratique (heures et semaines), jamais la performance. Actuellement : ${f.number(m.hours, 1)} h sur ${m.weeks} semaines.`,
          cta: { label: "Voir mes maîtrises", href: "/profile#maitrises" },
        });
        break;
      }
    }

    return out.sort((a, b) => b.priority - a.priority);
  }

  /** The one thing that deserves attention now (QG hero). */
  function nextAction(ctx = {}) {
    const now = ctx.now || new Date();
    const list = activeLogs(ctx.logs || [], now);
    const f = F();
    const top = insights(ctx)[0];
    if (!list.length)
      return {
        id: "first",
        tone: "cy",
        title: "Ta première séance",
        text: "Choisis ton sport, note l’essentiel. TITAN s’occupe du reste : progression, repères et premier chapitre.",
        why: "Aucune séance enregistrée pour l’instant.",
        cta: { label: "Enregistrer ma première séance", href: "/training" },
      };
    if (top && top.priority >= 60) return top;
    const today = list.filter((l) => f.dateKey(l.date) === f.dateKey(now));
    if (today.length)
      return {
        id: "done-today",
        tone: "ok",
        title: today.length > 1 ? `${today.length} séances aujourd’hui` : "Séance enregistrée aujourd’hui",
        text: "Le repos fait partie de la progression. Reviens quand tu veux.",
        why: today.map((l) => sportMeta(l.sport).label).join(", "),
        cta: { label: "Voir dans le journal", href: "/journal" },
      };
    if (top) return top;
    const weekday = (new Date(now).getDay() + 6) % 7;
    const habit = new Map();
    for (const l of list) {
      if ((new Date(l.date).getDay() + 6) % 7 !== weekday) continue;
      habit.set(l.sport, (habit.get(l.sport) || 0) + 1);
    }
    const [sport, n] = [...habit.entries()].sort((a, b) => b[1] - a[1])[0] || [];
    const dayName = new Date(now).toLocaleDateString("fr-FR", { weekday: "long" });
    return {
      id: "record",
      tone: "cy",
      title: sport && n >= 2 ? `Le ${dayName}, c’est souvent ${sportMeta(sport).label.toLowerCase()}` : "Prêt pour une séance ?",
      text: "Enregistre ton effort en moins d’une minute.",
      why: sport && n >= 2 ? `${n} séances de ${sportMeta(sport).label.toLowerCase()} un ${dayName} dans ton journal.` : "Ton journal grandit à chaque séance.",
      cta: { label: "Enregistrer une séance", href: sport && n >= 2 ? `/training?sport=${encodeURIComponent(sport)}` : "/training" },
    };
  }

  const api = {
    FAMILIES,
    PROFILE_FAMILY,
    MASTERY,
    sportMeta,
    activeLogs,
    effortOf,
    minutesOf,
    cadence,
    masteryLevel,
    mastery,
    summarize,
    weekLogs,
    newRecords,
    recap,
    dna,
    insights,
    nextAction,
  };
  root.TitanProgress = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
