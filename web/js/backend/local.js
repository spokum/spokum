import { uid } from '../util.js';

const KEY = 'spokum.db.v3';
const SESSION_KEY = 'spokum.session.v3';
const MOODS = ['calm', 'joy', 'sad', 'anger', 'anxiety', 'tired', 'love', 'inspired'];

function blank() {
  return {
    seq: { users: 0, posts: 0, comments: 0, chats: 0, messages: 0, reports: 0, punishments: 0, strikes: 0, audit: 0, scores: 0 },
    users: [],
    sessions: [],
    posts: [],
    likes: [],
    comments: [],
    contacts: [],
    chats: [],
    members: [],
    messages: [],
    reports: [],
    punishments: [],
    strikes: [],
    audit: [],
    scores: []
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const fresh = blank();
  localStorage.setItem(KEY, JSON.stringify(fresh));
  return fresh;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    state.messages = state.messages.slice(-400);
    state.posts = state.posts.slice(-200);
    localStorage.setItem(KEY, JSON.stringify(state));
  }
}

function next(kind) {
  state.seq[kind] += 1;
  return state.seq[kind];
}

async function hash(password, salt) {
  const data = new TextEncoder().encode(`spokum:${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fail(message) {
  throw new Error(message);
}

function currentToken() {
  return localStorage.getItem(SESSION_KEY);
}

function sessionRow() {
  const token = currentToken();
  if (!token) return null;
  return state.sessions.find((s) => s.token === token) || null;
}

function me() {
  const row = sessionRow();
  if (!row) return null;
  return state.users.find((u) => u.id === row.userId) || null;
}

function need() {
  const user = me();
  if (!user) fail('Нужен вход');
  if (user.bannedUntil > Date.now()) fail('Аккаунт заблокирован');
  return user;
}

function needMod() {
  const user = need();
  if (!user.isModerator && !user.isAdmin) fail('Только для модераторов');
  return user;
}

function needAdmin() {
  const user = need();
  if (!user.isAdmin) fail('Только для админов');
  return user;
}

function notMuted(user) {
  if (user.mutedUntil > Date.now()) fail('Вы в муте, писать нельзя');
}

function log(actorId, action, meta) {
  state.audit.unshift({ id: next('audit'), actorId, action, meta: meta || null, createdAt: Date.now() });
  state.audit = state.audit.slice(0, 300);
}

function pub(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    hue: user.hue,
    avatar: user.avatar,
    mood: user.mood,
    isAdmin: user.isAdmin,
    isModerator: user.isModerator,
    isDeveloper: user.isDeveloper,
    isVerified: user.isVerified,
    bannedUntil: user.bannedUntil,
    mutedUntil: user.mutedUntil,
    createdAt: user.createdAt,
    lastSeen: user.lastSeen,
    likes: state.likes.filter((l) => {
      const post = state.posts.find((p) => p.id === l.postId);
      return post && !post.removed && post.authorId === user.id;
    }).length,
    posts: state.posts.filter((p) => p.authorId === user.id && !p.removed).length
  };
}

function priv(user) {
  return { ...pub(user), theme: user.theme, accent: user.accent };
}

function shapePost(post, viewerId) {
  const author = state.users.find((u) => u.id === post.authorId);
  return {
    id: post.id,
    text: post.text,
    image: post.image,
    mood: post.mood,
    createdAt: post.createdAt,
    removed: post.removed,
    removedReason: post.removedReason,
    author: pub(author),
    likes: state.likes.filter((l) => l.postId === post.id).length,
    liked: state.likes.some((l) => l.postId === post.id && l.userId === viewerId),
    comments: state.comments.filter((c) => c.postId === post.id).length
  };
}

function shapeMessage(message) {
  return {
    id: message.id,
    chatId: message.chatId,
    kind: message.kind,
    body: message.body,
    media: message.media,
    duration: message.duration,
    createdAt: message.createdAt,
    author: pub(state.users.find((u) => u.id === message.authorId))
  };
}

function shapeChat(chat, viewerId) {
  const members = state.members
    .filter((m) => m.chatId === chat.id)
    .map((m) => ({ ...pub(state.users.find((u) => u.id === m.userId)), role: m.role }))
    .filter((m) => m.id);
  const mine = state.members.find((m) => m.chatId === chat.id && m.userId === viewerId);
  const peerReadAt = state.members
    .filter((m) => m.chatId === chat.id && m.userId !== viewerId)
    .reduce((top, m) => Math.max(top, m.readAt || 0), 0);
  const peer = chat.kind === 'dm' ? members.find((m) => m.id !== viewerId) || members[0] : null;
  const messages = state.messages.filter((m) => m.chatId === chat.id && !m.removed);
  const last = messages[messages.length - 1];
  return {
    id: chat.id,
    kind: chat.kind,
    title: chat.kind === 'dm' ? (peer ? peer.displayName : 'Диалог') : chat.title,
    hue: chat.kind === 'dm' && peer ? peer.hue : chat.hue,
    ownerId: chat.ownerId,
    peer,
    role: mine ? mine.role : null,
    peerReadAt,
    members,
    lastMessage: last ? shapeMessage(last) : null,
    unread: messages.filter((m) => m.createdAt > (mine ? mine.readAt : 0) && m.authorId !== viewerId).length
  };
}

function memberOf(chatId, userId) {
  const row = state.members.find((m) => m.chatId === chatId && m.userId === userId);
  if (!row) fail('Нет доступа к чату');
  return row;
}

function applyStrike(moderatorId, adminId, reason) {
  state.strikes.unshift({ id: next('strikes'), moderatorId, adminId, reason, createdAt: Date.now() });
  const count = state.strikes.filter((s) => s.moderatorId === moderatorId).length;
  if (count >= 3) {
    const mod = state.users.find((u) => u.id === moderatorId);
    if (mod) mod.isModerator = false;
    log(adminId, 'mod.revoked', { moderatorId, count });
  }
  return count;
}

export const local = {
  mode: 'local',

  async register({ username, displayName, password, avatar }) {
    const name = String(username || '').toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_]{3,20}$/.test(name)) fail('Юзернейм: 3-20 символов, латиница, цифры и _');
    if (String(password || '').length < 8) fail('Пароль минимум 8 символов');
    if (state.users.some((u) => u.username === name)) fail('Юзернейм занят');
    const salt = uid();
    const user = {
      id: next('users'),
      username: name,
      displayName: String(displayName || name).trim().slice(0, 40) || name,
      bio: '',
      hue: 200 + ((name.length * 37) % 140),
      avatar: avatar || null,
      passwordHash: await hash(password, salt),
      salt,
      isAdmin: name === 'vanya8',
      isModerator: false,
      isDeveloper: name === 'vanya8',
      isVerified: name === 'vanya8',
      mood: 'calm',
      theme: 'calm',
      accent: 'mint',
      bannedUntil: 0,
      mutedUntil: 0,
      banReason: '',
      createdAt: Date.now(),
      lastSeen: Date.now()
    };
    state.users.push(user);
    const token = uid() + uid();
    state.sessions.push({
      id: uid(),
      userId: user.id,
      token,
      agent: navigator.userAgent,
      createdAt: Date.now(),
      lastSeen: Date.now()
    });
    localStorage.setItem(SESSION_KEY, token);
    log(user.id, 'user.register', { username: name, isAdmin: user.isAdmin });
    save();
    return { user: priv(user) };
  },

  async login({ username, password }) {
    const name = String(username || '').toLowerCase().replace(/^@/, '');
    const user = state.users.find((u) => u.username === name);
    if (!user) fail('Неверный логин или пароль');
    if (user.passwordHash !== (await hash(password, user.salt))) fail('Неверный логин или пароль');
    if (user.bannedUntil > Date.now()) fail('Аккаунт заблокирован');
    const token = uid() + uid();
    state.sessions.push({
      id: uid(),
      userId: user.id,
      token,
      agent: navigator.userAgent,
      createdAt: Date.now(),
      lastSeen: Date.now()
    });
    localStorage.setItem(SESSION_KEY, token);
    user.lastSeen = Date.now();
    save();
    return { user: priv(user) };
  },

  async logout() {
    const token = currentToken();
    state.sessions = state.sessions.filter((s) => s.token !== token);
    localStorage.removeItem(SESSION_KEY);
    save();
    return { ok: true };
  },

  async me() {
    const user = me();
    if (!user) return { user: null };
    user.lastSeen = Date.now();
    return { user: priv(user) };
  },

  async updateMe(patch) {
    const user = need();
    if (patch.displayName != null) user.displayName = String(patch.displayName).trim().slice(0, 40) || user.displayName;
    if (patch.bio != null) user.bio = String(patch.bio).slice(0, 300);
    if (patch.hue != null) user.hue = Number(patch.hue) || user.hue;
    if (patch.mood != null && MOODS.includes(patch.mood)) user.mood = patch.mood;
    if (patch.theme != null) user.theme = patch.theme;
    if (patch.accent != null) user.accent = patch.accent;
    if (patch.avatar !== undefined) user.avatar = patch.avatar;
    save();
    return { user: priv(user) };
  },

  async changePassword({ current, next: nextPassword }) {
    const user = need();
    if (user.passwordHash !== (await hash(current, user.salt))) fail('Текущий пароль неверный');
    if (String(nextPassword || '').length < 8) fail('Новый пароль минимум 8 символов');
    user.salt = uid();
    user.passwordHash = await hash(nextPassword, user.salt);
    const token = currentToken();
    state.sessions = state.sessions.filter((s) => s.userId !== user.id || s.token === token);
    log(user.id, 'user.password');
    save();
    return { ok: true };
  },

  async sessions() {
    const user = need();
    const token = currentToken();
    return {
      sessions: state.sessions
        .filter((s) => s.userId === user.id)
        .map((s) => ({ id: s.id, agent: s.agent, createdAt: s.createdAt, lastSeen: s.lastSeen, current: s.token === token }))
    };
  },

  async dropSession(id) {
    const user = need();
    state.sessions = state.sessions.filter((s) => !(s.id === id && s.userId === user.id));
    save();
    return { ok: true };
  },

  async searchUsers(query) {
    const q = String(query || '').toLowerCase().replace(/^@/, '');
    return {
      users: state.users
        .filter((u) => !q || u.username.includes(q) || u.displayName.toLowerCase().includes(q) || u.bio.toLowerCase().includes(q))
        .slice(0, 40)
        .map(pub)
    };
  },

  async getUser(name) {
    const user = state.users.find((u) => u.username === String(name).toLowerCase().replace(/^@/, ''));
    if (!user) fail('Пользователь не найден');
    const viewer = me();
    return {
      user: pub(user),
      posts: state.posts
        .filter((p) => p.authorId === user.id && !p.removed)
        .sort((a, b) => b.id - a.id)
        .map((p) => shapePost(p, viewer?.id))
    };
  },

  async listPosts({ mood } = {}) {
    const viewer = me();
    return {
      posts: state.posts
        .filter((p) => !p.removed && (!mood || p.mood === mood))
        .sort((a, b) => b.id - a.id)
        .slice(0, 60)
        .map((p) => shapePost(p, viewer?.id))
    };
  },

  async createPost({ text, image, mood }) {
    const user = need();
    notMuted(user);
    const body = String(text || '').trim().slice(0, 2000);
    if (!body && !image) fail('Пустой пост');
    const post = {
      id: next('posts'),
      authorId: user.id,
      text: body,
      image: image || null,
      mood: MOODS.includes(mood) ? mood : 'calm',
      createdAt: Date.now(),
      removed: false,
      removedBy: null,
      removedReason: '',
      removedAt: 0
    };
    state.posts.push(post);
    save();
    return { post: shapePost(post, user.id) };
  },

  async deletePost(id) {
    const user = need();
    const post = state.posts.find((p) => p.id === id);
    if (!post) fail('Пост не найден');
    if (post.authorId !== user.id && !user.isAdmin) fail('Нет прав');
    state.posts = state.posts.filter((p) => p.id !== id);
    state.likes = state.likes.filter((l) => l.postId !== id);
    state.comments = state.comments.filter((c) => c.postId !== id);
    log(user.id, 'post.delete', { id });
    save();
    return { ok: true };
  },

  async toggleLike(id) {
    const user = need();
    const existing = state.likes.find((l) => l.postId === id && l.userId === user.id);
    if (existing) state.likes = state.likes.filter((l) => !(l.postId === id && l.userId === user.id));
    else state.likes.push({ postId: id, userId: user.id, createdAt: Date.now() });
    save();
    return { post: shapePost(state.posts.find((p) => p.id === id), user.id) };
  },

  async listComments(id) {
    return {
      comments: state.comments
        .filter((c) => c.postId === id)
        .map((c) => ({ id: c.id, text: c.text, createdAt: c.createdAt, author: pub(state.users.find((u) => u.id === c.authorId)) }))
    };
  },

  async addComment(id, text) {
    const user = need();
    notMuted(user);
    const body = String(text || '').trim().slice(0, 500);
    if (!body) fail('Пустой комментарий');
    state.comments.push({ id: next('comments'), postId: id, authorId: user.id, text: body, createdAt: Date.now() });
    save();
    return { post: shapePost(state.posts.find((p) => p.id === id), user.id) };
  },

  async contacts() {
    const user = need();
    return {
      contacts: state.contacts
        .filter((c) => c.userId === user.id)
        .map((c) => pub(state.users.find((u) => u.id === c.contactId)))
        .filter(Boolean)
    };
  },

  async addContact(id) {
    const user = need();
    if (id === user.id) fail('Нельзя добавить себя');
    if (!state.contacts.some((c) => c.userId === user.id && c.contactId === id)) {
      state.contacts.push({ userId: user.id, contactId: id, createdAt: Date.now() });
    }
    save();
    return { ok: true };
  },

  async removeContact(id) {
    const user = need();
    state.contacts = state.contacts.filter((c) => !(c.userId === user.id && c.contactId === id));
    save();
    return { ok: true };
  },

  async chats() {
    const user = need();
    const ids = state.members.filter((m) => m.userId === user.id).map((m) => m.chatId);
    const chats = state.chats.filter((c) => ids.includes(c.id)).map((c) => shapeChat(c, user.id));
    chats.sort((a, b) => (b.lastMessage?.createdAt || 0) - (a.lastMessage?.createdAt || 0));
    return { chats };
  },

  async createChat({ kind, title, members }) {
    const user = need();
    const list = (members || []).filter((id) => id !== user.id);
    if (kind === 'dm') {
      if (list.length !== 1) fail('Выберите одного собеседника');
      const existing = state.chats.find(
        (c) =>
          c.kind === 'dm' &&
          state.members.some((m) => m.chatId === c.id && m.userId === user.id) &&
          state.members.some((m) => m.chatId === c.id && m.userId === list[0])
      );
      if (existing) return { chat: shapeChat(existing, user.id) };
    } else if (!String(title || '').trim()) {
      fail('Нужно название');
    }
    const chat = {
      id: next('chats'),
      kind,
      title: String(title || '').trim().slice(0, 60),
      hue: 150 + Math.floor(Math.random() * 180),
      ownerId: user.id,
      createdAt: Date.now()
    };
    state.chats.push(chat);
    state.members.push({ chatId: chat.id, userId: user.id, role: 'owner', readAt: Date.now() });
    for (const id of list) state.members.push({ chatId: chat.id, userId: id, role: 'member', readAt: 0 });
    save();
    return { chat: shapeChat(chat, user.id) };
  },

  async addMember(chatId, userId) {
    const user = need();
    const mine = memberOf(chatId, user.id);
    if (mine.role !== 'owner' && !user.isAdmin) fail('Только владелец может добавлять');
    if (!state.members.some((m) => m.chatId === chatId && m.userId === userId)) {
      state.members.push({ chatId, userId, role: 'member', readAt: 0 });
    }
    save();
    return { chat: shapeChat(state.chats.find((c) => c.id === chatId), user.id) };
  },

  async messages(chatId) {
    const user = need();
    memberOf(chatId, user.id);
    return { messages: state.messages.filter((m) => m.chatId === chatId && !m.removed).map(shapeMessage) };
  },

  async sendMessage(chatId, payload) {
    const user = need();
    notMuted(user);
    const membership = memberOf(chatId, user.id);
    const chat = state.chats.find((c) => c.id === chatId);
    if (chat.kind === 'channel' && membership.role !== 'owner' && !user.isAdmin) fail('Писать в канал может только владелец');
    const message = {
      id: next('messages'),
      chatId,
      authorId: user.id,
      kind: payload.kind || 'text',
      body: String(payload.body || '').slice(0, 4000),
      media: payload.media || null,
      duration: payload.duration || 0,
      createdAt: Date.now(),
      removed: false
    };
    if (message.kind === 'text' && !message.body.trim()) fail('Пустое сообщение');
    state.messages.push(message);
    save();
    return { message: shapeMessage(message) };
  },

  async markRead(chatId) {
    const user = me();
    if (!user) return { ok: true };
    const row = state.members.find((m) => m.chatId === chatId && m.userId === user.id);
    if (row) row.readAt = Date.now();
    save();
    return { ok: true };
  },

  async report({ targetKind, targetId, reason, image }) {
    const user = need();
    if (!String(reason || '').trim()) fail('Опишите причину');
    state.reports.unshift({
      id: next('reports'),
      reporterId: user.id,
      targetKind,
      targetId,
      reason: String(reason).slice(0, 600),
      image: image || null,
      status: 'open',
      createdAt: Date.now(),
      handledBy: null,
      handledAt: 0
    });
    save();
    return { ok: true };
  },

  async modReports() {
    needMod();
    return {
      reports: state.reports.map((r) => ({
        id: r.id,
        targetKind: r.targetKind,
        targetId: r.targetId,
        reason: r.reason,
        image: r.image,
        status: r.status,
        createdAt: r.createdAt,
        reporter: pub(state.users.find((u) => u.id === r.reporterId)),
        target: r.targetKind === 'user' ? pub(state.users.find((u) => u.id === r.targetId)) : null
      }))
    };
  },

  async closeReport(id, status) {
    const user = needMod();
    const report = state.reports.find((r) => r.id === id);
    if (report) {
      report.status = status || 'closed';
      report.handledBy = user.id;
      report.handledAt = Date.now();
    }
    save();
    return { ok: true };
  },

  async modQueue() {
    const user = needMod();
    return {
      posts: state.posts.slice().sort((a, b) => b.id - a.id).slice(0, 60).map((p) => shapePost(p, user.id))
    };
  },

  async removePost(id, reason) {
    const user = needMod();
    const post = state.posts.find((p) => p.id === id);
    if (!post) fail('Пост не найден');
    if (!String(reason || '').trim()) fail('Нужна причина');
    post.removed = true;
    post.removedBy = user.id;
    post.removedReason = reason;
    post.removedAt = Date.now();
    state.punishments.unshift({
      id: next('punishments'),
      actorId: user.id,
      userId: post.authorId,
      kind: 'post_removed',
      minutes: 0,
      reason,
      postId: id,
      createdAt: Date.now(),
      reverted: false
    });
    log(user.id, 'post.remove', { id, reason });
    save();
    return { ok: true };
  },

  async punish({ userId, kind, minutes, reason }) {
    const user = needMod();
    const target = state.users.find((u) => u.id === userId);
    if (!target) fail('Пользователь не найден');
    if (target.isAdmin) fail('Нельзя наказать админа');
    if (!String(reason || '').trim()) fail('Нужна причина');
    const until = Date.now() + (minutes || 0) * 60000;
    if (kind === 'mute') target.mutedUntil = until;
    if (kind === 'ban') {
      target.bannedUntil = until;
      target.banReason = reason;
      state.sessions = state.sessions.filter((s) => s.userId !== target.id);
    }
    state.punishments.unshift({
      id: next('punishments'),
      actorId: user.id,
      userId,
      kind,
      minutes: minutes || 0,
      reason,
      postId: null,
      createdAt: Date.now(),
      reverted: false
    });
    log(user.id, 'mod.punish', { userId, kind, minutes });
    save();
    return { ok: true };
  },

  async strikes(userId) {
    const user = needMod();
    const id = userId || user.id;
    return { strikes: state.strikes.filter((s) => s.moderatorId === id) };
  },

  async adminStats() {
    needAdmin();
    const now = Date.now();
    const daily = [];
    for (let i = 6; i >= 0; i--) {
      const from = now - (i + 1) * 86400000;
      const to = now - i * 86400000;
      daily.push({
        day: new Date(to).toLocaleDateString('ru-RU', { weekday: 'short' }),
        posts: state.posts.filter((p) => p.createdAt >= from && p.createdAt < to).length,
        users: state.users.filter((u) => u.createdAt >= from && u.createdAt < to).length,
        messages: state.messages.filter((m) => m.createdAt >= from && m.createdAt < to).length
      });
    }
    const moodCount = {};
    for (const post of state.posts) {
      if (post.removed) continue;
      moodCount[post.mood] = (moodCount[post.mood] || 0) + 1;
    }
    return {
      stats: {
        users: state.users.length,
        online: state.users.filter((u) => u.lastSeen > now - 300000).length,
        newToday: state.users.filter((u) => u.createdAt > now - 86400000).length,
        posts: state.posts.filter((p) => !p.removed).length,
        postsWeek: state.posts.filter((p) => p.createdAt > now - 7 * 86400000).length,
        messages: state.messages.length,
        chats: state.chats.length,
        reportsOpen: state.reports.filter((r) => r.status === 'open').length,
        banned: state.users.filter((u) => u.bannedUntil > now).length,
        moderators: state.users.filter((u) => u.isModerator).length,
        moods: Object.entries(moodCount).map(([mood, n]) => ({ mood, n })).sort((a, b) => b.n - a.n),
        daily
      }
    };
  },

  async adminUsers(query) {
    needAdmin();
    const q = String(query || '').toLowerCase().replace(/^@/, '');
    return {
      users: state.users
        .filter((u) => !q || u.username.includes(q) || u.displayName.toLowerCase().includes(q))
        .sort((a, b) => b.id - a.id)
        .map((u) => ({ ...pub(u), strikes: state.strikes.filter((s) => s.moderatorId === u.id).length }))
    };
  },

  async setFlags(id, flags) {
    const admin = needAdmin();
    const target = state.users.find((u) => u.id === id);
    if (!target) fail('Пользователь не найден');
    if (flags.clearAll) {
      target.isModerator = false;
      target.isDeveloper = false;
      target.isVerified = false;
      if (target.username !== 'vanya8') target.isAdmin = false;
    } else {
      for (const key of ['isAdmin', 'isModerator', 'isDeveloper', 'isVerified']) {
        if (flags[key] !== undefined) target[key] = !!flags[key];
      }
    }
    if (target.username === 'vanya8') target.isAdmin = true;
    if (flags.isModerator) state.strikes = state.strikes.filter((s) => s.moderatorId !== id);
    log(admin.id, 'admin.flags', { id, flags });
    save();
    return { user: pub(target) };
  },

  async setState(id, { action, minutes, reason }) {
    const admin = needAdmin();
    const target = state.users.find((u) => u.id === id);
    if (!target) fail('Пользователь не найден');
    if (target.username === 'vanya8') fail('Нельзя ограничить основателя');
    const until = Date.now() + (minutes || 0) * 60000;
    if (action === 'ban') {
      target.bannedUntil = until;
      target.banReason = reason || '';
      state.sessions = state.sessions.filter((s) => s.userId !== id);
    }
    if (action === 'unban') {
      target.bannedUntil = 0;
      target.banReason = '';
    }
    if (action === 'mute') target.mutedUntil = until;
    if (action === 'unmute') target.mutedUntil = 0;
    state.punishments.unshift({
      id: next('punishments'),
      actorId: admin.id,
      userId: id,
      kind: action,
      minutes: minutes || 0,
      reason: reason || '',
      postId: null,
      createdAt: Date.now(),
      reverted: false
    });
    log(admin.id, 'admin.state', { id, action, minutes });
    save();
    return { user: pub(target) };
  },

  async adminActions() {
    needAdmin();
    return {
      actions: state.punishments.map((p) => ({
        id: p.id,
        kind: p.kind,
        minutes: p.minutes,
        reason: p.reason,
        postId: p.postId,
        createdAt: p.createdAt,
        reverted: p.reverted,
        actor: pub(state.users.find((u) => u.id === p.actorId)),
        target: pub(state.users.find((u) => u.id === p.userId))
      }))
    };
  },

  async revertAction(id, { strike, reason } = {}) {
    const admin = needAdmin();
    const action = state.punishments.find((p) => p.id === id);
    if (!action) fail('Действие не найдено');
    if (action.reverted) fail('Уже отменено');
    if (action.kind === 'post_removed' && action.postId) {
      const post = state.posts.find((p) => p.id === action.postId);
      if (post) {
        post.removed = false;
        post.removedBy = null;
        post.removedReason = '';
      }
    }
    const target = state.users.find((u) => u.id === action.userId);
    if (target && action.kind === 'mute') target.mutedUntil = 0;
    if (target && action.kind === 'ban') target.bannedUntil = 0;
    action.reverted = true;
    let strikes = null;
    if (strike && action.actorId) strikes = applyStrike(action.actorId, admin.id, reason || 'Необоснованное действие');
    log(admin.id, 'admin.revert', { id, strikes });
    save();
    return { ok: true, strikes };
  },

  async adminAudit() {
    needAdmin();
    return {
      entries: state.audit.map((a) => ({
        id: a.id,
        action: a.action,
        meta: a.meta,
        createdAt: a.createdAt,
        actor: pub(state.users.find((u) => u.id === a.actorId))
      }))
    };
  },

  async saveScore(game, score) {
    const user = me();
    if (!user) return { ok: true };
    state.scores.push({ id: next('scores'), userId: user.id, game, score, createdAt: Date.now() });
    save();
    return { ok: true };
  },

  async leaderboard(game) {
    const best = new Map();
    for (const row of state.scores.filter((s) => s.game === game)) {
      if (!best.has(row.userId) || best.get(row.userId) < row.score) best.set(row.userId, row.score);
    }
    return {
      leaderboard: [...best.entries()]
        .map(([userId, score]) => ({ ...pub(state.users.find((u) => u.id === userId)), score }))
        .filter((r) => r.id)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
    };
  },

  reset() {
    localStorage.removeItem(KEY);
    localStorage.removeItem(SESSION_KEY);
    state = load();
  }
};
