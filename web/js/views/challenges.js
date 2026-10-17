import { api, state } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, toast } from '../ui.js';

/**
 * Daily Challenges.
 * 7 daily challenges that rotate each day (deterministic by date seed).
 * Progress is tracked in localStorage as
 *   spokum.challenges.<YYYY-MM-DD>.<id> = "1"
 * Each completed challenge gives 10..50 coins via api.grantCoins.
 */

const CHALLENGES = [
  { id: 'post',    icon: 'feed',    title: 'Опубликуйте пост',          desc: 'Напишите пост сегодня',                       reward: 30 },
  { id: 'likes',   icon: 'heart',   title: 'Поставьте 3 лайка',          desc: 'Отметьте три записи сердечком',               reward: 15 },
  { id: 'game',    icon: 'games',   title: 'Сыграйте в игру',            desc: 'Запустите любую игру в разделе Игры',         reward: 20 },
  { id: 'chat',    icon: 'chats',   title: 'Напишите в чат',             desc: 'Отправьте сообщение в любом чате',            reward: 15 },
  { id: 'profile', icon: 'profile', title: 'Загляните в профиль',        desc: 'Откройте свой профиль',                       reward: 10 },
  { id: 'gift',    icon: 'gift',    title: 'Подарите подарок',           desc: 'Отправьте подарок другу (если по карману)',   reward: 50 },
  { id: 'mood',    icon: 'palette', title: 'Используйте новое настроение', desc: 'Пост с настроением, которого вы ещё не использовали на этой неделе', reward: 40 }
];

const PREFIX = 'spokum.challenges.';

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** FNV-1a hash of a date string. Used to seed the daily rotation. */
function dateSeed(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/** Returns the 7 challenges for the given date, order rotated deterministically. */
export function challengesForDay(dayKey = todayKey()) {
  const seed = dateSeed(dayKey);
  const order = CHALLENGES.map((_, i) => i);
  let s = seed;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.map((i) => CHALLENGES[i]);
}

function keyFor(dayKey, id) {
  return `${PREFIX}${dayKey}.${id}`;
}

export function isDone(dayKey, id) {
  try {
    return localStorage.getItem(keyFor(dayKey, id)) === '1';
  } catch { return false; }
}

function markDone(dayKey, id) {
  try { localStorage.setItem(keyFor(dayKey, id), '1'); } catch {}
}

/** Number of completed challenges for today. */
export function todayCompletedCount() {
  const dayKey = todayKey();
  const list = challengesForDay(dayKey);
  return list.filter((c) => isDone(dayKey, c.id)).length;
}

/** Total challenges for today (always 7). */
export function todayTotal() {
  return CHALLENGES.length;
}

async function claim(c, dayKey, onRefresh) {
  if (isDone(dayKey, c.id)) return;
  markDone(dayKey, c.id);
  let granted = 0;
  try {
    if (api.grantCoins) {
      const r = await api.grantCoins(c.reward, `daily_challenge:${c.id}`);
      granted = r?.added || 0;
      if (r?.coins != null && state.user) {
        state.user.coins = r.coins;
      }
    }
  } catch (error) {
    toast(error?.message || 'Не удалось начислить монеты', 'err');
  }
  toast(`+${granted || c.reward} монет за «${c.title}»`, 'ok');
  onRefresh?.();
}

function challengeCard(c, dayKey) {
  const done = isDone(dayKey, c.id);
  const opacity = done ? 'opacity:.55' : '';
  return `
    <button class="card list-item" type="button" data-id="${esc(c.id)}"
      style="padding:12px;text-align:left;width:100%;${opacity}">
      <span style="color:${done ? '#87b7a3' : 'var(--accent)'};flex:none">${icon(c.icon, 22)}</span>
      <span class="grow" style="min-width:0">
        <span class="row" style="gap:8px;align-items:center">
          <span class="small strong truncate">${esc(c.title)}</span>
          ${done ? `<span class="pill good" style="flex:none">${icon('check', 12)} Готово</span>` : ''}
        </span>
        <span class="tiny muted" style="display:block;margin-top:3px;line-height:1.45">${esc(c.desc)}</span>
      </span>
      <span class="col" style="align-items:flex-end;flex:none;gap:4px">
        <span class="pill" style="background:var(--accent-soft);color:var(--accent)">+${c.reward}</span>
        <span class="tiny ${done ? 'muted' : 'strong'}" style="color:${done ? 'var(--muted)' : 'var(--accent)'}">${done ? 'получено' : 'забрать'}</span>
      </span>
    </button>`;
}

export async function openChallenges() {
  const body = el('<div class="col" style="gap:10px"><div class="card" style="height:80px;opacity:.3"></div></div>');
  const sheet = openSheet('Ежедневные задания', body);
  const dayKey = todayKey();
  const date = new Date();
  const dateText = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' });

  const draw = () => {
    const list = challengesForDay(dayKey);
    const done = list.filter((c) => isDone(dayKey, c.id)).length;
    const earned = list.filter((c) => isDone(dayKey, c.id)).reduce((sum, c) => sum + c.reward, 0);
    const total = list.length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    body.innerHTML = `
      <div class="card" style="padding:14px">
        <div class="row between" style="align-items:center;gap:10px">
          <div style="min-width:0">
            <div class="strong small" style="line-height:1.3">${esc(dateText)}</div>
            <div class="tiny muted" style="margin-top:4px">${done}/${total} выполнено · +${earned} монет</div>
          </div>
          <div class="pill ${done === total && total ? 'good' : ''}" style="flex:none">${pct}%</div>
        </div>
        <div class="meter" style="margin-top:10px"><i style="width:${pct}%"></i></div>
      </div>
      <div class="col" style="gap:8px">
        ${list.map((c) => challengeCard(c, dayKey)).join('')}
      </div>
      <p class="tiny muted" style="margin:6px 2px 0;line-height:1.5;text-align:center">
        ${icon('clock', 12)} Приходите завтра за новыми!
      </p>`;

    body.querySelectorAll('[data-id]').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const c = list.find((x) => x.id === id);
        if (!c) return;
        if (isDone(dayKey, c.id)) return;
        btn.disabled = true;
        await claim(c, dayKey, draw);
        btn.disabled = false;
      };
    });
  };

  draw();
  return sheet;
}
