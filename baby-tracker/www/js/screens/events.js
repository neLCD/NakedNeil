// The sheets that add or edit a logged event (feed, sleep, diaper, spit-up),
// and starting the breastfeeding timer. Used by Today.
import * as L from '../logic.js';
import { h, num, toast, openSheet, closeSheet, field, seg } from '../ui.js';
import { state, save, units, view, go, showDay } from '../store.js';
import { actions, timeInput, noteInput, badTime, formSheet, removeWithUndo } from '../forms.js';
import { FOOD_IDEAS } from '../content.js';
import { playSound, soundPlaying } from '../sounds.js';

function upsertEvent(ev) {
  const i = state.events.findIndex((e) => e.id === ev.id);
  if (i >= 0) state.events[i] = ev; else state.events.push(ev);
  showDay(ev.start); // jump to the day the entry landed on, so it is visible
}

export function feedSheet(existing, preset) {
  // New feeds start from what was done last time: same method, same bottle size, the other breast.
  const lastFeed = L.lastEvent(state.events, (e) => e.type === 'feed' && e.method !== 'solid');
  const lastBottle = L.lastEvent(state.events, (e) => e.type === 'feed' && e.method === 'bottle');
  const lastBreast = L.lastEvent(state.events, (e) => e.type === 'feed' && e.method === 'breast');
  const draft = existing ? { ...existing } : {
    id: L.uid(), type: 'feed', method: preset || (lastFeed ? lastFeed.method : 'bottle'), start: Date.now(),
    side: lastBreast && lastBreast.side === 'left' ? 'right' : 'left',
    content: lastBottle ? lastBottle.content : 'Formula', amountMl: lastBottle ? lastBottle.amountMl : undefined,
  };
  if (draft.amountMl) draft.amount = L.volumeFromMl(draft.amountMl, units());
  const shownAmount = draft.amount; // to tell an untouched amount from an edited one
  formSheet(existing ? 'Edit feed' : 'Log a feed', draft, (d, redraw) => [
    seg([['breast', 'Breast'], ['bottle', 'Bottle'], ['solid', 'Solid']], d.method, (v) => { d.method = v; redraw(); }),
    d.method === 'breast' && !existing && [
      h('div', { class: 'row2' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => startNursing('left') }, '▶ Start left'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => startNursing('right') }, '▶ Start right')),
      h('p', { class: 'divider' }, state.nursing ? 'A timer is already running. Starting again replaces it.' : 'or enter a feed that already happened'),
    ],
    d.method === 'breast' && [
      field('Side', seg([['left', 'Left'], ['right', 'Right'], ['both', 'Both']], d.side, (v) => { d.side = v; redraw(); })),
      field('Minutes', h('input', { type: 'number', inputMode: 'numeric', min: 0, max: 180, value: d.minutes ?? '', oninput: (e) => { d.minutes = e.target.value; } })),
    ],
    d.method === 'bottle' && [
      field(`Amount (${units() === 'imperial' ? 'oz' : 'ml'})`, amountStepper(d)),
      field('What', seg([['Formula', 'Formula'], ['Breast milk', 'Breast milk']], d.content, (v) => { d.content = v; redraw(); })),
    ],
    d.method === 'solid' && [
      field('Food', h('input', { type: 'text', list: 'food-names', maxLength: 60, required: true, value: d.food || '', placeholder: 'e.g. Avocado', oninput: (e) => { d.food = e.target.value; } }),
        'New foods are added to First foods automatically.'),
      h('datalist', { id: 'food-names' }, [...new Set([...state.foods.map((f) => f.name), ...FOOD_IDEAS.map((f) => f.name)])].map((n) => h('option', { value: n }))),
    ],
    field('When', timeInput(d)),
    field('Note', noteInput(d)),
  ], (d) => {
    const bad = badTime(d); if (bad) return bad;
    const ev = { id: d.id, type: 'feed', method: d.method, start: d.start, note: (d.note || '').trim() };
    if (d.method === 'breast') {
      ev.side = d.side; ev.minutes = Math.round(num(d.minutes) ?? 0) || undefined;
      // keep the timer's left/right split unless the entry was changed
      if (existing && existing.leftMin != null && ev.side === 'both' && ev.minutes === existing.minutes) { ev.leftMin = existing.leftMin; ev.rightMin = existing.rightMin; }
    }
    if (d.method === 'bottle') {
      const a = num(d.amount);
      // an untouched amount keeps its exact stored value (no ml -> oz -> ml rounding drift)
      ev.amountMl = existing && existing.amountMl && String(d.amount) === String(shownAmount) ? existing.amountMl : a ? L.volumeToMl(a, units()) : undefined;
      if (ev.amountMl > 1000) return 'That is more than a litre in one bottle. Please check the amount.';
      ev.content = d.content;
    }
    if (d.method === 'solid') {
      ev.food = (d.food || '').trim();
      if (!ev.food) return 'What did they eat?';
      if (!state.foods.some((f) => f.name.trim().toLowerCase() === ev.food.toLowerCase())) {
        state.foods.push({ id: L.uid(), name: ev.food, date: L.toDateInput(ev.start), reaction: '', allergy: false, note: '' });
        setTimeout(() => toast(`${ev.food} added to First foods`), 50);
      }
    }
    upsertEvent(ev);
  }, existing && (() => removeWithUndo('events', existing)));
}

