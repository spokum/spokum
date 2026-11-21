import { state } from '../store.js';
import { el, esc, uid } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, toast } from '../ui.js';

const KEY = 'spokum.feedback';

function loadAll() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveAll(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-300)));
  } catch {}
}

export function submitFeedback(type, text, screenshot) {
  const list = loadAll();
  const user = state.user;
  const item = {
    id: uid(),
    type: type === 'bug' ? 'bug' : 'idea',
    text: String(text || '').trim().slice(0, 2000),
    screenshot: String(screenshot || '').trim().slice(0, 500) || null,
    userId: user?.id || null,
    username: user?.username || 'guest',
    displayName: user?.displayName || user?.username || 'Гость',
    createdAt: Date.now(),
    status: 'new'
  };
  list.unshift(item);
  saveAll(list);
  return item;
}

export function openFeedback() {
  let type = 'idea';
  const body = el(`
    <div class="col" style="gap:12px">
      <p class="tiny muted" style="margin:0;line-height:1.55">Поделитесь идеей или расскажите про баг. Администрация увидит это в панели «Отзывы».</p>
      <div class="row" style="gap:8px">
        <button class="chip" data-type="idea" aria-pressed="true">${icon('spark', 14)} Идея</button>
        <button class="chip" data-type="bug" aria-pressed="false">${icon('warn', 14)} Баг</button>
      </div>
      <textarea class="textarea" data-text placeholder="Опишите вашу идею или баг" maxlength="2000" style="min-height:120px"></textarea>
      <input class="input" data-shot placeholder="Ссылка на скриншот (необязательно)">
      <button class="btn btn-primary" data-send>${icon('send', 16)}<span>Отправить</span></button>
    </div>`);
  const sheet = openSheet('Идеи и баги', body);

  const setType = (next) => {
    type = next;
    body.querySelectorAll('[data-type]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.type === next));
    });
  };
  body.querySelectorAll('[data-type]').forEach((b) => {
    b.onclick = () => setType(b.dataset.type);
  });

  const send = body.querySelector('[data-send]');
  const text = body.querySelector('[data-text]');
  const shot = body.querySelector('[data-shot]');

  const submit = () => {
    const value = text.value.trim();
    if (!value) {
      toast('Сначала напишите текст', 'err');
      text.focus();
      return;
    }
    submitFeedback(type, value, shot.value);
    sheet.close();
    toast('Спасибо, отправлено');
  };
  send.onclick = submit;
  text.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit();
  });
  setTimeout(() => text.focus(), 80);
  return sheet;
}

export function listFeedback() {
  return loadAll();
}

export function setFeedbackStatus(id, status) {
  const list = loadAll();
  const item = list.find((f) => String(f.id) === String(id));
  if (!item) return;
  item.status = status === 'resolved' ? 'resolved' : 'new';
  saveAll(list);
}

export function removeFeedback(id) {
  const list = loadAll().filter((f) => String(f.id) !== String(id));
  saveAll(list);
}
