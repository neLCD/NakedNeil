import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../www/js/logic.js';

const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const NOW = at(2026, 11, 14, 15, 0);
const blank = () => ({ baby: { name: 'Mia', birthDate: '2026-05-01' }, settings: { units: 'metric' }, events: [], growth: [], words: [], foods: [], gear: [] });

test('age labels', () => {
  assert.equal(L.ageLabel('2026-11-10', NOW), '4 days old');
  assert.equal(L.ageLabel('2026-10-01', NOW), '6 weeks old');
  assert.match(L.ageLabel('2026-05-01', NOW), /^6 months/);
  assert.equal(L.ageLabel('2024-09-14', NOW), '2 yr 2 mo old');
  assert.equal(L.ageLabel('', NOW), '');
});

test('unit conversion round-trips', () => {
  assert.equal(L.fmtVolume(120, 'metric'), '120 ml');
  assert.equal(L.fmtVolume(L.volumeToMl(4, 'imperial'), 'imperial'), '4 oz');
  assert.equal(L.fmtWeight(3.5, 'metric'), '3.5 kg');
  assert.equal(L.fmtWeight(7.5 * L.KG_PER_LB, 'imperial'), '7 lb 8 oz');
  assert.equal(L.fmtWeight(7.999 * L.KG_PER_LB, 'imperial'), '8 lb 0 oz'); // never "7 lb 16 oz"
  assert.equal(L.fmtHeight(50.8, 'imperial'), '20 in');
});

test('daily summary counts feeds, diapers, and clips sleep to the day', () => {
  const day = at(2026, 11, 14);
  const events = [
    { id: '1', type: 'feed', method: 'bottle', amountMl: 120, start: at(2026, 11, 14, 7) },
    { id: '2', type: 'feed', method: 'breast', minutes: 15, start: at(2026, 11, 14, 10) },
    { id: '3', type: 'feed', method: 'solid', food: 'Avocado', start: at(2026, 11, 14, 12) },
    { id: '4', type: 'diaper', kind: 'both', start: at(2026, 11, 14, 8) },
    { id: '5', type: 'diaper', kind: 'pee', start: at(2026, 11, 14, 11) },
    { id: '6', type: 'spitup', amount: 'small', start: at(2026, 11, 14, 9) },
    { id: '7', type: 'sleep', start: at(2026, 11, 13, 20), end: at(2026, 11, 14, 6) }, // overnight: 6h fall today
    { id: '8', type: 'sleep', start: at(2026, 11, 14, 14), end: null }, // in progress: 1h so far
    { id: '9', type: 'feed', method: 'bottle', amountMl: 90, start: at(2026, 11, 13, 22) }, // yesterday
  ];
  const s = L.summarize(events, day, day + L.DAY, NOW);
  assert.deepEqual(s, { feeds: 3, bottleMl: 120, breastMin: 15, solids: 1, sleepMs: 7 * L.HOUR, wet: 2, dirty: 1, spitups: 1 });
  assert.equal(L.currentSleep(events).id, '8');
  assert.equal(L.lastEvent(events, (e) => e.type === 'feed').id, '3');
});

test('tips: low wet-diaper warning only when diapers are being tracked', () => {
  const s = blank();
  assert.ok(!L.buildTips(s, NOW).some((t) => /wet diaper/.test(t.title)));
  s.events.push({ id: 'a', type: 'diaper', kind: 'pee', start: NOW - 3 * L.DAY }, { id: 'b', type: 'diaper', kind: 'pee', start: NOW - L.HOUR });
  const tip = L.buildTips(s, NOW).find((t) => /wet diaper/.test(t.title));
  assert.equal(tip.tone, 'warn');
  assert.match(tip.title, /^1 wet diaper logged/);
  for (let i = 0; i < 6; i++) s.events.push({ id: `p${i}`, type: 'diaper', kind: 'pee', start: NOW - (i + 2) * L.HOUR });
  assert.ok(!L.buildTips(s, NOW).some((t) => /wet diaper/.test(t.title)));
});

