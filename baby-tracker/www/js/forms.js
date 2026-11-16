// Form pieces shared by every "add or edit" sheet.
import * as L from './logic.js';
import { h, toast, openSheet, closeSheet } from './ui.js';
import { state, save } from './store.js';

export const actions = (onDelete, saveLabel = 'Save') => h('div', { class: 'actions' },
  onDelete && h('button', { class: 'btn danger', type: 'button', onclick: onDelete }, 'Delete'),
  h('button', { class: 'btn primary', type: 'submit' }, saveLabel));
export const timeInput = (draft, key = 'start') => h('input', {
  type: 'datetime-local', required: key === 'start', value: draft[key] ? L.toDateTimeInput(draft[key]) : '',
  oninput: (e) => { draft[key] = e.target.value ? L.fromDateTimeInput(e.target.value) : null; },
});
export const noteInput = (draft) => h('input', { type: 'text', maxLength: 200, value: draft.note || '', placeholder: 'Optional', oninput: (e) => { draft.note = e.target.value; } });

/** Shared checks for an event's start time. Returns a message when it should not be saved. */
export function badTime(d) {
  if (!d.start) return 'Please set a time.';
  if (d.start > Date.now() + 5 * 60000) return 'That time is in the future. Please check the date.';
  const birth = state.baby.birthDate;
  if (birth && d.start < L.parseDate(birth) - L.DAY) return 'That date is before the birth date. Please check the year.';
  if (!birth && d.start < Date.now() - 5 * 365 * L.DAY) return 'That date is more than 5 years ago. Please check the year.';
}

/** Draft-driven sheet: `build(draft, rerender)` returns the form fields; `commit(draft)` returns an error string or nothing. */
export function formSheet(title, draft, build, commit, onDelete) {
  let saved = false; // a double tap on Save must not commit twice
  const draw = () => {
    const err = h('p', { class: 'warnbox', role: 'alert', hidden: true });
    openSheet(title, h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        if (saved) return;
        const msg = commit(draft);
        if (msg) { err.textContent = msg; err.hidden = false; err.scrollIntoView({ block: 'nearest' }); return; }
        saved = true;
        closeSheet(); save();
      },
    }, build(draft, draw), err, actions(onDelete)));
  };
  draw();
}
/** Delete with an Undo toast instead of a confirmation dialog. `key` is the list in state, e.g. 'events'. */
export function removeWithUndo(key, item) {
  state[key] = state[key].filter((x) => x.id !== item.id);
  closeSheet(); save();
  toast('Deleted', 'Undo', () => { state[key].push(item); save(); });
}
