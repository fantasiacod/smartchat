/* Business type + its lists (menu, services & prices, doctors, insurance, financing products…) */
(function () {
  var A = App, S = A.state, esc = A.esc, f = A.f;
  var COLS = [['group', 'القسم'], ['name', 'الاسم'], ['price', 'السعر'], ['note', 'الوصف / ملاحظات'], ['link', 'الرابط']];
  function uid(p) { return (p || 'c') + Math.random().toString(36).slice(2, 7); }
  function card(title, body, sub, extra) { return '<div class="card" style="margin-bottom:16px"' + (extra || '') + '><h3>' + title + '</h3>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + body + '</div>'; }

  A.page('business', {
    title: 'نشاطك وقوائمه', icon: '🧩', role: 'supervisor',
    hint: 'اختر نوع نشاطك فتُضاف القوائم التي يحتاجها (المنيو، الخدمات والأسعار، الأطباء، التأمين…) ويعرضها البوت',
    render: function (root) {
      A.GET('/api/business-types').then(function (TYPES) {
        A.settingsPage(root, ['biz'], function (el, d, ch) {
          var B = d.biz; B.catalogs = B.catalogs || []; if (!B.currency) B.currency = 'ريال';
          function menuNode() { return S.site.tree.nodes.find(function (n) { return n.id === 'menu'; }) || S.site.tree.nodes.find(function (n) { return n.id === S.site.tree.root; }); }
          function inMenu(id) { var m = menuNode(); return !!(m && m.options.some(function (o) { return o.action === 'catalog' && o.target === id; })); }

          function draw() {
            el.innerHTML = card('🧩 نوع النشاط', '<div class="grid g5" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px">' + Object.keys(TYPES).map(function (k) {
                var t = TYPES[k], on = B.type === k;
                return '<button type="button" class="card flat" data-ty="' + k + '" style="cursor:pointer;text-align:center;padding:12px;border:2px solid ' + (on ? 'var(--primary)' : 'var(--border)') + '"><div style="font-size:28px">' + t.icon + '</div><b class="small">' + esc(t.name) + '</b>' + (on ? '<div class="tiny" style="color:var(--primary)">✓ الحالي</div>' : '') + '</button>';
              }).join('') + '</div><div class="grid g3" style="margin-top:12px">' + f.text('biz.currency', 'العملة', { ph: 'ريال' }) + '</div>',
              'اختيار النوع يضيف قوائمه الجاهزة (بأمثلة تعدّلها)، ولا يحذف أي قائمة موجودة. يمكنك أيضاً إنشاء قوائمك الخاصة.') +
              '<div id="cats"></div><div class="row" style="gap:8px;margin-bottom:20px"><button class="btn soft" id="addcat">+ قائمة جديدة</button></div>';
            A.bind(el.querySelector('.card'), d, ch);
            A.$$('[data-ty]', el).forEach(function (b) { b.onclick = function () { applyType(b.getAttribute('data-ty')); }; });
            A.$('#addcat', el).onclick = newCatalog;
            cats();
          }

          function applyType(k) {
            var t = TYPES[k], missing = t.catalogs.filter(function (c) { return !B.catalogs.some(function (x) { return x.id === c.id; }); });
            var m = A.modal({ title: t.icon + ' ' + esc(t.name), body: '<p>سيُضاف إلى صفحتك:</p><ul>' + (missing.length ? missing.map(function (c) { return '<li>' + c.icon + ' <b>' + esc(c.title) + '</b> <span class="tiny muted">(' + c.items.length + ' أمثلة تعدّلها)</span></li>'; }).join('') : '<li class="muted">كل قوائم هذا النوع موجودة لديك</li>') + '</ul>' +
              '<label class="row" style="gap:8px;margin-top:10px"><input type="checkbox" id="withtree" checked> تطبيق شجرة القوائم الجاهزة لهذا النوع أيضاً <span class="tiny muted">(تستبدل الشجرة الحالية)</span></label>',
              buttons: [{ label: 'إلغاء', ghost: true }, { label: '✅ تطبيق', onClick: function (close, bg) {
                B.type = k; missing.forEach(function (c) { B.catalogs.push(A.clone(c)); });
                var withTree = bg.querySelector('#withtree').checked;
                return A.saveSite({ settings: d }).then(function () {
                  A.setDirty(false);
                  return withTree ? A.GET('/api/tree-template?type=' + k).then(function (tr) { return A.saveSite({ tree: tr }); }) : null;
                }).then(function () { A.toast('تم تطبيق «' + t.name + '» ✅' + (withTree ? ' مع شجرته' : ''), 'ok'); draw(); });
              } }] });
          }

          function newCatalog() {
            var x = { title: '', icon: '📋', cols: { name: 'الاسم' } };
            var m = A.modal({ title: '+ قائمة جديدة', body: '<div class="grid g2">' + f.text('title', 'اسم القائمة', { ph: 'مثال: باقات العضوية' }) + f.text('icon', 'أيقونة', { ph: '📋' }) + '</div><label class="f">الأعمدة</label><div class="checks">' +
              COLS.map(function (c) { return '<label><input type="checkbox" data-col="' + c[0] + '"' + (c[0] === 'name' ? ' checked disabled' : (c[0] === 'price' || c[0] === 'note') ? ' checked' : '') + '> ' + c[1] + '</label>'; }).join('') + '</div>',
              buttons: [{ label: 'إلغاء', ghost: true }, { label: '✅ إنشاء', onClick: function (close, bg) {
                if (!x.title.trim()) { A.toast('اكتب اسم القائمة', 'err'); return false; }
                var cols = {}; A.$$('[data-col]', bg).forEach(function (c) { if (c.checked) cols[c.getAttribute('data-col')] = COLS.find(function (z) { return z[0] === c.getAttribute('data-col'); })[1]; });
                B.catalogs.push({ id: uid('cat'), title: x.title.trim(), icon: x.icon || '📋', cols: cols, keywords: x.title.trim(), intro: '', items: [] }); ch(); cats();
              } }] });
            A.bind(m.body, x);
          }

          function cats() {
            A.$('#cats', el).innerHTML = B.catalogs.map(function (c, ci) {
              var keys = COLS.map(function (z) { return z[0]; }).filter(function (k) { return c.cols && c.cols[k]; });
              return '<div class="card" style="margin-bottom:16px" data-ci="' + ci + '"><div class="row wrap" style="gap:8px;margin-bottom:10px"><input class="in" data-k="icon" style="width:56px;text-align:center;font-size:20px"><input class="in" data-k="title" style="flex:1;min-width:180px;font-weight:700;font-size:16px">' +
                f.swi('enabled', 'ظاهرة') + '<button class="btn sm soft" data-menu>' + (inMenu(c.id) ? '✅ في القائمة الرئيسية' : '➕ زر في القائمة الرئيسية') + '</button><button class="btn sm danger ghost" data-del>🗑️</button></div>' +
                '<div class="grid g2">' + f.text('keywords', 'كلمات يفهم بها البوت الطلب', { ph: 'المنيو, الأسعار' }) + f.text('intro', 'رسالة قبل القائمة (اختياري)', { ph: 'هذه قائمتنا 👇' }) + '</div>' +
                '<div class="tbl-wrap"><table class="t"><thead><tr>' + keys.map(function (k) { return '<th><input class="in" data-colt="' + k + '" value="' + esc(c.cols[k]) + '" style="min-width:90px;font-weight:700;padding:4px 8px"></th>'; }).join('') + '<th style="width:110px"></th></tr></thead><tbody>' +
                (c.items || []).map(function (it, ii) { return '<tr data-ii="' + ii + '">' + keys.map(function (k) { return '<td><input class="in" data-k="' + k + '"' + (k === 'link' || k === 'price' ? ' dir="ltr"' : '') + ' style="padding:6px 8px"></td>'; }).join('') + '<td style="white-space:nowrap"><button class="btn sm ghost icon" data-up>↑</button><button class="btn sm ghost icon" data-dn>↓</button><button class="btn sm danger ghost icon" data-rm>✕</button></td></tr>'; }).join('') +
                '</tbody></table></div><div class="row" style="gap:8px;margin-top:8px"><button class="btn sm soft" data-add>+ إضافة</button><button class="btn sm ghost" data-paste>📋 لصق من Excel</button><span class="tiny muted">' + (c.items || []).length + ' عنصر</span></div></div>';
            }).join('') || '<div class="card"><p class="muted">لا توجد قوائم بعد — اختر نوع نشاطك أعلاه أو أنشئ قائمة جديدة.</p></div>';
            A.$$('[data-ci]', el).forEach(function (box) {
              var ci = Number(box.getAttribute('data-ci')), c = B.catalogs[ci]; c.items = c.items || []; if (c.enabled === undefined) c.enabled = true;
              A.bind(box.querySelector('.row'), c, ch); A.bind(box.querySelector('.grid'), c, ch);
              A.$$('[data-colt]', box).forEach(function (i) { i.oninput = function () { c.cols[i.getAttribute('data-colt')] = i.value; ch(); }; });
              A.$$('tr[data-ii]', box).forEach(function (tr) {
                var ii = Number(tr.getAttribute('data-ii')), it = c.items[ii];
                A.bind(tr, it, ch);
                var mv = function (dl) { var j = ii + dl; if (j < 0 || j >= c.items.length) return; var t = c.items[ii]; c.items[ii] = c.items[j]; c.items[j] = t; ch(); cats(); };
                tr.querySelector('[data-up]').onclick = function () { mv(-1); };
                tr.querySelector('[data-dn]').onclick = function () { mv(1); };
                tr.querySelector('[data-rm]').onclick = function () { c.items.splice(ii, 1); ch(); cats(); };
              });
              box.querySelector('[data-add]').onclick = function () { c.items.push({ group: (c.items[c.items.length - 1] || {}).group || '', name: '', price: '', note: '', link: '' }); ch(); cats(); var r = A.$$('tr[data-ii]', A.$$('[data-ci]', el)[ci]); var last = r[r.length - 1]; if (last) { var inp = last.querySelector('input[data-k="name"]') || last.querySelector('input'); inp && inp.focus(); } };
              box.querySelector('[data-paste]').onclick = function () {
                var keys = COLS.map(function (z) { return z[0]; }).filter(function (k) { return c.cols[k]; });
                A.prompt('📋 الصق الصفوف من Excel (كل صف في سطر، الأعمدة بالترتيب: ' + keys.map(function (k) { return c.cols[k]; }).join(' | ') + ')', '', { multiline: true, ok: 'إضافة' }).then(function (txt) {
                  if (!txt) return;
                  var n = 0; String(txt).split(/\r?\n/).forEach(function (line) { if (!line.trim()) return; var parts = line.split(/\t|\s*\|\s*|;/); var it = { group: '', name: '', price: '', note: '', link: '' }; keys.forEach(function (k, i) { it[k] = (parts[i] || '').trim(); }); if (it.name) { c.items.push(it); n++; } });
                  ch(); cats(); A.toast('تمت إضافة ' + n + ' عنصر ✅', 'ok');
                });
              };
              box.querySelector('[data-del]').onclick = function () { A.confirm('حذف قائمة «' + (c.title || '') + '» بكل عناصرها؟').then(function (ok) { if (ok) { B.catalogs.splice(ci, 1); ch(); cats(); } }); };
              box.querySelector('[data-menu]').onclick = function () {
                if (inMenu(c.id)) return A.toast('الزر موجود — غيّر اسمه أو أخفِه من «القوائم والأزرار» ← تعديل أزرار القائمة', 'ok');
                var tree = A.clone(S.site.tree), m = tree.nodes.find(function (n) { return n.id === 'menu'; }) || tree.nodes.find(function (n) { return n.id === tree.root; });
                m.options.push({ label: (c.icon || '📋') + ' ' + c.title, action: 'catalog', target: c.id });
                A.saveSite({ settings: d }).then(function () { return A.saveSite({ tree: tree }); }).then(function () { A.setDirty(false); A.toast('تمت إضافة «' + c.title + '» للقائمة الرئيسية ✅', 'ok'); cats(); }, A.fail);
              };
            });
          }
          draw();
        });
      }, A.fail);
    }
  });
})();