test('tips follow age and what has been logged', () => {
  const young = blank(); young.baby.birthDate = '2026-09-01';
  assert.ok(L.buildTips(young, NOW).some((t) => /Milk is the whole menu/.test(t.title)));

  const six = blank(); // ~6.5 months, nothing tried
  assert.ok(L.buildTips(six, NOW).some((t) => /Ready for first foods/.test(t.title)));
  six.foods.push({ id: 'f', name: 'avocado', date: '2026-11-10' });
  const tips = L.buildTips(six, NOW);
  const next = tips.find((t) => t.title === 'Foods to try next');
  assert.ok(next && !/Avocado/.test(next.text));
  assert.ok(tips.some((t) => /allergens/.test(t.title)));
  six.foods.push({ id: 'g', name: 'Egg', date: '2026-11-12' });
  assert.ok(!L.buildTips(six, NOW).some((t) => /allergens/.test(t.title)));

  const drop = blank();
  drop.growth.push({ id: '1', date: '2026-10-01', weightKg: 7.2 }, { id: '2', date: '2026-11-01', weightKg: 7.0 });
  assert.ok(L.buildTips(drop, NOW).some((t) => t.tone === 'warn' && /lower/.test(t.title)));

  assert.ok(L.buildTips({ ...blank(), baby: { name: '', birthDate: '' } }, NOW).some((t) => /birth date/.test(t.title)));
});

test('AI summary includes the essentials and no more than 7 days', () => {
  const s = blank();
  s.events.push({ id: '1', type: 'feed', method: 'bottle', amountMl: 150, start: NOW - L.HOUR }, { id: '2', type: 'feed', method: 'bottle', amountMl: 150, start: NOW - 20 * L.DAY });
  s.foods.push({ id: 'f', name: 'Banana', date: '2026-11-10', reaction: 'loved', allergy: false });
  s.gear.push({ id: 'g', name: 'High chair', bought: false });
  const text = L.aiSummary(s, NOW);
  assert.match(text, /Baby: Mia, 6 months/);
  assert.match(text, /today so far: 1 feeds \/ 150 ml/);
  assert.equal(text.match(/feeds \//g).length, 2); // header + one day only
  assert.match(text, /Foods tried: Banana \(loved\)/);
  assert.match(text, /Gear wishlist: High chair/);
});

test('breastfeeding timer: switch sides, pause, and log', () => {
  const t0 = at(2026, 11, 14, 9, 0), min = 60000;
  let n = { start: t0, side: 'left', sideStart: t0, leftMs: 0, rightMs: 0 };
  assert.deepEqual(L.nursingElapsed(n, t0 + 6 * min), { leftMs: 6 * min, rightMs: 0, totalMs: 6 * min });
  n = L.nursingTap(n, 'right', t0 + 6 * min);          // switch to right
  n = L.nursingTap(n, 'right', t0 + 10 * min);         // pause after 4 min on the right
  assert.equal(n.sideStart, null);
  assert.equal(L.nursingElapsed(n, t0 + 30 * min).totalMs, 10 * min); // paused time is not counted
  n = L.nursingTap(n, 'left', t0 + 12 * min);          // resume on the left for 3 more
  const ev = L.nursingToFeed(n, t0 + 15 * min);
  assert.deepEqual({ ...ev, id: 0 }, { id: 0, type: 'feed', method: 'breast', start: t0, side: 'both', minutes: 13, note: '', leftMin: 9, rightMin: 4 });
  assert.equal(L.describeEvent(ev, 'metric').detail, 'L 9 · R 4 min');

  const short = L.nursingToFeed({ start: t0, side: 'right', sideStart: t0, leftMs: 0, rightMs: 0 }, t0 + 20000);
  assert.equal(short.side, 'right');
  assert.equal(short.minutes, 1); // never logs a 0-minute feed
  assert.equal(L.fmtClock(65000), '01:05');
  assert.equal(L.fmtClock(3725000), '1:02:05');
});
