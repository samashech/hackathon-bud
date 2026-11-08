// Re-checks every source every six hours. A strong hackathon you have not
// seen before lights the badge and sends one notification.
import { collect, rank, DEFAULT_PREFS } from './core/index.mjs';

const EVERY_MIN = 360;
const STRONG = 52;

async function check() {
  const { prefs = {}, seen = [] } = await chrome.storage.local.get(['prefs', 'seen']);
  const { items, errors, fetchedAt } = await collect();
  if (!items.length) { await chrome.storage.local.set({ errors, lastError: fetchedAt }); return; }
  const ranked = rank(items, { ...DEFAULT_PREFS, ...prefs }).filter((h) => h.ok);
  const seenSet = new Set(seen);
  const fresh = ranked.filter((h) => h.score.total >= STRONG && !seenSet.has(h.id));
  await chrome.storage.local.set({ ranked: ranked.slice(0, 60), fetchedAt, errors, unread: fresh.map((h) => h.id), seen: [...new Set([...seen, ...ranked.map((h) => h.id)])].slice(-3000) });
  await chrome.action.setBadgeBackgroundColor({ color: '#f2b84b' });
  await chrome.action.setBadgeText({ text: fresh.length ? String(fresh.length) : '' });
  // The first run would flag everything, so it stays quiet.
  if (fresh.length && seen.length) {
    const top = fresh[0];
    chrome.notifications.create('hackathon-bud', {
      type: 'basic', iconUrl: 'icon-128.png',
      title: fresh.length === 1 ? `New: ${top.title}` : `${fresh.length} new hackathons worth a look`,
      message: top.verdict,
    });
  }
}

chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create('check', { periodInMinutes: EVERY_MIN, delayInMinutes: 0.1 }); });
chrome.runtime.onStartup.addListener(() => chrome.alarms.create('check', { periodInMinutes: EVERY_MIN }));
chrome.alarms.onAlarm.addListener((a) => a.name === 'check' && check());
chrome.notifications.onClicked.addListener(() => chrome.action.openPopup?.());
chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (msg === 'refresh') { check().then(() => reply(true), (e) => reply(String(e))); return true; }
});
