import { state } from '../store.js';
import { el, esc, uid, plural } from '../util.js';
import { icon } from '../icons.js';
import { avatar, toast, openSheet, emptyState, confirmSheet, promptSheet } from '../ui.js';

// Voice rooms in SpokУm. The full WebRTC mesh is too heavy for a single
// session of work, so we ship the room management UI + a simulated audio
// floor (a "говорит..." indicator flickers randomly for fake participants).
// Real P2P audio can be layered in later by swapping `simFloor` for a
// peer-connection manager — the rest of the UI stays the same.

const STATE_KEY = 'spokum.voiceRooms';
const PRESET = [
  { id: 'calm-eve',  name: 'Спокойный вечер', icon: '🌙', desc: 'Тёплый свет и тишина' },
  { id: 'reading',   name: 'Чтение',          icon: '📖', desc: 'Тихо читаем вместе' },
  { id: 'music',     name: 'Музыка',          icon: '🎵', desc: 'Фоном играет что-то лёгкое' },
  { id: 'talk',      name: 'Общение',         icon: '💬', desc: 'Без темы, просто говорим' },
  { id: 'sleep',     name: 'Сон',             icon: '😴', desc: 'Засыпаем под тишину' }
];

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') return data;
    }
  } catch {}
  return { custom: [], seats: {} };
}

function saveState(data) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(data)); } catch {}
}

function allRooms(data) {
  return [...PRESET, ...(data.custom || [])];
}

function seats(data, roomId) {
  return Array.isArray(data.seats[roomId]) ? data.seats[roomId] : [];
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
  return {
    userId: 'guest-' + (localStorage.getItem('spokum.deviceId') || 'anon'),
    username: 'guest',
    displayName: 'Гость',
    avatar: null,
    hue: 220
  };
}

export function openVoiceRooms() {
  const body = el('<div class="col" style="gap:8px"></div>');
  const sheet = openSheet('Голосовые комнаты', body);
  drawList(body, sheet);
  return sheet;
}

function drawList(body, sheet) {
  const data = loadState();
  const rooms = allRooms(data);
  body.innerHTML = `<div class="row between" style="margin-bottom:4px">
    <p class="tiny muted" style="margin:0;line-height:1.5;flex:1">Заходите в комнату, чтобы поговорить голосом. Микрофон можно выключить в любой момент.</p>
    <button class="btn btn-sm btn-primary" data-new style="flex-shrink:0">${icon('plus', 14)} Создать</button>
  </div>`;

  rooms.forEach((room) => {
    const roomSeats = seats(data, room.id);
    const count = roomSeats.length;
    const card = el(`<button class="card list-item" style="padding:12px;align-items:center">
      <div class="avatar avatar-40" style="--h:200;font-size:22px;display:flex;align-items:center;justify-content:center">${room.icon || '🎙'}</div>
      <div class="grow" style="text-align:left;min-width:0">
        <div class="strong small truncate">${esc(room.name)}</div>
        <div class="tiny muted truncate" style="margin-top:2px">${esc(room.desc || '')}</div>
        <div class="tiny muted" style="margin-top:4px">${icon('users', 12)} ${plural(count, 'человек', 'человека', 'человек')} в комнате</div>
      </div>
      <span class="btn btn-sm btn-primary" style="align-self:center">${icon('forward', 14)} Войти</span>
    </button>`);
    card.onclick = () => {
      sheet.close();
      enterRoom(room);
    };
    body.appendChild(card);
  });

  body.querySelector('[data-new]').onclick = async () => {
    sheet.close();
    const name = await promptSheet({ title: 'Новая комната', label: 'Название', placeholder: 'Например: Утренний чай', confirm: 'Создать' });
    if (!name) return openVoiceRooms();
    const desc = await promptSheet({ title: 'Описание', label: 'Необязательно', placeholder: 'О чём комната', confirm: 'Дальше' });
    const data = loadState();
    const room = { id: 'c-' + uid(), name: name.slice(0, 60), desc: (desc || '').slice(0, 120), icon: '🎙' };
    data.custom = [...(data.custom || []), room];
    saveState(data);
    enterRoom(room);
  };
}

function ensureMic() {
  return new Promise((done) => {
    if (!navigator.mediaDevices?.getUserMedia) return done(false);
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        // Stop tracks immediately — we don't actually broadcast in this
        // version, we only needed the permission grant so the UI can
        // truthfully say "микрофон работает".
        stream.getTracks().forEach((t) => t.stop());
        done(true);
      })
      .catch(() => done(false));
  });
}

