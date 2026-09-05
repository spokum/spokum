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
  let paused = false;
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

  const swallow = (event) => event.preventDefault();
  for (const type of ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'contextmenu']) {
    bind(type, swallow);
  }

  const onHide = () => {
    if (document.hidden) paused = true;
  };
  const onBlur = () => {
    paused = true;
  };
  const resume = () => {
    if (!paused) return;
    paused = false;
    last = performance.now();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('blur', onBlur);
  bind('pointerdown', resume);
  cleanups.push(() => document.removeEventListener('visibilitychange', onHide));
  cleanups.push(() => window.removeEventListener('blur', onBlur));

  let last = performance.now();
  const tick = (now) => {
    if (stopped) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) game.update(dt, size);
    game.draw(size.ctx, size);
    if (paused) pauseOverlay(size.ctx, size);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return {
    score: () => (game.score ? game.score() : 0),
    stop: () => {
      stopped = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      cleanups.forEach((fn) => fn());
      game.destroy?.();
    }
  };
}

function pauseOverlay(ctx, size) {
  ctx.fillStyle = 'rgba(5,7,13,.78)';
  ctx.fillRect(0, 0, size.w, size.h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#eef2fb';
  ctx.font = '700 24px Inter, system-ui, sans-serif';
  ctx.fillText('Пауза', size.w / 2, size.h / 2 - 6);
  ctx.font = '500 14px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(238,242,251,.65)';
  ctx.fillText('Коснитесь экрана, чтобы продолжить', size.w / 2, size.h / 2 + 22);
  ctx.textAlign = 'start';
}

function capture(node, event) {
  try {
    capture(node, event);
  } catch {}
}

function tapOnce(handler) {
  let last = 0;
  return (event) => {
    const now = performance.now();
    if (now - last < 350) {
      event.preventDefault();
      return;
    }
    last = now;
    handler(event);
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
      x: w / 2, lives: 3, score: 0, cool: 0, wave: 0, spawn: 0, over: false, missed: 0,
      bullets: [], enemies: [], shots: [], sparks: []
    };
    let width = w;
    let height = h;
    const keys = new Set();
    let target = null;

    const reset = () => {
      state = { x: width / 2, lives: 3, score: 0, cool: 0, wave: 0, spawn: 0, over: false, missed: 0, bullets: [], enemies: [], shots: [], sparks: [] };
    };

    const boom = (x, y, color) => {
      for (let i = 0; i < 12; i++) {
        state.sparks.push({ x, y, vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.5) * 220, life: 0.5, color });
      }
    };

    return {
      score: () => state.score,
      resize(size) {
        width = size.w;
        height = size.h;
      },
      bind(bind, node) {
        const aim = (event) => {
          event.preventDefault();
          target = pointerX(node, event);
        };
        bind('pointermove', aim);
        bind('touchmove', aim);
        bind('touchstart', (event) => {
          event.preventDefault();
          if (state.over) {
            reset();
            return;
          }
          target = pointerX(node, event);
        });
        bind('pointerdown', (event) => {
          event.preventDefault();
          capture(node, event);
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
          const hunter = Math.random() < 0.45;
          state.enemies.push({
            x: 30 + Math.random() * (width - 60),
            y: -30,
            vx: (Math.random() - 0.5) * 90,
            hp: tough ? 3 : 1,
            r: tough ? 20 : 15,
            fire: Math.random() * 1.6 + 0.5,
            tough,
            hunter
          });
        }

        state.bullets = state.bullets.filter((b) => (b.y -= 620 * dt) > -20);
        for (const shot of state.shots) {
          shot.x += shot.vx * dt;
          shot.y += shot.vy * dt;
        }
        state.shots = state.shots.filter((s) => s.y < height + 20 && s.x > -30 && s.x < width + 30);
        state.sparks = state.sparks.filter((p) => {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
          return p.life > 0;
        });

        const gunY = height - 46;
        for (const enemy of state.enemies) {
          enemy.y += (60 + state.wave * 1.4) * dt;
          if (enemy.hunter) {
            enemy.vx += Math.sign(state.x - enemy.x) * 150 * dt;
            enemy.vx = Math.max(-190, Math.min(190, enemy.vx));
          }
          enemy.x += enemy.vx * dt;
          if (enemy.x < 24) {
            enemy.x = 24;
            enemy.vx = Math.abs(enemy.vx);
          }
          if (enemy.x > width - 24) {
            enemy.x = width - 24;
            enemy.vx = -Math.abs(enemy.vx);
          }
          enemy.fire -= dt;
          if (enemy.fire <= 0) {
            enemy.fire = 1.1 + Math.random() * 1.4;
            const dx = state.x - enemy.x;
            const dy = gunY - (enemy.y + 16);
            const length = Math.hypot(dx, dy) || 1;
            const speed = 250 + state.wave * 2;
            state.shots.push({
              x: enemy.x,
              y: enemy.y + 16,
              vx: (dx / length) * speed,
              vy: Math.max(60, (dy / length) * speed)
            });
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
        const escaped = state.enemies.filter((e) => e.hp > 0 && e.y >= height + 40).length;
        if (escaped) {
          state.lives -= escaped;
          state.missed += escaped;
          boom(width / 2, height - 20, '#ff8080');
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

        hud(ctx, cw, [
          `Очки ${state.score}`,
          `Жизни ${'|'.repeat(Math.max(0, state.lives))}`,
          'Не пропускай врагов вниз'
        ]);
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
      score: () => Math.round(state.score + state.dist / 12),
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
      score: () => state.score,
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
      score: () => state.score,
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
      score: () => Math.round(state.score),
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

function snake(canvas, report) {
  return runner(canvas, ({ w, h }) => {
    let width = w;
    let height = h;
    let cell = Math.max(13, Math.round(Math.min(width, height) / 20));
    let cols = Math.max(8, Math.floor(width / cell));
    let rows = Math.max(8, Math.floor((height - 40) / cell));
    let state = null;

    const spawnFood = () => {
      let spot;
      do {
        spot = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
      } while (state.body.some((part) => part.x === spot.x && part.y === spot.y));
      return spot;
    };

    const reset = () => {
      state = {
        body: [{ x: Math.floor(cols / 2), y: Math.floor(rows / 2) }],
        dir: { x: 1, y: 0 },
        queued: { x: 1, y: 0 },
        food: { x: 3, y: 3 },
        bonus: null,
        bonusLeft: 0,
        score: 0,
        step: 0,
        speed: 0.14,
        over: false
      };
      state.food = spawnFood();
    };
    reset();

    const turn = (x, y) => {
      if (state.dir.x === -x && state.dir.y === -y) return;
      state.queued = { x, y };
    };

    return {
      score: () => state.score,
      resize(size) {
        width = size.w;
        height = size.h;
        cell = Math.max(13, Math.round(Math.min(width, height) / 20));
        cols = Math.max(8, Math.floor(width / cell));
        rows = Math.max(8, Math.floor((height - 40) / cell));
      },
      bind(bind, node) {
        let start = null;
        bind('pointerdown', (event) => {
          event.preventDefault();
          if (state.over) {
            reset();
            return;
          }
          start = pointerPos(node, event);
        });
        bind('pointerup', (event) => {
          if (!start) return;
          const end = pointerPos(node, event);
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          start = null;
          if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
          if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1, 0);
          else turn(0, dy > 0 ? 1 : -1);
        });
        bind('keydown', (event) => {
          if (state.over && (event.key === ' ' || event.key === 'Enter')) return reset();
          if (event.key === 'ArrowLeft' || event.key === 'a') turn(-1, 0);
          if (event.key === 'ArrowRight' || event.key === 'd') turn(1, 0);
          if (event.key === 'ArrowUp' || event.key === 'w') turn(0, -1);
          if (event.key === 'ArrowDown' || event.key === 's') turn(0, 1);
        }, window);
      },
      update(dt) {
        if (state.over) return;
        if (state.bonus) {
          state.bonusLeft -= dt;
          if (state.bonusLeft <= 0) state.bonus = null;
        }
        state.step += dt;
        const pace = Math.max(0.06, state.speed - state.body.length * 0.0015);
        if (state.step < pace) return;
        state.step = 0;
        state.dir = state.queued;
        const head = { x: state.body[0].x + state.dir.x, y: state.body[0].y + state.dir.y };
        if (head.x < 0) head.x = cols - 1;
        if (head.y < 0) head.y = rows - 1;
        if (head.x >= cols) head.x = 0;
        if (head.y >= rows) head.y = 0;
        if (state.body.some((part) => part.x === head.x && part.y === head.y)) {
          state.over = true;
          report(state.score);
          return;
        }
        state.body.unshift(head);
        if (head.x === state.food.x && head.y === state.food.y) {
          state.score += 10;
          state.food = spawnFood();
          if (!state.bonus && state.score % 50 === 0) {
            state.bonus = spawnFood();
            state.bonusLeft = 6;
          }
        } else if (state.bonus && head.x === state.bonus.x && head.y === state.bonus.y) {
          state.score += 50;
          state.bonus = null;
        } else {
          state.body.pop();
        }
      },
      draw(ctx, size) {
        const { w: cw, h: ch } = size;
        backdrop(ctx, cw, ch, ['#0a1a14', '#0f2a20']);
        const offX = (cw - cols * cell) / 2;
        const offY = (ch - rows * cell) / 2 + 14;

        ctx.strokeStyle = 'rgba(238,242,251,.05)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= cols; x++) {
          ctx.beginPath();
          ctx.moveTo(offX + x * cell, offY);
          ctx.lineTo(offX + x * cell, offY + rows * cell);
          ctx.stroke();
        }
        for (let y = 0; y <= rows; y++) {
          ctx.beginPath();
          ctx.moveTo(offX, offY + y * cell);
          ctx.lineTo(offX + cols * cell, offY + y * cell);
          ctx.stroke();
        }

        const dot = (spot, color, scale = 1) => {
          ctx.fillStyle = color;
          const pad = (cell * (1 - scale)) / 2;
          ctx.beginPath();
          ctx.roundRect(offX + spot.x * cell + 1 + pad, offY + spot.y * cell + 1 + pad, cell - 2 - pad * 2, cell - 2 - pad * 2, 4);
          ctx.fill();
        };

        dot(state.food, '#e0937f');
        if (state.bonus) dot(state.bonus, '#e8cf7a', 0.7 + Math.sin(Date.now() / 120) * 0.15);
        state.body.forEach((part, i) => {
          const tone = i === 0 ? '#9fe6c4' : `rgba(127,205,170,${Math.max(0.28, 1 - i / (state.body.length + 6))})`;
          dot(part, tone);
        });

        hud(ctx, cw, [`Очки ${state.score}`, `Длина ${state.body.length}`]);
        if (state.over) overText(ctx, cw, ch, `Итог ${state.score}`, 'Нажмите, чтобы начать заново');
      }
    };
  });
}

function storm(canvas, report) {
  return runner(canvas, ({ w, h }) => {
    let width = w;
    let height = h;
    let state = null;
    const keys = new Set();
    let touch = null;

    const reset = () => {
      state = {
        x: width / 2,
        y: height / 2,
        hp: 5,
        shield: 0,
        rapid: 0,
        score: 0,
        wave: 1,
        spawn: 0,
        cool: 0,
        over: false,
        bullets: [],
        foes: [],
        drops: [],
        sparks: []
      };
    };
    reset();

    const boom = (x, y, color, count = 14) => {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 60 + Math.random() * 220;
        state.sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.55, color });
      }
    };

    const spawnFoe = () => {
      const side = Math.floor(Math.random() * 4);
      const heavy = Math.random() < Math.min(0.4, state.wave / 18);
      const spot = { x: 0, y: 0 };
      if (side === 0) { spot.x = Math.random() * width; spot.y = -30; }
      if (side === 1) { spot.x = width + 30; spot.y = Math.random() * height; }
      if (side === 2) { spot.x = Math.random() * width; spot.y = height + 30; }
      if (side === 3) { spot.x = -30; spot.y = Math.random() * height; }
      state.foes.push({
        x: spot.x,
        y: spot.y,
        r: heavy ? 20 : 13,
        hp: heavy ? 4 : 1,
        speed: heavy ? 48 + state.wave * 2 : 76 + state.wave * 4,
        color: heavy ? '#c98b8b' : '#8fa5c9'
      });
    };

    return {
      score: () => state.score,
      resize(size) {
        width = size.w;
        height = size.h;
      },
      bind(bind, node) {
        const aim = (event) => {
          event.preventDefault();
          touch = pointerPos(node, event);
        };
        bind('pointerdown', (event) => {
          event.preventDefault();
          if (state.over) {
            reset();
            touch = null;
            return;
          }
          capture(node, event);
          aim(event);
        });
        bind('pointermove', (event) => {
          if (event.buttons === 0 && event.pointerType === 'mouse') return;
          aim(event);
        });
        bind('pointerup', () => {
          touch = null;
        });
        bind('keydown', (event) => {
          if (state.over && event.key === ' ') return reset();
          keys.add(event.key);
        }, window);
        bind('keyup', (event) => keys.delete(event.key), window);
      },
      update(dt) {
        if (state.over) return;
        const speed = 260;
        if (keys.has('ArrowLeft') || keys.has('a')) state.x -= speed * dt;
        if (keys.has('ArrowRight') || keys.has('d')) state.x += speed * dt;
        if (keys.has('ArrowUp') || keys.has('w')) state.y -= speed * dt;
        if (keys.has('ArrowDown') || keys.has('s')) state.y += speed * dt;
        if (touch) {
          state.x += (touch.x - state.x) * Math.min(1, dt * 9);
          state.y += (touch.y - state.y) * Math.min(1, dt * 9);
        }
        state.x = Math.max(16, Math.min(width - 16, state.x));
        state.y = Math.max(16, Math.min(height - 16, state.y));

        state.spawn -= dt;
        if (state.spawn <= 0) {
          state.spawn = Math.max(0.28, 1.5 - state.wave * 0.06);
          spawnFoe();
        }

        state.rapid = Math.max(0, state.rapid - dt);
        state.shield = Math.max(0, state.shield - dt);

        state.cool -= dt;
        if (state.cool <= 0 && state.foes.length) {
          state.cool = state.rapid > 0 ? 0.08 : 0.19;
          let near = null;
          let best = Infinity;
          for (const foe of state.foes) {
            const distance = Math.hypot(foe.x - state.x, foe.y - state.y);
            if (distance < best) {
              best = distance;
              near = foe;
            }
          }
          if (near) {
            const angle = Math.atan2(near.y - state.y, near.x - state.x);
            state.bullets.push({ x: state.x, y: state.y, vx: Math.cos(angle) * 640, vy: Math.sin(angle) * 640, life: 1.4 });
          }
        }

        for (const bullet of state.bullets) {
          bullet.x += bullet.vx * dt;
          bullet.y += bullet.vy * dt;
          bullet.life -= dt;
        }

        for (const foe of state.foes) {
          const angle = Math.atan2(state.y - foe.y, state.x - foe.x);
          foe.x += Math.cos(angle) * foe.speed * dt;
          foe.y += Math.sin(angle) * foe.speed * dt;
          for (const bullet of state.bullets) {
            if (bullet.life <= 0) continue;
            if (Math.hypot(bullet.x - foe.x, bullet.y - foe.y) > foe.r) continue;
            bullet.life = 0;
            foe.hp -= 1;
            if (foe.hp <= 0) {
              foe.dead = true;
              state.score += foe.r > 16 ? 40 : 12;
              boom(foe.x, foe.y, foe.color);
              if (Math.random() < 0.12) {
                state.drops.push({ x: foe.x, y: foe.y, kind: Math.random() < 0.5 ? 'rapid' : 'shield', life: 8 });
              }
              if (state.score > state.wave * 160) state.wave += 1;
            }
          }
          if (!foe.dead && Math.hypot(foe.x - state.x, foe.y - state.y) < foe.r + 13) {
            foe.dead = true;
            boom(foe.x, foe.y, '#ff9c9c');
            if (state.shield > 0) state.shield = 0;
            else state.hp -= 1;
          }
        }

        for (const drop of state.drops) {
          drop.life -= dt;
          if (Math.hypot(drop.x - state.x, drop.y - state.y) < 22) {
            drop.life = 0;
            if (drop.kind === 'rapid') state.rapid = 6;
            else state.shield = 7;
          }
        }

        for (const spark of state.sparks) {
          spark.x += spark.vx * dt;
          spark.y += spark.vy * dt;
          spark.life -= dt;
        }

        state.foes = state.foes.filter((foe) => !foe.dead);
        state.bullets = state.bullets.filter((b) => b.life > 0 && b.x > -40 && b.x < width + 40 && b.y > -40 && b.y < height + 40);
        state.drops = state.drops.filter((d) => d.life > 0);
        state.sparks = state.sparks.filter((s) => s.life > 0);

        if (state.hp <= 0 && !state.over) {
          state.over = true;
          report(state.score);
        }
      },
      draw(ctx, size) {
        const { w: cw, h: ch } = size;
        backdrop(ctx, cw, ch, ['#0a0d18', '#161a33']);

        ctx.strokeStyle = 'rgba(238,242,251,.045)';
        ctx.lineWidth = 1;
        for (let x = 0; x < cw; x += 42) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, ch);
          ctx.stroke();
        }
        for (let y = 0; y < ch; y += 42) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(cw, y);
          ctx.stroke();
        }

        for (const drop of state.drops) {
          ctx.fillStyle = drop.kind === 'rapid' ? '#e8cf7a' : '#7fd7e8';
          ctx.beginPath();
          ctx.arc(drop.x, drop.y, 8, 0, Math.PI * 2);
          ctx.fill();
        }

        for (const foe of state.foes) {
          ctx.fillStyle = foe.color;
          ctx.beginPath();
          ctx.arc(foe.x, foe.y, foe.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(5,7,13,.5)';
          ctx.beginPath();
          ctx.arc(foe.x, foe.y, foe.r * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = '#eef2fb';
        for (const bullet of state.bullets) {
          ctx.beginPath();
          ctx.arc(bullet.x, bullet.y, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }

        for (const spark of state.sparks) {
          ctx.globalAlpha = Math.max(0, spark.life * 1.6);
          ctx.fillStyle = spark.color;
          ctx.fillRect(spark.x - 1.5, spark.y - 1.5, 3, 3);
        }
        ctx.globalAlpha = 1;

        if (state.shield > 0) {
          ctx.strokeStyle = 'rgba(127,215,232,.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(state.x, state.y, 22, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = state.rapid > 0 ? '#e8cf7a' : '#9fe6c4';
        ctx.beginPath();
        ctx.arc(state.x, state.y, 13, 0, Math.PI * 2);
        ctx.fill();

        hud(ctx, cw, [`Очки ${state.score}`, `Волна ${state.wave}`, `Жизни ${Math.max(0, state.hp)}`]);
        if (state.over) overText(ctx, cw, ch, `Итог ${state.score}`, 'Нажмите, чтобы начать заново');
      }
    };
  });
}

const MAZE_SIZE = 15;

function buildMaze(size) {
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => 1));
  const carve = (x, y) => {
    grid[y][x] = 0;
    const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]].sort(() => Math.random() - 0.5);
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx <= 0 || ny <= 0 || nx >= size - 1 || ny >= size - 1 || grid[ny][nx] === 0) continue;
      grid[y + dy / 2][x + dx / 2] = 0;
      carve(nx, ny);
    }
  };
  carve(1, 1);
  return grid;
}

