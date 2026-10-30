import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet } from '../ui.js';

// Profile music — FREE for everyone (no premium gate). The user picks one
// of six ambient tracks; we store the choice in localStorage and expose
// a tiny player widget for the profile view. Audio is generated on the
// fly via Web Audio API so no files are hosted.
//
// State shape in localStorage:
//   spokum.profileMusic = { trackId, trackName }

const KEY = 'spokum.profileMusic';

const TRACKS = [
  { id: 'calm',   name: 'Спокойный', glyph: 'wave',   hue: 200, base: 220, lfo: 0.06, filter: 900 },
  { id: 'rain',   name: 'Дождь',     glyph: 'wave',   hue: 210, base: 0,   lfo: 0.0,  filter: 1200, kind: 'noise', color: 'brown' },
  { id: 'space',  name: 'Космос',    glyph: 'spark',  hue: 270, base: 110,  lfo: 0.08, filter: 600 },
  { id: 'forest', name: 'Лес',       glyph: 'leaf',   hue: 130, base: 330, lfo: 0.04, filter: 1400, kind: 'noise', color: 'pink' },
  { id: 'ocean',  name: 'Океан',     glyph: 'wave',   hue: 200, base: 90,  lfo: 0.03, filter: 500,  kind: 'noise', color: 'brown' },
  { id: 'night',  name: 'Ночь',      glyph: 'moon',   hue: 240, base: 196, lfo: 0.05, filter: 700 }
];

export function getProfileMusic() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.trackId) return data;
    }
  } catch {}
  return null;
}

function saveProfileMusic(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

function clearProfileMusic() {
  try { localStorage.removeItem(KEY); } catch {}
}

// ── Web Audio engine ────────────────────────────────────────────────
let audioCtx = null;
let masterGain = null;
let currentEngine = null;
let currentId = null;

function ensureContext() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.35;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume?.();
  return audioCtx;
}

function noiseBuffer(ctx, kind, seconds = 4) {
  const length = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  if (kind === 'brown') {
    let last = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.2;
    }
  } else if (kind === 'pink') {
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
  } else {
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function startTrack(track) {
  const ctx = ensureContext();
  if (!ctx) return false;
  stopTrack();
  currentId = track.id;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(0.4, ctx.currentTime, 0.4);
  out.connect(masterGain);

  const pieces = [];

  if (track.kind === 'noise') {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, track.color || 'white');
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = Math.max(120, track.filter || 1000);
    // Slow LFO on the filter for "wave" feel.
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = Math.max(0.02, track.lfo || 0.05);
    lfoGain.gain.value = (track.filter || 1000) * 0.4;
    lfo.connect(lfoGain).connect(filter.frequency);
    src.connect(filter).connect(out);
    src.start();
    lfo.start();
    pieces.push(src, lfo);
  } else {
    // Pad: two detuned oscillators + slow tremolo.
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.value = track.base;
    osc2.frequency.value = track.base * 1.005;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = Math.max(200, track.filter || 900);
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = Math.max(0.05, track.lfo || 0.08);
    lfo.connect(trem.gain);
    osc1.connect(trem);
    osc2.connect(trem);
    trem.connect(filter).connect(out);
    osc1.start();
    osc2.start();
    lfo.start();
    pieces.push(osc1, osc2, lfo);
  }
  currentEngine = {
    stop() {
      try { out.gain.setTargetAtTime(0, ctx.currentTime, 0.25); } catch {}
      setTimeout(() => {
        pieces.forEach((p) => { try { p.stop?.(); } catch {} });
        try { out.disconnect(); } catch {}
      }, 400);
    }
  };
  return true;
}

function stopTrack() {
  if (currentEngine) {
    currentEngine.stop();
    currentEngine = null;
  }
  currentId = null;
}

// ── UI ──────────────────────────────────────────────────────────────

