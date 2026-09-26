import { api } from '../store.js';
import { el, esc, fullDate, timeAgo } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, toast, emptyState, confirmSheet } from '../ui.js';

const TERMS = [
  [1, 'Завтра'],
  [7, 'Через неделю'],
  [30, 'Через месяц'],
  [90, 'Через три месяца'],
  [180, 'Через полгода'],
  [365, 'Через год'],
  [1095, 'Через три года']
];

function daysLeft(openAt) {
  const left = openAt - Date.now();
  if (left <= 0) return 'можно читать';
  const days = Math.ceil(left / 86400000);
  if (days === 1) return 'откроется завтра';
  if (days < 31) return `откроется через ${days} дн.`;
  const months = Math.round(days / 30);
  if (months < 12) return `откроется через ${months} мес.`;
  return `откроется ${fullDate(openAt).split(',')[0]}`;
}

function openWrite(done) {
  let days = 30;
  const body = el(`<div class="col" style="gap:10px">
    <p class="tiny muted" style="margin:0;line-height:1.5">Напишите себе будущему. Письмо запечатается и придёт уведомлением в выбранный день. До этого прочитать его нельзя — даже вам.</p>
    <textarea class="textarea" data-text rows="7" maxlength="4000" placeholder="Что хотите сказать себе?"></textarea>
    <div class="chips" data-terms>${TERMS.map(
      ([value, label]) => `<button class="chip" data-day="${value}" aria-pressed="${value === 30}">${label}</button>`
    ).join('')}</div>
    <button class="btn btn-primary" data-send>${icon('hourglass', 17)} Запечатать</button>
  </div>`);
  const sheet = openSheet('Капсула времени', body);
  body.querySelectorAll('[data-day]').forEach((chip) => {
    chip.onclick = () => {
      days = Number(chip.dataset.day);
      body.querySelectorAll('[data-day]').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    };
  });
  body.querySelector('[data-send]').onclick = async () => {
    const text = body.querySelector('[data-text]').value.trim();
    if (!text) return toast('Пустое письмо', 'err');
    try {
      await api.capsuleAdd(text, days);
      sheet.close();
      toast('Капсула запечатана');
      done();
    } catch (error) {
      toast(error.message, 'err');
    }
  };
}

export async function openCapsules() {
  const view = el(`
    <div class="chat-view">
      <div class="chat-head">
        <button class="btn btn-icon btn-ghost" data-back>${icon('back', 20)}</button>
        <div class="grow"><div class="strong small">Капсула времени</div><div class="tiny muted">Письма себе будущему</div></div>
        ${icon('hourglass', 20)}
      </div>
      <div class="chat-body" data-body style="display:block">
        <button class="btn btn-primary" data-write style="width:100%;margin-bottom:12px">${icon('edit', 17)} Написать себе</button>
        <div class="col" data-list style="gap:8px"></div>
      </div>
    </div>`);
  document.body.appendChild(view);
  view.querySelector('[data-back]').onclick = () => view.remove();
  const list = view.querySelector('[data-list]');

  const draw = async () => {
    list.innerHTML = '<div class="card" style="height:80px;opacity:.3"></div>';
    let capsules = [];
    try {
      await api.capsuleCheck();
      const result = await api.capsules();
      capsules = result.capsules || [];
    } catch (error) {
      list.innerHTML = emptyState('warn', 'Не загрузилось', error.message);
      return;
    }
    if (!capsules.length) {
      list.innerHTML = emptyState('hourglass', 'Капсул пока нет', 'Напишите себе — через месяц или через год');
      return;
    }
    list.innerHTML = '';
    capsules.forEach((capsule) => {
      const open = capsule.openAt <= Date.now();
      const card = el(`<div class="card capsule ${open ? 'open' : ''}" style="padding:14px">
        <div class="row between" style="gap:8px">
          <span class="row" style="gap:7px;color:${open ? 'var(--accent)' : 'var(--muted)'}">${icon(open ? 'mail' : 'lock', 16)}<span class="tiny strong">${esc(daysLeft(capsule.openAt))}</span></span>
          <span class="tiny muted">написано ${esc(timeAgo(capsule.createdAt))}</span>
        </div>
        ${open
          ? `<p class="small" style="margin:10px 0 0;line-height:1.6;white-space:pre-wrap">${esc(capsule.body)}</p>`
          : `<p class="small muted" style="margin:10px 0 0">Запечатано. Откроется ${esc(fullDate(capsule.openAt).split(',')[0])}.</p>`}
        <button class="btn btn-sm" data-drop style="margin-top:10px;color:#c98b8b">${icon('trash', 15)} Уничтожить</button>
      </div>`);
      card.querySelector('[data-drop]').onclick = async () => {
        const ok = await confirmSheet({ title: 'Уничтожить капсулу', text: 'Письмо пропадёт навсегда.', confirm: 'Уничтожить', danger: true });
        if (!ok) return;
        await api.capsuleDrop(capsule.id);
        draw();
      };
      list.appendChild(card);
    });
  };

  view.querySelector('[data-write]').onclick = () => openWrite(draw);
  await draw();
  return view;
}
