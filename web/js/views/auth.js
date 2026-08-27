import { api, setUser } from '../store.js';
import { el, esc, initials } from '../util.js';
import { icon, logoMark } from '../icons.js';
import { toast, pickImage } from '../ui.js';

function humanError(message) {
  const text = String(message || '');
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(text)) return 'не отвечает';
  if (/abort|timeout|timed out/i.test(text)) return 'слишком долго не отвечает';
  return text;
}

async function probe(label, run) {
  const started = Date.now();
  const spent = () => `${((Date.now() - started) / 1000).toFixed(1)} с`;
  try {
    return { label, ok: true, detail: `${await run()} · ${spent()}` };
  } catch (error) {
    return { label, ok: false, detail: `${humanError(error.message)} · ${spent()}` };
  }
}

async function runDiagnostics() {
  const { openSheet } = await import('../ui.js');
  const body = el('<div class="col"><div class="small muted center">Проверяем</div></div>');
  openSheet('Проверка связи', body);

  const url = String(window.SPOKUM_SUPABASE_URL || '').replace(/\/$/, '');
  const key = window.SPOKUM_SUPABASE_KEY || '';
  const results = [];

  results.push({
    label: 'Настройки приложения',
    ok: !!(url && key),
    detail: url && key ? 'на месте' : 'не заданы'
  });

  results.push({
    label: 'Модуль связи',
    ok: !!window.supabase?.createClient,
    detail: window.supabase?.createClient ? 'загружен' : 'не загрузился'
  });

  results.push({
    label: 'Сеть устройства',
    ok: navigator.onLine,
    detail: navigator.onLine ? 'есть' : 'нет'
  });

  if (url && key) {
    results.push(await probe('Сервер', async () => {
      const response = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key } });
      return response.ok ? 'отвечает' : `не отвечает, код ${response.status}`;
    }));

    results.push(await probe('Данные', async () => {
      const response = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` }
      });
      if (!response.ok) throw new Error(`недоступны, код ${response.status}`);
      return 'читаются';
    }));
  }

  body.innerHTML = `
    <div class="col" style="gap:8px">
      ${results.map((row) => `
        <div class="card" style="padding:12px">
          <div class="row" style="gap:10px">
            <span style="color:${row.ok ? 'var(--accent)' : '#c98b8b'}">${icon(row.ok ? 'check' : 'close', 16)}</span>
            <div class="grow"><div class="small strong">${esc(row.label)}</div>
            <div class="tiny muted" style="margin-top:2px;word-break:break-all">${esc(row.detail)}</div></div>
          </div>
        </div>`).join('')}
    </div>
    <p class="tiny muted" style="margin:4px 0 0">Если сервер не отвечает, попробуйте позже или напишите администратору.</p>`;
}

export function renderAuth(root, done) {
  let mode = 'login';
  let avatar = null;
  const view = el(`
    <div class="auth-wrap">
      <div class="auth-card card appear">
        <div class="auth-logo">${logoMark(34)}</div>
        <div class="center">
          <div class="strong" style="font-size:24px;letter-spacing:-.02em">СпокУм</div>
          <div class="small muted" style="margin-top:6px">Соцсеть, где настроение важнее охватов</div>
        </div>
        <div class="tabs" style="margin:20px 0 16px">
          <button class="tab active" data-mode="login">Вход</button>
          <button class="tab" data-mode="register">Регистрация</button>
        </div>
        <div class="col" data-form></div>
        <div class="divider"></div>
        <button class="btn btn-ghost" data-guest style="width:100%">${icon('eye', 17)} Посмотреть без входа</button>
        <button class="btn btn-ghost btn-sm" data-check style="width:100%;margin-top:6px;color:var(--muted)">${icon('compass', 15)} Проверить связь</button>
      </div>
    </div>`);
  root.innerHTML = '';
  root.appendChild(view);

  const form = view.querySelector('[data-form]');

  const draw = () => {
    form.innerHTML = `
      ${mode === 'register' ? `<div class="row" style="justify-content:center;gap:12px">
        <div data-avatar></div>
        <button class="btn btn-sm" type="button" data-pick>${icon('image', 16)} Фото профиля</button>
      </div>` : ''}
      <input class="input" data-username placeholder="Юзернейм, например vanya8" autocomplete="username">
      ${mode === 'register' ? '<input class="input" data-name placeholder="Как тебя называть" autocomplete="nickname">' : ''}
      <input class="input" type="password" data-password placeholder="Пароль" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}">
      <button class="btn btn-primary" data-submit>${mode === 'login' ? 'Войти' : 'Создать аккаунт'}</button>
      <p class="tiny muted center" style="margin:0;line-height:1.5">${mode === 'login' ? 'Нет аккаунта? Переключись на регистрацию' : 'Минимум 8 символов в пароле. Данные остаются приватными'}</p>
      ${mode === 'register' ? '<p class="tiny muted center" style="margin:0;line-height:1.5">Создавая аккаунт, вы соглашаетесь с <button type="button" class="link-btn" data-rules>правилами СпокУма</button></p>' : ''}`;

    form.querySelector('[data-rules]')?.addEventListener('click', async () => {
      const { openRules } = await import('./rules.js');
      openRules();
    });

    const preview = form.querySelector('[data-avatar]');
    const drawAvatar = () => {
      if (!preview) return;
      const name = form.querySelector('[data-name]')?.value || form.querySelector('[data-username]')?.value || '';
      preview.innerHTML = avatar
        ? `<div class="avatar avatar-54" style="--h:220"><img src="${esc(avatar)}" alt=""></div>`
        : `<div class="avatar avatar-54" style="--h:220">${esc(initials(name) === '?' ? '' : initials(name))}</div>`;
    };
    drawAvatar();

    form.querySelector('[data-pick]')?.addEventListener('click', async () => {
      const image = await pickImage(500);
      if (image) {
        avatar = image;
        drawAvatar();
      }
    });
    form.querySelector('[data-name]')?.addEventListener('input', drawAvatar);
    form.querySelector('[data-username]')?.addEventListener('input', drawAvatar);

    const submit = async () => {
      const username = form.querySelector('[data-username]').value.trim();
      const password = form.querySelector('[data-password]').value;
      const displayName = form.querySelector('[data-name]')?.value.trim();
      if (!username || !password) return toast('Заполните поля', 'err');
      const button = form.querySelector('[data-submit]');
      const label = button.textContent;
      button.disabled = true;
      button.textContent = mode === 'login' ? 'Входим' : 'Создаём аккаунт';
      try {
        const result = mode === 'login'
          ? await api.login({ username, password })
          : await api.register({ username, displayName: displayName || username, password, avatar });
        setUser(result.user);
        if (mode === 'register' && avatar) {
          try {
            const { user } = await api.updateMe({ avatar });
            setUser(user);
          } catch {}
        }
        try {
          const { deviceInfo, rememberBlock } = await import('../device.js');
          const info = await deviceInfo();
          const { state: ban } = await api.touchDevice(info, mode === 'register');
          rememberBlock(ban);
          if (ban?.blocked) {
            await api.logout?.();
            setUser(null);
            toast(ban.forever || !ban.until ? 'Это устройство заблокировано навсегда' : 'Это устройство заблокировано', 'err');
            location.reload();
            return;
          }
        } catch {}
        try {
          const { rememberCurrent } = await import('../accounts.js');
          await rememberCurrent();
        } catch {}
        done();
      } catch (error) {
        toast(error.message, 'err');
      } finally {
        button.disabled = false;
        button.textContent = label;
      }
    };

    form.querySelector('[data-submit]').onclick = submit;
    form.querySelectorAll('input').forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') submit();
      });
    });
  };

  view.querySelectorAll('[data-mode]').forEach((button) => {
    button.onclick = () => {
      mode = button.dataset.mode;
      avatar = null;
      view.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b === button));
      draw();
    };
  });
  view.querySelector('[data-guest]').onclick = () => done();
  view.querySelector('[data-check]').onclick = () => runDiagnostics();
  draw();
}
