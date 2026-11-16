// The shape of saved data, and cleaning of anything loaded from storage or a backup file.
// Pure (no DOM, no imports) so it can be unit-tested. A backup may come from an older
// version, be hand-edited, or be damaged, so nothing here trusts its input.

export const blank = () => ({
  baby: { name: '', birthDate: '' },
  settings: { units: 'metric', currency: '$', aiUrl: '' },
  events: [], growth: [], words: [], foods: [], gear: [],
  nursing: null, // breastfeeding timer in progress, see logic.js
  activityLog: [], // { id, activityId, name, date } each time an activity is marked done
});

const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' ? String(v) : '');
const id = (v) => str(v, 40);
const positive = (v) => { const n = typeof v === 'string' ? parseFloat(v) : v; return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined; };
const time = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const date = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : '');
const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const webUrl = (v) => (typeof v === 'string' && /^https?:\/\//i.test(v.trim()) ? v.trim().slice(0, 500) : '');
const list = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const compact = (items) => items.filter(Boolean);

function event(e) {
  const start = time(e.start), base = { id: id(e.id), start, note: str(e.note) };
  if (!base.id || !start) return null;
  if (e.type === 'feed') {
    const method = oneOf(e.method, ['breast', 'bottle', 'solid'], 'bottle');
    const ev = { ...base, type: 'feed', method };
    if (method === 'breast') {
      ev.side = oneOf(e.side, ['left', 'right', 'both'], 'left'); ev.minutes = positive(e.minutes);
      if (ev.side === 'both' && Number.isFinite(e.leftMin) && Number.isFinite(e.rightMin)) { ev.leftMin = e.leftMin; ev.rightMin = e.rightMin; }
    } else if (method === 'bottle') { ev.amountMl = positive(e.amountMl); ev.content = str(e.content, 40) || 'Formula'; } else {
      ev.food = str(e.food, 60);
      if (!ev.food) return null;
    }
    return ev;
  }
  if (e.type === 'sleep') { const end = time(e.end); return { ...base, type: 'sleep', end: end && end > start ? end : null }; }
  if (e.type === 'diaper') return { ...base, type: 'diaper', kind: oneOf(e.kind, ['pee', 'poop', 'both'], 'pee'), color: str(e.color, 40) };
  if (e.type === 'spitup') return { ...base, type: 'spitup', amount: oneOf(e.amount, ['small', 'medium', 'large'], 'small') };
  return null; // an event type this version does not know
}

export function normalise(data) {
  const b = blank();
  if (!data || typeof data !== 'object' || Array.isArray(data)) return b;
  const baby = data.baby && typeof data.baby === 'object' ? data.baby : {};
  const settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
  const n = data.nursing && typeof data.nursing === 'object' ? data.nursing : null;
  const today = new Date().toISOString().slice(0, 10);
  return {
    baby: { name: str(baby.name, 40), birthDate: date(baby.birthDate) },
    settings: { units: oneOf(settings.units, ['metric', 'imperial'], 'metric'), currency: str(settings.currency, 3) || '$', aiUrl: webUrl(settings.aiUrl) },
    events: compact(list(data.events).map(event)),
    growth: compact(list(data.growth).map((g) => {
      const entry = { id: id(g.id), date: date(g.date), weightKg: positive(g.weightKg), heightCm: positive(g.heightCm) };
      return entry.id && entry.date && (entry.weightKg || entry.heightCm) ? entry : null;
    })),
    words: compact(list(data.words).map((w) => (id(w.id) && str(w.word, 40).trim() ? { id: id(w.id), word: str(w.word, 40), date: date(w.date) || today, note: str(w.note) } : null))),
    foods: compact(list(data.foods).map((f) => (id(f.id) && str(f.name, 60).trim() ? {
      id: id(f.id), name: str(f.name, 60), date: date(f.date) || today, reaction: oneOf(f.reaction, ['loved', 'ok', 'disliked'], ''), allergy: f.allergy === true, note: str(f.note),
    } : null))),
    gear: compact(list(data.gear).map((g) => (id(g.id) && str(g.name, 60).trim() ? {
      id: id(g.id), name: str(g.name, 60), category: str(g.category, 30) || 'Other', price: positive(g.price), url: webUrl(g.url),
      priority: oneOf(g.priority, ['high', 'medium', 'low'], 'medium'), bought: g.bought === true,
    } : null))),
    nursing: n && time(n.start) ? {
      start: n.start, side: oneOf(n.side, ['left', 'right'], 'left'), sideStart: time(n.sideStart),
      leftMs: Math.max(0, Number(n.leftMs) || 0), rightMs: Math.max(0, Number(n.rightMs) || 0),
    } : null,
    activityLog: compact(list(data.activityLog).map((a) => (str(a.activityId, 40) && date(a.date) ? { id: id(a.id) || `${a.activityId}-${a.date}`, activityId: str(a.activityId, 40), name: str(a.name, 60), date: a.date } : null))),
  };
}
