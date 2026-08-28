import { api, state, setUser } from '../store.js';
import { el, esc, timeAgo } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, toast, emptyState, confirmSheet, avatar } from '../ui.js';

const RARITY = {
  common: 'обычный',
  rare: 'редкий',
  epic: 'особый',
  legend: 'легендарный'
};

export function giftArt(gift, size = 44) {
  return `<span class="gift-art gift-${esc(gift.rarity || 'common')}" style="--h:${Number(gift.hue) || 220};width:${size}px;height:${size}px">${icon(gift.art || 'spark', Math.round(size * 0.5))}</span>`;
}

export function giftShelf(gifts) {
  const all = gifts || [];
  if (!all.length) return '';
  const pinned = all.filter((row) => row.pinned);
  const shown = (pinned.length ? pinned : all).slice(0, 6);
  const rest = all.length - shown.length;
  return `<div class="gift-shelf">${shown
    .map((gift) => `<span class="gift-slot" title="${esc(gift.title)}${gift.from ? ' от ' + esc(gift.from.displayName) : ''}">${giftArt(gift, 38)}</span>`)
    .join('')}${rest > 0 ? `<span class="gift-more">+${rest}</span>` : ''}</div>`;
}

async function refreshCoins() {
  try {
    const { user } = await api.me();
    if (user) setUser(user);
  } catch {}
}

function askNote(kind) {
  return new Promise((resolve) => {
    let settled = false;
    const inner = el(`<div class="col" style="gap:12px;align-items:center">
      ${giftArt(kind, 62)}
      <p class="small" style="margin:0;text-align:center">Дарим «${esc(kind.title)}» за ${kind.price}</p>
      <input class="input" data-note maxlength="200" placeholder="Подпись, если хотите" style="width:100%">
      <button class="btn btn-primary" data-ok style="width:100%">${icon('gift', 17)} Подарить</button>
    </div>`);
    const sheet = openSheet('Подтверждение', inner, {
      onClose: () => {
        document.body.style.overflow = 'hidden';
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }
    });
    inner.querySelector('[data-ok]').onclick = () => {
      if (settled) return;
      settled = true;
      const value = inner.querySelector('[data-note]').value.trim();
      sheet.close();
      document.body.style.overflow = 'hidden';
      resolve(value);
    };
  });
}

export async function openGiftShop(target, done) {
  const body = el('<div class="col" style="gap:10px"><div class="card" style="height:120px;opacity:.3"></div></div>');
  const sheet = openSheet(target ? `Подарок для ${target.displayName}` : 'Магазин подарков', body);

  let types = [];
  try {
    const result = await api.giftTypes();
    types = result.types || [];
  } catch (error) {
    body.innerHTML = emptyState('warn', 'Не загрузилось', error.message);
    return sheet;
  }

  const purse = state.user?.coins || 0;
  body.innerHTML = `
    <div class="row between card" style="padding:12px 14px">
      <span class="small muted">У вас монет</span>
      <span class="row" style="gap:6px;color:var(--accent)">${icon('coin', 17)}<span class="strong">${purse}</span></span>
    </div>
    <div class="gift-grid" data-grid></div>
    <p class="tiny muted" style="margin:0;line-height:1.5">Монеты зарабатываются в играх. Подарок можно оставить на витрине профиля или продать обратно за 70% цены.</p>`;

  const grid = body.querySelector('[data-grid]');
  types.forEach((kind) => {
    const card = el(`<button class="gift-card ${purse < kind.price ? 'poor' : ''}">
      ${giftArt(kind, 52)}
      <span class="strong tiny" style="margin-top:7px">${esc(kind.title)}</span>
      <span class="tiny muted">${esc(RARITY[kind.rarity] || '')}</span>
      <span class="row" style="gap:4px;margin-top:5px;color:var(--accent)">${icon('coin', 13)}<span class="tiny strong">${kind.price}</span></span>
    </button>`);
    card.onclick = async () => {
      if (!target) return toast('Откройте профиль человека, чтобы подарить', 'err');
      const have = state.user?.coins || 0;
      if (have < kind.price) return toast(`Не хватает ${kind.price - have} монет`, 'err');

      const note = await askNote(kind);
      if (note === null) return;
      try {
        await api.buyGift(kind.id, target.id, note);
        await refreshCoins();
        sheet.close();
        toast('Подарок отправлен');
        done?.();
      } catch (error) {
        toast(error.message, 'err');
      }
    };
    grid.appendChild(card);
  });
  return sheet;
}

