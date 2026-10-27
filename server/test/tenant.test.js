// Store separation: a user tied to one site (a branch) must never see or change another site's data.
// node test/tenant.test.js
const path = require('path'), fs = require('fs'), os = require('os');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sct-'));
process.env.ADMIN_PASSWORD = 'admin123';
const assert = require('assert');
const { io } = require('socket.io-client');
const { app, server } = require('../src/server');
const { db } = require('../src/db');
const tenant = require('../src/tenant');
const PORT = 3997, URL = 'http://localhost:' + PORT;
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const api = async (m, u, b, t) => {
  const r = await fetch(URL + u, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b && JSON.stringify(b) });
  const ct = r.headers.get('content-type') || '';
  return { s: r.status, j: ct.includes('json') ? await r.json() : null };
};
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log('  ✔', m); };
function visitor(key, vid) {
  const s = io(URL + '/visitor', { transports: ['websocket'] });
  const v = { s, msgs: [], status: null };
  s.on('message', m => v.msgs.push(m)); s.on('status', st => { v.status = st.status; });
  v.emit = (e, p) => new Promise(r => s.emit(e, p, r));
  v.say = async (text) => { await v.emit('message', { text }); await wait(200); };
  return v;
}
function agent(token) {
  const s = io(URL + '/agent', { transports: ['websocket'], auth: { token } });
  const a = { s, events: [] };
  for (const e of ['notify', 'conv:update', 'conv:message', 'kb:learned', 'ticket:new', 'ticket:update', 'visitor:typing', 'agents:online']) s.on(e, p => a.events.push({ e, p }));
  a.emit = (e, p) => new Promise(r => s.emit(e, p, r));
  a.ready = new Promise(r => s.on('connect', r));
  return a;
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const T = (await api('POST', '/api/auth/login', { email: 'admin@example.com', password: 'admin123' })).j.token;
  const A = (await api('GET', '/api/sites', null, T)).j[0];
  const B = (await api('POST', '/api/sites', { name: 'متجر ب' }, T)).j;
  ok(A && B && A.id !== B.id, 'two stores (sites A and B)');

  console.log('▶ every dashboard route has a decided rule');
  const routes = [];
  for (const l of app._router.stack) if (l.route && typeof l.route.path === 'string' && l.route.path.startsWith('/api/')) for (const m of Object.keys(l.route.methods)) routes.push(m.toUpperCase() + ' ' + l.route.path);
  const authed = routes.filter(r => !/^(GET \/api\/widget|POST \/api\/widget|GET \/api\/patterns|POST \/api\/auth|GET \/api\/setup)/.test(r));
  const undecided = authed.filter(r => !tenant.ruleOf(r));
  ok(undecided.length === 0, 'no route without a store rule' + (undecided.length ? ': ' + undecided.join(', ') : ` (${authed.length} routes)`));

  // store users
  const mk = async (site, email, role = 'admin') => (await api('POST', '/api/users', { name: email, email, password: 'Store#Pass2026', role, site_id: site }, T)).j.id;
  const uA = await mk(A.id, 'a@store-a.sa'), uB = await mk(B.id, 'b@store-b.sa'), uB2 = await mk(B.id, 'b2@store-b.sa', 'agent');
  const TA = (await api('POST', '/api/auth/login', { email: 'a@store-a.sa', password: 'Store#Pass2026' })).j.token;
  const TB = (await api('POST', '/api/auth/login', { email: 'b@store-b.sa', password: 'Store#Pass2026' })).j.token;
  ok(TA && TB && db.prepare('SELECT site_id FROM users WHERE id=?').get(uA).site_id === A.id, 'store users tied to their store');

  // data in store B
  const agB = agent(TB), agA = agent(TA); await Promise.all([agB.ready, agA.ready]);
  const vb = visitor(B.key, 'vb1'); await vb.emit('join', { site: B.key, visitorId: 'vb1' }); await vb.emit('start', {}); await wait(150);
  await vb.say('ابي اكلم موظف'); await vb.say('سؤال سري لمتجر ب عن طلبي');
  const convB = db.prepare('SELECT id FROM conversations WHERE site_id=? ORDER BY id DESC').get(B.id).id;
  const kbB = (await api('POST', '/api/kb', { site_id: B.id, question: 'سؤال متجر ب', answer: 'جواب خاص بمتجر ب' }, TB)).j.id;
  const tkB = (await api('POST', '/api/tickets', { site_id: B.id, type: 'complaint', name: 'عميل ب', phone: '0500000000', text: 'شكوى متجر ب' }, TB)).j.id;
  const apB = (await api('POST', '/api/appointments', { site_id: B.id, name: 'موعد ب', date: '2026-11-01', time: '10:00' }, TB)).j.id;
  const catB = (await api('POST', '/api/kb-categories', { site_id: B.id, name: 'تصنيف ب' }, TB)).j.id;
  db.prepare("INSERT INTO unanswered(site_id,question,count,status,created_at,updated_at) VALUES(?,?,1,'open',?,?)").run(B.id, 'غير مجاب ب', new Date().toISOString(), new Date().toISOString());
  const unB = db.prepare('SELECT id FROM unanswered WHERE site_id=?').get(B.id).id;
  ok(convB && kbB && tkB && apB && catB && unB, 'store B has a conversation, answers, ticket, appointment, category, unanswered question');
  await wait(300);
  ok(agB.events.some(e => e.e === 'notify' && e.p.conversation?.id === convB), "store B's employee is alerted about B's visitor");
  ok(!agA.events.some(e => JSON.stringify(e.p).includes('متجر ب') || e.p?.conversation?.id === convB || e.p?.conversation_id === convB), "store A's employee hears nothing about store B");

  console.log('▶ store A cannot read store B');
  const reads = [`/api/conversations/${convB}`, `/api/conversations/${convB}/export`, `/api/tickets/${tkB}`, `/api/sites/${B.id}/widget-config`, `/api/sites/${B.id}/install-status`];
  for (const u of reads) { const r = await api('GET', u, null, TA); ok(r.s === 404 || r.s === 403, `GET ${u.replace(/\d+/g, 'B')} → ${r.s}`); }
  const lists = { conversations: '/api/conversations?site=' + B.id, kb: '/api/kb?site=' + B.id, tickets: '/api/tickets?site=' + B.id, appointments: '/api/appointments?site=' + B.id, unanswered: '/api/unanswered?site=' + B.id, mindmap: '/api/mindmap?site=' + B.id, stats: '/api/stats?site=' + B.id, ticketstats: '/api/tickets/stats?site=' + B.id, eligibility: '/api/eligibility/results?site=' + B.id };
  for (const [k, u] of Object.entries(lists)) { const r = await api('GET', u, null, TA); ok(r.s === 200 && !JSON.stringify(r.j).includes('متجر ب') && !JSON.stringify(r.j).includes('عميل ب') && !JSON.stringify(r.j).includes('موعد ب'), `list "${k}" asked for store B → only store A's data`); }
  const st = (await api('GET', '/api/stats?site=' + B.id, null, TA)).j;
  ok(JSON.stringify(st).indexOf('b@store-b.sa') === -1, 'statistics show no store B employees');
  const sites = (await api('GET', '/api/sites', null, TA)).j;
  ok(sites.length === 1 && sites[0].id === A.id, 'site list: only its own store');
  const users = (await api('GET', '/api/users', null, TA)).j;
  ok(users.every(u => u.site_id === A.id) && !users.some(u => u.email === 'admin@example.com'), 'user list: only its own store (not the platform admin)');
  const online = (await api('GET', '/api/online', null, TA)).j;
  ok(online.every(o => o.site_id === A.id), 'online employees: only its own store');
  const rep = (await api('GET', '/api/reports/agents?site=' + B.id, null, TA)).j;
  ok(!JSON.stringify(rep).includes('store-b'), 'employee report: no store B employees');

  console.log('▶ store A cannot change store B');
  const writes = [
    ['PUT', `/api/sites/${B.id}`, { settings: { org: { name: 'اختراق' } } }], ['DELETE', `/api/sites/${B.id}`],
    ['PUT', `/api/kb/${kbB}`, { answer: 'اختراق' }], ['DELETE', `/api/kb/${kbB}`],
    ['PUT', `/api/tickets/${tkB}`, { status: 'closed' }], ['DELETE', `/api/tickets/${tkB}`],
    ['PUT', `/api/appointments/${apB}`, { name: 'اختراق' }], ['DELETE', `/api/appointments/${apB}`],
    ['PUT', `/api/kb-categories/${catB}`, { name: 'اختراق' }], ['DELETE', `/api/kb-categories/${catB}`],
    ['PUT', `/api/unanswered/${unB}`, { status: 'dismissed' }], ['DELETE', `/api/conversations/${convB}`],
    ['PUT', `/api/users/${uB}`, { password: 'Hacked#2026pass' }], ['DELETE', `/api/users/${uB2}`]
  ];
  for (const [m, u, b] of writes) { const r = await api(m, u, b, TA); ok(r.s === 404 || r.s === 403, `${m} ${u.replace(/\d+/g, 'B')} → ${r.s}`); }
  ok(db.prepare('SELECT answer FROM kb WHERE id=?').get(kbB).answer === 'جواب خاص بمتجر ب' && db.prepare('SELECT status FROM tickets WHERE id=?').get(tkB).status !== 'closed' &&
    db.prepare('SELECT COUNT(*) n FROM conversations WHERE id=?').get(convB).n === 1 && db.prepare('SELECT COUNT(*) n FROM users WHERE id=?').get(uB2).n === 1 &&
    JSON.parse(db.prepare('SELECT settings FROM sites WHERE id=?').get(B.id).settings).org.name !== 'اختراق', "store B's data untouched");
  const kbIntoB = await api('POST', '/api/kb', { site_id: B.id, question: 'مدسوس', answer: 'مدسوس' }, TA);
  ok(kbIntoB.s === 200 && db.prepare('SELECT site_id FROM kb WHERE id=?').get(kbIntoB.j.id).site_id === A.id, 'creating "in store B" lands in store A instead');
  const uNew = await api('POST', '/api/users', { name: 'x', email: 'x@a.sa', password: 'Store#Pass2026', role: 'admin', site_id: B.id }, TA);
  ok(db.prepare('SELECT site_id FROM users WHERE id=?').get(uNew.j.id).site_id === A.id, 'new employee always joins its own store');

  console.log('▶ platform-only parts are closed to stores');
  for (const [m, u, b] of [['GET', '/api/backups'], ['GET', '/api/backup/download'], ['POST', '/api/reset', { password: 'Store#Pass2026', confirm: 'تصفير' }], ['GET', '/api/audit'], ['GET', '/api/notify-log'],
    ['POST', '/api/sites', { name: 'x' }], ['GET', `/api/sites/${A.id}/wordpress-plugin.zip`], ['POST', `/api/sites/${A.id}/datasource/test`, {}], ['POST', `/api/sites/${A.id}/regenerate-secret`]]) {
    const r = await api(m, u, b, TA); ok(r.s === 403, `${m} ${u.replace(/\d+/g, 'A')} → 403`);
  }
  for (const sec of ['datasource', 'security', 'notify', 'integrations', 'developer']) {
    const r = await api('PUT', `/api/sites/${A.id}`, { settings: { [sec]: {} } }, TA); ok(r.s === 403, `own store: cannot change "${sec}" (platform setting)`);
  }
  ok((await api('PUT', `/api/sites/${A.id}`, { settings: { org: { name: 'متجر أ' } } }, TA)).s === 200, 'own store: can change its own info');

  console.log('▶ live chat: store A cannot act on store B');
  for (const ev of ['take', 'close', 'return_to_bot']) { const r = await agA.emit(ev, { id: convB }); ok(r && r.error, `socket "${ev}" on B's conversation refused`); }
  const sent = await agA.emit('send', { id: convB, text: 'رسالة مدسوسة' });
  ok(sent?.error && !db.prepare("SELECT 1 FROM messages WHERE conversation_id=? AND body='رسالة مدسوسة'").get(convB), 'socket "send" into B refused, nothing written');
  ok((await agB.emit('transfer', { id: convB, to: uA }))?.error, "B cannot transfer its conversation to store A's employee");
  ok((await agB.emit('send', { id: convB, text: 'أهلاً من متجر ب' }))?.ok, "B's own employee replies normally");

  console.log('▶ the platform admin still sees everything');
  const all = (await api('GET', '/api/conversations', null, T)).j;
  ok(all.items.some(c => c.id === convB) && (await api('GET', '/api/sites', null, T)).j.length === 2, 'platform admin: all stores');

  for (const x of [agA, agB]) x.s.close(); vb.s.close();
  console.log(`\n${pass} store-separation checks passed ✅`);
  process.exit(0);
})().catch(e => { console.error('❌', e); process.exit(1); });