function maze3d(canvas, report) {
  return runner(canvas, ({ w, h }) => {
    let width = w;
    let height = h;
    let state = null;
    const keys = new Set();
    let drag = null;
    let stick = null;

    const reset = () => {
      const grid = buildMaze(MAZE_SIZE);
      const open = [];
      for (let y = 1; y < MAZE_SIZE - 1; y++) {
        for (let x = 1; x < MAZE_SIZE - 1; x++) {
          if (grid[y][x] === 0 && (x > 3 || y > 3)) open.push({ x: x + 0.5, y: y + 0.5 });
        }
      }
      open.sort(() => Math.random() - 0.5);
      const facings = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      let facing = 0;
      let bestRun = -1;
      for (const option of facings) {
        let run = 0;
        while (run < MAZE_SIZE) {
          const nx = Math.floor(1.5 + Math.cos(option) * (run + 1));
          const ny = Math.floor(1.5 + Math.sin(option) * (run + 1));
          if (nx < 0 || ny < 0 || nx >= MAZE_SIZE || ny >= MAZE_SIZE || grid[ny][nx] === 1) break;
          run += 1;
        }
        if (run > bestRun) {
          bestRun = run;
          facing = option;
        }
      }
      state = {
        grid,
        px: 1.5,
        py: 1.5,
        angle: facing,
        crystals: open.slice(0, 6).map((spot) => ({ ...spot, taken: false })),
        score: 0,
        time: 120,
        over: false,
        won: false
      };
    };
    reset();

    const solid = (x, y) => {
      const gx = Math.floor(x);
      const gy = Math.floor(y);
      if (gx < 0 || gy < 0 || gx >= MAZE_SIZE || gy >= MAZE_SIZE) return true;
      return state.grid[gy][gx] === 1;
    };

    const move = (dx, dy) => {
      if (!solid(state.px + dx * 1.6, state.py)) state.px += dx;
      if (!solid(state.px, state.py + dy * 1.6)) state.py += dy;
    };

    return {
      score: () => state.score,
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
          capture(node, event);
          const spot = pointerPos(node, event);
          if (spot.x < width * 0.42 && spot.y > height * 0.55) stick = { id: event.pointerId, ox: spot.x, oy: spot.y, x: spot.x, y: spot.y };
          else drag = { id: event.pointerId, x: spot.x };
        });
        bind('pointermove', (event) => {
          const spot = pointerPos(node, event);
          if (stick && stick.id === event.pointerId) {
            stick.x = spot.x;
            stick.y = spot.y;
            return;
          }
          if (drag && drag.id === event.pointerId) {
            state.angle += (spot.x - drag.x) * 0.006;
            drag.x = spot.x;
          }
        });
        const release = (event) => {
          if (stick && stick.id === event.pointerId) stick = null;
          if (drag && drag.id === event.pointerId) drag = null;
        };
        bind('pointerup', release);
        bind('pointercancel', release);
        bind('keydown', (event) => {
          if (state.over && event.key === ' ') return reset();
          keys.add(event.key);
        }, window);
        bind('keyup', (event) => keys.delete(event.key), window);
      },
      update(dt) {
        if (state.over) return;
        state.time -= dt;
        const walk = 2.4 * dt;
        const spin = 2.2 * dt;
        if (keys.has('ArrowLeft')) state.angle -= spin;
        if (keys.has('ArrowRight')) state.angle += spin;
        if (keys.has('ArrowUp') || keys.has('w')) move(Math.cos(state.angle) * walk, Math.sin(state.angle) * walk);
        if (keys.has('ArrowDown') || keys.has('s')) move(-Math.cos(state.angle) * walk, -Math.sin(state.angle) * walk);
        if (keys.has('a')) move(Math.sin(state.angle) * walk, -Math.cos(state.angle) * walk);
        if (keys.has('d')) move(-Math.sin(state.angle) * walk, Math.cos(state.angle) * walk);

        if (stick) {
          const dx = stick.x - stick.ox;
          const dy = stick.y - stick.oy;
          const power = Math.min(1, Math.hypot(dx, dy) / 60);
          if (power > 0.12) {
            const forward = (-dy / Math.max(1, Math.hypot(dx, dy))) * power * walk * 1.4;
            const strafe = (dx / Math.max(1, Math.hypot(dx, dy))) * power * walk * 1.1;
            move(Math.cos(state.angle) * forward - Math.sin(state.angle) * strafe, Math.sin(state.angle) * forward + Math.cos(state.angle) * strafe);
          }
        }

        for (const crystal of state.crystals) {
          if (crystal.taken) continue;
          if (Math.hypot(crystal.x - state.px, crystal.y - state.py) < 0.45) {
            crystal.taken = true;
            state.score += 100;
          }
        }

        if (state.crystals.every((c) => c.taken) && !state.over) {
          state.over = true;
          state.won = true;
          state.score += Math.round(Math.max(0, state.time) * 5);
          report(state.score);
        } else if (state.time <= 0 && !state.over) {
          state.over = true;
          report(state.score);
        }
      },
      draw(ctx, size) {
        const { w: cw, h: ch } = size;
        const horizon = ch * 0.5;

        const sky = ctx.createLinearGradient(0, 0, 0, horizon);
        sky.addColorStop(0, '#0a1220');
        sky.addColorStop(1, '#1b2740');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, cw, horizon);
        const floor = ctx.createLinearGradient(0, horizon, 0, ch);
        floor.addColorStop(0, '#131a16');
        floor.addColorStop(1, '#070b09');
        ctx.fillStyle = floor;
        ctx.fillRect(0, horizon, cw, ch - horizon);

        const fov = Math.PI / 3;
        const rays = Math.min(280, Math.max(120, Math.round(cw / 2)));
        const step = fov / rays;
        const bandWidth = cw / rays;
        const depths = new Array(rays).fill(60);

        for (let i = 0; i < rays; i++) {
          const angle = state.angle - fov / 2 + i * step;
          const sin = Math.sin(angle);
          const cos = Math.cos(angle);
          let mapX = Math.floor(state.px);
          let mapY = Math.floor(state.py);
          const deltaX = Math.abs(1 / (cos || 1e-6));
          const deltaY = Math.abs(1 / (sin || 1e-6));
          const stepX = cos < 0 ? -1 : 1;
          const stepY = sin < 0 ? -1 : 1;
          let sideX = cos < 0 ? (state.px - mapX) * deltaX : (mapX + 1 - state.px) * deltaX;
          let sideY = sin < 0 ? (state.py - mapY) * deltaY : (mapY + 1 - state.py) * deltaY;
          let hitSide = 0;
          let distance = 22;
          for (let guard = 0; guard < 64; guard++) {
            if (sideX < sideY) {
              sideX += deltaX;
              mapX += stepX;
              hitSide = 0;
            } else {
              sideY += deltaY;
              mapY += stepY;
              hitSide = 1;
            }
            if (mapX < 0 || mapY < 0 || mapX >= MAZE_SIZE || mapY >= MAZE_SIZE) break;
            if (state.grid[mapY][mapX] === 1) {
              distance = hitSide === 0 ? sideX - deltaX : sideY - deltaY;
              break;
            }
          }
          const corrected = distance * Math.cos(angle - state.angle);
          depths[i] = corrected;
          const wall = Math.min(ch, (ch * 0.92) / Math.max(0.15, corrected));
          const shade = Math.max(0.08, 1 - corrected / 12) * (hitSide ? 0.72 : 1);
          ctx.fillStyle = `rgb(${Math.round(96 * shade + 12)}, ${Math.round(150 * shade + 14)}, ${Math.round(130 * shade + 16)})`;
          ctx.fillRect(i * bandWidth, horizon - wall / 2, bandWidth + 1, wall);
        }

        const sprites = state.crystals
          .filter((c) => !c.taken)
          .map((c) => {
            const dx = c.x - state.px;
            const dy = c.y - state.py;
            return { c, dist: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
          })
          .sort((a, b) => b.dist - a.dist);

        for (const sprite of sprites) {
          let delta = sprite.angle - state.angle;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          if (Math.abs(delta) > fov / 2 + 0.2) continue;
          const screenX = cw / 2 + (delta / (fov / 2)) * (cw / 2);
          const column = Math.max(0, Math.min(rays - 1, Math.round((screenX / cw) * rays)));
          if (sprite.dist > depths[column] + 0.2) continue;
          const scale = Math.min(ch * 0.5, (ch * 0.4) / Math.max(0.3, sprite.dist));
          const glow = 0.5 + Math.sin(Date.now() / 260) * 0.2;
          ctx.fillStyle = `rgba(232,207,122,${glow})`;
          ctx.beginPath();
          ctx.moveTo(screenX, horizon - scale * 0.5);
          ctx.lineTo(screenX + scale * 0.24, horizon);
          ctx.lineTo(screenX, horizon + scale * 0.5);
          ctx.lineTo(screenX - scale * 0.24, horizon);
          ctx.closePath();
          ctx.fill();
        }

        const mapSize = Math.min(96, cw * 0.28);
        const tile = mapSize / MAZE_SIZE;
        ctx.fillStyle = 'rgba(5,7,13,.55)';
        ctx.fillRect(cw - mapSize - 12, 12, mapSize, mapSize);
        for (let y = 0; y < MAZE_SIZE; y++) {
          for (let x = 0; x < MAZE_SIZE; x++) {
            if (!state.grid[y][x]) continue;
            ctx.fillStyle = 'rgba(238,242,251,.22)';
            ctx.fillRect(cw - mapSize - 12 + x * tile, 12 + y * tile, tile, tile);
          }
        }
        for (const crystal of state.crystals) {
          if (crystal.taken) continue;
          ctx.fillStyle = '#e8cf7a';
          ctx.fillRect(cw - mapSize - 12 + crystal.x * tile - 1, 12 + crystal.y * tile - 1, 3, 3);
        }
        ctx.fillStyle = '#9fe6c4';
        ctx.fillRect(cw - mapSize - 12 + state.px * tile - 2, 12 + state.py * tile - 2, 4, 4);

        if (stick) {
          ctx.strokeStyle = 'rgba(238,242,251,.25)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(stick.ox, stick.oy, 46, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(238,242,251,.35)';
          ctx.beginPath();
          ctx.arc(stick.ox + Math.max(-46, Math.min(46, stick.x - stick.ox)), stick.oy + Math.max(-46, Math.min(46, stick.y - stick.oy)), 18, 0, Math.PI * 2);
          ctx.fill();
        }

        const left = state.crystals.filter((c) => !c.taken).length;
        hud(ctx, cw, [`Кристаллы ${state.crystals.length - left}/${state.crystals.length}`, `Время ${Math.max(0, Math.ceil(state.time))}`, `Очки ${state.score}`]);
        if (state.over) {
          overText(ctx, cw, ch, state.won ? `Выход найден: ${state.score}` : `Время вышло: ${state.score}`, 'Нажмите, чтобы начать заново');
        }
      }
    };
  });
}

const DREAD_SIZE = 21;

function dreadMap() {
  const grid = buildMaze(DREAD_SIZE);
  for (let i = 0; i < DREAD_SIZE * 2; i++) {
    const x = 1 + Math.floor(Math.random() * (DREAD_SIZE - 2));
    const y = 1 + Math.floor(Math.random() * (DREAD_SIZE - 2));
    if (x > 2 || y > 2) grid[y][x] = 0;
  }
  return grid;
}

function dread(canvas, report) {
  return runner(canvas, ({ w, h }) => {
    let width = w;
    let height = h;
    let state = null;
    const keys = new Set();
    let drag = null;
    let stick = null;
    const depth = [];

    const openCells = (grid, minDist, px, py) => {
      const spots = [];
      for (let y = 1; y < DREAD_SIZE - 1; y++) {
        for (let x = 1; x < DREAD_SIZE - 1; x++) {
          if (grid[y][x] === 0 && Math.hypot(x + 0.5 - px, y + 0.5 - py) > minDist) spots.push({ x: x + 0.5, y: y + 0.5 });
        }
      }
      spots.sort(() => Math.random() - 0.5);
      return spots;
    };

    const bestFacing = (grid, px, py) => {
      const options = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      let facing = 0;
      let far = -1;
      for (const option of options) {
        let run = 0;
        while (run < DREAD_SIZE) {
          const nx = Math.floor(px + Math.cos(option) * (run + 1));
          const ny = Math.floor(py + Math.sin(option) * (run + 1));
          if (nx < 0 || ny < 0 || nx >= DREAD_SIZE || ny >= DREAD_SIZE || grid[ny][nx] === 1) break;
          run += 1;
        }
        if (run > far) {
          far = run;
          facing = option;
        }
      }
      return facing;
    };

    const reset = () => {
      const grid = dreadMap();
      const spots = openCells(grid, 6, 1.5, 1.5);
      state = {
        grid,
        px: 1.5,
        py: 1.5,
        angle: bestFacing(grid, 1.5, 1.5),
        torch: 100,
        heart: 0,
        pulse: 0,
        score: 0,
        depth: 1,
        shards: spots.slice(0, 4).map((spot) => ({ ...spot, taken: false })),
        cells: spots.slice(4, 8).map((spot) => ({ ...spot, taken: false })),
        beasts: spots.slice(8, 10).map((spot) => ({ ...spot, x: spot.x, y: spot.y, seen: 0, speed: 0.9 })),
        over: false,
        won: false,
        flash: 0,
        shake: 0
      };
    };
    reset();

    const solid = (x, y) => {
      const gx = Math.floor(x);
      const gy = Math.floor(y);
      if (gx < 0 || gy < 0 || gx >= DREAD_SIZE || gy >= DREAD_SIZE) return true;
      return state.grid[gy][gx] === 1;
    };

    const move = (dx, dy) => {
      if (!solid(state.px + dx * 1.8, state.py)) state.px += dx;
      if (!solid(state.px, state.py + dy * 1.8)) state.py += dy;
    };

    const clearShot = (ax, ay, bx, by) => {
      const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 6);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (solid(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
      }
      return true;
    };

    const nextFloor = () => {
      state.depth += 1;
      state.score += 500;
      const grid = dreadMap();
      const spots = openCells(grid, 6, 1.5, 1.5);
      state.grid = grid;
      state.px = 1.5;
      state.py = 1.5;
      state.angle = bestFacing(grid, 1.5, 1.5);
      state.torch = Math.min(100, state.torch + 35);
      state.shards = spots.slice(0, 4).map((spot) => ({ ...spot, taken: false }));
      state.cells = spots.slice(4, 8).map((spot) => ({ ...spot, taken: false }));
      state.beasts = spots.slice(8, 8 + Math.min(5, 1 + state.depth)).map((spot) => ({ ...spot, seen: 0, speed: 0.9 + state.depth * 0.12 }));
      state.flash = 1;
    };

    const castColumn = (angle) => {
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      let mapX = Math.floor(state.px);
      let mapY = Math.floor(state.py);
      const deltaX = Math.abs(1 / (cos || 1e-6));
      const deltaY = Math.abs(1 / (sin || 1e-6));
      const stepX = cos < 0 ? -1 : 1;
      const stepY = sin < 0 ? -1 : 1;
      let sideX = cos < 0 ? (state.px - mapX) * deltaX : (mapX + 1 - state.px) * deltaX;
      let sideY = sin < 0 ? (state.py - mapY) * deltaY : (mapY + 1 - state.py) * deltaY;
      let side = 0;
      for (let i = 0; i < 64; i++) {
        if (sideX < sideY) {
          sideX += deltaX;
          mapX += stepX;
          side = 0;
        } else {
          sideY += deltaY;
          mapY += stepY;
          side = 1;
        }
        if (mapX < 0 || mapY < 0 || mapX >= DREAD_SIZE || mapY >= DREAD_SIZE) return { dist: 64, side };
        if (state.grid[mapY][mapX] === 1) break;
      }
      const dist = side === 0 ? sideX - deltaX : sideY - deltaY;
      return { dist: Math.max(0.05, dist), side };
    };

    return {
      score: () => state.score,
      resize(size) {
        width = size.w;
        height = size.h;
      },
      bind(bind, node) {
        bind('pointerdown', (event) => {
          event.preventDefault();
          if (state.over) return reset();
          capture(node, event);
          const spot = pointerPos(node, event);
          if (spot.x < width * 0.42 && spot.y > height * 0.55) stick = { id: event.pointerId, ox: spot.x, oy: spot.y, x: spot.x, y: spot.y };
          else drag = { id: event.pointerId, x: spot.x };
        });
        bind('pointermove', (event) => {
          const spot = pointerPos(node, event);
          if (stick && stick.id === event.pointerId) {
            stick.x = spot.x;
            stick.y = spot.y;
            return;
          }
          if (drag && drag.id === event.pointerId) {
            state.angle += (spot.x - drag.x) * 0.006;
            drag.x = spot.x;
          }
        });
        const release = (event) => {
          if (stick && stick.id === event.pointerId) stick = null;
          if (drag && drag.id === event.pointerId) drag = null;
        };
        bind('pointerup', release);
        bind('pointercancel', release);
        bind('keydown', (event) => {
          if (state.over && event.key === ' ') return reset();
          keys.add(event.key);
        }, window);
        bind('keyup', (event) => keys.delete(event.key), window);
      },
      update(dt) {
        if (state.over) return;
        state.pulse += dt;
        state.flash = Math.max(0, state.flash - dt * 2);
        state.shake = Math.max(0, state.shake - dt * 3);
        state.torch = Math.max(0, state.torch - dt * 2.4);

        const walk = 2.2 * dt;
        const spin = 2.1 * dt;
        if (keys.has('ArrowLeft')) state.angle -= spin;
        if (keys.has('ArrowRight')) state.angle += spin;
        if (keys.has('ArrowUp') || keys.has('w')) move(Math.cos(state.angle) * walk, Math.sin(state.angle) * walk);
        if (keys.has('ArrowDown') || keys.has('s')) move(-Math.cos(state.angle) * walk, -Math.sin(state.angle) * walk);
        if (keys.has('a')) move(Math.sin(state.angle) * walk, -Math.cos(state.angle) * walk);
        if (keys.has('d')) move(-Math.sin(state.angle) * walk, Math.cos(state.angle) * walk);

        if (stick) {
          const dx = stick.x - stick.ox;
          const dy = stick.y - stick.oy;
          const len = Math.max(1, Math.hypot(dx, dy));
          const power = Math.min(1, len / 60);
          if (power > 0.12) {
            const forward = (-dy / len) * power * walk * 1.5;
            const strafe = (dx / len) * power * walk * 1.1;
            move(Math.cos(state.angle) * forward - Math.sin(state.angle) * strafe, Math.sin(state.angle) * forward + Math.cos(state.angle) * strafe);
          }
        }

        for (const cell of state.cells) {
          if (cell.taken) continue;
          if (Math.hypot(cell.x - state.px, cell.y - state.py) < 0.5) {
            cell.taken = true;
            state.torch = Math.min(100, state.torch + 30);
            state.score += 40;
          }
        }

        let left = 0;
        for (const shard of state.shards) {
          if (shard.taken) {
            continue;
          }
          left += 1;
          if (Math.hypot(shard.x - state.px, shard.y - state.py) < 0.5) {
            shard.taken = true;
            state.score += 150;
            state.flash = 0.6;
          }
        }
        if (!left) nextFloor();

        let nearest = 99;
        for (const beast of state.beasts) {
          const dx = state.px - beast.x;
          const dy = state.py - beast.y;
          const dist = Math.hypot(dx, dy);
          nearest = Math.min(nearest, dist);
          const hunting = dist < 9 && clearShot(beast.x, beast.y, state.px, state.py);
          beast.seen = hunting ? 1 : Math.max(0, beast.seen - dt * 0.3);
          const chase = beast.seen > 0.05;
          const speed = (chase ? beast.speed * 1.25 : beast.speed * 0.45) * dt;
          if (dist > 0.1) {
            const stepX = (dx / dist) * speed;
            const stepY = (dy / dist) * speed;
            if (!solid(beast.x + stepX * 2, beast.y)) beast.x += stepX;
            if (!solid(beast.x, beast.y + stepY * 2)) beast.y += stepY;
          }
          if (dist < 0.55) {
            state.over = true;
            state.shake = 1;
            report(state.score);
          }
        }
        state.heart = nearest < 6 ? 1 - nearest / 6 : 0;
        if (state.torch <= 0) state.heart = Math.max(state.heart, 0.5);
      },
      draw(ctx, size) {
        const { w: cw, h: ch } = size;
        const shake = state.shake * 8;
        ctx.save();
        if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

        const horizon = ch * 0.5;
        ctx.fillStyle = '#04060a';
        ctx.fillRect(0, 0, cw, ch);
        const floor = ctx.createLinearGradient(0, horizon, 0, ch);
        floor.addColorStop(0, '#0a0c10');
        floor.addColorStop(1, '#05070a');
        ctx.fillStyle = floor;
        ctx.fillRect(0, horizon, cw, ch - horizon);

        const fov = Math.PI / 3;
        const columns = Math.min(200, Math.floor(cw / 3));
        const colWidth = cw / columns;
        const reach = 3 + (state.torch / 100) * 7;
        depth.length = columns;

        for (let i = 0; i < columns; i++) {
          const angle = state.angle - fov / 2 + (i / columns) * fov;
          const hit = castColumn(angle);
          const dist = hit.dist * Math.cos(angle - state.angle);
          depth[i] = dist;
          const wall = Math.min(ch, (ch * 0.9) / dist);
          const fade = Math.max(0, 1 - dist / reach);
          const shade = Math.pow(fade, 1.9) * (hit.side ? 0.62 : 1);
          const tone = Math.round(8 + shade * 96);
          ctx.fillStyle = `rgb(${Math.round(tone * 0.96)},${Math.round(tone * 0.98)},${Math.round(tone)})`;
          ctx.fillRect(i * colWidth, horizon - wall / 2, colWidth + 1, wall);
        }

        const sprites = [];
        state.cells.forEach((cell) => { if (!cell.taken) sprites.push({ ...cell, type: 'cell' }); });
        state.shards.forEach((shard) => { if (!shard.taken) sprites.push({ ...shard, type: 'shard' }); });
        state.beasts.forEach((beast) => sprites.push({ ...beast, type: 'beast' }));

        sprites
          .map((sprite) => ({ ...sprite, dist: Math.hypot(sprite.x - state.px, sprite.y - state.py) }))
          .sort((a, b) => b.dist - a.dist)
          .forEach((sprite) => {
            let rel = Math.atan2(sprite.y - state.py, sprite.x - state.px) - state.angle;
            while (rel > Math.PI) rel -= Math.PI * 2;
            while (rel < -Math.PI) rel += Math.PI * 2;
            if (Math.abs(rel) > fov / 1.6) return;
            const col = Math.floor(((rel + fov / 2) / fov) * columns);
            if (col < 0 || col >= columns) return;
            if (depth[col] < sprite.dist - 0.2) return;
            const screenX = ((rel + fov / 2) / fov) * cw;
            const scale = Math.min(ch, (ch * 0.85) / Math.max(0.3, sprite.dist));
            const fade = Math.max(0, 1 - sprite.dist / (reach + 1.5));

            if (sprite.type === 'beast') {
              const glow = 0.35 + fade * 0.65;
              ctx.globalAlpha = Math.min(1, glow);
              ctx.fillStyle = '#0b0d11';
              ctx.beginPath();
              ctx.ellipse(screenX, horizon + scale * 0.08, scale * 0.17, scale * 0.42, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = `rgba(210,70,60,${0.55 + Math.sin(state.pulse * 6) * 0.25})`;
              const eye = scale * 0.035;
              ctx.beginPath();
              ctx.arc(screenX - scale * 0.055, horizon - scale * 0.2, eye, 0, Math.PI * 2);
              ctx.arc(screenX + scale * 0.055, horizon - scale * 0.2, eye, 0, Math.PI * 2);
              ctx.fill();
              ctx.globalAlpha = 1;
              return;
            }

            const shardLike = sprite.type === 'shard';
            ctx.globalAlpha = Math.min(1, 0.25 + fade);
            ctx.fillStyle = shardLike ? '#8fe3c8' : '#e0c06a';
            ctx.beginPath();
            const r = scale * (shardLike ? 0.07 : 0.05);
            ctx.arc(screenX, horizon + scale * 0.12, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = Math.min(0.35, fade * 0.35);
            ctx.beginPath();
            ctx.arc(screenX, horizon + scale * 0.12, r * 3.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          });

        const vignette = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.12, cw / 2, ch / 2, ch * 0.78);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, `rgba(0,0,0,${0.84 + state.heart * 0.14})`);
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, cw, ch);

        if (state.heart > 0.02) {
          const beat = Math.abs(Math.sin(state.pulse * (3 + state.heart * 6)));
          ctx.fillStyle = `rgba(150,20,20,${state.heart * 0.22 * beat})`;
          ctx.fillRect(0, 0, cw, ch);
        }
        if (state.flash > 0) {
          ctx.fillStyle = `rgba(190,230,215,${state.flash * 0.28})`;
          ctx.fillRect(0, 0, cw, ch);
        }
        ctx.restore();

        hud(ctx, cw, [
          `Этаж ${state.depth}`,
          `Осколки ${state.shards.filter((sh) => !sh.taken).length}`,
          `Очки ${state.score}`
        ]);

        const barW = cw * 0.42;
        ctx.fillStyle = 'rgba(255,255,255,.12)';
        ctx.fillRect(cw / 2 - barW / 2, ch - 26, barW, 6);
        ctx.fillStyle = state.torch > 25 ? '#d8c98a' : '#c9605c';
        ctx.fillRect(cw / 2 - barW / 2, ch - 26, (barW * state.torch) / 100, 6);

        if (state.over) {
          ctx.fillStyle = 'rgba(4,4,6,.82)';
          ctx.fillRect(0, 0, cw, ch);
          ctx.textAlign = 'center';
          ctx.fillStyle = '#e8d5d2';
          ctx.font = '700 26px Inter, system-ui, sans-serif';
          ctx.fillText('Оно вас нашло', cw / 2, ch / 2 - 8);
          ctx.font = '500 14px Inter, system-ui, sans-serif';
          ctx.fillStyle = 'rgba(232,213,210,.7)';
          ctx.fillText(`Этаж ${state.depth} · очки ${state.score}`, cw / 2, ch / 2 + 18);
          ctx.fillText('Коснитесь, чтобы начать заново', cw / 2, ch / 2 + 42);
          ctx.textAlign = 'start';
        }
      }
    };
  });
}

