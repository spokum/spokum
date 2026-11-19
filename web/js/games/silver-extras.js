function fit(canvas) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

function mountArcade(canvas, report, create) {
  let size = fit(canvas), frame = 0, stopped = false, last = performance.now();
  const game = create(size);
  const resize = () => { size = fit(canvas); game.resize?.(size); };
  const pointer = (event) => { event.preventDefault(); game.pointer?.(event, size); };
  const key = (event) => game.key?.(event);
  canvas.addEventListener('pointerdown', pointer, { passive: false });
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', key);
  const tick = (now) => {
    if (stopped) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    game.update?.(dt, size);
    game.draw(size.ctx, size);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return {
    score: () => game.score?.() || 0,
    stop() {
      stopped = true; cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', pointer);
      window.removeEventListener('resize', resize); window.removeEventListener('keydown', key);
      game.destroy?.();
    }
  };
}

function silverPrismMemory3D(canvas, report) {
  return mountArcade(canvas, report, () => {
    let seq = [], level = 1, cursor = 0, phase = 'show', reveal = 0, flash = 0, points = 0, elapsed = 0, ended = false;
    const stars = Array.from({ length: 56 }, (_, i) => ({ x: (i * 67 % 101) / 101, y: (i * 37 % 53) / 120, r: .5 + (i % 3) * .45 }));
    const reset = () => { seq = Array.from({ length: Math.min(2 + level, 9) }, () => Math.floor(Math.random() * 9)); cursor = 0; reveal = 0; flash = 0; phase = 'show'; };
    const finish = () => { if (!ended) { ended = true; report(points); } };
    const tiles = (w, h) => { const side = Math.min(w * .19, h * .16, 78), cx = w / 2, cy = h * .53, dx = side * .56, dy = side * .34; return Array.from({ length: 9 }, (_, i) => { const row = Math.floor(i / 3), col = i % 3; return { i, x: cx + (col - row) * dx, y: cy + (col + row - 2) * dy, side }; }); };
    reset();
    return {
      pointer(event, size) {
        if (ended || phase !== 'input') return;
        const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top, list = tiles(size.w, size.h);
        let pick = -1, dist = Infinity;
        for (const t of list) { const d = Math.hypot(x - t.x, y - t.y); if (d < dist) { pick = t.i; dist = d; } }
        if (dist > list[0].side * .62) return;
        if (pick !== seq[cursor]) return finish();
        cursor += 1; points += 100;
        if (cursor >= seq.length) { level += 1; reset(); }
      },
      update(dt) {
        if (ended) return;
        elapsed += dt; flash += dt;
        if (elapsed >= 70) return finish();
        if (phase === 'show' && flash >= .58) { flash = 0; reveal += 1; if (reveal >= seq.length) { phase = 'input'; reveal = -1; } }
      },
      draw(ctx, size) {
        const { w, h } = size, bg = ctx.createLinearGradient(0, 0, w, h);
        bg.addColorStop(0, '#0b1723'); bg.addColorStop(1, '#242344'); ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
        stars.forEach(s => { ctx.fillStyle = `rgba(210,238,255,${.2 + s.r * .16})`; ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2); ctx.fill(); });
        for (const t of tiles(w, h)) {
          const active = phase === 'show' ? seq[reveal] === t.i : seq[cursor] === t.i && phase === 'input';
          const points2 = [[t.x,t.y-t.side*.34],[t.x+t.side*.55,t.y],[t.x,t.y+t.side*.34],[t.x-t.side*.55,t.y]];
          ctx.beginPath(); points2.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y)); ctx.closePath();
          const face = ctx.createLinearGradient(t.x-t.side*.5,t.y-t.side*.3,t.x+t.side*.45,t.y+t.side*.3);
          face.addColorStop(0, active ? '#d5ff9b' : '#315866'); face.addColorStop(1, active ? '#67e2ca' : '#172b42');
          ctx.fillStyle = face; ctx.shadowColor = active ? '#93ffe4' : 'rgba(0,0,0,.4)'; ctx.shadowBlur = active ? 24 : 8; ctx.fill(); ctx.shadowBlur = 0;
          ctx.strokeStyle = active ? '#eaffc6' : 'rgba(182,235,239,.42)'; ctx.lineWidth = active ? 2.5 : 1; ctx.stroke();
          ctx.fillStyle = 'rgba(230,251,255,.08)'; ctx.fillRect(t.x-t.side*.23,t.y-t.side*.09,t.side*.46,t.side*.18);
        }
        ctx.textAlign='center'; ctx.fillStyle='#eff8f5'; ctx.font='700 22px Inter,system-ui,sans-serif'; ctx.fillText(`ПРИЗМА · УРОВЕНЬ ${level}`,w/2,h*.12);
        ctx.font='500 13px Inter,system-ui,sans-serif'; ctx.fillStyle='rgba(226,242,242,.72)'; ctx.fillText(phase==='show'?'Запомните вспышки':'Повторите последовательность',w/2,h*.17); ctx.textAlign='start';
      },
      score: () => points
    };
  });
}

