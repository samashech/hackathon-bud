// Location rules and the worthiness score. Everything a person might want to
// tune lives in DEFAULT_PREFS so the website, extension and digest share it.

export const DEFAULT_PREFS = {
  // India, offline: north India or Bengaluru. Abroad: online only.
  allowOtherIndia: false,
  cashOnly: true,
  minScore: 0,
  interests: ['AI', 'Machine Learning', 'Generative AI', 'Linux', 'Open Source', 'Voice', 'Accessibility', 'Social Good', 'Web'],
};

// Approximate rates, only used to put prizes on one scale.
const TO_INR = { INR: 1, USD: 88, EUR: 95, GBP: 112 };

const NORTH_STATES = ['delhi', 'nct', 'haryana', 'punjab', 'chandigarh', 'uttar pradesh', 'uttarakhand', 'himachal', 'jammu', 'kashmir', 'ladakh', 'rajasthan'];
const NORTH_CITIES = ['delhi', 'new delhi', 'noida', 'greater noida', 'gurugram', 'gurgaon', 'faridabad', 'ghaziabad', 'sonipat', 'sonepat', 'chandigarh', 'mohali', 'panchkula', 'jaipur', 'jodhpur', 'udaipur', 'kota', 'lucknow', 'kanpur', 'prayagraj', 'allahabad', 'varanasi', 'agra', 'mathura', 'meerut', 'dehradun', 'roorkee', 'haridwar', 'shimla', 'mandi', 'hamirpur', 'jammu', 'srinagar', 'amritsar', 'ludhiana', 'jalandhar', 'patiala', 'kurukshetra', 'rohtak', 'hisar', 'pilani', 'bareilly', 'aligarh', 'gorakhpur', 'pantnagar'];

const BIG_NAMES = /\b(google|microsoft|amazon|aws|meta|apple|nvidia|intel|ibm|openai|anthropic|paypal|flipkart|walmart|adobe|salesforce|atlassian|oracle|samsung|qualcomm|cisco|github|gitlab|mongodb|vercel|cloudflare|tata|infosys|wipro|reliance|jio|zomato|swiggy|razorpay|phonepe|paytm|cred|polygon|solana|ethereum|smart india|sih|government|ministry|isro|drdo|iit\b|iiit|nit\b|bits|iisc|iim|nasa|mlh|major league hacking)/i;

const norm = (s = '') => s.toLowerCase();

export function classifyPlace(h) {
  if (h.mode === 'online') return 'online';
  const where = norm(`${h.city} ${h.state} ${h.location} ${h.country}`);
  const inIndia = /india/.test(where) || (!h.country && h.source === 'Unstop') || (h.country === '' && h.source === 'Devfolio');
  if (/bengaluru|bangalore/.test(where)) return 'bangalore';
  if (inIndia && (NORTH_STATES.some((s) => norm(h.state).includes(s)) || NORTH_CITIES.some((c) => new RegExp(`\\b${c}\\b`).test(where)))) return 'north';
  // Hybrid elsewhere still lets you take part online.
  if (h.mode === 'hybrid') return 'hybrid';
  return inIndia ? 'india-other' : 'abroad';
}

export const PLACE_LABEL = { online: 'Online', hybrid: 'Hybrid', north: 'North India', bangalore: 'Bengaluru', 'india-other': 'Elsewhere in India', abroad: 'Abroad, in person' };

// "Hybrid, finale in Chennai" reads better than "Hybrid".
export function placeText(h, place) {
  const city = (h.city || '').trim();
  if (place === 'online') return 'Online';
  if (place === 'hybrid') return city ? `Hybrid, finale in ${city}` : 'Hybrid';
  const where = city || PLACE_LABEL[place];
  return h.mode === 'hybrid' ? `${where}, or online` : where;
}

export function prizeInINR(h) {
  if (!h.prize?.amount) return 0;
  return Math.round(h.prize.amount * (TO_INR[h.prize.currency] || 88));
}

const clamp = (x) => Math.max(0, Math.min(1, x));
const logScale = (n, lo, hi) => (n > 0 ? clamp((Math.log10(n) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) : 0);

export function daysLeft(h, now = Date.now()) {
  if (!h.regEnds) return null;
  return Math.ceil((new Date(h.regEnds).getTime() - now) / 864e5);
}

// Returns 0 to 100 plus the parts, so the UI can say why.
export function scoreHackathon(h, prefs = DEFAULT_PREFS, now = Date.now()) {
  const inr = prizeInINR(h);
  const crowd = h.registrations == null ? (h.signals?.mlh ? 0.55 : 0.2) : logScale(h.registrations, 20, 20000);
  const prize = logScale(inr, 5000, 5e6);

  let pedigree = 0;
  if (BIG_NAMES.test(`${h.organiser} ${h.title}`)) pedigree += 0.5;
  if (h.signals?.mlh) pedigree += 0.45;
  if (h.signals?.featured || h.signals?.official) pedigree += 0.3;
  if (h.signals?.managed || h.signals?.verified) pedigree += 0.2;
  if (h.views) pedigree += 0.3 * logScale(h.views, 500, 100000);
  pedigree = clamp(pedigree);

  const d = daysLeft(h, now);
  const runway = d == null ? 0.6 : d < 0 ? 0 : d <= 2 ? 0.35 : d <= 45 ? 1 : 0.75;

  const themeText = norm(`${h.title} ${h.blurb} ${(h.themes || []).join(' ')}`);
  const matched = (prefs.interests || []).filter((i) => new RegExp(`\\b${i.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(themeText));
  const fit = clamp(matched.length / 2);

  const total = Math.round(100 * (0.34 * crowd + 0.34 * prize + 0.2 * pedigree + 0.07 * runway + 0.05 * fit));
  return { total, parts: { crowd, prize, pedigree, runway, fit }, inr, daysLeft: d, matched };
}

export function tier(score) {
  if (score >= 70) return { key: 'marquee', label: 'Marquee' };
  if (score >= 52) return { key: 'strong', label: 'Strong' };
  if (score >= 35) return { key: 'decent', label: 'Decent' };
  return { key: 'thin', label: 'Thin' };
}

const fmtINR = (n) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(1).replace(/\.0$/, '')} crore` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1).replace(/\.0$/, '')} lakh` : `₹${n.toLocaleString('en-IN')}`);
export const formatINR = fmtINR;

// One plain sentence that gives the "is this worth it" feeling.
export function verdict(h, s) {
  const bits = [];
  if (h.registrations != null) bits.push(`${h.registrations.toLocaleString('en-IN')} people have registered`);
  else if (h.signals?.mlh) bits.push('it is an official MLH event');
  if (s.inr) {
    const native = h.prize.currency !== 'INR' ? ` (${h.prize.currency} ${h.prize.amount.toLocaleString('en-US')})` : '';
    bits.push(`${fmtINR(s.inr)}${native} in cash is on the table`);
  } else bits.push('no cash prize is listed');
  let line = bits.join(' and ');
  line = line[0].toUpperCase() + line.slice(1) + '.';
  if (BIG_NAMES.test(h.organiser) && h.organiser) line += ` Run by ${h.organiser}.`;
  if (s.matched.length) line += ` Touches ${s.matched.slice(0, 2).join(' and ')}.`;
  return line;
}

export function passes(h, s, place, prefs = DEFAULT_PREFS) {
  if (place === 'abroad') return false;
  if (place === 'india-other' && !prefs.allowOtherIndia) return false;
  if (prefs.cashOnly && !s.inr) return false;
  if (s.daysLeft != null && s.daysLeft < 0) return false;
  return s.total >= (prefs.minScore || 0);
}
