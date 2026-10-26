import { api, state, MOODS } from '../store.js';
import { el, esc, plural } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, emptyState } from '../ui.js';

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const TODAY_KEY = dateKey(Date.now());

function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function groupByDay(posts) {
  const map = new Map();
  for (const post of posts) {
    if (!post || !post.createdAt) continue;
    const key = dateKey(post.createdAt);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(post);
  }
  return map;
}

function dominantMood(dayPosts) {
  const counts = Object.create(null);
  for (const p of dayPosts) {
    if (!p.mood) continue;
    counts[p.mood] = (counts[p.mood] || 0) + 1;
  }
  let best = null;
  let bestN = 0;
  for (const mood of Object.keys(counts)) {
    if (counts[mood] > bestN) {
      best = mood;
      bestN = counts[mood];
    }
  }
  return best;
}

function statCard(glyph, label, value, moodKey) {
  const ink = moodKey ? (MOODS[moodKey]?.ink || 'var(--text)') : 'var(--text)';
  return `<div class="card" style="flex:1;min-width:0;padding:12px 8px;text-align:center">
    <div class="muted" style="margin-bottom:4px">${icon(glyph, 16)}</div>
    <div class="tiny muted" style="line-height:1.3">${esc(label)}</div>
    <div class="small strong" style="margin-top:4px;color:${ink};word-break:break-word">${esc(value)}</div>
  </div>`;
}

function dayCell(cell, todayKey) {
  if (!cell) return '<div style="aspect-ratio:1/1"></div>';
  const dom = dominantMood(cell.posts);
  const mood = dom ? MOODS[dom] : null;
  const isToday = cell.key === todayKey;
  const bg = mood ? mood.color : 'var(--surface-2)';
  const ink = mood ? mood.ink : 'var(--muted)';
  const has = cell.posts.length > 0;
  const ring = isToday ? ';box-shadow:inset 0 0 0 2px var(--accent)' : '';
  const cursor = has ? 'pointer' : 'default';
  return `<button class="mood-cell" data-day="${cell.key}" type="button"
    style="aspect-ratio:1/1;border:0;border-radius:9px;background:${bg};color:${ink};cursor:${cursor};display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:12px;font-weight:700;padding:0;line-height:1.1${ring}">
    <span>${cell.day}</span>
    ${has ? `<span style="font-size:9px;opacity:.8;font-weight:600">${cell.posts.length}</span>` : ''}
  </button>`;
}

async function openDaySheet(dayKey, dayPosts) {
  const date = new Date(`${dayKey}T00:00:00`);
  const title = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' });
  const body = el('<div class="col" style="gap:10px"></div>');
  const sheet = openSheet(title, body);
  const sorted = [...dayPosts].sort((a, b) => b.createdAt - a.createdAt);
  let postCard = null;
  try {
    ({ postCard } = await import('./feed.js?v=20251028'));
  } catch (error) {
    body.innerHTML = emptyState('warn', 'Не загрузилось', 'Лента постов недоступна');
    return sheet;
  }
  const refresh = () => sheet.close();
  if (postCard) {
    sorted.forEach((post) => body.appendChild(postCard(post, refresh)));
  } else {
    body.innerHTML = sorted
      .map((p) => `<div class="card" style="padding:12px">
        <div class="tiny muted">${new Date(p.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>
        <p class="small" style="margin:6px 0 0;line-height:1.5">${esc((p.text || '').slice(0, 200))}</p>
      </div>`)
      .join('');
  }
  return sheet;
}

