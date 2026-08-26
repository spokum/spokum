import { state } from '../store.js';
import { el, esc, durationText } from '../util.js';
import { icon } from '../icons.js';

const WORDS = {
  anxiety: [
    'Тревога всегда про будущее. Ты же сейчас здесь, и здесь безопасно.',
    'Тебе не нужно ничего решать прямо сейчас. Достаточно дышать.',
    'Мысль — это не факт. Ей можно не верить.',
    'Тело успокаивается раньше мыслей. Начни с выдоха.',
    'Ты уже проходил через это раньше.',
    'Никто не ждёт ответа в эту минуту.'
  ],
  sad: [
    'Грусти столько, сколько нужно. Это не поломка.',
    'Тебе не обязательно быть в порядке для кого-то.',
    'Плохие дни заканчиваются, даже когда не верится.',
    'Ты имеешь право отдохнуть, ничего не заслужив.',
    'Иногда достаточно просто пережить этот вечер.',
    'То, что ты чувствуешь, кому-то уже было знакомо.'
  ],
  anger: [
    'Злость показывает, что нарушили что-то важное для тебя.',
    'Сначала переждать, потом говорить. В таком порядке.',
    'Ты можешь злиться и всё равно оставаться нормальным человеком.',
    'Не отвечай сейчас. Ответ никуда не денется через час.',
    'Длинный выдох работает быстрее любых слов.',
    'Сила не в том, чтобы сдержаться навсегда, а в том, чтобы не навредить.'
  ],
  tired: [
    'Усталость — не лень. Это счёт, который надо оплатить.',
    'Ты не обязан быть продуктивным, чтобы тебя ценили.',
    'Сделай меньше. Этого хватит.',
    'Отдых — часть работы, а не награда за неё.',
    'Тело просит паузу раньше, чем ты соглашаешься.',
    'Завтрашний ты скажет спасибо за сон сегодня.'
  ]
};

const SOUNDS = [
  ['rain', 'Дождь', 'wave'],
  ['wind', 'Ветер', 'leaf'],
  ['waves', 'Волны', 'compass'],
  ['fire', 'Костёр', 'spark']
];

const GROUNDING = [
  ['Пять вещей, которые видишь', 'Осмотрись и назови их про себя'],
  ['Четыре, которые слышишь', 'Даже самые тихие звуки'],
  ['Три, которых касаешься', 'Ткань, стол, собственные руки'],
  ['Два запаха', 'Или два, которые помнишь'],
  ['Один вкус', 'Вода тоже считается']
];

const STEPS = [
  'Выпить стакан воды',
  'Открыть окно на минуту',
  'Умыться прохладной водой',
  'Убрать одну вещь со стола',
  'Написать тому, с кем спокойно',
  'Выйти на воздух на пять минут',
  'Съесть что-то простое',
  'Лечь и ничего не делать'
];

const RELEASE = [
  ['Кулаки', 'Сожми на пять счётов и отпусти'],
  ['Плечи', 'Подними к ушам и урони'],
  ['Челюсть', 'Сожми и разожми, подвигай'],
  ['Живот', 'Напряги и отпусти с выдохом'],
  ['Всё тело', 'Напряги целиком и обмякни']
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
    const closing = audio.context;
    setTimeout(() => closing.close(), 700);
  } catch {}
  audio = null;
}

