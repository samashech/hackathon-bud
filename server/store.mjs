// Where subscribers and the latest hackathon list live.
// DATABASE_URL set (Render Postgres, Neon, Supabase): Postgres.
// Otherwise a JSON file in DATA_DIR (default .data/), fine on one machine or
// a Render persistent disk, but wiped on every deploy of a free Render service.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function openStore() {
  return process.env.DATABASE_URL ? pgStore(process.env.DATABASE_URL) : fileStore(process.env.DATA_DIR || '.data');
}

async function fileStore(dir) {
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'store.json');
  let db = { kv: {}, subs: {} };
  try { db = JSON.parse(await readFile(file, 'utf8')); } catch {}
  let chain = Promise.resolve();
  const save = () => (chain = chain.then(async () => { await writeFile(`${file}.tmp`, JSON.stringify(db)); await rename(`${file}.tmp`, file); }));
  return {
    kind: `file ${file}`,
    async kvGet(k) { return db.kv[k] ?? null; },
    async kvSet(k, v) { db.kv[k] = v; await save(); },
    async getSub(email) { return db.subs[email] ?? null; },
    async getSubByToken(t) { return Object.values(db.subs).find((s) => s.token === t) ?? null; },
    async saveSub(s) { db.subs[s.email] = s; await save(); },
    async deleteSub(email) { delete db.subs[email]; await save(); },
    async listSubs() { return Object.values(db.subs); },
  };
}

async function pgStore(url) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: true }, max: 3 });
  await pool.query(`create table if not exists bud_kv (key text primary key, value jsonb not null, updated_at timestamptz default now());
    create table if not exists bud_subscribers (email text primary key, token text unique not null, data jsonb not null);`);
  const one = async (q, a) => (await pool.query(q, a)).rows[0] ?? null;
  return {
    kind: 'postgres',
    async kvGet(k) { return (await one('select value from bud_kv where key = $1', [k]))?.value ?? null; },
    async kvSet(k, v) { await pool.query('insert into bud_kv (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value, updated_at = now()', [k, JSON.stringify(v)]); },
    async getSub(email) { return (await one('select data from bud_subscribers where email = $1', [email]))?.data ?? null; },
    async getSubByToken(t) { return (await one('select data from bud_subscribers where token = $1', [t]))?.data ?? null; },
    async saveSub(s) { await pool.query('insert into bud_subscribers (email, token, data) values ($1, $2, $3) on conflict (email) do update set token = excluded.token, data = excluded.data', [s.email, s.token, JSON.stringify(s)]); },
    async deleteSub(email) { await pool.query('delete from bud_subscribers where email = $1', [email]); },
    async listSubs() { return (await pool.query('select data from bud_subscribers')).rows.map((r) => r.data); },
  };
}
