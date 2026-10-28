// First-run setup wizard.
// The first time the bot starts on a new host it does not open the dashboard yet. It serves a small setup
// page instead, where whoever installed it picks:
//   1) where the bot keeps its data (SQLite on this server, Supabase/PostgreSQL, MySQL, SQL Server, MongoDB, Firebase)
//   2) the administrator account (name, email, password)
// The page is protected by a one-time setup code printed in the server log, so a stranger who finds the
// new address first cannot take over the install. (Opened from the same computer — localhost — no code is needed.)
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const persist = require('./persist');

const WEAK = ['admin123', 'change-me-now', '12345678', 'password', '123456789', 'qwerty123', 'admin1234'];

/* ---------------- the choice saved on disk (when it did not come from environment variables) ---------------- */
const fileOf = (dataDir) => path.join(dataDir, 'storage.json');
function loadFile(dataDir) {
  try { const j = JSON.parse(fs.readFileSync(fileOf(dataDir), 'utf8')); return j && j.type ? j : null; } catch { return null; }
}
function saveFile(dataDir, c) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(fileOf(dataDir), JSON.stringify({ type: c.type, url: c.url || '', firebase: c.firebase || null, saved_at: new Date().toISOString() }, null, 2), { mode: 0o600 });
  try { fs.chmodSync(fileOf(dataDir), 0o600); } catch { /* windows */ }
}

// environment variables to copy into the host (needed on hosts whose disk is wiped on restart, e.g. Render free)
function envLines(c) {
  if (!c || c.type === 'sqlite') return [];
  if (c.type === 'firebase') {
    const sa = persist.parseServiceAccount(c.firebase);
    return [['DB_TYPE', 'firebase'], ['FIREBASE_SERVICE_ACCOUNT', Buffer.from(JSON.stringify(sa)).toString('base64')]];
  }
  return [['DB_TYPE', c.type], ['DATABASE_URL', c.url]];
}

// builds a connection link from the separate boxes (host, port, database, user, password)
function buildUrl(type, f) {
  const enc = encodeURIComponent, host = String(f.host || '').trim(), db = String(f.database || '').trim();
  if (!host) throw new Error('اكتب عنوان الخادم (Host)');
  const port = String(f.port || '').trim() || { mysql: '3306', mssql: '1433', supabase: '5432' }[type];
  const scheme = { mysql: 'mysql', mssql: 'mssql', supabase: 'postgresql' }[type];
  return `${scheme}://${enc(String(f.user || '').trim())}:${enc(String(f.password || ''))}@${host}:${port}/${enc(db)}`;
}

function storageFrom(body) {
  const type = persist.normType(body.type);
  if (!persist.TYPES.includes(type)) throw new Error('اختر نوع قاعدة البيانات');
  if (type === 'sqlite') return { type };
  if (type === 'firebase') return { type, firebase: persist.parseServiceAccount(body.firebase) };
  let url = String(body.url || '').trim();
  if (!url && ['mysql', 'mssql', 'supabase'].includes(type)) url = buildUrl(type, body);
  if (!url) throw new Error('الصق رابط الاتصال');
  if (type === 'mongodb' && !/^mongodb(\+srv)?:\/\//.test(url)) throw new Error('رابط MongoDB يبدأ بـ mongodb+srv:// أو mongodb://');
  if (type === 'supabase' && !/^postgres(ql)?:\/\//.test(url)) throw new Error('رابط PostgreSQL / Supabase يبدأ بـ postgresql://');
  if (type === 'mysql' && !/^mysql2?:\/\//.test(url)) throw new Error('رابط MySQL يبدأ بـ mysql://');
  if (type === 'mssql' && !/^(mssql|sqlserver):\/\//.test(url)) throw new Error('رابط SQL Server يبدأ بـ mssql://');
  if (/\[YOUR-PASSWORD\]|YOUR_PASSWORD|<password>/i.test(url)) throw new Error('استبدل [YOUR-PASSWORD] في الرابط بكلمة مرور قاعدة البيانات');
  if (/<[^>]*>/.test(url)) throw new Error('احذف علامات < > من الرابط — اكتب اسم المستخدم وكلمة المرور بدونها، مثل: mongodb+srv://user:pass@…');
  return { type, url };
}

function adminFrom(body, required) {
  const name = String(body.admin_name || '').trim(), email = String(body.admin_email || '').trim().toLowerCase(), pass = String(body.admin_password || '');
  if (!required && !name && !email && !pass) return null;
  if (!name) throw new Error('اكتب اسم المدير');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('البريد الإلكتروني غير صحيح');
  if (pass.length < 8) throw new Error('كلمة المرور 8 أحرف على الأقل');
  if (WEAK.includes(pass.toLowerCase()) || /^(.)\1+$/.test(pass)) throw new Error('كلمة المرور سهلة التخمين — اختر غيرها');
  if (pass !== String(body.admin_password2 ?? pass)) throw new Error('كلمتا المرور غير متطابقتين');
  return { name, email, password: pass };
}

// true when the request really comes from this computer (not through a proxy / the internet)
function isLocal(req) {
  const ip = String(req.socket.remoteAddress || '');
  const proxied = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.headers['forwarded'];
  return !proxied && /^(127\.|::1$|::ffff:127\.)/.test(ip);
}

/**
 * Serves the wizard until it is completed.
 * @returns {Promise<{storage: object|null, admin: object|null}>}
 */
function run({ dataDir, port, needStorage, needAdmin, envType = null, existingData = false }) {
  const code = String(process.env.SETUP_CODE || '').trim() || (crypto.randomInt(1000, 9999) + '-' + crypto.randomInt(1000, 9999));
  let wrong = 0, lockedUntil = 0;
  const line = '═'.repeat(58);
  console.log(`\n${line}\n  🔧 الإعداد الأول — افتح رابط البوت في المتصفح لإكمال الإعداد\n  First-run setup — open the bot's address in your browser\n\n  رمز الإعداد / Setup code:   ${code}\n${line}\n`);

  return new Promise((resolve) => {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json({ limit: '200kb' }));
    app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('X-Frame-Options', 'DENY'); next(); });

    const guard = (req, res, next) => {
      if (isLocal(req)) return next();
      if (Date.now() < lockedUntil) return res.status(429).json({ error: 'محاولات خاطئة كثيرة — انتظر 10 دقائق' });
      const given = String(req.body.code || '').replace(/\s/g, '');
      const ok = given.length === code.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(code));
      if (!ok) {
        if (++wrong >= 8) { lockedUntil = Date.now() + 10 * 60000; wrong = 0; }
        return res.status(403).json({ error: 'رمز الإعداد غير صحيح — تجده في سجلات الاستضافة (Logs)', code: true });
      }
      next();
    };

    app.get('/healthz', (req, res) => res.json({ ok: true, setup: true }));
    app.get('/setup', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'setup', 'index.html')));
    app.get('/api/setup/info', (req, res) => res.json({
      setup: true, need_code: !isLocal(req), need_storage: needStorage, need_admin: needAdmin, env_type: envType, existing_data: existingData,
      ephemeral: !!(process.env.RENDER || process.env.KOYEB_APP_NAME || process.env.RAILWAY_ENVIRONMENT || process.env.DYNO || process.env.FLY_APP_NAME)
    }));
    app.post('/api/setup/code', guard, (req, res) => res.json({ ok: true }));
    app.post('/api/setup/test', guard, async (req, res) => {
      try {
        const c = storageFrom(req.body);
        const r = await persist.test(c);
        res.json({ ok: true, existing: r.existing });
      } catch (e) { res.status(400).json({ error: friendly(e, req.body) }); }
    });
    app.post('/api/setup/finish', guard, async (req, res) => {
      try {
        let storage = null, existing = existingData;
        if (needStorage) {
          storage = storageFrom(req.body);
          const r = await persist.test(storage);
          existing = !!r.existing;
        }
        const admin = adminFrom(req.body, needAdmin && !existing);
        res.json({ ok: true, env: envLines(storage), type: storage ? storage.type : envType });
        setTimeout(() => {
          server.close(); if (server.closeAllConnections) server.closeAllConnections();
          resolve({ storage, admin });
        }, 300);
      } catch (e) { res.status(400).json({ error: friendly(e, req.body) }); }
    });
    // everything else leads to the wizard (the dashboard opens after it is completed)
    app.use((req, res) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io')) return res.status(503).json({ error: 'setup required', setup: true });
      if (req.path === '/widget.js') return res.type('js').send('/* Smart Chat: setup not completed yet */');
      res.redirect('/setup');
    });
    const server = http.createServer(app);
    server.listen(port, () => console.log(`[setup] waiting for setup on http://localhost:${port}/setup`));
  });
}

