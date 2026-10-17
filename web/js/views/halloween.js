import { state } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast } from '../ui.js';

/* ──────────────────────────────────────────────────────────────────────────
   Halloween Event — everyone.
   Vanilla JS, ES modules. Three canvas mini-games follow the same
   runner() pattern as js/games/index.js (setup object with
   { score(), bind(bind, canvas), update(dt, size), draw(ctx, size) }).
   ────────────────────────────────────────────────────────────────────────── */

const KEYS = {
  pumpkins: 'spokum.halloween.pumpkins',
  candies: 'spokum.halloween.candies',
  ghosts: 'spokum.halloween.ghosts',
  owned: 'spokum.halloween.owned',
  lastReward: 'spokum.halloween.lastReward',
  mood: 'spokum.halloween.mood',
  bestCatch: 'spokum.halloween.best.pumpkinCatch',
  bestHunt: 'spokum.halloween.best.ghostHunt',
  bestBrew: 'spokum.halloween.best.witchBrew'
};

// Apply pending admin grants for the current user (queued by admins in localStorage).
// Called when the Halloween view opens so granted rewards show up immediately.
function applyHalloweenPending() {
  try {
    const pending = JSON.parse(localStorage.getItem('spokum.halloween.pending') || '{}');
    const me = (window.__spokumState?.user) || null;
    const myId = me?.id || 'self';
    const myPending = pending[myId] || pending['self'];
    if (!myPending) return;
    if (myPending.reset) {
      ['pumpkins', 'candies', 'ghosts', 'owned', 'lastReward', 'mood'].forEach((k) =>
        localStorage.removeItem(KEYS[k])
      );
      delete pending[myId];
      delete pending['self'];
      localStorage.setItem('spokum.halloween.pending', JSON.stringify(pending));
      return;
    }
    let granted = [];
    ['pumpkins', 'candies', 'ghosts'].forEach((k) => {
      if (myPending[k]) {
        const cur = Number(localStorage.getItem(KEYS[k]) || 0);
        localStorage.setItem(KEYS[k], String(cur + myPending[k]));
        granted.push(`${myPending[k]} ${k === 'pumpkins' ? 'тыкв' : k === 'candies' ? 'конфет' : 'призраков'}`);
      }
    });
    if (Array.isArray(myPending.items) && myPending.items.length) {
      const owned = JSON.parse(localStorage.getItem(KEYS.owned) || '[]');
      myPending.items.forEach((id) => { if (!owned.includes(id)) owned.push(id); });
      localStorage.setItem(KEYS.owned, JSON.stringify(owned));
      granted.push(`${myPending.items.length} предмет(ов)`);
    }
    delete pending[myId];
    delete pending['self'];
    localStorage.setItem('spokum.halloween.pending', JSON.stringify(pending));
    if (granted.length) {
      // Defer toast so the UI is ready
      setTimeout(() => {
        try {
          import('../ui.js?v=20251020').then(({ toast }) =>
            toast('🎁 Админ выдал: ' + granted.join(', '), 'ok')
          );
        } catch {}
      }, 600);
    }
  } catch {}
}

const MOODS = [
  { id: 'spooky', label: 'Жуткий', color: '#9b59b6', emoji: 'ghost' },
  { id: 'mystic', label: 'Мистический', color: '#8e44ad', emoji: 'moon' },
  { id: 'enchanted', label: 'Заколдованный', color: '#6c5ce7', emoji: 'potion' },
  { id: 'midnight', label: 'Полночный', color: '#2c3e50', emoji: 'star' },
  { id: 'pumpkin', label: 'Тыквенный', color: '#e67e22', emoji: 'pumpkin' }
];

const SHOP = [
  { id: 'pumpkinHead', name: 'Тыквенная голова', desc: 'Рамка аватара', price: 50, icon: 'pumpkin' },
  { id: 'ghostGlow', name: 'Призрачное свечение', desc: 'Свечение профиля', price: 80, icon: 'ghost' },
  { id: 'catEyes', name: 'Кошачьи глаза', desc: 'Иконка статуса', price: 30, icon: 'cat' },
  { id: 'witchBroom', name: 'Ведьмина метла', desc: 'Подарок', price: 100, icon: 'broom' }
];

/* ── tiny localStorage helpers ─────────────────────────────────────────── */

