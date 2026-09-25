import { api, state } from '../store.js';
import { el, esc, timeAgo } from '../util.js';
import { icon } from '../icons.js';
import { avatar, toast, emptyState, openSheet, confirmSheet } from '../ui.js';

const BETA_USER = 'silver';

export function isGratitudeOpen() {
  return state.user?.username === BETA_USER;
}

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
  if (!isGratitudeOpen()) {
    toast('Раздел скоро откроется для всех', 'err');
    return;
  }
  const host = el('<div class="col"></div>');
  const sheet = openSheet('Стена благодарности', host, {});
  await mount(host);
  return sheet;
}

export async function render(root) {
  if (!isGratitudeOpen()) {
    root.innerHTML = `<div class="card"><p class="muted center">Раздел скоро откроется для всех</p></div>`;
    return;
  }
  await mount(root);
}

