// Conversation engine: flow tree, organisation info, knowledge base & learning, DB lookups,
// complaints/suggestions, human hand-off (last resort), closing & ratings. Multi-language.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { db, now, getSite, getSiteByKey, getConv } = require('./db');
const nlp = require('./nlp');
const ds = require('./datasource');
const { texts, INTENTS, LANGS } = require('./i18n');
const tickets = require('./tickets');

let vio, aio, JWT_SECRET;
const online = new Map(); // userId -> {id,name,role}

/* ============================== helpers ============================== */

function fill(tpl, ctx) {
  return String(tpl ?? '').replace(/\{(\w+)\}/g, (_, k) => (ctx[k] ?? '') + '').replace(/[ \t]+([👋!،,.])/g, ' $1').replace(/ {2,}/g, ' ').replace(/^[ ،,]+|[ ،,]+$/gm, '');
}

function saveConv(conv, fields) {
  const cols = Object.keys(fields);
  const vals = cols.map(c => (c === 'meta' || c === 'state') ? JSON.stringify(fields[c]) : fields[c]);
  db.prepare(`UPDATE conversations SET ${cols.map(c => c + '=?').join(',')}, updated_at=? WHERE id=?`).run(...vals, now(), conv.id);
  Object.assign(conv, fields);
}

const userCache = new Map();
function agentInfo(id) {
  if (!id) return null;
  const c = userCache.get(id);
  if (c && Date.now() - c.t < 30000) return c.v;
  const u = db.prepare('SELECT id,name,job_title,avatar FROM users WHERE id=?').get(id);
  const v = u ? { id: u.id, name: u.name, title: u.job_title || '', avatar: u.avatar || '' } : null;
  userCache.set(id, { v, t: Date.now() });
  return v;
}
const agentName = (id) => agentInfo(id)?.name || null;

function parsePayload(p) {
  if (!p) return null;
  if (typeof p === 'object') return p;
  try { return JSON.parse(p); } catch { return null; }
}

function publicMsg(m) {
  const p = parsePayload(m.payload) || {};
  let media = p.media || [];
  if (typeof media === 'string') { try { media = JSON.parse(media); } catch { media = []; } }
  const ag = m.sender === 'agent' ? agentInfo(m.agent_id) : null;
  return {
    id: m.id, sender: m.sender, body: m.body, created_at: m.created_at,
    agent_name: ag?.name, agent_title: ag?.title || undefined, agent_avatar: ag?.avatar || undefined,
    options: p.options?.length ? p.options.map((o, i) => ({ i, label: o.label })) : undefined,
    numbered: p.numbered || undefined,
    media: media.length ? media : undefined,
    link: p.link, link_label: p.link_label,
    location: p.location, contacts: p.contacts,
    form: p.form ? { ...p.form } : undefined
  };
}

function convSummary(c) {
  const last = db.prepare('SELECT sender, body, created_at FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT 1').get(c.id);
  const site = db.prepare('SELECT name FROM sites WHERE id=?').get(c.site_id);
  const st = typeof c.state === 'string' ? (JSON.parse(c.state || '{}')) : (c.state || {});
  return {
    id: c.id, site_id: c.site_id, site_name: site?.name, status: c.status, lang: c.lang || 'ar',
    visitor_name: c.visitor_name, visitor_email: c.visitor_email, visitor_phone: c.visitor_phone, verified: !!c.verified,
    assigned_to: c.assigned_to, agent_name: agentName(c.assigned_to), closed_by: c.closed_by, rating: c.rating,
    pending_question: (st.pending || []).slice(-1)[0] || null, page_url: c.page_url,
    created_at: c.created_at, updated_at: c.updated_at, closed_at: c.closed_at, handoff_at: c.handoff_at, first_response_at: c.first_response_at,
    last_message: last ? { sender: last.sender, body: (last.body || '').slice(0, 140), created_at: last.created_at } : null
  };
}

const broadcastConv = (conv) => aio.emit('conv:update', convSummary(getConv(conv.id)));

function queuePosition(conv) {
  if (conv.status !== 'waiting') return 0;
  return db.prepare("SELECT COUNT(*) c FROM conversations WHERE status='waiting' AND site_id=? AND handoff_at <= ?").get(conv.site_id, conv.handoff_at || now()).c;
}

function visitorStatus(conv) {
  const a = agentInfo(conv.assigned_to);
  vio.to('c' + conv.id).emit('status', { status: conv.status, agent_name: a?.name, agent_title: a?.title, agent_avatar: a?.avatar, queue: queuePosition(conv), agents_online: online.size });
}

function addMessage(conv, sender, body, payload = null, agentId = null) {
  const t = now();
  const info = db.prepare('INSERT INTO messages(conversation_id,sender,agent_id,body,payload,created_at) VALUES(?,?,?,?,?,?)')
    .run(conv.id, sender, agentId, body, payload ? JSON.stringify(payload) : null, t);
  db.prepare('UPDATE conversations SET updated_at=? WHERE id=?').run(t, conv.id);
  conv.updated_at = t;
  const m = { id: info.lastInsertRowid, sender, agent_id: agentId, body, payload, created_at: t, conversation_id: conv.id };
  vio.to('c' + conv.id).emit('message', publicMsg(m));
  aio.emit('conv:message', { conversation_id: conv.id, ...publicMsg(m), agent_id: agentId });
  broadcastConv(conv);
  return m;
}

const tr = (conv, site) => texts(site, conv.lang || site.settings.languages.default || 'ar');
const L = (conv, base, i18n, key) => (conv.lang && conv.lang !== 'ar' && i18n?.[conv.lang]?.[key]) || base;

function ctxOf(conv, site) {
  const c = conv.meta?.customer || {};
  const t = tr(conv, site);
  return { ...c, name: c.name || conv.visitor_name || '', phone: conv.visitor_phone || '', email: conv.visitor_email || '', bot: t.bot_name, org: site.settings.org.name || site.name };
}

