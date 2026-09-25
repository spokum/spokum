import { api, state } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, emptyState } from '../ui.js';

const BETA_USER = 'silver';

export function isQuestsOpen() {
  return state.user?.username === BETA_USER;
}

export async function openQuests() {
  if (!isQuestsOpen()) { toast('Скоро для всех', 'err'); return; }
  const host = el('<div class="col" style="gap:10px"></div>');
  const sheet = openSheet('Задания дня', host, {});

  const draw = async () => {
    host.innerHTML = `<div class="card"><p class="muted center">Загрузка...</p></div>`;
    try {
      const [{ quests }, challenge] = await Promise.all([
        api.myDailyQuests(),
        api.todayChallenge()
      ]);

      let html = '';

      if (challenge && challenge.id) {
        const challengeDone = challenge.completed;
        html += `
          <div class="card" style="background:linear-gradient(135deg,var(--bg-2),var(--bg-3));padding:14px">
            <div class="row" style="gap:8px;align-items:center;margin-bottom:6px">
              ${icon('star', 18)}
              <div class="strong small">Челлендж дня</div>
              <span class="pill" style="margin-left:auto;background:var(--accent);color:var(--accent-ink);font-size:11px;padding:2px 8px">+${challenge.reward} монет</span>
            </div>
            <div class="strong" style="margin:6px 0">${esc(challenge.title)}</div>
            <p class="small muted" style="margin:0 0 10px;line-height:1.5">${esc(challenge.description)}</p>
            <button class="btn ${challengeDone ? '' : 'btn-primary'}" data-challenge ${challengeDone ? 'disabled' : ''} style="width:100%">
              ${challengeDone ? icon('check', 16) + ' Выполнено' : 'Отметить выполнение'}
            </button>
          </div>
        `;
      }

      html += `<div class="strong small" style="margin:4px 2px">Ежедневные задания</div>`;
      if (!quests.length) {
        html += emptyState('star', 'Заданий сегодня нет', 'Загляните позже');
      } else {
        html += quests.map((q) => {
          const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
          return `
            <div class="card" style="padding:12px">
              <div class="row between" style="align-items:center;margin-bottom:8px">
                <div class="small strong">${esc(q.label)}</div>
                <span class="pill" style="background:var(--bg-2);font-size:11px;padding:2px 8px">+${q.reward}</span>
              </div>
              <div class="row between" style="align-items:center;gap:10px">
                <div style="flex:1;height:6px;background:var(--bg-2);border-radius:3px;overflow:hidden">
                  <div style="width:${pct}%;height:100%;background:var(--accent);transition:width .3s"></div>
                </div>
                <span class="tiny muted">${q.progress}/${q.target}</span>
                <button class="btn btn-sm ${q.claimed ? '' : (q.completed ? 'btn-primary' : '')}" data-quest="${q.id}" ${(!q.completed || q.claimed) ? 'disabled' : ''} style="padding:4px 10px;font-size:12px">
                  ${q.claimed ? '✓' : (q.completed ? 'Забрать' : '...')}
                </button>
              </div>
            </div>
          `;
        }).join('');
      }

      host.innerHTML = html;

      host.querySelector('[data-challenge]')?.addEventListener('click', async () => {
        try {
          const r = await api.completeTodayChallenge();
          toast(`+${r.reward} монет за челлендж!`, 'ok');
          draw();
        } catch (e) { toast(e.message, 'err'); }
      });

      host.querySelectorAll('[data-quest]').forEach((btn) => {
        btn.onclick = async () => {
          try {
            const r = await api.claimDailyQuest(Number(btn.dataset.quest));
            toast(`+${r.reward} монет!`, 'ok');
            draw();
          } catch (e) { toast(e.message, 'err'); }
        };
      });
    } catch (e) {
      host.innerHTML = emptyState('warn', 'Ошибка', e.message);
    }
  };

  await draw();
  return sheet;
}
