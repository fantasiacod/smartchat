require('dotenv').config();
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { db, now, getSite, getSiteByKey, createSite, getConv, audit, DATA_DIR } = require('./db');
const { defaultSettings, defaultTree, deepMerge } = require('./defaults');
const { texts, LANGS } = require('./i18n');
const chat = require('./chat');
const ds = require('./datasource');
const tickets = require('./tickets');
const notify = require('./notify');
const reports = require('./reports');
const patterns = require('../public/patterns');
const persistence = require('./persist');

const PORT = Number(process.env.PORT) || 3000;
const secretFile = path.join(DATA_DIR, '.jwt_secret');
const JWT_SECRET = process.env.JWT_SECRET || (fs.existsSync(secretFile) ? fs.readFileSync(secretFile, 'utf8')
  : (() => { const s = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(secretFile, s); return s; })());

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '3mb' }));
const PUB = path.join(__dirname, '..', 'public');
const ROOT = path.join(__dirname, '..', '..');

/* ============================== public ============================== */
const cors = (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
};

app.get(['/widget.js', '/patterns.js'], cors, (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.sendFile(path.join(PUB, req.path.slice(1)));
});

const patternCache = new Map();
app.get('/pattern/:id.svg', cors, (req, res) => {
  const id = String(req.params.id).replace(/[^a-z0-9]/gi, '');
  let asset = patternCache.get(id);
  if (asset === undefined) {
    const f = path.join(PUB, 'pattern-assets', id + '.json');
    asset = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; patternCache.set(id, asset);
  }
  if (!asset) return res.status(404).end();
  const c = /^[0-9a-f]{6}$/i.test(String(req.query.c || '')) ? '#' + req.query.c : '#41b072';
  const o = Math.min(1, Math.max(0.02, Number(req.query.o) || 0.08)), s = Math.min(4, Math.max(0.2, Number(req.query.s) || 1));
  res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=604800' });
  res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(asset.w * s * (asset.k || 0.6))}" height="${Math.round(asset.h * s * (asset.k || 0.6))}" viewBox="${asset.ox} ${asset.oy} ${asset.w} ${asset.h}"><path fill="${patterns.rgba(c, o)}" fill-rule="evenodd" d="${asset.d}"/></svg>`);
});

function widgetConfig(site, base = '') {
  const a = site.settings.appearance, o = site.settings.org, L = site.settings.languages;
  const enabled = (L.enabled || ['ar']).filter(l => LANGS[l]);
  return {
    name: site.name,
    appearance: { ...a, pattern_css: patterns.css(a.pattern, a.pattern_color || a.primary_color, a.pattern_opacity, a.pattern_scale, base), pattern_header_css: patterns.css(a.pattern, '#ffffff', Math.min(0.25, (Number(a.pattern_opacity) || 0.07) * 2.2), a.pattern_scale, base) },
    prechat: site.settings.prechat,
    org: { name: o.name || a.company_name || '', unified_number: o.unified_number || '' },
    languages: { enabled, default: enabled.includes(L.default) ? L.default : enabled[0], show_switcher: L.show_switcher !== false && enabled.length > 1, meta: Object.fromEntries(enabled.map(l => [l, LANGS[l]])) },
    texts: Object.fromEntries(enabled.map(l => [l, texts(site, l)])),
    tickets: { enabled: site.settings.tickets.enabled, require_email: site.settings.tickets.require_email }
  };
}

app.get('/api/widget/config', cors, (req, res) => {
  const site = getSiteByKey(String(req.query.site || ''));
  if (!site) return res.status(404).json({ error: 'site not found' });
  res.json(widgetConfig(site, `${req.protocol}://${req.get('host')}`));
});

app.get('/healthz', (req, res) => res.json({ ok: true, version: 2 }));
app.get('/', (req, res) => res.redirect('/admin/'));
app.use('/admin', express.static(path.join(PUB, 'admin')));
app.use('/demo', express.static(path.join(PUB, 'demo')));

