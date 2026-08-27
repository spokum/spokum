const KEY = 'spokum.saved.v1';

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 120)));
  } catch {}
}

export function savedList() {
  return read();
}

export function isSaved(id) {
  return read().some((row) => String(row.id) === String(id));
}

export function toggleSaved(post) {
  const list = read();
  const index = list.findIndex((row) => String(row.id) === String(post.id));
  if (index >= 0) {
    list.splice(index, 1);
    write(list);
    return false;
  }
  list.unshift({
    id: post.id,
    text: post.text || '',
    image: post.image || null,
    kind: post.kind || 'text',
    mood: post.mood || 'calm',
    createdAt: post.createdAt,
    savedAt: Date.now(),
    author: {
      id: post.author?.id,
      username: post.author?.username,
      displayName: post.author?.displayName,
      avatar: post.author?.avatar,
      hue: post.author?.hue
    }
  });
  write(list);
  return true;
}

export function dropSaved(id) {
  write(read().filter((row) => String(row.id) !== String(id)));
}
