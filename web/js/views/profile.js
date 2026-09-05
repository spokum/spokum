import { api, state, setUser, MOODS, moodStyle, isPremium, rankName } from '../store.js';
import { el, esc, plural, fullDate } from '../util.js';
import { icon } from '../icons.js';
import { avatar, badges, toast, openSheet, pickImage, emptyState, confirmSheet, hasStory, bannerStyle, bannerPins } from '../ui.js';
import { openStories, publishStory } from './stories.js';



function moodCanvas(user, data) {
  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = 640 * scale;
  canvas.height = 800 * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const hue = Number(user.hue) || 200;
  const sky = ctx.createLinearGradient(0, 0, 640, 800);
  sky.addColorStop(0, `hsl(${hue} 38% 16%)`);
  sky.addColorStop(1, `hsl(${(hue + 40) % 360} 34% 9%)`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 640, 800);

  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `hsla(${(hue + i * 9) % 360}, 60%, 70%, .07)`;
    ctx.beginPath();
    ctx.arc(40 + ((i * 97) % 560), 90 + ((i * 173) % 640), 30 + ((i * 37) % 90), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.font = '700 40px Inter, system-ui, sans-serif';
  ctx.fillText('Моя неделя', 54, 120);

  ctx.font = '500 21px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  ctx.fillText('@' + (user.username || ''), 54, 158);

  const rows = [
    ['Настроение', (MOODS[user.mood] || MOODS.calm).label],
    ['Записей', String(data.posts ?? 0)],
    ['Лайков собрано', String(data.likes ?? 0)],
    ['Ответов написано', String(data.answers ?? 0)],
    ['Полоса дней', String(data.streak ?? 0)]
  ];
  rows.forEach(([label, value], index) => {
    const y = 250 + index * 84;
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    ctx.beginPath();
    ctx.roundRect(54, y - 40, 532, 64, 18);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.62)';
    ctx.font = '500 20px Inter, system-ui, sans-serif';
    ctx.fillText(label, 78, y);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 24px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(value, 562, y);
    ctx.textAlign = 'left';
  });

  if (user.dayWord) {
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.font = 'italic 500 22px Inter, system-ui, sans-serif';
    ctx.fillText('«' + String(user.dayWord).slice(0, 40) + '»', 54, 700);
  }

  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.font = '600 20px Inter, system-ui, sans-serif';
  ctx.fillText('СпокУм', 54, 752);
  return canvas;
}

async function openMoodCard(user) {
  const body = el('<div class="col"><div class="card" style="height:220px;opacity:.35"></div></div>');
  const sheet = openSheet('Открытка настроения', body);
  let data = {};
  try {
    data = api.monthRecap ? await api.monthRecap() : {};
  } catch {}
  const canvas = moodCanvas(user, data);
  const url = canvas.toDataURL('image/png');
  body.innerHTML = `<div class="col">
    <div class="post-image"><img src="${url}" alt="Открытка"></div>
    <button class="btn btn-primary" data-share>${icon('share', 17)} Поделиться</button>
    <button class="btn" data-save>${icon('download', 17)} Сохранить картинку</button>
    <p class="tiny muted" style="margin:0;line-height:1.5">Открытку можно отправить в чат или сохранить и выложить куда угодно.</p>
  </div>`;
  body.querySelector('[data-share]').onclick = async () => {
    try {
      const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'));
      const file = new File([blob], 'spokum.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Моя неделя в СпокУме' });
        return;
      }
    } catch {}
    toast('Телефон не умеет делиться картинкой, сохраните её');
  };
  body.querySelector('[data-save]').onclick = () => {
    const link = document.createElement('a');
    link.href = url;
    link.download = 'spokum-nedelya.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast('Открытка сохранена');
  };
  void sheet;
}

