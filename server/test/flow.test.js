// End-to-end tests: node test/flow.test.js
const path = require('path'), fs = require('fs'), os = require('os');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'));
process.env.PORT = 3999;
process.env.ADMIN_PASSWORD = 'admin123';
const assert = require('assert');
const { io } = require('socket.io-client');
const { server } = require('../src/server');
const { db } = require('../src/db');
const URL = 'http://localhost:3999';
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const api = async (m, u, b, t, raw) => {
  const r = await fetch(URL + u, { method: m, headers: { 'Content-Type': raw ? 'application/octet-stream' : 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: raw || (b && JSON.stringify(b)) });
  const ct = r.headers.get('content-type') || '';
  return { s: r.status, j: ct.includes('json') ? await r.json() : null, buf: ct.includes('json') ? null : Buffer.from(await r.arrayBuffer()), ct };
};

function visitor(site, vid, lang) {
  const s = io(URL + '/visitor', { transports: ['websocket'] });
  const v = { s, msgs: [], status: null, closed: false, st: {} };
  s.on('message', m => v.msgs.push(m));
  s.on('history', h => { v.msgs = h.messages; v.status = h.conversation.status; });
  s.on('status', st => { v.status = st.status; v.st = st; });
  s.on('closed', () => v.closed = true);
  v.emit = (e, p) => new Promise(r => s.emit(e, p, r));
  v.last = () => v.msgs[v.msgs.length - 1];
  v.find = (re) => v.msgs.find(m => re.test(m.body || ''));
  v.join = () => v.emit('join', { site, visitorId: vid, lang });
  v.say = async (text, ms = 150) => { await v.emit('message', { text }); await wait(ms); };
  return v;
}
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log('  ✔', m); };

