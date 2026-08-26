import { el, esc, initials } from './util.js';
import { icon, solidIcon } from './icons.js';
import { isPremium } from './store.js';

let toastHost;

export function toast(message, kind = '') {
  if (!toastHost) {
    toastHost = el('<div class="toast-host"></div>');
    document.body.appendChild(toastHost);
  }
  const node = el(`<div class="toast ${kind}">${esc(message)}</div>`);
  toastHost.appendChild(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity .3s';
    setTimeout(() => node.remove(), 320);
  }, 2600);
}

const storyOwners = new Set();

export function setStoryOwners(ids) {
  storyOwners.clear();
  for (const id of ids) storyOwners.add(String(id));
}

export function hasStory(user) {
  return !!user && storyOwners.has(String(user.id));
}

export function avatar(user, size = 40, options = {}) {
  if (!user) return `<div class="avatar avatar-${size}" style="--h:220">?</div>`;
  const inner = user.avatar
    ? `<img src="${esc(user.avatar)}" alt="">`
    : esc(initials(user.displayName || user.username));
  const premium = isPremium(user) ? ' avatar-premium' : '';
  const ring = hasStory(user) ? ' avatar-story' : '';
  const face = `<div class="avatar avatar-${size}${premium}${ring}" style="--h:${Number(user.hue) || 220}">${inner}</div>`;

  const pins = options.pins === false ? [] : (Array.isArray(user.pins) ? user.pins.filter(Boolean).slice(0, 4) : []);
  if (!pins.length) return face;

  const slots = ['pin-tl', 'pin-tr', 'pin-bl', 'pin-br'];
  const marks = pins.map((pin, index) => `<img class="avatar-pin ${slots[index]}" src="${esc(pin)}" alt="">`).join('');
  return `<span class="avatar-wrap avatar-wrap-${size}">${face}${marks}</span>`;
}

export function badges(user) {
  if (!user) return '';
  const items = [];
  if (user.statusIcon) {
    items.push(`<img class="status-icon" src="${esc(user.statusIcon)}" alt="" title="Статус">`);
  }
  if (isPremium(user)) items.push(badgeButton('badge-premium', solidIcon('crown', 12), 'СпокУм Премиум'));
  if (user.isVerified) items.push(badgeButton('badge-verified', icon('verified', 12, 2.4), 'Пользователь верифицирован'));
  if (user.isModerator) items.push(badgeButton('badge-mod', solidIcon('shield', 12), 'Модератор СпокУма'));
  if (user.isDeveloper) items.push(badgeButton('badge-dev', solidIcon('hammer', 12), 'Разработчик СпокУма'));
  return items.length ? `<span class="badges">${items.join('')}</span>` : '';
}

function badgeButton(className, glyph, label) {
  return `<span role="button" tabindex="0" class="badge-icon ${className}" data-badge="${esc(label)}" title="${esc(label)}" aria-label="${esc(label)}">${glyph}</span>`;
}

export function nameLine(user, extra = '') {
  return `<span class="strong truncate">${esc(user?.displayName || 'Гость')}</span>${badges(user)}${extra}`;
}

export function emptyState(name, title, text) {
  return `<div class="empty">${icon(name, 34, 1.6)}<div class="strong">${esc(title)}</div><div class="small" style="margin-top:4px">${esc(text)}</div></div>`;
}

export function openSheet(title, content, options = {}) {
  const backdrop = el('<div class="sheet-backdrop"></div>');
  const sheet = el(`<div class="sheet"><div class="sheet-grip"></div>${title ? `<h3>${esc(title)}</h3>` : ''}</div>`);
  const body = el('<div class="col"></div>');
  if (typeof content === 'string') body.innerHTML = content;
  else body.appendChild(content);
  sheet.appendChild(body);
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  const close = () => {
    document.body.style.overflow = '';
    backdrop.remove();
    options.onClose?.();
  };
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener('keydown', function escape(event) {
    if (event.key === 'Escape') {
      close();
      document.removeEventListener('keydown', escape);
    }
  });
  return { close, body, sheet };
}

export function confirmSheet({ title, text, confirm = 'Подтвердить', danger = false }) {
  return new Promise((done) => {
    const body = el(`
      <div class="col">
        <p class="small muted" style="margin:0">${esc(text || '')}</p>
        <div class="row" style="gap:8px">
          <button class="btn grow" data-no>Отмена</button>
          <button class="btn grow ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirm)}</button>
        </div>
      </div>`);
    const sheet = openSheet(title, body, { onClose: () => done(false) });
    body.querySelector('[data-no]').onclick = () => sheet.close();
    body.querySelector('[data-yes]').onclick = () => {
      done(true);
      document.body.style.overflow = '';
      sheet.sheet.parentElement.remove();
    };
  });
}

export function promptSheet({ title, label, placeholder = '', value = '', multiline = false, confirm = 'Готово' }) {
  return new Promise((done) => {
    const field = multiline
      ? `<textarea class="textarea" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
      : `<input class="input" placeholder="${esc(placeholder)}" value="${esc(value)}">`;
    const body = el(`
      <div class="col">
        ${label ? `<div class="small muted">${esc(label)}</div>` : ''}
        ${field}
        <button class="btn btn-primary" data-ok>${esc(confirm)}</button>
      </div>`);
    const sheet = openSheet(title, body, { onClose: () => done(null) });
    const input = body.querySelector('input, textarea');
    setTimeout(() => input.focus(), 80);
    const submit = () => {
      const result = input.value.trim();
      done(result || null);
      document.body.style.overflow = '';
      sheet.sheet.parentElement.remove();
    };
    body.querySelector('[data-ok]').onclick = submit;
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !multiline) submit();
    });
  });
}

export function pickImage(maxSide = 1400) {
  return new Promise((done) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return done(null);
      const { readFileAsDataUrl } = await import('./util.js');
      try {
        done(await readFileAsDataUrl(file, maxSide));
      } catch (error) {
        toast(error.message, 'err');
        done(null);
      }
    };
    input.click();
  });
}

export function section(title, actionHtml = '') {
  return `<div class="row between" style="margin:20px 2px 10px"><div class="strong small">${esc(title)}</div>${actionHtml}</div>`;
}
