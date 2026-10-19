const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { defaultSettings, defaultTree, deepMerge, migrateSettings } = require('./defaults');

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
  status TEXT NOT NULL DEFAULT 'bot',
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  closed_by TEXT, closed_by_user INTEGER,
  rating REAL, rating_comment TEXT, page_url TEXT,
  created_at TEXT, updated_at TEXT, handoff_at TEXT, closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_conv_visitor ON conversations(site_id, visitor_id, status);
CREATE INDEX IF NOT EXISTS idx_conv_status ON conversations(status, updated_at);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL, agent_id INTEGER, body TEXT, payload TEXT, created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, id);
CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY, extension TEXT NOT NULL, mime TEXT NOT NULL, name TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT
);
CREATE TABLE IF NOT EXISTS kb (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  question TEXT NOT NULL, answer TEXT NOT NULL, keywords TEXT DEFAULT '', media TEXT DEFAULT '[]',
  source TEXT DEFAULT 'manual', source_conversation INTEGER, hits INTEGER DEFAULT 0, active INTEGER DEFAULT 1,
  created_by INTEGER, created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS unanswered (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  conversation_id INTEGER, question TEXT NOT NULL, lang TEXT, status TEXT DEFAULT 'open',
  kb_id INTEGER, count INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  number TEXT UNIQUE, type TEXT NOT NULL DEFAULT 'complaint', status TEXT NOT NULL DEFAULT 'new',
  priority TEXT DEFAULT 'normal', category TEXT, name TEXT, phone TEXT, email TEXT, text TEXT NOT NULL,
  reply TEXT, internal_note TEXT, lang TEXT DEFAULT 'ar', conversation_id INTEGER,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT, updated_at TEXT, resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tickets ON tickets(site_id, status, created_at);
CREATE TABLE IF NOT EXISTS ticket_events (
  id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id INTEGER, kind TEXT, details TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS notify_log (
  id INTEGER PRIMARY KEY, site_id INTEGER, channel TEXT, recipient TEXT, subject TEXT, status TEXT, error TEXT, ref TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS widget_pings (
  site_id INTEGER, origin TEXT, last_seen TEXT, hits INTEGER DEFAULT 0, PRIMARY KEY (site_id, origin)
);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT, details TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS demo_orders (order_no TEXT PRIMARY KEY, phone TEXT, email TEXT, customer_name TEXT, status TEXT, notes TEXT);
CREATE TABLE IF NOT EXISTS demo_customers (id INTEGER PRIMARY KEY, name TEXT, email TEXT, phone TEXT, city TEXT, tier TEXT);
`);

// ---- non-destructive column upgrades for databases created by earlier releases ----
function addColumn(table, col, def) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addColumn('kb', 'media', "TEXT DEFAULT '[]'");
addColumn('kb', 'lang', "TEXT DEFAULT 'all'");
addColumn('users', 'job_title', "TEXT DEFAULT ''");
addColumn('users', 'avatar', "TEXT DEFAULT ''");
addColumn('users', 'prefs', "TEXT DEFAULT '{}'");
addColumn('users', 'phone', "TEXT DEFAULT ''");
addColumn('conversations', 'lang', "TEXT DEFAULT 'ar'");
addColumn('conversations', 'first_response_at', 'TEXT');
addColumn('conversations', 'tags', "TEXT DEFAULT ''");

const now = () => new Date().toISOString();

function seed() {
  if (!db.prepare('SELECT COUNT(*) c FROM users').get().c) {
    const email = process.env.ADMIN_EMAIL || 'admin@example.com';
    const pass = process.env.ADMIN_PASSWORD || 'admin123';
    db.prepare('INSERT INTO users(name,email,password,role,job_title,created_at) VALUES(?,?,?,?,?,?)')
      .run('المدير العام', email.toLowerCase(), bcrypt.hashSync(pass, 10), 'admin', 'مدير النظام', now());
    console.log(`[seed] admin user created: ${email}`);
  }
  if (!db.prepare('SELECT COUNT(*) c FROM sites').get().c) createSite('موقعي', process.env.DEFAULT_SITE_KEY);
  if (!db.prepare('SELECT COUNT(*) c FROM demo_orders').get().c) {
    const o = db.prepare('INSERT INTO demo_orders VALUES(?,?,?,?,?,?)');
    o.run('1001', '0500000001', 'ahmed@example.com', 'أحمد محمد', 'قيد التجهيز', 'سيتم الشحن خلال يومين');
    o.run('1002', '0500000002', 'sara@example.com', 'سارة علي', 'تم الشحن', 'رقم الشحنة SMSA 123456789');
    const c = db.prepare('INSERT INTO demo_customers(name,email,phone,city,tier) VALUES(?,?,?,?,?)');
    c.run('أحمد محمد', 'ahmed@example.com', '0500000001', 'جدة', 'ذهبي');
    c.run('سارة علي', 'sara@example.com', '0500000002', 'الرياض', 'فضي');
  }
}

function createSite(name, key) {
  const k = key || crypto.randomBytes(9).toString('base64url');
  const s = defaultSettings(); s.version = 2;
  const info = db.prepare('INSERT INTO sites(name,key,settings,tree,created_at) VALUES(?,?,?,?,?)')
    .run(name, k, JSON.stringify(s), JSON.stringify(defaultTree()), now());
  const sid = info.lastInsertRowid;
  const kb = db.prepare('INSERT INTO kb(site_id,question,answer,keywords,source,lang,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)');
  kb.run(sid, 'كم مدة التوصيل؟', 'مدة التوصيل من 2 إلى 5 أيام عمل.', 'توصيل,شحن,مدة', 'manual', 'all', now(), now());
  return getSite(sid);
}

const OLD_ROOT_TEXT = 'أنا المساعد الذكي، كيف أقدر أخدمك اليوم؟';

// One-time upgrade of stored site settings/tree (runs at boot).
function upgradeSites() {
  for (const row of db.prepare('SELECT * FROM sites').all()) {
    let s; try { s = JSON.parse(row.settings || '{}'); } catch { s = {}; }
    if ((s.version || 1) >= 2) continue;
    s.behavior = s.behavior || {};
    s.behavior.no_answer_action = 'handoff'; // human agent is the last resort when the bot has no answer
    s.version = 2;
    let tree; try { tree = JSON.parse(row.tree || 'null'); } catch { tree = null; }
    const root = tree?.nodes?.find(n => n.id === tree.root);
    if (!tree || (root && String(root.message || '').includes(OLD_ROOT_TEXT))) tree = defaultTree();
    db.prepare('UPDATE sites SET settings=?, tree=? WHERE id=?').run(JSON.stringify(s), JSON.stringify(tree), row.id);
    console.log(`[upgrade] site ${row.id} upgraded to settings v2`);
  }
}

function hydrateSite(row) {
  if (!row) return null;
  let saved; try { saved = JSON.parse(row.settings || '{}'); } catch { saved = {}; }
  const settings = migrateSettings(deepMerge(defaultSettings(), saved));
  let tree; try { tree = JSON.parse(row.tree || 'null'); } catch { tree = null; }
  return { ...row, settings, tree: tree && Array.isArray(tree.nodes) && tree.nodes.length ? tree : defaultTree() };
}
const getSite = (id) => hydrateSite(db.prepare('SELECT * FROM sites WHERE id=?').get(id));
const getSiteByKey = (key) => hydrateSite(db.prepare('SELECT * FROM sites WHERE key=?').get(key));

function hydrateConv(row) {
  if (!row) return null;
  let meta = {}, state = {};
  try { meta = JSON.parse(row.meta || '{}'); } catch { /* ignore */ }
  try { state = JSON.parse(row.state || '{}'); } catch { /* ignore */ }
  return { ...row, meta, state };
}
const getConv = (id) => hydrateConv(db.prepare('SELECT * FROM conversations WHERE id=?').get(id));

function audit(userId, action, details) {
  db.prepare('INSERT INTO audit(user_id,action,details,created_at) VALUES(?,?,?,?)')
    .run(userId || null, action, typeof details === 'string' ? details : JSON.stringify(details || {}), now());
}

seed();
upgradeSites();

module.exports = { db, now, getSite, getSiteByKey, createSite, getConv, hydrateConv, audit, DATA_DIR };
