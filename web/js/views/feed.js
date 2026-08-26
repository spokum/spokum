import { api, state, MOODS, moodStyle, cacheFeed, readFeedCache, isOffline, isPremium } from '../store.js';
import { el, esc, timeAgo, plural } from '../util.js';
import { icon } from '../icons.js';
import { avatar, badges, toast, openSheet, confirmSheet, pickImage, emptyState } from '../ui.js';
import { openProfile } from './profile.js';

let draft = { text: '', image: null, mood: 'calm' };

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
    <div data-composer></div>
    <div class="chips" data-filters style="margin:14px 0 12px"></div>
    <div class="col" data-list></div>`;

  root.querySelector('[data-refresh]').onclick = () => load(root);
  renderComposer(root);
  renderFilters(root);
  await load(root);
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
      <div class="row between">
        <div class="row" style="gap:4px">
          <button class="icon-btn" data-image>${icon('image', 18)}<span>Фото</span></button>
        </div>
        <button class="btn btn-primary btn-sm" data-send>${icon('send', 16)} Опубликовать</button>
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
  moods.querySelectorAll('[data-mood]').forEach((button) => {
    button.onclick = () => {
      draft.mood = button.dataset.mood;
      moods.querySelectorAll('[data-mood]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    };
  });

  const preview = card.querySelector('[data-preview]');
  const drawPreview = () => {
    preview.innerHTML = draft.image
      ? `<div class="post-image" style="position:relative"><img src="${esc(draft.image)}" alt=""><button class="btn btn-icon" data-drop style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.55)">${icon('close', 16)}</button></div>`
      : '';
    preview.querySelector('[data-drop]')?.addEventListener('click', () => {
      draft.image = null;
      drawPreview();
    });
  };
  drawPreview();

  card.querySelector('[data-image]').onclick = async () => {
    const image = await pickImage(isPremium(state.user) ? 2000 : 1400);
    if (image) {
      draft.image = image;
      drawPreview();
    }
  };

  card.querySelector('[data-send]').onclick = async (event) => {
    if (isOffline()) return toast('Нет интернета, пост не отправится', 'err');
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await api.createPost({ text: draft.text, image: draft.image, mood: draft.mood });
      draft = { text: '', image: null, mood: 'calm' };
      renderComposer(root);
      await load(root);
      toast('Опубликовано');
    } catch (error) {
      toast(error.message, 'err');
    } finally {
      button.disabled = false;
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

async function load(root) {
  const list = root.querySelector('[data-list]');
  list.innerHTML = '<div class="card" style="height:120px;opacity:.4"></div><div class="card" style="height:120px;opacity:.25"></div>';
  const draw = (posts, note) => {
    list.innerHTML = '';
    if (note) list.appendChild(el(note));
    if (!posts.length) {
      list.appendChild(el(`<div>${emptyState('leaf', 'Пока тихо', 'Стань первым, кто расскажет о своём вечере')}</div>`));
      return;
    }
    posts.forEach((post, index) => {
      const card = postCard(post, () => load(root));
      card.style.animationDelay = `${Math.min(index, 8) * 30}ms`;
      list.appendChild(card);
    });
  };

  const showCached = (reason) => {
    const cache = readFeedCache();
    if (!cache) {
      list.innerHTML = emptyState('warn', 'Нет связи', 'Лента появится, когда интернет вернётся');
      return;
    }
    const saved = timeAgo(cache.savedAt);
    const posts = state.moodFilter ? cache.posts.filter((post) => post.mood === state.moodFilter) : cache.posts;
    draw(posts, `<div class="card" style="border-color:rgba(198,176,131,.3);background:rgba(198,176,131,.07);padding:14px">
      <div class="row" style="align-items:flex-start;gap:10px">${icon('warn', 18)}
      <div class="grow"><div class="strong small">${esc(reason)}</div>
      <div class="tiny muted" style="margin-top:3px">Это сохранённая лента, обновлена ${esc(saved)} назад. Новые записи появятся со связью.</div></div></div></div>`);
  };

  if (isOffline()) {
    showCached('Нет интернета');
    return;
  }

  try {
    const { posts } = await api.listPosts(state.moodFilter ? { mood: state.moodFilter } : {});
    if (!state.moodFilter) cacheFeed(posts);
    draw(posts, null);
  } catch (error) {
    if (isOffline() || /fetch|network|Failed|сет/i.test(error.message)) showCached('Связь потеряна');
    else list.innerHTML = emptyState('warn', 'Не загрузилось', error.message);
  }
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
        <span class="mood-tag" style="${moodStyle(post.mood)}"><i class="mood-dot"></i>${esc(mood.label)}</span>
        <button class="btn btn-icon btn-ghost" data-menu>${icon('more', 18)}</button>
      </div>
      ${post.text ? `<p class="post-text">${esc(post.text)}</p>` : ''}
      ${post.image ? `<div class="post-image"><img src="${esc(post.image)}" alt="" loading="lazy"></div>` : ''}
      ${post.removed ? `<div class="pill bad" style="margin-top:10px">Скрыт модератором: ${esc(post.removedReason || 'без причины')}</div>` : ''}
      <div class="post-actions">
        <button class="icon-btn ${post.liked ? 'on' : ''}" data-like>${icon('heart', 17)}<span>${post.likes}</span></button>
        <button class="icon-btn" data-comments>${icon('comment', 17)}<span>${post.comments}</span></button>
        <div class="grow"></div>
        <button class="icon-btn" data-report>${icon('flag', 17)}</button>
      </div>
    </article>`);

  card.querySelector('[data-author]').onclick = () => openProfile(post.author.username);

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

async function openComments(post, refresh) {
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
