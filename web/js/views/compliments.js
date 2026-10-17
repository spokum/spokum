import { el, esc, uid } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, confirmSheet, emptyState } from '../ui.js';

// Мягкие, тёплые, не-романтичные комплименты на русском.
// Подобраны так, чтобы согревать, а не давить.
const COMPLIMENTS = [
  'Ты делаешь этот день светлее',
  'Твоё спокойствие заразительно',
  'Рядом с тобой тепло',
  'Ты умеешь слушать — это редкость',
  'Твои мысли как тихая гавань',
  'Ты сильнее, чем думаешь',
  'Твоя доброта меняет мир вокруг',
  'С тобой легко дышится',
  'Ты замечаешь то, чего другие не видят',
  'Твоё присутствие лечит',
  'Ты умеешь ждать — это тоже сила',
  'Ты честен с собой, и это красиво',
  'Ты даришь другим разрешение быть собой',
  'Ты бережно держишь чужие тайны',
  'Ты растёшь тихо, но верно',
  'Ты умеешь прощать — и себе в том числе',
  'Твои слова всегда вовремя',
  'Ты тёплый, даже когда устал',
  'Ты делишься светом, не требуя ничего взамен',
  'Ты умеешь находить красоту в мелочах',
  'Ты не боишься быть мягким',
  'Ты оставляешь за собой тишину, в которой хорошо',
  'Ты держишь слово, даже когда трудно',
  'Ты умеешь радоваться чужим победам',
  'Ты знаешь, когда помолчать рядом',
  'Ты бережно относишься к чужому времени',
  'Ты не соревнуешься — и поэтому выигрываешь',
  'Ты умеешь начать заново без злости',
  'Ты держишь мир, в котором хочется остаться',
  'Ты создаёшь вокруг себя чувство дома',
  'Ты не сдаёшься, просто меняешь маршрут',
  'Ты умеешь сказать тёплое слово в трудный момент',
  'Ты делишься спокойствием, как чаем',
  'Ты видишь в людях лучшее — и оно проявляется',
  'Ты умеешь быть рядом без объяснений'
];

const STORAGE_KEY = 'spokum.compliments';
const RECENT_KEY = 'spokum.compliments.recent';

function loadFavorites() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveFavorites(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function loadRecent() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function pushRecent(text) {
  const recent = loadRecent().filter((t) => t !== text);
  recent.unshift(text);
  // Храним не больше 12 последних, чтобы не повторять недавнее.
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 12)));
}

export function getRandomCompliment() {
  const recent = loadRecent();
  const pool = COMPLIMENTS.filter((t) => !recent.includes(t));
  const list = pool.length ? pool : COMPLIMENTS;
  const text = list[Math.floor(Math.random() * list.length)];
  pushRecent(text);
  return text;
}

// Мягкие градиенты для карточки. Чередуем, чтобы каждый раз новый фон.
const GRADIENTS = [
  'linear-gradient(135deg,#3a2c4a,#7c5a8a)',
  'linear-gradient(135deg,#2c4a44,#5a8a78)',
  'linear-gradient(135deg,#4a3c2c,#a08660)',
  'linear-gradient(135deg,#3a3a4a,#6a6a8a)',
  'linear-gradient(135deg,#4a2c3a,#8a5a70)',
  'linear-gradient(135deg,#2c3a4a,#5a7a9a)'
];

