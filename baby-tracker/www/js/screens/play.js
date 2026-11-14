// Play ideas (inside Ideas): activities for the baby's age, with a "done" count.
import * as L from '../logic.js';
import { h, render, field } from '../ui.js';
import { state, save, view } from '../store.js';
import { ACTIVITIES, ACTIVITY_AREAS, ACTIVITY_BANDS, bandFor } from '../activities.js';

export function viewPlay() {
  const months = L.ageMonths(state.baby.birthDate);
  const mine = bandFor(months), band = ACTIVITY_BANDS.find((b) => b.label === view.band) || mine;
  const today = L.toDateInput(Date.now());
  const log = state.activityLog;
  const count = (id) => log.filter((a) => a.activityId === id).length;
  const doneToday = (id) => log.some((a) => a.activityId === id && a.date === today);
  const list = ACTIVITIES.filter((a) => a.from === band.from).sort((a, b) => Math.sign(count(a.id)) - Math.sign(count(b.id)));
  const week = log.filter((a) => Date.now() - L.parseDate(a.date) < 7 * L.DAY).length;
  return [
    h('section', { class: 'card' },
      h('div', { class: 'cardhead' }, h('h2', null, 'Play ideas'), h('small', null, week ? `${week} done this week` : 'Tap Done to keep count')),
      field('Age', h('select', { 'aria-label': 'Age range', onchange: (e) => { view.band = e.target.value; render(); } },
        ACTIVITY_BANDS.map((b) => h('option', { value: b.label, selected: b === band }, b.label + (b === mine && months != null ? `  (${state.baby.name || 'baby'} is here)` : '')))))),
    list.map((a) => h('section', { class: 'card activity' },
      h('div', { class: 'act-head' }, h('i', null, a.icon),
        h('span', { class: 'grow' }, h('b', null, a.name), h('small', null, `${ACTIVITY_AREAS[a.area]} · about ${a.minutes} min${count(a.id) ? ` · done ${count(a.id)}×` : ''}`))),
      h('p', null, a.how),
      doneToday(a.id)
        ? h('button', { class: 'btn small done-btn', type: 'button', onclick: () => { const i = log.findIndex((x) => x.activityId === a.id && x.date === today); log.splice(i, 1); save(); } }, '✓ Done today (undo)')
        : h('button', { class: 'btn small', type: 'button', onclick: () => { log.push({ id: L.uid(), activityId: a.id, name: a.name, date: today }); save(); } }, 'Done'))),
    h('p', { class: 'fine pad' }, 'Stay with your baby during play, keep small objects out of reach, and stop when they have had enough. Babies develop at different speeds; if you are worried about development, talk to your doctor.'),
  ];
}