function rally(canvas, report) {
  return runner(canvas, ({ w, h }) => {
    let width = w;
    let height = h;
    let state = null;
    const keys = new Set();
    let touch = null;

    const reset = () => {
      state = {
        lane: 1,
        offset: 0,
        speed: 210,
        dist: 0,
        score: 0,
        curve: 0,
        curveTarget: 0,
        traffic: [],
        coins: [],
        spawn: 0,
        coinSpawn: 0,
        over: false,
        boost: 0,
        shake: 0
      };
    };
    reset();

    const lanes = 3;
    const laneX = (index, size) => size.w * (0.22 + index * 0.28);

    return {
      score: () => state.score,
      resize(size) {
        width = size.w;
        height = size.h;
      },
      bind(bind, node) {
        bind('pointerdown', (event) => {
          event.preventDefault();
          if (state.over) return reset();
          touch = { x: pointerX(node, event), moved: false };
        });
        bind('pointermove', (event) => {
          if (!touch) return;
          const x = pointerX(node, event);
          if (x - touch.x > 34 && state.lane < lanes - 1) {
            state.lane += 1;
            touch.x = x;
            touch.moved = true;
          } else if (touch.x - x > 34 && state.lane > 0) {
            state.lane -= 1;
            touch.x = x;
            touch.moved = true;
          }
        });
        const release = (event) => {
          if (touch && !touch.moved) {
            const x = pointerX(node, event);
            if (x > width / 2 && state.lane < lanes - 1) state.lane += 1;
            else if (x <= width / 2 && state.lane > 0) state.lane -= 1;
          }
          touch = null;
        };
        bind('pointerup', release);
        bind('pointercancel', () => { touch = null; });
        bind('keydown', (event) => {
          if (state.over && event.key === ' ') return reset();
          if ((event.key === 'ArrowLeft' || event.key === 'a') && state.lane > 0) state.lane -= 1;
          if ((event.key === 'ArrowRight' || event.key === 'd') && state.lane < lanes - 1) state.lane += 1;
          keys.add(event.key);
        }, window);
        bind('keyup', (event) => keys.delete(event.key), window);
      },
      update(dt, size) {
        if (state.over) return;
        state.speed = Math.min(620, state.speed + dt * 11);
        state.dist += state.speed * dt;
        state.score = Math.floor(state.dist / 10);
        state.offset = (state.offset + state.speed * dt) % 60;
        state.shake = Math.max(0, state.shake - dt * 3);
        state.boost = Math.max(0, state.boost - dt);

        if (Math.random() < dt * 0.6) state.curveTarget = (Math.random() - 0.5) * 1.6;
        state.curve += (state.curveTarget - state.curve) * dt * 1.4;

        state.spawn -= dt;
        if (state.spawn <= 0) {
          state.spawn = Math.max(0.42, 1.25 - state.dist / 26000);
          const busy = new Set();
          const count = state.dist > 5000 && Math.random() < 0.4 ? 2 : 1;
          for (let i = 0; i < count; i++) {
            let lane = Math.floor(Math.random() * lanes);
            let guard = 0;
            while (busy.has(lane) && guard++ < 6) lane = Math.floor(Math.random() * lanes);
            busy.add(lane);
            state.traffic.push({ lane, y: -140, hue: 200 + Math.random() * 140 });
          }
        }

        state.coinSpawn -= dt;
        if (state.coinSpawn <= 0) {
          state.coinSpawn = 0.7 + Math.random();
          state.coins.push({ lane: Math.floor(Math.random() * lanes), y: -80, taken: false });
        }

        const carY = size.h * 0.78;
        state.traffic.forEach((car) => { car.y += (state.speed + 120) * dt; });
        state.coins.forEach((coin) => { coin.y += (state.speed + 120) * dt; });
        state.traffic = state.traffic.filter((car) => car.y < size.h + 160);
        state.coins = state.coins.filter((coin) => coin.y < size.h + 80 && !coin.taken);

        for (const car of state.traffic) {
          if (car.lane === state.lane && Math.abs(car.y - carY) < 58) {
            state.over = true;
            state.shake = 1;
            report(state.score);
          }
        }
        for (const coin of state.coins) {
          if (coin.lane === state.lane && Math.abs(coin.y - carY) < 46) {
            coin.taken = true;
            state.score += 25;
            state.boost = 0.4;
          }
        }
      },
      draw(ctx, size) {
        const { w: cw, h: ch } = size;
        ctx.save();
        if (state.shake) ctx.translate((Math.random() - 0.5) * state.shake * 10, 0);

        const sky = ctx.createLinearGradient(0, 0, 0, ch * 0.45);
        sky.addColorStop(0, '#160f28');
        sky.addColorStop(1, '#3a2148');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, cw, ch * 0.45);
        const sunX = cw * 0.5 - state.curve * 90;
        const sunY = ch * 0.37;
        const halo = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, ch * 0.14);
        halo.addColorStop(0, 'rgba(240,194,122,.5)');
        halo.addColorStop(1, 'rgba(240,194,122,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(sunX - ch * 0.14, sunY - ch * 0.14, ch * 0.28, ch * 0.28);
        ctx.fillStyle = '#f0c27a';
        ctx.beginPath();
        ctx.arc(sunX, sunY, ch * 0.045, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(20,12,32,.85)';
        for (let i = 0; i < 14; i++) {
          const bx = ((i * 97 + Math.floor(state.dist / 40)) % (cw + 120)) - 60;
          const bh = ch * (0.03 + ((i * 37) % 9) / 120);
          ctx.fillRect(bx, ch * 0.45 - bh, 26 + (i % 3) * 12, bh);
        }

        ctx.fillStyle = '#1c1226';
        ctx.fillRect(0, ch * 0.45, cw, ch * 0.55);

        const roadTop = ch * 0.45;
        const topW = cw * 0.16;
        const bottomW = cw * 0.94;
        const skew = state.curve * cw * 0.12;
        ctx.fillStyle = '#232030';
        ctx.beginPath();
        ctx.moveTo(cw / 2 - topW / 2 + skew, roadTop);
        ctx.lineTo(cw / 2 + topW / 2 + skew, roadTop);
        ctx.lineTo(cw / 2 + bottomW / 2, ch);
        ctx.lineTo(cw / 2 - bottomW / 2, ch);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,.5)';
        ctx.lineWidth = 3;
        for (let lane = 1; lane < lanes; lane++) {
          for (let i = 0; i < 16; i++) {
            const t0 = (i * 60 + state.offset) / (ch - roadTop);
            const t1 = t0 + 0.045;
            if (t0 > 1) continue;
            const y0 = roadTop + (ch - roadTop) * Math.pow(t0, 1.7);
            const y1 = roadTop + (ch - roadTop) * Math.pow(Math.min(1, t1), 1.7);
            const p0 = Math.pow(t0, 1.7);
            const p1 = Math.pow(Math.min(1, t1), 1.7);
            const w0 = topW + (bottomW - topW) * p0;
            const w1 = topW + (bottomW - topW) * p1;
            const c0 = cw / 2 + skew * (1 - p0);
            const c1 = cw / 2 + skew * (1 - p1);
            const x0 = c0 - w0 / 2 + (w0 / lanes) * lane;
            const x1 = c1 - w1 / 2 + (w1 / lanes) * lane;
            ctx.globalAlpha = 0.15 + p0 * 0.6;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;

        const project = (lane, y) => {
          const t = Math.max(0, Math.min(1, (y - roadTop) / (ch - roadTop)));
          const p = Math.pow(t, 1.7);
          const roadW = topW + (bottomW - topW) * p;
          const center = cw / 2 + skew * (1 - p);
          return { x: center - roadW / 2 + (roadW / lanes) * (lane + 0.5), scale: 0.25 + p * 0.9 };
        };

        state.coins.forEach((coin) => {
          if (coin.y < roadTop) return;
          const spot = project(coin.lane, coin.y);
          const r = 9 * spot.scale;
          ctx.fillStyle = '#e8c46a';
          ctx.beginPath();
          ctx.arc(spot.x, coin.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.5)';
          ctx.beginPath();
          ctx.arc(spot.x - r * 0.25, coin.y - r * 0.25, r * 0.32, 0, Math.PI * 2);
          ctx.fill();
        });

        const car = (x, y, scale, hue, mine) => {
          const bw = 46 * scale;
          const bh = 74 * scale;
          ctx.fillStyle = mine ? '#8fd7c2' : `hsl(${hue} 55% 58%)`;
          ctx.beginPath();
          ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, 9 * scale);
          ctx.fill();
          ctx.fillStyle = 'rgba(10,12,20,.75)';
          ctx.beginPath();
          ctx.roundRect(x - bw * 0.34, y - bh * 0.22, bw * 0.68, bh * 0.34, 5 * scale);
          ctx.fill();
          ctx.fillStyle = mine ? 'rgba(255,240,190,.9)' : 'rgba(255,120,110,.85)';
          ctx.fillRect(x - bw * 0.36, y + (mine ? -bh * 0.46 : bh * 0.4), bw * 0.22, 5 * scale);
          ctx.fillRect(x + bw * 0.14, y + (mine ? -bh * 0.46 : bh * 0.4), bw * 0.22, 5 * scale);
        };

        state.traffic
          .filter((row) => row.y > roadTop)
          .sort((a, b) => a.y - b.y)
          .forEach((row) => {
            const spot = project(row.lane, row.y);
            car(spot.x, row.y, spot.scale, row.hue, false);
          });

        const carY = ch * 0.78;
        const mine = project(state.lane, carY);
        if (state.boost > 0) {
          ctx.fillStyle = `rgba(232,196,106,${state.boost * 0.5})`;
          ctx.beginPath();
          ctx.arc(mine.x, carY, 46, 0, Math.PI * 2);
          ctx.fill();
        }
        car(mine.x, carY, mine.scale, 160, true);
        ctx.restore();

        hud(ctx, cw, [`${Math.round(state.speed / 3)} км/ч`, `Очки ${state.score}`]);

        if (state.over) {
          ctx.fillStyle = 'rgba(8,6,14,.82)';
          ctx.fillRect(0, 0, cw, ch);
          ctx.textAlign = 'center';
          ctx.fillStyle = '#eef2fb';
          ctx.font = '700 26px Inter, system-ui, sans-serif';
          ctx.fillText('Разбились', cw / 2, ch / 2 - 8);
          ctx.font = '500 14px Inter, system-ui, sans-serif';
          ctx.fillStyle = 'rgba(238,242,251,.7)';
          ctx.fillText(`Очки ${state.score}`, cw / 2, ch / 2 + 18);
          ctx.fillText('Коснитесь, чтобы поехать снова', cw / 2, ch / 2 + 42);
          ctx.textAlign = 'start';
        }
      }
    };
  });
}