// connection errors in plain words
// the usual ports tell which database is really listening there
const PORT_OF = { 3306: 'mysql', 1433: 'mssql', 5432: 'supabase', 6543: 'supabase', 27017: 'mongodb' };
const NAME_OF = { mysql: 'MySQL / MariaDB', mssql: 'SQL Server', supabase: 'Supabase / PostgreSQL', mongodb: 'MongoDB' };
function portOf(body) {
  if (body.port) return Number(body.port);
  const m = /:\/\/[^/]*:(\d+)(\/|$)/.exec(String(body.url || '')); return m ? Number(m[1]) : null;
}
function friendly(e, body = {}) {
  const m = String((e && e.message) || e);
  const t = persist.normType(body.type), real = PORT_OF[portOf(body)];
  if (real && t && real !== t && NAME_OF[real]) return `المنفذ ${portOf(body)} خاص بـ ${NAME_OF[real]} — يبدو أنك اخترت النوع الخطأ. اختر «${NAME_OF[real]}» من الأعلى (في XAMPP قاعدة البيانات هي MySQL)`;
  if (/Unable to process incoming packet|Connection lost|unexpected packet|ECONNRESET|Packets out of order/i.test(m)) return 'انقطع الاتصال — غالباً نوع قاعدة البيانات المختار لا يطابق الخادم (مثلاً اخترت SQL Server والخادم MySQL). تأكد من النوع والمنفذ';
  if (/ENOTFOUND|getaddrinfo/i.test(m)) return 'لم يتم العثور على الخادم — تأكد من العنوان (Host) في الرابط';
  if (/ECONNREFUSED/i.test(m)) return 'الخادم رفض الاتصال — تأكد من المنفذ (Port) ومن السماح بالاتصال الخارجي';
  if (/ETIMEDOUT|timeout|timed out/i.test(m)) return 'انتهت مهلة الاتصال — الخادم لا يسمح بالاتصال من خارج الاستضافة أو العنوان غير صحيح';
  if (/password authentication failed|Access denied|Login failed|bad auth|Authentication failed/i.test(m)) return 'اسم المستخدم أو كلمة مرور قاعدة البيانات غير صحيحة';
  if (/does not exist|Unknown database|Cannot open database/i.test(m)) return 'اسم قاعدة البيانات غير موجود — أنشئها أولاً أو صحّح الاسم';
  if (/permission denied|CREATE command denied|not authorized/i.test(m)) return 'المستخدم لا يملك صلاحية إنشاء جدول — امنحه صلاحية الإنشاء والكتابة';
  return m;
}

module.exports = { run, loadFile, saveFile, envLines, storageFrom, adminFrom, buildUrl, isLocal, friendly, fileOf };
