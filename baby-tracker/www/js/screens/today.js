// Today: quick-log buttons, the breastfeeding timer card, time since the last
// feed / sleep / diaper, the day's totals and timeline, and the first-run welcome.
import * as L from '../logic.js';
import { h, $, fmtTime, fmtDay, toast, render, field, stat } from '../ui.js';
import { state, save, units, view, viewDay, showDay } from '../store.js';
import { icon } from '../icons.js';
import { feedSheet, sleepSheet, editEvent } from './events.js';

function quickLog(ev, label) {
  if (Date.now() < view.tapGuard) return; // a stray second tap where another button just was
  const full = { id: L.uid(), start: Date.now(), note: '', ...ev };
  state.events.push(full);
  view.day = null;
  save();
  toast(`${label} logged at ${fmtTime(full.start)}`, 'Edit', () => editEvent(full));
}

export function viewToday() {
  const now = Date.now(), ev = state.events;
  if (!state.baby.name && !state.baby.birthDate && !ev.length) return viewWelcome();
  const sleeping = L.currentSleep(ev);
  const lastFeed = L.lastEvent(ev, (e) => e.type === 'feed');
  const lastDiaper = L.lastEvent(ev, (e) => e.type === 'diaper');
  const lastSleep = L.lastEvent(ev, (e) => e.type === 'sleep' && e.end != null);
  const since = (e) => (e ? L.fmtDuration(now - e.start) : '—');

  const from = viewDay(), to = L.addDays(from, 1), isToday = view.day == null;
  const s = L.summarize(ev, from, to, now);
  // include a sleep that began the evening before, so the day's sleep total is explained
  const carried = (e) => e.type === 'sleep' && e.start < from && (e.end ?? now) > from;
  const dayEvents = ev.filter((e) => (e.start >= from && e.start < to) || carried(e)).sort((a, b) => b.start - a.start);
  const milk = [s.bottleMl ? `${L.fmtVolume(s.bottleMl, units())} by bottle` : '', s.breastMin ? `${s.breastMin} min breastfeeding` : '', s.solids ? `${s.solids} solid meal${s.solids === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');

  // part of the day an entry belongs to, for the grouped timeline (list is newest first)
  const part = (e) => { if (carried(e)) return 'Night'; const hr = new Date(e.start).getHours(); return hr < 5 ? 'Night' : hr < 12 ? 'Morning' : hr < 17 ? 'Afternoon' : 'Evening'; };
  const timeline = [];
  dayEvents.forEach((e, i) => {
    const p = part(e), prev = i > 0 && part(dayEvents[i - 1]), next = i < dayEvents.length - 1 && part(dayEvents[i + 1]);
    if (p !== prev) timeline.push(h('li', { class: 'part' }, p));
    const d = L.describeEvent(e, units());
    timeline.push(h('li', { class: 'ev' + (p !== prev ? ' first' : '') + (p !== next ? ' last' : '') }, h('button', { type: 'button', onclick: () => editEvent(e) },
      eventIcon(e), h('span', { class: 'grow' }, h('b', null, d.title), (d.detail || e.note) && h('small', null, [d.detail, e.note].filter(Boolean).join(' · '))),
      h('time', null, carried(e) ? `from ${fmtTime(e.start)} the day before` : fmtTime(e.start)))));
  });

  return [
    nursingCard(),
    h('section', { class: 'card glance', 'aria-label': 'Time since last' },
      h('div', null, h('span', { class: 'dot t-feed' }, icon('bottle', 16)), h('b', null, fig(since(lastFeed))), h('span', null, 'since feed')),
      h('div', { class: sleeping ? 'on' : '' }, h('span', { class: 'dot t-sleep' }, icon(sleeping ? 'moon' : 'sun', 16)),
        h('b', null, fig(sleeping ? L.fmtDuration(now - sleeping.start) : lastSleep ? L.fmtDuration(now - lastSleep.end) : '—')), h('span', null, sleeping ? 'asleep' : 'awake')),
      h('div', null, h('span', { class: 'dot t-pee' }, icon('drop', 16)), h('b', null, fig(since(lastDiaper))), h('span', null, 'since diaper'))),
    h('section', { class: 'quick-main' },
      h('button', { type: 'button', class: 'q t-feed', onclick: () => feedSheet() }, h('span', { class: 'ic' }, icon('bottle', 24)), h('span', null, h('b', null, 'Feed'), h('small', null, 'Breast, bottle or solids'))),
      sleeping
        ? h('button', { type: 'button', class: 'q t-sleep on', onclick: () => { sleeping.end = Date.now(); save(); toast(`Woke up after ${L.fmtDuration(sleeping.end - sleeping.start)}`, 'Edit', () => editEvent(sleeping)); } },
          h('span', { class: 'ic' }, icon('sun', 24)), h('span', null, h('b', null, 'Wake up'), h('small', null, `Asleep ${L.fmtDuration(now - sleeping.start)}`)))
        : h('button', { type: 'button', class: 'q t-sleep', onclick: () => sleepSheet() }, h('span', { class: 'ic' }, icon('moon', 24)), h('span', null, h('b', null, 'Sleep'), h('small', null, 'Start a nap or log one')))),
    h('section', { class: 'quick-sub' },
      h('button', { type: 'button', class: 'qs', onclick: () => quickLog({ type: 'diaper', kind: 'pee' }, 'Pee') }, h('span', { class: 'ic t-pee' }, icon('drop', 20)), 'Pee'),
      h('button', { type: 'button', class: 'qs', onclick: () => quickLog({ type: 'diaper', kind: 'poop' }, 'Poop') }, h('span', { class: 'ic t-poop' }, icon('diaper', 20)), 'Poop'),
      h('button', { type: 'button', class: 'qs', onclick: () => quickLog({ type: 'spitup', amount: 'small' }, 'Spit-up') }, h('span', { class: 'ic t-spit' }, icon('spit', 20)), 'Spit-up'),
      h('button', { type: 'button', class: 'qs', onclick: () => feedSheet(null, 'solid') }, h('span', { class: 'ic t-solid' }, icon('bowl', 20)), 'Solids')),
    h('section', { class: 'card' },
      h('div', { class: 'daynav' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous day', onclick: () => { view.day = L.addDays(viewDay(), -1); render(); } }, icon('back', 18)),
        isToday ? h('h2', null, 'Today')
          : h('button', { class: 'dayback', type: 'button', onclick: () => { view.day = null; render(); } }, h('b', null, fmtDay(from)), h('small', null, 'Back to today')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next day', disabled: isToday, onclick: () => { showDay(L.addDays(viewDay(), 1)); render(); } }, icon('next', 18))),
      h('div', { class: 'stats' },
        stat('Milk feeds', s.milkFeeds),
        stat('Sleep', `${+(s.sleepMs / L.HOUR).toFixed(1)}h`),
        stat('Wet', s.wet),
        stat('Dirty', s.dirty),
        stat('Spit-ups', s.spitups)),
      milk && h('p', { class: 'fine center' }, milk),
      dayEvents.length
        ? h('ul', { class: 'list tl' }, timeline)
        : h('p', { class: 'empty' }, isToday ? 'Nothing logged yet today. Tap a button above to start.' : 'Nothing was logged on this day.')),
  ];
}
/** "4h 3m" as big figures with small unit letters. */
const fig = (text) => String(text).split(/(\d+)/).filter(Boolean).map((t) => (/^\d+$/.test(t) || t === '—' ? t : /^\s+$/.test(t) ? ' ' : h('small', null, t.trim())));
function eventIcon(e) {
  const [name, tint] = e.type === 'sleep' ? ['moon', 'sleep'] : e.type === 'spitup' ? ['spit', 'spit']
    : e.type === 'diaper' ? (e.kind === 'pee' ? ['drop', 'pee'] : ['diaper', 'poop'])
      : e.method === 'solid' ? ['bowl', 'solid'] : e.method === 'breast' ? ['heart', 'feed'] : ['bottle', 'feed'];
  return h('i', { class: `ico t-${tint}` }, icon(name, 20));
}

function viewWelcome() {
  const d = view.welcome;
  return h('section', { class: 'card welcome' },
    h('img', { class: 'hero', src: 'icon.svg', alt: '', width: 84, height: 84 }),
    h('h2', null, 'Welcome to TinyLog'),
    h('p', null, 'Track feeds, sleep, diapers, growth and all the firsts. Everything stays on this phone.'),
    h('form', { onsubmit: (e) => { e.preventDefault(); if (!d.name.trim()) return toast('Please type a name.'); state.baby = { name: d.name.trim(), birthDate: d.birthDate }; save(); } },
      field('Baby’s name', h('input', { type: 'text', maxLength: 40, required: true, value: d.name, oninput: (e) => { d.name = e.target.value; } })),
      field('Birth date', h('input', { type: 'date', required: true, value: d.birthDate, max: L.toDateInput(Date.now()), oninput: (e) => { d.birthDate = e.target.value; } })),
      h('button', { class: 'btn primary block', type: 'submit' }, 'Get started')));
}

// ---------- breastfeeding timer card ----------
function nursingCard() {
  const n = state.nursing;
  if (!n) return null;
  const running = n.sideStart != null;
  const sideBtn = (side, label) => h('button', {
    type: 'button', class: 'side' + (running && n.side === side ? ' on' : ''), 'data-side': side,
    'aria-pressed': String(running && n.side === side),
    onclick: () => { state.nursing = L.nursingTap(state.nursing, side); save(); },
  }, h('b', null, label), h('span', { class: 'side-time' }, ''), h('small', null, running && n.side === side ? 'Tap to pause' : running ? 'Tap to switch' : 'Tap to resume'));
  return h('section', { class: 'card nurse' + (running ? ' running' : ''), 'aria-label': 'Breastfeeding timer' },
    h('div', { class: 'nurse-head' }, h('span', null, running ? 'Feeding now' : 'Paused'),
      h('button', { class: 'btn danger', type: 'button', onclick: () => { if (confirm('Discard this feed without logging it?')) { state.nursing = null; save(); } } }, 'Discard')),
    h('b', { id: 'nurse-clock', role: 'timer' }, ''),
    h('div', { class: 'row2' }, sideBtn('left', 'Left'), sideBtn('right', 'Right')),
    h('button', { class: 'btn primary block', type: 'button', onclick: () => {
      const ev = L.nursingToFeed(state.nursing);
      // a timer left running for hours is almost always a forgotten one
      if (ev.minutes > 90 && !confirm(`Log a feed of ${L.fmtDuration(ev.minutes * 60000)}? If the timer was left running, tap Cancel and use Discard, then enter the feed by hand.`)) return;
      view.tapGuard = Date.now() + 700; // Spit-up moves under the finger when this card disappears
      state.nursing = null; state.events.push(ev); showDay(ev.start); save();
      toast(`Breastfeed logged: ${L.describeEvent(ev, units()).detail}`, 'Edit', () => editEvent(ev));
    } }, '■ Stop and log'));
}
export function tickNursing() {
  const clock = $('nurse-clock');
  if (!clock || !state.nursing) return;
  const t = L.nursingElapsed(state.nursing);
  clock.textContent = L.fmtClock(t.totalMs);
  for (const el of document.querySelectorAll('.nurse .side')) el.querySelector('.side-time').textContent = L.fmtClock(el.dataset.side === 'left' ? t.leftMs : t.rightMs);
}
setInterval(tickNursing, 1000);
