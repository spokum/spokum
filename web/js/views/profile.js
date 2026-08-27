import { api, state, setUser, MOODS, moodStyle, isPremium } from '../store.js';
import { el, esc, timeAgo, plural, fullDate } from '../util.js';
import { icon } from '../icons.js';
import { avatar, badges, toast, openSheet, promptSheet, pickImage, emptyState, confirmSheet, hasStory, bannerStyle, bannerPins } from '../ui.js';
import { openStories, publishStory } from './stories.js';

function dayWordChip(user) {
  if (!user?.shareWord || !user.dayWord) return '';
  const fresh = Date.now() - (user.dayWordAt || 0) < 36 * 3600 * 1000;
  if (!fresh) return '';
  return `<div style="display:flex;justify-content:center;margin-top:8px"><span class="day-word">${icon('spark', 13)} ${esc(user.dayWord)}</span></div>`;
}

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
  setUser({ ...state.user, ...fresh });
  const days = Math.max(1, Math.round((Date.now() - fresh.createdAt) / 86400000));
  const mood = MOODS[fresh.mood] || MOODS.calm;

  body.innerHTML = `
    <div class="card profile-card appear">
      <div class="banner" style="${bannerStyle(fresh)}">
        <div class="banner-inner">${bannerPins(fresh)}</div>
        <button class="banner-edit" data-banner>${icon('image', 14)} Баннер</button>
      </div>
      <div class="profile-body" style="text-align:center">
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
      <div class="row" style="margin-top:8px;gap:8px">
        <button class="btn grow" data-safe>${icon('leaf', 17)} Тихие комнаты</button>
        <button class="btn grow" data-journal>${icon('edit', 17)} Дневник</button>
      </div>
      ${isPremium(fresh) ? `<div class="row" style="margin-top:8px;gap:8px">
        <button class="btn grow" data-story>${icon('play', 17)} Добавить историю</button>
        ${hasStory(fresh) ? `<button class="btn grow" data-my-story>${icon('eye', 17)} Моя история</button>` : ''}
      </div>
      <button class="btn" data-pins-edit style="width:100%;margin-top:8px">${icon('spark', 17)} Разместить пины</button>` : ''}
      </div>
    </div>

    <div class="col" style="margin-top:12px;gap:6px">
      ${fresh.isAdmin ? `<button class="card list-item" data-admin>${icon('chart', 20)}<div class="grow"><div class="strong small">Админ-панель</div><div class="tiny muted">Пользователи, аналитика, наказания</div></div>${icon('forward', 16)}</button>` : ''}
      ${fresh.isModerator ? `<button class="card list-item" data-mod>${icon('shield', 20)}<div class="grow"><div class="strong small">Панель модератора</div><div class="tiny muted">Модерация постов и жалобы</div></div>${icon('forward', 16)}</button>` : ''}
      <button class="card list-item" data-contacts>${icon('users', 20)}<div class="grow"><div class="strong small">Контакты</div><div class="tiny muted">Кого ты добавил</div></div>${icon('forward', 16)}</button>
      <button class="card list-item" data-logout style="color:#c98b8b">${icon('logout', 20)}<div class="grow" style="text-align:left"><div class="strong small">Выйти</div></div></button>
    </div>

    <div class="row between" style="margin:22px 2px 10px"><div class="strong small">Мои записи</div><div class="tiny muted">${plural(posts.length, 'запись', 'записи', 'записей')}</div></div>
    <div class="chips" data-kinds style="margin-bottom:10px"></div>
    <div class="col" data-posts></div>`;

  const list = body.querySelector('[data-posts]');
  const { postCard } = await import('./feed.js');
  mediaTabs(body.querySelector('[data-kinds]'), list, posts, postCard, () => render(root));

  const edit = () => openEditor(() => render(root));
  root.querySelector('[data-edit]').onclick = edit;
  body.querySelector('[data-edit-2]').onclick = edit;
  body.querySelector('[data-mood]').onclick = () => openMoodPicker(() => render(root));
  body.querySelector('[data-safe]').onclick = () => openZonePicker(() => render(root));
  body.querySelector('[data-journal]').onclick = async () => {
    const { openJournalHistory } = await import('./journal.js');
    openJournalHistory();
  };
  body.querySelector('[data-banner]').onclick = () => openBannerMenu(fresh, () => render(root));
  body.querySelector('[data-pins-edit]')?.addEventListener('click', () => openPinEditor(fresh, () => render(root)));
  body.querySelector('[data-story]')?.addEventListener('click', () => publishStory(() => render(root)));
  body.querySelector('[data-my-story]')?.addEventListener('click', () => openStories(fresh.id, () => render(root)));
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

