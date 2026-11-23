/* V1.7.2 — Planifié et réalisé: the occurrences of the personal typical week (« semaine type », QG › Prévoir) tied to the sessions
   that really happened, with the same rules and words on the website and in the Android app (copied unchanged by
   mobile/scripts/sync-web-core.mjs). Pure: it reads a schedule and a journal and returns new values; it never changes a session.

   Storage. Everything lives in game_state.user.schedule, the preference the server already copies (titan_save_profile_state,
   allowlist key « schedule »), next to the seven day keys the clients have always read (monday … sunday):
   - schedule.revisions  { "<Monday>": { days, at } , "_": { days, at } }  the typical week in force FROM that week. "_" is the plan
                          known when tracking started (before V1.7.2), so older weeks are said to be « reconstituted ».
   - schedule.weeks      { "<Monday>": { v, ref: { days, at, source }, occ: { "<Monday>/<0-6>": decision } } }  one record per week
                          that has a decision: the reference of the start of that week, then the athlete's decisions.
   A decision is { kind: "move" | "replace" | "skip" | "link" | "none" | "reset", day?, sport?, session?, at }. Keyed objects (never
   arrays) so the website's three-way preference merge and merge() below combine two devices' decisions occurrence by occurrence.

   Identity. An occurrence is « <Monday of its week>/<index of its planned day> » (0 = Monday): two devices that never talked compute
   the same identity. Days are calendar dates (YYYY-MM-DD), never instants: a session belongs to the local day of the zone it was
   recorded in (details.timezone), so travelling or reading the week from another time zone moves nothing.

   Rules (RULES).
   - The reference of a week is the typical week in force on its Monday. Editing the typical week during a week applies from the next
     Monday; this week keeps its start and changes only by an explicit decision (move, replace, skip). A first plan, made in a week
     that had nothing planned, applies at once.
   - A session is tied to an occurrence when it is clear: same sport, same (effective) day, and exactly as many such sessions as such
     occurrences. Two eligible sessions for one occurrence, or a session of another sport on that day, is a question for the athlete.
   - Each occurrence counts at most once in the gaps between planned and done: as planned (no gap), moved, replaced, skipped or
     missed. A session tied to an occurrence is never counted again as « hors programme ». Its real measures are the journal's.
   - A paused week (cadence pause) shows what was planned and what was done, and counts no gap for what was not done. */
