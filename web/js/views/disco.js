import { state, api, isBeta } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast } from '../ui.js';

const PLAYLIST = [
  { file: '1.mp3', artist: 'HOFMANNITA, Brick Bazuka', title: 'Сердце', foreignAgent: false, flag: false, bees: false },
  { file: '2.mp3', artist: 'Madk1d, VILLIAN', title: 'Династия', foreignAgent: false, flag: false, bees: false },
  { file: '3.mp3', artist: 'Madk1d', title: 'питер паркер', foreignAgent: false, flag: false, bees: false },
  { file: '4.mp3', artist: 'Мэйби Бэйби', title: 'Любимая школа', foreignAgent: false, flag: false, bees: false },
  { file: '5.mp3', artist: 'Noize MC, Монеточка', title: 'Люди с автоматами', foreignAgent: true, flag: false, bees: false },
  { file: '6.mp3', artist: 'SLAVA MARLOW, Toly Summer, Кобяков, GAZAN, Вова Солодков', title: 'Ты горишь как огонь 2', foreignAgent: false, flag: false, bees: false },
  { file: '7.mp3', artist: 'MORGENSHTERN', title: 'ICE', foreignAgent: true, flag: false, bees: false },
  { file: '8.mp3', artist: '17 Seventeen', title: 'Конфетка', foreignAgent: false, flag: false, bees: false },
  { file: '9.mp3', artist: 'SHAMAN', title: 'Россия Мама', foreignAgent: false, flag: true, bees: false },
  { file: '10.mp3', artist: 'VILLIAN', title: 'Случайно Наступил На Шприц', foreignAgent: false, flag: false, bees: false },
  { file: '11.mp3', artist: 'Сыновья России', title: 'Кто пчёлок уважает', foreignAgent: false, flag: false, bees: true },
  { file: '12.mp3', artist: 'whitek3d', title: 'Катюха', foreignAgent: false, flag: false, bees: false },
  { file: '13.mp3', artist: 'FACE', title: 'Юморист', foreignAgent: true, flag: false, bees: false },
  { file: '14.mp3', artist: 'Миша Каштан', title: 'Ни пера, ни пуха!', foreignAgent: false, flag: false, bees: false },
  { file: '15.mp3', artist: 'dabbackwood', title: 'Назад в кресты', foreignAgent: false, flag: false, bees: false },
  { file: '16.mp3', artist: 'VILLIAN, Aarne', title: 'Общество Мертвых Поэтов', foreignAgent: false, flag: false, bees: false },
  { file: '17.mp3', artist: 'ONDA ANDAR', title: 'type london', foreignAgent: false, flag: false, bees: false },
  { file: '18.mp3', artist: 'FACE', title: 'Мой Калашников', foreignAgent: true, flag: false, bees: false },
  { file: '19.mp3', artist: 'pluggstar', title: 'Человек-бензопила', foreignAgent: false, flag: false, bees: false },
  { file: '20.mp3', artist: 'Luci4', title: 'BodyPartz', foreignAgent: false, flag: false, bees: false },
];

const JOINED_KEY = 'spokum.disco.joined';
const REWARDED_KEY = 'spokum.disco.rewarded';

function getJoined() {
  try { return JSON.parse(localStorage.getItem(JOINED_KEY) || '[]'); } catch { return []; }
}
function saveJoined(list) {
  try { localStorage.setItem(JOINED_KEY, JSON.stringify(list)); } catch {}
}
function addJoined(user) {
  const list = getJoined();
  if (!list.find(u => u.id === user.id)) {
    list.push({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      hue: user.hue,
      seatIndex: -1
    });
    saveJoined(list);
  }
  return list;
}
function isRewarded(userId) {
  try {
    const data = JSON.parse(localStorage.getItem(REWARDED_KEY) || '{}');
    return !!data[String(userId)];
  } catch { return false; }
}
function markRewarded(userId) {
  try {
    const data = JSON.parse(localStorage.getItem(REWARDED_KEY) || '{}');
    data[String(userId)] = true;
    localStorage.setItem(REWARDED_KEY, JSON.stringify(data));
  } catch {}
}

export function openDisco() {
  if (!isBeta(state.user)) {
    toast('Ивент пока только для @silver', 'err');
    return;
  }
  if (!state.user) {
    toast('Нужен вход', 'err');
    return;
  }
  showEntry();
}

function showEntry() {
  const view = el(`
    <div style="position:fixed;inset:0;z-index:99999;background:#050008;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:24px;padding:20px">
      <div style="text-align:center">
        <div style="font-size:28px;font-weight:800;background:linear-gradient(90deg,#ff00ff,#00ffff,#ff00ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-size:200% auto;animation:disco-shimmer 2s linear infinite">Возращение СпокУм!</div>
        <div style="color:#888;font-size:15px;margin-top:8px">Присоединяйтесь к дискотеке! Всеми любимые песни там</div>
      </div>
      <button class="btn btn-primary" id="disco-enter" style="padding:14px 40px;font-size:16px;border-radius:8px;background:linear-gradient(135deg,#ff00ff,#00ffff);border:none;color:#fff;font-weight:700;cursor:pointer">Зайти</button>
      <button class="btn btn-ghost" id="disco-back" style="color:#555;font-size:13px">Назад</button>
    </div>
    <style>
      @keyframes disco-shimmer { to { background-position: 200% center; } }
    </style>
  `);
  document.body.appendChild(view);
  document.body.style.overflow = 'hidden';

  view.querySelector('#disco-back').onclick = () => {
    view.remove();
    document.body.style.overflow = '';
  };

  view.querySelector('#disco-enter').onclick = () => {
    view.remove();
    showDisclaimer();
  };
}

