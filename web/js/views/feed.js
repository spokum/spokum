import { api, state, MOODS, moodStyle, cacheFeed, readFeedCache, isOffline, isPremium, isBeta } from '../store.js';
import { el, esc, timeAgo, plural } from '../util.js';
import { icon } from '../icons.js';
import { avatar, badges, toast, openSheet, confirmSheet, pickImage, emptyState, hasStory } from '../ui.js';
import { openProfile } from './profile.js';
import { openStories, publishStory } from './stories.js';
import { isSaved, toggleSaved, savedList, dropSaved, folders, addFolder, dropFolder, setFolder } from '../saved.js';


const DAY_THEMES = [
  ['Воскресный итог', 'Что было хорошего за неделю?'],
  ['Понедельник маленьких целей', 'Одно дело, которое сегодня по силам'],
  ['Вторник благодарности', 'Кому или чему вы сегодня благодарны?'],
  ['Среда тишины', 'Что помогает вам выдохнуть?'],
  ['Четверг маленьких побед', 'Что получилось, пусть и мелочь?'],
  ['Пятница честности', 'Как вы на самом деле, без прикрас?'],
  ['Субботний отдых', 'Чем себя порадуете сегодня?']
];

function dayTheme() {
  return DAY_THEMES[new Date().getDay()];
}

const MUTE_KEY = 'spokum.mutewords.v1';