function readNum(key) {
  const raw = localStorage.getItem(key);
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function writeNum(key, n) {
  localStorage.setItem(key, String(Math.max(0, Math.floor(n))));
}
function readArr(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function writeArr(key, arr) {
  localStorage.setItem(key, JSON.stringify(arr));
}

function addCandies(n) { const v = readNum(KEYS.candies) + n; writeNum(KEYS.candies, v); return v; }
function addPumpkins(n) { const v = readNum(KEYS.pumpkins) + n; writeNum(KEYS.pumpkins, v); return v; }
function addGhosts(n) { const v = readNum(KEYS.ghosts) + n; writeNum(KEYS.ghosts, v); return v; }

function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function msToMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
  return next - now;
}
function fmtHMS(ms) {
  ms = Math.max(0, ms);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* ── canvas runner (mirrors js/games/index.js runner() pattern) ─────────── */

function fitCanvas(canvas) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

function runner(canvas, setup) {
  let frame = 0;
  let stopped = false;
  let paused = false;
  let size = fitCanvas(canvas);
  let game = setup(size);
  const cleanups = [];

  const onResize = () => {
    size = fitCanvas(canvas);
    game.resize?.(size);
  };
  window.addEventListener('resize', onResize);
  cleanups.push(() => window.removeEventListener('resize', onResize));

  const bind = (type, handler, target = canvas) => {
    target.addEventListener(type, handler, { passive: false });
    cleanups.push(() => target.removeEventListener(type, handler));
  };
  game.bind?.(bind, canvas);

  const swallow = (event) => event.preventDefault();
  for (const type of ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'contextmenu']) {
    bind(type, swallow);
  }

  const onHide = () => { if (document.hidden) paused = true; };
  const onBlur = () => { paused = true; };
  const resume = () => { if (!paused) return; paused = false; last = performance.now(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('blur', onBlur);
  bind('pointerdown', resume);
  cleanups.push(() => document.removeEventListener('visibilitychange', onHide));
  cleanups.push(() => window.removeEventListener('blur', onBlur));

  let last = performance.now();
  const tick = (now) => {
    if (stopped) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) game.update(dt, size);
    game.draw(size.ctx, size);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return {
    score: () => (game.score ? game.score() : 0),
    stop: () => {
      stopped = true;
      cancelAnimationFrame(frame);
      cleanups.forEach((fn) => fn());
      game.destroy?.();
    }
  };
}

/* ── game 1: Pumpkin Catch ─────────────────────────────────────────────── */

function pumpkinCatch(canvas, report) {
  return runner(canvas, ({ w, h }) => {
    let width = w, height = h;
    let s = null;
    let target = 0.5;
    const stars = Array.from({ length: 36 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 1.4 + 0.3 }));
    const reset = () => {
      s = { x: 0.5, score: 0, miss: 0, items: [], spawn: 0.6, dist: 0, over: false, sparks: [], shake: 0 };
    };
    reset();

    return {
      score: () => s.score,
      resize(size) { width = size.w; height = size.h; },
      bind(bind, cv) {
        const move = (e) => {
          const r = cv.getBoundingClientRect();
          const p = e.touches?.[0] || e;
          target = Math.max(0.06, Math.min(0.94, (p.clientX - r.left) / r.width));
        };
        bind('pointermove', move);
        bind('touchmove', (e) => { e.preventDefault(); move(e); });
        bind('touchstart', (e) => { e.preventDefault(); if (s.over) reset(); else move(e); });
        bind('pointerdown', (e) => { e.preventDefault(); if (s.over) reset(); else move(e); });
      },
      update(dt) {
        if (s.over) return;
        s.dist += dt;
        s.x += (target - s.x) * Math.min(1, dt * 9);
        s.spawn -= dt;
        if (s.spawn <= 0) {
          s.spawn = Math.max(0.34, 0.85 - s.dist * 0.004);
          s.items.push({ x: 0.08 + Math.random() * 0.84, y: -0.05, v: 0.42 + Math.random() * 0.28 + s.dist * 0.004, r: 0.04, rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 3 });
        }
        for (const it of s.items) { it.y += it.v * dt; it.rot += it.spin * dt; }
        s.items = s.items.filter((it) => {
          if (it.y > 1.12) {
            s.miss++;
            s.shake = 0.4;
            if (s.miss >= 3) { s.over = true; report(s.score); }
            return false;
          }
          const dx = it.x - s.x;
          const dy = it.y - 0.86;
          if (Math.hypot(dx, dy) < it.r + 0.05) {
            s.score++;
            for (let i = 0; i < 10; i++) s.sparks.push({ x: it.x * width, y: 0.86 * height, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 180, life: 0.5, color: '#ffae42' });
            return false;
          }
          return true;
        });
        s.sparks = s.sparks.filter((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 380 * dt; p.life -= dt; return p.life > 0; });
        if (s.shake > 0) s.shake = Math.max(0, s.shake - dt);
      },
      draw(ctx, size) {
        const cw = size.w, ch = size.h;
        const grad = ctx.createLinearGradient(0, 0, 0, ch);
        grad.addColorStop(0, '#1a0a00');
        grad.addColorStop(1, '#0d0508');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, cw, ch);

        // stars
        ctx.fillStyle = 'rgba(255,200,140,.45)';
        for (const st of stars) ctx.fillRect(st.x * cw, (st.y * ch) % ch, st.s, st.s);

        // moon
        ctx.fillStyle = 'rgba(255,180,90,.18)';
        ctx.beginPath(); ctx.arc(cw - 36, 40, 26, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffcf80';
        ctx.beginPath(); ctx.arc(cw - 36, 40, 18, 0, Math.PI * 2); ctx.fill();

        const shakeX = s.shake ? (Math.random() - 0.5) * s.shake * 14 : 0;
        ctx.save();
        ctx.translate(shakeX, 0);

        // falling pumpkins
        for (const it of s.items) {
          const px = it.x * cw, py = it.y * ch, r = it.r * cw;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(it.rot);
          ctx.fillStyle = '#e67e22';
          ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.86, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#c0651b';
          ctx.beginPath(); ctx.ellipse(-r * 0.4, 0, r * 0.35, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(r * 0.4, 0, r * 0.35, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#2c7a3c';
          ctx.fillRect(-1.5, -r * 0.95, 3, r * 0.4);
          // glowing eyes/mouth
          ctx.fillStyle = '#fff3a0';
          ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.1, r * 0.12, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.1, r * 0.12, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath();
          ctx.moveTo(-r * 0.4, r * 0.3);
          ctx.lineTo(-r * 0.15, r * 0.15);
          ctx.lineTo(0, r * 0.3);
          ctx.lineTo(r * 0.15, r * 0.15);
          ctx.lineTo(r * 0.4, r * 0.3);
          ctx.closePath(); ctx.fill();
          ctx.restore();
        }

        // sparks
        for (const p of s.sparks) {
          ctx.globalAlpha = Math.max(0, p.life * 2);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x, p.y, 3, 3);
        }
        ctx.globalAlpha = 1;

        // basket
        const bx = s.x * cw, by = 0.86 * ch;
        ctx.fillStyle = '#8b5a2b';
        ctx.beginPath();
        ctx.moveTo(bx - 28, by - 6);
        ctx.lineTo(bx + 28, by - 6);
        ctx.lineTo(bx + 22, by + 18);
        ctx.lineTo(bx - 22, by + 18);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#5a3a1a';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,.3)';
        ctx.beginPath(); ctx.moveTo(bx - 24, by + 2); ctx.lineTo(bx + 24, by + 2); ctx.stroke();

        ctx.restore();

        // HUD
        ctx.fillStyle = 'rgba(255,200,120,.92)';
        ctx.font = '600 15px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`Тыковок: ${s.score}`, 14, 26);
        ctx.fillStyle = s.miss >= 2 ? '#ff6060' : 'rgba(255,200,120,.7)';
        ctx.fillText(`Промахи: ${s.miss}/3`, 14, 48);

        // lives hearts
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = i < (3 - s.miss) ? '#ff6b3d' : 'rgba(255,107,61,.25)';
          ctx.beginPath();
          const hx = cw - 18 - i * 22, hy = 24;
          ctx.arc(hx - 4, hy, 5, 0, Math.PI * 2);
          ctx.arc(hx + 4, hy, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(hx - 8, hy + 2); ctx.lineTo(hx + 8, hy + 2); ctx.lineTo(hx, hy + 12); ctx.closePath();
          ctx.fill();
        }
        ctx.textAlign = 'start';

        if (s.over) {
          ctx.fillStyle = 'rgba(5,3,8,.82)';
          ctx.fillRect(0, 0, cw, ch);
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ffae42';
          ctx.font = '700 24px Inter, system-ui, sans-serif';
          ctx.fillText('Тыковок поймано: ' + s.score, cw / 2, ch / 2 - 6);
          ctx.fillStyle = 'rgba(255,210,160,.7)';
          ctx.font = '500 13px Inter, system-ui, sans-serif';
          ctx.fillText('Награда: ' + s.score + ' конфет', cw / 2, ch / 2 + 18);
          ctx.fillText('Тапни, чтобы играть снова', cw / 2, ch / 2 + 40);
          ctx.textAlign = 'start';
        }
      }
    };
  });
}

/* ── game 2: Ghost Hunt ────────────────────────────────────────────────── */

function ghostHunt(canvas, report) {
  return runner(canvas, ({ w, h }) => {
    let width = w, height = h;
    let s = null;
    const stars = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 1.3 + 0.3, b: Math.random() }));
    const reset = () => {
      s = { ghosts: [], score: 0, time: 60, spawn: 0.5, over: false, sparkles: [] };
    };
    reset();

    const COLORS = ['#a0e8ff', '#c9b6ff', '#ffd6a0', '#b6ffd6'];

    return {
      score: () => s.score,
      resize(size) { width = size.w; height = size.h; },
      bind(bind, cv) {
        bind('pointerdown', (e) => {
          e.preventDefault();
          if (s.over) { reset(); return; }
          const r = cv.getBoundingClientRect();
          const p = e.touches?.[0] || e;
          const x = (p.clientX - r.left) / r.width;
          const y = (p.clientY - r.top) / r.height;
          let hit = false;
          s.ghosts = s.ghosts.filter((g) => {
            if (Math.hypot(g.x - x, g.y - y) < g.r + 0.06 && !hit) {
              hit = true;
              s.score++;
              for (let i = 0; i < 14; i++) s.sparkles.push({ x: g.x * width, y: g.y * height, vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.5) * 220, life: 0.5, color: g.color });
              return false;
            }
            return true;
          });
          if (!hit) {
            // miss puff
            for (let i = 0; i < 6; i++) s.sparkles.push({ x: x * width, y: y * height, vx: (Math.random() - 0.5) * 100, vy: (Math.random() - 0.5) * 100, life: 0.3, color: 'rgba(180,180,200,.6)' });
          }
        });
        bind('touchstart', (e) => { e.preventDefault(); });
      },
      update(dt) {
        if (s.over) return;
        s.time -= dt;
        if (s.time <= 0) { s.time = 0; s.over = true; report(s.score); return; }
        s.spawn -= dt;
        if (s.spawn <= 0) {
          s.spawn = Math.max(0.42, 1.1 - (60 - s.time) * 0.012);
          s.ghosts.push({
            x: 0.12 + Math.random() * 0.76,
            y: 0.14 + Math.random() * 0.66,
            r: 0.05 + Math.random() * 0.02,
            life: 2,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            wobble: Math.random() * Math.PI * 2
          });
        }
        for (const g of s.ghosts) { g.life -= dt; g.wobble += dt * 3; g.y += Math.sin(g.wobble) * 0.04 * dt; }
        s.ghosts = s.ghosts.filter((g) => g.life > 0);
        s.sparkles = s.sparkles.filter((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; p.life -= dt; return p.life > 0; });
      },
      draw(ctx, size) {
        const cw = size.w, ch = size.h;
        const grad = ctx.createRadialGradient(cw / 2, ch / 2, 30, cw / 2, ch / 2, ch);
        grad.addColorStop(0, '#1a0a1f');
        grad.addColorStop(1, '#0a050d');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, cw, ch);

        // twinkling stars
        const t = performance.now() / 1000;
        for (const st of stars) {
          const a = 0.3 + Math.sin(t * 2 + st.b * 6) * 0.3;
          ctx.fillStyle = `rgba(220,200,255,${a})`;
          ctx.fillRect(st.x * cw, st.y * ch, st.s, st.s);
        }

        // ghosts
        for (const g of s.ghosts) {
          const gx = g.x * cw, gy = g.y * ch, r = g.r * cw;
          const alpha = Math.min(1, g.life) * (g.life < 0.5 ? g.life * 2 : 1);
          ctx.globalAlpha = alpha;
          // glow
          ctx.fillStyle = g.color + '33';
          ctx.beginPath(); ctx.arc(gx, gy, r * 1.6, 0, Math.PI * 2); ctx.fill();
          // body
          ctx.fillStyle = g.color;
          ctx.beginPath();
          ctx.arc(gx, gy - r * 0.3, r, Math.PI, 0);
          ctx.lineTo(gx + r, gy + r * 0.6);
          for (let i = 0; i < 3; i++) {
            ctx.quadraticCurveTo(gx + r - (i + 0.5) * (r / 1.5), gy + r * 0.9, gx + r - (i + 1) * (r / 1.5), gy + r * 0.6);
          }
          ctx.closePath();
          ctx.fill();
          // eyes
          ctx.fillStyle = '#1a0a1f';
          ctx.beginPath(); ctx.arc(gx - r * 0.3, gy - r * 0.3, r * 0.13, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(gx + r * 0.3, gy - r * 0.3, r * 0.13, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }

        // sparkles
        for (const p of s.sparkles) {
          ctx.globalAlpha = Math.max(0, p.life * 2);
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;

        // HUD
        ctx.fillStyle = 'rgba(220,200,255,.92)';
        ctx.font = '600 15px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`Призраков: ${s.score}`, 14, 26);

        // timer bar
        const barW = cw - 28;
        ctx.fillStyle = 'rgba(255,255,255,.12)';
        ctx.fillRect(14, 38, barW, 6);
        const tcol = s.time < 10 ? '#ff6060' : '#c9b6ff';
        ctx.fillStyle = tcol;
        ctx.fillRect(14, 38, barW * (s.time / 60), 6);

        ctx.fillStyle = tcol;
        ctx.font = '700 14px Inter, system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(Math.ceil(s.time) + ' сек', cw - 14, 26);
        ctx.textAlign = 'start';

        if (s.over) {
          ctx.fillStyle = 'rgba(5,3,8,.82)';
          ctx.fillRect(0, 0, cw, ch);
          ctx.textAlign = 'center';
          ctx.fillStyle = '#c9b6ff';
          ctx.font = '700 24px Inter, system-ui, sans-serif';
          ctx.fillText('Поймано: ' + s.score, cw / 2, ch / 2 - 6);
          ctx.fillStyle = 'rgba(220,200,255,.7)';
          ctx.font = '500 13px Inter, system-ui, sans-serif';
          ctx.fillText('Награда: ' + s.score + ' конфет', cw / 2, ch / 2 + 18);
          ctx.fillText('Тапни, чтобы играть снова', cw / 2, ch / 2 + 40);
          ctx.textAlign = 'start';
        }
      }
    };
  });
}

/* ── game 3: Witch's Brew (memory sequence) ────────────────────────────── */

function witchBrew(canvas, report) {
  const POTS = [
    { color: '#e8a030', name: 'янтарный' },
    { color: '#c95030', name: 'кровавый' },
    { color: '#5a8ae8', name: 'лазурный' },
    { color: '#50d878', name: 'ядовитый' }
  ];
  return runner(canvas, ({ w, h }) => {
    let width = w, height = h;
    let s = null;
    const reset = () => {
      s = { seq: [], input: [], round: 0, playing: false, showing: false, showIdx: -1, showT: 0, flash: -1, flashT: 0, over: false, won: 0, bubble: [] };
      nextRound();
    };
    const nextRound = () => {
      s.round++;
      s.seq.push(Math.floor(Math.random() * POTS.length));
      s.input = [];
      s.showing = true;
      s.showIdx = -1;
      s.showT = 0.4;
    };
    reset();

    return {
      score: () => s.round - 1,
      resize(size) { width = size.w; height = size.h; },
      bind(bind, cv) {
        bind('pointerdown', (e) => {
          e.preventDefault();
          if (s.over) { reset(); return; }
          if (s.showing || s.flash >= 0) return;
          const r = cv.getBoundingClientRect();
          const p = e.touches?.[0] || e;
          const x = (p.clientX - r.left) / r.width;
          const y = (p.clientY - r.top) / r.height;
          // 2x2 grid of cauldrons
          const col = x < 0.5 ? 0 : 1;
          const row = y < 0.55 ? 0 : 1;
          // only count if inside grid area
          if (y < 0.42 || y > 0.92) return;
          const idx = row * 2 + col;
          s.flash = idx;
          s.flashT = 0.35;
          const expected = s.seq[s.input.length];
          s.input.push(idx);
          for (let i = 0; i < 8; i++) s.bubble.push({ x: (col * 0.5 + 0.25) * width, y: (row * 0.5 * 0.5 + 0.65) * height, vx: (Math.random() - 0.5) * 80, vy: -Math.random() * 120 - 40, life: 0.6, color: POTS[idx].color });
          if (idx !== expected) {
            s.over = true;
            report(s.round - 1);
          } else if (s.input.length === s.seq.length) {
            s.won = s.round;
            setTimeout(() => { if (!s.over) nextRound(); }, 700);
          }
        });
        bind('touchstart', (e) => e.preventDefault());
      },
      update(dt) {
        if (s.over) return;
        if (s.showing) {
          s.showT -= dt;
          if (s.showT <= 0) {
            s.showIdx++;
            if (s.showIdx >= s.seq.length) {
              s.showing = false;
              s.showIdx = -1;
            } else {
              s.showT = 0.55;
              s.flash = s.seq[s.showIdx];
              s.flashT = 0.4;
            }
          }
        }
        if (s.flashT > 0) {
          s.flashT -= dt;
          if (s.flashT <= 0) s.flash = -1;
        }
        for (const b of s.bubble) { b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 60 * dt; b.life -= dt; }
        s.bubble = s.bubble.filter((b) => b.life > 0);
      },
      draw(ctx, size) {
        const cw = size.w, ch = size.h;
        const grad = ctx.createLinearGradient(0, 0, 0, ch);
        grad.addColorStop(0, '#160a1a');
        grad.addColorStop(1, '#080410');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, cw, ch);

        // title area
        ctx.fillStyle = 'rgba(220,180,255,.85)';
        ctx.font = '700 16px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(s.showing ? 'Запомни порядок…' : 'Повтори зелье', cw / 2, 32);
        ctx.font = '500 12px Inter, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(220,180,255,.55)';
        ctx.fillText(`Раунд ${s.round}`, cw / 2, 52);

        // 2x2 grid of cauldrons (top: 0.42 - 0.92)
        const cellW = cw / 2;
        const cellH = (ch * 0.5) / 2;
        for (let i = 0; i < 4; i++) {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const cx = col * cellW + cellW / 2;
          const cy = ch * 0.42 + row * cellH + cellH / 2;
          const lit = s.flash === i;
          const r = Math.min(cellW, cellH) * 0.32;
          // glow
          if (lit) {
            ctx.fillStyle = POTS[i].color + '44';
            ctx.beginPath(); ctx.arc(cx, cy, r * 1.8, 0, Math.PI * 2); ctx.fill();
          }
          // cauldron body
          ctx.fillStyle = '#1a1020';
          ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.4, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
          // brew liquid
          ctx.fillStyle = lit ? POTS[i].color : POTS[i].color + '88';
          ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.85, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
          // rim
          ctx.strokeStyle = lit ? '#fff' : 'rgba(255,255,255,.3)';
          ctx.lineWidth = lit ? 3 : 1.5;
          ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.85, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
          // legs
          ctx.fillStyle = '#1a1020';
          ctx.fillRect(cx - r * 0.6, cy + r * 0.6, 4, r * 0.4);
          ctx.fillRect(cx + r * 0.6 - 4, cy + r * 0.6, 4, r * 0.4);
        }

        // bubbles
        for (const b of s.bubble) {
          ctx.globalAlpha = Math.max(0, b.life);
          ctx.fillStyle = b.color;
          ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;

        // sequence progress dots
        if (!s.showing && s.seq.length) {
          const total = s.seq.length;
          const done = s.input.length;
          const dotR = 4;
          const gap = 12;
          const startX = cw / 2 - (total - 1) * gap / 2;
          for (let i = 0; i < total; i++) {
            ctx.fillStyle = i < done ? POTS[s.seq[i]].color : 'rgba(255,255,255,.2)';
            ctx.beginPath(); ctx.arc(startX + i * gap, ch - 18, dotR, 0, Math.PI * 2); ctx.fill();
          }
        }

        ctx.textAlign = 'start';
        if (s.over) {
          ctx.fillStyle = 'rgba(5,3,8,.82)';
          ctx.fillRect(0, 0, cw, ch);
          ctx.textAlign = 'center';
          ctx.fillStyle = '#c9b6ff';
          ctx.font = '700 24px Inter, system-ui, sans-serif';
          ctx.fillText('Зелье взорвалось!', cw / 2, ch / 2 - 6);
          ctx.fillStyle = 'rgba(220,200,255,.7)';
          ctx.font = '500 13px Inter, system-ui, sans-serif';
          ctx.fillText(`Дойдено раундов: ${s.round - 1}`, cw / 2, ch / 2 + 18);
          ctx.fillText('Награда: ' + ((s.round - 1) * 5) + ' конфет', cw / 2, ch / 2 + 40);
          ctx.fillText('Тапни, чтобы играть снова', cw / 2, ch / 2 + 62);
          ctx.textAlign = 'start';
        }
      }
    };
  });
}

/* ── floating spooky decorations ───────────────────────────────────────── */

function spawnFloatingDecor(host) {
  const decor = el(`<div class="hw-decor" aria-hidden="true"></div>`);
  const items = [
    { icon: 'ghost', left: 8, dur: 14, delay: 0, size: 26, opacity: 0.18 },
    { icon: 'pumpkin', left: 78, dur: 18, delay: 3, size: 30, opacity: 0.16 },
    { icon: 'ghost', left: 42, dur: 22, delay: 6, size: 22, opacity: 0.14 },
    { icon: 'pumpkin', left: 22, dur: 16, delay: 9, size: 24, opacity: 0.16 },
    { icon: 'web', left: 92, dur: 25, delay: 2, size: 28, opacity: 0.12 },
    { icon: 'cat', left: 60, dur: 20, delay: 7, size: 22, opacity: 0.13 }
  ];
  for (const it of items) {
    const node = el(`<span class="hw-float" style="left:${it.left}%;animation-duration:${it.dur}s;animation-delay:${it.delay}s;opacity:${it.opacity};color:#ffae42;width:${it.size}px;height:${it.size}px">${icon(it.icon, it.size)}</span>`);
    decor.appendChild(node);
  }
  host.appendChild(decor);
}

/* ── confetti burst on claim ────────────────────────────────────────────── */

function confettiBurst(host) {
  const layer = el(`<div class="hw-confetti-layer" aria-hidden="true"></div>`);
  const colors = ['#ffae42', '#ff6b3d', '#c9b6ff', '#50d878', '#ffd6a0', '#e8a030'];
  for (let i = 0; i < 36; i++) {
    const piece = el(`<span class="hw-confetti" style="left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * 0.3}s;animation-duration:${1 + Math.random() * 1.2}s;transform:rotate(${Math.random() * 360}deg)"></span>`);
    layer.appendChild(piece);
  }
  host.appendChild(layer);
  setTimeout(() => layer.remove(), 2600);
}

/* ── main view ──────────────────────────────────────────────────────────── */

function paintStats(view) {
  const box = view.querySelector('[data-stats]');
  if (!box) return;
  const stats = [
    { icon: 'pumpkin', label: 'Тыковок', value: readNum(KEYS.pumpkins), color: '#ffae42' },
    { icon: 'candy', label: 'Конфет', value: readNum(KEYS.candies), color: '#ff6b3d' },
    { icon: 'ghost', label: 'Призраков', value: readNum(KEYS.ghosts), color: '#c9b6ff' }
  ];
  box.innerHTML = stats.map((st) => `
    <div class="hw-stat">
      <div class="hw-stat-icon" style="color:${st.color}">${icon(st.icon, 22)}</div>
      <div class="hw-stat-num" data-num style="color:${st.color}">${st.value}</div>
      <div class="hw-stat-label">${esc(st.label)}</div>
    </div>`).join('');
  // animated count-up
  box.querySelectorAll('[data-num]').forEach((node, i) => {
    const target = stats[i].value;
    if (target <= 0) return;
    let cur = 0;
    const steps = 24;
    const step = target / steps;
    let n = 0;
    const tick = () => {
      n++;
      cur = Math.min(target, Math.round(step * n));
      node.textContent = cur;
      if (n < steps) requestAnimationFrame(tick);
      else node.textContent = target;
    };
    requestAnimationFrame(tick);
  });
}

function paintReward(view) {
  const btn = view.querySelector('[data-claim]');
  const count = view.querySelector('[data-reward-countdown]');
  if (!btn || !count) return;
  const last = Number(localStorage.getItem(KEYS.lastReward) || 0);
  const today = dayKey();
  const claimed = last && dayKey(last) === today;
  if (claimed) {
    btn.disabled = true;
    btn.classList.add('hw-claimed');
    btn.innerHTML = `${icon('check', 22)} Награда получена`;
  } else {
    btn.disabled = false;
    btn.classList.remove('hw-claimed');
    btn.innerHTML = `${icon('pumpkin', 26)} Получить награду`;
  }
  // countdown to next midnight
  const update = () => {
    if (!view.isConnected) return;
    count.textContent = 'Следующая через ' + fmtHMS(msToMidnight());
  };
  update();
  if (!view._rewardTimer) {
    view._rewardTimer = setInterval(update, 1000);
  }
}

function paintLeaderboard(view) {
  const box = view.querySelector('[data-leaderboard]');
  if (!box) return;
  const rows = [
    { name: 'Тыквенный улов', key: KEYS.bestCatch, icon: 'pumpkin' },
    { name: 'Охота на призраков', key: KEYS.bestHunt, icon: 'ghost' },
    { name: 'Ведьмино зелье', key: KEYS.bestBrew, icon: 'potion' }
  ];
  box.innerHTML = rows.map((r) => {
    const best = readNum(r.key);
    return `<div class="hw-leader-row">
      <span class="hw-leader-icon">${icon(r.icon, 22)}</span>
      <span class="grow">
        <div class="strong small">${esc(r.name)}</div>
        <div class="tiny muted">Твой рекорд: <b style="color:#ffae42">${best}</b></div>
      </span>
    </div>`;
  }).join('');
}

function paintMood(view) {
  const box = view.querySelector('[data-mood-host]');
  if (!box) return;
  const current = localStorage.getItem(KEYS.mood) || '';
  const today = dayKey();
  const moodDayKey = `spokum.halloween.moodDay.${today}`;
  const moodOfToday = localStorage.getItem(moodDayKey);
  let todayMood = MOODS.find((m) => m.id === moodOfToday) || null;

  box.innerHTML = `
    <div class="hw-mood-today">
      ${todayMood ? `
        <div class="hw-mood-orb" style="background:radial-gradient(circle at 35% 30%, ${todayMood.color}, ${todayMood.color}33);box-shadow:0 0 30px ${todayMood.color}aa">
          ${icon(todayMood.emoji, 34)}
        </div>
        <div>
          <div class="tiny muted">Настроение сегодня</div>
          <div class="strong hw-spooky" style="font-size:18px">${esc(todayMood.label)}</div>
        </div>` : `
        <div class="hw-mood-orb hw-mood-empty">${icon('moon', 34)}</div>
        <div>
          <div class="tiny muted">Настроение сегодня</div>
          <div class="strong" style="font-size:16px">Выбери ниже</div>
        </div>`}
    </div>
    <div class="hw-mood-grid">
      ${MOODS.map((m) => `
        <button class="hw-mood-pick${m.id === current ? ' on' : ''}" data-mood-pick="${m.id}" style="--mc:${m.color}">
          <span class="hw-mood-pick-icon">${icon(m.emoji, 24)}</span>
          <span class="hw-mood-pick-label">${esc(m.label)}</span>
        </button>`).join('')}
    </div>`;

  box.querySelectorAll('[data-mood-pick]').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.moodPick;
      localStorage.setItem(KEYS.mood, id);
      localStorage.setItem(moodDayKey, id);
      toast('Настроение: ' + (MOODS.find((m) => m.id === id)?.label || ''));
      paintMood(view);
    };
  });
}

