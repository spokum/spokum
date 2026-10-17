import { api, state } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, emptyState } from '../ui.js';

export async function openGroups() {
  const host = el('<div class="col" style="gap:10px"></div>');
  const sheet = openSheet('Группы', host, {});
  const draw = async () => {
    host.innerHTML = `<div class="card"><p class="muted center">Загрузка...</p></div>`;
    try {
      const { groups } = await api.listGroups();
      let html = `<button class="btn btn-primary" data-create style="width:100%">Создать группу</button>`;
      if (!groups.length) {
        html += emptyState('users', 'Пока нет групп', 'Создайте первую');
      } else {
        html += groups.map((g) => `
          <div class="card list-item" style="padding:12px">
            <div style="width:40px;height:40px;border-radius:10px;background:hsl(${g.hue},30%,25%);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px">${esc(g.name[0] || '?')}</div>
            <div class="grow" style="text-align:left">
              <div class="strong small">${esc(g.name)}</div>
              <div class="tiny muted">${g.members} участников</div>
            </div>
            <button class="btn btn-sm ${g.joined ? '' : 'btn-primary'}" data-group="${g.id}" data-joined="${g.joined}">${g.joined ? 'Вы тут' : 'Вступить'}</button>
          </div>
        `).join('');
      }
      host.innerHTML = html;
      host.querySelector('[data-create]')?.addEventListener('click', async () => {
        const name = await import('../ui.js').then(m => m.promptSheet({ title: 'Новая группа', label: 'Название', placeholder: 'Например: Любители кофе', confirm: 'Создать' }));
        if (!name) return;
        try { await api.createGroup(name); toast('Группа создана'); draw(); }
        catch (e) { toast(e.message, 'err'); }
      });
      host.querySelectorAll('[data-group]').forEach((btn) => {
        btn.onclick = async () => {
          const id = Number(btn.dataset.group);
          try {
            if (btn.dataset.joined === 'true') { await api.leaveGroup(id); toast('Вы вышли'); }
            else { await api.joinGroup(id); toast('Вы вступили'); }
            draw();
          } catch (e) { toast(e.message, 'err'); }
        };
      });
    } catch (e) { host.innerHTML = emptyState('warn', 'Ошибка', e.message); }
  };
  await draw();
  return sheet;
}
