import { api, state } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, toast, emptyState } from '../ui.js';

const GAMES_KEY = 'spokum.gamesPlayed';
const STREAK_KEY = 'spokum.streak.day';
const PIN_KEY = 'spokum.pinnedAchievements';
const MAX_PINS = 3;

export const RARITY = {
  common: { label: 'Обычное', color: '#9aa3b0', glow: 'rgba(154,163,176,.32)' },
  rare:   { label: 'Редкое',  color: '#8aabc7', glow: 'rgba(138,171,199,.38)' },
  epic:   { label: 'Эпическое', color: '#9f96c2', glow: 'rgba(159,150,194,.45)' },
  legend: { label: 'Легендарное', color: '#ccb079', glow: 'rgba(204,176,121,.5)' }
};

export function achievementsList() {
  return [
    { id: 'first_post', title: 'Первый пост', desc: 'Опубликуйте первый пост', icon: 'feed', rarity: 'common', check: (s) => s.posts >= 1 },
    { id: 'streak_7', title: 'Неделя в СпокУме', desc: '7 дней подряд с настроением', icon: 'flame', rarity: 'rare', check: (s) => s.streak >= 7 },
    { id: 'streak_30', title: 'Месяц спокойствия', desc: '30 дней подряд', icon: 'flame', rarity: 'legend', check: (s) => s.streak >= 30 },
    { id: 'posts_10', title: 'Разговорчивый', desc: '10 постов', icon: 'comment', rarity: 'common', check: (s) => s.posts >= 10 },
    { id: 'posts_50', title: 'Дневник', desc: '50 постов', icon: 'feed', rarity: 'rare', check: (s) => s.posts >= 50 },
    { id: 'likes_100', title: 'Популярный', desc: '100 лайков всего', icon: 'heart', rarity: 'rare', check: (s) => s.likes >= 100 },
    { id: 'gifts_5', title: 'Любимчик', desc: 'Получите 5 подарков', icon: 'gift', rarity: 'epic', check: (s) => s.gifts >= 5 },
    { id: 'games_10', title: 'Игрок', desc: 'Сыграйте 10 раз', icon: 'games', rarity: 'common', check: (s) => s.gamesPlayed >= 10 },
    { id: 'all_moods', title: 'Весь спектр', desc: 'Используйте все 8 настроений', icon: 'palette', rarity: 'epic', check: (s) => s.moodsUsed >= 8 },
    { id: 'early_bird', title: 'Жаворонок', desc: 'Пост до 7 утра', icon: 'sun', rarity: 'rare', check: (s) => !!s.earlyBird }
  ];
}

function readGamesPlayed() {
  const raw = localStorage.getItem(GAMES_KEY);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function bumpGamesPlayed() {
  const next = readGamesPlayed() + 1;
  try { localStorage.setItem(GAMES_KEY, String(next)); } catch {}
  return next;
}

function readLocalStreak() {
  try {
    const saved = JSON.parse(localStorage.getItem(STREAK_KEY) || 'null');
    if (saved && typeof saved.days === 'number') return saved.days;
  } catch {}
  return 0;
}

export async function computeStats() {
  const stats = {
    posts: 0,
    likes: 0,
    gifts: 0,
    streak: 0,
    gamesPlayed: 0,
    moodsUsed: 0,
    earlyBird: false
  };
  let user = null;
  try {
    const result = await api.me();
    user = result?.user || state.user;
  } catch {
    user = state.user;
  }
  if (user) {
    stats.posts = Number(user.posts) || 0;
    stats.likes = Number(user.likes) || 0;
    stats.streak = Number(user.streakDays || user.bestStreak) || 0;
    if (user.id) {
      try {
        const giftsResult = await api.gifts(user.id);
        stats.gifts = Array.isArray(giftsResult?.gifts) ? giftsResult.gifts.length : 0;
      } catch {}
    }
    if (user.username) {
      try {
        const profile = await api.getUser(user.username);
        const posts = Array.isArray(profile?.posts) ? profile.posts : [];
        const moods = new Set();
        for (const p of posts) {
          if (p.mood) moods.add(p.mood);
          if (p.createdAt && new Date(p.createdAt).getHours() < 7) stats.earlyBird = true;
        }
        stats.moodsUsed = moods.size;
      } catch {}
    }
  }
  stats.gamesPlayed = readGamesPlayed();
  if (!stats.streak) stats.streak = readLocalStreak();
  return stats;
}

export function evaluate(list, stats) {
  return list.map((a) => {
    let unlocked = false;
    try { unlocked = !!a.check(stats); } catch {}
    return { ...a, unlocked };
  });
}

function readPins() {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === 'string').slice(0, MAX_PINS);
    }
  } catch {}
  return [];
}

function writePins(list) {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify((list || []).slice(0, MAX_PINS)));
  } catch {}
}

export function pinnedAchievementIds() {
  return readPins();
}

// Toggle pin for an achievement. Returns the new pin list.
// Only unlocked achievements can be pinned; max MAX_PINS.
export async function toggleAchievementPin(id) {
  if (!id) return readPins();
  const list = readPins();
  const idx = list.indexOf(String(id));
  if (idx >= 0) {
    list.splice(idx, 1);
    writePins(list);
    return list;
  }
  // Need to verify it's unlocked before pinning.
  const all = achievementsList();
  const item = all.find((a) => a.id === String(id));
  if (!item) return list;
  let stats;
  try { stats = await computeStats(); } catch { return list; }
  let unlocked = false;
  try { unlocked = !!item.check(stats); } catch {}
  if (!unlocked) {
    toast('Сначала откройте достижение', 'err');
    return list;
  }
  if (list.length >= MAX_PINS) {
    toast(`Максимум ${MAX_PINS} закреплённых`, 'err');
    return list;
  }
  list.push(String(id));
  writePins(list);
  return list;
}

