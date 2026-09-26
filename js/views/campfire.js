import { api, state } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast, emptyState } from '../ui.js';

let timer = null;
let room = null;
let alias = '';
let lastId = 0;

function clock(until) {
  const left = Math.max(0, until - Date.now());
  const min = Math.floor(left / 60000);
  const sec = Math.floor((left % 60000) / 1000);
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export function stopCampfire() {
  if (timer) clearInterval(timer);
  timer = null;
}

function resetRoom() {
  room = null;
  alias = '';
  lastId = 0;
}

export const CAMPFIRE_OFF = true;

export async function openCampfire() {
  if (CAMPFIRE_OFF) {
    toast('Костёр временно закрыт', 'err');
    return null;
  }
  stopCampfire();
  resetRoom();
  const view = el(`
    <div class="chat-view camp-view">
      <div class="chat-head">
        <button class="btn btn-icon btn-ghost" data-back>${icon('back', 20)}</button>
        <div class="grow" style="min-width:0">
          <div class="strong small">Костёр</div>
          <div class="tiny muted truncate" data-sub>ищем место…</div>
        </div>
        <span class="camp-fire">${icon('flame', 20)}</span>
      </div>
      <div class="camp-body" data-list></div>
      <form class="camp-form" data-form>
        <input class="input camp-input" data-text placeholder="Скажите что-нибудь" maxlength="600" autocomplete="off">
        <button class="btn btn-icon btn-primary camp-send" type="submit">${icon('send', 18)}</button>
      </form>
    </div>`);
  document.body.appendChild(view);

  const list = view.querySelector('[data-list]');
  const sub = view.querySelector('[data-sub]');
  const input = view.querySelector('[data-text]');
  let closesAt = Date.now() + 3600000;

  const leave = () => {
    stopCampfire();
    if (room) api.campfireLeave(room).catch(() => {});
    resetRoom();
    view.remove();
  };
  view.querySelector('[data-back]').onclick = leave;

  const seen = new Set();
  const draw = (rows) => {
    let added = 0;
    rows.forEach((row) => {
      if (seen.has(row.id)) return;
      seen.add(row.id);
      lastId = Math.max(lastId, row.id);
      added += 1;
      list.appendChild(el(`<div class="camp-line ${row.mine ? 'mine' : ''}">
        <span class="camp-alias">${esc(row.alias)}</span>
        <span class="camp-body-text">${esc(row.body)}</span>
      </div>`));
    });
    if (added) list.scrollTop = list.scrollHeight;
  };

  let polling = false;
  const tick = async () => {
    if (!room || polling) return;
    polling = true;
    try {
      const data = await api.campfireRead(room, lastId);
      alias = data.alias || alias;
      closesAt = typeof data.closesAt === 'string' ? Date.parse(data.closesAt) : data.closesAt;
      sub.textContent = `вы ${alias} · у костра ${data.people} · погаснет через ${clock(closesAt)}`;
      draw(data.messages || []);
    } catch (error) {
      sub.textContent = error.message;
      stopCampfire();
    } finally {
      polling = false;
    }
  };

  try {
    const seat = await api.campfireJoin();
    room = seat.room;
    alias = seat.alias;
    list.innerHTML = `<div class="camp-hint">
      <span class="camp-hint-icon">${icon('flame', 24)}</span>
      <div class="strong small">Вы сели у костра как «${esc(alias)}»</div>
      <p class="tiny muted">Здесь никто не знает, кто вы. Всё написанное исчезнет через час и нигде не сохранится. Настоящее имя не видит никто, кроме модератора, если на вас пожалуются.</p>
    </div>`;
    await tick();
    timer = setInterval(tick, 3000);
  } catch (error) {
    list.innerHTML = emptyState('flame', 'Костёр не разжёгся', error.message);
    view.querySelector('[data-form]').remove();
    return view;
  }

  let sending = false;
  view.querySelector('[data-form]').onsubmit = async (event) => {
    event.preventDefault();
    if (sending || !room) return;
    const body = input.value.trim();
    if (!body) return;
    sending = true;
    input.value = '';
    input.disabled = true;
    try {
      await api.campfireSay(room, body);
      await tick();
    } catch (error) {
      input.value = body;
      toast(error.message, 'err');
    } finally {
      sending = false;
      input.disabled = false;
      input.focus();
    }
  };

  return view;
}
