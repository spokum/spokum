import { api, state } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, emptyState } from '../ui.js';

const GRID = 32;
const COLORS = ['#87b7a3','#e8c46a','#c95a3a','#7fa8e8','#d8a8e8','#a8e8c8','#e8a8a8','#a8d4e8','#e8d8a8','#b8a8e8'];

export async function openGarden() {
  const host = el(`
    <div class="col" style="gap:12px;padding:12px">
      <p class="tiny muted center" style="line-height:1.5">Общий сад. Сажайте растения на общей сетке. Видно всем, обновляется в реальном времени.</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center" data-palette></div>
      <canvas data-canvas style="width:100%;max-width:320px;aspect-ratio:1;border-radius:12px;background:#0a0e14;touch-action:none;margin:0 auto;display:block"></canvas>
      <div data-info class="tiny muted center"></div>
    </div>
  `);
  const sheet = openSheet('Общий сад', host, {});

  const palette = host.querySelector('[data-palette]');
  const canvas = host.querySelector('[data-canvas]');
  const info = host.querySelector('[data-info]');
  let selectedColor = COLORS[0];
  let cells = {};
  let channel = null;

  COLORS.forEach((c, i) => {
    const btn = el(`<button data-color="${c}" style="width:32px;height:32px;border-radius:8px;background:${c};border:${i===0?'2px solid var(--accent)':'2px solid transparent'};cursor:pointer"></button>`);
    btn.onclick = () => {
      selectedColor = c;
      palette.querySelectorAll('[data-color]').forEach((b) => b.style.border = '2px solid transparent');
      btn.style.border = '2px solid var(--accent)';
    };
    palette.appendChild(btn);
  });

  const ctx = canvas.getContext('2d');
  const draw = () => {
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width;
    canvas.height = r.height;
    const cs = canvas.width / GRID;
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,.03)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath(); ctx.moveTo(i*cs, 0); ctx.lineTo(i*cs, canvas.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i*cs); ctx.lineTo(canvas.width, i*cs); ctx.stroke();
    }
    for (const key in cells) {
      const [x, y] = key.split(',').map(Number);
      ctx.fillStyle = cells[key];
      ctx.fillRect(x*cs+1, y*cs+1, cs-1, cs-1);
    }
  };

  const placeCell = async (gx, gy) => {
    try {
      const sb = window.__spokum?.sb;
      if (!sb) return;
      await sb.from('garden_cells').upsert({ x: gx, y: gy, color: selectedColor, user_id: state.user?.id });
      cells[`${gx},${gy}`] = selectedColor;
      draw();
      const count = Object.keys(cells).length;
      info.textContent = `Посажено: ${count} растений`;
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const x = Math.floor(((e.touches?.[0]?.clientX ?? e.clientX) - r.left) / r.width * GRID);
    const y = Math.floor(((e.touches?.[0]?.clientY ?? e.clientY) - r.top) / r.height * GRID);
    if (x >= 0 && x < GRID && y >= 0 && y < GRID) placeCell(x, y);
  });

  try {
    const sb = window.__spokum?.sb;
    if (sb) {
      const { data } = await sb.from('garden_cells').select('x,y,color');
      if (data) data.forEach((c) => cells[`${c.x},${c.y}`] = c.color);
      channel = sb.channel('garden').on('postgres_changes', { event: '*', schema: 'public', table: 'garden_cells' }, (payload) => {
        const d = payload.new || payload.old;
        if (d) {
          if (payload.eventType === 'DELETE') delete cells[`${d.x},${d.y}`];
          else cells[`${d.x},${d.y}`] = d.color;
          draw();
        }
      }).subscribe();
    }
  } catch {}

  draw();
  const count = Object.keys(cells).length;
  info.textContent = count ? `Посажено: ${count} растений` : 'Сад пуст. Посадите первое!';

  const origClose = sheet.close;
  sheet.close = () => { if (channel) try { channel.unsubscribe(); } catch {} origClose(); };
  return sheet;
}
