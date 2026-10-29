import { api, state } from '../store.js';
import { el, esc, debounce } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, emptyState, avatar } from '../ui.js';

// Friends sheet — tabs "Друзья" / "Заявки", a search bar to find new people,
// and the per-row actions ("Написать" / "Удалить из друзей" / "Принять" / "Отклонить"
// / "Добавить в друзья"). Backed by api.listFriends / friendRequest / acceptFriend
// / declineFriend / removeFriend (added to both local.js and remote-db.js).

const TAB_FRIENDS = 'friends';
const TAB_REQUESTS = 'requests';

function ensureStyles() {
  if (document.getElementById('friends-sheet-styles')) return;
  const tag = document.createElement('style');
  tag.id = 'friends-sheet-styles';
  tag.textContent = `
.fr-tabs { display:flex; gap:6px; margin:0 0 12px; }
.fr-tab {
  flex:1; padding:8px 0; border-radius: var(--r-sm);
  background: var(--surface); border: 1px solid var(--line);
  color: var(--muted); font-weight: 600; font-size: 13px;
  display: inline-flex; align-items: center; justify-content: center; gap: 5px;
}
.fr-tab.on { color: var(--accent-ink); background: var(--accent-soft); border-color: var(--accent); }
.fr-search { position: relative; margin-bottom: 10px; }
.fr-search input { padding-left: 38px; }
.fr-search > i { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); display: inline-flex; }
.fr-row {
  display:flex; align-items:center; gap:10px; padding:10px;
  background: var(--surface); border:1px solid var(--line); border-radius: var(--r-md);
}
.fr-row + .fr-row { margin-top: 6px; }
.fr-row .grow { min-width: 0; }
.fr-actions { display: flex; gap: 6px; flex: none; }
.fr-hint { margin: 4px 2px 8px; font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.fr-pill {
  display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px;
  border-radius: 999px; background: var(--surface-2); color: var(--muted);
  font-size: 11px; font-weight: 700;
}
.fr-section { margin-top: 14px; }
`;
  document.head.appendChild(tag);
}

