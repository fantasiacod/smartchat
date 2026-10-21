/* v3: organisation (sections with icons, location, bank accounts), bot mind map, settings hub, AI, backup & reset */
(function () {
  'use strict';
  var A = App, S = A.state, esc = A.esc, f = A.f, IC = window.SCIcons;
  var PALETTE = ['#1a6739', '#bc9525', '#0f766e', '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#0891b2', '#475569', '#111827'];
  function card(title, body, sub, extra) { return '<div class="card" style="margin-bottom:16px' + (extra || '') + '"><h3>' + title + '</h3>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + body + '</div>'; }
  function uid(p) { return (p || 'x') + Math.random().toString(36).slice(2, 8); }
  var logoUrl = function () { return S.site.settings.appearance.company_logo; };

  /* ---------- icon + colour picker ---------- */
  A.iconHTML = function (icon, color, size) {
    var c = color || S.site.settings.appearance.primary_color;
    if (icon === 'logo') return logoUrl() ? '<img src="' + esc(logoUrl()) + '" alt="">' : '🏢';
    return IC.svg(IC.has(icon) ? icon : 'info', c, size || 22);
  };
  A.iconPicker = function (el, obj, onChange, opts) {
    opts = opts || {};
    function draw() { el.innerHTML = '<button type="button" class="icon-btn" style="--ic:' + (obj.color || S.site.settings.appearance.primary_color) + '" title="تغيير الأيقونة واللون">' + A.iconHTML(obj.icon, obj.color) + '</button>'; el.firstChild.onclick = open; }
    function open() {
      var cur = { icon: obj.icon || 'info', color: obj.color || '' };
      var m = A.modal({ title: '🎨 اختر الأيقونة واللون', size: 'wide', body: '<div id="ipc"></div>',
        buttons: [{ label: 'إلغاء', ghost: true }, { label: 'اعتماد', onClick: function () { obj.icon = cur.icon; obj.color = cur.color; draw(); onChange && onChange(); } }] });
      function paint() {
        var col = cur.color || S.site.settings.appearance.primary_color;
        m.body.querySelector('#ipc').innerHTML = '<label class="f">اللون</label><div class="colors" style="margin-bottom:14px">' + PALETTE.map(function (c) { return '<button type="button" data-c="' + c + '" style="background:' + c + '" class="' + (cur.color === c ? 'on' : '') + '"></button>'; }).join('') +
          '<input type="color" value="' + col + '" id="ipcc" style="width:38px;height:32px;border:0;background:none;cursor:pointer" title="لون مخصص"><button type="button" class="btn sm ghost" data-c="">لون الهوية</button></div>' +
          '<label class="f">الأيقونة</label><div class="icon-grid">' + (opts.logo !== false ? '<button type="button" data-i="logo" class="' + (cur.icon === 'logo' ? 'on' : '') + '"><span style="width:28px;height:28px;display:grid;place-items:center;overflow:hidden;border-radius:8px">' + (logoUrl() ? '<img src="' + esc(logoUrl()) + '" style="width:100%;height:100%;object-fit:contain">' : '🏢') + '</span>شعار الجهة</button>' : '') +
          IC.list.map(function (i) { return '<button type="button" data-i="' + i.id + '" class="' + (cur.icon === i.id ? 'on' : '') + '">' + IC.svg(i.id, col, 26) + esc(i.name) + '</button>'; }).join('') + '</div>';
        A.$$('[data-c]', m.body).forEach(function (b) { b.onclick = function () { cur.color = b.getAttribute('data-c'); paint(); }; });
        A.$('#ipcc', m.body).oninput = function () { cur.color = this.value; paint(); };
        A.$$('[data-i]', m.body).forEach(function (b) { b.onclick = function () { cur.icon = b.getAttribute('data-i'); paint(); }; });
      }
      paint();
    }
    draw();
  };

  function ibanOk(v) {
    var s = String(v || '').replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
    var r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, function (c) { return c.charCodeAt(0) - 55; }), mod = 0;
    for (var i = 0; i < r.length; i++) mod = (mod * 10 + Number(r[i])) % 97;
    return mod === 1 && (!/^SA/.test(s) || s.length === 24);
  }

  /* ============================== organisation ============================== */
  var QUICK = [['نبذة عن الجمعية', 'building', 'history'], ['رؤيتنا', 'eye', 'vision'], ['رسالتنا', 'flag', 'mission'], ['أهدافنا', 'target', 'goals'], ['قيمنا', 'heart', ''], ['خدماتنا وبرامجنا', 'hands', ''],
    ['طريقة التسجيل', 'document', ''], ['شروط الاستفادة', 'shield', ''], ['مجلس الإدارة', 'users', ''], ['شركاؤنا', 'award', ''], ['التطوع معنا', 'volunteer', ''], ['إنجازاتنا', 'chart', '']];
  A.page('org', {
    title: 'بيانات الجمعية', icon: '🏢', role: 'supervisor', hint: 'كل ما يحتاج البوت معرفته عنكم: التعريف، التواصل والموقع، الحسابات البنكية',
    render: function (root, sub) {
      var tab = sub[0] || 'about';
      A.settingsPage(root, ['org', 'developer'], function (el, d, ch) {
        var o = d.org; o.sections = o.sections || []; o.banks = o.banks || []; o.departments = o.departments || []; o.social = o.social || {}; o.media = o.media || {}; o.media.location = o.media.location || [];
        el.innerHTML = '<div class="tabs big" id="otabs"><button data-t="about">🏢 عن الجمعية</button><button data-t="contact">📞 التواصل والموقع</button><button data-t="banks">🏦 الحسابات البنكية</button><button data-t="dev">🛠️ المطوّر</button></div>' +
          '<div data-pane="about">' + card('🏢 أقسام «عن الجمعية»', '<div class="quick" id="quick"></div><div id="secs" style="margin-top:14px"></div><button class="btn soft" id="addsec">+ قسم جديد</button>',
            'يعرضها البوت كقائمة مرقّمة بأيقوناتها عندما يختار المستفيد «تعرّف علينا»، ويجيب عن أي قسم إذا سُئل عنه مباشرة. اختر لكل قسم أيقونة ولوناً أو شعار الجمعية.') + '</div>' +
          '<div data-pane="contact" class="hidden"><div class="grid g2">' + card('📇 بيانات التواصل', f.text('org.name', 'اسم الجمعية') + '<div class="grid g2">' + f.text('org.unified_number', 'الرقم الموحّد', { ltr: true, ph: '9200xxxxx' }) + f.text('org.email', 'البريد', { ltr: true }) + '</div>' +
              f.text('org.website', 'الموقع الإلكتروني', { ltr: true, ph: 'https://' }) + f.area('org.hours', 'ساعات العمل', { rows: 2, ph: 'الأحد – الخميس: 8 صباحاً – 4 عصراً' })) +
            card('📍 الموقع الرئيسي', f.text('org.map_url', 'رابط الموقع في خرائط Google', { ltr: true, ph: 'https://maps.app.goo.gl/…', hint: 'افتح موقعكم في خرائط Google ← مشاركة ← نسخ الرابط، والصقه هنا. يكفي هذا الرابط.' }) +
              f.text('org.address', 'العنوان (اختياري)', { ph: 'المدينة المنورة – حي …' }) + '<div id="mapprev"></div><label class="f" style="margin-top:12px">صور الموقع <small>(اختياري — مثل صورة المبنى أو المدخل)</small></label><div id="m-loc"></div>') + '</div>' +
            card('🏢 الفروع والمواقع الأخرى', '<div id="brs"></div><button class="btn soft sm" id="addbr">+ إضافة فرع</button>', 'إذا كان لديكم أكثر من فرع أو موقع: عند السؤال عن الموقع يعرض البوت قائمة مرقّمة بالفروع (مع المقر الرئيسي أعلاه إن وُجد)، ثم يرسل خريطة الفرع المختار وأرقامه وأوقاته. ويفهم أيضاً «فرع جدة» أو اسم الفرع مباشرة.') +
            card('☎️ الأقسام وأرقامها', '<div id="deps"></div><button class="btn soft sm" id="adddep">+ إضافة قسم</button>', 'إذا كتب المستفيد اسم القسم يرسل له البوت أرقامه.') +
            card('📱 حسابات التواصل الاجتماعي', '<div class="grid g4">' + [['x', 'X (تويتر)'], ['instagram', 'إنستغرام'], ['snapchat', 'سناب شات'], ['tiktok', 'تيك توك'], ['youtube', 'يوتيوب'], ['facebook', 'فيسبوك'], ['linkedin', 'لينكدإن'], ['whatsapp', 'واتساب']].map(function (x) { return f.text('org.social.' + x[0], x[1], { ltr: true }); }).join('') + '</div>') + '</div>' +
          '<div data-pane="banks" class="hidden">' + card('🏦 الحسابات البنكية', '<div class="quick" id="bquick"></div><div id="bgroups" style="margin-top:14px"></div><button class="btn soft" id="addgrp">+ تصنيف جديد</button>',
            'أنشئ تصنيفاً رئيسياً (مثل: الحساب العام) وأضف تحته أكثر من حساب في بنوك مختلفة. عندما يسأل المستفيد عن التبرع أو الآيبان يعرض البوت التصنيفات ثم الحسابات مع زر نسخ.') + '</div>' +
          '<div data-pane="dev" class="hidden">' + card('🛠️ مطوّر البرنامج', f.sw('developer.show', 'الرد على سؤال «من صمّم/طوّر البرنامج؟»') + '<div class="grid g2" style="margin-top:10px">' + f.text('developer.name', 'اسم المطوّر') + f.text('developer.url', 'رابط المطوّر (متجر سلة مثلاً)', { ltr: true }) + '</div>' + f.text('developer.description', 'نص التعريف') + '<label class="f">شعار المطوّر</label><div id="devlogo"></div>') + '</div>';
        function tabs() { A.$$('#otabs button', el).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-t') === tab); b.onclick = function () { tab = b.getAttribute('data-t'); tabs(); }; }); A.$$('[data-pane]', el).forEach(function (p) { p.classList.toggle('hidden', p.getAttribute('data-pane') !== tab); }); }
        tabs();
        A.bind(el, d, function (k) { ch(); if (/map_url|address|org\.name/.test(k)) mapPrev(); });
        A.mediaEditor(A.$('#m-loc', el), o.media.location, ch);
        A.imageField(A.$('#devlogo', el), function () { return d.developer.logo; }, function (v) { d.developer.logo = v; ch(); });

        /* sections */
        function quick() {
          A.$('#quick', el).innerHTML = '<span class="small muted" style="align-self:center">إضافة سريعة:</span>' + QUICK.filter(function (q) { return !o.sections.some(function (x) { return x.title === q[0]; }); }).map(function (q, i) { return '<button class="btn sm ghost" data-q="' + esc(q[0]) + '">' + IC.svg(q[1], null, 16) + ' ' + esc(q[0]) + '</button>'; }).join('');
          A.$$('[data-q]', el).forEach(function (b) { b.onclick = function () { var q = QUICK.find(function (x) { return x[0] === b.getAttribute('data-q'); }); o.sections.push({ id: q[2] || uid('s'), key: q[2], title: q[0], icon: q[1], color: '', text: '', keywords: '', media: [], i18n: {} }); ch(); secs(); quick(); }; });
        }
        function secs() {
          var box = A.$('#secs', el);
          box.innerHTML = o.sections.map(function (x, i) {
            return '<div class="sec-card" data-i="' + i + '" style="--sc:' + (x.color || S.site.settings.appearance.primary_color) + '"><div class="sh"><span data-ip></span><input class="in" data-k="title" placeholder="عنوان القسم"><button class="btn sm ghost icon" data-up title="أعلى">↑</button><button class="btn sm ghost icon" data-dn title="أسفل">↓</button><button class="btn sm danger ghost icon" data-rm title="حذف">✕</button></div>' +
              '<textarea class="in" data-k="text" rows="4" placeholder="اكتب المحتوى هنا…"></textarea><div data-m style="margin-top:8px"></div>' +
              '<details style="margin-top:8px"><summary class="small muted" style="cursor:pointer">⚙️ كلمات مفتاحية وترجمة</summary><div style="margin-top:8px">' + f.text('keywords', 'كلمات يُفهم بها السؤال', { ph: 'مثال: اهداف, هدفكم, ماذا تريدون' }) +
              '<div class="grid g2">' + f.text('i18n.en.title', 'English title') + f.text('i18n.ur.title', 'اردو عنوان') + f.area('i18n.en.text', 'English text', { rows: 2 }) + f.area('i18n.ur.text', 'اردو متن', { rows: 2 }) + '</div></div></details></div>';
          }).join('') || '<div class="empty"><div class="ic">🏢</div>لا توجد أقسام — استخدم الإضافة السريعة أعلاه</div>';
          A.$$('.sec-card', box).forEach(function (c) {
            var i = Number(c.getAttribute('data-i')), x = o.sections[i]; x.i18n = x.i18n || {}; x.i18n.en = x.i18n.en || {}; x.i18n.ur = x.i18n.ur || {}; x.media = x.media || [];
            A.bind(c, x, ch);
            A.iconPicker(c.querySelector('[data-ip]'), x, function () { c.style.setProperty('--sc', x.color || S.site.settings.appearance.primary_color); ch(); });
            A.mediaEditor(c.querySelector('[data-m]'), x.media, ch);
            c.querySelector('[data-rm]').onclick = function () { A.confirm('حذف قسم «' + (x.title || '') + '»؟', true).then(function (ok) { if (ok) { o.sections.splice(i, 1); ch(); secs(); quick(); } }); };
            c.querySelector('[data-up]').onclick = function () { if (i > 0) { o.sections.splice(i - 1, 0, o.sections.splice(i, 1)[0]); ch(); secs(); } };
            c.querySelector('[data-dn]').onclick = function () { if (i < o.sections.length - 1) { o.sections.splice(i + 1, 0, o.sections.splice(i, 1)[0]); ch(); secs(); } };
          });
        }
        A.$('#addsec', el).onclick = function () { o.sections.push({ id: uid('s'), key: '', title: '', icon: 'info', color: '', text: '', keywords: '', media: [], i18n: {} }); ch(); secs(); };
        quick(); secs();

        /* location preview */
        function mapPrev() {
          var m = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(o.map_url || '') || /[?&](?:q|query|ll|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i.exec(o.map_url || '');
          var q = m ? m[1] + ',' + m[2] : [o.name, o.address].filter(Boolean).join(' ');
          A.$('#mapprev', el).innerHTML = (o.map_url || o.address) && q ? '<iframe style="width:100%;height:180px;border:0;border-radius:12px;margin-top:6px" loading="lazy" src="https://maps.google.com/maps?q=' + encodeURIComponent(q) + '&z=16&output=embed"></iframe>' : '';
        }
        mapPrev();
        /* branches */
        o.branches = o.branches || [];
        function brs() {
          var box = A.$('#brs', el);
          box.innerHTML = o.branches.map(function (b, i) {
            return '<div class="repeat" data-i="' + i + '"><div class="row" style="margin-bottom:8px"><span style="font-size:20px">📍</span><input class="in" data-k="name" placeholder="اسم الفرع (مثال: فرع العوالي)" style="font-weight:700"><input class="in" data-k="city" placeholder="المدينة / الحي" style="max-width:200px"><button class="btn sm ghost icon" data-up title="أعلى">↑</button><button class="btn sm danger ghost icon" data-rm>✕</button></div>' +
              f.text('map_url', '', { ltr: true, ph: 'رابط موقع الفرع في خرائط Google' }) + '<div class="grid g3">' + f.text('address', '', { ph: 'العنوان (اختياري)' }) + f.text('phones', '', { ph: 'أرقام الفرع مفصولة بفواصل', ltr: true }) + f.text('hours', '', { ph: 'أوقات العمل (اختياري)' }) + '</div>' +
              '<details><summary class="small muted" style="cursor:pointer">🖼️ صور الفرع</summary><div data-m style="margin-top:6px"></div></details></div>';
          }).join('') || '<p class="small muted">لا توجد فروع — يُستخدم الموقع الرئيسي فقط</p>';
          A.$$('.repeat', box).forEach(function (r) {
            var i = Number(r.getAttribute('data-i')), b = o.branches[i]; b.media = b.media || [];
            A.bind(r, b, ch); A.mediaEditor(r.querySelector('[data-m]'), b.media, ch);
            r.querySelector('[data-rm]').onclick = function () { A.confirm('حذف «' + (b.name || 'الفرع') + '»؟', true).then(function (ok) { if (ok) { o.branches.splice(i, 1); ch(); brs(); } }); };
            r.querySelector('[data-up]').onclick = function () { if (i > 0) { o.branches.splice(i - 1, 0, o.branches.splice(i, 1)[0]); ch(); brs(); } };
          });
        }
        A.$('#addbr', el).onclick = function () { o.branches.push({ id: uid('br'), name: '', city: '', address: '', map_url: '', phones: '', hours: '', media: [] }); ch(); brs(); };
        brs();
        /* departments */
        function deps() {
          A.$('#deps', el).innerHTML = o.departments.map(function (x, i) { return '<div class="row" style="margin-bottom:8px" data-i="' + i + '"><input class="in" data-k="name" placeholder="اسم القسم (مثال: خدمة المستفيدين)"><input class="in" data-k="phones" placeholder="الأرقام مفصولة بفواصل" dir="ltr"><button class="btn sm danger ghost icon" data-rm>✕</button></div>'; }).join('') || '<p class="small muted">لا توجد أقسام</p>';
          A.$$('[data-i]', A.$('#deps', el)).forEach(function (r) { var x = o.departments[Number(r.getAttribute('data-i'))]; A.bind(r, x, ch); r.querySelector('[data-rm]').onclick = function () { o.departments.splice(Number(r.getAttribute('data-i')), 1); ch(); deps(); }; });
        }
        A.$('#adddep', el).onclick = function () { o.departments.push({ name: '', phones: '' }); ch(); deps(); };
        deps();

        /* banks */
        var BQ = [['الحساب العام', 'bank'], ['حساب الزكاة', 'money'], ['حساب الصدقات', 'hands'], ['حساب الأوقاف', 'mosque'], ['كفالة الأيتام', 'family'], ['السلة الغذائية', 'basket']];
        function bquick() {
          A.$('#bquick', el).innerHTML = '<span class="small muted" style="align-self:center">إضافة سريعة:</span>' + BQ.filter(function (q) { return !o.banks.some(function (g) { return g.name === q[0]; }); }).map(function (q) { return '<button class="btn sm ghost" data-bq="' + esc(q[0]) + '">' + IC.svg(q[1], null, 16) + ' ' + esc(q[0]) + '</button>'; }).join('');
          A.$$('[data-bq]', el).forEach(function (b) { b.onclick = function () { var q = BQ.find(function (x) { return x[0] === b.getAttribute('data-bq'); }); o.banks.push({ id: uid('g'), name: q[0], icon: q[1], color: '', accounts: [{ id: uid('a'), bank: 'rajhi', holder: o.name || '', iban: '', number: '', note: '' }] }); ch(); groups(); bquick(); }; });
        }
        function groups() {
          var box = A.$('#bgroups', el);
          box.innerHTML = o.banks.map(function (g, gi) {
            return '<div class="bank-group" data-g="' + gi + '" style="--gc:' + (g.color || S.site.settings.appearance.primary_color) + '"><div class="bgh"><span data-ip></span><input class="in" data-k="name" placeholder="اسم التصنيف (مثال: الحساب العام)" style="font-weight:700;max-width:360px"><span class="grow"></span><span class="small muted">' + (g.accounts || []).length + ' حساب</span><button class="btn sm danger ghost" data-rmg>حذف التصنيف</button></div>' +
              (g.accounts || []).map(function (a, ai) {
                return '<div class="bank-acc" data-a="' + ai + '"><select class="in" data-k="bank">' + IC.banks.map(function (b) { return '<option value="' + b.id + '">' + esc(b.name) + '</option>'; }).join('') + '</select>' +
                  '<input class="in" data-k="holder" placeholder="اسم صاحب الحساب"><input class="in" data-k="number" placeholder="رقم الحساب" dir="ltr"><div class="row" style="gap:4px"><input class="in" data-k="iban" placeholder="SA00 0000 0000 0000 0000 0000" dir="ltr" style="font-family:ui-monospace,monospace"><span data-ok style="width:22px;text-align:center"></span></div><button class="btn sm danger ghost icon" data-rma>✕</button>' +
                  '<input class="in" data-k="note" placeholder="ملاحظة (اختياري)" style="grid-column:1/-1;font-size:12.5px"></div>';
              }).join('') + '<div style="padding:10px 14px"><button class="btn sm soft" data-adda>+ حساب في هذا التصنيف</button></div></div>';
          }).join('') || '<div class="empty"><div class="ic">🏦</div>لا توجد حسابات — استخدم الإضافة السريعة أعلاه</div>';
          A.$$('.bank-group', box).forEach(function (gEl) {
            var gi = Number(gEl.getAttribute('data-g')), g = o.banks[gi]; g.accounts = g.accounts || [];
            A.bind(gEl.querySelector('.bgh'), g, ch);
            A.iconPicker(gEl.querySelector('[data-ip]'), g, function () { gEl.style.setProperty('--gc', g.color || S.site.settings.appearance.primary_color); ch(); }, { logo: true });
            gEl.querySelector('[data-rmg]').onclick = function () { A.confirm('حذف تصنيف «' + g.name + '» وكل حساباته؟', true).then(function (ok) { if (ok) { o.banks.splice(gi, 1); ch(); groups(); bquick(); } }); };
            gEl.querySelector('[data-adda]').onclick = function () { g.accounts.push({ id: uid('a'), bank: 'rajhi', holder: o.name || '', iban: '', number: '', note: '' }); ch(); groups(); };
            A.$$('.bank-acc', gEl).forEach(function (aEl) {
              var ai = Number(aEl.getAttribute('data-a')), a = g.accounts[ai];
              var check = function () { var okEl = aEl.querySelector('[data-ok]'); okEl.textContent = a.iban ? (ibanOk(a.iban) ? '✅' : '⚠️') : ''; okEl.title = a.iban && !ibanOk(a.iban) ? 'تحقق من رقم الآيبان' : ''; };
              A.bind(aEl, a, function () { ch(); check(); });
              check();
              aEl.querySelector('[data-rma]').onclick = function () { g.accounts.splice(ai, 1); ch(); groups(); };
            });
          });
        }
        A.$('#addgrp', el).onclick = function () { o.banks.push({ id: uid('g'), name: '', icon: 'bank', color: '', accounts: [] }); ch(); groups(); };
        bquick(); groups();
      });
      this.onSub = function (s) { tab = s[0] || 'about'; var b = A.$('#otabs [data-t="' + tab + '"]'); if (b) b.click(); };
    }
  });

  /* ============================== mind map ============================== */
  var origEditKB = A.editKB;
  A.loadCats = function () { return A.GET('/api/mindmap?site=' + S.site.id).then(function (d) { S.kbCats = d.categories; S.kbAll = d.kb; return d; }); };
  A.editKB = function (k, onDone, extra) { A.loadCats().then(function () { origEditKB(k, onDone, extra); }, function () { origEditKB(k, onDone, extra); }); };
  function editCat(c, onDone) {
    c = Object.assign({ name: '', icon: 'question', color: PALETTE[Math.floor(Math.random() * 6)], i18n: {} }, c || {});
    c.i18n = c.i18n || {}; c.i18n.en = c.i18n.en || {}; c.i18n.ur = c.i18n.ur || {};
    var m = A.modal({ title: c.id ? '✏️ تعديل التصنيف' : '➕ تصنيف جديد في الخريطة الذهنية',
      body: '<div class="row" style="align-items:flex-end;gap:12px"><div><label class="f">الأيقونة</label><span id="cip"></span></div><div class="grow">' + f.text('name', 'اسم التصنيف', { ph: 'مثال: التسجيل والخدمات، التبرعات، المساعدات' }) + '</div></div><div class="grid g2">' + f.text('i18n.en.name', 'English') + f.text('i18n.ur.name', 'اردو') + '</div>',
      buttons: [{ label: 'إلغاء', ghost: true }, { label: 'حفظ', onClick: function () { var body = { site_id: S.site.id, name: c.name, icon: c.icon, color: c.color, i18n: c.i18n }; return (c.id ? A.api('PUT', '/api/kb-categories/' + c.id, body) : A.api('POST', '/api/kb-categories', body)).then(function () { onDone && onDone(); }); } }] });
    A.bind(m.body, c); A.iconPicker(m.body.querySelector('#cip'), c, null, { logo: false });
  }
  function testBot() {
    var m = A.modal({ title: '🧪 اختبار البوت', size: 'wide', body: '<p class="muted small" style="margin-top:0">اكتب سؤالاً كما يكتبه المستفيد:</p><div class="row"><input class="in" id="tq" placeholder="مثال: كيف اسجل عندكم؟"><button class="btn" id="tb">اختبار</button></div><div id="tr" style="margin-top:14px"></div>' });
    var go = function () {
      A.api('POST', '/api/kb/test', { site_id: S.site.id, text: A.$('#tq', m.body).value }).then(function (r) {
        A.$('#tr', m.body).innerHTML = r.best ? '<div class="alert ok"><div><b>✅ سيجيب البوت (تطابق ' + Math.round(r.best.score * 100) + '%):</b><div style="white-space:pre-wrap;margin-top:6px">' + esc(r.best.answer) + '</div></div></div>' : '<div class="alert warn">⚠️ لا توجد إجابة في الخريطة الذهنية' + ' — سيحوّل المستفيد لموظف فوراً ويُسجَّل السؤال، وردّ الموظف يُضاف للخريطة تلقائياً.' + '</div>';
      }).catch(A.fail);
    };
    A.$('#tb', m.body).onclick = go; A.$('#tq', m.body).onkeydown = function (e) { if (e.key === 'Enter') go(); };
  }

  A.page('mindmap', {
    title: 'الخريطة الذهنية للبوت', icon: '🧠', hint: 'كل ما يعرفه البوت: أسئلة وأجوبة مصنّفة. ما يجيب عنه الموظفون يُضاف هنا تلقائياً',
    full: false,
    render: function (root) {
      var view = 'map', q = '', data = null, open = {}, L = {}, V = { x: 0, y: 0, k: 1 }, linkSrc = null, fitted = false, canEdit = A.can('supervisor');
      var RW = 220, CW = 250, QW = 330, QH = 44, GAP_CAT = 90, GAP_Q = 70;
      root.innerHTML = '<div class="mm-tools"><div class="seg" id="mv"><button data-v="map" class="on">🧠 الخريطة</button><button data-v="list">📋 قائمة</button></div><input class="in" id="mq" placeholder="🔎 ابحث في الأسئلة والأجوبة" style="max-width:280px"><span class="grow"></span>' +
        '<button class="btn ghost sm" id="mt">🧪 اختبار البوت</button>' + (canEdit ? '<button class="btn soft sm" id="mc">+ تصنيف</button>' : '') + '<button class="btn sm" id="mn">+ سؤال وجواب</button></div>' +
        '<div id="mbody"></div>';
      var body = A.$('#mbody'), cv, world, svg, nodes = {}, anim = 0;

      function load() { return A.loadCats().then(function (d) { data = d; L = d.layout || {}; draw(); }).catch(A.fail); }

      /* ---------- model: branches & automatic (adaptive) layout ---------- */
      function branches() {
        var a = S.site.settings.appearance, match = function (k) { return !q || (k.question + ' ' + k.answer + ' ' + (k.keywords || '')).toLowerCase().indexOf(q) >= 0; };
        var list = data.categories.map(function (c) { return { key: 'c:' + c.id, id: c.id, cat: c, name: c.name, icon: c.icon, color: c.color || a.primary_color, items: data.kb.filter(function (k) { return k.category_id === c.id && match(k); }) }; });
        var loose = data.kb.filter(function (k) { return (!k.category_id || !data.categories.some(function (c) { return c.id === k.category_id; })) && match(k); });
        if (loose.length || !list.length) list.push({ key: 'c:0', id: 0, name: 'أسئلة بدون تصنيف', icon: 'list', color: '#64748b', items: loose, sub: 'اسحب أي سؤال إلى تصنيف' });
        var un = data.unanswered.filter(function (u) { return !q || u.question.toLowerCase().indexOf(q) >= 0; });
        if (un.length) list.push({ key: 'c:un', id: 'un', name: 'بحاجة لإجابة', icon: 'question', color: '#ea580c', items: un, unanswered: true, sub: 'لم يعرفها البوت' });
        return list;
      }
      function layout(bs) {
        var pos = {}, y = 0, catX = -(RW + GAP_CAT + CW), qX = catX - GAP_Q - QW;
        bs.forEach(function (b) {
          var shown = open[b.id] === false ? [] : (open[b.id] === 'all' ? b.items : b.items.slice(0, 8));
          var extra = b.items.length > shown.length && open[b.id] !== false ? 1 : 0;
          var h = Math.max(70, (shown.length + extra) * QH);
          pos[b.key] = { x: catX, y: y + h / 2 - 35 };
          shown.forEach(function (k, i) { pos[(b.unanswered ? 'u:' : 'q:') + k.id] = { x: qX, y: y + i * QH }; });
          if (extra) pos['m:' + b.id] = { x: qX, y: y + shown.length * QH };
          b.shown = shown; y += h + 28;
        });
        pos.root = { x: -RW, y: Math.max(0, y / 2 - 90) };
        Object.keys(pos).forEach(function (k) { if (L[k]) pos[k] = { x: L[k].x, y: L[k].y }; });
        return pos;
      }

      /* ---------- render (keyed: nodes glide to their new place) ---------- */
      function shell() {
        body.innerHTML = '<div class="mmc" id="mmc"><div class="mmw" id="mmw"><svg class="mml" id="mml"></svg></div>' +
          '<div class="mmz"><button class="btn ghost icon" data-z="in" title="تكبير">＋</button><button class="btn ghost icon" data-z="out" title="تصغير">－</button><button class="btn ghost sm" data-z="fit">🎯 ملاءمة</button>' + (canEdit ? '<button class="btn ghost sm" data-z="auto" title="إلغاء التحريك اليدوي">🧹 ترتيب تلقائي</button>' : '') + '</div>' +
          '<div class="mmhelp">🖱️ اسحب الخلفية للتحريك · العجلة للتكبير · اسحب أي عنصر لتغيير مكانه · أفلت السؤال على تصنيف لنقله · 🔗 لربط سؤال بسؤال</div><div class="mmlink hidden" id="mml2"></div></div>';
        cv = A.$('#mmc'); world = A.$('#mmw'); svg = A.$('#mml'); nodes = {};
        A.$$('[data-z]', body).forEach(function (b) { b.onclick = function () { var z = b.getAttribute('data-z'); if (z === 'in') zoomAt(1.15); else if (z === 'out') zoomAt(1 / 1.15); else if (z === 'fit') fit(); else if (z === 'auto') { L = {}; saveLayout(); draw(); setTimeout(fit, 420); } }; });
        bindCanvas();
      }
      function nodeHTML(key, b, k) {
        if (key === 'root') { var a = S.site.settings.appearance, o = S.site.settings.org; return '<div class="lg">' + (a.company_logo ? '<img src="' + esc(a.company_logo) + '">' : '🤖') + '</div><b>' + esc(o.name || a.company_name || 'البوت') + '</b><small>' + data.kb.length + ' سؤال · ' + data.categories.length + ' تصنيف</small>'; }
        if (key.indexOf('c:') === 0) return '<span class="ci">' + IC.svg(b.icon, b.color, 22) + '</span><div style="min-width:0;flex:1"><b>' + esc(b.name) + '</b><small>' + b.items.length + (b.unanswered ? ' سؤال ينتظر' : ' سؤال') + (open[b.id] === false ? ' · مطوي ▸' : '') + (b.sub ? ' · ' + b.sub : '') + '</small></div>' +
          '<span class="acts">' + (!b.unanswered ? '<button data-act="addq" title="إضافة سؤال">＋</button>' : '') + (b.cat && canEdit ? '<button data-act="editc" title="تعديل">✏️</button><button data-act="delc" title="حذف">🗑</button>' : '') + '</span>';
        if (key.indexOf('u:') === 0) return '<span>❓ ' + esc(k.question) + '</span><span class="hits">' + k.count + '×</span>';
        if (key.indexOf('m:') === 0) return '<span>عرض الكل (' + b.items.length + ') ▾</span>';
        var rel = (k.related || []).length;
        return '<span title="' + esc(k.answer) + '">' + (k.source === 'learned' ? '🧠 ' : '') + esc(k.question) + '</span>' + (rel ? '<span class="rel" title="أسئلة مرتبطة">🔗' + rel + '</span>' : '') + '<span class="hits" title="مرات الاستخدام">' + (k.hits || 0) + '</span>' + (canEdit || true ? '<button class="lk" data-act="link" title="ربط بسؤال آخر">🔗</button>' : '');
      }
      function draw() {
        if (view === 'list') { body.innerHTML = ''; A.pages.kb.render.call({}, body, []); return; }
        if (!cv || !document.body.contains(cv)) shell();
        var bs = branches(), pos = layout(bs), seen = {};
        var put = function (key, cls, html, style) {
          seen[key] = 1; var el = nodes[key];
          var fresh = !el;
          if (!el) { el = document.createElement('div'); el.setAttribute('data-key', key); nodes[key] = el; world.appendChild(el); }
          el.className = 'mmn ' + cls + (linkSrc && key === 'q:' + linkSrc ? ' linksrc' : '') + (fresh ? ' appear' : ''); el.setAttribute('style', style + ';left:' + pos[key].x + 'px;top:' + pos[key].y + 'px');
          if (el._html !== html) { el.innerHTML = html; el._html = html; }
        };
        put('root', 'mm-root', nodeHTML('root'), '');
        bs.forEach(function (b) {
          put(b.key, 'mm-cat', nodeHTML(b.key, b), '--cc:' + b.color);
          b.shown.forEach(function (k) { var key = (b.unanswered ? 'u:' : 'q:') + k.id; put(key, 'mm-q' + (b.unanswered ? ' new' : '') + (k.active === 0 ? ' off' : ''), nodeHTML(key, b, k), '--cc:' + b.color); nodes[key]._b = b; nodes[key]._k = k; });
          if (pos['m:' + b.id]) put('m:' + b.id, 'mm-q more', nodeHTML('m:' + b.id, b), '--cc:' + b.color);
          nodes[b.key]._b = b;
        });
        Object.keys(nodes).forEach(function (k) { if (!seen[k]) { nodes[k].remove(); delete nodes[k]; } });
        animateLines();
        if (!fitted) { fitted = true; requestAnimationFrame(fit); }
      }

      /* ---------- connectors (follow nodes while they move) ---------- */
      function box(key) { var el = nodes[key]; if (!el) return null; return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }; }
      function lines() {
        if (!svg) return; var out = '', r = box('root');
        Object.keys(nodes).forEach(function (key) {
          var el = nodes[key];
          if (key.indexOf('c:') === 0 && r) { var c = box(key); out += curve(r.x, r.y + r.h / 2, c.x + c.w, c.y + c.h / 2, el._b.color, 2.6, ''); }
          if (/^(q|u|m):/.test(key) && el._b) { var p = box(el._b.key), qb = box(key); if (p) out += curve(p.x, p.y + p.h / 2, qb.x + qb.w, qb.y + qb.h / 2, el._b.color, 1.7, ''); }
        });
        (data.kb || []).forEach(function (k) {
          (k.related || []).forEach(function (rid) {
            var a = box('q:' + k.id), b = box('q:' + rid); if (!a || !b) return;
            var x1 = a.x, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, bend = Math.min(90, 30 + Math.abs(y2 - y1) / 4);
            out += '<path d="M' + x1 + ' ' + y1 + ' C' + (x1 - bend) + ' ' + y1 + ' ' + (x2 - bend) + ' ' + y2 + ' ' + x2 + ' ' + y2 + '" stroke="#7c3aed" stroke-width="1.8" stroke-dasharray="5 5" marker-end="url(#ar)" opacity=".8"/>';
          });
        });
        svg.innerHTML = '<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#7c3aed"/></marker></defs>' + out;
      }
      function curve(x1, y1, x2, y2, col, w) { var dx = Math.max(30, Math.abs(x1 - x2) / 2); return '<path d="M' + x1 + ' ' + y1 + ' C' + (x1 - dx) + ' ' + y1 + ' ' + (x2 + dx) + ' ' + y2 + ' ' + x2 + ' ' + y2 + '" stroke="' + col + '" stroke-width="' + w + '"/>'; }
      function animateLines() { var t0 = performance.now(); cancelAnimationFrame(anim); (function step(t) { lines(); if (t - t0 < 480) anim = requestAnimationFrame(step); })(t0); }

      /* ---------- view: pan / zoom / fit ---------- */
      function applyView() { world.style.transform = 'translate(' + V.x + 'px,' + V.y + 'px) scale(' + V.k + ')'; }
      function zoomAt(f, cx, cy) { var r = cv.getBoundingClientRect(); cx = cx == null ? r.width / 2 : cx; cy = cy == null ? r.height / 2 : cy; var k = Math.min(2, Math.max(0.25, V.k * f)); V.x = cx - (cx - V.x) * k / V.k; V.y = cy - (cy - V.y) * k / V.k; V.k = k; applyView(); }
      function fit() {
        if (!cv) return; var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        Object.keys(nodes).forEach(function (k) { var b = box(k); minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h); });
        if (minX > maxX) return; if ((data.kb || []).some(function (k) { return (k.related || []).length; })) minX -= 95; var r = cv.getBoundingClientRect(), pad = 40;
        V.k = Math.min(1.1, Math.max(0.3, Math.min((r.width - pad * 2) / (maxX - minX), (r.height - pad * 2 - 30) / (maxY - minY))));
        V.x = (r.width - (maxX - minX) * V.k) / 2 - minX * V.k; V.y = pad + 10 - minY * V.k; applyView();
      }
      var saveLayout = A.debounce(function () { if (canEdit) A.api('PUT', '/api/mindmap/layout', { site: S.site.id, layout: L }).catch(function () { }); }, 600);

      function bindCanvas() {
        cv.addEventListener('wheel', function (e) { e.preventDefault(); var r = cv.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
        cv.addEventListener('pointerdown', function (e) {
          if (e.button !== 0 || e.target.closest('.mmz') || e.target.closest('button')) return;
          var nodeEl = e.target.closest('.mmn'), sx = e.clientX, sy = e.clientY, moved = false;
          cv.setPointerCapture(e.pointerId);
          if (!nodeEl) { // pan
            var ox = V.x, oy = V.y; cv.classList.add('panning');
            var mv = function (ev) { V.x = ox + ev.clientX - sx; V.y = oy + ev.clientY - sy; applyView(); };
            var up = function () { cv.classList.remove('panning'); cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); };
            cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up); return;
          }
          var key = nodeEl.getAttribute('data-key'), group = [key];
          if (key.indexOf('c:') === 0) Object.keys(nodes).forEach(function (k) { if (nodes[k]._b && nodes[k]._b.key === key && k !== key) group.push(k); }); // a category drags its questions along
          var start = group.map(function (k) { return { k: k, x: nodes[k].offsetLeft, y: nodes[k].offsetTop }; });
          var drop = null;
          var mv = function (ev) {
            var dx = (ev.clientX - sx) / V.k, dy = (ev.clientY - sy) / V.k;
            if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
            if (!moved) { moved = true; group.forEach(function (k) { nodes[k].classList.add('dragging'); }); }
            start.forEach(function (s0) { nodes[s0.k].style.left = (s0.x + dx) + 'px'; nodes[s0.k].style.top = (s0.y + dy) + 'px'; });
            lines();
            if (key.indexOf('q:') === 0) {
              nodeEl.style.pointerEvents = 'none'; var under = document.elementFromPoint(ev.clientX, ev.clientY); nodeEl.style.pointerEvents = '';
              var c = under && under.closest('.mm-cat'); if (drop && drop !== c) drop.classList.remove('drop');
              drop = c && c.getAttribute('data-key') !== nodeEl._b.key && c.getAttribute('data-key') !== 'c:un' ? c : null; if (drop) drop.classList.add('drop');
            }
          };
          var up = function () {
            cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up);
            group.forEach(function (k) { nodes[k] && nodes[k].classList.remove('dragging'); });
            if (!moved) return click(nodeEl, key);
            if (drop) { drop.classList.remove('drop'); var cid = drop.getAttribute('data-key').slice(2); delete L[key]; saveLayout(); A.api('PUT', '/api/kb/' + key.slice(2), { category_id: Number(cid) || null }).then(load, A.fail); return; }
            if (!canEdit) return draw();
            group.forEach(function (k) { L[k] = { x: nodes[k].offsetLeft, y: nodes[k].offsetTop }; }); saveLayout();
          };
          cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up);
        });
        cv.addEventListener('click', function (e) {
          var b = e.target.closest('button[data-act]'); if (!b) return;
          e.stopPropagation(); var el = b.closest('.mmn'), key = el.getAttribute('data-key'), act = b.getAttribute('data-act'), br = el._b;
          if (act === 'addq') A.editKB({ category_id: Number(br.id) || '' }, load);
          if (act === 'editc') editCat(br.cat, load);
          if (act === 'delc') A.confirm('حذف التصنيف؟ أسئلته ستنتقل إلى «بدون تصنيف» ولن تُحذف.', true).then(function (ok) { if (ok) A.api('DELETE', '/api/kb-categories/' + br.id).then(load, A.fail); });
          if (act === 'link') startLink(Number(key.slice(2)));
        });
      }
      function click(el, key) {
        if (linkSrc && key.indexOf('q:') === 0) return finishLink(Number(key.slice(2)));
        if (key.indexOf('c:') === 0) { var id = el._b.id; open[id] = open[id] === false ? true : false; return draw(); }
        if (key.indexOf('m:') === 0) { open[key.slice(2)] = 'all'; return draw(); }
        if (key.indexOf('u:') === 0) { var u = el._k; return A.editKB({ question: u.question, lang: u.lang === 'ar' ? 'all' : u.lang }, function () { load(); A.refreshCounts(); }, { unanswered_id: u.id }); }
        if (key.indexOf('q:') === 0) return A.editKB(el._k, load);
      }
      function linkBar(txt) { var b = A.$('#mml2'); if (!b) return; b.classList.toggle('hidden', !txt); b.innerHTML = txt ? txt + ' <button class="btn sm ghost" id="mmlx">إلغاء</button>' : ''; if (txt) A.$('#mmlx').onclick = function () { linkSrc = null; linkBar(''); draw(); }; }
      function startLink(id) { linkSrc = id; var k = data.kb.find(function (x) { return x.id === id; }); linkBar('🔗 اختر السؤال الذي تريد ربطه بـ «' + esc(k.question) + '» — اضغط عليه'); draw(); }
      function finishLink(target) {
        var src = data.kb.find(function (x) { return x.id === linkSrc; }); linkSrc = null; linkBar('');
        if (!src || target === src.id) return draw();
        var rel = (src.related || []).slice(), i = rel.indexOf(target);
        if (i >= 0) rel.splice(i, 1); else { if (rel.length >= 8) return A.toast('8 أسئلة مرتبطة كحد أقصى', 'err'); rel.push(target); }
        A.api('PUT', '/api/kb/' + src.id, { related: rel }).then(function () { A.toast(i >= 0 ? 'تم إلغاء الربط' : '🔗 تم الربط — سيظهر كزر بعد الإجابة', 'ok'); load(); }, A.fail);
      }

      A.$$('#mv button').forEach(function (b) { b.onclick = function () { view = b.getAttribute('data-v'); A.$$('#mv button').forEach(function (x) { x.classList.toggle('on', x === b); }); cv = null; fitted = false; draw(); }; });
      A.$('#mq').oninput = A.debounce(function () { q = this.value.trim().toLowerCase(); if (view === 'map') { draw(); setTimeout(fit, 450); } }, 250);
      A.$('#mt').onclick = testBot;
      if (A.$('#mc')) A.$('#mc').onclick = function () { editCat(null, load); };
      A.$('#mn').onclick = function () { A.editKB(null, load); };
      var onL = function () { load(); }, onKey = function (e) { if (e.key === 'Escape' && linkSrc) { linkSrc = null; linkBar(''); draw(); } }, onResize = A.debounce(function () { if (view === 'map') fit(); }, 200);
      A.on('learned', onL); window.addEventListener('resize', onResize); document.addEventListener('keydown', onKey);
      load();
      return function () { A.off('learned', onL); window.removeEventListener('resize', onResize); document.removeEventListener('keydown', onKey); };
    }
  });

  /* ============================== settings hub ============================== */
  var TABS = [['behavior', '⚙️ سلوك البوت', 'supervisor'], ['notify', '📨 الإشعارات', 'admin'], ['datasource', '🗄️ قواعد البيانات', 'admin'], ['integrations', '🔗 الربط مع الأنظمة', 'admin'], ['sites', '🌐 المواقع', 'admin'], ['audit', '📜 سجل العمليات', 'admin']];
  A.page('settings', {
    title: 'الإعدادات العامة', icon: '⚙️', role: 'supervisor', hint: 'سلوك البوت، الإشعارات، قواعد البيانات، الربط، المواقع',
    render: function (root, sub) {
      var tabs = TABS.filter(function (t) { return A.can(t[2]); }), cur = tabs.some(function (t) { return t[0] === sub[0]; }) ? sub[0] : tabs[0][0], clean = null;
      root.innerHTML = '<div class="tabs big" id="stabs">' + tabs.map(function (t) { return '<button data-t="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div><div id="sinner"></div>';
      function show() {
        A.$$('#stabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-t') === cur); });
        if (clean) { try { clean(); } catch (e) { } clean = null; }
        var inner = A.$('#sinner'); inner.innerHTML = ''; A.dirty = false;
        clean = A.pages[cur].render.call(A.pages[cur], inner, []) || null;
      }
      A.$$('#stabs button').forEach(function (b) { b.onclick = function () { if (A.dirty && !confirm('لديك تغييرات غير محفوظة. متابعة دون حفظ؟')) return; cur = b.getAttribute('data-t'); history.replaceState(null, '', '#/settings/' + cur); show(); }; });
      show();
      this.onSub = function (s) { if (s[0] && s[0] !== cur) { cur = s[0]; show(); } };
      return function () { if (clean) clean(); };
    }
  });

  /* ============================== backup, restore & reset ============================== */
  A.page('backup', {
    title: 'النسخ الاحتياطي والتصفير', icon: '💾', role: 'admin', hint: 'احفظ نسخة من كل شيء، استرجعها، أو جدولها تلقائياً',
    render: function (root) {
      function load() {
        A.GET('/api/backups').then(function (r) {
          var c = r.config;
          root.innerHTML = '<div class="grid g2"><div>' +
            card('💾 نسخة الآن', '<p class="small muted" style="margin-top:0">تشمل كل شيء: الإعدادات، الشجرة، الخريطة الذهنية، المحادثات، الشكاوى، المستخدمين والصور.</p><div class="row wrap"><button class="btn" id="bdl">⬇️ تنزيل نسخة على جهازي</button><button class="btn soft" id="bmk">💾 حفظ نسخة في مجلد الخادم</button></div>') +
            card('♻️ استرجاع نسخة سابقة', '<p class="small muted" style="margin-top:0">اختر ملف نسخة (‎.scb) من جهازك. سيتم استبدال كل البيانات الحالية بمحتوى النسخة (تُحفظ نسخة أمان تلقائياً قبل الاسترجاع).</p><button class="btn gold" id="brs">📂 استرجاع من ملف…</button>') +
            card('⏰ النسخ التلقائي', f.sw('enabled', 'تفعيل النسخ الاحتياطي التلقائي') + '<div class="grid g3" style="margin-top:10px">' + f.select('frequency', 'التكرار', [['hourly', 'كل ساعة'], ['daily', 'يومياً'], ['weekly', 'أسبوعياً']]) + f.num('hour', 'الساعة (بتوقيت الرياض)', { min: 0, max: 23 }) + f.num('keep', 'عدد النسخ المحفوظة', { min: 1, max: 90 }) + '</div>' +
              f.text('folder', 'المجلد على الخادم', { ltr: true, ph: r.folder, hint: 'اتركه فارغاً لاستخدام المجلد الافتراضي: ' + esc(r.folder) }) + f.text('email', 'إرسال كل نسخة تلقائية إلى البريد', { ltr: true, ph: 'backup@example.org', hint: 'يتطلب تفعيل البريد في الإشعارات' }) +
              (r.persistent ? '' : '<div class="alert warn" style="margin-bottom:10px">⚠️ الاستضافة الحالية مؤقتة الملفات (مثل Render المجاني): مجلد الخادم يُمسح عند إعادة التشغيل. البيانات نفسها محفوظة في قاعدة البيانات، لكن للنسخ الاحتياطية استخدم «التنزيل» أو «الإرسال للبريد».</div>') +
              '<div class="row"><button class="btn" id="bcs">حفظ الجدولة</button><span class="small muted">آخر نسخة تلقائية: ' + (r.last ? A.fmtDate(r.last) : '—') + '</span></div>') + '</div><div>' +
            card('🗂️ النسخ المحفوظة على الخادم', r.files.length ? '<div class="tbl-wrap"><table class="t"><thead><tr><th>الملف</th><th>النوع</th><th>الحجم</th><th>التاريخ</th><th></th></tr></thead><tbody>' + r.files.map(function (x) {
              return '<tr><td class="ltr tiny">' + esc(x.name) + '</td><td>' + ({ auto: '<span class="tag blue">تلقائية</span>', manual: '<span class="tag green">يدوية</span>', 'pre-reset': '<span class="tag red">قبل التصفير</span>', 'pre-restore': '<span class="tag amber">قبل الاسترجاع</span>' }[x.kind] || x.kind) + '</td><td class="small">' + (x.size / 1024 / 1024).toFixed(2) + ' MB</td><td class="small muted">' + A.fmtDate(x.created_at) + '</td>' +
                '<td style="white-space:nowrap"><button class="btn sm ghost" data-d="' + esc(x.name) + '">⬇️</button> <button class="btn sm soft" data-r="' + esc(x.name) + '">استرجاع</button> <button class="btn sm danger ghost" data-x="' + esc(x.name) + '">✕</button></td></tr>';
            }).join('') + '</tbody></table></div>' : '<div class="empty">لا توجد نسخ محفوظة بعد</div>') +
            '<div class="card reset-box"><h3>🧨 تصفير البرنامج</h3><p class="sub">يحذف البيانات المختارة نهائياً. «الإعدادات والربط» تنشئ موقعاً جديداً بمفتاح جديد، فيتوقف كود التركيب القديم وإضافة ووردبريس عن العمل. تُحفظ نسخة أمان تلقائياً قبل التصفير.</p>' +
            '<div class="checks">' + [['conversations', '💬 المحادثات'], ['tickets', '📝 الشكاوى والاقتراحات'], ['knowledge', '🧠 الخريطة الذهنية'], ['media', '🖼️ الصور والملفات'], ['users', '👥 المستخدمون (عدا حسابك)'], ['settings', '⚙️ الإعدادات والشجرة والربط'], ['logs', '📜 السجلات']].map(function (x) { return '<label><input type="checkbox" data-s="' + x[0] + '" checked> ' + x[1] + '</label>'; }).join('') + '</div>' +
            '<div class="grid g2" style="margin-top:12px"><div class="field"><label class="f">كلمة مرورك</label><input class="in" type="password" id="rpw" dir="ltr"></div><div class="field"><label class="f">اكتب كلمة <b>تصفير</b> للتأكيد</label><input class="in" id="rcf"></div></div><button class="btn danger" id="rgo">🧨 تصفير الآن</button></div></div></div>';
          A.bind(root.querySelector('.grid > div:first-child .card:nth-child(3)'), c);
          A.$('#bdl').onclick = function () { A.download('/api/backup/download'); };
          A.$('#bmk').onclick = function () { A.api('POST', '/api/backups', {}).then(function (x) { A.toast('تم حفظ ' + x.name, 'ok'); load(); }, A.fail); };
          A.$('#bcs').onclick = function () { A.api('PUT', '/api/backups/config', c).then(function () { A.toast('تم حفظ الجدولة', 'ok'); load(); }, A.fail); };
          A.$('#brs').onclick = function () {
            A.pickFile('.scb,.gz,.json').then(function (fs) {
              if (!fs[0]) return;
              A.confirm('سيتم استبدال كل البيانات الحالية بمحتوى «' + fs[0].name + '». متابعة؟', true).then(function (ok) {
                if (!ok) return; A.toast('جارٍ الاسترجاع…');
                fetch('/api/backup/restore', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Authorization: 'Bearer ' + S.token }, body: fs[0] })
                  .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error); return j; }); })
                  .then(function () { A.toast('تم الاسترجاع ✅ — سيتم إعادة التحميل', 'ok'); setTimeout(function () { location.reload(); }, 1200); }, A.fail);
              });
            });
          };
          A.$$('[data-d]', root).forEach(function (b) { b.onclick = function () { A.download('/api/backups/' + encodeURIComponent(b.getAttribute('data-d'))); }; });
          A.$$('[data-x]', root).forEach(function (b) { b.onclick = function () { A.confirm('حذف هذه النسخة؟', true).then(function (ok) { if (ok) A.api('DELETE', '/api/backups/' + encodeURIComponent(b.getAttribute('data-x'))).then(load, A.fail); }); }; });
          A.$$('[data-r]', root).forEach(function (b) { b.onclick = function () { A.confirm('استرجاع «' + b.getAttribute('data-r') + '»؟ ستُستبدل كل البيانات الحالية.', true).then(function (ok) { if (ok) A.api('POST', '/api/backups/' + encodeURIComponent(b.getAttribute('data-r')) + '/restore', {}).then(function () { A.toast('تم الاسترجاع ✅', 'ok'); setTimeout(function () { location.reload(); }, 1200); }, A.fail); }); }; });
          A.$('#rgo').onclick = function () {
            var scope = {}; A.$$('[data-s]', root).forEach(function (x) { scope[x.getAttribute('data-s')] = x.checked; });
            A.confirm('هل أنت متأكد؟ لا يمكن التراجع إلا باسترجاع نسخة احتياطية.', true).then(function (ok) {
              if (!ok) return;
              A.api('POST', '/api/reset', { password: A.$('#rpw').value, confirm: A.$('#rcf').value, scope: scope }).then(function () { A.toast('تم التصفير', 'ok'); setTimeout(function () { location.reload(); }, 1200); }, A.fail);
            });
          };
        }).catch(A.fail);
      }
      load();
    }
  });

  /* ============================== databases (main + extra + custom look-ups) ============================== */
  A.page('datasource', {
    title: 'قواعد البيانات', icon: '🗄️', role: 'admin',
    render: function (root) {
      A.settingsPage(root, ['datasource'], function (el, d, ch) {
        var D = d.datasource; D.connections = D.connections || []; D.lookups = D.lookups || [];
        var TYPES = [
          ['wordpress', '🧩 قاعدة بيانات موقع ووردبريس (عبر الإضافة)', '', 'تعمل حتى إذا كانت قاعدة البيانات داخل شبكة الشركة أو في استضافة تمنع الاتصال الخارجي (مثل InfinityFree): إضافة ووردبريس تقرأ من خادم الموقع — من قاعدة ووردبريس أو من قاعدة MySQL منفصلة — وفقط من الجداول التي تسمح بها', '{"table":"beneficiaries","where":{"id_number":":id_number"},"columns":["full_name","file_status"]}'],
          ['mysql', '🐬 MySQL / MariaDB', 'mysql://user:pass@host:3306/db', 'يشمل: استضافات cPanel، PlanetScale، AWS RDS، Azure MySQL. أضف ?ssl=true للخوادم السحابية التي تتطلب SSL', "SELECT status FROM orders WHERE order_no = :order_no AND phone = :phone"],
          ['postgres', '🐘 PostgreSQL', 'postgres://user:pass@host:5432/db', 'يشمل: Supabase، Neon، AWS RDS، Google Cloud SQL، Azure. في Supabase استخدم رابط Session pooler', "SELECT status FROM orders WHERE order_no = :order_no AND phone = :phone"],
          ['mssql', '🟦 SQL Server / Azure SQL', 'Server=host,1433;Database=db;User Id=user;Password=pass;Encrypt=true;TrustServerCertificate=true', 'أو mssql://user:pass@host:1433/db — يشمل SQL Server داخل الجهة و Azure SQL', "SELECT TOP 3 status FROM orders WHERE order_no = :order_no AND phone = :phone"],
          ['oracle', '🟥 Oracle / Oracle Cloud', 'oracle://user:pass@host:1521/service_name', 'يعمل بدون تثبيت Oracle Client', "SELECT status FROM orders WHERE order_no = :order_no AND phone = :phone"],
          ['mongodb', '🍃 MongoDB / Atlas', 'mongodb+srv://user:pass@cluster.mongodb.net/db', 'الاستعلام يُكتب JSON: المجموعة والفلتر', '{"collection":"orders","filter":{"order_no":":order_no","phone":":phone"},"limit":3}'],
          ['sheet', '📗 Google Sheets / رابط CSV', 'https://docs.google.com/spreadsheets/d/…/edit#gid=0', 'شارك الجدول «لأي شخص لديه الرابط» أو انشره كـ CSV. أسماء الأعمدة = الصف الأول، والجدول اسمه data', "SELECT status FROM data WHERE order_no = :order_no AND phone = :phone"],
          ['file', '📄 ملف Excel / CSV', '', 'ارفع ملف .xlsx أو .csv — أسماء الأعمدة = الصف الأول، والجدول اسمه data. يُحدَّث برفع ملف جديد', "SELECT status FROM data WHERE order_no = :order_no AND phone = :phone"],
          ['sqlite', '🪶 SQLite (ملف على الخادم)', '/path/to/file.db', 'ملف قاعدة بيانات SQLite موجود على نفس الخادم', "SELECT status FROM orders WHERE order_no = :order_no AND phone = :phone"],
          ['api', '🌐 REST API', '', 'أي نظام له API: Firebase، Airtable، نظام ERP أو CRM. الاستعلام = المسار، والمتغيرات بين { }', '/orders/{order_no}?phone={phone}']
        ];
        var TT = {}; TYPES.forEach(function (t) { TT[t[0]] = t; });
        function connFields(c, extra) {
          var t = TT[c.type];
          if (!t) return '';
          if (c.type === 'api') return '<div class="grid g2">' + f.text(extra + 'api_url', 'رابط API الأساسي', { ltr: true, ph: 'https://api.example.com' }) + f.text(extra + 'api_headers', 'Headers (JSON)', { ltr: true, mono: true, ph: '{"Authorization":"Bearer …"}' }) + '</div><div class="hint">' + t[3] + '</div>';
          if (c.type === 'wordpress') return f.text(extra + 'wp_url', 'رابط موقع ووردبريس', { ltr: true, ph: 'https://example.com' }) +
            '<ol class="steps small" style="margin:8px 0"><li>نزّل الإضافة الجديدة (2.2) من <a href="#/install">تركيب المحادثة</a> وارفعها في ووردبريس (استبدال الحالية).</li><li>في ووردبريس: <b>الإعدادات ← Smart Chat Agent</b> ← اختر جداول قاعدة ووردبريس، و/أو فعّل <b>قاعدة بيانات خارجية</b> واكتب بياناتها هناك (تبقى في موقعك) ثم اختر جداولها ← حفظ.</li><li>اضغط «🔎 عرض الجداول» للتأكد، ثم أنشئ الاستعلامات من تبويب «الاستعلامات».</li></ol>' +
            '<div class="row wrap"><button type="button" class="btn soft sm" data-wpt>🔎 عرض الجداول المسموحة</button><span class="small" data-wpi></span></div><div class="hint">' + TT.wordpress[3] + '. البحث يتم من داخل موقعك، لذا جرّب المحادثة من صفحة في موقعك.</div>';
          if (c.type === 'file') return '<div class="row wrap"><button type="button" class="btn soft" data-upl>📤 رفع ملف Excel / CSV</button><span class="small" data-finfo>' + (c.connection ? '⏳' : '<span class="muted">لم يُرفع ملف بعد</span>') + '</span></div><div class="hint">' + t[3] + '</div>';
          return f.text(extra + 'connection', 'رابط الاتصال', { ltr: true, mono: true, ph: t[2], hint: t[3] });
        }
        // opens a small window on the WordPress site; the plugin answers (allowed tables / a test read) by postMessage
        function wpBridge(connId, op, query, params) {
          return A.api('POST', '/api/sites/' + S.site.id + '/wp-bridge', { connection: connId, op: op, query: query, params: params || {}, datasource: D }).then(function (r) {
            return new Promise(function (res, rej) {
              var w = window.open(r.url, 'scbridge', 'width=420,height=260');
              if (!w) return rej(new Error('اسمح بالنوافذ المنبثقة لهذه الصفحة ثم أعد المحاولة'));
              var tm = setTimeout(function () { window.removeEventListener('message', on); rej(new Error('لم يصل رد من موقع ووردبريس — تأكد من تحديث الإضافة إلى الإصدار 2.1 ومن رابط الموقع')); }, 45000);
              function on(e) { if (e.origin !== r.origin || !e.data || e.data.type !== 'smartchat-bridge') return; clearTimeout(tm); window.removeEventListener('message', on); e.data.ok ? res(e.data) : rej(new Error(e.data.error === 'bad signature' ? 'المفتاح السري لا يطابق — نزّل الإضافة من جديد من صفحة التركيب' : e.data.error)); }
              window.addEventListener('message', on);
            });
          });
        }
        function wireConn(box, c, onChange) {
          var wpt = box.querySelector('[data-wpt]');
          if (wpt) wpt.onclick = function () {
            var info = box.querySelector('[data-wpi]'); info.textContent = '⏳';
            var cid = c === D ? 'main' : c.id;
            (A.dirty ? A.saveSite({ settings: { datasource: D } }).then(function () { A.setDirty(false); }) : Promise.resolve()).then(function () { return wpBridge(cid, 'schema'); })
              .then(function (x) { info.innerHTML = x.tables.length ? '✅ ' + x.tables.map(function (t) { return '<b>' + esc(t.name) + '</b> <span class="tiny muted">(' + t.columns.length + ' عمود)</span>'; }).join('، ') : '⚠️ متصل، لكن لم تُختر أي جداول في إعدادات الإضافة'; }, function (e) { info.textContent = '❌ ' + e.message; });
          };
          var up = box.querySelector('[data-upl]'), info = box.querySelector('[data-finfo]');
          if (info && c.connection) A.GET('/api/datasource/file-info?conn=' + encodeURIComponent(c.connection)).then(function (x) { info.innerHTML = x.name ? '✅ <b>' + esc(x.name) + '</b> — ' + x.rows + ' صف · الأعمدة: <span class="ltr tiny">' + esc(x.columns.join(', ')) + '</span>' : '<span class="muted">الملف غير موجود — ارفعه مرة أخرى</span>'; });
          if (up) up.onclick = function () {
            A.pickFile('.xlsx,.csv,.txt').then(function (fs) {
              if (!fs[0]) return; info.textContent = 'جارٍ الرفع…';
              fetch('/api/datasource/file?name=' + encodeURIComponent(fs[0].name), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Authorization: 'Bearer ' + S.token }, body: fs[0] })
                .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error); return j; }); })
                .then(function (x) { c.connection = x.connection; onChange(); info.innerHTML = '✅ <b>' + esc(x.name) + '</b> — ' + x.rows + ' صف · الأعمدة: <span class="ltr tiny">' + esc(x.columns.join(', ')) + '</span> <span class="muted">(احفظ التغييرات)</span>'; }, function (e) { info.textContent = '❌ ' + e.message; });
            });
          };
        }
        el.innerHTML = '<div class="alert info" style="margin-bottom:16px">🔗 اربط البوت بأي مصدر بيانات — تقليدي داخل الجهة أو سحابي — ليجيب المستفيد من بياناته: حالة الطلب، ملف المستفيد، موعد الصرف… اكتب في الاستعلام متغيرات مثل <code>:phone</code> و <code>:id_number</code> وسيطلبها البوت من المستفيد تلقائياً. 🔒 القراءة فقط: لا يمكن للبوت التعديل أو الحذف، ويُنصح بمستخدم قراءة فقط.</div>' +
          '<div class="tabs" id="dstabs" style="margin-bottom:14px"><button data-t="conn" class="on">🔌 1) الاتصال</button><button data-t="fields">🧾 2) المربعات</button><button data-t="q">🔎 3) الاستعلامات</button></div>' +
          '<div data-dsec="conn">' + card('🗄️ قاعدة البيانات الرئيسية', '<div class="grid g2"><div>' + f.select('datasource.type', 'النوع', [['demo', '🧪 بيانات تجريبية'], ['none', '— بدون —']].concat(TYPES.map(function (t) { return [t[0], t[1]]; }))) + '</div><div id="mainconn"></div></div>') +
          card('➕ قواعد بيانات إضافية', '<div id="conns"></div><button class="btn soft sm" id="addc">+ إضافة مصدر بيانات</button>', 'يمكن ربط أكثر من مصدر معاً: مثلاً SQL Server لنظام المستفيدين + Google Sheets لمواعيد الصرف + API لنظام آخر.') + '</div>' +
          '<div data-dsec="fields" class="hidden">' + card('🧾 المربعات التي يسألها البوت', '<div id="fmiss"></div><div id="flds"></div><button class="btn soft sm" id="addf">+ مربع جديد</button>', 'كل مربع = معلومة يطلبها البوت من المستفيد قبل البحث (رقم الملف، الاسم، تاريخ الميلاد…). اكتب اسمه المختصر في الاستعلام بعد نقطتين مثل <code>:file_no</code>، والبوت يسأل عنه بالسؤال الذي تكتبه ويتحقق من صحة الإجابة. يعمل مع كل أنواع قواعد البيانات.') + '</div>' +
          '<div data-dsec="q" class="hidden">' + card('🔎 استعلامات البوت', '<details open><summary class="b" style="cursor:pointer;margin-bottom:10px">📦 حالة الطلب (مدمج)</summary>' + f.area('datasource.order_query', 'الاستعلام', { mono: true, rows: 2 }) + '<div class="grid g2">' + f.area('datasource.order_template', 'قالب الرد', { rows: 2 }) + f.area('datasource.notes_template', 'قالب الملاحظات', { rows: 2 }) + '</div></details>' +
            '<details><summary class="b" style="cursor:pointer;margin-bottom:10px">🪪 بيانات المستفيد (مدمج)</summary>' + f.area('datasource.customer_query', 'الاستعلام', { mono: true, rows: 2 }) + f.area('datasource.customer_template', 'قالب الرد', { rows: 3 }) + '</details>' +
            '<div class="section-title" style="margin-top:16px"><h2>استعلامات مخصصة</h2></div><div id="lks"></div><button class="btn soft sm" id="addl">+ استعلام جديد</button> <button class="btn gold sm" id="addmy">🪪 جاهز: «بياناتي» برقم الهوية</button>', 'كل استعلام مخصص له كلمات يفهم بها البوت الطلب، ويمكن ربطه بزر في «القوائم والأزرار» (إجراء: استعلام مخصص).') + '</div>';
        A.bind(el, d, function (k) { ch(); if (k === 'datasource.type') mainConn(); if (/_query$/.test(k)) fields(); });
        A.$$('#dstabs button', el).forEach(function (b) { b.onclick = function () { var t = b.getAttribute('data-t'); A.$$('#dstabs button', el).forEach(function (x) { x.classList.toggle('on', x === b); }); A.$$('[data-dsec]', el).forEach(function (x) { x.classList.toggle('hidden', x.getAttribute('data-dsec') !== t); }); }; });
        function mainConn() {
          var box = A.$('#mainconn', el), t = TT[D.type];
          box.innerHTML = t ? connFields(D, 'datasource.') + '<div class="hint">مثال استعلام: <code class="ltr">' + esc(t[4]) + '</code></div>' : (D.type === 'demo' ? '<div class="hint" style="margin-top:28px">جداول تجريبية: demo_orders و demo_customers (طلب 1001 بجوال 0500000001)</div>' : '');
          A.bind(box, d, ch); wireConn(box, D, ch);
        }
        mainConn();
        function conns() {
          A.$('#conns', el).innerHTML = D.connections.map(function (c, i) {
            return '<div class="repeat" data-i="' + i + '"><div class="row" style="margin-bottom:8px"><input class="in" data-k="name" placeholder="الاسم (مثال: نظام المستفيدين)" style="font-weight:700"><select class="in" data-k="type" style="width:auto">' + TYPES.map(function (t) { return '<option value="' + t[0] + '">' + t[1] + '</option>'; }).join('') + '</select><button class="btn sm danger ghost icon" data-rm>✕</button></div>' +
              '<div data-cf>' + connFields(c, '') + '</div><div class="hint">مثال استعلام: <code class="ltr">' + esc((TT[c.type] || TYPES[0])[4]) + '</code></div></div>';
          }).join('') || '<p class="small muted">لا توجد مصادر إضافية</p>';
          A.$$('.repeat', A.$('#conns', el)).forEach(function (r) { var i = Number(r.getAttribute('data-i')), c = D.connections[i]; A.bind(r, c, function (k) { ch(); if (k === 'type') { c.connection = ''; conns(); lks(); } }); wireConn(r, c, ch); r.querySelector('[data-rm]').onclick = function () { D.connections.splice(i, 1); ch(); conns(); lks(); }; });
        }
        function inMenu(id) { var m = S.site.tree.nodes.find(function (n) { return n.id === 'menu'; }) || S.site.tree.nodes.find(function (n) { return n.id === S.site.tree.root; }); return !!(m && m.options.some(function (o) { return o.action === 'lookup' && o.target === id; })); }
        function lks() {
          var opts = [['main', 'الرئيسية']].concat(D.connections.map(function (c) { return [c.id, (c.name || c.id) + ' (' + ((TT[c.type] || [0, c.type])[1]) + ')']; }));
          A.$('#lks', el).innerHTML = D.lookups.map(function (l, i) {
            return '<div class="repeat" data-i="' + i + '"><div class="row" style="margin-bottom:8px"><input class="in" data-k="title" placeholder="اسم الاستعلام (مثال: موعد صرف المساعدة)" style="font-weight:700"><select class="in" data-k="connection" style="width:auto">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '">🗄️ ' + esc(o[1]) + '</option>'; }).join('') + '</select><button class="btn sm danger ghost icon" data-rm>✕</button></div>' +
              f.text('keywords', 'كلمات يُفهم بها الطلب', { ph: 'موعد الصرف, متى الصرف, صرف المساعدة' }) + f.area('query', 'الاستعلام (أو مسار API)', { mono: true, rows: 2, ph: 'SELECT next_date, amount FROM aid WHERE id_number = :id_number' }) +
              '<div class="grid g2">' + f.area('template', 'قالب الرد', { rows: 2, ph: 'موعد الصرف القادم: {next_date}\nالمبلغ: {amount} ريال' }) + f.text('not_found', 'عند عدم وجود نتيجة', { ph: 'لم أجد بيانات بهذه المعلومات.' }) + '</div>' +
              '<div class="row"><button class="btn sm gold" data-bld>🪄 بناء الاستعلام بدون كتابة</button><button class="btn sm soft" data-menu>' + (inMenu(l.id) ? '✅ في القائمة الرئيسية' : '➕ زر في القائمة الرئيسية') + '</button><input class="in" data-tp placeholder=\'{"id_number":"1234567890"}\' dir="ltr" style="font-family:ui-monospace,monospace"><button class="btn sm soft" data-t>🧪 اختبار</button></div><pre class="code hidden" data-r style="margin-top:8px;max-height:200px;overflow:auto"></pre></div>';
          }).join('') || '<p class="small muted">لا توجد استعلامات مخصصة</p>';
          A.$$('.repeat', A.$('#lks', el)).forEach(function (r) {
            var i = Number(r.getAttribute('data-i')), l = D.lookups[i];
            A.bind(r, l, function (k) { ch(); if (k === 'query') fields(); });
            r.querySelector('[data-bld]').onclick = function () { builder(l); };
            r.querySelector('[data-menu]').onclick = function () {
              if (inMenu(l.id)) return A.toast('الزر موجود في القائمة الرئيسية — غيّر اسمه أو أخفِه من «القوائم والأزرار» ← تعديل أزرار القائمة', 'ok');
              if (!l.query) return A.toast('أنشئ الاستعلام أولاً', 'err');
              var tree = A.clone(S.site.tree), m = tree.nodes.find(function (n) { return n.id === 'menu'; }) || tree.nodes.find(function (n) { return n.id === tree.root; });
              var last = m.options.length && /رئيسية|إنهاء/.test(m.options[m.options.length - 1].label || '') ? m.options.length - 1 : m.options.length;
              m.options.splice(last, 0, { label: (l.id === 'my_data' ? '🪪 ' : '🔎 ') + (l.title || 'استعلام'), action: 'lookup', target: l.id });
              A.saveSite({ settings: { datasource: D } }).then(function () { return A.saveSite({ tree: tree }); }).then(function () { A.setDirty(false); A.toast('تمت الإضافة للقائمة الرئيسية ✅', 'ok'); lks(); }, A.fail);
            };
            r.querySelector('[data-rm]').onclick = function () { D.lookups.splice(i, 1); ch(); lks(); };
            r.querySelector('[data-t]').onclick = function () {
              var params = {}, out = r.querySelector('[data-r]'); try { params = JSON.parse(r.querySelector('[data-tp]').value || '{}'); } catch (e) { return A.toast('صيغة JSON غير صحيحة', 'err'); }
              out.classList.remove('hidden'); out.textContent = '…';
              var lcn = !l.connection || l.connection === 'main' ? D : D.connections.find(function (c) { return c.id === l.connection; }) || {};
              if (lcn.type === 'wordpress') return wpBridge(l.connection || 'main', 'read', l.query, params).then(function (x) { out.textContent = '✅ من موقع ووردبريس:\n' + JSON.stringify(x.rows, null, 2); }, function (e) { out.textContent = '❌ ' + e.message; });
              A.api('POST', '/api/sites/' + S.site.id + '/datasource/test', { which: l.id, params: params, datasource: D }).then(function (x) { out.textContent = '✅ المتغيرات: ' + x.params.join(', ') + '\n' + JSON.stringify(x.rows, null, 2); }).catch(function (e) { out.textContent = '❌ ' + e.message + (A.dirty ? '\n(احفظ التغييرات أولاً إذا أضفت قاعدة بيانات جديدة)' : ''); });
            };
          });
        }
        /* ---------- boxes (fields) ---------- */
        var FTYPES = [['text', '🔤 نص'], ['number', '🔢 أرقام فقط'], ['code', '#️⃣ رقم ملف / طلب (أحرف وأرقام)'], ['phone', '📱 رقم جوال'], ['id', '🪪 رقم هوية / إقامة'], ['email', '✉️ بريد إلكتروني'], ['date', '📅 تاريخ']];
        var BUILTIN = { order_no: ['رقم الطلب', 'code'], phone: ['رقم الجوال', 'phone'], email: ['البريد الإلكتروني', 'email'], id_number: ['رقم الهوية', 'id'] };
        D.fields = D.fields || [];
        // the 4 common boxes are added once; after that every box can be deleted
        if (!D.fields_ready) { Object.keys(BUILTIN).forEach(function (k) { if (!D.fields.some(function (x) { return x.key === k; })) D.fields.push({ key: k, label: BUILTIN[k][0], type: BUILTIN[k][1], prompt: '', error: '' }); }); D.fields_ready = true; }
        var PRE = /(?:^|[^:\w]):([a-zA-Z_]\w*)/g;
        function varsUsed() {
          var used = {};
          function scan(q, where) { var m; PRE.lastIndex = 0; while ((m = PRE.exec(String(q || '')))) (used[m[1]] = used[m[1]] || []).push(where); String(q || '').replace(/\{(\w+)\}/g, function (_, n) { if (/^\s*\//.test(q)) (used[n] = used[n] || []).push(where); }); }
          scan(D.order_query, 'حالة الطلب'); scan(D.customer_query, 'بيانات المستفيد');
          D.lookups.forEach(function (l) { scan(l.query, l.title || 'استعلام مخصص'); });
          return used;
        }
        function slugKey(s, i) { var k = String(s || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, ''); if (!k || /^\d/.test(k)) k = 'field_' + (i || D.fields.length + 1); while (D.fields.some(function (x) { return x.key === k; })) k += '_2'; return k; }
        function guessType(n) { n = String(n).toLowerCase(); return /phone|mobile|جوال|هاتف/.test(n) ? 'phone' : /mail|بريد/.test(n) ? 'email' : /id_?num|national|iqama|هوية|إقامة|اقامة/.test(n) ? 'id' : /date|تاريخ|birth|ميلاد/.test(n) ? 'date' : /(^|_)(no|num|number|code|ref)$|رقم/.test(n) ? 'code' : 'text'; }
        function fields() {
          var used = varsUsed(), defs = S.i18n.defaults.ar || {};
          var miss = Object.keys(used).filter(function (k) { return !D.fields.some(function (x) { return x.key === k; }); });
          A.$('#fmiss', el).innerHTML = miss.length ? '<div class="alert warn" style="margin-bottom:12px">⚠️ متغيرات مستخدمة في الاستعلامات بدون مربع: ' + miss.map(function (k) { return '<button class="btn sm soft" data-addv="' + k + '">+ <span class="ltr">:' + k + '</span></button>'; }).join(' ') + ' <span class="tiny">(بدونها يسأل البوت بسؤال عام)</span></div>' : '';
          A.$$('[data-addv]', el).forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-addv'); D.fields.push({ key: k, label: k, type: guessType(k), prompt: '', error: '' }); ch(); fields(); }; });
          A.$('#flds', el).innerHTML = D.fields.map(function (x, i) {
            var u = used[x.key];
            return '<div class="repeat" data-i="' + i + '"><div class="row" style="margin-bottom:8px;flex-wrap:wrap"><input class="in" data-k="label" placeholder="اسم المربع (مثال: رقم الملف)" style="font-weight:700;flex:1;min-width:160px">' +
              '<span class="ltr" style="display:flex;align-items:center;gap:2px"><b class="muted">:</b><input class="in" data-k="key" placeholder="file_no" dir="ltr" style="width:130px;font-family:ui-monospace,monospace"></span>' +
              '<select class="in" data-k="type" style="width:auto">' + FTYPES.map(function (t) { return '<option value="' + t[0] + '">' + t[1] + '</option>'; }).join('') + '</select>' +
              '<button class="btn sm danger ghost icon" data-rm title="حذف المربع">✕</button></div>' +
              '<div class="grid g2">' + f.text('prompt', 'سؤال البوت', { ph: defs['ask_' + x.key] || ('من فضلك أرسل ' + (x.label || x.key)) }) + f.text('error', 'رسالة عند إدخال قيمة خاطئة (اختياري)', { ph: 'يُكتب تلقائياً حسب النوع' }) + '</div>' +
              '<details><summary class="tiny muted" style="cursor:pointer">🌐 الترجمة (English / اردو)</summary><div class="grid g3" style="margin-top:6px">' + f.text('label_en', 'Name (English)', { ltr: true }) + f.text('prompt_en', 'Question (English)', { ltr: true }) + f.text('prompt_ur', 'سوال (اردو)') + '</div></details>' +
              '<div class="tiny ' + (u ? 'muted' : 'muted') + '" style="margin-top:4px">' + (u ? '✅ مستخدم في: ' + esc(u.filter(function (v, j, a) { return a.indexOf(v) === j; }).join('، ')) : '◻️ غير مستخدم بعد — اكتب <span class="ltr">:' + esc(x.key || '…') + '</span> في أي استعلام') + '</div></div>';
          }).join('');
          A.$$('.repeat', A.$('#flds', el)).forEach(function (r) {
            var i = Number(r.getAttribute('data-i')), x = D.fields[i];
            A.bind(r, x, function (k) { if (k === 'key') { var c = String(x.key || '').replace(/[^a-zA-Z0-9_]/g, '').replace(/^\d+/, ''); if (c !== x.key) { x.key = c; r.querySelector('[data-k=key]').value = c; } } ch(); });
            r.querySelector('[data-rm]').onclick = function () {
              var u = varsUsed()[x.key], go = function () { D.fields.splice(i, 1); ch(); fields(); };
              if (!u) return go();
              A.confirm('المربع «' + (x.label || x.key) + '» مستخدم في: ' + u.join('، ') + '. إذا حذفته سيسأل البوت عنه بسؤال عام. حذف؟').then(function (ok) { if (ok) go(); });
            };
          });
        }
        A.$('#addf', el).onclick = function () { D.fields.push({ key: slugKey(''), label: '', type: 'text', prompt: '', error: '' }); ch(); fields(); };

        /* ---------- build a query without writing SQL ---------- */
        function builder(l) {
          var m = A.modal({ title: '🪄 بناء الاستعلام بدون كتابة', size: 'wide', body: '<p class="muted">⏳ جارٍ قراءة الجداول من قاعدة البيانات…</p>', buttons: false });
          var lc = !l.connection || l.connection === 'main' ? D : D.connections.find(function (c) { return c.id === l.connection; }) || {};
          (lc.type === 'wordpress' ? wpBridge(l.connection || 'main', 'schema').then(function (x) { return { type: 'wordpress', tables: x.tables }; }) : A.api('POST', '/api/sites/' + S.site.id + '/datasource/schema', { connection: l.connection || 'main', datasource: D })).then(function (sc) {
            if (!sc.tables.length) { m.body.innerHTML = '<div class="alert warn">لم أجد جداول في قاعدة البيانات</div>'; return; }
            var type = sc.type, st = { t: sc.tables[0].name, by: {}, show: {}, mode: l.id === 'my_data' ? 'all' : 'any', verify: '' };
            function draw() {
              var tb = sc.tables.filter(function (t) { return t.name === st.t; })[0] || sc.tables[0];
              m.body.innerHTML = '<div class="field"><label class="f">1) اختر الجدول</label><select class="in" id="bt">' + sc.tables.map(function (t) { return '<option' + (t.name === st.t ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('') + '</select></div>' +
                '<label class="f">2) كيف يبحث البوت؟</label><div class="checks" style="margin-bottom:10px"><label><input type="radio" name="bm" value="any"' + (st.mode === 'any' ? ' checked' : '') + '> 🔢 <b>أي رقم مسجّل</b> — يسأل المستفيد سؤالاً واحداً ويبحث بالرقم في كل الأعمدة المحددة (رقم الطلب أو الهوية أو الجوال…)</label><label><input type="radio" name="bm" value="all"' + (st.mode === 'all' ? ' checked' : '') + '> 🧩 <b>كل الشروط معاً</b> — يسأل عن كل عمود محدد على حدة (مثال: رقم الطلب + الجوال)</label></div>' +
                (st.mode === 'any' && type !== 'wordpress' ? '<div class="field"><label class="f">🔒 تحقق إضافي (موصى به لحماية بيانات المستفيدين)</label><select class="in" id="bv"><option value="">بدون — يكفي الرقم</option>' + tb.columns.map(function (c) { return '<option value="' + esc(c) + '"' + (st.verify === c ? ' selected' : '') + '>يطلب أيضاً رقم الجوال ويطابقه مع: ' + esc(c) + '</option>'; }).join('') + '</select></div>' : '') +
                '<label class="f">3) حدّد الأعمدة <span class="muted">— الفارغ منها يُخفى تلقائياً من الرد (مثلاً «السبب» يظهر فقط إذا كان مسجلاً)</span></label><div class="row" style="margin-bottom:8px"><button class="btn sm soft" id="ball">👁️ اعرض كل الأعمدة</button><button class="btn sm ghost" id="bnone">إلغاء الكل</button></div><div class="tbl-wrap"><table class="t"><thead><tr><th>العمود</th><th>🔎 يسأل المستفيد عنه ويبحث به</th><th>👁️ يعرضه في الرد</th></tr></thead><tbody>' +
                tb.columns.map(function (c, i) {
                  var by = st.by[c], sh = st.show[c];
                  return '<tr><td class="ltr"><b>' + esc(c) + '</b></td><td><label class="row"><input type="checkbox" data-by="' + i + '"' + (by ? ' checked' : '') + '>' + (by && st.mode === 'all' ? '<select class="in" data-bf="' + i + '" style="width:auto">' + D.fields.map(function (x) { return '<option value="' + esc(x.key) + '"' + (by === x.key ? ' selected' : '') + '>' + esc(x.label || x.key) + '</option>'; }).join('') + '<option value="__new"' + (by === '__new' ? ' selected' : '') + '>➕ مربع جديد: ' + esc(c) + '</option></select>' : '') + '</label></td>' +
                    '<td><label class="row"><input type="checkbox" data-sh="' + i + '"' + (sh != null ? ' checked' : '') + '>' + (sh != null ? '<input class="in" data-sl="' + i + '" value="' + esc(sh) + '" placeholder="العنوان في الرد" style="width:160px">' : '') + '</label></td></tr>';
                }).join('') + '</tbody></table></div><div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn ghost" id="bx">إلغاء</button><button class="btn" id="bg">✅ إنشاء الاستعلام</button></div>';
              A.$('#bt', m.body).onchange = function () { st = { t: this.value, by: {}, show: {}, mode: st.mode, verify: '' }; draw(); };
              A.$$('[name=bm]', m.body).forEach(function (r) { r.onchange = function () { st.mode = r.value; draw(); }; });
              if (A.$('#bv', m.body)) A.$('#bv', m.body).onchange = function () { st.verify = this.value; };
              A.$('#ball', m.body).onclick = function () { tb.columns.forEach(function (c) { if (st.show[c] == null) st.show[c] = c; }); draw(); };
              A.$('#bnone', m.body).onclick = function () { st.show = {}; draw(); };
              A.$$('[data-by]', m.body).forEach(function (b) { b.onchange = function () { var c = tb.columns[b.getAttribute('data-by')]; if (b.checked) { var g = guessType(c), ex = D.fields.filter(function (x) { return x.key === c || (x.type === g && g !== 'text' && g !== 'code'); })[0]; st.by[c] = ex ? ex.key : '__new'; } else delete st.by[c]; draw(); }; });
              A.$$('[data-bf]', m.body).forEach(function (b) { b.onchange = function () { st.by[tb.columns[b.getAttribute('data-bf')]] = b.value; }; });
              A.$$('[data-sh]', m.body).forEach(function (b) { b.onchange = function () { var c = tb.columns[b.getAttribute('data-sh')]; if (b.checked) st.show[c] = c; else delete st.show[c]; draw(); }; });
              A.$$('[data-sl]', m.body).forEach(function (b) { b.oninput = function () { st.show[tb.columns[b.getAttribute('data-sl')]] = b.value; }; });
              A.$('#bx', m.body).onclick = m.close;
              A.$('#bg', m.body).onclick = function () {
                var by = Object.keys(st.by), show = Object.keys(st.show);
                if (!by.length) return A.toast('اختر عموداً واحداً على الأقل يبحث به البوت', 'err');
                if (!show.length) return A.toast('اختر ما يعرضه البوت في الرد', 'err');
                if (st.mode === 'any' && by.length === 1) st.mode = 'all'; // one column: ask for it by its own name
                if (st.mode === 'all') by.forEach(function (c) { if (!st.by[c] || st.by[c] === 'any_no') { var g = guessType(c), ex = D.fields.filter(function (x) { return x.key === c || (x.type === g && g !== 'text' && g !== 'code'); })[0]; st.by[c] = ex ? ex.key : '__new'; } });
                if (st.mode === 'any') {
                  if (!D.fields.some(function (x) { return x.key === 'any_no'; })) D.fields.push({ key: 'any_no', label: 'الرقم المسجّل', type: 'code', prompt: 'أرسل أي رقم مسجّل لدينا (رقم الطلب أو الهوية أو الجوال) 🔢', error: '' });
                  by.forEach(function (c) { st.by[c] = 'any_no'; });
                } else by.forEach(function (c) { if (st.by[c] === '__new') { var k = slugKey(c); D.fields.push({ key: k, label: c, type: guessType(c), prompt: '', error: '' }); st.by[c] = k; } });
                var q = function (n) { return String(n).split('.').map(function (p) { return type === 'mysql' ? '`' + p.replace(/`/g, '') + '`' : type === 'mssql' ? '[' + p.replace(/]/g, '') + ']' : '"' + p.replace(/"/g, '') + '"'; }).join('.'); };
                var alias = function (c) { return String(c).replace(/[^\p{L}\p{N}_]+/gu, '_'); };
                if (type === 'mongodb') {
                  var flt = {}, prj = {};
                  if (st.mode === 'any') flt.$or = by.map(function (c) { var o = {}; o[c] = ':any_no'; return o; }); else by.forEach(function (c) { flt[c] = ':' + st.by[c]; });
                  if (st.mode === 'any' && st.verify) flt[st.verify] = ':phone';
                  show.forEach(function (c) { prj[c] = 1; });
                  l.query = JSON.stringify({ collection: st.t, filter: flt, projection: prj, limit: 3 });
                } else if (type === 'wordpress') {
                  var wh = {}; by.forEach(function (c) { wh[c] = ':' + st.by[c]; });
                  l.query = JSON.stringify({ table: st.t, where: wh, any: st.mode === 'any', columns: show });
                  l.labels = {}; show.forEach(function (c) { l.labels[c] = st.show[c] || c; });
                } else if (type === 'api') { return A.toast('هذا النوع لا يدعم البناء التلقائي', 'err'); }
                else {
                  var cols = show.map(function (c) { return q(c) + (alias(c) !== c ? ' AS ' + q(alias(c)) : ''); }).join(', ');
                  // "any number": compare as text so a letter-number never breaks a numeric column
                  var asText = function (c) { return type === 'postgres' ? 'CAST(' + q(c) + ' AS TEXT)' : type === 'mysql' ? 'CAST(' + q(c) + ' AS CHAR)' : type === 'mssql' ? 'CAST(' + q(c) + ' AS NVARCHAR(200))' : type === 'oracle' ? 'TO_CHAR(' + q(c) + ')' : q(c); };
                  var where = st.mode === 'any'
                    ? (by.length > 1 ? '(' : '') + by.map(function (c) { return asText(c) + ' = :any_no'; }).join(' OR ') + (by.length > 1 ? ')' : '') + (st.verify ? ' AND ' + asText(st.verify) + ' = :phone' : '')
                    : by.map(function (c) { return q(c) + ' = :' + st.by[c]; }).join(' AND ');
                  l.query = type === 'mssql' ? 'SELECT TOP 3 ' + cols + ' FROM ' + q(st.t) + ' WHERE ' + where
                    : type === 'oracle' ? 'SELECT ' + cols + ' FROM ' + q(st.t) + ' WHERE ' + where + ' FETCH FIRST 3 ROWS ONLY'
                    : 'SELECT ' + cols + ' FROM ' + q(st.t) + ' WHERE ' + where + ' LIMIT 3';
                }
                l.template = type === 'wordpress' ? (l.id === 'my_data' ? '🪪 بياناتك المسجلة لدينا:\n{*}' : '{*}') : show.map(function (c) { return (st.show[c] || c) + ': {' + (type === 'oracle' ? alias(c).toLowerCase() : alias(c)) + '}'; }).join('\n');
                if (l.id === 'my_data' && type !== 'wordpress') l.template = '🪪 بياناتك المسجلة لدينا:\n' + l.template;
                if (!l.title) l.title = String(st.t).replace(/^ext:/, '').split('.').pop();
                if (!l.keywords) l.keywords = l.title;
                ch(); lks(); fields(); m.close(); A.toast('تم إنشاء الاستعلام ✅ جرّبه بزر «اختبار» ثم احفظ', 'ok');
              };
            }
            draw();
          }, function (e) { m.body.innerHTML = '<div class="alert err">❌ ' + esc(e.message) + '</div><p class="small muted">تأكد من رابط الاتصال واحفظ التغييرات، ثم حاول مرة أخرى.</p>'; });
        }
        A.$('#addc', el).onclick = function () { D.connections.push({ id: uid('db'), name: '', type: 'mysql', connection: '', api_url: '', api_headers: '{}' }); ch(); conns(); lks(); };
        A.$('#addmy', el).onclick = function () {
          var l = D.lookups.find(function (x) { return x.id === 'my_data'; });
          if (!l) { l = { id: 'my_data', title: 'بياناتي', keywords: 'بياناتي, ملفي, معلوماتي, بيانات المستفيد, استعلام برقم الهوية', connection: D.type === 'none' && D.connections[0] ? D.connections[0].id : 'main', query: '', template: '', not_found: 'لم أجد بيانات مسجلة برقم الهوية هذا. تأكد من الرقم وحاول مرة أخرى 🙏' }; D.lookups.unshift(l); ch(); lks(); }
          A.toast('اختر جدول المستفيدين، وضع ✔ على عمود رقم الهوية في «يبحث به»، ثم «اعرض كل الأعمدة»', 'ok');
          builder(l);
        };
        A.$('#addl', el).onclick = function () { D.lookups.push({ id: uid('lk'), title: '', keywords: '', connection: 'main', query: '', template: '', not_found: '' }); ch(); lks(); };
        conns(); lks(); fields();
      });
    }
  });

  /* ============================== integrations (webhooks) ============================== */
  var EV = { 'conversation.started': 'بدء محادثة', 'conversation.handoff': 'تحويل لموظف', 'conversation.closed': 'إنهاء محادثة (مع النص كاملاً)', 'conversation.rated': 'تقييم', 'ticket.created': 'شكوى/اقتراح جديد', 'ticket.updated': 'تحديث شكوى/اقتراح', 'kb.learned': 'تعلّم إجابة جديدة' };
  A.page('integrations', {
    title: 'الربط مع الأنظمة', icon: '🔗', role: 'admin',
    render: function (root) {
      A.settingsPage(root, ['integrations'], function (el, d, ch) {
        var W = d.integrations.webhooks = d.integrations.webhooks || [];
        el.innerHTML = '<div class="alert info" style="margin-bottom:16px">🔗 لتطوير البرنامج وربطه بأنظمتكم (نظام المستفيدين، CRM، n8n، Make، Zapier…): يرسل البرنامج إشعاراً فورياً (Webhook) بصيغة JSON إلى الرابط الذي تحدده عند كل حدث، موقّعاً بـ HMAC-SHA256 في الترويسة <code>X-SmartChat-Signature</code>. وللقراءة والكتابة البرمجية تتوفر واجهة REST كاملة (موثّقة في ملف DEVELOPERS.md).</div>' +
          card('📡 Webhooks', '<div id="whs"></div><button class="btn soft sm" id="addw">+ إضافة رابط</button>');
        function draw() {
          A.$('#whs', el).innerHTML = W.map(function (w, i) {
            w.events = w.events || [];
            return '<div class="repeat" data-i="' + i + '"><div class="row" style="margin-bottom:8px"><label class="switch"><input type="checkbox" data-k="enabled"><span class="tr"></span></label><input class="in" data-k="url" placeholder="https://example.com/webhook" dir="ltr"><button class="btn sm ghost" data-t>🧪 تجربة</button><button class="btn sm danger ghost icon" data-rm>✕</button></div>' +
              f.text('secret', 'المفتاح السري للتوقيع', { ltr: true, mono: true }) + '<label class="f">الأحداث <small>(بدون اختيار = كل الأحداث)</small></label><div class="checks">' + Object.keys(EV).map(function (e) { return '<label><input type="checkbox" data-e="' + e + '"' + (w.events.indexOf(e) >= 0 ? ' checked' : '') + '> ' + EV[e] + ' <span class="tiny muted ltr">' + e + '</span></label>'; }).join('') + '</div></div>';
          }).join('') || '<p class="small muted">لا توجد روابط</p>';
          A.$$('.repeat', A.$('#whs', el)).forEach(function (r) {
            var i = Number(r.getAttribute('data-i')), w = W[i];
            A.bind(r, w, ch);
            A.$$('[data-e]', r).forEach(function (c) { c.onchange = function () { var e = c.getAttribute('data-e'); w.events = w.events.filter(function (x) { return x !== e; }); if (c.checked) w.events.push(e); ch(); }; });
            r.querySelector('[data-rm]').onclick = function () { W.splice(i, 1); ch(); draw(); };
            r.querySelector('[data-t]').onclick = function () { A.api('POST', '/api/sites/' + S.site.id + '/webhooks/test', w).then(function () { A.toast('تم إرسال حدث تجريبي إلى الرابط', 'ok'); }, A.fail); };
          });
        }
        A.$('#addw', el).onclick = function () { W.push({ id: uid('wh'), url: '', secret: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2), events: [], enabled: true }); ch(); draw(); };
        draw();
      });
    }
  });

  /* ============================== simpler titles & hints for existing pages ============================== */
  var H = {
    live: ['المحادثات', 'المحادثات الجارية الآن — من ينتظر موظفاً يظهر أولاً مع رنين'], history: ['السجل', 'كل المحادثات السابقة مع البحث والتصفية'],
    tickets: ['الشكاوى والاقتراحات', 'متابعة الطلبات والرد عليها وإشعار صاحبها'], tree: ['القوائم والأزرار', 'ما يظهر للمستفيد من قوائم مرقّمة وأزرار'],
    stats: ['الإحصائيات', 'نظرة عامة على الأداء'], reports: ['تقارير الموظفين', 'أداء كل موظف مع تصدير Excel'],
    appearance: ['الشكل والألوان', 'شكل نافذة المحادثة في موقعك'], languages: ['اللغات والنصوص', 'العربية والإنجليزية والأردية'],
    install: ['تركيب المحادثة', 'اربط المحادثة بموقعك خطوة بخطوة'], users: ['المستخدمون والصلاحيات', 'إضافة الموظفين وتحديد صلاحياتهم — لمدير النظام فقط'],
    account: ['حسابي', 'بياناتك وكلمة المرور والتنبيهات ومظهر اللوحة']
  };
  Object.keys(H).forEach(function (k) { if (A.pages[k]) { A.pages[k].title = H[k][0]; A.pages[k].hint = H[k][1]; } });
})();
