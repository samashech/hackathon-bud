// The website, the subscribe flow and the daily jobs, in one process.
//   npm start                 http://localhost:4321
//   HOST=0.0.0.0 npm start    reachable from other devices on your network
// On Render, PORT and RENDER are set for you; see render.yaml and README.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { rank, DEFAULT_PREFS } from './core/index.mjs';
import { openStore } from './server/store.mjs';
import { refresh, sendDigests, topFor, prefsFor, regionText, REGIONS, STRONG } from './server/jobs.mjs';
import { send, confirmEmail, digestEmail, mailReady } from './server/email.mjs';
import { regionOptions, issueRows, topRows, ago, messagePage } from './server/pages.mjs';

const WEB = join(fileURLToPath(new URL('.', import.meta.url)), 'web');
const PORT = Number(process.env.PORT || 4321);
const HOST = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
const SITE = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/?$/, '/');
const REFRESH_HOURS = Number(process.env.REFRESH_HOURS || 6);
const DIGEST_HOUR_IST = Number(process.env.DIGEST_HOUR_IST || 8);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const log = (...a) => console.log(new Date().toISOString(), ...a);
const store = await openStore();
log(`store: ${store.kind}; email: ${process.env.MAIL_DRY_RUN === '1' ? 'dry run, printed not sent' : mailReady() ? (process.env.SMTP_URL ? 'SMTP ready' : 'Gmail ready') : 'not configured'}; site: ${SITE}`);

let data = await store.kvGet('hackathons');
let refreshing = null;
function refreshNow() {
  refreshing ||= refresh(store, { log }).then((d) => (data = d)).catch((e) => log('refresh failed', e.message)).finally(() => (refreshing = null));
  return refreshing;
}

// ---------- schedule ----------
// Refresh every REFRESH_HOURS; send the digest once a day after DIGEST_HOUR_IST.
// A free Render service sleeps when idle, so /api/cron lets an outside pinger
// (cron-job.org, GitHub Actions) wake it and run the same tick.
const istDay = (t = Date.now()) => new Date(t + 5.5 * 3600e3).toISOString().slice(0, 10);
const istHour = (t = Date.now()) => new Date(t + 5.5 * 3600e3).getUTCHours();
let ticking = false;
async function tick() {
  if (ticking) return; ticking = true;
  try {
    if (!data || Date.now() - new Date(data.fetchedAt) > REFRESH_HOURS * 3600e3) await refreshNow();
    if (istHour() >= DIGEST_HOUR_IST && (await store.kvGet('lastDigestDay')) !== istDay()) {
      if (Date.now() - new Date(data?.fetchedAt || 0) > 3600e3) await refreshNow();
      await store.kvSet('lastDigestDay', istDay());
      await sendDigests(store, SITE, { log });
    }
  } catch (e) { log('tick failed', e.message); }
  finally { ticking = false; }
}
setInterval(tick, 10 * 60e3);
tick();

// ---------- helpers ----------
const ipOf = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(), list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now); hits.set(key, list);
  return list.length > max;
}
async function body(req) {
  let s = '';
  for await (const c of req) { s += c; if (s.length > 10_000) throw new Error('too large'); }
  if ((req.headers['content-type'] || '').includes('application/json')) return JSON.parse(s || '{}');
  return Object.fromEntries(new URLSearchParams(s));
}
const html = (res, code, page) => res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(page);
const json = (res, code, obj) => res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(obj));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ---------- subscribe flow ----------
async function subscribe(req, { email, region, others }) {
  email = String(email || '').trim().toLowerCase();
  region = REGIONS.includes(region) ? region : 'any';
  if (!EMAIL.test(email) || email.length > 254) return [400, 'That email does not look right.'];
  if (!mailReady()) return [503, 'Email is not set up on this server yet. Ask whoever runs it to add the mail settings.'];
  if (limited(`ip:${ipOf(req)}`, 5, 3600e3)) return [429, 'Too many tries from here. Try again in an hour.'];
  const existing = await store.getSub(email);
  if (existing?.lastConfirmMailAt && Date.now() - new Date(existing.lastConfirmMailAt) < 10 * 60e3) return [200, 'We just sent you a link. Check your inbox and spam folder.'];
  const token = existing?.token || randomBytes(24).toString('hex');
  await store.saveSub({ ...(existing || { email, token, createdAt: new Date().toISOString() }), token, pendingRegion: region, pendingOthers: !!others, lastConfirmMailAt: new Date().toISOString() });
  await send({ to: email, ...confirmEmail({ link: `${SITE}confirm?token=${token}`, regionText: regionText(region) }) });
  return [200, existing?.confirmedAt ? 'Check your inbox to confirm the change.' : 'Almost there. Check your inbox for a link to confirm.'];
}

