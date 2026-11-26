// V1.8.6 — Agenda et rendez-vous d’équipe: the shared module mirrors the server rule and words only what the server gives.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const RAW = require("../js/core/club-agenda.js");
// The module joins a time with non-breaking spaces; the assertions read them as plain spaces.
const nb = (v) => (typeof v === "string" ? v.replace(/\u00a0/g, " ") : Array.isArray(v) ? v.map(nb) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, nb(x)])) : v);
const A = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, typeof v === "function" ? (...a) => nb(v(...a)) : v]));
globalThis.TitanCordee = require("../js/core/cordee.js");
const D = require("../js/core/social-digest.js");
const sql = readFileSync(new URL("../supabase/migrations/20261130104600_club_agenda.sql", import.meta.url), "utf8");
const NOW = Date.parse("2026-11-24T12:00:00Z");

const slot = (over = {}) => ({
  id: "s1", event: "e1", n: 1, occurrences: 1, recurrence: "once", title: "Sortie du samedi", area: "Parc de la Tête d’Or", durationMin: 120,
  startsAt: "2026-11-28T08:00:00Z", endsAt: "2026-11-28T10:00:00Z", plannedAt: "2026-11-28T08:00:00Z", moved: false, phase: "upcoming",
  series: "active", fallback: "Si pluie : séance de renfo au gymnase", fallbackOn: false, capacity: 3, full: false,
  counts: { yes: 2, maybe: 1, waitlist: 0, no: 1 }, hasPlace: true, place: null, code: null, me: null, can: ["yes", "maybe", "no"],
  report: null, history: [{ kind: "created", n: null, from: null, to: "2026-11-28T08:00:00Z", at: "2026-11-24T10:00:00Z" }], roster: null, ...over,
});

