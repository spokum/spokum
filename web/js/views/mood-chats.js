import { api, state, setUser, MOODS, moodStyle } from '../store.js';
import { el, esc, uid, clockTime, timeAgo, plural } from '../util.js';
import { icon } from '../icons.js';
import { avatar, toast, openSheet, emptyState } from '../ui.js';

// 10 mood-based chat rooms. Two moods (`tender`, `lift`) are not part of the
// global MOODS map in store.js (which currently lists 8). We define local
// meta for them so the room picker always renders, regardless of the global
// mood map. When the user enters a room, we still try to set their profile
// mood via api.updateMe — backends that don't know the new mood simply
// ignore the unknown key.
const ROOMS = [
  { mood: 'calm',     icon: 'leaf', title: 'Спокойные',     hint: 'Тихий шёпот листвы' },
  { mood: 'joy',      icon: 'spark', title: 'Радостные',     hint: 'Делимся светлым' },
  { mood: 'sad',      icon: 'wave', title: 'Грустящие',     hint: 'Тепло, когда тяжело' },
  { mood: 'anger',    icon: 'flame', title: 'Злые',          hint: 'Выпустить пар без вреда' },
  { mood: 'anxiety',  icon: 'same', title: 'Тревожные',     hint: 'Вдох-выдох вместе' },
  { mood: 'tired',    icon: 'moon', title: 'Уставшие',      hint: 'Неспешные разговоры' },
  { mood: 'tender',   icon: 'heart', title: 'Нежные',        hint: 'Мягко и бережно' },
  { mood: 'lift',     icon: 'star', title: 'В подъёме',     hint: 'Когда силы возвращаются' },
  { mood: 'love',     icon: 'heart', title: 'Влюблённые',    hint: 'Сердце бьётся чаще' },
  { mood: 'inspired', icon: 'trophy', title: 'Вдохновлённые', hint: 'Идеи и порывы' }
];

const MOOD_META = {
  calm:     { label: 'Спокойствие', ink: '#7fb3a0' },
  joy:      { label: 'Радость',     ink: '#ccb079' },
  sad:      { label: 'Грусть',      ink: '#8aabc7' },
  anger:    { label: 'Злость',      ink: '#c58279' },
  anxiety:  { label: 'Тревога',     ink: '#9f96c2' },
  tired:    { label: 'Усталость',   ink: '#98a0ad' },
  tender:   { label: 'Нежность',    ink: '#c7b6a0' },
  lift:     { label: 'Подъём',      ink: '#9bc6cf' },
  love:     { label: 'Любовь',      ink: '#c78fa4' },
  inspired: { label: 'Вдохновение', ink: '#93b98d' }
};

function meta(mood) {
  return MOOD_META[mood] || MOODS[mood] || { label: mood, ink: '#8a93a0' };
}

const KEY = (mood) => `spokum.moodChat.${mood}`;

