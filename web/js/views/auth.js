import { api, setUser } from '../store.js';
import { el, esc, initials } from '../util.js';
import { icon, logoMark } from '../icons.js';
import { toast, pickImage } from '../ui.js';

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
      <p class="tiny muted center" style="margin:0;line-height:1.5">${mode === 'login' ? 'Нет аккаунта? Переключись на регистрацию' : 'Минимум 8 символов в пароле. Данные остаются приватными'}</p>`;

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
      button.disabled = true;
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
        done();
      } catch (error) {
        toast(error.message, 'err');
      } finally {
        button.disabled = false;
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
  draw();
}
