import { api, state, isOffline, isPremium } from '../store.js';
import { el, esc, timeAgo, clockTime, durationText, debounce } from '../util.js';
import { icon } from '../icons.js';
import { avatar, badges, toast, openSheet, emptyState, pickImage, promptSheet } from '../ui.js';
import { openProfile } from './profile.js';

const EMOJI = ['🙂','😌','😴','🥲','😭','😤','😍','🤍','✨','🌙','☕','🌿','🫶','👀','🔥','💤','🎧','📌','🙏','💬','🌊','🧊','🍂','⭐'];

let listRoot = null;

export async function render(root) {
  listRoot = root;
  root.innerHTML = `
    <div class="topbar">
      <div><h1>Чаты</h1><p class="sub">Разговоры без шума</p></div>
      <div class="spacer"></div>
      <button class="btn btn-icon" data-new title="Создать">${icon('plus', 18)}</button>
    </div>
    <div class="row" style="margin-bottom:12px">
      <div class="grow" style="position:relative">
        <input class="input" data-search placeholder="Поиск людей по @юзернейму или словам" style="padding-left:42px">
        <div style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--muted)">${icon('search', 18)}</div>
      </div>
    </div>
    <div data-results></div>
    <div class="col" data-list style="gap:2px"></div>`;

  root.querySelector('[data-new]').onclick = openCreate;
  const search = root.querySelector('[data-search]');
  const results = root.querySelector('[data-results]');
  search.addEventListener('input', debounce(async () => {
    const q = search.value.trim();
    if (!q) {
      results.innerHTML = '';
      return;
    }
    const { users } = await api.searchUsers(q);
    const others = users.filter((u) => u.id !== state.user?.id);
    results.innerHTML = others.length
      ? `<div class="card" style="padding:8px;margin-bottom:12px">${others
          .map(
            (u) => `<button class="list-item" data-user="${u.id}" data-name="${esc(u.username)}">${avatar(u, 40)}
              <div class="grow"><div class="row" style="gap:6px"><span class="strong small">${esc(u.displayName)}</span>${badges(u)}</div>
              <div class="tiny muted truncate">@${esc(u.username)}${u.bio ? ` · ${esc(u.bio)}` : ''}</div></div>${icon('send', 16)}</button>`
          )
          .join('')}</div>`
      : `<div class="card small muted center" style="margin-bottom:12px">Никого не нашли</div>`;
    results.querySelectorAll('[data-user]').forEach((button) => {
      button.onclick = async () => {
        try {
          const { chat } = await api.createChat({ kind: 'dm', members: [button.dataset.user] });
          search.value = '';
          results.innerHTML = '';
          await load(root);
          openChat(chat.id);
        } catch (error) {
          toast(error.message, 'err');
        }
      };
    });
  }, 260));

  await load(root);
}

async function load(root) {
  const list = root.querySelector('[data-list]');
  if (!state.user) {
    list.innerHTML = emptyState('chats', 'Нужен вход', 'Войдите, чтобы переписываться');
    return;
  }
  if (isOffline()) {
    list.innerHTML = emptyState('warn', 'Нет интернета', 'Переписка станет доступна, когда связь вернётся');
    return;
  }
  let chats;
  try {
    ({ chats } = await api.chats());
  } catch (error) {
    list.innerHTML = emptyState('warn', 'Не загрузилось', error.message);
    return;
  }
  if (!chats.length) {
    list.innerHTML = emptyState('chats', 'Пока пусто', 'Найдите человека через поиск выше');
    return;
  }
  list.innerHTML = '';
  chats.forEach((chat) => {
    const last = chat.lastMessage;
    const preview = last
      ? last.kind === 'sticker'
        ? 'Стикер'
        : last.kind === 'image'
        ? 'Фотография'
        : last.kind === 'voice'
          ? `Голосовое ${durationText(last.duration)}`
          : last.kind === 'call'
            ? last.body
            : last.body
      : 'Ещё нет сообщений';
    const mark = chat.kind === 'group' ? icon('group', 13) : chat.kind === 'channel' ? icon('channel', 13) : '';
    const node = el(`
      <button class="card list-item appear" style="padding:12px">
        ${chat.peer ? avatar(chat.peer, 46) : `<div class="avatar avatar-46" style="--h:${chat.hue}">${esc((chat.title || '?')[0].toUpperCase())}</div>`}
        <div class="grow" style="min-width:0">
          <div class="row" style="gap:6px">
            ${mark ? `<span class="muted">${mark}</span>` : ''}
            <span class="strong small truncate">${esc(chat.title)}</span>
            ${chat.peer ? badges(chat.peer) : ''}
            <div class="grow"></div>
            <span class="tiny muted">${last ? timeAgo(last.createdAt) : ''}</span>
          </div>
          <div class="row" style="gap:6px;margin-top:2px">
            <span class="tiny muted truncate grow">${esc(preview)}</span>
            ${chat.unread ? `<span class="pill good tiny" style="padding:1px 8px">${chat.unread}</span>` : ''}
          </div>
        </div>
      </button>`);
    node.onclick = () => openChat(chat.id);
    list.appendChild(node);
  });
}

