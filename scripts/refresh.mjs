// Fetch all sources and write web/data/hackathons.json.
// Keeps the date each hackathon was first seen, which drives "new" in the
// website, the extension badge and the email digest.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect, rank } from '../core/index.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = join(root, 'web', 'data', 'hackathons.json');

export async function refresh({ quiet = false } = {}) {
  let previous = { items: [] };
  try { previous = JSON.parse(await readFile(DATA, 'utf8')); } catch {}
  const firstSeen = new Map(previous.items.map((h) => [h.id, h.firstSeen]));

  const { items, errors, fetchedAt } = await collect();
  const stamped = items.map((h) => ({ ...h, firstSeen: firstSeen.get(h.id) || fetchedAt }));
  const data = { fetchedAt, errors, items: stamped };

  await mkdir(dirname(DATA), { recursive: true });
  await writeFile(DATA, JSON.stringify(data));

  if (!quiet) {
    const ranked = rank(stamped).filter((h) => h.ok);
    const bySource = stamped.reduce((m, h) => ((m[h.source] = (m[h.source] || 0) + 1), m), {});
    console.log(`fetched ${stamped.length} hackathons`, bySource);
    if (Object.keys(errors).length) console.log('source errors:', errors);
    console.log(`${ranked.length} pass your filters. Top 10:`);
    for (const h of ranked.slice(0, 10)) console.log(`  ${String(h.score.total).padStart(3)}  ${h.tier.label.padEnd(8)} ${h.placeLabel.padEnd(12)} ${h.title}  —  ${h.verdict}`);
  }
  return data;
}

if (import.meta.url === `file://${process.argv[1]}`) await refresh();
