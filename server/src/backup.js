// Full backups (every table, including uploaded media), restore, automatic scheduled backups and factory reset.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { db, now, meta, createSite, DATA_DIR } = require('./db');

const TABLES = ['users', 'sites', 'kb_categories', 'kb', 'conversations', 'messages', 'media_assets', 'unanswered', 'tickets',
  'ticket_events', 'elig_results', 'appointments', 'program_regs', 'notify_log', 'widget_pings', 'audit', 'app_meta', 'demo_orders', 'demo_customers'];
const DEFAULTS = { enabled: false, frequency: 'daily', hour: 3, keep: 7, folder: '', email: '' };

const config = () => ({ ...DEFAULTS, ...meta.get('backup', {}) });
const folder = () => { const f = config().folder || process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups'); fs.mkdirSync(f, { recursive: true }); return f; };
const columns = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);

function dump() {
  const tables = {};
  for (const t of TABLES) {
    tables[t] = db.prepare(`SELECT * FROM ${t}`).all().map(r => {
      const o = {}; for (const k of Object.keys(r)) o[k] = Buffer.isBuffer(r[k]) ? { __b64: r[k].toString('base64') } : r[k];
      return o;
    });
  }
  const json = JSON.stringify({ app: 'smartchat', format: 1, created_at: now(), tables });
  return zlib.gzipSync(Buffer.from(json), { level: 6 });
}

function parse(buf) {
  if (!Buffer.isBuffer(buf) || !buf.length) throw new Error('الملف فارغ');
  const raw = buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf;
  let data; try { data = JSON.parse(raw.toString('utf8')); } catch { throw new Error('الملف ليس نسخة احتياطية صالحة'); }
  if (data.app !== 'smartchat' || !data.tables?.users || !data.tables?.sites) throw new Error('الملف ليس نسخة احتياطية من هذا البرنامج');
  if (!data.tables.users.some(u => u.role === 'admin' && u.active)) throw new Error('النسخة لا تحتوي على مدير نظام فعّال');
  return data;
}

function restore(buf) {
  const data = parse(buf);
  const keepBackupCfg = meta.get('backup', null);
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      for (const t of [...TABLES].reverse()) db.prepare(`DELETE FROM ${t}`).run();
      for (const t of TABLES) {
        const rows = data.tables[t] || [], cols = columns(t);
        for (const r of rows) {
          const ks = Object.keys(r).filter(k => cols.includes(k));
          if (!ks.length) continue;
          db.prepare(`INSERT OR REPLACE INTO ${t}(${ks.join(',')}) VALUES(${ks.map(() => '?').join(',')})`)
            .run(...ks.map(k => (r[k] && typeof r[k] === 'object' && r[k].__b64 !== undefined) ? Buffer.from(r[k].__b64, 'base64') : r[k]));
        }
      }
      if (keepBackupCfg) meta.set('backup', keepBackupCfg); // the schedule/folder of this server stay as they are
    })();
  } finally { db.pragma('foreign_keys = ON'); }
  return { created_at: data.created_at, counts: Object.fromEntries(TABLES.map(t => [t, (data.tables[t] || []).length])) };
}

const stamp = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 16).replace('T', '_').replace(':', ''); // Riyadh time
const safeName = (n) => /^smartchat-[\w-]+\.scb$/.test(String(n)) ? String(n) : null;

