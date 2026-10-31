import { state } from '../store.js';
import { el, esc, uid } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, toast } from '../ui.js';

// Случайный собеседник — анонимный чат 1-на-1 между двумя вкладками.
// Упрощённая реализация: сопоставление происходит через localStorage,
// поэтому работает между вкладками одного браузера.
//
// Ключи в localStorage:
//   spokum.randomChat.waiting  — [{ id, since }] вкладки, ищущие собеседника
//   spokum.randomChat.chats    — [{ id, a, b, messages, createdAt, closedAt }]
// sessionStorage:
//   spokum.randomChat.self     — стабильный id этой вкладки (UUID)

const WAITING_KEY = 'spokum.randomChat.waiting';
const CHATS_KEY = 'spokum.randomChat.chats';
const SELF_KEY = 'spokum.randomChat.self';
const POLL_MS = 900;

function getSelf() {
  let id = sessionStorage.getItem(SELF_KEY);
  if (!id) {
    id = uid();
    sessionStorage.setItem(SELF_KEY, id);
  }
  return id;
}

function readWaiting() {
  try {
    const raw = localStorage.getItem(WAITING_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function writeWaiting(list) {
  try { localStorage.setItem(WAITING_KEY, JSON.stringify(list)); } catch {}
}

function readChats() {
  try {
    const raw = localStorage.getItem(CHATS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function writeChats(list) {
  try { localStorage.setItem(CHATS_KEY, JSON.stringify(list)); } catch {}
}

// Найти активный чат, в котором участвует эта вкладка.
function activeChat(selfId) {
  return readChats().find((c) => !c.closedAt && (c.a === selfId || c.b === selfId));
}

function findPartner(selfId) {
  // Сопоставление с другим ожидающим.
  const waiting = readWaiting();
  const partner = waiting.find((w) => w.id !== selfId);
  if (!partner) return null;
  // Удаляем обоих из очереди.
  writeWaiting(waiting.filter((w) => w.id !== selfId && w.id !== partner.id));
  // Создаём чат.
  const chat = {
    id: uid(),
    a: selfId,
    b: partner.id,
    messages: [],
    createdAt: Date.now(),
    closedAt: null
  };
  const chats = readChats();
  chats.push(chat);
  writeChats(chats);
  return chat;
}

function leaveChat(chat) {
  const chats = readChats();
  const idx = chats.findIndex((c) => c.id === chat.id);
  if (idx >= 0) {
    chats[idx].closedAt = Date.now();
    writeChats(chats);
  }
}

function sendMessage(chat, selfId, text) {
  const chats = readChats();
  const idx = chats.findIndex((c) => c.id === chat.id);
  if (idx < 0) return;
  chats[idx].messages = chats[idx].messages || [];
  chats[idx].messages.push({ from: selfId, text, at: Date.now() });
  // Чистим старые закрытые чаты (> 1 часа), чтобы не копить мусор.
  const cutoff = Date.now() - 60 * 60 * 1000;
  const cleaned = chats.filter((c) => !c.closedAt || c.closedAt > cutoff);
  writeChats(cleaned);
}

export function openRandomChat() {
  const selfId = getSelf();
  const myName = state.user?.username || state.user?.displayName || 'Гость';
  let mode = 'idle'; // 'idle' | 'searching' | 'chat'
  let currentChat = null;
  let pollTimer = null;
  let lastMessagesCount = 0;
  const body = el('<div class="col" style="gap:10px"></div>');
  const sheet = openSheet('Случайный собеседник', body, {
    onClose: () => {
      if (pollTimer) clearInterval(pollTimer);
      // При закрытии шторки выходим из поиска и из чата.
      const waiting = readWaiting().filter((w) => w.id !== selfId);
      writeWaiting(waiting);
      if (currentChat) leaveChat(currentChat);
    }
  });

  const render = () => {
    if (mode === 'idle') renderIdle();
    else if (mode === 'searching') renderSearching();
    else if (mode === 'chat') renderChat();
  };

  const renderIdle = () => {
    body.innerHTML = `
      <div class="card" style="padding:14px;line-height:1.5">
        <div class="row" style="gap:8px;align-items:flex-start">
          <span style="color:var(--accent)">${icon('chats', 20)}</span>
          <div class="grow">
            <div class="strong small">Анонимный чат</div>
            <div class="tiny muted">Вас соединят со случайным собеседником. Без имён, без аватаров — просто «Собеседник». Это работает между вкладками одного браузера.</div>
          </div>
        </div>
      </div>
      <button class="btn btn-primary" data-search>${icon('search', 16)} Искать собеседника</button>`;
    body.querySelector('[data-search]').onclick = startSearch;
  };

  const renderSearching = () => {
    body.innerHTML = `
      <div class="card" style="padding:24px;text-align:center">
        <div class="spinner" style="margin:0 auto 12px;width:38px;height:38px;border-radius:50%;border:3px solid var(--line);border-top-color:var(--accent);animation:spokum-spin 1s linear infinite"></div>
        <div class="strong small">Ищем собеседника...</div>
        <div class="tiny muted" style="margin-top:4px">Подождите немного. Когда кто-то ещё откроет эту вкладку, мы вас соединим.</div>
      </div>
      <button class="btn" data-cancel>${icon('close', 16)} Отмена</button>`;
    body.querySelector('[data-cancel]').onclick = () => {
      const waiting = readWaiting().filter((w) => w.id !== selfId);
      writeWaiting(waiting);
      mode = 'idle';
      stopPoll();
      render();
    };
  };

  const renderChat = () => {
    if (!currentChat) { mode = 'idle'; renderIdle(); return; }
    const msgs = currentChat.messages || [];
    body.innerHTML = `
      <div class="card" style="padding:10px 12px">
        <div class="row between" style="align-items:center">
          <div class="row" style="gap:8px;align-items:center">
            <span style="color:var(--accent)">${icon('chats', 18)}</span>
            <div>
              <div class="strong small">Собеседник</div>
              <div class="tiny muted" data-status>Аноним · общаетесь</div>
            </div>
          </div>
          <span class="tiny muted">${msgs.length} ${ruPlural(msgs.length, 'сообщение', 'сообщения', 'сообщений')}</span>
        </div>
      </div>
      <div class="card" data-msgs style="padding:10px;max-height:46vh;overflow-y:auto;display:flex;flex-direction:column;gap:6px"></div>
      <div class="row" style="gap:8px">
        <input class="input grow" data-text placeholder="Сообщение..." maxlength="600">
        <button class="btn btn-primary" data-send>${icon('send', 16)}</button>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn grow" data-next>${icon('forward2', 16)} Следующий</button>
        <button class="btn grow" data-end>${icon('close', 16)} Завершить</button>
      </div>`;

    const msgsHost = body.querySelector('[data-msgs]');
    if (!msgs.length) {
      msgsHost.innerHTML = `<div class="tiny muted center" style="padding:18px">Скажите привет — собеседник пока не знает о вас ничего</div>`;
    } else {
      msgsHost.innerHTML = msgs.map((m) => {
        const mine = m.from === selfId;
        return `<div class="row" style="justify-content:${mine ? 'flex-end' : 'flex-start'}">
          <div class="small" style="max-width:78%;padding:8px 11px;border-radius:14px;background:${mine ? 'var(--accent)' : 'var(--surface-2, var(--surface))'};color:${mine ? '#0e1320' : 'var(--ink)'};word-break:break-word;line-height:1.4">${esc(m.text)}</div>
        </div>`;
      }).join('');
      // Прокрутка вниз.
      msgsHost.scrollTop = msgsHost.scrollHeight;
    }

    // Если собеседник вышел — показываем плашку и блокируем ввод.
    if (currentChat.closedAt) {
      body.querySelector('[data-status]').textContent = 'Собеседник вышел';
      body.querySelector('[data-text]').disabled = true;
      body.querySelector('[data-send]').disabled = true;
    }

    const textInput = body.querySelector('[data-text]');
    const send = () => {
      const text = textInput.value.trim();
      if (!text) return;
      if (currentChat?.closedAt) return toast('Собеседник уже вышел', 'err');
      sendMessage(currentChat, selfId, text);
      textInput.value = '';
      refreshChat();
    };
    body.querySelector('[data-send]').onclick = send;
    textInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); send(); }
    });

    body.querySelector('[data-next]').onclick = () => {
      if (currentChat) leaveChat(currentChat);
      currentChat = null;
      startSearch();
    };
    body.querySelector('[data-end]').onclick = () => {
      if (currentChat) leaveChat(currentChat);
      currentChat = null;
      mode = 'idle';
      stopPoll();
      render();
      toast('Чат завершён');
    };
  };

  const refreshChat = () => {
    if (mode !== 'chat') return;
    const chat = activeChat(selfId);
    if (!chat) {
      // Чат был закрыт другой стороной или сам — выходим в idle.
      currentChat = null;
      mode = 'idle';
      stopPoll();
      render();
      return;
    }
    const prevCount = lastMessagesCount;
    currentChat = chat;
    const newCount = (chat.messages || []).length;
    if (newCount !== prevCount || chat.closedAt) {
      lastMessagesCount = newCount;
      renderChat();
    }
  };

  const startSearch = () => {
    mode = 'searching';
    // Добавляем себя в очередь ожидания (если ещё не там).
    const waiting = readWaiting();
    if (!waiting.find((w) => w.id === selfId)) {
      waiting.push({ id: selfId, name: myName, since: Date.now() });
      writeWaiting(waiting);
    }
    render();
    startPoll();
  };

  const startPoll = () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (mode === 'searching') {
        // Пробуем найти партнёра.
        const chat = findPartner(selfId);
        if (chat) {
          currentChat = chat;
          lastMessagesCount = 0;
          mode = 'chat';
          render();
        } else {
          // Может, уже есть чат, созданный другой стороной.
          const existing = activeChat(selfId);
          if (existing) {
            currentChat = existing;
            lastMessagesCount = (existing.messages || []).length;
            mode = 'chat';
            // Убираем себя из очереди.
            writeWaiting(readWaiting().filter((w) => w.id !== selfId));
            render();
          }
        }
      } else if (mode === 'chat') {
        refreshChat();
      }
    }, POLL_MS);
  };

  const stopPoll = () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  };

  // Слушаем storage-события от других вкладок, чтобы быстрее реагировать.
  const onStorage = (event) => {
    if (event.key === CHATS_KEY) {
      if (mode === 'searching') {
        const existing = activeChat(selfId);
        if (existing) {
          currentChat = existing;
          lastMessagesCount = (existing.messages || []).length;
          mode = 'chat';
          writeWaiting(readWaiting().filter((w) => w.id !== selfId));
          render();
        }
      } else if (mode === 'chat') {
        refreshChat();
      }
    }
  };
  window.addEventListener('storage', onStorage);

  // Подчищаем слушатель при закрытии шторки.
  const origClose = sheet.close;
  sheet.close = () => {
    window.removeEventListener('storage', onStorage);
    stopPoll();
    if (currentChat) leaveChat(currentChat);
    writeWaiting(readWaiting().filter((w) => w.id !== selfId));
    origClose();
  };

  // На старте: если уже есть активный чат — продолжаем его.
  const existing = activeChat(selfId);
  if (existing) {
    currentChat = existing;
    lastMessagesCount = (existing.messages || []).length;
    mode = 'chat';
    render();
    startPoll();
  } else {
    render();
  }
  return sheet;
}

function ruPlural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
