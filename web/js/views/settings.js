import { api, state, setUser, applyAppearance, isPremium, isBeta, myTheme, saveMyTheme, PREMIUM_PERKS } from '../store.js';
import { el, esc, fullDate, timeAgo } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, confirmSheet, emptyState } from '../ui.js';

const THEMES = [
  ['calm', 'Спокойная', 'linear-gradient(140deg,#161b22,#242c36)', '#dde2e8', false],
  ['paper', 'Бумага', 'linear-gradient(140deg,#fbfaf8,#e6e4de)', '#23272e', false],
  ['deep', 'Глубина', 'linear-gradient(140deg,#191624,#2c2640)', '#e2dded', false],
  ['dawn', 'Рассвет', 'linear-gradient(140deg,#1f1a16,#3a2c22)', '#ece2d9', false],
  ['neon', 'Неон', 'linear-gradient(140deg,#0d1220,#1b2f52)', '#5be6c7', false],
  ['forest', 'Лес', 'linear-gradient(140deg,#16211c,#22352b)', '#cfe0d4', false],
  ['sand', 'Песок', 'linear-gradient(140deg,#fdfaf4,#e8e0d1)', '#2c2721', false],
  ['aurora', 'Аврора', 'linear-gradient(140deg,#101d23,#1d3f42)', '#8fe3c8', true],
  ['sunset', 'Закат', 'linear-gradient(140deg,#211622,#4a2436)', '#e8a9a0', true],
  ['royal', 'Королевская', 'linear-gradient(140deg,#151130,#3a2a6b)', '#d8b45c', true],
  ['abyss', 'Бездна', 'linear-gradient(140deg,#000000,#0d1418)', '#7fd7e8', true],
  ['ember', 'Угли', 'linear-gradient(140deg,#211714,#43231a)', '#f0ded2', false],
  ['mint', 'Мята', 'linear-gradient(140deg,#ffffff,#dcece3)', '#1e2b26', false],
  ['storm', 'Гроза', 'linear-gradient(140deg,#151d23,#283a45)', '#dde8ef', false],
  ['ink', 'Чернила', 'linear-gradient(140deg,#05070a,#141c26)', '#e6ebf2', true],
  ['rose', 'Роза', 'linear-gradient(140deg,#261923,#4a2440)', '#f2dfe8', true],
  ['gold', 'Золото', 'linear-gradient(140deg,#1f1a10,#4a3c1c)', '#f2e8d2', true],
  ['autumn', 'Осень', 'linear-gradient(140deg,#17110c,#3a2413)', '#efe0cf', false, true],
  ['rain', 'Дождь', 'linear-gradient(140deg,#0e1418,#22323c)', '#d8e3ea', false, true],
  ['cocoa', 'Какао', 'linear-gradient(140deg,#140f0d,#33221c)', '#e8dbd2', false, true],
  ['lilac', 'Сирень', 'linear-gradient(140deg,#f4f2f8,#ddd6ee)', '#2a2437', false, true],
  ['carbon', 'Карбон', 'linear-gradient(140deg,#0c0d0f,#1b1e22)', '#dcdfe4', false, true],
  ['pearl', 'Жемчуг', 'linear-gradient(140deg,#eef1f4,#ffffff)', '#1f2933', true, true],
  ['emerald', 'Изумруд', 'linear-gradient(140deg,#071411,#134034)', '#d6ece4', true, true],
  ['nebula', 'Туманность', 'linear-gradient(140deg,#0a0817,#2a1d5c)', '#e2ddf5', true, true]
];

const ACCENTS = [
  ['mint', '#87b7a3', false],
  ['violet', '#9c93c2', false],
  ['coral', '#c79486', false],
  ['sky', '#8badca', false],
  ['amber', '#c6b083', false],
  ['slate', '#93a2ae', false],
  ['moss', '#9bb37f', false],
  ['gold', '#d8b45c', true],
  ['rose', '#d98fae', true],
  ['ice', '#7fd7e8', true]
];

const PREF_KEY = 'spokum.prefs.v1';

