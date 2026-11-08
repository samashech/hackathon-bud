// Fetch every source now and save the list where the server reads it.
//   npm run refresh
import { openStore } from '../server/store.mjs';
import { refresh } from '../server/jobs.mjs';
import { rank, DEFAULT_PREFS } from '../core/index.mjs';

const store = await openStore();
const data = await refresh(store, { log: console.log });
const ok = rank(data.items, DEFAULT_PREFS).filter((h) => h.ok);
console.log(`${ok.length} open with a cash prize. Top 10:`);
for (const h of ok.slice(0, 10)) console.log(`  ${String(h.score.total).padStart(3)}  ${h.tier.label.padEnd(8)} ${h.where.slice(0, 22).padEnd(22)} ${h.title}`);
process.exit(0);
