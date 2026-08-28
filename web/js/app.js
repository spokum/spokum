import { api, state, setUser, applyAppearance, subscribe, initBackend, emit } from './store.js';
import { el, esc, plural } from './util.js';
import { icon, logoMark, setLogoSource, solidIcon } from './icons.js';
import { toast, openSheet } from './ui.js';
import { renderAuth } from './views/auth.js';

const TABS = [
  ['feed', 'Лента', 'feed'],
  ['videos', 'Видео', 'video'],
  ['chats', 'Чаты', 'chats'],
  ['games', 'Игры', 'games'],
  ['settings', 'Настройки', 'settings'],
  ['profile', 'Профиль', 'profile']
];

const views = {
  feed: () => import('./views/feed.js'),
  videos: () => import('./views/videos.js'),
  chats: () => import('./views/chats.js'),
  games: () => import('./views/games.js'),
  settings: () => import('./views/settings.js'),
  profile: () => import('./views/profile.js')
};

const root = document.getElementById('app');
let shell = null;
let socket = null;

const LOGO_FILES = ['logo.png', 'logo.jpg', 'logo.jpeg', 'logo.webp', 'logo.svg'];

function tryLogo(url) {
  return new Promise((done) => {
    const probe = new Image();
    const finish = (result) => {
      clearTimeout(timer);
      done(result);
    };
    const timer = setTimeout(() => finish(false), 2500);
    probe.onload = () => finish(true);
    probe.onerror = () => finish(false);
    probe.src = url;
  });
}

function networkBar() {
  let bar = document.querySelector('.offline-bar');
  if (navigator.onLine) {
    bar?.remove();
    delete document.documentElement.dataset.offline;
    return;
  }
  document.documentElement.dataset.offline = 'yes';
  if (bar) return;
  bar = el(`<div class="offline-bar">${icon('warn', 15)}<span>Нет интернета. Показываем сохранённое</span></div>`);
  document.body.appendChild(bar);
}

function watchNetwork() {
  const update = () => {
    state.online = navigator.onLine;
    networkBar();
    emit('network', state.online);
    if (navigator.onLine && state.tab) openTab(state.tab);
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  networkBar();
}

const IN_APP = location.hostname === 'spokum.local' || location.hostname === 'appassets.androidplatform.net';

function registerWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (IN_APP) {
    navigator.serviceWorker.getRegistrations?.()
      .then((list) => list.forEach((registration) => registration.unregister()))
      .catch(() => {});
    return;
  }
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function detectLogo() {
  for (const file of LOGO_FILES) {
    if (!(await tryLogo(file))) continue;
    setLogoSource(file);
    document.documentElement.dataset.logo = 'custom';
    const link = document.querySelector('link[rel="icon"]');
    if (link) link.href = file;
    return;
  }
}

function topOverlay() {
  const layers = [...document.querySelectorAll('.sheet-backdrop, .chat-view, .game-stage, .story-view, .lightbox')];
  return layers.length ? layers[layers.length - 1] : null;
}

function goBackInside() {
  const layer = topOverlay();
  if (layer) {
    const close = layer.querySelector('[data-back]');
    if (close) close.click();
    else layer.remove();
    document.body.style.overflow = '';
    return true;
  }
  if (state.user && state.tab && state.tab !== 'feed') {
    openTab('feed');
    return true;
  }
  return false;
}

function watchSwipes() {
  let start = null;
  document.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) return;
    const point = event.touches[0];
    const edge = point.clientX < 26 || point.clientX > window.innerWidth - 26;
    start = edge ? { x: point.clientX, y: point.clientY, at: Date.now() } : null;
  }, { passive: true });

  document.addEventListener('touchend', (event) => {
    if (!start) return;
    const point = event.changedTouches[0];
    const dx = point.clientX - start.x;
    const dy = point.clientY - start.y;
    const quick = Date.now() - start.at < 700;
    start = null;
    if (!quick || Math.abs(dx) < 80 || Math.abs(dy) > 70) return;
    goBackInside();
  }, { passive: true });
}

let exitArmed = 0;

window.__spokumBack = () => {
  if (goBackInside()) return true;
  if (Date.now() - exitArmed < 2200) return false;
  exitArmed = Date.now();
  toast('Ещё раз, чтобы выйти');
  return true;
};

async function checkDevice(fresh) {
  if (!api.touchDevice) return false;
  try {
    const { deviceInfo, rememberBlock } = await import('./device.js');
    const info = await deviceInfo();
    const { state: ban } = await api.touchDevice(info, fresh);
    rememberBlock(ban);
    if (ban?.blocked) {
      showBlocked(ban);
      return true;
    }
  } catch {}
  return false;
}

