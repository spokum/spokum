import { api, state, setUser, MOODS } from '../store.js';
import { el, esc, timeAgo } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, toast, emptyState } from '../ui.js';

export const REACTIONS = [
  ['heart', 'heart', 'Сердце'],
  ['hug', 'heart_hands', 'Обнимаю'],
  ['same', 'same', 'Я так же'],
  ['hold', 'hold', 'Держись'],
  ['calm', 'leaf', 'Спокойно']
];

export const BADGES = {
  first_post: ['feed', 'Первая запись', 'Вы что-то написали'],
  writer: ['edit', 'Двадцать пять записей', 'Вам есть что сказать'],
  week: ['spark', 'Неделя подряд', 'Семь дней без пропусков'],
  month: ['trophy', 'Месяц подряд', 'Тридцать дней честной полосы'],
  gifted: ['gift', 'Первый подарок', 'Вам что-то подарили'],
  collector: ['star', 'Коллекционер', 'Десять подарков на счету'],
  letter: ['mail', 'Письмо в никуда', 'Вы отпустили письмо'],
  answered: ['comment', 'Вам ответили', 'Незнакомец откликнулся'],
  campfire: ['flame', 'У костра', 'Десять сообщений в темноте'],
  capsule: ['hourglass', 'Себе будущему', 'Первая капсула времени'],
  shield: ['shield', 'Щит', 'Вы модератор СпокУма'],
  rich: ['coin', 'Тысяча монет', 'Накопили целое состояние']
};

let reactionsOk = null;

export async function reactionsReady() {
  if (!api.react || !api.reactions) return false;
  if (reactionsOk !== null) return reactionsOk;
  try {
    await api.reactions(0);
    reactionsOk = true;
  } catch (error) {
    reactionsOk = !/does not exist|not find|schema cache|404/i.test(error.message || '');
  }
  return reactionsOk;
}

export function reactionRow(post, refresh) {
  const look = () => REACTIONS.find(([id]) => id === post.myReaction) || REACTIONS[0];
  const wrap = el(`<span class="react-wrap">
    <button class="icon-btn ${post.myReaction ? 'on' : ''}" data-react-main>${icon(look()[1], 17)}<span>${post.likes || 0}</span></button>
  </span>`);
  const main = wrap.querySelector('[data-react-main]');

  const paint = (result) => {
    post.myReaction = result.mine;
    post.likes = result.total;
    main.classList.toggle('on', !!result.mine);
    main.innerHTML = `${icon(look()[1], 17)}<span>${result.total}</span>`;
  };

  const send = async (kind) => {
    try {
      paint(await api.react(post.id, kind));
      refresh?.();
    } catch (error) {
      toast(error.message, 'err');
    }
  };

  const openPicker = () => {
    wrap.querySelector('.react-pop')?.remove();
    const pop = el(`<span class="react-pop">${REACTIONS.map(
      ([id, glyph, label]) => `<button class="react-pick ${post.myReaction === id ? 'on' : ''}" data-pick="${id}" title="${label}"><span>${icon(glyph, 18)}</span><small>${label}</small></button>`
    ).join('')}</span>`);
    pop.querySelectorAll('[data-pick]').forEach((button) => {
      button.onclick = (event) => {
        event.stopPropagation();
        pop.remove();
        send(button.dataset.pick);
      };
    });
    wrap.appendChild(pop);
    const away = (event) => {
      if (!wrap.contains(event.target)) {
        pop.remove();
        document.removeEventListener('pointerdown', away, true);
      }
    };
    setTimeout(() => document.addEventListener('pointerdown', away, true), 0);
  };

  let hold = null;
  main.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    hold = setTimeout(() => {
      hold = null;
      openPicker();
    }, 380);
  });
  const release = () => {
    if (hold) {
      clearTimeout(hold);
      hold = null;
      if (post.myReaction) send(post.myReaction);
      else openPicker();
    }
  };
  main.addEventListener('pointerup', release);
  main.addEventListener('pointerleave', () => {
    clearTimeout(hold);
    hold = null;
  });
  main.onclick = (event) => event.stopPropagation();

  api.reactions?.(post.id).then((counts) => {
    const total = Object.values(counts || {}).reduce((sum, n) => sum + n, 0);
    if (total) main.querySelector('span').textContent = total;
  }).catch(() => {});

  return wrap;
}

