import { state, isBeta } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast } from '../ui.js';

const PLAYLIST = [
  { file: '1.mp3', artist: 'HOFMANNITA, Brick Bazuka', title: 'Сердце', foreignAgent: false, flag: false },
  { file: '2.mp3', artist: 'Madk1d, VILLIAN', title: 'Династия', foreignAgent: false, flag: false },
  { file: '3.mp3', artist: 'Madk1d', title: 'питер паркер', foreignAgent: false, flag: false },
  { file: '4.mp3', artist: 'Мэйби Бэйби', title: 'Любимая школа', foreignAgent: false, flag: false },
  { file: '5.mp3', artist: 'Noize MC, Монеточка', title: 'Люди с автоматами', foreignAgent: true, flag: false, available: false },
  { file: '6.mp3', artist: 'SLAVA MARLOW, Toly Summer, Кобяков, GAZAN, Вова Солодков', title: 'Ты горишь как огонь 2', foreignAgent: false, flag: false },
  { file: '7.mp3', artist: 'MORGENSHTERN', title: 'ICE', foreignAgent: true, flag: false },
  { file: '8.mp3', artist: '17 Seventeen', title: 'Конфетка', foreignAgent: false, flag: false },
  { file: '9.mp3', artist: 'SHAMAN', title: 'Россия Мама', foreignAgent: false, flag: true },
  { file: '10.mp3', artist: 'VILLIAN', title: 'Случайно Наступил На Шприц', foreignAgent: false, flag: false },
];

const JOINED_KEY = 'spokum.disco.joined';

