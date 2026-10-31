import { state } from '../store.js';
import { el, esc, uid } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, emptyState, confirmSheet, pickImage } from '../ui.js';

// Voice rooms in SpokУm. There are no preset rooms — every room is created
// by a user (stored as an array in `spokum.voiceRooms`). The full WebRTC
// mesh is too heavy for a single session of work, so the inside-room view
// ships a simulated audio floor (a "говорит..." indicator flickers
// randomly for fake participants). Real P2P audio can be layered in later
// by swapping `simFloor` for a peer-connection manager — the rest of the
// UI stays the same.

const STATE_KEY = 'spokum.voiceRooms';
const AVATAR_ICONS = ['star', 'moon', 'heart', 'flame', 'crystal', 'trophy', 'gift', 'crown', 'shield', 'spark'];

function loadRooms() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) return data;
    }
  } catch {}
  return [];
}

function saveRooms(rooms) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(rooms)); } catch {}
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

// Render a room's avatar — either an uploaded image (data URL) or one of
// the SVG icons from icons.js. Never an emoji character.
function roomAvatar(room, size = 40) {
  if (room && room.avatarType === 'image' && room.avatar) {
    return `<img src="${esc(room.avatar)}" alt="" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;display:block">`;
  }
  const name = (room && room.avatar) || 'star';
  const hue = Number(room && room.hue) || 200;
  return `<div class="avatar avatar-${size}" style="--h:${hue};display:flex;align-items:center;justify-content:center">${icon(name, Math.round(size * 0.55))}</div>`;
}

export function openVoiceRooms() {
  const body = el('<div class="col" style="gap:8px"></div>');
  const sheet = openSheet('Голосовые комнаты', body);
  drawList(body, sheet);
  return sheet;
}

