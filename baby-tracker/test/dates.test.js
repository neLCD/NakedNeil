// Date maths in a zone with daylight saving (New York: clocks go forward on 2026-03-08).
process.env.TZ = 'America/New_York';
import test from 'node:test';
import assert from 'node:assert/strict';
const L = await import('../www/js/logic.js');

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

test('age counts calendar days across a clock change', () => {
  assert.equal(L.ageDays('2026-03-01', at(2026, 3, 10)), 9);
  assert.equal(L.ageLabel('2026-03-01', at(2026, 3, 15)), '2 weeks old'); // day 14, not "13 days old"
  assert.equal(L.ageDays('2026-10-25', at(2026, 11, 2)), 8);                // clocks go back on 1 Nov
  assert.equal(L.ageDays('2026-03-10', at(2026, 3, 10, 1)), 0);
});

test('month-end birthdays never give negative weeks', () => {
  assert.equal(L.ageLabel('2025-11-30', at(2026, 3, 1)), '3 months old');   // Feb has no 30th
  assert.equal(L.ageLabel('2025-10-31', at(2026, 3, 2)), '4 months old');
  assert.equal(L.ageLabel('2024-02-29', at(2026, 2, 28)), '2 yr old');      // leap-day baby
  assert.equal(L.ageLabel('2025-08-31', at(2025, 12, 15)), '3 months, 2 wk old');
  for (const born of ['2025-01-31', '2025-03-31', '2025-05-31', '2024-02-29', '2025-12-31']) {
    for (let d = 90; d < 800; d += 1) {
      const label = L.ageLabel(born, L.addDays(L.parseDate(born), d) + 12 * L.HOUR);
      assert.ok(!label.includes('-'), `${born} +${d}d gave "${label}"`);
    }
  }
});

test('the AI summary labels each day correctly after the clocks change', () => {
  const state = { baby: { name: 'Mia', birthDate: '2025-09-01' }, settings: { units: 'metric' }, events: [], growth: [], words: [], foods: [], gear: [] };
  for (const [d, n] of [[7, 1], [8, 2], [9, 3]]) for (let i = 0; i < n; i++) state.events.push({ id: `${d}-${i}`, type: 'diaper', kind: 'pee', start: at(2026, 3, d, 9 + i) });
  const text = L.aiSummary(state, at(2026, 3, 10));
  assert.match(text, /- 2026-03-09: .* 3 wet/);
  assert.match(text, /- 2026-03-08: .* 2 wet/); // the 23-hour day keeps its own data and label
  assert.match(text, /- 2026-03-07: .* 1 wet/);
});

test('trend days are whole calendar days even when one is 23 hours long', () => {
  const series = L.dailySeries([{ id: 's', type: 'sleep', start: at(2026, 3, 8, 0), end: at(2026, 3, 9, 0) }], 4, at(2026, 3, 10));
  assert.deepEqual(series.map((d) => new Date(d.from).getDate()), [7, 8, 9, 10]);
  assert.equal(series[1].sleepMs, 23 * L.HOUR);
});