async function openZonePicker(done) {
  const { MODES } = await import('./safe.js');
  const body = el(`<div class="col" style="gap:6px">${Object.entries(MODES)
    .map(([key, mode]) => `<button class="list-item" data-zone="${key}" style="${moodStyle(key)}">
      <span class="mood-tag" style="${moodStyle(key)}"><i class="mood-dot"></i>${esc(MOODS[key]?.label || key)}</span>
      <div class="grow"><div class="small strong">${esc(mode.title)}</div><div class="tiny muted">${esc(mode.note)}</div></div>
    </button>`)
    .join('')}</div>`);
  const sheet = openSheet('Куда зайти', body);
  body.querySelectorAll('[data-zone]').forEach((button) => {
    button.onclick = () => {
      sheet.close();
      enterSafeZone(button.dataset.zone, done);
    };
  });
}

function openBannerMenu(user, done) {
  const body = el(`
    <div class="col" style="gap:6px">
      <button class="list-item" data-pick>${icon('image', 18)}<span>Загрузить картинку</span></button>
      ${user.banner ? `<button class="list-item" data-clear style="color:#c98b8b">${icon('trash', 18)}<span>Убрать баннер</span></button>` : ''}
      <p class="tiny muted" style="margin:6px 4px 0">Баннер виден всем в вашем профиле. Лучше широкая картинка.</p>
    </div>`);
  const sheet = openSheet('Баннер профиля', body);

  const apply = async (banner) => {
    try {
      const { user: updated } = await api.updateMe({ banner });
      setUser(updated);
      sheet.close();
      toast(banner ? 'Баннер обновлён' : 'Баннер убран');
      done?.();
    } catch (error) {
      toast(error.message, 'err');
    }
  };

  body.querySelector('[data-pick]').onclick = async () => {
    const image = await pickImage(1400);
    if (image) apply(image);
  };
  body.querySelector('[data-clear]')?.addEventListener('click', () => apply(null));
}

function openPinEditor(user, done) {
  let pins = (Array.isArray(user.pins) ? user.pins : []).map((pin) => ({ ...pin }));

  const body = el(`
    <div class="col">
      <div class="banner" data-stage style="${bannerStyle(user)};border-radius:16px;overflow:hidden">
        <div class="banner-inner" data-layer></div>
        <div class="banner-hint">Перетаскивайте пины</div>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn grow" data-add>${icon('plus', 16)} Добавить пин</button>
        <button class="btn btn-sm btn-danger" data-clear>${icon('trash', 15)}</button>
      </div>
      <p class="tiny muted" style="margin:0">До четырёх пинов. Долгое нажатие на пин удаляет его.</p>
      <button class="btn btn-primary" data-save>Сохранить</button>
    </div>`);
  const sheet = openSheet('Пины на баннере', body);

  const stage = body.querySelector('[data-stage]');
  const layer = body.querySelector('[data-layer]');

  const draw = () => {
    layer.innerHTML = pins
      .map((pin, index) => `<img class="banner-pin draggable" data-index="${index}" src="${esc(pin.image)}" alt="" style="left:${pin.x}%;top:${pin.y}%">`)
      .join('');

    layer.querySelectorAll('[data-index]').forEach((node) => {
      const index = Number(node.dataset.index);
      let hold = null;
      let moved = false;

      const move = (event) => {
        moved = true;
        const rect = stage.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;
        pins[index].x = Math.min(94, Math.max(6, x));
        pins[index].y = Math.min(88, Math.max(12, y));
        node.style.left = `${pins[index].x}%`;
        node.style.top = `${pins[index].y}%`;
      };

      const release = (event) => {
        clearTimeout(hold);
        node.classList.remove('dragging');
        node.releasePointerCapture?.(event.pointerId);
        node.removeEventListener('pointermove', move);
      };

      node.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        moved = false;
        node.classList.add('dragging');
        node.setPointerCapture?.(event.pointerId);
        node.addEventListener('pointermove', move);
        hold = setTimeout(() => {
          if (moved) return;
          pins.splice(index, 1);
          draw();
        }, 650);
      });
      node.addEventListener('pointerup', release);
      node.addEventListener('pointercancel', release);
    });
  };

  body.querySelector('[data-add]').onclick = async () => {
    if (pins.length >= 4) return toast('Больше четырёх нельзя', 'err');
    const image = await pickImage(200);
    if (!image) return;
    pins.push({ image, x: 20 + pins.length * 18, y: 45 });
    draw();
  };

  body.querySelector('[data-clear]').onclick = () => {
    pins = [];
    draw();
  };

  body.querySelector('[data-save]').onclick = async () => {
    try {
      const { user: updated } = await api.updateMe({ pins });
      setUser(updated);
      sheet.close();
      toast('Пины сохранены');
      done?.();
    } catch (error) {
      toast(error.message, 'err');
    }
  };

  draw();
}

