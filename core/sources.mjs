// Fetchers for each hackathon listing site. Each returns raw records normalised
// into one shape; scoring and location rules live in score.mjs.
// Pure fetch + regex so the same file runs in Node, a browser extension
// service worker, and anywhere else with a global fetch.

const UA = 'Mozilla/5.0 (X11; Linux x86_64) HackathonBud/1.0';

async function getJSON(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, Accept: 'application/json', ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const ENTITIES = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', bull: '•', rarr: '→', middot: '·', copy: '©', reg: '®', trade: '™', rupee: '₹', inr: '₹' };
const stripTags = (s = '') =>
  s.replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ').trim();

// Markdown to plain text, enough for a two-line summary.
const stripMarkdown = (s = '') =>
  s.replace(/```[\s\S]*?```/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#+\s.*$/gm, ' ').replace(/[*_`>#|~-]+/g, ' ').replace(/\s+/g, ' ').trim();

// The first sentence or two that says what the event is, up to about 220 characters.
const NOT_A_SUMMARY = /^(eligibility|rules?|note|prizes?|rewards?|registration|teams?|round|stage|timeline|important|dates?|venue|fee|contact|faq|guidelines|instructions|participation|who can)\b/i;

// The first sentence or two that says what the event is, up to about 220 characters.
// Sentences that are rules, prizes or dates are skipped, since the facts strip shows those.
export function summarise(text = '') {
  const t = text.replace(/^(about( the (event|hackathon|challenge|competition))?|overview|description|introduction)\s*:?\s*/i, '').trim();
  const sentences = t.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  const keep = [];
  for (const x of sentences) {
    if (!keep.length && (NOT_A_SUMMARY.test(x) || x.length < 25)) continue;
    if (keep.join(' ').length + x.length > 220) break;
    keep.push(x);
  }
  if (keep.length) return keep.join(' ');
  const first = sentences.find((x) => !NOT_A_SUMMARY.test(x)) || t;
  return first.length <= 220 ? first : `${first.slice(0, 217).replace(/\s+\S*$/, '')}…`;
}

// The description an event page gives search engines and link previews.
export async function fetchDescription(url) {
  if (!/^https:\/\//.test(url)) return '';
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(10000) });
  if (!res.ok) return '';
  const html = (await res.text()).slice(0, 200000);
  const m = html.match(/<meta[^>]+(?:property="og:description"|name="description")[^>]+content="([^"]*)"/i) || html.match(/<meta[^>]+content="([^"]*)"[^>]+(?:property="og:description"|name="description")/i);
  return m ? summarise(stripMarkdown(stripTags(m[1]))) : '';
}

// ---------- Unstop ----------
export async function fetchUnstop({ maxPages = 6 } = {}) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&page=${page}&per_page=50&oppstatus=open`;
    const { data } = await getJSON(url);
    for (const x of data.data) {
      const addr = x.address_with_country_logo || {};
      const cash = (x.prizes || []).reduce((sum, p) => sum + (Number(p.cash) || 0), 0);
      const usd = (x.prizes || []).some((p) => /dollar|usd/i.test(p.currency || ''));
      out.push({
        id: `unstop:${x.id}`,
        source: 'Unstop',
        title: x.title,
        organiser: x.organisation?.name || '',
        url: x.seo_url || `https://unstop.com/${x.public_url}`,
        mode: x.region === 'offline' ? 'offline' : x.region === 'hybrid' ? 'hybrid' : 'online',
        city: addr.city || '',
        state: addr.state || '',
        country: addr.country?.name || (x.region === 'online' ? '' : 'India'),
        location: [addr.address, addr.city, addr.state].filter(Boolean).join(', '),
        registrations: x.registerCount ?? null,
        views: x.viewsCount ?? null,
        prize: cash ? { amount: cash, currency: usd ? 'USD' : 'INR', text: '' } : null,
        regEnds: x.regnRequirements?.end_regn_dt || x.end_date || null,
        starts: x.start_date || null,
        themes: (x.workfunction || []).map((w) => w.name).concat((x.required_skills || []).map((s) => s.skill_name || s.skill)).filter(Boolean),
        signals: { featured: !!x.featured },
        blurb: summarise(stripTags(x.details)),
      });
    }
    if (page >= data.last_page) break;
  }
  return out;
}

// ---------- Devpost ----------
function parseDevpostDates(s = '') {
  // "Oct 01 - Nov 12, 2026" | "Nov 03 - 20, 2026" | "Dec 15, 2026 - Jan 10, 2027"
  const m = s.match(/^(\w{3}) (\d{1,2})(?:, (\d{4}))? - (?:(\w{3}) )?(\d{1,2}), (\d{4})$/);
  if (!m) return {};
  const [, m1, d1, y1, m2, d2, y2] = m;
  const end = new Date(`${m2 || m1} ${d2}, ${y2} 23:59:00`);
  const start = new Date(`${m1} ${d1}, ${y1 || y2}`);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function fetchDevpost({ maxPages = 15 } = {}) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const d = await getJSON(`https://devpost.com/api/hackathons?status[]=open&status[]=upcoming&page=${page}`);
    if (!d.hackathons?.length) break;
    for (const x of d.hackathons) {
      if (x.invite_only) continue;
      const loc = x.displayed_location?.location || '';
      const online = /online/i.test(loc);
      const prizeText = stripTags(x.prize_amount || '');
      const amount = Number(prizeText.replace(/[^\d.]/g, '')) || 0;
      const currency = prizeText.startsWith('₹') ? 'INR' : prizeText.startsWith('€') ? 'EUR' : prizeText.startsWith('£') ? 'GBP' : 'USD';
      const dates = parseDevpostDates(x.submission_period_dates);
      out.push({
        id: `devpost:${x.id}`,
        source: 'Devpost',
        title: x.title,
        organiser: x.organization_name || '',
        url: x.url,
        mode: online ? 'online' : 'offline',
        city: online ? '' : loc.split(',')[0].trim(),
        state: '',
        country: online ? '' : loc.split(',').pop().trim(),
        location: loc,
        registrations: x.registrations_count ?? null,
        views: null,
        prize: amount && x.prizes_counts?.cash ? { amount, currency, text: prizeText } : null,
        regEnds: dates.end || null,
        starts: dates.start || null,
        themes: (x.themes || []).map((t) => t.name),
        signals: { featured: !!x.featured, managed: !!x.managed_by_devpost_badge },
        blurb: '',
      });
    }
    if (page * (d.meta?.per_page || 9) >= (d.meta?.total_count || 0)) break;
  }
  return out;
}

