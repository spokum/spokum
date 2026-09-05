const paths = {
  feed: '<path d="M4 6h10M4 12h16M4 18h12"/><circle cx="18" cy="6" r="2"/><circle cx="18" cy="18" r="0"/>',
  chats: '<path d="M20 15a3 3 0 0 1-3 3H8l-4 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z"/>',
  games: '<path d="M7 12h4M9 10v4M15.5 11.5h.01M18 14h.01"/><path d="M17.5 6h-11A4.5 4.5 0 0 0 2 10.5v3A4.5 4.5 0 0 0 6.5 18c1.6 0 2.3-.7 3-1.4h5c.7.7 1.4 1.4 3 1.4a4.5 4.5 0 0 0 4.5-4.5v-3A4.5 4.5 0 0 0 17.5 6z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  heart: '<path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1z"/>',
  comment: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 20.5l1.5-5.2A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/>',
  send: '<path d="M21 3L3 10.5l7 2.6 2.6 7L21 3z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  forward: '<path d="M9 5l7 7-7 7"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5z"/><path d="M14 7l3 3"/>',
  more: '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
  shield: '<path d="M12 2l8 3.5v6c0 5-3.4 9.3-8 10.5-4.6-1.2-8-5.5-8-10.5v-6z"/>',
  hammer: '<path d="M13.7 2.3l8 8-3 3-8-8z"/><path d="M10.9 6.1l-7.7 7.7a2.5 2.5 0 0 0 0 3.5l1.5 1.5a2.5 2.5 0 0 0 3.5 0l7.7-7.7"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  check_double: '<path d="M2 12.5l4 4 8.5-9"/><path d="M11 16.5l1 1 8.5-9"/>',
  verified: '<circle cx="12" cy="12" r="9"/><path d="M8.1 12.2l2.7 2.7 5.1-5.4"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  mute: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/>',
  warn: '<path d="M12 3l9.5 16.5H2.5z"/><path d="M12 9v5M12 17.5h.01"/>',
  trash: '<path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/>',
  restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/><path d="M17 3.5a4 4 0 0 1 0 9M18 14a6 6 0 0 1 4 6v1"/>',
  key: '<circle cx="8" cy="15" r="5"/><path d="M11.5 11.5L21 2M18 5l2.5 2.5M15 8l2.5 2.5"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.6-1.4-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2H17a4 4 0 0 0 4-4c0-4-4-7.3-9-7.3z"/><circle cx="7.5" cy="11.5" r="1.2"/><circle cx="11" cy="7.5" r="1.2"/><circle cx="15.5" cy="9" r="1.2"/>',
  device: '<rect x="4" y="2" width="16" height="20" rx="4"/><path d="M10 18h4"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l4-4-4-4M14 12H3"/>',
  play: '<path d="M6 4l14 8-14 8z"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/><path d="M12 14v4M8 21h8"/>',
  heart_hands: '<path d="M12 8.4l-1.1-1.1a2.6 2.6 0 0 0-3.7 3.7L12 15.8l4.8-4.8a2.6 2.6 0 0 0-3.7-3.7z"/><path d="M4 14v4a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-4"/>',
  same: '<circle cx="12" cy="12" r="9"/><path d="M8.5 10h.01M15.5 10h.01"/><path d="M8.6 14.6h6.8"/>',
  hold: '<path d="M7 11V6.5a1.7 1.7 0 0 1 3.4 0V11"/><path d="M10.4 10V5.2a1.7 1.7 0 0 1 3.4 0V11"/><path d="M13.8 10.4V7.4a1.7 1.7 0 0 1 3.4 0V15a6 6 0 0 1-6 6h-.8a5 5 0 0 1-4.3-2.5L4 14.4a1.7 1.7 0 0 1 2.7-2z"/>',
  rose: '<path d="M12 12.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/><path d="M15.2 9.3c1.6-.4 2.8-1.7 2.8-3.3 0-1.1-.6-2-1.5-2.5.3 1.4-.4 2.6-1.6 3.2M8.8 9.3C7.2 8.9 6 7.6 6 6c0-1.1.6-2 1.5-2.5-.3 1.4.4 2.6 1.6 3.2"/><path d="M12 12.5V21"/><path d="M12 16.5c-2 0-3.4-1.1-4-2.6 2 -.5 3.4.3 4 1.6M12 18.6c1.8 0 3.1-1 3.7-2.4-1.9-.5-3.1.3-3.7 1.4"/>',
  flame: '<path d="M12 2.5c3.6 3 5.5 5.9 5.5 9.1a5.5 5.5 0 0 1-11 0c0-2 .8-3.8 2.2-5.4.2 1.4.9 2.4 2 2.9.5-2.7.2-4.9-1.2-6.9 1 .2 1.8.3 2.5.3z"/>',
  cup: '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M7 2v3M11 2v3"/>',
  crystal: '<path d="M12 2l6 6-6 14L6 8z"/><path d="M6 8h12M12 2v20"/>',
  comet: '<circle cx="16" cy="8" r="4"/><path d="M12.5 11.5L3 21M9 12l-4 2M12 15l-2 4"/>',
  gift: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 12h18M12 8v13"/><path d="M12 8S10.5 3 8 3a2.5 2.5 0 0 0 0 5zM12 8s1.5-5 4-5a2.5 2.5 0 0 1 0 5z"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.8 1.8 0 0 1 0 3.6h-3a1.8 1.8 0 0 0 0 3.6h4"/>',
  mail: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M3 7l9 6 9-6"/>',
  hourglass: '<path d="M7 2h10M7 22h10"/><path d="M7 2c0 5 5 6 5 10s-5 5-5 10M17 2c0 5-5 6-5 10s5 5 5 10"/>',
  forward2: '<path d="M13 5l7 7-7 7"/><path d="M20 12H8a4 4 0 0 0-4 4v3"/>',
  ghost: '<path d="M5 21V10a7 7 0 0 1 14 0v11l-3-2-2 2-2-2-2 2-2-2z"/><path d="M9.5 10h.01M14.5 10h.01"/>',
  car: '<path d="M3 13l2-5.5A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.5L21 13v5h-3v-2H6v2H3z"/><circle cx="7.5" cy="15.5" r="1.2"/><circle cx="16.5" cy="15.5" r="1.2"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v4H6.5A2.5 2.5 0 0 1 4 20.5z"/><path d="M8 7h8M8 11h6"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-1.5 4L16 12H5z"/>',
  moon: '<path d="M21 13a8.5 8.5 0 0 1-10-10 8.5 8.5 0 1 0 10 10z"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  bell: '<path d="M18 9a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/>',
  group: '<circle cx="12" cy="7" r="3"/><circle cx="5" cy="11" r="2.5"/><circle cx="19" cy="11" r="2.5"/><path d="M6 21v-1a6 6 0 0 1 12 0v1"/>',
  channel: '<path d="M4 10v4a2 2 0 0 0 2 2h1l7 4V4L7 8H6a2 2 0 0 0-2 2z"/><path d="M18.5 8.5a5 5 0 0 1 0 7"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  camera: '<path d="M23 7l-7 5 7 5z"/><rect x="1" y="5" width="15" height="14" rx="3"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  crown: '<path d="M3 8.5l4.2 3.2L12 4.6l4.8 7.1L21 8.5l-1.7 9.9H4.7z"/><path d="M4.7 20.4h14.6"/>',
  star: '<path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z"/>',
  wave: '<path d="M2 12c2 0 2-5 4-5s2 10 4 10 2-10 4-10 2 5 4 5 2-3 4-3"/>',
  acorn: '<path d="M6.5 9h11a1 1 0 0 0 0-4h-11a1 1 0 0 0 0 4z"/><path d="M7.5 9c0 5 1.9 10 4.5 10s4.5-5 4.5-10"/>',
  maple: '<path d="M12 3l1.9 3.3 2.2-.7-.7 2.3 3.1.4-2.3 1.9 2.6 2.3-3.2.5.6 2.6-2.7-1-1.5 3.4-1.5-3.4-2.7 1 .6-2.6-3.2-.5 2.6-2.3-2.3-1.9 3.1-.4-.7-2.3 2.2.7z"/><path d="M12 16.6V21"/>',
  plaid: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M8 6v13M13 6v13M18 6v13M3 11h18M3 15h18"/>',
  cocoa: '<path d="M5 8h11v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"/><path d="M16 10h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M8 5.5c0-1 1-1 1-2M11.5 5.5c0-1 1-1 1-2"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 4 13c0-6 8-10 16-10 0 8-4 15-9 15z"/><path d="M4 21c2-6 5-9 9-11"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
  add_user: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 4 1.5"/><path d="M19 11v6M16 14h6"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  video: '<rect x="2" y="6" width="13" height="12" rx="3"/><path d="M15 10.5l7-3.5v10l-7-3.5z"/>',
  album: '<rect x="7" y="3" width="14" height="14" rx="3"/><path d="M3 7v11a3 3 0 0 0 3 3h11"/><circle cx="12" cy="8.5" r="1.4"/><path d="M21 13l-4-4-6 6"/>',
  megaphone: '<path d="M4 10v4a2 2 0 0 0 2 2h2l8 4V4L8 8H6a2 2 0 0 0-2 2z"/><path d="M8 16v4"/>',
  volume: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 9.5a4 4 0 0 1 0 5M18.5 6.5a8 8 0 0 1 0 11"/>',
  cam_off: '<path d="M2 6h11v12H5a3 3 0 0 1-3-3z"/><path d="M15 10.5l7-3.5v10l-4-2"/><path d="M3 3l18 18"/>',
  download: '<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  switch_cam: '<circle cx="12" cy="13" r="4"/><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H8l1.5-2h5L16 6h2.5A2.5 2.5 0 0 1 21 8.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'
};

