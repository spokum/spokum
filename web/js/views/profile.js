import { api, state, setUser, MOODS, moodStyle } from '../store.js';
import { el, esc, timeAgo, plural, fullDate } from '../util.js';
import { icon } from '../icons.js';
import { avatar, badges, toast, openSheet, promptSheet, pickImage, emptyState, confirmSheet } from '../ui.js';

export async function render(root) {
  const user = state.user;
  root.innerHTML = `
    <div class="topbar">
      <div><h1>Профиль</h1><p class="sub">Твоё пространство</p></div>
      <div class="spacer"></div>
      <button class="btn btn-icon" data-edit title="Редактировать">${icon('edit', 18)}</button>
    </div>
    <div data-body></div>`;

  const body = root.querySelector('[data-body]');
  if (!user) {
    body.innerHTML = emptyState('profile', 'Вы не вошли', 'Войдите, чтобы вести свой дневник настроения');
    return;
  }

  const { user: fresh, posts } = await api.getUser(user.username);
  const days = Math.max(1, Math.round((Date.now() - fresh.createdAt) / 86400000));
  const mood = MOODS[fresh.mood] || MOODS.calm;

  body.innerHTML = `
    <div class="card appear" style="text-align:center">
      <div style="display:flex;justify-content:center">${avatar(fresh, 88)}</div>
      <div class="row" style="justify-content:center;gap:6px;margin-top:14px">
        <span class="strong" style="font-size:20px">${esc(fresh.displayName)}</span>${badges(fresh)}
      </div>
      <div class="small muted" style="margin-top:2px">@${esc(fresh.username)}</div>
      ${fresh.bio ? `<p class="small" style="margin:12px 0 0;line-height:1.5">${esc(fresh.bio)}</p>` : ''}
      <div style="display:flex;justify-content:center;margin-top:12px">
        <span class="mood-tag" style="${moodStyle(fresh.mood)}"><i class="mood-dot"></i>${esc(mood.label)}</span>
      </div>
      <div class="stat-grid" style="margin-top:16px">
        <div class="stat"><div class="v">${fresh.posts}</div><div class="k">постов</div></div>
        <div class="stat"><div class="v">${fresh.likes}</div><div class="k">лайков собрано</div></div>
        <div class="stat"><div class="v">${days}</div><div class="k">${plural(days, 'день', 'дня', 'дней').split(' ')[1]} в СпокУм</div></div>
      </div>
      <div class="row" style="margin-top:14px;gap:8px">
        <button class="btn grow" data-edit-2>${icon('edit', 17)} Редактировать</button>
        <button class="btn grow" data-mood>${icon('wave', 17)} Настроение</button>
      </div>
    </div>

    <div class="col" style="margin-top:12px;gap:6px">
      ${fresh.isAdmin ? `<button class="card list-item" data-admin>${icon('chart', 20)}<div class="grow"><div class="strong small">Админ-панель</div><div class="tiny muted">Пользователи, аналитика, наказания</div></div>${icon('forward', 16)}</button>` : ''}
      ${fresh.isModerator ? `<button class="card list-item" data-mod>${icon('shield', 20)}<div class="grow"><div class="strong small">Панель модератора</div><div class="tiny muted">Модерация постов и жалобы</div></div>${icon('forward', 16)}</button>` : ''}
      <button class="card list-item" data-contacts>${icon('users', 20)}<div class="grow"><div class="strong small">Контакты</div><div class="tiny muted">Кого ты добавил</div></div>${icon('forward', 16)}</button>
      <button class="card list-item" data-logout style="color:#c98b8b">${icon('logout', 20)}<div class="grow" style="text-align:left"><div class="strong small">Выйти</div></div></button>
    </div>

    <div class="row between" style="margin:22px 2px 10px"><div class="strong small">Мои записи</div><div class="tiny muted">${plural(posts.length, 'запись', 'записи', 'записей')}</div></div>
    <div class="col" data-posts></div>`;

  const list = body.querySelector('[data-posts]');
  const { postCard } = await import('./feed.js');
  if (!posts.length) list.innerHTML = emptyState('leaf', 'Ещё нет записей', 'Первая запись обычно самая сложная');
  else posts.forEach((post) => list.appendChild(postCard(post, () => render(root))));

  const edit = () => openEditor(() => render(root));
  root.querySelector('[data-edit]').onclick = edit;
  body.querySelector('[data-edit-2]').onclick = edit;
  body.querySelector('[data-mood]').onclick = () => openMoodPicker(() => render(root));
  body.querySelector('[data-admin]')?.addEventListener('click', async () => {
    const { openAdmin } = await import('./admin.js');
    openAdmin();
  });
  body.querySelector('[data-mod]')?.addEventListener('click', async () => {
    const { openMod } = await import('./mod.js');
    openMod();
  });
  body.querySelector('[data-contacts]').onclick = openContacts;
  body.querySelector('[data-logout]').onclick = async () => {
    if (!(await confirmSheet({ title: 'Выйти из аккаунта', text: 'Сессия на этом устройстве закроется', confirm: 'Выйти', danger: true }))) return;
    await api.logout();
    setUser(null);
    location.reload();
  };
}

