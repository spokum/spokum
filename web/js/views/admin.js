import { api, state, MOODS } from '../store.js';
import { el, esc, timeAgo, fullDate, debounce, plural } from '../util.js';
import { icon } from '../icons.js';
import { avatar, badges, toast, openSheet, confirmSheet, promptSheet, emptyState } from '../ui.js';
import { openProfile } from './profile.js';

const TABS = [
  ['stats', 'Аналитика'],
  ['users', 'Люди'],
  ['actions', 'Наказания'],
  ['audit', 'Журнал']
];

export function openAdmin() {
  if (!state.user?.isAdmin) return toast('Только для админов', 'err');
  const view = el(`
    <div class="chat-view">
      <div class="chat-head">
        <button class="btn btn-icon btn-ghost" data-back>${icon('back', 20)}</button>
        <div class="grow"><div class="strong small">Админ-панель</div><div class="tiny muted">Полный доступ</div></div>
        ${icon('chart', 20)}
      </div>
      <div style="padding:12px 14px 0"><div class="tabs" data-tabs></div></div>
      <div class="chat-body" data-body style="display:block"></div>
    </div>`);
  document.body.appendChild(view);
  view.querySelector('[data-back]').onclick = () => view.remove();

  const tabs = view.querySelector('[data-tabs]');
  const body = view.querySelector('[data-body]');
  let active = 'stats';

  const drawTabs = () => {
    tabs.innerHTML = TABS.map(([key, label]) => `<button class="tab ${key === active ? 'active' : ''}" data-tab="${key}">${label}</button>`).join('');
    tabs.querySelectorAll('[data-tab]').forEach((button) => {
      button.onclick = () => {
        active = button.dataset.tab;
        drawTabs();
        draw();
      };
    });
  };

  const draw = async () => {
    body.innerHTML = '<div class="card" style="height:140px;opacity:.35"></div>';
    try {
      if (active === 'stats') await drawStats(body);
      if (active === 'users') await drawUsers(body);
      if (active === 'actions') await drawActions(body);
      if (active === 'audit') await drawAudit(body);
    } catch (error) {
      body.innerHTML = emptyState('warn', 'Ошибка', error.message);
    }
  };

  drawTabs();
  draw();
}

async function drawStats(body) {
  const { stats } = await api.adminStats();
  const maxDaily = Math.max(1, ...stats.daily.map((d) => d.posts + d.messages));
  const totalMoods = Math.max(1, stats.moods.reduce((sum, m) => sum + m.n, 0));
  body.innerHTML = `
    <div class="stat-grid appear">
      <div class="stat"><div class="v">${stats.users}</div><div class="k">пользователей</div></div>
      <div class="stat"><div class="v">${stats.online}</div><div class="k">сейчас онлайн</div></div>
      <div class="stat"><div class="v">${stats.newToday}</div><div class="k">новых за сутки</div></div>
      <div class="stat"><div class="v">${stats.posts}</div><div class="k">постов</div></div>
      <div class="stat"><div class="v">${stats.messages}</div><div class="k">сообщений</div></div>
      <div class="stat"><div class="v">${stats.chats}</div><div class="k">чатов</div></div>
      <div class="stat"><div class="v">${stats.reportsOpen}</div><div class="k">открытых жалоб</div></div>
      <div class="stat"><div class="v">${stats.banned}</div><div class="k">в блокировке</div></div>
      <div class="stat"><div class="v">${stats.moderators}</div><div class="k">модераторов</div></div>
    </div>

    <div class="card appear" style="margin-top:12px">
      <div class="row between" style="margin-bottom:14px"><span class="strong small">Активность за неделю</span><span class="tiny muted">посты и сообщения</span></div>
      <div class="bars">
        ${stats.daily
          .map(
            (d) => `<div class="b" title="${esc(d.day)}"><i style="height:${((d.posts + d.messages) / maxDaily) * 100}%"></i><span>${esc(String(d.day).slice(0, 3))}</span></div>`
          )
          .join('')}
      </div>
    </div>

    <div class="card appear" style="margin-top:12px">
      <div class="strong small" style="margin-bottom:12px">Настроение сети</div>
      <div class="col" style="gap:10px">
        ${stats.moods.length
          ? stats.moods
              .map(
                (m) => `<div><div class="row between tiny" style="margin-bottom:4px"><span>${esc(MOODS[m.mood]?.label || m.mood)}</span><span class="muted">${m.n}</span></div>
                  <div class="meter"><i style="width:${(m.n / totalMoods) * 100}%;background:${MOODS[m.mood]?.ink || 'var(--accent)'}"></i></div></div>`
              )
              .join('')
          : '<div class="small muted">Нет данных</div>'}
      </div>
    </div>`;
}