export function openMusicPicker(done) {
  const body = el('<div class="col" style="gap:8px"></div>');
  const sheet = openSheet('Музыка профиля', body, {
    onClose: () => {
      stopTrack();
      done?.();
    }
  });

  const draw = () => {
    const current = getProfileMusic();
    body.innerHTML = `<p class="tiny muted" style="margin:0 0 6px;line-height:1.5">Музыка профиля бесплатна для всех. Выберите атмосферный трек — он будет играть у вас в профиле, когда кто-то открывает его (или у вас, если вы нажмёте «Послушать»).</p>`;
    TRACKS.forEach((track) => {
      const isCurrent = current?.trackId === track.id;
      const isPlaying = currentId === track.id;
      const card = el(`<button class="card list-item" style="padding:10px;align-items:center" data-track="${track.id}">
        <div class="avatar avatar-40" style="--h:${track.hue};background:linear-gradient(135deg,hsl(${track.hue} 40% 22%),hsl(${(track.hue + 40) % 360} 38% 14%));color:#fff;display:flex;align-items:center;justify-content:center">${icon(track.glyph, 18)}</div>
        <div class="grow" style="text-align:left;min-width:0">
          <div class="strong small truncate">${esc(track.name)}</div>
          <div class="tiny muted">${isCurrent ? 'Установлено в профиле' : 'Атмосферный фон'}</div>
        </div>
        <span class="btn btn-sm ${isPlaying ? 'btn-primary' : ''}" data-preview style="align-self:center">${icon(isPlaying ? 'pause' : 'play', 14)} ${isPlaying ? 'Стоп' : 'Слушать'}</span>
        <span class="btn btn-sm ${isCurrent ? '' : 'btn-primary'}" data-set style="align-self:center">${icon('check', 14)} ${isCurrent ? 'Сбросить' : 'Установить'}</span>
      </button>`);
      card.querySelector('[data-preview]').onclick = (event) => {
        event.stopPropagation();
        if (isPlaying) {
          stopTrack();
        } else {
          startTrack(track);
        }
        draw();
      };
      card.querySelector('[data-set]').onclick = (event) => {
        event.stopPropagation();
        if (isCurrent) {
          clearProfileMusic();
          toast('Музыка профиля убрана');
        } else {
          saveProfileMusic({ trackId: track.id, trackName: track.name });
          toast(`«${track.name}» — музыка профиля`);
        }
        draw();
      };
      body.appendChild(card);
    });
    body.appendChild(el(`<p class="tiny muted" style="margin:6px 0 0;line-height:1.5">Браузеры не дают запускать звук без вашего нажатия, поэтому музыка не заиграет сама, когда кто-то откроет ваш профиль. У него будет кнопка «Послушать».</p>`));
  };
  draw();
  return sheet;
}

// Tiny inline widget shown in the profile view. Renders nothing if the
// current user has no profile music. The edit button is shown only when
// `isMine` is true (the caller decides that).
export function profileMusicWidget(isMine = false) {
  const music = getProfileMusic();
  if (!music) return '';
  const track = TRACKS.find((t) => t.id === music.trackId);
  if (!track) return '';
  return `<div class="card" data-music-widget style="padding:10px 12px;display:flex;align-items:center;gap:10px;margin:0 12px 12px;background:linear-gradient(135deg,var(--bg-2),var(--bg-3));border:1px solid var(--line)">
    <button class="btn btn-icon btn-primary" data-music-play>${icon('play', 18)}</button>
    <div class="grow" style="min-width:0">
      <div class="tiny muted">Музыка профиля</div>
      <div class="strong small truncate">${esc(track.name)}</div>
    </div>
    ${isMine ? `<button class="btn btn-sm" data-music-edit>${icon('edit', 14)}</button>` : ''}
  </div>`;
}

// Helper used by the profile view to bind the widget's buttons.
export function bindMusicWidget(host, onEdit) {
  const widget = host.querySelector('[data-music-widget]');
  if (!widget) return;
  const playBtn = widget.querySelector('[data-music-play]');
  if (playBtn) {
    playBtn.onclick = () => {
      const music = getProfileMusic();
      if (!music) return;
      const track = TRACKS.find((t) => t.id === music.trackId);
      if (!track) return;
      if (currentId === track.id) {
        stopTrack();
        playBtn.innerHTML = icon('play', 18);
      } else {
        const ok = startTrack(track);
        if (!ok) {
          toast('Браузер не поддерживает Web Audio', 'err');
          return;
        }
        playBtn.innerHTML = icon('pause', 18);
      }
    };
  }
  const editBtn = widget.querySelector('[data-music-edit]');
  if (editBtn) {
    editBtn.onclick = () => onEdit?.();
  }
}

export function stopProfileMusic() {
  stopTrack();
}
