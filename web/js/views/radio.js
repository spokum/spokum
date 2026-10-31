import { state } from '../store.js';
import { el, esc, uid, timeAgo } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, emptyState, confirmSheet } from '../ui.js';

// СпокУм Радио — общий плейлист, который хранится локально в браузере.
// Любой пользователь может добавить трек по прямой ссылке (MP3/WAV/Ogg).
// Формат записи: { id, url, name, addedBy, addedAt }
// Хранилище: localStorage.spokum.radio

const KEY = 'spokum.radio';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
}

// Один общий <audio> на всё приложение — чтобы при закрытии шторки
// музыку можно было остановить. Создаётся лениво.
let audioEl = null;
let currentTrackId = null;
let volume = 0.8;

function getAudio() {
  if (audioEl) return audioEl;
  audioEl = new Audio();
  audioEl.volume = volume;
  audioEl.addEventListener('ended', () => {
    currentTrackId = null;
    // Сигнализируем событие для перерисовки (если кто слушает).
    try { window.dispatchEvent(new CustomEvent('spokum:radio-ended')); } catch {}
  });
  audioEl.addEventListener('error', () => {
    toast('Не удалось воспроизвести трек — проверьте ссылку', 'err');
    currentTrackId = null;
    try { window.dispatchEvent(new CustomEvent('spokum:radio-ended')); } catch {}
  });
  return audioEl;
}

function isPlaying(id) {
  return currentTrackId === id && audioEl && !audioEl.paused;
}

function toggleTrack(track) {
  const a = getAudio();
  if (currentTrackId === track.id) {
    if (a.paused) { a.play().catch(() => toast('Не удалось включить воспроизведение', 'err')); }
    else { a.pause(); }
  } else {
    a.pause();
    a.src = track.url;
    currentTrackId = track.id;
    a.play().catch(() => toast('Не удалось включить воспроизведение', 'err'));
  }
}

function stopAll() {
  if (audioEl) { audioEl.pause(); audioEl.currentTime = 0; }
  currentTrackId = null;
}

function isValidAudioUrl(url) {
  if (!/^https?:\/\//i.test(url)) return false;
  if (/\.(mp3|wav|ogg|m4a|aac|flac)(\?|#|$)/i.test(url)) return true;
  // Разрешаем и "голые" URL — пусть браузер сам разбирается.
  return true;
}

export function openRadio() {
  const body = el('<div class="col" style="gap:10px"></div>');
  const sheet = openSheet('СпокУм Радио', body, { onClose: stopAll });

  const draw = () => {
    const tracks = load().sort((a, b) => b.addedAt - a.addedAt);
    body.innerHTML = `
      <div class="card" style="padding:12px;line-height:1.5">
        <div class="row" style="gap:8px;align-items:flex-start">
          <span style="color:var(--accent)">${icon('volume', 20)}</span>
          <div class="grow">
            <div class="strong small">Общий плейлист</div>
            <div class="tiny muted">Добавляйте трек по прямой ссылке (MP3, WAV, OGG). Список общий — виден всем на этом устройстве.</div>
          </div>
        </div>
      </div>
      <div class="card" style="padding:12px">
        <div class="strong small" style="margin-bottom:8px">${icon('plus', 16)} Добавить трек</div>
        <div class="col" style="gap:8px">
          <input class="input" data-name placeholder="Название трека" maxlength="80">
          <input class="input" data-url placeholder="https://.../song.mp3">
          <button class="btn btn-primary" data-add>${icon('plus', 16)} Добавить в плейлист</button>
        </div>
      </div>
      <div class="row between" style="margin-top:4px">
        <div class="strong small">${icon('play', 16)} Треки</div>
        <span class="tiny muted">${tracks.length} в списке</span>
      </div>
      <div class="row" style="gap:8px;align-items:center">
        <span class="tiny muted">${icon('volume', 14)}</span>
        <input type="range" min="0" max="1" step="0.05" value="${volume}" data-vol style="flex:1">
        <span class="tiny muted" data-vol-label>${Math.round(volume * 100)}%</span>
      </div>
      <div data-list style="display:flex;flex-direction:column;gap:8px"></div>`;

    const list = body.querySelector('[data-list]');
    if (!tracks.length) {
      list.innerHTML = emptyState('volume', 'Пока тишина', 'Добавьте первый трек по прямой ссылке');
    } else {
      tracks.forEach((track) => {
        const playing = isPlaying(track.id);
        const current = currentTrackId === track.id;
        const node = el(`<div class="card list-item" data-track="${track.id}"
          style="padding:12px;align-items:center;gap:10px;${current ? 'border-color:var(--accent);background:rgba(127,179,160,.06)' : ''}">
          <button class="btn btn-icon btn-primary" data-play title="${playing ? 'Пауза' : 'Слушать'}">
            ${icon(playing ? 'pause' : 'play', 16)}
          </button>
          <div class="grow" style="min-width:0">
            <div class="strong small truncate">${esc(track.name || 'Без названия')}</div>
            <div class="tiny muted truncate">${esc(track.addedBy || 'Аноним')} · ${timeAgo(track.addedAt)}${current ? ' · сейчас играет' : ''}</div>
          </div>
          <button class="btn btn-sm btn-ghost" data-kill title="Удалить">${icon('trash', 14)}</button>
        </div>`);
        node.querySelector('[data-play]').onclick = (event) => {
          event.stopPropagation();
          toggleTrack(track);
          // Перерисовать только эту карточку.
          draw();
        };
        node.querySelector('[data-kill]').onclick = async (event) => {
          event.stopPropagation();
          const ok = await confirmSheet({ title: 'Удалить трек?', text: track.name || 'Без названия', confirm: 'Удалить', danger: true });
          if (!ok) return;
          if (currentTrackId === track.id) stopAll();
          save(load().filter((t) => t.id !== track.id));
          toast('Трек удалён');
          draw();
        };
        list.appendChild(node);
      });
    }

    body.querySelector('[data-add]').onclick = () => {
      const name = body.querySelector('[data-name]').value.trim();
      const url = body.querySelector('[data-url]').value.trim();
      if (!url) return toast('Вставьте ссылку на трек', 'err');
      if (!isValidAudioUrl(url)) return toast('Ссылка должна начинаться с http(s)://', 'err');
      const list2 = load();
      list2.push({
        id: uid(),
        url,
        name: name || 'Без названия',
        addedBy: state.user?.username || state.user?.displayName || 'Аноним',
        addedAt: Date.now()
      });
      save(list2);
      toast('Трек добавлен');
      draw();
    };

    const vol = body.querySelector('[data-vol]');
    const volLabel = body.querySelector('[data-vol-label]');
    vol.addEventListener('input', (event) => {
      volume = parseFloat(event.target.value) || 0;
      if (audioEl) audioEl.volume = volume;
      if (volLabel) volLabel.textContent = `${Math.round(volume * 100)}%`;
    });
  };

  draw();
  // Перерисовка при окончании трека, чтобы убрать статус «сейчас играет».
  const onEnded = () => draw();
  window.addEventListener('spokum:radio-ended', onEnded);
  // На закрытии шторки снимаем слушатель и стопаем музыку.
  const origClose = sheet.close;
  sheet.close = () => {
    window.removeEventListener('spokum:radio-ended', onEnded);
    stopAll();
    origClose();
  };
  return sheet;
}
