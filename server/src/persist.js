// Storage backends — where the bot keeps its data.
//   sqlite    (default) — data lives in data/chat.db on the server's disk.
//   supabase            — PostgreSQL (Supabase, Neon, any Postgres).          DATABASE_URL=postgres://…
//   mysql               — MySQL / MariaDB (normal web hosting, PlanetScale…).  DATABASE_URL=mysql://…
//   mssql               — Microsoft SQL Server / Azure SQL.                     DATABASE_URL=mssql://user:pass@host:1433/db
//   mongodb             — MongoDB / MongoDB Atlas.                              DATABASE_URL=mongodb+srv://…
//   firebase            — Google Firebase (Cloud Firestore).                    FIREBASE_SERVICE_ACCOUNT=<service account JSON or base64>
// For every type other than sqlite, the working copy is a local SQLite file; it is restored from the
// remote database at boot and saved back when data changes, every SNAPSHOT_SECONDS, and on shutdown.
// This makes the app run on free hosts with an ephemeral disk (Render free, Koyeb...) without data loss.
// The type comes from environment variables, or from the first-run setup wizard (data/storage.json).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const TYPES = ['sqlite', 'supabase', 'mysql', 'mssql', 'mongodb', 'firebase'];
const INTERVAL = Math.max(5, Number(process.env.SNAPSHOT_SECONDS) || 20) * 1000;

function normType(t) {
  t = String(t || '').toLowerCase().trim();
  return ({ postgres: 'supabase', postgresql: 'supabase', pg: 'supabase', neon: 'supabase', mariadb: 'mysql', sqlserver: 'mssql', 'sql-server': 'mssql', azure: 'mssql', mongo: 'mongodb', firestore: 'firebase' })[t] || t;
}

// { type, url, firebase } — firebase = parsed service account
let CFG = { type: 'sqlite', url: '', firebase: null };
function configure(c) {
  const type = normType(c && c.type) || 'sqlite';
  if (!TYPES.includes(type)) throw new Error('نوع قاعدة بيانات غير معروف: ' + type);
  CFG = { type, url: String((c && c.url) || ''), firebase: c && c.firebase ? parseServiceAccount(c.firebase) : null };
  adapter = null;
  return CFG;
}
// environment variables win (that is how hosts without a disk keep the choice across restarts)
function fromEnv(env = process.env) {
  const fb = env.FIREBASE_SERVICE_ACCOUNT;
  const t = normType(env.DB_TYPE) || (fb ? 'firebase' : env.DATABASE_URL ? guessType(env.DATABASE_URL) : '');
  if (!t) return null;
  return { type: t, url: env.DATABASE_URL || '', firebase: fb || null };
}
function guessType(url) {
  if (/^mysql2?:/i.test(url)) return 'mysql';
  if (/^(mssql|sqlserver):/i.test(url)) return 'mssql';
  if (/^mongodb(\+srv)?:/i.test(url)) return 'mongodb';
  return 'supabase';
}
const enabled = () => CFG.type !== 'sqlite';
const type = () => CFG.type;

function parseServiceAccount(v) {
  if (v && typeof v === 'object') return v;
  let s = String(v || '').trim();
  if (s && !s.startsWith('{')) { try { s = Buffer.from(s, 'base64').toString('utf8'); } catch { /* not base64 */ } }
  let j; try { j = JSON.parse(s); } catch { throw new Error('ملف حساب الخدمة (Service account) غير صالح — الصق محتوى ملف JSON كما هو'); }
  if (!j.project_id || !j.client_email || !j.private_key) throw new Error('ملف حساب الخدمة ناقص (project_id / client_email / private_key)');
  return j;
}

/* ---------------- adapters: each one has load() → {data, updated_at} | null and store(buf) ---------------- */
let adapter = null;

