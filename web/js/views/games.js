import { api, state } from '../store.js';
import { GAMES } from '../games/index.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { avatar, toast, emptyState } from '../ui.js';

const bestKey = (id) => `spokum.best.${id}`;

export async function render(root) {
  root.innerHTML = `
    <div class="topbar">
      <div><h1>Игры</h1><p class="sub">Разгрузить голову на пять минут</p></div>
    </div>
    <div class="game-grid" data-grid></div>
    <div class="row between" style="margin:22px 2px 10px"><div class="strong small">Таблица лидеров</div>
      <select class="select" data-game style="width:auto;padding:6px 10px;font-size:12px">
        ${GAMES.map((g) => `<option value="${g.id}">${esc(g.title)}</option>`).join('')}
      </select>
    </div>
    <div class="card" data-board></div>`;

  const grid = root.querySelector('[data-grid]');
  const shown = GAMES;
  shown.forEach((game) => {
    const best = Number(localStorage.getItem(bestKey(game.id)) || 0);
    const card = el(`
      <button class="game-card appear">
        <div class="art" style="background:linear-gradient(150deg,${game.tint[0]},${game.tint[1]})"></div>
        <div class="art" style="background:radial-gradient(60% 60% at 80% 15%, rgba(255,255,255,.16), transparent 70%)"></div>
        <div style="position:relative;margin-bottom:auto;color:#eef2fb;opacity:.9">${icon('play', 22)}</div>
        <div class="label" style="color:#eef2fb">${esc(game.title)}</div>
        <div class="desc">${esc(game.desc)}</div>
        ${best ? `<div class="desc" style="color:var(--accent)">Рекорд ${best}</div>` : ''}
      </button>`);
    card.onclick = () => launch(game, () => render(root));
    grid.appendChild(card);
  });

  const select = root.querySelector('[data-game]');
  const board = root.querySelector('[data-board]');
  const drawBoard = async () => {
    try {
      const { leaderboard } = await api.leaderboard(select.value);
      board.innerHTML = leaderboard.length
        ? leaderboard
            .map(
              (row, i) => `<div class="list-item" style="padding:8px 6px"><span class="strong muted" style="width:22px">${i + 1}</span>
                ${avatar(row, 40)}<div class="grow"><div class="strong small truncate">${esc(row.displayName || row.display_name || '')}</div>
                <div class="tiny muted">@${esc(row.username)}</div></div><span class="strong">${row.score}</span></div>`
            )
            .join('')
        : emptyState('trophy', 'Рекордов ещё нет', 'Сыграй первым и займи вершину');
    } catch (error) {
      board.innerHTML = emptyState('warn', 'Не загрузилось', error.message);
    }
  };
  select.onchange = drawBoard;
  await drawBoard();
}

function launch(game, done) {
  const stage = el(`
    <div class="game-stage">
      <header>
        <button class="btn btn-icon btn-ghost" data-back>${icon('back', 20)}</button>
        <div class="grow"><div class="strong small">${esc(game.title)}</div><div class="tiny" style="opacity:.6">${esc(game.desc)}</div></div>
        <div class="pill" data-best></div>
      </header>
      <canvas></canvas>
    </div>`);
  document.body.appendChild(stage);
  const canvas = stage.querySelector('canvas');
  const bestBox = stage.querySelector('[data-best]');
  let best = Number(localStorage.getItem(bestKey(game.id)) || 0);
  bestBox.textContent = `Рекорд ${best}`;

  let paidFor = 0;
  let busy = false;

  const report = async (score) => {
    if (score > best) {
      best = score;
      localStorage.setItem(bestKey(game.id), String(score));
      bestBox.textContent = `Рекорд ${best}`;
      toast(`Новый рекорд ${score}`);
    }
    if (!state.user || busy) return;
    busy = true;
    try {
      await api.saveScore(game.id, score).catch(() => {});
      const earned = Math.floor(score / 40) - Math.floor(paidFor / 40);
      if (api.grantCoins && earned > 0) {
        paidFor = Math.max(paidFor, score);
        const purse = await api.grantCoins(earned, `Игра: ${game.title}`);
        if (purse?.added > 0) {
          toast(`+${purse.added} монет`);
          const { setUser } = await import('../store.js');
          const { user } = await api.me();
          if (user) setUser(user);
        }
      } else if (score > paidFor) {
        paidFor = score;
      }
    } catch {}
    busy = false;
  };

  let handle = null;
  requestAnimationFrame(() => {
    handle = game.mount(canvas, report);
  });

  stage.querySelector('[data-back]').onclick = async () => {
    const current = handle ? handle.score() : 0;
    handle?.stop();
    stage.remove();
    if (current > 0) await report(current);
    done?.();
  };
}
