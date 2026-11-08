// Gmail sending and the three emails: confirm, welcome and the daily digest.
import { formatINR } from '../core/index.mjs';

export const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (u) => (/^https?:\/\//.test(u || '') ? u : '#');

let transport = null;
// MAIL_DRY_RUN=1 prints each email instead of sending it, for testing.
const DRY = process.env.MAIL_DRY_RUN === '1';

// Two ways to send:
//   SMTP_URL + MAIL_FROM   any provider (Brevo, Resend, Zoho, a second Gmail...),
//                          e.g. SMTP_URL=smtps://user:pass@smtp-relay.brevo.com:465
//                               MAIL_FROM="Hackathon-bud <hello@yourdomain.in>"
//   GMAIL_USER + GMAIL_APP_PASSWORD   a Gmail account; it is also the sender.
const smtpUrl = () => process.env.SMTP_URL || '';
const gmail = () => !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
export function mailReady() { return DRY || !!smtpUrl() || gmail(); }
function fromAddress() {
  if (process.env.MAIL_FROM) return process.env.MAIL_FROM;
  return `Hackathon-bud <${process.env.GMAIL_USER || 'hackathon-bud@localhost'}>`;
}

export async function send({ to, subject, html, text, unsubscribe }) {
  if (!mailReady()) throw new Error('No email settings: set SMTP_URL and MAIL_FROM, or GMAIL_USER and GMAIL_APP_PASSWORD');
  if (DRY) { console.log(`[dry run] from ${fromAddress()} to ${to}: ${subject}${unsubscribe ? ` (unsubscribe ${unsubscribe})` : ''}\n${(text || '').split('\n').slice(0, 6).join('\n')}`); return; }
  if (!transport) {
    const { default: nodemailer } = await import('nodemailer');
    transport = smtpUrl()
      ? nodemailer.createTransport(smtpUrl(), { pool: true, maxConnections: 1 })
      : nodemailer.createTransport({ service: 'gmail', pool: true, maxConnections: 1, auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, '') } });
  }
  const headers = unsubscribe ? { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : {};
  await transport.sendMail({ from: fromAddress(), replyTo: process.env.MAIL_REPLY_TO || undefined, to, subject, text, html, headers });
}

// Email clients ignore stylesheets and custom properties, so colours are inlined.
// They are Console's daylight colourway, which reads best in Gmail.
const C = { paper: '#fbfaf7', panel: '#ffffff', well: '#f4f2ee', ink: '#2b2622', ink2: '#4a443e', muted: '#6b655f', rule: '#e6e2db', cool: '#2f63b8', amber: '#a86b00', amberInk: '#fffdf8' };
const mono = "'Atkinson Hyperlegible Mono',ui-monospace,Menlo,Consolas,monospace";
const sans = "'Satoshi',-apple-system,'Segoe UI',Roboto,Arial,sans-serif";

const fact = (label, value) => `<td valign="top" style="padding:8px 12px 8px 0;font:400 12px/1.4 ${sans};color:${C.muted}">${label}<div style="font:500 14px/1.4 ${mono};color:${C.ink};padding-top:2px">${value}</div></td>`;

