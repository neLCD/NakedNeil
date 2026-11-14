/* Ping! Messenger client: window manager, sign-in, contact list, conversations. */
'use strict';

// ---------- tiny DOM helper ----------
const clean = (kids) => kids.flat(Infinity).filter((k) => k != null && k !== false && k !== '');
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v);
  }
  el.append(...clean(kids));
  return el;
}
const isPhone = () => matchMedia('(max-width: 700px)').matches;
const store = {
  get(k, d) { try { const v = localStorage.getItem('ping.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ping.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem('ping.' + k); } catch { /* private mode */ } },
};

// ---------- constants ----------
const STATUS = {
  online: 'Online', busy: 'Busy', brb: 'Be right back', away: 'Away',
  phone: 'On the phone', lunch: 'Out to lunch', invisible: 'Appear offline', offline: 'Offline',
};
const AVATARS = [
  ['🐸', '#bfe9a0'], ['🦆', '#ffe38a'], ['⚽', '#b9e3b0'], ['🎸', '#f7b0a0'], ['🌻', '#a9d8ff'], ['🤖', '#cfd6e6'],
  ['🐱', '#ffd0a0'], ['🐶', '#e3c9a8'], ['🛹', '#c9b8f5'], ['🏖️', '#9fe3e8'], ['🚀', '#b0b8f0'], ['🍕', '#ffc2c2'],
];
const EMOTICONS = [
  [':)', '🙂'], [':D', '😃'], [';)', '😉'], [':P', '😛'], [':(', '🙁'], [':O', '😮'], [':S', '😖'], [':|', '😐'],
  [":'(", '😢'], [':$', '😳'], [':@', '😠'], ['XD', '😆'], ['(H)', '😎'], ['(A)', '😇'], ['(6)', '😈'], ['(L)', '❤️'],
  ['(U)', '💔'], ['(K)', '💋'], ['(Y)', '👍'], ['(N)', '👎'], ['(F)', '🌹'], ['(*)', '⭐'], ['(8)', '🎵'], ['(C)', '☕'],
  ['(B)', '🍺'], ['(^)', '🎂'], ['(G)', '🎁'], ['(S)', '🌙'], ['(I)', '💡'], ['(P)', '📷'], ['(E)', '✉️'], ['(@)', '🐱'],
];
const EMO_MAP = new Map(EMOTICONS.map(([k, v]) => [k.toLowerCase(), v]));
for (const [k, v] of [[':-)', '🙂'], [':-D', '😃'], [';-)', '😉'], [':-P', '😛'], [':-(', '🙁'], [':-O', '😮']]) EMO_MAP.set(k.toLowerCase(), v);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const keys = [...EMO_MAP.keys()].sort((a, b) => b.length - a.length);
// Smileys that start with punctuation or letters must not be glued to a word; (X) codes can sit anywhere.
const TOKEN_RE = new RegExp(
  `(https?:\\/\\/[^\\s<>"']+)|(?<!\\S)(${keys.filter((k) => k[0] !== '(').map(esc).join('|')})(?!\\w)|(${keys.filter((k) => k[0] === '(').map(esc).join('|')})`,
  'gi');
const COLORS = ['#000000', '#7a1fa2', '#c2185b', '#d32f2f', '#f07a00', '#2e7d32', '#00838f', '#1456c8'];

// ---------- state ----------
const S = {
  token: null, ws: null, me: null, signedIn: false, intentionalClose: false, retry: 0,
  contacts: new Map(), requests: new Map(), chats: new Map(),
  collapsed: {}, notice: null, connLost: false,
  sound: store.get('sound', true),
  font: store.get('font', { color: '#000000', bold: false, italic: false }),
};

// ---------- sounds (synthesised, nothing to download) ----------
let audio = null;
function tone(freq, at, dur, type = 'triangle', vol = 0.12) {
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = type; o.frequency.value = freq;
  const t = audio.currentTime + at;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(audio.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function play(name) {
  if (!S.sound) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    if (name === 'message') { tone(784, 0, 0.12); tone(1175, 0.1, 0.22); }
    else if (name === 'online') { tone(523, 0, 0.14, 'sine'); tone(659, 0.12, 0.14, 'sine'); tone(784, 0.24, 0.3, 'sine'); }
    else if (name === 'nudge') { for (let i = 0; i < 6; i++) tone(i % 2 ? 150 : 110, i * 0.08, 0.08, 'sawtooth', 0.1); }
  } catch { /* audio unavailable */ }
}

// ---------- window manager ----------
const desktop = document.getElementById('desktop');
const tasks = document.getElementById('tasks');
const WM = { z: 10, wins: new Map(), active: null, count: 0 };

function openWindow({ id, title, w = 320, ht = 420, body, onClose, onFocus, focus = true }) {
  if (WM.wins.has(id)) { const win = WM.wins.get(id); if (focus) focusWindow(win); return win; }
  const n = WM.count++;
  const maxX = Math.max(0, desktop.clientWidth - w), maxY = Math.max(0, desktop.clientHeight - ht);
  const ttl = h('span', { class: 'ttl' }, title);
  const taskLabel = h('span', null, title);
  const win = {
    id, onClose, onFocus, minimized: false,
    body: h('div', { class: 'winbody' }, body),
    setTitle(t) { ttl.textContent = t; taskLabel.textContent = t; },
    flash(on) { win.task.classList.toggle('flash', on); },
    close() { closeWindow(win); },
  };
  const bar = h('div', { class: 'titlebar' },
    h('img', { src: 'favicon.svg', width: 16, height: 16, alt: '' }), ttl,
    h('button', { type: 'button', title: 'Minimize', 'aria-label': 'Minimize', onclick: () => minimizeWindow(win) }, '_'),
    h('button', { type: 'button', class: 'x', title: 'Close', 'aria-label': 'Close', onclick: () => closeWindow(win) }, '✕'));
  win.el = h('section', {
    class: 'window', 'aria-label': title,
    style: {
      width: w + 'px', height: Math.min(ht, desktop.clientHeight) + 'px',
      left: Math.min(maxX, id === 'main' ? Math.max(20, maxX - 40) : 40 + (n % 6) * 28) + 'px',
      top: Math.min(maxY, id === 'main' ? 20 : 30 + (n % 6) * 24) + 'px',
    },
    onpointerdown: () => focusWindow(win),
  }, bar, win.body);
  win.task = h('button', { class: 'task', type: 'button', onclick: () => (WM.active === win ? minimizeWindow(win) : focusWindow(win)) },
    h('img', { src: 'favicon.svg', width: 14, height: 14, alt: '' }), taskLabel);

  // dragging
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || isPhone()) return;
    const r = win.el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    bar.setPointerCapture(e.pointerId);
    const move = (ev) => {
      win.el.style.left = Math.max(-r.width + 60, Math.min(desktop.clientWidth - 60, ev.clientX - dx)) + 'px';
      win.el.style.top = Math.max(0, Math.min(desktop.clientHeight - 27, ev.clientY - dy)) + 'px';
    };
    const up = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up); };
    bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
  });

  WM.wins.set(id, win);
  desktop.append(win.el);
  tasks.append(win.task);
  if (focus) focusWindow(win); else { win.minimized = true; win.el.classList.add('minimized'); }
  return win;
}
function focusWindow(win) {
  win.minimized = false;
  win.el.classList.remove('minimized');
  if (WM.active !== win) {
    if (WM.active) { WM.active.el.classList.remove('active'); WM.active.task.classList.remove('active'); }
    WM.active = win;
    win.el.style.zIndex = ++WM.z;
    win.el.classList.add('active');
    win.task.classList.add('active');
  }
  win.flash(false);
  if (win.onFocus) win.onFocus();
}
function topWindow(except) {
  let best = null;
  for (const w of WM.wins.values()) if (w !== except && !w.minimized && (!best || +w.el.style.zIndex > +best.el.style.zIndex)) best = w;
  return best;
}
function blurWindow(win) {
  if (WM.active !== win) return;
  win.el.classList.remove('active'); win.task.classList.remove('active');
  WM.active = null;
  const next = topWindow(win);
  if (next) focusWindow(next);
}
function minimizeWindow(win) { win.minimized = true; win.el.classList.add('minimized'); blurWindow(win); }
function closeWindow(win) {
  if (!WM.wins.has(win.id)) return;
  if (win.id === 'main') return minimizeWindow(win); // the messenger itself lives in the taskbar
  WM.wins.delete(win.id);
  win.minimized = true;
  blurWindow(win);
  win.el.remove(); win.task.remove();
  if (win.onClose) win.onClose();
}

