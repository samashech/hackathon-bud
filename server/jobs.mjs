// The two jobs: re-fetch the hackathon list, and email each subscriber what is
// new for them. Used by the server's own scheduler, /api/cron and the CLI.
import { collect, rank, DEFAULT_PREFS, REGION_LABEL } from '../core/index.mjs';
import { send, digestEmail, mailReady } from './email.mjs';

export const STRONG = 52;
export const REGIONS = ['any', 'online', 'north', 'south', 'west', 'east', 'central'];

export function prefsFor(sub) {
  const r = sub?.region || 'any';
  return { ...DEFAULT_PREFS, onlineOnly: r === 'online', region: r === 'online' ? 'any' : r, kinds: sub?.others ? ['hackathon', 'ideathon', 'promptathon'] : ['hackathon'] };
}
export function regionText(r) {
  return r === 'online' ? 'online hackathons only' : r && r !== 'any' ? `online, plus in person in ${REGION_LABEL[r]}` : 'online, plus in person anywhere in India';
}

export async function refresh(store, { log = () => {} } = {}) {
  const previous = (await store.kvGet('hackathons')) || { items: [] };
  const firstSeen = new Map(previous.items.map((h) => [h.id, h.firstSeen]));
  const { items, errors, fetchedAt } = await collect({ previous: previous.items });
  // A run where every source failed keeps the old list.
  if (!items.length) { log('refresh: every source failed', errors); return previous; }
  const data = { fetchedAt, errors, items: items.map((h) => ({ ...h, firstSeen: firstSeen.get(h.id) || fetchedAt })) };
  await store.kvSet('hackathons', data);
  log(`refresh: ${items.length} hackathons`, Object.keys(errors).length ? errors : '');
  return data;
}

// What one subscriber should hear about: strong, fits their region, first seen
// after their last email; plus strong ones closing within three days that they
// have not been reminded of.
export function pick(data, sub, now = Date.now()) {
  const list = rank(data.items, prefsFor(sub), now).filter((h) => h.ok && h.score.total >= STRONG);
  const since = sub.lastSentAt || sub.confirmedAt;
  const reminded = new Set(sub.reminded || []);
  const fresh = list.filter((h) => h.firstSeen > since);
  const closing = list.filter((h) => !fresh.includes(h) && !reminded.has(h.id) && h.score.daysLeft != null && h.score.daysLeft >= 0 && h.score.daysLeft <= 3);
  return { fresh: fresh.slice(0, 12), closing: closing.slice(0, 8) };
}

export function topFor(data, sub, n = 8) {
  return rank(data.items, prefsFor(sub)).filter((h) => h.ok).slice(0, n);
}

export async function sendDigests(store, site, { log = () => {}, dryRun = false } = {}) {
  if (!mailReady() && !dryRun) { log('digest: Gmail is not configured, skipping'); return { sent: 0 }; }
  const data = await store.kvGet('hackathons');
  if (!data) return { sent: 0 };
  let sent = 0, failed = 0;
  for (const sub of await store.listSubs()) {
    if (!sub.confirmedAt) continue;
    const { fresh, closing } = pick(data, sub);
    if (!fresh.length && !closing.length) continue;
    const unsubscribe = `${site}unsubscribe?token=${sub.token}`;
    const mail = digestEmail({ fresh, closing, site, unsubscribe });
    if (dryRun) { log(`would send "${mail.subject}" to ${sub.email}`); continue; }
    try {
      await send({ to: sub.email, ...mail, unsubscribe });
      await store.saveSub({ ...sub, lastSentAt: data.fetchedAt, reminded: [...(sub.reminded || []), ...closing.map((h) => h.id)].slice(-300) });
      sent++;
    } catch (e) { failed++; log(`digest: ${sub.email} failed: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 1500)); // stay well under Gmail's sending rate
  }
  log(`digest: sent ${sent}${failed ? `, ${failed} failed` : ''}`);
  return { sent, failed };
}
