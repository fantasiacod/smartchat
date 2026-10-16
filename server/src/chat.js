// Conversation engine: decision tree, knowledge base, DB lookups, human handoff, closing & ratings.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { db, now, getSite, getSiteByKey, getConv, audit } = require('./db');
const nlp = require('./nlp');
const ds = require('./datasource');

let vio, aio, JWT_SECRET;

/* ----------------------------- helpers ----------------------------- */

function fill(tpl, ctx) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (ctx[k] ?? '') + '').replace(/[ \t]+([👋!،,.])/g, ' $1').replace(/ {2,}/g, ' ');
}

function saveConv(conv, fields) {
  const cols = Object.keys(fields);
  const vals = cols.map(c => (c === 'meta' || c === 'state') ? JSON.stringify(fields[c]) : fields[c]);
  db.prepare(`UPDATE conversations SET ${cols.map(c => c + '=?').join(',')}, updated_at=? WHERE id=?`).run(...vals, now(), conv.id);
  Object.assign(conv, fields);
}

function agentName(id) {
  if (!id) return null;
  return db.prepare('SELECT name FROM users WHERE id=?').get(id)?.name || null;
}

function publicMsg(m) {
  const p = m.payload ? (typeof m.payload === 'string' ? JSON.parse(m.payload) : m.payload) : null;
  let media = p?.media || [];
  if (typeof media === 'string') { try { media = JSON.parse(media); } catch { media = []; } }
  return {
    id: m.id, sender: m.sender, body: m.body, created_at: m.created_at,
    agent_name: m.sender === 'agent' ? agentName(m.agent_id) : undefined,
    options: p?.options ? p.options.map((o, i) => ({ i, label: o.label })) : undefined,
    link: p?.link, link_label: p?.link_label, media
  };
}

function convSummary(c) {
  const last = db.prepare('SELECT sender, body, created_at FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT 1').get(c.id);
  const site = db.prepare('SELECT name FROM sites WHERE id=?').get(c.site_id);
  return {
    id: c.id, site_id: c.site_id, site_name: site?.name, status: c.status,
    visitor_name: c.visitor_name, visitor_email: c.visitor_email, visitor_phone: c.visitor_phone, verified: !!c.verified,
    assigned_to: c.assigned_to, agent_name: agentName(c.assigned_to), closed_by: c.closed_by, rating: c.rating,
    pending_question: c.state?.pending_question || null, page_url: c.page_url,
    created_at: c.created_at, updated_at: c.updated_at, closed_at: c.closed_at, handoff_at: c.handoff_at,
    last_message: last ? { sender: last.sender, body: (last.body || '').slice(0, 140), created_at: last.created_at } : null
  };
}

function broadcastConv(conv) {
  aio.emit('conv:update', convSummary(getConv(conv.id)));
}