export async function openBadges() {
  const body = el('<div class="col" style="gap:10px"><div class="card" style="height:100px;opacity:.3"></div></div>');
  const sheet = openSheet('Достижения', body);
  let earned = [];
  try {
    const result = await api.badges();
    earned = result.badges || [];
  } catch (error) {
    body.innerHTML = emptyState('warn', 'Не загрузилось', error.message);
    return sheet;
  }
  const have = new Set(earned.map((row) => row.code));
  body.innerHTML = `
    <p class="tiny muted" style="margin:0;line-height:1.5">Здесь нет достижений за популярность. Только за то, что вы делаете для себя и для других. Видно только вам.</p>
    <div class="row between" style="margin:6px 2px 0"><span class="strong small">Получено</span><span class="tiny muted">${have.size} из ${Object.keys(BADGES).length}</span></div>
    <div class="col" data-list style="gap:8px"></div>`;
  const list = body.querySelector('[data-list]');
  Object.entries(BADGES).forEach(([code, [glyph, title, text]]) => {
    const got = have.has(code);
    list.appendChild(el(`<div class="card badge-row ${got ? 'got' : ''}" style="padding:12px">
      <span class="note-icon ${got ? 'good' : ''}">${icon(glyph, 17)}</span>
      <span class="grow" style="min-width:0">
        <span class="small strong" style="display:block">${esc(title)}</span>
        <span class="tiny muted">${esc(got ? text : 'Ещё не получено')}</span>
      </span>
    </div>`));
  });
  return sheet;
}

export async function openBreathe() {
  let phase = 0;
  let timer = null;
  let seconds = 0;
  let together = 1;

  const view = el(`
    <div class="chat-view breathe-view">
      <div class="chat-head">
        <button class="btn btn-icon btn-ghost" data-back>${icon('back', 20)}</button>
        <div class="grow"><div class="strong small">Дыхание</div><div class="tiny muted" data-with>вы не одни</div></div>
      </div>
      <div class="breathe-stage">
        <div class="breathe-ring" data-ring><span data-word>вдох</span></div>
        <div class="breathe-time" data-time>0:00</div>
        <p class="tiny muted" style="max-width:280px;text-align:center;line-height:1.55">Вдох на четыре, задержка на четыре, выдох на шесть. Просто следите за кругом, ничего считать не надо.</p>
      </div>
    </div>`);
  document.body.appendChild(view);

  const ring = view.querySelector('[data-ring]');
  const word = view.querySelector('[data-word]');
  const time = view.querySelector('[data-time]');
  const withText = view.querySelector('[data-with]');

  const steps = [
    ['вдох', 4000, 1],
    ['держим', 4000, 1],
    ['выдох', 6000, 0.55]
  ];

  const soft = (t) => t * t * (3 - 2 * t);
  const frames = steps.map(([label, ms, scale], index) => ({
    label,
    ms,
    to: scale,
    from: index === 0 ? steps[steps.length - 1][2] : steps[index - 1][2]
  }));
  let started = 0;
  let raf = null;

  ring.style.transition = 'none';
  ring.style.transform = `scale(${frames[0].from})`;

  const step = (now) => {
    if (!started) started = now;
    const frame = frames[phase % frames.length];
    let part = (now - started) / frame.ms;
    if (part >= 1) {
      part = 1;
      started = now;
      phase += 1;
      word.textContent = frames[phase % frames.length].label;
    }
    const eased = frame.from + (frame.to - frame.from) * soft(Math.min(1, part));
    ring.style.transform = `scale(${eased.toFixed(4)})`;
    ring.style.opacity = (0.72 + eased * 0.28).toFixed(3);
    raf = requestAnimationFrame(step);
  };

  const clock = setInterval(() => {
    seconds += 1;
    time.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    if (seconds % 45 === 0) ping();
  }, 1000);

  const ping = async () => {
    if (!api.breatheIn) return;
    try {
      const result = await api.breatheIn(Math.floor(seconds / 60));
      together = result.together || 1;
      withText.textContent = together > 1 ? `сейчас с вами дышат ${together - 1}` : 'вы не одни';
    } catch {}
  };

  view.querySelector('[data-back]').onclick = () => {
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    clearInterval(clock);
    api.breatheOut?.().catch(() => {});
    view.remove();
  };

  raf = requestAnimationFrame(step);
  ping();
  return view;
}

const NOISE = {
  rain: ['Дождь', 'rain'],
  waves: ['Волны', 'waves'],
  forest: ['Лес', 'forest'],
  night: ['Ночь', 'night']
};

let audio = null;
let noiseNode = null;

function stopNoise() {
  try {
    noiseNode?.stop();
  } catch {}
  noiseNode = null;
}

function playNoise(kind) {
  stopNoise();
  if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
  audio.resume?.();
  const length = audio.sampleRate * 4;
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.2;
  }
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = kind === 'rain' ? 2200 : kind === 'waves' ? 700 : kind === 'forest' ? 1400 : 380;

  const gain = audio.createGain();
  gain.gain.value = 0.001;
  gain.gain.exponentialRampToValueAtTime(kind === 'night' ? 0.22 : 0.16, audio.currentTime + 1.4);

  if (kind === 'waves') {
    const swell = audio.createOscillator();
    const swellGain = audio.createGain();
    swell.frequency.value = 0.12;
    swellGain.gain.value = 0.08;
    swell.connect(swellGain).connect(gain.gain);
    swell.start();
  }

  source.connect(filter).connect(gain).connect(audio.destination);
  source.start();
  noiseNode = source;
}