function openEditor(done) {
  const user = state.user;
  const body = el(`
    <div class="col">
      <div class="row">
        <div data-avatar>${avatar(user, 54)}</div>
        <button class="btn btn-sm" data-pick>${icon('camera', 16)} Сменить фото</button>
        ${user.avatar ? '<button class="btn btn-sm btn-ghost" data-clear>Убрать</button>' : ''}
      </div>
      <div><div class="tiny muted" style="margin-bottom:6px">Имя</div><input class="input" data-name maxlength="40" value="${esc(user.displayName)}"></div>
      <div><div class="tiny muted" style="margin-bottom:6px">О себе</div><textarea class="textarea" data-bio maxlength="300">${esc(user.bio || '')}</textarea></div>
      <div><div class="tiny muted" style="margin-bottom:6px">Цвет аватара</div><input type="range" min="0" max="360" value="${Number(user.hue) || 220}" data-hue style="width:100%"></div>
      <button class="btn btn-primary" data-save>Сохранить</button>
    </div>`);
  const sheet = openSheet('Редактировать профиль', body);
  let avatarData = user.avatar;
  let hue = Number(user.hue) || 220;
  const preview = body.querySelector('[data-avatar]');
  const redraw = () => {
    preview.innerHTML = avatar({ ...user, avatar: avatarData, hue }, 54);
  };
  body.querySelector('[data-hue]').oninput = (event) => {
    hue = Number(event.target.value);
    redraw();
  };
  body.querySelector('[data-pick]').onclick = async () => {
    const image = await pickImage(500);
    if (image) {
      avatarData = image;
      redraw();
    }
  };
  body.querySelector('[data-clear]')?.addEventListener('click', () => {
    avatarData = null;
    redraw();
  });
  body.querySelector('[data-save]').onclick = async () => {
    try {
      const { user: updated } = await api.updateMe({
        displayName: body.querySelector('[data-name]').value,
        bio: body.querySelector('[data-bio]').value,
        hue,
        avatar: avatarData
      });
      setUser(updated);
      sheet.close();
      toast('Профиль обновлён');
      done?.();
    } catch (error) {
      toast(error.message, 'err');
    }
  };
}

function openMoodPicker(done) {
  const body = el(`<div class="col" style="gap:6px">${Object.entries(MOODS)
    .map(([key, m]) => `<button class="list-item" data-mood="${key}" style="${moodStyle(key)}"><span class="mood-tag" style="${moodStyle(key)}"><i class="mood-dot"></i>${esc(m.label)}</span></button>`)
    .join('')}</div>`);
  const sheet = openSheet('Настроение сейчас', body);
  body.querySelectorAll('[data-mood]').forEach((button) => {
    button.onclick = async () => {
      const { user } = await api.updateMe({ mood: button.dataset.mood });
      setUser(user);
      sheet.close();
      toast('Записал');
      done?.();
    };
  });
}

async function openContacts() {
  const body = el('<div class="col" data-list style="gap:4px"></div>');
  const sheet = openSheet('Контакты', body);
  const { contacts } = await api.contacts();
  body.innerHTML = contacts.length
    ? contacts
        .map(
          (c) => `<div class="list-item">${avatar(c, 40)}<div class="grow"><div class="row" style="gap:6px"><span class="strong small">${esc(c.displayName)}</span>${badges(c)}</div><div class="tiny muted">@${esc(c.username)}</div></div><button class="btn btn-sm" data-open="${esc(c.username)}">Открыть</button></div>`
        )
        .join('')
    : emptyState('users', 'Контактов нет', 'Найди людей в разделе Чаты');
  body.querySelectorAll('[data-open]').forEach((button) => {
    button.onclick = () => {
      sheet.close();
      openProfile(button.dataset.open);
    };
  });
}

