import { el, esc, uid, fullDate, timeAgo } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, emptyState, confirmSheet } from '../ui.js';

// Private notes — purely local, never synced to the backend.
// Shape: { id, text, color, createdAt, updatedAt }
// Stored in `spokum.notes`.

const KEY = 'spokum.notes';

const COLORS = [
  { id: 'none',   bg: 'transparent',     ink: 'var(--muted)' },
  { id: 'yellow', bg: 'rgba(220,180,80,.16)',  ink: '#d8b45c' },
  { id: 'green',  bg: 'rgba(135,179,160,.16)', ink: '#7fb3a0' },
  { id: 'blue',   bg: 'rgba(138,171,199,.16)', ink: '#8aabc7' },
  { id: 'pink',   bg: 'rgba(199,143,164,.16)', ink: '#c78fa4' }
];

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
}

export function getNotesCount() {
  return load().length;
}

export function openNotes() {
  const body = el('<div class="col" style="gap:10px"></div>');
  const sheet = openSheet('Заметки', body);

  let query = '';
  let editing = null; // note being edited, or null for "new"

  const draw = () => {
    const all = load();
    const filtered = query
      ? all.filter((n) => (n.text || '').toLowerCase().includes(query.toLowerCase()))
      : all;

    body.innerHTML = `
      <div class="row" style="gap:8px">
        <input class="input grow" data-query placeholder="Поиск по заметкам" value="${esc(query)}">
        <button class="btn btn-primary" data-new>${icon('plus', 16)} Новая</button>
      </div>
      <div data-list style="display:flex;flex-direction:column;gap:8px"></div>`;

    const list = body.querySelector('[data-list]');
    if (!filtered.length) {
      list.innerHTML = emptyState('edit', query ? 'Ничего не нашли' : 'Заметок пока нет', query ? 'Попробуйте другой запрос' : 'Нажмите «Новая», чтобы записать мысль');
    } else {
      // Newest first.
      [...filtered]
        .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
        .forEach((note) => {
          const color = COLORS.find((c) => c.id === note.color) || COLORS[0];
          const node = el(`<div class="card" data-note="${note.id}" style="padding:12px;background:${color.bg === 'transparent' ? 'var(--surface)' : color.bg};border:1px solid var(--line)">
            <div class="small" style="white-space:pre-wrap;word-break:break-word;line-height:1.5">${esc((note.text || '').slice(0, 400))}${(note.text || '').length > 400 ? '...' : ''}</div>
            <div class="row between" style="margin-top:10px;align-items:center">
              <span class="tiny muted">${timeAgo(note.updatedAt || note.createdAt)}</span>
              <div class="row" style="gap:4px">
                <button class="btn btn-sm btn-ghost" data-edit title="Изменить">${icon('edit', 14)}</button>
                <button class="btn btn-sm btn-ghost" data-kill title="Удалить">${icon('trash', 14)}</button>
              </div>
            </div>
          </div>`);
          node.querySelector('[data-edit]').onclick = (event) => {
            event.stopPropagation();
            openEditor(note, () => draw());
          };
          node.querySelector('[data-kill]').onclick = async (event) => {
            event.stopPropagation();
            const ok = await confirmSheet({ title: 'Удалить заметку?', text: 'Восстановить не получится', confirm: 'Удалить', danger: true });
            if (!ok) return;
            const all2 = load().filter((n) => n.id !== note.id);
            save(all2);
            toast('Заметка удалена');
            draw();
          };
          list.appendChild(node);
        });
    }

    body.querySelector('[data-query]').addEventListener('input', (event) => {
      query = event.target.value;
      // Only re-render the list, keep focus in the search box.
      const list2 = body.querySelector('[data-list]');
      const filtered2 = query
        ? load().filter((n) => (n.text || '').toLowerCase().includes(query.toLowerCase()))
        : load();
      if (!filtered2.length) {
        list2.innerHTML = emptyState('edit', query ? 'Ничего не нашли' : 'Заметок пока нет', query ? 'Попробуйте другой запрос' : 'Нажмите «Новая», чтобы записать мысль');
        return;
      }
      list2.innerHTML = '';
      [...filtered2]
        .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
        .forEach((note) => {
          const color = COLORS.find((c) => c.id === note.color) || COLORS[0];
          const node = el(`<div class="card" data-note="${note.id}" style="padding:12px;background:${color.bg === 'transparent' ? 'var(--surface)' : color.bg};border:1px solid var(--line)">
            <div class="small" style="white-space:pre-wrap;word-break:break-word;line-height:1.5">${esc((note.text || '').slice(0, 400))}${(note.text || '').length > 400 ? '...' : ''}</div>
            <div class="row between" style="margin-top:10px;align-items:center">
              <span class="tiny muted">${timeAgo(note.updatedAt || note.createdAt)}</span>
              <div class="row" style="gap:4px">
                <button class="btn btn-sm btn-ghost" data-edit title="Изменить">${icon('edit', 14)}</button>
                <button class="btn btn-sm btn-ghost" data-kill title="Удалить">${icon('trash', 14)}</button>
              </div>
            </div>
          </div>`);
          node.querySelector('[data-edit]').onclick = (event2) => {
            event2.stopPropagation();
            openEditor(note, () => draw());
          };
          node.querySelector('[data-kill]').onclick = async (event2) => {
            event2.stopPropagation();
            const ok = await confirmSheet({ title: 'Удалить заметку?', text: 'Восстановить не получится', confirm: 'Удалить', danger: true });
            if (!ok) return;
            const all3 = load().filter((n) => n.id !== note.id);
            save(all3);
            toast('Заметка удалена');
            draw();
          };
          list2.appendChild(node);
        });
    });

    body.querySelector('[data-new]').onclick = () => openEditor(null, () => draw());
  };

  draw();
  return sheet;
}