function row(h) {
  const days = h.score.daysLeft;
  return `
  <tr><td style="padding:20px 0;border-bottom:1px solid ${C.rule}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="60" valign="top" style="font:400 28px/1 ${mono};color:${C.cool}">${h.score.total}<div style="font:500 12px/1.8 ${sans};color:${C.muted}">${h.tier.label}</div></td>
      <td valign="top" style="font:400 15px/1.5 ${sans};color:${C.ink}">
        ${h.kind && h.kind !== 'hackathon' ? `<div style="font:500 12px ${sans};color:${C.cool};padding-bottom:2px">${esc(h.kindLabel)}</div>` : ''}
        <a href="${esc(safeUrl(h.url))}" style="font-weight:500;font-size:17px;line-height:1.3;color:${C.ink};text-decoration:none">${esc(h.title)}</a>
        <div style="color:${C.muted};font-size:13px;padding-top:2px">${esc(h.organiser || h.source)}</div>
        ${h.blurb ? `<div style="padding-top:8px;color:${C.ink2}">${esc(h.blurb)}</div>` : ''}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:10px;background:${C.well};border-radius:8px;padding:2px 12px"><tr>
          ${fact('Mode', esc(h.modeLabel))}
          ${fact('Location', esc(h.place.mode === 'online' ? 'Anywhere' : h.where))}
          ${fact('Prize pool', h.score.inr ? esc(formatINR(h.score.inr)) : 'Not listed')}
          ${fact('Registered', h.registrations != null ? h.registrations.toLocaleString('en-IN') : 'Not shown')}
          ${fact('Closes in', days == null ? 'Not listed' : days <= 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`)}
        </tr></table>
        <a href="${esc(safeUrl(h.url))}" style="display:inline-block;margin-top:12px;padding:8px 14px;border-radius:6px;background:${C.amber};color:${C.amberInk};font-weight:500;font-size:13px;text-decoration:none">Register on ${esc(h.source)}</a>
      </td>
    </tr></table>
  </td></tr>`;
}

const section = (title, list) => (list.length ? `<tr><td style="padding:32px 0 4px;font:500 19px/1.3 ${sans};color:${C.ink};letter-spacing:-0.02em">${title}</td></tr>${list.map(row).join('')}` : '');

function shell({ intro, body, site, unsubscribe }) {
  return `<!doctype html><html><body style="margin:0;background:${C.paper}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px">
  <tr><td style="font:800 20px/1 'Panchang','Arial Black',Arial,sans-serif;letter-spacing:0.01em;text-transform:uppercase"><a href="${esc(site)}" style="color:${C.ink};text-decoration:none">Hackath&Oslash;n<span style="color:${C.amber}">-</span>bud</a></td></tr>
  <tr><td style="padding-top:8px;font:400 15px/1.55 ${sans};color:${C.muted}">${intro}</td></tr>
  ${body}
  <tr><td style="padding-top:28px;font:400 12px/1.6 ${sans};color:${C.muted}">From Unstop, Devpost, Devfolio and MLH. Scored out of 100 on how many registered, the cash prize, who runs it and time left. <a href="${esc(site)}" style="color:${C.ink}">See every open hackathon</a>.${unsubscribe ? ` <a href="${esc(unsubscribe)}" style="color:${C.muted}">Stop these emails</a>.` : ''}</td></tr>
</table></td></tr></table></body></html>`;
}

const plain = (list) => list.map((h) => `${h.score.total}  ${h.title}\n    ${h.verdict}\n    ${h.url}`).join('\n\n');

export function confirmEmail({ link, regionText }) {
  const subject = 'Confirm your hackathon email';
  const html = shell({
    site: link.replace(/\/confirm.*/, '/'),
    intro: `Someone, hopefully you, asked for the daily hackathon email (${esc(regionText)}). One click and you are in:`,
    body: `<tr><td style="padding:24px 0"><a href="${esc(link)}" style="display:inline-block;padding:12px 20px;border-radius:6px;background:${C.amber};color:${C.amberInk};font:500 15px ${sans};text-decoration:none">Yes, send me the list</a></td></tr>
      <tr><td style="font:400 13px/1.5 ${sans};color:${C.muted}">If it was not you, ignore this and nothing more will arrive.</td></tr>`,
  });
  return { subject, html, text: `Confirm the daily hackathon email: ${link}\n\nIf it was not you, ignore this.` };
}

export function digestEmail({ fresh, closing, site, unsubscribe, welcome = false }) {
  const subject = welcome
    ? `You're in. ${fresh.length} hackathons worth your weekend right now`
    : fresh.length
    ? `${fresh.length} new hackathon${fresh.length === 1 ? '' : 's'} worth your weekend: ${fresh[0].title}`
    : `${closing.length} strong hackathon${closing.length === 1 ? '' : 's'} closing this week`;
  const intro = welcome
    ? 'These are the strongest open right now. From tomorrow you only hear from Hackathon-bud when a new one opens or a strong one is about to close.'
    : 'Hackathons with a real crowd and real cash, filtered to where you said you can go.';
  const html = shell({ site, unsubscribe, intro, body: `${section(welcome ? 'Open right now' : 'New since yesterday', fresh)}${section('Closing within three days', closing)}` });
  const text = `${subject}\n\n${plain([...fresh, ...closing])}\n\nStop these emails: ${unsubscribe}`;
  return { subject, html, text };
}
