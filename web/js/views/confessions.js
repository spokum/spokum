import { api, state } from '../store.js';
import { el, esc, timeAgo } from '../util.js';
import { icon } from '../icons.js';
import { toast, emptyState, openSheet, confirmSheet } from '../ui.js';

const BETA_USER = 'silver';

export function isConfessionsOpen() {
  return state.user?.username === BETA_USER;
}

async function mount(host) {
  host.innerHTML = `
    <div class="card" style="margin:8px 0">
      <textarea class="input" data-body rows="3" maxlength="1000" placeholder="Анонимное признание. Никто не узнает, кто автор..." style="width:100%;resize:vertical"></textarea>
      <div class="row between" style="margin-top:8px;align-items:center">
        <select class="input" data-mood style="width:auto;padding:6px 10px;font-size:13px">
          <option value="calm">Спокойствие</option>
          <option value="joy">Радость</option>
          <option value="sad">Грусть</option>
          <option value="anxiety">Тревога</option>
          <option value="anger">Злость</option>
          <option value="tired">Усталость</option>
        </select>
        <button class="btn btn-primary" data-send>${icon('send', 16)} Признаться</button>
      </div>
    </div>
    <div data-list></div>
  `;

  const list = host.querySelector('[data-list]');
  const body = host.querySelector('[data-body]');
  const mood = host.querySelector('[data-mood]');
  const send = host.querySelector('[data-send]');

  async function load() {
    list.innerHTML = `<div class="card"><p class="muted center">Загрузка...</p></div>`;
    try {
      const { confessions } = await api.confessionsList(30, 0);
      if (!confessions.length) {
        list.innerHTML = emptyState('heart', 'Пока пусто', 'Будьте первым, кто признается');
        return;
      }
      list.innerHTML = confessions.map((c) => `
        <article class="card" style="margin:6px 0">
          <div class="row" style="gap:8px;align-items:center;margin-bottom:6px">
            <span class="pill" style="font-size:10px;padding:2px 8px;background:var(--bg-2)">${esc(c.mood)}</span>
            <span class="tiny muted">${timeAgo(new Date(c.createdAt))}</span>
            ${c.canDelete ? `<button class="btn btn-sm" data-del="${c.id}" style="margin-left:auto;padding:2px 8px;color:#c98b8b">${icon('trash', 12)}</button>` : ''}
          </div>
          <p style="white-space:pre-wrap;word-break:break-word;margin:0">${esc(c.body)}</p>
        </article>
      `).join('');
      list.querySelectorAll('[data-del]').forEach((btn) => {
        btn.onclick = async () => {
          if (!await confirmSheet({ title: 'Удалить признание?', confirm: 'Удалить', danger: true })) return;
          try { await api.deleteConfession(Number(btn.dataset.del)); toast('Удалено'); await load(); }
          catch (e) { toast(e.message, 'err'); }
        };
      });
    } catch (e) {
      list.innerHTML = emptyState('warn', 'Не загрузилось', e.message);
    }
  }

  send.onclick = async () => {
    const text = body.value.trim();
    if (!text) { toast('Напишите что-нибудь', 'err'); return; }
    send.disabled = true;
    try {
      await api.addConfession(text, mood.value);
      body.value = '';
      toast('Анонимно опубликовано', 'ok');
      await load();
    } catch (e) { toast(e.message, 'err'); }
    finally { send.disabled = false; }
  };

  await load();
}

export async function openConfessions() {
  if (!isConfessionsOpen()) { toast('Скоро для всех', 'err'); return; }
  const host = el('<div class="col"></div>');
  const sheet = openSheet('Анонимные признания', host, {});
  await mount(host);
  return sheet;
}

export async function render(root) {
  if (!isConfessionsOpen()) {
    root.innerHTML = `<div class="card"><p class="muted center">Скоро для всех</p></div>`;
    return;
  }
  await mount(root);
}