function openCreate() {
  const body = el(`
    <div class="col" style="gap:6px">
      <button class="list-item" data-group>${icon('group', 20)}<div class="grow"><div class="strong small">Новая группа</div><div class="tiny muted">Общий чат с друзьями</div></div></button>
      <button class="list-item" data-channel>${icon('channel', 20)}<div class="grow"><div class="strong small">Новый канал</div><div class="tiny muted">Вы пишете, остальные читают</div></div></button>
    </div>`);
  const sheet = openSheet('Создать', body);
  const make = async (kind) => {
    sheet.close();
    const title = await promptSheet({ title: kind === 'group' ? 'Название группы' : 'Название канала', placeholder: 'Например: Вечерний круг' });
    if (!title) return;
    try {
      const { chat } = await api.createChat({ kind, title, members: [] });
      await load(listRoot);
      openChat(chat.id);
    } catch (error) {
      toast(error.message, 'err');
    }
  };
  body.querySelector('[data-group]').onclick = () => make('group');
  body.querySelector('[data-channel]').onclick = () => make('channel');
}

export async function openChat(chatId) {
  const { chats } = await api.chats();
  const chat = chats.find((c) => c.id === chatId);
  if (!chat) return toast('Чат не найден', 'err');

  const view = el(`
    <div class="chat-view">
      <div class="chat-head">
        <button class="btn btn-icon btn-ghost" data-back>${icon('back', 20)}</button>
        <button style="display:contents" data-peer>
          ${chat.peer ? avatar(chat.peer, 40) : `<div class="avatar avatar-40" style="--h:${chat.hue}">${esc((chat.title || '?')[0].toUpperCase())}</div>`}
        </button>
        <div class="grow" style="min-width:0">
          <div class="row" style="gap:6px"><span class="strong small truncate">${esc(chat.title)}</span>${chat.peer ? badges(chat.peer) : ''}</div>
          <div class="tiny muted truncate">${chat.kind === 'dm' ? `@${esc(chat.peer?.username || '')}` : `${chat.members.length} участников`}</div>
        </div>
        ${chat.kind === 'dm' ? `<button class="btn btn-icon btn-ghost" data-video-call>${icon('video', 19)}</button>
        <button class="btn btn-icon btn-ghost" data-call>${icon('phone', 19)}</button>` : ''}
        <button class="btn btn-icon btn-ghost" data-menu>${icon('more', 19)}</button>
      </div>
      <div class="chat-body" data-body></div>
      <div class="chat-foot">
        <button class="btn btn-icon btn-ghost" data-emoji>${icon('smile', 19)}</button>
        <button class="btn btn-icon btn-ghost" data-stickers>${icon('star', 19)}</button>
        <button class="btn btn-icon btn-ghost" data-image>${icon('image', 19)}</button>
        <textarea class="input grow" data-input rows="1" placeholder="Сообщение" style="min-height:44px;max-height:120px;resize:none;padding:11px 14px"></textarea>
        <button class="btn btn-icon btn-ghost" data-voice>${icon('mic', 19)}</button>
        <button class="btn btn-primary btn-icon" data-send>${icon('send', 18)}</button>
      </div>
    </div>`);
  document.body.appendChild(view);

  const body = view.querySelector('[data-body]');
  const input = view.querySelector('[data-input]');
  const readOnly = chat.kind === 'channel' && chat.role !== 'owner' && !state.user?.isAdmin;
  if (readOnly) {
    view.querySelector('.chat-foot').innerHTML = '<div class="small muted center grow" style="padding:10px">В канале пишет только владелец</div>';
  }

  view.querySelector('[data-back]').onclick = () => {
    view.remove();
    load(listRoot);
  };
  view.querySelector('[data-peer]').onclick = () => {
    if (chat.peer) openProfile(chat.peer.username);
    else openMembers(chat);
  };
  view.querySelector('[data-menu]').onclick = () => openChatMenu(chat, view);
  view.querySelector('[data-call]')?.addEventListener('click', async () => {
    const { startCall } = await import('../call.js');
    startCall(chat);
  });
  view.querySelector('[data-video-call]')?.addEventListener('click', async () => {
    const { startCall } = await import('../call.js');
    startCall(chat, { video: true });
  });

  const draw = async () => {
    const { messages } = await api.messages(chatId);
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 120;
    body.innerHTML = '';
    if (!messages.length) {
      body.innerHTML = `<div style="margin:auto">${emptyState('wave', 'Начните разговор', 'Здесь спокойно и без спешки')}</div>`;
    }
    let lastAuthor = null;
    for (const message of messages) {
      body.appendChild(bubble(message, chat, lastAuthor));
      lastAuthor = message.author?.id;
    }
    if (atBottom || true) body.scrollTop = body.scrollHeight;
    api.markRead(chatId);
  };
  await draw();

  const refresh = () => draw();
  window.addEventListener('spokum:message', refresh);
  const observer = new MutationObserver(() => {
    if (!document.body.contains(view)) {
      window.removeEventListener('spokum:message', refresh);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true });

  const send = async (payload) => {
    if (isOffline()) return toast('Нет интернета, сообщение не уйдёт', 'err');
    try {
      await api.sendMessage(chatId, payload);
      input.value = '';
      input.style.height = '';
      await draw();
    } catch (error) {
      toast(error.message, 'err');
    }
  };

  view.querySelector('[data-send]')?.addEventListener('click', () => {
    const text = input.value.trim();
    if (text) send({ kind: 'text', body: text });
  });
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const text = input.value.trim();
      if (text) send({ kind: 'text', body: text });
    }
  });
  input?.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(120, input.scrollHeight)}px`;
  });

  view.querySelector('[data-image]')?.addEventListener('click', async () => {
    const image = await pickImage(1200);
    if (image) send({ kind: 'image', media: image });
  });

  view.querySelector('[data-emoji]')?.addEventListener('click', () => {
    const grid = el(`<div class="emoji-grid">${EMOJI.map((e) => `<button data-e="${e}">${e}</button>`).join('')}</div>`);
    const sheet = openSheet('Эмодзи', grid);
    grid.querySelectorAll('[data-e]').forEach((button) => {
      button.onclick = () => {
        input.value += button.dataset.e;
        sheet.close();
        input.focus();
      };
    });
  });

  view.querySelector('[data-stickers]')?.addEventListener('click', () => openStickers(send));

  view.querySelector('[data-voice]')?.addEventListener('click', () => recordVoice(send));
}

function bubble(message, chat, lastAuthor) {
  const mine = message.author?.id === state.user?.id;
  if (message.kind === 'call') {
    return el(`<div class="bubble system">${icon('phone', 12)} ${esc(message.body)}</div>`);
  }
  const showAuthor = chat.kind !== 'dm' && !mine && message.author?.id !== lastAuthor;
  let inner = '';
  if (message.kind === 'sticker') inner = `<img class="sticker" src="${esc(message.media)}" alt="стикер" loading="lazy">`;
  else if (message.kind === 'image') inner = `<img src="${esc(message.media)}" alt="" loading="lazy">${message.body ? `<div style="margin-top:6px">${esc(message.body)}</div>` : ''}`;
  else if (message.kind === 'voice') {
    const bars = Array.from({ length: 22 }, (_, i) => `<i style="height:${20 + Math.round(Math.sin(i * 1.7 + message.id) * 55 + 55) * 0.6}%"></i>`).join('');
    inner = `<div class="voice"><button class="btn btn-icon btn-ghost" data-play style="width:32px;height:32px">${icon('play', 15)}</button><div class="voice-bars">${bars}</div><span class="tiny">${durationText(message.duration)}</span></div>`;
  } else if (message.kind === 'video') {
    inner = `<div class="chat-reel" data-reel><video src="${esc(message.media || '')}" playsinline muted loop preload="metadata"></video><span class="chat-reel-play">${icon('play', 22)}</span></div>${message.body ? `<div style="margin-top:6px">${esc(message.body)}</div>` : ''}`;
  } else if (message.kind === 'post') {
    inner = `<div class="chat-reel" data-reel>${message.media ? `<img src="${esc(message.media)}" alt="" loading="lazy">` : `<span class="chat-reel-play">${icon('feed', 22)}</span>`}</div>${message.body ? `<div style="margin-top:6px">${esc(message.body)}</div>` : ''}`;
  } else inner = esc(message.body);

  const seen = mine && message.createdAt <= (chat.peerReadAt || 0);
  const ticks = mine ? `<span class="ticks ${seen ? 'seen' : ''}">${icon(seen ? 'check_double' : 'check', 13, 2.6)}</span>` : '';
  const node = el(`<div class="bubble ${mine ? 'mine' : ''} ${message.kind === 'sticker' ? 'bubble-sticker' : ''}">${showAuthor ? `<div class="bubble-author">${esc(message.author?.displayName || '')}</div>` : ''}${inner}<div class="bubble-meta">${clockTime(message.createdAt)}${ticks}</div></div>`);

  const reel = node.querySelector('[data-reel]');
  if (reel) {
    const clip = reel.querySelector('video');
    reel.onclick = () => {
      if (!clip) {
        window.__spokum?.openTab?.('videos');
        return;
      }
      if (clip.paused) {
        clip.muted = false;
        clip.play().catch(() => {
          clip.muted = true;
          clip.play().catch(() => {});
        });
        reel.classList.add('playing');
      } else {
        clip.pause();
        reel.classList.remove('playing');
      }
    };
  }

  const play = node.querySelector('[data-play]');
  if (play) {
    const audio = new Audio(message.media);
    play.onclick = () => {
      if (audio.paused) {
        audio.play();
        play.innerHTML = icon('pause', 15);
      } else {
        audio.pause();
        play.innerHTML = icon('play', 15);
      }
    };
    audio.onended = () => {
      play.innerHTML = icon('play', 15);
    };
  }
  return node;
}

async function openStickers(send) {
  const body = el('<div class="col" data-host style="gap:12px"></div>');
  const sheet = openSheet('Стикеры', body);

  const draw = async () => {
    let stickers = [];
    try {
      ({ stickers } = await api.stickers());
    } catch (error) {
      body.innerHTML = `<div class="small muted center">${esc(error.message)}</div>`;
      return;
    }

    body.innerHTML = `
      ${stickers.length
        ? `<div class="sticker-grid" data-grid>${stickers
            .map((sticker) => `<button data-send="${sticker.id}" data-image="${esc(sticker.image)}"><img src="${esc(sticker.image)}" alt=""></button>`)
            .join('')}</div>`
        : `<div class="small muted center" style="padding:14px 0">Своих стикеров пока нет</div>`}
      ${isPremium(state.user)
        ? `<div class="row" style="gap:8px">
            <button class="btn grow" data-add>${icon('plus', 16)} Добавить стикер</button>
            ${stickers.length ? `<button class="btn btn-sm" data-manage>${icon('trash', 15)}</button>` : ''}
          </div>`
        : `<div class="tiny muted center">Свои стикеры доступны с подпиской СпокУм Премиум</div>`}`;

    body.querySelectorAll('[data-send]').forEach((button) => {
      button.onclick = () => {
        send({ kind: 'sticker', media: button.dataset.image });
        sheet.close();
      };
    });

    body.querySelector('[data-add]')?.addEventListener('click', async () => {
      const image = await pickImage(320);
      if (!image) return;
      try {
        await api.addSticker(image);
        toast('Стикер добавлен');
        draw();
      } catch (error) {
        toast(error.message, 'err');
      }
    });

    body.querySelector('[data-manage]')?.addEventListener('click', () => {
      body.querySelectorAll('[data-send]').forEach((button) => {
        button.onclick = async () => {
          try {
            await api.removeSticker(Number(button.dataset.send));
            toast('Стикер удалён');
            draw();
          } catch (error) {
            toast(error.message, 'err');
          }
        };
      });
      toast('Нажмите на стикер, чтобы удалить');
    });
  };

  await draw();
}

async function recordVoice(send) {
  if (!navigator.mediaDevices?.getUserMedia) return toast('Микрофон недоступен', 'err');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return toast('Нет доступа к микрофону', 'err');
  }
  const recorder = new MediaRecorder(stream);
  const chunks = [];
  const started = Date.now();
  recorder.ondataavailable = (event) => chunks.push(event.data);

  const body = el(`
    <div class="col center">
      <div class="row" style="justify-content:center;color:#c98b8b">${icon('mic', 28)}</div>
      <div class="strong" data-timer style="font-size:24px">0:00</div>
      <div class="row" style="gap:8px"><button class="btn grow" data-cancel>Отмена</button><button class="btn btn-primary grow" data-stop>Отправить</button></div>
    </div>`);
  const sheet = openSheet('Запись голосового', body);
  const timer = setInterval(() => {
    body.querySelector('[data-timer]').textContent = durationText((Date.now() - started) / 1000);
  }, 200);

  const finish = (keep) => {
    clearInterval(timer);
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (!keep) return;
      const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
      const reader = new FileReader();
      reader.onload = () => send({ kind: 'voice', media: reader.result, duration: Math.round((Date.now() - started) / 1000) });
      reader.readAsDataURL(blob);
    };
    recorder.stop();
    sheet.close();
  };
  body.querySelector('[data-stop]').onclick = () => finish(true);
  body.querySelector('[data-cancel]').onclick = () => finish(false);
  recorder.start();
}

export async function sendPostToChat(post) {
  const { chats } = await api.chats();
  if (!chats.length) return toast('Сначала заведите чат', 'err');
  const body = el(`<div class="col" style="gap:6px">
    <p class="tiny muted" style="margin:0 0 4px">Кому отправить</p>
    <div class="col" data-list style="gap:6px"></div>
  </div>`);
  const sheet = openSheet('Отправить в чат', body);
  const list = body.querySelector('[data-list]');
  chats.forEach((chat) => {
    const row = el(`<button class="list-item">${avatar(chat.peer || chat, 34)}<span class="grow" style="text-align:left"><span class="small strong">${esc(chat.title || chat.peer?.displayName || 'Чат')}</span></span>${icon('forward', 15)}</button>`);
    row.onclick = async () => {
      try {
        await api.sendPost(chat.id, post.id, '');
        sheet.close();
        toast('Отправлено');
      } catch (error) {
        toast(error.message, 'err');
      }
    };
    list.appendChild(row);
  });
  return sheet;
}

function openChatMenu(chat, view) {
  const body = el(`
    <div class="col" style="gap:6px">
      ${chat.kind !== 'dm' ? `<button class="list-item" data-members>${icon('users', 18)}<span>Участники (${chat.members.length})</span></button>` : ''}
      ${chat.kind !== 'dm' && chat.role === 'owner' ? `<button class="list-item" data-add>${icon('add_user', 18)}<span>Добавить участника</span></button>` : ''}
      ${chat.peer ? `<button class="list-item" data-contact>${icon('add_user', 18)}<span>Добавить в контакты</span></button>` : ''}
      ${chat.peer ? `<button class="list-item" data-report style="color:#c98b8b">${icon('flag', 18)}<span>Пожаловаться</span></button>` : ''}
      <button class="list-item" data-close>${icon('close', 18)}<span>Закрыть чат</span></button>
    </div>`);
  const sheet = openSheet(chat.title, body);
  body.querySelector('[data-members]')?.addEventListener('click', () => {
    sheet.close();
    openMembers(chat);
  });
  body.querySelector('[data-add]')?.addEventListener('click', async () => {
    sheet.close();
    const name = await promptSheet({ title: 'Добавить участника', label: 'Юзернейм', placeholder: '@username' });
    if (!name) return;
    try {
      const { user } = await api.getUser(name.replace(/^@/, ''));
      await api.addMember(chat.id, user.id);
      toast(`${user.displayName} в чате`);
    } catch (error) {
      toast(error.message, 'err');
    }
  });
  body.querySelector('[data-contact]')?.addEventListener('click', async () => {
    sheet.close();
    await api.addContact(chat.peer.id);
    toast('Добавлен в контакты');
  });
  body.querySelector('[data-report]')?.addEventListener('click', async () => {
    sheet.close();
    const { openReport } = await import('./feed.js');
    openReport('user', chat.peer.id);
  });
  body.querySelector('[data-close]').onclick = () => {
    sheet.close();
    view.remove();
    load(listRoot);
  };
}

function openMembers(chat) {
  const body = el(`<div class="col" style="gap:2px">${chat.members
    .map(
      (m) => `<button class="list-item" data-open="${esc(m.username)}">${avatar(m, 40)}<div class="grow"><div class="row" style="gap:6px"><span class="strong small">${esc(m.displayName)}</span>${badges(m)}</div><div class="tiny muted">@${esc(m.username)}${m.role === 'owner' ? ' · владелец' : ''}</div></div></button>`
    )
    .join('')}</div>`);
  const sheet = openSheet('Участники', body);
  body.querySelectorAll('[data-open]').forEach((button) => {
    button.onclick = () => {
      sheet.close();
      openProfile(button.dataset.open);
    };
  });
}


