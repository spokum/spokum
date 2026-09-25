import { api, state } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { avatar, toast, openSheet, emptyState } from '../ui.js';

const BETA_USER = 'silver';

export function isTournamentsOpen() {
  return state.user?.username === BETA_USER;
}

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
      const prizes = [t.prize1, t.prize2, t.prize3];
      const medals = ['🥇', '🥈', '🥉'];
      return `
        <div class="card" style="margin:8px 0;padding:14px">
          <div class="row between" style="align-items:flex-start;margin-bottom:8px">
            <div>
              <div class="strong" style="font-size:16px">${esc(t.title)}</div>
              <div class="tiny muted" style="margin-top:2px">Игра: ${esc(t.gameId)} · осталось ${hoursLeft}ч</div>
            </div>
            <span class="pill" style="background:var(--accent);color:var(--accent-ink);font-size:11px;padding:3px 10px">Активен</span>
          </div>
          <div class="row" style="gap:8px;margin-bottom:10px">
            ${prizes.map((p, i) => `<div class="card" style="flex:1;text-align:center;padding:8px;background:var(--bg-2)"><div style="font-size:18px">${medals[i]}</div><div class="strong small" style="color:var(--accent)">${p}</div><div class="tiny muted">монет</div></div>`).join('')}
          </div>
          ${leaderboard.length ? `
            <div class="strong small" style="margin:8px 2px">Лидеры</div>
            ${leaderboard.slice(0, 10).map((row, i) => `
              <div class="row" style="align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)">
                <span class="strong muted" style="width:24px">${i + 1}</span>
                ${avatar(row, 28)}
                <div class="grow">
                  <div class="small strong truncate">${esc(row.displayName || row.username)}</div>
                  <div class="tiny muted">@${esc(row.username)}</div>
                </div>
                <span class="strong">${row.score}</span>
              </div>
            `).join('')}
          ` : `<div class="small muted center" style="padding:12px">Пока нет результатов. Сыграй первым!</div>`}
        </div>
      `;
    }));
    host.innerHTML = html.join('');
  } catch (e) {
    host.innerHTML = emptyState('warn', 'Ошибка', e.message);
  }
}

export async function openTournaments() {
  if (!isTournamentsOpen()) { toast('Скоро для всех', 'err'); return; }
  const host = el('<div class="col"></div>');
  const sheet = openSheet('Турниры', host, {});
  await mount(host);
  return sheet;
}

export async function render(root) {
  if (!isTournamentsOpen()) {
    root.innerHTML = `<div class="card"><p class="muted center">Скоро для всех</p></div>`;
    return;
  }
  await mount(root);
}
