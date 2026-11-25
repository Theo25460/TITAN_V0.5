/* V1.7.7 — dashboard fields by sport, optional goals, structured sessions and the adventure line. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const N = require('../js/core/gps-nav.js');
const S = require('../js/core/gps-session.js');
const a = (over = {}) => ({ movingS: 3600, elapsedS: 4200, stoppedS: 500, recordingS: 4100, effortS: 3600, distanceM: 20000, avgMovingKmh: 20, avgOverallKmh: 17.1, ascentM: 240, autoPause: true, splits: [], ...over });

test('each sport family reads its own dashboard: pace on foot, speed on wheels, never a sensor TITAN does not have', () => {
  assert.equal(S.layout('running').pace, true); assert.equal(S.layout('gravel').pace, false);
  assert.deepEqual(S.layout('gravel').main, ['speed', 'distance']); assert.deepEqual(S.layout('hiking').main, ['distance', 'moving']);
  assert.deepEqual(S.layout('gravel', ['clock', 'remaining', 'nope', 'speed', 'stopped']).more, ['clock', 'remaining', 'stopped'], 'an unknown or duplicated choice is dropped');
  assert.ok(!Object.keys(S.FIELDS).some((k) => /heart|cardio|power|watt|cadence/i.test(k)));
  assert.deepEqual(S.cell('speed', a(), { speedMs: 1000 / 312 }, true), { key: 'speed', label: 'Allure', value: '5:12', unit: '/km' });
  assert.equal(S.cell('speed', a(), { speedMs: 6.75 }, false).value, '24,3');
  assert.equal(S.cell('speed', a(), {}, false).value, '–');
  assert.equal(S.cell('avgMoving', a(), {}, false).value, '20,0');
  assert.equal(S.cell('moving', a(), {}, false).value, '1:00:00'); assert.equal(S.cell('distance', a(), {}, false).value, '20,0');
  assert.match(S.cell('ascent', a({ ascentM: null }), {}, false).note, /pas assez fiable/);
  assert.match(S.cell('remaining', a(), {}, false).note, /Aucun parcours/);
});

test('distance and time goals show progress and a ranged estimate; pauses never advance a time goal', () => {
  const eta = (m) => N.eta(m, a());
  const d = S.goalProgress({ kind: 'distance', km: 55 }, a(), { eta });
  assert.equal(d.reached, false); assert.equal(Math.round(d.ratio * 100), 36); assert.match(d.line, /Reste 35,0 km/); assert.match(d.estimate, /1 h 28 à 2 h 11/);
  assert.equal(S.goalProgress({ kind: 'distance', km: 20 }, a(), { eta }).reached, true);
  assert.match(S.goalProgress({ kind: 'distance', km: 55 }, a({ movingS: 60, distanceM: 200 }), { eta: (m) => N.eta(m, a({ movingS: 60, distanceM: 200 })) }).estimate, /après 5 min/);
  const t = S.goalProgress({ kind: 'time', minutes: 90 }, a(), {});
  assert.equal(t.ratio, 2 / 3); assert.match(t.line, /Reste 30 min en mouvement/); assert.match(t.note, /arrêts et pauses/);
  assert.match(S.goalProgress({ kind: 'time', minutes: 90 }, a({ autoPause: false, effortS: 4100 }), {}).line, /d’enregistrement/);
  for (const bad of [null, {}, { kind: 'distance', km: -3 }, { kind: 'time', minutes: 0 }, { kind: 'return', at: 'tôt' }, { kind: 'calories', kcal: 500 }]) assert.equal(S.goalProgress(bad, a(), {}), null);
});

test('« be back by » compares the time left with the way back, as a range, and says when to turn around', () => {
  const now = new Date(2026, 10, 25, 14, 0, 0).getTime(), eta = (m) => N.eta(m, a());
  const ok = S.goalProgress({ kind: 'return', at: now + 3 * 3600000 }, a(), { now, eta, backM: 20000 });
  assert.equal(ok.status, 'ok'); assert.match(ok.title, /17:00/); assert.match(ok.line, /demi-tour/); assert.match(ok.estimate, /20,0 km, environ 50 min à 1 h 15/); assert.match(ok.note, /marge/);
  assert.equal(S.goalProgress({ kind: 'return', at: now + 70 * 60000 }, a(), { now, eta, backM: 20000 }).status, 'tight');
  assert.equal(S.goalProgress({ kind: 'return', at: now + 40 * 60000 }, a(), { now, eta, backM: 20000 }).status, 'late');
  assert.equal(S.goalProgress({ kind: 'return', at: now - 1000 }, a(), { now, eta, backM: 100 }).status, 'late');
  const unknown = S.goalProgress({ kind: 'return', at: now + 3600000 }, a(), { now, eta, backM: null });
  assert.equal(unknown.status, 'unknown'); assert.match(unknown.estimate, /inconnu/);
});

test('today’s planned occurrence of the week plan is offered as a time goal, for the same sport only', () => {
  const week = { occurrences: [{ id: '2026-11-23/2', status: 'today', planned: { minutes: 180 }, effective: { sport: 'gravel' } }, { id: 'x', status: 'planned', planned: { minutes: 60 }, effective: { sport: 'running' } }] };
  assert.deepEqual(S.plannedGoal(week, 'gravel'), { goal: { kind: 'time', minutes: 180 }, occurrence: '2026-11-23/2', label: 'Prévu aujourd’hui : 3 h 00' });
  assert.equal(S.plannedGoal(week, 'running'), null); assert.equal(S.plannedGoal(null, 'gravel'), null);
});

test('a structured session runs on recording time and measured distance, moves on by itself or by hand, and survives an interruption', () => {
  const plan = S.buildPlan({ warmup: { by: 'time', value: 600 }, reps: 3, work: { by: 'distance', value: 1000 }, recover: { by: 'time', value: 120 }, cooldown: { by: 'manual' } });
  assert.deepEqual(plan.map((s) => s.kind), ['warmup', 'work', 'recover', 'work', 'recover', 'work', 'cooldown']);
  assert.equal(S.describeStep(plan[1]), 'Effort 1/3 · 1,00 km'); assert.equal(S.describeStep(plan[6]), 'Retour au calme · au signal');
  let r = S.runPlan(plan, null, a({ recordingS: 300, distanceM: 900 }));
  assert.equal(r.step.kind, 'warmup'); assert.equal(r.remaining.value, '5:00'); assert.equal(r.changed, false); assert.equal(r.position, '1/7');
  r = S.runPlan(plan, r.cursor, a({ recordingS: 605, distanceM: 1900 }));
  assert.equal(r.changed, true); assert.equal(r.step.label, 'Effort 1/3'); assert.equal(r.next.kind, 'recover');
  // a manual pause in the middle does not advance anything: recording time and distance stand still
  r = S.runPlan(plan, r.cursor, a({ recordingS: 605, distanceM: 1900 })); assert.equal(r.changed, false);
  r = S.runPlan(plan, r.cursor, a({ recordingS: 900, distanceM: 2910 }));
  assert.equal(r.step.kind, 'recover'); assert.equal(r.cursor.laps.at(-1).metres, 1000); assert.equal(r.cursor.laps.at(-1).seconds, 300);
  // the screen was away for a while: the recovery ended on time meanwhile, and the next distance step starts from where the athlete is now
  r = S.runPlan(plan, r.cursor, a({ recordingS: 1500, distanceM: 5200 }));
  assert.equal(r.step.label, 'Effort 2/3'); assert.equal(r.cursor.laps.length, 3); assert.equal(r.cursor.laps.at(-1).seconds, 120);
  assert.equal(r.remaining.value, '1,00');
  r = S.runPlan(plan, r.cursor, a({ recordingS: 1800, distanceM: 6200 }));
  r = S.runPlan(plan, r.cursor, a({ recordingS: 1925, distanceM: 6400 }));
  assert.equal(r.step.label, 'Effort 3/3');
  const cut = S.skipStep(plan, r.cursor, a({ recordingS: 2000, distanceM: 6800 }));
  r = S.runPlan(plan, cut, a({ recordingS: 2100, distanceM: 6900 }));
  assert.equal(r.step.kind, 'cooldown'); assert.equal(r.remaining.manual, true); assert.equal(r.finished, false);
  const sum = S.planSummary(plan, r.cursor);
  assert.equal(sum.done, 6); assert.equal(sum.complete, false); assert.deepEqual(sum.missed, ['Retour au calme']); assert.match(sum.laps.at(-1).text, /passé à la main/);
  const end = S.runPlan(plan, S.skipStep(plan, r.cursor, a({ recordingS: 2400, distanceM: 7000 })), a({ recordingS: 2400, distanceM: 7000 }));
  assert.equal(end.finished, true); assert.equal(S.planSummary(plan, end.cursor).complete, true);
  // unusable steps are dropped, the list is bounded
  assert.equal(S.planOf([{ kind: 'work', by: 'time', value: 2 }, { kind: 'sprint', by: 'time', value: 60 }, { kind: 'work', by: 'distance', value: 20 }]).length, 0);
  assert.equal(S.buildPlan({ reps: 500, work: { by: 'time', value: 30 }, recover: { by: 'time', value: 30 } }).length, 59);
  assert.equal(S.runPlan([], null, a()).finished, false);
});

test('the adventure line reads the server snapshots only: effort gained once, milestones opened, never a place', () => {
  const ms = (ready) => [1, 2, 3].map((ordinal) => ({ ordinal, arc: 1, kind: ['discovery', 'lore', 'monster'][ordinal - 1], effortTarget: ordinal * 100, daysTarget: ordinal, ready: ready.includes(ordinal), earned: false }));
  const before = { effort: 150, days: 2, milestones: ms([1]) }, after = { effort: 215, days: 2, milestones: ms([1, 2]) };
  const x = S.expedition('marees', before, after);
  assert.match(x.title, /Îles des Marées/); assert.match(x.line, /65 min d’effort/);
  assert.equal(x.opened.length, 1); assert.match(x.opened[0].text, /fragment de chronique/); assert.match(x.next, /85 min d’effort et 1 jour/);
  assert.ok(!/\d+[.,]\d{3,}/.test(JSON.stringify(x)), 'no coordinate-like figure');
  // the same session read again (a second synchronisation) gains nothing more and opens nothing
  const again = S.expedition('marees', after, after);
  assert.match(again.line, /n’ajoute pas d’effort/); assert.equal(again.opened.length, 0);
  assert.equal(S.expedition('marees', null, null), null, 'adventure unavailable: no card, the outing lives in the journal');
  assert.equal(S.expedition('atlantide', before, after), null);
});
