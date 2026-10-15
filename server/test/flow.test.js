// End-to-end flow test: node test/flow.test.js
const path = require('path'), fs = require('fs'), os = require('os');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'));
process.env.PORT = 3999;
const assert = require('assert');
const { io } = require('socket.io-client');
const { server } = require('../src/server');
const { db } = require('../src/db');
const URL = 'http://localhost:3999';
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const api = async (m, u, b, t) => { const r = await fetch(URL + u, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b && JSON.stringify(b) }); return { s: r.status, j: await r.json().catch(() => null) }; };

function visitor(site, vid) {
  const s = io(URL + '/visitor', { transports: ['websocket'] });
  const v = { s, msgs: [], status: null, closed: false };
  s.on('message', m => v.msgs.push(m));
  s.on('history', h => { v.msgs = h.messages; v.status = h.conversation.status; });
  s.on('status', st => v.status = st.status);
  s.on('closed', () => v.closed = true);
  v.emit = (e, p) => new Promise(r => s.emit(e, p, r));
  v.last = () => v.msgs[v.msgs.length - 1];
  v.join = () => v.emit('join', { site, visitorId: vid });
  return v;
}
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log('  ✔', m); };

(async () => {
  await new Promise(r => server.listen(3999, r));
  const login = await api('POST', '/api/auth/login', { email: 'admin@example.com', password: 'admin123' });
  ok(login.s === 200 && login.j.token, 'admin login');
  const T = login.j.token;
  const sites = (await api('GET', '/api/sites', null, T)).j;
  const key = sites[0].key, siteId = sites[0].id;

  // users & roles
  const u = await api('POST', '/api/users', { name: 'سعد الموظف', email: 'agent@x.com', password: 'secret1', role: 'agent' }, T);
  ok(u.s === 200, 'create agent user');
  const AT = (await api('POST', '/api/auth/login', { email: 'agent@x.com', password: 'secret1' })).j.token;
  ok((await api('PUT', '/api/sites/' + siteId, { settings: { appearance: { primary_color: '#000' } } }, AT)).s === 403, 'agent cannot edit appearance');
  ok((await api('POST', '/api/users', { name: 'x', email: 'y@x.com', password: '123456', role: 'admin' }, AT)).s === 403, 'agent cannot create users');
  ok((await api('PUT', '/api/sites/' + siteId, { settings: { appearance: { primary_color: '#41b072', rating_max: 6 } } }, T)).s === 200, 'admin updates appearance (6 stars)');
  const cfg = await (await fetch(URL + '/api/widget/config?site=' + key)).json();
  ok(cfg.appearance.rating_max === 6 && !cfg.security, 'widget config is public-safe');

  // agent socket
  const agent = io(URL + '/agent', { auth: { token: AT }, transports: ['websocket'] });
  const notes = []; agent.on('notify', n => notes.push(n));
  await new Promise(r => agent.on('connect', r));

  // ---- visitor 1: tree + KB + order lookup
  const v = visitor(key, 'visitor-1');
  ok((await v.join()).ok, 'visitor join');
  await v.emit('start', { name: 'أحمد', phone: '0500000001' }); await wait(150);
  ok(/أحمد/.test(v.last().body) && v.last().options.length === 4, 'root node greeting with name + 4 options');
  ok(notes.some(n => n.type === 'new'), 'dashboard notified of new conversation');
  await v.emit('option', { mid: v.last().id, i: 1 }); await wait(100);
  ok(v.last().body.includes('اختر سؤالك'), 'goto FAQ node');
  await v.emit('option', { mid: v.last().id, i: 0 }); await wait(100);
  ok(v.last().body.includes('الأحد'), 'FAQ answer node');
  await v.emit('message', { text: 'كم مدة توصيل الطلبات؟' }); await wait(150);
  ok(v.msgs.some(m => m.body.includes('2 إلى 5 أيام')), 'knowledge base match on free text');
  await v.emit('message', { text: 'ابغى اعرف حالة طلبي' }); await wait(150);
  ok(v.last().body.includes('رقم الطلب'), 'order intent asks for order number (phone prefilled)');
  await v.emit('message', { text: '١٠٠١' }); await wait(200);
  const txt = v.msgs.slice(-3).map(m => m.body).join('\n');
  ok(txt.includes('قيد التجهيز') && txt.includes('سيتم الشحن'), 'order status + notes from DB (Arabic digits ok)');
  await v.emit('message', { text: 'حالة الطلب 9999' }); await wait(200);
  ok(v.msgs.some(m => m.body.includes('لم أجد طلباً')), 'order not found message');

  // ---- unknown question -> handoff -> agent reply learned
  await v.emit('message', { text: 'هل عندكم تغليف هدايا للطلبات؟' }); await wait(150);
  ok(v.status === 'waiting', 'unknown question → handoff (bot stops)');
  ok(notes.some(n => n.type === 'waiting' && n.conversation.pending_question.includes('تغليف')), 'agents notified with pending question');
  const convId = notes.find(n => n.type === 'waiting').conversation.id;
  const before = v.msgs.length;
  await v.emit('message', { text: 'ألو؟' }); await wait(150);
  ok(v.msgs.length === before + 1, 'bot silent after handoff');
  await new Promise(r => agent.emit('send', { id: convId, text: 'نعم، نوفر تغليف هدايا مجاني لجميع الطلبات 🎁', learn: true }, r)); await wait(150);
  ok(v.status === 'human' && v.msgs.some(m => m.sender === 'agent'), 'agent took over & replied in realtime');
  const kb = (await api('GET', '/api/kb?site=' + siteId + '&source=learned', null, T)).j;
  ok(kb.some(k => k.question.includes('تغليف')), 'agent answer saved to knowledge base');

  // ---- visitor closes, rates with half star
  await v.emit('close', {}); await wait(150);
  ok(v.closed, 'visitor closed conversation');
  ok(notes.some(n => n.type === 'closed' && n.by === 'visitor'), 'dashboard notified: closed by visitor');
  ok((await v.emit('rate', { rating: 7 })).error, 'out-of-range rating rejected (7 > 6)');
  ok((await v.emit('rate', { rating: 5.5, comment: 'ممتاز' })).ok, 'half-star rating 5.5/6 accepted');
  const det = (await api('GET', '/api/conversations/' + convId, null, T)).j;
  ok(det.rating === 5.5 && det.closed_by === 'visitor' && det.messages.length > 10, 'full transcript stored with rating + closed_by');
  const hist = (await api('GET', `/api/conversations?site=${siteId}&status=closed&closed_by=visitor`, null, AT)).j;
  ok(hist.items.some(c => c.id === convId), 'appears in history filter closed_by=visitor');

  // ---- visitor 2: same question → learned answer, agent closes
  const v2 = visitor(key, 'visitor-2');
  await v2.join(); await v2.emit('start', {}); await wait(100);
  await v2.emit('message', { text: 'عندكم تغليف هدايا؟' }); await wait(150);
  ok(v2.status !== 'waiting' && v2.msgs.some(m => m.body.includes('تغليف هدايا مجاني')), 'same question later answered automatically');
  await v2.emit('message', { text: 'ابي اكلم موظف' }); await wait(100);
  ok(v2.status === 'waiting', 'explicit human request keyword');
  const c2 = notes.filter(n => n.type === 'waiting').pop().conversation.id;
  await new Promise(r => agent.emit('take', { id: c2 }, r));
  await new Promise(r => agent.emit('close', { id: c2 }, r)); await wait(100);
  ok(v2.closed && notes.some(n => n.type === 'closed' && n.by === 'agent'), 'agent closes → visitor sees rating');

  // ---- reconnect keeps history
  const v1b = visitor(key, 'visitor-2'); await v1b.join(); await wait(100);
  ok(v1b.msgs.length > 3, 'reconnect restores conversation history');

  // ---- identity verification
  const crypto = require('crypto');
  const secret = sites[0].settings.security.identity_secret;
  const v3 = visitor(key, 'visitor-3');
  const j3 = await v3.emit('join', { site: key, visitorId: 'visitor-3', user: { name: 'سارة', email: 'sara@example.com', sig: crypto.createHmac('sha256', secret).update('sara@example.com').digest('hex') } });
  ok(j3.verified, 'HMAC identity verified');
  await v3.emit('start', {}); await wait(150);
  const d3 = (await api('GET', '/api/conversations?site=' + siteId + '&q=sara', null, T)).j.items[0];
  const full3 = (await api('GET', '/api/conversations/' + d3.id, null, T)).j;
  ok(full3.meta.customer?.city === 'الرياض', 'customer data pulled from DB for verified user');
  const v4 = visitor(key, 'visitor-4');
  ok(!(await v4.emit('join', { site: key, visitorId: 'v4', user: { email: 'sara@example.com', sig: 'forged' } })).verified, 'forged signature rejected');

  // ---- retention
  db.prepare("UPDATE conversations SET closed_at='2000-01-01T00:00:00Z' WHERE id=?").run(convId);
  require('../src/chat').maintenance();
  ok(!db.prepare('SELECT id FROM conversations WHERE id=?').get(convId), 'retention deletes old closed conversations');
  ok(!db.prepare('SELECT id FROM messages WHERE conversation_id=?').get(convId), 'messages cascade-deleted');

  // ---- stats & datasource test endpoint
  const st = (await api('GET', '/api/stats?site=' + siteId, null, T)).j;
  ok(st.total >= 2 && st.kb.learned >= 1, 'stats endpoint');
  const dt = await api('POST', `/api/sites/${siteId}/datasource/test`, { which: 'order', params: { order_no: '1002', phone: '0500000002' } }, T);
  ok(dt.j.rows[0].status === 'تم الشحن', 'datasource test endpoint');
  const bad = await api('POST', `/api/sites/${siteId}/datasource/test`, { datasource: { order_query: 'DELETE FROM demo_orders' } }, T);
  ok(bad.s === 400, 'non-SELECT queries blocked');

  console.log(`\n${pass} checks passed ✅`);
  process.exit(0);
})().catch(e => { console.error('❌', e); process.exit(1); });