export async function openMyGifts(userId, editable) {
  const body = el('<div class="col" style="gap:10px"><div class="card" style="height:120px;opacity:.3"></div></div>');
  const sheet = openSheet(editable ? 'Мои подарки' : 'Подарки', body);

  const draw = async () => {
    let gifts = [];
    try {
      const result = await api.gifts(userId);
      gifts = result.gifts || [];
    } catch (error) {
      body.innerHTML = emptyState('warn', 'Не загрузилось', error.message);
      return;
    }
    if (!gifts.length) {
      body.innerHTML = emptyState('gift', 'Подарков нет', editable ? 'Их дарят другие люди за монетки' : 'Ему пока ничего не дарили');
      return;
    }
    body.innerHTML = '<div class="col" data-list style="gap:8px"></div>';
    const list = body.querySelector('[data-list]');
    gifts.forEach((gift) => {
      const card = el(`<div class="card" style="padding:12px">
        <div class="row" style="gap:11px">
          ${giftArt(gift, 46)}
          <div class="grow" style="min-width:0">
            <div class="row" style="gap:6px"><span class="strong small truncate">${esc(gift.title)}</span>${gift.pinned ? '<span class="pill good">на витрине</span>' : ''}</div>
            <div class="tiny muted">${gift.from ? 'от ' + esc(gift.from.displayName) : 'от неизвестного'} · ${esc(timeAgo(gift.createdAt))}</div>
            ${gift.note ? `<div class="tiny" style="margin-top:4px">«${esc(gift.note)}»</div>` : ''}
          </div>
        </div>
        ${editable ? `<div class="row" style="gap:8px;margin-top:10px">
          <button class="btn btn-sm grow" data-pin>${icon(gift.pinned ? 'close' : 'star', 15)} ${gift.pinned ? 'Убрать' : 'На витрину'}</button>
          <button class="btn btn-sm grow" data-sell>${icon('coin', 15)} Продать за ${Math.max(1, Math.floor((gift.price * 70) / 100))}</button>
        </div>` : ''}
      </div>`);
      card.querySelector('[data-pin]')?.addEventListener('click', async () => {
        try {
          await api.pinGift(gift.id, !gift.pinned);
          draw();
        } catch (error) {
          toast(error.message, 'err');
        }
      });
      card.querySelector('[data-sell]')?.addEventListener('click', async () => {
        const ok = await confirmSheet({
          title: 'Продать подарок',
          text: `Вернётся ${Math.max(1, Math.floor((gift.price * 70) / 100))} монет. Подарок исчезнет, отменить нельзя.`,
          confirm: 'Продать',
          danger: true
        });
        if (!ok) return;
        try {
          const result = await api.sellGift(gift.id);
          await refreshCoins();
          toast(`Получено ${result.paid} монет`);
          draw();
        } catch (error) {
          toast(error.message, 'err');
        }
      });
      list.appendChild(card);
    });
  };

  await draw();
  return sheet;
}

export async function openWallet() {
  const body = el('<div class="col" style="gap:10px"><div class="card" style="height:100px;opacity:.3"></div></div>');
  const sheet = openSheet('Кошелёк', body);
  let rows = [];
  try {
    const result = await api.coinLog();
    rows = result.rows || [];
  } catch (error) {
    body.innerHTML = emptyState('warn', 'Не загрузилось', error.message);
    return sheet;
  }
  body.innerHTML = `
    <div class="card" style="padding:18px;text-align:center">
      <div class="row" style="justify-content:center;gap:8px;color:var(--accent)">${icon('coin', 26)}<span class="strong" style="font-size:26px">${state.user?.coins || 0}</span></div>
      <div class="tiny muted" style="margin-top:4px">монет на счету</div>
    </div>
    <p class="tiny muted" style="margin:0;line-height:1.5">Монеты падают за игры: чем выше счёт, тем больше. В сутки можно заработать не больше трёхсот.</p>
    <div class="col" data-list style="gap:6px"></div>`;
  const list = body.querySelector('[data-list]');
  if (!rows.length) {
    list.innerHTML = '<p class="tiny muted" style="text-align:center;padding:10px 0">Пока пусто. Сыграйте во что-нибудь.</p>';
    return sheet;
  }
  rows.forEach((row) => {
    list.appendChild(el(`<div class="row between card" style="padding:10px 13px">
      <span class="small truncate">${esc(row.reason || 'Начисление')}</span>
      <span class="strong small" style="color:${row.amount > 0 ? 'var(--accent)' : '#c98b8b'};flex:none">${row.amount > 0 ? '+' : ''}${row.amount}</span>
    </div>`));
  });
  return sheet;
}
