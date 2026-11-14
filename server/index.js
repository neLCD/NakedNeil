'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { WebSocketServer } = require('ws');
const { openDb } = require('./db');
const bot = require('./bot');

const scrypt = promisify(crypto.scrypt);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.json': 'application/json',
};
const STATUSES = new Set(['online', 'busy', 'brb', 'away', 'phone', 'lunch', 'invisible']);
const AVATAR_COUNT = 12;
const HANDLE_RE = /^[a-z0-9][a-z0-9._@-]{2,39}$/;
const MAX_MESSAGE = 2000;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const hash = await scrypt(password, Buffer.from(saltHex, 'hex'), 64);
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}

/** Sliding-window limiter: allow `max` hits per `windowMs` per key. */
function makeLimiter(max, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) { hits.set(key, list); return false; }
    list.push(now);
    hits.set(key, list);
    if (hits.size > 10000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    return true;
  };
}

function createApp({ dbFile, botDelay = 1 } = {}) {
  const store = openDb(dbFile);
  const authLimiter = makeLimiter(30, 10 * 60 * 1000);
  const online = new Map(); // userId -> Set<ws>
  const lastNudge = new Map(); // "from:to" -> ts
  const timers = new Set();

  let botUser = store.userByHandle(bot.BOT_HANDLE);
  if (!botUser) {
    store.createUser(bot.BOT_HANDLE, '!', bot.BOT_NAME, true);
    botUser = store.userByHandle(bot.BOT_HANDLE);
    store.updateProfile(botUser.id, { displayName: bot.BOT_NAME, personalMessage: 'beep boop. always online (8)', avatar: 5 });
  }
  const botId = botUser.id;

  const later = (ms, fn) => {
    const t = setTimeout(() => { timers.delete(t); fn(); }, ms * botDelay);
    timers.add(t);
  };

  // ---------- helpers ----------
  const send = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };
  const sendUser = (userId, obj) => { const set = online.get(userId); if (set) for (const ws of set) send(ws, obj); };

  function visibleStatus(user, viewerId) {
    if (user.is_bot) return 'online';
    if (!online.has(user.id) || user.status === 'invisible') return 'offline';
    if (store.isBlocked(user.id, viewerId)) return 'offline';
    return user.status;
  }
  const selfView = (u) => ({
    id: u.id, handle: u.handle, displayName: u.display_name,
    personalMessage: u.personal_message, avatar: u.avatar, status: u.status,
  });
  const contactView = (u, viewerId) => ({
    id: u.id, handle: u.handle, displayName: u.display_name,
    personalMessage: u.personal_message, avatar: u.avatar,
    status: visibleStatus(u, viewerId), blocked: store.isBlocked(viewerId, u.id),
  });
  function broadcastPresence(userId) {
    const u = store.userById(userId);
    for (const f of store.friendsOf(userId)) {
      if (online.has(f.id)) sendUser(f.id, { t: 'presence', user: contactView(u, f.id) });
    }
  }
  function sendInit(ws, userId) {
    const me = store.userById(userId);
    const unread = store.unreadCounts(userId);
    send(ws, {
      t: 'init',
      me: selfView(me),
      contacts: store.friendsOf(userId).map((u) => ({ ...contactView(u, userId), unread: unread[u.id] || 0 })),
      requests: store.pendingFor(userId).map((u) => ({ id: u.id, handle: u.handle, displayName: u.display_name, avatar: u.avatar })),
    });
  }
  const cleanText = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').slice(0, max) : '');
  function cleanStyle(st) {
    if (!st || typeof st !== 'object') return null;
    return {
      color: typeof st.color === 'string' && /^#[0-9a-f]{6}$/i.test(st.color) ? st.color : '#000000',
      bold: !!st.bold, italic: !!st.italic,
    };
  }

  function botSay(userId, body, kind = 'text') {
    const msg = store.addMessage({ from: botId, to: userId, kind, body });
    sendUser(userId, { t: 'message', msg });
  }
  function botRespond(userId, text, isNudge) {
    later(500, () => sendUser(userId, { t: 'typing', from: botId }));
    later(1400 + Math.random() * 900, () => {
      if (isNudge) botSay(userId, '', 'nudge');
      botSay(userId, isNudge ? bot.nudgeReply() : bot.botReply(text));
    });
  }

  // ---------- websocket message handlers ----------
  const handlers = {
    status(ws, m) {
      if (!STATUSES.has(m.status)) return;
      store.setStatus(ws.userId, m.status);
      sendUser(ws.userId, { t: 'me', me: selfView(store.userById(ws.userId)) });
      broadcastPresence(ws.userId);
    },
    profile(ws, m) {
      const me = store.userById(ws.userId);
      const displayName = cleanText(m.displayName, 60).trim() || me.display_name;
      const personalMessage = cleanText(m.personalMessage, 120).trim();
      const avatar = Number.isInteger(m.avatar) && m.avatar >= 0 && m.avatar < AVATAR_COUNT ? m.avatar : me.avatar;
      store.updateProfile(ws.userId, { displayName, personalMessage, avatar });
      sendUser(ws.userId, { t: 'me', me: selfView(store.userById(ws.userId)) });
      broadcastPresence(ws.userId);
    },
    add_contact(ws, m) {
      const handle = cleanText(m.handle, 40).trim().toLowerCase();
      const target = store.userByHandle(handle);
      const fail = (text) => send(ws, { t: 'error', text });
      if (!target) return fail(`We couldn't find anyone with the sign-in name "${handle}".`);
      if (target.id === ws.userId) return fail("You can't add yourself. Nice try though :P");
      const f = store.friendship(ws.userId, target.id);
      const me = store.userById(ws.userId);
      if (f && f.state === 'accepted') return fail(`${target.display_name} is already in your contact list.`);
      if (f && f.a === ws.userId) return fail(`You've already sent a request to ${target.display_name}.`);
      if (f || target.is_bot) {
        // They already asked us (or it's the bot): becoming contacts right away.
        if (f) store.acceptFriend(target.id, ws.userId); else store.requestFriend(ws.userId, target.id, 'accepted');
        sendUser(ws.userId, { t: 'request_done', userId: target.id });
        sendUser(ws.userId, { t: 'contact', user: { ...contactView(target, ws.userId), unread: 0 } });
        sendUser(target.id, { t: 'contact', user: { ...contactView(me, target.id), unread: 0 } });
        return;
      }
      if (!store.isBlocked(target.id, ws.userId)) {
        store.requestFriend(ws.userId, target.id);
        sendUser(target.id, { t: 'request', user: { id: me.id, handle: me.handle, displayName: me.display_name, avatar: me.avatar } });
      }
      send(ws, { t: 'notice', text: `Request sent! ${target.display_name} will appear in your list once they accept.` });
    },
    respond_request(ws, m) {
      const f = store.friendship(ws.userId, m.userId);
      if (!f || f.state !== 'pending' || f.b !== ws.userId) return;
      sendUser(ws.userId, { t: 'request_done', userId: f.a });
      if (!m.accept) return void store.removeFriend(ws.userId, f.a);
      store.acceptFriend(f.a, ws.userId);
      const me = store.userById(ws.userId);
      const other = store.userById(f.a);
      sendUser(ws.userId, { t: 'contact', user: { ...contactView(other, ws.userId), unread: 0 } });
      sendUser(other.id, { t: 'contact', user: { ...contactView(me, other.id), unread: 0 } });
    },
    remove_contact(ws, m) {
      if (!store.areFriends(ws.userId, m.userId)) return;
      store.removeFriend(ws.userId, m.userId);
      store.setBlock(ws.userId, m.userId, false);
      sendUser(ws.userId, { t: 'contact_removed', userId: m.userId });
      sendUser(m.userId, { t: 'contact_removed', userId: ws.userId });
    },
    block(ws, m) {
      if (!store.areFriends(ws.userId, m.userId)) return;
      store.setBlock(ws.userId, m.userId, !!m.blocked);
      const other = store.userById(m.userId);
      sendUser(ws.userId, { t: 'contact', user: contactView(other, ws.userId) });
      sendUser(other.id, { t: 'presence', user: contactView(store.userById(ws.userId), other.id) });
    },
    message(ws, m) {
      const body = cleanText(m.body, MAX_MESSAGE);
      if (!body.trim() || !store.areFriends(ws.userId, m.to)) return;
      const style = cleanStyle(m.style);
      if (store.isBlocked(m.to, ws.userId)) {
        // Blocked senders are not told; the message just never arrives.
        return send(ws, { t: 'message', msg: { id: 0, from: ws.userId, to: m.to, kind: 'text', body, style, ts: Date.now() } });
      }
      const msg = store.addMessage({ from: ws.userId, to: m.to, body, style, read: m.to === botId });
      sendUser(ws.userId, { t: 'message', msg });
      sendUser(m.to, { t: 'message', msg });
      if (m.to === botId) botRespond(ws.userId, body, false);
    },
    nudge(ws, m) {
      if (!store.areFriends(ws.userId, m.to)) return;
      const key = `${ws.userId}:${m.to}`;
      if (Date.now() - (lastNudge.get(key) || 0) < 5000) {
        return send(ws, { t: 'error', text: 'You may not send a nudge that often. Give it a few seconds.', to: m.to });
      }
      lastNudge.set(key, Date.now());
      if (store.isBlocked(m.to, ws.userId)) {
        return send(ws, { t: 'message', msg: { id: 0, from: ws.userId, to: m.to, kind: 'nudge', body: '', style: null, ts: Date.now() } });
      }
      const msg = store.addMessage({ from: ws.userId, to: m.to, kind: 'nudge', body: '', read: m.to === botId });
      sendUser(ws.userId, { t: 'message', msg });
      sendUser(m.to, { t: 'message', msg });
      if (m.to === botId) botRespond(ws.userId, '', true);
    },
    typing(ws, m) {
      if (!online.has(m.to) || !store.areFriends(ws.userId, m.to) || store.isBlocked(m.to, ws.userId)) return;
      sendUser(m.to, { t: 'typing', from: ws.userId });
    },
    history(ws, m) {
      if (!Number.isInteger(m.with)) return;
      const before = Number.isInteger(m.before) ? m.before : 0;
      const messages = store.history(ws.userId, m.with, before, 51);
      const more = messages.length > 50;
      send(ws, { t: 'history', with: m.with, messages: more ? messages.slice(1) : messages, more, paged: !!before });
    },
    read(ws, m) {
      if (Number.isInteger(m.with)) store.markRead(ws.userId, m.with);
    },
  };

  // ---------- http ----------
  function json(res, code, obj) {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  }
  function readBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (c) => {
        data += c;
        if (data.length > 10000) { reject(new Error('too large')); req.destroy(); }
      });
      req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
      req.on('error', reject);
    });
  }

  async function handleApi(req, res, route) {
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Bad request.' }); }
    if (!body || typeof body !== 'object') return json(res, 400, { error: 'Bad request.' });

    if (route === '/api/logout') {
      if (body.token) store.deleteSession(body.token);
      return json(res, 200, { ok: true });
    }
    if (!authLimiter(req.socket.remoteAddress)) {
      return json(res, 429, { error: 'Too many attempts. Please wait a few minutes and try again.' });
    }
    const handle = typeof body.handle === 'string' ? body.handle.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (route === '/api/register') {
      if (!HANDLE_RE.test(handle)) {
        return json(res, 400, { error: 'Sign-in names are 3-40 characters: letters, numbers, and . _ - @' });
      }
      if (password.length < 6 || password.length > 200) {
        return json(res, 400, { error: 'Passwords need at least 6 characters.' });
      }
      if (store.userByHandle(handle)) return json(res, 409, { error: 'That sign-in name is already taken.' });
      const displayName = (typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 60) : '') || handle;
      let id;
      try { id = store.createUser(handle, await hashPassword(password), displayName); }
      catch { return json(res, 409, { error: 'That sign-in name is already taken.' }); }
      store.requestFriend(botId, id, 'accepted');
      store.addMessage({ from: botId, to: id, body: bot.WELCOME });
      return json(res, 200, { token: store.createSession(id) });
    }
    if (route === '/api/login') {
      const user = store.userByHandle(handle);
      const ok = user && !user.is_bot && (await verifyPassword(password, user.pass));
      if (!ok) return json(res, 401, { error: 'The sign-in name or password is incorrect.' });
      return json(res, 200, { token: store.createSession(user.id) });
    }
    return json(res, 404, { error: 'Not found.' });
  }

  function serveStatic(req, res, pathname) {
    let rel;
    try { rel = decodeURIComponent(pathname); } catch { res.writeHead(400); return res.end(); }
    if (rel === '/') rel = '/index.html';
    const file = path.join(PUBLIC_DIR, rel);
    if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; object-src 'none'; base-uri 'none'",
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  }

  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname.startsWith('/api/')) {
      if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
      return void handleApi(req, res, pathname).catch(() => json(res, 500, { error: 'Server error.' }));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    serveStatic(req, res, pathname);
  });

  // ---------- websocket ----------
  const wss = new WebSocketServer({
    server, path: '/ws', maxPayload: 16 * 1024,
    verifyClient: ({ req }) => {
      const origin = req.headers.origin;
      if (!origin) return true; // non-browser clients
      try { return new URL(origin).host === req.headers.host; } catch { return false; }
    },
  });

  wss.on('connection', (ws) => {
    ws.userId = null;
    ws.alive = true;
    const allow = makeLimiter(40, 10000);
    const authTimer = setTimeout(() => { if (!ws.userId) ws.close(4001, 'auth timeout'); }, 10000);

    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw.toString()); } catch { return; }
      if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;

      if (!ws.userId) {
        if (m.t !== 'auth') return;
        const user = store.userBySession(m.token);
        if (!user) { send(ws, { t: 'auth_failed' }); return ws.close(4003, 'bad token'); }
        clearTimeout(authTimer);
        ws.userId = user.id;
        if (STATUSES.has(m.status)) store.setStatus(user.id, m.status);
        const first = !online.has(user.id);
        if (first) online.set(user.id, new Set());
        online.get(user.id).add(ws);
        sendInit(ws, user.id);
        if (first || STATUSES.has(m.status)) broadcastPresence(user.id);
        return;
      }
      if (!allow('m')) return send(ws, { t: 'error', text: "Whoa, slow down! You're sending messages too quickly." });
      const fn = Object.hasOwn(handlers, m.t) ? handlers[m.t] : null;
      if (!fn) return;
      try { fn(ws, m); } catch (e) { console.error('handler error', m.t, e); }
    });
    ws.on('close', () => {
      clearTimeout(authTimer);
      if (!ws.userId) return;
      const set = online.get(ws.userId);
      if (!set) return;
      set.delete(ws);
      if (set.size === 0) { online.delete(ws.userId); broadcastPresence(ws.userId); }
    });
    ws.on('error', () => {});
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
    }
  }, 30000);

  return {
    server,
    close() {
      clearInterval(heartbeat);
      for (const t of timers) clearTimeout(t);
      for (const ws of wss.clients) ws.terminate();
      return new Promise((resolve) => wss.close(() => server.close(() => { store.close(); resolve(); })));
    },
  };
}

module.exports = { createApp };

if (require.main === module) {
  const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const port = Number(process.env.PORT) || 3000;
  const app = createApp({ dbFile: path.join(dataDir, 'ping.db') });
  app.server.listen(port, () => console.log(`Ping! Messenger is running at http://localhost:${port}`));
  const stop = () => app.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
