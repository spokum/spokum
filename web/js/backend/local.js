import { uid } from '../util.js';

const KEY = 'spokum.db.v3';
const SESSION_KEY = 'spokum.session.v3';
const MOODS = ['calm', 'joy', 'sad', 'anger', 'anxiety', 'tired', 'love', 'inspired'];

function blank() {
  return {
    seq: { users: 0, posts: 0, comments: 0, chats: 0, messages: 0, reports: 0, punishments: 0, strikes: 0, audit: 0, scores: 0, stories: 0, stickerPack: 0 },
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
    journal: [],
    stories: [],
    stickerPack: [],
    punishments: [],
    strikes: [],
    audit: [],
    scores: [],
    devices: [],
    deviceUsers: [],
    deviceBans: [],
    coinLog: [],
    follows: [],
    thanks: [],
    gifts: [],
    campRooms: [],
    campSeats: [],
    campMessages: [],
    letters: [],
    capsules: [],
    mentorships: [],
    mentorReviews: []
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
  if (!state.seq[kind]) state.seq[kind] = 0;
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

function normalizePins(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((pin, index) => {
      if (typeof pin === 'string') {
        return { image: pin, x: [12, 78, 12, 78][index] ?? 50, y: [16, 16, 66, 66][index] ?? 50 };
      }
      if (pin && typeof pin.image === 'string') {
        return {
          image: pin.image,
          x: Math.min(94, Math.max(2, Number(pin.x) || 50)),
          y: Math.min(90, Math.max(2, Number(pin.y) || 50))
        };
      }
      return null;
    })
    .filter(Boolean)
    .slice(0, 4);
}

function aliasesOf(user) {
  const list = Array.isArray(user?.aliases) ? user.aliases : [];
  return [user.username, ...list.filter((name) => name !== user.username)];
}

function ownerOf(name) {
  const clean = String(name || '').toLowerCase().replace(/^@/, '');
  return state.users.find((u) => aliasesOf(u).includes(clean));
}

export const RANKS = ['Стажёр', 'Младший модератор', 'Модератор', 'Старший модератор', 'Ведущий модератор', 'Начальник модераторов'];

function deservedRank(score, strikes) {
  if (strikes >= 2) return 0;
  if (score >= 400) return 4;
  if (score >= 150) return 3;
  if (score >= 50) return 2;
  if (score >= 10) return 1;
  return 0;
}

function banState(id) {
  const ban = (state.deviceBans || [])
    .filter((b) => b.deviceId === id && !b.liftedAt && (b.until === null || b.until > Date.now()))
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!ban) return { blocked: false };
  return { blocked: true, until: ban.until, forever: ban.until === null, reason: ban.reason };
}

export const GIFT_TYPES = [
  { id: 'leaf', title: 'Листок', price: 40, rarity: 'common', art: 'leaf', hue: 140 },
  { id: 'cup', title: 'Тёплый чай', price: 60, rarity: 'common', art: 'cup', hue: 30 },
  { id: 'star', title: 'Звезда', price: 90, rarity: 'common', art: 'star', hue: 45 },
  { id: 'heart', title: 'Сердце', price: 120, rarity: 'rare', art: 'heart', hue: 350 },
  { id: 'moon', title: 'Луна', price: 180, rarity: 'rare', art: 'moon', hue: 230 },
  { id: 'wave', title: 'Волна', price: 220, rarity: 'rare', art: 'wave', hue: 200 },
  { id: 'flame', title: 'Огонёк', price: 300, rarity: 'epic', art: 'flame', hue: 20 },
  { id: 'crystal', title: 'Кристалл', price: 450, rarity: 'epic', art: 'crystal', hue: 190 },
  { id: 'crown', title: 'Корона', price: 700, rarity: 'legend', art: 'crown', hue: 45 },
  { id: 'comet', title: 'Комета', price: 1200, rarity: 'legend', art: 'comet', hue: 265 }
];

const ALIAS_WORDS = ['Ветер', 'Туман', 'Ветка', 'Камень', 'Иней', 'Свет', 'Тень', 'Роса', 'Пепел', 'Искра', 'Тихий', 'Дальний', 'Ночной', 'Снежный', 'Лесной', 'Серый', 'Мятный', 'Синий'];

function pickAlias() {
  const one = ALIAS_WORDS[Math.floor(Math.random() * ALIAS_WORDS.length)];
  const two = ALIAS_WORDS[Math.floor(Math.random() * ALIAS_WORDS.length)];
  return `${one} ${two}`;
}

function ensureNewTables() {
  for (const key of ['coinLog', 'gifts', 'campRooms', 'campSeats', 'campMessages', 'letters', 'capsules', 'mentorships', 'mentorReviews']) {
    if (!Array.isArray(state[key])) state[key] = [];
  }
}

function giftType(id) {
  return GIFT_TYPES.find((row) => row.id === id);
}

function sweepCampfire() {
  const hour = Date.now() - 3600000;
  state.campMessages = state.campMessages.filter((row) => row.createdAt > hour);
  const dead = state.campRooms.filter((room) => room.closesAt < Date.now()).map((room) => room.id);
  if (dead.length) {
    state.campRooms = state.campRooms.filter((room) => !dead.includes(room.id));
    state.campSeats = state.campSeats.filter((seat) => !dead.includes(seat.roomId));
    state.campMessages = state.campMessages.filter((row) => !dead.includes(row.roomId));
  }
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
    modRank: user.modRank || 0,
    isBeta: !!user.isBeta || user.username === 'silver',
    coins: user.coins || 0,
    streakDays: user.streakDays || 0,
    bestStreak: user.bestStreak || 0,
    bannedUntil: user.bannedUntil,
    mutedUntil: user.mutedUntil,
    createdAt: user.createdAt,
    lastSeen: user.lastSeen,
    pins: normalizePins(user.pins),
    banner: user.banner || null,
    dayWord: user.dayWord || null,
    dayWordAt: user.dayWordAt || 0,
    shareWord: !!user.shareWord,
    statusIcon: user.statusIcon || null,
    premiumUntil: user.premiumUntil || 0,
    premiumReason: user.premiumReason || '',
    premiumGrantedAt: user.premiumGrantedAt || 0,
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
    comments: state.comments.filter((c) => c.postId === post.id).length,
    kind: post.kind || 'text',
    media: Array.isArray(post.media) ? post.media : [],
    video: post.video || null,
    poster: post.poster || null,
    duration: post.duration || 0,
    views: post.views || 0,
    sound: post.sound || null,
    poll: post.poll || null,
    pinned: !!post.pinned,
    repostOf: post.repostOf || null,
    origin: post.repostOf ? pub(state.users.find((u) => u.id === state.posts.find((p) => p.id === post.repostOf)?.authorId)) : null
  };
}

