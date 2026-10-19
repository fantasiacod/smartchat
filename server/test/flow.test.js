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
    org: { name: 'جمعية البر بالمدينة المنورة', history: 'تأسست الجمعية عام 1395هـ لخدمة المستفيدين.', unified_number: '920000000', email: 'info@example.org',
      map_url: 'https://www.google.com/maps/@24.4672,39.6111,15z', address: 'المدينة المنورة', hours: 'الأحد - الخميس 8ص - 4م',
      departments: [{ name: 'رعاية المستفيدين', phones: '0546765208, 0561687456' }], social: { x: '@biralmadinah' },
      custom: [{ id: 'aid', title: 'طلب معونة', keywords: 'معونة, طلب مساعدة', answer: 'يمكنك تقديم طلب المعونة عبر الرابط.', media: [{ type: 'pdf', url: 'https://example.org/guide.pdf', name: 'دليل التسجيل' }] }] },
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
  await v.say('١'); // Arabic digit -> option 1 = location
  ok(v.last().location?.lat === 24.4672 && /maps/.test(v.last().location.embed), 'typed number 1 -> map location sent inside the chat');
  await v.say('وين موقعكم؟');
  ok(v.last().location, 'free text "وين موقعكم" -> location');
  await v.say('ابغى اعرف تاريخ الجمعية');
  ok(/1395/.test(v.last().body), 'history question -> organisation history');
  await v.say('كم الرقم الموحد');
  ok(v.last().contacts?.some(c => c.value === '920000000'), 'contact question -> unified number + department phones');
  await v.say('ابغى طلب معونة');
  ok(/المعونة/.test(v.last().body) && v.last().media?.[0].type === 'pdf', 'custom info card with PDF attachment');
  await v.say('من برمج هذا البوت؟');
  ok(/فانتازيا كود/.test(v.last().body) && v.last().link === 'https://example.com/store', 'developer question -> developer link');

  // ---------------- complaint
  await v.say('5'); // complaints & suggestions menu
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
  await v2.say('٦'); // talk to agent
  ok(v2.status === 'waiting', 'menu option 6 -> waiting for agent');
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
  ok(/Hello/.test(ve.msgs[0].body) && /Our location/.test(ve.last().options[0].label), 'English conversation');
  const vu = visitor(key, 'vu', 'ur');
  await vu.join(); await vu.emit('start', { lang: 'ur' }); await wait(150);
  ok(/السلام علیکم/.test(vu.msgs[0].body) && /ہمارا مقام/.test(vu.last().options[0].label), 'Urdu conversation');

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

  console.log(`\n${pass} checks passed ✅`);
  process.exit(0);
})().catch(e => { console.error('❌', e); process.exit(1); });
