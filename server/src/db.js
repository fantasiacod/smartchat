const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { defaultSettings, defaultTree, deepMerge } = require('./defaults');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'chat.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent', active INTEGER NOT NULL DEFAULT 1, last_seen TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, key TEXT UNIQUE NOT NULL, settings TEXT, tree TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL, visitor_name TEXT, visitor_email TEXT, visitor_phone TEXT,
  verified INTEGER DEFAULT 0, meta TEXT, state TEXT,
  status TEXT NOT NULL DEFAULT 'bot',          -- bot | waiting | human | closed
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  closed_by TEXT,                              -- visitor | agent | system
  closed_by_user INTEGER,
  rating REAL, rating_comment TEXT, page_url TEXT,
  created_at TEXT, updated_at TEXT, handoff_at TEXT, closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_conv_visitor ON conversations(site_id, visitor_id, status);
CREATE INDEX IF NOT EXISTS idx_conv_status ON conversations(status, updated_at);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,                        -- visitor | bot | agent | system
  agent_id INTEGER, body TEXT, payload TEXT, created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, id);
CREATE TABLE IF NOT EXISTS kb (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  question TEXT NOT NULL, answer TEXT NOT NULL, keywords TEXT DEFAULT '',
  media TEXT DEFAULT '[]',
  source TEXT DEFAULT 'manual', source_conversation INTEGER, hits INTEGER DEFAULT 0, active INTEGER DEFAULT 1,
  created_by INTEGER, created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT, details TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS demo_orders (
  order_no TEXT PRIMARY KEY, phone TEXT, email TEXT, customer_name TEXT, status TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS demo_customers (
  id INTEGER PRIMARY KEY, name TEXT, email TEXT, phone TEXT, city TEXT, tier TEXT
);
`);

// Upgrade databases created by earlier releases without losing existing Q&As.
if (!db.prepare('PRAGMA table_info(kb)').all().some(c => c.name === 'media')) {
  db.exec("ALTER TABLE kb ADD COLUMN media TEXT NOT NULL DEFAULT '[]'");
}

const now = () => new Date().toISOString();

function seed() {
  if (!db.prepare('SELECT COUNT(*) c FROM users').get().c) {
    const email = process.env.ADMIN_EMAIL || 'admin@example.com';
    const pass = process.env.ADMIN_PASSWORD || 'admin123';
    db.prepare('INSERT INTO users(name,email,password,role,created_at) VALUES(?,?,?,?,?)')
      .run('المدير العام', email.toLowerCase(), bcrypt.hashSync(pass, 10), 'admin', now());
    console.log(`[seed] admin user created: ${email} / ${pass}  (change it after first login)`);
  }
  if (!db.prepare('SELECT COUNT(*) c FROM sites').get().c) {
    createSite('موقعي', process.env.DEFAULT_SITE_KEY);
  }
  if (!db.prepare('SELECT COUNT(*) c FROM demo_orders').get().c) {
    const o = db.prepare('INSERT INTO demo_orders VALUES(?,?,?,?,?,?)');
    o.run('1001', '0500000001', 'ahmed@example.com', 'أحمد محمد', 'قيد التجهيز', 'سيتم الشحن خلال يومين');
    o.run('1002', '0500000002', 'sara@example.com', 'سارة علي', 'تم الشحن', 'رقم الشحنة SMSA 123456789');
    o.run('1003', '0500000001', 'ahmed@example.com', 'أحمد محمد', 'تم التوصيل', '');
    const c = db.prepare('INSERT INTO demo_customers(name,email,phone,city,tier) VALUES(?,?,?,?,?)');
    c.run('أحمد محمد', 'ahmed@example.com', '0500000001', 'جدة', 'ذهبي');
    c.run('سارة علي', 'sara@example.com', '0500000002', 'الرياض', 'فضي');
  }
}

function createSite(name, key) {
  const k = key || crypto.randomBytes(9).toString('base64url');
  const info = db.prepare('INSERT INTO sites(name,key,settings,tree,created_at) VALUES(?,?,?,?,?)')
    .run(name, k, JSON.stringify(defaultSettings()), JSON.stringify(defaultTree()), now());
  const sid = info.lastInsertRowid;
  const kb = db.prepare('INSERT INTO kb(site_id,question,answer,keywords,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?)');
  kb.run(sid, 'كم مدة التوصيل؟', 'مدة التوصيل من 2 إلى 5 أيام عمل داخل المملكة.', 'توصيل,شحن,مدة', 'manual', now(), now());
  kb.run(sid, 'هل يوجد فرع؟', 'متجرنا إلكتروني بالكامل، ونوصل لجميع مدن المملكة.', 'فرع,محل,موقع', 'manual', now(), now());
  return getSite(sid);
}

function hydrateSite(row) {
  if (!row) return null;
  return {
    ...row,
    settings: deepMerge(defaultSettings(), JSON.parse(row.settings || '{}')),
    tree: JSON.parse(row.tree || 'null') || defaultTree()
  };
}
const getSite = (id) => hydrateSite(db.prepare('SELECT * FROM sites WHERE id=?').get(id));
const getSiteByKey = (key) => hydrateSite(db.prepare('SELECT * FROM sites WHERE key=?').get(key));

function hydrateConv(row) {
  if (!row) return null;
  return { ...row, meta: JSON.parse(row.meta || '{}'), state: JSON.parse(row.state || '{}') };
}
const getConv = (id) => hydrateConv(db.prepare('SELECT * FROM conversations WHERE id=?').get(id));

function audit(userId, action, details) {
  db.prepare('INSERT INTO audit(user_id,action,details,created_at) VALUES(?,?,?,?)')
    .run(userId || null, action, typeof details === 'string' ? details : JSON.stringify(details || {}), now());
}

seed();

module.exports = { db, now, getSite, getSiteByKey, createSite, getConv, hydrateConv, audit, DATA_DIR };