async function pgAdapter(URL) {
  const { Pool } = require('pg');
  const local = /localhost|127\.0\.0\.1/.test(URL) || /sslmode=disable/.test(URL);
  const pool = new Pool({ connectionString: URL, max: 2, connectionTimeoutMillis: 15000, ssl: local ? false : { rejectUnauthorized: false } });
  pool.on('error', (e) => console.error('[storage] postgres:', e.message));
  await pool.query(`CREATE TABLE IF NOT EXISTS smartchat_snapshot (
    id INTEGER PRIMARY KEY, data BYTEA NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  return {
    async load() { const r = await pool.query('SELECT data, updated_at FROM smartchat_snapshot WHERE id=1'); return r.rows[0] || null; },
    async store(buf) {
      await pool.query(`INSERT INTO smartchat_snapshot(id, data, updated_at) VALUES (1, $1, now())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [buf]);
    },
    close: () => pool.end()
  };
}

async function mysqlAdapter(URL) {
  const mysql = require('mysql2/promise');
  const local = /localhost|127\.0\.0\.1/.test(URL) || /ssl=false/.test(URL);
  const opts = { uri: URL.replace(/[?&]ssl=false/, ''), connectionLimit: 2, connectTimeout: 15000 };
  if (!local && !/ssl=/.test(URL)) opts.ssl = { rejectUnauthorized: false };
  let pool = mysql.createPool(opts);
  try { await pool.query('SELECT 1'); } catch (e) {
    if (opts.ssl && /SSL|ssl|secure/i.test(e.message)) { await pool.end(); delete opts.ssl; pool = mysql.createPool(opts); }
    else { await pool.end().catch(() => {}); throw e; }
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS smartchat_snapshot (
    id INT PRIMARY KEY, data LONGBLOB NOT NULL, updated_at DATETIME NOT NULL) ENGINE=InnoDB`);
  return {
    async load() { const [rows] = await pool.query('SELECT data, updated_at FROM smartchat_snapshot WHERE id=1'); return rows[0] || null; },
    async store(buf) {
      await pool.execute('INSERT INTO smartchat_snapshot(id, data, updated_at) VALUES (1, ?, NOW()) ON DUPLICATE KEY UPDATE data=VALUES(data), updated_at=NOW()', [buf]);
    },
    close: () => pool.end()
  };
}

// mssql://user:pass@host:1433/database   (add ?encrypt=false for a local server without TLS)
function mssqlConfig(URL) {
  const u = new (require('url').URL)(URL.replace(/^sqlserver:/i, 'mssql:'));
  const local = /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
  return {
    server: u.hostname, port: Number(u.port) || 1433, database: decodeURIComponent(u.pathname.replace(/^\//, '')) || undefined,
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    options: { encrypt: u.searchParams.get('encrypt') !== 'false' && !local, trustServerCertificate: true },
    pool: { max: 2 }, connectionTimeout: 15000, requestTimeout: 60000
  };
}
async function mssqlAdapter(URL) {
  const sql = require('mssql');
  const pool = await new sql.ConnectionPool(mssqlConfig(URL)).connect();
  pool.on('error', (e) => console.error('[storage] sql server:', e.message));
  await pool.request().query(`IF OBJECT_ID('smartchat_snapshot', 'U') IS NULL
    CREATE TABLE smartchat_snapshot (id INT PRIMARY KEY, data VARBINARY(MAX) NOT NULL, updated_at DATETIME2 NOT NULL)`);
  return {
    async load() { const r = await pool.request().query('SELECT data, updated_at FROM smartchat_snapshot WHERE id=1'); return r.recordset[0] || null; },
    async store(buf) {
      await pool.request().input('d', sql.VarBinary(sql.MAX), buf).query(`MERGE smartchat_snapshot AS t USING (SELECT 1 AS id) AS s ON t.id = s.id
        WHEN MATCHED THEN UPDATE SET data = @d, updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (id, data, updated_at) VALUES (1, @d, SYSUTCDATETIME());`);
    },
    close: () => pool.close()
  };
}

// Document databases have a size limit per document, so the (compressed) copy is split into parts.
// Parts are written under a new "generation" first and the pointer is switched last, so a reader never sees half a copy.
function chunks(buf, size) { const out = []; for (let i = 0; i < buf.length; i += size) out.push(buf.subarray(i, i + size)); return out.length ? out : [Buffer.alloc(0)]; }

// works with any object that looks like a MongoDB collection (findOne / find / replaceOne / deleteMany)
function mongoStore(col) {
  return {
    async load() {
      const m = await col.findOne({ _id: 'meta' });
      if (!m) return null;
      const parts = (await col.find({ gen: m.gen }).toArray()).filter(p => p._id !== 'meta'); // the pointer shares the gen field
      parts.sort((a, b) => a.i - b.i);
      if (parts.length !== m.parts) throw new Error('نسخة البيانات في MongoDB ناقصة');
      const gz = Buffer.concat(parts.map(p => Buffer.isBuffer(p.data) ? p.data : Buffer.from(p.data.buffer))) // driver gives Binary (its .buffer is exactly the bytes);
      return { data: zlib.gunzipSync(gz), updated_at: m.updated_at };
    },
    async store(buf) {
      const gen = Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
      const ps = chunks(zlib.gzipSync(buf), 8 * 1024 * 1024);
      for (let i = 0; i < ps.length; i++) await col.replaceOne({ _id: gen + '_' + i }, { gen, i, data: ps[i] }, { upsert: true });
      await col.replaceOne({ _id: 'meta' }, { gen, parts: ps.length, size: buf.length, updated_at: new Date() }, { upsert: true });
      await col.deleteMany({ _id: { $ne: 'meta' }, gen: { $ne: gen } });
    }
  };
}
async function mongoAdapter(URL) {
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(URL, { serverSelectionTimeoutMS: 15000, maxPoolSize: 2 });
  await client.connect();
  const dbName = (/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/.exec(URL) || [])[1] || 'smartchat';
  return { ...mongoStore(client.db(dbName).collection('smartchat_snapshot')), close: () => client.close() };
}

// Firebase: Cloud Firestore through its REST API, signed in with a service account (no extra package).
// FIRESTORE_EMULATOR_HOST is honoured (no sign-in), as with Google's own libraries.
function firestoreClient(sa, fetchFn = fetch) {
  const emu = process.env.FIRESTORE_EMULATOR_HOST;
  const base = emu ? `http://${emu}/v1` : 'https://firestore.googleapis.com/v1';
  const dbPath = `projects/${sa.project_id}/databases/(default)`;
  const docs = `${dbPath}/documents/smartchat`;
  let token = null, exp = 0;
  async function auth() {
    if (emu) return { Authorization: 'Bearer owner' };
    if (token && Date.now() < exp) return { Authorization: 'Bearer ' + token };
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const iat = Math.floor(Date.now() / 1000);
    const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 });
    const jwt = unsigned + '.' + crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
    const r = await fetchFn(sa.token_uri || 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt, signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('تعذّر الدخول إلى Firebase: ' + (j.error_description || j.error || r.status));
    token = j.access_token; exp = Date.now() + ((j.expires_in || 3600) - 120) * 1000;
    return { Authorization: 'Bearer ' + token };
  }
  async function call(method, url, body) {
    const r = await fetchFn(url, { method, headers: { ...(await auth()), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) });
    if (r.status === 404 && method === 'GET') return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const m = (j.error && j.error.message) || ('HTTP ' + r.status);
      if (/database \(default\) does not exist|NOT_FOUND/i.test(m)) throw new Error('لم يُنشأ Firestore بعد في مشروع Firebase — من لوحة Firebase: Firestore Database ← Create database');
      if (r.status === 403) throw new Error('حساب الخدمة لا يملك صلاحية Firestore (' + m + ')');
      throw new Error('Firebase: ' + m);
    }
    return j;
  }
  const commit = (writes) => call('POST', `${base}/${dbPath}/documents:commit`, { writes });
  return {
    async load() {
      const m = await call('GET', `${base}/${docs}/meta`);
      if (!m) return null;
      const f = m.fields || {}, gen = f.gen.stringValue, n = Number(f.parts.integerValue);
      const parts = [];
      for (let i = 0; i < n; i++) {
        const d = await call('GET', `${base}/${docs}/${gen}_${i}`);
        if (!d) throw new Error('نسخة البيانات في Firebase ناقصة');
        parts.push(Buffer.from(d.fields.data.bytesValue, 'base64'));
      }
      return { data: zlib.gunzipSync(Buffer.concat(parts)), updated_at: f.updated_at.timestampValue };
    },
    async store(buf) {
      const old = await call('GET', `${base}/${docs}/meta`);
      const oldGen = old && old.fields.gen.stringValue, oldN = old ? Number(old.fields.parts.integerValue) : 0;
      const gen = 'g' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
      const ps = chunks(zlib.gzipSync(buf), 700 * 1024); // a Firestore document holds at most 1 MiB
      for (let i = 0; i < ps.length; i += 8) {
        await commit(ps.slice(i, i + 8).map((p, k) => ({ update: { name: `${docs}/${gen}_${i + k}`, fields: { data: { bytesValue: p.toString('base64') } } } })));
      }
      await commit([{ update: { name: `${docs}/meta`, fields: { gen: { stringValue: gen }, parts: { integerValue: String(ps.length) }, size: { integerValue: String(buf.length) }, updated_at: { timestampValue: new Date().toISOString() } } } }]);
      if (oldGen) for (let i = 0; i < oldN; i += 100) await commit(Array.from({ length: Math.min(100, oldN - i) }, (_, k) => ({ delete: `${docs}/${oldGen}_${i + k}` }))).catch(() => {});
    }
  };
}
async function firebaseAdapter(sa) {
  const c = firestoreClient(sa);
  await c.load(); // checks the sign-in and that Firestore exists
  return c;
}

