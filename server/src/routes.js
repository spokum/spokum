import { db, audit } from './db.js';
import { hashPassword, verifyPassword, createSession, dropSession } from './auth.js';
import { HttpError, bad, str, int, oneOf, media, username, MOODS } from './util.js';
import { broadcast } from './realtime.js';

const BOOTSTRAP_ADMIN = (process.env.SPOKUM_ADMIN || 'vanya8').toLowerCase();
const LOCK_THRESHOLD = 7;
const LOCK_MINUTES = 15;

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    bio: u.bio,
    hue: u.hue,
    avatar: u.avatar || null,
    mood: u.mood,
    isAdmin: !!u.is_admin,
    isModerator: !!u.is_moderator,
    isDeveloper: !!u.is_developer,
    isVerified: !!u.is_verified,
    bannedUntil: u.banned_until,
    mutedUntil: u.muted_until,
    createdAt: u.created_at,
    lastSeen: u.last_seen,
    likes: db.prepare(
      'SELECT COUNT(*) AS n FROM likes l JOIN posts p ON p.id = l.post_id WHERE p.author_id = ? AND p.removed = 0'
    ).get(u.id).n,
    posts: db.prepare('SELECT COUNT(*) AS n FROM posts WHERE author_id = ? AND removed = 0').get(u.id).n
  };
}

function privateUser(u) {
  return { ...publicUser(u), theme: u.theme, accent: u.accent };
}

function requireUser(ctx) {
  if (!ctx.user) throw new HttpError(401, 'Нужен вход');
  if (ctx.user.banned_until > Date.now()) throw new HttpError(403, 'Аккаунт заблокирован');
  return ctx.user;
}

function requireMod(ctx) {
  const user = requireUser(ctx);
  if (!user.is_moderator && !user.is_admin) throw new HttpError(403, 'Только для модераторов');
  return user;
}

function requireAdmin(ctx) {
  const user = requireUser(ctx);
  if (!user.is_admin) throw new HttpError(403, 'Только для админов');
  return user;
}

function assertNotMuted(user) {
  if (user.muted_until > Date.now()) throw new HttpError(403, 'Вы в муте');
}

function getUserById(id) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'Пользователь не найден');
  return row;
}

function postRow(id, viewerId) {
  const p = db.prepare(
    `SELECT p.*, u.username, u.display_name, u.hue, u.avatar, u.is_admin, u.is_moderator,
            u.is_developer, u.is_verified
     FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?`
  ).get(id);
  if (!p) throw new HttpError(404, 'Пост не найден');
  return serializePost(p, viewerId);
}

function serializePost(p, viewerId) {
  return {
    id: p.id,
    text: p.text,
    image: p.image || null,
    mood: p.mood,
    createdAt: p.created_at,
    removed: !!p.removed,
    removedReason: p.removed_reason,
    author: {
      id: p.author_id,
      username: p.username,
      displayName: p.display_name,
      hue: p.hue,
      avatar: p.avatar || null,
      isAdmin: !!p.is_admin,
      isModerator: !!p.is_moderator,
      isDeveloper: !!p.is_developer,
      isVerified: !!p.is_verified
    },
    likes: db.prepare('SELECT COUNT(*) AS n FROM likes WHERE post_id = ?').get(p.id).n,
    liked: viewerId
      ? !!db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(p.id, viewerId)
      : false,
    comments: db.prepare('SELECT COUNT(*) AS n FROM comments WHERE post_id = ?').get(p.id).n
  };
}

function chatSummary(chatId, viewerId) {
  const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId);
  if (!chat) throw new HttpError(404, 'Чат не найден');
  const members = db.prepare(
    `SELECT u.*, m.role FROM chat_members m JOIN users u ON u.id = m.user_id WHERE m.chat_id = ?`
  ).all(chatId);
  const me = db.prepare('SELECT * FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, viewerId);
  const last = db.prepare(
    'SELECT * FROM messages WHERE chat_id = ? AND removed = 0 ORDER BY id DESC LIMIT 1'
  ).get(chatId);
  const other = chat.kind === 'dm' ? members.find((m) => m.id !== viewerId) || members[0] : null;
  return {
    id: chat.id,
    kind: chat.kind,
    title: chat.kind === 'dm' ? (other ? other.display_name : 'Диалог') : chat.title,
    hue: chat.kind === 'dm' && other ? other.hue : chat.hue,
    ownerId: chat.owner_id,
    peer: other ? publicUser(other) : null,
    role: me ? me.role : null,
    members: members.map((m) => ({ ...publicUser(m), role: m.role })),
    lastMessage: last ? serializeMessage(last) : null,
    unread: db.prepare(
      'SELECT COUNT(*) AS n FROM messages WHERE chat_id = ? AND removed = 0 AND created_at > ? AND author_id != ?'
    ).get(chatId, me ? me.read_at : 0, viewerId).n
  };
}