export function applyComfort() {
  const saved = prefs();
  const root = document.body;
  root.classList.toggle('big-text', !!saved.bigtext);
  root.classList.toggle('high-contrast', !!saved.contrast);
  root.classList.toggle('still', !!saved.still);
}

export function applyNight() {
  let want = false;
  try {
    want = !!JSON.parse(localStorage.getItem(PREF_KEY) || '{}').night;
  } catch {}
  const hour = new Date().getHours();
  document.body.classList.toggle('night-soft', want && (hour >= 23 || hour < 7));
}


function prefs() {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY)) || {};
  } catch {
    return {};
  }
}

function setPref(key, value) {
  const all = prefs();
  all[key] = value;
  localStorage.setItem(PREF_KEY, JSON.stringify(all));
}

export async function render(root) {
  const current = prefs();
  root.innerHTML = `
    <div class="topbar">
      <div><h1>Настройки</h1><p class="sub">Подстрой под себя</p></div>
    </div>

    <div class="card appear">
      <div class="row" style="margin-bottom:12px">${icon('palette', 18)}<span class="strong small">Тема</span></div>
      <div class="theme-swatches" data-themes></div>
      <div class="divider"></div>
      <div class="small" style="margin-bottom:10px">Акцент</div>
      <div class="accent-row" data-accents></div>
      <div class="divider"></div>
      ${isBeta(state.user) ? `<button class="list-item" data-mine>${icon('palette', 18)}<div class="grow"><div class="small strong">Своя тема</div><div class="tiny muted">Соберите оформление под себя</div></div>${icon('forward', 15)}</button>` : ''}
    </div>

    ${premiumCard()}

    <div class="card appear">
      <div class="row" style="margin-bottom:10px">${icon('spark', 18)}<span class="strong small">Интерфейс</span></div>
      <label class="row between" style="padding:8px 0"><span class="small">Компактная лента</span><input type="checkbox" data-pref="compact" ${current.compact ? 'checked' : ''}></label>
      <label class="row between" style="padding:8px 0"><span class="small">Плавные анимации</span><input type="checkbox" data-pref="motion" ${current.motion !== false ? 'checked' : ''}></label>
      <label class="row between" style="padding:8px 0"><span class="small">Звук уведомлений</span><input type="checkbox" data-pref="sound" ${current.sound ? 'checked' : ''}></label>
      <label class="row between" style="padding:8px 0"><span class="small">Звук в видео сразу</span><input type="checkbox" data-video-sound ${localStorage.getItem('spokum.sound') !== 'off' ? 'checked' : ''}></label>
      ${state.user?.isModerator || state.user?.isAdmin
        ? `<label class="row between" style="padding:8px 0"><span class="small">Уведомлять о новых записях</span><input type="checkbox" data-notify-posts ${state.user.notifyPosts !== false ? 'checked' : ''}></label>`
        : ''}
      <label class="row between" style="padding:8px 0"><span class="small">Тихий режим по вечерам</span><input type="checkbox" data-pref="quiet" ${current.quiet ? 'checked' : ''}></label>
      <label class="row between" style="padding:8px 0"><span class="small">Тихая ночь: мягче экран после 23:00</span><input type="checkbox" data-pref="night" ${current.night ? 'checked' : ''}></label>
    </div>

    ${isBeta(state.user) ? `<div class="card appear">
      <div class="row" style="margin-bottom:10px">${icon('eye', 18)}<span class="strong small">Что видно</span></div>
      <button class="list-item" data-mutewords>${icon('search', 18)}<div class="grow"><div class="small strong">Стоп-слова</div><div class="tiny muted" data-mute-count>Записи с этими словами будут свёрнуты</div></div>${icon('forward', 15)}</button>
      <label class="row between" style="padding:8px 0"><span class="small">Крупный текст</span><input type="checkbox" data-pref="bigtext" ${current.bigtext ? 'checked' : ''}></label>
      <label class="row between" style="padding:8px 0"><span class="small">Больше контраста</span><input type="checkbox" data-pref="contrast" ${current.contrast ? 'checked' : ''}></label>
      <label class="row between" style="padding:8px 0"><span class="small">Меньше движения</span><input type="checkbox" data-pref="still" ${current.still ? 'checked' : ''}></label>
    </div>` : ''}

    <div class="card appear">
      <div class="row" style="margin-bottom:10px">${icon('bell', 18)}<span class="strong small">Уведомления</span></div>
      <button class="list-item" data-push>${icon('bell', 18)}<div class="grow"><div class="small strong">Уведомления на телефон</div><div class="tiny muted" data-push-state>Проверяем</div></div>${icon('forward', 15)}</button>
      <div class="tiny muted" style="margin-top:8px;line-height:1.5">Сообщения, звонки, жалобы и решения модераторов будут приходить, даже когда приложение закрыто.</div>
    </div>

    <div class="card appear">
      <div class="row" style="margin-bottom:10px">${icon('shield', 18)}<span class="strong small">Правила</span></div>
      <button class="list-item" data-rules>${icon('feed', 18)}<div class="grow"><div class="small strong">Правила СпокУма</div><div class="tiny muted">Что можно, что нельзя и что за это бывает</div></div>${icon('forward', 15)}</button>
    </div>

    <div class="card appear">
      <div class="row" style="margin-bottom:10px">${icon('lock', 18)}<span class="strong small">Безопасность</span></div>
      <button class="list-item" data-password>${icon('key', 18)}<div class="grow"><div class="small strong">Сменить пароль</div><div class="tiny muted">Другие сессии закроются</div></div>${icon('forward', 15)}</button>
      ${isBeta(state.user) ? `<button class="list-item" data-codes>${icon('key', 18)}<div class="grow"><div class="small strong">Коды восстановления</div><div class="tiny muted" data-codes-state>Три кода на случай забытого пароля</div></div>${icon('forward', 15)}</button>` : ''}
      <button class="list-item" data-sessions>${icon('device', 18)}<div class="grow"><div class="small strong">Активные сессии</div><div class="tiny muted">Где выполнен вход</div></div>${icon('forward', 15)}</button>
    </div>

    <div class="card appear">
      <div class="row" style="margin-bottom:10px">${icon('download', 18)}<span class="strong small">Приложение</span></div>
      <button class="list-item" data-update>${icon('refresh', 18)}<div class="grow"><div class="small strong">Проверить обновление</div><div class="tiny muted">Приложение обновляется само, но можно вручную</div></div>${icon('forward', 15)}</button>
      <div class="tiny muted" style="margin-top:8px;line-height:1.5">Сборка ${esc(window.SpokumHost?.version?.() || 'веб-версия')}</div>
    </div>

    <div class="card appear">
      <div class="row" style="margin-bottom:10px">${icon('compass', 18)}<span class="strong small">Данные</span></div>
      <div class="small muted" style="line-height:1.5">Режим работы: <span class="strong">${api.mode === 'local' ? 'локальный, всё хранится только в этом браузере' : 'сервер СпокУм'}</span></div>
      ${api.mode === 'local' ? '<button class="btn btn-danger" data-reset style="margin-top:12px">Стереть локальные данные</button>' : ''}
    </div>

    <div class="card appear center">
      <div class="strong">СпокУм</div>
      <div class="tiny muted" style="margin-top:4px">Соцсеть про спокойствие и настроение</div>
      <div class="tiny muted" style="margin-top:8px">версия 1.0</div>
    </div>`;

  const premium = isPremium(state.user);
  const themes = root.querySelector('[data-themes]');
  themes.innerHTML = THEMES.filter(([, , , , , beta]) => !beta || isBeta(state.user)).map(
    ([key, label, bg, ink, locked]) => `<button class="swatch ${locked && !premium ? 'locked' : ''}" data-theme="${key}" data-locked="${locked && !premium}" style="background:${bg}" aria-pressed="${document.documentElement.dataset.theme === key}">
      ${locked && !premium ? `<span class="swatch-lock">${icon('lock', 11, 2.4)}</span>` : ''}
      <span style="color:${ink}">${label}</span></button>`
  ).join('');
  themes.querySelectorAll('[data-theme]').forEach((button) => {
    button.onclick = async () => {
      if (button.dataset.locked === 'true') return toast('Тема доступна с подпиской СпокУм Премиум', 'err');
      document.documentElement.dataset.theme = button.dataset.theme;
      localStorage.setItem('spokum.theme', button.dataset.theme);
      themes.querySelectorAll('[data-theme]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      if (state.user) {
        try {
          const { user } = await api.updateMe({ theme: button.dataset.theme });
          setUser(user);
        } catch { applyAppearance(state.user); }
      }
    };
  });

  const accents = root.querySelector('[data-accents]');
  accents.innerHTML = ACCENTS.map(
    ([key, color, locked]) => `<button class="accent-dot ${locked && !premium ? 'locked' : ''}" data-accent="${key}" data-locked="${locked && !premium}" style="background:${color}" aria-pressed="${document.documentElement.dataset.accent === key}"></button>`
  ).join('');
  accents.querySelectorAll('[data-accent]').forEach((button) => {
    button.onclick = async () => {
      if (button.dataset.locked === 'true') return toast('Цвет доступен с подпиской СпокУм Премиум', 'err');
      document.documentElement.dataset.accent = button.dataset.accent;
      localStorage.setItem('spokum.accent', button.dataset.accent);
      accents.querySelectorAll('[data-accent]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      if (state.user) {
        try {
          const { user } = await api.updateMe({ accent: button.dataset.accent });
          setUser(user);
        } catch { applyAppearance(state.user); }
      }
    };
  });

  root.querySelector('[data-notify-posts]')?.addEventListener('change', async (event) => {
    try {
      const { user } = await api.updateMe({ notifyPosts: event.target.checked });
      setUser(user);
      toast(event.target.checked ? 'Будем сообщать о новых записях' : 'Уведомления о записях выключены');
    } catch (error) {
      event.target.checked = !event.target.checked;
      toast(error.message, 'err');
    }
  });

  const pushState = root.querySelector('[data-push-state]');
  const paintPush = async () => {
    const { systemAllowed } = await import('./notifications.js');
    const inApp = !!window.SpokumHost;
    if (systemAllowed()) {
      pushState.textContent = inApp ? 'Включены' : 'Включены в этом браузере';
      return;
    }
    if (!inApp && 'Notification' in window && Notification.permission === 'denied') {
      pushState.textContent = 'Запрещены — включите в настройках браузера';
      return;
    }
    pushState.textContent = 'Нажмите, чтобы включить';
  };
  paintPush();

  root.querySelector('[data-push]').onclick = async () => {
    const { askSystemPermission, systemAllowed, canAskAgain } = await import('./notifications.js');
    if (systemAllowed()) {
      toast('Уведомления уже включены');
      return;
    }
    if (!canAskAgain()) {
      if (window.SpokumHost?.notifySettings) {
        window.SpokumHost.notifySettings();
        paintPush();
        return;
      }
      toast('Разрешение закрыто в настройках браузера, включите его там', 'err');
      return;
    }
    const ok = await askSystemPermission();
    toast(ok ? 'Уведомления включены' : 'Разрешение не выдано', ok ? '' : 'err');
    paintPush();
  };

  const codeState = root.querySelector('[data-codes-state]');
  if (api.recoveryState && state.user) {
    api.recoveryState().then((info) => {
      if (!codeState) return;
      codeState.textContent = info?.total
        ? `Готово кодов: ${info.total} из 3`
        : 'Коды ещё не созданы, пароль восстановить нельзя';
    }).catch(() => {});
  }
  const muteCount = root.querySelector('[data-mute-count]');
  import('./feed.js').then(({ muteWords }) => {
    const list = muteWords();
    if (muteCount && list.length) muteCount.textContent = `Слов в списке: ${list.length}`;
  }).catch(() => {});
  root.querySelector('[data-mutewords]')?.addEventListener('click', () => openMuteWords(() => render(root)));
  root.querySelector('[data-mine]')?.addEventListener('click', () => openMyTheme(() => render(root)));
  root.querySelector('[data-codes]')?.addEventListener('click', () => openCodes(() => render(root)));

  root.querySelector('[data-rules]').onclick = async () => {
    const { openRules } = await import('./rules.js');
    openRules();
  };

  root.querySelector('[data-video-sound]').onchange = (event) => {
    localStorage.setItem('spokum.sound', event.target.checked ? 'on' : 'off');
    toast(event.target.checked ? 'Видео будут со звуком' : 'Видео будут без звука');
  };

  root.querySelector('[data-buy]')?.addEventListener('click', openBilling);

  root.querySelector('[data-update]').onclick = () => {
    if (window.SpokumHost?.checkUpdate) {
      window.SpokumHost.checkUpdate();
      toast('Проверяем обновление');
      return;
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((list) => list.forEach((registration) => registration.update()));
    }
    toast('Сайт обновляется сам при перезагрузке');
  };

  root.querySelectorAll('[data-pref]').forEach((box) => {
    box.onchange = () => {
      setPref(box.dataset.pref, box.checked);
      if (box.dataset.pref === 'motion') {
        document.documentElement.style.setProperty('--ease', box.checked ? 'cubic-bezier(.22,.61,.36,1)' : 'linear');
      }
      if (box.dataset.pref === 'night') applyNight();
      applyComfort();
      toast('Сохранено');
    };
  });

  root.querySelector('[data-password]').onclick = openPassword;
  root.querySelector('[data-sessions]').onclick = openSessions;
  root.querySelector('[data-reset]')?.addEventListener('click', async () => {
    if (!(await confirmSheet({ title: 'Стереть данные', text: 'Все локальные аккаунты, посты и чаты будут удалены', confirm: 'Стереть', danger: true }))) return;
    const { local } = await import('../backend/local.js');
    local.reset();
    location.reload();
  });
}



