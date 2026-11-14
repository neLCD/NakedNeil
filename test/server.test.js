'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const WebSocket = require('ws');
const { createApp } = require('../server');

let app, base, dir;

test.before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ping-test-'));
  app = createApp({ dbFile: path.join(dir, 'test.db'), botDelay: 0.01 });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `127.0.0.1:${app.server.address().port}`;
});
test.after(async () => { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });

async function post(route, body) {
  const r = await fetch(`http://${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}

/** Connects and returns a client whose `next(type)` resolves with the next event of that type. */
async function client(token, status) {
  const ws = new WebSocket(`ws://${base}/ws`);
  const queue = [], waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    const i = waiters.findIndex((w) => w.pred(m));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(m); else queue.push(m);
  });
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  ws.send(JSON.stringify({ t: 'auth', token, status }));
  const c = {
    ws,
    send: (o) => ws.send(JSON.stringify(o)),
    next(t, extra = () => true) {
      const pred = (m) => m.t === t && extra(m);
      const i = queue.findIndex(pred);
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out waiting for "${t}"`)), 3000);
        waiters.push({ pred, resolve: (m) => { clearTimeout(timer); resolve(m); } });
      });
    },
  };
  c.init = await c.next('init');
  return c;
}

async function signup(handle) {
  const r = await post('/api/register', { handle, password: 'hunter22', displayName: handle.toUpperCase() });
  assert.equal(r.status, 200);
  return r.body.token;
}

test('registration validates input and rejects duplicates', async () => {
  assert.equal((await post('/api/register', { handle: 'x', password: 'hunter22' })).status, 400);
  assert.equal((await post('/api/register', { handle: 'shorty', password: '123' })).status, 400);
  await signup('dupe');
  assert.equal((await post('/api/register', { handle: 'DUPE', password: 'hunter22' })).status, 409);
});

test('login accepts the right password only, and bad tokens are refused', async () => {
  await signup('loginme');
  assert.equal((await post('/api/login', { handle: 'loginme', password: 'wrong-pass' })).status, 401);
  assert.equal((await post('/api/login', { handle: 'pixel', password: '!' })).status, 401);
  const ok = await post('/api/login', { handle: 'loginme', password: 'hunter22' });
  assert.equal(ok.status, 200);

  const ws = new WebSocket(`ws://${base}/ws`);
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ t: 'auth', token: 'nope' }));
  const first = await new Promise((r) => ws.on('message', (d) => r(JSON.parse(d))));
  assert.equal(first.t, 'auth_failed');
});

test('new accounts get the bot buddy with a welcome message, and it replies', async () => {
  const a = await client(await signup('botfan'));
  assert.equal(a.init.contacts.length, 1);
  const pixel = a.init.contacts[0];
  assert.equal(pixel.handle, 'pixel');
  assert.equal(pixel.status, 'online');
  assert.equal(pixel.unread, 1);

  a.send({ t: 'message', to: pixel.id, body: 'hello there' });
  const echo = await a.next('message');
  assert.equal(echo.msg.from, a.init.me.id);
  await a.next('typing');
  const reply = await a.next('message', (m) => m.msg.from === pixel.id);
  assert.ok(reply.msg.body.length > 0);
  a.ws.close();
});

test('contact requests, presence, messaging, offline delivery, nudges and blocking', async () => {
  const alice = await client(await signup('alice'));
  const bobToken = await signup('bob');
  let bob = await client(bobToken);
  const aliceId = alice.init.me.id, bobId = bob.init.me.id;

  // strangers cannot message each other
  alice.send({ t: 'message', to: bobId, body: 'spam' });

  alice.send({ t: 'add_contact', handle: 'nobody-here' });
  assert.match((await alice.next('error')).text, /couldn't find/);

  alice.send({ t: 'add_contact', handle: 'Bob' });
  await alice.next('notice');
  assert.equal((await bob.next('request')).user.handle, 'alice');
  bob.send({ t: 'respond_request', userId: aliceId, accept: true });
  assert.equal((await alice.next('contact')).user.status, 'online');
  assert.equal((await bob.next('contact')).user.id, aliceId);

  // live message with style
  alice.send({ t: 'message', to: bobId, body: 'hey bob :)', style: { color: '#c2185b', bold: true, italic: 'x', evil: '<script>' } });
  const got = await bob.next('message');
  assert.equal(got.msg.body, 'hey bob :)');
  assert.deepEqual(got.msg.style, { color: '#c2185b', bold: true, italic: true });

  // typing + nudge (rate limited)
  alice.send({ t: 'typing', to: bobId });
  assert.equal((await bob.next('typing')).from, aliceId);
  alice.send({ t: 'nudge', to: bobId });
  assert.equal((await bob.next('message')).msg.kind, 'nudge');
  alice.send({ t: 'nudge', to: bobId });
  assert.match((await alice.next('error')).text, /nudge/);

  // presence: status change, appear offline, sign out
  bob.send({ t: 'status', status: 'busy' });
  assert.equal((await alice.next('presence')).user.status, 'busy');
  bob.send({ t: 'status', status: 'invisible' });
  assert.equal((await alice.next('presence')).user.status, 'offline');
  bob.send({ t: 'read', with: aliceId });
  bob.ws.close();

  // offline delivery
  alice.send({ t: 'message', to: bobId, body: 'u there??' });
  await alice.next('message', (m) => m.msg.body === 'u there??');
  bob = await client(bobToken, 'online');
  assert.equal((await alice.next('presence', (m) => m.user.status === 'online')).user.id, bobId);
  assert.equal(bob.init.contacts.find((c) => c.id === aliceId).unread, 1);
  bob.send({ t: 'history', with: aliceId });
  const hist = await bob.next('history');
  assert.deepEqual(hist.messages.map((m) => m.body), ['hey bob :)', '', 'u there??']); // no "spam"

  // blocking: alice sees bob offline and bob stops receiving
  bob.send({ t: 'block', userId: aliceId, blocked: true });
  assert.equal((await bob.next('contact')).user.blocked, true);
  assert.equal((await alice.next('presence')).user.status, 'offline');
  alice.send({ t: 'message', to: bobId, body: 'hello???' });
  await alice.next('message', (m) => m.msg.body === 'hello???');
  bob.send({ t: 'history', with: aliceId });
  assert.equal((await bob.next('history')).messages.length, 3);

  // removing a contact removes it on both sides
  bob.send({ t: 'remove_contact', userId: aliceId });
  assert.equal((await alice.next('contact_removed')).userId, bobId);
  alice.ws.close(); bob.ws.close();
});

test('static files are served and path traversal is refused', async () => {
  const ok = await fetch(`http://${base}/`);
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /Ping! Messenger/);
  const bad = await fetch(`http://${base}/..%2fpackage.json`);
  assert.notEqual(bad.status, 200);
});