async function openAdapter(c) {
  switch (c.type) {
    case 'supabase': if (!c.url) throw new Error('رابط الاتصال (DATABASE_URL) مطلوب'); return pgAdapter(c.url);
    case 'mysql': if (!c.url) throw new Error('رابط الاتصال (DATABASE_URL) مطلوب'); return mysqlAdapter(c.url);
    case 'mssql': if (!c.url) throw new Error('رابط الاتصال (DATABASE_URL) مطلوب'); return mssqlAdapter(c.url);
    case 'mongodb': if (!c.url) throw new Error('رابط الاتصال (DATABASE_URL) مطلوب'); return mongoAdapter(c.url);
    case 'firebase': if (!c.firebase) throw new Error('ملف حساب الخدمة (FIREBASE_SERVICE_ACCOUNT) مطلوب'); return firebaseAdapter(parseServiceAccount(c.firebase));
    default: throw new Error('no adapter for ' + c.type);
  }
}
async function getAdapter() {
  if (!adapter) adapter = await openAdapter(CFG);
  return adapter;
}

// used by the setup wizard: connect, make sure we can write, and say whether a previous copy exists
async function test(c) {
  c = { type: normType(c.type), url: c.url || '', firebase: c.firebase || null };
  if (c.type === 'sqlite') return { ok: true, existing: null };
  const a = await openAdapter(c);
  try {
    const row = await a.load();
    return { ok: true, existing: row ? { size: row.data.length, updated_at: new Date(row.updated_at).toISOString() } : null };
  } finally { if (a.close) await a.close().catch(() => {}); }
}

/* ---------------- lifecycle ---------------- */

async function restore(dataDir) {
  console.log(`[storage] type: ${CFG.type}`);
  if (!enabled()) return false;
  const a = await getAdapter();
  const row = await a.load();
  if (!row) { console.log('[storage] no remote copy yet — starting fresh'); return false; }
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'chat.db');
  for (const f of [file, file + '-wal', file + '-shm']) { try { fs.unlinkSync(f); } catch { /* none */ } }
  fs.writeFileSync(file, row.data);
  console.log(`[storage] restored database (${(row.data.length / 1024).toFixed(0)} KB, saved ${new Date(row.updated_at).toISOString()})`);
  return true;
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

configure(fromEnv() || { type: 'sqlite' });

module.exports = { TYPES, normType, configure, fromEnv, guessType, enabled, type, test, restore, save, start, parseServiceAccount, mongoStore, firestoreClient, mssqlConfig, get TYPE() { return CFG.type; } };
