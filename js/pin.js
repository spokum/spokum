const PIN_KEY = 'spokum.pin.v1';

async function pinHash(code) {
  const data = new TextEncoder().encode('spokum:' + code);
  const sum = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(sum)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function pinOn() {
  return !!localStorage.getItem(PIN_KEY);
}

export async function pinSet(code) {
  if (!/^\d{4,6}$/.test(String(code || ''))) throw new Error('Код это от четырёх до шести цифр');
  localStorage.setItem(PIN_KEY, await pinHash(code));
}

export function pinOff() {
  localStorage.removeItem(PIN_KEY);
}

export async function pinCheck(code) {
  const saved = localStorage.getItem(PIN_KEY);
  if (!saved) return true;
  return saved === (await pinHash(code));
}

export function askPin(host) {
  return new Promise((done) => {
    let typed = '';
    let wrong = 0;
    host.innerHTML = `
      <div class="auth-wrap">
        <div class="pin-box">
          <div class="pin-logo"></div>
          <div class="strong" style="font-size:17px">Введите код</div>
          <div class="tiny muted" data-hint style="margin-top:4px">Код от приложения, вы задали его в настройках</div>
          <div class="pin-dots" data-dots></div>
          <div class="pin-pad" data-pad></div>
        </div>
      </div>`;
    const dots = host.querySelector('[data-dots]');
    const pad = host.querySelector('[data-pad]');
    const hint = host.querySelector('[data-hint]');

    const paint = () => {
      dots.innerHTML = Array.from({ length: 6 }, (_, i) => `<i class="${i < typed.length ? 'on' : ''}"></i>`).join('');
    };

    const tryCode = async () => {
      if (await pinCheck(typed)) {
        done(true);
        return;
      }
      wrong += 1;
      typed = '';
      paint();
      host.querySelector('.pin-box').classList.add('shake');
      setTimeout(() => host.querySelector('.pin-box')?.classList.remove('shake'), 400);
      hint.textContent = wrong >= 3 ? 'Код не подходит. Можно выйти и войти заново по паролю' : 'Код не подходит';
    };

    pad.innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'off', '0', 'back']
      .map((key) => {
        if (key === 'off') return '<button class="pin-key ghost" data-key="off">Выйти</button>';
        if (key === 'back') return '<button class="pin-key ghost" data-key="back">Стереть</button>';
        return `<button class="pin-key" data-key="${key}">${key}</button>`;
      })
      .join('');

    pad.querySelectorAll('[data-key]').forEach((button) => {
      button.onclick = async () => {
        const key = button.dataset.key;
        if (key === 'back') {
          typed = typed.slice(0, -1);
          paint();
          return;
        }
        if (key === 'off') {
          done(false);
          return;
        }
        if (typed.length >= 6) return;
        typed += key;
        paint();
        if (typed.length >= 4) {
          const saved = localStorage.getItem(PIN_KEY);
          if (saved && saved === (await pinHash(typed))) done(true);
        }
        if (typed.length === 6) tryCode();
      };
    });
    paint();
  });
}
