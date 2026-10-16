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
const chat = require('./chat');
const ds = require('./datasource');

const PORT = Number(process.env.PORT) || 3000;
const secretFile = path.join(DATA_DIR, '.jwt_secret');
const JWT_SECRET = process.env.JWT_SECRET || (fs.existsSync(secretFile) ? fs.readFileSync(secretFile, 'utf8')
  : (() => { const s = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(secretFile, s); return s; })());

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '2mb' }));
const PUB = path.join(__dirname, '..', 'public');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });
const MEDIA_TYPES = {
  'image/jpeg': { ext: 'jpg', kind: 'image' }, 'image/png': { ext: 'png', kind: 'image' },
  'image/gif': { ext: 'gif', kind: 'image' }, 'image/webp': { ext: 'webp', kind: 'image' },
  'video/mp4': { ext: 'mp4', kind: 'video' }, 'video/webm': { ext: 'webm', kind: 'video' },
  'video/ogg': { ext: 'ogv', kind: 'video' }, 'application/pdf': { ext: 'pdf', kind: 'pdf' }
};

function cleanKbMedia(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 5) throw new Error('يمكن إرفاق 5 ملفات كحد أقصى لكل إجابة');
  return value.map(m => {
    if (!m || typeof m.url !== 'string' || !/^\/media\/[a-f0-9-]+\.(jpg|png|gif|webp|mp4|webm|ogv|pdf)$/i.test(m.url))
      throw new Error('مرفق غير صالح');
    const type = String(m.type || '');
    if (!['image', 'video', 'pdf'].includes(type)) throw new Error('نوع المرفق غير مدعوم');
    return { url: m.url, name: String(m.name || 'مرفق').slice(0, 120), type };
  });
}

/* ----------------------------- public ----------------------------- */

const cors = (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
};

app.get('/widget.js', cors, (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.sendFile(path.join(PUB, 'widget.js'));
});

app.get('/api/widget/config', cors, (req, res) => {
  const site = getSiteByKey(String(req.query.site || ''));
  if (!site) return res.status(404).json({ error: 'site not found' });
  res.json({ appearance: site.settings.appearance, prechat: site.settings.prechat, name: site.name });
});

app.get('/healthz', (req, res) => res.json({ ok: true }));
app.post('/api/media', auth(), express.raw({ type: 'application/octet-stream', limit: '20mb' }), (req, res) => {
  const mime = String(req.query.type || '').toLowerCase();
  const spec = MEDIA_TYPES[mime];
  const b = req.body;
  if (!spec || !Buffer.isBuffer(b) || !b.length) return res.status(400).json({ error: 'صيغة الملف غير مدعومة أو الملف فارغ' });
  const signatureOk = mime === 'image/jpeg' ? b[0] === 0xff && b[1] === 0xd8
    : mime === 'image/png' ? b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : mime === 'image/gif' ? b.subarray(0, 3).toString() === 'GIF'
    : mime === 'image/webp' ? b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP'
    : mime === 'video/mp4' ? b.subarray(4, 8).toString() === 'ftyp'
    : mime === 'video/webm' ? b.subarray(0, 4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))
    : mime === 'video/ogg' ? b.subarray(0, 4).toString() === 'OggS'
    : b.subarray(0, 5).toString() === '%PDF-';
  if (!signatureOk) return res.status(400).json({ error: 'محتوى الملف لا يطابق صيغته' });
  const id = crypto.randomUUID();
  const filename = `${id}.${spec.ext}`;
  fs.writeFileSync(path.join(MEDIA_DIR, filename), b, { flag: 'wx' });
  res.json({ url: `/media/${filename}`, type: spec.kind, name: String(req.query.name || 'مرفق').slice(0, 120) });
});
app.use('/media', express.static(MEDIA_DIR, { dotfiles: 'deny', index: false, maxAge: '1d', setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff') }));
app.get('/', (req, res) => res.redirect('/admin/'));
app.use('/admin', express.static(path.join(PUB, 'admin')));
app.use('/demo', express.static(path.join(PUB, 'demo')));

/* ----------------------------- auth ----------------------------- */

const ROLE_LEVEL = { agent: 1, supervisor: 2, admin: 3 };

function auth(minRole = 'agent') {
  return (req, res, next) => {
    try {
      const tok = (req.headers.authorization || '').replace(/^Bearer /, '');
      const p = jwt.verify(tok, JWT_SECRET);
      const u = db.prepare('SELECT id,name,email,role,active FROM users WHERE id=?').get(p.id);
      if (!u || !u.active) return res.status(401).json({ error: 'unauthorized' });
      if (ROLE_LEVEL[u.role] < ROLE_LEVEL[minRole]) return res.status(403).json({ error: 'ليس لديك صلاحية' });
      req.user = u;
      next();
    } catch { res.status(401).json({ error: 'unauthorized' }); }
  };
}

const attempts = new Map();
app.post('/api/auth/login', (req, res) => {
  const key = req.ip;
  const a = attempts.get(key) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60000) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 10) return res.status(429).json({ error: 'محاولات كثيرة، حاول بعد 15 دقيقة' });
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(req.body.email || '').toLowerCase().trim());
  if (!u || !u.active || !bcrypt.compareSync(String(req.body.password || ''), u.password)) {
    a.n++; attempts.set(key, a);
    return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة' });
  }
  attempts.delete(key);
  audit(u.id, 'login', { ip: req.ip });
  res.json({ token: jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: '7d' }), user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});

