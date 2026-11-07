const KEY = 'spokum.device.v1';

const ZONES = {
  'Europe/Moscow': 'Россия', 'Europe/Kaliningrad': 'Россия', 'Europe/Samara': 'Россия',
  'Europe/Volgograd': 'Россия', 'Europe/Saratov': 'Россия', 'Europe/Astrakhan': 'Россия',
  'Europe/Ulyanovsk': 'Россия', 'Europe/Kirov': 'Россия', 'Asia/Yekaterinburg': 'Россия',
  'Asia/Omsk': 'Россия', 'Asia/Novosibirsk': 'Россия', 'Asia/Barnaul': 'Россия',
  'Asia/Tomsk': 'Россия', 'Asia/Novokuznetsk': 'Россия', 'Asia/Krasnoyarsk': 'Россия',
  'Asia/Irkutsk': 'Россия', 'Asia/Chita': 'Россия', 'Asia/Yakutsk': 'Россия',
  'Asia/Khandyga': 'Россия', 'Asia/Vladivostok': 'Россия', 'Asia/Ust-Nera': 'Россия',
  'Asia/Magadan': 'Россия', 'Asia/Sakhalin': 'Россия', 'Asia/Srednekolymsk': 'Россия',
  'Asia/Kamchatka': 'Россия', 'Asia/Anadyr': 'Россия',
  'Europe/Kyiv': 'Украина', 'Europe/Kiev': 'Украина', 'Europe/Simferopol': 'Украина',
  'Europe/Minsk': 'Беларусь', 'Asia/Almaty': 'Казахстан', 'Asia/Aqtobe': 'Казахстан',
  'Asia/Aqtau': 'Казахстан', 'Asia/Atyrau': 'Казахстан', 'Asia/Oral': 'Казахстан',
  'Asia/Qostanay': 'Казахстан', 'Asia/Qyzylorda': 'Казахстан',
  'Asia/Tashkent': 'Узбекистан', 'Asia/Samarkand': 'Узбекистан',
  'Asia/Bishkek': 'Киргизия', 'Asia/Dushanbe': 'Таджикистан', 'Asia/Ashgabat': 'Туркмения',
  'Asia/Baku': 'Азербайджан', 'Asia/Yerevan': 'Армения', 'Asia/Tbilisi': 'Грузия',
  'Europe/Chisinau': 'Молдова', 'Europe/Riga': 'Латвия', 'Europe/Vilnius': 'Литва',
  'Europe/Tallinn': 'Эстония', 'Europe/Warsaw': 'Польша', 'Europe/Berlin': 'Германия',
  'Europe/Prague': 'Чехия', 'Europe/Belgrade': 'Сербия', 'Europe/Istanbul': 'Турция',
  'Europe/London': 'Великобритания', 'Europe/Paris': 'Франция', 'Europe/Madrid': 'Испания',
  'Europe/Rome': 'Италия', 'Europe/Amsterdam': 'Нидерланды', 'Europe/Lisbon': 'Португалия',
  'Europe/Helsinki': 'Финляндия', 'Europe/Stockholm': 'Швеция', 'Europe/Oslo': 'Норвегия',
  'Europe/Copenhagen': 'Дания', 'Europe/Athens': 'Греция', 'Europe/Bucharest': 'Румыния',
  'Europe/Sofia': 'Болгария', 'Europe/Budapest': 'Венгрия', 'Europe/Zurich': 'Швейцария',
  'Europe/Vienna': 'Австрия', 'Asia/Jerusalem': 'Израиль', 'Asia/Dubai': 'ОАЭ',
  'Asia/Tokyo': 'Япония', 'Asia/Seoul': 'Южная Корея', 'Asia/Shanghai': 'Китай',
  'Asia/Bangkok': 'Таиланд', 'Asia/Kolkata': 'Индия', 'Africa/Cairo': 'Египет',
  'America/New_York': 'США', 'America/Chicago': 'США', 'America/Denver': 'США',
  'America/Los_Angeles': 'США', 'America/Toronto': 'Канада', 'America/Sao_Paulo': 'Бразилия',
  'Australia/Sydney': 'Австралия'
};

