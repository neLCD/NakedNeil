// TinyLog: UI. All data lives on the device (localStorage); nothing leaves it
// unless the parent asks the AI a question.
import * as L from './logic.js';
import { FOOD_IDEAS, FOODS_TO_AVOID, GEAR_CATEGORIES, GEAR_IDEAS } from './content.js';
import { lineChart } from './chart.js';
import { DEFAULT_AI_URL } from './config.js';

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
  };
}
function load() { try { return normalise(JSON.parse(localStorage.getItem(KEY))); } catch { return blank(); } }
let state = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { toast('Could not save. Storage may be full.'); }
  render();
}
const units = () => state.settings.units;
const ui = { tab: 'home', day: L.dayStart(Date.now()), firsts: 'words', ai: { busy: false, answer: '', error: '', question: '' } };

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
function openSheet(title, ...body) {
  const root = $('sheet-root');
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('h2', null, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: closeSheet }, '✕')),
    h('div', { class: 'sheet-body' }, body));
  root.replaceChildren(h('div', { class: 'scrim', onclick: closeSheet }), panel);
  root.hidden = false;
  if (!sheetOpen) { sheetOpen = true; history.pushState({ sheet: true }, ''); } // Android back closes the sheet
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
}
function deleteEvent(id) { state.events = state.events.filter((e) => e.id !== id); closeSheet(); save(); }
/** Draft-driven sheet: `build(draft, rerender)` returns the form fields; `commit(draft)` returns an error string or nothing. */
function formSheet(title, draft, build, commit, onDelete) {
  const draw = () => {
    openSheet(title, h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        const err = commit(draft);
        if (err) return toast(err);
        closeSheet(); save();
      },
    }, build(draft, draw), actions(onDelete)));
  };
  draw();
}

// ---------- event sheets ----------
function feedSheet(existing, preset) {
  const draft = existing ? { ...existing } : { id: L.uid(), type: 'feed', method: preset || 'bottle', side: 'left', content: 'Formula', start: Date.now() };
  if (draft.amountMl) draft.amount = L.volumeFromMl(draft.amountMl, units());
  formSheet(existing ? 'Edit feed' : 'Log a feed', draft, (d, redraw) => [
    seg([['breast', '🤱 Breast'], ['bottle', '🍼 Bottle'], ['solid', '🥣 Solid']], d.method, (v) => { d.method = v; redraw(); }),
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
    if (!d.start) return 'Please set a time.';
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
  }, existing && (() => deleteEvent(existing.id)));
}

