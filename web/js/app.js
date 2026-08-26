import { api, state, setUser, applyAppearance, subscribe, initBackend, emit } from './store.js';
import { el, esc, plural } from './util.js';
import { icon, logoMark, setLogoSource, solidIcon } from './icons.js';
import { toast, openSheet } from './ui.js';
import { renderAuth } from './views/auth.js';

const TABS = [
  ['feed', 'Лента', 'feed'],
  ['chats', 'Чаты', 'chats'],
  ['games', 'Игры', 'games'],
  ['settings', 'Настройки', 'settings'],
  ['profile', 'Профиль', 'profile']
];

const views = {
  feed: () => import('./views/feed.js'),
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
    probe.onload = () => done(true);
    probe.onerror = () => done(false);
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

function registerWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.protocol !== 'http:') return;
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

async function boot() {
  applyAppearance(null);
  await detectLogo();
  root.innerHTML = `<div class="auth-wrap"><div class="auth-logo">${logoMark(38)}</div></div>`;
  registerWorker();
  watchNetwork();
  await initBackend();
  try {
    const { user } = await api.me();
    setUser(user);
  } catch {
    setUser(null);
  }
  if (!state.user) renderAuth(root, start);
  else {
    start();
    announcePremium(state.user);
  }
}

function start() {
  buildShell();
  openTab(state.tab || 'feed');
  connectSocket();
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
  if (!state.user) return;
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
  const host = shell.querySelector('[data-view]');
  if (state.user && navigator.onLine) {
    const { loadStories } = await import('./views/stories.js');
    await loadStories();
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
  refreshUnread();
}

async function refreshUnread() {
  if (!state.user) return;
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

document.addEventListener('click', (event) => {
  const badge = event.target.closest?.('[data-badge]');
  if (!badge) return;
  event.preventDefault();
  event.stopPropagation();
  toast(badge.dataset.badge);
}, true);

window.addEventListener('spokum:message', () => refreshUnread());
setInterval(refreshUnread, 15000);
setInterval(refreshUser, 30000);
subscribe((event) => {
  if (event === 'user') applyAppearance(state.user);
});

boot();