function breathPanel(pattern, hint) {
  const node = el(`
    <div class="safe-panel">
      <div class="breath-stage">
        <div class="breath-circle" data-circle></div>
        <div class="breath-label" data-label>Вдох</div>
      </div>
      <p class="small muted center" style="margin:0">${esc(hint)}</p>
    </div>`);

  const circle = node.querySelector('[data-circle]');
  const label = node.querySelector('[data-label]');
  let step = 0;
  let timer = null;

  const run = () => {
    const [text, span, scale] = pattern[step];
    label.textContent = text;
    circle.style.transition = `transform ${span}ms ease-in-out`;
    circle.style.transform = `scale(${scale})`;
    timer = setTimeout(() => {
      step = (step + 1) % pattern.length;
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

function quotePanel(list) {
  const node = el(`
    <div class="safe-panel">
      <button class="quote-card" data-quote></button>
      <p class="small muted center" style="margin:0">Нажмите, чтобы сменить</p>
    </div>`);
  const card = node.querySelector('[data-quote]');
  let index = Math.floor(Math.random() * list.length);
  const show = () => {
    card.textContent = list[index];
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = 'pop .3s var(--ease)';
  };
  card.onclick = () => {
    index = (index + 1) % list.length;
    show();
  };
  show();
  return node;
}

function checklistPanel(items, title) {
  const node = el(`
    <div class="safe-panel" style="justify-content:flex-start;overflow-y:auto">
      <p class="small muted" style="margin:0">${esc(title)}</p>
      <div class="col" style="gap:8px">
        ${items.map(([head, hint], index) => `
          <button class="check-row" data-step="${index}">
            <span class="check-box">${icon('check', 13, 3)}</span>
            <span class="grow"><span class="small strong">${esc(head)}</span><br><span class="tiny muted">${esc(hint)}</span></span>
          </button>`).join('')}
      </div>
    </div>`);
  node.querySelectorAll('[data-step]').forEach((row) => {
    row.onclick = () => row.classList.toggle('done');
  });
  return node;
}

function stepsPanel() {
  const node = el(`
    <div class="safe-panel" style="justify-content:flex-start;overflow-y:auto">
      <p class="small muted" style="margin:0">Выбери одно. Одного достаточно.</p>
      <div class="col" style="gap:8px">
        ${STEPS.map((step, index) => `
          <button class="check-row" data-step="${index}">
            <span class="check-box">${icon('check', 13, 3)}</span>
            <span class="grow small">${esc(step)}</span>
          </button>`).join('')}
      </div>
    </div>`);
  node.querySelectorAll('[data-step]').forEach((row) => {
    row.onclick = () => row.classList.toggle('done');
  });
  return node;
}

function letterPanel() {
  const key = 'spokum.letter';
  let saved = '';
  try {
    saved = localStorage.getItem(key) || '';
  } catch {}
  const node = el(`
    <div class="safe-panel" style="justify-content:flex-start">
      <p class="small muted" style="margin:0">Напиши себе. Это остаётся только на этом устройстве.</p>
      <textarea class="textarea" data-letter style="flex:1;min-height:180px" placeholder="Что бы ты сказал близкому человеку в таком состоянии?">${esc(saved)}</textarea>
      <div class="tiny muted center" data-note>Сохраняется само</div>
    </div>`);
  const area = node.querySelector('[data-letter]');
  let timer = null;
  area.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        localStorage.setItem(key, area.value);
        node.querySelector('[data-note]').textContent = 'Сохранено';
      } catch {}
    }, 500);
  });
  node.cleanup = () => clearTimeout(timer);
  return node;
}

function nothingPanel() {
  const node = el(`
    <div class="safe-panel">
      <div class="nothing-stage">
        <div class="nothing-time" data-time>2:00</div>
        <div class="tiny muted">Ничего не нужно делать</div>
      </div>
      <p class="small muted center" style="margin:0">Положи телефон экраном вниз, если хочется</p>
    </div>`);
  let left = 120;
  const label = node.querySelector('[data-time]');
  const timer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(timer);
      label.textContent = 'Готово';
      return;
    }
    label.textContent = durationText(left);
  }, 1000);
  node.cleanup = () => clearInterval(timer);
  return node;
}

