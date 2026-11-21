import { state, isPremium, api, MOODS } from '../store.js';
import { el, esc, plural } from '../util.js';
import { icon } from '../icons.js';
import { openSheet } from '../ui.js';

export async function openProStats() {
  if (!isPremium(state.user)) return showPremiumOnly('Расширенная статистика');
  const body = el(`<div class="col" style="gap:10px"><div class="card" style="padding:14px;text-align:center"><div class="tiny muted">Собираем данные…</div></div></div>`);
  const sheet = openSheet('Расширенная статистика', body);
  try {
    const me = state.user;
    const [meResp, userResp, giftsResp] = await Promise.all([
      api.me().catch(() => ({ user: me })),
      api.getUser(me.username).catch(() => ({ user: me, posts: [] })),
      api.gifts ? api.gifts(me.id).catch(() => ({ gifts: [] })) : Promise.resolve({ gifts: [] })
    ]);
    const u = meResp?.user || userResp?.user || me;
    const postArr = Array.isArray(userResp?.posts) ? userResp.posts : [];
    const gifts = Array.isArray(giftsResp?.gifts) ? giftsResp.gifts : [];

    const moodCounts = {};
    const hourCounts = new Array(24).fill(0);
    for (const p of postArr) {
      if (p.mood) moodCounts[p.mood] = (moodCounts[p.mood] || 0) + 1;
      const ts = Number(p.createdAt);
      if (ts && ts > 0) {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) hourCounts[d.getHours()] += 1;
      }
    }
    const moodEntries = Object.entries(moodCounts).sort((a, b) => b[1] - a[1]);
    const topMood = moodEntries[0];
    const moodTotal = moodEntries.reduce((s, e) => s + e[1], 0);
    const moodPct = topMood && moodTotal ? Math.round((topMood[1] / moodTotal) * 100) : 0;
    const moodLabel = topMood ? (MOODS[topMood[0]]?.label || topMood[0]) : '—';

    let topHour = -1;
    let topHourCount = 0;
    for (let h = 0; h < 24; h++) {
      if (hourCounts[h] > topHourCount) { topHourCount = hourCounts[h]; topHour = h; }
    }
    const hourLabel = topHour >= 0
      ? `${String(topHour).padStart(2, '0')}:00–${String((topHour + 1) % 24).padStart(2, '0')}:00`
      : '—';

    const ageDays = u.createdAt ? Math.max(0, Math.floor((Date.now() - u.createdAt) / 86400000)) : 0;
    const gamesFromCounter = Number(localStorage.getItem('spokum.gamesPlayed')) || 0;
    let gamesFromStats = 0;
    try {
      const raw = JSON.parse(localStorage.getItem('spokum.gameStats') || '{}');
      gamesFromStats = Number(raw.totalPlays) || 0;
    } catch {}
    const gamesTotal = Math.max(gamesFromCounter, gamesFromStats);
    const coins = Number(u.coins) || 0;
    const bestStreak = Number(u.bestStreak) || 0;

    const rows = [
      { icon: 'feed',   label: 'Всего постов',       value: String(u.posts ?? postArr.length ?? 0) },
      { icon: 'heart',  label: 'Лайков собрано',     value: String(u.likes ?? 0) },
      { icon: 'gift',   label: 'Подарков получено', value: String(gifts.length) },
      { icon: 'wave',   label: 'Частое настроение',  value: `${moodLabel} · ${moodPct}%` },
      { icon: 'flame',  label: 'Лучший стрик',       value: plural(bestStreak, 'день', 'дня', 'дней') },
      { icon: 'games',  label: 'Сыграно игр',        value: String(gamesTotal) },
      { icon: 'coin',   label: 'Монет на счету',      value: String(coins) },
      { icon: 'clock',  label: 'Дней в СпокУм',       value: plural(ageDays, 'день', 'дня', 'дней') },
      { icon: 'spark',  label: 'Час пиковой активности', value: hourLabel }
    ];

    body.innerHTML = `<div class="col" style="gap:8px">
      <div class="card" style="padding:10px 12px;display:flex;align-items:center;gap:10px">
        <span style="color:var(--accent)">${icon('chart', 20)}</span>
        <div class="grow">
          <div class="strong small">Расширенная статистика</div>
          <div class="tiny muted">@${esc(u.username || '')} · обновлено сейчас</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
        ${rows.map((r) => `<div class="card" style="padding:12px">
          <div class="row" style="gap:8px;margin-bottom:6px;color:var(--muted);align-items:center">${icon(r.icon, 16)}<span class="tiny">${esc(r.label)}</span></div>
          <div class="strong" style="font-size:17px;line-height:1.2">${esc(r.value)}</div>
        </div>`).join('')}
      </div>
      <p class="tiny muted" style="line-height:1.5;margin:6px 4px 0">Считается из ваших записей, лайков, подарков и игровых результатов. Час пиковой активности — это время суток, когда вы чаще всего публикуете записи.</p>
    </div>`;
  } catch (error) {
    body.innerHTML = `<div class="card" style="padding:14px"><div class="strong small" style="color:#c98b8b">Не удалось загрузить</div><div class="tiny muted">${esc(error?.message || 'Ошибка')}</div></div>`;
  }
  return sheet;
}

async function showPremiumOnly(title) {
  const body = el(`<div class="col" style="gap:12px">
    <div class="card" style="padding:16px;text-align:center">
      <div style="color:#d8b45c;margin-bottom:8px">${icon('crown', 32)}</div>
      <div class="strong">Только для премиума</div>
      <div class="tiny muted" style="margin-top:4px;line-height:1.5">«${esc(title)}» доступно только обладателям СпокУм Премиум.</div>
    </div>
    <button class="btn btn-primary" data-billing>${icon('crown', 16)} Оформить премиум</button>
  </div>`);
  const sheet = openSheet(title, body);
  body.querySelector('[data-billing]').onclick = async () => {
    sheet.close();
    try {
      const { openBilling } = await import('./settings.js?v=20261122');
      openBilling();
    } catch {}
  };
  return sheet;
}
