// Programs open for registration (courses, aid rounds, events…).
// A program is shown to visitors only while it is open:
//   enabled, today between «from» and «to» (Riyadh time), not marked full, and seats left (if a number of seats is set).
// Seats taken = people registered inside the chat + the number the admin typed (people registered elsewhere, e.g. on the link).
const { db, now, meta } = require('./db');

const today = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const regsIn = (siteId, pid) => db.prepare('SELECT COUNT(*) n FROM program_regs WHERE site_id=? AND program_id=?').get(siteId, String(pid)).n;
const clicks = (siteId, pid) => Number(meta.get(`regclick:${siteId}:${pid}`, 0)) || 0;

function statusOf(site, p) {
  const t = today(), cap = Number(p.capacity) || 0;
  const taken = regsIn(site.id, p.id) + (Number(p.manual_count) || 0);
  const left = cap ? Math.max(0, cap - taken) : null;
  let status = 'open';
  if (p.enabled === false) status = 'off';
  else if (p.from && t < p.from) status = 'soon';
  else if (p.to && t > p.to) status = 'ended';
  else if (p.full || (cap && left <= 0)) status = 'full';
  return { status, open: status === 'open', taken, left, regs: regsIn(site.id, p.id), clicks: clicks(site.id, p.id) };
}
const programs = (site) => ((site.settings.regs || {}).programs || []).filter(p => p && p.id && p.title);
const openPrograms = (site) => programs(site).filter(p => statusOf(site, p).open);
const find = (site, id) => programs(site).find(p => p.id === String(id));

function register(site, p, name, phone, convId) {
  const dup = phone && db.prepare('SELECT id FROM program_regs WHERE site_id=? AND program_id=? AND phone=?').get(site.id, p.id, phone);
  if (dup) return { dup: true, number: 'REG-' + dup.id };
  const id = db.prepare('INSERT INTO program_regs(site_id, program_id, name, phone, conversation_id, created_at) VALUES(?,?,?,?,?,?)').run(site.id, p.id, String(name).slice(0, 120), phone || '', convId || null, now()).lastInsertRowid;
  return { number: 'REG-' + id };
}
function countClick(siteId, pid) { meta.set(`regclick:${siteId}:${pid}`, clicks(siteId, pid) + 1); }

// «20 نوفمبر 2026»
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(d, lang) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); if (!m) return d || ''; return `${Number(m[3])} ${(lang === 'en' ? MONTHS_EN : MONTHS_AR)[Number(m[2]) - 1]} ${m[1]}`; }

module.exports = { today, statusOf, programs, openPrograms, find, register, countClick, fmtDate };
