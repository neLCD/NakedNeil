'use strict';
// SQLite persistence (Node's built-in node:sqlite, no native build step).
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      handle TEXT NOT NULL UNIQUE,
      pass TEXT NOT NULL,
      display_name TEXT NOT NULL,
      personal_message TEXT NOT NULL DEFAULT '',
      avatar INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'online',
      is_bot INTEGER NOT NULL DEFAULT 0,
      created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created INTEGER NOT NULL
    );
    -- a = requester, b = recipient
    CREATE TABLE IF NOT EXISTS friendships (
      a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      state TEXT NOT NULL,
      PRIMARY KEY (a, b)
    );
    CREATE TABLE IF NOT EXISTS blocks (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, target_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id INTEGER NOT NULL,
      to_id INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'text',
      body TEXT NOT NULL,
      style TEXT,
      ts INTEGER NOT NULL,
      read INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(from_id, to_id, id);
    CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(to_id, read);
  `);

  const q = (sql) => db.prepare(sql);
  const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

  const s = {
    insertUser: q('INSERT INTO users (handle, pass, display_name, is_bot, created) VALUES (?, ?, ?, ?, ?)'),
    userByHandle: q('SELECT * FROM users WHERE handle = ?'),
    userById: q('SELECT * FROM users WHERE id = ?'),
    updateProfile: q('UPDATE users SET display_name = ?, personal_message = ?, avatar = ? WHERE id = ?'),
    setStatus: q('UPDATE users SET status = ? WHERE id = ?'),
    insertSession: q('INSERT INTO sessions (token_hash, user_id, created) VALUES (?, ?, ?)'),
    sessionUser: q('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.created > ?'),
    deleteSession: q('DELETE FROM sessions WHERE token_hash = ?'),
    pruneSessions: q('DELETE FROM sessions WHERE created <= ?'),
    friendship: q('SELECT * FROM friendships WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)'),
    insertFriendship: q('INSERT INTO friendships (a, b, state) VALUES (?, ?, ?)'),
    acceptFriendship: q("UPDATE friendships SET state = 'accepted' WHERE a = ? AND b = ?"),
    deleteFriendship: q('DELETE FROM friendships WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)'),
    friendsOf: q(`SELECT u.* FROM friendships f
                  JOIN users u ON u.id = CASE WHEN f.a = ? THEN f.b ELSE f.a END
                  WHERE (f.a = ? OR f.b = ?) AND f.state = 'accepted'`),
    pendingFor: q("SELECT u.* FROM friendships f JOIN users u ON u.id = f.a WHERE f.b = ? AND f.state = 'pending'"),
    addBlock: q('INSERT OR IGNORE INTO blocks (user_id, target_id) VALUES (?, ?)'),
    removeBlock: q('DELETE FROM blocks WHERE user_id = ? AND target_id = ?'),
    isBlocked: q('SELECT 1 FROM blocks WHERE user_id = ? AND target_id = ?'),
    insertMessage: q('INSERT INTO messages (from_id, to_id, kind, body, style, ts, read) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    history: q(`SELECT * FROM messages
                WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)) AND id < ?
                ORDER BY id DESC LIMIT ?`),
    unread: q('SELECT from_id, COUNT(*) AS n FROM messages WHERE to_id = ? AND read = 0 GROUP BY from_id'),
    markRead: q('UPDATE messages SET read = 1 WHERE to_id = ? AND from_id = ? AND read = 0'),
  };

  return {
    close: () => db.close(),

    createUser(handle, pass, displayName, isBot = false) {
      const r = s.insertUser.run(handle, pass, displayName, isBot ? 1 : 0, Date.now());
      return Number(r.lastInsertRowid);
    },
    userByHandle: (handle) => s.userByHandle.get(handle),
    userById: (id) => s.userById.get(id),
    updateProfile: (id, p) => s.updateProfile.run(p.displayName, p.personalMessage, p.avatar, id),
    setStatus: (id, status) => s.setStatus.run(status, id),

    createSession(userId) {
      const token = crypto.randomBytes(32).toString('base64url');
      s.pruneSessions.run(Date.now() - SESSION_TTL_MS);
      s.insertSession.run(hashToken(token), userId, Date.now());
      return token;
    },
    userBySession(token) {
      if (typeof token !== 'string' || !token) return undefined;
      return s.sessionUser.get(hashToken(token), Date.now() - SESSION_TTL_MS);
    },
    deleteSession: (token) => s.deleteSession.run(hashToken(String(token))),

    friendship: (x, y) => s.friendship.get(x, y, y, x),
    areFriends(x, y) {
      const f = s.friendship.get(x, y, y, x);
      return !!f && f.state === 'accepted';
    },
    requestFriend: (from, to, state = 'pending') => s.insertFriendship.run(from, to, state),
    acceptFriend: (from, to) => s.acceptFriendship.run(from, to),
    removeFriend: (x, y) => s.deleteFriendship.run(x, y, y, x),
    friendsOf: (id) => s.friendsOf.all(id, id, id),
    pendingFor: (id) => s.pendingFor.all(id),

    /** Does `userId` block `targetId`? */
    isBlocked: (userId, targetId) => !!s.isBlocked.get(userId, targetId),
    setBlock: (userId, targetId, on) => (on ? s.addBlock : s.removeBlock).run(userId, targetId),

    addMessage({ from, to, kind = 'text', body, style = null, read = false }) {
      const ts = Date.now();
      const r = s.insertMessage.run(from, to, kind, body, style ? JSON.stringify(style) : null, ts, read ? 1 : 0);
      return { id: Number(r.lastInsertRowid), from, to, kind, body, style, ts };
    },
    history(x, y, before, limit) {
      return s.history
        .all(x, y, y, x, before || Number.MAX_SAFE_INTEGER, limit)
        .reverse()
        .map((m) => ({
          id: m.id, from: m.from_id, to: m.to_id, kind: m.kind, body: m.body,
          style: m.style ? JSON.parse(m.style) : null, ts: m.ts,
        }));
    },
    unreadCounts(userId) {
      const out = {};
      for (const r of s.unread.all(userId)) out[r.from_id] = r.n;
      return out;
    },
    markRead: (userId, fromId) => s.markRead.run(userId, fromId),
  };
}

module.exports = { openDb };
