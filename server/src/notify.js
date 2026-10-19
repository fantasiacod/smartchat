// Outgoing notifications: e-mail (SMTP), SMS (several providers) and WhatsApp (Cloud API or manual link).
const { db, now } = require('./db');

function fill(tpl, ctx) { return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (ctx[k] ?? '') + ''); }

// 05xxxxxxxx / 5xxxxxxxx / +9665... -> 9665xxxxxxxx (digits only, international, no +)
function intlPhone(p) {
  let d = String(p || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '');
  if (/^05\d{8}$/.test(d)) d = '966' + d.slice(1);
  else if (/^5\d{8}$/.test(d)) d = '966' + d;
  return d;
}

function log(siteId, channel, recipient, subject, status, error, ref) {
  db.prepare('INSERT INTO notify_log(site_id,channel,recipient,subject,status,error,ref,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(siteId || null, channel, recipient, subject || '', status, error || null, ref || null, now());
}

async function http(url, opts) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, { ...opts, signal: ctl.signal });
    const body = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    return body;
  } finally { clearTimeout(t); }
}

/* ---------------- e-mail ---------------- */
const transports = new Map();
function transporter(cfg) {
  const key = JSON.stringify([cfg.host, cfg.port, cfg.secure, cfg.user, cfg.pass]);
  if (!transports.has(key)) {
    const nodemailer = require('nodemailer');
    transports.set(key, nodemailer.createTransport({
      host: cfg.host, port: Number(cfg.port) || 587, secure: !!cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
      connectionTimeout: 15000, greetingTimeout: 15000, tls: { rejectUnauthorized: !cfg.allow_self_signed }
    }));
  }
  return transports.get(key);
}

function htmlEmail(site, text) {
  const a = site.settings.appearance, o = site.settings.org;
  const color = a.primary_color || '#1a6739';
  const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#f4f6f8;padding:24px">
  <div style="max-width:560px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:${color};color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">${esc(o.name || a.company_name || site.name)}</div>
    <div style="padding:22px;line-height:1.9;color:#111827;font-size:15px;white-space:pre-wrap">${esc(text)}</div>
    <div style="padding:14px 22px;background:#f9fafb;color:#6b7280;font-size:12px">${o.unified_number ? 'الرقم الموحد: ' + esc(o.unified_number) + ' — ' : ''}${esc(o.website || '')}</div>
  </div></div>`;
}

async function sendEmail(site, to, subject, text, ref) {
  const cfg = site.settings.notify.email;
  if (!cfg.enabled || !cfg.host) throw new Error('البريد الإلكتروني غير مفعّل');
  if (!to) throw new Error('لا يوجد بريد للمستلم');
  try {
    const fromName = cfg.from_name || site.settings.org.name || site.name;
    await transporter(cfg).sendMail({ from: `"${fromName.replace(/"/g, '')}" <${cfg.from_email || cfg.user}>`, to, subject, text, html: htmlEmail(site, text) });
    log(site.id, 'email', to, subject, 'sent', null, ref);
  } catch (e) { log(site.id, 'email', to, subject, 'failed', e.message, ref); throw e; }
}

/* ---------------- SMS ---------------- */
const SMS_PROVIDERS = {
  taqnyat: async (c, phone, msg) => http('https://api.taqnyat.sa/v1/messages', {
    method: 'POST', headers: { Authorization: 'Bearer ' + c.api_key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipients: [phone], body: msg, sender: c.sender })
  }),
  unifonic: async (c, phone, msg) => http('https://el.cloud.unifonic.com/rest/SMS/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ AppSid: c.api_key, SenderID: c.sender, Body: msg, Recipient: phone }).toString()
  }),
  msegat: async (c, phone, msg) => http('https://www.msegat.com/gw/sendsms.php', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userName: c.username, apiKey: c.api_key, numbers: phone, userSender: c.sender, msg, msgEncoding: 'UTF8' })
  }),
  twilio: async (c, phone, msg) => http(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.account_sid)}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(c.account_sid + ':' + c.auth_token).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: '+' + phone, From: c.sender, Body: msg }).toString()
  }),
  custom: async (c, phone, msg) => {
    let headers = {}; try { headers = JSON.parse(c.custom_headers || '{}'); } catch { /* ignore */ }
    const jsonSafe = (s) => JSON.stringify(String(s)).slice(1, -1);
    const isJson = /json/i.test(headers['Content-Type'] || headers['content-type'] || '');
    const ctx = { phone, message: isJson ? jsonSafe(msg) : encodeURIComponent(msg), sender: c.sender, api_key: c.api_key };
    const url = fill(c.custom_url, { ...ctx, message: encodeURIComponent(msg) });
    const method = (c.custom_method || 'POST').toUpperCase();
    return http(url, { method, headers, body: method === 'GET' ? undefined : fill(c.custom_body, ctx) });
  }
};

