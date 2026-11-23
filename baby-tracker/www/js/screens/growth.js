// Growth (inside Trends): weight and height measurements with a chart each.
import * as L from '../logic.js';
import { h, num, fmtDate, field, stat, toast } from '../ui.js';
import { state, units } from '../store.js';
import { formSheet, removeWithUndo } from '../forms.js';
import { lineChart } from '../chart.js';
import { icon } from '../icons.js';

function growthSheet(existing) {
  const imp = units() === 'imperial';
  const d = existing ? { ...existing } : { id: L.uid(), date: L.toDateInput(Date.now()) };
  if (d.weightKg) { if (imp) { const oz = Math.round((d.weightKg / L.KG_PER_LB) * 16); d.lb = Math.floor(oz / 16); d.oz = oz % 16; } else d.kg = +d.weightKg.toFixed(2); }
  if (d.heightCm) d.h = +L.heightValue(d.heightCm, units()).toFixed(1);
  const n = (key, attrs) => h('input', { type: 'number', inputMode: 'decimal', min: 0, step: 'any', value: d[key] ?? '', oninput: (e) => { d[key] = e.target.value; }, ...attrs });
  formSheet(existing ? 'Edit measurement' : 'Add measurement', d, () => [
    field('Date', h('input', { type: 'date', required: true, value: d.date, max: L.toDateInput(Date.now()), oninput: (e) => { d.date = e.target.value; } })),
    imp ? h('div', { class: 'row2' }, field('Weight (lb)', n('lb')), field('and oz', n('oz', { max: 15.9 })))
      : field('Weight (kg)', n('kg')),
    field(`Height / length (${L.heightUnit(units())})`, n('h')),
  ], () => {
    const kg = imp ? ((num(d.lb) ?? 0) + (num(d.oz) ?? 0) / 16) * L.KG_PER_LB : num(d.kg);
    const hv = num(d.h);
    if (!d.date) return 'Please pick a date.';
    if (!kg && !hv) return 'Enter a weight, a height, or both.';
    const entry = { id: d.id, date: d.date, weightKg: kg || undefined, heightCm: hv ? (imp ? hv * L.CM_PER_IN : hv) : undefined };
    if (entry.weightKg > 30 && !confirm(`Save a weight of ${L.fmtWeight(entry.weightKg, units())}?`)) return 'Not saved. Check the weight.';
    if (entry.heightCm > 130 && !confirm(`Save a height of ${L.fmtHeight(entry.heightCm, units())}?`)) return 'Not saved. Check the height.';
    // one entry per date: a second measurement on the same day updates the first
    const same = state.growth.find((g) => g.date === entry.date && g.id !== entry.id);
    if (same) {
      state.growth = state.growth.filter((g) => g.id !== entry.id);
      same.weightKg = entry.weightKg ?? same.weightKg; same.heightCm = entry.heightCm ?? same.heightCm;
      setTimeout(() => toast('Updated the measurement already saved for that date.'), 50);
      return;
    }
    const i = state.growth.findIndex((g) => g.id === entry.id);
    if (i >= 0) state.growth[i] = entry; else state.growth.push(entry);
  }, existing && (() => removeWithUndo('growth', existing)));
}

export function viewGrowth() {
  const u = units();
  const rows = [...state.growth].sort((a, b) => a.date.localeCompare(b.date));
  const weights = rows.filter((g) => g.weightKg), heights = rows.filter((g) => g.heightCm);
  const delta = (list, key, fmt) => {
    if (list.length < 2) return '';
    const diff = list[list.length - 1][key] - list[list.length - 2][key];
    return `${fmt(diff)} since last`;
  };
  const chart = (list, title, toValue, unit, fmt) => list.length > 0 && h('section', { class: 'card m-growth' },
    h('h2', null, title),
    list.length === 1 ? h('p', { class: 'empty' }, `${fmt(list[0])} on ${fmtDate(L.parseDate(list[0].date), true)}. Add another measurement to see a trend line.`)
      : lineChart({
        points: list.map((g) => ({ x: L.parseDate(g.date), y: +toValue(g).toFixed(2), label: fmt(g) })),
        unit, fmtDate: (ts, long) => fmtDate(ts, long), fmtValue: (p) => p.label, ariaLabel: `${title} chart with ${list.length} measurements`,
      }));
  return [
    h('section', { class: 'card' },
      h('div', { class: 'stats two' },
        stat('Weight', weights.length ? L.fmtWeight(weights[weights.length - 1].weightKg, u) : '—', delta(weights, 'weightKg', (v) => L.fmtWeightChange(v, u))),
        stat('Height', heights.length ? L.fmtHeight(heights[heights.length - 1].heightCm, u) : '—', delta(heights, 'heightCm', (v) => `${v >= 0 ? '+' : '−'}${L.fmtHeight(Math.abs(v), u)}`))),
      h('button', { class: 'btn tonal block', type: 'button', onclick: () => growthSheet() }, '+ Add measurement')),
    chart(weights, 'Weight over time', (g) => L.weightValue(g.weightKg, u), L.weightUnit(u), (g) => L.fmtWeight(g.weightKg, u)),
    chart(heights, 'Height over time', (g) => L.heightValue(g.heightCm, u), L.heightUnit(u), (g) => L.fmtHeight(g.heightCm, u)),
    rows.length > 0 && h('section', { class: 'card' }, h('h2', null, 'All measurements'),
      h('ul', { class: 'list' }, [...rows].reverse().map((g) => h('li', null, h('button', { type: 'button', onclick: () => growthSheet(g) },
        h('i', { class: 'ico' }, icon('ruler', 20)),
        h('span', { class: 'grow' }, h('b', null, [g.weightKg && L.fmtWeight(g.weightKg, u), g.heightCm && L.fmtHeight(g.heightCm, u)].filter(Boolean).join(' · ')),
          state.baby.birthDate && h('small', null, L.ageLabel(state.baby.birthDate, L.parseDate(g.date)))),
        h('time', null, fmtDate(L.parseDate(g.date), true))))))),
  ];
}