function getJoined() {
  try { return JSON.parse(localStorage.getItem(JOINED_KEY) || '[]'); } catch { return []; }
}
function addJoined(user) {
  const list = getJoined();
  if (!list.find(u => u.id === user.id)) {
    list.push({ id: user.id, username: user.username, displayName: user.displayName, avatar: user.avatar, hue: user.hue });
    localStorage.setItem(JOINED_KEY, JSON.stringify(list));
  }
  return list;
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
      @keyframes disco-strobe { 0%,100%{opacity:1} 50%{opacity:0.3} }
      @keyframes disco-light-left { 0%{transform:rotate(-30deg)} 50%{transform:rotate(30deg)} 100%{transform:rotate(-30deg)} }
      @keyframes disco-light-right { 0%{transform:rotate(30deg)} 50%{transform:rotate(-30deg)} 100%{transform:rotate(30deg)} }
      @keyframes disco-fog { 0%{opacity:0.1;transform:translateX(-20px)} 50%{opacity:0.3} 100%{opacity:0.1;transform:translateX(20px)} }
      @keyframes disco-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }
      @keyframes disco-flag { 0%{opacity:0;transform:translateY(20px)} 10%{opacity:1;transform:translateY(0)} 90%{opacity:1} 100%{opacity:0;transform:translateY(0)} }
      @keyframes disco-silhouette { 0%{transform:translateY(10px)} 50%{transform:translateY(-5px)} 100%{transform:translateY(10px)} }
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
  const joined = getJoined();
  const me = state.user;
  const hasJoined = joined.find(u => u.id === me.id);

  const view = el(`
    <div id="disco-view" style="position:fixed;inset:0;z-index:99999;background:#030006;overflow:hidden">
      <canvas id="disco-canvas" style="position:absolute;inset:0;width:100%;height:100%"></canvas>

      <div id="disco-nowplaying" style="position:absolute;top:12px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.6);backdrop-filter:blur(8px);padding:10px 20px;border-radius:10px;border:1px solid rgba(255,255,255,.1);text-align:center;max-width:90%;z-index:10">
        <div id="disco-track-title" style="color:#fff;font-size:14px;font-weight:600">Загрузка...</div>
        <div id="disco-track-artist" style="color:#888;font-size:11px;margin-top:2px"></div>
      </div>

      <div id="disco-flag-warn" style="position:absolute;top:60px;left:50%;transform:translateX(-50%);background:rgba(232,160,48,.15);border:1px solid rgba(232,160,48,.3);padding:6px 14px;border-radius:8px;color:#e8a030;font-size:11px;z-index:10;display:none">
        Данная песня создана при участии иноагента
      </div>

      <button id="disco-exit" style="position:absolute;top:12px;right:12px;background:rgba(0,0,0,.5);border:1px solid #333;color:#888;width:36px;height:36px;border-radius:8px;cursor:pointer;z-index:10;font-size:18px">X</button>

      <div id="disco-join-area" style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);z-index:10">
        ${!hasJoined ? `<button id="disco-join" style="padding:14px 36px;border-radius:10px;background:linear-gradient(135deg,#ff00ff,#00ffff);border:none;color:#fff;font-weight:700;font-size:15px;cursor:pointer;box-shadow:0 0 30px rgba(255,0,255,.4)">Присоединиться</button>` : ''}
      </div>

      <div id="disco-controls" style="position:absolute;bottom:20px;right:12px;display:flex;gap:8px;z-index:10">
        <button id="disco-prev" style="background:rgba(0,0,0,.5);border:1px solid #333;color:#888;width:36px;height:36px;border-radius:8px;cursor:pointer;font-size:14px"><<</button>
        <button id="disco-play" style="background:rgba(0,0,0,.5);border:1px solid #333;color:#888;width:36px;height:36px;border-radius:8px;cursor:pointer;font-size:14px">||</button>
        <button id="disco-next" style="background:rgba(0,0,0,.5);border:1px solid #333;color:#888;width:36px;height:36px;border-radius:8px;cursor:pointer;font-size:14px">>></button>
      </div>

      <audio id="disco-audio" style="display:none"></audio>
    </div>
  `);
  document.body.appendChild(view);
  document.body.style.overflow = 'hidden';

  const canvas = view.querySelector('#disco-canvas');
  const audio = view.querySelector('#disco-audio');
  const ctx = canvas.getContext('2d');
  let currentTrack = 0;
  let isPlaying = false;
  let animFrame = null;
  let strobePhase = 0;
  let lightPhase = 0;
  let fogPhase = 0;
  let silhouettes = [...joined];
  let particles = [];

  function fitCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: rect.width, h: rect.height };
  }

  function loadTrack(index) {
    const track = PLAYLIST[index];
    if (!track) return;
    const titleEl = view.querySelector('#disco-track-title');
    const artistEl = view.querySelector('#disco-track-artist');
    const warnEl = view.querySelector('#disco-flag-warn');

    titleEl.textContent = track.title;
    artistEl.textContent = track.artist;

    if (track.foreignAgent) {
      warnEl.style.display = 'block';
    } else {
      warnEl.style.display = 'none';
    }

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

  function drawScene(size) {
    const { w, h } = size;

    ctx.fillStyle = '#030006';
    ctx.fillRect(0, 0, w, h);

    const track = PLAYLIST[currentTrack];
    const showFlag = track && track.flag;

    fogPhase += 0.005;
    for (let i = 0; i < 3; i++) {
      const fx = w * (0.2 + i * 0.3) + Math.sin(fogPhase + i) * 30;
      const fy = h * 0.5;
      const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, w * 0.25);
      const alpha = 0.08 + Math.sin(fogPhase * 2 + i) * 0.04;
      grad.addColorStop(0, `rgba(80,60,120,${alpha})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    const stageY = h * 0.35;
    const stageH = h * 0.15;
    const stageGrad = ctx.createLinearGradient(0, stageY, 0, stageY + stageH);
    stageGrad.addColorStop(0, 'rgba(40,20,60,0.8)');
    stageGrad.addColorStop(1, 'rgba(10,5,15,0.9)');
    ctx.fillStyle = stageGrad;
    ctx.beginPath();
    ctx.ellipse(w / 2, stageY + stageH / 2, w * 0.4, stageH, 0, 0, Math.PI * 2);
    ctx.fill();

    strobePhase += 0.15;
    const strobeColors = ['#ff00ff', '#00ffff', '#ffff00', '#ff0066', '#00ff66', '#ff6600'];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + strobePhase * 0.1;
      const lx = w / 2 + Math.cos(angle) * w * 0.15;
      const ly = stageY - 20;
      const len = w * 0.3;
      const color = strobeColors[i];
      const intensity = 0.15 + Math.abs(Math.sin(strobePhase + i * 0.8)) * 0.25;

      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(angle - Math.PI / 2);
      const beamGrad = ctx.createLinearGradient(0, 0, 0, len);
      beamGrad.addColorStop(0, color + Math.floor(intensity * 255).toString(16).padStart(2, '0'));
      beamGrad.addColorStop(1, color + '00');
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(8, 0);
      ctx.lineTo(30, len);
      ctx.lineTo(-30, len);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lx, ly, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    lightPhase += 0.02;
    const logoSize = Math.min(w, h) * 0.12;
    const logoX = w / 2;
    const logoY = stageY - 5;
    const pulseScale = 1 + Math.sin(lightPhase * 3) * 0.05;
    ctx.save();
    ctx.shadowBlur = 30;
    ctx.shadowColor = strobeColors[Math.floor(strobePhase) % 6];
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${logoSize * pulseScale}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('C', logoX, logoY);
    ctx.shadowBlur = 0;
    ctx.font = `${logoSize * 0.4 * pulseScale}px Inter, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('покУм', logoX + logoSize * 0.4, logoY);
    ctx.restore();

    if (showFlag) {
      const flagOpacity = 0.7 + Math.sin(lightPhase * 2) * 0.2;
      const flagX = w / 2;
      const flagY = stageY - 60;
      const flagW = 60;
      const flagH = 40;
      ctx.save();
      ctx.globalAlpha = flagOpacity;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(flagX - flagW / 2, flagY - flagH / 2, flagW, flagH / 3);
      ctx.fillStyle = '#0039a6';
      ctx.fillRect(flagX - flagW / 2, flagY - flagH / 2 + flagH / 3, flagW, flagH / 3);
      ctx.fillStyle = '#d52b1e';
      ctx.fillRect(flagX - flagW / 2, flagY - flagH / 2 + flagH * 2 / 3, flagW, flagH / 3);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(flagX - flagW / 2, flagY - flagH / 2, flagW, flagH);
      ctx.restore();
    }

    const danceY = h * 0.75;
    silhouettes.forEach((user, i) => {
      const spacing = Math.min(60, w / (silhouettes.length + 1));
      const totalW = silhouettes.length * spacing;
      const startX = w / 2 - totalW / 2 + spacing / 2;
      const sx = startX + i * spacing;
      const bounceY = Math.sin(lightPhase * 4 + i) * 8;

      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.beginPath();
      ctx.ellipse(sx, danceY + bounceY, 18, 35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sx - 15, danceY + bounceY + 30);
      ctx.lineTo(sx - 8, danceY + bounceY + 60);
      ctx.lineTo(sx + 8, danceY + bounceY + 60);
      ctx.lineTo(sx + 15, danceY + bounceY + 30);
      ctx.fill();
      ctx.restore();

      const avatarSize = 28;
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, danceY + bounceY - 40, avatarSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      if (user.avatar) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = user.avatar;
        img.onload = () => {
          ctx.drawImage(img, sx - avatarSize / 2, danceY + bounceY - 40 - avatarSize / 2, avatarSize, avatarSize);
        };
      } else {
        ctx.fillStyle = `hsl(${user.hue || 220}, 30%, 30%)`;
        ctx.fillRect(sx - avatarSize / 2, danceY + bounceY - 40 - avatarSize / 2, avatarSize, avatarSize);
      }
      ctx.restore();

      ctx.strokeStyle = `hsl(${user.hue || 220}, 50%, 50%)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, danceY + bounceY - 40, avatarSize / 2 + 1, 0, Math.PI * 2);
      ctx.stroke();

      user._x = sx;
      user._y = danceY + bounceY - 40;
    });

    if (isPlaying && Math.random() < 0.3) {
      particles.push({
        x: Math.random() * w,
        y: h + 10,
        vy: -(1 + Math.random() * 2),
        size: 2 + Math.random() * 3,
        color: strobeColors[Math.floor(Math.random() * 6)],
        life: 1,
      });
    }
    particles = particles.filter(p => {
      p.y += p.vy;
      p.life -= 0.005;
      if (p.life <= 0 || p.y < 0) return false;
      ctx.save();
      ctx.globalAlpha = p.life * 0.6;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return true;
    });

    ctx.fillStyle = 'rgba(20,10,30,0.6)';
    ctx.fillRect(0, h * 0.85, w, h * 0.15);

    const barCount = 16;
    const barW = w / barCount;
    for (let i = 0; i < barCount; i++) {
      const barH = (0.3 + Math.abs(Math.sin(strobePhase * 2 + i * 0.5)) * 0.7) * h * 0.1;
      ctx.fillStyle = strobeColors[i % 6] + '40';
      ctx.fillRect(i * barW + 2, h * 0.95 - barH, barW - 4, barH);
    }
  }

  function animate() {
    const size = fitCanvas();
    drawScene(size);
    animFrame = requestAnimationFrame(animate);
  }

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let found = null;
    silhouettes.forEach(u => {
      if (u._x && Math.abs(mx - u._x) < 20 && Math.abs(my - u._y) < 20) {
        found = u;
      }
    });
    canvas.title = found ? found.displayName || found.username : '';
    canvas.style.cursor = found ? 'pointer' : 'default';
  });

  view.querySelector('#disco-exit').onclick = () => {
    if (animFrame) cancelAnimationFrame(animFrame);
    audio.pause();
    audio.src = '';
    view.remove();
    document.body.style.overflow = '';
  };

  view.querySelector('#disco-join')?.addEventListener('click', () => {
    const me = state.user;
    silhouettes.push(me);
    addJoined(me);
    view.querySelector('#disco-join')?.remove();
    toast('Вы присоединились к дискотеке!');
  });

  view.querySelector('#disco-play').onclick = () => {
    if (isPlaying) {
      audio.pause();
      isPlaying = false;
      view.querySelector('#disco-play').textContent = '>';
    } else {
      playTrack();
      view.querySelector('#disco-play').textContent = '||';
    }
  };

  view.querySelector('#disco-prev').onclick = () => {
    currentTrack = (currentTrack - 1 + PLAYLIST.length) % PLAYLIST.length;
    loadTrack(currentTrack);
    playTrack();
  };

  view.querySelector('#disco-next').onclick = () => {
    currentTrack = (currentTrack + 1) % PLAYLIST.length;
    loadTrack(currentTrack);
    playTrack();
  };

  loadTrack(currentTrack);
  animate();
  setTimeout(() => playTrack(), 500);
}