function showDisclaimer() {
  const view = el(`
    <div style="position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;padding:20px">
      <div style="background:#111;border:1px solid #333;border-radius:12px;padding:32px;max-width:380px;text-align:center">
        <div style="font-size:20px;font-weight:700;color:#e8a030;margin-bottom:16px">Внимание!</div>
        <div style="color:#999;font-size:14px;line-height:1.6;margin-bottom:24px">
          На дискотеке присутствуют песни с ненормативной лексикой и песни созданные при участии иноагентов
        </div>
        <div style="display:flex;gap:12px">
          <button class="btn btn-primary" id="disco-yes" style="flex:1;padding:12px;border-radius:8px;background:#1a3a1a;border:1px solid #2a5a2a;color:#6a8a6a;cursor:pointer;font-weight:600">Продолжить</button>
          <button class="btn" id="disco-no" style="flex:1;padding:12px;border-radius:8px;background:#1a1a1a;border:1px solid #333;color:#666;cursor:pointer">Отмена</button>
        </div>
      </div>
    </div>
  `);
  document.body.appendChild(view);

  view.querySelector('#disco-no').onclick = () => {
    view.remove();
    document.body.style.overflow = '';
  };

  view.querySelector('#disco-yes').onclick = () => {
    view.remove();
    showDisco();
  };
}

