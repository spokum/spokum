import { api, state } from './store.js';

const KEY = 'spokum.accounts.v1';
export const ACCOUNT_LIMIT = 5;

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(raw) ? raw.filter((row) => row && row.id) : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, ACCOUNT_LIMIT)));
  } catch {}
}

export function savedAccounts() {
  return read();
}

export function accountCount() {
  return read().length;
}

export function isFull() {
  return read().length >= ACCOUNT_LIMIT;
}

export async function rememberCurrent() {
  const user = state.user;
  if (!user || !api.saveSession) return;
  let tokens = null;
  try {
    tokens = await api.saveSession();
  } catch {}
  if (!tokens) return;
  const list = read().filter((row) => String(row.id) !== String(user.id));
  list.unshift({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar || null,
    hue: user.hue || 220,
    tokens,
    savedAt: Date.now()
  });
  write(list);
}

export async function switchTo(id) {
  const row = read().find((item) => String(item.id) === String(id));
  if (!row) throw new Error('Аккаунт не найден, войдите заново');
  await rememberCurrent();
  const { user } = await api.useSession(row.tokens);
  const list = read().filter((item) => String(item.id) !== String(user.id));
  list.unshift({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar || null,
    hue: user.hue || 220,
    tokens: row.tokens,
    savedAt: Date.now()
  });
  write(list);
  return user;
}

export function forget(id) {
  write(read().filter((row) => String(row.id) !== String(id)));
}

export function forgetAll() {
  localStorage.removeItem(KEY);
}