function showBlocked(ban) {
  const until = ban.forever || !ban.until
    ? 'навсегда'
    : 'до ' + new Date(typeof ban.until === 'string' ? Date.parse(ban.until) : ban.until).toLocaleString('ru-RU');
  document.body.innerHTML = `<div class="block-screen">
    <span style="color:#c98b8b">${icon('ban', 44, 1.6)}</span>
    <div class="strong" style="font-size:18px">Устройство заблокировано</div>
    <p class="small muted" style="margin:0;max-width:340px;line-height:1.55">С этого устройства нельзя зайти и завести аккаунт ${until}.${ban.reason ? ' Причина: ' + ban.reason + '.' : ''}</p>
    <p class="tiny muted" style="margin:0;max-width:340px;line-height:1.5">Считаете, что это ошибка — напишите администрации с другого устройства.</p>
  </div>`;
  api.logout?.().catch(() => {});
}

async function boot() {
  applyAppearance(null);
  await detectLogo();
  root.innerHTML = `<div class="auth-wrap"><div class="auth-logo">${logoMark(38)}</div></div>`;
  registerWorker();
  watchNetwork();
  watchSwipes();
  import('./views/settings.js').then((module) => {
    module.applyNight?.();
    setInterval(() => module.applyNight?.(), 300000);
  }).catch(() => {});
  await Promise.race([
    initBackend(),
    new Promise((done) => setTimeout(done, 12000))
  ]);
  try {
    const { user } = await api.me();
    setUser(user);
  } catch {
    setUser(null);
  }
  if (await checkDevice(false)) return;
  if (!state.user) renderAuth(root, start);
  else {
    start();
    announcePremium(state.user);
  }
}

async function handOverSession() {
  if (!window.SpokumHost?.setAuth || !state.user) return;
  try {
    const tokens = await api.saveSession?.();
    if (!tokens?.refresh_token) return;
    window.SpokumHost.setAuth(
      window.SPOKUM_SUPABASE_URL || '',
      window.SPOKUM_SUPABASE_KEY || '',
      tokens.refresh_token
    );
  } catch {}
}

function start() {
  window.__spokum = { openTab };
  buildShell();
  openTab(state.tab || 'feed');
  connectSocket();
  askJournal();
  import('./call.js').then((module) => module.initCalls()).catch(() => {});
  import('./views/notifications.js').then((module) => module.refreshBell()).catch(() => {});
  import('./accounts.js').then((module) => module.rememberCurrent()).catch(() => {});
  handOverSession();
}

async function askJournal() {
  if (!state.user || !navigator.onLine) return;
  try {
    const journal = await import('./views/journal.js');
    if (!(await journal.shouldAskToday())) return;
    setTimeout(() => journal.openJournal(), 1200);
  } catch {}
}

function buildShell() {
  shell = el(`
    <div>
      <main class="shell" data-view></main>
      <nav class="nav" data-nav></nav>
    </div>`);
  root.innerHTML = '';
  root.appendChild(shell);

  const nav = shell.querySelector('[data-nav]');
  nav.innerHTML = TABS.map(
    ([key, label, glyph]) => `<button class="nav-item" data-tab="${key}">${icon(glyph, 21, 1.8)}<span>${label}</span></button>`
  ).join('');
  nav.querySelectorAll('[data-tab]').forEach((button) => {
    button.onclick = () => openTab(button.dataset.tab);
  });
}

const PREMIUM_SEEN = 'spokum.premium.seen';

function announcePremium(user) {
  if (!user?.premiumUntil || user.premiumUntil <= Date.now()) return;
  let seen = 0;
  try {
    seen = Number(localStorage.getItem(PREMIUM_SEEN) || 0);
  } catch {}
  if (seen >= user.premiumUntil) return;
  try {
    localStorage.setItem(PREMIUM_SEEN, String(user.premiumUntil));
  } catch {}

  const until = new Date(user.premiumUntil);
  const days = Math.max(1, Math.ceil((user.premiumUntil - Date.now()) / 86400000));
  const body = el(`
    <div class="col center" style="text-align:center">
      <div style="display:flex;justify-content:center;color:#c6b083">${solidIcon('crown', 46)}</div>
      <div class="strong" style="font-size:20px">Вам выдали СпокУм Премиум</div>
      <div class="col" style="gap:8px;text-align:left;margin-top:6px">
        <div class="card" style="padding:12px">
          <div class="tiny muted">Срок</div>
          <div class="small strong" style="margin-top:2px">${days} ${plural(days, 'день', 'дня', 'дней').split(' ')[1]}, до ${esc(until.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }))}</div>
        </div>
        <div class="card" style="padding:12px">
          <div class="tiny muted">Причина</div>
          <div class="small" style="margin-top:2px;line-height:1.45">${esc(user.premiumReason || 'Без причины')}</div>
        </div>
      </div>
      <button class="btn btn-primary" data-ok style="margin-top:6px">Спасибо</button>
    </div>`);
  const sheet = openSheet('', body);
  body.querySelector('[data-ok]').onclick = () => sheet.close();
}