const MY_ACCENTS = ['#87b7a3', '#9c93c2', '#c79486', '#8badca', '#c6b083', '#d98fae', '#7fd7e8', '#d8b45c', '#9bb37f', '#e08f6a'];


async function openMuteWords(done) {
  const { muteWords, saveMuteWords } = await import('./feed.js');
  let list = muteWords();
  const body = el(`<div class="col">
    <p class="small" style="margin:0;line-height:1.55">Записи с этими словами будут свёрнуты под серую плашку. Открыть их всё равно можно, но они не появятся неожиданно.</p>
    <div class="row" style="gap:8px">
      <input class="input grow" data-word placeholder="Например: политика">
      <button class="btn btn-primary" data-add>${icon('plus', 16)}</button>
    </div>
    <div class="chips" data-list></div>
  </div>`);
  const sheet = openSheet('Стоп-слова', body);
  const chips = body.querySelector('[data-list]');
  const draw = () => {
    chips.innerHTML = list.length
      ? list.map((word) => `<button class="chip" data-drop="${esc(word)}">${esc(word)} ${icon('close', 12)}</button>`).join('')
      : '<div class="tiny muted">Список пуст</div>';
    chips.querySelectorAll('[data-drop]').forEach((button) => {
      button.onclick = () => {
        list = list.filter((word) => word !== button.dataset.drop);
        saveMuteWords(list);
        draw();
        done?.();
      };
    });
  };
  const add = () => {
    const input = body.querySelector('[data-word]');
    const word = input.value.trim().toLowerCase();
    if (!word) return;
    if (word.length < 2) return toast('Слишком коротко', 'err');
    if (list.includes(word)) return toast('Уже в списке', 'err');
    list = [...list, word];
    saveMuteWords(list);
    input.value = '';
    draw();
    done?.();
  };
  body.querySelector('[data-add]').onclick = add;
  body.querySelector('[data-word]').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') add();
  });
  draw();
  void sheet;
}

