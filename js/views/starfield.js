import { state, isPremium } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { openSheet } from '../ui.js';

const KEY = 'spokum.starfield';

export function starfieldConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      const density = Math.max(10, Math.min(120, Number(raw.density) || 50));
      return { enabled: !!raw.enabled, density };
    }
  } catch {}
  return { enabled: false, density: 50 };
}

function save(cfg) {
  localStorage.setItem(KEY, JSON.stringify(cfg));
}

export function isStarfieldOn() {
  return starfieldConfig().enabled && isPremium(state.user);
}

let activeField = null;

export function stopStarfield() {
  if (activeField) activeField.stop();
}

export function mountStarfield(container) {
  if (activeField) { activeField.stop(); activeField = null; }
  if (!container) return null;
  const cfg = starfieldConfig();
  if (!cfg.enabled || !isPremium(state.user)) return null;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1;opacity:.85';
  const prevPos = getComputedStyle(container).position;
  if (prevPos !== 'absolute' && prevPos !== 'relative' && prevPos !== 'fixed') {
    container.style.position = 'relative';
  }
  container.style.zIndex = '0';
  container.insertBefore(canvas, container.firstChild);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    const r = container.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  const stars = Array.from({ length: cfg.density }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 1.3 + 0.3,
    phase: Math.random() * Math.PI * 2,
    speed: 0.5 + Math.random() * 1.6,
    drift: (Math.random() - 0.5) * 0.4
  }));
  let raf = 0;
  const t0 = performance.now();
  const draw = (now) => {
    if (!canvas.isConnected) { activeField = null; return; }
    const r = container.getBoundingClientRect();
    const w = r.width, h = r.height;
    if (w < 2 || h < 2) { raf = requestAnimationFrame(draw); return; }
    const t = (now - t0) / 1000;
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      s.x += s.drift * 0.0008;
      if (s.x > 1) s.x -= 1;
      if (s.x < 0) s.x += 1;
      const a = 0.35 + 0.65 * Math.abs(Math.sin(s.phase + t * s.speed));
      ctx.fillStyle = `rgba(220,230,255,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  const onResize = () => resize();
  window.addEventListener('resize', onResize);
  activeField = {
    stop() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      if (canvas.isConnected) canvas.remove();
      activeField = null;
    }
  };
  return activeField;
}

export async function openStarfield(done) {
  if (!isPremium(state.user)) return showPremiumOnly('Звёздное небо');
  const cfg = starfieldConfig();
  const body = el(`<div class="col" style="gap:12px">
    <div class="card" style="padding:14px">
      <div class="row" style="gap:10px;align-items:center">
        <span style="color:#9ec3ff">${icon('star', 20)}</span>
        <div class="grow">
          <div class="strong small">Звёздное небо</div>
          <div class="tiny muted">Анимированный фон из мерцающих звёзд</div>
        </div>
        <label class="switch">
          <input type="checkbox" data-enabled ${cfg.enabled ? 'checked' : ''}>
          <span class="switch-slider"></span>
        </label>
      </div>
    </div>
    <div class="card" style="padding:14px">
      <div class="row between">
        <div class="small">Плотность звёзд</div>
        <div class="small strong" data-density-label>${cfg.density}</div>
      </div>
      <input type="range" class="range" min="10" max="120" value="${cfg.density}" data-density style="width:100%">
      <div class="tiny muted" style="margin-top:4px">Больше звёзд — гуще небо</div>
    </div>
    <p class="tiny muted" style="line-height:1.5;margin:0">Включится в вашем профиле сразу после закрытия.</p>
  </div>`);
  const sheet = openSheet('Звёздное небо', body);
  const en = body.querySelector('[data-enabled]');
  const dens = body.querySelector('[data-density]');
  const densLabel = body.querySelector('[data-density-label]');
  dens.addEventListener('input', () => { densLabel.textContent = dens.value; });
  dens.addEventListener('change', () => {
    save({ enabled: en.checked, density: Number(dens.value) || 50 });
    done?.();
  });
  en.addEventListener('change', () => {
    save({ enabled: en.checked, density: Number(dens.value) || 50 });
    done?.();
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
      const { openBilling } = await import('./settings.js?v=20261123');
      openBilling();
    } catch {}
  };
  return sheet;
}