function openEditor(done) {
  const user = state.user;
  const body = el(`
    <div class="col">
      <div class="row">
        <div data-avatar>${avatar(user, 54)}</div>
        <div class="col grow" style="gap:6px">
          <button class="btn btn-sm" data-pick>${icon('image', 16)} Сменить фото</button>
          <button class="btn btn-sm btn-danger hidden" data-clear>${icon('trash', 15)} Убрать фото</button>
        </div>
      </div>
      <div><div class="tiny muted" style="margin-bottom:6px">Имя</div><input class="input" data-name maxlength="40" value="${esc(user.displayName)}"></div>
      <div><div class="tiny muted" style="margin-bottom:6px">О себе</div><textarea class="textarea" data-bio maxlength="300">${esc(user.bio || '')}</textarea></div>
      <div><div class="tiny muted" style="margin-bottom:6px">Цвет аватара</div><input type="range" min="0" max="360" value="${Number(user.hue) || 220}" data-hue style="width:100%"></div>
      ${isPremium(user) ? `
      <div class="divider"></div>
      <div class="row between"><span class="small strong">Статус возле ника</span>
        <div class="row" style="gap:6px">
          <div data-status-preview></div>
          <button class="btn btn-sm" data-status-pick>${icon('image', 15)} Выбрать</button>
        </div>
      </div>` : ''}
      <button class="btn btn-primary" data-save>Сохранить</button>
    </div>`);
  const sheet = openSheet('Редактировать профиль', body);
  let avatarData = user.avatar;
  let hue = Number(user.hue) || 220;
  const preview = body.querySelector('[data-avatar]');
  const clearButton = body.querySelector('[data-clear]');
  const redraw = () => {
    preview.innerHTML = avatar({ ...user, avatar: avatarData, hue }, 54);
    clearButton.classList.toggle('hidden', !avatarData);
  };
  redraw();
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
  clearButton.addEventListener('click', () => {
    avatarData = null;
    redraw();
  });

  let statusIcon = user.statusIcon || null;
  const statusPreview = body.querySelector('[data-status-preview]');

  const drawStatus = () => {
    if (!statusPreview) return;
    statusPreview.innerHTML = statusIcon
      ? `<img class="status-icon" style="width:26px;height:26px" src="${esc(statusIcon)}" alt="">`
      : `<span class="tiny muted">нет</span>`;
  };

  body.querySelector('[data-status-pick]')?.addEventListener('click', async () => {
    const image = await pickImage(120);
    if (image) {
      statusIcon = image;
      drawStatus();
    }
  });

  drawStatus();
  body.querySelector('[data-save]').onclick = async () => {
    try {
      const patch = {
        displayName: body.querySelector('[data-name]').value,
        bio: body.querySelector('[data-bio]').value,
        hue,
        avatar: avatarData
      };
      if (isPremium(user)) patch.statusIcon = statusIcon;
      const { user: updated } = await api.updateMe(patch);
      setUser(updated);
      sheet.close();
      toast('Профиль обновлён');
      done?.();
    } catch (error) {
      toast(error.message, 'err');
    }
  };
}

