const CLIENT_URL = 'https://esm.sh/@supabase/supabase-js@2.45.4';
const EMAIL_DOMAIN = 'spokum.app';

const ms = (value) => (value ? Date.parse(value) : 0);
const emailFor = (username) => `${username}@${EMAIL_DOMAIN}`;

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

function shapeProfile(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    loginName: row.login_name || row.username,
    displayName: row.display_name || row.username,
    bio: row.bio || '',
    hue: row.hue ?? 220,
    avatar: row.avatar || null,
    mood: row.mood || 'calm',
    theme: row.theme || 'calm',
    accent: row.accent || 'mint',
    isAdmin: !!row.is_admin,
    isModerator: !!row.is_moderator,
    isDeveloper: !!row.is_developer,
    isVerified: !!row.is_verified,
    modRank: row.mod_rank ?? 0,
    bannedUntil: ms(row.banned_until),
    mutedUntil: ms(row.muted_until),
    createdAt: ms(row.created_at),
    lastSeen: ms(row.last_seen),
    pins: normalizePins(row.pins),
    banner: row.banner || null,
    dayWord: row.day_word || null,
    dayWordAt: ms(row.day_word_at),
    shareWord: !!row.share_word,
    notifyPosts: row.notify_posts !== false,
    statusIcon: row.status_icon || null,
    premiumUntil: ms(row.premium_until),
    premiumReason: row.premium_reason || '',
    premiumGrantedAt: ms(row.premium_granted_at),
    likes: Number(row.like_count ?? extra.likes ?? 0),
    posts: Number(row.post_count ?? extra.posts ?? 0),
    strikes: Number(row.strikes ?? 0)
  };
}

function shapePost(row, likedIds) {
  return {
    id: row.id,
    text: row.body || '',
    image: row.image || null,
    mood: row.mood || 'calm',
    createdAt: ms(row.created_at),
    removed: !!row.removed,
    removedReason: row.removed_reason || '',
    author: shapeProfile(row.author),
    likes: row.likes?.[0]?.count ?? 0,
    comments: row.comments?.[0]?.count ?? 0,
    liked: likedIds ? likedIds.has(row.id) : false,
    kind: row.kind || 'text',
    media: Array.isArray(row.media) ? row.media : [],
    video: row.video || null,
    poster: row.poster || null,
    duration: row.duration || 0,
    views: row.views || 0
  };
}

function shapeMessage(row, authors) {
  return {
    id: row.id,
    chatId: row.chat_id,
    kind: row.kind,
    body: row.body || '',
    media: row.media || null,
    duration: row.duration || 0,
    createdAt: ms(row.created_at),
    author: shapeProfile(row.author || authors?.get(row.author_id))
  };
}

function guard(error) {
  if (!error) return;
  const text = error.message || 'Ошибка запроса';
  if (/abort|timed? ?out|timeout/i.test(text)) {
    throw new Error('Сервер не ответил вовремя. Попробуйте ещё раз');
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(text)) {
    throw new Error(
      navigator.onLine
        ? 'Сервер не отвечает. Проверьте адрес базы в config.js или попробуйте позже'
        : 'Нет интернета'
    );
  }
  if (/row-level security|permission denied/i.test(text)) throw new Error('Недостаточно прав');
  if (/duplicate key/i.test(text) && /username/i.test(text)) throw new Error('Юзернейм занят');
  if (/already registered|User already/i.test(text)) throw new Error('Такой аккаунт уже есть');
  if (/Invalid login credentials/i.test(text)) throw new Error('Неверный логин или пароль');
  if (/signups? (are )?disabled|signups not allowed/i.test(text)) {
    throw new Error('В Supabase выключена регистрация: Authentication → Sign In / Providers → Email → включить Allow new users to sign up');
  }
  if (/email logins are disabled|email provider/i.test(text)) {
    throw new Error('В Supabase выключен вход по почте: Authentication → Sign In / Providers → включить Email');
  }
  throw new Error(text);
}

const REQUEST_TIMEOUT = 30000;

function timedFetch(input, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  if (init.signal) {
    init.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((done) => setTimeout(() => done(fallback), ms))
  ]);
}

async function loadFactory() {
  if (window.supabase?.createClient) return window.supabase.createClient;
  const module = await import(CLIENT_URL);
  return module.createClient;
}

