import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { metricCatalog } from '../tools/data/sport-metrics.mjs';
const require = createRequire(import.meta.url);
const rows = require('../js/core/sports-catalog.js');
const live = JSON.parse(readFileSync(new URL('../tools/data/sport-metrics-baseline.json', import.meta.url)));
const fields = id => rows.find(r => r[0] === id)?.[7] || [];

test('generated offline schemas match the reviewed authoring source exactly', () => {
  for (const [id, spec] of Object.entries(metricCatalog())) assert.deepEqual(fields(id), spec.fields, id);
});

test('every active server sport has an explicit offline metric schema', () => {
  assert.equal(live.length, 260);
  assert.deepEqual(rows.map(r => r[0]).sort(), live.map(r => r.id).sort());
  for (const [id] of rows) {
    const fs = fields(id);
    assert.ok(fs.length >= 3, `${id}: useful measures, not an empty fallback`);
    assert.equal(new Set(fs.map(f => f.id)).size, fs.length, `${id}: stable unique IDs`);
    for (const f of fs) {
      assert.ok(f.label && f.type && f.priority, `${id}.${f.id}: metadata`);
      if (f.type === 'number') assert.ok(Number.isFinite(f.min) && Number.isFinite(f.max) && f.max >= f.min && f.step > 0, `${id}.${f.id}: bounded precision`);
      if (f.type === 'select') assert.ok(f.options.length >= 2);
      if (f.visibleWhen) assert.ok(fs.some(g => g.id === f.visibleWhen.field));
    }
  }
});

test('representative disciplines expose meaningful specific metrics', () => {
  for (const [id, required] of Object.entries({
    mountain_bike: ['cadence', 'avg_power', 'descent_m'],
    swimming: ['stroke', 'swolf'], golf: ['holes', 'putts'],
    tennis: ['sets_won', 'sets_lost', 'aces'], boxing: ['rounds', 'round_duration_s'],
    yoga: ['style', 'poses', 'breath_minutes'],
    diving: ['max_depth_m', 'bottom_time_min'],
    springboard_diving: ['dives', 'height'],
    bouldering: ['attempts', 'successful_routes'],
    archery: ['arrows', 'distance_m'],
  })) {
    for (const key of required) assert.ok(fields(id).some(f => f.id === key), `${id}: ${key}`);
  }
  assert.ok(!fields('diving').some(f => f.id === 'dives' && f.label === 'Plongeons'));
  for (const [id, wrong] of [['modern_pentathlon','bike_km'],['biathlon','jump_distance_m'],['nordic_combined','targets_hit'],['dressage','jumps']]) {
    assert.ok(!fields(id).some(f => f.id === wrong && f.priority < 100), `${id}: do not borrow irrelevant family measures`);
  }
});

test('catalog retains reward metadata, progress direction, precision and historical bounds', () => {
  for (const sport of live) for (const old of sport.extra_fields) {
    const current = fields(sport.id).find(f => f.id === old.id);
    assert.ok(current, `${sport.id}.${old.id}: historic ID`);
    for (const key of ['xpWeight', 'higherIsBetter']) if (key in old) assert.equal(current[key], old[key], `${sport.id}.${old.id}.${key}`);
    if (old.type === 'number') {
      assert.ok(current.min <= old.min && current.max >= old.max, `${sport.id}.${old.id}: historical bounds`);
      assert.ok(current.step <= old.step, `${sport.id}.${old.id}: historical precision`);
    }
    if (old.type === 'select') for (const value of old.options) assert.ok(current.options.includes(value));
  }
});

test('offline sport model carries independent metric objects without changing online schemas', () => {
  const root = { TITAN_SPORTS_SNAPSHOT: structuredClone(rows), SPORTS_CONFIG: { tennis: { extraFields: [{ id: 'server_only' }] } } };
  vm.runInNewContext(readFileSync(new URL('../js/core/sports.js', import.meta.url), 'utf8'), { window: root });
  root.TitanSports.ensure();
  assert.ok(root.SPORTS_CONFIG.yoga.extraFields.some(f => f.id === 'style'));
  assert.equal(root.SPORTS_CONFIG.tennis.extraFields[0].id, 'server_only');
  root.SPORTS_CONFIG.yoga.extraFields[0].label = 'changed';
  assert.notEqual(root.TITAN_SPORTS_SNAPSHOT.find(r => r[0] === 'yoga')[7][0].label, 'changed');
});

test('pre-existing fallback sports receive the reviewed schema, actual server rows remain authoritative', () => {
  const root = { TITAN_SPORTS_SNAPSHOT: structuredClone(rows), SPORTS_CONFIG: {
    golf: { catalogSource: 'fallback', extraFields: [{ id: 'generic' }] },
    tennis: { catalogSource: 'server', extraFields: [{ id: 'real_server' }] },
  } };
  vm.runInNewContext(readFileSync(new URL('../js/core/sports.js', import.meta.url), 'utf8'), { window: root });
  root.TitanSports.ensure();
  assert.ok(root.SPORTS_CONFIG.golf.extraFields.some(f => f.id === 'holes'));
  assert.equal(root.SPORTS_CONFIG.tennis.extraFields[0].id, 'real_server');
});
