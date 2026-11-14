import { api, state } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { avatar, toast, openSheet, emptyState } from '../ui.js';

async function mount(host) {
  host.innerHTML = `<div class="card"><p class="muted center">Загрузка...</p></div>`;
  try {
    const { tournaments } = await api.activeTournaments();
    if (!tournaments.length) {
      host.innerHTML = emptyState('trophy', 'Нет активных турниров', 'Скоро начнётся новый');
      return;
    }
    const html = await Promise.all(tournaments.map(async (t) => {
      const { leaderboard } = await api.tournamentLeaderboard(t.id);
      const ends = new Date(t.endsAt);
      const hoursLeft = Math.max(0, Math.round((ends - Date.now()) / 3600000));
      const daysLeft = Math.floor(hoursLeft / 24);
      const timeLeft = daysLeft > 0 ? `${daysLeft} дн ${hoursLeft % 24} ч` : `${hoursLeft} ч`;
      const prizes = [t.prize1, t.prize2, t.prize3];
      const places = ['1 место', '2 место', '3 место'];
      return `
        <div class="card" style="margin:8px 0;padding:16px">
          <div class="row between" style="align-items:flex-start;margin-bottom:12px">
            <div>
              <div class="strong" style="font-size:17px;letter-spacing:-0.02em">${esc(t.title)}</div>
              <div class="tiny muted" style="margin-top:4px">Игра: ${esc(t.gameId)}</div>
              <div class="tiny" style="margin-top:2px;color:var(--accent)">Осталось: ${timeLeft}</div>
            </div>
            <span class="pill ok">Активен</span>
          </div>
          <div class="row" style="gap:8px;margin-bottom:14px">
            ${prizes.map((p, i) => `<div class="card" style="flex:1;text-align:center;padding:12px;background:var(--bg-1);border:1px solid var(--line)"><div class="tiny muted" style="margin-bottom:4px">${places[i]}</div><div class="strong" style="color:var(--accent);font-size:20px">${p}</div><div class="tiny muted">монет</div></div>`).join('')}
          </div>
          ${leaderboard.length ? `
            <div class="strong small" style="margin:10px 2px 6px;color:var(--muted)">Топ-${Math.min(10, leaderboard.length)}</div>
            ${leaderboard.slice(0, 10).map((row, i) => `
              <div class="row" style="align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--line)">
                <span class="strong" style="width:28px;text-align:center;color:${i < 3 ? 'var(--accent)' : 'var(--muted)'}">${i + 1}</span>
                ${avatar(row, 32)}
                <div class="grow" style="min-width:0">
                  <div class="small strong truncate">${esc(row.displayName || row.username)}</div>
                  <div class="tiny muted">@${esc(row.username)}</div>
                </div>
                <span class="strong" style="color:var(--accent)">${row.score}</span>
              </div>
            `).join('')}
          ` : `<div class="small muted center" style="padding:16px">Пока нет результатов. Сыграй первым и займи вершину</div>`}
        </div>
      `;
    }));
    host.innerHTML = html.join('');
  } catch (e) {
    host.innerHTML = emptyState('warn', 'Ошибка', e.message);
  }
}

export async function openTournaments() {
  const host = el('<div class="col"></div>');
  const sheet = openSheet('Турниры', host, {});
  await mount(host);
  return sheet;
}

export async function render(root) {
  await mount(root);
}
