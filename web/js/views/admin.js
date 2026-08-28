import { api, state, setUser, MOODS, isPremium } from '../store.js';
import { el, esc, timeAgo, fullDate, debounce, plural } from '../util.js';
import { icon } from '../icons.js';
import { avatar, badges, toast, openSheet, confirmSheet, promptSheet, emptyState } from '../ui.js';
import { openProfile } from './profile.js';
import { RANKS } from '../store.js';

const TABS = [
  ['stats', 'Аналитика'],
  ['users', 'Люди'],
  ['team', 'Модераторы'],
  ['content', 'Контент'],
  ['announce', 'Эфир'],
  ['actions', 'Наказания'],
  ['audit', 'Журнал']
];

export async function openAdmin() {
  if (!state.user?.isAdmin) {
    try {
      const { user } = await api.me();
      if (user) setUser(user);
    } catch {}
  }
  if (!state.user?.isAdmin) return toast('Нет прав администратора. Если их только что выдали, обновите страницу', 'err');
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
      if (active === 'team') await drawTeam(body);
      if (active === 'content') await drawContent(body);
      if (active === 'announce') await drawAnnounce(body);
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

    <div class="row" style="gap:8px;margin-top:12px">
      <button class="btn grow" data-export>${icon('download', 16)} Выгрузить CSV</button>
      <button class="btn grow" data-copy-stats>${icon('share', 16)} Скопировать сводку</button>
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

  const summary = [
    `СпокУм, сводка на ${new Date().toLocaleString('ru-RU')}`,
    `Пользователей: ${stats.users}, онлайн: ${stats.online}, новых за сутки: ${stats.newToday}`,
    `Постов: ${stats.posts}, сообщений: ${stats.messages}, чатов: ${stats.chats}`,
    `Открытых жалоб: ${stats.reportsOpen}, в блокировке: ${stats.banned}, модераторов: ${stats.moderators}`
  ].join('\n');

  body.querySelector('[data-copy-stats]').onclick = () => {
    navigator.clipboard?.writeText(summary);
    toast('Сводка скопирована');
  };

  body.querySelector('[data-export]').onclick = async () => {
    try {
      const { users } = await api.adminUsers('');
      const rows = [['username', 'display_name', 'posts', 'likes', 'admin', 'moderator', 'verified', 'premium', 'banned', 'muted', 'last_seen']];
      for (const user of users) {
        rows.push([
          user.username,
          user.displayName,
          user.posts,
          user.likes,
          user.isAdmin ? 1 : 0,
          user.isModerator ? 1 : 0,
          user.isVerified ? 1 : 0,
          isPremium(user) ? 1 : 0,
          user.bannedUntil > Date.now() ? 1 : 0,
          user.mutedUntil > Date.now() ? 1 : 0,
          new Date(user.lastSeen || 0).toISOString()
        ]);
      }
      const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
      link.download = `spokum-users-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 4000);
      toast('Файл готов');
    } catch (error) {
      toast(error.message, 'err');
    }
  };
}

async function drawContent(body) {
  body.innerHTML = `
    <div class="chips" data-kinds style="margin-bottom:12px">
      <button class="chip" data-kind="" aria-pressed="true">Всё</button>
      <button class="chip" data-kind="video" aria-pressed="false">Видео</button>
      <button class="chip" data-kind="feed" aria-pressed="false">Лента</button>
    </div>
    <div class="col" data-list style="gap:8px"></div>`;

  const list = body.querySelector('[data-list]');
  const load = async (kind) => {
    list.innerHTML = '<div class="card" style="height:90px;opacity:.3"></div>';
    const { posts } = await api.listPosts({ kind: kind || undefined, limit: 30 });
    if (!posts.length) {
      list.innerHTML = emptyState('feed', 'Пусто', 'Записей ещё нет');
      return;
    }
    list.innerHTML = posts
      .map(
        (post) => `<div class="card" style="padding:12px" data-post="${post.id}">
          <div class="row" style="gap:8px">${avatar(post.author, 36)}
            <div class="grow" style="min-width:0">
              <div class="small strong truncate">${esc(post.author.displayName)}</div>
              <div class="tiny muted">@${esc(post.author.username)} · ${timeAgo(post.createdAt)} · ${plural(post.likes, 'лайк', 'лайка', 'лайков')}</div>
            </div>
            ${post.kind === 'video' ? `<span class="pill">видео</span>` : post.kind === 'album' ? '<span class="pill">альбом</span>' : ''}
          </div>
          ${post.text ? `<div class="small" style="margin-top:8px;line-height:1.45">${esc(post.text.slice(0, 180))}</div>` : ''}
          <div class="row" style="margin-top:10px;gap:8px">
            <button class="btn btn-sm grow" data-open="${esc(post.author.username)}">${icon('profile', 15)} Автор</button>
            <button class="btn btn-sm btn-danger grow" data-drop="${post.id}">${icon('trash', 15)} Удалить</button>
          </div>
        </div>`
      )
      .join('');
    list.querySelectorAll('[data-open]').forEach((button) => {
      button.onclick = () => openProfile(button.dataset.open);
    });
    list.querySelectorAll('[data-drop]').forEach((button) => {
      button.onclick = async () => {
        if (!(await confirmSheet({ title: 'Удалить запись', text: 'Запись исчезнет навсегда', confirm: 'Удалить', danger: true }))) return;
        try {
          await api.deletePost(Number(button.dataset.drop) || button.dataset.drop);
          toast('Удалено');
          load(kind);
        } catch (error) {
          toast(error.message, 'err');
        }
      };
    });
  };

  body.querySelectorAll('[data-kind]').forEach((chip) => {
    chip.onclick = () => {
      body.querySelectorAll('[data-kind]').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      load(chip.dataset.kind);
    };
  });
  await load('');
}

async function drawAnnounce(body) {
  const { announcements } = await api.listAnnouncements();
  body.innerHTML = `
    <div class="card appear">
      <div class="row" style="margin-bottom:10px">${icon('megaphone', 18)}<span class="strong small">Объявление в ленте</span></div>
      <input class="input" data-title placeholder="Заголовок" maxlength="80">
      <textarea class="textarea" data-body placeholder="Текст объявления" maxlength="600" style="margin-top:10px"></textarea>
      <div class="row" style="gap:8px;margin-top:10px">
        <select class="select grow" data-tone>
          <option value="info">Обычное</option>
          <option value="warn">Важное</option>
          <option value="bad">Тревожное</option>
        </select>
        <select class="select grow" data-days>
          <option value="1">1 день</option>
          <option value="3">3 дня</option>
          <option value="7" selected>Неделя</option>
          <option value="30">Месяц</option>
        </select>
      </div>
      <button class="btn btn-primary" data-send style="margin-top:12px">${icon('send', 16)} Опубликовать</button>
    </div>
    <div class="col" data-live style="gap:8px;margin-top:12px">
      ${announcements.length
        ? announcements
            .map(
              (row) => `<div class="card announce tone-${esc(row.tone)}" style="margin:0">
                <div class="row" style="align-items:flex-start;gap:10px">${icon('megaphone', 18)}
                <div class="grow"><div class="strong small">${esc(row.title)}</div>
                <div class="tiny muted" style="margin-top:4px;line-height:1.5">${esc(row.body)}</div>
                <div class="tiny muted" style="margin-top:6px">до ${esc(fullDate(row.until))}</div></div>
                <button class="btn btn-icon btn-ghost" data-drop="${row.id}">${icon('trash', 16)}</button></div>
              </div>`
            )
            .join('')
        : emptyState('megaphone', 'Эфир пуст', 'Объявления появятся здесь')}
    </div>`;

  body.querySelector('[data-send]').onclick = async () => {
    const title = body.querySelector('[data-title]').value.trim();
    const text = body.querySelector('[data-body]').value.trim();
    if (!title || !text) return toast('Заполните заголовок и текст', 'err');
    try {
      await api.createAnnouncement({
        title,
        body: text,
        tone: body.querySelector('[data-tone]').value,
        days: Number(body.querySelector('[data-days]').value)
      });
      toast('Объявление в эфире');
      drawAnnounce(body);
    } catch (error) {
      toast(error.message, 'err');
    }
  };

  body.querySelectorAll('[data-drop]').forEach((button) => {
    button.onclick = async () => {
      try {
        await api.deleteAnnouncement(Number(button.dataset.drop));
        toast('Снято с эфира');
        drawAnnounce(body);
      } catch (error) {
        toast(error.message, 'err');
      }
    };
  });
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
        <div class="tiny muted">@${esc(user.username)}${user.strikes ? ` · предупреждений ${user.strikes}/3` : ''}</div>
        ${isPremium(user) ? `<div class="pill warn" style="margin-top:4px;display:inline-block">Премиум до ${esc(new Date(user.premiumUntil).toLocaleDateString('ru-RU'))}</div>` : ''}</div></div>
      <button class="list-item" data-info>${icon('device', 18)}<span>Информация: устройства и страна</span></button>
      <button class="list-item" data-open>${icon('profile', 18)}<span>Открыть профиль</span></button>
      <button class="list-item" data-write>${icon('chats', 18)}<span>Написать сообщение</span></button>
      <button class="list-item" data-copy-id>${icon('share', 18)}<span>Скопировать ID</span></button>
      <div class="divider" style="margin:6px 0"></div>
      <button class="list-item" data-flag="isVerified">${icon('verified', 18)}<span>${user.isVerified ? 'Снять галочку' : 'Выдать галочку'}</span></button>
      <button class="list-item" data-flag="isModerator">${icon('shield', 18)}<span>${user.isModerator ? 'Снять щит модератора' : 'Выдать щит модератора'}</span></button>
      <button class="list-item" data-flag="isDeveloper">${icon('hammer', 18)}<span>${user.isDeveloper ? 'Снять молоток' : 'Выдать молоток разработчика'}</span></button>
      <button class="list-item" data-flag="isAdmin">${icon('star', 18)}<span>${user.isAdmin ? 'Снять админку' : 'Выдать админку'}</span></button>
      <button class="list-item" data-clear>${icon('close', 18)}<span>Снять все статусы</span></button>
      <div class="divider" style="margin:6px 0"></div>
      <button class="list-item" data-beta>${icon('spark', 18)}<span>${user.isBeta ? 'Убрать из беты' : 'Пустить в бету'}</span></button>
      <button class="list-item" data-coins>${icon('coin', 18)}<span>Начислить монеты (сейчас ${user.coins || 0})</span></button>
      <div class="divider" style="margin:6px 0"></div>
      <button class="list-item" data-premium style="color:#c6b083">${icon('crown', 18)}<span>Выдать СпокУм Премиум</span></button>
      ${isPremium(user) ? `<button class="list-item" data-premium-off>${icon('close', 18)}<span>Забрать премиум</span></button>` : ''}
      <div class="divider" style="margin:6px 0"></div>
      <button class="list-item" data-rename>${icon('edit', 18)}<span>Сменить отображаемое имя</span></button>
      <button class="list-item" data-look>${icon('image', 18)}<span>Сбросить оформление</span></button>
      <button class="list-item" data-wipe style="color:#c98b8b">${icon('trash', 18)}<span>Удалить все записи</span></button>
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

  body.querySelector('[data-beta]').onclick = async () => {
    try {
      await api.setBeta(user.id, !user.isBeta);
      sheet.close();
      toast(user.isBeta ? 'Убран из беты' : 'Пущен в бету');
      refresh();
    } catch (error) {
      toast(error.message, 'err');
    }
  };

  body.querySelector('[data-coins]').onclick = async () => {
    const value = await promptSheet({ title: 'Монеты', label: 'Сколько начислить, можно минус', placeholder: '100', value: '100' });
    if (!value) return;
    const amount = Number(value);
    if (!Number.isFinite(amount) || !amount) return toast('Нужно число', 'err');
    try {
      const result = await api.giveCoins(user.id, Math.round(amount));
      sheet.close();
      toast(`Теперь монет: ${result.coins}`);
      refresh();
    } catch (error) {
      toast(error.message, 'err');
    }
  };

  body.querySelector('[data-info]').onclick = async () => {
    sheet.close();
    const { openUserInfo } = await import('./userinfo.js');
    openUserInfo(user.id);
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

  body.querySelector('[data-premium]').onclick = async () => {
    sheet.close();
    const days = await pickPremiumDays();
    if (days == null) return;
    const reason = await promptSheet({
      title: 'За что премиум',
      label: 'Причину увидит пользователь',
      placeholder: 'Например: за помощь новичкам',
      multiline: true
    });
    if (!reason) return;
    try {
      const { until } = await api.grantPremium(user.id, days, reason);
      toast(`Премиум выдан до ${new Date(until).toLocaleDateString('ru-RU')}`);
      refresh();
    } catch (error) {
      toast(error.message, 'err');
    }
  };

  body.querySelector('[data-premium-off]')?.addEventListener('click', async () => {
    sheet.close();
    if (!(await confirmSheet({ title: 'Забрать премиум', text: `${user.displayName} потеряет все привилегии`, confirm: 'Забрать', danger: true }))) return;
    try {
      await api.revokePremium(user.id);
      toast('Премиум забран');
      refresh();
    } catch (error) {
      toast(error.message, 'err');
    }
  });

  body.querySelector('[data-copy-id]').onclick = () => {
    navigator.clipboard?.writeText(String(user.id));
    toast('ID скопирован');
  };

  body.querySelector('[data-write]').onclick = async () => {
    sheet.close();
    try {
      const { chat } = await api.createChat({ kind: 'dm', members: [user.id] });
      const { openChat } = await import('./chats.js');
      openChat(chat.id);
    } catch (error) {
      toast(error.message, 'err');
    }
  };

  body.querySelector('[data-rename]').onclick = async () => {
    sheet.close();
    const name = await promptSheet({ title: 'Новое имя', label: 'Видно всем', value: user.displayName, placeholder: 'Имя' });
    if (!name) return;
    try {
      await api.renameUser(user.id, name);
      toast('Имя обновлено');
      refresh();
    } catch (error) {
      toast(error.message, 'err');
    }
  };

  body.querySelector('[data-look]').onclick = async () => {
    sheet.close();
    if (!(await confirmSheet({ title: 'Сбросить оформление', text: 'Аватар, баннер, пины, статус и описание будут очищены', confirm: 'Сбросить', danger: true }))) return;
    try {
      await api.resetLook(user.id);
      toast('Оформление сброшено');
      refresh();
    } catch (error) {
      toast(error.message, 'err');
    }
  };

  body.querySelector('[data-wipe]').onclick = async () => {
    sheet.close();
    if (!(await confirmSheet({ title: 'Удалить все записи', text: `Все посты и видео ${user.displayName} исчезнут навсегда`, confirm: 'Удалить', danger: true }))) return;
    try {
      const { removed } = await api.wipePosts(user.id);
      toast(`Удалено записей: ${removed}`);
      refresh();
    } catch (error) {
      toast(error.message, 'err');
    }
  };

  body.querySelector('[data-mute]').onclick = () => restrict('mute', user.mutedUntil > Date.now() ? 'unmute' : null);
  body.querySelector('[data-ban]').onclick = () => restrict('ban', user.bannedUntil > Date.now() ? 'unban' : null);
}

export function pickPremiumDays() {
  return new Promise((done) => {
    const options = [
      [1, '1 день'],
      [2, '2 дня'],
      [3, '3 дня'],
      [7, 'Неделя'],
      [14, '2 недели'],
      [30, 'Месяц'],
      [90, '3 месяца'],
      [180, 'Полгода'],
      [365, 'Год']
    ];
    const body = el(`<div class="col" style="gap:6px">
      <p class="tiny muted" style="margin:0 4px 4px">Если премиум уже есть, срок прибавится к текущему</p>
      ${options.map(([value, label]) => `<button class="list-item" data-value="${value}">${icon('crown', 18)}<span>${label}</span></button>`).join('')}
    </div>`);
    const sheet = openSheet('На сколько выдать премиум', body, { onClose: () => done(null) });
    body.querySelectorAll('[data-value]').forEach((button) => {
      button.onclick = () => {
        done(Number(button.dataset.value));
        document.body.style.overflow = '';
        sheet.sheet.parentElement.remove();
      };
    });
  });
}

async function drawTeam(body) {
  const { team } = await api.modTeam();
  if (!team.length) {
    body.innerHTML = emptyState('shield', 'Модераторов нет', 'Выдайте щит на вкладке «Люди»');
    return;
  }

  body.innerHTML = `
    <p class="tiny muted" style="margin:0 0 12px;line-height:1.5">Звание видно всем на профиле модератора. «Заслуживает» считается по разобранным жалобам, снятым записям и наказаниям; два и больше предупреждений сбрасывают предложение до стажёра. Начальника модераторов назначает только админ, автоматически это звание не предлагается.</p>
    <div class="col" data-list style="gap:8px"></div>`;

  const list = body.querySelector('[data-list]');
  team.forEach((mod) => {
    const grown = mod.deserved > mod.rank;
    const card = el(`<div class="card team-card" style="padding:14px">
      <div class="team-head">
        ${avatar(mod, 38)}
        <span class="strong small">${esc(mod.displayName)}</span>
        <span class="tiny muted">@${esc(mod.username)}</span>
        <span class="rank-pill">${icon('shield', 13)}<span>${esc(mod.rankName)}</span></span>
        ${mod.isAdmin ? '<span class="pill">админ</span>' : ''}
        ${grown ? `<span class="rank-pill up">${icon('spark', 13)}<span>заслуживает: ${esc(RANKS[mod.deserved])}</span></span>` : ''}
        ${mod.strikes ? `<span class="pill bad">${mod.strikes} предупр.</span>` : ''}
      </div>
      <div class="info-grid" style="margin-top:13px">
        <div><span class="tiny muted">Жалоб разобрано</span><span class="small strong">${mod.reports}</span></div>
        <div><span class="tiny muted">Записей снято</span><span class="small strong">${mod.removals}</span></div>
        <div><span class="tiny muted">Наказаний</span><span class="small strong">${mod.punishments}</span></div>
        <div><span class="tiny muted">За 30 дней</span><span class="small strong">${mod.recent}</span></div>
      </div>
      <div class="row" style="gap:8px;margin-top:10px">
        <button class="btn btn-sm grow" data-rank>${icon('crown', 15)} Звание</button>
        <button class="btn btn-sm grow" data-open>${icon('profile', 15)} Профиль</button>
      </div>
    </div>`);

    card.querySelector('[data-open]').onclick = () => openProfile(mod.username);
    card.querySelector('[data-rank]').onclick = () => openRankPicker(mod, () => drawTeam(body));
    list.appendChild(card);
  });
}

function openRankPicker(mod, done) {
  const body = el(`<div class="col" style="gap:6px">
    <p class="tiny muted" style="margin:0 0 6px;line-height:1.5">Сейчас: ${esc(mod.rankName)}. По работе заслуживает: ${esc(RANKS[mod.deserved])}.</p>
    ${RANKS.map(
      (label, index) => `<button class="list-item" data-rank="${index}" ${index === mod.rank ? 'style="color:var(--accent)"' : ''}>${icon('shield', 18)}<span class="grow" style="text-align:left">${label}</span>${
        index === mod.deserved ? '<span class="rule-pun">по работе</span>' : ''
      }</button>`
    ).join('')}
  </div>`);
  const sheet = openSheet('Звание модератора', body);
  body.querySelectorAll('[data-rank]').forEach((button) => {
    button.onclick = async () => {
      try {
        const result = await api.setRank(mod.id, Number(button.dataset.rank));
        toast('Теперь ' + (result?.rankName || 'звание изменено'));
        sheet.close();
        done();
      } catch (error) {
        toast(error.message, 'err');
      }
    };
  });
}

export function pickDuration(suggested) {
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
      .map(
        ([value, label]) => `<button class="list-item" data-value="${value}">${icon('clock', 18)}<span class="grow" style="text-align:left">${label}</span>${
          value === suggested ? '<span class="rule-pun">по правилам</span>' : ''
        }</button>`
      )
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