const WEAK = ['admin123', 'change-me-now', '12345678', 'password'];
app.get('/api/me', auth(), (req, res) => {
  const hash = db.prepare('SELECT password FROM users WHERE id=?').get(req.user.id).password;
  res.json({ ...req.user, weak_password: WEAK.some(p => bcrypt.compareSync(p, hash)) });
});

app.put('/api/me', auth(), (req, res) => {
  const { name, password, current_password } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (password) {
    if (!bcrypt.compareSync(String(current_password || ''), u.password)) return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    if (String(password).length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
    db.prepare('UPDATE users SET password=? WHERE id=?').run(bcrypt.hashSync(String(password), 10), u.id);
  }
  if (name) db.prepare('UPDATE users SET name=? WHERE id=?').run(String(name).slice(0, 80), u.id);
  res.json({ ok: true });
});

/* ----------------------------- users ----------------------------- */

app.get('/api/users', auth(), (req, res) => {
  const cols = req.user.role === 'admin' ? 'id,name,email,role,active,last_seen,created_at' : 'id,name,role,active';
  res.json(db.prepare(`SELECT ${cols} FROM users ORDER BY id`).all());
});

app.post('/api/users', auth('admin'), (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'الاسم والبريد وكلمة المرور مطلوبة' });
  if (String(password).length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
  if (!ROLE_LEVEL[role]) return res.status(400).json({ error: 'صلاحية غير صحيحة' });
  try {
    const r = db.prepare('INSERT INTO users(name,email,password,role,created_at) VALUES(?,?,?,?,?)')
      .run(String(name).slice(0, 80), String(email).toLowerCase().trim(), bcrypt.hashSync(String(password), 10), role, now());
    audit(req.user.id, 'user.create', { id: r.lastInsertRowid, email, role });
    res.json({ id: r.lastInsertRowid });
  } catch { res.status(400).json({ error: 'البريد مستخدم مسبقاً' }); }
});