function drawList(body, sheet) {
  const rooms = loadRooms();
  const me = viewerInfo();

  body.innerHTML = `<div class="row between" style="margin-bottom:4px">
    <p class="tiny muted" style="margin:0;line-height:1.5;flex:1">Создайте комнату или зайдите в существующую, чтобы поговорить голосом. Микрофон можно выключить в любой момент.</p>
    <button class="btn btn-sm btn-primary" data-new style="flex-shrink:0">${icon('plus', 14)} Создать</button>
  </div>`;

  if (!rooms.length) {
    body.appendChild(el(emptyState('phone', 'Пока нет комнат', 'Создайте первую!')));
    body.querySelector('[data-new]').onclick = () => {
      sheet.close();
      openCreateRoom();
    };
    return;
  }

  rooms.forEach((room) => {
    const inRoom = (room.participants || []).some((p) => p.userId === me.userId);
    const count = (room.participants || []).length;
    const isCreator = String(room.createdBy) === String(me.userId);
    const card = el(`<button class="card list-item" style="padding:12px;align-items:center">
      ${roomAvatar(room, 40)}
      <div class="grow" style="text-align:left;min-width:0">
        <div class="row" style="gap:6px;align-items:center">
          <span class="strong small truncate">${esc(room.name)}</span>
          ${room.tag ? `<span class="pill" style="background:var(--bg-3);color:var(--muted)">#${esc(room.tag)}</span>` : ''}
        </div>
        ${room.description ? `<div class="tiny muted truncate" style="margin-top:2px">${esc(room.description)}</div>` : ''}
        <div class="tiny muted" style="margin-top:4px;display:flex;align-items:center;gap:4px">
          ${icon('users', 12)} ${count} / ${Number(room.limit) || 10}
        </div>
      </div>
      <span class="btn btn-sm ${inRoom ? '' : 'btn-primary'}" style="align-self:center">${inRoom ? icon('forward', 14) + ' Вернуться' : icon('forward', 14) + ' Войти'}</span>
    </button>`);
    card.onclick = () => {
      sheet.close();
      enterRoom(room.id);
    };
    body.appendChild(card);

    if (isCreator) {
      const del = el(`<button class="btn btn-sm btn-ghost" style="color:#c98b8b;align-self:flex-end;margin-top:-4px" data-del="${room.id}">${icon('trash', 14)} Удалить комнату</button>`);
      del.onclick = (event) => {
        event.stopPropagation();
        confirmDelete(room, body, sheet);
      };
      body.appendChild(del);
    }
  });

  body.querySelector('[data-new]').onclick = () => {
    sheet.close();
    openCreateRoom();
  };
}

async function confirmDelete(room, body, sheet) {
  const ok = await confirmSheet({
    title: `Удалить «${room.name}»?`,
    text: 'Комната исчезнет для всех. Участники будут отключены.',
    confirm: 'Удалить',
    danger: true
  });
  if (!ok) return;
  const rooms = loadRooms().filter((r) => r.id !== room.id);
  saveRooms(rooms);
  toast('Комната удалена');
  // Re-render the list in place — keeps the same sheet open.
  drawList(body, sheet);
}

function openCreateRoom() {
  const body = el('<div class="col" style="gap:12px"></div>');
  const sheet = openSheet('Создать комнату', body);

  let form = {
    avatar: '',
    avatarType: 'icon',
    name: '',
    limit: 10,
    description: '',
    tag: '',
    hue: 200
  };

  const paint = () => {
    body.innerHTML = `
      <div>
        <div class="small muted" style="margin-bottom:6px">Аватар комнаты</div>
        <div class="row" style="gap:8px;align-items:center;margin-bottom:8px">
          <div style="width:48px;height:48px;border-radius:50%;border:1px dashed var(--line);display:flex;align-items:center;justify-content:center;background:var(--surface);overflow:hidden" data-preview>
            ${form.avatarType === 'image' && form.avatar
              ? `<img src="${esc(form.avatar)}" alt="" style="width:100%;height:100%;object-fit:cover">`
              : `<div class="avatar avatar-48" style="--h:${form.hue};display:flex;align-items:center;justify-content:center">${icon(form.avatar || 'star', 22)}</div>`}
          </div>
          <button class="btn btn-sm" data-upload>${icon('image', 14)} Загрузить</button>
          <button class="btn btn-sm" data-clear style="color:#c98b8b">Сбросить</button>
        </div>
        <div class="small muted" style="margin-bottom:6px">Или выберите иконку</div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px" data-icons>
          ${AVATAR_ICONS.map((name) => `<button class="card" data-icon="${name}" style="padding:8px;display:flex;align-items:center;justify-content:center;${form.avatarType === 'icon' && form.avatar === name ? 'border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft)' : ''}">${icon(name, 22)}</button>`).join('')}
        </div>
      </div>

      <div>
        <div class="small muted" style="margin-bottom:6px">Имя комнаты <span class="tiny" data-name-len style="opacity:.6">0/40</span></div>
        <input class="input" data-name maxlength="40" placeholder="Например: Уютный вечер" value="${esc(form.name)}">
      </div>

      <div>
        <div class="small muted" style="margin-bottom:6px">Лимит участников</div>
        <input class="input" type="number" min="2" max="50" data-limit value="${Number(form.limit) || 10}">
      </div>

      <div>
        <div class="small muted" style="margin-bottom:6px">Описание <span class="tiny" data-desc-len style="opacity:.6">0/200</span></div>
        <textarea class="input" data-desc maxlength="200" rows="2" placeholder="О чём комната (необязательно)">${esc(form.description)}</textarea>
      </div>

      <div>
        <div class="small muted" style="margin-bottom:6px">Тег <span class="tiny" style="opacity:.6">одно слово</span></div>
        <input class="input" data-tag maxlength="20" placeholder="например: музыка" value="${esc(form.tag)}">
      </div>

      <button class="btn btn-primary" data-create style="width:100%">${icon('plus', 16)} Создать</button>
    `;

    const nameInp = body.querySelector('[data-name]');
    const descInp = body.querySelector('[data-desc]');
    const limitInp = body.querySelector('[data-limit]');
    const tagInp = body.querySelector('[data-tag]');
    const nameLen = body.querySelector('[data-name-len]');
    const descLen = body.querySelector('[data-desc-len]');

    // Persist input values into `form` so re-renders (icon pick, image
    // upload) don't wipe what the user has typed.
    const syncForm = () => {
      form.name = nameInp.value;
      form.description = descInp.value;
      form.tag = tagInp.value;
      form.limit = Number(limitInp.value) || 10;
    };
    const syncLen = () => {
      nameLen.textContent = `${nameInp.value.length}/40`;
      descLen.textContent = `${descInp.value.length}/200`;
    };
    syncLen();
    nameInp.addEventListener('input', () => { form.name = nameInp.value; syncLen(); });
    descInp.addEventListener('input', () => { form.description = descInp.value; syncLen(); });
    tagInp.addEventListener('input', () => { form.tag = tagInp.value; });
    limitInp.addEventListener('input', () => { form.limit = Number(limitInp.value) || 10; });

    body.querySelector('[data-upload]').onclick = async () => {
      syncForm();
      const data = await pickImage(800);
      if (!data) return;
      form.avatar = data;
      form.avatarType = 'image';
      paint();
    };
    body.querySelector('[data-clear]').onclick = () => {
      syncForm();
      form.avatar = '';
      form.avatarType = 'icon';
      paint();
    };
    body.querySelectorAll('[data-icon]').forEach((btn) => {
      btn.onclick = () => {
        syncForm();
        form.avatar = btn.dataset.icon;
        form.avatarType = 'icon';
        // Stable hue per icon so the preview avatar has some color.
        const idx = AVATAR_ICONS.indexOf(form.avatar);
        form.hue = 200 + idx * 12;
        paint();
      };
    });

    body.querySelector('[data-create]').onclick = () => {
      syncForm();
      const name = nameInp.value.trim();
      if (name.length < 3 || name.length > 40) {
        return toast('Имя комнаты — 3-40 символов', 'err');
      }
      const limit = Math.max(2, Math.min(50, Number(limitInp.value) || 10));
      const description = descInp.value.trim().slice(0, 200);
      let tag = tagInp.value.trim().replace(/^#/, '').slice(0, 20);
      if (tag && /\s/.test(tag)) {
        return toast('Тег должен быть одним словом', 'err');
      }
      const me = viewerInfo();
      const room = {
        id: 'r-' + uid(),
        name,
        avatar: form.avatar || 'star',
        avatarType: form.avatarType,
        hue: form.hue || 200,
        limit,
        description,
        tag,
        createdBy: me.userId,
        createdAt: Date.now(),
        participants: []
      };
      const rooms = loadRooms();
      rooms.push(room);
      saveRooms(rooms);
      sheet.close();
      toast('Комната создана');
      enterRoom(room.id);
    };
  };
  paint();
  return sheet;
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

function enterRoom(roomId) {
  let room = loadRooms().find((r) => r.id === roomId);
  if (!room) {
    toast('Комната не найдена', 'err');
    return openVoiceRooms();
  }
  const view = el(`<div class="chat-view" data-voice-room>
    <div class="chat-head">
      <button class="btn btn-icon btn-ghost" data-back>${icon('back', 20)}</button>
      ${roomAvatar(room, 40)}
      <div class="grow" style="min-width:0">
        <div class="row" style="gap:6px;align-items:center">
          <span class="strong small truncate">${esc(room.name)}</span>
          ${room.tag ? `<span class="pill" style="background:var(--bg-3);color:var(--muted)">#${esc(room.tag)}</span>` : ''}
        </div>
        <div class="tiny muted truncate" data-status>Подключаемся...</div>
      </div>
    </div>
    <div class="chat-body" data-body style="display:block;padding:16px"></div>
    <div class="chat-foot" style="justify-content:center;gap:10px;flex-wrap:wrap">
      <button class="btn btn-icon" data-mute title="Микрофон">${icon('mute', 22)}</button>
      <button class="btn btn-danger" data-leave>${icon('logout', 18)} Покинуть</button>
      <button class="btn btn-ghost" data-delete style="color:#c98b8b;display:none">${icon('trash', 16)} Удалить комнату</button>
    </div>
  </div>`);
  document.body.appendChild(view);
  view.style.background = 'var(--bg)';

  const statusLine = view.querySelector('[data-status]');
  const body = view.querySelector('[data-body]');
  const muteBtn = view.querySelector('[data-mute]');
  const leaveBtn = view.querySelector('[data-leave]');
  const deleteBtn = view.querySelector('[data-delete]');

  let muted = true;
  let micOk = false;
  let me = viewerInfo();
  let isCreator = String(room.createdBy) === String(me.userId);
  if (isCreator) deleteBtn.style.display = '';

  const refresh = () => {
    const rooms = loadRooms();
    room = rooms.find((r) => r.id === roomId);
    return room;
  };

  const paint = () => {
    const cur = refresh();
    if (!cur) {
      // Room was deleted (creator removed it).
      view.remove();
      clearInterval(tick);
      window.removeEventListener('storage', onStorage);
      toast('Комната удалена');
      openVoiceRooms();
      return;
    }
    room = cur;
    const list = room.participants || [];
    const limit = Number(room.limit) || 10;
    statusLine.textContent = `${list.length}/${limit} · ${micOk ? 'микрофон ' + (muted ? 'выключен' : 'включён') : 'микрофон недоступен'}`;
    muteBtn.innerHTML = icon(muted ? 'mute' : 'mic', 22);
    body.innerHTML = '';

    if (room.description) {
      body.appendChild(el(`<div class="tiny muted" style="margin:0 0 10px;line-height:1.5">${esc(room.description)}</div>`));
    }

    const head = el(`<div class="strong small" style="margin:0 0 12px">Участники · ${list.length}/${limit}</div>`);
    body.appendChild(head);
    if (!list.length) {
      body.appendChild(el(`<div class="tiny muted">Никого нет, но вы можете подождать</div>`));
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
    const rooms = loadRooms();
    const idx = rooms.findIndex((r) => r.id === roomId);
    if (idx < 0) {
      view.remove();
      toast('Комната удалена');
      return openVoiceRooms();
    }
    room = rooms[idx];
    if (!Array.isArray(room.participants)) room.participants = [];
    const limit = Number(room.limit) || 10;
    if (!room.participants.find((s) => s.userId === me.userId)) {
      if (room.participants.length >= limit) {
        toast('Комната заполнена', 'err');
        view.remove();
        return openVoiceRooms();
      }
      room.participants.push({ ...me, muted: true, speaking: false, joinedAt: Date.now() });
      rooms[idx] = room;
      saveRooms(rooms);
    }
    paint();
  };
  join();

  // Simulated "speaking" indicator — flips random non-muted participants
  // on and off so the UI feels alive without real audio analysis.
  const tick = setInterval(() => {
    const rooms = loadRooms();
    const idx = rooms.findIndex((r) => r.id === roomId);
    if (idx < 0) return paint();
    let changed = false;
    (rooms[idx].participants || []).forEach((seat) => {
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
      rooms[idx] = { ...rooms[idx] };
      saveRooms(rooms);
      paint();
    }
  }, 1200);

  // Sync across tabs: refresh participants when another tab changes state.
  const onStorage = () => paint();
  window.addEventListener('storage', onStorage);

  const leave = () => {
    clearInterval(tick);
    window.removeEventListener('storage', onStorage);
    const rooms = loadRooms();
    const idx = rooms.findIndex((r) => r.id === roomId);
    if (idx >= 0) {
      rooms[idx].participants = (rooms[idx].participants || []).filter((s) => s.userId !== me.userId);
      saveRooms(rooms);
    }
    view.remove();
    openVoiceRooms();
  };

  muteBtn.onclick = () => {
    muted = !muted;
    const rooms = loadRooms();
    const idx = rooms.findIndex((r) => r.id === roomId);
    if (idx >= 0) {
      const list = rooms[idx].participants || [];
      const me2 = list.find((s) => s.userId === me.userId);
      if (me2) {
        me2.muted = muted;
        me2.speaking = !muted && me2.speaking;
      }
      rooms[idx] = { ...rooms[idx] };
      saveRooms(rooms);
    }
    paint();
    if (!micOk && !muted) toast('Микрофон недоступен — разрешите доступ в браузере', 'err');
  };

  leaveBtn.onclick = leave;
  view.querySelector('[data-back]').onclick = leave;

  deleteBtn.onclick = async () => {
    const ok = await confirmSheet({
      title: `Удалить «${room.name}»?`,
      text: 'Комната исчезнет для всех. Участники будут отключены.',
      confirm: 'Удалить',
      danger: true
    });
    if (!ok) return;
    clearInterval(tick);
    window.removeEventListener('storage', onStorage);
    const rooms = loadRooms().filter((r) => r.id !== roomId);
    saveRooms(rooms);
    view.remove();
    toast('Комната удалена');
    openVoiceRooms();
  };

  // Clean up if the view is removed by anything else.
  const observer = new MutationObserver(() => {
    if (!document.body.contains(view)) {
      clearInterval(tick);
      window.removeEventListener('storage', onStorage);
      observer.disconnect();
      const rooms = loadRooms();
      const idx = rooms.findIndex((r) => r.id === roomId);
      if (idx >= 0) {
        rooms[idx].participants = (rooms[idx].participants || []).filter((s) => s.userId !== me.userId);
        saveRooms(rooms);
      }
    }
  });
  observer.observe(document.body, { childList: true });
}
