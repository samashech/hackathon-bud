// Location rules and the worthiness score. Everything a person might want to
// tune lives in DEFAULT_PREFS so the website, extension and digest share it.

export const DEFAULT_PREFS = {
  // Online events from anywhere; in-person events anywhere in India.
  // region narrows in-person events to one part of India ('any' keeps all).
  region: 'any',
  onlineOnly: false,
  // Ideathons (pitch an idea, no build) and promptathons (prompt-writing
  // contests) are kept apart from hackathons; add them here to include them.
  kinds: ['hackathon'],
  cashOnly: true,
  minScore: 0,
  interests: ['AI', 'Machine Learning', 'Generative AI', 'Linux', 'Open Source', 'Voice', 'Accessibility', 'Social Good', 'Web'],
};

// Approximate rates, only used to put prizes on one scale.
const TO_INR = { INR: 1, USD: 88, EUR: 95, GBP: 112 };

const REGIONS = {
  north: {
    states: ['delhi', 'nct', 'haryana', 'punjab', 'chandigarh', 'uttar pradesh', 'uttarakhand', 'himachal', 'jammu', 'kashmir', 'ladakh', 'rajasthan'],
    cities: ['delhi', 'new delhi', 'noida', 'greater noida', 'gurugram', 'gurgaon', 'faridabad', 'ghaziabad', 'sonipat', 'sonepat', 'panipat', 'chandigarh', 'mohali', 'panchkula', 'jaipur', 'jodhpur', 'udaipur', 'kota', 'lucknow', 'kanpur', 'prayagraj', 'allahabad', 'varanasi', 'agra', 'mathura', 'meerut', 'dehradun', 'roorkee', 'haridwar', 'shimla', 'mandi', 'hamirpur', 'jammu', 'srinagar', 'amritsar', 'ludhiana', 'jalandhar', 'patiala', 'kurukshetra', 'rohtak', 'hisar', 'pilani', 'bareilly', 'aligarh', 'gorakhpur', 'pantnagar'],
  },
  south: {
    states: ['karnataka', 'kerala', 'tamil nadu', 'andhra', 'telangana', 'puducherry', 'pondicherry'],
    cities: ['bengaluru', 'bangalore', 'mysuru', 'mysore', 'mangaluru', 'mangalore', 'manipal', 'hubli', 'chennai', 'coimbatore', 'madurai', 'vellore', 'trichy', 'tiruchirappalli', 'hyderabad', 'secunderabad', 'warangal', 'vijayawada', 'visakhapatnam', 'vizag', 'guntur', 'tirupati', 'kochi', 'cochin', 'thiruvananthapuram', 'trivandrum', 'kozhikode', 'calicut', 'thrissur', 'kollam', 'amaravati'],
  },
  west: {
    states: ['maharashtra', 'gujarat', 'goa'],
    cities: ['mumbai', 'navi mumbai', 'thane', 'pune', 'nagpur', 'nashik', 'aurangabad', 'kolhapur', 'ahmedabad', 'gandhinagar', 'surat', 'vadodara', 'rajkot', 'panaji'],
  },
  east: {
    states: ['west bengal', 'odisha', 'orissa', 'bihar', 'jharkhand', 'assam', 'meghalaya', 'manipur', 'mizoram', 'nagaland', 'tripura', 'sikkim', 'arunachal'],
    cities: ['kolkata', 'durgapur', 'kharagpur', 'siliguri', 'bhubaneswar', 'cuttack', 'rourkela', 'patna', 'ranchi', 'jamshedpur', 'dhanbad', 'guwahati', 'shillong', 'silchar', 'agartala', 'imphal', 'gangtok'],
  },
  central: {
    states: ['madhya pradesh', 'chhattisgarh'],
    cities: ['bhopal', 'indore', 'gwalior', 'jabalpur', 'ujjain', 'raipur', 'bilaspur', 'bhilai'],
  },
};
export const REGION_LABEL = { north: 'North India', south: 'South India', west: 'West India', east: 'East India', central: 'Central India' };

const BIG_NAMES = /\b(google|microsoft|amazon|aws|meta|apple|nvidia|intel|ibm|openai|anthropic|paypal|flipkart|walmart|adobe|salesforce|atlassian|oracle|samsung|qualcomm|cisco|github|gitlab|mongodb|vercel|cloudflare|tata|infosys|wipro|reliance|jio|zomato|swiggy|razorpay|phonepe|paytm|cred|polygon|solana|ethereum|smart india|sih|government|ministry|isro|drdo|iit\b|iiit|nit\b|bits|iisc|iim|nasa|mlh|major league hacking)/i;

