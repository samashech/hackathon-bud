// Hackathon-bud Gmail relay. A Google Apps Script web app that sends the
// site's emails through your Gmail over HTTPS, for hosts like Render's free
// plan that block outgoing SMTP.
//
// Setup (about five minutes):
//  1. Go to https://script.google.com, signed in as the Gmail that should send.
//     New project, delete what is there, paste this whole file.
//  2. Change SECRET below to a long random string, and keep a copy.
//  3. Deploy > New deployment > type: Web app.
//     Execute as: Me.  Who has access: Anyone.  Deploy, then allow access.
//  4. Copy the web app URL (ends in /exec). On Render set
//       MAIL_RELAY_URL     = that URL
//       MAIL_RELAY_SECRET  = the SECRET below
//
// Without the secret the relay refuses to send, so the public URL cannot be
// used to send mail as you. A personal Gmail account can send to about 100
// recipients a day this way.

const SECRET = 'CHANGE-ME-to-a-long-random-string';

function doPost(e) {
  try {
    const m = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!SECRET || SECRET.indexOf('CHANGE-ME') === 0 || m.secret !== SECRET) return reply({ ok: false, error: 'bad secret' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m.to || '') || !m.subject) return reply({ ok: false, error: 'missing to or subject' });
    const options = { name: m.name || 'Hackathon-bud', htmlBody: m.html || undefined };
    if (m.replyTo) options.replyTo = m.replyTo;
    GmailApp.sendEmail(m.to, m.subject, m.text || '', options);
    return reply({ ok: true, remaining: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet() {
  return reply({ ok: true, service: 'hackathon-bud relay' });
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
