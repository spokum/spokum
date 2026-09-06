import { cp, readdir, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);
const from = 'web';
const to = process.argv[2] || 'dist';

async function walk(dir) {
  const rows = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const row of rows) {
    const full = path.join(dir, row.name);
    if (row.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

async function shrink(file) {
  const loader = file.endsWith('.css') ? 'css' : 'js';
  try {
    const { stdout } = await run('npx', ['--yes', 'esbuild', file, '--minify', `--loader:.${loader}=${loader}`], {
      maxBuffer: 32 * 1024 * 1024
    });
    if (stdout && stdout.length > 8) await writeFile(file, stdout);
    return true;
  } catch (error) {
    console.log('не сжалось, оставили как есть:', file, String(error.message || '').slice(0, 120));
    return false;
  }
}

if (existsSync(to)) await rm(to, { recursive: true, force: true });
await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });

const files = await walk(to);
let done = 0;
let kept = 0;
for (const file of files) {
  if (file.endsWith('/vendor/supabase.js')) continue;
  if (!file.endsWith('.js') && !file.endsWith('.css')) continue;
  const before = (await readFile(file)).length;
  const ok = await shrink(file);
  const after = (await readFile(file)).length;
  if (ok && after < before) done += 1;
  else kept += 1;
}

const stamp = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : String(Date.now());
await writeFile(path.join(to, 'version.txt'), stamp + '\n');

const total = (await walk(to)).length;
console.log(`собрано в ${to}: файлов ${total}, сжато ${done}, оставлено как есть ${kept}, версия ${stamp}`);
