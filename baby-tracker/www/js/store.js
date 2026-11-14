// The app's data and where the parent is in the app. All data lives on the device
// (localStorage); nothing leaves it unless the parent asks the AI a question.
import * as L from './logic.js';
import { toast, render } from './ui.js';

// ---------- saved data ----------
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

/** Everything that is saved. Importers see the new object after replaceState/resetState. */
export let state = load();
/** Store the current state and redraw. Call after every change to `state`. */
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { toast('Could not save. Storage may be full.'); }
  render();
}
/** Swap in data from a backup (cleaned up first). Follow with save(). */
export function replaceState(data) { state = normalise(data); }
/** Wipe everything. Follow with save(). */
export function resetState() { state = blank(); view.ai = { busy: false, answer: '', error: '', question: '' }; }
export const units = () => state.settings.units;

// ---------- where the parent is (not saved) ----------
export const view = {
  tab: 'today',
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