function botSay(conv, site, body, options, extra = {}) {
  const payload = { ...extra };
  if (options?.length) payload.options = options;
  return addMessage(conv, 'bot', body, Object.keys(payload).length ? payload : null);
}

function navOptions(conv, site) {
  const t = tr(conv, site);
  return [{ label: t.nav_home, action: 'goto', target: '__menu' }, { label: t.nav_agent, action: 'handoff' }];
}

/* ============================== flow ============================== */

function findNode(site, id) {
  const tree = site.tree;
  if (!id || id === '__root') return tree.nodes.find(n => n.id === tree.root) || tree.nodes[0];
  if (id === '__menu') return tree.nodes.find(n => n.id === 'menu') || tree.nodes.find(n => n.id === tree.root) || tree.nodes[0];
  return tree.nodes.find(n => n.id === id);
}

function sendNode(conv, site, nodeId, depth = 0) {
  const node = findNode(site, nodeId);
  if (!node) return botSay(conv, site, tr(conv, site).unlinked, navOptions(conv, site));
  saveConv(conv, { state: { ...conv.state, node: node.id, await: null } });
  const opts = (node.options || []).map(o => ({ ...o, label: L(conv, o.label, o.i18n, 'label') }));
  const msg = fill(L(conv, node.message, node.i18n, 'message'), ctxOf(conv, site));
  const extra = {};
  if (node.media?.length) extra.media = node.media;
  if (node.numbered && opts.length) extra.numbered = true;
  if (msg || opts.length || extra.media) botSay(conv, site, msg, opts, extra);
  if (node.auto_next && node.auto_next !== node.id && depth < 3) return sendNode(conv, site, node.auto_next, depth + 1);
}

