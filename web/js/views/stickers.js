import { el, esc } from '../util.js';
import { openSheet } from '../ui.js';

/**
 * Default СпокУм sticker pack — twelve SVG icons representing moods and items
 * of a calm autumn atmosphere. Available to everyone, no premium required.
 *
 * Each sticker is sent as a chat message with { kind: 'sticker', body: icon, isIcon: true }.
 * The chat view renders stickerIcon-stickers large (48px) and centred.
 */
export const STICKERS = [
  'leaf',     // calm
  'cup',      // tea
  'moon',     // night
  'flame',    // warmth
  'heart',    // love
  'same',     // peace
  'spark',    // meditation
  'rose',     // blossom
  'star',     // hope
  'star',     // light
  'hold',     // hug
  'flame'     // candle
];

/**
 * Open a sheet with the sticker grid. Tapping a sticker calls `callback(stickerIcon)`
 * and closes the sheet. Returns the sheet handle from openSheet.
 */
export function openStickerPicker(callback) {
  const grid = el(
    `<div class="sticker-pack-grid">${STICKERS.map((stickerIcon) => `<button class="sticker-pack-item" type="button" data-e="${esc(stickerIcon)}">${stickerIcon}</button>`).join('')}</div>`
  );
  const sheet = openSheet('Стикеры СпокУма', grid);
  grid.querySelectorAll('[data-e]').forEach((button) => {
    button.onclick = () => {
      const stickerIcon = button.dataset.e;
      sheet.close();
      try { callback(stickerIcon); } catch {}
    };
  });
  return sheet;
}
