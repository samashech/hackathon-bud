// Server-rendered HTML: the live parts of the landing page, and the small
// pages behind the confirm and unsubscribe links.
import { formatINR, REGION_LABEL } from '../core/index.mjs';
import { esc } from './email.mjs';

const safeUrl = (u) => (/^https?:\/\//.test(u || '') ? u : '#');

export function regionOptions(selected = 'any') {
  const opts = [['any', 'Anywhere in India, and online'], ['online', 'Online only'], ...Object.entries(REGION_LABEL).map(([k, v]) => [k, `${v}, and online`])];
  return opts.map(([v, l]) => `<option value="${v}"${v === selected ? ' selected' : ''}>${esc(l)}</option>`).join('');
}

export function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  return h < 36 ? `${h} hour${h === 1 ? '' : 's'} ago` : `${Math.round(h / 24)} days ago`;
}

const daysText = (d) => (d == null ? 'Not listed' : d <= 0 ? 'Today' : `${d} day${d === 1 ? '' : 's'}`);

export function issueRows(list) {
  return list.map((h) => `
    <li>
      <span class="score">${h.score.total}</span>
      <span class="t">${esc(h.title)}</span>
      ${h.blurb ? `<span class="b">${esc(h.blurb)}</span>` : ''}
      <span class="f"><span class="measured">${h.score.inr ? esc(formatINR(h.score.inr)) : 'No cash'}</span> prize, <span class="measured">${h.registrations != null ? h.registrations.toLocaleString('en-IN') : 'unknown'}</span> registered, ${esc(h.modeLabel.toLowerCase())}</span>
    </li>`).join('');
}

export function topRows(list) {
  return list.map((h, i) => `
    <li class="hk${i === 0 ? ' hk--lead' : ''}">
      <div class="hk__score">${h.score.total}<span class="hk__tier">${h.tier.label}</span></div>
      <div>
        <h3>${esc(h.title)}</h3>
        <p class="hk__org">${esc(h.organiser || h.source)}, on ${esc(h.source)}</p>
        ${h.blurb ? `<p class="hk__blurb">${esc(h.blurb)}</p>` : ''}
        <dl class="hk__facts">
          <div><dt>Mode</dt><dd class="word">${esc(h.modeLabel)}</dd></div>
          <div><dt>Location</dt><dd class="word">${esc(h.place.mode === 'online' ? 'Anywhere' : h.where)}</dd></div>
          <div><dt>Prize pool</dt><dd>${h.score.inr ? esc(formatINR(h.score.inr)) : 'Not listed'}</dd></div>
          <div><dt>Registered</dt><dd>${h.registrations != null ? h.registrations.toLocaleString('en-IN') : 'Not shown'}</dd></div>
          <div><dt>Closes in</dt><dd${h.score.daysLeft != null && h.score.daysLeft <= 3 ? ' class="soon"' : ''}>${daysText(h.score.daysLeft)}</dd></div>
        </dl>
      </div>
      <a class="btn btn--small hk__go" href="${esc(safeUrl(h.url))}" target="_blank" rel="noopener">Register on ${esc(h.source)}</a>
    </li>`).join('');
}

// A one-message page in the landing page's style.
export function messagePage({ title, body, action = '' }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="robots" content="noindex"><link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Host+Grotesk:wght@400;500&family=Atkinson+Hyperlegible+Mono:wght@400;500&family=Archivo:wdth,wght@125,800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/landing.css"></head><body>
<header class="nav"><div class="container nav__inner"><a class="mark" href="/" aria-label="Hackathon-bud, home">Hackath<span class="o">o</span>n<span class="dash">-</span>bud</a><a href="/explore">All hackathons</a></div></header>
<main class="section"><div class="container" style="max-width:44rem;margin-inline:0 auto"><h1 style="font-size:var(--text-section)">${esc(title)}</h1><p class="lead" style="margin-top:var(--space-lg)">${body}</p>${action ? `<div style="margin-top:var(--space-xl)">${action}</div>` : ''}</div></main>
</body></html>`;
}
