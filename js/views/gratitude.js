import { api, state } from '../store.js';
import { el, esc, timeAgo } from '../util.js';
import { icon } from '../icons.js';
import { avatar, toast, emptyState, openSheet, confirmSheet } from '../ui.js';

async function mount(host) {
  host.innerHTML = `
    <div class="card" style="margin:8px 0">
      <textarea class="input" data-body rows="3" maxlength="500" placeholder="Сегодня я благодарен за..." style="width:100%;resize:vertical"></textarea>
      <div class="row between" style="margin-top:8px;align-items:center">
        <label class="row" style="gap:8px;cursor:pointer;font-size:13px">
          <input type="checkbox" data-anon> Анонимно
        </label>
        <button class="btn btn-primary" data-send>${icon('heart', 16)} Поделиться</button>
      </div>
    </div>
    <div data-list></div>
  `;

  const list = host.querySelector('[data-list]');
  const body = host.querySelector('[data-body]');
  const anon = host.querySelector('[data-anon]');
  const send = host.querySelector('[data-send]');

  async function load() {
    try {
      list.innerHTML = `<div class="card"><p class="muted center">Загрузка...</p></div>`;
      const { entries } = await api.gratitudeList(30, 0);
      if (!entries.length) {
        list.innerHTML = emptyState('heart', 'Пока пусто', 'Будьте первым, кто поделится благодарностью');
        return;
      }
      list.innerHTML = entries.map((row) => {
        const author = row.author;
        const head = author
          ? `<button class="row" style="gap:8px;align-items:center;background:none;width:100%" data-user="${esc(author.username)}">
               ${avatar(author, 32)}
               <div class="grow" style="text-align:left">
                 <div class="strong small">${esc(author.display_name || author.username)}</div>
                 <div class="tiny muted">@${esc(author.username)} · ${timeAgo(new Date(row.createdAt))}</div>
               </div>
             </button>`
          : `<div class="row" style="gap:8px;align-items:center">
               <div class="avatar" style="width:32px;height:32px;border-radius:50%;background:var(--bg-2);display:flex;align-items:center;justify-content:center">${icon('user', 16)}</div>
               <div class="grow">
                 <div class="strong small">Анонимно</div>
                 <div class="tiny muted">${timeAgo(new Date(row.createdAt))}</div>
               </div>
             </div>`;
        return `<article class="card" style="margin:6px 0">
          ${head}
          <p style="margin:8px 0 0;white-space:pre-wrap;word-break:break-word">${esc(row.body)}</p>
        </article>`;
      }).join('');
      list.querySelectorAll('[data-user]').forEach((btn) => {
        btn.onclick = () => {
          const event = new CustomEvent('spokum:openUser', { detail: btn.dataset.user });
          window.dispatchEvent(event);
        };
      });
    } catch (error) {
      list.innerHTML = emptyState('warn', 'Не загрузилось', error.message);
    }
  }

  send.onclick = async () => {
    const text = body.value.trim();
    if (!text) {
      toast('Напишите хотя бы пару слов', 'err');
      return;
    }
    if (!state.user) {
      toast('Нужен вход', 'err');
      return;
    }
    send.disabled = true;
    send.textContent = 'Отправка...';
    try {
      await api.gratitudeAdd(text, anon.checked);
      body.value = '';
      anon.checked = false;
      toast('Спасибо, что поделились', 'ok');
      await load();
    } catch (error) {
      toast(error.message || 'Не получилось', 'err');
    } finally {
      send.disabled = false;
      send.innerHTML = `${icon('heart', 16)} Поделиться`;
    }
  };

  await load();
}

export async function openGratitude() {
  const host = el('<div class="col"></div>');
  const sheet = openSheet('Стена благодарности', host, {});
  await mount(host);
  return sheet;
}

export async function render(root) {
  await mount(root);
}

// ============================================================
// Дневник благодарности (личный, без сервера).
// Записи за день хранятся в localStorage под ключом
// spokum.gratitude.<YYYY-MM-DD>. С публичной "Стеной благодарности"
// наверху файла дневник не связан — это приватная практика.
// ============================================================

