// Connectors to the client's own database / API for customer data and order status.
const { db } = require('./db');

const pools = new Map();
const PARAM_RE = /(?<![:\w]):([a-zA-Z_]\w*)/g;

function paramNames(sql) {
  const set = new Set();
  for (const m of String(sql || '').matchAll(PARAM_RE)) set.add(m[1]);
  for (const m of String(sql || '').matchAll(/\{(\w+)\}/g)) set.add(m[1]); // for API urls
  return [...set];
}

async function getPool(ds) {
  const key = ds.type + '|' + ds.connection;
  if (pools.has(key)) return pools.get(key);
  let pool;
  if (ds.type === 'mysql') {
    const mysql = require('mysql2/promise');
    pool = mysql.createPool({ uri: ds.connection, connectionLimit: 5, connectTimeout: 8000 });
  } else if (ds.type === 'postgres') {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: ds.connection, max: 5, connectionTimeoutMillis: 8000 });
  }
  pools.set(key, pool);
  return pool;
}

function assertReadOnly(sql) {
  const s = String(sql || '').trim().toLowerCase();
  if (!/^(select|with)\b/.test(s) || /;\s*\S/.test(s)) throw new Error('يُسمح فقط باستعلامات SELECT واحدة');
}

// Runs `sql` with named params (:name). Returns array of row objects.
async function query(ds, sql, params = {}) {
  if (!ds || ds.type === 'none') throw new Error('لم يتم ربط قاعدة بيانات');
  if (ds.type === 'api') return apiQuery(ds, sql, params);
  assertReadOnly(sql);
  const names = [];
  if (ds.type === 'demo') {
    const text = sql.replace(PARAM_RE, (_, n) => { names.push(n); return '?'; });
    return db.prepare(text).all(...names.map(n => params[n] ?? null));
  }
  const pool = await getPool(ds);
  if (ds.type === 'mysql') {
    const text = sql.replace(PARAM_RE, (_, n) => { names.push(n); return '?'; });
    const [rows] = await pool.query(text, names.map(n => params[n] ?? null));
    return rows;
  }
  if (ds.type === 'postgres') {
    const text = sql.replace(PARAM_RE, (_, n) => { names.push(n); return '$' + names.length; });
    const r = await pool.query(text, names.map(n => params[n] ?? null));
    return r.rows;
  }
  throw new Error('نوع مصدر بيانات غير معروف');
}

// For type=api, the "query" is a URL path/template appended to api_url, e.g.
//   /orders/{order_no}?phone={phone}
// The response may be an object, an array, or {data: [...]}
async function apiQuery(ds, tpl, params) {
  const url = (ds.api_url || '') + String(tpl || '').replace(/\{(\w+)\}/g, (_, n) => encodeURIComponent(params[n] ?? ''));
  let headers = {};
  try { headers = JSON.parse(ds.api_headers || '{}'); } catch { /* ignore */ }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: ctl.signal });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error('API ' + res.status);
    const j = await res.json();
    const d = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : (j?.data && typeof j.data === 'object') ? [j.data] : (j ? [j] : []);
    return d.filter(Boolean);
  } finally { clearTimeout(t); }
}

function resetPools() {
  for (const p of pools.values()) { try { p.end(); } catch { /* ignore */ } }
  pools.clear();
}

module.exports = { query, paramNames, resetPools };
