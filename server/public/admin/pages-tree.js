/* Reply-tree editor (n8n-style canvas: drag from palette, drag nodes, drag ports to link) */
(function () {
  'use strict';
  var A = App, S = A.state, esc = A.esc;

  var ACTIONS = {
    goto: { icon: '➡️', name: 'انتقال لعقدة', desc: 'يعرض عقدة أخرى (قائمة فرعية)' },
    answer: { icon: '💬', name: 'إجابة مباشرة', desc: 'نص + صورة/فيديو/PDF' },
    about: { icon: '🏢', name: 'عن الجمعية', desc: 'قائمة بكل أقسام التعريف' },
    location: { icon: '📍', name: 'الموقع (خريطة)', desc: 'خريطة واحدة، أو قائمة الفروع' },
    branch: { icon: '🏢', name: 'فرع محدد', desc: 'خريطة وأرقام فرع واحد' },
    banks: { icon: '🏦', name: 'الحسابات البنكية', desc: 'الآيبان مع زر نسخ' },
    kb_browse: { icon: '🧠', name: 'الأسئلة الشائعة', desc: 'تصفّح الخريطة الذهنية' },
    org: { icon: '📄', name: 'معلومة محددة', desc: 'قسم من «عن الجمعية» أو التواصل…' },
    ticket: { icon: '📝', name: 'شكوى / اقتراح', desc: 'نموذج: اسم، جوال، نص' },
    ticket_status: { icon: '🔎', name: 'متابعة طلب', desc: 'بالرقم C-1001' },
    handoff: { icon: '👨‍💼', name: 'تحويل لموظف', desc: 'اختياري — البوت يحوّل تلقائياً عند الحاجة' },
    kb: { icon: '📚', name: 'سؤال من المعرفة', desc: 'إجابة محفوظة' },
    url: { icon: '🔗', name: 'رابط', desc: 'يفتح صفحة' },
    reg_programs: { icon: '📣', name: 'البرامج المتاحة للتسجيل', desc: 'تظهر تلقائياً ما دام التسجيل مفتوحاً' },
    lookups_menu: { icon: '🔎', name: 'قائمة الاستعلامات', desc: 'طلباتي وبياناتي — تتحدث تلقائياً' },
    order_status: { icon: '📦', name: 'حالة الطلب (مدمج)', desc: 'استعلام «حالة الطلب» من قاعدة البيانات' },
    customer_info: { icon: '🪪', name: 'بيانات المستفيد (مدمج)', desc: 'استعلام «بيانات المستفيد» المدمج' },
    lookup: { icon: '🔎', name: 'استعلام مخصص', desc: 'من أي قاعدة بيانات مربوطة' },
    catalog: { icon: '📋', name: 'قائمة (منيو، خدمات، أطباء…)', desc: 'من صفحة «نشاطك وقوائمه»' },
    appointment_lookup: { icon: '🕒', name: 'متى موعدي؟', desc: 'يكتب اسمه فيظهر له موعده من صفحة المواعيد' },
    eligibility_menu: { icon: '📋', name: 'قائمة حساب الاستحقاق', desc: 'كل برامج الاستحقاق الظاهرة' },
    eligibility: { icon: '🧮', name: 'حاسبة الاستحقاق', desc: 'أسئلة ثم: مؤهل / غير مؤهل + القيمة' },
    developer: { icon: '🛠️', name: 'مطوّر البرنامج', desc: 'رابط المطوّر' },
    end: { icon: '✋', name: 'إنهاء المحادثة', desc: 'ثم التقييم' }
  };
  A.TREE_ACTIONS = ACTIONS; // editions may add their own buttons
  var ORG_BASE = [['contact', '📞 أرقام التواصل'], ['hours', '🕘 ساعات العمل'], ['website', '🌐 الموقع الإلكتروني'], ['social', '📱 حسابات التواصل'], ['location', '📍 الموقع'], ['developer', '🛠️ مطوّر البرنامج']];
  var ORG_FIELDS = ORG_BASE;
  function orgFields() { return ((S.site.settings.org.sections) || []).map(function (x) { return ['section:' + x.id, '📄 ' + (x.title || x.id)]; }).concat(ORG_BASE); }
  var TEMPLATES = {
    menu: { icon: '🔢', name: 'قائمة مرقّمة', desc: 'رسالة + خيارات بأرقام', node: { title: 'قائمة جديدة', message: 'اختر رقم الخدمة:', numbered: true, options: [{ label: '↩️ القائمة الرئيسية', action: 'goto', target: 'menu' }] } },
    msg: { icon: '💬', name: 'رسالة وأزرار', desc: 'رسالة بأزرار عادية', node: { title: 'رسالة', message: 'اكتب الرسالة هنا', options: [] } },
    info: { icon: '🖼️', name: 'معلومة بمرفق', desc: 'نص + صورة/فيديو/PDF', node: { title: 'طريقة التسجيل', message: 'هذه خطوات التسجيل 👇', media: [], options: [{ label: '🏠 القائمة الرئيسية', action: 'goto', target: 'menu' }, { label: '💬 التحدث مع موظف', action: 'handoff' }] } },
    org: { icon: '🏢', name: 'معلومات وخدمات', desc: 'عن الجمعية، الموقع، الحسابات', node: { title: 'معلومات عنا', message: 'ماذا تريد أن تعرف؟', numbered: true, options: [{ label: '🏢 عن الجمعية', action: 'about' }, { label: '📍 موقعنا', action: 'location' }, { label: '📞 أرقام التواصل', action: 'org', field: 'contact' }, { label: '🏦 الحسابات البنكية', action: 'banks' }, { label: '↩️ القائمة الرئيسية', action: 'goto', target: 'menu' }] } },
    tickets: { icon: '📝', name: 'شكاوى واقتراحات', desc: 'نماذج مرقّمة تلقائياً', node: { title: 'الشكاوى والاقتراحات', message: 'كيف نخدمك؟', numbered: true, options: [{ label: '📝 تقديم شكوى', action: 'ticket', field: 'complaint' }, { label: '💡 تقديم اقتراح', action: 'ticket', field: 'suggestion' }, { label: '🔎 متابعة طلب سابق', action: 'ticket_status' }, { label: '↩️ القائمة الرئيسية', action: 'goto', target: 'menu' }] } },
    faq: { icon: '🧠', name: 'أسئلة شائعة', desc: 'من الخريطة الذهنية', node: { title: 'الأسئلة الشائعة', message: 'اختر الموضوع:', numbered: true, options: [{ label: '❓ تصفّح الأسئلة', action: 'kb_browse' }, { label: '↩️ القائمة الرئيسية', action: 'goto', target: 'menu' }] } }
  };
  /* quick editor for the main menu: rename, reorder, show / hide — works on the given tree, then onApply(tree) */
  A.menuEditor = function (tree, onApply) {
    var menu = tree.nodes.find(function (n) { return n.id === 'menu'; }) || tree.nodes.find(function (n) { return n.id === tree.root; });
    if (!menu) return A.toast('لم أجد القائمة الرئيسية', 'err');
    var opts = menu.options.map(function (o) { return A.clone(o); });
    var m = A.modal({ title: '✏️ أزرار القائمة الرئيسية', size: 'wide', body: '<div id="me"></div>', buttons: [{ label: 'إلغاء', ghost: true }, { label: '✅ تطبيق', onClick: function () {
      if (opts.some(function (o) { return !String(o.label || '').trim(); })) { A.toast('اكتب اسماً لكل زر', 'err'); return false; }
      menu.options = opts; return onApply(tree);
    } }] });
    function draw() {
      var n = 0;
      A.$('#me', m.body).innerHTML = '<p class="small muted">غيّر اسم أي زر، أو رتّبه بالأسهم، أو أخفِه من القائمة دون حذفه. الأرقام تتحدّث تلقائياً حسب الأزرار الظاهرة.</p>' + opts.map(function (o, i) {
        var a = ACTIONS[o.action] || { icon: '•', name: o.action };
        return '<div class="row" style="gap:6px;margin-bottom:8px;' + (o.hidden ? 'opacity:.5' : '') + '"><b class="chip" style="min-width:34px;justify-content:center">' + (o.hidden ? '—' : ++n) + '</b>' +
          '<input class="in" data-l="' + i + '" value="' + esc(o.label) + '" style="flex:1;font-weight:700">' +
          '<input class="in" data-en="' + i + '" value="' + esc((o.i18n && o.i18n.en && o.i18n.en.label) || '') + '" placeholder="English" dir="ltr" style="width:170px">' +
          '<span class="tiny muted" style="width:120px">' + a.icon + ' ' + esc(a.name) + '</span>' +
          '<button class="btn sm ghost icon" data-u="' + i + '">↑</button><button class="btn sm ghost icon" data-d="' + i + '">↓</button>' +
          '<button class="btn sm ' + (o.hidden ? 'soft' : 'ghost') + '" data-h="' + i + '" title="إظهار / إخفاء">' + (o.hidden ? '🙈 مخفي' : '👁️ ظاهر') + '</button></div>';
      }).join('');
      A.$$('[data-l]', m.body).forEach(function (x) { x.oninput = function () { opts[x.getAttribute('data-l')].label = x.value; }; });
      A.$$('[data-en]', m.body).forEach(function (x) { x.oninput = function () { var o = opts[x.getAttribute('data-en')]; o.i18n = o.i18n || {}; o.i18n.en = o.i18n.en || {}; o.i18n.en.label = x.value; }; });
      var mv = function (i, d) { var j = i + d; if (j < 0 || j >= opts.length) return; var t = opts[i]; opts[i] = opts[j]; opts[j] = t; draw(); };
      A.$$('[data-u]', m.body).forEach(function (b) { b.onclick = function () { mv(Number(b.getAttribute('data-u')), -1); }; });
      A.$$('[data-d]', m.body).forEach(function (b) { b.onclick = function () { mv(Number(b.getAttribute('data-d')), 1); }; });
      A.$$('[data-h]', m.body).forEach(function (b) { b.onclick = function () { var o = opts[b.getAttribute('data-h')]; o.hidden = !o.hidden; draw(); }; });
    }
    draw();
  };
  // ready-made menus: built from the site's current queries / programs and linked to the main menu when dropped
  var HOME = { label: '↩️ القائمة الرئيسية', action: 'goto', target: 'menu' };
  var READY = {
    queries: { icon: '🔎', name: 'طلباتي وبياناتي', desc: 'كل استعلامات قاعدة البيانات', build: function () {
      var L = ((S.site.settings.datasource || {}).lookups || []).filter(function (l) { return l.query; });
      var opts = L.length ? L.map(function (l) { return { label: (l.id === 'my_data' ? '🪪 ' : '🔎 ') + (l.title || l.id), action: 'lookup', target: l.id }; }) : [{ label: '📦 حالة الطلب', action: 'order_status' }, { label: '🪪 بيانات المستفيد', action: 'customer_info' }];
      return { title: 'طلباتي وبياناتي', message: 'ماذا تريد أن تستعلم عنه؟ 🔎', numbered: true, options: opts.concat([{ label: '🔎 متابعة شكوى أو اقتراح', action: 'ticket_status' }, HOME]) };
    } },
    elig: { icon: '🧮', name: 'حساب الاستحقاق', desc: 'برامج الاستحقاق كلها', build: function () {
      var P = (((S.site.settings.eligibility || {}).programs) || []).filter(function (p) { return p.enabled !== false && (p.questions || []).length; });
      return { title: 'حساب آلية الاستحقاق', message: 'اختر نوع المساعدة لمعرفة أهليتك وقيمة استحقاقك 🧮', numbered: true, options: P.map(function (p) { return { label: '🧮 ' + p.title, action: 'eligibility', target: p.id }; }).concat([HOME]) };
    } },
    contact: { icon: '📞', name: 'تواصل معنا', desc: 'الأرقام، الموقع، الحسابات، موظف', build: function () {
      return { title: 'تواصل معنا', message: 'كيف تحب أن تتواصل معنا؟', numbered: true, options: [{ label: '📞 أرقام التواصل', action: 'org', field: 'contact' }, { label: '📍 موقعنا على الخريطة', action: 'location' }, { label: '📱 حسابات التواصل', action: 'org', field: 'social' }, { label: '🏦 الحسابات البنكية', action: 'banks' }, { label: '👨‍💼 التحدث مع موظف', action: 'handoff' }, HOME] };
    } },
    services: { icon: '🗂️', name: 'خدماتنا', desc: 'عن الجمعية، الأسئلة، الشكاوى', build: function () {
      return { title: 'خدماتنا', message: 'اختر الخدمة:', numbered: true, options: [{ label: '🏢 تعرّف علينا', action: 'about' }, { label: '❓ الأسئلة الشائعة', action: 'kb_browse' }, { label: '📝 تقديم شكوى', action: 'ticket', field: 'complaint' }, { label: '💡 تقديم اقتراح', action: 'ticket', field: 'suggestion' }, { label: '🔎 متابعة طلب سابق', action: 'ticket_status' }, HOME] };
    } }
  };
  function uid() { return 'n' + Math.random().toString(36).slice(2, 8); }
  function actLabel(o, tree) {
    var a = ACTIONS[o.action] || { icon: '?', name: o.action };
    if (o.action === 'goto') { var n = tree.nodes.find(function (x) { return x.id === o.target; }); return '➡️ ' + (n ? n.title || n.id : 'غير مربوط ⚠️'); }
    if (o.action === 'org') { var f = orgFields().find(function (x) { return x[0] === o.field; }); return f ? f[1] : a.icon + ' ' + a.name; }
    if (o.action === 'ticket') return o.field === 'suggestion' ? '💡 اقتراح' : o.field === 'inquiry' ? '❓ استفسار' : o.field === 'callback' ? '📞 طلب تواصل / موعد' : '📝 شكوى';
    return a.icon + ' ' + a.name;
  }

  A.page('tree', {
    title: 'شجرة الردود', icon: '🌳', full: true, role: 'supervisor',
    render: function (root) {
      var tree = A.clone(S.site.tree), sel = null, view = { x: 0, y: 0, k: 0.8 }, kbList = [];
      tree.nodes.forEach(function (n) { n.options = n.options || []; });
      A.GET('/api/kb?site=' + S.site.id).then(function (k) { kbList = k; });
      var DYN = [].concat(((S.site.settings.datasource || {}).lookups || []).filter(function (l) { return l.query; }).map(function (l) { return { act: 'lookup', target: l.id, icon: '🔎', label: l.title || l.id }; }),
        (((S.site.settings.eligibility || {}).programs) || []).map(function (p) { return { act: 'eligibility', target: p.id, icon: '🧮', label: p.title || p.id }; }),
        (((S.site.settings.biz || {}).catalogs) || []).map(function (c) { return { act: 'catalog', target: c.id, icon: c.icon || '📋', label: c.title || c.id }; }));
      root.innerHTML = '<div class="tree-wrap"><aside class="palette"><button class="btn gold" id="tpl2" style="width:100%;margin-bottom:14px">📋 شجرة كاملة جاهزة لنوع جهتك<br><small style="font-weight:400">جمعية · مؤسسة · شركة · مقهى · صالون…</small></button><div class="section-title"><h2>⚡ قوائم جاهزة</h2></div><p class="tiny muted" style="margin:-8px 0 8px">اسحبها إلى المساحة (أو اضغطها) — تعمل فوراً وتُضاف للقائمة الرئيسية</p>' +
        Object.keys(READY).map(function (k) { var t = READY[k]; return '<div class="pi" draggable="true" data-ready="' + k + '" style="border-color:var(--primary)"><i>' + t.icon + '</i><div><b>' + t.name + '</b><small>' + t.desc + '</small></div></div>'; }).join('') +
        (DYN.length ? '<div class="section-title" style="margin-top:16px"><h2>استعلاماتك وبرامجك</h2></div><p class="tiny muted" style="margin:-8px 0 8px">اسحبها إلى أي عقدة</p>' + DYN.map(function (d) { return '<div class="pi" draggable="true" data-act="' + d.act + '" data-target="' + esc(d.target) + '" data-label="' + esc(d.icon + ' ' + d.label) + '" style="padding:7px 10px"><i style="font-size:16px;width:26px;height:26px">' + d.icon + '</i><div><b class="small">' + esc(d.label) + '</b></div></div>'; }).join('') : '') +
        '<div class="section-title" style="margin-top:16px"><h2>عُقد فارغة</h2></div>' +
        Object.keys(TEMPLATES).map(function (k) { var t = TEMPLATES[k]; return '<div class="pi" draggable="true" data-tpl="' + k + '"><i>' + t.icon + '</i><div><b>' + t.name + '</b><small>' + t.desc + '</small></div></div>'; }).join('') +
        '<div class="section-title" style="margin-top:16px"><h2>أزرار</h2></div><p class="tiny muted" style="margin:-8px 0 8px">اسحب الزر وأفلته على أي عقدة</p>' +
        Object.keys(ACTIONS).map(function (k) { var a = ACTIONS[k]; return '<div class="pi" draggable="true" data-act="' + k + '" style="padding:7px 10px"><i style="font-size:16px;width:26px;height:26px">' + a.icon + '</i><div><b class="small">' + a.name + '</b></div></div>'; }).join('') +
        '</aside><div class="canvas" id="cv"><div class="help">🖱️ اسحب الخلفية للتحريك · العجلة للتكبير · اسحب ● من الزر إلى عقدة لربطهما</div><div class="world" id="wd"><svg class="links" id="lk" width="1" height="1"></svg></div>' +
        '<div class="zoom"><button class="btn ghost icon" id="zi">＋</button><button class="btn ghost icon" id="zo">－</button><button class="btn ghost sm" id="zf">⤢ ملاءمة</button><button class="btn ghost sm" id="ar">🧹 ترتيب تلقائي</button></div></div>' +
        '<aside class="inspector" id="ins"></aside></div>' +
        '<div class="savebar" style="margin:0;position:fixed;bottom:0;inset-inline:250px 0;z-index:30"><span class="dirty"></span><button class="btn soft" id="chk">🩺 فحص الأزرار</button><button class="btn soft" id="medit">✏️ تعديل أزرار القائمة الرئيسية</button><button class="btn ghost" id="tpl">📋 شجرة جاهزة حسب نوع الجهة</button><button class="btn" id="sv" style="display:none">💾 حفظ الشجرة</button></div>';
      var cv = A.$('#cv'), wd = A.$('#wd'), lk = A.$('#lk'), ins = A.$('#ins');
      var tTimer = null, tSaving = false, tAgain = false;
      function tStatus(t) { var d = A.$('.savebar .dirty'); if (d) d.textContent = t; }
      function saveTree() {
        clearTimeout(tTimer);
        if (tSaving) { tAgain = true; return Promise.resolve(); }
        tSaving = true; tStatus('💾 جارٍ الحفظ…');
        var broken = checkTree().filter(function (x) { return x[0] === '❌'; }).length;
        return A.saveSite({ tree: tree }).then(function () { if (!tAgain) { A.setDirty(false); App.flushSave = null; } tStatus('✅ تم الحفظ تلقائياً' + (broken ? ' — ⚠️ ' + broken + ' زر يحتاج إصلاحاً (🩺 فحص الأزرار)' : '')); },
          function (e) { tStatus('⚠️ لم يُحفظ — ' + (e.message || '')); A.fail(e); }).then(function () { tSaving = false; if (tAgain) { tAgain = false; saveTree(); } });
      }
      // the tree saves itself a moment after each change
      var dirty = function () { A.setDirty(true); tStatus('● جارٍ الحفظ تلقائياً…'); clearTimeout(tTimer); tTimer = setTimeout(saveTree, 1200); App.flushSave = saveTree; };

      function applyView() { wd.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.k + ')'; }
      function toWorld(cx, cy) { var r = cv.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k }; }

      function nodeHTML(n) {
        var isRoot = n.id === tree.root;
        return '<div class="node' + (isRoot ? ' root' : '') + (sel === n.id ? ' sel' : '') + '" data-id="' + n.id + '" style="left:' + n.x + 'px;top:' + n.y + 'px"><span class="port in" title="مدخل"></span>' +
          '<div class="nh">' + (isRoot ? '<span class="badge">البداية</span>' : '') + (n.numbered ? '<span class="badge" style="background:var(--accent);color:#fff">123</span>' : '') + '<b>' + esc(n.title || n.id) + '</b><span class="tiny muted">' + esc(n.id) + '</span></div>' +
          '<div class="nm">' + esc(n.message || '') + (n.media && n.media.length ? '\n📎 ' + n.media.length + ' مرفق' : '') + (n.auto_next ? '\n⤵️ ثم: ' + esc((tree.nodes.find(function (x) { return x.id === n.auto_next; }) || {}).title || n.auto_next) : '') + '</div>' +
          '<div class="no">' + n.options.map(function (o, i) { return '<div class="op" data-i="' + i + '">' + (n.numbered ? '<span class="n">' + (i + 1) + '</span>' : '') + '<span class="lb">' + esc(o.label) + '</span><span class="ac">' + esc(actLabel(o, tree)) + '</span><span class="port" data-port="' + i + '" title="اسحب لربط"></span></div>'; }).join('') +
          '<button class="addop" data-add>+ زر</button></div></div>';
      }
      function draw() {
        A.$$('.node', wd).forEach(function (e) { e.remove(); });
        wd.insertAdjacentHTML('beforeend', tree.nodes.map(nodeHTML).join(''));
        A.$$('.node', wd).forEach(bindNode);
        links();
      }
      function center(el) { var r = el.getBoundingClientRect(), p = toWorld(r.left + r.width / 2, r.top + r.height / 2); return p; }
      function links() {
        var paths = '';
        tree.nodes.forEach(function (n) {
          var ne = wd.querySelector('.node[data-id="' + n.id + '"]'); if (!ne) return;
          n.options.forEach(function (o, i) {
            if (o.action !== 'goto' || !o.target) return;
            var te = wd.querySelector('.node[data-id="' + o.target + '"] .port.in'), pe = ne.querySelector('[data-port="' + i + '"]');
            if (!te || !pe) return; paths += curve(center(pe), center(te), '');
          });
          if (n.auto_next) { var t2 = wd.querySelector('.node[data-id="' + n.auto_next + '"] .port.in'); if (t2) { var h = center(ne.querySelector('.nh')); paths += curve({ x: h.x - 125, y: h.y }, center(t2), 'auto'); } }
        });
        lk.innerHTML = paths + '<path class="link temp" id="tmp" d=""/>';
      }
      function curve(a, b, cls) { var dx = Math.max(50, Math.abs(b.x - a.x) / 2); return '<path class="link ' + cls + '" d="M' + a.x + ' ' + a.y + ' C' + (a.x - dx) + ' ' + a.y + ' ' + (b.x + dx) + ' ' + b.y + ' ' + b.x + ' ' + b.y + '"/>'; }

      function bindNode(el) {
        var id = el.getAttribute('data-id'), n = tree.nodes.find(function (x) { return x.id === id; });
        el.addEventListener('mousedown', function (e) { e.stopPropagation(); });
        el.addEventListener('click', function (e) { if (e.target.closest('[data-add]')) return; if (sel !== id) { sel = id; A.$$('.node', wd).forEach(function (x) { x.classList.toggle('sel', x === el); }); inspect(); } });
        el.querySelector('.nh').addEventListener('mousedown', function (e) {
          if (e.button !== 0) return; e.preventDefault();
          var sx = e.clientX, sy = e.clientY, ox = n.x, oy = n.y, moved = false;
          var mv = function (ev) { moved = true; n.x = Math.round(ox + (ev.clientX - sx) / view.k); n.y = Math.round(oy + (ev.clientY - sy) / view.k); el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; links(); };
          var up = function () { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); if (moved) dirty(); };
          document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
        });
        el.querySelector('[data-add]').onclick = function (e) { e.stopPropagation(); sel = id; addOption(n); };
        A.$$('.op', el).forEach(function (op) { op.addEventListener('click', function (e) { if (e.target.classList.contains('port')) return; sel = id; draw(); inspect(Number(op.getAttribute('data-i'))); }); });
        A.$$('[data-port]', el).forEach(function (p) {
          p.addEventListener('mousedown', function (e) {
            e.preventDefault(); e.stopPropagation();
            var i = Number(p.getAttribute('data-port')), a = center(p), tmp = A.$('#tmp');
            var mv = function (ev) { var b = toWorld(ev.clientX, ev.clientY); tmp.setAttribute('d', 'M' + a.x + ' ' + a.y + ' L' + b.x + ' ' + b.y); };
            var up = function (ev) {
              document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); tmp.setAttribute('d', '');
              var target = document.elementFromPoint(ev.clientX, ev.clientY), tn = target && target.closest('.node');
              var o = n.options[i];
              if (tn && tn.getAttribute('data-id') !== id) { o.action = 'goto'; o.target = tn.getAttribute('data-id'); }
              else if (!tn && target && target.closest('#cv')) { // dropped on empty canvas → create a linked node
                var w = toWorld(ev.clientX, ev.clientY), nn = { id: uid(), title: o.label.replace(/^[^\p{L}\p{N}]+/u, '') || 'عقدة جديدة', message: '', numbered: true, x: Math.round(w.x), y: Math.round(w.y), options: [{ label: '↩️ القائمة الرئيسية', action: 'goto', target: 'menu' }] };
                tree.nodes.push(nn); o.action = 'goto'; o.target = nn.id; sel = nn.id;
              } else return;
              dirty(); draw(); inspect();
            };
            document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
          });
        });
        // drop a palette button onto a node
        el.addEventListener('dragover', function (e) { if (dragData && dragData.act) { e.preventDefault(); e.stopPropagation(); el.classList.add('sel'); } });
        el.addEventListener('dragleave', function () { if (sel !== id) el.classList.remove('sel'); });
        el.addEventListener('drop', function (e) {
          if (!dragData || !dragData.act) return; e.preventDefault(); e.stopPropagation();
          var o = newOpt(dragData.act, dragData.target, dragData.label); dragData = null; sel = id;
          n.options.push(o); dirty(); draw(); inspect(n.options.length - 1);
        });
      }

      function addOption(n) {
        var m = A.modal({ title: '➕ إضافة زر إلى «' + esc(n.title || n.id) + '» — ماذا يفعل الزر؟', size: 'wide', buttons: false,
          body: '<div class="actgrid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">' + Object.keys(ACTIONS).map(function (k) { var a = ACTIONS[k]; return '<button data-a="' + k + '"><i>' + a.icon + '</i><b>' + a.name + '</b><span class="tiny muted">' + a.desc + '</span></button>'; }).join('') + '</div>' });
        A.$$('[data-a]', m.body).forEach(function (b) {
          b.onclick = function () {
            var act = b.getAttribute('data-a'), o = { label: ACTIONS[act].icon + ' ' + ACTIONS[act].name, action: act };
            if (act === 'org') o.field = 'contact'; if (act === 'ticket') o.field = 'complaint'; if (act === 'goto') o.target = '';
            n.options.push(o); m.close(); dirty(); draw(); inspect(n.options.length - 1);
          };
        });
      }

      function inspect(focusOpt) {
        var n = tree.nodes.find(function (x) { return x.id === sel; });
        if (!n) {
          ins.innerHTML = '<div class="empty"><div class="ic">👆</div><b>اختر عقدة لتعديلها</b><p class="small muted">أو اسحب عقدة من القائمة الجانبية إلى مساحة العمل</p></div>' +
            '<div class="card flat" style="padding:12px;margin-top:10px"><b class="small">كيف تعمل الشجرة؟</b><ol class="small muted" style="padding-inline-start:18px;margin:8px 0 0;line-height:1.9"><li>عقدة <b>البداية</b> ترحّب بالمستفيد ثم تنتقل تلقائياً للقائمة الرئيسية.</li><li>القائمة <b>المرقّمة</b> تسمح للمستفيد بكتابة الرقم (1، 2…) أو الضغط على الزر.</li><li>كل زر له إجراء: انتقال، إجابة بمرفق، خريطة، شكوى، تحويل لموظف…</li><li>إذا كتب المستفيد سؤالاً يبحث البوت في قاعدة المعرفة، وإن لم يجد يحوّله لموظف ويتعلّم من رده.</li></ol></div>';
          return;
        }
        n.i18n = n.i18n || {}; n.i18n.en = n.i18n.en || {}; n.i18n.ur = n.i18n.ur || {};
        var others = tree.nodes.filter(function (x) { return x.id !== n.id; });
        var nodeOpts = function (v, empty) { return '<option value="">' + (empty || '— اختر —') + '</option>' + others.map(function (x) { return '<option value="' + x.id + '"' + (x.id === v ? ' selected' : '') + '>' + esc(x.title || x.id) + '</option>'; }).join(''); };
        ins.innerHTML = '<div class="row between" style="margin-bottom:12px"><h3 style="font-size:16px">✏️ ' + esc(n.title || n.id) + '</h3><div class="row" style="gap:4px">' + (n.id !== tree.root ? '<button class="btn sm ghost" id="mkroot" title="اجعلها البداية">🚩</button>' : '') + '<button class="btn sm ghost" id="dup" title="نسخ">⧉</button>' + (n.id !== tree.root ? '<button class="btn sm danger ghost" id="del" title="حذف">🗑️</button>' : '') + '</div></div>' +
          A.f.text('title', 'اسم العقدة <small>(للتنظيم فقط)</small>') +
          '<div class="tabs" id="lt" style="margin-bottom:10px"><button data-l="ar" class="on">العربية</button><button data-l="en">English</button><button data-l="ur">اردو</button></div>' +
          '<div data-lp="ar">' + A.f.area('message', 'رسالة البوت', { rows: 4, hint: 'متغيرات: {name} اسم المستفيد، {bot} اسم البوت، {org} اسم الجهة — و *نص* للخط العريض' }) + '</div>' +
          '<div data-lp="en" class="hidden">' + A.f.area('i18n.en.message', 'Bot message (English)', { rows: 4, ph: 'اتركه فارغاً لاستخدام العربي' }) + '</div>' +
          '<div data-lp="ur" class="hidden">' + A.f.area('i18n.ur.message', 'پیغام (اردو)', { rows: 4, ph: 'اتركه فارغاً لاستخدام العربي' }) + '</div>' +
          '<div class="field"><label class="f">مرفقات مع الرسالة</label><div id="nmedia"></div></div>' +
          A.f.sw('numbered', '🔢 قائمة مرقّمة', 'يظهر رقم بجانب كل خيار ويستطيع المستفيد كتابة الرقم') +
          '<div class="field" style="margin-top:10px"><label class="f">⤵️ بعدها انتقل تلقائياً إلى</label><select class="in" id="anx">' + nodeOpts(n.auto_next, '— لا شيء —') + '</select><div class="hint">مثال: رسالة الترحيب ← القائمة الرئيسية</div></div>' +
          '<div class="section-title" style="margin-top:16px"><h2>الأزرار (' + n.options.length + ')</h2></div><div id="opts"></div><button class="btn soft" id="addo" style="width:100%">+ إضافة زر</button>';
        A.bind(ins, n, function () { dirty(); refreshNode(n); });
        A.$$('#lt button', ins).forEach(function (b) { b.onclick = function () { var l = b.getAttribute('data-l'); A.$$('#lt button', ins).forEach(function (x) { x.classList.toggle('on', x === b); }); A.$$('[data-lp]', ins).forEach(function (p) { p.classList.toggle('hidden', p.getAttribute('data-lp') !== l); }); }; });
        n.media = n.media || [];
        A.mediaEditor(A.$('#nmedia', ins), n.media, function () { dirty(); refreshNode(n); });
        A.$('#anx', ins).onchange = function () { n.auto_next = this.value || undefined; dirty(); draw(); };
        A.$('#addo', ins).onclick = function () { addOption(n); };
        if (A.$('#mkroot', ins)) A.$('#mkroot', ins).onclick = function () { tree.root = n.id; dirty(); draw(); inspect(); };
        A.$('#dup', ins).onclick = function () { var c = A.clone(n); c.id = uid(); c.title = (c.title || '') + ' (نسخة)'; c.x += 40; c.y += 40; tree.nodes.push(c); sel = c.id; dirty(); draw(); inspect(); };
        if (A.$('#del', ins)) A.$('#del', ins).onclick = function () {
          A.confirm('حذف العقدة «' + (n.title || n.id) + '»؟ الأزرار المربوطة بها ستصبح غير مربوطة.', true).then(function (ok) {
            if (!ok) return; tree.nodes = tree.nodes.filter(function (x) { return x !== n; });
            tree.nodes.forEach(function (x) { if (x.auto_next === n.id) delete x.auto_next; x.options.forEach(function (o) { if (o.action === 'goto' && o.target === n.id) o.target = ''; }); });
            sel = null; dirty(); draw(); inspect();
          });
        };
        drawOpts(n, focusOpt, nodeOpts);
      }

      function drawOpts(n, focusOpt, nodeOpts) {
        var box = A.$('#opts', ins);
        box.innerHTML = n.options.map(function (o, i) {
          return '<div class="optcard" data-i="' + i + '"' + (i === focusOpt ? ' style="border-color:var(--accent)"' : '') + '><div class="oh">' + (n.numbered ? '<b style="color:var(--accent)">' + (i + 1) + '.</b>' : '') + '<input class="in" data-k="label" style="flex:1">' +
            '<button class="btn sm ghost icon" data-up title="أعلى">↑</button><button class="btn sm ghost icon" data-dn title="أسفل">↓</button><button class="btn sm danger ghost icon" data-rm title="حذف">✕</button></div>' +
            '<details' + (i === focusOpt ? ' open' : '') + '><summary class="small" style="cursor:pointer">⚙️ الإجراء: <b>' + esc(actLabel(o, tree)) + '</b></summary><div style="margin-top:8px"><div class="actgrid" data-ag>' + Object.keys(ACTIONS).map(function (k) { return '<button type="button" data-a="' + k + '" class="' + (o.action === k ? 'on' : '') + '"><i>' + ACTIONS[k].icon + '</i>' + ACTIONS[k].name + '</button>'; }).join('') + '</div><div data-params style="margin-top:10px"></div>' +
            '<div class="grid g2" style="margin-top:6px">' + A.f.text('i18n.en.label', 'English label', { ph: 'اختياري' }) + A.f.text('i18n.ur.label', 'اردو', { ph: 'اختياري' }) + '</div></div></details></div>';
        }).join('') || '<p class="small muted">لا توجد أزرار. يمكن للمستفيد الكتابة بحرية، أو أضف أزراراً.</p>';
        A.$$('.optcard', box).forEach(function (card) {
          var i = Number(card.getAttribute('data-i')), o = n.options[i];
          o.i18n = o.i18n || {}; o.i18n.en = o.i18n.en || {}; o.i18n.ur = o.i18n.ur || {};
          A.bind(card, o, function () { dirty(); refreshNode(n); });
          var params = card.querySelector('[data-params]');
          var drawParams = function () {
            var h = '';
            if (o.action === 'goto') h = '<label class="f">ينتقل إلى</label><select class="in" data-p="target">' + nodeOpts(o.target) + '<option value="__new">➕ عقدة جديدة…</option></select>';
            else if (o.action === 'answer') h = A.f.area('target', 'نص الإجابة', { rows: 4 }) + A.f.area('i18n.en.target', 'English answer', { rows: 2, ph: 'اختياري' }) + A.f.area('i18n.ur.target', 'اردو', { rows: 2, ph: 'اختياري' }) + '<label class="f">مرفقات (صورة، فيديو، PDF)</label><div data-om></div>';
            else if (o.action === 'org') h = '<label class="f">المعلومة</label><select class="in" data-p="field">' + orgFields().map(function (f) { return '<option value="' + f[0] + '"' + (o.field === f[0] ? ' selected' : '') + '>' + esc(f[1]) + '</option>'; }).join('') + '</select><div class="hint">تُعدّل هذه المعلومات من صفحة <a href="#/org">معلومات الجهة</a></div>';
            else if (o.action === 'ticket') h = '<label class="f">النوع</label><select class="in" data-p="field"><option value="complaint">📝 شكوى</option><option value="suggestion">💡 اقتراح</option><option value="inquiry">❓ استفسار</option><option value="callback">📞 طلب تواصل / حجز موعد (اسم وجوال)</option></select>';
            else if (o.action === 'url') h = A.f.text('target', 'الرابط', { ltr: true, ph: 'https://' });
            else if (o.action === 'kb') h = '<label class="f">السؤال</label><select class="in" data-p="target"><option value="">— اختر —</option>' + kbList.map(function (k) { return '<option value="' + k.id + '"' + (String(o.target) === String(k.id) ? ' selected' : '') + '>' + esc(k.question.slice(0, 70)) + '</option>'; }).join('') + '</select>';
            else if (o.action === 'location') h = '<div class="hint">يرسل خريطة Google داخل المحادثة مع زر الاتجاهات — من رابط الموقع في <a href="#/org">بيانات الجمعية</a></div>';
            else if (o.action === 'branch') h = '<label class="f">الفرع</label><select class="in" data-p="target"><option value="main">🏢 المقر الرئيسي</option>' + ((S.site.settings.org.branches) || []).map(function (b) { return '<option value="' + esc(b.id) + '"' + (o.target === b.id ? ' selected' : '') + '>📍 ' + esc(b.name || b.id) + '</option>'; }).join('') + '</select><div class="hint">تُضاف الفروع من <a href="#/org/contact">بيانات الجمعية ← التواصل والموقع</a></div>';
            else if (o.action === 'about') h = '<div class="hint">يعرض قائمة مرقّمة بكل أقسام «عن الجمعية» بأيقوناتها — تُعدّل من <a href="#/org">بيانات الجمعية</a></div>';
            else if (o.action === 'banks') h = '<label class="f">التصنيف</label><select class="in" data-p="target"><option value="">كل التصنيفات (يختار المستفيد)</option>' + ((S.site.settings.org.banks) || []).map(function (g) { return '<option value="' + esc(g.id) + '"' + (o.target === g.id ? ' selected' : '') + '>' + esc(g.name) + '</option>'; }).join('') + '</select>';
            else if (o.action === 'kb_browse') h = '<div class="hint">يعرض تصنيفات <a href="#/mindmap">الخريطة الذهنية</a> ثم أسئلتها</div>';
            else if (o.action === 'handoff') h = '<div class="hint">يرن عند الموظفين المتصلين حتى يرد أحدهم، وما يكتبه المستفيد يُحفظ ليتعلّم منه البوت.</div>';
            else if (o.action === 'catalog') h = '<label class="f">القائمة</label><select class="in" data-p="target"><option value="">— اختر —</option>' + ((((S.site.settings.biz || {}).catalogs) || [])).map(function (c) { return '<option value="' + esc(c.id) + '"' + (o.target === c.id ? ' selected' : '') + '>' + esc((c.icon || '') + ' ' + c.title) + '</option>'; }).join('') + '</select><div class="hint">تُدار القوائم من صفحة <a href="#/business">نشاطك وقوائمه</a></div>';
            else if (o.action === 'lookups_menu') h = '<div class="hint">يعرض كل استعلامات <a href="#/datasource">قواعد البيانات</a> (بياناتي، حالة الطلب، موعد الصرف…) ويُخفى تلقائياً إن لم توجد استعلامات</div>';
            else if (o.action === 'eligibility_menu') h = '<div class="hint">يعرض البرامج الظاهرة من صفحة <a href="#/eligibility">حاسبة الاستحقاق</a></div>';
            else if (o.action === 'eligibility') h = '<label class="f">البرنامج</label><select class="in" data-p="target"><option value="">— اختر —</option>' + (((S.site.settings.eligibility || {}).programs) || []).map(function (p) { return '<option value="' + esc(p.id) + '"' + (o.target === p.id ? ' selected' : '') + '>' + esc(p.title || p.id) + '</option>'; }).join('') + '</select><div class="hint">تُنشأ البرامج من صفحة <a href="#/eligibility">حاسبة الاستحقاق</a></div>';
            else if (o.action === 'lookup') h = '<label class="f">الاستعلام</label><select class="in" data-p="target"><option value="">— اختر —</option>' + ((S.site.settings.datasource.lookups) || []).map(function (l) { return '<option value="' + esc(l.id) + '"' + (o.target === l.id ? ' selected' : '') + '>' + esc(l.title || l.id) + '</option>'; }).join('') + '</select><div class="hint">تُنشأ الاستعلامات من الإعدادات ← قواعد البيانات</div>';
            else if (o.action === 'order_status' || o.action === 'customer_info') h = '<div class="hint">يستعلم من قاعدة البيانات المربوطة في صفحة <a href="#/datasource">قاعدة البيانات</a></div>';
            params.innerHTML = h;
            A.bind(params, o, function () { dirty(); refreshNode(n); });
            A.$$('[data-p]', params).forEach(function (s) {
              if (s.getAttribute('data-p') === 'field' && !o.field) o.field = s.value;
              s.value = o[s.getAttribute('data-p')] || s.value;
              s.onchange = function () {
                if (s.value === '__new') { var nn = { id: uid(), title: o.label.replace(/^[^\p{L}\p{N}]+/u, '') || 'عقدة جديدة', message: '', numbered: true, x: n.x - 380, y: n.y + i * 120, options: [{ label: '↩️ القائمة الرئيسية', action: 'goto', target: 'menu' }] }; tree.nodes.push(nn); o.target = nn.id; dirty(); draw(); inspect(i); return; }
                o[s.getAttribute('data-p')] = s.value; dirty(); draw(); refreshSummary();
              };
            });
            var om = params.querySelector('[data-om]'); if (om) { o.media = o.media || []; A.mediaEditor(om, o.media, dirty); }
          };
          var refreshSummary = function () { card.querySelector('summary b').textContent = actLabel(o, tree); };
          drawParams();
          A.$$('[data-a]', card).forEach(function (b) {
            b.onclick = function () {
              o.action = b.getAttribute('data-a'); delete o.field; if (o.action !== 'answer' && o.action !== 'url' && o.action !== 'goto' && o.action !== 'kb') delete o.target;
              if (o.action === 'org') o.field = 'contact'; if (o.action === 'ticket') o.field = 'complaint';
              A.$$('[data-a]', card).forEach(function (x) { x.classList.toggle('on', x === b); });
              drawParams(); refreshSummary(); dirty(); draw();
            };
          });
          card.querySelector('[data-rm]').onclick = function () { n.options.splice(i, 1); dirty(); draw(); inspect(); };
          card.querySelector('[data-up]').onclick = function () { if (i > 0) { n.options.splice(i - 1, 0, n.options.splice(i, 1)[0]); dirty(); draw(); inspect(i - 1); } };
          card.querySelector('[data-dn]').onclick = function () { if (i < n.options.length - 1) { n.options.splice(i + 1, 0, n.options.splice(i, 1)[0]); dirty(); draw(); inspect(i + 1); } };
        });
      }
      function refreshNode(n) { var el = wd.querySelector('.node[data-id="' + n.id + '"]'); if (!el) return; var tmp = document.createElement('div'); tmp.innerHTML = nodeHTML(n); var ne = tmp.firstChild; el.replaceWith(ne); bindNode(ne); links(); }

      /* palette drag & drop (fixed: canvas accepts drops) */
      var dragData = null;
      A.$$('.pi', root).forEach(function (p) {
        p.addEventListener('dragstart', function (e) { dragData = { tpl: p.getAttribute('data-tpl'), ready: p.getAttribute('data-ready'), act: p.getAttribute('data-act'), target: p.getAttribute('data-target'), label: p.getAttribute('data-label') }; e.dataTransfer.setData('text/plain', 'sc'); e.dataTransfer.effectAllowed = 'copy'; });
        p.addEventListener('dragend', function () { dragData = null; cv.classList.remove('drop'); });
        p.addEventListener('click', function () { // click = add at centre (touch friendly)
          var r0 = cv.getBoundingClientRect();
          if (p.getAttribute('data-ready')) addReady(p.getAttribute('data-ready'), toWorld(r0.left + r0.width / 2 - 120, r0.top + r0.height / 3));
          else if (p.getAttribute('data-tpl')) addTemplate(p.getAttribute('data-tpl'), toWorld(r0.left + r0.width / 2 - 120, r0.top + r0.height / 3));
          else if (sel) { var n = tree.nodes.find(function (x) { return x.id === sel; }); n.options.push(newOpt(p.getAttribute('data-act'), p.getAttribute('data-target'), p.getAttribute('data-label'))); dirty(); draw(); inspect(n.options.length - 1); }
          else A.toast('اختر عقدة أولاً ثم اضغط الزر، أو اسحبه إلى العقدة');
        });
      });
      cv.addEventListener('dragover', function (e) { if (dragData) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; cv.classList.add('drop'); } });
      cv.addEventListener('dragleave', function (e) { if (e.target === cv) cv.classList.remove('drop'); });
      cv.addEventListener('drop', function (e) {
        e.preventDefault(); cv.classList.remove('drop'); if (!dragData) return;
        var w = toWorld(e.clientX, e.clientY);
        if (dragData.ready) addReady(dragData.ready, { x: w.x - 125, y: w.y - 30 });
        else if (dragData.tpl) addTemplate(dragData.tpl, { x: w.x - 125, y: w.y - 30 });
        else A.toast('أفلت الزر فوق عقدة لإضافته إليها');
        dragData = null;
      });
      function newOpt(act, target, label) {
        var o = { label: label || (ACTIONS[act].icon + ' ' + ACTIONS[act].name), action: act };
        if (target) o.target = target;
        if (act === 'org') o.field = 'contact'; if (act === 'ticket') o.field = 'complaint';
        if (act === 'goto' && !o.target) o.target = 'menu';
        return o;
      }
      function mainMenu() { return tree.nodes.find(function (n) { return n.id === 'menu'; }) || tree.nodes.find(function (n) { return n.id === tree.root; }); }
      function addReady(k, at) {
        var R = READY[k], n = R.build(); n.id = uid(); n.x = Math.round(at.x); n.y = Math.round(at.y);
        if (n.options.length <= 1) A.toast(k === 'elig' ? '⚠️ لا توجد برامج استحقاق بعد — أنشئها من «حاسبة الاستحقاق»' : '⚠️ القائمة فارغة', 'err');
        tree.nodes.push(n);
        var m = mainMenu();
        if (m && m.id !== n.id) { m.options.push({ label: R.icon + ' ' + R.name, action: 'goto', target: n.id }); A.toast('✅ أُضيفت القائمة وزرها في القائمة الرئيسية', 'ok'); }
        sel = n.id; dirty(); draw(); inspect();
      }
      function addTemplate(k, at) {
        var n = A.clone(TEMPLATES[k].node); n.id = uid(); n.x = Math.round(at.x); n.y = Math.round(at.y);
        tree.nodes.push(n); sel = n.id; dirty(); draw(); inspect();
      }

      /* pan & zoom */
      cv.addEventListener('mousedown', function (e) {
        if (e.target.closest('.node') || e.target.closest('.zoom') || e.button !== 0) return;
        cv.classList.add('panning'); var sx = e.clientX - view.x, sy = e.clientY - view.y, moved = false;
        var mv = function (ev) { moved = true; view.x = ev.clientX - sx; view.y = ev.clientY - sy; applyView(); };
        var up = function () { cv.classList.remove('panning'); document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); if (!moved && sel) { sel = null; draw(); inspect(); } };
        document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
      });
      cv.addEventListener('wheel', function (e) {
        e.preventDefault(); var r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
        var k = Math.min(1.8, Math.max(0.25, view.k * (e.deltaY < 0 ? 1.1 : 0.9)));
        view.x = mx - (mx - view.x) * k / view.k; view.y = my - (my - view.y) * k / view.k; view.k = k; applyView();
      }, { passive: false });
      function zoom(f) { var r = cv.getBoundingClientRect(), mx = r.width / 2, my = r.height / 2, k = Math.min(1.8, Math.max(0.25, view.k * f)); view.x = mx - (mx - view.x) * k / view.k; view.y = my - (my - view.y) * k / view.k; view.k = k; applyView(); }
      function fit() {
        if (!tree.nodes.length) return; var r = cv.getBoundingClientRect();
        var minX = Math.min.apply(null, tree.nodes.map(function (n) { return n.x; })), maxX = Math.max.apply(null, tree.nodes.map(function (n) { return n.x + 260; }));
        var minY = Math.min.apply(null, tree.nodes.map(function (n) { return n.y; })), maxY = Math.max.apply(null, tree.nodes.map(function (n) { return n.y + 120 + n.options.length * 34; }));
        view.k = Math.min(1, Math.max(0.25, Math.min((r.width - 60) / (maxX - minX), (r.height - 100) / (maxY - minY))));
        view.x = (r.width - (maxX - minX) * view.k) / 2 - minX * view.k; view.y = 50 - minY * view.k; applyView(); links();
      }
      function arrange() { // simple layered layout right→left from the root (RTL)
        var depth = {}, q = [tree.root]; depth[tree.root] = 0;
        while (q.length) { var id = q.shift(), n = tree.nodes.find(function (x) { return x.id === id; }); if (!n) continue; var kids = n.options.filter(function (o) { return o.action === 'goto' && o.target; }).map(function (o) { return o.target; }); if (n.auto_next) kids.unshift(n.auto_next); kids.forEach(function (k) { if (depth[k] == null) { depth[k] = depth[id] + 1; q.push(k); } }); }
        var cols = {}; tree.nodes.forEach(function (n) { var d = depth[n.id] == null ? 99 : depth[n.id]; (cols[d] = cols[d] || []).push(n); });
        Object.keys(cols).sort(function (a, b) { return a - b; }).forEach(function (d, ci) { var y = 60; cols[d].forEach(function (n) { n.x = 1600 - ci * 340; n.y = y; y += 150 + n.options.length * 34; }); });
        dirty(); draw(); fit();
      }
      A.$('#zi').onclick = function () { zoom(1.15); }; A.$('#zo').onclick = function () { zoom(0.87); }; A.$('#zf').onclick = fit; A.$('#ar').onclick = arrange;
      // checks every button: is it linked to something that exists and is ready?
      function checkTree() {
        var st = S.site.settings, ds = st.datasource || {}, L = ds.lookups || [], P = (st.eligibility || {}).programs || [], out = [];
        var reach = {}, q = [tree.root, 'menu']; while (q.length) { var id = q.shift(); if (reach[id]) continue; reach[id] = 1; var nn = tree.nodes.find(function (x) { return x.id === id; }); if (!nn) continue; nn.options.forEach(function (o) { if (o.action === 'goto' && o.target) q.push(o.target === '__menu' ? 'menu' : o.target); }); if (nn.auto_next) q.push(nn.auto_next); }
        tree.nodes.forEach(function (n) {
          if (!reach[n.id]) out.push(['⚠️', n.title || n.id, 'لا يصل إليها أي زر (عقدة معزولة)']);
          n.options.forEach(function (o) {
            var w = (n.title || n.id) + ' ← ' + o.label, bad = null;
            if (!String(o.label || '').trim()) bad = 'الزر بدون اسم';
            else if (o.action === 'goto' && o.target !== '__menu' && !tree.nodes.some(function (x) { return x.id === o.target; })) bad = 'غير مربوط بعقدة';
            else if (o.action === 'lookup') { var l = L.find(function (x) { return x.id === o.target; }); bad = !l ? 'الاستعلام غير موجود' : !l.query ? 'الاستعلام بدون محتوى' : null; }
            else if (o.action === 'eligibility' && o.target) { var p = P.find(function (x) { return x.id === o.target; }); bad = !p ? 'برنامج الاستحقاق غير موجود' : p.enabled === false ? 'البرنامج موقوف' : !(p.questions || []).length ? 'البرنامج بدون أسئلة' : null; }
            else if (o.action === 'kb' && !kbList.some(function (k) { return String(k.id) === String(o.target); })) bad = 'السؤال غير موجود في الخريطة الذهنية';
            else if (o.action === 'url' && !/^https?:\/\//.test(o.target || '')) bad = 'الرابط فارغ أو غير صحيح';
            else if (o.action === 'answer' && !String(o.target || '').trim()) bad = 'الإجابة فارغة';
            else if ((o.action === 'order_status' || o.action === 'customer_info') && (ds.type === 'none' || !(o.action === 'order_status' ? ds.order_query : ds.customer_query))) bad = 'لم يُضبط الاستعلام المدمج — استخدم «قائمة الاستعلامات» أو استعلاماً مخصصاً';
            else if (o.action === 'catalog') { var cc = (((st.biz || {}).catalogs) || []).find(function (x) { return x.id === o.target; }); if (!cc) bad = 'القائمة غير موجودة — اختر نوع نشاطك من «نشاطك وقوائمه»'; else if (!(cc.items || []).some(function (i) { return i.name; })) out.push(['ℹ️', w, 'مخفي حتى تضيف عناصر للقائمة']); }
            else if (o.action === 'branch' && o.target && !((st.org || {}).branches || []).some(function (b) { return b.id === o.target; })) bad = 'الفرع غير موجود';
            else if (o.action === 'lookups_menu' && !L.some(function (x) { return x.query; })) out.push(['ℹ️', w, 'مخفي حتى تضيف استعلاماً في قواعد البيانات']);
            else if (o.action === 'eligibility_menu' && !P.some(function (x) { return x.enabled !== false && x.visible !== false && (x.questions || []).length; })) out.push(['ℹ️', w, 'مخفي حتى تضيف برنامج استحقاق']);
            if (bad) out.push(['❌', w, bad]);
          });
        });
        return out;
      }
      A.$('#chk').onclick = function () {
        var r = checkTree(), n = tree.nodes.reduce(function (a, x) { return a + x.options.length; }, 0), errs = r.filter(function (x) { return x[0] === '❌'; }).length;
        A.modal({ title: '🩺 فحص الأزرار', body: '<div class="alert ' + (errs ? 'err' : 'ok') + '">' + (errs ? '❌ ' + errs + ' زر يحتاج إصلاحاً من أصل ' + n : '✅ كل الأزرار (' + n + ') مربوطة وتعمل') + '</div>' + (r.length ? '<div class="tbl-wrap"><table class="t"><tbody>' + r.map(function (x) { return '<tr><td>' + x[0] + '</td><td><b>' + esc(x[1]) + '</b></td><td class="small">' + esc(x[2]) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') });
      };
      A.$('#sv').onclick = saveTree;
      A.$('#medit').onclick = function () { A.menuEditor(tree, function () { dirty(); draw(); A.toast('تم التعديل ✅', 'ok'); }); };
      A.$('#tpl2').onclick = function () { A.$('#tpl').onclick(); };
      A.$('#tpl').onclick = function () {
        A.GET('/api/tree-templates').then(function (list) {
          var pick = null;
          var m = A.modal({ title: '📋 اختر شجرة جاهزة حسب نوع جهتك', size: 'wide', body: '<p class="small muted">كل شجرة جاهزة للعمل فوراً، وتقدر بعدها تعدّل أي زر أو تحذفه أو تضيف قوائمك الخاصة. الأزرار الاختيارية (حساب الاستحقاق، الاستعلامات) تختفي تلقائياً إلى أن تضبطها.</p><div class="grid g3" id="tps">' +
            list.map(function (t) { return '<button type="button" class="card flat" data-tp="' + t.id + '" style="text-align:start;cursor:pointer;padding:14px;border:2px solid var(--border)"><div style="font-size:30px">' + t.icon + '</div><b>' + esc(t.name) + '</b><p class="tiny muted" style="margin:4px 0 8px">' + esc(t.desc) + '</p><div class="tiny" style="line-height:1.9">' + t.buttons.map(function (b, i) { return (i + 1) + '. ' + esc(b); }).join('<br>') + '</div></button>'; }).join('') + '</div>' +
            '<div class="alert warn" style="margin-top:12px">⚠️ سيتم استبدال الشجرة الحالية وحفظ الجديدة تلقائياً (خذ نسخة احتياطية أولاً إن أردت الرجوع).</div>',
            buttons: [{ label: 'إلغاء', ghost: true }, { label: '✅ تطبيق الشجرة', onClick: function () {
              if (!pick) { A.toast('اختر نوع الجهة', 'err'); return false; }
              return A.GET('/api/business-types').then(function (BT) {
                var bt = BT[pick], biz = A.clone(S.site.settings.biz || {}); biz.catalogs = biz.catalogs || [];
                var add = bt ? bt.catalogs.filter(function (c) { return !biz.catalogs.some(function (x) { return x.id === c.id; }); }) : [];
                if (!bt) return null; biz.type = pick; add.forEach(function (c) { biz.catalogs.push(c); });
                return A.saveSite({ settings: { biz: biz } });
              }).then(function () { return A.GET('/api/tree-template?type=' + pick); }).then(function (t) { tree = t; tree.nodes.forEach(function (n) { n.options = n.options || []; }); sel = null; dirty(); draw(); inspect(); fit(); A.toast('تم تطبيق الشجرة ✅', 'ok'); });
            } }] });
          A.$$('[data-tp]', m.body).forEach(function (b) { b.onclick = function () { pick = b.getAttribute('data-tp'); A.$$('[data-tp]', m.body).forEach(function (x) { x.style.borderColor = x === b ? 'var(--primary)' : 'var(--border)'; }); }; });
        }, A.fail);
      };
      applyView(); draw(); inspect(); setTimeout(fit, 30);
      return function () { };
    }
  });
})();
