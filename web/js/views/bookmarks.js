import { el, esc, timeAgo } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, emptyState } from '../ui.js';

/**
 * Post bookmarks (Закладки).
 *
 * Stored in localStorage under `spokum.bookmarks` as an array of post snapshots:
 *   { id, text, image, mood, createdAt, savedAt, category, author: { id, username, displayName, avatar, hue } }
 *
 * Categories: Вдохновение, Смешное, Важное, Другое.
 * Tapping 🔖 on a post card toggles the bookmark.
 */

const KEY = 'spokum.bookmarks';
export const BOOKMARK_CATEGORIES = ['Вдохновение', 'Смешное', 'Важное', 'Другое'];

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 500)));
  } catch {}
}

export function isBookmarked(postId) {
  const id = String(postId);
  return read().some((row) => String(row.id) === id);
}

export function getBookmark(postId) {
  const id = String(postId);
  return read().find((row) => String(row.id) === id) || null;
}

/**
 * Toggle a bookmark. If adding, attaches the given category (default 'Другое').
 * Returns the new bookmarked state (true = saved, false = removed).
 */
export function toggleBookmark(post, category) {
  const list = read();
  const id = String(post.id);
  const index = list.findIndex((row) => String(row.id) === id);
  if (index >= 0) {
    list.splice(index, 1);
    write(list);
    return false;
  }
  list.unshift({
    id: post.id,
    text: post.text || '',
    image: post.image || null,
    mood: post.mood || 'calm',
    createdAt: post.createdAt,
    savedAt: Date.now(),
    category: BOOKMARK_CATEGORIES.includes(category) ? category : 'Другое',
    author: {
      id: post.author?.id,
      username: post.author?.username,
      displayName: post.author?.displayName,
      avatar: post.author?.avatar,
      hue: post.author?.hue
    }
  });
  write(list);
  return true;
}

export function setBookmarkCategory(postId, category) {
  if (!BOOKMARK_CATEGORIES.includes(category)) return;
  const list = read();
  const id = String(postId);
  const next = list.map((row) => (String(row.id) === id ? { ...row, category } : row));
  write(next);
}

function bookmarkRow(row, onRefresh) {
  const preview = row.text
    ? (row.text.length > 110 ? row.text.slice(0, 110) + '…' : row.text)
    : (row.image ? '(запись с фото)' : '(без текста)');
  return `
    <div class="card list-item" style="padding:10px;gap:10px;align-items:flex-start" data-row="${esc(row.id)}">
      <div class="grow" style="min-width:0">
        <div class="row" style="gap:6px;align-items:center">
          <span class="tiny muted truncate">@${esc(row.author?.username || 'аноним')} · ${esc(timeAgo(row.createdAt))}</span>
          <span class="pill" style="background:var(--accent-soft);color:var(--accent);font-size:10px;padding:1px 8px">${esc(row.category || 'Другое')}</span>
        </div>
        <div class="small" style="margin-top:4px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(preview)}</div>
      </div>
      <div class="col" style="gap:2px">
        <button class="btn btn-icon btn-ghost" data-cat="${esc(row.id)}" title="Категория">${icon('palette', 15)}</button>
        <button class="btn btn-icon btn-ghost" data-remove="${esc(row.id)}" title="Убрать">${icon('trash', 15)}</button>
      </div>
    </div>`;
}

function categoryPicker(row, onPick) {
  const body = el(`<div class="col" style="gap:6px">
    <div class="small muted" style="padding:0 4px">Категория для закладки</div>
    ${BOOKMARK_CATEGORIES.map((c) => `
      <button class="list-item" data-cat="${esc(c)}" style="padding:12px">
        <span class="grow">${esc(c)}</span>
        ${c === (row.category || 'Другое') ? icon('check', 15) : icon('forward', 15)}
      </button>`).join('')}
  </div>`);
  const sheet = openSheet('Категория', body);
  body.querySelectorAll('[data-cat]').forEach((btn) => {
    btn.onclick = () => {
      sheet.close();
      onPick(btn.dataset.cat);
    };
  });
  return sheet;
}

export function openBookmarks() {
  const body = el('<div class="col" data-host style="gap:10px"></div>');
  const sheet = openSheet('Закладки', body);

  const draw = () => {
    const list = read();
    if (!list.length) {
      body.innerHTML = emptyState('star', 'Пока пусто', 'Нажмите 🔖 на любой записи в ленте, чтобы сохранить её сюда');
      return;
    }
    const byCat = {};
    for (const c of BOOKMARK_CATEGORIES) byCat[c] = [];
    list.forEach((row) => {
      const key = BOOKMARK_CATEGORIES.includes(row.category) ? row.category : 'Другое';
      byCat[key].push(row);
    });
    body.innerHTML = BOOKMARK_CATEGORIES
      .map((c) => byCat[c].length
        ? `<div class="row between" style="margin:8px 2px 4px">
              <div class="strong small">${esc(c)}</div>
              <div class="tiny muted">${byCat[c].length}</div>
            </div>
            <div class="col" style="gap:6px">
              ${byCat[c].map((row) => bookmarkRow(row, draw)).join('')}
            </div>`
        : '')
      .join('');

    body.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.onclick = (event) => {
        event.stopPropagation();
        const id = btn.dataset.remove;
        write(read().filter((r) => String(r.id) !== String(id)));
        toast('Убрано');
        draw();
      };
    });

    body.querySelectorAll('[data-cat]').forEach((btn) => {
      btn.onclick = (event) => {
        event.stopPropagation();
        const id = btn.dataset.cat;
        const row = read().find((r) => String(r.id) === String(id));
        if (!row) return;
        categoryPicker(row, (cat) => {
          setBookmarkCategory(id, cat);
          toast('Категория обновлена');
          draw();
        });
      };
    });
  };

  draw();
  return sheet;
}
