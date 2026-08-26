import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { routes } from './routes.js';
import { resolveSession } from './auth.js';
import { HttpError } from './util.js';
import { attach } from './realtime.js';

const PORT = Number(process.env.PORT || 4173);
const WEB_ROOT = resolve(process.env.SPOKUM_WEB || resolve(process.cwd(), '..', 'web'));
const MAX_BODY = 6 * 1024 * 1024;
const ORIGINS = (process.env.SPOKUM_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

const compiled = routes.map(([method, path, handler]) => {
  const keys = [];
  const pattern = path
    .split('/')
    .map((part) => {
      if (!part.startsWith(':')) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      keys.push(part.slice(1));
      return '([^/]+)';
    })
    .join('/');
  return { method, handler, keys, regex: new RegExp(`^${pattern}$`) };
});

const buckets = new Map();

function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (now > bucket.reset) buckets.delete(key);
}, 60000).unref();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon'
};

function securityHeaders(res, origin) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), interest-cohort=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  if (origin && (!ORIGINS.length || ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

function send(res, status, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(data);
}

function readBody(req) {
  return new Promise((done, fail) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        fail(new HttpError(413, 'Тело запроса слишком большое'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return done({});
      try {
        done(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        fail(new HttpError(400, 'Некорректный JSON'));
      }
    });
    req.on('error', fail);
  });
}

async function serveStatic(req, res, pathname) {
  const target = normalize(join(WEB_ROOT, decodeURIComponent(pathname)));
  if (!target.startsWith(WEB_ROOT)) {
    res.writeHead(403).end();
    return;
  }
  let file = target;
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(WEB_ROOT, 'index.html');
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] || 'application/octet-stream',
      'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=600'
    });
    res.end(data);
  } catch {
    res.writeHead(404).end('not found');
  }
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  securityHeaders(res, origin);
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  const url = new URL(req.url, 'http://local');
  const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '').trim();

  if (!url.pathname.startsWith('/api/')) {
    await serveStatic(req, res, url.pathname);
    return;
  }

  const heavy = url.pathname.startsWith('/api/auth/');
  if (!rateLimit(`${ip}:${heavy ? 'auth' : 'api'}`, heavy ? 12 : 240, 60000)) {
    send(res, 429, { error: 'Слишком много запросов' });
    return;
  }

  const match = compiled.find((route) => route.method === req.method && route.regex.test(url.pathname));
  if (!match) {
    send(res, 404, { error: 'Метод не найден' });
    return;
  }

  try {
    const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);
    const parts = match.regex.exec(url.pathname).slice(1);
    const params = Object.fromEntries(match.keys.map((key, i) => [key, decodeURIComponent(parts[i])]));
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const ctx = {
      user: resolveSession(token),
      body: body && typeof body === 'object' ? body : {},
      query: Object.fromEntries(url.searchParams),
      params,
      ip,
      agent: req.headers['user-agent'] || ''
    };
    send(res, 200, match.handler(ctx));
  } catch (error) {
    if (error instanceof HttpError) send(res, error.status, { error: error.message });
    else {
      console.error(error);
      send(res, 500, { error: 'Внутренняя ошибка' });
    }
  }
});

attach(server);
server.listen(PORT, () => console.log(`spokum api on :${PORT}`));
