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
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous day', onclick: () => { view.day = L.addDays(viewDay(), -1); render(); } }, icon('back', 20)),
        isToday ? h('h2', null, 'Today')
          : h('button', { class: 'dayback', type: 'button', onclick: () => { view.day = null; render(); } }, h('b', null, fmtDay(from)), h('small', null, 'Back to today')),
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
  return h('section', { class: 'card nurse', 'aria-label': 'Breastfeeding timer' },
    h('div', { class: 'nurse-head' }, h('span', null, running ? 'Feeding now' : 'Paused'), h('b', { id: 'nurse-clock', role: 'timer' }, '')),
    h('div', { class: 'row2' }, sideBtn('left', 'Left'), sideBtn('right', 'Right')),
    h('div', { class: 'actions' },
      h('button', { class: 'btn danger', type: 'button', onclick: () => { if (confirm('Discard this feed without logging it?')) { state.nursing = null; save(); } } }, 'Discard'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => {
        const ev = L.nursingToFeed(state.nursing);
        // a timer left running for hours is almost always a forgotten one
        if (ev.minutes > 90 && !confirm(`Log a feed of ${L.fmtDuration(ev.minutes * 60000)}? If the timer was left running, tap Cancel and use Discard, then enter the feed by hand.`)) return;
        view.tapGuard = Date.now() + 700; // Spit-up moves under the finger when this card disappears
        state.nursing = null; state.events.push(ev); showDay(ev.start); save();
        toast(`Breastfeed logged: ${L.describeEvent(ev, units()).detail}`, 'Edit', () => editEvent(ev));
      } }, '■ Stop and log')));
}
export function tickNursing() {
  const clock = $('nurse-clock');
  if (!clock || !state.nursing) return;
  const t = L.nursingElapsed(state.nursing);
  clock.textContent = L.fmtClock(t.totalMs);
  for (const el of document.querySelectorAll('.nurse .side')) el.querySelector('.side-time').textContent = L.fmtClock(el.dataset.side === 'left' ? t.leftMs : t.rightMs);
}
setInterval(tickNursing, 1000);
