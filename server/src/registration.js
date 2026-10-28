// Programs open for registration: each program has a registration window (from date → to date) and/or a number of places.
// The bot lists only the programs open right now; the visitor registers inside the chat and gets a number (R-1001).
// A program closes by itself when its end date passes or its places are full.
const { db, now } = require('./db');

db.exec(`CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE, program_id TEXT NOT NULL,
  number TEXT, name TEXT, phone TEXT, national_id TEXT, email TEXT, city TEXT, notes TEXT,
  conversation_id INTEGER, status TEXT NOT NULL DEFAULT 'registered', created_at TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_reg_site_prog ON registrations(site_id, program_id, status);`);

const FIELDS = ['name', 'phone', 'national_id', 'email', 'city'];
const riyadhToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const countOf = (siteId, pid) => db.prepare("SELECT COUNT(*) n FROM registrations WHERE site_id=? AND program_id=? AND status='registered'").get(siteId, String(pid)).n;
const capOf = (p) => Math.max(0, Math.floor(Number(p.capacity) || 0)); // 0 = no limit

// open | soon | ended | full | off
function statusOf(siteId, p, today = riyadhToday()) {
  if (!p || p.enabled === false || !String(p.title || '').trim()) return 'off';
  if (p.start && p.start > today) return 'soon';
  if (p.end && p.end < today) return 'ended';
  if (capOf(p) && countOf(siteId, p.id) >= capOf(p)) return 'full';
  return 'open';
}
const cfgOf = (site) => site.settings.registration || {};
const programsOf = (site) => (cfgOf(site).programs || []).filter(p => p && p.id);
const openPrograms = (site) => programsOf(site).filter(p => statusOf(site.id, p) === 'open');
const programOf = (site, id) => programsOf(site).find(p => p.id === String(id));

