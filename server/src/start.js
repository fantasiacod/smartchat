// Entry point:
//  1. decide where data is kept (environment variables, or the choice saved by the setup wizard)
//  2. restore the database from that storage
//  3. if this is a brand-new install (nothing chosen yet, or no administrator), run the setup wizard first
//  4. start the server
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e && e.message || e));
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const persist = require('./persist');
const setup = require('./setup');

function usersIn(file) {
  if (!fs.existsSync(file)) return 0;
  try {
    const D = require('better-sqlite3'), d = new D(file, { readonly: true, fileMustExist: true });
    try { return d.prepare('SELECT COUNT(*) c FROM users').get().c; } finally { d.close(); }
  } catch { return 0; }
}

async function restoreOrExit(dataDir) {
  try { return await persist.restore(dataDir); } catch (e) {
    console.error('[persist] restore failed:', e.message);
    if (persist.enabled()) { console.error('Check the database connection. Refusing to start with an empty database.'); process.exit(1); }
    return false;
  }
}

(async () => {
  const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const PORT = Number(process.env.PORT) || 3000;
  const dbFile = path.join(dataDir, 'chat.db');

  const env = persist.fromEnv();
  const saved = env ? null : setup.loadFile(dataDir);
  if (env || saved) persist.configure(env || saved);
  if (env || saved) await restoreOrExit(dataDir);

  const off = /^(off|false|0|no)$/i.test(process.env.SETUP || '');
  // configured through environment variables (Docker, .env) → keep the old behaviour: SQLite, no wizard
  const needStorage = !env && !saved && !fs.existsSync(dbFile) && !process.env.ADMIN_EMAIL;
  const needAdmin = !usersIn(dbFile) && !process.env.ADMIN_EMAIL;
  let admin = null;
  if (!off && (needStorage || needAdmin)) {
    const r = await setup.run({ dataDir, port: PORT, needStorage, needAdmin, envType: env ? persist.type() : null, existingData: !needAdmin });
    if (r.storage) {
      setup.saveFile(dataDir, r.storage);
      persist.configure(r.storage);
      await restoreOrExit(dataDir);
    }
    admin = r.admin;
    if (admin) { process.env.ADMIN_NAME = admin.name; process.env.ADMIN_EMAIL = admin.email; process.env.ADMIN_PASSWORD = admin.password; }
    console.log('[setup] completed ✅ storage: ' + persist.type());
  }

  const { server } = require('./server');
  const { db } = require('./db');
  if (admin) { // also when the chosen database already had accounts: add / update this administrator
    const u = db.prepare('SELECT id FROM users WHERE email=?').get(admin.email);
    const hash = bcrypt.hashSync(admin.password, 10), t = Date.now();
    if (u) db.prepare("UPDATE users SET name=?, password=?, role='admin', active=1, pwd_changed_at=? WHERE id=?").run(admin.name, hash, t, u.id);
    else db.prepare("INSERT INTO users(name,email,password,role,job_title,created_at,pwd_changed_at) VALUES(?,?,?,'admin','مدير النظام',?,?)").run(admin.name, admin.email, hash, new Date().toISOString(), t);
  }
  persist.start(db);
  server.listen(PORT, () => console.log(`Smart Chat running on http://localhost:${PORT}  (dashboard: /admin/)`));
})();
