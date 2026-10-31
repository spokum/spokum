import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, toast, confirmSheet } from '../ui.js';
import { api, state } from '../store.js';

/**
 * Цитата дня (Daily Quote).
 * 50 русских цитат о спокойствии, осознанности и жизни. Цитата выбирается
 * детерминированно по дате — сегодня у всех одна и та же. Можно листать
 * вперед-назад (только для просмотра), сохранять в избранное и публиковать
 * как пост.
 *
 * Storage:
 *   localStorage.spokum.favoriteQuotes = [ quoteId, ... ]
 */

const FAV_KEY = 'spokum.favoriteQuotes';

export const DAILY_QUOTES = [
  { id: 'q01', text: 'Тише едешь — дальше будешь', author: 'Народная мудрость' },
  { id: 'q02', text: 'Спокойствие — не слабость, а сила', author: 'Народная мудрость' },
  { id: 'q03', text: 'Кто рано встаёт, тому Бог подаёт', author: 'Народная пословица' },
  { id: 'q04', text: 'Утро вечера мудренее', author: 'Народная пословица' },
  { id: 'q05', text: 'Тишина — величайшее искусство', author: 'Народная мудрость' },
  { id: 'q06', text: 'Сначала подумай, а потом скажи', author: 'Народная мудрость' },
  { id: 'q07', text: 'Терпение горько, но плод его сладок', author: 'Жан-Жак Руссо' },
  { id: 'q08', text: 'Молчание — золото', author: 'Народная мудрость' },
  { id: 'q09', text: 'Без спешки — до сути дела', author: 'Народная мудрость' },
  { id: 'q10', text: 'Кто спокоен, тот силён', author: 'Народная мудрость' },
  { id: 'q11', text: 'Вода камень точит', author: 'Народная пословица' },
  { id: 'q12', text: 'Поспешишь — людей насмешишь', author: 'Народная пословица' },
  { id: 'q13', text: 'Тише воды, ниже травы', author: 'Народная пословица' },
  { id: 'q14', text: 'Семь раз отмерь, один раз отрежь', author: 'Народная пословица' },
  { id: 'q15', text: 'Дело мастера боится', author: 'Народная пословица' },
  { id: 'q16', text: 'Кончил дело — гуляй смело', author: 'Народная пословица' },
  { id: 'q17', text: 'Всему своё время', author: 'Народная мудрость' },
  { id: 'q18', text: 'Что ни делается — всё к лучшему', author: 'Народная мудрость' },
  { id: 'q19', text: 'Глаза боятся, а руки делают', author: 'Народная пословица' },
  { id: 'q20', text: 'Кто хочет — тот добьётся', author: 'Народная пословица' },
  { id: 'q21', text: 'Дорогу осилит идущий', author: 'Народная мудрость' },
  { id: 'q22', text: 'Кто ищет — тот всегда найдёт', author: 'Народная пословица' },
  { id: 'q23', text: 'Любишь кататься — люби и саночки возить', author: 'Народная пословица' },
  { id: 'q24', text: 'Береги платье снову, а честь смолоду', author: 'Народная пословица' },
  { id: 'q25', text: 'С кем поведёшься — от того и наберёшься', author: 'Народная пословица' },
  { id: 'q26', text: 'В здоровом теле — здоровый дух', author: 'Ювенал' },
  { id: 'q27', text: 'Знание — сила', author: 'Фрэнсис Бэкон' },
  { id: 'q28', text: 'Я мыслю, следовательно, я существую', author: 'Рене Декарт' },
  { id: 'q29', text: 'Жизнь — это то, что с тобой происходит, пока ты строишь другие планы', author: 'Джон Леннон' },
  { id: 'q30', text: 'Будь собой — остальные роли уже заняты', author: 'Оскар Уайльд' },
  { id: 'q31', text: 'Никогда не поздно стать тем, кем ты мог бы быть', author: 'Джордж Элиот' },
  { id: 'q32', text: 'Что не убивает нас — делает нас сильнее', author: 'Фридрих Ницше' },
  { id: 'q33', text: 'Счастье — это способ путешествовать, а не станция назначения', author: 'Маргарет Ли Рунбек' },
  { id: 'q34', text: 'Самое важное — уметь наслаждаться жизнью', author: 'Народная мудрость' },
  { id: 'q35', text: 'Жизнь коротка — искусство вечно', author: 'Гиппократ' },
  { id: 'q36', text: 'Кто не помнит прошлого — обречён пережить его снова', author: 'Джордж Сантаяна' },
  { id: 'q37', text: 'Спокойный разум видит яснее', author: 'Народная мудрость' },
  { id: 'q38', text: 'Лучше один раз увидеть, чем сто раз услышать', author: 'Народная пословица' },
  { id: 'q39', text: 'Век живи — век учись', author: 'Народная пословица' },
  { id: 'q40', text: 'Старый друг лучше новых двух', author: 'Народная пословица' },
  { id: 'q41', text: 'Не в деньгах счастье', author: 'Народная пословица' },
  { id: 'q42', text: 'Спокойствие души — высшее богатство', author: 'Народная мудрость' },
  { id: 'q43', text: 'Чем меньше слов, тем больше смысла', author: 'Народная мудрость' },
  { id: 'q44', text: 'Где нет тишины — там нет мыслей', author: 'Народная мудрость' },
  { id: 'q45', text: 'Меньше знаешь — крепче спишь', author: 'Народная пословица' },
  { id: 'q46', text: 'Кто много говорит — тот мало делает', author: 'Народная пословица' },
  { id: 'q47', text: 'Слово не воробей — вылетит, не поймаешь', author: 'Народная пословица' },
  { id: 'q48', text: 'Дружба крепка не льстивыми словами, а правдой', author: 'Народная мудрость' },
  { id: 'q49', text: 'Не всё то золото, что блестит', author: 'Народная пословица' },
  { id: 'q50', text: 'Каждый день — новый шанс начать заново', author: 'Народная мудрость' }
];

