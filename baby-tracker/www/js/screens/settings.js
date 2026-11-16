// Settings and backup, opened from the top-right icon as a bottom sheet.
import * as L from '../logic.js';
import { h, toast, openSheet, closeSheet, field, seg } from '../ui.js';
import { state, save, replaceState, resetState } from '../store.js';
import { formSheet } from '../forms.js';
import { DEFAULT_AI_URL } from '../config.js';

export function settingsSheet() {
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
      h('button', { class: 'btn danger', type: 'button', onclick: () => { if (confirm('Delete ALL data on this phone? This cannot be undone.')) { resetState(); closeSheet(); save(); } } }, 'Delete all data')),
    h('p', { class: 'fine' }, 'TinyLog stores everything on this phone only. It offers general information and is not a substitute for medical advice.'),
  ], () => {
    const url = d.aiUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) return 'The AI address must start with http:// or https://';
    if (d.birthDate && L.parseDate(d.birthDate) > Date.now()) return 'The birth date is in the future.';
    state.baby = { name: d.name.trim(), birthDate: d.birthDate };
    state.settings = { units: d.units, currency: d.currency.trim() || '$', aiUrl: url };
  });
}

function restoreBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { return toast('That does not look like a TinyLog backup.'); }
  if (!data || typeof data !== 'object' || !Array.isArray(data.events)) return toast('That does not look like a TinyLog backup.');
  if (!confirm('Replace everything on this phone with this backup?')) return;
  replaceState(data); closeSheet(); save(); toast('Backup restored');
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
export function backupSheet() {
  const box = h('textarea', { rows: 5, class: 'mono', value: JSON.stringify(state), 'aria-label': 'Backup data as text' });
  const picker = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) restoreBackup(await f.text()); } }); // reset, so the same file can be picked again
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
