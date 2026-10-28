/* Live chat + shared conversation rendering */
(function () {
  'use strict';
  var A = App, S = A.state, esc = A.esc;

  A.fmtBody = function (s) {
    return esc(s || '').replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  };
  // Translation on request only: nothing is sent anywhere automatically. The employee clicks and the text opens
  // in Google Translate in a new tab (their own browser), so visitors' messages never leave the system by themselves.
  A.LANG_NAMES = { ar: 'العربية', en: 'English', ur: 'اردو' };
  A.translateUrl = function (text, from, to) { return 'https://translate.google.com/?sl=' + (from || 'auto') + '&tl=' + to + '&text=' + encodeURIComponent(String(text || '').slice(0, 4500)) + '&op=translate'; };
  // a message mostly in Latin letters, or with letters only Urdu uses, is not Arabic
  A.isForeign = function (t) {
    t = String(t || ''); if (/[ےۓںٹڈڑ]/.test(t)) return true;
    var lat = (t.match(/[A-Za-z]/g) || []).length, ar = (t.match(/[\u0600-\u06FF]/g) || []).length;
    return lat >= 3 && lat > ar;
  };
  A.renderMsg = function (m) {
    if (m.sender === 'system') return '<div class="sysm"><bdi>' + A.fmtBody(m.body) + '</bdi>' + ' · <span class="tiny">' + A.fmtTime(m.created_at) + '</span></div>';
    var side = m.sender === 'visitor' ? 'them' : 'me';
    var who = m.sender === 'visitor' ? 'المستفيد' : m.sender === 'bot' ? '🤖 البوت' : '👤 ' + (m.agent_name || 'موظف');
    var extra = '';
    if (m.media && m.media.length) extra += '<div class="att">' + m.media.map(function (f) {
      return f.type === 'image' ? '<a href="' + esc(f.url) + '" target="_blank"><img src="' + esc(f.url) + '"></a>' : '<a class="file" href="' + esc(f.url) + '" target="_blank">' + ({ video: '🎬', pdf: '📄', youtube: '▶️' }[f.type] || '🔗') + ' ' + esc(f.name || f.type) + '</a>';
    }).join('') + '</div>';
    if (m.location) extra += '<div class="att"><a class="file" href="' + esc(m.location.url) + '" target="_blank">📍 ' + esc(m.location.label || 'الموقع على الخريطة') + '</a></div>';
    if (m.contacts) extra += '<div class="att">' + m.contacts.map(function (c) { return '<a class="file" href="' + esc(c.href) + '" target="_blank">' + esc(c.icon || '') + ' ' + esc(c.value) + '</a>'; }).join('') + '</div>';
    if (m.link) extra += '<div class="att"><a class="file" href="' + esc(m.link) + '" target="_blank">🔗 ' + esc(m.link) + '</a></div>';
    if (m.form) extra += '<div class="att"><span class="file">📝 نموذج ' + esc(m.form.title || '') + (m.form.submitted ? ' — ✅ ' + esc(m.form.submitted) : ' — لم يُرسل') + '</span></div>';
    if (m.options && m.options.length) extra += '<div class="opts">' + m.options.map(function (o, i) { return '<span>' + (m.numbered ? (i + 1) + '. ' : '') + esc(o.label) + '</span>'; }).join('') + '</div>';
    if (m.sender === 'visitor' && m.body && A.isForeign(m.body)) extra += '<a class="trl" href="' + esc(A.translateUrl(m.body, 'auto', 'ar')) + '" target="_blank" rel="noopener noreferrer">🌐 ترجمة للعربية</a>';
    return '<div class="m ' + side + ' ' + m.sender + '"><div style="min-width:0"><div class="who">' + who + ' · ' + A.fmtTime(m.created_at) + '</div><div class="bb"><div dir="auto">' + A.fmtBody(m.body) + '</div>' + extra + '</div></div></div>';
  };

  A.page('live', {
    title: 'المحادثات المباشرة', icon: '💬', full: true,
    render: function (root, sub) {
      var filter = 'all', q = '', active = null, detail = null, attach = [], typingT = null;
      root.innerHTML = '<div class="live" id="live"><div class="list"><div class="lh"><div class="seg" id="lf">' +
        [['all', 'الكل'], ['waiting', '📞 بانتظار'], ['mine', 'محادثاتي'], ['bot', '🤖 مع البوت']].map(function (x) { return '<button data-f="' + x[0] + '" class="' + (x[0] === filter ? 'on' : '') + '">' + x[1] + ' <span data-c="' + x[0] + '"></span></button>'; }).join('') +
        '</div><input class="in" id="lq" placeholder="🔎 بحث بالاسم أو الجوال أو النص"></div><div class="items" id="items"></div></div>' +
        '<section class="chat" id="chat"></section><aside class="info" id="info"></aside></div>';
      var live = A.$('#live'), items = A.$('#items'), chat = A.$('#chat'), info = A.$('#info');

      function list() {
        var all = Object.values(S.convs).filter(function (c) { return !S.site || c.site_id === S.site.id; });
        var counts = { all: all.length, waiting: 0, mine: 0, bot: 0 };
        all.forEach(function (c) { if (c.status === 'waiting') counts.waiting++; if (c.status === 'human' && c.assigned_to === S.me.id) counts.mine++; if (c.status === 'bot') counts.bot++; });
        A.$$('[data-c]', root).forEach(function (s) { var n = counts[s.getAttribute('data-c')]; s.textContent = n ? '(' + n + ')' : ''; });
        var rows = all.filter(function (c) {
          if (filter === 'waiting' && c.status !== 'waiting') return false;
          if (filter === 'mine' && !(c.status === 'human' && c.assigned_to === S.me.id)) return false;
          if (filter === 'bot' && c.status !== 'bot') return false;
          if (q) { var hay = [c.visitor_name, c.visitor_phone, c.visitor_email, c.id, c.last_message && c.last_message.body].join(' ').toLowerCase(); if (hay.indexOf(q) < 0) return false; }
          return true;
        }).sort(function (a, b) {
          var w = function (c) { return c.status === 'waiting' ? 0 : c.status === 'human' && c.assigned_to === S.me.id ? 1 : c.status === 'human' ? 2 : c.status === 'bot' ? 3 : 4; };
          return w(a) - w(b) || (b.updated_at > a.updated_at ? 1 : -1);
        });
        if (active && S.convs[active]) { /* keep */ }
        items.innerHTML = rows.length ? rows.map(function (c) {
          var un = S.unread[c.id];
          return '<div class="citem ' + (c.id === active ? 'on ' : '') + (c.status === 'waiting' ? 'ringing' : '') + '" data-id="' + c.id + '">' + A.avatar({ name: c.visitor_name || 'زائر' }) +
            '<div class="grow" style="min-width:0"><div class="row between"><span class="nm">' + (c.status === 'waiting' ? '📞 ' : '') + esc(c.visitor_name || 'زائر #' + c.id) + '</span><span class="tm">' + A.ago(c.updated_at) + '</span></div>' +
            '<div class="lm">' + (c.status === 'waiting' && c.pending_question ? '❓ ' + esc(c.pending_question) : c.last_message ? (c.last_message.sender === 'agent' ? 'أنت: ' : c.last_message.sender === 'bot' ? '🤖 ' : '') + esc(c.last_message.body) : '') + '</div>' +
            '<div class="row" style="margin-top:4px;gap:6px">' + A.tag(A.CONV, c.status) + (c.agent_name && c.status === 'human' ? '<span class="tiny muted">👤 ' + esc(c.agent_name) + '</span>' : '') + (c.lang && c.lang !== 'ar' ? '<span class="tag gray">' + c.lang.toUpperCase() + '</span>' : '') + '<span class="grow"></span>' + (un ? '<span class="unread">' + un + '</span>' : '') + '</div></div></div>';
        }).join('') : '<div class="empty"><div class="ic">☕</div>' + (filter === 'waiting' ? 'لا يوجد أحد في الانتظار' : 'لا توجد محادثات نشطة حالياً') + '<div class="tiny" style="margin-top:6px">ستظهر المحادثات الجديدة هنا تلقائياً مع تنبيه صوتي</div></div>';
        A.$$('.citem', items).forEach(function (el) { el.onclick = function () { location.hash = '#/live/' + el.getAttribute('data-id'); }; });
      }

      function empty() {
        live.classList.remove('has-conv'); active = null; A.activeConv = null;
        chat.innerHTML = '<div class="empty" style="margin:auto"><div class="ic">💬</div><h3>اختر محادثة من القائمة</h3><p class="muted small">المحادثات التي تنتظر موظفاً تظهر في الأعلى باللون البرتقالي مع رنين متكرر حتى يتم الرد.</p></div>';
        info.innerHTML = '<div class="col"><div class="section-title"><h2>المتصلون الآن</h2></div><div id="onl"></div></div>';
        drawOnline();
      }
      function drawOnline() {
        var el = A.$('#onl'); if (!el) return;
        el.innerHTML = S.online.length ? S.online.map(function (u) { return '<div class="row" style="margin-bottom:8px">' + A.avatar(u, 'sm') + '<div><b class="small">' + esc(u.name) + '</b><div class="tiny muted">' + esc(u.title || A.ROLE[u.role]) + '</div></div><span class="dot on" style="margin-inline-start:auto"></span></div>'; }).join('') : '<p class="muted small">لا يوجد</p>';
      }

      function open(id) {
        active = id; A.activeConv = id; delete S.unread[id]; attach = [];
        live.classList.add('has-conv');
        chat.innerHTML = '<div class="empty" style="margin:auto">جارٍ التحميل…</div>';
        A.GET('/api/conversations/' + id).then(function (d) { if (active !== id) return; detail = d; drawChat(); drawInfo(); list(); }).catch(function (e) { A.fail(e); empty(); });
      }

      function drawChat() {
        var c = detail, mineConv = c.status === 'human' && c.assigned_to === S.me.id, closed = c.status === 'closed';
        var others = S.users.filter(function (u) { return u.id !== S.me.id && u.active !== 0; });
        chat.innerHTML = (c.status === 'waiting' ? '<div class="ring-banner"><span class="ph">📞</span><span class="grow">المستفيد ينتظر موظفاً منذ ' + A.ago(c.handoff_at) + ' — الرنين مستمر حتى يتم الرد</span><button class="btn gold" id="take2">📞 رد الآن</button></div>' : '') +
          '<div class="ch"><button class="btn ghost icon" id="back" title="رجوع">→</button>' + A.avatar({ name: c.visitor_name || 'زائر' }) + '<div class="grow" style="min-width:0"><b>' + esc(c.visitor_name || 'زائر #' + c.id) + '</b> ' + (c.verified ? '<span class="tag green">✔ موثّق</span>' : '') +
          '<div class="tiny muted">' + A.tag(A.CONV, c.status) + ' ' + (c.agent_name ? '👤 ' + esc(c.agent_name) + ' · ' : '') + '#' + c.id + ' · ' + (A.LANG[c.lang] || c.lang) + '</div></div>' +
          '<div class="row wrap" style="gap:6px">' +
          (!closed && !mineConv ? '<button class="btn sm" id="take">✋ استلام المحادثة</button>' : '') +
          (!closed && others.length ? '<select class="in" id="tr" style="width:auto;padding:5px 8px;font-size:12.5px"><option value="">↪️ تحويل إلى…</option>' + others.map(function (u) { var on = S.online.some(function (o) { return o.id === u.id; }); return '<option value="' + u.id + '">' + (on ? '🟢 ' : '⚪ ') + esc(u.name) + '</option>'; }).join('') + '</select>' : '') +
          (!closed && c.status !== 'bot' ? '<button class="btn sm ghost" id="tobot">🤖 إعادة للبوت</button>' : '') +
          '<button class="btn sm ghost" id="exp" title="تصدير">⬇️</button>' +
          (!closed ? '<button class="btn sm danger ghost" id="close">إنهاء</button>' : '') + '</div></div>' +
          '<div class="msgs" id="msgs">' + c.messages.map(A.renderMsg).join('') + '<div class="sysm hidden" id="vtyping">✍️ المستفيد يكتب…</div></div>' +
          (closed ? '<div class="composer"><div class="alert info">هذه المحادثة مغلقة' + (c.closed_by ? ' — أنهاها ' + A.BY[c.closed_by] : '') + (c.rating != null ? ' · التقييم: ' + A.stars(c.rating, c.rating_max) : '') + '</div></div>' :
            '<div class="composer">' + (c.pending && c.pending.length ? '<div class="pending">❓ <b>سؤال المستفيد:</b> ' + esc(c.pending[c.pending.length - 1]) + '<div class="tiny" style="margin-top:3px">ردّك القادم سيُحفظ كإجابة لهذا السؤال في قاعدة المعرفة ليجيب عنه البوت تلقائياً مستقبلاً.</div></div>' : '') +
            (c.lang && c.lang !== 'ar' ? '<div class="langbar">🌐 المستفيد اختار <b>' + esc(A.LANG_NAMES[c.lang] || c.lang) + '</b> — ردّك يصله كما تكتبه. اكتب بالعربية ثم اضغط «ترجم ردّي» وانسخ الترجمة هنا.</div>' : '') +
            '<div class="chips" id="chips"></div><textarea id="ta" placeholder="' + (mineConv ? 'اكتب ردك… (Enter للإرسال، Shift+Enter لسطر جديد)' : 'اكتب ردك لاستلام المحادثة والرد مباشرة…') + '"></textarea>' +
            '<div class="tools"><button class="btn sm ghost" id="att">📎 إرفاق</button><button class="btn sm ghost" id="qr">⚡ ردود جاهزة</button>' + (c.lang && c.lang !== 'ar' ? '<button class="btn sm ghost" id="trr" title="يفتح الترجمة في نافذة جديدة">🌐 ترجم ردّي إلى ' + esc(A.LANG_NAMES[c.lang] || c.lang) + '</button>' : '') + '<label class="switch" title="حفظ الرد في قاعدة المعرفة"><input type="checkbox" id="learn"' + (S.site && S.site.settings.behavior.auto_learn !== false ? ' checked' : '') + '><span class="tr"></span><span class="lbl small">🧠 تعلّم من ردّي</span></label><span class="grow"></span><button class="btn" id="send">إرسال ➤</button></div></div>');
        var msgs = A.$('#msgs'); msgs.scrollTop = msgs.scrollHeight;
        A.$('#back').onclick = function () { location.hash = '#/live'; };
        var take = function () { A.socket.emit('take', { id: c.id }, function (r) { if (r && r.error) A.fail(new Error('تعذر الاستلام')); else open(c.id); }); };
        if (A.$('#take')) A.$('#take').onclick = take;
        if (A.$('#take2')) A.$('#take2').onclick = take;
        if (A.$('#tr')) A.$('#tr').onchange = function () { var to = Number(this.value); if (!to) return; A.socket.emit('transfer', { id: c.id, to: to }, function (r) { if (r && r.error) A.fail(new Error('تعذر التحويل')); else { A.toast('تم التحويل', 'ok'); open(c.id); } }); };
        if (A.$('#tobot')) A.$('#tobot').onclick = function () { A.socket.emit('return_to_bot', { id: c.id }, function () { open(c.id); }); };
        if (A.$('#close')) A.$('#close').onclick = function () { A.confirm('إنهاء هذه المحادثة؟ سيظهر للمستفيد طلب التقييم.').then(function (ok) { if (ok) A.socket.emit('close', { id: c.id }, function () { open(c.id); }); }); };
        A.$('#exp').onclick = function () { A.download('/api/conversations/' + c.id + '/export'); };
        if (closed) return;
        var ta = A.$('#ta');
        var drawChips = function () { A.$('#chips').innerHTML = attach.map(function (f, i) { return '<span class="chip">' + ({ image: '🖼️', video: '🎬', pdf: '📄' }[f.type] || '🔗') + ' ' + esc(f.name) + '<button data-i="' + i + '">✕</button></span>'; }).join(''); A.$$('#chips button').forEach(function (b) { b.onclick = function () { attach.splice(Number(b.getAttribute('data-i')), 1); drawChips(); }; }); };
        drawChips();
        A.$('#att').onclick = function () { A.pickFile('image/*,video/mp4,video/webm,application/pdf', true).then(function (fs) { fs.forEach(function (f) { A.upload(f).then(function (r) { attach.push(r); drawChips(); }, A.fail); }); }); };
        A.$('#qr').onclick = function (e) { quickReplies(e.target, ta); };
        if (A.$('#trr')) A.$('#trr').onclick = function () { if (!ta.value.trim()) { A.toast('اكتب ردّك بالعربية أولاً', 'warn'); return ta.focus(); } window.open(A.translateUrl(ta.value, 'ar', c.lang), '_blank', 'noopener'); };
        var send = function () {
          var text = ta.value.trim(); if (!text && !attach.length) return;
          A.$('#send').disabled = true;
          A.socket.emit('send', { id: c.id, text: text, media: attach, learn: A.$('#learn').checked }, function (r) {
            var sb = A.$('#send'); if (sb) sb.disabled = false;
            if (r && r.error) return A.fail(new Error(r.error === 'assigned' ? 'المحادثة مستلمة من موظف آخر' : 'تعذر الإرسال'));
            var ta3 = A.$('#ta'); if (ta3) ta3.value = ''; attach = []; if (A.$('#chips')) drawChips();
            if (r && r.learned) A.toast('🧠 تم حفظ السؤال والإجابة في قاعدة المعرفة', 'ok');
            if (detail.status !== 'human' || detail.assigned_to !== S.me.id || (detail.pending && detail.pending.length)) open(c.id);
          });
        };
        A.$('#send').onclick = send;
        ta.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
        ta.oninput = function () {
          ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight) + 'px';
          if (detail.status === 'human') { A.socket.emit('typing', { id: c.id, typing: true }); clearTimeout(typingT); typingT = setTimeout(function () { A.socket.emit('typing', { id: c.id, typing: false }); }, 1800); }
        };
        if (mineConv) ta.focus();
      }

      function quickReplies(btn, ta) {
        A.GET('/api/kb?site=' + S.site.id).then(function (kb) {
          var m = A.modal({ title: '⚡ ردود جاهزة من قاعدة المعرفة', size: 'wide', body: '<input class="in" id="qq" placeholder="ابحث…" style="margin-bottom:10px"><div id="ql" style="max-height:55vh;overflow:auto"></div>' });
          var draw = function (s) {
            s = (s || '').toLowerCase();
            m.body.querySelector('#ql').innerHTML = kb.filter(function (k) { return !s || (k.question + ' ' + k.answer).toLowerCase().indexOf(s) >= 0; }).slice(0, 80).map(function (k) {
              return '<div class="card flat" style="padding:10px;margin-bottom:8px;cursor:pointer" data-id="' + k.id + '"><b class="small">' + esc(k.question) + '</b><div class="small muted" style="white-space:pre-wrap">' + esc(k.answer.slice(0, 220)) + '</div></div>';
            }).join('') || '<div class="empty">لا نتائج</div>';
            A.$$('[data-id]', m.body).forEach(function (el) { el.onclick = function () { var k = kb.find(function (x) { return x.id === Number(el.getAttribute('data-id')); }); ta.value = k.answer; (k.media || []).forEach(function (f) { attach.push(f); }); m.close(); ta.focus(); ta.dispatchEvent(new Event('input')); drawChat(); A.$('#ta').value = k.answer; }; });
          };
          draw(); m.body.querySelector('#qq').oninput = function () { draw(this.value); };
        }).catch(A.fail);
      }

      function drawInfo() {
        var c = detail, meta = c.meta || {}, cust = meta.customer || null;
        info.innerHTML = '<div class="col" style="gap:16px"><div style="text-align:center">' + A.avatar({ name: c.visitor_name || 'زائر' }, 'lg') + '<h3 style="margin-top:8px">' + esc(c.visitor_name || 'زائر') + '</h3><div class="small muted">' + A.tag(A.CONV, c.status) + '</div></div>' +
          '<div><div class="section-title"><h2>بيانات المستفيد</h2></div><dl>' +
          '<dt>الجوال</dt><dd class="ltr">' + (c.visitor_phone ? '<a href="tel:' + esc(c.visitor_phone) + '">' + esc(c.visitor_phone) + '</a> <a href="https://wa.me/' + esc(c.visitor_phone.replace(/^0/, '966').replace(/\D/g, '')) + '" target="_blank" title="واتساب">🟢</a>' : '—') + '</dd>' +
          '<dt>البريد</dt><dd class="ltr">' + esc(c.visitor_email || '—') + '</dd><dt>اللغة</dt><dd>' + (A.LANG[c.lang] || c.lang) + '</dd>' +
          '<dt>الصفحة</dt><dd class="ltr tiny">' + (c.page_url ? '<a href="' + esc(c.page_url) + '" target="_blank">' + esc(c.page_url.replace(/^https?:\/\//, '').slice(0, 50)) + '</a>' : '—') + '</dd>' +
          '<dt>البداية</dt><dd>' + A.fmtDate(c.created_at) + '</dd>' + (c.handoff_at ? '<dt>طلب موظف</dt><dd>' + A.fmtDate(c.handoff_at) + '</dd>' : '') +
          (c.first_response_at ? '<dt>أول رد</dt><dd>' + A.dur((new Date(c.first_response_at) - new Date(c.handoff_at)) / 1000) + '</dd>' : '') + '</dl></div>' +
          (cust ? '<div><div class="section-title"><h2>من قاعدة البيانات</h2></div><dl>' + Object.keys(cust).map(function (k) { return '<dt>' + esc(k) + '</dt><dd>' + esc(cust[k]) + '</dd>'; }).join('') + '</dl></div>' : '') +
          (c.pending && c.pending.length ? '<div><div class="section-title"><h2>أسئلة بانتظار الإجابة</h2></div>' + c.pending.map(function (p) { return '<div class="pending">' + esc(p) + '</div>'; }).join('') + '</div>' : '') +
          '<div><div class="section-title"><h2>الشكاوى والاقتراحات</h2></div>' + (c.tickets.length ? c.tickets.map(function (t) { return '<a href="#/tickets/' + t.id + '" class="row" style="text-decoration:none;color:inherit;margin-bottom:6px">' + A.tag(A.TK_TYPE, t.type) + '<b class="small ltr">' + esc(t.number) + '</b>' + A.tag(A.TK_STATUS, t.status) + '</a>'; }).join('') : '<p class="small muted" style="margin:0">لا يوجد</p>') +
          (c.status !== 'closed' ? '<button class="btn sm ghost" id="newtk" style="margin-top:6px">+ تسجيل شكوى/اقتراح نيابة عنه</button>' : '') + '</div>' +
          '<div><div class="section-title"><h2>محادثات سابقة</h2></div>' + (c.previous.length ? c.previous.map(function (p) { return '<div class="row small" style="margin-bottom:6px"><a href="#/history/' + p.id + '">#' + p.id + '</a><span class="muted">' + A.fmtDate(p.created_at, false) + '</span>' + (p.rating != null ? A.stars(p.rating, c.rating_max) : '') + '</div>'; }).join('') : '<p class="small muted" style="margin:0">لا يوجد</p>') + '</div>' +
          (c.rating != null ? '<div><div class="section-title"><h2>التقييم</h2></div>' + A.stars(c.rating, c.rating_max) + (c.rating_comment ? '<p class="small">"' + esc(c.rating_comment) + '"</p>' : '') + '</div>' : '') + '</div>';
        var nt = A.$('#newtk'); if (nt) nt.onclick = function () { A.newTicket({ name: c.visitor_name, phone: c.visitor_phone, email: c.visitor_email }); };
      }

      var onConvs = function () { list(); if (A.current === 'live' && !active) drawOnline(); };
      var onConv = function (c) {
        if (active === c.id && detail && (c.status !== detail.status || c.assigned_to !== detail.assigned_to)) open(c.id);
      };
      var onMsg = function (m) {
        list();
        if (m.conversation_id !== active || !detail) return;
        detail.messages.push(m);
        if (m.sender === 'visitor' && detail.status !== 'bot') { detail.pending = (detail.pending || []).concat([m.body]); }
        var msgs = A.$('#msgs'); if (!msgs) return;
        var t = A.$('#vtyping'); if (t) t.classList.add('hidden');
        var div = document.createElement('div'); div.innerHTML = A.renderMsg(m); msgs.insertBefore(div.firstChild, t);
        msgs.scrollTop = msgs.scrollHeight;
        if (m.sender === 'visitor' && detail.status !== 'bot' && !A.$('.pending')) { var ta = A.$('#ta'); var v = ta ? ta.value : ''; drawChat(); if (A.$('#ta')) A.$('#ta').value = v; }
      };
      var onTyping = function (t) { if (t.conversation_id !== active) return; var el = A.$('#vtyping'); if (el) { el.classList.toggle('hidden', !t.typing); if (t.typing) { el.textContent = '✍️ المستفيد يكتب… ' + (t.text ? '"' + t.text.slice(-60) + '"' : ''); var ms = A.$('#msgs'); ms.scrollTop = ms.scrollHeight; } } };
      var onRated = function (c) { if (c.id === active) open(c.id); };

      A.$$('#lf button').forEach(function (b) { b.onclick = function () { filter = b.getAttribute('data-f'); A.$$('#lf button').forEach(function (x) { x.classList.toggle('on', x === b); }); list(); }; });
      A.$('#lq').oninput = A.debounce(function () { q = this.value.trim().toLowerCase(); list(); }, 150);
      A.on('convs', onConvs); A.on('conv', onConv); A.on('message', onMsg); A.on('typing', onTyping); A.on('rated', onRated); A.on('online', drawOnline);
      list();
      if (sub[0]) open(Number(sub[0])); else empty();
      this.onSub = function (s) { if (s[0]) open(Number(s[0])); else empty(); };
      return function () { A.off('convs', onConvs); A.off('conv', onConv); A.off('message', onMsg); A.off('typing', onTyping); A.off('rated', onRated); A.off('online', drawOnline); A.activeConv = null; };
    }
  });
})();
