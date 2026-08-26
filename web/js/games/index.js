function fit(canvas) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

function runner(canvas, setup) {
  let frame = 0;
  let stopped = false;
  let size = fit(canvas);
  let game = setup(size);
  const cleanups = [];

  const onResize = () => {
    size = fit(canvas);
    game.resize?.(size);
  };
  window.addEventListener('resize', onResize);

  const bind = (type, handler, target = canvas) => {
    target.addEventListener(type, handler, { passive: false });
    cleanups.push(() => target.removeEventListener(type, handler));
  };
  game.bind?.(bind, canvas);

  let last = performance.now();
  const tick = (now) => {
    if (stopped) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt, size);
    game.draw(size.ctx, size);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', onResize);
    cleanups.forEach((fn) => fn());
    game.destroy?.();
  };
}

function pointerX(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const point = event.touches?.[0] || event;
  return point.clientX - rect.left;
}

function pointerPos(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const point = event.touches?.[0] || event;
  return { x: point.clientX - rect.left, y: point.clientY - rect.top };
}

function backdrop(ctx, w, h, tint) {
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, tint[0]);
  gradient.addColorStop(1, tint[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

function hud(ctx, w, lines) {
  ctx.fillStyle = 'rgba(238,242,251,.9)';
  ctx.font = '600 15px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  lines.forEach((line, i) => ctx.fillText(line, 16, 28 + i * 22));
  ctx.textAlign = 'start';
}

function overText(ctx, w, h, title, hint) {
  ctx.fillStyle = 'rgba(5,7,13,.72)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#eef2fb';
  ctx.font = '700 26px Inter, system-ui, sans-serif';
  ctx.fillText(title, w / 2, h / 2 - 8);
  ctx.font = '500 14px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(238,242,251,.65)';
  ctx.fillText(hint, w / 2, h / 2 + 22);
  ctx.textAlign = 'start';
}

function orbit(canvas, report) {
  return runner(canvas, ({ w, h }) => {
    const stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 1.6 + 0.4 }));
    let state = {
      x: w / 2, lives: 3, score: 0, cool: 0, wave: 0, spawn: 0, over: false,
      bullets: [], enemies: [], shots: [], sparks: []
    };
    let width = w;
    let height = h;
    const keys = new Set();
    let target = null;

    const reset = () => {
      state = { x: width / 2, lives: 3, score: 0, cool: 0, wave: 0, spawn: 0, over: false, bullets: [], enemies: [], shots: [], sparks: [] };
    };

    const boom = (x, y, color) => {
      for (let i = 0; i < 12; i++) {
        state.sparks.push({ x, y, vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.5) * 220, life: 0.5, color });
      }
    };

    return {
      resize(size) {
        width = size.w;
        height = size.h;
      },
      bind(bind, node) {
        bind('pointermove', (event) => {
          target = pointerX(node, event);
        });
        bind('pointerdown', (event) => {
          if (state.over) {
            reset();
            return;
          }
          target = pointerX(node, event);
        });
        bind('keydown', (event) => {
          if (state.over && event.key === ' ') reset();
          keys.add(event.key);
        }, window);
        bind('keyup', (event) => keys.delete(event.key), window);
      },
      update(dt) {
        if (state.over) return;
        const speed = 420;
        if (keys.has('ArrowLeft') || keys.has('a')) state.x -= speed * dt;
        if (keys.has('ArrowRight') || keys.has('d')) state.x += speed * dt;
        if (target != null) state.x += (target - state.x) * Math.min(1, dt * 12);
        state.x = Math.max(22, Math.min(width - 22, state.x));

        state.cool -= dt;
        if (state.cool <= 0) {
          state.cool = 0.16;
          state.bullets.push({ x: state.x, y: height - 60 });
        }

        state.spawn -= dt;
        if (state.spawn <= 0) {
          state.wave += 1;
          state.spawn = Math.max(0.35, 1.25 - state.wave * 0.02);
          const tough = state.wave > 12 && Math.random() < 0.3;
          state.enemies.push({
            x: 30 + Math.random() * (width - 60),
            y: -30,
            vx: (Math.random() - 0.5) * 90,
            hp: tough ? 3 : 1,
            r: tough ? 20 : 15,
            fire: Math.random() * 2 + 0.6,
            tough
          });
        }

        state.bullets = state.bullets.filter((b) => (b.y -= 620 * dt) > -20);
        state.shots = state.shots.filter((s) => (s.y += 260 * dt) < height + 20);
        state.sparks = state.sparks.filter((p) => {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
          return p.life > 0;
        });

        for (const enemy of state.enemies) {
          enemy.y += (60 + state.wave * 1.4) * dt;
          enemy.x += enemy.vx * dt;
          if (enemy.x < 24 || enemy.x > width - 24) enemy.vx *= -1;
          enemy.fire -= dt;
          if (enemy.fire <= 0) {
            enemy.fire = 1.4 + Math.random() * 1.6;
            state.shots.push({ x: enemy.x, y: enemy.y + 16 });
          }
          for (const bullet of state.bullets) {
            if (Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y) < enemy.r + 4) {
              bullet.y = -100;
              enemy.hp -= 1;
              if (enemy.hp <= 0) {
                state.score += enemy.tough ? 50 : 20;
                boom(enemy.x, enemy.y, enemy.tough ? '#ffcb6b' : '#5be6c7');
              }
            }
          }
          if (enemy.y > height - 46 && Math.abs(enemy.x - state.x) < enemy.r + 16) {
            enemy.hp = 0;
            state.lives -= 1;
            boom(state.x, height - 46, '#ff8080');
          }
        }
        state.enemies = state.enemies.filter((e) => e.hp > 0 && e.y < height + 40);

        for (const shot of state.shots) {
          if (Math.hypot(shot.x - state.x, shot.y - (height - 46)) < 18) {
            shot.y = height + 50;
            state.lives -= 1;
            boom(state.x, height - 46, '#ff8080');
          }
        }
        state.shots = state.shots.filter((s) => s.y < height + 20);

        if (state.lives <= 0 && !state.over) {
          state.over = true;
          report(state.score);
        }
      },
      draw(ctx, size) {
        const { w: cw, h: ch } = size;
        backdrop(ctx, cw, ch, ['#070c1a', '#0d1430']);
        ctx.fillStyle = 'rgba(238,242,251,.5)';
        for (const star of stars) ctx.fillRect(star.x * cw, (star.y * ch + performance.now() * 0.02) % ch, star.s, star.s);

        ctx.fillStyle = '#5be6c7';
        for (const bullet of state.bullets) {
          ctx.fillRect(bullet.x - 1.5, bullet.y, 3, 12);
        }
        ctx.fillStyle = '#ff8080';
        for (const shot of state.shots) {
          ctx.beginPath();
          ctx.arc(shot.x, shot.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        for (const enemy of state.enemies) {
          ctx.fillStyle = enemy.tough ? '#ffcb6b' : '#a58bff';
          ctx.beginPath();
          ctx.moveTo(enemy.x, enemy.y + enemy.r);
          ctx.lineTo(enemy.x - enemy.r, enemy.y - enemy.r * 0.7);
          ctx.lineTo(enemy.x + enemy.r, enemy.y - enemy.r * 0.7);
          ctx.closePath();
          ctx.fill();
        }
        for (const spark of state.sparks) {
          ctx.globalAlpha = Math.max(0, spark.life * 2);
          ctx.fillStyle = spark.color;
          ctx.fillRect(spark.x, spark.y, 3, 3);
          ctx.globalAlpha = 1;
        }

        ctx.fillStyle = '#eef2fb';
        ctx.beginPath();
        ctx.moveTo(state.x, ch - 66);
        ctx.lineTo(state.x - 17, ch - 32);
        ctx.lineTo(state.x, ch - 42);
        ctx.lineTo(state.x + 17, ch - 32);
        ctx.closePath();
        ctx.fill();

        hud(ctx, cw, [`Очки ${state.score}`, `Жизни ${'|'.repeat(Math.max(0, state.lives))}`]);
        if (state.over) overText(ctx, cw, ch, `Итог ${state.score}`, 'Нажмите, чтобы сыграть снова');
      }
    };
  });
}

