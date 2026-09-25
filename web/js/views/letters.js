import { api, state } from '../store.js';
import { el, esc, timeAgo } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, toast, emptyState } from '../ui.js';

async function drawMine(host) {
  host.innerHTML = '<div class="card" style="height:90px;opacity:.3"></div>';
  let letters = [];
  try {
    const result = await api.myLetters();
    letters = result.letters || [];
  } catch (error) {
    host.innerHTML = emptyState('warn', 'Не загрузилось', error.message);
    return;
  }
  if (!letters.length) {
    host.innerHTML = emptyState('mail', 'Вы ещё не писали', 'Напишите письмо — его получит случайный человек');
    return;
  }
  host.innerHTML = '';
  letters.forEach((letter) => {
    const card = el(`<div class="card" style="padding:14px">
      <div class="row between" style="gap:8px">
        <span class="tiny muted">${esc(timeAgo(letter.createdAt))}</span>
        <span class="pill ${letter.reply ? 'good' : letter.takenAt ? '' : 'warn'}">${
          letter.reply ? 'есть ответ' : letter.takenAt ? 'кто-то читает' : 'летит'
        }</span>
      </div>
      <p class="small" style="margin:9px 0 0;line-height:1.55;white-space:pre-wrap">${esc(letter.body)}</p>
      ${letter.reply ? `<div class="letter-reply"><span class="tiny muted">Ответ незнакомца</span><p class="small" style="margin:5px 0 0;line-height:1.55;white-space:pre-wrap">${esc(letter.reply)}</p></div>` : ''}
    </div>`);
    host.appendChild(card);
  });
}

function openWrite(done) {
  const body = el(`<div class="col" style="gap:10px">
    <p class="tiny muted" style="margin:0;line-height:1.5">Письмо получит случайный человек из сети. Он не увидит ни имени, ни профиля и сможет ответить ровно один раз. Переписка не откроется.</p>
    <textarea class="textarea" data-text rows="7" maxlength="2000" placeholder="О чём хотите рассказать?"></textarea>
    <button class="btn btn-primary" data-send>${icon('send', 17)} Отпустить письмо</button>
    <p class="tiny muted" style="margin:0;text-align:center">Не больше трёх писем в сутки</p>
  </div>`);
  const sheet = openSheet('Письмо незнакомцу', body);
  body.querySelector('[data-send]').onclick = async () => {
    const text = body.querySelector('[data-text]').value.trim();
    if (text.length < 10) return toast('Напишите хотя бы пару строк', 'err');
    try {
      await api.letterSend(text);
      sheet.close();
      toast('Письмо улетело');
      done();
    } catch (error) {
      toast(error.message, 'err');
    }
  };
}

async function openRead() {
  let letter;
  try {
    letter = await api.letterTake();
  } catch (error) {
    return toast(error.message, 'err');
  }
  if (letter?.empty) {
    return toast('Свободных писем сейчас нет, загляните позже');
  }
  const body = el(`<div class="col" style="gap:12px">
    <div class="card letter-paper">
      <p class="small" style="margin:0;line-height:1.6;white-space:pre-wrap">${esc(letter.body)}</p>
    </div>
    <p class="tiny muted" style="margin:0;line-height:1.5">Вы можете ответить один раз. Автор получит ваш ответ и всё — переписки не будет. Можно просто закрыть, если нечего сказать.</p>
    <textarea class="textarea" data-answer rows="5" maxlength="2000" placeholder="Ваш ответ"></textarea>
    <button class="btn btn-primary" data-send>${icon('send', 17)} Ответить</button>
  </div>`);
  const sheet = openSheet('Письмо от незнакомца', body);
  body.querySelector('[data-send]').onclick = async () => {
    const text = body.querySelector('[data-answer]').value.trim();
    if (!text) return toast('Пустой ответ', 'err');
    try {
      await api.letterReply(letter.id, text);
      sheet.close();
      toast('Ответ отправлен');
    } catch (error) {
      toast(error.message, 'err');
    }
  };
}

export async function openLetters() {
  const view = el(`
    <div class="chat-view">
      <div class="chat-head">
        <button class="btn btn-icon btn-ghost" data-back>${icon('back', 20)}</button>
        <div class="grow"><div class="strong small">Письмо незнакомцу</div><div class="tiny muted">Написать или прочитать чужое</div></div>
        ${icon('mail', 20)}
      </div>
      <div class="chat-body" data-body style="display:block">
        <div class="row" style="gap:8px;margin-bottom:12px">
          <button class="btn btn-primary grow" data-write>${icon('edit', 17)} Написать</button>
          <button class="btn grow" data-read>${icon('mail', 17)} Прочитать чужое</button>
        </div>
        <div class="row between" style="margin:4px 2px 10px"><span class="strong small">Мои письма</span></div>
        <div class="col" data-mine style="gap:8px"></div>
      </div>
    </div>`);
  document.body.appendChild(view);
  view.querySelector('[data-back]').onclick = () => view.remove();
  const mine = view.querySelector('[data-mine]');
  view.querySelector('[data-write]').onclick = () => openWrite(() => drawMine(mine));
  view.querySelector('[data-read]').onclick = () => openRead();
  await drawMine(mine);
  return view;
}