async function openAppeals() {
  if (!api.myAppeals) return toast('Споры появятся, когда база будет обновлена', 'err');
  const body = el('<div class="col"><div class="card" style="height:120px;opacity:.35"></div></div>');
  const sheet = openSheet('Мои споры', body);
  let rows = [];
  let punishments = [];
  try {
    const answer = await api.myAppeals();
    rows = answer.appeals || [];
    const mine = api.myPunishments ? await api.myPunishments() : { punishments: [] };
    punishments = (mine.punishments || []).filter((row) => !row.reverted);
  } catch (error) {
    body.innerHTML = emptyState('warn', 'Не загрузилось', error.message);
    return;
  }
  const known = new Set(rows.map((row) => row.punishment));
  const KINDS = { mute: 'Мут', ban: 'Блокировка', warn: 'Предупреждение', comment_removed: 'Снятый комментарий' };
  const STATUS = { open: 'на рассмотрении', accepted: 'наказание снято', kept: 'решение оставлено' };

  body.innerHTML = `<div class="col">
    <p class="small" style="margin:0;line-height:1.55">Если наказание кажется несправедливым, напишите об этом. Спор посмотрит админ, а не тот, кто наказал.</p>
    ${punishments.filter((row) => !known.has(row.id)).length
      ? `<div class="tiny muted">Можно оспорить</div>${punishments
          .filter((row) => !known.has(row.id))
          .map((row) => `<button class="list-item" data-new="${row.id}">${icon('warn', 17)}
            <span class="grow" style="text-align:left"><span class="small strong">${esc(KINDS[row.kind] || row.kind)}</span>
            <span class="tiny muted"> ${esc(row.reason || 'без причины')}</span></span>${icon('forward', 15)}</button>`)
          .join('')}`
      : ''}
    ${rows.length
      ? `<div class="divider"></div><div class="tiny muted">Отправленные</div>${rows
          .map((row) => `<div class="card" style="padding:12px">
            <div class="row between"><span class="small strong">${esc(KINDS[row.kind] || row.kind)}</span>
            <span class="pill ${row.status === 'accepted' ? 'good' : row.status === 'kept' ? 'bad' : 'warn'}">${esc(STATUS[row.status] || row.status)}</span></div>
            <div class="tiny muted" style="margin-top:6px;line-height:1.5">${esc(row.body)}</div>
            ${row.answer ? `<div class="small" style="margin-top:8px;line-height:1.5">Ответ: ${esc(row.answer)}</div>` : ''}
          </div>`)
          .join('')}`
      : '<div class="tiny muted">Споров пока нет</div>'}
  </div>`;

  body.querySelectorAll('[data-new]').forEach((button) => {
    button.onclick = async () => {
      const { promptSheet } = await import('../ui.js');
      const text = await promptSheet({
        title: 'Спор о наказании',
        label: 'Расскажите, что произошло на самом деле',
        placeholder: 'Хотя бы пара предложений',
        multiline: true,
        confirm: 'Отправить'
      });
      if (!text) return;
      try {
        await api.appealSend(Number(button.dataset.new), text);
        sheet.close();
        toast('Спор отправлен, ответ придёт уведомлением');
      } catch (error) {
        toast(error.message, 'err');
      }
    };
  });
}


const SHELF_KINDS = [
  ['music', 'Музыка', 'volume'],
  ['book', 'Книга', 'feed'],
  ['film', 'Фильм', 'video'],
  ['place', 'Место', 'compass']
];

export function drawShelf(host, user, mine, done) {
  const slot = host.querySelector('[data-likes]');
  if (!slot) return;
  const rows = Array.isArray(user.shelf) ? user.shelf : [];
  if (!rows.length && !mine) {
    slot.innerHTML = '';
    return;
  }
  slot.innerHTML = `<div class="shelf-box">
    <div class="row between" style="margin-bottom:8px">
      <span class="tiny muted">Любимое</span>
      ${mine ? `<button class="btn btn-sm btn-ghost" data-shelf-edit>${icon('edit', 14)} Изменить</button>` : ''}
    </div>
    ${rows.length
      ? `<div class="chips">${rows
          .map((row) => {
            const kind = SHELF_KINDS.find((item) => item[0] === row.kind) || SHELF_KINDS[0];
            return `<span class="chip">${icon(kind[2], 13)} ${esc(String(row.title || '').slice(0, 40))}</span>`;
          })
          .join('')}</div>`
      : '<div class="tiny muted">Пока пусто. Расскажите, что любите слушать, читать и смотреть</div>'}
  </div>`;
  slot.querySelector('[data-shelf-edit]')?.addEventListener('click', () => openShelfEditor(user, done));
}

