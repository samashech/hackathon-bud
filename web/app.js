import { rank, formatINR, DEFAULT_PREFS } from './core/index.mjs';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (u) => (/^https?:\/\//.test(u || '') ? u : '#');

// ---------- per-device memory ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(`radar.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`radar.${k}`, JSON.stringify(v)); } catch {} },
};
let prefs = { ...DEFAULT_PREFS, name: 'Sameer', ...store.get('prefs', {}) };
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
    where: p.get('where') || 'all',
    cash: p.get('cash') !== '0',
    rest: p.get('rest') === '1',
    sort: p.get('sort') || 'score',
    q: p.get('q') || '',
    id: p.get('id') || '',
  };
}

// ---------- formatting ----------
const fmtCount = (n) => (n == null ? '<span class="dim">not shown</span>' : `<span class="measured">${n.toLocaleString('en-IN')}</span>`);
const fmtPrize = (h) => (h.score.inr ? `<span class="measured">${esc(formatINR(h.score.inr))}</span>` : '<span class="dim">none listed</span>');
function fmtDays(d) {
  if (d == null) return '<span class="dim">unknown</span>';
  if (d <= 0) return '<span class="measured soon">today</span>';
  if (d === 1) return '<span class="measured soon">1 day</span>';
  return `<span class="measured${d <= 3 ? ' soon' : ''}">${d} days</span>`;
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
  ranked = rank(data.items, { ...prefs, allowOtherIndia: s.rest, cashOnly: s.cash });
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
  if (s.view === 'ranked' && s.where !== 'all') {
    list = list.filter((h) => (s.where === 'online' ? h.place === 'online' || h.place === 'hybrid' : h.place === s.where));
  }
  if (q) list = list.filter((h) => `${h.title} ${h.organiser} ${h.location} ${h.source}`.toLowerCase().includes(q));
  const by = {
    score: (a, b) => b.score.total - a.score.total,
    closing: (a, b) => (a.score.daysLeft ?? 1e9) - (b.score.daysLeft ?? 1e9),
    prize: (a, b) => b.score.inr - a.score.inr,
    crowd: (a, b) => (b.registrations ?? -1) - (a.registrations ?? -1),
    new: (a, b) => (b.firstSeen || '').localeCompare(a.firstSeen || ''),
  }[s.sort] || ((a, b) => b.score.total - a.score.total);
  return list.sort(by);
}