const BY_LANG = {
  RU: 'Россия', UA: 'Украина', BY: 'Беларусь', KZ: 'Казахстан', UZ: 'Узбекистан',
  KG: 'Киргизия', TJ: 'Таджикистан', TM: 'Туркмения', AZ: 'Азербайджан', AM: 'Армения',
  GE: 'Грузия', MD: 'Молдова', LV: 'Латвия', LT: 'Литва', EE: 'Эстония', PL: 'Польша',
  DE: 'Германия', US: 'США', GB: 'Великобритания', TR: 'Турция', IL: 'Израиль'
};

function timezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

export function country() {
  const zone = timezone();
  if (ZONES[zone]) return ZONES[zone];
  const tag = (navigator.languages?.[0] || navigator.language || '').split('-')[1];
  if (tag && BY_LANG[tag.toUpperCase()]) return BY_LANG[tag.toUpperCase()];
  if (zone) return zone.split('/').pop().replace(/_/g, ' ');
  return '';
}

export function deviceLabel() {
  if (window.SpokumHost?.deviceName) {
    try {
      const name = window.SpokumHost.deviceName();
      if (name && name.trim()) return name.trim();
    } catch {}
  }
  const ua = navigator.userAgent || '';
  const android = ua.match(/Android[^;)]*;\s*([^;)]+?)(?:\s+Build|\))/i);
  if (android) return android[1].trim();
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Windows NT 10/i.test(ua)) return 'Windows 10 или 11';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS X/i.test(ua)) return 'Mac';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Неизвестное устройство';
}

export function platformName() {
  const ua = navigator.userAgent || '';
  if (window.SpokumHost) return 'Приложение СпокУм';
  if (/Android/i.test(ua)) return 'Android, браузер';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS, браузер';
  if (/Windows/i.test(ua)) return 'Windows, браузер';
  if (/Mac OS X/i.test(ua)) return 'macOS, браузер';
  return 'Браузер';
}

function graphics() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'no-gl';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (!info) return gl.getParameter(gl.VERSION) || 'gl';
    return `${gl.getParameter(info.UNMASKED_VENDOR_WEBGL)}|${gl.getParameter(info.UNMASKED_RENDERER_WEBGL)}`;
  } catch {
    return 'gl-err';
  }
}

async function digest(text) {
  try {
    const bytes = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  } catch {
    let acc = 0;
    for (let i = 0; i < text.length; i++) acc = (acc * 31 + text.charCodeAt(i)) >>> 0;
    return acc.toString(16).padStart(8, '0').repeat(4).slice(0, 32);
  }
}

let cached = null;

export async function deviceId() {
  if (cached) return cached;
  if (window.SpokumHost?.deviceId) {
    try {
      const native = window.SpokumHost.deviceId();
      if (native) {
        cached = 'and-' + (await digest(native));
        return cached;
      }
    } catch {}
  }
  const parts = [
    navigator.platform || '',
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    String(navigator.hardwareConcurrency || 0),
    String(navigator.deviceMemory || 0),
    String(navigator.maxTouchPoints || 0),
    timezone(),
    (navigator.languages || []).join(','),
    graphics(),
    (navigator.userAgent || '').replace(/[\d.]+/g, '')
  ];
  cached = 'web-' + (await digest(parts.join('|')));
  return cached;
}

export async function deviceInfo() {
  return {
    id: await deviceId(),
    label: deviceLabel(),
    platform: platformName(),
    country: country(),
    app: window.SpokumHost ? 'apk' : 'web'
  };
}

export function rememberBlock(state) {
  try {
    if (state?.blocked) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch {}
}

export function lastBlock() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}