function openMyTheme(done) {
  if (!isPremium(state.user)) return toast('Своя тема доступна с подпиской СпокУм Премиум', 'err');
  let mine = myTheme();
  const body = el(`<div class="col">
    <p class="small" style="margin:0;line-height:1.55">Соберите оформление под себя. Тема живёт на этом устройстве и включается как обычная.</p>
    <div class="row" style="gap:8px">
      <button class="btn grow" data-dark>Тёмная</button>
      <button class="btn grow" data-light>Светлая</button>
    </div>
    <div>
      <div class="tiny muted" style="margin-bottom:6px">Оттенок фона</div>
      <input type="range" class="range" data-hue min="0" max="359" value="${mine.hue}">
    </div>
    <div>
      <div class="tiny muted" style="margin-bottom:6px">Насыщенность</div>
      <input type="range" class="range" data-tint min="0" max="40" value="${mine.tint ?? 14}">
    </div>
    <div>
      <div class="tiny muted" style="margin-bottom:8px">Акцент</div>
      <div class="accent-row" data-colors></div>
    </div>
    <div class="card" data-preview style="padding:14px">
      <div class="strong small">Как это выглядит</div>
      <p class="tiny muted" style="margin:6px 0 10px;line-height:1.5">Тихий вечер, чай и никаких срочных дел.</p>
      <button class="btn btn-primary btn-sm" type="button">Кнопка</button>
    </div>
    <button class="btn btn-primary" data-use>${icon('palette', 17)} Включить свою тему</button>
  </div>`);
  const sheet = openSheet('Своя тема', body);
  const colors = body.querySelector('[data-colors]');
  const preview = body.querySelector('[data-preview]');

  const paint = () => {
    body.querySelector('[data-dark]').classList.toggle('btn-primary', mine.dark);
    body.querySelector('[data-light]').classList.toggle('btn-primary', !mine.dark);
    colors.innerHTML = MY_ACCENTS.map(
      (color) => `<button class="accent-dot" data-color="${color}" aria-pressed="${color === mine.accent}" style="background:${color}"></button>`
    ).join('');
    colors.querySelectorAll('[data-color]').forEach((button) => {
      button.onclick = () => {
        mine = saveMyTheme({ accent: button.dataset.color });
        paint();
      };
    });
    const tint = Math.min(40, mine.tint ?? 14);
    preview.style.background = mine.dark ? `hsl(${mine.hue} ${tint}% 11%)` : `hsl(${mine.hue} ${Math.min(30, tint + 8)}% 99%)`;
    preview.style.color = mine.dark ? `hsl(${mine.hue} 18% 90%)` : `hsl(${mine.hue} 22% 16%)`;
    preview.style.borderColor = mine.dark ? 'rgba(255,255,255,.12)' : 'rgba(20,25,35,.12)';
    preview.querySelector('.btn').style.background = mine.accent;
    preview.querySelector('.btn').style.color = mine.dark ? '#08110e' : '#ffffff';
  };

  body.querySelector('[data-dark]').onclick = () => {
    mine = saveMyTheme({ dark: true });
    paint();
  };
  body.querySelector('[data-light]').onclick = () => {
    mine = saveMyTheme({ dark: false });
    paint();
  };
  body.querySelector('[data-hue]').addEventListener('input', (event) => {
    mine = saveMyTheme({ hue: Number(event.target.value) });
    paint();
  });
  body.querySelector('[data-tint]').addEventListener('input', (event) => {
    mine = saveMyTheme({ tint: Number(event.target.value) });
    paint();
  });
  body.querySelector('[data-use]').onclick = async () => {
    setPref('theme', 'mine');
    const patch = { theme: 'mine' };
    if (state.user) {
      setUser({ ...state.user, ...patch });
      applyAppearance(state.user);
      api.updateMe(patch).catch(() => {});
    } else {
      applyAppearance(null);
    }
    sheet.close();
    toast('Своя тема включена');
    done?.();
  };
  paint();
}