// ---------- menus & toasts ----------
let openMenu = null;
function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }
function showMenu(x, y, items, cls = '') {
  closeMenu();
  const m = h('div', { class: 'menu ' + cls, role: 'menu' }, items);
  m.addEventListener('click', (e) => { if (e.target.closest('button')) closeMenu(); });
  m.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(2, Math.min(x, innerWidth - r.width - 4)) + 'px';
  m.style.top = Math.max(2, Math.min(y, innerHeight - r.height - 4)) + 'px';
  openMenu = m;
  const first = m.querySelector('button'); if (first) first.focus();
}
const menuItem = (label, fn) => h('button', { type: 'button', role: 'menuitem', onclick: fn }, label);
document.addEventListener('pointerdown', (e) => { if (openMenu && !openMenu.contains(e.target)) closeMenu(); }, true);

function toast(avatarId, text, onClick) {
  const t = h('button', { class: 'toast', type: 'button', onclick: () => { t.remove(); if (onClick) onClick(); } },
    avatarEl(avatarId, 34), h('span', { class: 't' }, text));
  const box = document.getElementById('toasts');
  box.append(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => t.remove(), 6000);
}

function avatarEl(id, size = 48) {
  const [emoji, color] = AVATARS[id] || AVATARS[0];
  return h('span', { class: 'avatar', 'aria-hidden': 'true', style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.58) + 'px', background: color } }, emoji);
}
const dot = (c) => h('span', { class: `dot ${c.blocked ? 'blocked' : 'st-' + c.status}`, title: c.blocked ? 'Blocked' : STATUS[c.status] });

