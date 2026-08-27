import { api, state, isOffline, isPremium } from '../store.js';
import { el, esc, timeAgo, plural } from '../util.js';
import { icon } from '../icons.js';
import { avatar, badges, toast, openSheet, emptyState } from '../ui.js';
import { openProfile } from './profile.js';

let feed = { items: [], cursor: null, more: true, busy: false };

export async function render(root) {
  root.innerHTML = `
    <div class="topbar">
      <div><h1>Видео</h1><p class="sub">Короткие ролики без спешки</p></div>
      <div class="spacer"></div>
      ${state.user ? `<button class="btn btn-primary btn-sm" data-shoot>${icon('video', 16)}<span>Снять</span></button>` : ''}
    </div>
    <div class="shorts" data-shorts></div>`;

  root.querySelector('[data-shoot]')?.addEventListener('click', () => shoot(() => render(root)));

  const stage = root.querySelector('[data-shorts]');
  stage.innerHTML = `<div class="shorts-slide"><div class="shorts-skeleton"></div></div>`;

  if (isOffline()) {
    stage.innerHTML = emptyState('warn', 'Нет интернета', 'Видео появятся со связью');
    return;
  }

  feed = { items: [], cursor: null, more: true, busy: false };
  await more(stage);
  if (!feed.items.length) {
    stage.innerHTML = emptyState('video', 'Пока ни одного ролика', 'Снимите первое видео и покажите его сети');
  }
}

async function more(stage) {
  if (feed.busy || !feed.more) return;
  feed.busy = true;
  try {
    const query = { kind: 'video', limit: 6 };
    if (feed.cursor) query.before = feed.cursor;
    const { posts, cursor, more: hasMore } = await api.listPosts(query);
    feed.cursor = cursor ?? (posts.length ? posts[posts.length - 1].createdAt : null);
    feed.more = hasMore ?? posts.length >= 6;
    if (!feed.items.length) stage.innerHTML = '';
    posts.forEach((post) => {
      feed.items.push(post);
      stage.appendChild(slide(post, stage));
    });
    watch(stage);
  } catch (error) {
    if (!feed.items.length) stage.innerHTML = emptyState('warn', 'Не загрузилось', error.message);
    feed.more = false;
  } finally {
    feed.busy = false;
  }
}

let observer = null;

function watch(stage) {
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const video = entry.target.querySelector('video');
        if (!video) continue;
        if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
          if (!video.dataset.ready) {
            video.dataset.ready = '1';
            video.src = video.dataset.src;
          }
          video.play().catch(() => {});
          const id = Number(entry.target.dataset.post);
          if (!entry.target.dataset.counted) {
            entry.target.dataset.counted = '1';
            api.bumpViews?.(id).catch(() => {});
          }
          if (feed.more && entry.target === stage.lastElementChild) more(stage);
        } else {
          video.pause();
        }
      }
    },
    { threshold: [0, 0.61, 1] }
  );
  [...stage.querySelectorAll('.shorts-slide')].forEach((node) => observer.observe(node));
}

function slide(post, stage) {
  const node = el(`
    <div class="shorts-slide" data-post="${post.id}">
      <video playsinline loop muted preload="none" data-src="${esc(post.video || '')}" ${post.poster ? `poster="${esc(post.poster)}"` : ''}></video>
      <div class="shorts-shade"></div>
      <button class="shorts-sound" data-sound>${icon('mute', 18)}</button>
      <div class="shorts-rail">
        <button class="shorts-act ${post.liked ? 'on' : ''}" data-like>${icon('heart', 26)}<span>${post.likes}</span></button>
        <button class="shorts-act" data-comment>${icon('comment', 26)}<span>${post.comments}</span></button>
        <button class="shorts-act" data-share>${icon('share', 24)}<span>Ещё</span></button>
      </div>
      <div class="shorts-info">
        <button class="row" data-author style="gap:8px;align-items:center">
          ${avatar(post.author, 38)}
          <span class="col" style="gap:2px;align-items:flex-start">
            <span class="row" style="gap:6px"><span class="strong small">${esc(post.author.displayName)}</span>${badges(post.author)}</span>
            <span class="tiny" style="opacity:.7">@${esc(post.author.username)} · ${esc(timeAgo(post.createdAt))}</span>
          </span>
        </button>
        ${post.text ? `<p class="shorts-text">${esc(post.text)}</p>` : ''}
      </div>
      <div class="shorts-heart" data-heart>${icon('heart', 88)}</div>
    </div>`);

  const video = node.querySelector('video');
  const sound = node.querySelector('[data-sound]');
  sound.onclick = (event) => {
    event.stopPropagation();
    video.muted = !video.muted;
    sound.innerHTML = icon(video.muted ? 'mute' : 'volume', 18);
  };

  let lastTap = 0;
  video.addEventListener('click', () => {
    const now = Date.now();
    if (now - lastTap < 320) {
      lastTap = 0;
      like(node, post, true);
      return;
    }
    lastTap = now;
    setTimeout(() => {
      if (!lastTap) return;
      lastTap = 0;
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    }, 330);
  });

  node.querySelector('[data-like]').onclick = () => like(node, post, false);
  node.querySelector('[data-comment]').onclick = () => openVideoComments(post, node);
  node.querySelector('[data-share]').onclick = () => openVideoMenu(post, node, stage);
  node.querySelector('[data-author]').onclick = () => openProfile(post.author.username);
  return node;
}