function paintShop(view) {
  const box = view.querySelector('[data-shop]');
  if (!box) return;
  const owned = readArr(KEYS.owned);
  const candies = readNum(KEYS.candies);
  box.innerHTML = SHOP.map((item) => {
    const has = owned.includes(item.id);
    const can = candies >= item.price;
    return `<div class="hw-shop-item${has ? ' owned' : ''}">
      <div class="hw-shop-icon">${icon(item.icon, 28)}</div>
      <div class="grow">
        <div class="strong small">${esc(item.name)}</div>
        <div class="tiny muted">${esc(item.desc)}</div>
        <div class="hw-price">
          ${icon('candy', 14)} <b>${item.price}</b>
        </div>
      </div>
      ${has
        ? `<button class="btn btn-sm hw-owned-btn" disabled>${icon('check', 16)} Куплено</button>`
        : `<button class="btn btn-sm hw-buy-btn" data-buy="${item.id}" ${can ? '' : 'disabled'}>${can ? 'Купить' : 'Мало конфет'}</button>`}
    </div>`;
  }).join('');

  box.querySelectorAll('[data-buy]').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.buy;
      const item = SHOP.find((x) => x.id === id);
      if (!item) return;
      const owned = readArr(KEYS.owned);
      if (owned.includes(id)) return;
      const candies = readNum(KEYS.candies);
      if (candies < item.price) {
        toast('Не хватает конфет', 'err');
        return;
      }
      writeNum(KEYS.candies, candies - item.price);
      owned.push(id);
      writeArr(KEYS.owned, owned);
      toast('Куплено: ' + item.name);
      confettiBurst(view);
      paintShop(view);
      paintStats(view);
      paintReward(view);
    };
  });
}

