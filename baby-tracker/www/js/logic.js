// Pure logic: units, ages, daily summaries, built-in tips and the AI summary.
// No DOM access here so it can be unit-tested with Node.
import { FOOD_IDEAS, GEAR_IDEAS } from './content.js';
import { ACTIVITIES, bandFor } from './activities.js';

export const ML_PER_OZ = 29.5735;
export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;
export const HOUR = 3600e3;
export const DAY = 24 * HOUR;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------- dates ----------
export function dayStart(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
/** Local midnight `n` days away from the day containing `ts` (safe across daylight-saving changes). */
export function addDays(ts, n) { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime(); }
export function parseDate(str) { // "YYYY-MM-DD" -> local midnight timestamp
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getTime();
}
export function toDateInput(ts) {
  const d = new Date(ts), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function toDateTimeInput(ts) {
  const d = new Date(ts), p = (n) => String(n).padStart(2, '0');
  return `${toDateInput(ts)}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const fromDateTimeInput = (str) => new Date(str).getTime();

export function ageDays(birthDate, now = Date.now()) {
  if (!birthDate) return null;
  return daysBetween(parseDate(birthDate), now);
}
/** Whole calendar days from the day of `from` to the day of `to` (daylight-saving days count as one day). */
export function daysBetween(from, to) {
  const a = new Date(from), b = new Date(to);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY);
}
/** Whole calendar months between birth and now, plus the days since the last month-anniversary. */
function calendarAge(birthDate, now) {
  const b = new Date(parseDate(birthDate)), n = new Date(dayStart(now));
  // The monthly "birthday" in a given month, clamped to that month's last day (born on the 31st -> the 30th or 28th).
  const birthdayIn = (m) => { const last = new Date(b.getFullYear(), b.getMonth() + m + 1, 0).getDate(); return new Date(b.getFullYear(), b.getMonth() + m, Math.min(b.getDate(), last)); };
  let months = (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth());
  if (n < birthdayIn(months)) months -= 1;
  return { months, extraDays: daysBetween(birthdayIn(months).getTime(), n.getTime()) };
}
export function ageMonths(birthDate, now = Date.now()) {
  if (!birthDate) return null;
  const { months, extraDays } = calendarAge(birthDate, now);
  return months + extraDays / 30.4375;
}
export function ageLabel(birthDate, now = Date.now()) {
  const days = ageDays(birthDate, now);
  if (days == null) return '';
  if (days < 0) return 'Not born yet';
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} old`;
  if (days < 84) return `${Math.floor(days / 7)} weeks old`;
  const { months, extraDays } = calendarAge(birthDate, now);
  if (months < 24) {
    const weeks = Math.floor(extraDays / 7);
    return `${months} month${months === 1 ? '' : 's'}${weeks ? `, ${weeks} wk` : ''} old`;
  }
  const years = Math.floor(months / 12), rem = months % 12;
  return `${years} yr${rem ? ` ${rem} mo` : ''} old`;
}

export function fmtDuration(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h >= 48) return `${Math.floor(h / 24)}d`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// ---------- units ----------
export const fmtVolume = (ml, units) => (units === 'imperial' ? `${+(ml / ML_PER_OZ).toFixed(1)} oz` : `${Math.round(ml)} ml`);
export const volumeToMl = (value, units) => (units === 'imperial' ? value * ML_PER_OZ : value);
export const volumeFromMl = (ml, units) => (units === 'imperial' ? +(ml / ML_PER_OZ).toFixed(1) : Math.round(ml));

export function fmtWeight(kg, units) {
  if (units !== 'imperial') return `${+kg.toFixed(2)} kg`;
  let oz = Math.round((kg / KG_PER_LB) * 16);
  return `${Math.floor(oz / 16)} lb ${oz % 16} oz`;
}
/** A weight difference, e.g. "+1 lb 12 oz" or "−200 g". */
export function fmtWeightChange(kg, units) {
  const sign = kg >= 0 ? '+' : '−', abs = Math.abs(kg);
  if (units !== 'imperial') return `${sign}${Math.round(abs * 1000) >= 1000 ? `${+abs.toFixed(2)} kg` : `${Math.round(abs * 1000)} g`}`;
  const oz = Math.round((abs / KG_PER_LB) * 16);
  return `${sign}${oz >= 16 ? `${Math.floor(oz / 16)} lb ${oz % 16} oz` : `${oz} oz`}`;
}
export const weightValue = (kg, units) => (units === 'imperial' ? kg / KG_PER_LB : kg); // for charts
export const weightUnit = (units) => (units === 'imperial' ? 'lb' : 'kg');
export const fmtHeight = (cm, units) => (units === 'imperial' ? `${+(cm / CM_PER_IN).toFixed(1)} in` : `${+cm.toFixed(1)} cm`);
export const heightValue = (cm, units) => (units === 'imperial' ? cm / CM_PER_IN : cm);
export const heightUnit = (units) => (units === 'imperial' ? 'in' : 'cm');

// ---------- events ----------
const isWet = (e) => e.type === 'diaper' && (e.kind === 'pee' || e.kind === 'both');
const isDirty = (e) => e.type === 'diaper' && (e.kind === 'poop' || e.kind === 'both');

/** Milliseconds of sleep that fall inside [from, to). Sleep still in progress counts up to `now`. */
export function sleepWithin(events, from, to, now = Date.now()) {
  // Clip each sleep to the window, then merge overlaps so a double entry is not counted twice.
  const spans = sleepSpans(events, from, to, now);
  return spans.reduce((total, [a, b]) => total + (b - a), 0);
}

/** A sleep with no wake-up time counts for at most this long; beyond it, "Wake up" was almost certainly forgotten. */
export const MAX_OPEN_SLEEP = 16 * HOUR;
export function sleepSpans(events, from, to, now = Date.now()) {
  const clipped = events.filter((e) => e.type === 'sleep')
    .map((e) => [Math.max(e.start, from), Math.min(e.end ?? Math.min(now, e.start + MAX_OPEN_SLEEP), to)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const span of clipped) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]); else merged.push([...span]);
  }
  return merged;
}

