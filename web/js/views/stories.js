import { api, state, isPremium } from '../store.js';
import { el, esc, timeAgo } from '../util.js';
import { icon } from '../icons.js';
import { avatar, badges, toast, confirmSheet, setStoryOwners } from '../ui.js';

let cache = { at: 0, list: [] };

export async function loadStories(force = false) {
  if (!force && Date.now() - cache.at < 20000) return cache.list;
  try {
    const { stories } = await api.stories();
    cache = { at: Date.now(), list: stories };
    setStoryOwners(stories.map((story) => story.author.id));
  } catch {
    cache = { at: Date.now(), list: [] };
    setStoryOwners([]);
  }
  return cache.list;
}

export function storiesOf(userId) {
  return cache.list.filter((story) => String(story.author.id) === String(userId));
}

export async function openStories(userId, onClose) {
  await loadStories(true);
  const items = storiesOf(userId);
  if (!items.length) {
    toast('Историй нет');
    return false;
  }

  let index = 0;
  let timer = null;

  const view = el(`
    <div class="story-view">
      <div class="story-bars">${items.map(() => '<i><b></b></i>').join('')}</div>
      <div class="story-head">
        <div data-avatar></div>
        <div class="grow" style="min-width:0">
          <div class="row" style="gap:6px"><span class="strong small truncate" data-name></span><span data-badges></span></div>
          <div class="tiny" style="opacity:.7" data-time></div>
        </div>
        <button class="btn btn-icon btn-ghost" data-remove style="color:#c98b8b">${icon('trash', 18)}</button>
        <button class="btn btn-icon btn-ghost" data-close>${icon('close', 20)}</button>
      </div>
      <div class="story-stage" data-stage>
        <div class="story-tap left" data-prev></div>
        <div class="story-tap right" data-next></div>
      </div>
    </div>`);
  document.body.appendChild(view);

  const stage = view.querySelector('[data-stage]');
  const bars = [...view.querySelectorAll('.story-bars b')];

  const stop = () => {
    clearInterval(timer);
    timer = null;
    stage.querySelector('video')?.pause();
  };

  const close = () => {
    stop();
    view.remove();
    onClose?.();
  };

  const show = () => {
    stop();
    const story = items[index];
    if (!story) return close();

    const mine = String(story.author.id) === String(state.user?.id);
    view.querySelector('[data-remove]').classList.toggle('hidden', !mine);
    view.querySelector('[data-avatar]').innerHTML = avatar(story.author, 40, { pins: false });
    view.querySelector('[data-name]').textContent = story.author.displayName;
    view.querySelector('[data-badges]').innerHTML = badges(story.author);
    const ago = timeAgo(story.createdAt);
    view.querySelector('[data-time]').textContent = ago === 'только что' ? ago : `${ago} назад`;

    bars.forEach((bar, i) => {
      bar.style.transition = 'none';
      bar.style.width = i < index ? '100%' : '0%';
    });

    stage.querySelectorAll('video, img, .story-caption').forEach((node) => node.remove());
    const media = story.kind === 'video'
      ? el(`<video src="${esc(story.media)}" autoplay playsinline></video>`)
      : el(`<img src="${esc(story.media)}" alt="">`);
    stage.appendChild(media);
    if (story.caption) stage.appendChild(el(`<div class="story-caption">${esc(story.caption)}</div>`));

    const advance = () => {
      if (index < items.length - 1) {
        index += 1;
        show();
      } else {
        close();
      }
    };

    if (story.kind === 'video') {
      media.onended = advance;
      media.onerror = advance;
      const track = () => {
        const total = media.duration || 0;
        bars[index].style.width = total ? `${(media.currentTime / total) * 100}%` : '0%';
      };
      media.ontimeupdate = track;
    } else {
      const started = Date.now();
      const span = 6000;
      timer = setInterval(() => {
        const done = Math.min(1, (Date.now() - started) / span);
        bars[index].style.width = `${done * 100}%`;
        if (done >= 1) advance();
      }, 60);
    }
  };

  view.querySelector('[data-close]').onclick = close;
  view.querySelector('[data-prev]').onclick = () => {
    if (index > 0) {
      index -= 1;
      show();
    }
  };
  view.querySelector('[data-next]').onclick = () => {
    if (index < items.length - 1) {
      index += 1;
      show();
    } else {
      close();
    }
  };
  view.querySelector('[data-remove]').onclick = async () => {
    stop();
    const story = items[index];
    if (!(await confirmSheet({ title: 'Удалить историю', text: 'Её больше никто не увидит', confirm: 'Удалить', danger: true }))) {
      show();
      return;
    }
    try {
      await api.deleteStory(story.id);
      items.splice(index, 1);
      await loadStories(true);
      if (!items.length) return close();
      index = Math.min(index, items.length - 1);
      show();
    } catch (error) {
      toast(error.message, 'err');
      show();
    }
  };

  show();
  return true;
}

export function publishStory(done) {
  if (!isPremium(state.user)) return toast('Истории доступны с подпиской СпокУм Премиум', 'err');

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'video/*,image/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) return toast('Файл больше 25 МБ, выберите короче', 'err');

    const body = el(`
      <div class="col">
        <div class="small muted">Файл: ${esc(file.name)}</div>
        <input class="input" data-caption maxlength="200" placeholder="Подпись, если хочется">
        <button class="btn btn-primary" data-send>Выложить на 24 часа</button>
      </div>`);
    const { openSheet } = await import('../ui.js');
    const sheet = openSheet('Новая история', body);
    body.querySelector('[data-send]').onclick = async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = 'Загружаем';
      try {
        await api.publishStory(file, body.querySelector('[data-caption]').value);
        sheet.close();
        toast('История опубликована');
        await loadStories(true);
        done?.();
      } catch (error) {
        toast(error.message, 'err');
        button.disabled = false;
        button.textContent = 'Выложить на 24 часа';
      }
    };
  };
  input.click();
}