function shapeMessage(message) {
  return {
    id: message.id,
    chatId: message.chatId,
    kind: message.kind,
    body: message.body,
    postId: message.postId || null,
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
    if (state.users.some((u) => aliasesOf(u).includes(name))) fail('Юзернейм занят');
    const salt = uid();
    const user = {
      id: next('users'),
      username: name,
      loginName: name,
      aliases: [],
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
      lastSeen: Date.now(),
      premiumUntil: 0,
      premiumReason: '',
      premiumGrantedAt: 0,
      pins: [],
      statusIcon: null,
      banner: null,
      dayWord: null,
      dayWordAt: 0,
      shareWord: false
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
    const user = ownerOf(name);
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
    if (patch.pins !== undefined) user.pins = normalizePins(patch.pins);
    if (patch.banner !== undefined) user.banner = patch.banner;
    if (patch.dayWord !== undefined) {
      user.dayWord = patch.dayWord;
      user.dayWordAt = Date.now();
    }
    if (patch.shareWord !== undefined) user.shareWord = !!patch.shareWord;
    if (patch.statusIcon !== undefined) user.statusIcon = patch.statusIcon;
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

  async saveSession() {
    return { token: currentToken() };
  },

  async useSession(tokens) {
    if (!tokens?.token) fail('Сессия не сохранена, войдите заново');
    localStorage.setItem(SESSION_KEY, tokens.token);
    const user = me();
    if (!user) fail('Сессия устарела, войдите заново');
    return { user: priv(user) };
  },

  async notifications() {
    const user = need();
    const items = (state.notifications || []).filter((n) => n.userId === user.id).sort((a, b) => b.createdAt - a.createdAt);
    return { items, unread: items.filter((n) => !n.read).length };
  },

  async unreadNotifications() {
    const user = me();
    if (!user) return { count: 0 };
    return { count: (state.notifications || []).filter((n) => n.userId === user.id && !n.read).length };
  },

  async readNotifications() {
    const user = need();
    (state.notifications || []).forEach((n) => {
      if (n.userId === user.id) n.read = true;
    });
    save();
    return { ok: true };
  },

  async clearNotifications() {
    const user = need();
    state.notifications = (state.notifications || []).filter((n) => n.userId !== user.id);
    save();
    return { ok: true };
  },

  async linkCode() {
    need();
    fail('Оплата работает только на сервере, локальный режим её не поддерживает');
  },

  async billing() {
    return { telegram: null, payments: [] };
  },

  async myUsernames() {
    const user = need();
    return { names: aliasesOf(user), limit: user.premiumUntil > Date.now() ? 8 : 3 };
  },

  async addUsername(name) {
    const user = need();
    const clean = String(name || '').toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_]{3,20}$/.test(clean)) fail('Юзернейм: 3-20 символов, латиница, цифры и _');
    if (aliasesOf(user).includes(clean)) return { username: clean };
    if (state.users.some((u) => aliasesOf(u).includes(clean))) fail('Юзернейм занят');
    const limit = user.premiumUntil > Date.now() ? 8 : 3;
    if (aliasesOf(user).length >= limit) fail(`Больше юзернеймов не поместится: лимит ${limit}`);
    user.aliases = [...aliasesOf(user).filter((n) => n !== user.username), clean];
    save();
    return { username: clean };
  },

  async dropUsername(name) {
    const user = need();
    const clean = String(name || '').toLowerCase().replace(/^@/, '');
    if (clean === user.username) fail('Это основной юзернейм, сначала выберите другой основным');
    if (clean === (user.loginName || user.aliases?.[0])) fail('С этим юзернеймом вы входите в аккаунт, его убрать нельзя');
    user.aliases = aliasesOf(user).filter((n) => n !== clean && n !== user.username);
    save();
    return { ok: true };
  },

  async setMainUsername(name) {
    const user = need();
    const clean = String(name || '').toLowerCase().replace(/^@/, '');
    if (!aliasesOf(user).includes(clean)) fail('Этот юзернейм вам не принадлежит');
    const rest = aliasesOf(user).filter((n) => n !== clean);
    user.username = clean;
    user.aliases = rest;
    save();
    return { user: priv(user) };
  },

  async searchUsers(query) {
    const q = String(query || '').toLowerCase().replace(/^@/, '');
    return {
      users: state.users
        .filter(
          (u) =>
            !q ||
            aliasesOf(u).some((name) => name.includes(q)) ||
            u.displayName.toLowerCase().includes(q) ||
            u.bio.toLowerCase().includes(q)
        )
        .slice(0, 40)
        .map(pub)
    };
  },

  async getUser(name) {
    const user = ownerOf(name);
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

  async listPosts({ mood, kind, before, limit, includeRemoved } = {}) {
    const viewer = me();
    const size = Math.min(40, Math.max(4, Number(limit) || 12));
    const all = state.posts
      .filter((p) => (includeRemoved || !p.removed) && (!mood || p.mood === mood))
      .filter((p) => {
        const own = p.kind || 'text';
        if (kind === 'reels') return own === 'video' || own === 'album';
        if (kind === 'feed') return own === 'text';
        if (kind === 'video' || kind === 'album') return own === kind;
        return true;
      })
      .filter((p) => (before ? p.createdAt < Number(before) : true))
      .sort((a, b) => b.createdAt - a.createdAt);
    const posts = all.slice(0, size).map((p) => shapePost(p, viewer?.id));
    return { posts, more: all.length > size, cursor: posts.length ? posts[posts.length - 1].createdAt : null };
  },

  async listAnnouncements() {
    const now = Date.now();
    return { announcements: (state.announcements || []).filter((a) => a.until > now).sort((a, b) => b.createdAt - a.createdAt) };
  },

  async createAnnouncement({ title, body, tone, days }) {
    const user = need();
    if (!user.isAdmin) fail('Нет прав');
    state.announcements = state.announcements || [];
    state.announcements.push({
      id: next('announcements'),
      title: String(title || '').slice(0, 80),
      body: String(body || '').slice(0, 600),
      tone: tone || 'info',
      createdAt: Date.now(),
      until: Date.now() + Math.max(1, Number(days) || 7) * 86400000
    });
    save();
    return { ok: true };
  },

  async deleteAnnouncement(id) {
    const user = need();
    if (!user.isAdmin) fail('Нет прав');
    state.announcements = (state.announcements || []).filter((a) => a.id !== id);
    save();
    return { ok: true };
  },

  async bumpViews(id) {
    const post = state.posts.find((p) => p.id === id);
    if (post) {
      post.views = (post.views || 0) + 1;
      save();
    }
    return { ok: true };
  },

  async uploadMedia(dataUrl) {
    return dataUrl;
  },

  async callSignal() {
    return { ok: true };
  },

  async callInbox() {
    return { signals: [] };
  },

  async callClear() {
    return { ok: true };
  },

  async wipePosts(userId) {
    const user = need();
    if (!user.isAdmin) fail('Нет прав');
    const before = state.posts.length;
    state.posts = state.posts.filter((p) => p.authorId !== userId);
    save();
    return { removed: before - state.posts.length };
  },

  async resetLook(userId) {
    const user = need();
    if (!user.isAdmin) fail('Нет прав');
    const target = state.users.find((u) => u.id === userId);
    if (!target) fail('Пользователь не найден');
    target.avatar = null;
    target.banner = null;
    target.statusIcon = null;
    target.pins = [];
    target.bio = '';
    save();
    return { ok: true };
  },

  async renameUser(userId, name) {
    const user = need();
    if (!user.isAdmin) fail('Нет прав');
    const target = state.users.find((u) => u.id === userId);
    if (!target) fail('Пользователь не найден');
    target.displayName = String(name || '').slice(0, 40) || target.displayName;
    save();
    return { ok: true };
  },

  async createPost({ text, image, mood, kind, media, video, poster, duration, sound, poll }) {
    const user = need();
    notMuted(user);
    const body = String(text || '').trim().slice(0, 5000);
    const album = Array.isArray(media) ? media.filter(Boolean).slice(0, 10) : [];
    if (!body && !image && !album.length && !video && !poll) fail('Пустой пост');
    const post = {
      id: next('posts'),
      authorId: user.id,
      text: body,
      image: image || album[0] || poster || null,
      kind: kind || (video ? 'video' : album.length > 1 ? 'album' : 'text'),
      media: album,
      sound: sound || null,
      poll: poll || null,
      pinned: false,
      video: video || null,
      poster: poster || null,
      duration: Math.max(0, Math.round(Number(duration) || 0)),
      views: 0,
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
    const twin = state.comments.some(
      (c) => c.postId === id && c.authorId === user.id && c.text === body && Date.now() - c.createdAt < 10000
    );
    if (!twin) {
      state.comments.push({ id: next('comments'), postId: id, authorId: user.id, text: body, createdAt: Date.now() });
      save();
    }
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

  async removePost(id, reason, proof) {
    const user = needMod();
    const post = state.posts.find((p) => p.id === id);
    if (!post) fail('Пост не найден');
    if (!String(reason || '').trim()) fail('Нужна причина');
    if (!String(proof || '').trim()) fail('Приложите снимок нарушения, без него снять запись нельзя');
    post.removed = true;
    post.removedBy = user.id;
    post.removedReason = reason;
    post.removedProof = proof;
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

  async touchDevice(info, fresh) {
    if (!state.devices) { state.devices = []; state.deviceUsers = []; state.deviceBans = []; }
    const who = me();
    let device = state.devices.find((d) => d.id === info.id);
    if (!device) {
      device = { id: info.id, label: '', platform: '', country: '', app: 'web', firstSeen: Date.now(), lastSeen: Date.now() };
      state.devices.push(device);
    }
    device.lastSeen = Date.now();
    for (const key of ['label', 'platform', 'country', 'app']) if (info[key]) device[key] = info[key];

    if (who) {
      let link = state.deviceUsers.find((l) => l.deviceId === info.id && l.userId === who.id);
      if (!link) {
        link = { deviceId: info.id, userId: who.id, firstSeen: Date.now(), lastSeen: Date.now() };
        state.deviceUsers.push(link);
      }
      link.lastSeen = Date.now();
    }

    const state_ = banState(info.id);
    if (state_.blocked && fresh && who && !who.isAdmin) {
      who.bannedUntil = state_.forever ? Date.now() + 3153600000000 : state_.until;
      who.banReason = 'Регистрация с заблокированного устройства';
    }
    save();
    return { state: state_ };
  },

  async deviceState(id) {
    return { state: banState(id) };
  },

  async userInfo(id) {
    needMod();
    const target = state.users.find((u) => u.id === id);
    if (!target) fail('Человек не найден');
    const links = (state.deviceUsers || []).filter((l) => l.userId === id);
    const devices = links
      .map((link) => {
        const device = (state.devices || []).find((d) => d.id === link.deviceId);
        if (!device) return null;
        return {
          ...device,
          firstSeen: link.firstSeen,
          lastSeen: link.lastSeen,
          accounts: (state.deviceUsers || []).filter((l) => l.deviceId === device.id).length,
          ban: banState(device.id)
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.lastSeen - a.lastSeen);
    return {
      info: {
        id: target.id,
        username: target.username,
        displayName: target.displayName,
        createdAt: target.createdAt,
        lastSeen: target.lastSeen,
        bannedUntil: target.bannedUntil || 0,
        mutedUntil: target.mutedUntil || 0,
        banReason: target.banReason || '',
        isModerator: !!target.isModerator,
        isAdmin: !!target.isAdmin,
        rank: target.modRank || 0,
        rankName: target.isAdmin && !target.modRank ? 'Администратор' : RANKS[target.modRank || 0],
        posts: state.posts.filter((p) => p.authorId === id).length,
        comments: state.comments.filter((c) => c.authorId === id).length,
        reportsOn: state.reports.filter((r) => r.targetUser === id || (r.targetKind === 'user' && String(r.targetId) === String(id))).length,
        reportsBy: state.reports.filter((r) => r.reporterId === id).length,
        punishments: state.punishments.filter((p) => p.userId === id).length,
        countries: [...new Set(devices.map((d) => d.country).filter(Boolean))],
        devices
      }
    };
  },

  async banDevice(id, minutes, reason) {
    const me = needMod();
    if (!String(reason || '').trim()) fail('Нужна причина');
    const device = (state.devices || []).find((d) => d.id === id);
    if (!device) fail('Устройство не найдено');
    const owners = (state.deviceUsers || []).filter((l) => l.deviceId === id);
    if (owners.some((l) => state.users.find((u) => u.id === l.userId)?.isAdmin)) fail('На этом устройстве заходил админ');
    (state.deviceBans || []).forEach((ban) => {
      if (ban.deviceId === id && !ban.liftedAt) ban.liftedAt = Date.now();
    });
    state.deviceBans.push({
      id: state.deviceBans.length + 1,
      deviceId: id,
      until: minutes > 0 ? Date.now() + minutes * 60000 : null,
      reason,
      actorId: me.id,
      createdAt: Date.now(),
      liftedAt: null
    });
    log(me.id, 'device.ban', { device: id, minutes, reason });
    save();
    return { ok: true, until: minutes > 0 ? Date.now() + minutes * 60000 : null, accounts: owners.length };
  },

  async unbanDevice(id) {
    const admin = needAdmin();
    (state.deviceBans || []).forEach((ban) => {
      if (ban.deviceId === id && !ban.liftedAt) ban.liftedAt = Date.now();
    });
    log(admin.id, 'device.unban', { device: id });
    save();
    return { ok: true };
  },

  async modTeam() {
    needAdmin();
    const team = state.users
      .filter((u) => u.isModerator || u.isAdmin)
      .map((u) => {
        const removals = state.punishments.filter((p) => p.actorId === u.id && p.kind === 'post_removed').length;
        const punishments = state.punishments.filter((p) => p.actorId === u.id && ['warn', 'mute', 'ban'].includes(p.kind)).length;
        const reports = state.reports.filter((r) => r.handledBy === u.id).length;
        const strikes = state.strikes.filter((s) => s.moderatorId === u.id).length;
        const score = removals + punishments + reports;
        return {
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          avatar: u.avatar || null,
          hue: u.hue,
          isAdmin: !!u.isAdmin,
          rank: u.modRank || 0,
          rankName: u.isAdmin && !u.modRank ? 'Администратор' : RANKS[u.modRank || 0],
          since: u.createdAt,
          lastSeen: u.lastSeen,
          removals,
          punishments,
          reports,
          strikes,
          recent: state.punishments.filter((p) => p.actorId === u.id && p.createdAt > Date.now() - 30 * 86400000).length,
          lastAction: state.punishments.filter((p) => p.actorId === u.id).map((p) => p.createdAt).sort((a, b) => b - a)[0] || 0,
          score,
          deserved: deservedRank(score, strikes)
        };
      })
      .sort((a, b) => b.score - a.score);
    return { team };
  },

  async setRank(id, rank) {
    const admin = needAdmin();
    if (rank < 0 || rank > 5) fail('Звание от 0 до 5');
    const target = state.users.find((u) => u.id === id);
    if (!target) fail('Пользователь не найден');
    if (!target.isModerator && !target.isAdmin) fail('Звание только для модераторов');
    target.modRank = rank;
    log(admin.id, 'mod.rank', { id, rank });
    save();
    return { ok: true, rank, rankName: RANKS[rank] };
  },

  async grantCoins(amount, reason) {
    ensureNewTables();
    const user = need();
    const give = Math.min(Math.max(Number(amount) || 0, 0), 40);
    if (!give) return { added: 0, coins: user.coins || 0 };
    const day = Date.now() - 86400000;
    const today = state.coinLog
      .filter((row) => row.userId === user.id && row.amount > 0 && row.createdAt > day)
      .reduce((sum, row) => sum + row.amount, 0);
    const left = Math.max(0, 300 - today);
    const added = Math.min(give, left);
    if (!added) return { added: 0, coins: user.coins || 0, limit: true };
    user.coins = (user.coins || 0) + added;
    state.coinLog.unshift({ id: state.coinLog.length + 1, userId: user.id, amount: added, reason: reason || '', createdAt: Date.now() });
    save();
    return { added, coins: user.coins };
  },

  async coinLog() {
    ensureNewTables();
    const user = need();
    return { rows: state.coinLog.filter((row) => row.userId === user.id).slice(0, 40) };
  },

  async giftTypes() {
    return { types: GIFT_TYPES.map((row, index) => ({ ...row, sort: index })) };
  },

  async gifts(userId) {
    ensureNewTables();
    const id = userId || me()?.id;
    return {
      gifts: state.gifts
        .filter((row) => row.ownerId === id && !row.sold)
        .map((row) => {
          const kind = giftType(row.typeId) || {};
          const from = state.users.find((u) => u.id === row.fromId);
          return {
            id: row.id,
            typeId: row.typeId,
            title: kind.title || row.typeId,
            price: kind.price || 0,
            rarity: kind.rarity || 'common',
            art: kind.art || 'spark',
            hue: kind.hue ?? 220,
            note: row.note || '',
            pinned: !!row.pinned,
            createdAt: row.createdAt,
            from: from ? { username: from.username, displayName: from.displayName, avatar: from.avatar, hue: from.hue } : null
          };
        })
        .sort((a, b) => b.id - a.id)
    };
  },

  async buyGift(typeId, userId, note) {
    ensureNewTables();
    const user = need();
    notMuted(user);
    const kind = giftType(typeId);
    if (!kind) fail('Подарок не найден');
    const target = state.users.find((u) => u.id === userId);
    if (!target) fail('Человек не найден');
    if ((user.coins || 0) < kind.price) fail(`Не хватает монет: нужно ${kind.price}, у вас ${user.coins || 0}`);
    user.coins -= kind.price;
    state.coinLog.unshift({ id: state.coinLog.length + 1, userId: user.id, amount: -kind.price, reason: 'Подарок ' + kind.title, createdAt: Date.now() });
    const gift = { id: state.gifts.length + 1, typeId, ownerId: target.id, fromId: user.id, note: String(note || '').slice(0, 200), pinned: false, sold: false, createdAt: Date.now() };
    state.gifts.push(gift);

    if (target.id !== user.id) {
      let room = state.chats.find((c) => c.kind === 'dm'
        && state.members.some((m) => m.chatId === c.id && m.userId === user.id)
        && state.members.some((m) => m.chatId === c.id && m.userId === target.id));
      if (!room) {
        room = { id: next('chats'), kind: 'dm', title: '', hue: 220, ownerId: user.id, createdAt: Date.now() };
        state.chats.push(room);
        state.members.push({ chatId: room.id, userId: user.id, role: 'owner', readAt: 0 });
        state.members.push({ chatId: room.id, userId: target.id, role: 'member', readAt: 0 });
      }
      state.messages.push({
        id: next('messages'),
        chatId: room.id,
        authorId: user.id,
        kind: 'gift',
        body: `${user.displayName} дарит вам ${kind.title}${String(note || '').trim() ? '. ' + String(note).trim().slice(0, 200) : ''}`,
        media: null,
        duration: 0,
        createdAt: Date.now(),
        removed: false
      });
    }
    save();
    return { ok: true, gift: gift.id, coins: user.coins };
  },

  async sellGift(id) {
    ensureNewTables();
    const user = need();
    const gift = state.gifts.find((row) => row.id === id);
    if (!gift) fail('Подарок не найден');
    if (gift.ownerId !== user.id) fail('Это не ваш подарок');
    if (gift.sold) fail('Подарок уже продан');
    const kind = giftType(gift.typeId) || { price: 0, title: '' };
    const paid = Math.max(1, Math.floor((kind.price * 70) / 100));
    const fee = Math.max(1, Math.floor((kind.price * 15) / 100));
    gift.sold = true;
    gift.pinned = false;
    user.coins = (user.coins || 0) + paid;
    state.coinLog.unshift({ id: state.coinLog.length + 1, userId: user.id, amount: paid, reason: 'Продажа: ' + kind.title, createdAt: Date.now() });
    const boss = state.users.find((u) => u.username === 'vanya8');
    if (boss) boss.coins = (boss.coins || 0) + fee;
    save();
    return { ok: true, paid, fee, coins: user.coins };
  },

  async pinGift(id, on) {
    ensureNewTables();
    const user = need();
    const gift = state.gifts.find((row) => row.id === id && row.ownerId === user.id && !row.sold);
    if (!gift) fail('Подарок не найден');
    if (on && state.gifts.filter((row) => row.ownerId === user.id && row.pinned && !row.sold).length >= 6) {
      fail('На витрине помещается шесть подарков');
    }
    gift.pinned = !!on;
    save();
    return { ok: true };
  },

  async campfireJoin() {
    ensureNewTables();
    const user = need();
    notMuted(user);
    sweepCampfire();
    const seat = state.campSeats.find((row) => row.userId === user.id && state.campRooms.some((r) => r.id === row.roomId));
    if (seat) return { room: seat.roomId, alias: seat.alias };
    let room = state.campRooms.find((r) => state.campSeats.filter((s) => s.roomId === r.id).length < 10);
    if (!room) {
      room = { id: state.campRooms.length + 1, title: 'Костёр', createdAt: Date.now(), closesAt: Date.now() + 3600000 };
      state.campRooms.push(room);
    }
    const alias = pickAlias();
    state.campSeats.push({ roomId: room.id, userId: user.id, alias, joinedAt: Date.now() });
    save();
    return { room: room.id, alias };
  },

  async campfireSay(room, body) {
    ensureNewTables();
    const user = need();
    notMuted(user);
    if (!String(body || '').trim()) fail('Пустое сообщение');
    const seat = state.campSeats.find((row) => row.roomId === room && row.userId === user.id);
    if (!seat) fail('Вы не у этого костра');
    state.campMessages.push({
      id: state.campMessages.length + 1,
      roomId: room,
      authorId: user.id,
      alias: seat.alias,
      body: String(body).slice(0, 600),
      createdAt: Date.now()
    });
    save();
    return { ok: true };
  },

  async campfireRead(room, after) {
    ensureNewTables();
    const user = need();
    sweepCampfire();
    const seat = state.campSeats.find((row) => row.roomId === room && row.userId === user.id);
    if (!seat) fail('Вы не у этого костра');
    const home = state.campRooms.find((r) => r.id === room);
    return {
      alias: seat.alias,
      people: state.campSeats.filter((row) => row.roomId === room).length,
      closesAt: home?.closesAt || Date.now(),
      messages: state.campMessages
        .filter((row) => row.roomId === room && row.id > (after || 0))
        .slice(-80)
        .map((row) => ({ id: row.id, alias: row.alias, body: row.body, createdAt: row.createdAt, mine: row.alias === seat.alias }))
    };
  },

  async campfireLeave(room) {
    ensureNewTables();
    const user = need();
    state.campSeats = state.campSeats.filter((row) => !(row.roomId === room && row.userId === user.id));
    save();
    return { ok: true };
  },

  async letterSend(body) {
    ensureNewTables();
    const user = need();
    notMuted(user);
    if (String(body || '').trim().length < 10) fail('Напишите хотя бы пару строк');
    const day = Date.now() - 86400000;
    if (state.letters.filter((row) => row.authorId === user.id && row.createdAt > day).length >= 3) {
      fail('Не больше трёх писем в сутки');
    }
    const letter = { id: state.letters.length + 1, authorId: user.id, body: String(body).slice(0, 2000), createdAt: Date.now(), toId: null, takenAt: 0, reply: null, repliedAt: 0 };
    state.letters.push(letter);
    save();
    return { ok: true, letter: letter.id };
  },

  async letterTake() {
    ensureNewTables();
    const user = need();
    const free = state.letters.filter((row) => !row.takenAt && row.authorId !== user.id);
    if (!free.length) return { empty: true };
    const letter = free[Math.floor(Math.random() * free.length)];
    letter.toId = user.id;
    letter.takenAt = Date.now();
    save();
    return { id: letter.id, body: letter.body, createdAt: letter.createdAt };
  },

  async letterReply(id, answer) {
    ensureNewTables();
    const user = need();
    const letter = state.letters.find((row) => row.id === id);
    if (!letter || letter.toId !== user.id) fail('Письмо не ваше');
    if (letter.reply) fail('Ответ уже отправлен');
    if (!String(answer || '').trim()) fail('Пустой ответ');
    letter.reply = String(answer).slice(0, 2000);
    letter.repliedAt = Date.now();
    save();
    return { ok: true };
  },

  async myLetters() {
    ensureNewTables();
    const user = need();
    return { letters: state.letters.filter((row) => row.authorId === user.id).sort((a, b) => b.createdAt - a.createdAt) };
  },

  async capsuleAdd(body, days) {
    ensureNewTables();
    const user = need();
    if (!String(body || '').trim()) fail('Пустое письмо');
    if (days < 1 || days > 1825) fail('Срок от одного дня до пяти лет');
    if (state.capsules.filter((row) => row.userId === user.id && !row.openedAt).length >= 20) {
      fail('Больше двадцати капсул сразу нельзя');
    }
    const capsule = { id: state.capsules.length + 1, userId: user.id, body: String(body).slice(0, 4000), openAt: Date.now() + days * 86400000, createdAt: Date.now(), openedAt: 0 };
    state.capsules.push(capsule);
    save();
    return { ok: true, capsule: capsule.id };
  },

  async capsules() {
    ensureNewTables();
    const user = need();
    return { capsules: state.capsules.filter((row) => row.userId === user.id).sort((a, b) => a.openAt - b.openAt) };
  },

  async capsuleCheck() {
    ensureNewTables();
    const user = me();
    if (!user) return { ready: 0 };
    const ripe = state.capsules.filter((row) => row.userId === user.id && !row.openedAt && row.openAt <= Date.now());
    ripe.forEach((row) => { row.openedAt = Date.now(); });
    if (ripe.length) save();
    return { ready: ripe.length };
  },

  async capsuleDrop(id) {
    ensureNewTables();
    const user = need();
    state.capsules = state.capsules.filter((row) => !(row.id === id && row.userId === user.id));
    save();
    return { ok: true };
  },

  async mentorBoard() {
    ensureNewTables();
    const user = needMod();
    const shape = (row) => {
      const p = state.users.find((u) => u.id === row.studentId);
      if (!p) return null;
      return {
        id: p.id,
        username: p.username,
        displayName: p.displayName,
        avatar: p.avatar,
        hue: p.hue,
        rank: p.modRank || 0,
        rankName: RANKS[p.modRank || 0],
        since: row.createdAt,
        actions: state.punishments.filter((x) => x.actorId === p.id).length,
        good: state.mentorReviews.filter((x) => x.studentId === p.id && x.verdict === 'good').length,
        bad: state.mentorReviews.filter((x) => x.studentId === p.id && x.verdict !== 'good').length
      };
    };
    const mine = state.mentorships.find((row) => row.studentId === user.id && !row.endedAt);
    const mentorUser = mine && state.users.find((u) => u.id === mine.mentorId);
    return {
      students: state.mentorships.filter((row) => row.mentorId === user.id && !row.endedAt).map(shape).filter(Boolean),
      mentor: mentorUser ? { id: mentorUser.id, displayName: mentorUser.displayName, username: mentorUser.username, rankName: RANKS[mentorUser.modRank || 0], since: mine.createdAt } : null,
      reviews: state.mentorReviews
        .filter((row) => row.studentId === user.id)
        .map((row) => ({ ...row, mentor: state.users.find((u) => u.id === row.mentorId)?.displayName || '' }))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 30),
      free: state.users
        .filter((u) => u.isModerator && !u.isAdmin && u.id !== user.id && (u.modRank || 0) < 3
          && !state.mentorships.some((row) => row.studentId === u.id && !row.endedAt))
        .map((u) => ({ id: u.id, username: u.username, displayName: u.displayName, avatar: u.avatar, hue: u.hue, rankName: RANKS[u.modRank || 0] }))
    };
  },

  async mentorFeed() {
    ensureNewTables();
    const user = needMod();
    const students = state.mentorships.filter((row) => row.mentorId === user.id && !row.endedAt).map((row) => row.studentId);
    return {
      rows: state.punishments
        .filter((x) => students.includes(x.actorId))
        .slice(0, 40)
        .map((x) => ({
          id: x.id,
          kind: x.kind,
          reason: x.reason,
          minutes: x.minutes,
          createdAt: x.createdAt,
          proof: state.posts.find((p) => p.id === x.postId)?.removedProof || null,
          student: state.users.find((u) => u.id === x.actorId)?.displayName || '',
          studentId: x.actorId,
          target: state.users.find((u) => u.id === x.userId)?.displayName || '',
          review: state.mentorReviews.find((r) => r.punishmentId === x.id) || null
        }))
    };
  },

  async mentorTake(id) {
    ensureNewTables();
    const user = needMod();
    if (!user.isAdmin && (user.modRank || 0) < 3) fail('Брать учеников может старший модератор и выше');
    if (id === user.id) fail('Себя брать нельзя');
    const target = state.users.find((u) => u.id === id);
    if (!target?.isModerator) fail('Ученик должен быть модератором');
    if (state.mentorships.some((row) => row.studentId === id && !row.endedAt)) fail('У него уже есть наставник');
    state.mentorships.push({ id: state.mentorships.length + 1, mentorId: user.id, studentId: id, createdAt: Date.now(), endedAt: 0 });
    save();
    return { ok: true };
  },

  async mentorDrop(id) {
    ensureNewTables();
    const user = needMod();
    state.mentorships.forEach((row) => {
      if (row.studentId === id && !row.endedAt && (row.mentorId === user.id || user.isAdmin)) row.endedAt = Date.now();
    });
    save();
    return { ok: true };
  },

  async mentorReview(punishmentId, verdict, note) {
    ensureNewTables();
    const user = needMod();
    if (!['good', 'soft', 'hard', 'wrong'].includes(verdict)) fail('Неизвестная оценка');
    const act = state.punishments.find((x) => x.id === punishmentId);
    if (!act) fail('Решение не найдено');
    const link = state.mentorships.find((row) => row.studentId === act.actorId && !row.endedAt && row.mentorId === user.id);
    if (!link && !user.isAdmin) fail('Это не ваш ученик');
    state.mentorReviews.push({
      id: state.mentorReviews.length + 1,
      mentorId: user.id,
      studentId: act.actorId,
      punishmentId,
      verdict,
      note: String(note || '').slice(0, 500),
      createdAt: Date.now()
    });
    save();
    return { ok: true };
  },

  async repost(id, note) {
    const user = need();
    notMuted(user);
    let source = state.posts.find((p) => p.id === id && !p.removed);
    if (!source) fail('Запись не найдена');
    if (source.repostOf) {
      source = state.posts.find((p) => p.id === source.repostOf && !p.removed);
      if (!source) fail('Исходная запись пропала');
    }
    if (state.posts.some((p) => p.authorId === user.id && p.repostOf === source.id)) fail('Вы это уже репостнули');
    const fresh = {
      ...source,
      id: next('posts'),
      authorId: user.id,
      body: String(note || '').slice(0, 500),
      createdAt: Date.now(),
      removed: false,
      views: 0,
      repostOf: source.id
    };
    state.posts.unshift(fresh);
    save();
    return { ok: true, post: fresh.id };
  },

  async sendPost(chatId, postId, note) {
    const user = need();
    notMuted(user);
    const source = state.posts.find((p) => p.id === postId && !p.removed);
    if (!source) fail('Запись не найдена');
    const message = {
      id: next('messages'),
      chatId,
      authorId: user.id,
      kind: source.video ? 'video' : 'post',
      body: String(note || '').slice(0, 500),
      media: source.video || source.poster || source.image || null,
      duration: source.duration || 0,
      postId: source.id,
      createdAt: Date.now(),
      removed: false
    };
    state.messages.push(message);
    save();
    return { ok: true, message: message.id };
  },

  async setBeta(id, on) {
    const admin = needAdmin();
    const target = state.users.find((u) => u.id === id);
    if (!target) fail('Пользователь не найден');
    target.isBeta = !!on;
    log(admin.id, 'admin.beta', { id, on });
    save();
    return { ok: true };
  },

  async giveCoins(id, amount) {
    ensureNewTables();
    const admin = needAdmin();
    const target = state.users.find((u) => u.id === id);
    if (!target) fail('Пользователь не найден');
    target.coins = Math.max(0, (target.coins || 0) + amount);
    state.coinLog.unshift({ id: state.coinLog.length + 1, userId: id, amount, reason: 'От администрации', createdAt: Date.now() });
    log(admin.id, 'admin.coins', { id, amount });
    save();
    return { ok: true, coins: target.coins };
  },

  async react(id, kind) {
    const user = need();
    notMuted(user);
    if (!['heart', 'hug', 'same', 'hold', 'calm'].includes(kind)) fail('Неизвестная реакция');
    const row = state.likes.find((l) => l.postId === id && l.userId === user.id);
    if (!row) state.likes.push({ postId: id, userId: user.id, kind, createdAt: Date.now() });
    else if (row.kind === kind) state.likes = state.likes.filter((l) => l !== row);
    else row.kind = kind;
    save();
    const mine = state.likes.find((l) => l.postId === id && l.userId === user.id);
    return { total: state.likes.filter((l) => l.postId === id).length, mine: mine ? mine.kind : null };
  },

  async reactions(id) {
    const out = {};
    state.likes.filter((l) => l.postId === id).forEach((l) => {
      const kind = l.kind || 'heart';
      out[kind] = (out[kind] || 0) + 1;
    });
    return out;
  },

  async touchStreak() {
    const user = me();
    if (!user) return { days: 0 };
    const today = new Date().toISOString().slice(0, 10);
    if (user.streakDay === today) return { days: user.streakDays || 0, best: user.bestStreak || 0, same: true };
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const fresh = user.streakDay === yesterday ? (user.streakDays || 0) + 1 : 1;
    user.streakDay = today;
    user.streakDays = fresh;
    user.bestStreak = Math.max(user.bestStreak || 0, fresh);
    save();
    return { days: fresh, best: user.bestStreak, same: false };
  },

  async breatheIn(minutes) {
    const user = me();
    if (!user) return { together: 0 };
    if (!Array.isArray(state.breaths)) state.breaths = [];
    state.breaths = state.breaths.filter((row) => row.at > Date.now() - 600000 && row.userId !== user.id);
    state.breaths.push({ userId: user.id, at: Date.now(), minutes: minutes || 0 });
    save();
    return { together: state.breaths.filter((row) => row.at > Date.now() - 240000).length };
  },

  async breatheOut() {
    const user = me();
    if (user && Array.isArray(state.breaths)) {
      state.breaths = state.breaths.filter((row) => row.userId !== user.id);
      save();
    }
    return { ok: true };
  },

  async moodMap() {
    const rows = {};
    (state.deviceUsers || []).forEach((link) => {
      const device = (state.devices || []).find((d) => d.id === link.deviceId);
      if (!device?.country) return;
      if (!rows[device.country]) rows[device.country] = new Set();
      rows[device.country].add(link.userId);
    });
    return {
      rows: Object.entries(rows).map(([country, people]) => {
        const moods = {};
        state.posts.filter((p) => people.has(p.authorId) && !p.removed).forEach((p) => {
          moods[p.mood] = (moods[p.mood] || 0) + 1;
        });
        const top = Object.entries(moods).sort((a, b) => b[1] - a[1])[0];
        return { country, people: people.size, mood: top ? top[0] : null };
      }).sort((a, b) => b.people - a.people)
    };
  },

  async badges() {
    const user = me();
    if (!user) return { badges: [] };
    const posts = state.posts.filter((p) => p.authorId === user.id && !p.removed).length;
    const gifts = (state.gifts || []).filter((g) => g.ownerId === user.id && !g.sold).length;
    const letters = (state.letters || []).filter((l) => l.authorId === user.id).length;
    const camp = (state.campMessages || []).filter((m) => m.authorId === user.id).length;
    const caps = (state.capsules || []).filter((c) => c.userId === user.id).length;
    const codes = [];
    if (posts >= 1) codes.push('first_post');
    if (posts >= 25) codes.push('writer');
    if ((user.streakDays || 0) >= 7) codes.push('week');
    if ((user.bestStreak || 0) >= 30) codes.push('month');
    if (gifts >= 1) codes.push('gifted');
    if (gifts >= 10) codes.push('collector');
    if (letters >= 1) codes.push('letter');
    if (camp >= 10) codes.push('campfire');
    if (caps >= 1) codes.push('capsule');
    if ((state.letters || []).some((l) => l.toId === user.id && l.reply)) codes.push('answered');
    if (user.isModerator) codes.push('shield');
    if ((user.coins || 0) >= 1000) codes.push('rich');
    return { badges: codes.map((code) => ({ code, earnedAt: Date.now() })) };
  },

  async pollVote(id, choice) {
    const user = need();
    notMuted(user);
    if (!Array.isArray(state.pollVotes)) state.pollVotes = [];
    const post = state.posts.find((p) => p.id === id && !p.removed);
    if (!post?.poll?.options) fail('Это не опрос');
    if (choice < 0 || choice >= post.poll.options.length) fail('Такого варианта нет');
    const row = state.pollVotes.find((v) => v.postId === id && v.userId === user.id);
    if (row) row.choice = choice;
    else state.pollVotes.push({ postId: id, userId: user.id, choice, createdAt: Date.now() });
    save();
    return this.pollResult(id);
  },

  async pollResult(id) {
    if (!Array.isArray(state.pollVotes)) state.pollVotes = [];
    const user = me();
    const rows = state.pollVotes.filter((v) => v.postId === id);
    const counts = {};
    rows.forEach((v) => { counts[v.choice] = (counts[v.choice] || 0) + 1; });
    return { total: rows.length, counts, mine: rows.find((v) => v.userId === user?.id)?.choice ?? null };
  },

  async pinPost(id, on) {
    const user = need();
    const post = state.posts.find((p) => p.id === id && p.authorId === user.id);
    if (!post) fail('Это не ваша запись');
    state.posts.forEach((p) => { if (p.authorId === user.id) p.pinned = false; });
    post.pinned = !!on;
    save();
    return { ok: true };
  },

  async follow(id, on) {
    const user = need();
    notMuted(user);
    if (!Array.isArray(state.follows)) state.follows = [];
    if (id === user.id) fail('На себя подписаться нельзя');
    if (on) {
      if (!state.follows.some((f) => f.followerId === user.id && f.targetId === id)) {
        state.follows.push({ followerId: user.id, targetId: id, createdAt: Date.now() });
      }
    } else {
      state.follows = state.follows.filter((f) => !(f.followerId === user.id && f.targetId === id));
    }
    save();
    return { following: !!on, followers: state.follows.filter((f) => f.targetId === id).length };
  },

  async followState(id) {
    if (!Array.isArray(state.follows)) state.follows = [];
    const user = me();
    return {
      following: !!user && state.follows.some((f) => f.followerId === user.id && f.targetId === id),
      followers: state.follows.filter((f) => f.targetId === id).length,
      following_count: state.follows.filter((f) => f.followerId === id).length
    };
  },

  async thankMod(id, note) {
    const user = need();
    notMuted(user);
    if (!Array.isArray(state.thanks)) state.thanks = [];
    const target = state.users.find((u) => u.id === id);
    if (!target?.isModerator) fail('Это не модератор');
    if (id === user.id) fail('Себя благодарить нельзя');
    const week = Date.now() - 7 * 86400000;
    if (state.thanks.some((t) => t.fromId === user.id && t.modId === id && t.createdAt > week)) {
      fail('Вы уже благодарили этого модератора на этой неделе');
    }
    state.thanks.push({ id: state.thanks.length + 1, fromId: user.id, modId: id, note: String(note || '').slice(0, 200), createdAt: Date.now() });
    const total = state.thanks.filter((t) => t.modId === id).length;
    if (total % 5 === 0) {
      target.premiumUntil = Math.max(target.premiumUntil || 0, Date.now()) + 3 * 86400000;
      target.premiumReason = 'Благодарности от людей';
    }
    save();
    return { ok: true, total };
  },

  async modThanks(id) {
    if (!Array.isArray(state.thanks)) state.thanks = [];
    const user = me();
    const week = Date.now() - 7 * 86400000;
    return {
      total: state.thanks.filter((t) => t.modId === id).length,
      week: state.thanks.filter((t) => t.modId === id && t.createdAt > week).length,
      mine: !!user && state.thanks.some((t) => t.modId === id && t.fromId === user.id && t.createdAt > week)
    };
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
    if (flags.isModerator) {
      state.strikes = state.strikes.filter((s) => s.moderatorId !== id);
      if (!target.modRank) target.modRank = 1;
    }
    if (flags.isModerator === false && !target.isAdmin) target.modRank = 0;
    if (flags.clearAll && target.username !== 'vanya8') target.modRank = 0;
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

  async grantPremium(id, days, reason) {
    const admin = needAdmin();
    const target = state.users.find((u) => u.id === id);
    if (!target) fail('Пользователь не найден');
    if (!days || days < 1 || days > 365) fail('Срок от 1 до 365 дней');
    const base = Math.max(target.premiumUntil || 0, Date.now());
    target.premiumUntil = base + days * 86400000;
    target.premiumReason = String(reason || '').trim() || 'Без причины';
    target.premiumGrantedAt = Date.now();
    log(admin.id, 'admin.premium.grant', { id, days, reason });
    save();
    return { until: target.premiumUntil };
  },

  async revokePremium(id) {
    const admin = needAdmin();
    const target = state.users.find((u) => u.id === id);
    if (!target) fail('Пользователь не найден');
    target.premiumUntil = 0;
    target.premiumReason = '';
    target.premiumGrantedAt = 0;
    log(admin.id, 'admin.premium.revoke', { id });
    save();
    return { ok: true };
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

  async journalEntry(day) {
    const user = need();
    const entry = (state.journal || []).find((row) => row.userId === user.id && row.day === day);
    return { entry: entry ? { day: entry.day, body: entry.body, mood: entry.mood, word: entry.word } : null };
  },

  async saveJournal({ day, body, mood, word }) {
    const user = need();
    state.journal = state.journal || [];
    const existing = state.journal.find((row) => row.userId === user.id && row.day === day);
    const payload = {
      userId: user.id,
      day,
      body: String(body || '').slice(0, 2000),
      mood,
      word: word ? String(word).slice(0, 20) : null,
      createdAt: Date.now()
    };
    if (existing) Object.assign(existing, payload);
    else state.journal.push(payload);
    save();
    return { ok: true };
  },

  async journalHistory() {
    const user = need();
    return {
      entries: (state.journal || [])
        .filter((row) => row.userId === user.id)
        .sort((a, b) => b.day.localeCompare(a.day))
        .map((row) => ({ day: row.day, body: row.body, mood: row.mood, word: row.word }))
    };
  },

  async publishStory(file, caption) {
    const user = need();
    if (!(user.premiumUntil > Date.now())) fail('Истории доступны с подпиской СпокУм Премиум');
    const media = await new Promise((done, error) => {
      const reader = new FileReader();
      reader.onload = () => done(reader.result);
      reader.onerror = () => error(new Error('Не удалось прочитать файл'));
      reader.readAsDataURL(file);
    });
    if (media.length > 6_000_000) fail('Без сервера история должна весить до 4 МБ');
    state.stories = (state.stories || []).filter((row) => row.expiresAt > Date.now());
    state.stories.push({
      id: next('stories'),
      authorId: user.id,
      kind: file.type.startsWith('video') ? 'video' : 'image',
      media,
      caption: String(caption || '').slice(0, 200),
      createdAt: Date.now(),
      expiresAt: Date.now() + 86400000
    });
    save();
    return { ok: true };
  },

  async stories() {
    const now = Date.now();
    return {
      stories: (state.stories || [])
        .filter((row) => row.expiresAt > now)
        .map((row) => ({
          id: row.id,
          kind: row.kind,
          media: row.media,
          caption: row.caption,
          createdAt: row.createdAt,
          expiresAt: row.expiresAt,
          author: pub(state.users.find((u) => u.id === row.authorId))
        }))
        .filter((row) => row.author)
    };
  },

  async deleteStory(id) {
    const user = need();
    state.stories = (state.stories || []).filter((row) => !(row.id === id && (row.authorId === user.id || user.isModerator || user.isAdmin)));
    save();
    return { ok: true };
  },

  async stickers() {
    const user = need();
    return { stickers: (state.stickerPack || []).filter((row) => row.ownerId === user.id).map((row) => ({ id: row.id, image: row.image })) };
  },

  async addSticker(image) {
    const user = need();
    if (!(user.premiumUntil > Date.now())) fail('Стикеры доступны с подпиской СпокУм Премиум');
    state.stickerPack = state.stickerPack || [];
    state.stickerPack.unshift({ id: next('stickerPack'), ownerId: user.id, image, createdAt: Date.now() });
    save();
    return { ok: true };
  },

  async removeSticker(id) {
    const user = need();
    state.stickerPack = (state.stickerPack || []).filter((row) => !(row.id === id && row.ownerId === user.id));
    save();
    return { ok: true };
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