export function muteWords() {
  try {
    const saved = JSON.parse(localStorage.getItem(MUTE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function saveMuteWords(list) {
  localStorage.setItem(MUTE_KEY, JSON.stringify(list.slice(0, 40)));
}

function mutedBy(post) {
  if (!isBeta(state.user)) return null;
  const words = muteWords();
  if (!words.length) return null;
  const text = `${post.text || ''} ${(post.tags || []).join(' ')}`.toLowerCase();
  return words.find((word) => word && text.includes(word.toLowerCase())) || null;
}

const HARD_WORDS = [
  'не хочу жить', 'незачем жить', 'покончить', 'суицид', 'убить себя', 'убью себя',
  'вскрыть вены', 'ненавижу себя', 'нет сил жить', 'хочу умереть', 'мне незачем'
];

function needsCare(text) {
  const clean = String(text || '').toLowerCase();
  return HARD_WORDS.some((word) => clean.includes(word));
}

export function careCard() {
  return `<div class="card care-card">
    <div class="row" style="align-items:flex-start;gap:10px">
      <span style="color:#e08fa8">${icon('heart', 18)}</span>
      <div class="grow">
        <div class="small strong">Вы не одни</div>
        <div class="tiny muted" style="margin-top:4px;line-height:1.55">Если внутри совсем тяжело, поговорите с живым человеком. Телефон доверия работает круглосуточно и бесплатно: 8 800 2000 122. Ещё можно зайти в тихие комнаты, там дыхание и спокойные занятия.</div>
      </div>
    </div>
  </div>`;
}

const DRAFT_KEY = 'spokum.draft.v1';

function readDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (saved && typeof saved.text === 'string') return { text: saved.text, media: [], mood: saved.mood || 'calm' };
  } catch {}
  return { text: '', media: [], mood: 'calm' };
}

function saveDraft() {
  try {
    if (draft.text.trim()) localStorage.setItem(DRAFT_KEY, JSON.stringify({ text: draft.text, mood: draft.mood }));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

let draft = readDraft();

export async function render(root) {
  root.innerHTML = `
    <div class="topbar">
      <div class="brand">
        <div>
          <h1>Лента</h1>
          <p class="sub">Как ты сегодня на самом деле</p>
        </div>
      </div>
      <span data-streak></span>
      <div class="spacer"></div>
      <button class="btn btn-icon" data-search-toggle title="Поиск">${icon('search', 18)}</button>
      <button class="btn btn-icon" data-saved title="Сохранённое">${icon('star', 18)}</button>
      <button class="btn btn-icon" data-refresh title="Обновить">${icon('refresh', 18)}</button>
    </div>
    <div data-search hidden style="margin-bottom:12px">
      <input class="input" data-query placeholder="Поиск по записям и авторам">
    </div>
    ${api.mode === 'local' ? `<div class="card" style="border-color:rgba(255,203,107,.3);background:rgba(255,203,107,.07)"><div class="row" style="align-items:flex-start;gap:10px">${icon('warn', 18)}<div class="grow"><div class="strong small">Автономный режим</div><div class="tiny muted" style="margin-top:3px;line-height:1.5">База не подключена, поэтому аккаунт и записи живут только в этом браузере. Впишите ключи Supabase в файл config.js, и сеть станет общей для всех.</div></div></div></div>` : ''}
    <div data-event></div>
    <div data-announce></div>
    <div data-composer></div>
    <div class="chips" data-filters style="margin:14px 0 12px"></div>
    <div class="col" data-list></div>`;

  root.querySelector('[data-refresh]').onclick = () => load(root);

  const searchBox = root.querySelector('[data-search]');
  const query = root.querySelector('[data-query]');
  root.querySelector('[data-search-toggle]').onclick = () => {
    searchBox.hidden = !searchBox.hidden;
    if (!searchBox.hidden) query.focus();
    else {
      query.value = '';
      feedState.query = '';
      drawPosts(root, feedState.posts, {});
    }
  };
  query.addEventListener('input', () => {
    feedState.query = query.value.trim().toLowerCase();
    drawPosts(root, feedState.posts, {});
  });

  root.querySelector('[data-saved]').onclick = () => openSaved(root);

  if (api.touchStreak) {
    import('./extras.js').then(async ({ refreshStreak }) => {
      const result = await refreshStreak();
      const slot = root.querySelector('[data-streak]');
      if (slot && result?.days) {
        slot.innerHTML = `<span class="streak-chip" title="Дней подряд">${icon('flame', 13)}${result.days}</span>`;
      }
    }).catch(() => {});
  }

  attachPullToRefresh(root);
  renderComposer(root);
  renderFilters(root);
  loadAnnouncements(root);
  loadEvent(root);
  await load(root);
}

function eventLeft(endsAt) {
  const gap = Number(endsAt) - Date.now();
  if (gap <= 0) return 'событие закончилось';
  const days = Math.floor(gap / 86400000);
  const hours = Math.floor(gap / 3600000);
  const minutes = Math.floor((gap % 3600000) / 60000);
  if (days >= 1) return `ещё ${plural(days, 'день', 'дня', 'дней')}`;
  if (hours >= 1) return `ещё ${plural(hours, 'час', 'часа', 'часов')}`;
  return `ещё ${plural(minutes, 'минута', 'минуты', 'минут')}`;
}

async function loadEvent(root) {
  const host = root.querySelector('[data-event]');
  if (!host || !api.eventState || !state.user) return;
  let info = null;
  try {
    info = await api.eventState();
  } catch {
    host.innerHTML = '';
    return;
  }
  if (!info || !info.active) {
    host.innerHTML = '';
    loadSeason(root);
    return;
  }
  const draw = () => {
    host.innerHTML = `<div class="card event-card">
      <div class="event-top">
        <div class="event-rose">${icon('rose', 26)}</div>
        <div class="grow" style="min-width:0">
          <div class="strong small">${esc(info.title || 'Последний день лета')}</div>
          <div class="tiny muted" style="margin-top:4px;line-height:1.5">${esc(info.text || '')}</div>
          <div class="tiny muted" style="margin-top:6px">${esc(eventLeft(info.endsAt))}</div>
        </div>
      </div>
      ${info.claimed
        ? `<span class="pill event-done">${icon('check', 14)}<span>Розочка уже ваша</span></span>`
        : '<button class="btn btn-primary" data-claim style="width:100%">Забрать розочку</button>'}
    </div>`;
    host.querySelector('[data-claim]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await api.eventClaim();
        info.claimed = true;
        import('../app.js').then(({ refreshUser }) => refreshUser?.()).catch(() => {});
        toast('Розочка на память и 100 монет ваши');
        draw();
      } catch (error) {
        button.disabled = false;
        toast(error.message || 'Не получилось');
      }
    });
  };
  draw();
}


const SEASON_HIDE = 'spokum.season.hidden';

async function loadSeason(root) {
  const host = root.querySelector('[data-event]');
  if (!host || !api.seasonState || !state.user) return;
  let info = null;
  try {
    info = await api.seasonState();
  } catch {
    return;
  }
  if (!info || info.season !== 'autumn' || !isBeta(state.user)) return;
  if (localStorage.getItem(SEASON_HIDE) === info.season) return;
  const share = info.total ? Math.round((info.collected / info.total) * 100) : 0;
  host.innerHTML = `<div class="card season-card">
    <div class="season-top">
      <div class="season-leaf">${icon('leaf', 20)}</div>
      <div class="grow strong">${esc(info.title || 'Сезон')}</div>
      <button class="btn btn-icon btn-ghost season-close" data-hide-season>${icon('close', 15)}</button>
    </div>
    <div class="season-text">${esc(info.text || '')}</div>
    <div class="season-bar"><i style="width:${share}%"></i></div>
    <div class="tiny muted" style="margin-top:6px">Собрано ${info.collected} из ${info.total}</div>
    <button class="btn btn-primary season-go" data-open-season>${icon('gift', 17)} Смотреть подарки сезона</button>
  </div>`;
  host.querySelector('[data-hide-season]').onclick = () => {
    localStorage.setItem(SEASON_HIDE, info.season);
    host.innerHTML = '';
  };
  host.querySelector('[data-open-season]').onclick = async () => {
    const { openGiftShop } = await import('./gifts.js');
    openGiftShop();
  };
}

async function loadAnnouncements(root) {
  const host = root.querySelector('[data-announce]');
  if (!host || !api.listAnnouncements) return;
  try {
    const { announcements } = await api.listAnnouncements();
    const hidden = JSON.parse(localStorage.getItem('spokum.announce.hidden') || '[]');
    const fresh = (announcements || []).filter((row) => !hidden.includes(row.id));
    host.innerHTML = fresh
      .map(
        (row) => `<div class="card announce tone-${esc(row.tone)}" data-announce-id="${row.id}">
          <div class="row" style="align-items:flex-start;gap:10px">${icon('megaphone', 18)}
            <div class="grow"><div class="strong small">${esc(row.title)}</div>
            <div class="tiny muted" style="margin-top:4px;line-height:1.5">${esc(row.body)}</div></div>
            <button class="btn btn-icon btn-ghost" data-hide="${row.id}">${icon('close', 16)}</button></div>
        </div>`
      )
      .join('');
    host.querySelectorAll('[data-hide]').forEach((button) => {
      button.onclick = () => {
        const list = JSON.parse(localStorage.getItem('spokum.announce.hidden') || '[]');
        list.push(Number(button.dataset.hide));
        localStorage.setItem('spokum.announce.hidden', JSON.stringify(list.slice(-40)));
        button.closest('[data-announce-id]').remove();
      };
    });
  } catch {
    host.innerHTML = '';
  }
}

function renderComposer(root) {
  const host = root.querySelector('[data-composer]');
  if (!state.user) {
    host.innerHTML = '';
    return;
  }
  const card = el(`
    <div class="card composer">
      ${isBeta(state.user) ? `<div class="day-theme">${icon('spark', 13)}<span>${esc(dayTheme()[0])}</span></div>` : ''}
      <div class="row" style="align-items:flex-start">
        ${avatar(state.user, 40)}
        <textarea class="textarea grow" maxlength="${isPremium(state.user) ? 5000 : 2000}" placeholder="${esc(dayTheme()[1])}"></textarea>
      </div>
      <div data-preview></div>
      <div data-care></div>
      ${draft.text.trim() ? '<div class="tiny muted" style="margin:6px 0 0">Черновик сохранён, можно уйти и вернуться</div>' : ''}
      <div class="chips wrap" data-moods style="margin:10px 0 10px"></div>
      <div data-offer></div>
      <div class="composer-actions">
        <div class="composer-tools">
          <button class="icon-btn" data-image>${icon('image', 18)}<span>Фото</span></button>
          <button class="icon-btn" data-reels>${icon('video', 18)}<span>В Видео</span></button>
          <button class="icon-btn" data-poll-new>${icon('chart', 18)}<span>Опрос</span></button>
          ${isBeta(state.user) ? `<button class="icon-btn" data-voice>${icon('mic', 18)}<span>Голос</span></button>
          <button class="icon-btn" data-later>${icon('clock', 18)}<span>Позже</span></button>` : ''}
          ${isPremium(state.user) ? `<button class="icon-btn" data-story>${icon('play', 18)}<span>История</span></button>` : ''}
        </div>
        <button class="btn btn-primary btn-sm composer-send" data-send>${icon('send', 16)}<span>Опубликовать</span></button>
      </div>
    </div>`);

  card.querySelector('[data-poll-new]')?.addEventListener('click', () => openPollComposer(root));
  card.querySelector('[data-later]')?.addEventListener('click', async () => {
    if (!draft.text.trim() && !draft.media.length) return toast('Сначала напишите запись', 'err');
    const menu = el(`<div class="col" style="gap:6px">
      ${[[1, 'Через час'], [3, 'Через три часа'], [8, 'Утром, через восемь часов'], [24, 'Завтра в это же время']]
        .map(([hours, label]) => `<button class="list-item" data-hours="${hours}">${icon('clock', 17)}<span>${label}</span></button>`)
        .join('')}
    </div>`);
    const sheet = openSheet('Опубликовать позже', menu);
    menu.querySelectorAll('[data-hours]').forEach((button) => {
      button.onclick = async () => {
        sheet.close();
        try {
          await api.createPost({
            text: draft.text.trim(),
            image: draft.media[0] || null,
            media: draft.media,
            mood: draft.mood,
            publishAt: Date.now() + Number(button.dataset.hours) * 3600000
          });
          draft.text = '';
          draft.media = [];
          saveDraft();
          toast('Запись выйдет в назначенное время');
          load(root);
        } catch (error) {
          toast(error.message, 'err');
        }
      };
    });
  });

  card.querySelector('[data-voice]')?.addEventListener('click', async () => {
    const { recordVoice } = await import('./chats.js');
    recordVoice(async ({ media, duration }) => {
      try {
        await api.createPost({ text: draft.text.trim(), mood: draft.mood, sound: media, duration });
        draft.text = '';
        draft.media = [];
        saveDraft();
        toast('Голос дня опубликован');
        load(root);
      } catch (error) {
        toast(error.message, 'err');
      }
    }, { title: 'Голос дня', limit: 30 });
  });

  const area = card.querySelector('textarea');
  const care = card.querySelector('[data-care]');
  area.value = draft.text;
  area.addEventListener('input', () => {
    draft.text = area.value;
    saveDraft();
    area.style.height = 'auto';
    area.style.height = `${Math.min(220, area.scrollHeight)}px`;
    care.innerHTML = isBeta(state.user) && needsCare(area.value) ? careCard() : '';
  });

  const moods = card.querySelector('[data-moods]');
  let allMoods = false;
  const drawMoods = () => {
    const keys = Object.keys(MOODS);
    const short = keys.slice(0, 4);
    const shown = allMoods || !short.includes(draft.mood) ? keys : short;
    moods.innerHTML = shown
      .map((key) => `<button class="chip" style="${moodStyle(key)}" data-mood="${key}" aria-pressed="${draft.mood === key}"><i class="mood-dot"></i>${esc(MOODS[key].label)}</button>`)
      .join('') + (shown.length < keys.length ? `<button class="chip" data-more-moods>${icon('more', 13)} Ещё</button>` : '');
    moods.querySelector('[data-more-moods]')?.addEventListener('click', () => {
      allMoods = true;
      drawMoods();
    });
    moods.querySelectorAll('[data-mood]').forEach((button) => {
      button.onclick = () => {
        draft.mood = button.dataset.mood;
        moods.querySelectorAll('[data-mood]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
        refreshOffer();
      };
    });
  };
  const offer = card.querySelector('[data-offer]');
  const refreshOffer = async () => {
    const { HEAVY_MOODS, MODES } = await import('./safe.js');
    if (!HEAVY_MOODS.includes(draft.mood)) {
      offer.innerHTML = '';
      return;
    }
    const mode = MODES[draft.mood];
    offer.innerHTML = `<button class="zone-offer" data-enter>${icon('leaf', 17)}
      <span class="grow"><span class="small strong">${esc(mode.title)}</span><br><span class="tiny muted">${esc(mode.note)}</span></span>
      ${icon('forward', 15)}</button>`;
    offer.querySelector('[data-enter]').onclick = async () => {
      const { enterSafeZone } = await import('./profile.js');
      enterSafeZone(draft.mood);
    };
  };

  drawMoods();
  refreshOffer();

  const preview = card.querySelector('[data-preview]');
  const drawPreview = () => {
    preview.innerHTML = draft.media.length
      ? `<div class="post-image" style="position:relative"><img src="${esc(draft.media[0])}" alt="">
          <button class="btn btn-icon" data-drop style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.55)">${icon('close', 16)}</button></div>`
      : '';
    preview.querySelector('[data-drop]')?.addEventListener('click', () => {
      draft.media = [];
      drawPreview();
    });
  };
  drawPreview();

  card.querySelector('[data-image]').onclick = async () => {
    const image = await pickImage(isPremium(state.user) ? 2000 : 1400);
    if (!image) return;
    draft.media = [image];
    drawPreview();
  };

  card.querySelector('[data-reels]').onclick = async () => {
    const { publishReel } = await import('./videos.js');
    publishReel(() => {
      const { openTab } = window.__spokum || {};
      openTab?.('videos');
    });
  };

  card.querySelector('[data-story]')?.addEventListener('click', () => publishStory(() => load(root)));

  card.querySelector('[data-send]').onclick = async (event) => {
    if (isOffline()) return toast('Нет интернета, пост не отправится', 'err');
    const button = event.currentTarget;
    button.disabled = true;
    const label = button.querySelector('span');
    const previous = label ? label.textContent : '';
    try {
      let image = draft.media[0] || null;
      if (image && api.uploadMedia && api.mode === 'supabase') {
        if (label) label.textContent = 'Загружаем';
        image = await api.uploadMedia(image, 'jpg');
      }
      await api.createPost({ text: draft.text, image, media: [], kind: 'text', mood: draft.mood });
      draft = { text: '', media: [], mood: 'calm' };
      saveDraft();
      renderComposer(root);
      await load(root);
      toast('Опубликовано');
    } catch (error) {
      toast(error.message, 'err');
    } finally {
      button.disabled = false;
      if (label) label.textContent = previous;
    }
  };

  host.innerHTML = '';
  host.appendChild(card);
}

function renderFilters(root) {
  const host = root.querySelector('[data-filters]');
  const entries = [['', 'Всё'], ...(api.follow ? [['mine', 'Свои']] : []), ...Object.entries(MOODS).map(([key, m]) => [key, m.label])];
  host.innerHTML = entries
    .map(([key, label]) => {
      const active = (state.moodFilter || '') === key;
      const tint = key && key !== 'mine' ? moodStyle(key) : '';
      return `<button class="chip" data-filter="${key}" style="${tint}" aria-pressed="${active}">${key && key !== 'mine' ? '<i class="mood-dot"></i>' : ''}${esc(label)}</button>`;
    })
    .join('');
  host.querySelectorAll('[data-filter]').forEach((button) => {
    button.onclick = () => {
      state.moodFilter = button.dataset.filter || null;
      renderFilters(root);
      load(root);
    };
  });
}

function skeleton(count = 3) {
  return Array.from({ length: count }, () => `<div class="card skeleton-card">
    <div class="row"><span class="sk sk-avatar"></span><span class="grow"><span class="sk sk-line" style="width:44%"></span><span class="sk sk-line sk-thin" style="width:28%"></span></span></div>
    <span class="sk sk-line" style="width:92%;margin-top:14px"></span>
    <span class="sk sk-line" style="width:74%"></span>
  </div>`).join('');
}

let feedState = { posts: [], cursor: null, more: true, busy: false, key: '', query: '' };

function attachPullToRefresh(root) {
  let startY = 0;
  let pulling = false;
  let bar = null;
  root.addEventListener('touchstart', (event) => {
    if (window.scrollY > 4) return;
    startY = event.touches[0].clientY;
    pulling = true;
  }, { passive: true });
  root.addEventListener('touchmove', (event) => {
    if (!pulling) return;
    const shift = event.touches[0].clientY - startY;
    if (shift < 12) return;
    if (!bar) {
      bar = el('<div class="pull-hint">Потяните, чтобы обновить</div>');
      root.prepend(bar);
    }
    bar.style.opacity = String(Math.min(1, shift / 90));
    if (shift > 90) bar.textContent = 'Отпустите';
  }, { passive: true });
  root.addEventListener('touchend', (event) => {
    if (!pulling) return;
    pulling = false;
    const shift = (event.changedTouches[0]?.clientY || 0) - startY;
    bar?.remove();
    bar = null;
    if (shift > 90) load(root);
  });
}

function openSaved(root) {
  const body = el('<div class="col" style="gap:8px"></div>');
  const sheet = openSheet('Сохранённое', body);
  let picked = '';

  const draw = () => {
    const all = savedList();
    const list = picked ? all.filter((row) => (row.folder || '') === picked) : all;
    const tabs = ['', ...folders()];
    body.innerHTML = `<div class="chips" data-folders>${tabs
      .map((name) => `<button class="chip" data-folder="${esc(name)}" aria-pressed="${picked === name}">${name ? esc(name) : 'Всё'}</button>`)
      .join('')}<button class="chip" data-new>${icon('plus', 13)} Папка</button></div>
      <div class="col" style="gap:8px" data-rows></div>`;
    const rows = body.querySelector('[data-rows]');
    rows.innerHTML = list.length
      ? list
          .map(
            (row) => `<div class="card" style="padding:12px" data-row="${esc(String(row.id))}">
              <div class="row" style="gap:8px">${avatar(row.author, 36)}
                <div class="grow" style="min-width:0">
                  <div class="small strong truncate">${esc(row.author?.displayName || '')}</div>
                  <div class="tiny muted">сохранено ${esc(timeAgo(row.savedAt))} назад${row.folder ? ' в «' + esc(row.folder) + '»' : ''}</div>
                </div>
                <button class="btn btn-icon btn-ghost" data-move="${esc(String(row.id))}">${icon('more', 16)}</button>
                <button class="btn btn-icon btn-ghost" data-drop="${esc(String(row.id))}">${icon('close', 16)}</button>
              </div>
              ${row.text ? `<div class="small" style="margin-top:8px;line-height:1.45">${esc(row.text.slice(0, 220))}</div>` : ''}
              ${row.image ? `<div class="post-image" style="margin-top:10px"><img src="${esc(row.image)}" alt=""></div>` : ''}
            </div>`
          )
          .join('')
      : emptyState('star', 'Пока пусто', picked ? 'В этой папке ничего нет' : 'Сохраняйте записи, чтобы вернуться к ним позже');

    body.querySelectorAll('[data-folder]').forEach((button) => {
      button.onclick = () => {
        picked = button.dataset.folder;
        draw();
      };
    });
    body.querySelector('[data-new]').onclick = async () => {
      const { promptSheet } = await import('../ui.js');
      const name = await promptSheet({ title: 'Новая папка', label: 'Как назовём', placeholder: 'Например: перечитать' });
      if (!name) return;
      addFolder(name);
      draw();
    };
    body.querySelectorAll('[data-move]').forEach((button) => {
      button.onclick = () => {
        const menu = el(`<div class="col" style="gap:6px">
          ${['', ...folders()].map((name) => `<button class="list-item" data-put="${esc(name)}">${icon('star', 17)}<span>${name ? esc(name) : 'Без папки'}</span></button>`).join('')}
          ${folders().length ? '<div class="divider"></div>' : ''}
          ${folders().map((name) => `<button class="list-item" data-kill="${esc(name)}" style="color:#c98b8b">${icon('trash', 17)}<span>Удалить папку «${esc(name)}»</span></button>`).join('')}
        </div>`);
        const inner = openSheet('Куда положить', menu);
        menu.querySelectorAll('[data-put]').forEach((row) => {
          row.onclick = () => {
            setFolder(button.dataset.move, row.dataset.put);
            inner.close();
            draw();
          };
        });
        menu.querySelectorAll('[data-kill]').forEach((row) => {
          row.onclick = () => {
            dropFolder(row.dataset.kill);
            if (picked === row.dataset.kill) picked = '';
            inner.close();
            draw();
          };
        });
      };
    });
    body.querySelectorAll('[data-drop]').forEach((button) => {
      button.onclick = () => {
        dropSaved(button.dataset.drop);
        draw();
      };
    });
  };

  draw();
  return sheet;
}

async function load(root, options = {}) {
  const list = root.querySelector('[data-list]');
  if (!list) return;
  const key = state.moodFilter || 'all';

  if (!options.append) {
    feedState = { posts: [], cursor: null, more: true, busy: false, key };
    const cache = readFeedCache();
    if (cache && !state.moodFilter) {
      drawPosts(root, cache.posts, { cached: true, savedAt: cache.savedAt });
    } else {
      list.innerHTML = skeleton(3);
    }
  }

  if (isOffline()) {
    showCached(root, 'Нет интернета');
    return;
  }

  if (feedState.busy) return;
  feedState.busy = true;
  try {
    const onlyMine = state.moodFilter === 'mine';
    const query = { kind: 'feed', limit: 12 };
    if (state.moodFilter && !onlyMine) query.mood = state.moodFilter;
    if (options.append && feedState.cursor) query.before = feedState.cursor;
    const result = await api.listPosts(query);
    let posts = (result.posts || []).filter((post) => {
      const own = post.kind || 'text';
      return own !== 'video' && own !== 'album' && !post.video;
    });
    if (onlyMine && api.followState) {
      const authors = [...new Set(posts.map((post) => post.author?.id).filter(Boolean))];
      const known = new Map();
      for (const id of authors) {
        if (id === state.user?.id) {
          known.set(id, true);
          continue;
        }
        try {
          known.set(id, (await api.followState(id)).following);
        } catch {
          known.set(id, false);
        }
      }
      posts = posts.filter((post) => known.get(post.author?.id));
    }
    feedState.cursor = result.cursor ?? (posts.length ? posts[posts.length - 1].createdAt : null);
    feedState.more = result.more ?? posts.length >= 12;
    feedState.posts = options.append ? [...feedState.posts, ...posts] : posts;
    if (!state.moodFilter && !options.append) cacheFeed(feedState.posts);
    if (onlyMine && !posts.length && !options.append) list.innerHTML = emptyState('users', 'Пока пусто', 'Подпишитесь на кого-нибудь, и здесь появятся их записи');
    drawPosts(root, feedState.posts, {});
  } catch (error) {
    if (options.append) {
      feedState.more = false;
      drawPosts(root, feedState.posts, {});
      toast(error.message, 'err');
    } else if (isOffline() || /fetch|network|Failed|сет|время/i.test(error.message)) {
      showCached(root, 'Связь потеряна');
    } else {
      list.innerHTML = emptyState('warn', 'Не загрузилось', error.message);
    }
  } finally {
    feedState.busy = false;
  }
}

function showCached(root, reason) {
  const list = root.querySelector('[data-list]');
  const cache = readFeedCache();
  if (!cache) {
    list.innerHTML = emptyState('warn', 'Нет связи', 'Лента появится, когда интернет вернётся');
    return;
  }
  const posts = state.moodFilter ? cache.posts.filter((post) => post.mood === state.moodFilter) : cache.posts;
  drawPosts(root, posts, { cached: true, savedAt: cache.savedAt, reason });
}

function drawPosts(root, posts, meta) {
  const list = root.querySelector('[data-list]');
  if (!list) return;
  list.innerHTML = '';

  if (meta.cached) {
    list.appendChild(el(`<div class="card" style="border-color:rgba(198,176,131,.3);background:rgba(198,176,131,.07);padding:14px">
      <div class="row" style="align-items:flex-start;gap:10px">${icon('warn', 18)}
      <div class="grow"><div class="strong small">${esc(meta.reason || 'Загружаем свежее')}</div>
      <div class="tiny muted" style="margin-top:3px">Сохранённая лента, обновлена ${esc(timeAgo(meta.savedAt))} назад</div></div></div></div>`));
  }

  if (!posts.length) {
    list.appendChild(el(`<div>${emptyState('leaf', 'Пока тихо', 'Стань первым, кто расскажет о своём вечере')}</div>`));
    return;
  }

  const term = feedState.query || '';
  const shown = term
    ? posts.filter(
        (post) =>
          (post.text || '').toLowerCase().includes(term) ||
          (post.author?.displayName || '').toLowerCase().includes(term) ||
          (post.author?.username || '').toLowerCase().includes(term)
      )
    : posts;

  if (term && !shown.length) {
    list.appendChild(el(`<div>${emptyState('search', 'Ничего не нашли', 'Попробуйте другое слово')}</div>`));
    return;
  }

  shown.forEach((post, index) => {
    const hidden = mutedBy(post);
    if (hidden) {
      const folded = el(`<div class="card muted-post">
        <div class="row" style="gap:10px">
          <span class="muted">${icon('eye', 17)}</span>
          <div class="grow"><div class="small">Скрыто по вашей настройке</div>
          <div class="tiny muted">Стоп-слово: ${esc(hidden)}</div></div>
          <button class="btn btn-sm" data-show>Показать</button>
        </div>
      </div>`);
      folded.querySelector('[data-show]').onclick = () => {
        const card = postCard(post, () => load(root));
        folded.replaceWith(card);
      };
      list.appendChild(folded);
      return;
    }
    const card = postCard(post, () => load(root));
    card.style.animationDelay = `${Math.min(index, 8) * 30}ms`;
    list.appendChild(card);
  });

  if (term) return;

  if (meta.cached || !feedState.more) return;

  const more = el(`<button class="btn btn-more" data-more>${icon('refresh', 16)}<span>Показать ещё</span></button>`);
  more.onclick = () => {
    more.disabled = true;
    more.querySelector('span').textContent = 'Загружаем';
    load(root, { append: true });
  };
  list.appendChild(more);

  if ('IntersectionObserver' in window) {
    const watcher = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      watcher.disconnect();
      if (!feedState.busy && feedState.more) load(root, { append: true });
    }, { rootMargin: '400px' });
    watcher.observe(more);
  }
}

export function postMedia(post) {
  if (post.video) {
    return `<button class="post-video" data-play>
      ${post.poster ? `<img src="${esc(post.poster)}" alt="" loading="lazy">` : '<span class="post-video-blank"></span>'}
      <span class="post-video-play">${icon('play', 22)}</span>
      ${post.duration ? `<span class="post-video-time">${Math.floor(post.duration / 60)}:${String(post.duration % 60).padStart(2, '0')}</span>` : ''}
    </button>`;
  }
  const album = Array.isArray(post.media) ? post.media.filter(Boolean) : [];
  if (album.length > 1) {
    const shown = album.slice(0, 4);
    return `<div class="post-album cols-${Math.min(shown.length, 4)}" data-album>
      ${shown
        .map(
          (src, i) => `<span class="album-cell">
            <img class="album-shot" src="${esc(src)}" alt="" loading="lazy">
            ${i === 3 && album.length > 4 ? `<span class="album-more">+${album.length - 4}</span>` : ''}
          </span>`
        )
        .join('')}
      ${album.slice(4).map((src) => `<img class="album-hidden" src="${esc(src)}" alt="" hidden>`).join('')}
    </div>`;
  }
  const single = album[0] || post.image;
  return single ? `<div class="post-image"><img src="${esc(single)}" alt="" loading="lazy" decoding="async"></div>` : '';
}

function openPollComposer(root) {
  const body = el(`<div class="col" style="gap:9px">
    <input class="input" data-question maxlength="200" placeholder="Вопрос, например: как вы сегодня?">
    <input class="input" data-opt maxlength="60" placeholder="Вариант 1">
    <input class="input" data-opt maxlength="60" placeholder="Вариант 2">
    <input class="input" data-opt maxlength="60" placeholder="Вариант 3, не обязательно">
    <input class="input" data-opt maxlength="60" placeholder="Вариант 4, не обязательно">
    <button class="btn btn-primary" data-send>${icon('send', 17)} Опубликовать опрос</button>
  </div>`);
  const sheet = openSheet('Новый опрос', body);
  body.querySelector('[data-send]').onclick = async () => {
    const question = body.querySelector('[data-question]').value.trim();
    const options = [...body.querySelectorAll('[data-opt]')].map((input) => input.value.trim()).filter(Boolean);
    if (!question) return toast('Нужен вопрос', 'err');
    if (options.length < 2) return toast('Нужно хотя бы два варианта', 'err');
    try {
      await api.createPost({ text: question, mood: draft.mood, kind: 'text', poll: { options } });
      sheet.close();
      toast('Опрос опубликован');
      await load(root);
    } catch (error) {
      toast(error.message, 'err');
    }
  };
}

function pollBlock(post) {
  if (!post.poll?.options?.length) return '';
  return `<div class="poll" data-poll>${post.poll.options
    .map((label, i) => `<button class="poll-row" data-choice="${i}"><span class="poll-fill"></span><span class="poll-label">${esc(label)}</span><span class="poll-share"></span></button>`)
    .join('')}<div class="tiny muted" data-poll-total style="margin-top:7px">Загружаем</div></div>`;
}

async function wirePoll(card, post) {
  const box = card.querySelector('[data-poll]');
  if (!box) return;
  const draw = (result) => {
    const total = result.total || 0;
    box.querySelectorAll('[data-choice]').forEach((row) => {
      const n = result.counts?.[row.dataset.choice] || 0;
      const share = total ? Math.round((n / total) * 100) : 0;
      row.classList.toggle('on', String(result.mine) === row.dataset.choice);
      row.querySelector('.poll-fill').style.width = `${share}%`;
      row.querySelector('.poll-share').textContent = total ? `${share}%` : '';
    });
    box.querySelector('[data-poll-total]').textContent = total
      ? `${total} ${plural(total, 'голос', 'голоса', 'голосов').split(' ')[1]}`
      : 'Голосов пока нет';
  };
  try {
    draw(await api.pollResult(post.id));
  } catch {}
  box.querySelectorAll('[data-choice]').forEach((row) => {
    row.onclick = async (event) => {
      event.stopPropagation();
      try {
        draw(await api.pollVote(post.id, Number(row.dataset.choice)));
      } catch (error) {
        toast(error.message, 'err');
      }
    };
  });
}

function tagged(text) {
  return esc(text).replace(/(^|\s)#([\wа-яё]{2,24})/gi, (all, space, tag) => `${space}<span class="hashtag" data-tag="${tag.toLowerCase()}">#${tag}</span>`);
}


function voiceBlock(post) {
  const bars = [];
  let seed = Number(post.id) || 7;
  for (let i = 0; i < 26; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    bars.push(18 + ((seed >> 7) % 26));
  }
  return `<button class="voice-post" data-voice-play>
    <span class="voice-play">${icon('play', 16)}</span>
    <span class="voice-wave">${bars.map((height) => `<i style="height:${height}px"></i>`).join('')}</span>
    <span class="tiny muted voice-time">${post.duration ? Math.round(post.duration) + ' с' : 'голос'}</span>
    <audio preload="none" src="${esc(post.sound)}"></audio>
  </button>`;
}

function wireVoice(card) {
  const button = card.querySelector('[data-voice-play]');
  if (!button) return;
  const sound = button.querySelector('audio');
  const glyph = button.querySelector('.voice-play');
  button.onclick = (event) => {
    event.preventDefault();
    document.querySelectorAll('.voice-post audio').forEach((other) => {
      if (other !== sound) {
        other.pause();
        other.closest('.voice-post')?.classList.remove('on');
      }
    });
    if (sound.paused) {
      sound.play().catch(() => toast('Не удалось проиграть', 'err'));
      button.classList.add('on');
      glyph.innerHTML = icon('pause', 16);
    } else {
      sound.pause();
      button.classList.remove('on');
      glyph.innerHTML = icon('play', 16);
    }
  };
  sound.addEventListener('ended', () => {
    button.classList.remove('on');
    glyph.innerHTML = icon('play', 16);
  });
}

export function postCard(post, refresh, options = {}) {
  const mood = MOODS[post.mood] || MOODS.calm;
  const card = el(`
    <article class="card post appear">
      ${post.repostOf ? `<div class="post-repost">${icon('refresh', 13)}<span>Репост${post.origin ? ' записи ' + esc(post.origin.displayName) : ''}</span></div>` : ''}
      <div class="row">
        <button data-author style="display:contents">${avatar(post.author, 46)}</button>
        <div class="grow" style="min-width:0">
          <div class="row" style="gap:6px">
            <span class="strong truncate">${esc(post.author.displayName)}</span>
            ${badges(post.author)}
          </div>
          <div class="tiny muted truncate">@${esc(post.author.username)} · ${timeAgo(post.createdAt)} · <span class="mood-word" style="color:${mood.ink}">${esc(mood.label.toLowerCase())}</span></div>
        </div>
        <span class="mood-tag" style="${moodStyle(post.mood)}" title="${esc(mood.label)}"><i class="mood-dot"></i><span class="mood-label">${esc(mood.label)}</span></span>
        <button class="btn btn-icon btn-ghost" data-menu>${icon('more', 18)}</button>
      </div>
      ${post.pinned ? `<div class="post-repost">${icon('star', 13)}<span>Закреплено автором</span></div>` : ''}
      ${post.publishAt && post.publishAt > Date.now() ? `<div class="post-repost">${icon('clock', 13)}<span>Выйдет ${esc(timeAgo(post.publishAt).replace('назад', ''))} спустя, пока видно только вам</span></div>` : ''}
      ${post.text ? `<p class="post-text">${tagged(post.text)}</p>` : ''}
      ${post.sound && !post.media?.length && !post.video ? voiceBlock(post) : ''}
      ${postMedia(post)}
      ${pollBlock(post)}
      ${post.removed ? `<div class="pill bad" style="margin-top:10px">Скрыт модератором: ${esc(post.removedReason || 'без причины')}</div>` : ''}
      <div class="post-actions">
        <span data-reacts></span>
        <button class="icon-btn ${post.liked ? 'on' : ''}" data-like hidden>${icon('heart', 17)}<span>${post.likes}</span></button>
        <button class="icon-btn" data-comments>${icon('comment', 17)}<span>${post.comments}</span></button>
        <button class="icon-btn ${isSaved(post.id) ? 'on' : ''}" data-save title="Сохранить">${icon('star', 17)}</button>
        ${post.views ? `<span class="icon-btn" style="pointer-events:none">${icon('eye', 17)}<span>${post.views}</span></span>` : ''}
        <div class="grow"></div>
        <button class="icon-btn" data-share>${icon('share', 17)}</button>
        <button class="icon-btn" data-report>${icon('flag', 17)}</button>
      </div>
    </article>`);

  card.querySelector('[data-author]').onclick = () => {
    if (hasStory(post.author)) openStories(post.author.id);
    else openProfile(post.author.username);
  };

  card.querySelector('[data-save]').onclick = (event) => {
    const on = toggleSaved(post);
    event.currentTarget.classList.toggle('on', on);
    toast(on ? 'Сохранено' : 'Убрано из сохранённых');
  };

  card.querySelector('[data-share]').onclick = async () => {
    if (api.react) {
      const { openShareCard } = await import('./share.js');
      return openShareCard(post);
    }
    const text = `${post.author.displayName} (@${post.author.username}): ${post.text || 'запись в СпокУме'}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'СпокУм', text });
        return;
      } catch {}
    }
    navigator.clipboard?.writeText(text);
    toast('Скопировано');
  };

  let lastTouch = 0;
  card.addEventListener('click', (event) => {
    if (event.target.closest('button, a, .status-icon, img')) return;
    const now = Date.now();
    if (now - lastTouch < 320) {
      lastTouch = 0;
      const button = card.querySelector('[data-like]');
      if (!post.liked) button.click();
      const flash = el(`<span class="tap-heart">${icon('heart', 74)}</span>`);
      card.appendChild(flash);
      setTimeout(() => flash.remove(), 700);
      return;
    }
    lastTouch = now;
  });

  const plainLike = () => {
    const like = card.querySelector('[data-like]');
    if (like) like.hidden = false;
  };

  if (api.react) {
    import('./extras.js')
      .then(async ({ reactionRow, reactionsReady }) => {
        if (!(await reactionsReady())) return plainLike();
        const slot = card.querySelector('[data-reacts]');
        if (slot) slot.replaceWith(reactionRow(post));
      })
      .catch(plainLike);
  } else {
    plainLike();
  }

  card.querySelector('[data-like]').onclick = async (event) => {
    if (!state.user) return toast('Войдите, чтобы ставить лайки', 'err');
    const button = event.currentTarget;
    try {
      const { post: updated } = await api.toggleLike(post.id);
      button.classList.toggle('on', updated.liked);
      button.querySelector('span').textContent = updated.likes;
      post.liked = updated.liked;
      post.likes = updated.likes;
    } catch (error) {
      toast(error.message, 'err');
    }
  };

  card.querySelector('[data-play]')?.addEventListener('click', async () => {
    const { openVideo } = await import('./videos.js');
    openVideo(post, refresh);
  });

  if (post.poll && api.pollResult) wirePoll(card, post);
  wireVoice(card);

  card.querySelectorAll('.hashtag').forEach((tag) => {
    tag.onclick = (event) => {
      event.stopPropagation();
      const box = document.querySelector('[data-search]');
      const query = document.querySelector('[data-query]');
      if (!box || !query) return;
      box.hidden = false;
      query.value = '#' + tag.dataset.tag;
      query.dispatchEvent(new Event('input'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  });

  card.querySelector('[data-comments]').onclick = () =>
    openComments(post, () => {
      const counter = card.querySelector('[data-comments] span');
      if (counter) counter.textContent = post.comments;
    });
  card.querySelector('[data-report]').onclick = () => openReport('post', post.id);
  card.querySelector('[data-menu]').onclick = () => openPostMenu(post, refresh, options);
  return card;
}

function openPostMenu(post, refresh, options) {
  const mine = state.user && post.author.id === state.user.id;
  const canModerate = state.user && (state.user.isModerator || state.user.isAdmin);
  const body = el(`
    <div class="col" style="gap:6px">
      ${mine && api.pinPost ? `<button class="list-item" data-pin>${icon('star', 18)}<span>${post.pinned ? 'Открепить' : 'Закрепить у себя'}</span></button>` : ''}
      <button class="list-item" data-card>${icon('image', 18)}<span>Сохранить картинкой</span></button>
      <button class="list-item" data-copy>${icon('share', 18)}<span>Скопировать текст</span></button>
      <button class="list-item" data-open>${icon('profile', 18)}<span>Профиль автора</span></button>
      ${canModerate && !mine ? `<button class="list-item" data-remove style="color:#c98b8b">${icon('trash', 18)}<span>Снять с публикации</span></button>` : ''}
      ${mine || (state.user && state.user.isAdmin) ? `<button class="list-item" data-delete style="color:#c98b8b">${icon('trash', 18)}<span>Удалить пост</span></button>` : ''}
    </div>`);
  const sheet = openSheet('', body);
  body.querySelector('[data-pin]')?.addEventListener('click', async () => {
    try {
      await api.pinPost(post.id, !post.pinned);
      sheet.close();
      toast(post.pinned ? 'Откреплено' : 'Закреплено');
      refresh?.();
    } catch (error) {
      toast(error.message, 'err');
    }
  });
  body.querySelector('[data-card]')?.addEventListener('click', async () => {
    sheet.close();
    const { openShareCard } = await import('./share.js');
    openShareCard(post);
  });
  body.querySelector('[data-copy]').onclick = () => {
    navigator.clipboard?.writeText(post.text || '');
    toast('Текст скопирован');
    sheet.close();
  };
  body.querySelector('[data-open]').onclick = () => {
    sheet.close();
    openProfile(post.author.username);
  };
  body.querySelector('[data-delete]')?.addEventListener('click', async () => {
    sheet.close();
    if (!(await confirmSheet({ title: 'Удалить пост', text: 'Пост исчезнет навсегда', confirm: 'Удалить', danger: true }))) return;
    await api.deletePost(post.id);
    toast('Удалено');
    refresh?.();
  });
  body.querySelector('[data-remove]')?.addEventListener('click', async () => {
    sheet.close();
    const { promptSheet } = await import('../ui.js');
    const reason = await promptSheet({ title: 'Причина снятия', label: 'Что нарушает пост', placeholder: 'Например: агрессия в адрес пользователя', multiline: true });
    if (!reason) return;
    const { askProofShot } = await import('./mod.js');
    const proof = await askProofShot(reason);
    if (!proof) return;
    try {
      await api.removePost(post.id, reason, proof);
      toast('Пост снят, действие записано');
      refresh?.();
      options.onModerate?.();
    } catch (error) {
      toast(error.message, 'err');
    }
  });
}

export function openReport(targetKind, targetId) {
  if (!state.user) return toast('Войдите, чтобы жаловаться', 'err');
  const body = el(`
    <div class="col">
      <textarea class="textarea" placeholder="Что произошло? Чем подробнее, тем быстрее разберёмся"></textarea>
      <div data-shot></div>
      <div class="row">
        <button class="btn grow" data-attach>${icon('image', 17)} Прикрепить фото</button>
        <button class="btn btn-primary grow" data-send>Отправить</button>
      </div>
      <p class="tiny muted" style="margin:0">Жалобу увидят модераторы. Ложные жалобы тоже видны.</p>
    </div>`);
  const sheet = openSheet('Пожаловаться', body);
  let image = null;
  const shot = body.querySelector('[data-shot]');
  body.querySelector('[data-attach]').onclick = async () => {
    image = await pickImage(1000);
    shot.innerHTML = image ? `<div class="post-image"><img src="${esc(image)}" alt=""></div>` : '';
  };
  body.querySelector('[data-send]').onclick = async () => {
    const reason = body.querySelector('textarea').value.trim();
    if (!reason) return toast('Опишите причину', 'err');
    try {
      await api.report({ targetKind, targetId, reason, image });
      sheet.close();
      toast('Жалоба отправлена');
    } catch (error) {
      toast(error.message, 'err');
    }
  };
}

export async function openComments(post, refresh) {
  const body = el(`
    <div class="col">
      <div class="col" data-list style="gap:10px"></div>
      ${state.user ? `<div class="row"><input class="input grow" placeholder="Поддержать словом" maxlength="500"><button class="btn btn-primary btn-icon" data-send>${icon('send', 17)}</button></div>` : '<div class="small muted">Войдите, чтобы отвечать</div>'}
    </div>`);
  const sheet = openSheet(plural(post.comments, 'ответ', 'ответа', 'ответов'), body, { onClose: () => refresh?.(post) });
  const list = body.querySelector('[data-list]');

  const draw = async () => {
    const { comments } = await api.listComments(post.id);
    post.comments = comments.length;
    if (!comments.length) {
      list.innerHTML = '<div class="small muted center" style="padding:16px 0">Пока никто не ответил</div>';
      return;
    }
    list.innerHTML = '';
    const mod = state.user && (state.user.isModerator || state.user.isAdmin);
    comments.forEach((c) => {
      const mine = state.user && c.author?.id === state.user.id;
      const host = state.user && post.author?.id === state.user.id;
      const row = el(`<div class="row" style="align-items:flex-start">${avatar(c.author, 40)}
        <div class="grow" style="min-width:0">
          <div class="row" style="gap:6px"><span class="strong small truncate">${esc(c.author.displayName)}</span>${badges(c.author)}<span class="tiny muted">${esc(timeAgo(c.createdAt))}</span></div>
          ${c.removed
            ? `<div class="tiny" style="margin-top:3px;color:#c98b8b">Снят модератором${c.removedReason ? ': ' + esc(c.removedReason) : ''}</div>`
            : `<div class="small" style="margin-top:2px;line-height:1.45;word-break:break-word">${esc(c.text)}</div>`}
        </div>
        ${c.removed ? '' : `<button class="btn btn-icon btn-ghost" data-comment-menu style="width:30px;height:30px;flex:none">${icon('more', 15)}</button>`}
      </div>`);

      row.querySelector('[data-comment-menu]')?.addEventListener('click', () => {
        const menu = el(`<div class="col" style="gap:6px">
          ${mine || host ? `<button class="list-item" data-drop style="color:#c98b8b">${icon('trash', 18)}<span>Удалить</span></button>` : ''}
          ${mod && !mine ? `<button class="list-item" data-take style="color:#c6b083">${icon('shield', 18)}<span>Снять с причиной</span></button>` : ''}
          ${!mine ? `<button class="list-item" data-flag>${icon('flag', 18)}<span>Пожаловаться</span></button>` : ''}
          <button class="list-item" data-copy>${icon('share', 18)}<span>Скопировать текст</span></button>
        </div>`);
        const inner = openSheet('', menu);
        menu.querySelector('[data-copy]').onclick = () => {
          navigator.clipboard?.writeText(c.text || '');
          inner.close();
          toast('Скопировано');
        };
        menu.querySelector('[data-drop]')?.addEventListener('click', async () => {
          inner.close();
          const ok = await confirmSheet({ title: 'Удалить комментарий', text: 'Он пропадёт навсегда.', confirm: 'Удалить', danger: true });
          if (!ok) return;
          try {
            await api.deleteComment(c.id);
            post.comments = Math.max(0, (post.comments || 1) - 1);
            await draw();
            refresh?.(post);
          } catch (error) {
            toast(error.message, 'err');
          }
        });
        menu.querySelector('[data-take]')?.addEventListener('click', async () => {
          inner.close();
          const { promptSheet } = await import('../ui.js');
          const reason = await promptSheet({ title: 'Причина снятия', label: 'Её увидят автор и админ', placeholder: 'Например: оскорбление', multiline: true });
          if (!reason) return;
          try {
            await api.deleteComment(c.id, reason);
            await draw();
            toast('Комментарий снят');
          } catch (error) {
            toast(error.message, 'err');
          }
        });
        menu.querySelector('[data-flag]')?.addEventListener('click', () => {
          inner.close();
          openReport('comment', c.id);
        });
      });

      list.appendChild(row);
    });
  };
  await draw();

  const input = body.querySelector('input');
  const button = body.querySelector('[data-send]');
  let busy = false;
  const send = async () => {
    if (busy) return;
    const text = input.value.trim();
    if (!text) return;
    busy = true;
    input.value = '';
    input.disabled = true;
    if (button) button.disabled = true;
    try {
      await api.addComment(post.id, text);
      post.comments += 1;
      await draw();
    } catch (error) {
      input.value = text;
      toast(error.message, 'err');
    } finally {
      busy = false;
      input.disabled = false;
      if (button) button.disabled = false;
      input.focus();
    }
  };
  button?.addEventListener('click', send);
  input?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    send();
  });
}