/* ============================== media ============================== */
const MEDIA_TYPES = {
  'image/jpeg': { ext: 'jpg', kind: 'image' }, 'image/png': { ext: 'png', kind: 'image' }, 'image/gif': { ext: 'gif', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' }, 'video/mp4': { ext: 'mp4', kind: 'video' }, 'video/webm': { ext: 'webm', kind: 'video' },
  'video/ogg': { ext: 'ogv', kind: 'video' }, 'application/pdf': { ext: 'pdf', kind: 'pdf' }
};
const MAX_MEDIA = (Number(process.env.MAX_MEDIA_MB) || 15) * 1024 * 1024;

function cleanMedia(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 6) throw new Error('يمكن إرفاق 6 ملفات كحد أقصى');
  return value.map(m => {
    const url = String(m?.url || '');
    const local = /^\/media\/[a-f0-9-]+\.(jpg|png|gif|webp|mp4|webm|ogv|pdf)$/i.test(url);
    const remote = /^https:\/\/[^\s"'<>]+$/i.test(url);
    if (!local && !remote) throw new Error('مرفق غير صالح');
    const type = ['image', 'video', 'pdf', 'youtube', 'link'].includes(m.type) ? m.type : 'link';
    return { url, type, name: String(m.name || '').slice(0, 120) };
  });
}

app.post('/api/media', auth(), express.raw({ type: 'application/octet-stream', limit: MAX_MEDIA }), async (req, res) => {
  const mime = String(req.query.type || '').toLowerCase();
  const spec = MEDIA_TYPES[mime], b = req.body;
  if (!spec || !Buffer.isBuffer(b) || !b.length) return res.status(400).json({ error: 'صيغة الملف غير مدعومة. المدعوم: صور JPG/PNG/WEBP/GIF، فيديو MP4/WEBM، ملفات PDF' });
  const ok = mime === 'image/jpeg' ? b[0] === 0xff && b[1] === 0xd8
    : mime === 'image/png' ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mime === 'image/gif' ? b.subarray(0, 3).toString() === 'GIF'
        : mime === 'image/webp' ? b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP'
          : mime === 'video/mp4' ? b.subarray(4, 8).toString() === 'ftyp'
            : mime === 'video/webm' ? b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
              : mime === 'video/ogg' ? b.subarray(0, 4).toString() === 'OggS' : b.subarray(0, 5).toString() === '%PDF-';
  if (!ok) return res.status(400).json({ error: 'محتوى الملف لا يطابق صيغته' });
  const id = crypto.randomUUID();
  const name = String(req.query.name || 'مرفق').replace(/[\r\n\0]/g, '').slice(0, 120);
  db.prepare('INSERT INTO media_assets(id,extension,mime,name,data,created_at) VALUES(?,?,?,?,?,?)').run(id, spec.ext, mime, name, b, now());
  persistence.save(db, true).catch(() => { });
  res.json({ url: `/media/${id}.${spec.ext}`, type: spec.kind, name, size: b.length });
});

app.get('/media/:file', cors, (req, res, next) => {
  const m = /^([a-f0-9-]+)\.(jpg|png|gif|webp|mp4|webm|ogv|pdf)$/i.exec(req.params.file);
  if (!m) return next();
  const a = db.prepare('SELECT mime,name,data FROM media_assets WHERE id=?').get(m[1]);
  if (!a) return res.status(404).end();
  const total = a.data.length, range = req.headers.range;
  res.set({ 'Content-Type': a.mime, 'Accept-Ranges': 'bytes', 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(a.name)}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=86400, immutable' });
  const r = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (r) {
    const start = r[1] ? Number(r[1]) : 0, end = r[2] ? Math.min(Number(r[2]), total - 1) : total - 1;
    if (start >= total || start > end) return res.status(416).set('Content-Range', `bytes */${total}`).end();
    res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(end - start + 1) });
    return res.end(a.data.subarray(start, end + 1));
  }
  res.set('Content-Length', String(total)).end(a.data);
});

/* ============================== auth ============================== */
const ROLE_LEVEL = { agent: 1, supervisor: 2, admin: 3 };
function auth(minRole = 'agent') {
  return (req, res, next) => {
    try {
      const tok = (req.headers.authorization || '').replace(/^Bearer /, '') || String(req.query.token || '');
      const p = jwt.verify(tok, JWT_SECRET);
      const u = db.prepare('SELECT id,name,email,role,active,job_title,avatar,phone,prefs FROM users WHERE id=?').get(p.id);
      if (!u || !u.active) return res.status(401).json({ error: 'unauthorized' });
      if (ROLE_LEVEL[u.role] < ROLE_LEVEL[minRole]) return res.status(403).json({ error: 'ليس لديك صلاحية' });
      req.user = u; next();
    } catch { res.status(401).json({ error: 'unauthorized' }); }
  };
}

const attempts = new Map();
app.post('/api/auth/login', (req, res) => {
  const key = req.ip, a = attempts.get(key) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60000) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 10) return res.status(429).json({ error: 'محاولات كثيرة، حاول بعد 15 دقيقة' });
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(req.body.email || '').toLowerCase().trim());
  if (!u || !u.active || !bcrypt.compareSync(String(req.body.password || ''), u.password)) { a.n++; attempts.set(key, a); return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة' }); }
  attempts.delete(key); audit(u.id, 'login', { ip: req.ip });
  res.json({ token: jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: '7d' }) });
});