function paintGames(view) {
  const box = view.querySelector('[data-games]');
  if (!box) return;
  const games = [
    {
      id: 'catch', title: 'Тыквенный улов', desc: 'Лови падающие тыквы корзиной', icon: 'pumpkin',
      bestKey: KEYS.bestCatch, mount: pumpkinCatch, reward: (s) => s
    },
    {
      id: 'hunt', title: 'Охота на призраков', desc: 'Лови призраков за 60 секунд', icon: 'ghost',
      bestKey: KEYS.bestHunt, mount: ghostHunt, reward: (s) => s
    },
    {
      id: 'brew', title: 'Ведьмино зелье', desc: 'Запомни последовательность цветов', icon: 'potion',
      bestKey: KEYS.bestBrew, mount: witchBrew, reward: (s) => s * 5
    }
  ];
  box.innerHTML = games.map((g) => {
    const best = readNum(g.bestKey);
    return `<div class="hw-game-card">
      <div class="hw-game-head">
        <span class="hw-game-icon">${icon(g.icon, 26)}</span>
        <div class="grow">
          <div class="strong small">${esc(g.title)}</div>
          <div class="tiny muted">${esc(g.desc)}</div>
        </div>
      </div>
      <canvas class="hw-canvas" width="300" height="400"></canvas>
      <div class="hw-game-foot">
        <span class="hw-game-best">Рекорд: <b>${best}</b></span>
        <button class="btn btn-primary hw-play-btn" data-play="${g.id}">${icon('play', 16)} Играть</button>
      </div>
    </div>`;
  }).join('');

  box.querySelectorAll('[data-play]').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.play;
      const g = games.find((x) => x.id === id);
      if (!g) return;
      const card = btn.closest('.hw-game-card');
      const canvas = card.querySelector('canvas');
      const bestBox = card.querySelector('.hw-game-best b');
      let best = readNum(g.bestKey);
      let handle = null;
      let granted = -1; // last score we already paid out, to avoid double-granting

      // inline play: mount directly on the embedded canvas
      btn.disabled = true;
      btn.innerHTML = `${icon('pause', 16)} В игре`;
      card.classList.add('playing');

      const report = (score, force) => {
        if (score > best) {
          best = score;
          writeNum(g.bestKey, score);
          if (bestBox) bestBox.textContent = best;
          toast('Новый рекорд: ' + best);
        }
        // only pay once per score value (game-over reports, then stop may re-report)
        if (score <= 0 || score === granted) return;
        granted = score;
        const r = g.reward(score);
        if (r > 0) {
          addCandies(r);
          if (g.id === 'catch') addPumpkins(score);
          if (g.id === 'hunt') addGhosts(score);
          toast(`+${r} конфет`);
        }
        if (force) { /* reserved for future use */ }
      };

      // stop any existing handle (shouldn't happen — card is re-rendered on stop)
      if (handle) handle.stop();
      // canvas size is handled by fitCanvas() inside runner() — it reads
      // the CSS dimensions (width:100%; height:400px from .hw-canvas)
      handle = g.mount(canvas, report);

      // change button to stop
      btn.innerHTML = `${icon('close', 16)} Завершить`;
      btn.disabled = false;
      btn.onclick = () => {
        const sc = handle ? handle.score() : 0;
        handle?.stop();
        handle = null;
        // pay out the current score if the game didn't already (e.g. user stopped mid-game)
        if (sc > 0) report(sc);
        // re-render game card (reset)
        paintGames(view);
        paintStats(view);
        paintLeaderboard(view);
      };
    };
  });
}

