import { api, state, setUser } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, avatar, emptyState } from '../ui.js';

export async function openWidgets() {
  const host = el('<div class="col" style="gap:10px"></div>');
  const sheet = openSheet('Дашборд', host, {});
  host.innerHTML = `<div class="card"><p class="muted center">Загрузка...</p></div>`;
  try {
    const [level, challenge, quote, canSpin, { tournaments }] = await Promise.all([
      api.myLevel(),
      api.todayChallenge(),
      api.todayQuote(),
      api.canSpinToday(),
      api.activeTournaments()
    ]);

    let html = '';

    if (level && level.level) {
      const xpPct = Math.min(100, Math.round((level.xp / level.xpForNext) * 100));
      html += `
        <div class="card" style="padding:14px;background:linear-gradient(135deg,var(--bg-2),var(--bg-3))">
          <div class="row between" style="align-items:center;margin-bottom:8px">
            <div class="row" style="gap:10px;align-items:center">
              <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-2));color:var(--accent-ink);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px">${level.level}</div>
              <div>
                <div class="strong small">Уровень ${level.level}</div>
                <div class="tiny muted">${level.xp} / ${level.xpForNext} XP</div>
              </div>
            </div>
            <div style="text-align:right">
              <div class="tiny muted">Стрик</div>
              <div class="strong" style="color:var(--accent);font-size:18px">${level.streak || 0}</div>
            </div>
          </div>
          <div style="height:8px;background:var(--bg-1);border-radius:4px;overflow:hidden">
            <div style="width:${xpPct}%;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-2));border-radius:4px"></div>
          </div>
        </div>
      `;
    }

    html += `<div class="row" style="gap:8px">`;
    if (canSpin?.can) {
      html += `<button class="btn btn-primary grow" data-wheel>${icon('star', 16)} Колесо фортуны</button>`;
    } else {
      html += `<button class="btn grow" disabled>Колесо: уже крутили</button>`;
    }
    if (challenge && !challenge.completed) {
      html += `<button class="btn grow" data-quests>${icon('star', 16)} Задания</button>`;
    }
    html += `</div>`;

    if (challenge && challenge.id) {
      const chPct = challenge.target > 0 ? Math.min(100, Math.round((challenge.progress / challenge.target) * 100)) : 0;
      html += `
        <div class="card" style="padding:12px">
          <div class="row between" style="align-items:center;margin-bottom:6px">
            <div class="strong small">${esc(challenge.title)}</div>
            <span class="pill ok">+${challenge.reward}</span>
          </div>
          <div style="height:5px;background:var(--bg-3);border-radius:3px;overflow:hidden;margin-bottom:4px">
            <div style="width:${chPct}%;height:100%;background:var(--accent)"></div>
          </div>
          <div class="tiny muted">${challenge.progress}/${challenge.target}</div>
        </div>
      `;
    }

    if (tournaments && tournaments.length) {
      const t = tournaments[0];
      const ends = new Date(t.endsAt);
      const hoursLeft = Math.max(0, Math.round((ends - Date.now()) / 3600000));
      html += `
        <div class="card" style="padding:12px;border-color:rgba(184,230,201,.2)">
          <div class="row between" style="align-items:center">
            <div>
              <div class="strong small">${esc(t.title)}</div>
              <div class="tiny muted">Приз: ${t.prize1} монет · осталось ${hoursLeft}ч</div>
            </div>
            <button class="btn btn-sm btn-primary" data-tour>${icon('trophy', 14)}</button>
          </div>
        </div>
      `;
    }

    if (quote && quote.text) {
      html += `
        <div class="card" style="padding:14px;background:linear-gradient(135deg,var(--bg-2),var(--bg-3));border:1px solid var(--line)">
          <div class="row" style="gap:8px;align-items:flex-start">
            ${icon('spark', 16)}
            <div>
              <div class="tiny muted" style="margin-bottom:4px">Цитата дня</div>
              <div class="small" style="line-height:1.5;font-style:italic">${esc(quote.text)}</div>
              ${quote.author ? `<div class="tiny muted" style="margin-top:4px">- ${esc(quote.author)}</div>` : ''}
            </div>
          </div>
        </div>
      `;
    }

    host.innerHTML = html || emptyState('chart', 'Нет данных', 'Зайдите позже');

    host.querySelector('[data-wheel]')?.addEventListener('click', async () => {
      sheet.close();
      const { openWheel } = await import('./wheel.js');
      openWheel();
    });
    host.querySelector('[data-quests]')?.addEventListener('click', async () => {
      sheet.close();
      const { openQuests } = await import('./quests.js');
      openQuests();
    });
    host.querySelector('[data-tour]')?.addEventListener('click', async () => {
      sheet.close();
      const { openTournaments } = await import('./tournaments.js');
      openTournaments();
    });
  } catch (e) { host.innerHTML = emptyState('warn', 'Ошибка', e.message); }
  return sheet;
}