export async function render(root, options = {}) {
  const username = options.username || state.user?.username;
  if (!username) {
    root.innerHTML = emptyState('profile', 'Нужно войти', 'Войдите в аккаунт, чтобы увидеть календарь настроения');
    return;
  }

  root.innerHTML = `<div class="col" style="gap:10px"><div class="card" style="height:120px;opacity:.3"></div></div>`;

  let posts = [];
  try {
    const result = await api.getUser(username);
    posts = Array.isArray(result?.posts) ? result.posts : [];
  } catch (error) {
    root.innerHTML = emptyState('warn', 'Не загрузилось', error?.message || 'Попробуйте позже');
    return;
  }

  const byDay = groupByDay(posts);
  const cursor = new Date();
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);

  const draw = () => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const monthPosts = posts.filter((p) => {
      const d = new Date(p.createdAt);
      return d.getFullYear() === year && d.getMonth() === month;
    });

    const moodCounts = Object.create(null);
    for (const p of monthPosts) {
      if (!p.mood) continue;
      moodCounts[p.mood] = (moodCounts[p.mood] || 0) + 1;
    }
    let topMood = null;
    let topN = 0;
    for (const m of Object.keys(moodCounts)) {
      if (moodCounts[m] > topN) {
        topMood = m;
        topN = moodCounts[m];
      }
    }
    const daysWithMood = new Set(monthPosts.map((p) => dateKey(p.createdAt))).size;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const moodLabel = topMood ? (MOODS[topMood]?.label || topMood) : '—';

    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const key = dateKey(date.getTime());
      cells.push({ day, key, posts: byDay.get(key) || [] });
    }
    while (cells.length % 7 !== 0) cells.push(null);

    root.innerHTML = `
      <div class="col" style="gap:10px">
        <div class="row" style="gap:8px;align-items:center;justify-content:space-between">
          <button class="btn btn-icon btn-ghost" type="button" data-prev aria-label="Предыдущий месяц">${icon('back', 20)}</button>
          <div class="strong" style="text-align:center;font-size:16px">${esc(MONTHS[month])} ${year}</div>
          <button class="btn btn-icon btn-ghost" type="button" data-next aria-label="Следующий месяц" style="transform:scaleX(-1)">${icon('back', 20)}</button>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          ${statCard('wave', 'Лучшее настроение', moodLabel, topMood)}
          ${statCard('chart', 'Дней с настроением', `${daysWithMood}/${daysInMonth}`)}
          ${statCard('palette', 'Самое частое', moodLabel, topMood)}
        </div>
        <div class="card" style="padding:12px">
          <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px">
            ${WEEKDAYS.map((w) => `<div class="tiny muted" style="text-align:center;padding:4px 0;font-weight:600;font-size:11px">${w}</div>`).join('')}
            ${cells.map((cell) => dayCell(cell, TODAY_KEY)).join('')}
          </div>
          <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:12px;justify-content:center">
            ${Object.entries(MOODS).map(([key, m]) => `<span class="row" style="gap:4px;align-items:center;font-size:10px;color:var(--muted)">
              <i style="width:10px;height:10px;border-radius:3px;background:${m.color};border:1px solid ${m.ink}55;display:inline-block"></i>${esc(m.label)}
            </span>`).join('')}
          </div>
          <div class="tiny muted" style="margin-top:10px;text-align:center;line-height:1.5">
            ${plural(monthPosts.length, 'запись', 'записи', 'записей')} за этот месяц · нажмите на день, чтобы увидеть посты
          </div>
        </div>
      </div>`;

    root.querySelector('[data-prev]').onclick = () => {
      cursor.setMonth(cursor.getMonth() - 1);
      draw();
    };
    root.querySelector('[data-next]').onclick = () => {
      cursor.setMonth(cursor.getMonth() + 1);
      draw();
    };
    root.querySelectorAll('[data-day]').forEach((btn) => {
      btn.onclick = () => {
        const key = btn.dataset.day;
        const dayPosts = byDay.get(key) || [];
        if (!dayPosts.length) return;
        openDaySheet(key, dayPosts);
      };
    });
  };

  draw();
}

export function openMoodCalendar(options) {
  const body = el('<div class="col" style="gap:10px"><div class="card" style="height:120px;opacity:.3"></div></div>');
  const sheet = openSheet('Календарь настроения', body);
  render(body, options).catch((error) => {
    body.innerHTML = emptyState('warn', 'Не загрузилось', error?.message || 'Попробуйте позже');
  });
  return sheet;
}
