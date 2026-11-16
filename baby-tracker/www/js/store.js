// The app's data and where the parent is in the app. All data lives on the device
// (localStorage); nothing leaves it unless the parent asks the AI a question.
import * as L from './logic.js';
import { render } from './ui.js';
import { blank, normalise } from './schema.js';

// ---------- saved data ----------
const KEY = 'tinylog.v1';
function load() { try { return normalise(JSON.parse(localStorage.getItem(KEY))); } catch { return blank(); } }

/** Everything that is saved. Importers see the new object after replaceState/resetState. */
export let state = load();
/**
 * Store the current state and redraw. Call after every change to `state`.
 * Returns false when the phone refused the write; the shell then shows a warning that
 * stays on screen until a save works, so a later "logged" message cannot hide it.
 */
export function save() {
  let ok = true;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { ok = false; }
  view.saveFailed = !ok;
  render();
  return ok;
}
/** Swap in data from a backup (cleaned up first). Follow with save(). */
export function replaceState(data) { state = normalise(data); }
/** Wipe everything. Follow with save(). */
export function resetState() { state = blank(); view.ai = { busy: false, answer: '', error: '', question: '', draft: '' }; view.tab = 'today'; view.day = null; }
export const units = () => state.settings.units;

// ---------- where the parent is (not saved) ----------
export const view = {
  tab: 'today',
  saveFailed: false, // the last save did not reach storage
  tapGuard: 0, // ignore quick-log taps until this time (just after a card under the finger disappears)
  day: null, // the day shown on Today; null means "today", see viewDay
  welcome: { name: '', birthDate: '' },
  trends: 'daily', trend: { metric: 'sleep', days: 7 },
  firsts: 'words',
  ideas: 'play', band: null,
  ai: { busy: false, answer: '', error: '', question: '', draft: '' },
};
/** Switch to another tab. */
export function go(tab) { view.tab = tab; render(); }
// view.day is null while looking at today, so the screen follows midnight on its own.
export const viewDay = () => view.day ?? L.dayStart(Date.now());
export function showDay(ts) { const d = L.dayStart(ts); view.day = d >= L.dayStart(Date.now()) ? null : d; }