// ---------- network ----------
async function api(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
  return j;
}
const wsSend = (obj) => { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(obj)); };

function connect(status) {
  S.intentionalClose = false;
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  S.ws = ws;
  ws.onopen = () => ws.send(JSON.stringify({ t: 'auth', token: S.token, status }));
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (ON[m.t]) ON[m.t](m);
  };
  ws.onclose = () => {
    if (S.ws !== ws || S.intentionalClose) return;
    if (!S.signedIn && S.retry >= 3) return showSignIn("We couldn't reach the Ping! service. Please try again.");
    S.connLost = true;
    for (const c of S.contacts.values()) c.status = 'offline';
    if (S.signedIn) { renderMain(); for (const chat of S.chats.values()) chat.refresh(); }
    setTimeout(() => { if (S.ws === ws && S.token) connect(); }, Math.min(15000, 1000 * 2 ** S.retry++));
  };
}

function forgetToken() {
  S.token = null;
  store.del('token');
  try { sessionStorage.removeItem('ping.token'); } catch { /* ignore */ }
}
function signOut() {
  api('/api/logout', { token: S.token }).catch(() => {});
  forgetToken();
  S.intentionalClose = true; S.signedIn = false;
  if (S.ws) S.ws.close();
  for (const chat of [...S.chats.values()]) chat.win.close();
  for (const id of ['add', 'options']) if (WM.wins.has(id)) WM.wins.get(id).close();
  S.contacts.clear(); S.requests.clear(); S.me = null;
  showSignIn();
}

