import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { db, audit } from './db.js';

const SESSION_TTL = 1000 * 60 * 60 * 24 * 30;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, SCRYPT.keylen, SCRYPT).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, salt, expected) {
  const actual = scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  const target = Buffer.from(expected, 'hex');
  if (target.length !== actual.length) return false;
  return timingSafeEqual(actual, target);
}

export function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(userId, agent, ip) {
  const token = randomBytes(32).toString('base64url');
  const id = randomBytes(9).toString('base64url');
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, agent, ip, created_at, last_seen, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, tokenHash(token), String(agent || '').slice(0, 200), String(ip || '').slice(0, 60), now, now, now + SESSION_TTL);
  audit(userId, 'session.create', { id });
  return { token, id };
}

export function resolveSession(token) {
  if (!token) return null;
  const row = db.prepare(
    `SELECT s.id AS sid, s.expires_at, u.* FROM sessions s
     JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`
  ).get(tokenHash(token));
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.sid);
    return null;
  }
  const now = Date.now();
  db.prepare('UPDATE sessions SET last_seen = ? WHERE id = ?').run(now, row.sid);
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(now, row.id);
  return row;
}

export function dropSession(userId, sessionId) {
  db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(sessionId, userId);
}