function openEditor(note, done) {
  const isNew = !note;
  const body = el(`<div class="col" style="gap:10px">
    <div class="row" style="gap:6px;flex-wrap:wrap" data-colors></div>
    <textarea class="textarea" data-text placeholder="Запишите мысль..." maxlength="4000" style="min-height:200px">${esc(note?.text || '')}</textarea>
    <div class="row between">
      <span class="tiny muted">${note ? 'Изменено ' + fullDate(note.updatedAt || note.createdAt) : 'Новая заметка'}</span>
      <button class="btn btn-primary" data-save>${icon('check', 16)} Сохранить</button>
    </div>
  </div>`);
  const sheet = openSheet(isNew ? 'Новая заметка' : 'Изменить заметку', body);

  let color = note?.color || 'none';
  const drawColors = () => {
    const host = body.querySelector('[data-colors]');
    host.innerHTML = COLORS.map((c) => `<button class="chip" data-color="${c.id}" aria-pressed="${c.id === color}" style="${c.bg === 'transparent' ? '' : `background:${c.bg};color:${c.ink}`}">${c.id === 'none' ? 'без цвета' : c.id}</button>`).join('');
    host.querySelectorAll('[data-color]').forEach((btn) => {
      btn.onclick = () => {
        color = btn.dataset.color;
        drawColors();
      };
    });
  };
  drawColors();

  body.querySelector('[data-save]').onclick = () => {
    const text = body.querySelector('[data-text]').value.trim();
    if (!text) return toast('Заметка пустая', 'err');
    const list = load();
    if (isNew) {
      list.push({ id: uid(), text, color, createdAt: Date.now(), updatedAt: Date.now() });
    } else {
      const idx = list.findIndex((n) => n.id === note.id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], text, color, updatedAt: Date.now() };
      }
    }
    save(list);
    sheet.close();
    toast(isNew ? 'Заметка добавлена' : 'Заметка обновлена');
    done?.();
  };
}
