// Storage backends.
//   DB_TYPE=sqlite   (default) — data lives in data/chat.db on the server's disk.
//   DB_TYPE=supabase           — PostgreSQL (Supabase, Neon, any Postgres). Set DATABASE_URL.
//   DB_TYPE=mysql              — MySQL / MariaDB (e.g. the MySQL of a normal web hosting). Set DATABASE_URL.
// For supabase/mysql the working copy is SQLite in memory-speed local file; it is restored from the
// remote database at boot and saved back when data changes, every SNAPSHOT_SECONDS, and on shutdown.
// This makes the app run on free hosts with an ephemeral disk (Render free, Koyeb...) without data loss.
const fs = require('fs');
const path = require('path');

const TYPE = String(process.env.DB_TYPE || (process.env.DATABASE_URL ? 'supabase' : 'sqlite')).toLowerCase()
  .replace('postgres', 'supabase').replace('postgresql', 'supabase').replace('mariadb', 'mysql');
const URL = process.env.DATABASE_URL || '';
const INTERVAL = Math.max(5, Number(process.env.SNAPSHOT_SECONDS) || 20) * 1000;

function enabled() { return TYPE === 'supabase' || TYPE === 'mysql'; }

/* ---------------- adapters ---------------- */
let adapter = null;

async function pgAdapter() {
  const { Pool } = require('pg');
  const local = /localhost|127\.0\.0\.1/.test(URL) || /sslmode=disable/.test(URL);
  const pool = new Pool({ connectionString: URL, max: 2, connectionTimeoutMillis: 15000, ssl: local ? false : { rejectUnauthorized: false } });
  await pool.query(`CREATE TABLE IF NOT EXISTS smartchat_snapshot (
    id INTEGER PRIMARY KEY, data BYTEA NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  return {
    async load() { const r = await pool.query('SELECT data, updated_at FROM smartchat_snapshot WHERE id=1'); return r.rows[0] || null; },
    async store(buf) {
      await pool.query(`INSERT INTO smartchat_snapshot(id, data, updated_at) VALUES (1, $1, now())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [buf]);
    }
  };
}

async function mysqlAdapter() {
  const mysql = require('mysql2/promise');
  const local = /localhost|127\.0\.0\.1/.test(URL) || /ssl=false/.test(URL);
  const opts = { uri: URL.replace(/[?&]ssl=false/, ''), connectionLimit: 2, connectTimeout: 15000 };
  if (!local && !/ssl=/.test(URL)) opts.ssl = { rejectUnauthorized: false };
  let pool = mysql.createPool(opts);
  try { await pool.query('SELECT 1'); } catch (e) {
    if (opts.ssl && /SSL|ssl|secure/i.test(e.message)) { await pool.end(); delete opts.ssl; pool = mysql.createPool(opts); }
    else throw e;
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS smartchat_snapshot (
    id INT PRIMARY KEY, data LONGBLOB NOT NULL, updated_at DATETIME NOT NULL) ENGINE=InnoDB`);
  return {
    async load() { const [rows] = await pool.query('SELECT data, updated_at FROM smartchat_snapshot WHERE id=1'); return rows[0] || null; },
    async store(buf) {
      await pool.execute('INSERT INTO smartchat_snapshot(id, data, updated_at) VALUES (1, ?, NOW()) ON DUPLICATE KEY UPDATE data=VALUES(data), updated_at=NOW()', [buf]);
    }
  };
}

async function getAdapter() {
  if (adapter) return adapter;
  if (!URL) throw new Error(`DB_TYPE=${TYPE} requires DATABASE_URL`);
  adapter = TYPE === 'mysql' ? await mysqlAdapter() : await pgAdapter();
  return adapter;
}

/* ---------------- lifecycle ---------------- */

async function restore(dataDir) {
  console.log(`[storage] type: ${TYPE}`);
  if (!enabled()) return;
  const a = await getAdapter();
  const row = await a.load();
  if (!row) { console.log('[storage] no remote copy yet — starting fresh'); return; }
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'chat.db');
  for (const f of [file, file + '-wal', file + '-shm']) { try { fs.unlinkSync(f); } catch { /* none */ } }
  fs.writeFileSync(file, row.data);
  console.log(`[storage] restored database (${(row.data.length / 1024).toFixed(0)} KB, saved ${new Date(row.updated_at).toISOString()})`);
}

let lastChanges = -1, lastSave = 0, saving = null;

async function save(db, force = false) {
  if (!enabled()) return;
  if (saving) return saving;
  const changes = db.prepare('SELECT total_changes() c').get().c;
  const stale = Date.now() - lastSave > 24 * 3600 * 1000; // daily heartbeat keeps free databases from pausing
  if (!force && changes === lastChanges && !stale) return;
  saving = (async () => {
    try {
      await (await getAdapter()).store(db.serialize());
      lastChanges = changes; lastSave = Date.now();
    } catch (e) { console.error('[storage] save failed:', e.message); }
    finally { saving = null; }
  })();
  return saving;
}

function start(db) {
  if (!enabled()) return;
  lastChanges = db.prepare('SELECT total_changes() c').get().c;
  lastSave = 0; // save once right after boot
  save(db);
  setInterval(() => save(db), INTERVAL).unref();
  const shutdown = async (sig) => {
    console.log(`[storage] ${sig} — saving before exit`);
    await save(db, true);
    process.exit(0);
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  console.log(`[storage] remote sync active (every ${INTERVAL / 1000}s when data changes)`);
}

module.exports = { TYPE, enabled, restore, save, start };
