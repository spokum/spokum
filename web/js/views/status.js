import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, toast } from '../ui.js';

/**
 * Custom Status Messages.
 * Short status text (max 60 chars) shown near the user's name.
 *
 * Storage: localStorage.spokum.status = "..."
 * We also try to persist via api.updateMe({ status }) so that if the backend
 * ever adds support for it, it will just work. Current backends (local.js /
 * remote-db.js) silently ignore unknown fields, so this is a no-op there and
 * the status lives only in localStorage.
 */

const KEY = 'spokum.status';
const MAX = 60;

const PRESETS = [
  'Спокоен',
  'Занят',
  'Грущу',
  'Радуюсь',
  'Устал',
  'В раздумьях',
  'На прогулке',
  'Читаю книгу'
];

export function getStatus() {
  try {
    const v = localStorage.getItem(KEY);
    if (!v) return '';
    return String(v).slice(0, MAX);
  } catch {
    return '';
  }
}

export function setStatus(text) {
  const t = String(text || '').slice(0, MAX);
  try { localStorage.setItem(KEY, t); } catch {}
  // Best-effort server-side persistence (no-op on current backends).
  try {
    import('../store.js?v=20251018').then(({ api }) => {
      if (api && typeof api.updateMe === 'function') {
        api.updateMe({ status: t }).catch(() => {});
      }
    }).catch(() => {});
  } catch {}
  return t;
}

export function openStatusEditor(done) {
  let current = getStatus();
  const body = el('<div class="col" style="gap:12px"></div>');
  const sheet = openSheet('Ваш статус', body);

  const paint = () => {
    body.innerHTML = `
      <div>
        <input class="input" data-status maxlength="${MAX}" placeholder="Как вы сейчас?" value="${esc(current)}">
        <div class="tiny muted" data-counter style="margin-top:6px;text-align:right">${current.length}/${MAX}</div>
      </div>
      <div>
        <div class="tiny muted" style="margin-bottom:8px">Быстрый выбор</div>
        <div class="chips wrap" style="gap:6px">
          ${PRESETS.map((p) => `<button class="chip" type="button" data-preset="${esc(p)}" aria-pressed="${p === current ? 'true' : 'false'}">${esc(p)}</button>`).join('')}
        </div>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn grow" data-clear ${current ? '' : 'disabled'}>${icon('trash', 15)} Очистить</button>
        <button class="btn btn-primary grow" data-save>${icon('check', 16)} Сохранить</button>
      </div>`;

    const input = body.querySelector('[data-status]');
    const counter = body.querySelector('[data-counter]');
    input.oninput = () => {
      current = input.value.slice(0, MAX);
      counter.textContent = `${current.length}/${MAX}`;
    };

    body.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.onclick = () => {
        current = btn.dataset.preset;
        input.value = current;
        counter.textContent = `${current.length}/${MAX}`;
        body.querySelectorAll('[data-preset]').forEach((b) => {
          b.setAttribute('aria-pressed', String(b === btn));
        });
      };
    });

    body.querySelector('[data-clear]').onclick = () => {
      if (!current) return;
      current = '';
      setStatus('');
      toast('Статус очищен');
      done?.();
      sheet.close();
    };

    body.querySelector('[data-save]').onclick = () => {
      setStatus(input.value.trim());
      toast('Статус обновлён');
      done?.();
      sheet.close();
    };
  };

  paint();
  return sheet;
}
