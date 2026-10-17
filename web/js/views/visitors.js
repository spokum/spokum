import { el, esc, timeAgo } from '../util.js';
import { icon } from '../icons.js';
import { avatar, openSheet, emptyState } from '../ui.js';

/**
 * Profile Visitors (local-only).
 * When you open someone else's profile, recordVisit() saves them locally.
 * openVisitors() shows the list. Nothing leaves the device.
 *
 * Storage: localStorage.spokum.visitors = [
 *   { userId, username, displayName, at }, ...max 50, most recent first
 * ]
 */

const KEY = 'spokum.visitors';
const MAX = 50;

function readList() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(raw)) return raw;
  } catch {}
  return [];
}

function writeList(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {}
}

export function visitorsCount() {
  return readList().length;
}

/**
 * Records a visit to a profile locally.
 * Dedupes by userId (most recent wins), keeps max 50, most recent first.
 * The caller must ensure this is NOT the current user's own profile.
 */
export function recordVisit(userId, username, displayName) {
  if (!userId) return;
  const id = String(userId);
  const list = readList().filter((v) => String(v.userId) !== id);
  list.unshift({
    userId: id,
    username: username || '',
    displayName: displayName || username || '',
    at: Date.now()
  });
  writeList(list);
}

export function openVisitors() {
  const list = readList();
  const body = el('<div class="col" style="gap:8px"></div>');
  const sheet = openSheet('Недавние гости', body);

  if (!list.length) {
    body.innerHTML = emptyState(
      'eye',
      'Пока никто не заглядывал',
      'Откройте чужой профиль — и он появится здесь.'
    );
  } else {
    body.innerHTML = list.map((v) => {
      const stub = { username: v.username, displayName: v.displayName, hue: 220 };
      return `
        <button class="card list-item" type="button" data-name="${esc(v.username || '')}"
          style="padding:10px;text-align:left;width:100%">
          ${avatar(stub, 40)}
          <span class="grow" style="min-width:0;text-align:left">
            <span class="small strong truncate" style="display:block">${esc(v.displayName || v.username || 'Гость')}</span>
            <span class="tiny muted">@${esc(v.username || '?')} · ${esc(timeAgo(v.at))}</span>
          </span>
          ${icon('forward', 15)}
        </button>`;
    }).join('');

    body.querySelectorAll('[data-name]').forEach((btn) => {
      btn.onclick = async () => {
        const name = btn.dataset.name;
        if (!name) return;
        sheet.close();
        try {
          const { openProfile } = await import('./profile.js?v=20251018');
          openProfile(name);
        } catch {}
      };
    });
  }

  const note = el(
    `<div class="tiny muted" style="margin-top:10px;line-height:1.5;text-align:center">`
    + `${icon('eye', 12)} Список виден только вам</div>`
  );
  body.appendChild(note);
  return sheet;
}
