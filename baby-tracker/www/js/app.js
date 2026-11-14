// TinyLog: UI. All data lives on the device (localStorage); nothing leaves it
// unless the parent asks the AI a question.
import * as L from './logic.js';
import { FOOD_IDEAS, FOODS_TO_AVOID, GEAR_CATEGORIES, GEAR_IDEAS } from './content.js';
import { lineChart, barChart, patternChart } from './chart.js';
import { ACTIVITIES, ACTIVITY_AREAS, ACTIVITY_BANDS, bandFor } from './activities.js';
import { DEFAULT_AI_URL } from './config.js';
import { icon } from './icons.js';

// ---------- helpers ----------
const clean = (kids) => kids.flat(Infinity).filter((k) => k != null && k !== false && k !== '');
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  el.append(...clean(kids));
  return el;
}
const $ = (id) => document.getElementById(id);
const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDay = (ts) => new Date(ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const fmtDate = (ts, long) => new Date(ts).toLocaleDateString([], long ? { year: 'numeric', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' });
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : null; };

// ---------- state ----------
const KEY = 'tinylog.v1';
const blank = () => ({
  baby: { name: '', birthDate: '' },
  settings: { units: 'metric', currency: '$', aiUrl: '' },
  events: [], growth: [], words: [], foods: [], gear: [],
  nursing: null, // breastfeeding timer in progress, see logic.js
  activityLog: [], // { id, activityId, name, date } each time an activity is marked done
});
function normalise(data) {
  const b = blank();
  if (!data || typeof data !== 'object') return b;
  return {
    baby: { ...b.baby, ...(data.baby || {}) },
    settings: { ...b.settings, ...(data.settings || {}) },
    events: Array.isArray(data.events) ? data.events.filter((e) => e && e.id && e.type && Number.isFinite(e.start)) : [],
    growth: Array.isArray(data.growth) ? data.growth.filter((g) => g && g.id && g.date) : [],
    words: Array.isArray(data.words) ? data.words.filter((w) => w && w.id && w.word) : [],
    foods: Array.isArray(data.foods) ? data.foods.filter((f) => f && f.id && f.name) : [],
    gear: Array.isArray(data.gear) ? data.gear.filter((g) => g && g.id && g.name) : [],
    nursing: data.nursing && Number.isFinite(data.nursing.start) ? data.nursing : null,
    activityLog: Array.isArray(data.activityLog) ? data.activityLog.filter((a) => a && a.activityId && a.date) : [],
  };
}
function load() { try { return normalise(JSON.parse(localStorage.getItem(KEY))); } catch { return blank(); } }
let state = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { toast('Could not save. Storage may be full.'); }
  render();
}
const units = () => state.settings.units;
const ui = { tab: 'home', day: null, welcome: { name: '', birthDate: '' }, trends: 'daily', firsts: 'words', more: 'tips', trend: { metric: 'sleep', days: 7 }, band: null, ai: { busy: false, answer: '', error: '', question: '', draft: '' } };

// ---------- toast ----------
let toastTimer;
function toast(text, actionLabel, action) {
  const box = $('toast');
  box.replaceChildren(...clean([h('span', null, text), actionLabel && h('button', { type: 'button', onclick: () => { box.hidden = true; action(); } }, actionLabel)]));
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 4500);
}

// ---------- bottom sheet ----------
let sheetOpen = false;
function openSheet(title, ...content) {
  const root = $('sheet-root');
  if (sheetOpen) { // a redraw of the open sheet: swap the contents in place, no animation, keep scroll
    const panel = root.querySelector('.sheet'), bodyEl = panel.querySelector('.sheet-body'), top = bodyEl.scrollTop;
    panel.querySelector('h2').textContent = title;
    panel.setAttribute('aria-label', title);
    bodyEl.replaceChildren(...clean(content));
    bodyEl.scrollTop = top;
    return bodyEl;
  }
  $('toast').hidden = true;
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'grab', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet-head' }, h('h2', null, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: closeSheet }, icon('close', 22))),
    h('div', { class: 'sheet-body' }, content));
  root.replaceChildren(h('div', { class: 'scrim', onclick: closeSheet }), panel);
  root.hidden = false;
  sheetOpen = true;
  history.pushState({ sheet: true }, ''); // Android back closes the sheet
  return panel.querySelector('.sheet-body');
}
function removeSheet() { sheetOpen = false; $('sheet-root').hidden = true; $('sheet-root').replaceChildren(); }
function closeSheet() { if (sheetOpen && history.state && history.state.sheet) history.back(); else removeSheet(); }
window.addEventListener('popstate', removeSheet);

