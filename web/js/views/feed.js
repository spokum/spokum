import { api, state, MOODS, moodStyle, cacheFeed, readFeedCache, isOffline, isPremium } from '../store.js';
import { el, esc, timeAgo, plural } from '../util.js';
import { icon } from '../icons.js';
import { avatar, badges, toast, openSheet, confirmSheet, pickImage, emptyState, hasStory } from '../ui.js';
import { openProfile } from './profile.js';
import { openStories, publishStory } from './stories.js';

let draft = { text: '', media: [], mood: 'calm' };

export async function render(root) {
  root.innerHTML = `
    <div class="topbar">
      <div class="brand">
        <div>
          <h1>Лента</h1>
          <p class="sub">Как ты сегодня на самом деле</p>
        </div>
      </div>
      <div class="spacer"></div>
      <button class="btn btn-icon" data-refresh title="Обновить">${icon('refresh', 18)}</button>
    </div>
    ${api.mode === 'local' ? `<div class="card" style="border-color:rgba(255,203,107,.3);background:rgba(255,203,107,.07)"><div class="row" style="align-items:flex-start;gap:10px">${icon('warn', 18)}<div class="grow"><div class="strong small">Автономный режим</div><div class="tiny muted" style="margin-top:3px;line-height:1.5">База не подключена, поэтому аккаунт и записи живут только в этом браузере. Впишите ключи Supabase в файл config.js, и сеть станет общей для всех.</div></div></div></div>` : ''}
    <div data-announce></div>
    <div data-composer></div>
    <div class="chips" data-filters style="margin:14px 0 12px"></div>
    <div class="col" data-list></div>`;

  root.querySelector('[data-refresh]').onclick = () => load(root);
  renderComposer(root);
  renderFilters(root);
  loadAnnouncements(root);
  await load(root);
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
      <div class="row" style="align-items:flex-start">
        ${avatar(state.user, 40)}
        <textarea class="textarea grow" maxlength="${isPremium(state.user) ? 5000 : 2000}" placeholder="Поделись состоянием. Здесь не осудят"></textarea>
      </div>
      <div data-preview></div>
      <div class="chips" data-moods style="margin:12px 0 10px"></div>
      <div data-offer></div>
      <div class="composer-actions">
        <div class="composer-tools">
          <button class="icon-btn" data-image>${icon('image', 18)}<span>Фото</span></button>
          <button class="icon-btn" data-album>${icon('album', 18)}<span>Альбом</span></button>
          <button class="icon-btn" data-video>${icon('video', 18)}<span>Видео</span></button>
          ${isPremium(state.user) ? `<button class="icon-btn" data-story>${icon('play', 18)}<span>История</span></button>` : ''}
        </div>
        <button class="btn btn-primary btn-sm composer-send" data-send>${icon('send', 16)}<span>Опубликовать</span></button>
      </div>
    </div>`);

  const area = card.querySelector('textarea');
  area.value = draft.text;
  area.addEventListener('input', () => {
    draft.text = area.value;
    area.style.height = 'auto';
    area.style.height = `${Math.min(220, area.scrollHeight)}px`;
  });

  const moods = card.querySelector('[data-moods]');
  moods.innerHTML = Object.entries(MOODS)
    .map(([key, m]) => `<button class="chip" style="${moodStyle(key)}" data-mood="${key}" aria-pressed="${draft.mood === key}"><i class="mood-dot"></i>${esc(m.label)}</button>`)
    .join('');
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

  moods.querySelectorAll('[data-mood]').forEach((button) => {
    button.onclick = () => {
      draft.mood = button.dataset.mood;
      moods.querySelectorAll('[data-mood]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      refreshOffer();
    };
  });
  refreshOffer();

  const preview = card.querySelector('[data-preview]');
  const drawPreview = () => {
    if (draft.video) {
      preview.innerHTML = `<div class="post-image" style="position:relative">
        <img src="${esc(draft.video.poster || '')}" alt="">
        <span class="post-video-play">${icon('play', 22)}</span>
        <button class="btn btn-icon" data-drop style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.55)">${icon('close', 16)}</button></div>`;
    } else if (draft.media.length) {
      preview.innerHTML = `<div class="composer-shots">${draft.media
        .map((src, i) => `<span class="composer-shot"><img src="${esc(src)}" alt=""><button class="shot-drop" data-drop-one="${i}">${icon('close', 13)}</button></span>`)
        .join('')}</div>`;
    } else {
      preview.innerHTML = '';
    }
    preview.querySelector('[data-drop]')?.addEventListener('click', () => {
      draft.video = null;
      drawPreview();
    });
    preview.querySelectorAll('[data-drop-one]').forEach((button) => {
      button.onclick = () => {
        draft.media.splice(Number(button.dataset.dropOne), 1);
        drawPreview();
      };
    });
  };
  drawPreview();

  const addImages = async (many) => {
    const limit = isPremium(state.user) ? 10 : 6;
    for (let i = 0; i < (many ? limit : 1); i++) {
      if (draft.media.length >= limit) {
        toast(`Не больше ${limit} фото в альбоме`, 'err');
        break;
      }
      const image = await pickImage(isPremium(state.user) ? 2000 : 1400);
      if (!image) break;
      draft.video = null;
      draft.media.push(image);
      drawPreview();
      if (!many) break;
    }
  };

  card.querySelector('[data-image]').onclick = () => addImages(false);
  card.querySelector('[data-album]').onclick = () => addImages(true);

  card.querySelector('[data-video]').onclick = async () => {
    const { pickVideo } = await import('../ui.js');
    const picked = await pickVideo(90);
    if (!picked) return;
    draft.media = [];
    draft.video = picked;
    drawPreview();
  };

  card.querySelector('[data-story]')?.addEventListener('click', () => publishStory(() => load(root)));

  card.querySelector('[data-send]').onclick = async (event) => {
    if (isOffline()) return toast('Нет интернета, пост не отправится', 'err');
    const button = event.currentTarget;
    button.disabled = true;
    const label = button.querySelector('span');
    const previous = label ? label.textContent : '';
    try {
      let media = draft.media;
      let video = null;
      let poster = null;
      if (api.uploadMedia && api.mode === 'supabase') {
        if (label) label.textContent = 'Загружаем';
        media = [];
        for (const item of draft.media) media.push(await api.uploadMedia(item, 'jpg'));
        if (draft.video) {
          video = await api.uploadMedia(draft.video.data, 'mp4');
          poster = draft.video.poster ? await api.uploadMedia(draft.video.poster, 'jpg') : null;
        }
      } else if (draft.video) {
        video = draft.video.data;
        poster = draft.video.poster;
      }
      await api.createPost({
        text: draft.text,
        image: media[0] || poster || null,
        media,
        video,
        poster,
        duration: draft.video?.duration || 0,
        kind: video ? 'video' : media.length > 1 ? 'album' : 'text',
        mood: draft.mood
      });
      draft = { text: '', media: [], mood: 'calm' };
      renderComposer(root);
      await load(root);
      toast(video ? 'Видео опубликовано' : 'Опубликовано');
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
  const entries = [['', 'Всё'], ...Object.entries(MOODS).map(([key, m]) => [key, m.label])];
  host.innerHTML = entries
    .map(([key, label]) => {
      const active = (state.moodFilter || '') === key;
      return `<button class="chip" data-filter="${key}" style="${key ? moodStyle(key) : ''}" aria-pressed="${active}">${key ? '<i class="mood-dot"></i>' : ''}${esc(label)}</button>`;
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

let feedState = { posts: [], cursor: null, more: true, busy: false, key: '' };

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
    const query = { kind: 'feed', limit: 12 };
    if (state.moodFilter) query.mood = state.moodFilter;
    if (options.append && feedState.cursor) query.before = feedState.cursor;
    const result = await api.listPosts(query);
    const posts = result.posts || [];
    feedState.cursor = result.cursor ?? (posts.length ? posts[posts.length - 1].createdAt : null);
    feedState.more = result.more ?? posts.length >= 12;
    feedState.posts = options.append ? [...feedState.posts, ...posts] : posts;
    if (!state.moodFilter && !options.append) cacheFeed(feedState.posts);
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

  posts.forEach((post, index) => {
    const card = postCard(post, () => load(root));
    card.style.animationDelay = `${Math.min(index, 8) * 30}ms`;
    list.appendChild(card);
  });

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

export function postCard(post, refresh, options = {}) {
  const mood = MOODS[post.mood] || MOODS.calm;
  const card = el(`
    <article class="card post appear">
      <div class="row">
        <button data-author style="display:contents">${avatar(post.author, 46)}</button>
        <div class="grow" style="min-width:0">
          <div class="row" style="gap:6px">
            <span class="strong truncate">${esc(post.author.displayName)}</span>
            ${badges(post.author)}
          </div>
          <div class="tiny muted truncate">@${esc(post.author.username)} · ${timeAgo(post.createdAt)}</div>
        </div>
        <span class="mood-tag" style="${moodStyle(post.mood)}" title="${esc(mood.label)}"><i class="mood-dot"></i><span class="mood-label">${esc(mood.label)}</span></span>
        <button class="btn btn-icon btn-ghost" data-menu>${icon('more', 18)}</button>
      </div>
      ${post.text ? `<p class="post-text">${esc(post.text)}</p>` : ''}
      ${postMedia(post)}
      ${post.removed ? `<div class="pill bad" style="margin-top:10px">Скрыт модератором: ${esc(post.removedReason || 'без причины')}</div>` : ''}
      <div class="post-actions">
        <button class="icon-btn ${post.liked ? 'on' : ''}" data-like>${icon('heart', 17)}<span>${post.likes}</span></button>
        <button class="icon-btn" data-comments>${icon('comment', 17)}<span>${post.comments}</span></button>
        ${post.views ? `<span class="icon-btn" style="pointer-events:none">${icon('eye', 17)}<span>${post.views}</span></span>` : ''}
        <div class="grow"></div>
        <button class="icon-btn" data-report>${icon('flag', 17)}</button>
      </div>
    </article>`);

  card.querySelector('[data-author]').onclick = () => {
    if (hasStory(post.author)) openStories(post.author.id);
    else openProfile(post.author.username);
  };

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

  card.querySelector('[data-comments]').onclick = () => openComments(post, refresh);
  card.querySelector('[data-report]').onclick = () => openReport('post', post.id);
  card.querySelector('[data-menu]').onclick = () => openPostMenu(post, refresh, options);
  return card;
}

function openPostMenu(post, refresh, options) {
  const mine = state.user && post.author.id === state.user.id;
  const canModerate = state.user && (state.user.isModerator || state.user.isAdmin);
  const body = el(`
    <div class="col" style="gap:6px">
      <button class="list-item" data-copy>${icon('share', 18)}<span>Скопировать текст</span></button>
      <button class="list-item" data-open>${icon('profile', 18)}<span>Профиль автора</span></button>
      ${canModerate && !mine ? `<button class="list-item" data-remove style="color:#c98b8b">${icon('trash', 18)}<span>Снять с публикации</span></button>` : ''}
      ${mine || (state.user && state.user.isAdmin) ? `<button class="list-item" data-delete style="color:#c98b8b">${icon('trash', 18)}<span>Удалить пост</span></button>` : ''}
    </div>`);
  const sheet = openSheet('', body);
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
    try {
      await api.removePost(post.id, reason);
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
  const sheet = openSheet(plural(post.comments, 'ответ', 'ответа', 'ответов'), body, { onClose: refresh });
  const list = body.querySelector('[data-list]');

  const draw = async () => {
    const { comments } = await api.listComments(post.id);
    list.innerHTML = comments.length
      ? comments
          .map(
            (c) => `<div class="row" style="align-items:flex-start">${avatar(c.author, 40)}
              <div class="grow"><div class="row" style="gap:6px"><span class="strong small">${esc(c.author.displayName)}</span>${badges(c.author)}<span class="tiny muted">${timeAgo(c.createdAt)}</span></div>
              <div class="small" style="margin-top:2px;line-height:1.45">${esc(c.text)}</div></div></div>`
          )
          .join('')
      : '<div class="small muted center" style="padding:16px 0">Пока никто не ответил</div>';
  };
  await draw();

  const input = body.querySelector('input');
  const send = async () => {
    const text = input.value.trim();
    if (!text) return;
    try {
      await api.addComment(post.id, text);
      input.value = '';
      await draw();
    } catch (error) {
      toast(error.message, 'err');
    }
  };
  body.querySelector('[data-send]')?.addEventListener('click', send);
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') send();
  });
}