const WEAK = ['admin123', 'change-me-now', '12345678', 'password'];
function meOut(u) {
  let prefs = {}; try { prefs = JSON.parse(u.prefs || '{}'); } catch { /* ignore */ }
  return { id: u.id, name: u.name, email: u.email, role: u.role, job_title: u.job_title || '', avatar: u.avatar || '', phone: u.phone || '', prefs };
}
app.get('/api/me', auth(), (req, res) => {
  const hash = db.prepare('SELECT password FROM users WHERE id=?').get(req.user.id).password;
  res.json({ ...meOut(req.user), weak_password: WEAK.some(p => bcrypt.compareSync(p, hash)) });
});

const cleanAvatar = (v) => { const s = String(v || ''); if (!s) return ''; if (!/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(s) || s.length > 400000) throw new Error('صورة غير صالحة'); return s; };

app.put('/api/me', auth(), (req, res) => {
  const { name, password, current_password, job_title, avatar, phone, prefs } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (password) {
    if (!bcrypt.compareSync(String(current_password || ''), u.password)) return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    if (String(password).length < 8) return res.status(400).json({ error: 'كلمة المرور 8 أحرف على الأقل' });
    db.prepare('UPDATE users SET password=? WHERE id=?').run(bcrypt.hashSync(String(password), 10), u.id);
  }
  try {
    if (name !== undefined && String(name).trim()) db.prepare('UPDATE users SET name=? WHERE id=?').run(String(name).slice(0, 80), u.id);
    if (job_title !== undefined) db.prepare('UPDATE users SET job_title=? WHERE id=?').run(String(job_title).slice(0, 80), u.id);
    if (phone !== undefined) db.prepare('UPDATE users SET phone=? WHERE id=?').run(String(phone).slice(0, 20), u.id);
    if (avatar !== undefined) db.prepare('UPDATE users SET avatar=? WHERE id=?').run(cleanAvatar(avatar), u.id);
    if (prefs !== undefined) db.prepare('UPDATE users SET prefs=? WHERE id=?').run(JSON.stringify(prefs || {}).slice(0, 20000), u.id);
  } catch (e) { return res.status(400).json({ error: e.message }); }
  res.json(meOut(db.prepare('SELECT * FROM users WHERE id=?').get(u.id)));
});

/* ============================== users ============================== */
app.get('/api/users', auth(), (req, res) => {
  const cols = req.user.role === 'admin' ? 'id,name,email,role,active,last_seen,created_at,job_title,avatar,phone' : 'id,name,role,active,job_title,avatar';
  res.json(db.prepare(`SELECT ${cols} FROM users ORDER BY id`).all());
});
app.post('/api/users', auth('admin'), (req, res) => {
  const { name, email, password, role, job_title, avatar, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'الاسم والبريد وكلمة المرور مطلوبة' });
  if (String(password).length < 8) return res.status(400).json({ error: 'كلمة المرور 8 أحرف على الأقل' });
  if (!ROLE_LEVEL[role]) return res.status(400).json({ error: 'صلاحية غير صحيحة' });
  try {
    const r = db.prepare('INSERT INTO users(name,email,password,role,job_title,avatar,phone,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(String(name).slice(0, 80), String(email).toLowerCase().trim(), bcrypt.hashSync(String(password), 10), role, String(job_title || '').slice(0, 80), cleanAvatar(avatar), String(phone || '').slice(0, 20), now());
    audit(req.user.id, 'user.create', { id: r.lastInsertRowid, email, role });
    res.json({ id: r.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: /UNIQUE/.test(e.message) ? 'البريد مستخدم مسبقاً' : e.message }); }
});
app.put('/api/users/:id', auth('admin'), (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!u) return res.status(404).json({ error: 'not found' });
  const { name, email, password, role, active, job_title, avatar, phone } = req.body;
  if (id === req.user.id && ((role && role !== 'admin') || active === false || active === 0)) return res.status(400).json({ error: 'لا يمكنك تعطيل حسابك أو تغيير صلاحيتك' });
  if (role && !ROLE_LEVEL[role]) return res.status(400).json({ error: 'صلاحية غير صحيحة' });
  if (password && String(password).length < 8) return res.status(400).json({ error: 'كلمة المرور 8 أحرف على الأقل' });
  try {
    db.prepare('UPDATE users SET name=?, email=?, role=?, active=?, job_title=?, phone=?, avatar=? WHERE id=?').run(
      name ?? u.name, (email ?? u.email).toLowerCase().trim(), role ?? u.role, active === undefined ? u.active : (active ? 1 : 0),
      job_title ?? u.job_title ?? '', phone ?? u.phone ?? '', avatar === undefined ? (u.avatar || '') : cleanAvatar(avatar), id);
  } catch (e) { return res.status(400).json({ error: /UNIQUE/.test(e.message) ? 'البريد مستخدم مسبقاً' : e.message }); }
  if (password) db.prepare('UPDATE users SET password=? WHERE id=?').run(bcrypt.hashSync(String(password), 10), id);
  audit(req.user.id, 'user.update', { id, role, active });
  res.json({ ok: true });
});
app.delete('/api/users/:id', auth('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'لا يمكنك حذف حسابك' });
  db.prepare('DELETE FROM users WHERE id=?').run(id);
  audit(req.user.id, 'user.delete', { id });
  res.json({ ok: true });
});

