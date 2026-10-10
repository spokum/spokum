import { api, state } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, avatar, emptyState } from '../ui.js';

export async function openSearch(initialQuery = '') {
  const host = el(`
    <div class="col" style="gap:10px">
      <div class="row" style="gap:8px">
        <input class="input grow" data-query placeholder="Поиск: люди, посты, группы..." value="${esc(initialQuery)}" maxlength="100">
        <button class="btn btn-primary" data-go>${icon('search', 16)}</button>
      </div>
      <div data-results></div>
    </div>
  `);
  const sheet = openSheet('Поиск', host, {});
  const results = host.querySelector('[data-results]');
  const query = host.querySelector('[data-query]');
  const btn = host.querySelector('[data-go]');

  const search = async () => {
    const q = query.value.trim();
    if (q.length < 2) { results.innerHTML = '<div class="small muted center" style="padding:12px">Введите минимум 2 символа</div>'; return; }
    results.innerHTML = '<div class="small muted center" style="padding:12px">Ищем...</div>';
    try {
      const data = await api.searchAll(q);
      let html = '';
      if (data.users?.length) {
        html += '<div class="strong small" style="margin:4px 2px">Люди</div>';
        html += data.users.map((u) => `
          <div class="card list-item" style="padding:8px" data-user="${esc(u.username)}">
            ${avatar(u, 32)}
            <div class="grow" style="text-align:left"><div class="small strong">${esc(u.displayName)}</div><div class="tiny muted">@${esc(u.username)}</div></div>
          </div>
        `).join('');
      }
      if (data.posts?.length) {
        html += '<div class="strong small" style="margin:8px 2px 4px">Посты</div>';
        html += data.posts.map((p) => `
          <div class="card" style="padding:10px;margin-bottom:4px" data-post="${p.id}">
            <div class="tiny muted">@${esc(p.author.username)}</div>
            <div class="small" style="margin-top:4px;line-height:1.4">${esc((p.body || '').slice(0, 80))}${p.body?.length > 80 ? '...' : ''}</div>
          </div>
        `).join('');
      }
      if (data.groups?.length) {
        html += '<div class="strong small" style="margin:8px 2px 4px">Группы</div>';
        html += data.groups.map((g) => `
          <div class="card list-item" style="padding:8px">
            <div style="width:32px;height:32px;border-radius:8px;background:var(--bg-3);display:flex;align-items:center;justify-content:center;font-weight:700">${esc(g.name[0]||'?')}</div>
            <div class="grow" style="text-align:left"><div class="small strong">${esc(g.name)}</div><div class="tiny muted">${g.members} участников</div></div>
          </div>
        `).join('');
      }
      if (!html) html = emptyState('search', 'Ничего не найдено', 'Попробуйте другой запрос');
      results.innerHTML = html;
      results.querySelectorAll('[data-user]').forEach((el) => { el.onclick = () => { import('./profile.js').then(m => m.openProfile(el.dataset.user)); }; });
    } catch (e) { results.innerHTML = emptyState('warn', 'Ошибка', e.message); }
  };

  btn.onclick = search;
  query.onkeydown = (e) => { if (e.key === 'Enter') search(); };
  if (initialQuery.length >= 2) search();
  else query.focus();
  return sheet;
}
