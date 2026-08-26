import { api, state, setUser, MOODS, moodStyle } from '../store.js';
import { el, esc, plural } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet } from '../ui.js';

const WEEKDAYS = ['воскресеньям', 'понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам'];
const ASKED_KEY = 'spokum.journal.asked';

export function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export async function shouldAskToday() {
  if (!state.user) return false;
  const now = new Date();
  if (now.getHours() < 5) return false;
  try {
    if (localStorage.getItem(ASKED_KEY) === today()) return false;
  } catch {}
  try {
    const { entry } = await api.journalEntry(today());
    return !entry;
  } catch {
    return false;
  }
}

export function markAsked() {
  try {
    localStorage.setItem(ASKED_KEY, today());
  } catch {}
}

export function openJournal(done) {
  const body = el(`
    <div class="col">
      <p class="small muted" style="margin:0">Три-пять предложений о том, что чувствуешь. Записи видишь только ты.</p>
      <textarea class="textarea" data-text maxlength="2000" style="min-height:150px" placeholder="Сегодня утром я..."></textarea>
      <div>
        <div class="tiny muted" style="margin-bottom:8px">Настроение дня</div>
        <div class="chips" data-moods></div>
      </div>
      <div>
        <div class="tiny muted" style="margin-bottom:8px">Одно слово про этот день</div>
        <input class="input" data-word maxlength="20" placeholder="Например: тише">
        <label class="row between" style="padding:10px 2px 0">
          <span class="small">Показывать слово в профиле</span>
          <input type="checkbox" data-share>
        </label>
      </div>
      <button class="btn btn-primary" data-save>Сохранить запись</button>
      <button class="btn btn-ghost" data-later>Не сейчас</button>
    </div>`);

  const sheet = openSheet('Дневник настроения', body, { onClose: markAsked });
  let mood = 'calm';

  const moodHost = body.querySelector('[data-moods]');
  moodHost.innerHTML = Object.entries(MOODS)
    .map(([key, item]) => `<button class="chip" data-mood="${key}" style="${moodStyle(key)}" aria-pressed="${key === mood}"><i class="mood-dot"></i>${esc(item.label)}</button>`)
    .join('');
  moodHost.querySelectorAll('[data-mood]').forEach((button) => {
    button.onclick = () => {
      mood = button.dataset.mood;
      moodHost.querySelectorAll('[data-mood]').forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
    };
  });

  body.querySelector('[data-later]').onclick = () => {
    markAsked();
    sheet.close();
  };

  body.querySelector('[data-save]').onclick = async (event) => {
    const button = event.currentTarget;
    const text = body.querySelector('[data-text]').value.trim();
    const word = body.querySelector('[data-word]').value.trim();
    const share = body.querySelector('[data-share]').checked;
    if (!text && !word) return toast('Напиши хотя бы пару слов', 'err');

    button.disabled = true;
    try {
      await api.saveJournal({ day: today(), body: text, mood, word });
      if (word) {
        const { user } = await api.updateMe({ dayWord: word, shareWord: share });
        setUser(user);
      } else if (!share) {
        const { user } = await api.updateMe({ shareWord: false });
        setUser(user);
      }
      markAsked();
      sheet.close();
      toast('Записано, это останется между нами');
      done?.();
    } catch (error) {
      toast(error.message, 'err');
      button.disabled = false;
    }
  };
}