async function openCodes(done) {
  if (!state.user) return toast('Сначала войдите', 'err');
  if (!api.recoveryMake) return toast('Коды появятся, когда база будет обновлена', 'err');
  const body = el(`<div class="col">
    <p class="small" style="margin:0;line-height:1.55">Три одноразовых кода на случай, если забудете пароль. Один код открывает вход один раз и просит придумать новый пароль.</p>
    <div class="card" style="padding:12px;background:var(--surface)">
      <div class="tiny muted">Куда сохранить</div>
      <div class="tiny muted" style="margin-top:6px;line-height:1.5">Запишите на бумаге, в заметках или в переписке с самим собой. Никому не показывайте: код это тот же пароль.</div>
    </div>
    <div data-list></div>
    <button class="btn btn-primary" data-make>${icon('key', 17)} Создать новые коды</button>
    <p class="tiny muted" style="margin:0;line-height:1.5">Создание новых кодов гасит старые.</p>
  </div>`);
  const sheet = openSheet('Коды восстановления', body);
  const list = body.querySelector('[data-list]');
  const button = body.querySelector('[data-make]');

  const show = (codes) => {
    list.innerHTML = `<div class="card code-card">
      ${codes.map((code) => `<div class="code-row"><span class="code-value">${esc(code)}</span></div>`).join('')}
      <button class="btn btn-sm" data-copy style="width:100%;margin-top:10px">${icon('share', 15)} Скопировать все</button>
    </div>`;
    list.querySelector('[data-copy]').onclick = () => {
      navigator.clipboard?.writeText(codes.join('\n'));
      toast('Скопировано');
    };
  };

  button.onclick = async () => {
    const ok = await confirmSheet({
      title: 'Создать коды',
      text: 'Старые коды перестанут работать. Новые покажем один раз.',
      confirm: 'Создать'
    });
    if (!ok) return;
    button.disabled = true;
    try {
      const { codes } = await api.recoveryMake();
      show(codes);
      button.textContent = 'Создать заново';
      toast('Сохраните коды, второй раз мы их не покажем');
      done?.();
    } catch (error) {
      toast(error.message, 'err');
    }
    button.disabled = false;
  };
  void sheet;
}

