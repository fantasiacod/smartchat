/* Smart Chat dashboard — core (state, api, router, theme, sockets, ui helpers, charts) */
(function () {
  'use strict';
  var App = window.App = {
    state: { token: null, me: null, sites: [], site: null, users: [], online: [], convs: {}, unread: {}, counts: {}, i18n: null },
    pages: {}, order: [], listeners: {}, socket: null
  };
  var S = App.state;

  /* ============================== utils ============================== */
  var esc = App.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  App.$ = function (sel, el) { return (el || document).querySelector(sel); };
  App.$$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };
  App.clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  App.get = function (obj, path) { return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj); };
  App.set = function (obj, path, v) { var ks = path.split('.'), o = obj; for (var i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; } o[ks[ks.length - 1]] = v; };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  App.fmtDate = function (iso, withTime) {
    if (!iso) return '—'; var d = new Date(iso); if (isNaN(d)) return '—';
    var s = d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate());
    return withTime === false ? s : s + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };
  App.fmtTime = function (iso) { var d = new Date(iso); return isNaN(d) ? '' : pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  App.ago = function (iso) {
    if (!iso) return ''; var s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return 'الآن'; if (s < 3600) return 'منذ ' + Math.floor(s / 60) + ' د'; if (s < 86400) return 'منذ ' + Math.floor(s / 3600) + ' س';
    if (s < 86400 * 7) return 'منذ ' + Math.floor(s / 86400) + ' يوم'; return App.fmtDate(iso, false);
  };
  App.dur = function (s) { if (s == null) return '—'; s = Number(s); if (s < 60) return Math.round(s) + ' ث'; if (s < 3600) return Math.round(s / 60) + ' د'; return (Math.round(s / 360) / 10) + ' س'; };
  App.num = function (n) { return n == null ? '—' : Number(n).toLocaleString('en-US'); };
  App.initials = function (n) { var p = String(n || '?').trim().split(/\s+/).map(function (w) { return w.replace(/^ال(?=..)/, ''); }); return (p[0] || '?').charAt(0) + (p[1] ? ' ' + p[1].charAt(0) : ''); };
  App.avatar = function (u, cls) {
    u = u || {}; return '<span class="av ' + (cls || '') + '">' + (u.avatar ? '<img src="' + esc(u.avatar) + '" alt="">' : esc(App.initials(u.name || u.visitor_name || '؟'))) + '</span>';
  };
  App.today = function (offset) { var d = new Date(Date.now() + (offset || 0) * 86400000); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  App.debounce = function (fn, ms) { var t; return function () { var a = arguments, me = this; clearTimeout(t); t = setTimeout(function () { fn.apply(me, a); }, ms || 300); }; };
  App.can = function (role) { var L = { agent: 1, supervisor: 2, admin: 3 }; return S.me && L[S.me.role] >= L[role]; };
  App.ROLE = { agent: 'موظف', supervisor: 'مشرف', admin: 'مدير النظام' };
  App.CONV = { bot: ['مع البوت', 'blue'], waiting: ['بانتظار موظف', 'amber'], human: ['مع موظف', 'green'], closed: ['مغلقة', 'gray'] };
  App.BY = { visitor: 'المستفيد', agent: 'الموظف', system: 'النظام (عدم نشاط)' };
  App.TK_TYPE = { complaint: ['شكوى', 'red', '📝'], suggestion: ['اقتراح', 'purple', '💡'], inquiry: ['استفسار', 'blue', '❓'], callback: ['طلب تواصل', 'amber', '📞'] };
  App.TK_STATUS = { new: ['جديدة', 'blue'], in_progress: ['قيد المعالجة', 'amber'], resolved: ['تم الحل', 'green'], closed: ['مغلقة', 'gray'], rejected: ['مرفوضة', 'red'] };
  App.PRIORITY = { low: ['منخفضة', 'gray'], normal: ['عادية', 'blue'], high: ['عالية', 'amber'], urgent: ['عاجلة', 'red'] };
  App.LANG = { ar: 'العربية', en: 'English', ur: 'اردو' };
  App.tag = function (map, k) { var v = map[k] || [k, 'gray']; return '<span class="tag ' + v[1] + '">' + (v[2] ? v[2] + ' ' : '') + esc(v[0]) + '</span>'; };
  App.stars = function (r, max) {
    if (r == null) return '<span class="muted">—</span>';
    max = Number(max) || 5; var hue = Math.round(Math.max(0, (r - 0.5) / Math.max(0.5, max - 0.5)) * 120), c = 'hsl(' + hue + ',75%,42%)', out = '';
    for (var i = 0; i < max; i++) {
      var f = Math.max(0, Math.min(1, r - i)), id = 'g' + Math.random().toString(36).slice(2, 8);
      out += '<svg viewBox="0 0 24 24"><defs><linearGradient id="' + id + '"><stop offset="' + f * 100 + '%" stop-color="' + c + '"/><stop offset="' + f * 100 + '%" stop-color="#d9ddd8"/></linearGradient></defs><path fill="url(#' + id + ')" d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>';
    }
    return '<span class="stars" title="' + r + ' / ' + max + '">' + out + '</span> <b style="color:' + c + '">' + r + '</b>';
  };
  App.on = function (evt, fn) { (App.listeners[evt] = App.listeners[evt] || []).push(fn); };
  App.off = function (evt, fn) { App.listeners[evt] = (App.listeners[evt] || []).filter(function (f) { return f !== fn; }); };
  App.emit = function (evt, data) { (App.listeners[evt] || []).slice().forEach(function (f) { try { f(data); } catch (e) { console.error(e); } }); };

  /* ============================== api ============================== */
  App.api = function (method, path, body, tries) {
    tries = tries || 0;
    return fetch(path, {
      method: method, headers: Object.assign({ 'Content-Type': 'application/json' }, S.token ? { Authorization: 'Bearer ' + S.token } : {}),
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (r) {
      if (r.status === 401 && S.token) { App.logout(); throw new Error('انتهت الجلسة، سجّل الدخول مجدداً'); }
      // the hosting network (e.g. Render) may answer 429 / 502 / 503 for a moment: wait and try again
      if ([429, 502, 503, 504].indexOf(r.status) >= 0 && tries < 3) {
        var wait = Math.min(8000, (Number(r.headers.get('Retry-After')) || (tries + 1) * 2) * 1000);
        return new Promise(function (res) { setTimeout(res, wait); }).then(function () { return App.api(method, path, body, tries + 1); });
      }
      if ([429, 502, 503, 504].indexOf(r.status) >= 0) throw new Error(r.status === 429 ? 'الخادم مشغول مؤقتاً (429) — انتظر دقيقة ثم أعد المحاولة' : 'الخادم يستيقظ أو مشغول (' + r.status + ') — أعد المحاولة بعد دقيقة');
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || ('خطأ ' + r.status)); e.data = j; throw e; } return j; });
    });
  };
  App.GET = function (p) { return App.api('GET', p); };
  App.download = function (path) {
    var a = document.createElement('a'); a.href = path + (path.indexOf('?') < 0 ? '?' : '&') + 'token=' + encodeURIComponent(S.token);
    a.download = ''; document.body.appendChild(a); a.click(); a.remove();
  };
  App.upload = function (file) {
    var MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm', pdf: 'application/pdf' };
    var ext = (file.name.split('.').pop() || '').toLowerCase(), type = file.type || MIME[ext] || '';
    return fetch('/api/media?type=' + encodeURIComponent(type) + '&name=' + encodeURIComponent(file.name), {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Authorization: 'Bearer ' + S.token }, body: file
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'فشل الرفع'); return j; }); });
  };
  App.pickFile = function (accept, multiple) {
    return new Promise(function (res) {
      var i = document.createElement('input'); i.type = 'file'; i.accept = accept || ''; i.multiple = !!multiple;
      i.onchange = function () { res(Array.prototype.slice.call(i.files || [])); }; i.click();
    });
  };
  App.readDataURL = function (file, maxSide) {
    return new Promise(function (res, rej) {
      var fr = new FileReader(); fr.onerror = rej;
      fr.onload = function () {
        var img = new Image(); img.onerror = rej;
        img.onload = function () {
          var s = Math.min(1, (maxSide || 256) / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.86));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  };

  /* ============================== ui ============================== */
  App.toast = function (msg, kind) {
    var t = document.createElement('div'); t.className = 'toast ' + (kind || '');
    t.innerHTML = '<span>' + (kind === 'err' ? '⚠️' : kind === 'ok' ? '✅' : 'ℹ️') + '</span><span>' + esc(msg) + '</span>';
    App.$('#toasts').appendChild(t); setTimeout(function () { t.remove(); }, kind === 'err' ? 6000 : 3500);
  };
  App.fail = function (e) { App.toast(e && e.message || String(e), 'err'); };
  App.modal = function (opts) {
    var bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal ' + (opts.size || '') + '"><div class="mh"><h3>' + (opts.title || '') + '</h3><button class="btn ghost icon" data-x>✕</button></div><div class="mb"></div>' +
      (opts.buttons !== false ? '<div class="mf"></div>' : '') + '</div>';
    var mb = bg.querySelector('.mb'); if (typeof opts.body === 'string') mb.innerHTML = opts.body; else if (opts.body) mb.appendChild(opts.body);
    var close = function () { bg.remove(); document.removeEventListener('keydown', onKey); opts.onClose && opts.onClose(); };
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    bg.querySelector('[data-x]').onclick = close;
    bg.addEventListener('mousedown', function (e) { if (e.target === bg && !opts.sticky) close(); });
    var mf = bg.querySelector('.mf');
    (opts.buttons || [{ label: 'إغلاق', ghost: true }]).forEach(function (b) {
      if (!mf) return; var btn = document.createElement('button'); btn.className = 'btn ' + (b.ghost ? 'ghost' : '') + (b.danger ? ' danger' : '');
      btn.textContent = b.label;
      btn.onclick = function () {
        if (!b.onClick) return close();
        var r = b.onClick(close, bg);
        if (r && r.then) { btn.disabled = true; r.then(function (v) { btn.disabled = false; if (v !== false) close(); }, function (e) { btn.disabled = false; App.fail(e); }); }
        else if (r !== false) close();
      };
      mf.appendChild(btn);
    });
    document.body.appendChild(bg);
    var f = bg.querySelector('input,textarea,select'); if (f && opts.focus !== false) setTimeout(function () { f.focus(); }, 50);
    return { el: bg, body: mb, close: close };
  };
  App.confirm = function (msg, danger) {
    return new Promise(function (res) {
      App.modal({ title: 'تأكيد', body: '<p style="margin:0;font-size:15px">' + esc(msg) + '</p>', onClose: function () { res(false); },
        buttons: [{ label: 'إلغاء', ghost: true }, { label: danger ? 'نعم، احذف' : 'تأكيد', danger: danger, onClick: function (close) { res(true); close(); return false; } }] });
    });
  };
  App.prompt = function (title, value, opts) {
    opts = opts || {};
    return new Promise(function (res) {
      var m = App.modal({ title: title, body: '<div class="field">' + (opts.label ? '<label class="f">' + esc(opts.label) + '</label>' : '') + (opts.multiline ? '<textarea class="in" id="pv">' + esc(value || '') + '</textarea>' : '<input class="in" id="pv" value="' + esc(value || '') + '">') + '</div>',
        onClose: function () { res(null); },
        buttons: [{ label: 'إلغاء', ghost: true }, { label: opts.ok || 'حفظ', onClick: function (close) { var v = m.body.querySelector('#pv').value; res(v); close(); return false; } }] });
      m.body.querySelector('#pv').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !opts.multiline) { res(this.value); m.close(); } });
    });
  };

  /* form helpers — markup builders + a binder (data-k = path into an object) */
  App.f = {
    text: function (k, label, o) { o = o || {}; return '<div class="field">' + (label ? '<label class="f">' + label + (o.opt ? ' <small>(اختياري)</small>' : '') + '</label>' : '') + '<input class="in' + (o.mono ? ' mono' : '') + '" data-k="' + k + '"' + (o.type ? ' type="' + o.type + '"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.ltr ? ' dir="ltr"' : '') + (o.min != null ? ' min="' + o.min + '"' : '') + (o.max != null ? ' max="' + o.max + '"' : '') + (o.step ? ' step="' + o.step + '"' : '') + '>' + (o.hint ? '<div class="hint">' + o.hint + '</div>' : '') + '</div>'; },
    num: function (k, label, o) { o = o || {}; o.type = 'number'; o.ltr = true; return App.f.text(k, label, o); },
    area: function (k, label, o) { o = o || {}; return '<div class="field">' + (label ? '<label class="f">' + label + '</label>' : '') + '<textarea class="in' + (o.mono ? ' mono' : '') + '" data-k="' + k + '"' + (o.rows ? ' rows="' + o.rows + '"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + '></textarea>' + (o.hint ? '<div class="hint">' + o.hint + '</div>' : '') + '</div>'; },
    select: function (k, label, opts, o) { o = o || {}; return '<div class="field">' + (label ? '<label class="f">' + label + '</label>' : '') + '<select class="in" data-k="' + k + '">' + opts.map(function (x) { return '<option value="' + esc(x[0]) + '">' + esc(x[1]) + '</option>'; }).join('') + '</select>' + (o.hint ? '<div class="hint">' + o.hint + '</div>' : '') + '</div>'; },
    color: function (k, label, o) { o = o || {}; return '<div class="field">' + (label ? '<label class="f">' + label + '</label>' : '') + '<div class="color"><input type="color" data-kc="' + k + '"><input type="text" data-k="' + k + '" placeholder="' + esc(o.ph || 'تلقائي') + '">' + (o.clear !== false ? '<button type="button" class="clr" data-clr="' + k + '" title="تلقائي">↺</button>' : '') + '</div></div>'; },
    sw: function (k, title, desc) { return '<label class="switch-row"><span><b>' + title + '</b>' + (desc ? '<small>' + desc + '</small>' : '') + '</span><span class="switch"><input type="checkbox" data-k="' + k + '"><span class="tr"></span></span></label>'; },
    swi: function (k, label) { return '<label class="switch"><input type="checkbox" data-k="' + k + '"><span class="tr"></span><span class="lbl">' + label + '</span></label>'; },
    range: function (k, label, min, max, step, unit) { return '<div class="field"><label class="f">' + label + ' <small class="rv" data-rv="' + k + '"></small></label><input type="range" style="width:100%" data-k="' + k + '" min="' + min + '" max="' + max + '" step="' + step + '" data-unit="' + (unit || '') + '"></div>'; }
  };
  App.bind = function (root, obj, onChange) {
    var hex = function (v) { return /^#[0-9a-f]{6}$/i.test(v) ? v : /^#[0-9a-f]{3}$/i.test(v) ? '#' + v.slice(1).split('').map(function (c) { return c + c; }).join('') : '#ffffff'; };
    App.$$('[data-k]', root).forEach(function (el) {
      var k = el.getAttribute('data-k'), v = App.get(obj, k);
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v == null ? '' : Array.isArray(v) ? v.join('\n') : v;
      var rv = root.querySelector('[data-rv="' + k + '"]'); if (rv) rv.textContent = el.value + (el.getAttribute('data-unit') || '');
      var cp = root.querySelector('[data-kc="' + k + '"]'); if (cp) cp.value = hex(el.value);
      var handler = function () {
        var nv = el.type === 'checkbox' ? el.checked : (el.type === 'number' || el.type === 'range') ? (el.value === '' ? '' : Number(el.value)) : el.value;
        if (el.hasAttribute('data-lines')) nv = el.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        App.set(obj, k, nv);
        if (rv) rv.textContent = el.value + (el.getAttribute('data-unit') || '');
        if (cp && el.value) cp.value = hex(el.value);
        onChange && onChange(k, nv);
      };
      el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', handler);
    });
    App.$$('[data-kc]', root).forEach(function (cp) {
      var t = root.querySelector('[data-k="' + cp.getAttribute('data-kc') + '"]');
      cp.addEventListener('input', function () { t.value = cp.value; t.dispatchEvent(new Event('input')); });
    });
    App.$$('[data-clr]', root).forEach(function (b) {
      var t = root.querySelector('[data-k="' + b.getAttribute('data-clr') + '"]');
      b.onclick = function () { t.value = ''; t.dispatchEvent(new Event('input')); };
    });
  };

  /* media picker (list of {url,type,name}) — renders into el, mutates arr */
  App.mediaEditor = function (el, arr, onChange) {
    var icon = { image: '🖼️', video: '🎬', pdf: '📄', youtube: '▶️', link: '🔗' };
    function draw() {
      el.innerHTML = '<div class="media-list">' + arr.map(function (m, i) {
        return '<div class="media-item"><div class="mp">' + (m.type === 'image' ? '<img src="' + esc(m.url) + '">' : icon[m.type] || '🔗') + '</div><span title="' + esc(m.name || m.url) + '">' + esc(m.name || m.url) + '</span><button data-rm="' + i + '">×</button></div>';
      }).join('') + '</div><div class="row wrap" style="margin-top:8px"><button type="button" class="btn sm soft" data-up>⬆️ رفع صورة / فيديو / PDF</button><button type="button" class="btn sm ghost" data-url>🔗 رابط أو يوتيوب</button></div>';
      App.$$('[data-rm]', el).forEach(function (b) { b.onclick = function () { arr.splice(Number(b.getAttribute('data-rm')), 1); draw(); onChange && onChange(); }; });
      el.querySelector('[data-up]').onclick = function () {
        App.pickFile('image/*,video/mp4,video/webm,application/pdf', true).then(function (files) {
          files.reduce(function (p, f) {
            return p.then(function () { App.toast('جارٍ رفع ' + f.name + '…'); return App.upload(f).then(function (r) { arr.push({ url: r.url, type: r.type, name: r.name }); }); });
          }, Promise.resolve()).then(function () { draw(); onChange && onChange(); }, App.fail);
        });
      };
      el.querySelector('[data-url]').onclick = function () {
        App.prompt('إضافة رابط', '', { label: 'رابط https (يوتيوب، صفحة، ملف…)' }).then(function (u) {
          if (!u) return; u = u.trim(); if (!/^https:\/\//i.test(u)) return App.toast('الرابط يجب أن يبدأ بـ https://', 'err');
          var yt = /youtu\.?be/.test(u), ext = (u.split('?')[0].split('.').pop() || '').toLowerCase();
          arr.push({ url: u, type: yt ? 'youtube' : /^(jpg|jpeg|png|webp|gif)$/.test(ext) ? 'image' : /^(mp4|webm)$/.test(ext) ? 'video' : ext === 'pdf' ? 'pdf' : 'link', name: yt ? 'فيديو يوتيوب' : u.replace(/^https:\/\//, '').slice(0, 60) });
          draw(); onChange && onChange();
        });
      };
    }
    draw();
  };
  App.imageField = function (el, getV, setV, opts) {
    opts = opts || {};
    function draw() {
      var v = getV();
      el.innerHTML = '<div class="upl"><div class="thumb">' + (v ? '<img src="' + esc(v) + '">' : '<span class="muted">—</span>') + '</div><div class="col" style="gap:6px"><div class="row"><button type="button" class="btn sm soft" data-u>رفع صورة</button>' + (v ? '<button type="button" class="btn sm ghost" data-c>إزالة</button>' : '') + '</div>' + (opts.hint ? '<span class="tiny muted">' + opts.hint + '</span>' : '') + '</div></div>';
      el.querySelector('[data-u]').onclick = function () {
        App.pickFile('image/*').then(function (f) { if (!f[0]) return; App.upload(f[0]).then(function (r) { setV(r.url); draw(); }, App.fail); });
      };
      var c = el.querySelector('[data-c]'); if (c) c.onclick = function () { setV(''); draw(); };
    }
    draw();
  };

  /* ============================== charts (SVG) ============================== */
  App.chart = {
    bars: function (labels, series, o) { // series: [{name,color,values}] stacked
      o = o || {}; var W = 640, H = o.h || 220, P = { l: 30, r: 8, t: 10, b: 26 }, n = labels.length;
      var tot = labels.map(function (_, i) { return series.reduce(function (s, x) { return s + (x.values[i] || 0); }, 0); });
      var max = Math.max(1, Math.max.apply(null, tot)); var nice = Math.ceil(max / 4) * 4 || 4;
      var bw = (W - P.l - P.r) / n, out = '';
      for (var g = 0; g <= 4; g++) { var y = P.t + (H - P.t - P.b) * (1 - g / 4); out += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y + '" y2="' + y + '" stroke="currentColor" opacity=".08"/><text class="axis" x="' + (P.l - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + Math.round(nice * g / 4) + '</text>'; }
      labels.forEach(function (lb, i) {
        var acc = 0, w = Math.min(bw * 0.64, 46), x = P.l + i * bw + (bw - w) / 2;
        series.forEach(function (s) {
          var v = s.values[i] || 0; if (!v) return; var h = (H - P.t - P.b) * v / nice, y = H - P.b - acc - h; acc += h;
          out += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + Math.min(4, w / 3) + '" fill="' + s.color + '"><title>' + esc(lb) + ' — ' + esc(s.name) + ': ' + v + '</title></rect>';
        });
        var step = Math.ceil(n / 12);
        if (i % step === 0) out += '<text class="axis" x="' + (x + w / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(lb) + '</text>';
      });
      return '<div class="chart"><svg viewBox="0 0 ' + W + ' ' + H + '" style="color:var(--text)">' + out + '</svg>' + (series.length > 1 ? '<div class="legend">' + series.map(function (s) { return '<span><i style="background:' + s.color + '"></i>' + esc(s.name) + '</span>'; }).join('') + '</div>' : '') + '</div>';
    },
    line: function (labels, series, o) {
      o = o || {}; var W = 640, H = o.h || 220, P = { l: 30, r: 10, t: 12, b: 26 }, n = labels.length;
      var max = 1; series.forEach(function (s) { s.values.forEach(function (v) { if (v > max) max = v; }); }); var nice = Math.ceil(max / 4) * 4 || 4;
      var X = function (i) { return P.l + (n <= 1 ? 0 : i * (W - P.l - P.r) / (n - 1)); }, Y = function (v) { return P.t + (H - P.t - P.b) * (1 - v / nice); }, out = '';
      for (var g = 0; g <= 4; g++) { var y = Y(nice * g / 4); out += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y + '" y2="' + y + '" stroke="currentColor" opacity=".08"/><text class="axis" x="' + (P.l - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + Math.round(nice * g / 4) + '</text>'; }
      series.forEach(function (s, si) {
        var pts = s.values.map(function (v, i) { return X(i) + ',' + Y(v || 0); }).join(' ');
        var gid = 'lg' + si + Math.random().toString(36).slice(2, 6);
        if (si === 0) out += '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + s.color + '" stop-opacity=".28"/><stop offset="1" stop-color="' + s.color + '" stop-opacity="0"/></linearGradient></defs><polygon points="' + X(0) + ',' + Y(0) + ' ' + pts + ' ' + X(n - 1) + ',' + Y(0) + '" fill="url(#' + gid + ')"/>';
        out += '<polyline points="' + pts + '" fill="none" stroke="' + s.color + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>';
        if (n <= 31) s.values.forEach(function (v, i) { out += '<circle cx="' + X(i) + '" cy="' + Y(v || 0) + '" r="3" fill="' + s.color + '"><title>' + esc(labels[i]) + ': ' + v + '</title></circle>'; });
      });
      var step = Math.ceil(n / 10);
      labels.forEach(function (lb, i) { if (i % step === 0) out += '<text class="axis" x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(lb) + '</text>'; });
      return '<div class="chart"><svg viewBox="0 0 ' + W + ' ' + H + '" style="color:var(--text)">' + out + '</svg>' + (series.length > 1 ? '<div class="legend">' + series.map(function (s) { return '<span><i style="background:' + s.color + '"></i>' + esc(s.name) + '</span>'; }).join('') + '</div>' : '') + '</div>';
    },
    donut: function (items, o) { // items: [{name,value,color}]
      o = o || {}; var total = items.reduce(function (s, x) { return s + x.value; }, 0), R = 54, C = 2 * Math.PI * R, off = 0, segs = '';
      items.forEach(function (x) { if (!x.value) return; var l = C * x.value / total; segs += '<circle r="' + R + '" cx="70" cy="70" fill="none" stroke="' + x.color + '" stroke-width="20" stroke-dasharray="' + l + ' ' + (C - l) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 70 70)"><title>' + esc(x.name) + ': ' + x.value + '</title></circle>'; off += l; });
      return '<div class="donut-wrap"><svg viewBox="0 0 140 140" width="' + (o.size || 140) + '"><circle r="' + R + '" cx="70" cy="70" fill="none" stroke="var(--soft)" stroke-width="20"/>' + segs +
        '<text x="70" y="68" text-anchor="middle" font-size="24" font-weight="800" fill="currentColor">' + (o.center != null ? o.center : total) + '</text><text x="70" y="88" text-anchor="middle" font-size="11" fill="var(--muted)">' + esc(o.label || 'الإجمالي') + '</text></svg>' +
        '<div class="col" style="gap:6px;font-size:13px">' + items.map(function (x) { return '<div class="row"><i class="dot" style="background:' + x.color + '"></i><span class="grow">' + esc(x.name) + '</span><b>' + x.value + '</b><span class="muted tiny">' + (total ? Math.round(x.value / total * 100) : 0) + '%</span></div>'; }).join('') + '</div></div>';
    },
    hbars: function (items, o) { // [{name,value,color?,sub?}]
      o = o || {}; var max = Math.max.apply(null, items.map(function (x) { return x.value; }).concat([1]));
      return '<div class="hbar">' + items.map(function (x) {
        return '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px" title="' + esc(x.name) + '">' + esc(x.name) + '</span><div class="bar" style="--c:' + (x.color || 'var(--accent)') + '"><i style="width:' + (x.value / max * 100) + '%"></i></div><b>' + (x.label != null ? x.label : x.value) + '</b>';
      }).join('') + '</div>';
    }
  };
  App.COLORS = ['#1a6739', '#bc9525', '#2563eb', '#dc2626', '#7c3aed', '#0891b2', '#ea580c', '#64748b'];

  /* ============================== theme ============================== */
  App.DASH_FONTS = ['Tajawal', 'Cairo', 'IBM Plex Sans Arabic', 'Almarai', 'Noto Kufi Arabic', 'Readex Pro', 'El Messiri', 'Changa', 'Noto Naskh Arabic'];
  App.THEMES = {
    madinah: { name: 'أخضر وذهبي', accent: '#1a6739', accent2: '#bc9525', side: '#123f26', side2: '#0b2617', bg: '#f3f5f1' },
    teal: { name: 'فيروزي', accent: '#0f766e', accent2: '#f59e0b', side: '#134e4a', side2: '#0b302e', bg: '#f1f6f5' },
    navy: { name: 'كحلي', accent: '#1d4ed8', accent2: '#f5b301', side: '#0f1f45', side2: '#091430', bg: '#f2f4f8' },
    maroon: { name: 'عنابي', accent: '#9f1239', accent2: '#c9a227', side: '#4c0519', side2: '#2c030e', bg: '#f8f3f4' },
    sand: { name: 'رملي', accent: '#8a5a21', accent2: '#2f6b4f', side: '#3f2a12', side2: '#28190a', bg: '#f7f3ec' },
    slate: { name: 'رمادي', accent: '#334155', accent2: '#0ea5e9', side: '#1e293b', side2: '#0f172a', bg: '#f3f4f6' }
  };
  App.themeOf = function () {
    var p = (S.me && S.me.prefs && S.me.prefs.theme) || {};
    var base = App.THEMES[p.preset] || App.THEMES.madinah;
    return Object.assign({ mode: 'light', font: 'Tajawal', pattern: 'girih12', pattern_opacity: 0.05 }, base, p);
  };
  App.applyTheme = function (t) {
    t = t || App.themeOf(); var r = document.documentElement.style;
    r.setProperty('--accent', t.accent); r.setProperty('--accent2', t.accent2); r.setProperty('--side', t.side); r.setProperty('--side2', t.side2 || t.side);
    r.setProperty('--font', '"' + t.font + '"');
    document.documentElement.setAttribute('data-mode', t.mode === 'dark' ? 'dark' : 'light');
    if (t.mode !== 'dark') r.setProperty('--bg', t.bg || '#f3f5f1'); else r.removeProperty('--bg');
    var P = window.SCPatterns;
    r.setProperty('--side-pattern', P ? P.css(t.pattern, '#ffffff', 0.09, 1) : 'none');
    r.setProperty('--pattern', P && t.pattern_bg ? P.css(t.pattern, t.accent, t.pattern_opacity || 0.05, 1.2) : 'none');
    r.setProperty('--chat-pattern', P ? P.css(t.pattern, t.accent, 0.05, 1) : 'none');
    var link = document.getElementById('dash-font'), fam = t.font.replace(/ /g, '+');
    var want = 'https://fonts.googleapis.com/css2?family=' + fam + ':wght@400;500;700' + (t.font === 'Tajawal' ? ';800' : '') + '&display=swap';
    if (link && link.href !== want) link.href = want;
  };

  /* ============================== sound & notifications ============================== */
  var actx = null, ringTimer = null;
  function beep(freqs, dur) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var t0 = actx.currentTime;
      freqs.forEach(function (f, i) {
        var o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + i * dur); g.gain.exponentialRampToValueAtTime(0.25, t0 + i * dur + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + (i + 1) * dur);
        o.connect(g); g.connect(actx.destination); o.start(t0 + i * dur); o.stop(t0 + (i + 1) * dur + 0.02);
      });
    } catch (e) { /* audio blocked */ }
  }
  App.prefs = function () { return (S.me && S.me.prefs) || {}; };
  App.notifyOn = function () { return App.prefs().notifications !== false; };
  App.soundOn = function () { return App.prefs().sound !== false && !App.muted; };
  App.ding = function () { if (App.notifyOn() && App.soundOn()) beep([880, 1320], 0.12); };
  App.ringing = function () { return Object.values(S.convs).filter(function (c) { return c.status === 'waiting'; }); };
  App.updateRing = function () {
    var waiting = App.ringing();
    var should = waiting.length && App.notifyOn() && App.soundOn() && S.me && S.me.prefs.available !== false;
    if (should && !ringTimer) { beep([660, 880, 660, 880], 0.16); ringTimer = setInterval(function () { beep([660, 880, 660, 880], 0.16); }, 2600); }
    if (!should && ringTimer) { clearInterval(ringTimer); ringTimer = null; }
    App.emit('ring', waiting);
    App.updateCounts();
  };
  App.desktop = function (title, body, onclick) {
    if (!App.notifyOn() || !('Notification' in window)) return;
    if (Notification.permission === 'granted' && document.hidden) {
      var n = new Notification(title, { body: body, tag: 'sc-' + title, icon: (S.site && S.site.settings.appearance.company_logo) || undefined });
      n.onclick = function () { window.focus(); onclick && onclick(); n.close(); };
    }
  };

  /* ============================== sockets ============================== */
  function connect() {
    if (App.socket) App.socket.disconnect();
    var s = App.socket = io('/agent', { auth: { token: S.token }, transports: ['websocket', 'polling'] });
    s.on('connect', function () { App.emit('socket', true); });
    s.on('disconnect', function () { App.emit('socket', false); });
    s.on('agents:online', function (list) { S.online = list; App.emit('online', list); });
    s.on('conv:update', function (c) {
      var prev = S.convs[c.id];
      if (c.status === 'closed' && (!prev || prev.status === 'closed')) { delete S.convs[c.id]; }
      else S.convs[c.id] = c;
      if (c.status === 'closed') setTimeout(function () { if (S.convs[c.id] && S.convs[c.id].status === 'closed') { delete S.convs[c.id]; App.emit('convs'); } }, 60000);
      App.emit('conv', c); App.emit('convs'); App.updateRing();
    });
    s.on('conv:message', function (m) {
      if (m.sender === 'visitor' && S.convs[m.conversation_id] && S.convs[m.conversation_id].assigned_to === S.me.id) {
        if (App.current !== 'live' || App.activeConv !== m.conversation_id || document.hidden) { App.ding(); App.desktop('رسالة جديدة', m.body || '', function () { location.hash = '#/live/' + m.conversation_id; }); }
      }
      if (m.sender === 'visitor' && App.activeConv !== m.conversation_id) { S.unread[m.conversation_id] = (S.unread[m.conversation_id] || 0) + 1; }
      App.emit('message', m);
    });
    s.on('visitor:typing', function (t) { App.emit('typing', t); });
    s.on('notify', function (n) {
      if (n.type === 'waiting') {
        S.convs[n.conversation.id] = n.conversation; App.emit('convs');
        App.desktop('📞 مستفيد يطلب موظفاً', (n.conversation.visitor_name || 'زائر') + (n.conversation.pending_question ? ': ' + n.conversation.pending_question : ''), function () { location.hash = '#/live/' + n.conversation.id; });
        App.toast('📞 مستفيد ينتظر موظفاً: ' + (n.conversation.visitor_name || 'زائر'));
        App.updateRing();
      } else if (n.type === 'new') { S.convs[n.conversation.id] = n.conversation; App.emit('convs'); }
      else if (n.type === 'transfer' && n.to === S.me.id) { App.ding(); App.toast('↪️ تم تحويل محادثة إليك'); }
      else if (n.type === 'rated') App.emit('rated', n.conversation);
      App.emit('notify', n);
    });
    s.on('ticket:new', function (t) {
      S.counts.tickets = (S.counts.tickets || 0) + 1; App.renderNav();
      App.toast((App.TK_TYPE[t.type] || ['طلب'])[0] + ' جديدة رقم ' + t.number); App.ding();
      App.desktop((App.TK_TYPE[t.type] || ['طلب'])[0] + ' جديدة ' + t.number, t.name + ': ' + t.text, function () { location.hash = '#/tickets/' + t.id; });
      App.emit('ticket', t);
    });
    s.on('ticket:update', function (t) { App.emit('ticket', t); });
    s.on('kb:learned', function (k) { App.emit('learned', k); });
  }
  App.loadActive = function () {
    return App.GET('/api/conversations?status=active&limit=300').then(function (r) {
      S.convs = {}; r.items.forEach(function (c) { S.convs[c.id] = c; }); App.emit('convs'); App.updateRing();
    });
  };
  App.updateCounts = function () {
    S.counts.waiting = App.ringing().length;
    S.counts.mine = Object.values(S.convs).filter(function (c) { return c.status === 'human' && c.assigned_to === S.me.id; }).length;
    App.renderNav();
  };
  App.refreshCounts = function () {
    if (!S.site) return;
    App.GET('/api/stats?days=1&site=' + S.site.id).then(function (st) { S.counts.tickets = st.kpi.tickets_open; S.counts.unanswered = st.kpi.unanswered_open; App.renderNav(); }).catch(function () { });
  };

  /* ============================== router & shell ============================== */
  App.page = function (id, def) { def.id = id; App.pages[id] = def; App.order.push(id); };
  // pages hidden by the admin (Settings → System pages); the settings hub and that page itself always stay
  App.LOCKED_PAGES = ['settings', 'pages', 'account'];
  // pages an edition may hide
  App.EDITION_HIDDEN = [];
  App.isHidden = function (id) { if (App.EDITION_HIDDEN.indexOf(id) >= 0) return true; var h = (S.site && S.site.settings.ui && S.site.settings.ui.hidden_pages) || []; return App.LOCKED_PAGES.indexOf(id) < 0 && h.indexOf(id) >= 0; };
  App.NAV = [
    ['العمل اليومي', ['live', 'history', 'tickets', 'appointments']],
    ['عقل البوت', ['mindmap', 'tree', 'business', 'eligibility', 'org']],
    ['المتابعة', ['stats', 'reports']],
    ['الإعدادات', ['appearance', 'languages', 'install', 'settings', 'users', 'backup']]
  ];
  App.renderNav = function () {
    var nav = App.$('.nav'); if (!nav) return;
    var cnt = { live: S.counts.waiting ? [S.counts.waiting, 'red'] : S.counts.mine ? [S.counts.mine, ''] : null, tickets: S.counts.tickets ? [S.counts.tickets, ''] : null, kb: S.counts.unanswered ? [S.counts.unanswered, ''] : null };
    nav.innerHTML = App.NAV.map(function (sec) {
      var items = sec[1].filter(function (id) { var p = App.pages[id]; return p && (!p.role || App.can(p.role)) && !App.isHidden(id); });
      if (!items.length) return '';
      return '<div class="sec">' + sec[0] + '</div>' + items.map(function (id) {
        var p = App.pages[id], c = cnt[id];
        return '<a href="#/' + id + '" class="' + (App.current === id ? 'on' : '') + '"><i>' + p.icon + '</i><span>' + p.title + '</span>' + (c ? '<span class="cnt ' + c[1] + '">' + c[0] + '</span>' : '') + '</a>';
      }).join('');
    }).join('');
  };
  function shell() {
    var me = S.me, site = S.site, a = site ? site.settings.appearance : {}, org = site ? site.settings.org : {};
    App.$('#app').innerHTML =
      '<div class="shell"><aside class="side"><div class="brand"><div class="logo' + (/\.(png|webp|gif|svg)(\?|$)/i.test(a.company_logo || '') ? ' clear' : '') + '">' + (a.company_logo ? '<img src="' + esc(a.company_logo) + '">' : '💬') + '</div><div style="min-width:0"><b>' + esc(org.name || a.company_name || 'المساعد الذكي') + '</b><small>لوحة تحكم المحادثات</small></div></div>' +
      '<nav class="nav"></nav><div class="me" id="me-link">' + App.avatar(me, 'sm') + '<div class="grow" style="min-width:0"><b style="display:block;font-size:13.5px">' + esc(me.name) + '</b><small style="color:var(--side-muted)">' + esc(me.job_title || App.ROLE[me.role]) + '</small></div><span>⚙️</span></div></aside>' +
      '<main class="main"><div class="top"><button class="btn ghost icon burger" id="burger">☰</button><h1 id="ptitle"></h1><div class="grow"></div>' +
      (S.sites.length > 1 ? '<select class="in" id="site-sel" style="width:auto">' + S.sites.map(function (s) { return '<option value="' + s.id + '"' + (s.id === site.id ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select>' : '') +
      '<label class="switch" title="الحالة: متاح لاستقبال المحادثات"><input type="checkbox" id="avail"><span class="tr"></span><span class="lbl small" id="avail-l"></span></label>' +
      '<button class="btn ghost icon" id="mute" title="كتم/تشغيل صوت الرنين"></button>' +
      '<span class="row small muted" id="conn"><span class="dot off"></span></span></div><div id="ed-banner"></div><div class="content" id="content"></div></main></div>';
    App.renderNav();
    if (App.editionBanner) App.editionBanner(App.$('#ed-banner'));
    App.$('#me-link').onclick = function () { location.hash = '#/account'; };
    App.$('#burger').onclick = function () { App.$('.side').classList.toggle('open'); };
    var sel = App.$('#site-sel'); if (sel) sel.onchange = function () { App.selectSite(Number(sel.value)); };
    var av = App.$('#avail'); av.checked = me.prefs.available !== false;
    var paintAvail = function () { App.$('#avail-l').textContent = av.checked ? 'متاح' : 'غير متاح'; };
    paintAvail();
    av.onchange = function () { me.prefs.available = av.checked; paintAvail(); App.savePrefs(); App.updateRing(); };
    var mute = App.$('#mute'), paintMute = function () { mute.textContent = App.soundOn() ? '🔔' : '🔕'; };
    paintMute(); mute.onclick = function () { App.muted = !App.muted; if (!App.muted && App.prefs().sound === false) { me.prefs.sound = true; App.savePrefs(); } paintMute(); App.updateRing(); };
    App.on('socket', function (on) { var c = App.$('#conn'); if (c) c.innerHTML = '<span class="dot ' + (on ? 'on' : 'off') + '"></span>' + (on ? 'متصل' : 'غير متصل'); });
  }
  App.savePrefs = function () { return App.api('PUT', '/api/me', { prefs: S.me.prefs }).then(function (u) { S.me.prefs = u.prefs; }).catch(App.fail); };
  App.selectSite = function (id) {
    S.site = S.sites.find(function (s) { return s.id === id; }) || S.sites[0];
    try { localStorage.setItem('sc_site', S.site.id); } catch (e) { }
    shell(); route(); App.refreshCounts();
  };
  App.reloadSites = function () {
    return App.GET('/api/sites').then(function (sites) { S.sites = sites; S.site = sites.find(function (s) { return S.site && s.id === S.site.id; }) || sites[0]; return S.site; });
  };
  App.saveSite = function (patch) {
    return App.api('PUT', '/api/sites/' + S.site.id, patch).then(function (s) {
      var i = S.sites.findIndex(function (x) { return x.id === s.id; }); S.sites[i] = s; S.site = s; return s;
    });
  };
  App.dirty = false;
  App.setDirty = function (v) { App.dirty = v; if (!v) App.flushSave = null; var d = App.$('.savebar .dirty'); if (d && !App.flushSave) d.textContent = v ? '● تغييرات غير محفوظة' : ''; };
  window.addEventListener('beforeunload', function (e) { if (App.dirty) { if (App.flushSave) App.flushSave(); e.preventDefault(); e.returnValue = ''; } });

  var cleanup = null;
  function route() {
    if (!S.me) return;
    var h = location.hash.replace(/^#\/?/, '').split('/'), id = h[0] || 'live', p = App.pages[id];
    if (!p || (p.role && !App.can(p.role)) || App.isHidden(id)) {
      id = [].concat.apply([], App.NAV.map(function (x) { return x[1]; })).filter(function (k) { var q = App.pages[k]; return q && (!q.role || App.can(q.role)) && !App.isHidden(k); })[0] || 'account'; p = App.pages[id];
    }
    if (cleanup) { try { cleanup(); } catch (e) { } cleanup = null; }
    App.$$('.modal-bg').forEach(function (m) { m.remove(); });
    App.current = id; App.activeConv = null; App.dirty = false;
    App.renderNav();
    App.$('#ptitle').innerHTML = p.icon + ' ' + p.title + (p.hint ? '<small class="phint">' + p.hint + '</small>' : '');
    var c = App.$('#content'); c.className = 'content' + (p.full ? ' full' : ''); c.innerHTML = '';
    App.$('.side').classList.remove('open');
    try { cleanup = p.render(c, h.slice(1)) || null; } catch (e) { console.error(e); c.innerHTML = '<div class="alert err">' + esc(e.message) + '</div>'; }
    window.scrollTo(0, 0);
  }
  var skipHash = false, lastHash = location.hash;
  window.addEventListener('hashchange', function () {
    if (skipHash) { skipHash = false; return; }
    var samePage = lastHash.split('/')[1] === location.hash.split('/')[1];
    if (App.dirty && !samePage && App.flushSave) { App.flushSave(); App.flushSave = null; App.dirty = false; } // autosave: save what is pending, then leave
    else if (App.dirty && !samePage && !confirm('لديك تغييرات غير محفوظة. هل تريد المغادرة دون حفظ؟')) { skipHash = true; location.hash = lastHash; return; }
    lastHash = location.hash;
    if (samePage && App.pages[App.current] && App.pages[App.current].onSub) return App.pages[App.current].onSub(location.hash.replace(/^#\/?/, '').split('/').slice(1));
    route();
  });
  App.route = route;

  /* ============================== auth ============================== */
  function loginView() {
    App.applyTheme(App.themeOf());
    App.$('#app').innerHTML = '<div class="login"><div class="art"><div style="font-size:54px;margin-bottom:14px">💬</div><h1>المساعد الذكي لخدمة العملاء</h1><p>ردود آلية ذكية بلغات متعددة، تحويل فوري لموظفيك، شكاوى واقتراحات مرقّمة، وتقارير احترافية — كل ذلك من لوحة تحكم واحدة.</p></div>' +
      '<div class="frm"><form class="box card" id="lf"><h2 style="margin-bottom:6px">تسجيل الدخول</h2><p class="muted small" style="margin:0 0 18px">أدخل بيانات حسابك للمتابعة</p>' +
      '<div class="field"><label class="f">البريد الإلكتروني</label><input class="in" name="email" type="email" dir="ltr" required autocomplete="username"></div>' +
      '<div class="field"><label class="f">كلمة المرور</label><input class="in" name="password" type="password" dir="ltr" required autocomplete="current-password"></div>' +
      '<div class="alert err hidden" id="lerr"></div><button class="btn" style="width:100%;margin-top:8px;padding:11px">دخول</button></form></div></div>';
    App.$('#lf').onsubmit = function (e) {
      e.preventDefault(); var f = e.target;
      App.api('POST', '/api/auth/login', { email: f.email.value, password: f.password.value }).then(function (r) {
        S.token = r.token; try { localStorage.setItem('sc_token', r.token); } catch (x) { } start();
      }).catch(function (err) { var el = App.$('#lerr'); el.textContent = err.message; el.classList.remove('hidden'); });
    };
  }
  App.logout = function () {
    try { localStorage.removeItem('sc_token'); } catch (e) { }
    S.token = null; S.me = null; if (App.socket) App.socket.disconnect(); App.muted = true; App.updateRing && (function () { })();
    loginView();
  };
  function start() {
    App.GET('/api/me').then(function (me) {
      S.me = me; me.prefs = me.prefs || {}; App.muted = false; App.applyTheme();
      return Promise.all([App.GET('/api/sites'), App.GET('/api/users'), App.GET('/api/i18n'), App.GET('/api/edition').catch(function () { return { name: 'smartchat' }; })]);
    }).then(function (r) {
      S.sites = r[0]; S.users = r[1]; S.i18n = r[2]; S.edition = r[3] || { name: 'smartchat' };
      return App.editionSetup ? App.editionSetup().then(function () { return r; }) : r;
    }).then(function () {
      var saved; try { saved = Number(localStorage.getItem('sc_site')); } catch (e) { }
      S.site = S.sites.find(function (s) { return s.id === saved; }) || S.sites[0];
      shell(); connect(); route(); App.loadActive(); App.refreshCounts();
      if ('Notification' in window && Notification.permission === 'default' && App.notifyOn()) Notification.requestPermission();
      if (S.me.weak_password) setTimeout(function () { App.toast('⚠️ كلمة المرور الحالية ضعيفة/افتراضية — غيّرها من "حسابي"', 'err'); }, 800);
      setInterval(App.refreshCounts, 60000);
    }).catch(function (e) { console.error(e); loginView(); });
  }
  App.boot = function () {
    try { S.token = localStorage.getItem('sc_token'); } catch (e) { }
    if (S.token) start(); else loginView();
    document.addEventListener('click', function () { if (actx && actx.state === 'suspended') actx.resume(); }, { capture: true });
  };
})();
