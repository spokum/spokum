import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet } from '../ui.js';
import { api, state } from '../store.js';

/**
 * Greeting cards (Открытки).
 * Eight gradient cards with short Russian quotes — СпокУм mood collection.
 * A card can be: shared as a post, sent to a chat, or saved to favourites.
 */

export const CARDS = [
  { id: 'tishche-edesh', title: 'Тише едешь',   quote: 'Тише едешь — дальше будешь',          gradient: 'linear-gradient(135deg,#8a6b3a,#5a3f1c)', icon: 'leaf' },
  { id: 'podderzhka',    title: 'Поддержка',    quote: 'Ты сильнее, чем думаешь',             gradient: 'linear-gradient(135deg,#6e5bb8,#3b2e6e)', icon: 'heart' },
  { id: 'spokoystvie',   title: 'Спокойствие',  quote: 'Дыши. Всё пройдёт.',                  gradient: 'linear-gradient(135deg,#2f8f86,#1c5e58)', icon: 'spark' },
  { id: 'blagodarnost',  title: 'Благодарность', quote: 'Спасибо, что ты есть',               gradient: 'linear-gradient(135deg,#c97f9a,#7d4258)', icon: 'rose' },
  { id: 'osen',          title: 'Осень',        quote: 'Осень учит нас отпускать',            gradient: 'linear-gradient(135deg,#d2893a,#7c4514)', icon: 'leaf' },
  { id: 'uyut',          title: 'Уют',          quote: 'Тепло внутри важнее тепла снаружи',   gradient: 'linear-gradient(135deg,#d4a25a,#8a5a26)', icon: 'flame' },
  { id: 'noch',          title: 'Ночь',         quote: 'Тишина — тоже музыка',                gradient: 'linear-gradient(135deg,#2a3a6a,#131a36)', icon: 'moon' },
  { id: 'svet',          title: 'Свет',         quote: 'Ты делаешь день светлее',             gradient: 'linear-gradient(135deg,#e3c14a,#a07a14)', icon: 'star' }
];

const SAVED_KEY = 'spokum.cards';

function readSaved() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

function writeSaved(list) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 60))); } catch {}
}

function saveCard(card) {
  const list = readSaved();
  if (!list.some((c) => c.id === card.id)) {
    list.unshift({ id: card.id, title: card.title, quote: card.quote, gradient: card.gradient, emoji: card.icon, savedAt: Date.now() });
    writeSaved(list);
  }
}

function cardMarkup(card) {
  return `
    <button type="button" class="greet-card" data-card="${esc(card.id)}" style="background:${card.gradient}">
      <div class="greet-card-emoji">${card.icon}</div>
      <div class="greet-card-title">${esc(card.title)}</div>
      <div class="greet-card-quote">${esc(card.quote)}</div>
    </button>`;
}

export function openCards() {
  const body = el(`<div class="col" style="gap:10px">
    <p class="small muted" style="margin:0;line-height:1.55">Тихие слова, которыми хочется поделиться. Нажмите на открытку, чтобы выбрать действие.</p>
    <div class="greet-grid">${CARDS.map(cardMarkup).join('')}</div>
  </div>`);
  const sheet = openSheet('Открытки', body);
  body.querySelectorAll('[data-card]').forEach((btn) => {
    btn.onclick = () => {
      const card = CARDS.find((c) => c.id === btn.dataset.card);
      if (card) openCardActions(card, sheet);
    };
  });
  return sheet;
}

function openCardActions(card, parentSheet) {
  const body = el(`<div class="col" style="gap:6px">
    <div class="greet-card" style="background:${card.gradient};cursor:default;border:none;width:100%">
      <div class="greet-card-emoji">${card.icon}</div>
      <div class="greet-card-title">${esc(card.title)}</div>
      <div class="greet-card-quote">${esc(card.quote)}</div>
    </div>
    <button class="list-item" data-post>${icon('feed', 18)}<span class="grow">Поделиться в посте</span>${icon('forward', 15)}</button>
    <button class="list-item" data-chat>${icon('chats', 18)}<span class="grow">Отправить в чат</span>${icon('forward', 15)}</button>
    <button class="list-item" data-save>${icon('star', 18)}<span class="grow">Сохранить</span>${icon('forward', 15)}</button>
  </div>`);
  const sheet = openSheet(card.title, body);

  body.querySelector('[data-post]').onclick = async () => {
    sheet.close();
    parentSheet?.close?.();
    if (!state.user) {
      toast('Нужен вход, чтобы публиковать', 'err');
      return;
    }
    try {
      const text = `${card.icon} ${card.quote}`;
      if (typeof api.createPost === 'function') {
        await api.createPost({ text, mood: 'calm', kind: 'text' });
        toast('Опубликовано');
      } else {
        throw new Error('Публикация недоступна');
      }
    } catch (error) {
      toast(error?.message || 'Не удалось опубликовать', 'err');
    }
  };

  body.querySelector('[data-chat]').onclick = async () => {
    sheet.close();
    parentSheet?.close?.();
    openCardSender(card);
  };

  body.querySelector('[data-save]').onclick = () => {
    saveCard(card);
    toast('Открытка сохранена');
    sheet.close();
  };
}

export async function openCardSender(card) {
  if (!state.user) {
    toast('Нужен вход, чтобы отправлять сообщения', 'err');
    return;
  }
  let chats = [];
  try {
    ({ chats } = await api.chats());
  } catch (error) {
    toast(error?.message || 'Не удалось загрузить чаты', 'err');
    return;
  }
  if (!chats.length) {
    toast('Сначала начните хоть один чат', 'err');
    return;
  }
  const body = el(`<div class="col" style="gap:6px">
    <div class="small muted" style="padding:0 4px">Куда отправить открытку «${esc(card.title)}»?</div>
    ${chats.map((chat) => `
      <button class="list-item" data-id="${esc(chat.id)}" style="padding:10px">
        <span class="grow"><span class="small strong truncate">${esc(chat.title || 'Без названия')}</span></span>
        ${icon('forward', 15)}
      </button>`).join('')}
  </div>`);
  const sheet = openSheet('Отправить в чат', body);
  body.querySelectorAll('[data-id]').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api.sendMessage(btn.dataset.id, { kind: 'text', body: `${card.icon} ${card.quote}` });
        toast('Открытка отправлена');
        sheet.close();
      } catch (error) {
        toast(error?.message || 'Не удалось отправить', 'err');
      }
    };
  });
  return sheet;
}
