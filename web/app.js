import { rank, formatINR, DEFAULT_PREFS } from './core/index.mjs';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (u) => (/^https?:\/\//.test(u || '') ? u : '#');

// ---------- per-device memory ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(`bud.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`bud.${k}`, JSON.stringify(v)); } catch {} },
};
let prefs = { ...DEFAULT_PREFS, ...store.get('prefs', {}) };
const shortlist = new Set(store.get('shortlist', []));
const hidden = new Set(store.get('hidden', []));
const lastVisit = store.get('lastVisit', null);
let data = null;
let ranked = [];

// ---------- URL is the state ----------
const params = () => new URLSearchParams(location.search);
function setParam(k, v, push = false) {
  const p = params();
  if (v == null || v === '' || v === false) p.delete(k); else p.set(k, v === true ? '1' : v);
  const url = `${location.pathname}${p.toString() ? `?${p}` : ''}`;
  push ? history.pushState(null, '', url) : history.replaceState(null, '', url);
}
function readState() {
  const p = params();
  return {
    view: p.get('view') || 'ranked',
    where: p.get('where') || 'any',
    kind: p.get('kind') || 'hackathon',
    stack: p.get('stack') || 'any',
    depth: p.get('depth') || 'strong',
    cash: p.get('cash') !== '0',
    sort: p.get('sort') || 'score',
    q: p.get('q') || '',
    id: p.get('id') || '',
  };
}

// ---------- formatting ----------
const fmtCount = (n) => (n == null ? '<span class="dim">Not shown</span>' : n.toLocaleString('en-IN'));
const fmtPrize = (h) => (h.score.inr ? esc(formatINR(h.score.inr)) : '<span class="dim">Not listed</span>');
function fmtDays(d) {
  if (d == null) return '<span class="dim">Not listed</span>';
  if (d <= 0) return '<span class="soon">Today</span>';
  if (d === 1) return '<span class="soon">1 day</span>';
  return `<span${d <= 3 ? ' class="soon"' : ''}>${d} days</span>`;
}
function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return `${Math.round(h / 24)} days ago`;
}
const isNew = (h) => lastVisit && h.firstSeen > lastVisit;

