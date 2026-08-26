import { api, state } from '../store.js';
import { el, esc, timeAgo } from '../util.js';
import { icon } from '../icons.js';
import { avatar, badges, toast, openSheet, promptSheet, emptyState } from '../ui.js';
import { openProfile } from './profile.js';
import { pickDuration } from './admin.js';

const TABS = [
  ['queue', 'Публикации'],
  ['reports', 'Жалобы'],
  ['strikes', 'Мой статус']
];

export function openMod() {
  if (!state.user?.isModerator && !state.user?.isAdmin) return toast('Нужен щит модератора', 'err');
  const view = el(`
    <div class="chat-view">
      <div class="chat-head">
        <button class="btn btn-icon btn-ghost" data-back>${icon('back', 20)}</button>
        <div class="grow"><div class="strong small">Панель модератора</div><div class="tiny muted">Следим за спокойствием</div></div>
        ${icon('shield', 20)}
      </div>
      <div style="padding:12px 14px 0"><div class="tabs" data-tabs></div></div>
      <div class="chat-body" data-body style="display:block"></div>
    </div>`);
  document.body.appendChild(view);
  view.querySelector('[data-back]').onclick = () => view.remove();

  const tabs = view.querySelector('[data-tabs]');
  const body = view.querySelector('[data-body]');
  let active = 'queue';

  const drawTabs = () => {
    tabs.innerHTML = TABS.map(([key, label]) => `<button class="tab ${key === active ? 'active' : ''}" data-tab="${key}">${label}</button>`).join('');
    tabs.querySelectorAll('[data-tab]').forEach((button) => {
      button.onclick = () => {
        active = button.dataset.tab;
        drawTabs();
        draw();
      };
    });
  };

  const draw = async () => {
    body.innerHTML = '<div class="card" style="height:140px;opacity:.35"></div>';
    try {
      if (active === 'queue') await drawQueue(body);
      if (active === 'reports') await drawReports(body);
      if (active === 'strikes') await drawStrikes(body);
    } catch (error) {
      body.innerHTML = emptyState('warn', 'Ошибка', error.message);
    }
  };

  drawTabs();
  draw();
}

async function drawQueue(body) {
  const { posts } = await api.modQueue();
  if (!posts.length) {
    body.innerHTML = emptyState('leaf', 'Лента пуста', 'Проверять пока нечего');
    return;
  }
  body.innerHTML = '<div class="col" data-list></div>';
  const list = body.querySelector('[data-list]');
  posts.forEach((post) => {
    const card = el(`
      <div class="card appear" style="padding:14px">
        <div class="row">
          ${avatar(post.author, 40)}
          <div class="grow" style="min-width:0">
            <div class="row" style="gap:6px"><span class="strong small truncate">${esc(post.author.displayName)}</span>${badges(post.author)}</div>
            <div class="tiny muted">@${esc(post.author.username)} · ${timeAgo(post.createdAt)}</div>
          </div>
          ${post.removed ? '<span class="pill bad">снят</span>' : '<span class="pill good">в ленте</span>'}
        </div>
        ${post.text ? `<p class="post-text">${esc(post.text)}</p>` : ''}
        ${post.image ? `<div class="post-image"><img src="${esc(post.image)}" alt="" loading="lazy"></div>` : ''}
        ${post.removed ? `<div class="tiny muted" style="margin-top:8px">Причина: ${esc(post.removedReason)}</div>` : ''}
        <div class="row" style="margin-top:12px;gap:8px">
          <button class="btn btn-sm" data-author>${icon('profile', 15)} Автор</button>
          ${post.removed ? '' : `<button class="btn btn-sm btn-danger grow" data-remove>${icon('trash', 15)} Снять пост</button>`}
          <button class="btn btn-sm grow" data-punish>${icon('warn', 15)} Наказать</button>
        </div>
      </div>`);
    card.querySelector('[data-author]').onclick = () => openProfile(post.author.username);
    card.querySelector('[data-remove]')?.addEventListener('click', async () => {
      const reason = await promptSheet({ title: 'Снять публикацию', label: 'Причина, её увидит админ', placeholder: 'Например: травля', multiline: true });
      if (!reason) return;
      try {
        await api.removePost(post.id, reason);
        toast('Пост снят');
        drawQueue(body);
      } catch (error) {
        toast(error.message, 'err');
      }
    });
    card.querySelector('[data-punish]').onclick = () => openPunish(post.author, () => drawQueue(body));
    list.appendChild(card);
  });
}