// Returns the achievement objects for currently-pinned IDs (only those still unlocked).
export async function pinnedAchievements() {
  const ids = readPins();
  if (!ids.length) return [];
  const all = achievementsList();
  let stats;
  try { stats = await computeStats(); } catch { return []; }
  const result = [];
  for (const id of ids) {
    const item = all.find((a) => a.id === id);
    if (!item) continue;
    let unlocked = false;
    try { unlocked = !!item.check(stats); } catch {}
    if (unlocked) result.push({ ...item, unlocked });
  }
  return result;
}

function badgeCell(item, pinned) {
  const r = RARITY[item.rarity] || RARITY.common;
  const got = item.unlocked;
  const color = got ? r.color : 'var(--muted)';
  const glow = got ? `box-shadow:0 0 0 1px ${r.color}40, 0 6px 18px -8px ${r.glow}` : '';
  const bg = got
    ? `background:radial-gradient(80% 80% at 50% 30%, ${r.color}26, transparent 70%)`
    : 'background:var(--surface-2)';
  const filter = got ? '' : 'filter:grayscale(1);opacity:.5';
  const pinMark = pinned ? `<span style="position:absolute;top:4px;right:6px;color:${r.color}">${icon('star', 11)}</span>` : '';
  return `<button class="card achv-cell" type="button" data-id="${esc(item.id)}"
    style="position:relative;padding:14px 6px;border:1px solid var(--line);text-align:center;cursor:pointer;${bg};${glow};${filter}">
    ${pinMark}
    <div style="color:${color};display:flex;justify-content:center;margin-bottom:6px">${icon(item.icon, 28)}</div>
    <div class="tiny strong" style="color:${got ? 'var(--text)' : 'var(--muted)'};line-height:1.25;font-size:11.5px">${esc(item.title)}</div>
    ${got
      ? `<div style="font-size:9px;color:${color};margin-top:4px;text-transform:uppercase;letter-spacing:.5px;font-weight:700">${esc(r.label)}</div>`
      : `<div style="margin-top:4px;color:var(--muted)">${icon('lock', 12)}</div>`}
  </button>`;
}

function openBadgeDetail(item, pinned, onToggle) {
  const r = RARITY[item.rarity] || RARITY.common;
  const got = item.unlocked;
  const color = got ? r.color : 'var(--muted)';
  const filter = got ? '' : 'filter:grayscale(1);opacity:.6';
  const body = el(`<div class="col" style="gap:12px;align-items:center;text-align:center;padding:6px 0">
    <div style="color:${color};${filter};display:flex;justify-content:center">${icon(item.icon, 52)}</div>
    <div class="strong" style="font-size:17px">${esc(item.title)}</div>
    <div class="small muted" style="line-height:1.55;max-width:280px">${esc(item.desc)}</div>
    <div class="pill" style="color:${color};background:${color}22;border:1px solid ${color}44">
      ${got ? 'Открыто' : 'Закрыто'} · ${esc(r.label)}
    </div>
    ${got
      ? `<button class="btn ${pinned ? '' : 'btn-primary'}" data-pin style="width:100%">${icon('star', 15)} ${pinned ? 'Открепить' : 'Закрепить'}</button>`
      : '<p class="tiny muted" style="margin:0;max-width:280px;line-height:1.5">Продолжайте пользоваться СпокУмом — достижение откроется само</p>'}
  </div>`);
  const sheet = openSheet(item.title, body);
  const pinBtn = body.querySelector('[data-pin]');
  if (pinBtn) {
    pinBtn.onclick = async () => {
      pinBtn.disabled = true;
      try {
        const next = await toggleAchievementPin(item.id);
        onToggle?.(next);
      } catch (error) {
        toast(error?.message || 'Не удалось закрепить', 'err');
      }
      sheet.close();
    };
  }
  return sheet;
}

export async function openAchievements() {
  const body = el('<div class="col" style="gap:12px"><div class="card" style="height:100px;opacity:.3"></div></div>');
  const sheet = openSheet('Достижения', body);

  let stats;
  try {
    stats = await computeStats();
  } catch (error) {
    body.innerHTML = emptyState('warn', 'Не загрузилось', error?.message || 'Попробуйте позже');
    return sheet;
  }

  const draw = () => {
    const list = achievementsList();
    const evaluated = evaluate(list, stats);
    const pins = readPins();
    const count = evaluated.filter((a) => a.unlocked).length;
    const total = evaluated.length;
    const pct = total ? Math.round((count / total) * 100) : 0;

    body.innerHTML = `
      <div class="card" style="padding:14px">
        <div class="row between" style="align-items:center;gap:8px">
          <div style="min-width:0">
            <div class="strong">${count} / ${total} открыто</div>
            <div class="tiny muted" style="margin-top:2px;line-height:1.4">Открывайте новые, пишите посты и заходите каждый день · можно закрепить до ${MAX_PINS}</div>
          </div>
          <div class="pill ${count === total && total ? 'good' : ''}" style="flex:none">${pct}%</div>
        </div>
        <div class="meter" style="margin-top:10px"><i style="width:${pct}%"></i></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
        ${evaluated.map((a) => badgeCell(a, pins.includes(a.id))).join('')}
      </div>
      <p class="tiny muted" style="margin:0;line-height:1.5;text-align:center">
        ${icon('spark', 12)} Достижения видны только вам и не отражают вашу ценность
      </p>`;

    body.querySelectorAll('[data-id]').forEach((btn) => {
      btn.onclick = () => {
        const item = evaluated.find((a) => a.id === btn.dataset.id);
        if (!item) return;
        openBadgeDetail(item, readPins().includes(item.id), draw);
      };
    });
  };

  draw();
  return sheet;
}