/* ============================== sites & settings ============================== */
const SECRET_SECTIONS = ['datasource', 'security', 'notify'];
function maskSite(s, user) {
  const out = { id: s.id, name: s.name, key: s.key, settings: JSON.parse(JSON.stringify(s.settings)), tree: s.tree, created_at: s.created_at };
  if (user.role !== 'admin') {
    out.settings.security = { allowed_domains: s.settings.security.allowed_domains };
    out.settings.datasource.connection = s.settings.datasource.connection ? '••••••' : '';
    out.settings.notify = { channels: s.settings.notify.channels, whatsapp: { mode: s.settings.notify.whatsapp.mode } };
  } else {
    if (out.settings.notify.email.pass) out.settings.notify.email.pass = '••••••';
    for (const k of ['api_key', 'auth_token']) if (out.settings.notify.sms[k]) out.settings.notify.sms[k] = '••••••';
    if (out.settings.notify.whatsapp.token) out.settings.notify.whatsapp.token = '••••••';
  }
  return out;
}
const SECTION_ROLE = { appearance: 'supervisor', texts: 'supervisor', prechat: 'supervisor', behavior: 'supervisor', org: 'supervisor', developer: 'supervisor', tickets: 'supervisor', languages: 'supervisor', datasource: 'admin', security: 'admin', notify: 'admin' };

app.get('/api/sites', auth(), (req, res) => res.json(db.prepare('SELECT id FROM sites ORDER BY id').all().map(r => maskSite(getSite(r.id), req.user))));
app.post('/api/sites', auth('admin'), (req, res) => {
  const s = createSite(String(req.body.name || 'موقع جديد').slice(0, 80));
  audit(req.user.id, 'site.create', { id: s.id });
  res.json(maskSite(s, req.user));
});

function keepMasked(next, prev) { // a masked placeholder means "unchanged"
  for (const k of Object.keys(next || {})) {
    if (next[k] === '••••••') next[k] = prev?.[k];
    else if (next[k] && typeof next[k] === 'object' && !Array.isArray(next[k])) keepMasked(next[k], prev?.[k]);
  }
  return next;
}

app.put('/api/sites/:id', auth('supervisor'), (req, res) => {
  const site = getSite(Number(req.params.id));
  if (!site) return res.status(404).json({ error: 'not found' });
  const { name, settings, tree } = req.body;
  let merged = site.settings;
  if (settings) {
    for (const sec of Object.keys(settings)) {
      if (!SECTION_ROLE[sec]) continue;
      if (ROLE_LEVEL[req.user.role] < ROLE_LEVEL[SECTION_ROLE[sec]]) return res.status(403).json({ error: 'ليس لديك صلاحية لتعديل ' + sec });
      const incoming = keepMasked(JSON.parse(JSON.stringify(settings[sec])), merged[sec]);
      merged = { ...merged, [sec]: deepMerge(defaultSettings()[sec], deepMerge(merged[sec] || {}, incoming)) };
      // arrays replace (not merge)
      for (const k of Object.keys(incoming)) if (Array.isArray(incoming[k])) merged[sec][k] = incoming[k];
    }
    if (settings.datasource) ds.resetPools();
  }
  if (tree && (!Array.isArray(tree.nodes) || !tree.nodes.length || !tree.nodes.some(n => n.id === tree.root)))
    return res.status(400).json({ error: 'الشجرة غير صحيحة: يجب وجود عقدة بداية' });
  if (name && req.user.role !== 'admin') return res.status(403).json({ error: 'ليس لديك صلاحية' });
  merged.version = 2;
  db.prepare('UPDATE sites SET name=?, settings=?, tree=? WHERE id=?').run(name ? String(name).slice(0, 80) : site.name, JSON.stringify(merged), JSON.stringify(tree || site.tree), site.id);
  audit(req.user.id, 'site.update', { id: site.id, sections: Object.keys(settings || {}), tree: !!tree });
  res.json(maskSite(getSite(site.id), req.user));
});