const JOURNAL_PREFIX = 'spokum.gratitude.';

function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseKey(key) {
  const m = /^spokum\.gratitude\.(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(date.getTime()) ? null : date;
}

function readEntry(date = new Date()) {
  try {
    const raw = JSON.parse(localStorage.getItem(JOURNAL_PREFIX + dateKey(date)) || 'null');
    if (!raw || !Array.isArray(raw.items)) return null;
    return { date: dateKey(date), items: raw.items.filter((x) => typeof x === 'string').slice(0, 3), at: Number(raw.at) || 0 };
  } catch {
    return null;
  }
}

function writeEntry(items, date = new Date()) {
  const clean = items.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 3);
  if (!clean.length) {
    localStorage.removeItem(JOURNAL_PREFIX + dateKey(date));
    return null;
  }
  const payload = { items: clean, at: Date.now() };
  localStorage.setItem(JOURNAL_PREFIX + dateKey(date), JSON.stringify(payload));
  return payload;
}

function allEntries() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(JOURNAL_PREFIX)) continue;
    const date = parseKey(key);
    if (!date) continue;
    try {
      const raw = JSON.parse(localStorage.getItem(key) || 'null');
      if (raw && Array.isArray(raw.items)) {
        out.push({ date, key: dateKey(date), items: raw.items, at: Number(raw.at) || 0 });
      }
    } catch {}
  }
  out.sort((a, b) => b.date - a.date);
  return out;
}

export function getGratitudeStats() {
  const entries = allEntries();
  const total = entries.length;
  const lastEntry = entries.length ? entries[0].key : null;
  return { total, streak: getGratitudeStreak(), lastEntry };
}

export function getGratitudeStreak() {
  // Считаем подряд идущие дни с записями, заканчивая сегодня.
  // Если сегодня записи нет — серия 0, даже если вчера писали.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (!readEntry(today)) return 0;
  let streak = 1;
  const cursor = new Date(today);
  while (true) {
    cursor.setDate(cursor.getDate() - 1);
    if (readEntry(cursor)) streak += 1;
    else break;
  }
  return streak;
}