export async function openProfile(username) {
  if (state.user && username === state.user.username) {
    document.querySelector('[data-tab="profile"]')?.click();
    return;
  }
  const view = el('<div class="chat-view"><div class="chat-head"><button class="btn btn-icon btn-ghost" data-back></button><div class="grow"><div class="strong">Профиль</div></div></div><div class="chat-body" data-body style="display:block"></div></div>');
  view.querySelector('[data-back]').innerHTML = icon('back', 20);
  view.querySelector('[data-back]').onclick = () => view.remove();
  document.body.appendChild(view);
  const body = view.querySelector('[data-body]');
  body.innerHTML = '<div class="card" style="height:180px;opacity:.4"></div>';

  try {
    const { user, posts } = await api.getUser(username);
    const mood = MOODS[user.mood] || MOODS.calm;
    const days = Math.max(1, Math.round((Date.now() - user.createdAt) / 86400000));
    body.innerHTML = `
      <div class="card" style="text-align:center">
        <div style="display:flex;justify-content:center">${avatar(user, 88)}</div>
        <div class="row" style="justify-content:center;gap:6px;margin-top:14px">
          <span class="strong" style="font-size:19px">${esc(user.displayName)}</span>${badges(user)}
        </div>
        <div class="small muted">@${esc(user.username)}</div>
        ${user.bio ? `<p class="small" style="margin:12px 0 0;line-height:1.5">${esc(user.bio)}</p>` : ''}
        <div style="display:flex;justify-content:center;margin-top:12px"><span class="mood-tag" style="${moodStyle(user.mood)}"><i class="mood-dot"></i>${esc(mood.label)}</span></div>
        <div class="stat-grid" style="margin-top:16px">
          <div class="stat"><div class="v">${user.posts}</div><div class="k">постов</div></div>
          <div class="stat"><div class="v">${user.likes}</div><div class="k">лайков</div></div>
          <div class="stat"><div class="v">${days}</div><div class="k">дней здесь</div></div>
        </div>
        ${user.bannedUntil > Date.now() ? '<div class="pill bad" style="margin-top:12px">Заблокирован</div>' : ''}
        <div class="row" style="margin-top:14px;gap:8px">
          <button class="btn btn-primary grow" data-write>${icon('chats', 17)} Написать</button>
          <button class="btn grow" data-contact>${icon('add_user', 17)} В контакты</button>
          <button class="btn btn-icon" data-report>${icon('flag', 17)}</button>
        </div>
        <div class="tiny muted" style="margin-top:10px">В СпокУм с ${fullDate(user.createdAt).split(',')[0]}</div>
      </div>
      <div class="row between" style="margin:20px 2px 10px"><div class="strong small">Записи</div></div>
      <div class="col" data-posts></div>`;

    const list = body.querySelector('[data-posts]');
    const { postCard } = await import('./feed.js');
    if (!posts.length) list.innerHTML = emptyState('leaf', 'Записей нет', 'Здесь появятся посты');
    else posts.forEach((post) => list.appendChild(postCard(post, () => openProfile(username))));

    body.querySelector('[data-contact]').onclick = async () => {
      try {
        await api.addContact(user.id);
        toast('Добавлен в контакты');
      } catch (error) {
        toast(error.message, 'err');
      }
    };
    body.querySelector('[data-report]').onclick = async () => {
      const { openReport } = await import('./feed.js');
      openReport('user', user.id);
    };
    body.querySelector('[data-write]').onclick = async () => {
      try {
        const { chat } = await api.createChat({ kind: 'dm', members: [user.id] });
        view.remove();
        const { openChat } = await import('./chats.js');
        document.querySelector('[data-tab="chats"]')?.click();
        setTimeout(() => openChat(chat.id), 60);
      } catch (error) {
        toast(error.message, 'err');
      }
    };
  } catch (error) {
    body.innerHTML = emptyState('warn', 'Не открылось', error.message);
  }
}