function openShelfEditor(user, done) {
  let rows = Array.isArray(user.shelf) ? [...user.shelf] : [];
  const body = el(`<div class="col">
    <p class="small" style="margin:0;line-height:1.55">Любимая музыка, книги, фильмы и места. До двенадцати штук, видно всем, кто зайдёт в профиль.</p>
    <div class="chips" data-kinds></div>
    <div class="row" style="gap:8px">
      <input class="input grow" data-title placeholder="Название">
      <button class="btn btn-primary" data-add>${icon('plus', 16)}</button>
    </div>
    <div class="col" data-rows style="gap:6px"></div>
    <button class="btn btn-primary" data-save>${icon('check', 17)} Сохранить</button>
  </div>`);
  const sheet = openSheet('Любимое', body);
  let kind = 'music';

  const drawKinds = () => {
    body.querySelector('[data-kinds]').innerHTML = SHELF_KINDS.map(
      ([key, label, glyph]) => `<button class="chip" data-kind="${key}" aria-pressed="${kind === key}">${icon(glyph, 13)} ${label}</button>`
    ).join('');
    body.querySelectorAll('[data-kind]').forEach((button) => {
      button.onclick = () => {
        kind = button.dataset.kind;
        drawKinds();
      };
    });
  };

  const drawRows = () => {
    const list = body.querySelector('[data-rows]');
    list.innerHTML = rows.length
      ? rows
          .map((row, index) => {
            const meta = SHELF_KINDS.find((item) => item[0] === row.kind) || SHELF_KINDS[0];
            return `<div class="row between list-item" style="padding:8px 10px">
              <span class="row" style="gap:8px;min-width:0"><span class="muted">${icon(meta[2], 15)}</span><span class="small truncate">${esc(row.title)}</span></span>
              <button class="btn btn-icon btn-ghost" data-kill="${index}">${icon('close', 15)}</button>
            </div>`;
          })
          .join('')
      : '<div class="tiny muted">Список пуст</div>';
    list.querySelectorAll('[data-kill]').forEach((button) => {
      button.onclick = () => {
        rows.splice(Number(button.dataset.kill), 1);
        drawRows();
      };
    });
  };

  body.querySelector('[data-add]').onclick = () => {
    const input = body.querySelector('[data-title]');
    const title = input.value.trim().slice(0, 40);
    if (!title) return;
    if (rows.length >= 12) return toast('Больше двенадцати не поместится', 'err');
    rows.push({ kind, title });
    input.value = '';
    drawRows();
  };
  body.querySelector('[data-save]').onclick = async () => {
    try {
      await api.setShelf(rows);
      setUser({ ...state.user, shelf: rows });
      sheet.close();
      toast('Сохранено');
      done?.();
    } catch (error) {
      toast(error.message, 'err');
    }
  };
  drawKinds();
  drawRows();
}

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