// День года (0..365). Учитывает високосные годы — цитата на 29 февраля
// детерминированно выбирается из «обычного» индекса.
function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  return Math.floor(diff / 86400000);
}

// Возвращает цитату для указанной даты (или сегодня).
export function getDailyQuote(date = new Date()) {
  const total = DAILY_QUOTES.length;
  const day = dayOfYear(date);
  // Сдвигаем год, чтобы цитаты не повторялись каждый год в один и тот же день
  // слишком предсказуемо. Берём индекс = (день + год) % всего.
  const year = date.getFullYear();
  const index = (day + year) % total;
  return DAILY_QUOTES[index];
}

function readFavorites() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAV_KEY));
    if (Array.isArray(raw)) return raw;
  } catch {}
  return [];
}

function writeFavorites(list) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(list.slice(0, 100)));
  } catch {}
}

function isFavorite(id) {
  return readFavorites().includes(id);
}

function toggleFavorite(id) {
  const list = readFavorites();
  const idx = list.indexOf(id);
  if (idx >= 0) {
    list.splice(idx, 1);
    writeFavorites(list);
    return false;
  }
  list.unshift(id);
  writeFavorites(list);
  return true;
}

// Превращает дату в человекочитаемую подпись «сегодня / вчера / N дней назад»
function relativeDay(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((today - target) / 86400000);
  if (diff === 0) return 'Цитата дня';
  if (diff === 1) return 'Вчерашняя цитата';
  if (diff < 7) return `Цитата ${diff} ${diff === 1 ? 'день' : diff < 5 ? 'дня' : 'дней'} назад`;
  return target.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function quoteCard(quote, opts = {}) {
  const fav = isFavorite(quote.id);
  return `<div class="card dq-card" style="
      padding:22px 18px;text-align:center;
      background:linear-gradient(160deg, var(--bg-2), var(--surface));
      border:1px solid var(--line-strong);
    ">
    <div style="color:var(--accent);opacity:.6;margin-bottom:10px">${icon('spark', 22)}</div>
    <div class="dq-text" style="
        font-size:18px;line-height:1.45;font-weight:600;
        font-style:italic;letter-spacing:.1px;
        color:var(--text);
      ">${esc(quote.text)}</div>
    <div class="tiny muted" style="margin-top:14px">— ${esc(quote.author || 'Народная мудрость')}</div>
    <div class="tiny muted" style="margin-top:8px;opacity:.7">${esc(opts.label || relativeDay(new Date()))}</div>
    <div class="row" style="gap:6px;margin-top:14px;justify-content:center;flex-wrap:wrap">
      <button class="btn btn-sm" data-post>${icon('feed', 14)} Поделиться в пост</button>
      <button class="btn btn-sm ${fav ? 'btn-primary' : ''}" data-fav>${icon(fav ? 'heart' : 'star', 14)} ${fav ? 'В избранном' : 'В избранное'}</button>
    </div>
  </div>`;
}

function favoritesListHtml() {
  const list = readFavorites();
  if (!list.length) {
    return `<div class="tiny muted" style="text-align:center;padding:10px">
      ${icon('star', 22)}
      <div style="margin-top:6px">Избранных цитат пока нет</div>
    </div>`;
  }
  return `<div class="col" style="gap:6px">
    ${list.map((id) => {
      const q = DAILY_QUOTES.find((x) => x.id === id);
      if (!q) return '';
      return `<div class="card dq-fav" style="padding:10px 12px">
        <div class="row" style="gap:8px;align-items:flex-start">
          <span style="color:var(--accent);opacity:.7;flex:none">${icon('star', 14)}</span>
          <div class="grow" style="min-width:0">
            <div class="small" style="line-height:1.4;font-style:italic">${esc(q.text)}</div>
            <div class="tiny muted" style="margin-top:3px">— ${esc(q.author)}</div>
          </div>
          <button class="btn btn-sm btn-ghost" data-rm="${esc(q.id)}" style="color:#c98b8b;flex:none">${icon('trash', 13)}</button>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

export function openDailyQuote() {
  const body = el('<div class="col" style="gap:12px"></div>');
  const sheet = openSheet('Цитата дня', body);

  // Начинаем с сегодняшней цитаты; навигация двигает «смещение» в днях
  // относительно сегодня — для просмотра, но «цитата дня» остаётся той же.
  let offset = 0;

  const render = () => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const quote = getDailyQuote(date);
    const label = offset === 0 ? 'Цитата дня' : relativeDay(date);

    body.innerHTML = `
      ${quoteCard(quote, { label })}
      <div class="row" style="gap:6px">
        <button class="btn grow" data-prev>${icon('back', 16)} Прошлая</button>
        <button class="btn grow" data-next>Следующая ${icon('forward', 16)}</button>
      </div>
      <div class="row between" style="margin:6px 2px 0">
        <span class="strong small">${icon('star', 15)} Избранное</span>
        <span class="tiny muted">${readFavorites().length}</span>
      </div>
      <div data-favs>${favoritesListHtml()}</div>`;

    body.querySelector('[data-prev]').onclick = () => {
      offset -= 1;
      render();
    };
    body.querySelector('[data-next]').onclick = () => {
      offset += 1;
      render();
    };

    body.querySelector('[data-post]').onclick = async () => {
      if (!state.user) {
        toast('Нужен вход, чтобы публиковать', 'err');
        return;
      }
      try {
        if (typeof api.createPost === 'function') {
          const text = `«${quote.text}»\n— ${quote.author || 'Народная мудрость'}`;
          await api.createPost({ text, mood: 'calm', kind: 'text' });
          toast('Опубликовано');
          sheet.close();
        } else {
          throw new Error('Публикация недоступна');
        }
      } catch (error) {
        toast(error?.message || 'Не удалось опубликовать', 'err');
      }
    };

    body.querySelector('[data-fav]').onclick = () => {
      const nowFav = toggleFavorite(quote.id);
      toast(nowFav ? 'Добавлено в избранное' : 'Убрано из избранного');
      // Обновляем только кнопку и список избранного, чтобы не сбить навигацию
      const favBtn = body.querySelector('[data-fav]');
      favBtn.className = `btn btn-sm ${nowFav ? 'btn-primary' : ''}`;
      favBtn.innerHTML = `${icon(nowFav ? 'heart' : 'star', 14)} ${nowFav ? 'В избранном' : 'В избранное'}`;
      body.querySelector('[data-favs]').innerHTML = favoritesListHtml();
      bindFavRemovals();
    };

    bindFavRemovals();
  };

  function bindFavRemovals() {
    body.querySelectorAll('[data-rm]').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-rm');
        const q = DAILY_QUOTES.find((x) => x.id === id);
        const ok = await confirmSheet({
          title: 'Убрать из избранного?',
          text: q ? `«${q.text}»` : '',
          confirm: 'Убрать',
          danger: true
        });
        if (!ok) return;
        writeFavorites(readFavorites().filter((x) => x !== id));
        toast('Убрано из избранного');
        // Если текущая цитата была этой — обновить всю карточку
        if (offset === 0 && getDailyQuote().id === id) {
          render();
        } else {
          body.querySelector('[data-favs]').innerHTML = favoritesListHtml();
          bindFavRemovals();
        }
      };
    });
  }

  render();
  return sheet;
}

