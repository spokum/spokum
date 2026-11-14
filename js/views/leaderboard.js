import { api, state } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, avatar, emptyState } from '../ui.js';

export async function openLeaderboard() {
  const host = el('<div class="col" style="gap:8px"></div>');
  const sheet = openSheet('Топ по уровням', host, {});
  host.innerHTML = `<div class="card"><p class="muted center">Загрузка...</p></div>`;
  try {
    const { leaderboard } = await api.levelLeaderboard();
    if (!leaderboard.length) {
      host.innerHTML = emptyState('trophy', 'Пока пусто', 'Играйте и пишите посты чтобы подняться');
      return;
    }
    host.innerHTML = leaderboard.map((u, i) => `
      <div class="card list-item" style="padding:10px;${i < 3 ? 'border-color:var(--accent)' : ''}">
        <span class="strong" style="width:28px;text-align:center;color:${i < 3 ? 'var(--accent)' : 'var(--muted)'}">${i + 1}</span>
        ${avatar(u, 36)}
        <div class="grow" style="text-align:left">
          <div class="small strong">${esc(u.displayName || u.username)}</div>
          <div class="tiny muted">@${esc(u.username)} · ${u.streak || 0} дн. стрик</div>
        </div>
        <div style="text-align:right">
          <div class="strong" style="color:var(--accent)">Ур. ${u.level}</div>
          <div class="tiny muted">${u.xp} XP</div>
        </div>
      </div>
    `).join('');
  } catch (e) { host.innerHTML = emptyState('warn', 'Ошибка', e.message); }
  return sheet;
}

export async function openEvents() {
  const host = el('<div class="col" style="gap:8px"></div>');
  const sheet = openSheet('Сезонные ивенты', host, {});
  host.innerHTML = `<div class="card"><p class="muted center">Загрузка...</p></div>`;
  try {
    const { events } = await api.activeEvents();
    if (!events.length) {
      host.innerHTML = emptyState('star', 'Нет активных ивентов', 'Скоро начнётся новый');
      return;
    }
    host.innerHTML = events.map((e) => {
      const pct = e.target > 0 ? Math.min(100, Math.round((e.progress / e.target) * 100)) : 0;
      const ends = new Date(e.endsAt);
      const daysLeft = Math.max(0, Math.round((ends - Date.now()) / 86400000));
      return `
        <div class="card" style="padding:14px">
          <div class="row between" style="align-items:flex-start;margin-bottom:8px">
            <div><div class="strong">${esc(e.name)}</div><div class="tiny muted" style="margin-top:2px">${esc(e.description)}</div></div>
            <span class="pill ok">${daysLeft} дн.</span>
          </div>
          <div class="row" style="align-items:center;gap:10px">
            <div style="flex:1;height:8px;background:var(--bg-3);border-radius:4px;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--accent)"></div></div>
            <span class="tiny muted">${e.progress}/${e.target}</span>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) { host.innerHTML = emptyState('warn', 'Ошибка', e.message); }
  return sheet;
}
