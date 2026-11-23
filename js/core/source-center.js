/* V1.6.5 — Centre des sources connectées. What each source really provides, where it stopped and how to resume it, shared by the
   website and the Android app (copied unchanged by mobile/scripts/sync-web-core.mjs). Pure: it reads what the server and the device
   already say and decides nothing the server has not decided.
   - The contract of each source is the one the code applies, not a promise: Santé Connect is read on the phone when the athlete asks
     (no background), up to 30 days back; Garmin pushes each activity once when the watch syncs and cannot be asked for a past period
     (Starter access, no history); a GPX file or a history file is read when the athlete gives it.
   - « Connecté » is only said when the access works: TITAN consent given, the source still grants it, and the last attempt did not fail.
   - Four situations are never confused: an authorisation that expired (TITAN consent still given, the source no longer grants it),
     a consent withdrawn (by the athlete in TITAN, or by the provider), a source with no new session, and a synchronisation that failed.
   - A resume is explicit and bounded: from the end of the last successful reading (one day of overlap, harmless because an import is
     keyed by its source id) to now, never further back than the source allows; what cannot be read is said, never invented.
   - An import never changes a session already in the journal: the athlete's corrections stay (private.titan_import_core, V1.6.2). */
(function (root) {
  "use strict";

  const DAY = 86400000;
  /** A run still « running » after this long was interrupted (app closed, phone switched off, network lost mid-way). */
  const STALE_RUN_MS = 15 * 60000;
  /** A source read on the phone that has not been read for this long has a missing period to resume. */
  const GAP_DAYS = 3;
  /** Garmin sends nothing when there is nothing: after this long without a push we say so, without calling it a failure. */
  const QUIET_DAYS = 14;
  const OVERLAP_MS = DAY;

  const FIELD_LABELS = {
    sport: "Sport", start: "Début", duration: "Durée", distance: "Distance", elevation: "Dénivelé", heart: "Fréquence cardiaque",
    track: "Tracé", note: "Note et ressenti", steps: "Pas par jour",
  };

  /** The real contract of every source, as the code applies it today. `pilot`: inside the V1.6 pilot; `validated`: a real activity
      was recovered on a real device or account (none yet: no device nor test account was attached to the proofs of this lot). */
  const CONTRACTS = {
    health_connect: {
      name: "Santé Connect", kind: "device_read", where: "android", pilot: true, validated: false,
      collect: "Lue sur ton téléphone quand tu ouvres TITAN ou que tu le demandes. Rien en arrière-plan.",
      replay: { supported: true, maxDays: 30, defaultDays: 7, historyBeforeGrantDays: 30 },
      replayNote: "Une reprise relit au plus les 30 derniers jours, et Santé Connect ne donne pas les séances de plus de 30 jours avant ta première autorisation.",
      fields: { sport: true, start: true, duration: true, distance: false, elevation: false, heart: false, track: false, note: false, steps: true },
      fieldNotes: { distance: "Santé Connect ne transmet pas encore de distance à TITAN.", heart: "Jamais lue.", track: "Jamais lu." },
      sports: "Les types d’exercice sans ambiguïté (course, vélo, marche, natation, musculation…). Arts martiaux, ski, pagaie, frisbee et « autre » sont exclus.",
      withdraw: "TITAN ne lit plus rien dans Santé Connect et le serveur refuse tout nouvel import de cette source.",
    },
    garmin: {
      name: "Garmin", kind: "push", where: "server", pilot: false, validated: false,
      collect: "Garmin envoie chaque activité une seule fois, quand ta montre se synchronise avec Garmin Connect.",
      replay: { supported: false },
      replayNote: "Garmin ne renvoie pas une période passée : une activité faite pendant une interruption de la liaison ne revient pas. Saisis-la ou importe son GPX.",
      fields: { sport: true, start: true, duration: true, distance: true, elevation: false, heart: false, track: false, note: false, steps: false },
      fieldNotes: { heart: "Jamais conservée.", track: "Aucune trace GPS récupérée." },
      sports: "Les types d’activité Garmin reconnus par TITAN ; un type inconnu est ignoré, jamais deviné.",
      withdraw: "Garmin ne peut plus rien envoyer à ton compte : TITAN se retire aussi chez Garmin quand Garmin le confirme.",
    },
    gpx: {
      name: "Fichier GPX", kind: "file", where: "any", pilot: true, validated: false,
      collect: "Lu quand tu choisis un fichier, sur le site ou dans l’application.",
      replay: { supported: true, file: true },
      replayNote: "Réimporter le même fichier est reconnu par son empreinte : le choix déjà fait est gardé.",
      fields: { sport: true, start: true, duration: true, distance: true, elevation: true, heart: false, track: false, note: true, steps: false },
      fieldNotes: { track: "Seules les statistiques du tracé sont gardées." },
      sports: "Le sport que tu choisis.",
      withdraw: null,
    },
    archive: {
      name: "Historique importé", kind: "file_batch", where: "any", pilot: true, validated: false,
      collect: "Un fichier d’historique (export TITAN, profil CSV, Strava) lu ligne par ligne, en lots reprenables.",
      replay: { supported: true, file: true },
      replayNote: "Un lot interrompu reprend à la ligne attendue par le serveur, sur n’importe quel appareil.",
      fields: { sport: true, start: true, duration: true, distance: true, elevation: false, heart: false, track: false, note: true, steps: false },
      fieldNotes: {},
      sports: "Ceux que tu classes à l’aperçu.",
      withdraw: null,
    },
  };

  const EXCLUSIONS = {
    unmapped_type: "type d’exercice ambigu ou non reconnu",
    unknown_sport: "sport inconnu de TITAN",
    invalid_id: "séance sans identifiant",
    too_short: "moins d’une minute",
    too_long: "plus de 24 heures",
    out_of_range: "durée ou distance hors limites",
    invalid_date: "date invalide ou future",
    invalid_payload: "données illisibles",
    refused: "refusée par le serveur",
  };

  const ERRORS = {
    NETWORK: "Connexion indisponible pendant la lecture.",
    ANDROID_PERMISSION: "Android n’accorde plus la lecture à TITAN.",
    HC_UNAVAILABLE: "Santé Connect n’a pas répondu.",
    HC_READ: "Santé Connect a refusé la lecture.",
    CONSENT_REQUIRED: "La source a été retirée : la lecture a été bloquée.",
    RATE_LIMITED: "Trop d’imports en une heure : reprends un peu plus tard.",
    SERVER: "Le serveur n’a pas confirmé les imports.",
    INTERRUPTED: "La lecture s’est arrêtée avant la fin (application fermée ou réseau coupé).",
  };

  const time = (v) => { const t = Date.parse(v); return Number.isFinite(t) ? t : null; };
  const iso = (t) => new Date(t).toISOString();
  function when(v, tz) {
    const t = typeof v === "number" ? v : time(v);
    if (t === null) return "";
    return new Date(t).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", ...(tz ? { timeZone: tz } : {}) });
  }
  function day(v, tz) {
    const t = typeof v === "number" ? v : time(v);
    if (t === null) return "";
    return new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "long", ...(tz ? { timeZone: tz } : {}) });
  }
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  /** The runs as the server returns them, newest first, with a run still « running » after 15 minutes read as interrupted. */
  function runsOf(entry, now) {
    const list = Array.isArray(entry?.runs) ? entry.runs.filter((r) => r && time(r.started_at) !== null) : [];
    return list
      .map((r) => (r.outcome === "running" && now - time(r.started_at) > STALE_RUN_MS ? { ...r, outcome: "partial", error_code: r.error_code || "INTERRUPTED", stale: true } : r))
      .sort((a, b) => time(b.started_at) - time(a.started_at));
  }
  const succeeded = (r) => r.outcome === "ok" || r.outcome === "empty";
  const failedRun = (r) => r.outcome === "failed" || r.outcome === "partial" || r.outcome === "denied";

  /** Last success and last attempt. For Garmin a push received is a success of the chain (the server keeps one push run per day). */
  function milestones(entry, now) {
    const runs = runsOf(entry, now);
    const attempt = runs.find((r) => r.outcome !== "running") || runs[0] || null;
    const success = runs.find(succeeded) || null;
    let lastSuccess = success ? time(success.finished_at) ?? time(success.started_at) : null;
    const event = time(entry?.link?.last_event_at);
    if (event !== null && (lastSuccess === null || event > lastSuccess)) lastSuccess = event;
    const lastAttempt = attempt ? time(attempt.finished_at) ?? time(attempt.started_at) : lastSuccess;
    return { runs, attempt, success, lastSuccess, lastAttempt };
  }

  /** The bounded window a resume reads: from the end of the last successful window (minus one day of overlap) to now, clamped to what
      the source allows. `unavailableBefore` is said to the athlete: the part of the missing period nothing can bring back. */
  function replayWindow(source, { now = Date.now(), lastWindowTo = null, grantedAt = null, from = null } = {}) {
    const c = CONTRACTS[source];
    if (!c || !c.replay.supported || c.replay.file) return null;
    const max = c.replay.maxDays * DAY;
    const wanted = from !== null ? time(from) ?? Number(from) : time(lastWindowTo) !== null ? time(lastWindowTo) - OVERLAP_MS : now - c.replay.defaultDays * DAY;
    let floor = now - max;
    const granted = time(grantedAt);
    if (granted !== null && c.replay.historyBeforeGrantDays) floor = Math.max(floor, granted - c.replay.historyBeforeGrantDays * DAY);
    const start = Math.max(Math.min(wanted, now), floor);
    return {
      from: iso(start), to: iso(now), days: Math.max(1, Math.ceil((now - start) / DAY)),
      clamped: wanted < floor, unavailableBefore: wanted < floor ? iso(floor) : null, requestedFrom: iso(Math.min(wanted, now)),
    };
  }

  /** The outcome of one reading: failed (nothing read), partial (some imports not confirmed), empty (nothing new), ok. */
  function summarizeRun({ read = 0, results = [], excluded = {}, error = null } = {}) {
    const counts = { read, imported: 0, linked: 0, duplicate: 0, excluded: 0, failed: 0, review: 0 };
    for (const r of results) {
      if (r === "imported" || r?.status === "imported") counts.imported++;
      else if (r === "linked" || r?.status === "linked") { counts.linked++; if (r?.needs_review) counts.review++; }
      else if (r === "duplicate" || r?.status === "duplicate") counts.duplicate++;
      else counts.failed++;
    }
    for (const n of Object.values(excluded || {})) counts.excluded += num(n);
    const outcome = error ? (error === "ANDROID_PERMISSION" || error === "CONSENT_REQUIRED" ? "denied" : "failed")
      : counts.failed > 0 ? "partial" : counts.imported + counts.linked > 0 ? "ok" : "empty";
    return { outcome, counts, error_code: error || (counts.failed > 0 ? "SERVER" : null) };
  }

  function exclusionsOf(runs) {
    const latest = runs.find((r) => r.excluded && Object.keys(r.excluded).length) || null;
    if (!latest) return [];
    return Object.entries(latest.excluded).filter(([, n]) => num(n) > 0)
      .map(([reason, n]) => ({ reason, n: num(n), label: EXCLUSIONS[reason] || "exclue" }));
  }

  function coverageOf(source, entry) {
    const c = CONTRACTS[source];
    const fields = Object.entries(c.fields).map(([field, covered]) => ({ field, label: FIELD_LABELS[field], covered, note: c.fieldNotes[field] || null }));
    const sports = Array.isArray(entry?.sports) ? entry.sports.filter((s) => s && s.sport).map((s) => ({ sport: s.sport, n: num(s.n) })) : [];
    const total = num(entry?.fields?.total);
    const withDistance = num(entry?.fields?.distance);
    return { fields, sports, received: total, withDistance, rule: c.sports };
  }

  const ACTIONS = {
    authorize: "Autoriser",
    reauthorize: "Redonner l’accès",
    open_settings: "Ouvrir Santé Connect",
    update: "Mettre à jour Santé Connect",
    replay: "Reprendre la période manquante",
    retry: "Réessayer",
    connect_garmin: "Connecter Garmin",
    finish_garmin: "Terminer la liaison",
    review: "Vérifier dans le journal",
    resume_batch: "Reprendre l’import",
    open_import: "Importer un historique",
  };
  const action = (id, extra) => ({ id, label: ACTIONS[id], ...(extra || {}) });

  /** One source as the athlete reads it: state, label, tone, whether « Connecté » may be said, what happened and what to do.
      `device` is what the phone itself says (Android only): { availability, access: { steps, exercise } }. `here`: true when this
      client can read the source itself (Android for Santé Connect). */
  function diagnose(source, entry, { now = Date.now(), device = null, here = false, tz } = {}) {
    const c = CONTRACTS[source];
    if (!c) return null;
    const m = milestones(entry, now);
    const base = {
      source, name: c.name, kind: c.kind, pilot: c.pilot, validated: c.validated, collect: c.collect, replayNote: c.replayNote,
      lastSuccess: m.lastSuccess !== null ? iso(m.lastSuccess) : null, lastAttempt: m.lastAttempt !== null ? iso(m.lastAttempt) : null,
      lastSuccessText: m.lastSuccess !== null ? when(m.lastSuccess, tz) : null, lastAttemptText: m.lastAttempt !== null ? when(m.lastAttempt, tz) : null,
      counts: { imported: num(entry?.counts?.imported), linked: num(entry?.counts?.linked), archived: num(entry?.counts?.archived), review: num(entry?.counts?.review) },
      coverage: coverageOf(source, entry), exclusions: exclusionsOf(m.runs), conflicts: num(entry?.counts?.review),
      replay: null, actions: [], withdraw: c.withdraw,
    };
    const out = (state, label, tone, connected, detail, actions = []) => {
      const list = [...actions];
      if (base.conflicts > 0 && connected) list.push(action("review", { n: base.conflicts }));
      return { ...base, state, label, tone, connected, detail, actions: list };
    };

    if (c.kind === "file") return out("file", "À la demande", "default", false, c.collect);
    if (c.kind === "file_batch") {
      const b = entry?.batch;
      if (!b) return out("off", "Aucun import", "default", false, "Aucun fichier d’historique importé pour l’instant.", [action("open_import")]);
      const next = num(b.next_row), total = num(b.total_rows);
      if (b.status === "open" && next <= total) {
        return out("interrupted", "Import en pause", "warn", false,
          `Le lot « ${b.file_name || "historique"} » s’est arrêté à la ligne ${next} sur ${total}. Rouvre le même fichier : l’import reprend à cette ligne, sans rien importer deux fois.`,
          [action("resume_batch", { batch: b.id })]);
      }
      if (b.status === "withdrawn") return out("withdrawn", "Lot retiré", "default", false, `Le dernier lot a été retiré le ${day(b.withdrawn_at, tz)}.`, [action("open_import")]);
      return out("ok", "Terminé", "ok", false, `Dernier lot terminé le ${day(b.finished_at || b.updated_at, tz)} : ${plural(num(b.counts?.added), "séance ajoutée", "séances ajoutées")}.`, [action("open_import")]);
    }

    if (source === "health_connect" && device) {
      if (device.availability === "unsupported" || device.availability === "unavailable") {
        return out("unavailable", "Indisponible", "default", false, "Santé Connect n’est pas disponible sur ce téléphone (Android 9 ou plus avec l’application Santé Connect).");
      }
      if (device.availability === "update_required") return out("update", "Mise à jour requise", "warn", false, "TITAN a besoin d’une version plus récente de Santé Connect.", [action("update")]);
    }
    const consent = entry?.consent || null;
    if (!consent) {
      const first = source === "garmin" ? action("connect_garmin") : here ? action("authorize") : null;
      return out("off", "Non connecté", "default", false, source === "garmin" ? "Tes activités Garmin peuvent rejoindre ton journal après ton autorisation." : here ? "Facultatif : tes séances et tes pas enregistrés par ta montre ou une autre application." : "Se connecte depuis l’application Android.", first ? [first] : []);
    }
    const kept = base.counts.imported > 0 ? ` ${plural(base.counts.imported, "séance déjà importée reste", "séances déjà importées restent")} dans ton journal : tu peux les archiver.` : "";
    if (!consent.granted) {
      const since = consent.revoked_at ? ` le ${day(consent.revoked_at, tz)}` : "";
      if (consent.revoked_by === "provider") {
        return out("provider_withdrawn", "Retirée chez Garmin", "warn", false, `Garmin a signalé${since} que TITAN n’a plus accès à tes activités (retrait dans Garmin Connect ou permission changée). Plus rien n’est importé.${kept}`,
          [action("connect_garmin")]);
      }
      return out("withdrawn", "Retirée", "default", false, `Tu as retiré cette source${since}. Plus aucune séance n’est lue ni importée.${kept}`,
        source === "garmin" ? [action("connect_garmin")] : here ? [action("authorize")] : []);
    }

    // TITAN consent given: does the source still grant the access?
    if (source === "health_connect") {
      const deniedRun = m.attempt && m.attempt.outcome === "denied" && m.attempt.error_code === "ANDROID_PERMISSION";
      const lost = device ? !(device.access?.exercise || device.access?.steps) : deniedRun;
      if (lost) {
        return out("expired", "Autorisation expirée", "warn", false,
          "Ton accord dans TITAN est toujours là, mais Android n’accorde plus la lecture à TITAN : l’accès a été retiré dans Santé Connect, ou remis à zéro par Android après une longue inactivité. Rien n’est lu tant qu’il n’est pas rétabli.",
          here ? [action("reauthorize"), action("open_settings")] : []);
      }
    }
    if (source === "garmin" && entry?.link && !entry.link.linked) {
      const ended = entry.link.ended_at;
      return out("expired", ended ? "Liaison expirée" : "À terminer", "warn", false,
        ended ? `La liaison avec Garmin s’est terminée le ${day(ended, tz)} sans retrait de ton accord : relie Garmin de nouveau pour recevoir tes activités.` : "Tu as autorisé l’import, mais la liaison avec Garmin n’est pas terminée.",
        [action("finish_garmin")]);
    }

    const last = m.attempt;
    if (last && (last.outcome === "failed" || last.outcome === "denied")) {
      const why = ERRORS[last.error_code] || "La lecture n’a pas abouti.";
      const plan = replayWindow(source, { now, lastWindowTo: m.success?.window_to ?? null, grantedAt: consent.granted_at });
      return { ...out("failed", "Synchronisation en échec", "err", false, `Dernière tentative le ${when(last.started_at, tz)} : ${why}${m.lastSuccess !== null ? ` Dernière réussite : ${when(m.lastSuccess, tz)}.` : ""}`,
        here && plan ? [action("replay", { window: plan })] : here ? [action("retry")] : []), replay: plan };
    }
    if (last && last.outcome === "partial") {
      const plan = replayWindow(source, { now, from: last.window_from, grantedAt: consent.granted_at });
      const done = num(last.counts?.imported) + num(last.counts?.linked) + num(last.counts?.duplicate);
      return { ...out("interrupted", "Interrompue", "warn", false, `La lecture du ${when(last.started_at, tz)} s’est arrêtée avant la fin : ${plural(done, "séance confirmée", "séances confirmées")}, ${plural(num(last.counts?.failed), "non confirmée", "non confirmées")}. ${ERRORS[last.error_code] || ""} Reprends la même période : ce qui est déjà importé ne l’est pas deux fois.`.replace(/\s+/g, " ").trim(),
        here && plan ? [action("replay", { window: plan })] : []), replay: plan };
    }

    if (c.kind === "device_read") {
      const plan = replayWindow(source, { now, lastWindowTo: m.success?.window_to ?? null, grantedAt: consent.granted_at });
      if (m.lastSuccess === null || now - m.lastSuccess > GAP_DAYS * DAY) {
        const lost = plan?.unavailableBefore ? ` Avant le ${day(plan.unavailableBefore, tz)}, Santé Connect ne peut plus rien donner : saisis ces séances ou importe leur fichier.` : "";
        return { ...out("gap", "À reprendre", "warn", true, `${m.lastSuccess === null ? "Aucune lecture réussie pour l’instant." : `Dernière lecture réussie : ${when(m.lastSuccess, tz)}.`} La période du ${day(plan.from, tz)} à aujourd’hui n’a pas été relue.${lost}`,
          here ? [action("replay", { window: plan })] : []), replay: plan };
      }
      const s = m.success;
      const added = num(s?.counts?.imported) + num(s?.counts?.linked);
      if (added === 0) {
        return { ...out("empty", "Aucune nouvelle séance", "ok", true, `Lecture réussie le ${when(m.lastSuccess, tz)} : rien de nouveau dans Santé Connect entre le ${day(s.window_from, tz)} et le ${day(s.window_to, tz)}.`, here ? [action("replay", { window: plan, label: "Relire maintenant" })] : []), replay: plan };
      }
      return { ...out("ok", "Connecté", "ok", true, `Lecture réussie le ${when(m.lastSuccess, tz)} : ${plural(added, "séance reçue", "séances reçues")} entre le ${day(s.window_from, tz)} et le ${day(s.window_to, tz)}.`, here ? [action("replay", { window: plan, label: "Relire maintenant" })] : []), replay: plan };
    }

    // Push (Garmin): linked and authorised.
    const event = time(entry?.link?.last_event_at);
    if (event === null || now - event > QUIET_DAYS * DAY) {
      return out("empty", "Aucune nouvelle activité", "ok", true, event === null
        ? "Compte relié : Garmin n’a encore rien envoyé. Une activité arrive quand ta montre se synchronise avec Garmin Connect."
        : `Garmin n’a rien envoyé depuis le ${day(event, tz)} : soit aucune activité, soit ta montre ne s’est pas synchronisée avec Garmin Connect.`);
    }
    return out("ok", "Connecté", "ok", true, `Dernière activité reçue : ${when(event, tz)}. ${plural(base.counts.imported, "activité", "activités")} dans ton journal${base.counts.linked ? `, ${base.counts.linked} rattachée${base.counts.linked > 1 ? "s" : ""} à une séance déjà saisie` : ""}.`);
  }

  /** The center: every source the account or the device knows, in a stable order. */
  function center(data, opts = {}) {
    const bySource = new Map((Array.isArray(data?.sources) ? data.sources : []).filter((x) => x && CONTRACTS[x.source]).map((x) => [x.source, x]));
    const order = opts.order || ["health_connect", "garmin", "archive", "gpx"];
    return order.filter((s) => CONTRACTS[s]).map((s) => diagnose(s, bySource.get(s) || (s === "archive" ? { batch: data?.batch || null } : null), opts));
  }

  /** What withdrawing a source does, in plain words, before the athlete confirms. */
  function withdrawText(source, entry) {
    const c = CONTRACTS[source];
    if (!c || !c.withdraw) return [];
    const n = num(entry?.counts?.imported);
    return [
      c.withdraw,
      n > 0 ? `${plural(n, "séance déjà importée reste", "séances déjà importées restent")} dans ton journal, avec tes corrections et tes récompenses. « Archiver » les retire du journal sans les supprimer.` : "Aucune séance de cette source n’est dans ton journal.",
      "Tu peux autoriser de nouveau plus tard : rien de ce qui est déjà importé ne sera importé deux fois.",
    ];
  }

  /** The measure of the lot. For every interrupted run (failed, partial or stale), the first later successful run whose window covers
      it: the resume delay, and whether an activity of that window is visible in the journal afterwards. */
  function measure(runs, activities = [], { now = Date.now() } = {}) {
    const list = runsOf({ runs }, now).slice().reverse();
    const interrupted = list.filter(failedRun);
    const delays = [];
    let recovered = 0, visible = 0;
    for (const r of interrupted) {
      const from = time(r.window_from), to = time(r.window_to) ?? time(r.started_at);
      const fix = list.find((x) => time(x.started_at) > time(r.started_at) && succeeded(x)
        && (from === null || time(x.window_from) <= from) && (to === null || time(x.window_to) >= to));
      if (!fix) continue;
      recovered++;
      delays.push((time(fix.finished_at) ?? time(fix.started_at)) - time(r.started_at));
      // A denial read nothing and carries no window: what counts is what the resume that closed it brought back in its own window.
      const lo = from ?? time(fix.window_from), hi = r.window_to ? to : time(fix.window_to);
      const seen = activities.some((a) => a && a.visible !== false && time(a.started_at) !== null && (lo === null || time(a.started_at) >= lo) && (hi === null || time(a.started_at) <= hi));
      if (seen) visible++;
    }
    delays.sort((a, b) => a - b);
    const median = delays.length ? delays[Math.floor((delays.length - 1) / 2)] : null;
    return {
      interrupted: interrupted.length, recovered, visible,
      recoveredRate: interrupted.length ? recovered / interrupted.length : null,
      visibleRate: interrupted.length ? visible / interrupted.length : null,
      medianDelayMinutes: median === null ? null : Math.round(median / 60000),
      maxDelayMinutes: delays.length ? Math.round(delays[delays.length - 1] / 60000) : null,
    };
  }

  const api = { version: 1, CONTRACTS, EXCLUSIONS, ERRORS, FIELD_LABELS, STALE_RUN_MS, GAP_DAYS, QUIET_DAYS, replayWindow, summarizeRun, diagnose, center, withdrawText, measure, runsOf };
  root.TitanSources = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