function gradientFor(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

function isFavorite(text) {
  return loadFavorites().some((row) => row.text === text);
}

function addFavorite(text) {
  const list = loadFavorites();
  if (list.some((row) => row.text === text)) return false;
  list.unshift({ id: uid(), text, at: Date.now() });
  saveFavorites(list);
  return true;
}

function removeFavorite(id) {
  saveFavorites(loadFavorites().filter((row) => row.id !== id));
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export function openCompliments() {
  let current = '';

  const view = el(`
    <div class="col" style="gap:14px">
      <p class="tiny muted" style="margin:0;line-height:1.55">Мягкие слова, когда они нужны. Можно сохранить в избранное или поделиться.</p>

      <article class="compliment-card" data-card>
        <div class="compliment-glyph">${icon('spark', 22)}</div>
        <p class="compliment-text" data-text>Загрузка...</p>
        <div class="row" style="gap:8px;margin-top:14px;justify-content:center;flex-wrap:wrap">
          <button class="btn btn-sm grow" data-save>${icon('heart', 15)} Сохранить</button>
          <button class="btn btn-sm grow" data-share>${icon('share', 15)} Поделиться</button>
          <button class="btn btn-sm btn-primary grow" data-next>${icon('refresh', 15)} Ещё одно</button>
        </div>
      </article>

      <div data-fav-section>
        <div class="row between" style="margin:8px 2px">
          <div class="strong small">${icon('heart', 16)} Избранные</div>
          <span class="tiny muted" data-fav-count>0</span>
        </div>
        <div class="col" data-fav-list style="gap:6px"></div>
      </div>
    </div>
  `);

  const sheet = openSheet('Комплименты', view, {});

  const cardEl = view.querySelector('[data-card]');
  const textEl = view.querySelector('[data-text]');
  const saveBtn = view.querySelector('[data-save]');
  const shareBtn = view.querySelector('[data-share]');
  const nextBtn = view.querySelector('[data-next]');
  const favList = view.querySelector('[data-fav-list]');
  const favCount = view.querySelector('[data-fav-count]');

  function show(text) {
    current = text;
    cardEl.style.background = gradientFor(text);
    textEl.textContent = text;
    paintSaveButton();
  }

  function paintSaveButton() {
    const saved = isFavorite(current);
    saveBtn.classList.toggle('btn-primary', saved);
    saveBtn.innerHTML = saved
      ? `${icon('check', 15)} В избранном`
      : `${icon('heart', 15)} Сохранить`;
  }

  function paintFavorites() {
    const list = loadFavorites();
    favCount.textContent = String(list.length);
    if (!list.length) {
      favList.innerHTML = emptyState('heart', 'Пока пусто', 'Сохранённые комплименты появятся здесь');
      return;
    }
    favList.innerHTML = list.map((row) => `
      <div class="card list-item compliment-fav" data-id="${esc(row.id)}" style="align-items:flex-start">
        <span class="grow" style="line-height:1.45;white-space:pre-wrap;word-break:break-word">${esc(row.text)}</span>
        <button class="btn btn-icon btn-ghost" data-del="${esc(row.id)}" aria-label="Удалить">${icon('trash', 16)}</button>
      </div>
    `).join('');
    favList.querySelectorAll('[data-del]').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.del;
        if (!(await confirmSheet({ title: 'Убрать из избранного?', text: 'Комплимент вернётся в общую ленту.', confirm: 'Убрать', danger: true }))) return;
        removeFavorite(id);
        paintFavorites();
        paintSaveButton();
      };
    });
  }

  saveBtn.onclick = () => {
    if (!current) return;
    const added = addFavorite(current);
    if (added) toast('Сохранено в избранное', 'ok');
    else toast('Уже в избранном');
    paintSaveButton();
    paintFavorites();
  };

  shareBtn.onclick = async () => {
    if (!current) return;
    const ok = await copyText(current);
    toast(ok ? 'Скопировано' : 'Не удалось скопировать', ok ? 'ok' : 'err');
  };

  nextBtn.onclick = () => show(getRandomCompliment());

  show(getRandomCompliment());
  paintFavorites();
  return sheet;
}

// Стили комплиментов. Подключаем один раз.
if (typeof document !== 'undefined' && !document.getElementById('compliments-styles')) {
  const style = document.createElement('style');
  style.id = 'compliments-styles';
  style.textContent = `
  .compliment-card{border:none;border-radius:20px;padding:28px 22px;text-align:center;color:#fff;background:linear-gradient(135deg,#3a2c4a,#7c5a8a);box-shadow:0 12px 32px -16px rgba(0,0,0,.5);transition:background .4s}
  .compliment-glyph{display:inline-flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.16);color:#fff;margin-bottom:14px}
  .compliment-text{margin:0;font-size:20px;line-height:1.4;font-weight:600;letter-spacing:.1px}
  .compliment-card .btn{background:rgba(255,255,255,.16);color:#fff;border-color:rgba(255,255,255,.2)}
  .compliment-card .btn:hover{background:rgba(255,255,255,.24)}
  .compliment-card .btn-primary{background:rgba(255,255,255,.92);color:#2a2233;border-color:transparent}
  .compliment-fav .grow{font-size:14px}
  `;
  document.head.appendChild(style);
}
