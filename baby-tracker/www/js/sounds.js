// White noise player: the Sounds screen and a slim now-playing bar.
// Self-contained on purpose: it does not import from the rest of the app, and the app
// passes in `render` to refresh the screen.
//
// On the phone the sound is produced by a native Android service (see
// android/.../noise/), so it keeps playing with the screen off and can be cast to a
// speaker. In a desktop browser it falls back to Web Audio, which is enough to try it.

const TYPES = [
  ['white', 'White', 'An even hiss, like a fan or a radio between stations.'],
  ['pink', 'Pink', 'Softer and deeper, like steady rain.'],
  ['brown', 'Brown', 'A low rumble, like a waterfall far away or the sound of the womb.'],
];
const DURATIONS = [[15, '15 min'], [30, '30 min'], [60, '1 hour'], [0, 'No timer']];
const PREF_KEY = 'tinylog.sound';
const FADE_MS = 8000;

// ---------- remembered choices ----------
function loadPrefs() {
  try { return { type: 'white', minutes: 30, volume: 0.4, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { return { type: 'white', minutes: 30, volume: 0.4 }; }
}
const prefs = loadPrefs();
const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ } };

// ---------- state shared by both engines ----------
const state = { playing: false, type: prefs.type, endsAt: 0, volume: prefs.volume, casting: false, device: '', problem: '' };
let rerender = () => {};
const changed = () => { tick(); rerender(); };

// ---------- native engine ----------
const cap = window.Capacitor;
const native = cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.WhiteNoise ? cap.Plugins.WhiteNoise : null;
function adopt(s) {
  if (!s) return;
  state.playing = !!s.playing; state.endsAt = Number(s.endsAt) || 0; state.casting = !!s.casting; state.device = s.device || '';
  if (s.playing && s.type) state.type = s.type;
}
if (native) {
  native.addListener('state', (s) => { adopt(s); state.problem = ''; changed(); });
  native.addListener('problem', (p) => { state.problem = (p && p.message) || 'Something went wrong with the speaker.'; changed(); });
  native.status().then((s) => { adopt(s); changed(); }).catch(() => {});
}

// ---------- browser engine (Web Audio) ----------
let audio = null, source = null, gainNode = null, stopTimer = null;
export function noiseSamples(type, length) { // same filters as the Android generator
  const out = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, brown = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (type === 'pink') {
      b0 = 0.99886 * b0 + white * 0.0555179; b1 = 0.99332 * b1 + white * 0.0750759; b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856; b4 = 0.55 * b4 + white * 0.5329522; b5 = -0.7616 * b5 - white * 0.016898;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11; b6 = white * 0.115926;
    } else if (type === 'brown') {
      brown = (brown + 0.02 * white) / 1.02; out[i] = brown * 3.5;
    } else out[i] = white * 0.5;
  }
  return out;
}
function webStop(fade = 300) {
  clearTimeout(stopTimer); stopTimer = null;
  if (source && gainNode && audio) {
    const s = source, t = audio.currentTime;
    gainNode.gain.cancelScheduledValues(t);
    gainNode.gain.setValueAtTime(gainNode.gain.value, t);
    gainNode.gain.linearRampToValueAtTime(0, t + fade / 1000);
    setTimeout(() => { try { s.stop(); } catch { /* already stopped */ } }, fade + 50);
  }
  source = null;
}
function webStart(type, minutes, volume) {
  webStop(50);
  audio = audio || new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === 'suspended') audio.resume();
  const seconds = 12, buffer = audio.createBuffer(1, audio.sampleRate * seconds, audio.sampleRate);
  buffer.copyToChannel(noiseSamples(type, buffer.length), 0);
  source = audio.createBufferSource(); source.buffer = buffer; source.loop = true;
  gainNode = audio.createGain();
  gainNode.gain.setValueAtTime(0, audio.currentTime);
  gainNode.gain.linearRampToValueAtTime(volume, audio.currentTime + 0.6);
  source.connect(gainNode).connect(audio.destination);
  source.start();
  if (minutes > 0) {
    const ms = minutes * 60000;
    gainNode.gain.setValueAtTime(volume, audio.currentTime + Math.max(0.6, (ms - FADE_MS) / 1000));
    gainNode.gain.linearRampToValueAtTime(0, audio.currentTime + ms / 1000);
    stopTimer = setTimeout(() => { webStop(0); state.playing = false; state.endsAt = 0; changed(); }, ms);
  }
}