export function summarize(events, from, to, now = Date.now()) {
  const inRange = events.filter((e) => e.start >= from && e.start < to);
  const feeds = inRange.filter((e) => e.type === 'feed');
  return {
    feeds: feeds.length,
    milkFeeds: feeds.filter((e) => e.method !== 'solid').length,
    bottleMl: feeds.reduce((s, e) => s + (e.method === 'bottle' ? e.amountMl || 0 : 0), 0),
    breastMin: feeds.reduce((s, e) => s + (e.method === 'breast' ? e.minutes || 0 : 0), 0),
    solids: feeds.filter((e) => e.method === 'solid').length,
    sleepMs: sleepWithin(events, from, to, now),
    wet: inRange.filter(isWet).length,
    dirty: inRange.filter(isDirty).length,
    spitups: inRange.filter((e) => e.type === 'spitup').length,
  };
}

/** One summary per day for the last `count` days, oldest first; the last entry is today (partial). */
export function dailySeries(events, count, now = Date.now()) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const from = addDays(now, -i), to = addDays(now, -i + 1);
    out.push({ from, partial: i === 0, ...summarize(events, from, to, now) });
  }
  return out;
}
/** Sleep blocks and feed times for one day as fractions of 24 hours, for the day-pattern strip. */
export function dayPattern(events, from, now = Date.now()) {
  const to = addDays(from, 1), len = to - from;
  return {
    sleeps: sleepSpans(events, from, Math.min(to, Math.max(now, from)), now).map(([a, b]) => [(a - from) / len, (b - from) / len]),
    feeds: events.filter((e) => e.type === 'feed' && e.start >= from && e.start < to).map((e) => (e.start - from) / len),
  };
}
/** Average of `pick(day)` over complete days that have anything logged; null when there are none. */
export function dailyAverage(series, pick) {
  const full = series.filter((d) => !d.partial && (d.feeds || d.sleepMs || d.wet || d.dirty));
  return full.length ? full.reduce((s, d) => s + pick(d), 0) / full.length : null;
}

export function lastEvent(events, pred) {
  let best = null;
  for (const e of events) if (pred(e) && (!best || e.start > best.start)) best = e;
  return best;
}
export const currentSleep = (events) => events.find((e) => e.type === 'sleep' && e.end == null) || null;

