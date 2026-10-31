import { el, esc, uid, fullDate, plural } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, toast, emptyState, confirmSheet } from '../ui.js';

/**
 * Капсула времени (Time Capsule) — local-only.
 * Запечатайте сообщение (с опциональной картинкой) на 1 месяц, 6 месяцев,
 * 1 год или 5 лет. До срока капсула выглядит как запертый ларец с датой
 * вскрытия. Когда срок выходит — появляется кнопка «Вскрыть».
 *
 * Storage: localStorage.spokum.timeCapsules = [
 *   { id, text, image, sealedAt, openAt, opened }
 * ]
 */

const KEY = 'spokum.timeCapsules';
const MAX = 60;

const TERMS = [
  { id: '1m',  label: '1 месяц',   ms: 30 * 86400000 },
  { id: '6m',  label: '6 месяцев', ms: 182 * 86400000 },
  { id: '1y',  label: '1 год',     ms: 365 * 86400000 },
  { id: '5y',  label: '5 лет',     ms: 1825 * 86400000 }
];

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(raw)) return raw;
  } catch {}
  return [];
}

function save(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {}
}

function daysLeft(openAt) {
  const left = openAt - Date.now();
  if (left <= 0) return null;
  return Math.ceil(left / 86400000);
}

function formatDateStamp(ts) {
  return new Date(ts).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Маленький ларец-карточка. Запертый — тёмный, с замком и датой вскрытия.
// Открытый — светлый, с печатью и текстом.
function capsuleCard(capsule, refresh) {
  const unlocked = capsule.openAt <= Date.now();
  const revealed = !!capsule.opened;
  const left = daysLeft(capsule.openAt);

  const node = el(`<div class="card tc-box ${unlocked ? 'tc-unlocked' : 'tc-sealed'}" data-id="${esc(capsule.id)}" style="
      padding:0;overflow:hidden;border:1px solid ${unlocked ? 'var(--accent)' : 'var(--line-strong)'};
      background:${unlocked ? 'linear-gradient(160deg, var(--bg-2), var(--surface))' : 'var(--surface)'};
    ">
    <div class="tc-stamp" style="
      display:flex;align-items:center;justify-content:space-between;gap:8px;
      padding:10px 12px;border-bottom:1px dashed ${unlocked ? 'var(--accent)' : 'var(--line-strong)'};
      background:${unlocked ? 'rgba(127,179,160,.08)' : 'rgba(255,255,255,.02)'};
    ">
      <span class="row" style="gap:7px;align-items:center;color:${unlocked ? 'var(--accent)' : 'var(--muted)'}">
        ${icon(unlocked ? 'mail' : 'lock', 16)}
        <span class="tiny strong" style="letter-spacing:.4px">
          ${unlocked ? 'ГОТОВА К ВСКРЫТИЮ' : 'ОПЕЧАТАНО'}
        </span>
      </span>
      <span class="tiny muted" style="font-variant-numeric:tabular-nums">${formatDateStamp(capsule.sealedAt)}</span>
    </div>
    <div style="padding:12px">
      ${!unlocked
        ? `<div class="row between" style="gap:8px;align-items:center">
            <span class="small" style="color:var(--text)">Откроется через</span>
            <span class="strong" style="color:var(--accent);font-size:18px">${left} ${plural(left, 'день', 'дня', 'дней')}</span>
          </div>
          <div class="tiny muted" style="margin-top:6px;line-height:1.5">
            Дата вскрытия: ${esc(fullDate(capsule.openAt).split(',')[0])}
          </div>`
        : revealed
          ? `<div class="small" style="white-space:pre-wrap;word-break:break-word;line-height:1.6;margin-bottom:8px">${esc(capsule.text)}</div>
             ${capsule.image ? `<img src="${esc(capsule.image)}" alt="" style="width:100%;border-radius:8px;margin-bottom:8px;display:block" onerror="this.style.display='none'">` : ''}
             <div class="tiny muted" style="line-height:1.5">Запечатано ${esc(fullDate(capsule.sealedAt).split(',')[0])}</div>`
          : `<div class="small muted" style="line-height:1.6">Срок прошёл. Вскройте капсулу, чтобы прочитать послание из прошлого.</div>
             <div class="tiny muted" style="margin-top:6px">Вскрыть можно с ${esc(fullDate(capsule.openAt).split(',')[0])}</div>`
      }
      <div class="row" style="gap:6px;margin-top:10px;flex-wrap:wrap">
        ${unlocked && !revealed ? `<button class="btn btn-sm btn-primary" data-open>${icon('mail', 14)} Вскрыть</button>` : ''}
        ${unlocked && revealed ? `<button class="btn btn-sm" data-hide>${icon('lock', 14)} Запечатать обратно</button>` : ''}
        <button class="btn btn-sm btn-ghost" data-drop style="color:#c98b8b;margin-left:auto">${icon('trash', 14)}</button>
      </div>
    </div>
  </div>`);

  if (unlocked && !revealed) {
    node.querySelector('[data-open]').onclick = () => {
      const list = load();
      const idx = list.findIndex((c) => c.id === capsule.id);
      if (idx >= 0) {
        list[idx].opened = true;
        save(list);
      }
      toast('Капсула вскрыта');
      refresh();
    };
  }
  if (unlocked && revealed) {
    node.querySelector('[data-hide]').onclick = () => {
      const list = load();
      const idx = list.findIndex((c) => c.id === capsule.id);
      if (idx >= 0) {
        list[idx].opened = false;
        save(list);
      }
      refresh();
    };
  }
  node.querySelector('[data-drop]').onclick = async () => {
    const ok = await confirmSheet({
      title: 'Уничтожить капсулу?',
      text: unlocked && revealed ? 'Послание пропадёт навсегда.' : 'Запечатанную капсулу уже не вскрыть.',
      confirm: 'Уничтожить',
      danger: true
    });
    if (!ok) return;
    save(load().filter((c) => c.id !== capsule.id));
    toast('Капсула уничтожена');
    refresh();
  };
  return node;
}

function openCreateForm(done) {
  const body = el(`<div class="col" style="gap:10px">
    <p class="tiny muted" style="margin:0;line-height:1.55">
      Напишите послание себе будущому. Можно прикрепить картинку по ссылке.
      Капсула запечатается до выбранной даты — открыть её раньше нельзя.
    </p>
    <textarea class="textarea" data-text rows="6" maxlength="6000"
      placeholder="Дорогой будущий я..." style="min-height:140px"></textarea>
    <label class="col" style="gap:6px">
      <span class="tiny muted">${icon('image', 13)} Ссылка на картинку (необязательно)</span>
      <input class="input" data-image type="url" placeholder="https://..." autocomplete="off">
    </label>
    <label class="col" style="gap:6px">
      <span class="tiny muted">${icon('hourglass', 13)} Когда вскрыть</span>
      <select class="select" data-term style="width:100%">
        ${TERMS.map((t) => `<option value="${t.id}">${t.label}</option>`).join('')}
      </select>
    </label>
    <button class="btn btn-primary" data-seal>${icon('lock', 17)} Запечатать</button>
  </div>`);
  const sheet = openSheet('Создать капсулу', body);
  body.querySelector('[data-seal]').onclick = () => {
    const text = body.querySelector('[data-text]').value.trim();
    if (!text) return toast('Сначала напишите послание', 'err');
    const termId = body.querySelector('[data-term]').value;
    const term = TERMS.find((t) => t.id === termId) || TERMS[0];
    const imageRaw = body.querySelector('[data-image]').value.trim();
    const now = Date.now();
    const list = load();
    list.unshift({
      id: uid(),
      text,
      image: imageRaw || null,
      sealedAt: now,
      openAt: now + term.ms,
      opened: false
    });
    save(list);
    sheet.close();
    toast('Капсула запечатана');
    done();
  };
  return sheet;
}

export function openTimeCapsule() {
  const body = el('<div class="col" style="gap:10px"></div>');
  const sheet = openSheet('Капсула времени', body);

  const refresh = () => {
    const list = load().sort((a, b) => b.sealedAt - a.sealedAt);
    const unlockedCount = list.filter((c) => c.openAt <= Date.now() && !c.opened).length;

    body.innerHTML = `
      <button class="btn btn-primary" data-create style="width:100%">
        ${icon('plus', 17)} Создать капсулу
      </button>
      ${unlockedCount > 0 ? `<div class="card" style="padding:10px 12px;border-color:var(--accent);background:rgba(127,179,160,.08)">
        <div class="row" style="gap:8px;align-items:center;color:var(--accent)">
          ${icon('mail', 16)}
          <span class="small strong">${unlockedCount} ${plural(unlockedCount, 'капсула', 'капсулы', 'капсул')} готова к вскрытию</span>
        </div>
      </div>` : ''}
      <div class="row between" style="margin:2px">
        <span class="strong small">${icon('hourglass', 15)} Запечатанные капсулы</span>
        <span class="tiny muted">${list.length}</span>
      </div>
      <div data-list class="col" style="gap:8px"></div>`;

    const listNode = body.querySelector('[data-list]');
    if (!list.length) {
      listNode.innerHTML = emptyState('hourglass', 'Капсул пока нет', 'Запечатайте первое послание себе будущему');
    } else {
      list.forEach((capsule) => listNode.appendChild(capsuleCard(capsule, refresh)));
    }

    body.querySelector('[data-create]').onclick = () => openCreateForm(refresh);
  };

  refresh();
  return sheet;
}
