import { api, state, setUser } from '../store.js';
import { el, esc, timeAgo } from '../util.js';
import { icon } from '../icons.js';
import { avatar, badges, toast, openSheet, promptSheet, emptyState } from '../ui.js';
import { openProfile } from './profile.js';
import { pickDuration } from './admin.js';
import { ruleList, openRules } from './rules.js';

const TABS = [
  ['queue', 'Публикации'],
  ['reels', 'Видео'],
  ['reports', 'Жалобы'],
  ['strikes', 'Мой статус']
];

export async function openMod() {
  if (!state.user?.isModerator && !state.user?.isAdmin) {
    try {
      const { user } = await api.me();
      if (user) setUser(user);
    } catch {}
  }
  if (!state.user?.isModerator && !state.user?.isAdmin) {
    return toast('Нет прав модератора. Если щит только что выдали, обновите страницу', 'err');
  }
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
      if (active === 'reels') await drawReels(body);
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
  const result = await api.modQueue();
  const posts = (result.posts || []).filter((post) => (post.kind || 'text') === 'text');
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
      const picked = await reasonByRule('Снять публикацию');
      if (!picked) return;
      const reason = picked.reason;
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

async function drawReels(body) {
  body.innerHTML = `
    <div class="chips" style="margin-bottom:12px">
      <button class="chip" data-kind="reels" aria-pressed="true">Всё</button>
      <button class="chip" data-kind="video" aria-pressed="false">Ролики</button>
      <button class="chip" data-kind="album" aria-pressed="false">Альбомы</button>
    </div>
    <div class="col" data-list style="gap:10px"></div>`;

  const list = body.querySelector('[data-list]');
  const load = async (kind) => {
    list.innerHTML = '<div class="card" style="height:120px;opacity:.3"></div>';
    const { posts } = await api.listPosts({ kind, limit: 30, includeRemoved: true });
    if (!posts.length) {
      list.innerHTML = emptyState('video', 'Пусто', 'Роликов и альбомов пока нет');
      return;
    }
    list.innerHTML = '';
    posts.forEach((post) => {
      const shots = (Array.isArray(post.media) ? post.media.filter(Boolean) : []).slice(0, 4);
      const card = el(`
        <div class="card appear" style="padding:14px">
          <div class="row">
            ${avatar(post.author, 40)}
            <div class="grow" style="min-width:0">
              <div class="row" style="gap:6px"><span class="strong small truncate">${esc(post.author.displayName)}</span>${badges(post.author)}</div>
              <div class="tiny muted">@${esc(post.author.username)} · ${timeAgo(post.createdAt)} · ${post.kind === 'video' ? 'видео' : 'альбом'}</div>
            </div>
            ${post.removed ? '<span class="pill bad">снят</span>' : '<span class="pill good">в разделе</span>'}
          </div>
          ${post.text ? `<p class="post-text">${esc(post.text)}</p>` : ''}
          ${post.kind === 'video'
            ? `<div class="post-image" style="margin-top:12px;position:relative">${post.poster ? `<img src="${esc(post.poster)}" alt="" loading="lazy">` : '<span class="post-video-blank"></span>'}<span class="post-video-play">${icon('play', 22)}</span></div>`
            : shots.length
              ? `<div class="composer-shots" style="margin-top:12px">${shots.map((src) => `<span class="composer-shot"><img src="${esc(src)}" alt="" loading="lazy"></span>`).join('')}</div>`
              : ''}
          ${post.removed ? `<div class="tiny muted" style="margin-top:8px">Причина: ${esc(post.removedReason)}</div>` : ''}
          <div class="row" style="margin-top:12px;gap:8px">
            <button class="btn btn-sm" data-watch>${icon('eye', 15)} Открыть</button>
            <button class="btn btn-sm" data-author>${icon('profile', 15)} Автор</button>
            ${post.removed ? '' : `<button class="btn btn-sm btn-danger grow" data-remove>${icon('trash', 15)} Снять</button>`}
            <button class="btn btn-sm grow" data-punish>${icon('warn', 15)} Наказать</button>
          </div>
        </div>`);
      card.querySelector('[data-watch]').onclick = async () => {
        const { openVideo } = await import('./videos.js');
        openVideo(post);
      };
      card.querySelector('[data-author]').onclick = () => openProfile(post.author.username);
      card.querySelector('[data-remove]')?.addEventListener('click', async () => {
        const picked = await reasonByRule('Снять публикацию');
        if (!picked) return;
        const reason = picked.reason;
        try {
          await api.removePost(post.id, reason);
          toast('Снято');
          load(kind);
        } catch (error) {
          toast(error.message, 'err');
        }
      });
      card.querySelector('[data-punish]').onclick = () => openPunish(post.author, () => load(kind));
      list.appendChild(card);
    });
  };

  body.querySelectorAll('[data-kind]').forEach((chip) => {
    chip.onclick = () => {
      body.querySelectorAll('[data-kind]').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      load(chip.dataset.kind);
    };
  });
  await load('reels');
}

export function pickRule() {
  return new Promise((done) => {
    const rules = ruleList();
    const body = el(`<div class="col" style="gap:10px">
      <input class="input" data-find placeholder="Поиск: слово или номер пункта">
      <div class="row" style="gap:8px">
        <button class="btn btn-sm grow" data-own>${icon('edit', 15)} Своими словами</button>
        <button class="btn btn-sm grow" data-all>${icon('book', 15)} Все правила</button>
      </div>
      <div class="col" data-list style="gap:6px"></div>
    </div>`);
    const sheet = openSheet('Пункт правил', body, { onClose: () => done(null) });
    const list = body.querySelector('[data-list]');

    const close = (value) => {
      done(value);
      document.body.style.overflow = '';
      sheet.sheet.parentElement.remove();
    };

    const draw = (query) => {
      const needle = query.trim().toLowerCase();
      const rows = needle
        ? rules.filter((rule) => rule.no.startsWith(needle) || rule.text.toLowerCase().includes(needle) || rule.block.toLowerCase().includes(needle))
        : rules;
      if (!rows.length) {
        list.innerHTML = `<p class="tiny muted" style="text-align:center;padding:14px 0">Ничего не нашлось</p>`;
        return;
      }
      list.innerHTML = '';
      rows.forEach((rule) => {
        const row = el(`<button class="rule-pick">
          <span class="rule-no">${esc(rule.no)}</span>
          <span class="grow" style="min-width:0;text-align:left">${esc(rule.text)}</span>
          <span class="rule-pun ${rule.tone}">${esc(rule.label)}</span>
        </button>`);
        row.onclick = () => close(rule);
        list.appendChild(row);
      });
    };

    body.querySelector('[data-find]').oninput = (event) => draw(event.target.value);
    body.querySelector('[data-own]').onclick = () => close('own');
    body.querySelector('[data-all]').onclick = () => {
      close(null);
      openRules();
    };
    draw('');
  });
}

async function reasonByRule(title) {
  const rule = await pickRule();
  if (!rule) return null;
  const value = rule === 'own' ? '' : `п. ${rule.no} — ${rule.text}`;
  const reason = await promptSheet({ title, label: 'Причина, её увидят автор и админ', placeholder: 'Опишите подробно', multiline: true, value });
  if (!reason) return null;
  return { reason, rule: rule === 'own' ? null : rule };
}

export function openPunish(user, done) {
  const body = el(`
    <div class="col" style="gap:6px">
      <div class="row" style="padding:0 4px 8px">${avatar(user, 46)}
        <div class="grow"><div class="strong">${esc(user.displayName)}</div><div class="tiny muted">@${esc(user.username)}</div></div></div>
      <button class="list-item" data-rule style="color:var(--accent)">${icon('book', 18)}<span>По пункту правил</span></button>
      <div class="tiny muted" style="padding:2px 4px 8px">Мера и срок подставятся сами, но их можно изменить</div>
      <button class="list-item" data-kind="warn">${icon('warn', 18)}<span>Предупреждение</span></button>
      <button class="list-item" data-kind="mute" style="color:#c6b083">${icon('mute', 18)}<span>Мут</span></button>
      <button class="list-item" data-kind="ban" style="color:#c98b8b">${icon('ban', 18)}<span>Блокировка</span></button>
    </div>`);
  const sheet = openSheet('Наказание', body);

  const apply = async ({ kind, reason, suggested }) => {
    let minutes = 0;
    if (kind !== 'warn') {
      minutes = await pickDuration(suggested);
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

  body.querySelector('[data-rule]').onclick = async () => {
    sheet.close();
    const rule = await pickRule();
    if (!rule) return;
    if (rule === 'own') return openPunish(user, done);
    const reason = await promptSheet({
      title: `Пункт ${rule.no}`,
      label: 'Причина, её увидят автор и админ',
      placeholder: 'Опишите подробно',
      multiline: true,
      value: `п. ${rule.no} — ${rule.text}`
    });
    if (!reason) return;
    await apply({ kind: rule.kind, reason, suggested: rule.minutes });
  };

  body.querySelectorAll('[data-kind]').forEach((button) => {
    button.onclick = async () => {
      const kind = button.dataset.kind;
      sheet.close();
      const reason = await promptSheet({ title: 'Причина', label: 'Что нарушил пользователь', placeholder: 'Опишите подробно', multiline: true });
      if (!reason) return;
      await apply({ kind, reason });
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
