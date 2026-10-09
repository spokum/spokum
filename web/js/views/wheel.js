import { api, state, setUser } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, avatar, emptyState } from '../ui.js';

const SEGMENTS = [
  { type: 'coins', amount: 10, label: '10 монет', color: '#3a4a3a' },
  { type: 'coins', amount: 20, label: '20 монет', color: '#2a3a4a' },
  { type: 'coins', amount: 50, label: '50 монет', color: '#3a3a5a' },
  { type: 'premium', amount: 3, label: '3 дня премиум', color: '#5a3a3a' },
  { type: 'coins', amount: 100, label: '100 монет', color: '#4a4a2a' },
  { type: 'coins', amount: 20, label: '20 монет', color: '#2a3a4a' },
  { type: 'coins', amount: 50, label: '50 монет', color: '#3a3a5a' },
  { type: 'coins', amount: 10, label: '10 монет', color: '#3a4a3a' },
];

export async function openWheel() {
  const host = el('<div class="col" style="gap:16px;padding:16px;align-items:center"></div>');
  const sheet = openSheet('Колесо фортуны', host, {});
  host.innerHTML = `<div class="card"><p class="muted center">Проверка...</p></div>`;
  try {
    const { can } = await api.canSpinToday();
    const size = 240;
    const cx = size / 2, cy = size / 2, r = size / 2 - 4;
    const seg = 360 / SEGMENTS.length;
    let paths = '';
    SEGMENTS.forEach((s, i) => {
      const a1 = (i * seg - 90) * Math.PI / 180;
      const a2 = ((i + 1) * seg - 90) * Math.PI / 180;
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
      const ta = (i * seg + seg / 2 - 90) * Math.PI / 180;
      const tx = cx + r * 0.6 * Math.cos(ta), ty = cy + r * 0.6 * Math.sin(ta);
      paths += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2} Z" fill="${s.color}" stroke="rgba(255,255,255,.1)" stroke-width="1"/>`;
      paths += `<text x="${tx}" y="${ty}" fill="rgba(255,255,255,.7)" font-size="8" text-anchor="middle" dominant-baseline="middle">${s.amount}</text>`;
    });

    host.innerHTML = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" id="wheel" style="transition:transform 4s cubic-bezier(.17,.67,.34,1)">
        ${paths}
        <circle cx="${cx}" cy="${cy}" r="12" fill="var(--accent)" />
      </svg>
      <div style="position:relative;top:-${size/2+12}px;left:${size/2-8}px;width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:16px solid var(--accent)"></div>
      <div data-result style="min-height:30px;text-align:center;margin-top:-12px"></div>
      <button class="btn btn-primary" data-spin ${can ? '' : 'disabled'} style="width:100%;max-width:200px">${can ? 'Крутить!' : 'Уже крутили сегодня'}</button>
    `;

    host.querySelector('[data-spin]')?.addEventListener('click', async () => {
      const btn = host.querySelector('[data-spin]');
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = 'Крутим...';
      const wheel = host.querySelector('#wheel');
      const result = await api.spinWheel();
      const segIdx = SEGMENTS.findIndex(s => s.type === result.type && s.amount === result.amount);
      const targetAngle = 360 * 5 + (360 - (segIdx * seg + seg / 2));
      wheel.style.transform = `rotate(${targetAngle}deg)`;
      setTimeout(async () => {
        const resDiv = host.querySelector('[data-result]');
        if (result.type === 'premium') {
          resDiv.innerHTML = `<div class="strong" style="color:var(--accent)">${result.amount} дней премиума!</div>`;
        } else {
          resDiv.innerHTML = `<div class="strong" style="color:var(--accent)">+${result.amount} монет!</div>`;
        }
        btn.textContent = 'Уже крутили сегодня';
        try { const { user } = await api.me(); if (user) setUser(user); } catch {}
      }, 4100);
    });
  } catch (e) { host.innerHTML = emptyState('warn', 'Ошибка', e.message); }
  return sheet;
}
