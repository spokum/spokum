import { api, MOODS } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, emptyState, toast } from '../ui.js';

// Настроение сети — общий срез настроений всех пользователей СпокУма.
// Собираем данные из двух источников:
//   1) api.searchUsers('')   — первые 40 пользователей (с их текущим настроением)
//   2) api.listPosts({limit}) — последние записи (с настроением поста)
// Считаем проценты, рисуем SVG-круговую диаграмму, показываем топ-3.

const MOOD_ICONS = {
  calm: 'leaf',
  joy: 'star',
  sad: 'wave',
  anger: 'flame',
  anxiety: 'moon',
  tired: 'moon',
  love: 'heart',
  inspired: 'spark'
};

function svgArc(cx, cy, r, startAngle, endAngle) {
  // Возвращает path-строку для сектора круга (pie slice).
  const start = polar(cx, cy, r, endAngle);
  const end = polar(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= Math.PI ? 0 : 1;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

function polar(cx, cy, r, angle) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function iconFor(mood) {
  return MOOD_ICONS[mood] || 'wave';
}

export async function openNetworkMood() {
  const body = el('<div class="col" style="gap:10px"><div class="card" style="height:120px;opacity:.3"></div></div>');
  const sheet = openSheet('Настроение сети', body);

  let users = [];
  let posts = [];
  try {
    const u = await api.searchUsers('');
    users = u?.users || [];
  } catch (e) { /* ignore — локальный режим может не иметь других пользователей */ }
  try {
    const p = await api.listPosts({ limit: 40 });
    posts = p?.posts || [];
  } catch { /* ignore */ }

  // Агрегируем настроения: учитываем и текущее настроение пользователя,
  // и настроения его последних постов (по одному баллу за каждый источник).
  const counts = {};
  const trend = {}; // по дням недели за последние 7 дней
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;

  users.forEach((u) => {
    const m = u.mood;
    if (!m) return;
    counts[m] = (counts[m] || 0) + 1;
  });
  posts.forEach((p) => {
    const m = p.mood;
    if (!m) return;
    counts[m] = (counts[m] || 0) + 1;
    if (p.createdAt && now - p.createdAt < week) {
      const day = new Date(p.createdAt).getDay();
      if (!trend[day]) trend[day] = {};
      trend[day][m] = (trend[day][m] || 0) + 1;
    }
  });

  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  if (!total) {
    body.innerHTML = emptyState('compass', 'Пока тихо', 'Как только люди зайдут и поделятся настроением — здесь появится общая картина');
    return sheet;
  }

  const sorted = Object.entries(counts)
    .map(([mood, count]) => ({ mood, count, pct: (count / total) * 100, info: MOODS[mood] || MOODS.calm }))
    .sort((a, b) => b.count - a.count);

  const dominant = sorted[0];
  const top3 = sorted.slice(0, 3);

  // SVG-пирог
  const cx = 90, cy = 90, R = 70;
  let angle = -Math.PI / 2;
  const slices = sorted.map((row) => {
    const slice = { d: svgArc(cx, cy, R, angle, angle + (row.pct / 100) * Math.PI * 2), color: row.info.ink, mood: row.mood, pct: row.pct };
    angle += (row.pct / 100) * Math.PI * 2;
    return slice;
  });

  // Тренд за неделю (по дням): для каждого дня находим доминирующее настроение.
  const dayLabels = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const today = new Date().getDay();
  const weekRows = [];
  for (let i = 6; i >= 0; i--) {
    const day = (today - i + 7) % 7;
    const dayCounts = trend[day] || {};
    const dayTotal = Object.values(dayCounts).reduce((s, v) => s + v, 0);
    let top = null;
    if (dayTotal) {
      top = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];
    }
    weekRows.push({
      label: dayLabels[day],
      topMood: top ? top[0] : null,
      topPct: top && dayTotal ? Math.round((top[1] / dayTotal) * 100) : 0,
      total: dayTotal,
      info: top ? (MOODS[top[0]] || MOODS.calm) : null
    });
  }

  body.innerHTML = `
    <div class="card" style="padding:14px;line-height:1.5">
      <div class="row" style="gap:8px;align-items:flex-start">
        <span style="color:${dominant.info.ink}">${icon('compass', 22)}</span>
        <div class="grow">
          <div class="tiny muted">Сейчас в сети преобладает</div>
          <div class="strong" style="font-size:18px;color:${dominant.info.ink}">${esc(dominant.info.label)} (${Math.round(dominant.pct)}%)</div>
          <div class="tiny muted" style="margin-top:2px">На основе ${users.length} профилей и ${posts.length} последних записей</div>
        </div>
      </div>
    </div>

    <div class="card" style="padding:14px">
      <div class="strong small" style="margin-bottom:10px">${icon('chart', 16)} Распределение настроений</div>
      <div class="row" style="gap:14px;align-items:center;flex-wrap:wrap">
        <svg viewBox="0 0 180 180" width="160" height="160" aria-hidden="true">
          ${slices.map((s) => `<path d="${s.d}" fill="${s.color}" stroke="var(--surface)" stroke-width="2"></path>`).join('')}
          <circle cx="${cx}" cy="${cy}" r="34" fill="var(--surface)"></circle>
          <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="var(--ink)" font-size="13" font-weight="700">${total}</text>
          <text x="${cx}" y="${cy + 12}" text-anchor="middle" fill="var(--muted)" font-size="9">голосов</text>
        </svg>
        <div class="col grow" style="gap:6px;min-width:140px">
          ${top3.map((row) => `
            <div class="row" style="gap:8px;align-items:center">
              <span style="color:${row.info.ink}">${icon(iconFor(row.mood), 18)}</span>
              <div class="grow">
                <div class="row between"><span class="small strong">${esc(row.info.label)}</span><span class="tiny muted">${Math.round(row.pct)}%</span></div>
                <div class="meter"><i style="width:${Math.round(row.pct)}%;background:${row.info.ink}"></i></div>
              </div>
            </div>
          `).join('')}
          ${sorted.length > 3 ? `<div class="tiny muted" style="margin-top:4px">и ещё ${sorted.length - 3} ${ruPlural(sorted.length - 3, 'настроение', 'настроения', 'настроений')}</div>` : ''}
        </div>
      </div>
    </div>

    <div class="card" style="padding:14px">
      <div class="strong small" style="margin-bottom:10px">${icon('clock', 16)} Тренд за неделю</div>
      <div class="row" style="gap:6px;align-items:flex-end">
        ${weekRows.map((d) => {
          const h = Math.max(8, Math.min(70, d.total * 14));
          return `<div class="col" style="gap:4px;align-items:center;flex:1">
            <div title="${d.topMood ? (MOODS[d.topMood]?.label || '') + ' ' + d.topPct + '%' : 'нет данных'}"
              style="width:100%;max-width:24px;height:${h}px;border-radius:6px;background:${d.info ? d.info.ink : 'rgba(238,242,251,0.12)'}"></div>
            <span class="tiny muted">${d.label}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="tiny muted" style="margin-top:8px;line-height:1.5">Каждый столбик — самый частый настрой в этот день недели. Чем выше, тем больше записей.</div>
    </div>

    <div class="card" style="padding:14px">
      <div class="strong small" style="margin-bottom:10px">${icon('spark', 16)} Топ-3 настроения</div>
      <div class="col" style="gap:8px">
        ${top3.map((row, i) => `
          <div class="row" style="gap:10px;align-items:center">
            <span style="width:22px;height:22px;border-radius:999px;background:${row.info.ink};color:#0e1320;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px">${i + 1}</span>
            <span style="color:${row.info.ink}">${icon(iconFor(row.mood), 18)}</span>
            <div class="grow">
              <div class="row between"><span class="small strong">${esc(row.info.label)}</span><span class="tiny muted">${Math.round(row.pct)}%</span></div>
              <div class="meter"><i style="width:${Math.round(row.pct)}%;background:${row.info.ink}"></i></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="tiny muted" style="line-height:1.5;padding:0 2px">Данные анонимны и собираются на вашем устройстве из открытого списка людей и записей. Никаких личных данных не сохраняется.</div>
  `;

  return sheet;
}

function ruPlural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
