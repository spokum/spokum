import { WebSocketServer } from 'ws';
import { resolveSession } from './auth.js';

const clients = new Map();

export function attach(server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1_000_000 });
  wss.on('connection', (socket, request) => {
    const url = new URL(request.url, 'http://local');
    const user = resolveSession(url.searchParams.get('token'));
    if (!user) {
      socket.close(4001, 'unauthorized');
      return;
    }
    if (!clients.has(user.id)) clients.set(user.id, new Set());
    clients.get(user.id).add(socket);
    socket.isAlive = true;
    socket.on('pong', () => {
      socket.isAlive = true;
    });
    socket.on('close', () => {
      const set = clients.get(user.id);
      if (!set) return;
      set.delete(socket);
      if (!set.size) clients.delete(user.id);
    });
  });

  const timer = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30000);
  wss.on('close', () => clearInterval(timer));
  return wss;
}

export function broadcast(userIds, payload) {
  const data = JSON.stringify(payload);
  const targets = userIds ? userIds : [...clients.keys()];
  for (const id of targets) {
    const set = clients.get(id);
    if (!set) continue;
    for (const socket of set) {
      if (socket.readyState === socket.OPEN) socket.send(data);
    }
  }
}