function tetris(canvas, report) {
  return runner(canvas, () => {
    const cols = 10;
    const rows = 20;
    const SHAPES = [
      [[1, 1, 1, 1]],
      [[1, 1], [1, 1]],
      [[0, 1, 0], [1, 1, 1]],
      [[1, 0, 0], [1, 1, 1]],
      [[0, 0, 1], [1, 1, 1]],
      [[1, 1, 0], [0, 1, 1]],
      [[0, 1, 1], [1, 1, 0]]
    ];
    const TINTS = ['#6fc5ff', '#e8c46a', '#a58bff', '#7fb0ff', '#f0a06a', '#8fd7a8', '#e88f9a'];
    let state = null;
    let swipe = null;

    const spawn = () => {
      const index = Math.floor(Math.random() * SHAPES.length);
      return { cells: SHAPES[index].map((row) => [...row]), tint: TINTS[index], x: 3, y: 0 };
    };

    const reset = () => {
      state = {
        board: Array.from({ length: rows }, () => Array(cols).fill(null)),
        piece: spawn(),
        next: spawn(),
        drop: 0,
        speed: 0.62,
        score: 0,
        lines: 0,
        over: false
      };
    };
    reset();

    const hits = (piece, ox, oy, cells) => {
      const shape = cells || piece.cells;
      for (let y = 0; y < shape.length; y++) {
        for (let x = 0; x < shape[y].length; x++) {
          if (!shape[y][x]) continue;
          const nx = piece.x + x + ox;
          const ny = piece.y + y + oy;
          if (nx < 0 || nx >= cols || ny >= rows) return true;
          if (ny >= 0 && state.board[ny][nx]) return true;
        }
      }
      return false;
    };

    const merge = () => {
      state.piece.cells.forEach((row, y) => {
        row.forEach((cell, x) => {
          if (!cell) return;
          const ny = state.piece.y + y;
          if (ny >= 0) state.board[ny][state.piece.x + x] = state.piece.tint;
        });
      });
      let cleared = 0;
      for (let y = rows - 1; y >= 0; y--) {
        if (state.board[y].every(Boolean)) {
          state.board.splice(y, 1);
          state.board.unshift(Array(cols).fill(null));
          cleared += 1;
          y += 1;
        }
      }
      if (cleared) {
        state.lines += cleared;
        state.score += [0, 100, 300, 600, 1000][cleared];
        state.speed = Math.max(0.13, 0.62 - state.lines * 0.012);
      }
      state.piece = state.next;
      state.next = spawn();
      if (hits(state.piece, 0, 0)) {
        state.over = true;
        report(state.score);
      }
    };

    const rotate = () => {
      const cells = state.piece.cells;
      const turned = cells[0].map((_, i) => cells.map((row) => row[i]).reverse());
      for (const shift of [0, -1, 1, -2, 2]) {
        if (!hits(state.piece, shift, 0, turned)) {
          state.piece.cells = turned;
          state.piece.x += shift;
          return;
        }
      }
    };

    const shift = (dir) => {
      if (!hits(state.piece, dir, 0)) state.piece.x += dir;
    };

    const fall = () => {
      if (!hits(state.piece, 0, 1)) state.piece.y += 1;
      else merge();
    };

    return {
      score: () => state.score,
      bind(bind, node) {
        bind('pointerdown', (event) => {
          event.preventDefault();
          if (state.over) return reset();
          swipe = { ...pointerPos(node, event), at: Date.now(), moved: false };
        });
        bind('pointermove', (event) => {
          if (!swipe) return;
          const spot = pointerPos(node, event);
          const dx = spot.x - swipe.x;
          const dy = spot.y - swipe.y;
          if (Math.abs(dx) > 26 && Math.abs(dx) > Math.abs(dy)) {
            shift(dx > 0 ? 1 : -1);
            swipe.x = spot.x;
            swipe.moved = true;
          } else if (dy > 30) {
            fall();
            swipe.y = spot.y;
            swipe.moved = true;
          }
        });
        bind('pointerup', () => {
          if (swipe && !swipe.moved && Date.now() - swipe.at < 320) rotate();
          swipe = null;
        });
        bind('keydown', (event) => {
          if (state.over) {
            if (event.key === ' ') reset();
            return;
          }
          if (event.key === 'ArrowLeft') shift(-1);
          if (event.key === 'ArrowRight') shift(1);
          if (event.key === 'ArrowDown') fall();
          if (event.key === 'ArrowUp' || event.key === ' ') rotate();
        }, window);
      },
      update(dt) {
        if (state.over) return;
        state.drop += dt;
        if (state.drop >= state.speed) {
          state.drop = 0;
          fall();
        }
      },
      draw(ctx, size) {
        const { w, h } = size;
        backdrop(ctx, w, h, ['#0e1524', '#191f36']);
        const pad = 12;
        const cell = Math.min((w - pad * 2) / cols, (h - 90) / rows);
        const boardW = cell * cols;
        const boardH = cell * rows;
        const ox = (w - boardW) / 2;
        const oy = 62;

        ctx.fillStyle = 'rgba(255,255,255,.04)';
        ctx.fillRect(ox, oy, boardW, boardH);
        ctx.strokeStyle = 'rgba(255,255,255,.06)';
        ctx.lineWidth = 1;
        for (let x = 1; x < cols; x++) {
          ctx.beginPath();
          ctx.moveTo(ox + x * cell, oy);
          ctx.lineTo(ox + x * cell, oy + boardH);
          ctx.stroke();
        }

        const block = (bx, by, tint) => {
          ctx.fillStyle = tint;
          ctx.beginPath();
          ctx.roundRect(ox + bx * cell + 1, oy + by * cell + 1, cell - 2, cell - 2, 3);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.18)';
          ctx.fillRect(ox + bx * cell + 3, oy + by * cell + 3, cell - 6, 3);
        };

        state.board.forEach((row, y) => row.forEach((tint, x) => { if (tint) block(x, y, tint); }));
        state.piece.cells.forEach((row, y) => row.forEach((cell2, x) => {
          if (cell2 && state.piece.y + y >= 0) block(state.piece.x + x, state.piece.y + y, state.piece.tint);
        }));

        hud(ctx, w, [`Очки ${state.score}`, `Линии ${state.lines}`]);
        ctx.fillStyle = 'rgba(238,242,251,.55)';
        ctx.font = '500 12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('свайп — двигать, тап — повернуть', w / 2, h - 12);
        ctx.textAlign = 'start';

        if (state.over) overText(ctx, w, h, 'Стакан полон', `Очки ${state.score}`);
      }
    };
  });
}