function summarize(entries) {
  const notes = [];
  if (entries.length < 3) {
    notes.push(['clock', 'Сводка появится позже', `Пока записей ${entries.length}. Нужно хотя бы три, чтобы увидеть закономерности.`]);
    return notes;
  }

  const moodCount = {};
  for (const entry of entries) {
    if (!entry.mood) continue;
    moodCount[entry.mood] = (moodCount[entry.mood] || 0) + 1;
  }
  const top = Object.entries(moodCount).sort((a, b) => b[1] - a[1])[0];
  if (top) {
    notes.push(['wave', 'Чаще всего', `${MOODS[top[0]]?.label || top[0]} — ${top[1]} ${plural(top[1], 'раз', 'раза', 'раз').split(' ')[1]} из ${entries.length}`]);
  }

  const heavy = ['anxiety', 'sad', 'anger', 'tired'];
  const byDay = {};
  for (const entry of entries) {
    if (!heavy.includes(entry.mood)) continue;
    const day = new Date(`${entry.day}T12:00:00`).getDay();
    byDay[day] = (byDay[day] || 0) + 1;
  }
  const heavyDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
  if (heavyDay && heavyDay[1] >= 2) {
    notes.push(['warn', 'Тяжелее всего', `По ${WEEKDAYS[heavyDay[0]]} чаще приходит тяжёлое настроение`]);
  }

  const sorted = entries.slice().sort((a, b) => a.day.localeCompare(b.day));
  const half = Math.floor(sorted.length / 2);
  const good = ['calm', 'joy', 'love', 'inspired'];
  const share = (list) => (list.filter((entry) => good.includes(entry.mood)).length / Math.max(1, list.length)) * 100;
  const before = share(sorted.slice(0, half));
  const after = share(sorted.slice(half));
  if (Math.abs(after - before) >= 15) {
    notes.push([
      after > before ? 'leaf' : 'clock',
      after > before ? 'Стало светлее' : 'Стало тяжелее',
      after > before
        ? `Во второй половине записей светлых дней больше на ${Math.round(after - before)}%`
        : `Во второй половине светлых дней меньше на ${Math.round(before - after)}%`
    ]);
  }

  const lengthBefore = sorted.slice(0, half).reduce((sum, entry) => sum + entry.body.length, 0) / Math.max(1, half);
  const lengthAfter = sorted.slice(half).reduce((sum, entry) => sum + entry.body.length, 0) / Math.max(1, sorted.length - half);
  if (lengthAfter > lengthBefore * 1.4 && lengthAfter > 60) {
    notes.push(['edit', 'Пишешь больше', 'Записи стали длиннее — обычно это хороший знак']);
  }

  let streak = 0;
  const days = new Set(entries.map((entry) => entry.day));
  for (let i = 0; i < 60; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (!days.has(key)) break;
    streak += 1;
  }
  if (streak >= 2) {
    notes.push(['spark', 'Подряд', `${plural(streak, 'день', 'дня', 'дней')} без пропусков`]);
  }

  return notes;
}

function wordCloud(entries) {
  const month = new Date();
  month.setDate(month.getDate() - 30);
  const limit = month.toISOString().slice(0, 10);
  const counts = {};
  for (const entry of entries) {
    if (!entry.word || entry.day < limit) continue;
    const word = entry.word.toLowerCase();
    counts[word] = (counts[word] || 0) + 1;
  }
  const list = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 30);
  if (!list.length) return '<div class="small muted center" style="padding:18px 0">Слов пока нет. Они появятся, когда начнёшь их записывать</div>';

  const max = list[0][1];
  return `<div class="word-cloud">${list
    .map(([word, count]) => {
      const size = 14 + (count / max) * 20;
      const weight = count === max ? 750 : 550;
      const alpha = 0.5 + (count / max) * 0.5;
      return `<span style="font-size:${size}px;font-weight:${weight};opacity:${alpha}" title="${count}">${esc(word)}</span>`;
    })
    .join('')}</div>`;
}

export async function openJournalHistory() {
  const body = el('<div class="col" data-host><div class="small muted center">Загружаем</div></div>');
  openSheet('Твой дневник', body);

  let entries = [];
  try {
    ({ entries } = await api.journalHistory());
  } catch (error) {
    body.innerHTML = `<div class="small muted center">${esc(error.message)}</div>`;
    return;
  }

  const notes = summarize(entries);
  body.innerHTML = `
    <div class="col" style="gap:8px">
      ${notes.map(([glyph, title, text]) => `
        <div class="card" style="padding:14px">
          <div class="row" style="align-items:flex-start;gap:10px">
            <span style="color:var(--accent)">${icon(glyph, 17)}</span>
            <div class="grow"><div class="small strong">${esc(title)}</div><div class="tiny muted" style="margin-top:2px">${esc(text)}</div></div>
          </div>
        </div>`).join('')}
    </div>
    <div class="divider"></div>
    <div class="small strong">Облако слов за месяц</div>
    ${wordCloud(entries)}
    <div class="divider"></div>
    <div class="small strong">Записи</div>
    <div class="col" style="gap:8px">
      ${entries.length
        ? entries.slice(0, 30).map((entry) => `
          <div class="card" style="padding:14px">
            <div class="row between">
              <span class="tiny muted">${esc(new Date(`${entry.day}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }))}</span>
              ${entry.mood ? `<span class="mood-tag" style="${moodStyle(entry.mood)}"><i class="mood-dot"></i>${esc(MOODS[entry.mood]?.label || entry.mood)}</span>` : ''}
            </div>
            ${entry.word ? `<div class="pill" style="margin-top:8px;display:inline-block">${esc(entry.word)}</div>` : ''}
            ${entry.body ? `<p class="small" style="margin:8px 0 0;line-height:1.5;white-space:pre-wrap">${esc(entry.body)}</p>` : ''}
          </div>`).join('')
        : '<div class="small muted center" style="padding:18px 0">Записей пока нет</div>'}
    </div>`;
}
