import { state } from '../store.js';
import { el, esc, durationText } from '../util.js';
import { icon } from '../icons.js';

const QUOTES = [
  'Тревога всегда говорит о будущем. Ты же сейчас здесь, и здесь безопасно.',
  'Тебе не нужно ничего решать прямо сейчас. Достаточно просто дышать.',
  'Это состояние временное, даже если кажется бесконечным.',
  'Тело успокаивается раньше, чем мысли. Начни с выдоха.',
  'Ты не обязан быть продуктивным, пока тебе плохо.',
  'Самое честное, что можно сделать сейчас, — сбавить темп.',
  'Мысль — это не факт. Ей можно не верить.',
  'Ты уже справлялся с этим раньше. Значит, справишься и теперь.',
  'Никто не ждёт от тебя ответа в эту минуту.',
  'Позволь себе занимать место и никуда не спешить.',
  'Скорость дыхания задаёт скорость мыслей. Замедли первое.',
  'Ты не один в этом, даже если сейчас тихо.'
];

const SOUNDS = [
  ['rain', 'Дождь', 'wave'],
  ['wind', 'Ветер', 'leaf'],
  ['waves', 'Волны', 'compass'],
  ['fire', 'Костёр', 'spark']
];

const BREATH = [
  ['Вдох', 4000],
  ['Задержка', 7000],
  ['Выдох', 8000]
];

let audio = null;

function noiseBuffer(context, seconds = 3) {
  const frames = context.sampleRate * seconds;
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < frames; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.2;
  }
  return buffer;
}

function startSound(kind) {
  stopSound();
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return null;

  const context = new Context();
  const source = context.createBufferSource();
  source.buffer = noiseBuffer(context);
  source.loop = true;

  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  gain.gain.value = 0;

  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);

  let modulator = null;

  if (kind === 'rain') {
    filter.type = 'highpass';
    filter.frequency.value = 900;
    gain.gain.linearRampToValueAtTime(0.5, context.currentTime + 2);
  } else if (kind === 'wind') {
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    modulator = setInterval(() => {
      filter.frequency.linearRampToValueAtTime(280 + Math.random() * 500, context.currentTime + 3);
    }, 3000);
    gain.gain.linearRampToValueAtTime(0.55, context.currentTime + 2);
  } else if (kind === 'waves') {
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    let up = true;
    modulator = setInterval(() => {
      gain.gain.linearRampToValueAtTime(up ? 0.6 : 0.12, context.currentTime + 4);
      up = !up;
    }, 4000);
    gain.gain.linearRampToValueAtTime(0.45, context.currentTime + 3);
  } else {
    filter.type = 'lowpass';
    filter.frequency.value = 1100;
    gain.gain.linearRampToValueAtTime(0.35, context.currentTime + 2);
    modulator = setInterval(() => {
      const crackle = context.createOscillator();
      const pop = context.createGain();
      crackle.frequency.value = 120 + Math.random() * 400;
      pop.gain.value = 0.06 + Math.random() * 0.06;
      crackle.connect(pop);
      pop.connect(context.destination);
      crackle.start();
      pop.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.09);
      crackle.stop(context.currentTime + 0.1);
    }, 420);
  }

  source.start();
  audio = { context, source, gain, modulator, kind };
  return audio;
}

function stopSound() {
  if (!audio) return;
  clearInterval(audio.modulator);
  try {
    audio.gain.gain.linearRampToValueAtTime(0.0001, audio.context.currentTime + 0.4);
    audio.source.stop(audio.context.currentTime + 0.5);
    setTimeout(() => audio?.context.close(), 700);
  } catch {}
  audio = null;
}

function breathPanel() {
  const node = el(`
    <div class="safe-panel">
      <div class="breath-stage">
        <div class="breath-circle" data-circle></div>
        <div class="breath-label" data-label>Вдох</div>
      </div>
      <p class="small muted center" style="margin:0">Дыхание четыре — семь — восемь. Просто следуй за кругом.</p>
    </div>`);

  const circle = node.querySelector('[data-circle]');
  const label = node.querySelector('[data-label]');
  let step = 0;
  let timer = null;

  const run = () => {
    const [text, span] = BREATH[step];
    label.textContent = text;
    circle.style.transition = `transform ${span}ms ease-in-out`;
    circle.style.transform = step === 0 ? 'scale(1)' : step === 1 ? 'scale(1)' : 'scale(0.45)';
    if (step === 0) circle.style.transform = 'scale(1)';
    if (step === 2) circle.style.transform = 'scale(0.45)';
    timer = setTimeout(() => {
      step = (step + 1) % BREATH.length;
      run();
    }, span);
  };

  circle.style.transform = 'scale(0.45)';
  setTimeout(run, 120);
  node.cleanup = () => clearTimeout(timer);
  return node;
}

function soundPanel() {
  const node = el(`
    <div class="safe-panel">
      <div class="sound-grid">
        ${SOUNDS.map(([key, title, glyph]) => `<button class="sound-tile" data-sound="${key}">${icon(glyph, 22)}<span>${esc(title)}</span></button>`).join('')}
      </div>
      <p class="small muted center" style="margin:0" data-state>Звуки создаются на ходу, интернет не нужен</p>
    </div>`);

  const status = node.querySelector('[data-state]');
  node.querySelectorAll('[data-sound]').forEach((button) => {
    button.onclick = () => {
      const kind = button.dataset.sound;
      const active = audio?.kind === kind;
      node.querySelectorAll('[data-sound]').forEach((other) => other.classList.remove('on'));
      if (active) {
        stopSound();
        status.textContent = 'Тишина';
        return;
      }
      startSound(kind);
      button.classList.add('on');
      status.textContent = 'Играет тихо. Нажмите ещё раз, чтобы остановить';
    };
  });

  node.cleanup = stopSound;
  return node;
}

