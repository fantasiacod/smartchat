// Connectors to the client's own data — traditional or cloud — used by the bot to answer from real records
// (beneficiary file, request status, aid schedule…). Every connector is READ-ONLY.
//
//   type       what                                              "query" written as
//   mysql      MySQL / MariaDB / PlanetScale / AWS RDS / Azure    SELECT … WHERE x = :param
//   postgres   PostgreSQL / Supabase / Neon / RDS / Cloud SQL      SELECT … WHERE x = :param
//   mssql      Microsoft SQL Server / Azure SQL                   SELECT … WHERE x = :param
//   oracle     Oracle Database / Oracle Cloud (thin mode)         SELECT … WHERE x = :param
//   sqlite     SQLite file on the server                          SELECT … WHERE x = :param
//   mongodb    MongoDB / MongoDB Atlas                            {"collection":"…","filter":{"phone":":phone"}}
//   sheet      Google Sheets (published CSV link) / any CSV URL   SELECT … FROM data WHERE x = :param
//   file       Excel (.xlsx) or CSV uploaded in the dashboard     SELECT … FROM data WHERE x = :param
//   api        Any REST API (Firebase, Airtable, ERP, CRM…)       /path/{param}?q={param}
//   demo       built-in sample data                               SELECT … FROM demo_orders …
const Database = require('better-sqlite3');
const { db, meta } = require('./db');

const pools = new Map();
const PARAM_RE = /(?<![:\w]):([a-zA-Z_]\w*)/g;
const TYPES = ['demo', 'none', 'wordpress', 'mysql', 'postgres', 'mssql', 'oracle', 'sqlite', 'mongodb', 'sheet', 'file', 'api'];

function paramNames(q) {
  const set = new Set();
  for (const m of String(q || '').matchAll(PARAM_RE)) set.add(m[1]);
  for (const m of String(q || '').matchAll(/\{(\w+)\}/g)) set.add(m[1]); // API url templates
  return [...set];
}