async function openRecap(period = 'month') {
  const body = el('<div class="col"><div class="card" style="height:150px;opacity:.35"></div></div>');
  const sheet = openSheet(period === 'month' ? 'Итоги месяца' : 'Итоги лета', body);
  let data;
  try {
    data = period === 'month' && api.monthRecap ? await api.monthRecap() : await api.summerRecap();
  } catch (error) {
    body.innerHTML = emptyState('warn', 'Не загрузилось', error.message);
    return;
  }
  const rows = [
    ['feed', 'Записей за лето', data.posts || 0],
    ['heart', 'Лайков собрано', data.likes || 0],
    ['comment', 'Ответов написано', data.answers || 0],
    ['users', 'Подписок', data.friends || 0],
    ['gift', 'Подарков на полке', data.gifts || 0],
    ['flame', 'Лучшая полоса дней', data.streak || 0],
    ['coin', 'Монет в кошельке', data.coins || 0]
  ];
  const monthName = MONTHS[(Number(data.month) || new Date().getMonth() + 1) - 1];
  body.innerHTML = `<div class="col">
    <div class="row" style="gap:8px">
      <button class="btn btn-sm grow ${period === 'month' ? 'btn-primary' : ''}" data-period="month">Месяц</button>
      <button class="btn btn-sm grow ${period === 'summer' ? 'btn-primary' : ''}" data-period="summer">Лето</button>
    </div>
    <div class="card recap-head">
      <div class="event-rose">${icon(period === 'month' ? 'chart' : 'rose', 26)}</div>
      <div class="grow"><div class="strong">${period === 'month' ? esc(monthName) + ' 2026' : 'Лето 2026'}</div>
      <div class="tiny muted" style="margin-top:3px">${period === 'month'
        ? 'Что накопилось с первого числа'
        : (data.rose ? 'Розочка лета осталась у вас на память' : 'Розочку лета вы не забрали')}</div></div>
    </div>
    <div class="card">
      ${rows.map(([glyph, label, value]) => `<div class="row between" style="padding:7px 0">
        <span class="row" style="gap:9px"><span class="muted">${icon(glyph, 17)}</span><span class="small">${esc(label)}</span></span>
        <span class="strong">${value}</span></div>`).join('')}
    </div>
    <p class="tiny muted" style="margin:0;line-height:1.5">${period === 'month' ? 'Месяц закончится, и счёт начнётся заново.' : 'Итоги лета считаются с первого июня.'}</p>
  </div>`;
  body.querySelectorAll('[data-period]').forEach((button) => {
    button.onclick = () => {
      sheet.close();
      openRecap(button.dataset.period);
    };
  });
}

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
      <div data-my-shelf></div>
      <div data-likes></div>
      ${isPremium(fresh) ? `<div class="row" style="margin-top:8px;gap:8px">
        <button class="btn grow" data-story>${icon('play', 17)} Добавить историю</button>
        ${hasStory(fresh) ? `<button class="btn grow" data-my-story>${icon('eye', 17)} Моя история</button>` : ''}
      </div>
      <button class="btn" data-pins-edit style="width:100%;margin-top:8px">${icon('spark', 17)} Разместить пины</button>` : ''}
      </div>
    </div>

    <div class="col" style="margin-top:12px;gap:6px">
      ${fresh.isAdmin ? `<button class="card list-item" data-admin>${icon('chart', 20)}<div class="grow"><div class="strong small">Админ-панель</div><div class="tiny muted">Пользователи, аналитика, наказания</div></div>${icon('forward', 16)}</button>` : ''}
      ${fresh.isModerator ? `<button class="card list-item" data-mod>${icon('shield', 20)}<div class="grow"><div class="strong small">Панель модератора</div><div class="tiny muted">Ваше звание: ${esc(rankName(fresh))}</div></div>${icon('forward', 16)}</button>` : ''}
      <button class="card list-item" data-letters>${icon('mail', 20)}<div class="grow"><div class="strong small">Письмо незнакомцу</div><div class="tiny muted">Отпустить письмо или прочитать чужое</div></div>${icon('forward', 16)}</button>
      <button class="card list-item" data-capsule>${icon('hourglass', 20)}<div class="grow"><div class="strong small">Капсула времени</div><div class="tiny muted">Письмо себе будущему</div></div>${icon('forward', 16)}</button>
      <button class="card list-item" data-gifts>${icon('gift', 20)}<div class="grow"><div class="strong small">Мои подарки</div><div class="tiny muted">Витрина, продажа</div></div>${icon('forward', 16)}</button>
      <button class="card list-item" data-wallet>${icon('coin', 20)}<div class="grow"><div class="strong small">Кошелёк</div><div class="tiny muted">Монет: ${fresh.coins || 0}</div></div>${icon('forward', 16)}</button>
      <button class="card list-item" data-recap>${icon('chart', 20)}<div class="grow"><div class="strong small">Итоги</div><div class="tiny muted">Что вы прожили за месяц и за лето</div></div>${icon('forward', 16)}</button>
      <button class="card list-item" data-card>${icon('image', 20)}<div class="grow"><div class="strong small">Открытка настроения</div><div class="tiny muted">Карточка недели, которой можно поделиться</div></div>${icon('forward', 16)}</button>
      <button class="card list-item" data-appeals>${icon('shield', 20)}<div class="grow"><div class="strong small">Мои споры</div><div class="tiny muted">Если наказание кажется несправедливым</div></div>${icon('forward', 16)}</button>
      <button class="card list-item" data-badges>${icon('trophy', 20)}<div class="grow"><div class="strong small">Достижения</div><div class="tiny muted">Не за популярность, а за заботу</div></div>${icon('forward', 16)}</button>
      <button class="card list-item" data-breathe>${icon('wave', 20)}<div class="grow"><div class="strong small">Дыхание</div><div class="tiny muted">Вдох на четыре, выдох на шесть</div></div>${icon('forward', 16)}</button>
      <button class="card list-item" data-noise>${icon('volume', 20)}<div class="grow"><div class="strong small">Звуки для сна</div><div class="tiny muted">Дождь, волны, лес, ночь</div></div>${icon('forward', 16)}</button>
      <button class="card list-item" data-moodmap>${icon('compass', 20)}<div class="grow"><div class="strong small">Настроение сети</div><div class="tiny muted">Как дела у всех сразу</div></div>${icon('forward', 16)}</button>
      <div class="divider" style="margin:8px 0"></div>
      <button class="card list-item" data-notes>${icon('bell', 20)}<div class="grow"><div class="strong small">Уведомления</div><div class="tiny muted" data-bell-count>Всё прочитано</div></div>${icon('forward', 16)}</button>
      <button class="card list-item" data-names>${icon('key', 20)}<div class="grow"><div class="strong small">Мои юзернеймы</div><div class="tiny muted">Несколько имён на один аккаунт</div></div>${icon('forward', 16)}</button>
      <button class="card list-item" data-contacts>${icon('users', 20)}<div class="grow"><div class="strong small">Контакты</div><div class="tiny muted">Кого ты добавил</div></div>${icon('forward', 16)}</button>
      <button class="card list-item" data-accounts>${icon('users', 20)}<div class="grow"><div class="strong small">Мои аккаунты</div><div class="tiny muted">Переключиться или добавить ещё</div></div>${icon('forward', 16)}</button>
      <button class="card list-item" data-logout style="color:#c98b8b">${icon('logout', 20)}<div class="grow" style="text-align:left"><div class="strong small">Выйти</div></div></button>
    </div>

    <div class="row between" style="margin:22px 2px 10px"><div class="strong small">Мои записи</div><div class="tiny muted">${plural(posts.length, 'запись', 'записи', 'записей')}</div></div>
    <div class="chips" data-kinds style="margin-bottom:10px"></div>
    <div class="col" data-posts></div>`;

  const list = body.querySelector('[data-posts]');
  const { postCard } = await import('./feed.js');
  mediaTabs(body.querySelector('[data-kinds]'), list, posts, postCard, () => render(root));

  body.querySelector('[data-recap]')?.addEventListener('click', () => openRecap('month'));
  drawShelf(body, fresh, true, () => render(root));
  body.querySelector('[data-card]')?.addEventListener('click', () => openMoodCard(fresh));
  body.querySelector('[data-appeals]')?.addEventListener('click', () => openAppeals());

  const edit = () => openEditor(() => render(root));
  root.querySelector('[data-edit]').onclick = edit;
  body.querySelector('[data-edit-2]').onclick = edit;
  body.querySelector('[data-mood]').onclick = () => openMoodPicker(() => render(root));
  body.querySelector('[data-names]').onclick = () => openUsernames(() => render(root));
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
  body.querySelector('[data-badges]')?.addEventListener('click', async () => {
    const { openBadges } = await import('./extras.js');
    openBadges();
  });
  body.querySelector('[data-breathe]')?.addEventListener('click', async () => {
    const { openBreathe } = await import('./extras.js');
    openBreathe();
  });
  body.querySelector('[data-noise]')?.addEventListener('click', async () => {
    const { openNoise } = await import('./extras.js');
    openNoise();
  });
  body.querySelector('[data-moodmap]')?.addEventListener('click', async () => {
    const { openMoodMap } = await import('./extras.js');
    openMoodMap();
  });
  body.querySelector('[data-campfire]')?.addEventListener('click', async () => {
    const { openCampfire } = await import('./campfire.js');
    openCampfire();
  });
  api.gifts?.(fresh.id).then(async ({ gifts }) => {
    const shelf = body.querySelector('[data-my-shelf]');
    if (!shelf || !gifts?.length) return;
    const { giftShelf } = await import('./gifts.js');
    shelf.innerHTML = giftShelf(gifts);
    shelf.onclick = async () => {
      const { openMyGifts } = await import('./gifts.js');
      openMyGifts(fresh.id, true);
    };
  }).catch(() => {});

  body.querySelector('[data-letters]')?.addEventListener('click', async () => {
    const { openLetters } = await import('./letters.js');
    openLetters();
  });
  body.querySelector('[data-capsule]')?.addEventListener('click', async () => {
    const { openCapsules } = await import('./capsule.js');
    openCapsules();
  });
  body.querySelector('[data-gifts]')?.addEventListener('click', async () => {
    const { openMyGifts } = await import('./gifts.js');
    openMyGifts(state.user.id, true);
  });
  body.querySelector('[data-wallet]')?.addEventListener('click', async () => {
    const { openWallet } = await import('./gifts.js');
    openWallet();
  });
  body.querySelector('[data-notes]').onclick = async () => {
    const { openNotifications } = await import('./notifications.js');
    openNotifications();
  };
  body.querySelector('[data-contacts]').onclick = openContacts;
  body.querySelector('[data-accounts]').onclick = () => openAccounts();

  body.querySelector('[data-logout]').onclick = async () => {
    if (!(await confirmSheet({ title: 'Выйти из аккаунта', text: 'Сессия на этом устройстве закроется', confirm: 'Выйти', danger: true }))) return;
    const { forget } = await import('../accounts.js');
    forget(state.user?.id);
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

export function openUsernames(done) {
  const body = el(`<div class="col">
    <div class="col" data-list style="gap:6px"></div>
    <div class="row" style="gap:8px">
      <input class="input grow" data-new placeholder="новый юзернейм" maxlength="20">
      <button class="btn btn-primary btn-icon" data-add>${icon('plus', 18)}</button>
    </div>
    <p class="tiny muted" style="margin:0;line-height:1.5">Все ваши юзернеймы ведут на один аккаунт: по любому из них можно войти, найти вас в поиске и открыть профиль. Основной показывается людям.</p>
  </div>`);
  const sheet = openSheet('Мои юзернеймы', body, { onClose: done });
  const list = body.querySelector('[data-list]');
  const input = body.querySelector('[data-new]');
  const addButton = body.querySelector('[data-add]');

  const draw = async () => {
    list.innerHTML = '<div class="card" style="height:52px;opacity:.3"></div>';
    try {
      const { names, limit } = await api.myUsernames();
      const main = state.user?.username;
      list.innerHTML = names
        .map(
          (name) => `<div class="list-item" data-row="${esc(name)}" style="background:var(--surface);border-radius:var(--r-md)">
            <span class="grow strong small">@${esc(name)}</span>
            ${name === main
              ? '<span class="pill good">основной</span>'
              : `<button class="btn btn-sm" data-main="${esc(name)}">Сделать основным</button>
                 <button class="btn btn-icon btn-ghost" data-drop="${esc(name)}">${icon('trash', 16)}</button>`}
          </div>`
        )
        .join('') + `<div class="tiny muted" style="padding:4px 2px">Занято ${names.length} из ${limit}${limit < 8 ? '. С премиумом до 8' : ''}</div>`;

      addButton.disabled = names.length >= limit;
      input.placeholder = names.length >= limit ? 'лимит исчерпан' : 'новый юзернейм';

      list.querySelectorAll('[data-main]').forEach((button) => {
        button.onclick = async () => {
          button.disabled = true;
          try {
            const { user } = await api.setMainUsername(button.dataset.main);
            if (user) setUser(user);
            else setUser((await api.me()).user);
            toast('Основной юзернейм обновлён');
            draw();
          } catch (error) {
            button.disabled = false;
            toast(error.message, 'err');
          }
        };
      });

      list.querySelectorAll('[data-drop]').forEach((button) => {
        button.onclick = async () => {
          if (!(await confirmSheet({ title: `Убрать @${button.dataset.drop}`, text: 'Имя освободится, его сможет занять кто-то другой', confirm: 'Убрать', danger: true }))) return;
          try {
            await api.dropUsername(button.dataset.drop);
            toast('Юзернейм убран');
            draw();
          } catch (error) {
            toast(error.message, 'err');
          }
        };
      });
    } catch (error) {
      list.innerHTML = emptyState('warn', 'Не загрузилось', error.message);
    }
  };

  const add = async () => {
    const wanted = input.value.trim().toLowerCase().replace(/^@/, '');
    if (!wanted) return;
    if (!/^[a-z0-9_]{3,20}$/.test(wanted)) return toast('Юзернейм: 3-20 символов, латиница, цифры и _', 'err');
    addButton.disabled = true;
    try {
      await api.addUsername(wanted);
      input.value = '';
      toast(`@${wanted} теперь ваш`);
      draw();
    } catch (error) {
      toast(error.message, 'err');
    } finally {
      addButton.disabled = false;
    }
  };

  addButton.onclick = add;
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    add();
  });

  draw();
}

export async function openAccounts() {
  const { savedAccounts, switchTo, forget, rememberCurrent, ACCOUNT_LIMIT } = await import('../accounts.js');
  await rememberCurrent();

  const body = el('<div class="col" style="gap:8px"></div>');
  const sheet = openSheet('Мои аккаунты', body);

  const draw = () => {
    const list = savedAccounts();
    const others = list.filter((row) => String(row.id) !== String(state.user?.id));
    body.innerHTML = `
      ${list
        .map((row) => {
          const here = String(row.id) === String(state.user?.id);
          return `<div class="card list-item" style="padding:10px" data-row="${esc(String(row.id))}">
            ${avatar(row, 46)}
            <div class="grow" style="min-width:0">
              <div class="strong small truncate">${esc(row.displayName || row.username)}</div>
              <div class="tiny muted truncate">@${esc(row.username)}</div>
            </div>
            ${here
              ? '<span class="pill good">сейчас здесь</span>'
              : `<button class="btn btn-sm" data-use="${esc(String(row.id))}">Войти</button>
                 <button class="btn btn-icon btn-ghost" data-drop="${esc(String(row.id))}">${icon('close', 16)}</button>`}
          </div>`;
        })
        .join('')}
      ${list.length < ACCOUNT_LIMIT
        ? `<button class="btn" data-add style="width:100%">${icon('add_user', 17)} Добавить аккаунт</button>`
        : '<div class="tiny muted center">Больше пяти аккаунтов не поместится</div>'}
      <p class="tiny muted" style="margin:0;line-height:1.5">Аккаунты хранятся только на этом устройстве. Переключение мгновенное, вводить пароль заново не нужно. Всего можно держать ${ACCOUNT_LIMIT}, сейчас ${list.length}.</p>`;

    body.querySelectorAll('[data-use]').forEach((button) => {
      button.onclick = async () => {
        button.disabled = true;
        button.textContent = 'Входим';
        try {
          const user = await switchTo(button.dataset.use);
          setUser(user);
          toast(`Вы в аккаунте @${user.username}`);
          sheet.close();
          location.reload();
        } catch (error) {
          button.disabled = false;
          button.textContent = 'Войти';
          toast(error.message, 'err');
        }
      };
    });

    body.querySelectorAll('[data-drop]').forEach((button) => {
      button.onclick = async () => {
        if (!(await confirmSheet({ title: 'Убрать аккаунт', text: 'С устройства пропадёт быстрый вход. Сам аккаунт останется цел', confirm: 'Убрать', danger: true }))) return;
        forget(button.dataset.drop);
        draw();
      };
    });

    body.querySelector('[data-add]')?.addEventListener('click', async () => {
      sheet.close();
      await api.logout();
      setUser(null);
      location.reload();
    });

    if (!others.length && list.length <= 1) {
      body.insertAdjacentHTML(
        'beforeend',
        '<p class="tiny muted" style="margin:0;line-height:1.5">Чтобы добавить второй аккаунт, нажмите «Добавить аккаунт» — откроется вход. Текущий никуда не денется, вернуться к нему можно отсюда же.</p>'
      );
    }
  };

  draw();
  return sheet;
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
        ${user.isModerator ? `<div style="display:flex;justify-content:center;margin-top:8px"><span class="rank-pill">${icon('shield', 13)}<span>${esc(rankName(user))}</span></span></div>` : ''}
        <div data-shelf></div>
        <div data-likes></div>
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
          <button class="btn btn-icon" data-report title="Пожаловаться">${icon('flag', 17)}</button>
        </div>
        <div class="row" style="margin-top:8px;gap:8px">
          <button class="btn grow" data-follow>${icon('plus', 17)} Подписаться</button>
          ${user.isModerator ? `<button class="btn grow" data-thank>${icon('heart', 17)} Спасибо</button>` : ''}
        </div>
        <div class="row" style="margin-top:8px;gap:8px">
          <button class="btn grow" data-contact>${icon('add_user', 17)} В контакты</button>
        </div>
        <div class="row" style="margin-top:8px;gap:8px">
          <button class="btn grow" data-gift>${icon('gift', 17)} Подарить</button>
          <button class="btn grow" data-their-gifts>${icon('star', 17)} Подарки</button>
        </div>
        ${state.user?.isModerator || state.user?.isAdmin ? `<div class="col" style="margin-top:8px;gap:8px">
          <button class="btn" data-info style="width:100%">${icon('device', 17)} Информация о человеке</button>
          <button class="btn" data-punish style="width:100%;color:#c98b8b">${icon('warn', 17)} Наказать</button>
        </div>` : ''}
        <div class="tiny muted" style="margin-top:10px">В СпокУм с ${fullDate(user.createdAt).split(',')[0]}</div>
        </div>
      </div>
      <div class="row between" style="margin:20px 2px 10px"><div class="strong small">Записи</div></div>
      <div class="chips" data-kinds style="margin-bottom:10px"></div>
      <div class="col" data-posts></div>`;

    {
      try {
        const { gifts } = await api.gifts(user.id);
        const { giftShelf } = await import('./gifts.js');
        const shelf = body.querySelector('[data-shelf]');
        if (shelf) shelf.innerHTML = giftShelf(gifts);
      } catch {}
      drawShelf(body, user, false);
    }

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
    const followBtn = body.querySelector('[data-follow]');
    if (followBtn) {
      const paintFollow = (data) => {
        followBtn.innerHTML = `${icon(data.following ? 'check' : 'plus', 17)} ${data.following ? 'Вы подписаны' : 'Подписаться'}${data.followers ? ' · ' + data.followers : ''}`;
        followBtn.classList.toggle('btn-primary', !data.following);
      };
      api.followState?.(user.id).then(paintFollow).catch(() => {});
      followBtn.onclick = async () => {
        try {
          const state_ = await api.followState(user.id);
          paintFollow(await api.follow(user.id, !state_.following));
        } catch (error) {
          toast(error.message, 'err');
        }
      };
    }

    const thankBtn = body.querySelector('[data-thank]');
    if (thankBtn) {
      api.modThanks?.(user.id).then((data) => {
        thankBtn.innerHTML = `${icon('heart', 17)} Спасибо${data.total ? ' · ' + data.total : ''}`;
        if (data.mine) thankBtn.disabled = true;
      }).catch(() => {});
      thankBtn.onclick = async () => {
        const { promptSheet } = await import('../ui.js');
        const note = await promptSheet({ title: 'Спасибо модератору', label: 'За что', placeholder: 'Можно оставить пустым', multiline: true, confirm: 'Отправить' });
        if (note === null) return;
        try {
          const result = await api.thankMod(user.id, note || '');
          thankBtn.innerHTML = `${icon('heart', 17)} Спасибо · ${result.total}`;
          thankBtn.disabled = true;
          toast('Модератор это увидит');
        } catch (error) {
          toast(error.message, 'err');
        }
      };
    }

    body.querySelector('[data-gift]')?.addEventListener('click', async () => {
      const { openGiftShop } = await import('./gifts.js');
      openGiftShop(user, () => openProfile(username));
    });
    body.querySelector('[data-their-gifts]')?.addEventListener('click', async () => {
      const { openMyGifts } = await import('./gifts.js');
      openMyGifts(user.id, false);
    });
    body.querySelector('[data-info]')?.addEventListener('click', async () => {
      const { openUserInfo } = await import('./userinfo.js');
      openUserInfo(user.id);
    });
    body.querySelector('[data-punish]')?.addEventListener('click', async () => {
      const { openPunish } = await import('./mod.js');
      openPunish(user, () => openProfile(username));
    });
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
