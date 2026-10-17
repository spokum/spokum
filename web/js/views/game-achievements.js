import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, toast, emptyState } from '../ui.js';

const STATS_KEY = 'spokum.gameStats';
const BEST_PREFIX = 'spokum.best.';
const PIN_KEY = 'spokum.pinnedGameAchievements';
const MAX_PINS = 3;

export const RARITY = {
  common: { label: 'Обычное', color: '#9aa3b0', glow: 'rgba(154,163,176,.32)' },
  rare:   { label: 'Редкое',  color: '#8aabc7', glow: 'rgba(138,171,199,.38)' },
  epic:   { label: 'Эпическое', color: '#9f96c2', glow: 'rgba(159,150,194,.45)' },
  legend: { label: 'Легендарное', color: '#ccb079', glow: 'rgba(204,176,121,.5)' }
};

// Russian titles. (Task spec had a stray CJK fragment in the first title — replaced with proper Russian.)
export function gameAchievementsList() {
  return [
    { id: 'first_play',        title: 'Первый запуск',  desc: 'Сыграйте в любую игру',          icon: 'play',    rarity: 'common', check: (s) => s.totalPlays >= 1 },
    { id: 'play_10',           title: 'Любитель игр',   desc: '10 игр сыграно',                 icon: 'games',   rarity: 'common', check: (s) => s.totalPlays >= 10 },
    { id: 'play_50',           title: 'Геймер',         desc: '50 игр сыграно',                 icon: 'games',   rarity: 'rare',   check: (s) => s.totalPlays >= 50 },
    { id: 'high_score_100',    title: 'Сотка',          desc: 'Наберите 100 очков за игру',     icon: 'star',    rarity: 'common', check: (s) => s.bestScore >= 100 },
    { id: 'high_score_1000',   title: 'Тысячник',       desc: 'Наберите 1000 очков',            icon: 'trophy',  rarity: 'rare',   check: (s) => s.bestScore >= 1000 },
    { id: 'high_score_5000',   title: 'Мастер',         desc: 'Наберите 5000 очков',            icon: 'trophy',  rarity: 'epic',   check: (s) => s.bestScore >= 5000 },
    { id: 'play_5_games',      title: 'Разнообразие',   desc: 'Сыграйте в 5 разных игр',        icon: 'palette', rarity: 'rare',   check: (s) => s.uniqueGames >= 5 },
    { id: 'play_10_games',     title: 'Эрудит',         desc: 'Сыграйте в 10 разных игр',       icon: 'palette', rarity: 'epic',   check: (s) => s.uniqueGames >= 10 },
    { id: 'streak_3',          title: 'Серия из 3',     desc: '3 дня подряд играйте',           icon: 'flame',   rarity: 'rare',   check: (s) => s.gameStreak >= 3 },
    { id: 'streak_7',          title: 'Неделя игр',     desc: '7 дней подряд',                  icon: 'flame',   rarity: 'legend', check: (s) => s.gameStreak >= 7 }
  ];
}

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function readRawStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  return { totalPlays: 0, bestScore: 0, uniqueGames: {}, gameStreak: 0, lastPlayDate: null };
}

function writeRawStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {}
}

// Returns a flat stats object suitable for achievement checks.
export function computeGameStats() {
  const raw = readRawStats();
  let uniqueCount = 0;
  if (raw.uniqueGames && typeof raw.uniqueGames === 'object') {
    uniqueCount = Object.keys(raw.uniqueGames).filter((k) => raw.uniqueGames[k]).length;
  }
  return {
    totalPlays: Number(raw.totalPlays) || 0,
    bestScore: Number(raw.bestScore) || 0,
    uniqueGames: uniqueCount,
    gameStreak: Number(raw.gameStreak) || 0,
    lastPlayDate: raw.lastPlayDate || null
  };
}

// Returns the raw stored stats (with uniqueGames as an object map).
export function rawGameStats() {
  return readRawStats();
}