// ---------- form bits ----------
const field = (label, input, hint) => h('label', { class: 'field' }, h('span', null, label), input, hint && h('small', null, hint));
function seg(options, value, onChange) {
  return h('div', { class: 'seg', role: 'group' }, options.map(([v, label]) =>
    h('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => onChange(v) }, label)));
}
const actions = (onDelete, saveLabel = 'Save') => h('div', { class: 'actions' },
  onDelete && h('button', { class: 'btn danger', type: 'button', onclick: onDelete }, 'Delete'),
  h('button', { class: 'btn primary', type: 'submit' }, saveLabel));
const timeInput = (draft, key = 'start') => h('input', {
  type: 'datetime-local', required: key === 'start', value: draft[key] ? L.toDateTimeInput(draft[key]) : '',
  oninput: (e) => { draft[key] = e.target.value ? L.fromDateTimeInput(e.target.value) : null; },
});
const noteInput = (draft) => h('input', { type: 'text', maxLength: 200, value: draft.note || '', placeholder: 'Optional', oninput: (e) => { draft.note = e.target.value; } });

function upsertEvent(ev) {
  const i = state.events.findIndex((e) => e.id === ev.id);
  if (i >= 0) state.events[i] = ev; else state.events.push(ev);
  showDay(ev.start); // jump to the day the entry landed on, so it is visible
}
/** Draft-driven sheet: `build(draft, rerender)` returns the form fields; `commit(draft)` returns an error string or nothing. */
function formSheet(title, draft, build, commit, onDelete) {
  const draw = () => {
    const err = h('p', { class: 'warnbox', role: 'alert', hidden: true });
    openSheet(title, h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        const msg = commit(draft);
        if (msg) { err.textContent = msg; err.hidden = false; err.scrollIntoView({ block: 'nearest' }); return; }
        closeSheet(); save();
      },
    }, build(draft, draw), err, actions(onDelete)));
  };
  draw();
}
/** Delete with an Undo toast instead of a confirmation dialog. */
function removeWithUndo(key, item) {
  state[key] = state[key].filter((x) => x.id !== item.id);
  closeSheet(); save();
  toast('Deleted', 'Undo', () => { state[key].push(item); save(); });
}

