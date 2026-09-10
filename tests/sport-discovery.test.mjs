import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/sport-discovery.js', import.meta.url), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox, { filename: 'sport-discovery.js' });

const titan = sandbox.window;

function entry(key, conf) {
  return {
    key,
    conf,
    search: titan.titanSportSearchText(conf, key),
  };
}

test('normalizes accents, apostrophes and separators consistently', () => {
  assert.equal(titan.titanNormalizeSportSearch("Course d’Orientation_VTT"), 'course d orientation vtt');
});

test('finds a racket sport through its name and profile', () => {
  const padel = entry('padel', {
    label: 'Padel',
    cat: 'team',
    balanceProfile: 'racket',
    trackingSummary: { aliases: ['padel tennis'] },
  });
  assert.ok(titan.titanSportSearchScore(padel, 'padel') >= 100);
  assert.equal(titan.titanSportCategoryLabel(padel.conf), 'Raquette');
  assert.equal(titan.titanSportFamilyMatches(padel, 'racket'), true);
});

test('understands common French intentions and padel spelling variants', () => {
  const padel = entry('padel', {
    label: 'Padel',
    cat: 'team',
    balanceProfile: 'racket',
    trackingSummary: { aliases: ['padel tennis'] },
  });
  const running = entry('running', {
    label: 'Course à pied',
    cat: 'cardio',
    balanceProfile: 'running',
    trackingSummary: { aliases: ['jogging'] },
  });
  assert.ok(titan.titanSportSearchScore(padel, 'paddle') >= 100);
  assert.ok(titan.titanSportSearchScore(running, 'courir') > 0);
});

test('search scoring also works for lightweight featured entries', () => {
  const featured = {
    key: 'padel',
    conf: {
      label: 'Padel',
      cat: 'team',
      balanceProfile: 'racket',
      trackingSummary: { aliases: ['padel tennis'] },
    },
  };
  assert.doesNotThrow(() => titan.titanSportSearchScore(featured, 'paddle'));
  assert.ok(titan.titanSportSearchScore(featured, 'paddle') >= 100);
});

test('provides useful metric labels when a database row has no extra fields yet', () => {
  const running = {
    label: 'Course',
    balanceProfile: 'running',
    extraFields: [],
  };
  assert.deepEqual(
    Array.from(titan.titanSportMetricLabels(running, 4)),
    ['Format', 'Dénivelé', 'Allure', 'FC moyenne'],
  );
});

test('catalog statistics count every active protocol including safe family fallbacks', () => {
  const entries = [
    entry('running', { label: 'Course', cat: 'cardio', balanceProfile: 'running', extraFields: [] }),
    entry('padel', { label: 'Padel', cat: 'team', balanceProfile: 'racket', extraFields: [] }),
    entry('boxing', { label: 'Boxe', cat: 'combat', balanceProfile: 'combat', extraFields: [{ id: 'rounds', label: 'Rounds' }] }),
  ];
  const stats = titan.titanSportCatalogStats(entries);
  assert.equal(stats.total, 3);
  assert.equal(stats.categories, 3);
  assert.equal(stats.withMetrics, 3);
});
