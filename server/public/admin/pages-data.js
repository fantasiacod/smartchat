/* History, tickets, statistics, reports, knowledge base */
(function () {
  'use strict';
  var A = App, S = A.state, esc = A.esc;
  var C = { green: '#16a34a', gold: '#bc9525', blue: '#2563eb', red: '#dc2626', purple: '#7c3aed', gray: '#94a3b8', amber: '#d97706', teal: '#0d9488' };

  function rangeBar(state, onChange, opts) {
    opts = opts || {};
    var html = '<div class="row wrap" style="gap:8px"><div class="seg" data-rg>' + [['7', '7 أيام'], ['30', '30 يوماً'], ['90', '3 أشهر'], ['365', 'سنة'], ['custom', 'مخصص']].map(function (x) { return '<button data-d="' + x[0] + '" class="' + (String(state.days) === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<span class="row' + (state.days === 'custom' ? '' : ' hidden') + '" data-cust style="gap:6px"><input type="date" class="in" data-from style="width:auto" value="' + (state.from || A.today(-30)) + '"><span class="muted">إلى</span><input type="date" class="in" data-to style="width:auto" value="' + (state.to || A.today()) + '"></span></div>';
    var wrap = document.createElement('div'); wrap.innerHTML = html;
    var cust = wrap.querySelector('[data-cust]');
    A.$$('[data-d]', wrap).forEach(function (b) {
      b.onclick = function () {
        state.days = b.getAttribute('data-d'); A.$$('[data-d]', wrap).forEach(function (x) { x.classList.toggle('on', x === b); });
        cust.classList.toggle('hidden', state.days !== 'custom');
        if (state.days === 'custom') { state.from = wrap.querySelector('[data-from]').value; state.to = wrap.querySelector('[data-to]').value; }
        onChange();
      };
    });
    A.$$('input[type=date]', wrap).forEach(function (i) { i.onchange = function () { state.from = wrap.querySelector('[data-from]').value; state.to = wrap.querySelector('[data-to]').value; onChange(); }; });
    return wrap.firstChild;
  }
  function rq(state) { return state.days === 'custom' ? '&from=' + state.from + '&to=' + state.to : '&days=' + state.days; }
  A.rangeBar = rangeBar; A.rq = rq;

  function kpi(icon, label, val, foot, color) {
    return '<div class="card kpi" style="--c:' + (color || 'var(--accent)') + '"><div class="ic">' + icon + '</div><div class="lbl">' + label + '</div><div class="val">' + val + '</div>' + (foot ? '<div class="foot">' + foot + '</div>' : '') + '</div>';
  }
  A.kpi = kpi;

  /* ============================== history ============================== */
  A.openConversation = function (id) {
    A.GET('/api/conversations/' + id).then(function (c) {
      var m = A.modal({
        title: '💬 محادثة #' + c.id + ' — ' + esc(c.visitor_name || 'زائر'), size: 'xl',
        body: '<div class="grid" style="grid-template-columns:minmax(0,1fr) 280px;gap:16px" class="viewer"><div class="viewer"><div class="msgs">' + c.messages.map(A.renderMsg).join('') + '</div></div>' +
          '<div class="col" style="font-size:13px"><div class="card flat" style="padding:12px"><dl style="display:grid;grid-template-columns:auto 1fr;gap:6px 10px;margin:0">' +
          '<dt class="muted">الحالة</dt><dd style="margin:0">' + A.tag(A.CONV, c.status) + '</dd>' +
          '<dt class="muted">الجوال</dt><dd style="margin:0" class="ltr">' + esc(c.visitor_phone || '—') + '</dd><dt class="muted">البريد</dt><dd style="margin:0" class="ltr">' + esc(c.visitor_email || '—') + '</dd>' +
          '<dt class="muted">اللغة</dt><dd style="margin:0">' + (A.LANG[c.lang] || c.lang) + '</dd><dt class="muted">الموظف</dt><dd style="margin:0">' + esc(c.agent_name || '—') + '</dd>' +
          '<dt class="muted">البداية</dt><dd style="margin:0">' + A.fmtDate(c.created_at) + '</dd><dt class="muted">النهاية</dt><dd style="margin:0">' + A.fmtDate(c.closed_at) + '</dd>' +
          '<dt class="muted">أنهاها</dt><dd style="margin:0">' + (c.closed_by ? '<b>' + A.BY[c.closed_by] + '</b>' + (c.closed_by_name ? ' (' + esc(c.closed_by_name) + ')' : '') : '—') + '</dd></dl></div>' +
          '<div class="card flat" style="padding:12px"><b>التقييم</b><div style="margin-top:6px">' + A.stars(c.rating, c.rating_max) + '</div>' + (c.rating_comment ? '<p class="small" style="margin:6px 0 0">"' + esc(c.rating_comment) + '"</p>' : '') + '</div>' +
          (c.tickets.length ? '<div class="card flat" style="padding:12px"><b>الطلبات</b>' + c.tickets.map(function (t) { return '<div class="row" style="margin-top:6px">' + A.tag(A.TK_TYPE, t.type) + '<a href="#/tickets/' + t.id + '" class="ltr">' + esc(t.number) + '</a></div>'; }).join('') + '</div>' : '') + '</div></div>',
        buttons: [{ label: '⬇️ تصدير نصي', ghost: true, onClick: function () { A.download('/api/conversations/' + c.id + '/export'); return false; } }]
          .concat(c.status !== 'closed' ? [{ label: 'فتح في المحادثات المباشرة', onClick: function () { location.hash = '#/live/' + c.id; } }] : [])
          .concat(A.can('supervisor') ? [{ label: 'حذف', danger: true, onClick: function (close) { return A.confirm('حذف المحادثة نهائياً؟', true).then(function (ok) { if (!ok) return false; return A.api('DELETE', '/api/conversations/' + c.id).then(function () { A.toast('تم الحذف', 'ok'); A.emit('conv-deleted'); }); }); } }] : [])
          .concat([{ label: 'إغلاق', ghost: true }])
      });
      var ms = m.body.querySelector('.msgs'); ms.scrollTop = ms.scrollHeight;
    }).catch(A.fail);
  };

  A.page('history', {
    title: 'سجل المحادثات', icon: '🗂️',
    render: function (root, sub) {
      var f = { status: '', closed_by: '', rated: '', handoff: '', lang: '', agent: '', q: '', from: '', to: '', page: 1 };
      root.innerHTML = '<div class="grid g4" id="hk" style="margin-bottom:16px"></div><div class="card"><div class="row wrap" style="gap:8px;margin-bottom:14px">' +
        '<input class="in" id="hq" placeholder="🔎 اسم، جوال، بريد، رقم المحادثة أو نص في الرسائل" style="flex:2;min-width:220px">' +
        '<select class="in" id="hs" style="width:auto"><option value="">كل الحالات</option><option value="closed">مغلقة</option><option value="active">نشطة</option><option value="waiting">بانتظار موظف</option></select>' +
        '<select class="in" id="hb" style="width:auto"><option value="">أنهاها: الكل</option><option value="visitor">المستفيد</option><option value="agent">الموظف</option><option value="system">النظام</option></select>' +
        '<select class="in" id="hh" style="width:auto"><option value="">البوت والموظف</option><option value="no">البوت فقط</option><option value="yes">حُوّلت لموظف</option></select>' +
        '<select class="in" id="hr" style="width:auto"><option value="">التقييم: الكل</option><option value="yes">مُقيّمة</option><option value="no">غير مُقيّمة</option></select>' +
        '<select class="in" id="ha" style="width:auto"><option value="">كل الموظفين</option>' + S.users.map(function (u) { return '<option value="' + u.id + '">' + esc(u.name) + '</option>'; }).join('') + '</select>' +
        '<select class="in" id="hl" style="width:auto"><option value="">كل اللغات</option><option value="ar">العربية</option><option value="en">English</option><option value="ur">اردو</option></select>' +
        '<input type="date" class="in" id="hf" style="width:auto" title="من"><input type="date" class="in" id="ht" style="width:auto" title="إلى"></div><div id="hlist"></div></div>';
      var load = function () {
        var qs = Object.keys(f).filter(function (k) { return f[k]; }).map(function (k) { return k + '=' + encodeURIComponent(f[k]); }).join('&');
        A.GET('/api/conversations?site=' + S.site.id + '&limit=25&' + qs).then(function (r) {
          var pages = Math.max(1, Math.ceil(r.total / r.limit));
          A.$('#hlist').innerHTML = r.items.length ? '<div class="tbl-wrap"><table class="t"><thead><tr><th>#</th><th>المستفيد</th><th>آخر رسالة</th><th>الحالة</th><th>الموظف</th><th>أنهاها</th><th>التقييم</th><th>التاريخ</th></tr></thead><tbody>' + r.items.map(function (c) {
            return '<tr class="click" data-id="' + c.id + '"><td class="muted">' + c.id + '</td><td><div class="row">' + A.avatar({ name: c.visitor_name || 'زائر' }, 'sm') + '<div><b>' + esc(c.visitor_name || 'زائر') + '</b><div class="tiny muted ltr">' + esc(c.visitor_phone || c.visitor_email || '') + '</div></div></div></td>' +
              '<td style="max-width:260px"><div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(c.last_message ? c.last_message.body : '') + '</div><span class="tiny muted">' + c.msg_count + ' رسالة · ' + (A.LANG[c.lang] || '') + '</span></td>' +
              '<td>' + A.tag(A.CONV, c.status) + (c.handoff_at ? ' <span class="tag gold">👤</span>' : '') + '</td><td class="small">' + esc(c.agent_name || '—') + '</td>' +
              '<td>' + (c.closed_by ? '<span class="tag ' + ({ visitor: 'blue', agent: 'green', system: 'gray' }[c.closed_by]) + '">' + A.BY[c.closed_by] + '</span>' : '—') + '</td><td>' + A.stars(c.rating, S.site.settings.appearance.rating_max) + '</td><td class="small muted">' + A.fmtDate(c.created_at) + '</td></tr>';
          }).join('') + '</tbody></table></div><div class="row between" style="margin-top:12px"><span class="muted small">' + A.num(r.total) + ' محادثة</span><div class="row"><button class="btn sm ghost" id="pp"' + (f.page <= 1 ? ' disabled' : '') + '>السابق</button><span class="small">' + f.page + ' / ' + pages + '</span><button class="btn sm ghost" id="pn"' + (f.page >= pages ? ' disabled' : '') + '>التالي</button></div></div>'
            : '<div class="empty"><div class="ic">🗂️</div>لا توجد محادثات مطابقة</div>';
          A.$$('#hlist tr[data-id]').forEach(function (tr) { tr.onclick = function () { A.openConversation(Number(tr.getAttribute('data-id'))); }; });
          if (A.$('#pp')) { A.$('#pp').onclick = function () { f.page--; load(); }; A.$('#pn').onclick = function () { f.page++; load(); }; }
        }).catch(A.fail);
      };
      A.GET('/api/stats?days=30&site=' + S.site.id).then(function (st) {
        var cb = st.closed_by || {};
        A.$('#hk').innerHTML = kpi('💬', 'محادثات آخر 30 يوماً', A.num(st.kpi.conversations), A.num(st.kpi.handoffs) + ' حُوّلت لموظف') +
          kpi('🙋', 'أنهاها المستفيد', A.num(cb.visitor || 0), '', C.blue) + kpi('👨‍💼', 'أنهاها الموظف', A.num(cb.agent || 0), '', C.green) + kpi('⏱️', 'أغلقها النظام (عدم نشاط)', A.num(cb.system || 0), '', C.gray);
      });
      var bindSel = function (id, k) { A.$(id).onchange = function () { f[k] = this.value; f.page = 1; load(); }; };
      bindSel('#hs', 'status'); bindSel('#hb', 'closed_by'); bindSel('#hh', 'handoff'); bindSel('#hr', 'rated'); bindSel('#ha', 'agent'); bindSel('#hl', 'lang'); bindSel('#hf', 'from'); bindSel('#ht', 'to');
      A.$('#hq').oninput = A.debounce(function () { f.q = this.value.trim(); f.page = 1; load(); }, 350);
      A.on('conv-deleted', load);
      load();
      if (sub[0]) A.openConversation(Number(sub[0]));
      return function () { A.off('conv-deleted', load); };
    }
  });

  /* ============================== tickets ============================== */
  A.newTicket = function (pre) {
    pre = pre || {};
    var v = { type: 'complaint', name: pre.name || '', phone: pre.phone || '', email: pre.email || '', text: '' };
    var m = A.modal({
      title: '📝 تسجيل شكوى / اقتراح', body: '<div class="field"><label class="f">النوع</label><div class="seg" id="nt">' + Object.keys(A.TK_TYPE).map(function (k) { return '<button data-t="' + k + '" class="' + (k === v.type ? 'on' : '') + '">' + A.TK_TYPE[k][2] + ' ' + A.TK_TYPE[k][0] + '</button>'; }).join('') + '</div></div>' +
        '<div class="grid g2">' + A.f.text('name', 'الاسم') + A.f.text('phone', 'الجوال', { ltr: true }) + '</div>' + A.f.text('email', 'البريد', { ltr: true, opt: true }) + A.f.area('text', 'التفاصيل', { rows: 5 }),
      buttons: [{ label: 'إلغاء', ghost: true }, { label: 'تسجيل', onClick: function () { return A.api('POST', '/api/tickets', Object.assign({ site_id: S.site.id }, v)).then(function (t) { A.toast('تم التسجيل برقم ' + t.number, 'ok'); A.emit('ticket', t); }); } }]
    });
    A.bind(m.body, v);
    A.$$('#nt button', m.body).forEach(function (b) { b.onclick = function () { v.type = b.getAttribute('data-t'); A.$$('#nt button', m.body).forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
  };

  A.openTicket = function (id, onDone) {
    A.GET('/api/tickets/' + id).then(function (t) {
      var v = { status: t.status, reply: t.reply || '', internal_note: t.internal_note || '', priority: t.priority || 'normal', category: t.category || '', assigned_to: t.assigned_to || '', notify: true };
      var ch = S.site.settings.notify.channels.ticket_updated || {};
      var m = A.modal({
        title: A.TK_TYPE[t.type][2] + ' ' + A.TK_TYPE[t.type][0] + ' رقم <span class="ltr">' + esc(t.number) + '</span>', size: 'xl',
        body: '<div class="grid" style="grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:18px">' +
          '<div class="col"><div class="card flat" style="padding:14px"><div class="row" style="margin-bottom:10px">' + A.avatar({ name: t.name }) + '<div class="grow"><b>' + esc(t.name) + '</b><div class="small muted ltr">' + esc(t.phone) + (t.email ? ' · ' + esc(t.email) : '') + '</div></div>' + A.tag(A.TK_STATUS, t.status) + '</div>' +
          '<div style="white-space:pre-wrap;line-height:1.8;background:var(--soft);border-radius:10px;padding:12px">' + esc(t.text) + '</div>' +
          '<div class="row wrap small muted" style="margin-top:10px;gap:14px"><span>📅 ' + A.fmtDate(t.created_at) + '</span><span>🌐 ' + (A.LANG[t.lang] || t.lang) + '</span>' + (t.conversation_id ? '<a href="#/history/' + t.conversation_id + '">💬 المحادثة #' + t.conversation_id + '</a>' : '') + (t.resolved_at ? '<span>✅ ' + A.fmtDate(t.resolved_at) + '</span>' : '') + '</div></div>' +
          '<div class="card flat" style="padding:14px"><b>📜 سجل الإجراءات</b><div class="timeline" style="margin-top:10px">' + t.events.map(function (e) {
            var d = {}; try { d = JSON.parse(e.details || '{}'); } catch (x) { }
            var txt = e.kind === 'created' ? 'تم الإنشاء ' + (d.via === 'chat' ? 'من المحادثة' : 'من لوحة التحكم') : e.kind === 'updated' ? 'تحديث' + (d.from !== d.to ? ': ' + (A.TK_STATUS[d.from] || [d.from])[0] + ' ← ' + (A.TK_STATUS[d.to] || [d.to])[0] : '') + (d.reply ? ' + رد' : '') : e.kind === 'notified' ? 'إشعار: ' + Object.keys(d).map(function (k) { var r = d[k]; return k + (r && r.sent ? ' ✅' : r && r.manual ? ' (يدوي)' : r && r.skipped ? ' —' : ' ❌'); }).join('، ') : e.kind;
            return '<div class="ev"><b>' + esc(txt) + '</b><div class="tiny muted">' + A.fmtDate(e.created_at) + (e.user_name ? ' · ' + esc(e.user_name) : '') + '</div></div>';
          }).join('') + '</div>' + (t.logs.length ? '<details style="margin-top:8px"><summary class="small">سجل الإرسال (' + t.logs.length + ')</summary>' + t.logs.map(function (l) { return '<div class="tiny" style="margin-top:4px">' + (l.status === 'sent' ? '✅' : '❌') + ' ' + esc(l.channel) + ' → <span class="ltr">' + esc(l.recipient) + '</span> ' + (l.error ? '<span style="color:var(--danger)">' + esc(l.error) + '</span>' : '') + ' <span class="muted">' + A.fmtDate(l.created_at) + '</span></div>'; }).join('') + '</details>' : '') + '</div></div>' +
          '<div class="col"><div><label class="f">الحالة</label><div class="tk-status" id="tks">' + Object.keys(A.TK_STATUS).map(function (k) { return '<button data-s="' + k + '" class="' + (k === v.status ? 'on' : '') + '">' + A.TK_STATUS[k][0] + '</button>'; }).join('') + '</div></div>' +
          A.f.area('reply', 'الرد / سبب القرار <small>(يُرسل للمستفيد)</small>', { rows: 5, ph: 'اكتب الرد أو سبب الرفض أو الإجراء المتخذ…' }) +
          '<div class="grid g2">' + A.f.select('priority', 'الأولوية', Object.keys(A.PRIORITY).map(function (k) { return [k, A.PRIORITY[k][0]]; })) + A.f.select('assigned_to', 'المسؤول', [['', '— غير محدد —']].concat(S.users.map(function (u) { return [u.id, u.name]; }))) + '</div>' +
          A.f.text('category', 'التصنيف', { ph: 'مثال: الخدمات، الصرف، التطوع…' }) + A.f.area('internal_note', 'ملاحظة داخلية <small>(لا تظهر للمستفيد)</small>', { rows: 2 }) +
          '<div class="card flat" style="padding:12px;background:var(--soft)">' + A.f.swi('notify', 'إشعار المستفيد بالتحديث') + '<div class="tiny muted" style="margin-top:6px">القنوات المفعّلة: ' + [ch.email && S.site.settings.notify.email && 'البريد', ch.sms && 'SMS', ch.whatsapp && 'واتساب'].filter(Boolean).join('، ') + ' — من صفحة الإشعارات</div>' +
          (t.wa_link ? '<a class="btn wa sm" style="margin-top:10px" target="_blank" href="' + esc(t.wa_link) + '" id="wa">🟢 إرسال يدوي عبر واتساب</a><div class="tiny muted" style="margin-top:4px">يفتح واتساب برسالة جاهزة (لمن لا يملك واتساب أعمال)</div>' : '') + '</div></div></div>',
        buttons: [{ label: '🗑️ حذف', danger: true, ghost: true, onClick: function () { return A.confirm('حذف الطلب ' + t.number + '؟', true).then(function (ok) { if (!ok) return false; return A.api('DELETE', '/api/tickets/' + t.id).then(function () { onDone && onDone(); }); }); } },
          { label: 'إغلاق', ghost: true },
          { label: '💾 حفظ وإرسال', onClick: function () {
            var body = Object.assign({}, v); if (body.assigned_to === '') body.assigned_to = null;
            return A.api('PUT', '/api/tickets/' + t.id, body).then(function (r) {
              var n = r.notified; A.toast('تم الحفظ' + (n ? ' — ' + Object.keys(n).filter(function (k) { return n[k] && n[k].sent; }).map(function (k) { return k; }).join('، ') : ''), 'ok');
              if (n && n.whatsapp && n.whatsapp.manual && n.whatsapp.link) window.open(n.whatsapp.link, '_blank');
              onDone && onDone();
            });
          } }]
      });
      if (!A.can('supervisor')) m.el.querySelector('.mf .danger').remove();
      A.bind(m.body, v);
      A.$$('#tks button', m.body).forEach(function (b) { b.onclick = function () { v.status = b.getAttribute('data-s'); A.$$('#tks button', m.body).forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
    }).catch(A.fail);
  };

  A.page('tickets', {
    title: 'الشكاوى والاقتراحات', icon: '📝',
    render: function (root, sub) {
      var f = { type: '', status: '', priority: '', q: '', page: 1, from: '', to: '' };
      root.innerHTML = '<div class="grid g4" id="tk-k" style="margin-bottom:16px"></div><div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:16px;margin-bottom:16px" id="tk-ch"></div>' +
        '<div class="card"><div class="row wrap" style="gap:8px;margin-bottom:14px"><div class="seg" id="tt"><button data-t="" class="on">الكل</button>' + Object.keys(A.TK_TYPE).map(function (k) { return '<button data-t="' + k + '">' + A.TK_TYPE[k][2] + ' ' + A.TK_TYPE[k][0] + '</button>'; }).join('') + '</div>' +
        '<select class="in" id="ts" style="width:auto"><option value="">كل الحالات</option><option value="open">المفتوحة</option>' + Object.keys(A.TK_STATUS).map(function (k) { return '<option value="' + k + '">' + A.TK_STATUS[k][0] + '</option>'; }).join('') + '</select>' +
        '<select class="in" id="tp" style="width:auto"><option value="">كل الأولويات</option>' + Object.keys(A.PRIORITY).map(function (k) { return '<option value="' + k + '">' + A.PRIORITY[k][0] + '</option>'; }).join('') + '</select>' +
        '<input class="in" id="tq" placeholder="🔎 رقم، اسم، جوال، نص" style="flex:1;min-width:180px"><input type="date" class="in" id="tf" style="width:auto"><input type="date" class="in" id="tto" style="width:auto">' +
        '<button class="btn soft" id="tx">📊 تصدير Excel</button><button class="btn" id="tn">+ تسجيل جديد</button></div><div id="tl"></div></div>';
      function stats() {
        A.GET('/api/tickets/stats?site=' + S.site.id).then(function (s) {
          var bt = s.by_type || {}, bs = s.by_status || {};
          var open = (bs.new || 0) + (bs.in_progress || 0);
          A.$('#tk-k').innerHTML = kpi('📋', 'إجمالي الطلبات', A.num(s.total), 'هذا الشهر: ' + (function () { var m = s.per_month[s.per_month.length - 1]; return m && m.m === A.today().slice(0, 7) ? (m.complaint || 0) + (m.suggestion || 0) + (m.inquiry || 0) : 0; })()) +
            kpi('📝', 'الشكاوى', A.num(bt.complaint || 0), s.total ? 'نسبة الشكاوى ' + Math.round((bt.complaint || 0) / s.total * 100) + '%' : '', C.red) +
            kpi('💡', 'الاقتراحات', A.num(bt.suggestion || 0), '', C.purple) +
            kpi('⏳', 'مفتوحة الآن', A.num(open), 'نسبة الحل ' + (s.resolution_rate == null ? '—' : s.resolution_rate + '%') + ' · متوسط ' + (s.avg_resolution_hours == null ? '—' : s.avg_resolution_hours + ' ساعة'), C.amber);
          var months = s.per_month.slice(-12);
          A.$('#tk-ch').innerHTML = '<div class="card"><h3>📈 الطلبات الشهرية حسب النوع</h3>' + (months.length ? A.chart.bars(months.map(function (x) { return x.m; }), [{ name: 'شكاوى', color: C.red, values: months.map(function (x) { return x.complaint || 0; }) }, { name: 'اقتراحات', color: C.purple, values: months.map(function (x) { return x.suggestion || 0; }) }, { name: 'استفسارات', color: C.blue, values: months.map(function (x) { return x.inquiry || 0; }) }]) : '<div class="empty">لا بيانات بعد</div>') + '</div>' +
            '<div class="card"><h3>🎯 الحالات</h3>' + A.chart.donut(Object.keys(A.TK_STATUS).map(function (k, i) { return { name: A.TK_STATUS[k][0], value: bs[k] || 0, color: [C.blue, C.amber, C.green, C.gray, C.red][i] }; }), { label: 'طلب' }) + '</div>';
        }).catch(A.fail);
      }
      function load() {
        var qs = Object.keys(f).filter(function (k) { return f[k]; }).map(function (k) { return k + '=' + encodeURIComponent(f[k]); }).join('&');
        A.GET('/api/tickets?site=' + S.site.id + '&limit=25&' + qs).then(function (r) {
          var pages = Math.max(1, Math.ceil(r.total / r.limit));
          A.$('#tl').innerHTML = r.items.length ? '<div class="tbl-wrap"><table class="t"><thead><tr><th>الرقم</th><th>النوع</th><th>مقدم الطلب</th><th>النص</th><th>الحالة</th><th>الأولوية</th><th>المسؤول</th><th>التاريخ</th></tr></thead><tbody>' + r.items.map(function (t) {
            return '<tr class="click" data-id="' + t.id + '"><td><b class="ltr">' + esc(t.number) + '</b></td><td>' + A.tag(A.TK_TYPE, t.type) + '</td><td><b>' + esc(t.name) + '</b><div class="tiny muted ltr">' + esc(t.phone) + '</div></td>' +
              '<td style="max-width:300px"><div class="small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(t.text) + '</div>' + (t.reply ? '<div class="tiny muted">↩️ ' + esc(t.reply.slice(0, 60)) + '</div>' : '') + '</td>' +
              '<td>' + A.tag(A.TK_STATUS, t.status) + '</td><td>' + A.tag(A.PRIORITY, t.priority || 'normal') + '</td><td class="small">' + esc(t.agent_name || '—') + '</td><td class="small muted">' + A.fmtDate(t.created_at) + '</td></tr>';
          }).join('') + '</tbody></table></div><div class="row between" style="margin-top:12px"><span class="muted small">' + A.num(r.total) + ' طلب</span><div class="row"><button class="btn sm ghost" id="pp"' + (f.page <= 1 ? ' disabled' : '') + '>السابق</button><span class="small">' + f.page + ' / ' + pages + '</span><button class="btn sm ghost" id="pn"' + (f.page >= pages ? ' disabled' : '') + '>التالي</button></div></div>'
            : '<div class="empty"><div class="ic">📭</div>لا توجد طلبات مطابقة<div class="tiny" style="margin-top:6px">يقدّم المستفيد الشكوى أو الاقتراح من نافذة المحادثة (اسم + جوال + النص) وتظهر هنا فوراً برقم وتاريخ</div></div>';
          A.$$('#tl tr[data-id]').forEach(function (tr) { tr.onclick = function () { A.openTicket(Number(tr.getAttribute('data-id')), refresh); }; });
          if (A.$('#pp')) { A.$('#pp').onclick = function () { f.page--; load(); }; A.$('#pn').onclick = function () { f.page++; load(); }; }
        }).catch(A.fail);
      }
      var refresh = function () { load(); stats(); A.refreshCounts(); };
      A.$$('#tt button').forEach(function (b) { b.onclick = function () { f.type = b.getAttribute('data-t'); f.page = 1; A.$$('#tt button').forEach(function (x) { x.classList.toggle('on', x === b); }); load(); }; });
      A.$('#ts').onchange = function () { f.status = this.value; f.page = 1; load(); };
      A.$('#tp').onchange = function () { f.priority = this.value; f.page = 1; load(); };
      A.$('#tf').onchange = function () { f.from = this.value; f.page = 1; load(); };
      A.$('#tto').onchange = function () { f.to = this.value; f.page = 1; load(); };
      A.$('#tq').oninput = A.debounce(function () { f.q = this.value.trim(); f.page = 1; load(); }, 350);
      A.$('#tx').onclick = function () { A.download('/api/tickets/export?site=' + S.site.id + (f.type ? '&type=' + f.type : '') + (f.status ? '&status=' + f.status : '') + (f.from ? '&from=' + f.from : '') + (f.to ? '&to=' + f.to : '')); };
      A.$('#tn').onclick = function () { A.newTicket(); };
      A.on('ticket', refresh);
      refresh();
      if (sub[0]) A.openTicket(Number(sub[0]), refresh);
      this.onSub = function (s) { if (s[0]) A.openTicket(Number(s[0]), refresh); };
      return function () { A.off('ticket', refresh); };
    }
  });

  /* ============================== stats dashboard ============================== */
  A.page('stats', {
    title: 'لوحة الإحصائيات', icon: '📊',
    render: function (root) {
      var st = { days: '30' };
      root.innerHTML = '<div class="row wrap between" style="margin-bottom:16px"><div id="rgs"></div><span class="small muted" id="rgl"></span></div><div id="sd"><div class="empty">جارٍ التحميل…</div></div>';
      A.$('#rgs').appendChild(rangeBar(st, load));
      function load() {
        A.GET('/api/stats?site=' + S.site.id + rq(st)).then(function (d) {
          var k = d.kpi, max = d.rating_max;
          A.$('#rgl').textContent = 'من ' + A.fmtDate(d.range.from, false) + ' إلى ' + A.fmtDate(d.range.to, false);
          var labels = d.per_day.map(function (x) { return x.d.slice(5).replace('-', '/'); });
          var cb = d.closed_by || {}, lg = d.languages || {}, tt = d.tickets.by_type || {};
          A.$('#sd').innerHTML =
            '<div class="grid g4">' + kpi('💬', 'إجمالي المحادثات', A.num(k.conversations), 'نشطة الآن: ' + k.active + (k.waiting ? ' · <b style="color:var(--warn)">بانتظار: ' + k.waiting + '</b>' : '')) +
            kpi('🤖', 'نسبة الأتمتة', (k.automation_rate == null ? '—' : k.automation_rate + '<small>%</small>'), A.num(k.bot_only) + ' محادثة أنهاها البوت وحده', C.teal) +
            kpi('⭐', 'متوسط التقييم', (k.avg_rating == null ? '—' : k.avg_rating + '<small> / ' + max + '</small>'), A.num(k.ratings) + ' تقييم · رضا ' + (k.satisfaction == null ? '—' : k.satisfaction + '%'), C.gold) +
            kpi('⚡', 'متوسط أول رد', A.dur(k.first_response), 'متوسط مدة المعالجة: ' + A.dur(k.handle_time), C.blue) + '</div>' +
            '<div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr);margin-top:14px"><div class="card"><h3>📈 المحادثات اليومية</h3>' + A.chart.bars(labels, [{ name: 'أنهاها البوت', color: C.teal, values: d.per_day.map(function (x) { return x.bot; }) }, { name: 'حُوّلت لموظف', color: C.gold, values: d.per_day.map(function (x) { return x.human; }) }]) + '</div>' +
            '<div class="card"><h3>🤖 البوت مقابل الموظفين</h3>' + A.chart.donut([{ name: 'البوت وحده', value: k.bot_only, color: C.teal }, { name: 'تحويل لموظف', value: k.handoffs, color: C.gold }], { center: (k.automation_rate == null ? '—' : k.automation_rate + '%'), label: 'أتمتة' }) +
            '<div class="small muted" style="margin-top:12px">🧠 قاعدة المعرفة: <b>' + d.kb.total + '</b> سؤال (' + d.kb.learned + ' تعلّمها من الموظفين) · استُخدمت ' + A.num(d.kb.hits) + ' مرة</div></div></div>' +
            '<div class="grid g3" style="margin-top:14px"><div class="card"><h3>🔚 من أنهى المحادثة</h3>' + A.chart.donut([{ name: 'المستفيد', value: cb.visitor || 0, color: C.blue }, { name: 'الموظف', value: cb.agent || 0, color: C.green }, { name: 'النظام (عدم نشاط)', value: cb.system || 0, color: C.gray }], { label: 'مغلقة' }) + '</div>' +
            '<div class="card"><h3>📝 الشكاوى والاقتراحات</h3>' + A.chart.donut([{ name: 'شكاوى', value: tt.complaint || 0, color: C.red }, { name: 'اقتراحات', value: tt.suggestion || 0, color: C.purple }, { name: 'استفسارات', value: tt.inquiry || 0, color: C.blue }], { label: 'طلب' }) +
            '<div class="small muted" style="margin-top:10px">معدل الشكاوى: <b>' + (k.conversations ? Math.round((tt.complaint || 0) / k.conversations * 1000) / 10 : 0) + '%</b> من المحادثات · مفتوحة الآن: <b>' + k.tickets_open + '</b></div></div>' +
            '<div class="card"><h3>🌐 لغات المستفيدين</h3>' + A.chart.donut(Object.keys(lg).map(function (l, i) { return { name: A.LANG[l] || l, value: lg[l], color: [C.green, C.blue, C.gold, C.purple][i % 4] }; }), { label: 'محادثة' }) + '</div></div>' +
            '<div class="grid g2" style="margin-top:14px"><div class="card"><h3>⏰ أوقات الذروة (توقيت الرياض)</h3>' + A.chart.bars(d.by_hour.map(function (_, h) { return String(h); }), [{ name: 'محادثات', color: C.green, values: d.by_hour }], { h: 180 }) + '</div>' +
            '<div class="card"><h3>⭐ توزيع التقييمات</h3>' + (d.ratings.length ? A.chart.hbars(d.ratings.slice().reverse().map(function (r) { var hue = Math.round((r.k - 0.5) / (max - 0.5) * 120); return { name: '★ ' + r.k, value: r.c, color: 'hsl(' + hue + ',70%,45%)' }; })) : '<div class="empty">لا تقييمات بعد</div>') + '</div></div>' +
            '<div class="grid g3" style="margin-top:14px"><div class="card"><h3>👨‍💼 أداء الموظفين <span class="acts"><a class="btn sm ghost" href="#/reports">التقرير التفصيلي ←</a></span></h3>' + (d.agents.length ? '<table class="t"><thead><tr><th>الموظف</th><th>محادثات</th><th>تقييم</th><th>أول رد</th></tr></thead><tbody>' + d.agents.map(function (a) { return '<tr><td><div class="row">' + A.avatar(a, 'sm') + '<span class="small">' + esc(a.name) + '</span></div></td><td><b>' + a.conversations + '</b></td><td>' + (a.avg_rating == null ? '—' : a.avg_rating) + '</td><td class="small">' + A.dur(a.first_response) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty">لا توجد محادثات مع موظفين في هذه الفترة</div>') + '</div>' +
            '<div class="card"><h3>🔥 أكثر الأسئلة استخداماً</h3>' + (d.top_kb.length ? A.chart.hbars(d.top_kb.map(function (x) { return { name: x.question, value: x.hits }; })) : '<div class="empty">لا يوجد</div>') + '</div>' +
            '<div class="card"><h3>❓ أسئلة لم يُجب عنها <span class="acts"><a class="btn sm ghost" href="#/kb/unanswered">أجب عنها ←</a></span></h3>' + (d.top_unanswered.length ? A.chart.hbars(d.top_unanswered.map(function (x) { return { name: x.question, value: x.count, color: C.amber }; })) : '<div class="empty">👏 لا يوجد</div>') + '</div></div>';
        }).catch(A.fail);
      }
      load();
    }
  });

  /* ============================== agent reports ============================== */
  A.page('reports', {
    title: 'تقارير الموظفين', icon: '📑', role: 'supervisor',
    render: function (root) {
      var st = { days: '30' }, mode = 'all', picked = [];
      root.innerHTML = '<div class="card" style="margin-bottom:16px"><div class="row wrap between" style="gap:12px"><div class="col" style="gap:8px"><b>الموظفون في التقرير</b><div class="seg" id="rm"><button data-m="all" class="on">👥 جميع الموظفين</button><button data-m="one">👤 موظف واحد</button><button data-m="some">☑️ مجموعة مختارة</button></div></div>' +
        '<div class="col" style="gap:8px"><b>الفترة</b><div id="rr"></div></div><button class="btn gold" id="rx" style="align-self:flex-end">📥 تنزيل تقرير Excel</button></div>' +
        '<div id="rpick" class="agent-pick hidden" style="margin-top:14px"></div></div><div id="rd"></div>';
      A.$('#rr').appendChild(rangeBar(st, load));
      function drawPick() {
        var el = A.$('#rpick'); el.classList.toggle('hidden', mode === 'all');
        el.innerHTML = S.users.map(function (u) { var on = picked.indexOf(u.id) >= 0; return '<label class="' + (on ? 'on' : '') + '"><input type="' + (mode === 'one' ? 'radio' : 'checkbox') + '" name="ag" value="' + u.id + '"' + (on ? ' checked' : '') + '>' + A.avatar(u, 'sm') + esc(u.name) + '</label>'; }).join('');
        A.$$('input', el).forEach(function (i) {
          i.onchange = function () {
            var id = Number(i.value);
            if (mode === 'one') picked = [id]; else picked = i.checked ? picked.concat([id]) : picked.filter(function (x) { return x !== id; });
            drawPick(); load();
          };
        });
      }
      A.$$('#rm button').forEach(function (b) {
        b.onclick = function () {
          mode = b.getAttribute('data-m'); A.$$('#rm button').forEach(function (x) { x.classList.toggle('on', x === b); });
          if (mode === 'all') picked = []; else if (mode === 'one') picked = picked.slice(0, 1).length ? picked.slice(0, 1) : [S.users[0].id];
          drawPick(); load();
        };
      });
      function qs() { return 'site=' + S.site.id + rq(st) + (mode !== 'all' && picked.length ? '&agents=' + picked.join(',') : ''); }
      A.$('#rx').onclick = function () { A.download('/api/reports/agents.xlsx?' + qs()); };
      function load() {
        if (mode !== 'all' && !picked.length) { A.$('#rd').innerHTML = '<div class="empty card">اختر موظفاً واحداً على الأقل</div>'; return; }
        A.GET('/api/reports/agents?' + qs()).then(function (r) {
          var t = r.totals, rows = r.rows.slice().sort(function (a, b) { return b.conversations - a.conversations; });
          var labels = r.days.map(function (d) { return d.slice(5).replace('-', '/'); });
          var top = rows.slice(0, 6);
          A.$('#rd').innerHTML = '<div class="grid g4">' + kpi('👥', 'الموظفون', t.agents) + kpi('💬', 'المحادثات المخدومة', A.num(t.conversations), A.num(t.messages) + ' رسالة', C.blue) +
            kpi('⭐', 'متوسط التقييم', t.avg_rating == null ? '—' : t.avg_rating, '', C.gold) + kpi('🧠', 'إجابات أُضيفت للمعرفة', A.num(t.learned), A.num(t.tickets) + ' طلب تمت معالجته', C.purple) + '</div>' +
            '<div class="grid g2" style="margin-top:14px"><div class="card"><h3>📈 المحادثات اليومية لكل موظف</h3>' + (top.length ? A.chart.line(labels, top.map(function (a, i) { return { name: a.name, color: A.COLORS[i % A.COLORS.length], values: a.daily }; })) : '') + '</div>' +
            '<div class="card"><h3>🏆 الترتيب حسب عدد المحادثات</h3>' + A.chart.hbars(rows.map(function (a, i) { return { name: a.name, value: a.conversations, color: A.COLORS[i % A.COLORS.length] }; })) + '</div></div>' +
            '<div class="card" style="margin-top:14px"><h3>📋 تفاصيل الأداء</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>الموظف</th><th>المحادثات</th><th>أنهاها</th><th>الرسائل</th><th>متوسط التقييم</th><th>أول رد</th><th>مدة المعالجة</th><th>تعلّم</th><th>طلبات</th></tr></thead><tbody>' +
            rows.map(function (a) { return '<tr><td><div class="row">' + A.avatar(a, 'sm') + '<div><b class="small">' + esc(a.name) + '</b><div class="tiny muted">' + esc(a.title || A.ROLE[a.role]) + '</div></div></div></td><td><b>' + a.conversations + '</b></td><td>' + a.closed + '</td><td>' + a.messages + '</td><td>' + (a.avg_rating == null ? '—' : A.stars(a.avg_rating, S.site.settings.appearance.rating_max)) + ' <span class="tiny muted">(' + a.ratings + ')</span></td><td>' + A.dur(a.first_response) + '</td><td>' + A.dur(a.handle_time) + '</td><td>' + a.learned + '</td><td>' + a.tickets + '</td></tr>'; }).join('') +
            '</tbody></table></div></div>';
        }).catch(A.fail);
      }
      drawPick(); load();
    }
  });

  /* ============================== knowledge base ============================== */
  A.editKB = function (k, onDone, extra) {
    k = Object.assign({ question: '', answer: '', keywords: '', lang: 'all', media: [], active: 1 }, k || {});
    var media = (k.media || []).slice();
    var m = A.modal({
      title: k.id ? '✏️ تعديل سؤال' : '➕ سؤال وإجابة جديدة', size: 'wide',
      body: A.f.area('question', 'السؤال', { rows: 2, ph: 'مثال: ما هي طريقة التسجيل في الجمعية؟' }) + A.f.area('answer', 'الإجابة', { rows: 6 }) +
        '<div class="grid g2">' + A.f.text('keywords', 'كلمات مفتاحية', { opt: true, hint: 'مفصولة بفواصل — تساعد البوت على فهم الصيغ المختلفة للسؤال', ph: 'تسجيل, اشتراك, انضمام' }) +
        A.f.select('lang', 'اللغة', [['all', 'كل اللغات'], ['ar', 'العربية'], ['en', 'English'], ['ur', 'اردو']]) + '</div>' +
        '<div class="field"><label class="f">مرفقات تُرسل مع الإجابة <small>(صورة، فيديو، PDF، يوتيوب)</small></label><div id="kbm"></div></div>' + (k.id ? A.f.swi('active', 'مفعّل') : ''),
      buttons: [{ label: 'إلغاء', ghost: true }, { label: 'حفظ', onClick: function () {
        var body = { question: k.question, answer: k.answer, keywords: k.keywords, lang: k.lang, media: media, active: k.active };
        return (k.id ? A.api('PUT', '/api/kb/' + k.id, body) : A.api('POST', '/api/kb', Object.assign({ site_id: S.site.id }, body, extra || {}))).then(function () { A.toast('تم الحفظ', 'ok'); onDone && onDone(); });
      } }]
    });
    A.bind(m.body, k);
    A.mediaEditor(m.body.querySelector('#kbm'), media);
  };

  A.page('kb', {
    title: 'قاعدة المعرفة', icon: '🧠',
    render: function (root, sub) {
      var tab = sub[0] === 'unanswered' ? 'unanswered' : 'kb', src = '', q = '';
      root.innerHTML = '<div class="alert info" style="margin-bottom:14px">💡 عندما لا يعرف البوت الإجابة يُحوّل المستفيد لموظف، ويُسجّل السؤال هنا. وعندما يرد الموظف يُحفظ السؤال والإجابة تلقائياً ليجيب عنها البوت مستقبلاً — فلا يُحتاج الموظف إلا عند الضرورة.</div>' +
        '<div class="tabs"><button data-t="kb">📚 الأسئلة والإجابات</button><button data-t="unanswered">❓ أسئلة بلا إجابة <span id="uc"></span></button><button data-t="test">🧪 اختبار البوت</button></div><div id="kbc"></div>';
      function tabs() { A.$$('.tabs button', root).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-t') === tab); b.onclick = function () { tab = b.getAttribute('data-t'); tabs(); draw(); }; }); }
      function draw() { if (tab === 'kb') drawKB(); else if (tab === 'unanswered') drawUn(); else drawTest(); }
      function drawKB() {
        A.$('#kbc').innerHTML = '<div class="card"><div class="row wrap" style="gap:8px;margin-bottom:12px"><input class="in" id="kq" placeholder="🔎 ابحث في الأسئلة والإجابات" style="flex:1;min-width:200px" value="' + esc(q) + '"><div class="seg" id="ks"><button data-s="" class="' + (!src ? 'on' : '') + '">الكل</button><button data-s="manual" class="' + (src === 'manual' ? 'on' : '') + '">✍️ يدوي</button><button data-s="learned" class="' + (src === 'learned' ? 'on' : '') + '">🧠 تعلّمه من الموظفين</button></div><button class="btn" id="kn">+ إضافة سؤال</button></div><div id="kl"></div></div>';
        A.$('#kn').onclick = function () { A.editKB(null, drawKB); };
        A.$('#kq').oninput = A.debounce(function () { q = this.value; list(); }, 300);
        A.$$('#ks button').forEach(function (b) { b.onclick = function () { src = b.getAttribute('data-s'); A.$$('#ks button').forEach(function (x) { x.classList.toggle('on', x === b); }); list(); }; });
        list();
      }
      function list() {
        A.GET('/api/kb?site=' + S.site.id + (src ? '&source=' + src : '') + (q ? '&q=' + encodeURIComponent(q) : '')).then(function (items) {
          A.$('#kl').innerHTML = items.length ? '<div class="tbl-wrap"><table class="t"><thead><tr><th>السؤال</th><th>الإجابة</th><th>المصدر</th><th>اللغة</th><th>الاستخدام</th><th></th></tr></thead><tbody>' + items.map(function (k) {
            return '<tr' + (k.active ? '' : ' style="opacity:.5"') + '><td style="max-width:280px"><b class="small">' + esc(k.question) + '</b>' + (k.keywords ? '<div class="tiny muted">🏷️ ' + esc(k.keywords) + '</div>' : '') + '</td><td style="max-width:360px"><div class="small" style="white-space:pre-wrap;max-height:60px;overflow:hidden">' + esc(k.answer) + '</div>' + (k.media && k.media.length ? '<span class="tag gray">📎 ' + k.media.length + '</span>' : '') + '</td>' +
              '<td>' + (k.source === 'learned' ? '<span class="tag purple">🧠 تعلّم</span>' : '<span class="tag gray">✍️ يدوي</span>') + '</td><td class="small">' + (k.lang === 'all' || !k.lang ? 'الكل' : A.LANG[k.lang]) + '</td><td><b>' + (k.hits || 0) + '</b></td>' +
              '<td style="white-space:nowrap"><button class="btn sm ghost" data-e="' + k.id + '">تعديل</button>' + (A.can('supervisor') ? ' <button class="btn sm danger ghost" data-d="' + k.id + '">حذف</button>' : '') + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="empty"><div class="ic">📚</div>لا توجد أسئلة بعد</div>';
          A.$$('[data-e]', root).forEach(function (b) { b.onclick = function () { A.editKB(items.find(function (x) { return x.id === Number(b.getAttribute('data-e')); }), list); }; });
          A.$$('[data-d]', root).forEach(function (b) { b.onclick = function () { A.confirm('حذف هذا السؤال؟', true).then(function (ok) { if (ok) A.api('DELETE', '/api/kb/' + b.getAttribute('data-d')).then(list, A.fail); }); }; });
        }).catch(A.fail);
      }
      function drawUn() {
        A.GET('/api/unanswered?site=' + S.site.id).then(function (items) {
          A.$('#uc').textContent = items.length ? '(' + items.length + ')' : '';
          A.$('#kbc').innerHTML = '<div class="card">' + (items.length ? '<div class="tbl-wrap"><table class="t"><thead><tr><th>السؤال</th><th>تكرر</th><th>اللغة</th><th>آخر مرة</th><th></th></tr></thead><tbody>' + items.map(function (u) {
            return '<tr><td><b>' + esc(u.question) + '</b></td><td><span class="tag amber">' + u.count + '×</span></td><td class="small">' + (A.LANG[u.lang] || '') + '</td><td class="small muted">' + A.ago(u.updated_at || u.created_at) + '</td><td style="white-space:nowrap"><button class="btn sm" data-a="' + u.id + '">✍️ أجب الآن</button> ' + (u.conversation_id ? '<button class="btn sm ghost" data-c="' + u.conversation_id + '">💬</button> ' : '') + '<button class="btn sm ghost" data-x="' + u.id + '">تجاهل</button></td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="empty"><div class="ic">👏</div>لا توجد أسئلة معلّقة — البوت يعرف كل ما سُئل عنه</div>') + '</div>';
          A.$$('[data-a]').forEach(function (b) { b.onclick = function () { var u = items.find(function (x) { return x.id === Number(b.getAttribute('data-a')); }); A.editKB({ question: u.question, lang: u.lang === 'ar' ? 'all' : u.lang }, drawUn, { unanswered_id: u.id }); }; });
          A.$$('[data-c]').forEach(function (b) { b.onclick = function () { A.openConversation(Number(b.getAttribute('data-c'))); }; });
          A.$$('[data-x]').forEach(function (b) { b.onclick = function () { A.api('PUT', '/api/unanswered/' + b.getAttribute('data-x'), { status: 'dismissed' }).then(drawUn, A.fail); }; });
          A.refreshCounts();
        }).catch(A.fail);
      }
      function drawTest() {
        A.$('#kbc').innerHTML = '<div class="card"><p class="muted small" style="margin-top:0">اكتب سؤالاً كما يكتبه المستفيد لترى ماذا سيجيب البوت ونسبة التطابق.</p><div class="row"><input class="in" id="tq" placeholder="مثال: كيف اسجل عندكم؟"><button class="btn" id="tb">اختبار</button></div><div id="tr" style="margin-top:14px"></div></div>';
        var go = function () {
          A.api('POST', '/api/kb/test', { site_id: S.site.id, text: A.$('#tq').value }).then(function (r) {
            var th = S.site.settings.behavior.kb_threshold;
            A.$('#tr').innerHTML = (r.best ? '<div class="alert ok"><div><b>✅ سيجيب البوت (تطابق ' + Math.round(r.best.score * 100) + '%):</b><div style="white-space:pre-wrap;margin-top:6px">' + esc(r.best.answer) + '</div></div></div>' : '<div class="alert warn">⚠️ لا توجد إجابة كافية (الحد الأدنى ' + Math.round(th * 100) + '%) — سيُحوّل المستفيد لموظف ويُسجَّل السؤال.</div>') +
              (r.top.length ? '<h4 style="margin:14px 0 8px">أقرب الأسئلة</h4>' + A.chart.hbars(r.top.map(function (x) { return { name: x.question, value: Math.round(x.score * 100), label: Math.round(x.score * 100) + '%', color: x.score >= th ? '#16a34a' : '#d97706' }; })) : '');
          }).catch(A.fail);
        };
        A.$('#tb').onclick = go; A.$('#tq').onkeydown = function (e) { if (e.key === 'Enter') go(); };
      }
      tabs(); draw();
      A.GET('/api/unanswered?site=' + S.site.id).then(function (u) { var el = A.$('#uc'); if (el) el.textContent = u.length ? '(' + u.length + ')' : ''; });
      var onLearn = function () { if (tab === 'kb') list(); };
      A.on('learned', onLearn);
      return function () { A.off('learned', onLearn); };
    }
  });
})();
