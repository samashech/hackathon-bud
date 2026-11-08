// Send today's digest to every confirmed subscriber now, without waiting for 8:00.
//   npm run digest                 refresh, then send
//   npm run digest -- --dry-run    show who would get what, send nothing
//   npm run digest:preview         write digest-preview.html, the email as it looks now
// Needs GMAIL_USER and GMAIL_APP_PASSWORD (and DATABASE_URL on Render).
import { writeFile } from 'node:fs/promises';
import { openStore } from '../server/store.mjs';
import { refresh, sendDigests, topFor } from '../server/jobs.mjs';
import { digestEmail } from '../server/email.mjs';

const args = process.argv.slice(2);
const site = (process.env.PUBLIC_URL || 'http://localhost:4321').replace(/\/?$/, '/');
const store = await openStore();
const data = args.includes('--no-refresh') && (await store.kvGet('hackathons')) ? await store.kvGet('hackathons') : await refresh(store, { log: console.log });

if (args.includes('--preview')) {
  const mail = digestEmail({ fresh: topFor(data, { region: 'any' }, 6), closing: [], site, unsubscribe: `${site}unsubscribe?token=preview`, welcome: true });
  await writeFile('digest-preview.html', mail.html);
  console.log(`digest-preview.html written. Subject: ${mail.subject}`);
} else {
  await sendDigests(store, site, { log: console.log, dryRun: args.includes('--dry-run') });
}
process.exit(0);
