// Emails a digest through Gmail: strong hackathons found recently, plus strong
// ones whose registration closes within three days.
//
//   GMAIL_USER=you@gmail.com GMAIL_APP_PASSWORD=xxxx npm run digest
//   npm run digest:preview          writes digest-preview.html instead of sending
//
// Options: --since <hours> (default 26, a day plus slack for a daily run)
//          --min <score>   (default 52, "strong")
//          --no-refresh    use the data file as it is
import { readFile, writeFile } from 'node:fs/promises';
import { rank, formatINR, DEFAULT_PREFS } from '../core/index.mjs';
import { refresh, DATA } from './refresh.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const preview = args.includes('--preview');
const sinceH = Number(opt('since', 26));
const min = Number(opt('min', 52));
const name = process.env.RADAR_NAME || 'Sameer';
const siteUrl = process.env.RADAR_URL || '';

const data = args.includes('--no-refresh') ? JSON.parse(await readFile(DATA, 'utf8')) : await refresh({ quiet: true });
const interests = process.env.RADAR_INTERESTS ? process.env.RADAR_INTERESTS.split(',').map((s) => s.trim()) : DEFAULT_PREFS.interests;
const ranked = rank(data.items, { ...DEFAULT_PREFS, interests }).filter((h) => h.ok && h.score.total >= min);

const cutoff = Date.now() - sinceH * 3600e3;
const fresh = ranked.filter((h) => new Date(h.firstSeen).getTime() >= cutoff);
const closing = ranked.filter((h) => !fresh.includes(h) && h.score.daysLeft != null && h.score.daysLeft <= 3);

if (!fresh.length && !closing.length && !preview) {
  console.log('Nothing new or closing; no email sent.');
  process.exit(0);
}

// Email clients ignore stylesheets and custom properties, so colours are inlined
// here. They are Console's daylight colourway, the light one reads best in Gmail.
const C = { paper: '#fbfaf7', panel: '#ffffff', ink: '#2b2622', muted: '#6b655f', rule: '#e6e2db', cool: '#2f63b8', amber: '#a86b00', amberInk: '#fffdf8' };
const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const mono = "'Atkinson Hyperlegible Mono',ui-monospace,Menlo,Consolas,monospace";
const sans = "'Host Grotesk',-apple-system,'Segoe UI',Roboto,Arial,sans-serif";

const card = (h) => `
  <tr><td style="padding:16px 0;border-bottom:1px solid ${C.rule}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="56" valign="top" style="font:400 26px/1 ${mono};color:${C.cool}">${h.score.total}<div style="font:500 12px/1.6 ${sans};color:${C.muted}">${h.tier.label}</div></td>
      <td valign="top" style="font:400 15px/1.5 ${sans};color:${C.ink}">
        <a href="${esc(h.url)}" style="font-weight:500;font-size:16px;color:${C.ink};text-decoration:none">${esc(h.title)}</a>
        <div style="color:${C.muted};font-size:13px">${esc(h.organiser || h.source)}, ${esc(h.where)}${h.score.daysLeft != null ? `, closes in ${Math.max(0, h.score.daysLeft)} days` : ''}</div>
        <div style="margin-top:6px">${esc(h.verdict)}</div>
        <a href="${esc(h.url)}" style="display:inline-block;margin-top:10px;padding:7px 14px;border-radius:6px;background:${C.amber};color:${C.amberInk};font-weight:500;font-size:13px;text-decoration:none">Register on ${esc(h.source)}</a>
      </td>
    </tr></table>
  </td></tr>`;

const section = (title, list) => (list.length ? `<tr><td style="padding:28px 0 4px;font:500 18px/1.3 ${sans};color:${C.ink};letter-spacing:-0.02em">${title}</td></tr>${list.slice(0, 12).map(card).join('')}` : '');

const subject = fresh.length
  ? `${fresh.length} new hackathon${fresh.length === 1 ? '' : 's'} worth your weekend${fresh[0] ? `: ${fresh[0].title}` : ''}`
  : `${closing.length} strong hackathon${closing.length === 1 ? '' : 's'} closing this week`;

const html = `<!doctype html><html><body style="margin:0;background:${C.paper}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
  <tr><td style="font:500 22px/1.2 ${sans};color:${C.ink};letter-spacing:-0.03em">Radar <span style="font-weight:400;font-size:14px;color:${C.muted};letter-spacing:0">for ${esc(name)}</span></td></tr>
  <tr><td style="padding-top:8px;font:400 15px/1.5 ${sans};color:${C.muted}">Online anywhere, in person around north India and Bengaluru, each with a cash prize. Scored out of 100 on how many registered, the prize, who runs it and time left.</td></tr>
  ${section('Found since yesterday', fresh)}
  ${section('Closing within three days', closing)}
  ${!fresh.length && !closing.length ? `<tr><td style="padding:28px 0;font:400 15px ${sans};color:${C.muted}">Nothing new today. This is a preview.</td></tr>` : ''}
  <tr><td style="padding-top:24px;font:400 12px/1.5 ${sans};color:${C.muted}">From Unstop, Devpost, Devfolio and MLH.${siteUrl ? ` <a href="${esc(siteUrl)}" style="color:${C.ink}">Open the full radar</a>.` : ''}</td></tr>
</table></td></tr></table></body></html>`;

const text = [subject, '', ...[...fresh, ...closing].map((h) => `${h.score.total}  ${h.title}\n    ${h.verdict}\n    ${h.url}`)].join('\n');

if (preview) {
  await writeFile('digest-preview.html', html);
  console.log(`Preview written to digest-preview.html (${fresh.length} new, ${closing.length} closing). Subject: ${subject}`);
  process.exit(0);
}

const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  console.error('Set GMAIL_USER and GMAIL_APP_PASSWORD (a Gmail app password, not your normal password). See README.');
  process.exit(1);
}
const { default: nodemailer } = await import('nodemailer');
const mail = nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD.replace(/\s+/g, '') } });
await mail.sendMail({ from: `Hackathon radar <${GMAIL_USER}>`, to: process.env.DIGEST_TO || GMAIL_USER, subject, text, html });
console.log(`Sent "${subject}" to ${process.env.DIGEST_TO || GMAIL_USER}.`);