(async () => {
  await new Promise(r => server.listen(3999, r));
  const T = (await api('POST', '/api/auth/login', { email: 'admin@example.com', password: 'admin123' })).j.token;
  ok(T, 'admin login');
  const site = (await api('GET', '/api/sites', null, T)).j[0];
  const key = site.key, siteId = site.id;

  // configure organisation info, languages and developer
  const put = await api('PUT', '/api/sites/' + siteId, { settings: {
    org: { name: 'جمعية البر بالمدينة المنورة', unified_number: '920000000', email: 'info@example.org',
      map_url: 'https://www.google.com/maps/@24.4672,39.6111,15z', address: 'المدينة المنورة', hours: 'الأحد - الخميس 8ص - 4م',
      departments: [{ name: 'رعاية المستفيدين', phones: '0546765208, 0561687456' }], social: { x: '@biralmadinah' },
      sections: [
        { id: 'history', key: 'history', title: 'نبذة عن الجمعية', icon: 'building', color: '#1a6739', text: 'تأسست الجمعية عام 1395هـ لخدمة المستفيدين.' },
        { id: 'goals', key: 'goals', title: 'أهدافنا', icon: 'target', color: '#bc9525', text: 'تمكين الأسر المحتاجة.' },
        { id: 'aid', title: 'طلب معونة', icon: 'hands', keywords: 'معونة, طلب مساعدة', text: 'يمكنك تقديم طلب المعونة عبر الرابط.', media: [{ type: 'pdf', url: 'https://example.org/guide.pdf', name: 'دليل التسجيل' }] }],
      banks: [
        { id: 'g1', name: 'الحساب العام', icon: 'bank', color: '#1a6739', accounts: [{ id: 'a1', bank: 'rajhi', holder: 'جمعية البر', iban: 'SA03 8000 0000 6080 1016 7519' }, { id: 'a2', bank: 'snb', holder: 'جمعية البر', iban: 'SA4410000001234567890123' }] },
        { id: 'g2', name: 'حساب الزكاة', icon: 'money', accounts: [{ id: 'a3', bank: 'alinma', holder: 'جمعية البر - زكاة', iban: 'SA1105000068200000000001' }] }] },
    developer: { show: true, name: 'فانتازيا كود', url: 'https://example.com/store' },
    languages: { enabled: ['ar', 'en', 'ur'], default: 'ar' }
  } }, T);
  ok(put.s === 200 && put.j.settings.org.departments.length === 1, 'save organisation info (arrays replaced, not merged)');
  const cfg = (await api('GET', '/api/widget/config?site=' + key)).j;
  ok(cfg.texts.en && cfg.texts.ur && cfg.org.unified_number === '920000000' && /svg/.test(cfg.appearance.pattern_css), 'widget config: 3 languages, unified number, decoration');
  ok(!JSON.stringify(cfg).includes('identity_secret'), 'widget config does not leak secrets');

  // agent
  await api('POST', '/api/users', { name: 'سعد', email: 'agent@x.com', password: 'secret123', role: 'agent', job_title: 'خدمة العملاء' }, T);
  const AT = (await api('POST', '/api/auth/login', { email: 'agent@x.com', password: 'secret123' })).j.token;
  ok((await api('PUT', '/api/sites/' + siteId, { settings: { appearance: { primary_color: '#000000' } } }, AT)).s === 403, 'agent cannot change appearance');

  // ---------------- visitor flow (Arabic)
  const v = visitor(key, 'v1');
  await v.join(); await v.emit('start', { name: 'أحمد' }); await wait(200);
  ok(/أهلاً أحمد/.test(v.msgs[0].body) && v.last().numbered && v.last().options.length === 6, 'greeting then numbered main menu (auto-next)');
  ok(!v.last().options.some(o => /موظف/.test(o.label)), 'human agent is NOT a main-menu option');
  await v.say('٢'); // Arabic digit -> option 2 = location
  ok(v.last().location?.lat === 24.4672 && /maps/.test(v.last().location.embed), 'typed number 2 -> map location sent inside the chat');
  await v.say('١'); // about us
  ok(v.last().numbered && v.last().card && v.last().options.some(o => o.label === 'أهدافنا' && /<svg/.test(o.icon)), 'about-us menu lists every section with its icon');
  await v.say('2');
  ok(v.last().card?.title === 'أهدافنا' && /<svg/.test(v.last().card.svg) && /تمكين/.test(v.last().body), 'section answer with coloured icon card');
  await v.say('وين موقعكم؟');
  ok(v.last().location, 'free text "وين موقعكم" -> location');
  await v.say('ابغى اعرف تاريخ الجمعية');
  ok(/1395/.test(v.last().body), 'history question -> organisation history');
  await v.say('كم الرقم الموحد');
  ok(v.last().contacts?.some(c => c.value === '920000000'), 'contact question -> unified number + department phones');
  await v.say('ابغى طلب معونة');
  ok(/المعونة/.test(v.last().body) && v.last().media?.[0].type === 'pdf', 'info section found by keyword, with PDF attachment');
  await v.say('من برمج هذا البوت؟');
  ok(/فانتازيا كود/.test(v.last().body) && v.last().link === 'https://example.com/store', 'developer question -> developer link');
  await v.say('ابي رقم الحساب عشان اتبرع');
  ok(v.last().options?.length === 3 && v.last().options[0].label === 'الحساب العام', 'donation question -> bank account categories');
  await v.say('1');
  ok(v.last().banks?.accounts.length === 2 && v.last().banks.accounts[0].iban === 'SA0380000000608010167519' && /الراجحي/.test(v.last().banks.accounts[0].bank), 'category -> bank accounts with IBAN');
  await v.say('5'); // FAQ (mind map)
  ok(v.last().options?.some(o => o.label === 'التسجيل والخدمات'), 'FAQ menu lists mind-map categories');
  await v.say('1'); await v.say('1');
  ok(/الهوية الوطنية/.test(v.last().body), 'category -> question -> answer');

  // ---------------- complaint
  await v.say('السلام عليكم'); await v.say('6'); // complaints & suggestions menu
  const tmenu = v.last();
  await v.emit('option', { mid: tmenu.id, i: 0 }); await wait(150);
  const form = v.last();
  ok(form.form?.kind === 'ticket' && form.form.type === 'complaint', 'complaint form shown in chat');
  const bad = await v.emit('form_submit', { mid: form.id, values: { name: '', phone: '12', text: '' } });
  ok(bad.error === 'validation' && bad.fields.name && bad.fields.phone && bad.fields.text, 'form validation (name, phone, text)');
  const sub = await v.emit('form_submit', { mid: form.id, values: { name: 'أحمد محمد', phone: '0501234567', text: 'تأخر الرد على طلبي كثيراً' } }); await wait(150);
  ok(sub.ok && /^C-\d+/.test(sub.number) && v.msgs.some(m => m.body?.includes(sub.number)), 'complaint saved with number ' + sub.number + ' and date message');
  ok((await v.emit('form_submit', { mid: form.id, values: { name: 'x', phone: '0501234567', text: 'again' } })).error === 'form', 'form cannot be submitted twice');
  const list = (await api('GET', `/api/tickets?site=${siteId}`, null, AT)).j;
  ok(list.total === 1 && list.items[0].name === 'أحمد محمد', 'complaint visible to staff');
  const tid = list.items[0].id;
  const upd = (await api('PUT', '/api/tickets/' + tid, { status: 'resolved', reply: 'تم التواصل معك وحل المشكلة' }, AT)).j;
  ok(upd.ticket.status === 'resolved' && upd.ticket.resolved_at, 'staff updates status + reply');
  const det = (await api('GET', '/api/tickets/' + tid, null, AT)).j;
  ok(det.wa_link?.startsWith('https://wa.me/966501234567') && det.events.length >= 2, 'manual WhatsApp link + ticket history');
  await v.say('حالة الشكوى'); await v.say(sub.number);
  ok(/تم الحل/.test(v.last().body) && /تم التواصل معك/.test(v.last().body), 'visitor checks complaint status in chat (number + known phone)');
  await v.say('السلام عليكم');
  ok(v.status === 'bot' && v.last().numbered, 'a greeting shows the menu (no hand-off)');
  const st = (await api('GET', `/api/tickets/stats?site=${siteId}`, null, AT)).j;
  ok(st.total === 1 && st.resolution_rate === 100, 'ticket stats');
  const xl = await api('GET', `/api/tickets/export?site=${siteId}`, null, AT);
  ok(xl.s === 200 && xl.buf.subarray(0, 2).toString() === 'PK', 'complaints Excel export (.xlsx)');

  // ---------------- hand-off & learning
  const agent = io(URL + '/agent', { auth: { token: AT }, transports: ['websocket'] });
  const notes = []; agent.on('notify', n => notes.push(n));
  await new Promise(r => agent.on('connect', r)); await wait(100);
  await v.say('هل عندكم برنامج كفالة أيتام للطلاب الجامعيين؟');
  ok(v.status === 'waiting', 'unknown question -> human hand-off (last resort)');
  const un = (await api('GET', `/api/unanswered?site=${siteId}`, null, AT)).j;
  ok(un.length === 1, 'unknown question recorded in "unanswered" list');
  const convId = notes.find(n => n.type === 'waiting').conversation.id;
  await new Promise(r => agent.emit('send', { id: convId, text: 'نعم، لدينا برنامج كفالة للطلاب الجامعيين عبر وحدة الأيتام.' }, r)); await wait(150);
  ok(v.status === 'human' && v.msgs.some(m => m.sender === 'agent' && m.agent_name === 'سعد'), 'agent replied in real time');
  const learned = (await api('GET', `/api/kb?site=${siteId}&source=learned`, null, T)).j;
  ok(learned.some(k => /كفالة/.test(k.question)), 'Q&A stored automatically (auto-learn)');
  ok((await api('GET', `/api/unanswered?site=${siteId}`, null, AT)).j.length === 0, 'unanswered item resolved by learning');
  await v.emit('close', {}); await wait(100);

  // visitor asks for a human first, then types the question (must still be learned)
  const v2 = visitor(key, 'v2');
  await v2.join(); await v2.emit('start', {}); await wait(150);
  await v2.say('ابي اكلم موظف'); // the human agent is still reachable by asking
  ok(v2.status === 'waiting', 'asking for an employee -> waiting for agent');
  await v2.say('السلام عليكم'); await v2.say('متى يبدأ التسجيل في السلة الغذائية؟');
  const c2 = notes.filter(n => n.type === 'waiting').pop().conversation.id;
  await new Promise(r => agent.emit('send', { id: c2, text: 'يبدأ التسجيل في السلة الغذائية أول كل شهر.' }, r)); await wait(150);
  const kb2 = (await api('GET', `/api/kb?site=${siteId}&source=learned`, null, T)).j;
  ok(kb2.some(k => /السلة الغذائية/.test(k.question) && /أول كل شهر/.test(k.answer)), 'question typed after choosing "agent" is learned (greeting ignored)');
  await new Promise(r => agent.emit('close', { id: c2 }, r)); await wait(100);
  ok(v2.closed, 'agent closes -> visitor sees rating');
  ok((await v2.emit('rate', { rating: 4.5, comment: 'ممتاز' })).ok, 'half-star rating');

  // same question later -> answered by the bot, no human needed
  const v3 = visitor(key, 'v3');
  await v3.join(); await v3.emit('start', {}); await wait(150);
  await v3.say('متى يبدا التسجيل بالسلة الغذائية');
  ok(v3.status !== 'waiting' && /أول كل شهر/.test(v3.last().body), 'same question later answered by the bot');

  // ---------------- languages
  const ve = visitor(key, 've', 'en');
  await ve.join(); await ve.emit('start', { lang: 'en' }); await wait(150);
  ok(/Hello/.test(ve.msgs[0].body) && /About us/.test(ve.last().options[0].label), 'English conversation');
  const vu = visitor(key, 'vu', 'ur');
  await vu.join(); await vu.emit('start', { lang: 'ur' }); await wait(150);
  ok(/السلام علیکم/.test(vu.msgs[0].body) && /ہمارا تعارف/.test(vu.last().options[0].label), 'Urdu conversation');

  const http = require('http');
  // ---------------- mind map
  const cat = (await api('POST', '/api/kb-categories', { site_id: siteId, name: 'التبرعات', icon: 'money', color: '#bc9525' }, T)).j;
  await api('POST', '/api/kb', { site_id: siteId, question: 'هل التبرع يقبل بالبطاقة؟', answer: 'نعم عبر المتجر.', category_id: cat.id }, T);
  const mm = (await api('GET', `/api/mindmap?site=${siteId}`, null, T)).j;
  ok(mm.categories.some(c => c.id === cat.id) && mm.kb.some(k => k.category_id === cat.id) && mm.kb.some(k => k.source === 'learned'), 'mind map: categories, questions and learned answers');

  // ---------------- media, reports, install
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const up = await api('POST', '/api/media?type=image/png&name=logo.png', null, T, png);
  ok(up.s === 200 && /^\/media\/.+\.png$/.test(up.j.url), 'media upload');
  const fake = await api('POST', '/api/media?type=application/pdf&name=x.pdf', null, T, Buffer.from('not a pdf'));
  ok(fake.s === 400, 'media content signature verified');
  ok((await api('GET', up.j.url)).s === 200, 'media served');
  const dash = (await api('GET', `/api/stats?site=${siteId}`, null, T)).j;
  ok(dash.kpi.conversations >= 5 && dash.kpi.handoffs >= 2 && dash.per_day.length >= 30, 'statistics dashboard data');
  const rep = (await api('GET', `/api/reports/agents?site=${siteId}`, null, T)).j;
  const saad = rep.rows.find(r => r.name === 'سعد');
  ok(saad.conversations === 2 && saad.learned === 2 && saad.first_response != null, 'agent report (conversations, learned answers, first response)');
  const one = (await api('GET', `/api/reports/agents?site=${siteId}&agents=${saad.id}`, null, T)).j;
  ok(one.rows.length === 1, 'report for a selected agent');
  const ax = await api('GET', `/api/reports/agents.xlsx?site=${siteId}`, null, T);
  ok(ax.s === 200 && ax.buf.subarray(0, 2).toString() === 'PK', 'agents Excel report');
  const wp = await api('GET', `/api/sites/${siteId}/wordpress-plugin.zip`, null, T);
  const JSZip = require('jszip'); const z = await JSZip.loadAsync(wp.buf);
  const php = await z.file('smart-chat-agent/smart-chat-agent.php').async('string');
  ok(php.includes(key) && !php.includes('__SC_KEY__'), 'WordPress plugin downloads pre-configured');

  // ---------------- e-mail via a local SMTP server
  const { SMTPServer } = require('smtp-server');
  const mails = [];
  const smtp = new SMTPServer({ authOptional: true, disabledCommands: ['STARTTLS'], onData(stream, s, cb) { let d = ''; stream.on('data', c => d += c); stream.on('end', () => { mails.push(d); cb(); }); } });
  await new Promise(r => smtp.listen(2525, r));
  await api('PUT', '/api/sites/' + siteId, { settings: { notify: { email: { enabled: true, host: '127.0.0.1', port: 2525, secure: false, from_email: 'noreply@example.org' } } } }, T);
  const te = await api('POST', `/api/sites/${siteId}/notify/test`, { channel: 'email', to: 'me@example.org' }, T);
  ok(te.s === 200 && mails.length === 1, 'SMTP test e-mail delivered');
  const v4 = visitor(key, 'v4'); await v4.join(); await v4.emit('start', {}); await wait(120);
  await v4.say('عندي اقتراح');
  const f4 = v4.last();
  await v4.emit('form_submit', { mid: f4.id, values: { name: 'نورة', phone: '0555555555', email: 'noura@example.org', text: 'إضافة خدمة حجز المواعيد' } }); await wait(500);
  ok(f4.form.type === 'suggestion' && mails.some(m => /noura@example.org/.test(m)), 'suggestion -> confirmation e-mail sent to the visitor');
  const t4 = (await api('GET', `/api/tickets?site=${siteId}&type=suggestion`, null, T)).j.items[0];
  await api('PUT', '/api/tickets/' + t4.id, { status: 'in_progress', reply: 'نعمل على دراسة الاقتراح' }, T); await wait(300);
  ok(mails.length >= 3, 'status update -> e-mail sent');
  smtp.close();

  // ---------------- retention
  db.prepare("UPDATE conversations SET closed_at='2000-01-01T00:00:00Z' WHERE id=?").run(convId);
  require('../src/chat').maintenance();
  ok(!db.prepare('SELECT id FROM conversations WHERE id=?').get(convId), 'retention deletes old closed conversations');

  // ---------------- working hours (all days closed -> callback request with 2 fields)
  await api('PUT', '/api/sites/' + siteId, { settings: { behavior: { work_hours: { enabled: true, allow_handoff: false, days: [0, 1, 2, 3, 4, 5, 6].map(d => ({ day: d, open: false, from: '08:00', to: '16:00' })) } } } }, T);
  ok((await api('GET', '/api/widget/config?site=' + key)).j.work.open === false, 'widget knows it is outside working hours');
  const vh = visitor(key, 'vh'); await vh.join(); await vh.emit('start', {}); await wait(150);
  await vh.say('هل تقدمون منح دراسية للطلاب المتفوقين؟', 250);
  const fh = vh.last();
  ok(vh.status === 'bot' && fh.form?.type === 'callback' && /أوقات العمل/.test(fh.body) && /مغلق/.test(fh.body), 'outside working hours: hours shown + name/phone form (no hand-off)');
  const sh = await vh.emit('form_submit', { mid: fh.id, values: { name: 'خالد', phone: '0533333333' } }); await wait(150);
  ok(sh.ok && /^R-\d+/.test(sh.number) && /سنتواصل معك/.test(vh.last().body), 'callback request saved (' + sh.number + ')');
  const cb = (await api('GET', `/api/tickets?site=${siteId}&type=callback`, null, T)).j.items[0];
  ok(cb && /منح دراسية/.test(cb.text), 'callback request keeps the visitor question for staff');
  await api('PUT', '/api/sites/' + siteId, { settings: { behavior: { work_hours: { allow_handoff: true } } } }, T);
  await vh.say('ابي اكلم موظف');
  ok(vh.status === 'waiting', 'outside hours with "allow hand-off" -> agent rings as usual');
  await api('PUT', '/api/sites/' + siteId, { settings: { behavior: { work_hours: { enabled: false } } } }, T);

  // ---------------- security
  const sec = await fetch(URL + '/admin/');
  ok(/default-src 'self'/.test(sec.headers.get('content-security-policy') || '') && sec.headers.get('x-frame-options') === 'DENY' && !sec.headers.get('x-powered-by'), 'security headers on the dashboard');
  const agentId = (await api('GET', '/api/users', null, T)).j.find(u => u.email === 'agent@x.com').id;
  await wait(1100);
  await api('PUT', '/api/users/' + agentId, { password: 'newsecret123' }, T);
  ok((await api('GET', '/api/me', null, AT)).s === 401, 'changing a password ends the old sessions');
  ok((await api('POST', '/api/users', { name: 'x', email: 'y@x.com', password: 'secret123', role: 'admin' }, (await api('POST', '/api/auth/login', { email: 'agent@x.com', password: 'newsecret123' })).j.token)).s === 403, 'only the system admin can add users');
  const dsBad = await api('POST', `/api/sites/${siteId}/datasource/test`, { which: 'order', datasource: { type: 'demo', order_query: 'SELECT password FROM users' } }, T);
  ok(dsBad.s === 400, 'demo data source cannot read system tables');
  const dsDel = await api('POST', `/api/sites/${siteId}/datasource/test`, { which: 'order', datasource: { type: 'demo', order_query: 'DELETE FROM demo_orders' } }, T);
  ok(dsDel.s === 400, 'only SELECT queries allowed');

  // ---------------- extra database + custom look-up
  await api('PUT', '/api/sites/' + siteId, { settings: { datasource: { type: 'demo', connections: [{ id: 'db2', name: 'نظام المستفيدين', type: 'api', api_url: 'http://127.0.0.1:4012', api_headers: '{}' }],
    lookups: [{ id: 'aid', title: 'موعد الصرف', keywords: 'موعد الصرف, متى الصرف', connection: 'db2', query: '/aid/{id_number}', template: 'موعد الصرف القادم: {next_date}', not_found: 'لا يوجد' }] } } }, T);
  const apiSrv = http.createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(req.url.includes('1234567890') ? JSON.stringify({ data: { next_date: '2026-11-01' } }) : '[]'); });
  await new Promise(r => apiSrv.listen(4012, r));
  const vl = visitor(key, 'vl'); await vl.join(); await vl.emit('start', {}); await wait(120);
  await vl.say('متى موعد الصرف؟'); await vl.say('1234567890', 300);
  ok(/2026-11-01/.test(vl.last().body) || vl.msgs.some(m => /2026-11-01/.test(m.body || '')), 'custom look-up on a second database (asks for the ID, then answers)');
  apiSrv.close();

  // ---------------- webhooks (extensibility)
  const got = [];
  const hookSrv = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { got.push({ ev: req.headers['x-smartchat-event'], sig: req.headers['x-smartchat-signature'], body: b }); res.end('ok'); }); });
  await new Promise(r => hookSrv.listen(4013, r));
  await api('PUT', '/api/sites/' + siteId, { settings: { integrations: { webhooks: [{ id: 'w1', url: 'http://127.0.0.1:4013/h', secret: 's3', events: ['ticket.created'], enabled: true }] } } }, T);
  await api('POST', '/api/tickets', { site_id: siteId, type: 'suggestion', name: 'علي', phone: '0500000009', text: 'اقتراح للتجربة' }, T); await wait(300);
  const hk = got.find(g => g.ev === 'ticket.created');
  ok(hk && hk.sig === 'sha256=' + require('crypto').createHmac('sha256', 's3').update(hk.body).digest('hex'), 'signed webhook sent on new ticket');
  hookSrv.close();

  // ---------------- backup / restore / reset
  const bk = await api('GET', '/api/backup/download', null, T);
  ok(bk.s === 200 && bk.buf[0] === 0x1f && bk.buf.length > 500, 'full backup download');
  await api('POST', '/api/kb-categories', { site_id: siteId, name: 'مؤقت' }, T);
  const rs = await api('POST', '/api/backup/restore', null, T, bk.buf);
  ok(rs.s === 200 && !(await api('GET', `/api/mindmap?site=${siteId}`, null, T)).j.categories.some(c => c.name === 'مؤقت'), 'restore from a backup file');
  ok((await api('POST', '/api/backup/restore', null, T, Buffer.from('garbage'))).s === 400, 'invalid backup rejected');
  await api('PUT', '/api/backups/config', { enabled: true, frequency: 'daily', keep: 3 }, T);
  const made = (await api('POST', '/api/backups', {}, T)).j;
  const blist = (await api('GET', '/api/backups', null, T)).j;
  ok(blist.config.enabled && blist.files.some(f => f.name === made.name), 'stored backups in a folder + schedule');
  ok((await api('POST', '/api/reset', { password: 'wrong', confirm: 'تصفير', scope: { settings: true } }, T)).s === 400, 'reset needs the password');
  const rr = await api('POST', '/api/reset', { password: 'admin123', confirm: 'تصفير', scope: { conversations: true, tickets: true, knowledge: true, media: true, users: true, settings: true, logs: true } }, T);
  const after = (await api('GET', '/api/sites', null, T)).j;
  ok(rr.s === 200 && after.length === 1 && after[0].key !== key && (await api('GET', '/api/users', null, T)).j.length === 1, 'factory reset (new site key = old link removed, users cleared)');
  ok((await api('GET', '/api/backups', null, T)).j.files.some(f => f.kind === 'pre-reset'), 'automatic safety backup before reset');

  console.log(`\n${pass} checks passed ✅`);
  process.exit(0);
})().catch(e => { console.error('❌', e); process.exit(1); });
