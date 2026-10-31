import { el, esc, uid, fullDate } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, emptyState, confirmSheet } from '../ui.js';

// Письмо в будущее — пишете себе письмо, «запечатываете» его на срок,
// и оно открывается только когда придёт время. Письма хранятся
// локально в localStorage.spokum.futureLetters.
// Формат записи: { id, text, createdAt, openAt, opened }

const KEY = 'spokum.futureLetters';
const NOTIFIED_KEY = 'spokum.futureLetters.notified';

const OPTIONS = [
  { id: '30d',  label: '30 дней',  ms: 30 * 24 * 60 * 60 * 1000 },
  { id: '90d',  label: '90 дней',  ms: 90 * 24 * 60 * 60 * 1000 },
  { id: '1y',   label: '1 год',    ms: 365 * 24 * 60 * 60 * 1000 }
];

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
}

function formatRemaining(ms) {
  if (ms <= 0) return 'можно открыть';
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days >= 1) return `откроется через ${days} ${pluralRu(days, 'день', 'дня', 'дней')}`;
  if (hours >= 1) return `откроется через ${hours} ч`;
  return 'откроется совсем скоро';
}

function pluralRu(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

// Проверяет, есть ли «доставленные» письма, которые ещё не показывали.
// Возвращает массив id писем, готовых к прочтению.
export function pendingLetters() {
  const now = Date.now();
  return load().filter((l) => !l.opened && l.openAt <= now);
}

// Вызывается из app.js / профиля при загрузке — показывает тост-уведомление
// если есть доставленные, но ещё не показанные письма.
export function notifyFutureLetters() {
  try {
    const ready = pendingLetters();
    if (!ready.length) return;
    let notified = [];
    try { notified = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]'); } catch {}
    const fresh = ready.filter((l) => !notified.includes(l.id));
    if (!fresh.length) return;
    toast('Вам письмо из прошлого');
    try {
      localStorage.setItem(NOTIFIED_KEY, JSON.stringify(fresh.map((l) => l.id).concat(notified)));
    } catch {}
  } catch {}
}

export function openFutureLetter() {
  const body = el('<div class="col" style="gap:10px"></div>');
  const sheet = openSheet('Письмо в будущее', body);

  const draw = () => {
    const letters = load().sort((a, b) => b.createdAt - a.createdAt);
    body.innerHTML = `
      <div class="card" style="padding:12px;line-height:1.5">
        <div class="row" style="gap:8px;align-items:flex-start">
          <span style="color:var(--accent)">${icon('hourglass', 20)}</span>
          <div class="grow">
            <div class="strong small">Напиши письмо себе будущому</div>
            <div class="tiny muted">Запечатай его на 30 дней, 90 дней или на год. Когда срок выйдет, мы напомним открыть его.</div>
          </div>
        </div>
      </div>
      <div class="card" style="padding:12px">
        <div class="strong small" style="margin-bottom:8px">${icon('edit', 16)} Новое письмо</div>
        <textarea class="textarea" data-text placeholder="Дорогой будущий я..." maxlength="6000" style="min-height:180px"></textarea>
        <div class="row between" style="margin-top:10px;align-items:center;flex-wrap:wrap;gap:8px">
          <label class="row" style="gap:6px;align-items:center">
            <span class="tiny muted">Открыть через:</span>
            <select class="input" data-term style="padding:6px 8px">
              ${OPTIONS.map((o) => `<option value="${o.id}">${o.label}</option>`).join('')}
            </select>
          </label>
          <button class="btn btn-primary" data-seal>${icon('lock', 16)} Запечатать</button>
        </div>
      </div>
      <div class="row between" style="margin-top:4px">
        <div class="strong small">${icon('mail', 16)} Запечатанные</div>
        <span class="tiny muted">${letters.length}</span>
      </div>
      <div data-list style="display:flex;flex-direction:column;gap:8px"></div>`;

    const list = body.querySelector('[data-list]');
    if (!letters.length) {
      list.innerHTML = emptyState('mail', 'Пока нет писем', 'Запечатайте первое письмо себе будущему');
    } else {
      const now = Date.now();
      letters.forEach((letter) => {
        const unlocked = letter.openAt <= now;
        const remaining = letter.openAt - now;
        const node = el(`<div class="card" data-letter="${letter.id}" style="padding:12px;${unlocked ? 'border-color:var(--accent);background:rgba(127,179,160,.06)' : ''}">
          <div class="row between" style="align-items:flex-start;gap:8px">
            <div class="grow">
              <div class="row" style="gap:6px;align-items:center">
                <span style="color:${unlocked ? 'var(--accent)' : 'var(--muted)'}">${icon(unlocked ? 'mail' : 'lock', 16)}</span>
                <span class="strong small">${unlocked ? 'Письмо готово' : 'Запечатано'}</span>
              </div>
              <div class="tiny muted" style="margin-top:4px">Написано ${fullDate(letter.createdAt)}</div>
              <div class="tiny muted">${unlocked ? `Открылось ${fullDate(letter.openAt)}` : formatRemaining(remaining)}</div>
            </div>
            <div class="row" style="gap:4px">
              ${unlocked ? `<button class="btn btn-sm btn-primary" data-read>${icon('eye', 14)} Прочитать</button>` : ''}
              <button class="btn btn-sm btn-ghost" data-kill title="Удалить">${icon('trash', 14)}</button>
            </div>
          </div>
        </div>`);
        node.querySelector('[data-read]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          openLetter(letter, () => draw());
        });
        node.querySelector('[data-kill]').onclick = async (event) => {
          event.stopPropagation();
          const ok = await confirmSheet({ title: 'Удалить письмо?', text: 'Восстановить не получится', confirm: 'Удалить', danger: true });
          if (!ok) return;
          save(load().filter((l) => l.id !== letter.id));
          toast('Письмо удалено');
          draw();
        };
        list.appendChild(node);
      });
    }

    body.querySelector('[data-seal]').onclick = () => {
      const text = body.querySelector('[data-text]').value.trim();
      const term = body.querySelector('[data-term]').value;
      if (!text) return toast('Сначала напишите письмо', 'err');
      const opt = OPTIONS.find((o) => o.id === term) || OPTIONS[0];
      const now2 = Date.now();
      const list2 = load();
      list2.push({
        id: uid(),
        text,
        createdAt: now2,
        openAt: now2 + opt.ms,
        opened: false
      });
      save(list2);
      toast('Письмо запечатано');
      draw();
    };
  };

  draw();
  return sheet;
}

function openLetter(letter, done) {
  const body = el(`<div class="col" style="gap:10px">
    <div class="card" style="padding:14px;line-height:1.5">
      <div class="row between" style="align-items:center;margin-bottom:8px">
        <span class="strong small">${icon('mail', 16)} Письмо из прошлого</span>
        <span class="tiny muted">${fullDate(letter.createdAt)}</span>
      </div>
      <div class="small" style="white-space:pre-wrap;word-break:break-word;line-height:1.6">${esc(letter.text)}</div>
    </div>
    <div class="tiny muted" style="line-height:1.5">Срок хранения истёк ${fullDate(letter.openAt)}. Письмо можно перечитать позже — оно останется в списке.</div>
    <button class="btn btn-primary" data-ok>${icon('check', 16)} Хорошо</button>
  </div>`);
  const sheet = openSheet('Письмо из прошлого', body);
  // Пометить как прочитанное.
  const list = load();
  const idx = list.findIndex((l) => l.id === letter.id);
  if (idx >= 0) { list[idx].opened = true; save(list); }
  body.querySelector('[data-ok]').onclick = () => { sheet.close(); done?.(); };
}