function canvasPanel(hint, mode) {
  const node = el(`
    <div class="safe-panel">
      <canvas class="calm-canvas" data-canvas></canvas>
      <p class="small muted center" style="margin:0">${esc(hint)}</p>
    </div>`);

  const canvas = node.querySelector('[data-canvas]');
  let raf = null;

  setTimeout(() => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const w = rect.width;
    const h = rect.height;

    const spawn = () => ({
      x: 20 + Math.random() * (w - 40),
      y: h + 30,
      r: 12 + Math.random() * 22,
      speed: 12 + Math.random() * 22,
      hue: mode === 'smash' ? 10 + Math.random() * 30 : 150 + Math.random() * 120,
      pop: 0
    });
    const items = Array.from({ length: 9 }, () => ({ ...spawn(), y: Math.random() * h }));
    const shards = [];

    const loop = () => {
      ctx.clearRect(0, 0, w, h);
      for (const item of items) {
        if (item.pop > 0) {
          item.pop -= 0.06;
          if (item.pop <= 0) Object.assign(item, spawn());
        } else {
          item.y -= item.speed / 60;
          if (item.y < -40) Object.assign(item, spawn());
        }
        const scale = item.pop > 0 ? 1 + (1 - item.pop) * 0.7 : 1;
        ctx.globalAlpha = item.pop > 0 ? item.pop : 0.5;
        ctx.strokeStyle = `hsl(${item.hue} 55% 70%)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(item.x, item.y, item.r * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = item.pop > 0 ? item.pop * 0.2 : 0.12;
        ctx.fillStyle = `hsl(${item.hue} 55% 70%)`;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      for (let i = shards.length - 1; i >= 0; i--) {
        const shard = shards[i];
        shard.x += shard.vx / 60;
        shard.y += shard.vy / 60;
        shard.vy += 240 / 60;
        shard.life -= 0.02;
        if (shard.life <= 0) {
          shards.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = shard.life;
        ctx.fillStyle = `hsl(${shard.hue} 60% 65%)`;
        ctx.fillRect(shard.x, shard.y, 4, 4);
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(loop);
    };
    loop();

    const touch = (event) => {
      event.preventDefault();
      const box = canvas.getBoundingClientRect();
      const point = event.touches?.[0] || event;
      const x = point.clientX - box.left;
      const y = point.clientY - box.top;
      for (const item of items) {
        if (item.pop <= 0 && Math.hypot(item.x - x, item.y - y) < item.r + 14) {
          item.pop = 1;
          if (mode === 'smash') {
            for (let i = 0; i < 14; i++) {
              shards.push({
                x: item.x,
                y: item.y,
                vx: (Math.random() - 0.5) * 320,
                vy: (Math.random() - 0.8) * 260,
                life: 1,
                hue: item.hue
              });
            }
          }
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

export const MODES = {
  anxiety: {
    title: 'Тихая комната',
    note: 'Уведомления выключены. Лента и чаты подождут',
    tabs: [
      ['breath', 'Дыхание', () => breathPanel([['Вдох', 4000, 1], ['Задержка', 7000, 1], ['Выдох', 8000, 0.45]], 'Дыхание четыре — семь — восемь. Следуй за кругом.')],
      ['ground', 'Опора', () => checklistPanel(GROUNDING, 'Пять — четыре — три — два — один. Возвращаемся в комнату.')],
      ['sound', 'Звуки', soundPanel],
      ['words', 'Слова', () => quotePanel(WORDS.anxiety)],
      ['calm', 'Пузыри', () => canvasPanel('Лопай пузыри. Здесь нет очков и проигрыша', 'bubbles')]
    ]
  },
  sad: {
    title: 'Тёплый угол',
    note: 'Тихо. Никто ничего не ждёт',
    tabs: [
      ['words', 'Слова', () => quotePanel(WORDS.sad)],
      ['steps', 'Шаги', stepsPanel],
      ['letter', 'Письмо', letterPanel],
      ['sound', 'Звуки', soundPanel],
      ['breath', 'Дыхание', () => breathPanel([['Вдох', 4000, 1], ['Выдох', 6000, 0.5]], 'Медленное дыхание, без задержек.')]
    ]
  },
  anger: {
    title: 'Комната выдоха',
    note: 'Сначала переждать, потом говорить',
    tabs: [
      ['breath', 'Выдох', () => breathPanel([['Вдох', 3000, 1], ['Долгий выдох', 9000, 0.4]], 'Выдох вдвое длиннее вдоха. Он гасит вспышку.')],
      ['release', 'Сброс', () => checklistPanel(RELEASE, 'Напряги и отпусти. По очереди.')],
      ['smash', 'Разряд', () => canvasPanel('Бей по шарам. Осколки исчезнут сами', 'smash')],
      ['words', 'Слова', () => quotePanel(WORDS.anger)],
      ['sound', 'Звуки', soundPanel]
    ]
  },
  tired: {
    title: 'Место отдыха',
    note: 'Можно вообще ничего не делать',
    tabs: [
      ['nothing', 'Пауза', nothingPanel],
      ['breath', 'Дыхание', () => breathPanel([['Вдох', 4000, 1], ['Выдох', 4000, 0.5]], 'Ровное дыхание четыре на четыре.')],
      ['sound', 'Звуки', soundPanel],
      ['words', 'Слова', () => quotePanel(WORDS.tired)],
      ['steps', 'Шаги', stepsPanel]
    ]
  }
};

export const HEAVY_MOODS = Object.keys(MODES);

export function openSafeZone(mood = 'anxiety', onClose) {
  const config = MODES[mood] || MODES.anxiety;
  const started = Date.now();
  state.quiet = true;

  const view = el(`
    <div class="safe-zone" data-mode="${mood}">
      <div class="safe-head">
        <div class="grow">
          <div class="strong">${esc(config.title)}</div>
          <div class="tiny muted" data-timer>Вы здесь 0:00</div>
        </div>
        <button class="btn btn-sm" data-close>${icon('close', 15)} Выйти</button>
      </div>
      <div class="safe-note">${icon('bell', 15)} ${esc(config.note)}</div>
      <div class="chips safe-tabs" data-tabs></div>
      <div class="safe-body" data-body></div>
    </div>`);
  document.body.appendChild(view);

  const tabs = view.querySelector('[data-tabs]');
  const body = view.querySelector('[data-body]');
  let active = config.tabs[0][0];
  let panel = null;

  const timer = setInterval(() => {
    view.querySelector('[data-timer]').textContent = `Вы здесь ${durationText((Date.now() - started) / 1000)}`;
  }, 1000);

  const draw = () => {
    tabs.innerHTML = config.tabs
      .map(([key, label]) => `<button class="chip" data-tab="${key}" aria-pressed="${key === active}">${esc(label)}</button>`)
      .join('');
    tabs.querySelectorAll('[data-tab]').forEach((button) => {
      button.onclick = () => {
        active = button.dataset.tab;
        draw();
      };
    });
    panel?.cleanup?.();
    body.innerHTML = '';
    panel = config.tabs.find(([key]) => key === active)[2]();
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
