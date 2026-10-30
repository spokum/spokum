import { api, state, setUser } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet } from '../ui.js';

/**
 * Daily Rewards — 7-day streak.
 *
 * State is stored in localStorage under `spokum.dailyReward`:
 *   { lastClaim: number, day: 1..7 }
 *
 * Streak rules:
 *  - if lastClaim is today        → already claimed, come back tomorrow
 *  - if lastClaim is yesterday    → streak continues, next day available
 *  - if older (or never claimed)  → reset to day 1
 *
 * Reward schedule:
 *   Day 1: 10 coins
 *   Day 2: 15 coins
 *   Day 3: 20 coins
 *   Day 4: 25 coins
 *   Day 5: 30 coins
 *   Day 6: 40 coins
 *   Day 7: 50 coins + 1 day premium (if api.grantPremium is available)
 */

const KEY = 'spokum.dailyReward';
const DAY_MS = 86400000;

const REWARDS = [
  { day: 1, coins: 10 },
  { day: 2, coins: 15 },
  { day: 3, coins: 20 },
  { day: 4, coins: 25 },
  { day: 5, coins: 30 },
  { day: 6, coins: 40 },
  { day: 7, coins: 50, premiumDays: 1 }
];

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw.lastClaim === 'number' && typeof raw.day === 'number') return raw;
  } catch {}
  return { lastClaim: 0, day: 0 };
}

function write(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

/**
 * Compute the streak status:
 *   - claimedToday: true if user already claimed today's reward
 *   - availableDay: 1..7 — the day available to claim now, or 0 if already claimed today
 *   - claimedDays: 0..7 — how many days in this streak are already claimed
 */
export function status() {
  const data = read();
  const todayStart = startOfDay(Date.now());
  const yesterdayStart = todayStart - DAY_MS;
  if (data.lastClaim >= todayStart) {
    return { claimedToday: true, availableDay: 0, claimedDays: data.day };
  }
  if (data.lastClaim >= yesterdayStart) {
    if (data.day >= 7) {
      // Day 7 was claimed yesterday — start a fresh streak at day 1
      return { claimedToday: false, availableDay: 1, claimedDays: 0 };
    }
    return { claimedToday: false, availableDay: data.day + 1, claimedDays: data.day };
  }
  return { claimedToday: false, availableDay: 1, claimedDays: 0 };
}

async function claim(onRefresh) {
  const s = status();
  if (s.claimedToday) return;
  const day = s.availableDay;
  const reward = REWARDS[day - 1];
  if (!reward) return;

  let coinsGranted = 0;
  try {
    const r = await api.grantCoins(reward.coins, `Ежедневная награда день ${day}`);
    coinsGranted = r?.added ?? 0;
    if (r?.coins != null && state.user) {
      state.user.coins = r.coins;
    }
  } catch (error) {
    toast(error?.message || 'Не удалось начислить монеты', 'err');
    return;
  }

  let premiumGranted = false;
  if (reward.premiumDays && state.user) {
    try {
      if (typeof api.grantPremium === 'function') {
        await api.grantPremium(state.user.id, reward.premiumDays, 'Ежедневная награда');
        premiumGranted = true;
        const base = Math.max(state.user.premiumUntil || 0, Date.now());
        state.user.premiumUntil = base + reward.premiumDays * DAY_MS;
        if (typeof setUser === 'function') setUser({ ...state.user });
      }
    } catch {
      // grantPremium is admin-only in current backends — silently skip.
      // The user still gets the coins.
    }
  }

  write({ lastClaim: Date.now(), day });

  let msg = `+${coinsGranted || reward.coins} монет`;
  if (premiumGranted) msg += ` · +${reward.premiumDays} день премиума`;
  toast(msg, 'ok');
  onRefresh?.();
}

function cardHtml(reward, s) {
  const claimed = reward.day <= s.claimedDays;
  const current = !claimed && reward.day === s.availableDay;
  let cls = 'reward-card';
  if (claimed) cls += ' is-claimed';
  else if (current) cls += ' is-current';
  else cls += ' is-future';

  const glyph = claimed
    ? `<span class="reward-glyph">${icon('check', 18)}</span>`
    : current
      ? `<span class="reward-glyph">${icon('gift', 18)}</span>`
      : `<span class="reward-glyph">${icon('star', 16)}</span>`;
  const premium = reward.premiumDays
    ? `<span class="reward-premium">${icon('crown', 10)} ${reward.premiumDays}д премиума</span>`
    : '';

  return `
    <div class="${cls}">
      <div class="reward-day">День ${reward.day}</div>
      ${glyph}
      <div class="reward-coins">+${reward.coins}</div>
      ${premium}
    </div>`;
}

export function openDailyRewards() {
  const body = el('<div class="col" data-host style="gap:14px"></div>');
  const sheet = openSheet('Ежедневные награды', body);

  const draw = () => {
    const s = status();
    const todayReward = REWARDS[s.availableDay - 1] || REWARDS[s.claimedDays - 1] || REWARDS[0];
    body.innerHTML = `
      <p class="small muted" style="margin:0;line-height:1.55">
        Заходите каждый день — награда растёт. На седьмой день дополнительно даём день премиума.
      </p>
      <div class="rewards-strip">${REWARDS.map((r) => cardHtml(r, s)).join('')}</div>
      <div data-status style="text-align:center;min-height:24px"></div>
      <button class="btn btn-primary" data-claim style="width:100%;font-size:15px;padding:13px"></button>
      <p class="tiny muted center" style="margin:0;line-height:1.5">
        Серия: ${s.claimedDays} из 7 дней<br>
        ${s.claimedToday ? 'Завтра приходите за следующей наградой' : 'Нажмите, чтобы забрать сегодня'}
      </p>`;

    const btn = body.querySelector('[data-claim]');
    if (s.claimedToday) {
      btn.disabled = true;
      btn.textContent = 'Сегодня уже забрали';
    } else if (todayReward) {
      btn.textContent = `Забрать ${todayReward.coins} монет${todayReward.premiumDays ? ' + день премиума' : ''}`;
    } else {
      btn.textContent = 'Забрать награду';
    }
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = 'Начисляем…';
      await claim(draw);
    };
  };

  draw();
  return sheet;
}
