import { api, state, MOODS, moodStyle, cacheFeed, readFeedCache, isOffline, isPremium } from '../store.js';
import { el, esc, timeAgo, plural } from '../util.js';
import { icon } from '../icons.js';
import { avatar, badges, toast, openSheet, confirmSheet, pickImage, emptyState, hasStory } from '../ui.js';
import { openProfile } from './profile.js';
import { openStories, publishStory } from './stories.js';
import { isSaved, toggleSaved, savedList, dropSaved } from '../saved.js';

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
      ${draft.text.trim() ? '<div class="tiny muted" style="margin:6px 0 0">Черновик сохранён, можно уйти и вернуться</div>' : ''}
      <div class="chips" data-moods style="margin:12px 0 10px"></div>
      <div data-offer></div>
      <div class="composer-actions">
        <div class="composer-tools">
          <button class="icon-btn" data-image>${icon('image', 18)}<span>Фото</span></button>
          <button class="icon-btn" data-reels>${icon('video', 18)}<span>В Видео</span></button>
          <button class="icon-btn" data-poll-new>${icon('chart', 18)}<span>Опрос</span></button>
          ${isPremium(state.user) ? `<button class="icon-btn" data-story>${icon('play', 18)}<span>История</span></button>` : ''}
        </div>
        <button class="btn btn-primary btn-sm composer-send" data-send>${icon('send', 16)}<span>Опубликовать</span></button>
      </div>
    </div>`);

  card.querySelector('[data-poll-new]')?.addEventListener('click', () => openPollComposer(root));

  const area = card.querySelector('textarea');
  area.value = draft.text;
  area.addEventListener('input', () => {
    draft.text = area.value;
    saveDraft();
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
  const list = savedList();
  const body = el(`<div class="col" style="gap:8px">${
    list.length
      ? list
          .map(
            (row) => `<div class="card" style="padding:12px" data-row="${esc(String(row.id))}">
              <div class="row" style="gap:8px">${avatar(row.author, 36)}
                <div class="grow" style="min-width:0">
                  <div class="small strong truncate">${esc(row.author?.displayName || '')}</div>
                  <div class="tiny muted">сохранено ${esc(timeAgo(row.savedAt))} назад</div>
                </div>
                <button class="btn btn-icon btn-ghost" data-drop="${esc(String(row.id))}">${icon('close', 16)}</button>
              </div>
              ${row.text ? `<div class="small" style="margin-top:8px;line-height:1.45">${esc(row.text.slice(0, 220))}</div>` : ''}
              ${row.image ? `<div class="post-image" style="margin-top:10px"><img src="${esc(row.image)}" alt=""></div>` : ''}
            </div>`
          )
          .join('')
      : emptyState('star', 'Пока пусто', 'Сохраняйте записи, чтобы вернуться к ним позже')
  }</div>`);
  const sheet = openSheet('Сохранённое', body);
  body.querySelectorAll('[data-drop]').forEach((button) => {
    button.onclick = () => {
      dropSaved(button.dataset.drop);
      button.closest('[data-row]').remove();
      if (!body.querySelector('[data-row]')) {
        sheet.close();
        toast('Список пуст');
      }
    };
  });
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
          <div class="tiny muted truncate">@${esc(post.author.username)} · ${timeAgo(post.createdAt)}</div>
        </div>
        <span class="mood-tag" style="${moodStyle(post.mood)}" title="${esc(mood.label)}"><i class="mood-dot"></i><span class="mood-label">${esc(mood.label)}</span></span>
        <button class="btn btn-icon btn-ghost" data-menu>${icon('more', 18)}</button>
      </div>
      ${post.pinned ? `<div class="post-repost">${icon('star', 13)}<span>Закреплено автором</span></div>` : ''}
      ${post.text ? `<p class="post-text">${tagged(post.text)}</p>` : ''}
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