// ---------- server events ----------
const ON = {
  auth_failed() { forgetToken(); S.intentionalClose = true; S.signedIn = false; showSignIn('Your session has expired. Please sign in again.'); },
  init(m) {
    const firstTime = !S.signedIn;
    S.me = m.me; S.signedIn = true; S.retry = 0; S.connLost = false;
    S.contacts = new Map(m.contacts.map((c) => [c.id, c]));
    S.requests = new Map(m.requests.map((r) => [r.id, r]));
    renderMain();
    for (const chat of S.chats.values()) { chat.refresh(); wsSend({ t: 'history', with: chat.id }); }
    if (firstTime) {
      play('online');
      for (const c of m.contacts.filter((x) => x.unread).slice(0, 3)) {
        toast(c.avatar, `${c.displayName} sent you ${c.unread} message${c.unread > 1 ? 's' : ''} while you were away.`, () => openChat(c.id));
      }
    }
  },
  me(m) { S.me = m.me; renderMain(); },
  presence(m) {
    const c = S.contacts.get(m.user.id);
    if (!c) return;
    const was = c.status;
    Object.assign(c, m.user);
    if (was === 'offline' && c.status !== 'offline') {
      play('online');
      toast(c.avatar, `${c.displayName} has just signed in.`, () => openChat(c.id));
    }
    renderMain();
    if (S.chats.has(c.id)) S.chats.get(c.id).refresh();
  },
  contact(m) {
    const old = S.contacts.get(m.user.id);
    if (!old && S.notice && !S.notice.warn) S.notice = null; // the "request sent" note is now moot
    S.contacts.set(m.user.id, { ...m.user, unread: m.user.unread ?? (old ? old.unread : 0) });
    renderMain();
    if (S.chats.has(m.user.id)) S.chats.get(m.user.id).refresh();
  },
  contact_removed(m) {
    S.contacts.delete(m.userId);
    if (S.chats.has(m.userId)) S.chats.get(m.userId).win.close();
    renderMain();
  },
  request(m) { S.requests.set(m.user.id, m.user); play('message'); renderMain(); const w = WM.wins.get('main'); if (WM.active !== w) w.flash(true); },
  request_done(m) { S.requests.delete(m.userId); renderMain(); },
  notice(m) { S.notice = { text: m.text }; renderMain(); },
  error(m) {
    if (m.to && S.chats.has(m.to)) return S.chats.get(m.to).system(m.text);
    S.notice = { text: m.text, warn: true }; renderMain();
    const w = WM.wins.get('add'); if (w && w.showError) w.showError(m.text);
  },
  typing(m) { if (S.chats.has(m.from)) S.chats.get(m.from).typing(); },
  history(m) { if (S.chats.has(m.with)) S.chats.get(m.with).history(m); },
  message(m) {
    const msg = m.msg, mine = msg.from === S.me.id, otherId = mine ? msg.to : msg.from;
    const c = S.contacts.get(otherId);
    if (!c) return;
    const existed = S.chats.has(otherId);
    const chat = openChat(otherId, { focus: false });
    if (existed || !msg.id) chat.add(msg); // a freshly opened window loads this message with its history
    if (mine) return;
    const looking = WM.active === chat.win && document.hasFocus();
    if (msg.kind === 'nudge') { focusWindow(chat.win); chat.shake(); play('nudge'); }
    else if (!looking) play('message');
    if (looking || msg.kind === 'nudge') { wsSend({ t: 'read', with: otherId }); }
    else {
      c.unread = (c.unread || 0) + 1;
      chat.win.flash(true);
      if (!existed) toast(c.avatar, `${c.displayName} says:\n${msg.body.slice(0, 80)}`, () => focusWindow(chat.win));
      renderMain();
    }
    updateTitle();
  },
};

function updateTitle() {
  let n = 0;
  for (const c of S.contacts.values()) n += c.unread || 0;
  document.title = n ? `(${n}) New message! - Ping! Messenger` : 'Ping! Messenger';
}

// ---------- main window: sign in ----------
function mainWin() {
  return openWindow({ id: 'main', title: 'Ping! Messenger', w: 300, ht: 560, body: h('div') });
}
// Re-rendering must never steal focus from a conversation, so don't go through openWindow here.
function setMain(...nodes) { (WM.wins.get('main') || mainWin()).body.replaceChildren(...clean(nodes)); }
const logo = () => h('div', { class: 'logo' }, h('img', { src: 'favicon.svg', width: 64, height: 64, alt: '' }),
  h('b', null, 'Ping', h('i', null, '!'), ' Messenger'), h('small', null, 'chat like it’s 2003'));

function showSignIn(error, registering = false) {
  const err = h('div', { class: 'err', role: 'alert', hidden: !error }, error || '');
  const handle = h('input', { type: 'text', name: 'handle', required: true, autocomplete: 'username', autocapitalize: 'none', spellcheck: false, maxLength: 40, value: store.get('lastHandle', '') });
  const pass = h('input', { type: 'password', name: 'password', required: true, autocomplete: registering ? 'new-password' : 'current-password', maxLength: 200 });
  const name = h('input', { type: 'text', name: 'displayName', maxLength: 60, placeholder: 'e.g. ~*Sk8er_Kid*~' });
  const status = h('select', null, ['online', 'busy', 'brb', 'away', 'phone', 'lunch', 'invisible'].map((s) => h('option', { value: s }, STATUS[s])));
  const remember = h('input', { type: 'checkbox', checked: true });
  const go = h('button', { class: 'btn', type: 'submit' }, registering ? 'Create account' : 'Sign In');
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      go.disabled = true; err.hidden = true;
      try {
        const { token } = await api(registering ? '/api/register' : '/api/login',
          { handle: handle.value, password: pass.value, displayName: name.value });
        S.token = token;
        store.set('lastHandle', handle.value.trim());
        if (remember.checked) store.set('token', token);
        else try { sessionStorage.setItem('ping.token', token); } catch { /* ignore */ }
        showSigningIn();
        connect(status.value);
      } catch (ex) { err.textContent = ex.message; err.hidden = false; go.disabled = false; }
    },
  },
    err,
    h('label', null, 'Sign-in name:', handle),
    registering && h('label', null, 'Display name (what your friends see):', name),
    h('label', null, 'Password:', pass),
    h('label', null, 'Sign in as:', status),
    h('label', { class: 'row' }, remember, 'Remember me on this computer'),
    go);
  setMain(h('div', { class: 'signin' }, logo(), form, h('hr', { class: 'sep' }),
    registering
      ? h('button', { class: 'link', type: 'button', onclick: () => showSignIn() }, 'I already have an account')
      : h('button', { class: 'link', type: 'button', onclick: () => showSignIn(null, true) }, 'Get a new account')));
  if (!isPhone()) (handle.value ? pass : handle).focus();
}
function showSigningIn() {
  setMain(h('div', { class: 'signin' }, logo(), h('div', { class: 'dots' }, h('i'), h('i'), h('i')), h('div', null, 'Signing in...'),
    h('button', { class: 'btn', type: 'button', onclick: signOut }, 'Cancel')));
}