// Call when a game ends. Updates localStorage stats and returns the new flat stats.
export function recordGamePlay(gameId, score) {
  if (!gameId) return computeGameStats();
  const raw = readRawStats();
  raw.totalPlays = (Number(raw.totalPlays) || 0) + 1;

  if (!raw.uniqueGames || typeof raw.uniqueGames !== 'object') raw.uniqueGames = {};
  raw.uniqueGames[String(gameId)] = true;

  const s = Number(score) || 0;
  if (s > (Number(raw.bestScore) || 0)) raw.bestScore = s;

  // Per-game best score in its own key (matches games.js bestKey pattern).
  const bestKey = BEST_PREFIX + String(gameId);
  const cur = Number(localStorage.getItem(bestKey)) || 0;
  if (s > cur) {
    try { localStorage.setItem(bestKey, String(s)); } catch {}
  }

  // Streak handling.
  const today = dateKey(new Date());
  const yesterday = dateKey(new Date(Date.now() - 86400000));
  if (raw.lastPlayDate === today) {
    // already played today — keep streak
  } else if (raw.lastPlayDate === yesterday) {
    raw.gameStreak = (Number(raw.gameStreak) || 0) + 1;
  } else {
    raw.gameStreak = 1;
  }
  raw.lastPlayDate = today;

  writeRawStats(raw);
  return computeGameStats();
}

function evaluate(list, stats) {
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

export function pinnedGameAchievementIds() {
  return readPins();
}

export function toggleGameAchievementPin(id) {
  if (!id) return readPins();
  const list = readPins();
  const idx = list.indexOf(String(id));
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    // Only allow pinning unlocked achievements, and cap at MAX_PINS.
    const stats = computeGameStats();
    const item = gameAchievementsList().find((a) => a.id === String(id));
    if (!item) return list;
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
  }
  writePins(list);
  return list;
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
  const pinMark = pinned ? `<span class="pin-mark" style="position:absolute;top:4px;right:6px;color:${r.color}">${icon('star', 11)}</span>` : '';
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
      : '<p class="tiny muted" style="margin:0;max-width:280px;line-height:1.5">Продолжайте играть — достижение откроется само</p>'}
  </div>`);
  const sheet = openSheet(item.title, body);
  const pinBtn = body.querySelector('[data-pin]');
  if (pinBtn) {
    pinBtn.onclick = () => {
      const next = toggleGameAchievementPin(item.id);
      onToggle?.(next);
      sheet.close();
    };
  }
  return sheet;
}

export function openGameAchievements() {
  const body = el('<div class="col" style="gap:12px"></div>');
  const sheet = openSheet('Игровые достижения', body);

  const draw = () => {
    const stats = computeGameStats();
    const list = gameAchievementsList();
    const evaluated = evaluate(list, stats);
    const pins = readPins();
    const count = evaluated.filter((a) => a.unlocked).length;
    const total = evaluated.length;
    const pct = total ? Math.round((count / total) * 100) : 0;

    if (!total) {
      body.innerHTML = emptyState('games', 'Пока пусто', 'Играйте, чтобы открывать достижения');
      return sheet;
    }

    body.innerHTML = `
      <div class="card" style="padding:14px">
        <div class="row between" style="align-items:center;gap:8px">
          <div style="min-width:0">
            <div class="strong">${count} / ${total} открыто</div>
            <div class="tiny muted" style="margin-top:2px;line-height:1.4">Играйте каждый день, чтобы открывать новые · можно закрепить до ${MAX_PINS}</div>
          </div>
          <div class="pill ${count === total && total ? 'good' : ''}" style="flex:none">${pct}%</div>
        </div>
        <div class="meter" style="margin-top:10px"><i style="width:${pct}%"></i></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
        ${evaluated.map((a) => badgeCell(a, pins.includes(a.id))).join('')}
      </div>
      <p class="tiny muted" style="margin:0;line-height:1.5;text-align:center">
        ${icon('spark', 12)} Достижения видны только вам
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
