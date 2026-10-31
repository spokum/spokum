import { api, state, MOODS } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, emptyState } from '../ui.js';

/**
 * Карта настроений (Mood Map) — визуальная карта всех пользователей сети.
 * Каждый пользователь — точка на canvas, расположенная по кругу в соответствии
 * с его настроением (8 настроений → 8 секторов). В центре — преобладающее
 * настроение сети. Наведение/тап по точке показывает имя пользователя.
 *
 * Данные: api.adminUsers('') (если пользователь — админ) или api.searchUsers('')
 * (для остальных, до 40 человек).
 */

const MOOD_KEYS = Object.keys(MOODS);

// Псевдослучайный, но детерминированный сдвиг точки внутри сектора, чтобы
// точки не накладывались друг на друга и не прыгали при перерисовке.
function seedOffset(seed) {
  const a = Math.sin(seed * 9301 + 49297) * 233280;
  const b = Math.sin(seed * 12345 + 67890) * 198491;
  return [(a - Math.floor(a)) - 0.5, (b - Math.floor(b)) - 0.5];
}

function dominantMood(users) {
  const counts = {};
  for (const u of users) {
    const m = u?.mood && MOODS[u.mood] ? u.mood : 'calm';
    counts[m] = (counts[m] || 0) + 1;
  }
  let best = 'calm';
  let max = 0;
  for (const k of MOOD_KEYS) {
    if ((counts[k] || 0) > max) {
      max = counts[k] || 0;
      best = k;
    }
  }
  return { mood: best, count: max, total: users.length };
}

function drawMap(canvas, users, hoverId) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 320;
  const cssH = cssW;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const cx = cssW / 2;
  const cy = cssH / 2;
  const radius = Math.min(cx, cy) - 28;
  const innerRadius = radius * 0.42;

  // Разметка секторов и радиальных линий
  ctx.strokeStyle = 'rgba(255,255,255,.07)';
  ctx.lineWidth = 1;
  for (let i = 0; i < MOOD_KEYS.length; i++) {
    const angle = (i / MOOD_KEYS.length) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * innerRadius, cy + Math.sin(angle) * innerRadius);
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.stroke();
  }
  // Внешний круг
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.stroke();
  // Внутренний круг
  ctx.beginPath();
  ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  ctx.stroke();

  // Метки настроений по кругу
  ctx.font = '600 10px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < MOOD_KEYS.length; i++) {
    const mood = MOODS[MOOD_KEYS[i]];
    const angle = (i / MOOD_KEYS.length) * Math.PI * 2 - Math.PI / 2;
    const lx = cx + Math.cos(angle) * (radius + 14);
    const ly = cy + Math.sin(angle) * (radius + 14);
    ctx.fillStyle = mood.ink;
    ctx.fillText(mood.label, lx, ly);
  }

  // Точки пользователей
  const points = [];
  users.forEach((u, index) => {
    const moodKey = u?.mood && MOODS[u.mood] ? u.mood : 'calm';
    const moodIndex = MOOD_KEYS.indexOf(moodKey);
    const baseAngle = (moodIndex / MOOD_KEYS.length) * Math.PI * 2 - Math.PI / 2;
    // Сектор занимает 1/n круга; распределяем точки внутри сектора
    const sectorWidth = (Math.PI * 2) / MOOD_KEYS.length;
    const [offA, offR] = seedOffset(Number(u.id) || index + 1);
    const angle = baseAngle + offA * sectorWidth * 0.8;
    const r = innerRadius + 8 + (offR + 0.5) * (radius - innerRadius - 16);
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    const isMe = state.user && String(u.id) === String(state.user.id);
    const isHover = hoverId != null && String(u.id) === String(hoverId);
    const baseR = isMe ? 6 : 4;
    const dotR = isHover ? baseR + 2 : baseR;
    const mood = MOODS[moodKey];

    // Подсветка под точкой при наведении
    if (isHover) {
      ctx.beginPath();
      ctx.arc(x, y, dotR + 5, 0, Math.PI * 2);
      ctx.fillStyle = mood.ink + '33';
      ctx.fill();
    }
    // Сама точка
    ctx.beginPath();
    ctx.arc(x, y, dotR, 0, Math.PI * 2);
    ctx.fillStyle = mood.ink;
    ctx.fill();
    if (isMe) {
      ctx.beginPath();
      ctx.arc(x, y, dotR + 2, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    points.push({ id: u.id, x, y, r: dotR + 4, user: u });
  });

  // Центр — преобладающее настроение
  const dom = dominantMood(users);
  const domMood = MOODS[dom.mood];
  // Маленький кружок-пульс
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerRadius);
  grad.addColorStop(0, domMood.ink + 'cc');
  grad.addColorStop(1, domMood.ink + '00');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
  ctx.fill();
  // Текст в центре
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 11px Inter, system-ui, sans-serif';
  ctx.fillText('СЕТЬ', cx, cy - 16);
  ctx.font = '700 14px Inter, system-ui, sans-serif';
  ctx.fillStyle = domMood.ink;
  ctx.fillText(domMood.label, cx, cy);
  ctx.font = '500 10px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.fillText(`${dom.count} из ${dom.total}`, cx, cy + 14);

  return points;
}