async function sendSms(site, phone, text, ref) {
  const c = site.settings.notify.sms;
  if (!c.enabled || !SMS_PROVIDERS[c.provider]) throw new Error('الرسائل النصية غير مفعّلة');
  const to = intlPhone(phone);
  if (!to) throw new Error('لا يوجد رقم جوال');
  try { await SMS_PROVIDERS[c.provider](c, to, text); log(site.id, 'sms', to, '', 'sent', null, ref); }
  catch (e) { log(site.id, 'sms', to, '', 'failed', e.message, ref); throw e; }
}

/* ---------------- WhatsApp ---------------- */
function waLink(phone, text) { return `https://wa.me/${intlPhone(phone)}?text=${encodeURIComponent(text)}`; }

async function sendWhatsApp(site, phone, text, ref) {
  const c = site.settings.notify.whatsapp;
  const to = intlPhone(phone);
  if (!to) throw new Error('لا يوجد رقم جوال');
  if (c.mode !== 'cloud' || !c.token || !c.phone_number_id) return { manual: true, link: waLink(to, text) };
  try {
    await http(`https://graph.facebook.com/${c.api_version || 'v21.0'}/${encodeURIComponent(c.phone_number_id)}/messages`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } })
    });
    log(site.id, 'whatsapp', to, '', 'sent', null, ref);
    return { sent: true };
  } catch (e) { log(site.id, 'whatsapp', to, '', 'failed', e.message, ref); return { manual: true, link: waLink(to, text), error: e.message }; }
}

/* ---------------- ticket notifications ---------------- */
function ticketContext(site, t, labels) {
  const tr = labels || require('./i18n').texts(site, t.lang || 'ar');
  return {
    name: t.name || '', phone: t.phone || '', number: t.number, type: tr['t_' + t.type] || t.type,
    status: tr['s_' + t.status] || t.status, date: new Date(t.created_at).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn'),
    reply: t.reply ? (tr.ticket_reply_prefix || '').trim() + ' ' + t.reply : '', text: t.text || '',
    org: site.settings.org.name || site.settings.appearance.company_name || site.name
  };
}

// event: 'ticket_created' | 'ticket_updated'. Never throws; returns per-channel results.
async function notifyTicket(site, t, event) {
  const n = site.settings.notify, ch = n.channels[event] || {}, tpl = n.templates;
  const ctx = ticketContext(site, t);
  const body = fill(tpl[event], ctx).replace(/\n{3,}/g, '\n\n').trim();
  const subject = fill(tpl[event + '_subject'], ctx);
  const out = {};
  const run = async (key, fn) => { try { out[key] = (await fn()) || { sent: true }; } catch (e) { out[key] = { error: e.message }; } };
  if (ch.email && t.email && n.email.enabled) await run('email', () => sendEmail(site, t.email, subject, body, t.number));
  if (ch.sms && t.phone && n.sms.enabled) await run('sms', () => sendSms(site, t.phone, body, t.number));
  if (ch.whatsapp && t.phone) await run('whatsapp', () => sendWhatsApp(site, t.phone, body, t.number));
  if (event === 'ticket_created' && site.settings.tickets.notify_admins && n.admin_emails && n.email.enabled) {
    const admin = fill(tpl.admin_new_ticket, ctx), sub = fill(tpl.admin_new_ticket_subject, ctx);
    for (const to of n.admin_emails.split(/[\s,;]+/).filter(Boolean)) await run('admin:' + to, () => sendEmail(site, to, sub, admin, t.number));
  }
  return out;
}

module.exports = { sendEmail, sendSms, sendWhatsApp, waLink, notifyTicket, ticketContext, intlPhone, fill, SMS_PROVIDERS: Object.keys(SMS_PROVIDERS) };