async function drawUsers(body) {
  body.innerHTML = `
    <div style="position:relative;margin-bottom:12px">
      <input class="input" data-search placeholder="Поиск по имени или @юзернейму" style="padding-left:42px">
      <div style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--muted)">${icon('search', 18)}</div>
    </div>
    <div class="col" data-list style="gap:4px"></div>`;

  const list = body.querySelector('[data-list]');
  const load = async (query) => {
    const { users } = await api.adminUsers(query);
    list.innerHTML = users
      .map(
        (u) => `<div class="card list-item" style="padding:10px" data-user="${u.id}">
          ${avatar(u, 46)}
          <div class="grow" style="min-width:0">
            <div class="row" style="gap:6px"><span class="strong small truncate">${esc(u.displayName)}</span>${badges(u)}</div>
            <div class="tiny muted truncate">@${esc(u.username)} · ${timeAgo(u.lastSeen)}</div>
            <div class="pill-row" style="margin-top:6px">
              ${u.isAdmin ? '<span class="pill good">админ</span>' : ''}
              ${u.isModerator ? `<span class="pill">модератор${u.strikes ? ` · ${u.strikes}/3` : ''}</span>` : ''}
              ${u.bannedUntil > Date.now() ? '<span class="pill bad">бан</span>' : ''}
              ${u.mutedUntil > Date.now() ? '<span class="pill warn">мут</span>' : ''}
              <span class="pill">${plural(u.posts, 'пост', 'поста', 'постов')}</span>
              <span class="pill">${plural(u.likes, 'лайк', 'лайка', 'лайков')}</span>
            </div>
          </div>
          ${icon('more', 18)}
        </div>`
      )
      .join('') || emptyState('users', 'Никого нет', 'Попробуйте другой запрос');
    list.querySelectorAll('[data-user]').forEach((node) => {
      node.onclick = () => {
        const user = users.find((u) => String(u.id) === node.dataset.user);
        openUserActions(user, () => load(body.querySelector('[data-search]').value.trim()));
      };
    });
  };

  body.querySelector('[data-search]').addEventListener('input', debounce((event) => load(event.target.value.trim()), 260));
  await load('');
}

function openUserActions(user, refresh) {
  const body = el(`
    <div class="col" style="gap:6px">
      <div class="row" style="padding:0 4px 8px">${avatar(user, 46)}
        <div class="grow"><div class="row" style="gap:6px"><span class="strong">${esc(user.displayName)}</span>${badges(user)}</div>
        <div class="tiny muted">@${esc(user.username)}${user.strikes ? ` · предупреждений ${user.strikes}/3` : ''}</div></div></div>
      <button class="list-item" data-open>${icon('profile', 18)}<span>Открыть профиль</span></button>
      <div class="divider" style="margin:6px 0"></div>
      <button class="list-item" data-flag="isVerified">${icon('verified', 18)}<span>${user.isVerified ? 'Снять галочку' : 'Выдать галочку'}</span></button>
      <button class="list-item" data-flag="isModerator">${icon('shield', 18)}<span>${user.isModerator ? 'Снять щит модератора' : 'Выдать щит модератора'}</span></button>
      <button class="list-item" data-flag="isDeveloper">${icon('hammer', 18)}<span>${user.isDeveloper ? 'Снять молоток' : 'Выдать молоток разработчика'}</span></button>
      <button class="list-item" data-flag="isAdmin">${icon('star', 18)}<span>${user.isAdmin ? 'Снять админку' : 'Выдать админку'}</span></button>
      <button class="list-item" data-clear>${icon('close', 18)}<span>Снять все статусы</span></button>
      <div class="divider" style="margin:6px 0"></div>
      <button class="list-item" data-mute style="color:#c6b083">${icon('mute', 18)}<span>${user.mutedUntil > Date.now() ? 'Снять мут' : 'Замутить'}</span></button>
      <button class="list-item" data-ban style="color:#c98b8b">${icon('ban', 18)}<span>${user.bannedUntil > Date.now() ? 'Разблокировать' : 'Заблокировать'}</span></button>
    </div>`);
  const sheet = openSheet('', body);

  const flags = async (payload) => {
    try {
      await api.setFlags(user.id, payload);
      sheet.close();
      toast('Статусы обновлены');
      refresh();
    } catch (error) {
      toast(error.message, 'err');
    }
  };

  body.querySelector('[data-open]').onclick = () => {
    sheet.close();
    openProfile(user.username);
  };
  body.querySelectorAll('[data-flag]').forEach((button) => {
    button.onclick = () => {
      const key = button.dataset.flag;
      flags({ [key]: !user[key] });
    };
  });
  body.querySelector('[data-clear]').onclick = async () => {
    if (!(await confirmSheet({ title: 'Снять все статусы', text: `${user.displayName} потеряет галочку, щит, молоток и админку`, confirm: 'Снять', danger: true }))) return;
    flags({ clearAll: true });
  };

  const restrict = async (action, undo) => {
    if (undo) {
      try {
        await api.setState(user.id, { action: undo, minutes: 0, reason: '' });
        sheet.close();
        toast('Ограничение снято');
        refresh();
      } catch (error) {
        toast(error.message, 'err');
      }
      return;
    }
    sheet.close();
    const reason = await promptSheet({ title: action === 'ban' ? 'Блокировка' : 'Мут', label: 'Причина', placeholder: 'Что случилось', multiline: true });
    if (!reason) return;
    const minutes = await pickDuration();
    if (minutes == null) return;
    try {
      await api.setState(user.id, { action, minutes, reason });
      toast(action === 'ban' ? 'Пользователь заблокирован' : 'Пользователь в муте');
      refresh();
    } catch (error) {
      toast(error.message, 'err');
    }
  };

  body.querySelector('[data-mute]').onclick = () => restrict('mute', user.mutedUntil > Date.now() ? 'unmute' : null);
  body.querySelector('[data-ban]').onclick = () => restrict('ban', user.bannedUntil > Date.now() ? 'unban' : null);
}