const norm = (s = '') => s.toLowerCase();
const word = (w, text) => new RegExp(`\\b${w}\\b`).test(text);

function regionOf(h) {
  const state = norm(h.state);
  const where = norm(`${h.city} ${h.state} ${h.location}`);
  for (const [r, { states }] of Object.entries(REGIONS)) if (states.some((s) => state.includes(s))) return r;
  for (const [r, { states, cities }] of Object.entries(REGIONS)) if (cities.some((c) => word(c, where)) || states.some((s) => word(s, where))) return r;
  return null;
}

// Where an event happens, as { mode, region, inIndia }:
// mode is online, hybrid or in-person; region is one of REGIONS or null.
export function classifyPlace(h) {
  if (h.mode === 'online') return { mode: 'online', region: null, inIndia: false };
  const where = norm(`${h.city} ${h.state} ${h.location} ${h.country}`);
  const region = regionOf(h);
  const inIndia = /india/.test(where) || !!region || (!h.country && (h.source === 'Unstop' || h.source === 'Devfolio'));
  return { mode: h.mode === 'hybrid' ? 'hybrid' : 'in-person', region, inIndia };
}

// "Hybrid, finale in Chennai" reads better than "Hybrid".
export function placeText(h, place) {
  const city = (h.city || '').trim();
  if (place.mode === 'online') return 'Online';
  const where = city || (place.region ? REGION_LABEL[place.region] : h.country || 'In person');
  return place.mode === 'hybrid' ? `${where}, or online` : where;
}

// What kind of event a listing really is. The title decides when it is clear;
// otherwise the description does. Sites file all three under "hackathons".
const PROMPT = /\bprompt[\s-]?(a?thon|engineering|battle|war|wars|challenge|craft|olympiad)\b|\bpromptathon\b/i;
const IDEA = /\bidea[\s-]?a?thon\b|\bideation\b|\bidea (pitch|pitching|challenge|competition|contest|fest|storm)\b|\bpitch(ing)? (competition|contest|battle|fest)\b|\bcase (study )?(competition|challenge)\b|\bb-?plan\b|\bbusiness plan\b|\bshark tank\b/i;
const BUILD = /\b(hack|hackathon|hacks|buildathon|build-?a-?thon|datathon|devathon|codeathon|makeathon|hackfest)\b/i;
export function classifyKind(h) {
  const title = h.title || '';
  if (PROMPT.test(title)) return 'promptathon';
  if (IDEA.test(title)) return 'ideathon';
  if (BUILD.test(title)) return 'hackathon';
  const text = `${h.blurb || ''} ${(h.themes || []).join(' ')}`;
  if (PROMPT.test(text)) return 'promptathon';
  if (/\bidea[\s-]?a?thon\b/i.test(text)) return 'ideathon';
  return 'hackathon';
}
export const KIND_LABEL = { hackathon: 'Hackathon', ideathon: 'Ideathon', promptathon: 'Promptathon' };

