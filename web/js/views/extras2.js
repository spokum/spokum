import { api, state } from '../store.js';
import { el, esc, timeAgo } from '../util.js';
import { icon } from '../icons.js';
import { avatar, toast, openSheet, emptyState, confirmSheet, promptSheet } from '../ui.js';

export async function openProfileViewers() {
  const host = el('<div class="col" style="gap:8px"></div>');
  const sheet = openSheet('Кто смотрел профиль', host);
  host.innerHTML = `<div class="card"><p class="muted center">Загрузка...</p></div>`;
  try {
    const { viewers } = await api.myProfileViewers();
    if (!viewers.length) {
      host.innerHTML = emptyState('eye', 'Пока никто не смотрел', 'Зайдите позже');
      return;
    }
    host.innerHTML = viewers.map((v) => `
      <div class="card list-item" style="padding:10px">
        ${avatar(v, 40)}
        <div class="grow" style="text-align:left">
          <div class="strong small">${esc(v.displayName || v.username)}</div>
          <div class="tiny muted">@${esc(v.username)} · ${timeAgo(new Date(v.viewedAt))}</div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    host.innerHTML = emptyState('warn', 'Ошибка', e.message);
  }
  return sheet;
}

export async function openWishlist(userId, isOwn) {
  const host = el('<div class="col" style="gap:8px"></div>');
  const sheet = openSheet(isOwn ? 'Мой вишлист' : 'Вишлист', host);

  const draw = async () => {
    host.innerHTML = `<div class="card"><p class="muted center">Загрузка...</p></div>`;
    try {
      const { items } = await api.getWishlist(userId);
      let html = '';
      if (isOwn) {
        html += `
          <div class="card" style="padding:10px">
            <input class="input" data-title placeholder="Что вы хотите получить?" maxlength="200" style="margin-bottom:6px">
            <input class="input" data-link placeholder="Ссылка (необязательно)" style="margin-bottom:6px">
            <button class="btn btn-primary" data-add style="width:100%">${icon('plus', 16)} Добавить</button>
          </div>
        `;
      }
      if (!items.length && !isOwn) {
        html += emptyState('gift', 'Список пуст', 'Пользователь пока ничего не хочет');
      } else if (items.length) {
        html += items.map((it) => `
          <div class="card list-item" style="padding:10px;align-items:flex-start">
            <div class="grow">
              <div class="strong small">${esc(it.title)}</div>
              ${it.link ? `<a href="${esc(it.link)}" target="_blank" rel="noopener" class="tiny" style="color:var(--accent);display:block;margin-top:2px;word-break:break-all">Открыть ссылку</a>` : ''}
              ${it.grantedBy ? `<div class="tiny muted" style="margin-top:4px">подарено</div>` : `<div class="tiny muted" style="margin-top:4px">${timeAgo(new Date(it.createdAt))}</div>`}
            </div>
            ${it.canDelete ? `<button class="btn btn-sm" data-del="${it.id}" style="color:#c98b8b;padding:4px 8px">${icon('trash', 14)}</button>` : ''}
          </div>
        `).join('');
      }
      host.innerHTML = html;

      if (isOwn) {
        const titleInp = host.querySelector('[data-title]');
        const linkInp = host.querySelector('[data-link]');
        host.querySelector('[data-add]')?.addEventListener('click', async () => {
          if (!titleInp.value.trim()) { toast('Введите название', 'err'); return; }
          try {
            await api.addWishlistItem(titleInp.value.trim(), linkInp.value.trim() || null);
            toast('Добавлено');
            draw();
          } catch (e) { toast(e.message, 'err'); }
        });
      }

      host.querySelectorAll('[data-del]').forEach((btn) => {
        btn.onclick = async () => {
          if (!await confirmSheet({ title: 'Удалить?', confirm: 'Удалить', danger: true })) return;
          try { await api.removeWishlistItem(Number(btn.dataset.del)); toast('Удалено'); draw(); }
          catch (e) { toast(e.message, 'err'); }
        };
      });
    } catch (e) {
      host.innerHTML = emptyState('warn', 'Ошибка', e.message);
    }
  };

  await draw();
  return sheet;
}
