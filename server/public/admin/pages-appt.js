/* Appointments calendar (salons, clinics, centres): month view + day list; the bot tells visitors their appointment by name */
(function () {
  var A = App, S = A.state, esc = A.esc, f = A.f;
  var DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  var ST = { confirmed: ['✅ مؤكد', '#16a34a'], pending: ['⏳ بانتظار التأكيد', '#d97706'], done: ['✔️ تم', '#64748b'], cancelled: ['✖ ملغي', '#dc2626'] };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var ymd = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var t12 = function (t) { var m = /^(\d{2}):(\d{2})/.exec(t || ''); if (!m) return ''; var h = Number(m[1]); return ((h + 11) % 12 + 1) + ':' + m[2] + (h < 12 ? ' ص' : ' م'); };

  A.page('appointments', {
    title: 'المواعيد', icon: '📅', role: 'agent',
    hint: 'تقويم الحجوزات — وإذا سأل العميل «متى موعدي؟» يكتب اسمه فيظهر له التاريخ والوقت',
    render: function (root) {
      var today = ymd(new Date()), cur = new Date(), sel = today, rows = [], q = '', staffF = '';
      var AS = function () { return S.site.settings.appointments || {}; };
      root.innerHTML = '<div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(280px,1fr);gap:16px;align-items:start" id="apw">' +
        '<div class="card"><div class="row wrap" style="gap:8px;margin-bottom:12px"><button class="btn ghost icon" id="pm">›</button><h3 id="mt" style="margin:0;min-width:150px;text-align:center"></h3><button class="btn ghost icon" id="nm">‹</button><button class="btn sm soft" id="td">اليوم</button><span style="flex:1"></span>' +
        '<input class="in" id="aq" placeholder="🔎 بحث بالاسم أو الجوال" style="width:190px"><select class="in" id="sf" style="width:auto"></select><button class="btn" id="add">+ موعد جديد</button></div><div id="cal"></div></div>' +
        '<div><div class="card" id="day"></div>' + (A.can('supervisor') ? '<details class="card" id="aset"><summary style="cursor:pointer;font-weight:700">⚙️ إعدادات المواعيد والبوت</summary><div id="asb" style="margin-top:10px"></div></details>' : '') + '</div></div>';
      if (window.innerWidth < 1000) A.$('#apw').style.gridTemplateColumns = '1fr';

      function load() {
        var y = cur.getFullYear(), m = cur.getMonth(), from = ymd(new Date(y, m, 1 - 7)), to = ymd(new Date(y, m + 1, 7));
        return A.GET('/api/appointments?site=' + S.site.id + '&from=' + from + '&to=' + to).then(function (r) { rows = r; draw(); });
      }
      function visible() { return rows.filter(function (r) { return (!q || (r.name + ' ' + (r.phone || '')).indexOf(q) >= 0) && (!staffF || r.staff === staffF); }); }
      function draw() {
        var y = cur.getFullYear(), m = cur.getMonth(), first = new Date(y, m, 1), start = new Date(y, m, 1 - first.getDay()), V = visible();
        A.$('#mt').textContent = MONTHS[m] + ' ' + y;
        var staff = (AS().staff || []).concat(rows.map(function (r) { return r.staff; })).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
        A.$('#sf').innerHTML = '<option value="">👥 كل الموظفين</option>' + staff.map(function (s) { return '<option' + (s === staffF ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('');
        var h = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">' + DAYS.map(function (d) { return '<div class="tiny muted" style="text-align:center;font-weight:700;padding:4px 0">' + d + '</div>'; }).join('');
        for (var i = 0; i < 42; i++) {
          var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), k = ymd(d), list = V.filter(function (r) { return r.date === k && r.status !== 'cancelled'; });
          h += '<button type="button" data-d="' + k + '" style="min-height:86px;text-align:start;padding:6px;border-radius:10px;border:' + (k === sel ? '2px solid var(--primary)' : '1px solid var(--border)') + ';background:' + (k === today ? 'var(--soft)' : 'var(--card,#fff)') + ';opacity:' + (d.getMonth() === m ? 1 : .45) + ';cursor:pointer;font:inherit;color:inherit;overflow:hidden">' +
            '<div class="row" style="justify-content:space-between"><b class="small">' + d.getDate() + '</b>' + (list.length ? '<span class="chip tiny" style="padding:0 7px">' + list.length + '</span>' : '') + '</div>' +
            list.slice(0, 3).map(function (r) { return '<div class="tiny" style="margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-inline-start:3px solid ' + ST[r.status][1] + ';padding-inline-start:4px">' + (r.time ? t12(r.time) + ' ' : '') + esc(r.name) + '</div>'; }).join('') +
            (list.length > 3 ? '<div class="tiny muted">+' + (list.length - 3) + '</div>' : '') + '</button>';
        }
        A.$('#cal').innerHTML = h + '</div>';
        A.$$('[data-d]', root).forEach(function (b) { b.onclick = function () { sel = b.getAttribute('data-d'); draw(); }; });
        dayPanel();
      }
      function dayPanel() {
        var V = visible().filter(function (r) { return r.date === sel; }), d = new Date(sel + 'T12:00:00');
        A.$('#day').innerHTML = '<div class="row" style="justify-content:space-between;margin-bottom:8px"><h3 style="margin:0">' + DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + '</h3><button class="btn sm soft" id="addd">+ موعد</button></div>' +
          (V.length ? V.map(function (r) {
            return '<div class="repeat" style="border-inline-start:4px solid ' + ST[r.status][1] + '"><div class="row" style="justify-content:space-between"><b>' + (r.time ? '🕒 ' + t12(r.time) + ' — ' : '') + esc(r.name) + '</b><span class="tiny">' + ST[r.status][0] + '</span></div>' +
              '<div class="small muted" style="margin:4px 0">' + [r.service && '💇 ' + esc(r.service), r.staff && '👤 ' + esc(r.staff), r.phone && '📱 <span class="ltr">' + esc(r.phone) + '</span>', r.duration && '⏱️ ' + r.duration + ' د'].filter(Boolean).join(' · ') + '</div>' +
              (r.notes ? '<div class="tiny">📝 ' + esc(r.notes) + '</div>' : '') +
              '<div class="row wrap" style="gap:4px;margin-top:6px"><button class="btn sm ghost" data-e="' + r.id + '">✏️ تعديل</button>' + Object.keys(ST).filter(function (k) { return k !== r.status; }).map(function (k) { return '<button class="btn sm ghost" data-s="' + r.id + '" data-v="' + k + '">' + ST[k][0] + '</button>'; }).join('') + '<button class="btn sm danger ghost" data-x="' + r.id + '">🗑️</button></div></div>';
          }).join('') : '<p class="small muted">لا توجد مواعيد في هذا اليوم</p>');
        A.$('#addd').onclick = function () { edit({ date: sel }); };
        A.$$('[data-e]', A.$('#day')).forEach(function (b) { b.onclick = function () { edit(rows.find(function (r) { return r.id === Number(b.getAttribute('data-e')); })); }; });
        A.$$('[data-s]', A.$('#day')).forEach(function (b) { b.onclick = function () { A.api('PUT', '/api/appointments/' + b.getAttribute('data-s'), { status: b.getAttribute('data-v') }).then(load, A.fail); }; });
        A.$$('[data-x]', A.$('#day')).forEach(function (b) { b.onclick = function () { A.confirm('حذف هذا الموعد؟').then(function (ok) { if (ok) A.api('DELETE', '/api/appointments/' + b.getAttribute('data-x')).then(load, A.fail); }); }; });
      }
      function edit(r) {
        var x = Object.assign({ name: '', phone: '', service: '', staff: '', date: sel, time: '', duration: 30, status: 'confirmed', notes: '' }, r || {}), isNew = !x.id;
        var svc = AS().services || [], stf = AS().staff || [];
        var m = A.modal({ title: isNew ? '📅 موعد جديد' : '✏️ تعديل الموعد', body: '<div class="grid g2">' + f.text('name', 'اسم العميل *') + f.text('phone', 'الجوال', { ltr: true, ph: '05xxxxxxxx' }) + '</div>' +
          '<div class="grid g2"><div class="field"><label class="f">الخدمة</label><input class="in" data-k="service" list="svcl"><datalist id="svcl">' + svc.map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist></div>' +
          '<div class="field"><label class="f">الموظف / المختص</label><input class="in" data-k="staff" list="stfl"><datalist id="stfl">' + stf.map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist></div></div>' +
          '<div class="grid g3">' + f.text('date', 'التاريخ *', { type: 'date' }) + f.text('time', 'الوقت', { type: 'time' }) + f.num('duration', 'المدة (دقيقة)') + '</div>' +
          f.select('status', 'الحالة', Object.keys(ST).map(function (k) { return [k, ST[k][0]]; })) + f.area('notes', 'ملاحظات', { rows: 2 }),
          buttons: [{ label: 'إلغاء', ghost: true }, { label: isNew ? '✅ إضافة' : '💾 حفظ', onClick: function () {
            if (!x.name.trim() || !x.date) { A.toast('اكتب الاسم والتاريخ', 'err'); return false; }
            return (isNew ? A.api('POST', '/api/appointments', Object.assign({ site_id: S.site.id }, x)) : A.api('PUT', '/api/appointments/' + x.id, x)).then(function (s) { sel = s.date; cur = new Date(s.date + 'T12:00:00'); A.toast(isNew ? 'تمت إضافة الموعد ✅' : 'تم الحفظ ✅', 'ok'); return load(); });
          } }] });
        A.bind(m.body, x);
      }
      function settings() {
        var box = A.$('#asb'); if (!box) return;
        var d = { appointments: A.clone(AS()) }, a = d.appointments; a.services = a.services || []; a.staff = a.staff || [];
        box.innerHTML = f.area('appointments.services', 'الخدمات (كل خدمة في سطر)', { rows: 4 }) + f.area('appointments.staff', 'الموظفون / المختصون (كل اسم في سطر)', { rows: 3 }) +
          f.sw('appointments.verify_phone', '🔒 طلب رقم الجوال للتأكد قبل عرض الموعد', 'بدونه يكفي الاسم (أسهل للعميل). معه لا يرى أحد موعد غيره') +
          f.sw('appointments.show_staff', 'إظهار اسم الموظف للعميل', '') + f.text('appointments.not_found', 'رسالة عدم وجود موعد (اختياري)', { ph: 'لم أجد موعداً قادماً بهذا الاسم…' }) +
          '<span class="tiny muted" id="ass">✅ تُحفظ تلقائياً</span>';
        A.$$('textarea[data-k]', box).forEach(function (t) { t.setAttribute('data-lines', '1'); });
        var tm = null;
        A.bind(box, d, function () { A.$('#ass').textContent = '● جارٍ الحفظ…'; clearTimeout(tm); tm = setTimeout(function () { A.saveSite({ settings: d }).then(function () { A.$('#ass').textContent = '✅ تم الحفظ تلقائياً'; draw(); }, A.fail); }, 900); });
      }
      A.$('#pm').onclick = function () { cur = new Date(cur.getFullYear(), cur.getMonth() - 1, 1); load(); };
      A.$('#nm').onclick = function () { cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1); load(); };
      A.$('#td').onclick = function () { cur = new Date(); sel = today; load(); };
      A.$('#add').onclick = function () { edit({ date: sel }); };
      A.$('#aq').oninput = function () { q = this.value.trim(); draw(); };
      A.$('#sf').onchange = function () { staffF = this.value; draw(); };
      settings(); load();
    }
  });
})();
