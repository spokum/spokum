import { api, state } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, emptyState } from '../ui.js';

const BETA_USER = 'silver';

export function isQuestsOpen() {
  return state.user?.username === BETA_USER;
}

function questCard(q) {
  const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
  return `
    <div class="card" style="padding:14px">
      <div class="row between" style="align-items:center;margin-bottom:10px">
        <div class="small strong">${esc(q.label)}</div>
        <span class="pill" style="background:var(--bg-3);font-size:11px;padding:3px 10px">+${q.reward}</span>
      </div>
      <div class="row" style="align-items:center;gap:12px">
        <div style="flex:1;height:8px;background:var(--bg-3);border-radius:4px;overflow:hidden;position:relative">
          <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-2));transition:width .3s;border-radius:4px"></div>
        </div>
        <span class="tiny muted" style="min-width:40px;text-align:right">${q.progress}/${q.target}</span>
        <button class="btn btn-sm ${q.claimed ? '' : (q.completed ? 'btn-primary' : '')}" data-quest="${q.id}" ${(!q.completed || q.claimed) ? 'disabled' : ''} style="padding:6px 12px;font-size:12px;min-width:70px">
          ${q.claimed ? 'Готово' : (q.completed ? 'Забрать' : 'В процессе')}
        </button>
      </div>
    </div>
  `;
}

export async function openQuests() {
  if (!isQuestsOpen()) { toast('Скоро для всех', 'err'); return; }
  const host = el('<div class="col" style="gap:10px"></div>');
  const sheet = openSheet('Задания', host, {});

  const draw = async () => {
    host.innerHTML = `<div class="card"><p class="muted center">Загрузка...</p></div>`;
    try {
      const [{ quests: daily, }, { quests: weekly }, challenge, level] = await Promise.all([
        api.myDailyQuests(),
        api.myWeeklyQuests(),
        api.todayChallenge(),
        api.myLevel()
      ]);

      let html = '';

      if (level && level.level) {
        const xpPct = Math.min(100, Math.round((level.xp / level.xpForNext) * 100));
        html += `
          <div class="card" style="background:linear-gradient(135deg,var(--bg-2),var(--bg-3));padding:14px">
            <div class="row between" style="align-items:center;margin-bottom:8px">
              <div class="row" style="gap:8px;align-items:center">
                <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-2));color:var(--accent-ink);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px">${level.level}</div>
                <div>
                  <div class="strong small">Уровень ${level.level}</div>
                  <div class="tiny muted">${level.xp} / ${level.xpForNext} XP</div>
                </div>
              </div>
              <div style="text-align:right">
                <div class="tiny muted">Стрик</div>
                <div class="strong" style="color:var(--accent)">${level.streak || 0} дн.</div>
              </div>
            </div>
            <div style="height:6px;background:var(--bg-1);border-radius:3px;overflow:hidden">
              <div style="width:${xpPct}%;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-2))"></div>
            </div>
          </div>
        `;
      }

      if (challenge && challenge.id) {
        const chPct = challenge.target > 0 ? Math.min(100, Math.round((challenge.progress / challenge.target) * 100)) : 0;
        const canComplete = challenge.progress >= challenge.target && !challenge.completed;
        html += `
          <div class="card" style="background:linear-gradient(135deg,rgba(184,230,201,.08),var(--bg-2));border:1px solid rgba(184,230,201,.2);padding:14px">
            <div class="row between" style="align-items:center;margin-bottom:8px">
              <div class="strong" style="font-size:15px">${esc(challenge.title)}</div>
              <span class="pill ok">+${challenge.reward}</span>
            </div>
            <p class="small muted" style="margin:0 0 10px;line-height:1.5">${esc(challenge.description)}</p>
            <div class="row" style="align-items:center;gap:10px;margin-bottom:10px">
              <div style="flex:1;height:6px;background:var(--bg-1);border-radius:3px;overflow:hidden">
                <div style="width:${chPct}%;height:100%;background:var(--accent)"></div>
              </div>
              <span class="tiny muted">${challenge.progress}/${challenge.target}</span>
            </div>
            <button class="btn ${challenge.completed ? '' : (canComplete ? 'btn-primary' : '')}" data-challenge ${(!canComplete || challenge.completed) ? 'disabled' : ''} style="width:100%">
              ${challenge.completed ? 'Выполнено' : (canComplete ? 'Забрать награду' : 'Выполните задания')}
            </button>
          </div>
        `;
      }

      html += `<div class="strong small" style="margin:8px 2px;color:var(--muted)">Ежедневные задания</div>`;
      if (daily && daily.length) {
        html += daily.map(questCard).join('');
      } else {
        html += emptyState('star', 'Нет заданий', 'Загляните завтра');
      }

      html += `<div class="strong small" style="margin:12px 2px 4px;color:var(--muted)">Еженедельные задания</div>`;
      if (weekly && weekly.length) {
        html += weekly.map(questCard).join('');
      } else {
        html += emptyState('star', 'Нет заданий', 'Загляните на следующей неделе');
      }

      host.innerHTML = html;

      host.querySelector('[data-challenge]')?.addEventListener('click', async () => {
        try {
          const r = await api.completeTodayChallenge();
          toast(`+${r.reward} монет за челлендж`, 'ok');
          draw();
        } catch (e) { toast(e.message, 'err'); }
      });

      host.querySelectorAll('[data-quest]').forEach((btn) => {
        btn.onclick = async () => {
          try {
            const r = await api.claimDailyQuest(Number(btn.dataset.quest));
            toast(`+${r.reward} монет`, 'ok');
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