export function pickDuration() {
  return new Promise((done) => {
    const options = [
      [60, '1 час'],
      [360, '6 часов'],
      [1440, 'Сутки'],
      [10080, 'Неделя'],
      [43200, 'Месяц'],
      [525600, 'Год']
    ];
    const body = el(`<div class="col" style="gap:6px">${options
      .map(([value, label]) => `<button class="list-item" data-value="${value}">${icon('clock', 18)}<span>${label}</span></button>`)
      .join('')}</div>`);
    const sheet = openSheet('На сколько', body, { onClose: () => done(null) });
    body.querySelectorAll('[data-value]').forEach((button) => {
      button.onclick = () => {
        done(Number(button.dataset.value));
        document.body.style.overflow = '';
        sheet.sheet.parentElement.remove();
      };
    });
  });
}

async function drawActions(body) {
  const { actions } = await api.adminActions();
  if (!actions.length) {
    body.innerHTML = emptyState('shield', 'Пока чисто', 'Модераторы ещё ничего не делали');
    return;
  }
  const label = {
    post_removed: 'снял пост',
    warn: 'вынес предупреждение',
    mute: 'замутил',
    ban: 'заблокировал',
    unban: 'разблокировал',
    unmute: 'снял мут'
  };
  body.innerHTML = `<div class="col" style="gap:8px">${actions
    .map(
      (a) => `<div class="card" style="padding:14px">
        <div class="row" style="gap:8px">
          ${avatar(a.actor, 40)}
          <div class="grow" style="min-width:0">
            <div class="small"><span class="strong">${esc(a.actor?.displayName || 'система')}</span> ${label[a.kind] || a.kind} <span class="strong">${esc(a.target?.displayName || '')}</span></div>
            <div class="tiny muted">${timeAgo(a.createdAt)}${a.minutes ? ` · ${a.minutes} мин` : ''}</div>
          </div>
          ${a.reverted ? '<span class="pill good">отменено</span>' : ''}
        </div>
        <div class="small" style="margin-top:8px;line-height:1.45">${esc(a.reason || 'без причины')}</div>
        ${a.reverted ? '' : `<div class="row" style="margin-top:10px;gap:8px">
          <button class="btn btn-sm grow" data-revert="${a.id}">${icon('restore', 15)} Отменить</button>
          <button class="btn btn-sm btn-danger grow" data-strike="${a.id}">${icon('warn', 15)} Отменить и предупредить</button>
        </div>`}
      </div>`
    )
    .join('')}</div>`;

  const run = async (id, strike) => {
    if (strike) {
      const reason = await promptSheet({ title: 'Предупреждение модератору', label: 'За что', placeholder: 'Снял безобидный пост', multiline: true });
      if (!reason) return;
      const { strikes } = await api.revertAction(Number(id), { strike: true, reason });
      toast(strikes >= 3 ? 'Третье предупреждение: щит снят' : `Предупреждение ${strikes} из 3`);
    } else {
      await api.revertAction(Number(id), {});
      toast('Действие отменено, пост возвращён');
    }
    drawActions(body);
  };

  body.querySelectorAll('[data-revert]').forEach((button) => {
    button.onclick = () => run(button.dataset.revert, false).catch((error) => toast(error.message, 'err'));
  });
  body.querySelectorAll('[data-strike]').forEach((button) => {
    button.onclick = () => run(button.dataset.strike, true).catch((error) => toast(error.message, 'err'));
  });
}

async function drawAudit(body) {
  const { entries } = await api.adminAudit();
  if (!entries.length) {
    body.innerHTML = emptyState('compass', 'Журнал пуст', 'Здесь появятся все действия');
    return;
  }
  body.innerHTML = `<div class="card"><div class="col" style="gap:2px">${entries
    .map(
      (entry) => `<div class="list-item" style="padding:9px 6px">
        ${avatar(entry.actor, 40)}
        <div class="grow" style="min-width:0">
          <div class="small strong truncate">${esc(entry.action)}</div>
          <div class="tiny muted truncate">${esc(entry.actor?.username ? `@${entry.actor.username}` : 'система')} · ${fullDate(entry.createdAt)}</div>
        </div>
      </div>`
    )
    .join('')}</div></div>`;
}