function visitorStatus(conv) {
  vio.to('c' + conv.id).emit('status', { status: conv.status, agent_name: agentName(conv.assigned_to) });
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

const botSay = (conv, body, options, media) => addMessage(conv, 'bot', body, (options?.length || media?.length) ? { options: options || [], media: media || [] } : null);

function ctxOf(conv) {
  const c = conv.meta?.customer || {};
  return { ...c, name: c.name || conv.visitor_name || '', phone: conv.visitor_phone || '', email: conv.visitor_email || '' };
}

const navOptions = () => ([
  { label: '🏠 القائمة الرئيسية', action: 'goto', target: '__root' },
  { label: '💬 التحدث مع موظف', action: 'handoff' }
]);

/* ----------------------------- bot logic ----------------------------- */

function sendNode(conv, site, nodeId) {
  const tree = site.tree;
  // Keep the configured greeting as the conversation entry point even if an
  // older flow accidentally marked a branch (for example, a location node)
  // as the tree root. The greeting node is the stable `root` node.
  const hasGreeting = tree.nodes.some(n => n.id === 'root');
  const id = (!nodeId || nodeId === '__root' || (hasGreeting && nodeId === tree.root))
    ? (hasGreeting ? 'root' : tree.root) : nodeId;
  const node = tree.nodes.find(n => n.id === id) || tree.nodes.find(n => n.id === tree.root) || tree.nodes[0];
  if (!node) return botSay(conv, 'مرحباً! كيف أقدر أساعدك؟');
  saveConv(conv, { state: { ...conv.state, node: node.id, await: null } });
  botSay(conv, fill(node.message, ctxOf(conv)), (node.options || []).map(o => ({ label: o.label, action: o.action, target: o.target })));
}

async function runAction(conv, site, opt, freeText) {
  switch (opt.action) {
    case 'goto': return sendNode(conv, site, opt.target);
    case 'handoff': return handoff(conv, site, freeText || null, site.settings.behavior.handoff_message);
    case 'order_status': return startLookup(conv, site, 'order', freeText);
    case 'customer_info': return startLookup(conv, site, 'customer', freeText);
    case 'answer': return botSay(conv, opt.target || '', navOptions());
    case 'url': return addMessage(conv, 'bot', opt.label, { link: opt.target, link_label: 'فتح الرابط ↗', options: navOptions() });
    case 'company_info': {
      const a = site.settings.appearance;
      const lines = [a.company_name ? `عن ${a.company_name}` : 'معلومات النشاط التجاري', a.unified_number ? `الرقم الموحد: ${a.unified_number}` : '', a.company_website ? `الموقع الإلكتروني: ${a.company_website}` : ''].filter(Boolean);
      return addMessage(conv, 'bot', lines.join('\n'), a.company_website ? { link: a.company_website, link_label: 'زيارة الموقع ↗', options: navOptions() } : { options: navOptions() });
    }
    case 'company_location': {
      const a = site.settings.appearance;
      const target = a.company_map_url || (a.company_location ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a.company_location) : '');
      if (!target) return botSay(conv, 'لم تتم إضافة موقع النشاط التجاري بعد. يرجى التواصل مع خدمة العملاء.', navOptions());
      return addMessage(conv, 'bot', a.company_location || 'موقع النشاط التجاري', { link: target, link_label: 'فتح الموقع في خرائط Google ↗', options: navOptions() });
    }
    case 'end': return closeConversation(conv, 'visitor');
    case 'cancel': return sendNode(conv, site, '__root');
    default: return sendNode(conv, site, '__root');
  }
}

function startLookup(conv, site, kind, freeText) {
  const d = site.settings.datasource;
  const q = kind === 'order' ? d.order_query : d.customer_query;
  if (d.type === 'none' || !q) return handoff(conv, site, freeText || null, site.settings.behavior.handoff_message);
  const names = ds.paramNames(q);
  const params = {};
  if (conv.visitor_phone) params.phone = conv.visitor_phone;
  if (conv.visitor_email && (conv.verified || kind === 'customer')) params.email = conv.visitor_email;
  if (kind === 'order' && freeText && names.includes('order_no')) {
    const m = nlp.toLatinDigits(freeText).match(/\b\d{3,}\b/);
    if (m) params.order_no = m[0];
  }
  // customer lookups need at least one identifier; ask for phone if nothing known
  let missing = kind === 'customer'
    ? (names.some(n => params[n]) ? [] : [names.includes('phone') ? 'phone' : names[0]])
    : names.filter(n => !params[n]);
  saveConv(conv, { state: { ...conv.state, await: { kind, params, missing } } });
  return askNext(conv, site);
}

function askNext(conv, site) {
  const a = conv.state.await;
  if (a.missing.length) {
    const n = a.missing[0];
    const prompt = site.settings.datasource.param_prompts?.[n] || `من فضلك أرسل ${n}`;
    return botSay(conv, prompt, [{ label: '✖ إلغاء', action: 'cancel' }]);
  }
  return executeLookup(conv, site);
}

