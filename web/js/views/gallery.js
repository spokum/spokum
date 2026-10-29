import { api } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, openLightbox, toast, emptyState } from '../ui.js';

// Gallery: collects every image and video from a user's posts and shows
// them in a responsive grid. Tap a tile to open the lightbox. Videos are
// detected by the post kind (`video`/`album`) or by a `media` field that
// looks like a data-URL video.

function isVideo(post) {
  if (post.kind === 'video') return true;
  if (post.kind === 'album' && Array.isArray(post.media) && post.media.some((m) => typeof m === 'string' && m.startsWith('data:video'))) return true;
  if (typeof post.media === 'string' && post.media.startsWith('data:video')) return true;
  return false;
}

function collectMedia(posts) {
  const out = [];
  for (const post of posts || []) {
    if (post.image) {
      out.push({ src: post.image, kind: 'image', poster: null, caption: post.text || '' });
    }
    if (Array.isArray(post.media)) {
      for (const m of post.media) {
        if (typeof m !== 'string') continue;
        if (m.startsWith('data:video')) {
          out.push({ src: m, kind: 'video', poster: post.poster || null, caption: post.text || '' });
        } else if (m.startsWith('data:image') || m.startsWith('http')) {
          out.push({ src: m, kind: 'image', poster: null, caption: post.text || '' });
        }
      }
    } else if (typeof post.media === 'string') {
      if (post.media.startsWith('data:video')) {
        out.push({ src: post.media, kind: 'video', poster: post.poster || null, caption: post.text || '' });
      } else if (post.media.startsWith('data:image') || post.media.startsWith('http')) {
        out.push({ src: post.media, kind: 'image', poster: null, caption: post.text || '' });
      }
    }
  }
  return out;
}

export async function openGallery(username) {
  if (!username) {
    toast('Не указано имя пользователя', 'err');
    return;
  }
  const body = el('<div class="col"><div class="card" style="height:160px;opacity:.35"></div></div>');
  const sheet = openSheet('Галерея', body);
  let data;
  try {
    data = await api.getUser(username);
  } catch (error) {
    body.innerHTML = emptyState('warn', 'Не загрузилось', error.message);
    return;
  }
  const media = collectMedia(data.posts || []);
  if (!media.length) {
    body.innerHTML = emptyState('image', 'Пока пусто', 'У этого пользователя нет фото и видео в записях');
    return;
  }
  body.innerHTML = `<p class="tiny muted" style="margin:0 0 10px;line-height:1.5">Все изображения и видео из записей ${esc(data.user?.displayName || username)}. Нажмите, чтобы открыть в полном размере.</p>
    <div class="gallery-grid" data-grid></div>`;

  const grid = body.querySelector('[data-grid]');
  media.forEach((item, index) => {
    const tile = el(`<button class="gallery-tile" data-i="${index}" style="padding:0;border:1px solid var(--line);overflow:hidden;border-radius:10px;background:var(--bg-3);aspect-ratio:1;position:relative;cursor:pointer">
      ${item.kind === 'video'
        ? `<video src="${esc(item.src)}" ${item.poster ? `poster="${esc(item.poster)}"` : ''} muted playsinline preload="metadata" style="width:100%;height:100%;object-fit:cover;display:block"></video>
           <span style="position:absolute;right:6px;bottom:6px;background:rgba(0,0,0,.55);color:#fff;border-radius:999px;padding:2px 6px;display:flex;align-items:center;gap:3px;font-size:11px">${icon('play', 12)} видео</span>`
        : `<img src="${esc(item.src)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block">`}
    </button>`);
    tile.onclick = () => openLightbox(
      media.map((m) => m.src),
      { start: index, caption: item.caption || '' }
    );
    grid.appendChild(tile);
  });
  return sheet;
}
