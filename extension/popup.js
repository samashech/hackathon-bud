import { formatINR } from './core/score.mjs';

const $ = (s) => document.querySelector(s);
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safe = (u) => (/^https?:\/\//.test(u || '') ? u : '#');

let state = {};

function render() {
  const { ranked = [], unread = [], fetchedAt, errors = {} } = state;
  const where = $('#where').w.value;
  const list = ranked.filter((h) => where === 'all' || (where === 'online' ? h.place === 'online' || h.place === 'hybrid' : h.place === where)).slice(0, 15);
  const strong = ranked.filter((h) => h.score.total >= 52).length;
  $('#headline').textContent = fetchedAt ? `${strong} worth your weekend` : 'Radar';
  if (!fetchedAt) { $('#list').innerHTML = '<li class="empty">Checking Unstop, Devpost, Devfolio and MLH. This takes about twenty seconds the first time.</li>'; }
  else if (!list.length) { $('#list').innerHTML = '<li class="empty">Nothing here fits right now. Try All, or check back after the next refresh.</li>'; }
  else {
    $('#list').innerHTML = list.map((h) => `
      <li><a href="${esc(safe(h.url))}" target="_blank" rel="noopener" title="${esc(h.verdict)}">
        <span class="score">${h.score.total}</span>
        <span class="title">${esc(h.title)}${unread.includes(h.id) ? '<span class="new">new</span>' : ''}</span>
        <span class="meta">${esc(h.where)}, <b>${esc(h.score.inr ? formatINR(h.score.inr) : 'no cash listed')}</b>${h.score.daysLeft != null ? `, closes in <b>${Math.max(0, h.score.daysLeft)}d</b>` : ''}</span>
      </a></li>`).join('');
  }
  const failed = Object.keys(errors);
  $('#status').textContent = fetchedAt ? `Checked ${new Date(fetchedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}${failed.length ? `, ${failed.join(' and ')} unreachable` : ''}` : '';
}

async function load() {
  state = await chrome.storage.local.get(['ranked', 'unread', 'fetchedAt', 'errors', 'fullUrl']);
  if (state.fullUrl) $('#full').href = state.fullUrl;
  render();
  // Opening the popup counts as reading the new ones.
  chrome.action.setBadgeText({ text: '' });
  chrome.storage.local.set({ unreadShown: state.unread || [] });
}

$('#where').addEventListener('change', render);
$('#refresh').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  b.disabled = true; b.textContent = 'Checking';
  await chrome.runtime.sendMessage('refresh');
  b.disabled = false; b.textContent = 'Check now';
  load();
});
chrome.storage.onChanged.addListener(load);
load();