function sleepSheet(existing) {
  if (!existing) {
    const draft = { id: L.uid(), type: 'sleep', start: Date.now() - L.HOUR, end: Date.now() };
    openSheet('Sleep',
      h('button', { class: 'btn primary block', type: 'button', onclick: () => { state.events.push({ id: L.uid(), type: 'sleep', start: Date.now(), end: null }); closeSheet(); save(); toast('Sleep started. Sweet dreams!'); } }, '😴 Start sleep now'),
      h('p', { class: 'divider' }, 'or log a sleep that already happened'),
      h('form', {
        onsubmit: (e) => {
          e.preventDefault();
          if (!draft.start || !draft.end || draft.end <= draft.start) return toast('Wake-up time must be after the start.');
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
    if (!d.start) return 'Please set a start time.';
    if (d.end && d.end <= d.start) return 'Wake-up time must be after the start.';
    upsertEvent({ id: d.id, type: 'sleep', start: d.start, end: d.end || null, note: (d.note || '').trim() });
  }, () => deleteEvent(existing.id));
}

const POOP_COLORS = ['', 'Yellow', 'Brown', 'Green', 'Black', 'Red', 'White or pale'];
function diaperSheet(existing) {
  formSheet('Edit diaper', { ...existing }, (d, redraw) => [
    seg([['pee', '💧 Pee'], ['poop', '💩 Poop'], ['both', 'Both']], d.kind, (v) => { d.kind = v; redraw(); }),
    d.kind !== 'pee' && field('Poop colour', h('select', { onchange: (e) => { d.color = e.target.value; redraw(); } },
      POOP_COLORS.map((c) => h('option', { value: c, selected: c === (d.color || '') }, c || 'Not recorded'))),
    ['Black', 'Red', 'White or pale'].includes(d.color) && 'After the first few days of life, black, red or white/pale poop is worth a call to your doctor.'),
    field('When', timeInput(d)),
    field('Note', noteInput(d)),
  ], (d) => {
    if (!d.start) return 'Please set a time.';
    upsertEvent({ id: d.id, type: 'diaper', kind: d.kind, color: d.kind === 'pee' ? '' : d.color || '', start: d.start, note: (d.note || '').trim() });
  }, () => deleteEvent(existing.id));
}
function spitupSheet(existing) {
  formSheet('Edit spit-up', { ...existing }, (d, redraw) => [
    field('How much', seg([['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']], d.amount, (v) => { d.amount = v; redraw(); })),
    field('When', timeInput(d)),
    field('Note', noteInput(d)),
  ], (d) => {
    if (!d.start) return 'Please set a time.';
    upsertEvent({ id: d.id, type: 'spitup', amount: d.amount, start: d.start, note: (d.note || '').trim() });
  }, () => deleteEvent(existing.id));
}
// ---------- breastfeeding timer ----------
function startNursing(side) {
  const now = Date.now();
  state.nursing = { start: now, side, sideStart: now, leftMs: 0, rightMs: 0 };
  ui.tab = 'home'; ui.day = L.dayStart(now);
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
    h('div', { class: 'nurse-head' }, h('span', null, running ? '🤱 Feeding now' : '🤱 Paused'), h('b', { id: 'nurse-clock', role: 'timer' }, '')),
    h('div', { class: 'row2' }, sideBtn('left', 'Left'), sideBtn('right', 'Right')),
    h('div', { class: 'actions' },
      h('button', { class: 'btn danger', type: 'button', onclick: () => { if (confirm('Discard this feed without logging it?')) { state.nursing = null; save(); } } }, 'Discard'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => {
        const ev = L.nursingToFeed(state.nursing);
        state.nursing = null; state.events.push(ev); ui.day = L.dayStart(ev.start); save();
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

const editEvent = (e) => ({ feed: feedSheet, sleep: sleepSheet, diaper: diaperSheet, spitup: spitupSheet }[e.type](e));

function quickLog(ev, label) {
  const full = { id: L.uid(), start: Date.now(), note: '', ...ev };
  state.events.push(full);
  ui.day = L.dayStart(Date.now());
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
  const since = (e, t = e && e.start) => (e ? `${L.fmtDuration(now - t)} ago` : 'Not yet');

  const from = ui.day, to = from + L.DAY, isToday = from === L.dayStart(now);
  const s = L.summarize(ev, from, to, now);
  const dayEvents = ev.filter((e) => e.start >= from && e.start < to).sort((a, b) => b.start - a.start);
  const milk = [s.bottleMl ? L.fmtVolume(s.bottleMl, units()) : '', s.breastMin ? `${s.breastMin} min` : ''].filter(Boolean).join(' + ');

  return [
    nursingCard(),
    h('section', { class: 'since' },
      h('div', { class: 'chip' }, h('span', null, '🍼 Last feed'), h('b', null, since(lastFeed))),
      h('div', { class: 'chip' + (sleeping ? ' on' : '') }, h('span', null, sleeping ? '😴 Asleep for' : '☀️ Awake for'),
        h('b', null, sleeping ? L.fmtDuration(now - sleeping.start) : lastSleep ? L.fmtDuration(now - lastSleep.end) : 'Not yet')),
      h('div', { class: 'chip' }, h('span', null, '🧷 Last diaper'), h('b', null, since(lastDiaper)))),
    h('section', { class: 'quick' },
      h('button', { type: 'button', class: 'q feed', onclick: () => feedSheet() }, h('i', null, '🍼'), 'Feed'),
      sleeping
        ? h('button', { type: 'button', class: 'q sleep on', onclick: () => { sleeping.end = Date.now(); save(); toast(`Woke up after ${L.fmtDuration(sleeping.end - sleeping.start)}`, 'Edit', () => editEvent(sleeping)); } }, h('i', null, '☀️'), 'Wake up')
        : h('button', { type: 'button', class: 'q sleep', onclick: () => sleepSheet() }, h('i', null, '😴'), 'Sleep'),
      h('button', { type: 'button', class: 'q pee', onclick: () => quickLog({ type: 'diaper', kind: 'pee' }, 'Pee') }, h('i', null, '💧'), 'Pee'),
      h('button', { type: 'button', class: 'q poop', onclick: () => quickLog({ type: 'diaper', kind: 'poop' }, 'Poop') }, h('i', null, '💩'), 'Poop'),
      h('button', { type: 'button', class: 'q spit', onclick: () => quickLog({ type: 'spitup', amount: 'small' }, 'Spit-up') }, h('i', null, '🤮'), 'Spit-up'),
      h('button', { type: 'button', class: 'q solid', onclick: () => feedSheet(null, 'solid') }, h('i', null, '🥣'), 'Solids')),
    h('section', { class: 'card' },
      h('div', { class: 'daynav' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous day', onclick: () => { ui.day -= L.DAY; ui.day = L.dayStart(ui.day + L.HOUR * 2); render(); } }, '‹'),
        h('h2', null, isToday ? 'Today' : fmtDay(from)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next day', disabled: isToday, onclick: () => { ui.day = L.dayStart(ui.day + L.DAY + L.HOUR * 2); render(); } }, '›')),
      h('div', { class: 'stats' },
        stat('Feeds', s.feeds, milk),
        stat('Sleep', L.fmtDuration(s.sleepMs)),
        stat('Wet', s.wet),
        stat('Dirty', s.dirty),
        stat('Spit-ups', s.spitups)),
      dayEvents.length
        ? h('ul', { class: 'list' }, dayEvents.map((e) => {
          const d = L.describeEvent(e, units());
          return h('li', null, h('button', { type: 'button', onclick: () => editEvent(e) },
            h('i', null, d.icon), h('span', { class: 'grow' }, h('b', null, d.title), (d.detail || e.note) && h('small', null, [d.detail, e.note].filter(Boolean).join(' · '))),
            h('time', null, fmtTime(e.start))));
        }))
        : h('p', { class: 'empty' }, isToday ? 'Nothing logged yet today. Tap a button above to start.' : 'Nothing was logged on this day.')),
  ];
}
const stat = (label, value, sub) => h('div', { class: 'stat' }, h('b', null, String(value)), h('span', null, label), sub && h('small', null, sub));

function viewWelcome() {
  const d = { name: '', birthDate: '' };
  return h('section', { class: 'card welcome' },
    h('div', { class: 'hero' }, '👶'),
    h('h2', null, 'Welcome to TinyLog'),
    h('p', null, 'Track feeds, sleep, diapers, growth and all the firsts. Everything stays on this phone.'),
    h('form', { onsubmit: (e) => { e.preventDefault(); state.baby = { name: d.name.trim(), birthDate: d.birthDate }; save(); } },
      field('Baby’s name', h('input', { type: 'text', maxLength: 40, required: true, oninput: (e) => { d.name = e.target.value; } })),
      field('Birth date', h('input', { type: 'date', required: true, max: L.toDateInput(Date.now()), oninput: (e) => { d.birthDate = e.target.value; } })),
      h('button', { class: 'btn primary block', type: 'submit' }, 'Get started')));
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
    const i = state.growth.findIndex((g) => g.id === entry.id);
    if (i >= 0) state.growth[i] = entry; else state.growth.push(entry);
  }, existing && (() => { state.growth = state.growth.filter((g) => g.id !== existing.id); closeSheet(); save(); }));
}

function viewGrowth() {
  const u = units();
  const rows = [...state.growth].sort((a, b) => a.date.localeCompare(b.date));
  const weights = rows.filter((g) => g.weightKg), heights = rows.filter((g) => g.heightCm);
  const delta = (list, key, fmt) => {
    if (list.length < 2) return '';
    const diff = list[list.length - 1][key] - list[list.length - 2][key];
    return `${diff >= 0 ? '+' : '−'}${fmt(Math.abs(diff))} since last`;
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
        stat('Weight', weights.length ? L.fmtWeight(weights[weights.length - 1].weightKg, u) : '—', delta(weights, 'weightKg', (v) => (u === 'imperial' ? `${Math.round((v / L.KG_PER_LB) * 16)} oz` : `${Math.round(v * 1000)} g`))),
        stat('Height', heights.length ? L.fmtHeight(heights[heights.length - 1].heightCm, u) : '—', delta(heights, 'heightCm', (v) => L.fmtHeight(v, u)))),
      h('button', { class: 'btn primary block', type: 'button', onclick: () => growthSheet() }, '+ Add measurement')),
    chart(weights, 'Weight over time', (g) => L.weightValue(g.weightKg, u), L.weightUnit(u), (g) => L.fmtWeight(g.weightKg, u)),
    chart(heights, 'Height over time', (g) => L.heightValue(g.heightCm, u), L.heightUnit(u), (g) => L.fmtHeight(g.heightCm, u)),
    rows.length > 0 && h('section', { class: 'card' }, h('h2', null, 'All measurements'),
      h('ul', { class: 'list' }, [...rows].reverse().map((g) => h('li', null, h('button', { type: 'button', onclick: () => growthSheet(g) },
        h('i', null, '📏'),
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
  }, existing && (() => { state.words = state.words.filter((w) => w.id !== existing.id); closeSheet(); save(); }));
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
  }, existing && (() => { state.foods = state.foods.filter((f) => f.id !== existing.id); closeSheet(); save(); }));
}

function viewFirsts() {
  const byDate = (a, b) => b.date.localeCompare(a.date);
  const age = (date) => (state.baby.birthDate ? L.ageLabel(state.baby.birthDate, L.parseDate(date)) : '');
  const tabs = seg([['words', '💬 Words'], ['foods', '🥄 Foods'], ['ideas', '💡 Food ideas']], ui.firsts, (v) => { ui.firsts = v; render(); });
  if (ui.firsts === 'words') {
    return [tabs, h('section', { class: 'card' },
      h('button', { class: 'btn primary block', type: 'button', onclick: () => wordSheet() }, '+ Add a word'),
      state.words.length ? h('ul', { class: 'list' }, [...state.words].sort(byDate).map((w) => h('li', null, h('button', { type: 'button', onclick: () => wordSheet(w) },
        h('i', null, '💬'), h('span', { class: 'grow' }, h('b', null, `“${w.word}”`), h('small', null, [age(w.date), w.note].filter(Boolean).join(' · '))),
        h('time', null, fmtDate(L.parseDate(w.date), true))))))
        : h('p', { class: 'empty' }, 'No words yet. The first one is worth writing down!'))];
  }
  if (ui.firsts === 'foods') {
    const emoji = { loved: '😍', ok: '🙂', disliked: '😖' };
    return [tabs, h('section', { class: 'card' },
      h('button', { class: 'btn primary block', type: 'button', onclick: () => foodSheet() }, '+ Add a first food'),
      state.foods.length ? h('ul', { class: 'list' }, [...state.foods].sort(byDate).map((f) => h('li', null, h('button', { type: 'button', onclick: () => foodSheet(f) },
        h('i', null, emoji[f.reaction] || '🥄'),
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
  }, existing && (() => { state.gear = state.gear.filter((g) => g.id !== existing.id); closeSheet(); save(); }));
}

function viewGear() {
  const cur = state.settings.currency;
  const money = (v) => `${cur}${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const rank = { high: 0, medium: 1, low: 2 };
  const toBuy = state.gear.filter((g) => !g.bought).sort((a, b) => rank[a.priority] - rank[b.priority] || a.name.localeCompare(b.name));
  const bought = state.gear.filter((g) => g.bought).sort((a, b) => a.name.localeCompare(b.name));
  const total = toBuy.reduce((s, g) => s + (g.price || 0), 0);
  const row = (g) => h('li', { class: g.bought ? 'bought' : '' },
    h('input', { type: 'checkbox', checked: g.bought, 'aria-label': `Bought ${g.name}`, onchange: (e) => { g.bought = e.target.checked; save(); } }),
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
const AI_PROMPTS = ['What foods should we try next?', 'How is sleep looking this week?', 'Is the feeding pattern typical for this age?', 'What gear will we need soon?'];
const aiUrl = () => (state.settings.aiUrl || DEFAULT_AI_URL || '').trim().replace(/\/+$/, '');

async function askAi(question) {
  const q = question.trim();
  if (!q || ui.ai.busy) return;
  ui.ai = { busy: true, answer: '', error: '', question: q };
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

function viewTips() {
  const tips = L.buildTips(state);
  const input = h('textarea', { rows: 2, maxLength: 500, placeholder: 'Ask anything about feeding, sleep, foods, gear…', value: ui.ai.busy ? ui.ai.question : '' });
  return [
    h('section', { class: 'card ai' }, h('h2', null, '✨ Ask the AI'),
      aiUrl()
        ? [
          h('div', { class: 'chips' }, AI_PROMPTS.map((p) => h('button', { type: 'button', disabled: ui.ai.busy, onclick: () => askAi(p) }, p))),
          h('form', { onsubmit: (e) => { e.preventDefault(); askAi(input.value); } }, input,
            h('button', { class: 'btn primary block', type: 'submit', disabled: ui.ai.busy }, ui.ai.busy ? 'Thinking…' : 'Ask')),
          ui.ai.error && h('p', { class: 'warnbox', role: 'alert' }, ui.ai.error),
          ui.ai.answer && h('div', { class: 'answer', role: 'status' }, h('small', null, ui.ai.question), h('p', null, ui.ai.answer)),
          h('p', { class: 'fine' }, 'Asking sends a summary of the last 7 days of logs, plus growth, foods, words and gear, to the AI service. Answers are general information, not medical advice.'),
        ]
        : [
          h('p', null, 'Get suggestions based on your baby’s own logs: what to feed next, how sleep compares, what gear is coming up.'),
          h('p', { class: 'fine' }, 'AI suggestions need an AI service address. Add one in Settings. The tips below work without it.'),
          h('button', { class: 'btn block', type: 'button', onclick: settingsSheet }, 'Open Settings'),
        ]),
    h('section', { class: 'card' }, h('h2', null, 'Tips for right now'),
      h('ul', { class: 'tips' }, tips.map((t) => h('li', { class: t.tone || '' }, h('i', null, t.icon), h('span', null, h('b', null, t.title), h('small', null, t.text))))),
      h('p', { class: 'fine' }, 'General information based on your logs. It is not medical advice. If you are worried about your baby, contact your doctor.')),
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

function backupSheet() {
  const box = h('textarea', { rows: 8, class: 'mono', value: JSON.stringify(state), 'aria-label': 'Backup data' });
  openSheet('Back up / restore',
    h('p', null, 'This text is your whole TinyLog. Copy it somewhere safe (email it to yourself, for example). To restore, paste a backup here and tap Restore.'),
    box,
    h('div', { class: 'row2' },
      h('button', { class: 'btn', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(box.value); toast('Backup copied'); } catch { box.select(); toast('Select all and copy the text manually.'); } } }, 'Copy backup'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => {
        let data;
        try { data = JSON.parse(box.value); } catch { return toast('That does not look like a TinyLog backup.'); }
        if (!data || typeof data !== 'object' || !Array.isArray(data.events)) return toast('That does not look like a TinyLog backup.');
        if (!confirm('Replace everything on this phone with this backup?')) return;
        state = normalise(data); closeSheet(); save(); toast('Backup restored');
      } }, 'Restore')));
}

// ---------- shell ----------
const TABS = [['home', '🏠', 'Today', viewHome], ['growth', '📈', 'Growth', viewGrowth], ['firsts', '⭐', 'Firsts', viewFirsts], ['gear', '🛒', 'Gear', viewGear], ['tips', '✨', 'Tips', viewTips]];
function render() {
  const [, , , view] = TABS.find((t) => t[0] === ui.tab);
  const b = state.baby;
  $('top').replaceChildren(
    h('div', { class: 'who' }, h('span', { class: 'avatar', 'aria-hidden': 'true' }, '👶'),
      h('div', null, h('h1', null, b.name || 'TinyLog'), h('small', null, b.birthDate ? L.ageLabel(b.birthDate) : 'Baby tracker'))),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Settings', onclick: settingsSheet }, '⚙️'));
  const scroller = $('view'), keep = scroller.dataset.tab === ui.tab ? scroller.scrollTop : 0;
  scroller.replaceChildren(...clean([view()]));
  scroller.dataset.tab = ui.tab;
  scroller.scrollTop = keep;
  tickNursing();
  $('tabs').replaceChildren(...TABS.map(([id, icon, label]) => h('button', {
    type: 'button', 'aria-current': id === ui.tab ? 'page' : null, onclick: () => { ui.tab = id; render(); },
  }, h('i', null, icon), label)));
}
render();
// keep the "x minutes ago" figures fresh without disturbing a form in progress
setInterval(() => { if (ui.tab === 'home' && !sheetOpen && !document.hidden) render(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !sheetOpen) render(); });