/* ---------------- texts (Arabic by default; English for English conversations) ---------------- */
const TXT = {
  ar: { hub: 'هذه البرامج المفتوحة للتسجيل الآن 👇', none: 'لا توجد برامج مفتوحة للتسجيل حالياً 🙏 تابعنا لمعرفة البرامج القادمة.', from: '📅 التسجيل من {start}', to: 'حتى {end}', until: '📅 التسجيل مفتوح حتى {end}', left: '👥 المقاعد المتبقية: {n}', register: '📝 سجّل الآن', back: '↩️ البرامج المتاحة', closed: 'عذراً، التسجيل في «{title}» مغلق الآن ({why}).', why_full: 'اكتمل العدد', why_ended: 'انتهت فترة التسجيل', why_soon: 'لم يبدأ التسجيل بعد', ask_name: '👤 اكتب اسمك الكامل:', ask_phone: '📱 اكتب رقم جوالك:', ask_national_id: '🪪 اكتب رقم الهوية / الإقامة (10 أرقام):', ask_email: '✉️ اكتب بريدك الإلكتروني:', ask_city: '🏙️ اكتب مدينتك:', bad_phone: 'رقم الجوال غير صحيح، اكتبه مثل 05xxxxxxxx', bad_national_id: 'رقم الهوية يجب أن يكون 10 أرقام', bad_email: 'البريد الإلكتروني غير صحيح', bad_name: 'اكتب الاسم بشكل صحيح', dup: 'أنت مسجّل مسبقاً في «{title}» برقم *{number}* ✅', done: '✅ تم تسجيلك في «{title}» برقم *{number}*\nسنتواصل معك قريباً بإذن الله.', link: 'التسجيل في «{title}» يتم عبر الرابط التالي 👇', open_link: '📝 فتح رابط التسجيل' },
  en: { hub: 'These programs are open for registration now 👇', none: 'No programs are open for registration right now 🙏', from: '📅 Registration from {start}', to: 'to {end}', until: '📅 Registration open until {end}', left: '👥 Places left: {n}', register: '📝 Register now', back: '↩️ Open programs', closed: 'Sorry, registration for “{title}” is closed ({why}).', why_full: 'all places are taken', why_ended: 'the registration period ended', why_soon: 'registration has not started yet', ask_name: '👤 Your full name:', ask_phone: '📱 Your mobile number:', ask_national_id: '🪪 Your ID number (10 digits):', ask_email: '✉️ Your email:', ask_city: '🏙️ Your city:', bad_phone: 'Invalid mobile number, e.g. 05xxxxxxxx', bad_national_id: 'The ID number must be 10 digits', bad_email: 'Invalid email', bad_name: 'Please write a valid name', dup: 'You are already registered in “{title}” with number *{number}* ✅', done: '✅ You are registered in “{title}” with number *{number}*\nWe will contact you soon.', link: 'Registration for “{title}” is done through this link 👇', open_link: '📝 Open the registration link' }
};
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const T = (conv, site, k) => (conv.lang === 'ar' || !TXT[conv.lang]) ? ((k === 'hub' && cfgOf(site).intro) || (k === 'none' && cfgOf(site).none) || TXT.ar[k]) : TXT[conv.lang][k];
const toLatin = (s) => String(s || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const fmtDate = (d) => d ? d.split('-').reverse().join('/') : '';

/* ---------------- bot ---------------- */
// B = { say(text, options, extra), nav(), save(state patch) }
function hub(conv, site, B) {
  const list = openPrograms(site);
  if (!list.length) return B.say(T(conv, site, 'none'), B.nav());
  return B.say(T(conv, site, 'hub'), [...list.map(p => ({ label: `${p.icon || '📌'} ${p.title}`, action: 'reg_program', target: p.id })), ...B.nav()], { numbered: true });
}
function details(conv, site, B, id) {
  const p = programOf(site, id), st = statusOf(site.id, p);
  if (!p || st === 'off') return hub(conv, site, B);
  if (st !== 'open') return B.say(fill(T(conv, site, 'closed'), { title: p.title, why: T(conv, site, 'why_' + st) }), [{ label: T(conv, site, 'back'), action: 'reg_programs' }, ...B.nav()]);
  const lines = [`${p.icon || '📌'} *${p.title}*`];
  if (p.desc) lines.push('', String(p.desc));
  lines.push('');
  if (p.start && p.end) lines.push(fill(T(conv, site, 'from'), { start: fmtDate(p.start) }) + ' ' + fill(T(conv, site, 'to'), { end: fmtDate(p.end) }));
  else if (p.end) lines.push(fill(T(conv, site, 'until'), { end: fmtDate(p.end) }));
  if (capOf(p)) lines.push(fill(T(conv, site, 'left'), { n: capOf(p) - countOf(site.id, p.id) }));
  return B.say(lines.join('\n').trim(), [{ label: T(conv, site, 'register'), action: 'reg_start', target: p.id }, { label: T(conv, site, 'back'), action: 'reg_programs' }, ...B.nav()]);
}
const asked = (p) => FIELDS.filter(f => (p.ask || { name: true, phone: true })[f]);
function start(conv, site, B, id) {
  const p = programOf(site, id), st = statusOf(site.id, p);
  if (!p || st !== 'open') return details(conv, site, B, id);
  if (p.link && /^https:\/\//.test(p.link) && !asked(p).length) return B.say(fill(T(conv, site, 'link'), { title: p.title }), B.nav(), { link: p.link, link_label: T(conv, site, 'open_link') });
  const fields = asked(p).length ? asked(p) : ['name', 'phone'];
  const values = {};
  if (conv.visitor_name && fields.includes('name')) values.name = conv.visitor_name; // known from the pre-chat form
  if (conv.visitor_phone && fields.includes('phone')) values.phone = conv.visitor_phone;
  B.save({ await: { kind: 'reg', pid: p.id, fields, values, tries: 0 } });
  return next(conv, site, B, { kind: 'reg', pid: p.id, fields, values, tries: 0 });
}
function next(conv, site, B, a) {
  const f = a.fields.find(x => !a.values[x]);
  if (!f) return finish(conv, site, B, a);
  B.save({ await: a });
  return B.say(T(conv, site, 'ask_' + f), [{ label: conv.lang === 'en' ? 'Cancel' : 'إلغاء', action: 'cancel' }]);
}
function clean(f, text) {
  const t = toLatin(text).trim();
  if (f === 'phone') { const d = t.replace(/[^\d+]/g, ''); return /^(\+?966|0)?5\d{8}$/.test(d) || /^\+?\d{9,15}$/.test(d) ? d : null; }
  if (f === 'national_id') { const d = t.replace(/\D/g, ''); return /^[12]\d{9}$/.test(d) ? d : null; }
  if (f === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t.toLowerCase() : null;
  if (f === 'name') return t.length >= 3 && t.length <= 80 && /\p{L}/u.test(t) ? t : null;
  return t.length >= 2 && t.length <= 80 ? t : null;
}
function answer(conv, site, B, text) {
  const a = conv.state.await, f = a.fields.find(x => !a.values[x]);
  if (!f) return finish(conv, site, B, a);
  const v = clean(f, text);
  if (v == null) {
    a.tries = (a.tries || 0) + 1;
    if (a.tries >= 3) { B.save({ await: null }); return B.say(conv.lang === 'en' ? 'Registration cancelled. You can try again any time.' : 'تم إلغاء التسجيل، يمكنك المحاولة مرة أخرى في أي وقت.', [{ label: T(conv, site, 'back'), action: 'reg_programs' }, ...B.nav()]); }
    B.save({ await: a });
    return B.say(T(conv, site, 'bad_' + f) || T(conv, site, 'bad_name'), [{ label: conv.lang === 'en' ? 'Cancel' : 'إلغاء', action: 'cancel' }]);
  }
  a.values[f] = v; a.tries = 0;
  return next(conv, site, B, a);
}
function finish(conv, site, B, a) {
  B.save({ await: null });
  const p = programOf(site, a.pid), st = statusOf(site.id, p);
  if (!p || st !== 'open') return details(conv, site, B, a.pid); // e.g. the last place was taken meanwhile
  const v = a.values, last9 = (x) => String(x || '').replace(/\D/g, '').slice(-9);
  const dup = db.prepare("SELECT * FROM registrations WHERE site_id=? AND program_id=? AND status='registered'").all(site.id, p.id)
    .find(r => (v.phone && last9(r.phone) && last9(r.phone) === last9(v.phone)) || (v.national_id && r.national_id === v.national_id));
  if (dup) return B.say(fill(T(conv, site, 'dup'), { title: p.title, number: dup.number }), B.nav());
  const id = db.prepare('INSERT INTO registrations(site_id,program_id,name,phone,national_id,email,city,conversation_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(site.id, p.id, v.name || '', v.phone || '', v.national_id || '', v.email || '', v.city || '', conv.id, 'registered', now(), now()).lastInsertRowid;
  const number = 'R-' + (1000 + Number(id));
  db.prepare('UPDATE registrations SET number=? WHERE id=?').run(number, id);
  const msg = (conv.lang === 'ar' && p.done_msg) ? fill(p.done_msg, { title: p.title, number, name: v.name || '' }) : fill(T(conv, site, 'done'), { title: p.title, number });
  return B.say(msg, B.nav(), p.link && /^https:\/\//.test(p.link) ? { link: p.link, link_label: T(conv, site, 'open_link') } : {});
}

// «البرامج المتاحة» / «أبي أسجل في برنامج …» — only when something is open
const HUB_WORDS = ['البرامج المتاحه', 'البرامج المتاحة', 'برامج التسجيل', 'التسجيل في البرامج', 'التسجيل في برنامج', 'ابي اسجل في', 'أبي أسجل في', 'ابغى اسجل في', 'ابغا اسجل في', 'اريد التسجيل في', 'أريد التسجيل في', 'open programs', 'register for a program'];
function textIntent(conv, site, B, text, nlp) {
  const list = openPrograms(site); if (!list.length) return false;
  const n = nlp.normalize(text);
  const prog = list.find(p => p.title && n.includes(nlp.normalize(p.title)) && /سجل|تسجيل|اسجل|register/i.test(text));
  if (prog) { details(conv, site, B, prog.id); return true; }
  if (HUB_WORDS.some(w => n.includes(nlp.normalize(w)))) { hub(conv, site, B); return true; }
  return false;
}

module.exports = { FIELDS, statusOf, openPrograms, programOf, programsOf, countOf, hub, details, start, answer, textIntent, riyadhToday };