// ---------- main window: contact list ----------
function renderMain() {
  if (!S.signedIn || !S.me) return;
  const me = S.me;
  const active = document.activeElement;
  const pmFocused = active && active.classList && active.classList.contains('pm');
  if (pmFocused) return void (S.rerender = true); // don't yank the field away mid-typing

  const statusSel = h('select', { 'aria-label': 'My status', onchange: (e) => wsSend({ t: 'status', status: e.target.value }) },
    ['online', 'busy', 'brb', 'away', 'phone', 'lunch', 'invisible'].map((s) => h('option', { value: s, selected: s === me.status }, `(${STATUS[s]})`)));
  const pm = h('input', {
    class: 'pm', type: 'text', maxLength: 120, value: me.personalMessage, placeholder: '<Type a personal message>', 'aria-label': 'Personal message',
    onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.value = me.personalMessage; e.target.blur(); } },
    onblur: (e) => {
      const v = e.target.value.trim();
      if (v !== me.personalMessage) wsSend({ t: 'profile', displayName: me.displayName, personalMessage: v, avatar: me.avatar });
      if (S.rerender) { S.rerender = false; setTimeout(renderMain); }
    },
  });
  const av = avatarEl(me.avatar, 52);
  av.title = 'Change my display picture'; av.addEventListener('click', showOptions);

  const list = [...S.contacts.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  const groups = [['Online', list.filter((c) => c.status !== 'offline')], ['Offline', list.filter((c) => c.status === 'offline')]];

  setMain(
    h('div', { class: 'me' }, av, h('div', { class: 'who' },
      h('div', { class: 'name' }, h('b', { title: me.handle }, me.displayName), statusSel), pm)),
    h('div', { class: 'bar' },
      h('button', { type: 'button', onclick: showAddContact }, '➕ Add a contact'),
      h('button', { type: 'button', onclick: showOptions }, '⚙ Options'),
      h('button', { type: 'button', onclick: signOut }, 'Sign out')),
    S.connLost && h('div', { class: 'banner warn', role: 'status' }, 'Connection lost. Trying to reconnect...'),
    S.notice && h('div', { class: 'banner' + (S.notice.warn ? ' warn' : ''), role: 'status' }, S.notice.text,
      h('div', { class: 'acts' }, h('button', { class: 'link', type: 'button', onclick: () => { S.notice = null; renderMain(); } }, 'Dismiss'))),
    [...S.requests.values()].map((r) => h('div', { class: 'banner' },
      h('span', null, h('b', null, r.displayName), ` (${r.handle}) wants to add you to their contact list.`),
      h('div', { class: 'acts' },
        h('button', { class: 'btn', type: 'button', onclick: () => wsSend({ t: 'respond_request', userId: r.id, accept: true }) }, 'Allow'),
        h('button', { class: 'btn', type: 'button', onclick: () => wsSend({ t: 'respond_request', userId: r.id, accept: false }) }, 'Decline')))),
    h('div', { class: 'clist' }, groups.map(([label, items]) => [
      h('button', { class: 'group', type: 'button', 'aria-expanded': String(!S.collapsed[label]), onclick: () => { S.collapsed[label] = !S.collapsed[label]; renderMain(); } },
        `${S.collapsed[label] ? '▸' : '▾'} ${label} (${items.length})`),
      !S.collapsed[label] && (items.length ? items.map(contactRow)
        : h('div', { class: 'empty' }, label === 'Online' ? 'Nobody is online right now.' : 'Everyone is online!')),
    ])),
    h('div', { class: 'adbar' }, 'You’ve got friends! Add them with their sign-in name.'));
  updateTitle();
}