/* ── locked screen for not-logged-in ──────────────────────── */

function openLocked(reason) {
  const view = el(`
    <div class="hw-view hw-bg">
      <div class="hw-decor" aria-hidden="true">
        <span class="hw-float" style="left:18%;animation-duration:18s;color:#ffae42;width:30px;height:30px;opacity:.2">${icon('ghost', 30)}</span>
        <span class="hw-float" style="left:72%;animation-duration:22s;animation-delay:4s;color:#ffae42;width:26px;height:26px;opacity:.18">${icon('pumpkin', 26)}</span>
      </div>
      <header class="hw-head">
        <button class="btn btn-icon btn-ghost" data-back>${icon('back', 20)}</button>
        <div class="grow"></div>
      </header>
      <div class="hw-locked">
        <div class="hw-lock-orb">${icon('lock', 56)}</div>
        <h1 class="hw-spooky hw-title" style="font-size:26px">Закрыто</h1>
        <p class="hw-sub">${esc(reason)}</p>
        <button class="btn hw-go-back" data-back-2>${icon('back', 16)} Вернуться</button>
      </div>
    </div>`);
  document.body.appendChild(view);
  document.body.style.overflow = 'hidden';
  const close = () => { view.remove(); document.body.style.overflow = ''; };
  view.querySelector('[data-back]').onclick = close;
  view.querySelector('[data-back-2]').onclick = close;
}

