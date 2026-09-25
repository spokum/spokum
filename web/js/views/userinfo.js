import { api, state } from '../store.js';
import { el, esc, timeAgo, fullDate } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, promptSheet, confirmSheet, toast, emptyState } from '../ui.js';

const TERMS = [
  [1440, 'Сутки'],
  [4320, '3 дня'],
  [10080, 'Неделя'],
  [43200, 'Месяц'],
  [259200, 'Полгода'],
  [525600, 'Год'],
  [0, 'Навсегда']
];

function banLine(ban) {
  if (!ban?.blocked) return '';
  if (ban.forever || !ban.until) return 'Заблокировано навсегда';
  return 'Заблокировано до ' + fullDate(typeof ban.until === 'string' ? Date.parse(ban.until) : ban.until);
}

function pickTerm() {
  return new Promise((done) => {
    const body = el(`<div class="col" style="gap:6px">${TERMS.map(
      ([value, label]) => `<button class="list-item" data-value="${value}">${icon('clock', 18)}<span class="grow" style="text-align:left">${label}</span></button>`
    ).join('')}</div>`);
    const sheet = openSheet('На какой срок', body, { onClose: () => done(null) });
    body.querySelectorAll('[data-value]').forEach((button) => {
      button.onclick = () => {
        done(Number(button.dataset.value));
        document.body.style.overflow = '';
        sheet.sheet.parentElement.remove();
      };
    });
  });
}

function deviceCard(device, info, redraw) {
  const ban = device.ban || { blocked: false };
  const last = typeof device.lastSeen === 'string' ? Date.parse(device.lastSeen) : device.lastSeen;
  const card = el(`<div class="card ${ban.blocked ? 'device-blocked' : ''}" style="padding:13px">
    <div class="row" style="gap:10px;align-items:flex-start">
      <span class="note-icon ${ban.blocked ? 'bad' : ''}">${icon('device', 17)}</span>
      <div class="grow" style="min-width:0">
        <div class="strong small truncate">${esc(device.label || 'Без названия')}</div>
        <div class="tiny muted" style="margin-top:3px">${esc(device.platform || '')}${device.country ? ' · ' + esc(device.country) : ''}</div>
        <div class="tiny muted" style="margin-top:2px">Заходил ${esc(timeAgo(last))} · аккаунтов на нём: ${device.accounts || 1}</div>
        ${ban.blocked ? `<div class="tiny" style="margin-top:5px;color:#c98b8b">${esc(banLine(ban))}${ban.reason ? ' · ' + esc(ban.reason) : ''}</div>` : ''}
      </div>
    </div>
    <div class="row" style="gap:8px;margin-top:10px">
      ${ban.blocked
        ? `<button class="btn btn-sm grow" data-unban ${state.user?.isAdmin ? '' : 'disabled'}>${icon('restore', 15)} Снять блокировку</button>`
        : `<button class="btn btn-sm grow" data-ban>${icon('ban', 15)} Заблокировать по железу</button>`}
    </div>
  </div>`);

  card.querySelector('[data-ban]')?.addEventListener('click', async () => {
    const reason = await promptSheet({
      title: 'Блокировка устройства',
      label: 'Причина, её увидят админы',
      placeholder: 'Например: обход блокировки',
      multiline: true
    });
    if (!reason) return;
    const minutes = await pickTerm();
    if (minutes == null) return;
    const forever = minutes === 0;
    const ok = await confirmSheet({
      title: forever ? 'Заблокировать навсегда' : 'Заблокировать устройство',
      text: `С этого устройства нельзя будет ни войти, ни завести новый аккаунт. Сейчас на нём ${device.accounts || 1} аккаунт(ов).`,
      confirm: 'Заблокировать',
      danger: true
    });
    if (!ok) return;
    try {
      await api.banDevice(device.id, minutes, reason);
      toast(forever ? 'Устройство заблокировано навсегда' : 'Устройство заблокировано');
      redraw();
    } catch (error) {
      toast(error.message, 'err');
    }
  });

  card.querySelector('[data-unban]')?.addEventListener('click', async () => {
    try {
      await api.unbanDevice(device.id);
      toast('Блокировка снята');
      redraw();
    } catch (error) {
      toast(error.message, 'err');
    }
  });

  return card;
}

export async function openUserInfo(userId) {
  if (!state.user?.isModerator && !state.user?.isAdmin) return toast('Только для модераторов', 'err');
  const body = el('<div class="col" style="gap:10px"><div class="card" style="height:120px;opacity:.3"></div></div>');
  const sheet = openSheet('Информация о человеке', body);

  const draw = async () => {
    let info;
    try {
      const result = await api.userInfo(userId);
      info = result.info;
    } catch (error) {
      body.innerHTML = emptyState('warn', 'Не загрузилось', error.message);
      return;
    }

    const countries = (info.countries || []).filter(Boolean);
    const devices = info.devices || [];
    const created = typeof info.createdAt === 'string' ? Date.parse(info.createdAt) : info.createdAt;
    const seen = typeof info.lastSeen === 'string' ? Date.parse(info.lastSeen) : info.lastSeen;

    body.innerHTML = `
      <div class="card" style="padding:14px">
        <div class="strong small">${esc(info.displayName)}</div>
        <div class="tiny muted" style="margin-top:2px">@${esc(info.username)}</div>
        ${info.isModerator || info.isAdmin ? `<div class="rank-pill" style="margin-top:8px">${icon('shield', 13)}<span>${esc(info.rankName || '')}</span></div>` : ''}
        <div class="info-grid" style="margin-top:12px">
          <div><span class="tiny muted">Страна</span><span class="small strong">${countries.length ? esc(countries.join(', ')) : 'неизвестна'}</span></div>
          <div><span class="tiny muted">Устройств</span><span class="small strong">${devices.length}</span></div>
          <div><span class="tiny muted">В сети</span><span class="small strong">${esc(timeAgo(seen))}</span></div>
          <div><span class="tiny muted">С нами с</span><span class="small strong">${esc(fullDate(created).split(',')[0])}</span></div>
        </div>
        <div class="info-grid" style="margin-top:10px">
          <div><span class="tiny muted">Постов</span><span class="small strong">${info.posts}</span></div>
          <div><span class="tiny muted">Комментариев</span><span class="small strong">${info.comments}</span></div>
          <div><span class="tiny muted">Жалоб на него</span><span class="small strong">${info.reportsOn}</span></div>
          <div><span class="tiny muted">Наказаний</span><span class="small strong">${info.punishments}</span></div>
        </div>
        ${info.banReason ? `<div class="tiny" style="margin-top:10px;color:#c98b8b">Причина блокировки: ${esc(info.banReason)}</div>` : ''}
      </div>
      <div class="row between" style="margin:4px 2px 0"><span class="strong small">Устройства</span><span class="tiny muted">${devices.length}</span></div>
      <div class="col" data-devices style="gap:8px"></div>
      <p class="tiny muted" style="margin:2px 0 0;line-height:1.5">Страна определяется по часовому поясу и языку устройства, точный адрес и IP мы не собираем. Отпечаток устройства — не серийный номер: смена телефона или прошивки даёт новый отпечаток.</p>`;

    const list = body.querySelector('[data-devices]');
    if (!devices.length) {
      list.innerHTML = `<div class="card" style="padding:14px"><div class="small muted">Устройств пока не видно. Они появляются, когда человек заходит после обновления.</div></div>`;
      return;
    }
    devices.forEach((device) => list.appendChild(deviceCard(device, info, draw)));
  };

  await draw();
  return sheet;
}
