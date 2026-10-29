import { api, state } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, emptyState } from '../ui.js';

const COLORS = ['#ffffff','#e8e8e8','#c95a3a','#e8c46a','#87b7a3','#7fa8e8','#d8a8e8','#a8e8c8','#e8a8a8','#a8d4e8','#e8d8a8','#b8a8e8','#5a8ae8','#e87a5a','#5ae8a8','#e8e85a','#1a1d22','#3a3a3a','#888888','#c8c8c8'];

export async function openPixelBattle() {
  const overlay = el('<div style="position:fixed;inset:0;z-index:1000;background:#fff;display:flex;flex-direction:column"></div>');
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  const host = overlay;
  const close = () => { overlay.remove(); document.body.style.overflow = ''; };

  let battle = null;
  let cells = {};
  let selectedColor = COLORS[0];
  let canvas, ctx;
  let channel = null;
  let pressTimer = null;
  let zoom = 1;
  let panX = 0, panY = 0;
  let isPanning = false;
  let panStartX = 0, panStartY = 0;

  const draw = () => {
    if (!ctx || !battle) return;
    const cs = (canvas.width / battle.width) * zoom;
    const offsetX = panX;
    const offsetY = panY;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= battle.width; i++) {
      const x = offsetX + i * cs;
      if (x >= 0 && x <= canvas.width) { ctx.beginPath(); ctx.moveTo(x, offsetY); ctx.lineTo(x, offsetY + battle.height * cs); ctx.stroke(); }
    }
    for (let i = 0; i <= battle.height; i++) {
      const y = offsetY + i * cs;
      if (y >= 0 && y <= canvas.height) { ctx.beginPath(); ctx.moveTo(offsetX, y); ctx.lineTo(offsetX + battle.width * cs, y); ctx.stroke(); }
    }

    for (const key in cells) {
      const [x, y] = key.split(',').map(Number);
      const px = offsetX + x * cs;
      const py = offsetY + y * cs;
      if (px + cs >= 0 && px <= canvas.width && py + cs >= 0 && py <= canvas.height) {
        ctx.fillStyle = cells[key];
        ctx.fillRect(px, py, cs, cs);
      }
    }

    if (cs > 4) {
      ctx.strokeStyle = '#d0d0d0';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= battle.width; i++) {
        const x = offsetX + i * cs;
        if (x >= 0 && x <= canvas.width) { ctx.beginPath(); ctx.moveTo(x, offsetY); ctx.lineTo(x, offsetY + battle.height * cs); ctx.stroke(); }
      }
      for (let i = 0; i <= battle.height; i++) {
        const y = offsetY + i * cs;
        if (y >= 0 && y <= canvas.height) { ctx.beginPath(); ctx.moveTo(offsetX, y); ctx.lineTo(offsetX + battle.width * cs, y); ctx.stroke(); }
      }
    }
  };

  const getCellAt = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    const cs = (canvas.width / battle.width) * zoom;
    const gx = Math.floor((x - panX) / cs);
    const gy = Math.floor((y - panY) / cs);
    if (gx >= 0 && gx < battle.width && gy >= 0 && gy < battle.height) return { x: gx, y: gy };
    return null;
  };

  const placePixel = async (gx, gy) => {
    if (!battle || !state.user) return;
    try {
      const result = await api.placePixel(battle.id, gx, gy, selectedColor);
      cells[`${gx},${gy}`] = selectedColor;
      draw();
      updateStatus(result);
    } catch (e) { toast(e.message, 'err'); }
  };

  const showPixelInfo = async (gx, gy) => {
    if (!battle) return;
    try {
      const info = await api.getPixelInfo(battle.id, gx, gy);
      if (info.empty) { toast('Пусто', 'err'); return; }
      const body = el(`<div class="col" style="gap:10px;align-items:center;padding:12px">
        <div style="width:48px;height:48px;border-radius:8px;background:${info.color};border:1px solid #ddd"></div>
        ${info.avatar ? `<div style="display:flex;gap:8px;align-items:center">
          <img src="${info.avatar}" style="width:32px;height:32px;border-radius:50%">
          <div><div class="strong small">${esc(info.displayName || info.username)}</div><div class="tiny muted">@${esc(info.username)}</div></div>
        </div>` : `<div class="strong small">Аноним</div>`}
        <div class="tiny muted">${new Date(info.placedAt).toLocaleString('ru-RU')}</div>
      </div>`);
      openSheet('Пиксель', body);
    } catch (e) { toast(e.message, 'err'); }
  };

  const updateStatus = (result) => {
    if (!result) return;
    const statusEl = host.querySelector('[data-status]');
    if (result.cooldown) {
      statusEl.textContent = `Кулдаун ${result.cooldown}с`;
    } else if (result.remaining !== undefined) {
      statusEl.textContent = `Осталось пикселей: ${result.remaining}`;
    }
  };

  battle = await api.activePixelBattle();
  if (!battle.active) {
    host.innerHTML = emptyState('star', 'Нет активного батла', 'Админ может запустить в админ-панели');
    return;
  }

  host.innerHTML = `
    <div style="background:#fff;padding:8px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #e0e0e0;flex-shrink:0;flex-wrap:wrap">
      <button data-close style="background:#eee;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;font-size:18px;font-weight:600;min-width:44px;min-height:36px" aria-label="Закрыть">✕</button>
      <div style="display:flex;gap:4px;flex-wrap:wrap;flex:1;min-width:0;max-height:80px;overflow:auto;padding:2px" data-palette></div>
      <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
        <button data-zoom-out style="padding:8px 14px;background:#eee;border:none;border-radius:8px;cursor:pointer;font-size:18px;min-width:36px;min-height:36px" aria-label="Уменьшить">−</button>
        <span data-zoom-val style="font-size:11px;color:#888;min-width:36px;text-align:center">100%</span>
        <button data-zoom-in style="padding:8px 14px;background:#eee;border:none;border-radius:8px;cursor:pointer;font-size:18px;min-width:36px;min-height:36px" aria-label="Увеличить">+</button>
        <button data-reset style="padding:8px 10px;background:#eee;border:none;border-radius:8px;cursor:pointer;font-size:12px;min-height:36px">Центр</button>
      </div>
    </div>
    <div data-status class="tiny muted" style="padding:6px 10px;background:#fafafa;font-size:11px"></div>
    <canvas data-canvas style="flex:1;width:100%;background:#fff;touch-action:none;cursor:crosshair;display:block"></canvas>
    <div class="tiny muted" style="padding:6px 10px;background:#fafafa;text-align:center;font-size:10px">Тап — поставить пиксель. Долгий тап — кто нарисовал. ПК: колесо мыши — зум, перетаскивание — двигать холст.</div>
  `;

  const palette = host.querySelector('[data-palette]');
  canvas = host.querySelector('[data-canvas]');
  ctx = canvas.getContext('2d');

  const isMobile = matchMedia('(max-width: 720px), (pointer: coarse)').matches;
  const swatchSize = isMobile ? 36 : 28;
  COLORS.forEach((c, i) => {
    const btn = el(`<button data-color="${c}" style="width:${swatchSize}px;height:${swatchSize}px;border-radius:6px;background:${c};border:${i===0?'3px solid #87b7a3':'1px solid #ccc'};cursor:pointer;flex-shrink:0;padding:0;touch-action:manipulation" aria-label="Цвет ${i+1}" aria-pressed="${i===0?'true':'false'}"></button>`);
    btn.onclick = () => {
      selectedColor = c;
      palette.querySelectorAll('[data-color]').forEach((b) => {
        b.style.border = '1px solid #ccc';
        b.setAttribute('aria-pressed', 'false');
      });
      btn.style.border = '3px solid #87b7a3';
      btn.setAttribute('aria-pressed', 'true');
    };
    palette.appendChild(btn);
  });

  const resizeCanvas = () => {
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width;
    canvas.height = r.height;
    if (zoom === 1) { panX = 0; panY = 0; }
    draw();
  };

  setTimeout(() => {
    resizeCanvas();
    // Choose an initial zoom that gives at least 24px touch targets per cell.
    // At zoom=1, cs = canvas.width / battle.width (whole battle fits across).
    // We want cs >= 24, so zoom >= 24 / cs_at_zoom_1.
    const csAtZoom1 = canvas.width / battle.width;
    const minCellPx = isMobile ? 28 : 20; // touch target on mobile, smaller on desktop
    const fitZoomX = minCellPx / csAtZoom1;
    // Also fit vertically so the whole battle is visible if possible.
    const fitZoomY = (canvas.height / battle.height);
    // On mobile prefer larger cells (pan around); on desktop try to fit all.
    zoom = isMobile ? fitZoomX : Math.max(1, Math.min(fitZoomX, fitZoomY));
    zoom = Math.max(0.5, Math.min(8, zoom));
    const totalW = battle.width * csAtZoom1 * zoom;
    const totalH = battle.height * (canvas.height / battle.height) * zoom;
    panX = Math.max(0, (canvas.width - totalW) / 2);
    panY = Math.max(0, (canvas.height - totalH) / 2);
    updateZoomLabel();
    draw();
  }, 100);

  const updateZoomLabel = () => {
    host.querySelector('[data-zoom-val]').textContent = Math.round(zoom * 100) + '%';
  };

  host.querySelector('[data-zoom-in]').onclick = () => { zoom = Math.min(10, zoom * 1.5); updateZoomLabel(); draw(); };
  host.querySelector('[data-zoom-out]').onclick = () => { zoom = Math.max(0.5, zoom / 1.5); updateZoomLabel(); draw(); };
  host.querySelector('[data-reset]').onclick = () => {
    zoom = 1; panX = 0; panY = 0;
    const csAtZoom1 = canvas.width / battle.width;
    const minCellPx = isMobile ? 28 : 20;
    zoom = Math.max(0.5, Math.min(8, minCellPx / csAtZoom1));
    const totalW = battle.width * csAtZoom1 * zoom;
    const totalH = battle.height * (canvas.height / battle.height) * zoom;
    panX = Math.max(0, (canvas.width - totalW) / 2);
    panY = Math.max(0, (canvas.height - totalH) / 2);
    updateZoomLabel(); draw();
  };

  let pointerDown = false;
  let downX = 0, downY = 0;
  let hasMoved = false;

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pointerDown = true;
    hasMoved = false;
    downX = e.clientX;
    downY = e.clientY;
    isPanning = true;
    panStartX = e.clientX - panX;
    panStartY = e.clientY - panY;
    pressTimer = setTimeout(() => {
      if (!hasMoved) {
        const cell = getCellAt(e.clientX, e.clientY);
        if (cell) showPixelInfo(cell.x, cell.y);
      }
    }, 500);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointerDown) return;
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      hasMoved = true;
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    }
    if (isPanning && hasMoved) {
      panX = e.clientX - panStartX;
      panY = e.clientY - panStartY;
      draw();
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    pointerDown = false;
    isPanning = false;
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    if (!hasMoved) {
      const cell = getCellAt(e.clientX, e.clientY);
      if (cell) placePixel(cell.x, cell.y);
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const oldZoom = zoom;
    zoom = Math.max(0.5, Math.min(10, zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    panX = mx - (mx - panX) * (zoom / oldZoom);
    panY = my - (my - panY) * (zoom / oldZoom);
    updateZoomLabel();
    draw();
  });

  window.addEventListener('resize', resizeCanvas);

  const endsAt = new Date(battle.endsAt);
  const daysLeft = Math.max(0, Math.ceil((endsAt - Date.now()) / 86400000));
  host.querySelector('[data-status]').textContent = `Осталось ${daysLeft} дн. | Поставлено: ${battle.pixelsPlaced}/${battle.maxPixels}`;

  const loadCells = async () => {
    try {
      const sb = await getSupabaseClient();
      if (!sb) return;
      const { data } = await sb.from('pixel_cells').select('x,y,color').eq('battle_id', battle.id);
      if (data) { cells = {}; data.forEach((c) => cells[`${c.x},${c.y}`] = c.color); draw(); }
    } catch {}
  };
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

  host.querySelector('[data-close]').onclick = () => { if (channel) try { channel.unsubscribe(); } catch {} window.removeEventListener('resize', resizeCanvas); close(); };

  return { close };
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