function assertReadOnly(sql) {
  const s = String(sql || '').trim().toLowerCase().replace(/;\s*$/, '');
  if (!/^(select|with)\b/.test(s) || /;\s*\S/.test(s)) throw new Error('يُسمح فقط باستعلامات SELECT واحدة');
  if (/\b(insert|update|delete|drop|alter|create|truncate|merge|grant|exec|execute|into)\b/.test(s.replace(/'[^']*'/g, ''))) throw new Error('الاستعلام يجب أن يكون للقراءة فقط');
}
const isLocal = (url) => /localhost|127\.0\.0\.1/.test(String(url || ''));
const bindNames = (sql, fn) => { const names = []; const text = String(sql).replace(PARAM_RE, (_, n) => { names.push(n); return fn(n, names.length); }); return { text, names }; };

async function getPool(ds) {
  const key = ds.type + '|' + ds.connection;
  if (pools.has(key)) return pools.get(key);
  let pool, url = String(ds.connection || '');
  if (ds.type === 'mysql') {
    const mysql = require('mysql2/promise');
    pool = mysql.createPool({ uri: url.replace(/[?&]ssl=(true|false)/, ''), connectionLimit: 5, connectTimeout: 8000, dateStrings: true, ...(/[?&]ssl=true/.test(url) ? { ssl: { rejectUnauthorized: false } } : {}) });
    if (pool.pool && pool.pool.on) pool.pool.on('error', (e) => console.warn('[datasource] mysql:', e.message));
    pool._end = () => pool.end();
  } else if (ds.type === 'postgres') {
    const { Pool, types } = require('pg');
    types.setTypeParser(1082, v => v); // DATE stays "YYYY-MM-DD" (no timezone shift)
    const local = isLocal(url) || /sslmode=disable/.test(url);
    // cloud Postgres (Supabase, Neon…) needs TLS; their pooler certificates are not in Node's default CA list
    pool = new Pool({ connectionString: url.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, ''), max: 5, connectionTimeoutMillis: 8000, idleTimeoutMillis: 30000, ssl: local ? false : { rejectUnauthorized: false } });
    // a cloud server closing an idle connection must never crash the app
    pool.on('error', (e) => { console.warn('[datasource] postgres idle connection closed:', e.message); });
    pool._end = () => pool.end();
  } else if (ds.type === 'mssql') {
    const sql = require('mssql');
    // accepts "Server=…;Database=…;User Id=…;Password=…;Encrypt=true" or mssql://user:pass@host:1433/db
    const cfg = /^mssql:\/\//i.test(url) ? (() => { const u = new URL(url); return { server: u.hostname, port: Number(u.port) || 1433, database: u.pathname.slice(1), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), options: { encrypt: u.searchParams.get('encrypt') !== 'false', trustServerCertificate: true } }; })() : url;
    pool = await new sql.ConnectionPool(typeof cfg === 'string' ? cfg : { ...cfg, pool: { max: 5 }, connectionTimeout: 8000, requestTimeout: 10000 }).connect();
    pool.on('error', (e) => { console.warn('[datasource] mssql:', e.message); pools.delete(key); });
    pool._end = () => pool.close();
  } else if (ds.type === 'oracle') {
    const oracledb = require('oracledb'); // thin mode: no Oracle client install needed
    // oracle://user:pass@host:1521/service  or  user/pass@host:1521/service
    const m = /^oracle:\/\/([^:]+):([^@]+)@(.+)$/i.exec(url) || /^([^/]+)\/([^@]+)@(.+)$/.exec(url);
    if (!m) throw new Error('صيغة اتصال Oracle: oracle://user:password@host:1521/service');
    pool = await oracledb.createPool({ user: decodeURIComponent(m[1]), password: decodeURIComponent(m[2]), connectString: m[3], poolMax: 5, poolTimeout: 60 });
    pool._end = () => pool.close(0);
  } else if (ds.type === 'sqlite') {
    const path = require('path'), file = path.resolve(url.replace(/^sqlite:\/\//, ''));
    if (file.startsWith(path.resolve(require('./db').DATA_DIR))) throw new Error('لا يمكن ربط قاعدة بيانات البرنامج نفسه');
    pool = new Database(file, { readonly: true, fileMustExist: true });
    pool._end = () => pool.close();
  } else if (ds.type === 'mongodb') {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(url, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
    await client.connect();
    pool = client; pool._end = () => client.close();
  }
  pools.set(key, pool);
  return pool;
}

/* ---------- tabular sources (Google Sheets / CSV link, uploaded Excel / CSV) → in-memory table "data" ---------- */
const tables = new Map(); // key -> { db, at }
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = String(text).replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',' || c === ';' || c === '\t') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}
function cleanCols(head) {
  const seen = {};
  return head.map((h, i) => { let c = String(h || '').trim().replace(/[^\p{L}\p{N}_]+/gu, '_').replace(/^_+|_+$/g, '') || 'col' + (i + 1); if (/^\d/.test(c)) c = 'c_' + c; c = c.toLowerCase(); seen[c] = (seen[c] || 0) + 1; return seen[c] > 1 ? c + '_' + seen[c] : c; });
}
function buildTable(matrix) {
  if (!matrix.length) throw new Error('الملف فارغ');
  const cols = cleanCols(matrix[0]), mem = new Database(':memory:');
  mem.exec(`CREATE TABLE data (${cols.map(c => `"${c}" TEXT`).join(',')})`);
  const ins = mem.prepare(`INSERT INTO data VALUES (${cols.map(() => '?').join(',')})`);
  mem.transaction(() => { for (const r of matrix.slice(1, 50001)) ins.run(...cols.map((_, i) => r[i] == null ? null : String(r[i]).trim())); })();
  return { mem, cols, count: Math.max(0, Math.min(matrix.length - 1, 50000)) };
}
async function sheetTable(url) {
  const hit = tables.get('u:' + url);
  if (hit && Date.now() - hit.at < 60000) return hit.mem;
  let u = String(url).trim();
  const g = /docs\.google\.com\/spreadsheets\/d\/([\w-]+)/.exec(u); // normal sheet link -> CSV export
  if (g && !/output=csv|format=csv/.test(u)) { const gid = (/[#&?]gid=(\d+)/.exec(u) || [])[1]; u = `https://docs.google.com/spreadsheets/d/${g[1]}/export?format=csv${gid ? '&gid=' + gid : ''}`; }
  const res = await fetch(u, { signal: AbortSignal.timeout(10000), redirect: 'follow' });
  if (!res.ok) throw new Error('تعذر قراءة الجدول (' + res.status + ') — تأكد أنه منشور أو متاح لمن لديه الرابط');
  const { mem } = buildTable(parseCSV(await res.text()));
  tables.set('u:' + url, { mem, at: Date.now() });
  return mem;
}
// uploaded files are stored in app_meta as a matrix (first row = column names)
async function importFile(name, buf) {
  let matrix;
  if (/\.xlsx$/i.test(name)) {
    const ExcelJS = require('exceljs'), wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0]; if (!ws) throw new Error('لا توجد أوراق في الملف');
    matrix = [];
    ws.eachRow({ includeEmpty: false }, (row) => { const v = row.values.slice(1).map(c => c && typeof c === 'object' ? (c.text ?? c.result ?? (c instanceof Date ? c.toISOString().slice(0, 10) : '')) : c); matrix.push(v); });
  } else if (/\.(csv|txt)$/i.test(name)) matrix = parseCSV(buf.toString('utf8'));
  else throw new Error('الصيغ المدعومة: Excel (.xlsx) أو CSV');
  const { cols, count } = buildTable(matrix);
  const id = 'f' + Date.now().toString(36);
  meta.set('dsfile_' + id, { name, cols, matrix: matrix.slice(0, 50001), at: new Date().toISOString() });
  tables.delete('f:' + id);
  return { id, connection: 'file:' + id, name, columns: cols, rows: count };
}
function fileTable(conn) {
  const id = String(conn || '').replace(/^file:/, '');
  const hit = tables.get('f:' + id); if (hit) return hit.mem;
  const f = meta.get('dsfile_' + id, null); if (!f) throw new Error('الملف المرفوع غير موجود — ارفعه مرة أخرى');
  const { mem } = buildTable(f.matrix);
  tables.set('f:' + id, { mem, at: Date.now() });
  return mem;
}
function fileInfo(conn) { const f = meta.get('dsfile_' + String(conn || '').replace(/^file:/, ''), null); return f ? { name: f.name, columns: f.cols, rows: f.matrix.length - 1, at: f.at } : null; }

// MongoDB: query is JSON {"collection":"…","filter":{…":param"…},"projection":{…},"sort":{…},"limit":3}
function fillJson(v, params) {
  if (typeof v === 'string') { const m = /^:([a-zA-Z_]\w*)$/.exec(v); return m ? (params[m[1]] ?? null) : v; }
  if (Array.isArray(v)) return v.map(x => fillJson(x, params));
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) { if (/^\$(where|function|accumulator|expr)$/.test(k)) throw new Error('عامل غير مسموح'); o[k] = fillJson(v[k], params); } return o; }
  return v;
}

// Runs a read-only query with named params. Returns an array of row objects.
// dates from any driver → readable text for the bot's reply
const pad = n => String(n).padStart(2, '0');
function fmtVal(v) {
  if (!(v instanceof Date) || isNaN(v)) return v;
  const d = `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  return v.getHours() || v.getMinutes() ? `${d} ${pad(v.getHours())}:${pad(v.getMinutes())}` : d;
}
const normRows = (rows) => Array.isArray(rows) ? rows.map(r => { if (!r || typeof r !== 'object') return r; const o = {}; for (const k of Object.keys(r)) o[k] = fmtVal(r[k]); return o; }) : rows;
async function query(ds, q, params = {}) { return normRows(await runQuery(ds, q, params)); }
async function runQuery(ds, q, params = {}) {
  if (!ds || ds.type === 'none') throw new Error('لم يتم ربط قاعدة بيانات');
  const p = (n) => params[n] ?? null;
  switch (ds.type) {
    case 'api': return apiQuery(ds, q, params);
    case 'wordpress': throw new Error('قاعدة بيانات ووردبريس تُقرأ من داخل الموقع نفسه: جرّبها من نافذة المحادثة في موقعك أو بزر «اختبار»');
    case 'demo': {
      assertReadOnly(q);
      // the demo source runs on the app's own database: only the demo tables may be read
      const tablesUsed = [...String(q).matchAll(/\b(?:from|join)\s+["`]?(\w+)/gi)].map(m => m[1].toLowerCase());
      if (!tablesUsed.length || tablesUsed.some(t => !t.startsWith('demo_'))) throw new Error('البيانات التجريبية: يُسمح فقط بجداول demo_orders و demo_customers');
      const { text, names } = bindNames(q, () => '?');
      return db.prepare(text).all(...names.map(p));
    }
    case 'sheet': case 'file': {
      assertReadOnly(q);
      const mem = ds.type === 'sheet' ? await sheetTable(ds.connection) : fileTable(ds.connection);
      const { text, names } = bindNames(q, () => '?');
      return mem.prepare(text).all(...names.map(p));
    }
    case 'sqlite': {
      assertReadOnly(q);
      const { text, names } = bindNames(q, () => '?');
      return (await getPool(ds)).prepare(text).all(...names.map(p));
    }
    case 'mysql': {
      assertReadOnly(q);
      const { text, names } = bindNames(q, () => '?');
      const [rows] = await (await getPool(ds)).query(text, names.map(p));
      return rows;
    }
    case 'postgres': {
      assertReadOnly(q);
      const { text, names } = bindNames(q, (n, i) => '$' + i);
      return (await (await getPool(ds)).query(text, names.map(p))).rows;
    }
    case 'mssql': {
      assertReadOnly(q);
      const { text, names } = bindNames(q, (n) => '@' + n);
      const req = (await getPool(ds)).request();
      for (const n of new Set(names)) req.input(n, p(n));
      return (await req.query(text)).recordset;
    }
    case 'oracle': {
      assertReadOnly(q);
      const oracledb = require('oracledb'), names = paramNames(q).filter(n => new RegExp(':' + n + '\\b').test(q));
      const conn = await (await getPool(ds)).getConnection();
      try {
        const r = await conn.execute(String(q).replace(/;\s*$/, ''), Object.fromEntries(names.map(n => [n, p(n)])), { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 50 });
        return (r.rows || []).map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v])));
      } finally { await conn.close(); }
    }
    case 'mongodb': {
      let spec; try { spec = JSON.parse(q); } catch { throw new Error('استعلام MongoDB يجب أن يكون JSON مثل {"collection":"beneficiaries","filter":{"phone":":phone"}}'); }
      if (!spec.collection) throw new Error('حدد اسم المجموعة collection');
      const filter = fillJson(spec.filter || {}, params); // validates operators before connecting
      const client = await getPool(ds);
      const cur = client.db(spec.db || undefined).collection(spec.collection).find(filter, { projection: spec.projection || undefined, sort: spec.sort || undefined, limit: Math.min(Number(spec.limit) || 10, 50) });
      return (await cur.toArray()).map(d => { const o = { ...d }; if (o._id != null) o._id = String(o._id); return o; });
    }
    default: throw new Error('نوع مصدر بيانات غير معروف');
  }
}

