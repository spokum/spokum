import { el, esc, initials } from './util.js';
import { icon, solidIcon } from './icons.js';
import { isPremium, state } from './store.js';

let toastHost;

export function toast(message, kind = '') {
  if (state.quiet && kind !== 'err') return;
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

export function avatar(user, size = 40) {
  if (!user) return `<div class="avatar avatar-${size}" style="--h:220">?</div>`;
  const inner = user.avatar
    ? `<img src="${esc(user.avatar)}" alt="">`
    : esc(initials(user.displayName || user.username));
  const premium = isPremium(user) ? ' avatar-premium' : '';
  const ring = hasStory(user) ? ' avatar-story' : '';
  return `<div class="avatar avatar-${size}${premium}${ring}" style="--h:${Number(user.hue) || 220}">${inner}</div>`;
}

export function bannerStyle(user) {
  if (user?.banner) return `background-image:url('${esc(user.banner)}')`;
  const hue = Number(user?.hue) || 220;
  return `background-image:linear-gradient(135deg, hsl(${hue} 30% 26%), hsl(${(hue + 50) % 360} 28% 16%))`;
}

export function bannerPins(user) {
  const pins = Array.isArray(user?.pins) ? user.pins : [];
  return pins
    .map((pin) => `<img class="banner-pin" src="${esc(pin.image)}" alt="" style="left:${Number(pin.x) || 50}%;top:${Number(pin.y) || 50}%">`)
    .join('');
}

export function badges(user) {
  if (!user) return '';
  const items = [];
  if (user.statusIcon) {
    items.push(`<img class="status-icon" src="${esc(user.statusIcon)}" alt="" title="Статус ${esc(user.displayName || user.username || '')}" data-caption="Статус ${esc(user.displayName || user.username || '')}">`);
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

export function openLightbox(sources, options = {}) {
  const list = (Array.isArray(sources) ? sources : [sources]).filter(Boolean);
  if (!list.length) return null;
  let index = Math.min(Math.max(0, Number(options.start) || 0), list.length - 1);
  const view = el(`
    <div class="lightbox">
      <div class="lightbox-top">
        <div class="grow small strong" data-caption>${esc(options.caption || '')}</div>
        <button class="btn btn-icon btn-ghost" data-close>${icon('close', 20)}</button>
      </div>
      <div class="lightbox-stage" data-stage><img alt="" data-shot></div>
      <div class="lightbox-dots" data-dots></div>
    </div>`);
  document.body.appendChild(view);
  document.body.style.overflow = 'hidden';
  const shot = view.querySelector('[data-shot]');
  const dots = view.querySelector('[data-dots]');
  let scale = 1;
  let panX = 0;
  let panY = 0;

  const apply = () => {
    shot.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  };
  const draw = () => {
    scale = 1;
    panX = 0;
    panY = 0;
    apply();
    shot.src = list[index];
    dots.innerHTML = list.length > 1 ? list.map((_, i) => `<i class="${i === index ? 'on' : ''}"></i>`).join('') : '';
  };
  const step = (delta) => {
    index = (index + delta + list.length) % list.length;
    draw();
  };
  const close = () => {
    document.body.style.overflow = '';
    view.remove();
    document.removeEventListener('keydown', keys);
  };
  const keys = (event) => {
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowRight') step(1);
    if (event.key === 'ArrowLeft') step(-1);
  };
  document.addEventListener('keydown', keys);
  view.querySelector('[data-close]').onclick = close;
  view.addEventListener('click', (event) => {
    if (event.target === view || event.target.classList.contains('lightbox-stage')) close();
  });

  let startX = 0;
  let startY = 0;
  let moved = false;
  let baseDistance = 0;
  let baseScale = 1;
  const distance = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

  shot.addEventListener('touchstart', (event) => {
    if (event.touches.length === 2) {
      baseDistance = distance(event.touches);
      baseScale = scale;
      return;
    }
    startX = event.touches[0].clientX - panX;
    startY = event.touches[0].clientY - panY;
    moved = false;
  }, { passive: true });

  shot.addEventListener('touchmove', (event) => {
    if (event.touches.length === 2 && baseDistance) {
      scale = Math.min(4, Math.max(1, (baseScale * distance(event.touches)) / baseDistance));
      apply();
      return;
    }
    if (scale > 1) {
      panX = event.touches[0].clientX - startX;
      panY = event.touches[0].clientY - startY;
      apply();
      return;
    }
    const shift = event.touches[0].clientX - startX;
    if (Math.abs(shift) > 60 && !moved) {
      moved = true;
      step(shift < 0 ? 1 : -1);
    }
  }, { passive: true });

  shot.addEventListener('touchend', () => {
    baseDistance = 0;
    if (scale <= 1) {
      panX = 0;
      panY = 0;
      apply();
    }
  });

  shot.addEventListener('dblclick', () => {
    scale = scale > 1 ? 1 : 2.2;
    panX = 0;
    panY = 0;
    apply();
  });

  draw();
  return { close };
}

export function pickVideo(maxSeconds = 60) {
  return new Promise((done) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.setAttribute('capture', 'user');
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return done(null);
      if (file.size > 24 * 1024 * 1024) {
        toast('Видео тяжелее 24 МБ, снимите короче', 'err');
        return done(null);
      }
      const { readRawFile, videoMeta } = await import('./util.js');
      try {
        const data = await readRawFile(file);
        const meta = await videoMeta(data);
        if (meta.duration > maxSeconds) {
          toast(`Максимум ${maxSeconds} секунд`, 'err');
          return done(null);
        }
        done({ data, poster: meta.poster, duration: Math.round(meta.duration) });
      } catch (error) {
        toast(error.message, 'err');
        done(null);
      }
    };
    input.click();
  });
}