export async function createSupabase(url, key) {
  const createClient = await loadFactory();
  const sb = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    global: { fetch: timedFetch },
    realtime: { params: { eventsPerSecond: 4 } }
  });

  let uid = null;
  let channel = null;

  const requireUid = () => {
    if (!uid) throw new Error('Нужен вход');
    return uid;
  };

  const profileById = async (id) => {
    const { data, error } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
    guard(error);
    if (!data) return null;
    return shapeProfile(data, await counters(id));
  };

  const counters = async (id) => {
    const posts = await sb.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', id).eq('removed', false);
    const ids = await sb.from('posts').select('id').eq('author_id', id).eq('removed', false);
    let likes = 0;
    if (ids.data?.length) {
      const result = await sb
        .from('likes')
        .select('post_id', { count: 'exact', head: true })
        .in('post_id', ids.data.map((row) => row.id));
      likes = result.count || 0;
    }
    return { posts: posts.count || 0, likes };
  };

  const likedSet = async (postIds) => {
    if (!uid || !postIds.length) return new Set();
    const { data } = await sb.from('likes').select('post_id').eq('user_id', uid).in('post_id', postIds);
    return new Set((data || []).map((row) => row.post_id));
  };

  const POST_SELECT_FULL = 'id, body, image, mood, created_at, removed, removed_reason, kind, media, video, poster, duration, views, author:profiles!posts_author_id_fkey(*), likes(count), comments(count)';
  const POST_SELECT_BASE = 'id, body, image, mood, created_at, removed, removed_reason, author:profiles!posts_author_id_fkey(*), likes(count), comments(count)';
  let legacyPosts = false;
  const POST_SELECT = () => (legacyPosts ? POST_SELECT_BASE : POST_SELECT_FULL);
  const missingColumn = (error) => !!error && (error.code === '42703' || /column .* does not exist/i.test(error.message || ''));

  const listen = () => {
    if (channel || !uid) return;
    channel = sb
      .channel('spokum-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        window.dispatchEvent(new CustomEvent('spokum:message', { detail: payload.new }));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, (payload) => {
        const row = payload.new;
        window.dispatchEvent(new CustomEvent('spokum:notify', {
          detail: { id: row.id, kind: row.kind, title: row.title, body: row.body, meta: row.meta || {}, createdAt: ms(row.created_at), read: false }
        }));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_signals', filter: `to_id=eq.${uid}` }, (payload) => {
        const row = payload.new;
        window.dispatchEvent(new CustomEvent('spokum:call', {
          detail: { id: row.id, chatId: row.chat_id, fromId: row.from_id, kind: row.kind, payload: row.payload || {} }
        }));
      })
      .subscribe();
  };

  const sessionResult = await withTimeout(sb.auth.getSession(), 8000, { data: { session: null } });
  uid = sessionResult?.data?.session?.user?.id || null;
  if (uid) listen();

  sb.auth.onAuthStateChange((_event, session) => {
    uid = session?.user?.id || null;
    if (uid) listen();
  });

  return {
    mode: 'supabase',

    async register({ username, displayName, password }) {
      const name = String(username || '').toLowerCase().replace(/^@/, '');
      if (!/^[a-z0-9_]{3,20}$/.test(name)) throw new Error('Юзернейм: 3-20 символов, латиница, цифры и _');
      if (String(password || '').length < 8) throw new Error('Пароль минимум 8 символов');
      const taken = await sb.from('profiles').select('id').eq('username', name).maybeSingle();
      if (taken.data) throw new Error('Юзернейм занят');
      const alias = await sb.from('usernames').select('user_id').eq('username', name).maybeSingle();
      if (alias.data) throw new Error('Юзернейм занят');
      const { data, error } = await sb.auth.signUp({
        email: emailFor(name),
        password,
        options: { data: { username: name, display_name: displayName || name } }
      });
      guard(error);
      if (!data.session) throw new Error('Подтверждение почты включено в Supabase, выключите его в Authentication → Providers → Email');
      uid = data.user.id;
      listen();
      return { user: await profileById(uid) };
    },

    async login({ username, password }) {
      const name = String(username || '').toLowerCase().replace(/^@/, '');
      let handle = name;
      try {
        const resolved = await sb.rpc('resolve_login', { target: name });
        if (resolved.data) handle = resolved.data;
      } catch {}
      const { data, error } = await sb.auth.signInWithPassword({ email: emailFor(handle), password });
      guard(error);
      uid = data.user.id;
      const user = await profileById(uid);
      if (user.bannedUntil > Date.now()) {
        await sb.auth.signOut();
        throw new Error('Аккаунт заблокирован');
      }
      listen();
      return { user };
    },

    async logout() {
      await sb.auth.signOut();
      uid = null;
      if (channel) {
        sb.removeChannel(channel);
        channel = null;
      }
      return { ok: true };
    },

    async me() {
      if (!uid) return { user: null };
      await sb.rpc('touch_presence');
      return { user: await profileById(uid) };
    },

    async updateMe(patch) {
      const id = requireUid();
      const fields = {};
      if (patch.displayName != null) fields.display_name = String(patch.displayName).slice(0, 40);
      if (patch.bio != null) fields.bio = String(patch.bio).slice(0, 300);
      if (patch.hue != null) fields.hue = Number(patch.hue);
      if (patch.mood != null) fields.mood = patch.mood;
      if (patch.theme != null) fields.theme = patch.theme;
      if (patch.accent != null) fields.accent = patch.accent;
      if (patch.avatar !== undefined) fields.avatar = patch.avatar;
      if (patch.pins !== undefined) fields.pins = normalizePins(patch.pins);
      if (patch.banner !== undefined) fields.banner = patch.banner;
      if (patch.dayWord !== undefined) {
        fields.day_word = patch.dayWord;
        fields.day_word_at = new Date().toISOString();
      }
      if (patch.shareWord !== undefined) fields.share_word = !!patch.shareWord;
      if (patch.notifyPosts !== undefined) fields.notify_posts = !!patch.notifyPosts;
      if (patch.statusIcon !== undefined) fields.status_icon = patch.statusIcon;
      const { error } = await sb.from('profiles').update(fields).eq('id', id);
      guard(error);
      return { user: await profileById(id) };
    },

    async changePassword({ current, next }) {
      const id = requireUid();
      const profile = await profileById(id);
      const check = await sb.auth.signInWithPassword({ email: emailFor(profile.login_name || profile.username), password: current });
      if (check.error) throw new Error('Текущий пароль неверный');
      const { error } = await sb.auth.updateUser({ password: next });
      guard(error);
      return { ok: true };
    },

    async sessions() {
      const { data } = await sb.auth.getSession();
      const session = data?.session;
      if (!session) return { sessions: [] };
      return {
        sessions: [
          {
            id: 'current',
            agent: navigator.userAgent,
            createdAt: Date.now(),
            lastSeen: Date.now(),
            current: true
          }
        ]
      };
    },

    async dropSession() {
      await sb.auth.signOut();
      uid = null;
      return { ok: true };
    },

    async searchUsers(query) {
      const q = String(query || '').replace(/^@/, '').replace(/[%_]/g, '');
      let request = sb.from('profiles').select('*').order('last_seen', { ascending: false }).limit(40);
      if (q) request = request.or(`username.ilike.%${q}%,display_name.ilike.%${q}%,bio.ilike.%${q}%`);
      const { data, error } = await request;
      guard(error);
      const found = new Map((data || []).map((row) => [row.id, row]));
      if (q) {
        try {
          const aliases = await sb.from('usernames').select('user_id').ilike('username', `%${q}%`).limit(40);
          const missing = (aliases.data || []).map((row) => row.user_id).filter((id) => !found.has(id));
          if (missing.length) {
            const extra = await sb.from('profiles').select('*').in('id', missing);
            for (const row of extra.data || []) found.set(row.id, row);
          }
        } catch {}
      }
      return { users: [...found.values()].map((row) => shapeProfile(row)) };
    },

    async saveSession() {
      const { data } = await sb.auth.getSession();
      if (!data?.session) return null;
      return {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token
      };
    },

    async useSession(tokens) {
      if (!tokens?.refresh_token) throw new Error('Сессия не сохранена, войдите заново');
      const { data, error } = await sb.auth.setSession({
        access_token: tokens.access_token || '',
        refresh_token: tokens.refresh_token
      });
      guard(error);
      uid = data?.user?.id || data?.session?.user?.id || null;
      if (!uid) throw new Error('Сессия устарела, войдите заново');
      listen();
      const user = await profileById(uid);
      if (user?.bannedUntil > Date.now()) {
        await sb.auth.signOut();
        uid = null;
        throw new Error('Аккаунт заблокирован');
      }
      return { user };
    },

    async notifications(limit = 40) {
      const me = requireUid();
      const { data, error } = await sb
        .from('notifications')
        .select('*')
        .eq('user_id', me)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return { items: [], unread: 0 };
      const items = (data || []).map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title || '',
        body: row.body || '',
        meta: row.meta || {},
        createdAt: ms(row.created_at),
        read: !!row.read_at
      }));
      return { items, unread: items.filter((row) => !row.read).length };
    },

    async unreadNotifications() {
      if (!uid) return { count: 0 };
      const { count, error } = await sb
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .is('read_at', null);
      if (error) return { count: 0 };
      return { count: count || 0 };
    },

    async readNotifications(ids) {
      await sb.rpc('mark_notifications', { ids: ids && ids.length ? ids : null });
      return { ok: true };
    },

    async clearNotifications() {
      await sb.rpc('clear_notifications');
      return { ok: true };
    },

    async linkCode() {
      requireUid();
      const { data, error } = await sb.rpc('make_link_code');
      guard(error);
      return { code: data };
    },

    async billing() {
      requireUid();
      const { data, error } = await sb.rpc('my_billing');
      if (error) return { telegram: null, payments: [] };
      return data || { telegram: null, payments: [] };
    },

    async myUsernames() {
      const me = requireUid();
      const { data, error } = await sb
        .from('usernames')
        .select('username, created_at')
        .eq('user_id', me)
        .order('created_at', { ascending: true });
      if (error) return { names: [], limit: 3 };
      const limit = await sb.rpc('username_limit');
      return { names: (data || []).map((row) => row.username), limit: limit.data || 3 };
    },

    async addUsername(name) {
      const { data, error } = await sb.rpc('add_username', { wanted: name });
      guard(error);
      return { username: data };
    },

    async dropUsername(name) {
      const { error } = await sb.rpc('drop_username', { target: name });
      guard(error);
      return { ok: true };
    },

    async setMainUsername(name) {
      const { error } = await sb.rpc('set_main_username', { target: name });
      guard(error);
      return { user: await profileById(uid) };
    },

    async getUser(name) {
      const clean = String(name).toLowerCase().replace(/^@/, '');
      let { data, error } = await sb.from('profiles').select('*').eq('username', clean).maybeSingle();
      guard(error);
      if (!data) {
        const alias = await sb.from('usernames').select('user_id').eq('username', clean).maybeSingle();
        if (alias.data) {
          const found = await sb.from('profiles').select('*').eq('id', alias.data.user_id).maybeSingle();
          data = found.data;
        }
      }
      if (!data) throw new Error('Пользователь не найден');
      const grab = () =>
        sb
          .from('posts')
          .select(POST_SELECT())
          .eq('author_id', data.id)
          .eq('removed', false)
          .order('created_at', { ascending: false })
          .limit(50);
      let posts = await grab();
      if (missingColumn(posts.error)) {
        legacyPosts = true;
        posts = await grab();
      }
      guard(posts.error);
      const liked = await likedSet((posts.data || []).map((row) => row.id));
      return {
        user: shapeProfile(data, await counters(data.id)),
        posts: (posts.data || []).map((row) => shapePost(row, liked))
      };
    },

    async listPosts({ mood, kind, before, limit, includeRemoved } = {}) {
      const size = Math.min(40, Math.max(4, Number(limit) || 12));
      const build = () => {
        let request = sb.from('posts').select(POST_SELECT());
        if (!includeRemoved) request = request.eq('removed', false);
        request = request.order('created_at', { ascending: false }).limit(size);
        if (mood) request = request.eq('mood', mood);
        if (!legacyPosts && kind === 'reels') request = request.in('kind', ['video', 'album']);
        if (!legacyPosts && kind === 'video') request = request.eq('kind', 'video');
        if (!legacyPosts && kind === 'album') request = request.eq('kind', 'album');
        if (!legacyPosts && kind === 'feed') request = request.eq('kind', 'text');
        if (before) request = request.lt('created_at', new Date(Number(before)).toISOString());
        return request;
      };
      let { data, error } = await build();
      if (missingColumn(error)) {
        legacyPosts = true;
        if (kind === 'video' || kind === 'album' || kind === 'reels') return { posts: [], more: false, cursor: null };
        ({ data, error } = await build());
      }
      guard(error);
      const liked = await likedSet((data || []).map((row) => row.id));
      const posts = (data || []).map((row) => shapePost(row, liked));
      return { posts, more: posts.length === size, cursor: posts.length ? posts[posts.length - 1].createdAt : null };
    },

    async listAnnouncements() {
      const { data, error } = await sb
        .from('announcements')
        .select('*')
        .gt('until', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(4);
      if (error) return { announcements: [] };
      return {
        announcements: (data || []).map((row) => ({
          id: row.id,
          title: row.title || '',
          body: row.body || '',
          tone: row.tone || 'info',
          createdAt: ms(row.created_at),
          until: ms(row.until)
        }))
      };
    },

    async createAnnouncement({ title, body, tone, days }) {
      const me = requireUid();
      const until = new Date(Date.now() + Math.max(1, Number(days) || 7) * 86400000).toISOString();
      const { error } = await sb.from('announcements').insert({
        title: String(title || '').slice(0, 80),
        body: String(body || '').slice(0, 600),
        tone: tone || 'info',
        author_id: me,
        until
      });
      guard(error);
      return { ok: true };
    },

    async deleteAnnouncement(id) {
      const { error } = await sb.from('announcements').delete().eq('id', id);
      guard(error);
      return { ok: true };
    },

    async bumpViews(id) {
      await sb.rpc('bump_post_views', { target: id });
      return { ok: true };
    },

    async uploadMedia(dataUrl, hint = 'jpg') {
      const me = requireUid();
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const known = /^(video|image)\//.test(blob.type || '') ? blob.type.split(';')[0] : '';
      const type = known || (hint === 'mp4' ? 'video/mp4' : 'image/jpeg');
      const ext = (type.split('/')[1] || hint).replace('quicktime', 'mov');
      const path = `${me}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const upload = await sb.storage.from('media').upload(path, blob, { contentType: type, upsert: false });
      if (upload.error) {
        if (/bucket/i.test(upload.error.message)) throw new Error('В Supabase нет хранилища media. Прогоните schema.sql заново');
        guard(upload.error);
      }
      const { data } = sb.storage.from('media').getPublicUrl(path);
      return data.publicUrl;
    },

    async createPost({ text, image, mood, kind, media, video, poster, duration }) {
      const id = requireUid();
      const body = String(text || '').trim().slice(0, 5000);
      const album = Array.isArray(media) ? media.filter(Boolean).slice(0, 10) : [];
      if (!body && !image && !album.length && !video) throw new Error('Пустой пост');
      const payload = {
        author_id: id,
        body,
        image: image || album[0] || poster || null,
        mood: mood || 'calm',
        kind: kind || (video ? 'video' : album.length > 1 ? 'album' : 'text'),
        media: album,
        video: video || null,
        poster: poster || null,
        duration: Math.max(0, Math.round(Number(duration) || 0))
      };
      let { data, error } = await sb.from('posts').insert(payload).select(POST_SELECT()).single();
      if (missingColumn(error)) {
        legacyPosts = true;
        if (video || album.length > 1) {
          throw new Error('Видео и альбомы появятся после того, как вы прогоните supabase/schema.sql заново');
        }
        ({ data, error } = await sb
          .from('posts')
          .insert({ author_id: id, body, image: payload.image, mood: payload.mood })
          .select(POST_SELECT())
          .single());
      }
      guard(error);
      return { post: shapePost(data, new Set()) };
    },

    async deletePost(id) {
      const { error } = await sb.from('posts').delete().eq('id', id);
      guard(error);
      return { ok: true };
    },

    async toggleLike(id) {
      const me = requireUid();
      const existing = await sb.from('likes').select('post_id').eq('post_id', id).eq('user_id', me).maybeSingle();
      if (existing.data) {
        const { error } = await sb.from('likes').delete().eq('post_id', id).eq('user_id', me);
        guard(error);
      } else {
        const { error } = await sb.from('likes').insert({ post_id: id, user_id: me });
        guard(error);
      }
      const { data, error } = await sb.from('posts').select(POST_SELECT()).eq('id', id).single();
      guard(error);
      return { post: shapePost(data, await likedSet([id])) };
    },

    async listComments(id) {
      const { data, error } = await sb
        .from('comments')
        .select('id, body, created_at, author:profiles!comments_author_id_fkey(*)')
        .eq('post_id', id)
        .order('id', { ascending: true })
        .limit(200);
      guard(error);
      return {
        comments: (data || []).map((row) => ({
          id: row.id,
          text: row.body,
          createdAt: ms(row.created_at),
          author: shapeProfile(row.author)
        }))
      };
    },

    async addComment(id, text) {
      const me = requireUid();
      const body = String(text || '').trim().slice(0, 500);
      if (!body) throw new Error('Пустой комментарий');
      const recent = await sb
        .from('comments')
        .select('id')
        .eq('post_id', id)
        .eq('author_id', me)
        .eq('body', body)
        .gt('created_at', new Date(Date.now() - 10000).toISOString())
        .limit(1);
      if (!recent.data?.length) {
        const { error } = await sb.from('comments').insert({ post_id: id, author_id: me, body });
        guard(error);
      }
      const { data } = await sb.from('posts').select(POST_SELECT()).eq('id', id).single();
      return { post: shapePost(data, await likedSet([id])) };
    },

    async contacts() {
      const me = requireUid();
      const { data, error } = await sb
        .from('contacts')
        .select('contact:profiles!contacts_contact_id_fkey(*)')
        .eq('user_id', me);
      guard(error);
      return { contacts: (data || []).map((row) => shapeProfile(row.contact)).filter(Boolean) };
    },

    async addContact(id) {
      const me = requireUid();
      if (id === me) throw new Error('Нельзя добавить себя');
      const { error } = await sb.from('contacts').upsert({ user_id: me, contact_id: id });
      guard(error);
      return { ok: true };
    },

    async removeContact(id) {
      const me = requireUid();
      const { error } = await sb.from('contacts').delete().eq('user_id', me).eq('contact_id', id);
      guard(error);
      return { ok: true };
    },

    async chats() {
      const me = requireUid();
      const memberships = await sb.from('chat_members').select('chat_id, role, read_at').eq('user_id', me);
      guard(memberships.error);
      const ids = (memberships.data || []).map((row) => row.chat_id);
      if (!ids.length) return { chats: [] };

      const [chatRows, memberRows, messageRows] = await Promise.all([
        sb.from('chats').select('*').in('id', ids),
        sb.from('chat_members').select('chat_id, role, user_id, read_at, profile:profiles!chat_members_user_id_fkey(*)').in('chat_id', ids),
        sb.from('messages').select('*').in('chat_id', ids).eq('removed', false).order('id', { ascending: false }).limit(400)
      ]);
      guard(chatRows.error || memberRows.error || messageRows.error);

      const authors = new Map();
      for (const row of memberRows.data || []) if (row.profile) authors.set(row.profile.id, row.profile);

      const chats = (chatRows.data || []).map((chat) => {
        const mine = (memberships.data || []).find((row) => row.chat_id === chat.id);
        const members = (memberRows.data || [])
          .filter((row) => row.chat_id === chat.id && row.profile)
          .map((row) => ({ ...shapeProfile(row.profile), role: row.role }));
        const peer = chat.kind === 'dm' ? members.find((m) => m.id !== me) || members[0] : null;
        const history = (messageRows.data || []).filter((row) => row.chat_id === chat.id);
        const last = history[0];
        const readAt = ms(mine?.read_at);
        const peerReadAt = (memberRows.data || [])
          .filter((row) => row.chat_id === chat.id && row.user_id !== me)
          .reduce((top, row) => Math.max(top, ms(row.read_at)), 0);
        return {
          id: chat.id,
          kind: chat.kind,
          title: chat.kind === 'dm' ? (peer ? peer.displayName : 'Диалог') : chat.title,
          hue: chat.kind === 'dm' && peer ? peer.hue : chat.hue,
          ownerId: chat.owner_id,
          peer,
          role: mine?.role || null,
          peerReadAt,
          members,
          lastMessage: last ? shapeMessage(last, authors) : null,
          unread: history.filter((row) => ms(row.created_at) > readAt && row.author_id !== me).length
        };
      });

      chats.sort((a, b) => (b.lastMessage?.createdAt || 0) - (a.lastMessage?.createdAt || 0));
      return { chats };
    },

    async createChat({ kind, title, members }) {
      const me = requireUid();
      if (kind === 'dm') {
        const peer = (members || [])[0];
        if (!peer) throw new Error('Выберите собеседника');
        const { data, error } = await sb.rpc('open_dm', { peer });
        guard(error);
        const list = await this.chats();
        return { chat: list.chats.find((chat) => chat.id === data) };
      }
      const name = String(title || '').trim();
      if (!name) throw new Error('Нужно название');
      const created = await sb
        .from('chats')
        .insert({ kind, title: name, owner_id: me, hue: 150 + Math.floor(Math.random() * 180) })
        .select('*')
        .single();
      guard(created.error);
      const rows = [{ chat_id: created.data.id, user_id: me, role: 'owner' }];
      for (const id of members || []) if (id !== me) rows.push({ chat_id: created.data.id, user_id: id, role: 'member' });
      const joined = await sb.from('chat_members').insert(rows);
      guard(joined.error);
      const list = await this.chats();
      return { chat: list.chats.find((chat) => chat.id === created.data.id) };
    },

    async addMember(chatId, userId) {
      const { error } = await sb.from('chat_members').insert({ chat_id: chatId, user_id: userId, role: 'member' });
      guard(error);
      const list = await this.chats();
      return { chat: list.chats.find((chat) => chat.id === chatId) };
    },

    async messages(chatId) {
      const { data, error } = await sb
        .from('messages')
        .select('*, author:profiles!messages_author_id_fkey(*)')
        .eq('chat_id', chatId)
        .eq('removed', false)
        .order('id', { ascending: true })
        .limit(200);
      guard(error);
      return { messages: (data || []).map((row) => shapeMessage(row)) };
    },

    async sendMessage(chatId, payload) {
      const me = requireUid();
      const { data, error } = await sb
        .from('messages')
        .insert({
          chat_id: chatId,
          author_id: me,
          kind: payload.kind || 'text',
          body: String(payload.body || '').slice(0, 4000),
          media: payload.media || null,
          duration: payload.duration || 0
        })
        .select('*, author:profiles!messages_author_id_fkey(*)')
        .single();
      guard(error);
      return { message: shapeMessage(data) };
    },

    async markRead(chatId) {
      if (!uid) return { ok: true };
      await sb.from('chat_members').update({ read_at: new Date().toISOString() }).eq('chat_id', chatId).eq('user_id', uid);
      return { ok: true };
    },

    async callSignal(chatId, toId, kind, payload) {
      const me = requireUid();
      const { error } = await sb.from('call_signals').insert({
        chat_id: chatId,
        from_id: me,
        to_id: toId,
        kind,
        payload: payload || {}
      });
      guard(error);
      return { ok: true };
    },

    async callInbox(since) {
      if (!uid) return { signals: [] };
      const { data, error } = await sb
        .from('call_signals')
        .select('*')
        .eq('to_id', uid)
        .gt('id', Number(since) || 0)
        .order('id', { ascending: true })
        .limit(50);
      if (error) return { signals: [] };
      return {
        signals: (data || []).map((row) => ({
          id: row.id,
          chatId: row.chat_id,
          fromId: row.from_id,
          kind: row.kind,
          payload: row.payload || {},
          createdAt: ms(row.created_at)
        }))
      };
    },

    async callClear(chatId) {
      if (!uid) return { ok: true };
      await sb.from('call_signals').delete().eq('chat_id', chatId).or(`to_id.eq.${uid},from_id.eq.${uid}`);
      return { ok: true };
    },

    async wipePosts(userId) {
      const { data, error } = await sb.rpc('admin_wipe_posts', { target: userId });
      guard(error);
      return { removed: data || 0 };
    },

    async resetLook(userId) {
      const { error } = await sb.rpc('admin_reset_look', { target: userId });
      guard(error);
      return { ok: true };
    },

    async renameUser(userId, name) {
      const { error } = await sb.rpc('admin_rename', { target: userId, name });
      guard(error);
      return { ok: true };
    },

    async report({ targetKind, targetId, reason, image }) {
      const me = requireUid();
      const { error } = await sb.from('reports').insert({
        reporter_id: me,
        target_kind: targetKind,
        target_id: String(targetId),
        target_user: targetKind === 'user' ? targetId : null,
        reason: String(reason).slice(0, 600),
        image: image || null
      });
      guard(error);
      return { ok: true };
    },

    async modReports() {
      const { data, error } = await sb
        .from('reports')
        .select('*, reporter:profiles!reports_reporter_id_fkey(*), target:profiles!reports_target_user_fkey(*)')
        .order('id', { ascending: false })
        .limit(100);
      guard(error);
      return {
        reports: (data || []).map((row) => ({
          id: row.id,
          targetKind: row.target_kind,
          targetId: row.target_id,
          reason: row.reason,
          image: row.image,
          status: row.status,
          createdAt: ms(row.created_at),
          reporter: shapeProfile(row.reporter),
          target: shapeProfile(row.target)
        }))
      };
    },

    async closeReport(id, status) {
      const { error } = await sb.rpc('mod_close_report', { target: id, new_status: status || 'closed' });
      guard(error);
      return { ok: true };
    },

    async modQueue() {
      const grab = () => sb.from('posts').select(POST_SELECT()).order('created_at', { ascending: false }).limit(60);
      let { data, error } = await grab();
      if (missingColumn(error)) {
        legacyPosts = true;
        ({ data, error } = await grab());
      }
      guard(error);
      const liked = await likedSet((data || []).map((row) => row.id));
      return { posts: (data || []).map((row) => shapePost(row, liked)) };
    },

    async removePost(id, reason) {
      const { error } = await sb.rpc('mod_remove_post', { target: id, reason });
      guard(error);
      return { ok: true };
    },

    async punish({ userId, kind, minutes, reason }) {
      const { error } = await sb.rpc('mod_punish', { target: userId, kind, minutes: minutes || 0, reason });
      guard(error);
      return { ok: true };
    },

    async touchDevice(info, fresh) {
      const { data, error } = await sb.rpc('touch_device', {
        fp: info.id,
        info: { label: info.label, platform: info.platform, country: info.country, app: info.app },
        fresh: !!fresh
      });
      guard(error);
      return { state: data || { blocked: false } };
    },

    async deviceState(id) {
      const { data, error } = await sb.rpc('device_ban_state', { fp: id });
      guard(error);
      return { state: data || { blocked: false } };
    },

    async userInfo(id) {
      const { data, error } = await sb.rpc('mod_user_info', { target: id });
      guard(error);
      return { info: data };
    },

    async banDevice(id, minutes, reason) {
      const { data, error } = await sb.rpc('mod_ban_device', { fp: id, minutes: minutes || 0, reason });
      guard(error);
      return data;
    },

    async unbanDevice(id) {
      const { error } = await sb.rpc('mod_unban_device', { fp: id });
      guard(error);
      return { ok: true };
    },

    async modTeam() {
      const { data, error } = await sb.rpc('admin_mod_team');
      guard(error);
      return { team: data || [] };
    },

    async setRank(id, rank) {
      const { data, error } = await sb.rpc('admin_set_rank', { target: id, rank });
      guard(error);
      return data;
    },

    async strikes(userId) {
      const id = userId || requireUid();
      const { data, error } = await sb
        .from('mod_strikes')
        .select('*')
        .eq('moderator_id', id)
        .order('id', { ascending: false });
      guard(error);
      return { strikes: (data || []).map((row) => ({ id: row.id, reason: row.reason, createdAt: ms(row.created_at) })) };
    },

    async adminStats() {
      const { data, error } = await sb.rpc('admin_stats');
      guard(error);
      return { stats: data };
    },

    async adminUsers(query) {
      const { data, error } = await sb.rpc('admin_users', { search: query || '' });
      guard(error);
      return { users: (data || []).map((row) => shapeProfile(row)) };
    },

    async setFlags(id, flags) {
      const { error } = await sb.rpc('admin_set_flags', { target: id, flags });
      guard(error);
      return { user: await profileById(id) };
    },

    async setState(id, { action, minutes, reason }) {
      const { error } = await sb.rpc('admin_set_state', {
        target: id,
        action,
        minutes: minutes || 0,
        reason: reason || ''
      });
      guard(error);
      return { user: await profileById(id) };
    },

    async grantPremium(id, days, reason) {
      const { data, error } = await sb.rpc('admin_grant_premium', { target: id, days, reason });
      guard(error);
      return { until: ms(data) };
    },

    async revokePremium(id) {
      const { error } = await sb.rpc('admin_revoke_premium', { target: id });
      guard(error);
      return { ok: true };
    },

    async adminActions() {
      const { data, error } = await sb
        .from('punishments')
        .select('*, actor:profiles!punishments_actor_id_fkey(*), target:profiles!punishments_user_id_fkey(*)')
        .order('id', { ascending: false })
        .limit(150);
      guard(error);
      return {
        actions: (data || []).map((row) => ({
          id: row.id,
          kind: row.kind,
          minutes: row.minutes,
          reason: row.reason,
          postId: row.post_id,
          createdAt: ms(row.created_at),
          reverted: row.reverted,
          actor: shapeProfile(row.actor),
          target: shapeProfile(row.target)
        }))
      };
    },

    async revertAction(id, { strike, reason } = {}) {
      const { data, error } = await sb.rpc('admin_revert', {
        target: id,
        strike: !!strike,
        reason: reason || ''
      });
      guard(error);
      return { ok: true, strikes: data };
    },

    async adminAudit() {
      const { data, error } = await sb
        .from('audit')
        .select('*, actor:profiles!audit_actor_id_fkey(*)')
        .order('id', { ascending: false })
        .limit(200);
      guard(error);
      return {
        entries: (data || []).map((row) => ({
          id: row.id,
          action: row.action,
          meta: row.meta,
          createdAt: ms(row.created_at),
          actor: shapeProfile(row.actor)
        }))
      };
    },

    async journalEntry(day) {
      const me = requireUid();
      const { data, error } = await sb
        .from('journal')
        .select('*')
        .eq('user_id', me)
        .eq('day', day)
        .maybeSingle();
      guard(error);
      return { entry: data ? { day: data.day, body: data.body, mood: data.mood, word: data.word } : null };
    },

    async saveJournal({ day, body, mood, word }) {
      const me = requireUid();
      const { error } = await sb
        .from('journal')
        .upsert(
          { user_id: me, day, body: String(body || '').slice(0, 2000), mood, word: word ? String(word).slice(0, 20) : null },
          { onConflict: 'user_id,day' }
        );
      guard(error);
      return { ok: true };
    },

    async journalHistory() {
      const me = requireUid();
      const { data, error } = await sb
        .from('journal')
        .select('*')
        .eq('user_id', me)
        .order('day', { ascending: false })
        .limit(120);
      guard(error);
      return {
        entries: (data || []).map((row) => ({ day: row.day, body: row.body || '', mood: row.mood, word: row.word }))
      };
    },

    async publishStory(file, caption) {
      const me = requireUid();
      const name = String(file.name || 'story');
      const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase() ||
        (file.type.startsWith('video') ? 'mp4' : 'jpg');
      const path = `${me}/${Date.now()}.${ext}`;

      const upload = await sb.storage.from('stories').upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false
      });
      if (upload.error) {
        if (/bucket/i.test(upload.error.message)) {
          throw new Error('В Supabase нет хранилища stories. Прогоните schema.sql заново');
        }
        guard(upload.error);
      }

      const { data } = sb.storage.from('stories').getPublicUrl(path);
      const { error } = await sb.from('stories').insert({
        author_id: me,
        kind: file.type.startsWith('video') ? 'video' : 'image',
        media: data.publicUrl,
        storage_path: path,
        caption: String(caption || '').slice(0, 200)
      });
      guard(error);
      return { ok: true };
    },

    async stories() {
      const { data, error } = await sb
        .from('stories')
        .select('*, author:profiles!stories_author_id_fkey(*)')
        .gt('expires_at', new Date().toISOString())
        .order('id', { ascending: true });
      guard(error);
      return {
        stories: (data || []).map((row) => ({
          id: row.id,
          kind: row.kind,
          media: row.media,
          caption: row.caption,
          createdAt: ms(row.created_at),
          expiresAt: ms(row.expires_at),
          author: shapeProfile(row.author)
        }))
      };
    },

    async deleteStory(id) {
      const { error } = await sb.from('stories').delete().eq('id', id);
      guard(error);
      return { ok: true };
    },

    async stickers() {
      const me = requireUid();
      const { data, error } = await sb
        .from('stickers')
        .select('*')
        .eq('owner_id', me)
        .order('id', { ascending: false });
      guard(error);
      return { stickers: (data || []).map((row) => ({ id: row.id, image: row.image })) };
    },

    async addSticker(image) {
      const me = requireUid();
      const { error } = await sb.from('stickers').insert({ owner_id: me, image });
      guard(error);
      return { ok: true };
    },

    async removeSticker(id) {
      const { error } = await sb.from('stickers').delete().eq('id', id);
      guard(error);
      return { ok: true };
    },

    async saveScore(game, score) {
      const me = requireUid();
      const { error } = await sb.from('game_scores').insert({ user_id: me, game, score });
      guard(error);
      return { ok: true };
    },

    async leaderboard(game) {
      const { data, error } = await sb
        .from('game_scores')
        .select('score, profile:profiles!game_scores_user_id_fkey(*)')
        .eq('game', game)
        .order('score', { ascending: false })
        .limit(100);
      guard(error);
      const best = new Map();
      for (const row of data || []) {
        if (!row.profile) continue;
        const current = best.get(row.profile.id);
        if (!current || current.score < row.score) best.set(row.profile.id, { ...shapeProfile(row.profile), score: row.score });
      }
      return { leaderboard: [...best.values()].sort((a, b) => b.score - a.score).slice(0, 20) };
    }
  };
}
