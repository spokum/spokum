import { api, state, isOffline, isPremium } from '../store.js';
import { el, esc, timeAgo } from '../util.js';
import { icon } from '../icons.js';
import { avatar, badges, toast, openSheet, emptyState, pickImage } from '../ui.js';
import { openProfile } from './profile.js';

let feed = { items: [], cursor: null, more: true, busy: false };

export async function render(root) {
  root.innerHTML = `
    <div class="topbar">
      <div><h1>Видео</h1><p class="sub">Ролики и фото, которые листают</p></div>
      <div class="spacer"></div>
      ${state.user ? `<button class="btn btn-primary btn-sm" data-shoot>${icon('plus', 16)}<span>Выложить</span></button>` : ''}
    </div>
    <div class="shorts" data-shorts></div>`;

  root.querySelector('[data-shoot]')?.addEventListener('click', () => publishReel(() => render(root)));

  const stage = root.querySelector('[data-shorts]');
  stage.innerHTML = '<div class="shorts-slide"><div class="shorts-skeleton"></div></div>';

  if (isOffline()) {
    stage.innerHTML = emptyState('warn', 'Нет интернета', 'Ролики появятся со связью');
    return;
  }

  feed = { items: [], cursor: null, more: true, busy: false };
  await more(stage);
  if (!feed.items.length) {
    stage.innerHTML = emptyState('video', 'Пока пусто', 'Выложите первое видео или несколько фото');
  }
}

async function more(stage) {
  if (feed.busy || !feed.more) return;
  feed.busy = true;
  try {
    const query = { kind: 'reels', limit: 6 };
    if (feed.cursor) query.before = feed.cursor;
    const result = await api.listPosts(query);
    const all = result.posts || [];
    const posts = all.filter((post) => post.kind === 'video' || post.kind === 'album' || !!post.video);
    feed.cursor = result.cursor ?? (all.length ? all[all.length - 1].createdAt : null);
    feed.more = result.more ?? all.length >= 6;
    if (!feed.items.length && posts.length) stage.innerHTML = '';
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
        const visible = entry.isIntersecting && entry.intersectionRatio > 0.6;
        entry.target.dataset.visible = visible ? '1' : '0';
        if (video) {
          if (visible) entry.target.play?.();
          else video.pause();
        }
        if (!visible) continue;
        if (!entry.target.dataset.counted) {
          entry.target.dataset.counted = '1';
          api.bumpViews?.(Number(entry.target.dataset.post) || entry.target.dataset.post).catch(() => {});
        }
        if (feed.more && entry.target === stage.lastElementChild) more(stage);
      }
    },
    { threshold: [0, 0.61, 1] }
  );
  [...stage.querySelectorAll('.shorts-slide')].forEach((node) => observer.observe(node));
}