function premiumCard() {
  const user = state.user;
  const active = isPremium(user);
  const perks = PREMIUM_PERKS
    .map(([glyph, title, text]) => `<div class="row" style="align-items:flex-start;gap:10px;padding:6px 0">
      <span style="color:${active ? '#d8b45c' : 'var(--muted)'}">${icon(glyph, 17)}</span>
      <div class="grow"><div class="small strong">${esc(title)}</div><div class="tiny muted">${esc(text)}</div></div></div>`)
    .join('');

  const head = active
    ? `<div class="tiny muted">Действует до ${esc(new Date(user.premiumUntil).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }))}</div>
       ${user.premiumReason ? `<div class="tiny muted" style="margin-top:2px">Выдан за: ${esc(user.premiumReason)}</div>` : ''}`
    : '<div class="tiny muted">Подписку выдаёт администрация за вклад в сообщество</div>';

  return `<div class="card appear ${active ? 'premium-card' : ''}">
    <div class="row" style="margin-bottom:8px">
      <span style="color:${active ? '#d8b45c' : 'var(--muted)'}">${icon('crown', 18)}</span>
      <div class="grow"><span class="strong small">СпокУм Премиум</span></div>
      <span class="pill ${active ? 'warn' : ''}">${active ? 'активен' : 'нет'}</span>
    </div>
    ${head}
    <button class="btn btn-primary" data-buy style="margin-top:12px">${icon('crown', 16)} ${active ? 'Продлить премиум' : 'Оформить премиум'}</button>
    <div class="divider"></div>
    ${perks}
  </div>`;
}

