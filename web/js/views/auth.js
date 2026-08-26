import { api, setUser } from '../store.js';
import { el, esc } from '../util.js';
import { icon, logoMark } from '../icons.js';
import { toast } from '../ui.js';

export function renderAuth(root, done) {
  let mode = 'login';
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
      <input class="input" data-username placeholder="Юзернейм, например vanya8" autocomplete="username">
      ${mode === 'register' ? '<input class="input" data-name placeholder="Как тебя называть" autocomplete="nickname">' : ''}
      <input class="input" type="password" data-password placeholder="Пароль" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}">
      <button class="btn btn-primary" data-submit>${mode === 'login' ? 'Войти' : 'Создать аккаунт'}</button>
      <p class="tiny muted center" style="margin:0;line-height:1.5">${mode === 'login' ? 'Нет аккаунта? Переключись на регистрацию' : 'Минимум 8 символов в пароле. Данные остаются приватными'}</p>`;

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
          : await api.register({ username, displayName: displayName || username, password });
        setUser(result.user);
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
      view.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b === button));
      draw();
    };
  });
  view.querySelector('[data-guest]').onclick = () => done();
  draw();
}
