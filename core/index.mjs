import { SOURCES, fetchDescription } from './sources.mjs';
import { classifyPlace, classifyKind, scoreHackathon, passes, tier, verdict, placeText, DEFAULT_PREFS, MODE_LABEL, REGION_LABEL, KIND_LABEL } from './score.mjs';

export * from './score.mjs';

const key = (t) => t.toLowerCase().replace(/\b20\d\d\b/g, '').replace(/[^a-z0-9]/g, '');

// Fetch every source; a source that fails is reported, never fatal.
// `previous` is the last result, so descriptions fetched once are reused.
export async function collect({ only, previous = [] } = {}) {
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
      if (!prev || (prev.registrations ?? -1) < (h.registrations ?? -1)) seen.set(k, prev ? { ...h, blurb: h.blurb || prev.blurb, alsoOn: [...(prev.alsoOn || []), prev.source] } : h);
    }
  });
  const items = [...seen.values()];
  await describe(items, previous);
  return { items, errors, fetchedAt: new Date().toISOString() };
}

// Listings without a description get the one from the event's own page,
// at most 60 new fetches a run, four at a time.
async function describe(items, previous) {
  const known = new Map(previous.filter((h) => h.blurb).map((h) => [h.id, h.blurb]));
  const todo = [];
  for (const h of items) {
    if (h.blurb) continue;
    if (known.has(h.id)) h.blurb = known.get(h.id);
    else todo.push(h);
  }
  const queue = todo.slice(0, 60);
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let h; (h = queue.shift()); ) h.blurb = await fetchDescription(h.url).catch(() => '');
  }));
}

// Adds place, score, tier and the verdict sentence, then sorts best first.
export function rank(items, prefs = DEFAULT_PREFS, now = Date.now()) {
  return items
    .map((h) => {
      const place = classifyPlace(h);
      const s = scoreHackathon(h, prefs, now);
      const kind = classifyKind(h);
      return {
        ...h,
        kind,
        kindLabel: KIND_LABEL[kind],
        place,
        modeLabel: MODE_LABEL[place.mode],
        regionLabel: place.region ? REGION_LABEL[place.region] : '',
        where: placeText(h, place),
        score: s,
        tier: tier(s.total),
        verdict: verdict(h, s),
        ok: passes(h, s, place, prefs),
      };
    })
    .sort((a, b) => b.score.total - a.score.total);
}