// For type=api, the "query" is a URL path/template appended to api_url, e.g.  /orders/{order_no}?phone={phone}
// The response may be an object, an array, or {data: [...]} / {records: [...]} (Airtable) / {documents: [...]} (Firestore)
async function apiQuery(ds, tpl, params) {
  const url = (ds.api_url || '') + String(tpl || '').replace(/\{(\w+)\}/g, (_, n) => encodeURIComponent(params[n] ?? ''));
  let headers = {};
  try { headers = JSON.parse(ds.api_headers || '{}'); } catch { /* ignore */ }
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(8000) });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error('API ' + res.status);
  const j = await res.json();
  const list = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : Array.isArray(j?.records) ? j.records.map(r => ({ id: r.id, ...(r.fields || r) }))
    : Array.isArray(j?.documents) ? j.documents.map(d => Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, Object.values(v)[0]])))
      : (j?.data && typeof j.data === 'object') ? [j.data] : (j ? [j] : []);
  return list.filter(Boolean);
}

function resetPools() {
  for (const p of pools.values()) { try { p._end?.(); } catch { /* ignore */ } }
  pools.clear(); tables.clear();
}

/* ---------- schema discovery: lets the dashboard build queries without writing SQL ---------- */
// returns [{ name, columns: [..] }] (max 200 tables)
async function schema(ds) {
  if (!ds || ds.type === 'none') throw new Error('لم يتم ربط قاعدة بيانات');
  const group = (rows, t, c) => { const m = new Map(); for (const r of rows) { const k = r[t]; if (!m.has(k)) m.set(k, []); m.get(k).push(r[c]); } return [...m].slice(0, 200).map(([name, columns]) => ({ name, columns })); };
  const sqliteSchema = (h, only) => h.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
    .filter(t => !only || only(t.name)).slice(0, 200).map(t => ({ name: t.name, columns: h.prepare(`SELECT name FROM pragma_table_info(?)`).all(t.name).map(c => c.name) }));
  switch (ds.type) {
    case 'demo': return sqliteSchema(db, n => n.startsWith('demo_'));
    case 'sheet': return sqliteSchema(await sheetTable(ds.connection));
    case 'file': return sqliteSchema(fileTable(ds.connection));
    case 'sqlite': return sqliteSchema(await getPool(ds));
    case 'mysql': {
      const [rows] = await (await getPool(ds)).query('SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION');
      return group(rows, 't', 'c');
    }
    case 'postgres': {
      const r = await (await getPool(ds)).query("SELECT CASE WHEN table_schema='public' THEN table_name ELSE table_schema||'.'||table_name END AS t, column_name AS c FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_schema NOT LIKE 'pg_%' AND table_schema NOT IN ('auth','storage','realtime','supabase_functions','extensions','graphql','graphql_public','vault','pgsodium','net','cron') ORDER BY 1, ordinal_position");
      return group(r.rows, 't', 'c');
    }
    case 'mssql': {
      const r = await (await getPool(ds)).request().query("SELECT CASE WHEN TABLE_SCHEMA='dbo' THEN TABLE_NAME ELSE TABLE_SCHEMA+'.'+TABLE_NAME END AS t, COLUMN_NAME AS c FROM INFORMATION_SCHEMA.COLUMNS ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION");
      return group(r.recordset, 't', 'c');
    }
    case 'oracle': {
      const oracledb = require('oracledb'), conn = await (await getPool(ds)).getConnection();
      try { const r = await conn.execute('SELECT table_name AS T, column_name AS C FROM user_tab_columns ORDER BY table_name, column_id', {}, { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 5000 }); return group(r.rows, 'T', 'C'); }
      finally { await conn.close(); }
    }
    case 'mongodb': {
      const d = (await getPool(ds)).db();
      const cols = (await d.listCollections({}, { nameOnly: true }).toArray()).slice(0, 100);
      const out = [];
      for (const c of cols) { const docs = await d.collection(c.name).find({}, { limit: 20 }).toArray(); const keys = new Set(); docs.forEach(x => Object.keys(x).forEach(k => keys.add(k))); out.push({ name: c.name, columns: [...keys] }); }
      return out;
    }
    default: throw new Error('هذا النوع لا يدعم عرض الجداول — اكتب الاستعلام يدوياً');
  }
}

// WordPress bridge: the look-up is a JSON spec {table, columns, where:{col: ":param"}, any}; it is signed here and
// read by the plugin inside the site (no SQL leaves the server)
function wpRequest(site, spec, params, op = 'read') {
  let s = spec; if (typeof s === 'string') { try { s = JSON.parse(s || '{}'); } catch { throw new Error('صيغة استعلام ووردبريس غير صحيحة'); } }
  const where = {}; for (const [c, v] of Object.entries(s.where || {})) { const m = /^:([a-zA-Z_]\w*)$/.exec(String(v)); where[c] = m ? (params[m[1]] ?? '') : v; }
  const data = JSON.stringify({ op, table: s.table, columns: s.columns || [], where, any: !!s.any, exp: Math.floor(Date.now() / 1000) + 120, nonce: require('crypto').randomBytes(12).toString('hex') });
  return { data, sig: require('crypto').createHmac('sha256', site.settings.security.identity_secret).update(data).digest('hex') };
}

module.exports = { wpRequest, normRows, schema, query, paramNames, resetPools, importFile, fileInfo, parseCSV, TYPES };
