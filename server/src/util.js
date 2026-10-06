export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function bad(message) {
  throw new HttpError(400, message);
}

export function str(value, { min = 0, max = 500, field = 'value', trim = true } = {}) {
  if (typeof value !== 'string') bad(`${field}: ожидается строка`);
  const out = trim ? value.trim() : value;
  if (out.length < min) bad(`${field}: слишком коротко`);
  if (out.length > max) bad(`${field}: слишком длинно`);
  return out;
}

export function int(value, { min = -Infinity, max = Infinity, field = 'value' } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) bad(`${field}: ожидается число`);
  const out = Math.trunc(n);
  if (out < min || out > max) bad(`${field}: вне диапазона`);
  return out;
}

export function oneOf(value, allowed, field = 'value') {
  if (!allowed.includes(value)) bad(`${field}: недопустимое значение`);
  return value;
}

const IMAGE_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const AUDIO_RE = /^data:audio\/(webm|ogg|mpeg|wav);base64,[A-Za-z0-9+/=]+$/;

export function media(value, kind = 'image') {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') bad('media: ожидается data-url');
  if (value.length > 4_000_000) bad('media: файл слишком большой');
  const re = kind === 'audio' ? AUDIO_RE : IMAGE_RE;
  if (!re.test(value)) bad('media: неподдерживаемый формат');
  return value;
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function username(value) {
  const out = str(value, { min: 3, max: 20, field: 'username' }).toLowerCase().replace(/^@/, '');
  if (!USERNAME_RE.test(out)) bad('username: только латиница, цифры и _');
  return out;
}

export const MOODS = ['calm', 'joy', 'sad', 'anger', 'anxiety', 'tired', 'love', 'inspired'];
