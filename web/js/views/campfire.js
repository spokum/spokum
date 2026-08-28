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

export async function openCampfire() {
  stopCampfire();
  const view = el(`
    <div class="chat-view camp-view">
      <div class="chat-head">
        <button class="btn btn-icon btn-ghost" data-back>${icon('back', 20)}</button>
        <div class="grow">
          <div class="strong small">Костёр</div>
          <div class="tiny muted" data-sub>ищем место…</div>
        </div>
        <span class="camp-fire">${icon('flame', 20)}</span>
      </div>
      <div class="chat-body camp-body" data-list></div>
      <form class="composer" data-form>
        <input class="input grow" data-text placeholder="Скажите что-нибудь" maxlength="600" autocomplete="off">
        <button class="btn btn-icon btn-primary" type="submit">${icon('send', 18)}</button>
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
    room = null;
    lastId = 0;
    view.remove();
  };
  view.querySelector('[data-back]').onclick = leave;

  const draw = (rows) => {
    rows.forEach((row) => {
      lastId = Math.max(lastId, row.id);
      const line = el(`<div class="camp-line ${row.mine ? 'mine' : ''}">
        <span class="camp-alias">${esc(row.alias)}</span>
        <span class="camp-body-text">${esc(row.body)}</span>
      </div>`);
      list.appendChild(line);
    });
    if (rows.length) list.scrollTop = list.scrollHeight;
  };

  const tick = async () => {
    if (!room) return;
    try {
      const data = await api.campfireRead(room, lastId);
      alias = data.alias || alias;
      closesAt = typeof data.closesAt === 'string' ? Date.parse(data.closesAt) : data.closesAt;
      sub.textContent = `вы ${alias} · у костра ${data.people} · погаснет через ${clock(closesAt)}`;
      draw(data.messages || []);
    } catch (error) {
      sub.textContent = error.message;
      stopCampfire();
    }
  };

  try {
    const seat = await api.campfireJoin();
    room = seat.room;
    alias = seat.alias;
    list.innerHTML = `<div class="camp-hint">
      ${icon('flame', 26)}
      <div class="strong small" style="margin-top:8px">Вы сели у костра как «${esc(alias)}»</div>
      <p class="tiny muted" style="margin:6px 0 0;line-height:1.5">Здесь никто не знает, кто вы. Всё написанное исчезнет через час и нигде не сохранится. Настоящее имя не показывается никому, кроме модератора, если на вас пожалуются.</p>
    </div>`;
    await tick();
    timer = setInterval(tick, 3000);
  } catch (error) {
    list.innerHTML = emptyState('flame', 'Костёр не разжёгся', error.message);
    view.querySelector('[data-form]').remove();
    return view;
  }

  view.querySelector('[data-form]').onsubmit = async (event) => {
    event.preventDefault();
    const body = input.value.trim();
    if (!body || !room) return;
    input.value = '';
    try {
      await api.campfireSay(room, body);
      await tick();
    } catch (error) {
      toast(error.message, 'err');
    }
  };

  return view;
}