function serializeMessage(m) {
  const a = m.author_id ? db.prepare('SELECT * FROM users WHERE id = ?').get(m.author_id) : null;
  return {
    id: m.id,
    chatId: m.chat_id,
    kind: m.kind,
    body: m.body,
    media: m.media || null,
    duration: m.duration,
    createdAt: m.created_at,
    author: a
      ? {
          id: a.id,
          username: a.username,
          displayName: a.display_name,
          hue: a.hue,
          avatar: a.avatar || null,
          isVerified: !!a.is_verified,
          isDeveloper: !!a.is_developer,
          isModerator: !!a.is_moderator
        }
      : null
  };
}

function memberIds(chatId) {
  return db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ?').all(chatId).map((r) => r.user_id);
}

function assertMember(chatId, userId) {
  const row = db.prepare('SELECT * FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
  if (!row) throw new HttpError(403, 'Нет доступа к чату');
  return row;
}

function applyStrike(moderatorId, adminId, reason) {
  db.prepare('INSERT INTO mod_strikes (moderator_id, admin_id, reason, created_at) VALUES (?, ?, ?, ?)')
    .run(moderatorId, adminId, reason, Date.now());
  const count = db.prepare('SELECT COUNT(*) AS n FROM mod_strikes WHERE moderator_id = ?').get(moderatorId).n;
  if (count >= 3) {
    db.prepare('UPDATE users SET is_moderator = 0 WHERE id = ?').run(moderatorId);
    audit(adminId, 'mod.revoked', { moderatorId, count });
  }
  return count;
}

export const routes = [
  ['POST', '/api/auth/register', (ctx) => {
    const name = username(ctx.body.username);
    const display = str(ctx.body.displayName || ctx.body.username, { min: 1, max: 40, field: 'displayName' });
    const password = str(ctx.body.password, { min: 8, max: 200, field: 'password', trim: false });
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(name)) {
      throw new HttpError(409, 'Юзернейм занят');
    }
    const { hash, salt } = hashPassword(password);
    const isAdmin = name === BOOTSTRAP_ADMIN ? 1 : 0;
    const now = Date.now();
    const info = db.prepare(
      `INSERT INTO users (username, display_name, password_hash, password_salt, hue, is_admin,
        is_developer, is_verified, created_at, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(name, display, hash, salt, 200 + ((name.length * 37) % 140), isAdmin, isAdmin, isAdmin, now, now);
    const user = getUserById(info.lastInsertRowid);
    const session = createSession(user.id, ctx.agent, ctx.ip);
    audit(user.id, 'user.register', { username: name, isAdmin: !!isAdmin });
    return { token: session.token, user: privateUser(user) };
  }],

  ['POST', '/api/auth/login', (ctx) => {
    const name = username(ctx.body.username);
    const password = str(ctx.body.password, { min: 1, max: 200, field: 'password', trim: false });
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(name);
    if (!user) throw new HttpError(401, 'Неверный логин или пароль');
    if (user.locked_until > Date.now()) throw new HttpError(429, 'Слишком много попыток, подождите');
    if (!verifyPassword(password, user.password_salt, user.password_hash)) {
      const fails = user.failed_logins + 1;
      const locked = fails >= LOCK_THRESHOLD ? Date.now() + LOCK_MINUTES * 60000 : 0;
      db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?')
        .run(locked ? 0 : fails, locked, user.id);
      throw new HttpError(401, 'Неверный логин или пароль');
    }
    db.prepare('UPDATE users SET failed_logins = 0, locked_until = 0 WHERE id = ?').run(user.id);
    const session = createSession(user.id, ctx.agent, ctx.ip);
    return { token: session.token, user: privateUser(getUserById(user.id)) };
  }],

  ['POST', '/api/auth/logout', (ctx) => {
    const user = requireUser(ctx);
    dropSession(user.id, user.sid);
    return { ok: true };
  }],

  ['GET', '/api/me', (ctx) => ({ user: privateUser(requireUser(ctx)) })],

  ['PATCH', '/api/me', (ctx) => {
    const user = requireUser(ctx);
    const fields = {};
    if (ctx.body.displayName != null) fields.display_name = str(ctx.body.displayName, { min: 1, max: 40 });
    if (ctx.body.bio != null) fields.bio = str(ctx.body.bio, { max: 300 });
    if (ctx.body.hue != null) fields.hue = int(ctx.body.hue, { min: 0, max: 360 });
    if (ctx.body.mood != null) fields.mood = oneOf(ctx.body.mood, MOODS, 'mood');
    if (ctx.body.theme != null) fields.theme = oneOf(ctx.body.theme, ['calm', 'paper', 'deep', 'dawn', 'neon'], 'theme');
    if (ctx.body.accent != null) {
      fields.accent = oneOf(ctx.body.accent, ['mint', 'violet', 'coral', 'sky', 'amber'], 'accent');
    }
    if (ctx.body.avatar !== undefined) fields.avatar = media(ctx.body.avatar);
    const keys = Object.keys(fields);
    if (keys.length) {
      db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
        .run(...keys.map((k) => fields[k]), user.id);
    }
    return { user: privateUser(getUserById(user.id)) };
  }],

  ['POST', '/api/me/password', (ctx) => {
    const user = requireUser(ctx);
    const current = str(ctx.body.current, { min: 1, max: 200, trim: false });
    const next = str(ctx.body.next, { min: 8, max: 200, trim: false });
    if (!verifyPassword(current, user.password_salt, user.password_hash)) {
      throw new HttpError(403, 'Текущий пароль неверный');
    }
    const { hash, salt } = hashPassword(next);
    db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(user.id, user.sid);
    audit(user.id, 'user.password');
    return { ok: true };
  }],

  ['GET', '/api/me/sessions', (ctx) => {
    const user = requireUser(ctx);
    const rows = db.prepare('SELECT id, agent, ip, created_at, last_seen FROM sessions WHERE user_id = ? ORDER BY last_seen DESC').all(user.id);
    return {
      sessions: rows.map((r) => ({
        id: r.id,
        agent: r.agent,
        ip: r.ip,
        createdAt: r.created_at,
        lastSeen: r.last_seen,
        current: r.id === user.sid
      }))
    };
  }],

  ['DELETE', '/api/me/sessions/:id', (ctx) => {
    const user = requireUser(ctx);
    dropSession(user.id, ctx.params.id);
    return { ok: true };
  }],

  ['GET', '/api/users', (ctx) => {
    const q = str(ctx.query.q || '', { max: 40 });
    const like = `%${q.replace(/[%_]/g, '')}%`;
    const rows = db.prepare(
      `SELECT * FROM users WHERE username LIKE ? OR display_name LIKE ? OR bio LIKE ?
       ORDER BY last_seen DESC LIMIT 40`
    ).all(like, like, like);
    return { users: rows.map(publicUser) };
  }],

  ['GET', '/api/users/:name', (ctx) => {
    const row = db.prepare('SELECT * FROM users WHERE username = ?').get(ctx.params.name.replace(/^@/, ''));
    if (!row) throw new HttpError(404, 'Пользователь не найден');
    const posts = db.prepare(
      `SELECT p.*, u.username, u.display_name, u.hue, u.avatar, u.is_admin, u.is_moderator,
              u.is_developer, u.is_verified
       FROM posts p JOIN users u ON u.id = p.author_id
       WHERE p.author_id = ? AND p.removed = 0 ORDER BY p.id DESC LIMIT 50`
    ).all(row.id);
    return { user: publicUser(row), posts: posts.map((p) => serializePost(p, ctx.user?.id)) };
  }],

  ['GET', '/api/posts', (ctx) => {
    const mood = ctx.query.mood && MOODS.includes(ctx.query.mood) ? ctx.query.mood : null;
    const before = ctx.query.before ? int(ctx.query.before, { min: 0 }) : null;
    const rows = db.prepare(
      `SELECT p.*, u.username, u.display_name, u.hue, u.avatar, u.is_admin, u.is_moderator,
              u.is_developer, u.is_verified
       FROM posts p JOIN users u ON u.id = p.author_id
       WHERE p.removed = 0 AND (? IS NULL OR p.mood = ?) AND (? IS NULL OR p.id < ?)
       ORDER BY p.id DESC LIMIT 30`
    ).all(mood, mood, before, before);
    return { posts: rows.map((p) => serializePost(p, ctx.user?.id)) };
  }],

  ['POST', '/api/posts', (ctx) => {
    const user = requireUser(ctx);
    assertNotMuted(user);
    const text = str(ctx.body.text || '', { max: 2000 });
    const image = media(ctx.body.image);
    if (!text && !image) bad('Пустой пост');
    const mood = oneOf(ctx.body.mood || 'calm', MOODS, 'mood');
    const info = db.prepare(
      'INSERT INTO posts (author_id, text, image, mood, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(user.id, text, image, mood, Date.now());
    const post = postRow(info.lastInsertRowid, user.id);
    broadcast(null, { type: 'post', post });
    return { post };
  }],

  ['DELETE', '/api/posts/:id', (ctx) => {
    const user = requireUser(ctx);
    const id = int(ctx.params.id, { min: 1 });
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    if (!post) throw new HttpError(404, 'Пост не найден');
    if (post.author_id !== user.id && !user.is_admin) throw new HttpError(403, 'Нет прав');
    db.prepare('DELETE FROM posts WHERE id = ?').run(id);
    audit(user.id, 'post.delete', { id });
    return { ok: true };
  }],

  ['POST', '/api/posts/:id/like', (ctx) => {
    const user = requireUser(ctx);
    const id = int(ctx.params.id, { min: 1 });
    const existing = db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(id, user.id);
    if (existing) db.prepare('DELETE FROM likes WHERE post_id = ? AND user_id = ?').run(id, user.id);
    else db.prepare('INSERT INTO likes (post_id, user_id, created_at) VALUES (?, ?, ?)').run(id, user.id, Date.now());
    return { post: postRow(id, user.id) };
  }],

  ['GET', '/api/posts/:id/comments', (ctx) => {
    const id = int(ctx.params.id, { min: 1 });
    const rows = db.prepare(
      `SELECT c.*, u.username, u.display_name, u.hue, u.avatar, u.is_verified, u.is_developer, u.is_moderator
       FROM comments c JOIN users u ON u.id = c.author_id WHERE c.post_id = ? ORDER BY c.id ASC LIMIT 200`
    ).all(id);
    return {
      comments: rows.map((c) => ({
        id: c.id,
        text: c.text,
        createdAt: c.created_at,
        author: {
          id: c.author_id,
          username: c.username,
          displayName: c.display_name,
          hue: c.hue,
          avatar: c.avatar || null,
          isVerified: !!c.is_verified,
          isDeveloper: !!c.is_developer,
          isModerator: !!c.is_moderator
        }
      }))
    };
  }],

  ['POST', '/api/posts/:id/comments', (ctx) => {
    const user = requireUser(ctx);
    assertNotMuted(user);
    const id = int(ctx.params.id, { min: 1 });
    const text = str(ctx.body.text, { min: 1, max: 500, field: 'text' });
    db.prepare('INSERT INTO comments (post_id, author_id, text, created_at) VALUES (?, ?, ?, ?)')
      .run(id, user.id, text, Date.now());
    return { post: postRow(id, user.id) };
  }],

  ['GET', '/api/contacts', (ctx) => {
    const user = requireUser(ctx);
    const rows = db.prepare(
      'SELECT u.* FROM contacts c JOIN users u ON u.id = c.contact_id WHERE c.user_id = ? ORDER BY u.display_name'
    ).all(user.id);
    return { contacts: rows.map(publicUser) };
  }],

  ['POST', '/api/contacts/:id', (ctx) => {
    const user = requireUser(ctx);
    const id = int(ctx.params.id, { min: 1 });
    if (id === user.id) bad('Нельзя добавить себя');
    getUserById(id);
    db.prepare('INSERT OR IGNORE INTO contacts (user_id, contact_id, created_at) VALUES (?, ?, ?)')
      .run(user.id, id, Date.now());
    return { ok: true };
  }],

  ['DELETE', '/api/contacts/:id', (ctx) => {
    const user = requireUser(ctx);
    db.prepare('DELETE FROM contacts WHERE user_id = ? AND contact_id = ?')
      .run(user.id, int(ctx.params.id, { min: 1 }));
    return { ok: true };
  }],

  ['GET', '/api/chats', (ctx) => {
    const user = requireUser(ctx);
    const ids = db.prepare('SELECT chat_id FROM chat_members WHERE user_id = ?').all(user.id).map((r) => r.chat_id);
    const chats = ids.map((id) => chatSummary(id, user.id));
    chats.sort((a, b) => (b.lastMessage?.createdAt || 0) - (a.lastMessage?.createdAt || 0));
    return { chats };
  }],

  ['POST', '/api/chats', (ctx) => {
    const user = requireUser(ctx);
    const kind = oneOf(ctx.body.kind || 'dm', ['dm', 'group', 'channel'], 'kind');
    const members = Array.isArray(ctx.body.members) ? ctx.body.members.map((m) => int(m, { min: 1 })) : [];
    if (kind === 'dm') {
      if (members.length !== 1) bad('Для диалога нужен один собеседник');
      const peer = getUserById(members[0]);
      const existing = db.prepare(
        `SELECT c.id FROM chats c
         JOIN chat_members a ON a.chat_id = c.id AND a.user_id = ?
         JOIN chat_members b ON b.chat_id = c.id AND b.user_id = ?
         WHERE c.kind = 'dm'`
      ).get(user.id, peer.id);
      if (existing) return { chat: chatSummary(existing.id, user.id) };
    }
    const title = kind === 'dm' ? '' : str(ctx.body.title, { min: 1, max: 60, field: 'title' });
    const info = db.prepare('INSERT INTO chats (kind, title, hue, owner_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(kind, title, int(ctx.body.hue ?? 250, { min: 0, max: 360 }), user.id, Date.now());
    const chatId = info.lastInsertRowid;
    const add = db.prepare('INSERT OR IGNORE INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)');
    add.run(chatId, user.id, 'owner');
    for (const m of members) {
      if (m === user.id) continue;
      getUserById(m);
      add.run(chatId, m, 'member');
    }
    const chat = chatSummary(chatId, user.id);
    broadcast(memberIds(chatId), { type: 'chat', chat: null });
    return { chat };
  }],

  ['POST', '/api/chats/:id/members', (ctx) => {
    const user = requireUser(ctx);
    const chatId = int(ctx.params.id, { min: 1 });
    const me = assertMember(chatId, user.id);
    if (me.role !== 'owner' && !user.is_admin) throw new HttpError(403, 'Только владелец может добавлять');
    const id = int(ctx.body.userId, { min: 1 });
    getUserById(id);
    db.prepare('INSERT OR IGNORE INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)').run(chatId, id, 'member');
    return { chat: chatSummary(chatId, user.id) };
  }],

  ['POST', '/api/chats/:id/read', (ctx) => {
    const user = requireUser(ctx);
    const chatId = int(ctx.params.id, { min: 1 });
    assertMember(chatId, user.id);
    db.prepare('UPDATE chat_members SET read_at = ? WHERE chat_id = ? AND user_id = ?').run(Date.now(), chatId, user.id);
    return { ok: true };
  }],

  ['GET', '/api/chats/:id/messages', (ctx) => {
    const user = requireUser(ctx);
    const chatId = int(ctx.params.id, { min: 1 });
    assertMember(chatId, user.id);
    const rows = db.prepare(
      'SELECT * FROM messages WHERE chat_id = ? AND removed = 0 ORDER BY id DESC LIMIT 80'
    ).all(chatId);
    return { messages: rows.reverse().map(serializeMessage) };
  }],

  ['POST', '/api/chats/:id/messages', (ctx) => {
    const user = requireUser(ctx);
    assertNotMuted(user);
    const chatId = int(ctx.params.id, { min: 1 });
    const membership = assertMember(chatId, user.id);
    const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId);
    if (chat.kind === 'channel' && membership.role !== 'owner' && !user.is_admin) {
      throw new HttpError(403, 'Писать в канал может только владелец');
    }
    const kind = oneOf(ctx.body.kind || 'text', ['text', 'image', 'voice', 'call'], 'kind');
    const body = str(ctx.body.body || '', { max: 4000 });
    const asset = kind === 'image' ? media(ctx.body.media) : kind === 'voice' ? media(ctx.body.media, 'audio') : null;
    if (kind === 'text' && !body) bad('Пустое сообщение');
    if ((kind === 'image' || kind === 'voice') && !asset) bad('Нет вложения');
    const info = db.prepare(
      'INSERT INTO messages (chat_id, author_id, kind, body, media, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(chatId, user.id, kind, body, asset, int(ctx.body.duration ?? 0, { min: 0, max: 3600 }), Date.now());
    const message = serializeMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid));
    broadcast(memberIds(chatId), { type: 'message', message });
    return { message };
  }],

  ['POST', '/api/chats/:id/call', (ctx) => {
    const user = requireUser(ctx);
    const chatId = int(ctx.params.id, { min: 1 });
    assertMember(chatId, user.id);
    const action = oneOf(ctx.body.action, ['ring', 'accept', 'decline', 'end'], 'action');
    broadcast(memberIds(chatId), { type: 'call', chatId, action, from: publicUser(user) });
    if (action === 'end' || action === 'decline') {
      db.prepare('INSERT INTO messages (chat_id, author_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(chatId, user.id, 'call', action === 'end' ? 'Звонок завершён' : 'Звонок отклонён', Date.now());
    }
    return { ok: true };
  }],

  ['POST', '/api/reports', (ctx) => {
    const user = requireUser(ctx);
    const kind = oneOf(ctx.body.targetKind, ['post', 'user', 'message'], 'targetKind');
    const target = int(ctx.body.targetId, { min: 1 });
    const reason = str(ctx.body.reason, { min: 3, max: 600, field: 'reason' });
    const image = media(ctx.body.image);
    db.prepare(
      'INSERT INTO reports (reporter_id, target_kind, target_id, reason, image, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(user.id, kind, target, reason, image, Date.now());
    return { ok: true };
  }],

  ['GET', '/api/mod/reports', (ctx) => {
    requireMod(ctx);
    const rows = db.prepare(`SELECT * FROM reports ORDER BY status = 'open' DESC, id DESC LIMIT 100`).all();
    return {
      reports: rows.map((r) => ({
        id: r.id,
        targetKind: r.target_kind,
        targetId: r.target_id,
        reason: r.reason,
        image: r.image || null,
        status: r.status,
        createdAt: r.created_at,
        reporter: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(r.reporter_id)),
        target:
          r.target_kind === 'user'
            ? publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(r.target_id))
            : null
      }))
    };
  }],

  ['POST', '/api/mod/reports/:id/close', (ctx) => {
    const user = requireMod(ctx);
    db.prepare('UPDATE reports SET status = ?, handled_by = ?, handled_at = ? WHERE id = ?')
      .run(oneOf(ctx.body.status || 'closed', ['closed', 'rejected'], 'status'), user.id, Date.now(), int(ctx.params.id, { min: 1 }));
    return { ok: true };
  }],

  ['GET', '/api/mod/queue', (ctx) => {
    const user = requireMod(ctx);
    const rows = db.prepare(
      `SELECT p.*, u.username, u.display_name, u.hue, u.avatar, u.is_admin, u.is_moderator,
              u.is_developer, u.is_verified
       FROM posts p JOIN users u ON u.id = p.author_id ORDER BY p.id DESC LIMIT 60`
    ).all();
    return { posts: rows.map((p) => serializePost(p, user.id)) };
  }],

  ['POST', '/api/mod/posts/:id/remove', (ctx) => {
    const user = requireMod(ctx);
    const id = int(ctx.params.id, { min: 1 });
    const reason = str(ctx.body.reason, { min: 3, max: 300, field: 'reason' });
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    if (!post) throw new HttpError(404, 'Пост не найден');
    db.prepare('UPDATE posts SET removed = 1, removed_by = ?, removed_reason = ?, removed_at = ? WHERE id = ?')
      .run(user.id, reason, Date.now(), id);
    db.prepare(
      'INSERT INTO punishments (actor_id, user_id, kind, minutes, reason, post_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(user.id, post.author_id, 'post_removed', 0, reason, id, Date.now());
    audit(user.id, 'post.remove', { id, reason });
    return { ok: true };
  }],

  ['POST', '/api/mod/punish', (ctx) => {
    const user = requireMod(ctx);
    const targetId = int(ctx.body.userId, { min: 1 });
    const target = getUserById(targetId);
    if (target.is_admin) throw new HttpError(403, 'Нельзя наказать админа');
    const kind = oneOf(ctx.body.kind, ['warn', 'mute', 'ban'], 'kind');
    const minutes = int(ctx.body.minutes ?? 0, { min: 0, max: 60 * 24 * 365 });
    const reason = str(ctx.body.reason, { min: 3, max: 300, field: 'reason' });
    const until = Date.now() + minutes * 60000;
    if (kind === 'mute') db.prepare('UPDATE users SET muted_until = ? WHERE id = ?').run(until, targetId);
    if (kind === 'ban') {
      db.prepare('UPDATE users SET banned_until = ?, ban_reason = ? WHERE id = ?').run(until, reason, targetId);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);
    }
    db.prepare(
      'INSERT INTO punishments (actor_id, user_id, kind, minutes, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(user.id, targetId, kind, minutes, reason, Date.now());
    audit(user.id, 'mod.punish', { targetId, kind, minutes });
    return { ok: true };
  }],

  ['GET', '/api/admin/stats', (ctx) => {
    requireAdmin(ctx);
    const day = Date.now() - 86400000;
    const week = Date.now() - 7 * 86400000;
    const one = (sql, ...args) => db.prepare(sql).get(...args).n;
    const moods = db.prepare(
      'SELECT mood, COUNT(*) AS n FROM posts WHERE removed = 0 GROUP BY mood ORDER BY n DESC'
    ).all();
    const daily = [];
    for (let i = 6; i >= 0; i--) {
      const from = Date.now() - (i + 1) * 86400000;
      const to = Date.now() - i * 86400000;
      daily.push({
        day: new Date(to).toLocaleDateString('ru-RU', { weekday: 'short' }),
        posts: one('SELECT COUNT(*) AS n FROM posts WHERE created_at >= ? AND created_at < ?', from, to),
        users: one('SELECT COUNT(*) AS n FROM users WHERE created_at >= ? AND created_at < ?', from, to),
        messages: one('SELECT COUNT(*) AS n FROM messages WHERE created_at >= ? AND created_at < ?', from, to)
      });
    }
    return {
      stats: {
        users: one('SELECT COUNT(*) AS n FROM users'),
        online: one('SELECT COUNT(*) AS n FROM users WHERE last_seen > ?', Date.now() - 300000),
        newToday: one('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', day),
        posts: one('SELECT COUNT(*) AS n FROM posts WHERE removed = 0'),
        postsWeek: one('SELECT COUNT(*) AS n FROM posts WHERE created_at > ?', week),
        messages: one('SELECT COUNT(*) AS n FROM messages'),
        chats: one('SELECT COUNT(*) AS n FROM chats'),
        reportsOpen: one(`SELECT COUNT(*) AS n FROM reports WHERE status = 'open'`),
        banned: one('SELECT COUNT(*) AS n FROM users WHERE banned_until > ?', Date.now()),
        moderators: one('SELECT COUNT(*) AS n FROM users WHERE is_moderator = 1'),
        moods,
        daily
      }
    };
  }],

  ['GET', '/api/admin/users', (ctx) => {
    requireAdmin(ctx);
    const q = str(ctx.query.q || '', { max: 40 });
    const like = `%${q.replace(/[%_]/g, '')}%`;
    const rows = db.prepare(
      'SELECT * FROM users WHERE username LIKE ? OR display_name LIKE ? ORDER BY id DESC LIMIT 200'
    ).all(like, like);
    return {
      users: rows.map((u) => ({
        ...publicUser(u),
        strikes: db.prepare('SELECT COUNT(*) AS n FROM mod_strikes WHERE moderator_id = ?').get(u.id).n
      }))
    };
  }],

  ['POST', '/api/admin/users/:id/flags', (ctx) => {
    const admin = requireAdmin(ctx);
    const id = int(ctx.params.id, { min: 1 });
    const target = getUserById(id);
    const map = {
      isAdmin: 'is_admin',
      isModerator: 'is_moderator',
      isDeveloper: 'is_developer',
      isVerified: 'is_verified'
    };
    const updates = {};
    for (const [key, column] of Object.entries(map)) {
      if (ctx.body[key] !== undefined) updates[column] = ctx.body[key] ? 1 : 0;
    }
    if (ctx.body.clearAll) {
      updates.is_moderator = 0;
      updates.is_developer = 0;
      updates.is_verified = 0;
      if (target.username !== BOOTSTRAP_ADMIN) updates.is_admin = 0;
    }
    if (target.username === BOOTSTRAP_ADMIN && updates.is_admin === 0) {
      throw new HttpError(403, 'Нельзя снять админку с основателя');
    }
    const keys = Object.keys(updates);
    if (!keys.length) bad('Нечего менять');
    db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
      .run(...keys.map((k) => updates[k]), id);
    if (updates.is_moderator === 1) db.prepare('DELETE FROM mod_strikes WHERE moderator_id = ?').run(id);
    audit(admin.id, 'admin.flags', { id, updates });
    return { user: publicUser(getUserById(id)) };
  }],

  ['POST', '/api/admin/users/:id/state', (ctx) => {
    const admin = requireAdmin(ctx);
    const id = int(ctx.params.id, { min: 1 });
    const target = getUserById(id);
    if (target.username === BOOTSTRAP_ADMIN) throw new HttpError(403, 'Нельзя ограничить основателя');
    const action = oneOf(ctx.body.action, ['ban', 'unban', 'mute', 'unmute'], 'action');
    const minutes = int(ctx.body.minutes ?? 0, { min: 0, max: 60 * 24 * 365 });
    const reason = str(ctx.body.reason || '', { max: 300 });
    const until = Date.now() + minutes * 60000;
    if (action === 'ban') {
      db.prepare('UPDATE users SET banned_until = ?, ban_reason = ? WHERE id = ?').run(until, reason, id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }
    if (action === 'unban') db.prepare(`UPDATE users SET banned_until = 0, ban_reason = '' WHERE id = ?`).run(id);
    if (action === 'mute') db.prepare('UPDATE users SET muted_until = ? WHERE id = ?').run(until, id);
    if (action === 'unmute') db.prepare('UPDATE users SET muted_until = 0 WHERE id = ?').run(id);
    db.prepare(
      'INSERT INTO punishments (actor_id, user_id, kind, minutes, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(admin.id, id, action, minutes, reason, Date.now());
    audit(admin.id, 'admin.state', { id, action, minutes });
    return { user: publicUser(getUserById(id)) };
  }],

  ['GET', '/api/admin/actions', (ctx) => {
    requireAdmin(ctx);
    const rows = db.prepare('SELECT * FROM punishments ORDER BY id DESC LIMIT 150').all();
    return {
      actions: rows.map((p) => ({
        id: p.id,
        kind: p.kind,
        minutes: p.minutes,
        reason: p.reason,
        postId: p.post_id,
        createdAt: p.created_at,
        reverted: !!p.reverted,
        actor: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(p.actor_id)),
        target: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(p.user_id))
      }))
    };
  }],

  ['POST', '/api/admin/actions/:id/revert', (ctx) => {
    const admin = requireAdmin(ctx);
    const id = int(ctx.params.id, { min: 1 });
    const action = db.prepare('SELECT * FROM punishments WHERE id = ?').get(id);
    if (!action) throw new HttpError(404, 'Действие не найдено');
    if (action.reverted) bad('Уже отменено');
    if (action.kind === 'post_removed' && action.post_id) {
      db.prepare(`UPDATE posts SET removed = 0, removed_by = NULL, removed_reason = '' WHERE id = ?`).run(action.post_id);
    }
    if (action.kind === 'mute') db.prepare('UPDATE users SET muted_until = 0 WHERE id = ?').run(action.user_id);
    if (action.kind === 'ban') db.prepare('UPDATE users SET banned_until = 0 WHERE id = ?').run(action.user_id);
    db.prepare('UPDATE punishments SET reverted = 1, reverted_by = ? WHERE id = ?').run(admin.id, id);
    let strikes = null;
    if (action.actor_id && ctx.body.strike) {
      strikes = applyStrike(action.actor_id, admin.id, str(ctx.body.reason || 'Необоснованное действие', { max: 200 }));
    }
    audit(admin.id, 'admin.revert', { id, strikes });
    return { ok: true, strikes };
  }],

  ['GET', '/api/admin/audit', (ctx) => {
    requireAdmin(ctx);
    const rows = db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 200').all();
    return {
      entries: rows.map((r) => ({
        id: r.id,
        action: r.action,
        meta: r.meta ? JSON.parse(r.meta) : null,
        createdAt: r.created_at,
        actor: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(r.actor_id))
      }))
    };
  }],

  ['GET', '/api/mod/strikes', (ctx) => {
    const user = requireMod(ctx);
    const id = ctx.query.userId ? int(ctx.query.userId, { min: 1 }) : user.id;
    if (id !== user.id && !user.is_admin) throw new HttpError(403, 'Нет прав');
    const rows = db.prepare('SELECT * FROM mod_strikes WHERE moderator_id = ? ORDER BY id DESC').all(id);
    return {
      strikes: rows.map((s) => ({ id: s.id, reason: s.reason, createdAt: s.created_at }))
    };
  }],

  ['POST', '/api/games/score', (ctx) => {
    const user = requireUser(ctx);
    const game = oneOf(ctx.body.game, ['orbit', 'drift', 'pulse', 'flow', 'echo'], 'game');
    const score = int(ctx.body.score, { min: 0, max: 10_000_000 });
    db.prepare('INSERT INTO game_scores (user_id, game, score, created_at) VALUES (?, ?, ?, ?)')
      .run(user.id, game, score, Date.now());
    return { ok: true };
  }],

  ['GET', '/api/games/leaderboard', (ctx) => {
    const game = oneOf(ctx.query.game || 'orbit', ['orbit', 'drift', 'pulse', 'flow', 'echo'], 'game');
    const rows = db.prepare(
      `SELECT u.username, u.display_name, u.hue, u.avatar, MAX(s.score) AS score
       FROM game_scores s JOIN users u ON u.id = s.user_id
       WHERE s.game = ? GROUP BY s.user_id ORDER BY score DESC LIMIT 20`
    ).all(game);
    return { leaderboard: rows };
  }]
];
