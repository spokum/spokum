import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet } from '../ui.js';

// Спокойные звуки, синтезируемые прямо в браузере через Web Audio API.
// Никаких аудиофайлов: всё генерируется на лету и крутится бесконечным циклом.

const SOUNDS = [
  { id: 'rain', name: 'Дождь', hint: 'Пологий шум и капли', icon: 'wave' },
  { id: 'ocean', name: 'Океан', hint: 'Медленные волны', icon: 'wave' },
  { id: 'forest', name: 'Лес', hint: 'Шум листвы и птицы', icon: 'leaf' },
  { id: 'fire', name: 'Костёр', hint: 'Угли и потрескивание', icon: 'flame' },
  { id: 'night', name: 'Ночь', hint: 'Гул и сверчки', icon: 'moon' },
  { id: 'wind', name: 'Ветер', hint: 'Порывы в кронах', icon: 'wave' }
];

let audioCtx = null;
let masterGain = null;
let currentEngine = null; // { stop(): void }
let currentId = null;

function ensureContext() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.6;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume?.();
  return audioCtx;
}

function setMasterVolume(value) {
  if (!audioCtx || !masterGain) return;
  const v = Math.max(0, Math.min(1, value));
  masterGain.gain.setTargetAtTime(v, audioCtx.currentTime, 0.05);
}

// --- Буферы шума ---

function whiteNoiseBuffer(ctx, seconds = 4) {
  const length = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function pinkNoiseBuffer(ctx, seconds = 4) {
  const length = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Voss-McCartney упрощённый: несколько октав белого шума складываются.
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buffer;
}

function brownNoiseBuffer(ctx, seconds = 4) {
  const length = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    data[i] = last * 3.2;
  }
  return buffer;
}

function loopingSource(ctx, buffer) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  return src;
}

// --- Движки звуков ---

function buildRain(ctx, out) {
  const src = loopingSource(ctx, whiteNoiseBuffer(ctx, 4));
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1800;
  filter.Q.value = 0.4;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(0.34, ctx.currentTime, 0.6);

  // Лёгкое колебание громкости — будто дождь то усиливается, то стихает.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.18;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.06;
  lfo.connect(lfoGain).connect(gain.gain);

  src.connect(filter).connect(gain).connect(out);
  src.start();
  lfo.start();

  // Капли — короткие синус-импульсы с быстрой огибающей.
  const dropletTimers = [];
  const scheduleDroplet = () => {
    const t = ctx.currentTime + 0.02;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900 + Math.random() * 600, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.22);
    const delay = 200 + Math.random() * 700;
    const id = setTimeout(scheduleDroplet, delay);
    dropletTimers.push(id);
  };
  for (let i = 0; i < 3; i++) {
    const id = setTimeout(scheduleDroplet, 300 + i * 250);
    dropletTimers.push(id);
  }

  return {
    stop() {
      try { src.stop(); } catch {}
      try { lfo.stop(); } catch {}
      dropletTimers.forEach(clearTimeout);
    }
  };
}

function buildOcean(ctx, out) {
  // Низкочастотный шум + медленный LFO на громкости = набегающие волны.
  const src = loopingSource(ctx, brownNoiseBuffer(ctx, 5));
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 480;
  const gain = ctx.createGain();
  gain.gain.value = 0;

  src.connect(filter).connect(gain).connect(out);
  src.start();

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.11; // ~9 секунд на волну
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.22;
  const base = ctx.createConstantSource();
  base.offset.value = 0.28;
  base.connect(gain.gain);
  lfo.connect(lfoGain).connect(gain.gain);
  base.start();
  lfo.start();

  return {
    stop() {
      try { src.stop(); } catch {}
      try { lfo.stop(); } catch {}
      try { base.stop(); } catch {}
    }
  };
}

