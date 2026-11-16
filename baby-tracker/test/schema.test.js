import test from 'node:test';
import assert from 'node:assert/strict';
import { normalise, blank } from '../www/js/schema.js';

test('garbage in, a usable empty state out', () => {
  for (const bad of [null, undefined, 42, 'x', [], { events: 'nope' }, { baby: 7, settings: [], nursing: 'x' }]) {
    const s = normalise(bad);
    assert.deepEqual(Object.keys(s).sort(), Object.keys(blank()).sort());
    assert.equal(typeof s.baby.name, 'string');
    assert.ok(Array.isArray(s.events));
  }
});

test('wrong types are coerced or dropped, never passed through', () => {
  const s = normalise({
    baby: { name: 12345, birthDate: 'yesterday' },
    settings: { units: 'furlongs', currency: 'DOLLARS', aiUrl: 'javascript:alert(1)' },
    events: [
      { id: 'a', type: 'feed', method: 'bottle', amountMl: '120', start: 1000 },
      { id: 'b', type: 'feed', method: 'bottle', amountMl: 'lots', start: 2000 },
      { id: 'c', type: 'teleport', start: 3000 },
      { id: 'd', type: 'sleep', start: 5000, end: 4000 },
      { id: 'e', type: 'diaper', kind: 'explosive', start: 6000 },
      { id: 'f', type: 'feed', method: 'solid', start: 7000 },
      { id: 'g', type: 'spitup', start: 'noon' },
      'not an object', null,
    ],
    growth: [{ id: 'g1', date: '2026-01-05', weightKg: '7.9' }, { id: 'g2', date: '2026-01-06', weightKg: 'heavy' }, { id: 'g3', date: 'soon', weightKg: 5 }],
    gear: [{ id: 'k', name: 'Pram', url: 'javascript:alert(1)', price: '199', priority: 'urgent', bought: 'yes' }],
    foods: [{ id: 'f', name: 'Egg', reaction: 'meh', allergy: 'true' }],
    nursing: { start: 5, side: 'middle', sideStart: 'x', leftMs: -3 },
  });
  assert.equal(s.baby.name, '12345');
  assert.equal(s.baby.birthDate, '');
  assert.deepEqual(s.settings, { units: 'metric', currency: 'DOL', aiUrl: '' });
  assert.deepEqual(s.events.map((e) => e.id), ['a', 'b', 'd', 'e']);
  assert.equal(s.events[0].amountMl, 120);       // a string amount becomes a number
  assert.equal(s.events[1].amountMl, undefined);
  assert.equal(s.events[2].end, null);           // an end before the start is discarded
  assert.equal(s.events[3].kind, 'pee');
  assert.deepEqual(s.growth, [{ id: 'g1', date: '2026-01-05', weightKg: 7.9, heightCm: undefined }]);
  assert.deepEqual({ ...s.gear[0] }, { id: 'k', name: 'Pram', category: 'Other', price: 199, url: '', priority: 'medium', bought: false });
  assert.equal(s.foods[0].reaction, '');
  assert.equal(s.foods[0].allergy, false);
  assert.deepEqual(s.nursing, { start: 5, side: 'left', sideStart: null, leftMs: 0, rightMs: 0 });
});

test('a backup from an older version (no timer, no activity log) loads', () => {
  const s = normalise({ baby: { name: 'Mia', birthDate: '2026-05-01' }, settings: { units: 'imperial', currency: '£', aiUrl: 'https://ai.example.com' }, events: [{ id: '1', type: 'feed', method: 'breast', side: 'both', minutes: 12, leftMin: 7, rightMin: 5, start: 1700000000000, note: 'ok' }] });
  assert.equal(s.nursing, null);
  assert.deepEqual(s.activityLog, []);
  assert.deepEqual(s.events[0], { id: '1', start: 1700000000000, note: 'ok', type: 'feed', method: 'breast', side: 'both', minutes: 12, leftMin: 7, rightMin: 5 });
  assert.equal(s.settings.aiUrl, 'https://ai.example.com');
});