// ---------- actions ----------
/** `keepTimer`: a change of sound mid-session keeps the time that is left instead of starting over. */
async function play({ keepTimer = false } = {}) {
  state.problem = '';
  savePrefs();
  const minutes = keepTimer && state.playing && state.endsAt ? Math.max(1, Math.ceil((state.endsAt - Date.now()) / 60000)) : prefs.minutes;
  try {
    if (native) adopt(await native.start({ type: prefs.type, minutes, volume: prefs.volume }));
    else {
      webStart(prefs.type, minutes, prefs.volume);
      state.playing = true; state.type = prefs.type; state.endsAt = minutes ? Date.now() + minutes * 60000 : 0;
    }
  } catch (err) { state.problem = (err && err.message) || 'Could not start the sound.'; }
  changed();
}
async function stop() {
  try {
    if (native) await native.stop(); else webStop();
  } catch { /* nothing to stop */ }
  state.playing = false; state.endsAt = 0;
  changed();
}
function setVolume(v) {
  prefs.volume = state.volume = v; savePrefs();
  if (native) native.setVolume({ volume: v }).catch(() => {});
  else if (gainNode && audio && state.playing && !state.endsAt) gainNode.gain.setTargetAtTime(v, audio.currentTime, 0.05);
  else if (state.playing && state.endsAt) webStart(state.type, Math.max(0.2, (state.endsAt - Date.now()) / 60000), v);
}
async function chooseSpeaker() {
  state.problem = '';
  try { adopt(await native.cast()); } catch (err) { state.problem = (err && err.message) || 'Casting is not available on this phone.'; }
  changed();
}
async function stopCasting() {
  try { await native.stopCast(); } catch { /* already disconnected */ }
  state.casting = false; state.playing = false; state.endsAt = 0;
  changed();
}

// ---------- tiny DOM helper + styles ----------
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v);
  }
  el.append(...kids.flat(Infinity).filter((k) => k != null && k !== false && k !== ''));
  return el;
}
const css = `
.snd-now { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 0 2px; text-align: center; }
.snd-now b { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.15; }
.snd-now span { color: var(--ink2); font-size: 14px; }
.snd-vol { display: flex; align-items: center; gap: 12px; }
.snd-vol input { flex: 1; min-height: 44px; accent-color: var(--primary); }
.snd-vol small { width: 44px; text-align: right; font-variant-numeric: tabular-nums; }
.snd-cast { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.snd-cast > span { display: flex; flex-direction: column; min-width: 0; }
.snd-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: var(--sleep); color: var(--sleep-ink); border-radius: 16px; padding: 4px 6px 4px 14px; font-weight: 600; font-size: 14.5px; }
.snd-bar button { border: 0; background: none; color: inherit; font: inherit; font-weight: 700; min-height: 44px; padding: 0 10px; }
.snd-bar .snd-open { flex: 1; text-align: left; padding: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;
document.head.append(h('style', { textContent: css }));

function seg(options, value, onChange, label) {
  return h('div', { class: 'seg', role: 'group', 'aria-label': label }, options.map(([v, text]) =>
    h('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => onChange(v) }, text)));
}
const typeName = (t) => (TYPES.find((x) => x[0] === t) || TYPES[0])[1];
function remaining() {
  if (!state.playing) return '';
  if (!state.endsAt) return 'Playing until you stop it';
  const mins = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m left` : `${mins} min left`;
}
/** Refresh the countdown text in place (no full re-render needed). */
function tick() {
  for (const el of document.querySelectorAll('[data-snd-left]')) el.textContent = el.dataset.sndLeft === 'bar' ? `${typeName(state.type)} noise · ${remaining()}` : remaining();
}
setInterval(tick, 15000);

