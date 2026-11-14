// Firsts: the parent's own record of first words and first foods.
import * as L from '../logic.js';
import { h, fmtDate, render, field, seg } from '../ui.js';
import { state, view, go } from '../store.js';
import { noteInput, formSheet, removeWithUndo } from '../forms.js';
import { icon } from '../icons.js';

function wordSheet(existing) {
  const d = existing ? { ...existing } : { id: L.uid(), word: '', date: L.toDateInput(Date.now()), note: '' };
  formSheet(existing ? 'Edit word' : 'Add a word', d, () => [
    field('Word', h('input', { type: 'text', required: true, maxLength: 40, value: d.word, placeholder: 'e.g. Mama', oninput: (e) => { d.word = e.target.value; } })),
    field('Date', h('input', { type: 'date', required: true, value: d.date, max: L.toDateInput(Date.now()), oninput: (e) => { d.date = e.target.value; } })),
    field('Note', noteInput(d)),
  ], () => {
    if (!d.word.trim()) return 'What was the word?';
    const entry = { id: d.id, word: d.word.trim(), date: d.date, note: (d.note || '').trim() };
    const i = state.words.findIndex((w) => w.id === entry.id);
    if (i >= 0) state.words[i] = entry; else state.words.push(entry);
  }, existing && (() => removeWithUndo('words', existing)));
}
const REACTIONS = [['loved', '😍 Loved it'], ['ok', '🙂 OK'], ['disliked', '😖 Not a fan']];
export function foodSheet(existing, presetName) {
  const d = existing ? { ...existing } : { id: L.uid(), name: presetName || '', date: L.toDateInput(Date.now()), reaction: '', allergy: false, note: '' };
  formSheet(existing ? 'Edit food' : 'Add a first food', d, (_, redraw) => [
    field('Food', h('input', { type: 'text', required: true, maxLength: 60, value: d.name, oninput: (e) => { d.name = e.target.value; } })),
    field('First tried on', h('input', { type: 'date', required: true, value: d.date, max: L.toDateInput(Date.now()), oninput: (e) => { d.date = e.target.value; } })),
    field('How did it go?', seg(REACTIONS, d.reaction, (v) => { d.reaction = d.reaction === v ? '' : v; redraw(); })),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: d.allergy, onchange: (e) => { d.allergy = e.target.checked; redraw(); } }), 'Possible allergic reaction (rash, swelling, vomiting)'),
    d.allergy && h('p', { class: 'warnbox' }, 'Stop offering this food and talk to your doctor. Trouble breathing, or swelling of the face or tongue, is an emergency: call emergency services right away.'),
    field('Note', noteInput(d)),
  ], () => {
    if (!d.name.trim()) return 'Which food?';
    const entry = { id: d.id, name: d.name.trim(), date: d.date, reaction: d.reaction, allergy: !!d.allergy, note: (d.note || '').trim() };
    const i = state.foods.findIndex((f) => f.id === entry.id);
    if (i >= 0) state.foods[i] = entry; else state.foods.push(entry);
  }, existing && (() => removeWithUndo('foods', existing)));
}

export function viewFirsts() {
  const byDate = (a, b) => b.date.localeCompare(a.date);
  const age = (date) => (state.baby.birthDate ? L.ageLabel(state.baby.birthDate, L.parseDate(date)) : '');
  const tabs = seg([['words', 'Words'], ['foods', 'Foods']], view.firsts, (v) => { view.firsts = v; render(); });
  if (view.firsts === 'words') {
    return [tabs, h('section', { class: 'card' },
      h('button', { class: 'btn primary block', type: 'button', onclick: () => wordSheet() }, '+ Add a word'),
      state.words.length ? h('ul', { class: 'list' }, [...state.words].sort(byDate).map((w) => h('li', null, h('button', { type: 'button', onclick: () => wordSheet(w) },
        h('i', { class: 'ico' }, icon('bubble', 20)), h('span', { class: 'grow' }, h('b', null, `“${w.word}”`), h('small', null, [age(w.date), w.note].filter(Boolean).join(' · '))),
        h('time', null, fmtDate(L.parseDate(w.date), true))))))
        : h('p', { class: 'empty' }, 'No words yet. The first one is worth writing down!'))];
  }
  const emoji = { loved: '😍', ok: '🙂', disliked: '😖' };
  return [tabs,
    h('section', { class: 'card' },
      h('button', { class: 'btn primary block', type: 'button', onclick: () => foodSheet() }, '+ Add a first food'),
      state.foods.length ? h('ul', { class: 'list' }, [...state.foods].sort(byDate).map((f) => h('li', null, h('button', { type: 'button', onclick: () => foodSheet(f) },
        h('i', { class: 'ico' }, emoji[f.reaction] || icon('bowl', 20)),
        h('span', { class: 'grow' }, h('b', null, f.name, f.allergy && h('span', { class: 'tag warn' }, '⚠ reaction')), h('small', null, [age(f.date), f.note].filter(Boolean).join(' · '))),
        h('time', null, fmtDate(L.parseDate(f.date), true))))))
        : h('p', { class: 'empty' }, 'No foods yet. Log a solid feed or add one here.')),
    h('p', { class: 'fine pad' }, 'Not sure what to offer next? ', h('button', { class: 'linkish', type: 'button', onclick: () => { view.ideas = 'food'; go('ideas'); } }, 'See food ideas'), '.'),
  ];
}