export async function refreshUser() {
  if (!state.user || state.quiet) return;
  try {
    const { user } = await api.me();
    if (!user) return;
    announcePremium(user);
    const changed = ['isAdmin', 'isModerator', 'isDeveloper', 'isVerified', 'mutedUntil', 'bannedUntil', 'premiumUntil']
      .some((key) => user[key] !== state.user[key]);
    setUser(user);
    if (changed && state.tab) openTab(state.tab);
  } catch {}
}

async function openTab(tab) {
  state.tab = tab;
  window.__spokum = { openTab };
  const host = shell.querySelector('[data-view]');
  if (state.user && navigator.onLine) {
    const { loadStories } = await import('./views/stories.js');
    await Promise.race([loadStories(), new Promise((done) => setTimeout(done, 4000))]);
  }
  shell.querySelectorAll('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  host.scrollTop = 0;
  window.scrollTo({ top: 0 });
  host.innerHTML = '';
  try {
    const module = await views[tab]();
    await module.render(host);
  } catch (error) {
    host.innerHTML = `<div class="empty">${error.message}</div>`;
  }
  try {
    const bell = await import('./views/notifications.js');
    bell.mountBell(host, tab);
    bell.refreshBell();
  } catch {}
  refreshUnread();
}

async function refreshUnread() {
  if (!state.user || state.quiet) return;
  try {
    const { chats } = await api.chats();
    const total = chats.reduce((sum, chat) => sum + chat.unread, 0);
    const button = shell?.querySelector('[data-tab="chats"]');
    if (!button) return;
    button.querySelector('.nav-dot')?.remove();
    if (total > 0) button.appendChild(el(`<span class="nav-dot">${total > 99 ? '99' : total}</span>`));
  } catch {}
}

function connectSocket() {
  if (api.mode !== 'remote' || !api.socketUrl) return;
  const url = api.socketUrl();
  if (!url) return;
  try {
    socket = new WebSocket(url);
  } catch {
    return;
  }
  socket.onmessage = (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    if (payload.type === 'message') {
      window.dispatchEvent(new CustomEvent('spokum:message', { detail: payload.message }));
      refreshUnread();
    }
    if (payload.type === 'call' && payload.action === 'ring' && payload.from?.id !== state.user?.id) {
      toast(`${payload.from.displayName} звонит`);
    }
  };
  socket.onclose = () => {
    setTimeout(() => {
      if (state.user) connectSocket();
    }, 4000);
  };
}

window.__spokumUpdateReady = () => {
  if (document.querySelector('.update-bar')) return;
  const bar = el(`<div class="update-bar">${icon('refresh', 15)}<span>Доступна новая версия</span><button data-apply>Обновить</button></div>`);
  document.body.appendChild(bar);
  bar.querySelector('[data-apply]').onclick = () => {
    if (window.SpokumHost?.apply) window.SpokumHost.apply();
    else location.reload();
  };
};

document.addEventListener('click', (event) => {
  const badge = event.target.closest?.('[data-badge]');
  if (!badge) return;
  event.preventDefault();
  event.stopPropagation();
  toast(badge.dataset.badge);
}, true);

document.addEventListener('click', async (event) => {
  const shot = event.target.closest?.('.status-icon, .zoomable, .post-image img, .album-shot');
  if (!shot || !shot.src) return;
  event.preventDefault();
  event.stopPropagation();
  const { openLightbox } = await import('./ui.js');
  const group = shot.closest('[data-album]');
  if (group) {
    const all = [...group.querySelectorAll('img')].map((node) => node.dataset.full || node.src);
    openLightbox(all, { start: all.indexOf(shot.dataset.full || shot.src), caption: shot.dataset.caption || '' });
    return;
  }
  openLightbox(shot.dataset.full || shot.src, { caption: shot.dataset.caption || (shot.classList.contains('status-icon') ? 'Статус' : '') });
}, true);

window.addEventListener('spokum:message', () => refreshUnread());

window.addEventListener('spokum:notify', async (event) => {
  const bell = await import('./views/notifications.js');
  bell.bumpBell();
  const item = event.detail || {};
  if (state.quiet) return;
  if (document.hidden) bell.systemNotify(item);
  else if (item.kind !== 'message' && item.kind !== 'newpost') toast(item.title || 'Новое уведомление');
});

setInterval(async () => {
  if (!state.user) return;
  try {
    const bell = await import('./views/notifications.js');
    bell.refreshBell();
  } catch {}
}, 20000);
setInterval(refreshUnread, 15000);
setInterval(refreshUser, 30000);
subscribe((event) => {
  if (event === 'user') applyAppearance(state.user);
});

boot();