async function executeLookup(conv, site) {
  const a = conv.state.await;
  const d = site.settings.datasource;
  saveConv(conv, { state: { ...conv.state, await: null } });
  const q = a.kind === 'order' ? d.order_query : d.customer_query;
  let rows;
  try {
    rows = await ds.query(d, q, a.params);
  } catch (e) {
    console.error('[datasource]', e.message);
    return botSay(conv, d.error_message, navOptions());
  }
  if (!rows.length) {
    return botSay(conv, a.kind === 'order' ? d.not_found : 'لم أجد بيانات مسجلة بهذه المعلومات.', [
      { label: '🔁 حاول مرة أخرى', action: a.kind === 'order' ? 'order_status' : 'customer_info' }, ...navOptions()
    ]);
  }
  if (a.kind === 'customer') {
    const row = rows[0];
    if (a.params.phone && !conv.visitor_phone) saveConv(conv, { visitor_phone: a.params.phone });
    saveConv(conv, { meta: { ...conv.meta, customer: row }, visitor_name: conv.visitor_name || row.name || null });
    broadcastConv(conv);
    return botSay(conv, fill(d.customer_template, { ...a.params, ...row }), navOptions());
  }
  if (a.params.phone && !conv.visitor_phone) saveConv(conv, { visitor_phone: a.params.phone });
  const lookups = conv.meta.lookups || [];
  lookups.push({ at: now(), params: a.params, rows: rows.slice(0, 3) });
  saveConv(conv, { meta: { ...conv.meta, lookups: lookups.slice(-10) } });
  for (const row of rows.slice(0, 3)) {
    const ctx = { ...a.params, ...row };
    let text = fill(d.order_template, ctx);
    if (row.notes && String(row.notes).trim()) text += '\n' + fill(d.notes_template, ctx);
    botSay(conv, text);
  }
  return botSay(conv, site.settings.behavior.anything_else, navOptions());
}

function handoff(conv, site, question, message) {
  if (conv.status !== 'bot') return;
  const state = { ...conv.state, await: null };
  if (question) state.pending_question = question;
  saveConv(conv, { status: 'waiting', handoff_at: now(), state });
  addMessage(conv, 'system', message || site.settings.behavior.handoff_message);
  visitorStatus(conv);
  aio.emit('notify', { type: 'waiting', conversation: convSummary(conv) });
}

async function handleVisitorText(conv, site, text) {
  const b = site.settings.behavior;
  const st = conv.state || {};

  // 1) waiting for a lookup parameter
  if (st.await) {
    if (['الغاء', 'cancel'].includes(nlp.normalize(text))) return sendNode(conv, site, '__root');
    let v = nlp.toLatinDigits(text).trim();
    const n = st.await.missing[0];
    if (n === 'phone') v = v.replace(/[^\d+]/g, '').replace(/^\+?966/, '0').replace(/^5/, '05');
    if (n === 'order_no') v = (v.match(/[A-Za-z0-9-]+/g) || [v]).join('');
    st.await.params[n] = v;
    st.await.missing.shift();
    saveConv(conv, { state: st });
    return askNext(conv, site);
  }

  // 2) typed text equals one of the last offered options
  const lastBot = db.prepare("SELECT payload FROM messages WHERE conversation_id=? AND sender='bot' AND payload IS NOT NULL ORDER BY id DESC LIMIT 1").get(conv.id);
  const opts = lastBot ? (JSON.parse(lastBot.payload).options || []) : [];
  const nt = nlp.normalize(text);
  const hit = opts.find(o => nlp.normalize(o.label.replace(/^[^\p{L}\p{N}]+/u, '')) === nt);
  if (hit) return runAction(conv, site, hit, text);

  // 3) explicit human request
  if ((b.handoff_keywords || []).some(k => nlp.containsPhrase(text, k))) return handoff(conv, site, null, b.handoff_message);

  // 4) order status intent
  if ((b.order_keywords || []).some(k => nlp.containsPhrase(text, k))) return startLookup(conv, site, 'order', text);

  // 5) knowledge base
  const items = db.prepare('SELECT * FROM kb WHERE site_id=? AND active=1').all(site.id);
  const m = nlp.bestMatch(text, items, Number(b.kb_threshold) || 0.6);
  if (m) {
    db.prepare('UPDATE kb SET hits=hits+1 WHERE id=?').run(m.item.id);
    let media = [];
    try { media = JSON.parse(m.item.media || '[]'); } catch { /* older/corrupt record: keep text answer */ }
    return botSay(conv, m.item.answer, navOptions(), media);
  }

  // 6) no answer
  if (b.no_answer_action === 'fallback') return botSay(conv, b.fallback_message, navOptions());
  return handoff(conv, site, text, b.no_answer_handoff_message);
}

