/* Settings pages: organisation, identity & appearance, languages, behaviour, notifications, install, datasource, sites */
(function () {
  'use strict';
  var A = App, S = A.state, esc = A.esc, f = A.f;

  /* generic: edit a clone of some settings sections, show a sticky save bar */
  function settingsPage(root, sections, build, opts) {
    opts = opts || {};
    var draft = {}; sections.forEach(function (s) { draft[s] = A.clone(S.site.settings[s]); });
    root.innerHTML = '<div id="sp"></div><div class="savebar"><span class="dirty"></span>' + (opts.extraButtons || '') + '<button class="btn" id="save">💾 حفظ التغييرات</button></div>';
    var onChange = function () { A.setDirty(true); opts.onChange && opts.onChange(draft); };
    build(A.$('#sp'), draft, onChange);
    A.$('#save').onclick = function () {
      var b = this; b.disabled = true;
      A.saveSite({ settings: draft }).then(function (s) {
        sections.forEach(function (k) { draft[k] = A.clone(s.settings[k]); });
        A.setDirty(false); A.toast('تم الحفظ ✅', 'ok'); opts.onSaved && opts.onSaved(s);
      }).catch(A.fail).then(function () { b.disabled = false; });
    };
    return draft;
  }
  A.settingsPage = settingsPage;
  function card(title, body, sub) { return '<div class="card" style="margin-bottom:16px"><h3>' + title + '</h3>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + body + '</div>'; }

  /* ============================== organisation info ============================== */
  A.page('org', {
    title: 'معلومات الجهة', icon: '🏢', role: 'supervisor',
    render: function (root) {
      settingsPage(root, ['org', 'developer'], function (el, d, ch) {
        var o = d.org; o.media = o.media || { history: [], location: [] }; o.departments = o.departments || []; o.custom = o.custom || []; o.social = o.social || {};
        el.innerHTML = '<div class="alert info" style="margin-bottom:16px">🤖 يستخدم البوت هذه المعلومات للإجابة تلقائياً عندما يسأل المستفيد عن: الموقع، نبذة/تاريخ الجهة، الرؤية، أرقام التواصل، ساعات العمل، الموقع الإلكتروني، أو من طوّر البرنامج — بالعربية والإنجليزية والأردية.</div>' +
          '<div class="grid g2">' + card('🏷️ الهوية الأساسية', f.text('org.name', 'اسم الجهة', { ph: 'جمعية البر بالمدينة المنورة' }) + f.text('org.short', 'اسم مختصر', { opt: true }) +
            '<div class="grid g2">' + f.text('org.unified_number', 'الرقم الموحّد', { ltr: true, ph: '9200xxxxx', hint: 'يظهر تحت اسم الجهة في نافذة المحادثة' }) + f.text('org.email', 'البريد الإلكتروني', { ltr: true }) + '</div>' +
            f.text('org.website', 'الموقع الإلكتروني', { ltr: true, ph: 'https://' }) + f.area('org.hours', 'ساعات العمل', { rows: 2, ph: 'الأحد – الخميس: 8 صباحاً – 4 عصراً' })) +
          card('📍 الموقع على الخريطة', f.text('org.address', 'العنوان', { ph: 'المدينة المنورة – حي …' }) + f.text('org.map_url', 'رابط خرائط Google', { ltr: true, ph: 'https://maps.app.goo.gl/… أو https://www.google.com/maps/@24.46,39.61,17z', hint: 'الأسهل: افتح موقعك في خرائط Google ← مشاركة ← نسخ الرابط' }) +
            '<div class="grid g2">' + f.text('org.lat', 'خط العرض (Latitude)', { ltr: true, ph: '24.4672' }) + f.text('org.lng', 'خط الطول (Longitude)', { ltr: true, ph: '39.6112' }) + '</div><div class="hint" style="margin-top:-6px">الإحداثيات تجعل الخريطة تظهر داخل المحادثة مباشرة (اضغط مطولاً على الموقع في خرائط Google لنسخها)</div>' +
            '<div id="mapprev" style="margin-top:10px"></div><label class="f" style="margin-top:10px">صور للموقع <small>(اختياري — مثل صورة المبنى)</small></label><div id="m-loc"></div>') + '</div>' +
          card('📖 النبذة والتاريخ والرؤية', '<div class="grid g2">' + f.area('org.history', 'نبذة وتاريخ الجهة', { rows: 6, ph: 'تأسست الجمعية عام … بهدف …' }) + '<div>' + f.area('org.vision', 'الرؤية', { rows: 2 }) + f.area('org.mission', 'الرسالة', { rows: 2 }) + f.area('org.goals', 'الأهداف', { rows: 2 }) + '</div></div>' +
            '<label class="f">مرفقات النبذة <small>(تقرير سنوي PDF، فيديو تعريفي، صور…)</small></label><div id="m-hist"></div>', 'تُرسل عند سؤال المستفيد: من أنتم؟ ما تاريخ الجمعية؟ ما رؤيتكم؟') +
          card('📞 الأقسام وأرقام التواصل', '<div id="deps"></div><button class="btn soft sm" id="adddep">+ إضافة قسم</button>') +
          card('📱 حسابات التواصل الاجتماعي', '<div class="grid g4">' + [['x', 'X (تويتر)'], ['instagram', 'إنستغرام'], ['snapchat', 'سناب شات'], ['tiktok', 'تيك توك'], ['youtube', 'يوتيوب'], ['facebook', 'فيسبوك'], ['linkedin', 'لينكدإن'], ['whatsapp', 'واتساب (رقم أو رابط)']].map(function (s) { return f.text('org.social.' + s[0], s[1], { ltr: true }); }).join('') + '</div>') +
          card('📄 بطاقات معلومات إضافية', '<div id="cust"></div><button class="btn soft sm" id="addcust">+ إضافة بطاقة</button>', 'مثل: طريقة التسجيل، شروط الاستفادة، التبرع… يرسلها البوت عندما يكتب المستفيد إحدى الكلمات المفتاحية، ويمكن ربطها بزر في الشجرة.') +
          card('🛠️ مطوّر البرنامج', f.sw('developer.show', 'الرد على سؤال "من صمم/طوّر البرنامج؟"', 'يرسل البوت اسم المطوّر ورابط موقعه') +
            '<div class="grid g2" style="margin-top:10px">' + f.text('developer.name', 'اسم المطوّر / الشركة') + f.text('developer.url', 'رابط موقع المطوّر', { ltr: true, ph: 'https://salla.sa/your-store' }) + '</div>' + f.text('developer.description', 'نص التعريف') + '<label class="f">شعار المطوّر</label><div id="devlogo"></div>');
        A.bind(el, d, function (k) { ch(); if (/^org\.(lat|lng|map_url)/.test(k)) mapPrev(); });
        A.mediaEditor(A.$('#m-hist', el), o.media.history, ch);
        A.mediaEditor(A.$('#m-loc', el), o.media.location, ch);
        A.imageField(A.$('#devlogo', el), function () { return d.developer.logo; }, function (v) { d.developer.logo = v; ch(); });
        function mapPrev() {
          var lat = parseFloat(o.lat), lng = parseFloat(o.lng), m = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(o.map_url || '');
          if (!(isFinite(lat) && isFinite(lng)) && m) { lat = +m[1]; lng = +m[2]; }
          A.$('#mapprev', el).innerHTML = isFinite(lat) && isFinite(lng) ? '<iframe style="width:100%;height:170px;border:0;border-radius:12px" loading="lazy" src="https://maps.google.com/maps?q=' + lat + ',' + lng + '&z=16&output=embed"></iframe>' : '<div class="alert warn">أضف الإحداثيات أو رابطاً يحتوي عليها لتظهر الخريطة داخل المحادثة. بدونها سيُرسل زر يفتح خرائط Google.</div>';
        }
        mapPrev();
        function deps() {
          A.$('#deps', el).innerHTML = o.departments.map(function (x, i) { return '<div class="row" style="margin-bottom:8px" data-i="' + i + '"><input class="in" data-k="name" placeholder="اسم القسم (مثال: خدمة المستفيدين)"><input class="in" data-k="phones" placeholder="الأرقام مفصولة بفواصل" dir="ltr"><button class="btn sm danger ghost icon" data-rm>✕</button></div>'; }).join('') || '<p class="small muted">لا توجد أقسام</p>';
          A.$$('[data-i]', A.$('#deps', el)).forEach(function (r) { var x = o.departments[Number(r.getAttribute('data-i'))]; A.bind(r, x, ch); r.querySelector('[data-rm]').onclick = function () { o.departments.splice(Number(r.getAttribute('data-i')), 1); ch(); deps(); }; });
        }
        A.$('#adddep', el).onclick = function () { o.departments.push({ name: '', phones: '' }); ch(); deps(); };
        deps();
        function cust() {
          A.$('#cust', el).innerHTML = o.custom.map(function (x, i) { return '<div class="repeat" data-i="' + i + '"><div class="row" style="margin-bottom:8px"><input class="in" data-k="title" placeholder="العنوان (مثال: طريقة التسجيل)" style="font-weight:700"><button class="btn sm danger ghost icon" data-rm>✕</button></div>' + f.text('keywords', '', { ph: 'كلمات مفتاحية: تسجيل, اشتراك, كيف اسجل' }) + f.area('answer', '', { rows: 3, ph: 'نص الإجابة' }) + '<div data-m></div></div>'; }).join('') || '<p class="small muted">لا توجد بطاقات</p>';
          A.$$('.repeat', A.$('#cust', el)).forEach(function (r) {
            var i = Number(r.getAttribute('data-i')), x = o.custom[i]; x.media = x.media || [];
            A.bind(r, x, ch); A.mediaEditor(r.querySelector('[data-m]'), x.media, ch);
            r.querySelector('[data-rm]').onclick = function () { o.custom.splice(i, 1); ch(); cust(); };
          });
        }
        A.$('#addcust', el).onclick = function () { o.custom.push({ id: 'c' + Math.random().toString(36).slice(2, 7), title: '', keywords: '', answer: '', media: [] }); ch(); cust(); };
        cust();
      });
    }
  });

  /* ============================== identity & appearance ============================== */
  var FONTS = [['Tajawal', 'تجوّل Tajawal'], ['Cairo', 'القاهرة Cairo'], ['IBM Plex Sans Arabic', 'IBM Plex عربي'], ['Almarai', 'المراعي Almarai'], ['Noto Kufi Arabic', 'نوتو كوفي'], ['Noto Naskh Arabic', 'نوتو نسخ'], ['Readex Pro', 'Readex Pro'], ['Amiri', 'أميري (تقليدي)'], ['El Messiri', 'المسيري'], ['Reem Kufi', 'ريم كوفي'], ['Changa', 'تشانجا'], ['Lalezar', 'لاله‌زار (عريض)']];
  var PALETTES = [
    ['أخضر وذهبي', '#1a6739', '#bc9525'], ['زمردي', '#047857', '#065f46'], ['فيروزي', '#0f766e', '#f59e0b'], ['أزرق ملكي', '#1d4ed8', '#0ea5e9'],
    ['كحلي وذهبي', '#1e3a8a', '#ca8a04'], ['عنابي', '#9f1239', '#c9a227'], ['بنفسجي', '#6d28d9', '#db2777'], ['بني رملي', '#8a5a21', '#2f6b4f'], ['رمادي داكن', '#334155', '#0ea5e9'], ['برتقالي', '#ea580c', '#7c2d12']
  ];
  var ICON_PRESETS = ['chat', 'dots', 'square', 'headset', 'help', 'sparkle', 'wave', 'mosque'];

  A.page('appearance', {
    title: 'الهوية والمظهر', icon: '🎨', role: 'supervisor',
    render: function (root) {
      var ifr, sendPreview = A.debounce(function (d) {
        A.api('POST', '/api/sites/' + S.site.id + '/widget-config/preview', { settings: d }).then(function (cfg) {
          if (ifr && ifr.contentWindow) ifr.contentWindow.postMessage({ type: 'sc-preview', config: cfg }, location.origin);
        }).catch(function () { });
      }, 350);
      settingsPage(root, ['appearance', 'prechat'], function (el, d, ch) {
        var a = d.appearance;
        el.innerHTML = '<div class="appear"><div>' +
          card('🎨 ألوان المحادثة (الأساسية)', '<div class="swatches" id="pal">' + PALETTES.map(function (p, i) { return '<button class="swatch" data-p="' + i + '"><div class="sw"><i style="background:' + p[1] + '"></i><i style="background:' + p[2] + '"></i></div><span>' + p[0] + '</span></button>'; }).join('') + '</div>' +
            '<div class="grid g3" style="margin-top:14px">' + f.color('appearance.primary_color', 'اللون الرئيسي', { clear: false }) + f.color('appearance.secondary_color', 'اللون الثانوي', { clear: false }) + f.select('appearance.header_style', 'خلفية الرأس', [['gradient', 'متدرّج بين اللونين'], ['solid', 'لون واحد']]) + '</div>', 'مجموعة صغيرة تكفي لتلوين المحادثة بالكامل. ألوان لوحة التحكم نفسها تُغيَّر من «حسابي ← مظهر اللوحة».') +
          card('🏷️ الشعار والاسم', '<div class="grid g2"><div><label class="f">شعار الجهة</label><div id="logo"></div></div><div><label class="f">صورة البوت <small>(اختياري)</small></label><div id="botav"></div></div></div>' +
            '<div class="grid g2" style="margin-top:12px">' + f.text('appearance.company_name', 'الاسم الظاهر أعلى المحادثة', { hint: 'إن تُرك فارغاً يُستخدم اسم الجهة من صفحة معلومات الجهة' }) + f.text('appearance.footer_text', 'نص التذييل', { ph: 'بدعم من' }) + '</div>' +
            f.sw('appearance.show_unified_number', '📞 إظهار الرقم الموحّد تحت الاسم', 'يُضبط الرقم من صفحة معلومات الجهة') + f.sw('appearance.show_footer', 'إظهار التذييل أسفل النافذة')) +
          card('🔤 الخط', '<div class="grid g2">' + f.select('appearance.font', 'نوع الخط', FONTS) + f.range('appearance.font_size', 'حجم خط الرسائل', 12, 18, 0.5, 'px') + '</div><div id="fontprev" style="padding:12px;border-radius:12px;background:var(--soft);font-size:18px"></div>') +
          card('🕌 الزخرفة', '<div class="patterns" id="pats"></div><div class="grid g3" style="margin-top:14px">' + f.color('appearance.pattern_color', 'لون الزخرفة', { ph: 'نفس اللون الرئيسي' }) + f.range('appearance.pattern_opacity', 'الشفافية', 0.02, 0.3, 0.01) + f.range('appearance.pattern_scale', 'الحجم', 0.5, 2.5, 0.1, '×') + '</div>' +
            '<div class="row wrap" style="gap:20px">' + f.swi('appearance.pattern_chat', 'في خلفية المحادثة') + f.swi('appearance.pattern_header', 'في رأس النافذة') + '</div><div id="patimg"></div>', 'زخارف إسلامية وعربية وسعودية، ومناسبات، أو شعار الجهة وصورك الخاصة — تُطبّق على نافذة المحادثة. ولتطبيقها على لوحة التحكم: حسابي ← مظهر اللوحة.') +
          card('🎉 زخرفة المناسبات التلقائية', f.sw('appearance.occasions.auto', 'تبديل الزخرفة تلقائياً في المناسبات', 'يرجع للزخرفة المختارة أعلاه بعد انتهاء المناسبة. التواريخ الهجرية حسب تقويم أم القرى') +
            '<div class="checks" style="margin-top:8px"><label><input type="checkbox" data-k="appearance.occasions.ramadan"> 🌙 شهر رمضان كاملاً</label><label><input type="checkbox" data-k="appearance.occasions.eid"> 🎉 عيد الفطر (1–4 شوال) وعيد الأضحى (9–13 ذو الحجة)</label><label><input type="checkbox" data-k="appearance.occasions.national"> 🇸🇦 اليوم الوطني (20–26 سبتمبر)</label><label><input type="checkbox" data-k="appearance.occasions.founding"> 🏰 يوم التأسيس (20–23 فبراير)</label></div><div id="occnow" class="hint"></div>') +
          card('🔘 زر المحادثة', '<label class="f">الشكل</label><div class="choices" id="shapes">' + [['circle', 'دائري', '50%'], ['rounded', 'مربع منحني', '30%'], ['square', 'مربع', '8px'], ['pill', 'كبسولة بنص', '999px']].map(function (s) { return '<button class="choice" data-s="' + s[0] + '"><span class="shp" style="border-radius:' + s[2] + ';' + (s[0] === 'pill' ? 'width:64px' : '') + '">💬</span>' + s[1] + '</button>'; }).join('') + '</div>' +
            '<label class="f" style="margin-top:12px">الأيقونة</label><div class="choices" id="icons"></div><div style="margin-top:10px"><label class="f">أو صورة مخصصة</label><div id="licon"></div></div>' +
            '<div class="grid g3" style="margin-top:12px">' + f.text('appearance.launcher_label', 'نص بجانب الزر', { opt: true, ph: 'تحتاج مساعدة؟' }) + f.select('appearance.position', 'المكان', [['right', 'يمين الشاشة'], ['left', 'يسار الشاشة']]) + f.range('appearance.launcher_size', 'الحجم', 48, 84, 2, 'px') + '</div>' +
            '<div class="grid g3">' + f.color('appearance.launcher_bg', 'لون الزر', { ph: 'اللون الرئيسي' }) + f.select('appearance.launcher_style', 'نمط الزر', [['solid', 'لون واحد'], ['gradient', 'متدرّج']]) + f.num('appearance.teaser_delay', 'ظهور رسالة الترحيب بعد (ثانية)', { min: 0 }) + '</div>' +
            '<div class="grid g2">' + f.num('appearance.offset_x', 'البعد عن الحافة الجانبية (px)') + f.num('appearance.offset_y', 'البعد عن الأسفل (px)') + '</div>' + f.sw('appearance.hide_on_mobile', 'إخفاء على الجوال')) +
          card('🪟 النافذة والفقاعات', '<div class="grid g3">' + f.range('appearance.window_width', 'عرض النافذة', 320, 460, 10, 'px') + f.range('appearance.window_radius', 'استدارة النافذة', 0, 28, 1, 'px') + f.range('appearance.bubble_radius', 'استدارة الفقاعات', 4, 24, 1, 'px') + '</div>' +
            '<label class="f">شكل أزرار الخيارات</label><div class="choices" id="ostyle">' + [['pill', 'كبسولات'], ['card', 'بطاقات'], ['list', 'قائمة']].map(function (s) { return '<button class="choice" data-o="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</div>' +
            '<div class="grid g2" style="margin-top:12px">' + f.select('appearance.rating_max', 'عدد نجوم التقييم', [[3, '3'], [5, '5'], [6, '6'], [7, '7'], [10, '10']]) + '</div>') +
          '<details class="card" style="margin-bottom:16px"><summary style="cursor:pointer;font-weight:700">🎛️ ألوان متقدمة (كل تفصيلة)</summary><div class="grid g3" style="margin-top:14px">' +
            [['header_bg', 'خلفية الرأس'], ['header_text', 'نص الرأس'], ['chat_bg', 'خلفية المحادثة'], ['panel_bg', 'خلفية النافذة'], ['panel_text', 'نص النافذة'], ['bot_bubble_bg', 'فقاعة البوت'], ['bot_bubble_text', 'نص البوت'], ['agent_bubble_bg', 'فقاعة الموظف'], ['agent_bubble_text', 'نص الموظف'], ['visitor_bubble_bg', 'فقاعة المستفيد'], ['visitor_bubble_text', 'نص المستفيد'], ['system_bg', 'رسائل النظام'], ['system_text', 'نص النظام'], ['option_bg', 'خلفية الخيارات'], ['option_text', 'نص/حدود الخيارات'], ['input_bg', 'حقل الكتابة'], ['input_text', 'نص الكتابة'], ['avatar_bg', 'خلفية الصورة الرمزية'], ['launcher_text', 'أيقونة الزر'], ['teaser_bg', 'رسالة الترحيب'], ['teaser_text', 'نص الترحيب'], ['footer_bg', 'خلفية التذييل'], ['footer_color', 'نص التذييل']].map(function (c) { return f.color('appearance.' + c[0], c[1]); }).join('') + '</div></details>' +
          card('📋 نموذج قبل بدء المحادثة', f.sw('prechat.enabled', 'طلب بيانات المستفيد قبل البدء') + '<div class="row wrap" style="gap:20px;margin-top:10px">' + f.swi('prechat.name', 'الاسم') + f.swi('prechat.phone', 'الجوال') + f.swi('prechat.email', 'البريد') + '</div>' + f.text('prechat.title', 'عنوان النموذج', { opt: true })) +
          '</div><div class="preview-box"><div class="row between" style="margin-bottom:8px"><b>👁️ معاينة مباشرة</b><a class="btn sm ghost" target="_blank" href="/demo/preview.html?site=' + esc(S.site.key) + '">فتح صفحة التجربة ↗</a></div><iframe id="pv" src="/demo/preview.html?site=' + esc(S.site.key) + '"></iframe><p class="tiny muted">المعاينة تتحدث فوراً. التغييرات لا تظهر للزوار إلا بعد الحفظ.</p></div></div>';
        var refresh = function () { ch(); sendPreview(d); paintChoices(); };
        A.bind(el, d, refresh);
        ifr = A.$('#pv', el); ifr.onload = function () { setTimeout(function () { sendPreview(d); }, 600); };
        A.imageField(A.$('#logo', el), function () { return a.company_logo; }, function (v) { a.company_logo = v; refresh(); }, { hint: 'PNG بخلفية شفافة أفضل' });
        A.imageField(A.$('#botav', el), function () { return a.bot_avatar; }, function (v) { a.bot_avatar = v; refresh(); });
        A.imageField(A.$('#licon', el), function () { return a.launcher_icon; }, function (v) { a.launcher_icon = v; refresh(); });
        A.$$('#pal .swatch', el).forEach(function (b) { b.onclick = function () { var p = PALETTES[Number(b.getAttribute('data-p'))]; [['primary_color', p[1]], ['secondary_color', p[2]]].forEach(function (x) { var i = el.querySelector('[data-k="appearance.' + x[0] + '"]'); i.value = x[1]; i.dispatchEvent(new Event('input')); }); }; });
        A.$$('#shapes .choice', el).forEach(function (b) { b.onclick = function () { a.launcher_shape = b.getAttribute('data-s'); refresh(); }; });
        A.$$('#ostyle .choice', el).forEach(function (b) { b.onclick = function () { a.option_style = b.getAttribute('data-o'); refresh(); }; });
        var P = window.SCPatterns;
        function syncRange() { var r = el.querySelector('[data-k="appearance.pattern_opacity"]'); if (r) { r.value = a.pattern_opacity; r.dispatchEvent(new Event('input')); } }
        // pictures used as decoration are shrunk first, so the pattern stays light
        function shrinkUpload(src, max) {
          return (typeof src === 'string' ? fetch(src).then(function (r) { return r.blob(); }) : Promise.resolve(src)).then(function (blob) { return createImageBitmap(blob); }).then(function (bmp) {
            var k = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
            c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
            return new Promise(function (res) { c.toBlob(res, 'image/png'); });
          }).then(function (b) { return A.upload(new File([b], 'pattern.png', { type: 'image/png' })); }).then(function (r) { return r.url; });
        }
        function patImg() {
          var box = A.$('#patimg', el), id = a.pattern;
          if (id !== 'logo' && id !== 'images') { box.innerHTML = ''; return; }
          var imgs = a.pattern_images = a.pattern_images || [];
          box.innerHTML = '<div class="card flat" style="margin-top:12px">' + (id === 'logo'
            ? '<div class="row" style="gap:12px"><img src="' + esc(a.pattern_logo || a.company_logo || '') + '" style="width:56px;height:56px;object-fit:contain;background:#fff;border-radius:10px;border:1px solid var(--border)"><div class="small">🏷️ يُكرَّر شعار الجهة في الخلفية. لتغييره غيّر الشعار من بطاقة «الشعار والاسم» ثم اختر هذه الزخرفة مرة أخرى.</div></div>'
            : '<label class="f">🖼️ صورك (حتى 8 صور — تتكرر بالتناوب)</label><div class="row wrap" style="gap:8px">' + imgs.map(function (u, i) { return '<div style="position:relative"><img src="' + esc(u) + '" style="width:64px;height:64px;object-fit:contain;background:#fff;border-radius:10px;border:1px solid var(--border)"><button class="btn sm danger icon" data-ri="' + i + '" style="position:absolute;top:-6px;left:-6px;padding:0 6px;min-height:22px">✕</button></div>'; }).join('') +
              (imgs.length < 8 ? '<button class="btn soft" id="addimg" style="width:64px;height:64px">＋</button>' : '') + '</div><div class="hint">PNG بخلفية شفافة يعطي أجمل نتيجة: هلال، فانوس، نخلة، شعار مبادرة…</div>') +
            '<div style="margin-top:10px">' + f.swi('appearance.pattern_img_tint', 'تلوين الصور بلون الزخرفة (شكل موحّد)') + '</div></div>';
          A.bind(box, d, refresh);
          A.$$('[data-ri]', box).forEach(function (b) { b.onclick = function () { imgs.splice(Number(b.getAttribute('data-ri')), 1); refresh(); }; });
          var add = A.$('#addimg', box);
          if (add) add.onclick = function () {
            A.pickFile('image/png,image/jpeg,image/webp,image/gif', true).then(function (fs) {
              fs = fs.slice(0, 8 - imgs.length); if (!fs.length) return;
              A.toast('⏳ جارٍ رفع ' + fs.length + ' صورة…');
              return Promise.all(fs.map(function (fl) { return shrinkUpload(fl, 220); })).then(function (us) { us.forEach(function (u) { imgs.push(u); }); refresh(); });
            }).catch(A.fail);
          };
        }
        function paintChoices() {
          A.$$('#shapes .choice', el).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-s') === (a.launcher_shape || 'circle')); b.querySelector('.shp').style.background = a.primary_color; });
          A.$$('#ostyle .choice', el).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-o') === (a.option_style || 'pill')); });
          A.$$('#pal .swatch', el).forEach(function (b) { var p = PALETTES[Number(b.getAttribute('data-p'))]; b.classList.toggle('on', p[1].toLowerCase() === String(a.primary_color).toLowerCase() && p[2].toLowerCase() === String(a.secondary_color).toLowerCase()); });
          A.$('#icons', el).innerHTML = ICON_PRESETS.map(function (k) { return '<button class="choice' + ((a.launcher_icon_preset || 'chat') === k && !a.launcher_icon ? ' on' : '') + '" data-i="' + k + '"><span class="shp" style="border-radius:50%;background:' + a.primary_color + '">' + iconSvg(k) + '</span></button>'; }).join('');
          A.$$('#icons .choice', el).forEach(function (b) { b.onclick = function () { a.launcher_icon_preset = b.getAttribute('data-i'); a.launcher_icon = ''; A.imageField(A.$('#licon', el), function () { return a.launcher_icon; }, function (v) { a.launcher_icon = v; refresh(); }); refresh(); }; });
          A.$('#pats', el).innerHTML = P.list.map(function (p) {
            var bg = p.img ? (function () { var u = p.img === 'logo' ? (a.pattern_logo || a.company_logo) : (a.pattern_images || [])[0]; return u ? 'url(\'' + esc(u) + '\');background-size:40%;background-repeat:space' : 'none'; })() : P.css(p.id, a.pattern_color || a.primary_color, Math.max(0.12, a.pattern_opacity * 2), 1).replace(/"/g, "'");
            return '<button class="pat' + ((a.pattern || 'none') === p.id ? ' on' : '') + '" data-p="' + p.id + '"><div class="pv" style="background-color:' + (a.chat_bg || '#f6f7f4') + ';background-image:' + bg + '">' + (p.img && bg === 'none' ? '<span style="font-size:22px;line-height:56px">' + (p.img === 'logo' ? '🏷️' : '🖼️') + '</span>' : '') + '</div><span>' + esc(p.name) + '</span></button>';
          }).join('');
          A.$$('#pats .pat', el).forEach(function (b) { b.onclick = function () {
            var id = b.getAttribute('data-p');
            if (id === 'logo') {
              if (!a.company_logo) return A.toast('ارفع شعار الجهة أولاً (في بطاقة «الشعار والاسم»)', 'err');
              A.toast('⏳ تجهيز الشعار كزخرفة…');
              return shrinkUpload(a.company_logo, 220).then(function (u) { a.pattern_logo = u; a.pattern_logo_src = a.company_logo; a.pattern = 'logo'; if (a.pattern_opacity < 0.1) a.pattern_opacity = 0.12; syncRange(); refresh(); }, A.fail);
            }
            a.pattern = id; if (id === 'images' && a.pattern_opacity < 0.1) { a.pattern_opacity = 0.12; syncRange(); } refresh();
          }; });
          patImg();
          var occ = P.occasionOf(new Date(), a.occasions), NM = { ramadan: '🌙 رمضان', eid: '🎉 العيد', national: '🇸🇦 اليوم الوطني / يوم التأسيس' };
          A.$('#occnow', el).innerHTML = a.occasions && a.occasions.auto ? (occ ? '✅ الآن: زخرفة ' + NM[occ] + ' مفعّلة تلقائياً' : 'لا توجد مناسبة اليوم — تظهر الزخرفة المختارة أعلاه') : '';
          A.$('#fontprev', el).style.fontFamily = '"' + a.font + '"'; A.$('#fontprev', el).textContent = 'مرحباً بك 👋 كيف يمكننا خدمتك اليوم؟ ١٢٣ — Hello';
          loadFont(a.font);
        }
        paintChoices();
      });
    }
  });
  function loadFont(name) { if (document.querySelector('link[data-pf="' + name + '"]')) return; var l = document.createElement('link'); l.rel = 'stylesheet'; l.setAttribute('data-pf', name); l.href = 'https://fonts.googleapis.com/css2?family=' + name.replace(/ /g, '+') + ':wght@400;700&display=swap'; document.head.appendChild(l); }
  function iconSvg(k) {
    var I = { chat: '💬', dots: '💭', square: '🗨️', headset: '🎧', help: '❔', sparkle: '✨', wave: '😊', mosque: '🕌' };
    return '<span style="font-size:18px">' + I[k] + '</span>';
  }

  /* ============================== languages & texts ============================== */
  A.page('languages', {
    title: 'اللغات والنصوص', icon: '🌐', role: 'supervisor',
    render: function (root) {
      var cur = 'ar';
      settingsPage(root, ['languages', 'texts'], function (el, d, ch) {
        var L = d.languages; L.enabled = L.enabled || ['ar'];
        var DEF = S.i18n.defaults;
        var GROUPS = [
          ['رأس النافذة وزر البدء', ['title', 'subtitle', 'bot_name', 'teaser', 'placeholder', 'start', 'end_chat', 'new_chat', 'confirm_end']],
          ['التحويل للموظف', ['handoff', 'no_answer_handoff', 'waiting', 'with_agent', 'queue', 'no_agents', 'agent_joined', 'back_to_bot']],
          ['ردود البوت', ['anything_else', 'fallback', 'did_you_mean', 'unlinked', 'org_missing', 'nav_home', 'nav_agent', 'nav_cancel', 'nav_retry', 'nav_ticket']],
          ['الشكاوى والاقتراحات', ['ticket_intro', 'ticket_form_complaint', 'ticket_form_suggestion', 'ticket_created', 'ticket_ask_number', 'ticket_not_found', 'ticket_status_msg', 'f_name', 'f_phone', 'f_email', 'f_message', 'f_send', 'f_required', 'f_phone_invalid']],
          ['التقييم والإنهاء', ['rating_title', 'rating_comment', 'rating_send', 'rating_thanks', 'ended', 'closed']],
          ['الاستعلام من قاعدة البيانات (أسئلة المربعات الخاصة تُعدّل من: الإعدادات ← قواعد البيانات)', ['ask_param', 'invalid_value', 'invalid_giveup', 'rule_number', 'rule_phone', 'rule_id', 'rule_email', 'rule_date', 'not_found', 'customer_not_found', 'db_error']],
          ['أخرى', ['prechat_title', 'open_maps', 'directions', 'open_file', 'open_link', 'visit_site', 'call']]
        ];
        el.innerHTML = card('🌐 لغات البوت', '<div class="grid g3">' + Object.keys(S.i18n.langs).map(function (l) { return '<label class="card flat row" style="padding:12px;cursor:pointer"><input type="checkbox" data-l="' + l + '"' + (L.enabled.indexOf(l) >= 0 ? ' checked' : '') + '><b>' + S.i18n.langs[l].name + '</b><span class="tiny muted">' + (S.i18n.langs[l].dir === 'rtl' ? 'من اليمين' : 'من اليسار') + '</span></label>'; }).join('') + '</div>' +
          '<div class="grid g2" style="margin-top:12px">' + f.select('languages.default', 'اللغة الافتراضية', Object.keys(S.i18n.langs).map(function (l) { return [l, S.i18n.langs[l].name]; })) + '<div style="padding-top:24px">' + f.swi('languages.show_switcher', 'إظهار أزرار تبديل اللغة للمستفيد') + '</div></div>' +
          '<div class="alert info">يكتشف البوت لغة المستفيد تلقائياً من متصفحه ومن كتابته، ويرد بنفس اللغة. نصوص الشجرة تُترجم من محرر الشجرة (تبويب English / اردو لكل عقدة وزر).</div>') +
          card('✏️ نصوص الواجهة والردود', '<div class="tabs" id="tl">' + Object.keys(S.i18n.langs).map(function (l) { return '<button data-t="' + l + '">' + S.i18n.langs[l].name + '</button>'; }).join('') + '</div><div id="tx"></div>', 'اترك أي حقل فارغاً لاستخدام النص الافتراضي (يظهر باهتاً). المتغيرات بين { } تُستبدل تلقائياً.');
        A.bind(el, d, ch);
        A.$$('[data-l]', el).forEach(function (c) { c.onchange = function () { var l = c.getAttribute('data-l'); L.enabled = L.enabled.filter(function (x) { return x !== l; }); if (c.checked) L.enabled.push(l); if (!L.enabled.length) { L.enabled = ['ar']; A.$('[data-l=ar]', el).checked = true; } ch(); }; });
        function texts() {
          A.$$('#tl button', el).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-t') === cur); b.onclick = function () { cur = b.getAttribute('data-t'); texts(); }; });
          d.texts[cur] = d.texts[cur] || {};
          var dir = S.i18n.langs[cur].dir;
          A.$('#tx', el).innerHTML = GROUPS.map(function (g) {
            return '<details' + (g === GROUPS[0] ? ' open' : '') + ' style="margin-bottom:10px"><summary style="cursor:pointer;font-weight:700;padding:6px 0">' + g[0] + '</summary><div class="grid g2" style="margin-top:8px">' + g[1].map(function (k) {
              var dv = (DEF[cur] || {})[k] || '', long = dv.length > 50 || /\n/.test(dv);
              return '<div class="field"><label class="f"><span class="ltr tiny muted">' + k + '</span></label>' + (long ? '<textarea class="in" rows="2" dir="' + dir + '" data-k="texts.' + cur + '.' + k + '" placeholder="' + esc(dv) + '"></textarea>' : '<input class="in" dir="' + dir + '" data-k="texts.' + cur + '.' + k + '" placeholder="' + esc(dv) + '">') + '</div>';
            }).join('') + '</div></details>';
          }).join('');
          A.bind(A.$('#tx', el), d, ch);
        }
        texts();
      });
    }
  });

  /* ============================== behaviour ============================== */
  A.page('behavior', {
    title: 'سلوك البوت', icon: '⚙️', role: 'supervisor',
    render: function (root) {
      settingsPage(root, ['behavior', 'tickets'], function (el, d, ch) {
        var W = d.behavior.work_hours; W.days = (W.days && W.days.length === 7 ? W.days : [0, 1, 2, 3, 4, 5, 6].map(function (x) { return { day: x, open: x <= 4, from: '08:00', to: '16:00' }; })).sort(function (a, b) { return a.day - b.day; });
        var DN = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        el.innerHTML = card('🕘 أوقات العمل', f.sw('behavior.work_hours.enabled', 'تفعيل أوقات العمل', 'خارج هذه الأوقات يكتب البوت أوقات العمل ويطلب من المستفيد اسمه وجواله فقط (مربّعان)، ويُسجَّل الطلب في «الشكاوى والاقتراحات» كـ «طلب تواصل» لتردّوا عليه في أيام العمل الرسمية') +
            '<div class="tbl-wrap" style="margin-top:10px"><table class="t"><thead><tr><th>اليوم</th><th>يعمل</th><th>من</th><th>إلى</th></tr></thead><tbody>' + W.days.map(function (x, i) {
              return '<tr><td><b>' + DN[x.day] + '</b></td><td><label class="switch"><input type="checkbox" data-k="behavior.work_hours.days.' + i + '.open"><span class="tr"></span></label></td><td><input type="time" class="in" style="width:auto" data-k="behavior.work_hours.days.' + i + '.from"></td><td><input type="time" class="in" style="width:auto" data-k="behavior.work_hours.days.' + i + '.to"></td></tr>';
            }).join('') + '</tbody></table></div>' +
            f.sw('behavior.work_hours.allow_handoff', '📞 السماح بالتحويل لموظف خارج أوقات العمل', 'إذا فعّلته يتصرف البوت كأنه وقت عمل (يحوّل لموظف ويرن). وإذا عطّلته يطلب الاسم والجوال فقط') +
            f.area('behavior.work_hours.message', 'رسالة خارج أوقات العمل (اختياري)', { rows: 3, ph: 'نعتذر، نحن الآن خارج أوقات العمل 🌙\nأوقات العمل:\n{hours}\n\nاترك اسمك ورقم جوالك وسنتواصل معك في أقرب يوم عمل.', hint: '{hours} = جدول أوقات العمل أعلاه تلقائياً. اتركه فارغاً للنص الافتراضي (بالعربي والإنجليزي والأردو)' })) +
          '<div class="grid g2"><div>' + card('🤔 عندما لا يعرف البوت الإجابة', '<div class="alert ok" style="margin-bottom:10px">👨‍💼 يحوّل المستفيد إلى موظف فوراً، ويُسجَّل السؤال، وردّ الموظف يُضاف تلقائياً إلى الخريطة الذهنية ليجيب البوت عنه مستقبلاً.</div>' +
            f.sw('behavior.auto_learn', '🧠 التعلّم التلقائي', 'حفظ سؤال المستفيد ورد الموظف في قاعدة المعرفة ليجيب البوت مستقبلاً') +
            f.sw('behavior.numbered_menus', '🔢 قبول الأرقام في القوائم', 'يستطيع المستفيد كتابة 1، 2، ١، ٢ لاختيار الخدمة') +
            '<div style="margin-top:10px">' + f.range('behavior.kb_threshold', 'دقة المطابقة للإجابة', 0.4, 0.9, 0.05) + '</div><div class="hint">كلما زادت الدقة قلّت الإجابات الخاطئة وزاد التحويل للموظفين.</div>') +
          card('⏱️ المدد والاحتفاظ', '<div class="grid g2">' + f.num('behavior.inactivity_minutes', 'إغلاق المحادثة بعد عدم نشاط (دقيقة)', { min: 0, hint: '0 = لا تُغلق تلقائياً. المحادثات المنتظرة لا تُغلق ما دام هناك موظف متصل.' }) + f.num('behavior.retention_days', 'مدة حفظ المحادثات (يوم)', { min: 0, hint: '0 = حفظ دائم. تُحذف المحادثات المغلقة الأقدم تلقائياً.' }) + '</div>') + '</div><div>' +
          card('🔑 كلمات مفتاحية إضافية', f.area('behavior.handoff_keywords', 'كلمات طلب موظف', { rows: 3, ph: 'سطر لكل كلمة، مثل: ابي احد يكلمني', hint: 'الكلمات الشائعة (موظف، خدمة العملاء، agent…) مضمّنة مسبقاً' }) + f.area('behavior.order_keywords', 'كلمات الاستعلام عن الطلب', { rows: 3, ph: 'سطر لكل كلمة' })) +
          card('📝 الشكاوى والاقتراحات', f.sw('tickets.enabled', 'تفعيل الشكاوى والاقتراحات') + f.sw('tickets.require_email', 'البريد الإلكتروني إلزامي في النموذج') + f.sw('tickets.notify_admins', 'إشعار الإدارة بالبريد عند كل طلب جديد', 'البريد يُضبط من صفحة الإشعارات') +
            '<div class="grid g3" style="margin-top:10px">' + f.text('tickets.prefix_complaint', 'بادئة الشكوى', { ltr: true }) + f.text('tickets.prefix_suggestion', 'بادئة الاقتراح', { ltr: true }) + f.text('tickets.prefix_inquiry', 'بادئة الاستفسار', { ltr: true }) + '</div><div class="grid g3">' + f.text('tickets.prefix_callback', 'بادئة طلب التواصل', { ltr: true }) + '</div><div class="hint">مثال الرقم: C-1001</div>') + '</div></div>';
        A.$$('[data-k="behavior.handoff_keywords"],[data-k="behavior.order_keywords"]', el).forEach(function (t) { t.setAttribute('data-lines', ''); });
        A.bind(el, d, ch);
      });
    }
  });

  /* ============================== notifications ============================== */
  A.page('notify', {
    title: 'الإشعارات (بريد، SMS، واتساب)', icon: '📨', role: 'admin',
    render: function (root) {
      var SMS = [['none', '— بدون —'], ['taqnyat', 'تقنيات Taqnyat'], ['unifonic', 'يونيفونك Unifonic'], ['msegat', 'مسجات Msegat'], ['twilio', 'Twilio'], ['custom', 'مزود آخر (HTTP مخصص)']];
      var draft = settingsPage(root, ['notify'], function (el, d, ch) {
        var n = d.notify;
        el.innerHTML = '<div class="alert info" style="margin-bottom:16px">عند تسجيل شكوى أو اقتراح يصل للمستفيد رقم الطلب وتاريخه، وعند تحديث الحالة أو كتابة رد يصله التحديث — عبر القنوات المفعّلة أدناه.</div>' +
          '<div class="grid g2"><div>' + card('✉️ البريد الإلكتروني (SMTP)', f.sw('notify.email.enabled', 'تفعيل الإرسال بالبريد') +
            '<div class="grid g2" style="margin-top:10px">' + f.text('notify.email.host', 'خادم SMTP', { ltr: true, ph: 'smtp.gmail.com' }) + f.num('notify.email.port', 'المنفذ', { hint: '587 (TLS) أو 465 (SSL)' }) + f.text('notify.email.user', 'اسم المستخدم', { ltr: true }) + f.text('notify.email.pass', 'كلمة المرور', { ltr: true, type: 'password', hint: 'لـ Gmail استخدم "كلمة مرور التطبيقات"' }) + f.text('notify.email.from_name', 'اسم المرسل') + f.text('notify.email.from_email', 'بريد المرسل', { ltr: true }) + '</div>' +
            f.swi('notify.email.secure', 'اتصال آمن SSL (للمنفذ 465)') + '<div class="row" style="margin-top:12px"><input class="in" id="te" placeholder="بريد للتجربة" dir="ltr"><button class="btn soft" data-test="email">إرسال تجربة</button></div>' +
            f.text('notify.admin_emails', 'بريد الإدارة لاستلام الطلبات الجديدة', { ltr: true, ph: 'a@org.sa, b@org.sa' })) +
          card('📱 رسائل الجوال SMS', f.sw('notify.sms.enabled', 'تفعيل الرسائل النصية') + f.select('notify.sms.provider', 'مزود الخدمة', SMS) + '<div id="smsf"></div><div class="row" style="margin-top:12px"><input class="in" id="ts" placeholder="05xxxxxxxx" dir="ltr"><button class="btn soft" data-test="sms">إرسال تجربة</button></div>') + '</div><div>' +
          card('🟢 واتساب', '<div class="seg" id="wam"><button data-m="manual">يدوي (بدون واتساب أعمال)</button><button data-m="cloud">تلقائي (WhatsApp Business API)</button></div><div id="waf" style="margin-top:12px"></div><div class="row" style="margin-top:12px"><input class="in" id="tw" placeholder="05xxxxxxxx" dir="ltr"><button class="btn soft" data-test="whatsapp">تجربة</button></div>') +
          card('🔔 متى يُرسل الإشعار؟', '<table class="t"><thead><tr><th></th><th>بريد</th><th>SMS</th><th>واتساب</th></tr></thead><tbody>' + [['ticket_created', 'عند استلام الطلب'], ['ticket_updated', 'عند تحديث الحالة / الرد']].map(function (r) { return '<tr><td><b class="small">' + r[1] + '</b></td>' + ['email', 'sms', 'whatsapp'].map(function (c) { return '<td><label class="switch"><input type="checkbox" data-k="notify.channels.' + r[0] + '.' + c + '"><span class="tr"></span></label></td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>') +
          card('📝 قوالب الرسائل', f.text('notify.templates.ticket_created_subject', 'عنوان بريد الاستلام') + f.area('notify.templates.ticket_created', 'رسالة الاستلام', { rows: 4 }) + f.text('notify.templates.ticket_updated_subject', 'عنوان بريد التحديث') + f.area('notify.templates.ticket_updated', 'رسالة التحديث', { rows: 4 }) +
            f.text('notify.templates.admin_new_ticket_subject', 'عنوان إشعار الإدارة') + f.area('notify.templates.admin_new_ticket', 'إشعار الإدارة', { rows: 3 }) + '<div class="hint">المتغيرات: {name} {number} {type} {date} {status} {reply} {org} {phone} {text}</div>') + '</div></div>' +
          card('📜 سجل الإرسال', '<div id="nlog"></div>');
        A.bind(el, d, function (k) { ch(); if (k === 'notify.sms.provider') smsFields(); });
        function smsFields() {
          var p = n.sms.provider, h = '';
          if (p === 'taqnyat') h = f.text('notify.sms.api_key', 'Bearer Token', { ltr: true }) + f.text('notify.sms.sender', 'اسم المرسل المعتمد', { ltr: true });
          else if (p === 'unifonic') h = f.text('notify.sms.api_key', 'AppSid', { ltr: true }) + f.text('notify.sms.sender', 'SenderID', { ltr: true });
          else if (p === 'msegat') h = f.text('notify.sms.username', 'اسم المستخدم', { ltr: true }) + f.text('notify.sms.api_key', 'API Key', { ltr: true }) + f.text('notify.sms.sender', 'اسم المرسل', { ltr: true });
          else if (p === 'twilio') h = f.text('notify.sms.account_sid', 'Account SID', { ltr: true }) + f.text('notify.sms.auth_token', 'Auth Token', { ltr: true }) + f.text('notify.sms.sender', 'رقم المرسل', { ltr: true });
          else if (p === 'custom') h = f.text('notify.sms.custom_url', 'رابط API', { ltr: true }) + f.select('notify.sms.custom_method', 'الطريقة', [['POST', 'POST'], ['GET', 'GET']]) + f.area('notify.sms.custom_headers', 'Headers (JSON)', { mono: true, rows: 2 }) + f.area('notify.sms.custom_body', 'Body', { mono: true, rows: 3, hint: 'استخدم {phone} و {message}' });
          A.$('#smsf', el).innerHTML = '<div class="grid g2" style="margin-top:6px">' + h + '</div>';
          A.bind(A.$('#smsf', el), d, ch);
        }
        function waFields() {
          A.$$('#wam button', el).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-m') === n.whatsapp.mode); b.onclick = function () { n.whatsapp.mode = b.getAttribute('data-m'); ch(); waFields(); }; });
          A.$('#waf', el).innerHTML = n.whatsapp.mode === 'cloud' ? '<div class="grid g2">' + f.text('notify.whatsapp.phone_number_id', 'Phone Number ID', { ltr: true }) + f.text('notify.whatsapp.api_version', 'إصدار API', { ltr: true }) + '</div>' + f.text('notify.whatsapp.token', 'Access Token', { ltr: true, type: 'password' }) + '<div class="hint">من Meta for Developers ← WhatsApp ← API Setup. إن فشل الإرسال يظهر زر الإرسال اليدوي تلقائياً.</div>'
            : '<div class="alert ok">✅ في الوضع اليدوي يظهر في صفحة الطلب زر «إرسال يدوي عبر واتساب» يفتح المحادثة برسالة جاهزة لتضغط إرسال.</div>';
          A.bind(A.$('#waf', el), d, ch);
        }
        smsFields(); waFields();
        A.$$('[data-test]', el).forEach(function (b) {
          b.onclick = function () {
            var c = b.getAttribute('data-test'), to = A.$(c === 'email' ? '#te' : c === 'sms' ? '#ts' : '#tw', el).value.trim();
            if (!to) return A.toast('أدخل المستلم أولاً', 'err');
            b.disabled = true;
            A.api('POST', '/api/sites/' + S.site.id + '/notify/test', { channel: c, to: to, notify: n }).then(function (r) {
              if (r.manual) { window.open(r.manual, '_blank'); A.toast('تم فتح واتساب للإرسال اليدوي'); } else A.toast('تم الإرسال بنجاح ✅', 'ok'); log();
            }).catch(function (e) { A.fail(e); log(); }).then(function () { b.disabled = false; });
          };
        });
        function log() {
          A.GET('/api/notify-log').then(function (rows) {
            A.$('#nlog', el).innerHTML = rows.length ? '<div class="tbl-wrap"><table class="t"><thead><tr><th>القناة</th><th>المستلم</th><th>المرجع</th><th>الحالة</th><th>الوقت</th></tr></thead><tbody>' + rows.slice(0, 30).map(function (r) { return '<tr><td>' + esc(r.channel) + '</td><td class="ltr small">' + esc(r.recipient) + '</td><td class="ltr small">' + esc(r.ref || '') + '</td><td>' + (r.status === 'sent' ? '<span class="tag green">تم</span>' : '<span class="tag red" title="' + esc(r.error || '') + '">فشل</span> <span class="tiny muted">' + esc((r.error || '').slice(0, 60)) + '</span>') + '</td><td class="small muted">' + A.fmtDate(r.created_at) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted small">لا يوجد</p>';
          });
        }
        log();
      });
      return function () { draft = null; };
    }
  });

  /* ============================== install ============================== */
  A.page('install', {
    title: 'التركيب والربط', icon: '🔌', role: 'supervisor',
    render: function (root) {
      var origin = location.origin, key = S.site.key, plat = 'wordpress';
      var code = '<script src="' + origin + '/widget.js" data-site="' + key + '" async></script>';
      var PL = {
        wordpress: { n: 'ووردبريس', e: '🧩' }, salla: { n: 'سلة', e: '🛍️' }, zid: { n: 'زد', e: '🛒' }, shopify: { n: 'Shopify', e: '🟢' }, html: { n: 'أي موقع HTML', e: '🌐' }, gtm: { n: 'Google Tag Manager', e: '🏷️' }
      };
      root.innerHTML = '<div class="grid" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:16px"><div>' +
        card('1️⃣ اختر منصة موقعك', '<div class="platforms">' + Object.keys(PL).map(function (k) { return '<div class="plat" data-p="' + k + '"><span class="pe">' + PL[k].e + '</span>' + PL[k].n + '</div>'; }).join('') + '</div>') +
        '<div class="card" style="margin-bottom:16px"><h3>2️⃣ خطوات التركيب</h3><div id="steps"></div></div></div><div>' +
        card('📡 حالة الربط', '<div id="ist"><div class="muted">جارٍ الفحص…</div></div><button class="btn sm ghost" id="rechk" style="margin-top:10px">🔄 إعادة الفحص</button>') +
        card('🧪 جرّب قبل التركيب', '<p class="small muted" style="margin-top:0">صفحة تجريبية فيها المساعد بإعداداتك الحالية</p><a class="btn soft" target="_blank" href="/demo/preview.html?site=' + esc(key) + '">فتح صفحة التجربة ↗</a>') +
        card('🔑 مفتاح الموقع', '<pre class="code">' + esc(key) + '</pre>') +
        (A.can('admin') ? card('🛡️ الأمان', '<div id="sec"></div>') : '') + '</div></div>';
      function steps() {
        A.$$('.plat', root).forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-p') === plat); p.onclick = function () { plat = p.getAttribute('data-p'); steps(); }; });
        var copyBtn = '<div class="row" style="margin:8px 0"><button class="btn sm" data-copy>📋 نسخ الكود</button></div><pre class="code">' + esc(code) + '</pre>';
        var s = {
          wordpress: '<div class="alert ok" style="margin-bottom:12px">✨ أسهل طريقة: الإضافة جاهزة ومربوطة بموقعك — لا تحتاج أي إعداد!</div><ol class="steps"><li>' + (A.can('admin') ? '<button class="btn gold" id="wpdl">⬇️ تنزيل إضافة ووردبريس الجاهزة</button>' : 'اطلب من مدير النظام تنزيل الإضافة الجاهزة من هذه الصفحة') + '</li><li>في لوحة ووردبريس: <b>إضافات ← أضف جديد ← رفع إضافة</b> واختر الملف المنزّل.</li><li>اضغط <b>تفعيل</b>. انتهى! 🎉 سيظهر زر المحادثة في موقعك فوراً.</li></ol><p class="tiny muted">الإضافة ترسل اسم وبريد العضو المسجّل بشكل موثّق تلقائياً.</p>',
          salla: '<ol class="steps"><li>انسخ الكود:' + copyBtn + '</li><li>في لوحة تحكم سلة: <b>المتجر الإلكتروني ← أدوات التسويق ← الأكواد المخصصة</b> (أو: إعدادات المتجر ← إعدادات متقدمة ← أكواد مخصصة).</li><li>الصق الكود في خانة <b>أكواد JavaScript أسفل الصفحة (Footer)</b> واحفظ.</li></ol>',
          zid: '<ol class="steps"><li>انسخ الكود:' + copyBtn + '</li><li>في لوحة زد: <b>الإعدادات ← إعدادات المتجر ← أكواد إضافية</b>.</li><li>الصق الكود في خانة الأكواد أسفل الصفحة واحفظ.</li></ol>',
          shopify: '<ol class="steps"><li>انسخ الكود:' + copyBtn + '</li><li><b>Online Store ← Themes ← Edit code ← theme.liquid</b></li><li>الصق الكود قبل <code>&lt;/body&gt;</code> واحفظ.</li></ol>',
          html: '<ol class="steps"><li>انسخ الكود:' + copyBtn + '</li><li>الصقه في كل صفحة قبل وسم <code>&lt;/body&gt;</code> (أو في القالب المشترك للموقع).</li><li>اختياري — لتوثيق هوية العضو المسجّل أضف قبل الكود:<pre class="code">window.SmartChatUser = { name: "...", email: "...", sig: "HMAC_SHA256(email, identity_secret)" };</pre></li></ol>',
          gtm: '<ol class="steps"><li>انسخ الكود:' + copyBtn + '</li><li>في GTM: <b>Tags ← New ← Custom HTML</b> والصق الكود.</li><li>Trigger: <b>All Pages</b> ثم <b>Submit / Publish</b>.</li></ol>'
        };
        A.$('#steps').innerHTML = s[plat];
        var cp = A.$('[data-copy]'); if (cp) cp.onclick = function () { navigator.clipboard.writeText(code).then(function () { A.toast('تم النسخ ✅', 'ok'); }); };
        var wp = A.$('#wpdl'); if (wp) wp.onclick = function () { A.download('/api/sites/' + S.site.id + '/wordpress-plugin.zip'); };
      }
      function status() {
        A.GET('/api/sites/' + S.site.id + '/install-status').then(function (rows) {
          var recent = rows.filter(function (r) { return Date.now() - new Date(r.last_seen) < 7 * 86400000; });
          A.$('#ist').innerHTML = recent.length ? '<div class="alert ok" style="margin-bottom:10px">✅ المساعد يعمل على ' + recent.length + ' موقع</div>' + recent.map(function (r) { return '<div class="row small" style="margin-bottom:6px"><span class="dot on"></span><b class="ltr grow">' + esc(r.origin) + '</b><span class="muted">' + A.ago(r.last_seen) + ' · ' + r.hits + ' زيارة</span></div>'; }).join('')
            : '<div class="alert warn">⏳ لم يُكتشف بعد على أي موقع. بعد التركيب افتح موقعك ثم اضغط إعادة الفحص.</div>';
        });
      }
      A.$('#rechk').onclick = status;
      if (A.can('admin')) {
        var sec = A.clone(S.site.settings.security), el = A.$('#sec');
        el.innerHTML = f.area('allowed_domains', 'النطاقات المسموح لها', { rows: 2, ph: 'example.com, shop.example.com', hint: 'اتركه فارغاً للسماح لأي موقع' }) +
          '<label class="f">مفتاح توثيق الهوية (Identity secret)</label><div class="row"><input class="in mono" readonly value="' + esc(sec.identity_secret || '') + '" id="isec"><button class="btn sm ghost" id="regen">تجديد</button></div>' +
          '<button class="btn sm" id="ssec" style="margin-top:10px">حفظ</button>';
        A.bind(el, sec);
        A.$('#ssec').onclick = function () { A.saveSite({ settings: { security: { allowed_domains: sec.allowed_domains } } }).then(function () { A.toast('تم الحفظ', 'ok'); }, A.fail); };
        A.$('#regen').onclick = function () { A.confirm('تجديد المفتاح يتطلب تحديث إضافة ووردبريس. متابعة؟').then(function (ok) { if (ok) A.api('POST', '/api/sites/' + S.site.id + '/regenerate-secret').then(function (r) { A.$('#isec').value = r.identity_secret; A.reloadSites(); }, A.fail); }); };
      }
      steps(); status();
    }
  });

  /* ============================== datasource ============================== */
  A.page('datasource', {
    title: 'قاعدة البيانات', icon: '🗄️', role: 'admin',
    render: function (root) {
      settingsPage(root, ['datasource'], function (el, d, ch) {
        el.innerHTML = '<div class="alert info" style="margin-bottom:16px">اربط المساعد بقاعدة بياناتك ليستعلم المستفيد عن حالة طلبه أو بياناته. استخدم المتغيرات مثل <code>:order_no</code> و <code>:phone</code> وسيطلبها البوت من المستفيد تلقائياً.</div>' +
          '<div class="grid g2"><div>' + card('🔗 الاتصال', f.select('datasource.type', 'النوع', [['demo', 'بيانات تجريبية'], ['none', 'بدون'], ['mysql', 'MySQL / MariaDB'], ['postgres', 'PostgreSQL'], ['api', 'REST API']]) +
            f.text('datasource.connection', 'رابط الاتصال', { ltr: true, mono: true, ph: 'mysql://user:pass@host:3306/db', hint: 'للأمان استخدم مستخدماً بصلاحية قراءة فقط' }) + f.text('datasource.api_url', 'رابط API (لنوع REST)', { ltr: true }) + f.area('datasource.api_headers', 'API Headers (JSON)', { mono: true, rows: 2 })) +
          card('🧪 اختبار', '<div class="row"><select class="in" id="tw" style="width:auto"><option value="order">استعلام الطلب</option><option value="customer">استعلام المستفيد</option></select><input class="in" id="tp" placeholder=\'{"order_no":"1001","phone":"0500000001"}\' dir="ltr"><button class="btn soft" id="tb">تشغيل</button></div><pre class="code" id="tr" style="margin-top:10px;max-height:240px;overflow:auto">—</pre>') + '</div><div>' +
          card('📦 الاستعلامات والقوالب', f.area('datasource.order_query', 'استعلام حالة الطلب', { mono: true, rows: 3 }) + f.area('datasource.order_template', 'قالب الرد', { rows: 2 }) + f.area('datasource.notes_template', 'قالب الملاحظات', { rows: 1 }) +
            f.area('datasource.customer_query', 'استعلام بيانات المستفيد', { mono: true, rows: 3 }) + f.area('datasource.customer_template', 'قالب الرد', { rows: 3 })) + '</div></div>';
        A.bind(el, d, ch);
        A.$('#tb', el).onclick = function () {
          var params = {}; try { params = JSON.parse(A.$('#tp', el).value || '{}'); } catch (e) { return A.toast('صيغة JSON غير صحيحة', 'err'); }
          A.api('POST', '/api/sites/' + S.site.id + '/datasource/test', { which: A.$('#tw', el).value, params: params, datasource: d.datasource }).then(function (r) { A.$('#tr', el).textContent = '✅ المتغيرات: ' + r.params.join(', ') + '\n' + JSON.stringify(r.rows, null, 2); }).catch(function (e) { A.$('#tr', el).textContent = '❌ ' + e.message; });
        };
      });
    }
  });

  /* ============================== sites ============================== */
  A.page('sites', {
    title: 'المواقع', icon: '🗂️', role: 'admin',
    render: function (root) {
      function draw() {
        root.innerHTML = '<div class="card"><h3>المواقع المربوطة <span class="acts"><button class="btn sm" id="ns">+ موقع جديد</button></span></h3><p class="sub">لكل موقع شجرة ردود ومظهر ومعرفة وإعدادات مستقلة.</p><table class="t"><thead><tr><th>الاسم</th><th>المفتاح</th><th>تاريخ الإنشاء</th><th></th></tr></thead><tbody>' +
          S.sites.map(function (s) { return '<tr><td><b>' + esc(s.name) + '</b> ' + (s.id === S.site.id ? '<span class="tag green">الحالي</span>' : '') + '</td><td class="ltr small">' + esc(s.key) + '</td><td class="small muted">' + A.fmtDate(s.created_at, false) + '</td><td style="white-space:nowrap"><button class="btn sm ghost" data-sw="' + s.id + '">اختيار</button> <button class="btn sm ghost" data-rn="' + s.id + '">إعادة تسمية</button> <button class="btn sm danger ghost" data-dl="' + s.id + '">حذف</button></td></tr>'; }).join('') + '</tbody></table></div>';
        A.$('#ns').onclick = function () { A.prompt('اسم الموقع الجديد', '').then(function (n) { if (n) A.api('POST', '/api/sites', { name: n }).then(function () { return A.reloadSites(); }).then(draw, A.fail); }); };
        A.$$('[data-sw]').forEach(function (b) { b.onclick = function () { A.selectSite(Number(b.getAttribute('data-sw'))); }; });
        A.$$('[data-rn]').forEach(function (b) { b.onclick = function () { var s = S.sites.find(function (x) { return x.id === Number(b.getAttribute('data-rn')); }); A.prompt('إعادة تسمية', s.name).then(function (n) { if (n) A.api('PUT', '/api/sites/' + s.id, { name: n }).then(function () { return A.reloadSites(); }).then(draw, A.fail); }); }; });
        A.$$('[data-dl]').forEach(function (b) { b.onclick = function () { A.confirm('حذف الموقع وكل محادثاته وإعداداته نهائياً؟', true).then(function (ok) { if (ok) A.api('DELETE', '/api/sites/' + b.getAttribute('data-dl')).then(function () { return A.reloadSites(); }).then(function () { A.selectSite(S.sites[0].id); }, A.fail); }); }; });
      }
      draw();
    }
  });
})();
