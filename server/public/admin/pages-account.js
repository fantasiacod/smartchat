/* My account, users, audit log */
(function () {
  'use strict';
  var A = App, S = A.state, esc = A.esc, f = A.f;

  A.page('account', {
    title: 'حسابي', icon: '👤',
    render: function (root) {
      var me = S.me, v = { name: me.name, job_title: me.job_title, phone: me.phone, avatar: me.avatar }, pw = { current_password: '', password: '', confirm: '' };
      var prefs = A.clone(me.prefs || {}); prefs.theme = Object.assign({}, A.themeOf(), prefs.theme || {});
      root.innerHTML = '<div class="grid g2"><div>' +
        '<div class="card" style="margin-bottom:16px"><h3>🪪 بياناتي</h3><div class="row" style="gap:18px;margin-bottom:14px"><span id="avbox"></span><div class="col" style="gap:6px"><div class="row"><button class="btn sm soft" id="avup">📷 تغيير الصورة</button><button class="btn sm ghost" id="avrm">إزالة</button></div><span class="tiny muted">تظهر للمستفيد بجانب رسائلك</span></div></div>' +
        '<div class="grid g2">' + f.text('name', 'الاسم') + f.text('job_title', 'المسمى الوظيفي', { ph: 'مثال: أخصائي خدمة المستفيدين' }) + '</div><div class="grid g2">' + f.text('phone', 'الجوال', { ltr: true }) + '<div class="field"><label class="f">البريد</label><input class="in" dir="ltr" disabled value="' + esc(me.email) + '"></div></div>' +
        '<div class="row between"><span class="tag gray">' + A.ROLE[me.role] + '</span><button class="btn" id="svme" style="display:none">حفظ البيانات</button><span class="tiny muted" id="svmes">✅ تُحفظ تلقائياً</span></div></div>' +
        '<div class="card" style="margin-bottom:16px"><h3>🔔 التنبيهات</h3>' +
        f.sw('notifications', 'تفعيل التنبيهات', 'إيقافها يوقف الرنين والأصوات وإشعارات سطح المكتب') + f.sw('sound', 'الرنين والأصوات', 'رنين متكرر عند انتظار مستفيد حتى يتم الرد') + f.sw('available', 'متاح لاستقبال المحادثات', 'يمكن تغييره أيضاً من الشريط العلوي') +
        '<div class="switch-row"><span><b>إشعارات سطح المكتب</b><small id="dnst"></small></span><button class="btn sm ghost" id="dnreq">السماح</button></div><div class="row" style="margin-top:8px"><button class="btn sm ghost" id="tst">🔊 تجربة الصوت</button></div></div>' +
        '<div class="card"><h3>🔐 تغيير كلمة المرور</h3>' + (me.weak_password ? '<div class="alert warn" style="margin-bottom:12px">⚠️ كلمة المرور الحالية افتراضية أو ضعيفة — غيّرها الآن.</div>' : '') +
        '<div id="pwf">' + f.text('current_password', 'كلمة المرور الحالية', { type: 'password', ltr: true }) + '<div class="grid g2">' + f.text('password', 'الجديدة (8 أحرف على الأقل)', { type: 'password', ltr: true }) + f.text('confirm', 'تأكيدها', { type: 'password', ltr: true }) + '</div></div><button class="btn" id="svpw">تغيير كلمة المرور</button> <button class="btn ghost" id="lo">🚪 تسجيل الخروج</button></div></div>' +
        '<div><div class="card"><h3>🖌️ مظهر لوحة التحكم</h3><p class="sub">يُحفظ لحسابك فقط. ألوان نافذة المحادثة للزوار تُضبط من «الهوية والمظهر».</p>' +
        '<label class="f">سمات جاهزة</label><div class="swatches" id="thm">' + Object.keys(A.THEMES).map(function (k) { var t = A.THEMES[k]; return '<button class="swatch" data-t="' + k + '"><div class="sw"><i style="background:' + t.side + '"></i><i style="background:' + t.accent + '"></i><i style="background:' + t.accent2 + '"></i></div><span>' + t.name + '</span></button>'; }).join('') + '</div>' +
        '<div class="field" style="margin-top:14px"><label class="f">الوضع</label><div class="seg" id="mode"><button data-m="light">☀️ فاتح</button><button data-m="dark">🌙 داكن</button></div></div>' +
        '<div class="grid g2">' + f.color('theme.accent', 'اللون الرئيسي', { clear: false }) + f.color('theme.accent2', 'لون التمييز', { clear: false }) + f.color('theme.side', 'القائمة الجانبية (أعلى)', { clear: false }) + f.color('theme.side2', 'القائمة الجانبية (أسفل)', { clear: false }) + f.color('theme.bg', 'خلفية الصفحات', { clear: false }) +
        f.select('theme.font', 'الخط', A.DASH_FONTS.map(function (x) { return [x, x]; })) + '</div>' +
        '<label class="f">الزخرفة</label><div class="patterns" id="dpat"></div>' + f.sw('theme.pattern_bg', 'إظهار الزخرفة في خلفية الصفحات أيضاً', 'تظهر دائماً في القائمة الجانبية') + f.range('theme.pattern_opacity', 'شفافية زخرفة الخلفية', 0.02, 0.15, 0.01) +
        '<div class="row" style="margin-top:12px"><button class="btn" id="svth" style="display:none">حفظ المظهر</button><span class="tiny muted" id="svths">✅ يُحفظ تلقائياً</span><button class="btn ghost" id="rsth">استعادة الافتراضي</button></div></div></div></div>';
      var meT = null;
      A.bind(root.querySelector('.grid > div:first-child .card'), v, function () { A.$('#svmes').textContent = '● جارٍ الحفظ…'; clearTimeout(meT); meT = setTimeout(function () { A.$('#svme').onclick(); }, 1000); });
      var pwf = A.$('#pwf'); A.bind(pwf, pw);
      var notif = A.$('.grid > div:first-child .card:nth-child(2)');
      prefs.notifications = prefs.notifications !== false; prefs.sound = prefs.sound !== false; prefs.available = prefs.available !== false;
      A.bind(notif, prefs, function () { me.prefs = Object.assign(me.prefs, { notifications: prefs.notifications, sound: prefs.sound, available: prefs.available }); A.savePrefs().then(function () { A.toast('تم الحفظ', 'ok'); }); A.updateRing(); var av = A.$('#avail'); if (av) { av.checked = prefs.available; av.dispatchEvent(new Event('change')); } });
      function avBox() { A.$('#avbox').innerHTML = A.avatar({ name: v.name, avatar: v.avatar }, 'xl'); }
      avBox();
      A.$('#avup').onclick = function () { A.pickFile('image/*').then(function (fs) { if (fs[0]) A.readDataURL(fs[0], 256).then(function (u) { v.avatar = u; avBox(); }); }); };
      A.$('#avrm').onclick = function () { v.avatar = ''; avBox(); };
      A.$('#svme').onclick = function () { A.api('PUT', '/api/me', v).then(function (u) { Object.assign(me, u); var st = A.$('#svmes'); if (st) st.textContent = '✅ تم الحفظ تلقائياً'; A.$('#me-link').innerHTML = A.avatar(me, 'sm') + '<div class="grow" style="min-width:0"><b style="display:block;font-size:13.5px">' + esc(me.name) + '</b><small style="color:var(--side-muted)">' + esc(me.job_title || A.ROLE[me.role]) + '</small></div><span>⚙️</span>'; return A.GET('/api/users'); }).then(function (u) { if (u) S.users = u; }).catch(A.fail); };
      A.$('#svpw').onclick = function () {
        if (pw.password !== pw.confirm) return A.toast('كلمتا المرور غير متطابقتين', 'err');
        A.api('PUT', '/api/me', { current_password: pw.current_password, password: pw.password }).then(function (r) { if (r && r.token) { S.token = r.token; try { localStorage.setItem('sc_token', r.token); } catch (e) { } if (A.socket) { A.socket.auth = { token: r.token }; } } A.toast('تم تغيير كلمة المرور', 'ok'); me.weak_password = false; pw.current_password = pw.password = pw.confirm = ''; A.$$('input', pwf).forEach(function (i) { i.value = ''; }); }).catch(A.fail);
      };
      A.$('#lo').onclick = A.logout;
      var dn = function () { var st = !('Notification' in window) ? 'غير مدعومة في هذا المتصفح' : Notification.permission === 'granted' ? '✅ مسموحة' : Notification.permission === 'denied' ? '⛔ محظورة من إعدادات المتصفح' : 'لم يُسمح بعد'; A.$('#dnst').textContent = st; A.$('#dnreq').classList.toggle('hidden', !('Notification' in window) || Notification.permission !== 'default'); };
      dn(); A.$('#dnreq').onclick = function () { Notification.requestPermission().then(dn); };
      A.$('#tst').onclick = function () { var m = A.muted; A.muted = false; A.ding(); A.muted = m; };
      // theme
      var th = prefs.theme, thBox = A.$('.grid > div:last-child .card');
      var live = function () { A.applyTheme(th); paint(); };
      A.bind(thBox, prefs, live);
      function paint() {
        A.$$('#thm .swatch').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-t') === th.preset); });
        A.$$('#mode button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-m') === (th.mode || 'light')); });
        var P = window.SCPatterns;
        A.$('#dpat').innerHTML = P.list.map(function (p) { return '<button class="pat' + (th.pattern === p.id ? ' on' : '') + '" data-p="' + p.id + '"><div class="pv" style="background-color:' + th.side + ';background-image:' + P.css(p.id, '#ffffff', 0.25, 1).replace(/"/g, "'") + '"></div><span>' + esc(p.name) + '</span></button>'; }).join('');
        A.$$('#dpat .pat').forEach(function (b) { b.onclick = function () { th.pattern = b.getAttribute('data-p'); live(); }; });
      }
      var setInputs = function () { ['accent', 'accent2', 'side', 'side2', 'bg'].forEach(function (k) { var i = thBox.querySelector('[data-k="theme.' + k + '"]'); i.value = th[k]; var c = thBox.querySelector('[data-kc="theme.' + k + '"]'); if (c) c.value = th[k]; }); };
      A.$$('#thm .swatch').forEach(function (b) { b.onclick = function () { var t = A.THEMES[b.getAttribute('data-t')]; Object.assign(th, t, { preset: b.getAttribute('data-t') }); delete th.name; setInputs(); live(); }; });
      A.$$('#mode button').forEach(function (b) { b.onclick = function () { th.mode = b.getAttribute('data-m'); live(); }; });
      A.$('#svth').onclick = function () { me.prefs.theme = th; A.savePrefs().then(function () { var st = A.$('#svths'); if (st) st.textContent = '✅ تم الحفظ تلقائياً'; }); };
      // the dashboard look saves itself shortly after each change
      var thT = null;
      thBox.addEventListener('input', function () { clearTimeout(thT); thT = setTimeout(function () { A.$('#svth').onclick(); }, 1200); }, true);
      thBox.addEventListener('click', function (e) { if (e.target.closest('button') && !e.target.closest('#rsth')) { clearTimeout(thT); thT = setTimeout(function () { A.$('#svth').onclick(); }, 1200); } }, true);
      thBox.addEventListener('change', function () { clearTimeout(thT); thT = setTimeout(function () { A.$('#svth').onclick(); }, 1200); }, true);
      A.$('#rsth').onclick = function () { th = prefs.theme = Object.assign({ mode: 'light', font: 'Tajawal', pattern: 'girih12', pattern_opacity: 0.05, preset: 'madinah' }, A.THEMES.madinah); delete th.name; me.prefs.theme = th; A.applyTheme(th); A.savePrefs(); A.route(); };
      paint();
      return function () { A.applyTheme(); };
    }
  });

  A.page('users', {
    title: 'المستخدمون', icon: '👥', role: 'admin',
    render: function (root) {
      function edit(u) {
        var isNew = !u; u = u ? A.clone(u) : { name: '', email: '', password: '', role: 'agent', job_title: '', phone: '', active: 1, avatar: '' };
        var m = A.modal({
          title: isNew ? '➕ مستخدم جديد' : '✏️ تعديل ' + esc(u.name),
          body: '<div class="row" style="gap:14px;margin-bottom:12px"><span id="uav"></span><button class="btn sm soft" id="uavu">صورة</button></div><div class="grid g2">' + f.text('name', 'الاسم') + f.text('job_title', 'المسمى الوظيفي') + f.text('email', 'البريد', { ltr: true }) + f.text('phone', 'الجوال', { ltr: true }) +
            f.text('password', isNew ? 'كلمة المرور' : 'كلمة مرور جديدة <small>(اتركها فارغة لعدم التغيير)</small>', { type: 'password', ltr: true }) + f.select('role', 'الصلاحية', [['agent', 'موظف — المحادثات والطلبات'], ['supervisor', 'مشرف — + الشجرة والمظهر والتقارير'], ['admin', 'مدير النظام — كل شيء']]) + '</div>' + (isNew ? '' : f.sw('active', 'الحساب مفعّل')),
          buttons: [{ label: 'إلغاء', ghost: true }, { label: 'حفظ', onClick: function () { var b = Object.assign({}, u); if (!b.password) delete b.password; return (isNew ? A.api('POST', '/api/users', b) : A.api('PUT', '/api/users/' + u.id, b)).then(function () { A.toast('تم الحفظ', 'ok'); return load(); }); } }]
        });
        A.bind(m.body, u);
        var av = function () { m.body.querySelector('#uav').innerHTML = A.avatar(u, 'lg'); }; av();
        m.body.querySelector('#uavu').onclick = function () { A.pickFile('image/*').then(function (fs) { if (fs[0]) A.readDataURL(fs[0], 256).then(function (d) { u.avatar = d; av(); }); }); };
      }
      function load() {
        return A.GET('/api/users').then(function (users) {
          S.users = users;
          var online = S.online.map(function (o) { return o.id; });
          root.innerHTML = '<div class="card" style="margin-bottom:16px"><h3>🔐 الصلاحيات</h3><p class="sub">لا يمكن لأحد التسجيل بنفسه — مدير النظام فقط يضيف المستخدمين ويحدد صلاحياتهم ويغيّر كلمات مرورهم.</p><div class="tbl-wrap"><table class="t"><thead><tr><th>الصلاحية</th><th>موظف</th><th>مشرف</th><th>مدير النظام</th></tr></thead><tbody>' +
            [['الرد على المحادثات، السجل، الشكاوى', 1, 1, 1], ['الخريطة الذهنية: إضافة وتعديل الأسئلة', 1, 1, 1], ['الإحصائيات', 1, 1, 1], ['تقارير الموظفين، القوائم والأزرار، بيانات الجمعية', 0, 1, 1], ['الشكل والألوان، اللغات، سلوك البوت، التركيب', 0, 1, 1], ['حذف المحادثات والأسئلة والتصنيفات', 0, 1, 1], ['المستخدمون، الإشعارات، قواعد البيانات، الذكاء الاصطناعي', 0, 0, 1], ['النسخ الاحتياطي والتصفير، المواقع، سجل العمليات', 0, 0, 1]]
              .map(function (r) { return '<tr><td>' + r[0] + '</td>' + [1, 2, 3].map(function (i) { return '<td>' + (r[i] ? '✅' : '—') + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div></div>' +
            '<div class="card"><h3>👥 فريق العمل <span class="acts"><button class="btn sm" id="nu">+ مستخدم جديد</button></span></h3><div class="tbl-wrap"><table class="t"><thead><tr><th>المستخدم</th><th>البريد</th><th>الصلاحية</th><th>الحالة</th><th>آخر ظهور</th><th></th></tr></thead><tbody>' +
            users.map(function (u) { return '<tr><td><div class="row">' + A.avatar(u, 'sm') + '<div><b>' + esc(u.name) + '</b><div class="tiny muted">' + esc(u.job_title || '') + '</div></div></div></td><td class="ltr small">' + esc(u.email) + '</td><td><span class="tag ' + ({ admin: 'purple', supervisor: 'blue', agent: 'gray' }[u.role]) + '">' + A.ROLE[u.role] + '</span></td><td>' + (!u.active ? '<span class="tag red">معطّل</span>' : online.indexOf(u.id) >= 0 ? '<span class="row small"><span class="dot on"></span>متصل</span>' : '<span class="row small muted"><span class="dot off"></span>غير متصل</span>') + '</td><td class="small muted">' + A.ago(u.last_seen) + '</td><td style="white-space:nowrap"><button class="btn sm ghost" data-e="' + u.id + '">تعديل</button> <button class="btn sm ghost" data-pw="' + u.id + '">🔑 كلمة المرور</button>' + (u.id !== S.me.id ? ' <button class="btn sm danger ghost" data-d="' + u.id + '">حذف</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
          A.$('#nu').onclick = function () { edit(); };
          A.$$('[data-pw]').forEach(function (b) { b.onclick = function () { var u = users.find(function (x) { return x.id === Number(b.getAttribute('data-pw')); }), pw = { p1: '', p2: '' };
            var m = A.modal({ title: '🔑 تغيير كلمة مرور ' + esc(u.name), body: f.text('p1', 'كلمة المرور الجديدة (8 أحرف على الأقل)', { type: 'password', ltr: true }) + f.text('p2', 'تأكيدها', { type: 'password', ltr: true }),
              buttons: [{ label: 'إلغاء', ghost: true }, { label: 'حفظ', onClick: function () { if (pw.p1.length < 8) { A.toast('8 أحرف على الأقل', 'err'); return false; } if (pw.p1 !== pw.p2) { A.toast('غير متطابقتين', 'err'); return false; } return A.api('PUT', '/api/users/' + u.id, { password: pw.p1 }).then(function () { A.toast('تم تغيير كلمة المرور', 'ok'); }); } }] });
            A.bind(m.body, pw); }; });
          A.$$('[data-e]').forEach(function (b) { b.onclick = function () { edit(users.find(function (x) { return x.id === Number(b.getAttribute('data-e')); })); }; });
          A.$$('[data-d]').forEach(function (b) { b.onclick = function () { A.confirm('حذف المستخدم نهائياً؟', true).then(function (ok) { if (ok) A.api('DELETE', '/api/users/' + b.getAttribute('data-d')).then(load, A.fail); }); }; });
        }).catch(A.fail);
      }
      load();
    }
  });

  A.page('audit', {
    title: 'سجل العمليات', icon: '📜', role: 'admin',
    render: function (root) {
      var L = { login: '🔑 تسجيل دخول', 'user.create': '👤 إنشاء مستخدم', 'user.update': '✏️ تعديل مستخدم', 'user.delete': '🗑️ حذف مستخدم', 'site.update': '⚙️ تعديل إعدادات', 'site.create': '➕ موقع جديد', 'site.delete': '🗑️ حذف موقع', 'site.secret': '🔑 تجديد المفتاح', 'conversation.close': '🔚 إنهاء محادثة', 'conversation.delete': '🗑️ حذف محادثة', 'kb.learn': '🧠 تعلّم إجابة', 'ticket.create': '📝 تسجيل طلب', 'ticket.delete': '🗑️ حذف طلب' };
      A.GET('/api/audit').then(function (rows) {
        root.innerHTML = '<div class="card"><div class="tbl-wrap"><table class="t"><thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>التفاصيل</th></tr></thead><tbody>' + rows.map(function (r) { return '<tr><td class="small muted">' + A.fmtDate(r.created_at) + '</td><td>' + esc(r.user_name || '—') + '</td><td>' + esc(L[r.action] || r.action) + '</td><td class="ltr tiny muted">' + esc(r.details || '') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
      }).catch(A.fail);
    }
  });
})();
