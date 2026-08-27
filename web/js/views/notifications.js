import { api, state } from '../store.js';
import { el, esc, timeAgo } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, emptyState, toast } from '../ui.js';

const LOOK = {
  message: { icon: 'chats', tone: '' },
  call: { icon: 'phone', tone: '' },
  report: { icon: 'flag', tone: 'warn' },
  newpost: { icon: 'feed', tone: '' },
  removed: { icon: 'trash', tone: 'bad' },
  punish: { icon: 'warn', tone: 'bad' },
  premium: { icon: 'crown', tone: 'good' },
  payment: { icon: 'crown', tone: 'good' },
  modaction: { icon: 'shield', tone: 'warn' }
};

let unread = 0;

export function systemNotify(item) {
  const title = item?.title || 'СпокУм';
  const body = item?.body || '';
  if (window.SpokumHost?.notify) {
    try {
      if (window.SpokumHost.canNotify && !window.SpokumHost.canNotify()) return;
      window.SpokumHost.notify(title, body);
      return;
    } catch {}
  }
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    navigator.serviceWorker?.ready
      .then((registration) => registration.showNotification(title, { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: `spokum-${item?.id || Date.now()}` }))
      .catch(() => new Notification(title, { body }));
  } catch {}
}

export async function askSystemPermission() {
  if (window.SpokumHost?.canNotify) return window.SpokumHost.canNotify();
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function systemAllowed() {
  if (window.SpokumHost?.canNotify) {
    try {
      return window.SpokumHost.canNotify();
    } catch {
      return false;
    }
  }
  return 'Notification' in window && Notification.permission === 'granted';
}

export function unreadCount() {
  return unread;
}

function paint() {
  const label = unread > 99 ? '99+' : String(unread);
  document.querySelectorAll('[data-bell]').forEach((bell) => {
    let dot = bell.querySelector('.bell-dot');
    if (!unread) {
      dot?.remove();
      return;
    }
    if (!dot) {
      dot = el('<span class="bell-dot"></span>');
      bell.appendChild(dot);
    }
    dot.textContent = label;
  });
  const tab = document.querySelector('[data-tab="profile"]');
  if (tab) {
    tab.querySelector('.nav-dot')?.remove();
    if (unread) tab.appendChild(el(`<span class="nav-dot">${unread > 99 ? '99' : unread}</span>`));
  }
  document.querySelectorAll('[data-bell-count]').forEach((node) => {
    node.textContent = unread ? `Непрочитанных: ${label}` : 'Всё прочитано';
  });
}

export async function refreshBell() {
  if (!state.user || !api.unreadNotifications) return;
  try {
    const { count } = await api.unreadNotifications();
    unread = count;
    paint();
  } catch {}
}

export function bumpBell() {
  unread += 1;
  paint();
  refreshBell();
}

export function mountBell(host, tab) {
  if (!state.user) return;
  if (tab && tab !== 'feed') {
    paint();
    return;
  }
  const bar = host.querySelector('.topbar');
  if (!bar || bar.querySelector('[data-bell]')) return;
  const button = el(`<button class="btn btn-icon" data-bell title="Уведомления">${icon('bell', 18)}</button>`);
  button.onclick = () => openNotifications();
  const spacer = bar.querySelector('.spacer');
  if (spacer) spacer.after(button);
  else bar.appendChild(button);
  paint();
}

async function jump(item, sheet) {
  const meta = item.meta || {};
  sheet.close();
  if (item.kind === 'message' && meta.chat) {
    const { openChat } = await import('./chats.js');
    openChat(meta.chat);
    return;
  }
  if (item.kind === 'report') {
    const { openMod } = await import('./mod.js');
    openMod();
    return;
  }
  if (item.kind === 'modaction' || item.kind === 'payment') {
    const { openAdmin } = await import('./admin.js');
    openAdmin();
    return;
  }
  if (item.kind === 'newpost' && meta.author) {
    const { openProfile } = await import('./profile.js');
    const { users } = await api.searchUsers('');
    const author = users.find((row) => String(row.id) === String(meta.author));
    if (author) openProfile(author.username);
    return;
  }
  if (item.kind === 'premium') {
    window.__spokum?.openTab?.('settings');
  }
}

export async function openNotifications() {
  if (!state.user) return toast('Войдите, чтобы видеть уведомления', 'err');
  const body = el(`<div class="col" style="gap:8px"><div class="card" style="height:70px;opacity:.3"></div></div>`);
  const sheet = openSheet('Уведомления', body);

  const draw = async () => {
    let items = [];
    try {
      const result = await api.notifications();
      items = result.items || [];
    } catch (error) {
      body.innerHTML = emptyState('warn', 'Не загрузилось', error.message);
      return;
    }

    if (!items.length) {
      body.innerHTML = emptyState('bell', 'Пока тихо', 'Здесь появятся сообщения, звонки и всё важное');
      return;
    }

    body.innerHTML = `
      <div class="row" style="gap:8px">
        <button class="btn btn-sm grow" data-read>${icon('check', 15)} Прочитано</button>
        <button class="btn btn-sm grow" data-clear>${icon('trash', 15)} Очистить</button>
      </div>
      <div class="col" data-list style="gap:8px"></div>`;

    const list = body.querySelector('[data-list]');
    items.forEach((item) => {
      const look = LOOK[item.kind] || { icon: 'bell', tone: '' };
      const card = el(`<button class="card note ${item.read ? '' : 'note-new'}" style="padding:12px;text-align:left;width:100%">
        <div class="row" style="gap:10px;align-items:flex-start">
          <span class="note-icon ${look.tone}">${icon(look.icon, 17)}</span>
          <span class="grow" style="min-width:0">
            <span class="row between" style="gap:8px">
              <span class="strong small truncate">${esc(item.title)}</span>
              <span class="tiny muted" style="flex:none">${esc(timeAgo(item.createdAt))}</span>
            </span>
            ${item.body ? `<span class="small muted" style="display:block;margin-top:3px;line-height:1.45">${esc(item.body)}</span>` : ''}
          </span>
        </div>
      </button>`);
      card.onclick = () => jump(item, sheet);
      list.appendChild(card);
    });

    body.querySelector('[data-read]').onclick = async () => {
      await api.readNotifications();
      unread = 0;
      paint();
      draw();
    };
    body.querySelector('[data-clear]').onclick = async () => {
      await api.clearNotifications();
      unread = 0;
      paint();
      draw();
    };

    if (items.some((item) => !item.read)) {
      api.readNotifications().then(() => {
        unread = 0;
        paint();
      }).catch(() => {});
    }
  };

  await draw();
  return sheet;
}