export async function openFriends() {
  ensureStyles();
  const host = el('<div class="col" style="gap:10px"></div>');
  const sheet = openSheet('Друзья', host, {});
  let tab = TAB_FRIENDS;

  const draw = async () => {
    host.innerHTML = `<div class="card"><p class="muted center">Загрузка...</p></div>`;
    try {
      const { friends = [], requests = [] } = await api.listFriends();
      const renderTab = () => `
        <div class="fr-tabs">
          <button class="fr-tab ${tab === TAB_FRIENDS ? 'on' : ''}" data-tab="${TAB_FRIENDS}">${icon('users', 14)}<span>Друзья${friends.length ? ` (${friends.length})` : ''}</span></button>
          <button class="fr-tab ${tab === TAB_REQUESTS ? 'on' : ''}" data-tab="${TAB_REQUESTS}">${icon('bell', 14)}<span>Заявки${requests.length ? ` (${requests.length})` : ''}</span></button>
        </div>`;

      const renderFriends = () => {
        if (!friends.length) {
          return emptyState('users', 'Пока нет друзей', 'Найдите людей через поиск выше или зайдите в профиль человека');
        }
        return friends.map((f) => `
          <div class="fr-row">
            ${avatar(f, 40)}
            <div class="grow" style="min-width:0">
              <div class="row" style="gap:6px"><span class="strong small truncate">${esc(f.displayName)}</span></div>
              <div class="tiny muted truncate">@${esc(f.username)}</div>
            </div>
            <div class="fr-actions">
              <button class="btn btn-sm btn-primary" data-write="${f.id}" title="Написать">${icon('chats', 14)}<span>Написать</span></button>
              <button class="btn btn-sm" data-remove="${f.id}" title="Удалить из друзей" style="color:#c98b8b">${icon('trash', 14)}</button>
            </div>
          </div>`).join('');
      };

      const renderRequests = () => {
        if (!requests.length) {
          return emptyState('bell', 'Заявок нет', 'Когда кто-то захочет с вами подружиться, заявка появится здесь');
        }
        return requests.map((r) => `
          <div class="fr-row">
            ${avatar(r, 40)}
            <div class="grow" style="min-width:0">
              <div class="row" style="gap:6px"><span class="strong small truncate">${esc(r.displayName)}</span></div>
              <div class="tiny muted truncate">@${esc(r.username)}</div>
            </div>
            <div class="fr-actions">
              <button class="btn btn-sm btn-primary" data-accept="${r.id}">${icon('check', 14)}<span>Принять</span></button>
              <button class="btn btn-sm" data-decline="${r.id}" style="color:#c98b8b">${icon('close', 14)}<span>Отклонить</span></button>
            </div>
          </div>`).join('');
      };

      host.innerHTML = `
        ${renderTab()}
        <div class="fr-search">
          <i>${icon('search', 18)}</i>
          <input class="input" data-find placeholder="Найти людей по имени или @юзернейму">
        </div>
        <div data-find-results></div>
        <div class="fr-section" data-pane></div>`;

      const pane = host.querySelector('[data-pane]');
      const paintPane = () => {
        pane.innerHTML = tab === TAB_FRIENDS
          ? `<div class="fr-hint">Друзья · ${friends.length}</div>${renderFriends()}`
          : `<div class="fr-hint">Заявки · ${requests.length}</div>${renderRequests()}`;
        wirePane();
      };

      const wirePane = () => {
        pane.querySelectorAll('[data-write]').forEach((b) => {
          b.onclick = async () => {
            try {
              const { chat } = await api.createChat({ kind: 'dm', members: [Number(b.dataset.write)] });
              sheet.close();
              document.querySelector('[data-tab="chats"]')?.click();
              const { openChat } = await import('./chats.js?v=20251028');
              setTimeout(() => openChat(chat.id), 80);
            } catch (e) { toast(e.message, 'err'); }
          };
        });
        pane.querySelectorAll('[data-remove]').forEach((b) => {
          b.onclick = async () => {
            try { await api.removeFriend(b.dataset.remove); toast('Удалён из друзей'); draw(); }
            catch (e) { toast(e.message, 'err'); }
          };
        });
        pane.querySelectorAll('[data-accept]').forEach((b) => {
          b.onclick = async () => {
            try { await api.acceptFriend(b.dataset.accept); toast('Заявка принята'); draw(); }
            catch (e) { toast(e.message, 'err'); }
          };
        });
        pane.querySelectorAll('[data-decline]').forEach((b) => {
          b.onclick = async () => {
            try { await api.declineFriend(b.dataset.decline); toast('Заявка отклонена'); draw(); }
            catch (e) { toast(e.message, 'err'); }
          };
        });
      };

      host.querySelectorAll('[data-tab]').forEach((b) => {
        b.onclick = () => { tab = b.dataset.tab; host.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b)); paintPane(); };
      });

      // Search-to-add flow: debounced lookup, rows offer "Добавить в друзья".
      const findInput = host.querySelector('[data-find]');
      const findResults = host.querySelector('[data-find-results]');
      const drawResults = async () => {
        const q = findInput.value.trim();
        if (!q) { findResults.innerHTML = ''; return; }
        try {
          const { users = [] } = await api.searchUsers(q);
          const others = users.filter((u) => u.id !== state.user?.id);
          if (!others.length) {
            findResults.innerHTML = `<div class="tiny muted" style="margin:4px 2px">Никого не нашлось</div>`;
            return;
          }
          findResults.innerHTML = `<div class="fr-hint">Нашлись</div>` + others.slice(0, 10).map((u) => {
            const isFriend = friends.some((f) => String(f.id) === String(u.id));
            return `
              <div class="fr-row">
                ${avatar(u, 36)}
                <div class="grow" style="min-width:0">
                  <div class="row" style="gap:6px"><span class="strong small truncate">${esc(u.displayName)}</span></div>
                  <div class="tiny muted truncate">@${esc(u.username)}</div>
                </div>
                ${isFriend
                  ? `<span class="fr-pill">${icon('check', 12)}<span>В друзьях</span></span>`
                  : `<button class="btn btn-sm btn-primary" data-add="${u.id}">${icon('plus', 14)}<span>В друзья</span></button>`}
              </div>`;
          }).join('');
          findResults.querySelectorAll('[data-add]').forEach((b) => {
            b.onclick = async () => {
              try {
                await api.friendRequest(b.dataset.add);
                toast('Заявка отправлена');
                findInput.value = '';
                findResults.innerHTML = '';
                draw();
              } catch (e) { toast(e.message, 'err'); }
            };
          });
        } catch (e) {
          findResults.innerHTML = `<div class="tiny muted" style="margin:4px 2px">Не получилось найти: ${esc(e.message)}</div>`;
        }
      };
      findInput.addEventListener('input', debounce(drawResults, 260));

      paintPane();
    } catch (e) {
      host.innerHTML = emptyState('warn', 'Не получилось загрузить', e.message);
    }
  };

  await draw();
  return sheet;
}