function mediaTabs(chips, list, posts, postCard, refresh) {
  const groups = [
    ['all', 'Всё', () => true],
    ['text', 'Записи', (post) => (post.kind || 'text') === 'text'],
    ['album', 'Альбомы', (post) => post.kind === 'album'],
    ['video', 'Видео', (post) => post.kind === 'video']
  ].filter(([key, , match]) => key === 'all' || posts.some(match));

  let active = 'all';
  const draw = () => {
    chips.innerHTML = groups
      .map(([key, label]) => `<button class="chip" data-kind="${key}" aria-pressed="${key === active}">${label}</button>`)
      .join('');
    chips.querySelectorAll('[data-kind]').forEach((chip) => {
      chip.onclick = () => {
        active = chip.dataset.kind;
        draw();
      };
    });
    const match = groups.find(([key]) => key === active)?.[2] || (() => true);
    const shown = posts.filter(match);
    list.innerHTML = '';
    if (!shown.length) {
      list.innerHTML = emptyState('leaf', 'Пока пусто', 'Здесь появятся записи');
      return;
    }
    shown.forEach((post) => list.appendChild(postCard(post, refresh)));
  };
  if (groups.length < 3) chips.style.display = 'none';
  draw();
}

export async function enterSafeZone(mood, done) {
  const { openSafeZone } = await import('./safe.js');
  openSafeZone(mood, (minutes) => {
    toast(`Вы побыли здесь ${minutes} мин`);
    done?.();
  });
}

function openMoodPicker(done) {
  const body = el(`<div class="col" style="gap:6px">${Object.entries(MOODS)
    .map(([key, m]) => `<button class="list-item" data-mood="${key}" style="${moodStyle(key)}"><span class="mood-tag" style="${moodStyle(key)}"><i class="mood-dot"></i>${esc(m.label)}</span></button>`)
    .join('')}</div>`);
  const sheet = openSheet('Настроение сейчас', body);
  body.querySelectorAll('[data-mood]').forEach((button) => {
    button.onclick = async () => {
      const mood = button.dataset.mood;
      sheet.close();

      const { HEAVY_MOODS } = await import('./safe.js');
      const heavy = HEAVY_MOODS.includes(mood);
      if (heavy) enterSafeZone(mood, done);

      api.updateMe({ mood })
        .then(({ user }) => {
          setUser(user);
          if (!heavy) {
            toast('Записал');
            done?.();
          }
        })
        .catch((error) => {
          if (!heavy) toast(error.message, 'err');
        });
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
      <div class="card profile-card">
        <div class="banner" style="${bannerStyle(user)}"><div class="banner-inner">${bannerPins(user)}</div></div>
        <div class="profile-body" style="text-align:center">
        <div style="display:flex;justify-content:center">${hasStory(user) ? `<button data-open-story style="display:contents">${avatar(user, 88)}</button>` : avatar(user, 88)}</div>
        <div class="row" style="justify-content:center;gap:6px;margin-top:14px">
          <span class="strong" style="font-size:19px">${esc(user.displayName)}</span>${badges(user)}
        </div>
        <div class="small muted">@${esc(user.username)}</div>
        ${dayWordChip(user)}
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
      </div>
      <div class="row between" style="margin:20px 2px 10px"><div class="strong small">Записи</div></div>
      <div class="chips" data-kinds style="margin-bottom:10px"></div>
      <div class="col" data-posts></div>`;

    const list = body.querySelector('[data-posts]');
    const { postCard } = await import('./feed.js');
    mediaTabs(body.querySelector('[data-kinds]'), list, posts, postCard, () => openProfile(username));

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
    if (hasStory(user)) {
      body.querySelector('[data-open-story]')?.addEventListener('click', () => openStories(user.id));
    }

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
