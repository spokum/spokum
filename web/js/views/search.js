import { api, state } from '../store.js';
import { el, esc, plural } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, avatar, emptyState } from '../ui.js';

export async function openSearch(initialQuery = '') {
  const host = el(`
    <div class="col" style="gap:10px">
      <div class="row" style="gap:8px">
        <input class="input grow" data-query placeholder="Поиск: люди, посты, группы, каналы..." value="${esc(initialQuery)}" maxlength="100">
        <button class="btn btn-primary" data-go>${icon('search', 16)}</button>
      </div>
      <div class="chips" data-tabs style="gap:6px;flex-wrap:wrap"></div>
      <div data-results></div>
    </div>
  `);
  const sheet = openSheet('Поиск', host, {});
  const results = host.querySelector('[data-results]');
  const query = host.querySelector('[data-query]');
  const btn = host.querySelector('[data-go]');
  const tabs = host.querySelector('[data-tabs]');

  // Tabs: "Всё" runs the unified searchAll RPC (server-side). The other
  // tabs are client-side filters that also work in local mode where
  // searchAll is not available.
  const TABS = [
    { id: 'all',     label: 'Всё' },
    { id: 'people',  label: 'Люди' },
    { id: 'posts',   label: 'Посты' },
    { id: 'groups',  label: 'Группы' },
    { id: 'channels', label: 'Каналы' }
  ];
  let active = 'all';

  const paintTabs = () => {
    tabs.innerHTML = TABS.map((t) => `<button class="chip" data-tab="${t.id}" aria-pressed="${t.id === active}">${esc(t.label)}</button>`).join('');
    tabs.querySelectorAll('[data-tab]').forEach((chip) => {
      chip.onclick = () => {
        active = chip.dataset.tab;
        paintTabs();
        search();
      };
    });
  };
  paintTabs();

  const renderChannels = (channels) => {
    if (!channels?.length) return '';
    return channels.map((c) => `<div class="channel-card" data-channel="${c.id}" style="margin-bottom:6px">
      <div class="channel-mark" style="background:hsl(${Number(c.hue) || 200} 38% 22%)">${esc((c.title || '?')[0].toUpperCase())}</div>
      <div class="grow" style="min-width:0;text-align:left">
        <div class="small strong truncate">${esc(c.title)}</div>
        <div class="tiny muted">${icon('users', 12)} ${plural(c.members || 0, 'подписчик', 'подписчика', 'подписчиков')}${c.owner ? ` · @${esc(c.owner.username)}` : ''}</div>
      </div>
      ${c.isOwner
        ? '<span class="pill good tiny">ваш канал</span>'
        : c.joined
          ? '<span class="pill tiny">вы подписаны</span>'
          : `<button class="btn btn-sm btn-primary" data-follow="${c.id}">Подписаться</button>`}
    </div>`).join('');
  };

  const wireChannels = (container) => {
    container.querySelectorAll('[data-channel]').forEach((node) => {
      node.onclick = async (event) => {
        if (event.target.closest('[data-follow]')) return;
        const id = Number(node.dataset.channel);
        try {
          // Open the channel chat directly via the existing chat view.
          sheet.close();
          const { openChat } = await import('./chats.js?v=20251028');
          document.querySelector('[data-tab="chats"]')?.click();
          setTimeout(() => openChat(id), 60);
        } catch (error) {
          toast(error.message, 'err');
        }
      };
    });
    container.querySelectorAll('[data-follow]').forEach((button) => {
      button.onclick = async (event) => {
        event.stopPropagation();
        const id = Number(button.dataset.follow);
        try {
          await api.followChannel(id);
          toast('Вы подписаны на канал');
          search();
        } catch (error) {
          toast(error.message, 'err');
        }
      };
    });
  };

  const search = async () => {
    const q = query.value.trim();
    if (q.length < 2) {
      results.innerHTML = '<div class="small muted center" style="padding:12px">Введите минимум 2 символа</div>';
      return;
    }
    if (active === 'channels') {
      // Channel search works without searchAll — it has its own endpoint.
      if (!api.searchChannels) {
        results.innerHTML = emptyState('warn', 'Поиск каналов недоступен', 'Эта база не поддерживает поиск каналов');
        return;
      }
      results.innerHTML = '<div class="small muted center" style="padding:12px">Ищем каналы...</div>';
      try {
        const { channels } = await api.searchChannels(q);
        results.innerHTML = channels.length
          ? `<div class="strong small" style="margin:4px 2px">Каналы</div>${renderChannels(channels)}`
          : emptyState('channel', 'Каналов не нашли', 'Попробуйте другой запрос');
        wireChannels(results);
      } catch (e) {
        results.innerHTML = emptyState('warn', 'Ошибка', e.message);
      }
      return;
    }
    if (!api.searchAll) {
      // Local mode without a server: do a best-effort client-side search
      // via searchUsers + searchChannels.
      results.innerHTML = '<div class="small muted center" style="padding:12px">Ищем...</div>';
      try {
        const out = { users: [], posts: [], groups: [], channels: [] };
        if (api.searchUsers) {
          const { users } = await api.searchUsers(q);
          out.users = users || [];
        }
        if (api.searchChannels) {
          const { channels } = await api.searchChannels(q);
          out.channels = channels || [];
        }
        renderUnified(out);
      } catch (e) {
        results.innerHTML = emptyState('warn', 'Ошибка', e.message);
      }
      return;
    }
    results.innerHTML = '<div class="small muted center" style="padding:12px">Ищем...</div>';
    try {
      const data = await api.searchAll(q);
      // Enrich with channels if the server didn't return them.
      if (!data.channels && api.searchChannels) {
        try {
          const { channels } = await api.searchChannels(q);
          data.channels = channels || [];
        } catch {}
      }
      renderUnified(data);
    } catch (e) { results.innerHTML = emptyState('warn', 'Ошибка', e.message); }
  };

  const renderUnified = (data) => {
    let html = '';
    const users = (data.users || []).filter(() => active === 'all' || active === 'people');
    const posts = (data.posts || []).filter(() => active === 'all' || active === 'posts');
    const groups = (data.groups || []).filter(() => active === 'all' || active === 'groups');
    const channels = (data.channels || []).filter(() => active === 'all' || active === 'channels');
    if (active === 'all' || active === 'people') {
      if (users.length) {
        html += '<div class="strong small" style="margin:4px 2px">Люди</div>';
        html += users.map((u) => `
          <div class="card list-item" style="padding:8px" data-user="${esc(u.username)}">
            ${avatar(u, 32)}
            <div class="grow" style="text-align:left"><div class="small strong">${esc(u.displayName)}</div><div class="tiny muted">@${esc(u.username)}</div></div>
          </div>
        `).join('');
      }
    }
    if (active === 'all' || active === 'posts') {
      if (posts.length) {
        html += '<div class="strong small" style="margin:8px 2px 4px">Посты</div>';
        html += posts.map((p) => `
          <div class="card" style="padding:10px;margin-bottom:4px" data-post="${p.id}">
            <div class="tiny muted">@${esc(p.author?.username || p.author || '')}</div>
            <div class="small" style="margin-top:4px;line-height:1.4">${esc((p.body || p.text || '').slice(0, 80))}${(p.body || p.text || '').length > 80 ? '...' : ''}</div>
          </div>
        `).join('');
      }
    }
    if (active === 'all' || active === 'groups') {
      if (groups.length) {
        html += '<div class="strong small" style="margin:8px 2px 4px">Группы</div>';
        html += groups.map((g) => `
          <div class="card list-item" style="padding:8px">
            <div style="width:32px;height:32px;border-radius:8px;background:var(--bg-3);display:flex;align-items:center;justify-content:center;font-weight:700">${esc(g.name[0]||'?')}</div>
            <div class="grow" style="text-align:left"><div class="small strong">${esc(g.name)}</div><div class="tiny muted">${g.members} участников</div></div>
          </div>
        `).join('');
      }
    }
    if (active === 'all' || active === 'channels') {
      if (channels.length) {
        html += '<div class="strong small" style="margin:8px 2px 4px">Каналы</div>';
        html += renderChannels(channels);
      }
    }
    if (!html) html = emptyState('search', 'Ничего не найдено', 'Попробуйте другой запрос');
    results.innerHTML = html;
    results.querySelectorAll('[data-user]').forEach((elNode) => {
      elNode.onclick = () => {
        import('./profile.js?v=20251028').then((m) => m.openProfile(elNode.dataset.user));
      };
    });
    wireChannels(results);
  };

  btn.onclick = search;
  query.onkeydown = (e) => { if (e.key === 'Enter') search(); };
  if (initialQuery.length >= 2) search();
  else query.focus();
  return sheet;
}
