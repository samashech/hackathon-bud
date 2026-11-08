// Serves the website and lets its Refresh button re-fetch every source.
//   npm start                 http://localhost:4321
//   HOST=0.0.0.0 npm start    reachable from your phone on the same Wi-Fi
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { refresh } from './scripts/refresh.mjs';

const WEB = join(fileURLToPath(new URL('.', import.meta.url)), 'web');
const PORT = Number(process.env.PORT || 4321);
const HOST = process.env.HOST || '127.0.0.1';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

let running = null;
let lastRun = 0;

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/health') return res.writeHead(200).end('ok');
  if (url.pathname === '/api/refresh' && req.method === 'POST') {
    // One refresh at a time, and at most one a minute, to be gentle on the sites.
    if (!running && Date.now() - lastRun > 60_000) running = refresh({ quiet: true }).finally(() => { running = null; lastRun = Date.now(); });
    try { await running; res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}'); }
    catch (e) { res.writeHead(502).end(String(e.message)); }
    return;
  }
  const path = normalize(join(WEB, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
  if (!path.startsWith(WEB)) return res.writeHead(403).end();
  try {
    if (!(await stat(path)).isFile()) throw new Error();
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(await readFile(path));
  } catch { res.writeHead(404).end('not found'); }
}).listen(PORT, HOST, () => console.log(`Radar on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));
