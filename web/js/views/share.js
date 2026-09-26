import { MOODS } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, toast } from '../ui.js';

function wrap(ctx, text, width, size) {
  ctx.font = `500 ${size}px Inter, system-ui, sans-serif`;
  const lines = [];
  for (const chunk of String(text).split('\n')) {
    let line = '';
    for (const word of chunk.split(' ')) {
      const probe = line ? `${line} ${word}` : word;
      if (ctx.measureText(probe).width > width && line) {
        lines.push(line);
        line = word;
      } else line = probe;
    }
    lines.push(line);
  }
  return lines.slice(0, 14);
}

export function postToImage(post) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const mood = MOODS[post.mood] || MOODS.calm;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#101318');
  bg.addColorStop(1, '#1b2028');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.8, H * 0.12, 0, W * 0.8, H * 0.12, W * 0.7);
  glow.addColorStop(0, (mood.ink || '#87b7a3') + '30');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,255,255,.04)';
  ctx.beginPath();
  ctx.roundRect(70, 250, W - 140, H - 470, 42);
  ctx.fill();

  ctx.fillStyle = mood.ink || '#87b7a3';
  ctx.beginPath();
  ctx.arc(112, 150, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '600 30px Inter, system-ui, sans-serif';
  ctx.fillText(mood.label || 'Спокойствие', 136, 160);

  ctx.fillStyle = '#dde2e8';
  const lines = wrap(ctx, post.text || '', W - 220, 46);
  lines.forEach((line, i) => {
    ctx.fillText(line, 110, 350 + i * 66);
  });

  ctx.fillStyle = 'rgba(221,226,232,.55)';
  ctx.font = '500 30px Inter, system-ui, sans-serif';
  ctx.fillText('@' + (post.author?.username || 'spokum'), 110, H - 170);

  ctx.fillStyle = '#87b7a3';
  ctx.font = '700 32px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('СпокУм', W - 110, H - 170);
  ctx.font = '500 24px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(221,226,232,.4)';
  ctx.fillText('настроение важнее охватов', W - 110, H - 128);
  ctx.textAlign = 'start';

  return canvas.toDataURL('image/png');
}

export function openShareCard(post) {
  let data;
  try {
    data = postToImage(post);
  } catch (error) {
    return toast('Не получилось нарисовать карточку', 'err');
  }
  const body = el(`<div class="col" style="gap:12px">
    <div class="share-card-wrap"><img src="${data}" alt=""></div>
    <button class="btn btn-primary" data-save>${icon('download', 17)} Сохранить картинку</button>
    <button class="btn" data-copy>${icon('share', 17)} Скопировать</button>
    <p class="tiny muted" style="margin:0;line-height:1.5">Карточку можно выложить куда угодно. Ссылки внутри нет, только ваш ник и название сети.</p>
  </div>`);
  const sheet = openSheet('Запись картинкой', body);
  body.querySelector('[data-save]').onclick = () => {
    const link = document.createElement('a');
    link.href = data;
    link.download = `spokum-${post.id}.png`;
    link.click();
    toast('Сохранено');
  };
  body.querySelector('[data-copy]').onclick = async () => {
    try {
      const blob = await (await fetch(data)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('Картинка скопирована');
    } catch {
      toast('Браузер не дал скопировать, сохраните файлом', 'err');
    }
  };
  return sheet;
}