async function confirm(token) {
  const sub = token && (await store.getSubByToken(token));
  if (!sub) return messagePage({ title: 'That link has expired', body: 'Ask for a new one from the <a class="textlink" href="/#subscribe">home page</a>.' });
  const first = !sub.confirmedAt;
  const now = new Date().toISOString();
  const updated = { ...sub, region: sub.pendingRegion || sub.region || 'any', others: sub.pendingOthers ?? sub.others ?? false, confirmedAt: sub.confirmedAt || now, pendingRegion: undefined, pendingOthers: undefined };
  // The first email is today's best, so nothing waits until tomorrow morning.
  if (first && data) {
    const list = topFor(data, updated, 8).filter((h) => h.score.total >= 35);
    const unsubscribe = `${SITE}unsubscribe?token=${sub.token}`;
    if (list.length) send({ to: sub.email, ...digestEmail({ fresh: list, closing: [], site: SITE, unsubscribe, welcome: true }), unsubscribe }).catch((e) => log('welcome failed', e.message));
    updated.lastSentAt = data.fetchedAt;
  }
  await store.saveSub(updated);
  return messagePage({
    title: first ? 'You are in' : 'Updated',
    body: first ? `Today's strongest hackathons are on their way to ${sub.email.replace(/</g, '')}. After that, one email at 8:00 India time whenever something new and strong opens (${regionText(updated.region)}).` : `You will now get ${regionText(updated.region)}.`,
    action: '<a class="btn btn--primary" href="/explore">See every open hackathon</a>',
  });
}

async function unsubscribe(token) {
  const sub = token && (await store.getSubByToken(token));
  if (sub) await store.deleteSub(sub.email);
  return messagePage({ title: 'You will not get any more emails', body: 'Nothing else is kept about you. Changed your mind? <a class="textlink" href="/#subscribe">Sign up again</a>.' });
}

// ---------- landing page, rendered with the live list ----------
let landingTpl = null;
async function landing() {
  landingTpl ||= await readFile(join(WEB, 'landing.html'), 'utf8');
  const open = data ? rank(data.items, DEFAULT_PREFS).filter((h) => h.ok) : [];
  const top = open.slice(0, 8);
  const strong = open.filter((h) => h.score.total >= STRONG);
  const others = data ? rank(data.items, { ...DEFAULT_PREFS, kinds: ['ideathon', 'promptathon'] }).filter((h) => h.ok) : [];
  const nIdea = others.filter((h) => h.kind === 'ideathon').length, nPrompt = others.length - nIdea;
  const othersText = others.length
    ? `Kept apart: <a class="textlink" href="/explore?kind=ideathon">${nIdea} ideathon${nIdea === 1 ? '' : 's'}</a> and <a class="textlink" href="/explore?kind=promptathon">${nPrompt} promptathon${nPrompt === 1 ? '' : 's'}</a>, also open.`
    : 'Every one is scored the same way, explained below.';
  return landingTpl
    .replaceAll('{{REGION_OPTIONS}}', regionOptions())
    .replaceAll('{{OPEN_COUNT}}', String(open.length))
    .replace('{{OTHERS}}', othersText)
    .replace('{{FIELD_DATA}}', JSON.stringify(open.map((h) => [h.score.total, h.score.total >= 70 ? 1 : 0])))
    .replaceAll('{{FETCHED_AGO}}', data ? ago(data.fetchedAt) : 'shortly')
    .replace('{{ISSUE_SUBJECT}}', data ? `${strong.length} hackathons worth your weekend` : 'Fetching the first list')
    .replace('{{ISSUE_ROWS}}', issueRows(top.slice(0, 3)))
    .replace('{{TOP_ROWS}}', top.length ? topRows(top) : '<li class="hk"><div></div><p>The first list is being fetched. Reload in a minute.</p></li>');
}