export function openPunish(user, done) {
  const body = el(`
    <div class="col" style="gap:6px">
      <div class="row" style="padding:0 4px 8px">${avatar(user, 46)}
        <div class="grow"><div class="strong">${esc(user.displayName)}</div><div class="tiny muted">@${esc(user.username)}</div></div></div>
      <button class="list-item" data-kind="warn">${icon('warn', 18)}<span>Предупреждение</span></button>
      <button class="list-item" data-kind="mute" style="color:#c6b083">${icon('mute', 18)}<span>Мут</span></button>
      <button class="list-item" data-kind="ban" style="color:#c98b8b">${icon('ban', 18)}<span>Блокировка</span></button>
    </div>`);
  const sheet = openSheet('Наказание', body);
  body.querySelectorAll('[data-kind]').forEach((button) => {
    button.onclick = async () => {
      const kind = button.dataset.kind;
      sheet.close();
      const reason = await promptSheet({ title: 'Причина', label: 'Что нарушил пользователь', placeholder: 'Опишите подробно', multiline: true });
      if (!reason) return;
      let minutes = 0;
      if (kind !== 'warn') {
        minutes = await pickDuration();
        if (minutes == null) return;
      }
      try {
        await api.punish({ userId: user.id, kind, minutes, reason });
        toast('Наказание выдано, админы это увидят');
        done?.();
      } catch (error) {
        toast(error.message, 'err');
      }
    };
  });
}

async function drawReports(body) {
  const { reports } = await api.modReports();
  if (!reports.length) {
    body.innerHTML = emptyState('flag', 'Жалоб нет', 'Пользователи пока всем довольны');
    return;
  }
  body.innerHTML = '<div class="col" data-list></div>';
  const list = body.querySelector('[data-list]');
  reports.forEach((report) => {
    const kindLabel = { post: 'на пост', user: 'на пользователя', message: 'на сообщение' }[report.targetKind] || '';
    const card = el(`
      <div class="card appear" style="padding:14px">
        <div class="row">
          ${avatar(report.reporter, 40)}
          <div class="grow" style="min-width:0">
            <div class="small"><span class="strong">${esc(report.reporter?.displayName || '')}</span> пожаловался ${kindLabel}</div>
            <div class="tiny muted">${timeAgo(report.createdAt)}</div>
          </div>
          <span class="pill ${report.status === 'open' ? 'warn' : 'good'}">${report.status === 'open' ? 'открыта' : 'закрыта'}</span>
        </div>
        <p class="post-text">${esc(report.reason)}</p>
        ${report.image ? `<div class="post-image"><img src="${esc(report.image)}" alt="" loading="lazy"></div>` : ''}
        ${report.target ? `<div class="row" style="margin-top:10px">${avatar(report.target, 40)}<div class="grow"><div class="row" style="gap:6px"><span class="small strong">${esc(report.target.displayName)}</span>${badges(report.target)}</div><div class="tiny muted">@${esc(report.target.username)}</div></div></div>` : ''}
        <div class="row" style="margin-top:12px;gap:8px">
          ${report.target ? `<button class="btn btn-sm grow" data-punish>${icon('warn', 15)} Наказать</button>` : ''}
          ${report.status === 'open' ? `<button class="btn btn-sm grow" data-close>${icon('check', 15)} Закрыть</button>
          <button class="btn btn-sm grow" data-reject>${icon('close', 15)} Отклонить</button>` : ''}
        </div>
      </div>`);
    card.querySelector('[data-punish]')?.addEventListener('click', () => openPunish(report.target, () => drawReports(body)));
    card.querySelector('[data-close]')?.addEventListener('click', async () => {
      await api.closeReport(report.id, 'closed');
      toast('Жалоба закрыта');
      drawReports(body);
    });
    card.querySelector('[data-reject]')?.addEventListener('click', async () => {
      await api.closeReport(report.id, 'rejected');
      toast('Жалоба отклонена');
      drawReports(body);
    });
    list.appendChild(card);
  });
}

async function drawStrikes(body) {
  const { strikes } = await api.strikes();
  const left = Math.max(0, 3 - strikes.length);
  body.innerHTML = `
    <div class="card appear">
      <div class="row" style="gap:10px">${icon('shield', 22)}<div class="grow"><div class="strong small">Щит модератора</div>
      <div class="tiny muted">${state.user.isModerator ? 'Активен' : 'Снят'}</div></div>
      <span class="pill ${strikes.length >= 2 ? 'bad' : strikes.length ? 'warn' : 'good'}">${strikes.length}/3</span></div>
      <div class="meter" style="margin-top:14px"><i style="width:${(strikes.length / 3) * 100}%;background:${strikes.length >= 2 ? '#c98b8b' : 'var(--accent)'}"></i></div>
      <div class="tiny muted" style="margin-top:10px;line-height:1.5">Админ может отменить необоснованное решение и выдать предупреждение. После трёх предупреждений щит снимается автоматически. Осталось ${left}.</div>
    </div>
    ${strikes.length
      ? `<div class="col" style="margin-top:12px;gap:8px">${strikes
          .map((s) => `<div class="card" style="padding:14px"><div class="row between"><span class="pill warn">предупреждение</span><span class="tiny muted">${timeAgo(s.createdAt)}</span></div><div class="small" style="margin-top:8px">${esc(s.reason)}</div></div>`)
          .join('')}</div>`
      : `<div style="margin-top:12px">${emptyState('check', 'Предупреждений нет', 'Так держать')}</div>`}`;
}