function albumBody(post) {
  const shots = (Array.isArray(post.media) ? post.media.filter(Boolean) : []).length
    ? post.media.filter(Boolean)
    : [post.image].filter(Boolean);
  return `<div class="reel-album" data-deck>
      ${shots.map((src) => `<div class="reel-frame"><img src="${esc(src)}" alt="" loading="lazy"></div>`).join('')}
    </div>
    ${shots.length > 1 ? `<div class="reel-dots" data-reel-dots>${shots.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>` : ''}`;
}

function slide(post, stage) {
  const isVideo = post.kind === 'video' || !!post.video;
  const node = el(`
    <div class="shorts-slide" data-post="${post.id}">
      ${isVideo
        ? `<video playsinline webkit-playsinline loop muted autoplay preload="auto" src="${esc(post.video || '')}" ${post.poster ? `poster="${esc(post.poster)}"` : ''}></video>
           <button class="shorts-sound" data-sound>${icon('mute', 18)}</button>
           <button class="reel-play" data-play hidden>${icon('play', 30)}</button>
           <div class="reel-error" data-error hidden>${icon('warn', 22)}<span>Не удалось проиграть это видео</span></div>`
        : albumBody(post)}
      <div class="shorts-shade"></div>
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
      ${post.removed ? `<div class="reel-removed">${icon('warn', 15)} Снято модератором</div>` : ''}
      <div class="shorts-heart" data-heart>${icon('heart', 88)}</div>
    </div>`);

  const video = node.querySelector('video');
  if (video) {
    const sound = node.querySelector('[data-sound]');
    const playHint = node.querySelector('[data-play]');
    const fault = node.querySelector('[data-error]');

    node.play = () => {
      if (fault.hidden === false) return;
      const attempt = video.play();
      if (attempt?.then) {
        attempt.then(() => {
          playHint.hidden = true;
        }).catch(() => {
          playHint.hidden = false;
        });
      }
    };

    video.addEventListener('loadeddata', () => {
      node.dataset.loaded = '1';
      if (node.dataset.visible === '1') node.play();
    });
    video.addEventListener('playing', () => {
      playHint.hidden = true;
      fault.hidden = true;
    });
    video.addEventListener('pause', () => {
      if (!video.ended && node.dataset.visible === '1') playHint.hidden = false;
    });
    video.addEventListener('error', () => {
      fault.hidden = false;
      playHint.hidden = true;
    });
    video.addEventListener('stalled', () => {
      video.load();
    });

    sound.onclick = (event) => {
      event.stopPropagation();
      video.muted = !video.muted;
      sound.innerHTML = icon(video.muted ? 'mute' : 'volume', 18);
      if (video.paused) node.play();
    };

    playHint.onclick = (event) => {
      event.stopPropagation();
      node.play();
    };

    tapper(video, node, post, () => {
      if (video.paused) node.play();
      else video.pause();
    }, () => {
      if (!video.paused) return;
      node.play();
    });
  }

  const deck = node.querySelector('[data-deck]');
  if (deck) {
    const dots = node.querySelector('[data-reel-dots]');
    deck.addEventListener('scroll', () => {
      if (!dots) return;
      const index = Math.round(deck.scrollLeft / Math.max(1, deck.clientWidth));
      dots.querySelectorAll('i').forEach((dot, i) => dot.classList.toggle('on', i === index));
    }, { passive: true });
    tapper(deck, node, post, () => {});
  }

  node.querySelector('[data-like]').onclick = () => like(node, post, false);
  node.querySelector('[data-comment]').onclick = () => openReelComments(post, node);
  node.querySelector('[data-share]').onclick = () => openReelMenu(post, node, stage);
  node.querySelector('[data-author]').onclick = () => openProfile(post.author.username);
  return node;
}

function tapper(target, node, post, single, undo) {
  let last = 0;
  target.addEventListener('click', () => {
    const now = Date.now();
    if (now - last < 300) {
      last = 0;
      undo?.();
      like(node, post, true);
      return;
    }
    last = now;
    single();
  });
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

async function openReelComments(post, node) {
  const { openComments } = await import('./feed.js');
  openComments(post, () => {
    node.querySelector('[data-comment] span').textContent = post.comments;
  });
}

function openReelMenu(post, node, stage) {
  const mine = state.user && post.author.id === state.user.id;
  const canModerate = state.user && (state.user.isModerator || state.user.isAdmin);
  const body = el(`
    <div class="col" style="gap:6px">
      <button class="list-item" data-copy>${icon('share', 18)}<span>Скопировать описание</span></button>
      <button class="list-item" data-open>${icon('profile', 18)}<span>Профиль автора</span></button>
      <button class="list-item" data-report>${icon('flag', 18)}<span>Пожаловаться</span></button>
      ${canModerate && !mine && !post.removed ? `<button class="list-item" data-take style="color:#c6b083">${icon('shield', 18)}<span>Снять с публикации</span></button>` : ''}
      ${mine || state.user?.isAdmin ? `<button class="list-item" data-delete style="color:#c98b8b">${icon('trash', 18)}<span>Удалить</span></button>` : ''}
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
  body.querySelector('[data-take]')?.addEventListener('click', async () => {
    sheet.close();
    const { promptSheet } = await import('../ui.js');
    const reason = await promptSheet({ title: 'Причина снятия', label: 'Её увидит админ', placeholder: 'Например: запрещённый контент', multiline: true });
    if (!reason) return;
    try {
      await api.removePost(post.id, reason);
      node.remove();
      toast('Снято, действие записано');
    } catch (error) {
      toast(error.message, 'err');
    }
  });
  body.querySelector('[data-delete]')?.addEventListener('click', async () => {
    sheet.close();
    try {
      await api.deletePost(post.id);
      node.remove();
      feed.items = feed.items.filter((row) => row.id !== post.id);
      toast('Удалено');
      if (!stage.children.length) stage.innerHTML = emptyState('video', 'Пусто', 'Выложите новое видео или фото');
    } catch (error) {
      toast(error.message, 'err');
    }
  });
}

export async function publishReel(done) {
  if (!state.user) return toast('Войдите, чтобы выкладывать', 'err');
  const body = el(`
    <div class="col" style="gap:6px">
      <button class="list-item" data-video>${icon('video', 20)}<div class="grow"><div class="small strong">Видео</div><div class="tiny muted">Снять или выбрать ролик</div></div>${icon('forward', 15)}</button>
      <button class="list-item" data-album>${icon('album', 20)}<div class="grow"><div class="small strong">Несколько фото</div><div class="tiny muted">Листаются свайпом вбок</div></div>${icon('forward', 15)}</button>
    </div>`);
  const sheet = openSheet('Что выкладываем', body);
  body.querySelector('[data-video]').onclick = () => {
    sheet.close();
    shootVideo(done);
  };
  body.querySelector('[data-album]').onclick = () => {
    sheet.close();
    shootAlbum(done);
  };
}

async function shootVideo(done) {
  const { pickVideo } = await import('../ui.js');
  const picked = await pickVideo(isPremium(state.user) ? 180 : 90);
  if (!picked) return;
  openPublisher({
    preview: `<div class="post-image" style="position:relative;max-height:280px;overflow:hidden">
        <img src="${esc(picked.poster || '')}" alt="">
        <span class="post-video-play">${icon('play', 22)}</span>
        <span class="post-video-time">${Math.floor(picked.duration / 60)}:${String(picked.duration % 60).padStart(2, '0')}</span>
      </div>`,
    title: 'Новое видео',
    async build(upload) {
      const video = await upload(picked.data, 'mp4');
      const poster = picked.poster ? await upload(picked.poster, 'jpg') : null;
      return { kind: 'video', video, poster, image: poster, duration: picked.duration, media: [] };
    },
    done
  });
}

async function shootAlbum(done) {
  const limit = isPremium(state.user) ? 10 : 6;
  const shots = [];
  for (let i = 0; i < limit; i++) {
    const image = await pickImage(isPremium(state.user) ? 2000 : 1400);
    if (!image) break;
    shots.push(image);
    if (shots.length >= limit) break;
    const { confirmSheet } = await import('../ui.js');
    if (!(await confirmSheet({ title: `Фото: ${shots.length}`, text: 'Добавить ещё одно?', confirm: 'Добавить' }))) break;
  }
  if (!shots.length) return;
  openPublisher({
    preview: `<div class="composer-shots">${shots.map((src) => `<span class="composer-shot"><img src="${esc(src)}" alt=""></span>`).join('')}</div>`,
    title: shots.length > 1 ? `Альбом из ${shots.length} фото` : 'Новое фото',
    async build(upload) {
      const media = [];
      for (const shot of shots) media.push(await upload(shot, 'jpg'));
      return { kind: 'album', media, image: media[0], video: null, poster: null, duration: 0 };
    },
    done
  });
}

function openPublisher({ preview, title, build, done }) {
  const body = el(`
    <div class="col">
      ${preview}
      <textarea class="textarea" maxlength="600" placeholder="Пара слов об этом"></textarea>
      <button class="btn btn-primary" data-publish>${icon('send', 16)} Опубликовать</button>
    </div>`);
  const sheet = openSheet(title, body);
  const button = body.querySelector('[data-publish]');
  let busy = false;
  button.onclick = async () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    button.textContent = 'Загружаем';
    const upload = async (data, hint) =>
      api.uploadMedia && api.mode === 'supabase' ? api.uploadMedia(data, hint) : data;
    try {
      const payload = await build(upload);
      await api.createPost({
        ...payload,
        text: body.querySelector('textarea').value.trim(),
        mood: state.user?.mood || 'calm'
      });
      sheet.close();
      toast('Опубликовано');
      done?.();
    } catch (error) {
      busy = false;
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
  node.dataset.visible = '1';
  node.play?.();
  api.bumpViews?.(post.id).catch(() => {});
  view.querySelector('[data-close]').onclick = () => {
    video?.pause();
    document.body.style.overflow = '';
    view.remove();
  };
}