function prettyDate(date) {
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function weekday(date) {
  return date.toLocaleDateString('ru-RU', { weekday: 'short' });
}

export function openGratitudeJournal() {
  const today = new Date();
  const todayKey = dateKey(today);

  const view = el(`
    <div class="col" style="gap:14px">
      <p class="tiny muted" style="margin:0;line-height:1.55">Дневник благодарности — личная практика. Записи хранятся только на этом устройстве и видны только вам.</p>

      <div class="card" style="padding:16px">
        <div class="row between" style="margin-bottom:10px">
          <div class="strong small">${icon('heart', 16)} Сегодня</div>
          <div class="tiny muted">${esc(prettyDate(today))}</div>
        </div>
        <div class="col" style="gap:8px">
          <div class="gratitude-input-row">
            <span class="gratitude-num">1</span>
            <textarea class="input" data-item="0" rows="2" maxlength="240" placeholder="Я благодарен за..." style="resize:vertical;flex:1"></textarea>
          </div>
          <div class="gratitude-input-row">
            <span class="gratitude-num">2</span>
            <textarea class="input" data-item="1" rows="2" maxlength="240" placeholder="Ещё за..." style="resize:vertical;flex:1"></textarea>
          </div>
          <div class="gratitude-input-row">
            <span class="gratitude-num">3</span>
            <textarea class="input" data-item="2" rows="2" maxlength="240" placeholder="И ещё за..." style="resize:vertical;flex:1"></textarea>
          </div>
        </div>
        <div class="row between" style="margin-top:12px;align-items:center">
          <span class="tiny muted" data-saved-hint></span>
          <button class="btn btn-primary btn-sm" data-save>${icon('check', 15)} Сохранить</button>
        </div>
      </div>

      <div class="card" style="padding:14px">
        <div class="row between">
          <div class="strong small">${icon('chart', 16)} Статистика</div>
        </div>
        <div class="stat-grid" style="margin-top:10px">
          <div class="stat"><div class="v" data-stat-total>0</div><div class="k">записей</div></div>
          <div class="stat"><div class="v" data-stat-streak>0</div><div class="k">дней подряд</div></div>
        </div>
      </div>

      <div>
        <div class="row between" style="margin:8px 2px">
          <div class="strong small">${icon('book', 16)} История</div>
          <span class="tiny muted" data-history-count>0</span>
        </div>
        <div class="col" data-history style="gap:8px"></div>
      </div>
    </div>
  `);

  const sheet = openSheet('Дневник благодарности', view, {});

  const inputs = view.querySelectorAll('[data-item]');
  const saveBtn = view.querySelector('[data-save]');
  const savedHint = view.querySelector('[data-saved-hint]');
  const historyEl = view.querySelector('[data-history]');
  const historyCount = view.querySelector('[data-history-count]');
  const statTotal = view.querySelector('[data-stat-total]');
  const statStreak = view.querySelector('[data-stat-streak]');

  function fillToday() {
    const e = readEntry(today);
    inputs.forEach((ta, i) => {
      ta.value = e?.items?.[i] || '';
    });
    if (e) savedHint.textContent = 'Запись сохранена';
  }

  function paintStats() {
    const stats = getGratitudeStats();
    statTotal.textContent = String(stats.total);
    statStreak.textContent = String(stats.streak);
  }

  function paintHistory() {
    const entries = allEntries().slice(0, 30);
    historyCount.textContent = String(entries.length);
    if (!entries.length) {
      historyEl.innerHTML = emptyState('heart', 'Напишите, за что вы благодарны сегодня', 'Здесь появятся прошлые записи');
      return;
    }
    historyEl.innerHTML = entries.map((row) => `
      <article class="card gratitude-history-card" data-key="${esc(row.key)}">
        <div class="row between" style="align-items:flex-start">
          <div>
            <div class="small strong">${esc(prettyDate(row.date))}</div>
            <div class="tiny muted">${esc(weekday(row.date))}${row.at ? ' · ' + new Date(row.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
          </div>
          <button class="btn btn-icon btn-ghost" data-del="${esc(row.key)}" aria-label="Удалить">${icon('trash', 16)}</button>
        </div>
        <ol class="gratitude-list" style="margin:8px 0 0;padding-left:18px">
          ${row.items.map((t) => `<li>${esc(t)}</li>`).join('')}
        </ol>
      </article>
    `).join('');
    historyEl.querySelectorAll('[data-del]').forEach((btn) => {
      btn.onclick = async () => {
        if (!(await confirmSheet({ title: 'Удалить запись?', text: 'Это действие нельзя отменить.', confirm: 'Удалить', danger: true }))) return;
        localStorage.removeItem(JOURNAL_PREFIX + btn.dataset.del);
        if (btn.dataset.del === todayKey) {
          fillToday();
          savedHint.textContent = '';
        }
        paintStats();
        paintHistory();
        toast('Запись удалена');
      };
    });
  }

  saveBtn.onclick = () => {
    const items = Array.from(inputs).map((ta) => ta.value);
    const written = writeEntry(items, today);
    if (!written) {
      toast('Напишите хотя бы одно предложение', 'err');
      return;
    }
    savedHint.textContent = 'Сохранено в ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    paintStats();
    paintHistory();
    toast('Спасибо, что заметили хорошее', 'ok');
  };

  fillToday();
  paintStats();
  paintHistory();
  return sheet;
}

// Стили дневника благодарности. Подключаем один раз.
if (typeof document !== 'undefined' && !document.getElementById('gratitude-journal-styles')) {
  const style = document.createElement('style');
  style.id = 'gratitude-journal-styles';
  style.textContent = `
  .gratitude-input-row{display:flex;gap:10px;align-items:flex-start}
  .gratitude-num{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--accent-soft);color:var(--accent);font-weight:600;font-size:12px;margin-top:6px;flex-shrink:0}
  .gratitude-history-card{padding:13px 14px}
  .gratitude-list{color:var(--text);line-height:1.5;font-size:14px}
  .gratitude-list li{margin:2px 0}
  `;
  document.head.appendChild(style);
}