const BOT_NAME = 'spokum_bot';

export async function openBilling() {
  if (!state.user) return toast('Сначала войдите', 'err');
  if (!api.linkCode) return toast('Оплата появится, когда база будет обновлена', 'err');
  const body = el(`<div class="col">
    <p class="small" style="margin:0;line-height:1.55">Премиум оформляется в нашем боте: оплата звёздами Telegram, подписка включается сразу.</p>
    <div class="card" style="padding:12px;background:var(--surface)">
      <div class="tiny muted">Тарифы</div>
      <div class="col" style="gap:4px;margin-top:8px">
        ${[
          ['День', 10],
          ['Два дня', 20],
          ['Три дня', 30],
          ['Неделя', 70],
          ['Месяц', 200],
          ['Три месяца', 550],
          ['Полгода', 500],
          ['Год', 1000]
        ]
          .map(([label, stars]) => `<div class="row between"><span class="small">${label}</span><span class="small strong">${stars} звёзд</span></div>`)
          .join('')}
      </div>
    </div>
    <button class="btn btn-primary" data-go>${icon('forward', 16)} Открыть бота</button>
    <p class="tiny muted" style="margin:0;line-height:1.5">Бот сам поймёт, какому аккаунту выдавать премиум. Ссылка живёт двадцать минут.</p>
  </div>`);
  const sheet = openSheet('СпокУм Премиум', body);
  const go = body.querySelector('[data-go]');
  go.onclick = async () => {
    go.disabled = true;
    go.textContent = 'Готовим ссылку';
    try {
      const { code } = await api.linkCode();
      sheet.close();
      window.open(`https://t.me/${BOT_NAME}?start=${encodeURIComponent(code)}`, '_blank', 'noopener');
    } catch (error) {
      go.disabled = false;
      go.textContent = 'Открыть бота';
      toast(error.message, 'err');
    }
  };
}