// Whether an event ties you to a sponsor's product.
//   tool     the listing says to build on or with a named product ("Build on Forge")
//   company  a company runs it under its own name ("PayPal AI Hackathon"), which
//            usually means building on that company's platform. Counted only for
//            Devpost-managed challenges (Devpost's sponsor-run tier) or well-known
//            companies, since small organisers name events after themselves too.
//   open     colleges, communities, MLH: bring your own stack
// Only the title and description are read, so a sponsor that is not named
// there is missed; the tag errs toward "open".
const GENERIC = new Set(['AI', 'ML', 'GenAI', 'Gen', 'Generative', 'Agentic', 'Agents', 'Technology', 'Tech', 'Code', 'Python', 'Java', 'JavaScript', 'TypeScript', 'React', 'Web', 'Web3', 'Blockchain', 'Data', 'Context', 'Purpose', 'Impact', 'India', 'Indian', 'Real', 'Open', 'Friends', 'Us', 'The', 'Your', 'Our', 'It', 'Me', 'IoT', 'AR', 'VR', 'XR', 'Cloud', 'LLMs', 'LLM', 'APIs', 'API', 'Innovation', 'Ideas', 'Students', 'Developers', 'Builders', 'Bharat', 'Space', 'Health', 'Fintech', 'Climate', 'Love', 'Passion', 'Confidence', 'Speed', 'Style', 'Artificial', 'Intelligence', 'Machine', 'Learning', 'Deep', 'CTF', 'Website', 'Link', 'Official', 'Registration', 'Python3', 'GitHub', 'Git']);
const TOOL_PATTERNS = [
  /\b[Bb]uil[dt](?:ing)?\s+(?:on|with|using)\s+([A-Z][\w+-]*(?:\.[a-z]{2,4})?(?: [A-Z][\w+-]*(?:\.[a-z]{2,4})?)?)/,
  /\b(?:[Pp]ublish(?:ed)?\s+(?:it\s+|It\s+)?on|[Pp]owered\s+by|[Uu]sing|[Oo]n\s+top\s+of|[Ss]kills\s+to|[Ii]ntegrat\w*\s+with|[Ee]xtend)\s+([A-Z][\w+-]*(?:\.[a-z]{2,4})?(?: [A-Z][\w+-]*(?:\.[a-z]{2,4})?)?)/,
  /\b([A-Z][\w+-]+)\s+(?:SDK|APIs?|[Dd]eveloper\s+[Pp]latform)\b/,
  /\b(?:[Ll]earn|[Hh]ack|[Cc]reate)\s+\w+\s+with\s+([A-Z][A-Z0-9]{2,})\b/,
];
const NOT_A_COMPANY = /\b(university|college|institute|iit|nit|iiit|bits|school|vidyalaya|academy|gdg|google developer|student|club|chapter|society|community|association|council|cell|forum|ieee|acm|mlh|major league hacking|devpost|unstop|devfolio|hackclub|hack club)\b/i;
const ORG_STOP = new Set(['hack', 'hacks', 'hackathon', 'community', 'club', 'labs', 'lab', 'tech', 'team', 'foundation', 'the', 'global', 'india', 'limited', 'ltd', 'pvt', 'private', 'inc', 'technology', 'technologies', 'solutions', 'group', 'and', 'for', 'build', 'builders', 'makers', 'more', 'need', 'kong', 'hong']);
const productOf = (m) => {
  const words = m.split(/\s+/).filter((w) => !GENERIC.has(w.replace(/[.,]$/, '')));
  return words.length ? words.join(' ').replace(/[.,]$/, '') : '';
};
export function classifyStack(h) {
  const title = h.title || '';
  const text = `${title}. ${h.blurb || ''}`;
  for (const re of TOOL_PATTERNS) {
    const m = text.match(re);
    const product = m && productOf(m[1]);
    if (product) {
      const org = (h.organiser || '').trim();
      return { kind: 'tool', name: product, label: `Uses ${product}${org && !NOT_A_COMPANY.test(org) && !product.toLowerCase().includes(org.toLowerCase().split(/\s+/)[0]) ? ` (${org.split(/[\s(]/)[0]})` : ''}` };
    }
  }
  const org = (h.organiser || '').trim();
  if (org && !NOT_A_COMPANY.test(org)) {
    const tokens = org.split(/[^A-Za-z0-9]+/).filter((t) => t.length >= 3 && !ORG_STOP.has(t.toLowerCase()));
    const lowerTitle = title.toLowerCase();
    // The org's name opening a word of the title: "Kiroween" for Kiro, "PayPal AI Hackathon" for PayPal.
    const hit = tokens.find((t) => new RegExp(`\\b${t.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(lowerTitle));
    // An organiser named after its own event ("Goa Buildathon") is not a sponsor.
    const selfNamed = lowerTitle.startsWith(org.toLowerCase()) && /hack|thon|fest|summit|conf/i.test(org);
    const sponsorRun = h.signals?.managed || BIG_NAMES.test(org);
    if (hit && !selfNamed && sponsorRun) return { kind: 'company', name: org, label: `Run by ${org.split(/\s+\(/)[0]}` };
  }
  return { kind: 'open', name: '', label: 'Open stack' };
}
export const STACK_LABEL = { tool: 'Sponsor tool', company: 'Company platform', open: 'Open stack' };

export const MODE_LABEL = { online: 'Online', hybrid: 'Hybrid', 'in-person': 'In person' };

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
  if (prefs.stack === 'open' && classifyStack(h).kind !== 'open') return false;
  if (prefs.stack === 'sponsored' && classifyStack(h).kind === 'open') return false;
  if (prefs.kinds && !prefs.kinds.includes(classifyKind(h))) return false;
  // Abroad, only events you can join online.
  if (place.mode === 'in-person' && !place.inIndia) return false;
  if (prefs.onlineOnly && place.mode === 'in-person') return false;
  if (prefs.region && prefs.region !== 'any' && place.mode === 'in-person' && place.region !== prefs.region) return false;
  if (prefs.cashOnly && !s.inr) return false;
  if (s.daysLeft != null && s.daysLeft < 0) return false;
  return s.total >= (prefs.minScore || 0);
}