async function like(node, post, force) {
  if (!state.user) return toast('Войдите, чтобы ставить лайки', 'err');
  if (force && post.liked) {
    pulse(node);
    return;
  }
  try {
    const { post: updated } = await api.toggleLike(post.id);
    post.liked = updated.liked;
    post.likes = updated.likes;
    const button = node.querySelector('[data-like]');
    button.classList.toggle('on', post.liked);
    button.querySelector('span').textContent = post.likes;
    if (post.liked) pulse(node);
  } catch (error) {
    toast(error.message, 'err');
  }
}

function pulse(node) {
  const heart = node.querySelector('[data-heart]');
  heart.classList.remove('pop');
  void heart.offsetWidth;
  heart.classList.add('pop');
}

async function openVideoComments(post, node) {
  const { openComments } = await import('./feed.js');
  openComments(post, () => {
    node.querySelector('[data-comment] span').textContent = post.comments;
  });
}

function openVideoMenu(post, node, stage) {
  const mine = state.user && post.author.id === state.user.id;
  const body = el(`
    <div class="col" style="gap:6px">
      <button class="list-item" data-copy>${icon('share', 18)}<span>Скопировать описание</span></button>
      <button class="list-item" data-open>${icon('profile', 18)}<span>Профиль автора</span></button>
      <button class="list-item" data-report>${icon('flag', 18)}<span>Пожаловаться</span></button>
      ${mine || state.user?.isAdmin ? `<button class="list-item" data-delete style="color:#c98b8b">${icon('trash', 18)}<span>Удалить видео</span></button>` : ''}
    </div>`);
  const sheet = openSheet('', body);
  body.querySelector('[data-copy]').onclick = () => {
    navigator.clipboard?.writeText(post.text || '');
    toast('Скопировано');
    sheet.close();
  };
  body.querySelector('[data-open]').onclick = () => {
    sheet.close();
    openProfile(post.author.username);
  };
  body.querySelector('[data-report]').onclick = async () => {
    sheet.close();
    const { openReport } = await import('./feed.js');
    openReport('post', post.id);
  };
  body.querySelector('[data-delete]')?.addEventListener('click', async () => {
    sheet.close();
    try {
      await api.deletePost(post.id);
      node.remove();
      feed.items = feed.items.filter((row) => row.id !== post.id);
      toast('Удалено');
      if (!stage.children.length) stage.innerHTML = emptyState('video', 'Пусто', 'Снимите новое видео');
    } catch (error) {
      toast(error.message, 'err');
    }
  });
}

export async function shoot(done) {
  if (!state.user) return toast('Войдите, чтобы снимать', 'err');
  const { pickVideo } = await import('../ui.js');
  const picked = await pickVideo(isPremium(state.user) ? 180 : 90);
  if (!picked) return;

  const body = el(`
    <div class="col">
      <div class="post-image" style="position:relative;max-height:280px;overflow:hidden">
        <img src="${esc(picked.poster || '')}" alt="">
        <span class="post-video-time">${Math.floor(picked.duration / 60)}:${String(picked.duration % 60).padStart(2, '0')}</span>
      </div>
      <textarea class="textarea" maxlength="600" placeholder="О чём это видео"></textarea>
      <button class="btn btn-primary" data-publish>${icon('send', 16)} Опубликовать</button>
    </div>`);
  const sheet = openSheet('Новое видео', body);
  body.querySelector('[data-publish]').onclick = async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Загружаем';
    try {
      let video = picked.data;
      let poster = picked.poster;
      if (api.uploadMedia && api.mode === 'supabase') {
        video = await api.uploadMedia(picked.data, 'mp4');
        poster = picked.poster ? await api.uploadMedia(picked.poster, 'jpg') : null;
      }
      await api.createPost({
        text: body.querySelector('textarea').value.trim(),
        kind: 'video',
        video,
        poster,
        image: poster,
        duration: picked.duration,
        mood: state.user?.mood || 'calm'
      });
      sheet.close();
      toast('Видео опубликовано');
      done?.();
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Опубликовать';
      toast(error.message, 'err');
    }
  };
}

export function openVideo(post) {
  const view = el(`
    <div class="shorts-solo">
      <button class="btn btn-icon btn-ghost shorts-close" data-close>${icon('close', 22)}</button>
      <div class="shorts" data-stage></div>
    </div>`);
  document.body.appendChild(view);
  document.body.style.overflow = 'hidden';
  const stage = view.querySelector('[data-stage]');
  const node = slide(post, stage);
  stage.appendChild(node);
  const video = node.querySelector('video');
  video.dataset.ready = '1';
  video.src = video.dataset.src;
  video.play().catch(() => {});
  api.bumpViews?.(post.id).catch(() => {});
  view.querySelector('[data-close]').onclick = () => {
    video.pause();
    document.body.style.overflow = '';
    view.remove();
  };
}

export function videoCount(list) {
  return plural(list.length, 'видео', 'видео', 'видео');
}