function runnerFigure(ctx, x, y, phase, airborne) {
  const swing = airborne ? 0.55 : Math.sin(phase) * 1.15;
  const lift = airborne ? 5 : 0;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.lineWidth = 6;
  ctx.strokeStyle = '#eef2fb';
  ctx.beginPath();
  ctx.moveTo(x, y + 3 - lift);
  ctx.lineTo(x + swing * 9, y + 18 - lift * 1.7);
  ctx.moveTo(x, y + 3 - lift);
  ctx.lineTo(x - swing * 9, y + 18 - lift * 1.2);
  ctx.stroke();

  ctx.lineWidth = 9;
  ctx.strokeStyle = '#5be6c7';
  ctx.beginPath();
  ctx.moveTo(x, y - 14);
  ctx.lineTo(x, y + 4);
  ctx.stroke();

  ctx.lineWidth = 5;
  ctx.strokeStyle = '#eef2fb';
  ctx.beginPath();
  ctx.moveTo(x, y - 11);
  ctx.lineTo(x - swing * 8, y - 1 - lift * 2);
  ctx.moveTo(x, y - 11);
  ctx.lineTo(x + swing * 8, y - 3 - lift * 2);
  ctx.stroke();

  ctx.fillStyle = '#eef2fb';
  ctx.beginPath();
  ctx.arc(x, y - 24, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0f1420';
  ctx.beginPath();
  ctx.arc(x + 3.5, y - 25.5, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#5be6c7';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y - 27, 9, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
}

function drift(canvas, report) {
  return runner(canvas, ({ w, h }) => {
    let width = w;
    let height = h;
    let state = null;
    const keys = new Set();

    const reset = () => {
      state = {
        x: 90, y: 0, vy: 0, onGround: false, score: 0, dist: 0, over: false, coins: [], jumps: 0,
        platforms: [{ x: 0, y: 0, w: 360 }],
        cursor: 360
      };
      state.y = height * 0.5;
      for (let i = 0; i < 8; i++) addPlatform();
    };

    const addPlatform = () => {
      const last = state.platforms[state.platforms.length - 1];
      const gap = 70 + Math.random() * (90 + Math.min(120, state.dist / 40));
      const pw = 110 + Math.random() * 140;
      const y = Math.max(-90, Math.min(120, last.y + (Math.random() - 0.5) * 150));
      const platform = { x: last.x + last.w + gap, y, w: pw };
      state.platforms.push(platform);
      if (Math.random() < 0.75) {
        state.coins.push({ x: platform.x + pw / 2, y: platform.y - 52, taken: false });
      }
    };

    const groundY = () => height * 0.72;

    const jump = () => {
      if (state.over) {
        reset();
        return;
      }
      if (state.onGround || state.jumps < 2) {
        state.vy = -430;
        state.onGround = false;
        state.jumps += 1;
      }
    };

    reset();

    return {
      resize(size) {
        width = size.w;
        height = size.h;
      },
      bind(bind, node) {
        bind('pointerdown', (event) => {
          event.preventDefault();
          jump();
        }, node);
        bind('keydown', (event) => {
          if (event.key === ' ' || event.key === 'ArrowUp' || event.key === 'w') {
            event.preventDefault();
            jump();
          }
          keys.add(event.key);
        }, window);
        bind('keyup', (event) => keys.delete(event.key), window);
      },
      update(dt) {
        if (state.over) return;
        const speed = 240 + Math.min(220, state.dist / 22);
        state.dist += speed * dt;
        state.vy += 1500 * dt;
        state.y += state.vy * dt;

        const base = groundY();
        state.onGround = false;
        for (const platform of state.platforms) {
          const left = platform.x - state.dist;
          if (state.x + 14 > left && state.x - 14 < left + platform.w) {
            const top = base + platform.y;
            if (state.vy >= 0 && state.y >= top - 18 && state.y <= top + 26) {
              state.y = top - 18;
              state.vy = 0;
              state.onGround = true;
              state.jumps = 0;
            }
          }
        }

        for (const coin of state.coins) {
          if (coin.taken) continue;
          if (Math.hypot(coin.x - state.dist - state.x, base + coin.y - state.y) < 26) {
            coin.taken = true;
            state.score += 15;
          }
        }

        while (state.platforms[state.platforms.length - 1].x - state.dist < width + 300) addPlatform();
        state.platforms = state.platforms.filter((p) => p.x - state.dist > -400);
        state.coins = state.coins.filter((c) => c.x - state.dist > -200);

        if (state.y > height + 60) {
          state.over = true;
          report(Math.round(state.score + state.dist / 12));
        }
      },
      draw(ctx, size) {
        const { w: cw, h: ch } = size;
        backdrop(ctx, cw, ch, ['#101a2c', '#1b1030']);
        ctx.fillStyle = 'rgba(165,139,255,.12)';
        for (let i = 0; i < 6; i++) {
          const x = ((i * 260 - state.dist * 0.25) % (cw + 300)) - 150;
          ctx.beginPath();
          ctx.arc(x, ch * 0.32, 90, 0, Math.PI * 2);
          ctx.fill();
        }

        const base = groundY();
        ctx.fillStyle = '#5be6c7';
        for (const platform of state.platforms) {
          const x = platform.x - state.dist;
          ctx.globalAlpha = 0.85;
          ctx.fillRect(x, base + platform.y, platform.w, 14);
          ctx.globalAlpha = 0.16;
          ctx.fillRect(x, base + platform.y + 14, platform.w, ch);
          ctx.globalAlpha = 1;
        }

        ctx.fillStyle = '#ffcb6b';
        for (const coin of state.coins) {
          if (coin.taken) continue;
          ctx.beginPath();
          ctx.arc(coin.x - state.dist, base + coin.y, 7, 0, Math.PI * 2);
          ctx.fill();
        }

        runnerFigure(ctx, state.x, state.y, state.dist / 24, !state.onGround);

        hud(ctx, cw, [`Очки ${Math.round(state.score + state.dist / 12)}`, 'Тап или пробел — прыжок, можно двойной']);
        if (state.over) overText(ctx, cw, ch, `Итог ${Math.round(state.score + state.dist / 12)}`, 'Нажмите, чтобы начать заново');
      }
    };
  });
}

function pulse(canvas, report) {
  return runner(canvas, ({ w, h }) => {
    let width = w;
    let height = h;
    let state = { r: 0, target: 70, score: 0, lives: 3, over: false, flash: 0, speed: 105 };

    const reset = () => {
      state = { r: 0, target: 70, score: 0, lives: 3, over: false, flash: 0, speed: 105 };
    };

    const hit = () => {
      if (state.over) {
        reset();
        return;
      }
      const delta = Math.abs(state.r - state.target);
      if (delta < 8) {
        state.score += 30;
        state.flash = 1;
      } else if (delta < 20) {
        state.score += 12;
        state.flash = 0.6;
      } else {
        state.lives -= 1;
        state.flash = -1;
      }
      state.r = 0;
      state.speed = Math.min(230, state.speed + 6);
      state.target = 55 + Math.random() * (Math.min(width, height) * 0.28);
      if (state.lives <= 0) {
        state.over = true;
        report(state.score);
      }
    };

    return {
      resize(size) {
        width = size.w;
        height = size.h;
      },
      bind(bind, node) {
        bind('pointerdown', (event) => {
          event.preventDefault();
          hit();
        }, node);
        bind('keydown', (event) => {
          if (event.key === ' ') {
            event.preventDefault();
            hit();
          }
        }, window);
      },
      update(dt) {
        if (state.over) return;
        state.r += state.speed * dt;
        state.flash *= 0.9;
        const limit = Math.min(width, height) * 0.42;
        if (state.r > limit) {
          state.r = 0;
          state.lives -= 1;
          state.flash = -1;
          if (state.lives <= 0) {
            state.over = true;
            report(state.score);
          }
        }
      },
      draw(ctx, size) {
        const { w: cw, h: ch } = size;
        backdrop(ctx, cw, ch, ['#08131a', '#0b1f24']);
        const cx = cw / 2;
        const cy = ch / 2;
        ctx.strokeStyle = 'rgba(238,242,251,.22)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, state.target, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = state.flash < 0 ? '#ff8080' : '#5be6c7';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(2, state.r), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(91,230,199,${Math.max(0, state.flash) * 0.25})`;
        ctx.beginPath();
        ctx.arc(cx, cy, state.target, 0, Math.PI * 2);
        ctx.fill();
        hud(ctx, cw, [`Очки ${state.score}`, `Жизни ${'|'.repeat(Math.max(0, state.lives))}`, 'Нажимай, когда круги совпадут']);
        if (state.over) overText(ctx, cw, ch, `Итог ${state.score}`, 'Нажмите, чтобы повторить');
      }
    };
  });
}

function echo(canvas, report) {
  return runner(canvas, ({ w, h }) => {
    let width = w;
    let height = h;
    const colors = ['#5be6c7', '#a58bff', '#ffcb6b', '#6fc5ff'];
    let state = null;

    const reset = () => {
      state = { sequence: [], input: 0, showing: true, index: 0, timer: 0, active: -1, score: 0, over: false };
      grow();
    };

    const grow = () => {
      state.sequence.push(Math.floor(Math.random() * 4));
      state.showing = true;
      state.index = 0;
      state.timer = 0.4;
      state.input = 0;
    };

    const cells = () => {
      const size = Math.min(width, height) * 0.36;
      const cx = width / 2;
      const cy = height / 2;
      return [
        { x: cx - size - 6, y: cy - size - 6, s: size },
        { x: cx + 6, y: cy - size - 6, s: size },
        { x: cx - size - 6, y: cy + 6, s: size },
        { x: cx + 6, y: cy + 6, s: size }
      ];
    };

    reset();

    return {
      resize(size) {
        width = size.w;
        height = size.h;
      },
      bind(bind, node) {
        bind('pointerdown', (event) => {
          event.preventDefault();
          if (state.over) {
            reset();
            return;
          }
          if (state.showing) return;
          const point = pointerPos(node, event);
          const list = cells();
          const hit = list.findIndex((c) => point.x >= c.x && point.x <= c.x + c.s && point.y >= c.y && point.y <= c.y + c.s);
          if (hit < 0) return;
          state.active = hit;
          state.timer = 0.16;
          if (state.sequence[state.input] === hit) {
            state.input += 1;
            if (state.input >= state.sequence.length) {
              state.score += state.sequence.length * 12;
              setTimeout(() => {
                if (!state.over) grow();
              }, 420);
            }
          } else {
            state.over = true;
            report(state.score);
          }
        }, node);
      },
      update(dt) {
        state.timer -= dt;
        if (state.showing) {
          if (state.timer <= 0) {
            if (state.active >= 0) {
              state.active = -1;
              state.timer = 0.18;
              state.index += 1;
              if (state.index >= state.sequence.length) state.showing = false;
            } else {
              state.active = state.sequence[state.index];
              state.timer = 0.45;
            }
          }
        } else if (state.timer <= 0 && state.active >= 0) {
          state.active = -1;
        }
      },
      draw(ctx, size) {
        const { w: cw, h: ch } = size;
        backdrop(ctx, cw, ch, ['#0a0d1a', '#141026']);
        cells().forEach((cell, i) => {
          ctx.fillStyle = colors[i];
          ctx.globalAlpha = state.active === i ? 1 : 0.28;
          ctx.beginPath();
          ctx.roundRect(cell.x, cell.y, cell.s, cell.s, 22);
          ctx.fill();
          ctx.globalAlpha = 1;
        });
        hud(ctx, cw, [`Очки ${state.score}`, `Ряд ${state.sequence.length}`, state.showing ? 'Смотри' : 'Повтори']);
        if (state.over) overText(ctx, cw, ch, `Итог ${state.score}`, 'Нажмите, чтобы начать заново');
      }
    };
  });
}

function flow(canvas, report) {
  return runner(canvas, ({ w, h }) => {
    let width = w;
    let height = h;
    let state = { phase: 0, holding: false, score: 0, accuracy: 1, elapsed: 0, over: false };

    return {
      resize(size) {
        width = size.w;
        height = size.h;
      },
      bind(bind, node) {
        const down = (event) => {
          event.preventDefault();
          if (state.over) {
            state = { phase: 0, holding: false, score: 0, accuracy: 1, elapsed: 0, over: false };
            return;
          }
          state.holding = true;
        };
        const up = () => {
          state.holding = false;
        };
        bind('pointerdown', down, node);
        bind('pointerup', up, window);
        bind('pointercancel', up, window);
      },
      update(dt) {
        if (state.over) return;
        state.elapsed += dt;
        state.phase += dt / 4;
        const wave = (Math.sin(state.phase * Math.PI * 2 - Math.PI / 2) + 1) / 2;
        const shouldHold = wave > 0.5;
        if (shouldHold === state.holding) {
          state.score += dt * 24;
          state.accuracy = Math.min(1, state.accuracy + dt * 0.2);
        } else {
          state.accuracy = Math.max(0, state.accuracy - dt * 0.35);
        }
        if (state.accuracy <= 0 || state.elapsed > 90) {
          state.over = true;
          report(Math.round(state.score));
        }
      },
      draw(ctx, size) {
        const { w: cw, h: ch } = size;
        backdrop(ctx, cw, ch, ['#07131a', '#0a1f2a']);
        const wave = (Math.sin(state.phase * Math.PI * 2 - Math.PI / 2) + 1) / 2;
        const radius = 40 + wave * Math.min(cw, ch) * 0.3;
        ctx.strokeStyle = 'rgba(238,242,251,.18)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cw / 2, ch / 2, Math.min(cw, ch) * 0.34, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = state.holding ? 'rgba(91,230,199,.34)' : 'rgba(111,197,255,.24)';
        ctx.beginPath();
        ctx.arc(cw / 2, ch / 2, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#eef2fb';
        ctx.font = '600 16px Inter, system-ui, sans-serif';
        ctx.fillText(wave > 0.5 ? 'держи' : 'отпусти', cw / 2, ch / 2 + 6);
        ctx.textAlign = 'start';
        hud(ctx, cw, [`Очки ${Math.round(state.score)}`, `Синхрон ${Math.round(state.accuracy * 100)}%`]);
        if (state.over) overText(ctx, cw, ch, `Итог ${Math.round(state.score)}`, 'Нажмите, чтобы попробовать снова');
      }
    };
  });
}

export const GAMES = [
  {
    id: 'orbit',
    title: 'Орбита',
    desc: 'Космическая стрелялка',
    tint: ['#0d2a3f', '#132a5c'],
    mount: orbit
  },
  {
    id: 'drift',
    title: 'Дрифт',
    desc: 'Платформер с двойным прыжком',
    tint: ['#1b1030', '#2a1444'],
    mount: drift
  },
  {
    id: 'pulse',
    title: 'Пульс',
    desc: 'Игра на точность',
    tint: ['#0b1f24', '#123a37'],
    mount: pulse
  },
  {
    id: 'echo',
    title: 'Эхо',
    desc: 'Память и последовательности',
    tint: ['#141026', '#2b1a3d'],
    mount: echo
  },
  {
    id: 'flow',
    title: 'Поток',
    desc: 'Дыхание в ритме',
    tint: ['#0a1f2a', '#0f3040'],
    mount: flow
  }
];
