export function el(html) {
  const box = document.createElement('div');
  box.innerHTML = html.trim();
  return box.firstElementChild;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0] || '').join('').toUpperCase() || '?';
}

export function timeAgo(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} ч`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} д`;
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function clockTime(ts) {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function fullDate(ts) {
  return new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} ${few}`;
  return `${n} ${many}`;
}

export function durationText(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function debounce(fn, wait = 260) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

async function loadImage(file) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file);
    } catch {}
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((done, fail) => {
      const image = new Image();
      image.onload = () => done(image);
      image.onerror = () => fail(new Error('Формат не поддерживается, сохраните фото как JPG или PNG'));
      image.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

export async function readFileAsDataUrl(file, maxSide = 1400) {
  if (!file) throw new Error('Файл не выбран');
  if (file.size > 30 * 1024 * 1024) throw new Error('Файл больше 30 МБ, выберите поменьше');

  const source = await loadImage(file);
  const width = source.width || source.naturalWidth;
  const height = source.height || source.naturalHeight;
  if (!width || !height) throw new Error('Не удалось открыть изображение');

  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();

  const result = canvas.toDataURL('image/jpeg', 0.82);
  if (!result || result.length < 32) throw new Error('Не удалось обработать изображение');
  return result;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function haptic(ms = 8) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

export function readRawFile(file) {
  return new Promise((done, fail) => {
    const reader = new FileReader();
    reader.onload = () => done(String(reader.result));
    reader.onerror = () => fail(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

export function videoMeta(src) {
  return new Promise((done, fail) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const guard = setTimeout(() => fail(new Error('Видео не открылось')), 12000);
    video.onloadeddata = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 720 / Math.max(video.videoWidth || 720, video.videoHeight || 1280));
      canvas.width = Math.max(1, Math.round((video.videoWidth || 720) * scale));
      canvas.height = Math.max(1, Math.round((video.videoHeight || 1280) * scale));
      let poster = null;
      try {
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        poster = canvas.toDataURL('image/jpeg', 0.72);
      } catch {}
      clearTimeout(guard);
      done({ duration: video.duration || 0, width: video.videoWidth, height: video.videoHeight, poster });
    };
    video.onerror = () => {
      clearTimeout(guard);
      fail(new Error('Формат видео не поддерживается'));
    };
    video.src = src;
    video.currentTime = 0.1;
  });
}

export function fileSizeText(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}