/* ----------------------------- lifecycle ----------------------------- */

function closeConversation(conv, by, userId = null) {
  if (conv.status === 'closed') return;
  const site = getSite(conv.site_id);
  saveConv(conv, { status: 'closed', closed_by: by, closed_by_user: userId, closed_at: now() });
  const who = by === 'visitor' ? 'المستفيد' : by === 'agent' ? (agentName(userId) || 'الموظف') : 'النظام (عدم نشاط)';
  addMessage(conv, 'system', `${site.settings.behavior.closed_message} — بواسطة ${who}`);
  vio.to('c' + conv.id).emit('closed', { by, rating_max: site.settings.appearance.rating_max });
  visitorStatus(conv);
  aio.emit('notify', { type: 'closed', by, conversation: convSummary(conv) });
}

function learn(conv, question, answer, userId) {
  const exists = db.prepare('SELECT id FROM kb WHERE site_id=? AND question=?').get(conv.site_id, question);
  if (exists) {
    db.prepare('UPDATE kb SET answer=?, updated_at=?, active=1 WHERE id=?').run(answer, now(), exists.id);
    return exists.id;
  }
  const r = db.prepare('INSERT INTO kb(site_id,question,answer,keywords,source,source_conversation,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(conv.site_id, question, answer, '', 'learned', conv.id, userId, now(), now());
  aio.emit('kb:learned', { site_id: conv.site_id, id: r.lastInsertRowid, question });
  return r.lastInsertRowid;
}

function originAllowed(site, origin) {
  const list = String(site.settings.security.allowed_domains || '').split(/[\s,]+/).filter(Boolean);
  if (!list.length || !origin) return true;
  let host;
  try { host = new URL(origin).hostname; } catch { return false; }
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

/* ----------------------------- sockets ----------------------------- */

function setup(io, secret) {
  JWT_SECRET = secret;
  vio = io.of('/visitor');
  aio = io.of('/agent');

  vio.on('connection', (socket) => {
    let site = null, conv = null, visitorId = null, identity = null;
    const reloadConv = () => (conv = conv ? getConv(conv.id) : null);

    const sendHistory = () => {
      const msgs = db.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY id').all(conv.id).map(publicMsg);
      socket.emit('history', { conversation: { id: conv.id, status: conv.status, agent_name: agentName(conv.assigned_to), rating: conv.rating }, messages: msgs });
    };

    socket.on('join', (p, ack) => {
      site = getSiteByKey(String(p?.site || ''));
      if (!site) return ack?.({ error: 'site' });
      if (!originAllowed(site, socket.handshake.headers.origin)) return ack?.({ error: 'origin' });
      visitorId = String(p.visitorId || '').slice(0, 64) || crypto.randomUUID();
      identity = p.user && verifyIdentity(site, p.user) ? { name: p.user.name, email: String(p.user.email).toLowerCase() } : null;
      const row = db.prepare("SELECT id FROM conversations WHERE site_id=? AND visitor_id=? AND (status!='closed' OR (rating IS NULL AND closed_at > ?)) ORDER BY id DESC LIMIT 1")
        .get(site.id, visitorId, new Date(Date.now() - 30 * 60000).toISOString());
      conv = row ? getConv(row.id) : null;
      if (conv) { socket.join('c' + conv.id); sendHistory(); }
      ack?.({ ok: true, visitorId, hasConversation: !!conv, verified: !!identity });
    });

    socket.on('start', async (p, ack) => {
      if (!site) return ack?.({ error: 'join first' });
      reloadConv();
      if (conv && conv.status !== 'closed') { sendHistory(); return ack?.({ ok: true }); }
      if (conv) socket.leave('c' + conv.id);
      const info = {
        name: identity?.name || String(p?.name || '').slice(0, 80) || null,
        email: identity?.email || String(p?.email || '').slice(0, 120).toLowerCase() || null,
        phone: nlp.toLatinDigits(String(p?.phone || '')).replace(/[^\d+]/g, '').slice(0, 20) || null
      };
      const t = now();
      const r = db.prepare('INSERT INTO conversations(site_id,visitor_id,visitor_name,visitor_email,visitor_phone,verified,meta,state,status,page_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(site.id, visitorId, info.name, info.email, info.phone, identity ? 1 : 0,
          JSON.stringify({ ua: socket.handshake.headers['user-agent'], ip: socket.handshake.address, lang: p?.lang }), '{}', 'bot',
          String(p?.page || '').slice(0, 500), t, t);
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
      if (conv.status === 'bot') {
        site = getSite(site.id);
        try { await handleVisitorText(conv, site, text); } catch (e) { console.error(e); }
      }
    });

    socket.on('option', async (p, ack) => {
      reloadConv();
      if (!conv || conv.status !== 'bot') return ack?.({ error: 'not bot' });
      const m = db.prepare("SELECT payload FROM messages WHERE id=? AND conversation_id=? AND sender='bot'").get(Number(p?.mid), conv.id);
      const opt = m?.payload ? JSON.parse(m.payload).options?.[Number(p.i)] : null;
      if (!opt) return ack?.({ error: 'option' });
      addMessage(conv, 'visitor', opt.label.replace(/^[^\p{L}\p{N}]+/u, '').trim() || opt.label);
      ack?.({ ok: true });
      site = getSite(site.id);
      try { await runAction(conv, site, opt); } catch (e) { console.error(e); }
    });

    socket.on('typing', (p) => { if (conv) aio.emit('visitor:typing', { conversation_id: conv.id, typing: !!p?.typing }); });

    socket.on('close', (_, ack) => {
      reloadConv();
      if (conv) closeConversation(conv, 'visitor');
      ack?.({ ok: true });
    });

    socket.on('rate', (p, ack) => {
      reloadConv();
      if (!conv || conv.status !== 'closed' || conv.rating != null) return ack?.({ error: 'rate' });
      const max = Number(getSite(conv.site_id).settings.appearance.rating_max) || 5;
      const r = Math.round(Number(p?.rating) * 2) / 2;
      if (!(r >= 0.5 && r <= max)) return ack?.({ error: 'value' });
      saveConv(conv, { rating: r, rating_comment: String(p?.comment || '').slice(0, 1000) || null });
      const s = convSummary(conv);
      aio.emit('notify', { type: 'rated', conversation: { ...s, rating_max: max } });
      broadcastConv(conv);
      ack?.({ ok: true });
    });
  });

  aio.use((socket, next) => {
    try {
      const u = jwt.verify(socket.handshake.auth?.token, JWT_SECRET);
      const user = db.prepare('SELECT id,name,role,active FROM users WHERE id=?').get(u.id);
      if (!user?.active) return next(new Error('unauthorized'));
      socket.user = user;
      next();
    } catch { next(new Error('unauthorized')); }
  });

  const online = new Map();
  const emitOnline = () => aio.emit('agents:online', [...online.values()]);

  aio.on('connection', (socket) => {
    const u = socket.user;
    online.set(u.id, { id: u.id, name: u.name, role: u.role });
    db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(now(), u.id);
    emitOnline();
    socket.on('disconnect', async () => {
      const sockets = await aio.fetchSockets();
      if (!sockets.some(s => s.user.id === u.id)) { online.delete(u.id); emitOnline(); }
    });

    socket.on('take', (p, ack) => {
      const conv = getConv(Number(p?.id));
      if (!conv || conv.status === 'closed') return ack?.({ error: 'closed' });
      takeConv(conv, u, p?.force);
      ack?.({ ok: true });
    });

    socket.on('send', (p, ack) => {
      const conv = getConv(Number(p?.id));
      const text = String(p?.text || '').trim().slice(0, 4000);
      if (!conv || conv.status === 'closed' || !text) return ack?.({ error: 'closed' });
      if (conv.status !== 'human' || conv.assigned_to !== u.id) {
        if (conv.status === 'human' && conv.assigned_to && conv.assigned_to !== u.id && u.role === 'agent') return ack?.({ error: 'assigned' });
        takeConv(conv, u);
      }
      let learnedId = null;
      if (p.learn && conv.state?.pending_question) {
        learnedId = learn(conv, conv.state.pending_question, text, u.id);
        saveConv(conv, { state: { ...conv.state, pending_question: null } });
        audit(u.id, 'kb.learn', { conversation: conv.id, kb: learnedId });
      }
      addMessage(conv, 'agent', text, null, u.id);
      ack?.({ ok: true, learned: learnedId });
    });

    socket.on('typing', (p) => {
      const id = Number(p?.id);
      if (id) vio.to('c' + id).emit('typing', { typing: !!p.typing, name: u.name });
    });

    socket.on('close', (p, ack) => {
      const conv = getConv(Number(p?.id));
      if (!conv) return ack?.({ error: 'nf' });
      closeConversation(conv, 'agent', u.id);
      audit(u.id, 'conversation.close', { id: conv.id });
      ack?.({ ok: true });
    });

    socket.on('return_to_bot', (p, ack) => {
      const conv = getConv(Number(p?.id));
      if (!conv || conv.status === 'closed') return ack?.({ error: 'closed' });
      saveConv(conv, { status: 'bot', assigned_to: null });
      addMessage(conv, 'system', 'تمت إعادة المحادثة إلى المساعد الذكي');
      visitorStatus(conv);
      sendNode(conv, getSite(conv.site_id), '__root');
      ack?.({ ok: true });
    });

    socket.on('transfer', (p, ack) => {
      const conv = getConv(Number(p?.id));
      const to = db.prepare('SELECT id,name FROM users WHERE id=? AND active=1').get(Number(p?.to));
      if (!conv || !to || conv.status === 'closed') return ack?.({ error: 'invalid' });
      saveConv(conv, { status: 'human', assigned_to: to.id });
      addMessage(conv, 'system', `تم تحويل المحادثة إلى ${to.name}`);
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
  if (was !== user.id) addMessage(conv, 'system', fill(site.settings.behavior.agent_joined_message, { agent: user.name }));
  visitorStatus(conv);
  broadcastConv(conv);
}

/* ----------------------------- maintenance ----------------------------- */

function maintenance() {
  const sites = db.prepare('SELECT id FROM sites').all().map(s => getSite(s.id));
  for (const site of sites) {
    const b = site.settings.behavior;
    const mins = Number(b.inactivity_minutes) || 0;
    if (mins > 0) {
      const cutoff = new Date(Date.now() - mins * 60000).toISOString();
      const stale = db.prepare("SELECT id FROM conversations WHERE site_id=? AND status!='closed' AND updated_at < ?").all(site.id, cutoff);
      for (const s of stale) closeConversation(getConv(s.id), 'system');
    }
    const days = Number(b.retention_days) || 0;
    if (days > 0) {
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      const r = db.prepare("DELETE FROM conversations WHERE site_id=? AND status='closed' AND closed_at < ?").run(site.id, cutoff);
      if (r.changes) console.log(`[retention] site ${site.id}: deleted ${r.changes} conversations older than ${days} days`);
    }
  }
}

module.exports = { setup, maintenance, convSummary, publicMsg, closeConversation, learn, getAio: () => aio };