// ---------- event sheets ----------
function feedSheet(existing, preset) {
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
      field(`Amount (${units() === 'imperial' ? 'oz' : 'ml'})`, h('input', { type: 'number', inputMode: 'decimal', min: 0, step: 'any', value: d.amount ?? '', oninput: (e) => { d.amount = e.target.value; } })),
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
    if (d.method === 'bottle') { const a = num(d.amount); ev.amountMl = a ? L.volumeToMl(a, units()) : undefined; ev.content = d.content; }
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

function sleepSheet(existing) {
  if (!existing) {
    const draft = { id: L.uid(), type: 'sleep', start: Date.now() - L.HOUR, end: Date.now() };
    openSheet('Sleep',
      h('button', { class: 'btn primary block', type: 'button', onclick: () => { state.events.push({ id: L.uid(), type: 'sleep', start: Date.now(), end: null }); closeSheet(); save(); toast('Sleep started. Sweet dreams!'); } }, 'Start sleep now'),
      h('p', { class: 'divider' }, 'or log a sleep that already happened'),
      h('form', {
        onsubmit: (e) => {
          e.preventDefault();
          if (!draft.start || !draft.end || draft.end <= draft.start) return toast('Wake-up time must be after the start.');
          if (draft.end > Date.now() + 5 * 60000) return toast('That time is in the future. Please check the date.');
          if (draft.end - draft.start > 16 * L.HOUR && !confirm(`Save a sleep of ${L.fmtDuration(draft.end - draft.start)}?`)) return;
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
// ---------- breastfeeding timer ----------
function startNursing(side) {
  const now = Date.now();
  state.nursing = { start: now, side, sideStart: now, leftMs: 0, rightMs: 0 };
  ui.tab = 'home'; ui.day = null;
  closeSheet(); save();
}
function nursingCard() {
  const n = state.nursing;
  if (!n) return null;
  const running = n.sideStart != null;
  const sideBtn = (side, label) => h('button', {
    type: 'button', class: 'side' + (running && n.side === side ? ' on' : ''), 'data-side': side,
    'aria-pressed': String(running && n.side === side),
    onclick: () => { state.nursing = L.nursingTap(state.nursing, side); save(); },
  }, h('b', null, label), h('span', { class: 'side-time' }, ''), h('small', null, running && n.side === side ? 'Tap to pause' : running ? 'Tap to switch' : 'Tap to resume'));
  return h('section', { class: 'card nurse', 'aria-label': 'Breastfeeding timer' },
    h('div', { class: 'nurse-head' }, h('span', null, running ? 'Feeding now' : 'Paused'), h('b', { id: 'nurse-clock', role: 'timer' }, '')),
    h('div', { class: 'row2' }, sideBtn('left', 'Left'), sideBtn('right', 'Right')),
    h('div', { class: 'actions' },
      h('button', { class: 'btn danger', type: 'button', onclick: () => { if (confirm('Discard this feed without logging it?')) { state.nursing = null; save(); } } }, 'Discard'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => {
        const ev = L.nursingToFeed(state.nursing);
        state.nursing = null; state.events.push(ev); showDay(ev.start); save();
        toast(`Breastfeed logged: ${L.describeEvent(ev, units()).detail}`, 'Edit', () => editEvent(ev));
      } }, '■ Stop and log')));
}
function tickNursing() {
  const clock = $('nurse-clock');
  if (!clock || !state.nursing) return;
  const t = L.nursingElapsed(state.nursing);
  clock.textContent = L.fmtClock(t.totalMs);
  for (const el of document.querySelectorAll('.nurse .side')) el.querySelector('.side-time').textContent = L.fmtClock(el.dataset.side === 'left' ? t.leftMs : t.rightMs);
}
setInterval(tickNursing, 1000);

// ui.day is null while looking at today, so the screen follows midnight on its own.
const viewDay = () => ui.day ?? L.dayStart(Date.now());
function showDay(ts) { const d = L.dayStart(ts); ui.day = d >= L.dayStart(Date.now()) ? null : d; }
/** Shared checks for an event's start time. Returns a message when it should not be saved. */
function badTime(d) {
  if (!d.start) return 'Please set a time.';
  if (d.start > Date.now() + 5 * 60000) return 'That time is in the future. Please check the date.';
}
const editEvent = (e) => ({ feed: feedSheet, sleep: sleepSheet, diaper: diaperSheet, spitup: spitupSheet }[e.type](e));

function quickLog(ev, label) {
  const full = { id: L.uid(), start: Date.now(), note: '', ...ev };
  state.events.push(full);
  ui.day = null;
  save();
  toast(`${label} logged at ${fmtTime(full.start)}`, 'Edit', () => editEvent(full));
}

// ---------- home ----------
function viewHome() {
  const now = Date.now(), ev = state.events;
  if (!state.baby.name && !state.baby.birthDate && !ev.length) return viewWelcome();
  const sleeping = L.currentSleep(ev);
  const lastFeed = L.lastEvent(ev, (e) => e.type === 'feed');
  const lastDiaper = L.lastEvent(ev, (e) => e.type === 'diaper');
  const lastSleep = L.lastEvent(ev, (e) => e.type === 'sleep' && e.end != null);
  const since = (e) => (e ? L.fmtDuration(now - e.start) : '—');

  const from = viewDay(), to = L.addDays(from, 1), isToday = ui.day == null;
  const s = L.summarize(ev, from, to, now);
  // include a sleep that began the evening before, so the day's sleep total is explained
  const carried = (e) => e.type === 'sleep' && e.start < from && (e.end ?? now) > from;
  const dayEvents = ev.filter((e) => (e.start >= from && e.start < to) || carried(e)).sort((a, b) => b.start - a.start);
  const milk = [s.bottleMl ? `${L.fmtVolume(s.bottleMl, units())} by bottle` : '', s.breastMin ? `${s.breastMin} min breastfeeding` : '', s.solids ? `${s.solids} solid meal${s.solids === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');

  return [
    nursingCard(),
    h('section', { class: 'since' },
      h('div', { class: 'chip' }, h('span', null, 'Since feed'), h('b', null, since(lastFeed))),
      h('div', { class: 'chip' + (sleeping ? ' on' : '') }, h('span', null, sleeping ? 'Asleep for' : 'Awake for'),
        h('b', null, sleeping ? L.fmtDuration(now - sleeping.start) : lastSleep ? L.fmtDuration(now - lastSleep.end) : '—')),
      h('div', { class: 'chip' }, h('span', null, 'Since diaper'), h('b', null, since(lastDiaper)))),
    h('section', { class: 'quick' },
      h('button', { type: 'button', class: 'q t-feed', onclick: () => feedSheet() }, icon('bottle', 30), 'Feed'),
      sleeping
        ? h('button', { type: 'button', class: 'q t-sleep on', onclick: () => { sleeping.end = Date.now(); save(); toast(`Woke up after ${L.fmtDuration(sleeping.end - sleeping.start)}`, 'Edit', () => editEvent(sleeping)); } }, icon('sun', 30), 'Wake up')
        : h('button', { type: 'button', class: 'q t-sleep', onclick: () => sleepSheet() }, icon('moon', 30), 'Sleep'),
      h('button', { type: 'button', class: 'q t-pee', onclick: () => quickLog({ type: 'diaper', kind: 'pee' }, 'Pee') }, icon('drop', 30), 'Pee'),
      h('button', { type: 'button', class: 'q t-poop', onclick: () => quickLog({ type: 'diaper', kind: 'poop' }, 'Poop') }, icon('diaper', 30), 'Poop'),
      h('button', { type: 'button', class: 'q t-spit', onclick: () => quickLog({ type: 'spitup', amount: 'small' }, 'Spit-up') }, icon('spit', 30), 'Spit-up'),
      h('button', { type: 'button', class: 'q t-solid', onclick: () => feedSheet(null, 'solid') }, icon('bowl', 30), 'Solids')),
    h('section', { class: 'card' },
      h('div', { class: 'daynav' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous day', onclick: () => { ui.day = L.addDays(viewDay(), -1); render(); } }, icon('back', 20)),
        h('h2', null, isToday ? 'Today' : fmtDay(from)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next day', disabled: isToday, onclick: () => { showDay(L.addDays(viewDay(), 1)); render(); } }, icon('next', 20))),
      h('div', { class: 'stats' },
        stat('Milk feeds', s.milkFeeds),
        stat('Sleep', `${+(s.sleepMs / L.HOUR).toFixed(1)}h`),
        stat('Wet', s.wet),
        stat('Dirty', s.dirty),
        stat('Spit-ups', s.spitups)),
      milk && h('p', { class: 'fine center' }, milk),
      dayEvents.length
        ? h('ul', { class: 'list' }, dayEvents.map((e) => {
          const d = L.describeEvent(e, units());
          return h('li', null, h('button', { type: 'button', onclick: () => editEvent(e) },
            eventIcon(e), h('span', { class: 'grow' }, h('b', null, d.title), (d.detail || e.note) && h('small', null, [d.detail, e.note].filter(Boolean).join(' · '))),
            h('time', null, carried(e) ? `from ${fmtTime(e.start)} the day before` : fmtTime(e.start))));
        }))
        : h('p', { class: 'empty' }, isToday ? 'Nothing logged yet today. Tap a button above to start.' : 'Nothing was logged on this day.')),
  ];
}
function eventIcon(e) {
  const [name, tint] = e.type === 'sleep' ? ['moon', 'sleep'] : e.type === 'spitup' ? ['spit', 'spit']
    : e.type === 'diaper' ? (e.kind === 'pee' ? ['drop', 'pee'] : ['diaper', 'poop'])
      : e.method === 'solid' ? ['bowl', 'solid'] : e.method === 'breast' ? ['heart', 'feed'] : ['bottle', 'feed'];
  return h('i', { class: `ico t-${tint}` }, icon(name, 20));
}
const stat = (label, value, sub) => h('div', { class: 'stat' }, h('b', null, String(value)), h('span', null, label), sub && h('small', null, sub));

function viewWelcome() {
  const d = ui.welcome;
  return h('section', { class: 'card welcome' },
    h('img', { class: 'hero', src: 'icon.svg', alt: '', width: 84, height: 84 }),
    h('h2', null, 'Welcome to TinyLog'),
    h('p', null, 'Track feeds, sleep, diapers, growth and all the firsts. Everything stays on this phone.'),
    h('form', { onsubmit: (e) => { e.preventDefault(); state.baby = { name: d.name.trim(), birthDate: d.birthDate }; save(); } },
      field('Baby’s name', h('input', { type: 'text', maxLength: 40, required: true, value: d.name, oninput: (e) => { d.name = e.target.value; } })),
      field('Birth date', h('input', { type: 'date', required: true, value: d.birthDate, max: L.toDateInput(Date.now()), oninput: (e) => { d.birthDate = e.target.value; } })),
      h('button', { class: 'btn primary block', type: 'submit' }, 'Get started')));
}

// ---------- trends ----------
const TREND = {
  sleep: { label: 'Sleep', unit: 'h', series: [{ name: 'Sleep', cls: 's1' }], values: (d) => [+(d.sleepMs / L.HOUR).toFixed(1)], fmt: (d) => `${+(d.sleepMs / L.HOUR).toFixed(1)} h asleep` },
  feeds: { label: 'Feeds', unit: '', series: [{ name: 'Milk feeds', cls: 's1' }], values: (d) => [d.milkFeeds], fmt: (d) => `${d.milkFeeds} milk feed${d.milkFeeds === 1 ? '' : 's'}${d.solids ? ` · ${d.solids} solid` : ''}` },
  diapers: { label: 'Diapers', unit: '', series: [{ name: 'Wet', cls: 's1' }, { name: 'Dirty', cls: 's2' }], values: (d) => [d.wet, d.dirty], fmt: (d) => `${d.wet} wet · ${d.dirty} dirty` },
};
function viewDaily() {
  const t = TREND[ui.trend.metric], n = ui.trend.days;
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
        h('button', { class: 'btn small', type: 'button', 'aria-label': 'Change number of days', onclick: () => { ui.trend.days = { 7: 14, 14: 30, 30: 7 }[n]; render(); } }, `${n} days ▾`)),
      h('div', { class: 'stats' },
        stat('Milk feeds', avg((d) => d.milkFeeds), bottle ? L.fmtVolume(bottle, units()) : ''),
        stat('Sleep', `${avg((d) => d.sleepMs / L.HOUR)}h`),
        stat('Wet', avg((d) => d.wet)),
        stat('Dirty', avg((d) => d.dirty)),
        stat('Spit-ups', avg((d) => d.spitups))),
      h('p', { class: 'fine' }, 'Averages use full days that have something logged. Today is left out until it is over.')),
    h('section', { class: 'card' },
      seg(Object.entries(TREND).map(([k, v]) => [k, v.label]), ui.trend.metric, (v) => { ui.trend.metric = v; render(); }),
      any ? [
        t.series.length > 1 && h('div', { class: 'legend' }, t.series.map((sr) => h('span', null, h('i', { class: `sw ${sr.cls}` }), sr.name))),
        barChart({ days, series: t.series, unit: t.unit, fmtValue: t.fmt, ariaLabel: `${t.label} per day for the last ${n} days`,
          band: ui.trend.metric === 'sleep' ? L.sleepRange(L.ageMonths(state.baby.birthDate)) : null }),
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
const viewTrends = () => [
  seg([['daily', 'Daily'], ['growth', 'Growth']], ui.trends, (v) => { ui.trends = v; render(); }),
  ui.trends === 'growth' ? viewGrowth() : viewDaily(),
];

// ---------- activities ----------
function viewPlay() {
  const months = L.ageMonths(state.baby.birthDate);
  const mine = bandFor(months), band = ACTIVITY_BANDS.find((b) => b.label === ui.band) || mine;
  const today = L.toDateInput(Date.now());
  const log = state.activityLog;
  const count = (id) => log.filter((a) => a.activityId === id).length;
  const doneToday = (id) => log.some((a) => a.activityId === id && a.date === today);
  const list = ACTIVITIES.filter((a) => a.from === band.from).sort((a, b) => Math.sign(count(a.id)) - Math.sign(count(b.id)));
  const week = log.filter((a) => Date.now() - L.parseDate(a.date) < 7 * L.DAY).length;
  return [
    h('section', { class: 'card' },
      h('div', { class: 'cardhead' }, h('h2', null, 'Play ideas'), h('small', null, week ? `${week} done this week` : 'Tap Done to keep count')),
      field('Age', h('select', { 'aria-label': 'Age range', onchange: (e) => { ui.band = e.target.value; render(); } },
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

// ---------- growth ----------
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
      return;
    }
    const i = state.growth.findIndex((g) => g.id === entry.id);
    if (i >= 0) state.growth[i] = entry; else state.growth.push(entry);
  }, existing && (() => removeWithUndo('growth', existing)));
}

function viewGrowth() {
  const u = units();
  const rows = [...state.growth].sort((a, b) => a.date.localeCompare(b.date));
  const weights = rows.filter((g) => g.weightKg), heights = rows.filter((g) => g.heightCm);
  const delta = (list, key, fmt) => {
    if (list.length < 2) return '';
    const diff = list[list.length - 1][key] - list[list.length - 2][key];
    return `${fmt(diff)} since last`;
  };
  const chart = (list, title, toValue, unit, fmt) => list.length > 0 && h('section', { class: 'card' },
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
      h('button', { class: 'btn primary block', type: 'button', onclick: () => growthSheet() }, '+ Add measurement')),
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

// ---------- firsts: words, foods, ideas ----------
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
function foodSheet(existing, presetName) {
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

function viewFirsts() {
  const byDate = (a, b) => b.date.localeCompare(a.date);
  const age = (date) => (state.baby.birthDate ? L.ageLabel(state.baby.birthDate, L.parseDate(date)) : '');
  const tabs = seg([['words', 'Words'], ['foods', 'Foods'], ['ideas', 'Ideas']], ui.firsts, (v) => { ui.firsts = v; render(); });
  if (ui.firsts === 'words') {
    return [tabs, h('section', { class: 'card' },
      h('button', { class: 'btn primary block', type: 'button', onclick: () => wordSheet() }, '+ Add a word'),
      state.words.length ? h('ul', { class: 'list' }, [...state.words].sort(byDate).map((w) => h('li', null, h('button', { type: 'button', onclick: () => wordSheet(w) },
        h('i', { class: 'ico' }, icon('bubble', 20)), h('span', { class: 'grow' }, h('b', null, `“${w.word}”`), h('small', null, [age(w.date), w.note].filter(Boolean).join(' · '))),
        h('time', null, fmtDate(L.parseDate(w.date), true))))))
        : h('p', { class: 'empty' }, 'No words yet. The first one is worth writing down!'))];
  }
  if (ui.firsts === 'foods') {
    const emoji = { loved: '😍', ok: '🙂', disliked: '😖' };
    return [tabs, h('section', { class: 'card' },
      h('button', { class: 'btn primary block', type: 'button', onclick: () => foodSheet() }, '+ Add a first food'),
      state.foods.length ? h('ul', { class: 'list' }, [...state.foods].sort(byDate).map((f) => h('li', null, h('button', { type: 'button', onclick: () => foodSheet(f) },
        h('i', { class: 'ico' }, emoji[f.reaction] || icon('bowl', 20)),
        h('span', { class: 'grow' }, h('b', null, f.name, f.allergy && h('span', { class: 'tag warn' }, '⚠ reaction')), h('small', null, [age(f.date), f.note].filter(Boolean).join(' · '))),
        h('time', null, fmtDate(L.parseDate(f.date), true))))))
        : h('p', { class: 'empty' }, 'No foods yet. Log a solid feed or add one here.'))];
  }
  const tried = new Set(state.foods.map((f) => f.name.trim().toLowerCase()));
  const months = L.ageMonths(state.baby.birthDate);
  const stages = [[6, 'From around 6 months'], [8, 'From around 8 months'], [10, 'From around 10 months']];
  return [tabs,
    months != null && months < 5.5 && h('p', { class: 'warnbox' }, 'Solids usually start at around 6 months. Until then, breast milk or formula is all your baby needs. Ask your doctor before starting earlier.'),
    stages.map(([m, title]) => h('section', { class: 'card' }, h('h2', null, title),
      h('ul', { class: 'ideas' }, FOOD_IDEAS.filter((f) => f.fromMonths === m).map((f) => h('li', null,
        h('span', { class: 'grow' }, h('b', null, f.name, f.allergen && h('span', { class: 'tag' }, `allergen: ${f.allergen}`)), h('small', null, f.prep)),
        tried.has(f.name.toLowerCase()) ? h('span', { class: 'done' }, '✓ Tried')
          : h('button', { class: 'btn small', type: 'button', onclick: () => foodSheet(null, f.name) }, 'Tried it')))))),
    h('section', { class: 'card' }, h('h2', null, 'Wait on these'), h('ul', { class: 'bullets' }, FOODS_TO_AVOID.map((t) => h('li', null, t))),
      h('p', { class: 'fine' }, 'Introduce common allergens one at a time and watch for a reaction. If your baby has severe eczema or a known allergy, ask your doctor first. General information only, not medical advice.')),
  ];
}

// ---------- gear ----------
function gearSheet(existing, preset) {
  const d = existing ? { ...existing } : { id: L.uid(), name: '', category: 'Other', price: '', url: '', priority: 'medium', bought: false, ...preset };
  formSheet(existing ? 'Edit item' : 'Add gear', d, (_, redraw) => [
    field('Item', h('input', { type: 'text', required: true, maxLength: 60, value: d.name, oninput: (e) => { d.name = e.target.value; } })),
    field('Category', h('select', { onchange: (e) => { d.category = e.target.value; } }, GEAR_CATEGORIES.map((c) => h('option', { value: c, selected: c === d.category }, c)))),
    field(`Price (${state.settings.currency})`, h('input', { type: 'number', inputMode: 'decimal', min: 0, step: 'any', value: d.price ?? '', oninput: (e) => { d.price = e.target.value; } })),
    field('Link to buy', h('input', { type: 'url', inputMode: 'url', maxLength: 500, value: d.url || '', placeholder: 'https://…', oninput: (e) => { d.url = e.target.value; } })),
    field('Priority', seg([['high', 'Need soon'], ['medium', 'Want'], ['low', 'Someday']], d.priority, (v) => { d.priority = v; redraw(); })),
  ], () => {
    if (!d.name.trim()) return 'What is the item?';
    const url = (d.url || '').trim();
    if (url && !/^https?:\/\//i.test(url)) return 'Links must start with http:// or https://';
    const entry = { id: d.id, name: d.name.trim(), category: d.category, price: num(d.price) ?? undefined, url, priority: d.priority, bought: !!d.bought };
    const i = state.gear.findIndex((g) => g.id === entry.id);
    if (i >= 0) state.gear[i] = entry; else state.gear.push(entry);
  }, existing && (() => removeWithUndo('gear', existing)));
}

function viewGear() {
  const cur = state.settings.currency;
  const money = (v) => `${cur}${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const rank = { high: 0, medium: 1, low: 2 };
  const toBuy = state.gear.filter((g) => !g.bought).sort((a, b) => rank[a.priority] - rank[b.priority] || a.name.localeCompare(b.name));
  const bought = state.gear.filter((g) => g.bought).sort((a, b) => a.name.localeCompare(b.name));
  const total = toBuy.reduce((s, g) => s + (g.price || 0), 0);
  const row = (g) => h('li', { class: g.bought ? 'bought' : '' },
    h('label', { class: 'tap' }, h('input', { type: 'checkbox', checked: g.bought, 'aria-label': `Bought ${g.name}`, onchange: (e) => { g.bought = e.target.checked; save(); } })),
    h('button', { type: 'button', onclick: () => gearSheet(g) },
      h('span', { class: 'grow' }, h('b', null, g.name, !g.bought && g.priority === 'high' && h('span', { class: 'tag warn' }, 'need soon')),
        h('small', null, [g.category, g.price != null && money(g.price)].filter(Boolean).join(' · ')))),
    g.url && h('a', { class: 'btn small', href: g.url, target: '_blank', rel: 'noopener noreferrer' }, 'Shop'));
  const have = new Set(state.gear.map((g) => g.name.trim().toLowerCase()));
  const months = L.ageMonths(state.baby.birthDate) ?? 0;
  const ideas = GEAR_IDEAS.filter((g) => !have.has(g.name.toLowerCase()));
  const now = ideas.filter((g) => g.fromMonths <= months + 1.5), later = ideas.filter((g) => g.fromMonths > months + 1.5);
  const ideaList = (list) => h('ul', { class: 'ideas' }, list.map((g) => h('li', null,
    h('span', { class: 'grow' }, h('b', null, g.name), h('small', null, `${g.category}${g.fromMonths ? ` · from about ${g.fromMonths} months` : ''}`)),
    h('button', { class: 'btn small', type: 'button', onclick: () => { state.gear.push({ id: L.uid(), name: g.name, category: g.category, priority: 'medium', bought: false, url: '' }); save(); toast(`${g.name} added to your list`); } }, '+ Add'))));
  return [
    h('section', { class: 'card' },
      h('div', { class: 'stats two' }, stat('To buy', toBuy.length, total ? `about ${money(total)}` : ''), stat('Bought', bought.length)),
      h('button', { class: 'btn primary block', type: 'button', onclick: () => gearSheet() }, '+ Add gear')),
    h('section', { class: 'card' }, h('h2', null, 'To buy later'),
      toBuy.length ? h('ul', { class: 'list gear' }, toBuy.map(row)) : h('p', { class: 'empty' }, 'Your wishlist is empty. Add something, or pick from the ideas below.')),
    bought.length > 0 && h('section', { class: 'card' }, h('h2', null, 'Bought'), h('ul', { class: 'list gear' }, bought.map(row))),
    now.length > 0 && h('section', { class: 'card' }, h('h2', null, 'Ideas for this stage'), ideaList(now)),
    later.length > 0 && h('section', { class: 'card' }, h('h2', null, 'Coming up later'), ideaList(later)),
  ];
}

// ---------- tips + AI ----------
const AI_PROMPTS = ['What foods should we try next?', 'How is sleep looking this week?', 'What should we play today?', 'What gear will we need soon?'];
const aiUrl = () => (state.settings.aiUrl || DEFAULT_AI_URL || '').trim().replace(/\/+$/, '');

async function askAi(question) {
  const q = question.trim();
  if (!q || ui.ai.busy) return;
  ui.ai = { busy: true, answer: '', error: '', question: q, draft: '' };
  render();
  try {
    const res = await fetch(`${aiUrl()}/suggest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, summary: L.aiSummary(state) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `The AI service returned an error (${res.status}).`);
    ui.ai = { busy: false, answer: String(data.text || ''), error: '', question: q };
  } catch (err) {
    ui.ai = { busy: false, answer: '', question: q, error: err instanceof TypeError ? 'Could not reach the AI service. Check your connection and the address in Settings.' : err.message };
  }
  render();
}

function viewMore() {
  return [seg([['tips', 'Tips'], ['gear', 'Gear']], ui.more, (v) => { ui.more = v; render(); }), ui.more === 'gear' ? viewGear() : viewTips()];
}
function viewTips() {
  const tips = L.buildTips(state);
  const input = h('textarea', { rows: 2, maxLength: 500, placeholder: 'Ask anything about feeding, sleep, foods, gear…', value: ui.ai.draft || '', oninput: (e) => { ui.ai.draft = e.target.value; } });
  return [
    aiUrl() && h('section', { class: 'card ai' }, h('h2', null, 'Ask the AI'),
      h('div', { class: 'chips' }, AI_PROMPTS.map((p) => h('button', { type: 'button', disabled: ui.ai.busy, onclick: () => askAi(p) }, p))),
      h('form', { onsubmit: (e) => { e.preventDefault(); askAi(input.value); } }, input,
        h('button', { class: 'btn primary block', type: 'submit', disabled: ui.ai.busy }, ui.ai.busy ? 'Thinking…' : 'Ask')),
      ui.ai.error && h('p', { class: 'warnbox', role: 'alert' }, ui.ai.error),
      ui.ai.answer && h('div', { class: 'answer', role: 'status' }, h('small', null, ui.ai.question), h('p', null, ui.ai.answer)),
      h('p', { class: 'fine' }, 'Asking sends a summary of the last 7 days of logs, plus growth, foods, words, activities and gear, to the AI service. Answers are general information, not medical advice.')),
    h('section', { class: 'card' }, h('h2', null, 'Tips for right now'),
      h('ul', { class: 'tips' }, tips.map((t) => h('li', { class: t.tone || '' }, h('i', null, t.icon), h('span', null, h('b', null, t.title), h('small', null, t.text))))),
      h('p', { class: 'fine' }, 'General information based on your logs. It is not medical advice. If you are worried about your baby, contact your doctor.')),
    !aiUrl() && h('p', { class: 'fine pad' }, 'AI suggestions are off. ', h('button', { class: 'linkish', type: 'button', onclick: settingsSheet }, 'Add an AI service address in Settings'), ' to ask questions about your baby’s logs.'),
  ];
}

// ---------- settings ----------
function settingsSheet() {
  const d = { ...state.baby, ...state.settings };
  formSheet('Settings', d, (_, redraw) => [
    field('Baby’s name', h('input', { type: 'text', maxLength: 40, value: d.name, oninput: (e) => { d.name = e.target.value; } })),
    field('Birth date', h('input', { type: 'date', value: d.birthDate, max: L.toDateInput(Date.now()), oninput: (e) => { d.birthDate = e.target.value; } })),
    field('Units', seg([['metric', 'ml · kg · cm'], ['imperial', 'oz · lb · in']], d.units, (v) => { d.units = v; redraw(); })),
    field('Currency symbol', h('input', { type: 'text', maxLength: 3, value: d.currency, oninput: (e) => { d.currency = e.target.value; } })),
    field('AI service address', h('input', { type: 'url', inputMode: 'url', maxLength: 300, value: d.aiUrl, placeholder: DEFAULT_AI_URL || 'https://your-ai-server.example.com', oninput: (e) => { d.aiUrl = e.target.value; } }),
      'Where the TinyLog AI server is running. Leave empty to use built-in tips only.'),
    h('div', { class: 'row2' },
      h('button', { class: 'btn', type: 'button', onclick: backupSheet }, 'Back up / restore'),
      h('button', { class: 'btn danger', type: 'button', onclick: () => { if (confirm('Delete ALL data on this phone? This cannot be undone.')) { state = blank(); ui.ai = { busy: false, answer: '', error: '', question: '' }; closeSheet(); save(); } } }, 'Delete all data')),
    h('p', { class: 'fine' }, 'TinyLog stores everything on this phone only. It offers general information and is not a substitute for medical advice.'),
  ], () => {
    const url = d.aiUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) return 'The AI address must start with http:// or https://';
    state.baby = { name: d.name.trim(), birthDate: d.birthDate };
    state.settings = { units: d.units, currency: d.currency.trim() || '$', aiUrl: url };
  });
}

function restoreBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { return toast('That does not look like a TinyLog backup.'); }
  if (!data || typeof data !== 'object' || !Array.isArray(data.events)) return toast('That does not look like a TinyLog backup.');
  if (!confirm('Replace everything on this phone with this backup?')) return;
  state = normalise(data); closeSheet(); save(); toast('Backup restored');
}
async function exportBackup() {
  const text = JSON.stringify(state), name = `tinylog-backup-${L.toDateInput(Date.now())}.json`;
  const cap = window.Capacitor, plugins = cap && cap.isNativePlatform && cap.isNativePlatform() ? cap.Plugins : null;
  try {
    if (plugins && plugins.Filesystem && plugins.Share) {
      // On the phone: write the file, then open Android's share sheet (Drive, email, Files...).
      const { uri } = await plugins.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
      await plugins.Share.share({ title: 'TinyLog backup', files: [uri] });
    } else {
      const link = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
      document.body.append(link); link.click(); link.remove();
      toast('Backup file saved');
    }
  } catch (err) {
    if (!/cancel/i.test(String(err && err.message))) toast('Could not share the file. Use Copy as text instead.');
  }
}
function backupSheet() {
  const box = h('textarea', { rows: 5, class: 'mono', value: JSON.stringify(state), 'aria-label': 'Backup data as text' });
  const picker = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async (e) => { const f = e.target.files[0]; if (f) restoreBackup(await f.text()); } });
  openSheet('Back up / restore',
    h('p', null, 'TinyLog keeps everything on this phone only. Save a backup file somewhere else (Drive, email) so a lost phone does not mean a lost log.'),
    h('div', { class: 'row2' },
      h('button', { class: 'btn primary', type: 'button', onclick: exportBackup }, 'Save backup file'),
      h('button', { class: 'btn', type: 'button', onclick: () => picker.click() }, 'Restore from file')),
    picker,
    h('p', { class: 'divider' }, 'or copy and paste it as text'),
    box,
    h('div', { class: 'row2' },
      h('button', { class: 'btn', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(box.value); toast('Backup copied'); } catch { box.select(); toast('Select all and copy the text manually.'); } } }, 'Copy as text'),
      h('button', { class: 'btn', type: 'button', onclick: () => restoreBackup(box.value) }, 'Restore pasted text')));
}

// ---------- shell ----------
const TABS = [['home', 'home', 'Today', viewHome], ['trends', 'trends', 'Trends', viewTrends], ['play', 'play', 'Play', viewPlay], ['firsts', 'star', 'Firsts', viewFirsts], ['more', 'more', 'More', viewMore]];
function render() {
  const [, , , view] = TABS.find((t) => t[0] === ui.tab);
  const b = state.baby;
  $('top').replaceChildren(
    h('div', { class: 'who' }, h('span', { class: 'avatar', 'aria-hidden': 'true' }, (b.name.trim()[0] || 'T').toUpperCase()),
      h('div', null, h('h1', null, b.name || 'TinyLog'), h('small', null, b.birthDate ? L.ageLabel(b.birthDate) : 'Baby tracker'))),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Settings', onclick: settingsSheet }, icon('settings', 22)));
  const scroller = $('view'), keep = scroller.dataset.tab === ui.tab ? scroller.scrollTop : 0;
  scroller.replaceChildren(...clean([view()]));
  scroller.dataset.tab = ui.tab;
  scroller.scrollTop = keep;
  tickNursing();
  const live = !!state.nursing || !!L.currentSleep(state.events); // a timer is running: mark the Today tab
  $('tabs').replaceChildren(...TABS.map(([id, ic, label]) => h('button', {
    type: 'button', 'aria-current': id === ui.tab ? 'page' : null, class: id === 'home' && live ? 'live' : '',
    'aria-label': id === 'home' && live ? 'Today, timer running' : null,
    onclick: () => { ui.tab = id; $('toast').hidden = true; render(); },
  }, h('span', { class: 'pill' }, icon(ic, 24)), label)));
}
render();
// Keep "x minutes" figures fresh, but never rebuild the screen under someone who is typing.
const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement || {}).tagName);
setInterval(() => { if (ui.tab === 'home' && !sheetOpen && !document.hidden && !typing()) render(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !sheetOpen && !typing()) render(); });