/* ── public entry ───────────────────────────────────────────────────────── */

export function openHalloween() {
  const user = state.user;
  if (!user) return openLocked('Нужен вход для участия. Войдите, чтобы открыть ивент.');

  // Apply any pending admin grants before showing the event
  applyHalloweenPending();

  const view = el(`
    <div class="hw-view hw-bg">
      <div class="hw-bat" aria-hidden="true">${icon('ghost', 22)}</div>

      <header class="hw-head">
        <button class="btn btn-icon btn-ghost" data-back>${icon('back', 20)}</button>
        <div class="grow"></div>
        <span class="hw-badge">Хэллоуин 2026</span>
      </header>

      <div class="hw-scroll">
        <!-- 1. Header -->
        <section class="hw-hero">
          <div class="hw-jack">${icon('pumpkin', 72)}</div>
          <h1 class="hw-title hw-spooky">Хэллоуин в СпокУме</h1>
          <p class="hw-sub">Жуткий сезон · до 31 октября</p>
        </section>

        <!-- 2. Spooky Stats -->
        <section class="hw-section">
          <div class="hw-section-title">${icon('trophy', 18)} <span>Твои трофеи</span></div>
          <div class="hw-stats" data-stats></div>
        </section>

        <!-- 3. Trick or Treat -->
        <section class="hw-section">
          <div class="hw-section-title">${icon('gift', 18)} <span>Trick or Treat</span></div>
          <div class="hw-card hw-treat">
            <p class="tiny muted" style="margin:0 0 12px;text-align:center">Раз в день получай горсть конфет от 10 до 50</p>
            <button class="hw-claim-btn" data-claim>${icon('pumpkin', 26)} Получить награду</button>
            <div class="hw-countdown" data-reward-countdown>Следующая через …</div>
          </div>
        </section>

        <!-- 4. Mini-Games -->
        <section class="hw-section">
          <div class="hw-section-title">${icon('games', 18)} <span>Хэллоуинские мини-игры</span></div>
          <div class="hw-games" data-games></div>
        </section>

        <!-- 5. Leaderboard -->
        <section class="hw-section">
          <div class="hw-section-title">${icon('star', 18)} <span>Таблица рекордов</span></div>
          <div class="hw-card" data-leaderboard></div>
        </section>

        <!-- 6. Spooky Mood -->
        <section class="hw-section">
          <div class="hw-section-title">${icon('moon', 18)} <span>Жуткое настроение дня</span></div>
          <div class="hw-card" data-mood-host></div>
        </section>

        <!-- 7. Shop -->
        <section class="hw-section">
          <div class="hw-section-title">${icon('candy', 18)} <span>Хэллоуинская лавка</span></div>
          <div class="hw-shop" data-shop></div>
        </section>

        <!-- 8. Footer -->
        <footer class="hw-foot">
          <div class="hw-bat-line" aria-hidden="true">
            <span class="hw-bat-fly">${icon('ghost', 18)}</span>
          </div>
          <p class="tiny muted" style="text-align:center;margin:8px 0 0">Ивент завершится 31 октября в 23:59</p>
        </footer>
      </div>
    </div>`);

  document.body.appendChild(view);
  document.body.style.overflow = 'hidden';
  spawnFloatingDecor(view);

  // back button
  const close = () => {
    if (view._rewardTimer) clearInterval(view._rewardTimer);
    view.remove();
    document.body.style.overflow = '';
  };
  view.querySelector('[data-back]').onclick = close;

  // render all sections
  paintStats(view);
  paintReward(view);
  paintGames(view);
  paintLeaderboard(view);
  paintMood(view);
  paintShop(view);

  // Trick-or-Treat claim
  const claimBtn = view.querySelector('[data-claim]');
  claimBtn.onclick = () => {
    const last = Number(localStorage.getItem(KEYS.lastReward) || 0);
    if (last && dayKey(last) === dayKey()) {
      toast('Сегодня уже получал', 'err');
      return;
    }
    const reward = 10 + Math.floor(Math.random() * 41); // 10-50
    addCandies(reward);
    addPumpkins(1);
    localStorage.setItem(KEYS.lastReward, String(Date.now()));
    toast(`+${reward} конфет и тыковка!`);
    confettiBurst(view);
    paintStats(view);
    paintReward(view);
    paintShop(view);
  };

  return { close, view };
}