function silverOrbitGuard3D(canvas, report) {
  return mountArcade(canvas, report, () => {
    let angle = -Math.PI / 2, lane = 0, time = 0, spawnIn = .7, points = 0, hits = 0, ended = false;
    const objects = [], stars = Array.from({ length: 80 }, (_, i) => ({ x: (i * 43 % 97) / 97, y: (i * 31 % 89) / 89, r: .4 + (i % 4) * .35 }));
    const finish = () => { if (!ended) { ended = true; report(points); } };
    const toggle = () => { lane = 1 - lane; };
    const wrap = n => Math.atan2(Math.sin(n), Math.cos(n));
    return {
      pointer: toggle,
      key(event) { if (event.key === ' ' || event.key.startsWith('Arrow')) { event.preventDefault(); toggle(); } },
      update(dt) {
        if (ended) return;
        time += dt; angle += dt * (1.05 + Math.min(1.1, time / 45)); spawnIn -= dt;
        if (spawnIn <= 0) { objects.push({ born: time, angle: Math.random() * Math.PI * 2, lane: Math.random() < .5 ? 0 : 1, kind: Math.random() < .66 ? 'star' : 'meteor', spin: Math.random() * 6 }); spawnIn = Math.max(.65, 1.45 - time * .008); }
        for (const obj of objects) {
          obj.angle -= dt * (obj.kind === 'star' ? .3 : .18); obj.spin += dt * 1.5;
          if (!obj.hit && Math.abs(wrap(angle - obj.angle)) < .105 && lane === obj.lane) { obj.hit = true; if (obj.kind === 'star') points += 40; else hits += 1; }
        }
        while (objects.length && (objects[0].hit || time > objects[0].born + 12)) objects.shift();
        if (hits >= 3 || time >= 60) finish();
      },
      draw(ctx, size) {
        const { w, h } = size, cx = w / 2, cy = h * .48;
        const sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#11162c'); sky.addColorStop(1, '#090d19'); ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
        stars.forEach(s => { ctx.fillStyle = `rgba(220,231,255,${.18 + s.r * .13})`; ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2); ctx.fill(); });
        for (let n=1;n>=0;n--) { ctx.beginPath(); ctx.ellipse(cx,cy,w*(n?.31:.22),h*(n?.28:.19),0,0,Math.PI*2); ctx.strokeStyle=n?'rgba(166,138,255,.55)':'rgba(115,224,231,.36)'; ctx.lineWidth=n?3:2; ctx.shadowColor=n?'#a987ff':'#61e4e7'; ctx.shadowBlur=10; ctx.stroke(); ctx.shadowBlur=0; }
        const planet = ctx.createRadialGradient(cx-w*.06,cy-h*.05,3,cx,cy,Math.min(w,h)*.14); planet.addColorStop(0,'#ffdfaa'); planet.addColorStop(.35,'#d7778d'); planet.addColorStop(1,'#56355f'); ctx.fillStyle=planet; ctx.beginPath(); ctx.arc(cx,cy,Math.min(w,h)*.14,0,Math.PI*2); ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,Math.min(w,h)*.135,0,Math.PI*2); ctx.clip(); ctx.strokeStyle='rgba(255,221,190,.24)'; for(let y=-30;y<35;y+=8){ctx.beginPath();ctx.ellipse(cx,cy+y,w*.14,h*.035,0,0,Math.PI*2);ctx.stroke();} ctx.restore();
        const point=(a,l)=>({x:cx+Math.cos(a)*w*(l?.31:.22),y:cy+Math.sin(a)*h*(l?.28:.19),scale:.58+(.5+.5*Math.sin(a))*.55});
        for(const obj of objects){if(obj.hit)continue;const p=point(obj.angle,obj.lane),r=11*p.scale;if(obj.kind==='star'){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(obj.spin);ctx.fillStyle='#d9ff9d';ctx.shadowColor='#c8ff69';ctx.shadowBlur=17;ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.48:r;ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}ctx.closePath();ctx.fill();ctx.restore();}else{const g=ctx.createRadialGradient(p.x-r*.3,p.y-r*.35,1,p.x,p.y,r*1.2);g.addColorStop(0,'#ffd3aa');g.addColorStop(1,'#9b4665');ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,r*1.2,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(255,228,204,.6)';ctx.beginPath();ctx.moveTo(p.x-r,p.y-r);ctx.lineTo(p.x-r*1.8,p.y-r*1.8);ctx.stroke();}}
        const player=point(angle,lane);ctx.save();ctx.translate(player.x,player.y);ctx.rotate(angle+Math.PI/2);ctx.fillStyle='#a4f5ed';ctx.shadowColor='#7af8ee';ctx.shadowBlur=18;ctx.beginPath();ctx.moveTo(0,-12*player.scale);ctx.lineTo(8*player.scale,10*player.scale);ctx.lineTo(0,6*player.scale);ctx.lineTo(-8*player.scale,10*player.scale);ctx.closePath();ctx.fill();ctx.restore();
        ctx.textAlign='center';ctx.fillStyle='#f5f2ff';ctx.font='700 21px Inter,system-ui,sans-serif';ctx.fillText('ОРБИТАЛЬНЫЙ ДОЗОР',w/2,h*.1);ctx.font='500 13px Inter,system-ui,sans-serif';ctx.fillStyle='rgba(230,225,255,.75)';ctx.fillText(`Звёзды ${points/40} · Щиты ${Math.max(0,3-hits)} · ${lane?'ВНЕШНЯЯ':'ВНУТРЕННЯЯ'} орбита`,w/2,h*.15);ctx.textAlign='start';
      },
      score: () => points
    };
  });
}

export const SILVER_EXTRA_GAMES = [
  { id: 'silver_prism_3d', title: 'Призма памяти 3D', desc: 'Повторяйте световой маршрут на объёмной панели', tint: ['#122a35', '#4f8c98'], silverOnly: true, premium: true, mount: silverPrismMemory3D },
  { id: 'silver_orbit_3d', title: 'Орбитальный дозор 3D', desc: 'Переключайте орбиты, собирайте звёзды и обходите метеоры', tint: ['#17172f', '#635497'], silverOnly: true, premium: true, mount: silverOrbitGuard3D }
];
