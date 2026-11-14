// Trends: daily averages, bar charts and the day pattern, with Growth as the second view.
import * as L from '../logic.js';
import { h, fmtDay, render, seg, stat } from '../ui.js';
import { state, units, view } from '../store.js';
import { barChart, patternChart } from '../chart.js';
import { viewGrowth } from './growth.js';

const TREND = {
  sleep: { label: 'Sleep', unit: 'h', series: [{ name: 'Sleep', cls: 's1' }], values: (d) => [+(d.sleepMs / L.HOUR).toFixed(1)], fmt: (d) => `${+(d.sleepMs / L.HOUR).toFixed(1)} h asleep` },
  feeds: { label: 'Feeds', unit: '', series: [{ name: 'Milk feeds', cls: 's1' }], values: (d) => [d.milkFeeds], fmt: (d) => `${d.milkFeeds} milk feed${d.milkFeeds === 1 ? '' : 's'}${d.solids ? ` · ${d.solids} solid` : ''}` },
  diapers: { label: 'Diapers', unit: '', series: [{ name: 'Wet', cls: 's1' }, { name: 'Dirty', cls: 's2' }], values: (d) => [d.wet, d.dirty], fmt: (d) => `${d.wet} wet · ${d.dirty} dirty` },
};
function viewDaily() {
  const t = TREND[view.trend.metric], n = view.trend.days;
  const series = L.dailySeries(state.events, n);
  if (!state.events.length) return h('section', { class: 'card' }, h('p', { class: 'empty' }, 'Charts appear here once you have logged a few feeds, sleeps or diapers.'));
  const avg = (pick, digits = 1) => { const a = L.dailyAverage(series, pick); return a == null ? '—' : a.toFixed(digits); };
  const bottle = L.dailyAverage(series, (d) => d.bottleMl);
  const days = series.map((d) => ({
    ...d, values: t.values(d),
    label: d.partial ? (n <= 7 ? 'Today' : '•') : n <= 7 ? new Date(d.from).toLocaleDateString([], { weekday: 'narrow' }) : String(new Date(d.from).getDate()),
    title: d.partial ? 'Today so far' : fmtDay(d.from),
  }));
  const any = days.some((d) => d.values.some((v) => v > 0));
  const week = L.dailySeries(state.events, 7).reverse();
  return [
    h('section', { class: 'card' },
      h('div', { class: 'cardhead' }, h('h2', null, `Daily average, last ${n} days`),
        h('button', { class: 'btn small', type: 'button', 'aria-label': 'Change number of days', onclick: () => { view.trend.days = { 7: 14, 14: 30, 30: 7 }[n]; render(); } }, `${n} days ▾`)),
      h('div', { class: 'stats' },
        stat('Milk feeds', avg((d) => d.milkFeeds), bottle ? L.fmtVolume(bottle, units()) : ''),
        stat('Sleep', `${avg((d) => d.sleepMs / L.HOUR)}h`),
        stat('Wet', avg((d) => d.wet)),
        stat('Dirty', avg((d) => d.dirty)),
        stat('Spit-ups', avg((d) => d.spitups))),
      h('p', { class: 'fine' }, 'Averages use full days that have something logged. Today is left out until it is over.')),
    h('section', { class: 'card' },
      seg(Object.entries(TREND).map(([k, v]) => [k, v.label]), view.trend.metric, (v) => { view.trend.metric = v; render(); }),
      any ? [
        t.series.length > 1 && h('div', { class: 'legend' }, t.series.map((sr) => h('span', null, h('i', { class: `sw ${sr.cls}` }), sr.name))),
        barChart({ days, series: t.series, unit: t.unit, fmtValue: t.fmt, ariaLabel: `${t.label} per day for the last ${n} days`,
          band: view.trend.metric === 'sleep' ? L.sleepRange(L.ageMonths(state.baby.birthDate)) : null }),
      ] : h('p', { class: 'empty' }, `No ${t.label.toLowerCase()} logged in the last ${n} days.`)),
    h('section', { class: 'card' }, h('h2', null, 'Day pattern, last 7 days'),
      h('div', { class: 'legend' }, h('span', null, h('i', { class: 'sw s1' }), 'Asleep'), h('span', null, h('i', { class: 'sw dot' }), 'Feed')),
      patternChart({
        ariaLabel: 'Sleep and feed times across each of the last 7 days',
        rows: week.map((d) => ({
          ...L.dayPattern(state.events, d.from),
          label: d.partial ? 'Today' : new Date(d.from).toLocaleDateString([], { weekday: 'short' }),
          title: d.partial ? 'Today so far' : fmtDay(d.from),
          summary: `${+(d.sleepMs / L.HOUR).toFixed(1)} h asleep · ${d.feeds} feed${d.feeds === 1 ? '' : 's'}`,
        })),
      })),
  ];
}
export const viewTrends = () => [
  seg([['daily', 'Daily'], ['growth', 'Growth']], view.trends, (v) => { view.trends = v; render(); }),
  view.trends === 'growth' ? viewGrowth() : viewDaily(),
];