function buildForest(ctx, out) {
  // Розовый шум — листва. Плюс редкие короткие "птичьи" писки.
  const src = loopingSource(ctx, pinkNoiseBuffer(ctx, 4));
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 900;
  filter.Q.value = 0.6;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(0.22, ctx.currentTime, 0.8);

  src.connect(filter).connect(gain).connect(out);
  src.start();

  const chirpTimers = [];
  const scheduleChirp = () => {
    const start = ctx.currentTime + 0.05;
    const baseFreq = 1800 + Math.random() * 1200;
    const reps = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < reps; i++) {
      const t = start + i * 0.12;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.4, t + 0.04);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.9, t + 0.09);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.12);
    }
    const delay = 2500 + Math.random() * 4000;
    const id = setTimeout(scheduleChirp, delay);
    chirpTimers.push(id);
  };
  chirpTimers.push(setTimeout(scheduleChirp, 1200));

  return {
    stop() {
      try { src.stop(); } catch {}
      chirpTimers.forEach(clearTimeout);
    }
  };
}

function buildFire(ctx, out) {
  // Коричневый шум как гул пламени + случайные "щелчки" углей.
  const src = loopingSource(ctx, brownNoiseBuffer(ctx, 5));
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 700;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(0.32, ctx.currentTime, 0.6);

  src.connect(filter).connect(gain).connect(out);
  src.start();

  const crackleTimers = [];
  const scheduleCrackle = () => {
    const t = ctx.currentTime + 0.02;
    // Короткий всплеск широкополосного шума через окно Ханна.
    const len = Math.floor(ctx.sampleRate * 0.04);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.sin((Math.PI * i) / len);
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1500;
    const g = ctx.createGain();
    g.gain.value = 0.18 + Math.random() * 0.18;
    s.connect(hp).connect(g).connect(out);
    s.start(t);
    const delay = 120 + Math.random() * 700;
    const id = setTimeout(scheduleCrackle, delay);
    crackleTimers.push(id);
  };
  for (let i = 0; i < 4; i++) {
    crackleTimers.push(setTimeout(scheduleCrackle, 200 + i * 180));
  }

  return {
    stop() {
      try { src.stop(); } catch {}
      crackleTimers.forEach(clearTimeout);
    }
  };
}

function buildNight(ctx, out) {
  // Очень низкий синус-гул + редкие сверчки.
  const hum = ctx.createOscillator();
  hum.type = 'sine';
  hum.frequency.value = 58;
  const humGain = ctx.createGain();
  humGain.gain.value = 0;
  humGain.gain.setTargetAtTime(0.14, ctx.currentTime, 1.2);
  hum.connect(humGain).connect(out);
  hum.start();

  // Лёгкая модуляция гула.
  const trem = ctx.createOscillator();
  trem.frequency.value = 0.25;
  const tremGain = ctx.createGain();
  tremGain.gain.value = 0.04;
  trem.connect(tremGain).connect(humGain.gain);
  trem.start();

  const cricketTimers = [];
  const scheduleCricket = () => {
    const start = ctx.currentTime + 0.05;
    const reps = 6 + Math.floor(Math.random() * 6);
    const f = 4200 + Math.random() * 600;
    for (let i = 0; i < reps; i++) {
      const t = start + i * 0.07;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.025, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = 8;
      osc.connect(g).connect(bp).connect(out);
      osc.start(t);
      osc.stop(t + 0.06);
    }
    const delay = 3000 + Math.random() * 4000;
    const id = setTimeout(scheduleCricket, delay);
    cricketTimers.push(id);
  };
  cricketTimers.push(setTimeout(scheduleCricket, 1800));

  return {
    stop() {
      try { hum.stop(); } catch {}
      try { trem.stop(); } catch {}
      cricketTimers.forEach(clearTimeout);
    }
  };
}

function buildWind(ctx, out) {
  // Белый шум через полосовой фильтр с медленно блуждающей частотой.
  const src = loopingSource(ctx, whiteNoiseBuffer(ctx, 5));
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 600;
  filter.Q.value = 1.2;

  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(0.26, ctx.currentTime, 0.8);

  // LFO на частоте фильтра — будто ветер то ниже, то выше.
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 380;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();

  // LFO на громкости — порывы.
  const ampLfo = ctx.createOscillator();
  ampLfo.type = 'sine';
  ampLfo.frequency.value = 0.13;
  const ampGain = ctx.createGain();
  ampGain.gain.value = 0.12;
  const base = ctx.createConstantSource();
  base.offset.value = 0.26;
  base.connect(gain.gain);
  ampLfo.connect(ampGain).connect(gain.gain);
  base.start();
  ampLfo.start();

  src.connect(filter).connect(gain).connect(out);
  src.start();

  return {
    stop() {
      try { src.stop(); } catch {}
      try { lfo.stop(); } catch {}
      try { ampLfo.stop(); } catch {}
      try { base.stop(); } catch {}
    }
  };
}