function showDisco() {
  const me = state.user;
  const initialJoined = getJoined();
  const hasJoined = initialJoined.find(u => u.id === me.id);

  const view = el(`
    <div id="disco-view" style="position:fixed;inset:0;z-index:99999;background:#030006;overflow:hidden">
      <canvas id="disco-canvas" style="position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;pointer-events:none"></canvas>

      <div id="disco-nowplaying" style="position:absolute;top:12px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.6);backdrop-filter:blur(8px);padding:10px 20px;border-radius:10px;border:1px solid rgba(255,255,255,.1);text-align:center;max-width:90%;z-index:10">
        <div id="disco-track-title" style="color:#fff;font-size:14px;font-weight:600">Загрузка...</div>
        <div id="disco-track-artist" style="color:#888;font-size:11px;margin-top:2px"></div>
      </div>

      <div id="disco-flag-warn" style="position:absolute;top:60px;left:50%;transform:translateX(-50%);background:rgba(232,160,48,.15);border:1px solid rgba(232,160,48,.3);padding:6px 14px;border-radius:8px;color:#e8a030;font-size:11px;z-index:10;display:none">
        Данная песня создана при участии иноагента
      </div>

      <button id="disco-exit" style="position:absolute;top:12px;right:12px;pointer-events:auto;background:rgba(0,0,0,.5);border:1px solid #333;color:#888;width:36px;height:36px;border-radius:8px;cursor:pointer;z-index:10;font-size:18px">X</button>

      <div id="disco-join-area" style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);z-index:10;pointer-events:auto">
        ${!hasJoined ? `<button id="disco-join" style="padding:14px 36px;border-radius:10px;background:linear-gradient(135deg,#ff00ff,#00ffff);border:none;color:#fff;font-weight:700;font-size:15px;cursor:pointer;box-shadow:0 0 30px rgba(255,0,255,.4)">Присоединиться</button>` : ''}
      </div>

      <div id="disco-controls" style="position:absolute;bottom:20px;right:12px;display:flex;gap:8px;z-index:10;pointer-events:auto">
        <button id="disco-prev" style="background:rgba(0,0,0,.7);border:1px solid #555;color:#fff;width:44px;height:44px;border-radius:10px;cursor:pointer;font-size:18px;z-index:20">PREV</button>
        <button id="disco-play" style="background:rgba(0,0,0,.7);border:1px solid #555;color:#fff;width:44px;height:44px;border-radius:10px;cursor:pointer;font-size:16px;z-index:20">PAUSE</button>
        <button id="disco-next" style="background:rgba(0,0,0,.7);border:1px solid #555;color:#fff;width:44px;height:44px;border-radius:10px;cursor:pointer;font-size:18px;z-index:20">NEXT</button>
      </div>

      <audio id="disco-audio" style="display:none"></audio>
    </div>
  `);
  document.body.appendChild(view);
  document.body.style.overflow = 'hidden';

  const canvas = view.querySelector('#disco-canvas');
  const audio = view.querySelector('#disco-audio');
  const ctx = canvas.getContext('2d', { alpha: false });

  let currentTrack = 0;
  let isPlaying = false;
  let animFrame = null;
  let silverUser = null;
  let danilUser = null;
  let joined = getJoined();

  const W = 1600, H = 1000;
  let cw = 0, ch = 0, dpr = 1, scale = 1, ox = 0, oy = 0;
  let last = performance.now(), time = 0, paused = false, strobe = true, intensity = 0.78;
  let mode = 'sapphire';
  const pointer = { x: 800, y: 530, active: false };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { paused = true; strobe = false; }
  const palettes = {
    sapphire: { a: '#38bdf8', b: '#ff304f', c: '#f6e86c', screen: '#071c32' },
    pulse: { a: '#ff304f', b: '#38bdf8', c: '#ff9f43', screen: '#2a0713' },
    finale: { a: '#f6e86c', b: '#ff304f', c: '#38bdf8', screen: '#251505' }
  };
  let pal = palettes[mode];
  const fixtures = [210, 365, 520, 680, 800, 920, 1080, 1235, 1390];
  const dust = Array.from({ length: 95 }, (_, i) => ({ x: (i * 173.31) % 1600, y: 120 + (i * 97.7) % 610, r: .4 + (i % 5) * .25, s: .06 + (i % 7) * .012, p: i * .83 }));
  const eq = Array.from({ length: 42 }, (_, i) => ({ p: i * .61, h: .2 + (i % 8) / 10 }));

  const avatarCache = new Map();
  function getAvatar(url) {
    if (!url) return null;
    if (avatarCache.has(url)) return avatarCache.get(url);
    const entry = { img: null, loaded: false, failed: false };
    avatarCache.set(url, entry);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { entry.loaded = true; };
    img.onerror = () => { entry.failed = true; };
    img.src = url;
    entry.img = img;
    return entry;
  }
  function drawAvatarCircle(x, y, r, url, fallbackColor, initial) {
    const safeR = Math.max(2, r);
    const entry = url ? getAvatar(url) : null;
    if (entry && entry.loaded && !entry.failed) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, safeR, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(entry.img, x - safeR, y - safeR, safeR * 2, safeR * 2);
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = fallbackColor || '#333';
      ctx.beginPath();
      ctx.arc(x, y, safeR, 0, Math.PI * 2);
      ctx.fill();
      if (initial) {
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${Math.round(safeR * 1.1)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initial, x, y + 1);
      }
      ctx.restore();
    }
  }

  function buildSeatList() {
    const list = [];
    for (let r = 0; r < 6; r++) {
      const y = 817 + r * 38;
      const w = 31 + r * 5.2;
      const h = 35 + r * 5.2;
      const gap = 40 + r * 7;
      const offset = (r % 2) * 3;
      const n = 15 + r * 2;
      for (let i = 0; i < n; i++) {
        const x = 800 + (i - (n - 1) / 2) * gap + offset;
        if (Math.abs(x - 800) < gap * 1.15) continue;
        if (x < -50 || x > 1650) continue;
        list.push({ x, y, w, h, shade: r % 2 ? '#152337' : '#111d30' });
      }
    }
    return list;
  }
  const seatList = buildSeatList();

  function assignSeats() {
    const taken = new Set();
    joined.forEach(u => {
      if (u.seatIndex >= 0 && u.seatIndex < seatList.length) taken.add(u.seatIndex);
    });
    joined.forEach(u => {
      if (u.seatIndex < 0 || u.seatIndex >= seatList.length) {
        const free = [];
        for (let i = 0; i < seatList.length; i++) if (!taken.has(i)) free.push(i);
        if (free.length) {
          const idx = free[Math.floor(Math.random() * free.length)];
          u.seatIndex = idx;
          taken.add(idx);
        }
      }
    });
    saveJoined(joined);
  }
  function refreshJoined() {
    joined = getJoined();
    assignSeats();
  }
  assignSeats();

  (async () => {
    try {
      const res = await api.getUser('silver');
      if (res && res.user) {
        silverUser = res.user;
        if (silverUser.avatar) getAvatar(silverUser.avatar);
      }
    } catch {}
  })();
  (async () => {
    try {
      const res = await api.getUser('danil');
      if (res && res.user) {
        danilUser = res.user;
        if (danilUser.avatar) getAvatar(danilUser.avatar);
      }
    } catch {}
  })();

  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function line(x1, y1, x2, y2, color, width = 1) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
  function glow(x, y, r, color, alpha = 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(.15, color); g.addColorStop(1, 'transparent');
    ctx.globalAlpha = alpha; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1;
  }

  function background() {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#080b13'); g.addColorStop(.58, '#12111a'); g.addColorStop(1, '#05070c'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 24; i++) { let x = i * 70 - 20; ctx.fillStyle = i % 2 ? '#10131b' : '#0c1018'; ctx.fillRect(x, 100, 66, 580); line(x + 65, 110, x + 65, 680, '#25222b', 1); }
    ctx.save(); ctx.globalCompositeOperation = 'screen'; let rg = ctx.createLinearGradient(0, 180, 0, 690); rg.addColorStop(0, '#00000000'); rg.addColorStop(1, pal.a + '24'); ctx.fillStyle = rg; ctx.fillRect(130, 140, 1340, 560); ctx.restore();
    line(105, 185, 1495, 185, '#33303a', 4); line(105, 193, 1495, 193, '#090a0e', 8);
    for (let x = 130; x < 1500; x += 90) { ctx.fillStyle = '#181820'; ctx.fillRect(x, 194, 8, 65); ctx.fillStyle = '#27252d'; ctx.fillRect(x + 1, 194, 2, 65); }
  }

  function curtains() {
    for (const side of [-1, 1]) {
      ctx.save(); if (side === 1) { ctx.translate(W, 0); ctx.scale(-1, 1); }
      const g = ctx.createLinearGradient(0, 0, 230, 0); g.addColorStop(0, '#240912'); g.addColorStop(.5, '#5a1020'); g.addColorStop(1, '#160810'); ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, 70); ctx.lineTo(240, 70); ctx.bezierCurveTo(225, 280, 170, 500, 215, 770); ctx.lineTo(0, 800); ctx.closePath(); ctx.fill();
      for (let i = 0; i < 9; i++) { let x = i * 25; ctx.strokeStyle = i % 2 ? '#79182a44' : '#08030999'; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(x, 80); ctx.bezierCurveTo(x + 18, 280, x - 8, 520, x + 14, 775); ctx.stroke(); }
      ctx.fillStyle = '#9d7635'; ctx.fillRect(185, 435, 34, 7); ctx.fillStyle = '#4d341d'; ctx.fillRect(185, 443, 34, 4);
      ctx.restore();
    }
    const vg = ctx.createLinearGradient(0, 65, 0, 170); vg.addColorStop(0, '#4d0d1b'); vg.addColorStop(1, '#170810'); ctx.fillStyle = vg; ctx.beginPath(); ctx.moveTo(0, 60); ctx.lineTo(1600, 60); ctx.lineTo(1600, 138); for (let x = 1600; x >= 0; x -= 100) ctx.quadraticCurveTo(x - 50, 185, x - 100, 138); ctx.closePath(); ctx.fill();
    for (let x = 0; x < 1600; x += 50) line(x, 65, x + 8, 135, '#8f233333', 8);
  }

  function truss() {
    ctx.fillStyle = '#20242b'; ctx.fillRect(150, 120, 1300, 45); ctx.fillStyle = '#080a0d'; ctx.fillRect(150, 127, 1300, 5); ctx.fillRect(150, 151, 1300, 5);
    for (let x = 155; x < 1440; x += 48) { line(x, 125, x + 42, 158, '#6d717844', 3); line(x, 158, x + 42, 125, '#484d5544', 3); }
    line(150, 118, 1450, 118, '#777b8166', 2);
    for (const x of [165, 1395]) { ctx.fillStyle = '#181c22'; ctx.fillRect(x, 165, 35, 575); for (let y = 170; y < 730; y += 44) { line(x, y, x + 35, y + 40, '#656a7144', 2); line(x + 35, y, x, y + 40, '#656a7144', 2); } }
    for (const x of [310, 800, 1290]) { line(x, 0, x, 118, '#292c32', 3); ctx.fillStyle = '#454850'; ctx.fillRect(x - 5, 112, 10, 9); }
  }

  function screen() {
    ctx.save(); ctx.shadowColor = pal.a + '55'; ctx.shadowBlur = 35; ctx.fillStyle = '#05070b'; ctx.fillRect(450, 235, 700, 335); ctx.restore();
    ctx.fillStyle = pal.screen; ctx.fillRect(461, 246, 678, 313);
    ctx.strokeStyle = '#ffffff08'; ctx.lineWidth = 1; for (let x = 462; x < 1140; x += 9) line(x, 246, x, 559, '#ffffff07'); for (let y = 246; y < 560; y += 9) line(461, y, 1139, y, '#ffffff06');
    let sg = ctx.createRadialGradient(800, 390, 20, 800, 390, 360); sg.addColorStop(0, pal.a + '2b'); sg.addColorStop(1, 'transparent'); ctx.fillStyle = sg; ctx.fillRect(461, 246, 678, 313);
    ctx.save(); ctx.translate(800, 385); ctx.rotate(time * .045); ctx.strokeStyle = pal.a + '3f'; ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(0, 0, 200 - i * 24, 95 + i * 16, i * .55, 0, Math.PI * 2); ctx.stroke(); } ctx.restore();
    const track = PLAYLIST[currentTrack];
    const titleText = track ? track.title : '';
    const artistText = track ? track.artist : '';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    let titleSize = 64;
    ctx.font = `800 ${titleSize}px Arial`;
    while (titleSize > 26 && ctx.measureText(titleText).width > 620) { titleSize -= 4; ctx.font = `800 ${titleSize}px Arial`; }
    ctx.fillStyle = '#f1f0ed';
    ctx.fillText(titleText, 800, 377);
    let artistSize = 14;
    ctx.font = `700 ${artistSize}px Arial`;
    while (artistSize > 9 && ctx.measureText(artistText).width > 640) { artistSize -= 1; ctx.font = `700 ${artistSize}px Arial`; }
    ctx.fillStyle = pal.a;
    ctx.fillText(artistText, 800, 409);
    for (let i = 0; i < eq.length; i++) { let e = eq[i], h = (20 + Math.abs(Math.sin(time * 2.1 + e.p)) * 75 * e.h) * intensity; ctx.fillStyle = i % 5 === 0 ? pal.b : pal.a + 'aa'; ctx.fillRect(491 + i * 15.5, 525 - h, 7, h); }
    ctx.fillStyle = '#3c4148'; for (const x of [454, 1134]) for (let y = 250; y < 560; y += 45) ctx.fillRect(x, y, 3, 3);
  }

  function stage() {
    ctx.fillStyle = '#15171d'; ctx.fillRect(260, 600, 1080, 126); ctx.fillStyle = '#262830'; ctx.fillRect(260, 600, 1080, 9);
    for (let x = 270; x < 1340; x += 72) line(x, 613, x, 720, '#090b0f', 2);
    ctx.fillStyle = '#20232b'; ctx.fillRect(680, 572, 240, 56); ctx.fillStyle = '#3a3d45'; ctx.fillRect(680, 572, 240, 6);
    const g = ctx.createLinearGradient(0, 705, 0, 805); g.addColorStop(0, '#2a2b30'); g.addColorStop(.13, '#101216'); g.addColorStop(1, '#090b10'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(210, 704); ctx.lineTo(1390, 704); ctx.lineTo(1460, 805); ctx.lineTo(140, 805); ctx.closePath(); ctx.fill();
    line(140, 805, 1460, 805, '#555157', 3); line(210, 704, 1390, 704, '#66646a', 2);
    for (let x = 200; x < 1430; x += 90) line(x, 706, x - 18, 801, '#2c2c31', 1);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#16171d' : '#202127'; ctx.fillRect(735 - i * 10, 725 + i * 20, 130 + i * 20, 20); line(735 - i * 10, 725 + i * 20, 865 + i * 10, 725 + i * 20, '#555159', 1); }
    ctx.save(); ctx.globalCompositeOperation = 'screen'; for (let x = 180; x < 1440; x += 36) { ctx.fillStyle = pal.a; ctx.globalAlpha = .35 + .25 * Math.sin(time * 2 + x); ctx.fillRect(x, 797, 18, 2); } ctx.restore(); ctx.globalAlpha = 1;
  }

  function speakers() {
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(side < 0 ? 260 : 1340, 0); if (side > 0) ctx.scale(-1, 1);
      for (let i = 0; i < 6; i++) { ctx.save(); ctx.translate(0, 270 + i * 38); ctx.rotate(i * .012); ctx.fillStyle = '#090b0f'; ctx.strokeStyle = '#363941'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-85, 0); ctx.lineTo(-15, 4); ctx.lineTo(-10, 35); ctx.lineTo(-88, 31); ctx.closePath(); ctx.fill(); ctx.stroke(); for (let y = 8; y < 30; y += 5) line(-79, y, -22, y + 2, '#4e515933', 1); ctx.restore(); }
      for (let j = 0; j < 2; j++) { ctx.fillStyle = '#0c0e13'; ctx.fillRect(-96, 596 + j * 58, 100, 55); ctx.strokeStyle = '#333740'; ctx.strokeRect(-96, 596 + j * 58, 100, 55); for (const y of [609 + j * 58, 635 + j * 58]) { ctx.beginPath(); ctx.arc(-47, y, 17, 0, Math.PI * 2); ctx.fillStyle = '#16191f'; ctx.fill(); ctx.strokeStyle = '#3f424a'; ctx.stroke(); ctx.beginPath(); ctx.arc(-47, y, 6, 0, Math.PI * 2); ctx.fillStyle = '#08090c'; ctx.fill(); } }
      ctx.restore();
    }
  }

  function avatarPerformer(x, y, s, flip, avatarUrl, hue, initial) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s * (flip ? -1 : 1), s);
    ctx.fillStyle = '#07090d';
    ctx.strokeStyle = '#07090d';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-13, -84);
    ctx.quadraticCurveTo(-20, -40, -12, -7);
    ctx.lineTo(13, -7);
    ctx.quadraticCurveTo(20, -43, 12, -84);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(-7, -10);
    ctx.lineTo(-14, 49);
    ctx.moveTo(8, -10);
    ctx.lineTo(17, 49);
    ctx.stroke();
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-10, -72);
    ctx.lineTo(-29, -36);
    ctx.lineTo(-9, -26);
    ctx.moveTo(10, -72);
    ctx.lineTo(27, -43);
    ctx.lineTo(9, -31);
    ctx.stroke();
    ctx.restore();
    const headR = Math.max(8, 16 * s);
    const hx = x;
    const hy = y - 100 * s;
    ctx.save();
    ctx.fillStyle = '#07090d';
    ctx.beginPath();
    ctx.arc(hx, hy, headR + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawAvatarCircle(hx, hy, headR, avatarUrl, `hsl(${hue || 220},45%,35%)`, initial);
    ctx.strokeStyle = `hsl(${hue || 220},65%,55%)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(hx, hy, headR + 1, 0, Math.PI * 2);
    ctx.stroke();
  }

  function band() {
    ctx.strokeStyle = '#555861'; ctx.lineWidth = 3; for (const x of [735, 770, 835, 865]) { line(x, 574, x - 8, 624, '#4b4e56', 2); ctx.fillStyle = '#161920'; ctx.beginPath(); ctx.ellipse(x, 580, 23, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#62656b'; ctx.stroke(); }
    ctx.fillStyle = '#11141a'; ctx.beginPath(); ctx.arc(800, 594, 34, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#555861'; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = pal.a + '66'; ctx.beginPath(); ctx.arc(800, 594, 8, 0, Math.PI * 2); ctx.fill();
    const silverU = silverUser || { username: 'silver', displayName: 'silver', hue: 200 };
    const danilU = danilUser || { username: 'danil', displayName: 'danil', hue: 30 };
    const silverInitial = (silverU.displayName || silverU.username || 'S').charAt(0).toUpperCase();
    const danilInitial = (danilU.displayName || danilU.username || 'D').charAt(0).toUpperCase();
    avatarPerformer(620, 689, 1.0, false, silverU.avatar, silverU.hue, silverInitial);
    avatarPerformer(980, 689, 1.0, true, danilU.avatar, danilU.hue, danilInitial);
    ctx.fillStyle = '#0c0e13'; ctx.fillRect(1120, 625, 110, 18); for (let i = 0; i < 15; i++) ctx.fillStyle = i % 2 ? '#383b42' : '#b1b0aa', ctx.fillRect(1125 + i * 6.5, 628, 4, 7); line(1135, 643, 1125, 699, '#343840', 4); line(1215, 643, 1225, 699, '#343840', 4);
  }

  function beam(x, y, tx, ty, color, width, alpha) {
    const dx = tx - x, dy = ty - y, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const g = ctx.createLinearGradient(x, y, tx, ty); g.addColorStop(0, color + Math.round(alpha * 255).toString(16).padStart(2, '0')); g.addColorStop(.65, color + Math.round(alpha * .35 * 255).toString(16).padStart(2, '0')); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 4 * nx, y - 4 * ny); ctx.lineTo(tx - width * nx, ty - width * ny); ctx.lineTo(tx + width * nx, ty + width * ny); ctx.lineTo(x + 4 * nx, y + 4 * ny); ctx.closePath(); ctx.fill();
    line(x, y, tx, ty, color + '30', 1); ctx.restore();
  }

  function lights() {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 5; i++) { let x = 350 + i * 225; glow(x, 610, 180, i % 2 ? pal.b : pal.a, .055 * intensity); }
    ctx.restore();
    fixtures.forEach((x, i) => {
      let sweep = Math.sin(time * (.36 + (i % 3) * .04) + i * 1.37), targetX = 800 + sweep * (260 + (i % 4) * 90);
      let targetY = 620 + Math.sin(time * .51 + i) * 100;
      if (pointer.active) { targetX = targetX * .68 + pointer.x * .32; targetY = targetY * .75 + pointer.y * .25; }
      const color = mode === 'finale' ? (i % 3 === 0 ? pal.b : pal.a) : (i % 2 ? pal.a : pal.b);
      beam(x, 178, targetX, targetY, color, 45 + (i % 3) * 15, .17 * intensity);
      glow(x, 178, 33, color, .26 * intensity);
      ctx.save(); ctx.translate(x, 166); ctx.rotate((targetX - x) / 1500); ctx.fillStyle = '#11141a'; rr(-17, -11, 34, 24, 5); ctx.fill(); ctx.strokeStyle = '#4d5159'; ctx.stroke(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 14, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });
    for (let i = 0; i < 7; i++) { const x = 340 + i * 153, color = i % 2 ? pal.a : pal.b; beam(x, 708, x + Math.sin(time * .4 + i) * 160, 250, color, 35, .10 * intensity); glow(x, 704, 25, color, .3); }
    if (mode === 'finale') { ctx.save(); ctx.globalCompositeOperation = 'screen'; for (let i = 0; i < 11; i++) { let a = -2.82 + i * .12 + Math.sin(time * .5) * .08; let x = 800, y = 570; line(x, y, x + Math.cos(a) * 800, y + Math.sin(a) * 800, i % 2 ? pal.a + '75' : pal.b + '75', 1.2); } ctx.restore(); }
  }

  function strobes() {
    const positions = [310, 430, 1170, 1290];
    positions.forEach((x, i) => { ctx.fillStyle = '#14171c'; ctx.fillRect(x - 29, 190, 58, 24); ctx.strokeStyle = '#444850'; ctx.strokeRect(x - 29, 190, 58, 24); for (let j = 0; j < 6; j++) { let on = strobe && !paused && (Math.floor(time * 7 + i) % 7 === 0); ctx.fillStyle = on ? '#eefcff' : '#59616a'; ctx.fillRect(x - 24 + j * 9, 196, 6, 11); if (on) glow(x - 21 + j * 9, 201, 30, '#dffbff', .5); } });
    if (strobe && !paused && Math.floor(time * 7) % 11 === 0) { ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = `rgba(220,245,255,${.075 * intensity})`; ctx.fillRect(0, 0, W, 790); ctx.restore(); }
  }

  function haze() {
    ctx.save(); ctx.globalCompositeOperation = 'screen'; for (const p of dust) { let y = p.y + Math.sin(time * p.s + p.p) * 18, x = p.x + Math.cos(time * p.s * .7 + p.p) * 12; ctx.globalAlpha = (.08 + (p.r / 3) * .08) * intensity; ctx.fillStyle = p.p % 2 > 1 ? pal.a : '#e4e5f9'; ctx.beginPath(); ctx.arc(x, y, p.r, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); ctx.globalAlpha = 1;
    let hg = ctx.createLinearGradient(0, 350, 0, 790); hg.addColorStop(0, 'transparent'); hg.addColorStop(.7, '#a8d0e608'); hg.addColorStop(1, 'transparent'); ctx.fillStyle = hg; ctx.fillRect(170, 300, 1260, 490);
  }

  function seat(x, y, w, h, shade) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#05070a'; ctx.fillRect(-w * .43, h * .12, w * .86, h * .58);
    const g = ctx.createLinearGradient(0, -h * .65, 0, h * .45); g.addColorStop(0, shade); g.addColorStop(1, '#080d17'); ctx.fillStyle = g; rr(-w / 2, -h * .66, w, h * .92, w * .16); ctx.fill(); ctx.strokeStyle = '#34405188'; ctx.lineWidth = Math.max(1, w * .025); ctx.stroke();
    ctx.fillStyle = '#121b29'; rr(-w * .55, h * .08, w * 1.1, h * .32, w * .09); ctx.fill();
    ctx.fillStyle = '#090d14'; ctx.fillRect(-w * .65, -h * .05, w * .12, h * .48); ctx.fillRect(w * .53, -h * .05, w * .12, h * .48);
    line(-w * .36, -h * .48, w * .36, -h * .48, '#61718b35', 1); ctx.restore();
  }

  function seats() {
    let g = ctx.createLinearGradient(0, 790, 0, 1000); g.addColorStop(0, '#080a10'); g.addColorStop(1, '#10121a'); ctx.fillStyle = g; ctx.fillRect(0, 805, W, 195);
    ctx.fillStyle = '#151017'; ctx.beginPath(); ctx.moveTo(735, 805); ctx.lineTo(865, 805); ctx.lineTo(1010, 1000); ctx.lineTo(590, 1000); ctx.closePath(); ctx.fill();
    seatList.forEach((s, idx) => {
      seat(s.x, s.y, s.w, s.h, s.shade);
      const user = joined.find(u => u.seatIndex === idx);
      if (user) {
        const ax = s.x;
        const ay = s.y - s.h * 0.3;
        const ar = Math.min(s.w, s.h) * 0.34;
        drawAvatarCircle(ax, ay, ar, user.avatar, `hsl(${user.hue || 220},45%,30%)`, (user.displayName || user.username || '?').charAt(0).toUpperCase());
      }
    });
    for (let r = 0; r < 6; r++) {
      const y = 817 + r * 38;
      for (const side of [-1, 1]) { let x = 800 + side * (74 + r * 22); ctx.fillStyle = '#f6e86c'; ctx.globalAlpha = .45 + r * .05; ctx.fillRect(x - 5, y + 8, 10, 2); glow(x, y + 8, 14, '#f6e86c', .12); }
      ctx.globalAlpha = 1;
    }
  }

  function flag() {
    const track = PLAYLIST[currentTrack];
    if (!track || !track.flag) return;
    const px = 1320;
    const py1 = 700;
    const py2 = 540;
    line(px, py1, px, py2, '#3a3d45', 3);
    const wave = Math.sin(time * 3) * 4;
    const fx = px;
    const fy = py2;
    const fw = 70;
    const fh = 46;
    ctx.save();
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + fw, fy + wave);
    ctx.lineTo(fx + fw, fy + fh / 3 + wave);
    ctx.lineTo(fx, fy + fh / 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0039a6';
    ctx.beginPath();
    ctx.moveTo(fx, fy + fh / 3);
    ctx.lineTo(fx + fw, fy + fh / 3 + wave);
    ctx.lineTo(fx + fw, fy + 2 * fh / 3 + wave);
    ctx.lineTo(fx, fy + 2 * fh / 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d52b1e';
    ctx.beginPath();
    ctx.moveTo(fx, fy + 2 * fh / 3);
    ctx.lineTo(fx + fw, fy + 2 * fh / 3 + wave);
    ctx.lineTo(fx + fw, fy + fh + wave);
    ctx.lineTo(fx, fy + fh);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function foreground() {
    const v = ctx.createRadialGradient(800, 500, 300, 800, 500, 920); v.addColorStop(.5, 'transparent'); v.addColorStop(1, '#020308bb'); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#03040888'; ctx.fillRect(0, 975, W, 25);
  }

  function resize() {
    cw = canvas.clientWidth || innerWidth;
    ch = canvas.clientHeight || innerHeight;
    const small = Math.min(cw, ch) < 700;
    dpr = Math.min(devicePixelRatio || 1, small ? 1.5 : 2);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    scale = Math.max(cw / W, ch / H);
    if (ch > cw) scale = Math.max(cw / W, Math.min(ch / H, cw / 700));
    ox = (cw - W * scale) / 2;
    oy = (ch - H * scale) / 2;
  }
  resize();

  let beeList = [];
  function initBees() {
    beeList = Array.from({ length: 12 }, (_, i) => ({
      x: 200 + Math.random() * 1200,
      y: 300 + Math.random() * 300,
      vx: (Math.random() - 0.5) * 80,
      vy: (Math.random() - 0.5) * 60,
      phase: Math.random() * Math.PI * 2,
      wing: 0,
    }));
  }
  initBees();

  function bees() {
    const track = PLAYLIST[currentTrack];
    if (!track || !track.bees) return;
    beeList.forEach(b => {
      b.phase += 0.02;
      b.wing += 0.3;
      b.x += Math.sin(b.phase) * 2 + b.vx * 0.01;
      b.y += Math.cos(b.phase * 1.3) * 1.5 + b.vy * 0.01;
      b.vx += (Math.random() - 0.5) * 5;
      b.vy += (Math.random() - 0.5) * 5;
      b.vx = Math.max(-120, Math.min(120, b.vx));
      b.vy = Math.max(-90, Math.min(90, b.vy));
      if (b.x < 150) { b.x = 150; b.vx = Math.abs(b.vx); }
      if (b.x > 1450) { b.x = 1450; b.vx = -Math.abs(b.vx); }
      if (b.y < 250) { b.y = 250; b.vy = Math.abs(b.vy); }
      if (b.y > 700) { b.y = 700; b.vy = -Math.abs(b.vy); }
      ctx.save();
      ctx.translate(b.x, b.y);
      const ws = Math.abs(Math.sin(b.wing)) * 6 + 3;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.ellipse(-4, -2, ws, 4, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(4, -2, ws, 4, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f6e86c';
      ctx.fillRect(-5, -3, 3, 2);
      ctx.fillRect(2, -1, 3, 2);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(-2, -4, 2, 1);
      ctx.fillRect(0, -4, 2, 1);
      ctx.restore();
    });
  }

  function render(now) {
    const dt = Math.min((now - last) / 1000, .05);
    last = now;
    if (!paused) time += reduced ? 0 : dt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, cw, ch);
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    background(); curtains(); truss(); screen(); lights(); stage(); speakers(); band(); haze(); strobes(); seats(); flag(); bees(); foreground();
    animFrame = requestAnimationFrame(render);
  }

  let down = null, pressTimer = 0;
  function toScene(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = (e.clientX - rect.left - ox) / scale;
    pointer.y = (e.clientY - rect.top - oy) / scale;
    pointer.active = true;
  }
  function endPress(e) {
    clearTimeout(pressTimer);
    if (e && e.type === 'pointerup' && down && !down.moved && !down.long && performance.now() - down.t < 500) {
      const modes = ['sapphire', 'pulse', 'finale'];
      mode = modes[(modes.indexOf(mode) + 1) % modes.length];
      pal = palettes[mode];
    }
    down = null;
    if (!e || e.pointerType !== 'mouse') pointer.active = false;
  }
  canvas.addEventListener('pointerdown', e => {
    toScene(e);
    down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, long: false };
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => { if (down && !down.moved) { down.long = true; strobe = !strobe; } }, 650);
  });
  canvas.addEventListener('pointermove', e => {
    toScene(e);
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) down.moved = true;
  });
  canvas.addEventListener('pointerup', endPress);
  canvas.addEventListener('pointercancel', endPress);
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') pointer.active = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  function onResize() { resize(); }
  function onOrientation() { setTimeout(onResize, 150); }
  function onVisibility() { last = performance.now(); }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onOrientation);
  document.addEventListener('visibilitychange', onVisibility);

  function loadTrack(index) {
    const track = PLAYLIST[index];
    if (!track) return;
    const titleEl = view.querySelector('#disco-track-title');
    const artistEl = view.querySelector('#disco-track-artist');
    const warnEl = view.querySelector('#disco-flag-warn');
    titleEl.textContent = track.title;
    artistEl.textContent = track.artist;
    if (track.foreignAgent) warnEl.style.display = 'block';
    else warnEl.style.display = 'none';
    if (track.available === false) {
      audio.src = '';
      isPlaying = false;
      titleEl.textContent = track.title + ' (недоступно)';
      return;
    }
    const basePath = location.pathname.replace(/\/[^/]*$/, '/');
    audio.src = basePath + 'music/' + track.file;
    audio.load();
  }
  function playTrack() {
    if (!audio.src) return;
    audio.play().then(() => { isPlaying = true; }).catch(() => {});
  }
  audio.addEventListener('ended', () => {
    currentTrack = (currentTrack + 1) % PLAYLIST.length;
    loadTrack(currentTrack);
    playTrack();
  });
  audio.addEventListener('error', () => {
    currentTrack = (currentTrack + 1) % PLAYLIST.length;
    loadTrack(currentTrack);
    setTimeout(playTrack, 500);
  });

  view.querySelector('#disco-exit').onclick = () => {
    if (animFrame) cancelAnimationFrame(animFrame);
    audio.pause();
    audio.src = '';
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onOrientation);
    document.removeEventListener('visibilitychange', onVisibility);
    view.remove();
    document.body.style.overflow = '';
  };

  view.querySelector('#disco-join')?.addEventListener('click', async () => {
    const meUser = state.user;
    addJoined(meUser);
    refreshJoined();
    view.querySelector('#disco-join')?.remove();
    if (!isRewarded(meUser.id)) {
      try {
        await api.grantCoins(500, 'Дискотека Возращение СпокУм');
        try { await api.grantPremium(meUser.id, 2, 'Дискотека'); } catch {}
        markRewarded(meUser.id);
        toast('Вы присоединились! +500 монет и 2 дня премиума');
      } catch {
        toast('Вы присоединились к дискотеке');
      }
    } else {
      toast('Вы присоединились к дискотеке');
    }
  });

  view.querySelector("#disco-play").addEventListener("click", () => {
    if (isPlaying) {
      audio.pause();
      isPlaying = false;
      view.querySelector('#disco-play').textContent = 'PLAY';
    } else {
      playTrack();
      view.querySelector('#disco-play').textContent = 'PAUSE';
    }
  });
  view.querySelector("#disco-prev").addEventListener("click", () => {
    currentTrack = (currentTrack - 1 + PLAYLIST.length) % PLAYLIST.length;
    loadTrack(currentTrack);
    playTrack();
  });
  view.querySelector("#disco-next").addEventListener("click", () => {
    currentTrack = (currentTrack + 1) % PLAYLIST.length;
    loadTrack(currentTrack);
    playTrack();
  });

  loadTrack(currentTrack);
  animFrame = requestAnimationFrame(render);
  setTimeout(() => playTrack(), 500);
}