function quotePanel() {
  const node = el(`
    <div class="safe-panel">
      <button class="quote-card" data-quote></button>
      <p class="small muted center" style="margin:0">Нажмите, чтобы сменить</p>
    </div>`);
  const card = node.querySelector('[data-quote]');
  let index = Math.floor(Math.random() * QUOTES.length);
  const show = () => {
    card.textContent = QUOTES[index];
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = 'pop .3s var(--ease)';
  };
  card.onclick = () => {
    index = (index + 1 + Math.floor(Math.random() * 3)) % QUOTES.length;
    show();
  };
  show();
  return node;
}

function bubblePanel() {
  const node = el(`
    <div class="safe-panel">
      <canvas class="calm-canvas" data-canvas></canvas>
      <p class="small muted center" style="margin:0">Лопайте пузыри. Здесь нет очков и проигрыша</p>
    </div>`);

  const canvas = node.querySelector('[data-canvas]');
  let bubbles = [];
  let raf = null;

  const setup = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx, w: rect.width, h: rect.height };
  };

  setTimeout(() => {
    const view = setup();
    const spawn = () => ({
      x: 20 + Math.random() * (view.w - 40),
      y: view.h + 30,
      r: 12 + Math.random() * 22,
      speed: 12 + Math.random() * 22,
      hue: 150 + Math.random() * 120,
      pop: 0
    });
    bubbles = Array.from({ length: 9 }, () => ({ ...spawn(), y: Math.random() * view.h }));

    const loop = () => {
      const { ctx, w, h } = view;
      ctx.clearRect(0, 0, w, h);
      for (const bubble of bubbles) {
        if (bubble.pop > 0) {
          bubble.pop -= 0.06;
          if (bubble.pop <= 0) Object.assign(bubble, spawn());
        } else {
          bubble.y -= bubble.speed / 60;
          if (bubble.y < -40) Object.assign(bubble, spawn());
        }
        const scale = bubble.pop > 0 ? 1 + (1 - bubble.pop) * 0.7 : 1;
        ctx.globalAlpha = bubble.pop > 0 ? bubble.pop : 0.5;
        ctx.strokeStyle = `hsl(${bubble.hue} 55% 70%)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bubble.x, bubble.y, bubble.r * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = bubble.pop > 0 ? bubble.pop * 0.2 : 0.12;
        ctx.fillStyle = `hsl(${bubble.hue} 55% 70%)`;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(loop);
    };
    loop();

    const touch = (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const point = event.touches?.[0] || event;
      const x = point.clientX - rect.left;
      const y = point.clientY - rect.top;
      for (const bubble of bubbles) {
        if (bubble.pop <= 0 && Math.hypot(bubble.x - x, bubble.y - y) < bubble.r + 12) {
          bubble.pop = 1;
          break;
        }
      }
    };
    canvas.addEventListener('pointerdown', touch, { passive: false });
    node.cleanup = () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', touch);
    };
  }, 60);

  return node;
}

const TABS = [
  ['breath', 'Дыхание', breathPanel],
  ['sound', 'Звуки', soundPanel],
  ['quote', 'Слова', quotePanel],
  ['bubbles', 'Пузыри', bubblePanel]
];

export function openSafeZone(onClose) {
  const started = Date.now();
  state.quiet = true;

  const view = el(`
    <div class="safe-zone">
      <div class="safe-head">
        <div class="grow">
          <div class="strong">Безопасная зона</div>
          <div class="tiny muted" data-timer>Вы здесь 0:00</div>
        </div>
        <button class="btn btn-sm" data-close>${icon('close', 15)} Выйти</button>
      </div>
      <div class="safe-note">${icon('bell', 15)} Уведомления выключены, лента и чаты подождут</div>
      <div class="tabs safe-tabs" data-tabs></div>
      <div class="safe-body" data-body></div>
    </div>`);
  document.body.appendChild(view);

  const tabs = view.querySelector('[data-tabs]');
  const body = view.querySelector('[data-body]');
  let active = 'breath';
  let panel = null;

  const timer = setInterval(() => {
    view.querySelector('[data-timer]').textContent = `Вы здесь ${durationText((Date.now() - started) / 1000)}`;
  }, 1000);

  const draw = () => {
    tabs.innerHTML = TABS.map(([key, label]) => `<button class="tab ${key === active ? 'active' : ''}" data-tab="${key}">${label}</button>`).join('');
    tabs.querySelectorAll('[data-tab]').forEach((button) => {
      button.onclick = () => {
        active = button.dataset.tab;
        draw();
      };
    });
    panel?.cleanup?.();
    body.innerHTML = '';
    panel = TABS.find(([key]) => key === active)[2]();
    body.appendChild(panel);
  };

  view.querySelector('[data-close]').onclick = () => {
    clearInterval(timer);
    panel?.cleanup?.();
    stopSound();
    state.quiet = false;
    const minutes = Math.max(1, Math.round((Date.now() - started) / 60000));
    view.remove();
    onClose?.(minutes);
  };

  draw();
  return view;
}
