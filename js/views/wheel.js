import { api, state, setUser } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, avatar, emptyState } from '../ui.js';

const SEGMENTS = [
  { type: 'coins', amount: 10, label: '10', color: '#1e2a1e' },
  { type: 'coins', amount: 50, label: '50', color: '#1a1a2e' },
  { type: 'coins', amount: 20, label: '20', color: '#1e2a1e' },
  { type: 'premium', amount: 3, label: 'Премиум', color: '#2e1a1a' },
  { type: 'coins', amount: 100, label: '100', color: '#2e2a1a' },
  { type: 'coins', amount: 20, label: '20', color: '#1a1a2e' },
  { type: 'coins', amount: 50, label: '50', color: '#1e2a1e' },
  { type: 'coins', amount: 10, label: '10', color: '#2e2a1a' },
];

export async function openWheel() {
  const host = el('<div class="col" style="gap:20px;padding:20px;align-items:center"></div>');
  const sheet = openSheet('Колесо фортуны', host, {});
  host.innerHTML = `<div class="card"><p class="muted center">Проверка...</p></div>`;
  try {
    const { can } = await api.canSpinToday();
    const size = 280;
    const cx = size / 2, cy = size / 2, r = size / 2 - 8;
    const seg = 360 / SEGMENTS.length;
    const colors = ['#1e2a1e', '#1a1a2e', '#2a2a3a', '#2e1a1a', '#2e2a1a', '#1a1a2e', '#1e2a1e', '#2e2a1a'];
    let paths = '';
    SEGMENTS.forEach((s, i) => {
      const a1 = (i * seg - 90) * Math.PI / 180;
      const a2 = ((i + 1) * seg - 90) * Math.PI / 180;
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
      const ta = (i * seg + seg / 2 - 90) * Math.PI / 180;
      const tx = cx + r * 0.65 * Math.cos(ta), ty = cy + r * 0.65 * Math.sin(ta);
      paths += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2} Z" fill="${s.color}" stroke="rgba(255,255,255,.08)" stroke-width="1.5"/>`;
      const fontSize = s.type === 'premium' ? 7 : 11;
      paths += `<text x="${tx}" y="${ty}" fill="rgba(255,255,255,.8)" font-size="${fontSize}" font-weight="600" text-anchor="middle" dominant-baseline="middle">${s.label}</text>`;
    });

    host.innerHTML = `
      <div style="position:relative;width:${size}px;height:${size + 24}px">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" id="wheel" style="transition:transform 4s cubic-bezier(.17,.67,.34,1);filter:drop-shadow(0 8px 24px rgba(0,0,0,.3))">
          ${paths}
          <circle cx="${cx}" cy="${cy}" r="16" fill="var(--bg-1)" stroke="var(--accent)" stroke-width="2"/>
          <circle cx="${cx}" cy="${cy}" r="6" fill="var(--accent)"/>
        </svg>
        <div style="position:absolute;top:-2px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-top:20px solid var(--accent);filter:drop-shadow(0 2px 4px rgba(0,0,0,.3))"></div>
      </div>
      <div data-result style="min-height:28px;text-align:center"></div>
      <button class="btn btn-primary" data-spin ${can ? '' : 'disabled'} style="width:100%;max-width:240px;font-size:15px;padding:14px">${can ? 'Крутить колесо' : 'Уже крутили сегодня'}</button>
      <p class="tiny muted center" style="line-height:1.5;margin:0">Бесплатный приз каждый день.<br>Монеты или премиум-подписка.</p>
    `;

    host.querySelector('[data-spin]')?.addEventListener('click', async () => {
      const btn = host.querySelector('[data-spin]');
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = 'Крутим...';
      const wheel = host.querySelector('#wheel');
      const result = await api.spinWheel();
      const matches = SEGMENTS.map((s, i) => ({ s, i })).filter(m => m.s.type === result.type && m.s.amount === result.amount);
      const segIdx = matches[Math.floor(Math.random() * matches.length)].i;
      const segCenter = segIdx * seg + seg / 2;
      const targetAngle = 360 * 6 + (360 - segCenter);
      wheel.style.transform = `rotate(${targetAngle}deg)`;
      const resDiv = host.querySelector('[data-result]');
      resDiv.innerHTML = '<div class="tiny muted">...</div>';
      setTimeout(async () => {
        if (result.type === 'premium') {
          resDiv.innerHTML = `<div class="strong" style="font-size:18px;color:var(--accent)">+${result.amount} дней премиума</div>`;
        } else {
          resDiv.innerHTML = `<div class="strong" style="font-size:18px;color:var(--accent)">+${result.amount} монет</div>`;
        }
        btn.textContent = 'Уже крутили сегодня';
        try { const { user } = await api.me(); if (user) setUser(user); } catch {}
      }, 4100);
    });
  } catch (e) { host.innerHTML = emptyState('warn', 'Ошибка', e.message); }
  return sheet;
}