// ---------- Devfolio ----------
export async function fetchDevfolio() {
  const out = [];
  for (const type of ['application_open', 'upcoming']) {
    const d = await getJSON('https://api.devfolio.co/api/search/hackathons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, from: 0, size: 100 }),
    });
    for (const { _source: x } of d.hits?.hits || []) {
      const s = x.hackathon_setting || {};
      const prizeText = (x.prizes || []).map((p) => `${p.name}: ${p.desc || ''}`).join(' | ');
      out.push({
        id: `devfolio:${x.uuid}`,
        source: 'Devfolio',
        title: x.name,
        organiser: x.hosted_by || '',
        url: s.external_apply_url || `https://${s.subdomain || x.slug}.devfolio.co`,
        mode: x.is_online ? 'online' : 'offline',
        city: x.city || '',
        state: x.state || '',
        country: x.country || '',
        location: x.location || [x.city, x.state, x.country].filter(Boolean).join(', '),
        registrations: x.participants_count ?? null,
        views: null,
        prize: parsePrizeText(prizeText),
        regEnds: s.reg_ends_at || null,
        starts: x.starts_at || null,
        themes: (x.themes || []).map((t) => t.name || t).filter((t) => typeof t === 'string'),
        signals: { verified: !!x.verified, official: !!x.devfolio_official, featured: !!x.featured },
        blurb: summarise(stripMarkdown(x.desc || '')) || x.tagline || '',
      });
    }
  }
  return out;
}

// Pulls money out of free text like "1st: ₹25,000 | 2nd: ₹15,000" or "Prize pool of 1.5 Lakh".
export function parsePrizeText(text = '') {
  if (!text) return null;
  const re = /(₹|rs\.?|inr|\$|usd)\s*([\d,]+(?:\.\d+)?)\s*(k|l|lakh|lakhs|lac|cr|crore)?\b|([\d,]+(?:\.\d+)?)\s*(k|l|lakh|lakhs|lac|cr|crore)?\s*(₹|rs\.?|inr|rupees|usd|dollars)/gi;
  const mult = { k: 1e3, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, cr: 1e7, crore: 1e7 };
  let inr = 0, usd = 0, max = 0;
  for (const m of text.matchAll(re)) {
    const cur = (m[1] || m[6] || '').toLowerCase();
    const n = Number((m[2] || m[4]).replace(/,/g, '')) * (mult[(m[3] || m[5] || '').toLowerCase()] || 1);
    if (!n || n < 100) continue;
    if (cur === '$' || cur.startsWith('usd') || cur === 'dollars') usd += n; else inr += n;
    max = Math.max(max, n);
  }
  // A stated total/pool already contains the per-rank amounts listed beside it.
  if (/total|pool|worth/i.test(text) && max) {
    const isUsd = usd > inr;
    return { amount: max, currency: isUsd ? 'USD' : 'INR', text: '' };
  }
  if (inr) return { amount: inr, currency: 'INR', text: '' };
  if (usd) return { amount: usd, currency: 'USD', text: '' };
  return null;
}

// ---------- MLH ----------
export async function fetchMLH() {
  const year = new Date().getMonth() >= 6 ? new Date().getFullYear() + 1 : new Date().getFullYear();
  const res = await fetch(`https://mlh.io/seasons/${year}/events`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} mlh`);
  const html = await res.text();
  const out = [];
  const blocks = html.split('itemType="https://schema.org/Event"').slice(1);
  for (const b of blocks) {
    const meta = (p) => (b.match(new RegExp(`itemProp="${p}" content="([^"]*)"`)) || [])[1] || '';
    const url = meta('url');
    const title = stripTags((b.match(/<h4[^>]*>([\s\S]*?)<\/h4>/) || [])[1] || '');
    if (!url || !title) continue;
    const online = /Online/.test(meta('eventAttendanceMode'));
    const hybrid = /Mixed/.test(meta('eventAttendanceMode'));
    const city = meta('addressLocality'), region = meta('addressRegion'), country = meta('addressCountry');
    out.push({
      id: `mlh:${url.replace(/\W+/g, '-')}`,
      source: 'MLH',
      title,
      organiser: 'Major League Hacking',
      url,
      mode: online ? 'online' : hybrid ? 'hybrid' : 'offline',
      city: online ? '' : city,
      state: region,
      country: country === 'IN' ? 'India' : country,
      location: online ? 'Online' : [city, region].filter(Boolean).join(', '),
      registrations: null,
      views: null,
      prize: null,
      regEnds: meta('startDate') || null,
      starts: meta('startDate') || null,
      themes: [],
      signals: { mlh: true },
      blurb: '',
    });
  }
  return out;
}

export const SOURCES = { Unstop: fetchUnstop, Devpost: fetchDevpost, Devfolio: fetchDevfolio, MLH: fetchMLH };