app.post('/api/sites/:id/regenerate-secret', auth('admin'), (req, res) => {
  const site = getSite(Number(req.params.id));
  site.settings.security.identity_secret = crypto.randomBytes(24).toString('hex');
  db.prepare('UPDATE sites SET settings=? WHERE id=?').run(JSON.stringify(site.settings), site.id);
  audit(req.user.id, 'site.secret', { id: site.id });
  res.json({ identity_secret: site.settings.security.identity_secret });
});
app.get('/api/tree-template', auth(), (req, res) => res.json(defaultTree()));
app.delete('/api/sites/:id', auth('admin'), (req, res) => {
  if (db.prepare('SELECT COUNT(*) c FROM sites').get().c <= 1) return res.status(400).json({ error: 'لا يمكن حذف الموقع الوحيد' });
  db.prepare('DELETE FROM sites WHERE id=?').run(Number(req.params.id));
  audit(req.user.id, 'site.delete', { id: req.params.id });
  res.json({ ok: true });
});
app.get('/api/sites/:id/widget-config', auth(), (req, res) => res.json(widgetConfig(getSite(Number(req.params.id)))));
// live preview of unsaved settings (nothing is stored)
app.post('/api/sites/:id/widget-config/preview', auth(), (req, res) => {
  const site = getSite(Number(req.params.id));
  if (!site) return res.status(404).json({ error: 'not found' });
  const draft = req.body?.settings || {};
  const s = JSON.parse(JSON.stringify(site.settings));
  for (const sec of ['appearance', 'texts', 'prechat', 'languages', 'org', 'tickets']) if (draft[sec] && typeof draft[sec] === 'object') {
    s[sec] = deepMerge(s[sec] || {}, draft[sec]);
    for (const k of Object.keys(draft[sec])) if (Array.isArray(draft[sec][k])) s[sec][k] = draft[sec][k];
  }
  res.json(widgetConfig({ ...site, settings: s }));
});
app.get('/api/patterns', (req, res) => res.json(patterns.list));
app.get('/api/i18n', auth(), (req, res) => res.json({ langs: LANGS, defaults: require('./i18n').T, sms_providers: notify.SMS_PROVIDERS }));

app.get('/api/sites/:id/install-status', auth(), (req, res) => {
  res.json(db.prepare('SELECT origin, last_seen, hits FROM widget_pings WHERE site_id=? ORDER BY last_seen DESC LIMIT 20').all(Number(req.params.id)));
});

// Pre-configured WordPress plugin (server URL, site key and identity secret embedded).
app.get('/api/sites/:id/wordpress-plugin.zip', auth('admin'), async (req, res) => {
  const site = getSite(Number(req.params.id));
  if (!site) return res.status(404).end();
  const JSZip = require('jszip');
  const src = path.join(ROOT, 'wordpress-plugin', 'smart-chat-agent', 'smart-chat-agent.php');
  if (!fs.existsSync(src)) return res.status(500).json({ error: 'plugin source missing' });
  const base = `${req.protocol}://${req.get('host')}`;
  const php = fs.readFileSync(src, 'utf8')
    .replace("'__SC_SERVER__'", `'${base.replace(/'/g, '')}'`).replace("'__SC_KEY__'", `'${site.key}'`).replace("'__SC_SECRET__'", `'${site.settings.security.identity_secret}'`);
  const zip = new JSZip();
  zip.file('smart-chat-agent/smart-chat-agent.php', php);
  const readme = path.join(ROOT, 'wordpress-plugin', 'smart-chat-agent', 'readme.txt');
  if (fs.existsSync(readme)) zip.file('smart-chat-agent/readme.txt', fs.readFileSync(readme));
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="smart-chat-agent.zip"' }).send(buf);
});

app.post('/api/sites/:id/datasource/test', auth('admin'), async (req, res) => {
  const site = getSite(Number(req.params.id));
  const cfg = keepMasked({ ...site.settings.datasource, ...(req.body.datasource || {}) }, site.settings.datasource);
  const which = req.body.which === 'customer' ? cfg.customer_query : cfg.order_query;
  ds.resetPools();
  try { const rows = await ds.query(cfg, which, req.body.params || {}); res.json({ ok: true, params: ds.paramNames(which), rows: rows.slice(0, 5) }); }
  catch (e) { res.status(400).json({ error: e.message, params: ds.paramNames(which) }); }
});