function enterRoom(room) {
  const view = el(`<div class="chat-view" data-voice-room>
    <div class="chat-head">
      <button class="btn btn-icon btn-ghost" data-back>${icon('back', 20)}</button>
      <div class="avatar avatar-40" style="--h:200;font-size:22px;display:flex;align-items:center;justify-content:center">${room.icon || '🎙'}</div>
      <div class="grow" style="min-width:0">
        <div class="strong small truncate">${esc(room.name)}</div>
        <div class="tiny muted truncate" data-status>Подключаемся...</div>
      </div>
    </div>
    <div class="chat-body" data-body style="display:block;padding:16px"></div>
    <div class="chat-foot" style="justify-content:center;gap:10px">
      <button class="btn btn-icon" data-mute title="Микрофон">${icon('mute', 22)}</button>
      <button class="btn btn-danger" data-leave>${icon('logout', 18)} Покинуть</button>
    </div>
  </div>`);
  document.body.appendChild(view);
  view.style.background = 'var(--bg)';

  const statusLine = view.querySelector('[data-status]');
  const body = view.querySelector('[data-body]');
  const muteBtn = view.querySelector('[data-mute]');
  const leaveBtn = view.querySelector('[data-leave]');

  let muted = true;
  let micOk = false;
  let me = viewerInfo();

  const paint = () => {
    const data = loadState();
    const list = seats(data, room.id);
    statusLine.textContent = `${plural(list.length, 'человек', 'человека', 'человек')} в комнате · ${micOk ? 'микрофон ' + (muted ? 'выключен' : 'включён') : 'микрофон недоступен'}`;
    muteBtn.innerHTML = icon(muted ? 'mute' : 'mic', 22);
    body.innerHTML = `<div class="strong small" style="margin:0 0 12px">Участники</div>`;
    if (!list.length) {
      body.innerHTML += `<div class="tiny muted">Никого нет, но вы можете подождать</div>`;
    }
    const grid = el('<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:12px"></div>');
    list.forEach((seat) => {
      const speaking = !seat.muted && seat.speaking;
      const cell = el(`<div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px;border-radius:14px;background:var(--surface);border:1px solid ${speaking ? 'var(--accent)' : 'var(--line)'};${speaking ? 'box-shadow:0 0 0 2px var(--accent-soft);' : ''}">
        ${seat.avatar
          ? `<img src="${esc(seat.avatar)}" alt="" style="width:48px;height:48px;border-radius:50%;object-fit:cover">`
          : `<div class="avatar avatar-48" style="--h:${Number(seat.hue) || 220}">${esc((seat.displayName || seat.username || '?').slice(0, 1).toUpperCase())}</div>`}
        <div class="tiny strong" style="max-width:88px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(seat.displayName || seat.username)}</div>
        <div class="tiny muted" style="display:flex;align-items:center;gap:3px">${seat.muted ? icon('mute', 12) : (speaking ? `<span style="color:var(--accent)">говорит...</span>` : icon('mic', 12))}</div>
      </div>`);
      grid.appendChild(cell);
    });
    body.appendChild(grid);

    body.appendChild(el(`<div class="tiny muted" style="margin-top:14px;line-height:1.5;display:flex;gap:6px;align-items:flex-start">${icon('warn', 14)}<span>Голосовое соединение упрощено: вы видите участников, но в этой версии звук не передаётся по сети. Полноценный WebRTC появится позже.</span></div>`));
  };

  const join = async () => {
    micOk = await ensureMic();
    const data = loadState();
    const list = seats(data, room.id);
    if (!list.find((s) => s.userId === me.userId)) {
      list.push({ ...me, muted: true, speaking: false, joinedAt: Date.now() });
      data.seats[room.id] = list;
      saveState(data);
    }
    paint();
  };
  join();

  // Simulated "speaking" indicator — flips random non-muted participants
  // on and off so the UI feels alive without real audio analysis.
  const tick = setInterval(() => {
    const data = loadState();
    const list = seats(data, room.id);
    let changed = false;
    list.forEach((seat) => {
      if (seat.userId === me.userId) {
        seat.speaking = !seat.muted && (Math.random() < 0.25);
      } else if (!seat.muted) {
        seat.speaking = Math.random() < 0.18;
      } else {
        seat.speaking = false;
      }
      changed = true;
    });
    if (changed) {
      data.seats[room.id] = list;
      saveState(data);
      paint();
    }
  }, 1200);

  // Sync across tabs: refresh seats when another tab changes state.
  const onStorage = () => paint();
  window.addEventListener('storage', onStorage);

  const leave = () => {
    clearInterval(tick);
    window.removeEventListener('storage', onStorage);
    const data = loadState();
    data.seats[room.id] = seats(data, room.id).filter((s) => s.userId !== me.userId);
    saveState(data);
    view.remove();
    openVoiceRooms();
  };

  muteBtn.onclick = () => {
    muted = !muted;
    const data = loadState();
    const list = seats(data, room.id);
    const me2 = list.find((s) => s.userId === me.userId);
    if (me2) {
      me2.muted = muted;
      me2.speaking = !muted && me2.speaking;
    }
    data.seats[room.id] = list;
    saveState(data);
    paint();
    if (!micOk && !muted) toast('Микрофон недоступен — разрешите доступ в браузере', 'err');
  };

  leaveBtn.onclick = leave;
  view.querySelector('[data-back]').onclick = leave;

  // Clean up if the view is removed by anything else.
  const observer = new MutationObserver(() => {
    if (!document.body.contains(view)) {
      clearInterval(tick);
      window.removeEventListener('storage', onStorage);
      observer.disconnect();
      const data = loadState();
      data.seats[room.id] = seats(data, room.id).filter((s) => s.userId !== me.userId);
      saveState(data);
    }
  });
  observer.observe(document.body, { childList: true });
}
