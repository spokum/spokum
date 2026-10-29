import { el, esc } from '../util.js';
import { openSheet } from '../ui.js';

/**
 * Default СпокУм sticker pack — twelve emoji representing moods and items
 * of a calm autumn atmosphere. Available to everyone, no premium required.
 *
 * Each sticker is sent as a chat message with { kind: 'sticker', body: emoji }.
 * The chat view renders emoji-stickers large (48px) and centred.
 */
export const STICKERS = [
  '🍃', // leaf / calm
  '☕', // tea
  '🌙', // moon
  '🔥', // flame
  '💜', // calm heart
  '😌', // calm face
  '🧘', // meditation
  '🌸', // blossom
  '🍂', // autumn
  '⭐', // star
  '🫂', // hug
  '🕯️'  // candle
];

/**
 * Open a sheet with the sticker grid. Tapping a sticker calls `callback(emoji)`
 * and closes the sheet. Returns the sheet handle from openSheet.
 */
export function openStickerPicker(callback) {
  const grid = el(
    `<div class="sticker-pack-grid">${STICKERS.map((emoji) => `<button class="sticker-pack-item" type="button" data-e="${esc(emoji)}">${emoji}</button>`).join('')}</div>`
  );
  const sheet = openSheet('Стикеры СпокУма', grid);
  grid.querySelectorAll('[data-e]').forEach((button) => {
    button.onclick = () => {
      const emoji = button.dataset.e;
      sheet.close();
      try { callback(emoji); } catch {}
    };
  });
  return sheet;
}
