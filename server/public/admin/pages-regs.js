/* Programs open for registration: dates, seats, registration link, poster & image — the bot shows only open ones */
(function () {
  var A = App, S = A.state, esc = A.esc, f = A.f;
  var ST = { open: ['🟢 مفتوح للتسجيل', '#157f3c', '#ecf8f0'], soon: ['⏳ لم يبدأ بعد', '#b45309', '#fff8e6'], ended: ['⌛ انتهى التسجيل', '#6b7280', '#f3f4f6'], full: ['🔒 اكتمل العدد', '#b42318', '#fdf0ef'], off: ['⏸️ متوقف', '#6b7280', '#f3f4f6'] };
  function uid() { return 'p' + Math.random().toString(36).slice(2, 8); }
  function badge(s) { var x = ST[s] || ST.off; return '<span style="font-size:12px;font-weight:800;padding:4px 10px;border-radius:999px;color:' + x[1] + ';background:' + x[2] + '">' + x[0] + '</span>'; }

  A.page('regs', {
    title: 'البرامج المتاحة للتسجيل', icon: '📣', role: 'supervisor',
    hint: 'برامج ودورات بتاريخ بداية ونهاية أو عدد مقاعد — يعرضها البوت ما دام التسجيل مفتوحاً فقط',
    render: function (root) {
      var stats = {}, regsList = [], filter = '', repaint = null;
      A.settingsPage(root, ['regs'], function (el, d, ch) {
        var R = d.regs; R.programs = R.programs || []; R.hub = R.hub || {};
        function load() {
          return A.GET('/api/regs?site=' + S.site.id).then(function (r) { stats = r.stats; regsList = r.items; paintStats(); paintRegs(); });
        }
        function draw() {
          el.innerHTML =
            '<div class="alert info" style="margin-bottom:14px">📣 أضف البرنامج مرة واحدة: يظهر للزوار في المحادثة تلقائياً من تاريخ البداية، ويختفي وحده عند انتهاء التاريخ أو امتلاء المقاعد. إن وضعت <b>رابط تسجيل</b> يفتحه الزائر، وإن تركته فارغاً <b>يسجّل داخل المحادثة</b> باسمه وجواله وتظهر أسماؤهم أسفل الصفحة.</div>' +
            '<div class="row wrap" style="gap:8px;margin-bottom:14px"><button class="btn" id="addp">➕ برنامج جديد</button><span class="grow"></span></div>' +
            '<div id="plist"></div>' +
            '<details class="card" style="margin-bottom:16px"><summary style="cursor:pointer;font-weight:700">⚙️ زر القائمة ورسائل البوت</summary><div style="margin-top:12px">' +
            '<div class="grid g2">' + f.text('regs.hub.label', 'اسم الزر في القائمة', { ph: '📣 البرامج المتاحة للتسجيل' }) + f.text('regs.hub.message', 'الرسالة قبل قائمة البرامج') + '</div>' +
            f.text('regs.hub.none', 'الرسالة إذا لم يكن هناك برنامج مفتوح') + f.text('regs.hub.keywords', 'كلمات يفهم بها البوت الطلب', { hint: 'مفصولة بفاصلة، مثل: ابي اسجل، الدورات المتاحة' }) +
            '<div class="hint">يظهر الزر في القائمة الرئيسية تلقائياً عند وجود برنامج مفتوح، ويختفي عند عدم وجوده. يمكنك تغيير مكانه من «القوائم والأزرار».</div></div></details>' +
            '<div class="card" id="regs"></div>';
          A.bind(el.querySelector('details'), d, function () { syncMenuLabel(); ch(); });
          A.$('#addp', el).onclick = function () {
            R.programs.unshift({ id: uid(), enabled: true, icon: '🎯', title: '', desc: '', from: A.today(), to: '', capacity: '', manual_count: 0, full: false, link: '', poster: '', image: '' });
            ch(); progs(); var t = el.querySelector('[data-pi="0"] [data-k="title"]'); if (t) t.focus();
          };
          progs(); paintRegs();
        }
        // the menu button follows the label typed here
        function syncMenuLabel() {
          var lbl = (R.hub.label || '').trim(); if (!lbl) return;
          var tree = S.site.tree, m = tree && tree.nodes.find(function (n) { return n.id === 'menu'; });
          var b = m && m.options.find(function (o) { return o.action === 'reg_programs'; });
          if (b && b.label !== lbl) { b.label = lbl; A.saveSite({ tree: tree }).catch(function () { }); }
        }
        // the program in the other languages the bot speaks (empty = shown in Arabic)
        function trans() {
          var LG = ((S.site.settings.languages || {}).enabled || ['ar']).filter(function (l) { return l !== 'ar' && S.i18n && S.i18n.langs[l]; });
          if (!LG.length) return '';
          return '<details style="margin-top:6px"><summary style="cursor:pointer;font-weight:700">🌐 الترجمة (' + LG.map(function (l) { return S.i18n.langs[l].name; }).join('، ') + ')</summary><div style="margin-top:8px">' +
            LG.map(function (l) { var dir = S.i18n.langs[l].dir; return '<div class="grid g2" dir="' + dir + '">' + f.text('i18n.' + l + '.title', S.i18n.langs[l].name + ' — ' + (l === 'en' ? 'Program name' : 'اسم البرنامج')) + f.area('i18n.' + l + '.desc', S.i18n.langs[l].name + ' — ' + (l === 'en' ? 'Description' : 'الوصف'), { rows: 2 }) + '</div>'; }).join('') +
            '<div class="hint">إذا تركتها فارغة يظهر البرنامج بالعربية لمن اختار لغة أخرى.</div></div></details>';
        }
        function progs() {
          var box = A.$('#plist', el);
          box.innerHTML = R.programs.length ? R.programs.map(function (p, i) {
            return '<div class="card" data-pi="' + i + '" style="margin-bottom:16px">' +
              '<div class="row wrap" style="gap:8px;margin-bottom:12px"><input class="in" data-k="icon" style="width:56px;text-align:center;font-size:20px"><input class="in" data-k="title" placeholder="اسم البرنامج — مثال: دورة الحاسب للمبتدئين" style="flex:1;min-width:200px;font-weight:700;font-size:16px">' +
              '<span data-st></span>' + f.swi('enabled', 'مفعّل') + '<button class="btn sm danger ghost" data-del>🗑️</button></div>' +
              '<div class="grid" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:16px"><div>' +
              f.area('desc', 'وصف البرنامج', { ph: 'لمن البرنامج؟ ماذا يقدّم؟ الشروط…' }) +
              '<div class="grid g2">' + f.text('from', '📅 يبدأ التسجيل', { type: 'date', ltr: true }) + f.text('to', '📅 ينتهي التسجيل', { type: 'date', ltr: true, hint: 'فارغ = بلا تاريخ نهاية' }) + '</div>' +
              '<div class="grid g2">' + f.num('capacity', '🪑 عدد المقاعد (اختياري)', { ph: 'بلا حد', min: 0 }) + f.num('manual_count', 'مسجّلون من خارج المحادثة', { min: 0, hint: 'مثلاً عبر الرابط — يُخصم من المقاعد' }) + '</div>' +
              f.sw('full', '🔒 اكتمل العدد', 'يغلق التسجيل فوراً ويختفي البرنامج من المحادثة') +
              f.text('link', '🔗 رابط التسجيل (اختياري)', { ltr: true, ph: 'https://forms.gle/…', hint: 'فارغ = يسجّل الزائر داخل المحادثة باسمه وجواله' }) +
              trans() +
              '</div><div><label class="f">🖼️ البوستر</label><div data-poster></div><label class="f" style="margin-top:12px">📷 صورة إضافية <small>(اختياري)</small></label><div data-image></div></div></div>' +
              '<div class="tiny muted" data-stats style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)"></div></div>';
          }).join('') : '<div class="card" style="margin-bottom:16px"><p class="muted" style="margin:0">لا توجد برامج بعد — اضغط «➕ برنامج جديد».</p></div>';
          A.$$('[data-pi]', el).forEach(function (card) {
            var i = Number(card.getAttribute('data-pi')), p = R.programs[i];
            if (p.enabled === undefined) p.enabled = true;
            A.bind(card, p, function () { ch(); paintStats(); });
            A.imageField(card.querySelector('[data-poster]'), function () { return p.poster; }, function (v) { p.poster = v; ch(); });
            A.imageField(card.querySelector('[data-image]'), function () { return p.image; }, function (v) { p.image = v; ch(); });
            card.querySelector('[data-del]').onclick = function () {
              A.confirm('حذف برنامج «' + (p.title || '') + '»؟ (تبقى أسماء المسجلين محفوظة)').then(function (ok) { if (ok) { R.programs.splice(i, 1); ch(); progs(); } });
            };
          });
          paintStats();
        }
        function paintStats() {
          A.$$('[data-pi]', el).forEach(function (card) {
            var p = R.programs[Number(card.getAttribute('data-pi'))], s = stats[p.id];
            var st = s ? s.status : (p.enabled === false ? 'off' : 'open');
            card.querySelector('[data-st]').innerHTML = s ? badge(st) : '<span class="tiny muted">يُحسب بعد الحفظ…</span>';
            card.querySelector('[data-stats]').innerHTML = s ? ('👥 سجّلوا عبر المحادثة: <b>' + s.regs + '</b>' + (p.link ? ' · 🔗 نقرات رابط التسجيل: <b>' + s.clicks + '</b>' : '') + (s.left != null ? ' · 🪑 المقاعد المتبقية: <b>' + s.left + '</b>' : '')) : '';
          });
        }
        function paintRegs() {
          var box = A.$('#regs', el); if (!box) return;
          var names = {}; R.programs.forEach(function (p) { names[p.id] = p.title; });
          var rows = regsList.filter(function (r) { return !filter || r.program_id === filter; });
          box.innerHTML = '<div class="row wrap" style="gap:8px;margin-bottom:10px"><h3 style="margin:0">👥 المسجّلون عبر المحادثة (' + rows.length + ')</h3><span class="grow"></span>' +
            '<select class="in" id="rf" style="width:auto"><option value="">كل البرامج</option>' + R.programs.map(function (p) { return '<option value="' + esc(p.id) + '"' + (filter === p.id ? ' selected' : '') + '>' + esc(p.title || '—') + '</option>'; }).join('') + '</select>' +
            '<a class="btn sm soft" href="/api/regs/export?site=' + S.site.id + '&token=' + encodeURIComponent(S.token) + '">⬇️ تنزيل (Excel)</a></div>' +
            (rows.length ? '<div class="tbl-wrap"><table class="t"><thead><tr><th>الرقم</th><th>البرنامج</th><th>الاسم</th><th>الجوال</th><th>التاريخ</th><th></th></tr></thead><tbody>' +
              rows.map(function (r) { return '<tr><td><b>REG-' + r.id + '</b></td><td>' + esc(names[r.program_id] || '—') + '</td><td>' + esc(r.name) + '</td><td dir="ltr">' + esc(r.phone || '') + '</td><td class="small">' + esc(r.created_at.replace('T', ' ').slice(0, 16)) + '</td><td><button class="btn sm danger ghost icon" data-rd="' + r.id + '">✕</button></td></tr>'; }).join('') +
              '</tbody></table></div>' : '<p class="muted" style="margin:0">لا يوجد مسجّلون بعد. البرامج التي لها رابط تسجيل يسجّل زوارها في الرابط نفسه.</p>');
          A.$('#rf', box).onchange = function () { filter = this.value; paintRegs(); };
          A.$$('[data-rd]', box).forEach(function (b) { b.onclick = function () { A.confirm('حذف هذا التسجيل؟').then(function (ok) { if (ok) A.api('DELETE', '/api/regs/' + b.getAttribute('data-rd')).then(load, A.fail); }); }; });
        }
        repaint = function () { paintStats(); paintRegs(); };
        draw(); load();
      }, { onSaved: function () { A.GET('/api/regs?site=' + S.site.id).then(function (r) { stats = r.stats; regsList = r.items; if (repaint) repaint(); }); } }); // status follows every save
    }
  });
})();