// ---------- breastfeeding timer ----------
// A session is { start, side, sideStart, leftMs, rightMs }. `sideStart` is null while paused.
export function nursingElapsed(n, now = Date.now()) {
  const running = n.sideStart != null ? Math.max(0, now - n.sideStart) : 0;
  const leftMs = (n.leftMs || 0) + (n.side === 'left' ? running : 0);
  const rightMs = (n.rightMs || 0) + (n.side === 'right' ? running : 0);
  return { leftMs, rightMs, totalMs: leftMs + rightMs };
}
/** Tap a side: the running side pauses, any other tap (re)starts on that side. */
export function nursingTap(n, side, now = Date.now()) {
  const { leftMs, rightMs } = nursingElapsed(n, now);
  const pause = n.sideStart != null && n.side === side;
  return { ...n, leftMs, rightMs, side, sideStart: pause ? null : now };
}
/** Turn a finished session into a feed event. */
export function nursingToFeed(n, now = Date.now()) {
  const { leftMs, rightMs, totalMs } = nursingElapsed(n, now);
  const mins = (ms) => Math.round(ms / 60000);
  const l = mins(leftMs), r = mins(rightMs);
  const side = l && r ? 'both' : r > l || (!l && !r && rightMs > leftMs) ? 'right' : 'left';
  const ev = { id: uid(), type: 'feed', method: 'breast', start: n.start, side, minutes: Math.max(1, mins(totalMs)), note: '' };
  if (side === 'both') { ev.leftMin = mins(leftMs); ev.rightMin = mins(rightMs); }
  return ev;
}
export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), p = (v) => String(v).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}` : `${p(Math.floor(s / 60))}:${p(s % 60)}`;
}

export function describeEvent(e, units) {
  if (e.type === 'feed') {
    if (e.method === 'bottle') return { icon: '🍼', title: 'Bottle', detail: [e.amountMl ? fmtVolume(e.amountMl, units) : '', e.content || ''].filter(Boolean).join(' · ') };
    if (e.method === 'solid') return { icon: '🥣', title: 'Solid food', detail: e.food || '' };
    const side = { left: 'Left', right: 'Right', both: 'Both sides' }[e.side] || '';
    const split = e.side === 'both' && e.leftMin != null && e.rightMin != null ? `L ${e.leftMin} · R ${e.rightMin} min` : '';
    return { icon: '🤱', title: 'Breastfeed', detail: split || [side, e.minutes ? `${e.minutes} min` : ''].filter(Boolean).join(' · ') };
  }
  if (e.type === 'sleep') return { icon: '😴', title: e.end == null ? 'Sleeping now' : 'Sleep', detail: e.end == null ? '' : fmtDuration(e.end - e.start) };
  if (e.type === 'diaper') {
    const t = { pee: ['💧', 'Pee'], poop: ['💩', 'Poop'], both: ['💧💩', 'Pee + poop'] }[e.kind] || ['🧷', 'Diaper'];
    return { icon: t[0], title: t[1], detail: e.color || '' };
  }
  if (e.type === 'spitup') return { icon: '🤮', title: 'Spit-up', detail: e.amount ? `${e.amount[0].toUpperCase()}${e.amount.slice(1)}` : '' };
  return { icon: '•', title: e.type, detail: '' };
}

// ---------- built-in tips (work offline, no AI needed) ----------
// Typical total sleep per 24h by age, in hours (AASM / National Sleep Foundation ranges).
export function sleepRange(months) {
  if (months == null) return null;
  if (months < 4) return [14, 17];
  if (months < 12) return [12, 16];
  if (months < 36) return [11, 14];
  return [10, 13];
}

export function untriedFoods(state, months) {
  const tried = new Set(state.foods.map((f) => f.name.trim().toLowerCase()));
  return FOOD_IDEAS.filter((f) => f.fromMonths <= Math.max(months ?? 6, 6) && !tried.has(f.name.toLowerCase()));
}

export function buildTips(state, now = Date.now()) {
  const tips = [];
  const months = ageMonths(state.baby.birthDate, now);
  const days = ageDays(state.baby.birthDate, now);
  const name = state.baby.name || 'Baby';
  const ev = state.events;

  if (months == null) {
    tips.push({ icon: '🎂', title: 'Add a birth date', text: 'Tips are tailored to age. Add a birth date in Settings to unlock them.' });
  }

  // Diapers: only comment if diapers are actually being tracked.
  const last24 = summarize(ev, now - DAY, now, now);
  const trackedBefore = ev.some((e) => e.type === 'diaper' && e.start < now - DAY);
  if (days != null && days > 7 && trackedBefore && last24.wet < 6 && months < 12) {
    tips.push({ tone: 'warn', icon: '💧', title: `${last24.wet} wet diaper${last24.wet === 1 ? '' : 's'} logged in the last 24 hours`,
      text: last24.wet <= 2
        ? 'After the first week, around 6 or more wet diapers a day is typical. If some simply were not logged, ignore this. If the count is right, this is very few: offer a feed now and call your doctor or an out-of-hours service today. A dry diaper for 8 hours or more, a sunken soft spot, no tears, or unusual sleepiness needs urgent care.'
        : 'After the first week, around 6 or more wet diapers a day is typical. If some simply were not logged, ignore this. If the count is right, offer extra feeds and speak to your doctor today.' });
  }
  if (last24.spitups >= 5) {
    tips.push({ tone: 'warn', icon: '🤮', title: `${last24.spitups} spit-ups in the last 24 hours`,
      text: `Spitting up is common and usually harmless. Smaller, more frequent feeds and keeping ${name} upright for 20 to 30 minutes after feeding can help. Call your doctor if it is forceful, green or bloody, or ${name} seems unwell or is not gaining weight.` });
  }

  // Sleep: average over the last 3 full days that have sleep logged.
  const range = sleepRange(months);
  if (range) {
    const totals = [1, 2, 3].map((i) => sleepWithin(ev, addDays(now, -i), addDays(now, -i + 1), now) / HOUR).filter((h) => h > 0);
    if (totals.length >= 2) {
      const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
      if (avg < range[0] - 1.5) {
        tips.push({ icon: '😴', title: `About ${avg.toFixed(1)} hours of sleep a day lately`,
          text: `Babies this age typically sleep ${range[0]} to ${range[1]} hours in 24 hours, naps included. An earlier bedtime or an extra nap may help. Every baby differs, and unlogged naps will lower this number.` });
      } else if (avg > range[1] + 2) {
        tips.push({ icon: '😴', title: `About ${avg.toFixed(1)} hours of sleep a day logged`,
          text: `That is more than the typical ${range[0]} to ${range[1]} hours for this age. Check for a sleep that was never ended in the log. If ${name} really is sleeping much more than usual, is hard to wake, or is feeding less, call your doctor.` });
      } else if (avg < range[0]) {
        tips.push({ icon: '😴', title: `About ${avg.toFixed(1)} hours of sleep a day lately`,
          text: `That is a little under the typical ${range[0]} to ${range[1]} hours for this age. Unlogged naps will lower the number, and babies vary.` });
      } else {
        tips.push({ tone: 'good', icon: '😴', title: `Sleep looks on track (${avg.toFixed(1)} h a day)`,
          text: `Typical for this age is ${range[0]} to ${range[1]} hours in 24 hours, naps included.` });
      }
    }
  }

  // Food
  if (months != null) {
    if (months < 5.5) {
      tips.push({ icon: '🍼', title: 'Milk is the whole menu for now', text: 'Until around 6 months, breast milk or formula gives babies everything they need. Solids usually start at about 6 months.' });
    } else if (state.foods.length === 0 && months < 9) {
      tips.push({ icon: '🥑', title: 'Ready for first foods?', text: `Most babies start solids at around 6 months. Signs of readiness: sitting with support, steady head control, and reaching for your food. See Food under Ideas for gentle starters.` });
    } else {
      const next = untriedFoods(state, months).slice(0, 3).map((f) => f.name);
      if (next.length) tips.push({ icon: '🥕', title: 'Foods to try next', text: `${name} has not tried ${next.join(', ')} yet. Offer one new food at a time so any reaction is easy to spot.` });
      const allergensTried = state.foods.some((f) => FOOD_IDEAS.some((i) => i.allergen && i.name.toLowerCase() === f.name.trim().toLowerCase()));
      if (!allergensTried && months < 12) {
        tips.push({ icon: '🥜', title: 'Introducing common allergens', text: 'Current guidance favours offering common allergens such as egg and peanut early, from around 6 months, one at a time and in a safe form (never whole nuts). If your baby has severe eczema or a known food allergy, talk to your doctor first.' });
      }
    }
  }

  // Growth
  const growth = [...state.growth].sort((a, b) => a.date.localeCompare(b.date));
  const weights = growth.filter((g) => g.weightKg);
  if (!weights.length) {
    tips.push({ icon: '⚖️', title: 'Log a first weight', text: 'Add weight and height in the Growth tab to see a chart build up over time.' });
  } else {
    const last = weights[weights.length - 1], prev = weights[weights.length - 2];
    if (prev && last.weightKg < prev.weightKg && days > 14) {
      tips.push({ tone: 'warn', icon: '⚖️', title: 'Latest weight is lower than the one before', text: 'Small dips can come from different scales or clothing. If it is a real drop, mention it to your doctor.' });
    } else if (now - parseDate(last.date) > 30 * DAY && months < 12) {
      tips.push({ icon: '⚖️', title: 'Time for a new weigh-in?', text: `The last weight was logged ${Math.round((now - parseDate(last.date)) / DAY)} days ago.` });
    }
  }

  // Play
  if (months != null) {
    const log = state.activityLog || [];
    if (!log.some((a) => now - parseDate(a.date) < 3 * DAY)) {
      const done = new Set(log.map((a) => a.activityId)), band = bandFor(months);
      const idea = ACTIVITIES.find((a) => a.from === band.from && !done.has(a.id)) || ACTIVITIES.find((a) => a.from === band.from);
      if (idea) tips.push({ icon: idea.icon, title: `Play idea: ${idea.name}`, text: `${idea.how} More ideas are in the Play tab.` });
    }
  }

  // Words
  if (months != null && months >= 9 && state.words.length === 0) {
    tips.push({ icon: '💬', title: 'Listening for a first word', text: 'First words often arrive around 12 months, give or take a few. Talking, reading and naming things all help. Log the first one under Firsts.' });
  }

  // Gear for the coming stage
  if (months != null) {
    const have = new Set(state.gear.map((g) => g.name.trim().toLowerCase()));
    const soon = GEAR_IDEAS.filter((g) => g.fromMonths <= months + 1.5 && g.fromMonths >= months - 3 && (g.toMonths == null || months <= g.toMonths) && !have.has(g.name.toLowerCase())).slice(0, 3);
    if (soon.length) tips.push({ icon: '🛒', title: 'Gear for this stage', text: `Worth considering: ${soon.map((g) => g.name).join(', ')}. Add them to your Gear list to buy later.` });
  }

  if (months != null && months < 12) {
    tips.push({ icon: '🌙', title: 'Safe sleep reminder', text: 'Always on the back, on a firm flat mattress, in a clear cot with no pillows, bumpers or loose blankets.' });
  }
  return tips;
}

// ---------- compact summary sent to the AI ----------
export function aiSummary(state, now = Date.now()) {
  const u = state.settings.units;
  const lines = [];
  const b = state.baby;
  lines.push(`Baby: ${b.name || 'unnamed'}${b.birthDate ? `, ${ageLabel(b.birthDate, now)} (born ${b.birthDate})` : ', age unknown'}.`);
  lines.push('Daily log, most recent first (milk feeds / bottle volume / breastfeeding minutes / solid meals / sleep hours / wet / dirty / spit-ups):');
  let any = false;
  for (let i = 0; i < 7; i++) {
    const from = addDays(now, -i), s = summarize(state.events, from, addDays(now, -i + 1), now);
    if (!s.feeds && !s.sleepMs && !s.wet && !s.dirty && !s.spitups) continue;
    any = true;
    lines.push(`- ${i === 0 ? 'today so far' : toDateInput(from)}: ${s.milkFeeds} milk feeds / ${fmtVolume(s.bottleMl, u)} / ${s.breastMin} min / ${s.solids} solids / ${(s.sleepMs / HOUR).toFixed(1)} h / ${s.wet} wet / ${s.dirty} dirty / ${s.spitups} spit-ups`);
  }
  if (!any) lines.push('- nothing logged in the last 7 days');
  const growth = [...state.growth].sort((a, b2) => b2.date.localeCompare(a.date)).slice(0, 4);
  if (growth.length) lines.push('Growth (latest first): ' + growth.map((g) => `${g.date}: ${[g.weightKg ? fmtWeight(g.weightKg, u) : '', g.heightCm ? fmtHeight(g.heightCm, u) : ''].filter(Boolean).join(', ')}`).join('; ') + '.');
  if (state.foods.length) lines.push('Foods tried: ' + recent(state.foods, 40).map((f) => `${f.name}${f.reaction ? ` (${f.reaction})` : ''}${f.allergy ? ' [possible reaction noted]' : ''}`).join(', ') + '.');
  else lines.push('Foods tried: none yet.');
  if (state.words.length) lines.push(`Words so far (${state.words.length}): ` + recent(state.words, 25).map((w) => w.word).join(', ') + '.');
  const played = (state.activityLog || []).filter((a) => now - parseDate(a.date) < 7 * DAY).map((a) => a.name);
  if (played.length) lines.push('Activities done in the last 7 days: ' + [...new Set(played)].join(', ') + '.');
  const toBuy = state.gear.filter((g) => !g.bought).map((g) => g.name).slice(0, 20), owned = state.gear.filter((g) => g.bought).map((g) => g.name).slice(0, 20);
  if (toBuy.length) lines.push('Gear wishlist: ' + toBuy.join(', ') + '.');
  if (owned.length) lines.push('Gear already owned: ' + owned.join(', ') + '.');
  return lines.join('\n').slice(0, 5000); // the AI server refuses summaries over 6000 characters
}
/** The most recent `count` dated items. */
const recent = (items, count) => [...items].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, count);
