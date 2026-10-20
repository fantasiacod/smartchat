/* Eligibility calculator page: questions → calculations → "not eligible if" rules → entitlement amount → messages */
(function () {
  var A = App, S = A.state, esc = A.esc, f = A.f;
  function card(title, body, sub, id) { return '<div class="card" style="margin-bottom:16px"' + (id ? ' id="' + id + '"' : '') + '><h3>' + title + '</h3>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + body + '</div>'; }
  function uid(p) { return (p || 'x') + Math.random().toString(36).slice(2, 8); }
  var QT = [['number', '🔢 رقم / مبلغ'], ['choice', '🔘 اختيار من قائمة'], ['yesno', '✅ نعم / لا']];
  var OPS = [['>', 'أكبر من'], ['>=', 'أكبر من أو يساوي'], ['<', 'أصغر من'], ['<=', 'أصغر من أو يساوي'], ['=', 'يساوي'], ['!=', 'لا يساوي']];
  var AFTER = [['', '— بدون —'], ['ticket', '📞 طلب تواصل (اسم وجوال)'], ['url', '🔗 رابط التقديم'], ['handoff', '👨‍💼 تحويل لموظف'], ['lookup', '🔎 استعلام من قاعدة البيانات']];

  function blank() {
    return { id: uid('el'), title: 'برنامج جديد', keywords: '', intro: '', enabled: true, questions: [], calcs: [], rules: [], amount: { formula: '', min: '', max: '', round: 0, zero_not_eligible: false, zero_message: '' }, messages: { eligible: '', not_eligible: '', disclaimer: true }, after: { action: 'url', label: '', url: '', target: '' } };
  }
  function sample() {
    var p = blank();
    p.title = 'المساعدات الشهرية'; p.keywords = 'المساعدات الشهرية, المساعدة الشهرية, الإعانة الشهرية';
    p.intro = 'سأطرح عليك بعض الأسئلة القصيرة لمعرفة أهليتك للمساعدة الشهرية وقيمتها التقريبية 🧮';
    p.questions = [
      { id: uid('q'), key: 'resident', text: 'هل تسكن داخل نطاق خدمة الجمعية؟', type: 'yesno' },
      { id: uid('q'), key: 'income', text: 'كم إجمالي دخل الأسرة الشهري؟', type: 'number', unit: 'ريال', min: 0, max: 200000 },
      { id: uid('q'), key: 'family_size', text: 'كم عدد أفراد الأسرة (بما فيهم أنت)؟', type: 'number', min: 1, max: 30 },
      { id: uid('q'), key: 'other_aid', text: 'هل تستلم مساعدة شهرية من جهة أخرى؟', type: 'yesno' }
    ];
    p.calcs = [{ key: 'per_capita', label: 'دخل الفرد', formula: 'income / family_size' }];
    p.rules = [
      { left: 'resident', op: '=', right: 'لا', message: 'خدمات الجمعية لسكان نطاقها فقط' },
      { left: 'income', op: '>', right: '8000', message: 'دخل الأسرة أعلى من الحد المعتمد (8,000 ريال)' },
      { left: 'per_capita', op: '>', right: '1500', message: 'دخل الفرد أعلى من الحد المعتمد (1,500 ريال)' }
    ];
    p.amount = { formula: '(1500 - per_capita) * family_size * 0.5 * (1 - 0.5 * other_aid_points)', min: 300, max: 3000, round: 0, zero_not_eligible: true, zero_message: 'الدخل يغطي الحد المعتمد' };
    return p;
  }

  A.page('eligibility', {
    title: 'حاسبة الاستحقاق', icon: '🧮', role: 'supervisor',
    hint: 'أسئلة يطرحها البوت، ثم يحسب النتيجة: مؤهل أو غير مؤهل، وقيمة الاستحقاق المتوقعة',
    render: function (root) {
      var cur = 0, hubSync = null;
      A.settingsPage(root, ['eligibility'], function (el, d, ch) {
        var P = d.eligibility.programs = d.eligibility.programs || [];
        var H = d.eligibility.hub = d.eligibility.hub || {}; if (!H.label) H.label = '🧮 حساب آلية الاستحقاق';
        function menuNode(tree) { return tree.nodes.find(function (n) { return n.id === 'menu'; }) || tree.nodes.find(function (n) { return n.id === tree.root; }); }
        function hubShown() { var m = menuNode(S.site.tree); return !!(m && m.options.some(function (o) { return o.action === 'eligibility_menu'; })); }
        // show / hide the single main-menu button; direct program buttons in the main menu are folded into it
        function setHub(on) {
          var tree = A.clone(S.site.tree), m = menuNode(tree); if (!m) return Promise.reject(new Error('لم أجد القائمة الرئيسية'));
          var idx = m.options.findIndex(function (o) { return o.action === 'eligibility_menu'; });
          if (on && idx < 0) {
            var direct = m.options.findIndex(function (o) { return o.action === 'eligibility'; }), btn = { label: H.label, action: 'eligibility_menu' };
            if (direct >= 0) { m.options[direct] = btn; m.options = m.options.filter(function (o, i) { return i === direct || o.action !== 'eligibility'; }); }
            else { var last = m.options.length && /رئيسية|إنهاء|end/.test(m.options[m.options.length - 1].label || '') ? m.options.length - 1 : m.options.length; m.options.splice(last, 0, btn); }
          } else if (!on && idx >= 0) m.options.splice(idx, 1);
          else if (on) m.options[idx].label = H.label;
          return (A.dirty ? A.saveSite({ settings: d }) : Promise.resolve()).then(function () { return A.saveSite({ tree: tree }); }).then(function () { A.setDirty(false); });
        }
        function hubCard() {
          var vis = P.filter(function (x) { return x.enabled !== false && x.visible !== false; }).length;
          return card('📋 زر «حساب آلية الاستحقاق» في القائمة الرئيسية', '<div class="row wrap" style="gap:12px;align-items:center;margin-bottom:10px"><label class="switch"><input type="checkbox" id="hubon"' + (hubShown() ? ' checked' : '') + '><span class="tr"></span><span class="lbl"><b>إظهار الزر في القائمة الرئيسية</b></span></label><span class="tiny muted">' + (hubShown() ? '✅ ظاهر' : '⏸️ مخفي') + ' — بداخله ' + vis + ' ' + (vis === 1 ? 'برنامج' : 'برامج') + '</span></div>' +
            '<div class="grid g3">' + f.text('hub.label', 'نص الزر', { ph: '🧮 حساب آلية الاستحقاق' }) + f.text('hub.message', 'الرسالة داخل الزر', { ph: 'اختر نوع المساعدة لمعرفة أهليتك وقيمة استحقاقك 🧮' }) + f.text('hub.keywords', 'كلمات إضافية تفتحه', { ph: 'الاستحقاق, هل أنا مستحق' }) + '</div>' +
            (P.length ? '<label class="f">البرامج داخل الزر <small>— أخفِ أي برنامج دون حذفه</small></label><div class="checks">' + P.map(function (x, i) { return '<label><input type="checkbox" data-vis="' + i + '"' + (x.visible !== false ? ' checked' : '') + '> ' + (x.visible !== false ? '👁️ ' : '🙈 ') + esc(x.title || 'بدون اسم') + (x.enabled === false ? ' <span class="tiny muted">(موقوف)</span>' : '') + '</label>'; }).join('') + '</div>' : ''), 'عند الضغط عليه يعرض البوت قائمة البرامج (المساعدات الشهرية، الموسمية، …) فيختار المستفيد منها ثم تبدأ الأسئلة.', 'c-hub');
        }
        function draw() {
          if (cur >= P.length) cur = Math.max(0, P.length - 1);
          var p = P[cur];
          el.innerHTML = hubCard() + '<div class="row wrap" style="margin-bottom:16px;gap:8px">' + P.map(function (x, i) { return '<button class="btn sm ' + (i === cur ? '' : 'soft') + '" data-pi="' + i + '">' + (x.enabled === false ? '⏸️ ' : '🧮 ') + esc(x.title || 'بدون اسم') + '</button>'; }).join('') +
            '<button class="btn sm ghost" id="pnew">+ برنامج جديد</button><button class="btn sm gold" id="psample">📋 مثال جاهز</button></div>' +
            (p ? editor(p) : '<div class="card" style="text-align:center;padding:40px"><div style="font-size:48px">🧮</div><h3>لا توجد برامج بعد</h3><p class="muted">أنشئ برنامجاً وأضف أسئلته وشروطه، أو ابدأ بمثال جاهز وعدّله.</p><div class="row" style="justify-content:center;gap:8px"><button class="btn" id="pnew2">+ برنامج جديد</button><button class="btn gold" id="psample2">📋 مثال جاهز: المساعدة الشهرية</button></div></div>');
          A.$$('[data-pi]', el).forEach(function (b) { b.onclick = function () { cur = Number(b.getAttribute('data-pi')); draw(); }; });
          var add = function (x) { P.push(x); cur = P.length - 1; ch(); draw(); };
          [['#pnew', blank], ['#pnew2', blank], ['#psample', sample], ['#psample2', sample]].forEach(function (z) { var b = A.$(z[0], el); if (b) b.onclick = function () { add(z[1]()); }; });
          A.bind(A.$('#c-hub', el), d.eligibility, ch);
          A.$('#hubon', el).onchange = function () { var on = this.checked; setHub(on).then(function () { A.toast(on ? 'ظهر الزر في القائمة الرئيسية ✅' : 'أُخفي الزر من القائمة الرئيسية', 'ok'); draw(); }, function (e) { A.fail(e); draw(); }); };
          A.$$('[data-vis]', el).forEach(function (c) { c.onchange = function () { P[Number(c.getAttribute('data-vis'))].visible = c.checked; ch(); draw(); }; });
          if (p) wire(p);
        }

        function vars(p) {
          var v = [];
          p.questions.forEach(function (q, i) { if (q.key) { v.push([q.key, (q.text || 'سؤال ' + (i + 1)), q]); if (q.type !== 'number') v.push([q.key + '_points', 'نقاط: ' + (q.text || q.key), null]); } });
          p.calcs.forEach(function (c) { if (c.key) v.push([c.key, '🧮 ' + (c.label || c.key), null]); });
          return v;
        }

        var TABS = [['basic', '⚙️ البرنامج'], ['qs', '❓ الأسئلة'], ['rules', '⛔ الشروط والحساب'], ['result', '💬 النتيجة والتقديم'], ['sim', '🧪 تجربة'], ['res', '📊 النتائج']];
        var tab = 'basic';
        function editor(p) {
          var sec = function (id, html) { return '<div data-sec="' + id + '"' + (tab === id ? '' : ' class="hidden"') + '>' + html + '</div>'; };
          return '<div class="tabs" id="etabs" style="margin-bottom:14px">' + TABS.map(function (t) { return '<button data-t="' + t[0] + '"' + (t[0] === tab ? ' class="on"' : '') + '>' + t[1] + '</button>'; }).join('') + '</div>' +
            sec('basic', card('⚙️ البرنامج', '<div class="grid g2">' + f.text('title', 'اسم البرنامج', { ph: 'المساعدات الشهرية' }) + f.text('keywords', 'كلمات يُفهم بها الطلب', { ph: 'هل أنا مؤهل, احسب استحقاقي' }) + '</div>' +
              f.area('intro', 'رسالة البداية (اختياري)', { rows: 2, ph: 'سأطرح عليك بعض الأسئلة لمعرفة أهليتك…' }) +
              '<div class="row wrap" style="gap:8px">' + f.swi('enabled', 'مفعّل') + '<span style="flex:1"></span><button class="btn sm danger ghost" id="pdel">🗑️ حذف البرنامج</button></div>', '', 'c-basic') +
              card('🔗 مكان البرنامج في البوت', f.sw('visible', '👁️ يظهر داخل زر «' + esc(H.label) + '»', 'إذا أخفيته لا يظهر في القائمة، لكن يبقى يعمل إذا كتب المستفيد إحدى كلماته') +
                '<details style="margin-top:8px"><summary class="tiny muted" style="cursor:pointer">متقدم: ربطه بزر مستقل</summary><div id="plink" style="margin-top:8px"></div><button class="btn ghost sm" id="pmenu">🔗 ربط بزر في القائمة الرئيسية</button></details>', '', 'c-place')) +
            sec('qs', card('❓ الأسئلة', '<div id="qs"></div><button class="btn soft sm" id="qadd">+ سؤال</button>', 'يسألها البوت بالترتيب. «الاسم في المعادلات» يُستخدم في الحسابات والشروط (مثل <code>income</code> أو <code>الدخل</code>).')) +
            sec('rules', card('⛔ شروط عدم الأهلية', '<div id="rs"></div><button class="btn soft sm" id="radd">+ شرط</button>', 'يكون المستفيد <b>غير مؤهل</b> إذا تحقق أي شرط. تُفحص بعد كل إجابة، فإذا تحقق شرط يتوقف البوت فوراً (مثال: الدخل أكبر من 8000 → غير مؤهل).') +
              card('🧮 الحسابات <small class="muted">(اختياري)</small>', '<div id="cs"></div><button class="btn soft sm" id="cadd">+ حساب</button><div class="hint" style="margin-top:8px">مثال: «دخل الفرد» = <code class="ltr">income / family_size</code>. المسموح: + − × ÷ والأقواس، و <code class="ltr">min() max() round()</code>.</div><div id="vchips" class="chips" style="margin-top:8px"></div>') +
              card('💰 قيمة الاستحقاق <small class="muted">(اختياري)</small>', f.text('amount.formula', 'معادلة القيمة', { ltr: true, mono: true, ph: '(1500 - per_capita) * family_size' }) +
                '<div class="grid g3">' + f.num('amount.min', 'الحد الأدنى', { ph: 'بدون' }) + f.num('amount.max', 'الحد الأعلى', { ph: 'بدون' }) + f.select('amount.round', 'التقريب', [[0, 'لأقرب ريال'], [1, 'منزلة عشرية'], [2, 'منزلتان']]) + '</div>' +
                f.sw('amount.zero_not_eligible', 'إذا كانت القيمة صفراً أو أقل → غير مؤهل', '') + f.text('amount.zero_message', 'السبب في هذه الحالة', { ph: 'الدخل يغطي الحد المعتمد' }), '', 'c-amount')) +
            sec('result', '<div class="grid g2" id="c-msg"><div>' + card('✅ إذا كان مؤهلاً', f.area('messages.eligible', 'الرسالة', { rows: 4, ph: '✅ أنت مؤهل مبدئياً لـ «{title}»\n💰 قيمة الاستحقاق المتوقعة: {amount} ريال' }) +
                f.select('after.action', 'بعد الرسالة', [['url', '🔗 إرسال رابط التقديم'], ['ticket', '📞 طلب بيانات للتواصل (اسم وجوال)'], ['handoff', '👨‍💼 تحويل لموظف'], ['lookup', '🔎 استعلام من قاعدة البيانات'], ['', '— لا شيء —']]) + '<div id="aft"></div>' +
                f.sw('messages.disclaimer', 'إضافة: «هذه نتيجة مبدئية والقرار النهائي بعد دراسة الطلب»', '')) + '</div><div>' +
              card('⛔ إذا لم يكن مؤهلاً', f.area('messages.not_eligible', 'رسالتك للمستفيد', { rows: 4, ph: 'نعتذر، أنت غير مؤهل حالياً لـ «{title}» 🙏\nالسبب: {reason}' }) +
                '<div class="hint">اكتب الرسالة كما تريد. <code>{reason}</code> = سبب عدم الأهلية من الشروط (اختياري). اتركها فارغة للنص الافتراضي.</div>') + '</div></div>' +
              '<div class="hint">المتغيرات: <code>{amount}</code> قيمة الاستحقاق، <code>{reason}</code> السبب، <code>{title}</code> اسم البرنامج، وأي اسم سؤال أو حساب. الرسائل الفارغة تُكتب تلقائياً بالعربي والإنجليزي والأردو.</div>') +
            sec('sim', card('🧪 جرّب الحاسبة', '<div id="sim"></div>', 'أدخل إجابات تجريبية لترى النتيجة قبل الحفظ.')) +
            sec('res', card('📊 نتائج المستفيدين', '<div id="res"><p class="muted small">⏳</p></div>'));
        }

        function wire(p) {
          p.questions = p.questions || []; p.calcs = p.calcs || []; p.rules = p.rules || []; p.amount = p.amount || {}; p.messages = p.messages || {}; p.after = p.after || {};
          if (p.messages.disclaimer === undefined) p.messages.disclaimer = true;
          if (p.visible === undefined) p.visible = true;
          A.bind(el.querySelector('#c-place'), p, function () { ch(); draw(); });
          A.bind(el.querySelector('#c-basic'), p, function (k) { ch(); if (k === 'title' || k === 'enabled') A.$$('[data-pi]', el)[cur].innerHTML = (p.enabled === false ? '⏸️ ' : '🧮 ') + esc(p.title || 'بدون اسم'); });
          [A.$('#c-amount', el), A.$('#c-msg', el)].forEach(function (c) { A.bind(c, p, function (k) { ch(); if (k === 'after.action') after(); }); });
          A.$$('#etabs button', el).forEach(function (b) { b.onclick = function () { tab = b.getAttribute('data-t'); A.$$('#etabs button', el).forEach(function (x) { x.classList.toggle('on', x === b); }); A.$$('[data-sec]', el).forEach(function (x) { x.classList.toggle('hidden', x.getAttribute('data-sec') !== tab); }); if (tab === 'res') results(p); if (tab === 'sim') sim(p); }; });
          A.$('#pdel', el).onclick = function () { A.confirm('حذف البرنامج «' + (p.title || '') + '»؟').then(function (ok) { if (ok) { P.splice(cur, 1); ch(); draw(); } }); };
          function linked() {
            var out = [];
            (S.site.tree.nodes || []).forEach(function (n) { (n.options || []).forEach(function (o) { if (o.action === 'eligibility' && o.target === p.id) out.push((n.title || n.id) + ' ← ' + o.label); }); });
            A.$('#plink', el).innerHTML = out.length ? '<div class="alert ok" style="margin-bottom:10px">✅ مربوطة بـ: ' + out.map(esc).join('، ') + '</div>' : '<div class="tiny muted" style="margin-bottom:8px">غير مربوط بزر مستقل (يظهر داخل زر حساب الاستحقاق فقط)</div>';
          }
          linked();
          A.$('#pmenu', el).onclick = function () {
            var tree = A.clone(S.site.tree), menu = tree.nodes.find(function (n) { return n.id === 'menu'; }) || tree.nodes.find(function (n) { return n.id === tree.root; });
            if (!menu) return A.toast('لم أجد القائمة الرئيسية', 'err');
            var m = A.modal({ title: '🔗 ربط «' + esc(p.title || '') + '» بزر', body: '<p class="small muted">اختر الزر الذي يفتح الحاسبة عند الضغط عليه:</p><div class="checks">' + menu.options.map(function (o, i) { return '<label><input type="radio" name="lb" value="' + i + '"' + (o.action === 'eligibility' && o.target === p.id ? ' checked' : '') + '> ' + (i + 1) + ') ' + esc(o.label) + '</label>'; }).join('') + '<label><input type="radio" name="lb" value="new"> ➕ زر جديد: 🧮 ' + esc(p.title || '') + '</label></div>',
              buttons: [{ label: 'إلغاء', ghost: true }, { label: '✅ ربط وحفظ', onClick: function (close, bg) {
                var v = (bg.querySelector('[name=lb]:checked') || {}).value; if (v == null) { A.toast('اختر زراً', 'err'); return false; }
                if (v === 'new') menu.options.push({ label: '🧮 ' + (p.title || 'حاسبة الاستحقاق'), action: 'eligibility', target: p.id });
                else { var o = menu.options[Number(v)]; o.action = 'eligibility'; o.target = p.id; delete o.field; }
                return (A.dirty ? A.saveSite({ settings: d }) : Promise.resolve()).then(function () { return A.saveSite({ tree: tree }); }).then(function () { A.setDirty(false); linked(); A.toast('تم الربط ✅ — الزر يفتح الحاسبة الآن', 'ok'); });
              } }] });
          };
          questions(p); calcs(p); rules(p); after(); sim(p); results(p);

          function questions(p) {
            A.$('#qs', el).innerHTML = p.questions.map(function (q, i) {
              var extra = q.type === 'number' ? '<div class="grid g3">' + f.text('unit', 'الوحدة', { ph: 'ريال' }) + f.num('min', 'أقل قيمة', { ph: 'بدون' }) + f.num('max', 'أعلى قيمة', { ph: 'بدون' }) + '</div>'
                : q.type === 'choice' ? '<div class="field"><label class="f">الخيارات <small>— كل خيار في سطر، ويمكن إضافة نقاط بعد | للاستخدام في المعادلات</small></label><textarea class="in" rows="3" data-opts placeholder="مالك\nمستأجر | 1\nسكن خيري | 0">' + esc((q.options || []).map(function (o) { return o.label + (o.points !== '' && o.points != null ? ' | ' + o.points : ''); }).join('\n')) + '</textarea></div>'
                : '<div class="hint">الخياران: نعم / لا. في المعادلات: <code class="ltr">' + esc(q.key) + '_points</code> = 1 لنعم و 0 للا.</div>';
              return '<div class="repeat" data-i="' + i + '"><div class="row" style="margin-bottom:8px;flex-wrap:wrap"><b class="chip">' + (i + 1) + '</b><input class="in" data-k="text" placeholder="نص السؤال" style="flex:1;min-width:200px;font-weight:700"><select class="in" data-k="type" style="width:auto">' + QT.map(function (t) { return '<option value="' + t[0] + '">' + t[1] + '</option>'; }).join('') + '</select>' +
                '<input class="in" data-k="key" placeholder="الاسم في المعادلات" title="الاسم في المعادلات" dir="ltr" style="width:140px;font-family:ui-monospace,monospace">' +
                '<button class="btn sm ghost icon" data-up title="أعلى">↑</button><button class="btn sm ghost icon" data-dn title="أسفل">↓</button><button class="btn sm danger ghost icon" data-rm>✕</button></div>' + extra +
                f.text('error', 'رسالة عند الإجابة الخاطئة (اختياري)', { ph: 'تلقائية' }) + '</div>';
            }).join('') || '<p class="small muted">لا توجد أسئلة — أضف أول سؤال</p>';
            A.$$('.repeat', A.$('#qs', el)).forEach(function (r) {
              var i = Number(r.getAttribute('data-i')), q = p.questions[i];
              A.bind(r, q, function (k) {
                if (k === 'key') { var c = String(q.key || '').replace(/[^\p{L}\p{N}_]+/gu, '_'); if (c !== q.key) { q.key = c; r.querySelector('[data-k=key]').value = c; } }
                ch(); if (k === 'type') { if (q.type === 'choice' && !(q.options || []).length) q.options = [{ label: 'خيار 1', points: '' }, { label: 'خيار 2', points: '' }]; questions(p); }
                if (k === 'key' || k === 'text' || k === 'type') { rules(p); chips(p); sim(p); }
              });
              var ta = r.querySelector('[data-opts]');
              if (ta) ta.oninput = function () { q.options = ta.value.split('\n').map(function (l) { var a = l.split('|'); return { label: a[0].trim(), points: a[1] != null ? a[1].trim() : '' }; }).filter(function (o) { return o.label; }); ch(); rules(p); sim(p); };
              var mv = function (dlt) { var j = i + dlt; if (j < 0 || j >= p.questions.length) return; var t = p.questions[i]; p.questions[i] = p.questions[j]; p.questions[j] = t; ch(); questions(p); sim(p); };
              r.querySelector('[data-up]').onclick = function () { mv(-1); };
              r.querySelector('[data-dn]').onclick = function () { mv(1); };
              r.querySelector('[data-rm]').onclick = function () { p.questions.splice(i, 1); ch(); questions(p); rules(p); chips(p); sim(p); };
            });
          }
          A.$('#qadd', el).onclick = function () { var n = p.questions.length + 1, k = 'q' + n; while (p.questions.some(function (q) { return q.key === k; })) k += '_'; p.questions.push({ id: uid('q'), key: k, text: '', type: 'number' }); ch(); questions(p); rules(p); chips(p); sim(p); };

          var lastFormula = null;
          function calcs(p) {
            A.$('#cs', el).innerHTML = p.calcs.map(function (c, i) {
              return '<div class="row" data-i="' + i + '" style="margin-bottom:8px;flex-wrap:wrap"><input class="in" data-k="label" placeholder="اسم الحساب (مثال: دخل الفرد)" style="width:200px"><input class="in" data-k="key" placeholder="per_capita" dir="ltr" style="width:130px;font-family:ui-monospace,monospace"><b>=</b><input class="in" data-k="formula" data-f placeholder="income / family_size" dir="ltr" style="flex:1;min-width:200px;font-family:ui-monospace,monospace"><button class="btn sm danger ghost icon" data-rm>✕</button></div>';
            }).join('');
            A.$$('#cs > .row', el).forEach(function (r) {
              var i = Number(r.getAttribute('data-i')), c = p.calcs[i];
              A.bind(r, c, function (k) { if (k === 'key') { var v = String(c.key || '').replace(/[^\p{L}\p{N}_]+/gu, '_'); if (v !== c.key) { c.key = v; r.querySelector('[data-k=key]').value = v; } } ch(); if (k !== 'formula') { rules(p); chips(p); } });
              r.querySelector('[data-rm]').onclick = function () { p.calcs.splice(i, 1); ch(); calcs(p); rules(p); chips(p); };
            });
            A.$$('[data-f], [data-k="amount.formula"]', el).forEach(function (inp) { inp.onfocus = function () { lastFormula = inp; }; });
            chips(p);
          }
          function chips(p) {
            A.$('#vchips', el).innerHTML = '<span class="tiny muted">اضغط لإدراج متغير:</span> ' + vars(p).map(function (v) { return '<button class="chip" data-v="' + esc(v[0]) + '" title="' + esc(v[1]) + '"><span class="ltr">' + esc(v[0]) + '</span></button>'; }).join('');
            A.$$('[data-v]', el).forEach(function (b) { b.onclick = function () { var t = lastFormula || A.$('#cs [data-f]', el); if (!t) return; var pos = t.selectionStart != null ? t.selectionStart : t.value.length; t.value = t.value.slice(0, pos) + b.getAttribute('data-v') + t.value.slice(pos); t.dispatchEvent(new Event('input')); t.focus(); }; });
          }
          A.$('#cadd', el).onclick = function () { p.calcs.push({ key: 'calc' + (p.calcs.length + 1), label: '', formula: '' }); ch(); calcs(p); rules(p); };

          function rules(p) {
            var V = vars(p);
            A.$('#rs', el).innerHTML = p.rules.map(function (r, i) {
              var q = (V.find(function (v) { return v[0] === r.left; }) || [])[2];
              var right = q && q.type !== 'number'
                ? '<select class="in" data-k="right" style="width:auto">' + (q.type === 'yesno' ? ['نعم', 'لا'] : (q.options || []).map(function (o) { return o.label; })).map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>'
                : '<input class="in" data-k="right" placeholder="8000 أو معادلة" dir="ltr" style="width:170px;font-family:ui-monospace,monospace">';
              return '<div class="repeat" data-i="' + i + '"><div class="row" style="flex-wrap:wrap;gap:6px"><b>⛔ غير مؤهل إذا</b><select class="in" data-k="left" style="width:auto;max-width:260px"><option value="">— اختر —</option>' + V.map(function (v) { return '<option value="' + esc(v[0]) + '">' + esc(v[1]) + '</option>'; }).join('') + '</select>' +
                '<select class="in" data-k="op" style="width:auto">' + OPS.filter(function (o) { return !q || q.type === 'number' || o[0] === '=' || o[0] === '!='; }).map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') + '</select>' + right +
                '<button class="btn sm danger ghost icon" data-rm>✕</button></div>' + f.text('message', 'السبب الذي يظهر للمستفيد', { ph: 'دخل الأسرة أعلى من الحد المعتمد' }) + '</div>';
            }).join('') || '<p class="small muted">لا توجد شروط — كل من يُكمل الأسئلة يكون مؤهلاً</p>';
            A.$$('#rs .repeat', el).forEach(function (row) {
              var i = Number(row.getAttribute('data-i')), r = p.rules[i];
              var opSel = row.querySelector('[data-k=op]'); if (!r.op || ![].some.call(opSel.options, function (o) { return o.value === r.op; })) r.op = opSel.options[0].value;
              var rs = row.querySelector('select[data-k=right]'); if (rs && ![].some.call(rs.options, function (o) { return o.value === r.right; })) r.right = rs.options[0] ? rs.options[0].value : '';
              A.bind(row, r, function (k) { ch(); if (k === 'left') { r.right = ''; rules(p); } });
              row.querySelector('[data-rm]').onclick = function () { p.rules.splice(i, 1); ch(); rules(p); };
            });
          }
          A.$('#radd', el).onclick = function () { p.rules.push({ left: '', op: '>', right: '', message: '' }); ch(); rules(p); };

          function after() {
            var a = p.after, box = A.$('#aft', el);
            box.innerHTML = a.action === 'url' ? '<div class="grid g2">' + f.text('after.url', 'رابط التقديم', { ltr: true, ph: 'https://…' }) + f.text('after.label', 'نص الزر', { ph: '📝 قدّم طلبك الآن' }) + '</div>' + (a.url ? '' : '<div class="alert warn">⚠️ اكتب رابط التقديم</div>')
              : a.action === 'lookup' ? f.select('after.target', 'الاستعلام', [['', '— اختر —']].concat((S.site.settings.datasource.lookups || []).map(function (l) { return [l.id, l.title || l.id]; })))
              : a.action === 'ticket' ? '<div class="hint">يطلب الاسم والجوال ويسجّلها في «الشكاوى والاقتراحات» كطلب تواصل</div>' : '';
            A.bind(box, p, function (k) { ch(); if (k === 'after.url') { var w = box.querySelector('.alert'); if (w) w.classList.toggle('hidden', !!p.after.url); } });
          }

          function sim(p) {
            var box = A.$('#sim', el), ans = {};
            box.innerHTML = p.questions.length ? '<div class="grid g2">' + p.questions.map(function (q, i) {
              var inp = q.type === 'number' ? '<input class="in" type="number" data-sq="' + i + '" dir="ltr" placeholder="' + esc(q.unit || '') + '">'
                : '<select class="in" data-sq="' + i + '"><option value="">—</option>' + (q.type === 'yesno' ? ['نعم', 'لا'] : (q.options || []).map(function (o) { return o.label; })).map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>';
              return '<div class="field"><label class="f">' + (i + 1) + ') ' + esc(q.text || q.key) + '</label>' + inp + '</div>';
            }).join('') + '</div><button class="btn" id="srun">🧮 احسب النتيجة</button><div id="sout" style="margin-top:12px"></div>' : '<p class="small muted">أضف أسئلة أولاً</p>';
            var run = A.$('#srun', box); if (!run) return;
            run.onclick = function () {
              A.$$('[data-sq]', box).forEach(function (x) { var q = p.questions[x.getAttribute('data-sq')]; if (x.value !== '') ans[q.key] = q.type === 'number' ? Number(x.value) : x.value; else delete ans[q.key]; });
              A.api('POST', '/api/eligibility/test', { program: p, answers: ans }).then(function (r) {
                var V = vars(p), lbl = function (k) { return ((V.find(function (v) { return v[0] === k; }) || [])[1]) || k; };
                A.$('#sout', box).innerHTML = (r.problems && r.problems.length ? '<div class="alert warn">⚠️ ' + r.problems.map(esc).join('<br>⚠️ ') + '</div>' : '') +
                  (r.eligible ? '<div class="alert ok"><b>✅ مؤهل</b>' + (r.amount != null ? ' — قيمة الاستحقاق: <b>' + Number(r.amount).toLocaleString('en-US') + ' ريال</b>' : '') + '</div>' : '<div class="alert err"><b>⛔ غير مؤهل</b>' + (r.reason ? ' — ' + esc(r.reason) : '') + '</div>') +
                  '<div class="tbl-wrap"><table class="t"><tbody>' + Object.keys(r.vars || {}).filter(function (k) { return !/_points$/.test(k) || p.questions.some(function (q) { return q.key + '_points' === k && q.type !== 'number'; }); }).map(function (k) { var v = r.vars[k]; return '<tr><td>' + esc(lbl(k)) + ' <span class="tiny muted ltr">' + esc(k) + '</span></td><td><b>' + esc(typeof v === 'number' ? Math.round(v * 100) / 100 : v) + '</b></td></tr>'; }).join('') + '</tbody></table></div>';
              }, A.fail);
            };
          }

          function results(p) {
            A.GET('/api/eligibility/results?site=' + S.site.id + '&program=' + encodeURIComponent(p.id)).then(function (r) {
              var s = r.summary[0] || { total: 0, eligible: 0 };
              A.$('#res', el).innerHTML = !s.total ? '<p class="small muted">لم يستخدم أحد هذه الحاسبة بعد</p>' :
                '<div class="grid g3" style="margin-bottom:12px"><div class="card flat"><div class="muted small">عدد المحاولات</div><b style="font-size:24px">' + s.total + '</b></div><div class="card flat"><div class="muted small">مؤهلون</div><b style="font-size:24px">' + (s.eligible || 0) + ' <small class="muted">(' + Math.round((s.eligible || 0) * 100 / s.total) + '%)</small></b></div><div class="card flat"><div class="muted small">متوسط الاستحقاق</div><b style="font-size:24px">' + (s.avg_amount != null ? Number(s.avg_amount).toLocaleString('en-US') + ' ريال' : '—') + '</b></div></div>' +
                (r.reasons.length ? '<p class="small"><b>أكثر أسباب عدم الأهلية:</b> ' + r.reasons.map(function (x) { return esc(x.reason) + ' <span class="chip tiny">' + x.n + '</span>'; }).join('، ') + '</p>' : '') +
                '<div class="tbl-wrap"><table class="t"><thead><tr><th>التاريخ</th><th>النتيجة</th><th>القيمة</th><th>السبب</th><th>الإجابات</th><th></th></tr></thead><tbody>' + r.rows.map(function (x) {
                  return '<tr><td class="tiny">' + esc(String(x.created_at).slice(0, 16).replace('T', ' ')) + '</td><td>' + (x.eligible ? '✅ مؤهل' : '⛔ غير مؤهل') + '</td><td>' + (x.amount != null ? Number(x.amount).toLocaleString('en-US') : '—') + '</td><td class="small">' + esc(x.reason || '') + '</td><td class="tiny">' + Object.keys(x.answers).map(function (k) { return esc(k) + ': ' + esc(x.answers[k]); }).join(' · ') + '</td><td>' + (x.conversation_id ? '<a href="#/history/' + x.conversation_id + '">💬</a>' : '') + '</td></tr>';
                }).join('') + '</tbody></table></div>';
            }, function () { A.$('#res', el).innerHTML = ''; });
          }
        }
        draw();
        // keep the main-menu button text in step with «نص الزر»
        hubSync = function () { var m = menuNode(S.site.tree), o = m && m.options.find(function (x) { return x.action === 'eligibility_menu'; }); if (o && o.label !== H.label) setHub(true); };
      }, { onSaved: function () { hubSync && hubSync(); } });
    }
  });
})();