function openPassword() {
  if (!state.user) return toast('Сначала войдите', 'err');
  const body = el(`
    <div class="col">
      <input class="input" type="password" data-current placeholder="Текущий пароль">
      <input class="input" type="password" data-next placeholder="Новый пароль, минимум 8 символов">
      <input class="input" type="password" data-repeat placeholder="Повторите новый пароль">
      <button class="btn btn-primary" data-save>Сменить пароль</button>
    </div>`);
  const sheet = openSheet('Смена пароля', body);
  body.querySelector('[data-save]').onclick = async () => {
    const current = body.querySelector('[data-current]').value;
    const next = body.querySelector('[data-next]').value;
    const repeat = body.querySelector('[data-repeat]').value;
    if (next !== repeat) return toast('Пароли не совпадают', 'err');
    try {
      await api.changePassword({ current, next });
      sheet.close();
      toast('Пароль обновлён');
    } catch (error) {
      toast(error.message, 'err');
    }
  };
}

async function openSessions() {
  if (!state.user) return toast('Сначала войдите', 'err');
  const body = el('<div class="col" style="gap:6px"></div>');
  const sheet = openSheet('Активные сессии', body);
  const draw = async () => {
    const { sessions } = await api.sessions();
    body.innerHTML = sessions.length
      ? sessions
          .map(
            (s) => `<div class="list-item">${icon('device', 18)}
              <div class="grow"><div class="small strong">${esc(shortAgent(s.agent))}${s.current ? ' · это устройство' : ''}</div>
              <div class="tiny muted">вход ${fullDate(s.createdAt)} · активность ${timeAgo(s.lastSeen)}</div></div>
              ${s.current ? '' : `<button class="btn btn-sm btn-danger" data-drop="${esc(s.id)}">Закрыть</button>`}</div>`
          )
          .join('')
      : emptyState('device', 'Сессий нет', 'Похоже, вход только здесь');
    body.querySelectorAll('[data-drop]').forEach((button) => {
      button.onclick = async () => {
        await api.dropSession(button.dataset.drop);
        toast('Сессия закрыта');
        draw();
      };
    });
  };
  await draw();
}

function shortAgent(agent) {
  if (!agent) return 'Неизвестное устройство';
  if (/iPhone|iPad/i.test(agent)) return 'iOS';
  if (/Android/i.test(agent)) return 'Android';
  if (/Firefox/i.test(agent)) return 'Firefox';
  if (/Edg/i.test(agent)) return 'Edge';
  if (/Chrome/i.test(agent)) return 'Chrome';
  if (/Safari/i.test(agent)) return 'Safari';
  return agent.slice(0, 28);
}