function legendHtml() {
  return `<div class="row" style="gap:8px;flex-wrap:wrap;justify-content:center">
    ${MOOD_KEYS.map((k) => {
      const m = MOODS[k];
      return `<span class="row" style="gap:5px;align-items:center;font-size:11px;color:var(--muted)">
        <i style="width:9px;height:9px;border-radius:50%;background:${m.ink};display:inline-block"></i>
        ${esc(m.label)}
      </span>`;
    }).join('')}
  </div>`;
}

async function fetchUsers() {
  // Сначала пробуем админский список (полный), затем поиск (до 40).
  try {
    if (api.adminUsers && state.user?.isAdmin) {
      const result = await api.adminUsers('');
      if (result?.users?.length) return result.users;
    }
  } catch {}
  try {
    const result = await api.searchUsers('');
    return result?.users || [];
  } catch (error) {
    throw error;
  }
}

export async function openMoodMap() {
  const body = el('<div class="col" style="gap:12px"><div class="card" style="height:120px;opacity:.3"></div></div>');
  let resizeHandler = null;
  const sheet = openSheet('Карта настроений', body, {
    onClose: () => {
      if (resizeHandler) window.removeEventListener('resize', resizeHandler);
    }
  });

  let users = [];
  let points = [];
  let hoverId = null;

  const draw = () => {
    const canvas = body.querySelector('[data-canvas]');
    if (!canvas) return;
    points = drawMap(canvas, users, hoverId);
  };

  const renderList = () => {
    body.innerHTML = `
      <p class="tiny muted" style="margin:0;line-height:1.55">
        Каждый человек — точка. Точка лежит в секторе своего настроения.
        Наведите курсор или тапните по точке, чтобы увидеть имя. В центре —
        преобладающее настроение сети.
      </p>
      <div class="card" style="padding:8px;background:var(--surface)">
        <canvas data-canvas style="width:100%;height:auto;display:block;touch-action:none"></canvas>
      </div>
      <div data-tip class="tiny muted" style="min-height:18px;text-align:center;line-height:1.4">
        ${users.length ? `Всего точек: ${users.length}` : ''}
      </div>
      ${legendHtml()}
      <button class="btn" data-refresh style="width:100%">${icon('refresh', 17)} Обновить</button>`;

    const canvas = body.querySelector('[data-canvas]');
    const tip = body.querySelector('[data-tip]');

    // Подбираем высоту canvas под ширину (квадрат)
    const resize = () => {
      const w = canvas.clientWidth || 300;
      canvas.style.height = w + 'px';
      draw();
    };
    resize();
    // На случай, когда layout ещё не устоялся в момент вставки (sheet
    // анимируется), перерисуем на следующем кадре.
    requestAnimationFrame(resize);
    resizeHandler = resize;
    window.addEventListener('resize', resize);

    const findHit = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      let best = null;
      let bestDist = 1e9;
      for (const p of points) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < p.r && d < bestDist) {
          bestDist = d;
          best = p;
        }
      }
      return best;
    };

    const onMove = (event) => {
      const clientX = event.touches ? event.touches[0].clientX : event.clientX;
      const clientY = event.touches ? event.touches[0].clientY : event.clientY;
      const hit = findHit(clientX, clientY);
      const newId = hit ? hit.id : null;
      if (newId !== hoverId) {
        hoverId = newId;
        draw();
      }
      if (hit) {
        const me = state.user && String(hit.user.id) === String(state.user.id);
        tip.innerHTML = `<span style="color:${MOODS[hit.user.mood && MOODS[hit.user.mood] ? hit.user.mood : 'calm'].ink}">●</span>
          <strong>${esc(hit.user.displayName || hit.user.username || 'Гость')}</strong>${me ? ' (вы)' : ''}`;
        canvas.style.cursor = 'pointer';
      } else {
        tip.textContent = `Всего точек: ${users.length}`;
        canvas.style.cursor = '';
      }
    };
    const onLeave = () => {
      if (hoverId !== null) {
        hoverId = null;
        draw();
      }
      tip.textContent = `Всего точек: ${users.length}`;
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('touchstart', (event) => {
      onMove(event);
    }, { passive: true });
    canvas.addEventListener('touchmove', (event) => {
      onMove(event);
    }, { passive: true });

    body.querySelector('[data-refresh]').onclick = async () => {
      body.innerHTML = '<div class="card" style="height:120px;opacity:.3"></div>';
      await loadUsers();
      renderList();
    };
  };

  const loadUsers = async () => {
    try {
      users = await fetchUsers();
    } catch (error) {
      body.innerHTML = emptyState('warn', 'Не загрузилось', error?.message || 'Попробуйте обновить');
      return false;
    }
    return true;
  };

  const ok = await loadUsers();
  if (!ok) return sheet;
  if (!users.length) {
    body.innerHTML = emptyState('compass', 'Пока пусто', 'Здесь появятся люди, как только кто-то зайдёт');
    return sheet;
  }
  renderList();
  return sheet;
}