function contactMenu(c, x, y) {
  showMenu(x, y, [
    menuItem('Send an instant message', () => openChat(c.id)),
    menuItem(c.blocked ? 'Unblock' : 'Block', () => wsSend({ t: 'block', userId: c.id, blocked: !c.blocked })),
    menuItem('Delete contact', () => { if (confirm(`Remove ${c.displayName} from your contact list?`)) wsSend({ t: 'remove_contact', userId: c.id }); }),
  ]);
}
function contactRow(c) {
  let touch = false;
  return h('div', {
    class: 'contact' + (c.status === 'offline' ? ' off' : ''), tabIndex: 0, role: 'button',
    title: `${c.displayName} <${c.handle}> (${c.blocked ? 'Blocked' : STATUS[c.status]})\nDouble-click to send a message`,
    onpointerdown: (e) => { touch = e.pointerType !== 'mouse'; },
    onclick: (e) => { if (touch && !e.target.closest('.more')) openChat(c.id); },
    ondblclick: (e) => { if (!e.target.closest('.more')) openChat(c.id); },
    onkeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) openChat(c.id); },
    oncontextmenu: (e) => { e.preventDefault(); contactMenu(c, e.clientX, e.clientY); },
  },
    dot(c),
    h('span', { class: 'txt' }, c.displayName, c.personalMessage && h('small', null, ' - ' + c.personalMessage)),
    c.unread > 0 && h('span', { class: 'badge', title: 'Unread messages' }, String(c.unread)),
    h('button', { class: 'more', type: 'button', 'aria-label': `Actions for ${c.displayName}`, onclick: (e) => { const r = e.target.getBoundingClientRect(); contactMenu(c, r.left, r.bottom); } }, '⋯'));
}

