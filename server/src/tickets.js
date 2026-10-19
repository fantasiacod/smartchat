// Complaints, suggestions and inquiries.
const { db, now, getSite } = require('./db');
const notify = require('./notify');

const TYPES = ['complaint', 'suggestion', 'inquiry', 'callback'];
const STATUSES = ['new', 'in_progress', 'resolved', 'closed', 'rejected'];

function nextNumber(site, type) {
  const t = site.settings.tickets;
  const prefix = (type === 'suggestion' ? t.prefix_suggestion : type === 'inquiry' ? t.prefix_inquiry : type === 'callback' ? (t.prefix_callback || 'R') : t.prefix_complaint) || 'T';
  const row = db.prepare("SELECT MAX(CAST(substr(number, instr(number,'-')+1) AS INTEGER)) n FROM tickets WHERE site_id=? AND number LIKE ?").get(site.id, prefix + '-%');
  return `${prefix}-${Math.max(1000, row.n || 1000) + 1}`;
}

function hydrate(r) { return r ? { ...r } : null; }
const get = (id) => hydrate(db.prepare('SELECT * FROM tickets WHERE id=?').get(id));
const getByNumber = (siteId, number) => hydrate(db.prepare('SELECT * FROM tickets WHERE site_id=? AND upper(number)=upper(?)').get(siteId, String(number || '').trim()));

function event(ticketId, userId, kind, details) {
  db.prepare('INSERT INTO ticket_events(ticket_id,user_id,kind,details,created_at) VALUES(?,?,?,?,?)')
    .run(ticketId, userId || null, kind, typeof details === 'string' ? details : JSON.stringify(details || {}), now());
}

function validate(v, site, type) {
  const errors = {};
  const name = String(v.name || '').trim().slice(0, 100);
  const phone = require('./nlp').toLatinDigits(String(v.phone || '')).replace(/[^\d+]/g, '').slice(0, 20);
  const email = String(v.email || '').trim().toLowerCase().slice(0, 150);
  const text = String(v.text || '').trim().slice(0, 4000);
  if (!name) errors.name = 'required';
  if (!phone) errors.phone = 'required'; else if (phone.replace(/\D/g, '').length < 9) errors.phone = 'invalid';
  if (site.settings.tickets.require_email && !email && type !== 'callback') errors.email = 'required';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'invalid';
  if (text.length < 3 && type !== 'callback') errors.text = 'required';
  return { errors, clean: { name, phone, email, text } };
}

async function create(site, values, { type, lang, conversationId } = {}) {
  const t = TYPES.includes(type) ? type : 'complaint';
  const { errors, clean } = validate(values, site, t);
  if (t === 'callback' && clean.text.length < 3) clean.text = 'طلب تواصل خارج أوقات العمل';
  if (Object.keys(errors).length) { const e = new Error('validation'); e.fields = errors; throw e; }
  const number = nextNumber(site, t), ts = now();
  const r = db.prepare('INSERT INTO tickets(site_id,number,type,status,name,phone,email,text,lang,conversation_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(site.id, number, t, 'new', clean.name, clean.phone, clean.email || null, clean.text, lang || 'ar', conversationId || null, ts, ts);
  const ticket = get(r.lastInsertRowid);
  event(ticket.id, null, 'created', { via: conversationId ? 'chat' : 'api' });
  require('./webhooks').emit(site, 'ticket.created', ticket);
  notify.notifyTicket(site, ticket, 'ticket_created')
    .then(res => event(ticket.id, null, 'notified', res)).catch(() => { /* logged in notify_log */ });
  return ticket;
}

async function update(id, patch, userId) {
  const t = get(id); if (!t) return null;
  const fields = {};
  if (patch.status && STATUSES.includes(patch.status) && patch.status !== t.status) fields.status = patch.status;
  if (patch.reply !== undefined && patch.reply !== t.reply) fields.reply = String(patch.reply || '').slice(0, 4000);
  if (patch.internal_note !== undefined) fields.internal_note = String(patch.internal_note || '').slice(0, 4000);
  if (patch.priority && ['low', 'normal', 'high', 'urgent'].includes(patch.priority)) fields.priority = patch.priority;
  if (patch.category !== undefined) fields.category = String(patch.category || '').slice(0, 80);
  if (patch.assigned_to !== undefined) fields.assigned_to = patch.assigned_to ? Number(patch.assigned_to) : null;
  if (patch.type && TYPES.includes(patch.type)) fields.type = patch.type;
  if (fields.status && ['resolved', 'closed', 'rejected'].includes(fields.status)) fields.resolved_at = now();
  if (!Object.keys(fields).length) return { ticket: t, notified: null };
  fields.updated_at = now();
  db.prepare(`UPDATE tickets SET ${Object.keys(fields).map(k => k + '=?').join(',')} WHERE id=?`).run(...Object.values(fields), id);
  const updated = get(id);
  event(id, userId, 'updated', { from: t.status, to: updated.status, reply: fields.reply !== undefined });
  require('./webhooks').emit(getSite(t.site_id), 'ticket.updated', updated);
  let notified = null;
  const visible = fields.status || fields.reply !== undefined;
  if (visible && patch.notify !== false) {
    notified = await notify.notifyTicket(getSite(t.site_id), updated, 'ticket_updated');
    event(id, userId, 'notified', notified);
  }
  return { ticket: updated, notified };
}

module.exports = { TYPES, STATUSES, create, update, get, getByNumber, event, validate };