export function openNoise() {
  let active = null;
  let sleepTimer = null;
  const body = el(`<div class="col" style="gap:10px">
    <p class="tiny muted" style="margin:0;line-height:1.5">Звук создаётся прямо на телефоне, ничего не качается и интернет не нужен.</p>
    <div class="col" data-list style="gap:6px"></div>
    <div class="row between card" style="padding:12px 14px">
      <span class="small">Выключить через</span>
      <select class="select" data-sleep style="width:auto">
        <option value="0">не выключать</option>
        <option value="10">10 минут</option>
        <option value="20">20 минут</option>
        <option value="45">45 минут</option>
      </select>
    </div>
  </div>`);
  const sheet = openSheet('Звуки для сна', body, {
    onClose: () => {
      stopNoise();
      clearTimeout(sleepTimer);
    }
  });
  const list = body.querySelector('[data-list]');
  Object.entries(NOISE).forEach(([id, [label]]) => {
    const row = el(`<button class="list-item" data-noise="${id}">${icon('volume', 18)}<span class="grow" style="text-align:left">${label}</span></button>`);
    row.onclick = () => {
      if (active === id) {
        stopNoise();
        active = null;
        list.querySelectorAll('[data-noise]').forEach((n) => n.classList.remove('on'));
        return;
      }
      active = id;
      playNoise(id);
      list.querySelectorAll('[data-noise]').forEach((n) => n.classList.toggle('on', n.dataset.noise === id));
    };
    list.appendChild(row);
  });
  body.querySelector('[data-sleep]').onchange = (event) => {
    clearTimeout(sleepTimer);
    const minutes = Number(event.target.value);
    if (!minutes) return;
    sleepTimer = setTimeout(() => {
      stopNoise();
      active = null;
      list.querySelectorAll('[data-noise]').forEach((n) => n.classList.remove('on'));
      toast('Звук выключен');
    }, minutes * 60000);
    toast(`Выключится через ${minutes} минут`);
  };
  return sheet;
}

export async function openMoodMap() {
  const body = el('<div class="col" style="gap:10px"><div class="card" style="height:120px;opacity:.3"></div></div>');
  const sheet = openSheet('Настроение сети', body);
  let rows = [];
  try {
    const result = await api.moodMap();
    rows = result.rows || [];
  } catch (error) {
    body.innerHTML = emptyState('warn', 'Не загрузилось', error.message);
    return sheet;
  }
  if (!rows.length) {
    body.innerHTML = emptyState('compass', 'Пока пусто', 'Данные появятся, когда люди начнут заходить с разных мест');
    return sheet;
  }
  const total = rows.reduce((sum, row) => sum + row.people, 0);
  body.innerHTML = `
    <p class="tiny muted" style="margin:0;line-height:1.5">Страна определяется по часовому поясу устройства. Здесь только общие числа, ничего личного.</p>
    <div class="col" data-list style="gap:8px"></div>`;
  const list = body.querySelector('[data-list]');
  rows.forEach((row) => {
    const mood = MOODS[row.mood] || null;
    list.appendChild(el(`<div class="card" style="padding:13px">
      <div class="row between" style="gap:8px">
        <span class="strong small truncate">${esc(row.country)}</span>
        <span class="tiny muted">${row.people} чел.</span>
      </div>
      <div class="meter" style="margin-top:8px"><i style="width:${Math.round((row.people / total) * 100)}%;background:${mood?.ink || 'var(--accent)'}"></i></div>
      <div class="tiny muted" style="margin-top:6px">${mood ? 'чаще всего: ' + esc(mood.label) : 'настроение пока не понятно'}</div>
    </div>`));
  });
  return sheet;
}

const STREAK_KEY = 'spokum.streak.day';

export async function refreshStreak() {
  if (!api.touchStreak || !state.user) return null;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const saved = JSON.parse(localStorage.getItem(STREAK_KEY) || 'null');
    if (saved && saved.day === today && saved.user === state.user.id) return { days: saved.days, best: saved.best, same: true };
  } catch {}
  try {
    const result = await api.touchStreak();
    try {
      localStorage.setItem(STREAK_KEY, JSON.stringify({ day: today, user: state.user.id, days: result.days, best: result.best }));
    } catch {}
    if (!result.same) {
      const { user } = await api.me();
      if (user) setUser(user);
    }
    return result;
  } catch {
    return null;
  }
}
