// TinyLog: the shell. Owns the header, the bottom tabs and the render loop.
// Each screen lives in its own module under screens/; shared pieces are in ui.js,
// forms.js and store.js.
import * as L from './logic.js';
import { h, $, clean, setRender, hideToast, sheetIsOpen } from './ui.js';
import { state, view, go } from './store.js';
import { icon } from './icons.js';
import { viewToday, tickNursing } from './screens/today.js';
import { viewTrends } from './screens/trends.js';
import { viewFirsts } from './screens/firsts.js';
import { viewIdeas } from './screens/ideas.js';
import { settingsSheet } from './screens/settings.js';
import { viewSounds, soundsBar } from './sounds.js';

// id, icon, label, screen
const TABS = [
  ['today', 'home', 'Today', viewToday],
  ['sounds', 'sound', 'Sounds', () => viewSounds({ render })],
  ['trends', 'trends', 'Trends', viewTrends],
  ['firsts', 'star', 'Firsts', viewFirsts],
  ['ideas', 'ideas', 'Ideas', viewIdeas],
];

function render() {
  const [, , , screen] = TABS.find((t) => t[0] === view.tab);
  const b = state.baby;
  $('top').replaceChildren(
    h('div', { class: 'who' }, h('span', { class: 'avatar', 'aria-hidden': 'true' }, (b.name.trim()[0] || 'T').toUpperCase()),
      h('div', null, h('h1', null, b.name || 'TinyLog'), h('small', null, b.birthDate ? L.ageLabel(b.birthDate) : 'Baby tracker'))),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Settings', onclick: settingsSheet }, icon('settings', 22)));
  // While a sound is playing, a slim strip stays above every other screen so it can be stopped from anywhere.
  $('playing').replaceChildren(...clean([view.tab !== 'sounds' && soundsBar({ render, open: () => go('sounds') })]));
  const scroller = $('view'), keep = scroller.dataset.tab === view.tab ? scroller.scrollTop : 0;
  scroller.replaceChildren(...clean([screen()]));
  scroller.dataset.tab = view.tab;
  scroller.scrollTop = keep;
  tickNursing();
  const live = !!state.nursing || !!L.currentSleep(state.events); // a timer is running: mark the Today tab
  $('tabs').replaceChildren(...TABS.map(([id, ic, label]) => h('button', {
    type: 'button', 'aria-current': id === view.tab ? 'page' : null, class: id === 'today' && live ? 'live' : '',
    'aria-label': id === 'today' && live ? 'Today, timer running' : null,
    onclick: () => { hideToast(); go(id); },
  }, h('span', { class: 'pill' }, icon(ic, 24)), label)));
}
setRender(render);
render();

// Keep "x minutes" figures fresh, but never rebuild the screen under someone who is typing.
const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement || {}).tagName);
setInterval(() => { if (view.tab === 'today' && !sheetIsOpen() && !document.hidden && !typing()) render(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !sheetIsOpen() && !typing()) render(); });
