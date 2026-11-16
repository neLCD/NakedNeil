// Shared UI building blocks: the `h` DOM helper, formatters, toast, bottom sheet and
// small controls. Knows nothing about the app's data, so every other module can import it.
import { icon } from './icons.js';

// ---------- DOM ----------
export const clean = (kids) => kids.flat(Infinity).filter((k) => k != null && k !== false && k !== '');
export function h(tag, attrs, ...kids) {
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
export const $ = (id) => document.getElementById(id);

// ---------- formatting and parsing ----------
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
/** "Sat, Nov 14", with the year added when it is not this year. */
export const fmtDay = (ts) => new Date(ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', ...(new Date(ts).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
export const fmtDate = (ts, long) => new Date(ts).toLocaleDateString([], long ? { year: 'numeric', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' });
/** A number typed into a form, or null when it is empty, negative or not a number. */
export const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : null; };

// ---------- redraw ----------
// The shell (app.js) registers its render function here, so screens can ask for a
// redraw without importing the shell (which imports them).
let draw = () => {};
export const setRender = (fn) => { draw = fn; };
export const render = () => draw();

// ---------- toast ----------
let toastTimer;
export function toast(text, actionLabel, action) {
  const box = $('toast');
  box.replaceChildren(...clean([h('span', null, text), actionLabel && h('button', { type: 'button', onclick: () => { box.hidden = true; action(); } }, actionLabel)]));
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 4500);
}
export const hideToast = () => { $('toast').hidden = true; };

// ---------- bottom sheet ----------
let sheetOpen = false, closing = false;
export const sheetIsOpen = () => sheetOpen;
export function openSheet(title, ...content) {
  const root = $('sheet-root');
  if (sheetOpen) { // a redraw of the open sheet: swap the contents in place, no animation, keep scroll
    const panel = root.querySelector('.sheet'), bodyEl = panel.querySelector('.sheet-body'), top = bodyEl.scrollTop;
    panel.querySelector('h2').textContent = title;
    panel.setAttribute('aria-label', title);
    bodyEl.replaceChildren(...clean(content));
    bodyEl.scrollTop = top;
    return bodyEl;
  }
  hideToast();
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
function removeSheet() { sheetOpen = false; closing = false; $('sheet-root').hidden = true; $('sheet-root').replaceChildren(); }
/** Close the sheet. Safe to call twice (a double tap must not go "back" twice and leave the app). */
export function closeSheet() {
  if (!sheetOpen || closing) return;
  if (history.state && history.state.sheet) { closing = true; history.back(); } else removeSheet();
}
window.addEventListener('popstate', removeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetOpen) closeSheet(); });

// ---------- small controls ----------
export const field = (label, input, hint) => h('label', { class: 'field' }, h('span', null, label), input, hint && h('small', null, hint));
/** A row of buttons where one is selected. `options` is a list of [value, label]. */
export function seg(options, value, onChange) {
  return h('div', { class: 'seg', role: 'group' }, options.map(([v, label]) =>
    h('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => onChange(v) }, label)));
}
/** One big figure with a label, used in the rows of totals. */
export const stat = (label, value, sub) => h('div', { class: 'stat' }, h('b', null, String(value)), h('span', null, label), sub && h('small', null, sub));