app.post('/api/sites/:id/notify/test', auth('admin'), async (req, res) => {
  const site = getSite(Number(req.params.id));
  if (req.body.notify) site.settings.notify = deepMerge(site.settings.notify, keepMasked(req.body.notify, site.settings.notify));
  const { channel, to } = req.body;
  const text = `رسالة تجريبية من ${site.settings.org.name || site.name} ✅\n${new Date().toLocaleString('ar-SA-u-nu-latn')}`;
  try {
    if (channel === 'email') await notify.sendEmail(site, to, 'رسالة تجريبية', text, 'test');
    else if (channel === 'sms') await notify.sendSms(site, to, text, 'test');
    else if (channel === 'whatsapp') { const r = await notify.sendWhatsApp(site, to, text, 'test'); if (r.manual) return res.json({ ok: true, manual: r.link, error: r.error }); }
    else return res.status(400).json({ error: 'قناة غير معروفة' });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/notify-log', auth('admin'), (req, res) => res.json(db.prepare('SELECT * FROM notify_log ORDER BY id DESC LIMIT 100').all()));

/* ============================== conversations ============================== */
app.get('/api/conversations', auth(), (req, res) => {
  const q = req.query, where = [], args = [];
  if (q.site) { where.push('c.site_id=?'); args.push(Number(q.site)); }
  if (q.status === 'active') where.push("c.status!='closed'");
  else if (q.status) { where.push('c.status=?'); args.push(q.status); }
  if (q.closed_by) { where.push('c.closed_by=?'); args.push(q.closed_by); }
  if (q.agent) { where.push('c.assigned_to=?'); args.push(Number(q.agent)); }
  if (q.lang) { where.push('c.lang=?'); args.push(q.lang); }
  if (q.rated === 'yes') where.push('c.rating IS NOT NULL');
  if (q.rated === 'no') where.push('c.rating IS NULL');
  if (q.handoff === 'yes') where.push('c.handoff_at IS NOT NULL');
  if (q.handoff === 'no') where.push('c.handoff_at IS NULL');
  if (q.from) { where.push('c.created_at>=?'); args.push(q.from); }
  if (q.to) { where.push('c.created_at<=?'); args.push(q.to + 'T23:59:59'); }
  if (q.q) {
    where.push('(c.visitor_name LIKE ? OR c.visitor_email LIKE ? OR c.visitor_phone LIKE ? OR c.id=? OR EXISTS(SELECT 1 FROM messages m WHERE m.conversation_id=c.id AND m.body LIKE ?))');
    const like = '%' + q.q + '%'; args.push(like, like, like, Number(q.q) || -1, like);
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(Number(q.limit) || 50, 300), page = Math.max(Number(q.page) || 1, 1);
  const total = db.prepare(`SELECT COUNT(*) c FROM conversations c ${w}`).get(...args).c;
  const rows = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id) msg_count FROM conversations c ${w} ORDER BY c.updated_at DESC LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit);
  res.json({ total, page, limit, items: rows.map(r => ({ ...chat.convSummary({ ...r, state: JSON.parse(r.state || '{}') }), msg_count: r.msg_count })) });
});

app.get('/api/conversations/:id', auth(), (req, res) => {
  const c = getConv(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'not found' });
  const msgs = db.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY id').all(c.id).map(m => ({ ...chat.publicMsg(m), agent_id: m.agent_id }));
  const site = getSite(c.site_id);
  const prev = db.prepare("SELECT id, status, created_at, rating FROM conversations WHERE site_id=? AND id!=? AND (visitor_id=? OR (visitor_phone IS NOT NULL AND visitor_phone=?)) ORDER BY id DESC LIMIT 5").all(c.site_id, c.id, c.visitor_id, c.visitor_phone || '');
  const tks = db.prepare('SELECT id, number, type, status, created_at FROM tickets WHERE site_id=? AND (conversation_id=? OR (phone IS NOT NULL AND phone=?)) ORDER BY id DESC LIMIT 5').all(c.site_id, c.id, c.visitor_phone || '');
  res.json({
    ...chat.convSummary(c), meta: c.meta, state: c.state, rating_comment: c.rating_comment, pending: c.state.pending || [],
    closed_by_name: c.closed_by_user ? db.prepare('SELECT name FROM users WHERE id=?').get(c.closed_by_user)?.name : null,
    rating_max: site.settings.appearance.rating_max, messages: msgs, previous: prev, tickets: tks
  });
});

app.get('/api/conversations/:id/export', auth(), (req, res) => {
  const c = getConv(Number(req.params.id));
  if (!c) return res.status(404).end();
  const msgs = db.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY id').all(c.id);
  const label = { visitor: c.visitor_name || 'المستفيد', bot: 'البوت', system: 'النظام' };
  const lines = [`محادثة #${c.id}`, `المستفيد: ${c.visitor_name || '-'} | ${c.visitor_phone || '-'} | ${c.visitor_email || '-'}`, `البداية: ${c.created_at}`,
    `الحالة: ${c.status}${c.closed_by ? ' (أغلقها: ' + c.closed_by + ')' : ''}`, `التقييم: ${c.rating ?? '-'} ${c.rating_comment ? '— ' + c.rating_comment : ''}`, '-'.repeat(40)];
  for (const m of msgs) {
    const who = m.sender === 'agent' ? (db.prepare('SELECT name FROM users WHERE id=?').get(m.agent_id)?.name || 'موظف') : label[m.sender];
    lines.push(`[${m.created_at.replace('T', ' ').slice(0, 19)}] ${who}: ${m.body || ''}`);
  }
  res.set('Content-Type', 'text/plain; charset=utf-8').set('Content-Disposition', `attachment; filename="conversation-${c.id}.txt"`).send('﻿' + lines.join('\n'));
});

app.delete('/api/conversations/:id', auth('supervisor'), (req, res) => {
  db.prepare('DELETE FROM conversations WHERE id=?').run(Number(req.params.id));
  audit(req.user.id, 'conversation.delete', { id: req.params.id });
  res.json({ ok: true });
});

/* ============================== knowledge base ============================== */
app.get('/api/kb', auth(), (req, res) => {
  const args = [Number(req.query.site)]; let w = 'site_id=?';
  if (req.query.source) { w += ' AND source=?'; args.push(req.query.source); }
  if (req.query.q) { w += ' AND (question LIKE ? OR answer LIKE ? OR keywords LIKE ?)'; const l = '%' + req.query.q + '%'; args.push(l, l, l); }
  res.json(db.prepare(`SELECT * FROM kb WHERE ${w} ORDER BY id DESC`).all(...args).map(k => ({ ...k, media: (() => { try { return JSON.parse(k.media || '[]'); } catch { return []; } })() })));
});
app.post('/api/kb', auth(), (req, res) => {
  const { site_id, question, answer, keywords, lang, unanswered_id } = req.body;
  if (!site_id || !question?.trim() || !answer?.trim()) return res.status(400).json({ error: 'السؤال والإجابة مطلوبان' });
  let media; try { media = cleanMedia(req.body.media); } catch (e) { return res.status(400).json({ error: e.message }); }
  const r = db.prepare('INSERT INTO kb(site_id,question,answer,keywords,media,source,source_conversation,created_by,lang,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(Number(site_id), question.trim(), answer.trim(), keywords || '', JSON.stringify(media), req.body.conversation_id || unanswered_id ? 'learned' : 'manual', req.body.conversation_id || null, req.user.id, lang || 'all', now(), now());
  if (unanswered_id) db.prepare("UPDATE unanswered SET status='answered', kb_id=?, updated_at=? WHERE id=?").run(r.lastInsertRowid, now(), Number(unanswered_id));
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/kb/:id', auth(), (req, res) => {
  const k = db.prepare('SELECT * FROM kb WHERE id=?').get(Number(req.params.id));
  if (!k) return res.status(404).json({ error: 'not found' });
  const { question, answer, keywords, active, lang } = req.body;
  let media = k.media || '[]';
  if (req.body.media !== undefined) { try { media = JSON.stringify(cleanMedia(req.body.media)); } catch (e) { return res.status(400).json({ error: e.message }); } }
  db.prepare('UPDATE kb SET question=?, answer=?, keywords=?, media=?, lang=?, active=?, updated_at=? WHERE id=?')
    .run(question ?? k.question, answer ?? k.answer, keywords ?? k.keywords, media, lang ?? k.lang ?? 'all', active === undefined ? k.active : (active ? 1 : 0), now(), k.id);
  res.json({ ok: true });
});
app.delete('/api/kb/:id', auth('supervisor'), (req, res) => { db.prepare('DELETE FROM kb WHERE id=?').run(Number(req.params.id)); res.json({ ok: true }); });
app.post('/api/kb/test', auth(), (req, res) => {
  const nlp = require('./nlp');
  const items = db.prepare('SELECT * FROM kb WHERE site_id=? AND active=1').all(Number(req.body.site_id));
  const best = nlp.bestMatch(req.body.text, items, Number(getSite(Number(req.body.site_id)).settings.behavior.kb_threshold));
  res.json({ best: best ? { ...best.item, score: +best.score.toFixed(2) } : null, top: nlp.topMatches(req.body.text, items, 5, 0).map(x => ({ id: x.item.id, question: x.item.question, score: +x.score.toFixed(2) })) });
});
app.get('/api/unanswered', auth(), (req, res) => {
  res.json(db.prepare(`SELECT * FROM unanswered WHERE site_id=? AND status=? ORDER BY count DESC, id DESC LIMIT 200`).all(Number(req.query.site), req.query.status || 'open'));
});
app.put('/api/unanswered/:id', auth(), (req, res) => {
  db.prepare('UPDATE unanswered SET status=?, updated_at=? WHERE id=?').run(['open', 'dismissed', 'answered'].includes(req.body.status) ? req.body.status : 'dismissed', now(), Number(req.params.id));
  res.json({ ok: true });
});

/* ============================== tickets ============================== */
app.get('/api/tickets', auth(), (req, res) => {
  const q = req.query, where = ['t.site_id=?'], args = [Number(q.site)];
  if (q.type) { where.push('t.type=?'); args.push(q.type); }
  if (q.status === 'open') where.push("t.status IN ('new','in_progress')");
  else if (q.status) { where.push('t.status=?'); args.push(q.status); }
  if (q.priority) { where.push('t.priority=?'); args.push(q.priority); }
  if (q.assigned) { where.push('t.assigned_to=?'); args.push(Number(q.assigned)); }
  if (q.from) { where.push('t.created_at>=?'); args.push(q.from); }
  if (q.to) { where.push('t.created_at<=?'); args.push(q.to + 'T23:59:59'); }
  if (q.q) { where.push('(t.number LIKE ? OR t.name LIKE ? OR t.phone LIKE ? OR t.text LIKE ? OR t.email LIKE ?)'); const l = '%' + q.q + '%'; args.push(l, l, l, l, l); }
  const w = where.join(' AND ');
  const limit = Math.min(Number(q.limit) || 30, 200), page = Math.max(Number(q.page) || 1, 1);
  res.json({
    total: db.prepare(`SELECT COUNT(*) c FROM tickets t WHERE ${w}`).get(...args).c, page, limit,
    items: db.prepare(`SELECT t.*, u.name agent_name FROM tickets t LEFT JOIN users u ON u.id=t.assigned_to WHERE ${w} ORDER BY t.id DESC LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit)
  });
});
app.get('/api/tickets/stats', auth(), (req, res) => res.json(reports.ticketStats(req.query)));
app.get('/api/tickets/export', auth(), async (req, res) => {
  const site = getSite(Number(req.query.site));
  const buf = await reports.ticketsExcel(req.query, (site?.settings.appearance.primary_color || '#1a6739').replace('#', '').toUpperCase());
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="tickets-${new Date().toISOString().slice(0, 10)}.xlsx"` }).send(Buffer.from(buf));
});
app.get('/api/tickets/:id', auth(), (req, res) => {
  const t = tickets.get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'not found' });
  const site = getSite(t.site_id);
  const events = db.prepare('SELECT e.*, u.name user_name FROM ticket_events e LEFT JOIN users u ON u.id=e.user_id WHERE ticket_id=? ORDER BY id').all(t.id);
  const ctx = notify.ticketContext(site, t);
  const waText = notify.fill(site.settings.notify.templates.ticket_updated, ctx);
  res.json({ ...t, events, wa_link: t.phone ? notify.waLink(t.phone, waText) : null, logs: db.prepare('SELECT * FROM notify_log WHERE ref=? ORDER BY id DESC').all(t.number) });
});
app.post('/api/tickets', auth(), async (req, res) => {
  const site = getSite(Number(req.body.site_id));
  if (!site) return res.status(404).json({ error: 'site' });
  try { const t = await tickets.create(site, req.body, { type: req.body.type, lang: req.body.lang || 'ar' }); audit(req.user.id, 'ticket.create', { id: t.id }); res.json(t); }
  catch (e) { res.status(400).json({ error: e.fields ? 'تحقق من الحقول المطلوبة' : e.message, fields: e.fields }); }
});
app.put('/api/tickets/:id', auth(), async (req, res) => {
  const r = await tickets.update(Number(req.params.id), req.body, req.user.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  chat.getAio().emit('ticket:update', { id: r.ticket.id, status: r.ticket.status });
  res.json(r);
});
app.delete('/api/tickets/:id', auth('supervisor'), (req, res) => {
  db.prepare('DELETE FROM tickets WHERE id=?').run(Number(req.params.id));
  audit(req.user.id, 'ticket.delete', { id: req.params.id });
  res.json({ ok: true });
});

/* ============================== stats & reports ============================== */
app.get('/api/stats', auth(), (req, res) => res.json(reports.dashboard(req.query)));
app.get('/api/reports/agents', auth('supervisor'), (req, res) => { const r = reports.agentReport(req.query); delete r.conversations; res.json(r); });
app.get('/api/reports/agents.xlsx', auth('supervisor'), async (req, res) => {
  const site = req.query.site ? getSite(Number(req.query.site)) : null;
  const buf = await reports.agentsExcel(req.query, (site?.settings.appearance.primary_color || '#1a6739').replace('#', '').toUpperCase());
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="agents-report-${new Date().toISOString().slice(0, 10)}.xlsx"` }).send(Buffer.from(buf));
});
app.get('/api/audit', auth('admin'), (req, res) => res.json(db.prepare('SELECT a.*, u.name user_name FROM audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 300').all()));
app.get('/api/online', auth(), (req, res) => res.json(chat.onlineAgents()));

/* ============================== start ============================== */
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true }, maxHttpBufferSize: 1e6 });
chat.setup(io, JWT_SECRET);
setInterval(chat.maintenance, 60 * 1000).unref();
chat.maintenance();

if (require.main === module) server.listen(PORT, () => console.log(`Smart Chat running on http://localhost:${PORT}  (dashboard: /admin/)`));
module.exports = { app, server };
