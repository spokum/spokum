import { local } from './backend/local.js';
import { createRemote } from './backend/remote.js';

let backend = local;

export const api = new Proxy({}, {
  get(_target, prop) {
    const value = backend[prop];
    return typeof value === 'function' ? value.bind(backend) : value;
  },
  has(_target, prop) {
    return prop in backend;
  }
});

export async function initBackend() {
  const params = new URLSearchParams(location.search);
  const supabaseUrl = window.SPOKUM_SUPABASE_URL || params.get('supabaseUrl') || '';
  const supabaseKey = window.SPOKUM_SUPABASE_KEY || params.get('supabaseKey') || '';
  const apiBase = window.SPOKUM_API || params.get('api') || '';

  if (supabaseUrl && supabaseKey) {
    try {
      const { createSupabase } = await import('./backend/supabase.js');
      backend = await createSupabase(supabaseUrl, supabaseKey);
      return backend.mode;
    } catch (error) {
      console.error(error);
      backend = local;
      return 'local';
    }
  }

  if (apiBase) backend = createRemote(apiBase);
  return backend.mode;
}

export const state = {
  user: null,
  moodFilter: null,
  tab: 'feed',
  unread: 0,
  online: navigator.onLine,
  quiet: false
};

const FEED_CACHE = 'spokum.cache.feed';

export function cacheFeed(posts) {
  try {
    const trimmed = posts.slice(0, 20).map((post, index) => ({
      ...post,
      image: index < 6 ? post.image : null
    }));
    localStorage.setItem(FEED_CACHE, JSON.stringify({ savedAt: Date.now(), posts: trimmed }));
  } catch {}
}

export function readFeedCache() {
  try {
    const raw = localStorage.getItem(FEED_CACHE);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data.posts) && data.posts.length ? data : null;
  } catch {
    return null;
  }
}

export function isPremium(user) {
  return !!(user && user.premiumUntil && user.premiumUntil > Date.now());
}

export const PREMIUM_THEMES = ['aurora', 'sunset', 'royal', 'abyss'];
export const PREMIUM_ACCENTS = ['gold', 'rose', 'ice'];

export const PREMIUM_PERKS = [
  ['crown', 'Значок премиума', 'Корона рядом с ником во всей сети'],
  ['play', 'Истории', 'Видео и фото на 24 часа, открываются по аватару'],
  ['star', 'Свои стикеры', 'Загружайте картинки и шлите их в чатах'],
  ['image', 'Пины', 'Четыре картинки по углам вашего аватара'],
  ['smile', 'Статус у ника', 'Своя маленькая картинка рядом с именем'],
  ['palette', 'Закрытые темы', 'Аврора, Закат, Королевская и Бездна'],
  ['spark', 'Особые акценты', 'Золото, роза и лёд в интерфейсе'],
  ['profile', 'Свечение аватара', 'Мягкая подсветка вокруг фото профиля'],
  ['feed', 'Длинные записи', 'До 5000 символов в посте вместо 2000'],
  ['eye', 'Фото без потерь', 'Снимки грузятся в максимальном качестве']
];

export function isOffline() {
  return !navigator.onLine;
}

export function requireOnline() {
  if (!navigator.onLine) throw new Error('Нет интернета. Действие станет доступно, когда связь вернётся');
}

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit(event, payload) {
  for (const fn of listeners) fn(event, payload);
}

export function setUser(user) {
  state.user = user;
  applyAppearance(user);
  emit('user', user);
}

export function applyAppearance(user) {
  const root = document.documentElement;
  let theme = user?.theme || localStorage.getItem('spokum.theme') || 'calm';
  let accent = user?.accent || localStorage.getItem('spokum.accent') || 'mint';
  const premium = user ? isPremium(user) : localStorage.getItem('spokum.premium') === '1';
  const patch = {};
  if (!premium) {
    if (PREMIUM_THEMES.includes(theme)) {
      theme = 'calm';
      patch.theme = theme;
    }
    if (PREMIUM_ACCENTS.includes(accent)) {
      accent = 'mint';
      patch.accent = accent;
    }
  }
  root.dataset.theme = theme;
  root.dataset.accent = accent;
  localStorage.setItem('spokum.theme', theme);
  localStorage.setItem('spokum.accent', accent);
  localStorage.setItem('spokum.premium', premium ? '1' : '0');
  if (user && Object.keys(patch).length) {
    Object.assign(user, patch);
    api.updateMe(patch).catch(() => {});
  }
}

export const MOODS = {
  calm:     { label: 'Спокойствие', color: 'rgba(127,179,160,.14)', ink: '#7fb3a0' },
  joy:      { label: 'Радость',     color: 'rgba(204,176,121,.15)', ink: '#ccb079' },
  sad:      { label: 'Грусть',      color: 'rgba(138,171,199,.15)', ink: '#8aabc7' },
  anger:    { label: 'Злость',      color: 'rgba(197,130,121,.15)', ink: '#c58279' },
  anxiety:  { label: 'Тревога',     color: 'rgba(159,150,194,.15)', ink: '#9f96c2' },
  tired:    { label: 'Усталость',   color: 'rgba(152,160,173,.15)', ink: '#98a0ad' },
  love:     { label: 'Нежность',    color: 'rgba(199,143,164,.15)', ink: '#c78fa4' },
  inspired: { label: 'Подъём',      color: 'rgba(147,185,141,.15)', ink: '#93b98d' }
};

export function moodStyle(mood) {
  const item = MOODS[mood] || MOODS.calm;
  return `--mood-color:${item.color};--mood-ink:${item.ink}`;
}