// ---------- the screen ----------
export function viewSounds({ render } = {}) {
  if (render) rerender = render;
  const live = state.playing;
  const pick = (key) => (v) => { prefs[key] = v; savePrefs(); if (live) play({ keepTimer: key === 'type' }); else rerender(); };
  const where = state.casting ? `on ${state.device || 'your speaker'}` : 'on this phone';
  return [
    h('section', { class: 'card' },
      h('div', { class: 'cardhead' }, h('h2', null, 'White noise'), live && h('small', null, where)),
      live && h('div', { class: 'snd-now', role: 'status' }, h('b', null, `${typeName(state.type)} noise`), h('span', { 'data-snd-left': 'screen' }, remaining())),
      seg(TYPES.map(([v, name]) => [v, name]), prefs.type, pick('type'), 'Sound'),
      h('p', { class: 'fine' }, (TYPES.find((t) => t[0] === prefs.type) || TYPES[0])[2]),
      h('div', { class: 'field' }, h('span', null, 'Play for'), seg(DURATIONS, prefs.minutes, pick('minutes'), 'Play for')),
      h('div', { class: 'field' }, h('span', null, 'Volume'),
        h('div', { class: 'snd-vol' },
          h('input', { type: 'range', min: 0.05, max: 1, step: 0.05, value: prefs.volume, 'aria-label': 'Volume',
            oninput: (e) => { setVolume(Number(e.target.value)); e.target.nextSibling.textContent = `${Math.round(prefs.volume * 100)}%`; } }),
          h('small', null, `${Math.round(prefs.volume * 100)}%`))),
      state.problem && h('p', { class: 'warnbox', role: 'alert' }, state.problem),
      live ? h('button', { class: 'btn block', type: 'button', onclick: stop }, '■ Stop')
        : h('button', { class: 'btn primary block', type: 'button', onclick: () => play() }, state.casting ? `▶ Play on ${state.device || 'speaker'}` : '▶ Play')),
    h('section', { class: 'card' },
      h('div', { class: 'snd-cast' },
        h('span', null, h('b', null, state.casting ? `Connected to ${state.device || 'a speaker'}` : 'Play on a speaker'),
          h('small', null, state.casting ? 'The sound plays there, and the timer still applies.'
            : native ? 'Cast to a Chromecast or Google Nest speaker on your Wi-Fi.' : 'Casting works in the Android app. A Bluetooth speaker works anywhere.')),
        native && (state.casting
          ? h('button', { class: 'btn small', type: 'button', onclick: stopCasting }, 'Disconnect')
          : h('button', { class: 'btn small', type: 'button', onclick: chooseSpeaker }, 'Choose speaker'))),
      h('p', { class: 'fine' }, 'A Bluetooth speaker needs no setup here: connect it in Android settings and the sound follows.')),
    h('p', { class: 'fine pad' }, 'Keep it gentle: no louder than a quiet conversation (about 50 decibels), with the phone or speaker at least 2 metres (7 feet) from the cot, never inside it. White noise is a settling aid, so use the timer when you can.'),
  ];
}

/** A slim now-playing strip for other screens; null when nothing is playing. */
export function soundsBar({ render, open } = {}) {
  if (render) rerender = render;
  if (!state.playing) return null;
  return h('div', { class: 'snd-bar', role: 'status' },
    h('button', { class: 'snd-open', type: 'button', 'data-snd-left': 'bar', onclick: () => open && open() }, `${typeName(state.type)} noise · ${remaining()}`),
    h('button', { type: 'button', onclick: stop }, 'Stop'));
}

/** Start the remembered sound straight away (for a shortcut next to "Start sleep"). */
export const playSound = () => play();
export const soundPlaying = () => state.playing;