(function (root) {
  "use strict";

  const VERSION = 1;
  const MAX_WEEKS = 26;
  const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const DAY_NAMES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
  const KINDS = ["move", "replace", "skip", "link", "none", "reset"];
  const RULES = Object.freeze({
    reference: "Semaine type en vigueur le lundi ; une modification en cours de semaine s’applique le lundi suivant.",
    link: "Même sport, même jour, une seule séance par occurrence : sinon TITAN te demande de choisir.",
    gap: "Chaque occurrence compte au plus une fois dans les écarts.",
    pause: "Une semaine en pause ne compte aucun écart pour ce qui n’a pas été fait.",
  });

  const isKey = (k) => typeof k === "string" && /^\d{4}-\d{2}-\d{2}$/.test(k);
  const utc = (k) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
  const keyOfUtc = (t) => new Date(t).toISOString().slice(0, 10);
  /** Calendar arithmetic on date keys (no clock, no zone). */
  const addDays = (k, n) => keyOfUtc(utc(k) + n * 86400000);
  const dayIndex = (k) => (new Date(utc(k)).getUTCDay() + 6) % 7;
  const weekOf = (k) => addDays(k, -dayIndex(k));
  const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);

  const fmt = {};
  function zoneValid(zone) {
    if (typeof zone !== "string" || !zone) return false;
    try {
      fmt[zone] = fmt[zone] || new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
      return true;
    } catch {
      return false;
    }
  }
  /** The calendar day of an instant in a zone (the device's when the zone is unknown). */
  function localKey(instant, zone) {
    const d = new Date(instant);
    if (!Number.isFinite(d.getTime())) return null;
    if (zoneValid(zone)) {
      const parts = fmt[zone].formatToParts(d);
      const get = (t) => parts.find((p) => p.type === t)?.value || "";
      const k = `${get("year")}-${get("month")}-${get("day")}`;
      if (isKey(k)) return k;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  /** The day of a session: in the zone it was recorded in (details.timezone), else in the reading zone. */
  const sessionDay = (log, zone) => localKey(log?.date, zoneValid(log?.details?.timezone) ? log.details.timezone : zone);
  const sessionId = (log) => String(log?.client_event_id || log?.details?.client_event_id || log?.id || "");
  const counted = (log) => {
    const T = root.TitanTraining;
    if (T?.counted) return T.counted(log);
    return !!log && !log.archived_at && !log.is_suspicious && log.syncStatus !== "error";
  };
  const familyOf = (sport) => root.TitanSports?.familyOf?.(sport) || null;
  const known = (sport) => typeof sport === "string" && !!sport && (!root.SPORTS_CONFIG || !!root.SPORTS_CONFIG[sport] || !!root.TitanSports?.conf?.(sport));

  /** The seven days of a typical week, from schedule.monday … sunday (or a stored days array). */
  function normDay(d) {
    if (!d || typeof d !== "object" || !known(d.sport)) return null;
    const m = Number(d.minutes);
    return { sport: d.sport, minutes: m > 0 && m <= 600 ? Math.round(m) : null, note: String(d.note || "").slice(0, 80) };
  }
  function typeDays(schedule) {
    const s = schedule && typeof schedule === "object" ? schedule : {};
    return DAY_KEYS.map((k) => normDay(s[k]));
  }
  const storedDays = (days) => (Array.isArray(days) && days.length === 7 ? days.map(normDay) : null);
  const sameDays = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const planned = (days) => (days || []).some(Boolean);

  function revisions(schedule) {
    const r = schedule?.revisions;
    if (!r || typeof r !== "object" || Array.isArray(r)) return [];
    return Object.entries(r)
      .filter(([k, v]) => (k === "_" || isKey(k)) && storedDays(v?.days))
      .map(([k, v]) => ({ from: k === "_" ? null : k, days: storedDays(v.days), at: v.at || null }))
      .sort((a, b) => (a.from === null ? -1 : b.from === null ? 1 : a.from < b.from ? -1 : 1));
  }
  function record(schedule, week) {
    const r = schedule?.weeks?.[week];
    return r && typeof r === "object" ? r : null;
  }

  /** The reference of a week: what was planned on its Monday. source: week (kept with the week's decisions), revision (typical week
      in force that Monday), type (the typical week, nothing changed since), reconstructed (a past week before tracking started). */
  function reference(schedule, week, { current } = {}) {
    const rec = record(schedule, week);
    const kept = storedDays(rec?.ref?.days);
    if (kept) return { days: kept, source: "week", at: rec.ref.at || null };
    const live = typeDays(schedule);
    const revs = revisions(schedule);
    if (!revs.length) return { days: live, source: current && week < current ? "reconstructed" : "type", at: null };
    let pick = null;
    for (const r of revs) if (r.from === null || r.from <= week) pick = r;
    const latest = revs[revs.length - 1];
    // A client without V1.7.2 edited the typical week after the last revision: the live days are the plan from now on.
    if (current && week >= current && pick === latest && !sameDays(latest.days, live)) return { days: live, source: "type", at: null };
    if (!pick) return { days: revs[0].days, source: "reconstructed", at: null };
    return { days: pick.days, source: pick.from === null ? (current && week < current ? "reconstructed" : "type") : "revision", at: pick.at };
  }

  const clone = (v) => JSON.parse(JSON.stringify(v ?? {}));

  /** Edit one day of the typical week. Returns { schedule, appliesFrom } — a new schedule; the input is not changed. */
  function editType(schedule, dayKey, value, { today, at = new Date().toISOString() } = {}) {
    if (!DAY_KEYS.includes(dayKey) || !isKey(today)) throw new Error("WEEK_PLAN_BAD_DAY");
    const current = weekOf(today);
    const before = reference(schedule, current, { current });
    const next = clone(schedule);
    const old = next[dayKey] || {};
    next[dayKey] = value?.sport
      ? { ...old, sport: value.sport, minutes: Number(value.minutes) > 0 ? Math.min(600, Math.round(Number(value.minutes))) : null, note: String(value.note || "").trim().slice(0, 80) }
      : { ...old, sport: null, minutes: null, note: "" };
    const revs = next.revisions && typeof next.revisions === "object" && !Array.isArray(next.revisions) ? next.revisions : {};
    if (!Object.keys(revs).length) revs._ = { days: typeDays(schedule), at };
    const rec = record(next, current);
    const decided = rec && Object.keys(rec.occ || {}).length > 0;
    // A first plan made in a week with nothing planned (and no decision) applies at once; otherwise from next Monday.
    const appliesFrom = !planned(before.days) && !decided ? current : addDays(current, 7);
    for (const k of Object.keys(revs)) if (k !== "_" && k > appliesFrom) delete revs[k];
    revs[appliesFrom] = { days: typeDays(next), at };
    next.revisions = revs;
    if (appliesFrom !== current && !storedDays(rec?.ref?.days)) {
      next.weeks = next.weeks && typeof next.weeks === "object" ? next.weeks : {};
      next.weeks[current] = { v: VERSION, ...(rec || {}), ref: { days: before.days, at, source: before.source }, occ: { ...(rec?.occ || {}) } };
    }
    return { schedule: prune(next, today), appliesFrom };
  }

  /** Record a decision on an occurrence. decision: { kind, day?, sport?, session? }. Returns a new schedule. */
  function decide(schedule, occurrenceId, decision, { today, at = new Date().toISOString() } = {}) {
    const m = /^(\d{4}-\d{2}-\d{2})\/([0-6])$/.exec(String(occurrenceId || ""));
    if (!m || !isKey(today) || !KINDS.includes(decision?.kind)) throw new Error("WEEK_PLAN_BAD_DECISION");
    const week = m[1];
    if (weekOf(week) !== week) throw new Error("WEEK_PLAN_BAD_DECISION");
    const current = weekOf(today);
    const ref = reference(schedule, week, { current });
    if (!ref.days[Number(m[2])]) throw new Error("WEEK_PLAN_NO_OCCURRENCE");
    const entry = { kind: decision.kind, at };
    if (decision.day !== undefined && decision.day !== null) {
      if (!isKey(decision.day) || weekOf(decision.day) !== week) throw new Error("WEEK_PLAN_OTHER_WEEK");
      entry.day = decision.day;
    }
    if (decision.kind === "move" && !entry.day) throw new Error("WEEK_PLAN_BAD_DECISION");
    if (decision.kind === "replace") {
      if (!known(decision.sport)) throw new Error("WEEK_PLAN_BAD_DECISION");
      entry.sport = decision.sport;
    }
    if (decision.kind === "link") {
      if (!decision.session) throw new Error("WEEK_PLAN_BAD_DECISION");
      entry.session = String(decision.session);
    }
    const next = clone(schedule);
    next.weeks = next.weeks && typeof next.weeks === "object" && !Array.isArray(next.weeks) ? next.weeks : {};
    const rec = record(next, week) || {};
    next.weeks[week] = {
      v: VERSION,
      ref: storedDays(rec.ref?.days) ? rec.ref : { days: ref.days, at, source: ref.source },
      occ: { ...(rec.occ || {}), [occurrenceId]: entry },
    };
    return prune(next, today);
  }

  /** Keep the last MAX_WEEKS weeks of decisions, and the revisions those weeks and the next ones need. */
  function prune(schedule, today) {
    if (!isKey(today)) return schedule;
    const oldest = addDays(weekOf(today), -7 * (MAX_WEEKS - 1));
    if (schedule.weeks && typeof schedule.weeks === "object") for (const k of Object.keys(schedule.weeks)) if (!isKey(k) || k < oldest) delete schedule.weeks[k];
    if (schedule.revisions && typeof schedule.revisions === "object") {
      const dated = Object.keys(schedule.revisions).filter(isKey).sort();
      const keepFrom = dated.filter((k) => k <= oldest).pop();
      for (const k of dated) if (k < (keepFrom || oldest)) delete schedule.revisions[k];
    }
    return schedule;
  }

  /** Two devices' schedules: decisions and revisions are combined key by key, the most recent decision on an occurrence wins, the
      reference of a week is the first one kept. The typical week's days come from `remote` (the confirmed server copy). */
  function merge(local, remote) {
    const a = local && typeof local === "object" ? local : {};
    const b = remote && typeof remote === "object" ? remote : {};
    const out = { ...clone(a), ...clone(b) };
    const later = (x, y) => (!x ? y : !y ? x : String(y.at || "") > String(x.at || "") ? y : x);
    const revs = { ...(a.revisions || {}) };
    for (const [k, v] of Object.entries(b.revisions || {})) revs[k] = later(revs[k], v);
    if (Object.keys(revs).length) out.revisions = clone(revs);
    const weeks = {};
    for (const k of new Set([...Object.keys(a.weeks || {}), ...Object.keys(b.weeks || {})])) {
      const x = a.weeks?.[k] || {}, y = b.weeks?.[k] || {};
      const ref = !x.ref ? y.ref : !y.ref ? x.ref : String(y.ref.at || "") < String(x.ref.at || "") ? y.ref : x.ref;
      const occ = { ...(x.occ || {}) };
      for (const [id, d] of Object.entries(y.occ || {})) occ[id] = later(occ[id], d);
      weeks[k] = { v: VERSION, ref: clone(ref), occ: clone(occ) };
    }
    if (Object.keys(weeks).length) out.weeks = weeks;
    return out;
  }

  /** The week as planned and as done. options: { week (any day key of the week; default today's), today (device day key, required),
      zone (reading zone; default the device's), pauses (cadence pauses, Monday keys) }. */
  function week(schedule, logs, { week: anyDay, today, zone, pauses = [] } = {}) {
    if (!isKey(today)) throw new Error("WEEK_PLAN_TODAY_REQUIRED");
    const current = weekOf(today);
    const w = weekOf(isKey(anyDay) ? anyDay : today);
    const to = addDays(w, 6);
    const ref = reference(schedule, w, { current });
    const rec = record(schedule, w);
    const decisions = rec?.occ && typeof rec.occ === "object" ? rec.occ : {};
    const paused = (pauses || []).some((p) => isKey(p) && weekOf(p) === w);

    const all = (logs || []).filter((l) => l && Number.isFinite(new Date(l.date).getTime()));
    const inWeek = [];
    const byId = new Map();
    for (const l of all) {
      const id = sessionId(l);
      if (!id) continue;
      const day = sessionDay(l, zone);
      byId.set(id, { log: l, day });
      if (day && day >= w && day <= to && counted(l)) inWeek.push({ id, log: l, day, sport: l.sport, time: new Date(l.date).getTime() });
    }
    inWeek.sort((x, y) => x.time - y.time || (x.id < y.id ? -1 : 1));

    // 1. The occurrences of the reference, with the decision kept for each.
    const occ = [];
    ref.days.forEach((p, i) => {
      if (!p) return;
      const id = `${w}/${i}`;
      const raw = decisions[id];
      const d = raw && KINDS.includes(raw.kind) && raw.kind !== "reset" ? raw : null;
      const day0 = addDays(w, i);
      const eff = { day: day0, sport: p.sport };
      if (d?.kind === "move" && isKey(d.day)) eff.day = d.day;
      if (d?.kind === "replace") { eff.sport = d.sport; if (isKey(d.day)) eff.day = d.day; }
      occ.push({ id, index: i, planned: { day: day0, sport: p.sport, minutes: p.minutes, note: p.note }, decision: d ? { kind: d.kind, at: d.at || null, ...(d.day ? { day: d.day } : {}), ...(d.sport ? { sport: d.sport } : {}), ...(d.session ? { session: d.session } : {}) } : null, effective: eff, link: null, candidates: [], notice: null });
    });

    // 2. Ties the athlete chose. A tie whose session left the journal or the week is said, and the occurrence is open again.
    const taken = new Set();
    for (const o of occ) {
      if (o.decision?.kind !== "link") continue;
      const s = inWeek.find((x) => x.id === o.decision.session);
      if (s && !taken.has(s.id)) {
        o.link = { session: s.id, how: "manual" };
        taken.add(s.id);
      } else {
        const other = byId.get(o.decision.session);
        o.notice = !other ? "removed" : !counted(other.log) ? "not-counted" : other.day < w || other.day > to ? "other-week" : "taken";
      }
    }

    // 3. Clear ties: same sport, same effective day, as many sessions as occurrences.
    const open = occ.filter((o) => !o.link && o.decision?.kind !== "skip" && o.decision?.kind !== "none");
    const groups = new Map();
    for (const o of open) {
      const g = `${o.effective.day}|${o.effective.sport}`;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(o);
    }
    for (const [g, list] of groups) {
      const [day, sport] = g.split("|");
      const free = inWeek.filter((s) => !taken.has(s.id) && s.day === day && s.sport === sport);
      if (!free.length) continue;
      if (free.length === list.length) {
        list.forEach((o, i) => { const s = free[i]; if (s) { o.link = { session: s.id, how: "auto" }; taken.add(s.id); } });
      } else {
        for (const o of list) o.candidates = free.map((s) => s.id);
      }
    }
    // 4. Nothing of that sport, but a session of another sport that day: it may be a replacement or an extra — the athlete says.
    for (const o of open) {
      if (o.link || o.candidates.length) continue;
      const other = inWeek.filter((s) => !taken.has(s.id) && s.day === o.effective.day);
      if (other.length) { o.candidates = other.map((s) => s.id); o.otherSport = true; }
    }

    // 5. State and the single gap of each occurrence.
    const facts = (id) => {
      const s = inWeek.find((x) => x.id === id);
      return s ? { id: s.id, day: s.day, sport: s.sport, log: s.log } : null;
    };
    for (const o of occ) {
      const s = o.link ? facts(o.link.session) : null;
      if (s) {
        o.actual = { day: s.day, sport: s.sport };
        o.status = "done";
        o.gap = s.sport !== o.planned.sport ? "replaced" : s.day !== o.planned.day ? "moved" : null;
      } else if (o.decision?.kind === "skip") {
        o.status = "skipped";
        o.gap = "skipped";
      } else if (o.candidates.length) {
        o.status = "ask";
        o.gap = null;
      } else {
        const past = o.effective.day < today;
        o.status = paused && (past || w < current) ? "paused" : past ? "missed" : o.effective.day === today ? "today" : "planned";
        o.gap = o.status === "missed" ? "missed" : o.status === "paused" ? null : o.decision?.kind === "move" ? "moved" : o.decision?.kind === "replace" ? "replaced" : null;
      }
      if (o.decision?.kind === "none" && o.status !== "done" && o.status !== "paused") o.declined = true;
    }

    const extra = inWeek.filter((s) => !taken.has(s.id)).map((s) => ({ id: s.id, day: s.day, sport: s.sport, ask: occ.some((o) => o.status === "ask" && o.candidates.includes(s.id)) }));
    const count = (pred) => occ.filter(pred).length;
    const summary = {
      planned: occ.length,
      done: count((o) => o.status === "done"),
      asPlanned: count((o) => o.status === "done" && !o.gap),
      moved: count((o) => o.gap === "moved"),
      replaced: count((o) => o.gap === "replaced"),
      skipped: count((o) => o.gap === "skipped"),
      missed: count((o) => o.gap === "missed"),
      toDecide: count((o) => o.status === "ask"),
      upcoming: count((o) => o.status === "planned" || o.status === "today"),
      extra: extra.filter((e) => !e.ask).length,
    };
    summary.gaps = summary.moved + summary.replaced + summary.skipped + summary.missed;
    const out = { version: VERSION, week: w, to, current: w === current, past: w < current, paused, reference: { source: ref.source, at: ref.at, days: ref.days }, occurrences: occ, extra, summary };
    out.signature = signature(out);
    return out;
  }

  function signature(v) {
    return [v.week, v.reference.source, ...v.occurrences.map((o) => `${o.id}:${o.status}:${o.gap || "-"}:${o.link?.session || ""}:${o.candidates.join("+")}`), ...v.extra.map((e) => `+${e.id}`)].join("|");
  }

  /** A JSON projection without the sessions themselves (parity between clients, tests). */
  function snapshot(v) {
    return {
      week: v.week, current: v.current, past: v.past, paused: v.paused,
      reference: { source: v.reference.source, days: v.reference.days.map((d) => (d ? d.sport : null)) },
      occurrences: v.occurrences.map((o) => ({ id: o.id, planned: { day: o.planned.day, sport: o.planned.sport }, decision: o.decision ? o.decision.kind : null, effective: o.effective, status: o.status, gap: o.gap, link: o.link, candidates: o.candidates, notice: o.notice, ...(o.actual ? { actual: o.actual } : {}) })),
      extra: v.extra, summary: v.summary, signature: v.signature,
    };
  }

  /** The words of an occurrence, the same on both clients. label(sport) gives the sport's name. */
  function describe(o, { label = (s) => s } = {}) {
    const dayName = (k) => DAY_NAMES[dayIndex(k)];
    const plan = `${label(o.planned.sport)} ${dayName(o.planned.day)}`;
    const notice = o.notice === "removed" ? "La séance reliée n’est plus dans le journal." : o.notice === "not-counted" ? "La séance reliée est en vérification ou retirée : elle ne compte pas pour l’instant." : o.notice === "other-week" ? "La séance reliée a changé de semaine." : o.notice === "taken" ? "La séance reliée l’est déjà à une autre occurrence." : null;
    let status;
    if (o.status === "done") {
      const how = o.link?.how === "manual" ? "reliée par toi" : "reliée automatiquement";
      status = o.gap === "replaced" ? `Remplacée par ${label(o.actual.sport)} ${dayName(o.actual.day)} (${how})` : o.gap === "moved" ? `Déplacée ${dayName(o.actual.day)}, faite (${how})` : `Faite (${how})`;
    } else if (o.status === "skipped") status = "Écartée";
    else if (o.status === "ask") status = o.otherSport ? "Une autre séance ce jour-là : remplacement ou séance en plus ?" : `${o.candidates.length} séances possibles : laquelle correspond ?`;
    else if (o.status === "paused") status = "Semaine en pause : non faite, sans écart";
    else if (o.status === "missed") status = o.decision?.kind === "move" ? `Déplacée ${dayName(o.effective.day)}, non faite` : o.decision?.kind === "replace" ? `Remplacée par ${label(o.effective.sport)}, non faite` : "Non faite";
    else {
      const when = o.status === "today" ? "aujourd’hui" : dayName(o.effective.day);
      status = o.decision?.kind === "move" ? `Déplacée ${when}` : o.decision?.kind === "replace" ? `Remplacée par ${label(o.effective.sport)} ${when}` : o.status === "today" ? "Prévue aujourd’hui" : "À venir";
    }
    return { plan, status, notice, gap: o.gap === "moved" ? "Déplacée" : o.gap === "replaced" ? "Remplacée" : o.gap === "skipped" ? "Écartée" : o.gap === "missed" ? "Non faite" : null };
  }

  /** The week's bilan in one sentence: the start, the changes, the result. */
  function summarize(v) {
    const s = v.summary;
    if (!s.planned) return { start: "Rien n’était prévu cette semaine.", changes: "", result: s.extra ? `${s.extra} séance${s.extra > 1 ? "s" : ""} hors programme.` : "" };
    const p = (n, one, many) => `${n} ${n > 1 ? many : one}`;
    const start = `Au départ : ${p(s.planned, "séance prévue", "séances prévues")}${v.reference.source === "reconstructed" ? " (programme reconstitué : la semaine est antérieure au suivi)" : ""}.`;
    const ch = [s.moved && p(s.moved, "déplacée", "déplacées"), s.replaced && p(s.replaced, "remplacée", "remplacées"), s.skipped && p(s.skipped, "écartée", "écartées")].filter(Boolean);
    const changes = ch.length ? `Changements : ${ch.join(", ")}.` : "Aucun changement de programme.";
    const parts = [`${s.done}/${s.planned} faite${s.done > 1 ? "s" : ""}`];
    if (s.missed) parts.push(p(s.missed, "non faite", "non faites"));
    if (s.toDecide) parts.push(p(s.toDecide, "à trancher", "à trancher"));
    if (s.upcoming) parts.push(p(s.upcoming, "à venir", "à venir"));
    if (s.extra) parts.push(p(s.extra, "séance hors programme", "séances hors programme"));
    const result = `Résultat : ${parts.join(", ")}${v.paused ? " · semaine en pause, sans écart pour ce qui n’a pas été fait" : ""}. Écarts : ${s.gaps}.`;
    return { start, changes, result };
  }

  const api = { VERSION, MAX_WEEKS, DAY_KEYS, DAY_NAMES, RULES, addDays, weekOf, dayIndex, daysBetween, localKey, sessionDay, sessionId, typeDays, revisions, reference, editType, decide, merge, prune, week, snapshot, describe, summarize };
  root.TitanWeekPlan = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
