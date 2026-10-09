import { state } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, avatar, emptyState } from '../ui.js';

const RACE_PORT = 3005;
let ws = null;
let canvas = null;
let ctx = null;
let myId = null;
let lobbyCode = null;
let gameState = { players: [], started: false, countdown: 0, trackSeed: 0 };
let keys = {};
let joystick = { active: false, x: 0, y: 0, baseX: 0, baseY: 0 };
let lastInput = 0;
let rafId = null;

export async function openRace() {
  const host = el(`
    <div class="col" style="gap:12px;padding:12px">
      <div data-menu style="display:flex;flex-direction:column;gap:10px">
        <button class="btn btn-primary" data-quick style="font-size:16px;padding:14px">Быстрая игра</button>
        <div class="row" style="gap:8px">
          <input class="input grow" data-code placeholder="Код лобби" maxlength="6" style="text-transform:uppercase;text-align:center;font-size:18px">
          <button class="btn" data-join>Войти</button>
        </div>
        <button class="btn" data-create>Создать лобби</button>
      </div>
      <div data-lobby style="display:none;flex-direction:column;gap:10px">
        <div class="row between" style="align-items:center">
          <div class="strong" data-code-display></div>
          <button class="btn btn-sm" data-leave>Выйти</button>
        </div>
        <div data-players style="display:flex;flex-direction:column;gap:6px"></div>
        <div class="row" style="gap:8px">
          <button class="btn" data-add-bots>Добавить ботов</button>
          <button class="btn btn-primary grow" data-start>Старт гонки</button>
        </div>
      </div>
      <div data-race style="display:none;flex-direction:column;gap:8px">
        <canvas data-canvas style="width:100%;aspect-ratio:1.6;background:#0a0e14;border-radius:12px;touch-action:none"></canvas>
        <div data-countdown class="strong center" style="font-size:32px;display:none"></div>
        <div data-results style="display:none;flex-direction:column;gap:6px"></div>
      </div>
    </div>
  `);
  const sheet = openSheet('Гонки', host, {});

  const menuEl = host.querySelector('[data-menu]');
  const lobbyEl = host.querySelector('[data-lobby]');
  const raceEl = host.querySelector('[data-race]');
  const codeInput = host.querySelector('[data-code]');
  const codeDisplay = host.querySelector('[data-code-display]');
  const playersEl = host.querySelector('[data-players]');
  const canvasEl = host.querySelector('[data-canvas]');
  const countdownEl = host.querySelector('[data-countdown]');
  const resultsEl = host.querySelector('[data-results]');
  ctx = canvasEl.getContext('2d');

  const connect = () => new Promise((resolve) => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/?XTransformPort=${RACE_PORT}`);
    ws.onopen = () => resolve(true);
    ws.onerror = () => resolve(false);
    ws.onmessage = (e) => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      handleMessage(msg);
    };
  });

  const handleMessage = (msg) => {
    if (msg.type === 'joined') {
      myId = msg.playerId;
      lobbyCode = msg.code;
      codeDisplay.textContent = 'Лобби: ' + msg.code;
      menuEl.style.display = 'none';
      lobbyEl.style.display = 'flex';
      updatePlayers();
    }
    if (msg.type === 'state') {
      gameState = msg;
      updatePlayers();
      if (msg.started) {
        lobbyEl.style.display = 'none';
        raceEl.style.display = 'flex';
        if (msg.countdown > 0) {
          countdownEl.style.display = 'block';
          countdownEl.textContent = msg.countdown;
        } else {
          countdownEl.style.display = 'none';
        }
      }
    }
    if (msg.type === 'start') {
      lobbyEl.style.display = 'none';
      raceEl.style.display = 'flex';
      countdownEl.style.display = 'block';
      countdownEl.textContent = '3';
      startGameLoop();
    }
    if (msg.type === 'results') {
      countdownEl.style.display = 'none';
      resultsEl.style.display = 'flex';
      resultsEl.innerHTML = msg.results.map((r, i) => {
        const medal = i === 0 ? '1 место' : i === 1 ? '2 место' : i === 2 ? '3 место' : `${i+1} место`;
        const color = i === 0 ? 'var(--accent)' : 'var(--muted)';
        return `<div class="card list-item" style="padding:8px"><span class="strong" style="width:60px;color:${color}">${medal}</span><div class="grow small strong">${esc(r.name)}</div><span class="tiny muted">${(r.time/1000).toFixed(1)}с</span></div>`;
      }).join('');
    }
    if (msg.type === 'error') toast(msg.message, 'err');
  };

  const updatePlayers = () => {
    if (!playersEl) return;
    playersEl.innerHTML = gameState.players.map(p => `
      <div class="card list-item" style="padding:6px 10px">
        <div style="width:8px;height:8px;border-radius:50%;background:${p.color || '#888'}"></div>
        <div class="grow small strong">${esc(p.name)}${p.isBot ? ' (бот)' : ''}${p.id === myId ? ' (вы)' : ''}</div>
      </div>
    `).join('');
  };

  const startGameLoop = () => {
    if (rafId) cancelAnimationFrame(rafId);
    const loop = () => {
      sendInput();
      drawRace();
      rafId = requestAnimationFrame(loop);
    };
    loop();
  };

  const sendInput = () => {
    if (!ws || ws.readyState !== 1 || !gameState.started || gameState.countdown > 0) return;
    const now = Date.now();
    if (now - lastInput < 50) return;
    lastInput = now;
    let throttle = 0, steer = 0;
    if (keys['w'] || keys['arrowup']) throttle = 1;
    if (keys['s'] || keys['arrowdown']) throttle = -0.5;
    if (keys['a'] || keys['arrowleft']) steer = -1;
    if (keys['d'] || keys['arrowright']) steer = 1;
    if (joystick.active) {
      steer = Math.max(-1, Math.min(1, (joystick.x - joystick.baseX) / 50));
      throttle = Math.max(-1, Math.min(1, -(joystick.y - joystick.baseY) / 50));
    }
    ws.send(JSON.stringify({ type: 'input', throttle, steer }));
  };

  const drawRace = () => {
    if (!ctx) return;
    const r = canvasEl.getBoundingClientRect();
    canvasEl.width = r.width;
    canvasEl.height = r.height;
    const w = canvasEl.width, h = canvasEl.height;
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, w, h);

    const camX = (gameState.players.find(p => p.id === myId)?.x || 0);
    const scale = w / 400;
    const trackY = h / 2;

    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 50; i++) {
      const wx = i * 40 - camX * scale * 0.3;
      ctx.beginPath(); ctx.moveTo(wx % w, 0); ctx.lineTo(wx % w, h); ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(135,183,163,.2)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, trackY - 50);
    ctx.lineTo(w, trackY - 50);
    ctx.moveTo(0, trackY + 50);
    ctx.lineTo(w, trackY + 50);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,.15)';
    ctx.lineWidth = 2;
    ctx.setLineDash([20, 20]);
    ctx.beginPath(); ctx.moveTo(0, trackY); ctx.lineTo(w, trackY); ctx.stroke();
    ctx.setLineDash([]);

    const finishX = (1000 - camX) * scale + w / 2;
    if (finishX > 0 && finishX < w) {
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i % 2 ? '#fff' : '#000';
        ctx.fillRect(finishX, trackY - 50 + i * 10, 6, 10);
      }
    }

    gameState.players.forEach(p => {
      const px = (p.x - camX) * scale + w / 2;
      const py = trackY + p.y * scale;
      if (px < -20 || px > w + 20) return;
      ctx.fillStyle = p.color || '#888';
      ctx.beginPath();
      ctx.roundRect(px - 10, py - 6, 20, 12, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      ctx.beginPath();
      ctx.roundRect(px - 8, py - 4, 12, 4, 2);
      ctx.fill();
      if (p.id === myId) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(px - 12, py - 8, 24, 16, 4);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.font = '500 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.name.slice(0, 8), px, py - 12);
    });

    const me = gameState.players.find(p => p.id === myId);
    if (me) {
      const pct = Math.min(100, Math.round((me.x / 1000) * 100));
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.font = '600 12px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${pct}%`, 10, 18);
    }
  };

  canvasEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const r = canvasEl.getBoundingClientRect();
    joystick.active = true;
    joystick.baseX = (e.touches?.[0]?.clientX ?? e.clientX) - r.left;
    joystick.baseY = (e.touches?.[0]?.clientY ?? e.clientY) - r.top;
    joystick.x = joystick.baseX;
    joystick.y = joystick.baseY;
  });
  canvasEl.addEventListener('pointermove', (e) => {
    if (!joystick.active) return;
    const r = canvasEl.getBoundingClientRect();
    joystick.x = (e.touches?.[0]?.clientX ?? e.clientX) - r.left;
    joystick.y = (e.touches?.[0]?.clientY ?? e.clientY) - r.top;
  });
  canvasEl.addEventListener('pointerup', () => { joystick.active = false; });

  const keyHandler = (e, down) => {
    const k = e.key.toLowerCase();
    if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) {
      keys[k] = down;
      e.preventDefault();
    }
  };
  const kd = (e) => keyHandler(e, true);
  const ku = (e) => keyHandler(e, false);
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);

  const cleanup = () => {
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    if (rafId) cancelAnimationFrame(rafId);
    if (ws) { ws.send(JSON.stringify({ type: 'leave' })); ws.close(); }
  };
  const origClose = sheet.close;
  sheet.close = () => { cleanup(); origClose(); };

  const name = state.user?.displayName || state.user?.username || 'Игрок';
  const color = state.user?.hue ? `hsl(${state.user.hue}, 50%, 60%)` : '#87b7a3';

  host.querySelector('[data-quick]').onclick = async () => {
    const ok = await connect();
    if (!ok) { toast('Не удалось подключиться', 'err'); return; }
    ws.send(JSON.stringify({ type: 'quick', name, color }));
  };
  host.querySelector('[data-join]').onclick = async () => {
    const code = codeInput.value.trim().toUpperCase();
    if (!code) return toast('Введите код', 'err');
    const ok = await connect();
    if (!ok) { toast('Не удалось подключиться', 'err'); return; }
    ws.send(JSON.stringify({ type: 'join', code, name, color }));
  };
  host.querySelector('[data-create]').onclick = async () => {
    const ok = await connect();
    if (!ok) { toast('Не удалось подключиться', 'err'); return; }
    ws.send(JSON.stringify({ type: 'create', name, color }));
  };
  host.querySelector('[data-leave]').onclick = () => {
    cleanup();
    ws = null;
    lobbyCode = null;
    menuEl.style.display = 'flex';
    lobbyEl.style.display = 'none';
    raceEl.style.display = 'none';
  };
  host.querySelector('[data-add-bots]').onclick = () => {
    if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'add_bots', count: 1 }));
  };
  host.querySelector('[data-start]').onclick = () => {
    if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'start' }));
  };

  return sheet;
}