// ---------- dialogs ----------
function showAddContact() {
  const err = h('div', { class: 'banner warn', hidden: true, role: 'alert' });
  const input = h('input', { type: 'text', required: true, maxLength: 40, autocapitalize: 'none', spellcheck: false });
  const win = openWindow({
    id: 'add', title: 'Add a Contact', w: 310, ht: 210,
    body: h('form', {
      class: 'dialog',
      onsubmit: (e) => {
        e.preventDefault();
        err.hidden = true; S.notice = null;
        wsSend({ t: 'add_contact', handle: input.value });
        // success closes the dialog via the notice/contact event; errors show inline
        setTimeout(() => { if (err.hidden && WM.wins.has('add')) win.close(); }, 600);
      },
    }, err,
      h('label', null, 'Type your friend’s sign-in name:', input),
      h('small', null, 'They’ll get a request, and show up in your list once they allow it.'),
      h('div', { class: 'acts' }, h('button', { class: 'btn', type: 'submit' }, 'Add'),
        h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Cancel'))),
  });
  win.showError = (t) => { err.textContent = t; err.hidden = false; S.notice = null; renderMain(); };
  input.focus();
}

function showOptions() {
  if (!S.me) return;
  let avatar = S.me.avatar;
  const name = h('input', { type: 'text', maxLength: 60, required: true, value: S.me.displayName });
  const pm = h('input', { type: 'text', maxLength: 120, value: S.me.personalMessage });
  const sound = h('input', { type: 'checkbox', checked: S.sound });
  const grid = h('div', { class: 'avgrid' }, AVATARS.map((_, i) => {
    const b = h('button', { type: 'button', 'aria-label': `Display picture ${i + 1}`, 'aria-pressed': String(i === avatar),
      onclick: () => { avatar = i; for (const x of grid.children) x.setAttribute('aria-pressed', String(x === b)); } }, avatarEl(i, 36));
    return b;
  }));
  const win = openWindow({
    id: 'options', title: 'Options', w: 330, ht: 370,
    body: h('form', {
      class: 'dialog',
      onsubmit: (e) => {
        e.preventDefault();
        wsSend({ t: 'profile', displayName: name.value, personalMessage: pm.value, avatar });
        setSound(sound.checked);
        win.close();
      },
    },
      h('label', null, 'Display name:', name),
      h('label', null, 'Personal message:', pm),
      h('div', null, 'Display picture:'), grid,
      h('label', { style: { flexDirection: 'row', alignItems: 'center', gap: '5px' } }, sound, 'Play sounds for messages, sign-ins and nudges'),
      h('div', { class: 'acts' }, h('button', { class: 'btn', type: 'submit' }, 'OK'),
        h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Cancel'))),
  });
}

// ---------- conversations ----------
function renderBody(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(h('a', { href: m[1], target: '_blank', rel: 'noopener noreferrer' }, m[1]));
    else out.push(h('span', { class: 'emo', title: m[0] }, EMO_MAP.get(m[0].toLowerCase())));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDate = (ts) => new Date(ts).toLocaleDateString([], { month: 'numeric', day: 'numeric', year: 'numeric' });

function openChat(userId, { focus = true } = {}) {
  if (S.chats.has(userId)) { const chat = S.chats.get(userId); if (focus) focusWindow(chat.win); return chat; }
  const contact = () => S.contacts.get(userId) || { displayName: 'Unknown', handle: '?', status: 'offline', avatar: 0 };
  let msgs = [], more = false, typingTimer = null, lastTypingSent = 0, lastFrom = null;

  const to = h('div', { class: 'to' });
  const log = h('div', { class: 'log', role: 'log', 'aria-live': 'polite', tabIndex: 0 });
  const statusline = h('div', { class: 'statusline' });
  const input = h('textarea', { maxLength: 2000, 'aria-label': 'Type a message' });
  const theirPic = h('div'), myPic = h('div');
  const applyFont = () => { Object.assign(input.style, { color: S.font.color, fontWeight: S.font.bold ? 'bold' : 'normal', fontStyle: S.font.italic ? 'italic' : 'normal' }); store.set('font', S.font); };
  const boldBtn = h('button', { type: 'button', title: 'Bold', 'aria-pressed': String(S.font.bold), onclick: () => { S.font.bold = !S.font.bold; boldBtn.setAttribute('aria-pressed', String(S.font.bold)); applyFont(); } }, h('b', null, 'B'));
  const italBtn = h('button', { type: 'button', title: 'Italic', 'aria-pressed': String(S.font.italic), onclick: () => { S.font.italic = !S.font.italic; italBtn.setAttribute('aria-pressed', String(S.font.italic)); applyFont(); } }, h('i', null, 'I'));

  const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  const scrollDown = () => { log.scrollTop = log.scrollHeight; };

  function line(msg) {
    const mine = msg.from === S.me.id, c = contact();
    if (msg.kind === 'nudge') {
      lastFrom = null;
      return [h('div', { class: 'sys', title: `${fmtDate(msg.ts)} ${fmtTime(msg.ts)}` }, mine ? 'You have just sent a nudge.' : `${c.displayName} has just sent you a nudge.`)];
    }
    const nodes = [];
    if (lastFrom !== msg.from) nodes.push(h('div', { class: 'hdr' }, `${mine ? S.me.displayName : c.displayName} says:`));
    lastFrom = msg.from;
    const st = msg.style || {};
    nodes.push(h('div', { class: 'body', title: `${fmtDate(msg.ts)} ${fmtTime(msg.ts)}`,
      style: { color: st.color || '#000', fontWeight: st.bold ? 'bold' : 'normal', fontStyle: st.italic ? 'italic' : 'normal' } }, renderBody(msg.body)));
    return nodes;
  }
  function renderLog() {
    lastFrom = null;
    log.replaceChildren(...clean([
      more && h('button', { class: 'link older', type: 'button', onclick: () => msgs.length && wsSend({ t: 'history', with: userId, before: msgs[0].id }) }, 'Show earlier messages'),
      msgs.map(line)]));
  }
  function setLastReceived() {
    const last = [...msgs].reverse().find((m) => m.from === userId);
    statusline.textContent = last ? `Last message received at ${fmtTime(last.ts)} on ${fmtDate(last.ts)}.` : '';
  }
  function sendMessage() {
    const body = input.value.replace(/\s+$/, '');
    if (!body.trim()) return;
    if (!S.ws || S.ws.readyState !== 1) return chat.system('You are not connected right now. Your message was not sent.');
    wsSend({ t: 'message', to: userId, body, style: S.font });
    input.value = ''; input.focus();
  }

  const chat = {
    id: userId,
    refresh() {
      const c = contact();
      chat.win.setTitle(`${c.displayName} - Conversation`);
      to.replaceChildren('To: ', h('b', null, c.displayName), h('small', null, ` <${c.handle}>${c.personalMessage ? ' - ' + c.personalMessage : ''}`));
      theirPic.replaceChildren(avatarEl(c.avatar, 80));
      myPic.replaceChildren(avatarEl(S.me.avatar, 80));
      notice.hidden = !(c.status === 'offline' || c.blocked);
      notice.textContent = c.blocked ? `You have blocked ${c.displayName}.`
        : `${c.displayName} appears to be offline. Messages you send will be delivered when they sign in.`;
    },
    add(msg) {
      const stick = atBottom() || msg.from === S.me.id;
      msgs.push(msg);
      log.append(...line(msg));
      if (stick) scrollDown();
      if (msg.from === userId) { clearTimeout(typingTimer); setLastReceived(); }
    },
    system(text) { lastFrom = null; log.append(h('div', { class: 'sys' }, text)); scrollDown(); },
    history(m) {
      const byId = new Map();
      for (const x of [...m.messages, ...msgs]) byId.set(x.id || `l${x.ts}`, x);
      msgs = [...byId.values()].sort((a, b) => a.ts - b.ts || (a.id || 0) - (b.id || 0));
      more = m.more;
      const prevHeight = log.scrollHeight, prevTop = log.scrollTop;
      renderLog();
      if (m.paged) log.scrollTop = log.scrollHeight - prevHeight + prevTop; else scrollDown();
      setLastReceived();
    },
    typing() {
      statusline.textContent = `${contact().displayName} is typing a message...`;
      clearTimeout(typingTimer);
      typingTimer = setTimeout(setLastReceived, 4000);
    },
    shake() {
      chat.win.el.classList.remove('shake');
      void chat.win.el.offsetWidth; // restart the animation
      chat.win.el.classList.add('shake');
      setTimeout(() => chat.win.el.classList.remove('shake'), 700);
    },
  };

  const notice = h('div', { class: 'banner', hidden: true });
  const toolbar = h('div', { class: 'bar' },
    h('button', { type: 'button', title: 'Emoticons', onclick: (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      showMenu(r.left, r.bottom, EMOTICONS.map(([code, emoji]) => h('button', { type: 'button', title: code, 'aria-label': code, onclick: () => {
        const s = input.selectionStart ?? input.value.length;
        input.setRangeText(code + ' ', s, input.selectionEnd ?? s, 'end'); input.focus();
      } }, emoji)), 'grid');
    } }, '🙂 Emoticons'),
    h('button', { type: 'button', title: 'Send a nudge', onclick: () => wsSend({ t: 'nudge', to: userId }) }, '📳 Nudge'),
    h('button', { type: 'button', title: 'Font colour', onclick: (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      showMenu(r.left, r.bottom, COLORS.map((col) => h('button', { type: 'button', 'aria-label': `Colour ${col}`, onclick: () => { S.font.color = col; applyFont(); input.focus(); } },
        h('span', { class: 'sw', style: { display: 'block', background: col } }))), 'grid');
    } }, '🎨 Colour'),
    boldBtn, italBtn);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendMessage(); }
  });
  input.addEventListener('input', () => {
    if (Date.now() - lastTypingSent > 2500 && input.value) { lastTypingSent = Date.now(); wsSend({ t: 'typing', to: userId }); }
  });

  chat.win = openWindow({
    id: 'chat' + userId, title: 'Conversation', w: 500, ht: 430, focus,
    body: [to, notice, h('div', { class: 'chatmain' },
      h('div', { class: 'chatcol' }, log, statusline,
        h('div', { class: 'compose' }, toolbar,
          h('div', { class: 'row' }, input, h('button', { class: 'btn', type: 'button', onclick: sendMessage }, 'Send')))),
      h('div', { class: 'pics' }, theirPic, myPic))],
    onClose: () => { S.chats.delete(userId); clearTimeout(typingTimer); },
    onFocus: () => {
      const c = S.contacts.get(userId);
      if (c && c.unread) { c.unread = 0; wsSend({ t: 'read', with: userId }); renderMain(); }
      scrollDown();
      if (!isPhone()) input.focus();
    },
  });
  S.chats.set(userId, chat);
  applyFont();
  chat.refresh();
  wsSend({ t: 'history', with: userId });
  return chat;
}

// ---------- tray ----------
const muteBtn = document.getElementById('mute');
function setSound(on) { S.sound = on; store.set('sound', on); muteBtn.textContent = on ? '🔊' : '🔇'; muteBtn.setAttribute('aria-pressed', String(!on)); }
muteBtn.addEventListener('click', () => setSound(!S.sound));
setSound(S.sound);
const clock = document.getElementById('clock');
const tick = () => { clock.textContent = fmtTime(Date.now()); };
tick(); setInterval(tick, 15000);
window.addEventListener('focus', () => { if (WM.active && WM.active.onFocus) WM.active.onFocus(); });

// ---------- boot ----------
mainWin();
let saved = store.get('token', null);
if (!saved) { try { saved = sessionStorage.getItem('ping.token'); } catch { /* ignore */ } }
if (saved) { S.token = saved; showSigningIn(); connect(); } else showSignIn();