function puzzle2048(canvas, report) {
  return runner(canvas, () => {
    let state = null;
    let swipe = null;

    const empty = () => {
      const spots = [];
      state.grid.forEach((row, y) => row.forEach((v, x) => { if (!v) spots.push({ x, y }); }));
      return spots;
    };

    const drop = () => {
      const spots = empty();
      if (!spots.length) return;
      const spot = spots[Math.floor(Math.random() * spots.length)];
      state.grid[spot.y][spot.x] = Math.random() < 0.9 ? 2 : 4;
    };

    const reset = () => {
      state = { grid: Array.from({ length: 4 }, () => Array(4).fill(0)), score: 0, best: 0, over: false };
      drop();
      drop();
    };
    reset();

    const slide = (line) => {
      const packed = line.filter(Boolean);
      const out = [];
      for (let i = 0; i < packed.length; i++) {
        if (packed[i] === packed[i + 1]) {
          out.push(packed[i] * 2);
          state.score += packed[i] * 2;
          state.best = Math.max(state.best, packed[i] * 2);
          i += 1;
        } else out.push(packed[i]);
      }
      while (out.length < 4) out.push(0);
      return out;
    };

    const move = (dir) => {
      if (state.over) return;
      const before = JSON.stringify(state.grid);
      for (let i = 0; i < 4; i++) {
        let line;
        if (dir === 'left') line = state.grid[i];
        else if (dir === 'right') line = [...state.grid[i]].reverse();
        else if (dir === 'up') line = [0, 1, 2, 3].map((j) => state.grid[j][i]);
        else line = [3, 2, 1, 0].map((j) => state.grid[j][i]);

        const out = slide(line);
        if (dir === 'left') state.grid[i] = out;
        else if (dir === 'right') state.grid[i] = out.reverse();
        else if (dir === 'up') out.forEach((v, j) => { state.grid[j][i] = v; });
        else out.forEach((v, j) => { state.grid[3 - j][i] = v; });
      }
      if (JSON.stringify(state.grid) !== before) drop();

      const stuck = !empty().length && !state.grid.some((row, y) => row.some((v, x) =>
        (x < 3 && v === state.grid[y][x + 1]) || (y < 3 && v === state.grid[y + 1][x])));
      if (stuck) {
        state.over = true;
        report(state.score);
      }
    };

    const tint = (value) => {
      const map = {
        2: '#3a4460', 4: '#46557a', 8: '#6f7fb0', 16: '#8f7fc0', 32: '#a87fb8',
        64: '#c98fa0', 128: '#d3a06a', 256: '#d8b45c', 512: '#c9c05c', 1024: '#8fd7a8', 2048: '#5be6c7'
      };
      return map[value] || '#5be6c7';
    };

    return {
      score: () => state.score,
      bind(bind, node) {
        bind('pointerdown', (event) => {
          event.preventDefault();
          if (state.over) return reset();
          swipe = pointerPos(node, event);
        });
        bind('pointerup', (event) => {
          if (!swipe) return;
          const spot = pointerPos(node, event);
          const dx = spot.x - swipe.x;
          const dy = spot.y - swipe.y;
          swipe = null;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
          if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
          else move(dy > 0 ? 'down' : 'up');
        });
        bind('keydown', (event) => {
          if (state.over && event.key === ' ') return reset();
          const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
          if (map[event.key]) move(map[event.key]);
        }, window);
      },
      update() {},
      draw(ctx, size) {
        const { w, h } = size;
        backdrop(ctx, w, h, ['#151221', '#26203a']);
        const board = Math.min(w - 28, h - 130);
        const ox = (w - board) / 2;
        const oy = 74;
        const cell = board / 4;

        ctx.fillStyle = 'rgba(255,255,255,.05)';
        ctx.beginPath();
        ctx.roundRect(ox - 6, oy - 6, board + 12, board + 12, 14);
        ctx.fill();

        for (let y = 0; y < 4; y++) {
          for (let x = 0; x < 4; x++) {
            const value = state.grid[y][x];
            ctx.fillStyle = value ? tint(value) : 'rgba(255,255,255,.05)';
            ctx.beginPath();
            ctx.roundRect(ox + x * cell + 4, oy + y * cell + 4, cell - 8, cell - 8, 9);
            ctx.fill();
            if (!value) continue;
            ctx.fillStyle = value > 4 ? '#0d1018' : '#e8edf6';
            ctx.font = `700 ${value > 999 ? cell * 0.28 : cell * 0.36}px Inter, system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(value), ox + x * cell + cell / 2, oy + y * cell + cell / 2);
          }
        }
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
        hud(ctx, w, [`Очки ${state.score}`, `Лучшая плитка ${state.best}`]);
        if (state.over) overText(ctx, w, h, 'Ходов нет', `Очки ${state.score}`);
      }
    };
  });
}

function mines(canvas, report) {
  return runner(canvas, () => {
    const cols = 9;
    const rows = 12;
    const bombs = 16;
    let state = null;
    let press = null;

    const reset = () => {
      const field = Array.from({ length: rows }, () => Array(cols).fill(0));
      let placed = 0;
      while (placed < bombs) {
        const x = Math.floor(Math.random() * cols);
        const y = Math.floor(Math.random() * rows);
        if (field[y][x] === -1) continue;
        field[y][x] = -1;
        placed += 1;
      }
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (field[y][x] === -1) continue;
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const ny = y + dy;
              const nx = x + dx;
              if (ny >= 0 && nx >= 0 && ny < rows && nx < cols && field[ny][nx] === -1) n += 1;
            }
          }
          field[y][x] = n;
        }
      }
      state = {
        field,
        open: Array.from({ length: rows }, () => Array(cols).fill(false)),
        flags: Array.from({ length: rows }, () => Array(cols).fill(false)),
        score: 0,
        over: false,
        won: false,
        flagMode: false
      };
    };
    reset();

    const reveal = (x, y) => {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return;
      if (state.open[y][x] || state.flags[y][x]) return;
      state.open[y][x] = true;
      if (state.field[y][x] === -1) {
        state.over = true;
        report(state.score);
        return;
      }
      state.score += 10;
      if (state.field[y][x] === 0) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) reveal(x + dx, y + dy);
      }
      const left = state.open.flat().filter(Boolean).length;
      if (left === cols * rows - bombs && !state.won) {
        state.won = true;
        state.over = true;
        state.score += 500;
        report(state.score);
      }
    };

    return {
      score: () => state.score,
      bind(bind, node) {
        bind('pointerdown', (event) => {
          event.preventDefault();
          press = { ...pointerPos(node, event), at: Date.now() };
        });
        bind('pointerup', (event) => {
          if (!press) return;
          const spot = pointerPos(node, event);
          const long = Date.now() - press.at > 380;
          press = null;
          if (state.over) return reset();
          const size = state.layout;
          if (!size) return;
          if (spot.y < size.oy - 40 && spot.y > size.oy - 76) {
            state.flagMode = !state.flagMode;
            return;
          }
          const x = Math.floor((spot.x - size.ox) / size.cell);
          const y = Math.floor((spot.y - size.oy) / size.cell);
          if (x < 0 || y < 0 || x >= cols || y >= rows) return;
          if (long || state.flagMode) {
            if (!state.open[y][x]) state.flags[y][x] = !state.flags[y][x];
            return;
          }
          reveal(x, y);
        });
        bind('keydown', (event) => {
          if (state.over && event.key === ' ') reset();
        }, window);
      },
      update() {},
      draw(ctx, size) {
        const { w, h } = size;
        backdrop(ctx, w, h, ['#101a16', '#1b2b24']);
        const cell = Math.min((w - 24) / cols, (h - 150) / rows);
        const ox = (w - cell * cols) / 2;
        const oy = 108;
        state.layout = { ox, oy, cell };

        ctx.fillStyle = state.flagMode ? 'rgba(216,180,92,.24)' : 'rgba(255,255,255,.07)';
        ctx.beginPath();
        ctx.roundRect(ox, oy - 74, cell * cols, 34, 10);
        ctx.fill();
        ctx.fillStyle = state.flagMode ? '#e8c46a' : 'rgba(238,242,251,.75)';
        ctx.font = '600 13px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(state.flagMode ? 'Режим флажков включён' : 'Тап — открыть, долгий тап — флажок', w / 2, oy - 52);
        ctx.textAlign = 'start';

        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const px = ox + x * cell;
            const py = oy + y * cell;
            const open = state.open[y][x];
            ctx.fillStyle = open ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.13)';
            ctx.beginPath();
            ctx.roundRect(px + 1.5, py + 1.5, cell - 3, cell - 3, 5);
            ctx.fill();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (state.flags[y][x] && !open) {
              ctx.fillStyle = '#e8c46a';
              ctx.font = `700 ${cell * 0.5}px Inter, system-ui, sans-serif`;
              ctx.fillText('!', px + cell / 2, py + cell / 2);
            } else if (open && state.field[y][x] === -1) {
              ctx.fillStyle = '#d4736f';
              ctx.beginPath();
              ctx.arc(px + cell / 2, py + cell / 2, cell * 0.22, 0, Math.PI * 2);
              ctx.fill();
            } else if (open && state.field[y][x] > 0) {
              const tints = ['', '#7fb0ff', '#8fd7a8', '#e8c46a', '#c98fa0', '#a58bff', '#5be6c7', '#eef2fb', '#d4736f'];
              ctx.fillStyle = tints[state.field[y][x]] || '#eef2fb';
              ctx.font = `700 ${cell * 0.46}px Inter, system-ui, sans-serif`;
              ctx.fillText(String(state.field[y][x]), px + cell / 2, py + cell / 2);
            }
          }
        }
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
        hud(ctx, w, [`Очки ${state.score}`, `Мин ${bombs}`]);
        if (state.over) overText(ctx, w, h, state.won ? 'Поле чистое' : 'Взрыв', `Очки ${state.score}`);
      }
    };
  });
}

function bricks(canvas, report) {
  return runner(canvas, ({ w, h }) => {
    let state = null;
    let width = w;

    const build = (level) => {
      const rows = Math.min(7, 3 + level);
      const cols = 7;
      const out = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          out.push({ x, y, life: y < 1 && level > 1 ? 2 : 1 });
        }
      }
      return out;
    };

    const reset = () => {
      state = { padX: 0.5, ball: { x: 0.5, y: 0.6, vx: 0.36, vy: -0.55 }, bricks: build(1), level: 1, lives: 3, score: 0, over: false };
    };
    reset();

    return {
      score: () => state.score,
      resize(size) {
        width = size.w;
      },
      bind(bind, node) {
        const track = (event) => {
          if (state.over) return;
          state.padX = Math.max(0.08, Math.min(0.92, pointerX(node, event) / width));
        };
        bind('pointerdown', (event) => {
          event.preventDefault();
          if (state.over) return reset();
          track(event);
        });
        bind('pointermove', track);
        bind('keydown', (event) => {
          if (state.over && event.key === ' ') return reset();
          if (event.key === 'ArrowLeft') state.padX = Math.max(0.08, state.padX - 0.06);
          if (event.key === 'ArrowRight') state.padX = Math.min(0.92, state.padX + 0.06);
        }, window);
      },
      update(dt, size) {
        if (state.over) return;
        const ball = state.ball;
        const speed = 1 + state.level * 0.09;
        ball.x += ball.vx * dt * speed;
        ball.y += ball.vy * dt * speed;

        if (ball.x < 0.02) { ball.x = 0.02; ball.vx *= -1; }
        if (ball.x > 0.98) { ball.x = 0.98; ball.vx *= -1; }
        if (ball.y < 0.08) { ball.y = 0.08; ball.vy *= -1; }

        if (ball.y > 0.9 && ball.y < 0.94 && ball.vy > 0) {
          if (Math.abs(ball.x - state.padX) < 0.12) {
            ball.vy *= -1;
            ball.vx += (ball.x - state.padX) * 0.9;
            ball.vx = Math.max(-0.8, Math.min(0.8, ball.vx));
            state.score += 5;
          }
        }
        if (ball.y > 1.02) {
          state.lives -= 1;
          if (state.lives <= 0) {
            state.over = true;
            report(state.score);
          } else {
            state.ball = { x: 0.5, y: 0.6, vx: 0.36, vy: -0.55 };
          }
        }

        const top = 0.14;
        const bh = 0.045;
        const bw = 1 / 7;
        for (const brick of state.bricks) {
          if (!brick.life) continue;
          const bx = brick.x * bw + 0.01;
          const by = top + brick.y * (bh + 0.008);
          if (ball.x > bx - 0.02 && ball.x < bx + bw - 0.01 && ball.y > by - 0.015 && ball.y < by + bh + 0.015) {
            brick.life -= 1;
            state.score += 25;
            ball.vy *= -1;
            break;
          }
        }
        if (state.bricks.every((brick) => !brick.life)) {
          state.level += 1;
          state.score += 200;
          state.bricks = build(state.level);
          state.ball = { x: 0.5, y: 0.6, vx: 0.36, vy: -0.55 };
        }
      },
      draw(ctx, size) {
        const { w, h } = size;
        backdrop(ctx, w, h, ['#0b1524', '#152238']);
        const bw = w / 7;
        const bh = h * 0.045;
        state.bricks.forEach((brick) => {
          if (!brick.life) return;
          ctx.fillStyle = brick.life > 1 ? '#e8c46a' : `hsl(${190 + brick.y * 18} 55% 60%)`;
          ctx.beginPath();
          ctx.roundRect(brick.x * bw + w * 0.01, h * 0.14 + brick.y * (bh + h * 0.008), bw - w * 0.02, bh, 5);
          ctx.fill();
        });

        ctx.fillStyle = '#8fd7c2';
        ctx.beginPath();
        ctx.roundRect(state.padX * w - w * 0.12, h * 0.92, w * 0.24, 10, 5);
        ctx.fill();

        ctx.fillStyle = '#eef2fb';
        ctx.beginPath();
        ctx.arc(state.ball.x * w, state.ball.y * h, 7, 0, Math.PI * 2);
        ctx.fill();

        hud(ctx, w, [`Очки ${state.score}`, `Уровень ${state.level}`, `Жизни ${state.lives}`]);
        if (state.over) overText(ctx, w, h, 'Мяч потерян', `Очки ${state.score}`);
      }
    };
  });
}

function flap(canvas, report) {
  return runner(canvas, () => {
    let state = null;

    const reset = () => {
      state = { y: 0.45, v: 0, pipes: [], gap: 0.3, spawn: 0, score: 0, dist: 0, over: false, wing: 0 };
    };
    reset();

    return {
      score: () => state.score,
      bind(bind) {
        const flapUp = (event) => {
          event.preventDefault?.();
          if (state.over) return reset();
          state.v = -0.55;
          state.wing = 1;
        };
        bind('pointerdown', flapUp);
        bind('keydown', (event) => {
          if (event.key === ' ' || event.key === 'ArrowUp') flapUp(event);
        }, window);
      },
      update(dt) {
        if (state.over) return;
        state.dist += dt;
        state.wing = Math.max(0, state.wing - dt * 4);
        state.v += dt * 1.75;
        state.y += state.v * dt;
        state.gap = Math.max(0.19, 0.3 - state.dist * 0.0022);

        state.spawn -= dt;
        if (state.spawn <= 0) {
          state.spawn = 1.45;
          state.pipes.push({ x: 1.15, top: 0.14 + Math.random() * 0.45, passed: false });
        }
        const speed = 0.34 + state.dist * 0.004;
        state.pipes.forEach((pipe) => { pipe.x -= speed * dt; });
        state.pipes = state.pipes.filter((pipe) => pipe.x > -0.2);

        for (const pipe of state.pipes) {
          if (!pipe.passed && pipe.x < 0.2) {
            pipe.passed = true;
            state.score += 10;
          }
          if (pipe.x < 0.28 && pipe.x > 0.1) {
            if (state.y < pipe.top || state.y > pipe.top + state.gap) {
              state.over = true;
              report(state.score);
            }
          }
        }
        if (state.y > 0.98 || state.y < 0.01) {
          state.over = true;
          report(state.score);
        }
      },
      draw(ctx, size) {
        const { w, h } = size;
        backdrop(ctx, w, h, ['#16233a', '#2b3c58']);
        ctx.fillStyle = 'rgba(255,255,255,.06)';
        for (let i = 0; i < 5; i++) {
          const cx = ((i * 137 + state.dist * 12) % (w + 160)) - 80;
          ctx.beginPath();
          ctx.arc(cx, h * (0.12 + (i % 3) * 0.08), 26 + (i % 3) * 9, 0, Math.PI * 2);
          ctx.fill();
        }

        state.pipes.forEach((pipe) => {
          const px = pipe.x * w;
          const pw = w * 0.16;
          ctx.fillStyle = '#5f9e7f';
          ctx.beginPath();
          ctx.roundRect(px, 0, pw, pipe.top * h, 6);
          ctx.fill();
          ctx.beginPath();
          ctx.roundRect(px, (pipe.top + state.gap) * h, pw, h, 6);
          ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,.2)';
          ctx.fillRect(px, pipe.top * h - 12, pw, 12);
          ctx.fillRect(px, (pipe.top + state.gap) * h, pw, 12);
        });

        const bx = w * 0.2;
        const by = state.y * h;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(Math.max(-0.5, Math.min(0.9, state.v * 0.8)));
        ctx.fillStyle = '#e8c46a';
        ctx.beginPath();
        ctx.ellipse(0, 0, 15, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#c98f5c';
        ctx.beginPath();
        ctx.ellipse(-3, state.wing > 0.4 ? -6 : 3, 9, 5, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1b1f28';
        ctx.beginPath();
        ctx.arc(7, -3, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        hud(ctx, w, [`Очки ${state.score}`]);
        if (state.over) overText(ctx, w, h, 'Упали', `Очки ${state.score}`);
      }
    };
  });
}

function pairs(canvas, report) {
  return runner(canvas, () => {
    const cols = 4;
    const rows = 5;
    let state = null;

    const reset = () => {
      const kinds = [];
      for (let i = 0; i < (cols * rows) / 2; i++) kinds.push(i, i);
      kinds.sort(() => Math.random() - 0.5);
      state = {
        cards: kinds.map((kind) => ({ kind, open: false, done: false })),
        first: -1,
        lock: 0,
        moves: 0,
        score: 0,
        over: false
      };
    };
    reset();

    const tints = ['#7fb0ff', '#8fd7a8', '#e8c46a', '#c98fa0', '#a58bff', '#5be6c7', '#f0a06a', '#93a2ae', '#d98fae', '#7fd7e8'];

    return {
      score: () => state.score,
      bind(bind, node) {
        bind('pointerdown', (event) => {
          event.preventDefault();
          if (state.over) return reset();
          if (state.lock > 0) return;
          const spot = pointerPos(node, event);
          const layout = state.layout;
          if (!layout) return;
          const x = Math.floor((spot.x - layout.ox) / layout.cw);
          const y = Math.floor((spot.y - layout.oy) / layout.chh);
          if (x < 0 || y < 0 || x >= cols || y >= rows) return;
          const index = y * cols + x;
          const card = state.cards[index];
          if (card.done || card.open) return;
          card.open = true;
          if (state.first < 0) {
            state.first = index;
            return;
          }
          state.moves += 1;
          if (state.cards[state.first].kind === card.kind) {
            state.cards[state.first].done = true;
            card.done = true;
            state.first = -1;
            state.score += 100;
            if (state.cards.every((row) => row.done)) {
              state.over = true;
              state.score += Math.max(0, 600 - state.moves * 20);
              report(state.score);
            }
          } else {
            state.lock = 0.75;
          }
        });
        bind('keydown', (event) => {
          if (state.over && event.key === ' ') reset();
        }, window);
      },
      update(dt) {
        if (state.lock > 0) {
          state.lock -= dt;
          if (state.lock <= 0) {
            state.cards.forEach((card) => { if (!card.done) card.open = false; });
            state.first = -1;
          }
        }
      },
      draw(ctx, size) {
        const { w, h } = size;
        backdrop(ctx, w, h, ['#141726', '#232840']);
        const cw = Math.min((w - 28) / cols, (h - 130) / rows);
        const ox = (w - cw * cols) / 2;
        const oy = 78;
        state.layout = { ox, oy, cw, chh: cw };

        state.cards.forEach((card, index) => {
          const x = ox + (index % cols) * cw;
          const y = oy + Math.floor(index / cols) * cw;
          const shown = card.open || card.done;
          ctx.globalAlpha = card.done ? 0.42 : 1;
          ctx.fillStyle = shown ? tints[card.kind % tints.length] : 'rgba(255,255,255,.1)';
          ctx.beginPath();
          ctx.roundRect(x + 4, y + 4, cw - 8, cw - 8, 10);
          ctx.fill();
          if (!shown) {
            ctx.fillStyle = 'rgba(255,255,255,.14)';
            ctx.beginPath();
            ctx.arc(x + cw / 2, y + cw / 2, cw * 0.13, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        });

        hud(ctx, w, [`Очки ${state.score}`, `Ходы ${state.moves}`]);
        if (state.over) overText(ctx, w, h, 'Все пары собраны', `Очки ${state.score}`);
      }
    };
  });
}

function tower(canvas, report) {
  return runner(canvas, () => {
    let state = null;

    const reset = () => {
      state = {
        stack: [{ x: 0.5, w: 0.5 }],
        current: { x: 0.05, w: 0.5, dir: 1 },
        speed: 0.42,
        score: 0,
        height: 0,
        over: false,
        chips: []
      };
    };
    reset();

    const place = () => {
      if (state.over) return;
      const top = state.stack[state.stack.length - 1];
      const shift = state.current.x - top.x;
      const overlap = state.current.w - Math.abs(shift);
      if (overlap <= 0.02) {
        state.over = true;
        report(state.score);
        return;
      }
      const nx = top.x + shift / 2;
      state.stack.push({ x: nx, w: overlap });
      state.chips.push({ x: shift > 0 ? nx + overlap / 2 : nx - overlap / 2, y: 0, life: 1 });
      state.height += 1;
      state.score += Math.round(overlap * 200) + 20;
      state.speed = Math.min(1.1, 0.42 + state.height * 0.022);
      state.current = { x: 0.02, w: overlap, dir: 1 };
    };

    return {
      score: () => state.score,
      bind(bind) {
        bind('pointerdown', (event) => {
          event.preventDefault();
          if (state.over) return reset();
          place();
        });
        bind('keydown', (event) => {
          if (event.key !== ' ') return;
          if (state.over) return reset();
          place();
        }, window);
      },
      update(dt) {
        if (state.over) return;
        state.current.x += state.current.dir * state.speed * dt;
        const half = state.current.w / 2;
        if (state.current.x + half > 1) {
          state.current.x = 1 - half;
          state.current.dir = -1;
        }
        if (state.current.x - half < 0) {
          state.current.x = half;
          state.current.dir = 1;
        }
        state.chips.forEach((chip) => { chip.y += dt * 1.4; chip.life -= dt; });
        state.chips = state.chips.filter((chip) => chip.life > 0);
      },
      draw(ctx, size) {
        const { w, h } = size;
        backdrop(ctx, w, h, ['#101a26', '#1d3040']);
        const bh = 24;
        const base = h - 40;
        const shown = state.stack.slice(-Math.floor((h - 120) / bh));
        shown.forEach((block, i) => {
          const y = base - (i + 1) * bh;
          ctx.fillStyle = `hsl(${(state.stack.length - shown.length + i) * 12 % 360} 45% 58%)`;
          ctx.beginPath();
          ctx.roundRect((block.x - block.w / 2) * w, y, block.w * w, bh - 3, 4);
          ctx.fill();
        });

        const y = base - (shown.length + 1) * bh;
        ctx.fillStyle = '#8fd7c2';
        ctx.beginPath();
        ctx.roundRect((state.current.x - state.current.w / 2) * w, y, state.current.w * w, bh - 3, 4);
        ctx.fill();

        state.chips.forEach((chip) => {
          ctx.globalAlpha = Math.max(0, chip.life);
          ctx.fillStyle = '#c98b8b';
          ctx.fillRect(chip.x * w - 8, y + chip.y * 120, 16, 10);
          ctx.globalAlpha = 1;
        });

        hud(ctx, w, [`Очки ${state.score}`, `Высота ${state.height}`]);
        ctx.fillStyle = 'rgba(238,242,251,.5)';
        ctx.font = '500 12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('тап — поставить блок', w / 2, h - 12);
        ctx.textAlign = 'start';
        if (state.over) overText(ctx, w, h, 'Башня рухнула', `Высота ${state.height}, очки ${state.score}`);
      }
    };
  });
}

function hoops(canvas, report) {
  return runner(canvas, () => {
    let state = null;
    let aim = null;

    const reset = () => {
      state = {
        ball: { x: 0.5, y: 0.82, vx: 0, vy: 0, live: false },
        ring: { x: 0.5, dir: 1, speed: 0.16 },
        score: 0,
        shots: 0,
        streak: 0,
        left: 12,
        over: false,
        flash: 0
      };
    };
    reset();

    return {
      score: () => state.score,
      bind(bind, node) {
        bind('pointerdown', (event) => {
          event.preventDefault();
          if (state.over) return reset();
          if (state.ball.live) return;
          aim = pointerPos(node, event);
        });
        bind('pointerup', (event) => {
          if (!aim || state.ball.live || state.over) return;
          const spot = pointerPos(node, event);
          const dx = (spot.x - aim.x) / 200;
          const dy = (spot.y - aim.y) / 200;
          aim = null;
          if (Math.abs(dy) < 0.05) return;
          state.ball.vx = dx * 1.4;
          state.ball.vy = Math.min(-0.5, dy * 1.6);
          state.ball.live = true;
          state.shots += 1;
          state.left -= 1;
        });
        bind('keydown', (event) => {
          if (state.over && event.key === ' ') reset();
        }, window);
      },
      update(dt) {
        if (state.over) return;
        state.flash = Math.max(0, state.flash - dt * 2);
        state.ring.x += state.ring.dir * state.ring.speed * dt;
        if (state.ring.x > 0.82) state.ring.dir = -1;
        if (state.ring.x < 0.18) state.ring.dir = 1;

        const ball = state.ball;
        if (ball.live) {
          ball.vy += dt * 1.5;
          ball.x += ball.vx * dt;
          ball.y += ball.vy * dt;
          if (ball.x < 0.03 || ball.x > 0.97) ball.vx *= -1;

          const ringY = 0.32;
          if (ball.vy > 0 && ball.y > ringY - 0.012 && ball.y < ringY + 0.012 && Math.abs(ball.x - state.ring.x) < 0.055) {
            state.streak += 1;
            state.score += 100 + state.streak * 25;
            state.flash = 1;
            state.left += 1;
            ball.live = false;
            ball.x = 0.5;
            ball.y = 0.82;
            ball.vx = 0;
            ball.vy = 0;
          } else if (ball.y > 1.05) {
            state.streak = 0;
            ball.live = false;
            ball.x = 0.5;
            ball.y = 0.82;
            ball.vx = 0;
            ball.vy = 0;
            if (state.left <= 0) {
              state.over = true;
              report(state.score);
            }
          }
        }
      },
      draw(ctx, size) {
        const { w, h } = size;
        backdrop(ctx, w, h, ['#1a1020', '#33203a']);
        ctx.fillStyle = 'rgba(255,255,255,.05)';
        ctx.fillRect(0, h * 0.9, w, h * 0.1);

        const rx = state.ring.x * w;
        const ry = 0.32 * h;
        ctx.strokeStyle = '#c9605c';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(rx, ry, w * 0.055, 7, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.14)';
        ctx.fillRect(rx - w * 0.06, ry - 46, 6, 46);
        ctx.fillRect(rx - w * 0.09, ry - 62, w * 0.18, 16);

        if (state.flash > 0) {
          ctx.globalAlpha = state.flash * 0.5;
          ctx.fillStyle = '#e8c46a';
          ctx.beginPath();
          ctx.arc(rx, ry, w * 0.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        ctx.fillStyle = '#e08a4a';
        ctx.beginPath();
        ctx.arc(state.ball.x * w, state.ball.y * h, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.35)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(state.ball.x * w - 13, state.ball.y * h);
        ctx.lineTo(state.ball.x * w + 13, state.ball.y * h);
        ctx.stroke();

        hud(ctx, w, [`Очки ${state.score}`, `Броски ${state.left}`, `Серия ${state.streak}`]);
        ctx.fillStyle = 'rgba(238,242,251,.5)';
        ctx.font = '500 12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('потяните вверх и отпустите', w / 2, h - 12);
        ctx.textAlign = 'start';
        if (state.over) overText(ctx, w, h, 'Броски кончились', `Очки ${state.score}`);
      }
    };
  });
}

function rhythm(canvas, report) {
  return runner(canvas, () => {
    let state = null;
    const lanes = 3;

    const reset = () => {
      state = { notes: [], spawn: 0, speed: 0.55, score: 0, combo: 0, best: 0, miss: 0, over: false, hits: [] };
    };
    reset();

    const strike = (lane) => {
      if (state.over) return;
      const zone = 0.84;
      let closest = null;
      for (const note of state.notes) {
        if (note.lane !== lane || note.done) continue;
        if (Math.abs(note.y - zone) < 0.075 && (!closest || Math.abs(note.y - zone) < Math.abs(closest.y - zone))) closest = note;
      }
      if (!closest) {
        state.combo = 0;
        return;
      }
      closest.done = true;
      const exact = Math.abs(closest.y - zone) < 0.028;
      state.combo += 1;
      state.best = Math.max(state.best, state.combo);
      state.score += (exact ? 100 : 50) + state.combo * 4;
      state.hits.push({ lane, life: 1, exact });
    };

    return {
      score: () => state.score,
      bind(bind, node) {
        bind('pointerdown', (event) => {
          event.preventDefault();
          if (state.over) return reset();
          const spot = pointerPos(node, event);
          strike(Math.min(lanes - 1, Math.floor((spot.x / node.getBoundingClientRect().width) * lanes)));
        });
        bind('keydown', (event) => {
          if (state.over && event.key === ' ') return reset();
          const map = { a: 0, s: 1, d: 2, ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2 };
          if (map[event.key] !== undefined) strike(map[event.key]);
        }, window);
      },
      update(dt) {
        if (state.over) return;
        state.speed = Math.min(1.4, state.speed + dt * 0.02);
        state.spawn -= dt;
        if (state.spawn <= 0) {
          state.spawn = Math.max(0.28, 0.8 - state.score / 12000);
          state.notes.push({ lane: Math.floor(Math.random() * lanes), y: -0.05, done: false });
        }
        state.notes.forEach((note) => { note.y += state.speed * dt; });
        for (const note of state.notes) {
          if (!note.done && note.y > 0.96) {
            note.done = true;
            note.missed = true;
            state.combo = 0;
            state.miss += 1;
            if (state.miss >= 12) {
              state.over = true;
              report(state.score);
            }
          }
        }
        state.notes = state.notes.filter((note) => note.y < 1.1);
        state.hits.forEach((hit) => { hit.life -= dt * 2.4; });
        state.hits = state.hits.filter((hit) => hit.life > 0);
      },
      draw(ctx, size) {
        const { w, h } = size;
        backdrop(ctx, w, h, ['#120e22', '#241a3c']);
        const lw = w / lanes;
        const zoneY = 0.84 * h;

        for (let i = 0; i < lanes; i++) {
          ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.055)';
          ctx.fillRect(i * lw, 0, lw, h);
        }
        ctx.fillStyle = 'rgba(143,215,194,.2)';
        ctx.fillRect(0, zoneY - 8, w, 16);
        ctx.strokeStyle = 'rgba(143,215,194,.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, zoneY);
        ctx.lineTo(w, zoneY);
        ctx.stroke();

        state.notes.forEach((note) => {
          if (note.done && !note.missed) return;
          ctx.fillStyle = note.missed ? 'rgba(201,139,139,.45)' : `hsl(${170 + note.lane * 40} 60% 62%)`;
          ctx.beginPath();
          ctx.roundRect(note.lane * lw + lw * 0.16, note.y * h - 12, lw * 0.68, 24, 8);
          ctx.fill();
        });

        state.hits.forEach((hit) => {
          ctx.globalAlpha = hit.life * 0.6;
          ctx.fillStyle = hit.exact ? '#e8c46a' : '#8fd7c2';
          ctx.beginPath();
          ctx.arc(hit.lane * lw + lw / 2, zoneY, 34 * (1.4 - hit.life), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        });

        hud(ctx, w, [`Очки ${state.score}`, `Серия ${state.combo}`, `Промахи ${state.miss} из 12`]);
        if (state.over) overText(ctx, w, h, 'Сбились с ритма', `Очки ${state.score}, лучшая серия ${state.best}`);
      }
    };
  });
}

function bubbles(canvas, report) {
  return runner(canvas, () => {
    const cols = 8;
    const rows = 11;
    const tints = ['#7fb0ff', '#8fd7a8', '#e8c46a', '#c98fa0', '#a58bff'];
    let state = null;

    const reset = () => {
      state = {
        grid: Array.from({ length: rows }, () => Array.from({ length: cols }, () => Math.floor(Math.random() * tints.length))),
        score: 0,
        moves: 0,
        over: false,
        pop: []
      };
    };
    reset();

    const group = (x, y) => {
      const tint = state.grid[y][x];
      if (tint === null) return [];
      const seen = new Set();
      const stack = [[x, y]];
      const out = [];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        const key = `${cx}:${cy}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
        if (state.grid[cy][cx] !== tint) continue;
        out.push([cx, cy]);
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      return out;
    };

    const collapse = () => {
      for (let x = 0; x < cols; x++) {
        const column = [];
        for (let y = rows - 1; y >= 0; y--) if (state.grid[y][x] !== null) column.push(state.grid[y][x]);
        for (let y = rows - 1; y >= 0; y--) state.grid[y][x] = column[rows - 1 - y] ?? null;
      }
      let write = 0;
      for (let x = 0; x < cols; x++) {
        if (state.grid.some((row) => row[x] !== null)) {
          if (write !== x) for (let y = 0; y < rows; y++) {
            state.grid[y][write] = state.grid[y][x];
            state.grid[y][x] = null;
          }
          write += 1;
        }
      }
    };

    const anyLeft = () => {
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        if (state.grid[y][x] !== null && group(x, y).length >= 2) return true;
      }
      return false;
    };

    return {
      score: () => state.score,
      bind(bind, node) {
        bind('pointerdown', (event) => {
          event.preventDefault();
          if (state.over) return reset();
          const spot = pointerPos(node, event);
          const box = state.layout;
          if (!box) return;
          const x = Math.floor((spot.x - box.ox) / box.cell);
          const y = Math.floor((spot.y - box.oy) / box.cell);
          if (x < 0 || y < 0 || x >= cols || y >= rows) return;
          const found = group(x, y);
          if (found.length < 2) return;
          found.forEach(([bx, by]) => {
            state.pop.push({ x: bx, y: by, tint: state.grid[by][bx], life: 1 });
            state.grid[by][bx] = null;
          });
          state.score += found.length * found.length * 5;
          state.moves += 1;
          collapse();
          if (!anyLeft()) {
            state.over = true;
            const left = state.grid.flat().filter((v) => v !== null).length;
            if (left < 10) state.score += 500;
            report(state.score);
          }
        });
        bind('keydown', (event) => {
          if (state.over && event.key === ' ') reset();
        }, window);
      },
      update(dt) {
        state.pop.forEach((row) => { row.life -= dt * 2.6; });
        state.pop = state.pop.filter((row) => row.life > 0);
      },
      draw(ctx, size) {
        const { w, h } = size;
        backdrop(ctx, w, h, ['#0f1a20', '#1a2c34']);
        const cell = Math.min((w - 24) / cols, (h - 130) / rows);
        const ox = (w - cell * cols) / 2;
        const oy = 76;
        state.layout = { ox, oy, cell };

        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const tint = state.grid[y][x];
            if (tint === null) continue;
            ctx.fillStyle = tints[tint];
            ctx.beginPath();
            ctx.arc(ox + x * cell + cell / 2, oy + y * cell + cell / 2, cell * 0.42, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.25)';
            ctx.beginPath();
            ctx.arc(ox + x * cell + cell * 0.38, oy + y * cell + cell * 0.36, cell * 0.11, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        state.pop.forEach((row) => {
          ctx.globalAlpha = row.life * 0.7;
          ctx.fillStyle = tints[row.tint] || '#fff';
          ctx.beginPath();
          ctx.arc(ox + row.x * cell + cell / 2, oy + row.y * cell + cell / 2, cell * 0.42 * (2 - row.life), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        });

        hud(ctx, w, [`Очки ${state.score}`, `Ходы ${state.moves}`]);
        ctx.fillStyle = 'rgba(238,242,251,.5)';
        ctx.font = '500 12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('лопайте группы от двух шариков', w / 2, h - 12);
        ctx.textAlign = 'start';
        if (state.over) overText(ctx, w, h, 'Ходов не осталось', `Очки ${state.score}`);
      }
    };
  });
}

function jumper(canvas, report) {
  return runner(canvas, () => {
    let state = null;
    let tilt = 0;

    const reset = () => {
      const plates = [{ x: 0.5, y: 0.9, kind: 'solid' }];
      for (let i = 1; i < 14; i++) {
        plates.push({ x: 0.12 + Math.random() * 0.76, y: 0.9 - i * 0.075, kind: Math.random() < 0.14 ? 'weak' : 'solid' });
      }
      state = { x: 0.5, y: 0.86, vy: -0.62, plates, height: 0, score: 0, over: false, springs: [] };
    };
    reset();

    return {
      score: () => state.score,
      bind(bind, node) {
        const aim = (event) => {
          if (state.over) return;
          const rect = node.getBoundingClientRect();
          const point = event.touches?.[0] || event;
          tilt = ((point.clientX - rect.left) / rect.width - 0.5) * 2;
        };
        bind('pointerdown', (event) => {
          event.preventDefault();
          if (state.over) return reset();
          aim(event);
        });
        bind('pointermove', aim);
        bind('pointerup', () => { tilt = 0; });
        bind('keydown', (event) => {
          if (state.over && event.key === ' ') return reset();
          if (event.key === 'ArrowLeft') tilt = -1;
          if (event.key === 'ArrowRight') tilt = 1;
        }, window);
        bind('keyup', () => { tilt = 0; }, window);
      },
      update(dt) {
        if (state.over) return;
        const wasY = state.y;
        state.vy += dt * 1.5;
        state.y += state.vy * dt;
        state.x += tilt * dt * 0.8;
        if (state.x < 0) state.x = 1;
        if (state.x > 1) state.x = 0;

        if (state.y < 0.42) {
          const lift = 0.42 - state.y;
          state.y = 0.42;
          state.height += lift;
          state.score = Math.floor(state.height * 900);
          state.plates.forEach((plate) => { plate.y += lift; });
          state.springs.forEach((spring) => { spring.y += lift; });
          state.plates = state.plates.filter((plate) => plate.y < 1.1);
          while (state.plates.length < 14) {
            const top = Math.min(...state.plates.map((plate) => plate.y));
            state.plates.push({ x: 0.12 + Math.random() * 0.76, y: top - 0.055 - Math.random() * 0.035, kind: Math.random() < 0.16 ? 'weak' : 'solid' });
          }
        }

        if (state.vy > 0) {
          const wasFoot = wasY + 0.02;
          const foot = state.y + 0.02;
          for (const plate of state.plates) {
            if (plate.gone) continue;
            const crossed = wasFoot <= plate.y + 0.012 && foot >= plate.y - 0.012;
            if (Math.abs(state.x - plate.x) < 0.115 && crossed) {
              state.y = plate.y - 0.02;
              state.vy = -0.72;
              state.springs.push({ x: plate.x, y: plate.y, life: 1 });
              if (plate.kind === 'weak') plate.gone = true;
              break;
            }
          }
        }
        state.plates = state.plates.filter((plate) => !plate.gone);
        state.springs.forEach((spring) => { spring.life -= dt * 3; });
        state.springs = state.springs.filter((spring) => spring.life > 0);

        if (state.y > 1.08) {
          state.over = true;
          report(state.score);
        }
      },
      draw(ctx, size) {
        const { w, h } = size;
        backdrop(ctx, w, h, ['#0e1a24', '#1b3040']);
        ctx.fillStyle = 'rgba(255,255,255,.05)';
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          ctx.arc(((i * 91) % w), ((i * 137 + state.height * 220) % h), 20 + (i % 3) * 8, 0, Math.PI * 2);
          ctx.fill();
        }

        state.plates.forEach((plate) => {
          ctx.fillStyle = plate.kind === 'weak' ? '#c98b8b' : '#8fd7a8';
          ctx.beginPath();
          ctx.roundRect(plate.x * w - w * 0.09, plate.y * h, w * 0.18, 10, 5);
          ctx.fill();
        });
        state.springs.forEach((spring) => {
          ctx.globalAlpha = spring.life * 0.5;
          ctx.strokeStyle = '#8fd7c2';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(spring.x * w, spring.y * h, 26 * (1.4 - spring.life), 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        });

        ctx.fillStyle = '#e8c46a';
        ctx.beginPath();
        ctx.arc(state.x * w, state.y * h, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1b1f28';
        ctx.beginPath();
        ctx.arc(state.x * w - 4, state.y * h - 3, 2.2, 0, Math.PI * 2);
        ctx.arc(state.x * w + 4, state.y * h - 3, 2.2, 0, Math.PI * 2);
        ctx.fill();

        hud(ctx, w, [`Очки ${state.score}`]);
        ctx.fillStyle = 'rgba(238,242,251,.5)';
        ctx.font = '500 12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('держите палец слева или справа', w / 2, h - 12);
        ctx.textAlign = 'start';
        if (state.over) overText(ctx, w, h, 'Упали вниз', `Очки ${state.score}`);
      }
    };
  });
}

function sky(canvas, report) {
  return runner(canvas, ({ w, h }) => {
    let width = w;
    let height = h;
    const FOV = 1.05;
    let S;
    let pillars = [];
    let rings = [];
    let sparks = [];
    let aim = { x: 0, y: 0 };
    let ahead = 0;

    const reset = () => {
      S = { x: 0, y: 0, z: 0, roll: 0, speed: 24, score: 0, rings: 0, over: false, shake: 0 };
      pillars = [];
      rings = [];
      sparks = [];
      aim = { x: 0, y: 0 };
      ahead = 30;
      grow();
    };

    const grow = () => {
      while (ahead < S.z + 260) {
        const lane = (Math.random() - 0.5) * 30;
        const count = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
          const x = lane + (Math.random() - 0.5) * 26;
          const tall = Math.random() < 0.5;
          pillars.push({
            x,
            z: ahead + Math.random() * 5,
            hw: 1.4 + Math.random() * 1.6,
            y0: tall ? -12 : 2 + Math.random() * 4,
            y1: tall ? -2 + Math.random() * 5 : 12,
            hue: 190 + Math.random() * 80
          });
        }
        if (Math.random() < 0.55) {
          rings.push({ x: (Math.random() - 0.5) * 22, y: (Math.random() - 0.5) * 10, z: ahead + 4, r: 2.4, taken: false });
        }
        ahead += 11 + Math.random() * 6;
      }
      pillars = pillars.filter((p) => p.z > S.z - 12);
      rings = rings.filter((r) => r.z > S.z - 6);
    };

    const project = (px, py, pz) => {
      const rz = pz - S.z;
      if (rz < 0.7) return null;
      const rx = px - S.x;
      const ry = py - S.y;
      const c = Math.cos(S.roll);
      const s = Math.sin(S.roll);
      const ax = rx * c - ry * s;
      const ay = rx * s + ry * c;
      const scale = (height * FOV) / rz;
      return { x: width / 2 + ax * scale, y: height / 2 - ay * scale, d: rz };
    };

    const fog = (d) => Math.max(0, Math.min(1, 1 - d / 170));

    const face = (ctx, points, hue, light, d) => {
      if (points.some((p) => !p)) return;
      const near = fog(d);
      if (near <= 0.02) return;
      const sat = 12 + 34 * near;
      const lum = 11 + (light - 11) * near;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();
      ctx.fillStyle = `hsl(${hue}, ${sat}%, ${lum}%)`;
      ctx.fill();
      ctx.strokeStyle = `hsla(${hue}, ${sat + 18}%, ${Math.min(78, lum + 16)}%, ${0.5 + near * 0.4})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    reset();

    return {
      score: () => Math.floor(S.score),
      resize(size) {
        width = size.w;
        height = size.h;
      },
      bind(bind, node) {
        const steer = (event) => {
          event.preventDefault();
          const point = pointerPos(node, event);
          aim.x = (point.x / width - 0.5) * 32;
          aim.y = (0.5 - point.y / height) * 17;
        };
        bind('pointermove', steer);
        bind('touchmove', steer);
        bind('pointerdown', (event) => {
          event.preventDefault();
          capture(node, event);
          if (S.over) {
            reset();
            return;
          }
          steer(event);
        });
        bind('touchstart', (event) => {
          event.preventDefault();
          if (S.over) {
            reset();
            return;
          }
          steer(event);
        });
      },
      update(dt) {
        if (S.over) return;
        S.speed = Math.min(52, S.speed + dt * 0.9);
        S.z += S.speed * dt;
        S.score += S.speed * dt * 0.6;
        const nx = S.x + (aim.x - S.x) * Math.min(1, dt * 5.5);
        S.roll = Math.max(-0.5, Math.min(0.5, (nx - S.x) * 3.4));
        S.x = nx;
        S.y += (aim.y - S.y) * Math.min(1, dt * 5);
        if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 2);
        grow();

        for (const ring of rings) {
          if (ring.taken || Math.abs(ring.z - S.z) > 1.6) continue;
          if (Math.hypot(ring.x - S.x, ring.y - S.y) < ring.r) {
            ring.taken = true;
            S.rings += 1;
            S.score += 80;
            S.shake = 0.4;
            for (let i = 0; i < 14; i++) {
              sparks.push({ x: ring.x, y: ring.y, z: ring.z, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, life: 0.7 });
            }
          }
        }

        for (const p of pillars) {
          if (Math.abs(p.z - S.z) > p.hw + 0.6) continue;
          if (Math.abs(p.x - S.x) > p.hw + 0.8) continue;
          if (S.y < p.y0 - 0.7 || S.y > p.y1 + 0.7) continue;
          S.over = true;
          report?.(Math.floor(S.score));
        }
        if (Math.abs(S.y) > 13) {
          S.over = true;
          report?.(Math.floor(S.score));
        }

        sparks = sparks.filter((s) => {
          s.life -= dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          return s.life > 0;
        });
      },
      draw(ctx) {
        backdrop(ctx, width, height, ['#050a18', '#0d1c33']);
        ctx.save();
        if (S.shake > 0) ctx.translate((Math.random() - 0.5) * S.shake * 8, (Math.random() - 0.5) * S.shake * 8);

        const horizon = height / 2 + S.y * (height * FOV) / 60;
        const glow = ctx.createRadialGradient(width / 2, horizon, 4, width / 2, horizon, height * 0.8);
        glow.addColorStop(0, 'rgba(120,180,255,.30)');
        glow.addColorStop(1, 'rgba(120,180,255,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);

        const step = 10;
        const first = Math.ceil(S.z / step) * step;
        for (let i = 0; i < 18; i++) {
          const z = first + i * step;
          const a = project(-45, -13, z);
          const b = project(45, -13, z);
          if (!a || !b) continue;
          ctx.strokeStyle = `rgba(120,190,255,${fog(z - S.z) * 0.22})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }

        const solids = [];
        pillars.forEach((p) => solids.push({ z: p.z, kind: 'pillar', item: p }));
        rings.forEach((r) => {
          if (!r.taken) solids.push({ z: r.z, kind: 'ring', item: r });
        });
        solids.sort((a, b) => b.z - a.z);

        for (const solid of solids) {
          const d = solid.z - S.z;
          if (d < 0.8 || d > 175) continue;
          if (solid.kind === 'ring') {
            if (d < 2.4) continue;
            const r = solid.item;
            const points = [];
            for (let i = 0; i < 20; i++) {
              const angle = (i / 20) * Math.PI * 2;
              points.push(project(r.x + Math.cos(angle) * r.r, r.y + Math.sin(angle) * r.r, r.z));
            }
            if (points.some((p) => !p)) continue;
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
            ctx.closePath();
            ctx.strokeStyle = `rgba(126,231,196,${fog(d)})`;
            ctx.lineWidth = Math.max(1.5, Math.min(14, 90 / d));
            ctx.stroke();
            continue;
          }
          const p = solid.item;
          const near = p.z - p.hw;
          const far = p.z + p.hw;
          const left = p.x - p.hw;
          const right = p.x + p.hw;
          const side = S.x < p.x
            ? [project(left, p.y0, near), project(left, p.y1, near), project(left, p.y1, far), project(left, p.y0, far)]
            : [project(right, p.y0, near), project(right, p.y1, near), project(right, p.y1, far), project(right, p.y0, far)];
          face(ctx, side, p.hue, 22, d);
          const front = [project(left, p.y0, near), project(left, p.y1, near), project(right, p.y1, near), project(right, p.y0, near)];
          face(ctx, front, p.hue, 34, d);
          if (p.y1 < S.y) {
            face(ctx, [project(left, p.y1, near), project(left, p.y1, far), project(right, p.y1, far), project(right, p.y1, near)], p.hue, 46, d);
          } else if (p.y0 > S.y) {
            face(ctx, [project(left, p.y0, near), project(left, p.y0, far), project(right, p.y0, far), project(right, p.y0, near)], p.hue, 16, d);
          }
        }

        sparks.forEach((s) => {
          const point = project(s.x, s.y, s.z);
          if (!point) return;
          ctx.fillStyle = `rgba(126,231,196,${Math.max(0, s.life)})`;
          ctx.beginPath();
          ctx.arc(point.x, point.y, Math.max(1, 40 / (s.z - S.z + 1)), 0, Math.PI * 2);
          ctx.fill();
        });

        ctx.save();
        ctx.translate(width / 2, height - 58);
        ctx.rotate(-S.roll);
        ctx.fillStyle = 'rgba(238,242,251,.92)';
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(16, 10);
        ctx.lineTo(0, 3);
        ctx.lineTo(-16, 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.restore();

        hud(ctx, width, [`Очки ${Math.floor(S.score)}`, `Кольца ${S.rings}`, `Скорость ${Math.round(S.speed * 10)}`]);
        if (S.over) overText(ctx, width, height, 'Разбились', 'Коснитесь, чтобы взлететь снова');
      }
    };
  });
}

function roll(canvas, report) {
  return runner(canvas, ({ w, h }) => {
    let width = w;
    let height = h;
    let S;
    let tilt = { x: 0, y: 0 };

    const build = (level) => {
      const walls = [];
      const holes = [];
      const pad = 14;
      walls.push({ x: 0, y: 0, w: width, h: pad });
      walls.push({ x: 0, y: height - pad, w: width, h: pad });
      walls.push({ x: 0, y: 0, w: pad, h: height });
      walls.push({ x: width - pad, y: 0, w: pad, h: height });
      const rows = Math.min(5, 2 + level);
      for (let i = 0; i < rows; i++) {
        const y = pad + ((i + 1) * (height - pad * 2)) / (rows + 1);
        const gap = 70 + Math.random() * 40;
        const at = pad + Math.random() * (width - pad * 2 - gap);
        walls.push({ x: pad, y: y - 7, w: at - pad, h: 14 });
        walls.push({ x: at + gap, y: y - 7, w: width - pad - at - gap, h: 14 });
      }
      const count = Math.min(7, 1 + level);
      for (let i = 0; i < count; i++) {
        holes.push({
          x: pad + 30 + Math.random() * (width - pad * 2 - 60),
          y: height * 0.25 + Math.random() * (height * 0.55),
          r: 15
        });
      }
      return { walls, holes };
    };

    const start = (level, score, lives) => {
      const built = build(level);
      S = {
        level,
        score,
        lives,
        x: width / 2,
        y: height - 40,
        vx: 0,
        vy: 0,
        r: 10,
        walls: built.walls,
        holes: built.holes,
        goal: { x: width / 2, y: 34, r: 17 },
        over: false,
        flash: 0
      };
    };

    start(1, 0, 3);

    const hit = (rect) => S.x + S.r > rect.x && S.x - S.r < rect.x + rect.w && S.y + S.r > rect.y && S.y - S.r < rect.y + rect.h;

    return {
      score: () => S.score,
      resize(size) {
        width = size.w;
        height = size.h;
        start(S.level, S.score, S.lives);
      },
      bind(bind, node) {
        const move = (event) => {
          event.preventDefault();
          const point = pointerPos(node, event);
          tilt.x = Math.max(-1, Math.min(1, (point.x - width / 2) / (width / 2)));
          tilt.y = Math.max(-1, Math.min(1, (point.y - height / 2) / (height / 2)));
        };
        bind('pointermove', move);
        bind('touchmove', move);
        bind('pointerdown', (event) => {
          event.preventDefault();
          capture(node, event);
          if (S.over) {
            start(1, 0, 3);
            return;
          }
          move(event);
        });
        bind('touchstart', (event) => {
          event.preventDefault();
          if (S.over) {
            start(1, 0, 3);
            return;
          }
          move(event);
        });
        bind('pointerup', () => {
          tilt.x = 0;
          tilt.y = 0;
        });
      },
      update(dt) {
        if (S.over) return;
        if (S.flash > 0) S.flash = Math.max(0, S.flash - dt * 2);
        S.vx += tilt.x * 900 * dt;
        S.vy += tilt.y * 900 * dt;
        S.vx *= 0.985;
        S.vy *= 0.985;

        const stepX = S.vx * dt;
        S.x += stepX;
        for (const wall of S.walls) {
          if (!hit(wall)) continue;
          S.x -= stepX;
          S.vx = -S.vx * 0.4;
          break;
        }
        const stepY = S.vy * dt;
        S.y += stepY;
        for (const wall of S.walls) {
          if (!hit(wall)) continue;
          S.y -= stepY;
          S.vy = -S.vy * 0.4;
          break;
        }

        for (const hole of S.holes) {
          if (Math.hypot(hole.x - S.x, hole.y - S.y) > hole.r * 0.75) continue;
          S.lives -= 1;
          S.flash = 1;
          if (S.lives <= 0) {
            S.over = true;
            report?.(S.score);
          } else {
            S.x = width / 2;
            S.y = height - 40;
            S.vx = 0;
            S.vy = 0;
          }
          break;
        }

        if (!S.over && Math.hypot(S.goal.x - S.x, S.goal.y - S.y) < S.goal.r) {
          const level = S.level + 1;
          const score = S.score + 120 + S.level * 40;
          start(level, score, S.lives);
        }
      },
      draw(ctx) {
        backdrop(ctx, width, height, ['#0d1420', '#16202f']);
        S.walls.forEach((wall) => {
          ctx.fillStyle = 'rgba(126,231,196,.16)';
          ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
          ctx.strokeStyle = 'rgba(126,231,196,.35)';
          ctx.lineWidth = 1;
          ctx.strokeRect(wall.x + 0.5, wall.y + 0.5, wall.w - 1, wall.h - 1);
        });
        S.holes.forEach((hole) => {
          const shade = ctx.createRadialGradient(hole.x, hole.y, 2, hole.x, hole.y, hole.r);
          shade.addColorStop(0, '#04060c');
          shade.addColorStop(1, 'rgba(4,6,12,.25)');
          ctx.fillStyle = shade;
          ctx.beginPath();
          ctx.arc(hole.x, hole.y, hole.r, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.strokeStyle = 'rgba(126,231,196,.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(S.goal.x, S.goal.y, S.goal.r, 0, Math.PI * 2);
        ctx.stroke();

        const ball = ctx.createRadialGradient(S.x - 3, S.y - 4, 1, S.x, S.y, S.r);
        ball.addColorStop(0, '#ffffff');
        ball.addColorStop(1, '#8fb6ff');
        ctx.fillStyle = ball;
        ctx.beginPath();
        ctx.arc(S.x, S.y, S.r, 0, Math.PI * 2);
        ctx.fill();

        if (S.flash > 0) {
          ctx.fillStyle = `rgba(220,110,120,${S.flash * 0.3})`;
          ctx.fillRect(0, 0, width, height);
        }
        hud(ctx, width, [`Уровень ${S.level}`, `Очки ${S.score}`, `Жизни ${S.lives}`]);
        if (S.over) overText(ctx, width, height, 'Шарик упал', 'Коснитесь, чтобы начать заново');
      }
    };
  });
}

function flasks(canvas, report) {
  return runner(canvas, ({ w, h }) => {
    let width = w;
    let height = h;
    const HUES = [162, 200, 268, 32, 340, 96, 12, 220];
    let S;

    const deal = (level) => {
      const colors = Math.min(7, 3 + Math.floor(level / 2));
      const cells = [];
      for (let c = 0; c < colors; c++) for (let i = 0; i < 4; i++) cells.push(c);
      for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cells[i], cells[j]] = [cells[j], cells[i]];
      }
      const tubes = [];
      for (let c = 0; c < colors; c++) tubes.push(cells.slice(c * 4, c * 4 + 4));
      tubes.push([], []);
      return tubes;
    };

    const start = (level, score) => {
      S = { level, score, tubes: deal(level), picked: -1, moves: 0, won: 0, over: false };
    };

    start(1, 0);

    const layout = () => {
      const count = S.tubes.length;
      const perRow = count > 5 ? Math.ceil(count / 2) : count;
      const rows = count > 5 ? 2 : 1;
      const tubeW = Math.min(62, (width - 24) / perRow - 12);
      const tubeH = Math.min(230, (height - 170) / rows - 24);
      const block = rows * tubeH + (rows - 1) * 30;
      const top = Math.max(110, (height - block) / 2);
      const boxes = [];
      for (let i = 0; i < count; i++) {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        const inRow = Math.min(perRow, count - row * perRow);
        const total = inRow * (tubeW + 12) - 12;
        const x = (width - total) / 2 + col * (tubeW + 12);
        const y = top + row * (tubeH + 30);
        boxes.push({ x, y, w: tubeW, h: tubeH });
      }
      return boxes;
    };

    const topRun = (tube) => {
      if (!tube.length) return 0;
      const color = tube[tube.length - 1];
      let n = 0;
      for (let i = tube.length - 1; i >= 0 && tube[i] === color; i--) n++;
      return n;
    };

    const solved = () => S.tubes.every((tube) => !tube.length || (tube.length === 4 && tube.every((c) => c === tube[0])));

    return {
      score: () => S.score,
      resize(size) {
        width = size.w;
        height = size.h;
      },
      bind(bind, node) {
        const tap = (event) => {
          event.preventDefault();
          if (S.over) {
            start(1, 0);
            return;
          }
          const point = pointerPos(node, event);
          const boxes = layout();
          const index = boxes.findIndex((box) => point.x > box.x - 6 && point.x < box.x + box.w + 6 && point.y > box.y - 10 && point.y < box.y + box.h + 10);
          if (index < 0) return;
          if (S.picked < 0) {
            if (S.tubes[index].length) S.picked = index;
            return;
          }
          if (S.picked === index) {
            S.picked = -1;
            return;
          }
          const from = S.tubes[S.picked];
          const to = S.tubes[index];
          const color = from[from.length - 1];
          if (to.length && to[to.length - 1] !== color) {
            S.picked = index;
            return;
          }
          let move = Math.min(topRun(from), 4 - to.length);
          if (move <= 0) {
            S.picked = index;
            return;
          }
          while (move-- > 0) to.push(from.pop());
          S.moves += 1;
          S.picked = -1;
          if (solved()) {
            S.score += 150 + S.level * 30;
            S.won += 1;
            report?.(S.score);
            start(S.level + 1, S.score);
          }
        };
        const once = tapOnce(tap);
        bind('pointerdown', once);
        bind('touchstart', once);
      },
      update() {},
      draw(ctx) {
        backdrop(ctx, width, height, ['#0d1020', '#1b1533']);
        const boxes = layout();
        boxes.forEach((box, i) => {
          const tube = S.tubes[i];
          const lifted = S.picked === i ? 8 : 0;
          ctx.save();
          ctx.translate(0, -lifted);
          ctx.strokeStyle = S.picked === i ? 'rgba(126,231,196,.9)' : 'rgba(238,242,251,.35)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(box.x, box.y, box.w, box.h, [6, 6, box.w / 2, box.w / 2]);
          ctx.stroke();
          const cell = (box.h - 10) / 4;
          tube.forEach((color, level) => {
            const y = box.y + box.h - 5 - (level + 1) * cell;
            ctx.fillStyle = `hsl(${HUES[color % HUES.length]}, 62%, 58%)`;
            ctx.beginPath();
            ctx.roundRect(box.x + 4, y, box.w - 8, cell - 2, level === 0 ? [3, 3, box.w / 2 - 4, box.w / 2 - 4] : 3);
            ctx.fill();
          });
          ctx.restore();
        });
        hud(ctx, width, [`Уровень ${S.level}`, `Очки ${S.score}`, `Ходы ${S.moves}`]);
        ctx.fillStyle = 'rgba(238,242,251,.55)';
        ctx.font = '500 13px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Сливайте цвета в одноцветные колбы', width / 2, height - 18);
        ctx.textAlign = 'start';
      }
    };
  });
}

function trace(canvas, report) {
  return runner(canvas, ({ w, h }) => {
    let width = w;
    let height = h;
    let S;

    const start = (level, score) => {
      const cols = Math.min(6, 3 + Math.floor(level / 2));
      const rows = Math.min(7, 3 + Math.floor((level + 1) / 2));
      S = { level, score, cols, rows, path: [], drawing: false, over: false, blocked: [] };
    };

    start(1, 0);

    const geom = () => {
      const pad = 26;
      const size = Math.min((width - pad * 2) / S.cols, (height - 150) / S.rows);
      const gx = (width - size * S.cols) / 2;
      const gy = 96;
      return { size, gx, gy };
    };

    const cellAt = (point) => {
      const { size, gx, gy } = geom();
      const col = Math.floor((point.x - gx) / size);
      const row = Math.floor((point.y - gy) / size);
      if (col < 0 || row < 0 || col >= S.cols || row >= S.rows) return -1;
      const index = row * S.cols + col;
      return S.blocked.includes(index) ? -1 : index;
    };

    const near = (a, b) => {
      const ax = a % S.cols;
      const ay = Math.floor(a / S.cols);
      const bx = b % S.cols;
      const by = Math.floor(b / S.cols);
      return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
    };

    return {
      score: () => S.score,
      resize(size) {
        width = size.w;
        height = size.h;
      },
      bind(bind, node) {
        const down = (event) => {
          event.preventDefault();
          capture(node, event);
          if (S.over) {
            start(1, 0);
            return;
          }
          const cell = cellAt(pointerPos(node, event));
          if (cell < 0) return;
          S.path = [cell];
          S.drawing = true;
        };
        const move = (event) => {
          if (!S.drawing) return;
          event.preventDefault();
          const cell = cellAt(pointerPos(node, event));
          if (cell < 0) return;
          const last = S.path[S.path.length - 1];
          if (cell === last) return;
          if (S.path.length > 1 && cell === S.path[S.path.length - 2]) {
            S.path.pop();
            return;
          }
          if (S.path.includes(cell) || !near(last, cell)) return;
          S.path.push(cell);
          const need = S.cols * S.rows - S.blocked.length;
          if (S.path.length === need) {
            S.score += 90 + S.level * 25;
            S.drawing = false;
            report?.(S.score);
            start(S.level + 1, S.score);
          }
        };
        const up = (event) => {
          event.preventDefault();
          S.drawing = false;
        };
        const once = tapOnce(down);
        bind('pointerdown', once);
        bind('touchstart', once);
        bind('pointermove', move);
        bind('touchmove', move);
        bind('pointerup', up);
        bind('touchend', up);
      },
      update() {},
      draw(ctx) {
        backdrop(ctx, width, height, ['#0a1620', '#123040']);
        const { size, gx, gy } = geom();
        const center = (index) => ({
          x: gx + (index % S.cols) * size + size / 2,
          y: gy + Math.floor(index / S.cols) * size + size / 2
        });
        for (let i = 0; i < S.cols * S.rows; i++) {
          const point = center(i);
          const off = S.blocked.includes(i);
          ctx.fillStyle = off ? 'rgba(238,242,251,.06)' : 'rgba(238,242,251,.13)';
          ctx.beginPath();
          ctx.arc(point.x, point.y, off ? size * 0.18 : size * 0.24, 0, Math.PI * 2);
          ctx.fill();
        }
        if (S.path.length) {
          ctx.strokeStyle = 'rgba(126,231,196,.9)';
          ctx.lineWidth = Math.max(6, size * 0.22);
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.beginPath();
          S.path.forEach((index, i) => {
            const point = center(index);
            if (i === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
          });
          ctx.stroke();
        }
        const need = S.cols * S.rows - S.blocked.length;
        hud(ctx, width, [`Уровень ${S.level}`, `Очки ${S.score}`, `Точек ${S.path.length} из ${need}`]);
        ctx.fillStyle = 'rgba(238,242,251,.55)';
        ctx.font = '500 13px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Одна линия через все точки, не отрывая палец', width / 2, height - 18);
        ctx.textAlign = 'start';
      }
    };
  });
}

function shelter(canvas, report) {
  return runner(canvas, ({ w, h }) => {
    let width = w;
    let height = h;
    let S;
    let aim = null;

    const spawnWorld = () => {
      const trees = [];
      const berries = [];
      for (let i = 0; i < 9; i++) {
        const angle = Math.random() * Math.PI * 2;
        const far = 90 + Math.random() * 190;
        trees.push({ x: width / 2 + Math.cos(angle) * far, y: height / 2 + Math.sin(angle) * far, wood: 3 });
      }
      for (let i = 0; i < 7; i++) {
        const angle = Math.random() * Math.PI * 2;
        const far = 70 + Math.random() * 200;
        berries.push({ x: width / 2 + Math.cos(angle) * far, y: height / 2 + Math.sin(angle) * far, ripe: true, at: 0 });
      }
      return { trees, berries };
    };

    const start = () => {
      const world = spawnWorld();
      S = {
        x: width / 2,
        y: height / 2 + 60,
        wood: 2,
        food: 2,
        health: 100,
        hunger: 100,
        fire: 70,
        clock: 0,
        night: false,
        nights: 0,
        score: 0,
        beasts: [],
        marks: [],
        over: false,
        trees: world.trees,
        berries: world.berries
      };
      aim = null;
    };

    start();

    const fireX = () => width / 2;
    const fireY = () => height / 2;

    const near = (a, b, gap) => Math.hypot(a.x - b.x, a.y - b.y) < gap;

    return {
      score: () => Math.floor(S.score),
      resize(size) {
        width = size.w;
        height = size.h;
      },
      bind(bind, node) {
        const go = (event) => {
          event.preventDefault();
          if (S.over) {
            start();
            return;
          }
          aim = pointerPos(node, event);
        };
        bind('pointerdown', (event) => {
          capture(node, event);
          go(event);
        });
        bind('pointermove', (event) => {
          if (!aim) return;
          aim = pointerPos(node, event);
          event.preventDefault();
        });
        bind('touchmove', go);
        bind('touchstart', go);
        bind('pointerup', () => {
          aim = null;
        });
      },
      update(dt) {
        if (S.over) return;
        S.clock += dt;
        S.score += dt * 4;
        const dayLength = 40;
        const phase = (S.clock % dayLength) / dayLength;
        const night = phase > 0.58;
        if (night && !S.night) {
          S.night = true;
        }
        if (!night && S.night) {
          S.night = false;
          S.nights += 1;
          S.score += 140;
          S.beasts = [];
        }

        if (aim) {
          const dx = aim.x - S.x;
          const dy = aim.y - S.y;
          const far = Math.hypot(dx, dy);
          if (far > 4) {
            const speed = 132 * dt;
            S.x += (dx / far) * speed;
            S.y += (dy / far) * speed;
          }
        }
        S.x = Math.max(14, Math.min(width - 14, S.x));
        S.y = Math.max(60, Math.min(height - 24, S.y));

        S.trees.forEach((tree) => {
          if (tree.wood <= 0 || !near(S, tree, 34)) return;
          tree.wood -= dt * 1.2;
          S.wood += dt * 1.2;
          if (tree.wood <= 0) tree.wood = 0;
        });
        S.berries.forEach((bush) => {
          if (!bush.ripe || !near(S, bush, 30)) return;
          bush.ripe = false;
          bush.at = S.clock;
          S.food += 1;
          S.marks.push({ x: bush.x, y: bush.y, life: 1, text: 'еда' });
        });
        S.berries.forEach((bush) => {
          if (!bush.ripe && S.clock - bush.at > 26) bush.ripe = true;
        });

        const atFire = Math.hypot(S.x - fireX(), S.y - fireY()) < 46;
        if (atFire && S.wood >= 1) {
          const put = Math.min(S.wood, dt * 2.4);
          S.wood -= put;
          S.fire = Math.min(100, S.fire + put * 26);
        }

        S.fire = Math.max(0, S.fire - dt * (night ? 4.2 : 2.4));
        S.hunger = Math.max(0, S.hunger - dt * 2.1);
        if (S.hunger < 40 && S.food >= 1) {
          S.food -= 1;
          S.hunger = Math.min(100, S.hunger + 42);
          S.marks.push({ x: S.x, y: S.y - 18, life: 1, text: 'сыт' });
        }

        const cold = night && (!atFire || S.fire < 12);
        if (cold) S.health -= dt * (S.fire < 8 ? 5.5 : 3);
        if (S.hunger <= 0) S.health -= dt * 5;
        if (!cold && S.hunger > 45) S.health = Math.min(100, S.health + dt * 2.2);

        if (night) {
          const want = 1 + Math.floor(S.nights * 0.8);
          if (S.beasts.length < want && Math.random() < dt * 0.7) {
            const edge = Math.random() * Math.PI * 2;
            S.beasts.push({
              x: width / 2 + Math.cos(edge) * (width * 0.8),
              y: height / 2 + Math.sin(edge) * (height * 0.7),
              hurt: 0
            });
          }
          S.beasts.forEach((beast) => {
            const dx = S.x - beast.x;
            const dy = S.y - beast.y;
            const far = Math.hypot(dx, dy) || 1;
            const scared = Math.hypot(beast.x - fireX(), beast.y - fireY()) < 60 + S.fire * 0.9;
            const speed = (scared ? -70 : 52 + S.nights * 5) * dt;
            beast.x += (dx / far) * speed;
            beast.y += (dy / far) * speed;
            if (far < 20) {
              beast.hurt -= dt;
              if (beast.hurt <= 0) {
                beast.hurt = 0.8;
                S.health -= 9;
                S.marks.push({ x: S.x, y: S.y - 20, life: 1, text: 'ай' });
              }
            }
          });
        }

        S.marks.forEach((mark) => {
          mark.life -= dt * 1.4;
          mark.y -= dt * 18;
        });
        S.marks = S.marks.filter((mark) => mark.life > 0);

        if (S.health <= 0) {
          S.health = 0;
          S.over = true;
          report?.(Math.floor(S.score));
        }
      },
      draw(ctx) {
        const phase = (S.clock % 40) / 40;
        const dark = S.night ? Math.min(1, (phase - 0.58) / 0.12) : 0;
        backdrop(ctx, width, height, S.night ? ['#070c14', '#0d1622'] : ['#152018', '#20301f']);

        ctx.strokeStyle = 'rgba(238,242,251,.05)';
        for (let i = 0; i < 8; i++) {
          ctx.beginPath();
          ctx.arc(fireX(), fireY(), 40 + i * 42, 0, Math.PI * 2);
          ctx.stroke();
        }

        S.trees.forEach((tree) => {
          ctx.fillStyle = tree.wood > 0 ? 'rgba(126,180,140,.85)' : 'rgba(120,120,120,.35)';
          ctx.beginPath();
          ctx.moveTo(tree.x, tree.y - 20);
          ctx.lineTo(tree.x + 13, tree.y + 10);
          ctx.lineTo(tree.x - 13, tree.y + 10);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(90,70,50,.9)';
          ctx.fillRect(tree.x - 2.5, tree.y + 8, 5, 9);
        });

        S.berries.forEach((bush) => {
          ctx.fillStyle = bush.ripe ? '#d98fae' : 'rgba(150,150,150,.28)';
          ctx.beginPath();
          ctx.arc(bush.x, bush.y, 8, 0, Math.PI * 2);
          ctx.fill();
        });

        const glow = ctx.createRadialGradient(fireX(), fireY(), 6, fireX(), fireY(), 60 + S.fire);
        glow.addColorStop(0, `rgba(255,180,90,${0.5 + S.fire / 260})`);
        glow.addColorStop(1, 'rgba(255,150,60,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = S.fire > 6 ? '#ffb45c' : 'rgba(120,110,100,.7)';
        ctx.beginPath();
        ctx.arc(fireX(), fireY(), 10 + S.fire / 14, 0, Math.PI * 2);
        ctx.fill();

        S.beasts.forEach((beast) => {
          ctx.fillStyle = '#c98b8b';
          ctx.beginPath();
          ctx.arc(beast.x, beast.y, 11, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#0b0f16';
          ctx.fillRect(beast.x - 5, beast.y - 3, 3, 3);
          ctx.fillRect(beast.x + 2, beast.y - 3, 3, 3);
        });

        ctx.fillStyle = '#eef2fb';
        ctx.beginPath();
        ctx.arc(S.x, S.y, 10, 0, Math.PI * 2);
        ctx.fill();

        S.marks.forEach((mark) => {
          ctx.globalAlpha = Math.max(0, mark.life);
          ctx.fillStyle = '#eef2fb';
          ctx.font = '600 12px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(mark.text, mark.x, mark.y);
          ctx.globalAlpha = 1;
          ctx.textAlign = 'start';
        });

        if (dark > 0) {
          ctx.fillStyle = `rgba(4,7,14,${dark * 0.42})`;
          ctx.fillRect(0, 0, width, height);
        }

        const bar = (x, y, value, color, label) => {
          ctx.fillStyle = 'rgba(238,242,251,.14)';
          ctx.beginPath();
          ctx.roundRect(x, y, 92, 9, 5);
          ctx.fill();
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.roundRect(x, y, Math.max(2, (92 * Math.max(0, value)) / 100), 9, 5);
          ctx.fill();
          ctx.fillStyle = 'rgba(238,242,251,.75)';
          ctx.font = '600 10px Inter, system-ui, sans-serif';
          ctx.fillText(label, x, y - 4);
        };
        bar(16, 26, S.health, '#8fd7c2', 'здоровье');
        bar(16, 52, S.hunger, '#e8c07d', 'сытость');
        bar(16, 78, S.fire, '#ffb45c', 'костёр');

        ctx.fillStyle = 'rgba(238,242,251,.9)';
        ctx.font = '600 13px Inter, system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`Дров ${Math.floor(S.wood)}`, width - 16, 34);
        ctx.fillText(`Еды ${S.food}`, width - 16, 54);
        ctx.fillText(`Ночей ${S.nights}`, width - 16, 74);
        ctx.fillText(`Очки ${Math.floor(S.score)}`, width - 16, 94);
        ctx.textAlign = 'start';

        ctx.fillStyle = 'rgba(238,242,251,.5)';
        ctx.font = '500 12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(S.night ? 'Ночь: держитесь у огня' : 'День: соберите дрова и ягоды', width / 2, height - 16);
        ctx.textAlign = 'start';

        if (S.over) overText(ctx, width, height, 'Вы не дожили до утра', 'Коснитесь, чтобы начать заново');
      }
    };
  });
}

function tube(canvas, report) {
  return runner(canvas, ({ w, h }) => {
    let width = w;
    let height = h;
    let S;
    let grab = null;

    const start = () => {
      S = { z: 0, angle: 0, spin: 0, speed: 13, score: 0, rings: [], over: false, ahead: 26, coins: 0 };
      grow();
    };

    const grow = () => {
      while (S.ahead < S.z + 190) {
        const bars = [];
        if (Math.random() < 0.72) {
          const gates = 1 + (Math.random() < 0.3 ? 1 : 0);
          for (let i = 0; i < gates; i++) {
            bars.push({ at: Math.random() * Math.PI * 2, span: 0.55 + Math.random() * 0.5 });
          }
        }
        S.rings.push({ z: S.ahead, bars, hue: 180 + Math.random() * 90, coin: Math.random() < 0.45 ? Math.random() * Math.PI * 2 : null, taken: false });
        S.ahead += 9 + Math.random() * 6;
      }
      S.rings = S.rings.filter((ring) => ring.z > S.z - 6);
    };

    start();

    const project = (angle, z, radius) => {
      const rz = z - S.z;
      if (rz < 0.6) return null;
      const local = angle - S.angle + Math.PI / 2;
      const scale = (height * 2.6) / rz;
      return {
        x: width / 2 + Math.cos(local) * radius * scale,
        y: height / 2 + Math.sin(local) * radius * scale,
        d: rz
      };
    };

    const fog = (d) => Math.max(0, Math.min(1, 1 - d / 130));

    return {
      score: () => Math.floor(S.score),
      resize(size) {
        width = size.w;
        height = size.h;
      },
      bind(bind, node) {
        const down = (event) => {
          event.preventDefault();
          capture(node, event);
          if (S.over) {
            start();
            return;
          }
          grab = { x: pointerPos(node, event).x, angle: S.angle };
        };
        const move = (event) => {
          if (!grab) return;
          event.preventDefault();
          const now = pointerPos(node, event).x;
          S.angle = grab.angle + ((now - grab.x) / width) * 5.2;
        };
        bind('pointerdown', down);
        bind('touchstart', down);
        bind('pointermove', move);
        bind('touchmove', move);
        bind('pointerup', () => {
          grab = null;
        });
        bind('touchend', () => {
          grab = null;
        });
        bind('keydown', (event) => {
          if (S.over && event.key === ' ') return start();
          if (event.key === 'ArrowLeft') S.angle -= 0.28;
          if (event.key === 'ArrowRight') S.angle += 0.28;
        }, window);
      },
      update(dt) {
        if (S.over) return;
        S.speed = Math.min(40, S.speed + dt * 0.6);
        S.z += S.speed * dt;
        S.score += S.speed * dt * 0.7;
        grow();

        for (const ring of S.rings) {
          if (Math.abs(ring.z - S.z) > 0.9) continue;
          if (ring.coin !== null && !ring.taken) {
            const gap = Math.abs(((ring.coin - S.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            if (gap > Math.PI - 0.45) {
              ring.taken = true;
              S.coins += 1;
              S.score += 60;
            }
          }
          for (const bar of ring.bars) {
            const gap = Math.abs(((bar.at - S.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            if (gap > Math.PI - bar.span / 2) {
              S.over = true;
              report?.(Math.floor(S.score));
              return;
            }
          }
        }
      },
      draw(ctx) {
        backdrop(ctx, width, height, ['#04070f', '#101a2e']);
        const radius = 1;
        const sorted = [...S.rings].sort((a, b) => b.z - a.z);
        for (const ring of sorted) {
          const d = ring.z - S.z;
          if (d < 0.7 || d > 135) continue;
          const alpha = fog(d);
          const points = [];
          for (let i = 0; i <= 28; i++) {
            points.push(project((i / 28) * Math.PI * 2, ring.z, radius));
          }
          if (points.some((point) => !point)) continue;
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
          ctx.strokeStyle = `hsla(${ring.hue}, 55%, 60%, ${alpha * 0.35})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();

          ring.bars.forEach((bar) => {
            const arc = [];
            for (let i = 0; i <= 12; i++) {
              arc.push(project(bar.at - bar.span / 2 + (bar.span * i) / 12, ring.z, radius));
            }
            if (arc.some((point) => !point)) return;
            ctx.beginPath();
            ctx.moveTo(arc[0].x, arc[0].y);
            arc.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
            ctx.strokeStyle = `hsla(${ring.hue}, 70%, 62%, ${alpha})`;
            ctx.lineWidth = Math.max(3, 220 / d);
            ctx.lineCap = 'round';
            ctx.stroke();
          });

          if (ring.coin !== null && !ring.taken) {
            const spot = project(ring.coin, ring.z, radius * 0.82);
            if (spot) {
              ctx.fillStyle = `rgba(216,180,92,${alpha})`;
              ctx.beginPath();
              ctx.arc(spot.x, spot.y, Math.max(2, 60 / d), 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }

        const meY = height / 2 + ((height * 2.6) / 5) * radius * 0.86;
        ctx.fillStyle = '#eef2fb';
        ctx.beginPath();
        ctx.arc(width / 2, Math.min(height - 46, meY), 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(126,231,196,.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(width / 2, Math.min(height - 46, meY), 16, 0, Math.PI * 2);
        ctx.stroke();

        hud(ctx, width, [`Очки ${Math.floor(S.score)}`, `Искры ${S.coins}`, `Скорость ${Math.round(S.speed * 10)}`]);
        ctx.fillStyle = 'rgba(238,242,251,.5)';
        ctx.font = '500 12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Ведите пальцем: труба крутится вокруг вас', width / 2, height - 16);
        ctx.textAlign = 'start';
        if (S.over) overText(ctx, width, height, 'Врезались', 'Коснитесь, чтобы начать заново');
      }
    };
  });
}

function mine(canvas, report) {
  return runner(canvas, ({ w, h }) => {
    let width = w;
    let height = h;
    let S;
    let aim = null;

    const start = () => {
      S = { x: width / 2, depth: 0, speed: 90, score: 0, gems: 0, lives: 3, rocks: [], stones: [], over: false, flash: 0, ahead: 0 };
      grow();
    };

    const grow = () => {
      while (S.ahead < S.depth + height * 2) {
        const kind = Math.random();
        if (kind < 0.62) {
          S.rocks.push({ x: 30 + Math.random() * (width - 60), y: S.ahead, r: 14 + Math.random() * 16, hot: Math.random() < 0.25 });
        } else {
          S.stones.push({ x: 24 + Math.random() * (width - 48), y: S.ahead, taken: false });
        }
        S.ahead += 46 + Math.random() * 46;
      }
      S.rocks = S.rocks.filter((rock) => rock.y > S.depth - height);
      S.stones = S.stones.filter((stone) => stone.y > S.depth - height);
    };

    start();

    const meY = () => height * 0.3;

    return {
      score: () => Math.floor(S.score),
      resize(size) {
        width = size.w;
        height = size.h;
      },
      bind(bind, node) {
        const steer = (event) => {
          event.preventDefault();
          if (S.over) {
            start();
            return;
          }
          aim = pointerPos(node, event).x;
        };
        bind('pointerdown', (event) => {
          capture(node, event);
          steer(event);
        });
        bind('pointermove', (event) => {
          if (aim === null) return;
          aim = pointerPos(node, event).x;
        });
        bind('touchstart', steer);
        bind('touchmove', steer);
        bind('pointerup', () => {
          aim = null;
        });
      },
      update(dt) {
        if (S.over) return;
        S.speed = Math.min(320, S.speed + dt * 7);
        S.depth += S.speed * dt;
        S.score += S.speed * dt * 0.09;
        if (S.flash > 0) S.flash = Math.max(0, S.flash - dt * 2);
        grow();

        if (aim !== null) S.x += (aim - S.x) * Math.min(1, dt * 7);
        S.x = Math.max(16, Math.min(width - 16, S.x));

        const y = S.depth + meY();
        for (const stone of S.stones) {
          if (stone.taken || Math.abs(stone.y - y) > 16) continue;
          if (Math.abs(stone.x - S.x) > 20) continue;
          stone.taken = true;
          S.gems += 1;
          S.score += 45;
        }
        for (const rock of S.rocks) {
          if (rock.hit || Math.abs(rock.y - y) > rock.r + 10) continue;
          if (Math.abs(rock.x - S.x) > rock.r + 10) continue;
          rock.hit = true;
          S.flash = 1;
          S.lives -= rock.hot ? 2 : 1;
          if (S.lives <= 0) {
            S.lives = 0;
            S.over = true;
            report?.(Math.floor(S.score));
            return;
          }
        }
      },
      draw(ctx) {
        backdrop(ctx, width, height, ['#141017', '#241a1a']);
        const top = S.depth - meY();
        ctx.strokeStyle = 'rgba(238,242,251,.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 12; i++) {
          const y = ((i * 90 - (S.depth % 90)) + height) % height;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }

        S.stones.forEach((stone) => {
          if (stone.taken) return;
          const y = stone.y - top;
          if (y < -30 || y > height + 30) return;
          ctx.fillStyle = '#7fd7e8';
          ctx.beginPath();
          ctx.moveTo(stone.x, y - 9);
          ctx.lineTo(stone.x + 8, y);
          ctx.lineTo(stone.x, y + 9);
          ctx.lineTo(stone.x - 8, y);
          ctx.closePath();
          ctx.fill();
        });

        S.rocks.forEach((rock) => {
          const y = rock.y - top;
          if (y < -60 || y > height + 60) return;
          ctx.fillStyle = rock.hit ? 'rgba(120,120,120,.25)' : rock.hot ? '#c9603f' : '#6b6560';
          ctx.beginPath();
          ctx.arc(rock.x, y, rock.r, 0, Math.PI * 2);
          ctx.fill();
          if (rock.hot && !rock.hit) {
            ctx.strokeStyle = 'rgba(255,150,80,.5)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(rock.x, y, rock.r + 5, 0, Math.PI * 2);
            ctx.stroke();
          }
        });

        ctx.fillStyle = '#eef2fb';
        ctx.beginPath();
        ctx.moveTo(S.x, meY() + 14);
        ctx.lineTo(S.x + 11, meY() - 10);
        ctx.lineTo(S.x - 11, meY() - 10);
        ctx.closePath();
        ctx.fill();

        if (S.flash > 0) {
          ctx.fillStyle = `rgba(220,110,120,${S.flash * 0.3})`;
          ctx.fillRect(0, 0, width, height);
        }

        hud(ctx, width, [`Глубина ${Math.floor(S.depth / 10)}`, `Кристаллы ${S.gems}`, `Жизни ${S.lives}`]);
        ctx.fillStyle = 'rgba(238,242,251,.5)';
        ctx.font = '500 12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Ведите пальцем, камни бьют, раскалённые бьют вдвое', width / 2, height - 16);
        ctx.textAlign = 'start';
        if (S.over) overText(ctx, width, height, 'Завалило', 'Коснитесь, чтобы копать снова');
      }
    };
  });
}

export const GAMES = [
  {
    id: 'shelter',
    fresh: true,
    title: 'Убежище',
    desc: 'Выживалка: днём дрова, ночью костёр и звери',
    tint: ['#101a14', '#1e2c1e'],
    mount: shelter
  },
  {
    id: 'tube',
    fresh: true,
    title: 'Труба',
    desc: 'Трёхмерный тоннель, который крутится вокруг вас',
    tint: ['#04070f', '#152444'],
    mount: tube
  },
  {
    id: 'mine',
    fresh: true,
    title: 'Шахта',
    desc: 'Спуск вглубь за кристаллами мимо камней',
    tint: ['#141017', '#2c1e1e'],
    mount: mine
  },
  {
    id: 'sky',
    title: 'Небесный каньон',
    desc: 'Полный 3D полёт сквозь скалы и кольца',
    tint: ['#050a18', '#12294a'],
    premium: true,
    mount: sky
  },
  {
    id: 'roll',
    title: 'Шарик',
    desc: 'Ведите шар к выходу мимо провалов',
    tint: ['#0d1420', '#1b2a3c'],
    premium: true,
    mount: roll
  },
  {
    id: 'flasks',
    title: 'Колбочки',
    desc: 'Разлейте цвета по своим колбам',
    tint: ['#0d1020', '#241a3c'],
    mount: flasks
  },
  {
    id: 'trace',
    title: 'Одной линией',
    desc: 'Пройдите все точки, не отрывая палец',
    tint: ['#0a1620', '#14384a'],
    mount: trace
  },
  {
    id: 'rhythm',
    title: 'Ритм',
    desc: 'Попадай по нотам в такт',
    tint: ['#120e22', '#241a3c'],
    mount: rhythm
  },
  {
    id: 'bubbles',
    title: 'Шарики',
    desc: 'Лопай группы одного цвета',
    tint: ['#0f1a20', '#1a2c34'],
    mount: bubbles
  },
  {
    id: 'jumper',
    title: 'Прыжок',
    desc: 'Прыгай вверх по платформам',
    tint: ['#0e1a24', '#1b3040'],
    mount: jumper
  },
  {
    id: 'tetris',
    title: 'Стакан',
    desc: 'Тетрис: свайп двигает, тап поворачивает',
    tint: ['#0e1524', '#191f36'],
    mount: tetris
  },
  {
    id: 'p2048',
    title: '2048',
    desc: 'Свайпайте и складывайте числа',
    tint: ['#151221', '#26203a'],
    mount: puzzle2048
  },
  {
    id: 'mines',
    title: 'Сапёр',
    desc: 'Открывай клетки, ставь флажки',
    tint: ['#101a16', '#1b2b24'],
    mount: mines
  },
  {
    id: 'bricks',
    title: 'Кирпичи',
    desc: 'Отбивай мяч и ломай стену',
    tint: ['#0b1524', '#152238'],
    mount: bricks
  },
  {
    id: 'flap',
    title: 'Полёт',
    desc: 'Тапай, чтобы не упасть',
    tint: ['#16233a', '#2b3c58'],
    mount: flap
  },
  {
    id: 'pairs',
    title: 'Пары',
    desc: 'Найди все одинаковые карточки',
    tint: ['#141726', '#232840'],
    mount: pairs
  },
  {
    id: 'tower',
    title: 'Башня',
    desc: 'Ставь блоки один на другой',
    tint: ['#101a26', '#1d3040'],
    mount: tower
  },
  {
    id: 'hoops',
    title: 'Кольцо',
    desc: 'Забрасывай мяч в движущееся кольцо',
    tint: ['#1a1020', '#33203a'],
    mount: hoops
  },
  {
    id: 'dread',
    title: 'Мрак',
    desc: 'Хоррор от первого лица: монстры, фонарь, этажи',
    tint: ['#0a0a10', '#1c1016'],
    mount: dread
  },
  {
    id: 'rally',
    title: 'Гонка',
    desc: 'Уворачивайся от машин и собирай монеты',
    tint: ['#160f28', '#3a2148'],
    mount: rally
  },
  {
    id: 'snake',
    title: 'Змейка',
    desc: 'Классика со свайпами',
    tint: ['#0f2a20', '#1a4433'],
    mount: snake
  },
  {
    id: 'storm',
    title: 'Шторм',
    desc: 'Арена: волны врагов и бонусы',
    tint: ['#161a33', '#2b2050'],
    mount: storm
  },
  {
    id: 'maze3d',
    title: 'Лабиринт 3D',
    desc: 'Настоящий 3D от первого лица',
    tint: ['#1b2740', '#2f4a3c'],
    mount: maze3d
  },
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