/** Bottle amount: a number box with − and + buttons (10 ml or 0.5 oz a tap). */
function amountStepper(d) {
  const step = units() === 'imperial' ? 0.5 : 10;
  const box = h('input', { type: 'number', inputMode: 'decimal', min: 0, step: 'any', value: d.amount ?? '', 'aria-label': 'Amount', oninput: (e) => { d.amount = e.target.value; } });
  const nudge = (dir) => {
    const next = Math.max(0, Math.round(((num(d.amount) ?? 0) + dir * step) / step) * step);
    d.amount = String(+next.toFixed(1)); box.value = d.amount;
  };
  return h('div', { class: 'stepper' },
    h('button', { type: 'button', 'aria-label': `Less, ${step} ${units() === 'imperial' ? 'oz' : 'ml'}`, onclick: () => nudge(-1) }, '−'),
    box,
    h('button', { type: 'button', 'aria-label': `More, ${step} ${units() === 'imperial' ? 'oz' : 'ml'}`, onclick: () => nudge(1) }, '+'));
}

/** Start a sleep now. With `noise`, the white noise starts too (same sound and timer as last time). */
function startSleep(noise) {
  if (L.currentSleep(state.events)) return closeSheet(); // a second tap: the sleep is already running
  state.events.push({ id: L.uid(), type: 'sleep', start: Date.now(), end: null });
  if (noise) playSound();
  closeSheet(); save();
  toast(noise ? 'Sleep and white noise started. Sweet dreams!' : 'Sleep started. Sweet dreams!', 'Sounds', () => go('sounds'));
}
export function sleepSheet(existing) {
  if (!existing) {
    const draft = { id: L.uid(), type: 'sleep', start: Date.now() - L.HOUR, end: Date.now() };
    let saved = false;
    openSheet('Sleep',
      h('button', { class: 'btn primary block', type: 'button', onclick: () => startSleep(false) }, 'Start sleep now'),
      !soundPlaying() && h('button', { class: 'btn block', type: 'button', onclick: () => startSleep(true) }, 'Start sleep with white noise'),
      h('p', { class: 'divider' }, 'or log a sleep that already happened'),
      h('form', {
        onsubmit: (e) => {
          e.preventDefault();
          if (saved) return;
          const bad = badTime(draft); if (bad) return toast(bad);
          if (!draft.end || draft.end <= draft.start) return toast('Wake-up time must be after the start.');
          if (draft.end > Date.now() + 5 * 60000) return toast('That time is in the future. Please check the date.');
          if (draft.end - draft.start > 16 * L.HOUR && !confirm(`Save a sleep of ${L.fmtDuration(draft.end - draft.start)}?`)) return;
          saved = true;
          showDay(draft.start);
          state.events.push({ ...draft, note: (draft.note || '').trim() }); closeSheet(); save();
        },
      }, field('Fell asleep', timeInput(draft)), field('Woke up', timeInput(draft, 'end')), field('Note', noteInput(draft)), actions(null, 'Save past sleep')));
    return;
  }
  formSheet('Edit sleep', { ...existing }, (d) => [
    field('Fell asleep', timeInput(d)),
    field('Woke up', timeInput(d, 'end'), 'Leave empty if still sleeping.'),
    field('Note', noteInput(d)),
  ], (d) => {
    const bad = badTime(d); if (bad) return bad;
    if (d.end && d.end <= d.start) return 'Wake-up time must be after the start.';
    if (d.end && d.end > Date.now() + 5 * 60000) return 'The wake-up time is in the future.';
    if (d.end && d.end - d.start > 16 * L.HOUR && !confirm(`Save a sleep of ${L.fmtDuration(d.end - d.start)}?`)) return 'Not saved. Check the times.';
    upsertEvent({ id: d.id, type: 'sleep', start: d.start, end: d.end || null, note: (d.note || '').trim() });
  }, () => removeWithUndo('events', existing));
}

const POOP_COLORS = ['', 'Yellow', 'Brown', 'Green', 'Black', 'Red', 'White or pale'];
function diaperSheet(existing) {
  formSheet('Edit diaper', { ...existing }, (d, redraw) => [
    seg([['pee', 'Pee'], ['poop', 'Poop'], ['both', 'Both']], d.kind, (v) => { d.kind = v; redraw(); }),
    d.kind !== 'pee' && field('Poop colour', h('select', { onchange: (e) => { d.color = e.target.value; redraw(); } },
      POOP_COLORS.map((c) => h('option', { value: c, selected: c === (d.color || '') }, c || 'Not recorded'))),
    ['Black', 'Red', 'White or pale'].includes(d.color) && 'After the first few days of life, black, red or white/pale poop is worth a call to your doctor.'),
    field('When', timeInput(d)),
    field('Note', noteInput(d)),
  ], (d) => {
    const bad = badTime(d); if (bad) return bad;
    upsertEvent({ id: d.id, type: 'diaper', kind: d.kind, color: d.kind === 'pee' ? '' : d.color || '', start: d.start, note: (d.note || '').trim() });
  }, () => removeWithUndo('events', existing));
}
function spitupSheet(existing) {
  formSheet('Edit spit-up', { ...existing }, (d, redraw) => [
    field('How much', seg([['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']], d.amount, (v) => { d.amount = v; redraw(); })),
    field('When', timeInput(d)),
    field('Note', noteInput(d)),
  ], (d) => {
    const bad = badTime(d); if (bad) return bad;
    upsertEvent({ id: d.id, type: 'spitup', amount: d.amount, start: d.start, note: (d.note || '').trim() });
  }, () => removeWithUndo('events', existing));
}

export function startNursing(side) {
  const now = Date.now();
  state.nursing = { start: now, side, sideStart: now, leftMs: 0, rightMs: 0 };
  view.tab = 'today'; view.day = null;
  closeSheet(); save();
}

export const editEvent = (e) => ({ feed: feedSheet, sleep: sleepSheet, diaper: diaperSheet, spitup: spitupSheet }[e.type](e));