// ---------- data ----------
async function load() {
  setBusy(true);
  try {
    const res = await fetch(`data/hackathons.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`The data file answered ${res.status}.`);
    data = await res.json();
    rerank();
  } catch (err) {
    showError(err);
  } finally {
    setBusy(false);
  }
}

function rerank() {
  const s = readState();
  ranked = rank(data.items, { ...prefs, cashOnly: s.cash, onlineOnly: s.where === 'online', region: s.where === 'online' ? 'any' : s.where, kinds: s.kind === 'all' ? ['hackathon', 'ideathon', 'promptathon'] : [s.kind], stack: s.stack });
  render();
}

function visible() {
  const s = readState();
  const q = s.q.trim().toLowerCase();
  let list = ranked.filter((h) => {
    if (s.view === 'shortlist') return shortlist.has(h.id);
    if (s.view === 'hidden') return hidden.has(h.id);
    return h.ok && !hidden.has(h.id);
  });
  if (q) list = list.filter((h) => `${h.title} ${h.organiser} ${h.location} ${h.source}`.toLowerCase().includes(q));
  // The ranked list opens on Strong and Marquee; Decent and Thin wait behind
  // buttons. A search looks through everything.
  const pool = list;
  if (s.view === 'ranked' && !q) list = list.filter((h) => h.score.total >= DEPTH_MIN[s.depth]);
  const by = {
    score: (a, b) => b.score.total - a.score.total,
    closing: (a, b) => (a.score.daysLeft ?? 1e9) - (b.score.daysLeft ?? 1e9),
    prize: (a, b) => b.score.inr - a.score.inr,
    crowd: (a, b) => (b.registrations ?? -1) - (a.registrations ?? -1),
    new: (a, b) => (b.firstSeen || '').localeCompare(a.firstSeen || ''),
  }[s.sort] || ((a, b) => b.score.total - a.score.total);
  return { list: list.sort(by), pool };
}
const DEPTH_MIN = { strong: 52, decent: 35, all: 0 };

// ---------- one hackathon row ----------
function entry(h, s) {
  return `
      <li class="entry" data-id="${esc(h.id)}" aria-selected="${h.id === s.id}">
        <span class="entry__score">${h.score.total}<small>${h.tier.label}</small></span>
        <a class="entry__title" href="?id=${encodeURIComponent(h.id)}" data-open="${esc(h.id)}">${esc(h.title)}</a>
        <span class="entry__org">${esc(h.organiser || h.source)}, on ${esc(h.source)}${h.kind !== 'hackathon' ? `<span class="chip chip--cool">${esc(h.kindLabel)}</span>` : ''}${h.stack.kind !== 'open' ? `<span class="chip chip--sponsor" title="${h.stack.kind === 'tool' ? 'The listing says to build with this product' : 'A company challenge, usually built on its own platform'}">${esc(h.stack.label)}</span>` : ''}${isNew(h) ? '<span class="chip chip--new">new</span>' : ''}${shortlist.has(h.id) ? '<span class="chip">shortlisted</span>' : ''}</span>
        ${h.blurb ? `<p class="entry__blurb">${esc(h.blurb)}</p>` : ''}
        <dl class="facts-row">
          <div><dt>Mode</dt><dd class="word">${esc(h.modeLabel)}</dd></div>
          <div><dt>Location</dt><dd class="word">${esc(h.place.mode === 'online' ? 'Anywhere' : h.where)}</dd></div>
          <div><dt>Prize pool</dt><dd>${fmtPrize(h)}</dd></div>
          <div><dt>Registered</dt><dd>${fmtCount(h.registrations)}</dd></div>
          <div><dt>Closes in</dt><dd>${fmtDays(h.score.daysLeft)}</dd></div>
        </dl>
      </li>`;
}

// ---------- render ----------
function render() {
  const s = readState();
  const { list, pool } = visible();
  const okCount = ranked.filter((h) => h.ok && !hidden.has(h.id)).length;
  const strong = ranked.filter((h) => h.ok && !hidden.has(h.id) && h.score.total >= 52).length;
  const fresh = ranked.filter((h) => h.ok && !hidden.has(h.id) && isNew(h)).length;

  const noun = { hackathon: 'hackathons', ideathon: 'ideathons', promptathon: 'promptathons', all: 'events' }[s.kind] || 'hackathons';
  $('#headline').textContent = s.view === 'shortlist' ? `Your shortlist, ${shortlist.size} saved` : s.view === 'hidden' ? `${hidden.size} hidden` : `${strong} ${noun} worth your weekend`;
  $('#subline').textContent = s.view === 'ranked'
    ? `${okCount} match your rules, ${strong} score strong or better.${fresh ? ` ${fresh} are new since you last looked.` : ''}`
    : s.view === 'shortlist' ? 'Saved on this device only.' : 'Bring one back from its reading.';
  for (const a of document.querySelectorAll('.tabs a')) { if (a.dataset.view === s.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  $('[data-count="ranked"]').textContent = okCount;
  $('[data-count="shortlist"]').textContent = shortlist.size || '';
  $('[data-count="hidden"]').textContent = hidden.size || '';
  $('#status').textContent = data ? `Updated ${ago(data.fetchedAt)}` : '';

  const errs = Object.entries(data.errors || {});
  $('#sources').textContent = `From ${['Unstop', 'Devpost', 'Devfolio', 'MLH'].filter((x) => !data.errors?.[x]).join(', ')}.${errs.length ? ` Could not reach ${errs.map(([k]) => k).join(' and ')} on the last refresh.` : ''} Scores weigh registrations and cash prize most, then who runs it, time left and your interests.`;

  const rows = $('#rows');
  const notice = $('#notice');
  const ranking = s.view === 'ranked' && !s.q;
  if (!list.length) {
    rows.innerHTML = '';
    notice.innerHTML = s.view === 'shortlist'
      ? '<div class="notice"><h2>Nothing saved yet</h2><p>Open a hackathon and press Shortlist to keep it here.</p><a class="btn" href="?view=ranked">See the ranked list</a></div>'
      : s.view === 'hidden'
      ? '<div class="notice"><h2>Nothing hidden</h2><p>Hackathons you hide from the ranked list wait here.</p></div>'
      : ranking && pool.length
      ? `<div class="notice"><h2>Nothing ${s.depth === 'strong' ? 'Strong or Marquee' : 'Decent or better'} here</h2><p>${pool.length} weaker one${pool.length === 1 ? '' : 's'} fit${pool.length === 1 ? 's' : ''} these filters. Use the buttons below to see them.</p></div>`
      : `<div class="notice"><h2>No hackathon fits these filters</h2><p>${s.q ? `Nothing matches “${esc(s.q)}”.` : 'Try anywhere in India, or allow events without a listed cash prize.'}</p><button class="btn" type="button" data-reset>Clear filters</button></div>`;
    $('[data-reset]')?.addEventListener('click', () => { history.replaceState(null, '', `?view=${s.view}`); syncForm(); rerank(); });
  } else {
    notice.innerHTML = '';
    const ol = (items) => `<ol class="ledger">${items.map((h) => entry(h, s)).join('')}</ol>`;
    if (ranking && s.sort === 'score') {
      // New since the last visit first, then what closes within a week, then the rest.
      const fresh = list.filter(isNew);
      const week = list.filter((h) => !isNew(h) && h.score.daysLeft != null && h.score.daysLeft <= 7);
      const later = list.filter((h) => !fresh.includes(h) && !week.includes(h));
      const group = (title, items, note) => (items.length ? `<section class="group"><h2 class="group__head">${title} <span class="count">${items.length}</span></h2>${note ? `<p class="group__note">${note}</p>` : ''}${ol(items)}</section>` : '');
      rows.innerHTML = group('New since your last visit', fresh) + group('Closing this week', week, 'Registration ends within seven days.') + group(week.length || fresh.length ? 'Later' : 'Open now', later);
    } else {
      rows.innerHTML = ol(list);
    }
  }

  // Buttons that open the next tier down.
  const more = $('#more');
  if (ranking) {
    const decent = pool.filter((h) => h.score.total >= 35 && h.score.total < 52).length;
    const thin = pool.filter((h) => h.score.total < 35).length;
    const btn = (depth, label, primary) => `<button class="btn${primary ? '' : ' btn--quiet'}" type="button" data-depth="${depth}">${label}</button>`;
    more.innerHTML = s.depth === 'strong'
      ? `${decent ? btn('decent', `Show ${decent} Decent`, true) : ''}${thin || decent ? btn('all', `Show everything (${decent + thin} more)`) : ''}`
      : s.depth === 'decent'
      ? `${thin ? btn('all', `Show ${thin} Thin too`, true) : ''}${btn('strong', 'Only Strong and Marquee')}`
      : btn('strong', 'Only Strong and Marquee');
  } else more.innerHTML = '';
  renderReading(ranked.find((h) => h.id === s.id));
}

const PART_TEXT = {
  crowd: (h) => (h.registrations != null ? `${h.registrations.toLocaleString('en-IN')} registered` : h.signals?.mlh ? 'MLH does not publish sign-ups' : 'not published'),
  prize: (h) => (h.score.inr ? `${formatINR(h.score.inr)}${h.prize.currency !== 'INR' ? `, from ${h.prize.currency} ${h.prize.amount.toLocaleString('en-US')}` : ''}` : 'no cash prize listed'),
  pedigree: (h) => [h.signals?.mlh && 'MLH member event', (h.signals?.featured || h.signals?.official) && `featured on ${h.source}`, (h.signals?.verified || h.signals?.managed) && `verified by ${h.source}`, h.views && `${h.views.toLocaleString('en-IN')} views`].filter(Boolean).join(', ') || h.organiser || 'unknown organiser',
  runway: (h) => (h.score.daysLeft == null ? 'deadline not listed' : h.score.daysLeft <= 0 ? 'closes today' : `${h.score.daysLeft} days to register`),
  fit: (h) => (h.score.matched.length ? h.score.matched.join(', ') : 'none of your interests named'),
};
const PART_LABEL = { crowd: 'Crowd', prize: 'Cash', pedigree: 'Who runs it', runway: 'Time left', fit: 'Your interests' };
const WEIGHT = { crowd: 34, prize: 34, pedigree: 20, runway: 7, fit: 5 };

function renderReading(h) {
  const el = $('#reading');
  el.classList.toggle('is-open', !!h);
  document.body.style.overflow = h && matchMedia('(max-width: 70rem)').matches ? 'hidden' : '';
  if (!h) {
    el.classList.add('reading--empty');
    const top = ranked.find((x) => x.ok && !hidden.has(x.id));
    el.innerHTML = `<div class="reading__top"><p>Pick a hackathon to see its reading: how many people signed up, what it pays, who runs it and how much time is left.${top ? ` The best one right now is <a href="?id=${encodeURIComponent(top.id)}" data-open="${esc(top.id)}">${esc(top.title)}</a>.` : ''}</p></div>`;
    return;
  }
  el.classList.remove('reading--empty');
  const saved = shortlist.has(h.id), gone = hidden.has(h.id);
  const closes = h.regEnds ? new Date(h.regEnds).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'not listed';
  el.innerHTML = `
    <div class="reading__top">
      <button class="btn btn--quiet reading__back" type="button" data-close>Back to the list</button>
      <div>
        <h2>${esc(h.title)}</h2>
        <p class="reading__org">${esc(h.organiser || 'Organiser not listed')}, on ${esc(h.source)}${h.alsoOn?.length ? ` and ${esc(h.alsoOn.join(', '))}` : ''}</p>
      </div>
      <div class="reading__value">
        <span class="reading-num">${h.score.total}</span><span class="of">of 100</span>
        <span class="tier">${h.tier.label}</span>
      </div>
      ${h.blurb ? `<p class="reading__blurb">${esc(h.blurb)}</p>` : ''}
      <p class="reading__verdict">${esc(h.verdict)}</p>
      <div class="reading__actions">
        <a class="btn btn--primary" href="${esc(safeUrl(h.url))}" target="_blank" rel="noopener">Register on ${esc(h.source)}</a>
        <button class="btn" type="button" data-save aria-pressed="${saved}">${saved ? 'Shortlisted' : 'Shortlist'}</button>
        <button class="btn btn--quiet" type="button" data-hide>${gone ? 'Bring back' : 'Not for me'}</button>
      </div>
    </div>
    <dl class="parts">
      ${Object.keys(WEIGHT).map((k) => `
        <div class="part">
          <dt>${PART_LABEL[k]}</dt>
          <dd><span class="meter" role="img" aria-label="${Math.round(h.score.parts[k] * 100)} percent"><i style="--v:${h.score.parts[k].toFixed(3)}"></i></span></dd>
          <dd class="pts">${Math.round(h.score.parts[k] * WEIGHT[k])}</dd>
          <dd class="what">${esc(PART_TEXT[k](h))}</dd>
        </div>`).join('')}
    </dl>
    <dl class="facts">
      <dt>Where</dt><dd>${esc(h.location || h.where)}</dd>
      <dt>Type</dt><dd>${esc(h.kindLabel)}</dd>
      <dt>Stack</dt><dd>${h.stack.kind === 'tool' ? `${esc(h.stack.label)}. The listing says to build with it.` : h.stack.kind === 'company' ? `${esc(h.stack.label)}. Expect to build on their platform.` : 'Open. Use whatever you like.'}</dd>
      <dt>Mode</dt><dd>${esc(h.modeLabel)}${h.regionLabel ? `, ${esc(h.regionLabel)}` : ''}</dd>
      <dt>Registration closes</dt><dd class="measured">${esc(closes)}</dd>
      ${h.themes?.length ? `<dt>Themes</dt><dd>${esc([...new Set(h.themes)].slice(0, 6).join(', '))}</dd>` : ''}
      <dt>First seen</dt><dd class="measured">${esc(new Date(h.firstSeen).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }))}</dd>
    </dl>`;
}

function setBusy(b) { $('#list').setAttribute('aria-busy', String(b)); }

function showError(err) {
  $('#rows').innerHTML = '';
  $('#headline').textContent = 'Could not load hackathons';
  $('#subline').textContent = '';
  $('#notice').innerHTML = `<div class="notice notice--error"><h2>The list did not load</h2><p>${esc(err.message)} If you run Hackathon-bud yourself, start it with <span class="measured">npm start</span>, which fetches a fresh list first.</p><button class="btn" type="button" data-retry>Try again</button></div>`;
  $('[data-retry]').addEventListener('click', load);
}

// ---------- actions ----------
let undo = null;
function toast(text, fn) {
  undo = fn;
  $('#toast-text').textContent = text;
  $('#toast').hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { $('#toast').hidden = true; undo = null; }, 6000);
}
$('#toast-undo').addEventListener('click', () => { undo?.(); $('#toast').hidden = true; });

function open(id, push = true) { setParam('id', id, push); render(); if (id && matchMedia('(max-width: 70rem)').matches) $('#reading [data-close]')?.focus(); }

document.addEventListener('click', (e) => {
  const opener = e.target.closest('[data-open]');
  if (opener && !e.metaKey && !e.ctrlKey) { e.preventDefault(); open(opener.dataset.open); return; }
  const row = e.target.closest('li[data-id]');
  if (row && !e.target.closest('a')) { open(row.dataset.id); return; }
  if (e.target.closest('[data-close]')) { open('', false); return; }
  const id = readState().id;
  if (e.target.closest('[data-save]')) {
    shortlist.has(id) ? shortlist.delete(id) : shortlist.add(id);
    store.set('shortlist', [...shortlist]); render();
  }
  if (e.target.closest('[data-hide]')) {
    const wasHidden = hidden.has(id);
    wasHidden ? hidden.delete(id) : hidden.add(id);
    store.set('hidden', [...hidden]);
    if (!wasHidden) { setParam('id', ''); toast('Hidden from your ranked list.', () => { hidden.delete(id); store.set('hidden', [...hidden]); setParam('id', id); render(); }); }
    render();
  }
  const deeper = e.target.closest('[data-depth]');
  if (deeper) { setParam('depth', deeper.dataset.depth === 'strong' ? '' : deeper.dataset.depth); render(); if (deeper.dataset.depth === 'strong') $('#rows').scrollIntoView({ block: 'start' }); return; }
  const tab = e.target.closest('.tabs a');
  if (tab) { e.preventDefault(); setParam('view', tab.dataset.view === 'ranked' ? '' : tab.dataset.view, true); setParam('id', ''); render(); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && readState().id) open('', false); });
addEventListener('popstate', () => { syncForm(); render(); });

// filters
const form = $('#filters');
function syncForm() {
  const s = readState();
  form.where.value = s.where; form.kind.value = s.kind; form.stack.value = s.stack; form.cash.checked = s.cash; form.sort.value = s.sort; form.q.value = s.q;
}
form.addEventListener('submit', (e) => e.preventDefault());
form.addEventListener('input', (e) => {
  const t = e.target;
  if (t.name === 'where') setParam('where', t.value === 'any' ? '' : t.value);
  if (t.name === 'kind') setParam('kind', t.value === 'hackathon' ? '' : t.value);
  if (t.name === 'stack') setParam('stack', t.value === 'any' ? '' : t.value);
  if (t.name === 'cash') setParam('cash', t.checked ? '' : '0');
  if (t.name === 'sort') setParam('sort', t.value === 'score' ? '' : t.value);
  if (t.name === 'q') setParam('q', t.value);
  ['cash', 'where', 'kind', 'stack'].includes(t.name) ? rerank() : render();
});

// settings
const sform = $('#settings-form');
$('#settings-toggle').addEventListener('click', (e) => {
  const open = $('#settings').hidden;
  $('#settings').hidden = !open;
  e.currentTarget.setAttribute('aria-expanded', String(open));
  if (open) sform.interests.focus();
});
sform.interests.value = prefs.interests.join(', '); sform.minScore.value = prefs.minScore || 0;
sform.addEventListener('submit', (e) => e.preventDefault());
sform.addEventListener('input', () => {
  prefs = { ...prefs, interests: sform.interests.value.split(',').map((s) => s.trim()).filter(Boolean), minScore: Number(sform.minScore.value) || 0 };
  store.set('prefs', prefs);
  if (data) rerank();
});

// theme
function paintThemeButton() {
  const light = document.documentElement.dataset.theme === 'light';
  $('#theme').textContent = light ? 'Graphite' : 'Daylight';
  $('#theme').setAttribute('aria-label', light ? 'Switch to dark colours' : 'Switch to daylight colours');
}
$('#theme').addEventListener('click', () => {
  const light = document.documentElement.dataset.theme !== 'light';
  if (light) document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('bud.theme', light ? 'light' : ''); } catch {}
  paintThemeButton();
});
paintThemeButton();


// remember this visit after the list has been seen, so "new" survives a reload in the same sitting
addEventListener('pagehide', () => store.set('lastVisit', data?.fetchedAt || new Date().toISOString()));

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

syncForm();
load();