// Маленький виджет для профиля — показывает сегодняшнюю цитату и по тапу
// открывает полный sheet. Используется как fallback, когда нет серверной
// цитаты (api.todayQuote).
export function dailyQuoteWidgetHtml() {
  const q = getDailyQuote();
  return `<button class="card appear" data-dq-open style="
      margin:0 12px 12px;padding:14px;width:auto;text-align:left;cursor:pointer;
      background:linear-gradient(135deg,var(--bg-2),var(--surface));
      border:1px solid var(--line);
    ">
    <div class="row" style="gap:8px;align-items:flex-start">
      <span style="color:var(--accent);opacity:.7">${icon('spark', 16)}</span>
      <div class="grow" style="min-width:0">
        <div class="strong small" style="margin-bottom:4px">Цитата дня</div>
        <div class="small" style="line-height:1.45;font-style:italic">${esc(q.text)}</div>
        <div class="tiny muted" style="margin-top:4px">— ${esc(q.author || 'Народная мудрость')}</div>
      </div>
      <span style="color:var(--muted)">${icon('forward', 14)}</span>
    </div>
  </button>`;
}

export function bindDailyQuoteWidget(root) {
  const node = root.querySelector('[data-dq-open]');
  if (node) node.onclick = () => openDailyQuote();
}
