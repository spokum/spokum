import { api, state, setUser, applyAppearance, isPremium, PREMIUM_PERKS } from '../store.js';
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
  ['gold', 'Золото', 'linear-gradient(140deg,#1f1a10,#4a3c1c)', '#f2e8d2', true]
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
  themes.innerHTML = THEMES.map(
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
    pushState.textContent = inApp ? 'Выключены в настройках телефона' : 'Нажмите, чтобы включить';
  };
  paintPush();

  root.querySelector('[data-push]').onclick = async () => {
    const { askSystemPermission } = await import('./notifications.js');
    if (window.SpokumHost) {
      toast('Разрешение спрашивает сам телефон. Если отказали — включите СпокУм в настройках уведомлений', 'err');
      paintPush();
      return;
    }
    const ok = await askSystemPermission();
    toast(ok ? 'Уведомления включены' : 'Разрешение не выдано', ok ? '' : 'err');
    paintPush();
  };

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
