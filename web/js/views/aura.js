import { state, isPremium } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, toast } from '../ui.js';

const KEY = 'spokum.auraColor';

export const AURA_PRESETS = [
  { id: 'gold',    label: 'Золото',   color: '#e6b94a' },
  { id: 'rose',    label: 'Роза',     color: '#e88aa6' },
  { id: 'ice',     label: 'Лёд',      color: '#8ec8e8' },
  { id: 'fire',    label: 'Огонь',   color: '#ff7a3a' },
  { id: 'nature',  label: 'Природа', color: '#7ed09a' },
  { id: 'ocean',   label: 'Океан',    color: '#5aa0d0' },
  { id: 'purple',  label: 'Аметист',  color: '#a98aff' },
  { id: 'sunset',  label: 'Закат',    color: '#ff8a6a' }
];

function presetById(id) {
  return AURA_PRESETS.find((p) => p.id === id) || null;
}

export function auraColor() {
  if (!isPremium(state.user)) return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  const preset = presetById(raw);
  if (preset) return preset.color;
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
  return null;
}

export function auraId() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  const preset = presetById(raw);
  return preset ? preset.id : null;
}

export function clearAura() {
  localStorage.removeItem(KEY);
}

function setAura(id) {
  localStorage.setItem(KEY, id);
}

function previewHtml(color) {
  const glow = color
    ? `<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:120px;height:120px;border-radius:50%;background:radial-gradient(circle,${color}88 0%,${color}00 70%);pointer-events:none"></div>`
    : '';
  return `<div style="position:relative;width:88px;height:88px">
    ${glow}
    <div style="position:absolute;inset:0;border-radius:50%;background:linear-gradient(150deg,hsl(220 26% 46%),hsl(260 24% 34%));display:grid;place-items:center;color:#fff;font-weight:700;font-size:24px;z-index:1">Я</div>
  </div>`;
}

export async function openAuraPicker(done) {
  if (!isPremium(state.user)) return showPremiumOnly('Цвет ауры');
  const currentId = auraId();
  const body = el(`<div class="col" style="gap:12px">
    <div class="card" style="padding:18px;text-align:center">
      <div class="tiny muted" style="margin-bottom:10px">Предпросмотр</div>
      <div data-preview style="display:flex;justify-content:center">${previewHtml(auraColor())}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px" data-grid>
      ${AURA_PRESETS.map((p) => `<button class="card list-item" data-aura="${esc(p.id)}" style="padding:10px;gap:10px;align-items:center;${currentId === p.id ? 'border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)' : ''}">
        <span style="width:24px;height:24px;border-radius:50%;background:radial-gradient(circle,${p.color} 0%,${p.color}00 70%);box-shadow:0 0 12px ${p.color}99"></span>
        <div class="grow"><div class="small strong">${esc(p.label)}</div></div>
        ${currentId === p.id ? `<span style="color:var(--accent)">${icon('check', 16)}</span>` : ''}
      </button>`).join('')}
    </div>
    ${currentId ? `<button class="btn" data-clear>${icon('trash', 15)} Убрать ауру</button>` : ''}
    <p class="tiny muted" style="line-height:1.5;margin:0">Мягкое свечение появится вокруг вашего аватара в профиле.</p>
  </div>`);
  const sheet = openSheet('Цвет ауры', body);
  const preview = body.querySelector('[data-preview]');
  body.querySelectorAll('[data-aura]').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.aura;
      const preset = presetById(id);
      if (!preset) return;
      setAura(id);
      preview.innerHTML = previewHtml(preset.color);
      toast('Цвет ауры обновлён');
      done?.();
      sheet.close();
    };
  });
  body.querySelector('[data-clear]')?.addEventListener('click', () => {
    clearAura();
    preview.innerHTML = previewHtml(null);
    toast('Аура убрана');
    done?.();
    sheet.close();
  });
  return sheet;
}

async function showPremiumOnly(title) {
  const body = el(`<div class="col" style="gap:12px">
    <div class="card" style="padding:16px;text-align:center">
      <div style="color:#d8b45c;margin-bottom:8px">${icon('crown', 32)}</div>
      <div class="strong">Только для премиума</div>
      <div class="tiny muted" style="margin-top:4px;line-height:1.5">«${esc(title)}» доступно только обладателям СпокУм Премиум.</div>
    </div>
    <button class="btn btn-primary" data-billing>${icon('crown', 16)} Оформить премиум</button>
  </div>`);
  const sheet = openSheet(title, body);
  body.querySelector('[data-billing]').onclick = async () => {
    sheet.close();
    try {
      const { openBilling } = await import('./settings.js?v=20261122');
      openBilling();
    } catch {}
  };
  return sheet;
}