let logoSource = null;

export function setLogoSource(url) {
  logoSource = url;
}

const solid = {
  hammer: '<path d="M13.9 1.6l8.5 8.5-3.3 3.3-8.5-8.5z"/><path d="M10.2 6.2L2.4 14a2.7 2.7 0 0 0 0 3.8l1.8 1.8a2.7 2.7 0 0 0 3.8 0l7.8-7.8z"/>',
  shield: '<path d="M12 1.6l9 3.9v6.1c0 5.5-3.8 10.3-9 11.6-5.2-1.3-9-6.1-9-11.6V5.5z"/>',
  verified: '<circle cx="12" cy="12" r="10"/>',
  crown: '<path d="M2.4 7.7l4.9 3.6L12 3.9l4.7 7.4 4.9-3.6-2 11.1H4.4z"/><rect x="4.4" y="19.5" width="15.2" height="2.4" rx="1.2"/>'
};

export function solidIcon(name, size = 16) {
  const body = solid[name];
  if (!body) return icon(name, size);
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true">${body}</svg>`;
}

export function icon(name, size = 20, stroke = 1.9) {
  const body = paths[name] || paths.spark;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function logoMark(size = 22) {
  if (logoSource) {
    return `<img src="${logoSource}" alt="СпокУм" width="${size}" height="${size}" style="object-fit:contain;display:block">`;
  }
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 14c2.5 0 2.5-4 5-4s2.5 4 5 4 2.5-4 5-4"/><path d="M6 18.5c2 0 2-2.5 4-2.5s2 2.5 4 2.5 2-2.5 4-2.5"/><circle cx="12" cy="5.5" r="2"/></svg>`;
}