// ---------- render ----------
function render() {
  const s = readState();
  const list = visible();
  const okCount = ranked.filter((h) => h.ok && !hidden.has(h.id)).length;
  const strong = ranked.filter((h) => h.ok && !hidden.has(h.id) && h.score.total >= 52).length;
  const fresh = ranked.filter((h) => h.ok && !hidden.has(h.id) && isNew(h)).length;

  $('#headline').textContent = s.view === 'shortlist' ? `Your shortlist, ${shortlist.size} saved` : s.view === 'hidden' ? `${hidden.size} hidden` : `${strong} hackathons worth your weekend`;
  $('#subline').textContent = s.view === 'ranked'
    ? `${okCount} match your rules, ${strong} score strong or better.${fresh ? ` ${fresh} are new since you last looked.` : ''}`
    : s.view === 'shortlist' ? 'Saved on this device. The email digest and the extension read the same rules.' : 'Bring one back from its reading.';
  for (const a of document.querySelectorAll('.tabs a')) { if (a.dataset.view === s.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  $('[data-count="ranked"]').textContent = okCount;
  $('[data-count="shortlist"]').textContent = shortlist.size || '';
  $('[data-count="hidden"]').textContent = hidden.size || '';
  $('#status').textContent = data ? `Updated ${ago(data.fetchedAt)}` : '';

  const errs = Object.entries(data.errors || {});
  $('#sources').textContent = `From ${['Unstop', 'Devpost', 'Devfolio', 'MLH'].filter((x) => !data.errors?.[x]).join(', ')}.${errs.length ? ` Could not reach ${errs.map(([k]) => k).join(' and ')} on the last refresh.` : ''} Scores weigh registrations and cash prize most, then who runs it, time left and your interests.`;

  const rows = $('#rows');
  const notice = $('#notice');
  if (!list.length) {
    rows.innerHTML = '';
    notice.innerHTML = s.view === 'shortlist'
      ? '<div class="notice"><h2>Nothing saved yet</h2><p>Open a hackathon and press Shortlist to keep it here.</p><a class="btn" href="?view=ranked">See the ranked list</a></div>'
      : s.view === 'hidden'
      ? '<div class="notice"><h2>Nothing hidden</h2><p>Hackathons you hide from the ranked list wait here.</p></div>'
      : `<div class="notice"><h2>No hackathon fits these filters</h2><p>${s.q ? `Nothing matches “${esc(s.q)}”.` : 'Try everywhere, or allow events without a listed cash prize.'}</p><button class="btn" type="button" data-reset>Clear filters</button></div>`;
    $('[data-reset]')?.addEventListener('click', () => { history.replaceState(null, '', `?view=${s.view}`); syncForm(); rerank(); });
  } else {
    notice.innerHTML = '';
    rows.innerHTML = list.map((h) => `
      <tr data-id="${esc(h.id)}" aria-selected="${h.id === s.id}">
        <td class="num cell-score"><span class="score">${h.score.total}</span><span class="tierword">${h.tier.label}</span></td>
        <td>
          <a class="title" href="?id=${encodeURIComponent(h.id)}" data-open="${esc(h.id)}">${esc(h.title)}</a>
          <span class="org">${esc(h.organiser || h.source)}</span>
          ${isNew(h) || shortlist.has(h.id) ? `<span class="chips">${isNew(h) ? '<span class="chip chip--new">new</span>' : ''}${shortlist.has(h.id) ? '<span class="chip">shortlisted</span>' : ''}</span>` : ''}
        </td>
        <td data-label="">${esc(h.where)}</td>
        <td class="num" data-label="Prize">${fmtPrize(h)}</td>
        <td class="num" data-label="Registered">${fmtCount(h.registrations)}</td>
        <td class="num" data-label="Closes in">${fmtDays(h.score.daysLeft)}</td>
      </tr>`).join('');
  }
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
      <dt>Format</dt><dd>${esc(h.where)}</dd>
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
  $('#notice').innerHTML = `<div class="notice notice--error"><h2>The list did not load</h2><p>${esc(err.message)} If you run Radar locally, start it with <span class="measured">npm start</span>, which fetches a fresh list first.</p><button class="btn" type="button" data-retry>Try again</button></div>`;
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
  const row = e.target.closest('tr[data-id]');
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
  const tab = e.target.closest('.tabs a');
  if (tab) { e.preventDefault(); setParam('view', tab.dataset.view === 'ranked' ? '' : tab.dataset.view, true); setParam('id', ''); render(); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && readState().id) open('', false); });
addEventListener('popstate', () => { syncForm(); render(); });

// filters
const form = $('#filters');
function syncForm() {
  const s = readState();
  form.where.value = s.where; form.cash.checked = s.cash; form.rest.checked = s.rest; form.sort.value = s.sort; form.q.value = s.q;
}
form.addEventListener('submit', (e) => e.preventDefault());
form.addEventListener('input', (e) => {
  const t = e.target;
  if (t.name === 'where') setParam('where', t.value === 'all' ? '' : t.value);
  if (t.name === 'cash') setParam('cash', t.checked ? '' : '0');
  if (t.name === 'rest') setParam('rest', t.checked);
  if (t.name === 'sort') setParam('sort', t.value === 'score' ? '' : t.value);
  if (t.name === 'q') setParam('q', t.value);
  ['cash', 'rest'].includes(t.name) ? rerank() : render();
});

// settings
const sform = $('#settings-form');
$('#settings-toggle').addEventListener('click', (e) => {
  const open = $('#settings').hidden;
  $('#settings').hidden = !open;
  e.currentTarget.setAttribute('aria-expanded', String(open));
  if (open) sform.name.focus();
});
sform.name.value = prefs.name; sform.interests.value = prefs.interests.join(', '); sform.minScore.value = prefs.minScore || 0;
sform.addEventListener('submit', (e) => e.preventDefault());
sform.addEventListener('input', () => {
  prefs = { ...prefs, name: sform.name.value.trim() || 'you', interests: sform.interests.value.split(',').map((s) => s.trim()).filter(Boolean), minScore: Number(sform.minScore.value) || 0 };
  store.set('prefs', prefs);
  document.querySelectorAll('[data-name]').forEach((n) => (n.textContent = prefs.name));
  if (data) rerank();
});
document.querySelectorAll('[data-name]').forEach((n) => (n.textContent = prefs.name));

// theme
function paintThemeButton() {
  const light = document.documentElement.dataset.theme === 'light';
  $('#theme').textContent = light ? 'Graphite' : 'Daylight';
  $('#theme').setAttribute('aria-label', light ? 'Switch to dark colours' : 'Switch to daylight colours');
}
$('#theme').addEventListener('click', () => {
  const light = document.documentElement.dataset.theme !== 'light';
  if (light) document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('radar.theme', light ? 'light' : ''); } catch {}
  paintThemeButton();
});
paintThemeButton();

// refresh, only where the local server is running
fetch('api/health').then((r) => r.ok && ($('#refresh').hidden = false)).catch(() => {});
$('#refresh').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  b.setAttribute('aria-busy', 'true'); b.disabled = true; b.textContent = 'Refreshing';
  try {
    const r = await fetch('api/refresh', { method: 'POST' });
    if (!r.ok) throw new Error(`Refresh answered ${r.status}`);
    await load();
  } catch (err) { toast(err.message); }
  finally { b.removeAttribute('aria-busy'); b.disabled = false; b.textContent = 'Refresh'; }
});

// remember this visit after the list has been seen, so "new" survives a reload in the same sitting
addEventListener('pagehide', () => store.set('lastVisit', data?.fetchedAt || new Date().toISOString()));

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

syncForm();
load();