function list() {
  const f = folder();
  return fs.readdirSync(f).filter(n => safeName(n)).map(n => { const st = fs.statSync(path.join(f, n)); return { name: n, size: st.size, created_at: st.mtime.toISOString(), kind: (n.match(/-(auto|manual|pre-reset|pre-restore)\.scb$/) || [])[1] || 'manual' }; })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function createFile(kind = 'manual') {
  const name = `smartchat-${stamp()}-${kind}.scb`, buf = dump();
  fs.writeFileSync(path.join(folder(), name), buf);
  prune();
  return { name, size: buf.length, buf };
}

function prune() {
  const keep = Math.max(1, Number(config().keep) || 7);
  list().filter(b => b.kind === 'auto').slice(keep).forEach(b => { try { fs.unlinkSync(path.join(folder(), b.name)); } catch { /* ignore */ } });
}

const readFile = (name) => { const n = safeName(name); if (!n) throw new Error('اسم غير صالح'); return fs.readFileSync(path.join(folder(), n)); };
const removeFile = (name) => { const n = safeName(name); if (!n) throw new Error('اسم غير صالح'); fs.unlinkSync(path.join(folder(), n)); };

async function emailBackup(file) {
  const to = config().email; if (!to) return;
  const { getSite } = require('./db'), notify = require('./notify');
  const site = getSite(db.prepare('SELECT id FROM sites ORDER BY id LIMIT 1').get()?.id);
  if (!site?.settings.notify.email.enabled) return;
  await notify.sendEmail(site, to, `نسخة احتياطية — ${file.name}`, `مرفق نسخة احتياطية تلقائية من المساعد الذكي.\nلاستعادتها: لوحة التحكم ← النسخ الاحتياطي ← استعادة من ملف.`, 'backup', [{ filename: file.name, content: file.buf }]);
}

// Called every few minutes: makes the scheduled backup when it is due.
async function tick() {
  const c = config(); if (!c.enabled) return;
  const last = meta.get('backup_last', null);
  const riyadh = new Date(Date.now() + 3 * 3600000), hour = riyadh.getUTCHours();
  const period = (c.frequency === 'weekly' ? 7 : c.frequency === 'hourly' ? 1 / 24 : 1) * 86400000;
  const due = !last || Date.now() - new Date(last).getTime() >= period - 30 * 60000;
  if (!due || (c.frequency !== 'hourly' && hour < Number(c.hour || 0))) return;
  try {
    const f = createFile('auto'); meta.set('backup_last', now());
    console.log('[backup] created', f.name);
    await emailBackup(f).catch(e => console.error('[backup] email failed:', e.message));
  } catch (e) { console.error('[backup] failed:', e.message); }
}

// Factory reset. scope: { conversations, tickets, knowledge, media, users, settings, logs }
function reset(scope, keepUserId) {
  try { createFile('pre-reset'); } catch (e) { console.error('[reset] safety backup failed:', e.message); }
  const s = scope || {};
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      if (s.conversations) { db.prepare('DELETE FROM messages').run(); db.prepare('DELETE FROM conversations').run(); db.prepare('DELETE FROM elig_results').run(); }
      if (s.tickets) { db.prepare('DELETE FROM ticket_events').run(); db.prepare('DELETE FROM tickets').run(); }
      if (s.knowledge) { db.prepare('DELETE FROM kb').run(); db.prepare('DELETE FROM kb_categories').run(); db.prepare('DELETE FROM unanswered').run(); }
      if (s.media) db.prepare('DELETE FROM media_assets').run();
      if (s.logs) { db.prepare('DELETE FROM audit').run(); db.prepare('DELETE FROM notify_log').run(); db.prepare('DELETE FROM widget_pings').run(); }
      if (s.users) db.prepare('DELETE FROM users WHERE id != ?').run(keepUserId);
      if (s.settings) {
        for (const t of ['program_regs', 'appointments', 'elig_results', 'messages', 'conversations', 'ticket_events', 'tickets', 'kb', 'kb_categories', 'unanswered', 'widget_pings']) db.prepare(`DELETE FROM ${t}`).run();
        db.prepare('DELETE FROM sites').run();
      }
    })();
  } finally { db.pragma('foreign_keys = ON'); }
  if (s.settings) createSite('موقعي'); // a fresh site with a NEW key: old embed codes / plugins stop working
}

module.exports = { dump, restore, parse, list, createFile, readFile, removeFile, tick, reset, config, folder, DEFAULTS };