// ---------- routes ----------
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/api/health') return res.writeHead(200).end('ok');

    if (p === '/' || p === '/index.html') return html(res, 200, await landing());
    if (p === '/explore') return html(res, 200, await readFile(join(WEB, 'explore.html'), 'utf8'));

    if (p === '/data/hackathons.json') {
      if (!data) await refreshNow();
      return res.writeHead(data ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }).end(JSON.stringify(data || { items: [] }));
    }

    if (p === '/api/subscribe' && req.method === 'POST') {
      const [code, message] = await subscribe(req, await body(req));
      return json(res, code, { message });
    }
    if (p === '/subscribe' && req.method === 'POST') {
      const [code, message] = await subscribe(req, await body(req));
      return html(res, code, messagePage({ title: code === 200 ? 'Check your inbox' : 'That did not work', body: message, action: '<a class="btn" href="/">Back</a>' }));
    }
    if (p === '/confirm') return html(res, 200, await confirm(url.searchParams.get('token')));
    // GET shows a button (mail scanners follow links); POST, including Gmail's one-click, unsubscribes.
    if (p === '/unsubscribe' && req.method === 'GET') {
      const t = String(url.searchParams.get('token') || '').replace(/[^a-f0-9]/g, '');
      return html(res, 200, messagePage({ title: 'Stop the hackathon emails?', body: 'One click and they stop.', action: `<form method="post" action="/unsubscribe?token=${t}"><button class="btn btn--primary" type="submit">Unsubscribe</button></form>` }));
    }
    if (p === '/unsubscribe' && req.method === 'POST') return html(res, 200, await unsubscribe(url.searchParams.get('token')));

    if (p === '/api/refresh' && req.method === 'POST') {
      if (!limited('refresh', 1, 10 * 60e3) || Date.now() - new Date(data?.fetchedAt || 0) > 10 * 60e3) await refreshNow();
      return json(res, 200, { ok: true, fetchedAt: data?.fetchedAt });
    }
    if (p === '/api/cron' && (req.method === 'POST' || req.method === 'GET')) {
      const secret = process.env.CRON_SECRET || '';
      const given = String(req.headers.authorization || '').replace(/^Bearer /, '') || url.searchParams.get('key') || '';
      if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return json(res, 403, { error: 'bad key' });
      await tick();
      return json(res, 200, { ok: true, fetchedAt: data?.fetchedAt, lastDigestDay: await store.kvGet('lastDigestDay') });
    }

    // static files
    const path = normalize(join(WEB, decodeURIComponent(p)));
    if (!path.startsWith(WEB)) return res.writeHead(403).end();
    if (!(await stat(path).catch(() => null))?.isFile()) return html(res, 404, messagePage({ title: 'Nothing here', body: '<a class="textlink" href="/">Go to the home page</a>.' }));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(await readFile(path));
  } catch (e) {
    log('error', p, e.message);
    if (!res.headersSent) json(res, 500, { message: 'Something went wrong on our side. Try again in a minute.' });
  }
}).listen(PORT, HOST, () => log(`listening on http://${HOST}:${PORT}`));

export { prefsFor };
