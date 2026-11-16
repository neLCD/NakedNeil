// Gear (inside Ideas): the wishlist of things to buy, plus gear ideas by age.
import * as L from '../logic.js';
import { h, num, toast, field, seg, stat } from '../ui.js';
import { state, save } from '../store.js';
import { formSheet, removeWithUndo } from '../forms.js';
import { GEAR_CATEGORIES, GEAR_IDEAS } from '../content.js';

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

export function viewGear() {
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
  const ideas = GEAR_IDEAS.filter((g) => !have.has(g.name.toLowerCase()) && (g.toMonths == null || months <= g.toMonths));
  const now = ideas.filter((g) => g.fromMonths <= months + 1.5), later = ideas.filter((g) => g.fromMonths > months + 1.5);
  const ideaList = (list) => h('ul', { class: 'ideas' }, list.map((g) => h('li', null,
    h('span', { class: 'grow' }, h('b', null, g.name), h('small', null, `${g.category}${g.fromMonths ? ` · from about ${g.fromMonths} months` : ''}`), g.note && h('small', null, g.note)),
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
