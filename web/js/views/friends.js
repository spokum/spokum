import { api, state, setUser } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, emptyState, avatar } from '../ui.js';

export async function openFriends() {
  const host = el('<div class="col" style="gap:10px"></div>');
  const sheet = openSheet('Друзья', host, {});
  const draw = async () => {
    host.innerHTML = `<div class="card"><p class="muted center">Загрузка...</p></div>`;
    try {
      const [{ friends }, { requests }] = await Promise.all([api.myFriends(), api.pendingFriendRequests()]);
      let html = '';
      if (requests.length) {
        html += `<div class="strong small" style="margin:4px 2px">Заявки (${requests.length})</div>`;
        html += requests.map((r) => `
          <div class="card list-item" style="padding:10px">
            ${avatar(r, 36)}
            <div class="grow" style="text-align:left"><div class="small strong">${esc(r.displayName)}</div><div class="tiny muted">@${esc(r.username)}</div></div>
            <button class="btn btn-sm btn-primary" data-accept="${r.id}">Принять</button>
            <button class="btn btn-sm" data-reject="${r.id}">Откл.</button>
          </div>
        `).join('');
      }
      html += `<div class="strong small" style="margin:8px 2px 4px">Друзья (${friends.length})</div>`;
      if (!friends.length) {
        html += emptyState('users', 'Пока нет друзей', 'Отправьте заявку в профиле пользователя');
      } else {
        html += friends.map((f) => `
          <div class="card list-item" style="padding:10px">
            ${avatar(f, 36)}
            <div class="grow" style="text-align:left"><div class="small strong">${esc(f.displayName)}</div><div class="tiny muted">@${esc(f.username)}</div></div>
            <button class="btn btn-sm" data-remove="${f.id}" style="color:#c98b8b">Удалить</button>
          </div>
        `).join('');
      }
      host.innerHTML = html;
      host.querySelectorAll('[data-accept]').forEach((b) => { b.onclick = async () => { try { await api.acceptFriend(b.dataset.accept); toast('Добавлен'); draw(); } catch(e){toast(e.message,'err')} }; });
      host.querySelectorAll('[data-reject]').forEach((b) => { b.onclick = async () => { try { await api.removeFriend(b.dataset.reject); toast('Отклонено'); draw(); } catch(e){toast(e.message,'err')} }; });
      host.querySelectorAll('[data-remove]').forEach((b) => { b.onclick = async () => { try { await api.removeFriend(b.dataset.remove); toast('Удалён'); draw(); } catch(e){toast(e.message,'err')} }; });
    } catch (e) { host.innerHTML = emptyState('warn', 'Ошибка', e.message); }
  };
  await draw();
  return sheet;
}
