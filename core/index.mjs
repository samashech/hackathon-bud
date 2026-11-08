import { SOURCES } from './sources.mjs';
import { classifyPlace, scoreHackathon, passes, tier, verdict, placeText, DEFAULT_PREFS, PLACE_LABEL } from './score.mjs';

export * from './score.mjs';

const key = (t) => t.toLowerCase().replace(/\b20\d\d\b/g, '').replace(/[^a-z0-9]/g, '');

// Fetch every source; a source that fails is reported, never fatal.
export async function collect({ only } = {}) {
  const names = Object.keys(SOURCES).filter((n) => !only || only.includes(n));
  const settled = await Promise.allSettled(names.map((n) => SOURCES[n]()));
  const errors = {};
  const seen = new Map();
  settled.forEach((r, i) => {
    if (r.status === 'rejected') { errors[names[i]] = String(r.reason?.message || r.reason); return; }
    for (const h of r.value) {
      const k = key(h.title) || h.id;
      const prev = seen.get(k);
      // Same event listed twice: keep the listing that knows more.
      if (!prev || (prev.registrations ?? -1) < (h.registrations ?? -1)) seen.set(k, prev ? { ...h, alsoOn: [...(prev.alsoOn || []), prev.source] } : h);
    }
  });
  return { items: [...seen.values()], errors, fetchedAt: new Date().toISOString() };
}

// Adds place, score, tier and the verdict sentence, then sorts best first.
export function rank(items, prefs = DEFAULT_PREFS, now = Date.now()) {
  return items
    .map((h) => {
      const place = classifyPlace(h);
      const s = scoreHackathon(h, prefs, now);
      return { ...h, place, placeLabel: PLACE_LABEL[place], where: placeText(h, place), score: s, tier: tier(s.total), verdict: verdict(h, s), ok: passes(h, s, place, prefs) };
    })
    .sort((a, b) => b.score.total - a.score.total);
}
