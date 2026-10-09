import { api, state } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, avatar, emptyState } from '../ui.js';

const COLORS = ['#1a1d22','#e8e8e8','#c95a3a','#e8c46a','#87b7a3','#7fa8e8','#d8a8e8','#a8e8c8','#e8a8a8','#a8d4e8','#e8d8a8','#b8a8e8','#5a8ae8','#e87a5a','#5ae8a8','#e8e85a'];

export async function openPixelBattle() {
  const host = el('<div class="col" style="gap:10px;padding:10px"></div>');
  const sheet = openSheet('Пиксель-батл', host, {});
  host.innerHTML = `<div class="card"><p class="muted center">Загрузка...</p></div>`;

  let battle = null;
  let cells = {};
  let selectedColor = COLORS[0];
  let canvas = null;
  let ctx = null;
  let channel = null;
  let pressTimer = null;

  const draw = () => {
    if (!ctx || !battle) return;
    const cs = canvas.width / battle.width;
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const key in cells) {
      const [x, y] = key.split(',').map(Number);
      ctx.fillStyle = cells[key];
      ctx.fillRect(x * cs, y * cs, cs, cs);
    }
  };

  const loadCells = async () => {
    if (!battle) return;
    try {
      const sb = await getSupabaseClient();
      if (!sb) return;
      const { data } = await sb.from('pixel_cells').select('x,y,color').eq('battle_id', battle.id);
      if (data) {
        cells = {};
        data.forEach((c) => cells[`${c.x},${c.y}`] = c.color);
        draw();
      }
    } catch {}
  };

  const showPixelInfo = async (gx, gy) => {
    if (!battle) return;
    try {
      const info = await api.getPixelInfo(battle.id, gx, gy);
      if (info.empty) { toast('Пусто', 'err'); return; }
      const body = el(`<div class="col" style="gap:10px;align-items:center;padding:12px">
        <div style="width:48px;height:48px;border-radius:8px;background:${info.color};border:1px solid var(--line)"></div>
        ${info.avatar ? `<div style="display:flex;gap:8px;align-items:center">
          <img src="${info.avatar}" style="width:32px;height:32px;border-radius:50%">
          <div><div class="strong small">${esc(info.displayName || info.username)}</div><div class="tiny muted">@${esc(info.username)}</div></div>
        </div>` : `<div class="strong small">Аноним</div>`}
        <div class="tiny muted">${new Date(info.placedAt).toLocaleString('ru-RU')}</div>
      </div>`);
      openSheet('Пиксель', body);
    } catch (e) { toast(e.message, 'err'); }
  };

  const placePixel = async (gx, gy) => {
    if (!battle || !state.user) return;
    try {
      const result = await api.placePixel(battle.id, gx, gy, selectedColor);
      cells[`${gx},${gy}`] = selectedColor;
      draw();
      if (result.cooldown) {
        toast(`Поставлено! Кулдаун ${result.cooldown}с`, 'ok');
      } else if (result.remaining !== undefined) {
        toast(`Поставлено! Осталось ${result.remaining} пикселей`, 'ok');
      }
    } catch (e) { toast(e.message, 'err'); }
  };

  battle = await api.activePixelBattle();
  if (!battle.active) {
    host.innerHTML = emptyState('star', 'Нет активного батла', 'Админ может запустить в админ-панели');
    return;
  }

  host.innerHTML = `
    <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:center" data-palette></div>
    <div data-status class="tiny muted center" style="line-height:1.5"></div>
    <canvas data-canvas style="width:100%;max-width:340px;aspect-ratio:${battle.width / battle.height};border-radius:10px;background:#0a0e14;touch-action:none;margin:0 auto;display:block;cursor:crosshair"></canvas>
    <div data-info class="tiny muted center">Тап - поставить пиксель. Долгий тап - кто нарисовал.</div>
  `;

  const palette = host.querySelector('[data-palette]');
  canvas = host.querySelector('[data-canvas]');
  ctx = canvas.getContext('2d');
  const statusEl = host.querySelector('[data-status]');

  COLORS.forEach((c, i) => {
    const btn = el(`<button data-color="${c}" style="width:28px;height:28px;border-radius:6px;background:${c};border:${i===0?'2px solid var(--accent)':'1px solid var(--line)'};cursor:pointer"></button>`);
    btn.onclick = () => {
      selectedColor = c;
      palette.querySelectorAll('[data-color]').forEach((b) => b.style.border = '1px solid var(--line)');
      btn.style.border = '2px solid var(--accent)';
    };
    palette.appendChild(btn);
  });

  const updateCanvas = () => {
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width;
    canvas.height = r.height;
    draw();
  };
  updateCanvas();

  const getXY = (e) => {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor(((e.touches?.[0]?.clientX ?? e.clientX) - r.left) / r.width * battle.width);
    const y = Math.floor(((e.touches?.[0]?.clientY ?? e.clientY) - r.top) / r.height * battle.height);
    return { x: Math.max(0, Math.min(battle.width - 1, x)), y: Math.max(0, Math.min(battle.height - 1, y)) };
  };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const { x, y } = getXY(e);
    placePixel(x, y);
    pressTimer = setTimeout(() => showPixelInfo(x, y), 500);
  });
  canvas.addEventListener('pointerup', () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });
  canvas.addEventListener('pointermove', () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });

  const endsAt = new Date(battle.endsAt);
  const daysLeft = Math.max(0, Math.ceil((endsAt - Date.now()) / 86400000));
  statusEl.textContent = `Осталось ${daysLeft} дн. · Поставлено: ${battle.pixelsPlaced}/${battle.maxPixels}`;

  if (battle.cooldownUntil && new Date(battle.cooldownUntil) > new Date()) {
    const secs = Math.ceil((new Date(battle.cooldownUntil) - new Date()) / 1000);
    statusEl.textContent += ` · Кулдаун ${secs}с`;
  }

  await loadCells();

  try {
    const sb = await getSupabaseClient();
    if (sb) {
      channel = sb.channel('pixel-battle').on('postgres_changes', { event: '*', schema: 'public', table: 'pixel_cells', filter: `battle_id=eq.${battle.id}` }, (payload) => {
        const d = payload.new;
        if (d) { cells[`${d.x},${d.y}`] = d.color; draw(); }
      }).subscribe();
    }
  } catch {}

  const origClose = sheet.close;
  sheet.close = () => { if (channel) try { channel.unsubscribe(); } catch {} origClose(); };

  window.addEventListener('resize', updateCanvas);
  return sheet;
}

async function getSupabaseClient() {
  if (window.__spokumSb) return window.__spokumSb;
  try {
    const url = window.SPOKUM_SUPABASE_URL;
    const key = window.SPOKUM_SUPABASE_KEY;
    if (!url || !key) return null;
    if (window.supabase?.createClient) {
      window.__spokumSb = window.supabase.createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    } else {
      const mod = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
      window.__spokumSb = mod.createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    }
    const token = localStorage.getItem('spokum.session.keep');
    if (token) {
      const session = JSON.parse(token);
      if (session?.access_token) {
        await window.__spokumSb.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
      }
    }
    return window.__spokumSb;
  } catch { return null; }
}