function parseCoords(o) {
  let lat = parseFloat(o.lat), lng = parseFloat(o.lng);
  if (!(isFinite(lat) && isFinite(lng)) && o.map_url) {
    const m = String(o.map_url).match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || String(o.map_url).match(/[?&](?:q|query|ll|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i);
    if (m) { lat = parseFloat(m[1]); lng = parseFloat(m[2]); }
  }
  return isFinite(lat) && isFinite(lng) ? { lat, lng } : null;
}

function locationPayload(site) {
  const o = site.settings.org;
  const c = parseCoords(o);
  if (!c && !o.map_url && !o.address) return null;
  const q = c ? `${c.lat},${c.lng}` : o.address;
  return {
    lat: c?.lat, lng: c?.lng, label: o.name || site.name, address: o.address || '',
    url: o.map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,
    directions: q ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}` : o.map_url,
    embed: q ? `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed` : null
  };
}

const SOCIAL = { x: ['𝕏 X', 'https://x.com/'], instagram: ['📸 Instagram', 'https://instagram.com/'], snapchat: ['👻 Snapchat', 'https://snapchat.com/add/'], tiktok: ['🎵 TikTok', 'https://tiktok.com/@'], youtube: ['▶️ YouTube', 'https://youtube.com/@'], facebook: ['📘 Facebook', 'https://facebook.com/'], linkedin: ['💼 LinkedIn', 'https://linkedin.com/company/'], whatsapp: ['🟢 WhatsApp', 'https://wa.me/'] };
const socialHref = (k, v) => /^https?:\/\//i.test(v) ? v : SOCIAL[k][1] + (k === 'whatsapp' ? require('./notify').intlPhone(v) : String(v).trim().replace(/^@/, ''));

// Returns true when it answered.
function sendOrg(conv, site, field, opts = {}) {
  const o = site.settings.org, t = tr(conv, site), name = o.name || site.name;
  const nav = opts.nav === false ? undefined : navOptions(conv, site);
  const contacts = () => {
    const list = [];
    if (o.unified_number) list.push({ icon: '☎️', label: conv.lang === 'en' ? 'Unified number' : conv.lang === 'ur' ? 'یونیفائیڈ نمبر' : 'الرقم الموحد', value: o.unified_number, href: 'tel:' + o.unified_number.replace(/\s/g, '') });
    for (const d of o.departments || []) for (const p of String(d.phones || '').split(/[,،\s]+/).filter(Boolean)) list.push({ icon: '📱', label: d.name || '', value: p, href: 'tel:' + p });
    if (o.email) list.push({ icon: '✉️', label: 'Email', value: o.email, href: 'mailto:' + o.email });
    return list;
  };
  switch (field) {
    case 'history': case 'about': {
      const text = [o.short, o.history].filter(Boolean).join('\n\n');
      if (!text && !(o.media?.history || []).length) return opts.silent ? false : !!botSay(conv, site, t.org_missing, nav);
      botSay(conv, site, text ? `🏢 *${name}*\n\n${text}` : `🏢 *${name}*`, nav, (o.media?.history || []).length ? { media: o.media.history } : {});
      return true;
    }
    case 'vision': {
      const parts = [o.vision && `🎯 *${conv.lang === 'en' ? 'Vision' : conv.lang === 'ur' ? 'وژن' : 'الرؤية'}*\n${o.vision}`, o.mission && `📜 *${conv.lang === 'en' ? 'Mission' : conv.lang === 'ur' ? 'مشن' : 'الرسالة'}*\n${o.mission}`, o.goals && `🏁 *${conv.lang === 'en' ? 'Goals' : conv.lang === 'ur' ? 'مقاصد' : 'الأهداف'}*\n${o.goals}`].filter(Boolean);
      if (!parts.length) return opts.silent ? false : !!botSay(conv, site, t.org_missing, nav);
      botSay(conv, site, parts.join('\n\n'), nav); return true;
    }
    case 'contact': {
      const list = contacts();
      if (!list.length) return opts.silent ? false : !!botSay(conv, site, t.org_missing, nav);
      botSay(conv, site, `📞 ${name}`, nav, { contacts: list }); return true;
    }
    case 'hours':
      if (!o.hours) return opts.silent ? false : !!botSay(conv, site, t.org_missing, nav);
      botSay(conv, site, `🕘 ${o.hours}`, nav); return true;
    case 'website':
      if (!o.website) return opts.silent ? false : !!botSay(conv, site, t.org_missing, nav);
      botSay(conv, site, `🌐 ${name}`, nav, { link: o.website, link_label: t.visit_site }); return true;
    case 'social': {
      const list = Object.keys(SOCIAL).filter(k => o.social?.[k]).map(k => ({ icon: '', label: SOCIAL[k][0], value: o.social[k].replace(/^https?:\/\/(www\.)?/, ''), href: socialHref(k, o.social[k]) }));
      if (o.website) list.unshift({ icon: '🌐', label: conv.lang === 'en' ? 'Website' : 'الموقع', value: o.website.replace(/^https?:\/\/(www\.)?/, ''), href: o.website });
      if (!list.length) return opts.silent ? false : !!botSay(conv, site, t.org_missing, nav);
      botSay(conv, site, `🔗 ${name}`, nav, { contacts: list }); return true;
    }
    case 'developer': {
      const d = site.settings.developer;
      if (!d.show || !d.name) return opts.silent ? false : !!botSay(conv, site, t.org_missing, nav);
      botSay(conv, site, `💻 ${d.description || ''} *${d.name}*`.trim(), nav, d.url ? { link: d.url, link_label: t.visit_site, ...(d.logo ? { media: [{ type: 'image', url: d.logo, name: d.name }] } : {}) } : {});
      return true;
    }
    case 'location': return sendLocation(conv, site, opts);
    default: {
      if (String(field || '').startsWith('custom:')) {
        const c = (o.custom || []).find(x => x.id === field.slice(7));
        if (c) { botSay(conv, site, L(conv, c.answer, c.i18n, 'answer'), nav, c.media?.length ? { media: c.media } : {}); return true; }
      }
      return opts.silent ? false : !!botSay(conv, site, t.org_missing, nav);
    }
  }
}

function sendLocation(conv, site, opts = {}) {
  const t = tr(conv, site), loc = locationPayload(site);
  const nav = opts.nav === false ? undefined : navOptions(conv, site);
  if (!loc) return opts.silent ? false : !!botSay(conv, site, t.org_missing, nav);
  const extra = { location: loc };
  if ((site.settings.org.media?.location || []).length) extra.media = site.settings.org.media.location;
  botSay(conv, site, `📍 ${loc.label}${loc.address ? '\n' + loc.address : ''}`, nav, extra);
  return true;
}

function sendTicketForm(conv, site, type) {
  const t = tr(conv, site);
  if (!site.settings.tickets.enabled) return botSay(conv, site, t.unlinked, navOptions(conv, site));
  const ty = tickets.TYPES.includes(type) ? type : 'complaint';
  return botSay(conv, site, t.ticket_intro, null, {
    form: {
      kind: 'ticket', type: ty, title: t['ticket_form_' + ty] || t['t_' + ty],
      name: conv.visitor_name || '', phone: conv.visitor_phone || '', email: conv.visitor_email || '',
      require_email: !!site.settings.tickets.require_email
    }
  });
}

async function runAction(conv, site, opt, freeText) {
  const t = tr(conv, site);
  switch (opt.action) {
    case 'goto': return findNode(site, opt.target) ? sendNode(conv, site, opt.target) : botSay(conv, site, t.unlinked, navOptions(conv, site));
    case 'handoff': return handoff(conv, site, freeText || null, t.handoff);
    case 'order_status': return startLookup(conv, site, 'order', freeText);
    case 'customer_info': return startLookup(conv, site, 'customer', freeText);
    case 'answer': return botSay(conv, site, fill(L(conv, opt.target || '', opt.i18n, 'target'), ctxOf(conv, site)), navOptions(conv, site), opt.media?.length ? { media: opt.media } : {});
    case 'url': return botSay(conv, site, opt.label, navOptions(conv, site), { link: opt.target, link_label: t.open_link });
    case 'location': case 'company_location': return sendLocation(conv, site);
    case 'org': return sendOrg(conv, site, opt.field || 'history');
    case 'company_info': return sendOrg(conv, site, 'history');
    case 'company_website': return sendOrg(conv, site, 'website');
    case 'developer': return sendOrg(conv, site, 'developer');
    case 'ticket': return sendTicketForm(conv, site, opt.field || opt.target || 'complaint');
    case 'ticket_status':
      saveConv(conv, { state: { ...conv.state, await: { kind: 'ticket_status', step: 'number' } } });
      return botSay(conv, site, t.ticket_ask_number, [{ label: t.nav_cancel, action: 'cancel' }]);
    case 'kb': {
      const k = db.prepare('SELECT * FROM kb WHERE id=? AND site_id=?').get(Number(opt.target), site.id);
      if (!k) return sendNode(conv, site, '__menu');
      db.prepare('UPDATE kb SET hits=hits+1 WHERE id=?').run(k.id);
      return botSay(conv, site, k.answer, navOptions(conv, site), mediaOf(k));
    }
    case 'end': return closeConversation(conv, 'visitor');
    case 'cancel': return sendNode(conv, site, '__menu');
    default: return sendNode(conv, site, '__menu');
  }
}

function mediaOf(k) {
  let m = []; try { m = JSON.parse(k.media || '[]'); } catch { /* ignore */ }
  return m.length ? { media: m } : {};
}

/* ============================== lookups (datasource) ============================== */

function startLookup(conv, site, kind, freeText) {
  const d = site.settings.datasource, t = tr(conv, site);
  const q = kind === 'order' ? d.order_query : d.customer_query;
  if (d.type === 'none' || !q) return handoff(conv, site, freeText || null, t.handoff);
  const names = ds.paramNames(q);
  const params = {};
  if (conv.visitor_phone) params.phone = conv.visitor_phone;
  if (conv.visitor_email && (conv.verified || kind === 'customer')) params.email = conv.visitor_email;
  if (kind === 'order' && freeText && names.includes('order_no')) {
    const m = nlp.toLatinDigits(freeText).match(/\b\d{3,}\b/);
    if (m) params.order_no = m[0];
  }
  const missing = kind === 'customer' ? (names.some(n => params[n]) ? [] : [names.includes('phone') ? 'phone' : names[0]]) : names.filter(n => !params[n]);
  saveConv(conv, { state: { ...conv.state, await: { kind, params, missing } } });
  return askNext(conv, site);
}

function askNext(conv, site) {
  const a = conv.state.await, t = tr(conv, site);
  if (a.missing.length) {
    const n = a.missing[0];
    const custom = site.settings.datasource.param_prompts?.[n];
    return botSay(conv, site, (conv.lang === 'ar' && custom) || t['ask_' + n] || fill(t.ask_param, { param: n }), [{ label: t.nav_cancel, action: 'cancel' }]);
  }
  return executeLookup(conv, site);
}

async function executeLookup(conv, site) {
  const a = conv.state.await, d = site.settings.datasource, t = tr(conv, site);
  saveConv(conv, { state: { ...conv.state, await: null } });
  const q = a.kind === 'order' ? d.order_query : d.customer_query;
  let rows;
  try { rows = await ds.query(d, q, a.params); }
  catch (e) { console.error('[datasource]', e.message); return botSay(conv, site, (conv.lang === 'ar' && d.error_message) || t.db_error, navOptions(conv, site)); }
  if (!rows.length) {
    return botSay(conv, site, a.kind === 'order' ? ((conv.lang === 'ar' && d.not_found) || t.not_found) : t.customer_not_found,
      [{ label: t.nav_retry, action: a.kind === 'order' ? 'order_status' : 'customer_info' }, ...navOptions(conv, site)]);
  }
  if (a.params.phone && !conv.visitor_phone) saveConv(conv, { visitor_phone: a.params.phone });
  if (a.kind === 'customer') {
    const row = rows[0];
    saveConv(conv, { meta: { ...conv.meta, customer: row }, visitor_name: conv.visitor_name || row.name || null });
    broadcastConv(conv);
    return botSay(conv, site, fill(d.customer_template, { ...a.params, ...row }), navOptions(conv, site));
  }
  const lookups = conv.meta.lookups || [];
  lookups.push({ at: now(), params: a.params, rows: rows.slice(0, 3) });
  saveConv(conv, { meta: { ...conv.meta, lookups: lookups.slice(-10) } });
  for (const row of rows.slice(0, 3)) {
    const ctx = { ...a.params, ...row };
    let text = fill(d.order_template, ctx);
    if (row.notes && String(row.notes).trim()) text += '\n' + fill(d.notes_template, ctx);
    botSay(conv, site, text);
  }
  return botSay(conv, site, t.anything_else, navOptions(conv, site));
}

/* ============================== hand-off & learning ============================== */

const GREETINGS = new Set(['السلام عليكم', 'السلام عليكم ورحمه الله', 'مرحبا', 'هلا', 'اهلا', 'الو', 'هاي', 'hi', 'hello', 'hey', 'salam', 'ok', 'تمام', 'شكرا', 'thanks', 'السلام علیکم', 'موظف', 'agent'].map(nlp.normalize));
const isQuestion = (s) => { const n = nlp.normalize(s); return n.length >= 4 && !GREETINGS.has(n) && !nlp.parseChoice(s) && !/^\+?[\d\s-]{5,}$/.test(nlp.toLatinDigits(String(s).trim())) && /\p{L}/u.test(n); };

function addPending(conv, text) {
  if (!isQuestion(text)) return;
  const pending = [...(conv.state.pending || []), String(text).slice(0, 500)].slice(-5);
  saveConv(conv, { state: { ...conv.state, pending } });
}

function recordUnanswered(conv, question) {
  if (!isQuestion(question)) return;
  const n = nlp.normalize(question);
  const open = db.prepare("SELECT id, question FROM unanswered WHERE site_id=? AND status='open' ORDER BY id DESC LIMIT 300").all(conv.site_id);
  const same = open.find(u => nlp.normalize(u.question) === n || nlp.similarity(u.question, question) > 0.85);
  if (same) db.prepare('UPDATE unanswered SET count=count+1, updated_at=?, conversation_id=? WHERE id=?').run(now(), conv.id, same.id);
  else db.prepare('INSERT INTO unanswered(site_id,conversation_id,question,lang,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(conv.site_id, conv.id, question.slice(0, 500), conv.lang || 'ar', now(), now());
}

function handoff(conv, site, question, message) {
  if (conv.status !== 'bot') return;
  const state = { ...conv.state, await: null };
  if (question && isQuestion(question)) state.pending = [...(state.pending || []), question].slice(-5);
  saveConv(conv, { status: 'waiting', handoff_at: now(), state });
  addMessage(conv, 'system', message || tr(conv, site).handoff);
  if (!online.size) {
    const t = tr(conv, site);
    botSay(conv, site, t.no_agents, site.settings.tickets.enabled ? [{ label: t.nav_ticket, action: 'ticket', field: 'inquiry' }] : null);
  }
  visitorStatus(conv);
  aio.emit('notify', { type: 'waiting', conversation: convSummary(conv) });
}

// Saves the visitor's pending question with the agent's answer into the knowledge base.
function learn(conv, question, answer, userId, media) {
  const site = getSite(conv.site_id);
  const items = db.prepare('SELECT * FROM kb WHERE site_id=?').all(conv.site_id);
  const existing = items.find(k => nlp.normalize(k.question) === nlp.normalize(question)) || nlp.bestMatch(question, items, 0.9)?.item;
  const mediaJson = JSON.stringify(media || []);
  let id;
  if (existing) {
    db.prepare('UPDATE kb SET answer=?, media=?, updated_at=?, active=1 WHERE id=?').run(answer, mediaJson, now(), existing.id);
    id = existing.id;
  } else {
    id = db.prepare('INSERT INTO kb(site_id,question,answer,keywords,media,source,source_conversation,created_by,lang,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(conv.site_id, question, answer, '', mediaJson, 'learned', conv.id, userId, (site.settings.languages.enabled || []).length > 1 ? (conv.lang || 'ar') : 'all', now(), now()).lastInsertRowid;
  }
  const n = nlp.normalize(question);
  for (const u of db.prepare("SELECT id, question FROM unanswered WHERE site_id=? AND status='open'").all(conv.site_id))
    if (nlp.normalize(u.question) === n || nlp.similarity(u.question, question) > 0.8) db.prepare("UPDATE unanswered SET status='answered', kb_id=?, updated_at=? WHERE id=?").run(id, now(), u.id);
  aio.emit('kb:learned', { site_id: conv.site_id, id, question, updated: !!existing });
  return id;
}

/* ============================== visitor text ============================== */

function lastOptions(conv, numberedOnly) {
  const rows = db.prepare("SELECT id, payload FROM messages WHERE conversation_id=? AND sender='bot' AND payload LIKE '%\"options\"%' ORDER BY id DESC LIMIT 15").all(conv.id);
  for (const r of rows) { const p = parsePayload(r.payload); if (p?.options?.length && (!numberedOnly || p.numbered)) return p.options; }
  return [];
}

function intentHit(text, list) { return (list || []).some(k => nlp.containsPhrase(text, k)); }

async function handleVisitorText(conv, site, text) {
  const b = site.settings.behavior, st = conv.state || {}, t = tr(conv, site);

  // 1) waiting for a value
  if (st.await) {
    if (['الغاء', 'cancel', 'منسوخ'].includes(nlp.normalize(text))) return sendNode(conv, site, '__menu');
    if (st.await.kind === 'ticket_status') {
      if (st.await.step === 'number') {
        saveConv(conv, { state: { ...st, await: { kind: 'ticket_status', step: 'phone', number: nlp.toLatinDigits(text).trim().replace(/\s+/g, '').toUpperCase() } } });
        if (conv.visitor_phone) return handleVisitorText(conv, site, conv.visitor_phone);
        return botSay(conv, site, t.ask_phone, [{ label: t.nav_cancel, action: 'cancel' }]);
      }
      const num = st.await.number;
      saveConv(conv, { state: { ...st, await: null } });
      let tk = tickets.getByNumber(site.id, num);
      if (!tk && /^\d+$/.test(num)) tk = db.prepare('SELECT * FROM tickets WHERE site_id=? AND number LIKE ?').get(site.id, '%-' + num);
      const phone = nlp.toLatinDigits(text).replace(/\D/g, '').slice(-9);
      if (!tk || String(tk.phone || '').replace(/\D/g, '').slice(-9) !== phone)
        return botSay(conv, site, t.ticket_not_found, [{ label: t.nav_retry, action: 'ticket_status' }, ...navOptions(conv, site)]);
      return botSay(conv, site, fill(t.ticket_status_msg, {
        type: t['t_' + tk.type], number: tk.number, status: t['s_' + tk.status], date: tk.created_at.slice(0, 10),
        reply: tk.reply ? t.ticket_reply_prefix + tk.reply : ''
      }), navOptions(conv, site));
    }
    let v = nlp.toLatinDigits(text).trim();
    const n = st.await.missing[0];
    if (n === 'phone') v = v.replace(/[^\d+]/g, '').replace(/^\+?966/, '0').replace(/^5/, '05');
    if (n === 'order_no') v = (v.match(/[A-Za-z0-9-]+/g) || [v]).join('');
    st.await.params[n] = v; st.await.missing.shift();
    saveConv(conv, { state: st });
    return askNext(conv, site);
  }

  // 2) a number or the exact label of one of the last offered options
  const opts = lastOptions(conv);
  const choice = nlp.parseChoice(text);
  if (choice) {
    // a number refers to the latest numbered menu (e.g. the main menu), otherwise to the latest buttons
    const numbered = lastOptions(conv, true);
    const pick = numbered[choice - 1] || opts[choice - 1];
    if (pick) return runAction(conv, site, pick, null);
    return sendNode(conv, site, '__menu');
  }
  const nt = nlp.normalize(text);
  const hit = opts.find(o => nlp.normalize(String(o.label).replace(/^[^\p{L}\p{N}]+/u, '')) === nt);
  if (hit) return runAction(conv, site, hit, text);

  // 3) explicit intents
  const I = INTENTS;
  if (intentHit(text, [...I.handoff, ...(b.handoff_keywords || [])])) return handoff(conv, site, null, t.handoff);
  if (intentHit(text, I.ticket_status)) return runAction(conv, site, { action: 'ticket_status' });
  if (intentHit(text, I.complaint)) return sendTicketForm(conv, site, 'complaint');
  if (intentHit(text, I.suggestion)) return sendTicketForm(conv, site, 'suggestion');
  if (intentHit(text, [...I.order, ...(b.order_keywords || [])]) && site.settings.datasource.type !== 'none') return startLookup(conv, site, 'order', text);

  // 4) organisation information and custom info cards
  for (const c of site.settings.org.custom || []) {
    const kws = String(c.keywords || '').split(/[,،\n]/).map(s => s.trim()).filter(Boolean);
    if (kws.some(k => nlp.containsPhrase(text, k)) || nlp.similarity(text, c.title || '') > 0.8) return sendOrg(conv, site, 'custom:' + c.id);
  }
  for (const f of ['developer', 'location', 'history', 'vision', 'hours', 'contact', 'website', 'social'])
    if (intentHit(text, I[f]) && sendOrg(conv, site, f, { silent: true })) return;

  // 5) knowledge base (prefers the visitor's language)
  const items = db.prepare("SELECT * FROM kb WHERE site_id=? AND active=1 AND (lang IS NULL OR lang='all' OR lang=?)").all(site.id, conv.lang || 'ar');
  const m = nlp.bestMatch(text, items, Number(b.kb_threshold) || 0.6);
  if (m) {
    db.prepare('UPDATE kb SET hits=hits+1 WHERE id=?').run(m.item.id);
    return botSay(conv, site, m.item.answer, navOptions(conv, site), mediaOf(m.item));
  }

  // 6) greetings, bare numbers and very short texts are not questions: show the menu again
  if (!isQuestion(text)) return sendNode(conv, site, '__menu');

  // 7) no answer — suggestions (optional), then a human as the last resort
  recordUnanswered(conv, text);
  if (b.no_answer_action === 'suggest_then_handoff' && !st.suggested) {
    const sug = nlp.topMatches(text, items, 3, Number(b.suggest_threshold) || 0.38);
    if (sug.length) {
      saveConv(conv, { state: { ...st, suggested: true, pending: [...(st.pending || []), text].slice(-5) } });
      return botSay(conv, site, t.did_you_mean, [...sug.map(s => ({ label: s.item.question, action: 'kb', target: String(s.item.id) })), { label: t.nav_agent, action: 'handoff' }]);
    }
  }
  if (b.no_answer_action === 'fallback') return botSay(conv, site, t.fallback, navOptions(conv, site));
  return handoff(conv, site, text, t.no_answer_handoff);
}

/* ============================== lifecycle ============================== */

function closeConversation(conv, by, userId = null) {
  if (conv.status === 'closed') return;
  const site = getSite(conv.site_id), t = tr(conv, site);
  saveConv(conv, { status: 'closed', closed_by: by, closed_by_user: userId, closed_at: now() });
  const who = by === 'visitor' ? t.by_visitor : by === 'agent' ? (agentName(userId) || t.by_agent) : t.by_system;
  addMessage(conv, 'system', `${t.closed} — ${who}`);
  vio.to('c' + conv.id).emit('closed', { by, rating_max: site.settings.appearance.rating_max });
  visitorStatus(conv);
  aio.emit('notify', { type: 'closed', by, conversation: convSummary(conv) });
}

function originAllowed(site, origin) {
  const list = String(site.settings.security.allowed_domains || '').split(/[\s,]+/).filter(Boolean);
  if (!list.length || !origin) return true;
  let host; try { host = new URL(origin).hostname; } catch { return false; }
  return list.some(d => host === d || host.endsWith('.' + d.replace(/^\*\./, '')));
}

function verifyIdentity(site, user) {
  if (!user?.email || !user?.sig) return false;
  const expected = crypto.createHmac('sha256', site.settings.security.identity_secret).update(String(user.email).toLowerCase()).digest('hex');
  return expected.length === String(user.sig).length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(user.sig)));
}

async function loadCustomer(conv, site) {
  const d = site.settings.datasource;
  if (d.type === 'none' || !d.customer_query) return;
  const params = { phone: conv.visitor_phone || null, email: conv.verified ? conv.visitor_email : null };
  if (!params.phone && !params.email) return;
  try {
    const rows = await ds.query(d, d.customer_query, params);
    if (rows[0]) saveConv(conv, { meta: { ...conv.meta, customer: rows[0] }, visitor_name: conv.visitor_name || rows[0].name || null });
  } catch (e) { console.error('[customer lookup]', e.message); }
}

function pickLang(site, wanted) {
  const en = site.settings.languages.enabled?.length ? site.settings.languages.enabled : ['ar'];
  if (wanted && en.includes(wanted) && LANGS[wanted]) return wanted;
  return en.includes(site.settings.languages.default) ? site.settings.languages.default : en[0];
}

/* ============================== sockets ============================== */

function setup(io, secret) {
  JWT_SECRET = secret;
  vio = io.of('/visitor');
  aio = io.of('/agent');

  vio.on('connection', (socket) => {
    let site = null, conv = null, visitorId = null, identity = null, lang = 'ar';
    const reloadConv = () => (conv = conv ? getConv(conv.id) : null);
    const sendHistory = () => {
      const msgs = db.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY id').all(conv.id).map(publicMsg);
      const a = agentInfo(conv.assigned_to);
      socket.emit('history', { conversation: { id: conv.id, status: conv.status, lang: conv.lang, agent_name: a?.name, agent_title: a?.title, agent_avatar: a?.avatar, rating: conv.rating, queue: queuePosition(conv) }, messages: msgs });
    };

    socket.on('join', (p, ack) => {
      site = getSiteByKey(String(p?.site || ''));
      if (!site) return ack?.({ error: 'site' });
      const origin = socket.handshake.headers.origin;
      if (!originAllowed(site, origin)) return ack?.({ error: 'origin' });
      if (origin) db.prepare('INSERT INTO widget_pings(site_id,origin,last_seen,hits) VALUES(?,?,?,1) ON CONFLICT(site_id,origin) DO UPDATE SET last_seen=excluded.last_seen, hits=hits+1').run(site.id, origin.slice(0, 200), now());
      visitorId = String(p.visitorId || '').slice(0, 64) || crypto.randomUUID();
      lang = pickLang(site, p.lang);
      identity = p.user && verifyIdentity(site, p.user) ? { name: p.user.name, email: String(p.user.email).toLowerCase() } : null;
      const row = db.prepare("SELECT id FROM conversations WHERE site_id=? AND visitor_id=? AND (status!='closed' OR (rating IS NULL AND closed_at > ?)) ORDER BY id DESC LIMIT 1")
        .get(site.id, visitorId, new Date(Date.now() - 30 * 60000).toISOString());
      conv = row ? getConv(row.id) : null;
      if (conv) { socket.join('c' + conv.id); sendHistory(); }
      ack?.({ ok: true, visitorId, hasConversation: !!conv, verified: !!identity, lang });
    });

    socket.on('lang', (p, ack) => {
      if (!site) return;
      lang = pickLang(site, p?.lang);
      reloadConv();
      if (conv && conv.status !== 'closed') { saveConv(conv, { lang }); if (conv.status === 'bot') sendNode(conv, site, '__menu'); }
      ack?.({ ok: true, lang });
    });

    socket.on('start', async (p, ack) => {
      if (!site) return ack?.({ error: 'join first' });
      reloadConv();
      if (conv && conv.status !== 'closed') { sendHistory(); return ack?.({ ok: true }); }
      if (conv) socket.leave('c' + conv.id);
      lang = pickLang(site, p?.lang || lang);
      const info = {
        name: identity?.name || String(p?.name || '').slice(0, 80) || null,
        email: identity?.email || String(p?.email || '').slice(0, 120).toLowerCase() || null,
        phone: nlp.toLatinDigits(String(p?.phone || '')).replace(/[^\d+]/g, '').slice(0, 20) || null
      };
      const t = now();
      const r = db.prepare('INSERT INTO conversations(site_id,visitor_id,visitor_name,visitor_email,visitor_phone,verified,meta,state,status,page_url,lang,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(site.id, visitorId, info.name, info.email, info.phone, identity ? 1 : 0,
          JSON.stringify({ ua: socket.handshake.headers['user-agent'], ip: socket.handshake.address, browser_lang: p?.browser_lang }), '{}', 'bot',
          String(p?.page || '').slice(0, 500), lang, t, t);
      conv = getConv(r.lastInsertRowid);
      socket.join('c' + conv.id);
      await loadCustomer(conv, site);
      sendHistory();
      aio.emit('notify', { type: 'new', conversation: convSummary(conv) });
      sendNode(conv, site, '__root');
      ack?.({ ok: true });
    });

    socket.on('message', async (p, ack) => {
      reloadConv();
      const text = String(p?.text || '').trim().slice(0, 4000);
      if (!conv || !text || conv.status === 'closed') return ack?.({ error: 'closed' });
      addMessage(conv, 'visitor', text);
      ack?.({ ok: true });
      site = getSite(site.id);
      if (conv.status === 'bot') { try { await handleVisitorText(conv, site, text); } catch (e) { console.error(e); } }
      else addPending(conv, text); // waiting for / talking to a human: remember the question for learning
    });

    socket.on('option', async (p, ack) => {
      reloadConv();
      if (!conv || conv.status === 'closed') return ack?.({ error: 'closed' });
      const m = db.prepare("SELECT payload FROM messages WHERE id=? AND conversation_id=? AND sender='bot'").get(Number(p?.mid), conv.id);
      const opt = parsePayload(m?.payload)?.options?.[Number(p.i)];
      if (!opt) return ack?.({ error: 'option' });
      if (conv.status !== 'bot' && opt.action !== 'ticket') return ack?.({ error: 'not bot' });
      addMessage(conv, 'visitor', opt.label.replace(/^[^\p{L}\p{N}]+/u, '').trim() || opt.label);
      ack?.({ ok: true });
      site = getSite(site.id);
      try { await runAction(conv, site, opt); } catch (e) { console.error(e); }
    });

    socket.on('form_submit', async (p, ack) => {
      reloadConv();
      if (!conv) return ack?.({ error: 'conv' });
      const row = db.prepare("SELECT id, payload FROM messages WHERE id=? AND conversation_id=? AND sender='bot'").get(Number(p?.mid), conv.id);
      const payload = parsePayload(row?.payload);
      if (!payload?.form || payload.form.submitted) return ack?.({ error: 'form' });
      site = getSite(site.id);
      const t = tr(conv, site);
      try {
        const tk = await tickets.create(site, p.values || {}, { type: payload.form.type, lang: conv.lang, conversationId: conv.id });
        payload.form.submitted = tk.number;
        db.prepare('UPDATE messages SET payload=? WHERE id=?').run(JSON.stringify(payload), row.id);
        vio.to('c' + conv.id).emit('form_done', { mid: row.id, number: tk.number });
        const v = p.values || {};
        const upd = {};
        if (!conv.visitor_name && v.name) upd.visitor_name = String(v.name).slice(0, 80);
        if (!conv.visitor_phone && tk.phone) upd.visitor_phone = tk.phone;
        if (!conv.visitor_email && tk.email) upd.visitor_email = tk.email;
        if (Object.keys(upd).length) saveConv(conv, upd);
        addMessage(conv, 'visitor', `${t['t_' + tk.type]}: ${tk.text}`.slice(0, 600));
        botSay(conv, site, fill(t.ticket_created, { type: t['t_' + tk.type], number: tk.number, date: tk.created_at.slice(0, 10) }), conv.status === 'bot' ? navOptions(conv, site) : null);
        aio.emit('ticket:new', { site_id: site.id, id: tk.id, number: tk.number, type: tk.type, name: tk.name, text: tk.text.slice(0, 140) });
        ack?.({ ok: true, number: tk.number });
      } catch (e) {
        if (e.fields) return ack?.({ error: 'validation', fields: e.fields });
        console.error(e); ack?.({ error: 'server' });
      }
    });

    socket.on('typing', (p) => { if (conv) aio.emit('visitor:typing', { conversation_id: conv.id, typing: !!p?.typing, text: String(p?.text || '').slice(0, 200) }); });
    socket.on('close', (_, ack) => { reloadConv(); if (conv) closeConversation(conv, 'visitor'); ack?.({ ok: true }); });

    socket.on('rate', (p, ack) => {
      reloadConv();
      if (!conv || conv.status !== 'closed' || conv.rating != null) return ack?.({ error: 'rate' });
      const max = Number(getSite(conv.site_id).settings.appearance.rating_max) || 5;
      const r = Math.round(Number(p?.rating) * 2) / 2;
      if (!(r >= 0.5 && r <= max)) return ack?.({ error: 'value' });
      saveConv(conv, { rating: r, rating_comment: String(p?.comment || '').slice(0, 1000) || null });
      aio.emit('notify', { type: 'rated', conversation: { ...convSummary(conv), rating_max: max } });
      broadcastConv(conv);
      ack?.({ ok: true });
    });
  });

  aio.use((socket, next) => {
    try {
      const u = jwt.verify(socket.handshake.auth?.token, JWT_SECRET);
      const user = db.prepare('SELECT id,name,role,active,job_title,avatar FROM users WHERE id=?').get(u.id);
      if (!user?.active) return next(new Error('unauthorized'));
      socket.user = user; next();
    } catch { next(new Error('unauthorized')); }
  });

  const emitOnline = () => aio.emit('agents:online', [...online.values()]);
  const refreshWaiting = () => {
    for (const c of db.prepare("SELECT id FROM conversations WHERE status='waiting'").all()) visitorStatus(getConv(c.id));
  };

  aio.on('connection', (socket) => {
    const u = socket.user;
    online.set(u.id, { id: u.id, name: u.name, role: u.role, avatar: u.avatar, title: u.job_title });
    db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(now(), u.id);
    emitOnline(); refreshWaiting();
    socket.on('disconnect', async () => {
      const sockets = await aio.fetchSockets();
      if (!sockets.some(s => s.user.id === u.id)) { online.delete(u.id); emitOnline(); refreshWaiting(); }
    });

    socket.on('take', (p, ack) => {
      const conv = getConv(Number(p?.id));
      if (!conv || conv.status === 'closed') return ack?.({ error: 'closed' });
      takeConv(conv, u); ack?.({ ok: true });
    });

    socket.on('send', (p, ack) => {
      const conv = getConv(Number(p?.id));
      const text = String(p?.text || '').trim().slice(0, 4000);
      let media = Array.isArray(p?.media) ? p.media.filter(x => x && typeof x.url === 'string' && /^(\/media\/|https?:\/\/)/.test(x.url)).slice(0, 5) : [];
      if (!conv || conv.status === 'closed' || (!text && !media.length)) return ack?.({ error: 'closed' });
      if (conv.status === 'human' && conv.assigned_to && conv.assigned_to !== u.id && u.role === 'agent') return ack?.({ error: 'assigned' });
      if (conv.status !== 'human' || conv.assigned_to !== u.id) takeConv(conv, u);
      const fresh = getConv(conv.id);
      let learnedId = null;
      const pending = fresh.state.pending || [];
      const learnFlag = p.learn === undefined ? getSite(fresh.site_id).settings.behavior.auto_learn : !!p.learn;
      if (learnFlag && pending.length && text.length >= 3) {
        learnedId = learn(fresh, pending[pending.length - 1], text, u.id, media);
        require('./db').audit(u.id, 'kb.learn', { conversation: fresh.id, kb: learnedId });
      }
      if (pending.length) saveConv(fresh, { state: { ...fresh.state, pending: [] } });
      if (!fresh.first_response_at) saveConv(fresh, { first_response_at: now() });
      addMessage(fresh, 'agent', text, media.length ? { media } : null, u.id);
      ack?.({ ok: true, learned: learnedId });
    });

    socket.on('typing', (p) => { const id = Number(p?.id); if (id) vio.to('c' + id).emit('typing', { typing: !!p.typing, name: u.name }); });

    socket.on('close', (p, ack) => {
      const conv = getConv(Number(p?.id));
      if (!conv) return ack?.({ error: 'nf' });
      closeConversation(conv, 'agent', u.id);
      require('./db').audit(u.id, 'conversation.close', { id: conv.id });
      ack?.({ ok: true });
    });

    socket.on('return_to_bot', (p, ack) => {
      const conv = getConv(Number(p?.id));
      if (!conv || conv.status === 'closed') return ack?.({ error: 'closed' });
      const site = getSite(conv.site_id);
      saveConv(conv, { status: 'bot', assigned_to: null, state: { ...conv.state, pending: [] } });
      addMessage(conv, 'system', tr(conv, site).back_to_bot);
      visitorStatus(conv);
      sendNode(conv, site, '__menu');
      ack?.({ ok: true });
    });

    socket.on('transfer', (p, ack) => {
      const conv = getConv(Number(p?.id));
      const to = db.prepare('SELECT id,name FROM users WHERE id=? AND active=1').get(Number(p?.to));
      if (!conv || !to || conv.status === 'closed') return ack?.({ error: 'invalid' });
      saveConv(conv, { status: 'human', assigned_to: to.id });
      addMessage(conv, 'system', `↪️ ${to.name}`);
      visitorStatus(conv);
      aio.emit('notify', { type: 'transfer', to: to.id, conversation: convSummary(conv) });
      ack?.({ ok: true });
    });
  });
}

function takeConv(conv, user) {
  const site = getSite(conv.site_id);
  const was = conv.assigned_to;
  saveConv(conv, { status: 'human', assigned_to: user.id, state: { ...conv.state, await: null }, handoff_at: conv.handoff_at || now() });
  if (was !== user.id) addMessage(conv, 'system', fill(tr(conv, site).agent_joined, { agent: user.name }));
  visitorStatus(conv);
  broadcastConv(conv);
}

/* ============================== maintenance ============================== */

function maintenance() {
  for (const s of db.prepare('SELECT id FROM sites').all()) {
    const site = getSite(s.id), b = site.settings.behavior;
    const mins = Number(b.inactivity_minutes) || 0;
    if (mins > 0) {
      const cutoff = new Date(Date.now() - mins * 60000).toISOString();
      // conversations waiting for a human are not auto-closed while agents are online
      const stale = db.prepare("SELECT id, status FROM conversations WHERE site_id=? AND status!='closed' AND updated_at < ?").all(site.id, cutoff);
      for (const c of stale) if (!(c.status === 'waiting' && online.size)) closeConversation(getConv(c.id), 'system');
    }
    const days = Number(b.retention_days) || 0;
    if (days > 0) {
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      const r = db.prepare("DELETE FROM conversations WHERE site_id=? AND status='closed' AND closed_at < ?").run(site.id, cutoff);
      if (r.changes) console.log(`[retention] site ${site.id}: deleted ${r.changes} conversations older than ${days} days`);
    }
  }
}

module.exports = {
  setup, maintenance, convSummary, publicMsg, closeConversation, learn, locationPayload,
  getAio: () => aio, getVio: () => vio, onlineAgents: () => [...online.values()]
};