const BUILDERS = {
  rain: buildRain,
  ocean: buildOcean,
  forest: buildForest,
  fire: buildFire,
  night: buildNight,
  wind: buildWind
};

function stopCurrent() {
  if (currentEngine) {
    try { currentEngine.stop(); } catch {}
    currentEngine = null;
  }
  currentId = null;
}

function play(id) {
  const ctx = ensureContext();
  if (!ctx) {
    toast('Браузер не умеет в Web Audio', 'err');
    return false;
  }
  stopCurrent();
  const builder = BUILDERS[id];
  if (!builder) return false;
  currentEngine = builder(ctx, masterGain);
  currentId = id;
  return true;
}

// --- UI ---

function formatMin(min) {
  if (min === 0) return 'выключить таймер';
  if (min < 60) return `${min} мин`;
  return `${Math.round(min / 60)} ч`;
}

export function openSounds() {
  let active = null;
  let sleepTimer = null;
  let sleepEndsAt = 0;
  let countdownRaf = null;

  const view = el(`
    <div class="col" style="gap:14px">
      <p class="tiny muted" style="margin:0;line-height:1.55">Звуки для спокойствия и сна. Создаются прямо в браузере, без интернета и загрузок.</p>

      <div class="sounds-grid" data-grid></div>

      <div class="card" data-visual style="padding:18px 14px;display:flex;flex-direction:column;align-items:center;gap:10px;border:1px solid var(--line)">
        <div class="sounds-pulse" data-pulse>
          <span class="sounds-pulse-core"></span>
          <span class="sounds-pulse-ring"></span>
          <span class="sounds-pulse-ring delay"></span>
        </div>
        <div class="tiny muted" data-now>Тишина. Выберите звук.</div>
      </div>

      <div class="card" style="padding:12px 14px">
        <div class="row between" style="margin-bottom:6px">
          <span class="small strong">${icon('volume', 16)} Громкость</span>
          <span class="tiny muted" data-vol-label>60%</span>
        </div>
        <input type="range" min="0" max="100" value="60" data-volume style="width:100%;accent-color:var(--accent)">
      </div>

      <div class="card" style="padding:12px 14px">
        <div class="row between" style="margin-bottom:6px">
          <span class="small strong">${icon('moon', 16)} Таймер сна</span>
          <span class="tiny muted" data-sleep-label>выключить таймер</span>
        </div>
        <div class="chips wrap" data-sleep style="gap:6px">
          <button class="chip" data-min="0" aria-pressed="true">выкл</button>
          <button class="chip" data-min="5">5 мин</button>
          <button class="chip" data-min="10">10 мин</button>
          <button class="chip" data-min="15">15 мин</button>
          <button class="chip" data-min="30">30 мин</button>
          <button class="chip" data-min="60">60 мин</button>
        </div>
      </div>
    </div>
  `);

  const sheet = openSheet('Звуки для спокойствия', view, {
    onClose: () => {
      stopCurrent();
      clearTimeout(sleepTimer);
      cancelAnimationFrame(countdownRaf);
      active = null;
    }
  });

  const grid = view.querySelector('[data-grid]');
  const pulseEl = view.querySelector('[data-pulse]');
  const nowEl = view.querySelector('[data-now]');
  const volSlider = view.querySelector('[data-volume]');
  const volLabel = view.querySelector('[data-vol-label]');
  const sleepLabel = view.querySelector('[data-sleep-label]');
  const sleepChips = view.querySelector('[data-sleep]');

  function paintGrid() {
    grid.innerHTML = SOUNDS.map((s) => `
      <button class="sounds-card" data-sound="${s.id}" type="button">
        <span class="sounds-card-glyph">${icon(s.icon, 24)}</span>
        <span class="small strong">${esc(s.name)}</span>
        <span class="tiny muted">${esc(s.hint)}</span>
      </button>
    `).join('');
    grid.querySelectorAll('[data-sound]').forEach((card) => {
      card.onclick = () => toggle(card.dataset.sound);
    });
  }

  function toggle(id) {
    if (active === id) {
      stopCurrent();
      active = null;
      paintActive();
      return;
    }
    const ok = play(id);
    if (!ok) return;
    active = id;
    paintActive();
  }

  function paintActive() {
    grid.querySelectorAll('[data-sound]').forEach((card) => {
      const on = card.dataset.sound === active;
      card.classList.toggle('on', on);
      card.setAttribute('aria-pressed', String(on));
    });
    pulseEl.classList.toggle('playing', !!active);
    if (active) {
      const meta = SOUNDS.find((s) => s.id === active);
      nowEl.textContent = meta ? `Играет: ${meta.name}` : 'Играет';
    } else {
      nowEl.textContent = 'Тишина. Выберите звук.';
    }
  }

  volSlider.oninput = () => {
    const v = Number(volSlider.value) / 100;
    setMasterVolume(v);
    volLabel.textContent = `${volSlider.value}%`;
  };

  function clearSleepTimer() {
    clearTimeout(sleepTimer);
    sleepTimer = null;
    sleepEndsAt = 0;
    cancelAnimationFrame(countdownRaf);
    countdownRaf = null;
  }

  function startSleepTimer(minutes) {
    clearSleepTimer();
    if (!minutes) {
      sleepLabel.textContent = 'выключить таймер';
      return;
    }
    sleepEndsAt = Date.now() + minutes * 60000;
    sleepLabel.textContent = formatMin(minutes);
    sleepTimer = setTimeout(() => {
      stopCurrent();
      active = null;
      paintActive();
      clearSleepTimer();
      sleepLabel.textContent = 'выключить таймер';
      sleepChips.querySelectorAll('[data-min]').forEach((c) => {
        c.setAttribute('aria-pressed', String(c.dataset.min === '0'));
      });
      toast('Звук выключен по таймеру');
    }, minutes * 60000);
    tickCountdown();
  }

  function tickCountdown() {
    cancelAnimationFrame(countdownRaf);
    const tick = () => {
      if (!sleepEndsAt) return;
      const remain = Math.max(0, sleepEndsAt - Date.now());
      const sec = Math.ceil(remain / 1000);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      sleepLabel.textContent = `осталось ${m}:${String(s).padStart(2, '0')}`;
      countdownRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  sleepChips.querySelectorAll('[data-min]').forEach((chip) => {
    chip.onclick = () => {
      sleepChips.querySelectorAll('[data-min]').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', 'true');
      startSleepTimer(Number(chip.dataset.min));
      const min = Number(chip.dataset.min);
      if (min) toast(`Звук выключится через ${formatMin(min)}`);
    };
  });

  paintGrid();
  paintActive();
  return sheet;
}

// Минимальные стили для звуков. Подключаем один раз при первом открытии.
if (typeof document !== 'undefined' && !document.getElementById('sounds-styles')) {
  const style = document.createElement('style');
  style.id = 'sounds-styles';
  style.textContent = `
  .sounds-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
  .sounds-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 12px;display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;cursor:pointer;transition:transform .12s,border-color .12s,background .12s;min-height:96px;justify-content:center}
  .sounds-card:hover{transform:translateY(-1px)}
  .sounds-card.on{border-color:var(--accent);background:var(--accent-soft);color:var(--accent)}
  .sounds-card-glyph{display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;background:var(--bg-2);color:var(--accent);margin-bottom:2px}
  .sounds-card.on .sounds-card-glyph{background:var(--accent);color:var(--accent-ink)}
  .sounds-pulse{position:relative;width:88px;height:88px;display:flex;align-items:center;justify-content:center}
  .sounds-pulse-core{width:36px;height:36px;border-radius:50%;background:var(--bg-2);transition:background .3s}
  .sounds-pulse-ring{position:absolute;inset:0;border-radius:50%;border:2px solid var(--line);opacity:0}
  .sounds-pulse-ring.delay{animation-delay:.8s}
  .sounds-pulse.playing .sounds-pulse-core{background:var(--accent)}
  .sounds-pulse.playing .sounds-pulse-ring{border-color:var(--accent);animation:sounds-ping 1.8s cubic-bezier(.2,.6,.4,1) infinite}
  @keyframes sounds-ping{0%{transform:scale(.6);opacity:.8}100%{transform:scale(1.15);opacity:0}}
  @media(min-width:560px){.sounds-grid{grid-template-columns:repeat(3,1fr)}}
  `;
  document.head.appendChild(style);
}