function loadMessages(mood) {
  try {
    const raw = localStorage.getItem(KEY(mood));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveMessages(mood, list) {
  try {
    localStorage.setItem(KEY(mood), JSON.stringify(list.slice(-200)));
  } catch {}
}

function memberCount(mood) {
  // Members are everyone who has ever posted in the room, plus the current
  // user (even if they just lurk). Pure-local heuristic — there's no
  // shared backend in local mode, so we count unique authors in the log.
  const messages = loadMessages(mood);
  const ids = new Set(messages.map((m) => m.userId));
  if (state.user?.id) ids.add(state.user.id);
  return ids.size;
}

function viewerInfo() {
  const u = state.user;
  if (u) {
    return {
      userId: u.id,
      username: u.username || 'guest',
      displayName: u.displayName || u.username || 'Гость',
      avatar: u.avatar || null,
      hue: Number(u.hue) || 220
    };
  }
  // Allow guests to read and post anonymously so the feature works in
  // local mode without forcing a login.
  const guestName = localStorage.getItem('spokum.moodChat.guestName') || 'Гость';
  return {
    userId: 'guest-' + (localStorage.getItem('spokum.deviceId') || 'anon'),
    username: 'guest',
    displayName: guestName,
    avatar: null,
    hue: 220
  };
}

export function openMoodChats() {
  const body = el('<div class="col" style="gap:8px"></div>');
  const sheet = openSheet('Чаты по настроению', body);
  drawList(body, sheet);
  return sheet;
}

function drawList(body, sheet) {
  body.innerHTML = `<p class="tiny muted" style="margin:0 0 6px;line-height:1.5">Зайдите в комнату своего настроения. Запись в чате не требует входа, но собеседники будут видеть ваше имя.</p>`;
  ROOMS.forEach((room) => {
    const count = memberCount(room.mood);
    const card = el(`<button class="card list-item" style="padding:12px;align-items:flex-start">
      <div class="avatar avatar-40" style="--h:200;font-size:22px;display:flex;align-items:center;justify-content:center">${room.emoji}</div>
      <div class="grow" style="text-align:left;min-width:0">
        <div class="row" style="gap:6px"><span class="strong small">${esc(room.title)}</span>
          <span class="tiny muted">· ${esc(meta(room.mood).label)}</span></div>
        <div class="tiny muted truncate" style="margin-top:2px">${esc(room.hint)}</div>
        <div class="tiny muted" style="margin-top:4px">${icon('users', 12)} ${plural(count, 'участник', 'участника', 'участников')}</div>
      </div>
      <span class="btn btn-sm btn-primary" style="align-self:center">${icon('forward', 14)} Войти</span>
    </button>`);
    card.onclick = () => {
      sheet.close();
      enterRoom(room);
    };
    body.appendChild(card);
  });
}

function enterRoom(room) {
  const view = el(`<div class="chat-view">
    <div class="chat-head">
      <button class="btn btn-icon btn-ghost" data-back>${icon('back', 20)}</button>
      <div class="avatar avatar-40" style="--h:200;font-size:22px;display:flex;align-items:center;justify-content:center">${room.emoji}</div>
      <div class="grow" style="min-width:0">
        <div class="strong small truncate">${esc(room.title)}</div>
        <div class="tiny muted truncate" data-count></div>
      </div>
    </div>
    <div class="chat-body" data-body></div>
    <div class="chat-foot">
      <textarea class="input grow" data-input rows="1" placeholder="Слово настроению..." style="min-height:44px;max-height:120px;resize:none;padding:11px 14px"></textarea>
      <button class="btn btn-primary btn-icon" data-send>${icon('send', 18)}</button>
    </div>
  </div>`);
  document.body.appendChild(view);
  view.style.background = 'var(--bg)';

  const body = view.querySelector('[data-body]');
  const input = view.querySelector('[data-input]');
  const countLine = view.querySelector('[data-count]');

  const paintCount = () => {
    const c = memberCount(room.mood);
    countLine.textContent = `${plural(c, 'участник', 'участника', 'участников')} · ${meta(room.mood).label}`;
  };
  paintCount();

  const draw = () => {
    const messages = loadMessages(room.mood);
    body.innerHTML = '';
    if (!messages.length) {
      body.innerHTML = `<div style="margin:auto">${emptyState('wave', 'Здесь тихо', 'Напишите первое сообщение')}</div>`;
    }
    let lastAuthor = null;
    for (const m of messages) {
      const mine = m.userId === viewerInfo().userId;
      const showAvatar = m.userId !== lastAuthor;
      const node = el(`<div class="msg ${mine ? 'mine' : ''}" style="display:flex;gap:8px;align-items:flex-end;margin:4px 12px;flex-direction:${mine ? 'row-reverse' : 'row'}">
        ${showAvatar
          ? (m.avatar
              ? `<img src="${esc(m.avatar)}" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover">`
              : `<div class="avatar avatar-28" style="--h:${Number(m.hue) || 220}">${esc((m.displayName || m.username || '?').slice(0, 1).toUpperCase())}</div>`)
          : '<span style="width:28px;display:inline-block"></span>'}
        <div style="max-width:74%">
          ${showAvatar ? `<div class="tiny muted" style="margin:0 4px 2px">${esc(m.displayName || m.username)} · ${clockTime(m.createdAt)}</div>` : ''}
          <div style="background:var(--surface-2);border:1px solid var(--line);padding:8px 12px;border-radius:14px;display:inline-block;word-break:break-word">${esc(m.body)}</div>
        </div>
      </div>`);
      body.appendChild(node);
      lastAuthor = m.userId;
    }
    body.scrollTop = body.scrollHeight;
  };
  draw();

  // Poll for new messages from other tabs / windows.
  const refresh = () => {
    draw();
    paintCount();
  };
  window.addEventListener('storage', refresh);
  const observer = new MutationObserver(() => {
    if (!document.body.contains(view)) {
      window.removeEventListener('storage', refresh);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true });

  view.querySelector('[data-back]').onclick = () => {
    view.remove();
    openMoodChats();
  };

  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    const info = viewerInfo();
    const messages = loadMessages(room.mood);
    messages.push({
      id: uid(),
      userId: info.userId,
      username: info.username,
      displayName: info.displayName,
      avatar: info.avatar,
      hue: info.hue,
      body: text.slice(0, 1000),
      createdAt: Date.now()
    });
    saveMessages(room.mood, messages);
    input.value = '';
    input.style.height = '';
    draw();
    paintCount();
  };

  view.querySelector('[data-send]').onclick = send;
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(120, input.scrollHeight)}px`;
  });

  // Entering a room updates the user's current mood so the rest of the app
  // reflects the same feeling. Best-effort: ignore failures (the local
  // backend supports any mood key; the remote one may not know `tender` /
  // `lift` yet, which is fine — we still keep the chat working).
  if (state.user) {
    api.updateMe?.({ mood: room.mood })
      .then(({ user } = {}) => { if (user) setUser(user); })
      .catch(() => {});
  } else {
    localStorage.setItem('spokum.moodChat.guestName', viewerInfo().displayName);
  }
  setTimeout(() => input.focus(), 100);
}