app.put('/api/users/:id', auth('admin'), (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!u) return res.status(404).json({ error: 'not found' });
  const { name, email, password, role, active } = req.body;
  if (id === req.user.id && (role && role !== 'admin' || active === false || active === 0))
    return res.status(400).json({ error: 'لا يمكنك تعطيل حسابك أو تغيير صلاحيتك' });
  if (role && !ROLE_LEVEL[role]) return res.status(400).json({ error: 'صلاحية غير صحيحة' });
  if (password && String(password).length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
  try {
    db.prepare('UPDATE users SET name=?, email=?, role=?, active=? WHERE id=?').run(
      name ?? u.name, (email ?? u.email).toLowerCase().trim(), role ?? u.role, active === undefined ? u.active : (active ? 1 : 0), id);
  } catch { return res.status(400).json({ error: 'البريد مستخدم مسبقاً' }); }
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

/* ----------------------------- sites ----------------------------- */

function maskSite(s, user) {
  const out = { id: s.id, name: s.name, key: s.key, settings: JSON.parse(JSON.stringify(s.settings)), tree: s.tree, created_at: s.created_at };
  if (user.role !== 'admin') {
    out.settings.security = { allowed_domains: s.settings.security.allowed_domains };
    out.settings.datasource.connection = s.settings.datasource.connection ? '••••••' : '';
  }
  return out;
}

app.get('/api/sites', auth(), (req, res) => {
  res.json(db.prepare('SELECT id FROM sites ORDER BY id').all().map(r => maskSite(getSite(r.id), req.user)));
});

app.post('/api/sites', auth('admin'), (req, res) => {
  const s = createSite(String(req.body.name || 'موقع جديد').slice(0, 80));
  audit(req.user.id, 'site.create', { id: s.id });
  res.json(maskSite(s, req.user));
});

// Section-level permissions for settings updates
const SECTION_ROLE = { appearance: 'supervisor', prechat: 'supervisor', behavior: 'supervisor', datasource: 'admin', security: 'admin' };

app.put('/api/sites/:id', auth('supervisor'), (req, res) => {
  const site = getSite(Number(req.params.id));
  if (!site) return res.status(404).json({ error: 'not found' });
  const { name, settings, tree } = req.body;
  let merged = site.settings;
  if (settings) {
    for (const sec of Object.keys(settings)) {
      if (!SECTION_ROLE[sec]) continue;
      if (ROLE_LEVEL[req.user.role] < ROLE_LEVEL[SECTION_ROLE[sec]]) return res.status(403).json({ error: 'ليس لديك صلاحية لتعديل ' + sec });
      merged = { ...merged, [sec]: deepMerge(defaultSettings()[sec], { ...merged[sec], ...settings[sec] }) };
    }
    if (settings.datasource) ds.resetPools();
  }
  if (tree) {
    if (!Array.isArray(tree.nodes) || !tree.nodes.length || !tree.nodes.some(n => n.id === tree.root))
      return res.status(400).json({ error: 'الشجرة غير صحيحة: يجب وجود عقدة بداية' });
  }
  if (name && req.user.role !== 'admin') return res.status(403).json({ error: 'ليس لديك صلاحية' });
  db.prepare('UPDATE sites SET name=?, settings=?, tree=? WHERE id=?')
    .run(name ? String(name).slice(0, 80) : site.name, JSON.stringify(merged), JSON.stringify(tree || site.tree), site.id);
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

app.post('/api/sites/:id/reset-tree', auth('supervisor'), (req, res) => {
  db.prepare('UPDATE sites SET tree=? WHERE id=?').run(JSON.stringify(defaultTree()), Number(req.params.id));
  res.json({ tree: defaultTree() });
});

app.delete('/api/sites/:id', auth('admin'), (req, res) => {
  if (db.prepare('SELECT COUNT(*) c FROM sites').get().c <= 1) return res.status(400).json({ error: 'لا يمكن حذف الموقع الوحيد' });
  db.prepare('DELETE FROM sites WHERE id=?').run(Number(req.params.id));
  audit(req.user.id, 'site.delete', { id: req.params.id });
  res.json({ ok: true });
});

app.post('/api/sites/:id/datasource/test', auth('admin'), async (req, res) => {
  const site = getSite(Number(req.params.id));
  const cfg = { ...site.settings.datasource, ...(req.body.datasource || {}) };
  const which = req.body.which === 'customer' ? cfg.customer_query : cfg.order_query;
  ds.resetPools();
  try {
    const rows = await ds.query(cfg, which, req.body.params || {});
    res.json({ ok: true, params: ds.paramNames(which), rows: rows.slice(0, 5) });
  } catch (e) { res.status(400).json({ error: e.message, params: ds.paramNames(which) }); }
});

/* ----------------------------- conversations ----------------------------- */

app.get('/api/conversations', auth(), (req, res) => {
  const q = req.query;
  const where = [], args = [];
  if (q.site) { where.push('c.site_id=?'); args.push(Number(q.site)); }
  if (q.status === 'active') where.push("c.status!='closed'");
  else if (q.status) { where.push('c.status=?'); args.push(q.status); }
  if (q.closed_by) { where.push('c.closed_by=?'); args.push(q.closed_by); }
  if (q.agent) { where.push('c.assigned_to=?'); args.push(Number(q.agent)); }
  if (q.rated === 'yes') where.push('c.rating IS NOT NULL');
  if (q.rated === 'no') where.push('c.rating IS NULL');
  if (q.min_rating) { where.push('c.rating>=?'); args.push(Number(q.min_rating)); }
  if (q.max_rating) { where.push('c.rating<=?'); args.push(Number(q.max_rating)); }
  if (q.handoff === 'yes') where.push('c.handoff_at IS NOT NULL');
  if (q.handoff === 'no') where.push('c.handoff_at IS NULL');
  if (q.from) { where.push('c.created_at>=?'); args.push(q.from); }
  if (q.to) { where.push('c.created_at<=?'); args.push(q.to + 'T23:59:59'); }
  if (q.q) {
    where.push('(c.visitor_name LIKE ? OR c.visitor_email LIKE ? OR c.visitor_phone LIKE ? OR c.id=? OR EXISTS(SELECT 1 FROM messages m WHERE m.conversation_id=c.id AND m.body LIKE ?))');
    const like = '%' + q.q + '%';
    args.push(like, like, like, Number(q.q) || -1, like);
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(Number(q.limit) || 50, 200), page = Math.max(Number(q.page) || 1, 1);
  const total = db.prepare(`SELECT COUNT(*) c FROM conversations c ${w}`).get(...args).c;
  const order = q.status === 'closed' ? 'c.closed_at DESC' : 'c.updated_at DESC';
  const rows = db.prepare(`SELECT c.* FROM conversations c ${w} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit);
  res.json({ total, page, limit, items: rows.map(r => chat.convSummary({ ...r, state: JSON.parse(r.state || '{}') })) });
});

app.get('/api/conversations/:id', auth(), (req, res) => {
  const c = getConv(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'not found' });
  const msgs = db.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY id').all(c.id).map(m => ({ ...chat.publicMsg(m), agent_id: m.agent_id }));
  const site = getSite(c.site_id);
  res.json({
    ...chat.convSummary(c), meta: c.meta, state: c.state, rating_comment: c.rating_comment,
    closed_by_name: c.closed_by_user ? db.prepare('SELECT name FROM users WHERE id=?').get(c.closed_by_user)?.name : null,
    rating_max: site.settings.appearance.rating_max, messages: msgs
  });
});

app.get('/api/conversations/:id/export', auth(), (req, res) => {
  const c = getConv(Number(req.params.id));
  if (!c) return res.status(404).end();
  const msgs = db.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY id').all(c.id);
  const label = { visitor: c.visitor_name || 'المستفيد', bot: 'البوت', system: 'النظام' };
  const lines = [`محادثة #${c.id}`, `المستفيد: ${c.visitor_name || '-'} | ${c.visitor_phone || '-'} | ${c.visitor_email || '-'}`,
    `البداية: ${c.created_at}`, `الحالة: ${c.status}${c.closed_by ? ' (أغلقها: ' + c.closed_by + ')' : ''}`,
    `التقييم: ${c.rating ?? '-'} ${c.rating_comment ? '— ' + c.rating_comment : ''}`, '-'.repeat(40)];
  for (const m of msgs) {
    const who = m.sender === 'agent' ? (db.prepare('SELECT name FROM users WHERE id=?').get(m.agent_id)?.name || 'موظف') : label[m.sender];
    lines.push(`[${m.created_at.replace('T', ' ').slice(0, 19)}] ${who}: ${m.body}`);
  }
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="conversation-${c.id}.txt"`);
  res.send('﻿' + lines.join('\n'));
});

app.delete('/api/conversations/:id', auth('supervisor'), (req, res) => {
  db.prepare('DELETE FROM conversations WHERE id=?').run(Number(req.params.id));
  audit(req.user.id, 'conversation.delete', { id: req.params.id });
  res.json({ ok: true });
});

/* ----------------------------- knowledge base ----------------------------- */

app.get('/api/kb', auth(), (req, res) => {
  const args = [Number(req.query.site)];
  let w = 'site_id=?';
  if (req.query.source) { w += ' AND source=?'; args.push(req.query.source); }
  if (req.query.q) { w += ' AND (question LIKE ? OR answer LIKE ? OR keywords LIKE ?)'; const l = '%' + req.query.q + '%'; args.push(l, l, l); }
  res.json(db.prepare(`SELECT * FROM kb WHERE ${w} ORDER BY id DESC`).all(...args));
});

app.post('/api/kb', auth(), (req, res) => {
  const { site_id, question, answer, keywords } = req.body;
  if (!site_id || !question?.trim() || !answer?.trim()) return res.status(400).json({ error: 'السؤال والإجابة مطلوبان' });
  let media; try { media = cleanKbMedia(req.body.media || []); } catch (e) { return res.status(400).json({ error: e.message }); }
  const r = db.prepare('INSERT INTO kb(site_id,question,answer,keywords,media,source,source_conversation,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(Number(site_id), question.trim(), answer.trim(), keywords || '', JSON.stringify(media), req.body.conversation_id ? 'learned' : 'manual', req.body.conversation_id || null, req.user.id, now(), now());
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/kb/:id', auth(), (req, res) => {
  const k = db.prepare('SELECT * FROM kb WHERE id=?').get(Number(req.params.id));
  if (!k) return res.status(404).json({ error: 'not found' });
  const { question, answer, keywords, active } = req.body;
  let media = k.media || '[]';
  if (req.body.media !== undefined) { try { media = JSON.stringify(cleanKbMedia(req.body.media)); } catch (e) { return res.status(400).json({ error: e.message }); } }
  db.prepare('UPDATE kb SET question=?, answer=?, keywords=?, media=?, active=?, updated_at=? WHERE id=?')
    .run(question ?? k.question, answer ?? k.answer, keywords ?? k.keywords, media, active === undefined ? k.active : (active ? 1 : 0), now(), k.id);
  res.json({ ok: true });
});

app.delete('/api/kb/:id', auth('supervisor'), (req, res) => {
  db.prepare('DELETE FROM kb WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/kb/test', auth(), (req, res) => {
  const items = db.prepare('SELECT * FROM kb WHERE site_id=? AND active=1').all(Number(req.body.site_id));
  const nlp = require('./nlp');
  const scored = items.map(i => ({ id: i.id, question: i.question, score: +nlp.similarity(req.body.text, i.question).toFixed(2) }))
    .sort((a, b) => b.score - a.score).slice(0, 5);
  const best = nlp.bestMatch(req.body.text, items, Number(getSite(Number(req.body.site_id)).settings.behavior.kb_threshold));
  res.json({ best: best ? { ...best.item, score: +best.score.toFixed(2) } : null, top: scored });
});

/* ----------------------------- stats & audit ----------------------------- */

app.get('/api/stats', auth(), (req, res) => {
  const site = Number(req.query.site);
  const days = Math.min(Number(req.query.days) || 30, 365);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const W = 'site_id=? AND created_at>=?';
  const g = (sql) => db.prepare(sql).get(site, since);
  const all = (sql) => db.prepare(sql).all(site, since);
  const max = getSite(site)?.settings.appearance.rating_max || 5;
  res.json({
    days, rating_max: max,
    total: g(`SELECT COUNT(*) c FROM conversations WHERE ${W}`).c,
    active: db.prepare("SELECT COUNT(*) c FROM conversations WHERE site_id=? AND status!='closed'").get(site).c,
    waiting: db.prepare("SELECT COUNT(*) c FROM conversations WHERE site_id=? AND status='waiting'").get(site).c,
    handoffs: g(`SELECT COUNT(*) c FROM conversations WHERE ${W} AND handoff_at IS NOT NULL`).c,
    bot_only: g(`SELECT COUNT(*) c FROM conversations WHERE ${W} AND status='closed' AND handoff_at IS NULL`).c,
    closed_by: all(`SELECT closed_by k, COUNT(*) c FROM conversations WHERE ${W} AND status='closed' GROUP BY closed_by`),
    avg_rating: g(`SELECT ROUND(AVG(rating),2) a, COUNT(rating) n FROM conversations WHERE ${W} AND rating IS NOT NULL`),
    ratings: all(`SELECT rating k, COUNT(*) c FROM conversations WHERE ${W} AND rating IS NOT NULL GROUP BY rating ORDER BY rating`),
    per_day: all(`SELECT substr(created_at,1,10) d, COUNT(*) c, SUM(handoff_at IS NOT NULL) h FROM conversations WHERE ${W} GROUP BY d ORDER BY d`),
    agents: db.prepare(`SELECT u.name, COUNT(c.id) c, ROUND(AVG(c.rating),2) r FROM conversations c JOIN users u ON u.id=c.assigned_to WHERE c.site_id=? AND c.created_at>=? GROUP BY u.id ORDER BY c DESC`).all(site, since),
    kb: db.prepare('SELECT COUNT(*) total, SUM(source=\'learned\') learned, SUM(hits) hits FROM kb WHERE site_id=?').get(site),
    top_kb: db.prepare('SELECT question, hits FROM kb WHERE site_id=? AND hits>0 ORDER BY hits DESC LIMIT 5').all(site)
  });
});

app.get('/api/audit', auth('admin'), (req, res) => {
  res.json(db.prepare('SELECT a.*, u.name user_name FROM audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 200').all());
});

/* ----------------------------- start ----------------------------- */

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true }, maxHttpBufferSize: 1e6 });
chat.setup(io, JWT_SECRET);
setInterval(chat.maintenance, 60 * 1000).unref();
chat.maintenance();

if (require.main === module) {
  server.listen(PORT, () => console.log(`Smart Chat running on http://localhost:${PORT}  (dashboard: /admin/)`));
}
module.exports = { app, server };