test("the rule of the module is the rule of the migration", () => {
  assert.match(sql, /char_length\(title\) between 3 and 60/);
  assert.deepEqual([A.RULE.titleMin, A.RULE.titleMax], [3, 60]);
  assert.match(sql, /duration_min between 15 and 480/);
  assert.deepEqual([A.RULE.durationMin, A.RULE.durationMax], [15, 480]);
  assert.match(sql, /capacity between 2 and 100/);
  assert.deepEqual([A.RULE.capacityMin, A.RULE.capacityMax], [2, 100]);
  assert.match(sql, /v_count not between 2 and 12/);
  assert.equal(A.RULE.occurrencesMax, 12);
  assert.match(sql, /v_first < now\(\) \+ interval '30 minutes' or v_first > now\(\) \+ interval '60 days'/);
  assert.deepEqual([A.RULE.leadMinutes, A.RULE.horizonDays], [30, 60]);
  assert.match(sql, /now\(\) >= v_end \+ interval '7 days'/);
  assert.equal(A.RULE.presenceDays, 7);
  assert.match(sql, /'visible', v_linked >= 3/);
  assert.equal(A.RULE.reportThreshold, 3);
  for (const code of sql.matchAll(/raise exception '([A-Z_]+)'/g)) {
    if (code[1] === "AUTH_REQUIRED") continue;
    assert.ok(A.MESSAGES[code[1]], `a clear message for ${code[1]}`);
  }
  // A refusal is worded by its own code, never by a shorter code it contains.
  assert.match(A.message({ message: "LOG_NOT_ELIGIBLE" }), /une de tes séances confirmées du jour du rendez-vous/);
  assert.match(A.message({ message: "NOT_ELIGIBLE" }), /un jour après la création du compte/);
  assert.match(A.message({ message: "SLOT_NOT_STARTED" }), /une fois le rendez-vous commencé/);
  // The history kinds the server writes are all worded (the renewal of a link is not a change of the meeting).
  const kinds = sql.match(/kind in \(([^)]+)\)/)[1].split(",").map((k) => k.trim().replace(/'/g, ""));
  for (const k of kinds) if (k !== "code_renewed") assert.ok(A.HISTORY[k], `history worded for ${k}`);
});

test("a Paris time stays the same across the change of hour, and the form is checked like the server", () => {
  assert.equal(A.parisInstant("2027-03-27", "18:30"), "2027-03-27T17:30:00.000Z", "winter: UTC+1");
  assert.equal(A.parisInstant("2027-03-29", "18:30"), "2027-03-29T16:30:00.000Z", "summer: UTC+2");
  assert.equal(A.parisInstant("2026-10-24", "09:00"), "2026-10-24T07:00:00.000Z");
  assert.equal(A.parisInstant("2026-10-26", "09:00"), "2026-10-26T08:00:00.000Z");
  assert.equal(A.time("2027-03-29T16:30:00Z"), "18 h 30");
  assert.equal(A.parisInstant("2026-11-28", "25:00"), null);
  const form = { title: "Sortie du samedi", area: "Parc", durationMin: 120, capacity: "", recurrence: "once", occurrences: 1, startsAt: "2026-11-28T08:00:00Z" };
  assert.equal(A.validate(form, NOW), null);
  assert.equal(A.validate({ ...form, title: "ab" }, NOW), "AGENDA_INVALID");
  assert.equal(A.validate({ ...form, capacity: "1" }, NOW), "AGENDA_INVALID");
  assert.equal(A.validate({ ...form, durationMin: 10 }, NOW), "AGENDA_INVALID");
  assert.equal(A.validate({ ...form, startsAt: "2026-11-24T12:10:00Z" }, NOW), "AGENDA_INVALID", "30 minutes ahead at least");
  assert.equal(A.validate({ ...form, startsAt: "2027-01-24T12:10:00Z" }, NOW), "AGENDA_INVALID", "60 days at most");
  assert.equal(A.validate({ ...form, recurrence: "weekly", occurrences: 1 }, NOW), "AGENDA_INVALID");
  assert.equal(A.validate({ ...form, recurrence: "weekly", occurrences: 6 }, NOW), null);
  assert.deepEqual(A.payload({ ...form, title: "  Sortie <b>du</b>  samedi ", capacity: "8", place: "" }),
    { title: "Sortie bdu/b samedi", area: "Parc", place: null, fallback: null, durationMin: 120, capacity: 8, recurrence: "once", occurrences: 1, startsAt: "2026-11-28T08:00:00Z" });
});

test("a member reads counts, never a name; the precise place only when the server gives it", () => {
  const s = slot();
  assert.equal(A.header(s), "samedi 28 novembre à 9 h 00 · 2 h · Parc de la Tête d’Or");
  assert.equal(A.counts(s), "2 viennent · 1 peut-être · 1 ne vient pas · 2 places prises sur 3");
  assert.equal(A.counts(slot({ counts: { yes: 0, maybe: 0, waitlist: 0, no: 0 }, capacity: 8 })), "Pas encore de réponse · 8 places");
  assert.equal(RAW.time("2027-03-29T16:30:00Z"), "18\u00a0h\u00a030", "a time never splits across two lines");
  assert.equal(A.place(s), "Le lieu précis est donné à ceux qui viennent, hésitent ou attendent une place.");
  assert.equal(A.place(slot({ place: "Parking nord" })), "Lieu précis : Parking nord");
  assert.equal(A.place(slot({ hasPlace: false })), "");
  assert.deepEqual(A.status(s), ["En cas de changement : Si pluie : séance de renfo au gymnase"]);
  assert.equal(A.mine(s), "Tu n’as pas encore répondu.");
  assert.match(A.role({ role: "member" }), /jamais qui a répondu quoi/);
  assert.match(A.role({ role: "organizer" }), /tu vois qui a répondu quoi/);
  assert.deepEqual(A.actions(s).map((a) => a.label), ["Je viens", "Peut-être", "Je ne viens pas"]);
});

test("capacity, waiting list, a change after the answer and the history", () => {
  const full = slot({ full: true, counts: { yes: 3, maybe: 0, waitlist: 2, no: 0 }, me: { answer: "waitlist", position: 2 }, can: ["maybe", "no", "remind"] });
  assert.equal(A.counts(full), "3 viennent · 2 en attente · 3 places prises sur 3 (complet)");
  assert.match(A.mine(full), /En attente d’une place \(2e dans la file\)\. Si une place se libère, elle est pour toi\./);
  assert.match(A.answered(full), /C’est complet : tu es 2e dans la file d’attente/);
  const moved = slot({ moved: true, startsAt: "2026-11-29T09:00:00Z", fallbackOn: true, me: { answer: "yes", toConfirm: true, promoted: true, reminder: true }, can: ["maybe", "no", "remind", "move", "fallback", "cancel"],
    history: [{ kind: "created", at: "2026-11-24T10:00:00Z" }, { kind: "moved", from: "2026-11-28T08:00:00Z", to: "2026-11-29T09:00:00Z", at: "2026-11-24T11:00:00Z" }, { kind: "fallback_on", at: "2026-11-24T11:05:00Z" }] });
  assert.deepEqual(A.status(moved), ["Déplacé : prévu d’abord samedi 28 novembre à 9 h 00.", "Plan de repli activé : Si pluie : séance de renfo au gymnase"]);
  assert.match(A.mine(moved), /une place s’est libérée pour toi\. L’heure ou le plan a changé depuis ta réponse : confirme-la ou change d’avis\. Rappel demandé/);
  assert.deepEqual(A.history(moved), ["Proposé le 24 novembre.", "Déplacé le 24 novembre : de samedi 28 novembre à 9 h 00 à dimanche 29 novembre à 10 h 00.", "Passé au plan de repli le 24 novembre."]);
  assert.deepEqual(A.actions(moved).map((a) => a.label), ["Peut-être", "Je ne viens pas", "Ne plus me le rappeler", "Déplacer", "Revenir au plan prévu", "Annuler ce rendez-vous"]);
  assert.ok(!JSON.stringify(A.history(moved)).match(/qa_|par [A-Z]/), "the history never says who");
});

test("a weekly series: cancelled in place, resumed with the same occurrences", () => {
  const view = { role: "organizer" };
  const s = slot({ recurrence: "weekly", n: 2, occurrences: 12, code: "ABCDEFGH" });
  assert.match(A.header(s), /rendez-vous 2 sur 12, chaque semaine$/);
  assert.deepEqual(A.seriesActions(s, view).map((a) => a.id), ["new_code", "cancel_series"]);
  assert.deepEqual(A.seriesActions(s, { role: "member" }), []);
  const off = slot({ recurrence: "weekly", n: 2, occurrences: 12, phase: "cancelled", series: "cancelled", can: [], code: "ABCDEFGH" });
  assert.deepEqual(A.seriesActions(off, view).map((a) => a.id), ["resume_series"]);
  assert.deepEqual(A.status(off), ["Annulé : la série a été annulée par les administrateurs du club."]);
  assert.equal(A.mine(off), "");
  assert.match(A.confirmText("cancel_series").message, /sans rien effacer : la série pourra être reprise avec les mêmes rendez-vous/);
  assert.deepEqual(A.history(slot({ recurrence: "weekly", occurrences: 12, history: [{ kind: "created", at: "2026-11-24T10:00:00Z" }, { kind: "cancelled", n: 3, at: "2026-11-24T10:10:00Z" }, { kind: "series_cancelled", at: "2026-11-24T10:20:00Z" }, { kind: "series_resumed", at: "2026-11-24T10:30:00Z" }] })),
    ["Proposé le 24 novembre, 12 rendez-vous chaque semaine.", "Annulé (rendez-vous 3) le 24 novembre.", "Série annulée le 24 novembre.", "Série reprise le 24 novembre."]);
});

test("the finished card: a presence is a statement, a session is linked only by its owner, totals from 3", () => {
  const ended = slot({ phase: "ended", can: ["attend"], counts: { yes: 3, maybe: 0, waitlist: 1, no: 1 }, report: { present: 1, linked: 1, threshold: 3, visible: false } });
  assert.equal(A.mine(ended), "Tu peux dire si tu y étais. Rien n’est écrit dans ton journal.");
  assert.deepEqual(A.report(ended).lines, ["1 présence déclarée · 1 séance associée", "Les totaux du groupe s’affichent à partir de 3 séances associées : personne ne peut en déduire la séance d’un autre.", "Aucune séance n’est écrite à ta place : chacun choisit d’associer la sienne, ou non."]);
  assert.deepEqual(A.actions(ended).map((a) => a.label), ["J’y étais", "Je n’y étais pas"]);
  const there = slot({ phase: "ended", can: ["attend", "link"], me: { answer: "yes", attended: true, linked: null, candidates: [{ id: "l1", sport: "cycling", minutes: 90, unit: "km", val: 38 }] },
    report: { present: 4, linked: 3, threshold: 3, visible: true, minutes: 270, km: 110, sports: 1 } });
  assert.deepEqual(A.candidates(there, (s) => ({ cycling: "Vélo" })[s]), [{ id: "l1", label: "Vélo · 90 min · 38 km" }]);
  assert.deepEqual(A.actions(there).map((a) => a.label), ["Je n’y étais pas"]);
  assert.equal(A.report(there).lines[1], "270 min d’effort ensemble · 110 km · 1 discipline");
  const linked = slot({ phase: "ended", can: ["attend", "unlink"], me: { answer: "yes", attended: true, linked: { id: "l1", sport: "cycling", minutes: 90 } } });
  assert.equal(A.linked(linked, () => "Vélo"), "Ta séance associée : Vélo · 90 min.");
  assert.deepEqual(A.actions(linked).map((a) => a.label), ["Je n’y étais pas", "Retirer ma séance du bilan"]);
  assert.equal(A.result("attend"), "C’est noté. Rien n’est écrit dans ton journal.");
});

test("an invitation link: nothing is said of an expired or unknown meeting", () => {
  assert.equal(A.code(" abcd-efgh "), "ABCDEFGH");
  assert.equal(A.inviteLink("abcdefgh", "https://titan.example/"), "https://titan.example/social.html?rdv=ABCDEFGH");
  assert.equal(A.invite({ status: "open", slot: slot() }), null);
  assert.equal(A.invite({ status: "expired" }), "Cette invitation a expiré : le rendez-vous est passé ou la série a été annulée.");
  assert.match(A.invite({ status: "unavailable" }), /ne mène à aucun rendez-vous de tes clubs/);
  assert.match(A.invite(null), /ne mène à aucun rendez-vous/);
  for (const r of [A.invite({ status: "expired" }), A.invite({ status: "unavailable" })]) assert.ok(!/Sortie|Parc|9 h/.test(r));
});

test("« Depuis ta dernière visite » asks only what waits for an answer, through the agenda's words", () => {
  const items = [
    { slot: "s1", club: "c1", clubName: "Les Rouleurs", title: "Sortie du samedi", startsAt: "2026-11-28T08:00:00Z", reason: "promoted" },
    { slot: "s2", club: "c1", clubName: "Les Rouleurs", title: "Footing", startsAt: "2026-11-26T17:30:00Z", reason: "toConfirm" },
    { slot: "s3", club: "c1", clubName: "Les Rouleurs", title: "Footing", startsAt: "2026-12-03T17:30:00Z", reason: "answer" },
    { slot: "s4", club: "c1", clubName: "Les Rouleurs", title: "Sortie", startsAt: "2026-11-21T08:00:00Z", reason: "presence" },
    { slot: "s5", club: "c1", clubName: "Les Rouleurs", title: "Piste", startsAt: "2026-11-25T08:00:00Z", reason: "cancelled" },
    { slot: "s6", club: "c1", clubName: "Les Rouleurs", title: "Piste", startsAt: "2026-11-25T08:00:00Z", reason: "reminder" },
    { slot: "s7", reason: "unknown" },
  ];
  const l = nb(D.lines({ agenda: items }, NOW));
  assert.deepEqual(l.map((x) => x.href), Array(6).fill("#clubs"));
  assert.deepEqual(l.map((x) => x.text), [
    "Une place s’est libérée : tu es inscrit·e à « Sortie du samedi » (Les Rouleurs), samedi 28 novembre à 9 h 00.",
    "« Footing » (Les Rouleurs) a changé : c’est maintenant jeudi 26 novembre à 18 h 30. Confirme ta réponse ou change d’avis.",
    "Ton club propose « Footing » (Les Rouleurs), jeudi 3 décembre à 18 h 30. Tu viens ?",
    "« Sortie » (Les Rouleurs) est terminé : dis si tu y étais et, si tu veux, associe ta séance au bilan du groupe.",
    "« Piste » (Les Rouleurs), prévu mercredi 25 novembre à 9 h 00, est annulé.",
    "Rappel : « Piste » (Les Rouleurs), mercredi 25 novembre à 9 h 00.",
  ]);
  assert.equal(D.hasNews({ agenda: items.slice(2, 3) }, NOW), true);
  assert.deepEqual(D.lines({ agenda: [] }, NOW), []);
  assert.ok(!l.some((x) => /manqué|retard|dernière chance|vite/i.test(x.text)), "no urgency, no reproach");
});

test("the Clubs page loads the agenda's module before the digest and the clubs", () => {
  const html = readFileSync(new URL("../social.html", import.meta.url), "utf8");
  const at = (p) => html.indexOf(p);
  assert.ok(at("/js/core/club-agenda.js") > 0 && at("/js/core/club-agenda.js") < at("/js/core/social-digest.js") && at("/js/core/club-agenda.js") < at("/js/app/clubs.js"));
  const app = readFileSync(new URL("../js/app/clubs.js", import.meta.url), "utf8");
  assert.match(app, /screens\.club_agenda/);
  assert.ok(!/training_logs|titan_training_create|insert/.test(app.slice(app.indexOf("V1.8.6: the club's agenda"), app.indexOf("function clubHtml"))), "the agenda block never writes a session");
});
