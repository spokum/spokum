import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { openSheet } from '../ui.js';

/**
 * Quiet Hours — local-only do-not-disturb schedule.
 *
 * Storage: localStorage.spokum.quietHours = {
 *   enabled: bool,
 *   start:   "HH:MM",
 *   end:     "HH:MM"
 * }
 *
 * isQuietHour() is exported so other views (notifications) can suppress their UI.
 */

const KEY = 'spokum.quietHours';
const DEFAULT = { enabled: false, start: '22:00', end: '08:00' };

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw === 'object') {
      return {
        enabled: !!raw.enabled,
        start: typeof raw.start === 'string' ? raw.start : DEFAULT.start,
        end:   typeof raw.end   === 'string' ? raw.end   : DEFAULT.end
      };
    }
  } catch {}
  return { ...DEFAULT };
}

function write(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

function parseHM(s) {
  const parts = String(s || '').split(':');
  const h = Math.min(23, Math.max(0, parseInt(parts[0], 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(parts[1], 10) || 0));
  return h * 60 + m;
}

/**
 * Returns true if the current time falls within the scheduled quiet window.
 * Handles the overnight wrap (e.g. 22:00 → 08:00).
 */
export function isQuietHour(now = new Date()) {
  const cfg = read();
  if (!cfg.enabled) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = parseHM(cfg.start);
  const end = parseHM(cfg.end);
  if (start === end) return false;
  if (start < end) return cur >= start && cur < end;
  // overnight wrap: 22:00 → 08:00
  return cur >= start || cur < end;
}

export function openQuietHours() {
  let cfg = read();
  const body = el('<div class="col" style="gap:12px"></div>');
  const sheet = openSheet('Тихие часы', body);

  const paint = () => {
    const now = new Date();
    const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const active = isQuietHour(now);
    const previewBg = active ? 'rgba(135,179,160,.10)' : 'var(--surface)';
    const previewInk = active ? '#87b7a3' : 'var(--muted)';
    const previewIcon = active ? 'moon' : 'sun';

    body.innerHTML = `
      <label class="row between" style="padding:4px 0;align-items:center;gap:12px">
        <span style="min-width:0">
          <span class="small strong">Включить тихие часы</span>
          <span class="tiny muted" style="display:block;margin-top:2px;line-height:1.4">В это время уведомления будут скрыты</span>
        </span>
        <label class="switch"><input type="checkbox" data-on ${cfg.enabled ? 'checked' : ''}><span></span></label>
      </label>

      <div class="row" style="gap:10px">
        <div class="grow">
          <div class="tiny muted" style="margin-bottom:6px">С</div>
          <input class="input" type="time" data-start value="${esc(cfg.start)}">
        </div>
        <div class="grow">
          <div class="tiny muted" style="margin-bottom:6px">До</div>
          <input class="input" type="time" data-end value="${esc(cfg.end)}">
        </div>
      </div>

      <div class="card" style="padding:12px;display:flex;align-items:center;gap:10px;background:${previewBg};border:1px solid var(--line)">
        <span style="color:${previewInk};flex:none">${icon(previewIcon, 22)}</span>
        <span style="min-width:0">
          <span class="small strong" style="display:block">Сейчас ${esc(time)} — тихие часы ${active ? 'АКТИВНЫ' : 'НЕ активны'}</span>
          <span class="tiny muted">${cfg.enabled ? `Окно: ${esc(cfg.start)} – ${esc(cfg.end)}` : 'Тихие часы выключены'}</span>
        </span>
      </div>

      <p class="tiny muted" style="margin:0;line-height:1.5">
        ${icon('bell', 12)} Уведомления будут скрыты в это время. Список уведомлений тоже спрячется.
      </p>`;

    body.querySelector('[data-on]').onchange = (e) => {
      cfg = { ...cfg, enabled: e.target.checked };
      write(cfg);
      paint();
    };
    body.querySelector('[data-start]').onchange = (e) => {
      const v = e.target.value || DEFAULT.start;
      cfg = { ...cfg, start: v };
      write(cfg);
      paint();
    };
    body.querySelector('[data-end]').onchange = (e) => {
      const v = e.target.value || DEFAULT.end;
      cfg = { ...cfg, end: v };
      write(cfg);
      paint();
    };
  };

  paint();
  return sheet;
}
