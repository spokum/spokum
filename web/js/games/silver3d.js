const SIZE = 17;
const FOV = Math.PI / 3;
const CRYSTAL_COUNT = 6;

function canvasTexture(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

function textures() {
  const wall = canvasTexture(96);
  const wg = wall.ctx.createLinearGradient(0, 0, 96, 96);
  wg.addColorStop(0, '#52675e');
  wg.addColorStop(0.45, '#263c38');
  wg.addColorStop(1, '#152523');
  wall.ctx.fillStyle = wg;
  wall.ctx.fillRect(0, 0, 96, 96);
  for (let row = 0; row < 4; row += 1) {
    const offset = row % 2 ? 24 : 0;
    for (let col = -1; col < 4; col += 1) {
      const x = col * 32 + offset;
      const y = row * 24;
      const light = 27 + Math.random() * 18;
      wall.ctx.fillStyle = 'rgb(' + Math.round(light * 1.22) + ',' + Math.round(light * 1.65) + ',' + Math.round(light * 1.48) + ')';
      wall.ctx.fillRect(x + 1, y + 1, 30, 22);
      wall.ctx.fillStyle = 'rgba(8,17,16,.38)';
      wall.ctx.fillRect(x + 2, y + 2, 28, 2);
      wall.ctx.fillRect(x + 2, y + 2, 2, 18);
      wall.ctx.fillStyle = 'rgba(153,210,174,.08)';
      wall.ctx.fillRect(x + 4, y + 5, 21, 1);
    }
  }
  for (let i = 0; i < 420; i += 1) {
    const x = Math.random() * 96;
    const y = Math.random() * 96;
    wall.ctx.fillStyle = Math.random() > 0.48 ? 'rgba(128,194,158,.16)' : 'rgba(4,13,12,.22)';
    wall.ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  wall.ctx.globalAlpha = 0.3;
  wall.ctx.strokeStyle = '#74d8ad';
  wall.ctx.lineWidth = 1.2;
  wall.ctx.beginPath();
  wall.ctx.moveTo(14, 23);
  wall.ctx.lineTo(20, 30);
  wall.ctx.lineTo(16, 39);
  wall.ctx.lineTo(26, 48);
  wall.ctx.stroke();
  wall.ctx.globalAlpha = 1;

  const floor = canvasTexture(64);
  floor.ctx.fillStyle = '#172522';
  floor.ctx.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 16) {
    for (let x = 0; x < 64; x += 16) {
      const n = 20 + Math.random() * 16;
      floor.ctx.fillStyle = 'rgb(' + Math.round(n) + ',' + Math.round(n * 1.42) + ',' + Math.round(n * 1.22) + ')';
      floor.ctx.fillRect(x + 1, y + 1, 14, 14);
      floor.ctx.fillStyle = 'rgba(121,196,157,.08)';
      floor.ctx.fillRect(x + 3, y + 3, 8, 1);
    }
  }
  for (let i = 0; i < 160; i += 1) {
    floor.ctx.fillStyle = Math.random() > 0.5 ? 'rgba(145,206,161,.17)' : 'rgba(3,12,11,.35)';
    floor.ctx.fillRect(Math.random() * 64, Math.random() * 64, 1, 1);
  }

  const crystal = canvasTexture(64);
  const cg = crystal.ctx.createRadialGradient(32, 28, 2, 32, 32, 34);
  cg.addColorStop(0, 'rgba(91,255,220,.45)');
  cg.addColorStop(1, 'rgba(39,209,190,0)');
  crystal.ctx.fillStyle = cg;
  crystal.ctx.fillRect(0, 0, 64, 64);
  crystal.ctx.shadowColor = '#73ffe0';
  crystal.ctx.shadowBlur = 18;
  crystal.ctx.beginPath();
  crystal.ctx.moveTo(32, 5);
  crystal.ctx.lineTo(51, 23);
  crystal.ctx.lineTo(42, 52);
  crystal.ctx.lineTo(22, 52);
  crystal.ctx.lineTo(13, 23);
  crystal.ctx.closePath();
  const shard = crystal.ctx.createLinearGradient(14, 8, 50, 50);
  shard.addColorStop(0, '#effffb');
  shard.addColorStop(0.22, '#9cffe9');
  shard.addColorStop(0.55, '#37d9c4');
  shard.addColorStop(1, '#176b77');
  crystal.ctx.fillStyle = shard;
  crystal.ctx.fill();
  crystal.ctx.shadowBlur = 0;
  crystal.ctx.strokeStyle = 'rgba(235,255,250,.82)';
  crystal.ctx.lineWidth = 1;
  crystal.ctx.stroke();
  crystal.ctx.beginPath();
  crystal.ctx.moveTo(32, 7);
  crystal.ctx.lineTo(33, 49);
  crystal.ctx.lineTo(22, 50);
  crystal.ctx.lineTo(15, 24);
  crystal.ctx.closePath();
  crystal.ctx.fillStyle = 'rgba(255,255,255,.24)';
  crystal.ctx.fill();

  return { wall: wall.canvas, floor: floor.canvas, floorData: floor.ctx.getImageData(0, 0, 64, 64).data, crystal: crystal.canvas };
}

function makeMaze() {
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(1));
  const stack = [[1, 1]];
  grid[1][1] = 0;
  while (stack.length) {
    const last = stack[stack.length - 1];
    const options = [[2, 0], [-2, 0], [0, 2], [0, -2]]
      .filter(([dx, dy]) => {
        const x = last[0] + dx;
        const y = last[1] + dy;
        return x > 0 && y > 0 && x < SIZE - 1 && y < SIZE - 1 && grid[y][x] === 1;
      });
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [dx, dy] = options[Math.floor(Math.random() * options.length)];
    grid[last[1] + dy / 2][last[0] + dx / 2] = 0;
    grid[last[1] + dy][last[0] + dx] = 0;
    stack.push([last[0] + dx, last[1] + dy]);
  }

  const queue = [[1, 1]];
  const distance = new Map([['1,1', 0]]);
  for (let i = 0; i < queue.length; i += 1) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = nx + ',' + ny;
      if (grid[ny]?.[nx] === 0 && !distance.has(key)) {
        distance.set(key, distance.get(x + ',' + y) + 1);
        queue.push([nx, ny]);
      }
    }
  }
  const cells = queue.slice(1).map(([x, y]) => ({ x, y, distance: distance.get(x + ',' + y) }));
  cells.sort((a, b) => b.distance - a.distance);
  const exit = cells[0] || { x: SIZE - 2, y: SIZE - 2 };
  const candidates = cells.filter((cell) => cell.distance > 4 && Math.hypot(cell.x - exit.x, cell.y - exit.y) > 2);
  candidates.sort(() => Math.random() - 0.5);
  const crystals = [];
  for (const cell of candidates) {
    if (crystals.every((other) => Math.hypot(other.x - cell.x, other.y - cell.y) > 3)) crystals.push(cell);
    if (crystals.length === CRYSTAL_COUNT) break;
  }
  for (const cell of candidates) {
    if (crystals.length === CRYSTAL_COUNT) break;
    if (!crystals.includes(cell)) crystals.push(cell);
  }
  return {
    grid,
    exit: { x: exit.x + 0.5, y: exit.y + 0.5 },
    crystals: crystals.slice(0, CRYSTAL_COUNT).map((cell) => ({ x: cell.x + 0.5, y: cell.y + 0.5, found: false }))
  };
}

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function mount(canvas, report) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return { score: () => 0, stop: () => {} };
  const tex = textures();
  const floorCanvas = document.createElement('canvas');
  const floorCtx = floorCanvas.getContext('2d', { willReadFrequently: true });
  let floorImage = null;
  let width = 1;
  let height = 1;
  let frame = 0;
  let last = performance.now();
  let stopped = false;
  let paused = false;
  let look = null;
  let stick = null;
  let state = null;
  const keys = new Set();
  const rays = [];
  const cleanups = [];

  const reset = () => {
    const maze = makeMaze();
    state = {
      grid: maze.grid,
      exit: maze.exit,
      crystals: maze.crystals,
      x: 1.5,
      y: 1.5,
      angle: 0,
      time: 180,
      score: 0,
      found: 0,
      over: false,
      won: false
    };
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 1.6);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const fw = Math.min(300, Math.max(160, Math.round(width * 0.5)));
    const fh = Math.min(180, Math.max(90, Math.round(height * 0.38)));
    floorCanvas.width = fw;
    floorCanvas.height = fh;
    floorImage = floorCtx.createImageData(fw, fh);
  };

  const solid = (x, y) => {
    const mx = Math.floor(x);
    const my = Math.floor(y);
    return !state.grid[my] || state.grid[my][mx] !== 0;
  };

  const move = (dx, dy) => {
    const radius = 0.18;
    if (!solid(state.x + dx + Math.sign(dx || 1) * radius, state.y)) state.x += dx;
    if (!solid(state.x, state.y + dy + Math.sign(dy || 1) * radius)) state.y += dy;
  };

  const bind = (target, event, handler, options) => {
    target.addEventListener(event, handler, options);
    cleanups.push(() => target.removeEventListener(event, handler, options));
  };

  const pointerDown = (event) => {
    event.preventDefault();
    paused = false;
    if (state.over) {
      reset();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    try { canvas.setPointerCapture(event.pointerId); } catch {}
    if (x < width * 0.42 && y > height * 0.57) {
      stick = { id: event.pointerId, ox: x, oy: y, x, y };
    } else {
      look = { id: event.pointerId, x };
    }
  };
  const pointerMove = (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (stick && stick.id === event.pointerId) {
      stick.x = x;
      stick.y = y;
    } else if (look && look.id === event.pointerId) {
      state.angle = wrapAngle(state.angle + (x - look.x) * 0.006);
      look.x = x;
    }
  };
  const pointerUp = (event) => {
    if (stick && stick.id === event.pointerId) stick = null;
    if (look && look.id === event.pointerId) look = null;
  };
  bind(canvas, 'pointerdown', pointerDown, { passive: false });
  bind(canvas, 'pointermove', pointerMove, { passive: false });
  bind(canvas, 'pointerup', pointerUp);
  bind(canvas, 'pointercancel', pointerUp);
  bind(window, 'keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
    if (state.over && event.key === ' ') {
      reset();
      paused = false;
    }
    if (event.key === 'Escape') paused = !paused;
    keys.add(event.key.toLowerCase());
  });
  bind(window, 'keyup', (event) => keys.delete(event.key.toLowerCase()));
  bind(window, 'blur', () => { paused = true; });
  bind(document, 'visibilitychange', () => { if (document.hidden) paused = true; });
  bind(window, 'resize', resize);
  resize();
  reset();

  const collect = () => {
    for (const crystal of state.crystals) {
      if (crystal.found) continue;
      if (Math.hypot(crystal.x - state.x, crystal.y - state.y) < 0.42) {
        crystal.found = true;
        state.found += 1;
        state.score += 100;
      }
    }
    if (state.found === CRYSTAL_COUNT && Math.hypot(state.exit.x - state.x, state.exit.y - state.y) < 0.48) {
      state.won = true;
      state.over = true;
      state.score += Math.max(0, Math.ceil(state.time)) * 5;
      report(state.score);
    }
  };

  const update = (dt) => {
    if (state.over || paused) return;
    state.time -= dt;
    const forward = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
    const strafe = Number(keys.has('d')) - Number(keys.has('a'));
    const turn = Number(keys.has('arrowright')) - Number(keys.has('arrowleft'));
    state.angle = wrapAngle(state.angle + turn * dt * 2.3);
    const speed = 2.45 * dt;
    move((Math.cos(state.angle) * forward - Math.sin(state.angle) * strafe) * speed, (Math.sin(state.angle) * forward + Math.cos(state.angle) * strafe) * speed);
    if (stick) {
      const dx = stick.x - stick.ox;
      const dy = stick.y - stick.oy;
      const length = Math.max(1, Math.hypot(dx, dy));
      const power = Math.min(1, length / 54);
      if (power > 0.12) {
        const f = (-dy / length) * power * speed * 1.7;
        const side = (dx / length) * power * speed * 1.2;
        move(Math.cos(state.angle) * f - Math.sin(state.angle) * side, Math.sin(state.angle) * f + Math.cos(state.angle) * side);
      }
    }
    collect();
    if (state.time <= 0 && !state.over) {
      state.time = 0;
      state.over = true;
      report(state.score);
    }
  };

  const drawFloor = (horizon) => {
    const fw = floorCanvas.width;
    const fh = floorCanvas.height;
    const data = floorImage.data;
    const projection = height * 0.48;
    for (let y = 0; y < fh; y += 1) {
      const screenY = horizon + ((y + 0.5) / fh) * (height - horizon);
      const distance = projection / Math.max(1, screenY - horizon);
      const darkness = Math.max(0.2, 0.88 - distance * 0.038);
      for (let x = 0; x < fw; x += 1) {
        const camera = (x / fw - 0.5) * 2;
        const angle = state.angle + camera * FOV * 0.5;
        const worldX = state.x + Math.cos(angle) * distance;
        const worldY = state.y + Math.sin(angle) * distance;
        const tx = ((Math.floor(worldX * 12) % 64) + 64) % 64;
        const ty = ((Math.floor(worldY * 12) % 64) + 64) % 64;
        const pixel = (ty * 64 + tx) * 4;
        const out = (y * fw + x) * 4;
        data[out] = tex.floorData[pixel] * darkness;
        data[out + 1] = tex.floorData[pixel + 1] * darkness;
        data[out + 2] = tex.floorData[pixel + 2] * darkness;
        data[out + 3] = 255;
      }
    }
    floorCtx.putImageData(floorImage, 0, 0);
    ctx.drawImage(floorCanvas, 0, horizon, width, height - horizon);
  };

  const drawWorld = () => {
    const horizon = height * 0.46;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#101a26');
    sky.addColorStop(0.72, '#28423e');
    sky.addColorStop(1, '#6eaa8d');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, horizon);
    const glow = ctx.createRadialGradient(width * 0.54, horizon * 0.9, 1, width * 0.54, horizon * 0.9, width * 0.52);
    glow.addColorStop(0, 'rgba(114,255,202,.18)');
    glow.addColorStop(1, 'rgba(114,255,202,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, horizon);
    drawFloor(horizon);

    const count = Math.min(280, Math.max(100, Math.round(width * 0.48)));
    const step = FOV / count;
    const band = width / count;
    const depth = new Array(count).fill(40);
    for (let i = 0; i < count; i += 1) {
      const angle = state.angle - FOV / 2 + (i + 0.5) * step;
      const rayX = Math.cos(angle);
      const rayY = Math.sin(angle);
      let mapX = Math.floor(state.x);
      let mapY = Math.floor(state.y);
      const deltaX = Math.abs(1 / (rayX || 0.000001));
      const deltaY = Math.abs(1 / (rayY || 0.000001));
      const stepX = rayX < 0 ? -1 : 1;
      const stepY = rayY < 0 ? -1 : 1;
      let sideX = rayX < 0 ? (state.x - mapX) * deltaX : (mapX + 1 - state.x) * deltaX;
      let sideY = rayY < 0 ? (state.y - mapY) * deltaY : (mapY + 1 - state.y) * deltaY;
      let side = 0;
      let distance = 24;
      for (let guard = 0; guard < 80; guard += 1) {
        if (sideX < sideY) {
          sideX += deltaX;
          mapX += stepX;
          side = 0;
        } else {
          sideY += deltaY;
          mapY += stepY;
          side = 1;
        }
        if (!state.grid[mapY] || state.grid[mapY][mapX] !== 0) {
          distance = side === 0 ? sideX - deltaX : sideY - deltaY;
          break;
        }
      }
      const corrected = Math.max(0.08, distance * Math.cos(angle - state.angle));
      depth[i] = corrected;
      const wallHeight = Math.min(height * 1.8, height * 0.82 / corrected);
      const top = horizon - wallHeight * 0.5;
      let wallX = side === 0 ? state.y + distance * rayY : state.x + distance * rayX;
      wallX -= Math.floor(wallX);
      let texX = Math.floor(wallX * tex.wall.width);
      if ((side === 0 && rayX > 0) || (side === 1 && rayY < 0)) texX = tex.wall.width - texX - 1;
      ctx.drawImage(tex.wall, texX, 0, 1, tex.wall.height, i * band, top, band + 1, wallHeight);
      const shade = Math.max(0.12, Math.min(0.82, 1 - corrected / 11));
      ctx.fillStyle = side ? 'rgba(3,10,9,' + (0.44 - shade * 0.32) + ')' : 'rgba(3,10,9,' + (0.32 - shade * 0.25) + ')';
      ctx.fillRect(i * band, top, band + 1, wallHeight);
      ctx.fillStyle = 'rgba(4,11,12,.28)';
      ctx.fillRect(i * band, top, band + 1, 2);
    }

    const sprites = state.crystals
      .filter((item) => !item.found)
      .map((item) => ({ item, x: item.x, y: item.y, kind: 'crystal' }));
    sprites.push({ x: state.exit.x, y: state.exit.y, kind: 'exit' });
    sprites.sort((a, b) => Math.hypot(b.x - state.x, b.y - state.y) - Math.hypot(a.x - state.x, a.y - state.y));
    for (const sprite of sprites) {
      const dx = sprite.x - state.x;
      const dy = sprite.y - state.y;
      const distance = Math.hypot(dx, dy);
      const delta = wrapAngle(Math.atan2(dy, dx) - state.angle);
      if (Math.abs(delta) > FOV * 0.57 || distance < 0.2) continue;
      const screenX = width * 0.5 + Math.tan(delta) / Math.tan(FOV * 0.5) * width * 0.5;
      const ray = Math.max(0, Math.min(count - 1, Math.floor(screenX / width * count)));
      if (distance > depth[ray] + 0.18) continue;
      const size = Math.min(height * 0.56, height * (sprite.kind === 'exit' ? 0.42 : 0.38) / distance);
      const y = horizon + size * 0.26;
      if (sprite.kind === 'crystal') {
        const pulse = 0.68 + Math.sin(performance.now() * 0.004 + sprite.x) * 0.12;
        ctx.globalAlpha = pulse;
        ctx.drawImage(tex.crystal, screenX - size * 0.36, y - size, size * 0.72, size);
        ctx.globalAlpha = 1;
      } else {
        const open = state.found === CRYSTAL_COUNT;
        const radius = size * 0.45;
        const halo = ctx.createRadialGradient(screenX, y - radius, 2, screenX, y - radius, radius * 1.4);
        halo.addColorStop(0, open ? 'rgba(255,220,135,.75)' : 'rgba(110,166,140,.35)');
        halo.addColorStop(1, 'rgba(100,160,140,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(screenX - radius * 1.5, y - radius * 2.4, radius * 3, radius * 3);
        ctx.strokeStyle = open ? '#ffd98a' : '#79b89b';
        ctx.lineWidth = Math.max(2, size * 0.055);
        ctx.beginPath();
        ctx.ellipse(screenX, y - radius * 1.15, radius * 0.62, radius, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = open ? '#ffe9b8' : '#45675e';
        ctx.beginPath();
        ctx.ellipse(screenX, y - radius * 1.15, radius * 0.3, radius * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  const drawMap = () => {
    const size = Math.min(116, width * 0.27);
    const x0 = width - size - 14;
    const y0 = 14;
    const cell = size / SIZE;
    ctx.fillStyle = 'rgba(5,13,13,.72)';
    ctx.fillRect(x0 - 5, y0 - 5, size + 10, size + 10);
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        ctx.fillStyle = state.grid[y][x] ? 'rgba(137,177,154,.45)' : 'rgba(29,48,42,.58)';
        ctx.fillRect(x0 + x * cell, y0 + y * cell, cell + 0.4, cell + 0.4);
      }
    }
    for (const crystal of state.crystals) {
      if (!crystal.found) {
        ctx.fillStyle = '#73ffe0';
        ctx.fillRect(x0 + (crystal.x - 0.5) * cell - 1, y0 + (crystal.y - 0.5) * cell - 1, 3, 3);
      }
    }
    ctx.fillStyle = state.found === CRYSTAL_COUNT ? '#ffd98a' : '#8dbca4';
    ctx.fillRect(x0 + (state.exit.x - 0.5) * cell - 1.5, y0 + (state.exit.y - 0.5) * cell - 1.5, 4, 4);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x0 + state.x * cell, y0 + state.y * cell, Math.max(2, cell * 0.13), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.82)';
    ctx.beginPath();
    ctx.moveTo(x0 + state.x * cell, y0 + state.y * cell);
    ctx.lineTo(x0 + (state.x + Math.cos(state.angle) * 1.1) * cell, y0 + (state.y + Math.sin(state.angle) * 1.1) * cell);
    ctx.stroke();
  };

  const draw = () => {
    drawWorld();
    drawMap();
    ctx.fillStyle = 'rgba(7,16,15,.72)';
    ctx.fillRect(12, 12, 156, 58);
    ctx.fillStyle = '#e9fff5';
    ctx.font = '700 14px Inter, system-ui, sans-serif';
    ctx.fillText('Кристаллы ' + state.found + '/' + CRYSTAL_COUNT, 23, 34);
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.fillStyle = state.time < 25 ? '#ffac90' : 'rgba(233,255,245,.78)';
    ctx.fillText('Время ' + Math.ceil(state.time) + ' сек', 23, 55);
    if (stick) {
      ctx.fillStyle = 'rgba(220,255,240,.13)';
      ctx.beginPath();
      ctx.arc(stick.ox, stick.oy, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(220,255,240,.48)';
      ctx.beginPath();
      ctx.arc(stick.x, stick.y, 15, 0, Math.PI * 2);
      ctx.fill();
    }
    if (paused && !state.over) {
      ctx.fillStyle = 'rgba(4,10,11,.68)';
      ctx.fillRect(0, 0, width, height);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f2fff8';
      ctx.font = '700 24px Inter, system-ui, sans-serif';
      ctx.fillText('Пауза', width / 2, height / 2);
      ctx.font = '500 13px Inter, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(242,255,248,.72)';
      ctx.fillText('Коснитесь экрана, чтобы продолжить', width / 2, height / 2 + 25);
      ctx.textAlign = 'start';
    }
    if (state.over) {
      ctx.fillStyle = 'rgba(4,10,11,.78)';
      ctx.fillRect(0, 0, width, height);
      ctx.textAlign = 'center';
      ctx.fillStyle = state.won ? '#a7ffe0' : '#f1fff7';
      ctx.font = '750 26px Inter, system-ui, sans-serif';
      ctx.fillText(state.won ? 'Портал открыт' : 'Время вышло', width / 2, height / 2 - 16);
      ctx.font = '600 16px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#f1fff7';
      ctx.fillText('Очки ' + state.score, width / 2, height / 2 + 13);
      ctx.font = '500 13px Inter, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(241,255,247,.7)';
      ctx.fillText('Коснитесь, чтобы пройти лабиринт заново', width / 2, height / 2 + 39);
      ctx.textAlign = 'start';
    }
  };

  const tick = (now) => {
    if (stopped) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    update(dt);
    draw();
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return {
    score: () => state.score,
    stop: () => {
      stopped = true;
      cancelAnimationFrame(frame);
      cleanups.forEach((remove) => remove());
    }
  };
}
