import { api } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, confirmSheet } from '../ui.js';

// Profile music — FREE for everyone (no premium gate). The user pastes a
// direct URL to an audio file (MP3, WAV, OGG) and we play it through a
// plain <audio> element. No preset tracks, no Web Audio synthesis.
//
// State shape in localStorage:
//   spokum.profileMusic = { url, name }
//
// The same shape is mirrored into the user's profile via `api.updateMe`
// so other people who open the profile can hear the track too — best
// effort: in remote mode the column may be missing and the call is a
// no-op, the local widget then just falls back to the owner's view.

const KEY = 'spokum.profileMusic';

// Single shared <audio> element used by both the picker preview button
// and the profile widget so we never have two tracks playing at once.
let currentAudio = null;
let currentBtns = new Set();

export function getProfileMusic() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && typeof data.url === 'string' && data.url) {
        return { url: data.url, name: data.name || 'Без названия' };
      }
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

// Stop and release any playing audio. Updates every known play button so
// the UI settles back into the "play" state.
export function stopProfileMusic() {
  if (currentAudio) {
    try { currentAudio.pause(); } catch {}
    currentAudio = null;
  }
  currentBtns.forEach((btn) => {
    if (document.body.contains(btn)) btn.innerHTML = icon('play', 18);
  });
  currentBtns.clear();
}

function playUrl(url, btn) {
  // Already playing this? Toggle off.
  if (currentAudio && currentAudio.dataset && currentAudio.dataset.url === url) {
    stopProfileMusic();
    return;
  }
  stopProfileMusic();
  const audio = new Audio(url);
  audio.dataset.url = url;
  audio.onerror = () => {
    toast('Не удалось воспроизвести ссылку', 'err');
    stopProfileMusic();
  };
  audio.onended = () => stopProfileMusic();
  audio.play().then(() => {
    currentAudio = audio;
    if (btn) {
      btn.innerHTML = icon('pause', 18);
      currentBtns.add(btn);
    }
  }).catch(() => {
    toast('Браузер не дал запустить звук', 'err');
  });
}

// ── Picker sheet ─────────────────────────────────────────────────────

export function openMusicPicker(done) {
  const body = el('<div class="col" style="gap:10px"></div>');
  const sheet = openSheet('Музыка профиля', body, {
    onClose: () => {
      stopProfileMusic();
      done?.();
    }
  });

  const draw = () => {
    const current = getProfileMusic();
    body.innerHTML = `<p class="tiny muted" style="margin:0 0 6px;line-height:1.5">Музыка профиля бесплатна для всех. Вставьте прямую ссылку на аудиофайл (MP3, WAV, OGG) — она будет играть прямо в вашем профиле.</p>`;

    if (current) {
      const card = el(`<div class="card" style="padding:10px 12px;display:flex;align-items:center;gap:10px">
        <button class="btn btn-icon btn-primary" data-preview>${icon('play', 18)}</button>
        <div class="grow" style="min-width:0">
          <div class="tiny muted">Сейчас установлено</div>
          <div class="strong small truncate">${esc(current.name)}</div>
        </div>
        <button class="btn btn-sm" style="color:#c98b8b" data-delete>${icon('trash', 14)} Удалить</button>
      </div>`);
      body.appendChild(card);
      card.querySelector('[data-preview]').onclick = () => playUrl(current.url, card.querySelector('[data-preview]'));
      card.querySelector('[data-delete]').onclick = async () => {
        const ok = await confirmSheet({
          title: 'Убрать музыку?',
          text: 'Ссылка будет удалена из вашего профиля.',
          confirm: 'Удалить',
          danger: true
        });
        if (!ok) return;
        stopProfileMusic();
        clearProfileMusic();
        try { await api.updateMe?.({ music: null }); } catch {}
        toast('Музыка профиля убрана');
        draw();
      };
    }

    const form = el(`<div class="col" style="gap:8px">
      <div>
        <div class="small muted" style="margin-bottom:6px">Ссылка на аудиофайл</div>
        <input class="input" data-url placeholder="https://example.com/song.mp3" value="${current ? esc(current.url) : ''}">
      </div>
      <div>
        <div class="small muted" style="margin-bottom:6px">Название трека</div>
        <input class="input" data-name maxlength="80" placeholder="Например: Спокойный дождь" value="${current ? esc(current.name === 'Без названия' ? '' : current.name) : ''}">
      </div>
      <button class="btn btn-primary" data-save style="width:100%">${icon('check', 16)} Сохранить</button>
    </div>`);
    body.appendChild(form);

    body.appendChild(el(`<p class="tiny muted" style="margin:6px 0 0;line-height:1.5">Ссылка должна вести прямо на аудиофайл. YouTube, VK и т.п. не подойдут — только прямые URL на MP3/WAV/OGG. Браузер не даёт запускать звук без вашего нажатия, поэтому у посетителей вашего профиля будет своя кнопка «Послушать».</p>`));

    form.querySelector('[data-save]').onclick = async () => {
      const url = form.querySelector('[data-url]').value.trim();
      const name = (form.querySelector('[data-name]').value.trim() || 'Без названия').slice(0, 80);
      if (!url) return toast('Вставьте ссылку', 'err');
      if (!/^https?:\/\//i.test(url)) return toast('Ссылка должна начинаться с http(s)://', 'err');
      saveProfileMusic({ url, name });
      try { await api.updateMe?.({ music: { url, name } }); } catch {}
      toast('Музыка сохранена');
      sheet.close();
    };
  };

  draw();
  return sheet;
}

// ── Inline profile widget ────────────────────────────────────────────
//
// Renders a small player for the supplied music. Call with an options
// object: { isMine: bool, music: {url,name}|null }.
//   - isMine=true + music=null → falls back to localStorage (own profile)
//   - isMine=false + music={...} → shows their track (read-only)
//   - music has no url → returns '' (nothing rendered)
// The edit button is only shown when isMine is true.
export function profileMusicWidget(opts = {}) {
  const isMine = !!opts.isMine;
  let music = opts.music || null;
  if (!music && isMine) music = getProfileMusic();
  if (!music || !music.url) return '';
  const name = music.name || 'Без названия';
  return `<div class="card" data-music-widget data-url="${esc(music.url)}" style="padding:10px 12px;display:flex;align-items:center;gap:10px;margin:0 12px 12px;background:linear-gradient(135deg,var(--bg-2),var(--bg-3));border:1px solid var(--line)">
    <button class="btn btn-icon btn-primary" data-music-play>${icon('play', 18)}</button>
    <div class="grow" style="min-width:0">
      <div class="tiny muted">Музыка профиля</div>
      <div class="strong small truncate">${esc(name)}</div>
    </div>
    ${isMine ? `<button class="btn btn-sm" data-music-edit="">${icon('edit', 14)}</button>` : ''}
  </div>`;
}

// Wire the widget's play and (optional) edit buttons. `onEdit` is the
// callback used to reopen the picker.
export function bindMusicWidget(host, onEdit) {
  const widget = host.querySelector('[data-music-widget]');
  if (!widget) return;
  const playBtn = widget.querySelector('[data-music-play]');
  if (playBtn) {
    playBtn.onclick = () => {
      const url = widget.dataset.url;
      if (!url) return;
      playUrl(url, playBtn);
    };
  }
  const editBtn = widget.querySelector('[data-music-edit]');
  if (editBtn) {
    editBtn.onclick = () => onEdit?.();
  }
}
