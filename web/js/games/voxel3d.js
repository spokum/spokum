function makeTexture(base, glow) {
  const tile = document.createElement('canvas');
  tile.width = 72;
  tile.height = 72;
  const ctx = tile.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 72, 72);
  ctx.strokeStyle = 'rgba(255,255,255,.1)';
  ctx.lineWidth = 1;
  for (let y = 8; y < 72; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(72, y);
    ctx.stroke();
  }
  for (let x = 8; x < 72; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 72);
    ctx.stroke();
  }
  for (let i = 0; i < 140; i += 1) {
    ctx.globalAlpha = Math.random() * 0.28;
    ctx.fillStyle = i % 2 ? '#fff' : '#000';
    ctx.fillRect(Math.random() * 72, Math.random() * 72, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  ctx.globalAlpha = 1;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = glow;
  ctx.strokeRect(3, 3, 66, 66);
  return tile;
}

function mountTrack(canvas, report, premium) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return { score: () => 0, stop() {} };
  const palette = premium
    ? { sky: '#100d27', far: '#39256b', floor: '#171528', neon: '#e4a0ff', gem: '#80f1ff', block: '#9e53dc' }
    : { sky: '#091a21', far: '#163c42', floor: '#102629', neon: '#80f1cf', gem: '#ffe28c', block: '#348f78' };
  const tile = makeTexture(palette.block, palette.neon);
  const stars = Array.from({ length: 54 }, () => ({ x: Math.random(), y: Math.random() * .45, r: .5 + Math.random() * 1.5 }));
  let width = 1;
  let height = 1;
  let ratio = 1;
  let frame = 0;
  let stopped = false;
  let over = false;
  let last = performance.now();
  let lane = 0;
  let targetLane = 0;
  let score = 0;
  let time = 0;
  let speed = premium ? 10.8 : 8.3;
  let nextSpawn = 30;
  let hits = 0;
  let pointerX = null;
  const objects = [];

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  const horizon = () => height * .24;
  const roadHalf = (z) => width * .48 * (7 / (z + 7));
  const project = (laneIndex, z, lift = 0) => {
    const t = 7 / (z + 7);
    const y = horizon() + height * 1.08 * t - lift * height * .48 * t;
    return { x: width / 2 + laneIndex * roadHalf(z) * .68, y, t };
  };
  const spawn = (z) => {
    objects.push({ lane: Math.floor(Math.random() * 3) - 1, z, kind: Math.random() < .32 ? 'gem' : 'block', spin: Math.random() * 6 });
  };
  for (let z = 12; z <= 44; z += 4) spawn(z);
  const reset = () => {
    objects.length = 0;
    for (let z = 12; z <= 44; z += 4) spawn(z);
    lane = 0; targetLane = 0; score = 0; time = 0; speed = premium ? 10.8 : 8.3; nextSpawn = 30; hits = 0; over = false;
  };
  const changeLane = (delta) => { if (!over) targetLane = Math.max(-1, Math.min(1, targetLane + delta)); };
  const onKey = (event) => {
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') { event.preventDefault(); changeLane(-1); }
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') { event.preventDefault(); changeLane(1); }
    if (over && (event.key === ' ' || event.key === 'Enter')) reset();
  };
  const onPointerDown = (event) => { event.preventDefault(); pointerX = event.clientX; if (over) reset(); };
  const onPointerUp = (event) => {
    if (pointerX == null) return;
    const dx = event.clientX - pointerX;
    if (Math.abs(dx) > 24) changeLane(dx > 0 ? 1 : -1);
    else if (event.clientX < width / 2) changeLane(-1);
    else changeLane(1);
    pointerX = null;
  };
  const onPointerCancel = () => { pointerX = null; };
  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointerup', onPointerUp, { passive: true });
  canvas.addEventListener('pointercancel', onPointerCancel);
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', resize);
  resize();

  const polygon = (points, fill) => {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const texturePolygon = (points, alpha = .24) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ctx.createPattern(tile, 'repeat');
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  };
  const drawCube = (obj) => {
    const p = project(obj.lane, obj.z);
    const size = height * .24 * p.t;
    const half = size * .42;
    const top = [
      { x: p.x - half, y: p.y - size }, { x: p.x, y: p.y - size * 1.2 },
      { x: p.x + half, y: p.y - size }, { x: p.x, y: p.y - size * .82 }
    ];
    const left = [top[0], top[3], { x: p.x, y: p.y }, { x: p.x - half, y: p.y - size * .18 }];
    const right = [top[3], top[2], { x: p.x + half, y: p.y - size * .18 }, { x: p.x, y: p.y }];
    polygon(left, palette.block);
    texturePolygon(left, .35);
    polygon(right, 'rgba(8,13,22,.48)');
    texturePolygon(right, .28);
    polygon(top, palette.neon);
    texturePolygon(top, .2);
    ctx.strokeStyle = palette.neon;
    ctx.globalAlpha = .82;
    ctx.lineWidth = Math.max(1, size * .025);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };
  const drawGem = (obj) => {
    const p = project(obj.lane, obj.z, .28 + Math.sin(obj.spin) * .04);
    const r = height * .15 * p.t;
    ctx.save();
    ctx.translate(p.x, p.y - r * .75);
    ctx.rotate(Math.sin(obj.spin) * .12);
    ctx.shadowColor = palette.gem;
    ctx.shadowBlur = Math.max(4, r * 1.2);
    polygon([{x:0,y:-r},{x:r*.68,y:-r*.1},{x:r*.45,y:r*.8},{x:-r*.45,y:r*.8},{x:-r*.68,y:-r*.1}], palette.gem);
    polygon([{x:0,y:-r},{x:r*.68,y:-r*.1},{x:0,y:r*.16}], 'rgba(255,255,255,.74)');
    polygon([{x:0,y:r*.16},{x:r*.68,y:-r*.1},{x:r*.45,y:r*.8}], 'rgba(55,121,177,.48)');
    ctx.strokeStyle = 'rgba(255,255,255,.82)';
    ctx.lineWidth = Math.max(1, r * .045);
    ctx.stroke();
    ctx.restore();
  };
  const draw = () => {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, palette.sky); sky.addColorStop(.64, palette.far); sky.addColorStop(1, palette.floor);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
    stars.forEach((star) => { ctx.globalAlpha = .35 + Math.sin(time + star.x * 9) * .2; ctx.fillStyle = '#fff'; ctx.fillRect(star.x * width, star.y * height, star.r, star.r); });
    ctx.globalAlpha = 1;
    const far = [project(-2, 34), project(2, 34)];
    const near = [project(2, 1.2), project(-2, 1.2)];
    const road = [project(-1.6, 34), project(1.6, 34), project(1.6, 1.2), project(-1.6, 1.2)];
    polygon(road, '#172127'); texturePolygon(road, .34);
    for (let laneLine = -1; laneLine <= 1; laneLine += 2) {
      ctx.strokeStyle = palette.neon; ctx.globalAlpha = .16; ctx.lineWidth = 1.2;
      const a = project(laneLine, 34), b = project(laneLine, 1.2);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.neon; ctx.globalAlpha = .45; ctx.lineWidth = 2;
    for (const side of [-1, 1]) { const a = project(side * 1.6, 34), b = project(side * 1.6, 1.2); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    ctx.globalAlpha = 1;
    objects.slice().sort((a, b) => b.z - a.z).forEach((obj) => obj.kind === 'gem' ? drawGem(obj) : drawCube(obj));
    const player = project(lane, 1.1, .1);
    const carSize = height * .095;
    ctx.save(); ctx.translate(player.x, player.y - carSize * .3);
    polygon([{x:0,y:-carSize},{x:carSize*.7,y:-carSize*.15},{x:carSize*.48,y:carSize*.34},{x:-carSize*.48,y:carSize*.34},{x:-carSize*.7,y:-carSize*.15}], premium ? '#d09cff' : '#9bffe1');
    ctx.shadowColor = palette.neon; ctx.shadowBlur = 16;
    polygon([{x:-carSize*.32,y:-carSize*.42},{x:0,y:-carSize*.82},{x:carSize*.32,y:-carSize*.42}], '#f4ffff');
    ctx.restore();
    ctx.fillStyle = '#f4ffff'; ctx.font = '700 17px Inter,system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`Осколки  ${score}`, 18, 30);
    ctx.font = '500 12px Inter,system-ui,sans-serif'; ctx.fillStyle = 'rgba(244,255,255,.68)'; ctx.fillText('← →  или свайп по экрану', 18, 50);
    if (over) {
      ctx.fillStyle = 'rgba(3,7,12,.72)'; ctx.fillRect(0, 0, width, height);
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '700 26px Inter,system-ui,sans-serif'; ctx.fillText('Маршрут завершён', width/2, height/2 - 12);
      ctx.font = '500 15px Inter,system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText(`Осколков: ${score} · нажми, чтобы повторить`, width/2, height/2 + 18);
      ctx.textAlign = 'left';
    }
  };
  const tick = (now) => {
    if (stopped) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!over) {
      time += dt;
      speed = Math.min(premium ? 17 : 14, speed + dt * .08);
      lane += (targetLane - lane) * Math.min(1, dt * 12);
      nextSpawn -= speed * dt;
      if (nextSpawn <= 0) { spawn(36 + Math.random() * 8); nextSpawn = 4.2 + Math.random() * 2.1; }
      for (const obj of objects) {
        obj.z -= speed * dt; obj.spin += dt * 2.4;
        if (obj.z < 2 && obj.z > .7 && Math.abs(lane - obj.lane) < .48) {
          if (obj.kind === 'gem') { obj.z = -1; score += 25; }
          else if (obj.z < 1.35) { obj.z = -1; hits += 1; if (hits >= 3) { over = true; report(score); } }
        }
      }
      for (let i = objects.length - 1; i >= 0; i -= 1) if (objects[i].z < .7) objects.splice(i, 1);
    }
    draw();
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return {
    score: () => score,
    stop() {
      stopped = true; cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', onPointerDown); canvas.removeEventListener('pointerup', onPointerUp); canvas.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKey); window.removeEventListener('resize', resize);
    }
  };
}

export const mountSkyRail3D = (canvas, report) => mountTrack(canvas, report, false);
export const mountNebulaTrack3D = (canvas, report) => mountTrack(canvas, report, true);

